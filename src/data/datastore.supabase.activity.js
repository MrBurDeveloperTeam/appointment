import { supabase } from "../lib/supabaseClient";
import { logActivityToOdoo } from "../services/logActivityToOdoo";

const mapActivity = (row) => ({
  id: row.id,
  type: row.type,
  description: row.description,
  timestamp: row.created_at,
});

// Best-effort: every clinic/admin activity write also gets pushed to Odoo
// (see services/logActivityToOdoo.js + APPOINTMENT_ACTIVITY_TRACKER_ODOO_SYNC.md),
// mirroring the same sync built for the inventory app. Fire-and-forget so a
// slow/unreachable worker or Odoo instance never blocks or fails the local
// Supabase write, which stays the source of truth either way.
async function syncActivityToOdoo(row, clinicId) {
  try {
    const { data: { user } = {} } = await supabase.auth.getUser();
    if (!user?.email) return;
    await logActivityToOdoo({
      logId: row.id,
      actorEmail: user.email,
      actorName: user.user_metadata?.full_name || user.user_metadata?.name || null,
      supabaseUserId: user.id,
      clinicId: clinicId ?? null,
      type: row.type,
      description: row.description,
      occurredAt: row.created_at,
    });
  } catch (err) {
    console.error("Failed to sync activity to Odoo:", err?.message || err);
  }
}

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
  syncActivityToOdoo(data, clinicId);
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
  syncActivityToOdoo(data, null);
  return mapActivity(data);
}
