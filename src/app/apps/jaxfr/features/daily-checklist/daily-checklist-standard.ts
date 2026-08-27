import { CommonModule } from '@angular/common';
import {
  Component,
  CUSTOM_ELEMENTS_SCHEMA,
  ElementRef,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import 'emoji-picker-element';
import {
  MatAutocompleteModule,
  MatAutocompleteSelectedEvent,
} from '@angular/material/autocomplete';
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
  DailyChecklistStandardRow,
  DclColourPresetKey,
} from './daily-checklist.model';
import { DailyChecklistService } from './daily-checklist.service';
import {
  colourClass,
  filterCatalogSuggestions,
  findCatalogByName,
} from './daily-checklist.util';

@Component({
  selector: 'app-daily-checklist-standard',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    MatAutocompleteModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
  ],
  templateUrl: './daily-checklist-standard.html',
  styleUrl: './daily-checklist-standard.scss',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class DailyChecklistStandard implements OnInit, OnDestroy {
  readonly service = inject(DailyChecklistService);
  private headerService = inject(HeaderService);
  private readonly addItemInput =
    viewChild<ElementRef<HTMLInputElement>>('addItemInput');

  readonly colourPresets = DCL_COLOUR_PRESETS;
  colourClass = colourClass;
  emojiPickerTarget = signal<'new' | 'edit' | null>(null);
  colourChipClasses(key: DclColourPresetKey, selected: boolean): string[] {
    const classes = [colourClass(key)];
    if (selected) classes.push('selected');
    return classes;
  }

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
    if (findCatalogByName(this.service.catalogItems(), text)) return false;
    return this.filteredSuggestions().length === 0;
  });

  readonly filteredSuggestions = computed(() => {
    const inPack = new Set(
      this.service.standardItems().map((row) => row.item_id),
    );
    return filterCatalogSuggestions(
      this.service.catalogItems(),
      this.newItemText(),
    ).filter((item) => !inPack.has(item.tb_tyapp_dcl_itm_id));
  });

  ngOnInit() {
    const isBusy = computed(
      () => this.service.standardLoading() || this.service.busy(),
    );

    this.headerService.setConfig({
      title: 'Template',
      backLink: '/daily-checklist',
      actions: [
        {
          label: 'Refresh',
          icon: 'refresh',
          type: 'secondary',
          disabled: isBusy,
          onClick: () => void this.onRefresh(),
        },
      ],
    });

    void this.service.fetchCatalogItems();
    void this.service.fetchStandardItems();
  }

  ngOnDestroy() {
    this.headerService.clear();
  }

  async onRefresh() {
    await this.service.fetchCatalogItems(true);
    await this.service.fetchStandardItems(true);
  }

  displayCatalogName = (id: string): string => {
    if (!id) return '';
    return (
      this.service.catalogItems().find((row) => row.tb_tyapp_dcl_itm_id === id)
        ?.item_text ?? id
    );
  };

  suggestionLabel(item: DailyChecklistItem): string {
    const emoji = item.emoji ? `${item.emoji} ` : '';
    return `${emoji}${item.item_text}`;
  }

  async onSuggestionSelected(
    event: MatAutocompleteSelectedEvent,
    input: HTMLInputElement,
  ) {
    const itemId = String(event.option.value ?? '');
    if (!itemId) return;
    this.resetAddPanel(input);
    await this.service.addStandardItem(itemId);
  }

  async onAdd() {
    const text = this.newItemText().trim();
    if (!text || this.service.busy()) return;

    const existing = findCatalogByName(this.service.catalogItems(), text);
    if (existing) {
      const ok = await this.service.addStandardItem(existing.tb_tyapp_dcl_itm_id);
      if (ok) this.resetAddPanel();
      return;
    }

    if (!this.showNewItemExtras()) return;

    const ok = await this.service.createCatalogAndAddToStandard({
      itemText: text,
      emoji: this.newEmoji(),
      colourPresetKey: this.newColour(),
    });
    if (ok) this.resetAddPanel();
  }

  resetAddPanel(input?: HTMLInputElement) {
    this.newItemText.set('');
    this.newEmoji.set(null);
    this.newColour.set('slate');
    if (this.emojiPickerTarget() === 'new') this.emojiPickerTarget.set(null);
    const native = input ?? this.addItemInput()?.nativeElement;
    if (native) native.value = '';
    queueMicrotask(() => {
      this.newItemText.set('');
      if (native) native.value = '';
    });
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

  startEdit(item: DailyChecklistStandardRow) {
    this.editingId.set(item.item_id);
    this.editText = item.catalog.item_text;
    this.editEmoji = item.catalog.emoji;
    this.editColour = item.catalog.colour_preset_key;
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

  async onDelete(item: DailyChecklistStandardRow) {
    if (
      !confirm(
        `Remove "${item.catalog.item_text}" from the Template?`,
      )
    ) {
      return;
    }
    if (this.editingId() === item.item_id) this.cancelEdit();
    await this.service.deleteStandardItem(item.tb_tyapp_dcl_std_id);
  }

  async move(item: DailyChecklistStandardRow, direction: -1 | 1) {
    await this.service.moveStandardItem(item.tb_tyapp_dcl_std_id, direction);
  }

  canMoveUp(index: number): boolean {
    return index > 0;
  }

  canMoveDown(index: number): boolean {
    return index < this.service.standardItems().length - 1;
  }
}
