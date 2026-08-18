import { Routes } from '@angular/router';

export const SETTINGS_ROUTES: Routes = [
  { path: '', redirectTo: 'notifications', pathMatch: 'full' },
  {
    path: 'notifications',
    loadComponent: () =>
      import('./notification-settings').then((m) => m.NotificationSettings),
  },
];
