export enum CgPackageRole {
  Channel = 'channel',
  Source = 'source',
}

export enum CgPackageLook {
  Color = 'color',
  Mono = 'mono',
}

export enum CgLayerLook {
  Inherit = 'inherit',
  Color = 'color',
  Mono = 'mono',
}

export enum CgSubtitlePreset {
  News = 'news',
  Show = 'show',
  Custom = 'custom',
}

export enum CgElementType {
  Logo = 'logo',
  Clock = 'clock',
  Title = 'title',
  Subtitle = 'subtitle',
  Breaking = 'breaking',
  Ticker = 'ticker',
  Weather = 'weather',
}

export enum CgOutputKind {
  Package = 'package',
  Layer = 'layer',
}

export enum CgLayoutUnit {
  Percent = 'percent',
  Pixel = 'px',
}

export enum CgAnchor {
  TopLeft = 'top-left',
  TopCenter = 'top-center',
  TopRight = 'top-right',
  CenterLeft = 'center-left',
  Center = 'center',
  CenterRight = 'center-right',
  BottomLeft = 'bottom-left',
  BottomCenter = 'bottom-center',
  BottomRight = 'bottom-right',
}

export enum CgPreviewBackdrop {
  Checkerboard = 'checkerboard',
  /** Dark preview plate — not Studio mode (edit mode). */
  Dim = 'dim',
}

/**
 * Package Panel edit mode (OBS Studio Mode idea):
 * - Direct = edit Program live (one On air monitor; auto-save)
 * - Studio = Preview + Program (Pending | On air; Save to air)
 * Not the Alpha/Dim stage backdrop.
 */
export enum CgPackageEditMode {
  Direct = 'direct',
  Studio = 'studio',
}

/** localStorage key prefix — value is per package id. */
export const CG_EDIT_MODE_STORAGE_PREFIX = 'cg-package-edit-mode:';

/** Default for new / unknown packages — safer (Save before air). */
export const CG_DEFAULT_PACKAGE_EDIT_MODE = CgPackageEditMode.Studio;

/**
 * OBS canvas width Logo `px` layouts are authored against. Stage renders
 * them as a share of its own width, so tiles / desk / OBS stay proportional.
 */
export const CG_STAGE_REFERENCE_WIDTH_PX = 1920;

export interface CgElementDef {
  type: CgElementType;
  label: string;
  description: string;
  shipped: boolean;
}

export const CG_ELEMENT_CATALOG: ReadonlyArray<CgElementDef> = [
  {
    type: CgElementType.Logo,
    label: 'Logo',
    description: 'Station or show bug',
    shipped: true,
  },
  {
    type: CgElementType.Clock,
    label: 'Clock',
    description: 'On-air clock',
    shipped: false,
  },
  {
    type: CgElementType.Title,
    label: 'Title',
    description: 'Name tag / lower-third title',
    shipped: false,
  },
  {
    type: CgElementType.Subtitle,
    label: 'Subtitle',
    description: 'Live captions',
    shipped: true,
  },
  {
    type: CgElementType.Breaking,
    label: 'Breaking',
    description: 'Breaking banner',
    shipped: false,
  },
  {
    type: CgElementType.Ticker,
    label: 'Ticker',
    description: 'Crawl / 跑馬',
    shipped: false,
  },
  {
    type: CgElementType.Weather,
    label: 'Weather',
    description: 'Temperature bug',
    shipped: false,
  },
];

/** Realtime broadcast topic is `cg-output:{public_token}` — same secret as `/o/:token`. */
export const CG_OVERLAY_CHANNEL_PREFIX = 'cg-output:';
export const CG_OVERLAY_BROADCAST_EVENT = 'sync';
/** Small live-cue payload on the same broadcast event (not a full output snapshot). */
export const CG_OVERLAY_CUE_KIND = 'cue';
/** If Realtime drops a packet, overlay re-fetches. Not the live cue path. */
export const CG_OVERLAY_SAFETY_POLL_MS = 30_000;
/** Wait at most this long for a web font before showing the next cue. */
export const CG_SUBTITLE_FONT_LOAD_MS = 400;

/** Admin UI is always the desktop 3-pane. Phones/tablets get this layout (pinch-zoom), not a stacked reflow. Overlay `/o` and `/cg-live` stay device-width. */
export const CG_DESKTOP_MIN_WIDTH_PX = 1280;
export const CG_DESKTOP_VIEWPORT = `width=${CG_DESKTOP_MIN_WIDTH_PX}`;
export const CG_PAGE_VIEWPORT = 'width=device-width, initial-scale=1';

