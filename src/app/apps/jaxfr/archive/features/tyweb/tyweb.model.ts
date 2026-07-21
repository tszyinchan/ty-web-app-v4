export interface TyWebIntroUserProfile {
  tb_tyweb_intro_usr_pfl_id?: string;
  tb_tyweb_intro_usr_pfl_seq_no?: number;
  user_id: string;
  public_display_name: string;
  bio?: string | null;
  profile_image_url?: string | null;
  email?: string | null;
  linkedin_url?: string | null;
  github_url?: string | null;
  remarks?: string | null;
  status?: number;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
  web_banner_title?: string | null;
  web_banner_subtitle?: string | null;
}