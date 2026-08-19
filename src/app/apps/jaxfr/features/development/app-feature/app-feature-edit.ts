import { CommonModule } from '@angular/common';
import {
  Component,
  DoCheck,
  HostListener,
  NgZone,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { RecordStatus } from '../../../../../core/models/status.enum';
import { AppRegistryService } from '../../../../../core/services/app-registry.service';
import {
  HeaderAction,
  HeaderService,
} from '../../../../../core/services/header.service';
import { exportToCsv } from '../../../../../core/utils/csv-export.util';
import { AppFeature } from './app-feature.model';
import { AppFeatureService } from './app-feature.service';

@Component({
  selector: 'app-feature-edit',
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
    MatSlideToggleModule,
  ],
  templateUrl: './app-feature-edit.html',
  styleUrl: './app-feature-edit.scss',
})
export class AppFeatureEdit implements OnInit, OnDestroy, DoCheck {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private zone = inject(NgZone);
  public featureService = inject(AppFeatureService);
  public appRegistry = inject(AppRegistryService);
  private headerService = inject(HeaderService);

  readonly RecordStatus = RecordStatus;

  item = signal<Partial<AppFeature> | null>(null);
  currentId: string | null = null;

  originalDataStr = signal<string>('');

  isDirty = signal(false);

  syncStatus = computed<'loading' | 'up-to-date' | 'unsaved' | 'none'>(() => {
    if (this.featureService.loading()) return 'loading';
    if (this.isDirty()) return 'unsaved';
    if (this.currentId) return 'up-to-date';
    return 'none';
  });

  isSaveDisabled = signal(true);

  async ngOnInit() {
    this.currentId = this.route.snapshot.paramMap.get('id');
    await this.appRegistry.fetchAllApps();

    const actions: HeaderAction[] = [];
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
      label: this.currentId ? 'Save Changes' : 'Create Feature',
      icon: 'check',
      type: 'primary',
      disabled: this.isSaveDisabled,
      onClick: () => this.onSave(),
    });

    this.headerService.setConfig({
      backLink: '/development/feature/list',
      syncStatus: this.syncStatus,
      actions: actions,
    });

    if (this.currentId) {
      const cached = this.featureService
        .features()
        .find((f) => f.tb_tyapp_ap_ftr_id === this.currentId);
      if (cached) {
        this.item.set(structuredClone(cached));
        this.originalDataStr.set(JSON.stringify(cached));
      }

      const fresh = await this.featureService.fetchFeatureById(this.currentId);

      this.zone.run(() => {
        if (fresh) {
          this.item.set(structuredClone(fresh));
          this.originalDataStr.set(JSON.stringify(fresh));
        } else if (!cached) {
          this.router.navigate(['/development/feature/list']);
        }
      });
    } else {
      const jaxfr = this.appRegistry
        .apps()
        .find((app) => app.name === 'Jaxfr');
      const newFeature: Partial<AppFeature> = {
        app_id: jaxfr?.tb_tyapp_app_id ?? '',
        name: '',
        icon: '',
        route: '',
        is_admin_only: false,
        show_in_launcher: false,
        status: RecordStatus.Active,
        remarks: '',
      };
      this.item.set(newFeature);
      this.originalDataStr.set(JSON.stringify(newFeature));
    }
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

    if (current && original) {
      const currentlyDirty = JSON.stringify(current) !== original;
      if (this.isDirty() !== currentlyDirty) {
        this.isDirty.set(currentlyDirty);
      }

      const launcherReady =
        !current.show_in_launcher ||
        (!!current.icon?.trim() && !!current.route?.trim());

      const disabled =
        this.featureService.loading() ||
        (!!this.currentId && !currentlyDirty) ||
        !current.name?.trim() ||
        !current.app_id ||
        !launcherReady;

      if (this.isSaveDisabled() !== disabled) {
        this.isSaveDisabled.set(disabled);
      }
    }
  }

  async onSave() {
    const data = this.item();
    if (!data || !data.name?.trim() || !data.app_id) return;
    if (data.show_in_launcher && (!data.icon?.trim() || !data.route?.trim())) {
      return;
    }

    const success = await this.featureService.saveFeature(data);
    if (success) {
      this.originalDataStr.set(JSON.stringify(data));
      this.isDirty.set(false);
      this.router.navigate(['/development/feature/list']);
    }
  }

  async onDelete() {
    if (!this.currentId) return;

    if (
      confirm(
        'Are you sure you want to delete this feature? This action might be irreversible.',
      )
    ) {
      const success = await this.featureService.deleteFeature(this.currentId);
      if (success) {
        this.router.navigate(['/development/feature/list']);
      }
    }
  }

  ngOnDestroy() {
    this.headerService.clear();
  }

  onExport() {
    const f = this.item();
    if (!f || !this.currentId) return;

    const appName =
      this.appRegistry
        .apps()
        .find((app) => app.tb_tyapp_app_id === f.app_id)?.name ?? '';

    const headers = [
      'Feature ID',
      'App',
      'Name',
      'Icon',
      'Route',
      'Show in Launcher',
      'Admin Only',
      'Status',
      'Internal Remarks',
    ];
    const rows = [
      [
        this.currentId,
        appName,
        f.name || '',
        f.icon || '',
        f.route || '',
        f.show_in_launcher ? 'Yes' : 'No',
        f.is_admin_only ? 'Yes' : 'No',
        f.status === RecordStatus.Active ? 'Active' : 'Inactive',
        f.remarks || '',
      ],
    ];

    exportToCsv(`Feature_Detail_${f.name || this.currentId}`, headers, rows);
  }
}
