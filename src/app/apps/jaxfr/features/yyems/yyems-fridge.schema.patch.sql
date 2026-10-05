-- Fridge remaining stock: compute in Postgres instead of downloading
-- every buy + eat row to the browser. Safe to re-run.

CREATE OR REPLACE FUNCTION public.tyapp_yyhome_fridge()
RETURNS TABLE (
  tb_tyapp_yhby_id uuid,
  home_amount numeric,
  home_unit text,
  expiry_date date,
  eat_priority integer,
  bill_id uuid,
  price_id uuid,
  remaining numeric,
  eaten numeric,
  item_id uuid,
  item_name_zh text,
  item_name_en text,
  vendor_id uuid,
  vendor_name text,
  product_name text,
  product_name_zh text,
  brand text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    b.tb_tyapp_yhby_id,
    b.home_amount,
    b.home_unit,
    b.expiry_date,
    b.eat_priority,
    b.bill_id,
    b.price_id,
    (b.home_amount - COALESCE(e.eaten, 0)) AS remaining,
    COALESCE(e.eaten, 0) AS eaten,
    i.tb_tyapp_yhit_id,
    i.name_zh,
    i.name_en,
    v.tb_tyapp_yhvd_id,
    v.name,
    pr.product_name,
    pr.product_name_zh,
    pr.brand
  FROM public.tyapp_yyhome_buy b
  JOIN public.tyapp_yyhome_price pr
    ON pr.tb_tyapp_yhpr_id = b.price_id
   AND pr.deleted_at IS NULL
  JOIN public.tyapp_yyhome_item i
    ON i.tb_tyapp_yhit_id = pr.item_id
   AND i.deleted_at IS NULL
  LEFT JOIN public.tyapp_yyhome_vendor v
    ON v.tb_tyapp_yhvd_id = pr.vendor_id
   AND v.deleted_at IS NULL
  LEFT JOIN LATERAL (
    SELECT SUM(x.home_amount) AS eaten
    FROM public.tyapp_yyhome_eat x
    WHERE x.buy_id = b.tb_tyapp_yhby_id
      AND x.deleted_at IS NULL
  ) e ON true
  WHERE b.deleted_at IS NULL
    AND public.tyapp_yyhome_is_household_member()
    AND (b.home_amount - COALESCE(e.eaten, 0)) > 0
  ORDER BY b.eat_priority, b.expiry_date NULLS LAST, i.name_zh;
$$;

GRANT EXECUTE ON FUNCTION public.tyapp_yyhome_fridge() TO authenticated;
