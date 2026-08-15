import { RecordStatus } from './status.enum';

export interface AppSettings {
  tb_tyapp_app_stng_id: string;
  tb_tyapp_app_stng_seq_no?: number;
  singleton_key: number;
  chat_edit_window_ms: number;
  chat_delete_window_ms: number;
  remarks?: string | null;
  status: RecordStatus;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
}
