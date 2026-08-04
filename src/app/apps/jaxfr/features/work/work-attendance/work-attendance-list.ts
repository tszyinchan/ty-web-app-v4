import { CommonModule, DatePipe } from '@angular/common';
import { Component, OnInit, OnDestroy, inject, computed } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { RouterModule, Router, ActivatedRoute } from '@angular/router';

import { HeaderService } from '../../../../../core/services/header.service';
import { UserService } from '../../user/user.service';
import { WorkEmploymentService } from '../work-employment/work-employment.service';
import { WorkAttendanceService } from './work-attendance.service';
import { DisplayNamePipe } from '../../../../../core/pipes/display-name.pipe';
import {
  getWeekRange,
  groupItemsByPeriod,
} from '../../../../../core/utils/date-time.util';
import { exportToCsv } from '../../../../../core/utils/csv-export.util';
import { RecordStatus } from '../../../../../core/models/status.enum';

@Component({
  selector: 'app-work-attendance-list',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  providers: [DisplayNamePipe, DatePipe],
  templateUrl: './work-attendance-list.html',
})
export class WorkAttendanceList implements OnInit, OnDestroy {
  public workAttendanceService = inject(WorkAttendanceService);
  public workEmploymentService = inject(WorkEmploymentService);
  public userService = inject(UserService);

  private headerService = inject(HeaderService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private displayNamePipe = inject(DisplayNamePipe);
  private datePipe = inject(DatePipe);

  readonly RecordStatus = RecordStatus;

  listVM = computed(() => {
    const attendances = this.workAttendanceService.workAttendances();
    const users = this.userService.users();
    const employments = this.workEmploymentService.workEmployments();

    return attendances.map((attn) => {
      const user = users.find((u) => u.user_id === attn.user_id);
      const emp = employments.find(
        (e) => e.tb_tyapp_wk_mplm_id === attn.mplm_id,
      );

      let timeString = 'Day Off';
      if (!attn.is_day_off && attn.start_time) {
        const start = this.datePipe.transform(attn.start_time, 'HH:mm');
        const end = attn.end_time
          ? this.datePipe.transform(attn.end_time, 'HH:mm')
          : 'Ongoing';
        timeString = `${start} - ${end}`;
      }

      return {
        ...attn,
        manageUserName: user
          ? this.displayNamePipe.transform(user)
          : 'Unknown User',
        employmentName: emp
          ? `${emp.employer_name_en} (${emp.position_title_en})`
          : 'Unassigned',
        displayTime: timeString,
        hasSecretLog: !!attn.log_is_secret && !!attn.log,
      };
    });
  });

  groupedListVM = computed(() => {
    return groupItemsByPeriod(this.listVM(), (item) => {
      const range = getWeekRange(item.work_date);
      return range ? range.label : 'Unknown Week';
    });
  });

  ngOnInit() {
    const isLoading = computed(
      () =>
        this.workAttendanceService.loading() ||
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
          disabled: computed(() => this.listVM().length === 0),
          onClick: () => this.onExport(),
        },
        {
          label: 'Timesheet Report',
          icon: 'bar_chart',
          type: 'secondary',
          disabled: isLoading,
          onClick: () =>
            this.router.navigate(['../report'], { relativeTo: this.route }),
        },
        {
          label: 'New Record',
          icon: 'add',
          type: 'primary',
          disabled: isLoading,
          onClick: () =>
            this.router.navigate(['../new'], { relativeTo: this.route }),
        },
      ],
    });

    this.workAttendanceService.fetchAllWorkAttendances();
    this.workEmploymentService.fetchAllWorkEmployments();
    this.userService.fetchAllUsers();
  }

  async onRefresh() {
    await this.workAttendanceService.fetchAllWorkAttendances(true);
    await this.workEmploymentService.fetchAllWorkEmployments(true);
    await this.userService.fetchAllUsers(true);
  }

  ngOnDestroy() {
    this.headerService.clear();
  }

  onExport() {
    const attendances = this.listVM();
    if (attendances.length === 0) return;

    const headers = [
      'User',
      'Date',
      'Is Day Off',
      'Employment',
      'Start Time',
      'Meal Start',
      'Meal End',
      'Break Start',
      'Break End',
      'End Time',
      'Status',
    ];

    const rows = attendances.map((a) => {
      const isDayOff = a.is_day_off;
      return [
        a.manageUserName || '',
        a.work_date || '',
        isDayOff ? 'Yes' : 'No',
        isDayOff ? '' : a.employmentName || '',
        isDayOff
          ? ''
          : a.start_time
            ? this.datePipe.transform(a.start_time, 'HH:mm') || ''
            : '',
        isDayOff
          ? ''
          : a.meal_start_time
            ? this.datePipe.transform(a.meal_start_time, 'HH:mm') || ''
            : '',
        isDayOff
          ? ''
          : a.meal_end_time
            ? this.datePipe.transform(a.meal_end_time, 'HH:mm') || ''
            : '',
        isDayOff
          ? ''
          : a.break_start_time
            ? this.datePipe.transform(a.break_start_time, 'HH:mm') || ''
            : '',
        isDayOff
          ? ''
          : a.break_end_time
            ? this.datePipe.transform(a.break_end_time, 'HH:mm') || ''
            : '',
        isDayOff
          ? ''
          : a.end_time
            ? this.datePipe.transform(a.end_time, 'HH:mm') || ''
            : '',
        a.status === RecordStatus.Active ? 'Active' : 'Inactive',
      ];
    });

    exportToCsv('Work_Attendance_List', headers, rows);
  }
}
