import { supabase } from "../lib/supabaseClient";

const mapTreatment = (row) => ({
  id: row.id,
  name: row.name,
  duration: row.duration || 0,
  color: row.color || "",
  suppliesNeeded: row.supplies_needed || [],
  suppliesDisposable: Boolean(row.supplies_disposable),
});

// PostgREST / Postgres error codes for "column does not exist". Lets the app
// keep saving treatments if supabase/treatment_supplies_disposable.sql has not
// been applied yet (the disposable flag is simply not persisted until then).
const isMissingDisposableColumn = (error) =>
  error &&
  (error.code === "42703" ||
    error.code === "PGRST204" ||
    /supplies_disposable/i.test(error.message || ""));

const withoutDisposable = ({ supplies_disposable, ...rest }) => rest; // eslint-disable-line no-unused-vars

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
    supplies_disposable: Boolean(treatment.suppliesDisposable),
  };
  const insert = (body) =>
    supabase.from("apt_treatments").insert(body).select("*").single();

  let { data, error } = await insert(payload);
  if (isMissingDisposableColumn(error)) {
    ({ data, error } = await insert(withoutDisposable(payload)));
  }
  if (error) throw error;
  return mapTreatment(data);
}

export async function updateTreatment(id, updates) {
  const payload = {
    ...(updates.name !== undefined ? { name: updates.name } : {}),
    ...(updates.duration !== undefined ? { duration: updates.duration } : {}),
    ...(updates.color !== undefined ? { color: updates.color } : {}),
    ...(updates.suppliesNeeded !== undefined ? { supplies_needed: updates.suppliesNeeded } : {}),
    ...(updates.suppliesDisposable !== undefined ? { supplies_disposable: Boolean(updates.suppliesDisposable) } : {}),
  };
  const update = (body) =>
    supabase.from("apt_treatments").update(body).eq("id", id).select("*").single();

  let { data, error } = await update(payload);
  if (isMissingDisposableColumn(error)) {
    ({ data, error } = await update(withoutDisposable(payload)));
  }
  if (error) throw error;
  return mapTreatment(data);
}

export async function deleteTreatment(id) {
  const { error } = await supabase.from("apt_treatments").delete().eq("id", id);
  if (error) throw error;
  return true;
}

// Names of the clinic's inventory items, used as Consumables suggestions.
// Backed by supabase/disposable_inventory_deduction.sql; if that function has
// not been created yet this returns [] so the form keeps working.
export async function getInventoryItemNames(clinicId) {
  try {
    const { data, error } = await supabase.rpc("apt_inventory_item_names", {
      p_clinic_id: clinicId,
    });
    if (error) {
      console.warn("[Inventory] Could not load item names:", error.message);
      return [];
    }
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.warn("[Inventory] Could not load item names:", err?.message || err);
    return [];
  }
}
