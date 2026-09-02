import { CommonModule } from '@angular/common';
import {
  Component,
  DoCheck,
  HostListener,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { SUBDOMAINS } from '../../../../app.constants';
import { RecordStatus } from '../../../../core/models/status.enum';
import { AppRegistryService } from '../../../../core/services/app-registry.service';
import { AuthService } from '../../../../core/services/auth.service';
import {
  HeaderAction,
  HeaderService,
} from '../../../../core/services/header.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { copyTextToClipboard } from '../../../../core/utils/copy-text.util';
import { formatDate, parseLocalDate } from '../../../../core/utils/date-time.util';
import { exportToCsv } from '../../../../core/utils/csv-export.util';
import { AppFeature } from '../development/app-feature/app-feature.model';
import { AppFeatureService } from '../development/app-feature/app-feature.service';
import { Invitation } from './invitation.model';
import { generateInviteCode } from './invitation.util';
import { UserService } from './user.service';

const ACCESS_FEATURE_NAMES = new Set([
  'Work',
  'Article',
  'Fit',
  'Filelink',
  'Tyweb Control',
  'Chat',
  'Settings',
  'User',
  'Development',
]);

@Component({
  selector: 'app-invitation-edit',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatCheckboxModule,
  ],
  templateUrl: './invitation-edit.html',
  styleUrl: './invitation-edit.scss',
})
export class InvitationEdit implements OnInit, OnDestroy, DoCheck {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private auth = inject(AuthService);
  private headerService = inject(HeaderService);
  private notification = inject(NotificationService);
  public userService = inject(UserService);
  public appRegistry = inject(AppRegistryService);
  public featureService = inject(AppFeatureService);

  readonly RecordStatus = RecordStatus;

  item = signal<Partial<Invitation> | null>(null);
  currentId: string | null = null;
  expiresOn = '';
  selectedAppIds: string[] = [];
  selectedFeatureIds: string[] = [];
  originalDataStr = signal('');
  originalAccessStr = '';
  originalExpiresOn = '';
  isDirty = signal(false);
  isSaveDisabled = signal(true);

  launcherFeatures = computed(() =>
    this.featureService
      .features()
      .filter(
        (feature) =>
          feature.show_in_launcher ||
          !!feature.route?.trim() ||
          ACCESS_FEATURE_NAMES.has(feature.name),
      ),
  );

  activeGroups = computed(() =>
    this.userService
      .groups()
      .filter(
        (group) =>
          group.status === RecordStatus.Active && !group.deleted_at,
      ),
  );

  jaxfrAppId = computed(
    () =>
      this.appRegistry
        .apps()
        .find((app) => app.name.toLowerCase() === SUBDOMAINS.JAXFR)
        ?.tb_tyapp_app_id ?? null,
  );

  syncStatus = computed<'loading' | 'up-to-date' | 'unsaved' | 'none'>(() => {
    if (this.userService.invitationsLoading()) return 'loading';
    if (this.isDirty()) return 'unsaved';
    if (this.currentId) return 'up-to-date';
    return 'none';
  });

  async ngOnInit() {
    if (!this.auth.isAdmin()) {
      const myId = this.auth.userProfile()?.user_id;
      void this.router.navigate(myId ? ['/users/edit', myId] : ['/welcome'], {
        replaceUrl: true,
      });
      return;
    }

    this.currentId = this.route.snapshot.paramMap.get('id');
    await Promise.all([
      this.userService.fetchInvitations(),
      this.userService.fetchGroups(),
      this.appRegistry.fetchAllApps(),
      this.featureService.fetchAllFeatures(),
    ]);

    const actions: HeaderAction[] = [
      {
        label: 'Copy Code',
        icon: 'content_copy',
        type: 'secondary',
        onClick: () => this.onCopyCode(),
      },
    ];
    if (this.currentId) {
      actions.push({
        label: 'Export',
        icon: 'download',
        type: 'secondary',
        onClick: () => this.onExport(),
      });
      actions.push({
        label: 'Delete',
        icon: 'delete_outline',
        type: 'secondary',
        onClick: () => this.onDelete(),
      });
    }
    actions.push({
      label: this.currentId ? 'Save Changes' : 'Create Invite',
      icon: 'check',
      type: 'primary',
      disabled: this.isSaveDisabled,
      onClick: () => this.onSave(),
    });

    this.headerService.setConfig({
      backLink: '/users/invites/list',
      syncStatus: this.syncStatus,
      actions,
    });

    if (this.currentId) {
      const cached = this.userService
        .invitations()
        .find((invite) => invite.tb_tyapp_inv_id === this.currentId);
      if (cached) {
        this.setInvite(cached);
      } else {
        this.router.navigate(['/users/invites/list']);
      }
    } else {
      const jaxfrId = this.jaxfrAppId();
      const newInvite: Partial<Invitation> = {
        code: generateInviteCode(),
        status: RecordStatus.Active,
        max_uses: 1,
        uses_count: 0,
        expires_at: null,
        app_ids: jaxfrId ? [jaxfrId] : [],
        feature_ids: [],
        group_id: null,
        remarks: '',
      };
      this.item.set(newInvite);
      this.selectedAppIds = [...(newInvite.app_ids ?? [])];
      this.selectedFeatureIds = [];
      this.expiresOn = '';
      this.originalDataStr.set(JSON.stringify(newInvite));
      this.originalAccessStr = this.accessSnapshot();
      this.originalExpiresOn = '';
    }
  }

  private setInvite(invite: Invitation) {
    this.item.set(structuredClone(invite));
    this.selectedAppIds = [...(invite.app_ids ?? [])];
    this.selectedFeatureIds = [...(invite.feature_ids ?? [])];
    this.expiresOn = invite.expires_at
      ? formatDate(new Date(invite.expires_at))
      : '';
    this.originalDataStr.set(JSON.stringify(invite));
    this.originalAccessStr = this.accessSnapshot();
    this.originalExpiresOn = this.expiresOn;
  }

