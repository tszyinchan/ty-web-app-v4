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

/** Logo Studio Draft: leave confirms discard, then restores last Apply. */
const cgLayerUnsavedGuard: CanDeactivateFn<CgLayerEdit> = (component) => {
  if (!component.isDirty()) return true;
  if (
    !confirm(
      'You have unsaved layer changes. Discard and leave?',
    )
  ) {
    return false;
  }
  component.discardLayerContent();
  return true;
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
        children: [
          {
            path: 'layer/:layerId',
            component: CgLayerEdit,
            canDeactivate: [cgLayerUnsavedGuard],
          },
        ],
      },
      {
        path: 'edit/:id',
        component: CgPackageEdit,
        canDeactivate: [cgPackageUnsavedGuard],
        children: [
          {
            path: 'layer/:layerId',
            component: CgLayerEdit,
            canDeactivate: [cgLayerUnsavedGuard],
          },
        ],
      },
    ],
  },
];
