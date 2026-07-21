import { Injectable, signal, NgZone, inject } from '@angular/core';
import { YyemsRaw, VendorRaw, AccountRaw, YyemsRecord } from './yy525.model';
import { YY525_SOURCE, EXCHANGE_RATES } from '../../../../../app.constants';

@Injectable({ providedIn: 'root' })
export class Yy525DataService {
  private zone = inject(NgZone);

  private readonly GAS_URL = YY525_SOURCE.GAS_URL;
  private readonly TOKEN = YY525_SOURCE.TOKEN;

  loading = signal(false);
  fetchDurationSec = signal<number>(0);
  processDurationSec = signal<number>(0);
  analyticsRecords = signal<YyemsRecord[]>([]);

  isConsolidatedMode = signal<boolean>(false);

  calculateUserShare(
    record: YyemsRecord,
    targetUser: string,
    isConsolidated: boolean = false,
    targetCurrency: string = 'CAD',
  ): number {
    let amt = record.amount;

    if (isConsolidated && record.currency !== targetCurrency) {
      const recordRate = EXCHANGE_RATES[record.currency] || 1;
      const targetRate = EXCHANGE_RATES[targetCurrency] || 1;

      amt = (amt / recordRate) * targetRate;
    }

    if (record.owner === 'yyems') return amt / 2;
    return record.owner === targetUser ? amt : 0;
  }

  async fetchAllData(force = false) {
    if (this.analyticsRecords().length > 0 && !force) return;

    this.loading.set(true);
    const fetchStart = performance.now();

    try {
      const response = await fetch(`${this.GAS_URL}?token=${this.TOKEN}`, {
        method: 'GET',
        redirect: 'follow',
      });
      if (!response.ok) throw new Error('連線失敗');
      const data = await response.json();
      if (data.error) throw new Error(data.error);

      const fetchEnd = performance.now();
      const processStart = performance.now();

      const accounts: AccountRaw[] = data.accounts || [];
      const yyems: YyemsRaw[] = data.yyems || [];
      const accountMap = new Map(accounts.map((a) => [a.ID, a]));

      const processedRecords = yyems
        .filter((r) => r.In_or_out === 'In' || r.In_or_out === 'Out')
        .map((r) => {
          const isTransfer =
            r['auto_vendor_category'] === '內部轉帳' ||
            String(r['Vendor ID'] || '').includes('Internal_transfer');
          const statMonth = r['auto_stat_month'] || '';

          const displayDate = r['DateTime']
            ? new Date(r['DateTime'])
            : new Date();
          const utcStr = r['auto_UTC DateTime'] || r['DateTime'];
          const utcDate = utcStr ? new Date(utcStr) : new Date();

          const account = accountMap.get(r['Financial_Accounts']);
          const originalAmount = Number(r.Amount) || 0;
          const originalCurrency = r.Currency || '';
          const walletCurrency = account?.Currency || '';

          let finalAmount = originalAmount;
          let finalCurrency = originalCurrency;
          let isAnomaly = false;

          if (!walletCurrency) {
            isAnomaly = true;
          } else if (originalCurrency !== walletCurrency) {
            const walletAmtRaw = r.wallet_amount;
            const parsedWalletAmt = Number(walletAmtRaw);
            if (
              walletAmtRaw !== '' &&
              walletAmtRaw !== null &&
              !isNaN(parsedWalletAmt)
            ) {
              finalAmount = parsedWalletAmt;
              finalCurrency = walletCurrency;
            } else {
              isAnomaly = true;
            }
          }

          return {
            id: r['YYEMS ID'],
            date: displayDate,
            utcDate: utcDate,
            statMonth: statMonth,
            type: r.In_or_out as 'In' | 'Out',
            amount: finalAmount,
            currency: finalCurrency,
            originalAmount: originalAmount,
            originalCurrency: originalCurrency,
            owner: String(r.Ownership || '')
              .toLowerCase()
              .trim(),
            walletOwner: String(r.Wallet_owner || '')
              .toLowerCase()
              .trim(),
            vendorName: r['auto_vendor_name'] || '未知商家',
            category: r['auto_vendor_category'] || '未分類',
            accountName: account?.['Display Name'] || '未知帳戶',
            isTransfer,
            isAnomaly,
          };
        })
        .sort((a, b) => b.utcDate.getTime() - a.utcDate.getTime());

      const processEnd = performance.now();

      this.zone.run(() => {
        this.fetchDurationSec.set((fetchEnd - fetchStart) / 1000);
        this.processDurationSec.set((processEnd - processStart) / 1000);
        this.analyticsRecords.set(processedRecords);
        this.loading.set(false);
      });
    } catch (error: unknown) {
      console.error('yy525 資料同步失敗', error);
      this.zone.run(() => this.loading.set(false));
    }
  }
}
