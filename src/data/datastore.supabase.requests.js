import { supabase } from "../lib/supabaseClient";

const mapRequest = (row) => ({
  id: row.id,
  clinicId: row.clinic_id,
  patientName: row.patient_name,
  phone: row.phone,
  email: row.email,
  preferredDates: row.preferred_dates || [],
  preferredTimes: row.preferred_times || [],
  notes: row.notes,
  patientIdNumber: row.patient_id_number,
  patientDob: row.patient_dob,
  patientGender: row.patient_gender,
  patientTaxNumber: row.patient_tax_number,
  patientAddress: row.patient_address,
  emergencyContactName: row.emergency_contact_name,
  emergencyContactPhone: row.emergency_contact_phone,
  allergies: row.allergies,
  medicalConditions: row.medical_conditions,
  medications: row.medications,
  source: row.source,
  preferredDentistId: row.preferred_dentist_id,
  insurance: row.insurance,
  patientNotes: row.patient_notes,
  appointmentDate: row.appointment_date,
  appointmentStartTime: row.appointment_start_time,
  appointmentDuration: row.appointment_duration,
  appointmentTreatmentId: row.appointment_treatment_id,
  appointmentNotes: row.appointment_notes,
  isNewPatient: row.is_new_patient === false ? false : true,
  lookupEmail: row.lookup_email,
  status: row.status,
  createdAt: row.created_at,
  reviewedAt: row.reviewed_at,
});

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

export async function getAppointmentRequests(clinicId) {
  const headers = await getHeaders();
  const params = new URLSearchParams({ clinicId });

  const response = await fetch(`${API_URL}/requests?${params.toString()}`, { headers });
  if (!response.ok) throw new Error(await response.text());

  const data = await response.json();
  return (data || []).map(mapRequest);
}

export async function updateAppointmentRequest(id, updates) {
  const payload = {
    ...(updates.status !== undefined ? { status: updates.status } : {}),
    ...(updates.reviewedAt !== undefined ? { reviewed_at: updates.reviewedAt } : {}),
  };

  const headers = await getHeaders();
  const response = await fetch(`${API_URL}/requests?id=${id}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(payload)
  });

  if (!response.ok) throw new Error(await response.text());

  const data = await response.json();
  return mapRequest(data);
}
