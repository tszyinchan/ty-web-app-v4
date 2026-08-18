import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';

import { AuthService } from '../../../../core/services/auth.service';
import { HeaderService } from '../../../../core/services/header.service';
import { PushService } from '../../../../core/services/push.service';
import { DisplayNamePipe } from '../../../../core/pipes/display-name.pipe';
import { TyappPushSubscription } from '../../../../core/models/push-subscription.model';
import { UserService } from '../user/user.service';
import { formatDeviceLabel } from './notification-settings.util';

@Component({
  selector: 'app-notification-settings',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
  ],
  providers: [DisplayNamePipe],
  templateUrl: './notification-settings.html',
  styleUrl: './notification-settings.scss',
})
export class NotificationSettings implements OnInit, OnDestroy {
  private auth = inject(AuthService);
  private headerService = inject(HeaderService);
  private displayNamePipe = inject(DisplayNamePipe);

  readonly pushService = inject(PushService);
  readonly userService = inject(UserService);

  readonly isAdmin = this.auth.isAdmin;
  readonly thisDeviceLabel = formatDeviceLabel(navigator.userAgent);

  adminSubscriptions = signal<TyappPushSubscription[]>([]);
  adminLoading = signal(false);
  enabling = signal(false);
  disabling = signal(false);

  readonly statusLabel = computed(() => {
    const status = this.pushService.permissionStatus();
    if (status === 'unsupported') return 'This browser does not support push notifications';
    if (status === 'denied') return 'Blocked in this browser';
    if (status === 'granted' && this.pushService.pushReady()) return 'Enabled on this device';
    if (status === 'granted') return 'Allowed, but not subscribed yet';
    return 'Not enabled on this device';
  });

  constructor() {
    this.headerService.setConfig({ title: 'Notification Settings' });
  }

  ngOnInit() {
    this.pushService.refreshStatus();
    if (this.isAdmin()) {
      void this.userService.fetchAllUsers();
      void this.loadAdminSubscriptions();
    }
  }

  ngOnDestroy() {
    this.headerService.clear();
  }

  async onEnable() {
    this.enabling.set(true);
    try {
      await this.pushService.requestPermissionAndSubscribe();
    } finally {
      this.enabling.set(false);
    }
  }

  async onDisable() {
    if (!confirm('Disable push notifications on this device?')) return;
    this.disabling.set(true);
    try {
      await this.pushService.unsubscribeThisDevice();
    } finally {
      this.disabling.set(false);
    }
  }

  async loadAdminSubscriptions() {
    this.adminLoading.set(true);
    try {
      const rows = await this.pushService.fetchAllSubscriptionsAdmin();
      this.adminSubscriptions.set(rows);
    } finally {
      this.adminLoading.set(false);
    }
  }

  async onRevoke(sub: TyappPushSubscription) {
    const name = this.subscriberName(sub.user_id);
    if (!confirm(`Revoke notifications for ${name} on "${this.deviceLabel(sub.user_agent)}"?`)) {
      return;
    }
    const ok = await this.pushService.adminDeleteSubscription(sub.tb_tyapp_usr_psh_id);
    if (ok) {
      this.adminSubscriptions.update((rows) =>
        rows.filter((row) => row.tb_tyapp_usr_psh_id !== sub.tb_tyapp_usr_psh_id),
      );
    }
  }

  subscriberName(userId: string): string {
    const user = this.userService.users().find((item) => item.user_id === userId);
    return user ? this.displayNamePipe.transform(user) : 'Unknown User';
  }

  deviceLabel(userAgent: string | null | undefined): string {
    return formatDeviceLabel(userAgent);
  }
}
