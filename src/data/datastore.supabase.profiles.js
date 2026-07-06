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

export async function getProfiles() {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data || []).map(mapProfile);
}

export async function getProfileById(id) {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", id)
    .single();
  if (error) throw error;
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
  const { data, error } = await supabase
    .from("profiles")
    .update(payload)
    .eq("user_id", id)
    .select("*")
    .single();
  if (error) throw error;
  return mapProfile(data);
}

export async function deactivateProfile(id) {
  return updateProfile(id, { status: "inactive" });
}
