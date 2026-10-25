import { NgStyle } from '@angular/common';
import { Component, computed, input } from '@angular/core';
import { DEFAULT_CLOCK_LAYOUT } from './cg.constants';
import { CgLayout, CgSubtitleStyle } from './cg.model';
import { defaultBugStyle, subtitleTextParts, textBoxLayoutToCss } from './cg.util';

@Component({
  selector: 'app-cg-text-box',
  standalone: true,
  imports: [NgStyle],
  templateUrl: './cg-text-box.html',
  styleUrl: './cg-text-box.scss',
})
export class CgTextBox {
  readonly text = input('');
  readonly layout = input<CgLayout>({ ...DEFAULT_CLOCK_LAYOUT });
  readonly style = input<CgSubtitleStyle>(defaultBugStyle());

  /** Method, not computed: the desk mutates `style` in place. */
  rowCss(): Record<string, string> {
    return textBoxLayoutToCss(this.layout(), this.style());
  }

  gradientOn(): boolean {
    return this.style().gradientTo !== undefined;
  }
  readonly parts = computed(() => subtitleTextParts(this.text()));
}
