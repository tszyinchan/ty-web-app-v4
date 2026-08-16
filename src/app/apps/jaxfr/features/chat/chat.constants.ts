import { QuillModules } from 'ngx-quill';

export const CHAT_REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢'] as const;

export const CHAT_QUOTE_MAX = 10;

export const CHAT_MARK_READ_DEBOUNCE_MS = 1000;

export const CHAT_QUILL_MODULES: QuillModules = {
  toolbar: [
    [{ font: [] }],
    [{ size: ['small', false, 'large', 'huge'] }],
    ['bold', 'italic', 'underline', 'strike'],
    [{ color: [] }],
  ],
};
