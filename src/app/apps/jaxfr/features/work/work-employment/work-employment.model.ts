export interface WorkEmployment {
  tb_tyapp_wk_mplm_id: string;
  tb_tyweb_wk_mplm_seq_no?: number;
  employer_name_en: string;
  employer_name_zh?: string | null;
  position_title_en: string;
  position_title_zh?: string | null;
  workload_type: string;
  employment_type: string;
  remarks?: string | null;
  status: number;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
  user_id: string;
}
