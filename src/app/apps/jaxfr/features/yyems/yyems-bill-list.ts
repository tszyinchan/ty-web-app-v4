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
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';

import { HeaderService } from '../../../../core/services/header.service';
import { UserService } from '../user/user.service';
import { toDateTimeLocalValue } from '../../../../core/utils/date-time.util';
import { YyemsService } from './yyems.service';
import { ownershipLabel } from './yyems.util';

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
    MatPaginatorModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './yyems-bill-list.html',
})
export class YyemsBillList implements OnInit, OnDestroy {
  readonly yyems = inject(YyemsService);
  private header = inject(HeaderService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private users = inject(UserService);

  searchQuery = signal('');
  pageSize = signal(50);
  pageIndex = signal(0);
  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  rows = computed(() => {
    const users = this.users.users();
    return this.yyems.bills().map((bill) => ({
      bill,
      vendorName: bill.vendor?.name || '—',
      walletName: bill.wallet?.name || '—',
      when: toDateTimeLocalValue(bill.occurred_at).replace('T', ' '),
      owner: ownershipLabel(bill.ownership_user_id, users),
    }));
  });

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

  onSearchChange() {
    this.pageIndex.set(0);
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => void this.reload(), 300);
  }

  onPageChange(event: PageEvent) {
    this.pageIndex.set(event.pageIndex);
    this.pageSize.set(event.pageSize);
    void this.reload();
  }

  private reload() {
    return this.yyems.fetchBills(
      this.pageIndex(),
      this.pageSize(),
      this.searchQuery(),
    );
  }

  ngOnDestroy() {
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.header.clear();
  }
}
