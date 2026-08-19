-- Global display order for Apps and Features (same for every user).
-- Do not reuse identity seq_no columns — those stay insert-only.
-- Safe to re-run.

ALTER TABLE public.tyapp_app
  ADD COLUMN IF NOT EXISTS customized_order integer;

ALTER TABLE public.tyapp_app_feature
  ADD COLUMN IF NOT EXISTS customized_order integer;

UPDATE public.tyapp_app
SET customized_order = tb_tyapp_app_seq_no::integer
WHERE customized_order IS NULL;

UPDATE public.tyapp_app_feature
SET customized_order = tb_tyapp_ap_ftr_seq_no::integer
WHERE customized_order IS NULL;

ALTER TABLE public.tyapp_app
  ALTER COLUMN customized_order SET DEFAULT 0,
  ALTER COLUMN customized_order SET NOT NULL;

ALTER TABLE public.tyapp_app_feature
  ALTER COLUMN customized_order SET DEFAULT 0,
  ALTER COLUMN customized_order SET NOT NULL;

NOTIFY pgrst, 'reload schema';
