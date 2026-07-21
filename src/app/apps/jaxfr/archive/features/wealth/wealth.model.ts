export type TransactionType = 'term_deposit' | 'fx_exchange' | 'cash_flow' | 'investment';

export interface WealthRemark {
  content: string;
  timestamp: string;
}

export interface WealthTransaction {
  tb_tyapp_fin_txn_id: string;
  tb_tyapp_fin_txn_seq_no: number;
  user_id: string;
  seq_major: number;
  seq_minor: number;
  transaction_type: TransactionType;
  institution_name: string;
  currency: string;
  deposit_amount: number;
  start_date: string;
  duration_months: number | null;
  annual_interest_rate: number | null;
  end_date: string | null;
  earned_interest: number | null;
  return_amount: number | null;
  fx_source_currency: string | null;
  fx_source_amount: number | null;
  source_txn_id_1: string | null;
  source_txn_id_2: string | null;
  adjustment_source_user_id: string | null;
  adjustment_amount: number | null;
  remarks: WealthRemark[] | null;
  status: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface AssetSnapshot {
  tb_tyapp_fin_snap_id: string;
  tb_tyapp_fin_snap_seq_no: number;
  user_id: string;
  institution_name: string;
  asset_type: string;
  currency: string;
  snapshot_value: number;
  snapshot_date: string;
  is_reference_only: boolean;
  remarks: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}
