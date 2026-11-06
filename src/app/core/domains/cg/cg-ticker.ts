import { NgStyle, NgTemplateOutlet } from '@angular/common';
import {
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
  viewChildren,
} from '@angular/core';
import { CgLogo } from './cg-logo';
import {
  CG_SUBTITLE_FONT_LOAD_MS,
  DEFAULT_TICKER_BACKGROUND_LAYOUT,
  DEFAULT_TICKER_LAYOUT,
} from './cg.constants';
import { CgLayerPayload, CgLayout } from './cg.model';
import {
  defaultTickerStyle,
  emptyTickerSettings,
  newsItemsKey,
  playableNewsItems,
  primaryFontFamily,
  subtitleTextParts,
  tickerBeltPosition,
  tickerBeltSlot,
  tickerWindowCss,
} from './cg.util';

/** Rounding slack when the next line should sit flush against the tail. */
const TICKER_FLUSH_PX = 1;
/** Upper bound on lines spawned in one frame (filling an empty window). */
const TICKER_MAX_SPAWN_PER_FRAME = 64;

interface TickerEntry {
  key: number;
  id: string;
  text: string;
  /** Belt coordinate of the left edge: x = window width + anchor - belt. */
  anchor: number;
  /** Width including the gap, so the next line starts flush. */
  width: number;
  x: number;
}

/**
 * Endless right-to-left belt on the shared wall clock (`tickerBeltPosition`).
 * New lines take the slot the virtual belt (playable lines in queue order)
 * has at the window's right edge, so every viewer with the same queue shows
 * the same frame. Lines already on screen keep moving until they leave, even
 * after an edit; a viewer that just loaded joins the virtual belt directly.
 */
@Component({
  selector: 'app-cg-ticker',
  standalone: true,
  imports: [NgStyle, NgTemplateOutlet, CgLogo],
  templateUrl: './cg-ticker.html',
  styleUrl: './cg-ticker.scss',
})
export class CgTicker {
  readonly layout = input<CgLayout>({ ...DEFAULT_TICKER_LAYOUT });
  readonly payload = input.required<CgLayerPayload>();
  readonly outline = input(false);
  readonly visible = input(true);

  readonly entries = signal<TickerEntry[]>([]);

  readonly textStyle = computed(() => this.payload().style ?? defaultTickerStyle());
  readonly settings = computed(
    () => this.payload().ticker ?? emptyTickerSettings(),
  );
  readonly itemsKey = computed(() => newsItemsKey(this.payload().items));
  readonly playable = computed(() => playableNewsItems(this.payload().items));
  readonly backgroundUrl = computed(
    () => this.payload().background?.imageUrl ?? '',
  );
  readonly backgroundLayout = computed(
    () => this.payload().background?.layout ?? { ...DEFAULT_TICKER_BACKGROUND_LAYOUT },
  );

  private readonly windowRef = viewChild<ElementRef<HTMLElement>>('window');
  private readonly itemEls = viewChildren<ElementRef<HTMLElement>>('item');
  private readonly measureEls = viewChildren<ElementRef<HTMLElement>>('measure');

  private paused = false;
  private running = false;
  private raf = 0;
  private spawnKey = 0;
  private fontsLoaded = false;
  private lastSpeed = 0;
  private lastWindowWidth = 0;

  constructor() {
    effect(() => {
      const visible = this.visible();
      untracked(() => this.setVisible(visible));
    });
    effect(() => {
      const key = this.itemsKey();
      void key;
      untracked(() => {
        if (this.visible() && !this.paused) this.ensureLoop();
      });
    });
    inject(DestroyRef).onDestroy(() => this.stop());
  }

  parts(text: string): ReadonlyArray<{ text: string; latin: boolean }> {
    return subtitleTextParts(text);
  }

  gradientOn(): boolean {
    return this.textStyle().gradientTo !== undefined;
  }

  windowCss(): Record<string, string> {
    return tickerWindowCss(this.layout(), this.textStyle(), this.settings());
  }

  private setVisible(visible: boolean): void {
    if (!visible) {
      this.pause();
      return;
    }
    if (this.paused) this.resume();
    else this.ensureLoop();
  }

