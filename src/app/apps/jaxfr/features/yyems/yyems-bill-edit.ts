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
  YYEMS_OWNERSHIP_SHARED,
  YyemsBill,
  YyemsBuyEmbed,
  YyemsInOrOut,
  YyemsLocationTz,
} from './yyems.model';
import { YyemsService } from './yyems.service';
import { itemLabel, ownershipKey, ownershipKeyFromShares, ownershipUserIdFromKey, sortByOrderThenName } from './yyems.util';

interface BillForm {
  tb_tyapp_yym_id?: string;
  occurred_local: string;
  location_tz: YyemsLocationTz;
  in_or_out: YyemsInOrOut;
  vendor_id: string;
  currency: string;
  amount: number | null;
  wallet_id: string;
  ownership_key: string;
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

  readonly YYEMS_OWNERSHIP_SHARED = YYEMS_OWNERSHIP_SHARED;
  readonly YYEMS_IN_OR_OUT = YYEMS_IN_OR_OUT;
  readonly itemLabel = itemLabel;

  currentId: string | null = null;
  item = signal<BillForm | null>(null);
  buys = signal<YyemsBuyEmbed[]>([]);
  vendorQuery = signal('');
  walletQuery = signal('');
  originalDataStr = signal('');
  isDirty = signal(false);
  isSaveDisabled = signal(true);

  householdUsers = computed(() =>
    this.users
      .users()
      .filter((u) => !!u.appsheet_525_user_id)
      .sort((a, b) =>
        (a.appsheet_525_user_id ?? '').localeCompare(b.appsheet_525_user_id ?? ''),
      ),
  );

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
    ]);

    if (this.currentId) {
      const bill = await this.yyems.fetchBillById(this.currentId);
      if (!bill) {
        void this.router.navigateByUrl('/yyems/bills/list');
        return;
      }
      this.item.set(this.toForm(bill));
      const shares = await this.yyems.fetchBillShares(this.currentId);
      const shareKey = shares ? ownershipKeyFromShares(shares) : null;
      if (shareKey) {
        this.item.update((cur) => (cur ? { ...cur, ownership_key: shareKey } : cur));
      }
      this.syncLookupLabels(this.item());
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
        ownership_key: YYEMS_OWNERSHIP_SHARED,
        remark: '',
        description: '',
        reconciled: false,
        wallet_amount: null,
        period_start: '',
        period_end: '',
      });
      this.vendorQuery.set('');
      this.walletQuery.set('');
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
      ownership_key: ownershipKey(bill.ownership_user_id),
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
      ownership_user_id: ownershipUserIdFromKey(form.ownership_key),
      remark: form.remark.trim() || null,
      description: form.description.trim() || null,
      reconciled: form.reconciled,
      wallet_amount: this.showPaidLine(form) ? form.wallet_amount : null,
      period_start: form.period_start || null,
      period_end: form.period_end || null,
      created_by: userId,
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

  setOwner(bill: BillForm, key: string) {
    bill.ownership_key = key;
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
    if (form.ownership_key === YYEMS_OWNERSHIP_SHARED) {
      const people = this.householdUsers();
      if (people.length !== 2) return null;
      return people.map((user) => ({ user_id: user.user_id, share: 0.5 }));
    }
    if (!form.ownership_key) return null;
    return [{ user_id: form.ownership_key, share: 1 }];
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

  fxRateLabel(bill: BillForm): string {
    if (
      bill.wallet_amount == null ||
      bill.amount == null ||
      bill.amount === 0
    ) {
      return '';
    }
    const rate = bill.wallet_amount / bill.amount;
    return `Exchange rate: ${rate.toLocaleString('en-US', {
      maximumFractionDigits: 4,
    })}`;
  }

  ngOnDestroy() {
    this.header.clear();
  }
}
