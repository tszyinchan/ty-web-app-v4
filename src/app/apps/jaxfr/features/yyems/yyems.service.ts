import { Injectable, NgZone, computed, inject, signal } from '@angular/core';

import { RecordStatus } from '../../../../core/models/status.enum';
import { NotificationService } from '../../../../core/services/notification.service';
import { SupabaseService } from '../../../../core/services/supabase.service';
import {
  YyemsBill,
  YyemsBillEmbed,
  YyemsBillShare,
  YyemsBuy,
  YyemsBuyEmbed,
  YyemsCurrency,
  YyemsEat,
  YyemsEatAmount,
  YyemsEatEmbed,
  YyemsFinancialAccount,
  YyemsFxRate,
  YyemsFridgeRow,
  YyemsFridgeRpcRow,
  YyemsItem,
  YyemsItemCategory,
  YyemsPrice,
  YyemsPriceWithVendor,
  YyemsVendor,
  YyemsVendorCategory,
  YyemsWallet,
} from './yyems.model';
import type { SplitCurrencyBreakdown } from './yyems.util';

const BUY_EMBED =
  '*, price:tyapp_yyhome_price(*, item:tyapp_yyhome_item(*), vendor:tyapp_yyhome_vendor(*))';

const BILL_EMBED =
  '*, vendor:tyapp_yyhome_vendor(*, category:tyapp_yyhome_vendor_category!category_id(display_name, level1, level2, level3)), wallet:tyapp_yyhome_wallet(*)';

const EAT_EMBED = `*, buy:tyapp_yyhome_buy(${BUY_EMBED})`;
const EAT_HOME_EMBED =
  '*, buy:tyapp_yyhome_buy(home_unit, price:tyapp_yyhome_price(item:tyapp_yyhome_item(name_zh, name_en)))';

@Injectable({ providedIn: 'root' })
export class YyemsService {
  private supabase = inject(SupabaseService).client;
  private notification = inject(NotificationService);
  private zone = inject(NgZone);

  loading = signal(false);
  dictsLoading = signal(false);
  fridgeLoading = signal(false);
  billsLoading = signal(false);
  homeLoading = signal(false);

  readonly busy = computed(
    () =>
      this.loading() ||
      this.dictsLoading() ||
      this.fridgeLoading() ||
      this.billsLoading() ||
      this.homeLoading(),
  );

  itemCategories = signal<YyemsItemCategory[]>([]);
  items = signal<YyemsItem[]>([]);
  vendorCategories = signal<YyemsVendorCategory[]>([]);
  vendors = signal<YyemsVendor[]>([]);
  financialAccounts = signal<YyemsFinancialAccount[]>([]);
  wallets = signal<YyemsWallet[]>([]);
  currencies = signal<YyemsCurrency[]>([]);
  fxRates = signal<YyemsFxRate[]>([]);

  fridgeRows = signal<YyemsFridgeRow[]>([]);
  bills = signal<YyemsBillEmbed[]>([]);
  billListCursor = signal({
    year: new Date().getFullYear(),
    month: new Date().getMonth(),
  });

  private dictsLoaded = false;
  private fridgeLoaded = false;

