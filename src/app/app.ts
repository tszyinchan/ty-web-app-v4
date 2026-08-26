import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, map, startWith } from 'rxjs/operators';

import { DevHud } from './core/components/dev-hud/dev-hud';
import { DevHudService } from './core/services/dev-hud.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, DevHud],
  templateUrl: './app.html',
})
export class App {
  private readonly router = inject(Router);
  private readonly hud = inject(DevHudService);

  private readonly isPrintRoute = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => this.isDocsignPrint(event.urlAfterRedirects)),
      startWith(this.isDocsignPrint(this.router.url)),
    ),
    { initialValue: this.isDocsignPrint(this.router.url) },
  );

  readonly showHud = computed(
    () =>
      this.hud.enabled() &&
      this.hud.canShowOnThisApp() &&
      !this.isPrintRoute(),
  );

  private isDocsignPrint(url: string): boolean {
    return url.split('?')[0].includes('/docsign/print/');
  }
}
