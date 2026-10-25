import {
  Directive,
  booleanAttribute,
  inject,
  input,
  numberAttribute,
  output,
} from '@angular/core';
import { NgControl } from '@angular/forms';

const GRID_EPSILON = 1e-6;

function optionalNumber(value: unknown): number | null {
  return value == null || value === '' ? null : Number(value);
}

function decimalsOf(value: number): number {
  const text = String(value);
  const dot = text.indexOf('.');
  return dot < 0 ? 0 : text.length - dot - 1;
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * Next value for one wheel notch. Off-grid values (e.g. 0.104 with step 0.01)
 * snap to the next grid line first, then move one step per notch.
 * `wrap` treats [min, max) as a circle (angles). Returns `null` when the
 * value would not change (so callers skip a pointless write).
 */
export function wheelStepValue(
  current: number,
  direction: 1 | -1,
  step: number,
  min: number | null,
  max: number | null,
  wrap: boolean,
): number | null {
  const decimals = Math.max(decimalsOf(step), decimalsOf(current));
  const start = Number.isFinite(current) ? current : (min ?? 0);
  const quotient = start / step;
  const onGrid = Math.abs(quotient - Math.round(quotient)) < GRID_EPSILON;
  const steps = onGrid
    ? Math.round(quotient) + direction
    : direction > 0
      ? Math.ceil(quotient)
      : Math.floor(quotient);
  let next = roundTo(steps * step, decimals);

  if (wrap && min != null && max != null && max > min) {
    const span = max - min;
    next = roundTo(min + ((((next - min) % span) + span) % span), decimals);
  } else {
    if (min != null && next < min) next = min;
    if (max != null && next > max) next = max;
  }
  return Number.isFinite(current) && next === current ? null : next;
}

/**
 * Mouse wheel on a number input (hover is enough). Up = increase.
 * Alt = fine step, Shift = coarse step. Reads the current value from the
 * bound ngModel and emits the next one; the component writes the model.
 * Static `step` / `min` / `max` attributes on the input are used as limits.
 */
@Directive({
  selector: 'input[appCgWheel]',
  standalone: true,
  host: { '(wheel)': 'onWheel($event)' },
})
export class CgWheelStep {
  private readonly control = inject(NgControl, { self: true, optional: true });

  readonly step = input(1, { transform: numberAttribute });
  readonly min = input<number | null, unknown>(null, { transform: optionalNumber });
  readonly max = input<number | null, unknown>(null, { transform: optionalNumber });
  /** Lower bound for the wheel only (typed input keeps its own `min`). */
  readonly appCgWheelMin = input<number | null>(null);
  readonly appCgWheelFine = input<number | null>(null);
  readonly appCgWheelCoarse = input<number | null>(null);
  readonly appCgWheelWrap = input(false, { transform: booleanAttribute });
  readonly appCgWheelChange = output<number>();

  protected onWheel(event: WheelEvent): void {
    event.preventDefault();
    // Windows Chrome moves the wheel delta to deltaX while Shift is held.
    const delta = event.deltaY || event.deltaX;
    if (!delta) return;
    const base = this.step();
    let step = base;
    if (event.altKey) {
      step = this.appCgWheelFine() ?? Number((base / 10).toPrecision(6));
    } else if (event.shiftKey) {
      step = this.appCgWheelCoarse() ?? Number((base * 10).toPrecision(6));
    }
    const raw = this.control?.value;
    const current =
      raw === null || raw === undefined || raw === '' ? Number.NaN : Number(raw);
    const next = wheelStepValue(
      current,
      delta < 0 ? 1 : -1,
      step,
      this.appCgWheelMin() ?? this.min(),
      this.max(),
      this.appCgWheelWrap(),
    );
    if (next === null) return;
    this.appCgWheelChange.emit(next);
  }
}

/**
 * Mouse wheel on a dropdown (hover is enough). Down = next option, stops at
 * both ends. `cgWheelSelect` is the ordered list of values the wheel may
 * reach (leave out options with side effects, e.g. "Other…").
 */
@Directive({
  selector: 'select[appCgWheelSelect]',
  standalone: true,
  host: { '(wheel)': 'onWheel($event)' },
})
export class CgWheelSelect {
  private readonly control = inject(NgControl, { self: true, optional: true });

  readonly appCgWheelSelect = input.required<readonly string[]>();
  readonly appCgWheelChange = output<string>();

  protected onWheel(event: WheelEvent): void {
    event.preventDefault();
    const delta = event.deltaY || event.deltaX;
    if (!delta) return;
    const values = this.appCgWheelSelect();
    if (values.length === 0) return;
    const index = values.indexOf(String(this.control?.value ?? ''));
    const down = delta > 0;
    let nextIndex: number;
    if (index < 0) {
      nextIndex = down ? 0 : values.length - 1;
    } else {
      nextIndex = Math.min(values.length - 1, Math.max(0, index + (down ? 1 : -1)));
    }
    if (nextIndex === index) return;
    this.appCgWheelChange.emit(values[nextIndex]);
  }
}
