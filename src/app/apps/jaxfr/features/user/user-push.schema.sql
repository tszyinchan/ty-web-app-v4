-- Web Push subscriptions (closed-tab chat notifications).
-- Paste into the Supabase SQL editor (safe to re-run).
--
-- After this SQL:
-- 1. Deploy supabase/functions/chat-push
-- 2. Set Edge Function secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY,
--    PUSH_WEBHOOK_SECRET (see src/environments/push-secrets.txt locally)
-- 3. Database → Webhooks → INSERT on public.tyapp_chat_message
--    URL: https://<project-ref>.supabase.co/functions/v1/chat-push
--    HTTP header: x-webhook-secret = PUSH_WEBHOOK_SECRET
--    Leave Verify JWT off on this function (it checks the header itself).

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.tyapp_push_subscription (
  tb_tyapp_usr_psh_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.tyapp_user (user_id),
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tyapp_push_subscription_user_idx
  ON public.tyapp_push_subscription (user_id);

DROP TRIGGER IF EXISTS tyapp_push_subscription_set_updated_at
  ON public.tyapp_push_subscription;
CREATE TRIGGER tyapp_push_subscription_set_updated_at
  BEFORE INSERT OR UPDATE ON public.tyapp_push_subscription
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.tyapp_push_upsert_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_user_agent text
)
RETURNS public.tyapp_push_subscription
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.tyapp_push_subscription;
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_endpoint IS NULL OR length(trim(p_endpoint)) = 0 THEN
    RAISE EXCEPTION 'endpoint is required';
  END IF;

  INSERT INTO public.tyapp_push_subscription (
    user_id, endpoint, p256dh, auth, user_agent
  )
  VALUES (
    v_uid, trim(p_endpoint), trim(p_p256dh), trim(p_auth), p_user_agent
  )
  ON CONFLICT (endpoint)
  DO UPDATE SET
    user_id = EXCLUDED.user_id,
    p256dh = EXCLUDED.p256dh,
    auth = EXCLUDED.auth,
    user_agent = EXCLUDED.user_agent
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.tyapp_push_delete_subscription(p_endpoint text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  DELETE FROM public.tyapp_push_subscription
  WHERE endpoint = p_endpoint
    AND user_id = v_uid;
END;
$$;

-- General-purpose admin check (not push-specific). Lives here because this
-- is the first feature that needed it; reuse it from other schema files
-- instead of re-inlining the same role >= 900 subquery.
CREATE OR REPLACE FUNCTION public.tyapp_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT role FROM public.tyapp_user
     WHERE user_id = auth.uid() AND deleted_at IS NULL) >= 900,
    false
  );
$$;

-- Admin-only: remove another user's device subscription (e.g. to debug a
-- stuck/duplicate registration). The self-service delete above only allows
-- removing your own (user_id = auth.uid()).
CREATE OR REPLACE FUNCTION public.tyapp_push_admin_delete_subscription(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.tyapp_is_admin() THEN
    RAISE EXCEPTION 'Only admins can remove other devices'' subscriptions';
  END IF;

  DELETE FROM public.tyapp_push_subscription
  WHERE tb_tyapp_usr_psh_id = p_id;
END;
$$;

ALTER TABLE public.tyapp_push_subscription ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tyapp_push_subscription FROM PUBLIC, anon;
GRANT SELECT ON public.tyapp_push_subscription TO authenticated;
GRANT EXECUTE ON FUNCTION public.tyapp_push_upsert_subscription(text, text, text, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.tyapp_push_delete_subscription(text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.tyapp_is_admin()
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.tyapp_push_admin_delete_subscription(uuid)
  TO authenticated;

-- Admins can additionally see every user's subscription row (used by the
-- Notification Settings admin section to list/debug all devices).
DROP POLICY IF EXISTS tyapp_push_subscription_select
  ON public.tyapp_push_subscription;
CREATE POLICY tyapp_push_subscription_select
  ON public.tyapp_push_subscription
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.tyapp_is_admin());
