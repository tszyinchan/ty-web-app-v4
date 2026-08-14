import { QuillModules } from 'ngx-quill';

/** Keep in sync with the 5-minute interval in chat.schema.sql */
export const CHAT_EDIT_WINDOW_MS = 5 * 60 * 1000;

export const CHAT_REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢'] as const;

export const CHAT_QUILL_MODULES: QuillModules = {
  toolbar: [
    [{ font: [] }],
    [{ size: ['small', false, 'large', 'huge'] }],
    ['bold', 'italic', 'underline', 'strike'],
    [{ color: [] }],
  ],
};
