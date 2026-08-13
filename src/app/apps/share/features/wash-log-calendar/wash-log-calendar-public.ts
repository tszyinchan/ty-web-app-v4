import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, computed, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { BreakpointObserver } from '@angular/cdk/layout';

import { CalendarMonthViewComponent, CalendarEvent } from 'angular-calendar';
import { startOfDay, addMonths, subMonths } from 'date-fns';

import { WashLogService } from '../../../jaxfr/features/yy525/wash-log-view/wash-log.service';

/**
 * Public, no-login read-only counterpart of the admin Wash Log Calendar.
 * Reuses WashLogService as-is (no auth dependency), but has its own minimal
 * toolbar instead of HeaderService, since this page has no admin chrome.
 */
@Component({
  selector: 'app-wash-log-calendar-public',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    CalendarMonthViewComponent,
  ],
  templateUrl: './wash-log-calendar-public.html',
  styleUrl: './wash-log-calendar-public.scss',
})
export class WashLogCalendarPublic implements OnInit {
  public washLogService = inject(WashLogService);
  private breakpointObserver = inject(BreakpointObserver);

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

  ngOnInit() {
    this.breakpointObserver
      .observe('(max-width: 768px)')
      .subscribe((result) => {
        this.dayFormat.set(result.matches ? 'EEEEE' : 'EEE');
      });

    this.washLogService.fetchAllLogs();
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
