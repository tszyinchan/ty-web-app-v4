export enum CgPackageRole {
  Channel = 'channel',
  Source = 'source',
}

export enum CgComponentType {
  Logo = 'logo',
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

export const CG_OVERLAY_POLL_MS = 2000;

export const DEFAULT_LOGO_LAYOUT = {
  x: 2,
  y: 2,
  unit: CgLayoutUnit.Percent,
  anchor: CgAnchor.TopLeft,
  scale: 1,
  width: 12,
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
