-- Wipe 525 TEST rows only. Keeps currency seed. Does not drop tables.
-- Run in SQL editor before re-importing, or when throwing away the test load
-- before a future clean migration.

TRUNCATE TABLE
  public.tyapp_yyems_eat,
  public.tyapp_yyems_file,
  public.tyapp_yyems_buy,
  public.tyapp_yyems_price,
  public.tyapp_yyems,
  public.tyapp_yyems_wallet,
  public.tyapp_yyems_financial_account,
  public.tyapp_yyems_fx_rate,
  public.tyapp_yyems_vendor,
  public.tyapp_yyems_vendor_category,
  public.tyapp_yyems_item,
  public.tyapp_yyems_item_category
RESTART IDENTITY CASCADE;
