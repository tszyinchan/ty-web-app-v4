import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

bootstrapApplication(App, appConfig)
  // Angular DI (and NotificationService) isn't available yet if bootstrap itself fails.
  // eslint-disable-next-line no-console
  .catch((err) => console.error(err));
