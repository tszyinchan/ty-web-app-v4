import { Component, inject, input, output } from '@angular/core';
import { RouterModule } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';

import { HeaderService, HeaderAction } from '../../services/header.service';

/**
 * Shared top toolbar driven by HeaderService.config(). Originally lived
 * inside jaxfr's Layout; extracted so any app/module can opt in to the same
 * title + action-button bar without re-implementing it. Usage is optional -
 * a page/module only needs to call HeaderService.setConfig()/clear() and
 * include <app-toolbar> in its own template.
 */
@Component({
  selector: 'app-toolbar',
  standalone: true,
  imports: [
    RouterModule,
    MatToolbarModule,
    MatIconModule,
    MatButtonModule,
    MatMenuModule,
    MatProgressSpinnerModule,
    MatSlideToggleModule,
  ],
  templateUrl: './app-toolbar.html',
  styleUrl: './app-toolbar.scss',
})
export class AppToolbar {
  public headerService = inject(HeaderService);

  showMenuButton = input(false);
  menuButtonClick = output<void>();

  showHomeButton = input(false);
  showSignOut = input(false);
  signOutClick = output<void>();

  getPrimaryActions(actions?: HeaderAction[]) {
    return (actions || []).filter((a) => a.type === 'primary');
  }

  getSecondaryActions(actions?: HeaderAction[]) {
    return (actions || []).filter((a) => a.type === 'secondary');
  }

  getToggleActions(actions?: HeaderAction[]) {
    return (actions || []).filter((a) => a.type === 'toggle');
  }

  getIconActions(actions?: HeaderAction[]) {
    return (actions || []).filter((a) => a.type === 'icon');
  }
}
