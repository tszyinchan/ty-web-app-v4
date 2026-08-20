import { Routes } from "@angular/router";
import { UserEdit } from "./user-edit";
import { UserGroupEdit } from "./user-group-edit";
import { UserGroupList } from "./user-group-list";
import { UserList } from "./user-list";
import { unsavedChangesGuard } from "../../../../core/guards/unsaved-changes.guard";

export const USER_ROUTES: Routes = [
  {
    path: '',
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
      {
        path: 'groups',
        children: [
          {
            path: '',
            redirectTo: 'list',
            pathMatch: 'full',
          },
          {
            path: 'list',
            component: UserGroupList,
          },
          {
            path: 'new',
            component: UserGroupEdit,
            canDeactivate: [unsavedChangesGuard],
          },
          {
            path: 'edit/:id',
            component: UserGroupEdit,
            canDeactivate: [unsavedChangesGuard],
          },
        ],
      },
    ],
  },
];
