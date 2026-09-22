import { DATE_PIPE_DEFAULT_OPTIONS } from '@angular/common';
import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZoneChangeDetection,
  provideAppInitializer,
  inject,
} from '@angular/core';
import { provideRouter, withViewTransitions } from '@angular/router';
import { routes } from './app.routes';
import { SUBDOMAINS } from './app.constants';
import { AuthService } from './core/services/auth.service';
import { ThemeService } from './core/services/theme.service';
import { UserPreferenceService } from './apps/jaxfr/features/settings/user-preference.service';
import { getCurrentSubdomain } from './core/utils/app-env.util';
import { DATE_DISPLAY_FORMAT } from './core/utils/date-time.util';
import { provideNativeDateAdapter } from '@angular/material/core';
import { DateAdapter, provideCalendar } from 'angular-calendar';
import { adapterFactory } from 'angular-calendar/date-adapters/date-fns';


export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    // Native browser View Transitions API — no @angular/animations needed.
    // The visible crossfade is styled per-theme (Aero only) in
    // src/app/styles/_page-transition.scss; Angular just needs to wrap
    // navigations in document.startViewTransition() here. Browsers without
    // support (Firefox, older Safari) silently fall back to a normal
    // instant navigation — no error, no polyfill required.
    provideRouter(routes, withViewTransitions()),
    provideNativeDateAdapter(),
    {
      provide: DATE_PIPE_DEFAULT_OPTIONS,
      useValue: { dateFormat: DATE_DISPLAY_FORMAT },
    },
    provideAppInitializer(() => {
      inject(ThemeService);
      // time.tszyin.com is a public clock — skip auth/session entirely.
      if (getCurrentSubdomain() === SUBDOMAINS.TIME) {
        return;
      }
      const prefs = inject(UserPreferenceService);
      return inject(AuthService).init().then(() => prefs.syncWithAuth());
    }),
    provideCalendar({ provide: DateAdapter, useFactory: adapterFactory }),
  ],
};
