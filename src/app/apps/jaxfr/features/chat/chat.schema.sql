-- Jaxfr Chat schema, RLS, and RPCs.
-- Paste this entire file into the Supabase SQL editor.
-- After it runs, confirm Realtime is enabled for the chat tables
-- (Database → Replication, or the ALTER PUBLICATION statements below).
--
-- Edit / delete windows come from tyapp_app_settings (see
-- features/development/app-settings/app-settings.schema.sql).
-- Run that schema first, or include it in chat.schema.patch.sql.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.tyapp_chat_room (
  tb_tyapp_chat_rm_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tb_tyapp_chat_rm_seq_no bigint GENERATED ALWAYS AS IDENTITY,
  name text NOT NULL,
  description text,
  member_user_ids uuid[] NOT NULL,
  -- Lets a just-removed member still SELECT the row so Realtime can
  -- deliver the membership UPDATE (app then drops the room locally).
  former_member_user_ids uuid[] NOT NULL DEFAULT '{}',
  created_by uuid NOT NULL REFERENCES public.tyapp_user (user_id),
  last_message_at timestamptz,
  status smallint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT tyapp_chat_room_name_not_blank CHECK (length(trim(name)) > 0),
  CONSTRAINT tyapp_chat_room_min_members CHECK (cardinality(member_user_ids) >= 2),
  -- Keep in sync with CHAT_ROOM_DESCRIPTION_MAX in chat.constants.ts
  CONSTRAINT tyapp_chat_room_description_len
    CHECK (description IS NULL OR length(description) <= 500)
);

CREATE TABLE IF NOT EXISTS public.tyapp_chat_message (
  tb_tyapp_chat_msg_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tb_tyapp_chat_msg_seq_no bigint GENERATED ALWAYS AS IDENTITY,
  room_id uuid NOT NULL REFERENCES public.tyapp_chat_room (tb_tyapp_chat_rm_id),
  sender_user_id uuid NOT NULL REFERENCES public.tyapp_user (user_id),
  msg_type smallint NOT NULL DEFAULT 1,
  body text NOT NULL DEFAULT '',
  body_plain text NOT NULL DEFAULT '',
  quote_message_ids uuid[] NOT NULL DEFAULT '{}',
  reactions jsonb NOT NULL DEFAULT '{}'::jsonb,
  edited_at timestamptz,
  status smallint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  -- Keep in sync with CHAT_QUOTE_MAX in chat.constants.ts
  CONSTRAINT tyapp_chat_message_quote_ids_max
    CHECK (cardinality(quote_message_ids) <= 10)
);

CREATE INDEX IF NOT EXISTS tyapp_chat_message_room_created_idx
  ON public.tyapp_chat_message (room_id, created_at);

