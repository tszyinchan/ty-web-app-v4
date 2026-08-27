import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import {
  MatAutocompleteModule,
  MatAutocompleteSelectedEvent,
} from '@angular/material/autocomplete';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { AuthService } from '../../../../core/services/auth.service';
import { HeaderService } from '../../../../core/services/header.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { DisplayNamePipe } from '../../../../core/pipes/display-name.pipe';
import { UserService } from '../user/user.service';
import { DailyChecklistChrome, DclChromeAction } from './daily-checklist-chrome';
import { DailyChecklistService } from './daily-checklist.service';

@Component({
  selector: 'app-daily-checklist-share',
  standalone: true,
  imports: [
    CommonModule,
    DailyChecklistChrome,
    MatAutocompleteModule,
    MatChipsModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
  ],
  providers: [DisplayNamePipe],
  templateUrl: './daily-checklist-share.html',
  styleUrl: './daily-checklist-share.scss',
})
export class DailyChecklistShare implements OnInit, OnDestroy {
  readonly service = inject(DailyChecklistService);
  private headerService = inject(HeaderService);
  private userService = inject(UserService);
  private authService = inject(AuthService);
  private notification = inject(NotificationService);
  private displayNamePipe = inject(DisplayNamePipe);

  userSearch = signal('');

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

  readonly chromeActions = computed<DclChromeAction[]>(() => [
    {
      label: 'Refresh',
      icon: 'refresh',
      disabled: this.service.shareLoading() || this.service.busy(),
      onClick: () => void this.service.fetchShareGrants(true),
    },
  ]);

  ngOnInit() {
    this.headerService.clear();
    void this.userService.fetchAllUsers();
    void this.userService.fetchGroups();
    void this.service.fetchShareGrants(true);
  }

  ngOnDestroy() {
    this.headerService.clear();
  }

  displayUserName(id: string): string {
    const user = this.userService.users().find((item) => item.user_id === id);
    return this.displayNamePipe.transform(user);
  }

  async addViewer(event: MatAutocompleteSelectedEvent) {
    const userId = String(event.option.value ?? '');
    this.userSearch.set('');
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
    await this.service.addShareGrant(userId);
  }

  async removeViewer(userId: string) {
    const grant = this.service
      .outgoingGrants()
      .find((row) => row.viewer_user_id === userId);
    if (!grant) return;
    await this.service.removeShareGrant(grant.tb_tyapp_dcl_shr_id);
  }
}
