import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { FormsModule } from '@angular/forms';
import html2canvas from 'html2canvas';
import { DisplayNamePipe } from '../../../../../../core/pipes/display-name.pipe';
import { HeaderService } from '../../../../../../core/services/header.service';
import { UserService } from '../../../../features/user/user.service';
import { CurrencyZhPipe } from '../currency-zh.pipe';
import { InstitutionLogoPipe } from '../institution-logo.pipe';
import { WealthTransaction } from '../wealth.model';
import { WealthService } from '../wealth.service';

@Component({
  selector: 'app-wealth-list',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatProgressSpinnerModule,
    MatCardModule,
    MatDividerModule,
    CurrencyZhPipe,
    DisplayNamePipe,
    InstitutionLogoPipe,
    MatSlideToggleModule,
    FormsModule,
  ],
  templateUrl: './wealth-list.html',
  styleUrl: './wealth-list.scss',
})
export class WealthList implements OnInit {
  private wealthService = inject(WealthService);
  private headerService = inject(HeaderService);
  private router = inject(Router);
  public readonly userService = inject(UserService);

  transactions = this.wealthService.transactions;
  loading = this.wealthService.loading;

  showActiveOnly = signal(false);
  sortDescending = signal(true);

  filteredTransactions = computed(() => {
    const rawList = this.transactions();
    let list = [...rawList];

    // 1. Filter Active Only
    if (this.showActiveOnly()) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const threeDaysAgo = new Date(today);
      threeDaysAgo.setDate(today.getDate() - 3);

      const activeMajorSeqs = new Set<number>();
      rawList.forEach((txn) => {
        if (txn.transaction_type === 'term_deposit' && !this.isExpired(txn.end_date)) {
          activeMajorSeqs.add(txn.seq_major);
        }
      });

      list = list.filter((txn) => {
        if (txn.transaction_type === 'term_deposit') {
          return !this.isExpired(txn.end_date);
        }
        if (txn.transaction_type === 'fx_exchange') {
          const startDate = new Date(txn.start_date);
          const isRecent = startDate >= threeDaysAgo;
          const isPartOfActiveGroup = activeMajorSeqs.has(txn.seq_major);
          return isRecent || isPartOfActiveGroup;
        }
        return true;
      });
    }

    // 2. Sort
    list.sort((a, b) => {
      const multiplier = this.sortDescending() ? 1 : -1;
      if (b.seq_major !== a.seq_major) {
        return (b.seq_major - a.seq_major) * multiplier;
      }
      return (b.seq_minor - a.seq_minor) * multiplier;
    });

    return list;
  });

  ngOnInit() {
    this.updateHeader();
    this.wealthService.fetchAllTransactions();
    this.userService.fetchAllUsers();
  }

  private updateHeader() {
    this.headerService.setConfig({
      actions: [
        {
          label: '僅顯示進行中',
          type: 'toggle',
          checked: this.showActiveOnly(),
          onChange: (val) => {
            this.showActiveOnly.set(val);
            this.updateHeader();
          },
        },
        {
          label: '序號倒序',
          type: 'toggle',
          checked: this.sortDescending(),
          onChange: (val) => {
            this.sortDescending.set(val);
            this.updateHeader();
          },
        },
        {
          label: '產生報表',
          icon: 'assignment',
          type: 'secondary',
          onClick: () => this.router.navigate(['/wealth/report']),
        },
        {
          label: '輸出圖片',
          icon: 'photo_camera',
          type: 'secondary',
          onClick: () => this.exportAsImage(),
        },
        {
          label: 'Add Transaction',
          icon: 'add',
          type: 'primary',
          onClick: () => this.router.navigate(['/wealth/edit']),
        },
      ],
    });
  }

  async onDelete(txn: WealthTransaction) {
    if (confirm('確定要刪除這筆紀錄嗎？')) {
      await this.wealthService.deleteTransaction(txn.tb_tyapp_fin_txn_id);
    }
  }

  getLabel(type: string): string {
    switch (type) {
      case 'term_deposit': return '定期存款';
      case 'fx_exchange': return '外匯兌換';
      case 'investment': return '投資項目';
      case 'cash_flow': return '活期變動';
      default: return type;
    }
  }

  getUserById(userId: string) {
    return this.userService.users().find((u) => u.user_id === userId);
  }

  wealthSummary = computed(() => {
    const rawList = this.transactions();
    // 結構：Map<userId, { guaranteed: Record<currency, amount>, investments: Record<currency, { cost: number, current: number }> }>
    const summaryMap = new Map<string, { 
      guaranteed: Record<string, number>, 
      investments: Record<string, { cost: number, current: number }> 
    }>();

    rawList.forEach((txn) => {
      const userData = summaryMap.get(txn.user_id) || { guaranteed: {}, investments: {} };

      if (txn.transaction_type === 'term_deposit' && !this.isExpired(txn.end_date)) {
        // 定存：統計到期後的總金額 (return_amount)
        const current = userData.guaranteed[txn.currency] || 0;
        userData.guaranteed[txn.currency] = current + (Number(txn.return_amount) || 0);
      } else if (txn.transaction_type === 'cash_flow') {
        // 活期：統計本金
        const current = userData.guaranteed[txn.currency] || 0;
        userData.guaranteed[txn.currency] = current + (Number(txn.deposit_amount) || 0);
      } else if (txn.transaction_type === 'investment') {
        // 投資：統計本金 (cost)
        const invGroup = userData.investments[txn.currency] || { cost: 0, current: 0 };
        invGroup.cost += (Number(txn.deposit_amount) || 0);
        userData.investments[txn.currency] = invGroup;
      }

      summaryMap.set(txn.user_id, userData);
    });

    return Array.from(summaryMap.entries()).map(([userId, data]) => ({
      userId,
      user: this.getUserById(userId),
      guaranteed: Object.entries(data.guaranteed).map(([code, amount]) => ({ code, amount })),
      investments: Object.entries(data.investments).map(([code, inv]) => ({ 
        code, 
        cost: inv.cost, 
        current: inv.current || null 
      })),
    }));
  });

  isExpired(endDate: string | null): boolean {
    if (!endDate) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    return end < today;
  }

  getDaysRemaining(endDate: string | null): number | null {
    if (!endDate) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    const diffTime = end.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  }

  async exportAsImage() {
    const element = document.querySelector('.wealth-feed') as HTMLElement;
    if (!element) return;

    this.loading.set(true);
    try {
      const canvas = await html2canvas(element, {
        backgroundColor: '#ffffff',
        scale: 2,
        logging: false,
        useCORS: true,
      });

      const dataUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      const dateStr = new Date().toISOString().split('T')[0];
      link.download = `Wealth_Summary_${dateStr}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('Export image failed', err);
    } finally {
      this.loading.set(false);
    }
  }
}
