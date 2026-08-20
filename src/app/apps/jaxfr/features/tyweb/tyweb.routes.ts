import { Routes } from '@angular/router';
import { unsavedChangesGuard } from '../../../../core/guards/unsaved-changes.guard';
import { TywebEdit } from './tyweb-edit';

export const TYWEB_V5_ROUTES: Routes = [
  {
    path: '',
    component: TywebEdit,
    canDeactivate: [unsavedChangesGuard],
  },
];
