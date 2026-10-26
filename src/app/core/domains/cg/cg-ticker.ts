import { NgStyle } from '@angular/common';
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
  nextNewsItem,
  primaryFontFamily,
  subtitleTextParts,
  tickerWindowCss,
} from './cg.util';

interface TickerEntry {
  key: number;
  id: string;
  text: string;
  x: number;
}

@Component({
  selector: 'app-cg-ticker',
  standalone: true,
  imports: [NgStyle, CgLogo],
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
  readonly backgroundUrl = computed(
    () => this.payload().background?.imageUrl ?? '',
  );
  readonly backgroundLayout = computed(
    () => this.payload().background?.layout ?? { ...DEFAULT_TICKER_BACKGROUND_LAYOUT },
  );

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly windowRef = viewChild<ElementRef<HTMLElement>>('window');
  private readonly itemEls = viewChildren<ElementRef<HTMLElement>>('item');

  private paused = false;
  private running = false;
  private raf = 0;
  private lastFrame = 0;
  private spawnKey = 0;
  private lastId: string | null = null;
  private lastIndex = -1;
  private previousIds: string[] = [];
  private fontsLoaded = false;

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
    this.lastId = null;
    this.lastIndex = -1;
    this.previousIds = [];
    this.lastFrame = 0;
    this.ensureLoop();
  }

  private ensureLoop(): void {
    if (this.running || this.paused || !this.visible()) return;
    if (!this.fontsLoaded) void this.prepareFont();
    this.running = true;
    this.lastFrame = 0;
    this.raf = requestAnimationFrame(this.frame);
  }

  private async prepareFont(): Promise<void> {
    const sample =
      (this.payload().items ?? []).find((item) => item.enabled && item.text)?.text ??
      '新聞';
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

  private readonly frame = (now: number): void => {
    if (!this.running || this.paused || !this.visible()) {
      this.running = false;
      return;
    }
    const windowEl = this.windowRef()?.nativeElement;
    const windowW = windowEl?.clientWidth ?? 0;
    if (!windowEl || windowW <= 0) {
      this.raf = requestAnimationFrame(this.frame);
      return;
    }
    const dt = this.lastFrame
      ? Math.min(0.05, (now - this.lastFrame) / 1000)
      : 0;
    this.lastFrame = now;
    const stageW = this.host.nativeElement.clientWidth || windowW;
    const speed = (this.payload().ticker ?? emptyTickerSettings()).speed;
    const px = stageW * (speed / 100) * dt;
    const items = this.payload().items ?? [];

    const widths = new Map<number, number>();
    for (const el of this.itemEls()) {
      const key = Number(el.nativeElement.dataset['key']);
      if (Number.isFinite(key)) widths.set(key, el.nativeElement.offsetWidth);
    }

    let entries = this.entries().map((entry) => {
      const live = items.find((item) => item.id === entry.id);
      return {
        ...entry,
        text: live ? live.text : entry.text,
        x: entry.x - px,
      };
    });
    entries = entries.filter((entry) => {
      if (!widths.has(entry.key)) return true;
      return entry.x + (widths.get(entry.key) ?? 0) > 0;
    });

    let tail = Number.NEGATIVE_INFINITY;
    for (const entry of entries) {
      tail = Math.max(tail, entry.x + (widths.get(entry.key) ?? 0));
    }
    if (this.fontsLoaded && tail < windowW) {
      const next = nextNewsItem(items, this.lastId, this.lastIndex, this.previousIds);
      if (next) {
        this.lastId = next.item.id;
        this.lastIndex = next.index;
        this.previousIds = items.map((item) => item.id);
        entries = [
          ...entries,
          {
            key: (this.spawnKey += 1),
            id: next.item.id,
            text: next.item.text,
            x: windowW,
          },
        ];
      }
    }

    if (entries.length === 0) {
      if (!this.fontsLoaded) {
        this.raf = requestAnimationFrame(this.frame);
        return;
      }
      this.entries.set([]);
      this.running = false;
      return;
    }
    this.entries.set(entries);
    this.raf = requestAnimationFrame(this.frame);
  };
}
