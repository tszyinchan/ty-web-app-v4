import { DATE_PIPE_DEFAULT_OPTIONS } from '@angular/common';
import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZoneChangeDetection,
  provideAppInitializer,
  inject,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { AuthService } from './core/services/auth.service';
import { DATE_DISPLAY_FORMAT } from './core/utils/date-time.util';
import { provideNativeDateAdapter } from '@angular/material/core';
import { DateAdapter, provideCalendar } from 'angular-calendar';
import { adapterFactory } from 'angular-calendar/date-adapters/date-fns';


export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideNativeDateAdapter(),
    {
      provide: DATE_PIPE_DEFAULT_OPTIONS,
      useValue: { dateFormat: DATE_DISPLAY_FORMAT },
    },
    provideAppInitializer(() => {
      const authService = inject(AuthService);
      return authService.init();
    }),
    provideCalendar({ provide: DateAdapter, useFactory: adapterFactory }),
  ],
};
