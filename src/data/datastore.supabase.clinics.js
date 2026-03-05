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

export async function getClinics() {
  const { data, error } = await supabase
    .from("apt_clinics")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data || []).map(mapClinic);
}

export async function getClinicById(id) {
  const { data, error } = await supabase
    .from("apt_clinics")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
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
  const { data, error } = await supabase
    .from("apt_clinics")
    .insert(payload)
    .select("*")
    .single();
  if (error) throw error;
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
  const { data, error } = await supabase
    .from("apt_clinics")
    .update(payload)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return mapClinic(data);
}

export async function deleteClinic(id) {
  const { error } = await supabase.from("clinics").delete().eq("id", id);
  if (error) throw error;
  return true;
}
