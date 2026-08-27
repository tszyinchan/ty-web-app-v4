-- User lifecycle: deactivate / soft-delete / restore / reactivation asks.
-- Paste into the Supabase SQL editor (safe to re-run).
--
-- Inactive (status = 0, deleted_at IS NULL): pause. Sign-in is blocked and
-- records a reactivation request for Super Admin.
-- Soft-deleted (deleted_at set): gone. Sign-in looks like bad credentials.
-- The tyapp_user row stays for FKs. Chat: leave every room (same as the
-- existing leave RPC, including reassigning created_by). Old messages stay
-- and render as "Deleted user".

ALTER TABLE public.tyapp_user
  ALTER COLUMN legal_first_name DROP NOT NULL;
ALTER TABLE public.tyapp_user
  ALTER COLUMN legal_last_name DROP NOT NULL;

CREATE TABLE IF NOT EXISTS public.tyapp_account_reactivation_request (
  tb_tyapp_usr_ract_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.tyapp_user (user_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid REFERENCES public.tyapp_user (user_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS tyapp_account_reactivation_pending_uidx
  ON public.tyapp_account_reactivation_request (user_id)
  WHERE resolved_at IS NULL;

ALTER TABLE public.tyapp_account_reactivation_request ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tyapp_account_reactivation_request FROM PUBLIC, anon;
GRANT SELECT ON public.tyapp_account_reactivation_request TO authenticated;

DROP POLICY IF EXISTS tyapp_account_reactivation_select
  ON public.tyapp_account_reactivation_request;
CREATE POLICY tyapp_account_reactivation_select
  ON public.tyapp_account_reactivation_request
  FOR SELECT
  TO authenticated
  USING (
    public.tyapp_is_super_admin()
    OR user_id = auth.uid()
  );

CREATE OR REPLACE FUNCTION public.tyapp_user_active_super_admin_count()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::integer
  FROM public.tyapp_user
  WHERE deleted_at IS NULL
    AND status = 1
    AND role >= 998;
$$;

CREATE OR REPLACE FUNCTION public.tyapp_user_detach_from_chat(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room public.tyapp_chat_room;
  v_remaining uuid[];
  v_new_creator uuid;
BEGIN
  FOR v_room IN
    SELECT *
    FROM public.tyapp_chat_room
    WHERE deleted_at IS NULL
      AND p_user_id = ANY (member_user_ids)
  LOOP
    v_remaining := array_remove(v_room.member_user_ids, p_user_id);

    IF cardinality(v_remaining) < 2 THEN
      UPDATE public.tyapp_chat_room
      SET deleted_at = now()
      WHERE tb_tyapp_chat_rm_id = v_room.tb_tyapp_chat_rm_id
        AND deleted_at IS NULL;
      CONTINUE;
    END IF;

    v_new_creator := v_room.created_by;
    IF v_room.created_by = p_user_id THEN
      v_new_creator := v_remaining[1];
    END IF;

    UPDATE public.tyapp_chat_room
    SET
      created_by = v_new_creator,
      member_user_ids = v_remaining,
      former_member_user_ids = array_append(
        v_room.former_member_user_ids,
        p_user_id
      )
    WHERE tb_tyapp_chat_rm_id = v_room.tb_tyapp_chat_rm_id
      AND deleted_at IS NULL;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.tyapp_user_ban_auth(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  UPDATE auth.users
  SET banned_until = 'infinity'
  WHERE id = p_user_id;
EXCEPTION
  WHEN undefined_table OR insufficient_privilege OR undefined_column THEN
    NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.tyapp_user_unban_auth(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  UPDATE auth.users
  SET banned_until = NULL
  WHERE id = p_user_id;
EXCEPTION
  WHEN undefined_table OR insufficient_privilege OR undefined_column THEN
    NULL;
END;
$$;

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
  v_is_sa boolean := public.tyapp_is_super_admin();
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_status NOT IN (0, 1) THEN
    RAISE EXCEPTION 'Invalid status';
  END IF;

  IF NOT v_is_sa AND p_user_id IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION 'You can only change your own account status';
  END IF;

  IF NOT v_is_sa AND p_status = 1 THEN
    RAISE EXCEPTION 'Only a super admin can reactivate an account';
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

CREATE OR REPLACE FUNCTION public.tyapp_user_soft_delete(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.tyapp_user;
  v_actor uuid := auth.uid();
  v_is_sa boolean := public.tyapp_is_super_admin();
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT v_is_sa AND p_user_id IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION 'You can only delete your own account';
  END IF;

  SELECT * INTO v_row
  FROM public.tyapp_user
  WHERE user_id = p_user_id
    AND deleted_at IS NULL;

  IF v_row.user_id IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  IF v_row.role >= 998
     AND public.tyapp_user_active_super_admin_count() <= 1 THEN
    RAISE EXCEPTION 'Cannot delete the last super admin';
  END IF;

  PERFORM public.tyapp_user_detach_from_chat(p_user_id);

  DELETE FROM public.tyapp_user_group_member WHERE user_id = p_user_id;
  DELETE FROM public.tyapp_user_app_access WHERE user_id = p_user_id;
  DELETE FROM public.tyapp_user_feature_access WHERE user_id = p_user_id;
  DELETE FROM public.tyapp_push_subscription WHERE user_id = p_user_id;
  DELETE FROM public.tyapp_user_presence WHERE user_id = p_user_id;
  DELETE FROM public.tyapp_user_preference WHERE user_id = p_user_id;
  DELETE FROM public.tyapp_user_signature WHERE user_id = p_user_id;

  PERFORM set_config('tyapp.allow_user_lifecycle', 'on', true);

  UPDATE public.tyapp_user
  SET
    status = 0,
    deleted_at = now(),
    legal_first_name = NULL,
    legal_middle_name = NULL,
    legal_last_name = NULL,
    preferred_first_name = NULL,
    customized_display_name = 'Deleted user',
    name_display_mode = 5,
    remarks = NULL,
    appsheet_525_user_id = NULL,
    allowed_apps = '{}'
  WHERE user_id = p_user_id
    AND deleted_at IS NULL;

  UPDATE public.tyapp_account_reactivation_request
  SET
    resolved_at = now(),
    resolved_by = v_actor
  WHERE user_id = p_user_id
    AND resolved_at IS NULL;

  PERFORM public.tyapp_user_ban_auth(p_user_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.tyapp_user_restore(p_user_id uuid)
RETURNS public.tyapp_user
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.tyapp_user;
BEGIN
  IF NOT public.tyapp_is_super_admin() THEN
    RAISE EXCEPTION 'Only a super admin can restore an account';
  END IF;

  SELECT * INTO v_row
  FROM public.tyapp_user
  WHERE user_id = p_user_id
    AND deleted_at IS NOT NULL;

  IF v_row.user_id IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  PERFORM set_config('tyapp.allow_user_lifecycle', 'on', true);

  UPDATE public.tyapp_user
  SET
    deleted_at = NULL,
    status = 1
  WHERE user_id = p_user_id
  RETURNING * INTO v_row;

  PERFORM public.tyapp_user_unban_auth(p_user_id);

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.tyapp_user_request_reactivation()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.tyapp_user;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_row
  FROM public.tyapp_user
  WHERE user_id = v_uid
    AND deleted_at IS NULL;

  IF v_row.user_id IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  IF v_row.status IS DISTINCT FROM 0 THEN
    RETURN;
  END IF;

  INSERT INTO public.tyapp_account_reactivation_request (user_id)
  VALUES (v_uid)
  ON CONFLICT (user_id) WHERE resolved_at IS NULL
  DO NOTHING;
END;
$$;

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

CREATE OR REPLACE FUNCTION public.tyapp_is_super_admin()
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
       AND status = 1) >= 998,
    false
  );
$$;

GRANT EXECUTE ON FUNCTION public.tyapp_user_active_super_admin_count()
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.tyapp_user_set_status(uuid, integer)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.tyapp_user_soft_delete(uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.tyapp_user_restore(uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.tyapp_user_request_reactivation()
  TO authenticated;

REVOKE ALL ON FUNCTION public.tyapp_user_detach_from_chat(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tyapp_user_ban_auth(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tyapp_user_unban_auth(uuid)
  FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
