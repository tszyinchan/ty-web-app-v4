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
    shipped: true,
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
    description: 'Vertical breaking news',
    shipped: true,
  },
  {
    type: CgElementType.Ticker,
    label: 'Ticker',
    description: 'Scrolling news bar',
    shipped: true,
  },
  {
    type: CgElementType.Weather,
    label: 'Weather',
    description: 'Temperature bug',
    shipped: true,
  },
];

/** Realtime broadcast topic is `cg-output:{public_token}` — same secret as `/o/:token`. */
export const CG_OVERLAY_CHANNEL_PREFIX = 'cg-output:';
export const CG_OVERLAY_BROADCAST_EVENT = 'sync';
/** Small live-cue payload on the same broadcast event (not a full output snapshot). */
export const CG_OVERLAY_CUE_KIND = 'cue';
/**
 * If Realtime drops a packet, overlay catches up. Not the live cue path.
 * Each tick calls the tiny `tyapp_cg_get_output_state_by_token` (content
 * `rev` + stored cues) and only downloads the full output when `rev` changed.
 */
export const CG_OVERLAY_SAFETY_POLL_MS = 30_000;
/** Overlay announces itself on its channel so the Panel can skip Layer tokens nobody watches. */
export const CG_OVERLAY_PRESENCE_ROLE = 'overlay';
/** Max wait for the first Presence sync before the Panel assumes someone is listening. */
export const CG_PRESENCE_SYNC_WAIT_MS = 1_500;
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
/** Mouse wheel never goes below this; use Cut for 0 (the ms field hides on Cut). */
export const CG_WHEEL_MIN_FADE_MS = 50;

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
} as const;

/** Scale 1 type size: percent of Stage / OBS viewport height (ffmpeg FontSize 16.1 on PlayRes 288). */
export const CG_SUBTITLE_FONT_VH = 5.6;
export const CG_SUBTITLE_SHOW_FONT_VH = 7.2;

export const CG_TEXT_WEIGHT_REGULAR = 400 as const;
export const CG_TEXT_WEIGHT_MEDIUM = 500 as const;
export const CG_TEXT_WEIGHT_BOLD = 700 as const;

export type CgTextWeight =
  | typeof CG_TEXT_WEIGHT_REGULAR
  | typeof CG_TEXT_WEIGHT_MEDIUM
  | typeof CG_TEXT_WEIGHT_BOLD;

/** Default second stop when Gradient is turned on. `90` is left to right. */
export const CG_TEXT_GRADIENT_TO = '#7ec8ff';
export const CG_TEXT_GRADIENT_ANGLE = 90;

/**
 * Fallback family names that are Latin even when they are not the first name
 * in a dropdown stack (Segoe UI / Impact fall back to these).
 */
