import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';

import { AuthService } from '../../../../core/services/auth.service';
import { HeaderService } from '../../../../core/services/header.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { DisplayNamePipe } from '../../../../core/pipes/display-name.pipe';
import { UserService } from '../user/user.service';
import { DailyLogChrome, DailyLogChromeAction } from './daily-log-chrome';
import { DailyLogService } from './daily-log.service';

@Component({
  selector: 'app-daily-log-viewers',
  standalone: true,
  imports: [
    CommonModule,
    DailyLogChrome,
  ],
  providers: [DisplayNamePipe],
  templateUrl: './daily-log-viewers.html',
  styleUrl: './daily-log-viewers.scss',
})
export class DailyLogViewers implements OnInit, OnDestroy {
  readonly service = inject(DailyLogService);
  private headerService = inject(HeaderService);
  private userService = inject(UserService);
  private authService = inject(AuthService);
  private notification = inject(NotificationService);
  private displayNamePipe = inject(DisplayNamePipe);

  userSearch = signal('');
  searchOpen = signal(false);

  readonly viewerIds = computed(() =>
    this.service.outgoingGrants().map((row) => row.viewer_user_id),
  );

  readonly filteredUsers = computed(() => {
    const q = this.userSearch().toLowerCase();
    const owner = this.authService.userProfile()?.user_id || '';
    const allowed = this.viewerIds();
    return this.userService
      .usersSharingOneGroupWith([owner, ...allowed])
      .filter((user) => user.user_id !== owner && !allowed.includes(user.user_id))
      .map((user) => ({
        value: user.user_id,
        label: this.displayNamePipe.transform(user),
      }))
      .filter((opt) => (q ? opt.label.toLowerCase().includes(q) : true));
  });

  readonly chromeActions = computed<DailyLogChromeAction[]>(() => [
    {
      label: 'Refresh',
      icon: 'refresh',
      disabled: this.service.viewersLoading() || this.service.busy(),
      onClick: () => void this.service.fetchViewerGrants(true),
    },
  ]);

  ngOnInit() {
    this.headerService.clear();
    void this.userService.fetchAllUsers();
    void this.userService.fetchGroups();
    void this.service.fetchViewerGrants(true);
  }

  ngOnDestroy() {
    this.headerService.clear();
  }

  displayUserName(id: string): string {
    const user = this.userService.users().find((item) => item.user_id === id);
    return this.displayNamePipe.transform(user);
  }

  onSearchInput(event: Event) {
    const value = (event.target as HTMLInputElement | null)?.value ?? '';
    this.userSearch.set(value);
  }

  async addViewer(userId: string) {
    this.userSearch.set('');
    this.searchOpen.set(false);
    if (!userId) return;
    const owner = this.authService.userProfile()?.user_id || '';
    if (
      !this.userService.idsShareAGroup([owner, ...this.viewerIds(), userId])
    ) {
      this.notification.handleError(
        'Add Viewer Failed',
        'Everyone granted access must belong to the same user group',
      );
      return;
    }
    await this.service.addViewerGrant(userId);
  }

  async removeViewer(userId: string) {
    const grant = this.service
      .outgoingGrants()
      .find((row) => row.viewer_user_id === userId);
    if (!grant) return;
    await this.service.removeViewerGrant(grant.tb_tyapp_dl_shr_id);
  }
}
