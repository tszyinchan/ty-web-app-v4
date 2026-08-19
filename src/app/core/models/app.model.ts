import { RecordStatus } from './status.enum';

export interface TyappApp {
  tb_tyapp_app_id: string;
  tb_tyapp_app_seq_no: number;
  customized_order: number;
  name: string;
  remarks: string | null;
  status: RecordStatus;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}
