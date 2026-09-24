import { SUBDOMAINS } from '../../../app.constants';
import { RecordStatus } from '../../models/status.enum';
import {
  CG_CUT_DURATION_MS,
  CG_DEFAULT_DURATION_MS,
  CG_ELEMENT_CATALOG,
  CG_MAX_DURATION_MS,
  CG_SAMPLE_LOGO_URL,
  CG_SAMPLE_SUBTITLE_LINES,
  CG_SUBTITLE_FONT_VH,
  CG_SUBTITLE_SHOW_FONT_VH,
  CgAnchor,
  CgElementDef,
  CgElementType,
  CgLayerLook,
  CgLayoutUnit,
  CgOutputKind,
  CgPackageLook,
  CgPackageRole,
  CgSubtitlePreset,
  DEFAULT_LOGO_LAYOUT,
  DEFAULT_SUBTITLE_LAYOUT,
} from './cg.constants';
import {
  CgLayer,
  CgLayerDraft,
  CgLayerPayload,
  CgLayout,
  CgLogoPayload,
  CgPackage,
  CgPublicOutput,
  CgSubtitleStyle,
} from './cg.model';

const ANCHOR_TRANSLATE: Record<CgAnchor, string> = {
  [CgAnchor.TopLeft]: 'translate(0, 0)',
  [CgAnchor.TopCenter]: 'translate(-50%, 0)',
  [CgAnchor.TopRight]: 'translate(-100%, 0)',
  [CgAnchor.CenterLeft]: 'translate(0, -50%)',
  [CgAnchor.Center]: 'translate(-50%, -50%)',
  [CgAnchor.CenterRight]: 'translate(-100%, -50%)',
  [CgAnchor.BottomLeft]: 'translate(0, -100%)',
  [CgAnchor.BottomCenter]: 'translate(-50%, -100%)',
  [CgAnchor.BottomRight]: 'translate(-100%, -100%)',
};

const ANCHOR_ORIGIN: Record<CgAnchor, string> = {
  [CgAnchor.TopLeft]: '0 0',
  [CgAnchor.TopCenter]: '50% 0',
  [CgAnchor.TopRight]: '100% 0',
  [CgAnchor.CenterLeft]: '0 50%',
  [CgAnchor.Center]: '50% 50%',
  [CgAnchor.CenterRight]: '100% 50%',
  [CgAnchor.BottomLeft]: '0 100%',
  [CgAnchor.BottomCenter]: '50% 100%',
  [CgAnchor.BottomRight]: '100% 100%',
};

export function createCgPublicToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(
    '',
  );
}

export function createEmptyLogoLayer(sortOrder: number): CgLayerDraft {
  return {
    clientId: `temp-${crypto.randomUUID()}`,
    element_type: CgElementType.Logo,
    public_token: createCgPublicToken(),
    layout: { ...DEFAULT_LOGO_LAYOUT },
    payload: emptyLogoPayload(CG_SAMPLE_LOGO_URL),
    visible: true,
    look: CgLayerLook.Inherit,
    sort_order: sortOrder,
    status: RecordStatus.Active,
  };
}

export function createEmptySubtitleLayer(sortOrder: number): CgLayerDraft {
  return {
    clientId: `temp-${crypto.randomUUID()}`,
    element_type: CgElementType.Subtitle,
    public_token: createCgPublicToken(),
    layout: { ...DEFAULT_SUBTITLE_LAYOUT },
    payload: emptySubtitlePayload([...CG_SAMPLE_SUBTITLE_LINES], 0),
    visible: true,
    look: CgLayerLook.Inherit,
    sort_order: sortOrder,
    status: RecordStatus.Active,
  };
}

export function createEmptyLayer(
  type: CgElementType,
  sortOrder: number,
): CgLayerDraft | null {
  if (type === CgElementType.Logo) return createEmptyLogoLayer(sortOrder);
  if (type === CgElementType.Subtitle) {
    return createEmptySubtitleLayer(sortOrder);
  }
  return null;
}

export function emptyLogoPayload(imageUrl = '', fileName?: string): CgLayerPayload {
  return {
    imageUrl,
    lines: [],
    index: null,
    cursor: 0,
    style: { preset: CgSubtitlePreset.News },
    transition: { duration_ms: CG_DEFAULT_DURATION_MS },
    ...(fileName ? { fileName } : {}),
  };
}

