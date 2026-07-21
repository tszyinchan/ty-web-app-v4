import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { FilelinkItem } from '../../jaxfr/features/filelink/filelink.model';
import { FilelinkService } from '../../jaxfr/features/filelink/filelink.service';

@Component({
  selector: 'app-item-detail',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './item-detail.html',
  styleUrl: './item-detail.scss',
})
export class ItemDetail implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private filelinkService = inject(FilelinkService);

  loading = signal(true);
  item = signal<FilelinkItem | null>(null);

  displayPath = computed(() => {
    const data = this.item();
    if (!data || !data.item_path || data.item_path.length === 0)
      return 'Root Directory';
    return data.item_path.join(' / ');
  });

  metaPairs = computed(() => {
    const meta = this.item()?.metadata;
    if (!meta) return [];

    return Object.entries(meta).map(([key, value]) => ({
      key: key.replace(/_/g, ' '),
      value: String(value),
    }));
  });

  async ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.loading.set(false);
      return;
    }

    const fetchedItem = await this.filelinkService.fetchItemById(id);
    this.item.set(fetchedItem);
    this.loading.set(false);
  }

  goBack() {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      this.router.navigate(['/']);
    }
  }
}
