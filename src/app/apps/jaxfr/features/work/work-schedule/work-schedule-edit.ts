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
} from '../../../../../core/utils/date-time.util';

import { AuthService } from '../../../../../core/services/auth.service';
import {
  HeaderService,
  HeaderAction,
} from '../../../../../core/services/header.service';
import { UserService } from '../../user/user.service';
import { WorkEmploymentService } from '../work-employment/work-employment.service';
import { WorkSchedule } from './work-schedule.model';
import { WorkScheduleService } from './work-schedule.service';
import { SelectOption } from '../../../../../core/models/common.model';
import { DisplayNamePipe } from '../../../../../core/pipes/display-name.pipe';
import { WORK_SCHEDULE_NEW_RECORD_SHORTCUT } from '../../../../../app.constants';
import { exportToCsv } from '../../../../../core/utils/csv-export.util';
import { RecordStatus } from '../../../../../core/models/status.enum';

@Component({
  selector: 'app-work-schedule-edit',
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
  templateUrl: './work-schedule-edit.html',
  styleUrl: './work-schedule-edit.scss',
})
export class WorkScheduleEdit implements OnInit, OnDestroy, DoCheck {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private zone = inject(NgZone);
  private headerService = inject(HeaderService);
  private displayNamePipe = inject(DisplayNamePipe);

  public workScheduleService = inject(WorkScheduleService);
  public workEmploymentService = inject(WorkEmploymentService);
  public userService = inject(UserService);
  public authService = inject(AuthService);

  readonly RecordStatus = RecordStatus;

  item = signal<Partial<WorkSchedule> | null>(null);
  currentId: string | null = null;
  originalDataStr = signal<string>('');

  isDirty = signal(false);
  isSaveDisabled = signal(true);

