import { supabase } from "../lib/supabaseClient";

const mapHoliday = (row) => ({
  id: row.id,
  name: row.name,
  startDate: row.start_date,
  endDate: row.end_date || row.start_date,
  type: row.type || "public",
  isPublic: row.is_public || false,
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

export async function getHolidays(clinicId) {
  const headers = await getHeaders();
  const params = new URLSearchParams({ clinicId });

  const response = await fetch(`${API_URL}/holidays?${params.toString()}`, { headers });
  if (!response.ok) throw new Error(await response.text());

  const data = await response.json();
  return (data || []).map(mapHoliday);
}

export async function addHoliday(clinicId, holiday) {
  const payload = {
    clinic_id: clinicId,
    name: holiday.name,
    start_date: holiday.startDate,
    end_date: holiday.endDate || holiday.startDate,
    type: holiday.type || "public",
    is_public: holiday.isPublic || false,
  };

  const headers = await getHeaders();
  const response = await fetch(`${API_URL}/holidays`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload)
  });

  if (!response.ok) throw new Error(await response.text());

  const data = await response.json();
  return mapHoliday(data);
}

export async function updateHoliday(id, updates) {
  const payload = {
    ...(updates.name !== undefined ? { name: updates.name } : {}),
    ...(updates.startDate !== undefined ? { start_date: updates.startDate } : {}),
    ...(updates.endDate !== undefined ? { end_date: updates.endDate || updates.startDate } : {}),
    ...(updates.type !== undefined ? { type: updates.type } : {}),
    ...(updates.isPublic !== undefined ? { is_public: updates.isPublic } : {}),
  };

  const headers = await getHeaders();
  const response = await fetch(`${API_URL}/holidays?id=${id}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(payload)
  });

  if (!response.ok) throw new Error(await response.text());

  const data = await response.json();
  return mapHoliday(data);
}

export async function deleteHoliday(id) {
  const headers = await getHeaders();
  const response = await fetch(`${API_URL}/holidays?id=${id}`, {
    method: "DELETE",
    headers
  });

  if (!response.ok) throw new Error(await response.text());
  return true;
}
