import { CommonModule } from '@angular/common';
import {
  Component,
  OnInit,
  OnDestroy,
  inject,
  NgZone,
  signal,
  computed,
  DoCheck,
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
import { DisplayNameModePipe } from '../../../../core/pipes/display-name-mode.pipe';
import { DisplayNamePipe } from '../../../../core/pipes/display-name.pipe';
import { RoleLabelPipe } from '../../../../core/pipes/role-label.pipe';
import { HeaderService } from '../../../../core/services/header.service';
import { exportToCsv } from '../../../../core/utils/csv-export.util';
import { TyappUser } from '../../../../core/models/user.model';
import { UserService } from './user.service';

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
    DisplayNamePipe,
    RoleLabelPipe,
    DisplayNameModePipe,
  ],
  providers: [DisplayNamePipe, RoleLabelPipe, DisplayNameModePipe],
  templateUrl: './user-edit.html',
})
export class UserEdit implements OnInit, OnDestroy, DoCheck {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  public userService = inject(UserService);
  private headerService = inject(HeaderService);
  private zone = inject(NgZone);

  private displayNamePipe = inject(DisplayNamePipe);
  private roleLabelPipe = inject(RoleLabelPipe);
  private displayNameModePipe = inject(DisplayNameModePipe);

  readonly availableRoles = [1, 900, 998];
  readonly availableModes = [1, 2, 3, 4, 5];

  user = signal<TyappUser | null>(null);
  isSaving = signal(false);

  originalDataStr = signal<string>('');

  isDirty = signal(false);

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
    if (!id) return;

    this.headerService.setConfig({
      backLink: '/users/list',
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

    const freshUser = await this.userService.fetchUserById(id);

    this.zone.run(() => {
      if (freshUser) {
        this.user.set(structuredClone(freshUser));
        this.originalDataStr.set(JSON.stringify(freshUser));
      } else if (!cachedUser) {
        this.router.navigate(['/users/list']);
      }
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
      const currentlyDirty = JSON.stringify(current) !== original;
      if (this.isDirty() !== currentlyDirty) {
        this.isDirty.set(currentlyDirty);
      }
    }
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
    const success = await this.userService.updateUser(data.user_id, data);

    this.zone.run(() => {
      if (success) {
        this.originalDataStr.set(JSON.stringify(data));
        this.isDirty.set(false);
        this.router.navigate(['/users/list']);
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
        u.status === 1 ? 'Active' : 'Inactive',
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
