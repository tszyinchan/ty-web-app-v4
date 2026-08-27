import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  Component,
  CUSTOM_ELEMENTS_SCHEMA,
  ElementRef,
  OnDestroy,
  OnInit,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  CdkDrag,
  CdkDragDrop,
  CdkDragHandle,
  CdkDropList,
  moveItemInArray,
} from '@angular/cdk/drag-drop';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import {
  MatAutocompleteModule,
  MatAutocompleteSelectedEvent,
} from '@angular/material/autocomplete';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Subscription } from 'rxjs';
import 'emoji-picker-element';

import { HeaderService } from '../../../../core/services/header.service';
import { formatDate } from '../../../../core/utils/date-time.util';
import {
  DL_COLOUR_PRESETS,
  DL_MOODS,
  DailyLogDayRow,
  DailyLogLibraryItem,
  DailyLogWeekDay,
  DlColourPresetKey,
  DlMoodKey,
} from './daily-log.model';
import { DailyLogAddSheet } from './daily-log-add-sheet';
import {
  DailyLogChrome,
  DailyLogChromeAction,
  DailyLogChromeNavLink,
} from './daily-log-chrome';
import { DailyLogFace } from './daily-log-face';
import { DailyLogService } from './daily-log.service';
import {
  STRIP_EXTEND_WEEKS,
  STRIP_WEEKS_BEFORE,
  buildWeekDays,
  colourClass,
  logDateParts,
  filterLibrarySuggestions,
  findLibraryItemByName,
  groupWeekDays,
  initialStripStart,
  initialStripWeekCount,
  isDateInLogWeek,
  isDateInStrip,
  isDayItemCompleted,
  normalizeLogDateParam,
  shiftLogDate,
  sortDayRowsForDisplay,
  stripRangeEnd,
  weekPageIndex,
} from './daily-log.util';

type EmojiPickerTarget = 'edit';

