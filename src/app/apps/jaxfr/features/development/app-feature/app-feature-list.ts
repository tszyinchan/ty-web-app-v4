import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { RecordStatus } from '../../../../../core/models/status.enum';
import { AppRegistryService } from '../../../../../core/services/app-registry.service';
import { HeaderService } from '../../../../../core/services/header.service';
import { exportToCsv } from '../../../../../core/utils/csv-export.util';
import { AppFeatureService } from './app-feature.service';

@Component({
  selector: 'app-feature-list',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './app-feature-list.html',
})
export class AppFeatureList implements OnInit, OnDestroy {
  public readonly featureService = inject(AppFeatureService);
  private readonly appRegistry = inject(AppRegistryService);
  private readonly headerService = inject(HeaderService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  readonly RecordStatus = RecordStatus;

  listVM = computed(() => {
    const apps = this.appRegistry.apps();
    return this.featureService.features().map((feature) => {
      const app = apps.find((a) => a.tb_tyapp_app_id === feature.app_id);
      return {
        ...feature,
        appName: app?.name ?? 'Unknown App',
      };
    });
  });

  ngOnInit() {
    const isLoading = computed(
      () => this.featureService.loading() || this.appRegistry.loading(),
    );

    const isExportDisabled = computed(
      () => isLoading() || this.featureService.features().length === 0,
    );

    this.headerService.setConfig({
      title: 'App Features',
      backLink: '/development',
      actions: [
        {
          label: 'Refresh',
          icon: 'refresh',
          type: 'secondary',
          disabled: isLoading,
          onClick: () => this.onRefresh(),
        },
        {
          label: 'Export',
          icon: 'download',
          type: 'secondary',
          disabled: isExportDisabled,
          onClick: () => this.onExport(),
        },
        {
          label: 'New Feature',
          icon: 'add',
          type: 'primary',
          disabled: isLoading,
          onClick: () =>
            this.router.navigate(['../new'], { relativeTo: this.route }),
        },
      ],
    });

    void this.featureService.fetchAllFeatures();
    void this.appRegistry.fetchAllApps();
  }

  ngOnDestroy() {
    this.headerService.clear();
  }

  async onRefresh() {
    await this.featureService.fetchAllFeatures(true);
    await this.appRegistry.fetchAllApps(true);
  }

  onExport() {
    const features = this.listVM();
    if (features.length === 0) return;

    const headers = [
      'Feature ID',
      'App',
      'Name',
      'Route',
      'Show in Launcher',
      'Admin Only',
      'Status',
    ];
    const rows = features.map((f) => [
      f.tb_tyapp_ap_ftr_id,
      f.appName,
      f.name || '',
      f.route || '',
      f.show_in_launcher ? 'Yes' : 'No',
      f.is_admin_only ? 'Yes' : 'No',
      f.status === RecordStatus.Active ? 'Active' : 'Inactive',
    ]);

    exportToCsv('Feature_List', headers, rows);
  }
}
