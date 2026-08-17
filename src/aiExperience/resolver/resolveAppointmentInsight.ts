// Minimal deterministic local resolver for Appointments Phase-2A —
// mirrors the same small-module structure already browser-validated in
// the To-Do and Inventory repos (resolveTodoInsight.ts /
// resolveInventoryInsight.ts).
//
// This is intentionally NOT the Gallery global resolver
// (resolveDialogue.ts) and does not import it — Gallery's global cross-app
// priority is untouched and unrelated to this local, Appointments-only
// ranking. Staff Leave remains deferred (no staff-absence model exists).
//
// Explicit, hardcoded precedence — never array order, never Promise
// timing:
//   1. appointment_soon          (HIGH  — a real, time-sensitive alert)
//   2. appointment_daily_summary (MEDIUM — today's operational snapshot)
//   3. appointment_none_today    (INFO   — today is confirmed empty)
// Each candidate's own provider independently decides its own
// eligibility (including, for the latter two, the today-data-coverage
// gate — see ../utils/appointmentCoverage.ts) — this function only picks
// the first non-null result. There is no unconditional final fallback:
// if all three return `null` (e.g. today isn't covered by the loaded
// data and no soon-appointment exists), the resolver returns `null` and
// no personalized claim is shown, rather than fabricating one.

import { evaluateAppointmentSoon, type AppointmentLike } from '../providers/appointmentSoonProvider';
import { evaluateAppointmentDailySummary } from '../providers/appointmentDailySummaryProvider';
import { evaluateNoAppointmentsToday } from '../providers/noAppointmentsTodayProvider';
import type { DailyAppointmentLike, RoomLike } from '../utils/appointmentDailyProjection';
import type { DateRangeLike } from '../utils/appointmentCoverage';
import type { InsightCandidate } from '../contracts/insightCandidate';

export function resolveAppointmentInsight(
  soonAppointments: AppointmentLike[],
  dailyAppointments: DailyAppointmentLike[],
  rooms: RoomLike[],
  dateRange: DateRangeLike | null | undefined
): InsightCandidate<unknown> | null {
  const now = new Date();

  const soon = evaluateAppointmentSoon(soonAppointments, now);
  if (soon) return soon;

  const dailySummary = evaluateAppointmentDailySummary(dailyAppointments, rooms, dateRange, now);
  if (dailySummary) return dailySummary;

  return evaluateNoAppointmentsToday(dailyAppointments, dateRange, now);
}
