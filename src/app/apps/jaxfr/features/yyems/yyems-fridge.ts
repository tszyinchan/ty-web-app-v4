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
import { YyemsFridgeRow, YyemsMeal } from './yyems.model';
import { YyemsService } from './yyems.service';
import { fridgeSearchHaystack, itemLabel } from './yyems.util';

@Component({
  selector: 'app-yyems-fridge',
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
  templateUrl: './yyems-fridge.html',
  styleUrl: './yyems-fridge.scss',
})
export class YyemsFridge implements OnInit, OnDestroy {
  readonly yyems = inject(YyemsService);
  private header = inject(HeaderService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  searchQuery = signal('');
  readonly itemLabel = itemLabel;

  private presetMeal = this.route.snapshot.queryParamMap.get('meal');
  private presetDate = this.route.snapshot.queryParamMap.get('date');

  filtered = computed(() => {
    const q = this.searchQuery().toLowerCase().trim();
    const rows = this.yyems.fridgeRows();
    if (!q) return rows;
    return rows.filter((row) => fridgeSearchHaystack(row).includes(q));
  });

  ngOnInit() {
    const isLoading = computed(() => this.yyems.fridgeLoading());
    this.header.setConfig({
      backLink: '/yyems',
      title: 'Fridge',
      actions: [
        {
          label: 'Refresh',
          icon: 'refresh',
          type: 'secondary',
          disabled: isLoading,
          onClick: () => void this.yyems.fetchFridge(true),
        },
      ],
    });
    void this.yyems.fetchFridge();
  }

  eatQuery(row: YyemsFridgeRow) {
    const query: Record<string, string> = {
      buyId: row.buy.tb_tyapp_yby_id,
    };
    if (this.presetMeal) query['meal'] = this.presetMeal;
    if (this.presetDate) query['date'] = this.presetDate;
    return query;
  }

  goEat(row: YyemsFridgeRow) {
    void this.router.navigate(['/yyems/eats/new'], {
      queryParams: this.eatQuery(row),
    });
  }

  presetHint(): string | null {
    if (!this.presetMeal && !this.presetDate) return null;
    const bits = [this.presetDate, this.presetMeal as YyemsMeal | null].filter(
      Boolean,
    );
    return `Adding to ${bits.join(' · ')}`;
  }

  ngOnDestroy() {
    this.header.clear();
  }
}
