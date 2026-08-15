-- Incremental patch for existing Jaxfr chat databases.
-- Paste into the Supabase SQL editor (do not re-run the full chat.schema.sql).
-- 1) Room rename RPC
-- 2) Let members SELECT soft-deleted rooms so Realtime can broadcast deletes

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

GRANT EXECUTE ON FUNCTION public.tyapp_chat_rename_room(uuid, text) TO authenticated;

-- Soft-deleted rooms must still pass SELECT so Realtime can deliver the
-- UPDATE (otherwise other members never see the room disappear).
-- The app continues to filter deleted_at IS NULL on fetch.
DROP POLICY IF EXISTS tyapp_chat_room_select ON public.tyapp_chat_room;
CREATE POLICY tyapp_chat_room_select
  ON public.tyapp_chat_room
  FOR SELECT
  TO authenticated
  USING (auth.uid() = ANY (member_user_ids));
