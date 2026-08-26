import { CommonModule } from '@angular/common';
import {
  Component,
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
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';

import { HeaderService } from '../../../../core/services/header.service';
import { UserService } from '../user/user.service';
import { localMonthUtcRange } from '../../../../core/utils/date-time.util';
import { YYEMS_IN_OR_OUT } from './yyems.model';
import { YyemsService } from './yyems.service';
import { buildBillLedger, formatYyemsAmount } from './yyems.util';

@Component({
  selector: 'app-yyems-bill-list',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './yyems-bill-list.html',
  styleUrl: './yyems-bill-list.scss',
})
export class YyemsBillList implements OnInit, OnDestroy {
  readonly yyems = inject(YyemsService);
  private header = inject(HeaderService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private users = inject(UserService);

  readonly formatAmount = formatYyemsAmount;
  readonly YYEMS_IN_OR_OUT = YYEMS_IN_OR_OUT;
  searchQuery = signal('');

  monthLabel = computed(() => {
    const { year, month } = this.yyems.billListCursor();
    return new Date(year, month, 1).toLocaleString('en-US', {
      month: 'short',
      year: 'numeric',
    });
  });

  ledger = computed(() =>
    buildBillLedger(
      this.yyems.bills(),
      this.users.users(),
      this.searchQuery(),
    ),
  );

  visibleCount = computed(() =>
    this.ledger().days.reduce((n, day) => n + day.rows.length, 0),
  );

  ngOnInit() {
    const isLoading = computed(
      () => this.yyems.billsLoading() || this.users.loading(),
    );
    this.header.setConfig({
      backLink: '/yyems',
      title: 'Bills',
      actions: [
        {
          label: 'Refresh',
          icon: 'refresh',
          type: 'secondary',
          disabled: isLoading,
          onClick: () => void this.reload(),
        },
        {
          label: 'New Bill',
          icon: 'add',
          type: 'primary',
          disabled: isLoading,
          onClick: () =>
            this.router.navigate(['../new'], { relativeTo: this.route }),
        },
      ],
    });
    void this.users.fetchAllUsers();
    void this.reload();
  }

  shiftMonth(delta: number) {
    const { year, month } = this.yyems.billListCursor();
    const next = new Date(year, month + delta, 1);
    this.yyems.billListCursor.set({
      year: next.getFullYear(),
      month: next.getMonth(),
    });
    void this.reload();
  }

  private reload() {
    const { year, month } = this.yyems.billListCursor();
    const range = localMonthUtcRange(year, month);
    return this.yyems.fetchBills(range.from, range.to);
  }

  ngOnDestroy() {
    this.header.clear();
  }
}
