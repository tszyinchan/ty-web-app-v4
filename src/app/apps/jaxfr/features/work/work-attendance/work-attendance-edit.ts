import { CommonModule } from '@angular/common';
import {
  Component,
  OnInit,
  OnDestroy,
  DoCheck,
  HostListener,
  inject,
  NgZone,
  signal,
  computed,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import {
  parseLocalDate,
  formatDate,
  extractTime,
  buildSequentialIsoStrings,
  addMinutesToTime,
} from '../../../../../core/utils/date-time.util';

import { AuthService } from '../../../../../core/services/auth.service';
import {
  HeaderService,
  HeaderAction,
} from '../../../../../core/services/header.service';
import { UserService } from '../../user/user.service';
import { WorkEmploymentService } from '../work-employment/work-employment.service';
import { WorkAttendance } from './work-attendance.model';
import { WorkAttendanceService } from './work-attendance.service';
import { SelectOption } from '../../../../../core/models/common.model';
import { DisplayNamePipe } from '../../../../../core/pipes/display-name.pipe';

import { WorkScheduleService } from '../work-schedule/work-schedule.service';
import { WORK_SCHEDULE_NEW_RECORD_SHORTCUT } from '../../../../../app.constants';
import { exportToCsv } from '../../../../../core/utils/csv-export.util';
import { RecordStatus } from '../../../../../core/models/status.enum';
@Component({
  selector: 'app-work-attendance-edit',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatAutocompleteModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatSlideToggleModule,
  ],
  providers: [DisplayNamePipe],
  templateUrl: './work-attendance-edit.html',
  styleUrl: './work-attendance-edit.scss',
})
export class WorkAttendanceEdit implements OnInit, OnDestroy, DoCheck {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private zone = inject(NgZone);
  private headerService = inject(HeaderService);
  private displayNamePipe = inject(DisplayNamePipe);

  public workAttendanceService = inject(WorkAttendanceService);
  public workEmploymentService = inject(WorkEmploymentService);
  public workScheduleService = inject(WorkScheduleService);
  public userService = inject(UserService);
  public authService = inject(AuthService);

  public readonly addMins = addMinutesToTime;

  readonly RecordStatus = RecordStatus;

  item = signal<Partial<WorkAttendance> | null>(null);
  currentId: string | null = null;
  originalDataStr = signal<string>('');

  isDirty = signal(false);
  isSaveDisabled = signal(true);

  timeInputs = signal({
    start: '',
    meal_start: '',
    meal_end: '',
    break_start: '',
    break_end: '',
    end: '',
  });
  bindDate = signal<Date | null>(null);

  userSearch = signal<string>('');
  userOptions = computed<SelectOption[]>(() =>
    this.userService.pickerUsers().map((u) => ({
      value: u.user_id,
      label: this.displayNamePipe.transform(u),
    })),
  );
  filteredUsers = computed(() => {
    const q = this.userSearch().toLowerCase();
    return q
      ? this.userOptions().filter((opt) => opt.label.toLowerCase().includes(q))
      : this.userOptions();
  });

  filteredEmployments = computed(() => {
    const currentUserId = this.item()?.user_id;
    return this.workEmploymentService
      .workEmployments()
      .filter(
        (e) =>
          e.status === RecordStatus.Active && (!currentUserId || e.user_id === currentUserId),
      );
  });

  syncStatus = computed<'loading' | 'up-to-date' | 'unsaved' | 'none'>(() => {
    if (this.workAttendanceService.loading()) return 'loading';
    if (this.isDirty()) return 'unsaved';
    if (this.currentId) return 'up-to-date';
    return 'none';
  });

  applyKShortcut(mealStart: string) {
    const current = this.item();
    if (!current) return;

    current.mplm_id = WORK_SCHEDULE_NEW_RECORD_SHORTCUT.mplm_id;
    current.is_day_off = false;

    this.timeInputs.set({
      start: '09:00',
      meal_start: mealStart,
      meal_end: addMinutesToTime(mealStart, 30),
      break_start: addMinutesToTime(mealStart, 30),
      break_end: addMinutesToTime(mealStart, 60),
      end: '17:00',
    });

    this.item.set({ ...current });
  }

