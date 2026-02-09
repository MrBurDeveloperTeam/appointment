import { supabase } from "../lib/supabaseClient";

/**
 * Patients (Supabase) - compatible with your current DataStore API
 * Expect clinicId to be the ACTIVE CLINIC UUID stored in localStorage.
 */

// Assuming your Worker is deployed at this URL
const API_URL = "https://sso.mrburstudio.com/api";

// Helper to get headers
async function getHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error("No active session");
  return {
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json"
  };
}

export async function getPatients(clinicId, limit = 50, offset = 0) {
  const headers = await getHeaders();
  const params = new URLSearchParams({ clinicId, limit, offset });

  const response = await fetch(`${API_URL}/patients?${params.toString()}`, { headers });
  if (!response.ok) throw new Error(await response.text());

  const data = await response.json();
  return (data || []).map(p => ({
    ...p,
    idNumber: p.id_number,
    taxNumber: p.tax_number,
    emergencyContactName: p.emergency_contact_name,
    emergencyContactPhone: p.emergency_contact_phone,
    medicalConditions: p.medical_conditions,
    preferredDentist: p.preferred_dentist_id,
  }));
}

export async function addPatient(clinicId, patient) {
  const payload = {
    clinic_id: clinicId,
    name: patient.name,
    phone: patient.phone || null,
    email: patient.email || null,
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
    legacy_id: patient.id || null,
    created_by: (await supabase.auth.getUser()).data.user?.id || null,
  };

  const headers = await getHeaders();
  const response = await fetch(`${API_URL}/patients`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload)
  });

  if (!response.ok) throw new Error(await response.text());

  // Worker might verify/insert and return, for now we map input payload + temp ID
  // In production, best to use the actual response from worker if it returns the row
  const data = await response.json(); // Assuming worker returns the created object

  return {
    ...data, // Use real data from server if available, or fallback to payload
    idNumber: data.id_number || payload.id_number,
    taxNumber: data.tax_number || payload.tax_number,
    emergencyContactName: data.emergency_contact_name || payload.emergency_contact_name,
    emergencyContactPhone: data.emergency_contact_phone || payload.emergency_contact_phone,
    medicalConditions: data.medical_conditions || payload.medical_conditions,
    preferredDentist: data.preferred_dentist_id || payload.preferred_dentist_id,
  };
}

export async function updatePatient(patientUuid, updates) {
  const payload = {};
  if (updates.name !== undefined) payload.name = updates.name;
  if (updates.phone !== undefined) payload.phone = updates.phone;
  if (updates.email !== undefined) payload.email = updates.email;
  if (updates.idNumber !== undefined) payload.id_number = updates.idNumber;
  if (updates.address !== undefined) payload.address = updates.address;
  if (updates.dob !== undefined) payload.dob = updates.dob;
  if (updates.gender !== undefined) payload.gender = updates.gender;
  if (updates.taxNumber !== undefined) payload.tax_number = updates.taxNumber;
  if (updates.emergencyContactName !== undefined) payload.emergency_contact_name = updates.emergencyContactName;
  if (updates.emergencyContactPhone !== undefined) payload.emergency_contact_phone = updates.emergencyContactPhone;
  if (updates.allergies !== undefined) payload.allergies = updates.allergies;
  if (updates.medicalConditions !== undefined) payload.medical_conditions = updates.medicalConditions;
  if (updates.medications !== undefined) payload.medications = updates.medications;
  if (updates.source !== undefined) payload.source = updates.source;
  if (updates.preferredDentist !== undefined) payload.preferred_dentist_id = updates.preferredDentist || null;
  if (updates.insurance !== undefined) payload.insurance = updates.insurance;
  if (updates.notes !== undefined) payload.notes = updates.notes;

  const headers = await getHeaders();
  const response = await fetch(`${API_URL}/patients?id=${patientUuid}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(payload)
  });

  if (!response.ok) throw new Error(await response.text());
  const data = await response.json();

  return {
    ...data,
    idNumber: data.id_number,
    taxNumber: data.tax_number,
    emergencyContactName: data.emergency_contact_name,
    emergencyContactPhone: data.emergency_contact_phone,
    medicalConditions: data.medical_conditions,
    preferredDentist: data.preferred_dentist_id,
  };
}

export async function deletePatient(patientUuid) {
  const headers = await getHeaders();
  const response = await fetch(`${API_URL}/patients?id=${patientUuid}`, {
    method: "DELETE",
    headers
  });
  if (!response.ok) throw new Error(await response.text());
  return true;
}

export async function getPatientById(patientUuid) {
  // Can be implemented as a search or a specific endpoint if needed.
  // For now, if we don't have a direct "get by id" in worker, we might need to add it 
  // OR use search with ID.
  // Ideally, add `if (request.method === "GET" && url.searchParams.get("id"))` to worker.
  // Assuming we add that or use existing detail logic if easy. 
  // Let's assume we can fetch list using ID filter?
  // Current worker `getPatients` filters by clinic. 
  // Let's assume we implement a specific ID fetch or reusing `searchPatients` is risky if not by ID.
  // Simplest: Request the user to add ID support to getPatients or a specific route.
  // FOR NOW: I'll use the search endpoint filtering by ID if supported, or just keep it simple.

  // NOTE: For migration safety, I will temporarily leave this function using Supabase directly 
  // UNLESS we update the worker to support single fetch. 
  // Actually, let's keep it safe:
  const { data, error } = await supabase
    .from("apt_patients")
    .select("*")
    .eq("id", patientUuid)
    .single();

  if (error) throw error;
  return {
    ...data,
    idNumber: data.id_number,
    taxNumber: data.tax_number,
    emergencyContactName: data.emergency_contact_name,
    emergencyContactPhone: data.emergency_contact_phone,
    medicalConditions: data.medical_conditions,
    preferredDentist: data.preferred_dentist_id,
  };
}

export async function searchPatients(clinicId, query) {
  const headers = await getHeaders();
  const params = new URLSearchParams({ clinicId, query });

  const response = await fetch(`${API_URL}/patients?${params.toString()}`, { headers });
  if (!response.ok) throw new Error(await response.text());

  const data = await response.json();
  return (data || []).map(p => ({
    ...p,
    idNumber: p.id_number,
    taxNumber: p.tax_number,
    emergencyContactName: p.emergency_contact_name,
    emergencyContactPhone: p.emergency_contact_phone,
    medicalConditions: p.medical_conditions,
    preferredDentist: p.preferred_dentist_id,
  }));
}
