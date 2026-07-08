import { CommonModule } from '@angular/common';
import {
  Component,
  OnInit,
  OnDestroy,
  inject,
  computed,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { RouterModule, Router, ActivatedRoute } from '@angular/router';

import {
  CalendarMonthViewComponent,
  CalendarWeekViewComponent,
  CalendarDayViewComponent,
  CalendarEvent,
  CalendarView,
} from 'angular-calendar';
import {
  startOfDay,
  addMonths,
  subMonths,
  addWeeks,
  subWeeks,
  addDays,
  subDays,
} from 'date-fns';

import { WashLogService } from './wash-log.service';
import { HeaderService } from '../../../core/services/header.service';

@Component({
  selector: 'app-wash-log-calendar',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatIconModule,
    MatProgressSpinnerModule,
    CalendarMonthViewComponent,
    CalendarWeekViewComponent,
    CalendarDayViewComponent,
  ],
  templateUrl: './wash-log-calendar.html',
  styleUrl: './wash-log-calendar.scss',
})
export class WashLogCalendar implements OnInit, OnDestroy {
  public washLogService = inject(WashLogService);
  private headerService = inject(HeaderService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  viewDate = signal<Date>(new Date());
  view = signal<CalendarView>(CalendarView.Month);
  CalendarView = CalendarView;

  calendarEventsVM = computed<CalendarEvent[]>(() => {
    return this.washLogService.washLogs().map((item) => {
      const [year, month, day] = item.date.split('-');
      const localDate = new Date(Number(year), Number(month) - 1, Number(day));

      return {
        start: startOfDay(localDate),
        title: `👕 ${item.title}`,
        allDay: true,
        meta: { item },
        color: {
          primary: 'var(--mat-sys-primary)',
          secondary: 'var(--mat-sys-primary-container)',
        },
      };
    });
  });

  viewTitle = computed(() => {
    const date = this.viewDate();
    if (this.view() === CalendarView.Day) {
      return date.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    }
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
  });

  ngOnInit() {
    const isLoading = computed(() => this.washLogService.loading());

    this.headerService.setConfig({
      title: 'Laundry Calendar',
      actions: [
        {
          label: 'Refresh',
          icon: 'refresh',
          type: 'secondary',
          disabled: isLoading,
          onClick: () => this.washLogService.fetchAllLogs(true),
        },
        {
          label: 'List View',
          icon: 'view_list',
          type: 'primary',
          disabled: isLoading,
          onClick: () =>
            this.router.navigate(['../list'], { relativeTo: this.route }),
        },
      ],
    });

    this.washLogService.fetchAllLogs();
  }

  previous() {
    const current = this.viewDate();
    if (this.view() === CalendarView.Month)
      this.viewDate.set(subMonths(current, 1));
    else if (this.view() === CalendarView.Week)
      this.viewDate.set(subWeeks(current, 1));
    else this.viewDate.set(subDays(current, 1));
  }

  next() {
    const current = this.viewDate();
    if (this.view() === CalendarView.Month)
      this.viewDate.set(addMonths(current, 1));
    else if (this.view() === CalendarView.Week)
      this.viewDate.set(addWeeks(current, 1));
    else this.viewDate.set(addDays(current, 1));
  }

  goToToday() {
    this.viewDate.set(new Date());
  }

  ngOnDestroy() {
    this.headerService.clear();
  }
}