export const CG_LATIN_FONT_ALIASES: readonly string[] = [
  'Arial',
  'Arial Narrow',
  'Arial Black',
];

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
  /** Latin face: English and digits use the full 字距. Absent = CJK tracking (×0.4). */
  latin?: boolean;
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
    latin: true,
  },
  {
    value: "'Bebas Neue', Impact, sans-serif",
    label: 'Bebas Neue',
    group: 'web',
    latin: true,
  },
  {
    value: "'Inter', 'Segoe UI', sans-serif",
    label: 'Inter',
    group: 'web',
    latin: true,
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
    latin: true,
  },
  {
    value: "'Roboto', Arial, sans-serif",
    label: 'Roboto',
    group: 'installed',
    latin: true,
  },
  {
    value: "'Impact', 'Arial Black', sans-serif",
    label: 'Impact (粗標題)',
    group: 'installed',
    latin: true,
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

/** Clock and Weather text box. Top right matches a typical bug. */
export const DEFAULT_CLOCK_LAYOUT = {
  x: 3,
  y: 3,
  unit: CgLayoutUnit.Percent,
  anchor: CgAnchor.TopRight,
  scale: 1,
} as const;

export const DEFAULT_WEATHER_LAYOUT = {
  x: 3,
  y: 8,
  unit: CgLayoutUnit.Percent,
  anchor: CgAnchor.TopRight,
  scale: 1,
} as const;

export const DEFAULT_BUG_BACKGROUND_LAYOUT = {
  x: 2,
  y: 2,
  unit: CgLayoutUnit.Percent,
  anchor: CgAnchor.TopRight,
  scale: 1,
} as const;

/** Default type size for Clock / Weather (vh). */
export const CG_BUG_FONT_VH = 3.5;

/**
 * Breaking counts every code point as 1 (CJK, letters, digits, spaces).
 * A line over the max is rejected. The warn threshold still saves, but the
 * auto-fit size will be small inside the fixed-height bar.
 */
export const CG_BREAKING_MAX_CHARS = 24;
export const CG_BREAKING_WARN_CHARS = 20;
export const CG_BREAKING_SECONDS_DEFAULT = 8;
export const CG_BREAKING_SECONDS_MIN = 2;
export const CG_BREAKING_SECONDS_MAX = 60;
/** Fixed text-box height, percent of Stage height. */
export const CG_BREAKING_HEIGHT_DEFAULT = 54;

/** Default type size for Breaking / Ticker (vh). Breaking may auto-fit smaller. */
export const CG_NEWS_FONT_VH = 3.2;

/** Ticker speed is a percent of Stage width per second. */
export const CG_TICKER_SPEED_DEFAULT = 6;
export const CG_TICKER_SPEED_MIN = 1;
export const CG_TICKER_SPEED_MAX = 40;
/** Gap between ticker items, in em. */
export const CG_TICKER_GAP_DEFAULT = 4;
export const CG_TICKER_GAP_MIN = 0;
export const CG_TICKER_GAP_MAX = 12;
/** Fade width as a percent of the ticker text window. */
export const CG_TICKER_FADE_WIDTH_DEFAULT = 8;
export const CG_TICKER_FADE_WIDTH_MIN = 0;
export const CG_TICKER_FADE_WIDTH_MAX = 40;
export const CG_TICKER_WIDTH_DEFAULT = 100;
export const CG_TICKER_HEIGHT_DEFAULT = 8;

export const CG_NEWS_INSERT_OPTIONS: ReadonlyArray<{
  value: 'top' | 'after' | 'bottom';
  label: string;
}> = [
  { value: 'top', label: 'Top' },
  { value: 'after', label: 'After selected' },
  { value: 'bottom', label: 'Bottom' },
];

export const CG_SAMPLE_BREAKING_LINES: readonly string[] = [
  '突發新聞測試',
  '第二則直排',
];

export const CG_SAMPLE_TICKER_LINES: readonly string[] = [
  '這是第一則跑馬新聞',
  '第二則從右邊接著進來',
];

/** Vertical breaking bar. Height is the fixed text box; width shrinks to the glyphs. */
export const DEFAULT_BREAKING_LAYOUT = {
  x: 2,
  y: 8,
  unit: CgLayoutUnit.Percent,
  anchor: CgAnchor.TopLeft,
  scale: 1,
  height: CG_BREAKING_HEIGHT_DEFAULT,
} as const;

/** Full-width crawl along the bottom. Width is the visible window. */
export const DEFAULT_TICKER_LAYOUT = {
  x: 0,
  y: 0,
  unit: CgLayoutUnit.Percent,
  anchor: CgAnchor.BottomCenter,
  scale: 1,
  width: CG_TICKER_WIDTH_DEFAULT,
  height: CG_TICKER_HEIGHT_DEFAULT,
} as const;

export const DEFAULT_BREAKING_BACKGROUND_LAYOUT = {
  x: 1,
  y: 4,
  unit: CgLayoutUnit.Percent,
  anchor: CgAnchor.TopLeft,
  scale: 1,
} as const;

export const DEFAULT_TICKER_BACKGROUND_LAYOUT = {
  x: 0,
  y: 0,
  unit: CgLayoutUnit.Percent,
  anchor: CgAnchor.BottomCenter,
  scale: 1,
  width: CG_TICKER_WIDTH_DEFAULT,
} as const;

export const CG_CLOCK_FORMAT_CUSTOM = '__custom__';

export interface CgClockFormatOption {
  value: string;
  label: string;
}

/** Predefined DatePipe names plus patterns. Chinese literals pass through the pattern. */
export const CG_CLOCK_FORMAT_OPTIONS: ReadonlyArray<CgClockFormatOption> = [
  { value: 'HH:mm:ss', label: 'HH:mm:ss' },
  { value: 'HH:mm', label: 'HH:mm' },
  { value: 'hh:mm:ss a', label: 'hh:mm:ss AM/PM' },
  { value: 'hh:mm a', label: 'hh:mm AM/PM' },
  { value: 'yyyy-MM-dd HH:mm:ss', label: 'YYYY-MM-DD HH:mm:ss' },
  { value: 'yyyy-MM-dd HH:mm', label: 'YYYY-MM-DD HH:mm' },
  { value: 'yyyy-MM-dd', label: 'YYYY-MM-DD' },
  { value: 'y年M月d日', label: '年月日' },
  { value: 'y年M月d日 HH:mm:ss', label: '年月日 HH:mm:ss' },
  { value: 'y年M月d日 EEEE HH:mm', label: '年月日 星期 HH:mm' },
  { value: 'short', label: 'short' },
  { value: 'medium', label: 'medium' },
  { value: 'long', label: 'long' },
  { value: 'full', label: 'full' },
  { value: 'shortDate', label: 'shortDate' },
  { value: 'mediumDate', label: 'mediumDate' },
  { value: 'longDate', label: 'longDate' },
  { value: 'fullDate', label: 'fullDate' },
  { value: 'shortTime', label: 'shortTime' },
  { value: 'mediumTime', label: 'mediumTime' },
  { value: 'longTime', label: 'longTime' },
  { value: 'fullTime', label: 'fullTime' },
];

export const CG_CLOCK_LOCALE_OPTIONS: ReadonlyArray<{
  value: 'en' | 'zh-Hant';
  label: string;
}> = [
  { value: 'zh-Hant', label: '繁體中文' },
  { value: 'en', label: 'English' },
];

export const CG_CLOCK_TIMEZONE_LOCAL = '';

export const CG_CLOCK_TIMEZONE_OPTIONS: ReadonlyArray<{
  value: string;
  label: string;
}> = [
  { value: CG_CLOCK_TIMEZONE_LOCAL, label: 'Local' },
  { value: 'Asia/Hong_Kong', label: 'Hong Kong' },
  { value: 'Asia/Taipei', label: 'Taipei' },
  { value: 'Asia/Tokyo', label: 'Tokyo' },
  { value: 'Asia/Seoul', label: 'Seoul' },
  { value: 'Asia/Singapore', label: 'Singapore' },
  { value: 'Asia/Shanghai', label: 'Shanghai' },
  { value: 'UTC', label: 'UTC' },
  { value: 'Europe/London', label: 'London' },
  { value: 'Europe/Paris', label: 'Paris' },
  { value: 'America/New_York', label: 'New York' },
  { value: 'America/Los_Angeles', label: 'Los Angeles' },
  { value: 'Australia/Sydney', label: 'Sydney' },
];

export const CG_WEATHER_UNIT_OPTIONS: ReadonlyArray<{
  value: 'alternate' | 'c' | 'f';
  label: string;
}> = [
  { value: 'alternate', label: 'C / F each minute' },
  { value: 'c', label: 'Celsius' },
  { value: 'f', label: 'Fahrenheit' },
];

/** Open-Meteo current conditions. Shared by every Stage that shows the same place. */
export const CG_WEATHER_CACHE_MS = 10 * 60 * 1000;
