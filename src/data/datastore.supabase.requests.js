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
  requestedDentistId: row.requested_dentist_id,
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

export async function getAppointmentRequests(clinicId) {
  const { data, error } = await supabase
    .from("appointment_requests")
    .select("*")
    .eq("clinic_id", clinicId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data || []).map(mapRequest);
}

export async function updateAppointmentRequest(id, updates) {
  const payload = {
    ...(updates.status !== undefined ? { status: updates.status } : {}),
    ...(updates.reviewedAt !== undefined ? { reviewed_at: updates.reviewedAt } : {}),
  };
  const { data, error } = await supabase
    .from("appointment_requests")
    .update(payload)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return mapRequest(data);
}