export function emptySubtitlePayload(
  lines: string[],
  index: number | null,
  cursor?: number,
  style?: CgSubtitleStyle,
  transitionMs?: unknown,
): CgLayerPayload {
  return {
    imageUrl: '',
    lines: [...lines],
    index,
    cursor: clampSubtitleCursor(lines, cursor ?? index ?? 0),
    style: { preset: normalizeSubtitlePreset(style?.preset) },
    transition: { duration_ms: normalizeDurationMs(transitionMs) },
  };
}

export function parseSubtitleScript(raw: string): string[] {
  if (looksLikeSrt(raw)) return parseSubtitleSrt(raw);
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

const SRT_TIME =
  /^\d{1,2}:\d{2}:\d{2}[,.]\d{1,3}\s*-->\s*\d{1,2}:\d{2}:\d{2}/m;
const SRT_INDEX = /^\d+$/;

export function looksLikeSrt(raw: string): boolean {
  return SRT_TIME.test(raw);
}

export function parseSubtitleSrt(raw: string): string[] {
  const body = raw
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/^WEBVTT[^\n]*\n+/i, '');
  const blocks = body.split(/\n{2,}/);
  const lines: string[] = [];
  for (const block of blocks) {
    const parts = block
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    if (parts.length === 0) continue;
    if (/^NOTE\b/i.test(parts[0]) || /^STYLE\b/i.test(parts[0])) continue;
    let start = 0;
    if (SRT_INDEX.test(parts[0])) start += 1;
    if (start < parts.length && SRT_TIME.test(parts[start])) start += 1;
    const cue = parts
      .slice(start)
      .map(stripSrtMarkup)
      .filter((line) => line.length > 0)
      .join('\n')
      .trim();
    if (cue) lines.push(cue);
  }
  return lines;
}

function stripSrtMarkup(line: string): string {
  return line
    .replace(/<[^>]+>/g, '')
    .replace(/\{[^}]+\}/g, '')
    .replace(/&nbsp;/gi, ' ')
    .trim();
}

export function subtitleLine(payload: CgLayerPayload): string {
  const index = payload.index;
  if (index == null || index < 0) return '';
  return payload.lines[index] ?? '';
}

export function cueSubtitleIndex(
  lines: string[],
  current: number | null,
  direction: 1 | -1,
  cursor = 0,
): { index: number | null; cursor: number } {
  if (lines.length === 0) return { index: null, cursor: 0 };
  const held = clampSubtitleCursor(lines, cursor);
  if (current == null) {
    if (direction < 0) return { index: held, cursor: held };
    const next = held + 1;
    if (next >= lines.length) return { index: null, cursor: held };
    return { index: next, cursor: next };
  }
  const next = current + direction;
  if (next < 0) return { index: 0, cursor: 0 };
  if (next >= lines.length) return { index: null, cursor: current };
  return { index: next, cursor: next };
}

export function clampSubtitleCursor(lines: string[], cursor: number): number {
  if (lines.length === 0) return 0;
  if (!Number.isFinite(cursor)) return 0;
  return Math.min(lines.length - 1, Math.max(0, Math.round(cursor)));
}

export function packageRoleLabel(role: CgPackageRole): string {
  return role === CgPackageRole.Source ? 'Source' : 'Channel';
}

export function elementDef(type: CgElementType): CgElementDef | undefined {
  return CG_ELEMENT_CATALOG.find((item) => item.type === type);
}

export function elementLabel(type: CgElementType): string {
  return elementDef(type)?.label ?? type;
}

export function isLogoPayload(payload: unknown): payload is CgLogoPayload {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'imageUrl' in payload &&
    typeof (payload as { imageUrl: unknown }).imageUrl === 'string'
  );
}

export function normalizeDurationMs(raw: unknown): number {
  const value = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(value)) return CG_DEFAULT_DURATION_MS;
  const rounded = Math.round(value);
  if (rounded <= CG_CUT_DURATION_MS) return CG_CUT_DURATION_MS;
  if (rounded > CG_MAX_DURATION_MS) return CG_MAX_DURATION_MS;
  return rounded;
}

export function isCgCut(durationMs: unknown): boolean {
  return normalizeDurationMs(durationMs) === CG_CUT_DURATION_MS;
}

export function normalizeLook(raw: unknown): CgPackageLook {
  return raw === CgPackageLook.Mono ? CgPackageLook.Mono : CgPackageLook.Color;
}

export function isCgMono(look: unknown): boolean {
  return normalizeLook(look) === CgPackageLook.Mono;
}

