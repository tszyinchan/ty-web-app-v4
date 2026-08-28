import { TyappUser } from '../../../../core/models/user.model';
import { formatUserDisplayName } from '../../../../core/pipes/display-name.pipe';
import { toDateTimeLocalValue } from '../../../../core/utils/date-time.util';
import {
  YYEMS_EATEN_OTHER,
  YYEMS_IN_OR_OUT,
  YYEMS_MEAL,
  YYEMS_OWNERSHIP_SHARED,
  YyemsBillEmbed,
  YyemsEat,
  YyemsEatAmount,
  YyemsEatenOther,
  YyemsFridgeRow,
  YyemsInOrOut,
  YyemsItem,
  YyemsMeal,
  YyemsVendorEmbed,
} from './yyems.model';

export function itemLabel(item: YyemsItem | null | undefined): string {
  if (!item) return 'Unknown item';
  const zh = item.name_zh?.trim() ?? '';
  const en = item.name_en?.trim() ?? '';
  if (zh && en && zh !== en) return `${zh} / ${en}`;
  return zh || en || 'Untitled item';
}

export function remainingOf(
  homeAmount: number,
  eats: readonly YyemsEatAmount[],
  exceptEatId?: string | null,
): number {
  const eaten = eats
    .filter((row) => !exceptEatId || row.tb_tyapp_yet_id !== exceptEatId)
    .reduce((sum, row) => sum + Number(row.home_amount || 0), 0);
  return Math.round((homeAmount - eaten) * 1000) / 1000;
}

export function eatenByLabel(
  eat: Pick<YyemsEat, 'eaten_by_user_id' | 'eaten_by_other'>,
  users: readonly TyappUser[],
): string {
  if (eat.eaten_by_other === YYEMS_EATEN_OTHER.Shared) return 'Shared';
  if (eat.eaten_by_other === YYEMS_EATEN_OTHER.DiningOut) return 'Dining out';
  if (eat.eaten_by_other === YYEMS_EATEN_OTHER.Nil) return 'None';
  const user = users.find((u) => u.user_id === eat.eaten_by_user_id);
  if (!user) return '—';
  return formatUserDisplayName(user);
}

export function ownershipLabel(
  ownershipUserId: string | null,
  users: readonly TyappUser[],
): string {
  if (!ownershipUserId) return 'Shared';
  const user = users.find((u) => u.user_id === ownershipUserId);
  if (!user) return '—';
  return formatUserDisplayName(user);
}

export function ownershipKey(ownershipUserId: string | null): string {
  return ownershipUserId ?? YYEMS_OWNERSHIP_SHARED;
}

export function ownershipUserIdFromKey(key: string | null | undefined): string | null {
  if (!key || key === YYEMS_OWNERSHIP_SHARED) return null;
  return key;
}

