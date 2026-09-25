-- Bill group. Safe to re-run.
-- Paste in the Supabase SQL editor.
-- Excel rows (legacy_id set) are stamped with the group whose members are
-- exactly the two users bound to appsheet_525_user_id cty and frd.
-- Ownership is not used. If that group is missing or not exactly those two, nothing is stamped.

ALTER TABLE public.tyapp_yyems
  ADD COLUMN IF NOT EXISTS group_id uuid
    REFERENCES public.tyapp_user_group (tb_tyapp_usr_grp_id);

CREATE INDEX IF NOT EXISTS tyapp_yyems_group_idx
  ON public.tyapp_yyems (group_id)
  WHERE deleted_at IS NULL;

WITH couple AS (
  SELECT user_id
  FROM public.tyapp_user
  WHERE deleted_at IS NULL
    AND lower(btrim(coalesce(appsheet_525_user_id, ''))) IN ('cty', 'frd')
),
sized AS (
  SELECT m.group_id
  FROM public.tyapp_user_group_member m
  JOIN public.tyapp_user_group g
    ON g.tb_tyapp_usr_grp_id = m.group_id
  WHERE g.deleted_at IS NULL
    AND g.status = 1
  GROUP BY m.group_id
  HAVING count(*) = 2
     AND count(*) FILTER (
       WHERE m.user_id IN (SELECT user_id FROM couple)
     ) = 2
),
only_one AS (
  SELECT group_id
  FROM sized
  WHERE (SELECT count(*) FROM couple) = 2
    AND (SELECT count(*) FROM sized) = 1
)
UPDATE public.tyapp_yyems AS bill
SET group_id = (SELECT group_id FROM only_one)
WHERE bill.legacy_id IS NOT NULL
  AND bill.deleted_at IS NULL
  AND bill.group_id IS NULL
  AND EXISTS (SELECT 1 FROM only_one);
