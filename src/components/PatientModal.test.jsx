import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import PatientModal from './PatientModal';
afterEach(cleanup);
const valid = { name: 'Sarah Lim', idNumber: '001122-33-4455', dob: '2000-11-22', gender: 'female', phone: '+60 12-3456789', email: 'sarah@example.com' };
const setup = (onSave = vi.fn(), patient) => render(<PatientModal dentists={[]} patient={patient} onSave={onSave} onClose={vi.fn()} />);
it('requires all six fields and focuses the first invalid field', () => {
 const save = vi.fn(); setup(save); fireEvent.click(screen.getByText('Save'));
 expect(document.activeElement.id).toBe('patient-name');
 for (const label of ['Name *', 'IC/ID *', 'DOB *', 'Gender *', 'Phone *', 'Email *']) expect(screen.getByLabelText(label).getAttribute('aria-invalid')).toBe('true');
 expect(save).not.toHaveBeenCalled();
});
it('shows and clears errors while typing', () => {
 setup(); const name = screen.getByLabelText('Name *');
 fireEvent.change(name, { target: { value: 'Sarah123' } });
 expect(name.getAttribute('aria-invalid')).toBe('true');
 expect(screen.getByText(/Full name can only contain/)).toBeTruthy();
 fireEvent.change(name, { target: { value: 'Sarah Lim' } });
 expect(name.getAttribute('aria-invalid')).toBe('false');
 expect(screen.queryByText(/Full name can only contain/)).toBeNull();
});
it('retains entries and highlights duplicate IC after a rejected save', async () => {
 const save = vi.fn().mockRejectedValue({ code: '23505', message: 'apt_patients_clinic_normalized_ic_key' }); setup(save, valid);
 fireEvent.click(screen.getByText('Save'));
 await screen.findByText(/A patient with this IC/);
 expect(screen.getByLabelText('IC/ID *').value).toBe(valid.idNumber);
 expect(document.activeElement.id).toBe('patient-idNumber');
 fireEvent.change(screen.getByLabelText('IC/ID *'), { target: { value: '998877665544' } });
 expect(screen.queryByText(/A patient with this IC/)).toBeNull();
});
it('prevents repeat saves while pending and allows retry after failure', async () => {
 let reject; const save = vi.fn(() => new Promise((resolve, fail) => { reject = fail; })); setup(save, valid);
 fireEvent.click(screen.getByText('Save')); fireEvent.submit(document.querySelector('form'));
 expect(save).toHaveBeenCalledTimes(1);
 reject(new Error('Unable to save'));
 await screen.findByRole('alert');
 await waitFor(() => expect(screen.getByText('Save').disabled).toBe(false));
});
it('submits valid details with a normalized email', async () => {
 const save = vi.fn().mockResolvedValue(undefined); setup(save, { ...valid, email: ' SARAH@EXAMPLE.COM ' });
 fireEvent.click(screen.getByText('Save'));
 await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ email: 'sarah@example.com', idNumber: valid.idNumber })));
});
it('requires guardian details only when guardian email is selected', () => {
 const save = vi.fn(); setup(save, valid);
 fireEvent.click(screen.getByRole('checkbox'));
 fireEvent.click(screen.getByText('Save'));
 expect(screen.getByText('Enter the parent or guardian name.')).toBeTruthy();
 expect(screen.getByText('Select the guardian relationship.')).toBeTruthy();
 expect(save).not.toHaveBeenCalled();
});