export function fridgeSearchHaystack(row: YyemsFridgeRow): string {
  return [
    itemLabel(row.item),
    row.price?.product_name,
    row.price?.product_name_zh,
    row.price?.brand,
    row.vendor?.name,
    row.buy.home_unit,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

export function mealGroupTitle(meal: YyemsMeal): string {
  if (meal === YYEMS_MEAL.Breakfast) return 'Breakfast · 1早';
  if (meal === YYEMS_MEAL.TeaAm) return 'Morning tea · 2茶';
  if (meal === YYEMS_MEAL.Lunch) return 'Lunch · 3午';
  if (meal === YYEMS_MEAL.TeaPm) return 'Afternoon tea · 4茶';
  if (meal === YYEMS_MEAL.Dinner) return 'Dinner · 5晚';
  if (meal === YYEMS_MEAL.Supper) return 'Supper · 6宵';
  if (meal === YYEMS_MEAL.Use) return 'Use · 7用';
  if (meal === YYEMS_MEAL.Seasoning) return 'Seasoning · 8調';
  return 'Wash · 9洗';
}

export function parseEatenByKey(
  key: string | null | undefined,
): { eaten_by_user_id: string | null; eaten_by_other: YyemsEatenOther | null } {
  if (!key || key === YYEMS_EATEN_OTHER.Shared) {
    return { eaten_by_user_id: null, eaten_by_other: YYEMS_EATEN_OTHER.Shared };
  }
  if (key === YYEMS_EATEN_OTHER.DiningOut) {
    return { eaten_by_user_id: null, eaten_by_other: YYEMS_EATEN_OTHER.DiningOut };
  }
  if (key === YYEMS_EATEN_OTHER.Nil) {
    return { eaten_by_user_id: null, eaten_by_other: YYEMS_EATEN_OTHER.Nil };
  }
  return { eaten_by_user_id: key, eaten_by_other: null };
}

export function eatenByKey(
  eaten_by_user_id: string | null,
  eaten_by_other: YyemsEatenOther | null,
): string {
  if (eaten_by_other) return eaten_by_other;
  if (eaten_by_user_id) return eaten_by_user_id;
  return YYEMS_EATEN_OTHER.Shared;
}

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

export interface YyemsMoneyPart {
  currency: string;
  amount: number;
}

export interface YyemsBillLedgerRow {
  bill: YyemsBillEmbed;
  categoryTop: string;
  categoryBottom: string;
  title: string;
  subtitle: string;
  amountClass: YyemsInOrOut;
  amountLabel: string;
}

export interface YyemsBillDayGroup {
  dateKey: string;
  day: number;
  weekday: string;
  inLabel: string;
  outLabel: string;
  rows: YyemsBillLedgerRow[];
}

export interface YyemsBillLedger {
  days: YyemsBillDayGroup[];
  monthIn: YyemsMoneyPart[];
  monthOut: YyemsMoneyPart[];
  monthNet: YyemsMoneyPart[];
}

export function formatYyemsAmount(currency: string, amount: number): string {
  const n = Number(amount);
  const abs = Math.abs(n).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const signed = n < 0 ? `-${abs}` : abs;
  return `${currency} ${signed}`;
}

export function compactMoneyLabel(parts: readonly YyemsMoneyPart[]): string {
  if (parts.length === 0) return '0.00';
  return parts.map((p) => formatYyemsAmount(p.currency, p.amount)).join(' · ');
}

function vendorCategoryLines(vendor: YyemsVendorEmbed | null): {
  top: string;
  bottom: string;
} {
  const raw = vendor?.category as
    | YyemsVendorEmbed['category']
    | YyemsVendorEmbed['category'][]
    | null;
  const cat = Array.isArray(raw) ? (raw[0] ?? null) : raw;
  if (cat) {
    const top = cat.level1 || cat.display_name || vendor?.name || '—';
    const bottom = cat.level2 || cat.level3 || vendor?.name_short || '';
    return { top, bottom: bottom === top ? '' : bottom };
  }
  return {
    top: vendor?.name || '—',
    bottom: vendor?.name_short || '',
  };
}

function addMoney(
  map: Record<string, number>,
  currency: string,
  amount: number,
): void {
  map[currency] = (map[currency] ?? 0) + Number(amount);
}

function moneyParts(map: Record<string, number>): YyemsMoneyPart[] {
  return Object.keys(map)
    .sort()
    .map((currency) => ({ currency, amount: map[currency] }));
}

function netParts(
  inMap: Record<string, number>,
  outMap: Record<string, number>,
): YyemsMoneyPart[] {
  const keys = new Set([...Object.keys(inMap), ...Object.keys(outMap)]);
  return [...keys]
    .sort()
    .map((currency) => ({
      currency,
      amount: (inMap[currency] ?? 0) - (outMap[currency] ?? 0),
    }));
}

function billHaystack(bill: YyemsBillEmbed, owner: string): string {
  const cat = bill.vendor?.category;
  return [
    bill.vendor?.name,
    bill.vendor?.name_short,
    cat?.display_name,
    cat?.level1,
    cat?.level2,
    cat?.level3,
    bill.wallet?.name,
    bill.remark,
    bill.description,
    bill.currency,
    owner,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

export function buildBillLedger(
  bills: readonly YyemsBillEmbed[],
  users: readonly TyappUser[],
  search: string,
): YyemsBillLedger {
  const monthIn: Record<string, number> = {};
  const monthOut: Record<string, number> = {};
  for (const bill of bills) {
    if (bill.in_or_out === YYEMS_IN_OR_OUT.In) {
      addMoney(monthIn, bill.currency, bill.amount);
    } else if (bill.in_or_out === YYEMS_IN_OR_OUT.Out) {
      addMoney(monthOut, bill.currency, bill.amount);
    }
  }

  const needle = search.trim().toLowerCase();
  const visible = needle
    ? bills.filter((bill) =>
        billHaystack(
          bill,
          ownershipLabel(bill.ownership_user_id, users),
        ).includes(needle),
      )
    : bills;

  const byDay = new Map<string, YyemsBillLedgerRow[]>();
  for (const bill of visible) {
    const local = toDateTimeLocalValue(bill.occurred_at);
    const dateKey = local.slice(0, 10);
    if (!dateKey) continue;
    const cat = vendorCategoryLines(bill.vendor);
    const owner = ownershipLabel(bill.ownership_user_id, users);
    const wallet = bill.wallet?.name || '—';
    const row: YyemsBillLedgerRow = {
      bill,
      categoryTop: cat.top,
      categoryBottom: cat.bottom,
      title: bill.remark?.trim() || bill.vendor?.name || '—',
      subtitle: `${owner} · ${wallet}`,
      amountClass: bill.in_or_out,
      amountLabel: formatYyemsAmount(bill.currency, bill.amount),
    };
    const list = byDay.get(dateKey);
    if (list) list.push(row);
    else byDay.set(dateKey, [row]);
  }

  const days = [...byDay.keys()]
    .sort((a, b) => (a < b ? 1 : a > b ? -1 : 0))
    .map((dateKey) => {
      const rows = byDay.get(dateKey) ?? [];
      const dayIn: Record<string, number> = {};
      const dayOut: Record<string, number> = {};
      for (const row of rows) {
        if (row.bill.in_or_out === YYEMS_IN_OR_OUT.In) {
          addMoney(dayIn, row.bill.currency, row.bill.amount);
        } else if (row.bill.in_or_out === YYEMS_IN_OR_OUT.Out) {
          addMoney(dayOut, row.bill.currency, row.bill.amount);
        }
      }
      const parsed = dateKey.split('-');
      const localDate = new Date(
        Number(parsed[0]),
        Number(parsed[1]) - 1,
        Number(parsed[2]),
      );
      return {
        dateKey,
        day: localDate.getDate(),
        weekday: WEEKDAY_SHORT[localDate.getDay()] ?? '',
        inLabel: compactMoneyLabel(moneyParts(dayIn)),
        outLabel: compactMoneyLabel(moneyParts(dayOut)),
        rows,
      };
    });

  return {
    days,
    monthIn: moneyParts(monthIn),
    monthOut: moneyParts(monthOut),
    monthNet: netParts(monthIn, monthOut),
  };
}
