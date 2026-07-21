import { Routes } from '@angular/router';

export const YY525_ROUTES: Routes = [
  {
    path: '',
    children: [
      { path: '', redirectTo: 'yyems-analytics', pathMatch: 'full' },
      {
        path: 'yyems-analytics',
        children: [
          { path: '', redirectTo: 'overview', pathMatch: 'full' },
          { path: 'overview', loadComponent: () => import('./yyems-analytics-overview/yyems-analytics-overview').then(m => m.YyemsAnalyticsOverview) },
          { path: 'monthly', loadComponent: () => import('./yyems-analytics-monthly/yyems-analytics-monthly').then(m => m.YyemsAnalyticsMonthly) },
        ],
      },
    ],
  },
];
