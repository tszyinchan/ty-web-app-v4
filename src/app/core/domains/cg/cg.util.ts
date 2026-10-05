import { SUBDOMAINS } from '../../../app.constants';
import { RecordStatus } from '../../models/status.enum';
import {
  CG_CUT_DURATION_MS,
  CG_DEFAULT_DURATION_MS,
  CG_DEFAULT_LAYER_EDIT_MODE,
  CG_DEFAULT_PACKAGE_EDIT_MODE,
  CG_DESKTOP_VIEWPORT,
  CG_EDIT_MODE_STORAGE_PREFIX,
  CG_LAYER_STUDIO_STORAGE_PREFIX,
  CG_OVERLAY_CHANNEL_PREFIX,
  CG_ELEMENT_CATALOG,
  CG_MAX_DURATION_MS,
  CG_PAGE_VIEWPORT,
  CG_SAMPLE_LOGO_URL,
  CG_SAMPLE_SUBTITLE_LINES,
  CG_SUBTITLE_FONT_VH,
  CG_SUBTITLE_SHOW_FONT_VH,
  CgAnchor,
  CgElementDef,
  CgElementType,
  CgLayerEditMode,
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
    payload: emptySubtitlePayload([...CG_SAMPLE_SUBTITLE_LINES], 0),
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

/**
 * Logo Place: X/Y are insets from the Anchor edges (not stage top-left).
 * Top right + X=5 Y=5 → 5 from the right, 5 from the top.
 */
export function logoLayoutToCss(layout: CgLayout): Record<string, string> {
  const unit = layout.unit === CgLayoutUnit.Pixel ? 'px' : '%';
  const x = Number.isFinite(layout.x) ? layout.x : 0;
  const y = Number.isFinite(layout.y) ? layout.y : 0;
  const scale = Number.isFinite(layout.scale) ? layout.scale : 1;
  const anchor = layout.anchor;
  const css: Record<string, string> = {
    position: 'absolute',
    transformOrigin: ANCHOR_ORIGIN[anchor],
  };

  const fromRight =
    anchor === CgAnchor.TopRight ||
    anchor === CgAnchor.CenterRight ||
    anchor === CgAnchor.BottomRight;
  const fromBottom =
    anchor === CgAnchor.BottomLeft ||
    anchor === CgAnchor.BottomCenter ||
    anchor === CgAnchor.BottomRight;
  const centerX =
    anchor === CgAnchor.TopCenter ||
    anchor === CgAnchor.Center ||
    anchor === CgAnchor.BottomCenter;
  const centerY =
    anchor === CgAnchor.CenterLeft ||
    anchor === CgAnchor.Center ||
    anchor === CgAnchor.CenterRight;

  // Always set both edges so ngStyle does not keep a stale left/right.
  if (fromRight) {
    css['right'] = `${x}${unit}`;
    css['left'] = 'auto';
  } else if (centerX) {
    css['left'] = `calc(50% + ${x}${unit})`;
    css['right'] = 'auto';
  } else {
    css['left'] = `${x}${unit}`;
    css['right'] = 'auto';
  }

  if (fromBottom) {
    css['bottom'] = `${y}${unit}`;
    css['top'] = 'auto';
  } else if (centerY) {
    css['top'] = `calc(50% + ${y}${unit})`;
    css['bottom'] = 'auto';
  } else {
    css['top'] = `${y}${unit}`;
    css['bottom'] = 'auto';
  }

  const shiftX = centerX ? '-50%' : '0';
  const shiftY = centerY ? '-50%' : '0';
  const shift =
    shiftX === '0' && shiftY === '0'
      ? ''
      : `translate(${shiftX}, ${shiftY})`;
  css['transform'] = shift
    ? `${shift} scale(${scale})`
    : `scale(${scale})`;

  if (layout.width != null && Number.isFinite(layout.width)) {
    css['width'] = `${layout.width}${unit}`;
  }
  if (layout.height != null && Number.isFinite(layout.height)) {
    css['height'] = `${layout.height}${unit}`;
  }
  return css;
}

/** Subtitle Scale is type size, not a CSS transform of the caption box. */
export function subtitleLayoutToCss(
  layout: CgLayout,
  styleOrPreset: CgSubtitleStyle | CgSubtitlePreset = CgSubtitlePreset.News,
): Record<string, string> {
  const css = layoutBoxCss(layout, false);
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

  if (style.fontFamily) {
    css['--cg-sub-font-family'] = style.fontFamily;
  }

  const scaleX = style.scaleX ?? 1.0;
  const scaleY = style.scaleY ?? (isShow ? 1.0 : 1.11);
  css['--cg-sub-scale-x'] = String(scaleX);
  css['--cg-sub-scale-y'] = String(scaleY);

  const color = style.color || (isShow ? '#fff6d8' : '#ffffff');
  css['--cg-sub-color'] = color;

  const borderWidth = style.borderWidth ?? (isShow ? 0.16 : 0.12);
  const borderColor = style.borderColor || '#000000';
  css['--cg-sub-stroke-width'] = `${borderWidth}em`;
  css['--cg-sub-stroke-color'] = borderColor;

  const shadowDist = style.shadowDistance ?? (isShow ? 2 : 0);
  const shadowRad = style.shadowRadius ?? 2;
  const shadowCol = style.shadowColor || 'rgba(0, 0, 0, 0.8)';
  const shadowAngle = style.shadowAngle ?? 135;

  if (shadowDist > 0 && shadowCol && shadowCol !== 'transparent') {
    const rad = (shadowAngle * Math.PI) / 180;
    const dx = Math.round(Math.cos(rad) * shadowDist * 10) / 10;
    const dy = Math.round(Math.sin(rad) * shadowDist * 10) / 10;
    css['--cg-sub-filter'] = `drop-shadow(${dx}px ${dy}px ${shadowRad}px ${shadowCol})`;
  } else {
    css['--cg-sub-filter'] = 'none';
  }

  return css;
}

/** Point-in-frame model (Subtitle): (x,y) is where the Anchor sits on Stage. */
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

export function cgOutputChannelName(token: string): string {
  return `${CG_OVERLAY_CHANNEL_PREFIX}${token}`;
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

/** Stable key for Logo Studio preference — DB id when known, else clientId. */
export function layerStudioStorageKey(layer: {
  tb_tyapp_cgly_id?: string;
  clientId: string;
}): string {
  return layer.tb_tyapp_cgly_id || layer.clientId;
}

export function readLayerEditMode(layerKey: string | null): CgLayerEditMode {
  if (!layerKey || typeof localStorage === 'undefined') {
    return CG_DEFAULT_LAYER_EDIT_MODE;
  }
  try {
    const raw = localStorage.getItem(
      `${CG_LAYER_STUDIO_STORAGE_PREFIX}${layerKey}`,
    );
    if (raw === CgLayerEditMode.Direct || raw === CgLayerEditMode.Studio) {
      return raw;
    }
  } catch {
    /* private mode / quota */
  }
  return CG_DEFAULT_LAYER_EDIT_MODE;
}

export function writeLayerEditMode(
  layerKey: string | null,
  mode: CgLayerEditMode,
): void {
  if (!layerKey || typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(`${CG_LAYER_STUDIO_STORAGE_PREFIX}${layerKey}`, mode);
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

function isAnchor(raw: unknown): raw is CgAnchor {
  return Object.values(CgAnchor).includes(raw as CgAnchor);
}
