import { CommonModule } from "@angular/common";
import { Component, OnInit, OnDestroy, inject, computed, signal } from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatMenuModule } from "@angular/material/menu";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { Router, RouterModule } from "@angular/router";
import { RecordStatus } from "../../../../core/models/status.enum";
import { TyappUser } from "../../../../core/models/user.model";
import { DisplayNamePipe } from "../../../../core/pipes/display-name.pipe";
import { RoleLabelPipe } from "../../../../core/pipes/role-label.pipe";
import { AuthService } from "../../../../core/services/auth.service";
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
  styleUrl: './user-list.scss',
})
export class UserList implements OnInit, OnDestroy {
  public readonly userService = inject(UserService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly headerService = inject(HeaderService);
  private displayNamePipe = inject(DisplayNamePipe);
  private roleLabelPipe = inject(RoleLabelPipe);

  readonly showDirectory = signal(false);
  readonly pendingRequests = computed(() =>
    this.userService.reactivationRequests().filter((row) => !row.resolved_at),
  );

  ngOnInit() {
    if (!this.auth.isSuperAdmin()) {
      const myId = this.auth.userProfile()?.user_id;
      void this.router.navigate(myId ? ['/users/edit', myId] : ['/welcome'], {
        replaceUrl: true,
      });
      return;
    }

    this.showDirectory.set(true);

    const isRefreshDisabled = computed(() => this.userService.loading());
    const isExportDisabled = computed(
      () => this.userService.loading() || this.userService.users().length === 0,
    );

    this.headerService.setConfig({
      title: 'Users',
      backLink: '/users',
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
    void this.userService.fetchGroups();
    void this.userService.fetchReactivationRequests();
  }

  ngOnDestroy() {
    this.headerService.clear();
  }

  statusLabel(user: TyappUser): string {
    if (user.deleted_at) return 'Deleted';
    return user.status === RecordStatus.Active ? 'Active' : 'Inactive';
  }

  hasPendingReactivation(userId: string): boolean {
    return this.userService.pendingReactivationUserIds().has(userId);
  }

  nameFor(userId: string): string {
    const user = this.userService.users().find((item) => item.user_id === userId);
    return this.displayNamePipe.transform(user) || userId;
  }

  onExport() {
    const users = this.userService.users();
    if (users.length === 0) return;

    const headers = ['ID', 'Name', 'Role', 'Status'];
    const rows = users.map((u) => [
      u.user_id,
      this.displayNamePipe.transform(u),
      this.roleLabelPipe.transform(u.role),
      this.statusLabel(u),
    ]);

    exportToCsv('User List', headers, rows);
  }

  async onRefresh() {
    await Promise.all([
      this.userService.fetchAllUsers(true),
      this.userService.fetchGroups(true),
      this.userService.fetchReactivationRequests(),
    ]);
  }
}
