import { supabase } from "../lib/supabaseClient";

const mapSettings = (row) => ({
  id: row.id,
  clinicId: row.clinic_id,
  clinicName: row.clinic_name || "Dental Clinic",
  workingHours: {
    start: row.working_hours_start || "09:00",
    end: row.working_hours_end || "18:00",
  },
  slotDuration: row.slot_duration || 30,
  restDays: row.rest_days || [],
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

export async function getSettings(clinicId) {
  const headers = await getHeaders();
  const params = new URLSearchParams({ clinicId });

  const response = await fetch(`${API_URL}/settings?${params.toString()}`, { headers });
  if (!response.ok) {
    // If 404 or null data, we might return null as per original logic
    if (response.status === 404) return null;
    throw new Error(await response.text());
  }

  const data = await response.json();
  if (!data) return null;
  return mapSettings(data);
}

export async function saveSettings(clinicId, settings) {
  const payload = {
    clinic_id: clinicId,
    clinic_name: settings.clinicName || null,
    working_hours_start: settings.workingHours?.start || null,
    working_hours_end: settings.workingHours?.end || null,
    slot_duration: settings.slotDuration || null,
    rest_days: settings.restDays || [],
    updated_at: new Date().toISOString(),
  };

  const headers = await getHeaders();
  const response = await fetch(`${API_URL}/settings`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload)
  });

  if (!response.ok) throw new Error(await response.text());

  const data = await response.json();
  return mapSettings(data);
}
