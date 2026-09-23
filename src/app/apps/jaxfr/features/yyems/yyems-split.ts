import { CommonModule } from '@angular/common';
import {
  Component,
  NgZone,
  OnDestroy,
  OnInit,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';

import { RecordStatus } from '../../../../core/models/status.enum';
import { formatUserDisplayName } from '../../../../core/pipes/display-name.pipe';
import { AuthService } from '../../../../core/services/auth.service';
import { HeaderService } from '../../../../core/services/header.service';
import {
  formatDate,
  localMonthUtcRange,
} from '../../../../core/utils/date-time.util';
import { UserService } from '../user/user.service';
import {
  YYEMS_IN_OR_OUT,
  YyemsBillEmbed,
  YyemsBillShare,
  YyemsLocationTz,
} from './yyems.model';
import { YyemsService } from './yyems.service';
import {
  SplitCurrencyTotal,
  buildSplitChecks,
  equalShares,
  formatYyemsAmount,
  owesLabel,
  settleOneBill,
  shareSplitHint,
  sharesStayInPair,
  sortByOrderThenName,
  summarizeSplit,
} from './yyems.util';

interface SplitLineView {
  id: string;
  when: string;
  title: string;
  detail: string;
  verdict: string;
}

interface SplitMonthView {
  lines: SplitLineView[];
  totals: SplitCurrencyTotal[];
  outsideCount: number;
  missingShareCount: number;
  skippedFlowCount: number;
}

const EMPTY_MONTH: SplitMonthView = {
  lines: [],
  totals: [],
  outsideCount: 0,
  missingShareCount: 0,
  skippedFlowCount: 0,
};

@Component({
  selector: 'app-yyems-split',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
  ],
  templateUrl: './yyems-split.html',
  styleUrl: './yyems-split.scss',
})
export class YyemsSplit implements OnInit, OnDestroy {
  readonly yyems = inject(YyemsService);
  private header = inject(HeaderService);
  private users = inject(UserService);
  private auth = inject(AuthService);
  private zone = inject(NgZone);

  readonly formatAmount = formatYyemsAmount;
  personAId = signal('');
  personBId = signal('');
  vendorId = signal('');
  walletId = signal('');
  amount = signal<number | null>(null);
  bearerIds = signal<string[]>([]);
  remark = signal('Split check');
  readonly shareSplitHint = shareSplitHint;
  private pairKey = '';
  loading = signal(false);
  dictsReady = signal(false);

  private cursor = signal({
    year: new Date().getFullYear(),
    month: new Date().getMonth(),
  });
  private monthBills = signal<YyemsBillEmbed[]>([]);
  private monthShares = signal<YyemsBillShare[] | null>([]);

  monthLabel = computed(() => {
    const { year, month } = this.cursor();
    return new Date(year, month, 1).toLocaleString('en-US', {
      month: 'short',
      year: 'numeric',
    });
  });

  people = computed(() =>
    this.users
      .users()
      .filter((user) => !user.deleted_at && user.status === RecordStatus.Active),
  );

  pair = computed((): readonly [string, string] | null => {
    const a = this.personAId();
    const b = this.personBId();
    if (!a || !b || a === b) return null;
    return [a, b];
  });

  personAName = computed(() => this.displayName(this.personAId()) || 'Person A');
  personBName = computed(() => this.displayName(this.personBId()) || 'Person B');

  checks = computed(() =>
    buildSplitChecks(this.personAName(), this.personBName()),
  );

  checksOk = computed(() => this.checks().every((row) => row.ok));

  vendors = computed(() =>
    sortByOrderThenName(
      this.yyems.vendors().filter((row) => row.status === RecordStatus.Active),
    ),
  );

  walletChoices = computed(() => {
    const accounts = this.yyems.financialAccounts();
    return sortByOrderThenName(
      this.yyems.wallets().filter((row) => row.status === RecordStatus.Active),
    ).map((wallet) => {
      const account = accounts.find(
        (row) => row.tb_tyapp_yfa_id === wallet.financial_account_id,
      );
      const owner = account ? this.ownerLabel(account.owner_user_id) : 'Unknown';
      const currency = account?.currency ?? '';
      return {
        id: wallet.tb_tyapp_ywl_id,
        label: `${wallet.name} · ${owner}${currency ? ' · ' + currency : ''}`,
      };
    });
  });

  needsHouseholdGrant = computed(
    () =>
      this.dictsReady() &&
      this.yyems.vendors().length === 0 &&
      this.yyems.wallets().length === 0,
  );

