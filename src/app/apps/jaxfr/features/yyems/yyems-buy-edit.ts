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
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';
import { MatSelectModule } from '@angular/material/select';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';

import { RecordStatus } from '../../../../core/models/status.enum';
import { AuthService } from '../../../../core/services/auth.service';
import {
  HeaderAction,
  HeaderService,
} from '../../../../core/services/header.service';
import {
  YyemsBuy,
  YyemsPrice,
  YyemsPriceWithVendor,
} from './yyems.model';
import { YyemsService } from './yyems.service';
import { itemLabel } from './yyems.util';

interface BuyForm {
  tb_tyapp_yby_id?: string;
  item_id: string;
  price_id: string;
  yyems_id: string;
  paid: number | null;
  home_amount: number | null;
  home_unit: string;
  expiry_date: string;
  remarks: string;
  eat_priority: number;
  use_new_price: boolean;
  packed_price: number | null;
  packed_amount: number | null;
  packed_unit: string;
  barcode: string;
  vendor_id: string;
  currency: string;
}

@Component({
  selector: 'app-yyems-buy-edit',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatRadioModule,
  ],
  templateUrl: './yyems-buy-edit.html',
})
export class YyemsBuyEdit implements OnInit, OnDestroy, DoCheck {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private header = inject(HeaderService);
  private auth = inject(AuthService);
  readonly yyems = inject(YyemsService);

  readonly itemLabel = itemLabel;

  currentId: string | null = null;
  item = signal<BuyForm | null>(null);
  prices = signal<YyemsPriceWithVendor[]>([]);
  itemFilter = signal('');
  originalDataStr = signal('');
  isDirty = signal(false);
  isSaveDisabled = signal(true);
  returnUrl = '/yyems/fridge';

  filteredItems = computed(() => {
    const q = this.itemFilter().toLowerCase().trim();
    const items = this.yyems.items();
    if (!q) return items.slice(0, 80);
    return items
      .filter((it) => itemLabel(it).toLowerCase().includes(q))
      .slice(0, 80);
  });

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
    const hasPrice = current.use_new_price
      ? current.packed_price !== null && current.packed_price !== undefined
      : !!current.price_id;
    const disabled =
      this.yyems.busy() ||
      (!!this.currentId && !currentlyDirty) ||
      !current.item_id ||
      !hasPrice ||
      current.home_amount === null ||
      current.home_amount === undefined;
    if (this.isSaveDisabled() !== disabled) this.isSaveDisabled.set(disabled);
  }

  async ngOnInit() {
    this.currentId = this.route.snapshot.paramMap.get('id');
    const billId = this.route.snapshot.queryParamMap.get('billId');
    this.returnUrl = billId
      ? `/yyems/bills/edit/${billId}`
      : '/yyems/fridge';

    await this.yyems.fetchDicts();

    if (this.currentId) {
      const buy = await this.yyems.fetchBuyById(this.currentId);
      if (!buy) {
        void this.router.navigateByUrl(this.returnUrl);
        return;
      }
      const itemId = buy.price?.item_id || '';
      this.item.set({
        tb_tyapp_yby_id: buy.tb_tyapp_yby_id,
        item_id: itemId,
        price_id: buy.price_id,
        yyems_id: buy.yyems_id || billId || '',
        paid: buy.paid,
        home_amount: buy.home_amount,
        home_unit: buy.home_unit || '',
        expiry_date: buy.expiry_date || '',
        remarks: buy.remarks || '',
        eat_priority: buy.eat_priority,
        use_new_price: false,
        packed_price: null,
        packed_amount: null,
        packed_unit: buy.home_unit || '',
        barcode: '',
        vendor_id: buy.price?.vendor_id || '',
        currency: buy.price?.currency || 'CAD',
      });
      if (itemId) this.prices.set(await this.yyems.fetchPricesForItem(itemId));
      if (buy.yyems_id) this.returnUrl = `/yyems/bills/edit/${buy.yyems_id}`;
    } else {
      this.item.set({
        item_id: '',
        price_id: '',
        yyems_id: billId || '',
        paid: null,
        home_amount: null,
        home_unit: '',
        expiry_date: '',
        remarks: '',
        eat_priority: 50,
        use_new_price: false,
        packed_price: null,
        packed_amount: null,
        packed_unit: '',
        barcode: '',
        vendor_id: '',
        currency: 'CAD',
      });
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
      label: this.currentId ? 'Save Changes' : 'Create Buy',
      icon: 'check',
      type: 'primary',
      disabled: this.isSaveDisabled,
      onClick: () => void this.onSave(),
    });
    this.header.setConfig({
      backLink: this.returnUrl,
      title: this.currentId ? 'Edit buy' : 'New buy',
      syncStatus: this.syncStatus,
      actions,
    });
  }

  async onItemChange(itemId: string) {
    const form = this.item();
    if (!form) return;
    form.item_id = itemId;
    form.price_id = '';
    this.prices.set(itemId ? await this.yyems.fetchPricesForItem(itemId) : []);
  }

  priceCaption(p: YyemsPriceWithVendor): string {
    const when = p.priced_at?.slice(0, 10) || '';
    const vendor = p.vendor?.name || 'no vendor';
    const price = p.packed_price ?? p.marked_price;
    return `${when} · ${vendor} · ${p.currency} ${price ?? '—'} · ${p.packed_amount ?? ''} ${p.packed_unit ?? ''}`;
  }

  async onSave() {
    const form = this.item();
    const userId = this.auth.userProfile()?.user_id;
    if (!form || !userId || form.home_amount === null) return;

    let priceId = form.price_id;
    if (form.use_new_price) {
      const pricePayload: Partial<YyemsPrice> = {
        priced_at: new Date().toISOString(),
        vendor_id: form.vendor_id || null,
        item_id: form.item_id,
        currency: form.currency || 'CAD',
        packed_price: form.packed_price,
        packed_amount: form.packed_amount,
        packed_unit: form.packed_unit.trim() || null,
        barcode: form.barcode.trim() || null,
        created_by: userId,
        status: RecordStatus.Active,
        nutri_is_estimated: false,
      };
      const savedPrice = await this.yyems.savePrice(pricePayload);
      if (!savedPrice) return;
      priceId = savedPrice.tb_tyapp_ypr_id;
    }
    if (!priceId) return;

    const payload: Partial<YyemsBuy> = {
      tb_tyapp_yby_id: form.tb_tyapp_yby_id,
      price_id: priceId,
      yyems_id: form.yyems_id || null,
      paid: form.paid,
      home_amount: form.home_amount,
      home_unit: form.home_unit.trim() || null,
      expiry_date: form.expiry_date || null,
      remarks: form.remarks.trim() || null,
      eat_priority: form.eat_priority || 50,
      created_by: userId,
      status: RecordStatus.Active,
    };
    const saved = await this.yyems.saveBuy(payload);
    if (!saved) return;
    this.originalDataStr.set(JSON.stringify(this.item()));
    this.isDirty.set(false);
    void this.router.navigateByUrl(this.returnUrl);
  }

  async onDelete() {
    if (!this.currentId) return;
    if (!confirm('Soft-delete this buy? Eat records that point at it will stay.')) {
      return;
    }
    const ok = await this.yyems.deleteBuy(this.currentId);
    if (ok) void this.router.navigateByUrl(this.returnUrl);
  }

  ngOnDestroy() {
    this.header.clear();
  }
}
