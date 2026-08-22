import DOMPurify, { type Config } from 'dompurify';
import { diffLines } from 'diff';
import { marked } from 'marked';
import {
  DiffLineVm,
  DocsignContentBlock,
  DocsignDocumentDetail,
  DocsignLifecycle,
  DocsignSignature,
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

export function splitDiffSides(
  oldText: string,
  newText: string,
): { left: DiffLineVm[]; right: DiffLineVm[] } {
  const changes = diffLines(oldText, newText);
  const left: DiffLineVm[] = [];
  const right: DiffLineVm[] = [];

  for (const part of changes) {
    const lines = part.value.split('\n');
    if (lines.length > 0 && lines[lines.length - 1] === '') {
      lines.pop();
    }
    if (part.added) {
      for (const line of lines) {
        left.push({ kind: 'empty', text: '' });
        right.push({ kind: 'added', text: line });
      }
    } else if (part.removed) {
      for (const line of lines) {
        left.push({ kind: 'removed', text: line });
        right.push({ kind: 'empty', text: '' });
      }
    } else {
      for (const line of lines) {
        left.push({ kind: 'unchanged', text: line });
        right.push({ kind: 'unchanged', text: line });
      }
    }
  }

  return { left, right };
}

export function lifecycleLabel(status: DocsignLifecycle): string {
  if (status === 'draft') return 'Draft';
  if (status === 'pending') return 'Awaiting signatures';
  return 'Locked';
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
