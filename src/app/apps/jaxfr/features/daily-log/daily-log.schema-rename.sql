-- Jaxfr Daily Log live rename.
-- Keeps every existing row. Do NOT run daily-log.schema.sql on this database
-- (that file drops and recreates tables).
--
-- Paste this entire file into the Supabase SQL Editor and run once, in the
-- same deploy as the Daily Log frontend. After this, old table / RPC / route
-- names are gone.

BEGIN;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

ALTER TABLE IF EXISTS public.tyapp_daily_checklist_item
  RENAME TO tyapp_daily_log_item;
ALTER TABLE IF EXISTS public.tyapp_daily_checklist_day_item
  RENAME TO tyapp_daily_log_day_item;
ALTER TABLE IF EXISTS public.tyapp_daily_checklist_standard_item
  RENAME TO tyapp_daily_log_template_item;
ALTER TABLE IF EXISTS public.tyapp_daily_checklist_day
  RENAME TO tyapp_daily_log_day;
ALTER TABLE IF EXISTS public.tyapp_daily_checklist_share
  RENAME TO tyapp_daily_log_share;

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tyapp_daily_log_item'
      AND column_name = 'tb_tyapp_dcl_itm_id'
  ) THEN
    ALTER TABLE public.tyapp_daily_log_item
      RENAME COLUMN tb_tyapp_dcl_itm_id TO tb_tyapp_dl_itm_id;
    ALTER TABLE public.tyapp_daily_log_item
      RENAME COLUMN tb_tyapp_dcl_itm_seq_no TO tb_tyapp_dl_itm_seq_no;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tyapp_daily_log_day_item'
      AND column_name = 'tb_tyapp_dcl_day_id'
  ) THEN
    ALTER TABLE public.tyapp_daily_log_day_item
      RENAME COLUMN tb_tyapp_dcl_day_id TO tb_tyapp_dl_day_id;
    ALTER TABLE public.tyapp_daily_log_day_item
      RENAME COLUMN tb_tyapp_dcl_day_seq_no TO tb_tyapp_dl_day_seq_no;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tyapp_daily_log_day_item'
      AND column_name = 'checklist_date'
  ) THEN
    ALTER TABLE public.tyapp_daily_log_day_item
      RENAME COLUMN checklist_date TO log_date;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tyapp_daily_log_template_item'
      AND column_name = 'tb_tyapp_dcl_std_id'
  ) THEN
    ALTER TABLE public.tyapp_daily_log_template_item
      RENAME COLUMN tb_tyapp_dcl_std_id TO tb_tyapp_dl_tpl_id;
    ALTER TABLE public.tyapp_daily_log_template_item
      RENAME COLUMN tb_tyapp_dcl_std_seq_no TO tb_tyapp_dl_tpl_seq_no;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tyapp_daily_log_day'
      AND column_name = 'tb_tyapp_dcl_dly_id'
  ) THEN
    ALTER TABLE public.tyapp_daily_log_day
      RENAME COLUMN tb_tyapp_dcl_dly_id TO tb_tyapp_dl_log_id;
    ALTER TABLE public.tyapp_daily_log_day
      RENAME COLUMN tb_tyapp_dcl_dly_seq_no TO tb_tyapp_dl_log_seq_no;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tyapp_daily_log_day'
      AND column_name = 'checklist_date'
  ) THEN
    ALTER TABLE public.tyapp_daily_log_day
      RENAME COLUMN checklist_date TO log_date;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tyapp_daily_log_share'
      AND column_name = 'tb_tyapp_dcl_shr_id'
  ) THEN
    ALTER TABLE public.tyapp_daily_log_share
      RENAME COLUMN tb_tyapp_dcl_shr_id TO tb_tyapp_dl_shr_id;
    ALTER TABLE public.tyapp_daily_log_share
      RENAME COLUMN tb_tyapp_dcl_shr_seq_no TO tb_tyapp_dl_shr_seq_no;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Remaining object names (indexes, constraints, triggers, policies, sequences)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION pg_temp.dl_new_name(old text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT replace(replace(replace(replace(replace(old,
    'daily_checklist_standard_item', 'daily_log_template_item'),
    'daily_checklist', 'daily_log'),
    'tb_tyapp_dcl_std', 'tb_tyapp_dl_tpl'),
    'tb_tyapp_dcl_dly', 'tb_tyapp_dl_log'),
    'tb_tyapp_dcl', 'tb_tyapp_dl')
$$;

DO $$
DECLARE
  r record;
  new_name text;
BEGIN
  FOR r IN
    SELECT c.relname AS old_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'i'
      AND (
        c.relname LIKE '%daily_checklist%'
        OR c.relname LIKE '%tb_tyapp_dcl%'
      )
  LOOP
    new_name := pg_temp.dl_new_name(r.old_name);
    IF new_name <> r.old_name THEN
      EXECUTE format('ALTER INDEX public.%I RENAME TO %I', r.old_name, new_name);
    END IF;
  END LOOP;

  FOR r IN
    SELECT c.relname AS old_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'S'
      AND (
        c.relname LIKE '%daily_checklist%'
        OR c.relname LIKE '%tb_tyapp_dcl%'
      )
  LOOP
    new_name := pg_temp.dl_new_name(r.old_name);
    IF new_name <> r.old_name THEN
      EXECUTE format('ALTER SEQUENCE public.%I RENAME TO %I', r.old_name, new_name);
    END IF;
  END LOOP;

  FOR r IN
    SELECT conrelid::regclass AS tbl, conname AS old_name
    FROM pg_constraint
    WHERE connamespace = 'public'::regnamespace
      AND (
        conname LIKE '%daily_checklist%'
        OR conname LIKE '%tb_tyapp_dcl%'
      )
  LOOP
    new_name := pg_temp.dl_new_name(r.old_name);
    IF new_name <> r.old_name THEN
      EXECUTE format('ALTER TABLE %s RENAME CONSTRAINT %I TO %I', r.tbl, r.old_name, new_name);
    END IF;
  END LOOP;

  FOR r IN
    SELECT tgrelid::regclass AS tbl, tgname AS old_name
    FROM pg_trigger
    WHERE NOT tgisinternal
      AND (
        tgname LIKE '%daily_checklist%'
        OR tgname LIKE '%tb_tyapp_dcl%'
      )
  LOOP
    new_name := pg_temp.dl_new_name(r.old_name);
    IF new_name <> r.old_name THEN
      EXECUTE format('ALTER TRIGGER %I ON %s RENAME TO %I', r.old_name, r.tbl, new_name);
    END IF;
  END LOOP;

  FOR r IN
    SELECT polrelid::regclass AS tbl, polname AS old_name
    FROM pg_policy
    WHERE polname LIKE '%daily_checklist%'
       OR polname LIKE '%tb_tyapp_dcl%'
  LOOP
    new_name := pg_temp.dl_new_name(r.old_name);
    IF new_name <> r.old_name THEN
      EXECUTE format('ALTER POLICY %I ON %s RENAME TO %I', r.old_name, r.tbl, new_name);
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- App Feature (guard matches name; route must match the new URL)
-- ---------------------------------------------------------------------------

UPDATE public.tyapp_app_feature
SET
  name = 'Daily Log',
  route = '/daily-log',
  remarks = 'Personal dated work log',
  updated_at = now()
WHERE deleted_at IS NULL
  AND (name = 'Daily Checklist' OR route = '/daily-checklist');

-- Mood keys: keep existing values; allow the ten-face set.
ALTER TABLE public.tyapp_daily_log_day
  DROP CONSTRAINT IF EXISTS tyapp_daily_checklist_day_mood_key;
ALTER TABLE public.tyapp_daily_log_day
  DROP CONSTRAINT IF EXISTS tyapp_daily_log_day_mood_key;
ALTER TABLE public.tyapp_daily_log_day
  ADD CONSTRAINT tyapp_daily_log_day_mood_key
    CHECK (mood_key IS NULL OR mood_key IN (
      'green', 'gold', 'red', 'blue', 'purple',
      'grin', 'rest', 'blank', 'cry', 'mad'
    ));

-- ---------------------------------------------------------------------------
-- RPCs: DROP old names (bodies still point at checklist tables/columns),
-- then recreate under Daily Log names.
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS tyapp_daily_checklist_share_enforce_group
  ON public.tyapp_daily_log_share;
DROP TRIGGER IF EXISTS tyapp_daily_log_share_enforce_group
  ON public.tyapp_daily_log_share;

DROP FUNCTION IF EXISTS public.tyapp_daily_checklist_create_from_standard(date);
DROP FUNCTION IF EXISTS public.tyapp_daily_checklist_copy_previous_day(date);
DROP FUNCTION IF EXISTS public.tyapp_daily_checklist_item_soft_delete_single_record(uuid);
DROP FUNCTION IF EXISTS public.tyapp_daily_checklist_day_item_soft_delete_single_record(uuid);
DROP FUNCTION IF EXISTS public.tyapp_daily_checklist_standard_item_soft_delete_single_record(uuid);
DROP FUNCTION IF EXISTS public.tyapp_daily_checklist_share_soft_delete_single_record(uuid);
DROP FUNCTION IF EXISTS public.tyapp_daily_checklist_share_enforce_group();

-- Soft-delete RPCs
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.tyapp_daily_log_item_soft_delete_single_record(
  record_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_found uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT tb_tyapp_dl_itm_id
  INTO v_found
  FROM public.tyapp_daily_log_item
  WHERE tb_tyapp_dl_itm_id = record_id
    AND user_id = v_uid
    AND deleted_at IS NULL;

  IF v_found IS NULL THEN
    RAISE EXCEPTION 'Library item not found or inaccessible';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.tyapp_daily_log_day_item d
    WHERE d.item_id = record_id
      AND d.user_id = v_uid
      AND d.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Cannot delete this item while it is still on a date.';
  END IF;

  UPDATE public.tyapp_daily_log_template_item
  SET deleted_at = now()
  WHERE item_id = record_id
    AND user_id = v_uid
    AND deleted_at IS NULL;

  UPDATE public.tyapp_daily_log_item
  SET deleted_at = now()
  WHERE tb_tyapp_dl_itm_id = record_id
    AND user_id = v_uid
    AND deleted_at IS NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.tyapp_daily_log_day_item_soft_delete_single_record(
  record_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_found uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT tb_tyapp_dl_day_id
  INTO v_found
  FROM public.tyapp_daily_log_day_item
  WHERE tb_tyapp_dl_day_id = record_id
    AND user_id = v_uid
    AND deleted_at IS NULL;

  IF v_found IS NULL THEN
    RAISE EXCEPTION 'Day item not found or inaccessible';
  END IF;

  UPDATE public.tyapp_daily_log_day_item
  SET deleted_at = now()
  WHERE tb_tyapp_dl_day_id = record_id
    AND user_id = v_uid
    AND deleted_at IS NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.tyapp_daily_log_template_item_soft_delete_single_record(
  record_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_found uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT tb_tyapp_dl_tpl_id
  INTO v_found
  FROM public.tyapp_daily_log_template_item
  WHERE tb_tyapp_dl_tpl_id = record_id
    AND user_id = v_uid
    AND deleted_at IS NULL;

  IF v_found IS NULL THEN
    RAISE EXCEPTION 'Template item not found or inaccessible';
  END IF;

  UPDATE public.tyapp_daily_log_template_item
  SET deleted_at = now()
  WHERE tb_tyapp_dl_tpl_id = record_id
    AND user_id = v_uid
    AND deleted_at IS NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.tyapp_daily_log_item_soft_delete_single_record(uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.tyapp_daily_log_day_item_soft_delete_single_record(uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.tyapp_daily_log_template_item_soft_delete_single_record(uuid)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- Batch-create RPCs (copy item_id only; skip IDs already on the date)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.tyapp_daily_log_copy_previous_day(
  target_date date
)
RETURNS SETOF public.tyapp_daily_log_day_item
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_source_date date;
  v_base integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF target_date IS NULL THEN
    RAISE EXCEPTION 'target_date is required';
  END IF;

  v_source_date := target_date - 1;

  IF NOT EXISTS (
    SELECT 1
    FROM public.tyapp_daily_log_day_item
    WHERE user_id = v_uid
      AND log_date = v_source_date
      AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Yesterday has no active items to copy.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.tyapp_daily_log_day_item y
    WHERE y.user_id = v_uid
      AND y.log_date = v_source_date
      AND y.deleted_at IS NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.tyapp_daily_log_day_item d
        WHERE d.user_id = v_uid
          AND d.log_date = target_date
          AND d.item_id = y.item_id
          AND d.deleted_at IS NULL
      )
  ) THEN
    RAISE EXCEPTION 'All of yesterday''s items are already on this date.';
  END IF;

  SELECT COALESCE(MAX(sort_order), -1)
  INTO v_base
  FROM public.tyapp_daily_log_day_item
  WHERE user_id = v_uid
    AND log_date = target_date
    AND deleted_at IS NULL;

  RETURN QUERY
  WITH src AS (
    SELECT
      y.item_id,
      y.sort_order,
      y.tb_tyapp_dl_day_seq_no,
      row_number() OVER (
        ORDER BY y.sort_order ASC, y.tb_tyapp_dl_day_seq_no ASC
      ) AS rn
    FROM public.tyapp_daily_log_day_item y
    WHERE y.user_id = v_uid
      AND y.log_date = v_source_date
      AND y.deleted_at IS NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.tyapp_daily_log_day_item d
        WHERE d.user_id = v_uid
          AND d.log_date = target_date
          AND d.item_id = y.item_id
          AND d.deleted_at IS NULL
      )
  ),
  ins AS (
    INSERT INTO public.tyapp_daily_log_day_item (
      user_id,
      item_id,
      log_date,
      sort_order,
      status,
      completed_at
    )
    SELECT
      v_uid,
      s.item_id,
      target_date,
      v_base + s.rn::integer,
      1,
      NULL
    FROM src s
    ORDER BY s.rn
    RETURNING *
  )
  SELECT *
  FROM ins
  ORDER BY sort_order ASC, tb_tyapp_dl_day_seq_no ASC;
END;
$$;

CREATE OR REPLACE FUNCTION public.tyapp_daily_log_create_from_template(
  target_date date
)
RETURNS SETOF public.tyapp_daily_log_day_item
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_base integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF target_date IS NULL THEN
    RAISE EXCEPTION 'target_date is required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.tyapp_daily_log_template_item
    WHERE user_id = v_uid
      AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Your Standard Checklist is empty. Add items on the Standard Checklist page first.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.tyapp_daily_log_template_item s
    WHERE s.user_id = v_uid
      AND s.deleted_at IS NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.tyapp_daily_log_day_item d
        WHERE d.user_id = v_uid
          AND d.log_date = target_date
          AND d.item_id = s.item_id
          AND d.deleted_at IS NULL
      )
  ) THEN
    RAISE EXCEPTION 'All standard items are already on this date.';
  END IF;

  SELECT COALESCE(MAX(sort_order), -1)
  INTO v_base
  FROM public.tyapp_daily_log_day_item
  WHERE user_id = v_uid
    AND log_date = target_date
    AND deleted_at IS NULL;

  RETURN QUERY
  WITH src AS (
    SELECT
      s.item_id,
      s.sort_order,
      s.tb_tyapp_dl_tpl_seq_no,
      row_number() OVER (
        ORDER BY s.sort_order ASC, s.tb_tyapp_dl_tpl_seq_no ASC
      ) AS rn
    FROM public.tyapp_daily_log_template_item s
    WHERE s.user_id = v_uid
      AND s.deleted_at IS NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.tyapp_daily_log_day_item d
        WHERE d.user_id = v_uid
          AND d.log_date = target_date
          AND d.item_id = s.item_id
          AND d.deleted_at IS NULL
      )
  ),
  ins AS (
    INSERT INTO public.tyapp_daily_log_day_item (
      user_id,
      item_id,
      log_date,
      sort_order,
      status,
      completed_at
    )
    SELECT
      v_uid,
      src.item_id,
      target_date,
      v_base + src.rn::integer,
      1,
      NULL
    FROM src
    ORDER BY src.rn
    RETURNING *
  )
  SELECT *
  FROM ins
  ORDER BY sort_order ASC, tb_tyapp_dl_day_seq_no ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.tyapp_daily_log_copy_previous_day(date)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.tyapp_daily_log_create_from_template(date)
  TO authenticated;

-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tyapp_daily_log_share_enforce_group()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.tyapp_user_ids_share_a_group(
    ARRAY[NEW.owner_user_id, NEW.viewer_user_id]
  ) THEN
    RAISE EXCEPTION 'Everyone granted access must belong to the same user group';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tyapp_daily_log_share_enforce_group
  ON public.tyapp_daily_log_share;
CREATE TRIGGER tyapp_daily_log_share_enforce_group
  BEFORE INSERT OR UPDATE OF owner_user_id, viewer_user_id
  ON public.tyapp_daily_log_share
  FOR EACH ROW
  EXECUTE FUNCTION public.tyapp_daily_log_share_enforce_group();

CREATE OR REPLACE FUNCTION public.tyapp_daily_log_share_soft_delete_single_record(
  record_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_found uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT tb_tyapp_dl_shr_id
  INTO v_found
  FROM public.tyapp_daily_log_share
  WHERE tb_tyapp_dl_shr_id = record_id
    AND owner_user_id = v_uid
    AND deleted_at IS NULL;

  IF v_found IS NULL THEN
    RAISE EXCEPTION 'Share grant not found or inaccessible';
  END IF;

  UPDATE public.tyapp_daily_log_share
  SET deleted_at = now()
  WHERE tb_tyapp_dl_shr_id = record_id
    AND owner_user_id = v_uid
    AND deleted_at IS NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.tyapp_daily_log_share_soft_delete_single_record(uuid)
  TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
