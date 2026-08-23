import { formatDate, getWeekRange, parseLocalDate } from '../../../../core/utils/date-time.util';
import {
  DailyChecklistDashboardRange,
  DailyChecklistDashboardVm,
  DailyChecklistDateStat,
  DailyChecklistItem,
  DailyChecklistRecentItem,
  DailyChecklistSuggestion,
  DailyChecklistTopItem,
} from './daily-checklist.model';

export const DATE_QUERY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
export const DASHBOARD_TOP_LIMIT = 10;

export function isDailyItemCompleted(item: DailyChecklistItem): boolean {
  return item.completed_at != null;
}

export function completionPercent(completed: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((completed / total) * 100);
}

export function normalizeChecklistDateParam(
  value: string | null | undefined,
): string {
  const today = formatDate(new Date());
  const trimmed = value?.trim();
  if (!trimmed || !DATE_QUERY_PATTERN.test(trimmed)) return today;

  const parsed = parseLocalDate(trimmed);
  if (!parsed) return today;
  return formatDate(parsed) === trimmed ? trimmed : today;
}

export function shiftChecklistDate(dateStr: string, days: number): string {
  const parsed = parseLocalDate(dateStr) ?? new Date();
  parsed.setDate(parsed.getDate() + days);
  return formatDate(parsed);
}

export function sortDailyItemsForDisplay(
  items: DailyChecklistItem[],
): DailyChecklistItem[] {
  return [...items].sort((a, b) => {
    const aDone = isDailyItemCompleted(a);
    const bDone = isDailyItemCompleted(b);
    if (aDone !== bDone) return aDone ? 1 : -1;
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
    return a.tb_tyapp_dcl_itm_seq_no - b.tb_tyapp_dcl_itm_seq_no;
  });
}

export function nextSortOrder(items: { sort_order: number }[]): number {
  if (items.length === 0) return 0;
  return Math.max(...items.map((item) => item.sort_order)) + 1;
}

export function buildItemSuggestions(
  items: Array<
    Pick<DailyChecklistItem, 'item_text' | 'completed_at' | 'checklist_date'>
  >,
): DailyChecklistSuggestion[] {
  const byKey = new Map<string, DailyChecklistSuggestion>();

  for (const item of items) {
    const text = item.item_text.trim();
    if (!text) continue;

    const lastUsedAt = item.completed_at ?? item.checklist_date;
    const key = text.toLowerCase();
    const existing = byKey.get(key);
    if (!existing || lastUsedAt > existing.lastUsedAt) {
      byKey.set(key, { item_text: existing?.item_text ?? text, lastUsedAt });
    }
  }

  return Array.from(byKey.values()).sort((a, b) =>
    b.lastUsedAt.localeCompare(a.lastUsedAt),
  );
}

export function filterItemSuggestions(
  suggestions: DailyChecklistSuggestion[],
  query: string,
): DailyChecklistSuggestion[] {
  const q = query.trim().toLowerCase();
  if (!q) return suggestions.slice(0, 12);

  const prefix: DailyChecklistSuggestion[] = [];
  const rest: DailyChecklistSuggestion[] = [];

  for (const suggestion of suggestions) {
    const text = suggestion.item_text.toLowerCase();
    if (text.startsWith(q)) {
      prefix.push(suggestion);
    } else if (text.includes(q)) {
      rest.push(suggestion);
    }
  }

  return [...prefix, ...rest].slice(0, 12);
}

function rangeBounds(
  range: DailyChecklistDashboardRange,
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

export function buildDashboardVm(
  items: DailyChecklistItem[],
  range: DailyChecklistDashboardRange,
  today: string,
): DailyChecklistDashboardVm {
  const { start, end } = rangeBounds(range, today);
  const scoped = items.filter((item) =>
    inRange(item.checklist_date, start, end),
  );

  let completedCount = 0;
  let incompleteCount = 0;
  const dates = new Map<string, DailyChecklistDateStat>();
  const topMap = new Map<string, DailyChecklistTopItem>();
  const recentlyCompleted: DailyChecklistRecentItem[] = [];

  for (const item of scoped) {
    const completed = isDailyItemCompleted(item);
    if (completed) {
      completedCount += 1;
    } else {
      incompleteCount += 1;
    }

    const dateStat = dates.get(item.checklist_date) ?? {
      checklist_date: item.checklist_date,
      completedCount: 0,
      totalCount: 0,
      percent: 0,
    };
    dateStat.totalCount += 1;
    if (completed) dateStat.completedCount += 1;
    dates.set(item.checklist_date, dateStat);

    if (completed && item.completed_at) {
      const key = item.item_text.trim().toLowerCase();
      const current = topMap.get(key);
      if (!current) {
        topMap.set(key, {
          item_text: item.item_text.trim(),
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
        item_text: item.item_text,
        checklist_date: item.checklist_date,
        completed_at: item.completed_at,
      });
    }
  }

  const byDate = Array.from(dates.values())
    .map((row) => ({
      ...row,
      percent: completionPercent(row.completedCount, row.totalCount),
    }))
    .sort((a, b) => b.checklist_date.localeCompare(a.checklist_date));

  const topCompleted = Array.from(topMap.values())
    .sort((a, b) => {
      if (b.completedCount !== a.completedCount) {
        return b.completedCount - a.completedCount;
      }
      return b.latestCompletedAt.localeCompare(a.latestCompletedAt);
    })
    .slice(0, DASHBOARD_TOP_LIMIT);

  recentlyCompleted.sort((a, b) =>
    b.completed_at.localeCompare(a.completed_at),
  );

  return {
    completedCount,
    incompleteCount,
    dateCount: dates.size,
    byDate,
    topCompleted,
    recentlyCompleted: recentlyCompleted.slice(0, DASHBOARD_TOP_LIMIT),
  };
}