  updateTimeInput(
    field: keyof ReturnType<typeof this.timeInputs>,
    value: string,
  ) {
    this.timeInputs.update((t) => ({ ...t, [field]: value }));
  }

  @HostListener('window:beforeunload', ['$event'])
  onBeforeUnload(event: BeforeUnloadEvent) {
    if (this.isDirty()) {
      event.preventDefault();
      return false;
    }
    return true;
  }

  ngDoCheck() {
    const current = this.item();
    const original = this.originalDataStr();

    if (current && original) {
      const dateVal = this.bindDate();
      current.work_date = dateVal ? formatDate(dateVal) : '';

      const currentlyDirty =
        JSON.stringify(current) !== original ||
        JSON.stringify(this.timeInputs()) !==
          sessionStorage.getItem('orig_times');

      if (this.isDirty() !== currentlyDirty) {
        this.isDirty.set(currentlyDirty);
      }

      const disabled =
        this.workAttendanceService.loading() ||
        (!!this.currentId && !currentlyDirty) ||
        !current.user_id ||
        !current.work_date ||
        (!current.is_day_off && !current.mplm_id);

      if (this.isSaveDisabled() !== disabled) {
        this.isSaveDisabled.set(disabled);
      }
    }
  }

  displayUserName(id: string): string {
    const found = this.userOptions().find((opt) => opt.value === id);
    return found ? found.label : '';
  }

  async ngOnInit() {
    this.currentId = this.route.snapshot.paramMap.get('id');

    await Promise.all([
      this.workEmploymentService.fetchAllWorkEmployments(),
      this.userService.fetchAllUsers(),
      this.workScheduleService.fetchAllWorkSchedules(),
    ]);

    if (this.currentId) {
      const fresh = await this.workAttendanceService.fetchWorkAttendanceById(
        this.currentId,
      );
      this.zone.run(() => {
        if (fresh) {
          this.item.set(structuredClone(fresh));
          this.originalDataStr.set(JSON.stringify(fresh));
          this.userSearch.set(fresh.user_id);
          this.bindDate.set(parseLocalDate(fresh.work_date));

          const times = {
            start: extractTime(fresh.start_time),
            meal_start: extractTime(fresh.meal_start_time),
            meal_end: extractTime(fresh.meal_end_time),
            break_start: extractTime(fresh.break_start_time),
            break_end: extractTime(fresh.break_end_time),
            end: extractTime(fresh.end_time),
          };
          this.timeInputs.set(times);
          sessionStorage.setItem('orig_times', JSON.stringify(times));
        } else if (!this.item()) {
          this.router.navigate(['/work/attendance/list']);
        }
      });
    } else {
      let nextDate = new Date();
      const attendances = this.workAttendanceService.workAttendances();
      const targetUserId = this.authService.userProfile()?.user_id || '';

      if (attendances.length > 0) {
        const latestDateStr = attendances[0].work_date;
        const latestDateObj = parseLocalDate(latestDateStr);
        if (latestDateObj) {
          latestDateObj.setDate(latestDateObj.getDate() + 1);
          nextDate = latestDateObj;
        }
      }

      const dateStr = formatDate(nextDate);

      const newAttn: Partial<WorkAttendance> = {
        user_id: targetUserId,
        work_date: dateStr,
        is_day_off: false,
        log_is_secret: true,
        status: RecordStatus.Active,
      };

      const initTimes = {
        start: '',
        meal_start: '',
        meal_end: '',
        break_start: '',
        break_end: '',
        end: '',
      };

      const schedules = this.workScheduleService.workSchedules();
      const matchingSchedule = schedules.find(
        (s) =>
          s.work_date === dateStr &&
          s.user_id === targetUserId &&
          s.status === RecordStatus.Active,
      );

      if (matchingSchedule) {
        if (matchingSchedule.is_day_off) {
          newAttn.is_day_off = true;
        } else {
          newAttn.mplm_id = matchingSchedule.mplm_id;
          initTimes.start = extractTime(matchingSchedule.planned_start_time);
          initTimes.end = extractTime(matchingSchedule.planned_end_time);
        }
      }

      this.item.set(newAttn);
      this.originalDataStr.set(JSON.stringify(newAttn));
      sessionStorage.setItem('orig_times', JSON.stringify(initTimes));
      this.userSearch.set(newAttn.user_id!);

      this.bindDate.set(nextDate);
      this.timeInputs.set(initTimes);
    }

    const actions: HeaderAction[] = [];
    if (this.currentId) {
      actions.push({
        label: 'Export',
        icon: 'download',
        type: 'secondary',
        onClick: () => this.onExport(),
      });
      actions.push({
        label: 'Delete',
        icon: 'delete_outline',
        type: 'secondary',
        onClick: () => this.onDelete(),
      });
    }
    actions.push({
      label: this.currentId ? 'Save Changes' : 'Create Record',
      icon: 'check',
      type: 'primary',
      disabled: this.isSaveDisabled,
      onClick: () => this.onSave(),
    });

    this.headerService.setConfig({
      backLink: '/work/attendance/list',
      syncStatus: this.syncStatus,
      actions: actions,
    });
  }

