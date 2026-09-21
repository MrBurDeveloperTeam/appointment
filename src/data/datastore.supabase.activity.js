import { supabase } from "../lib/supabaseClient";

const mapActivity = (row) => ({
  id: row.id,
  type: row.type,
  description: row.description,
  timestamp: row.created_at,
});

export async function getActivityLog(clinicId) {
  const { data, error } = await supabase
    .from("apt_activity_log")
    .select("*")
    .eq("clinic_id", clinicId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data || []).map(mapActivity);
}

export async function addActivityLog(clinicId, entry) {
  const payload = {
    clinic_id: clinicId,
    type: entry.type,
    description: entry.description,
  };
  const { data, error } = await supabase
    .from("apt_activity_log")
    .insert(payload)
    .select("*")
    .single();
  if (error) throw error;
  return mapActivity(data);
}

export async function getAdminActivity() {
  const { data, error } = await supabase
    .from("apt_activity_log")
    .select("*")
    .is("clinic_id", null)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []).map(mapActivity);
}

export async function addAdminActivity(entry) {
  const payload = {
    clinic_id: null,
    type: entry.type,
    description: entry.description,
  };
  const { data, error } = await supabase
    .from("apt_activity_log")
    .insert(payload)
    .select("*")
    .single();
  if (error) throw error;
  return mapActivity(data);
}
