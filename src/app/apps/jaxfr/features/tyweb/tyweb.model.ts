import { RecordStatus } from '../../../../core/models/status.enum';

export interface TyWebSettings {
  tb_tyweb_v5_stng_id: string;
  tb_tyweb_v5_stng_seq_no?: number;
  singleton_key: number;
  notice_enabled: boolean;
  notice_message: string | null;
  notice_dismissible: boolean;
  popup_enabled: boolean;
  popup_title: string | null;
  popup_message: string | null;
  contact_email: string | null;
  linkedin_url: string | null;
  github_url: string | null;
  resume_url: string | null;
  remarks: string | null;
  status: RecordStatus;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
}
