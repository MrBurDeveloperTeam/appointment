import { describe, it, expect } from 'vitest';
import {
  sanitizeIC,
  sanitizePhone,
  sanitizeName,
  validateNewPatient,
  REQUIRED_NEW_PATIENT_FIELDS,
} from './bookingValidation';

const validPatient = {
  name: 'Jane Doe',
  idNumber: '900101145678',
  dob: '1990-01-01',
  gender: 'female',
  phone: '+60 12 345 6789',
  email: 'jane@example.com',
  address: '12 Jalan Besar',
  emergencyContactName: 'John Doe',
  emergencyContactPhone: '0123456789',
  source: 'google',
  preferredDentist: 'dentist-uuid-1',
  taxNumber: '',
  allergies: '',
  medicalConditions: '',
  medications: '',
  insurance: '',
  notes: '',
};

describe('sanitizers', () => {
  it('sanitizeIC strips letters and caps at 12 digits', () => {
    expect(sanitizeIC('90a01-01b145678999')).toBe('900101145678');
  });
  it('sanitizePhone keeps digits plus and spaces only', () => {
    expect(sanitizePhone('+60 12-(345)')).toBe('+60 12345');
  });
  it('sanitizeName strips digits and symbols', () => {
    expect(sanitizeName("Anne-Marie O'Neil 3!")).toBe("Anne-Marie O'Neil ");
  });
});

describe('validateNewPatient', () => {
  it('passes a fully valid patient', () => {
    const { ok, fieldErrors } = validateNewPatient(validPatient);
    expect(ok).toBe(true);
    expect(fieldErrors).toEqual({});
  });

  it('flags every empty required field', () => {
    const { ok, fieldErrors } = validateNewPatient({});
    expect(ok).toBe(false);
    for (const f of REQUIRED_NEW_PATIENT_FIELDS) {
      expect(fieldErrors[f]).toBeTruthy();
    }
  });

  it('rejects IC that is not exactly 12 digits', () => {
    expect(validateNewPatient({ ...validPatient, idNumber: '12345' }).fieldErrors.idNumber).toBeTruthy();
    expect(validateNewPatient({ ...validPatient, idNumber: '9001011456789' }).fieldErrors.idNumber).toBeTruthy();
  });

  it('rejects phone shorter than 7 digits', () => {
    expect(validateNewPatient({ ...validPatient, phone: '12345' }).fieldErrors.phone).toBeTruthy();
  });

  it('rejects invalid email', () => {
    expect(validateNewPatient({ ...validPatient, email: 'not-an-email' }).fieldErrors.email).toBeTruthy();
  });

  it('rejects a future DOB', () => {
    expect(validateNewPatient({ ...validPatient, dob: '3000-01-01' }).fieldErrors.dob).toBeTruthy();
  });

  it('rejects a name containing digits', () => {
    expect(validateNewPatient({ ...validPatient, name: 'Jane3' }).fieldErrors.name).toBeTruthy();
  });

  it('allows optional fields to be empty', () => {
    const { ok } = validateNewPatient({ ...validPatient, taxNumber: '', insurance: '', notes: '' });
    expect(ok).toBe(true);
  });
});
