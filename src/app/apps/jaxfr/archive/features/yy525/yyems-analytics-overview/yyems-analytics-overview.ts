import {
  Component,
  OnInit,
  OnDestroy,
  inject,
  signal,
  computed,
  effect,
  untracked,
} from '@angular/core';
import { CommonModule, CurrencyPipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { Yy525DataService } from '../yy525-data.service';
import { YyemsRecord } from '../yy525.model';
import { AuthService } from '../../../../../../core/services/auth.service';
import { HeaderService } from '../../../../../../core/services/header.service';


@Component({
  selector: 'app-yyems-analytics-overview',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    CurrencyPipe,
    DecimalPipe,
    MatCardModule,
    MatFormFieldModule,
    MatSelectModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './yyems-analytics-overview.html',
  styleUrl: './yyems-analytics-overview.scss',
})
export class YyemsAnalyticsOverview implements OnInit, OnDestroy {
  yy525Data = inject(Yy525DataService);
  private router = inject(Router);
  public headerService = inject(HeaderService);
  private authService = inject(AuthService);

  selectedUser = signal<'cty' | 'frd' | 'stranger'>('stranger');
  selectedCurrency = signal<string>('');

  isConsolidatedMode = this.yy525Data.isConsolidatedMode;

  constructor() {
    const identity = this.authService.userProfile()?.appsheet_525_user_id;
    if (identity === 'cty' || identity === 'frd') {
      this.selectedUser.set(identity); // 成功識別，設為預設視角
    }

    effect(() => {
      const currencies = this.availableCurrencies();
      const current = untracked(this.selectedCurrency);
      if (currencies.length > 0 && !current) {
        this.selectedCurrency.set(
          currencies.includes('CAD') ? 'CAD' : currencies[0],
        );
      }
    });

    effect(() => {
      const isConsolidated = this.yy525Data.isConsolidatedMode();
      this.headerService.setConfig({
        actions: [
          {
            type: 'toggle',
            label: '合併所有貨幣',
            icon: 'public',
            checked: isConsolidated,
            onChange: (checked) =>
              this.yy525Data.isConsolidatedMode.set(checked),
          },
        ],
      });
    });
  }

  availableCurrencies = computed(() => {
    return Array.from(
      new Set(this.yy525Data.analyticsRecords().map((r) => r.currency)),
    ).filter(Boolean);
  });

  anomalies = computed(() => {
    const currency = this.selectedCurrency();
    const isConsolidated = this.yy525Data.isConsolidatedMode();
    if (!currency) return [];

    return this.yy525Data
      .analyticsRecords()
      .filter(
        (r) => (isConsolidated || r.currency === currency) && r.isAnomaly,
      );
  });

  monthlyStats = computed(() => {
    const user = this.selectedUser();
    if (user === 'stranger') return [];
    
    const currency = this.selectedCurrency();
    const isConsolidated = this.yy525Data.isConsolidatedMode();
    if (!currency) return [];

    const map = new Map<string, { totalIn: number; totalOut: number }>();

    this.yy525Data.analyticsRecords().forEach((r) => {
      if (r.isTransfer || !r.statMonth || r.isAnomaly) return;
      if (!isConsolidated && r.currency !== currency) return;

      const share = this.yy525Data.calculateUserShare(
        r,
        user,
        isConsolidated,
        currency,
      );

      if (share !== 0) {
        const month = r.statMonth;
        if (!map.has(month)) map.set(month, { totalIn: 0, totalOut: 0 });

        const entry = map.get(month)!;
        if (r.type === 'In') entry.totalIn += share;
        if (r.type === 'Out') entry.totalOut += share;
      }
    });

    return Array.from(map.entries())
      .map(([month, data]) => ({
        month,
        totalIn: data.totalIn,
        totalOut: data.totalOut,
        net: data.totalIn - data.totalOut,
      }))
      .sort((a, b) => b.month.localeCompare(a.month));
  });

  overallSummary = computed(() => {
    const stats = this.monthlyStats();
    let totalIn = 0;
    let totalOut = 0;
    let net = 0;

    stats.forEach(stat => {
      totalIn += stat.totalIn;
      totalOut += stat.totalOut;
      net += stat.net;
    });

    return { totalIn, totalOut, net };
  });

  goToMonthDetail(month: string) {
    this.router.navigate(['/yy525/yyems-analytics/monthly'], {
      queryParams: {
        user: this.selectedUser(),
        currency: this.selectedCurrency(),
        month: month,
        consolidated: this.yy525Data.isConsolidatedMode(),
      },
    });
  }

  ngOnInit(): void {
    this.yy525Data.fetchAllData();
  }

  ngOnDestroy(): void {
    this.headerService.clear();
  }
}
