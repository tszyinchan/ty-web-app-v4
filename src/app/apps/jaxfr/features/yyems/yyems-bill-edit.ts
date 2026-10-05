import { CommonModule } from '@angular/common';
import {
  Component,
  DoCheck,
  ElementRef,
  HostListener,
  Injector,
  OnDestroy,
  OnInit,
  afterNextRender,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { NgZone } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';

import { RecordStatus } from '../../../../core/models/status.enum';
import { AuthService } from '../../../../core/services/auth.service';
import {
  HeaderAction,
  HeaderService,
} from '../../../../core/services/header.service';
import { formatUserDisplayName } from '../../../../core/pipes/display-name.pipe';
import { UserService } from '../user/user.service';
import {
  fromDateTimeLocalValue,
  toDateTimeLocalValue,
} from '../../../../core/utils/date-time.util';
import {
  YYEMS_IN_OR_OUT,
  YYEMS_MEALS,
  YYEMS_OWNERSHIP,
  YyemsBill,
  YyemsBuy,
  YyemsBuyEmbed,
  YyemsInOrOut,
  YyemsItem,
  YyemsLocationTz,
  YyemsOwnership,
  YyemsPrice,
} from './yyems.model';
import { YyemsService } from './yyems.service';
import { YyemsVendorEdit } from './yyems-vendor-edit';
import { YyemsWalletEdit } from './yyems-wallet-edit';
import {
  billFxHint,
  itemLabel,
  sortByOrderThenName,
} from './yyems.util';

interface QuickBuyForm {
  item_id: string;
  item_query: string;
  packed_price: number | null;
  packed_amount: number | null;
  packed_unit: string;
  home_amount: number | null;
  paid: number | null;
  expiry_date: string;
}

interface BillForm {
  tb_tyapp_yhbl_id?: string;
  occurred_local: string;
  location_tz: YyemsLocationTz;
  in_or_out: YyemsInOrOut;
  vendor_id: string;
  currency: string;
  amount: number | null;
  wallet_id: string;
  ownership: YyemsOwnership;
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
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    YyemsVendorEdit,
    YyemsWalletEdit,
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
  readonly YYEMS_OWNERSHIP = YYEMS_OWNERSHIP;
  readonly kindOptions = [
    { value: YYEMS_IN_OR_OUT.In, label: 'In' },
    { value: YYEMS_IN_OR_OUT.Out, label: 'Out' },
    { value: YYEMS_IN_OR_OUT.Free, label: 'Free' },
  ] as const;
  readonly tzOptions: { value: YyemsLocationTz; label: string }[] = [
    { value: 'TO', label: 'TO' },
    { value: 'HK', label: 'HK' },
  ];
  readonly commonCurrencies = ['CAD', 'HKD'] as const;
  readonly vendorPane = viewChild(YyemsVendorEdit);
  readonly walletPane = viewChild(YyemsWalletEdit);
  readonly billPane = viewChild<ElementRef<HTMLElement>>('billPane');
  readonly currencyOtherInput = viewChild<ElementRef<HTMLInputElement>>('currencyOtherInput');
  readonly buyItemInput = viewChild<ElementRef<HTMLInputElement>>('buyItemInput');

  billNudge = signal(0);
  billTweening = signal(false);

  private injector = inject(Injector);
  private zone = inject(NgZone);
  private readonly seatMs = 520;
  narrow = signal(false);
  private narrowQuery = window.matchMedia('(max-width: 768px)');
  private onNarrow = (event: MediaQueryListEvent) => {
    this.narrow.set(event.matches);
    if (!this.quickKind()) return;
    if (event.matches) this.queueQuickHeader();
    else this.applyBillHeader();
  };
  readonly itemLabel = itemLabel;

  currentId: string | null = null;
  item = signal<BillForm | null>(null);
  buys = signal<YyemsBuyEmbed[]>([]);
  quickBuy = signal<QuickBuyForm>(this.newQuickBuy());

  filteredBuyItems = computed(() => {
    const q = this.quickBuy().item_query.toLowerCase().trim();
    const items = this.yyems.items();
    if (!q) return items.slice(0, 50);
    return items.filter((it) => itemLabel(it).toLowerCase().includes(q)).slice(0, 50);
  });

  private newQuickBuy(): QuickBuyForm {
    return {
      item_id: '',
      item_query: '',
      packed_price: null,
      packed_amount: null,
      packed_unit: '',
      home_amount: null,
      paid: null,
      expiry_date: '',
    };
  }

  async onQuickBuyItemSelect(item: YyemsItem) {
    const bill = this.item();
    if (!bill) return;

    const qb = this.quickBuy();
    qb.item_id = item.tb_tyapp_yhit_id;
    qb.item_query = itemLabel(item);

    // Auto-prefill from last price at this vendor
    const prices = await this.yyems.fetchPricesForItem(item.tb_tyapp_yhit_id);
    const lastAtVendor = prices.find((p) => p.vendor_id === bill.vendor_id && p.currency === bill.currency);
    const lastAny = prices[0];
    const best = lastAtVendor || lastAny;

    if (best) {
      qb.packed_price = best.packed_price;
      qb.packed_amount = best.packed_amount;
      qb.packed_unit = best.packed_unit || '';
      // Default buy amount to same as packed
      if (qb.home_amount === null) qb.home_amount = best.packed_amount;
      if (qb.paid === null) qb.paid = best.packed_price;
    }
  }

  async addQuickBuy() {
    const bill = this.item();
    const qb = this.quickBuy();
    const userId = this.auth.userProfile()?.user_id;
    if (!this.currentId || !bill || !qb.item_id || !userId || qb.home_amount === null) return;

    // 1. Get or Create Price
    let priceId = '';
    const priceCriteria = {
      item_id: qb.item_id,
      vendor_id: bill.vendor_id || null,
      currency: bill.currency,
      packed_price: qb.packed_price,
      packed_amount: qb.packed_amount,
      packed_unit: qb.packed_unit.trim() || null,
    };

    const existingPrice = await this.yyems.findPrice(priceCriteria);
    if (existingPrice) {
      priceId = existingPrice.tb_tyapp_yhpr_id;
    } else {
      const newPrice = await this.yyems.savePrice({
        ...priceCriteria,
        priced_at: new Date().toISOString(),
        created_by: userId,
        nutri_is_estimated: false,
      });
      if (!newPrice) return;
      priceId = newPrice.tb_tyapp_yhpr_id;
    }

    // 2. Create Buy
    const savedBuy = await this.yyems.saveBuy({
      price_id: priceId,
      bill_id: this.currentId,
      paid: qb.paid,
      home_amount: qb.home_amount,
      home_unit: qb.packed_unit.trim() || null,
      expiry_date: qb.expiry_date || null,
      created_by: userId,
    });

    if (savedBuy) {
      // Refresh buys list
      this.buys.set(await this.yyems.fetchBuysForBill(this.currentId));
      // Reset form and focus back to item input
      this.quickBuy.set(this.newQuickBuy());
      this.buyItemInput()?.nativeElement.focus();
    }
  }

  async deleteBuy(id: string) {
    if (!confirm('Delete this line item?')) return;
    const ok = await this.yyems.deleteBuy(id);
    if (ok) {
      this.buys.set(this.buys().filter((b) => b.tb_tyapp_yhby_id !== id));
    }
  }

  vendorQuery = signal('');
  walletQuery = signal('');
  currencyOtherOpen = signal(false);
  currencyOtherQuery = signal('');
  quickKind = signal<'vendor' | 'wallet' | null>(null);
  quickLeaving = signal(false);
  quickVendorName = signal('');
  quickWalletName = signal('');
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

  /** AppSheet Ownership buttons: cty / frd display names + Both. */
  ownershipOptions = computed(() => {
    const byCode = (code: string) =>
      this.users
        .users()
        .find(
          (user) =>
            !user.deleted_at &&
            (user.appsheet_525_user_id || '').trim().toLowerCase() === code,
        ) ?? null;
    const cty = byCode(YYEMS_OWNERSHIP.Cty);
    const frd = byCode(YYEMS_OWNERSHIP.Frd);
    return [
      {
        value: YYEMS_OWNERSHIP.Cty as YyemsOwnership,
        label: cty ? formatUserDisplayName(cty) : 'cty',
      },
      {
        value: YYEMS_OWNERSHIP.Frd as YyemsOwnership,
        label: frd ? formatUserDisplayName(frd) : 'frd',
      },
      { value: YYEMS_OWNERSHIP.Yyems as YyemsOwnership, label: 'Both' },
    ];
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
      !current.ownership;
    if (this.isSaveDisabled() !== disabled) this.isSaveDisabled.set(disabled);
  }

  async ngOnInit() {
    this.narrow.set(this.narrowQuery.matches);
    this.narrowQuery.addEventListener('change', this.onNarrow);
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
      this.groupId.set(bill.group_id || this.groupId());
      this.syncLookupLabels(this.item());
      this.noteMore(this.item());
      this.currencyOtherOpen.set(false);
      this.currencyOtherQuery.set('');
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
        ownership: YYEMS_OWNERSHIP.Yyems,
        remark: '',
        description: '',
        reconciled: false,
        wallet_amount: null,
        period_start: '',
        period_end: '',
      });
      this.vendorQuery.set('');
      this.walletQuery.set('');
      this.currencyOtherOpen.set(false);
      this.currencyOtherQuery.set('');
      this.moreOpen.set(false);
    }
    this.originalDataStr.set(JSON.stringify(this.item()));
    this.applyBillHeader();
  }

  private applyBillHeader() {
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
      tb_tyapp_yhbl_id: bill.tb_tyapp_yhbl_id,
      occurred_local: toDateTimeLocalValue(bill.occurred_at),
      location_tz: bill.location_tz,
      in_or_out: bill.in_or_out,
      vendor_id: bill.vendor_id,
      currency: bill.currency,
      amount: bill.amount,
      wallet_id: bill.wallet_id,
      ownership: bill.ownership || YYEMS_OWNERSHIP.Yyems,
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
      tb_tyapp_yhbl_id: form.tb_tyapp_yhbl_id,
      occurred_at: occurred,
      location_tz: form.location_tz,
      in_or_out: form.in_or_out,
      ownership: form.ownership,
      vendor_id: form.vendor_id,
      currency: form.currency,
      amount: form.amount,
      wallet_id: form.wallet_id,
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
    const saved = await this.yyems.saveBill(payload);
    if (!saved) return;
    this.currentId = saved.tb_tyapp_yhbl_id;
    this.item.update((cur) =>
      cur ? { ...cur, tb_tyapp_yhbl_id: saved.tb_tyapp_yhbl_id } : cur,
    );
    this.originalDataStr.set(JSON.stringify(this.item()));
    this.isDirty.set(false);
    void this.router.navigate(['/yyems/bills/edit', saved.tb_tyapp_yhbl_id], {
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
    this.groupId.set((event.target as HTMLSelectElement).value);
  }

  setOwnership(bill: BillForm, value: YyemsOwnership) {
    bill.ownership = value;
  }

  knownCurrency(code: string): boolean {
    return this.yyems.currencies().some((row) => row.code === code);
  }

  isOtherCurrency(code: string): boolean {
    return !!code && code !== 'CAD' && code !== 'HKD';
  }

  setTz(bill: BillForm, tz: YyemsLocationTz) {
    bill.location_tz = tz;
  }

  setCommonCurrency(bill: BillForm, code: 'CAD' | 'HKD') {
    bill.currency = code;
    this.currencyOtherOpen.set(false);
    this.currencyOtherQuery.set('');
  }

  openCurrencyOther(bill: BillForm) {
    this.currencyOtherOpen.set(true);
    this.currencyOtherQuery.set(this.isOtherCurrency(bill.currency) ? bill.currency : '');
    afterNextRender(
      () => this.currencyOtherInput()?.nativeElement.focus(),
      { injector: this.injector },
    );
  }

  onCurrencyOtherPicked(bill: BillForm, code: string) {
    const next = code.trim().toUpperCase();
    if (!this.knownCurrency(next)) return;
    bill.currency = next;
    this.currencyOtherOpen.set(false);
    this.currencyOtherQuery.set('');
  }

  confirmCurrencyOther(bill: BillForm, event: Event) {
    event.preventDefault();
    this.onCurrencyOtherPicked(bill, this.currencyOtherQuery());
  }

  otherCurrencyChoices(query: string) {
    const rows = this.yyems
      .currencies()
      .filter((row) => row.code !== 'CAD' && row.code !== 'HKD')
      .sort((a, b) => a.code.localeCompare(b.code));
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
    bill.vendor_id = hit?.tb_tyapp_yhvd_id ?? '';
  }

  onWalletQuery(bill: BillForm, text: string) {
    this.walletQuery.set(text);
    const hit = this.sortedWallets().find(
      (row) => row.name.toLowerCase() === text.trim().toLowerCase(),
    );
    bill.wallet_id = hit?.tb_tyapp_yhwl_id ?? '';
  }

  private quickTimer = 0;

  openQuickVendor() {
    const typed = this.vendorQuery().trim();
    const exists = this.sortedVendors().some(
      (row) => row.name.toLowerCase() === typed.toLowerCase(),
    );
    this.quickVendorName.set(exists ? '' : typed);
    this.seatGuest('vendor');
  }

  openQuickWallet() {
    const typed = this.walletQuery().trim();
    const exists = this.sortedWallets().some(
      (row) => row.name.toLowerCase() === typed.toLowerCase(),
    );
    this.quickWalletName.set(exists ? '' : typed);
    this.seatGuest('wallet');
  }

  private seatGuest(kind: 'vendor' | 'wallet') {
    const from = this.billLeft();
    this.quickLeaving.set(false);
    this.quickKind.set(kind);
    this.queueQuickHeader();
    afterNextRender(() => this.scootBill(from), { injector: this.injector });
  }

  closeQuick() {
    if (!this.quickKind() || this.quickLeaving()) return;
    // Drop quick-open layout immediately so the bill can scoot back to
    // center while the guest panel is still sliding out (desktop).
    const from = this.billLeft();
    this.quickLeaving.set(true);
    afterNextRender(() => this.scootBill(from), { injector: this.injector });
    window.clearTimeout(this.quickTimer);
    this.quickTimer = window.setTimeout(() => this.finishQuick(), this.seatMs + 40);
  }

  onQuickDone(event: AnimationEvent) {
    if (event.target !== event.currentTarget || !this.quickLeaving()) return;
    if (
      !event.animationName.includes('guest-out') &&
      !event.animationName.includes('quick-panel-down')
    ) {
      return;
    }
    this.finishQuick();
  }

  private finishQuick() {
    window.clearTimeout(this.quickTimer);
    const wasNarrow = this.narrow();
    this.quickKind.set(null);
    this.quickLeaving.set(false);
    if (wasNarrow) this.applyBillHeader();
    // Bill already scooted on closeQuick (desktop); mobile never nudged.
  }

  private billLeft(): number {
    return this.billPane()?.nativeElement.getBoundingClientRect().left ?? 0;
  }

  private scootBill(fromLeft: number) {
    if (this.narrow()) {
      this.billNudge.set(0);
      this.billTweening.set(false);
      return;
    }
    const to = this.billLeft();
    const delta = fromLeft - to;
    if (Math.abs(delta) < 1) {
      this.billNudge.set(0);
      this.billTweening.set(false);
      return;
    }
    this.billTweening.set(false);
    this.billNudge.set(delta);
    this.zone.runOutsideAngular(() => {
      requestAnimationFrame(() => {
        this.zone.run(() => {
          this.billTweening.set(true);
          this.billNudge.set(0);
        });
      });
    });
  }

  private queueQuickHeader(attempt = 0) {
    if (!this.narrow()) return;
    window.setTimeout(() => {
      if (!this.narrow() || !this.quickKind()) return;
      const pane = this.quickKind() === 'vendor' ? this.vendorPane() : this.walletPane();
      if (!pane) {
        if (attempt < 8) this.queueQuickHeader(attempt + 1);
        return;
      }
      this.header.setConfig({
        onBack: () => this.closeQuick(),
        title: this.quickKind() === 'vendor' ? 'New vendor' : 'New wallet',
        actions: [
          {
            label: 'Create',
            icon: 'check',
            type: 'primary',
            disabled: pane.isSaveDisabled,
            onClick: () => void pane.onSave(),
          },
        ],
      });
    }, 0);
  }

  onVendorCreated(saved: { tb_tyapp_yhvd_id: string; name: string }) {
    const bill = this.item();
    if (!bill) return;
    bill.vendor_id = saved.tb_tyapp_yhvd_id;
    this.vendorQuery.set(saved.name);
    this.closeQuick();
  }

  onWalletCreated(saved: { tb_tyapp_yhwl_id: string; name: string }) {
    const bill = this.item();
    if (!bill) return;
    bill.wallet_id = saved.tb_tyapp_yhwl_id;
    this.walletQuery.set(saved.name);
    this.closeQuick();
  }

  saveQuick() {
    const pane = this.quickKind() === 'vendor' ? this.vendorPane() : this.walletPane();
    void pane?.onSave();
  }

  quickSaveDisabled(): boolean {
    const pane = this.quickKind() === 'vendor' ? this.vendorPane() : this.walletPane();
    return pane?.isSaveDisabled() ?? true;
  }

  showPaidLine(bill: BillForm): boolean {
    const walletCode = this.walletCurrency(bill);
    return !!walletCode && walletCode !== bill.currency;
  }

  private pickInitialGroup() {
    const first = this.myGroups()[0];
    if (first) this.groupId.set(first.tb_tyapp_usr_grp_id);
  }

  private syncLookupLabels(form: BillForm | null) {
    if (!form) return;
    const vendor = this.yyems.vendors().find((row) => row.tb_tyapp_yhvd_id === form.vendor_id);
    const wallet = this.yyems.wallets().find((row) => row.tb_tyapp_yhwl_id === form.wallet_id);
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
      .find((row) => row.tb_tyapp_yhwl_id === bill.wallet_id);
    if (!wallet) return '';
    const account = this.yyems
      .financialAccounts()
      .find((row) => row.tb_tyapp_yhfa_id === wallet.financial_account_id);
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
    this.narrowQuery.removeEventListener('change', this.onNarrow);
    window.clearTimeout(this.quickTimer);
    this.header.clear();
  }
}
