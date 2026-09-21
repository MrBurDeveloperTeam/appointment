import { describe, it, expect } from 'vitest';
import { hasAppointmentPassed } from './appointmentReadOnly';
describe('hasAppointmentPassed', () => {
  const appointment = { date: '2026-09-08', startTime: '10:00:00' };
  it('locks at the scheduled start, including seconds returned by the database', () => {
    expect(hasAppointmentPassed(appointment, new Date('2026-09-08T09:59:59'))).toBe(false);
    expect(hasAppointmentPassed(appointment, new Date('2026-09-08T10:00:00'))).toBe(true);
    expect(hasAppointmentPassed(appointment, new Date('2026-09-09T09:00:00'))).toBe(true);
  });
});
