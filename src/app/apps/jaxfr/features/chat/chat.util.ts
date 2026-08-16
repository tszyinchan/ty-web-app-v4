import DOMPurify, { type Config } from 'dompurify';
import { CHAT_QUOTE_MAX } from './chat.constants';
import { ChatMessage, ChatReactionEntry, ChatReactions, ChatRoomRead } from './chat.model';

const ALLOWED_CSS_PROPS = new Set([
  'color',
  'background-color',
  'font-size',
  'font-family',
  'font-weight',
  'font-style',
  'text-decoration',
]);

const PURIFY_CONFIG: Config = {
  ALLOWED_TAGS: [
    'p',
    'br',
    'span',
    'strong',
    'b',
    'em',
    'i',
    'u',
    's',
    'strike',
    'a',
  ],
  ALLOWED_ATTR: ['style', 'class', 'href', 'target', 'rel'],
  ALLOWED_URI_REGEXP: /^(?:https?:)/i,
  KEEP_CONTENT: true,
};

let purifyHooked = false;

function ensurePurifyHook(): void {
  if (purifyHooked) return;
  purifyHooked = true;

  DOMPurify.addHook('uponSanitizeAttribute', (_node, data) => {
    if (data.attrName === 'style') {
      const kept: string[] = [];
      for (const part of data.attrValue.split(';')) {
        const colon = part.indexOf(':');
        if (colon < 0) continue;
        const name = part.slice(0, colon).trim().toLowerCase();
        const value = part.slice(colon + 1).trim();
        if (ALLOWED_CSS_PROPS.has(name) && value) {
          kept.push(`${name}:${value}`);
        }
      }
      data.attrValue = kept.join(';');
      if (!data.attrValue) {
        data.keepAttr = false;
      }
      return;
    }

    if (data.attrName === 'class') {
      const classes = data.attrValue
        .split(/\s+/)
        .filter((cls) => cls.startsWith('ql-'));
      data.attrValue = classes.join(' ');
      if (!data.attrValue) {
        data.keepAttr = false;
      }
    }
  });
}

export function sanitizeChatHtml(html: string | null | undefined): string {
  if (!html) return '';
  ensurePurifyHook();
  return String(DOMPurify.sanitize(html, PURIFY_CONFIG));
}

export function isPlainEmpty(plain: string | null | undefined): boolean {
  return (plain ?? '').replace(/\u00a0/g, ' ').trim().length === 0;
}

export function canEditMessage(
  message: ChatMessage,
  currentUserId: string | undefined,
  nowMs: number,
  windowMs: number | null | undefined,
): boolean {
  if (!currentUserId) return false;
  if (message.deleted_at) return false;
  if (message.sender_user_id !== currentUserId) return false;
  if (!message.created_at) return false;
  if (windowMs == null || windowMs <= 0) return false;
  return nowMs - new Date(message.created_at).getTime() < windowMs;
}

export function canDeleteMessage(
  message: ChatMessage,
  currentUserId: string | undefined,
  nowMs: number,
  windowMs: number | null | undefined,
): boolean {
  if (!currentUserId) return false;
  if (message.deleted_at) return false;
  if (message.sender_user_id !== currentUserId) return false;
  if (!message.created_at) return false;
  if (windowMs == null || windowMs <= 0) return false;
  return nowMs - new Date(message.created_at).getTime() < windowMs;
}

export function normalizeReactions(
  raw: ChatReactions | null | undefined,
): ChatReactions {
  if (!raw || typeof raw !== 'object') return {};
  const result: ChatReactions = {};
  for (const [emoji, entries] of Object.entries(raw)) {
    if (!Array.isArray(entries)) continue;
    const cleaned: ChatReactionEntry[] = [];
    for (const entry of entries) {
      if (
        entry &&
        typeof entry === 'object' &&
        typeof entry.user_id === 'string' &&
        typeof entry.created_at === 'string'
      ) {
        cleaned.push({
          user_id: entry.user_id,
          created_at: entry.created_at,
        });
      }
    }
    if (cleaned.length > 0) {
      result[emoji] = cleaned;
    }
  }
  return result;
}

export function normalizeQuoteIds(
  ids: unknown,
  legacyId?: string | null,
): string[] {
  const fromArray = Array.isArray(ids)
    ? ids.filter((id): id is string => typeof id === 'string' && id.length > 0)
    : [];
  if (fromArray.length > 0) return fromArray.slice(0, CHAT_QUOTE_MAX);
  if (typeof legacyId === 'string' && legacyId.length > 0) return [legacyId];
  return [];
}

export interface ReactionChipVm {
  emoji: string;
  count: number;
  mine: boolean;
  tooltip: string;
}

/** Order chips by when that emoji first appeared on the message. */
export function toReactionChips(
  reactions: ChatReactions,
  currentUserId: string | undefined,
  labelForUserId: (userId: string) => string,
): ReactionChipVm[] {
  return Object.entries(reactions)
    .map(([emoji, entries]) => {
      let firstAt = Number.POSITIVE_INFINITY;
      for (const entry of entries) {
        const t = Date.parse(entry.created_at);
        if (Number.isFinite(t) && t < firstAt) firstAt = t;
      }
      return {
        emoji,
        count: entries.length,
        mine:
          !!currentUserId &&
          entries.some((entry) => entry.user_id === currentUserId),
        tooltip: entries.map((entry) => labelForUserId(entry.user_id)).join(', '),
        firstAt,
      };
    })
    .sort((a, b) => a.firstAt - b.firstAt || a.emoji.localeCompare(b.emoji))
    .map((item) => ({
      emoji: item.emoji,
      count: item.count,
      mine: item.mine,
      tooltip: item.tooltip,
    }));
}

export function truncatePlain(text: string, max = 80): string {
  const trimmed = text.replace(/\s+/g, ' ').trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max)}…`;
}

export function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) {
    const token = parts[0];
    return token.length === 1 ? token.toUpperCase() : token.slice(0, 2).toUpperCase();
  }
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

export interface ChatReaderChip {
  userId: string;
  initials: string;
  name: string;
}

/** Each other member's chip sits on the newest of *my* messages their watermark has reached. */
export function readersByMessageId(
  messages: ChatMessage[],
  reads: ChatRoomRead[],
  currentUserId: string,
  labelForUserId: (userId: string) => string,
): Map<string, ChatReaderChip[]> {
  const result = new Map<string, ChatReaderChip[]>();
  if (!currentUserId) return result;

  const mine = messages
    .filter(
      (item) =>
        item.sender_user_id === currentUserId &&
        !item.deleted_at &&
        !!item.created_at,
    )
    .sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? ''));

  if (mine.length === 0) return result;

  for (const read of reads) {
    if (read.user_id === currentUserId) continue;
    let match: ChatMessage | undefined;
    for (const message of mine) {
      if ((message.created_at ?? '') <= read.last_read_at) {
        match = message;
      } else {
        break;
      }
    }
    if (!match) continue;
    const name = labelForUserId(read.user_id);
    const list = result.get(match.tb_tyapp_chat_msg_id) ?? [];
    list.push({
      userId: read.user_id,
      initials: initialsFromName(name),
      name,
    });
    result.set(match.tb_tyapp_chat_msg_id, list);
  }

  for (const list of result.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name));
  }

  return result;
}
