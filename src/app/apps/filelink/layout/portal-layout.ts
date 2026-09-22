import { Component, computed, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { ThemeService } from '../../../core/services/theme.service';
import { AppToolbar } from '../../../core/components/app-toolbar/app-toolbar';

@Component({
  selector: 'app-portal-layout',
  standalone: true,
  imports: [RouterOutlet, AppToolbar],
  templateUrl: './portal-layout.html',
  styleUrl: './portal-layout.scss',
})
export class PortalLayout {
  private auth = inject(AuthService);
  private theme = inject(ThemeService);

  // Same pattern as jaxfr's Layout: aero chrome only when the user has
  // actually selected the Aero theme, never unconditionally.
  readonly toolbarAppearance = computed(() =>
    this.theme.visualTheme() === 'aero' ? 'aero' : 'default',
  );

  async onSignOut() {
    await this.auth.logout();
  }
}
