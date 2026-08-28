import { RecordStatus } from "./status.enum";

export const DELETED_USER_LABEL = 'Deleted user';
export const DELETED_USER_SUFFIX = ' (Deleted)';

export interface TyappUser {
  user_id: string;
  tb_tyapp_pofl_seq_no: number;
  role: number;
  legal_first_name: string | null;
  legal_middle_name: string | null;
  legal_last_name: string | null;
  preferred_first_name: string | null;
  customized_display_name: string | null;
  name_display_mode: number;
  status: RecordStatus;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  remarks: string | null;
  appsheet_525_user_id: string | null;
  allowed_apps: string[];
}

export interface ReactivationRequest {
  tb_tyapp_usr_ract_id: string;
  user_id: string;
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
}

export const USER_ROLES = {
  SUPER_ADMIN: 998,
  ADMIN: 900,
  USER: 100
} as const;

export enum NameDisplayMode {
  LegalFirstMiddleLast = 1,
  LegalLastMiddleFirst = 2,
  PreferredFirstMiddleLast = 3,
  PreferredLastMiddleFirst = 4,
  CustomizedOnly = 5,
}