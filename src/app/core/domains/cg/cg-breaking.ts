import { NgStyle, NgTemplateOutlet } from '@angular/common';
import {
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { CgLogo } from './cg-logo';
import {
  CG_CUT_DURATION_MS,
  CG_SUBTITLE_FONT_LOAD_MS,
  DEFAULT_BREAKING_BACKGROUND_LAYOUT,
  DEFAULT_BREAKING_LAYOUT,
} from './cg.constants';
import { CgLayerPayload, CgLayout } from './cg.model';
import {
  breakingFontCqh,
  breakingWindowCss,
  defaultBreakingStyle,
  emptyBreakingSettings,
  innerDurationMs,
  newsCharCount,
  newsItemsKey,
  nextNewsItem,
  primaryFontFamily,
} from './cg.util';

interface NewsHold {
  id: string;
  text: string;
}

@Component({
  selector: 'app-cg-breaking',
  standalone: true,
  imports: [NgStyle, NgTemplateOutlet, CgLogo],
  templateUrl: './cg-breaking.html',
  styleUrl: './cg-breaking.scss',
})
export class CgBreaking {
  readonly layout = input<CgLayout>({ ...DEFAULT_BREAKING_LAYOUT });
  readonly payload = input.required<CgLayerPayload>();
  readonly outline = input(false);
  readonly visible = input(true);

  readonly shown = signal<NewsHold | null>(null);
  readonly outgoing = signal<NewsHold | null>(null);
  readonly fading = signal(false);

  readonly textStyle = computed(
    () => this.payload().style ?? defaultBreakingStyle(),
  );
  readonly seconds = computed(
    () => (this.payload().breaking ?? emptyBreakingSettings()).secondsPerItem,
  );
  readonly itemsKey = computed(() => newsItemsKey(this.payload().items));
  readonly backgroundUrl = computed(
    () => this.payload().background?.imageUrl ?? '',
  );
  readonly backgroundLayout = computed(
    () => this.payload().background?.layout ?? { ...DEFAULT_BREAKING_BACKGROUND_LAYOUT },
  );

  private paused = false;
  private gen = 0;
  private timer = 0;
  private fadeTimer = 0;
  private armedSeconds = 0;
  private pending = false;
  private lastId: string | null = null;
  private lastIndex = -1;
  private previousIds: string[] = [];

  constructor() {
    effect(() => {
      const visible = this.visible();
      untracked(() => this.setVisible(visible));
    });
    effect(() => {
      const seconds = this.seconds();
      const key = this.itemsKey();
      void key;
      untracked(() => this.onContent(seconds));
    });
    inject(DestroyRef).onDestroy(() => {
      this.gen += 1;
      this.haltTimers();
    });
  }

  glyphs(text: string): string[] {
    return [...text].map((ch) => (ch === ' ' ? '\u00a0' : ch));
  }

  gradientOn(): boolean {
    return this.textStyle().gradientTo !== undefined;
  }

  windowCss(): Record<string, string> {
    const count = Math.max(
      newsCharCount(this.shown()?.text ?? ''),
      newsCharCount(this.outgoing()?.text ?? ''),
      1,
    );
    const css = breakingWindowCss(
      this.layout(),
      this.textStyle(),
      breakingFontCqh(this.layout(), this.textStyle(), count),
    );
    css['--cg-cue-ms'] = `${this.fadeMs()}ms`;
    return css;
  }

  private fadeMs(): number {
    return innerDurationMs(this.payload());
  }

  private setVisible(visible: boolean): void {
    if (!visible) {
      this.pause();
      return;
    }
    if (this.paused) {
      this.paused = false;
      this.gen += 1;
      this.haltTimers();
      this.shown.set(null);
      this.outgoing.set(null);
      this.fading.set(false);
      this.lastId = null;
      this.lastIndex = -1;
      this.previousIds = [];
      this.armedSeconds = 0;
    }
    this.onContent(this.seconds());
  }

  private pause(): void {
    if (this.paused) return;
    this.paused = true;
    this.gen += 1;
    this.haltTimers();
  }

  private onContent(seconds: number): void {
    if (!this.visible() || this.paused) return;
    const shown = this.shown();
    if (!shown) {
      this.arm(seconds, true);
      return;
    }
    const live = (this.payload().items ?? []).find((item) => item.id === shown.id);
    if (live && live.text !== shown.text) {
      this.shown.set({ id: live.id, text: live.text });
    }
    if (this.armedSeconds !== seconds) this.arm(seconds, false);
  }

  private arm(seconds: number, immediate: boolean): void {
    window.clearTimeout(this.timer);
    this.armedSeconds = seconds;
    const gen = this.gen;
    this.timer = window.setTimeout(() => {
      if (this.pending || gen !== this.gen) return;
      void this.advance(gen);
    }, immediate ? 0 : Math.max(0, seconds) * 1000);
  }

  private async advance(gen: number): Promise<void> {
    if (gen !== this.gen || !this.visible() || this.paused || this.pending) return;
    this.pending = true;
    try {
      const items = this.payload().items ?? [];
      const next = nextNewsItem(items, this.lastId, this.lastIndex, this.previousIds);
      if (!next) {
        if (this.shown()) await this.swapTo(gen, null);
        return;
      }
      const shown = this.shown();
      if (shown && shown.id === next.item.id) {
        if (shown.text !== next.item.text) {
          this.shown.set({ id: next.item.id, text: next.item.text });
        }
        this.previousIds = items.map((item) => item.id);
        if (gen !== this.gen) return;
        this.arm(this.seconds(), false);
        return;
      }
      this.lastId = next.item.id;
      this.lastIndex = next.index;
      this.previousIds = items.map((item) => item.id);
      await this.swapTo(gen, { id: next.item.id, text: next.item.text });
      if (gen !== this.gen || !this.visible() || this.paused) return;
      const live = (this.payload().items ?? []).find((item) => item.id === next.item.id);
      if (live && this.shown()?.id === live.id && this.shown()?.text !== live.text) {
        this.shown.set({ id: live.id, text: live.text });
      }
      this.arm(this.seconds(), false);
    } finally {
      this.pending = false;
    }
  }

  private async swapTo(gen: number, next: NewsHold | null): Promise<void> {
    await this.ensureFont(next?.text ?? this.shown()?.text ?? '');
    if (gen !== this.gen) return;
    const prev = this.shown();
    if (!prev || this.fadeMs() <= CG_CUT_DURATION_MS) {
      this.outgoing.set(null);
      this.fading.set(false);
      this.shown.set(next);
      return;
    }
    this.outgoing.set(prev);
    this.shown.set(next);
    this.fading.set(true);
    await new Promise<void>((resolve) => {
      this.fadeTimer = window.setTimeout(resolve, this.fadeMs());
    });
    if (gen !== this.gen) return;
    this.outgoing.set(null);
    this.fading.set(false);
  }

  private async ensureFont(sample: string): Promise<void> {
    const name = primaryFontFamily(this.textStyle().fontFamily);
    if (!name || !sample || !document.fonts?.load) return;
    try {
      await Promise.race([
        document.fonts.load(`24px "${name}"`, sample),
        new Promise<void>((resolve) =>
          window.setTimeout(resolve, CG_SUBTITLE_FONT_LOAD_MS),
        ),
      ]);
    } catch {
      return;
    }
  }

  private haltTimers(): void {
    window.clearTimeout(this.timer);
    window.clearTimeout(this.fadeTimer);
  }
}
