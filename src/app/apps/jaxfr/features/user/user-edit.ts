import { CommonModule } from '@angular/common';
import {
  Component,
  OnInit,
  OnDestroy,
  DoCheck,
  inject,
  NgZone,
  signal,
  computed,
  HostListener,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatSelectModule } from '@angular/material/select';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { AppFeature } from '../development/app-feature/app-feature.model';
import { AppFeatureService } from '../development/app-feature/app-feature.service';
import {
  NameDisplayMode,
  TyappUser,
  USER_ROLES,
} from '../../../../core/models/user.model';
import { DisplayNameModePipe } from '../../../../core/pipes/display-name-mode.pipe';
import { DisplayNamePipe } from '../../../../core/pipes/display-name.pipe';
import { RoleLabelPipe } from '../../../../core/pipes/role-label.pipe';
import { AccessService } from '../../../../core/services/access.service';
import { AppRegistryService } from '../../../../core/services/app-registry.service';
import { AuthService } from '../../../../core/services/auth.service';
import { HeaderService } from '../../../../core/services/header.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { exportToCsv } from '../../../../core/utils/csv-export.util';
import { UserService } from './user.service';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { RecordStatus } from '../../../../core/models/status.enum';

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
  selector: 'app-user-edit',
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
    MatMenuModule,
    MatCheckboxModule,
    DisplayNamePipe,
    RoleLabelPipe,
    DisplayNameModePipe,
  ],
  providers: [DisplayNamePipe, RoleLabelPipe, DisplayNameModePipe],
  templateUrl: './user-edit.html',
  styleUrl: './user-edit.scss',
})
export class UserEdit implements OnInit, OnDestroy, DoCheck {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  public userService = inject(UserService);
  public featureService = inject(AppFeatureService);
  public appRegistry = inject(AppRegistryService);
  private access = inject(AccessService);
  private auth = inject(AuthService);
  private headerService = inject(HeaderService);
  private notification = inject(NotificationService);
  private zone = inject(NgZone);

  private displayNamePipe = inject(DisplayNamePipe);
  private roleLabelPipe = inject(RoleLabelPipe);
  private displayNameModePipe = inject(DisplayNameModePipe);

  readonly availableModes = [
    NameDisplayMode.LegalFirstMiddleLast,
    NameDisplayMode.LegalLastMiddleFirst,
    NameDisplayMode.PreferredFirstMiddleLast,
    NameDisplayMode.PreferredLastMiddleFirst,
    NameDisplayMode.CustomizedOnly,
  ];
  readonly MIN_PASSWORD_LENGTH = 6;
  readonly canManageUsers = this.auth.isAdmin;

  passwordCurrent = '';
  passwordNew = '';
  passwordConfirm = '';
  hideCurrentPassword = signal(true);
  hideNewPassword = signal(true);
  passwordBusy = signal(false);

  user = signal<TyappUser | null>(null);
  isSaving = signal(false);

  originalDataStr = signal<string>('');
  isDirty = signal(false);

  selectedAppIds: string[] = [];
  selectedFeatureIds: string[] = [];
  private originalAccessStr = '';

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

  syncStatus = computed<'loading' | 'up-to-date' | 'unsaved' | 'none'>(() => {
    if (this.isSaving() || this.userService.loading()) return 'loading';
    if (this.isDirty()) return 'unsaved';
    if (this.user()) return 'up-to-date';
    return 'none';
  });

