import { format } from 'date-fns';

import {
  downloadTextFile,
  exportTimestampPrefix,
} from '../../../../core/utils/csv-export.util';
import { ChatMessage, ChatRoom } from './chat.model';

const STAMP_FORMAT = 'yyyy-MM-dd HH:mm:ss';

export interface ChatExportJson {
  exported_at: string;
  room: {
    tb_tyapp_chat_rm_id: string;
    name: string;
    description: string | null;
    created_by: string;
    member_user_ids: string[];
    members: { user_id: string; name: string }[];
  };
  messages: Array<
    ChatMessage & {
      sender_name: string;
    }
  >;
}

function stamp(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return format(d, STAMP_FORMAT);
}

function escapeMdBody(text: string): string {
  return text
    .split('\n')
    .map((line) =>
      line.replace(/^(\s*)([#>*+\-`]|\d+\.)/, '$1\\$2'),
    )
    .join('\n');
}

function fileSafeName(name: string): string {
  const slug = name
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
  return slug || 'room';
}

export function buildChatExportMarkdown(
  room: ChatRoom,
  messages: ChatMessage[],
  nameForUserId: (userId: string) => string,
  exportedAt: Date,
): string {
  const members = room.member_user_ids.map((id) => nameForUserId(id)).join(', ');
  const desc = (room.description ?? '').trim();
  const lines = [
    `# ${room.name}`,
    '',
    ...(desc ? [`${escapeMdBody(desc)}`, ''] : []),
    `- Exported: ${format(exportedAt, STAMP_FORMAT)}`,
    `- Members: ${members || '—'}`,
    '',
  ];

  if (messages.length === 0) {
    lines.push('_No messages._');
    return lines.join('\n');
  }

  for (const message of messages) {
    const when = stamp(message.created_at);
    const who = nameForUserId(message.sender_user_id);
    const flags: string[] = [];
    if (message.edited_at) flags.push('edited');
    if (message.deleted_at) flags.push('deleted');
    const suffix = flags.length ? ` *(${flags.join(', ')})*` : '';
    lines.push('---', '', `## ${when} — ${who}${suffix}`, '');
    if (message.deleted_at) {
      lines.push('(deleted)', '');
      continue;
    }
    const body = (message.body_plain ?? '').trim() || '(empty)';
    lines.push(escapeMdBody(body), '');
  }

  return lines.join('\n');
}

export function buildChatExportJson(
  room: ChatRoom,
  messages: ChatMessage[],
  nameForUserId: (userId: string) => string,
  exportedAt: Date,
): ChatExportJson {
  return {
    exported_at: exportedAt.toISOString(),
    room: {
      tb_tyapp_chat_rm_id: room.tb_tyapp_chat_rm_id,
      name: room.name,
      description: room.description ?? null,
      created_by: room.created_by,
      member_user_ids: room.member_user_ids,
      members: room.member_user_ids.map((user_id) => ({
        user_id,
        name: nameForUserId(user_id),
      })),
    },
    messages: messages.map((message) => ({
      ...message,
      sender_name: nameForUserId(message.sender_user_id),
    })),
  };
}

export type ChatExportFormat = 'md' | 'json';

export function downloadChatExport(
  room: ChatRoom,
  messages: ChatMessage[],
  nameForUserId: (userId: string) => string,
  format: ChatExportFormat,
): void {
  const exportedAt = new Date();
  const prefix = `${exportTimestampPrefix()}_Jaxfr_chat_${fileSafeName(room.name)}`;

  if (format === 'md') {
    downloadTextFile(
      `${prefix}.md`,
      buildChatExportMarkdown(room, messages, nameForUserId, exportedAt),
      'text/markdown;charset=utf-8',
    );
    return;
  }

  downloadTextFile(
    `${prefix}.json`,
    JSON.stringify(
      buildChatExportJson(room, messages, nameForUserId, exportedAt),
      null,
      2,
    ),
    'application/json;charset=utf-8',
  );
}
