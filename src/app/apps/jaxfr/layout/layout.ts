import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, map, startWith } from 'rxjs/operators';

import { AppSettingsService } from '../../../core/services/app-settings.service';
import { PushService } from '../../../core/services/push.service';
import { ThemeService } from '../../../core/services/theme.service';
import { AppToolbar } from '../../../core/components/app-toolbar/app-toolbar';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [AppToolbar, RouterOutlet],
  templateUrl: './layout.html',
  styleUrl: './layout.scss',
  host: {
    '[class.print-route]': 'isPrintRoute()',
    '[class.dl-route]': 'isDailyLogRoute()',
  },
})
export class Layout {
  private readonly router = inject(Router);
  private readonly theme = inject(ThemeService);

  constructor() {
    inject(PushService);
    inject(AppSettingsService);
  }

  readonly toolbarAppearance = computed(() =>
    this.theme.visualTheme() === 'aero' ? 'aero' : 'default',
  );

  readonly showHomeButton = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => this.isNotWelcome(event.urlAfterRedirects)),
      startWith(this.isNotWelcome(this.router.url)),
    ),
    { initialValue: this.isNotWelcome(this.router.url) },
  );

  readonly isPrintRoute = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => this.isDocsignPrint(event.urlAfterRedirects)),
      startWith(this.isDocsignPrint(this.router.url)),
    ),
    { initialValue: this.isDocsignPrint(this.router.url) },
  );

  readonly isDailyLogRoute = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => this.isDailyLog(event.urlAfterRedirects)),
      startWith(this.isDailyLog(this.router.url)),
    ),
    { initialValue: this.isDailyLog(this.router.url) },
  );

  readonly showToolbar = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => this.shouldShowToolbar(event.urlAfterRedirects)),
      startWith(this.shouldShowToolbar(this.router.url)),
    ),
    { initialValue: this.shouldShowToolbar(this.router.url) },
  );

  private isNotWelcome(url: string): boolean {
    const path = url.split('?')[0];
    return path !== '/' && path !== '/welcome';
  }

  private isDocsignPrint(url: string): boolean {
    return url.split('?')[0].includes('/docsign/print/');
  }

  private isDailyLog(url: string): boolean {
    return url.split('?')[0].startsWith('/daily-log');
  }

  private shouldShowToolbar(url: string): boolean {
    const path = url.split('?')[0];
    return (
      this.isNotWelcome(path) &&
      !this.isDocsignPrint(path) &&
      !this.isDailyLog(path)
    );
  }
}
