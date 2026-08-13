// Minimal deterministic local resolver for this first Appointments
// Phase-2A slice — mirrors the same small-module structure already
// browser-validated in the To-Do and Inventory repos
// (resolveTodoInsight.ts / resolveInventoryInsight.ts), even though this
// first slice only has one operational candidate. Kept as a real function
// (not inlined into the hook) so later slices (Daily Summary, No
// Appointments Today) can extend it additively without restructuring
// call sites, exactly as happened in the other two repos.
//
// This is intentionally NOT the Gallery global resolver
// (resolveDialogue.ts) and does not import it — Gallery's global cross-app
// priority is untouched and unrelated to this local, Appointments-only
// ranking. Daily Summary / Room In Use / No Appointments Today / Staff
// Leave branches are deliberately not present yet.

import { evaluateAppointmentSoon, type AppointmentLike } from '../providers/appointmentSoonProvider';
import type { InsightCandidate } from '../contracts/insightCandidate';

export function resolveAppointmentInsight(appointments: AppointmentLike[], now?: Date): InsightCandidate<unknown> | null {
  return evaluateAppointmentSoon(appointments, now);
}
