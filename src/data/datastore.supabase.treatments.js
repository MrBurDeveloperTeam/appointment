import { supabase } from "../lib/supabaseClient";

const mapTreatment = (row) => ({
  id: row.id,
  name: row.name,
  duration: row.duration || 0,
  color: row.color || "",
  suppliesNeeded: row.supplies_needed || [],
});

export async function getTreatments(clinicId) {
  const { data, error } = await supabase
    .from("apt_treatments")
    .select("*")
    .eq("clinic_id", clinicId)
    .order("name", { ascending: true });
  if (error) throw error;
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
  const { data, error } = await supabase
    .from("apt_treatments")
    .insert(payload)
    .select("*")
    .single();
  if (error) throw error;
  return mapTreatment(data);
}

export async function updateTreatment(id, updates) {
  const payload = {
    ...(updates.name !== undefined ? { name: updates.name } : {}),
    ...(updates.duration !== undefined ? { duration: updates.duration } : {}),
    ...(updates.color !== undefined ? { color: updates.color } : {}),
    ...(updates.suppliesNeeded !== undefined ? { supplies_needed: updates.suppliesNeeded } : {}),
  };
  const { data, error } = await supabase
    .from("apt_treatments")
    .update(payload)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return mapTreatment(data);
}

export async function deleteTreatment(id) {
  const { error } = await supabase.from("apt_treatments").delete().eq("id", id);
  if (error) throw error;
  return true;
}
