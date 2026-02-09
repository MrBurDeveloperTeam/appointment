import { supabase } from "../lib/supabaseClient";

const mapActivity = (row) => ({
  id: row.id,
  type: row.type,
  description: row.description,
  timestamp: row.created_at,
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

export async function getActivityLog(clinicId) {
  const headers = await getHeaders();
  const params = new URLSearchParams({ clinicId });

  const response = await fetch(`${API_URL}/activity?${params.toString()}`, { headers });
  if (!response.ok) throw new Error(await response.text());

  const data = await response.json();
  return (data || []).map(mapActivity);
}

export async function addActivityLog(clinicId, entry) {
  const payload = {
    clinic_id: clinicId,
    type: entry.type,
    description: entry.description,
  };

  const headers = await getHeaders();
  const response = await fetch(`${API_URL}/activity`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload)
  });

  if (!response.ok) throw new Error(await response.text());

  const data = await response.json();
  return mapActivity(data);
}

export async function getAdminActivity() {
  const headers = await getHeaders();
  // Pass explicit clinicId=admin (or rely on missing param logic, handled by worker)
  // Let's passed 'admin' to be explicit if our worker handles it, or just empty.
  // My worker logic: if (clinicId === "admin" || !clinicId) { filters.clinic_id = "is.null"; }
  // So omitting is fine, but passing 'admin' is clearer if we want to differentiate.

  const response = await fetch(`${API_URL}/activity?clinicId=admin`, { headers });
  if (!response.ok) throw new Error(await response.text());

  const data = await response.json();
  return (data || []).map(mapActivity);
}

export async function addAdminActivity(entry) {
  const payload = {
    clinic_id: null,
    type: entry.type,
    description: entry.description,
  };

  const headers = await getHeaders();
  const response = await fetch(`${API_URL}/activity`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload)
  });

  if (!response.ok) throw new Error(await response.text());

  const data = await response.json();
  return mapActivity(data);
}
