-- Invitation codes for gated self-registration.
-- Paste into the Supabase SQL editor (safe to re-run).
--
-- The code is the gate and the initial access template: app/feature grants
-- and an optional group are copied onto the new tyapp_user at register time.
-- Super Admin can still change grants later on User Edit.
--
-- Anon/authenticated cannot read codes. Super Admin manages rows via RLS.
-- Claiming a code happens only in the register-with-invite Edge Function
-- (service role). Keep Auth "Allow new users to sign up" OFF.

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.tyapp_invitation (
  tb_tyapp_inv_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  status integer NOT NULL DEFAULT 1,
  max_uses integer NOT NULL DEFAULT 1,
  uses_count integer NOT NULL DEFAULT 0,
  expires_at timestamptz,
  app_ids uuid[] NOT NULL DEFAULT '{}',
  feature_ids uuid[] NOT NULL DEFAULT '{}',
  group_id uuid REFERENCES public.tyapp_user_group (tb_tyapp_usr_grp_id),
  created_by uuid NOT NULL REFERENCES public.tyapp_user (user_id),
  remarks text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT tyapp_invitation_code_unique UNIQUE (code),
  CONSTRAINT tyapp_invitation_max_uses_chk CHECK (max_uses >= 1),
  CONSTRAINT tyapp_invitation_uses_count_chk CHECK (uses_count >= 0)
);

DROP TRIGGER IF EXISTS tyapp_invitation_set_updated_at ON public.tyapp_invitation;
CREATE TRIGGER tyapp_invitation_set_updated_at
  BEFORE INSERT OR UPDATE ON public.tyapp_invitation
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS tyapp_invitation_status_idx
  ON public.tyapp_invitation (status)
  WHERE deleted_at IS NULL;

CREATE OR REPLACE FUNCTION public.tyapp_invitation_soft_delete_single_record(
  record_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.tyapp_is_super_admin() THEN
    RAISE EXCEPTION 'Only a super admin can delete invitations';
  END IF;

  UPDATE public.tyapp_invitation
  SET deleted_at = now()
  WHERE tb_tyapp_inv_id = record_id
    AND deleted_at IS NULL;
END;
$$;

ALTER TABLE public.tyapp_invitation ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tyapp_invitation FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON public.tyapp_invitation TO authenticated;

DROP POLICY IF EXISTS tyapp_invitation_select ON public.tyapp_invitation;
CREATE POLICY tyapp_invitation_select
  ON public.tyapp_invitation
  FOR SELECT
  TO authenticated
  USING (public.tyapp_is_super_admin());

DROP POLICY IF EXISTS tyapp_invitation_write ON public.tyapp_invitation;
CREATE POLICY tyapp_invitation_write
  ON public.tyapp_invitation
  FOR ALL
  TO authenticated
  USING (public.tyapp_is_super_admin())
  WITH CHECK (public.tyapp_is_super_admin());

REVOKE ALL ON FUNCTION public.tyapp_invitation_soft_delete_single_record(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tyapp_invitation_soft_delete_single_record(uuid)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
