import { Routes } from '@angular/router';
import { Layout } from './apps/jaxfr/layout/layout';
import { authGuard } from './core/guards/auth.guard';
import { SUBDOMAINS } from './app.constants';
import { getCurrentSubdomain } from './core/utils/app-env.util';

const currentApp = getCurrentSubdomain();

const JAXFR_ROUTES: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./pages/login/login').then((m) => m.Login),
  },
  {
    path: '',
    component: Layout,
    canActivate: [authGuard],
    children: [
      {
        path: '',
        redirectTo: 'welcome',
        pathMatch: 'full',
      },
      {
        path: 'welcome',
        loadComponent: () =>
          import('./apps/jaxfr/pages/welcome/welcome').then((m) => m.Welcome),
      },
      {
        path: 'users',
        loadChildren: () =>
          import('./apps/jaxfr/features/user/user.routes').then(
            (m) => m.USER_ROUTES,
          ),
      },
      {
        path: 'development',
        children: [
          {
            path: 'category',
            loadChildren: () =>
              import('./apps/jaxfr/features/development/app-category/app-category.routes').then(
                (m) => m.APP_CATEGORY_ROUTES,
              ),
          },
          {
            path: 'function',
            loadChildren: () =>
              import('./apps/jaxfr/features/development/app-function/app-function.routes').then(
                (m) => m.APP_FUNCTION_ROUTES,
              ),
          },
          {
            path: 'log',
            loadChildren: () =>
              import('./apps/jaxfr/features/development/app-log/app-log.routes').then(
                (m) => m.APP_LOG_ROUTES,
              ),
          },
        ],
      },
      {
        path: 'article',
        loadChildren: () =>
          import('./apps/jaxfr/features/article/article.routes').then(
            (m) => m.ARTICLE_ROUTES,
          ),
      },
      {
        path: 'work',
        children: [
          {
            path: 'attendance',
            loadChildren: () =>
              import('./apps/jaxfr/features/work/work-attendance/work-attendance.routes').then(
                (m) => m.WORK_ATTENDANCE_ROUTES,
              ),
          },
          {
            path: 'schedule',
            loadChildren: () =>
              import('./apps/jaxfr/features/work/work-schedule/work-schedule.routes').then(
                (m) => m.WORK_SCHEDULE_ROUTES,
              ),
          },
          {
            path: 'employment',
            loadChildren: () =>
              import('./apps/jaxfr/features/work/work-employment/work-employment.routes').then(
                (m) => m.WORK_EMPLOYMENT_ROUTES,
              ),
          },
        ],
      },
      {
        path: 'fit',
        loadChildren: () =>
          import('./apps/jaxfr/features/fit/fit.routes').then(
            (m) => m.FIT_ROUTES,
          ),
      },
      {
        path: 'yy525',
        children: [
          {
            path: 'wash-log',
            loadChildren: () =>
              import('./apps/jaxfr/features/yy525/wash-log-view/wash-log.routes').then(
                (m) => m.WASH_LOG_ROUTES,
              ),
          },
        ],
      },
      {
        path: 'filelink',
        loadChildren: () =>
          import('./apps/jaxfr/features/filelink/filelink.routes').then(
            (m) => m.FILELINK_ROUTES,
          ),
      },
      {
        path: 'archive',
        children: [
          {
            path: 'tyweb',
            loadChildren: () =>
              import('./apps/jaxfr/archive/features/tyweb/tyweb.routes').then(
                (m) => m.TYWEB_ROUTES,
              ),
          },
          {
            path: 'yy525',
            loadChildren: () =>
              import('./apps/jaxfr/archive/features/yy525/yy525.routes').then(
                (m) => m.YY525_ROUTES,
              ),
          },
          {
            path: 'wealth',
            loadChildren: () =>
              import('./apps/jaxfr/archive/features/wealth/wealth.routes').then(
                (m) => m.WEALTH_ROUTES,
              ),
          },
        ],
      },
    ],
  },
  {
    path: '**',
    redirectTo: 'login',
  },
];

const FILELINK_ROUTES: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./pages/login/login').then((m) => m.Login),
  },
  {
    path: '',
    loadComponent: () =>
      import('./apps/filelink/layout/portal-layout').then(
        (m) => m.PortalLayout,
      ),
    canActivate: [authGuard],
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./apps/filelink/views/portal-view').then((m) => m.PortalView),
      },
      {
        path: 'item/:id',
        loadComponent: () =>
          import('./apps/filelink/views/item-detail').then((m) => m.ItemDetail),
      },
    ],
  },
  {
    path: '**',
    redirectTo: '',
  },
];

const routeMap: Record<string, Routes> = {
  [SUBDOMAINS.JAXFR]: JAXFR_ROUTES,
  [SUBDOMAINS.FILELINK]: FILELINK_ROUTES
};

export const routes: Routes = routeMap[currentApp] || JAXFR_ROUTES;