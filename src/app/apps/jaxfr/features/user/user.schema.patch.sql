-- Enables Realtime on tyapp_user so the shared user directory
-- (UserService.users) stays fresh in long-lived screens like Chat when an
-- admin renames/updates another user, instead of requiring a manual refresh.
-- Paste into the Supabase SQL editor (safe to re-run).
--
-- No RLS/grant changes needed: tyapp_user's existing SELECT policy already
-- lets authenticated users read every row (UserService.fetchAllUsers relies
-- on this today), so Realtime simply reuses that same policy.

ALTER TABLE public.tyapp_user REPLICA IDENTITY FULL;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.tyapp_user;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
