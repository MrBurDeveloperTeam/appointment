import { supabase } from "../lib/supabaseClient";

const mapRoom = (row) => ({
  id: row.id,
  name: row.name,
  color: row.color || "",
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

export async function getRooms(clinicId) {
  const headers = await getHeaders();
  const params = new URLSearchParams({ clinicId });

  const response = await fetch(`${API_URL}/rooms?${params.toString()}`, { headers });
  if (!response.ok) throw new Error(await response.text());

  const data = await response.json();
  return (data || []).map(mapRoom);
}

export async function addRoom(clinicId, room) {
  const payload = {
    clinic_id: clinicId,
    name: room.name,
    color: room.color || null,
  };

  const headers = await getHeaders();
  const response = await fetch(`${API_URL}/rooms`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload)
  });

  if (!response.ok) throw new Error(await response.text());

  const data = await response.json();
  return mapRoom(data);
}

export async function updateRoom(id, updates) {
  const payload = {
    ...(updates.name !== undefined ? { name: updates.name } : {}),
    ...(updates.color !== undefined ? { color: updates.color } : {}),
  };

  const headers = await getHeaders();
  const response = await fetch(`${API_URL}/rooms?id=${id}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(payload)
  });

  if (!response.ok) throw new Error(await response.text());

  const data = await response.json();
  return mapRoom(data);
}

export async function deleteRoom(id) {
  const headers = await getHeaders();
  const response = await fetch(`${API_URL}/rooms?id=${id}`, {
    method: "DELETE",
    headers
  });

  if (!response.ok) throw new Error(await response.text());
  return true;
}
