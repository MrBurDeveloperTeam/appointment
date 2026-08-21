import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, ChevronLeft, X } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { getPetOption, normalizePetId } from '../VirtualPet/petOptions';
import {
  markDialogueDismissed,
  buildDialogueDismissalKey,
} from '../aiExperience/petDialogue/sessionDedupe';
import { selectFirstEligibleDialogueCandidate } from '../aiExperience/petDialogue/selectDialogueCandidate';

const MALLOW_FRAME_WIDTH = 192;
const MALLOW_FRAME_HEIGHT = 208;
const MALLOW_SCALE = 0.42;
const PET_SLEEPING_KEY = 'pet_is_sleeping';
const PET_SLEEPING_UPDATED_AT_KEY = 'pet_is_sleeping_updated_at';
const DEFAULT_WELCOME_BACK_AUTO_CLOSE_MS = 6000;
const MALLOW_ROWS = {
  idle: { row: 0, frames: 6, duration: '1.1s' },
  runRight: { row: 1, frames: 8, duration: '0.7s' },
  runLeft: { row: 2, frames: 8, duration: '0.7s' },
  wave: { row: 3, frames: 4, duration: '0.8s' },
  review: { row: 3, frames: 4, duration: '0.8s' },
  sleep: { row: 5, frames: 1, duration: '1s', frame: 4 },
};

function MallowMascotSprite({
  spriteSheetUrl,
  sleepHoldFrame,
  idleFrames,
  idleDuration,
  hoverRow,
  hoverFrames,
  hoverDuration,
  clickRow,
  clickFrames,
  clickDuration,
  isWalking,
  facingLeft,
  isMeowing,
  isHovered,
  isSleeping,
  onHoverStart,
  onHoverEnd,
}) {
  const shouldSleep = isSleeping && !isWalking && !isMeowing;
  const shouldReview = isHovered && !isWalking && !shouldSleep;
  const stateClass = shouldSleep ? 'sleep' : shouldReview ? 'review' : isWalking ? (facingLeft ? 'run-left' : 'run-right') : 'idle';
  const reviewConfig = {
    row: hoverRow ?? MALLOW_ROWS.review.row,
    frames: hoverFrames ?? MALLOW_ROWS.review.frames,
    duration: hoverDuration ?? MALLOW_ROWS.review.duration,
  };
  const clickConfig = {
    row: clickRow ?? MALLOW_ROWS.wave.row,
    frames: clickFrames ?? MALLOW_ROWS.wave.frames,
    duration: clickDuration ?? MALLOW_ROWS.wave.duration,
  };
  const idleConfig = {
    ...MALLOW_ROWS.idle,
    frames: idleFrames ?? MALLOW_ROWS.idle.frames,
    duration: idleDuration ?? MALLOW_ROWS.idle.duration,
  };
  const config = shouldSleep
    ? { ...MALLOW_ROWS.sleep, frame: sleepHoldFrame ?? MALLOW_ROWS.sleep.frame }
    : shouldReview
      ? reviewConfig
      : isMeowing && !isWalking
        ? clickConfig
        : facingLeft && isWalking
          ? MALLOW_ROWS.runLeft
          : isWalking
            ? MALLOW_ROWS.runRight
            : idleConfig;

  return (
    <div
      className={`mallow-mascot ${stateClass} frames-${config.frames} ${isMeowing ? 'is-talking' : ''}`}
      aria-label={`Mallow pet ${stateClass}`}
      onPointerEnter={onHoverStart}
      onMouseEnter={onHoverStart}
      onMouseOver={onHoverStart}
      onPointerLeave={onHoverEnd}
      onMouseLeave={onHoverEnd}
      style={{
        '--sprite-row': config.row,
        '--sprite-frames': config.frames,
        '--sprite-duration': config.duration,
        '--sprite-frame': config.frame ?? 0,
        '--pet-spritesheet': `url("${spriteSheetUrl}")`,
      }}
    />
  );
}

