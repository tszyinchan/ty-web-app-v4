export interface AppFunction {
  tb_tyapp_ap_func_id: string;
  tb_tyweb_ap_func_seq_no?: number;
  category_id: string;
  function_name: string;
  description?: string | null;
  remarks?: string | null;
  status: number;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
}
