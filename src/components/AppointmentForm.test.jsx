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

describe('flagged patient indicator', () => {
  it('shows a red flag for a flagged selected patient and picker row only', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-08T09:00:00'));
    render(
      <AppointmentForm
        {...props}
        initialData={{ ...props.initialData, id: null, date: '2026-09-09' }}
        patients={[
          { id: 'p', name: 'Patient', is_flagged: true },
          { id: 'safe', name: 'Safe Patient', is_flagged: false },
        ]}
      />
    );

    expect(screen.getAllByLabelText('Flagged patient')).toHaveLength(1);
    fireEvent.click(screen.getByText('Change'));
    expect(screen.getAllByLabelText('Flagged patient')).toHaveLength(2);
  });
});

describe('save error message', () => {
  const newProps = (over = {}) => ({
    ...props,
    patients: [{ id: 'p', name: 'Patient' }],
    initialData: { date: '2026-12-01', startTime: '10:00', duration: 30 },
    ...over,
  });
  const submit = async (container) => {
    await act(async () => { fireEvent.submit(container.querySelector('form')); });
  };

  it('tells the user why a save is blocked instead of failing silently', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-08T09:00:00'));
    const { container } = render(<AppointmentForm {...newProps({ patients: [] })} />);
    await submit(container);
    expect(screen.getByRole('alert').textContent).toContain('Please select a patient.');
    expect(props.onSave).not.toHaveBeenCalled();
  });

  it('shows a readable message inside the modal when the server rejects the save', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-08T09:00:00'));
    const onSave = vi.fn().mockRejectedValue(new Error('Failed to fetch'));
    const { container } = render(<AppointmentForm {...newProps({ onSave })} />);
    await submit(container);
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('alert').textContent).toContain('Could not reach the server');
    expect(props.onClose).not.toHaveBeenCalled();
    // Save button is usable again so the user can retry.
    expect(screen.getByText('Create Appointment').disabled).toBe(false);
  });

  it('maps a database overlap rejection to a clear message', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-08T09:00:00'));
    const onSave = vi.fn().mockRejectedValue(new Error('conflicting key value violates exclusion constraint "appointments_no_overlap"'));
    const { container } = render(<AppointmentForm {...newProps({ onSave })} />);
    await submit(container);
    expect(screen.getByRole('alert').textContent).toContain('This time slot was just taken');
  });

  it('clears the message when the user edits the form or dismisses it', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-08T09:00:00'));
    const { container } = render(<AppointmentForm {...newProps({ patients: [] })} />);
    await submit(container);
    expect(screen.getByRole('alert')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Dismiss message'));
    expect(screen.queryByRole('alert')).toBeNull();
    await submit(container);
    expect(screen.getByRole('alert')).toBeTruthy();
    fireEvent.change(container.querySelector('textarea'), { target: { value: 'x' } });
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