  async fetchDicts(force = false): Promise<void> {
    if (this.dictsLoaded && !force) return;
    this.dictsLoading.set(true);
    try {
      const [
        itemCategories,
        items,
        vendorCategories,
        vendors,
        financialAccounts,
        wallets,
        currencies,
        fxRates,
      ] = await Promise.all([
        this.supabase
          .from('tyapp_yyhome_item_category')
          .select('*')
          .is('deleted_at', null)
          .order('sort_order'),
        this.supabase
          .from('tyapp_yyhome_item')
          .select('*')
          .is('deleted_at', null)
          .order('name_zh'),
        this.supabase
          .from('tyapp_yyhome_vendor_category')
          .select('*')
          .is('deleted_at', null)
          .order('display_name'),
        this.supabase
          .from('tyapp_yyhome_vendor')
          .select('*')
          .is('deleted_at', null)
          .order('sort_order', { ascending: true, nullsFirst: false })
          .order('name'),
        this.supabase
          .from('tyapp_yyhome_financial_account')
          .select('*')
          .is('deleted_at', null)
          .order('display_name'),
        this.supabase
          .from('tyapp_yyhome_wallet')
          .select('*')
          .is('deleted_at', null)
          .order('sort_order', { ascending: true, nullsFirst: false })
          .order('name'),
        this.supabase.from('tyapp_yyhome_currency').select('*'),
        this.supabase
          .from('tyapp_yyhome_fx_rate')
          .select('*')
          .eq('status', RecordStatus.Active)
          .is('deleted_at', null),
      ]);
      const firstError =
        itemCategories.error ||
        items.error ||
        vendorCategories.error ||
        vendors.error ||
        financialAccounts.error ||
        wallets.error ||
        currencies.error ||
        fxRates.error;
      if (firstError) throw firstError;

      this.zone.run(() => {
        this.itemCategories.set((itemCategories.data as YyemsItemCategory[]) ?? []);
        this.items.set((items.data as YyemsItem[]) ?? []);
        this.vendorCategories.set(
          (vendorCategories.data as YyemsVendorCategory[]) ?? [],
        );
        this.vendors.set((vendors.data as YyemsVendor[]) ?? []);
        this.financialAccounts.set(
          (financialAccounts.data as YyemsFinancialAccount[]) ?? [],
        );
        this.wallets.set((wallets.data as YyemsWallet[]) ?? []);
        this.currencies.set((currencies.data as YyemsCurrency[]) ?? []);
        this.fxRates.set((fxRates.data as YyemsFxRate[]) ?? []);
        this.dictsLoaded = true;
        this.dictsLoading.set(false);
      });
    } catch (error: unknown) {
      this.notification.handleError('Fetch YYEMS dictionaries failed', error);
      this.zone.run(() => this.dictsLoading.set(false));
    }
  }

  async fetchFridge(force = false): Promise<void> {
    if (this.fridgeLoaded && !force) return;
    this.fridgeLoading.set(true);
    try {
      const { data, error } = await this.supabase.rpc('tyapp_yyhome_fridge');
      if (error) throw error;
      const rows = ((data as YyemsFridgeRpcRow[]) ?? []).map((row) =>
        this.fridgeRowFromRpc(row),
      );
      this.zone.run(() => {
        this.fridgeRows.set(rows);
        this.fridgeLoaded = true;
        this.fridgeLoading.set(false);
      });
    } catch (error: unknown) {
      this.notification.handleError('Fetch fridge failed', error);
      this.zone.run(() => this.fridgeLoading.set(false));
    }
  }

  private fridgeRowFromRpc(row: YyemsFridgeRpcRow): YyemsFridgeRow {
    const item: YyemsItem | null = row.item_id
      ? {
          tb_tyapp_yhit_id: row.item_id,
          tb_tyapp_yhit_seq_no: 0,
          legacy_id: null,
          category_id: '',
          name_zh: row.item_name_zh || '',
          name_en: row.item_name_en,
          food_category: null,
          description: null,
          plan_buy: false,
          status: RecordStatus.Active,
          created_at: '',
          updated_at: '',
          deleted_at: null,
        }
      : null;
    const vendor: YyemsVendor | null = row.vendor_id
      ? {
          tb_tyapp_yhvd_id: row.vendor_id,
          tb_tyapp_yhvd_seq_no: 0,
          legacy_id: null,
          category_id: '',
          name: row.vendor_name || '',
          name_short: null,
          sort_order: null,
          status: RecordStatus.Active,
          created_at: '',
          updated_at: '',
          deleted_at: null,
        }
      : null;
    const price: YyemsPrice | null = {
      tb_tyapp_yhpr_id: row.price_id,
      tb_tyapp_yhpr_seq_no: 0,
      legacy_id: null,
      priced_at: '',
      vendor_id: row.vendor_id,
      item_id: row.item_id || '',
      product_name: row.product_name,
      product_name_zh: row.product_name_zh,
      brand: row.brand,
      currency: 'CAD',
      packed_price: null,
      tax_rate: null,
      discount_rate: null,
      marked_price: null,
      marked_amount: null,
      marked_unit: null,
      packed_amount: null,
      packed_unit: null,
      tag: null,
      is_organic: null,
      has_msg: null,
      origin: null,
      barcode: null,
      barcode_type: null,
      remarks: null,
      nutri_basis_amount: null,
      nutri_basis_unit: null,
      protein_g: null,
      carb_g: null,
      fat_g: null,
      calories_kcal: null,
      fiber_g: null,
      sodium_mg: null,
      nutri_is_estimated: false,
      created_by: '',
      status: RecordStatus.Active,
      created_at: '',
      updated_at: '',
      deleted_at: null,
    };
    const buy: YyemsBuy = {
      tb_tyapp_yhby_id: row.tb_tyapp_yhby_id,
      tb_tyapp_yhby_seq_no: 0,
      legacy_id: null,
      price_id: row.price_id,
      yyhome_id: row.yyhome_id,
      paid: null,
      home_amount: Number(row.home_amount),
      home_unit: row.home_unit,
      marked_amount_count: null,
      expiry_date: row.expiry_date,
      remarks: null,
      paid_adjust_note: null,
      paid_adjust_reason: null,
      eat_priority: row.eat_priority,
      created_by: '',
      status: RecordStatus.Active,
      created_at: '',
      updated_at: '',
      deleted_at: null,
    };
    return {
      buy,
      price,
      item,
      vendor,
      eaten: Number(row.eaten),
      remaining: Number(row.remaining),
    };
  }

