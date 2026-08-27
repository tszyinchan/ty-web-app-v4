import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';

import { HeaderService } from '../../../../core/services/header.service';
import { formatDate } from '../../../../core/utils/date-time.util';
import { DailyLogStatsRange } from './daily-log.model';
import { DailyLogChrome, DailyLogChromeAction } from './daily-log-chrome';
import { DailyLogService } from './daily-log.service';
import { buildStatsVm } from './daily-log.util';

const STATS_RANGES: {
  value: DailyLogStatsRange;
  label: string;
}[] = [
  { value: 'week', label: 'This week' },
  { value: 'last30', label: 'Last 30 days' },
  { value: 'all', label: 'All time' },
];

@Component({
  selector: 'app-daily-log-stats',
  standalone: true,
  imports: [CommonModule, DailyLogChrome],
  templateUrl: './daily-log-stats.html',
  styleUrl: './daily-log-stats.scss',
})
export class DailyLogStats implements OnInit, OnDestroy {
  readonly service = inject(DailyLogService);
  private headerService = inject(HeaderService);

  readonly range = signal<DailyLogStatsRange>('all');
  readonly ranges = STATS_RANGES;

  readonly stats = computed(() =>
    buildStatsVm(
      this.service.historyItems(),
      this.range(),
      formatDate(new Date()),
    ),
  );

  readonly chromeActions = computed<DailyLogChromeAction[]>(() => [
    {
      label: 'Refresh',
      icon: 'refresh',
      disabled: this.service.loading(),
      onClick: () => void this.service.fetchHistoryItems(true),
    },
  ]);

  ngOnInit() {
    this.headerService.clear();
    void this.service.fetchHistoryItems(true);
  }

  ngOnDestroy() {
    this.headerService.clear();
  }

  setRange(value: DailyLogStatsRange) {
    this.range.set(value);
  }
}