  isDeleted = computed(() => !!this.user()?.deleted_at);
  isInactive = computed(() => {
    const u = this.user();
    return !!u && !u.deleted_at && u.status === RecordStatus.Inactive;
  });
  isSelf = computed(
    () => this.user()?.user_id === this.auth.userProfile()?.user_id,
  );
  canManageTarget = computed(() => {
    const u = this.user();
    return !!u && this.auth.canManageUserRole(u.role);
  });
  canEditProfile = computed(
    () => !this.isDeleted() && (this.isSelf() || this.canManageTarget()),
  );
  assignableRoles = computed(() => {
    const roles: number[] = [USER_ROLES.USER, USER_ROLES.ADMIN];
    if (
      this.auth.isSuperAdmin() ||
      (this.user()?.role ?? 0) >= USER_ROLES.SUPER_ADMIN
    ) {
      roles.push(USER_ROLES.SUPER_ADMIN);
    }
    return roles;
  });
  isLastSuperAdmin = computed(() => {
    const u = this.user();
    if (!u || u.deleted_at || u.role < USER_ROLES.SUPER_ADMIN) return false;
    return this.userService.isLastActiveSuperAdmin(u.user_id);
  });
  hasPendingReactivation = computed(() => {
    const id = this.user()?.user_id;
    return !!id && this.userService.pendingReactivationUserIds().has(id);
  });
  accountStatusLabel = computed(() => {
    const u = this.user();
    if (!u) return '';
    if (u.deleted_at) return 'Deleted';
    return u.status === RecordStatus.Active ? 'Active' : 'Inactive';
  });

  isSaveDisabled = computed(
    () =>
      this.isSaving() ||
      !this.user() ||
      this.isDeleted() ||
      !this.canEditProfile() ||
      !this.hasUsableName(this.user()) ||
      (!!this.user()?.user_id && !this.isDirty()),
  );

  async ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    const myId = this.auth.userProfile()?.user_id;
    if (!id || !myId) {
      void this.router.navigate(['/welcome']);
      return;
    }

    if (!this.auth.isAdmin() && id !== myId) {
      void this.router.navigate(['/users/edit', myId], { replaceUrl: true });
      return;
    }

    const canBrowseDirectory = this.auth.isAdmin();

    void this.userService.fetchAllUsers();

    if (canBrowseDirectory) {
      await Promise.all([
        this.appRegistry.fetchAllApps(),
        this.featureService.fetchAllFeatures(),
        this.userService.fetchReactivationRequests(),
      ]);
    }

    this.headerService.setConfig({
      backLink: canBrowseDirectory ? '/users/list' : '/welcome',
      syncStatus: this.syncStatus,
      actions: [
        {
          label: 'Export',
          icon: 'download',
          type: 'secondary',
          onClick: () => this.onExport(),
        },
        {
          label: 'Save Changes',
          icon: 'check',
          type: 'primary',
          disabled: this.isSaveDisabled,
          onClick: () => this.onSave(),
        },
      ],
    });

    const cachedUser = this.userService.users().find((u) => u.user_id === id);
    if (cachedUser) {
      this.user.set(structuredClone(cachedUser));
      this.originalDataStr.set(JSON.stringify(cachedUser));
    }

    const [freshUser, grants] = await Promise.all([
      this.userService.fetchUserById(id),
      canBrowseDirectory
        ? this.access.fetchAccessForUser(id)
        : Promise.resolve({ appIds: [] as string[], featureIds: [] as string[] }),
    ]);

