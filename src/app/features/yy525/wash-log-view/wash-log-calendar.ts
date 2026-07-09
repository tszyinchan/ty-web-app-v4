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
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { RouterModule, Router, ActivatedRoute } from '@angular/router';
import { BreakpointObserver } from '@angular/cdk/layout';

import { CalendarMonthViewComponent, CalendarEvent } from 'angular-calendar';
import { startOfDay, addMonths, subMonths } from 'date-fns';

import { WashLogService } from './wash-log.service';
import { HeaderService } from '../../../core/services/header.service';

@Component({
  selector: 'app-wash-log-calendar',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    CalendarMonthViewComponent,
  ],
  templateUrl: './wash-log-calendar.html',
  styleUrl: './wash-log-calendar.scss',
})
export class WashLogCalendar implements OnInit, OnDestroy {
  public washLogService = inject(WashLogService);
  private headerService = inject(HeaderService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
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

  ngOnDestroy() {
    this.headerService.clear();
  }
}
