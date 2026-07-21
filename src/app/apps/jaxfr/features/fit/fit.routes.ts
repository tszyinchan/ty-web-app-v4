import { Routes } from '@angular/router';
import { FitList } from './fit-list';
import { FitEdit } from './fit-edit';
import { FitThread } from './fit-thread';
import { unsavedChangesGuard } from '../../../../core/guards/unsaved-changes.guard';

export const FIT_ROUTES: Routes = [
  {
    path: '',
    children: [
      { path: '', redirectTo: 'list', pathMatch: 'full' },
      { path: 'list', component: FitList },
      { path: 'thread', component: FitThread },
      {
        path: 'new',
        component: FitEdit,
        canDeactivate: [unsavedChangesGuard],
      },
      {
        path: 'edit/:id',
        component: FitEdit,
        canDeactivate: [unsavedChangesGuard],
      },
    ],
  },
];