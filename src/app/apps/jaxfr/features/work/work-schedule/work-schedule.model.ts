export interface WorkSchedule {
  tb_tyapp_wk_scdl_id: string;
  tb_tyapp_wk_scdl_seq_no?: number;
  user_id: string;
  work_date: string;
  planned_start_time?: string | null;
  planned_end_time?: string | null;
  planned_meal_minutes?: number;
  is_day_off: boolean;
  log?: string | null;
  status: number;
  mplm_id?: string | null;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
}
