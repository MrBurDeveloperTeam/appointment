import { describe, expect, it } from 'vitest';
import { mapPatientRows, normalizeDate, suggestPatientMapping } from './patientImport';

describe('patient import mapping', () => {
  it('recognizes common clinic column names', () => {
    expect(suggestPatientMapping(['Full Name', 'Mobile No', 'NRIC', 'Birth Date'])).toMatchObject({
      name: 'Full Name', phone: 'Mobile No', idNumber: 'NRIC', dob: 'Birth Date',
    });
  });

  it('normalizes Excel serial and day-first dates', () => {
    expect(normalizeDate('01/09/1990')).toBe('1990-09-01');
    expect(normalizeDate('2')).toBe('1900-01-01');
  });

  it('validates required data and resolves dentist names', () => {
    const rows = mapPatientRows(
      [{ Patient: 'Aisha Lee', Mobile: '0123456789', Dentist: 'Dr Tan', Sex: 'F' }],
      { name: 'Patient', phone: 'Mobile', preferredDentist: 'Dentist', gender: 'Sex' },
      [{ id: 'dentist-1', name: 'Dr Tan' }],
    );
    expect(rows[0].errors).toEqual([]);
    expect(rows[0].patient).toMatchObject({ name: 'Aisha Lee', phone: '0123456789', preferredDentist: 'dentist-1', gender: 'female' });
  });
});
