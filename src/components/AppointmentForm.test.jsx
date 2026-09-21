import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import AppointmentForm from './AppointmentForm';
vi.mock('../context/ToastProvider', () => ({ useToast: () => ({ addToast: vi.fn() }) }));
const props = {
  patients: [{ id: 'p', name: 'Patient' }], rooms: [], treatments: [], dentists: [],
  appointments: [], onSave: vi.fn(), onDelete: vi.fn(), onClose: vi.fn(), credits: 10,
  initialData: { id: 'a', patientId: 'p', date: '2026-09-08', startTime: '10:00', duration: 30, notes: 'Original' },
};
afterEach(() => { cleanup(); vi.useRealTimers(); vi.clearAllMocks(); });
describe('past appointment details', () => {
  it('disables fields and removes save/delete while allowing close', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-08T10:01:00'));
    const { container } = render(<AppointmentForm {...props} />);
    expect(screen.getByText('Appointment Details')).toBeTruthy();
    expect(container.querySelector('fieldset').disabled).toBe(true);
    expect(screen.queryByText('Save Appointment')).toBeNull();
    expect(screen.queryByText('Delete')).toBeNull();
    fireEvent.submit(container.querySelector('form'));
    expect(props.onSave).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Close'));
    expect(props.onClose).toHaveBeenCalled();
  });
  it('locks an open form using the original time even after rescheduling the draft', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-08T09:59:59'));
    const { container } = render(<AppointmentForm {...props} />);
    expect(screen.getByText('Save Appointment')).toBeTruthy();
    fireEvent.change(container.querySelector('input[type="date"]'), { target: { value: '2026-09-09' } });
    act(() => vi.advanceTimersByTime(1000));
    expect(container.querySelector('fieldset').disabled).toBe(true);
    expect(screen.queryByText('Save Appointment')).toBeNull();
  });
});
