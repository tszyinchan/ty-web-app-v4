import { CommonModule } from '@angular/common';
import {
  Component,
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
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Subscription } from 'rxjs';

import { HeaderService } from '../../../../core/services/header.service';
import { formatDate, parseLocalDate } from '../../../../core/utils/date-time.util';
import { DailyChecklistItem } from './daily-checklist.model';
import { DailyChecklistService } from './daily-checklist.service';
import {
  completionPercent,
  filterItemSuggestions,
  isDailyItemCompleted,
  normalizeChecklistDateParam,
  shiftChecklistDate,
  sortDailyItemsForDisplay,
} from './daily-checklist.util';

@Component({
  selector: 'app-daily-checklist-page',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatAutocompleteModule,
    MatButtonModule,
    MatCheckboxModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
  ],
  templateUrl: './daily-checklist-page.html',
  styleUrl: './daily-checklist-page.scss',
})
export class DailyChecklistPage implements OnInit, OnDestroy {
  readonly service = inject(DailyChecklistService);
  private headerService = inject(HeaderService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  private querySub?: Subscription;
  private readonly addInput = viewChild<ElementRef<HTMLInputElement>>('addInput');

  selectedDate = signal(formatDate(new Date()));
  pickerDate = signal<Date>(new Date());
  newItemText = signal('');
  editingId = signal<string | null>(null);
  editText = '';
  editRemarks = '';
  showStandardHint = signal(false);

  readonly today = formatDate(new Date());

  readonly displayItems = computed(() =>
    sortDailyItemsForDisplay(this.service.items()),
  );

  readonly completedCount = computed(
    () => this.service.items().filter((item) => isDailyItemCompleted(item)).length,
  );

  readonly totalCount = computed(() => this.service.items().length);

  readonly progressPercent = computed(() =>
    completionPercent(this.completedCount(), this.totalCount()),
  );

  readonly isEmpty = computed(
    () => !this.service.loading() && this.service.items().length === 0,
  );

  readonly isToday = computed(() => this.selectedDate() === this.today);

  readonly filteredSuggestions = computed(() =>
    filterItemSuggestions(this.service.suggestions(), this.newItemText()),
  );

  ngOnInit() {
    const isBusy = computed(
      () => this.service.loading() || this.service.busy(),
    );

    this.headerService.setConfig({
      title: 'Daily Checklist',
      actions: [
        {
          label: 'Dashboard',
          icon: 'insights',
          type: 'secondary',
          onClick: () => this.router.navigate(['/daily-checklist/dashboard']),
        },
        {
          label: 'Standard Checklist',
          icon: 'playlist_add_check',
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
      this.pickerDate.set(parseLocalDate(normalized) ?? new Date());
      this.editingId.set(null);
      this.showStandardHint.set(false);
      void this.service.fetchItemsForDate(normalized);
    });

    void this.service.fetchSuggestions();
    void this.service.fetchTemplateItems();
  }

  ngOnDestroy() {
    this.querySub?.unsubscribe();
    this.headerService.clear();
  }

  goToDate(dateStr: string, replaceUrl = false) {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { date: dateStr },
      replaceUrl,
    });
  }

  onPickerChange(value: Date | null) {
    if (!value) return;
    this.goToDate(formatDate(value));
  }

  goPrev() {
    this.goToDate(shiftChecklistDate(this.selectedDate(), -1));
  }

  goNext() {
    this.goToDate(shiftChecklistDate(this.selectedDate(), 1));
  }

  goToday() {
    this.goToDate(this.today);
  }

  async onRefresh() {
    await Promise.all([
      this.service.fetchItemsForDate(this.selectedDate()),
      this.service.fetchTemplateItems(true),
      this.service.fetchSuggestions(true),
    ]);
  }

  isCompleted(item: DailyChecklistItem): boolean {
    return isDailyItemCompleted(item);
  }

  async onToggle(item: DailyChecklistItem) {
    if (this.editingId()) return;
    await this.service.toggleDailyItemCompletion(item);
  }

  startEdit(item: DailyChecklistItem) {
    this.editingId.set(item.tb_tyapp_dcl_itm_id);
    this.editText = item.item_text;
    this.editRemarks = item.remarks ?? '';
  }

  cancelEdit() {
    this.editingId.set(null);
    this.editText = '';
    this.editRemarks = '';
  }

  async saveEdit() {
    const id = this.editingId();
    if (!id) return;
    const ok = await this.service.updateDailyItem(
      id,
      this.editText,
      this.editRemarks,
    );
    if (ok) this.cancelEdit();
  }

  async onDelete(item: DailyChecklistItem) {
    if (!confirm(`Delete "${item.item_text}"?`)) return;
    if (this.editingId() === item.tb_tyapp_dcl_itm_id) this.cancelEdit();
    await this.service.deleteDailyItem(item.tb_tyapp_dcl_itm_id);
  }

  onSuggestionSelected(event: MatAutocompleteSelectedEvent) {
    this.newItemText.set(String(event.option.value ?? ''));
  }

  async onAddItem(event?: Event) {
    event?.preventDefault();
    const text = this.newItemText().trim();
    if (!text || this.service.busy()) return;
    const ok = await this.service.addDailyItem(this.selectedDate(), text);
    if (ok) this.newItemText.set('');
  }

  focusAdd() {
    this.addInput()?.nativeElement.focus();
  }

  async onUseStandard() {
    if (this.service.items().length > 0) return;
    await this.service.fetchTemplateItems(true);
    const ok = await this.service.createFromTemplate(this.selectedDate());
    if (!ok && this.service.templateItems().length === 0) {
      this.showStandardHint.set(true);
    }
  }

  async onCopyYesterday() {
    if (this.service.items().length > 0) return;
    await this.service.copyPreviousDay(this.selectedDate());
  }

  openStandard() {
    void this.router.navigate(['/daily-checklist/standard']);
  }
}
