import { SUBDOMAINS } from '../../../app.constants';
import { RecordStatus } from '../../models/status.enum';
import {
  CG_CUT_DURATION_MS,
  CG_DEFAULT_DURATION_MS,
  CG_DEFAULT_PACKAGE_EDIT_MODE,
  CG_DESKTOP_VIEWPORT,
  CG_EDIT_MODE_STORAGE_PREFIX,
  CG_OVERLAY_CHANNEL_PREFIX,
  CG_OVERLAY_CUE_KIND,
  CG_ELEMENT_CATALOG,
  CG_MAX_DURATION_MS,
  CG_PAGE_VIEWPORT,
  CG_SAMPLE_LOGO_URL,
  CG_STAGE_REFERENCE_WIDTH_PX,
  CG_SAMPLE_SUBTITLE_LINES,
  CG_LATIN_FONT_ALIASES,
  CG_SUBTITLE_FONT_OPTIONS,
  CG_SUBTITLE_FONT_VH,
  CG_SUBTITLE_SHOW_FONT_VH,
  CG_TEXT_GRADIENT_ANGLE,
  CG_TEXT_WEIGHT_BOLD,
  CG_TEXT_WEIGHT_MEDIUM,
  CG_TEXT_WEIGHT_REGULAR,
  CgTextWeight,
  CgAnchor,
  CgElementDef,
  CgElementType,
  CgLayerLook,
  CgLayoutUnit,
  CgOutputKind,
  CgPackageEditMode,
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
  CgOutputState,
  CgOutputStateCue,
  CgOverlayCueMessage,
  CgPackage,
  CgPublicOutput,
  CgSubtitleAlign,
  CgSubtitleStyle,
  CgTextPaint,
} from './cg.model';

/** Which side of the 3x3 grid an Anchor sits on, per axis. */
export type CgAnchorSideX = 'left' | 'center' | 'right';
export type CgAnchorSideY = 'top' | 'center' | 'bottom';

export function anchorSideX(anchor: CgAnchor): CgAnchorSideX {
  switch (anchor) {
    case CgAnchor.TopLeft:
    case CgAnchor.CenterLeft:
    case CgAnchor.BottomLeft:
      return 'left';
    case CgAnchor.TopRight:
    case CgAnchor.CenterRight:
    case CgAnchor.BottomRight:
      return 'right';
    default:
      return 'center';
  }
}

export function anchorSideY(anchor: CgAnchor): CgAnchorSideY {
  switch (anchor) {
    case CgAnchor.TopLeft:
    case CgAnchor.TopCenter:
    case CgAnchor.TopRight:
      return 'top';
    case CgAnchor.BottomLeft:
    case CgAnchor.BottomCenter:
    case CgAnchor.BottomRight:
      return 'bottom';
    default:
      return 'center';
  }
}

/**
 * On a centre axis the item is centred and X / Y is ignored.
 * Shared by CSS and the desk so the two never disagree.
 */
export function anchorIgnoresAxis(anchor: CgAnchor): { x: boolean; y: boolean } {
  return {
    x: anchorSideX(anchor) === 'center',
    y: anchorSideY(anchor) === 'center',
  };
}

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
    name: '',
    layout: { ...DEFAULT_LOGO_LAYOUT },
    payload: emptyLogoPayload(CG_SAMPLE_LOGO_URL),
    visible: true,
    look: CgLayerLook.Color,
    sort_order: sortOrder,
    status: RecordStatus.Active,
  };
}

