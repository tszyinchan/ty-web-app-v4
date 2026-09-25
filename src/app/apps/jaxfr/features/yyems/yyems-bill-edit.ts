import { CommonModule } from '@angular/common';
import {
  Component,
  DoCheck,
  HostListener,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';

import { RecordStatus } from '../../../../core/models/status.enum';
import { AuthService } from '../../../../core/services/auth.service';
import {
  HeaderAction,
  HeaderService,
} from '../../../../core/services/header.service';
import { DisplayNamePipe } from '../../../../core/pipes/display-name.pipe';
import { UserService } from '../user/user.service';
import {
  fromDateTimeLocalValue,
  toDateTimeLocalValue,
} from '../../../../core/utils/date-time.util';
import {
  YYEMS_IN_OR_OUT,
  YyemsBill,
  YyemsBillShare,
  YyemsBuyEmbed,
  YyemsInOrOut,
  YyemsLocationTz,
} from './yyems.model';
import { YyemsService } from './yyems.service';
import {
  BearerPercent,
  billFxHint,
  equalBearerRows,
  itemLabel,
  percentsFromShares,
  pairFromRatio,
  rowsToShares,
  sortByOrderThenName,
  formatSharePercent,
  shareSplitHint,
} from './yyems.util';
import { formatUserDisplayName } from '../../../../core/pipes/display-name.pipe';

interface BillForm {
  tb_tyapp_yym_id?: string;
  occurred_local: string;
  location_tz: YyemsLocationTz;
  in_or_out: YyemsInOrOut;
  vendor_id: string;
  currency: string;
  amount: number | null;
  wallet_id: string;
  bearers: BearerPercent[];
  remark: string;
  description: string;
  reconciled: boolean;
  wallet_amount: number | null;
  period_start: string;
  period_end: string;
}

@Component({
  selector: 'app-yyems-bill-edit',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    MatButtonModule,
    MatIconModule,
    MatCheckboxModule,
    MatAutocompleteModule,
    MatInputModule,
    DisplayNamePipe,
  ],
  templateUrl: './yyems-bill-edit.html',
  styleUrl: './yyems-bill-edit.scss',
})
export class YyemsBillEdit implements OnInit, OnDestroy, DoCheck {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private header = inject(HeaderService);
  private auth = inject(AuthService);
  readonly yyems = inject(YyemsService);
  readonly users = inject(UserService);

  readonly YYEMS_IN_OR_OUT = YYEMS_IN_OR_OUT;
  readonly formatSharePercent = formatSharePercent;
  readonly shareSplitHint = shareSplitHint;
  readonly itemLabel = itemLabel;

  currentId: string | null = null;
  item = signal<BillForm | null>(null);
  buys = signal<YyemsBuyEmbed[]>([]);
  vendorQuery = signal('');
  walletQuery = signal('');
  originalDataStr = signal('');
  isDirty = signal(false);
  isSaveDisabled = signal(true);
  moreOpen = signal(false);

  groupId = signal('');

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

  bearers = computed(() => {
    const ids = new Set(this.memberIds(this.groupId()));
    for (const row of this.item()?.bearers ?? []) ids.add(row.user_id);
    return this.users
      .users()
      .filter((user) => ids.has(user.user_id) && !user.deleted_at)
      .sort((a, b) =>
        formatUserDisplayName(a).localeCompare(formatUserDisplayName(b)),
      );
  });

  sortedVendors = computed(() => sortByOrderThenName(this.yyems.vendors()));
  sortedWallets = computed(() => sortByOrderThenName(this.yyems.wallets()));

  syncStatus = computed<'loading' | 'up-to-date' | 'unsaved' | 'none'>(() => {
    if (this.yyems.busy()) return 'loading';
    if (this.isDirty()) return 'unsaved';
    if (this.currentId) return 'up-to-date';
    return 'none';
  });

  @HostListener('window:beforeunload', ['$event'])
  onBeforeUnload(event: BeforeUnloadEvent) {
    if (this.isDirty()) {
      event.preventDefault();
      return false;
    }
    return true;
  }

