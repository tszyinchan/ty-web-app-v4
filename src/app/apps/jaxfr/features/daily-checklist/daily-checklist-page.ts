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
  STRIP_EXTEND_WEEKS,
  STRIP_WEEKS_BEFORE,
  buildWeekDays,
  colourClass,
  completionPercent,
  filterCatalogSuggestions,
  findCatalogByName,
  groupWeekDays,
  initialStripStart,
  initialStripWeekCount,
  isDateInChecklistWeek,
  isDateInStrip,
  isDayItemCompleted,
  normalizeChecklistDateParam,
  shiftChecklistDate,
  sortDayRowsForDisplay,
  stripRangeEnd,
  weekPageIndex,
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
  private stripExtending = false;
  private stripHasFetched = false;

  selectedDate = signal(formatDate(new Date()));
  stripStartDate = signal(initialStripStart(formatDate(new Date())));
  stripWeekCount = signal(initialStripWeekCount());
  private visiblePage = signal(STRIP_WEEKS_BEFORE);
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
      buildWeekDays(
        this.stripStartDate(),
        this.service.weekItems(),
        0,
        this.stripWeekCount() - 1,
        this.selectedDate(),
      ),
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

  readonly isOnTodayView = computed(() => {
    if (this.selectedDate() !== this.today) return false;
    const visibleMonday = shiftChecklistDate(
      this.stripStartDate(),
      this.visiblePage() * 7,
    );
    return isDateInChecklistWeek(this.today, visibleMonday);
  });

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
          label: 'Refresh',
          icon: 'refresh',
          type: 'secondary',
          disabled: isBusy,
          onClick: () => this.onRefresh(),
        },
        {
          label: 'Jump to today',
          icon: 'today',
          type: 'secondary',
          disabled: computed(() => this.isOnTodayView() || isBusy()),
          onClick: () => this.goToday(),
        },
        {
          label: 'Copy yesterday',
          icon: 'history',
          type: 'secondary',
          disabled: isBusy,
          onClick: () => void this.onCopyYesterday(),
        },
        {
          label: 'Apply standard',
          icon: 'playlist_add_check',
          type: 'secondary',
          disabled: isBusy,
          onClick: () => void this.onUseStandard(),
        },
        {
          label: 'Manage standard template',
          icon: 'tune',
          type: 'secondary',
          onClick: () => this.router.navigate(['/daily-checklist/standard']),
        },
        {
          label: 'Manage items',
          icon: 'category',
          type: 'secondary',
          onClick: () => this.router.navigate(['/daily-checklist/items']),
        },
        {
          label: 'Dashboard',
          icon: 'insights',
          type: 'secondary',
          onClick: () => this.router.navigate(['/daily-checklist/dashboard']),
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
      if (
        this.stripHasFetched &&
        isDateInStrip(
          normalized,
          this.stripStartDate(),
          this.stripWeekCount(),
        )
      ) {
        return;
      }
      this.resetStripAround(normalized);
    });

    void this.service.fetchCatalogItems();
    void this.service.fetchStandardItems();
  }

  ngAfterViewInit() {
    this.scheduleScrollToPage(this.visiblePage());
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
    this.scrollStripByPage(-1);
  }

  goNextWeek() {
    this.scrollStripByPage(1);
  }

  goToday() {
    const inStrip = isDateInStrip(
      this.today,
      this.stripStartDate(),
      this.stripWeekCount(),
    );
    if (!inStrip) {
      if (this.selectedDate() !== this.today) this.goToDate(this.today);
      else this.resetStripAround(this.today);
      return;
    }
    if (this.selectedDate() !== this.today) this.goToDate(this.today);
    this.scrollToDate(this.today);
  }

  onWeekScroll() {
    if (this.ignoreWeekScroll) return;
    const el = this.weekScroller()?.nativeElement;
    if (!el || el.clientWidth === 0) return;
    const page = Math.round(el.scrollLeft / el.clientWidth);
    if (this.visiblePage() !== page) this.visiblePage.set(page);
    if (page <= 0) void this.extendStrip(-1);
    if (page >= this.stripWeekCount() - 1) void this.extendStrip(1);
  }

  private scrollStripByPage(direction: -1 | 1) {
    const el = this.weekScroller()?.nativeElement;
    if (!el || el.clientWidth === 0) return;
    const page = Math.round(el.scrollLeft / el.clientWidth);
    const last = this.stripWeekCount() - 1;
    const nextPage = page + direction;
    if (nextPage >= 0 && nextPage <= last) {
      this.scrollToPage(nextPage, 'smooth');
      return;
    }
    void this.extendStrip(direction).then(() => {
      const scroller = this.weekScroller()?.nativeElement;
      if (!scroller || scroller.clientWidth === 0) return;
      const pageAfter = Math.round(scroller.scrollLeft / scroller.clientWidth);
      this.scrollToPage(pageAfter + direction, 'smooth');
    });
  }

  private resetStripAround(date: string) {
    const start = initialStripStart(date);
    const count = initialStripWeekCount();
    this.stripStartDate.set(start);
    this.stripWeekCount.set(count);
    this.visiblePage.set(STRIP_WEEKS_BEFORE);
    this.stripHasFetched = true;
    void this.service.fetchItemsForRange(
      start,
      stripRangeEnd(start, count),
      date,
      { force: true },
    );
    this.scheduleScrollToPage(STRIP_WEEKS_BEFORE);
  }

  private async extendStrip(direction: -1 | 1): Promise<void> {
    if (this.stripExtending) return;
    this.stripExtending = true;
    const add = STRIP_EXTEND_WEEKS;
    try {
      if (direction < 0) {
        const newStart = shiftChecklistDate(this.stripStartDate(), -7 * add);
        const newEnd = shiftChecklistDate(newStart, 7 * add - 1);
        await this.service.fetchItemsForRange(
          newStart,
          newEnd,
          this.selectedDate(),
          { merge: true },
        );
        this.ignoreWeekScroll = true;
        this.stripStartDate.set(newStart);
        this.stripWeekCount.update((count) => count + add);
        await new Promise<void>((resolve) => {
          this.afterStripRender(() => {
            const el = this.weekScroller()?.nativeElement;
            if (el && el.clientWidth > 0) {
              el.scrollLeft += el.clientWidth * add;
              this.visiblePage.set(
                Math.round(el.scrollLeft / el.clientWidth),
              );
            }
            this.ignoreWeekScroll = false;
            resolve();
          });
        });
      } else {
        const addStart = shiftChecklistDate(
          this.stripStartDate(),
          7 * this.stripWeekCount(),
        );
        const addEnd = shiftChecklistDate(addStart, 7 * add - 1);
        await this.service.fetchItemsForRange(
          addStart,
          addEnd,
          this.selectedDate(),
          { merge: true },
        );
        this.stripWeekCount.update((count) => count + add);
      }
    } finally {
      this.stripExtending = false;
    }
  }

  private scrollToDate(dateStr: string) {
    const page = weekPageIndex(this.stripStartDate(), dateStr);
    this.scrollToPage(page, 'smooth');
  }

  private scheduleScrollToPage(page: number) {
    queueMicrotask(() => {
      requestAnimationFrame(() => this.scrollToPage(page, 'auto'));
    });
  }

  private scrollToPage(page: number, behavior: ScrollBehavior) {
    const el = this.weekScroller()?.nativeElement;
    if (!el || el.clientWidth === 0) return;
    this.ignoreWeekScroll = true;
    this.visiblePage.set(page);
    el.scrollTo({ left: page * el.clientWidth, behavior });
    if (this.weekScrollTimer) clearTimeout(this.weekScrollTimer);
    this.weekScrollTimer = setTimeout(() => {
      this.ignoreWeekScroll = false;
    }, behavior === 'smooth' ? 400 : 160);
  }

  private afterStripRender(fn: () => void) {
    queueMicrotask(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(fn);
      });
    });
  }

  async onRefresh() {
    await this.service.fetchCatalogItems(true);
    await Promise.all([
      this.service.fetchItemsForRange(
        this.stripStartDate(),
        stripRangeEnd(this.stripStartDate(), this.stripWeekCount()),
        this.selectedDate(),
        { force: true },
      ),
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