CREATE INDEX IF NOT EXISTS tyapp_chat_room_last_msg_idx
  ON public.tyapp_chat_room (last_message_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS tyapp_chat_room_members_idx
  ON public.tyapp_chat_room USING GIN (member_user_ids);

-- One watermark row per member per room (not per message).
CREATE TABLE IF NOT EXISTS public.tyapp_chat_room_read (
  tb_tyapp_chat_rd_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tb_tyapp_chat_rd_seq_no bigint GENERATED ALWAYS AS IDENTITY,
  room_id uuid NOT NULL REFERENCES public.tyapp_chat_room (tb_tyapp_chat_rm_id),
  user_id uuid NOT NULL REFERENCES public.tyapp_user (user_id),
  last_read_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tyapp_chat_room_read_unique UNIQUE (room_id, user_id)
);

CREATE INDEX IF NOT EXISTS tyapp_chat_room_read_room_idx
  ON public.tyapp_chat_room_read (room_id);

-- ---------------------------------------------------------------------------
-- updated_at + last_message_at
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.tyapp_chat_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tyapp_chat_room_set_updated_at ON public.tyapp_chat_room;
CREATE TRIGGER tyapp_chat_room_set_updated_at
  BEFORE UPDATE ON public.tyapp_chat_room
  FOR EACH ROW
  EXECUTE FUNCTION public.tyapp_chat_set_updated_at();

DROP TRIGGER IF EXISTS tyapp_chat_message_set_updated_at ON public.tyapp_chat_message;
CREATE TRIGGER tyapp_chat_message_set_updated_at
  BEFORE UPDATE ON public.tyapp_chat_message
  FOR EACH ROW
  EXECUTE FUNCTION public.tyapp_chat_set_updated_at();

DROP TRIGGER IF EXISTS tyapp_chat_room_read_set_updated_at ON public.tyapp_chat_room_read;
CREATE TRIGGER tyapp_chat_room_read_set_updated_at
  BEFORE UPDATE ON public.tyapp_chat_room_read
  FOR EACH ROW
  EXECUTE FUNCTION public.tyapp_chat_set_updated_at();

CREATE OR REPLACE FUNCTION public.tyapp_chat_after_message_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.tyapp_chat_room
  SET last_message_at = NEW.created_at
  WHERE tb_tyapp_chat_rm_id = NEW.room_id
    AND deleted_at IS NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tyapp_chat_message_after_insert ON public.tyapp_chat_message;
CREATE TRIGGER tyapp_chat_message_after_insert
  AFTER INSERT ON public.tyapp_chat_message
  FOR EACH ROW
  EXECUTE FUNCTION public.tyapp_chat_after_message_insert();

-- ---------------------------------------------------------------------------
-- Membership helper (security definer so message RLS can check the parent)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.tyapp_chat_is_room_member(p_room_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tyapp_chat_room r
    WHERE r.tb_tyapp_chat_rm_id = p_room_id
      AND r.deleted_at IS NULL
      AND auth.uid() = ANY (r.member_user_ids)
  );
$$;

CREATE OR REPLACE FUNCTION public.tyapp_chat_is_room_creator(p_room_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tyapp_chat_room r
    WHERE r.tb_tyapp_chat_rm_id = p_room_id
      AND r.deleted_at IS NULL
      AND r.created_by = auth.uid()
      AND auth.uid() = ANY (r.member_user_ids)
  );
$$;

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.tyapp_chat_edit_message(
  p_message_id uuid,
  p_body text,
  p_body_plain text
)
RETURNS public.tyapp_chat_message
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.tyapp_chat_message;
  v_edit_ms integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT *
  INTO v_row
  FROM public.tyapp_chat_message
  WHERE tb_tyapp_chat_msg_id = p_message_id
    AND deleted_at IS NULL;

  IF v_row.tb_tyapp_chat_msg_id IS NULL THEN
    RAISE EXCEPTION 'Message not found';
  END IF;

  IF v_row.sender_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Only the original sender can edit';
  END IF;

  IF NOT public.tyapp_chat_is_room_member(v_row.room_id) THEN
    RAISE EXCEPTION 'Not a room member';
  END IF;

  SELECT chat_edit_window_ms
  INTO v_edit_ms
  FROM public.tyapp_app_settings
  WHERE singleton_key = 1
    AND deleted_at IS NULL
    AND status = 1;

  IF v_edit_ms IS NULL THEN
    RAISE EXCEPTION 'App settings are missing';
  END IF;

  IF now() > v_row.created_at + (v_edit_ms * interval '1 millisecond') THEN
    RAISE EXCEPTION 'Edit window has expired';
  END IF;

  UPDATE public.tyapp_chat_message
  SET
    body = COALESCE(p_body, ''),
    body_plain = COALESCE(p_body_plain, ''),
    edited_at = now()
  WHERE tb_tyapp_chat_msg_id = p_message_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.tyapp_chat_toggle_reaction(
  p_message_id uuid,
  p_emoji text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room_id uuid;
  v_reactions jsonb;
  v_list jsonb;
  v_uid uuid := auth.uid();
  v_found boolean;
  v_new_list jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_emoji IS NULL OR length(trim(p_emoji)) = 0 OR length(p_emoji) > 64 THEN
    RAISE EXCEPTION 'Invalid emoji';
  END IF;

  SELECT room_id, reactions
  INTO v_room_id, v_reactions
  FROM public.tyapp_chat_message
  WHERE tb_tyapp_chat_msg_id = p_message_id
    AND deleted_at IS NULL;

  IF v_room_id IS NULL THEN
    RAISE EXCEPTION 'Message not found';
  END IF;

  IF NOT public.tyapp_chat_is_room_member(v_room_id) THEN
    RAISE EXCEPTION 'Not a room member';
  END IF;

  v_reactions := COALESCE(v_reactions, '{}'::jsonb);
  v_list := COALESCE(v_reactions -> p_emoji, '[]'::jsonb);

  SELECT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_list) e
    WHERE e ->> 'user_id' = v_uid::text
  )
  INTO v_found;

  IF v_found THEN
    SELECT COALESCE(jsonb_agg(e), '[]'::jsonb)
    INTO v_new_list
    FROM jsonb_array_elements(v_list) e
    WHERE e ->> 'user_id' <> v_uid::text;
  ELSE
    v_new_list := v_list || jsonb_build_array(
      jsonb_build_object(
        'user_id', v_uid,
        'created_at', now()
      )
    );
  END IF;

  IF v_new_list = '[]'::jsonb THEN
    v_reactions := v_reactions - p_emoji;
  ELSE
    v_reactions := jsonb_set(v_reactions, ARRAY[p_emoji], v_new_list);
  END IF;

  UPDATE public.tyapp_chat_message
  SET reactions = v_reactions
  WHERE tb_tyapp_chat_msg_id = p_message_id;

  RETURN v_reactions;
