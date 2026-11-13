import { Component, computed, input } from '@angular/core';
import { cgNewsVerticalGlyphs } from './cg-news-layout';

/** One vertical cell per laid-out mark. Used by Breaking and upright Ticker. */
@Component({
  selector: 'app-cg-news-glyphs',
  standalone: true,
  templateUrl: './cg-news-glyphs.html',
  styleUrl: './cg-news-glyphs.scss',
})
export class CgNewsGlyphs {
  readonly text = input.required<string>();
  readonly glyphs = computed(() => cgNewsVerticalGlyphs(this.text()));
}
