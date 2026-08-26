import { NgClass } from '@angular/common';
import { Component, input } from '@angular/core';
import { DclMoodKey } from './daily-checklist.model';
import { moodClass } from './daily-checklist.util';

@Component({
  selector: 'app-dcl-face',
  standalone: true,
  imports: [NgClass],
  template: `<span
    class="dcl-face"
    [ngClass]="faceClass()"
    [class.size-lg]="size() === 'lg'"
    [class.selected]="selected()"
  ></span>`,
  styleUrl: './daily-checklist-face.scss',
})
export class DailyChecklistFace {
  readonly mood = input<DclMoodKey | null>(null);
  readonly size = input<'sm' | 'lg'>('sm');
  readonly selected = input(false);

  faceClass() {
    return moodClass(this.mood());
  }
}
