-- Ensure User / Development exist with the right flags, then grant them
-- to every admin. Safe to re-run. Reload the app after this (no NOTIFY
-- needed — this only writes rows, not schema).

-- 1. Development: launcher + admin-only (also fill icon/route so the
--    launcher CHECK constraint is satisfied)
UPDATE public.tyapp_app_feature
SET
  show_in_launcher = true,
  is_admin_only = true,
  icon = COALESCE(icon, 'code'),
  route = COALESCE(route, '/development/log/list'),
  updated_at = NOW()
WHERE name = 'Development'
  AND deleted_at IS NULL;

-- 2. User: insert if missing, otherwise set flags
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
  'User',
  'people_outline',
  '/users/list',
  'User Management',
  1,
  true,
  true
WHERE NOT EXISTS (
  SELECT 1 FROM public.tyapp_app_feature
  WHERE name = 'User' AND deleted_at IS NULL
);

UPDATE public.tyapp_app_feature
SET
  show_in_launcher = true,
  is_admin_only = true,
  icon = COALESCE(icon, 'people_outline'),
  route = COALESCE(route, '/users/list'),
  updated_at = NOW()
WHERE name = 'User'
  AND deleted_at IS NULL;

-- 3. Grant User + Development to every admin (role >= 900)
INSERT INTO public.tyapp_user_feature_access (user_id, feature_id)
SELECT u.user_id, f.tb_tyapp_ap_ftr_id
FROM public.tyapp_user u
CROSS JOIN public.tyapp_app_feature f
WHERE u.deleted_at IS NULL
  AND u.role >= 900
  AND f.deleted_at IS NULL
  AND f.name IN ('User', 'Development')
ON CONFLICT (user_id, feature_id) DO NOTHING;
