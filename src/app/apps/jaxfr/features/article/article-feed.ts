import { CommonModule } from '@angular/common';
import {
  Component,
  OnInit,
  OnDestroy,
  inject,
  computed,
  signal,
  viewChildren,
  ElementRef,
  Signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Router, ActivatedRoute } from '@angular/router';

import { HeaderService } from '../../../../core/services/header.service';
import { ArticleService } from './article.service';
import { RecordStatus } from '../../../../core/models/status.enum';

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
  styleUrl: './article-feed.scss',
})
export class ArticleFeed implements OnInit, OnDestroy {
  public articleService = inject(ArticleService);
  private headerService = inject(HeaderService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  visibleCount = signal<number>(10);
  highlightedId = signal<string | null>(null);
  cardRefs: Signal<ReadonlyArray<ElementRef<HTMLElement>>> = viewChildren(
    'cardRef',
    { read: ElementRef },
  );

  feedVM = computed(() => {
    const publishedArticles = this.articleService
      .articles()
      .filter((a) => a.status === RecordStatus.Active);
    return publishedArticles.slice(0, this.visibleCount());
  });

  hasMore = computed(() => {
    const totalPublished = this.articleService
      .articles()
      .filter((a) => a.status === RecordStatus.Active).length;
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
          const target = this.cardRefs().find(
            (ref) => ref.nativeElement.id === targetId,
          );
          if (target) {
            target.nativeElement.scrollIntoView({
              behavior: 'smooth',
              block: 'center',
            });

            this.highlightedId.set(targetId);

            setTimeout(() => this.highlightedId.set(null), 1500);
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
