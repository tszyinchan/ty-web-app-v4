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
import { RouterModule, Router, ActivatedRoute } from '@angular/router';

import { HeaderService } from '../../../../core/services/header.service';
import { AuthService } from '../../../../core/services/auth.service';
import { UserService } from '../user/user.service';
import { FilelinkService } from './filelink.service';
import { FilelinkItem } from './filelink.model';
import { exportToCsv } from '../../../../core/utils/csv-export.util';
import { DisplayNamePipe } from '../../../../core/pipes/display-name.pipe';

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
  ],
  providers: [DisplayNamePipe],
  templateUrl: './filelink-list.html',
  styleUrls: ['./filelink-list.scss'],
})
export class FilelinkList implements OnInit, OnDestroy {
  public filelinkService = inject(FilelinkService);
  public userService = inject(UserService);
  private authService = inject(AuthService);
  private headerService = inject(HeaderService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private displayNamePipe = inject(DisplayNamePipe);

  currentPath = this.filelinkService.currentExplorerPath;

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

    const mappedFiles = files
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((file) => {
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

    return {
      folders: Array.from(folderSet).sort(),
      files: mappedFiles,
    };
  });

  ngOnInit() {
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
      item.status === 1 ? 'Active' : 'Inactive',
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
