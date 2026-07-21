import { CommonModule } from "@angular/common";
import { Component, OnInit, OnDestroy, inject, computed } from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatMenuModule } from "@angular/material/menu";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { RouterModule } from "@angular/router";
import { DisplayNamePipe } from "../../../../core/pipes/display-name.pipe";
import { RoleLabelPipe } from "../../../../core/pipes/role-label.pipe";
import { HeaderService } from "../../../../core/services/header.service";
import { exportToCsv } from "../../../../core/utils/csv-export.util";
import { UserService } from "./user.service";


@Component({
  selector: 'app-user-list',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatMenuModule,
    DisplayNamePipe,
    RoleLabelPipe,
  ],
  providers: [DisplayNamePipe, RoleLabelPipe],
  templateUrl: './user-list.html',
})
export class UserList implements OnInit, OnDestroy {
  public readonly userService = inject(UserService);
  private readonly headerService = inject(HeaderService);
  private displayNamePipe = inject(DisplayNamePipe);
  private roleLabelPipe = inject(RoleLabelPipe);

  ngOnInit() {
    const isRefreshDisabled = computed(() => this.userService.loading());
    const isExportDisabled = computed(
      () => this.userService.loading() || this.userService.users().length === 0,
    );

    this.headerService.setConfig({
      actions: [
        {
          label: 'Refresh',
          icon: 'refresh',
          type: 'secondary',
          disabled: isRefreshDisabled,
          onClick: () => this.onRefresh(),
        },
        {
          label: 'Export',
          icon: 'download',
          type: 'secondary',
          disabled: isExportDisabled,
          onClick: () => this.onExport(),
        },
      ],
    });

    this.userService.fetchAllUsers();
  }

  ngOnDestroy() {
    this.headerService.clear();
  }

  onExport() {
    const users = this.userService.users();
    if (users.length === 0) return;

    const headers = ['ID', 'Name', 'Role'];
    const rows = users.map((u) => [
      u.user_id,
      this.displayNamePipe.transform(u),
      this.roleLabelPipe.transform(u.role),
    ]);

    exportToCsv('User List', headers, rows);
  }

  async onRefresh() {
    await this.userService.fetchAllUsers(true);
  }
}
