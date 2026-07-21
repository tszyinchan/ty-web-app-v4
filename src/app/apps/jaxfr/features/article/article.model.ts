export interface Article {
  tb_tyapp_atcl_id: string;
  tb_tyapp_atcl_seq_no?: number;
  publish_date: string;
  author: string;
  platform: string;
  title: string;
  content: string;
  remarks?: string | null;
  status: number;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
  manage_user_id: string;
  url_link?: string | null;
}