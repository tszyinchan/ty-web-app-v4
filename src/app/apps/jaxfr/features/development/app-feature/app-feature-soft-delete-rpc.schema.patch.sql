-- Create the Feature soft-delete RPC and refresh PostgREST's schema cache.
-- The first migration often stopped on RENAME (already renamed) before
-- this function was created, which is why delete fails with
-- "Could not find the function ... in the schema cache".
-- Paste into the Supabase SQL editor and run.

DROP FUNCTION IF EXISTS public.tyapp_app_category_soft_delete_single_record(uuid);

CREATE OR REPLACE FUNCTION public.tyapp_app_feature_soft_delete_single_record(
  record_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.tyapp_is_admin() THEN
    RAISE EXCEPTION 'Only admins can delete features';
  END IF;

  UPDATE public.tyapp_app_feature
  SET deleted_at = now()
  WHERE tb_tyapp_ap_ftr_id = record_id
    AND deleted_at IS NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.tyapp_app_feature_soft_delete_single_record(uuid)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
