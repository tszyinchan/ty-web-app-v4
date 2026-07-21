import { Routes } from "@angular/router";
import { adminGuard } from "../../../../../core/guards/admin.guard";
import { AppCategoryEdit } from "./app-category-edit";
import { AppCategoryList } from "./app-category-list";
import { unsavedChangesGuard } from "../../../../../core/guards/unsaved-changes.guard";

export const APP_CATEGORY_ROUTES: Routes = [
  {
    path: '',
    canActivate: [adminGuard],
    children: [
      {
        path: '',
        redirectTo: 'list',
        pathMatch: 'full',
      },
      {
        path: 'list',
        component: AppCategoryList,
      },
      {
        path: 'new',
        component: AppCategoryEdit,
        canDeactivate: [unsavedChangesGuard]
      },
      {
        path: 'edit/:id',
        component: AppCategoryEdit,
        canDeactivate: [unsavedChangesGuard]
      },
    ],
  },
];
