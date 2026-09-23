import { Routes } from '@angular/router';
import { unsavedChangesGuard } from '../../../../core/guards/unsaved-changes.guard';
import { CgPackageEdit } from './cg-package-edit';
import { CgPackageList } from './cg-package-list';

export const CG_ROUTES: Routes = [
  {
    path: '',
    children: [
      { path: '', redirectTo: 'list', pathMatch: 'full' },
      { path: 'list', component: CgPackageList },
      {
        path: 'new',
        component: CgPackageEdit,
        canDeactivate: [unsavedChangesGuard],
      },
      {
        path: 'edit/:id',
        component: CgPackageEdit,
        canDeactivate: [unsavedChangesGuard],
      },
    ],
  },
];
