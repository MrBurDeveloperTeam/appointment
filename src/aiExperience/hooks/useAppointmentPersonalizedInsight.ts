// Minimal hook wiring the local resolver into React — mirrors the
// browser-validated To-Do/Inventory pattern (useTodoPersonalizedInsight.ts,
// useInventoryPersonalizedInsight.ts), with two additions specific to this
// trigger.
//
// 1. RUNTIME PII PROJECTION (hardening pass): `appointments` here is
// App.jsx's existing FULL appointment state — the same objects carrying
// patientId/dentistId/roomId/treatmentId/notes/createdAt (see
// datastore.supabase.appointments.js's mapAppointment). The parameter type
// below is deliberately `unknown[]`, not `AppointmentLike[]` — declaring it
// as the narrower type would only change what TypeScript *lets you read*,
// not what the object *contains* at runtime, so it would not actually keep
// patient data out of anything holding a reference to these objects. This
// hook calls `projectAppointmentsForInsight` (see
// ../utils/appointmentProjection.ts) to build brand-new minimal objects
// BEFORE anything is passed to the resolver/provider — the provider is
// never handed the original appointment references at all.
//
// 2. MINUTE-BOUNDARY-ALIGNED CLOCK (hardening pass): Appointment Within 2
// Hours is a clock-time rule whose eligibility can change purely from time
// passing, with no `appointments` state change at all — a static
// `useMemo([appointments])` alone would never re-derive the candidate as
// the clock ticks past the 2-hour window or past the appointment's start.
// No existing minute-level clock/tick mechanism was found anywhere in this
// app (App.jsx's `currentDate` is the CALENDAR navigation date, not a live
// "now" ticker). A plain `setInterval(fn, 60_000)` started at an arbitrary
// second would lag entry into the window by up to ~59s, since
// `appointments.startTime` is minute-resolution `HH:mm` data. This hook
// instead: (a) computes the exact ms remaining until the next real minute
// boundary, (b) `setTimeout`s to that boundary, ticks once there, (c) THEN
// starts a 60s `setInterval` so every subsequent tick also lands on a
// minute boundary, and (d) cleans up both the timeout and the interval on
// unmount/re-run. Never polls Supabase, never ticks more than once a
// minute, and is the only timer this feature adds.
//
// Deliberately NOT sessionStorage-deduped, NOT cooldown-gated: this is a
// persistent landing/calendar banner, not an interruption — it should
// always reflect current appointment state (and current time) whenever
// rendered. If the appointment is cancelled/rescheduled outside the
// window, or its start passes, the candidate naturally disappears on the
// next re-render (immediate for an `appointments` change, within one
// minute boundary for pure clock passage).
//
// Loading is handled upstream: App.jsx already returns an entirely
// different "Loading your clinic…" screen while `isReady` is false (see
// App.jsx around its `isReady` check), so the component tree that mounts
// this hook is only ever rendered once appointment data has already
// loaded — no separate loading gate is needed here.

import { useEffect, useMemo, useState } from 'react';
import { resolveAppointmentInsight } from '../resolver/resolveAppointmentInsight';
import { projectAppointmentsForInsight } from '../utils/appointmentProjection';
import type { InsightCandidate } from '../contracts/insightCandidate';

export function useAppointmentPersonalizedInsight(appointments: unknown[]): InsightCandidate<unknown> | null {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    // Bare global setTimeout/setInterval (not `window.`-prefixed) so the id
    // types stay consistent with whichever lib (DOM vs Node) this project's
    // tsconfig resolves them to — mixing `window.setInterval`'s return type
    // with a `Timeout`-typed variable is a common source of a spurious
    // type mismatch when both @types/node and DOM lib are present.
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const now = new Date();
    const msIntoCurrentMinute = now.getSeconds() * 1000 + now.getMilliseconds();
    const msUntilNextMinuteBoundary = 60_000 - msIntoCurrentMinute;

    const timeoutId = setTimeout(() => {
      setTick((t) => t + 1);
      intervalId = setInterval(() => setTick((t) => t + 1), 60_000);
    }, msUntilNextMinuteBoundary);

    return () => {
      clearTimeout(timeoutId);
      if (intervalId !== null) clearInterval(intervalId);
    };
  }, []);

  return useMemo(() => {
    try {
      // Runtime projection happens here, before the resolver/provider ever
      // see anything — see the file header for why a narrower TS type
      // alone would not have been sufficient.
      const projected = projectAppointmentsForInsight(appointments);
      return resolveAppointmentInsight(projected);
    } catch (err) {
      // A provider failure must never produce a fabricated personalized
      // claim or a raw error surfaced to the user. Evaluation here is pure
      // (no network call) — this is only a last-resort guard against a
      // malformed appointment row; the safe behavior is simply "no insight
      // this render". Never logs the appointments array itself.
      console.warn('[aiExperience] appointment personalized insight evaluation failed:', err);
      return null;
    }
    // `tick` is intentionally a dependency purely to force re-evaluation as
    // the clock passes — its value is never read inside the callback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appointments, tick]);
}
