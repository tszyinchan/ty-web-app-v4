-- User profile self-edit (Phase 1).
-- Paste into the Supabase SQL editor (safe to re-run).
--
-- Super Admin (role >= 998) can still update any tyapp_user row and rewrite
-- app/feature grants. Everyone else may only update their own profile name
-- fields; role / status / grants / remarks / YY525 binding stay frozen.
--
-- SELECT on tyapp_user is unchanged: authenticated users can still read the
-- full directory (Chat display names). Groups will tighten that later.

CREATE OR REPLACE FUNCTION public.tyapp_is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT role FROM public.tyapp_user
     WHERE user_id = auth.uid() AND deleted_at IS NULL) >= 998,
    false
  );
$$;

GRANT EXECUTE ON FUNCTION public.tyapp_is_super_admin() TO authenticated;

CREATE OR REPLACE FUNCTION public.tyapp_user_guard_self_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.tyapp_is_super_admin() THEN
    RETURN NEW;
  END IF;

  IF OLD.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'You can only update your own profile';
  END IF;

  NEW.user_id := OLD.user_id;
  NEW.role := OLD.role;
  NEW.status := OLD.status;
  NEW.allowed_apps := OLD.allowed_apps;
  NEW.appsheet_525_user_id := OLD.appsheet_525_user_id;
  NEW.remarks := OLD.remarks;
  NEW.tb_tyapp_pofl_seq_no := OLD.tb_tyapp_pofl_seq_no;
  NEW.deleted_at := OLD.deleted_at;
  NEW.created_at := OLD.created_at;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tyapp_user_guard_self_update ON public.tyapp_user;
CREATE TRIGGER tyapp_user_guard_self_update
  BEFORE UPDATE ON public.tyapp_user
  FOR EACH ROW
  EXECUTE FUNCTION public.tyapp_user_guard_self_update();

-- Grant tables: only Super Admin may read/write another user's grants.
-- Self-read stays so AccessService.fetchMyAccess() still works.

DROP POLICY IF EXISTS tyapp_user_feature_access_select ON public.tyapp_user_feature_access;
CREATE POLICY tyapp_user_feature_access_select
  ON public.tyapp_user_feature_access
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.tyapp_is_super_admin());

DROP POLICY IF EXISTS tyapp_user_feature_access_write ON public.tyapp_user_feature_access;
CREATE POLICY tyapp_user_feature_access_write
  ON public.tyapp_user_feature_access
  FOR ALL
  TO authenticated
  USING (public.tyapp_is_super_admin())
  WITH CHECK (public.tyapp_is_super_admin());

DROP POLICY IF EXISTS tyapp_user_app_access_select ON public.tyapp_user_app_access;
CREATE POLICY tyapp_user_app_access_select
  ON public.tyapp_user_app_access
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.tyapp_is_super_admin());

DROP POLICY IF EXISTS tyapp_user_app_access_write ON public.tyapp_user_app_access;
CREATE POLICY tyapp_user_app_access_write
  ON public.tyapp_user_app_access
  FOR ALL
  TO authenticated
  USING (public.tyapp_is_super_admin())
  WITH CHECK (public.tyapp_is_super_admin());
