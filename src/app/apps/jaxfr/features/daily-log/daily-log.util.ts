import { formatDate, getWeekRange, parseLocalDate } from '../../../../core/utils/date-time.util';
import {
  DailyLogStatsRange,
  DailyLogStatsVm,
  DailyLogDateStat,
  DailyLogDayRow,
  DailyLogLibraryItem,
  DailyLogRecentItem,
  DailyLogTopItem,
  DailyLogWeekDay,
  DL_COLOUR_PRESETS,
  DL_MOOD_KEYS,
  DL_MOODS,
  DlColourPresetKey,
  DlMoodKey,
} from './daily-log.model';

export const DATE_QUERY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
export const STATS_TOP_LIMIT = 10;
const WEEKDAY_LABELS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

export function isDayItemCompleted(item: { completed_at: string | null }): boolean {
  return item.completed_at != null;
}

export function completionPercent(completed: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((completed / total) * 100);
}

export function colourPreset(key: string | null | undefined) {
  return (
    DL_COLOUR_PRESETS.find((row) => row.key === key) ??
    DL_COLOUR_PRESETS[DL_COLOUR_PRESETS.length - 1]
  );
}

export function isColourPresetKey(value: string): value is DlColourPresetKey {
  return DL_COLOUR_PRESETS.some((row) => row.key === value);
}

export function colourClass(key: string | null | undefined): string {
  return `colour-${isColourPresetKey(key ?? '') ? key : 'slate'}`;
}

export function isMoodKey(value: string | null | undefined): value is DlMoodKey {
  return DL_MOOD_KEYS.some((key) => key === value);
}

export function moodImage(key: string | null | undefined): string | null {
  if (!isMoodKey(key)) return null;
  return DL_MOODS.find((mood) => mood.key === key)?.image ?? null;
}

export function normalizeLogDateParam(
  value: string | null | undefined,
): string {
  const today = formatDate(new Date());
  const trimmed = value?.trim();
  if (!trimmed || !DATE_QUERY_PATTERN.test(trimmed)) return today;

  const parsed = parseLocalDate(trimmed);
  if (!parsed) return today;
  return formatDate(parsed) === trimmed ? trimmed : today;
}

export function shiftLogDate(dateStr: string, days: number): string {
  const parsed = parseLocalDate(dateStr) ?? new Date();
  parsed.setDate(parsed.getDate() + days);
  return formatDate(parsed);
}

export function logDateParts(dateStr: string): {
  dayNum: string;
  weekday: string;
} {
  const parsed = parseLocalDate(dateStr);
  if (!parsed) return { dayNum: '', weekday: '' };
  const sundayFirst = parsed.getDay();
  const mondayFirst = (sundayFirst + 6) % 7;
  return {
    dayNum: String(parsed.getDate()),
    weekday: WEEKDAY_LABELS[mondayFirst],
  };
}

export function getChecklistWeekRange(dateStr: string): {
  startDate: string;
  endDate: string;
} {
  const week =
    getWeekRange(dateStr) ?? getWeekRange(formatDate(new Date()));
  if (!week) {
    const today = formatDate(new Date());
    return { startDate: today, endDate: today };
  }
  return { startDate: week.startDate, endDate: week.endDate };
}

export function getChecklistWeekStripRange(dateStr: string): {
  startDate: string;
  endDate: string;
} {
  const week = getChecklistWeekRange(dateStr);
  return {
    startDate: shiftLogDate(week.startDate, -7),
    endDate: shiftLogDate(week.endDate, 7),
  };
}

export const STRIP_WEEKS_BEFORE = 1;
export const STRIP_WEEKS_AFTER = 1;
export const STRIP_EXTEND_WEEKS = 2;

export function initialStripWeekCount(): number {
  return STRIP_WEEKS_BEFORE + 1 + STRIP_WEEKS_AFTER;
}

export function initialStripStart(dateStr: string): string {
  const week = getChecklistWeekRange(dateStr);
  return shiftLogDate(week.startDate, -7 * STRIP_WEEKS_BEFORE);
}

export function stripRangeEnd(startMonday: string, weekCount: number): string {
  return shiftLogDate(startMonday, weekCount * 7 - 1);
}

export function isDateInStrip(
  dateStr: string,
  startMonday: string,
  weekCount: number,
): boolean {
  return dateStr >= startMonday && dateStr <= stripRangeEnd(startMonday, weekCount);
}

export function weekPageIndex(startMonday: string, dateStr: string): number {
  const start = parseLocalDate(getChecklistWeekRange(startMonday).startDate);
  const target = parseLocalDate(getChecklistWeekRange(dateStr).startDate);
  if (!start || !target) return 0;
  return Math.round((target.getTime() - start.getTime()) / 86400000 / 7);
}

export function isDateInLogWeek(dateStr: string, weekAnchor: string): boolean {
  const week = getChecklistWeekRange(weekAnchor);
  return dateStr >= week.startDate && dateStr <= week.endDate;
}

export function buildWeekDays(
  anchorDate: string,
  weekItems: DailyLogDayRow[],
  weeksBefore = 0,
  weeksAfter = 0,
  selectedDate = anchorDate,
): DailyLogWeekDay[] {
  const today = formatDate(new Date());
  const { startDate } = getChecklistWeekRange(anchorDate);
  const start = parseLocalDate(startDate) ?? new Date();
  start.setDate(start.getDate() - weeksBefore * 7);
  const counts = new Map<string, { total: number; completed: number }>();

  for (const item of weekItems) {
    const row = counts.get(item.log_date) ?? { total: 0, completed: 0 };
    row.total += 1;
    if (isDayItemCompleted(item)) row.completed += 1;
    counts.set(item.log_date, row);
  }

  const totalDays = 7 * (weeksBefore + 1 + weeksAfter);
  return Array.from({ length: totalDays }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    const date = formatDate(day);
    const tally = counts.get(date) ?? { total: 0, completed: 0 };
    return {
      date,
      weekday: WEEKDAY_LABELS[index % 7],
      dayNum: day.getDate(),
      isToday: date === today,
      isSelected: date === selectedDate,
      totalCount: tally.total,
      completedCount: tally.completed,
    };
  });
}

