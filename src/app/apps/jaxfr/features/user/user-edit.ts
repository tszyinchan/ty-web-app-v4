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
  private zone = inject(NgZone);

  private displayNamePipe = inject(DisplayNamePipe);
  private roleLabelPipe = inject(RoleLabelPipe);
  private displayNameModePipe = inject(DisplayNameModePipe);

  readonly availableRoles = [
    USER_ROLES.USER,
    USER_ROLES.ADMIN,
    USER_ROLES.SUPER_ADMIN,
  ];
  readonly availableModes = [
    NameDisplayMode.LegalFirstMiddleLast,
    NameDisplayMode.LegalLastMiddleFirst,
    NameDisplayMode.PreferredFirstMiddleLast,
    NameDisplayMode.PreferredLastMiddleFirst,
    NameDisplayMode.CustomizedOnly,
  ];
  readonly NameDisplayMode = NameDisplayMode;
  readonly RecordStatus = RecordStatus;
  readonly canManageUsers = this.auth.isSuperAdmin;

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

  isSaveDisabled = computed(
    () =>
      this.isSaving() ||
      !this.user() ||
      !this.user()?.legal_first_name?.trim() ||
      !this.user()?.legal_last_name?.trim() ||
      (!!this.user()?.user_id && !this.isDirty()),
  );

  async ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    const myId = this.auth.userProfile()?.user_id;
    if (!id || !myId) {
      void this.router.navigate(['/welcome']);
      return;
    }

    if (!this.auth.isSuperAdmin() && id !== myId) {
      void this.router.navigate(['/users/edit', myId], { replaceUrl: true });
      return;
    }

    const canManage = this.auth.isSuperAdmin();

    if (canManage) {
      await Promise.all([
        this.appRegistry.fetchAllApps(),
        this.featureService.fetchAllFeatures(),
      ]);
    }

    this.headerService.setConfig({
      backLink: canManage ? '/users/list' : '/welcome',
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
      canManage
        ? this.access.fetchAccessForUser(id)
        : Promise.resolve({ appIds: [] as string[], featureIds: [] as string[] }),
    ]);

    this.zone.run(() => {
      if (freshUser) {
        this.setUserAndAccess(freshUser, grants.appIds, grants.featureIds);
      } else if (cachedUser) {
        this.setUserAndAccess(cachedUser, grants.appIds, grants.featureIds);
      } else {
        this.router.navigate(canManage ? ['/users/list'] : ['/welcome']);
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
      !this.auth.isSuperAdmin() ||
      (this.user()?.role ?? 0) >= USER_ROLES.SUPER_ADMIN
    );
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
        this.auth.isSuperAdmin() &&
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
    if (
      !data ||
      this.isSaving() ||
      !data.legal_first_name?.trim() ||
      !data.legal_last_name?.trim()
    )
      return;

    this.isSaving.set(true);

    const canManage = this.auth.isSuperAdmin();
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
        this.displayNamePipe.transform(u),
        this.roleLabelPipe.transform(u.role),
        u.status === RecordStatus.Active ? 'Active' : 'Inactive',
        u.remarks || '',
      ],
    ];

    exportToCsv(
      `User_Detail_${u.legal_first_name || u.user_id}`,
      headers,
      rows,
    );
  }

  ngOnDestroy() {
    this.headerService.clear();
  }
}
