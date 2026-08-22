export const DOCSIGN_BRAND_ICON = '/icons/3d/docsign.png';

export const DOCSIGN_DRIVE_PREVIEW = (fileId: string): string =>
  `https://drive.google.com/file/d/${fileId}/preview`;

export const DOCSIGN_DRIVE_VIEW = (fileId: string): string =>
  `https://drive.google.com/file/d/${fileId}/view`;

export const DOCSIGN_LEASE_STALE_MS = 90_000;
export const DOCSIGN_LEASE_HEARTBEAT_MS = 45_000;
