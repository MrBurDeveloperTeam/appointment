import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import CalendarView from './CalendarView';

afterEach(cleanup);

describe('calendar patient flag', () => {
  it("renders a flagged patient's icon between the appointment time and name", () => {
    const { container } = render(
      <CalendarView
        currentDate={new Date(2026, 8, 1)}
        setCurrentDate={() => {}}
        calendarView="month"
        setCalendarView={() => {}}
        appointments={[{ id: 'a', patientId: 7, date: '2026-09-08', startTime: '15:15', status: 'confirmed' }]}
        patients={[{ id: '7', name: 'Flagged Patient', is_flagged: true }]}
        rooms={[]}
        treatments={[]}
        staff={[]}
        holidays={[]}
        settings={{ workingHours: { start: '09:00', end: '18:00' } }}
      />
    );

    const appointment = container.querySelector('.day-appointment');
    expect(screen.getByLabelText('Flagged patient')).toBeTruthy();
    expect(appointment.children[1].classList.contains('day-appointment-time')).toBe(true);
    expect(appointment.children[2].getAttribute('aria-label')).toBe('Flagged patient');
    expect(appointment.children[3].classList.contains('day-appointment-title')).toBe(true);
  });
});
