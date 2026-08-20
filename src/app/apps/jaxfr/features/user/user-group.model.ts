import { RecordStatus } from '../../../../core/models/status.enum';

export interface UserGroup {
  tb_tyapp_usr_grp_id: string;
  name: string;
  customized_order: number;
  remarks: string | null;
  status: RecordStatus;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface UserGroupMember {
  tb_tyapp_usr_grp_mbr_id: string;
  group_id: string;
  user_id: string;
  created_at: string;
}
