-- Let a yyHome (or legacy YYEMS) feature grant read and write the household
-- ledger. Cursor test logins can then open Split without an appsheet_525_user_id.
-- Safe to re-run. Paste into the Supabase SQL editor.

CREATE OR REPLACE FUNCTION public.tyapp_yyems_is_household_member()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    public.tyapp_is_super_admin()
    OR EXISTS (
      SELECT 1
      FROM public.tyapp_user u
      WHERE u.user_id = auth.uid()
        AND u.deleted_at IS NULL
        AND u.appsheet_525_user_id IS NOT NULL
        AND length(btrim(u.appsheet_525_user_id)) > 0
    )
    OR EXISTS (
      SELECT 1
      FROM public.tyapp_user_feature_access g
      JOIN public.tyapp_app_feature f
        ON f.tb_tyapp_ap_ftr_id = g.feature_id
      WHERE g.user_id = auth.uid()
        AND f.deleted_at IS NULL
        AND f.name IN ('yyHome', 'YYEMS')
    ),
    false
  );
$$;
