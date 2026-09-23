import { CanDeactivateFn, Routes } from '@angular/router';
import { isSameCgPackageUrl } from '../../../../core/domains/cg/cg.util';
import {
  HasUnsavedChanges,
  unsavedChangesGuard,
} from '../../../../core/guards/unsaved-changes.guard';
import { CgLayerEdit } from './cg-layer-edit';
import { CgPackageEdit } from './cg-package-edit';
import { CgPackageList } from './cg-package-list';

const cgPackageUnsavedGuard: CanDeactivateFn<HasUnsavedChanges> = (
  component,
  _currentRoute,
  currentState,
  nextState,
) => {
  if (isSameCgPackageUrl(currentState.url, nextState.url)) return true;
  return unsavedChangesGuard(
    component,
    _currentRoute,
    currentState,
    nextState,
  );
};

export const CG_ROUTES: Routes = [
  {
    path: '',
    children: [
      { path: '', redirectTo: 'list', pathMatch: 'full' },
      { path: 'list', component: CgPackageList },
      {
        path: 'new',
        component: CgPackageEdit,
        canDeactivate: [cgPackageUnsavedGuard],
      },
      {
        path: 'new/layer/:layerId',
        component: CgLayerEdit,
        canDeactivate: [cgPackageUnsavedGuard],
      },
      {
        path: 'edit/:id',
        component: CgPackageEdit,
        canDeactivate: [cgPackageUnsavedGuard],
      },
      {
        path: 'edit/:id/layer/:layerId',
        component: CgLayerEdit,
        canDeactivate: [cgPackageUnsavedGuard],
      },
    ],
  },
];
