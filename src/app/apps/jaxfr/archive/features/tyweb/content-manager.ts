import { CommonModule } from '@angular/common';
import {
  Component,
  OnInit,
  OnDestroy,
  inject,
  NgZone,
  signal,
  computed,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { RouterModule, Router } from '@angular/router';

import { TyWebIntroUserProfile } from './tyweb.model';
import { TywebService } from './tyweb.service';
import { AuthService } from '../../../../../core/services/auth.service';
import { HeaderService, HeaderAction } from '../../../../../core/services/header.service';
import { exportToCsv } from '../../../../../core/utils/csv-export.util';

@Component({
  selector: 'app-content-manager',
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
    MatSnackBarModule,
  ],
  templateUrl: './content-manager.html',
  styleUrls: ['./content-manager.scss'],
})
export class TyWebContentManager implements OnInit, OnDestroy {
  private router = inject(Router);
  private zone = inject(NgZone);
  private headerService = inject(HeaderService);
  private snackBar = inject(MatSnackBar);
  public authService = inject(AuthService);
  public profileService = inject(TywebService);

  profile = signal<TyWebIntroUserProfile | null>(null);
  editingField = signal<keyof TyWebIntroUserProfile | null>(null);
  tempValue = signal<any>('');
  isSaving = signal(false);

  private get currentUserId(): string {
    return this.authService.userProfile()?.user_id || '';
  }

  syncStatus = computed<'loading' | 'up-to-date' | 'unsaved' | 'none'>(() => {
    if (this.profileService.loading() || this.isSaving()) return 'loading';
    if (this.profile()) return 'up-to-date';
    return 'none';
  });

  async ngOnInit() {
    if (!this.currentUserId) {
      this.router.navigate(['/login']);
      return;
    }

    const actions: HeaderAction[] = [
      {
        label: 'Export CSV',
        icon: 'download',
        type: 'secondary',
        onClick: () => this.onExport(),
      },
    ];

    this.headerService.setConfig({
      backLink: '/dashboard',
      syncStatus: this.syncStatus,
      actions: actions,
    });

    await this.loadData();
  }

  async loadData() {
    const freshProfile = await this.profileService.getProfile(
      this.currentUserId,
    );
    this.zone.run(() => {
      if (freshProfile) {
        this.profile.set(structuredClone(freshProfile));
      } else {
        this.profile.set({
          user_id: this.currentUserId,
          public_display_name: '',
          status: 1,
        });
      }
    });
  }

  startEdit(field: keyof TyWebIntroUserProfile, currentValue: any) {
    this.tempValue.set(currentValue);
    this.editingField.set(field);
  }

  cancelEdit() {
    this.editingField.set(null);
    this.tempValue.set('');
  }

  async saveField(field: keyof TyWebIntroUserProfile) {
    const current = this.profile();
    let newValue = this.tempValue();

    if (typeof newValue === 'string') {
      newValue = newValue.trim();
    }

    if (!current || newValue === current[field]) {
      this.cancelEdit();
      return;
    }

    this.isSaving.set(true);

    try {
      await this.profileService.updateProfileField(
        this.currentUserId,
        field,
        newValue,
      );

      this.zone.run(() => {
        this.profile.update((p) => (p ? { ...p, [field]: newValue } : null));
        this.editingField.set(null);
        this.snackBar.open('Updated successfully', 'Close', { duration: 2000 });
      });
    } catch (error: any) {
      console.error('Update failed:', error);
      this.zone.run(() => {
        this.snackBar.open(`Update failed: ${error.message}`, 'OK', {
          duration: 5000,
          panelClass: 'error-snackbar',
        });
      });
    } finally {
      this.isSaving.set(false);
    }
  }

  onExport() {
    const p = this.profile();
    if (!p) return;

    const headers = [
      'Display Name',
      'Bio',
      'Image URL',
      'Email',
      'LinkedIn',
      'GitHub',
      'Banner Title',
      'Banner Subtitle',
      'Remarks',
      'Status',
    ];
    const rows = [
      [
        p.public_display_name || '',
        p.bio || '',
        p.profile_image_url || '',
        p.email || '',
        p.linkedin_url || '',
        p.github_url || '',
        p.web_banner_title || '',
        p.web_banner_subtitle || '',
        p.remarks || '',
        p.status === 1 ? 'Active' : 'Inactive',
      ],
    ];
    exportToCsv(`Profile_${p.public_display_name || 'Export'}`, headers, rows);
  }

  ngOnDestroy() {
    this.headerService.clear();
  }
}
