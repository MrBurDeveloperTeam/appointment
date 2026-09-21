export const PAST_APPOINTMENT_MESSAGE = 'This appointment has passed and is read-only.';

// Appointment dates and times use the same local timezone as the calendar.
export function hasAppointmentPassed(appointment, now = new Date()) {
  if (!appointment?.date || !appointment?.startTime) return false;
  const start = new Date(`${appointment.date}T${appointment.startTime}`);
  return Number.isFinite(start.getTime()) && start.getTime() <= now.getTime();
}