export function createEmptySubtitleLayer(sortOrder: number): CgLayerDraft {
  return {
    clientId: `temp-${crypto.randomUUID()}`,
    element_type: CgElementType.Subtitle,
    public_token: createCgPublicToken(),
    name: '',
    layout: { ...DEFAULT_SUBTITLE_LAYOUT },
    payload: emptySubtitlePayload([...CG_SAMPLE_SUBTITLE_LINES], 0, undefined, {
      preset: CgSubtitlePreset.News,
      textAlign: 'center',
    }),
    visible: true,
    look: CgLayerLook.Color,
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
    style: normalizeSubtitleStyle(style),
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

/** Tile / title: custom name if set, else Element label (Logo, Subtitle…). */
export function layerDisplayName(
  layer: Pick<CgLayerDraft, 'name' | 'element_type'>,
): string {
  const custom = layer.name?.trim();
  return custom || elementLabel(layer.element_type);
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
  if (raw === CgLayerLook.Mono) return CgLayerLook.Mono;
  // Legacy `inherit` and anything else → Color. Package Look is the master
  // bus (Package B&W greys every Layer); Layer only picks Color vs B&W.
  return CgLayerLook.Color;
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
  if (raw === CgSubtitlePreset.Show) return CgSubtitlePreset.Show;
  if (raw === CgSubtitlePreset.Custom) return CgSubtitlePreset.Custom;
  return CgSubtitlePreset.News;
}

export function normalizeSubtitleStyle(raw: unknown): CgSubtitleStyle {
  const value = asRecord(raw);
  const preset = normalizeSubtitlePreset(value['preset']);
  const style: CgSubtitleStyle = { preset };

  const fontFamily = asString(value['fontFamily']);
  if (fontFamily) style.fontFamily = fontFamily;

  const fontSize = toOptionalNumber(value['fontSize']);
  if (fontSize != null && fontSize > 0) style.fontSize = fontSize;

  const scaleY = toOptionalNumber(value['scaleY']);
  if (scaleY != null && scaleY > 0) style.scaleY = scaleY;

  const scaleX = toOptionalNumber(value['scaleX']);
  if (scaleX != null && scaleX > 0) style.scaleX = scaleX;

  const color = asString(value['color']);
  if (color) style.color = color;

  const borderWidth = toOptionalNumber(value['borderWidth']);
  if (borderWidth != null && borderWidth >= 0) style.borderWidth = borderWidth;

  const borderColor = asString(value['borderColor']);
  if (borderColor) style.borderColor = borderColor;

  const shadowAngle = toOptionalNumber(value['shadowAngle']);
  if (shadowAngle != null) style.shadowAngle = shadowAngle;

  const shadowDistance = toOptionalNumber(value['shadowDistance']);
  if (shadowDistance != null && shadowDistance >= 0) style.shadowDistance = shadowDistance;

  const shadowRadius = toOptionalNumber(value['shadowRadius']);
  if (shadowRadius != null && shadowRadius >= 0) style.shadowRadius = shadowRadius;

  const shadowColor = asString(value['shadowColor']);
  if (shadowColor) style.shadowColor = shadowColor;

  const letterSpacing = toOptionalNumber(value['letterSpacing']);
  if (letterSpacing != null) style.letterSpacing = letterSpacing;

  const lineHeight = toOptionalNumber(value['lineHeight']);
  if (lineHeight != null && lineHeight > 0) style.lineHeight = lineHeight;

  const textAlign = asString(value['textAlign']);
  if (textAlign === 'left' || textAlign === 'center' || textAlign === 'right') {
    style.textAlign = textAlign;
  }

  const fontWeight = asTextWeight(value['fontWeight']);
  if (fontWeight != null) style.fontWeight = fontWeight;
  if (value['italic'] === true) style.italic = true;
  if (value['underline'] === true) style.underline = true;
  if (value['strike'] === true) style.strike = true;

  const gradientTo = asString(value['gradientTo']);
  if (gradientTo) style.gradientTo = gradientTo;
  const gradientAngle = toOptionalNumber(value['gradientAngle']);
  if (gradientAngle != null) style.gradientAngle = gradientAngle;

  return style;
}

export function subtitlePresetOf(payload: CgLayerPayload): CgSubtitlePreset {
  return normalizeSubtitlePreset(payload.style?.preset);
}

export function subtitleStyleOf(payload: CgLayerPayload): CgSubtitleStyle {
  return normalizeSubtitleStyle(payload.style);
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
    const imageUrl = raw.imageUrl.trim();
    // Drop leftover data: URLs so a later Save cannot re-embed them.
    // Overlay polls this row forever; bytes belong in Storage, not payload.
    if (isEmbeddedImageUrl(imageUrl)) {
      return emptyLogoPayload();
    }
    const fileName =
      'fileName' in raw && typeof raw.fileName === 'string'
        ? raw.fileName.trim()
        : '';
    return emptyLogoPayload(imageUrl, fileName || undefined);
  }
  return emptyLogoPayload();
}

export function normalizeSubtitlePayload(raw: unknown): CgLayerPayload {
  const value = asRecord(raw);
  const fromLines = Array.isArray(value['lines'])
    ? value['lines']
        .filter((line): line is string => typeof line === 'string')
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
    : [];
  // Stored `lines` already one cue per element (a cue may contain `\n`).
  // Do not re-parse — that would split dual-line SRT cues and desync index.
  const lines =
    fromLines.length > 0
      ? fromLines
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
  return emptySubtitlePayload(
    lines,
    index,
    cursorSource,
    normalizeSubtitleStyle(styleRaw),
    transitionRaw['duration_ms'],
  );
}

export function layerToDraft(layer: CgLayer): CgLayerDraft {
  return {
    clientId: layer.tb_tyapp_cgly_id,
    tb_tyapp_cgly_id: layer.tb_tyapp_cgly_id,
    element_type: layer.element_type,
    public_token: layer.public_token,
    name: layer.name,
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
    name: asString(value['name']),
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
    rev: asString(value['rev']) || undefined,
  };
}

/** Safety-poll state: content `rev` + each Layer's cue. `null` = unusable. */
export function normalizeOutputState(raw: unknown): CgOutputState | null {
  const value = asRecord(raw);
  const rev = asString(value['rev']);
  if (!rev) return null;
  const cuesRaw = value['cues'];
  const cues: CgOutputStateCue[] = [];
  if (Array.isArray(cuesRaw)) {
    for (const row of cuesRaw) {
      const cue = asRecord(row);
      const id = asString(cue['id']);
      const cursor = cue['cursor'];
      const index = cue['index'];
      // Logo Layers have no cue — only subtitle rows carry a numeric cursor.
      if (!id || typeof cursor !== 'number' || !Number.isFinite(cursor)) {
        continue;
      }
      if (index !== null && (typeof index !== 'number' || !Number.isFinite(index))) {
        continue;
      }
      cues.push({ id, index, cursor });
    }
  }
  return { rev, cues };
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

/**
 * What OBS can actually see of a Layer's content: layout, look and payload
 * without the live cue (`index` / `cursor`) and `fileName`. `name` is not part
 * of it. Equal signatures mean a re-publish would change nothing on air.
 */
export function layerContentSignature(
  layer: Pick<CgLayerDraft, 'element_type' | 'layout' | 'look' | 'payload'>,
): string {
  const payload: Record<string, unknown> = {
    ...normalizeLayerPayload(layer.element_type, layer.payload),
  };
  delete payload['index'];
  delete payload['cursor'];
  delete payload['fileName'];
  return JSON.stringify({
    layout: layer.layout,
    look: normalizeLayerLook(layer.look),
    payload,
  });
}

/**
 * Shared 9-grid placement for every Element (Logo, Subtitle, future ones).
 * Anchor picks a cell of the Stage; X / Y are insets from that cell's edge
 * (Top right + X=5 Y=5 → 5 from the right, 5 from the top). On a centre axis the
 * item is centred and X / Y is ignored (see `anchorIgnoresAxis`).
 *
 * `scaleAsTransform` adds `scale(layout.scale)` (Logo). Subtitle uses Scale as
 * type size instead.
 */
export function anchoredBoxCss(
  layout: CgLayout,
  options: { scaleAsTransform: boolean; defaultWidth?: number },
): Record<string, string> {
  const len = (value: number): string => logoLength(value, layout.unit);
  const x = Number.isFinite(layout.x) ? layout.x : 0;
  const y = Number.isFinite(layout.y) ? layout.y : 0;
  const scale = Number.isFinite(layout.scale) ? layout.scale : 1;
  const anchor = layout.anchor;
  const sideX = anchorSideX(anchor);
  const sideY = anchorSideY(anchor);
  const css: Record<string, string> = {
    position: 'absolute',
    transformOrigin: ANCHOR_ORIGIN[anchor],
  };

  // Always set both edges so ngStyle does not keep a stale left/right/top/bottom.
  if (sideX === 'right') {
    css['right'] = len(x);
    css['left'] = 'auto';
  } else if (sideX === 'center') {
    css['left'] = '50%';
    css['right'] = 'auto';
  } else {
    css['left'] = len(x);
    css['right'] = 'auto';
  }

  if (sideY === 'bottom') {
    css['bottom'] = len(y);
    css['top'] = 'auto';
  } else if (sideY === 'center') {
    css['top'] = '50%';
    css['bottom'] = 'auto';
  } else {
    css['top'] = len(y);
    css['bottom'] = 'auto';
  }

  const shiftX = sideX === 'center' ? '-50%' : '0';
  const shiftY = sideY === 'center' ? '-50%' : '0';
  const shift =
    shiftX === '0' && shiftY === '0'
      ? ''
      : `translate(${shiftX}, ${shiftY})`;
  const scaleCss = options.scaleAsTransform ? `scale(${scale})` : '';
  css['transform'] = [shift, scaleCss].filter(Boolean).join(' ') || 'none';

  if (layout.width != null && Number.isFinite(layout.width)) {
    css['width'] = len(layout.width);
  } else if (options.defaultWidth != null) {
    css['width'] = `${options.defaultWidth}%`;
  }
  if (layout.height != null && Number.isFinite(layout.height)) {
    css['height'] = len(layout.height);
  }
  return css;
}

/** Logo Place: shared 9-grid placement; Scale is a CSS transform. */
export function logoLayoutToCss(layout: CgLayout): Record<string, string> {
  return anchoredBoxCss(layout, { scaleAsTransform: true });
}

/**
 * Logo length. `px` is authored on a 1920 wide canvas and rendered as a share
 * of the Stage width (`--cg-u` = 1% of Stage width), so tile / desk / OBS stay
 * proportional. `percent` is used as is.
 */
export function logoLength(value: number, unit: CgLayoutUnit): string {
  if (unit !== CgLayoutUnit.Pixel) return `${value}%`;
  const share = Math.round((value / CG_STAGE_REFERENCE_WIDTH_PX) * 100 * 10000) / 10000;
  return `calc(${share} * var(--cg-u, 1vw))`;
}

/** Subtitle Scale is type size, not a CSS transform of the caption box. */
export function subtitleLayoutToCss(
  layout: CgLayout,
  styleOrPreset: CgSubtitleStyle | CgSubtitlePreset = CgSubtitlePreset.News,
): Record<string, string> {
  const css = anchoredBoxCss(layout, { scaleAsTransform: false });
  const style: CgSubtitleStyle =
    typeof styleOrPreset === 'string'
      ? { preset: normalizeSubtitlePreset(styleOrPreset) }
      : normalizeSubtitleStyle(styleOrPreset);
  const isShow = style.preset === CgSubtitlePreset.Show;

  const baseFont =
    style.fontSize != null && style.fontSize > 0
      ? style.fontSize
      : isShow
        ? CG_SUBTITLE_SHOW_FONT_VH
        : CG_SUBTITLE_FONT_VH;
  const scale = Number.isFinite(layout.scale) ? layout.scale : 1;
  css['--cg-sub-font'] = String(baseFont * scale);

  // Anchor + X / Y give the Anchor point. Alignment says which part of the
  // shrink-to-fit caption box sits on that point horizontally: left edge,
  // centre or right edge. Vertical placement stays with Anchor. The box is not
  // clamped to the Stage, so it may overflow on purpose.
  const anchor = layout.anchor || CgAnchor.BottomCenter;
  const sideX = anchorSideX(anchor);
  const sideY = anchorSideY(anchor);
  const isTop = sideY === 'top';
  const isCenterY = sideY === 'center';
  const textAlign = resolveSubtitleAlign(style, anchor);

  const x = Number.isFinite(layout.x) ? layout.x : 0;
  const insetX = logoLength(x, layout.unit);
  const pointX =
    sideX === 'center'
      ? '50%'
      : sideX === 'right'
        ? `calc(100% - ${insetX})`
        : insetX;
  const shiftX =
    textAlign === 'left' ? '0' : textAlign === 'center' ? '-50%' : '-100%';
  const shiftY = isCenterY ? '-50%' : '0';

  css['left'] = pointX;
  css['right'] = 'auto';
  css['width'] = 'max-content';
  css['maxWidth'] = '100%';
  css['transform'] =
    shiftX === '0' && shiftY === '0'
      ? 'none'
      : `translate(${shiftX}, ${shiftY})`;

  const boxAlign = isTop ? 'flex-start' : isCenterY ? 'center' : 'flex-end';
  const originY = isTop ? 'top' : isCenterY ? 'center' : 'bottom';

  css['--cg-sub-box-align'] = boxAlign;
  css['--cg-sub-text-align'] = textAlign;
  css['--cg-sub-transform-origin'] = `${textAlign} ${originY}`;

  // The fading-out cue stays pinned to the same edge as the incoming one.
  const outShiftX = textAlign === 'center' ? '-50%' : '0';
  css['--cg-sub-outgoing-left'] =
    textAlign === 'left' ? '0' : textAlign === 'center' ? '50%' : 'auto';
  css['--cg-sub-outgoing-right'] = textAlign === 'right' ? '0' : 'auto';
  if (isTop) {
    css['--cg-sub-outgoing-top'] = '0';
    css['--cg-sub-outgoing-bottom'] = 'auto';
    css['--cg-sub-outgoing-transform'] =
      outShiftX === '0' ? 'none' : `translateX(${outShiftX})`;
  } else if (isCenterY) {
    css['--cg-sub-outgoing-top'] = '50%';
    css['--cg-sub-outgoing-bottom'] = 'auto';
    css['--cg-sub-outgoing-transform'] = `translate(${outShiftX}, -50%)`;
  } else {
    css['--cg-sub-outgoing-top'] = 'auto';
    css['--cg-sub-outgoing-bottom'] = '0';
    css['--cg-sub-outgoing-transform'] =
      outShiftX === '0' ? 'none' : `translateX(${outShiftX})`;
  }

  const color = style.color || (isShow ? '#fff6d8' : '#ffffff');
  const defaultLetterSpacing = isShow ? 0.06 : 0.104;
  Object.assign(
    css,
    textPaintToCss({
      ...style,
      color,
      scaleX: style.scaleX ?? 1,
      scaleY: style.scaleY ?? (isShow ? 1 : 1.11),
      letterSpacing:
        style.letterSpacing != null ? style.letterSpacing : defaultLetterSpacing,
      lineHeight: style.lineHeight != null ? style.lineHeight : 1.15,
      borderWidth: style.borderWidth ?? (isShow ? 0.16 : 0.12),
      borderColor: style.borderColor || '#000000',
      shadowDistance: style.shadowDistance ?? (isShow ? 2 : 0),
      shadowRadius: style.shadowRadius ?? 2,
      shadowColor: style.shadowColor || 'rgba(0, 0, 0, 0.8)',
      shadowAngle: style.shadowAngle ?? 135,
    }),
  );

  return css;
}

/** Text alignment inside the Subtitle box; falls back to Anchor's side. */
export function resolveSubtitleAlign(
  style: CgSubtitleStyle,
  anchor: CgAnchor,
): CgSubtitleAlign {
  return style.textAlign ?? anchorSideX(anchor);
}

export function cgOutputChannelName(token: string): string {
  return `${CG_OVERLAY_CHANNEL_PREFIX}${token}`;
}

export function isOverlayCueMessage(raw: unknown): raw is CgOverlayCueMessage {
  const value = asRecord(raw);
  const index = value['index'];
  const cursor = value['cursor'];
  const seq = value['seq'];
  const layerId = value['layerId'];
  return (
    value['kind'] === CG_OVERLAY_CUE_KIND &&
    typeof layerId === 'string' &&
    layerId.length > 0 &&
    typeof seq === 'number' &&
    Number.isFinite(seq) &&
    typeof cursor === 'number' &&
    Number.isFinite(cursor) &&
    (index === null || (typeof index === 'number' && Number.isFinite(index)))
  );
}

/** First family name from a CSS font-family stack (for document.fonts.load). */
export function primaryFontFamily(stack: string | undefined): string {
  if (!stack) return '';
  const first = stack.split(',')[0]?.trim() ?? '';
  return first.replace(/^['"]+|['"]+$/g, '');
}

/**
 * Latin faces use the full 字距. CJK faces (including DFHei) keep English and
 * digits at 0.4× so CJK tracking does not blow the Latin runs apart.
 */
export function isLatinFontStack(stack: string | undefined): boolean {
  const name = primaryFontFamily(stack).toLowerCase();
  if (!name) return false;
  if (CG_LATIN_FONT_ALIASES.some((alias) => alias.toLowerCase() === name)) {
    return true;
  }
  return CG_SUBTITLE_FONT_OPTIONS.some(
    (font) =>
      font.latin === true &&
      primaryFontFamily(font.value).toLowerCase() === name,
  );
}

/** CSS variables for fill, stroke, shadow, and Latin tracking. Layout stays separate. */
export function textPaintToCss(paint: CgTextPaint): Record<string, string> {
  const css: Record<string, string> = {};

  if (paint.fontFamily) {
    css['--cg-sub-font-family'] = paint.fontFamily;
  }
  if (paint.fontWeight != null) {
    css['--cg-sub-font-weight'] = String(paint.fontWeight);
  }
  if (paint.italic) {
    css['--cg-sub-font-style'] = 'italic';
  }
  const decoration = textDecorationLine(paint);
  if (decoration) {
    css['--cg-sub-decoration'] = decoration;
  }
  if (paint.color) {
    css['--cg-sub-color'] = paint.color;
  }
  if (paint.gradientTo) {
    const from = paint.color || '#ffffff';
    const angle =
      paint.gradientAngle != null && Number.isFinite(paint.gradientAngle)
        ? paint.gradientAngle
        : CG_TEXT_GRADIENT_ANGLE;
    css['--cg-sub-fill-image'] =
      `linear-gradient(${angle}deg, ${from}, ${paint.gradientTo})`;
  }
  css['--cg-sub-latin-track'] = isLatinFontStack(paint.fontFamily) ? '1' : '0.4';

  if (paint.letterSpacing != null) {
    css['--cg-sub-letter-spacing'] = `${paint.letterSpacing}em`;
  }
  if (paint.lineHeight != null) {
    css['--cg-sub-line-height'] = String(paint.lineHeight);
  }
  if (paint.scaleX != null) {
    css['--cg-sub-scale-x'] = String(paint.scaleX);
  }
  if (paint.scaleY != null) {
    css['--cg-sub-scale-y'] = String(paint.scaleY);
  }
  if (paint.borderWidth != null) {
    css['--cg-sub-stroke-width'] = `${paint.borderWidth}em`;
  }
  if (paint.borderColor) {
    css['--cg-sub-stroke-color'] = paint.borderColor;
  }

  const shadowDist = paint.shadowDistance;
  const shadowCol = paint.shadowColor;
  if (
    shadowDist != null &&
    shadowDist > 0 &&
    shadowCol &&
    shadowCol !== 'transparent'
  ) {
    const shadowAngle = paint.shadowAngle ?? 135;
    const shadowRad = paint.shadowRadius ?? 0;
    const rad = (shadowAngle * Math.PI) / 180;
    const dx = Math.round(Math.cos(rad) * shadowDist * 10) / 10;
    const dy = Math.round(Math.sin(rad) * shadowDist * 10) / 10;
    css['--cg-sub-filter'] =
      `drop-shadow(${dx}px ${dy}px ${shadowRad}px ${shadowCol})`;
  } else if (shadowDist === 0) {
    css['--cg-sub-filter'] = 'none';
  }

  return css;
}

function textDecorationLine(paint: CgTextPaint): string {
  const lines: string[] = [];
  if (paint.underline) lines.push('underline');
  if (paint.strike) lines.push('line-through');
  return lines.join(' ');
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

export function readPackageEditMode(packageId: string | null): CgPackageEditMode {
  if (!packageId || typeof localStorage === 'undefined') {
    return CG_DEFAULT_PACKAGE_EDIT_MODE;
  }
  try {
    const raw = localStorage.getItem(`${CG_EDIT_MODE_STORAGE_PREFIX}${packageId}`);
    if (raw === CgPackageEditMode.Direct || raw === CgPackageEditMode.Studio) {
      return raw;
    }
  } catch {
    /* private mode / quota */
  }
  return CG_DEFAULT_PACKAGE_EDIT_MODE;
}

export function writePackageEditMode(
  packageId: string | null,
  mode: CgPackageEditMode,
): void {
  if (!packageId || typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(`${CG_EDIT_MODE_STORAGE_PREFIX}${packageId}`, mode);
  } catch {
    /* private mode / quota */
  }
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

export function setCgDesktopViewport(doc: Document, lock: boolean): void {
  const metas = doc.getElementsByTagName('meta');
  for (let i = 0; i < metas.length; i++) {
    const meta = metas.item(i);
    if (meta?.getAttribute('name') === 'viewport') {
      meta.setAttribute(
        'content',
        lock ? CG_DESKTOP_VIEWPORT : CG_PAGE_VIEWPORT,
      );
      return;
    }
  }
}

/** Jaxfr CG admin (`/cg`, `/cg/list`, Panel, Layer desk). Not overlay `/cg-live`. */
export function isCgAdminPath(path: string): boolean {
  return path === '/cg' || path.startsWith('/cg/');
}

/** Panel / Layer desk only — list keeps the normal AppToolbar. */
export function isCgPanelPath(path: string): boolean {
  return (
    path === '/cg/new' ||
    path.startsWith('/cg/new/') ||
    path.startsWith('/cg/edit/')
  );
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

function asTextWeight(raw: unknown): CgTextWeight | null {
  const value = toOptionalNumber(raw);
  if (
    value === CG_TEXT_WEIGHT_REGULAR ||
    value === CG_TEXT_WEIGHT_MEDIUM ||
    value === CG_TEXT_WEIGHT_BOLD
  ) {
    return value;
  }
  return null;
}

function isAnchor(raw: unknown): raw is CgAnchor {
  return Object.values(CgAnchor).includes(raw as CgAnchor);
}
