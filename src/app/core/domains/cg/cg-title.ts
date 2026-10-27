import { NgStyle } from '@angular/common';
import {
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { CgLogo } from './cg-logo';
import {
  CgTitleCardModel,
  CgTitleLineModel,
  defaultTitleStyles,
  titleCards,
  titleLineFit,
} from './cg-title.util';
import { CG_CUT_DURATION_MS, CgTitleStyleKey } from './cg.constants';
import { CgLayerPayload } from './cg.model';
import {
  anchoredBoxCss,
  innerDurationMs,
  subtitleTextParts,
  textPaintToCss,
} from './cg.util';

type TitlePhase = 'in' | 'on' | 'out';

interface TitleHold extends CgTitleCardModel {
  phase: TitlePhase;
}

@Component({
  selector: 'app-cg-title',
  standalone: true,
  imports: [NgStyle, CgLogo],
  templateUrl: './cg-title.html',
  styleUrl: './cg-title.scss',
})
export class CgTitle {
  readonly payload = input.required<CgLayerPayload>();
  readonly outline = input(false);

  readonly holds = signal<TitleHold[]>([]);
  readonly parts = subtitleTextParts;

  private readonly dropTimers = new Map<string, number>();

  constructor() {
    effect(() => {
      const payload = this.payload();
      untracked(() => this.sync(payload));
    });
    inject(DestroyRef).onDestroy(() => {
      for (const timer of this.dropTimers.values()) window.clearTimeout(timer);
      this.dropTimers.clear();
    });
  }

  cueMs(): string {
    return `${innerDurationMs(this.payload())}ms`;
  }

  boxCss(hold: TitleHold): Record<string, string> {
    return anchoredBoxCss(
      { ...hold.textLayout, width: hold.width },
      { scaleAsTransform: false },
    );
  }

  paintCss(hold: TitleHold, key: CgTitleStyleKey): Record<string, string> {
    const styles = this.payload().title?.styles ?? defaultTitleStyles();
    const style = styles[key];
    const scale =
      Number.isFinite(hold.textLayout.scale) && hold.textLayout.scale > 0
        ? hold.textLayout.scale
        : 1;
    const font =
      (style.fontSize != null && style.fontSize > 0 ? style.fontSize : 4.6) * scale;
    return {
      ...textPaintToCss(style),
      '--cg-sub-font': String(font),
    };
  }

  gradientOn(key: CgTitleStyleKey): boolean {
    return this.payload().title?.styles[key]?.gradientTo !== undefined;
  }

  lineFit(hold: TitleHold, line: CgTitleLineModel): number {
    const styles = this.payload().title?.styles ?? defaultTitleStyles();
    const scale =
      Number.isFinite(hold.textLayout.scale) && hold.textLayout.scale > 0
        ? hold.textLayout.scale
        : 1;
    return titleLineFit(hold.width, line, styles, scale);
  }

  private sync(payload: CgLayerPayload): void {
    const ms = innerDurationMs(payload);
    const desired = payload.title ? titleCards(payload.title) : [];
    const desiredByKey = new Map(desired.map((card) => [card.key, card]));
    const current = this.holds();
    const next: TitleHold[] = [];
    const seen = new Set<string>();

    for (const hold of current) {
      const fresh = desiredByKey.get(hold.key);
      if (fresh) {
        this.cancelDrop(hold.key);
        const phase: TitlePhase = hold.phase === 'out' ? 'in' : hold.phase;
        next.push({ ...fresh, phase: ms <= CG_CUT_DURATION_MS ? 'on' : phase });
        if (phase === 'in' && ms > CG_CUT_DURATION_MS) this.scheduleIn(hold.key);
        seen.add(hold.key);
        continue;
      }
      if (hold.phase === 'out') {
        next.push(hold);
        continue;
      }
      if (ms <= CG_CUT_DURATION_MS) {
        this.cancelDrop(hold.key);
        continue;
      }
      next.push({ ...hold, phase: 'out' });
      this.scheduleDrop(hold.key, ms);
    }

    for (const card of desired) {
      if (seen.has(card.key)) continue;
      const phase: TitlePhase = ms <= CG_CUT_DURATION_MS ? 'on' : 'in';
      next.push({ ...card, phase });
      if (phase === 'in') this.scheduleIn(card.key);
    }

    this.holds.set(next);
  }

  private scheduleIn(key: string): void {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        this.holds.update((list) =>
          list.map((hold) =>
            hold.key === key && hold.phase === 'in' ? { ...hold, phase: 'on' } : hold,
          ),
        );
      });
    });
  }

  private scheduleDrop(key: string, ms: number): void {
    this.cancelDrop(key);
    const timer = window.setTimeout(() => {
      this.dropTimers.delete(key);
      this.holds.update((list) =>
        list.filter((hold) => !(hold.key === key && hold.phase === 'out')),
      );
    }, ms);
    this.dropTimers.set(key, timer);
  }

  private cancelDrop(key: string): void {
    const timer = this.dropTimers.get(key);
    if (timer === undefined) return;
    window.clearTimeout(timer);
    this.dropTimers.delete(key);
  }
}
