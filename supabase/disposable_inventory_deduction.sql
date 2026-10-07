-- Disposable consumables <-> inventory.  Run once in the Supabase SQL editor
-- (safe to re-run; everything is CREATE OR REPLACE / IF NOT EXISTS).
--
-- What this sets up
--   1. apt_treatments.supplies_detail  jsonb  [{name, qty, uom, disposable}, ...]
--      One entry per consumable on a treatment (quantity, unit of measure and
--      disposable flag).
--   2. apt_inventory_item_names(clinic)  -> text[]  item names for suggestions.
--   3. apt_inventory_stock(clinic)       -> jsonb   [{name, uom, qty}] stock per
--      name + unit, used to cap quantities and to offer the UOM choices
--      (the distinct units found in inventory).
--   4. apt_deduct_disposables(appointment) -> deducts, once per completed
--      appointment, every DISPOSABLE consumable of its treatment from inventory
--      (qty units each in the row's UOM, earliest-expiry batch first, spilling into the next
--      batch/item if one runs out), recalculates the item, removes items that
--      hit 0 and writes an inventory activity-log row per deduction.
--      appointments.supplies_deducted_at makes it idempotent.  Consumables
--      without enough stock are skipped/short and reported in the JSON result;
--      they never block completing the appointment.
--      Treatments saved before supplies_detail existed fall back to the old
--      rule: treatment-level flag + 1 unit of each name in supplies_needed.

ALTER TABLE public.apt_treatments
  ADD COLUMN IF NOT EXISTS supplies_disposable boolean NOT NULL DEFAULT false;

ALTER TABLE public.apt_treatments
  ADD COLUMN IF NOT EXISTS supplies_detail jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS supplies_deducted_at timestamptz;