/** Package Output: `0` = cut (instant). Default fade is 400ms. */
export const CG_CUT_DURATION_MS = 0;
export const CG_DEFAULT_DURATION_MS = 400;
export const CG_MAX_DURATION_MS = 5000;

/** Logo Place uses inset-from-anchor: X/Y are offsets from the Anchor edges. */
export const DEFAULT_LOGO_LAYOUT = {
  x: 24,
  y: 24,
  unit: CgLayoutUnit.Pixel,
  anchor: CgAnchor.TopLeft,
  scale: 1,
} as const;

/** Same inset model as Logo. Bottom center ignores X; Y is inset from the bottom edge. */
export const DEFAULT_SUBTITLE_LAYOUT = {
  x: 4,
  y: 11,
  unit: CgLayoutUnit.Percent,
  anchor: CgAnchor.BottomCenter,
  scale: 1,
  width: 88,
} as const;

/** Scale 1 type size: percent of Stage / OBS viewport height (ffmpeg FontSize 16.1 on PlayRes 288). */
export const CG_SUBTITLE_FONT_VH = 5.6;
export const CG_SUBTITLE_SHOW_FONT_VH = 7.2;

export const CG_LAYER_LOOK_OPTIONS: ReadonlyArray<{
  value: CgLayerLook;
  label: string;
}> = [
  { value: CgLayerLook.Color, label: 'Color' },
  { value: CgLayerLook.Mono, label: 'B&W' },
];

export type CgSubtitleFontGroup = 'web' | 'installed';

export interface CgSubtitleFontOption {
  value: string;
  label: string;
  group: CgSubtitleFontGroup;
}

export const CG_SUBTITLE_FONT_GROUPS: ReadonlyArray<{
  id: CgSubtitleFontGroup;
  label: string;
}> = [
  { id: 'web', label: 'Web fonts (any computer)' },
  { id: 'installed', label: 'Installed on OBS PC' },
];

export const CG_SUBTITLE_FONT_OPTIONS: ReadonlyArray<CgSubtitleFontOption> = [
  {
    value: "'Noto Sans TC', 'PingFang TC', 'Microsoft JhengHei', sans-serif",
    label: 'Noto Sans TC',
    group: 'web',
  },
  {
    value: "'Noto Serif TC', 'Songti TC', 'PMingLiU', serif",
    label: 'Noto Serif TC',
    group: 'web',
  },
  {
    value: "'LXGW WenKai TC', 'DFKai-SB', serif",
    label: 'LXGW WenKai TC (霞鶩文楷)',
    group: 'web',
  },
  {
    value: "'Huninn', 'Microsoft JhengHei', sans-serif",
    label: 'Huninn (粉圓)',
    group: 'web',
  },
  {
    value: "'Chocolate Classical Sans', 'Microsoft JhengHei', sans-serif",
    label: 'Chocolate Classical Sans',
    group: 'web',
  },
  {
    value: "'Zen Maru Gothic', 'Yu Gothic', sans-serif",
    label: 'Zen Maru Gothic',
    group: 'web',
  },
  {
    value: "'Oswald', 'Arial Narrow', sans-serif",
    label: 'Oswald',
    group: 'web',
  },
  {
    value: "'Bebas Neue', Impact, sans-serif",
    label: 'Bebas Neue',
    group: 'web',
  },
  {
    value: "'Inter', 'Segoe UI', sans-serif",
    label: 'Inter',
    group: 'web',
  },
  {
    value: "'華康中黑體', '華康中黑體(P)', 'DFHei', 'Microsoft JhengHei', 'Segoe UI', sans-serif",
    label: '華康中黑體 (DFHei)',
    group: 'installed',
  },
  {
    value: "'Microsoft JhengHei', 'Segoe UI', sans-serif",
    label: '微軟正黑體 (JhengHei)',
    group: 'installed',
  },
  {
    value: "'PingFang TC', 'PingFang HK', 'Heiti TC', sans-serif",
    label: '蘋方 (PingFang TC)',
    group: 'installed',
  },
  {
    value: "'Microsoft YaHei', 'PingFang SC', sans-serif",
    label: '微軟雅黑 (YaHei)',
    group: 'installed',
  },
  {
    value: "'DFKai-SB', 'BiauKai', 'Kaiti TC', serif",
    label: '標楷體 (BiauKai)',
    group: 'installed',
  },
  {
    value: "'PMingLiU', 'MingLiU', 'Songti TC', serif",
    label: '新細明體 (MingLiU)',
    group: 'installed',
  },
  {
    value: "'華康圓體', 'Yu Gothic', 'PingFang TC', 'Microsoft JhengHei', sans-serif",
    label: '圓體 (Round)',
    group: 'installed',
  },
  {
    value: "'Segoe UI', Arial, sans-serif",
    label: 'Segoe UI / Arial',
    group: 'installed',
  },
  {
    value: "'Roboto', Arial, sans-serif",
    label: 'Roboto',
    group: 'installed',
  },
  {
    value: "'Impact', 'Arial Black', sans-serif",
    label: 'Impact (粗標題)',
    group: 'installed',
  },
];

