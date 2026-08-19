-- Mark the real Jaxfr features as launcher items so they appear under
-- App & Feature Access on User Edit (that UI only lists launcher
-- features). Also backfill grants. Safe to re-run.

-- icon/route are required by the launcher CHECK constraint.

UPDATE public.tyapp_app_feature SET
  show_in_launcher = true,
  is_admin_only = false,
  icon = COALESCE(icon, 'work'),
  route = COALESCE(NULLIF(route, ''), '/work'),
  updated_at = NOW()
WHERE name = 'Work' AND deleted_at IS NULL;

UPDATE public.tyapp_app_feature SET
  show_in_launcher = true,
  is_admin_only = false,
  icon = COALESCE(icon, 'article'),
  route = COALESCE(NULLIF(route, ''), '/article/feed'),
  updated_at = NOW()
WHERE name = 'Article' AND deleted_at IS NULL;

UPDATE public.tyapp_app_feature SET
  show_in_launcher = true,
  is_admin_only = false,
  icon = COALESCE(icon, 'fitness_center'),
  route = COALESCE(NULLIF(route, ''), '/fit/list'),
  updated_at = NOW()
WHERE name = 'Fit' AND deleted_at IS NULL;

UPDATE public.tyapp_app_feature SET
  show_in_launcher = true,
  is_admin_only = false,
  icon = COALESCE(icon, 'link'),
  route = COALESCE(NULLIF(route, ''), '/filelink/list'),
  updated_at = NOW()
WHERE name = 'Filelink'
  AND deleted_at IS NULL
  AND app_id = (SELECT tb_tyapp_app_id FROM public.tyapp_app WHERE name = 'Jaxfr' LIMIT 1);

UPDATE public.tyapp_app_feature SET
  show_in_launcher = true,
  is_admin_only = false,
  icon = COALESCE(icon, 'chat'),
  route = COALESCE(NULLIF(route, ''), '/chat'),
  updated_at = NOW()
WHERE name = 'Chat' AND deleted_at IS NULL;

UPDATE public.tyapp_app_feature SET
  show_in_launcher = true,
  is_admin_only = false,
  icon = COALESCE(icon, 'settings'),
  route = COALESCE(NULLIF(route, ''), '/settings/notifications'),
  updated_at = NOW()
WHERE name = 'Settings' AND deleted_at IS NULL;

UPDATE public.tyapp_app_feature SET
  show_in_launcher = true,
  is_admin_only = true,
  icon = COALESCE(icon, 'people_outline'),
  route = COALESCE(NULLIF(route, ''), '/users/list'),
  updated_at = NOW()
WHERE name = 'User' AND deleted_at IS NULL;

UPDATE public.tyapp_app_feature SET
  show_in_launcher = true,
  is_admin_only = true,
  icon = COALESCE(icon, 'code'),
  route = COALESCE(NULLIF(route, ''), '/development'),
  updated_at = NOW()
WHERE name = 'Development' AND deleted_at IS NULL;

-- Keep log-only tags off the launcher (including Jaxfr > General).
UPDATE public.tyapp_app_feature SET
  show_in_launcher = false,
  updated_at = NOW()
WHERE deleted_at IS NULL
  AND name IN (
    'General',
    'TY Web App',
    'Section: Share',
    'Section: Filelink',
    'Tyweb',
    'yy525',
    'Wealth Management',
    'Bill'
  );

-- Do NOT grant every launcher feature to every user here.
-- That made Welcome look unfiltered. Assign features in User Edit.