END;
$$;

CREATE OR REPLACE FUNCTION public.tyapp_chat_message_soft_delete_single_record(
  record_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sender uuid;
  v_room_id uuid;
  v_created_at timestamptz;
  v_delete_ms integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT sender_user_id, room_id, created_at
  INTO v_sender, v_room_id, v_created_at
  FROM public.tyapp_chat_message
  WHERE tb_tyapp_chat_msg_id = record_id
    AND deleted_at IS NULL;

  IF v_room_id IS NULL THEN
    RAISE EXCEPTION 'Message not found';
  END IF;

  IF v_sender IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Only the original sender can delete';
  END IF;

  IF NOT public.tyapp_chat_is_room_member(v_room_id) THEN
    RAISE EXCEPTION 'Not a room member';
  END IF;

  SELECT chat_delete_window_ms
  INTO v_delete_ms
  FROM public.tyapp_app_settings
  WHERE singleton_key = 1
    AND deleted_at IS NULL
    AND status = 1;

  IF v_delete_ms IS NULL THEN
    RAISE EXCEPTION 'App settings are missing';
  END IF;

  IF now() > v_created_at + (v_delete_ms * interval '1 millisecond') THEN
    RAISE EXCEPTION 'Delete window has expired';
  END IF;

  UPDATE public.tyapp_chat_message
  SET deleted_at = now()
  WHERE tb_tyapp_chat_msg_id = record_id
    AND deleted_at IS NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.tyapp_chat_room_soft_delete_single_record(
  record_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.tyapp_chat_is_room_creator(record_id) THEN
    RAISE EXCEPTION 'Only the room creator can delete this room';
  END IF;

  -- Only the room itself is soft-deleted; messages are left as-is (they
  -- become unreachable once the room's deleted_at is set, since RLS checks
  -- room membership + deleted_at IS NULL for every message read).
  UPDATE public.tyapp_chat_room
  SET deleted_at = now()
  WHERE tb_tyapp_chat_rm_id = record_id
    AND deleted_at IS NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.tyapp_chat_rename_room(
  p_room_id uuid,
  p_name text
)
RETURNS public.tyapp_chat_room
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.tyapp_chat_room;
  v_name text := trim(p_name);
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF v_name IS NULL OR length(v_name) = 0 THEN
    RAISE EXCEPTION 'Room name is required';
  END IF;

  IF NOT public.tyapp_chat_is_room_creator(p_room_id) THEN
    RAISE EXCEPTION 'Only the room creator can rename this room';
  END IF;

  UPDATE public.tyapp_chat_room
  SET name = v_name
  WHERE tb_tyapp_chat_rm_id = p_room_id
    AND deleted_at IS NULL
  RETURNING * INTO v_row;

  IF v_row.tb_tyapp_chat_rm_id IS NULL THEN
    RAISE EXCEPTION 'Room not found';
  END IF;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.tyapp_chat_set_room_description(
  p_room_id uuid,
  p_description text
)
RETURNS public.tyapp_chat_room
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.tyapp_chat_room;
  v_desc text := nullif(trim(p_description), '');
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.tyapp_chat_is_room_creator(p_room_id) THEN
    RAISE EXCEPTION 'Only the room creator can edit the description';
  END IF;

  IF v_desc IS NOT NULL AND length(v_desc) > 500 THEN
    RAISE EXCEPTION 'Description is too long';
  END IF;

  UPDATE public.tyapp_chat_room
  SET description = v_desc
  WHERE tb_tyapp_chat_rm_id = p_room_id
    AND deleted_at IS NULL
  RETURNING * INTO v_row;

  IF v_row.tb_tyapp_chat_rm_id IS NULL THEN
    RAISE EXCEPTION 'Room not found';
  END IF;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.tyapp_chat_add_room_members(
  p_room_id uuid,
  p_user_ids uuid[]
)
RETURNS public.tyapp_chat_room
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.tyapp_chat_room;
  v_add uuid[];
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.tyapp_chat_is_room_creator(p_room_id) THEN
    RAISE EXCEPTION 'Only the room creator can add members';
  END IF;

  SELECT *
  INTO v_row
  FROM public.tyapp_chat_room
  WHERE tb_tyapp_chat_rm_id = p_room_id
    AND deleted_at IS NULL;

  IF v_row.tb_tyapp_chat_rm_id IS NULL THEN
    RAISE EXCEPTION 'Room not found';
  END IF;

  SELECT COALESCE(array_agg(DISTINCT u.user_id), '{}')
  INTO v_add
  FROM unnest(COALESCE(p_user_ids, '{}')) AS x(id)
  INNER JOIN public.tyapp_user u
    ON u.user_id = x.id
   AND u.deleted_at IS NULL
  WHERE NOT (x.id = ANY (v_row.member_user_ids));

  IF cardinality(v_add) = 0 THEN
    RAISE EXCEPTION 'No valid users to add';
  END IF;

  UPDATE public.tyapp_chat_room
  SET
    member_user_ids = v_row.member_user_ids || v_add,
    former_member_user_ids = COALESCE((
      SELECT array_agg(f)
      FROM unnest(v_row.former_member_user_ids) AS f
      WHERE NOT (f = ANY (v_add))
    ), '{}')
  WHERE tb_tyapp_chat_rm_id = p_room_id
    AND deleted_at IS NULL
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.tyapp_chat_remove_room_member(
  p_room_id uuid,
  p_user_id uuid
)
RETURNS public.tyapp_chat_room
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.tyapp_chat_room;
  v_remaining uuid[];
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.tyapp_chat_is_room_creator(p_room_id) THEN
    RAISE EXCEPTION 'Only the room creator can remove members';
  END IF;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'User is required';
  END IF;

  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Room creator cannot leave the room. Delete the room instead.';
  END IF;

  SELECT *
  INTO v_row
  FROM public.tyapp_chat_room
  WHERE tb_tyapp_chat_rm_id = p_room_id
    AND deleted_at IS NULL;

  IF v_row.tb_tyapp_chat_rm_id IS NULL THEN
    RAISE EXCEPTION 'Room not found';
  END IF;

  IF NOT (p_user_id = ANY (v_row.member_user_ids)) THEN
    RAISE EXCEPTION 'User is not a room member';
  END IF;

  v_remaining := array_remove(v_row.member_user_ids, p_user_id);

  IF cardinality(v_remaining) < 2 THEN
    RAISE EXCEPTION 'A room needs at least two people. Delete the room instead.';
  END IF;

  UPDATE public.tyapp_chat_room
  SET
    member_user_ids = v_remaining,
    former_member_user_ids = array_append(v_row.former_member_user_ids, p_user_id)
  WHERE tb_tyapp_chat_rm_id = p_room_id
    AND deleted_at IS NULL
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.tyapp_chat_leave_room(p_room_id uuid)
RETURNS public.tyapp_chat_room
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.tyapp_chat_room;
  v_uid uuid := auth.uid();
  v_remaining uuid[];
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT *
  INTO v_row
  FROM public.tyapp_chat_room
  WHERE tb_tyapp_chat_rm_id = p_room_id
    AND deleted_at IS NULL;

  IF v_row.tb_tyapp_chat_rm_id IS NULL THEN
    RAISE EXCEPTION 'Room not found';
  END IF;

  IF NOT (v_uid = ANY (v_row.member_user_ids)) THEN
    RAISE EXCEPTION 'Not a room member';
  END IF;

  -- The creator is the only one who can manage membership and delete the
  -- room, so they are never allowed to leave (must delete the room instead).
  IF v_row.created_by = v_uid THEN
    RAISE EXCEPTION 'Room creator cannot leave the room. Delete the room instead.';
  END IF;

  v_remaining := array_remove(v_row.member_user_ids, v_uid);

  -- A room cannot exist with fewer than 2 members: leaving as the
  -- second-to-last person soft-deletes the room (same as Delete). Only the
  -- room itself is soft-deleted; messages are left as-is (see the note in
  -- tyapp_chat_room_soft_delete_single_record).
  IF cardinality(v_remaining) < 2 THEN
    UPDATE public.tyapp_chat_room
    SET deleted_at = now()
    WHERE tb_tyapp_chat_rm_id = p_room_id
      AND deleted_at IS NULL
    RETURNING * INTO v_row;

    RETURN v_row;
  END IF;

  UPDATE public.tyapp_chat_room
  SET
    member_user_ids = v_remaining,
    former_member_user_ids = array_append(v_row.former_member_user_ids, v_uid)
  WHERE tb_tyapp_chat_rm_id = p_room_id
    AND deleted_at IS NULL
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.tyapp_chat_mark_room_read(p_room_id uuid)
RETURNS public.tyapp_chat_room_read
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.tyapp_chat_room_read;
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.tyapp_chat_is_room_member(p_room_id) THEN
    RAISE EXCEPTION 'Not a room member';
  END IF;

  INSERT INTO public.tyapp_chat_room_read (room_id, user_id, last_read_at)
  VALUES (p_room_id, v_uid, now())
  ON CONFLICT (room_id, user_id)
  DO UPDATE SET
    last_read_at = GREATEST(
      public.tyapp_chat_room_read.last_read_at,
      EXCLUDED.last_read_at
    )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.tyapp_chat_unread_counts()
RETURNS TABLE (room_id uuid, unread_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.room_id, count(*)::bigint
  FROM public.tyapp_chat_message m
  INNER JOIN public.tyapp_chat_room r
    ON r.tb_tyapp_chat_rm_id = m.room_id
   AND r.deleted_at IS NULL
   AND auth.uid() = ANY (r.member_user_ids)
  LEFT JOIN public.tyapp_chat_room_read rd
    ON rd.room_id = m.room_id
   AND rd.user_id = auth.uid()
  WHERE m.deleted_at IS NULL
    AND m.sender_user_id IS DISTINCT FROM auth.uid()
    AND (rd.last_read_at IS NULL OR m.created_at > rd.last_read_at)
  GROUP BY m.room_id;
$$;

-- ---------------------------------------------------------------------------
-- Grants: members may SELECT/INSERT; UPDATE/DELETE go through RPCs
-- ---------------------------------------------------------------------------

ALTER TABLE public.tyapp_chat_room ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tyapp_chat_message ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tyapp_chat_room_read ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.tyapp_chat_room FROM PUBLIC, anon;
REVOKE ALL ON public.tyapp_chat_message FROM PUBLIC, anon;
REVOKE ALL ON public.tyapp_chat_room_read FROM PUBLIC, anon;

GRANT SELECT, INSERT ON public.tyapp_chat_room TO authenticated;
GRANT SELECT, INSERT ON public.tyapp_chat_message TO authenticated;
GRANT SELECT ON public.tyapp_chat_room_read TO authenticated;

GRANT EXECUTE ON FUNCTION public.tyapp_chat_is_room_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tyapp_chat_is_room_creator(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tyapp_chat_edit_message(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tyapp_chat_toggle_reaction(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tyapp_chat_message_soft_delete_single_record(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tyapp_chat_room_soft_delete_single_record(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tyapp_chat_rename_room(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tyapp_chat_set_room_description(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tyapp_chat_add_room_members(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tyapp_chat_remove_room_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tyapp_chat_leave_room(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tyapp_chat_mark_room_read(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tyapp_chat_unread_counts() TO authenticated;

DROP POLICY IF EXISTS tyapp_chat_room_select ON public.tyapp_chat_room;
CREATE POLICY tyapp_chat_room_select
  ON public.tyapp_chat_room
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = ANY (member_user_ids)
    OR auth.uid() = ANY (former_member_user_ids)
  );

DROP POLICY IF EXISTS tyapp_chat_room_insert ON public.tyapp_chat_room;
CREATE POLICY tyapp_chat_room_insert
  ON public.tyapp_chat_room
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = created_by
    AND auth.uid() = ANY (member_user_ids)
    AND cardinality(member_user_ids) >= 2
    AND length(trim(name)) > 0
  );

DROP POLICY IF EXISTS tyapp_chat_message_select ON public.tyapp_chat_message;
CREATE POLICY tyapp_chat_message_select
  ON public.tyapp_chat_message
  FOR SELECT
  TO authenticated
  USING (public.tyapp_chat_is_room_member(room_id));

DROP POLICY IF EXISTS tyapp_chat_message_insert ON public.tyapp_chat_message;
CREATE POLICY tyapp_chat_message_insert
  ON public.tyapp_chat_message
  FOR INSERT
  TO authenticated
  WITH CHECK (
    sender_user_id = auth.uid()
    AND public.tyapp_chat_is_room_member(room_id)
  );

DROP POLICY IF EXISTS tyapp_chat_room_read_select ON public.tyapp_chat_room_read;
CREATE POLICY tyapp_chat_room_read_select
  ON public.tyapp_chat_room_read
  FOR SELECT
  TO authenticated
  USING (public.tyapp_chat_is_room_member(room_id));

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------

ALTER TABLE public.tyapp_chat_room REPLICA IDENTITY FULL;
ALTER TABLE public.tyapp_chat_message REPLICA IDENTITY FULL;
ALTER TABLE public.tyapp_chat_room_read REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime ADD TABLE public.tyapp_chat_room;
ALTER PUBLICATION supabase_realtime ADD TABLE public.tyapp_chat_message;
ALTER PUBLICATION supabase_realtime ADD TABLE public.tyapp_chat_room_read;
