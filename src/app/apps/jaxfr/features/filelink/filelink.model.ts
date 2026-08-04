import { RecordStatus } from "../../../../core/models/status.enum";

export interface FilelinkItem {
  tb_tyapp_fl_item_id: string;
  tb_tyapp_fl_item_seq_no?: number;
  user_id: string;
  title?: string | null;
  item_path: string[];
  url?: string | null;
  ref_date?: string | null;
  sort_order: number;
  allowed_users: string[];
  metadata?: Record<string, unknown> | null;
  status: RecordStatus;
  log?: string | null;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
}