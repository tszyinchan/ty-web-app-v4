import { Routes } from '@angular/router';

import { unsavedChangesGuard } from '../../../../core/guards/unsaved-changes.guard';
import { YyemsBillEdit } from './yyems-bill-edit';
import { YyemsBillList } from './yyems-bill-list';
import { YyemsSplit } from './yyems-split';
import { YyemsBuyEdit } from './yyems-buy-edit';
import { YyemsCurrencyEdit } from './yyems-currency-edit';
import { YyemsCurrencyList } from './yyems-currency-list';
import { YyemsEatEdit } from './yyems-eat-edit';
import { YyemsFinancialAccountEdit } from './yyems-financial-account-edit';
import { YyemsFinancialAccountList } from './yyems-financial-account-list';
import { YyemsFridge } from './yyems-fridge';
import { YyemsFxRateEdit } from './yyems-fx-rate-edit';
import { YyemsFxRateList } from './yyems-fx-rate-list';
import { YyemsHome } from './yyems-home';
import { YyemsItemCategoryEdit } from './yyems-item-category-edit';
import { YyemsItemCategoryList } from './yyems-item-category-list';
import { YyemsItemEdit } from './yyems-item-edit';
import { YyemsItemList } from './yyems-item-list';
import { YyemsVendorCategoryEdit } from './yyems-vendor-category-edit';
import { YyemsVendorCategoryList } from './yyems-vendor-category-list';
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
  { path: 'split', component: YyemsSplit },
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
  { path: 'items/categories/list', component: YyemsItemCategoryList },
  {
    path: 'items/categories/new',
    component: YyemsItemCategoryEdit,
    canDeactivate: [unsavedChangesGuard],
  },
  {
    path: 'items/categories/edit/:id',
    component: YyemsItemCategoryEdit,
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
  { path: 'vendors/categories/list', component: YyemsVendorCategoryList },
  {
    path: 'vendors/categories/new',
    component: YyemsVendorCategoryEdit,
    canDeactivate: [unsavedChangesGuard],
  },
  {
    path: 'vendors/categories/edit/:id',
    component: YyemsVendorCategoryEdit,
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
  { path: 'wallets/accounts/list', component: YyemsFinancialAccountList },
  {
    path: 'wallets/accounts/new',
    component: YyemsFinancialAccountEdit,
    canDeactivate: [unsavedChangesGuard],
  },
  {
    path: 'wallets/accounts/edit/:id',
    component: YyemsFinancialAccountEdit,
    canDeactivate: [unsavedChangesGuard],
  },
  { path: 'wallets/currencies/list', component: YyemsCurrencyList },
  {
    path: 'wallets/currencies/new',
    component: YyemsCurrencyEdit,
    canDeactivate: [unsavedChangesGuard],
  },
  {
    path: 'wallets/currencies/edit/:code',
    component: YyemsCurrencyEdit,
    canDeactivate: [unsavedChangesGuard],
  },
  { path: 'wallets/fx/list', component: YyemsFxRateList },
  {
    path: 'wallets/fx/new',
    component: YyemsFxRateEdit,
    canDeactivate: [unsavedChangesGuard],
  },
  {
    path: 'wallets/fx/edit/:id',
    component: YyemsFxRateEdit,
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
