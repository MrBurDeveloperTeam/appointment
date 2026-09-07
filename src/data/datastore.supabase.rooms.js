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
  // Generate a shared UUID so the same id can be used in inventory_rooms.
  const roomId = crypto.randomUUID();

  const payload = {
    id: roomId,
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

  // Sync to inventory_rooms using the same UUID.
  // Look up the user_id that owns this clinic so we can set inventory_rooms.user_id.
  supabase
    .from("profiles")
    .select("user_id")
    .eq("clinic_id", clinicId)
    .maybeSingle()
    .then(({ data: profile, error: profErr }) => {
      if (profErr || !profile?.user_id) {
        console.warn("[RoomSync] Could not resolve user_id for clinic", clinicId, profErr?.message);
        return;
      }
      supabase
        .from("inventory_rooms")
        .insert({
          id: roomId,
          user_id: profile.user_id,
          name: room.name,
          pos_x: Math.floor(Math.random() * 400) + 50,
          pos_y: Math.floor(Math.random() * 300) + 50,
        })
        .then(({ error: invErr }) => {
          if (invErr && invErr.code !== "23505") {
            console.warn("[RoomSync] Could not sync new room to inventory:", invErr.message);
          }
        });
    });

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

  // Sync name rename back to inventory_rooms (same UUID is used for both tables
  // when a room is created from the inventory app — no-op if no matching row).
  if (updates.name !== undefined) {
    supabase
      .from("inventory_rooms")
      .update({ name: updates.name })
      .eq("id", id)
      .then(({ error: invErr }) => {
        if (invErr) console.warn("[RoomSync] Could not sync rename to inventory:", invErr.message);
      });
  }

  return mapRoom(data);
}

export async function deleteRoom(id) {
  const { error } = await supabase.from("apt_rooms").delete().eq("id", id);
  if (error) throw error;

  // Sync deletion to inventory_rooms (same UUID — no-op if no matching row)
  supabase
    .from("inventory_rooms")
    .delete()
    .eq("id", id)
    .then(({ error: invErr }) => {
      if (invErr) console.warn("[RoomSync] Could not sync delete to inventory:", invErr.message);
    });

  return true;
}
