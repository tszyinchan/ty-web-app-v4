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

@Component({
  selector: 'app-registry-list',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './app-list.html',
})
export class AppList implements OnInit, OnDestroy {
  public readonly appRegistry = inject(AppRegistryService);
  private readonly headerService = inject(HeaderService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  readonly RecordStatus = RecordStatus;

  listVM = computed(() => this.appRegistry.apps());

  ngOnInit() {
    const isLoading = computed(() => this.appRegistry.loading());

    const isExportDisabled = computed(
      () => isLoading() || this.appRegistry.apps().length === 0,
    );

    this.headerService.setConfig({
      title: 'Apps',
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
          label: 'New App',
          icon: 'add',
          type: 'primary',
          disabled: isLoading,
          onClick: () =>
            this.router.navigate(['../new'], { relativeTo: this.route }),
        },
      ],
    });

    void this.appRegistry.fetchAllApps();
  }

  ngOnDestroy() {
    this.headerService.clear();
  }

  async onRefresh() {
    await this.appRegistry.fetchAllApps(true);
  }

  onExport() {
    const apps = this.listVM();
    if (apps.length === 0) return;

    const headers = [
      'App ID',
      'Name',
      'Customized Order',
      'Status',
      'Internal Remarks',
    ];
    const rows = apps.map((app) => [
      app.tb_tyapp_app_id,
      app.name || '',
      String(app.customized_order),
      app.status === RecordStatus.Active ? 'Active' : 'Inactive',
      app.remarks || '',
    ]);

    exportToCsv('App_List', headers, rows);
  }
}
