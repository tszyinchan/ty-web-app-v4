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
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';

import { HeaderService } from '../../../../core/services/header.service';
import { UserService } from '../user/user.service';
import { formatDate, parseLocalDate } from '../../../../core/utils/date-time.util';
import {
  YYEMS_MEALS,
  YyemsEatEmbed,
  YyemsMeal,
} from './yyems.model';
import { YyemsService } from './yyems.service';
import { eatenByLabel, itemLabel, mealGroupTitle } from './yyems.util';

@Component({
  selector: 'app-yyems-home',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './yyems-home.html',
  styleUrl: './yyems-home.scss',
})
export class YyemsHome implements OnInit, OnDestroy {
  readonly yyems = inject(YyemsService);
  private header = inject(HeaderService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private users = inject(UserService);

  readonly meals = YYEMS_MEALS;
  readonly mealGroupTitle = mealGroupTitle;
  readonly itemLabel = itemLabel;

  viewDate = signal(formatDate(new Date()));
  eats = signal<YyemsEatEmbed[]>([]);

  grouped = computed(() => {
    const rows = this.eats();
    const users = this.users.users();
    return this.meals.map((meal) => ({
      meal,
      title: mealGroupTitle(meal),
      items: rows
        .filter((eat) => eat.meal === meal)
        .map((eat) => ({
          eat,
          label: itemLabel(eat.buy?.price?.item),
          who: eatenByLabel(eat, users),
        })),
    }));
  });

  ngOnInit() {
    const qDate = this.route.snapshot.queryParamMap.get('date');
    if (qDate) this.viewDate.set(qDate);

    this.header.setConfig({
      backLink: '/yyems',
      title: 'Home',
      actions: [
        {
          label: 'Today',
          icon: 'today',
          type: 'secondary',
          onClick: () => this.goDate(formatDate(new Date())),
        },
      ],
    });
    void this.users.fetchAllUsers();
    void this.reload();
  }

  shift(days: number) {
    const d = parseLocalDate(this.viewDate()) ?? new Date();
    d.setDate(d.getDate() + days);
    this.goDate(formatDate(d));
  }

  goDate(date: string) {
    this.viewDate.set(date);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { date },
      replaceUrl: true,
    });
    void this.reload();
  }

  addEat(meal: YyemsMeal) {
    void this.router.navigate(['/yyems/fridge'], {
      queryParams: { meal, date: this.viewDate() },
    });
  }

  private async reload() {
    this.eats.set(await this.yyems.fetchEatsForDate(this.viewDate()));
  }

  ngOnDestroy() {
    this.header.clear();
  }
}
