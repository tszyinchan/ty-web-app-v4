import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy, inject, computed } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { RouterModule, Router, ActivatedRoute } from '@angular/router';
import { HeaderService } from '../../../core/services/header.service';
import {
  groupItemsByPeriod,
  getWeekRange,
} from '../../../core/utils/date-time.util';
import { WashLogService } from './wash-log.service';

@Component({
  selector: 'app-wash-log-list',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './wash-log-list.html',
})
export class WashLogList implements OnInit, OnDestroy {
  public washLogService = inject(WashLogService);
  private headerService = inject(HeaderService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  groupedListVM = computed(() => {
    return groupItemsByPeriod(this.washLogService.washLogs(), (item) => {
      const range = getWeekRange(item.date);
      return range ? range.label : 'Unknown Week';
    });
  });

  ngOnInit() {
    const isLoading = computed(() => this.washLogService.loading());

    this.headerService.setConfig({
      title: 'Laundry Logs',
      actions: [
        {
          label: 'Refresh',
          icon: 'refresh',
          type: 'secondary',
          disabled: isLoading,
          onClick: () => this.washLogService.fetchAllLogs(true),
        },
        {
          label: 'Calendar View',
          icon: 'calendar_month',
          type: 'primary',
          disabled: isLoading,
          onClick: () =>
            this.router.navigate(['../calendar'], { relativeTo: this.route }),
        },
      ],
    });

    this.washLogService.fetchAllLogs();
  }

  ngOnDestroy() {
    this.headerService.clear();
  }
}
