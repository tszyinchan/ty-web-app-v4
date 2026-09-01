import { Routes } from '@angular/router';
import { FitList } from './fit-list';
import { FitEdit } from './fit-edit';
import { FitThread } from './fit-thread';
import { FitPatternList } from './fit-pattern-list';
import { unsavedChangesGuard } from '../../../../core/guards/unsaved-changes.guard';

export const FIT_ROUTES: Routes = [
  {
    path: '',
    children: [
      { path: '', redirectTo: 'list', pathMatch: 'full' },
      { path: 'list', component: FitList },
      { path: 'thread', component: FitThread },
      { path: 'patterns', component: FitPatternList },
      {
        path: 'patterns/new',
        component: FitEdit,
        data: { isPattern: true },
        canDeactivate: [unsavedChangesGuard],
      },
      {
        path: 'patterns/edit/:id',
        component: FitEdit,
        data: { isPattern: true },
        canDeactivate: [unsavedChangesGuard],
      },
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