  ngDoCheck() {
    const current = this.item();
    const original = this.originalDataStr();
    if (!current || !original) return;
    const currentlyDirty = JSON.stringify(current) !== original;
    if (this.isDirty() !== currentlyDirty) this.isDirty.set(currentlyDirty);
    const disabled =
      this.yyems.busy() ||
      (!!this.currentId && !currentlyDirty) ||
      !current.vendor_id ||
      !current.wallet_id ||
      !current.occurred_local ||
      !this.knownCurrency(current.currency) ||
      current.amount === null ||
      current.amount === undefined ||
      !this.shareRows(current);
    if (this.isSaveDisabled() !== disabled) this.isSaveDisabled.set(disabled);
  }

  async ngOnInit() {
    this.currentId = this.route.snapshot.paramMap.get('id');
    await Promise.all([
      this.yyems.fetchDicts(),
      this.users.fetchAllUsers(),
      this.users.fetchGroups(),
    ]);
    this.pickInitialGroup();

    if (this.currentId) {
      const bill = await this.yyems.fetchBillById(this.currentId);
      if (!bill) {
        void this.router.navigateByUrl('/yyems/bills/list');
        return;
      }
      this.item.set(this.toForm(bill));
      const shares = await this.yyems.fetchBillShares(this.currentId);
      const bearerRows = this.bearersForExisting(bill, shares);
      this.groupId.set(
        bill.group_id || this.groupForBearers(bearerRows.map((row) => row.user_id)),
      );
      const shown = this.presentPair(bearerRows);
      this.item.update((cur) => (cur ? { ...cur, bearers: shown } : cur));
      this.syncLookupLabels(this.item());
      this.noteMore(this.item());
      this.buys.set(await this.yyems.fetchBuysForBill(this.currentId));
    } else {
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      const local = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
      this.item.set({
        occurred_local: local,
        location_tz: 'TO',
        in_or_out: YYEMS_IN_OR_OUT.Out,
        vendor_id: '',
        currency: 'CAD',
        amount: null,
        wallet_id: '',
        bearers: this.defaultBearers(),
        remark: '',
        description: '',
        reconciled: false,
        wallet_amount: null,
        period_start: '',
        period_end: '',
      });
      this.vendorQuery.set('');
      this.walletQuery.set('');
      this.moreOpen.set(false);
    }
    this.originalDataStr.set(JSON.stringify(this.item()));

    const actions: HeaderAction[] = [];
    if (this.currentId) {
      actions.push({
        label: 'Delete',
        icon: 'delete_outline',
        type: 'secondary',
        onClick: () => void this.onDelete(),
      });
    }
    actions.push({
      label: this.currentId ? 'Save Changes' : 'Create Bill',
      icon: 'check',
      type: 'primary',
      disabled: this.isSaveDisabled,
      onClick: () => void this.onSave(),
    });
    this.header.setConfig({
      backLink: '/yyems/bills/list',
      title: this.currentId ? 'Edit bill' : 'New bill',
      syncStatus: this.syncStatus,
      actions,
    });
  }

  private toForm(bill: YyemsBill): BillForm {
    return {
      tb_tyapp_yym_id: bill.tb_tyapp_yym_id,
      occurred_local: toDateTimeLocalValue(bill.occurred_at),
      location_tz: bill.location_tz,
      in_or_out: bill.in_or_out,
      vendor_id: bill.vendor_id,
      currency: bill.currency,
      amount: bill.amount,
      wallet_id: bill.wallet_id,
      bearers: [],
      remark: bill.remark || '',
      description: bill.description || '',
      reconciled: bill.reconciled,
      wallet_amount: bill.wallet_amount,
      period_start: bill.period_start || '',
      period_end: bill.period_end || '',
    };
  }

