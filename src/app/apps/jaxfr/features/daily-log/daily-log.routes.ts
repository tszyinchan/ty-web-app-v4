import { Routes } from '@angular/router';
import { DailyLogLibrary } from './daily-log-library';
import { DailyLog } from './daily-log';
import { DailyLogNew } from './daily-log-new';
import { DailyLogOthers } from './daily-log-others';
import { DailyLogStats } from './daily-log-stats';
import { DailyLogTemplate } from './daily-log-template';
import { DailyLogViewers } from './daily-log-viewers';

export const DAILY_LOG_ROUTES: Routes = [
  {
    path: '',
    children: [
      { path: '', component: DailyLog },
      { path: 'new', component: DailyLogNew },
      { path: 'stats', component: DailyLogStats },
      { path: 'template', component: DailyLogTemplate },
      { path: 'library', component: DailyLogLibrary },
      { path: 'viewers', component: DailyLogViewers },
      { path: 'others', component: DailyLogOthers },
    ],
  },
];
