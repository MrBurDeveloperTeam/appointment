const personNamePattern = /^[\p{L}\p{M}]+(?:[ '\u2019-][\p{L}\p{M}]+)*$/u;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normalizePatientIdNumber(value) {
  return String(value ?? "").replace(/\D/g, "");
}

export function validatePatient(input) {
  const errors = {};
  const name = String(input.name ?? "").trim();
  const dob = String(input.dob ?? "").trim();
  const idNumber = String(input.idNumber ?? "").trim();
  const gender = String(input.gender ?? "").trim();
  const phone = String(input.phone ?? "").trim();
  const email = String(input.email ?? "").trim();

  if (!name) errors.name = "Enter the patient's full name.";
  else if (!personNamePattern.test(name)) errors.name = "Full name can only contain letters, spaces, apostrophes, or hyphens.";

  if (!dob) errors.dob = "Enter the patient's date of birth.";
  else {
    const match = dob.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const date = match ? new Date(`${dob}T00:00:00`) : null;
    if (!match || !date || Number.isNaN(date.getTime()) ||
        date.getFullYear() !== Number(match[1]) || date.getMonth() + 1 !== Number(match[2]) || date.getDate() !== Number(match[3])) {
      errors.dob = "Enter a valid date of birth.";
    } else if (dob > new Date().toISOString().slice(0, 10)) {
      errors.dob = "Date of birth cannot be later than today.";
    }
  }

  if (!idNumber) errors.idNumber = "Enter the patient's IC / ID number.";
  else if (/[A-Za-z]/.test(idNumber) || !/\d/.test(idNumber)) errors.idNumber = "IC / ID number can contain numbers and symbols, but no letters.";

  if (!gender) errors.gender = "Select the patient's gender.";
  if (!phone) errors.phone = "Enter the patient's phone number.";
  else if (/[A-Za-z]/.test(phone) || !/\d/.test(phone)) errors.phone = "Phone number can contain numbers and phone symbols, but no letters.";

  if (!email) errors.email = "Enter the patient's email address.";
  else if (!emailPattern.test(email)) errors.email = "Enter a valid email address, for example name@example.com.";
  if (input.emailIsGuardian) {
    if (!String(input.guardianName || '').trim()) errors.guardianName = 'Enter the parent or guardian name.';
    if (!input.guardianRelationship) errors.guardianRelationship = 'Select the guardian relationship.';
  }
  return errors;
}