  async onSave() {
    const form = this.item();
    const userId = this.auth.userProfile()?.user_id;
    if (!form || !userId) return;
    const occurred = fromDateTimeLocalValue(form.occurred_local);
    if (!occurred || form.amount === null) return;

    const payload: Partial<YyemsBill> = {
      tb_tyapp_yym_id: form.tb_tyapp_yym_id,
      occurred_at: occurred,
      location_tz: form.location_tz,
      in_or_out: form.in_or_out,
      vendor_id: form.vendor_id,
      currency: form.currency,
      amount: form.amount,
      wallet_id: form.wallet_id,
      ownership_user_id: this.soleBearerId(form),
      remark: form.remark.trim() || null,
      description: form.description.trim() || null,
      reconciled: form.reconciled,
      wallet_amount: this.showPaidLine(form) ? form.wallet_amount : null,
      period_start: form.period_start || null,
      period_end: form.period_end || null,
      created_by: userId,
      group_id: this.groupId() || null,
      status: RecordStatus.Active,
    };
    const shares = this.shareRows(form);
    if (!shares) return;
    const saved = await this.yyems.saveBill(payload);
    if (!saved) return;
    const sharesOk = await this.yyems.replaceBillShares(saved.tb_tyapp_yym_id, shares);
    this.currentId = saved.tb_tyapp_yym_id;
    this.item.update((cur) =>
      cur ? { ...cur, tb_tyapp_yym_id: saved.tb_tyapp_yym_id } : cur,
    );
    if (!sharesOk) return;
    this.originalDataStr.set(JSON.stringify(this.item()));
    this.isDirty.set(false);
    void this.router.navigate(['/yyems/bills/edit', saved.tb_tyapp_yym_id], {
      replaceUrl: true,
    });
  }

  async onDelete() {
    if (!this.currentId) return;
    if (!confirm('Soft-delete this bill? Linked buys stay until you delete them.')) {
      return;
    }
    const ok = await this.yyems.deleteBill(this.currentId);
    if (ok) void this.router.navigateByUrl('/yyems/bills/list');
  }

  addBuy() {
    if (!this.currentId) return;
    void this.router.navigate(['/yyems/buys/new'], {
      queryParams: { billId: this.currentId },
    });
  }

  setFlow(bill: BillForm, flow: YyemsInOrOut) {
    bill.in_or_out = flow;
  }

  onMoreToggle(event: Event) {
    this.moreOpen.set((event.target as HTMLDetailsElement).open);
  }

  private noteMore(form: BillForm | null) {
    if (!form) return;
    this.moreOpen.set(
      !!form.period_start || !!form.period_end || form.description.trim().length > 0,
    );
  }

  onGroup(event: Event) {
    const groupId = (event.target as HTMLSelectElement).value;
    this.groupId.set(groupId);
    const form = this.item();
    if (!form) return;
    const allowed = new Set(this.memberIds(groupId));
    const kept = form.bearers
      .map((row) => row.user_id)
      .filter((id) => allowed.has(id));
    form.bearers = this.presentPair(equalBearerRows(this.orderIds(kept)));
  }

  isBearer(bill: BillForm, userId: string): boolean {
    return bill.bearers.some((row) => row.user_id === userId);
  }

  bearerName(userId: string): string {
    const user = this.users.users().find((row) => row.user_id === userId);
    return user ? formatUserDisplayName(user) : '';
  }

  private pairDrag = false;

  onPairDown(event: PointerEvent, bill: BillForm, lane: HTMLElement) {
    if (event.button !== 0 || bill.bearers.length !== 2) return;
    event.preventDefault();
    event.stopPropagation();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    this.pairDrag = true;
    this.applyPair(event, bill, lane);
  }

  onPairMove(event: PointerEvent, bill: BillForm, lane: HTMLElement) {
    const host = event.currentTarget as HTMLElement;
    if (!this.pairDrag || !host.hasPointerCapture(event.pointerId)) return;
    this.applyPair(event, bill, lane);
  }

  onPairUp() {
    this.pairDrag = false;
  }

  onPairKey(event: KeyboardEvent, bill: BillForm) {
    const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (delta === 0 || bill.bearers.length !== 2) return;
    event.preventDefault();
    const next = Math.round(bill.bearers[0].percent) + delta;
    bill.bearers = pairFromRatio(bill.bearers, next / 100);
  }

