-- Register 525 / YYEMS on the Jaxfr launcher. Safe to re-run.
-- Reload the app after this (no schema change).

INSERT INTO public.tyapp_app_feature (
  app_id,
  name,
  icon,
  route,
  remarks,
  status,
  show_in_launcher,
  is_admin_only
)
SELECT
  (SELECT tb_tyapp_app_id FROM public.tyapp_app WHERE name = 'Jaxfr' LIMIT 1),
  'YYEMS',
  'kitchen',
  '/yyems',
  '525 household ledger',
  1,
  true,
  false
WHERE NOT EXISTS (
  SELECT 1 FROM public.tyapp_app_feature
  WHERE name = 'YYEMS' AND deleted_at IS NULL
);

UPDATE public.tyapp_app_feature
SET
  show_in_launcher = true,
  is_admin_only = false,
  icon = COALESCE(icon, 'kitchen'),
  route = COALESCE(route, '/yyems'),
  updated_at = NOW()
WHERE name = 'YYEMS'
  AND deleted_at IS NULL;

-- Household logins (cty/frd binding) + Super Admin get the tile.
INSERT INTO public.tyapp_user_feature_access (user_id, feature_id)
SELECT u.user_id, f.tb_tyapp_ap_ftr_id
FROM public.tyapp_user u
CROSS JOIN public.tyapp_app_feature f
WHERE f.name = 'YYEMS'
  AND f.deleted_at IS NULL
  AND u.deleted_at IS NULL
  AND (
    u.appsheet_525_user_id IS NOT NULL
    OR u.role >= 900
  )
ON CONFLICT (user_id, feature_id) DO NOTHING;
