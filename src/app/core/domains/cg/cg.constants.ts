export enum CgPackageRole {
  Channel = 'channel',
  Source = 'source',
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
    description: 'News feed line',
    shipped: false,
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

export const CG_OVERLAY_POLL_MS = 2000;

export const CG_VISIBLE_FADE_MS = 400;

export const DEFAULT_LOGO_LAYOUT = {
  x: 2.4,
  y: 3.2,
  unit: CgLayoutUnit.Percent,
  anchor: CgAnchor.TopLeft,
  scale: 1,
  width: 11,
} as const;

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

export const CG_LOGO_ACCEPT = 'image/png,image/webp';

export const CG_LOGO_MAX_BYTES = 1_500_000;
