/** Keep in sync with @page size in docsign-document.scss */
export const DOCSIGN_PAPER = {
  size: 'A4',
  orientation: 'portrait',
  widthMm: 210,
  heightMm: 297,
  marginMm: 20,
} as const;

export const DOCSIGN_DRIVE_PREVIEW = (fileId: string): string =>
  `https://drive.google.com/file/d/${fileId}/preview`;
