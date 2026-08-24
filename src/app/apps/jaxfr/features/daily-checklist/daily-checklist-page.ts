import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
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
import { ActivatedRoute, Router } from '@angular/router';
import {
  MatAutocompleteModule,
  MatAutocompleteSelectedEvent,
} from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Subscription } from 'rxjs';
import 'emoji-picker-element';

import { HeaderService } from '../../../../core/services/header.service';
import { formatDate } from '../../../../core/utils/date-time.util';
import {
  DCL_COLOUR_PRESETS,
  DailyChecklistDayRow,
  DailyChecklistItem,
  DclColourPresetKey,
} from './daily-checklist.model';
import { DailyChecklistService } from './daily-checklist.service';
import {
  buildWeekDays,
  colourClass,
  completionPercent,
  filterCatalogSuggestions,
  findCatalogByName,
  groupWeekDays,
  isDayItemCompleted,
  normalizeChecklistDateParam,
  shiftChecklistDate,
  sortDayRowsForDisplay,
} from './daily-checklist.util';

type EmojiPickerTarget = 'new' | 'edit';

@Component({
  selector: 'app-daily-checklist-page',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatAutocompleteModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
  ],
  templateUrl: './daily-checklist-page.html',
  styleUrl: './daily-checklist-page.scss',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class DailyChecklistPage implements OnInit, AfterViewInit, OnDestroy {
  readonly service = inject(DailyChecklistService);
  private headerService = inject(HeaderService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  private querySub?: Subscription;
  private readonly weekScroller =
    viewChild<ElementRef<HTMLElement>>('weekScroller');
  private ignoreWeekScroll = false;
  private weekScrollTimer: ReturnType<typeof setTimeout> | null = null;

  selectedDate = signal(formatDate(new Date()));
  newItemText = signal('');
  newEmoji = signal<string | null>(null);
  newColour = signal<DclColourPresetKey>('slate');
  newRemarks = '';
  showStandardHint = signal(false);
  emojiPickerTarget = signal<EmojiPickerTarget | null>(null);
  editingDayId = signal<string | null>(null);
  editText = '';
  editEmoji: string | null = null;
  editColour: DclColourPresetKey = 'slate';
  editRemarks = '';

  readonly colourPresets = DCL_COLOUR_PRESETS;
  readonly today = formatDate(new Date());

  readonly weekPages = computed(() =>
    groupWeekDays(
      buildWeekDays(this.selectedDate(), this.service.weekItems(), 1, 1),
    ),
  );

  readonly displayItems = computed(() =>
    sortDayRowsForDisplay(this.service.itemsForDate(this.selectedDate())),
  );

  readonly completedCount = computed(
    () => this.displayItems().filter((item) => isDayItemCompleted(item)).length,
  );

  readonly totalCount = computed(() => this.displayItems().length);

  readonly progressPercent = computed(() =>
    completionPercent(this.completedCount(), this.totalCount()),
  );

  readonly isEmpty = computed(
    () => !this.service.loading() && this.totalCount() === 0,
  );

  readonly isToday = computed(() => this.selectedDate() === this.today);

  readonly filteredSuggestions = computed(() => {
    const onDate = new Set(
      this.service.itemsForDate(this.selectedDate()).map((item) => item.item_id),
    );
    return filterCatalogSuggestions(
      this.service.catalogItems(),
      this.newItemText(),
    ).filter((item) => !onDate.has(item.tb_tyapp_dcl_itm_id));
  });

  readonly showNewItemExtras = computed(() => {
    const text = this.newItemText().trim();
    if (!text) return false;
    if (findCatalogByName(this.service.catalogItems(), text)) return false;
    return this.filteredSuggestions().length === 0;
  });

  ngOnInit() {
    const isBusy = computed(
      () => this.service.loading() || this.service.busy(),
    );

    this.headerService.setConfig({
      title: 'Daily Checklist',
      actions: [
        {
          label: 'Jump to today',
          icon: 'today',
          type: 'secondary',
          disabled: computed(() => this.isToday() || isBusy()),
          onClick: () => this.goToday(),
        },
        {
          label: "Copy yesterday's list",
          icon: 'history',
          type: 'secondary',
          disabled: isBusy,
          onClick: () => void this.onCopyYesterday(),
        },
        {
          label: 'Apply standard pack',
          icon: 'playlist_add_check',
          type: 'secondary',
          disabled: isBusy,
          onClick: () => void this.onUseStandard(),
        },
        {
          label: 'Dashboard',
          icon: 'insights',
          type: 'secondary',
          onClick: () => this.router.navigate(['/daily-checklist/dashboard']),
        },
        {
          label: 'Edit standard pack',
          icon: 'tune',
          type: 'secondary',
          onClick: () => this.router.navigate(['/daily-checklist/standard']),
        },
        {
          label: 'Refresh',
          icon: 'refresh',
          type: 'secondary',
          disabled: isBusy,
          onClick: () => this.onRefresh(),
        },
      ],
    });

    this.querySub = this.route.queryParamMap.subscribe((params) => {
      const normalized = normalizeChecklistDateParam(params.get('date'));
      if (params.get('date') !== normalized) {
        this.goToDate(normalized, true);
        return;
      }
      this.selectedDate.set(normalized);
      this.showStandardHint.set(false);
      this.cancelEdit();
      this.resetAddPanel();
      void this.service.fetchItemsForWeek(normalized);
      this.scheduleSnapToMiddle();
    });

    void this.service.fetchCatalogItems();
    void this.service.fetchStandardItems();
  }

  ngAfterViewInit() {
    this.scheduleSnapToMiddle();
  }

  ngOnDestroy() {
    this.querySub?.unsubscribe();
    if (this.weekScrollTimer) clearTimeout(this.weekScrollTimer);
    this.headerService.clear();
  }

  itemCardClasses(item: DailyChecklistDayRow): string[] {
    const classes = [colourClass(item.catalog.colour_preset_key)];
    if (this.isCompleted(item)) classes.push('completed');
    if (this.editingDayId() === item.tb_tyapp_dcl_day_id) {
      classes.push('editing');
    }
    return classes;
  }

  checkBtnClasses(item: DailyChecklistDayRow): string[] {
    const classes = [colourClass(item.catalog.colour_preset_key)];
    if (this.isCompleted(item)) classes.push('done');
    return classes;
  }

  colourChipClasses(key: DclColourPresetKey, selected: boolean): string[] {
    const classes = [colourClass(key)];
    if (selected) classes.push('selected');
    return classes;
  }

  displayCatalogName = (id: string): string => {
    if (!id) return '';
    return (
      this.service.catalogItems().find((row) => row.tb_tyapp_dcl_itm_id === id)
        ?.item_text ?? id
    );
  };

  goToDate(dateStr: string, replaceUrl = false) {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { date: dateStr },
      replaceUrl,
    });
  }

  selectDay(dateStr: string) {
    this.goToDate(dateStr);
  }

  goPrevWeek() {
    this.goToDate(shiftChecklistDate(this.selectedDate(), -7));
  }

  goNextWeek() {
    this.goToDate(shiftChecklistDate(this.selectedDate(), 7));
  }

  goToday() {
    this.goToDate(this.today);
  }

  onWeekScroll() {
    if (this.ignoreWeekScroll) return;
    if (this.weekScrollTimer) clearTimeout(this.weekScrollTimer);
    this.weekScrollTimer = setTimeout(() => this.settleWeekScroll(), 90);
  }

  private settleWeekScroll() {
    const el = this.weekScroller()?.nativeElement;
    if (!el || el.clientWidth === 0) return;
    const page = Math.round(el.scrollLeft / el.clientWidth);
    if (page === 1) return;
    this.goToDate(shiftChecklistDate(this.selectedDate(), (page - 1) * 7));
  }

  private scheduleSnapToMiddle() {
    queueMicrotask(() => {
      requestAnimationFrame(() => this.snapToMiddle());
    });
  }

  private snapToMiddle() {
    const el = this.weekScroller()?.nativeElement;
    if (!el || el.clientWidth === 0) return;
    this.ignoreWeekScroll = true;
    el.scrollTo({ left: el.clientWidth, behavior: 'auto' });
    if (this.weekScrollTimer) clearTimeout(this.weekScrollTimer);
    this.weekScrollTimer = setTimeout(() => {
      this.ignoreWeekScroll = false;
    }, 160);
  }

  async onRefresh() {
    await this.service.fetchCatalogItems(true);
    await Promise.all([
      this.service.fetchItemsForWeek(this.selectedDate(), true),
      this.service.fetchStandardItems(true),
    ]);
  }

  isCompleted(item: DailyChecklistDayRow): boolean {
    return isDayItemCompleted(item);
  }

  async onToggle(item: DailyChecklistDayRow) {
    if (this.editingDayId() === item.tb_tyapp_dcl_day_id) return;
    await this.service.toggleDayItemCompletion(item);
  }

  startEdit(item: DailyChecklistDayRow) {
    this.editingDayId.set(item.tb_tyapp_dcl_day_id);
    this.editText = item.catalog.item_text;
    this.editEmoji = item.catalog.emoji;
    this.editColour = item.catalog.colour_preset_key;
    this.editRemarks = item.remarks ?? '';
    this.emojiPickerTarget.set(null);
  }

  cancelEdit() {
    this.editingDayId.set(null);
    this.editText = '';
    this.editEmoji = null;
    this.editColour = 'slate';
    this.editRemarks = '';
    if (this.emojiPickerTarget() === 'edit') this.emojiPickerTarget.set(null);
  }

  async saveEdit(item: DailyChecklistDayRow) {
    const ok = await this.service.updateCatalogItem(item.item_id, {
      itemText: this.editText,
      emoji: this.editEmoji,
      colourPresetKey: this.editColour,
    });
    if (!ok) return;
    const remarksOk = await this.service.updateDayRemarks(
      item.tb_tyapp_dcl_day_id,
      this.editRemarks,
      false,
    );
    if (remarksOk) this.cancelEdit();
  }

  async onDelete(item: DailyChecklistDayRow) {
    if (!confirm(`Remove "${item.catalog.item_text}" from this date?`)) return;
    if (this.editingDayId() === item.tb_tyapp_dcl_day_id) this.cancelEdit();
    await this.service.deleteDayItem(item.tb_tyapp_dcl_day_id);
  }

  async onSuggestionSelected(event: MatAutocompleteSelectedEvent) {
    const itemId = String(event.option.value ?? '');
    if (!itemId) return;
    this.resetAddPanel();
    await this.service.addExistingItemToDate(this.selectedDate(), itemId);
  }

  suggestionLabel(item: DailyChecklistItem): string {
    const emoji = item.emoji ? `${item.emoji} ` : '';
    return `${emoji}${item.item_text}`;
  }

  async onAddItem(event?: Event) {
    event?.preventDefault();
    const text = this.newItemText().trim();
    if (!text || this.service.busy()) return;

    const existing = findCatalogByName(this.service.catalogItems(), text);
    if (existing) {
      const ok = await this.service.addExistingItemToDate(
        this.selectedDate(),
        existing.tb_tyapp_dcl_itm_id,
      );
      if (ok) this.resetAddPanel();
      return;
    }

    if (!this.showNewItemExtras()) return;

    const ok = await this.service.createCatalogAndAddToDate(this.selectedDate(), {
      itemText: text,
      emoji: this.newEmoji(),
      colourPresetKey: this.newColour(),
      remarks: this.newRemarks,
    });
    if (ok) this.resetAddPanel();
  }

  resetAddPanel() {
    this.newItemText.set('');
    this.newEmoji.set(null);
    this.newColour.set('slate');
    this.newRemarks = '';
    if (this.emojiPickerTarget() === 'new') this.emojiPickerTarget.set(null);
  }

  selectColour(key: DclColourPresetKey) {
    this.newColour.set(key);
  }

  selectEditColour(key: DclColourPresetKey) {
    this.editColour = key;
  }

  openEmojiPicker(target: EmojiPickerTarget) {
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

  async onUseStandard() {
    await this.service.fetchStandardItems();
    const ok = await this.service.createFromStandard(this.selectedDate());
    if (!ok && this.service.standardItems().length === 0) {
      this.showStandardHint.set(true);
    }
  }

  async onCopyYesterday() {
    await this.service.copyPreviousDay(this.selectedDate());
  }

  openStandard() {
    void this.router.navigate(['/daily-checklist/standard']);
  }
}
