import { TyappUser } from '../../../../core/models/user.model';
import {
  YYEMS_EATEN_OTHER,
  YYEMS_MEAL,
  YYEMS_OWNERSHIP_SHARED,
  YyemsEat,
  YyemsEatAmount,
  YyemsEatenOther,
  YyemsFridgeRow,
  YyemsItem,
  YyemsMeal,
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
  return (
    user.preferred_first_name ||
    user.customized_display_name ||
    user.legal_first_name
  );
}

export function ownershipLabel(
  ownershipUserId: string | null,
  users: readonly TyappUser[],
): string {
  if (!ownershipUserId) return 'Shared';
  const user = users.find((u) => u.user_id === ownershipUserId);
  if (!user) return '—';
  return (
    user.preferred_first_name ||
    user.customized_display_name ||
    user.legal_first_name
  );
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
