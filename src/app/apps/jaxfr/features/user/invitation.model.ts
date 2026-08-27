import { RecordStatus } from '../../../../core/models/status.enum';

export interface Invitation {
  tb_tyapp_inv_id: string;
  code: string;
  status: RecordStatus;
  max_uses: number;
  uses_count: number;
  expires_at: string | null;
  app_ids: string[];
  feature_ids: string[];
  group_id: string | null;
  created_by: string;
  remarks: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}