export const CG_PACKAGE_ROLE_OPTIONS: ReadonlyArray<{
  value: CgPackageRole;
  label: string;
}> = [
  { value: CgPackageRole.Channel, label: 'Channel' },
  { value: CgPackageRole.Source, label: 'Source' },
];

export const CG_ANCHOR_OPTIONS: ReadonlyArray<{
  value: CgAnchor;
  label: string;
}> = [
  { value: CgAnchor.TopLeft, label: 'Top left' },
  { value: CgAnchor.TopCenter, label: 'Top center' },
  { value: CgAnchor.TopRight, label: 'Top right' },
  { value: CgAnchor.CenterLeft, label: 'Center left' },
  { value: CgAnchor.Center, label: 'Center' },
  { value: CgAnchor.CenterRight, label: 'Center right' },
  { value: CgAnchor.BottomLeft, label: 'Bottom left' },
  { value: CgAnchor.BottomCenter, label: 'Bottom center' },
  { value: CgAnchor.BottomRight, label: 'Bottom right' },
];

export const CG_ANCHOR_GRID_OPTIONS: ReadonlyArray<{
  value: CgAnchor;
  label: string;
  icon: string;
}> = [
  { value: CgAnchor.TopLeft, label: 'Top left', icon: 'north_west' },
  { value: CgAnchor.TopCenter, label: 'Top center', icon: 'north' },
  { value: CgAnchor.TopRight, label: 'Top right', icon: 'north_east' },
  { value: CgAnchor.CenterLeft, label: 'Center left', icon: 'west' },
  { value: CgAnchor.Center, label: 'Center', icon: 'fiber_manual_record' },
  { value: CgAnchor.CenterRight, label: 'Center right', icon: 'east' },
  { value: CgAnchor.BottomLeft, label: 'Bottom left', icon: 'south_west' },
  { value: CgAnchor.BottomCenter, label: 'Bottom center', icon: 'south' },
  { value: CgAnchor.BottomRight, label: 'Bottom right', icon: 'south_east' },
];

/** Subtitle text alignment inside its box (independent of Anchor). */
export const CG_SUBTITLE_ALIGN_OPTIONS: ReadonlyArray<{
  value: 'left' | 'center' | 'right';
  label: string;
  icon: string;
}> = [
  { value: 'left', label: 'Align left', icon: 'format_align_left' },
  { value: 'center', label: 'Align center', icon: 'format_align_center' },
  { value: 'right', label: 'Align right', icon: 'format_align_right' },
];

export const CG_LAYOUT_UNIT_OPTIONS: ReadonlyArray<{
  value: CgLayoutUnit;
  label: string;
}> = [
  { value: CgLayoutUnit.Percent, label: '%' },
  { value: CgLayoutUnit.Pixel, label: 'px' },
];

export const CG_SAMPLE_LOGO_URL = '/icons/3d/apps.png';

export const CG_SAMPLE_SUBTITLE_LINES: readonly string[] = [
  'This is the first caption.',
  'Down cues the next sentence.',
  'Blank clears the air.',
];

export const CG_LOGO_ACCEPT = 'image/png,image/webp';

export const CG_LOGO_MAX_BYTES = 1_500_000;

// Public Supabase Storage bucket — Logo images upload here instead of being
// embedded as base64 in `payload.imageUrl`. Overlay used to poll the RPC
// every 300ms with the file inside `payload` (uncached PostgREST egress).
// A Storage URL is a few bytes; the browser caches the image. Overlay now
// listens on Realtime and only re-fetches the RPC on connect / safety poll.
// See supabase/sql/cg-logo-storage.sql.
export const CG_LOGO_BUCKET = 'cg-logo';
