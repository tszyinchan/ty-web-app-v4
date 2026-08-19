-- Soft-delete RPC for tyapp_app.
-- Safe to re-run. Paste into the Supabase SQL editor.

CREATE OR REPLACE FUNCTION public.tyapp_app_soft_delete_single_record(
  record_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.tyapp_is_admin() THEN
    RAISE EXCEPTION 'Only admins can delete apps';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.tyapp_app_feature
    WHERE app_id = record_id
      AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Move or delete its features first.';
  END IF;

  UPDATE public.tyapp_app
  SET deleted_at = now()
  WHERE tb_tyapp_app_id = record_id
    AND deleted_at IS NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.tyapp_app_soft_delete_single_record(uuid)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
