-- Safe patch for an already-created Daily Checklist database.
-- Does not drop tables. Paste into the Supabase SQL Editor and run.

CREATE OR REPLACE FUNCTION public.tyapp_daily_checklist_item_soft_delete_single_record(
  record_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_found uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT tb_tyapp_dcl_itm_id
  INTO v_found
  FROM public.tyapp_daily_checklist_item
  WHERE tb_tyapp_dcl_itm_id = record_id
    AND user_id = v_uid
    AND deleted_at IS NULL;

  IF v_found IS NULL THEN
    RAISE EXCEPTION 'Checklist item not found or inaccessible';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.tyapp_daily_checklist_day_item d
    WHERE d.item_id = record_id
      AND d.user_id = v_uid
      AND d.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Cannot delete this item while it is still on a date.';
  END IF;

  UPDATE public.tyapp_daily_checklist_standard_item
  SET deleted_at = now()
  WHERE item_id = record_id
    AND user_id = v_uid
    AND deleted_at IS NULL;

  UPDATE public.tyapp_daily_checklist_item
  SET deleted_at = now()
  WHERE tb_tyapp_dcl_itm_id = record_id
    AND user_id = v_uid
    AND deleted_at IS NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.tyapp_daily_checklist_item_soft_delete_single_record(uuid)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
