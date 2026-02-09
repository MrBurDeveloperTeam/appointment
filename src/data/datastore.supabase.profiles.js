import { supabase } from "../lib/supabaseClient";

const mapProfile = (row) => ({
  id: row.user_id,
  username: row.email || "",
  email: row.email || "",
  role: row.account_type === "admin" ? "admin" : "dentist",
  phone: row.phone || "",
  clinicId: row.clinic_id || "",
  name: row.name || "",
  status: row.status || "active",
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

export async function getProfiles() {
  const headers = await getHeaders();

  const response = await fetch(`${API_URL}/profiles`, { headers });
  if (!response.ok) throw new Error(await response.text());

  const data = await response.json();
  return (data || []).map(mapProfile);
}

export async function getProfileById(id) {
  const headers = await getHeaders();

  const response = await fetch(`${API_URL}/profiles?id=${id}`, { headers });
  if (!response.ok) throw new Error(await response.text());

  const data = await response.json();
  return mapProfile(data);
}

export async function getProfileByEmail(email) {
  const headers = await getHeaders();

  const response = await fetch(`${API_URL}/profiles?email=${encodeURIComponent(email)}`, { headers });
  if (!response.ok) throw new Error(await response.text());

  const data = await response.json();
  // Worker returns single object or null
  if (!data) return null;
  return mapProfile(data);
}

export async function updateProfile(id, updates) {
  const payload = {
    ...(updates.email !== undefined ? { email: updates.email } : {}),
    ...(updates.fullName !== undefined ? { name: updates.fullName } : {}),
    ...(updates.role !== undefined
      ? { account_type: updates.role === "admin" ? "admin" : "individual" }
      : {}),
    ...(updates.clinicId !== undefined ? { clinic_id: updates.clinicId || null } : {}),
    ...(updates.status !== undefined ? { status: updates.status } : {}),
  };

  const headers = await getHeaders();
  const response = await fetch(`${API_URL}/profiles?id=${id}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(payload)
  });

  if (!response.ok) throw new Error(await response.text());

  const data = await response.json();
  return mapProfile(data);
}

export async function deactivateProfile(id) {
  return updateProfile(id, { status: "inactive" });
}
