import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Router, RouterModule } from '@angular/router';
import { RecordStatus } from '../../../../core/models/status.enum';
import { AuthService } from '../../../../core/services/auth.service';
import { HeaderService } from '../../../../core/services/header.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { copyTextToClipboard } from '../../../../core/utils/copy-text.util';
import { exportToCsv } from '../../../../core/utils/csv-export.util';
import { Invitation } from './invitation.model';
import { inviteListStatus } from './invitation.util';
import { UserService } from './user.service';

@Component({
  selector: 'app-invitation-list',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './invitation-list.html',
})
export class InvitationList implements OnInit, OnDestroy {
  public readonly userService = inject(UserService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly headerService = inject(HeaderService);
  private readonly notification = inject(NotificationService);

  readonly RecordStatus = RecordStatus;

  ngOnInit() {
    if (!this.auth.isSuperAdmin()) {
      const myId = this.auth.userProfile()?.user_id;
      void this.router.navigate(myId ? ['/users/edit', myId] : ['/welcome'], {
        replaceUrl: true,
      });
      return;
    }

    const isLoading = computed(() => this.userService.invitationsLoading());
    const isExportDisabled = computed(
      () => isLoading() || this.userService.invitations().length === 0,
    );

    this.headerService.setConfig({
      title: 'Invites',
      backLink: '/users',
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
          label: 'New Invite',
          icon: 'add',
          type: 'primary',
          disabled: isLoading,
          onClick: () => this.router.navigate(['/users/invites/new']),
        },
      ],
    });

    void this.userService.fetchInvitations();
    void this.userService.fetchGroups();
  }

  ngOnDestroy() {
    this.headerService.clear();
  }

  statusLabel(invite: Invitation): string {
    return inviteListStatus(invite);
  }

  groupName(groupId: string | null): string {
    if (!groupId) return 'No group';
    const group = this.userService
      .groups()
      .find((item) => item.tb_tyapp_usr_grp_id === groupId);
    return group?.name || 'Unknown group';
  }

  async onCopyCode(event: Event, code: string) {
    event.preventDefault();
    event.stopPropagation();
    try {
      await copyTextToClipboard(code);
      this.notification.showSuccess('Invitation code copied');
    } catch (error: unknown) {
      this.notification.handleError('Copy Failed', error);
    }
  }

  async onRefresh() {
    await Promise.all([
      this.userService.fetchInvitations(true),
      this.userService.fetchGroups(true),
    ]);
  }

  onExport() {
    const invites = this.userService.invitations();
    if (invites.length === 0) return;

    const headers = [
      'Invite ID',
      'Code',
      'Uses',
      'Max uses',
      'Status',
      'Expires',
      'Group',
    ];
    const rows = invites.map((invite) => [
      invite.tb_tyapp_inv_id,
      invite.code,
      String(invite.uses_count),
      String(invite.max_uses),
      this.statusLabel(invite),
      invite.expires_at || '',
      this.groupName(invite.group_id),
    ]);

    exportToCsv('Invitations', headers, rows);
  }
}