  /**
   * Split totals in Postgres (in/out/free; excludes Internal_transfer vendor).
   * Requires yyems-split.schema.patch.sql.
   */
  async fetchSplitGroupTotals(
    groupId: string,
    userA: string,
    userB: string,
  ): Promise<{
    currencies: SplitCurrencyBreakdown[];
    missingShareCount: number;
    unsetCount: number;
  } | null> {
    try {
      const { data, error } = await this.supabase.rpc(
        'tyapp_yyhome_split_group_totals',
        {
          p_group_id: groupId,
          p_user_a: userA,
          p_user_b: userB,
        },
      );
      if (error) throw error;
      const payload = data as {
        currencies?: SplitCurrencyBreakdown[];
        missingShareCount?: number;
        unsetCount?: number;
      } | null;
      if (!payload || !Array.isArray(payload.currencies)) return null;
      return {
        currencies: payload.currencies.map((row) => ({
          currency: row.currency,
          people: row.people,
          nets: row.nets,
          paid: row.paid ?? ([0, 0] as const),
          borne: row.borne ?? ([0, 0] as const),
          firstPaysSecond: row.firstPaysSecond,
          outsidePaid: row.outsidePaid,
        })),
        missingShareCount: Number(payload.missingShareCount ?? 0),
        unsetCount: Number(payload.unsetCount ?? 0),
      };
    } catch (error: unknown) {
      this.notification.handleError('Fetch split totals failed', error);
      return null;
    }
  }

  async queryBillsInRange(
    fromIso: string,
    toIsoExclusive: string,
  ): Promise<YyemsBillEmbed[]> {
    try {
      const { data, error } = await this.supabase
        .from('tyapp_yyhome')
        .select(BILL_EMBED)
        .is('deleted_at', null)
        .gte('occurred_at', fromIso)
        .lt('occurred_at', toIsoExclusive)
        .order('occurred_at', { ascending: false })
        .limit(2000);
      if (error) throw error;
      return (data as YyemsBillEmbed[]) ?? [];
    } catch (error: unknown) {
      this.notification.handleError('Fetch bills failed', error);
      return [];
    }
  }

  async fetchBills(fromIso: string, toIsoExclusive: string): Promise<void> {
    this.billsLoading.set(true);
    try {
      const { data, error } = await this.supabase
        .from('tyapp_yyhome')
        .select(BILL_EMBED)
        .is('deleted_at', null)
        .gte('occurred_at', fromIso)
        .lt('occurred_at', toIsoExclusive)
        .order('occurred_at', { ascending: false })
        .limit(2000);
      if (error) throw error;
      this.zone.run(() => {
        this.bills.set((data as YyemsBillEmbed[]) ?? []);
        this.billsLoading.set(false);
      });
    } catch (error: unknown) {
      this.notification.handleError('Fetch bills failed', error);
      this.zone.run(() => this.billsLoading.set(false));
    }
  }

  async fetchBillById(id: string): Promise<YyemsBillEmbed | null> {
    this.loading.set(true);
    try {
      const { data, error } = await this.supabase
        .from('tyapp_yyhome')
        .select(BILL_EMBED)
        .eq('tb_tyapp_yhm_id', id)
        .is('deleted_at', null)
        .maybeSingle();
      if (error) throw error;
      return this.zone.run(() => {
        this.loading.set(false);
        return (data as YyemsBillEmbed | null) ?? null;
      });
    } catch (error: unknown) {
      this.notification.handleError('Fetch bill failed', error);
      return this.zone.run(() => {
        this.loading.set(false);
        return null;
      });
    }
  }

