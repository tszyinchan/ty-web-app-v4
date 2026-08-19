-- Default-deny for non-admin Feature grants.
-- The earlier backfill gave every user every launcher Feature, so Welcome
-- could not look filtered. After this, assign Features in User Edit.
-- Safe to re-run. Admins keep their rows.

DELETE FROM public.tyapp_user_feature_access AS g
USING public.tyapp_user AS u
WHERE g.user_id = u.user_id
  AND u.deleted_at IS NULL
  AND u.role < 900;