-- ---------------------------------------------------------------------------
-- 2. Item names
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apt_inventory_item_names(p_clinic_id uuid)
RETURNS text[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_names text[];
BEGIN
  IF NOT (
    EXISTS (SELECT 1 FROM apt_clinic_members m
             WHERE m.clinic_id = p_clinic_id AND m.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles p
             WHERE p.clinic_id = p_clinic_id AND p.user_id = auth.uid())
  ) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  SELECT COALESCE(array_agg(n ORDER BY lower(n)), '{}')
    INTO v_names
    FROM (
      SELECT DISTINCT ON (lower(btrim(i.name))) btrim(i.name) AS n
        FROM inventory_items i
       WHERE i.user_id IN (SELECT user_id FROM profiles WHERE clinic_id = p_clinic_id)
         AND btrim(COALESCE(i.name, '')) <> ''
         AND COALESCE(i.category, '') <> 'equipment'
       ORDER BY lower(btrim(i.name)), btrim(i.name)
    ) t;

  RETURN v_names;
END;
$$;

REVOKE ALL ON FUNCTION public.apt_inventory_item_names(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.apt_inventory_item_names(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. Stock per item name (summed over rooms / items with the same name)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apt_inventory_stock(p_clinic_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stock jsonb;
BEGIN
  IF NOT (
    EXISTS (SELECT 1 FROM apt_clinic_members m
             WHERE m.clinic_id = p_clinic_id AND m.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles p
             WHERE p.clinic_id = p_clinic_id AND p.user_id = auth.uid())
  ) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('name', t.n, 'uom', t.u, 'qty', t.q)
                            ORDER BY lower(t.n), t.u), '[]'::jsonb)
    INTO v_stock
    FROM (
      SELECT min(btrim(i.name)) AS n,
             lower(btrim(COALESCE(i.uom, ''))) AS u,
             SUM(i.quantity) AS q
        FROM inventory_items i
       WHERE i.user_id IN (SELECT user_id FROM profiles WHERE clinic_id = p_clinic_id)
         AND btrim(COALESCE(i.name, '')) <> ''
         AND COALESCE(i.category, '') <> 'equipment'
       GROUP BY lower(btrim(i.name)), lower(btrim(COALESCE(i.uom, '')))
    ) t;

  RETURN v_stock;
END;
$$;

REVOKE ALL ON FUNCTION public.apt_inventory_stock(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.apt_inventory_stock(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Deduction
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apt_deduct_disposables(p_appointment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_appt        record;
  v_treat       record;
  v_owners      uuid[];
  v_need        jsonb;
  v_row         jsonb;
  v_name        text;
  v_uom         text;
  v_remaining   numeric;
  v_taken_total numeric;
  v_take        numeric;
  v_batch_id    uuid;
  v_batch_qty   numeric;
  v_item_id     uuid;
  v_item_user   uuid;
  v_item_room   uuid;
  v_item_name   text;
  v_item_qty    numeric;
  v_total       numeric;
  v_avg         numeric;
  v_expiry      date;
  v_before      numeric;
  v_after       numeric;
  v_room_name   text;
  v_deducted    jsonb := '[]'::jsonb;
  v_missing     jsonb := '[]'::jsonb;
BEGIN
  SELECT * INTO v_appt FROM appointments WHERE id = p_appointment_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;

  -- Caller must belong to the appointment's clinic.
  IF NOT (
    EXISTS (SELECT 1 FROM apt_clinic_members m
             WHERE m.clinic_id = v_appt.clinic_id AND m.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles p
             WHERE p.clinic_id = v_appt.clinic_id AND p.user_id = auth.uid())
  ) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  IF v_appt.status IS DISTINCT FROM 'completed' THEN
    RETURN jsonb_build_object('status', 'not_completed');
  END IF;
  IF v_appt.supplies_deducted_at IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'already_deducted');
  END IF;

  SELECT * INTO v_treat FROM apt_treatments WHERE id = v_appt.treatment_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'nothing_to_deduct');
  END IF;

  -- What to deduct: disposable rows of supplies_detail (name + qty), or, for
  -- treatments saved before supplies_detail existed, the old flag + names.
  IF jsonb_typeof(v_treat.supplies_detail) = 'array'
     AND jsonb_array_length(v_treat.supplies_detail) > 0 THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'name', e->>'name',
             'uom',  lower(btrim(COALESCE(e->>'uom', ''))),
             'qty',  GREATEST(COALESCE(NULLIF(e->>'qty', '')::numeric, 1), 1))), '[]'::jsonb)
      INTO v_need
      FROM jsonb_array_elements(v_treat.supplies_detail) e
     WHERE COALESCE((e->>'disposable')::boolean, false);
  ELSIF COALESCE(v_treat.supplies_disposable, false)
        AND COALESCE(cardinality(v_treat.supplies_needed), 0) > 0 THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object('name', n, 'qty', 1)), '[]'::jsonb)
      INTO v_need
      FROM unnest(v_treat.supplies_needed) n;
  ELSE
    v_need := '[]'::jsonb;
  END IF;

  IF jsonb_array_length(v_need) = 0 THEN
    RETURN jsonb_build_object('status', 'nothing_to_deduct');
  END IF;

  SELECT array_agg(user_id) INTO v_owners
    FROM profiles WHERE clinic_id = v_appt.clinic_id;

  FOR v_row IN SELECT * FROM jsonb_array_elements(v_need) LOOP
    v_name := lower(btrim(COALESCE(v_row->>'name', '')));
    CONTINUE WHEN v_name = '';
    v_uom         := lower(btrim(COALESCE(v_row->>'uom', '')));
    v_remaining   := (v_row->>'qty')::numeric;
    v_taken_total := 0;

    WHILE v_remaining > 0 LOOP
      -- Oldest (earliest-expiry) batch of a matching item.
      v_batch_id := NULL;
      SELECT b.id, b.qty, i.id, i.user_id, i.room_id, i.name, i.quantity
        INTO v_batch_id, v_batch_qty, v_item_id, v_item_user, v_item_room, v_item_name, v_item_qty
        FROM inventory_item_batches b
        JOIN inventory_items i ON i.id = b.item_id
       WHERE i.user_id = ANY (v_owners)
         AND lower(btrim(i.name)) = v_name
         AND (v_uom = '' OR lower(btrim(COALESCE(i.uom, ''))) = v_uom)
         AND b.qty > 0
       ORDER BY b.expiry_date ASC NULLS LAST, i.id
       LIMIT 1
         FOR UPDATE OF b, i;

      IF v_batch_id IS NOT NULL THEN
        v_before := v_item_qty;
        v_take   := LEAST(v_remaining, v_batch_qty);

        IF v_batch_qty <= v_take THEN
          DELETE FROM inventory_item_batches WHERE id = v_batch_id;
        ELSE
          UPDATE inventory_item_batches SET qty = qty - v_take WHERE id = v_batch_id;
        END IF;

        SELECT COALESCE(SUM(qty), 0),
               COALESCE(SUM(qty * unit_price) / NULLIF(SUM(qty), 0), 0),
               MIN(expiry_date)
          INTO v_total, v_avg, v_expiry
          FROM inventory_item_batches WHERE item_id = v_item_id;

        IF v_total <= 0 THEN
          DELETE FROM inventory_items WHERE id = v_item_id;
        ELSE
          UPDATE inventory_items
             SET quantity = v_total, price = v_avg, expiry_date = v_expiry
           WHERE id = v_item_id;
        END IF;
        v_after := v_total;
      ELSE
        -- Legacy item with no batch rows: take from the item quantity itself.
        v_item_id := NULL;
        SELECT i.id, i.user_id, i.room_id, i.name, i.quantity
          INTO v_item_id, v_item_user, v_item_room, v_item_name, v_item_qty
          FROM inventory_items i
         WHERE i.user_id = ANY (v_owners)
           AND lower(btrim(i.name)) = v_name
           AND (v_uom = '' OR lower(btrim(COALESCE(i.uom, ''))) = v_uom)
           AND i.quantity > 0
           AND NOT EXISTS (SELECT 1 FROM inventory_item_batches b WHERE b.item_id = i.id)
         ORDER BY i.expiry_date ASC NULLS LAST, i.id
         LIMIT 1
           FOR UPDATE OF i;

        EXIT WHEN v_item_id IS NULL;   -- no (more) stock for this name

        v_before := v_item_qty;
        v_take   := LEAST(v_remaining, v_item_qty);
        v_after  := v_item_qty - v_take;
        IF v_after <= 0 THEN
          DELETE FROM inventory_items WHERE id = v_item_id;
          v_after := 0;
        ELSE
          UPDATE inventory_items SET quantity = v_after WHERE id = v_item_id;
        END IF;
      END IF;

      v_remaining   := v_remaining - v_take;
      v_taken_total := v_taken_total + v_take;

      -- Activity log (best effort: a logging problem must not undo the deduction).
      BEGIN
        SELECT name INTO v_room_name FROM inventory_rooms WHERE id = v_item_room;
        INSERT INTO inventory_activity_logs
          (id, user_id, room_id, room_name, action, details, created_at, actor_id, before_value, after_value)
        VALUES
          (gen_random_uuid(), v_item_user, v_item_room, v_room_name, 'remove',
           format('Auto-deducted %s of "%s" (disposable, treatment "%s" completed)',
                  v_take, v_item_name, v_treat.name),
           now(), auth.uid(), v_before::text, v_after::text);
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
    END LOOP;

    IF v_taken_total > 0 THEN
      v_deducted := v_deducted || jsonb_build_object('name', v_row->>'name', 'uom', v_uom, 'qty', v_taken_total);
    END IF;
    IF v_remaining > 0 THEN
      v_missing := v_missing || jsonb_build_object('name', v_row->>'name', 'uom', v_uom, 'short', v_remaining);
    END IF;
  END LOOP;

  UPDATE appointments SET supplies_deducted_at = now() WHERE id = p_appointment_id;

  RETURN jsonb_build_object('status', 'deducted', 'deducted', v_deducted, 'missing', v_missing);
END;
$$;

REVOKE ALL ON FUNCTION public.apt_deduct_disposables(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.apt_deduct_disposables(uuid) TO authenticated;
