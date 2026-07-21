export interface AppLog {
  tb_tyapp_ap_lg_id: string;
  tb_tyapp_ap_lg_seq_no?: number;
  version_major: number;
  version_minor: number;
  version_patch: number;
  version_date: string;
  category_id: string;
  log_user: string;
  log_message: string;
  remarks?: string | null;
  status: number;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
}