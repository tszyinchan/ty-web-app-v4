import { Routes } from '@angular/router';
import { WashLogList } from './wash-log-list';
import { WashLogCalendar } from './wash-log-calendar';

export const WASH_LOG_ROUTES: Routes = [
  {
    path: '',
    children: [
      { path: '', redirectTo: 'list', pathMatch: 'full' },
      { path: 'list', component: WashLogList },
      { path: 'calendar', component: WashLogCalendar },
    ],
  },
];
