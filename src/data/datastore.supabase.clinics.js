import { supabase } from "../lib/supabaseClient";

const mapClinic = (row) => ({
  id: row.id,
  name: row.name,
  slug: row.slug || "",
  city: row.city || "",
  plan: row.plan || "",
  status: row.status || "",
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

export async function getClinics() {
  const headers = await getHeaders();

  const response = await fetch(`${API_URL}/clinics`, { headers });
  if (!response.ok) throw new Error(await response.text());

  const data = await response.json();
  return (data || []).map(mapClinic);
}

export async function getClinicById(id) {
  const headers = await getHeaders();

  const response = await fetch(`${API_URL}/clinics?id=${id}`, { headers });
  if (!response.ok) throw new Error(await response.text());

  const data = await response.json();
  // Worker returns object or null
  if (!data) return null;
  return mapClinic(data);
}

export async function addClinic(clinic) {
  const payload = {
    name: clinic.name,
    slug: clinic.slug || clinic.name.toLowerCase().replace(/\s+/g, '-'),
    city: clinic.city || null,
    plan: clinic.plan || null,
    status: clinic.status || null,
  };

  const headers = await getHeaders();
  const response = await fetch(`${API_URL}/clinics`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload)
  });

  if (!response.ok) throw new Error(await response.text());

  const data = await response.json();
  return mapClinic(data);
}

export async function updateClinic(id, updates) {
  const payload = {
    ...(updates.name !== undefined ? { name: updates.name } : {}),
    ...(updates.slug !== undefined ? { slug: updates.slug } : {}),
    ...(updates.city !== undefined ? { city: updates.city } : {}),
    ...(updates.plan !== undefined ? { plan: updates.plan } : {}),
    ...(updates.status !== undefined ? { status: updates.status } : {}),
  };

  const headers = await getHeaders();
  const response = await fetch(`${API_URL}/clinics?id=${id}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(payload)
  });

  if (!response.ok) throw new Error(await response.text());

  const data = await response.json();
  return mapClinic(data);
}

export async function deleteClinic(id) {
  const headers = await getHeaders();
  const response = await fetch(`${API_URL}/clinics?id=${id}`, {
    method: "DELETE",
    headers
  });

  if (!response.ok) throw new Error(await response.text());
  return true;
}
