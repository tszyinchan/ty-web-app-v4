import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy, inject, computed } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { RouterModule, Router, ActivatedRoute } from '@angular/router';
import { HeaderService } from '../../../../../core/services/header.service';
import { AppCategoryService } from '../app-category/app-category.service';
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
  public categoryService = inject(AppCategoryService);
  public userService = inject(UserService);

  private headerService = inject(HeaderService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  private displayNamePipe = inject(DisplayNamePipe);

  readonly RecordStatus = RecordStatus;

  listVM = computed(() => {
    const logs = this.logService.logs();
    const categories = this.categoryService.categories();
    const users = this.userService.users();

    return logs.map((log) => {
      const cat = categories.find(
        (c) => c.tb_tyapp_ap_ctgy_id === log.category_id,
      );
      const user = users.find((u) => u.user_id === log.log_user);
      return {
        ...log,
        categoryName: cat ? cat.display_name : 'Unknown Category',
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
        this.categoryService.loading() ||
        this.userService.loading(),
    );

    this.headerService.setConfig({
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
    this.categoryService.fetchAllCategories();
    this.userService.fetchAllUsers();
  }

  async onRefresh() {
    await this.logService.fetchAllLogs(true);
    await this.categoryService.fetchAllCategories(true);
    await this.userService.fetchAllUsers(true);
  }

  onExport() {
    const logs = this.listVM();
    if (!logs.length) return;

    const headers = [
      'Version',
      'Release Date',
      'Category',
      'Author',
      'Message',
      'Status',
      'Internal Remarks',
    ];
    const rows = logs.map((l) => [
      `v${l.version_major}.${l.version_minor}.${l.version_patch}`,
      l.version_date,
      l.categoryName,
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
