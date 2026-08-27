import { Component, computed, input } from '@angular/core';
import { DlMoodKey } from './daily-log.model';
import { moodImage } from './daily-log.util';

@Component({
  selector: 'app-daily-log-face',
  standalone: true,
  template: `
    @if (image(); as src) {
      <img
        class="dl-glyph"
        [class.size-xs]="size() === 'xs'"
        [class.size-sm]="size() === 'sm'"
        [class.size-lg]="size() === 'lg'"
        [class.selected]="selected()"
        [src]="src"
        alt=""
      />
    } @else {
      <span
        class="dl-empty"
        [class.size-xs]="size() === 'xs'"
        [class.size-sm]="size() === 'sm'"
        [class.size-lg]="size() === 'lg'"
      ></span>
    }
  `,
  styleUrl: './daily-log-face.scss',
})
export class DailyLogFace {
  readonly mood = input<DlMoodKey | null>(null);
  readonly size = input<'xs' | 'sm' | 'md' | 'lg'>('md');
  readonly selected = input(false);

  readonly image = computed(() => moodImage(this.mood()));
}