  featuresForApp(appId: string): AppFeature[] {
    return this.launcherFeatures()
      .filter((feature) => feature.app_id === appId)
      .sort((a, b) => a.customized_order - b.customized_order);
  }

  isAppSelected(appId: string): boolean {
    return this.selectedAppIds.includes(appId);
  }

  isFeatureSelected(featureId: string): boolean {
    return this.selectedFeatureIds.includes(featureId);
  }

  toggleApp(appId: string, checked: boolean) {
    if (checked) {
      if (!this.selectedAppIds.includes(appId)) {
        this.selectedAppIds = [...this.selectedAppIds, appId];
      }
    } else {
      this.selectedAppIds = this.selectedAppIds.filter((id) => id !== appId);
      const featureIds = this.featuresForApp(appId).map(
        (f) => f.tb_tyapp_ap_ftr_id,
      );
      this.selectedFeatureIds = this.selectedFeatureIds.filter(
        (id) => !featureIds.includes(id),
      );
    }
  }

  toggleFeature(feature: AppFeature, checked: boolean) {
    if (checked) {
      if (!this.selectedFeatureIds.includes(feature.tb_tyapp_ap_ftr_id)) {
        this.selectedFeatureIds = [
          ...this.selectedFeatureIds,
          feature.tb_tyapp_ap_ftr_id,
        ];
      }
      if (!this.selectedAppIds.includes(feature.app_id)) {
        this.selectedAppIds = [...this.selectedAppIds, feature.app_id];
      }
    } else {
      this.selectedFeatureIds = this.selectedFeatureIds.filter(
        (id) => id !== feature.tb_tyapp_ap_ftr_id,
      );
    }
  }

  private accessSnapshot(): string {
    return JSON.stringify({
      apps: [...this.selectedAppIds].sort(),
      features: [...this.selectedFeatureIds].sort(),
    });
  }

  private expiresAtFromInput(): string | null {
    const value = this.expiresOn.trim();
    if (!value) return null;
    const d = parseLocalDate(value);
    if (!d) return null;
    d.setHours(23, 59, 59, 999);
    return d.toISOString();
  }

  private hasJaxfrApp(): boolean {
    const jaxfrId = this.jaxfrAppId();
    return !!jaxfrId && this.selectedAppIds.includes(jaxfrId);
  }

  @HostListener('window:beforeunload', ['$event'])
  onBeforeUnload(event: BeforeUnloadEvent) {
    if (this.isDirty()) {
      event.preventDefault();
      return false;
    }
    return true;
  }

  ngDoCheck() {
    const current = this.item();
    const original = this.originalDataStr();
    if (!current || !original) return;

    const currentlyDirty =
      JSON.stringify(current) !== original ||
      this.accessSnapshot() !== this.originalAccessStr ||
      this.expiresOn !== this.originalExpiresOn;
    if (this.isDirty() !== currentlyDirty) {
      this.isDirty.set(currentlyDirty);
    }

    const maxUses = Math.max(1, Number(current.max_uses) || 1);
    const used = Number(current.uses_count) || 0;
    const disabled =
      this.userService.invitationsLoading() ||
      (!!this.currentId && !currentlyDirty) ||
      !current.code?.trim() ||
      !this.hasJaxfrApp() ||
      maxUses < used;

    if (this.isSaveDisabled() !== disabled) {
      this.isSaveDisabled.set(disabled);
    }
  }

  async onCopyCode() {
    const code = this.item()?.code?.trim();
    if (!code) return;
    try {
      await copyTextToClipboard(code);
      this.notification.showSuccess('Invitation code copied');
    } catch (error: unknown) {
      this.notification.handleError('Copy Failed', error);
    }
  }

  async onSave() {
    const data = this.item();
    if (!data || !data.code?.trim() || !this.hasJaxfrApp()) return;

    const maxUses = Math.max(1, Number(data.max_uses) || 1);
    const used = Number(data.uses_count) || 0;
    if (maxUses < used) return;

    const payload: Partial<Invitation> = {
      ...data,
      max_uses: maxUses,
      expires_at: this.expiresAtFromInput(),
      app_ids: [...this.selectedAppIds],
      feature_ids: [...this.selectedFeatureIds],
      group_id: data.group_id || null,
    };

    const saved = await this.userService.saveInvitation(payload);
    if (saved) {
      this.setInvite(saved);
      this.isDirty.set(false);
      this.router.navigate(['/users/invites/list']);
    }
  }

  async onDelete() {
    if (!this.currentId) return;
    if (
      !confirm(
        'Delete this invitation? People who already registered keep their accounts.',
      )
    ) {
      return;
    }
    const success = await this.userService.deleteInvitation(this.currentId);
    if (success) {
      this.router.navigate(['/users/invites/list']);
    }
  }

  onExport() {
    const invite = this.item();
    if (!invite || !this.currentId) return;

    exportToCsv(
      `Invitation_${invite.code || this.currentId}`,
      [
        'Invite ID',
        'Code',
        'Uses',
        'Max uses',
        'Status',
        'Expires',
        'Group ID',
        'Remarks',
      ],
      [
        [
          this.currentId,
          invite.code || '',
          String(invite.uses_count ?? 0),
          String(invite.max_uses ?? ''),
          invite.status === RecordStatus.Active ? 'Active' : 'Inactive',
          invite.expires_at || '',
          invite.group_id || '',
          invite.remarks || '',
        ],
      ],
    );
  }

  ngOnDestroy() {
    this.headerService.clear();
  }
}
