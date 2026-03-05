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

export async function getSettings(clinicId) {
  const { data, error } = await supabase
    .from("apt_settings")
    .select("*")
    .eq("clinic_id", clinicId)
    .maybeSingle();
  if (error) throw error;
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

  const { data, error } = await supabase
    .from("apt_settings")
    .upsert(payload, { onConflict: "clinic_id" })
    .select("*")
    .single();
  if (error) throw error;
  return mapSettings(data);
}
