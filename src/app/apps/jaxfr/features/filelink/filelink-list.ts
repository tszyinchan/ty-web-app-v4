import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy, inject, computed } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { RouterModule, Router, ActivatedRoute } from '@angular/router';

import { HeaderService } from '../../../../core/services/header.service';
import { UserService } from '../user/user.service';
import { FilelinkService } from './filelink.service';
import { DisplayNamePipe } from '../../../../core/pipes/display-name.pipe';
import { exportToCsv } from '../../../../core/utils/csv-export.util';

@Component({
  selector: 'app-filelink-list',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  providers: [DisplayNamePipe],
  templateUrl: './filelink-list.html',
})
export class FilelinkList implements OnInit, OnDestroy {
  public filelinkService = inject(FilelinkService);
  public userService = inject(UserService);

  private headerService = inject(HeaderService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private displayNamePipe = inject(DisplayNamePipe);

  listVM = computed(() => {
    const items = this.filelinkService.items();
    const users = this.userService.users();

    return items.map((item) => {
      const owner = users.find((u) => u.user_id === item.user_id);

      const displayPath =
        item.item_path && item.item_path.length > 0
          ? item.item_path.join(' / ')
          : 'Root';

      return {
        ...item,
        ownerName: owner ? this.displayNamePipe.transform(owner) : 'Unknown',
        displayPath,
      };
    });
  });

  ngOnInit() {
    const isLoading = computed(
      () => this.filelinkService.loading() || this.userService.loading(),
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
          disabled: computed(() => isLoading() || this.listVM().length === 0),
          onClick: () => this.onExport(),
        },
        {
          label: 'New Link',
          icon: 'add',
          type: 'primary',
          disabled: isLoading,
          onClick: () =>
            this.router.navigate(['../new'], { relativeTo: this.route }),
        },
      ],
    });

    this.filelinkService.fetchAllItems();
    this.userService.fetchAllUsers();
  }

  async onRefresh() {
    await this.filelinkService.fetchAllItems(true);
    await this.userService.fetchAllUsers(true);
  }

  onExport() {
    const data = this.listVM();
    if (!data.length) return;

    const headers = ['Title', 'Path', 'Ref Date', 'URL', 'Owner', 'Status'];
    const rows = data.map((item) => [
      item.title || '',
      item.displayPath,
      item.ref_date || '',
      item.url || '',
      item.ownerName,
      item.status === 1 ? 'Active' : 'Inactive',
    ]);

    exportToCsv(
      `Filelinks_${new Date().toISOString().split('T')[0]}`,
      headers,
      rows,
    );
  }

  ngOnDestroy() {
    this.headerService.clear();
  }
}
