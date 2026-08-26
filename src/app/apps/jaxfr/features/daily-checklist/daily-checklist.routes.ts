import { Routes } from '@angular/router';
import { DailyChecklistDashboard } from './daily-checklist-dashboard';
import { DailyChecklistItems } from './daily-checklist-items';
import { DailyChecklistPage } from './daily-checklist-page';
import { DailyChecklistShare } from './daily-checklist-share';
import { DailyChecklistShared } from './daily-checklist-shared';
import { DailyChecklistStandard } from './daily-checklist-standard';

export const DAILY_CHECKLIST_ROUTES: Routes = [
  {
    path: '',
    children: [
      { path: '', component: DailyChecklistPage },
      { path: 'dashboard', component: DailyChecklistDashboard },
      { path: 'standard', component: DailyChecklistStandard },
      { path: 'items', component: DailyChecklistItems },
      { path: 'share', component: DailyChecklistShare },
      { path: 'shared', component: DailyChecklistShared },
    ],
  },
];
