import { Routes } from '@angular/router';
import { DailyChecklistDashboard } from './daily-checklist-dashboard';
import { DailyChecklistPage } from './daily-checklist-page';
import { DailyChecklistStandard } from './daily-checklist-standard';

export const DAILY_CHECKLIST_ROUTES: Routes = [
  {
    path: '',
    children: [
      { path: '', component: DailyChecklistPage },
      { path: 'dashboard', component: DailyChecklistDashboard },
      { path: 'standard', component: DailyChecklistStandard },
    ],
  },
];
