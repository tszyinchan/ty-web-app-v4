export interface AppCategory {
  tb_tyapp_ap_ctgy_id: string;
  tb_tyapp_ap_ctgy_seq_no: number;
  name_en: string;
  name_zh: string;
  display_name: string;
  remarks: string | null;
  status: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}
