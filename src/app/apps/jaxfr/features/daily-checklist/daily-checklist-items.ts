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
  DCL_COLOUR_PRESETS,
  DailyChecklistItem,
  DclColourPresetKey,
} from './daily-checklist.model';
import { DailyChecklistChrome, DclChromeAction } from './daily-checklist-chrome';
import { DailyChecklistService } from './daily-checklist.service';
import { colourClass, findCatalogByName } from './daily-checklist.util';

@Component({
  selector: 'app-daily-checklist-items',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    DailyChecklistChrome,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
  ],
  templateUrl: './daily-checklist-items.html',
  styleUrl: './daily-checklist-standard.scss',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class DailyChecklistItems implements OnInit, OnDestroy {
  readonly service = inject(DailyChecklistService);
  private headerService = inject(HeaderService);

  readonly colourPresets = DCL_COLOUR_PRESETS;
  colourClass = colourClass;

  emojiPickerTarget = signal<'new' | 'edit' | null>(null);
  newItemText = signal('');
  newEmoji = signal<string | null>(null);
  newColour = signal<DclColourPresetKey>('slate');
  editingId = signal<string | null>(null);
  editText = '';
  editEmoji: string | null = null;
  editColour: DclColourPresetKey = 'slate';

  readonly showNewItemExtras = computed(() => {
    const text = this.newItemText().trim();
    if (!text) return false;
    return !findCatalogByName(this.service.catalogItems(), text);
  });

  readonly nameTaken = computed(() => {
    const text = this.newItemText().trim();
    if (!text) return false;
    return !!findCatalogByName(this.service.catalogItems(), text);
  });

  readonly chromeActions = computed<DclChromeAction[]>(() => [
    {
      label: 'Refresh',
      icon: 'refresh',
      disabled: this.service.catalogLoading() || this.service.busy(),
      onClick: () => void this.onRefresh(),
    },
  ]);

  ngOnInit() {
    this.headerService.clear();

    void this.service.fetchCatalogItems();
    void this.service.fetchCatalogDayCounts(true);
  }

  ngOnDestroy() {
    this.headerService.clear();
  }

  colourChipClasses(key: DclColourPresetKey, selected: boolean): string[] {
    const classes = [colourClass(key)];
    if (selected) classes.push('selected');
    return classes;
  }

  async onRefresh() {
    await this.service.fetchCatalogItems(true);
    await this.service.fetchCatalogDayCounts(true);
  }

  usageLabel(item: DailyChecklistItem): string {
    const count = this.service.catalogDayCount(item.tb_tyapp_dcl_itm_id);
    if (count === 1) return 'On 1 date';
    return `On ${count} dates`;
  }

  deleteTooltip(item: DailyChecklistItem): string {
    if (!this.service.catalogDayCountsReady()) {
      return 'Checking whether this item is on any dates';
    }
    if (this.service.canDeleteCatalogItem(item.tb_tyapp_dcl_itm_id)) {
      return 'Delete catalog item';
    }
    return 'Remove this item from every date first';
  }

  async onAdd() {
    const text = this.newItemText().trim();
    if (!text || this.service.busy()) return;
    if (!this.showNewItemExtras()) return;

    const ok = await this.service.createCatalogItem({
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

  selectColour(key: DclColourPresetKey) {
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

  startEdit(item: DailyChecklistItem) {
    this.editingId.set(item.tb_tyapp_dcl_itm_id);
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

  selectEditColour(key: DclColourPresetKey) {
    this.editColour = key;
  }

  async saveEdit() {
    const id = this.editingId();
    if (!id) return;
    const ok = await this.service.updateCatalogItem(id, {
      itemText: this.editText,
      emoji: this.editEmoji,
      colourPresetKey: this.editColour,
    });
    if (ok) this.cancelEdit();
  }

  async onDelete(item: DailyChecklistItem) {
    if (!this.service.canDeleteCatalogItem(item.tb_tyapp_dcl_itm_id)) return;
    if (!confirm(`Delete "${item.item_text}" from the catalog?`)) return;
    if (this.editingId() === item.tb_tyapp_dcl_itm_id) this.cancelEdit();
    await this.service.deleteCatalogItem(item.tb_tyapp_dcl_itm_id);
  }
}
