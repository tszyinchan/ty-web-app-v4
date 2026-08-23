-- Jaxfr Doc Sign schema, RLS, and RPCs.
-- Paste this entire file into the Supabase SQL editor.
-- Requires tyapp_user_ids_share_a_group() from user-group.schema.sql.
--
-- This run DROPS all tyapp_docsign* functions and document tables, then
-- recreates them (dummy records only).
-- tyapp_user_signature (your saved signature profile) is kept.
--
-- Draft (sent_at IS NULL): only created_by can read/write. Content lives on
-- draft_content and is overwritten on save. Sign & send snapshots it as
-- version 1 and signs the submitter. After send, versions are immutable; a
-- content edit on Sign & send inserts a new version and signs only the
-- submitter. Lock when every signer_user_ids row has a signature on the
-- current version. Optional signer_titles is a { user_id: role } map.
-- signer_user_ids order is the paper display order (any signer can reorder
-- until the document is locked). tyapp_docsign_print_log records each print
-- (printed_by + printed_at); the row uuid is the print id on the paper.

-- ---------------------------------------------------------------------------
-- Reset document tables + every tyapp_docsign* function
-- tyapp_user_signature rows are kept.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname LIKE 'tyapp_docsign%'
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;

DROP TABLE IF EXISTS public.tyapp_docsign_print_log CASCADE;
DROP TABLE IF EXISTS public.tyapp_docsign_signature CASCADE;
DROP TABLE IF EXISTS public.tyapp_docsign_version CASCADE;
DROP TABLE IF EXISTS public.tyapp_docsign CASCADE;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.tyapp_user_signature (
  tb_tyapp_usig_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tb_tyapp_usig_seq_no bigint GENERATED ALWAYS AS IDENTITY,
  user_id uuid NOT NULL REFERENCES public.tyapp_user (user_id),
  kind text NOT NULL,
  signed_name text NOT NULL,
  signed_mark text,
  svg_markup text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tyapp_user_signature_kind_ck CHECK (kind IN ('name', 'draw')),
  CONSTRAINT tyapp_user_signature_name_not_blank CHECK (length(trim(signed_name)) > 0),
  CONSTRAINT tyapp_user_signature_draw_has_svg CHECK (
    kind <> 'draw' OR length(trim(COALESCE(svg_markup, ''))) > 0
  )
);

CREATE INDEX IF NOT EXISTS tyapp_user_signature_user_idx
  ON public.tyapp_user_signature (user_id, created_at DESC);

ALTER TABLE public.tyapp_user_signature
  ADD COLUMN IF NOT EXISTS signed_mark text;

