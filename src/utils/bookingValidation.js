import { todayISO } from './date';

export const sanitizeIC = (value) => (value || '').replace(/\D/g, '').slice(0, 12);

export const sanitizePhone = (value) => (value || '').replace(/[^0-9+ ]/g, '');

export const sanitizeName = (value) => (value || '').replace(/[^\p{L} '-]/gu, '');

export const REQUIRED_NEW_PATIENT_FIELDS = [
  'name',
  'idNumber',
  'dob',
  'gender',
  'phone',
  'email',
  'address',
  'emergencyContactName',
  'emergencyContactPhone',
  'source',
  'preferredDentist',
];

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const NAME_RE = /^[\p{L} '-]+$/u;
const digitsOnly = (value) => (value || '').replace(/\D/g, '');

export function validateNewPatient(patient) {
  const p = patient || {};
  const fieldErrors = {};
  const val = (k) => (p[k] == null ? '' : String(p[k]).trim());

  for (const field of REQUIRED_NEW_PATIENT_FIELDS) {
    if (!val(field)) fieldErrors[field] = 'This field is required.';
  }

  if (val('name') && !NAME_RE.test(val('name'))) {
    fieldErrors.name = 'Name may only contain letters, spaces, hyphens and apostrophes.';
  }
  if (val('idNumber') && digitsOnly(val('idNumber')).length !== 12) {
    fieldErrors.idNumber = 'IC/ID must be exactly 12 digits.';
  }
  for (const phoneField of ['phone', 'emergencyContactPhone']) {
    if (val(phoneField) && digitsOnly(val(phoneField)).length < 7) {
      fieldErrors[phoneField] = 'Enter a valid phone number.';
    }
  }
  if (val('email') && !EMAIL_RE.test(val('email'))) {
    fieldErrors.email = 'Enter a valid email address.';
  }
  if (val('dob') && val('dob') > todayISO()) {
    fieldErrors.dob = 'Date of birth cannot be in the future.';
  }

  return { ok: Object.keys(fieldErrors).length === 0, fieldErrors };
}
