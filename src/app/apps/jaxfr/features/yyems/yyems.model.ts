import { RecordStatus } from '../../../../core/models/status.enum';

/** Legacy AppSheet Person IDs — only used by the test import mapper. */
export const YYEMS_LEGACY_PARTY = {
  Cty: 'cty',
  Frd: 'frd',
  Shared: 'yyems',
  DiningOut: 'dining_out',
  Nil: 'nil',
} as const;

/** Eat rows that are not a login: shared meal, eating out, or none. */
export const YYEMS_EATEN_OTHER = {
  Shared: 'shared',
  DiningOut: 'dining_out',
  Nil: 'nil',
} as const;

export type YyemsEatenOther =
  (typeof YYEMS_EATEN_OTHER)[keyof typeof YYEMS_EATEN_OTHER];

export type YyemsLocationTz = 'HK' | 'TO';

export const YYEMS_IN_OR_OUT = {
  In: 'in',
  Out: 'out',
  Free: 'free',
} as const;

export type YyemsInOrOut =
  (typeof YYEMS_IN_OR_OUT)[keyof typeof YYEMS_IN_OR_OUT];

/** Home / Eat meal slots. 1/3/5 are the three meals; the rest are extras. */
export const YYEMS_MEAL = {
  Breakfast: '1早',
  TeaAm: '2茶',
  Lunch: '3午',
  TeaPm: '4茶',
  Dinner: '5晚',
  Supper: '6宵',
  Use: '7用',
  Seasoning: '8調',
  Wash: '9洗',
} as const;

export type YyemsMeal = (typeof YYEMS_MEAL)[keyof typeof YYEMS_MEAL];

export const YYEMS_MEALS: readonly YyemsMeal[] = [
  YYEMS_MEAL.Breakfast,
  YYEMS_MEAL.TeaAm,
  YYEMS_MEAL.Lunch,
  YYEMS_MEAL.TeaPm,
  YYEMS_MEAL.Dinner,
  YYEMS_MEAL.Supper,
  YYEMS_MEAL.Use,
  YYEMS_MEAL.Seasoning,
  YYEMS_MEAL.Wash,
];

export type YyemsFileKind = 'receipt' | 'photo' | 'file';

export type YyemsBarcodeType = 'upc' | 'plu' | 'price_embedded';

