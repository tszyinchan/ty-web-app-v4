import { RecordStatus } from '../../../../core/models/status.enum';

export enum ChatMessageType {
  Text = 1,
  Image = 2,
  Audio = 3,
  Video = 4,
}

export interface ChatReactionEntry {
  user_id: string;
  created_at: string;
}

export type ChatReactions = Record<string, ChatReactionEntry[]>;

export interface ChatRoom {
  tb_tyapp_chat_rm_id: string;
  tb_tyapp_chat_rm_seq_no?: number;
  name: string;
  member_user_ids: string[];
  created_by: string;
  last_message_at?: string | null;
  status: RecordStatus;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
}

export interface ChatMessage {
  tb_tyapp_chat_msg_id: string;
  tb_tyapp_chat_msg_seq_no?: number;
  room_id: string;
  sender_user_id: string;
  msg_type: ChatMessageType;
  body: string;
  body_plain: string;
  quote_message_id?: string | null;
  reactions: ChatReactions;
  edited_at?: string | null;
  status: RecordStatus;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
}
