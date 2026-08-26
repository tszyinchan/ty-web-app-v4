import { Component, computed, input } from '@angular/core';
import { DclMoodKey } from './daily-checklist.model';
import { moodEmoji } from './daily-checklist.util';

@Component({
  selector: 'app-dcl-face',
  standalone: true,
  template: `
    @if (glyph(); as emoji) {
      <span
        class="dcl-glyph"
        [class.size-sm]="size() === 'sm'"
        [class.size-lg]="size() === 'lg'"
        [class.selected]="selected()"
        >{{ emoji }}</span
      >
    } @else {
      <span
        class="dcl-empty"
        [class.size-sm]="size() === 'sm'"
        [class.size-lg]="size() === 'lg'"
      ></span>
    }
  `,
  styleUrl: './daily-checklist-face.scss',
})
export class DailyChecklistFace {
  readonly mood = input<DclMoodKey | null>(null);
  readonly size = input<'sm' | 'md' | 'lg'>('md');
  readonly selected = input(false);

  readonly glyph = computed(() => moodEmoji(this.mood()));
}
