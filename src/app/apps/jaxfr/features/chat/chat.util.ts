import DOMPurify, { type Config } from 'dompurify';
import { CHAT_EDIT_WINDOW_MS } from './chat.constants';
import { ChatMessage, ChatReactionEntry, ChatReactions } from './chat.model';

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
): boolean {
  if (!currentUserId) return false;
  if (message.deleted_at) return false;
  if (message.sender_user_id !== currentUserId) return false;
  if (!message.created_at) return false;
  return nowMs - new Date(message.created_at).getTime() < CHAT_EDIT_WINDOW_MS;
}

export function canDeleteMessage(
  message: ChatMessage,
  currentUserId: string | undefined,
): boolean {
  if (!currentUserId) return false;
  if (message.deleted_at) return false;
  return message.sender_user_id === currentUserId;
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

export function truncatePlain(text: string, max = 80): string {
  const trimmed = text.replace(/\s+/g, ' ').trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max)}…`;
}
