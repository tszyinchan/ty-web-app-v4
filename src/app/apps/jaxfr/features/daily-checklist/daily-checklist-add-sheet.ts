import { CommonModule } from '@angular/common';
import {
  Component,
  CUSTOM_ELEMENTS_SCHEMA,
  OnInit,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import 'emoji-picker-element';

import {
  DCL_COLOUR_PRESETS,
  DclColourPresetKey,
} from './daily-checklist.model';
import { colourClass } from './daily-checklist.util';

@Component({
  selector: 'app-daily-checklist-add-sheet',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  templateUrl: './daily-checklist-add-sheet.html',
  styleUrl: './daily-checklist-add-sheet.scss',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class DailyChecklistAddSheet implements OnInit {
  readonly colourPresets = DCL_COLOUR_PRESETS;
  readonly initialName = input.required<string>();
  readonly busy = input(false);

  readonly confirmed = output<{
    itemText: string;
    emoji: string | null;
    colourPresetKey: DclColourPresetKey;
    remarks: string | null;
  }>();
  readonly cancelled = output<void>();

  itemText = '';
  emoji: string | null = null;
  colour: DclColourPresetKey = 'slate';
  remarks = '';
  showEmojiPicker = signal(false);

  ngOnInit() {
    this.itemText = this.initialName();
  }

  colourChipClasses(key: DclColourPresetKey, selected: boolean): string[] {
    const classes = [colourClass(key)];
    if (selected) classes.push('selected');
    return classes;
  }

  selectColour(key: DclColourPresetKey) {
    this.colour = key;
  }

  openEmojiPicker() {
    this.showEmojiPicker.set(true);
  }

  closeEmojiPicker() {
    this.showEmojiPicker.set(false);
  }

  onPickerEmoji(event: Event) {
    const unicode = (event as CustomEvent<{ unicode?: string }>).detail?.unicode;
    const next = unicode?.trim() ?? '';
    if (next) this.emoji = next;
    this.closeEmojiPicker();
  }

  clearEmoji() {
    this.emoji = null;
  }

  confirm() {
    const text = this.itemText.trim();
    if (!text || this.busy()) return;
    this.confirmed.emit({
      itemText: text,
      emoji: this.emoji,
      colourPresetKey: this.colour,
      remarks: this.remarks,
    });
  }

  cancel() {
    this.cancelled.emit();
  }
}
