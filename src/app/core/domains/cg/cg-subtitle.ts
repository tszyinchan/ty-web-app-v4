import { NgStyle } from '@angular/common';
import { Component, computed, input } from '@angular/core';
import { DEFAULT_SUBTITLE_LAYOUT } from './cg.constants';
import { CgLayout } from './cg.model';
import { subtitleLayoutToCss } from './cg.util';

@Component({
  selector: 'app-cg-subtitle',
  standalone: true,
  imports: [NgStyle],
  templateUrl: './cg-subtitle.html',
  styleUrl: './cg-subtitle.scss',
})
export class CgSubtitle {
  readonly text = input('');
  readonly layout = input<CgLayout>({ ...DEFAULT_SUBTITLE_LAYOUT });

  readonly css = computed(() => subtitleLayoutToCss(this.layout()));
}
