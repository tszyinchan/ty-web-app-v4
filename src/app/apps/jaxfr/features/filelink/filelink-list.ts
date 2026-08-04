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
import { FilelinkService } from './filelink.service';
import { FilelinkItem } from './filelink.model';
import { exportToCsv } from '../../../../core/utils/csv-export.util';
import { DisplayNamePipe } from '../../../../core/pipes/display-name.pipe';
import { RecordStatus } from '../../../../core/models/status.enum';

type SortOption =
  | 'custom'
  | 'name-asc'
  | 'name-desc'
  | 'date-desc'
  | 'modified-desc';

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

  currentSort = signal<SortOption>('custom');

  currentFolderContent = computed(() => {
    const allItems = this.filelinkService.items();
    const currentUserId = this.authService.userProfile()?.user_id;

    const myItems = allItems.filter((item) => item.user_id === currentUserId);

    const current = this.currentPath();
    const currentDepth = current.length;

    const files: FilelinkItem[] = [];
    const folderSet = new Set<string>();

    for (const item of myItems) {
      const itemPath = item.item_path || [];

      let isUnderCurrentPath = true;
      for (let i = 0; i < currentDepth; i++) {
        if (itemPath[i] !== current[i]) {
          isUnderCurrentPath = false;
          break;
        }
      }

      if (!isUnderCurrentPath) continue;

      if (itemPath.length === currentDepth) {
        files.push(item);
      } else if (itemPath.length > currentDepth) {
        folderSet.add(itemPath[currentDepth]);
      }
    }

    const users = this.userService.users();

    const mappedFiles = files.map((file) => {
      let displayTitle = '';
      if (file.title && file.ref_date) {
        displayTitle = `${file.title} (${file.ref_date})`;
      } else if (file.title) {
        displayTitle = file.title;
      } else if (file.ref_date) {
        displayTitle = file.ref_date;
      } else {
        displayTitle = file.url || 'Untitled Document';
      }

      const allowedNames = (file.allowed_users || [])
        .map((uid) => {
          const u = users.find((x) => x.user_id === uid);
          return u ? this.displayNamePipe.transform(u) : 'Unknown';
        })
        .join(', ');

      const displaySharedWith = allowedNames
        ? `Shared with: ${allowedNames}`
        : 'Private';

      return {
        ...file,
        displayTitle,
        displaySharedWith,
      };
    });

    const sortType = this.currentSort();

    let sortedFolders = Array.from(folderSet).sort();
    if (sortType === 'name-desc') {
      sortedFolders.reverse();
    }

    const sortedFiles = mappedFiles.sort((a, b) => {
      if (sortType === 'custom') {
        return a.sort_order - b.sort_order;
      } else if (sortType === 'name-asc') {
        return a.displayTitle.localeCompare(b.displayTitle);
      } else if (sortType === 'name-desc') {
        return b.displayTitle.localeCompare(a.displayTitle);
      } else if (sortType === 'date-desc') {
        const dA = a.ref_date || '';
        const dB = b.ref_date || '';
        if (!dA && !dB) return a.sort_order - b.sort_order;
        if (!dA) return 1;
        if (!dB) return -1;
        return dB.localeCompare(dA);
      } else if (sortType === 'modified-desc') {
        const modA = a.updated_at || a.created_at || '';
        const modB = b.updated_at || b.created_at || '';
        return modB.localeCompare(modA);
      }
      return 0;
    });

    return {
      folders: sortedFolders,
      files: sortedFiles,
    };
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
    const myItems = this.filelinkService
      .items()
      .filter((i) => i.user_id === currentUserId);
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
