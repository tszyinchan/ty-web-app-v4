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

  private isNotWelcome(url: string): boolean {
    const path = url.split('?')[0];
    return path !== '/' && path !== '/welcome';
  }
}