@Component({
  selector: 'app-daily-log',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    CdkDropList,
    CdkDrag,
    CdkDragHandle,
    RouterModule,
    DailyLogAddSheet,
    DailyLogChrome,
    DailyLogFace,
    MatAutocompleteModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
  ],
  templateUrl: './daily-log.html',
  styleUrl: './daily-log.scss',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class DailyLog implements OnInit, AfterViewInit, OnDestroy {
  readonly service = inject(DailyLogService);
  private headerService = inject(HeaderService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  private querySub?: Subscription;
  private readonly weekScroller =
    viewChild<ElementRef<HTMLElement>>('weekScroller');
  private readonly addRow = viewChild<ElementRef<HTMLElement>>('addRow');
  private readonly addItemInput =
    viewChild<ElementRef<HTMLInputElement>>('addItemInput');
  private ignoreWeekScroll = false;
  private addScrollTimers: ReturnType<typeof setTimeout>[] = [];
  private addViewportUnsub: (() => void) | null = null;
  private weekScrollTimer: ReturnType<typeof setTimeout> | null = null;
  private stripExtending = false;
  private stripHasFetched = false;

  selectedDate = signal(formatDate(new Date()));
  stripStartDate = signal(initialStripStart(formatDate(new Date())));
  stripWeekCount = signal(initialStripWeekCount());
  private visiblePage = signal(STRIP_WEEKS_BEFORE);
  newItemText = signal('');
  showTemplateHint = signal(false);
  emojiPickerTarget = signal<EmojiPickerTarget | null>(null);
  editingDayId = signal<string | null>(null);
  addSheetOpen = signal(false);
  reordering = signal(false);
  dayMood = signal<DlMoodKey | null>(null);
  dayTitle = signal('');
  editText = '';
  editEmoji: string | null = null;
  editColour: DlColourPresetKey = 'slate';
  editRemarks = '';

  readonly colourPresets = DL_COLOUR_PRESETS;
  readonly moods = DL_MOODS;
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

  readonly logDate = computed(() => logDateParts(this.selectedDate()));

  readonly displayItems = computed(() =>
    sortDayRowsForDisplay(this.service.itemsForDate(this.selectedDate())),
  );

  readonly completedCount = computed(
    () => this.displayItems().filter((item) => isDayItemCompleted(item)).length,
  );

  readonly totalCount = computed(() => this.displayItems().length);

  readonly isEmpty = computed(
    () =>
      !this.service.loading() &&
      this.totalCount() === 0 &&
      this.dayMood() === null &&
      this.dayTitle().trim() === '',
  );

  readonly isOnTodayView = computed(() => {
    if (this.selectedDate() !== this.today) return false;
    const visibleMonday = shiftLogDate(
      this.stripStartDate(),
      this.visiblePage() * 7,
    );
    return isDateInLogWeek(this.today, visibleMonday);
  });

  readonly filteredSuggestions = computed(() => {
    const onDate = new Set(
      this.service.itemsForDate(this.selectedDate()).map((item) => item.item_id),
    );
    return filterLibrarySuggestions(
      this.service.libraryItems(),
      this.newItemText(),
    ).filter((item) => !onDate.has(item.tb_tyapp_dl_itm_id));
  });

  readonly pageNav: DailyLogChromeNavLink[] = [
    { label: 'Others', routerLink: '/daily-log/others' },
    { label: 'Library', routerLink: '/daily-log/library' },
    { label: 'Stats', routerLink: '/daily-log/stats' },
  ];

  readonly chromeActions = computed<DailyLogChromeAction[]>(() => {
    const busy = this.service.loading() || this.service.busy();
    return [
      {
        label: 'Today',
        disabled: this.isOnTodayView() || busy,
        onClick: () => this.goToday(),
      },
      {
        label: 'Refresh',
        icon: 'refresh',
        disabled: busy,
        onClick: () => void this.onRefresh(),
      },
    ];
  });

  constructor() {
    effect(() => {
      const date = this.selectedDate();
      const log = this.service.dayLogForDate(date);
      untracked(() => {
        this.dayMood.set(log?.mood_key ?? null);
        this.dayTitle.set(log?.title ?? '');
      });
    });
  }

  ngOnInit() {
    this.headerService.clear();

    this.querySub = this.route.queryParamMap.subscribe((params) => {
      const normalized = normalizeLogDateParam(params.get('date'));
      if (params.get('date') !== normalized) {
        this.goToDate(normalized, true);
        return;
      }
      this.selectedDate.set(normalized);
      this.showTemplateHint.set(false);
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

    void this.service.fetchLibraryItems();
    void this.service.fetchTemplateItems();
  }

  ngAfterViewInit() {
    this.scheduleScrollToPage(this.visiblePage());
  }

  ngOnDestroy() {
    this.querySub?.unsubscribe();
    if (this.weekScrollTimer) clearTimeout(this.weekScrollTimer);
    this.clearAddScrollWatch();
    this.headerService.clear();
  }

  itemCardClasses(item: DailyLogDayRow): string[] {
    const classes = [colourClass(item.library.colour_preset_key)];
    if (this.isCompleted(item)) classes.push('completed');
    if (this.editingDayId() === item.tb_tyapp_dl_day_id) {
      classes.push('editing');
    }
    return classes;
  }

  checkBtnClasses(item: DailyLogDayRow): string[] {
    const classes = [colourClass(item.library.colour_preset_key)];
    if (this.isCompleted(item)) classes.push('done');
    return classes;
  }

  colourChipClasses(key: DlColourPresetKey, selected: boolean): string[] {
    const classes = [colourClass(key)];
    if (selected) classes.push('selected');
    return classes;
  }

  displayLibraryName = (id: string): string => {
    if (!id) return '';
    return (
      this.service.libraryItems().find((row) => row.tb_tyapp_dl_itm_id === id)
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
        const newStart = shiftLogDate(this.stripStartDate(), -7 * add);
        const newEnd = shiftLogDate(newStart, 7 * add - 1);
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
        const addStart = shiftLogDate(
          this.stripStartDate(),
          7 * this.stripWeekCount(),
        );
        const addEnd = shiftLogDate(addStart, 7 * add - 1);
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
    await this.service.fetchLibraryItems(true);
    await Promise.all([
      this.service.fetchItemsForRange(
        this.stripStartDate(),
        stripRangeEnd(this.stripStartDate(), this.stripWeekCount()),
        this.selectedDate(),
        { force: true },
      ),
      this.service.fetchTemplateItems(true),
    ]);
  }

  isCompleted(item: DailyLogDayRow): boolean {
    return isDayItemCompleted(item);
  }

  async onToggle(item: DailyLogDayRow) {
    if (this.editingDayId() === item.tb_tyapp_dl_day_id) return;
    await this.service.toggleDayItemCompletion(item);
  }

  startEdit(item: DailyLogDayRow) {
    this.editingDayId.set(item.tb_tyapp_dl_day_id);
    this.editText = item.library.item_text;
    this.editEmoji = item.library.emoji;
    this.editColour = item.library.colour_preset_key;
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

  async saveEdit(item: DailyLogDayRow) {
    const ok = await this.service.updateLibraryItem(item.item_id, {
      itemText: this.editText,
      emoji: this.editEmoji,
      colourPresetKey: this.editColour,
    });
    if (!ok) return;
    const remarksOk = await this.service.updateDayRemarks(
      item.tb_tyapp_dl_day_id,
      this.editRemarks,
      false,
    );
    if (remarksOk) this.cancelEdit();
  }

  async onDelete(item: DailyLogDayRow) {
    if (!confirm(`Remove "${item.library.item_text}" from this date?`)) return;
    if (this.editingDayId() === item.tb_tyapp_dl_day_id) this.cancelEdit();
    await this.service.deleteDayItem(item.tb_tyapp_dl_day_id);
  }

  canReorder(): boolean {
    return (
      !this.service.busy() &&
      !this.reordering() &&
      this.editingDayId() === null
    );
  }

  async onReorder(event: CdkDragDrop<DailyLogDayRow[]>) {
    if (event.previousIndex === event.currentIndex || !this.canReorder()) {
      return;
    }
    const ordered = [...this.displayItems()];
    moveItemInArray(ordered, event.previousIndex, event.currentIndex);
    this.reordering.set(true);
    await this.service.reorderDayItems(
      this.selectedDate(),
      ordered.map((item) => item.tb_tyapp_dl_day_id),
    );
    this.reordering.set(false);
  }

  onAddInputFocus() {
    this.scrollAddRowAboveKeyboard();
    this.watchAddViewport();
  }

  onAddInputBlur() {
    this.clearAddScrollWatch();
  }

  hasLogged(day: DailyLogWeekDay): boolean {
    if (day.totalCount > 0) return true;
    const log = this.service.dayLogForDate(day.date);
    return !!(log?.mood_key || log?.title?.trim());
  }

  async onSelectMood(mood: DlMoodKey) {
    const next = this.dayMood() === mood ? null : mood;
    this.dayMood.set(next);
    await this.saveDayLog();
  }

  async onClearMood() {
    if (this.dayMood() === null) return;
    this.dayMood.set(null);
    await this.saveDayLog();
  }

  async onTitleBlur() {
    await this.saveDayLog();
  }

  private async saveDayLog() {
    const date = this.selectedDate();
    const log = this.service.dayLogForDate(date);
    const mood = this.dayMood();
    const title = this.dayTitle().trim() || null;
    if ((log?.mood_key ?? null) === mood && (log?.title ?? null) === title) {
      return;
    }
    await this.service.upsertDayLog(date, { moodKey: mood, title });
  }

  async onSuggestionSelected(
    event: MatAutocompleteSelectedEvent,
    input: HTMLInputElement,
  ) {
    const itemId = String(event.option.value ?? '');
    if (!itemId) return;
    // MatAutocomplete writes displayWith() into the native input after this
    // event, which would put the chosen name back into the box.
    this.resetAddPanel(input);
    await this.service.addExistingItemToDate(this.selectedDate(), itemId);
    this.scrollAddRowIntoView();
  }

  suggestionLabel(item: DailyLogLibraryItem): string {
    const emoji = item.emoji ? `${item.emoji} ` : '';
    return `${emoji}${item.item_text}`;
  }

  async onAddItem(event?: Event) {
    event?.preventDefault();
    const text = this.newItemText().trim();
    if (!text || this.service.busy()) return;

    const existing = findLibraryItemByName(this.service.libraryItems(), text);
    if (existing) {
      const ok = await this.service.addExistingItemToDate(
        this.selectedDate(),
        existing.tb_tyapp_dl_itm_id,
      );
      if (ok) {
        this.resetAddPanel(this.addItemInput()?.nativeElement);
        this.scrollAddRowIntoView();
      }
      return;
    }

    this.addSheetOpen.set(true);
  }

  async onSheetConfirm(event: {
    itemText: string;
    emoji: string | null;
    colourPresetKey: DlColourPresetKey;
    remarks: string | null;
  }) {
    const ok = await this.service.createLibraryItemAndAddToDate(this.selectedDate(), {
      itemText: event.itemText,
      emoji: event.emoji,
      colourPresetKey: event.colourPresetKey,
      remarks: event.remarks,
    });
    if (ok) {
      this.resetAddPanel(this.addItemInput()?.nativeElement);
      this.scrollAddRowIntoView();
    }
  }

  closeAddSheet() {
    this.addSheetOpen.set(false);
  }

  resetAddPanel(input?: HTMLInputElement) {
    this.newItemText.set('');
    this.addSheetOpen.set(false);
    if (this.emojiPickerTarget() === 'edit') this.emojiPickerTarget.set(null);
    const native = input ?? this.addItemInput()?.nativeElement;
    if (native) native.value = '';
    queueMicrotask(() => {
      this.newItemText.set('');
      if (native) native.value = '';
    });
  }

  private scrollAddRowIntoView() {
    this.scrollAddRowAboveKeyboard();
  }

  private scrollAddRowAboveKeyboard() {
    const row = this.addRow()?.nativeElement;
    if (!row) return;
    const scroller = row.closest('.main-scroll-view');
    const visibleBottom = window.visualViewport
      ? window.visualViewport.height + window.visualViewport.offsetTop
      : window.innerHeight;
    const margin = 20;
    const overflow = row.getBoundingClientRect().bottom - (visibleBottom - margin);
    if (overflow > 0) {
      if (scroller instanceof HTMLElement) {
        scroller.scrollTop += overflow;
      } else {
        row.scrollIntoView({ block: 'end', behavior: 'smooth' });
      }
    }
  }

  private watchAddViewport() {
    this.clearAddScrollWatch();
    const run = () => this.scrollAddRowAboveKeyboard();
    this.addScrollTimers = [
      setTimeout(run, 250),
      setTimeout(run, 550),
    ];
    const viewport = window.visualViewport;
    if (!viewport) return;
    const onResize = () => run();
    viewport.addEventListener('resize', onResize);
    this.addViewportUnsub = () => viewport.removeEventListener('resize', onResize);
  }

  private clearAddScrollWatch() {
    for (const timer of this.addScrollTimers) clearTimeout(timer);
    this.addScrollTimers = [];
    this.addViewportUnsub?.();
    this.addViewportUnsub = null;
  }

  selectEditColour(key: DlColourPresetKey) {
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
    if (this.emojiPickerTarget() === 'edit') this.editEmoji = emoji;
    this.closeEmojiPicker();
  }

  clearEditEmoji() {
    this.editEmoji = null;
  }

  async onUseTemplate() {
    await this.service.fetchTemplateItems();
    const ok = await this.service.createFromTemplate(this.selectedDate());
    if (!ok && this.service.templateItems().length === 0) {
      this.showTemplateHint.set(true);
    }
  }

  async onCopyYesterday() {
    await this.service.copyPreviousDay(this.selectedDate());
  }

  openTemplate() {
    void this.router.navigate(['/daily-log/template']);
  }
}
