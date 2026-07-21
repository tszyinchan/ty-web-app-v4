import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatRippleModule } from '@angular/material/core';
import { Router, ActivatedRoute } from '@angular/router';
import { FilelinkItem } from '../../jaxfr/features/filelink/filelink.model';
import { FilelinkService } from '../../jaxfr/features/filelink/filelink.service';


@Component({
  selector: 'app-portal-view',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatRippleModule,
  ],
  templateUrl: './portal-view.html',
  styleUrl: './portal-view.scss',
})
export class PortalView implements OnInit {
  public filelinkService = inject(FilelinkService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  currentPath = signal<string[]>([]);

  currentFolderContent = computed(() => {
    const allItems = this.filelinkService.items();
    const current = this.currentPath();
    const currentDepth = current.length;

    const files: FilelinkItem[] = [];
    const folderSet = new Set<string>();

    for (const item of allItems) {
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

    return {
      folders: Array.from(folderSet).sort(),
      files: files.sort((a, b) => a.sort_order - b.sort_order),
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
