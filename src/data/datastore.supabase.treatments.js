import { supabase } from "../lib/supabaseClient";

// A treatment's consumables: [{ name, qty, disposable }].
const cleanSupplies = (rows) =>
  (Array.isArray(rows) ? rows : [])
    .map((r) => ({
      name: String(r?.name || "").trim(),
      qty: Math.max(1, Math.floor(Number(r?.qty)) || 1),
      disposable: Boolean(r?.disposable),
    }))
    .filter((r) => r.name);

const mapTreatment = (row) => {
  const names = row.supplies_needed || [];
  let detail = cleanSupplies(row.supplies_detail);
  // Treatments saved before supplies_detail existed: rebuild rows from the
  // name list (qty 1) using the old treatment-level disposable flag.
  if (detail.length === 0 && names.length > 0) {
    detail = names.map((name) => ({
      name,
      qty: 1,
      disposable: Boolean(row.supplies_disposable),
    }));
  }
  return {
    id: row.id,
    name: row.name,
    duration: row.duration || 0,
    color: row.color || "",
    suppliesNeeded: names,
    suppliesDetail: detail,
    suppliesDisposable: detail.some((r) => r.disposable),
  };
};

// Columns added by supabase/disposable_inventory_deduction.sql. If that script
// has not been run yet, saving retries without them so treatments still save
// (the per-consumable quantity / disposable flags just are not persisted).
const OPTIONAL_COLUMNS = ["supplies_detail", "supplies_disposable"];
const isMissingOptionalColumn = (error) =>
  error &&
  (error.code === "42703" ||
    error.code === "PGRST204" ||
    OPTIONAL_COLUMNS.some((c) => (error.message || "").includes(c)));
const withoutOptionalColumns = (payload) => {
  const rest = { ...payload };
  OPTIONAL_COLUMNS.forEach((c) => delete rest[c]);
  return rest;
};

const supplyColumns = (treatment) => {
  const detail = cleanSupplies(treatment.suppliesDetail);
  if (detail.length === 0 && !treatment.suppliesDetail) return {};
  return {
    supplies_needed: detail.map((r) => r.name),
    supplies_detail: detail,
    supplies_disposable: detail.some((r) => r.disposable),
  };
};

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
    supplies_detail: [],
    supplies_disposable: false,
    ...supplyColumns(treatment),
  };
  const insert = (body) =>
    supabase.from("apt_treatments").insert(body).select("*").single();

  let { data, error } = await insert(payload);
  if (isMissingOptionalColumn(error)) {
    ({ data, error } = await insert(withoutOptionalColumns(payload)));
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
    ...(updates.suppliesDetail !== undefined ? supplyColumns(updates) : {}),
  };
  const update = (body) =>
    supabase.from("apt_treatments").update(body).eq("id", id).select("*").single();

  let { data, error } = await update(payload);
  if (isMissingOptionalColumn(error)) {
    ({ data, error } = await update(withoutOptionalColumns(payload)));
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

// Stock per inventory item name: [{ name, qty }] (qty summed across rooms).
// Returns null when it cannot be loaded, so the form can tell "unknown" (no
// limit enforced) apart from "not in inventory" (stock 0).
export async function getInventoryStock(clinicId) {
  try {
    const { data, error } = await supabase.rpc("apt_inventory_stock", {
      p_clinic_id: clinicId,
    });
    if (error) {
      console.warn("[Inventory] Could not load stock:", error.message);
      return null;
    }
    return Array.isArray(data)
      ? data.map((r) => ({ name: r.name, qty: Number(r.qty) || 0 }))
      : null;
  } catch (err) {
    console.warn("[Inventory] Could not load stock:", err?.message || err);
    return null;
  }
}
