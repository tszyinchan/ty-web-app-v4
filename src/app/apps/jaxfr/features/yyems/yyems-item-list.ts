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
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';

import { HeaderService } from '../../../../core/services/header.service';
import { YyemsService } from './yyems.service';
import { itemLabel } from './yyems.util';

@Component({
  selector: 'app-yyems-item-list',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatPaginatorModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './yyems-item-list.html',
})
export class YyemsItemList implements OnInit, OnDestroy {
  readonly yyems = inject(YyemsService);
  private header = inject(HeaderService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  readonly itemLabel = itemLabel;

  searchQuery = signal('');
  pageSize = signal(25);
  pageIndex = signal(0);

  filtered = computed(() => {
    const q = this.searchQuery().toLowerCase().trim();
    const cats = this.yyems.itemCategories();
    const rows = this.yyems.items().map((item) => ({
      item,
      cat: cats.find((c) => c.tb_tyapp_yic_id === item.category_id)?.name_zh || '',
    }));
    if (!q) return rows;
    return rows.filter((row) =>
      `${itemLabel(row.item)} ${row.cat}`.toLowerCase().includes(q),
    );
  });

  paged = computed(() => {
    const start = this.pageIndex() * this.pageSize();
    return this.filtered().slice(start, start + this.pageSize());
  });

  ngOnInit() {
    const isLoading = computed(() => this.yyems.dictsLoading());
    this.header.setConfig({
      backLink: '/yyems',
      title: 'Items',
      actions: [
        {
          label: 'New Item',
          icon: 'add',
          type: 'primary',
          disabled: isLoading,
          onClick: () =>
            this.router.navigate(['../new'], { relativeTo: this.route }),
        },
      ],
    });
    void this.yyems.fetchDicts();
  }

  onSearchChange() {
    this.pageIndex.set(0);
  }

  onPageChange(event: PageEvent) {
    this.pageIndex.set(event.pageIndex);
    this.pageSize.set(event.pageSize);
  }

  ngOnDestroy() {
    this.header.clear();
  }
}