  async fetchBuysForBill(billId: string): Promise<YyemsBuyEmbed[]> {
    try {
      const { data, error } = await this.supabase
        .from('tyapp_yyhome_buy')
        .select(BUY_EMBED)
        .eq('yyhome_id', billId)
        .is('deleted_at', null)
        .order('created_at');
      if (error) throw error;
      return (data as YyemsBuyEmbed[]) ?? [];
    } catch (error: unknown) {
      this.notification.handleError('Fetch buys failed', error);
      return [];
    }
  }

  async fetchBuyById(id: string): Promise<YyemsBuyEmbed | null> {
    this.loading.set(true);
    try {
      const { data, error } = await this.supabase
        .from('tyapp_yyhome_buy')
        .select(BUY_EMBED)
        .eq('tb_tyapp_yhby_id', id)
        .is('deleted_at', null)
        .maybeSingle();
      if (error) throw error;
      return this.zone.run(() => {
        this.loading.set(false);
        return (data as YyemsBuyEmbed | null) ?? null;
      });
    } catch (error: unknown) {
      this.notification.handleError('Fetch buy failed', error);
      return this.zone.run(() => {
        this.loading.set(false);
        return null;
      });
    }
  }

  async fetchEatAmountsForBuy(buyId: string): Promise<YyemsEatAmount[]> {
    try {
      const { data, error } = await this.supabase
        .from('tyapp_yyhome_eat')
        .select('tb_tyapp_yhet_id, buy_id, home_amount')
        .eq('buy_id', buyId)
        .is('deleted_at', null);
      if (error) throw error;
      return (data as YyemsEatAmount[]) ?? [];
    } catch (error: unknown) {
      this.notification.handleError('Fetch eat amounts failed', error);
      return [];
    }
  }

  async fetchEatById(id: string): Promise<YyemsEatEmbed | null> {
    this.loading.set(true);
    try {
      const { data, error } = await this.supabase
        .from('tyapp_yyhome_eat')
        .select(EAT_EMBED)
        .eq('tb_tyapp_yhet_id', id)
        .is('deleted_at', null)
        .maybeSingle();
      if (error) throw error;
      return this.zone.run(() => {
        this.loading.set(false);
        return (data as YyemsEatEmbed | null) ?? null;
      });
    } catch (error: unknown) {
      this.notification.handleError('Fetch eat failed', error);
      return this.zone.run(() => {
        this.loading.set(false);
        return null;
      });
    }
  }

  async fetchEatsForDate(eatDate: string): Promise<YyemsEatEmbed[]> {
    this.homeLoading.set(true);
    try {
      const { data, error } = await this.supabase
        .from('tyapp_yyhome_eat')
        .select(EAT_HOME_EMBED)
        .eq('eat_date', eatDate)
        .is('deleted_at', null)
        .order('meal');
      if (error) throw error;
      return this.zone.run(() => {
        this.homeLoading.set(false);
        return (data as YyemsEatEmbed[]) ?? [];
      });
    } catch (error: unknown) {
      this.notification.handleError('Fetch home day failed', error);
      return this.zone.run(() => {
        this.homeLoading.set(false);
        return [];
      });
    }
  }

  async fetchPricesForItem(itemId: string): Promise<YyemsPriceWithVendor[]> {
    try {
      const { data, error } = await this.supabase
        .from('tyapp_yyhome_price')
        .select('*, vendor:tyapp_yyhome_vendor(*)')
        .eq('item_id', itemId)
        .is('deleted_at', null)
        .order('priced_at', { ascending: false })
        .limit(25);
      if (error) throw error;
      return (data as YyemsPriceWithVendor[]) ?? [];
    } catch (error: unknown) {
      this.notification.handleError('Fetch prices failed', error);
      return [];
    }
  }

  async saveBill(row: Partial<YyemsBill>): Promise<YyemsBill | null> {
    const isNew = !row.tb_tyapp_yhm_id;
    const {
      tb_tyapp_yhm_seq_no: _seq,
      created_at: _c,
      updated_at: _u,
      deleted_at: _d,
      ...payload
    } = row;
    this.loading.set(true);
    const query = isNew
      ? this.supabase.from('tyapp_yyhome').insert(payload).select().single()
      : this.supabase
          .from('tyapp_yyhome')
          .update(payload)
          .eq('tb_tyapp_yhm_id', row.tb_tyapp_yhm_id)
          .select()
          .single();
    try {
      const { data, error } = await query;
      if (error) throw error;
      const saved = data as YyemsBill;
      this.zone.run(() => {
        this.loading.set(false);
        this.notification.showSuccess(isNew ? 'Bill created' : 'Bill saved');
      });
      return saved;
    } catch (error: unknown) {
      this.notification.handleError('Save bill failed', error);
      this.zone.run(() => this.loading.set(false));
      return null;
    }
  }

