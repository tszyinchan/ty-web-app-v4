import { Routes } from '@angular/router';
import { unsavedChangesGuard } from '../../../../core/guards/unsaved-changes.guard';
import { DocsignCompare } from './docsign-compare';
import { DocsignEdit } from './docsign-edit';
import { DocsignList } from './docsign-list';
import { DocsignPrint } from './docsign-print';
import { DocsignPrints } from './docsign-prints';
import { DocsignSignature } from './docsign-signature';

export const DOCSIGN_ROUTES: Routes = [
  {
    path: '',
    children: [
      { path: '', redirectTo: 'list', pathMatch: 'full' },
      { path: 'list', component: DocsignList },
      { path: 'prints', component: DocsignPrints },
      { path: 'signature', component: DocsignSignature },
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
      {
        path: 'print/:id/:printLogId',
        component: DocsignPrint,
      },
    ],
  },
];
