import { QuillModules } from 'ngx-quill';

export const CHAT_REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢'] as const;

export const CHAT_QUOTE_MAX = 10;

export const CHAT_ROOM_DESCRIPTION_MAX = 500;

/** Keep in sync with the tyapp_chat_room_min_members CHECK constraint in chat.schema.sql. */
export const CHAT_ROOM_MIN_MEMBERS = 2;

/** Members you need to pick besides yourself when creating a room. */
export const CHAT_ROOM_MIN_OTHER_MEMBERS = CHAT_ROOM_MIN_MEMBERS - 1;

export const CHAT_MARK_READ_DEBOUNCE_MS = 1000;

export const CHAT_QUILL_MODULES: QuillModules = {
  toolbar: [
    [{ font: [] }],
    [{ size: ['small', false, 'large', 'huge'] }],
    ['bold', 'italic', 'underline', 'strike'],
    [{ color: [] }],
  ],
};
