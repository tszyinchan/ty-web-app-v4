/**
 * Display-only layout for Breaking (always vertical) and Ticker.
 * Stored queue text is unchanged.
 *
 * Horizontal: `--` → `——`, `...` → `……`.
 * Vertical: halfwidth punctuation beside a CJK ideograph becomes fullwidth,
 * then brackets, quotes, dashes and ellipses map to Unicode vertical forms.
 * `，` `。` `、` stay themselves so `vert` can sit them in the top-right of the cell.
 */

export type CgNewsGlyphMode = 'upright' | 'rotate' | 'corner';

export interface CgNewsGlyph {
  text: string;
  mode: CgNewsGlyphMode;
}

const HALF_TO_FULL: Record<string, string> = {
  ',': '\uFF0C',
  '.': '\u3002',
  '!': '\uFF01',
  '?': '\uFF1F',
  ':': '\uFF1A',
  ';': '\uFF1B',
  '(': '\uFF08',
  ')': '\uFF09',
  '[': '\u3010',
  ']': '\u3011',
};

const VERTICAL_FORM: Record<string, string> = {
  '\uFF08': '\uFE35',
  '\uFF09': '\uFE36',
  '\u300C': '\uFE41',
  '\u300D': '\uFE42',
  '\u300E': '\uFE43',
  '\u300F': '\uFE44',
  '\u3010': '\uFE3B',
  '\u3011': '\uFE3C',
  '\u300A': '\uFE3D',
  '\u300B': '\uFE3E',
  '\u3008': '\uFE3F',
  '\u3009': '\uFE40',
  '\u2014': '\uFE31',
  '\u2026': '\uFE19',
};

const CORNER_PUNCT = new Set<string>(['\uFF0C', '\u3002', '\u3001']);

/** Halfwidth quotes and brackets that were not promoted to a vertical form. */
const ROTATE_SYMBOL = new Set<string>(['"', "'", '(', ')', '[', ']', '{', '}', '`']);

function expandAsciiMarks(text: string): string {
  return text.replace(/\.\.\./g, '\u2026\u2026').replace(/--/g, '\u2014\u2014');
}

function isCjkIdeograph(ch: string | undefined): boolean {
  if (!ch) return false;
  const cp = ch.codePointAt(0) ?? 0;
  return (
    (cp >= 0x3400 && cp <= 0x4dbf) ||
    (cp >= 0x4e00 && cp <= 0x9fff) ||
    (cp >= 0xf900 && cp <= 0xfaff)
  );
}

function isDroppedSpace(ch: string): boolean {
  return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === '\f';
}

function isAsciiLetter(ch: string): boolean {
  return (ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z');
}

function promoteHalfwidth(
  ch: string,
  prev: string | undefined,
  next: string | undefined,
): string {
  const full = HALF_TO_FULL[ch];
  if (!full) return ch;
  if (isCjkIdeograph(prev) || isCjkIdeograph(next)) return full;
  return ch;
}

/** True where a run holds at least two ASCII letters (`it's`, `COVID`). A lone `A` stays upright. */
function latinWordMask(chars: readonly string[]): boolean[] {
  const mask = chars.map(() => false);
  let index = 0;
  while (index < chars.length) {
    if (!isAsciiLetter(chars[index] ?? '')) {
      index += 1;
      continue;
    }
    let end = index;
    const letters: number[] = [];
    while (end < chars.length) {
      const ch = chars[end] ?? '';
      if (isAsciiLetter(ch)) {
        letters.push(end);
        end += 1;
        continue;
      }
      const join = ch === "'" || ch === '-';
      if (join && isAsciiLetter(chars[end + 1] ?? '')) {
        end += 1;
        continue;
      }
      break;
    }
    if (letters.length >= 2) {
      for (let mark = index; mark < end; mark += 1) mask[mark] = true;
    }
    index = Math.max(end, index + 1);
  }
  return mask;
}

export function cgNewsHorizontalText(text: string): string {
  return expandAsciiMarks(text);
}

export function cgNewsVerticalGlyphs(text: string): CgNewsGlyph[] {
  const chars = [...expandAsciiMarks(text)];
  const mapped: string[] = [];
  for (let index = 0; index < chars.length; index += 1) {
    const ch = chars[index] ?? '';
    if (isDroppedSpace(ch)) continue;
    const promoted = promoteHalfwidth(ch, chars[index - 1], chars[index + 1]);
    mapped.push(VERTICAL_FORM[promoted] ?? promoted);
  }
  const word = latinWordMask(mapped);
  return mapped.map((ch, index) => {
    if (CORNER_PUNCT.has(ch)) return { text: ch, mode: 'corner' };
    if (word[index] || ROTATE_SYMBOL.has(ch)) return { text: ch, mode: 'rotate' };
    return { text: ch, mode: 'upright' };
  });
}
