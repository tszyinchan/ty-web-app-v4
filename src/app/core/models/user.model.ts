export interface TyappUser {
  user_id: string;
  tb_tyapp_pofl_seq_no: number;
  role: number;
  legal_first_name: string;
  legal_middle_name: string | null;
  legal_last_name: string;
  preferred_first_name: string | null;
  customized_display_name: string | null;
  name_display_mode: number;
  status: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  remarks: string | null;
  appsheet_525_user_id: string | null;
}

export const USER_ROLES = {
  SUPER_ADMIN: 998,
  ADMIN: 900,
  USER: 100
} as const;