import { supabase } from "../lib/supabaseClient";

const mapPatient = (row) => ({
  ...row,
  idNumber: row.id_number,
  taxNumber: row.tax_number,
  emailIsGuardian: Boolean(row.email_is_guardian),
  guardianName: row.guardian_name || "",
  guardianRelationship: row.guardian_relationship || "",
  emergencyContactName: row.emergency_contact_name,
  emergencyContactPhone: row.emergency_contact_phone,
  medicalConditions: row.medical_conditions,
  preferredDentist: row.preferred_dentist_id,
});

/**
 * Patients (Supabase) - compatible with your current DataStore API
 * Expect clinicId to be the ACTIVE CLINIC UUID stored in localStorage.
 */

export async function getPatients(clinicId, limit = 50, offset = 0) {
  const { data, error } = await supabase
    .from("apt_patients")
    .select("*")
    .eq("clinic_id", clinicId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw error;

  return (data || []).map(mapPatient);
}

export async function addPatient(clinicId, patient) {
  const payload = {
    clinic_id: clinicId,
    name: patient.name,
    phone: patient.phone || null,
    email: patient.email
      ? patient.email.trim().toLowerCase()
      : null,
    email_is_guardian: Boolean(patient.emailIsGuardian),
    guardian_name: patient.emailIsGuardian
      ? patient.guardianName?.trim() || null
      : null,
    guardian_relationship: patient.emailIsGuardian
      ? patient.guardianRelationship || null
      : null,
    id_number: patient.idNumber || patient.id_number || null,
    address: patient.address || null,
    dob: patient.dob || null,
    gender: patient.gender || null,
    tax_number: patient.taxNumber || null,
    emergency_contact_name: patient.emergencyContactName || null,
    emergency_contact_phone: patient.emergencyContactPhone || null,
    allergies: patient.allergies || null,
    medical_conditions: patient.medicalConditions || null,
    medications: patient.medications || null,
    source: patient.source || null,
    preferred_dentist_id: patient.preferredDentist || null,
    insurance: patient.insurance || null,
    notes: patient.notes || null,
    legacy_id: patient.id || null, // optional if you are migrating legacy later
    created_by: (await supabase.auth.getUser()).data.user?.id || null,
  };

  const { data, error } = await supabase
    .from("apt_patients")
    .insert(payload)
    .select("*")
    .single();

  if (error) throw error;

  // Return in your app’s expected shape (you used idNumber camelCase)
  return mapPatient(data);
}

const duplicateKey = (patient) => {
  const idNumber = String(patient.idNumber || patient.id_number || '').replace(/[^a-z0-9]/gi, '').toLowerCase();
  if (idNumber) return `id:${idNumber}`;
  const name = String(patient.name || '').trim().replace(/\s+/g, ' ').toLowerCase();
  const dob = String(patient.dob || '');
  return name && dob ? `name-dob:${name}:${dob}` : '';
};

export async function importPatients(clinicId, patients) {
  const existing = [];
  for (let start = 0; ; start += 1000) {
    const { data, error } = await supabase.from('apt_patients').select('name,dob,id_number').eq('clinic_id', clinicId).range(start, start + 999);
    if (error) throw error;
    existing.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  const keys = new Set((existing || []).map(duplicateKey).filter(Boolean)); const accepted = []; const skipped = [];
  for (const patient of patients) {
    const key = duplicateKey(patient);
    if (key && keys.has(key)) { skipped.push({ patient, reason: 'duplicate' }); continue; }
    if (key) keys.add(key); accepted.push(patient);
  }
  const userId = (await supabase.auth.getUser()).data.user?.id || null; const created = [];
  for (let start = 0; start < accepted.length; start += 100) {
    const payload = accepted.slice(start, start + 100).map((patient) => ({
      clinic_id: clinicId, name: patient.name, phone: patient.phone || null, email: patient.email || null,
      email_is_guardian: Boolean(patient.emailIsGuardian), guardian_name: patient.emailIsGuardian ? patient.guardianName || null : null,
      guardian_relationship: patient.emailIsGuardian ? patient.guardianRelationship || null : null,
      id_number: patient.idNumber || null, address: patient.address || null, dob: patient.dob || null, gender: patient.gender || null,
      tax_number: patient.taxNumber || null, emergency_contact_name: patient.emergencyContactName || null,
      emergency_contact_phone: patient.emergencyContactPhone || null, allergies: patient.allergies || null,
      medical_conditions: patient.medicalConditions || null, medications: patient.medications || null, source: patient.source || null,
      preferred_dentist_id: patient.preferredDentist || null, insurance: patient.insurance || null, notes: patient.notes || null, created_by: userId,
    }));
    const { data, error } = await supabase.from('apt_patients').insert(payload).select('*');
    if (error) throw error; created.push(...(data || []).map(mapPatient));
  }
  return { created, skipped };
}

export async function updatePatient(patientUuid, updates) {
  const payload = {};
  if (updates.name !== undefined) payload.name = updates.name;
  if (updates.phone !== undefined) payload.phone = updates.phone || null;
  if (updates.email !== undefined) { payload.email = updates.email ? updates.email.trim().toLowerCase() : null; }
  if (updates.emailIsGuardian !== undefined) { payload.email_is_guardian = Boolean(updates.emailIsGuardian);
  if (!updates.emailIsGuardian) { payload.guardian_name = null; payload.guardian_relationship = null; } }
  if (updates.guardianName !== undefined) { payload.guardian_name = updates.emailIsGuardian === false ? null : updates.guardianName?.trim() || null; }
  if (updates.guardianRelationship !== undefined) { payload.guardian_relationship = updates.emailIsGuardian === false ? null : updates.guardianRelationship || null; }
  if (updates.idNumber !== undefined) payload.id_number = updates.idNumber || null;
  if (updates.address !== undefined) payload.address = updates.address || null;
  if (updates.dob !== undefined) payload.dob = updates.dob || null;
  if (updates.gender !== undefined) payload.gender = updates.gender || null;
  if (updates.taxNumber !== undefined) payload.tax_number = updates.taxNumber || null;
  if (updates.emergencyContactName !== undefined) payload.emergency_contact_name = updates.emergencyContactName || null;
  if (updates.emergencyContactPhone !== undefined) payload.emergency_contact_phone = updates.emergencyContactPhone || null;
  if (updates.allergies !== undefined) payload.allergies = updates.allergies || null;
  if (updates.medicalConditions !== undefined) payload.medical_conditions = updates.medicalConditions || null;
  if (updates.medications !== undefined) payload.medications = updates.medications || null;
  if (updates.source !== undefined) payload.source = updates.source || null;
  if (updates.preferredDentist !== undefined) payload.preferred_dentist_id = updates.preferredDentist || null;
  if (updates.insurance !== undefined) payload.insurance = updates.insurance || null;
  if (updates.notes !== undefined) payload.notes = updates.notes || null;

  const { data, error } = await supabase
    .from("apt_patients")
    .update(payload)
    .eq("id", patientUuid)
    .select("*")
    .single();

  if (error) throw error;

  return mapPatient(data);
}

export async function deletePatient(patientUuid) {
  const { error } = await supabase.from("apt_patients").delete().eq("id", patientUuid);
  if (error) throw error;
  return true;
}

export async function getPatientById(patientUuid) {
  const { data, error } = await supabase
    .from("apt_patients")
    .select("*")
    .eq("id", patientUuid)
    .single();

  if (error) throw error;
  return mapPatient(data);
}

/**
 * Server-side search
 */
export async function searchPatients(clinicId, query) {
  const q = (query || "").trim();
  if (!q) return getPatients(clinicId, 20, 0);

  // Note: 'or' syntax in Supabase is strictly filtered by the other chained methods.
  // We need to ensure logic is: clinic_id=ID AND (name ilike q OR ...)
  const term = `%${q}%`;
  const { data, error } = await supabase
    .from("apt_patients")
    .select("*")
    .eq("clinic_id", clinicId)
    .or(`name.ilike.${term},phone.ilike.${term},email.ilike.${term},id_number.ilike.${term},address.ilike.${term}`)
    .limit(20);

  if (error) throw error;

  return (data || []).map(mapPatient);
}
