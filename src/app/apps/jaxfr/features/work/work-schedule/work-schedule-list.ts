import { CommonModule, DatePipe } from '@angular/common';
import { Component, OnInit, OnDestroy, inject, computed } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { RouterModule, Router, ActivatedRoute } from '@angular/router';

import { HeaderService } from '../../../../../core/services/header.service';
import { UserService } from '../../user/user.service';
import { WorkEmploymentService } from '../work-employment/work-employment.service';
import { WorkScheduleService } from './work-schedule.service';
import { DisplayNamePipe } from '../../../../../core/pipes/display-name.pipe';
import {
  parseLocalDate,
  formatDate,
  buildSequentialIsoStrings,
  groupItemsByPeriod,
  getWeekRange,
} from '../../../../../core/utils/date-time.util';
import { WorkSchedule } from './work-schedule.model';
import { WORK_SCHEDULE_NEW_RECORD_SHORTCUT } from '../../../../../app.constants';
import { exportToCsv } from '../../../../../core/utils/csv-export.util';
import { RecordStatus } from '../../../../../core/models/status.enum';
@Component({
  selector: 'app-work-schedule-list',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  providers: [DisplayNamePipe, DatePipe],
  templateUrl: './work-schedule-list.html',
})
export class WorkScheduleList implements OnInit, OnDestroy {
  public workScheduleService = inject(WorkScheduleService);
  public workEmploymentService = inject(WorkEmploymentService);
  public userService = inject(UserService);

  private headerService = inject(HeaderService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private displayNamePipe = inject(DisplayNamePipe);
  private datePipe = inject(DatePipe);

  readonly RecordStatus = RecordStatus;

  listVM = computed(() => {
    const schedules = this.workScheduleService.workSchedules();
    const users = this.userService.users();
    const employments = this.workEmploymentService.workEmployments();

    return schedules.map((scdl) => {
      const user = users.find((u) => u.user_id === scdl.user_id);
      const emp = employments.find(
        (e) => e.tb_tyapp_wk_mplm_id === scdl.mplm_id,
      );

      let timeString = 'Day Off';
      if (
        !scdl.is_day_off &&
        scdl.planned_start_time &&
        scdl.planned_end_time
      ) {
        const start = this.datePipe.transform(scdl.planned_start_time, 'HH:mm');
        const end = this.datePipe.transform(scdl.planned_end_time, 'HH:mm');
        timeString = `${start} - ${end}`;
      }

      return {
        ...scdl,
        manageUserName: user
          ? this.displayNamePipe.transform(user)
          : 'Unknown User',
        employmentName: emp
          ? `${emp.employer_name_en} (${emp.position_title_en})`
          : 'Unassigned',
        displayTime: timeString,
      };
    });
  });

  groupedListVM = computed(() => {
    return groupItemsByPeriod(this.listVM(), (item) => {
      const range = getWeekRange(item.work_date);
      return range ? range.label : 'Unknown Week';
    });
  });

  isGenerateDisabled = computed(() => {
    if (this.workScheduleService.loading()) return true;
    const schedules = this.workScheduleService.workSchedules();
    if (schedules.length === 0) return true;

    const latestDateStr = schedules[0].work_date;
    const latestDate = parseLocalDate(latestDateStr);

    return latestDate?.getDay() !== 0;
  });

  async onGenerateNextWeek() {
    const schedules = this.workScheduleService.workSchedules();
    if (schedules.length === 0) return;

    const latestRecord = schedules[0];
    const latestDate = parseLocalDate(latestRecord.work_date);
    if (!latestDate) return;

    const newRecords: Partial<WorkSchedule>[] = [];

    for (let i = 1; i <= 7; i++) {
      const targetDate = new Date(latestDate);
      targetDate.setDate(targetDate.getDate() + i);
      const dateStr = formatDate(targetDate);
      const dayOfWeek = targetDate.getDay();

      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

      const newRecord: Partial<WorkSchedule> = {
        user_id: latestRecord.user_id,
        work_date: dateStr,
        is_day_off: isWeekend,
        status: RecordStatus.Active,
      };

      if (isWeekend) {
        newRecord.planned_start_time = null;
        newRecord.planned_end_time = null;
        newRecord.planned_meal_minutes = 0;
        newRecord.mplm_id = null;
      } else {
        newRecord.mplm_id = WORK_SCHEDULE_NEW_RECORD_SHORTCUT.mplm_id;
        newRecord.planned_meal_minutes =
          WORK_SCHEDULE_NEW_RECORD_SHORTCUT.planned_meal_minutes;
        const isoResults = buildSequentialIsoStrings(dateStr, [
          WORK_SCHEDULE_NEW_RECORD_SHORTCUT.planned_start_time,
          WORK_SCHEDULE_NEW_RECORD_SHORTCUT.planned_end_time,
        ]);
        newRecord.planned_start_time = isoResults[0];
        newRecord.planned_end_time = isoResults[1];
      }

      newRecords.push(newRecord);
    }

    await this.workScheduleService.bulkInsertWorkSchedules(newRecords);
  }

  ngOnInit() {
    const isLoading = computed(
      () =>
        this.workScheduleService.loading() ||
        this.userService.loading() ||
        this.workEmploymentService.loading(),
    );

    this.headerService.setConfig({
      actions: [
        {
          label: 'Refresh',
          icon: 'refresh',
          type: 'secondary',
          disabled: isLoading,
          onClick: () => this.onRefresh(),
        },
        {
          label: 'Export',
          icon: 'download',
          type: 'secondary',
          disabled: isLoading,
          onClick: () => this.onExport(),
        },
        {
          label: 'Generate Next Week',
          icon: 'auto_awesome',
          type: 'secondary',
          disabled: this.isGenerateDisabled,
          onClick: () => this.onGenerateNextWeek(),
        },
        {
          label: 'New Schedule',
          icon: 'add',
          type: 'primary',
          disabled: isLoading,
          onClick: () =>
            this.router.navigate(['../new'], { relativeTo: this.route }),
        },
      ],
    });

    this.workScheduleService.fetchAllWorkSchedules();
    this.workEmploymentService.fetchAllWorkEmployments();
    this.userService.fetchAllUsers();
  }

  async onRefresh() {
    await this.workScheduleService.fetchAllWorkSchedules(true);
    await this.workEmploymentService.fetchAllWorkEmployments(true);
    await this.userService.fetchAllUsers(true);
  }

  ngOnDestroy() {
    this.headerService.clear();
  }

  onExport() {
    const schedules = this.listVM();
    if (schedules.length === 0) return;

    const headers = [
      'User',
      'Date',
      'Is Day Off',
      'Employment',
      'Start Time',
      'End Time',
      'Meal Minutes',
      'Remark',
      'Status',
    ];

    const rows = schedules.map((s) => {
      const isDayOff = s.is_day_off;
      return [
        s.manageUserName || '',
        s.work_date || '',
        isDayOff ? 'Yes' : 'No',
        isDayOff ? '' : s.employmentName || '',
        isDayOff
          ? ''
          : s.planned_start_time
            ? this.datePipe.transform(s.planned_start_time, 'HH:mm') || ''
            : '',
        isDayOff
          ? ''
          : s.planned_end_time
            ? this.datePipe.transform(s.planned_end_time, 'HH:mm') || ''
            : '',
        isDayOff ? '' : s.planned_meal_minutes?.toString() || '0',
        s.log || '',
        s.status === RecordStatus.Active ? 'Active' : 'Inactive',
      ];
    });

    exportToCsv('Work_Schedule_List', headers, rows);
  }
}
