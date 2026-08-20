/** Default UI date format (YYYY-MM-DD). Also wired as Angular DatePipe default. */
export const DATE_DISPLAY_FORMAT = 'yyyy-MM-dd';

export function parseLocalDate(
  dateStr: string | null | undefined,
): Date | null {
  if (!dateStr) return new Date();
  const parts = dateStr.split('-');
  if (parts.length !== 3) return new Date();
  return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
}

export function formatDate(d: Date): string {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .split('T')[0];
}

export function extractTime(isoString: string | null | undefined): string {
  if (!isoString) return '';
  const d = new Date(isoString);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

export function buildIsoString(
  dateStr: string,
  timeStr: string,
): string | null {
  if (!timeStr || !dateStr) return null;
  return new Date(`${dateStr}T${timeStr}:00`).toISOString();
}

export function buildSequentialIsoStrings(
  baseDateStr: string,
  timeStrings: (string | null | undefined)[],
): (string | null)[] {
  if (!baseDateStr) return timeStrings.map(() => null);

  let currentDayOffset = 0;
  let lastValidTime: string | null = null;
  const results: (string | null)[] = [];

  const parts = baseDateStr.split('-');
  const baseDate = new Date(
    Number(parts[0]),
    Number(parts[1]) - 1,
    Number(parts[2]),
  );

  for (const t of timeStrings) {
    if (!t) {
      results.push(null);
      continue;
    }

    if (lastValidTime !== null && t < lastValidTime) {
      currentDayOffset += 1;
    }

    const targetDate = new Date(baseDate);
    targetDate.setDate(targetDate.getDate() + currentDayOffset);

    const [hours, minutes] = t.split(':').map(Number);
    targetDate.setHours(hours, minutes, 0, 0);

    results.push(targetDate.toISOString());

    lastValidTime = t;
  }

  return results;
}

export function addMinutesToTime(timeStr: string, mins: number): string {
  if (!timeStr) return '';
  const [h, m] = timeStr.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m + mins, 0, 0);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

export function groupItemsByPeriod<T>(
  items: T[],
  labelGenerator: (item: T) => string,
): { periodLabel: string; items: T[] }[] {
  const groups: { periodLabel: string; items: T[] }[] = [];
  let currentGroup: { periodLabel: string; items: T[] } | null = null;

  for (const item of items) {
    const label = labelGenerator(item);

    if (!currentGroup || currentGroup.periodLabel !== label) {
      currentGroup = { periodLabel: label, items: [] };
      groups.push(currentGroup);
    }
    currentGroup.items.push(item);
  }

  return groups;
}

export function calculateWorkingHours(
  startIso: string | null | undefined,
  endIso: string | null | undefined,
  mealStartIso: string | null | undefined,
  mealEndIso: string | null | undefined,
  isDayOff: boolean,
): number {
  if (isDayOff || !startIso || !endIso) return 0;

  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  let diffMs = end - start;

  if (mealStartIso && mealEndIso) {
    const mStart = new Date(mealStartIso).getTime();
    const mEnd = new Date(mealEndIso).getTime();
    if (mEnd > mStart) {
      diffMs -= mEnd - mStart;
    }
  }

  const hours = diffMs / (1000 * 60 * 60);

  if (hours < 0) return 0;

  return Math.round(hours * 100) / 100;
}

const BIWEEKLY_ANCHOR_DATE = new Date('2024-12-30T00:00:00');


export interface PeriodRange {
  startDate: string;
  endDate: string;
  label: string;
}

export function getWeekRange(
  dateStr: string | null | undefined,
): PeriodRange | null {
  const d = parseLocalDate(dateStr);
  if (!d) return null;

  const day = d.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;

  const monday = new Date(d);
  monday.setDate(d.getDate() + diffToMonday);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const startYear = monday.getFullYear();
  const endYear = sunday.getFullYear();
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };

  const label =
    startYear !== endYear
      ? `${monday.toLocaleDateString('en-US', opts)}, ${startYear} - ${sunday.toLocaleDateString('en-US', opts)}, ${endYear}`
      : `${monday.toLocaleDateString('en-US', opts)} - ${sunday.toLocaleDateString('en-US', opts)}, ${endYear}`;

  return {
    startDate: formatDate(monday),
    endDate: formatDate(sunday),
    label: label,
  };
}

export function getBiWeeklyRange(
  dateStr: string | null | undefined,
): PeriodRange | null {
  const targetDate = parseLocalDate(dateStr);
  if (!targetDate) return null;

  const targetUTC = Date.UTC(
    targetDate.getFullYear(),
    targetDate.getMonth(),
    targetDate.getDate(),
  );
  const anchorUTC = Date.UTC(
    BIWEEKLY_ANCHOR_DATE.getFullYear(),
    BIWEEKLY_ANCHOR_DATE.getMonth(),
    BIWEEKLY_ANCHOR_DATE.getDate(),
  );

  const diffDays = Math.floor((targetUTC - anchorUTC) / (1000 * 60 * 60 * 24));
  const periodIndex = Math.floor(diffDays / 14);

  const periodStart = new Date(BIWEEKLY_ANCHOR_DATE);
  periodStart.setDate(periodStart.getDate() + periodIndex * 14);

  const periodEnd = new Date(periodStart);
  periodEnd.setDate(periodStart.getDate() + 13);

  const startYear = periodStart.getFullYear();
  const endYear = periodEnd.getFullYear();
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };

  const label =
    startYear !== endYear
      ? `${periodStart.toLocaleDateString('en-US', opts)}, ${startYear} - ${periodEnd.toLocaleDateString('en-US', opts)}, ${endYear}`
      : `${periodStart.toLocaleDateString('en-US', opts)} - ${periodEnd.toLocaleDateString('en-US', opts)}, ${endYear}`;

  return {
    startDate: formatDate(periodStart),
    endDate: formatDate(periodEnd),
    label: label,
  };
}
