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

function pxPerUnit(layout: CgLayout, axis: 'x' | 'y'): number {
  if (layout.unit === CgLayoutUnit.Pixel) return 1;
  return axis === 'x' ? PX_PER_PERCENT_X : PX_PER_PERCENT_Y;
}

/** Background place X / Y: stored (% of stage or px) -> display px (1 decimal). */
export function layoutAxisToDisplayPx(layout: CgLayout, axis: 'x' | 'y'): number {
  return roundDecimals(layout[axis] * pxPerUnit(layout, axis), DISPLAY_DECIMALS);
}

/** Background place X / Y: typed px -> stored value in the layout's own unit. */
export function layoutAxisFromDisplayPx(
  layout: CgLayout,
  axis: 'x' | 'y',
  px: number,
): number {
  return roundDecimals(px / pxPerUnit(layout, axis), STORE_DECIMALS);
}
