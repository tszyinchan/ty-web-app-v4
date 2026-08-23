import DOMPurify, { type Config } from 'dompurify';
import { diffChars, diffLines } from 'diff';
import { marked } from 'marked';
import {
  DiffLineVm,
  DiffPartVm,
  DocsignContentBlock,
  DocsignDocumentDetail,
  DocsignLifecycle,
  DocsignSignature,
  DocsignSignerTitles,
  DocsignVersion,
} from './docsign.model';

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
    'del',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'ul',
    'ol',
    'li',
    'blockquote',
    'pre',
    'code',
    'hr',
    'a',
    'img',
    'table',
    'thead',
    'tbody',
    'tr',
    'th',
    'td',
  ],
  ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'target', 'rel', 'align'],
  ALLOWED_URI_REGEXP: /^(?:https?:)/i,
  KEEP_CONTENT: true,
};

const DRIVE_URL_RE =
  /https?:\/\/(?:drive|docs)\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:[^#\s)]*?&)?id=)([a-zA-Z0-9_-]+)[^)\s]*/gi;

marked.setOptions({ gfm: true, breaks: true });

export function sanitizeDocsignHtml(html: string | null | undefined): string {
  if (!html) return '';
  return String(DOMPurify.sanitize(html, PURIFY_CONFIG));
}

const STANDALONE_IMAGE_RE =
  /^(https?:\/\/[^\s)]+\.(?:png|jpe?g|gif|webp|svg)(?:\?[^\s)]*)?)\s*$/gim;

function promoteStandaloneImageUrls(markdown: string): string {
  return markdown.replace(STANDALONE_IMAGE_RE, '![]($1)');
}

export function renderMarkdown(markdown: string | null | undefined): string {
  const prepared = promoteStandaloneImageUrls(markdown ?? '');
  const raw = marked.parse(prepared, { async: false });
  return sanitizeDocsignHtml(typeof raw === 'string' ? raw : '');
}

export function extractDriveFileId(url: string): string | null {
  const re = new RegExp(DRIVE_URL_RE.source, 'i');
  const match = url.match(re);
  return match?.[1] ?? null;
}

export function splitDocsignContent(
  markdown: string | null | undefined,
): DocsignContentBlock[] {
  const source = markdown ?? '';
  const blocks: DocsignContentBlock[] = [];
  const re = new RegExp(DRIVE_URL_RE.source, 'gi');
  let last = 0;
  let match = re.exec(source);

  while (match) {
    const fileId = match[1];
    let start = match.index;
    let end = match.index + match[0].length;
    const prefix = source.slice(Math.max(0, start - 120), start);
    const imageWrap = prefix.match(/!\[[^\]]*\]\($/);
    const linkWrap = !imageWrap ? prefix.match(/\[[^\]]*\]\($/) : null;
    if (imageWrap) start -= imageWrap[0].length;
    else if (linkWrap) start -= linkWrap[0].length;
    if ((imageWrap || linkWrap) && source[end] === ')') end += 1;

    if (start > last) {
      const chunk = source.slice(last, start);
      if (chunk.length) {
        blocks.push({ kind: 'html', html: renderMarkdown(chunk) });
      }
    }
    blocks.push({ kind: 'drive', fileId });
    last = end;
    match = re.exec(source);
  }

  if (last < source.length) {
    blocks.push({ kind: 'html', html: renderMarkdown(source.slice(last)) });
  }
  if (blocks.length === 0) {
    blocks.push({ kind: 'html', html: renderMarkdown(source) });
  }
  return blocks;
}

export function docsignLifecycle(
  sentAt: string | null | undefined,
  lockedAt: string | null | undefined,
): DocsignLifecycle {
  if (!sentAt) return 'draft';
  if (lockedAt) return 'locked';
  return 'pending';
}

export function currentVersion(
  doc: Pick<DocsignDocumentDetail, 'current_version_no' | 'versions'>,
): DocsignVersion | undefined {
  return doc.versions.find((item) => item.version_no === doc.current_version_no);
}

export function signaturesForVersion(
  signatures: DocsignSignature[],
  versionId: string | undefined,
): DocsignSignature[] {
  if (!versionId) return [];
  return signatures.filter((item) => item.version_id === versionId);
}

export function unsignedSignerIds(
  signerUserIds: string[],
  signatures: DocsignSignature[],
  versionId: string | undefined,
): string[] {
  const signed = new Set(
    signaturesForVersion(signatures, versionId).map((item) => item.user_id),
  );
  return signerUserIds.filter((id) => !signed.has(id));
}

