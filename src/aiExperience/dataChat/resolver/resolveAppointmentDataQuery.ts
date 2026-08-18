// Deterministic dispatcher: approved intent -> pure grounded provider ->
// GroundedDataResult. No Supabase query here — reuses the exact same
// `appointments`/`rooms` state App.jsx already owns (via useDataStore),
// passed in by the caller.
//
// READINESS: `appointmentDataStatus !== 'ready'` short-circuits to
// `status: 'unavailable'` BEFORE any provider runs — unknown appointment
// state is never reinterpreted as a zero-result answer.
//
// COVERAGE: reuses Phase-2's own `isTodayCoveredByDateRange` (see
// ../../utils/appointmentCoverage.ts) but evaluates it against the
// SUCCESSFULLY LOADED range (see src/hooks/useDataStore.js's
// `loadedAppointmentRange`), not the currently-requested calendar range
// — a range change in flight must never authorize an answer against
// stale prior data before the new fetch actually completes.
//
// INTEGRITY: Room Usage and Daily Summary additionally require
// `hasUnresolvableRoomOccupancy` to pass (see
// ../utils/checkAppointmentDataIntegrity.ts) — Appointment Soon and
// Today Count do not, since neither depends on `end_time`.

import { isTodayCoveredByDateRange, type DateRangeLike } from '../../utils/appointmentCoverage';
import { projectAppointmentsForDailySummary, projectRoomsForDailySummary } from '../../utils/appointmentDailyProjection';
import { hasUnresolvableRoomOccupancy } from '../utils/checkAppointmentDataIntegrity';
import { buildAppointmentSoonDataFacts } from '../providers/appointmentSoonDataProvider';
import { buildTodayCountDataFacts } from '../providers/todayCountDataProvider';
import { buildRoomUsageDataFacts } from '../providers/roomUsageDataProvider';
import { buildDailySummaryDataFacts } from '../providers/dailySummaryDataProvider';
import type { AppointmentDataIntent, AppointmentDataStatus, GroundedDataResult } from '../contracts/groundedDataResult';

export function resolveAppointmentDataQuery(
  intent: AppointmentDataIntent,
  appointments: unknown[],
  rooms: unknown[],
  appointmentDataStatus: AppointmentDataStatus,
  loadedAppointmentRange: DateRangeLike | null | undefined
): GroundedDataResult<unknown> {
  const evaluatedAt = new Date().toISOString();

  if (appointmentDataStatus === 'loading') {
    return { status: 'unavailable', intent, reasonCode: 'loading', evaluatedAt };
  }
  if (appointmentDataStatus === 'error') {
    return { status: 'unavailable', intent, reasonCode: 'data_error', evaluatedAt };
  }
  if (!isTodayCoveredByDateRange(loadedAppointmentRange)) {
    return { status: 'unavailable', intent, reasonCode: 'coverage_unavailable', evaluatedAt };
  }

  try {
    const now = new Date();
    // Same runtime PII-minimization projections Phase-2 already uses —
    // reused as-is, not reimplemented (see appointmentDailyProjection.ts).
    const dailyAppointments = projectAppointmentsForDailySummary(appointments);
    const roomsProjected = projectRoomsForDailySummary(rooms);

    switch (intent) {
      case 'appointment_soon': {
        const { facts, sourceRecordIds } = buildAppointmentSoonDataFacts(dailyAppointments, roomsProjected, now);
        return { status: 'ok', intent, facts, evaluatedAt, sourceRecordIds };
      }
      case 'appointment_today_count': {
        const { facts, sourceRecordIds } = buildTodayCountDataFacts(dailyAppointments, now);
        return { status: 'ok', intent, facts, evaluatedAt, sourceRecordIds };
      }
      case 'appointment_room_usage': {
        if (hasUnresolvableRoomOccupancy(dailyAppointments, now)) {
          return { status: 'unavailable', intent, reasonCode: 'evaluation_error', evaluatedAt };
        }
        const { facts, sourceRecordIds } = buildRoomUsageDataFacts(dailyAppointments, roomsProjected, now);
        return { status: 'ok', intent, facts, evaluatedAt, sourceRecordIds };
      }
      case 'appointment_daily_summary': {
        if (hasUnresolvableRoomOccupancy(dailyAppointments, now)) {
          return { status: 'unavailable', intent, reasonCode: 'evaluation_error', evaluatedAt };
        }
        const { facts, sourceRecordIds } = buildDailySummaryDataFacts(dailyAppointments, roomsProjected, now);
        return { status: 'ok', intent, facts, evaluatedAt, sourceRecordIds };
      }
      default: {
        // Exhaustiveness guard — caught below like any other evaluation
        // failure if AppointmentDataIntent is ever widened without
        // updating this switch.
        throw new Error(`Unhandled AppointmentDataIntent: ${intent as string}`);
      }
    }
  } catch (err) {
    console.warn('[dataChat] appointment data query evaluation failed:', err);
    return { status: 'unavailable', intent, reasonCode: 'evaluation_error', evaluatedAt };
  }
}
