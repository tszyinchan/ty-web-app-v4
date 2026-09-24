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
  CgSubtitlePreset,
  DEFAULT_SUBTITLE_LAYOUT,
} from './cg.constants';
import { CgLayout } from './cg.model';
import { subtitleLayoutToCss, subtitleTextParts } from './cg.util';

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

  readonly incoming = signal('');
  readonly outgoing = signal('');
  readonly fading = signal(false);

  readonly css = computed(() =>
    subtitleLayoutToCss(this.layout(), this.preset()),
  );
  readonly incomingParts = computed(() => subtitleTextParts(this.incoming()));
  readonly outgoingParts = computed(() => subtitleTextParts(this.outgoing()));

  private fadeId = 0;

  constructor() {
    effect(() => {
      const next = this.text();
      const ms = this.durationMs();
      const prev = untracked(() => this.incoming());
      if (next === prev) return;
      window.clearTimeout(this.fadeId);
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
    });
    inject(DestroyRef).onDestroy(() => window.clearTimeout(this.fadeId));
  }
}