export default function CatMascot({ onCatClick, disabled = false, personalizedInsightState = null }) {
  const [catPos, setCatPos] = useState({ x: -10, y: 85 });
  const [isWalking, setIsWalking] = useState(false);
  const [facingLeft, setFacingLeft] = useState(false);
  const [isMeowing, setIsMeowing] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isPetSleeping, setIsPetSleeping] = useState(() => {
    try { return localStorage.getItem(PET_SLEEPING_KEY) === 'true'; } catch { return false; }
  });
  const [selectedPetId, setSelectedPetId] = useState(() => normalizePetId(localStorage.getItem('pet_name')));
  const [walkDuration, setWalkDuration] = useState(0.8);
  const selectedPet = getPetOption(selectedPetId);

  const [dialogStep, setDialogStep] = useState(0);
  const [isDialogActive, setIsDialogActive] = useState(false);
  const [currentUserId, setCurrentUserId] = useState(null);
  const autoCloseTimerRef = useRef(null);
  const isEntryWalkComplete = useRef(false);
  // Which dialog type is currently prepared to show ('intro' | 'welcomeBack' |
  // 'personalized' | null), and which dialog types have already been dismissed
  // during this page lifecycle. Tracking dismissal per-type (rather than one
  // shared flag) means dismissing the Post-Login Intro no longer permanently
  // blocks the Welcome Back dialog, or vice versa. 'personalized' is the
  // Phase-2 proactive reminder — same single-slot machinery as the other two.
  const currentDialogType = useRef(null);
  const dismissedDialogs = useRef(new Set());
  // In-memory, mount-scoped ONLY — never persisted (sessionStorage
  // survives a same-tab reload, which was the bug this replaces: a
  // candidate merely SHOWN, never explicitly Closed/CTA'd, must reappear
  // on the next reload, not be silently suppressed forever). Purpose is
  // otherwise unchanged from the old sessionStorage "seen" mark: prevent
  // the SAME candidate from repeatedly reopening within this one
  // activation. Resets to empty on every fresh mount, which a full page
  // reload always is. Explicit dismissal (Close/CTA) remains in
  // localStorage via markDialogueDismissed/isDialogueDismissed — that
  // persistence is unaffected and still correctly survives reload.
  const shownCandidateKeysRef = useRef(new Set());
  // The already-resolved Phase-2 candidate (from App.jsx via the
  // personalizedInsightState prop — a direct prop, not Context, since
  // CatMascot is a direct child of the component that resolves the
  // candidate here, not reached through a separate layout/Home file) while
  // it's the active dialogue — mirrored into React state (below) for
  // render-time reads, following the same ref+state split already used for
  // isDialogActive.
  const activeCandidateRef = useRef(null);
  const [activeCandidate, setActiveCandidate] = useState(null);
  // The onAction for the candidate actually adopted, captured at the
  // moment of adoption (not re-read from the live prop at CTA-click time)
  // — the dialogue persists once shown regardless of later prop changes,
  // so the action it runs must stay the one that was valid when it was
  // shown, even if personalizedInsightState has since gone back to
  // null/not_ready.
  const activeOnActionRef = useRef(null);
  // Synchronous snapshot of the personalizedInsightState prop's current
  // value — props ARE already synchronously current inside effects/
  // handlers (unlike the Context-based apps' bridgeEntryRef, which existed
  // to work around a stale-closure problem specific to Context), but this
  // ref is kept anyway for exact structural parity with the other three
  // apps' arbitrateReturningUser, and so initDialog()'s one-shot async
  // closure (captured at effect-creation time) can read the LATEST prop
  // value rather than whatever it was when that effect was created. Three-
  // way: null (no candidate published — off-view/pre-mount, or disabled) |
  // {status:'not_ready'} (App.jsx's appointmentDataStatus/coverage not yet
  // satisfied) | {status:'ready', candidate, onAction} (resolution
  // concluded).
  const personalizedInsightStateRef = useRef(personalizedInsightState);
  useEffect(() => {
    personalizedInsightStateRef.current = personalizedInsightState;
  }, [personalizedInsightState]);
  // App.jsx's fetched session metadata, cached here so the REACTIVE
  // arbitration effect (which runs independently of initDialog, whenever
  // the personalizedInsightState prop changes) can reuse it for Welcome
  // Back's [name] placeholder without a second supabase.auth.getSession()
  // call.
  const userMetaRef = useRef(null);
  const userEmailRef = useRef(null);
  // Guards against arbitrateReturningUser being entered twice concurrently
  // — set as soon as a path is actually committed to, never reset for the
  // lifetime of this mount.
  const arbitrationStartedRef = useRef(false);
  // Holds the auto-close duration for a prepared 'welcomeBack' dialog, set when
  // its content is fetched but only ever consumed by tryActivateDialog() at the
  // moment it actually shows — see the comment on tryActivateDialog for why.
  const welcomeBackAutoCloseMsRef = useRef(DEFAULT_WELCOME_BACK_AUTO_CLOSE_MS);
  // Mirrors isDialogActive synchronously (React state updates aren't immediate).
  // Without this, tryActivateDialog() can be called again while a dialog is
  // already showing (e.g. StrictMode's dev double-invoke of the fetch effect,
  // or the click-to-move handler firing again) and would re-arm the Welcome
  // Back timer from scratch every time, so it could keep getting reset before
  // ever completing a full countdown.
  const isDialogActiveRef = useRef(false);

  const clearWelcomeBackAutoCloseTimer = () => {
    if (autoCloseTimerRef.current !== null) {
      clearTimeout(autoCloseTimerRef.current);
      autoCloseTimerRef.current = null;
    }
  };

  const startWelcomeBackAutoCloseTimer = () => {
    clearWelcomeBackAutoCloseTimer();

    const configuredDuration = Number(welcomeBackAutoCloseMsRef.current);
    const duration = Number.isFinite(configuredDuration) && configuredDuration > 0
      ? configuredDuration
      : DEFAULT_WELCOME_BACK_AUTO_CLOSE_MS;

    autoCloseTimerRef.current = setTimeout(() => {
      autoCloseTimerRef.current = null;
      closeDialog();
    }, duration);
  };

  // Marks the Post-Login Intro stage complete for a given user — either because
  // they actually dismissed a visible Intro, or because a successful query
  // confirmed there's no Intro configured/usable to show. Takes an explicit
  // userId (rather than reading currentUserId state) so it's safe to call from
  // inside initDialog() itself, where the just-fetched userId may not yet be
  // reflected in currentUserId (state updates aren't synchronous).
  const markIntroCompleted = (uid) => {
    if (!uid) return;
    localStorage.setItem(`intro_shown_${uid}`, 'true');
  };

  // persistDismissal defaults to true (Close button, CTA button, and
  // Cat-click-while-open all count as this tab actually finishing with the
  // dialogue, so they write the cross-tab localStorage dismissal for a
  // 'personalized' dialogue). The one caller that must NOT write again is
  // the cross-tab `storage` event listener below — the dismissal key is
  // already present in shared localStorage (that's what triggered the
  // event), so re-writing it here would be a pointless redundant write;
  // persistDismissal: false keeps that handler a pure local-UI suppression.
  const closeDialog = (options) => {
    const persistDismissal = options?.persistDismissal ?? true;
    const dialogType = currentDialogType.current;
    if (dialogType) {
      dismissedDialogs.current.add(dialogType);
    }
    if (persistDismissal && dialogType === 'personalized') {
      const candidate = activeCandidateRef.current;
      if (candidate && currentUserId) {
        markDialogueDismissed(currentUserId, candidate.dedupeKey);
      }
    }
    isDialogActiveRef.current = false;
    setIsDialogActive(false);
    if (dialogType === 'personalized') {
      activeCandidateRef.current = null;
      activeOnActionRef.current = null;
      setActiveCandidate(null);
    }
    clearWelcomeBackAutoCloseTimer();
    if (dialogType === 'intro' && !disabled && currentUserId) {
      markIntroCompleted(currentUserId);
    }
  };

  // Single source of truth for showing a prepared dialog: only activates once the
  // entry walk has finished AND a dialog type has been prepared AND that specific
  // type hasn't already been dismissed this page lifecycle. Idempotent via
  // isDialogActiveRef — once active, further calls (StrictMode's dev double-invoke
  // of the fetch effect, click-to-move, etc.) are no-ops instead of re-arming the
  // Welcome Back timer from scratch every time.
  const tryActivateDialog = () => {
    const dialogType = currentDialogType.current;
    if (
      !isEntryWalkComplete.current ||
      !dialogType ||
      dismissedDialogs.current.has(dialogType) ||
      isDialogActiveRef.current
    ) {
      return;
    }

    isDialogActiveRef.current = true;
    setIsDialogActive(true);

    if (dialogType === 'welcomeBack') {
      startWelcomeBackAutoCloseTimer();
    } else if (dialogType === 'personalized') {
      // Show-time mark: in-memory, THIS MOUNT ONLY (see
      // shownCandidateKeysRef's own doc — never sessionStorage). Merely
      // displaying the candidate must never suppress it in another tab,
      // nor survive a reload — only an explicit Close or CTA does either
      // (see closeDialog above, which persists to localStorage).
      const candidate = activeCandidateRef.current;
      if (candidate) {
        shownCandidateKeysRef.current.add(candidate.dedupeKey);
      }
    }
  };

  // Existing Welcome Back fetch/activation, unchanged in content — extracted
  // to a standalone function so BOTH initDialog() (the normal first pass)
  // and the reactive arbitration effect below (the off-view/no-candidate
  // fallback path) can call it without duplicating the fetch logic. Reads
  // userMeta/userEmail from the refs initDialog() populates, rather than
  // re-fetching the session, so this adds no new Supabase call in either
  // call path.
  const activateWelcomeBack = async (uid) => {
    const userMeta = userMetaRef.current;
    const userEmail = userEmailRef.current;
    try {
      const { data: config, error } = await supabase
        .from('aiboard_simulator_configs')
        .select('welcome_back_text, welcome_back_auto_close_ms')
        .eq('module_name', 'Appointment')
        .limit(1)
        .maybeSingle();

      let welcomeText = !error ? config?.welcome_back_text : null;
      const autoCloseMs = (!error && config?.welcome_back_auto_close_ms) || 6000;

      if (welcomeText && /\[name\]/i.test(welcomeText)) {
        let displayName = null;
        try {
          const { data: profile } = await supabase
            .from('profiles')
            .select('name, full_name')
            .eq('user_id', uid)
            .maybeSingle();
          displayName = profile?.name || profile?.full_name || null;
        } catch (err) {
          console.error("Error fetching profile for welcome back name:", err);
        }
        if (!displayName) displayName = userMeta?.name || null;
        if (!displayName && userEmail) displayName = userEmail.split('@')[0];
        // Never show a raw email address, even if it came from profiles.name/full_name.
        if (displayName && displayName.includes('@')) displayName = displayName.split('@')[0];

        welcomeText = displayName
          ? welcomeText.replace(/\[name\]/gi, displayName)
          : welcomeText
              .replace(/,\s*\[name\]/gi, '')
              .replace(/\[name\],\s*/gi, '')
              .replace(/\[name\]/gi, '')
              .replace(/\s{2,}/g, ' ')
              .trim();
      }

      if (welcomeText) {
        setDialogSteps([welcomeText]);
        setDialogStep(0);
        currentDialogType.current = 'welcomeBack';
        welcomeBackAutoCloseMsRef.current = autoCloseMs;
        tryActivateDialog();
      }
    } catch (err) {
      console.error("Error fetching welcome back message:", err);
    }
  };

  // Deterministic returning-user arbitration.
  // Reads the personalizedInsightState prop's explicit three-way value
  // (never treats a bare `null`/`not_ready` candidate as proof of
  // readiness) and only ever decides once per activation, regardless of
  // data-fetch speed:
  //
  //   state === null             -> no candidate published (off-view /
  //                                  not yet mounted / disabled) — don't
  //                                  wait, proceed to Welcome Back now.
  //   state.status === 'not_ready' -> App.jsx's appointmentDataStatus is
  //                                  still 'loading'/'error', or today
  //                                  isn't covered by loadedAppointmentRange
  //                                  yet — leave the decision unresolved;
  //                                  this function will be called again by
  //                                  the reactive effect below once the
  //                                  prop changes.
  //   state.status === 'ready'   -> appointment data has genuinely
  //                                  resolved and covers today:
  //     candidate exists & eligible (not seen/dismissed) -> Personalized.
  //     candidate is null, OR exists but already seen/dismissed
  //                                -> existing Welcome Back, unchanged.
  //
  // Called both synchronously from initDialog()'s "already shown intro"
  // branch (using whatever's on the prop at that exact moment) and
  // reactively whenever the prop value changes. Takes an explicit `uid`
  // for the same reason markIntroCompleted does: initDialog()'s
  // just-fetched userId is not yet reflected in `currentUserId` state at
  // that call site.
  const arbitrateReturningUser = async (uid) => {
    if (disabled || !uid) return;
    if (currentDialogType.current) return;
    if (arbitrationStartedRef.current) return;
    if (localStorage.getItem(`intro_shown_${uid}`) !== 'true') return;

    const state = personalizedInsightStateRef.current;

    if (state === null || state === undefined) {
      arbitrationStartedRef.current = true;
      await activateWelcomeBack(uid);
      return;
    }

    if (state.status === 'not_ready') {
      // Genuinely unresolved — do nothing yet. Not a decision, so
      // arbitrationStartedRef stays false and this may be called again.
      return;
    }

    // status === 'ready'
    //
    // Dismissal-aware pool scan (starvation fix): state.candidates is the
    // ordered pool across Appointment Soon > Daily Summary > None Today
    // (see App.jsx / buildAppointmentDialoguePool.ts), in the exact same
    // family-priority order the pure business resolver already uses.
    // Scanning it here for the first not-shown-this-mount/not-dismissed
    // entry means dismissing e.g. Soon appointment A reveals a still-
    // eligible Soon appointment B on a later activation, instead of
    // incorrectly falling straight to Welcome Back just because A itself
    // was already suppressed. "Shown this mount" comes from
    // shownCandidateKeysRef (in-memory, resets on reload); "dismissed"
    // comes from isDialogueDismissed (localStorage, survives reload) —
    // see selectDialogueCandidate.ts's own doc. Falls back to the legacy
    // single `state.candidate` when `candidates` isn't present, for
    // defensive compatibility only.
    const pool = Array.isArray(state.candidates) ? state.candidates : (state.candidate ? [state.candidate] : []);
    const candidate = selectFirstEligibleDialogueCandidate(uid, pool, shownCandidateKeysRef.current);
    if (candidate?.dedupeKey) {
      arbitrationStartedRef.current = true;
      activeCandidateRef.current = candidate;
      activeOnActionRef.current = state.onAction;
      setActiveCandidate(candidate);
      currentDialogType.current = 'personalized';
      tryActivateDialog();
      return;
    }

    arbitrationStartedRef.current = true;
    await activateWelcomeBack(uid);
  };

  // Reactive fallback: re-attempts arbitration whenever the
  // personalizedInsightState prop changes (App.jsx's appointment data
  // status/coverage settling). No-ops immediately via the
  // currentDialogType.current/arbitrationStartedRef guards above once
  // anything has already been decided this activation cycle. Safe to read
  // `currentUserId` state here (unlike the initDialog call site above)
  // since this effect re-runs once state actually updates.
  useEffect(() => {
    void arbitrateReturningUser(currentUserId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personalizedInsightState, currentUserId, disabled]);

  // Cross-tab dismissal sync: if the SAME candidate (same userId +
  // dedupeKey) is dismissed (Close or CTA) in another same-origin
  // Appointments tab, that tab's write to localStorage fires the native
  // `storage` event here — but only in THIS tab, never in the tab that
  // performed the write, so reusing closeDialog() (which itself re-writes
  // the identical key/value) cannot loop; passing persistDismissal: false
  // makes this a pure local-UI suppression regardless.
  useEffect(() => {
    if (disabled) return;

    const handlePersonalizedStorage = (event) => {
      if (!event.key || event.newValue === null) return;
      if (currentDialogType.current !== 'personalized') return;
      if (!isDialogActiveRef.current) return;

      const candidate = activeCandidateRef.current;
      if (!candidate || !currentUserId) return;

      const expectedKey = buildDialogueDismissalKey(currentUserId, candidate.dedupeKey);
      if (event.key === expectedKey) {
        closeDialog({ persistDismissal: false });
      }
    };

    window.addEventListener('storage', handlePersonalizedStorage);
    return () => window.removeEventListener('storage', handlePersonalizedStorage);
  }, [disabled, currentUserId]);

  const [dialogSteps, setDialogSteps] = useState([]);

  const [meowMsg, setMeowMsg] = useState(null);
  const [petStates, setPetStates] = useState(['Normal']);
  const meowTimerRef = useRef(null);

  // Clear message bubble immediately when state changes
  useEffect(() => {
    setMeowMsg(null);
  }, [petStates]);

  const petStatesRef = useRef(['Normal']);

  useEffect(() => {
    if (disabled) return;

    const computeStates = (stats, prevStates) => {
      const HUNGRY_ENTER = 30, HUNGRY_EXIT = 35;
      const DIRTY_ENTER = 30, DIRTY_EXIT = 35;
      const ENERGY_ENTER = 30, ENERGY_EXIT = 35;
      const HAPPY_ENTER = 40, HAPPY_EXIT = 45;

      const active = [];
      if (stats.hunger < HUNGRY_ENTER || (prevStates.includes('Hungry') && stats.hunger < HUNGRY_EXIT)) active.push('Hungry');
      if (stats.hygiene < DIRTY_ENTER || (prevStates.includes('Dirty') && stats.hygiene < DIRTY_EXIT)) active.push('Dirty');
      if (stats.energy < ENERGY_ENTER || (prevStates.includes('Low Energy') && stats.energy < ENERGY_EXIT)) active.push('Low Energy');
      if (stats.happiness < HAPPY_ENTER || (prevStates.includes('Unhappy') && stats.happiness < HAPPY_EXIT)) active.push('Unhappy');

      if (active.length === 0) active.push('Normal');
      return active;
    };

    const updateStateFromStats = (stats, updatedAt) => {
      if (!stats) return;

      let finalStats = { ...stats };

      // Apply offline decay based on updated_at
      if (updatedAt) {
        const elapsedSecs = Math.max(0, (Date.now() - new Date(updatedAt).getTime()) / 1000);
        if (elapsedSecs > 0) {
          finalStats.hunger = Math.max(0, (stats.hunger || 0) - 0.01 * elapsedSecs);
          finalStats.energy = Math.max(0, (stats.energy || 0) - 0.005 * elapsedSecs);
          finalStats.hygiene = Math.max(0, (stats.hygiene || 0) - 0.004 * elapsedSecs);
          finalStats.happiness = Math.max(0, (stats.happiness || 0) - 0.006 * elapsedSecs);
        }
      }

      const newStates = computeStates(finalStats, petStatesRef.current);
      const isDifferent = newStates.length !== petStatesRef.current.length || !newStates.every((v, i) => v === petStatesRef.current[i]);

      if (isDifferent) {
        console.log('[CatMascot] States: ' + petStatesRef.current.join(', ') + ' -> ' + newStates.join(', '));
        petStatesRef.current = newStates;
        setPetStates(newStates);
      }
    };

    // 1. Initial check from localStorage (with 5-min freshness check)
    const saved = localStorage.getItem('pet_stats');
    const lastSavedAt = localStorage.getItem('pet_last_saved_at');
    const isFresh = lastSavedAt && (Date.now() - new Date(lastSavedAt).getTime() < 300000);
    if (saved && isFresh) {
      try { updateStateFromStats(JSON.parse(saved), lastSavedAt); } catch (e) { /* ignore */ }
    }

    const readLocalSleepState = () => {
      const savedSleeping = localStorage.getItem(PET_SLEEPING_KEY);
      if (savedSleeping !== null) {
        setIsPetSleeping(savedSleeping === 'true');
      }
    };

    readLocalSleepState();
    setSelectedPetId(normalizePetId(localStorage.getItem('pet_name')));

    const handlePetSleepChange = (event) => {
      setIsPetSleeping(!!event.detail);
    };

    const handlePetSelectionChange = (event) => {
      setSelectedPetId(normalizePetId(event.detail));
    };

    const handleStorage = (event) => {
      if (event.key === PET_SLEEPING_KEY) {
        setIsPetSleeping(event.newValue === 'true');
      }
      if (event.key === 'pet_name') {
        setSelectedPetId(normalizePetId(event.newValue));
      }
    };

    window.addEventListener('virtual-pet-sleep-change', handlePetSleepChange);
    window.addEventListener('virtual-pet-selection-change', handlePetSelectionChange);
    window.addEventListener('storage', handleStorage);

    // 2. Fetch from Supabase for latest data
    const fetchStats = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) return;

        const { data, error } = await supabase
          .from('inventory_pet')
          .select('hunger, hygiene, energy, happiness, is_sleeping, pet_name, updated_at')
          .eq('user_id', session.user.id)
          .maybeSingle();

          if (data && !error) {
          const nextSleeping = !!data.is_sleeping;
          setIsPetSleeping(nextSleeping);
          localStorage.setItem(PET_SLEEPING_KEY, String(nextSleeping));
          localStorage.setItem(PET_SLEEPING_UPDATED_AT_KEY, data.updated_at || new Date().toISOString());
          setSelectedPetId(normalizePetId(data.pet_name));
          updateStateFromStats(data, data.updated_at);
        }
      } catch (err) {
        console.error('Error fetching pet stats:', err);
      }
    };

    fetchStats();
    const interval = setInterval(fetchStats, 120000);
    // Staggered retries: SSO exchange can take 0.5–4s; the first successful call wins
    const r1 = setTimeout(fetchStats, 500);
    const r2 = setTimeout(fetchStats, 2000);
    const r3 = setTimeout(fetchStats, 5000);
    return () => {
      clearInterval(interval);
      clearTimeout(r1); clearTimeout(r2); clearTimeout(r3);
      window.removeEventListener('virtual-pet-sleep-change', handlePetSleepChange);
      window.removeEventListener('virtual-pet-selection-change', handlePetSelectionChange);
      window.removeEventListener('storage', handleStorage);
    };
  }, [disabled]);

  useEffect(() => {
    const initDialog = async () => {
      let userId = null;
      let userMeta = null;
      let userEmail = null;
      try {
        const { data: { session } } = await supabase.auth.getSession();
        userId = session?.user?.id || null;
        userMeta = session?.user?.user_metadata || null;
        userEmail = session?.user?.email || null;
        userMetaRef.current = userMeta;
        userEmailRef.current = userEmail;
        setCurrentUserId(userId);
      } catch (err) {
        console.error("Error fetching session in initDialog:", err);
      }

      // If user is logged in (disabled = false) and has seen the intro:
      // returning-user cycle. Deterministic arbitration (Personalized vs
      // Welcome Back) lives entirely in arbitrateReturningUser now — it
      // reads personalizedInsightState's explicit readiness rather than
      // racing on whichever of App.jsx's appointment data or this Welcome
      // Back fetch happens to resolve first. If the state is still
      // 'not_ready' at this exact moment, arbitrateReturningUser
      // deliberately does nothing and defers to the reactive effect above.
      if (!disabled && userId && localStorage.getItem(`intro_shown_${userId}`) === 'true') {
        await arbitrateReturningUser(userId);
        return;
      }

      try {
        const { data: configs, error: configsError } = await supabase
          .from('aiboard_simulator_configs')
          .select('id')
          .eq('module_name', 'Appointment')
          .limit(1);

        if (configsError) {
          // Infrastructure/query failure — do not mark the intro stage
          // complete; preserve the ability to retry on the next login/reload.
          return;
        }

        if (!configs || configs.length === 0) {
          // Query succeeded and confirmed no simulator config exists at all
          // for this module — there is no Intro to ever show. Mark the stage
          // complete so future post-login visits proceed to Welcome Back
          // instead of retrying the missing Intro forever.
          if (!disabled) markIntroCompleted(userId);
          return;
        }

        const configId = configs[0].id;

        const { data, error } = await supabase
          .from('aiboard_simulator_dialog_steps')
          .select('step_text, sort_order')
          .eq('config_id', configId)
          .eq('is_post_login', !disabled)
          .order('sort_order', { ascending: true });

        if (error) {
          // Infrastructure/query failure — do not mark the intro stage complete.
          return;
        }

        const steps = (data || [])
          .map(d => d.step_text)
          .filter(text => typeof text === 'string' && text.trim().length > 0);

        if (steps.length > 0) {
          setDialogSteps(steps);
          setDialogStep(0);
          currentDialogType.current = 'intro';
          tryActivateDialog();
          return;
        }

        // Query succeeded but returned no usable intro content (zero rows, or
        // every row was empty/whitespace-only) — there is nothing to show.
        // Mark the stage complete so this doesn't retry forever on every login.
        if (!disabled) markIntroCompleted(userId);
      } catch (err) {
        console.error("Error fetching dialog steps:", err);
        // Do not mark the intro stage complete on an unexpected/network
        // failure — preserve the ability to retry on the next login or reload.
      }
    };

    initDialog();
  }, [disabled]);

  useEffect(() => {
    if (disabled || isDialogActive) return;

    let isSubscribed = true;

    const runMeowLoop = async () => {
      try {
        const { data: configs } = await supabase.from('aiboard_meow_configs').select('id').limit(1);
        if (!configs || configs.length === 0) return;
        const configId = configs[0].id;

        const primaryState = petStates[0] || 'Normal';

        const { data: timingData, error: timingError } = await supabase
          .from('aiboard_meow_timing')
          .select('message_duration_minutes, message_interval_minutes, disabled')
          .eq('config_id', configId)
          .eq('state', primaryState)
          .order('updated_at', { ascending: false })
          .limit(1);

        let activeTiming = timingData?.[0];

        if (timingError || !activeTiming || activeTiming.disabled) {
          if (primaryState !== 'Normal') {
            console.log(`[CatMascot] No active timing for "${primaryState}" (Error: ${timingError?.message}), falling back to "Normal"`);
          }
          const { data: normalTiming, error: nError } = await supabase
            .from('aiboard_meow_timing')
            .select('message_duration_minutes, message_interval_minutes, disabled')
            .eq('config_id', configId)
            .eq('state', 'Normal')
            .order('updated_at', { ascending: false })
            .limit(1);

          if (normalTiming?.[0] && !normalTiming[0].disabled) {
            activeTiming = normalTiming[0];
          } else {
            console.warn("[CatMascot] No active or Normal timing found. Meow loop aborted.", nError);
            return;
          }
        }

        // Fetch messages for ALL active states
        const { data: msgsData, error: msgsError } = await supabase
          .from('aiboard_meow_messages')
          .select('message, state, sort_order')
          .eq('config_id', configId)
          .in('state', petStates)
          .eq('is_audio', false)
          .order('state', { ascending: true })
          .order('sort_order', { ascending: true });

        if (msgsError) {
          console.error(`[CatMascot] Error fetching messages for states [${petStates.join(', ')}]:`, msgsError);
          return;
        }

        if (!msgsData || msgsData.length === 0) {
          console.log(`[CatMascot] No messages found for states [${petStates.join(', ')}]`);
          return;
        }

        const intervalMs = (activeTiming.message_interval_minutes || 0.25) * 60 * 1000;
        const durationMs = (activeTiming.message_duration_minutes || 0.1) * 60 * 1000;

        console.log(`[CatMascot] Loop started: States=[${petStates.join(', ')}], Msgs=${msgsData.length}, Interval=${intervalMs / 1000}s, Duration=${durationMs / 1000}s`);

        let currentIndex = 0;

        const loop = () => {
          meowTimerRef.current = setTimeout(() => {
            if (!isSubscribed) return;
            const seqMsg = msgsData[currentIndex].message;
            setMeowMsg(seqMsg);
            currentIndex = (currentIndex + 1) % msgsData.length;

            setTimeout(() => {
              if (isSubscribed) setMeowMsg(null);
              loop();
            }, durationMs);
          }, intervalMs);
        };

        loop();
      } catch (err) {
        console.error("Error setting up meow loop:", err);
      }
    };

    runMeowLoop();

    return () => {
      isSubscribed = false;
      if (meowTimerRef.current) clearTimeout(meowTimerRef.current);
    };
  }, [disabled, isDialogActive, petStates]);

  const audioLoopTimerRef = useRef(null);

  useEffect(() => {
    if (disabled) return;

    let isSubscribed = true;

    const runAudioLoop = async () => {
      try {
        const { data: configs } = await supabase.from('aiboard_meow_configs').select('id').limit(1);
        if (!configs || configs.length === 0) return;
        const configId = configs[0].id;

        const { data: timingData } = await supabase
          .from('aiboard_meow_timing')
          .select('message_interval_minutes, disabled')
          .eq('config_id', configId)
          .eq('state', 'Audio')
          .order('updated_at', { ascending: false })
          .limit(1);

        const audioTiming = timingData?.[0];
        if (!audioTiming || audioTiming.disabled) return;

        const { data: msgsData } = await supabase
          .from('aiboard_meow_messages')
          .select('message')
          .eq('config_id', configId)
          .eq('state', 'Audio')
          .eq('is_audio', true);

        if (!msgsData || msgsData.length === 0) return;

        const intervalMs = (audioTiming.message_interval_minutes || 0.1) * 60 * 1000;

        const loop = () => {
          audioLoopTimerRef.current = setTimeout(() => {
            if (!isSubscribed) return;
            const randomMsg = msgsData[Math.floor(Math.random() * msgsData.length)].message;
            if (randomMsg) {
              const audioObj = new Audio(randomMsg);
              audioObj.play().catch(e => console.error("Audio playback error:", e));
            }
            loop();
          }, intervalMs);
        };

        loop();
      } catch (err) {
        console.error("Error setting up audio loop:", err);
      }
    };

    runAudioLoop();

    return () => {
      isSubscribed = false;
      if (audioLoopTimerRef.current) clearTimeout(audioLoopTimerRef.current);
    };
  }, [disabled]);

  const walkTimeoutRef = useRef(null);
  const audioRef = useRef(null);
  const lastMoveStartPos = useRef({ x: -10, y: 85 });
  const lastMoveStartTime = useRef(Date.now());
  const lastMoveDuration = useRef(0.8);
  const lastMoveTarget = useRef({ x: -10, y: 85 });

  useEffect(() => {
    audioRef.current = new Audio('/images/cat-meow.mp3');

    // Walk into screen from left
    const destX = 20 + Math.random() * 60;
    const destY = 80 + Math.random() * 10;
    const duration = 2.8; // Entry walk duration

    lastMoveStartPos.current = { x: -10, y: 85 };
    lastMoveTarget.current = { x: destX, y: destY };
    lastMoveStartTime.current = Date.now();
    lastMoveDuration.current = duration;

    setFacingLeft(false);
    setWalkDuration(duration);
    setCatPos({ x: destX, y: destY });
    setIsWalking(true);

    if (walkTimeoutRef.current) clearTimeout(walkTimeoutRef.current);
    walkTimeoutRef.current = setTimeout(() => {
      setIsWalking(false);
      isEntryWalkComplete.current = true;
      tryActivateDialog();
    }, duration * 1000);

    const getInterpolatedPos = () => {
      const elapsed = (Date.now() - lastMoveStartTime.current) / 1000;
      const progress = Math.min(elapsed / lastMoveDuration.current, 1);
      return {
        x: lastMoveStartPos.current.x + (lastMoveTarget.current.x - lastMoveStartPos.current.x) * progress,
        y: lastMoveStartPos.current.y + (lastMoveTarget.current.y - lastMoveStartPos.current.y) * progress,
      };
    };

    const handleGlobalClick = (e) => {
      const target = e.target;
      if (target.closest('button') || target.closest('a') || target.closest('input') || target.closest('[data-cat]')) return;

      const targetX_px = e.clientX;
      const targetY_px = e.clientY;

      const targetX = (targetX_px / window.innerWidth) * 100;
      const targetY = (targetY_px / window.innerHeight) * 100;
      const currentPos = getInterpolatedPos();
      const currentX_px = (currentPos.x / 100) * window.innerWidth;
      const currentY_px = (currentPos.y / 100) * window.innerHeight;

      const distance_px = Math.sqrt(Math.pow(targetX_px - currentX_px, 2) + Math.pow(targetY_px - currentY_px, 2));

      if (distance_px < 5) return;

      const duration = distance_px / 200;

      lastMoveStartPos.current = currentPos;
      lastMoveTarget.current = { x: targetX, y: targetY };
      lastMoveStartTime.current = Date.now();
      lastMoveDuration.current = duration;

      const nextFacingLeft = targetX < currentPos.x;
      setFacingLeft(nextFacingLeft);
      setWalkDuration(duration);
      setCatPos({ x: targetX, y: targetY });
      setIsWalking(true);

      if (walkTimeoutRef.current) clearTimeout(walkTimeoutRef.current);
      walkTimeoutRef.current = setTimeout(() => {
        setIsWalking(false);
        isEntryWalkComplete.current = true;
        tryActivateDialog();
      }, duration * 1000);
    };

    document.addEventListener('dblclick', handleGlobalClick);
    return () => {
      document.removeEventListener('dblclick', handleGlobalClick);
      if (autoCloseTimerRef.current) {
        clearTimeout(autoCloseTimerRef.current);
      }
    };
  }, []);

  const handleCatClick = (e) => {
    e.stopPropagation();
    // Only close the dialog on click if we are NOT in pre-login mode (disabled=true)
    if (!disabled) {
      closeDialog();
    }
    if (!isPetSleeping && audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => { });
      setIsMeowing(true);
      setTimeout(() => setIsMeowing(false), 800);
    }
    if (!disabled && onCatClick) onCatClick();
  };

  return (
    <>
      <style>{`
        @keyframes cat-sound-wave {
          0% { transform: translate(-50%, -50%) scale(1); opacity: 0.6; }
          100% { transform: translate(-50%, -50%) scale(2.5); opacity: 0; }
        }
        .cat-sound-ring {
          animation: cat-sound-wave 0.6s ease-out forwards;
        }
        .cat-tooltip {
          opacity: 0;
          transition: opacity 0.2s;
          pointer-events: none;
        }
        .cat-mascot-wrapper:hover .cat-tooltip {
          opacity: 1;
        }
        .cat-popup-clamp {
          --cat-popup-shift: 0px;
          width: max-content;
          max-width: calc(100vw - 24px);
          transform: translateX(var(--cat-popup-shift));
        }

        .cat-popup-arrow {
          left: 50%;
        }

        @media (max-width: 639px) {
          .cat-popup-clamp {
            --cat-popup-shift: clamp(
              calc(12px - var(--cat-x) + 50%),
              0px,
              calc(100vw - 12px - var(--cat-x) - 50%)
            );
          }

          .cat-popup-arrow {
            left: clamp(
              18px,
              calc(50% - var(--cat-popup-shift)),
              calc(100% - 18px)
            );
          }
        }

        .mallow-mascot {
          position: relative;
          width: ${MALLOW_FRAME_WIDTH * MALLOW_SCALE}px;
          height: ${MALLOW_FRAME_HEIGHT * MALLOW_SCALE}px;
          background-image: var(--pet-spritesheet);
          background-repeat: no-repeat;
          background-size: ${MALLOW_FRAME_WIDTH * 8 * MALLOW_SCALE}px ${MALLOW_FRAME_HEIGHT * 9 * MALLOW_SCALE}px;
          background-position-y: calc(-1 * var(--sprite-row) * ${MALLOW_FRAME_HEIGHT * MALLOW_SCALE}px);
          image-rendering: pixelated;
          pointer-events: auto;
          cursor: pointer;
          filter: drop-shadow(0 5px 8px rgba(15, 23, 42, 0.1));
          animation-duration: var(--sprite-duration);
          animation-iteration-count: infinite;
          animation-timing-function: steps(var(--sprite-frames));
        }
        .mallow-mascot.idle {
          animation-name: mallow-sprite;
        }
        .mallow-mascot.run-left,
        .mallow-mascot.run-right,
        .mallow-mascot.review {
          animation-name: mallow-sprite;
        }
        .mallow-mascot.sleep {
          animation-name: none;
          background-position-x: calc(-1 * var(--sprite-frame) * ${MALLOW_FRAME_WIDTH * MALLOW_SCALE}px);
        }
        .mallow-mascot.sleep::after {
          content: 'Zzz...';
          position: absolute;
          left: 64%;
          top: -5px;
          color: #94a3b8;
          font-size: 14px;
          font-weight: 800;
          letter-spacing: 0.02em;
          animation: mascot-sleep-float 1.8s ease-in-out infinite;
        }
        @keyframes mallow-sprite {
          from { background-position-x: 0; }
          to { background-position-x: calc(-1 * var(--sprite-frames) * ${MALLOW_FRAME_WIDTH * MALLOW_SCALE}px); }
        }
        @keyframes mascot-sleep-float {
          0%, 100% { transform: translateY(0); opacity: 0.65; }
          50% { transform: translateY(-4px); opacity: 1; }
        }
      `}</style>

      <div
        className="cat-mascot-wrapper"
        style={{
          position: 'fixed',
          left: `${catPos.x}%`,
          top: `${catPos.y}%`,
          transform: `translate(-50%, -100%)`,
          transition: `left ${walkDuration}s linear, top ${walkDuration}s linear`,
          zIndex: 10000,
          userSelect: 'none',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          pointerEvents: 'none',
        }}
      >
        <AnimatePresence mode="wait">
          {isDialogActive && !activeCandidate && dialogSteps.length > 0 && (
            <div
              className="cat-popup-clamp"
              style={{ '--cat-x': `${catPos.x}vw` }}
            >
              <motion.div
                data-cat="true"
                key={`dialog-bubble-${dialogStep}`}
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
              className="w-max shrink-0 max-w-[min(85vw,340px)] bg-white border border-slate-200 rounded-lg shadow-sm flex flex-col overflow-visible relative pointer-events-auto mb-4 mr-1 cursor-default"
              onClick={(e) => e.stopPropagation()}
            >
              <div
                className="p-4 text-sm font-semibold leading-relaxed flex flex-col relative z-10 bg-white rounded-lg"
                style={{ color: '#334155', backgroundColor: '#ffffff' }}
              >
                <div className="flex-1 flex items-center justify-center text-center">
                  <p className="whitespace-pre-wrap" style={{ color: '#334155' }}>{dialogSteps[dialogStep]}</p>
                </div>
                <div className="pt-4 flex justify-between items-center mt-auto">
                  <button
                    onClick={(e) => { e.stopPropagation(); setDialogStep(p => Math.max(0, p - 1)); }}
                    disabled={dialogStep === 0}
                    className={`flex items-center gap-1 text-xs font-semibold text-slate-600 underline underline-offset-2 hover:text-slate-900 cursor-pointer ${dialogStep === 0 ? 'invisible' : ''
                      }`}
                  >
                    <ChevronLeft className="w-4 h-4" /> Back
                  </button>
                  {dialogStep === dialogSteps.length - 1 ? (
                    <button
                      onClick={(e) => { e.stopPropagation(); closeDialog(); }}
                      className="flex items-center gap-1 text-xs font-semibold text-[#2A9D8F] underline underline-offset-2 hover:opacity-80 cursor-pointer"
                    >
                      Close <X className="w-4 h-4" />
                    </button>
                  ) : (
                    <button
                      onClick={(e) => { e.stopPropagation(); setDialogStep(p => Math.min(dialogSteps.length - 1, p + 1)); }}
                      className="flex items-center gap-1 text-xs font-semibold text-[#2A9D8F] underline underline-offset-2 hover:opacity-80 cursor-pointer"
                    >
                      Next <ChevronRight className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
              <div className="cat-popup-arrow absolute -bottom-2 w-4 h-4 bg-white transform rotate-45 -translate-x-1/2 shadow-md border-r border-b border-slate-100 z-0"></div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Phase-2 proactive personalized reminder — reuses the exact same
          dialogue bubble container/styling as Intro/Welcome Back above,
          but single-step (no Back/Next) with an optional CTA button that
          reuses App.jsx's existing action handler verbatim via the prop. */}
      <AnimatePresence mode="wait">
        {isDialogActive && activeCandidate && (
          <div
            className="cat-popup-clamp"
            style={{ '--cat-x': `${catPos.x}vw` }}
          >
            <motion.div
              data-cat="true"
              key="dialog-bubble-personalized"
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
              className="w-max shrink-0 max-w-[min(85vw,340px)] bg-white border border-slate-200 rounded-lg shadow-sm flex flex-col overflow-visible relative pointer-events-auto mb-4 mr-1 cursor-default"
              onClick={(e) => e.stopPropagation()}
            >
              <div
                className="p-4 text-sm font-semibold leading-relaxed flex flex-col relative z-10 bg-white rounded-lg"
                style={{ color: '#334155', backgroundColor: '#ffffff' }}
              >
                <div className="flex-1 flex items-center justify-center text-center">
                  <p className="whitespace-pre-wrap" style={{ color: '#334155' }}>{activeCandidate.message}</p>
                </div>
                <div className="pt-4 flex justify-end items-center gap-4 mt-auto">
                  {activeCandidate.action && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        // CTA order: mark dismissed first (inside
                        // closeDialog), then close/update UI, then run
                        // App.jsx's existing action — never a new action
                        // derived here. Uses the action AND candidate
                        // captured at adoption time (not a fresh read of
                        // the prop, and not whatever the inline resolver's
                        // current winner happens to be), since the
                        // dialogue persists even if personalizedInsightState
                        // has since gone back to null/not_ready or moved on
                        // to a different candidate (e.g. a minute tick
                        // re-resolving Appointment Soon) — this is what
                        // guarantees the CTA always acts on the exact
                        // candidate Cat is showing, never a stale or
                        // unrelated one. Both refs are read BEFORE
                        // closeDialog() clears activeCandidateRef.
                        const onAction = activeOnActionRef.current;
                        const candidateToActOn = activeCandidateRef.current;
                        closeDialog();
                        if (candidateToActOn) onAction?.(candidateToActOn);
                      }}
                      className="flex items-center gap-1 text-xs font-bold text-white bg-[#2A9D8F] px-3 py-1.5 rounded-md hover:opacity-90 cursor-pointer"
                    >
                      {activeCandidate.action.label}
                    </button>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); closeDialog(); }}
                    className="flex items-center gap-1 text-xs font-semibold text-[#2A9D8F] underline underline-offset-2 hover:opacity-80 cursor-pointer"
                  >
                    Close <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="cat-popup-arrow absolute -bottom-2 w-4 h-4 bg-white transform rotate-45 -translate-x-1/2 shadow-md border-r border-b border-slate-100 z-0"></div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

        <AnimatePresence mode="wait">
          {!disabled && !isDialogActive && meowMsg && (
            <div
              className="cat-popup-clamp"
              style={{ '--cat-x': `${catPos.x}vw` }}
            >
              <motion.div
                initial={{ opacity: 0, y: 5, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -5, scale: 0.95 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="px-4 py-2.5 bg-white border border-slate-200 rounded-lg shadow-sm relative pointer-events-auto mb-4 mr-1 cursor-default"
            >
              <span className="text-sm font-semibold text-slate-700 whitespace-nowrap">{meowMsg}</span>
              <div className="cat-popup-arrow absolute -bottom-2 w-4 h-4 bg-white transform rotate-45 -translate-x-1/2 shadow-md border-r border-b border-slate-100 z-0"></div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

        {/* Mallow pet mascot */}
        <div
          data-cat="true"
          onClick={(e) => {
            e.stopPropagation();
            handleCatClick(e);
          }}
          onMouseEnter={() => setIsHovered(true)}
          onMouseOver={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          style={{ pointerEvents: 'auto' }}
        >
          <MallowMascotSprite
            spriteSheetUrl={selectedPet.spriteSheetUrl}
            sleepHoldFrame={selectedPet.sleepHoldFrame}
            idleFrames={selectedPet.idleFrames}
            idleDuration={selectedPet.idleDuration}
            hoverRow={selectedPet.hoverRow}
            hoverFrames={selectedPet.hoverFrames}
            hoverDuration={selectedPet.hoverDuration}
            clickRow={selectedPet.clickRow}
            clickFrames={selectedPet.clickFrames}
            clickDuration={selectedPet.clickDuration}
            isWalking={isWalking}
            facingLeft={facingLeft}
            isMeowing={isMeowing}
            isHovered={isHovered}
            isSleeping={isPetSleeping}
            onHoverStart={() => setIsHovered(true)}
            onHoverEnd={() => setIsHovered(false)}
          />
        </div>
      </div>
    </>
  );
}
