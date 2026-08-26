import { Routes } from '@angular/router';

import { unsavedChangesGuard } from '../../../../core/guards/unsaved-changes.guard';
import { YyemsBillEdit } from './yyems-bill-edit';
import { YyemsBillList } from './yyems-bill-list';
import { YyemsBuyEdit } from './yyems-buy-edit';
import { YyemsEatEdit } from './yyems-eat-edit';
import { YyemsFridge } from './yyems-fridge';
import { YyemsHome } from './yyems-home';
import { YyemsItemEdit } from './yyems-item-edit';
import { YyemsItemList } from './yyems-item-list';
import { YyemsVendorEdit } from './yyems-vendor-edit';
import { YyemsVendorList } from './yyems-vendor-list';
import { YyemsWalletEdit } from './yyems-wallet-edit';
import { YyemsWalletList } from './yyems-wallet-list';

export const YYEMS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('../../pages/feature-hub/feature-hub').then((m) => m.FeatureHub),
    data: { hub: 'yyems' },
  },
  { path: 'fridge', component: YyemsFridge },
  { path: 'home', component: YyemsHome },
  { path: 'bills/list', component: YyemsBillList },
  {
    path: 'bills/new',
    component: YyemsBillEdit,
    canDeactivate: [unsavedChangesGuard],
  },
  {
    path: 'bills/edit/:id',
    component: YyemsBillEdit,
    canDeactivate: [unsavedChangesGuard],
  },
  {
    path: 'buys/new',
    component: YyemsBuyEdit,
    canDeactivate: [unsavedChangesGuard],
  },
  {
    path: 'buys/edit/:id',
    component: YyemsBuyEdit,
    canDeactivate: [unsavedChangesGuard],
  },
  {
    path: 'eats/new',
    component: YyemsEatEdit,
    canDeactivate: [unsavedChangesGuard],
  },
  {
    path: 'eats/edit/:id',
    component: YyemsEatEdit,
    canDeactivate: [unsavedChangesGuard],
  },
  { path: 'items/list', component: YyemsItemList },
  {
    path: 'items/new',
    component: YyemsItemEdit,
    canDeactivate: [unsavedChangesGuard],
  },
  {
    path: 'items/edit/:id',
    component: YyemsItemEdit,
    canDeactivate: [unsavedChangesGuard],
  },
  { path: 'vendors/list', component: YyemsVendorList },
  {
    path: 'vendors/new',
    component: YyemsVendorEdit,
    canDeactivate: [unsavedChangesGuard],
  },
  {
    path: 'vendors/edit/:id',
    component: YyemsVendorEdit,
    canDeactivate: [unsavedChangesGuard],
  },
  { path: 'wallets/list', component: YyemsWalletList },
  {
    path: 'wallets/new',
    component: YyemsWalletEdit,
    canDeactivate: [unsavedChangesGuard],
  },
  {
    path: 'wallets/edit/:id',
    component: YyemsWalletEdit,
    canDeactivate: [unsavedChangesGuard],
  },
];
