import { Component, OnInit, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { WealthService } from '../wealth.service';
import { CurrencyZhPipe } from '../currency-zh.pipe';

import html2canvas from 'html2canvas';
import { formatInTimeZone } from 'date-fns-tz';
import { DisplayNamePipe } from '../../../../../../core/pipes/display-name.pipe';
import { HeaderService } from '../../../../../../core/services/header.service';
import { UserService } from '../../../../features/user/user.service';

@Component({
  selector: 'app-wealth-report',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    DisplayNamePipe,
  ],
  templateUrl: './wealth-report.html',
  styleUrl: './wealth-report.scss',
})
export class WealthReport implements OnInit {
  private wealthService = inject(WealthService);
  private headerService = inject(HeaderService);
  public readonly userService = inject(UserService);

  transactions = this.wealthService.transactions;
  loading = this.wealthService.loading;
  today = new Date();
  hkTime!: string;
  torontoTime!: string;


  // 1. 幣種中文映射
  private currencyZhMap: Record<string, string> = {
    CAD: '加元',
    HKD: '港元',
    USD: '美元',
    CNY: '人民幣',
    JPY: '日元',
  };

  // 2. 活躍資產統計 (Guaranteed vs Investment)
  wealthSummary = computed(() => {
    const rawList = this.transactions();
    const summaryMap = new Map<string, { 
      guaranteed: Record<string, number>, 
      investments: Record<string, { cost: number, current: number }> 
    }>();

    rawList.forEach((txn) => {
      const userData = summaryMap.get(txn.user_id) || { guaranteed: {}, investments: {} };
      if (txn.transaction_type === 'term_deposit' && !this.isExpired(txn.end_date)) {
        const current = userData.guaranteed[txn.currency] || 0;
        userData.guaranteed[txn.currency] = current + (Number(txn.return_amount) || 0);
      } else if (txn.transaction_type === 'cash_flow') {
        const current = userData.guaranteed[txn.currency] || 0;
        userData.guaranteed[txn.currency] = current + (Number(txn.deposit_amount) || 0);
      } else if (txn.transaction_type === 'investment') {
        const invGroup = userData.investments[txn.currency] || { cost: 0, current: 0 };
        invGroup.cost += (Number(txn.deposit_amount) || 0);
        userData.investments[txn.currency] = invGroup;
      }
      summaryMap.set(txn.user_id, userData);
    });

    return Array.from(summaryMap.entries()).map(([userId, data]) => ({
      userId,
      user: this.userService.users().find(u => u.user_id === userId),
      guaranteed: Object.entries(data.guaranteed).map(([code, amount]) => ({ code, amount, name: this.currencyZhMap[code] || code })),
      investments: Object.entries(data.investments).map(([code, inv]) => ({ code, cost: inv.cost, current: inv.current, name: this.currencyZhMap[code] || code })),
    }));
  });

  // 3. 報表明細 (僅顯示 Active)
  reportDetails = computed(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return this.transactions()
      .filter(txn => {
        if (txn.transaction_type === 'term_deposit') return !this.isExpired(txn.end_date);
        if (txn.transaction_type === 'fx_exchange') {
            const start = new Date(txn.start_date);
            const threeDaysAgo = new Date(today);
            threeDaysAgo.setDate(today.getDate() - 3);
            return start >= threeDaysAgo;
        }
        return true; // 活期投資
      })
      .sort((a, b) => b.seq_major - a.seq_major || b.seq_minor - a.seq_minor);
  });

  ngOnInit() {
    this.headerService.setConfig({
      title: '資產匯報報表 (Excel風格)',
      backLink: '/wealth/list',
      actions: [
        {
          label: '下載報表圖片',
          icon: 'download',
          type: 'primary',
          onClick: () => this.exportImage(),
        }
      ]
    });
    this.wealthService.fetchAllTransactions();
    this.userService.fetchAllUsers();
    
    const now = new Date();
    // 直接在邏輯層綁定好時區，轉成字串
    this.hkTime = formatInTimeZone(now, 'Asia/Hong_Kong', 'yyyy-MM-dd HH:mm:ss');
    this.torontoTime = formatInTimeZone(now, 'America/Toronto', 'yyyy-MM-dd HH:mm:ss');
  }

  isExpired(endDate: string | null): boolean {
    if (!endDate) return false;
    return new Date(endDate) < new Date();
  }

  getCurrencyName(code: string): string {
    return this.currencyZhMap[code] || code;
  }

  getTypeLabel(type: string): string {
    switch (type) {
      case 'term_deposit': return '定期';
      case 'fx_exchange': return '外匯';
      case 'investment': return '投資';
      case 'cash_flow': return '活期';
      default: return type;
    }
  }

  getUserById(userId: string) {
    return this.userService.users().find((u) => u.user_id === userId);
  }

  async exportImage() {
    const element = document.querySelector('.report-capture-area') as HTMLElement;
    if (!element) return;

    this.loading.set(true);
    try {
      const canvas = await html2canvas(element, {
        backgroundColor: '#ffffff',
        scale: 3, // 高解析度對抗壓縮
        logging: false,
        useCORS: true,
        windowWidth: 1400,
      });

      const link = document.createElement('a');
      link.download = `Wealth_Report_${new Date().toISOString().split('T')[0]}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (err) {
      console.error('Export failed', err);
    } finally {
      this.loading.set(false);
    }
  }
}
