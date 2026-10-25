import { NgStyle } from '@angular/common';
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
import {
  CG_CUT_DURATION_MS,
  CG_DEFAULT_DURATION_MS,
  CG_SUBTITLE_FONT_LOAD_MS,
  CgSubtitlePreset,
  DEFAULT_SUBTITLE_LAYOUT,
} from './cg.constants';
import { CgLayout, CgSubtitleStyle } from './cg.model';
import {
  primaryFontFamily,
  subtitleLayoutToCss,
  subtitleTextParts,
} from './cg.util';

@Component({
  selector: 'app-cg-subtitle',
  standalone: true,
  imports: [NgStyle],
  templateUrl: './cg-subtitle.html',
  styleUrl: './cg-subtitle.scss',
})
export class CgSubtitle {
  readonly Show = CgSubtitlePreset.Show;
  readonly text = input('');
  readonly layout = input<CgLayout>({ ...DEFAULT_SUBTITLE_LAYOUT });
  readonly durationMs = input(CG_DEFAULT_DURATION_MS);
  readonly preset = input(CgSubtitlePreset.News);
  readonly style = input<CgSubtitleStyle>();

  readonly incoming = signal('');
  readonly outgoing = signal('');
  readonly fading = signal(false);

  readonly effectiveStyle = computed<CgSubtitleStyle>(() => {
    const custom = this.style();
    if (custom) return custom;
    return { preset: this.preset() };
  });

  readonly css = computed(() =>
    subtitleLayoutToCss(this.layout(), this.effectiveStyle()),
  );
  /** OBS CEF drops `background-clip: text` when it arrives through a CSS variable. */
  readonly gradientOn = computed(
    () => this.effectiveStyle().gradientTo !== undefined,
  );
  readonly incomingParts = computed(() => subtitleTextParts(this.incoming()));
  readonly outgoingParts = computed(() => subtitleTextParts(this.outgoing()));

  private fadeId = 0;
  private swapGen = 0;

  constructor() {
    effect(() => {
      const next = this.text();
      const ms = this.durationMs();
      const prev = untracked(() => this.incoming());
      if (next === prev) return;
      const family = untracked(() => this.css()['--cg-sub-font-family']);
      const gen = ++this.swapGen;
      window.clearTimeout(this.fadeId);
      void this.swapText(gen, next, prev, ms, family);
    });
    inject(DestroyRef).onDestroy(() => window.clearTimeout(this.fadeId));
  }

  private async swapText(
    gen: number,
    next: string,
    prev: string,
    ms: number,
    family: string | undefined,
  ): Promise<void> {
    await this.ensureFont(family, next);
    if (gen !== this.swapGen) return;
    if (ms <= CG_CUT_DURATION_MS) {
      this.outgoing.set('');
      this.incoming.set(next);
      this.fading.set(false);
      return;
    }
    this.outgoing.set(prev);
    this.incoming.set(next);
    this.fading.set(true);
    this.fadeId = window.setTimeout(() => {
      this.outgoing.set('');
      this.fading.set(false);
    }, ms);
  }

  private async ensureFont(
    family: string | undefined,
    sample: string,
  ): Promise<void> {
    const name = primaryFontFamily(family);
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
}
