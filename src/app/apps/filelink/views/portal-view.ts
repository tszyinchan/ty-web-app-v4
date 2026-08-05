import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatRippleModule } from '@angular/material/core';
import { MatMenuModule } from '@angular/material/menu';
import { Router, ActivatedRoute } from '@angular/router';
import { FilelinkItem } from '../../jaxfr/features/filelink/filelink.model';
import { FilelinkService } from '../../jaxfr/features/filelink/filelink.service';
import { RecordStatus } from '../../../core/models/status.enum';

type SortOption =
  | 'custom'
  | 'name-asc'
  | 'name-desc'
  | 'date-desc'
  | 'modified-desc';

@Component({
  selector: 'app-portal-view',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatRippleModule,
    MatMenuModule,
  ],
  templateUrl: './portal-view.html',
  styleUrl: './portal-view.scss',
})
export class PortalView implements OnInit {
  public filelinkService = inject(FilelinkService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  currentPath = this.filelinkService.portalExplorerPath;
  currentSort = signal<SortOption>('custom');

  currentFolderContent = computed(() => {
    const allItems = this.filelinkService.items();

    const activeItems = allItems.filter((item) => item.status === RecordStatus.Active);

    const current = this.currentPath();
    const currentDepth = current.length;

    const files: FilelinkItem[] = [];
    const folderSet = new Set<string>();

    for (const item of activeItems) {
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

    const mappedFiles = files.map((file) => {
      let displayTitle = '';
      if (file.title && file.ref_date) {
        displayTitle = `${file.title} (${file.ref_date})`;
      } else if (file.title) {
        displayTitle = file.title;
      } else if (file.ref_date) {
        displayTitle = file.ref_date;
      } else {
        displayTitle = file.url || '未命名文件';
      }

      return {
        ...file,
        displayTitle,
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

  viewFileDetail(itemId: string) {
    this.router.navigate(['item', itemId], { relativeTo: this.route });
  }
}
