-- Deduct disposable treatment consumables from inventory when an appointment
-- is completed.  Run once in the Supabase SQL editor (safe to re-run).
--
-- Behaviour (per completed appointment, exactly once):
--   * Treatment must have supplies_disposable = true and a supplies_needed list.
--   * For each consumable name, 1 unit is taken from the matching inventory
--     item (case-insensitive name match, items owned by the clinic's users),
--     from the batch that expires first (batches with no expiry go last).
--   * Item quantity / average price / earliest expiry are recalculated; an item
--     that reaches 0 is removed, same as inventory's own "Remove stock".
--   * An inventory activity-log row ('remove') is written for each deduction.
--   * appointments.supplies_deducted_at is stamped so re-saving the appointment
--     never deducts twice.  Consumables with no matching stock are skipped and
--     reported in the returned JSON (they never block completion).

ALTER TABLE public.apt_treatments
  ADD COLUMN IF NOT EXISTS supplies_disposable boolean NOT NULL DEFAULT false;

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS supplies_deducted_at timestamptz;

CREATE OR REPLACE FUNCTION public.apt_deduct_disposables(p_appointment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_appt      record;
  v_treat     record;
  v_owners    uuid[];
  v_supply    text;
  v_batch     record;
  v_item      record;
  v_total     numeric;
  v_avg       numeric;
  v_expiry    date;
  v_before    numeric;
  v_after     numeric;
  v_room_name text;
  v_deducted  jsonb := '[]'::jsonb;
  v_missing   jsonb := '[]'::jsonb;
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
  IF NOT FOUND
     OR NOT COALESCE(v_treat.supplies_disposable, false)
     OR COALESCE(cardinality(v_treat.supplies_needed), 0) = 0 THEN
    RETURN jsonb_build_object('status', 'nothing_to_deduct');
  END IF;

  SELECT array_agg(user_id) INTO v_owners
    FROM profiles WHERE clinic_id = v_appt.clinic_id;

  FOREACH v_supply IN ARRAY v_treat.supplies_needed LOOP
    v_supply := lower(btrim(v_supply));
    CONTINUE WHEN v_supply = '';

    -- Oldest (earliest-expiry) batch of a matching item.
    SELECT b.id AS batch_id, b.qty AS batch_qty, i.id AS item_id, i.user_id,
           i.room_id, i.name, i.quantity AS item_qty
      INTO v_batch
      FROM inventory_item_batches b
      JOIN inventory_items i ON i.id = b.item_id
     WHERE i.user_id = ANY (v_owners)
       AND lower(btrim(i.name)) = v_supply
       AND b.qty > 0
     ORDER BY b.expiry_date ASC NULLS LAST, i.id
     LIMIT 1
       FOR UPDATE OF b, i;

    IF FOUND THEN
      v_before := v_batch.item_qty;

      IF v_batch.batch_qty <= 1 THEN
        DELETE FROM inventory_item_batches WHERE id = v_batch.batch_id;
      ELSE
        UPDATE inventory_item_batches SET qty = qty - 1 WHERE id = v_batch.batch_id;
      END IF;

      SELECT COALESCE(SUM(qty), 0),
             COALESCE(SUM(qty * unit_price) / NULLIF(SUM(qty), 0), 0),
             MIN(expiry_date)
        INTO v_total, v_avg, v_expiry
        FROM inventory_item_batches WHERE item_id = v_batch.item_id;

      IF v_total <= 0 THEN
        DELETE FROM inventory_items WHERE id = v_batch.item_id;
      ELSE
        UPDATE inventory_items
           SET quantity = v_total, price = v_avg, expiry_date = v_expiry
         WHERE id = v_batch.item_id;
      END IF;

      v_after := v_total;
      v_item  := v_batch;
    ELSE
      -- Legacy item with no batch rows: take 1 from the item quantity itself.
      SELECT i.id AS item_id, i.user_id, i.room_id, i.name, i.quantity AS item_qty
        INTO v_item
        FROM inventory_items i
       WHERE i.user_id = ANY (v_owners)
         AND lower(btrim(i.name)) = v_supply
         AND i.quantity > 0
         AND NOT EXISTS (SELECT 1 FROM inventory_item_batches b WHERE b.item_id = i.id)
       ORDER BY i.expiry_date ASC NULLS LAST, i.id
       LIMIT 1
         FOR UPDATE OF i;

      IF NOT FOUND THEN
        v_missing := v_missing || to_jsonb(v_supply);
        CONTINUE;
      END IF;

      v_before := v_item.item_qty;
      v_after  := v_before - 1;
      IF v_after <= 0 THEN
        DELETE FROM inventory_items WHERE id = v_item.item_id;
        v_after := 0;
      ELSE
        UPDATE inventory_items SET quantity = v_after WHERE id = v_item.item_id;
      END IF;
    END IF;

    v_deducted := v_deducted || jsonb_build_object('name', v_item.name, 'qty', 1);

    -- Activity log (best effort: a logging problem must not undo the deduction).
    BEGIN
      SELECT name INTO v_room_name FROM inventory_rooms WHERE id = v_item.room_id;
      INSERT INTO inventory_activity_logs
        (id, user_id, room_id, room_name, action, details, created_at, actor_id, before_value, after_value)
      VALUES
        (gen_random_uuid(), v_item.user_id, v_item.room_id, v_room_name, 'remove',
         format('Auto-deducted 1 of "%s" (disposable, treatment "%s" completed)',
                v_item.name, v_treat.name),
         now(), auth.uid(), v_before::text, v_after::text);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END LOOP;

  UPDATE appointments SET supplies_deducted_at = now() WHERE id = p_appointment_id;

  RETURN jsonb_build_object('status', 'deducted', 'deducted', v_deducted, 'missing', v_missing);
END;
$$;

REVOKE ALL ON FUNCTION public.apt_deduct_disposables(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.apt_deduct_disposables(uuid) TO authenticated;
