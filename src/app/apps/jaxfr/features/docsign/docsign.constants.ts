export const DOCSIGN_BRAND_ICON = '/icons/3d/docsign.png';

export const DOCSIGN_DRIVE_PREVIEW = (fileId: string): string =>
  `https://drive.google.com/file/d/${fileId}/preview`;

export const DOCSIGN_DRIVE_VIEW = (fileId: string): string =>
  `https://drive.google.com/file/d/${fileId}/view`;

export const DOCSIGN_LEASE_STALE_MS = 90_000;
export const DOCSIGN_LEASE_HEARTBEAT_MS = 45_000;

/** A4. Keep in sync with `.docsign-paper` in docsign-document.scss. */
export const DOCSIGN_PAPER_WIDTH_MM = 210;
export const DOCSIGN_PAPER_HEIGHT_MM = 297;
export const DOCSIGN_PAPER_MARGIN_MM = 18;
export const DOCSIGN_CONTENT_HEIGHT_MM =
  DOCSIGN_PAPER_HEIGHT_MM - DOCSIGN_PAPER_MARGIN_MM * 2;
/** Leave a little unused page so Safari / CJK rounding cannot paint past the footer. */
export const DOCSIGN_PAGE_PACK_SLACK_PX = 12;

export const DOCSIGN_NARROW_PX = 1100;

export const DOCSIGN_ZOOM_MIN = 25;
export const DOCSIGN_ZOOM_MAX = 300;
export const DOCSIGN_ZOOM_STEP = 5;
export const DOCSIGN_ZOOM_PRESETS = [25, 50, 75, 100, 125, 150, 200, 300] as const;
export const DOCSIGN_ZOOM_PRESETS_NARROW = [50, 100, 200] as const;
export type DocsignZoomChoice = number | 'fit';

export const DOCSIGN_ZOOM_STORAGE_KEY = 'jaxfr-docsign-paper-zoom';
