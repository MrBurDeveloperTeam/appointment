import { describe, expect, it } from 'vitest';
import { mapPatientRows, normalizeDate, readPatientFile, suggestNameOrder, suggestPatientMapping } from './patientImport';

describe('patient import mapping', () => {
  it('recognizes common clinic column names', () => {
    expect(suggestPatientMapping(['Full Name', 'Mobile No', 'NRIC', 'Birth Date'])).toMatchObject({
      name: 'Full Name', phone: ['Mobile No'], idNumber: ['NRIC'], dob: ['Birth Date'],
    });
  });

  it('keeps separate name columns separate from a full name', () => {
    expect(suggestPatientMapping(['First Name', 'Last Name', 'Nickname', 'Mobile'])).toMatchObject({
      name: '', firstName: 'First Name', lastName: 'Last Name', nickname: 'Nickname', phone: ['Mobile'],
    });
  });

  it('composes name parts in the chosen order and preserves nickname in notes', () => {
    const [row] = mapPatientRows(
      [{ Prefix: 'Dr', Given: 'Mei Ling', Family: 'Tan', Nick: 'May', Mobile: '0123456789', Memo: 'VIP' }],
      { title: 'Prefix', firstName: 'Given', lastName: 'Family', nickname: 'Nick', phone: 'Mobile', notes: 'Memo' },
      [], 'family-given',
    );
    expect(row.patient.name).toBe('Dr Tan Mei Ling');
    expect(row.patient.notes).toBe('VIP\nPreferred name: May');
  });

  it('detects family-name-first source order', () => {
    expect(suggestNameOrder(['Surname', 'Given Name', 'Mobile'])).toBe('family-given');
  });

  it('finds a header below title rows and reads semicolon CSV exports', async () => {
    const csv = 'Clinic patient export\r\nGenerated today\r\nGiven Name;Surname;Mobile No\r\nAisha;Tan;0123456789';
    const file = { name: 'patients.csv', text: async () => csv };
    const parsed = await readPatientFile(file);
    expect(parsed.headers).toEqual(['Given Name', 'Surname', 'Mobile No']);
    expect(parsed.rows[0]).toMatchObject({ 'Given Name': 'Aisha', Surname: 'Tan', 'Mobile No': '0123456789' });
  });

  it('combines address and clinical columns while preserving secondary contacts', () => {
    const [row] = mapPatientRows(
      [{ Name: 'Aisha Tan', Mobile: '0111', Work: '0222', Personal: 'a@example.test', Office: 'work@example.test', Street: '1 Clinic Road', City: 'KL', Allergy1: 'Latex', Allergy2: 'Penicillin' }],
      { name: 'Name', phone: ['Mobile', 'Work'], email: ['Personal', 'Office'], address: ['Street', 'City'], allergies: ['Allergy1', 'Allergy2'] },
    );
    expect(row.patient).toMatchObject({ phone: '0111', email: 'a@example.test', address: '1 Clinic Road, KL', allergies: 'Latex; Penicillin' });
    expect(row.patient.notes).toContain('Additional phone: 0222');
    expect(row.patient.notes).toContain('Additional email: work@example.test');
  });

  it('builds a date from separate day, month, and year columns', () => {
    const [row] = mapPatientRows([{ Name: 'Daniel Lim', Phone: '0111', Day: '9', Month: '12', Year: '1988' }], { name: 'Name', phone: ['Phone'], dobDay: ['Day'], dobMonth: ['Month'], dobYear: ['Year'] });
    expect(row.patient.dob).toBe('1988-12-09');
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
