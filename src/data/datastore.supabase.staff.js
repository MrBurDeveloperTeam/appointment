import { supabase } from "../lib/supabaseClient";

const mapStaff = (row) => ({
  id: row.id,
  role: row.role,
  name: row.name,
  phone: row.phone || "",
  color: row.color || "",
  specialty: row.specialty || "",
  workingDays: row.working_days || [],
  startTime: row.start_time || "",
  endTime: row.end_time || "",
  assignedTo: row.assigned_to || "",
  createdAt: row.created_at,
});

export async function getStaff(clinicId) {
  const { data, error } = await supabase
    .from("apt_staff")
    .select("*")
    .eq("clinic_id", clinicId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data || []).map(mapStaff);
}

export async function addStaff(clinicId, staffMember) {
  const payload = {
    clinic_id: clinicId,
    role: staffMember.role,
    name: staffMember.name,
    phone: staffMember.phone || null,
    color: staffMember.color || null,
    specialty: staffMember.specialty || null,
    working_days: staffMember.workingDays || [],
    start_time: staffMember.startTime || null,
    end_time: staffMember.endTime || null,
    assigned_to: staffMember.assignedTo || null,
  };
  const { data, error } = await supabase
    .from("apt_staff")
    .insert(payload)
    .select("*")
    .single();
  if (error) throw error;
  return mapStaff(data);
}

export async function updateStaff(id, updates) {
  const payload = {
    ...(updates.role !== undefined ? { role: updates.role } : {}),
    ...(updates.name !== undefined ? { name: updates.name } : {}),
    ...(updates.phone !== undefined ? { phone: updates.phone } : {}),
    ...(updates.color !== undefined ? { color: updates.color } : {}),
    ...(updates.specialty !== undefined ? { specialty: updates.specialty } : {}),
    ...(updates.workingDays !== undefined ? { working_days: updates.workingDays } : {}),
    ...(updates.startTime !== undefined ? { start_time: updates.startTime } : {}),
    ...(updates.endTime !== undefined ? { end_time: updates.endTime } : {}),
    ...(updates.assignedTo !== undefined ? { assigned_to: updates.assignedTo || null } : {}),
  };
  const { data, error } = await supabase
    .from("apt_staff")
    .update(payload)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return mapStaff(data);
}

export async function deleteStaff(id) {
  const { error } = await supabase.from("apt_staff").delete().eq("id", id);
  if (error) throw error;
  return true;
}
