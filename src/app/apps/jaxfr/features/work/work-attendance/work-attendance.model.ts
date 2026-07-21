export interface WorkAttendance {
  tb_tyapp_wk_attn_id: string;
  tb_tyapp_wk_attn_seq_no?: number;
  user_id: string;
  work_date: string;
  start_time?: string | null;
  meal_start_time?: string | null;
  meal_end_time?: string | null;
  break_start_time?: string | null;
  break_end_time?: string | null;
  end_time?: string | null;
  status: number;
  log?: string | null;
  log_is_secret: boolean;
  is_day_off: boolean;
  mplm_id?: string | null;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
}