  async fetchSharesForBills(billIds: readonly string[]): Promise<YyemsBillShare[] | null> {
    if (billIds.length === 0) return [];
    const chunkSize = 200;
    const rows: YyemsBillShare[] = [];
    try {
      for (let index = 0; index < billIds.length; index += chunkSize) {
        const chunk = billIds.slice(index, index + chunkSize);
        const { data, error } = await this.supabase
          .from('tyapp_yyhome_bill_share')
          .select('*')
          .in('yyhome_id', [...chunk]);
        if (error) throw error;
        rows.push(...((data as YyemsBillShare[]) ?? []));
      }
      return rows;
    } catch (error: unknown) {
      if (!isMissingShareTable(error)) {
        this.notification.handleError('Fetch bill shares failed', error);
      }
      return null;
    }
  }

  async fetchBillShares(billId: string): Promise<YyemsBillShare[] | null> {
    try {
      const { data, error } = await this.supabase
        .from('tyapp_yyhome_bill_share')
        .select('*')
        .eq('yyhome_id', billId);
      if (error) throw error;
      return (data as YyemsBillShare[]) ?? [];
    } catch (error: unknown) {
      if (!isMissingShareTable(error)) {
        this.notification.handleError('Fetch bill shares failed', error);
      }
      return null;
    }
  }

  /** Replace the share set for one bill. Junction-style delete then insert. */
  async replaceBillShares(
    billId: string,
    rows: readonly { user_id: string; share: number }[],
  ): Promise<boolean> {
    try {
      const { error: deleteError } = await this.supabase
        .from('tyapp_yyhome_bill_share')
        .delete()
        .eq('yyhome_id', billId);
      if (deleteError) throw deleteError;
      if (rows.length === 0) return true;
      const { error } = await this.supabase.from('tyapp_yyhome_bill_share').insert(
        rows.map((row) => ({
          yyhome_id: billId,
          user_id: row.user_id,
          share: row.share,
        })),
      );
      if (error) throw error;
      return true;
    } catch (error: unknown) {
      const detail = isMissingShareTable(error)
        ? 'Run yyems-bill-share.schema.patch.sql in the SQL editor, then save again.'
        : error;
      this.notification.handleError('Save bill shares failed', detail);
      return false;
    }
  }

  async savePrice(row: Partial<YyemsPrice>): Promise<YyemsPrice | null> {
    const isNew = !row.tb_tyapp_yhpr_id;
    const {
      tb_tyapp_yhpr_seq_no: _seq,
      created_at: _c,
      updated_at: _u,
      deleted_at: _d,
      ...payload
    } = row;
    this.loading.set(true);
    const query = isNew
      ? this.supabase.from('tyapp_yyhome_price').insert(payload).select().single()
      : this.supabase
          .from('tyapp_yyhome_price')
          .update(payload)
          .eq('tb_tyapp_yhpr_id', row.tb_tyapp_yhpr_id)
          .select()
          .single();
    try {
      const { data, error } = await query;
      if (error) throw error;
      this.zone.run(() => {
        this.loading.set(false);
        this.notification.showSuccess(isNew ? 'Price created' : 'Price saved');
      });
      return data as YyemsPrice;
    } catch (error: unknown) {
      this.notification.handleError('Save price failed', error);
      this.zone.run(() => this.loading.set(false));
      return null;
    }
  }

