import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, map, startWith } from 'rxjs/operators';

import { AppSettingsService } from '../../../core/services/app-settings.service';
import { PushService } from '../../../core/services/push.service';
import { AppToolbar } from '../../../core/components/app-toolbar/app-toolbar';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [AppToolbar, RouterOutlet],
  templateUrl: './layout.html',
  styleUrl: './layout.scss',
  host: {
    '[class.print-route]': 'isPrintRoute()',
  },
})
export class Layout {
  private readonly router = inject(Router);

  constructor() {
    inject(PushService);
    inject(AppSettingsService);
  }

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

  private shouldShowToolbar(url: string): boolean {
    const path = url.split('?')[0];
    return this.isNotWelcome(path) && !this.isDocsignPrint(path);
  }
}
