import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { HeaderService } from '../../../../core/services/header.service';
import { formatDate } from '../../../../core/utils/date-time.util';
import { DailyChecklistDashboardRange } from './daily-checklist.model';
import { DailyChecklistService } from './daily-checklist.service';
import { buildDashboardVm } from './daily-checklist.util';

const DASHBOARD_RANGES: {
  value: DailyChecklistDashboardRange;
  label: string;
}[] = [
  { value: 'week', label: 'This week' },
  { value: 'last30', label: 'Last 30 days' },
  { value: 'all', label: 'All time' },
];

@Component({
  selector: 'app-daily-checklist-dashboard',
  standalone: true,
  imports: [CommonModule, MatProgressSpinnerModule],
  templateUrl: './daily-checklist-dashboard.html',
  styleUrl: './daily-checklist-dashboard.scss',
})
export class DailyChecklistDashboard implements OnInit, OnDestroy {
  readonly service = inject(DailyChecklistService);
  private headerService = inject(HeaderService);

  readonly range = signal<DailyChecklistDashboardRange>('all');
  readonly ranges = DASHBOARD_RANGES;

  readonly dashboard = computed(() =>
    buildDashboardVm(
      this.service.historyItems(),
      this.range(),
      formatDate(new Date()),
    ),
  );

  ngOnInit() {
    const isLoading = computed(() => this.service.loading());

    this.headerService.setConfig({
      title: 'Stats',
      backLink: '/daily-checklist',
      actions: [
        {
          label: 'Refresh',
          icon: 'refresh',
          type: 'secondary',
          disabled: isLoading,
          onClick: () => void this.service.fetchHistoryItems(true),
        },
      ],
    });

    void this.service.fetchHistoryItems(true);
  }

  ngOnDestroy() {
    this.headerService.clear();
  }

  setRange(value: DailyChecklistDashboardRange) {
    this.range.set(value);
  }
}