  async saveBuy(row: Partial<YyemsBuy>): Promise<YyemsBuy | null> {
    const isNew = !row.tb_tyapp_yhby_id;
    const {
      tb_tyapp_yhby_seq_no: _seq,
      created_at: _c,
      updated_at: _u,
      deleted_at: _d,
      ...payload
    } = row;
    this.loading.set(true);
    const query = isNew
      ? this.supabase.from('tyapp_yyhome_buy').insert(payload).select().single()
      : this.supabase
          .from('tyapp_yyhome_buy')
          .update(payload)
          .eq('tb_tyapp_yhby_id', row.tb_tyapp_yhby_id)
          .select()
          .single();
    try {
      const { data, error } = await query;
      if (error) throw error;
      this.fridgeLoaded = false;
      this.zone.run(() => {
        this.loading.set(false);
        this.notification.showSuccess(isNew ? 'Buy created' : 'Buy saved');
      });
      return data as YyemsBuy;
    } catch (error: unknown) {
      this.notification.handleError('Save buy failed', error);
      this.zone.run(() => this.loading.set(false));
      return null;
    }
  }

  async saveEat(row: Partial<YyemsEat>): Promise<YyemsEat | null> {
    const isNew = !row.tb_tyapp_yhet_id;
    const {
      tb_tyapp_yhet_seq_no: _seq,
      created_at: _c,
      updated_at: _u,
      deleted_at: _d,
      ...payload
    } = row;
    this.loading.set(true);
    const query = isNew
      ? this.supabase.from('tyapp_yyhome_eat').insert(payload).select().single()
      : this.supabase
          .from('tyapp_yyhome_eat')
          .update(payload)
          .eq('tb_tyapp_yhet_id', row.tb_tyapp_yhet_id)
          .select()
          .single();
    try {
      const { data, error } = await query;
      if (error) throw error;
      this.fridgeLoaded = false;
      this.zone.run(() => {
        this.loading.set(false);
        this.notification.showSuccess(isNew ? 'Eat recorded' : 'Eat saved');
      });
      return data as YyemsEat;
    } catch (error: unknown) {
      this.notification.handleError('Save eat failed', error);
      this.zone.run(() => this.loading.set(false));
      return null;
    }
  }

  async saveItem(row: Partial<YyemsItem>): Promise<YyemsItem | null> {
    return this.saveDictRow(
      'tyapp_yyhome_item',
      'tb_tyapp_yhit_id',
      'tb_tyapp_yhit_seq_no',
      row,
      'Item',
    ) as Promise<YyemsItem | null>;
  }

  async saveVendor(row: Partial<YyemsVendor>): Promise<YyemsVendor | null> {
    return this.saveDictRow(
      'tyapp_yyhome_vendor',
      'tb_tyapp_yhvd_id',
      'tb_tyapp_yhvd_seq_no',
      row,
      'Vendor',
    ) as Promise<YyemsVendor | null>;
  }

  /**
   * Wallet created from a bill. Reuses a financial account with the same
   * currency and owner (`null` = joint). Creates that account only when none exists.
   */
  async createWalletForBill(input: {
    name: string;
    currency: string;
    ownerUserId: string | null;
  }): Promise<YyemsWallet | null> {
    const name = input.name.trim();
    if (!name || !input.currency) return null;
    const existing = this.financialAccounts().find(
      (account) =>
        account.status === RecordStatus.Active &&
        account.currency === input.currency &&
        account.owner_user_id === input.ownerUserId,
    );
    let accountId = existing?.tb_tyapp_yhfa_id ?? null;
    if (!accountId) {
      this.loading.set(true);
      try {
        const { data, error } = await this.supabase
          .from('tyapp_yyhome_financial_account')
          .insert({
            display_name: name,
            currency: input.currency,
            owner_user_id: input.ownerUserId,
            status: RecordStatus.Active,
          })
          .select()
          .single();
        if (error) throw error;
        accountId = (data as YyemsFinancialAccount).tb_tyapp_yhfa_id;
        this.zone.run(() => this.loading.set(false));
      } catch (error: unknown) {
        this.notification.handleError('Create financial account failed', error);
        this.zone.run(() => this.loading.set(false));
        return null;
      }
    }
    const saved = await this.saveWallet({
      name,
      financial_account_id: accountId,
      remarks: null,
      sort_order: null,
      status: RecordStatus.Active,
    });
    if (!saved) return null;
    await this.fetchDicts(true);
    return saved;
  }

