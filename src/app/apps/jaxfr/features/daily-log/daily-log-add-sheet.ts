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
import 'emoji-picker-element';

import {
  DL_COLOUR_PRESETS,
  DlColourPresetKey,
} from './daily-log.model';
import { colourClass } from './daily-log.util';
import { DailyLogIcon } from './daily-log-icon';

@Component({
  selector: 'app-daily-log-add-sheet',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    DailyLogIcon,
  ],
  templateUrl: './daily-log-add-sheet.html',
  styleUrl: './daily-log-add-sheet.scss',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class DailyLogAddSheet implements OnInit {
  readonly colourPresets = DL_COLOUR_PRESETS;
  readonly initialName = input.required<string>();
  readonly busy = input(false);

  readonly confirmed = output<{
    itemText: string;
    emoji: string | null;
    colourPresetKey: DlColourPresetKey;
    remarks: string | null;
  }>();
  readonly cancelled = output<void>();

  itemText = '';
  emoji: string | null = null;
  colour: DlColourPresetKey = 'slate';
  remarks = '';
  showEmojiPicker = signal(false);

  ngOnInit() {
    this.itemText = this.initialName();
  }

  colourChipClasses(key: DlColourPresetKey, selected: boolean): string[] {
    const classes = [colourClass(key)];
    if (selected) classes.push('selected');
    return classes;
  }

  selectColour(key: DlColourPresetKey) {
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
