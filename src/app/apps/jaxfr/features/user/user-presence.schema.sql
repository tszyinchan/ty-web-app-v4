-- App-wide online / last-seen (not chat-only).
-- Paste into the Supabase SQL editor (safe to re-run).
-- Online itself comes from Realtime Presence in the browser; this table
-- only stores last_seen_at for when the user is no longer connected.

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.tyapp_user_presence (
  tb_tyapp_usr_prs_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES public.tyapp_user (user_id),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS tyapp_user_presence_set_updated_at
  ON public.tyapp_user_presence;
CREATE TRIGGER tyapp_user_presence_set_updated_at
  BEFORE INSERT OR UPDATE ON public.tyapp_user_presence
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.tyapp_user_touch_presence()
RETURNS public.tyapp_user_presence
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.tyapp_user_presence;
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  INSERT INTO public.tyapp_user_presence (user_id, last_seen_at)
  VALUES (v_uid, now())
  ON CONFLICT (user_id)
  DO UPDATE SET last_seen_at = EXCLUDED.last_seen_at
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

ALTER TABLE public.tyapp_user_presence ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tyapp_user_presence FROM PUBLIC, anon;
GRANT SELECT ON public.tyapp_user_presence TO authenticated;
GRANT EXECUTE ON FUNCTION public.tyapp_user_touch_presence() TO authenticated;

DROP POLICY IF EXISTS tyapp_user_presence_select ON public.tyapp_user_presence;
CREATE POLICY tyapp_user_presence_select
  ON public.tyapp_user_presence
  FOR SELECT
  TO authenticated
  USING (true);

ALTER TABLE public.tyapp_user_presence REPLICA IDENTITY FULL;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.tyapp_user_presence;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
