-- Align tyapp_app_feature.name with Welcome display names.
-- Grants / invitations use feature UUIDs — safe to rename.
-- Re-runnable: each UPDATE matches the old name only.

UPDATE public.tyapp_app_feature
SET name = 'Workout', updated_at = NOW()
WHERE name = 'Fit' AND deleted_at IS NULL;

UPDATE public.tyapp_app_feature
SET name = 'Tyweb', updated_at = NOW()
WHERE name = 'Tyweb Control' AND deleted_at IS NULL;

UPDATE public.tyapp_app_feature
SET name = 'DocSign', updated_at = NOW()
WHERE name = 'Doc Sign' AND deleted_at IS NULL;

UPDATE public.tyapp_app_feature
SET name = 'yyHome', updated_at = NOW()
WHERE name = 'YYEMS' AND deleted_at IS NULL;

UPDATE public.tyapp_app_feature
SET name = 'Users', updated_at = NOW()
WHERE name = 'User' AND deleted_at IS NULL;

-- Confirm:
-- SELECT name, route, show_in_launcher
-- FROM public.tyapp_app_feature
-- WHERE deleted_at IS NULL
--   AND name IN ('Workout', 'Tyweb', 'DocSign', 'yyHome', 'Users')
-- ORDER BY name;
