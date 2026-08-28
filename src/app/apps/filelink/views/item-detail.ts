import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { FilelinkService } from '../../../core/domains/filelink/filelink.service';
import { FilelinkItem } from '../../../core/domains/filelink/filelink.model';
import { buildFileDisplayTitle } from '../../../core/domains/filelink/filelink.util';
import { resolveUrlActionConfig } from '../../../core/domains/filelink/filelink-url.util';
import { UserService } from '../../jaxfr/features/user/user.service';

interface MetaPair {
  key: string;
  value: string;
  icon: string;
}

@Component({
  selector: 'app-item-detail',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  providers: [DatePipe],
  templateUrl: './item-detail.html',
  styleUrl: './item-detail.scss',
})
export class ItemDetail implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private filelinkService = inject(FilelinkService);
  private userService = inject(UserService);

  loading = signal(true);
  item = signal<FilelinkItem | null>(null);

  private readonly KNOWN_META: Record<string, { label: string; icon: string }> =
    {
      amount: { label: '金額', icon: 'payments' },
      currency: { label: '幣別', icon: 'monetization_on' },
      company: { label: '公司 / 機構', icon: 'domain' },
      document_no: { label: '文件編號', icon: 'numbers' },
      category: { label: '分類', icon: 'label' },
      remarks: { label: '備註', icon: 'notes' },
      expiry_date: { label: '到期日', icon: 'event_busy' },
    };

  displayTitle = computed(() => {
    const data = this.item();
    if (!data) return '未命名文件';
    return buildFileDisplayTitle(data.title, data.ref_date, data.url);
  });

  displayPath = computed(() => {
    const data = this.item();
    if (!data || !data.item_path || data.item_path.length === 0)
      return '根目錄';
    return data.item_path.join(' / ');
  });

  metaPairs = computed<MetaPair[]>(() => {
    const originalMeta = this.item()?.metadata;
    if (!originalMeta) return [];

    const meta = { ...originalMeta };
    const pairs: MetaPair[] = [];

    if (meta['amount'] !== undefined && meta['currency'] !== undefined) {
      const currCode = String(meta['currency']).toUpperCase();
      const amountNum = Number(meta['amount']);

      let displayValue = `${currCode} ${meta['amount']}`;

      if (!isNaN(amountNum)) {
        try {
          displayValue = new Intl.NumberFormat('zh-TW', {
            style: 'currency',
            currency: currCode,
            minimumFractionDigits: 0,
            maximumFractionDigits: 2,
          }).format(amountNum);
        } catch {
          // Invalid currency code (e.g. legacy free-text data) - keep the plain fallback string above.
        }
      }

      pairs.push({ key: '金額', value: displayValue, icon: 'payments' });
      delete meta['amount'];
      delete meta['currency'];
    }

    if (meta['currency'] !== undefined) {
      pairs.push({
        key: this.KNOWN_META['currency'].label,
        value: String(meta['currency']).toUpperCase(),
        icon: this.KNOWN_META['currency'].icon,
      });
      delete meta['currency'];
    }

    for (const [key, value] of Object.entries(meta)) {
      const lowerKey = key.toLowerCase();
      const known = this.KNOWN_META[lowerKey];

      pairs.push({
        key: known ? known.label : key.replace(/_/g, ' '),
        value: String(value),
        icon: known ? known.icon : 'info',
      });
    }

    return pairs;
  });

  actionConfig = computed(() => {
    return resolveUrlActionConfig(this.item()?.url);
  });

  async ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.loading.set(false);
      return;
    }

    await this.userService.fetchAllUsers();
    const fetchedItem = await this.filelinkService.fetchItemById(id);
    if (fetchedItem && this.userService.isUnavailableId(fetchedItem.user_id)) {
      this.item.set(null);
    } else {
      this.item.set(fetchedItem);
    }
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
