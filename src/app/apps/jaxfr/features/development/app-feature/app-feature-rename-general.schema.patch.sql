-- Rename the old catch-all category "TY Web App" to Jaxfr > General.
-- It stays a log-only Feature (not a launcher tile). Safe to re-run.

UPDATE public.tyapp_app_feature AS f
SET
  name = 'General',
  show_in_launcher = false,
  is_admin_only = false,
  icon = NULL,
  route = NULL,
  remarks = 'Jaxfr-wide / not a specific feature. Used for App Log tagging.',
  updated_at = NOW(),
  app_id = a.tb_tyapp_app_id
FROM public.tyapp_app AS a
WHERE a.name = 'Jaxfr'
  AND f.deleted_at IS NULL
  AND (
    f.tb_tyapp_ap_ftr_id = '234c6e4b-faf6-4417-ad56-aa8623adfcda'
    OR f.name = 'TY Web App'
  );

-- Confirm:
-- SELECT f.name AS feature, a.name AS app, f.show_in_launcher
-- FROM public.tyapp_app_feature f
-- JOIN public.tyapp_app a ON a.tb_tyapp_app_id = f.app_id
-- WHERE f.tb_tyapp_ap_ftr_id = '234c6e4b-faf6-4417-ad56-aa8623adfcda';
