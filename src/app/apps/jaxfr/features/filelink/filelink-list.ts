import { CommonModule } from '@angular/common';
import {
  Component,
  OnInit,
  OnDestroy,
  inject,
  signal,
  computed,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatRippleModule } from '@angular/material/core';
import { MatMenuModule } from '@angular/material/menu';
import { RouterModule, Router, ActivatedRoute } from '@angular/router';

import { HeaderService } from '../../../../core/services/header.service';
import { AuthService } from '../../../../core/services/auth.service';
import { UserService } from '../user/user.service';
import { FilelinkService } from '../../../../core/domains/filelink/filelink.service';
import { exportToCsv } from '../../../../core/utils/csv-export.util';
import { DisplayNamePipe } from '../../../../core/pipes/display-name.pipe';
import { RecordStatus } from '../../../../core/models/status.enum';
import { FilelinkSortOption, extractFolderContent, buildFileDisplayTitle, sortExplorerContent } from '../../../../core/domains/filelink/filelink.util';

@Component({
  selector: 'app-filelink-list',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatRippleModule,
    MatMenuModule,
  ],
  providers: [DisplayNamePipe],
  templateUrl: './filelink-list.html',
  styleUrl: './filelink-list.scss',
})
export class FilelinkList implements OnInit, OnDestroy {
  public filelinkService = inject(FilelinkService);
  public userService = inject(UserService);
  private authService = inject(AuthService);
  private headerService = inject(HeaderService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private displayNamePipe = inject(DisplayNamePipe);

  readonly RecordStatus = RecordStatus;

  currentPath = this.filelinkService.currentExplorerPath;

  currentSort = signal<FilelinkSortOption>('custom');

  currentFolderContent = computed(() => {
    const currentUserId = this.authService.userProfile()?.user_id;
    const myItems = this.filelinkService.items().filter((item) => {
      if (item.user_id !== currentUserId) return false;
      return !this.userService.isUnavailableId(item.user_id);
    });
    const users = this.userService.users();

    const { files, folders } = extractFolderContent(
      myItems,
      this.currentPath(),
    );

    const mappedFiles = files.map((file) => {
      const allowedNames = (file.allowed_users || [])
        .filter((uid) => !this.userService.isUnavailableId(uid))
        .map((uid) => {
          const u = users.find((x) => x.user_id === uid);
          return u ? this.displayNamePipe.transform(u) : 'Unknown';
        })
        .join(', ');

      return {
        ...file,
        displayTitle: buildFileDisplayTitle(
          file.title,
          file.ref_date,
          file.url,
        ),
        displaySharedWith: allowedNames
          ? `Shared with: ${allowedNames}`
          : 'Private',
      };
    });

    return sortExplorerContent(mappedFiles, folders, this.currentSort());
  });

  ngOnInit() {
    const restorePath = history.state?.restorePath;
    if (Array.isArray(restorePath)) {
      this.currentPath.set(restorePath);
    }

    const isLoading = computed(() => this.filelinkService.loading());

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
          disabled: computed(
            () => isLoading() || this.filelinkService.items().length === 0,
          ),
          onClick: () => this.onExport(),
        },
        {
          label: 'New Link',
          icon: 'add',
          type: 'primary',
          disabled: isLoading,
          onClick: () => {
            this.router.navigate(['../new'], { relativeTo: this.route });
          },
        },
      ],
    });

    this.filelinkService.fetchAllItems();
    void this.userService.fetchAllUsers();
  }

  enterFolder(folderName: string) {
    this.currentPath.update((path) => [...path, folderName]);
  }

  goToLevel(index: number) {
    if (index === -1) {
      this.currentPath.set([]);
    } else {
      this.currentPath.update((path) => path.slice(0, index + 1));
    }
  }

  viewFile(itemId: string) {
    this.router.navigate(['../edit', itemId], { relativeTo: this.route });
  }

  async onRefresh() {
    await this.filelinkService.fetchAllItems(true);
  }

  onExport() {
    const currentUserId = this.authService.userProfile()?.user_id;
    const myItems = this.filelinkService.items().filter((i) => {
      if (i.user_id !== currentUserId) return false;
      return !this.userService.isUnavailableId(i.user_id);
    });
    if (!myItems.length) return;

    const headers = ['Title', 'Path', 'Ref Date', 'URL', 'Status'];
    const rows = myItems.map((item) => [
      item.title || '',
      item.item_path?.join(' / ') || 'Root',
      item.ref_date || '',
      item.url || '',
      item.status === RecordStatus.Active ? 'Active' : 'Inactive',
    ]);

    exportToCsv(
      `My_Filelinks_${new Date().toISOString().split('T')[0]}`,
      headers,
      rows,
    );
  }

  ngOnDestroy() {
    this.headerService.clear();
  }
}