export function normalizeLayerLook(raw: unknown): CgLayerLook {
  if (raw === CgLayerLook.Color) return CgLayerLook.Color;
  if (raw === CgLayerLook.Mono) return CgLayerLook.Mono;
  return CgLayerLook.Inherit;
}

export function layerIsMono(
  layerLook: unknown,
  packageLook: unknown,
): boolean {
  if (isCgMono(packageLook)) return true;
  return normalizeLayerLook(layerLook) === CgLayerLook.Mono;
}

/** Subtitle cue / inner fade. Host On/Off still uses Package duration_ms. */
export function innerDurationMs(payload: Pick<CgLayerPayload, 'transition'>): number {
  return normalizeDurationMs(payload.transition?.duration_ms);
}

export function normalizeSubtitlePreset(raw: unknown): CgSubtitlePreset {
  return raw === CgSubtitlePreset.Show
    ? CgSubtitlePreset.Show
    : CgSubtitlePreset.News;
}

export function subtitlePresetOf(payload: CgLayerPayload): CgSubtitlePreset {
  return normalizeSubtitlePreset(payload.style?.preset);
}

export function subtitleTextParts(
  text: string,
): ReadonlyArray<{ text: string; latin: boolean }> {
  const parts: { text: string; latin: boolean }[] = [];
  const re = /([A-Za-z0-9][A-Za-z0-9 .,'’\-:/!?&@#%+()]*)/g;
  let last = 0;
  let match: RegExpExecArray | null = re.exec(text);
  while (match !== null) {
    if (match.index > last) {
      parts.push({ text: text.slice(last, match.index), latin: false });
    }
    parts.push({ text: match[1], latin: true });
    last = match.index + match[0].length;
    match = re.exec(text);
  }
  if (last < text.length) {
    parts.push({ text: text.slice(last), latin: false });
  }
  return parts.length > 0 ? parts : [{ text, latin: false }];
}

export function normalizePackage(raw: unknown): CgPackage | null {
  const value = asRecord(raw);
  const id = asString(value['tb_tyapp_cgpk_id']);
  const token = asString(value['public_token']);
  if (!id || !token) return null;

  return {
    tb_tyapp_cgpk_id: id,
    tb_tyapp_cgpk_seq_no:
      toOptionalNumber(value['tb_tyapp_cgpk_seq_no']) ?? undefined,
    name: asString(value['name']),
    role:
      value['role'] === CgPackageRole.Source
        ? CgPackageRole.Source
        : CgPackageRole.Channel,
    public_token: token,
    duration_ms: normalizeDurationMs(value['duration_ms']),
    look: normalizeLook(value['look']),
    status:
      value['status'] === RecordStatus.Inactive
        ? RecordStatus.Inactive
        : RecordStatus.Active,
    created_at: asString(value['created_at']) || undefined,
    updated_at: asString(value['updated_at']) || undefined,
    deleted_at: asString(value['deleted_at']) || null,
  };
}

export function normalizeLayout(raw: unknown): CgLayout {
  const value = asRecord(raw);
  const unit =
    value['unit'] === CgLayoutUnit.Pixel
      ? CgLayoutUnit.Pixel
      : CgLayoutUnit.Percent;
  const anchor = isAnchor(value['anchor'])
    ? value['anchor']
    : CgAnchor.TopLeft;
  return {
    x: toFiniteNumber(value['x'], DEFAULT_LOGO_LAYOUT.x),
    y: toFiniteNumber(value['y'], DEFAULT_LOGO_LAYOUT.y),
    unit,
    anchor,
    scale: toFiniteNumber(value['scale'], DEFAULT_LOGO_LAYOUT.scale),
    width: toOptionalNumber(value['width']),
    height: toOptionalNumber(value['height']),
  };
}

export function normalizeLogoPayload(raw: unknown): CgLayerPayload {
  if (isLogoPayload(raw)) {
    const fileName =
      'fileName' in raw && typeof raw.fileName === 'string'
        ? raw.fileName.trim()
        : '';
    return emptyLogoPayload(raw.imageUrl.trim(), fileName || undefined);
  }
  return emptyLogoPayload();
}

export function normalizeSubtitlePayload(raw: unknown): CgLayerPayload {
  const value = asRecord(raw);
  const fromLines = Array.isArray(value['lines'])
    ? value['lines'].filter((line): line is string => typeof line === 'string')
    : [];
  const lines =
    fromLines.length > 0
      ? parseSubtitleScript(fromLines.join('\n'))
      : parseSubtitleScript(asString(value['text']));
  const rawIndex = value['index'];
  let index: number | null = null;
  if (typeof rawIndex === 'number' && Number.isFinite(rawIndex)) {
    index = Math.round(rawIndex);
  }
  if (index != null && (index < 0 || index >= lines.length)) {
    index = lines.length > 0 ? 0 : null;
  }
  if (index == null && lines.length > 0 && rawIndex !== null) {
    index = 0;
  }
  if (rawIndex === null) index = null;
  const rawCursor = value['cursor'];
  const cursorSource =
    typeof rawCursor === 'number' && Number.isFinite(rawCursor)
      ? rawCursor
      : (index ?? 0);
  const styleRaw = asRecord(value['style']);
  const transitionRaw = asRecord(value['transition']);
  return emptySubtitlePayload(lines, index, cursorSource, {
    preset: normalizeSubtitlePreset(styleRaw['preset']),
  }, transitionRaw['duration_ms']);
}

export function layerToDraft(layer: CgLayer): CgLayerDraft {
  return {
    clientId: layer.tb_tyapp_cgly_id,
    tb_tyapp_cgly_id: layer.tb_tyapp_cgly_id,
    element_type: layer.element_type,
    public_token: layer.public_token,
    layout: normalizeLayout(layer.layout),
    payload: normalizeLayerPayload(layer.element_type, layer.payload),
    visible: layer.visible,
    look: normalizeLayerLook(layer.look),
    sort_order: layer.sort_order,
    status: layer.status,
  };
}

export function normalizeLayer(raw: unknown): CgLayer | null {
  const value = asRecord(raw);
  const id = asString(value['tb_tyapp_cgly_id']);
  const packageId = asString(value['package_id']);
  const token = asString(value['public_token']);
  if (!id || !packageId || !token) return null;

  const elementType = parseElementType(value['element_type']);
  if (!elementType) return null;

  return {
    tb_tyapp_cgly_id: id,
    tb_tyapp_cgly_seq_no:
      toOptionalNumber(value['tb_tyapp_cgly_seq_no']) ?? undefined,
    package_id: packageId,
    element_type: elementType,
    public_token: token,
    layout: normalizeLayout(value['layout']),
    payload: normalizeLayerPayload(elementType, value['payload']),
    visible: value['visible'] !== false,
    look: normalizeLayerLook(value['look']),
    sort_order: toFiniteNumber(value['sort_order'], 0),
    status:
      value['status'] === RecordStatus.Inactive
        ? RecordStatus.Inactive
        : RecordStatus.Active,
    created_at: asString(value['created_at']) || undefined,
    updated_at: asString(value['updated_at']) || undefined,
    deleted_at: asString(value['deleted_at']) || null,
  };
}

export function normalizePublicOutput(raw: unknown): CgPublicOutput | null {
  const value = asRecord(raw);
  const layersRaw = value['layers'];
  const layers = Array.isArray(layersRaw)
    ? layersRaw
        .map((row) => normalizeLayer(row))
        .filter((layer): layer is CgLayer => layer !== null)
    : [];

  const packageName =
    asString(value['packageName']) || asString(value['package_name']);
  if (!packageName && layers.length === 0 && !asString(value['kind'])) {
    return null;
  }

  return {
    kind:
      value['kind'] === CgOutputKind.Layer
        ? CgOutputKind.Layer
        : CgOutputKind.Package,
    packageName,
    packageRole:
      value['packageRole'] === CgPackageRole.Source ||
      value['package_role'] === CgPackageRole.Source
        ? CgPackageRole.Source
        : CgPackageRole.Channel,
    durationMs: normalizeDurationMs(
      value['durationMs'] ?? value['duration_ms'],
    ),
    look: normalizeLook(value['look']),
    layers,
  };
}

export function normalizeLayerPayload(
  type: CgElementType,
  raw: unknown,
): CgLayerPayload {
  if (type === CgElementType.Subtitle) {
    return normalizeSubtitlePayload(raw);
  }
  return normalizeLogoPayload(raw);
}

export function layoutToCss(layout: CgLayout): Record<string, string> {
  return layoutBoxCss(layout, true);
}

/** Subtitle Scale is type size, not a CSS transform of the caption box. */
export function subtitleLayoutToCss(
  layout: CgLayout,
  preset: CgSubtitlePreset = CgSubtitlePreset.News,
): Record<string, string> {
  const css = layoutBoxCss(layout, false);
  const scale = Number.isFinite(layout.scale) ? layout.scale : 1;
  const base =
    preset === CgSubtitlePreset.Show
      ? CG_SUBTITLE_SHOW_FONT_VH
      : CG_SUBTITLE_FONT_VH;
  css['--cg-sub-font'] = String(base * scale);
  return css;
}

function layoutBoxCss(
  layout: CgLayout,
  scaleAsTransform: boolean,
): Record<string, string> {
  const unit = layout.unit === CgLayoutUnit.Pixel ? 'px' : '%';
  const scale = Number.isFinite(layout.scale) ? layout.scale : 1;
  const css: Record<string, string> = {
    position: 'absolute',
    left: `${layout.x}${unit}`,
    top: `${layout.y}${unit}`,
    transform: scaleAsTransform
      ? `${ANCHOR_TRANSLATE[layout.anchor]} scale(${scale})`
      : ANCHOR_TRANSLATE[layout.anchor],
    transformOrigin: ANCHOR_ORIGIN[layout.anchor],
  };
  if (layout.width != null && Number.isFinite(layout.width)) {
    css['width'] = `${layout.width}${unit}`;
  }
  if (layout.height != null && Number.isFinite(layout.height)) {
    css['height'] = `${layout.height}${unit}`;
  }
  return css;
}

export function buildCgOverlayUrl(token: string, location: Location): string {
  const { protocol, hostname, port } = location;
  const portPart = port && port !== '80' && port !== '443' ? `:${port}` : '';
  if (isLocalDevHost(hostname)) {
    return `${protocol}//${SUBDOMAINS.CG}.localhost${portPart}/o/${token}`;
  }
  if (hostname.endsWith('tszyin.com')) {
    return `${protocol}//${SUBDOMAINS.CG}.tszyin.com/o/${token}`;
  }
  return `${protocol}//${SUBDOMAINS.CG}.localhost${portPart}/o/${token}`;
}

export function isLocalDevHost(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname.endsWith('.localhost')
  );
}

export function isEmbeddedImageUrl(url: string): boolean {
  return url.startsWith('data:image/');
}

export function isLocalFilesystemPath(value: string): boolean {
  const trimmed = value.trim();
  return (
    /^[a-zA-Z]:[\\/]/.test(trimmed) ||
    trimmed.startsWith('\\\\') ||
    trimmed.startsWith('file:')
  );
}

export function readImageFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }
      reject(new Error('Could not read that image'));
    };
    reader.onerror = () => reject(new Error('Could not read that image'));
    reader.readAsDataURL(file);
  });
}

