import { Routes } from '@angular/router';
import { AppFunctionList } from './app-function-list';
import { AppFunctionEdit } from './app-function-edit';
import { unsavedChangesGuard } from '../../../../../core/guards/unsaved-changes.guard';

export const APP_FUNCTION_ROUTES: Routes = [
  {
    path: '',
    children: [
      {
        path: '',
        redirectTo: 'list',
        pathMatch: 'full',
      },
      {
        path: 'list',
        component: AppFunctionList,
      },
      {
        path: 'new',
        component: AppFunctionEdit,
        canDeactivate: [unsavedChangesGuard]
      },
      {
        path: 'edit/:id',
        component: AppFunctionEdit,
        canDeactivate: [unsavedChangesGuard]
      },
    ],
  },
];
