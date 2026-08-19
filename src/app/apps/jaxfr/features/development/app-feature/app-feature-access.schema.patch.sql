-- App / Feature grant tables for Phase 3–4.
-- Safe to re-run. Paste into the Supabase SQL editor.
--
-- If the first migration stopped at RENAME, these tables were never created.
-- Login, appAccessGuard, featureAccessGuard, and User Edit all need them.

-- ---------------------------------------------------------------------------
-- tyapp_user_feature_access
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.tyapp_user_feature_access (
  tb_tyapp_usr_ftr_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.tyapp_user (user_id),
  feature_id uuid NOT NULL REFERENCES public.tyapp_app_feature (tb_tyapp_ap_ftr_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tyapp_user_feature_access_unique UNIQUE (user_id, feature_id)
);

CREATE INDEX IF NOT EXISTS tyapp_user_feature_access_user_idx
  ON public.tyapp_user_feature_access (user_id);

ALTER TABLE public.tyapp_user_feature_access ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tyapp_user_feature_access FROM PUBLIC, anon;
GRANT SELECT, INSERT, DELETE ON public.tyapp_user_feature_access TO authenticated;

DROP POLICY IF EXISTS tyapp_user_feature_access_select ON public.tyapp_user_feature_access;
CREATE POLICY tyapp_user_feature_access_select
  ON public.tyapp_user_feature_access
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.tyapp_is_admin());

DROP POLICY IF EXISTS tyapp_user_feature_access_write ON public.tyapp_user_feature_access;
CREATE POLICY tyapp_user_feature_access_write
  ON public.tyapp_user_feature_access
  FOR ALL
  TO authenticated
  USING (public.tyapp_is_admin())
  WITH CHECK (public.tyapp_is_admin());

-- ---------------------------------------------------------------------------
-- tyapp_user_app_access
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.tyapp_user_app_access (
  tb_tyapp_usr_app_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.tyapp_user (user_id),
  app_id uuid NOT NULL REFERENCES public.tyapp_app (tb_tyapp_app_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tyapp_user_app_access_unique UNIQUE (user_id, app_id)
);

CREATE INDEX IF NOT EXISTS tyapp_user_app_access_user_idx
  ON public.tyapp_user_app_access (user_id);

ALTER TABLE public.tyapp_user_app_access ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tyapp_user_app_access FROM PUBLIC, anon;
GRANT SELECT, INSERT, DELETE ON public.tyapp_user_app_access TO authenticated;

DROP POLICY IF EXISTS tyapp_user_app_access_select ON public.tyapp_user_app_access;
CREATE POLICY tyapp_user_app_access_select
  ON public.tyapp_user_app_access
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.tyapp_is_admin());

DROP POLICY IF EXISTS tyapp_user_app_access_write ON public.tyapp_user_app_access;
CREATE POLICY tyapp_user_app_access_write
  ON public.tyapp_user_app_access
  FOR ALL
  TO authenticated
  USING (public.tyapp_is_admin())
  WITH CHECK (public.tyapp_is_admin());

-- ---------------------------------------------------------------------------
-- Backfill from current behaviour (idempotent)
-- ---------------------------------------------------------------------------

INSERT INTO public.tyapp_user_app_access (user_id, app_id)
SELECT u.user_id, a.tb_tyapp_app_id
FROM public.tyapp_user u
CROSS JOIN LATERAL unnest(u.allowed_apps) AS x(app_code)
INNER JOIN public.tyapp_app a
  ON lower(a.name) = lower(x.app_code)
WHERE u.deleted_at IS NULL
ON CONFLICT (user_id, app_id) DO NOTHING;

INSERT INTO public.tyapp_user_feature_access (user_id, feature_id)
SELECT u.user_id, f.tb_tyapp_ap_ftr_id
FROM public.tyapp_user u
CROSS JOIN public.tyapp_app_feature f
WHERE u.deleted_at IS NULL
  AND f.deleted_at IS NULL
  AND f.show_in_launcher = true
  AND f.is_admin_only = false
ON CONFLICT (user_id, feature_id) DO NOTHING;

INSERT INTO public.tyapp_user_feature_access (user_id, feature_id)
SELECT u.user_id, f.tb_tyapp_ap_ftr_id
FROM public.tyapp_user u
CROSS JOIN public.tyapp_app_feature f
WHERE u.deleted_at IS NULL
  AND u.role >= 900
  AND f.deleted_at IS NULL
  AND f.show_in_launcher = true
  AND f.is_admin_only = true
ON CONFLICT (user_id, feature_id) DO NOTHING;

NOTIFY pgrst, 'reload schema';

-- Confirm:
-- SELECT count(*) FROM public.tyapp_user_app_access;
-- SELECT count(*) FROM public.tyapp_user_feature_access;
