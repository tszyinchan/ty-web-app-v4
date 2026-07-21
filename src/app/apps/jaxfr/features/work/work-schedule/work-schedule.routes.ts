import { Routes } from '@angular/router';
import { WorkScheduleList } from './work-schedule-list';
import { WorkScheduleEdit } from './work-schedule-edit';
import { unsavedChangesGuard } from '../../../../../core/guards/unsaved-changes.guard';

export const WORK_SCHEDULE_ROUTES: Routes = [
  {
    path: '',
    children: [
      { path: '', redirectTo: 'list', pathMatch: 'full' },
      { path: 'list', component: WorkScheduleList },
      {
        path: 'new',
        component: WorkScheduleEdit,
        canDeactivate: [unsavedChangesGuard],
      },
      {
        path: 'edit/:id',
        component: WorkScheduleEdit,
        canDeactivate: [unsavedChangesGuard],
      },
    ],
  },
];