  sharesMissing = computed(() => this.monthShares() === null);

  monthView = computed((): SplitMonthView => {
    const pair = this.pair();
    const shares = this.monthShares();
    if (!pair || shares === null) return EMPTY_MONTH;
    return this.buildMonth(pair, this.monthBills(), shares);
  });

  canSave = computed(() => {
    const amount = Number(this.amount());
    return (
      !!this.pair() &&
      this.bearerIds().length > 0 &&
      !!this.vendorId() &&
      !!this.walletId() &&
      Number.isFinite(amount) &&
      amount > 0 &&
      !this.yyems.loading()
    );
  });

  constructor() {
    effect(() => {
      const pair = this.pair();
      const key = pair ? `${pair[0]}|${pair[1]}` : '';
      if (key === this.pairKey) return;
      this.pairKey = key;
      this.bearerIds.set(pair ? [pair[0], pair[1]] : []);
    });
  }

  ngOnInit() {
    const isLoading = computed(() => this.loading() || this.yyems.loading());
    this.header.setConfig({
      backLink: '/yyems',
      title: 'Split',
      actions: [
        {
          label: 'Refresh',
          icon: 'refresh',
          type: 'secondary',
          disabled: isLoading,
          onClick: () => void this.reload(),
        },
      ],
    });
    void this.start();
  }

  ngOnDestroy() {
    this.header.clear();
  }

  displayName(userId: string | null | undefined): string {
    if (!userId) return '';
    const user = this.users.users().find((row) => row.user_id === userId);
    return user ? formatUserDisplayName(user) : '';
  }

  ownerLabel(userId: string | null | undefined): string {
    return this.displayName(userId) || 'Joint';
  }

  shiftMonth(delta: number) {
    const { year, month } = this.cursor();
    const next = new Date(year, month + delta, 1);
    this.cursor.set({ year: next.getFullYear(), month: next.getMonth() });
    void this.reload();
  }

  pairUser(index: 0 | 1): string {
    return this.pair()?.[index] ?? '';
  }

  isBearer(userId: string): boolean {
    return !!userId && this.bearerIds().includes(userId);
  }

  toggleBearer(userId: string) {
    if (!userId) return;
    const next = new Set(this.bearerIds());
    if (next.has(userId)) next.delete(userId);
    else next.add(userId);
    this.bearerIds.set([...next].sort());
  }

  async addWallet(who: 'a' | 'b' | 'joint') {
    const pair = this.pair();
    let owner: string | null = null;
    let label = 'Split test · Joint';
    if (who === 'a') {
      if (!pair) return;
      owner = pair[0];
      label = `Split test · ${this.displayName(pair[0])}`;
    } else if (who === 'b') {
      if (!pair) return;
      owner = pair[1];
      label = `Split test · ${this.displayName(pair[1])}`;
    }
    const id = await this.yyems.createOwnedCadWallet(owner, label);
    if (id) this.walletId.set(id);
  }

  async saveCheck() {
    const pair = this.pair();
    const userId = this.auth.userProfile()?.user_id;
    const amount = Number(this.amount());
    if (!pair || !userId || !Number.isFinite(amount) || !this.canSave()) return;
    const wallet = this.yyems
      .wallets()
      .find((row) => row.tb_tyapp_ywl_id === this.walletId());
    const account = this.yyems
      .financialAccounts()
      .find((row) => row.tb_tyapp_yfa_id === wallet?.financial_account_id);
    const bearerIds = this.bearerIds();
    const locationTz: YyemsLocationTz = 'TO';
    const saved = await this.yyems.saveBill({
      occurred_at: new Date().toISOString(),
      location_tz: locationTz,
      in_or_out: YYEMS_IN_OR_OUT.Out,
      vendor_id: this.vendorId(),
      currency: account?.currency ?? 'CAD',
      amount,
      wallet_id: this.walletId(),
      ownership_user_id: bearerIds.length === 1 ? bearerIds[0] : null,
      remark: this.remark().trim() || 'Split check',
      description: null,
      reconciled: false,
      wallet_amount: null,
      created_by: userId,
      status: RecordStatus.Active,
    });
    if (!saved) return;
    const shares = equalShares(bearerIds);
    const sharesOk = await this.yyems.replaceBillShares(
      saved.tb_tyapp_yym_id,
      shares,
    );
    if (sharesOk) {
      this.amount.set(null);
      await this.reload();
    }
  }