  private applyPair(event: PointerEvent, bill: BillForm, lane: HTMLElement) {
    const rect = lane.getBoundingClientRect();
    if (rect.width <= 0) return;
    const ratio = (event.clientX - rect.left) / rect.width;
    bill.bearers = pairFromRatio(bill.bearers, ratio);
  }

  /** A two-person group always keeps both names on the bar, including 0 / 100. */
  private presentPair(rows: BearerPercent[]): BearerPercent[] {
    const members = this.orderIds(this.memberIds(this.groupId()));
    if (members.length !== 2) return rows;
    const memberSet = new Set(members);
    if (rows.some((row) => !memberSet.has(row.user_id))) return rows;
    if (rows.length === 0) return equalBearerRows(members);
    const byId = new Map(rows.map((row) => [row.user_id, Math.round(row.percent)]));
    const left = byId.get(members[0]) ?? 0;
    const right = byId.get(members[1]) ?? 0;
    if (left <= 0 && right <= 0) return equalBearerRows(members);
    const total = left + right;
    const leftPct = Math.round((left / total) * 100);
    return [
      { user_id: members[0], percent: leftPct },
      { user_id: members[1], percent: 100 - leftPct },
    ];
  }

  private soleBearerId(form: BillForm): string | null {
    const active = form.bearers.filter((row) => Math.round(row.percent) > 0);
    return active.length === 1 ? active[0].user_id : null;
  }

  toggleBearer(bill: BillForm, userId: string) {
    const next = new Set(bill.bearers.map((row) => row.user_id));
    if (next.has(userId)) next.delete(userId);
    else next.add(userId);
    bill.bearers = equalBearerRows(this.orderIds([...next]));
  }

  knownCurrency(code: string): boolean {
    return this.yyems.currencies().some((row) => row.code === code);
  }

  currencyChoices(query: string) {
    const rows = [...this.yyems.currencies()].sort((a, b) =>
      a.code.localeCompare(b.code),
    );
    return this.filterChoices(rows, query, (row) => row.code, (row) => row.code);
  }

  vendorChoices(query: string) {
    return this.filterChoices(
      this.sortedVendors(),
      query,
      (row) => row.name,
      (row) => `${row.name} ${row.name_short ?? ''}`,
    );
  }

  walletChoices(query: string) {
    return this.filterChoices(
      this.sortedWallets(),
      query,
      (row) => row.name,
      (row) => row.name,
    );
  }

  onVendorQuery(bill: BillForm, text: string) {
    this.vendorQuery.set(text);
    const hit = this.sortedVendors().find(
      (row) => row.name.toLowerCase() === text.trim().toLowerCase(),
    );
    bill.vendor_id = hit?.tb_tyapp_yvd_id ?? '';
  }

  onWalletQuery(bill: BillForm, text: string) {
    this.walletQuery.set(text);
    const hit = this.sortedWallets().find(
      (row) => row.name.toLowerCase() === text.trim().toLowerCase(),
    );
    bill.wallet_id = hit?.tb_tyapp_ywl_id ?? '';
  }

  onCurrencyQuery(bill: BillForm, text: string) {
    const code = text.trim().toUpperCase();
    bill.currency = this.knownCurrency(code) ? code : text.trim();
  }

  showPaidLine(bill: BillForm): boolean {
    const walletCode = this.walletCurrency(bill);
    return !!walletCode && walletCode !== bill.currency;
  }

  private shareRows(
    form: BillForm,
  ): { user_id: string; share: number }[] | null {
    const rows = rowsToShares(form.bearers);
    return rows.length > 0 ? rows : null;
  }

  private pickInitialGroup() {
    const first = this.myGroups()[0];
    if (first) this.groupId.set(first.tb_tyapp_usr_grp_id);
  }

  private memberIds(groupId: string): string[] {
    if (!groupId) return [];
    return [
      ...new Set(
        this.users
          .groupMembers()
          .filter((member) => member.group_id === groupId)
          .map((member) => member.user_id),
      ),
    ];
  }

