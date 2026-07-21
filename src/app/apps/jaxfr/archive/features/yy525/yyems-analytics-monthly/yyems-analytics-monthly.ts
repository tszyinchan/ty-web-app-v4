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
import {
  CommonModule,
  CurrencyPipe,
  DecimalPipe,
} from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';

import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatExpansionModule } from '@angular/material/expansion';

import { Yy525DataService } from '../yy525-data.service';
import { YyemsRecord } from '../yy525.model';
import { AuthService } from '../../../../../../core/services/auth.service';
import { HeaderService } from '../../../../../../core/services/header.service';

@Component({
  selector: 'app-yyems-analytics-monthly',
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
    MatExpansionModule,
  ],
  templateUrl: './yyems-analytics-monthly.html',
  styleUrl: './yyems-analytics-monthly.scss',
})
export class YyemsAnalyticsMonthly implements OnInit, OnDestroy {
  yy525Data = inject(Yy525DataService);
  private route = inject(ActivatedRoute);
  public headerService = inject(HeaderService);
  private authService = inject(AuthService);

  selectedUser = signal<'cty' | 'frd' | 'stranger'>('stranger');
  selectedMonth = signal<string>('');
  selectedCurrency = signal<string>('');

  isConsolidatedMode = this.yy525Data.isConsolidatedMode;

  constructor() {
    const identity = this.authService.userProfile()?.appsheet_525_user_id;
    if (identity === 'cty' || identity === 'frd') {
      this.selectedUser.set(identity);
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
      const months = this.availableMonths();
      const current = untracked(this.selectedMonth);
      if (months.length > 0 && !current) {
        this.selectedMonth.set(months[0]);
      }
    });

    effect(() => {
      const isConsolidated = this.yy525Data.isConsolidatedMode();
      this.headerService.setConfig({
        backLink: '/yy525/yyems-analytics/overview',
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

  availableMonths = computed(() => {
    const months = new Set<string>();
    this.yy525Data.analyticsRecords().forEach((r) => {
      if (r.statMonth) months.add(r.statMonth);
    });
    return Array.from(months).sort().reverse();
  });

  monthlyRealRecords = computed(() => {
    const month = this.selectedMonth();
    const currency = this.selectedCurrency();
    const isConsolidated = this.yy525Data.isConsolidatedMode();
    if (!month || !currency || this.selectedUser() === 'stranger') return [];

    return this.yy525Data.analyticsRecords().filter((r) => {
      const matchCurrency = isConsolidated ? true : r.currency === currency;
      return (
        r.statMonth === month && matchCurrency && !r.isTransfer && !r.isAnomaly
      );
    });
  });

  anomalies = computed(() => {
    const month = this.selectedMonth();
    const currency = this.selectedCurrency();
    const isConsolidated = this.yy525Data.isConsolidatedMode();
    if (!month || this.selectedUser() === 'stranger') return [];

    return this.yy525Data
      .analyticsRecords()
      .filter(
        (r) =>
          r.statMonth === month &&
          (isConsolidated || r.currency === currency) &&
          r.isAnomaly,
      );
  });

  summary = computed(() => {
    const user = this.selectedUser();
    const currency = this.selectedCurrency();
    const isConsolidated = this.yy525Data.isConsolidatedMode();
    let totalIn = 0;
    let totalOut = 0;

    this.monthlyRealRecords().forEach((r) => {
      const share = this.yy525Data.calculateUserShare(
        r,
        user,
        isConsolidated,
        currency,
      );
      if (share !== 0) {
        if (r.type === 'In') totalIn += share;
        if (r.type === 'Out') totalOut += share;
      }
    });

    return { totalIn, totalOut, net: totalIn - totalOut };
  });

  private buildBreakdown(type: 'In' | 'Out') {
    const user = this.selectedUser();
    const currency = this.selectedCurrency();
    const isConsolidated = this.yy525Data.isConsolidatedMode();
    const catMap = new Map<string, { totalShare: number; bills: any[] }>();

    this.monthlyRealRecords()
      .filter((r) => r.type === type)
      .forEach((r) => {
        const share = this.yy525Data.calculateUserShare(
          r,
          user,
          isConsolidated,
          currency,
        );

        if (share !== 0) {
          const cat = r.category || '未分類';
          if (!catMap.has(cat)) catMap.set(cat, { totalShare: 0, bills: [] });

          const entry = catMap.get(cat)!;
          entry.totalShare += share;
          entry.bills.push({
            ...r,
            originalAmount: r.originalAmount,
            originalCurrency: r.originalCurrency,
            userShare: share,
            isConverted: isConsolidated && r.currency !== currency,
          });
        }
      });

    return Array.from(catMap.entries())
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.totalShare - a.totalShare);
  }

  expenseBreakdown = computed(() => this.buildBreakdown('Out'));
  incomeBreakdown = computed(() => this.buildBreakdown('In'));

  ngOnInit(): void {
    const queryParams = this.route.snapshot.queryParams;
    if ((queryParams['user'] && this.selectedUser() !== 'stranger'))
      this.selectedUser.set(queryParams['user'] as 'cty' | 'frd');
    if (queryParams['currency'])
      this.selectedCurrency.set(queryParams['currency']);
    if (queryParams['month']) this.selectedMonth.set(queryParams['month']);

    this.yy525Data.fetchAllData();
  }

  ngOnDestroy(): void {
    this.headerService.clear();
  }
}
