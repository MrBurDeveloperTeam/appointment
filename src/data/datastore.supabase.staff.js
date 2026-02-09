import { supabase } from "../lib/supabaseClient";

const mapStaff = (row) => ({
  id: row.id,
  role: row.role,
  name: row.name,
  phone: row.phone || "",
  color: row.color || "",
  specialty: row.specialty || "",
  workingDays: row.working_days || [],
  startTime: row.start_time || "",
  endTime: row.end_time || "",
  assignedTo: row.assigned_to || "",
  createdAt: row.created_at,
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

export async function getStaff(clinicId) {
  const headers = await getHeaders();
  const params = new URLSearchParams({ clinicId });

  const response = await fetch(`${API_URL}/staff?${params.toString()}`, { headers });
  if (!response.ok) throw new Error(await response.text());

  const data = await response.json();
  return (data || []).map(mapStaff);
}

export async function addStaff(clinicId, staffMember) {
  const payload = {
    clinic_id: clinicId,
    role: staffMember.role,
    name: staffMember.name,
    phone: staffMember.phone || null,
    color: staffMember.color || null,
    specialty: staffMember.specialty || null,
    working_days: staffMember.workingDays || [],
    start_time: staffMember.startTime || null,
    end_time: staffMember.endTime || null,
    assigned_to: staffMember.assignedTo || null,
  };

  const headers = await getHeaders();
  const response = await fetch(`${API_URL}/staff`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload)
  });

  if (!response.ok) throw new Error(await response.text());

  const data = await response.json();
  return mapStaff(data);
}

export async function updateStaff(id, updates) {
  const payload = {
    ...(updates.role !== undefined ? { role: updates.role } : {}),
    ...(updates.name !== undefined ? { name: updates.name } : {}),
    ...(updates.phone !== undefined ? { phone: updates.phone } : {}),
    ...(updates.color !== undefined ? { color: updates.color } : {}),
    ...(updates.specialty !== undefined ? { specialty: updates.specialty } : {}),
    ...(updates.workingDays !== undefined ? { working_days: updates.workingDays } : {}),
    ...(updates.startTime !== undefined ? { start_time: updates.startTime } : {}),
    ...(updates.endTime !== undefined ? { end_time: updates.endTime } : {}),
    ...(updates.assignedTo !== undefined ? { assigned_to: updates.assignedTo || null } : {}),
  };

  const headers = await getHeaders();
  const response = await fetch(`${API_URL}/staff?id=${id}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(payload)
  });

  if (!response.ok) throw new Error(await response.text());

  const data = await response.json();
  return mapStaff(data);
}

export async function deleteStaff(id) {
  const headers = await getHeaders();
  const response = await fetch(`${API_URL}/staff?id=${id}`, {
    method: "DELETE",
    headers
  });

  if (!response.ok) throw new Error(await response.text());
  return true;
}
