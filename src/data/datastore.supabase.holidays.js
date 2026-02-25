import { supabase } from "../lib/supabaseClient";

const mapHoliday = (row) => ({
  id: row.id,
  name: row.name,
  startDate: row.start_date,
  endDate: row.end_date || row.start_date,
  type: row.type || "public",
  isPublic: row.is_public || false,
  createdAt: row.created_at,
});

export async function getHolidays(clinicId) {
  const { data, error } = await supabase
    .from("apt_holidays")
    .select("*")
    .eq("clinic_id", clinicId)
    .order("start_date", { ascending: true });
  if (error) throw error;
  return (data || []).map(mapHoliday);
}

export async function addHoliday(clinicId, holiday) {
  const payload = {
    clinic_id: clinicId,
    name: holiday.name,
    start_date: holiday.startDate,
    end_date: holiday.endDate || holiday.startDate,
    type: holiday.type || "public",
    is_public: holiday.isPublic || false,
  };
  const { data, error } = await supabase
    .from("apt_holidays")
    .insert(payload)
    .select("*")
    .single();
  if (error) throw error;
  return mapHoliday(data);
}

export async function updateHoliday(id, updates) {
  const payload = {
    ...(updates.name !== undefined ? { name: updates.name } : {}),
    ...(updates.startDate !== undefined ? { start_date: updates.startDate } : {}),
    ...(updates.endDate !== undefined ? { end_date: updates.endDate || updates.startDate } : {}),
    ...(updates.type !== undefined ? { type: updates.type } : {}),
    ...(updates.isPublic !== undefined ? { is_public: updates.isPublic } : {}),
  };
  const { data, error } = await supabase
    .from("apt_holidays")
    .update(payload)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return mapHoliday(data);
}

export async function deleteHoliday(id) {
  const { error } = await supabase.from("apt_holidays").delete().eq("id", id);
  if (error) throw error;
  return true;
}
