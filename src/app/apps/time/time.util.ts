export interface TimeZoneOption {
  id: string;
  label: string;
}

export interface ClockParts {
  time: string;
  date: string;
}

/** Friendly shortcuts shown first in the timezone dropdown. Add entries here as needed. */
export const PINNED_TIME_ZONES: TimeZoneOption[] = [
  { id: 'America/Toronto', label: 'Toronto' },
  { id: 'Asia/Hong_Kong', label: 'Hong Kong' },
  { id: 'Asia/Tokyo', label: 'Japan' },
];

const TIME_ZONE_STORAGE_KEY = 'time.timezone';

export function formatTimeZoneLabel(id: string): string {
  return id.replace(/_/g, ' ').replace(/\//g, ' / ');
}

export function listTimeZones(): TimeZoneOption[] {
  let ids: string[];
  try {
    ids = Intl.supportedValuesOf('timeZone');
  } catch {
    ids = PINNED_TIME_ZONES.map((zone) => zone.id);
  }
  return ids.map((id) => ({ id, label: formatTimeZoneLabel(id) }));
}

export function persistTimeZone(id: string): void {
  try {
    localStorage.setItem(TIME_ZONE_STORAGE_KEY, id);
  } catch {
    // Private mode / quota — selection still works for this visit.
  }
}

export function resolveInitialTimeZone(allIds: string[]): string {
  try {
    const stored = localStorage.getItem(TIME_ZONE_STORAGE_KEY);
    if (stored && allIds.includes(stored)) return stored;
  } catch {
    // ignore
  }

  try {
    const local = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (local && allIds.includes(local)) return local;
  } catch {
    // ignore
  }

  return PINNED_TIME_ZONES[0].id;
}

export function formatClock(date: Date, timeZone: string): ClockParts {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);

  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? '';

  return {
    time: `${get('hour')}:${get('minute')}:${get('second')}`,
    date: `${get('year')}-${get('month')}-${get('day')}`,
  };
}
