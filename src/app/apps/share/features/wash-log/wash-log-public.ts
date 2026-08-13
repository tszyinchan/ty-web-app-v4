import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy, inject, computed, signal, effect } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { BreakpointObserver } from '@angular/cdk/layout';

import { CalendarMonthViewComponent, CalendarEvent } from 'angular-calendar';
import { startOfDay, addMonths, subMonths } from 'date-fns';
import { format } from 'date-fns-tz';

import {
  groupItemsByPeriod,
  getWeekRange,
} from '../../../../core/utils/date-time.util';
import { HeaderService } from '../../../../core/services/header.service';
import { AppToolbar } from '../../../../core/components/app-toolbar/app-toolbar';
import { WashLogService } from './wash-log.service';

type WashLogViewMode = 'calendar' | 'list';

/**
 * Public, no-login Wash Log module for the share subdomain. Combines the
 * Calendar and weekly List views (previously two separate admin-only
 * routes) into one component with a local view toggle, since a
 * capability-URL page doesn't need its own sub-routing. Opts into the
 * shared AppToolbar (same one jaxfr's Layout uses) via HeaderService,
 * mirroring how the old admin WashLogCalendar drove its title/actions.
 */
@Component({
  selector: 'app-wash-log-public',
  standalone: true,
  imports: [CommonModule, MatIconModule, CalendarMonthViewComponent, AppToolbar],
  templateUrl: './wash-log-public.html',
  styleUrl: './wash-log-public.scss',
})
export class WashLogPublic implements OnInit, OnDestroy {
  public washLogService = inject(WashLogService);
  private headerService = inject(HeaderService);
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

  constructor() {
    effect(() => {
      const mode = this.viewMode();
      const currentDate = this.viewDate();
      const isLoading = this.washLogService.loading();

      if (mode === 'calendar') {
        this.headerService.setConfig({
          title: format(currentDate, 'MMMM yyyy'),
          actions: [
            {
              label: 'Today',
              icon: 'today',
              type: 'icon',
              onClick: () => this.goToToday(),
            },
            {
              label: 'Previous Month',
              icon: 'chevron_left',
              type: 'icon',
              onClick: () => this.previous(),
            },
            {
              label: 'Next Month',
              icon: 'chevron_right',
              type: 'icon',
              onClick: () => this.next(),
            },
            {
              label: 'Refresh',
              icon: 'refresh',
              type: 'secondary',
              disabled: signal<boolean>(isLoading),
              onClick: () => this.washLogService.fetchAllLogs(true),
            },
            {
              label: 'List View',
              icon: 'view_list',
              type: 'primary',
              disabled: signal<boolean>(isLoading),
              onClick: () => this.toggleViewMode(),
            },
          ],
        });
      } else {
        this.headerService.setConfig({
          title: 'Laundry Logs',
          actions: [
            {
              label: 'Refresh',
              icon: 'refresh',
              type: 'secondary',
              disabled: signal<boolean>(isLoading),
              onClick: () => this.washLogService.fetchAllLogs(true),
            },
            {
              label: 'Calendar View',
              icon: 'calendar_month',
              type: 'primary',
              disabled: signal<boolean>(isLoading),
              onClick: () => this.toggleViewMode(),
            },
          ],
        });
      }
    });
  }

  ngOnInit() {
    this.breakpointObserver
      .observe('(max-width: 768px)')
      .subscribe((result) => {
        this.dayFormat.set(result.matches ? 'EEEEE' : 'EEE');
      });

    this.washLogService.fetchAllLogs();
  }

  ngOnDestroy() {
    this.headerService.clear();
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
