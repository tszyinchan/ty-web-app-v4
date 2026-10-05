-- Wipe yyHome / legacy yyems before recreating tyapp_yyhome_*.
-- Paste in Supabase SQL editor FIRST, then yyems.schema.sql, then split/fridge patches.
-- DESTRUCTIVE — all yyems / yyhome feature data is removed.
--
-- Order: tables (CASCADE) first, then functions.

-- ---------------------------------------------------------------------------
-- 1) Tables CASCADE
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

-- Phase D / current yyhome (child → parent)
DROP TABLE IF EXISTS public.tyapp_yyhome_eat CASCADE;
DROP TABLE IF EXISTS public.tyapp_yyhome_file CASCADE;
DROP TABLE IF EXISTS public.tyapp_yyhome_buy CASCADE;
DROP TABLE IF EXISTS public.tyapp_yyhome_price CASCADE;
DROP TABLE IF EXISTS public.tyapp_yyhome_bill_share CASCADE;
DROP TABLE IF EXISTS public.tyapp_yyhome_bill CASCADE;
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
-- 2) Functions
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
DROP FUNCTION IF EXISTS public.tyapp_yyhome_bill_soft_delete_single_record(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.tyapp_yyhome_price_soft_delete_single_record(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.tyapp_yyhome_buy_soft_delete_single_record(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.tyapp_yyhome_eat_soft_delete_single_record(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.tyapp_yyhome_file_soft_delete_single_record(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.tyapp_yyhome_fridge() CASCADE;
DROP FUNCTION IF EXISTS public.tyapp_yyhome_split_group_totals(uuid, uuid, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.tyapp_yyhome_is_household_member() CASCADE;
