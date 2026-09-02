-- Sign-in email for User Edit. Paste into the Supabase SQL editor
-- (safe to re-run). Login email stays in auth.users — do not copy it
-- onto tyapp_user.
--
-- Self: the app reads the Auth session.
-- Admin / Super Admin: this RPC returns another account's email.
-- Everyone else gets NULL (same as an unknown user).

CREATE OR REPLACE FUNCTION public.tyapp_user_auth_email(p_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_user_id IS NULL THEN NULL
    WHEN auth.uid() IS NOT DISTINCT FROM p_user_id
      OR public.tyapp_is_admin()
    THEN (
      SELECT u.email::text
      FROM auth.users AS u
      WHERE u.id = p_user_id
    )
    ELSE NULL
  END;
$$;

REVOKE ALL ON FUNCTION public.tyapp_user_auth_email(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tyapp_user_auth_email(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
