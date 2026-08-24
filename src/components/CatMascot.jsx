import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, ChevronLeft, X } from 'lucide-react';
import { useSharedCatDialogueRuntime } from '@mrburdeveloperteam/molar-experience/cat';
import { supabase } from '../lib/supabaseClient';
import { getPetOption, normalizePetId } from '../VirtualPet/petOptions';

const MALLOW_FRAME_WIDTH = 192;
const MALLOW_FRAME_HEIGHT = 208;
const MALLOW_SCALE = 0.42;
const PET_SLEEPING_KEY = 'pet_is_sleeping';
const PET_SLEEPING_UPDATED_AT_KEY = 'pet_is_sleeping_updated_at';
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

  // ─── PHASE 8B: Shared Cat Dialogue Runtime ──────────────────────────────
  // The mechanics previously implemented locally here (mount-scoped shown
  // tracking, localStorage dismissal persistence + cross-tab sync,
  // exact-adopted-candidate/action binding, one-activation/no-cascade,
  // entry-walk-gated activation, Welcome Back auto-close) now live entirely
  // in `useSharedCatDialogueRuntime`. What stays local, unchanged in
  // content, is exactly what's genuinely Appointments-specific: resolving
  // the authenticated user id, and fetching Intro/Welcome Back CONTENT
  // (module_name/table names, [name] interpolation) — the runtime only
  // ever receives already-resolved, reactive `{status, ...}` inputs, never
  // fetches anything itself.
  const [currentUserId, setCurrentUserId] = useState(null);
  const userMetaRef = useRef(null);
  const userEmailRef = useRef(null);

  // Resolve the authenticated user id once per mount — the SAME session
  // read the pre-migration `initDialog()` performed, just decoupled from
  // the content-fetch effects below so each can react to `currentUserId`
  // independently.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (cancelled) return;
        userMetaRef.current = session?.user?.user_metadata || null;
        userEmailRef.current = session?.user?.email || null;
        setCurrentUserId(session?.user?.id || null);
      } catch (err) {
        console.error('Error fetching session in CatMascot:', err);
      }
    })();
    return () => { cancelled = true; };
  }, [disabled]);

  // Post-Login Intro content — reactive `{status, steps}` input for the
  // shared runtime. Only fetched when this user hasn't already completed
  // the Intro stage (same `intro_shown_${uid}` localStorage key the
  // runtime itself reads/writes — see the runtime's own doc), matching the
  // pre-migration query-avoidance behavior exactly. A configs/steps query
  // failure leaves `introState` at `{status:'not_ready'}` so the runtime
  // never marks the stage complete and this retries on the next
  // login/reload — identical to the pre-migration "do not mark complete on
  // infra failure" behavior.
  const [introState, setIntroState] = useState({ status: 'not_ready' });

  useEffect(() => {
    if (disabled) return;
    if (!currentUserId) return;
    if (localStorage.getItem(`intro_shown_${currentUserId}`) === 'true') return;

    let cancelled = false;
    (async () => {
      try {
        const { data: configs, error: configsError } = await supabase
          .from('aiboard_simulator_configs')
          .select('id')
          .eq('module_name', 'Appointment')
          .limit(1);

        if (configsError) return;

        if (!configs || configs.length === 0) {
          if (!cancelled) setIntroState({ status: 'ready', steps: [] });
          return;
        }

        const configId = configs[0].id;

        const { data, error } = await supabase
          .from('aiboard_simulator_dialog_steps')
          .select('step_text, sort_order')
          .eq('config_id', configId)
          .eq('is_post_login', !disabled)
          .order('sort_order', { ascending: true });

        if (error) return;

        const steps = (data || [])
          .map(d => d.step_text)
          .filter(text => typeof text === 'string' && text.trim().length > 0);

        if (!cancelled) setIntroState({ status: 'ready', steps });
      } catch (err) {
        console.error('Error fetching dialog steps:', err);
      }
    })();

    return () => { cancelled = true; };
  }, [disabled, currentUserId]);

  // Welcome Back content — reactive `{status, message, autoCloseMs}` input.
  // KNOWN, ACCEPTED TIMING SEAM (same pattern established in the Molar AI
  // empty-state fetch across this whole migration series): fetched as soon
  // as the user id resolves, rather than only lazily once the runtime's own
  // arbitration has already decided Personalized has no eligible candidate.
  // This is one extra harmless read query per activation in the case where
  // a Personalized reminder ends up showing instead — the runtime itself
  // still gates actually DISPLAYING Welcome Back behind its own internal
  // arbitration, so this never changes which dialogue the user sees or when.
  const [welcomeBackState, setWelcomeBackState] = useState({ status: 'not_ready' });

  useEffect(() => {
    if (disabled) return;
    if (!currentUserId) return;

    let cancelled = false;
    (async () => {
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
              .eq('user_id', currentUserId)
              .maybeSingle();
            displayName = profile?.name || profile?.full_name || null;
          } catch (err) {
            console.error("Error fetching profile for welcome back name:", err);
          }
          if (!displayName) displayName = userMetaRef.current?.name || null;
          if (!displayName && userEmailRef.current) displayName = userEmailRef.current.split('@')[0];
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

        if (!cancelled) {
          setWelcomeBackState(
            welcomeText
              ? { status: 'ready', message: welcomeText, autoCloseMs }
              : { status: 'ready', message: null }
          );
        }
      } catch (err) {
        console.error("Error fetching welcome back message:", err);
      }
    })();

    return () => { cancelled = true; };
  }, [disabled, currentUserId]);

  // Personalized candidate pool — App.jsx already computes this as the
  // three-way `{status:'not_ready'}` / `{status:'ready', candidates, onAction}`
  // contract (see App.jsx's `personalizedInsightState`); this just adapts it
  // to the shared runtime's `DialogueAdapter` shape (`state` + `onAction`
  // as sibling fields, `candidates` always an array).
  const personalizedState = personalizedInsightState?.status === 'ready'
    ? { status: 'ready', candidates: personalizedInsightState.candidates || [] }
    : { status: 'not_ready' };

  const { dialogue, closeActiveDialogue } = useSharedCatDialogueRuntime({
    appId: 'appointments',
    userId: currentUserId,
    disabled,
    intro: introState,
    personalized: {
      state: personalizedState,
      onAction: personalizedInsightState?.onAction || (() => {}),
    },
    welcomeBack: welcomeBackState,
  });

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
    if (disabled || dialogue.kind !== 'none') return;

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
  }, [disabled, dialogue.kind, petStates]);

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
    const duration = 2.8; // Entry walk duration — matches the shared
    // runtime's own fixed CAT_ENTRY_WALK_DURATION_MS (2800ms) gate for
    // when a prepared dialogue may first activate.

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
      }, duration * 1000);
    };

    document.addEventListener('dblclick', handleGlobalClick);
    return () => {
      document.removeEventListener('dblclick', handleGlobalClick);
    };
  }, []);

  const handleCatClick = (e) => {
    e.stopPropagation();
    // Only close the dialog on click if we are NOT in pre-login mode (disabled=true)
    if (!disabled) {
      closeActiveDialogue();
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
          {dialogue.kind === 'sequence' && (
            <div
              className="cat-popup-clamp"
              style={{ '--cat-x': `${catPos.x}vw` }}
            >
              <motion.div
                data-cat="true"
                key={`dialog-bubble-${dialogue.stepIndex}`}
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
                  <p className="whitespace-pre-wrap" style={{ color: '#334155' }}>{dialogue.steps[dialogue.stepIndex]}</p>
                </div>
                <div className="pt-4 flex justify-between items-center mt-auto">
                  <button
                    onClick={(e) => { e.stopPropagation(); dialogue.onBack(); }}
                    disabled={dialogue.stepIndex === 0}
                    className={`flex items-center gap-1 text-xs font-semibold text-slate-600 underline underline-offset-2 hover:text-slate-900 cursor-pointer ${dialogue.stepIndex === 0 ? 'invisible' : ''
                      }`}
                  >
                    <ChevronLeft className="w-4 h-4" /> Back
                  </button>
                  {dialogue.stepIndex === dialogue.steps.length - 1 ? (
                    <button
                      onClick={(e) => { e.stopPropagation(); dialogue.onClose(); }}
                      className="flex items-center gap-1 text-xs font-semibold text-[#2A9D8F] underline underline-offset-2 hover:opacity-80 cursor-pointer"
                    >
                      Close <X className="w-4 h-4" />
                    </button>
                  ) : (
                    <button
                      onClick={(e) => { e.stopPropagation(); dialogue.onNext(); }}
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
        {dialogue.kind === 'personalized' && (
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
                  <p className="whitespace-pre-wrap" style={{ color: '#334155' }}>{dialogue.message}</p>
                </div>
                <div className="pt-4 flex justify-end items-center gap-4 mt-auto">
                  {dialogue.action && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        dialogue.action.onClick();
                      }}
                      className="flex items-center gap-1 text-xs font-bold text-white bg-[#2A9D8F] px-3 py-1.5 rounded-md hover:opacity-90 cursor-pointer"
                    >
                      {dialogue.action.label}
                    </button>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); dialogue.onClose(); }}
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
          {!disabled && dialogue.kind === 'none' && meowMsg && (
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