  /** CAD wallet whose financial account is owned by `userId`. Joint when userId is null. */
  async createOwnedCadWallet(
    userId: string | null,
    label: string,
  ): Promise<string | null> {
    this.loading.set(true);
    try {
      const { data: accountRow, error: accountError } = await this.supabase
        .from('tyapp_yyhome_financial_account')
        .insert({
          display_name: label,
          currency: 'CAD',
          owner_user_id: userId,
          status: RecordStatus.Active,
        })
        .select()
        .single();
      if (accountError) throw accountError;
      const account = accountRow as YyemsFinancialAccount;
      const { data: walletRow, error: walletError } = await this.supabase
        .from('tyapp_yyhome_wallet')
        .insert({
          name: label,
          financial_account_id: account.tb_tyapp_yhfa_id,
          status: RecordStatus.Active,
        })
        .select()
        .single();
      if (walletError) throw walletError;
      this.dictsLoaded = false;
      await this.fetchDicts(true);
      const wallet = walletRow as YyemsWallet;
      this.zone.run(() => {
        this.loading.set(false);
        this.notification.showSuccess('Test wallet created');
      });
      return wallet.tb_tyapp_yhwl_id;
    } catch (error: unknown) {
      this.notification.handleError('Create test wallet failed', error);
      this.zone.run(() => this.loading.set(false));
      return null;
    }
  }

  async saveWallet(row: Partial<YyemsWallet>): Promise<YyemsWallet | null> {
    return this.saveDictRow(
      'tyapp_yyhome_wallet',
      'tb_tyapp_yhwl_id',
      'tb_tyapp_yhwl_seq_no',
      row,
      'Wallet',
    ) as Promise<YyemsWallet | null>;
  }

  async saveItemCategory(
    row: Partial<YyemsItemCategory>,
  ): Promise<YyemsItemCategory | null> {
    return this.saveDictRow(
      'tyapp_yyhome_item_category',
      'tb_tyapp_yhic_id',
      'tb_tyapp_yhic_seq_no',
      row,
      'Product category',
    ) as Promise<YyemsItemCategory | null>;
  }

  async saveVendorCategory(
    row: Partial<YyemsVendorCategory>,
  ): Promise<YyemsVendorCategory | null> {
    return this.saveDictRow(
      'tyapp_yyhome_vendor_category',
      'tb_tyapp_yhvc_id',
      'tb_tyapp_yhvc_seq_no',
      row,
      'Vendor category',
    ) as Promise<YyemsVendorCategory | null>;
  }

  async saveFinancialAccount(
    row: Partial<YyemsFinancialAccount>,
  ): Promise<YyemsFinancialAccount | null> {
    return this.saveDictRow(
      'tyapp_yyhome_financial_account',
      'tb_tyapp_yhfa_id',
      'tb_tyapp_yhfa_seq_no',
      row,
      'Account',
    ) as Promise<YyemsFinancialAccount | null>;
  }

  async saveFxRate(row: Partial<YyemsFxRate>): Promise<YyemsFxRate | null> {
    return this.saveDictRow(
      'tyapp_yyhome_fx_rate',
      'tb_tyapp_yhfx_id',
      'tb_tyapp_yhfx_seq_no',
      row,
      'FX rate',
    ) as Promise<YyemsFxRate | null>;
  }

  async saveCurrency(row: YyemsCurrency, isNew: boolean): Promise<YyemsCurrency | null> {
    const payload = {
      code: row.code.trim().toUpperCase(),
      symbol: row.symbol.trim(),
    };
    if (!payload.code || !payload.symbol) return null;
    this.loading.set(true);
    const query = isNew
      ? this.supabase.from('tyapp_yyhome_currency').insert(payload).select().single()
      : this.supabase
          .from('tyapp_yyhome_currency')
          .update({ symbol: payload.symbol })
          .eq('code', payload.code)
          .select()
          .single();
    try {
      const { data, error } = await query;
      if (error) throw error;
      this.dictsLoaded = false;
      this.zone.run(() => {
        this.loading.set(false);
        this.notification.showSuccess(isNew ? 'Currency created' : 'Currency saved');
      });
      return data as YyemsCurrency;
    } catch (error: unknown) {
      this.notification.handleError('Save currency failed', error);
      this.zone.run(() => this.loading.set(false));
      return null;
    }
  }

  private async saveDictRow(
    table: string,
    idCol: string,
    seqCol: string,
    row: object,
    label: string,
  ): Promise<object | null> {
    const payload: Record<string, unknown> = { ...row };
    const isNew = !payload[idCol];
    delete payload[seqCol];
    delete payload['created_at'];
    delete payload['updated_at'];
    delete payload['deleted_at'];
    this.loading.set(true);
    const query = isNew
      ? this.supabase.from(table).insert(payload).select().single()
      : this.supabase.from(table).update(payload).eq(idCol, payload[idCol]).select().single();
    try {
      const { data, error } = await query;
      if (error) throw error;
      this.dictsLoaded = false;
      this.zone.run(() => {
        this.loading.set(false);
        this.notification.showSuccess(isNew ? `${label} created` : `${label} saved`);
      });
      return data as object;
    } catch (error: unknown) {
      this.notification.handleError(`Save ${label.toLowerCase()} failed`, error);
      this.zone.run(() => this.loading.set(false));
      return null;
    }
  }

