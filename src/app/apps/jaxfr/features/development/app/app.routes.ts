import { Routes } from '@angular/router';
import { unsavedChangesGuard } from '../../../../../core/guards/unsaved-changes.guard';
import { AppEdit } from './app-edit';
import { AppList } from './app-list';

export const APP_REGISTRY_ROUTES: Routes = [
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
        component: AppList,
      },
      {
        path: 'new',
        component: AppEdit,
        canDeactivate: [unsavedChangesGuard],
      },
      {
        path: 'edit/:id',
        component: AppEdit,
        canDeactivate: [unsavedChangesGuard],
      },
    ],
  },
];