export function bodyContent(doc: DocsignDocumentDetail): string {
  if (!doc.sent_at) return doc.draft_content;
  return currentVersion(doc)?.content ?? '';
}

function splitChangeLines(value: string): string[] {
  const lines = value.split('\n');
  if (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }
  return lines;
}

function wholeLineParts(kind: 'added' | 'removed' | 'unchanged', text: string): DiffPartVm[] {
  return [{ kind, text }];
}

function charDiffParts(
  oldLine: string,
  newLine: string,
): { left: DiffPartVm[]; right: DiffPartVm[] } {
  const left: DiffPartVm[] = [];
  const right: DiffPartVm[] = [];
  for (const part of diffChars(oldLine, newLine)) {
    if (part.added) {
      right.push({ kind: 'added', text: part.value });
    } else if (part.removed) {
      left.push({ kind: 'removed', text: part.value });
    } else {
      left.push({ kind: 'unchanged', text: part.value });
      right.push({ kind: 'unchanged', text: part.value });
    }
  }
  return { left, right };
}

function emptyDiffLine(): DiffLineVm {
  return { kind: 'empty', text: '', parts: [] };
}

export function splitDiffSides(
  oldText: string,
  newText: string,
): { left: DiffLineVm[]; right: DiffLineVm[] } {
  const changes = diffLines(oldText, newText);
  const left: DiffLineVm[] = [];
  const right: DiffLineVm[] = [];
  let index = 0;

  while (index < changes.length) {
    const part = changes[index];
    const next = changes[index + 1];
    const removedThenAdded = !!part.removed && !!next?.added;
    const addedThenRemoved = !!part.added && !!next?.removed;

    if (removedThenAdded || addedThenRemoved) {
      const removedPart = part.removed ? part : next;
      const addedPart = part.added ? part : next;
      const oldLines = splitChangeLines(removedPart.value);
      const newLines = splitChangeLines(addedPart.value);
      const pairCount = Math.max(oldLines.length, newLines.length);
      for (let row = 0; row < pairCount; row += 1) {
        const oldLine = oldLines[row];
        const newLine = newLines[row];
        if (oldLine !== undefined && newLine !== undefined) {
          const parts = charDiffParts(oldLine, newLine);
          left.push({ kind: 'removed', text: oldLine, parts: parts.left });
          right.push({ kind: 'added', text: newLine, parts: parts.right });
        } else if (oldLine !== undefined) {
          left.push({
            kind: 'removed',
            text: oldLine,
            parts: wholeLineParts('removed', oldLine),
          });
          right.push(emptyDiffLine());
        } else if (newLine !== undefined) {
          left.push(emptyDiffLine());
          right.push({
            kind: 'added',
            text: newLine,
            parts: wholeLineParts('added', newLine),
          });
        }
      }
      index += 2;
      continue;
    }

    const lines = splitChangeLines(part.value);
    if (part.added) {
      for (const line of lines) {
        left.push(emptyDiffLine());
        right.push({
          kind: 'added',
          text: line,
          parts: wholeLineParts('added', line),
        });
      }
    } else if (part.removed) {
      for (const line of lines) {
        left.push({
          kind: 'removed',
          text: line,
          parts: wholeLineParts('removed', line),
        });
        right.push(emptyDiffLine());
      }
    } else {
      for (const line of lines) {
        const row: DiffLineVm = {
          kind: 'unchanged',
          text: line,
          parts: wholeLineParts('unchanged', line),
        };
        left.push(row);
        right.push({ ...row, parts: [...row.parts] });
      }
    }
    index += 1;
  }

  return { left, right };
}

export function lifecycleLabel(status: DocsignLifecycle): string {
  if (status === 'draft') return 'Draft';
  if (status === 'pending') return 'Awaiting signatures';
  return 'Locked';
}

export function readerStatusLabel(status: DocsignLifecycle): string {
  if (status === 'draft') return 'Draft';
  if (status === 'pending') return 'In progress';
  return 'Completed';
}

export function normalizeSignerTitles(
  ids: string[],
  titles: DocsignSignerTitles | null | undefined,
): DocsignSignerTitles {
  const next: DocsignSignerTitles = {};
  for (const id of ids) {
    const title = (titles?.[id] ?? '').trim();
    if (title) next[id] = title;
  }
  return next;
}

export function sameSignerSet(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  const a = [...left].sort();
  const b = [...right].sort();
  return a.every((id, index) => id === b[index]);
}

