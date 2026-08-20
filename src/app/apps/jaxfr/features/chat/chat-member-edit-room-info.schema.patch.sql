-- Incremental patch: any room member can rename the room and edit its
-- description. Membership management and room delete stay creator-only.
-- Paste into the Supabase SQL editor (do not re-run chat.schema.sql).

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
    RAISE EXCEPTION 'Only room members can rename this room';
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

  IF NOT public.tyapp_chat_is_room_member(p_room_id) THEN
    RAISE EXCEPTION 'Only room members can edit the description';
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