CREATE TABLE IF NOT EXISTS public.tyapp_docsign (
  tb_tyapp_dsgn_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tb_tyapp_dsgn_seq_no bigint GENERATED ALWAYS AS IDENTITY,
  title text NOT NULL,
  doc_date date,
  remarks text,
  draft_content text NOT NULL DEFAULT '',
  created_by uuid NOT NULL REFERENCES public.tyapp_user (user_id),
  signer_user_ids uuid[] NOT NULL,
  signer_titles jsonb NOT NULL DEFAULT '{}'::jsonb,
  sent_at timestamptz,
  current_version_no integer NOT NULL DEFAULT 0,
  locked_at timestamptz,
  editing_by uuid REFERENCES public.tyapp_user (user_id),
  editing_heartbeat timestamptz,
  status smallint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT tyapp_docsign_title_not_blank CHECK (length(trim(title)) > 0),
  CONSTRAINT tyapp_docsign_created_by_is_signer
    CHECK (created_by = ANY (signer_user_ids)),
  CONSTRAINT tyapp_docsign_min_signers CHECK (cardinality(signer_user_ids) >= 1),
  CONSTRAINT tyapp_docsign_version_sent_ck CHECK (
    (sent_at IS NULL AND current_version_no = 0 AND locked_at IS NULL)
    OR (sent_at IS NOT NULL AND current_version_no >= 1)
  ),
  CONSTRAINT tyapp_docsign_locked_requires_sent CHECK (
    locked_at IS NULL OR sent_at IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS tyapp_docsign_created_by_idx
  ON public.tyapp_docsign (created_by);

CREATE INDEX IF NOT EXISTS tyapp_docsign_signers_idx
  ON public.tyapp_docsign USING GIN (signer_user_ids);

CREATE INDEX IF NOT EXISTS tyapp_docsign_doc_date_idx
  ON public.tyapp_docsign (doc_date DESC NULLS LAST, created_at DESC);

CREATE TABLE IF NOT EXISTS public.tyapp_docsign_version (
  tb_tyapp_dsgn_ver_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tb_tyapp_dsgn_ver_seq_no bigint GENERATED ALWAYS AS IDENTITY,
  document_id uuid NOT NULL REFERENCES public.tyapp_docsign (tb_tyapp_dsgn_id),
  version_no integer NOT NULL,
  content text NOT NULL DEFAULT '',
  created_by uuid NOT NULL REFERENCES public.tyapp_user (user_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tyapp_docsign_version_unique UNIQUE (document_id, version_no),
  CONSTRAINT tyapp_docsign_version_no_positive CHECK (version_no >= 1)
);

CREATE INDEX IF NOT EXISTS tyapp_docsign_version_document_idx
  ON public.tyapp_docsign_version (document_id, version_no);

CREATE TABLE IF NOT EXISTS public.tyapp_docsign_signature (
  tb_tyapp_dsgn_sig_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tb_tyapp_dsgn_sig_seq_no bigint GENERATED ALWAYS AS IDENTITY,
  document_id uuid NOT NULL REFERENCES public.tyapp_docsign (tb_tyapp_dsgn_id),
  version_id uuid NOT NULL REFERENCES public.tyapp_docsign_version (tb_tyapp_dsgn_ver_id),
  user_id uuid NOT NULL REFERENCES public.tyapp_user (user_id),
  signed_at timestamptz NOT NULL DEFAULT now(),
  signed_name text NOT NULL,
  signed_mark text,
  signed_svg text,
  signature_id uuid REFERENCES public.tyapp_user_signature (tb_tyapp_usig_id),
  CONSTRAINT tyapp_docsign_signature_unique UNIQUE (version_id, user_id),
  CONSTRAINT tyapp_docsign_signed_name_not_blank CHECK (length(trim(signed_name)) > 0)
);

CREATE INDEX IF NOT EXISTS tyapp_docsign_signature_document_idx
  ON public.tyapp_docsign_signature (document_id);

CREATE INDEX IF NOT EXISTS tyapp_docsign_signature_version_idx
  ON public.tyapp_docsign_signature (version_id);

CREATE TABLE IF NOT EXISTS public.tyapp_docsign_print_log (
  tb_tyapp_dsgn_prn_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.tyapp_docsign (tb_tyapp_dsgn_id),
  printed_by uuid NOT NULL REFERENCES public.tyapp_user (user_id),
  printed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tyapp_docsign_print_log_document_idx
  ON public.tyapp_docsign_print_log (document_id, printed_at DESC);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS tyapp_docsign_set_updated_at ON public.tyapp_docsign;
CREATE TRIGGER tyapp_docsign_set_updated_at
  BEFORE UPDATE ON public.tyapp_docsign
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.tyapp_docsign_forbid_version_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Document versions are immutable';
END;
$$;

DROP TRIGGER IF EXISTS tyapp_docsign_version_no_update ON public.tyapp_docsign_version;
CREATE TRIGGER tyapp_docsign_version_no_update
  BEFORE UPDATE OR DELETE ON public.tyapp_docsign_version
  FOR EACH ROW
  EXECUTE FUNCTION public.tyapp_docsign_forbid_version_mutation();

CREATE OR REPLACE FUNCTION public.tyapp_docsign_enforce_single_group()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.tyapp_user_ids_share_a_group(NEW.signer_user_ids) THEN
    RAISE EXCEPTION 'Everyone on the signer list must belong to the same user group';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tyapp_docsign_enforce_single_group ON public.tyapp_docsign;
CREATE TRIGGER tyapp_docsign_enforce_single_group
  BEFORE INSERT OR UPDATE OF signer_user_ids, created_by
  ON public.tyapp_docsign
  FOR EACH ROW
  EXECUTE FUNCTION public.tyapp_docsign_enforce_single_group();

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.tyapp_docsign_can_read(p_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tyapp_docsign d
    WHERE d.tb_tyapp_dsgn_id = p_id
      AND d.deleted_at IS NULL
      AND (
        (d.sent_at IS NULL AND d.created_by = auth.uid())
        OR (
          d.sent_at IS NOT NULL
          AND auth.uid() = ANY (d.signer_user_ids)
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.tyapp_docsign_normalize_signers(
  p_created_by uuid,
  p_signer_user_ids uuid[]
)
RETURNS uuid[]
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_ids uuid[];
BEGIN
  SELECT COALESCE(array_agg(t.id ORDER BY t.ord), ARRAY[p_created_by])
  INTO v_ids
  FROM (
    SELECT x.id, min(x.ord) AS ord
    FROM unnest(COALESCE(p_signer_user_ids, '{}')) WITH ORDINALITY AS x(id, ord)
    INNER JOIN public.tyapp_user u
      ON u.user_id = x.id
     AND u.deleted_at IS NULL
    GROUP BY x.id
  ) t;

  IF NOT (p_created_by = ANY (v_ids)) THEN
    v_ids := array_append(v_ids, p_created_by);
  END IF;

  RETURN v_ids;
END;
$$;

CREATE OR REPLACE FUNCTION public.tyapp_docsign_normalize_titles(
  p_ids uuid[],
  p_titles jsonb
)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    jsonb_object_agg(x.k, to_jsonb(x.v)),
    '{}'::jsonb
  )
  FROM (
    SELECT
      sid::text AS k,
      nullif(trim(COALESCE(p_titles ->> sid::text, '')), '') AS v
    FROM unnest(p_ids) AS sid
  ) x
  WHERE x.v IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public.tyapp_docsign_lock_if_complete(p_id uuid)
RETURNS public.tyapp_docsign
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doc public.tyapp_docsign;
  v_ver_id uuid;
  v_missing integer;
BEGIN
  SELECT * INTO v_doc
  FROM public.tyapp_docsign
  WHERE tb_tyapp_dsgn_id = p_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF v_doc.tb_tyapp_dsgn_id IS NULL THEN
    RAISE EXCEPTION 'Document not found';
  END IF;

  IF v_doc.sent_at IS NULL OR v_doc.locked_at IS NOT NULL THEN
    RETURN v_doc;
  END IF;

  SELECT tb_tyapp_dsgn_ver_id INTO v_ver_id
  FROM public.tyapp_docsign_version
  WHERE document_id = p_id
    AND version_no = v_doc.current_version_no;

  IF v_ver_id IS NULL THEN
    RETURN v_doc;
  END IF;

  SELECT count(*)::integer INTO v_missing
  FROM unnest(v_doc.signer_user_ids) AS sid
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.tyapp_docsign_signature s
    WHERE s.version_id = v_ver_id
      AND s.user_id = sid
  );

  IF v_missing = 0 THEN
    UPDATE public.tyapp_docsign
    SET
      locked_at = now(),
      editing_by = NULL,
      editing_heartbeat = NULL
    WHERE tb_tyapp_dsgn_id = p_id
      AND locked_at IS NULL
    RETURNING * INTO v_doc;
  END IF;

  RETURN v_doc;
END;
$$;

CREATE OR REPLACE FUNCTION public.tyapp_docsign_current_user_signature()
RETURNS public.tyapp_user_signature
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.tyapp_user_signature;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_row
  FROM public.tyapp_user_signature
  WHERE user_id = v_uid
  ORDER BY created_at DESC
  LIMIT 1;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.tyapp_docsign_insert_my_signature(
  p_id uuid,
  p_ver_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_sig public.tyapp_user_signature;
BEGIN
  v_sig := public.tyapp_docsign_current_user_signature();
  IF v_sig.tb_tyapp_usig_id IS NULL THEN
    RAISE EXCEPTION 'Set up your signature before signing';
  END IF;

  INSERT INTO public.tyapp_docsign_signature (
    document_id,
    version_id,
    user_id,
    signed_name,
    signed_mark,
    signed_svg,
    signature_id
  )
  VALUES (
    p_id,
    p_ver_id,
    v_uid,
    v_sig.signed_name,
    v_sig.signed_mark,
    v_sig.svg_markup,
    v_sig.tb_tyapp_usig_id
  )
  ON CONFLICT (version_id, user_id) DO NOTHING;
END;
$$;

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.tyapp_docsign_save_draft(uuid, text, date, timestamptz, text, text, uuid[]);
DROP FUNCTION IF EXISTS public.tyapp_docsign_save_draft(uuid, text, date, text, text, uuid[]);
DROP FUNCTION IF EXISTS public.tyapp_docsign_save_header(uuid, text, date, timestamptz, text, uuid[]);
DROP FUNCTION IF EXISTS public.tyapp_docsign_save_header(uuid, text, date, text, uuid[]);
DROP FUNCTION IF EXISTS public.tyapp_docsign_send(uuid);
DROP FUNCTION IF EXISTS public.tyapp_docsign_save_version(uuid, text);
DROP FUNCTION IF EXISTS public.tyapp_docsign_sign(uuid, text);

CREATE OR REPLACE FUNCTION public.tyapp_docsign_save_draft(
  p_id uuid,
  p_title text,
  p_doc_date date,
  p_remarks text,
  p_draft_content text,
  p_signer_user_ids uuid[],
  p_signer_titles jsonb
)
RETURNS public.tyapp_docsign
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_title text := trim(p_title);
  v_ids uuid[];
  v_titles jsonb;
  v_row public.tyapp_docsign;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF v_title IS NULL OR length(v_title) = 0 THEN
    RAISE EXCEPTION 'Title is required';
  END IF;

  v_ids := public.tyapp_docsign_normalize_signers(v_uid, p_signer_user_ids);
  v_titles := public.tyapp_docsign_normalize_titles(v_ids, p_signer_titles);

  IF NOT public.tyapp_user_ids_share_a_group(v_ids) THEN
    RAISE EXCEPTION 'Everyone on the signer list must belong to the same user group';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.tyapp_docsign (
      title,
      doc_date,
      remarks,
      draft_content,
      created_by,
      signer_user_ids,
      signer_titles,
      status
    )
    VALUES (
      v_title,
      p_doc_date,
      nullif(trim(p_remarks), ''),
      COALESCE(p_draft_content, ''),
      v_uid,
      v_ids,
      v_titles,
      1
    )
    RETURNING * INTO v_row;
    RETURN v_row;
  END IF;

  SELECT * INTO v_row
  FROM public.tyapp_docsign
  WHERE tb_tyapp_dsgn_id = p_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF v_row.tb_tyapp_dsgn_id IS NULL THEN
    RAISE EXCEPTION 'Document not found';
  END IF;

  IF v_row.created_by <> v_uid THEN
    RAISE EXCEPTION 'Only the owner can save a draft';
  END IF;

  IF v_row.sent_at IS NOT NULL THEN
    RAISE EXCEPTION 'This document has already been sent';
  END IF;

  UPDATE public.tyapp_docsign
  SET
    title = v_title,
    doc_date = p_doc_date,
    remarks = nullif(trim(p_remarks), ''),
    draft_content = COALESCE(p_draft_content, ''),
    signer_user_ids = v_ids,
    signer_titles = v_titles
  WHERE tb_tyapp_dsgn_id = p_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.tyapp_docsign_save_header(
  p_id uuid,
  p_title text,
  p_doc_date date,
  p_remarks text,
  p_signer_user_ids uuid[],
  p_signer_titles jsonb
)
RETURNS public.tyapp_docsign
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_title text := trim(p_title);
  v_ids uuid[];
  v_titles jsonb;
  v_row public.tyapp_docsign;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF v_title IS NULL OR length(v_title) = 0 THEN
    RAISE EXCEPTION 'Title is required';
  END IF;

  SELECT * INTO v_row
  FROM public.tyapp_docsign
  WHERE tb_tyapp_dsgn_id = p_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF v_row.tb_tyapp_dsgn_id IS NULL THEN
    RAISE EXCEPTION 'Document not found';
  END IF;

  IF v_row.created_by <> v_uid THEN
    RAISE EXCEPTION 'Only the owner can update document details';
  END IF;

  IF v_row.locked_at IS NOT NULL THEN
    RAISE EXCEPTION 'This document is locked';
  END IF;

  v_ids := public.tyapp_docsign_normalize_signers(v_row.created_by, p_signer_user_ids);
  v_titles := public.tyapp_docsign_normalize_titles(v_ids, p_signer_titles);

  IF NOT public.tyapp_user_ids_share_a_group(v_ids) THEN
    RAISE EXCEPTION 'Everyone on the signer list must belong to the same user group';
  END IF;

  UPDATE public.tyapp_docsign
  SET
    title = v_title,
    doc_date = p_doc_date,
    remarks = nullif(trim(p_remarks), ''),
    signer_user_ids = v_ids,
    signer_titles = v_titles
  WHERE tb_tyapp_dsgn_id = p_id
  RETURNING * INTO v_row;

  IF v_row.sent_at IS NOT NULL THEN
    v_row := public.tyapp_docsign_lock_if_complete(p_id);
  END IF;

  RETURN v_row;
END;
$$;

DROP FUNCTION IF EXISTS public.tyapp_docsign_sign_and_send(uuid, text);
DROP FUNCTION IF EXISTS public.tyapp_docsign_sign_and_send(uuid, text, text, date, text, uuid[], jsonb);

CREATE OR REPLACE FUNCTION public.tyapp_docsign_sign_and_send(
  p_id uuid,
  p_title text,
  p_doc_date date,
  p_remarks text,
  p_content text,
  p_signer_user_ids uuid[],
  p_signer_titles jsonb
)
RETURNS public.tyapp_docsign
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.tyapp_docsign;
  v_ver_id uuid;
  v_current text;
  v_next integer;
  v_title text := trim(p_title);
  v_remarks text := nullif(trim(p_remarks), '');
  v_content text := COALESCE(p_content, '');
  v_ids uuid[];
  v_titles jsonb;
  v_changed boolean := false;
  v_already_signed boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF v_title IS NULL OR length(v_title) = 0 THEN
    RAISE EXCEPTION 'Title is required';
  END IF;

  SELECT * INTO v_row
  FROM public.tyapp_docsign
  WHERE tb_tyapp_dsgn_id = p_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF v_row.tb_tyapp_dsgn_id IS NULL THEN
    RAISE EXCEPTION 'Document not found';
  END IF;

  IF v_row.locked_at IS NOT NULL THEN
    RAISE EXCEPTION 'This document is locked';
  END IF;

  v_ids := public.tyapp_docsign_normalize_signers(v_row.created_by, p_signer_user_ids);
  v_titles := public.tyapp_docsign_normalize_titles(v_ids, p_signer_titles);

  IF NOT (v_uid = ANY (v_ids)) THEN
    RAISE EXCEPTION 'You are not a signer on this document';
  END IF;

  IF NOT public.tyapp_user_ids_share_a_group(v_ids) THEN
    RAISE EXCEPTION 'Everyone on the signer list must belong to the same user group';
  END IF;

  IF v_row.sent_at IS NULL THEN
    IF v_row.created_by <> v_uid THEN
      RAISE EXCEPTION 'Only the owner can send this document';
    END IF;

    UPDATE public.tyapp_docsign
    SET
      title = v_title,
      doc_date = p_doc_date,
      remarks = v_remarks,
      draft_content = v_content,
      signer_user_ids = v_ids,
      signer_titles = v_titles,
      sent_at = now(),
      current_version_no = 1
    WHERE tb_tyapp_dsgn_id = p_id;

    INSERT INTO public.tyapp_docsign_version (
      document_id,
      version_no,
      content,
      created_by
    )
    VALUES (
      p_id,
      1,
      v_content,
      v_uid
    )
    RETURNING tb_tyapp_dsgn_ver_id INTO v_ver_id;

    PERFORM public.tyapp_docsign_insert_my_signature(p_id, v_ver_id);
    RETURN public.tyapp_docsign_lock_if_complete(p_id);
  END IF;

  IF NOT (v_uid = ANY (v_row.signer_user_ids)) THEN
    RAISE EXCEPTION 'You are not a signer on this document';
  END IF;

  SELECT tb_tyapp_dsgn_ver_id, content
  INTO v_ver_id, v_current
  FROM public.tyapp_docsign_version
  WHERE document_id = p_id
    AND version_no = v_row.current_version_no;

  IF v_ver_id IS NULL THEN
    RAISE EXCEPTION 'Current version not found';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.tyapp_docsign_signature
    WHERE version_id = v_ver_id
      AND user_id = v_uid
  )
  INTO v_already_signed;

  IF v_already_signed THEN
    RAISE EXCEPTION 'You already signed this version';
  END IF;

  v_changed :=
    v_row.title IS DISTINCT FROM v_title
    OR v_row.doc_date IS DISTINCT FROM p_doc_date
    OR v_row.remarks IS DISTINCT FROM v_remarks
    OR v_row.signer_user_ids IS DISTINCT FROM v_ids
    OR v_row.signer_titles IS DISTINCT FROM v_titles
    OR v_current IS DISTINCT FROM v_content;

  IF v_changed THEN
    v_next := v_row.current_version_no + 1;

    UPDATE public.tyapp_docsign
    SET
      title = v_title,
      doc_date = p_doc_date,
      remarks = v_remarks,
      signer_user_ids = v_ids,
      signer_titles = v_titles,
      current_version_no = v_next,
      locked_at = NULL
    WHERE tb_tyapp_dsgn_id = p_id;

    INSERT INTO public.tyapp_docsign_version (
      document_id,
      version_no,
      content,
      created_by
    )
    VALUES (
      p_id,
      v_next,
      v_content,
      v_uid
    )
    RETURNING tb_tyapp_dsgn_ver_id INTO v_ver_id;
  END IF;

  PERFORM public.tyapp_docsign_insert_my_signature(p_id, v_ver_id);
  RETURN public.tyapp_docsign_lock_if_complete(p_id);
END;
$$;

DROP FUNCTION IF EXISTS public.tyapp_docsign_save_user_signature(text, text, text);

CREATE OR REPLACE FUNCTION public.tyapp_docsign_save_user_signature(
  p_kind text,
  p_signed_name text,
  p_signed_mark text,
  p_svg_markup text
)
RETURNS public.tyapp_user_signature
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_kind text := trim(p_kind);
  v_name text := trim(p_signed_name);
  v_mark text := nullif(trim(p_signed_mark), '');
  v_svg text := nullif(trim(p_svg_markup), '');
  v_row public.tyapp_user_signature;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF v_kind IS NULL OR v_kind NOT IN ('name', 'draw') THEN
    RAISE EXCEPTION 'Signature kind must be name or draw';
  END IF;

  IF v_name IS NULL OR length(v_name) = 0 THEN
    RAISE EXCEPTION 'Legal name is required';
  END IF;

  IF v_kind = 'name' AND v_mark IS NULL THEN
    RAISE EXCEPTION 'Signature words are required';
  END IF;

  IF v_kind = 'draw' AND v_svg IS NULL THEN
    RAISE EXCEPTION 'Draw a signature before saving';
  END IF;

  IF v_kind = 'name' THEN
    v_svg := NULL;
  END IF;

  INSERT INTO public.tyapp_user_signature (
    user_id,
    kind,
    signed_name,
    signed_mark,
    svg_markup
  )
  VALUES (
    v_uid,
    v_kind,
    v_name,
    v_mark,
    v_svg
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.tyapp_docsign_claim_edit(p_id uuid)
RETURNS public.tyapp_docsign
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.tyapp_docsign;
  v_stale boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.tyapp_docsign_can_read(p_id) THEN
    RAISE EXCEPTION 'Document not found';
  END IF;

  SELECT * INTO v_row
  FROM public.tyapp_docsign
  WHERE tb_tyapp_dsgn_id = p_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF v_row.tb_tyapp_dsgn_id IS NULL THEN
    RAISE EXCEPTION 'Document not found';
  END IF;

  IF v_row.locked_at IS NOT NULL THEN
    RETURN v_row;
  END IF;

  v_stale :=
    v_row.editing_by IS NULL
    OR v_row.editing_by = v_uid
    OR v_row.editing_heartbeat IS NULL
    OR v_row.editing_heartbeat < now() - interval '90 seconds';

  IF NOT v_stale THEN
    RAISE EXCEPTION 'This document is already open by another user';
  END IF;

  UPDATE public.tyapp_docsign
  SET
    editing_by = v_uid,
    editing_heartbeat = now()
  WHERE tb_tyapp_dsgn_id = p_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.tyapp_docsign_heartbeat_edit(p_id uuid)
RETURNS public.tyapp_docsign
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.tyapp_docsign;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_row
  FROM public.tyapp_docsign
  WHERE tb_tyapp_dsgn_id = p_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF v_row.tb_tyapp_dsgn_id IS NULL THEN
    RAISE EXCEPTION 'Document not found';
  END IF;

  IF v_row.editing_by IS DISTINCT FROM v_uid THEN
    RETURN v_row;
  END IF;

  UPDATE public.tyapp_docsign
  SET editing_heartbeat = now()
  WHERE tb_tyapp_dsgn_id = p_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.tyapp_docsign_release_edit(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.tyapp_docsign
  SET
    editing_by = NULL,
    editing_heartbeat = NULL
  WHERE tb_tyapp_dsgn_id = p_id
    AND editing_by = v_uid
    AND deleted_at IS NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.tyapp_docsign_soft_delete_single_record(
  record_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_owner uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT created_by INTO v_owner
  FROM public.tyapp_docsign
  WHERE tb_tyapp_dsgn_id = record_id
    AND deleted_at IS NULL;

  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Document not found';
  END IF;

  IF v_owner <> v_uid THEN
    RAISE EXCEPTION 'Only the owner can delete this document';
  END IF;

  UPDATE public.tyapp_docsign
  SET deleted_at = now()
  WHERE tb_tyapp_dsgn_id = record_id
    AND deleted_at IS NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.tyapp_docsign_reorder_signers(
  p_id uuid,
  p_signer_user_ids uuid[]
)
RETURNS public.tyapp_docsign
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.tyapp_docsign;
  v_ids uuid[];
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_row
  FROM public.tyapp_docsign
  WHERE tb_tyapp_dsgn_id = p_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF v_row.tb_tyapp_dsgn_id IS NULL THEN
    RAISE EXCEPTION 'Document not found';
  END IF;

  IF v_row.locked_at IS NOT NULL THEN
    RAISE EXCEPTION 'This document is locked';
  END IF;

  IF NOT (v_uid = ANY (v_row.signer_user_ids)) THEN
    RAISE EXCEPTION 'You are not a signer on this document';
  END IF;

  v_ids := public.tyapp_docsign_normalize_signers(v_row.created_by, p_signer_user_ids);

  IF (
    SELECT array_agg(id ORDER BY id)
    FROM unnest(v_ids) AS id
  ) IS DISTINCT FROM (
    SELECT array_agg(id ORDER BY id)
    FROM unnest(v_row.signer_user_ids) AS id
  ) THEN
    RAISE EXCEPTION 'Signer list must stay the same; only the order can change';
  END IF;

  UPDATE public.tyapp_docsign
  SET signer_user_ids = v_ids
  WHERE tb_tyapp_dsgn_id = p_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.tyapp_docsign_log_print(p_id uuid)
RETURNS public.tyapp_docsign_print_log
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.tyapp_docsign_print_log;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.tyapp_docsign_can_read(p_id) THEN
    RAISE EXCEPTION 'Document not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.tyapp_docsign
    WHERE tb_tyapp_dsgn_id = p_id
      AND deleted_at IS NULL
      AND locked_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Only locked documents can be printed';
  END IF;

  INSERT INTO public.tyapp_docsign_print_log (
    document_id,
    printed_by
  )
  VALUES (
    p_id,
    v_uid
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

-- ---------------------------------------------------------------------------
-- Grants + RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.tyapp_docsign ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tyapp_docsign_version ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tyapp_docsign_signature ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tyapp_user_signature ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tyapp_docsign_print_log ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.tyapp_docsign FROM PUBLIC, anon;
REVOKE ALL ON public.tyapp_docsign_version FROM PUBLIC, anon;
REVOKE ALL ON public.tyapp_docsign_signature FROM PUBLIC, anon;
REVOKE ALL ON public.tyapp_user_signature FROM PUBLIC, anon;
REVOKE ALL ON public.tyapp_docsign_print_log FROM PUBLIC, anon;

GRANT SELECT ON public.tyapp_docsign TO authenticated;
GRANT SELECT ON public.tyapp_docsign_version TO authenticated;
GRANT SELECT ON public.tyapp_docsign_signature TO authenticated;
GRANT SELECT ON public.tyapp_user_signature TO authenticated;
GRANT SELECT ON public.tyapp_docsign_print_log TO authenticated;

GRANT EXECUTE ON FUNCTION public.tyapp_docsign_can_read(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tyapp_docsign_save_draft(uuid, text, date, text, text, uuid[], jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tyapp_docsign_save_header(uuid, text, date, text, uuid[], jsonb) TO authenticated;
DO $$
DECLARE
  v_sig text;
BEGIN
  SELECT p.oid::regprocedure::text
  INTO v_sig
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'tyapp_docsign_sign_and_send';

  IF v_sig IS NULL THEN
    RAISE EXCEPTION 'tyapp_docsign_sign_and_send was not created';
  END IF;

  EXECUTE 'GRANT EXECUTE ON FUNCTION ' || v_sig || ' TO authenticated';
END $$;
GRANT EXECUTE ON FUNCTION public.tyapp_docsign_save_user_signature(text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tyapp_docsign_current_user_signature() TO authenticated;
GRANT EXECUTE ON FUNCTION public.tyapp_docsign_claim_edit(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tyapp_docsign_heartbeat_edit(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tyapp_docsign_release_edit(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tyapp_docsign_soft_delete_single_record(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tyapp_docsign_reorder_signers(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tyapp_docsign_log_print(uuid) TO authenticated;

DROP POLICY IF EXISTS tyapp_docsign_select ON public.tyapp_docsign;
CREATE POLICY tyapp_docsign_select
  ON public.tyapp_docsign
  FOR SELECT
  TO authenticated
  USING (public.tyapp_docsign_can_read(tb_tyapp_dsgn_id));

DROP POLICY IF EXISTS tyapp_docsign_version_select ON public.tyapp_docsign_version;
CREATE POLICY tyapp_docsign_version_select
  ON public.tyapp_docsign_version
  FOR SELECT
  TO authenticated
  USING (public.tyapp_docsign_can_read(document_id));

DROP POLICY IF EXISTS tyapp_docsign_signature_select ON public.tyapp_docsign_signature;
CREATE POLICY tyapp_docsign_signature_select
  ON public.tyapp_docsign_signature
  FOR SELECT
  TO authenticated
  USING (public.tyapp_docsign_can_read(document_id));

DROP POLICY IF EXISTS tyapp_user_signature_select ON public.tyapp_user_signature;
CREATE POLICY tyapp_user_signature_select
  ON public.tyapp_user_signature
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS tyapp_docsign_print_log_select ON public.tyapp_docsign_print_log;
CREATE POLICY tyapp_docsign_print_log_select
  ON public.tyapp_docsign_print_log
  FOR SELECT
  TO authenticated
  USING (public.tyapp_docsign_can_read(document_id));

NOTIFY pgrst, 'reload schema';
