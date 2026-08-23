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

NOTIFY pgrst, 'reload schema';
