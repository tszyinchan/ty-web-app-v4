-- Wipe 525 TEST rows only. Keeps currency seed. Does not drop tables.
-- Run in SQL editor before re-importing, or when throwing away the test load
-- before a future clean migration.

TRUNCATE TABLE
  public.tyapp_yyhome_eat,
  public.tyapp_yyhome_file,
  public.tyapp_yyhome_buy,
  public.tyapp_yyhome_price,
  public.tyapp_yyhome_bill_share,
  public.tyapp_yyhome,
  public.tyapp_yyhome_wallet,
  public.tyapp_yyhome_financial_account,
  public.tyapp_yyhome_fx_rate,
  public.tyapp_yyhome_vendor,
  public.tyapp_yyhome_vendor_category,
  public.tyapp_yyhome_item,
  public.tyapp_yyhome_item_category
RESTART IDENTITY CASCADE;
