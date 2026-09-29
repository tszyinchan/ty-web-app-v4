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
import { YyemsService } from './yyems.service';
import {
  SplitCurrencyBreakdown,
  formatYyemsAmount,
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
  private total = signal<SplitTotalView>(EMPTY_TOTAL);

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

  totalView = computed(() => this.total());

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

  /** Logged-in user pays the other: −net = your share − what you paid. */
  viewerPays(row: SplitCurrencyBreakdown): number {
    return -row.nets[this.viewerIndex()];
  }

  /**
   * Exact: your share − (your Himself + Other + Both) = pay balance.
   * Example: 75.00 − (10.00 + 20.00 + 40.00) = 5.00
   */
  payFormula(row: SplitCurrencyBreakdown): string {
    const me = this.peopleFor(row).find((person) => this.isMe(person.userId));
    if (!me) return '';
    const share = row.borne[this.viewerIndex()];
    const result = this.viewerPays(row);
    return (
      `${this.plainAmount(share)} − (` +
      `${this.plainAmount(me.selfPaid)} + ` +
      `${this.plainAmount(me.otherPaid)} + ` +
      `${this.plainAmount(me.bothPaid)}` +
      `) = ${this.plainAmount(result)}`
    );
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
    void this.reload();
  }

  private viewerIndex(): 0 | 1 {
    const pair = this.pair();
    const me = this.viewerId();
    return pair && me === pair[1] ? 1 : 0;
  }

  private async start() {
    await Promise.all([this.users.fetchAllUsers(), this.users.fetchGroups()]);
    const first = this.myGroups()[0];
    if (first && !this.groupId()) this.groupId.set(first.tb_tyapp_usr_grp_id);
    await this.yyems.fetchDicts();
    await this.reload();
  }

  private async reload() {
    const groupId = this.groupId();
    const pair = this.pair();
    if (!groupId || !pair) {
      this.zone.run(() => {
        this.total.set(EMPTY_TOTAL);
        this.loading.set(false);
      });
      return;
    }
    this.loading.set(true);
    const rpc = await this.yyems.fetchSplitGroupTotals(groupId, pair[0], pair[1]);
    this.zone.run(() => {
      this.total.set(rpc ?? EMPTY_TOTAL);
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
}