export function layerSummary(layers: Pick<CgLayer, 'element_type'>[]): string {
  if (layers.length === 0) return 'No layers';
  const labels = layers.map((layer) => elementLabel(layer.element_type));
  return labels.join(' · ');
}

export function packageHasUnsavedIdentity(
  pkg: Pick<Partial<CgPackage>, 'name'>,
): boolean {
  return !pkg.name?.trim();
}

function parseElementType(raw: unknown): CgElementType | null {
  return Object.values(CgElementType).includes(raw as CgElementType)
    ? (raw as CgElementType)
    : null;
}

function asRecord(raw: unknown): Record<string, unknown> {
  if (typeof raw === 'object' && raw !== null) {
    return raw as Record<string, unknown>;
  }
  return {};
}

export function isSameCgPackageUrl(fromUrl: string, toUrl: string): boolean {
  const path = (url: string) => url.split('?')[0].replace(/\/+$/, '') || '/';
  const from = path(fromUrl);
  const to = path(toUrl);
  if (from.startsWith('/cg/new') && to.startsWith('/cg/new')) return true;
  const fromId = from.match(/^\/cg\/edit\/([^/]+)/)?.[1];
  const toId = to.match(/^\/cg\/edit\/([^/]+)/)?.[1];
  return !!fromId && fromId === toId;
}

function asString(raw: unknown): string {
  return typeof raw === 'string' ? raw : '';
}

function toFiniteNumber(raw: unknown, fallback: number): number {
  const value = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

function toOptionalNumber(raw: unknown): number | null {
  if (raw == null || raw === '') return null;
  const value = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(value) ? value : null;
}

function isAnchor(raw: unknown): raw is CgAnchor {
  return Object.values(CgAnchor).includes(raw as CgAnchor);
}
