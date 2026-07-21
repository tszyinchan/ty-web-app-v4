import { Routes } from '@angular/router';
import { unsavedChangesGuard } from '../../../../../core/guards/unsaved-changes.guard';

export const WEALTH_ROUTES: Routes = [
  {
    path: 'list',
    loadComponent: () => import('./wealth-list/wealth-list').then((m) => m.WealthList),
  },
  {
    path: 'edit',
    loadComponent: () => import('./wealth-edit/wealth-edit').then((m) => m.WealthEdit),
    canDeactivate: [unsavedChangesGuard],
  },
  {
    path: 'edit/:id',
    loadComponent: () => import('./wealth-edit/wealth-edit').then((m) => m.WealthEdit),
    canDeactivate: [unsavedChangesGuard],
  },
  {
    path: 'snapshots',
    loadComponent: () => import('./asset-snapshot/asset-snapshot').then((m) => m.AssetSnapshotComponent),
  },
  {
    path: 'report',
    loadComponent: () => import('./wealth-report/wealth-report').then((m) => m.WealthReport),
  },
  {
    path: '',
    redirectTo: 'list',
    pathMatch: 'full',
  },
];
