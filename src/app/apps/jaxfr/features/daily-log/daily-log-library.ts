import { CommonModule } from '@angular/common';
import {
  Component,
  CUSTOM_ELEMENTS_SCHEMA,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import 'emoji-picker-element';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';

import { HeaderService } from '../../../../core/services/header.service';
import {
  DL_COLOUR_PRESETS,
  DailyLogLibraryItem,
  DlColourPresetKey,
} from './daily-log.model';
import { DailyLogChrome, DailyLogChromeAction } from './daily-log-chrome';
import { DailyLogService } from './daily-log.service';
import { colourClass, findLibraryItemByName } from './daily-log.util';

@Component({
  selector: 'app-daily-log-library',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    DailyLogChrome,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
  ],
  templateUrl: './daily-log-library.html',
  styleUrl: './daily-log-template.scss',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class DailyLogLibrary implements OnInit, OnDestroy {
  readonly service = inject(DailyLogService);
  private headerService = inject(HeaderService);

  readonly colourPresets = DL_COLOUR_PRESETS;
  colourClass = colourClass;

  emojiPickerTarget = signal<'new' | 'edit' | null>(null);
  newItemText = signal('');
  newEmoji = signal<string | null>(null);
  newColour = signal<DlColourPresetKey>('slate');
  editingId = signal<string | null>(null);
  editText = '';
  editEmoji: string | null = null;
  editColour: DlColourPresetKey = 'slate';

  readonly showNewItemExtras = computed(() => {
    const text = this.newItemText().trim();
    if (!text) return false;
    return !findLibraryItemByName(this.service.libraryItems(), text);
  });

  readonly nameTaken = computed(() => {
    const text = this.newItemText().trim();
    if (!text) return false;
    return !!findLibraryItemByName(this.service.libraryItems(), text);
  });

  readonly chromeActions = computed<DailyLogChromeAction[]>(() => [
    {
      label: 'Refresh',
      icon: 'refresh',
      disabled: this.service.libraryLoading() || this.service.busy(),
      onClick: () => void this.onRefresh(),
    },
  ]);

  ngOnInit() {
    this.headerService.clear();

    void this.service.fetchLibraryItems();
    void this.service.fetchLibraryDayCounts(true);
  }

  ngOnDestroy() {
    this.headerService.clear();
  }

  colourChipClasses(key: DlColourPresetKey, selected: boolean): string[] {
    const classes = [colourClass(key)];
    if (selected) classes.push('selected');
    return classes;
  }

  async onRefresh() {
    await this.service.fetchLibraryItems(true);
    await this.service.fetchLibraryDayCounts(true);
  }

  usageLabel(item: DailyLogLibraryItem): string {
    const count = this.service.libraryDayCount(item.tb_tyapp_dl_itm_id);
    if (count === 1) return 'On 1 date';
    return `On ${count} dates`;
  }

  deleteTooltip(item: DailyLogLibraryItem): string {
    if (!this.service.libraryDayCountsReady()) {
      return 'Checking whether this item is on any dates';
    }
    if (this.service.canDeleteLibraryItem(item.tb_tyapp_dl_itm_id)) {
      return 'Delete Library item';
    }
    return 'Remove this item from every date first';
  }

  async onAdd() {
    const text = this.newItemText().trim();
    if (!text || this.service.busy()) return;
    if (!this.showNewItemExtras()) return;

    const ok = await this.service.createLibraryItem({
      itemText: text,
      emoji: this.newEmoji(),
      colourPresetKey: this.newColour(),
    });
    if (ok) this.resetAddPanel();
  }

  resetAddPanel() {
    this.newItemText.set('');
    this.newEmoji.set(null);
    this.newColour.set('slate');
    if (this.emojiPickerTarget() === 'new') this.emojiPickerTarget.set(null);
  }

  selectColour(key: DlColourPresetKey) {
    this.newColour.set(key);
  }

  openEmojiPicker(target: 'new' | 'edit') {
    this.emojiPickerTarget.set(target);
  }

  closeEmojiPicker() {
    this.emojiPickerTarget.set(null);
  }

  onPickerEmoji(event: Event) {
    const unicode = (event as CustomEvent<{ unicode?: string }>).detail?.unicode;
    const emoji = unicode?.trim() ?? '';
    if (!emoji) return;
    const target = this.emojiPickerTarget();
    if (target === 'new') this.newEmoji.set(emoji);
    if (target === 'edit') this.editEmoji = emoji;
    this.closeEmojiPicker();
  }

  clearNewEmoji() {
    this.newEmoji.set(null);
  }

  clearEditEmoji() {
    this.editEmoji = null;
  }

  startEdit(item: DailyLogLibraryItem) {
    this.editingId.set(item.tb_tyapp_dl_itm_id);
    this.editText = item.item_text;
    this.editEmoji = item.emoji;
    this.editColour = item.colour_preset_key;
  }

  cancelEdit() {
    this.editingId.set(null);
    this.editText = '';
    this.editEmoji = null;
    this.editColour = 'slate';
    if (this.emojiPickerTarget() === 'edit') this.emojiPickerTarget.set(null);
  }

  selectEditColour(key: DlColourPresetKey) {
    this.editColour = key;
  }

  async saveEdit() {
    const id = this.editingId();
    if (!id) return;
    const ok = await this.service.updateLibraryItem(id, {
      itemText: this.editText,
      emoji: this.editEmoji,
      colourPresetKey: this.editColour,
    });
    if (ok) this.cancelEdit();
  }

  async onDelete(item: DailyLogLibraryItem) {
    if (!this.service.canDeleteLibraryItem(item.tb_tyapp_dl_itm_id)) return;
    if (!confirm(`Delete "${item.item_text}" from the Library?`)) return;
    if (this.editingId() === item.tb_tyapp_dl_itm_id) this.cancelEdit();
    await this.service.deleteLibraryItem(item.tb_tyapp_dl_itm_id);
  }
}
