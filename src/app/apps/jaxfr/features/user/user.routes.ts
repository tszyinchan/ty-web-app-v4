import { Routes } from "@angular/router";
import { adminGuard } from "../../../../core/guards/admin.guard";
import { UserEdit } from "./user-edit";
import { UserList } from "./user-list";
import { unsavedChangesGuard } from "../../../../core/guards/unsaved-changes.guard";

export const USER_ROUTES: Routes = [
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
        component: UserList,
      },
      {
        path: 'edit/:id',
        component: UserEdit,
        canDeactivate: [unsavedChangesGuard]
      },
    ],
  },
];