  private defaultBearers(): BearerPercent[] {
    const ids = this.orderIds(this.memberIds(this.groupId()));
    return ids.length === 2 ? equalBearerRows(ids) : [];
  }

  private orderIds(ids: readonly string[]): string[] {
    const wanted = new Set(ids);
    const known = this.users
      .users()
      .filter((user) => wanted.has(user.user_id) && !user.deleted_at)
      .sort((a, b) =>
        formatUserDisplayName(a).localeCompare(formatUserDisplayName(b)),
      )
      .map((user) => user.user_id);
    const missing = ids.filter((id) => !known.includes(id));
    return [...known, ...missing];
  }

  private groupForBearers(ids: readonly string[]): string {
    const hit = this.myGroups().find((group) => {
      const members = new Set(this.memberIds(group.tb_tyapp_usr_grp_id));
      return ids.length > 0 && ids.every((id) => members.has(id));
    });
    return hit?.tb_tyapp_usr_grp_id ?? this.groupId();
  }

  /** Old rows with no share table still mean: one owner, or the two appsheet people. */
  private bearersForExisting(
    bill: YyemsBill,
    shares: YyemsBillShare[] | null,
  ): BearerPercent[] {
    if (shares && shares.length > 0) {
      const ordered = this.orderIds(shares.map((row) => row.user_id));
      const byId = new Map(shares.map((row) => [row.user_id, Number(row.share)]));
      return percentsFromShares(
        ordered.map((userId) => ({
          user_id: userId,
          share: byId.get(userId) ?? 0,
        })),
      );
    }
    if (bill.ownership_user_id) return equalBearerRows([bill.ownership_user_id]);
    const appsheet = this.orderIds(
      this.users
        .users()
        .filter((user) => !!user.appsheet_525_user_id && !user.deleted_at)
        .map((user) => user.user_id),
    );
    if (appsheet.length === 2) return equalBearerRows(appsheet);
    return this.defaultBearers();
  }

  private syncLookupLabels(form: BillForm | null) {
    if (!form) return;
    const vendor = this.yyems.vendors().find((row) => row.tb_tyapp_yvd_id === form.vendor_id);
    const wallet = this.yyems.wallets().find((row) => row.tb_tyapp_ywl_id === form.wallet_id);
    this.vendorQuery.set(vendor?.name ?? '');
    this.walletQuery.set(wallet?.name ?? '');
  }

  private filterChoices<T>(
    rows: readonly T[],
    query: string,
    exact: (row: T) => string,
    haystack: (row: T) => string,
  ): T[] {
    const q = query.trim().toLowerCase();
    const isExact = rows.some((row) => exact(row).toLowerCase() === q);
    if (!q || isExact) return rows.slice(0, 60);
    return rows
      .filter((row) => haystack(row).toLowerCase().includes(q))
      .slice(0, 60);
  }

  walletCurrency(bill: BillForm): string {
    const wallet = this.yyems
      .wallets()
      .find((row) => row.tb_tyapp_ywl_id === bill.wallet_id);
    if (!wallet) return '';
    const account = this.yyems
      .financialAccounts()
      .find((row) => row.tb_tyapp_yfa_id === wallet.financial_account_id);
    return account?.currency ?? '';
  }

  fxHint(bill: BillForm): { text: string; off: boolean; suggest: number | null } | null {
    const walletCurrency = this.walletCurrency(bill);
    if (!walletCurrency || walletCurrency === bill.currency) return null;
    const parsed = Number(bill.occurred_local.slice(0, 4));
    const year = Number.isInteger(parsed) ? parsed : new Date().getFullYear();
    return billFxHint({
      rates: this.yyems.fxRates(),
      year,
      billCurrency: bill.currency,
      walletCurrency,
      amount: bill.amount,
      walletAmount: bill.wallet_amount,
    });
  }

  paidPlaceholder(bill: BillForm): string {
    const hint = this.fxHint(bill);
    if (!hint || hint.suggest == null) return 'paid';
    return hint.suggest.toFixed(2);
  }

  ngOnDestroy() {
    this.header.clear();
  }
}
