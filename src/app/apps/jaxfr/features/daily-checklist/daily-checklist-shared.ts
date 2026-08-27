import { CommonModule } from '@angular/common';
import {
  Component,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { CalendarEvent, CalendarMonthViewComponent } from 'angular-calendar';
import { addMonths, endOfMonth, startOfDay, startOfMonth, subMonths } from 'date-fns';
import { Subscription } from 'rxjs';

import { HeaderService } from '../../../../core/services/header.service';
import { AuthService } from '../../../../core/services/auth.service';
import { DisplayNamePipe } from '../../../../core/pipes/display-name.pipe';
import { formatDate } from '../../../../core/utils/date-time.util';
import { UserService } from '../user/user.service';
import {
  DailyChecklistDayLog,
  DailyChecklistDayRow,
  DclMoodKey,
} from './daily-checklist.model';
import { DailyChecklistFace } from './daily-checklist-face';
import { DailyChecklistService } from './daily-checklist.service';
import {
  DATE_QUERY_PATTERN,
  colourClass,
  doodleDateParts,
  isDayItemCompleted,
  normalizeChecklistDateParam,
  sortDayRowsForDisplay,
} from './daily-checklist.util';

interface SharedPersonDay {
  userId: string;
  name: string;
  isSelf: boolean;
  log: DailyChecklistDayLog | null;
  items: DailyChecklistDayRow[];
}

@Component({
  selector: 'app-daily-checklist-shared',
  standalone: true,
  imports: [
    CommonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    CalendarMonthViewComponent,
    DailyChecklistFace,
  ],
  providers: [DisplayNamePipe],
  templateUrl: './daily-checklist-shared.html',
  styleUrl: './daily-checklist-shared.scss',
})
export class DailyChecklistShared implements OnInit, OnDestroy {
  readonly service = inject(DailyChecklistService);
  private headerService = inject(HeaderService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private authService = inject(AuthService);
  private userService = inject(UserService);
  private displayNamePipe = inject(DisplayNamePipe);

  private querySub?: Subscription;
  viewDate = signal(new Date());
  selectedDate = signal<string | null>(null);

  readonly doodleDate = computed(() => {
    const date = this.selectedDate();
    return date ? doodleDateParts(date) : { dayNum: '', weekday: '' };
  });

  readonly calendarEvents = computed<CalendarEvent[]>(() => {
    const logs = this.service.sharedDayLogs();
    const items = this.service.sharedDayItems();
    const seen = new Set<string>();
    const events: CalendarEvent[] = [];

    const push = (userId: string, dateStr: string, mood: DclMoodKey | null) => {
      const key = `${userId}:${dateStr}`;
      if (seen.has(key)) return;
      seen.add(key);
      const [year, month, day] = dateStr.split('-');
      events.push({
        start: startOfDay(
          new Date(Number(year), Number(month) - 1, Number(day)),
        ),
        title: userId,
        meta: { userId, mood },
      });
    };

    for (const log of logs) {
      push(log.user_id, log.checklist_date, log.mood_key);
    }
    for (const item of items) {
      const log = logs.find(
        (row) =>
          row.user_id === item.user_id &&
          row.checklist_date === item.checklist_date,
      );
      push(item.user_id, item.checklist_date, log?.mood_key ?? null);
    }
    return events;
  });

  readonly feedPeople = computed<SharedPersonDay[]>(() => {
    const date = this.selectedDate();
    if (!date) return [];
    const me = this.authService.userProfile()?.user_id ?? '';
    const logs = this.service
      .sharedDayLogs()
      .filter((row) => row.checklist_date === date);
    const items = this.service
      .sharedDayItems()
      .filter((row) => row.checklist_date === date);
    const ids = new Set<string>([
      ...logs.map((row) => row.user_id),
      ...items.map((row) => row.user_id),
    ]);
    const people = [...ids].map((userId) => ({
      userId,
      name: this.displayUserName(userId),
      isSelf: userId === me,
      log: logs.find((row) => row.user_id === userId) ?? null,
      items: sortDayRowsForDisplay(items.filter((row) => row.user_id === userId)),
    }));
    people.sort((a, b) => {
      if (a.isSelf !== b.isSelf) return a.isSelf ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    return people;
  });

  ngOnInit() {
    void this.userService.fetchAllUsers();
    void this.userService.fetchGroups();

    this.querySub = this.route.queryParamMap.subscribe((params) => {
      const raw = params.get('date');
      if (!raw) {
        this.selectedDate.set(null);
        this.setCalendarHeader();
        void this.loadMonth(this.viewDate());
        return;
      }
      const normalized = normalizeChecklistDateParam(raw);
      if (raw !== normalized && DATE_QUERY_PATTERN.test(raw) === false) {
        void this.router.navigate([], {
          queryParams: { date: normalized },
          replaceUrl: true,
        });
        return;
      }
      this.selectedDate.set(normalized);
      const parsed = new Date(`${normalized}T00:00:00`);
      this.viewDate.set(parsed);
      this.setFeedHeader(normalized);
      void this.loadMonth(parsed);
    });
  }

  ngOnDestroy() {
    this.querySub?.unsubscribe();
    this.headerService.clear();
  }

  isCompleted(item: DailyChecklistDayRow): boolean {
    return isDayItemCompleted(item);
  }

  colourClass = colourClass;

  displayUserName(id: string): string {
    if (id === this.authService.userProfile()?.user_id) return 'You';
    const user = this.userService.users().find((item) => item.user_id === id);
    return this.displayNamePipe.transform(user);
  }

  eventMood(event: CalendarEvent): DclMoodKey | null {
    const meta = event.meta as { mood?: DclMoodKey | null } | undefined;
    return meta?.mood ?? null;
  }

  onDayClicked(date: Date) {
    void this.router.navigate([], {
      queryParams: { date: formatDate(date) },
    });
  }

  goPrevMonth() {
    const next = subMonths(this.viewDate(), 1);
    this.viewDate.set(next);
    this.setCalendarHeader();
    void this.loadMonth(next);
  }

  goNextMonth() {
    const next = addMonths(this.viewDate(), 1);
    this.viewDate.set(next);
    this.setCalendarHeader();
    void this.loadMonth(next);
  }

  closeFeed() {
    void this.router.navigate([], { queryParams: {} });
  }

  openToday() {
    const date = this.selectedDate();
    void this.router.navigate(['/daily-checklist'], {
      queryParams: date ? { date } : {},
    });
  }

  private setCalendarHeader() {
    const label = this.viewDate().toLocaleString('en-US', {
      month: 'long',
      year: 'numeric',
    });
    this.headerService.setConfig({
      title: `Others · ${label}`,
      backLink: '/daily-checklist',
      actions: [
        {
          label: 'Previous month',
          icon: 'chevron_left',
          type: 'icon',
          onClick: () => this.goPrevMonth(),
        },
        {
          label: 'Next month',
          icon: 'chevron_right',
          type: 'icon',
          onClick: () => this.goNextMonth(),
        },
        {
          label: 'Who can view',
          icon: 'group_add',
          type: 'secondary',
          onClick: () => this.router.navigate(['/daily-checklist/share']),
        },
      ],
    });
  }

  private setFeedHeader(date: string) {
    this.headerService.setConfig({
      title: date,
      backLink: '/daily-checklist/shared',
      actions: [
        {
          label: 'Back to calendar',
          icon: 'calendar_month',
          type: 'secondary',
          onClick: () => this.closeFeed(),
        },
      ],
    });
  }

  private async loadMonth(date: Date) {
    await this.service.fetchSharedRange(
      formatDate(startOfMonth(date)),
      formatDate(endOfMonth(date)),
    );
  }
}