  async deleteBill(id: string): Promise<boolean> {
    return this.rpcDelete('tyapp_yyhome_soft_delete_single_record', id, 'Bill', () => {
      this.bills.update((list) => list.filter((b) => b.tb_tyapp_yhm_id !== id));
    });
  }

  async deleteBuy(id: string): Promise<boolean> {
    return this.rpcDelete('tyapp_yyhome_buy_soft_delete_single_record', id, 'Buy', () => {
      this.fridgeLoaded = false;
    });
  }

  async deleteEat(id: string): Promise<boolean> {
    return this.rpcDelete('tyapp_yyhome_eat_soft_delete_single_record', id, 'Eat', () => {
      this.fridgeLoaded = false;
    });
  }

  async deleteItem(id: string): Promise<boolean> {
    return this.softDeleteRow('tyapp_yyhome_item', 'tb_tyapp_yhit_id', id, 'Item');
  }

  async deleteVendor(id: string): Promise<boolean> {
    return this.softDeleteRow('tyapp_yyhome_vendor', 'tb_tyapp_yhvd_id', id, 'Vendor');
  }

  async deleteWallet(id: string): Promise<boolean> {
    return this.softDeleteRow('tyapp_yyhome_wallet', 'tb_tyapp_yhwl_id', id, 'Wallet');
  }

  async deleteItemCategory(id: string): Promise<boolean> {
    return this.softDeleteRow(
      'tyapp_yyhome_item_category',
      'tb_tyapp_yhic_id',
      id,
      'Product category',
    );
  }

  async deleteVendorCategory(id: string): Promise<boolean> {
    return this.softDeleteRow(
      'tyapp_yyhome_vendor_category',
      'tb_tyapp_yhvc_id',
      id,
      'Vendor category',
    );
  }

  async deleteFinancialAccount(id: string): Promise<boolean> {
    return this.softDeleteRow(
      'tyapp_yyhome_financial_account',
      'tb_tyapp_yhfa_id',
      id,
      'Account',
    );
  }

  async deleteFxRate(id: string): Promise<boolean> {
    return this.softDeleteRow('tyapp_yyhome_fx_rate', 'tb_tyapp_yhfx_id', id, 'FX rate');
  }

  private async rpcDelete(
    fn: string,
    record_id: string,
    label: string,
    onOk: () => void,
  ): Promise<boolean> {
    this.loading.set(true);
    try {
      const { error } = await this.supabase.rpc(fn, { record_id });
      if (error) throw error;
      return this.zone.run(() => {
        onOk();
        this.loading.set(false);
        this.notification.showSuccess(`${label} deleted`);
        return true;
      });
    } catch (error: unknown) {
      this.notification.handleError(`Delete ${label.toLowerCase()} failed`, error);
      return this.zone.run(() => {
        this.loading.set(false);
        return false;
      });
    }
  }

  private async softDeleteRow(
    table: string,
    idCol: string,
    id: string,
    label: string,
  ): Promise<boolean> {
    this.loading.set(true);
    try {
      const { error } = await this.supabase
        .from(table)
        .update({ deleted_at: new Date().toISOString(), status: RecordStatus.Inactive })
        .eq(idCol, id)
        .is('deleted_at', null);
      if (error) throw error;
      this.dictsLoaded = false;
      return this.zone.run(() => {
        this.loading.set(false);
        this.notification.showSuccess(`${label} deleted`);
        return true;
      });
    } catch (error: unknown) {
      this.notification.handleError(`Delete ${label.toLowerCase()} failed`, error);
      return this.zone.run(() => {
        this.loading.set(false);
        return false;
      });
    }
  }
}

function isMissingShareTable(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const row = error as { code?: unknown; message?: unknown };
  const code = String(row.code ?? '');
  const message = String(row.message ?? '');
  return (
    code === 'PGRST205' ||
    code === '42P01' ||
    message.includes('tyapp_yyhome_bill_share')
  );
}
