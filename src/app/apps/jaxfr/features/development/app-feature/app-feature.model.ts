import { RecordStatus } from '../../../../../core/models/status.enum';

export interface AppFeature {
  tb_tyapp_ap_ftr_id: string;
  tb_tyapp_ap_ftr_seq_no: number;
  customized_order: number;
  app_id: string;
  name: string;
  icon: string | null;
  route: string | null;
  is_admin_only: boolean;
  show_in_launcher: boolean;
  remarks: string | null;
  status: RecordStatus;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}
