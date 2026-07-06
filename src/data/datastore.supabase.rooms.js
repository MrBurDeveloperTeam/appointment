import { supabase } from "../lib/supabaseClient";

const mapRoom = (row) => ({
  id: row.id,
  name: row.name,
  color: row.color || "",
});

export async function getRooms(clinicId) {
  const { data, error } = await supabase
    .from("apt_rooms")
    .select("*")
    .eq("clinic_id", clinicId)
    .order("name", { ascending: true });
  if (error) throw error;
  return (data || []).map(mapRoom);
}

export async function addRoom(clinicId, room) {
  const payload = {
    clinic_id: clinicId,
    name: room.name,
    color: room.color || null,
  };
  const { data, error } = await supabase
    .from("apt_rooms")
    .insert(payload)
    .select("*")
    .single();
  if (error) throw error;
  return mapRoom(data);
}

export async function updateRoom(id, updates) {
  const payload = {
    ...(updates.name !== undefined ? { name: updates.name } : {}),
    ...(updates.color !== undefined ? { color: updates.color } : {}),
  };
  const { data, error } = await supabase
    .from("apt_rooms")
    .update(payload)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return mapRoom(data);
}

export async function deleteRoom(id) {
  const { error } = await supabase.from("apt_rooms").delete().eq("id", id);
  if (error) throw error;
  return true;
}