export function cssQuotedString(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

export function compactStampDate(value: string | null | undefined): string {
  if (!value) return '';
  const day = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return '';
  return day.replaceAll('-', '');
}

export function compactStampDateTime(iso: string | null | undefined): {
  date: string;
  time: string;
} | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    date: `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`,
    time: `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`,
  };
}

function printNameSegment(value: string): string {
  return value
    .replace(/[\x00-\x1f<>:"/\\|?*]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildDocsignPrintPageName(input: {
  printedAt: string;
  docDate?: string | null;
  title: string;
  creatorName: string;
  appName: string;
}): string {
  const printed = compactStampDateTime(input.printedAt);
  const printDate = printed?.date || '00000000';
  const printTime = printed?.time || '000000';
  const docDate = compactStampDate(input.docDate);
  const title = printNameSegment(input.title) || 'Untitled';
  const creator = printNameSegment(input.creatorName) || 'Unknown';
  const brand = printNameSegment(`${input.appName} Doc Sign`);
  const parts = [printDate, brand, printTime];
  if (docDate) parts.push(docDate);
  parts.push(title, creator);
  return parts.join('_');
}

export interface MarkdownEditResult {
  next: string;
  cursorStart: number;
  cursorEnd: number;
}

function clampRange(
  source: string,
  start: number,
  end: number,
): { from: number; to: number } {
  const from = Math.max(0, Math.min(start, source.length));
  const to = Math.max(from, Math.min(end, source.length));
  return { from, to };
}

export function wrapMarkdownSelection(
  source: string,
  start: number,
  end: number,
  before: string,
  after: string,
): MarkdownEditResult {
  const { from, to } = clampRange(source, start, end);
  const selected = source.slice(from, to);
  const next = source.slice(0, from) + before + selected + after + source.slice(to);
  if (selected.length === 0) {
    const cursor = from + before.length;
    return { next, cursorStart: cursor, cursorEnd: cursor };
  }
  return {
    next,
    cursorStart: from,
    cursorEnd: from + before.length + selected.length + after.length,
  };
}

export function prefixSelectedLines(
  source: string,
  start: number,
  end: number,
  prefix: string,
  stripLeading?: RegExp,
): MarkdownEditResult {
  const { from, to } = clampRange(source, start, end);
  const lineStart = source.lastIndexOf('\n', from - 1) + 1;
  const afterEnd = source.indexOf('\n', to);
  const lineEnd = afterEnd === -1 ? source.length : afterEnd;
  const prefixed = source
    .slice(lineStart, lineEnd)
    .split('\n')
    .map((line) => {
      const stripped = stripLeading ? line.replace(stripLeading, '') : line;
      return stripped.startsWith(prefix) ? stripped : prefix + stripped;
    })
    .join('\n');
  const next = source.slice(0, lineStart) + prefixed + source.slice(lineEnd);
  return {
    next,
    cursorStart: lineStart,
    cursorEnd: lineStart + prefixed.length,
  };
}

export function insertAtCursor(
  source: string,
  start: number,
  end: number,
  snippet: string,
): MarkdownEditResult {
  const { from, to } = clampRange(source, start, end);
  const next = source.slice(0, from) + snippet + source.slice(to);
  const cursor = from + snippet.length;
  return { next, cursorStart: cursor, cursorEnd: cursor };
}

const SIGNATURE_SVG_PURIFY: Config = {
  ALLOWED_TAGS: ['svg', 'path', 'polyline', 'g', 'line'],
  ALLOWED_ATTR: [
    'xmlns',
    'viewBox',
    'width',
    'height',
    'd',
    'fill',
    'stroke',
    'stroke-width',
    'stroke-linecap',
    'stroke-linejoin',
    'points',
    'x1',
    'y1',
    'x2',
    'y2',
  ],
  KEEP_CONTENT: true,
};

export function sanitizeSignatureSvg(
  svg: string | null | undefined,
): string {
  if (!svg) return '';
  return String(DOMPurify.sanitize(svg, SIGNATURE_SVG_PURIFY));
}

export function isEditLeaseStale(
  heartbeat: string | null | undefined,
  staleMs: number,
  nowMs = Date.now(),
): boolean {
  if (!heartbeat) return true;
  const at = new Date(heartbeat).getTime();
  if (Number.isNaN(at)) return true;
  return nowMs - at > staleMs;
}

export function documentNo(seqNo: number | null | undefined): string {
  if (!seqNo) return '';
  return `DS-${seqNo}`;
}
