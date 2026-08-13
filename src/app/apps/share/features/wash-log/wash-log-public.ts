import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, computed, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { BreakpointObserver } from '@angular/cdk/layout';

import { CalendarMonthViewComponent, CalendarEvent } from 'angular-calendar';
import { startOfDay, addMonths, subMonths } from 'date-fns';

import {
  groupItemsByPeriod,
  getWeekRange,
} from '../../../../core/utils/date-time.util';
import { WashLogService } from './wash-log.service';

type WashLogViewMode = 'calendar' | 'list';

/**
 * Public, no-login Wash Log module for the share subdomain. Combines the
 * Calendar and weekly List views (previously two separate admin-only
 * routes) into one component with a local view toggle, since a
 * capability-URL page doesn't need its own sub-routing.
 */
@Component({
  selector: 'app-wash-log-public',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    CalendarMonthViewComponent,
  ],
  templateUrl: './wash-log-public.html',
  styleUrl: './wash-log-public.scss',
})
export class WashLogPublic implements OnInit {
  public washLogService = inject(WashLogService);
  private breakpointObserver = inject(BreakpointObserver);

  viewMode = signal<WashLogViewMode>('calendar');
  viewDate = signal<Date>(new Date());
  dayFormat = signal<'EEE' | 'EEEEE'>('EEE');

  calendarEventsVM = computed<CalendarEvent[]>(() => {
    return this.washLogService.washLogs().map((item) => {
      const [year, month, day] = item.date.split('-');
      const localDate = new Date(Number(year), Number(month) - 1, Number(day));

      return {
        start: startOfDay(localDate),
        title: item.title,
        meta: { item },
      };
    });
  });

  groupedListVM = computed(() => {
    return groupItemsByPeriod(this.washLogService.washLogs(), (item) => {
      const range = getWeekRange(item.date);
      return range ? range.label : 'Unknown Week';
    });
  });

  ngOnInit() {
    this.breakpointObserver
      .observe('(max-width: 768px)')
      .subscribe((result) => {
        this.dayFormat.set(result.matches ? 'EEEEE' : 'EEE');
      });

    this.washLogService.fetchAllLogs();
  }

  toggleViewMode() {
    this.viewMode.update((mode) => (mode === 'calendar' ? 'list' : 'calendar'));
  }

  previous() {
    this.viewDate.set(subMonths(this.viewDate(), 1));
  }
  next() {
    this.viewDate.set(addMonths(this.viewDate(), 1));
  }
  goToToday() {
    this.viewDate.set(new Date());
  }
}
