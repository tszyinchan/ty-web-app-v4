-- Phase D: drop ALL legacy tyapp_yyems_* objects before creating tyapp_yyhome_*.
-- Paste in Supabase SQL editor FIRST, then paste yyems.schema.sql (yyhome-named),
-- then yyems-split.schema.patch.sql / fridge patch if needed.
-- DESTRUCTIVE — all yyems / half-built yyhome feature data is removed.
--
-- Order matters: tables (and their RLS policies) first, then functions.

-- ---------------------------------------------------------------------------
-- 1) Tables CASCADE — drops dependent policies / triggers / FKs
-- ---------------------------------------------------------------------------

-- Legacy yyems (child → parent)
DROP TABLE IF EXISTS public.tyapp_yyems_eat CASCADE;
DROP TABLE IF EXISTS public.tyapp_yyems_file CASCADE;
DROP TABLE IF EXISTS public.tyapp_yyems_buy CASCADE;
DROP TABLE IF EXISTS public.tyapp_yyems_price CASCADE;
DROP TABLE IF EXISTS public.tyapp_yyems_bill_share CASCADE;
DROP TABLE IF EXISTS public.tyapp_yyems CASCADE;
DROP TABLE IF EXISTS public.tyapp_yyems_wallet CASCADE;
DROP TABLE IF EXISTS public.tyapp_yyems_financial_account CASCADE;
DROP TABLE IF EXISTS public.tyapp_yyems_fx_rate CASCADE;
DROP TABLE IF EXISTS public.tyapp_yyems_vendor CASCADE;
DROP TABLE IF EXISTS public.tyapp_yyems_vendor_category CASCADE;
DROP TABLE IF EXISTS public.tyapp_yyems_item CASCADE;
DROP TABLE IF EXISTS public.tyapp_yyems_item_category CASCADE;
DROP TABLE IF EXISTS public.tyapp_yyems_currency CASCADE;

-- Any half-built Phase D yyhome tables
DROP TABLE IF EXISTS public.tyapp_yyhome_eat CASCADE;
DROP TABLE IF EXISTS public.tyapp_yyhome_file CASCADE;
DROP TABLE IF EXISTS public.tyapp_yyhome_buy CASCADE;
DROP TABLE IF EXISTS public.tyapp_yyhome_price CASCADE;
DROP TABLE IF EXISTS public.tyapp_yyhome_bill_share CASCADE;
DROP TABLE IF EXISTS public.tyapp_yyhome CASCADE;
DROP TABLE IF EXISTS public.tyapp_yyhome_wallet CASCADE;
DROP TABLE IF EXISTS public.tyapp_yyhome_financial_account CASCADE;
DROP TABLE IF EXISTS public.tyapp_yyhome_fx_rate CASCADE;
DROP TABLE IF EXISTS public.tyapp_yyhome_vendor CASCADE;
DROP TABLE IF EXISTS public.tyapp_yyhome_vendor_category CASCADE;
DROP TABLE IF EXISTS public.tyapp_yyhome_item CASCADE;
DROP TABLE IF EXISTS public.tyapp_yyhome_item_category CASCADE;
DROP TABLE IF EXISTS public.tyapp_yyhome_currency CASCADE;

-- ---------------------------------------------------------------------------
-- 2) Functions (CASCADE in case anything else still references them)
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.tyapp_yyems_soft_delete_single_record(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.tyapp_yyems_price_soft_delete_single_record(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.tyapp_yyems_buy_soft_delete_single_record(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.tyapp_yyems_eat_soft_delete_single_record(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.tyapp_yyems_file_soft_delete_single_record(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.tyapp_yyems_fridge() CASCADE;
DROP FUNCTION IF EXISTS public.tyapp_yyems_split_group_totals(uuid, uuid, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.tyapp_yyems_is_household_member() CASCADE;

DROP FUNCTION IF EXISTS public.tyapp_yyhome_soft_delete_single_record(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.tyapp_yyhome_price_soft_delete_single_record(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.tyapp_yyhome_buy_soft_delete_single_record(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.tyapp_yyhome_eat_soft_delete_single_record(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.tyapp_yyhome_file_soft_delete_single_record(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.tyapp_yyhome_fridge() CASCADE;
DROP FUNCTION IF EXISTS public.tyapp_yyhome_split_group_totals(uuid, uuid, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.tyapp_yyhome_is_household_member() CASCADE;
