import { Routes } from '@angular/router';
import { WorkAttendanceList } from './work-attendance-list';
import { WorkAttendanceEdit } from './work-attendance-edit';
import { WorkAttendanceReport } from './work-attendance-report'; // 🌟 引入
import { unsavedChangesGuard } from '../../../../../core/guards/unsaved-changes.guard';

export const WORK_ATTENDANCE_ROUTES: Routes = [
  {
    path: '',
    children: [
      { path: '', redirectTo: 'list', pathMatch: 'full' },
      { path: 'list', component: WorkAttendanceList },
      { path: 'report', component: WorkAttendanceReport }, // 🌟 加入這行路由
      {
        path: 'new',
        component: WorkAttendanceEdit,
        canDeactivate: [unsavedChangesGuard],
      },
      {
        path: 'edit/:id',
        component: WorkAttendanceEdit,
        canDeactivate: [unsavedChangesGuard],
      },
    ],
  },
];