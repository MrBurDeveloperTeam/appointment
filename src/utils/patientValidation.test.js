import { expect, it } from 'vitest';
import { validatePatient, normalizePatientIdNumber } from './patientValidation';
const valid = { name: "Sarah O'Lim", idNumber: '001122-33-4455', dob: '2000-11-22', gender: 'female', phone: '+60 (12) 345-6789', email: 'sarah@example.com' };
it('accepts charting-compatible values and normalizes IC punctuation', () => {
 expect(validatePatient(valid)).toEqual({}); expect(normalizePatientIdNumber(valid.idNumber)).toBe('001122334455');
});
it.each(['name', 'idNumber', 'dob', 'gender', 'phone', 'email'])('requires %s', key => expect(validatePatient({ ...valid, [key]: '' })[key]).toBeTruthy());
it.each([['name','Sarah123'],['idNumber','ABC123'],['phone','call123'],['email','bad@'],['dob','2000-02-31'],['dob','2999-01-01']])('rejects invalid %s', (key,value) => expect(validatePatient({ ...valid,[key]: value })[key]).toBeTruthy());
