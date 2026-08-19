-- Fix tyapp_app_feature.app_id.
-- Paste into the Supabase SQL editor.
--
-- Intended mapping:
--   Almost every existing feature belongs to Jaxfr (they were created as
--   jaxfr categories). Only the two "Section: *" workaround rows belong
--   to another App:
--     Section: Share    -> Share
--     Section: Filelink -> Filelink
--   The Jaxfr launcher item named "Filelink" (/filelink/list) stays on
--   Jaxfr — that page lives on jaxfr.tszyin.com, not filelink.tszyin.com.

-- 1) Look at the current mapping first (run this by itself if you want):
-- SELECT f.name AS feature, a.name AS app, f.show_in_launcher
-- FROM public.tyapp_app_feature f
-- JOIN public.tyapp_app a ON a.tb_tyapp_app_id = f.app_id
-- WHERE f.deleted_at IS NULL
-- ORDER BY a.name, f.name;

-- 2) Default everything to Jaxfr, using a table alias so `name` cannot
--    be confused with tyapp_app_feature.name.
UPDATE public.tyapp_app_feature AS f
SET app_id = a.tb_tyapp_app_id
FROM public.tyapp_app AS a
WHERE a.name = 'Jaxfr';

-- 3) The two App-level catch-alls that are not Jaxfr.
UPDATE public.tyapp_app_feature AS f
SET app_id = a.tb_tyapp_app_id
FROM public.tyapp_app AS a
WHERE a.name = 'Share'
  AND f.tb_tyapp_ap_ftr_id = 'a3bb36cc-e72d-4f09-8053-1a951830cd02';

UPDATE public.tyapp_app_feature AS f
SET app_id = a.tb_tyapp_app_id
FROM public.tyapp_app AS a
WHERE a.name = 'Filelink'
  AND f.tb_tyapp_ap_ftr_id = 'efadeb51-bad8-49ef-952f-6ec27b8c3895';

-- 4) Confirm.
SELECT f.name AS feature, a.name AS app, f.show_in_launcher
FROM public.tyapp_app_feature f
JOIN public.tyapp_app a ON a.tb_tyapp_app_id = f.app_id
WHERE f.deleted_at IS NULL
ORDER BY a.name, f.name;
