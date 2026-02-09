import { supabase } from "../lib/supabaseClient";

const mapAppointment = (row) => ({
  id: row.id,
  clinicId: row.clinic_id,
  patientId: row.patient_id,
  dentistId: row.dentist_id,
  roomId: row.room_id,
  treatmentId: row.treatment_id,
  date: row.date,
  startTime: row.start_time,
  endTime: row.end_time,
  duration: row.duration,
  status: row.status,
  notes: row.notes,
  createdAt: row.created_at,
});

// Assuming your Worker is deployed at this URL (Update if different)
const API_URL = "https://sso.mrburstudio.com/api"; // Or your specific worker URL

export async function getAppointments(clinicId, startDate, endDate) {
  // 1. Get the current session token
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;

  if (!token) throw new Error("No active session");

  // 2. Build URL with query params
  const params = new URLSearchParams({ clinicId });
  // Note: The Worker needs to support startDate/endDate if you want to filter there.
  // For now, we fetch all by clinicId (as per the Worker code) and filter locally if needed,
  // OR update the Worker to accept these params.
  // Based on current Worker plan, we only implemented clinicId.

  const response = await fetch(`${API_URL}/appointments?${params.toString()}`, {
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    }
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`API Error: ${response.status} - ${errorBody}`);
  }

  const data = await response.json();

  // 3. Map and Filter (Client-side filtering for dates since Worker implementation is basic for now)
  let appointments = (data || []).map(mapAppointment);

  if (startDate) {
    appointments = appointments.filter(a => a.date >= startDate);
  }
  if (endDate) {
    appointments = appointments.filter(a => a.date <= endDate);
  }

  return appointments;
}

export async function addAppointment(clinicId, appointment) {
  // 1. Prepare Payload (Map to Snake Case for DB)
  const payload = {
    clinic_id: clinicId,
    patient_id: appointment.patientId || null,
    dentist_id: appointment.dentistId || null,
    room_id: appointment.roomId || null,
    treatment_id: appointment.treatmentId || null,
    date: appointment.date,
    start_time: appointment.startTime,
    end_time: appointment.endTime || null,
    duration: appointment.duration || null,
    status: appointment.status || "confirmed",
    notes: appointment.notes || null,
  };

  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;

  // 2. POST to Worker
  const response = await fetch(`${API_URL}/appointments`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) throw new Error(await response.text());

  // 3. Return mapped object
  // Note: Worker might verify and return full object. 
  // Ideally, we treat payload as truth or use response.
  return mapAppointment({ ...payload, id: "temp-id" }); // Re-fetch recommended in real app
}

export async function updateAppointment(id, updates) {
  // 1. Map updates to snake_case
  const payload = {
    ...(updates.patientId !== undefined ? { patient_id: updates.patientId || null } : {}),
    ...(updates.dentistId !== undefined ? { dentist_id: updates.dentistId || null } : {}),
    ...(updates.roomId !== undefined ? { room_id: updates.roomId || null } : {}),
    ...(updates.treatmentId !== undefined ? { treatment_id: updates.treatmentId || null } : {}),
    ...(updates.date !== undefined ? { date: updates.date } : {}),
    ...(updates.startTime !== undefined ? { start_time: updates.startTime } : {}),
    ...(updates.endTime !== undefined ? { end_time: updates.endTime || null } : {}),
    ...(updates.duration !== undefined ? { duration: updates.duration } : {}),
    ...(updates.status !== undefined ? { status: updates.status } : {}),
    ...(updates.notes !== undefined ? { notes: updates.notes } : {}),
  };

  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;

  // 2. PATCH to Worker
  const response = await fetch(`${API_URL}/appointments?id=${id}`, {
    method: "PATCH",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) throw new Error(await response.text());
  const data = await response.json();
  return mapAppointment(data);
}

export async function deleteAppointment(id) {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;

  const response = await fetch(`${API_URL}/appointments?id=${id}`, {
    method: "DELETE",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    }
  });

  if (!response.ok) throw new Error(await response.text());
  return true;
}
