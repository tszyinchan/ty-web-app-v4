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
import { MatSelectModule } from '@angular/material/select';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';

import { RecordStatus } from '../../../../core/models/status.enum';
import { AuthService } from '../../../../core/services/auth.service';
import {
  HeaderAction,
  HeaderService,
} from '../../../../core/services/header.service';
import { UserService } from '../user/user.service';
import { formatDate } from '../../../../core/utils/date-time.util';
import {
  YYEMS_EATEN_OTHER,
  YYEMS_MEALS,
  YyemsEat,
  YyemsMeal,
} from './yyems.model';
import { YyemsService } from './yyems.service';
import {
  eatenByKey,
  itemLabel,
  parseEatenByKey,
  remainingOf,
} from './yyems.util';

interface EatForm {
  tb_tyapp_yet_id?: string;
  buy_id: string;
  home_amount: number | null;
  meal: YyemsMeal;
  eaten_by_key: string;
  eat_date: string;
  description: string;
}

@Component({
  selector: 'app-yyems-eat-edit',
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
  ],
  templateUrl: './yyems-eat-edit.html',
  styleUrl: './yyems-eat-edit.scss',
})
export class YyemsEatEdit implements OnInit, OnDestroy, DoCheck {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private header = inject(HeaderService);
  private auth = inject(AuthService);
  readonly yyems = inject(YyemsService);
  readonly users = inject(UserService);

  readonly meals = YYEMS_MEALS;
  readonly YYEMS_EATEN_OTHER = YYEMS_EATEN_OTHER;
  readonly itemLabel = itemLabel;

  currentId: string | null = null;
  item = signal<EatForm | null>(null);
  buyLabel = signal('—');
  remaining = signal(0);
  originalDataStr = signal('');
  isDirty = signal(false);
  isSaveDisabled = signal(true);
  returnUrl = '/yyems/fridge';

  householdUsers = computed(() =>
    this.users.users().filter((u) => !!u.appsheet_525_user_id),
  );

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
    const amt = Number(current.home_amount);
    const disabled =
      this.yyems.busy() ||
      (!!this.currentId && !currentlyDirty) ||
      !current.buy_id ||
      !current.eat_date ||
      !current.meal ||
      !amt ||
      amt <= 0 ||
      amt > this.remaining() + 0.0001;
    if (this.isSaveDisabled() !== disabled) this.isSaveDisabled.set(disabled);
  }

  async ngOnInit() {
    this.currentId = this.route.snapshot.paramMap.get('id');
    const qBuy = this.route.snapshot.queryParamMap.get('buyId');
    const qMeal = this.route.snapshot.queryParamMap.get('meal') as YyemsMeal | null;
    const qDate = this.route.snapshot.queryParamMap.get('date');
    this.returnUrl = qDate ? `/yyems/home?date=${qDate}` : '/yyems/fridge';

    await this.users.fetchAllUsers();

    if (this.currentId) {
      const eat = await this.yyems.fetchEatById(this.currentId);
      if (!eat) {
        void this.router.navigateByUrl(this.returnUrl);
        return;
      }
      this.buyLabel.set(itemLabel(eat.buy?.price?.item));
      const amounts = await this.yyems.fetchEatAmountsForBuy(eat.buy_id);
      const buyAmt = Number(eat.buy?.home_amount ?? 0);
      this.remaining.set(remainingOf(buyAmt, amounts, eat.tb_tyapp_yet_id));
      this.item.set({
        tb_tyapp_yet_id: eat.tb_tyapp_yet_id,
        buy_id: eat.buy_id,
        home_amount: eat.home_amount,
        meal: eat.meal,
        eaten_by_key: eatenByKey(eat.eaten_by_user_id, eat.eaten_by_other),
        eat_date: eat.eat_date,
        description: eat.description || '',
      });
    } else {
      if (!qBuy) {
        void this.router.navigateByUrl('/yyems/fridge');
        return;
      }
      const buy = await this.yyems.fetchBuyById(qBuy);
      if (!buy) {
        void this.router.navigateByUrl('/yyems/fridge');
        return;
      }
      this.buyLabel.set(itemLabel(buy.price?.item));
      const amounts = await this.yyems.fetchEatAmountsForBuy(qBuy);
      this.remaining.set(remainingOf(Number(buy.home_amount), amounts));
      const me = this.auth.userProfile()?.user_id || YYEMS_EATEN_OTHER.Shared;
      this.item.set({
        buy_id: qBuy,
        home_amount: this.remaining(),
        meal: qMeal && this.meals.includes(qMeal) ? qMeal : '5晚',
        eaten_by_key: me,
        eat_date: qDate || formatDate(new Date()),
        description: '',
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
      label: this.currentId ? 'Save Changes' : 'Record Eat',
      icon: 'check',
      type: 'primary',
      disabled: this.isSaveDisabled,
      onClick: () => void this.onSave(),
    });
    this.header.setConfig({
      backLink: this.returnUrl,
      title: this.currentId ? 'Edit eat' : 'Eat',
      syncStatus: this.syncStatus,
      actions,
    });
  }

  async onSave() {
    const form = this.item();
    const userId = this.auth.userProfile()?.user_id;
    if (!form || !userId || form.home_amount === null) return;
    const who = parseEatenByKey(form.eaten_by_key);
    const payload: Partial<YyemsEat> = {
      tb_tyapp_yet_id: form.tb_tyapp_yet_id,
      buy_id: form.buy_id,
      home_amount: form.home_amount,
      meal: form.meal,
      eaten_by_user_id: who.eaten_by_user_id,
      eaten_by_other: who.eaten_by_other,
      eat_date: form.eat_date,
      added_at: new Date().toISOString(),
      description: form.description.trim() || null,
      created_by: userId,
      status: RecordStatus.Active,
    };
    const saved = await this.yyems.saveEat(payload);
    if (!saved) return;
    this.originalDataStr.set(JSON.stringify(this.item()));
    this.isDirty.set(false);
    void this.router.navigateByUrl(this.returnUrl);
  }

  async onDelete() {
    if (!this.currentId) return;
    if (!confirm('Soft-delete this eat record?')) return;
    const ok = await this.yyems.deleteEat(this.currentId);
    if (ok) void this.router.navigateByUrl(this.returnUrl);
  }

  ngOnDestroy() {
    this.header.clear();
  }
}
