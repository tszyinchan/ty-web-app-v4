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
  DL_COLOUR_PRESETS,
  DailyLogLibraryItem,
  DailyLogTemplateRow,
  DlColourPresetKey,
} from './daily-log.model';
import { DailyLogChrome, DailyLogChromeAction } from './daily-log-chrome';
import { DailyLogService } from './daily-log.service';
import {
  colourClass,
  filterLibrarySuggestions,
  findLibraryItemByName,
} from './daily-log.util';

@Component({
  selector: 'app-daily-log-template',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    DailyLogChrome,
    MatAutocompleteModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
  ],
  templateUrl: './daily-log-template.html',
  styleUrl: './daily-log-template.scss',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class DailyLogTemplate implements OnInit, OnDestroy {
  readonly service = inject(DailyLogService);
  private headerService = inject(HeaderService);
  private readonly addItemInput =
    viewChild<ElementRef<HTMLInputElement>>('addItemInput');

  readonly colourPresets = DL_COLOUR_PRESETS;
  colourClass = colourClass;
  emojiPickerTarget = signal<'new' | 'edit' | null>(null);
  colourChipClasses(key: DlColourPresetKey, selected: boolean): string[] {
    const classes = [colourClass(key)];
    if (selected) classes.push('selected');
    return classes;
  }

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
    if (findLibraryItemByName(this.service.libraryItems(), text)) return false;
    return this.filteredSuggestions().length === 0;
  });

  readonly filteredSuggestions = computed(() => {
    const inPack = new Set(
      this.service.templateItems().map((row) => row.item_id),
    );
    return filterLibrarySuggestions(
      this.service.libraryItems(),
      this.newItemText(),
    ).filter((item) => !inPack.has(item.tb_tyapp_dl_itm_id));
  });

  readonly chromeActions = computed<DailyLogChromeAction[]>(() => [
    {
      label: 'Refresh',
      icon: 'refresh',
      disabled: this.service.templateLoading() || this.service.busy(),
      onClick: () => void this.onRefresh(),
    },
  ]);

  ngOnInit() {
    this.headerService.clear();

    void this.service.fetchLibraryItems();
    void this.service.fetchTemplateItems();
  }

  ngOnDestroy() {
    this.headerService.clear();
  }

  async onRefresh() {
    await this.service.fetchLibraryItems(true);
    await this.service.fetchTemplateItems(true);
  }

  displayLibraryName = (id: string): string => {
    if (!id) return '';
    return (
      this.service.libraryItems().find((row) => row.tb_tyapp_dl_itm_id === id)
        ?.item_text ?? id
    );
  };

  suggestionLabel(item: DailyLogLibraryItem): string {
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
    await this.service.addTemplateItem(itemId);
  }

  async onAdd() {
    const text = this.newItemText().trim();
    if (!text || this.service.busy()) return;

    const existing = findLibraryItemByName(this.service.libraryItems(), text);
    if (existing) {
      const ok = await this.service.addTemplateItem(existing.tb_tyapp_dl_itm_id);
      if (ok) this.resetAddPanel();
      return;
    }

    if (!this.showNewItemExtras()) return;

    const ok = await this.service.createLibraryItemAndAddToTemplate({
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

  startEdit(item: DailyLogTemplateRow) {
    this.editingId.set(item.item_id);
    this.editText = item.library.item_text;
    this.editEmoji = item.library.emoji;
    this.editColour = item.library.colour_preset_key;
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

  async onDelete(item: DailyLogTemplateRow) {
    if (
      !confirm(
        `Remove "${item.library.item_text}" from the Template?`,
      )
    ) {
      return;
    }
    if (this.editingId() === item.item_id) this.cancelEdit();
    await this.service.deleteTemplateItem(item.tb_tyapp_dl_tpl_id);
  }

  async move(item: DailyLogTemplateRow, direction: -1 | 1) {
    await this.service.moveTemplateItem(item.tb_tyapp_dl_tpl_id, direction);
  }

  canMoveUp(index: number): boolean {
    return index > 0;
  }

  canMoveDown(index: number): boolean {
    return index < this.service.templateItems().length - 1;
  }
}