  private pause(): void {
    if (this.paused) return;
    this.paused = true;
    this.stop();
  }

  private resume(): void {
    this.paused = false;
    this.entries.set([]);
    this.ensureLoop();
  }

  private ensureLoop(): void {
    if (this.running || this.paused || !this.visible()) return;
    if (!this.fontsLoaded) void this.prepareFont();
    this.running = true;
    this.raf = requestAnimationFrame(this.frame);
  }

  private async prepareFont(): Promise<void> {
    const sample = this.playable()[0]?.text ?? '新聞';
    const name = primaryFontFamily(this.textStyle().fontFamily);
    if (name && document.fonts?.load) {
      try {
        await Promise.race([
          document.fonts.load(`24px "${name}"`, sample),
          new Promise<void>((resolve) =>
            window.setTimeout(resolve, CG_SUBTITLE_FONT_LOAD_MS),
          ),
        ]);
      } catch {
        /* show with the fallback face */
      }
    }
    this.fontsLoaded = true;
  }

  private stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  private widthsBy(
    els: readonly ElementRef<HTMLElement>[],
    attr: 'id' | 'key',
  ): Map<string, number> {
    const widths = new Map<string, number>();
    for (const el of els) {
      const key = el.nativeElement.dataset[attr];
      if (key) widths.set(key, el.nativeElement.offsetWidth);
    }
    return widths;
  }

  private readonly frame = (): void => {
    if (!this.running || this.paused || !this.visible()) {
      this.running = false;
      return;
    }
    const windowEl = this.windowRef()?.nativeElement;
    const windowWidth = windowEl?.clientWidth ?? 0;
    if (!windowEl || windowWidth <= 0) {
      this.raf = requestAnimationFrame(this.frame);
      return;
    }

    const speed = this.settings().speed;
    const belt = tickerBeltPosition(Date.now(), speed);
    // Speed or window width changed: lines on screen stay where they are and
    // the next new line rejoins the shared belt.
    const rebase =
      speed !== this.lastSpeed || windowWidth !== this.lastWindowWidth;
    this.lastSpeed = speed;
    this.lastWindowWidth = windowWidth;

    const items = this.payload().items ?? [];
    const playable = this.playable();
    const measured = this.widthsBy(this.measureEls(), 'id');
    const rendered = this.widthsBy(this.itemEls(), 'key');

    const entries = this.entries()
      .map((entry) => {
        const live = items.find((item) => item.id === entry.id);
        const width =
          (live ? measured.get(entry.id) : undefined) ||
          rendered.get(String(entry.key)) ||
          entry.width;
        const anchor = rebase ? entry.x - windowWidth + belt : entry.anchor;
        return {
          ...entry,
          text: live ? live.text : entry.text,
          width,
          anchor,
          x: windowWidth + anchor - belt,
        };
      })
      .filter((entry) => entry.x + entry.width > 0);

    if (this.fontsLoaded && playable.length > 0) {
      const widths = playable.map((item) => measured.get(item.id) ?? 0);
      let tail = entries.length
        ? Math.max(...entries.map((entry) => entry.x + entry.width))
        : Number.NEGATIVE_INFINITY;
      for (
        let spawned = 0;
        spawned < TICKER_MAX_SPAWN_PER_FRAME && tail < windowWidth;
        spawned += 1
      ) {
        const slot = Number.isFinite(tail)
          ? tickerBeltSlot(widths, belt, windowWidth, tail - TICKER_FLUSH_PX, 'left-from')
          : tickerBeltSlot(widths, belt, windowWidth, 0, 'right-past');
        if (!slot) break;
        const line = playable[slot.index];
        const width = widths[slot.index];
        entries.push({
          key: (this.spawnKey += 1),
          id: line.id,
          text: line.text,
          anchor: slot.x - windowWidth + belt,
          width,
          x: slot.x,
        });
        tail = slot.x + width;
      }
    }

    this.entries.set(entries);
    if (entries.length === 0 && this.fontsLoaded && playable.length === 0) {
      this.running = false;
      return;
    }
    this.raf = requestAnimationFrame(this.frame);
  };
}
