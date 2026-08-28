import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatRippleModule } from '@angular/material/core';
import { MatMenuModule } from '@angular/material/menu';
import { Router, ActivatedRoute } from '@angular/router';
import { FilelinkService } from '../../../core/domains/filelink/filelink.service';
import { RecordStatus } from '../../../core/models/status.enum';
import { UserService } from '../../jaxfr/features/user/user.service';
import {
  FilelinkSortOption,
  extractFolderContent,
  buildFileDisplayTitle,
  sortExplorerContent,
} from '../../../core/domains/filelink/filelink.util';

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
  private userService = inject(UserService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  currentPath = this.filelinkService.portalExplorerPath;
  currentSort = signal<FilelinkSortOption>('custom');

  currentFolderContent = computed(() => {
    const allItems = this.filelinkService.items();
    const activeItems = allItems.filter(
      (item) =>
        item.status === RecordStatus.Active &&
        !this.userService.isUnavailableId(item.user_id),
    );

    const { files, folders } = extractFolderContent(
      activeItems,
      this.currentPath(),
    );

    const mappedFiles = files.map((file) => ({
      ...file,
      displayTitle: buildFileDisplayTitle(file.title, file.ref_date, file.url),
    }));

    return sortExplorerContent(mappedFiles, folders, this.currentSort());
  });

  ngOnInit() {
    void this.userService.fetchAllUsers().then(() => {
      this.filelinkService.fetchAllItems();
    });
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