  private async start() {
    await this.users.fetchAllUsers();
    const me = this.auth.userProfile()?.user_id ?? '';
    if (me && !this.personAId()) this.personAId.set(me);
    await this.yyems.fetchDicts();
    this.zone.run(() => this.dictsReady.set(true));
    await this.reload();
  }

  private async reload() {
    this.loading.set(true);
    const { year, month } = this.cursor();
    const range = localMonthUtcRange(year, month);
    const bills = await this.yyems.queryBillsInRange(range.from, range.to);
    const shares = await this.yyems.fetchSharesForBills(
      bills.map((row) => row.tb_tyapp_yym_id),
    );
    this.zone.run(() => {
      this.monthBills.set(bills);
      this.monthShares.set(shares);
      this.loading.set(false);
    });
  }

  private buildMonth(
    pair: readonly [string, string],
    bills: readonly YyemsBillEmbed[],
    shareRows: readonly YyemsBillShare[],
  ): SplitMonthView {
    const byBill = new Map<string, { userId: string; share: number }[]>();
    for (const row of shareRows) {
      const list = byBill.get(row.yyems_id) ?? [];
      list.push({ userId: row.user_id, share: Number(row.share) });
      byBill.set(row.yyems_id, list);
    }

    const lines: SplitLineView[] = [];
    const settled: { currency: string; result: ReturnType<typeof settleOneBill> }[] =
      [];
    let outsideCount = 0;
    let missingShareCount = 0;
    let skippedFlowCount = 0;

    for (const bill of bills) {
      if (bill.in_or_out !== YYEMS_IN_OR_OUT.Out) {
        skippedFlowCount += 1;
        continue;
      }
      const shares = byBill.get(bill.tb_tyapp_yym_id) ?? [];
      if (shares.length === 0) {
        missingShareCount += 1;
        continue;
      }
      if (!sharesStayInPair(shares, pair)) {
        outsideCount += 1;
        continue;
      }
      const money = this.settlementMoney(bill);
      if (!money) continue;
      const payerUserId = this.payerUserId(bill);
      if (payerUserId === undefined) continue;
      const result = settleOneBill({
        amount: money.amount,
        payerUserId,
        shares,
        pair,
      });
      settled.push({ currency: money.currency, result });
      lines.push({
        id: bill.tb_tyapp_yym_id,
        when: formatDate(new Date(bill.occurred_at)),
        title: bill.vendor?.name || bill.remark || 'Bill',
        detail: `${this.ownerLabel(payerUserId)} paid · ${this.borneLabel(shares, pair)}`,
        verdict: owesLabel(
          this.personAName(),
          this.personBName(),
          result.effects[0].net,
          result.effects[1].net,
          money.currency,
        ),
      });
    }

    return {
      lines,
      totals: summarizeSplit(settled, this.personAName(), this.personBName()),
      outsideCount,
      missingShareCount,
      skippedFlowCount,
    };
  }

  /** `undefined` means the wallet owner could not be resolved. `null` is the joint pot. */
  private payerUserId(bill: YyemsBillEmbed): string | null | undefined {
    const wallet =
      bill.wallet ??
      this.yyems.wallets().find((row) => row.tb_tyapp_ywl_id === bill.wallet_id);
    if (!wallet) return undefined;
    const account = this.yyems
      .financialAccounts()
      .find((row) => row.tb_tyapp_yfa_id === wallet.financial_account_id);
    if (!account) return undefined;
    return account.owner_user_id;
  }

  private settlementMoney(
    bill: YyemsBillEmbed,
  ): { amount: number; currency: string } | null {
    if (bill.wallet_amount != null) {
      const wallet =
        bill.wallet ??
        this.yyems.wallets().find((row) => row.tb_tyapp_ywl_id === bill.wallet_id);
      const account = this.yyems
        .financialAccounts()
        .find((row) => row.tb_tyapp_yfa_id === wallet?.financial_account_id);
      if (!account) return null;
      return { amount: Number(bill.wallet_amount), currency: account.currency };
    }
    return { amount: Number(bill.amount), currency: bill.currency };
  }

  private borneLabel(
    shares: readonly { userId: string; share: number }[],
    pair: readonly [string, string],
  ): string {
    const ids = new Set(shares.map((row) => row.userId));
    if (ids.has(pair[0]) && ids.has(pair[1])) return 'Both';
    if (ids.has(pair[0])) return this.displayName(pair[0]);
    if (ids.has(pair[1])) return this.displayName(pair[1]);
    return '—';
  }
}
