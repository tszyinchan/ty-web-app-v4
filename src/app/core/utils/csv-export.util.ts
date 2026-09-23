export function exportTimestampPrefix(): string {
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');

  const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;

  return `${date}_${time}`;
}

/** Detached <a download> used only for the browser save trick — not in the component tree. */
export function downloadTextFile(
  filename: string,
  content: string,
  mimeType: string,
): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  // eslint-disable-next-line no-restricted-syntax
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function exportToCsv(subject: string, headers: string[], rows: string[][]) {
  const filename = `${exportTimestampPrefix()}_Jaxfr_${subject}`;

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(field => `"${String(field).replace(/"/g, '""')}"`).join(','))
  ].join('\n');

  downloadTextFile(
    `${filename}.csv`,
    '\uFEFF' + csvContent,
    'text/csv;charset=utf-8;',
  );
}
