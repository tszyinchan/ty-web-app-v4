import { CommonModule } from '@angular/common';
import {
  Component,
  NgZone,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { RecordStatus } from '../../../../core/models/status.enum';
import { formatUserDisplayName } from '../../../../core/pipes/display-name.pipe';
import { AuthService } from '../../../../core/services/auth.service';
import { HeaderService } from '../../../../core/services/header.service';
import { UserService } from '../user/user.service';
import { YYEMS_IN_OR_OUT, YyemsBillEmbed, YyemsBillShare } from './yyems.model';
import { YyemsService } from './yyems.service';
import {
  SplitCurrencyBreakdown,
  formatYyemsAmount,
  settleOneBill,
  splitBreakdown,
} from './yyems.util';

interface SplitTotalView {
  currencies: SplitCurrencyBreakdown[];
  missingShareCount: number;
  unsetCount: number;
}

const EMPTY_TOTAL: SplitTotalView = {
  currencies: [],
  missingShareCount: 0,
  unsetCount: 0,
};

@Component({
  selector: 'app-yyems-split',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatProgressSpinnerModule,
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
  groupId = signal('');
  loading = signal(false);

  private allBills = signal<YyemsBillEmbed[]>([]);
  private allShares = signal<YyemsBillShare[] | null>([]);

  myGroups = computed(() => {
    const me = this.auth.userProfile()?.user_id;
    if (!me) return [];
    const mine = new Set(
      this.users
        .groupMembers()
        .filter((member) => member.user_id === me)
        .map((member) => member.group_id),
    );
    return this.users
      .groups()
      .filter(
        (group) =>
          group.status === RecordStatus.Active &&
          !group.deleted_at &&
          mine.has(group.tb_tyapp_usr_grp_id),
      );
  });

  pair = computed((): readonly [string, string] | null => {
    const ids = this.memberIds(this.groupId());
    return ids.length === 2 ? [ids[0], ids[1]] : null;
  });

  private viewerId = computed(() => this.auth.userProfile()?.user_id ?? null);

  viewerName = computed(() => this.displayName(this.viewerId()) || 'You');

  /** The other member. The pay line is always “the logged-in user pays this person”. */
  payOtherName = computed(() => {
    const pair = this.pair();
    const me = this.viewerId();
    if (!pair) return '';
    const otherId = me === pair[1] ? pair[0] : pair[1];
    return this.displayName(otherId);
  });

  sharesMissing = computed(() => this.allShares() === null);

  totalView = computed((): SplitTotalView => {
    const pair = this.pair();
    const shares = this.allShares();
    const groupId = this.groupId();
    if (!pair || !groupId || shares === null) return EMPTY_TOTAL;
    return this.buildTotal(groupId, pair, this.allBills(), shares);
  });

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

  plainAmount(amount: number): string {
    const n = Number(amount);
    const abs = Math.abs(n).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return n < 0 ? `-${abs}` : abs;
  }

  displayName(userId: string | null | undefined): string {
    if (!userId) return '';
    const user = this.users.users().find((row) => row.user_id === userId);
    return user ? formatUserDisplayName(user) : '';
  }

  isMe(userId: string): boolean {
    return userId === this.viewerId();
  }

  /** What the logged-in user bears, minus what they paid. */
  viewerPays(row: SplitCurrencyBreakdown): number {
    const pair = this.pair();
    const me = this.viewerId();
    const index = pair && me === pair[1] ? 1 : 0;
    return -row.nets[index];
  }

  peopleFor(row: SplitCurrencyBreakdown): SplitCurrencyBreakdown['people'][number][] {
    const me = this.viewerId();
    const people = [...row.people];
    const mine = people.find((person) => person.userId === me);
    const rest = people.filter((person) => person.userId !== me);
    return mine ? [mine, ...rest] : people;
  }

  onGroup(event: Event) {
    this.groupId.set((event.target as HTMLSelectElement).value);
  }

  private async start() {
    await Promise.all([this.users.fetchAllUsers(), this.users.fetchGroups()]);
    const first = this.myGroups()[0];
    if (first && !this.groupId()) this.groupId.set(first.tb_tyapp_usr_grp_id);
    await this.yyems.fetchDicts();
    await this.reload();
  }

  private async reload() {
    this.loading.set(true);
    const bills = await this.yyems.queryAllOutBills();
    const shares = await this.yyems.fetchSharesForBills(
      bills.map((row) => row.tb_tyapp_yym_id),
    );
    this.zone.run(() => {
      this.allBills.set(bills);
      this.allShares.set(shares);
      this.loading.set(false);
    });
  }

  private memberIds(groupId: string): string[] {
    if (!groupId) return [];
    const ids = [
      ...new Set(
        this.users
          .groupMembers()
          .filter((member) => member.group_id === groupId)
          .map((member) => member.user_id),
      ),
    ];
    return this.users
      .users()
      .filter((user) => ids.includes(user.user_id) && !user.deleted_at)
      .sort((a, b) =>
        formatUserDisplayName(a).localeCompare(formatUserDisplayName(b)),
      )
      .map((user) => user.user_id);
  }

  private buildTotal(
    groupId: string,
    pair: readonly [string, string],
    bills: readonly YyemsBillEmbed[],
    shareRows: readonly YyemsBillShare[],
  ): SplitTotalView {
    const byBill = new Map<string, { userId: string; share: number }[]>();
    for (const row of shareRows) {
      const list = byBill.get(row.yyems_id) ?? [];
      list.push({ userId: row.user_id, share: Number(row.share) });
      byBill.set(row.yyems_id, list);
    }

    const settled: {
      currency: string;
      shares: { userId: string; share: number }[];
      result: ReturnType<typeof settleOneBill>;
    }[] = [];
    let missingShareCount = 0;
    let unsetCount = 0;

    for (const bill of bills) {
      if (bill.in_or_out !== YYEMS_IN_OR_OUT.Out) continue;
      if (!bill.group_id) {
        unsetCount += 1;
        continue;
      }
      if (bill.group_id !== groupId) continue;
      const shares = byBill.get(bill.tb_tyapp_yym_id) ?? [];
      if (shares.length === 0) {
        missingShareCount += 1;
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
      settled.push({ currency: money.currency, shares, result });
    }

    return {
      currencies: splitBreakdown(settled, pair),
      missingShareCount,
      unsetCount,
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
}
