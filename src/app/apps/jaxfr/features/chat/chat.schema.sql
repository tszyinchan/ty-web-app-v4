-- Jaxfr Chat schema, RLS, and RPCs.
-- Paste this entire file into the Supabase SQL editor.
-- After it runs, confirm Realtime is enabled for both tables
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
  member_user_ids uuid[] NOT NULL,
  created_by uuid NOT NULL REFERENCES public.tyapp_user (user_id),
  last_message_at timestamptz,
  status smallint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT tyapp_chat_room_name_not_blank CHECK (length(trim(name)) > 0),
  CONSTRAINT tyapp_chat_room_min_members CHECK (cardinality(member_user_ids) >= 2)
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

  IF NOT public.tyapp_chat_is_room_member(record_id) THEN
    RAISE EXCEPTION 'Not a room member';
  END IF;

  UPDATE public.tyapp_chat_message
  SET deleted_at = now()
  WHERE room_id = record_id
    AND deleted_at IS NULL;

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

  IF NOT public.tyapp_chat_is_room_member(p_room_id) THEN
    RAISE EXCEPTION 'Not a room member';
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

-- ---------------------------------------------------------------------------
-- Grants: members may SELECT/INSERT; UPDATE/DELETE go through RPCs
-- ---------------------------------------------------------------------------

ALTER TABLE public.tyapp_chat_room ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tyapp_chat_message ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.tyapp_chat_room FROM PUBLIC, anon;
REVOKE ALL ON public.tyapp_chat_message FROM PUBLIC, anon;

GRANT SELECT, INSERT ON public.tyapp_chat_room TO authenticated;
GRANT SELECT, INSERT ON public.tyapp_chat_message TO authenticated;

GRANT EXECUTE ON FUNCTION public.tyapp_chat_is_room_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tyapp_chat_edit_message(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tyapp_chat_toggle_reaction(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tyapp_chat_message_soft_delete_single_record(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tyapp_chat_room_soft_delete_single_record(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tyapp_chat_rename_room(uuid, text) TO authenticated;

DROP POLICY IF EXISTS tyapp_chat_room_select ON public.tyapp_chat_room;
CREATE POLICY tyapp_chat_room_select
  ON public.tyapp_chat_room
  FOR SELECT
  TO authenticated
  USING (auth.uid() = ANY (member_user_ids));

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

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------

ALTER TABLE public.tyapp_chat_room REPLICA IDENTITY FULL;
ALTER TABLE public.tyapp_chat_message REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime ADD TABLE public.tyapp_chat_room;
ALTER PUBLICATION supabase_realtime ADD TABLE public.tyapp_chat_message;
