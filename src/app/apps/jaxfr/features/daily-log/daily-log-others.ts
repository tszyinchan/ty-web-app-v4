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
import { CalendarEvent, CalendarMonthViewComponent } from 'angular-calendar';
import { addMonths, endOfMonth, startOfDay, startOfMonth, subMonths } from 'date-fns';
import { Subscription } from 'rxjs';

import { HeaderService } from '../../../../core/services/header.service';
import { AuthService } from '../../../../core/services/auth.service';
import { DisplayNamePipe } from '../../../../core/pipes/display-name.pipe';
import { formatDate } from '../../../../core/utils/date-time.util';
import { UserService } from '../user/user.service';
import {
  DailyLogDay,
  DailyLogDayRow,
  DlMoodKey,
} from './daily-log.model';
import { DailyLogChrome, DailyLogChromeAction, DailyLogChromeMonthNav } from './daily-log-chrome';
import { DailyLogFace } from './daily-log-face';
import { DailyLogIcon } from './daily-log-icon';
import { DailyLogService } from './daily-log.service';
import {
  DATE_QUERY_PATTERN,
  colourClass,
  logDateParts,
  isDayItemCompleted,
  normalizeLogDateParam,
  sortDayRowsForDisplay,
} from './daily-log.util';

interface OthersPersonDay {
  userId: string;
  name: string;
  isSelf: boolean;
  log: DailyLogDay | null;
  items: DailyLogDayRow[];
}

@Component({
  selector: 'app-daily-log-others',
  standalone: true,
  imports: [
    CommonModule,
    CalendarMonthViewComponent,
    DailyLogChrome,
    DailyLogFace,
    DailyLogIcon,
  ],
  providers: [DisplayNamePipe],
  templateUrl: './daily-log-others.html',
  styleUrl: './daily-log-others.scss',
})
export class DailyLogOthers implements OnInit, OnDestroy {
  readonly service = inject(DailyLogService);
  private headerService = inject(HeaderService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private authService = inject(AuthService);
  private userService = inject(UserService);
  private displayNamePipe = inject(DisplayNamePipe);

  private querySub?: Subscription;
  viewDate = signal(new Date());
  selectedDate = signal<string | null>(null);

  readonly logDate = computed(() => {
    const date = this.selectedDate();
    return date ? logDateParts(date) : { dayNum: '', weekday: '' };
  });

  readonly monthLabel = computed(() =>
    this.viewDate().toLocaleString('en-US', {
      month: 'short',
      year: 'numeric',
    }),
  );

  readonly chromeTitle = computed(() => this.selectedDate() ?? 'Others');

  readonly isOnCurrentMonth = computed(() => {
    const view = this.viewDate();
    const now = new Date();
    return (
      view.getFullYear() === now.getFullYear() &&
      view.getMonth() === now.getMonth()
    );
  });

  readonly chromeActions = computed<DailyLogChromeAction[]>(() => {
    if (this.selectedDate()) {
      return [
        {
          label: 'Calendar',
          icon: 'calendar',
          onClick: () => this.closeFeed(),
        },
      ];
    }
    return [
      {
        label: 'Today',
        icon: 'today',
        disabled: this.isOnCurrentMonth(),
        onClick: () => this.goTodayMonth(),
      },
      {
        label: 'Who can view',
        icon: 'people',
        onClick: () => void this.router.navigate(['/daily-log/viewers']),
      },
    ];
  });

  readonly monthNav = computed<DailyLogChromeMonthNav | null>(() => {
    if (this.selectedDate()) return null;
    return {
      prev: () => this.goPrevMonth(),
      next: () => this.goNextMonth(),
    };
  });

  readonly calendarEvents = computed<CalendarEvent[]>(() => {
    const logs = this.service.othersDayLogs();
    const items = this.service.othersDayItems();
    const seen = new Set<string>();
    const events: CalendarEvent[] = [];

    const push = (userId: string, dateStr: string, mood: DlMoodKey | null) => {
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
      if (this.userService.isUnavailableId(log.user_id)) continue;
      push(log.user_id, log.log_date, log.mood_key);
    }
    for (const item of items) {
      if (this.userService.isUnavailableId(item.user_id)) continue;
      const log = logs.find(
        (row) =>
          row.user_id === item.user_id &&
          row.log_date === item.log_date,
      );
      push(item.user_id, item.log_date, log?.mood_key ?? null);
    }
    return events;
  });

  readonly feedPeople = computed<OthersPersonDay[]>(() => {
    const date = this.selectedDate();
    if (!date) return [];
    const me = this.authService.userProfile()?.user_id ?? '';
    const logs = this.service
      .othersDayLogs()
      .filter(
        (row) =>
          row.log_date === date &&
          (row.user_id === me || !this.userService.isUnavailableId(row.user_id)),
      );
    const items = this.service
      .othersDayItems()
      .filter(
        (row) =>
          row.log_date === date &&
          (row.user_id === me || !this.userService.isUnavailableId(row.user_id)),
      );
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
    this.headerService.clear();
    void this.userService.fetchAllUsers();
    void this.userService.fetchGroups();

    this.querySub = this.route.queryParamMap.subscribe((params) => {
      const raw = params.get('date');
      if (!raw) {
        this.selectedDate.set(null);
        void this.loadMonth(this.viewDate());
        return;
      }
      const normalized = normalizeLogDateParam(raw);
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
      void this.loadMonth(parsed);
    });
  }

  ngOnDestroy() {
    this.querySub?.unsubscribe();
    this.headerService.clear();
  }

  isCompleted(item: DailyLogDayRow): boolean {
    return isDayItemCompleted(item);
  }

  colourClass = colourClass;

  displayUserName(id: string): string {
    if (id === this.authService.userProfile()?.user_id) return 'You';
    const user = this.userService.users().find((item) => item.user_id === id);
    return this.displayNamePipe.transform(user);
  }

  eventMood(event: CalendarEvent): DlMoodKey | null {
    const meta = event.meta as { mood?: DlMoodKey | null } | undefined;
    return meta?.mood ?? null;
  }

  visibleMoodFaces(events: CalendarEvent[]): CalendarEvent[] {
    return events.filter((event) => this.eventMood(event)).slice(0, 3);
  }

  extraMoodCount(events: CalendarEvent[]): number {
    return Math.max(0, events.filter((event) => this.eventMood(event)).length - 3);
  }

  onDayClicked(date: Date) {
    void this.router.navigate([], {
      queryParams: { date: formatDate(date) },
    });
  }

  goPrevMonth() {
    const next = subMonths(this.viewDate(), 1);
    this.viewDate.set(next);
    void this.loadMonth(next);
  }

  goNextMonth() {
    const next = addMonths(this.viewDate(), 1);
    this.viewDate.set(next);
    void this.loadMonth(next);
  }

  goTodayMonth() {
    const today = new Date();
    this.viewDate.set(today);
    void this.loadMonth(today);
  }

  closeFeed() {
    void this.router.navigate([], { queryParams: {} });
  }

  openToday() {
    const date = this.selectedDate();
    void this.router.navigate(['/daily-log'], {
      queryParams: date ? { date } : {},
    });
  }

  private async loadMonth(date: Date) {
    await this.service.fetchOthersRange(
      formatDate(startOfMonth(date)),
      formatDate(endOfMonth(date)),
    );
  }
}
