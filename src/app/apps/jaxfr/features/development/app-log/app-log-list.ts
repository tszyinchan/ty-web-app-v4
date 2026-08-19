import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy, inject, computed } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { RouterModule, Router, ActivatedRoute } from '@angular/router';
import { HeaderService } from '../../../../../core/services/header.service';
import { AppRegistryService } from '../../../../../core/services/app-registry.service';
import { AppFeatureService } from '../app-feature/app-feature.service';
import { UserService } from '../../user/user.service';
import { AppLogService } from './app-log.service';
import { DisplayNamePipe } from '../../../../../core/pipes/display-name.pipe';
import { exportToCsv } from '../../../../../core/utils/csv-export.util';
import { RecordStatus } from '../../../../../core/models/status.enum';

@Component({
  selector: 'app-log-list',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  providers: [DisplayNamePipe],
  templateUrl: './app-log-list.html',
})
export class AppLogList implements OnInit, OnDestroy {
  public logService = inject(AppLogService);
  public featureService = inject(AppFeatureService);
  public appRegistry = inject(AppRegistryService);
  public userService = inject(UserService);

  private headerService = inject(HeaderService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  private displayNamePipe = inject(DisplayNamePipe);

  readonly RecordStatus = RecordStatus;

  listVM = computed(() => {
    const logs = this.logService.logs();
    const features = this.featureService.features();
    const apps = this.appRegistry.apps();
    const users = this.userService.users();

    return logs.map((log) => {
      const feature = features.find(
        (f) => f.tb_tyapp_ap_ftr_id === log.feature_id,
      );
      const app = apps.find((a) => a.tb_tyapp_app_id === feature?.app_id);
      const user = users.find((u) => u.user_id === log.log_user);
      return {
        ...log,
        appName: app?.name ?? '',
        featureName: feature ? feature.name : 'Unknown Feature',
        authorName: user
          ? this.displayNamePipe.transform(user)
          : 'Unknown Author',
      };
    });
  });

  ngOnInit() {
    const isLoading = computed(
      () =>
        this.logService.loading() ||
        this.featureService.loading() ||
        this.appRegistry.loading() ||
        this.userService.loading(),
    );

    this.headerService.setConfig({
      title: 'App Logs',
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
          disabled: isLoading,
          onClick: () => this.onExport(),
        },
        {
          label: 'New Log',
          icon: 'add',
          type: 'primary',
          disabled: isLoading,
          onClick: () =>
            this.router.navigate(['../new'], { relativeTo: this.route }),
        },
      ],
    });

    this.logService.fetchAllLogs();
    this.featureService.fetchAllFeatures();
    this.appRegistry.fetchAllApps();
    this.userService.fetchAllUsers();
  }

  async onRefresh() {
    await this.logService.fetchAllLogs(true);
    await this.featureService.fetchAllFeatures(true);
    await this.appRegistry.fetchAllApps(true);
    await this.userService.fetchAllUsers(true);
  }

  onExport() {
    const logs = this.listVM();
    if (!logs.length) return;

    const headers = [
      'Version',
      'Release Date',
      'App',
      'Feature',
      'Author',
      'Message',
      'Status',
      'Internal Remarks',
    ];
    const rows = logs.map((l) => [
      `v${l.version_major}.${l.version_minor}.${l.version_patch}`,
      l.version_date,
      l.appName,
      l.featureName,
      l.authorName,
      l.log_message || '',
      l.status === RecordStatus.Active ? 'Published' : 'Draft',
      l.remarks || '',
    ]);

    exportToCsv(
      `App_Logs_${new Date().toISOString().split('T')[0]}`,
      headers,
      rows,
    );
  }

  ngOnDestroy() {
    this.headerService.clear();
  }
}
