import { supabase } from "../lib/supabaseClient";

const mapTreatment = (row) => ({
  id: row.id,
  name: row.name,
  duration: row.duration || 0,
  color: row.color || "",
  suppliesNeeded: row.supplies_needed || [],
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

export async function getTreatments(clinicId) {
  const headers = await getHeaders();
  const params = new URLSearchParams({ clinicId });

  const response = await fetch(`${API_URL}/treatments?${params.toString()}`, { headers });
  if (!response.ok) throw new Error(await response.text());

  const data = await response.json();
  return (data || []).map(mapTreatment);
}

export async function addTreatment(clinicId, treatment) {
  const payload = {
    clinic_id: clinicId,
    name: treatment.name,
    duration: treatment.duration || null,
    color: treatment.color || null,
    supplies_needed: treatment.suppliesNeeded || [],
  };

  const headers = await getHeaders();
  const response = await fetch(`${API_URL}/treatments`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload)
  });

  if (!response.ok) throw new Error(await response.text());

  const data = await response.json();
  return mapTreatment(data);
}

export async function updateTreatment(id, updates) {
  const payload = {
    ...(updates.name !== undefined ? { name: updates.name } : {}),
    ...(updates.duration !== undefined ? { duration: updates.duration } : {}),
    ...(updates.color !== undefined ? { color: updates.color } : {}),
    ...(updates.suppliesNeeded !== undefined ? { supplies_needed: updates.suppliesNeeded } : {}),
  };

  const headers = await getHeaders();
  const response = await fetch(`${API_URL}/treatments?id=${id}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(payload)
  });

  if (!response.ok) throw new Error(await response.text());

  const data = await response.json();
  return mapTreatment(data);
}

export async function deleteTreatment(id) {
  const headers = await getHeaders();
  const response = await fetch(`${API_URL}/treatments?id=${id}`, {
    method: "DELETE",
    headers
  });

  if (!response.ok) throw new Error(await response.text());
  return true;
}
