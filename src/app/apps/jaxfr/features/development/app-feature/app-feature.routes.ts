import { Routes } from '@angular/router';
import { unsavedChangesGuard } from '../../../../../core/guards/unsaved-changes.guard';
import { AppFeatureEdit } from './app-feature-edit';
import { AppFeatureList } from './app-feature-list';

export const APP_FEATURE_ROUTES: Routes = [
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
        component: AppFeatureList,
      },
      {
        path: 'new',
        component: AppFeatureEdit,
        canDeactivate: [unsavedChangesGuard],
      },
      {
        path: 'edit/:id',
        component: AppFeatureEdit,
        canDeactivate: [unsavedChangesGuard],
      },
    ],
  },
];
