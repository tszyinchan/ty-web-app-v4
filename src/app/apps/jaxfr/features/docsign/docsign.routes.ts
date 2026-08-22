import { Routes } from '@angular/router';
import { unsavedChangesGuard } from '../../../../core/guards/unsaved-changes.guard';
import { DocsignCompare } from './docsign-compare';
import { DocsignEdit } from './docsign-edit';
import { DocsignList } from './docsign-list';

export const DOCSIGN_ROUTES: Routes = [
  {
    path: '',
    children: [
      { path: '', redirectTo: 'list', pathMatch: 'full' },
      { path: 'list', component: DocsignList },
      {
        path: 'new',
        component: DocsignEdit,
        canDeactivate: [unsavedChangesGuard],
      },
      {
        path: 'edit/:id',
        component: DocsignEdit,
        canDeactivate: [unsavedChangesGuard],
      },
      {
        path: 'compare/:id',
        component: DocsignCompare,
      },
    ],
  },
];
