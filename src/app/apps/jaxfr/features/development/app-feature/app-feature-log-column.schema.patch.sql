-- tyapp_app_log still has category_id because the first migration often
-- stopped at the table RENAME. The Angular client now writes feature_id.
-- Safe to re-run.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'tyapp_app_log'
      AND column_name = 'category_id'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'tyapp_app_log'
      AND column_name = 'feature_id'
  ) THEN
    ALTER TABLE public.tyapp_app_log RENAME COLUMN category_id TO feature_id;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
