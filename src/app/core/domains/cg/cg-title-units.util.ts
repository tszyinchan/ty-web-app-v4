import {
  CG_STAGE_REFERENCE_HEIGHT_PX,
  CG_STAGE_REFERENCE_WIDTH_PX,
  CgLayoutUnit,
} from './cg.constants';
import { CgLayout } from './cg.model';

/**
 * Title desk shows px; storage keeps vh (type size) and %/px (Background place).
 * Display converts on the way out, saving converts back. Nothing is written
 * until the operator edits a field.
 */
const PX_PER_VH = CG_STAGE_REFERENCE_HEIGHT_PX / 100;
const PX_PER_PERCENT_X = CG_STAGE_REFERENCE_WIDTH_PX / 100;
const PX_PER_PERCENT_Y = CG_STAGE_REFERENCE_HEIGHT_PX / 100;

/** Stored precision after px -> vh / % (keeps display round-trip within 0.1px). */
const STORE_DECIMALS = 4;
const DISPLAY_DECIMALS = 1;

export function roundDecimals(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/** Type size: stored vh -> display px (1 decimal). */
export function fontVhToDisplayPx(vh: number): number {
  return roundDecimals(vh * PX_PER_VH, DISPLAY_DECIMALS);
}

/** Type size: typed px -> stored vh. */
export function fontPxToStoredVh(px: number): number {
  return roundDecimals(px / PX_PER_VH, STORE_DECIMALS);
}

/** Layout lengths: X and width follow the Stage width, Y and height its height. */
export type CgLayoutLengthKey = 'x' | 'y' | 'width' | 'height';

function pxPerUnit(layout: CgLayout, key: CgLayoutLengthKey): number {
  if (layout.unit === CgLayoutUnit.Pixel) return 1;
  return key === 'x' || key === 'width' ? PX_PER_PERCENT_X : PX_PER_PERCENT_Y;
}

/** Place X / Y: stored (% of stage or px) -> display px (1 decimal). */
export function layoutAxisToDisplayPx(layout: CgLayout, axis: 'x' | 'y'): number {
  return layoutLengthToDisplayPx(layout, axis, layout[axis]);
}

/** Place X / Y: typed px -> stored value in the layout's own unit. */
export function layoutAxisFromDisplayPx(
  layout: CgLayout,
  axis: 'x' | 'y',
  px: number,
): number {
  return layoutLengthFromDisplayPx(layout, axis, px);
}

/** Any layout length (x / y / width / height): stored -> display px (1 decimal). */
export function layoutLengthToDisplayPx(
  layout: CgLayout,
  key: CgLayoutLengthKey,
  stored: number,
): number {
  return roundDecimals(stored * pxPerUnit(layout, key), DISPLAY_DECIMALS);
}

/** Any layout length: typed px -> stored value in the layout's own unit. */
export function layoutLengthFromDisplayPx(
  layout: CgLayout,
  key: CgLayoutLengthKey,
  px: number,
): number {
  return roundDecimals(px / pxPerUnit(layout, key), STORE_DECIMALS);
}
