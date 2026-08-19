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
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { TyappApp } from '../../../../../core/models/app.model';
import { RecordStatus } from '../../../../../core/models/status.enum';
import { AppRegistryService } from '../../../../../core/services/app-registry.service';
import {
  HeaderAction,
  HeaderService,
} from '../../../../../core/services/header.service';
import { exportToCsv } from '../../../../../core/utils/csv-export.util';

@Component({
  selector: 'app-registry-edit',
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
  ],
  templateUrl: './app-edit.html',
  styleUrl: './app-edit.scss',
})
export class AppEdit implements OnInit, OnDestroy, DoCheck {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private zone = inject(NgZone);
  public appRegistry = inject(AppRegistryService);
  private headerService = inject(HeaderService);

  readonly RecordStatus = RecordStatus;

  item = signal<Partial<TyappApp> | null>(null);
  currentId: string | null = null;

  originalDataStr = signal<string>('');

  isDirty = signal(false);

  syncStatus = computed<'loading' | 'up-to-date' | 'unsaved' | 'none'>(() => {
    if (this.appRegistry.loading()) return 'loading';
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
      label: this.currentId ? 'Save Changes' : 'Create App',
      icon: 'check',
      type: 'primary',
      disabled: this.isSaveDisabled,
      onClick: () => this.onSave(),
    });

    this.headerService.setConfig({
      backLink: '/development/app/list',
      syncStatus: this.syncStatus,
      actions: actions,
    });

    if (this.currentId) {
      const cached = this.appRegistry
        .apps()
        .find((app) => app.tb_tyapp_app_id === this.currentId);
      if (cached) {
        this.item.set(structuredClone(cached));
        this.originalDataStr.set(JSON.stringify(cached));
      }

      const fresh = await this.appRegistry.fetchAppById(this.currentId);

      this.zone.run(() => {
        if (fresh) {
          this.item.set(structuredClone(fresh));
          this.originalDataStr.set(JSON.stringify(fresh));
        } else if (!cached) {
          this.router.navigate(['/development/app/list']);
        }
      });
    } else {
      const nextOrder =
        this.appRegistry
          .apps()
          .reduce((max, app) => Math.max(max, app.customized_order ?? 0), 0) +
        1;
      const newApp: Partial<TyappApp> = {
        name: '',
        customized_order: nextOrder,
        status: RecordStatus.Active,
        remarks: '',
      };
      this.item.set(newApp);
      this.originalDataStr.set(JSON.stringify(newApp));
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

      const disabled =
        this.appRegistry.loading() ||
        (!!this.currentId && !currentlyDirty) ||
        !current.name?.trim();

      if (this.isSaveDisabled() !== disabled) {
        this.isSaveDisabled.set(disabled);
      }
    }
  }

  async onSave() {
    const data = this.item();
    if (!data || !data.name?.trim()) return;

    const success = await this.appRegistry.saveApp(data);
    if (success) {
      this.originalDataStr.set(JSON.stringify(data));
      this.isDirty.set(false);
      this.router.navigate(['/development/app/list']);
    }
  }

  async onDelete() {
    if (!this.currentId) return;

    if (
      confirm(
        'Are you sure you want to delete this app? This action might be irreversible.',
      )
    ) {
      const success = await this.appRegistry.deleteApp(this.currentId);
      if (success) {
        this.router.navigate(['/development/app/list']);
      }
    }
  }

  ngOnDestroy() {
    this.headerService.clear();
  }

  onExport() {
    const app = this.item();
    if (!app || !this.currentId) return;

    const headers = [
      'App ID',
      'Name',
      'Customized Order',
      'Status',
      'Internal Remarks',
    ];
    const rows = [
      [
        this.currentId,
        app.name || '',
        String(app.customized_order ?? ''),
        app.status === RecordStatus.Active ? 'Active' : 'Inactive',
        app.remarks || '',
      ],
    ];

    exportToCsv(`App_Detail_${app.name || this.currentId}`, headers, rows);
  }
}
