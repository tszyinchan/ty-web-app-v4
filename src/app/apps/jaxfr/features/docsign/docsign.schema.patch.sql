-- Incremental Doc Sign patch. Does NOT drop existing documents.
-- Paste this if tyapp_docsign already exists and you only need print log,
-- signer display order, and the matching RPCs.
-- If you are wiping dummy docs anyway, run docsign.schema.sql instead.

CREATE TABLE IF NOT EXISTS public.tyapp_docsign_print_log (
  tb_tyapp_dsgn_prn_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.tyapp_docsign (tb_tyapp_dsgn_id),
  printed_by uuid NOT NULL REFERENCES public.tyapp_user (user_id),
  printed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tyapp_docsign_print_log_document_idx
  ON public.tyapp_docsign_print_log (document_id, printed_at DESC);

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

ALTER TABLE public.tyapp_docsign_print_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tyapp_docsign_print_log FROM PUBLIC, anon;
GRANT SELECT ON public.tyapp_docsign_print_log TO authenticated;
GRANT EXECUTE ON FUNCTION public.tyapp_docsign_reorder_signers(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tyapp_docsign_log_print(uuid) TO authenticated;

DROP POLICY IF EXISTS tyapp_docsign_print_log_select ON public.tyapp_docsign_print_log;
CREATE POLICY tyapp_docsign_print_log_select
  ON public.tyapp_docsign_print_log
  FOR SELECT
  TO authenticated
  USING (public.tyapp_docsign_can_read(document_id));

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

GRANT EXECUTE ON FUNCTION public.tyapp_docsign_sign_and_send(uuid, text, text, date, text, uuid[], jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