    this.zone.run(() => {
      if (freshUser) {
        this.setUserAndAccess(freshUser, grants.appIds, grants.featureIds);
      } else if (cachedUser) {
        this.setUserAndAccess(cachedUser, grants.appIds, grants.featureIds);
      } else {
        this.router.navigate(canBrowseDirectory ? ['/users/list'] : ['/welcome']);
      }
    });
  }

  private setUserAndAccess(
    u: TyappUser,
    appIds: string[],
    featureIds: string[],
  ) {
    this.user.set(structuredClone(u));
    this.originalDataStr.set(JSON.stringify(u));
    this.selectedAppIds = [...appIds];
    this.selectedFeatureIds = [...featureIds];
    this.originalAccessStr = this.accessSnapshot();
  }

  isAccessLocked(): boolean {
    return (
      this.isDeleted() ||
      !this.canManageTarget() ||
      (this.user()?.role ?? 0) >= USER_ROLES.SUPER_ADMIN
    );
  }

  isRoleLocked(): boolean {
    return this.isDeleted() || !this.canManageTarget();
  }

  hasUsableName(user: TyappUser | null): boolean {
    if (!user) return false;
    return !!(
      user.customized_display_name?.trim() ||
      user.preferred_first_name?.trim() ||
      user.legal_first_name?.trim() ||
      user.legal_last_name?.trim()
    );
  }

  canActivate(): boolean {
    return this.canManageTarget() && this.isInactive();
  }

  canDeactivate(): boolean {
    return (
      !this.isDeleted() &&
      !this.isInactive() &&
      !this.isLastSuperAdmin() &&
      (this.canManageTarget() || this.isSelf())
    );
  }

  canDeleteAccount(): boolean {
    return (
      !this.isDeleted() &&
      !this.isLastSuperAdmin() &&
      (this.auth.isSuperAdmin() || this.isSelf())
    );
  }

  canRestore(): boolean {
    return this.auth.isSuperAdmin() && this.isDeleted();
  }

  canChangeOwnPassword(): boolean {
    return this.isSelf() && !this.isDeleted();
  }

  canSetOthersPassword(): boolean {
    return this.auth.isSuperAdmin() && !this.isSelf() && !this.isDeleted();
  }

  canSendPasswordReset(): boolean {
    return this.canManageTarget() && !this.isDeleted();
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

  onRoleChange(role: number) {
    const original = JSON.parse(this.originalDataStr() || '{}') as {
      role?: number;
    };
    const wasSuperAdmin = (original.role ?? 0) >= USER_ROLES.SUPER_ADMIN;
    if (wasSuperAdmin && role < USER_ROLES.SUPER_ADMIN) {
      this.selectedAppIds = this.appRegistry
        .apps()
        .map((app) => app.tb_tyapp_app_id);
      this.selectedFeatureIds = this.launcherFeatures().map(
        (feature) => feature.tb_tyapp_ap_ftr_id,
      );
    }
  }

  toggleApp(appId: string, checked: boolean) {
    if (this.isAccessLocked()) return;
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
    this.markAsDirty();
  }

  toggleFeature(feature: AppFeature, checked: boolean) {
    if (this.isAccessLocked()) return;
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
    this.markAsDirty();
  }

  private accessSnapshot(): string {
    return JSON.stringify({
      apps: [...this.selectedAppIds].sort(),
      features: [...this.selectedFeatureIds].sort(),
    });
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
    const current = this.user();
    const original = this.originalDataStr();

    if (current && original) {
      const isBaseDirty = JSON.stringify(current) !== original;
      const isAccessDirty =
        this.canManageTarget() &&
        this.accessSnapshot() !== this.originalAccessStr;

      const currentlyDirty = isBaseDirty || isAccessDirty;

      if (this.isDirty() !== currentlyDirty) {
        this.isDirty.set(currentlyDirty);
      }
    }
  }

  markAsDirty() {
    this.isDirty.set(true);
  }

  async onSave() {
    const data = this.user();
    if (!data || this.isSaving() || !this.canEditProfile() || !this.hasUsableName(data))
      return;

    if (
      !this.auth.isSuperAdmin() &&
      data.role >= USER_ROLES.SUPER_ADMIN
    ) {
      this.notification.handleError(
        'Update Error',
        'Only a super admin can assign the super admin role',
      );
      return;
    }

    data.legal_first_name = data.legal_first_name?.trim() || null;
    data.legal_middle_name = data.legal_middle_name?.trim() || null;
    data.legal_last_name = data.legal_last_name?.trim() || null;
    data.preferred_first_name = data.preferred_first_name?.trim() || null;
    data.customized_display_name = data.customized_display_name?.trim() || null;

    this.isSaving.set(true);

    const canManage = this.canManageTarget();
    let success: boolean;

    if (canManage) {
      if (data.role >= USER_ROLES.SUPER_ADMIN) {
        data.allowed_apps = this.appRegistry
          .apps()
          .map((app) => app.name.toLowerCase());

        const grantsOk = await this.access.replaceAppAccess(data.user_id, []);
        if (!grantsOk) {
          this.zone.run(() => this.isSaving.set(false));
          return;
        }

        const featureGrantsOk = await this.access.replaceFeatureAccess(
          data.user_id,
          [],
        );
        if (!featureGrantsOk) {
          this.zone.run(() => this.isSaving.set(false));
          return;
        }
      } else {
        data.allowed_apps = this.appRegistry
          .apps()
          .filter((app) => this.selectedAppIds.includes(app.tb_tyapp_app_id))
          .map((app) => app.name.toLowerCase());

        const grantsOk = await this.access.replaceAppAccess(
          data.user_id,
          this.selectedAppIds,
        );
        if (!grantsOk) {
          this.zone.run(() => this.isSaving.set(false));
          return;
        }

        const featureGrantsOk = await this.access.replaceFeatureAccess(
          data.user_id,
          this.selectedFeatureIds,
        );
        if (!featureGrantsOk) {
          this.zone.run(() => this.isSaving.set(false));
          return;
        }
      }

      success = await this.userService.updateUser(data.user_id, data);
    } else {
      success = await this.userService.updateUser(data.user_id, {
        legal_first_name: data.legal_first_name,
        legal_middle_name: data.legal_middle_name,
        legal_last_name: data.legal_last_name,
        preferred_first_name: data.preferred_first_name,
        customized_display_name: data.customized_display_name,
        name_display_mode: data.name_display_mode,
      });
    }

    this.zone.run(() => {
      if (success) {
        this.originalDataStr.set(JSON.stringify(this.user()));
        this.originalAccessStr = this.accessSnapshot();
        this.isDirty.set(false);
        if (canManage) {
          this.router.navigate(['/users/list']);
        }
      }
      this.isSaving.set(false);
    });
  }

  onExport() {
    const u = this.user();
    if (!u) return;

    const headers = [
      'User ID',
      'Legal First Name',
      'Preferred Name',
      'Legal Middle Name',
      'Legal Last Name',
      'Display Mode',
      'Customized Display Name',
      'Final Display Name (Preview)',
      'Assigned Role',
      'Status',
      'Internal Remarks',
    ];
    const rows = [
      [
        u.user_id,
        u.legal_first_name || '',
        u.preferred_first_name || '',
        u.legal_middle_name || '',
        u.legal_last_name || '',
        this.displayNameModePipe.transform(u.name_display_mode),
        u.customized_display_name || '',
        this.displayNamePipe.transform(u, true),
        this.roleLabelPipe.transform(u.role),
        this.accountStatusLabel(),
        u.remarks || '',
      ],
    ];

    exportToCsv(
      `User_Detail_${this.displayNamePipe.transform(u, true) || u.user_id}`,
      headers,
      rows,
    );
  }

  async onActivate() {
    const u = this.user();
    if (!u || !this.canActivate()) return;
    if (!confirm('Activate this account so they can sign in again?')) return;

    const saved = await this.userService.setUserStatus(
      u.user_id,
      RecordStatus.Active,
    );
    if (saved) {
      this.applyLifecycleUser(saved);
    }
  }

  async onDeactivate() {
    const u = this.user();
    if (!u || !this.canDeactivate()) return;

    const message = this.isSelf()
      ? 'Deactivate your account? You will be signed out. Try signing in again to ask a super admin to turn it back on.'
      : 'Deactivate this account? They cannot sign in until a super admin turns it back on. Shared records stay.';
    if (!confirm(message)) return;

    const saved = await this.userService.setUserStatus(
      u.user_id,
      RecordStatus.Inactive,
    );
    if (saved && !this.isSelf()) {
      this.applyLifecycleUser(saved);
    }
  }

  async onDeleteAccount() {
    const u = this.user();
    if (!u || !this.canDeleteAccount()) return;

    const message = this.isSelf()
      ? 'Delete your account? You will be signed out. Chat rooms keep your membership and old messages; other people see your name with (Deleted). Only a super admin can restore the account.'
      : 'Delete this account? They cannot sign in. Chat rooms, groups, and grants stay in the database. Other people see old messages as the person\'s name with (Deleted). Only a super admin can restore.';
    if (!confirm(message)) return;

    const ok = await this.userService.softDeleteUser(u.user_id);
    if (ok && !this.isSelf()) {
      const next = this.userService
        .users()
        .find((item) => item.user_id === u.user_id);
      const grants = await this.access.fetchAccessForUser(u.user_id);
      if (next) {
        this.setUserAndAccess(next, grants.appIds, grants.featureIds);
      }
    }
  }

  async onRestore() {
    const u = this.user();
    if (!u || !this.canRestore()) return;
    if (
      !confirm(
        'Restore this account? They can sign in again. Chat rooms, groups, and app access from before the delete are still there.',
      )
    ) {
      return;
    }

    const saved = await this.userService.restoreUser(u.user_id);
    if (!saved) return;

    const grants = await this.access.fetchAccessForUser(saved.user_id);
    this.zone.run(() => {
      this.setUserAndAccess(saved, grants.appIds, grants.featureIds);
    });
  }

  async onChangeOwnPassword() {
    if (!this.canChangeOwnPassword() || this.passwordBusy()) return;
    const current = this.passwordCurrent;
    const next = this.passwordNew;
    const mismatch = this.passwordMismatch();
    if (!current || !next || mismatch || next.length < this.MIN_PASSWORD_LENGTH) {
      this.notification.handleError(
        'Change Password Failed',
        mismatch
          ? 'New password and confirmation do not match'
          : 'Fill current password and a new password of at least 6 characters',
      );
      return;
    }

    this.passwordBusy.set(true);
    try {
      await this.auth.changeOwnPassword(current, next);
      this.clearPasswordFields();
      this.notification.showSuccess('Password updated');
    } catch (error: unknown) {
      this.notification.handleError('Change Password Failed', error);
    } finally {
      this.zone.run(() => this.passwordBusy.set(false));
    }
  }

  async onSetOthersPassword() {
    const u = this.user();
    if (!u || !this.canSetOthersPassword() || this.passwordBusy()) return;
    const next = this.passwordNew;
    const mismatch = this.passwordMismatch();
    if (!next || mismatch || next.length < this.MIN_PASSWORD_LENGTH) {
      this.notification.handleError(
        'Set Password Failed',
        mismatch
          ? 'New password and confirmation do not match'
          : 'Enter a new password of at least 6 characters',
      );
      return;
    }
    if (
      !confirm(
        'Set a new password for this person? They will use it the next time they sign in.',
      )
    ) {
      return;
    }

    this.passwordBusy.set(true);
    try {
      await this.auth.setUserPassword(u.user_id, next);
      this.clearPasswordFields();
      this.notification.showSuccess('Password updated');
    } catch (error: unknown) {
      this.notification.handleError('Set Password Failed', error);
    } finally {
      this.zone.run(() => this.passwordBusy.set(false));
    }
  }

  async onSendPasswordReset() {
    const u = this.user();
    if (!u || !this.canSendPasswordReset() || this.passwordBusy()) return;
    if (
      !confirm(
        'Send a password reset email to this account? They will use the link to choose a new password.',
      )
    ) {
      return;
    }

    this.passwordBusy.set(true);
    try {
      await this.auth.sendPasswordReset(u.user_id);
      this.notification.showSuccess('Reset email sent');
    } catch (error: unknown) {
      this.notification.handleError('Send Reset Failed', error);
    } finally {
      this.zone.run(() => this.passwordBusy.set(false));
    }
  }

  passwordMismatch(): boolean {
    return (
      !!this.passwordNew &&
      !!this.passwordConfirm &&
      this.passwordNew !== this.passwordConfirm
    );
  }

  private clearPasswordFields() {
    this.passwordCurrent = '';
    this.passwordNew = '';
    this.passwordConfirm = '';
  }

  private applyLifecycleUser(saved: TyappUser) {
    this.user.set(structuredClone(saved));
    this.originalDataStr.set(JSON.stringify(saved));
    this.isDirty.set(false);
  }

  ngOnDestroy() {
    this.headerService.clear();
  }
}
