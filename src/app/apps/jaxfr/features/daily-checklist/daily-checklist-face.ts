import { Component, computed, input } from '@angular/core';
import { DclMoodKey } from './daily-checklist.model';
import { moodImage } from './daily-checklist.util';

@Component({
  selector: 'app-dcl-face',
  standalone: true,
  template: `
    @if (image(); as src) {
      <img
        class="dcl-glyph"
        [class.size-xs]="size() === 'xs'"
        [class.size-sm]="size() === 'sm'"
        [class.size-lg]="size() === 'lg'"
        [class.selected]="selected()"
        [src]="src"
        alt=""
      />
    } @else {
      <span
        class="dcl-empty"
        [class.size-xs]="size() === 'xs'"
        [class.size-sm]="size() === 'sm'"
        [class.size-lg]="size() === 'lg'"
      ></span>
    }
  `,
  styleUrl: './daily-checklist-face.scss',
})
export class DailyChecklistFace {
  readonly mood = input<DclMoodKey | null>(null);
  readonly size = input<'xs' | 'sm' | 'md' | 'lg'>('md');
  readonly selected = input(false);

  readonly image = computed(() => moodImage(this.mood()));
}
