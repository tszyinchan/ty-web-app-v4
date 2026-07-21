import { CommonModule } from '@angular/common';
import {
  Component,
  OnInit,
  OnDestroy,
  inject,
  computed,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Router, ActivatedRoute } from '@angular/router';

import { HeaderService } from '../../../../core/services/header.service';
import { ArticleService } from './article.service';

@Component({
  selector: 'app-article-feed',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './article-feed.html',
})
export class ArticleFeed implements OnInit, OnDestroy {
  public articleService = inject(ArticleService);
  private headerService = inject(HeaderService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  visibleCount = signal<number>(10);

  feedVM = computed(() => {
    const publishedArticles = this.articleService
      .articles()
      .filter((a) => a.status === 1);
    return publishedArticles.slice(0, this.visibleCount());
  });

  hasMore = computed(() => {
    const totalPublished = this.articleService
      .articles()
      .filter((a) => a.status === 1).length;
    return this.feedVM().length < totalPublished;
  });

  ngOnInit() {
    this.headerService.setConfig({
      actions: [
        {
          label: 'Refresh',
          icon: 'refresh',
          type: 'secondary',
          onClick: () => this.onRefresh(),
        },
      ],
    });

    const savedCount = sessionStorage.getItem('feed_visible_count');
    if (savedCount) {
      this.visibleCount.set(parseInt(savedCount, 10));
      sessionStorage.removeItem('feed_visible_count');
    }

    this.articleService.fetchAllArticles().then(() => {
      const targetId = sessionStorage.getItem('feed_scroll_target');
      if (targetId) {
        setTimeout(() => {
          const el = document.getElementById(targetId);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });

            el.style.transition = 'box-shadow 0.5s';
            el.style.boxShadow = '0 0 0 4px var(--mat-sys-primary)';
            setTimeout(() => (el.style.boxShadow = 'none'), 1500);
          }
          sessionStorage.removeItem('feed_scroll_target');
        }, 100);
      }
    });
  }

  async onRefresh() {
    this.visibleCount.set(10);
    await this.articleService.fetchAllArticles(true);
  }

  loadMore() {
    this.visibleCount.update((c) => c + 10);
  }

  onEdit(articleId: string) {
    sessionStorage.setItem(
      'feed_visible_count',
      this.visibleCount().toString(),
    );
    sessionStorage.setItem('feed_scroll_target', articleId);

    this.router.navigate(['../edit', articleId], {
      relativeTo: this.route,
      queryParams: { returnUrl: '/article/feed' },
    });
  }

  ngOnDestroy() {
    this.headerService.clear();
  }
}