  timeInputs = signal({ start: '', end: '' });
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
    if (this.workScheduleService.loading()) return 'loading';
    if (this.isDirty()) return 'unsaved';
    if (this.currentId) return 'up-to-date';
    return 'none';
  });

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
        this.workScheduleService.loading() ||
        (!!this.currentId && !currentlyDirty) ||
        !current.user_id ||
        !current.work_date ||
        (!current.is_day_off &&
          (!current.mplm_id ||
            !this.timeInputs().start ||
            !this.timeInputs().end ||
            current.planned_meal_minutes === null ||
            current.planned_meal_minutes === undefined));

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

    if (this.currentId) {
      const cached = this.workScheduleService
        .workSchedules()
        .find((s) => s.tb_tyapp_wk_scdl_id === this.currentId);
      if (cached) {
        this.item.set(structuredClone(cached));
        this.originalDataStr.set(JSON.stringify(cached));
        this.userSearch.set(cached.user_id);
        this.bindDate.set(parseLocalDate(cached.work_date));

        const times = {
          start: extractTime(cached.planned_start_time),
          end: extractTime(cached.planned_end_time),
        };
        this.timeInputs.set(times);
        sessionStorage.setItem('orig_times', JSON.stringify(times));
      }
    } else {
      let nextDate = new Date();
      const schedules = this.workScheduleService.workSchedules();

      if (schedules.length > 0) {
        const latestDateStr = schedules[0].work_date;
        const latestDate = parseLocalDate(latestDateStr);
        if (latestDate) {
          latestDate.setDate(latestDate.getDate() + 1);
          nextDate = latestDate;
        }
      }

      const newScdl: Partial<WorkSchedule> = {
        user_id: this.authService.userProfile()?.user_id || '',
        work_date: '',
        is_day_off: false,
        planned_meal_minutes: 60,
        status: RecordStatus.Active,
      };

      this.item.set(newScdl);
      this.originalDataStr.set(JSON.stringify(newScdl));
      sessionStorage.setItem(
        'orig_times',
        JSON.stringify({ start: '', end: '' }),
      );
      this.userSearch.set(newScdl.user_id!);

      this.bindDate.set(nextDate);
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
      backLink: '/work/schedule/list',
      syncStatus: this.syncStatus,
      actions: actions,
    });

    Promise.all([
      this.workEmploymentService.fetchAllWorkEmployments(),
      this.userService.fetchAllUsers(),
    ]);

    if (this.currentId) {
      const fresh = await this.workScheduleService.fetchWorkScheduleById(
        this.currentId,
      );
      this.zone.run(() => {
        if (fresh) {
          this.item.set(structuredClone(fresh));
          this.originalDataStr.set(JSON.stringify(fresh));
          this.userSearch.set(fresh.user_id);
          this.bindDate.set(parseLocalDate(fresh.work_date));

          const times = {
            start: extractTime(fresh.planned_start_time),
            end: extractTime(fresh.planned_end_time),
          };
          this.timeInputs.set(times);
          sessionStorage.setItem('orig_times', JSON.stringify(times));
        } else if (!this.item()) {
          this.router.navigate(['/work/schedule/list']);
        }
      });
    }
  }

  async onSave() {
    const data = this.item();
    const dateVal = this.bindDate();
    if (!data || !data.user_id || !dateVal) return;

    data.work_date = formatDate(dateVal);

    if (data.is_day_off) {
      data.mplm_id = null;
      data.planned_start_time = null;
      data.planned_end_time = null;
      data.planned_meal_minutes = 0;
    } else {
      const times = this.timeInputs();

      const sequence = [times.start, times.end];

      const isoResults = buildSequentialIsoStrings(data.work_date, sequence);

      data.planned_start_time = isoResults[0];
      data.planned_end_time = isoResults[1];
    }

    const success = await this.workScheduleService.saveWorkSchedule(data);
    if (success) {
      this.isDirty.set(false);
      sessionStorage.removeItem('orig_times');
      this.router.navigate(['/work/schedule/list']);
    }
  }

  async onDelete() {
    if (!this.currentId) return;
    if (confirm('Are you sure you want to delete this schedule?')) {
      const success = await this.workScheduleService.deleteWorkSchedule(
        this.currentId,
      );
      if (success) {
        this.isDirty.set(false);
        this.router.navigate(['/work/schedule/list']);
      }
    }
  }

  ngOnDestroy() {
    this.headerService.clear();
    sessionStorage.removeItem('orig_times');
  }

  applyFixedShiftShortcut() {
    const current = this.item();
    if (!current) return;

    current.mplm_id = WORK_SCHEDULE_NEW_RECORD_SHORTCUT.mplm_id;
    current.is_day_off = false;
    current.planned_meal_minutes =
      WORK_SCHEDULE_NEW_RECORD_SHORTCUT.planned_meal_minutes;

    this.timeInputs.set({
      start: WORK_SCHEDULE_NEW_RECORD_SHORTCUT.planned_start_time,
      end: WORK_SCHEDULE_NEW_RECORD_SHORTCUT.planned_end_time,
    });

    this.item.set({ ...current });
  }

  onExport() {
    const s = this.item();
    if (!s || !this.currentId) return;

    const headers = [
      'Assigned User',
      'Work Date',
      'Is Day Off',
      'Employment',
      'Start Time',
      'End Time',
      'Planned Meal (Minutes)',
      'Internal Log / Notes',
      'Status',
    ];

    const userName = this.displayUserName(s.user_id || '');
    const emp = this.filteredEmployments().find(
      (e) => e.tb_tyapp_wk_mplm_id === s.mplm_id,
    );
    const empName = emp
      ? `${emp.employer_name_en} (${emp.position_title_en})`
      : '';

    const rows = [
      [
        userName,
        this.bindDate() ? formatDate(this.bindDate()!) : s.work_date || '',
        s.is_day_off ? 'Yes' : 'No',
        empName,
        this.timeInputs().start || '',
        this.timeInputs().end || '',
        s.planned_meal_minutes?.toString() || '0',
        s.log || '',
        s.status === RecordStatus.Active ? 'Active' : 'Inactive',
      ],
    ];

    exportToCsv(`Work_Schedule_Detail_${s.work_date}`, headers, rows);
  }
}