  async onSave() {
    const data = this.item();
    const dateVal = this.bindDate();
    if (!data || !data.user_id || !dateVal) return;

    data.work_date = formatDate(dateVal);

    if (data.is_day_off) {
      data.mplm_id = null;
      data.start_time = null;
      data.end_time = null;
      data.meal_start_time = null;
      data.meal_end_time = null;
      data.break_start_time = null;
      data.break_end_time = null;
    } else {
      const times = this.timeInputs();

      const sequence = [
        times.start,
        times.meal_start,
        times.meal_end,
        times.break_start,
        times.break_end,
        times.end,
      ];

      const isoResults = buildSequentialIsoStrings(data.work_date, sequence);

      data.start_time = isoResults[0];
      data.meal_start_time = isoResults[1];
      data.meal_end_time = isoResults[2];
      data.break_start_time = isoResults[3];
      data.break_end_time = isoResults[4];
      data.end_time = isoResults[5];
    }

    const success = await this.workAttendanceService.saveWorkAttendance(data);
    if (success) {
      this.isDirty.set(false);
      sessionStorage.removeItem('orig_times');
      this.router.navigate(['/work/attendance/list']);
    }
  }

  async onDelete() {
    if (!this.currentId) return;
    if (confirm('Are you sure you want to delete this attendance record?')) {
      const success = await this.workAttendanceService.deleteWorkAttendance(
        this.currentId,
      );
      if (success) {
        this.isDirty.set(false);
        this.router.navigate(['/work/attendance/list']);
      }
    }
  }

  ngOnDestroy() {
    this.headerService.clear();
    sessionStorage.removeItem('orig_times');
  }

  onExport() {
    const a = this.item();
    if (!a || !this.currentId) return;

    const headers = [
      'Assigned User',
      'Work Date',
      'Is Day Off',
      'Employment',
      'Start Time (Clock In)',
      'End Time (Clock Out)',
      'Meal Start',
      'Meal End',
      'Break Start',
      'Break End',
      'Log / Remarks',
      'Log is Secret',
      'Status',
    ];

    const userName = this.displayUserName(a.user_id || '');
    const emp = this.filteredEmployments().find(
      (e) => e.tb_tyapp_wk_mplm_id === a.mplm_id,
    );
    const empName = emp ? `${emp.employer_name_en}` : '';
    const times = this.timeInputs();

    const rows = [
      [
        userName,
        this.bindDate() ? formatDate(this.bindDate()!) : a.work_date || '',
        a.is_day_off ? 'Yes' : 'No',
        empName,
        times.start || '',
        times.end || '',
        times.meal_start || '',
        times.meal_end || '',
        times.break_start || '',
        times.break_end || '',
        a.log || '',
        a.log_is_secret ? 'Yes' : 'No',
        a.status === RecordStatus.Active ? 'Active' : 'Inactive',
      ],
    ];

    exportToCsv(`Work_Attendance_Detail_${a.work_date}`, headers, rows);
  }
}
