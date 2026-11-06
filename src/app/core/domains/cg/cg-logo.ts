import { NgStyle } from '@angular/common';
import { Component, computed, input, signal } from '@angular/core';
import { DEFAULT_LOGO_LAYOUT } from './cg.constants';
import { CgLayout } from './cg.model';
import { logoLayoutToCss } from './cg.util';

@Component({
  selector: 'app-cg-logo',
  standalone: true,
  imports: [NgStyle],
  templateUrl: './cg-logo.html',
  styleUrl: './cg-logo.scss',
})
export class CgLogo {
  readonly imageUrl = input('');
  readonly layout = input<CgLayout>({ ...DEFAULT_LOGO_LAYOUT });
  readonly visible = input(true);
  /** Desk-only placement guide — not written to OBS. */
  readonly outline = input(false);

  readonly css = computed(() => logoLayoutToCss(this.layout()));
  readonly hasFixedWidth = computed(
    () => this.layout().width != null && Number.isFinite(this.layout().width),
  );

  /** Image pixel width, known after load. */
  private readonly naturalWidth = signal(0);

  /** Without a stored width the Logo shows at its natural size on the 1920 Stage. */
  readonly imgWidth = computed(() => {
    if (this.hasFixedWidth()) return null;
    return `${this.naturalWidth()}px`;
  });

  onImageLoad(event: Event): void {
    const img = event.target;
    if (img instanceof HTMLImageElement) {
      this.naturalWidth.set(img.naturalWidth);
    }
  }
}