export function groupWeekDays(
  days: DailyLogWeekDay[],
): DailyLogWeekDay[][] {
  const pages: DailyLogWeekDay[][] = [];
  for (let i = 0; i < days.length; i += 7) {
    pages.push(days.slice(i, i + 7));
  }
  return pages;
}

export function sortDayRowsForDisplay(
  items: DailyLogDayRow[],
): DailyLogDayRow[] {
  return [...items].sort((a, b) => {
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
    return a.tb_tyapp_dl_day_seq_no - b.tb_tyapp_dl_day_seq_no;
  });
}

export function nextSortOrder(items: { sort_order: number }[]): number {
  if (items.length === 0) return 0;
  return Math.max(...items.map((item) => item.sort_order)) + 1;
}

export function filterLibrarySuggestions(
  library: DailyLogLibraryItem[],
  query: string,
): DailyLogLibraryItem[] {
  const q = query.trim().toLowerCase();
  const sorted = [...library].sort((a, b) =>
    a.item_text.localeCompare(b.item_text),
  );
  if (!q) return sorted.slice(0, 12);

  const prefix: DailyLogLibraryItem[] = [];
  const rest: DailyLogLibraryItem[] = [];
  for (const item of sorted) {
    const text = item.item_text.toLowerCase();
    if (text.startsWith(q)) prefix.push(item);
    else if (text.includes(q)) rest.push(item);
  }
  return [...prefix, ...rest].slice(0, 12);
}

export function findLibraryItemByName(
  library: DailyLogLibraryItem[],
  name: string,
): DailyLogLibraryItem | undefined {
  const key = name.trim().toLowerCase();
  if (!key) return undefined;
  return library.find((item) => item.item_text.trim().toLowerCase() === key);
}

function rangeBounds(
  range: DailyLogStatsRange,
  today: string,
): { start: string | null; end: string | null } {
  if (range === 'all') return { start: null, end: null };

  if (range === 'week') {
    const week = getWeekRange(today);
    return week
      ? { start: week.startDate, end: week.endDate }
      : { start: today, end: today };
  }

  const start = parseLocalDate(today) ?? new Date();
  start.setDate(start.getDate() - 29);
  return { start: formatDate(start), end: today };
}

function inRange(
  dateStr: string,
  start: string | null,
  end: string | null,
): boolean {
  if (start && dateStr < start) return false;
  if (end && dateStr > end) return false;
  return true;
}

export function buildStatsVm(
  items: DailyLogDayRow[],
  range: DailyLogStatsRange,
  today: string,
): DailyLogStatsVm {
  const { start, end } = rangeBounds(range, today);
  const scoped = items.filter((item) =>
    inRange(item.log_date, start, end),
  );

  let completedCount = 0;
  let incompleteCount = 0;
  const dates = new Map<string, DailyLogDateStat>();
  const topMap = new Map<string, DailyLogTopItem>();
  const recentlyCompleted: DailyLogRecentItem[] = [];

  for (const item of scoped) {
    const completed = isDayItemCompleted(item);
    if (completed) completedCount += 1;
    else incompleteCount += 1;

    const dateStat = dates.get(item.log_date) ?? {
      log_date: item.log_date,
      completedCount: 0,
      totalCount: 0,
      percent: 0,
    };
    dateStat.totalCount += 1;
    if (completed) dateStat.completedCount += 1;
    dates.set(item.log_date, dateStat);

    if (completed && item.completed_at) {
      const current = topMap.get(item.item_id);
      if (!current) {
        topMap.set(item.item_id, {
          item_id: item.item_id,
          item_text: item.library.item_text,
          emoji: item.library.emoji,
          completedCount: 1,
          latestCompletedAt: item.completed_at,
        });
      } else {
        current.completedCount += 1;
        if (item.completed_at > current.latestCompletedAt) {
          current.latestCompletedAt = item.completed_at;
        }
      }

      recentlyCompleted.push({
        item_id: item.item_id,
        item_text: item.library.item_text,
        emoji: item.library.emoji,
        log_date: item.log_date,
        completed_at: item.completed_at,
      });
    }
  }

  const byDate = Array.from(dates.values())
    .map((row) => ({
      ...row,
      percent: completionPercent(row.completedCount, row.totalCount),
    }))
    .sort((a, b) => b.log_date.localeCompare(a.log_date));

  const topCompleted = Array.from(topMap.values())
    .sort((a, b) => {
      if (b.completedCount !== a.completedCount) {
        return b.completedCount - a.completedCount;
      }
      return b.latestCompletedAt.localeCompare(a.latestCompletedAt);
    })
    .slice(0, STATS_TOP_LIMIT);

  recentlyCompleted.sort((a, b) =>
    b.completed_at.localeCompare(a.completed_at),
  );

  return {
    completedCount,
    incompleteCount,
    dateCount: dates.size,
    byDate,
    topCompleted,
    recentlyCompleted: recentlyCompleted.slice(0, STATS_TOP_LIMIT),
  };
}
