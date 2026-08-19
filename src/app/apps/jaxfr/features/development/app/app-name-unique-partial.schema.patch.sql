-- Allow reusing an App name after soft-delete.
-- UNIQUE(name) blocked a second Jaxfr/Filelink/Share row forever.
-- Safe to re-run.

ALTER TABLE public.tyapp_app
  DROP CONSTRAINT IF EXISTS tyapp_app_name_unique;

DROP INDEX IF EXISTS public.tyapp_app_name_unique;
DROP INDEX IF EXISTS public.tyapp_app_name_active_unique;

CREATE UNIQUE INDEX tyapp_app_name_active_unique
  ON public.tyapp_app (name)
  WHERE deleted_at IS NULL;
