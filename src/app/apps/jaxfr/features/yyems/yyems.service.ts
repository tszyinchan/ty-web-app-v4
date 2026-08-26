import { Injectable, NgZone, computed, inject, signal } from '@angular/core';

import { RecordStatus } from '../../../../core/models/status.enum';
import { NotificationService } from '../../../../core/services/notification.service';
import { SupabaseService } from '../../../../core/services/supabase.service';
import {
  YyemsBill,
  YyemsBillEmbed,
  YyemsBuy,
  YyemsBuyEmbed,
  YyemsCurrency,
  YyemsEat,
  YyemsEatAmount,
  YyemsEatEmbed,
  YyemsFinancialAccount,
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

const BUY_EMBED =
  '*, price:tyapp_yyems_price(*, item:tyapp_yyems_item(*), vendor:tyapp_yyems_vendor(*))';

const BILL_EMBED =
  '*, vendor:tyapp_yyems_vendor(*), wallet:tyapp_yyems_wallet(*)';

const EAT_EMBED = `*, buy:tyapp_yyems_buy(${BUY_EMBED})`;
const EAT_HOME_EMBED =
  '*, buy:tyapp_yyems_buy(home_unit, price:tyapp_yyems_price(item:tyapp_yyems_item(name_zh, name_en)))';

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

  fridgeRows = signal<YyemsFridgeRow[]>([]);
  bills = signal<YyemsBillEmbed[]>([]);
  billTotal = signal(0);

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
      ] = await Promise.all([
        this.supabase
          .from('tyapp_yyems_item_category')
          .select('*')
          .is('deleted_at', null)
          .order('sort_order'),
        this.supabase
          .from('tyapp_yyems_item')
          .select('*')
          .is('deleted_at', null)
          .order('name_zh'),
        this.supabase
          .from('tyapp_yyems_vendor_category')
          .select('*')
          .is('deleted_at', null)
          .order('display_name'),
        this.supabase
          .from('tyapp_yyems_vendor')
          .select('*')
          .is('deleted_at', null)
          .order('name'),
        this.supabase
          .from('tyapp_yyems_financial_account')
          .select('*')
          .is('deleted_at', null)
          .order('display_name'),
        this.supabase
          .from('tyapp_yyems_wallet')
          .select('*')
          .is('deleted_at', null)
          .order('name'),
        this.supabase.from('tyapp_yyems_currency').select('*'),
      ]);
      const firstError =
        itemCategories.error ||
        items.error ||
        vendorCategories.error ||
        vendors.error ||
        financialAccounts.error ||
        wallets.error ||
        currencies.error;
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
      const { data, error } = await this.supabase.rpc('tyapp_yyems_fridge');
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
          tb_tyapp_yit_id: row.item_id,
          tb_tyapp_yit_seq_no: 0,
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
          tb_tyapp_yvd_id: row.vendor_id,
          tb_tyapp_yvd_seq_no: 0,
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
      tb_tyapp_ypr_id: row.price_id,
      tb_tyapp_ypr_seq_no: 0,
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
      tb_tyapp_yby_id: row.tb_tyapp_yby_id,
      tb_tyapp_yby_seq_no: 0,
      legacy_id: null,
      price_id: row.price_id,
      yyems_id: row.yyems_id,
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

  async fetchBills(page = 0, pageSize = 50, search = ''): Promise<void> {
    this.billsLoading.set(true);
    try {
      const from = page * pageSize;
      const to = from + pageSize - 1;
      const safe = search.trim().replace(/[%*,()]/g, ' ').slice(0, 80);
      let query = this.supabase
        .from('tyapp_yyems')
        .select(BILL_EMBED, { count: 'exact' })
        .is('deleted_at', null)
        .order('occurred_at', { ascending: false })
        .range(from, to);
      if (safe) {
        query = query.or(
          `remark.ilike.%${safe}%,description.ilike.%${safe}%`,
        );
      }
      const { data, error, count } = await query;
      if (error) throw error;
      this.zone.run(() => {
        this.bills.set((data as YyemsBillEmbed[]) ?? []);
        this.billTotal.set(count ?? 0);
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
        .from('tyapp_yyems')
        .select(BILL_EMBED)
        .eq('tb_tyapp_yym_id', id)
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
        .from('tyapp_yyems_buy')
        .select(BUY_EMBED)
        .eq('yyems_id', billId)
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
        .from('tyapp_yyems_buy')
        .select(BUY_EMBED)
        .eq('tb_tyapp_yby_id', id)
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
        .from('tyapp_yyems_eat')
        .select('tb_tyapp_yet_id, buy_id, home_amount')
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
        .from('tyapp_yyems_eat')
        .select(EAT_EMBED)
        .eq('tb_tyapp_yet_id', id)
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
        .from('tyapp_yyems_eat')
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
        .from('tyapp_yyems_price')
        .select('*, vendor:tyapp_yyems_vendor(*)')
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
    const isNew = !row.tb_tyapp_yym_id;
    const {
      tb_tyapp_yym_seq_no: _seq,
      created_at: _c,
      updated_at: _u,
      deleted_at: _d,
      ...payload
    } = row;
    this.loading.set(true);
    const query = isNew
      ? this.supabase.from('tyapp_yyems').insert(payload).select().single()
      : this.supabase
          .from('tyapp_yyems')
          .update(payload)
          .eq('tb_tyapp_yym_id', row.tb_tyapp_yym_id)
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

  async savePrice(row: Partial<YyemsPrice>): Promise<YyemsPrice | null> {
    const isNew = !row.tb_tyapp_ypr_id;
    const {
      tb_tyapp_ypr_seq_no: _seq,
      created_at: _c,
      updated_at: _u,
      deleted_at: _d,
      ...payload
    } = row;
    this.loading.set(true);
    const query = isNew
      ? this.supabase.from('tyapp_yyems_price').insert(payload).select().single()
      : this.supabase
          .from('tyapp_yyems_price')
          .update(payload)
          .eq('tb_tyapp_ypr_id', row.tb_tyapp_ypr_id)
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
    const isNew = !row.tb_tyapp_yby_id;
    const {
      tb_tyapp_yby_seq_no: _seq,
      created_at: _c,
      updated_at: _u,
      deleted_at: _d,
      ...payload
    } = row;
    this.loading.set(true);
    const query = isNew
      ? this.supabase.from('tyapp_yyems_buy').insert(payload).select().single()
      : this.supabase
          .from('tyapp_yyems_buy')
          .update(payload)
          .eq('tb_tyapp_yby_id', row.tb_tyapp_yby_id)
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
    const isNew = !row.tb_tyapp_yet_id;
    const {
      tb_tyapp_yet_seq_no: _seq,
      created_at: _c,
      updated_at: _u,
      deleted_at: _d,
      ...payload
    } = row;
    this.loading.set(true);
    const query = isNew
      ? this.supabase.from('tyapp_yyems_eat').insert(payload).select().single()
      : this.supabase
          .from('tyapp_yyems_eat')
          .update(payload)
          .eq('tb_tyapp_yet_id', row.tb_tyapp_yet_id)
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
      'tyapp_yyems_item',
      'tb_tyapp_yit_id',
      'tb_tyapp_yit_seq_no',
      row,
      'Item',
    ) as Promise<YyemsItem | null>;
  }

  async saveVendor(row: Partial<YyemsVendor>): Promise<YyemsVendor | null> {
    return this.saveDictRow(
      'tyapp_yyems_vendor',
      'tb_tyapp_yvd_id',
      'tb_tyapp_yvd_seq_no',
      row,
      'Vendor',
    ) as Promise<YyemsVendor | null>;
  }

  async saveWallet(row: Partial<YyemsWallet>): Promise<YyemsWallet | null> {
    return this.saveDictRow(
      'tyapp_yyems_wallet',
      'tb_tyapp_ywl_id',
      'tb_tyapp_ywl_seq_no',
      row,
      'Wallet',
    ) as Promise<YyemsWallet | null>;
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
    return this.rpcDelete('tyapp_yyems_soft_delete_single_record', id, 'Bill', () => {
      this.bills.update((list) => list.filter((b) => b.tb_tyapp_yym_id !== id));
    });
  }

  async deleteBuy(id: string): Promise<boolean> {
    return this.rpcDelete('tyapp_yyems_buy_soft_delete_single_record', id, 'Buy', () => {
      this.fridgeLoaded = false;
    });
  }

  async deleteEat(id: string): Promise<boolean> {
    return this.rpcDelete('tyapp_yyems_eat_soft_delete_single_record', id, 'Eat', () => {
      this.fridgeLoaded = false;
    });
  }

  async deleteItem(id: string): Promise<boolean> {
    return this.softDeleteRow('tyapp_yyems_item', 'tb_tyapp_yit_id', id, 'Item');
  }

  async deleteVendor(id: string): Promise<boolean> {
    return this.softDeleteRow('tyapp_yyems_vendor', 'tb_tyapp_yvd_id', id, 'Vendor');
  }

  async deleteWallet(id: string): Promise<boolean> {
    return this.softDeleteRow('tyapp_yyems_wallet', 'tb_tyapp_ywl_id', id, 'Wallet');
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
