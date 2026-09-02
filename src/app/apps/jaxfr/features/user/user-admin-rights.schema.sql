-- Admin shares User-hub management (list, edit, groups, invites, activate),
-- but cannot act on Super Admin accounts, delete/restore others, or set
-- passwords. Invite codes and groups are a shared pool (no created_by lock).
-- Paste into the Supabase SQL editor (safe to re-run).
--
-- Do NOT widen tyapp_is_super_admin() — Archive / all-app bypass stay at 998.

CREATE OR REPLACE FUNCTION public.tyapp_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT role FROM public.tyapp_user
     WHERE user_id = auth.uid()
       AND deleted_at IS NULL
       AND status = 1) >= 900,
    false
  );
$$;

CREATE OR REPLACE FUNCTION public.tyapp_can_manage_user(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN public.tyapp_is_super_admin() THEN true
    WHEN public.tyapp_is_admin() THEN COALESCE(
      (
        SELECT role < 998
        FROM public.tyapp_user
        WHERE user_id = p_user_id
      ),
      false
    )
    ELSE false
  END;
$$;

GRANT EXECUTE ON FUNCTION public.tyapp_is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.tyapp_can_manage_user(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.tyapp_user_guard_self_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_setting('tyapp.allow_user_lifecycle', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF public.tyapp_is_super_admin() THEN
    RETURN NEW;
  END IF;

  IF public.tyapp_can_manage_user(OLD.user_id) THEN
    IF NEW.role >= 998 THEN
      RAISE EXCEPTION 'Only a super admin can assign the super admin role';
    END IF;
    NEW.user_id := OLD.user_id;
    NEW.deleted_at := OLD.deleted_at;
    NEW.created_at := OLD.created_at;
    NEW.tb_tyapp_pofl_seq_no := OLD.tb_tyapp_pofl_seq_no;
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

DROP POLICY IF EXISTS tyapp_user_feature_access_select
  ON public.tyapp_user_feature_access;
CREATE POLICY tyapp_user_feature_access_select
  ON public.tyapp_user_feature_access
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.tyapp_can_manage_user(user_id)
  );

DROP POLICY IF EXISTS tyapp_user_feature_access_write
  ON public.tyapp_user_feature_access;
CREATE POLICY tyapp_user_feature_access_write
  ON public.tyapp_user_feature_access
  FOR ALL
  TO authenticated
  USING (public.tyapp_can_manage_user(user_id))
  WITH CHECK (public.tyapp_can_manage_user(user_id));

DROP POLICY IF EXISTS tyapp_user_app_access_select
  ON public.tyapp_user_app_access;
CREATE POLICY tyapp_user_app_access_select
  ON public.tyapp_user_app_access
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.tyapp_can_manage_user(user_id)
  );

DROP POLICY IF EXISTS tyapp_user_app_access_write
  ON public.tyapp_user_app_access;
CREATE POLICY tyapp_user_app_access_write
  ON public.tyapp_user_app_access
  FOR ALL
  TO authenticated
  USING (public.tyapp_can_manage_user(user_id))
  WITH CHECK (public.tyapp_can_manage_user(user_id));

DROP POLICY IF EXISTS tyapp_invitation_select ON public.tyapp_invitation;
CREATE POLICY tyapp_invitation_select
  ON public.tyapp_invitation
  FOR SELECT
  TO authenticated
  USING (public.tyapp_is_admin());

DROP POLICY IF EXISTS tyapp_invitation_write ON public.tyapp_invitation;
CREATE POLICY tyapp_invitation_write
  ON public.tyapp_invitation
  FOR ALL
  TO authenticated
  USING (public.tyapp_is_admin())
  WITH CHECK (public.tyapp_is_admin());

CREATE OR REPLACE FUNCTION public.tyapp_invitation_soft_delete_single_record(
  record_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.tyapp_is_admin() THEN
    RAISE EXCEPTION 'Only an admin can delete invitations';
  END IF;

  UPDATE public.tyapp_invitation
  SET deleted_at = now()
  WHERE tb_tyapp_inv_id = record_id
    AND deleted_at IS NULL;
END;
$$;

DROP POLICY IF EXISTS tyapp_user_group_select ON public.tyapp_user_group;
CREATE POLICY tyapp_user_group_select
  ON public.tyapp_user_group
  FOR SELECT
  TO authenticated
  USING (
    public.tyapp_is_admin()
    OR (
      deleted_at IS NULL
      AND tb_tyapp_usr_grp_id = ANY (public.tyapp_user_my_active_group_ids())
    )
  );

DROP POLICY IF EXISTS tyapp_user_group_write ON public.tyapp_user_group;
CREATE POLICY tyapp_user_group_write
  ON public.tyapp_user_group
  FOR ALL
  TO authenticated
  USING (public.tyapp_is_admin())
  WITH CHECK (public.tyapp_is_admin());

DROP POLICY IF EXISTS tyapp_user_group_member_select
  ON public.tyapp_user_group_member;
CREATE POLICY tyapp_user_group_member_select
  ON public.tyapp_user_group_member
  FOR SELECT
  TO authenticated
  USING (
    public.tyapp_is_admin()
    OR group_id = ANY (public.tyapp_user_my_active_group_ids())
  );

DROP POLICY IF EXISTS tyapp_user_group_member_write
  ON public.tyapp_user_group_member;
CREATE POLICY tyapp_user_group_member_write
  ON public.tyapp_user_group_member
  FOR ALL
  TO authenticated
  USING (public.tyapp_is_admin())
  WITH CHECK (public.tyapp_is_admin());

CREATE OR REPLACE FUNCTION public.tyapp_user_group_soft_delete_single_record(
  record_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.tyapp_is_admin() THEN
    RAISE EXCEPTION 'Only an admin can delete groups';
  END IF;

  UPDATE public.tyapp_user_group
  SET deleted_at = now()
  WHERE tb_tyapp_usr_grp_id = record_id
    AND deleted_at IS NULL;
END;
$$;

DROP POLICY IF EXISTS tyapp_account_reactivation_select
  ON public.tyapp_account_reactivation_request;
CREATE POLICY tyapp_account_reactivation_select
  ON public.tyapp_account_reactivation_request
  FOR SELECT
  TO authenticated
  USING (
    public.tyapp_is_admin()
    OR user_id = auth.uid()
  );

CREATE OR REPLACE FUNCTION public.tyapp_user_set_status(
  p_user_id uuid,
  p_status integer
)
RETURNS public.tyapp_user
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.tyapp_user;
  v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_status NOT IN (0, 1) THEN
    RAISE EXCEPTION 'Invalid status';
  END IF;

  IF p_user_id IS DISTINCT FROM v_actor THEN
    IF NOT public.tyapp_can_manage_user(p_user_id) THEN
      RAISE EXCEPTION 'You cannot change this account status';
    END IF;
  ELSIF p_status = 1 THEN
    RAISE EXCEPTION 'Only an admin can reactivate an account';
  END IF;

  SELECT * INTO v_row
  FROM public.tyapp_user
  WHERE user_id = p_user_id
    AND deleted_at IS NULL;

  IF v_row.user_id IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  IF p_status = 0
     AND v_row.role >= 998
     AND public.tyapp_user_active_super_admin_count() <= 1 THEN
    RAISE EXCEPTION 'Cannot deactivate the last super admin';
  END IF;

  PERFORM set_config('tyapp.allow_user_lifecycle', 'on', true);

  UPDATE public.tyapp_user
  SET status = p_status
  WHERE user_id = p_user_id
    AND deleted_at IS NULL
  RETURNING * INTO v_row;

  IF p_status = 1 THEN
    UPDATE public.tyapp_account_reactivation_request
    SET
      resolved_at = now(),
      resolved_by = v_actor
    WHERE user_id = p_user_id
      AND resolved_at IS NULL;

    PERFORM public.tyapp_user_unban_auth(p_user_id);
  END IF;

  RETURN v_row;
END;
$$;

NOTIFY pgrst, 'reload schema';
