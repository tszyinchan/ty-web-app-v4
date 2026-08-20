-- User groups (overlapping circles).
-- Paste into the Supabase SQL editor (safe to re-run).
--
-- Visibility = union of members of groups I belong to (active, not deleted).
-- Super Admin does NOT bypass this for Chat / Filelink pickers — add them
-- to a group if they should participate. Super Admin still manages every
-- profile and every group via the User feature (role, not group).
--
-- Chat rooms: all members must belong to one common group. Existing rooms
-- that predate groups can keep chatting; adding members is blocked until
-- the member set fits a group.

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.tyapp_user_group (
  tb_tyapp_usr_grp_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  customized_order integer NOT NULL DEFAULT 0,
  remarks text,
  status integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

DROP TRIGGER IF EXISTS tyapp_user_group_set_updated_at ON public.tyapp_user_group;
CREATE TRIGGER tyapp_user_group_set_updated_at
  BEFORE INSERT OR UPDATE ON public.tyapp_user_group
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.tyapp_user_group_member (
  tb_tyapp_usr_grp_mbr_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.tyapp_user_group (tb_tyapp_usr_grp_id),
  user_id uuid NOT NULL REFERENCES public.tyapp_user (user_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tyapp_user_group_member_unique UNIQUE (group_id, user_id)
);

CREATE INDEX IF NOT EXISTS tyapp_user_group_member_group_idx
  ON public.tyapp_user_group_member (group_id);
CREATE INDEX IF NOT EXISTS tyapp_user_group_member_user_idx
  ON public.tyapp_user_group_member (user_id);

CREATE OR REPLACE FUNCTION public.tyapp_user_my_active_group_ids()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(m.group_id), '{}')
  FROM public.tyapp_user_group_member m
  INNER JOIN public.tyapp_user_group g
    ON g.tb_tyapp_usr_grp_id = m.group_id
  WHERE m.user_id = auth.uid()
    AND g.deleted_at IS NULL
    AND g.status = 1;
$$;

CREATE OR REPLACE FUNCTION public.tyapp_user_ids_share_a_group(p_user_ids uuid[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_user_ids IS NULL OR cardinality(p_user_ids) < 2 THEN true
    ELSE EXISTS (
      SELECT 1
      FROM public.tyapp_user_group g
      WHERE g.deleted_at IS NULL
        AND g.status = 1
        AND NOT EXISTS (
          SELECT 1
          FROM unnest(p_user_ids) AS u(id)
          WHERE NOT EXISTS (
            SELECT 1
            FROM public.tyapp_user_group_member m
            WHERE m.group_id = g.tb_tyapp_usr_grp_id
              AND m.user_id = u.id
          )
        )
    )
  END;
$$;

CREATE OR REPLACE FUNCTION public.tyapp_user_group_soft_delete_single_record(
  record_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.tyapp_is_super_admin() THEN
    RAISE EXCEPTION 'Only a super admin can delete groups';
  END IF;

  UPDATE public.tyapp_user_group
  SET deleted_at = now()
  WHERE tb_tyapp_usr_grp_id = record_id
    AND deleted_at IS NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.tyapp_chat_enforce_single_group()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT public.tyapp_user_ids_share_a_group(NEW.member_user_ids) THEN
      RAISE EXCEPTION 'Everyone in a room must belong to the same user group';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.member_user_ids IS DISTINCT FROM OLD.member_user_ids
     AND cardinality(NEW.member_user_ids) > cardinality(OLD.member_user_ids)
     AND NOT public.tyapp_user_ids_share_a_group(NEW.member_user_ids) THEN
    RAISE EXCEPTION 'Everyone in a room must belong to the same user group';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tyapp_chat_enforce_single_group ON public.tyapp_chat_room;
CREATE TRIGGER tyapp_chat_enforce_single_group
  BEFORE INSERT OR UPDATE OF member_user_ids ON public.tyapp_chat_room
  FOR EACH ROW
  EXECUTE FUNCTION public.tyapp_chat_enforce_single_group();

ALTER TABLE public.tyapp_user_group ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tyapp_user_group FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON public.tyapp_user_group TO authenticated;

ALTER TABLE public.tyapp_user_group_member ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tyapp_user_group_member FROM PUBLIC, anon;
GRANT SELECT, INSERT, DELETE ON public.tyapp_user_group_member TO authenticated;

DROP POLICY IF EXISTS tyapp_user_group_select ON public.tyapp_user_group;
CREATE POLICY tyapp_user_group_select
  ON public.tyapp_user_group
  FOR SELECT
  TO authenticated
  USING (
    public.tyapp_is_super_admin()
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
  USING (public.tyapp_is_super_admin())
  WITH CHECK (public.tyapp_is_super_admin());

DROP POLICY IF EXISTS tyapp_user_group_member_select ON public.tyapp_user_group_member;
CREATE POLICY tyapp_user_group_member_select
  ON public.tyapp_user_group_member
  FOR SELECT
  TO authenticated
  USING (
    public.tyapp_is_super_admin()
    OR group_id = ANY (public.tyapp_user_my_active_group_ids())
  );

DROP POLICY IF EXISTS tyapp_user_group_member_write ON public.tyapp_user_group_member;
CREATE POLICY tyapp_user_group_member_write
  ON public.tyapp_user_group_member
  FOR ALL
  TO authenticated
  USING (public.tyapp_is_super_admin())
  WITH CHECK (public.tyapp_is_super_admin());

GRANT EXECUTE ON FUNCTION public.tyapp_user_my_active_group_ids()
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.tyapp_user_ids_share_a_group(uuid[])
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.tyapp_user_group_soft_delete_single_record(uuid)
  TO authenticated;

ALTER TABLE public.tyapp_user_group REPLICA IDENTITY FULL;
ALTER TABLE public.tyapp_user_group_member REPLICA IDENTITY FULL;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.tyapp_user_group;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.tyapp_user_group_member;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

NOTIFY pgrst, 'reload schema';
