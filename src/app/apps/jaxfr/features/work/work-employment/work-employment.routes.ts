import { Routes } from '@angular/router';
import { WorkEmploymentList } from './work-employment-list';
import { WorkEmploymentEdit } from './work-employment-edit';
import { unsavedChangesGuard } from '../../../../../core/guards/unsaved-changes.guard';

export const WORK_EMPLOYMENT_ROUTES: Routes = [
  {
    path: '',
    children: [
      { path: '', redirectTo: 'list', pathMatch: 'full' },
      { path: 'list', component: WorkEmploymentList },
      {
        path: 'new',
        component: WorkEmploymentEdit,
        canDeactivate: [unsavedChangesGuard],
      },
      {
        path: 'edit/:id',
        component: WorkEmploymentEdit,
        canDeactivate: [unsavedChangesGuard],
      },
    ],
  },
];
