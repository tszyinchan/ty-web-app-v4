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
  Studio = 'studio',
}

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

export const CG_OVERLAY_POLL_MS = 300;

/** Package Output: `0` = cut (instant). Default fade is 400ms. */
export const CG_CUT_DURATION_MS = 0;
export const CG_DEFAULT_DURATION_MS = 400;
export const CG_MAX_DURATION_MS = 5000;

export const DEFAULT_LOGO_LAYOUT = {
  x: 2.4,
  y: 3.2,
  unit: CgLayoutUnit.Percent,
  anchor: CgAnchor.TopLeft,
  scale: 1,
  width: 11,
} as const;

export const DEFAULT_SUBTITLE_LAYOUT = {
  x: 50,
  y: 89,
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
  { value: CgLayerLook.Inherit, label: 'Inherit' },
  { value: CgLayerLook.Color, label: 'Color' },
  { value: CgLayerLook.Mono, label: 'B&W' },
];

export const CG_SUBTITLE_PRESET_OPTIONS: ReadonlyArray<{
  value: CgSubtitlePreset;
  label: string;
}> = [
  { value: CgSubtitlePreset.News, label: 'News' },
  { value: CgSubtitlePreset.Show, label: 'Show' },
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