export interface YyemsItemCategory {
  tb_tyapp_yic_id: string;
  tb_tyapp_yic_seq_no: number;
  legacy_id: string | null;
  code: string;
  name_zh: string;
  name_en: string | null;
  division: string | null;
  sort_order: number;
  status: RecordStatus;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface YyemsItem {
  tb_tyapp_yit_id: string;
  tb_tyapp_yit_seq_no: number;
  legacy_id: string | null;
  category_id: string;
  name_zh: string;
  name_en: string | null;
  food_category: string | null;
  description: string | null;
  plan_buy: boolean;
  status: RecordStatus;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface YyemsVendorCategory {
  tb_tyapp_yvc_id: string;
  tb_tyapp_yvc_seq_no: number;
  legacy_id: string | null;
  level1: string;
  level2: string;
  level3: string;
  display_name: string;
  status: RecordStatus;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface YyemsVendor {
  tb_tyapp_yvd_id: string;
  tb_tyapp_yvd_seq_no: number;
  legacy_id: string | null;
  category_id: string;
  name: string;
  name_short: string | null;
  sort_order: number | null;
  status: RecordStatus;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface YyemsVendorEmbed extends YyemsVendor {
  category: Pick<
    YyemsVendorCategory,
    'display_name' | 'level1' | 'level2' | 'level3'
  > | null;
}

export interface YyemsFinancialAccount {
  tb_tyapp_yfa_id: string;
  tb_tyapp_yfa_seq_no: number;
  legacy_id: string | null;
  /** Null = household/shared account (legacy Person ID yyems). */
  owner_user_id: string | null;
  display_name: string;
  currency: string;
  status: RecordStatus;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface YyemsWallet {
  tb_tyapp_ywl_id: string;
  tb_tyapp_ywl_seq_no: number;
  legacy_id: string | null;
  financial_account_id: string;
  name: string;
  sort_order: number | null;
  remarks: string | null;
  status: RecordStatus;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface YyemsCurrency {
  code: string;
  symbol: string;
}

export interface YyemsFxRate {
  tb_tyapp_yfx_id: string;
  tb_tyapp_yfx_seq_no: number;
  currency: string;
  year: number;
  to_cad: number;
  source: string | null;
  status: RecordStatus;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface YyemsBill {
  tb_tyapp_yym_id: string;
  tb_tyapp_yym_seq_no: number;
  legacy_id: string | null;
  occurred_at: string;
  location_tz: YyemsLocationTz;
  in_or_out: YyemsInOrOut;
  vendor_id: string;
  currency: string;
  amount: number;
  wallet_id: string;
  /**
   * Person this bill is attributed to for settlement.
   * Null = shared 50/50 (legacy ownership yyems — not a user row).
   */
  ownership_user_id: string | null;
  remark: string | null;
  description: string | null;
  reconciled: boolean;
  /**
   * Amount in the wallet's currency when it differs from `currency`.
   * Settlement uses this when set; otherwise `amount`.
   */
  wallet_amount: number | null;
  period_start: string | null;
  period_end: string | null;
  created_by: string;
  status: RecordStatus;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface YyemsPrice {
  tb_tyapp_ypr_id: string;
  tb_tyapp_ypr_seq_no: number;
  legacy_id: string | null;
  priced_at: string;
  vendor_id: string | null;
  item_id: string;
  product_name: string | null;
  product_name_zh: string | null;
  brand: string | null;
  currency: string;
  packed_price: number | null;
  tax_rate: number | null;
  discount_rate: number | null;
  marked_price: number | null;
  marked_amount: number | null;
  marked_unit: string | null;
  packed_amount: number | null;
  packed_unit: string | null;
  tag: string | null;
  is_organic: boolean | null;
  has_msg: boolean | null;
  origin: string | null;
  barcode: string | null;
  barcode_type: YyemsBarcodeType | null;
  remarks: string | null;
  nutri_basis_amount: number | null;
  nutri_basis_unit: string | null;
  protein_g: number | null;
  carb_g: number | null;
  fat_g: number | null;
  calories_kcal: number | null;
  fiber_g: number | null;
  sodium_mg: number | null;
  nutri_is_estimated: boolean;
  created_by: string;
  status: RecordStatus;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface YyemsBuy {
  tb_tyapp_yby_id: string;
  tb_tyapp_yby_seq_no: number;
  legacy_id: string | null;
  price_id: string;
  yyems_id: string | null;
  paid: number | null;
  home_amount: number;
  home_unit: string | null;
  marked_amount_count: number | null;
  expiry_date: string | null;
  remarks: string | null;
  paid_adjust_note: string | null;
  paid_adjust_reason: string | null;
  eat_priority: number;
  created_by: string;
  status: RecordStatus;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface YyemsEat {
  tb_tyapp_yet_id: string;
  tb_tyapp_yet_seq_no: number;
  legacy_id: string | null;
  buy_id: string;
  home_amount: number;
  meal: YyemsMeal;
  eaten_by_user_id: string | null;
  eaten_by_other: YyemsEatenOther | null;
  eat_date: string;
  added_at: string;
  description: string | null;
  created_by: string;
  status: RecordStatus;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface YyemsFile {
  tb_tyapp_yfl_id: string;
  tb_tyapp_yfl_seq_no: number;
  legacy_id: string | null;
  yyems_id: string;
  kind: YyemsFileKind;
  /** Google Drive file id in the Jaxfr folder. Null until a legacy AppSheet path is moved. */
  drive_file_id: string | null;
  /** AppSheet relative path; keep until Drive migration. */
  legacy_path: string | null;
  original_filename: string | null;
  created_by: string;
  status: RecordStatus;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

/** Form value for shared 50/50 bill ownership (maps to ownership_user_id null). */
export const YYEMS_OWNERSHIP_SHARED = 'shared';

export const YYEMS_MAIN_MEALS: readonly YyemsMeal[] = [
  YYEMS_MEAL.Breakfast,
  YYEMS_MEAL.Lunch,
  YYEMS_MEAL.Dinner,
];

export interface YyemsPriceWithVendor extends YyemsPrice {
  vendor: YyemsVendor | null;
}

export interface YyemsPriceEmbed extends YyemsPrice {
  item: YyemsItem | null;
  vendor: YyemsVendor | null;
}

export interface YyemsBuyEmbed extends YyemsBuy {
  price: YyemsPriceEmbed | null;
}

export interface YyemsBillEmbed extends YyemsBill {
  vendor: YyemsVendorEmbed | null;
  wallet: YyemsWallet | null;
}

export interface YyemsEatEmbed extends YyemsEat {
  buy: YyemsBuyEmbed | null;
}

export interface YyemsEatAmount {
  tb_tyapp_yet_id: string;
  buy_id: string;
  home_amount: number;
}

export interface YyemsFridgeRow {
  buy: YyemsBuy;
  price: YyemsPrice | null;
  item: YyemsItem | null;
  vendor: YyemsVendor | null;
  eaten: number;
  remaining: number;
}

export interface YyemsFridgeRpcRow {
  tb_tyapp_yby_id: string;
  home_amount: number;
  home_unit: string | null;
  expiry_date: string | null;
  eat_priority: number;
  yyems_id: string | null;
  price_id: string;
  remaining: number;
  eaten: number;
  item_id: string | null;
  item_name_zh: string | null;
  item_name_en: string | null;
  vendor_id: string | null;
  vendor_name: string | null;
  product_name: string | null;
  product_name_zh: string | null;
  brand: string | null;
}
