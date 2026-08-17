export interface TyappPushSubscription {
  tb_tyapp_usr_psh_id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  user_agent?: string | null;
  created_at?: string;
  updated_at?: string;
}
