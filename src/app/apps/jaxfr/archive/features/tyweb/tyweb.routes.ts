import { Routes } from '@angular/router';
import { TyWebContentManager } from './content-manager';
import { unsavedChangesGuard } from '../../../../../core/guards/unsaved-changes.guard';

export const TYWEB_ROUTES: Routes = [
  {
    path: '',
    children: [
      { path: '', redirectTo: 'content', pathMatch: 'full' },

      {
        path: 'content',
        component: TyWebContentManager,
        canDeactivate: [unsavedChangesGuard],
      },
    ],
  },
];
