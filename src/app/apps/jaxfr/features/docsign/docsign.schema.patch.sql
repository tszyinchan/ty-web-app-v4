-- Doc Sign: optional document datetime, plus date still optional.
-- Run if you already applied docsign.schema.sql. Safe to re-run.
-- If you have not run the main schema yet, skip this and run
-- docsign.schema.sql instead (it already includes these changes).

ALTER TABLE public.tyapp_docsign
  ADD COLUMN IF NOT EXISTS doc_datetime timestamptz;

DROP FUNCTION IF EXISTS public.tyapp_docsign_save_draft(uuid, text, date, text, text, uuid[]);
DROP FUNCTION IF EXISTS public.tyapp_docsign_save_header(uuid, text, date, text, uuid[]);

CREATE OR REPLACE FUNCTION public.tyapp_docsign_save_draft(
  p_id uuid,
  p_title text,
  p_doc_date date,
  p_doc_datetime timestamptz,
  p_remarks text,
  p_draft_content text,
  p_signer_user_ids uuid[]
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
  v_row public.tyapp_docsign;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF v_title IS NULL OR length(v_title) = 0 THEN
    RAISE EXCEPTION 'Title is required';
  END IF;

  v_ids := public.tyapp_docsign_normalize_signers(v_uid, p_signer_user_ids);

  IF NOT public.tyapp_user_ids_share_a_group(v_ids) THEN
    RAISE EXCEPTION 'Everyone on the signer list must belong to the same user group';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.tyapp_docsign (
      title,
      doc_date,
      doc_datetime,
      remarks,
      draft_content,
      created_by,
      signer_user_ids,
      status
    )
    VALUES (
      v_title,
      p_doc_date,
      p_doc_datetime,
      nullif(trim(p_remarks), ''),
      COALESCE(p_draft_content, ''),
      v_uid,
      v_ids,
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
    doc_datetime = p_doc_datetime,
    remarks = nullif(trim(p_remarks), ''),
    draft_content = COALESCE(p_draft_content, ''),
    signer_user_ids = v_ids
  WHERE tb_tyapp_dsgn_id = p_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.tyapp_docsign_save_header(
  p_id uuid,
  p_title text,
  p_doc_date date,
  p_doc_datetime timestamptz,
  p_remarks text,
  p_signer_user_ids uuid[]
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

  IF NOT public.tyapp_user_ids_share_a_group(v_ids) THEN
    RAISE EXCEPTION 'Everyone on the signer list must belong to the same user group';
  END IF;

  UPDATE public.tyapp_docsign
  SET
    title = v_title,
    doc_date = p_doc_date,
    doc_datetime = p_doc_datetime,
    remarks = nullif(trim(p_remarks), ''),
    signer_user_ids = v_ids
  WHERE tb_tyapp_dsgn_id = p_id
  RETURNING * INTO v_row;

  IF v_row.sent_at IS NOT NULL THEN
    v_row := public.tyapp_docsign_lock_if_complete(p_id);
  END IF;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.tyapp_docsign_save_draft(uuid, text, date, timestamptz, text, text, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tyapp_docsign_save_header(uuid, text, date, timestamptz, text, uuid[]) TO authenticated;

NOTIFY pgrst, 'reload schema';
