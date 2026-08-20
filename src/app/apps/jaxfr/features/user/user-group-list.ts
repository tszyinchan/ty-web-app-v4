import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Router, RouterModule } from '@angular/router';
import { RecordStatus } from '../../../../core/models/status.enum';
import { AuthService } from '../../../../core/services/auth.service';
import { HeaderService } from '../../../../core/services/header.service';
import { exportToCsv } from '../../../../core/utils/csv-export.util';
import { UserService } from './user.service';

@Component({
  selector: 'app-user-group-list',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './user-group-list.html',
})
export class UserGroupList implements OnInit, OnDestroy {
  public readonly userService = inject(UserService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly headerService = inject(HeaderService);

  readonly RecordStatus = RecordStatus;

  ngOnInit() {
    if (!this.auth.isSuperAdmin()) {
      const myId = this.auth.userProfile()?.user_id;
      void this.router.navigate(myId ? ['/users/edit', myId] : ['/welcome'], {
        replaceUrl: true,
      });
      return;
    }

    const isLoading = computed(() => this.userService.groupsLoading());
    const isExportDisabled = computed(
      () => isLoading() || this.userService.groups().length === 0,
    );

    this.headerService.setConfig({
      title: 'Groups',
      backLink: '/users/list',
      actions: [
        {
          label: 'Refresh',
          icon: 'refresh',
          type: 'secondary',
          disabled: isLoading,
          onClick: () => this.onRefresh(),
        },
        {
          label: 'Export',
          icon: 'download',
          type: 'secondary',
          disabled: isExportDisabled,
          onClick: () => this.onExport(),
        },
        {
          label: 'New Group',
          icon: 'add',
          type: 'primary',
          disabled: isLoading,
          onClick: () => this.router.navigate(['/users/groups/new']),
        },
      ],
    });

    void this.userService.fetchGroups();
    void this.userService.fetchAllUsers();
  }

  ngOnDestroy() {
    this.headerService.clear();
  }

  memberCount(groupId: string): number {
    return this.userService.memberUserIdsForGroup(groupId).length;
  }

  async onRefresh() {
    await Promise.all([
      this.userService.fetchGroups(true),
      this.userService.fetchAllUsers(true),
    ]);
  }

  onExport() {
    const groups = this.userService.groups();
    if (groups.length === 0) return;

    const headers = ['Group ID', 'Name', 'Members', 'Order', 'Status'];
    const rows = groups.map((group) => [
      group.tb_tyapp_usr_grp_id,
      group.name,
      String(this.memberCount(group.tb_tyapp_usr_grp_id)),
      String(group.customized_order),
      group.status === RecordStatus.Active ? 'Active' : 'Inactive',
    ]);

    exportToCsv('User_Groups', headers, rows);
  }
}
