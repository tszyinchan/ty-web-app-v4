import { TyappUser } from '../../../../core/models/user.model';
import { formatUserDisplayName } from '../../../../core/pipes/display-name.pipe';
import { toDateTimeLocalValue } from '../../../../core/utils/date-time.util';
import {
  YYEMS_EATEN_OTHER,
  YYEMS_IN_OR_OUT,
  YYEMS_MEAL,
  YYEMS_OWNERSHIP_SHARED,
  YyemsBillEmbed,
  YyemsBillShare,
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
  if (!ownershipUserId) return 'Both';
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

const PERCENT_UNITS = 100;

export interface BearerPercent {
  user_id: string;
  percent: number;
}

/** Equal whole percents that sum to 100. The last person absorbs the remainder. */
export function equalBearerRows(userIds: readonly string[]): BearerPercent[] {
  const ids = [...new Set(userIds.filter(Boolean))];
  const count = ids.length;
  if (count === 0) return [];
  const each = Math.floor(PERCENT_UNITS / count);
  const remainder = PERCENT_UNITS - each * count;
  return ids.map((user_id, index) => ({
    user_id,
    percent: each + (index === count - 1 ? remainder : 0),
  }));
}

/** Shares that sum to 1. A 0% person is omitted; the column requires share > 0. */
export function rowsToShares(
  rows: readonly BearerPercent[],
): { user_id: string; share: number }[] {
  if (rows.length === 0) return [];
  const units = rows.map((row) => Math.round(row.percent));
  const head = units.slice(0, -1).reduce((total, value) => total + value, 0);
  units[units.length - 1] = PERCENT_UNITS - head;
  return rows.flatMap((row, index) =>
    units[index] > 0
      ? [{ user_id: row.user_id, share: units[index] / PERCENT_UNITS }]
      : [],
  );
}

export function percentsFromShares(
  rows: readonly { user_id: string; share: number }[],
): BearerPercent[] {
  if (rows.length === 0) return [];
  const units = rows.map((row) => Math.round(Number(row.share) * PERCENT_UNITS));
  const head = units.slice(0, -1).reduce((total, value) => total + value, 0);
  units[units.length - 1] = PERCENT_UNITS - head;
  return rows.map((row, index) => ({
    user_id: row.user_id,
    percent: units[index],
  }));
}

export function equalShares(
  userIds: readonly string[],
): { user_id: string; share: number }[] {
  return rowsToShares(equalBearerRows([...userIds].filter(Boolean).sort()));
}

/** Two-person bar. `ratio` is 0–1 from the left name to the right name, including 0 and 100. */
export function pairFromRatio(
  rows: readonly BearerPercent[],
  ratio: number,
): BearerPercent[] {
  if (rows.length !== 2) return rows.map((row) => ({ ...row }));
  const left = Math.min(
    PERCENT_UNITS,
    Math.max(0, Math.round(ratio * PERCENT_UNITS)),
  );
  return [
    { user_id: rows[0].user_id, percent: left },
    { user_id: rows[1].user_id, percent: PERCENT_UNITS - left },
  ];
}

export function formatSharePercent(value: number): string {
  return String(Math.round(value));
}

export function shareSplitHint(count: number): string {
  if (count <= 0) return 'Select who bears this bill.';
  if (count === 1) return '1 person · 100%';
  const pct = 100 / count;
  if (Number.isInteger(pct)) return `${count} people · ${pct}% each`;
  return `${count} people · split equally`;
}

/** Implied paid rate farther than this from the yearly reference is flagged. */
const FX_REFERENCE_BAND = 0.05;

export interface FxRatePoint {
  currency: string;
  year: number;
  to_cad: number;
}

export interface BillFxHint {
  text: string;
  off: boolean;
  suggest: number | null;
}

function fxToCad(
  rates: readonly FxRatePoint[],
  currency: string,
  year: number,
): { value: number; year: number } | null {
  if (currency === 'CAD') return { value: 1, year };
  let best: FxRatePoint | null = null;
  for (const row of rates) {
    if (row.currency !== currency || row.year > year) continue;
    const value = Number(row.to_cad);
    if (!Number.isFinite(value) || value <= 0) continue;
    if (!best || row.year > best.year) best = row;
  }
  if (!best) return null;
  return { value: Number(best.to_cad), year: best.year };
}

function formatFxRate(rate: number): string {
  return rate.toLocaleString('en-US', { maximumFractionDigits: 4 });
}

function formatFxPair(bill: string, wallet: string, rate: number): string {
  return `1 ${bill} = ${formatFxRate(rate)} ${wallet}`;
}

/**
 * Paid line when the wallet currency differs from the bill.
 * `to_cad` is CAD per 1 unit. The shown rate is wallet units per 1 bill unit.
 */
export function billFxHint(input: {
  rates: readonly FxRatePoint[];
  year: number;
  billCurrency: string;
  walletCurrency: string;
  amount: number | null;
  walletAmount: number | null;
}): BillFxHint | null {
  const billCurrency = input.billCurrency.trim();
  const walletCurrency = input.walletCurrency.trim();
  if (!billCurrency || !walletCurrency || billCurrency === walletCurrency) return null;

  const billCad = fxToCad(input.rates, billCurrency, input.year);
  const walletCad = fxToCad(input.rates, walletCurrency, input.year);
  const ref =
    billCad && walletCad && walletCad.value !== 0 ? billCad.value / walletCad.value : null;
  const usedYear =
    billCad && billCad.year !== input.year
      ? billCad.year
      : walletCad && walletCad.year !== input.year
        ? walletCad.year
        : null;

  const amount = input.amount;
  const paid = input.walletAmount;
  const implied = amount != null && paid != null && amount !== 0 ? paid / amount : null;
  const suggest =
    ref != null && amount != null && amount !== 0
      ? Math.round(amount * ref * 100) / 100
      : null;

  const refLabel =
    ref == null
      ? ''
      : `ref ${formatFxPair(billCurrency, walletCurrency, ref)}${usedYear ? ` (${usedYear})` : ''}`;
  const actualLabel =
    implied == null ? '' : formatFxPair(billCurrency, walletCurrency, implied);
  const refBeside =
    ref == null
      ? ''
      : `ref ${formatFxRate(ref)}${usedYear ? ` (${usedYear})` : ''}`;

  let text = '';
  if (actualLabel && refBeside) text = `${actualLabel} · ${refBeside}`;
  else if (refLabel && suggest != null) {
    text = `${refLabel} · about ${walletCurrency} ${suggest.toFixed(2)}`;
  } else if (refLabel) text = refLabel;
  else if (actualLabel) text = actualLabel;
  else return null;

  const off =
    implied != null &&
    ref != null &&
    ref !== 0 &&
    Math.abs(implied - ref) / Math.abs(ref) > FX_REFERENCE_BAND;

  return { text, off, suggest };
}

export function bearerNames(
  shares: readonly { user_id: string }[] | undefined,
  ownershipUserId: string | null,
  users: readonly TyappUser[],
): string {
  if (shares && shares.length > 0) {
    return shares
      .map((row) => {
        const user = users.find((item) => item.user_id === row.user_id);
        return user ? formatUserDisplayName(user) : 'Unknown';
      })
      .sort((a, b) => a.localeCompare(b))
      .join(' · ');
  }
  return ownershipLabel(ownershipUserId, users);
}

/** Map locked share rows back to the Yin / Yiu / Both control. */
export function ownershipKeyFromShares(
  rows: readonly Pick<YyemsBillShare, 'user_id' | 'share'>[],
): string | null {
  if (rows.length === 1 && Number(rows[0].share) === 1) return rows[0].user_id;
  const halves = rows.filter((row) => Math.abs(Number(row.share) - 0.5) < 0.001);
  if (rows.length >= 2 && halves.length === rows.length) return YYEMS_OWNERSHIP_SHARED;
  return null;
}

export function sortByOrderThenName<T extends { sort_order: number | null; name: string }>(
  rows: readonly T[],
): T[] {
  return [...rows].sort((a, b) => {
    const aOrder = a.sort_order ?? Number.MAX_SAFE_INTEGER;
    const bOrder = b.sort_order ?? Number.MAX_SAFE_INTEGER;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return a.name.localeCompare(b.name);
  });
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
  sharesByBill: ReadonlyMap<string, readonly { user_id: string }[]> | null = null,
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
          bearerNames(
            sharesByBill?.get(bill.tb_tyapp_yym_id),
            bill.ownership_user_id,
            users,
          ),
        ).includes(needle),
      )
    : bills;

  const byDay = new Map<string, YyemsBillLedgerRow[]>();
  for (const bill of visible) {
    const local = toDateTimeLocalValue(bill.occurred_at);
    const dateKey = local.slice(0, 10);
    if (!dateKey) continue;
    const cat = vendorCategoryLines(bill.vendor);
    const owner = bearerNames(
      sharesByBill?.get(bill.tb_tyapp_yym_id),
      bill.ownership_user_id,
      users,
    );
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

/** Worked examples on the Split page. $100 so half is an exact $50. */
export const SPLIT_CHECK_AMOUNT = 100;
export const SPLIT_CHECK_CURRENCY = 'CAD';

const FULL_SHARE = 1;
const HALF_SHARE = 0.5;
const MONEY_EPSILON = 0.005;

export type SplitBearer = 'a' | 'b' | 'both';
export type SplitPayer = 'a' | 'b' | 'joint';

export interface SettleShare {
  userId: string;
  share: number;
}

export interface SettleEffect {
  userId: string;
  paid: number;
  borne: number;
  net: number;
}

export interface SettleOneResult {
  amount: number;
  payerUserId: string | null;
  effects: readonly [SettleEffect, SettleEffect];
  outsidePaid: number;
}

function money(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Split an amount into cents that add back to the original. The last share keeps the remainder. */
export function allocateByShare(
  amount: number,
  shares: readonly { userId: string; share: number }[],
): Map<string, number> {
  const cents = Math.round(money(amount) * 100);
  const weights = shares.map((row) => ({
    userId: row.userId,
    weight: Math.max(0, Math.round(Number(row.share) * PERCENT_UNITS)),
  }));
  const weightSum = weights.reduce((total, row) => total + row.weight, 0);
  const out = new Map<string, number>();
  let used = 0;
  weights.forEach((row, index) => {
    const portion =
      weightSum <= 0
        ? 0
        : index === weights.length - 1
          ? cents - used
          : Math.floor((cents * row.weight) / weightSum);
    used += portion;
    out.set(row.userId, (out.get(row.userId) ?? 0) + portion / 100);
  });
  return out;
}

/**
 * One expense between a chosen pair.
 * Paid by = wallet owner (`null` = joint pot, 50/50 of this pair).
 * Borne by = share rows. Net = paid − borne. Positive means the other person owes them.
 */
export function settleOneBill(input: {
  amount: number;
  payerUserId: string | null;
  shares: readonly SettleShare[];
  pair: readonly [string, string];
}): SettleOneResult {
  const amount = money(input.amount);
  const [aId, bId] = input.pair;
  let paidA = 0;
  let paidB = 0;
  let outsidePaid = 0;
  if (input.payerUserId === null) {
    paidA = money(amount / 2);
    paidB = money(amount - paidA);
  } else if (input.payerUserId === aId) {
    paidA = amount;
  } else if (input.payerUserId === bId) {
    paidB = amount;
  } else {
    outsidePaid = amount;
  }

  const portions = allocateByShare(
    amount,
    input.shares.map((row) => ({ userId: row.userId, share: Number(row.share) })),
  );
  const borneA = portions.get(aId) ?? 0;
  const borneB = portions.get(bId) ?? 0;

  return {
    amount,
    payerUserId: input.payerUserId,
    outsidePaid,
    effects: [
      { userId: aId, paid: paidA, borne: borneA, net: money(paidA - borneA) },
      { userId: bId, paid: paidB, borne: borneB, net: money(paidB - borneB) },
    ],
  };
}

export function sharesForBearer(
  bearer: SplitBearer,
  pair: readonly [string, string],
): SettleShare[] {
  const [aId, bId] = pair;
  if (bearer === 'a') return [{ userId: aId, share: FULL_SHARE }];
  if (bearer === 'b') return [{ userId: bId, share: FULL_SHARE }];
  return [
    { userId: aId, share: HALF_SHARE },
    { userId: bId, share: HALF_SHARE },
  ];
}

export function payerIdFor(
  payer: SplitPayer,
  pair: readonly [string, string],
): string | null {
  if (payer === 'joint') return null;
  return payer === 'a' ? pair[0] : pair[1];
}

/** True when every share row is one of these two people. Empty shares are not in the pair. */
export function sharesStayInPair(
  shares: readonly SettleShare[],
  pair: readonly [string, string],
): boolean {
  if (shares.length === 0) return false;
  const ids = new Set<string>(pair);
  return shares.every((row) => ids.has(row.userId));
}

export function owesLabel(
  aName: string,
  bName: string,
  aNet: number,
  bNet: number,
  currency: string,
): string {
  if (Math.abs(aNet + bNet) > MONEY_EPSILON) {
    return `${aName} ${formatYyemsAmount(currency, aNet)} · ${bName} ${formatYyemsAmount(currency, bNet)} (paid outside this pair)`;
  }
  if (aNet < -MONEY_EPSILON) {
    return `${aName} owes ${bName} ${formatYyemsAmount(currency, -aNet)}`;
  }
  if (aNet > MONEY_EPSILON) {
    return `${bName} owes ${aName} ${formatYyemsAmount(currency, aNet)}`;
  }
  return 'Even';
}

interface SplitCheckCase {
  title: string;
  payer: SplitPayer;
  bearer: SplitBearer;
  expect: 'a-owes-b' | 'b-owes-a-half' | 'even' | 'a-owes-b-half';
}

const SPLIT_CHECK_CASES: readonly SplitCheckCase[] = [
  { title: 'A bears, B’s wallet pays', payer: 'b', bearer: 'a', expect: 'a-owes-b' },
  { title: 'Both, A’s wallet pays', payer: 'a', bearer: 'both', expect: 'b-owes-a-half' },
  { title: 'A bears, A’s wallet pays', payer: 'a', bearer: 'a', expect: 'even' },
  { title: 'Both, joint wallet', payer: 'joint', bearer: 'both', expect: 'even' },
  { title: 'A bears, joint wallet', payer: 'joint', bearer: 'a', expect: 'a-owes-b-half' },
];

const SAMPLE_PAIR = ['sample-a', 'sample-b'] as const;

export interface SplitCheckView {
  title: string;
  actual: string;
  expected: string;
  ok: boolean;
}

export function buildSplitChecks(aName: string, bName: string): SplitCheckView[] {
  return SPLIT_CHECK_CASES.map((row) => {
    const result = settleOneBill({
      amount: SPLIT_CHECK_AMOUNT,
      payerUserId: payerIdFor(row.payer, SAMPLE_PAIR),
      shares: sharesForBearer(row.bearer, SAMPLE_PAIR),
      pair: SAMPLE_PAIR,
    });
    const actual = owesLabel(
      aName,
      bName,
      result.effects[0].net,
      result.effects[1].net,
      SPLIT_CHECK_CURRENCY,
    );
    const expected = expectedSplitVerdict(row.expect, aName, bName);
    return { title: row.title, actual, expected, ok: actual === expected };
  });
}

function expectedSplitVerdict(
  kind: SplitCheckCase['expect'],
  aName: string,
  bName: string,
): string {
  const full = formatYyemsAmount(SPLIT_CHECK_CURRENCY, SPLIT_CHECK_AMOUNT);
  const half = formatYyemsAmount(SPLIT_CHECK_CURRENCY, SPLIT_CHECK_AMOUNT / 2);
  switch (kind) {
    case 'a-owes-b':
      return `${aName} owes ${bName} ${full}`;
    case 'b-owes-a-half':
      return `${bName} owes ${aName} ${half}`;
    case 'a-owes-b-half':
      return `${aName} owes ${bName} ${half}`;
    case 'even':
      return 'Even';
  }
}

export interface SplitCurrencyTotal {
  currency: string;
  verdict: string;
  aNet: number;
  bNet: number;
  outsidePaid: number;
}

export function summarizeSplit(
  rows: readonly { currency: string; result: SettleOneResult }[],
  aName: string,
  bName: string,
): SplitCurrencyTotal[] {
  const byCurrency = new Map<
    string,
    { paidA: number; paidB: number; borneA: number; borneB: number; outside: number }
  >();
  for (const row of rows) {
    const bucket = byCurrency.get(row.currency) ?? {
      paidA: 0,
      paidB: 0,
      borneA: 0,
      borneB: 0,
      outside: 0,
    };
    bucket.paidA = money(bucket.paidA + row.result.effects[0].paid);
    bucket.paidB = money(bucket.paidB + row.result.effects[1].paid);
    bucket.borneA = money(bucket.borneA + row.result.effects[0].borne);
    bucket.borneB = money(bucket.borneB + row.result.effects[1].borne);
    bucket.outside = money(bucket.outside + row.result.outsidePaid);
    byCurrency.set(row.currency, bucket);
  }
  return [...byCurrency.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currency, bucket]) => {
      const aNet = money(bucket.paidA - bucket.borneA);
      const bNet = money(bucket.paidB - bucket.borneB);
      return {
        currency,
        aNet,
        bNet,
        outsidePaid: bucket.outside,
        verdict: owesLabel(aName, bName, aNet, bNet, currency),
      };
    });
}
