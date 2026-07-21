import { Routes } from '@angular/router';
import { FilelinkList } from './filelink-list';
import { FilelinkEdit } from './filelink-edit';
import { unsavedChangesGuard } from '../../../../core/guards/unsaved-changes.guard';

export const FILELINK_ROUTES: Routes = [
  {
    path: '',
    children: [
      { path: '', redirectTo: 'list', pathMatch: 'full' },
      { path: 'list', component: FilelinkList },
      {
        path: 'new',
        component: FilelinkEdit,
        canDeactivate: [unsavedChangesGuard],
      },
      {
        path: 'edit/:id',
        component: FilelinkEdit,
        canDeactivate: [unsavedChangesGuard],
      },
    ],
  },
];
