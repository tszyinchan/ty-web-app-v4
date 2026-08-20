export interface FeatureHubLink {
  title: string;
  icon: string;
  route: string;
}

export interface FeatureHubConfig {
  title: string;
  links: FeatureHubLink[];
}

export const FEATURE_HUBS: Record<string, FeatureHubConfig> = {
  work: {
    title: 'Work',
    links: [
      {
        title: 'Attendance',
        icon: 'event_available',
        route: '/work/attendance/list',
      },
      {
        title: 'Schedule',
        icon: 'calendar_month',
        route: '/work/schedule/list',
      },
      {
        title: 'Employment',
        icon: 'badge',
        route: '/work/employment/list',
      },
    ],
  },
  development: {
    title: 'Development',
    links: [
      {
        title: 'Apps',
        icon: 'apps',
        route: '/development/app/list',
      },
      {
        title: 'App Features',
        icon: 'category',
        route: '/development/feature/list',
      },
      {
        title: 'App Logs',
        icon: 'history',
        route: '/development/log/list',
      },
    ],
  },
  user: {
    title: 'User',
    links: [
      {
        title: 'Users',
        icon: 'people_outline',
        route: '/users/list',
      },
      {
        title: 'Groups',
        icon: 'groups',
        route: '/users/groups/list',
      },
    ],
  },
  archive: {
    title: 'Archive',
    links: [
      {
        title: 'YYEMS Analytics Overview',
        icon: 'analytics',
        route: '/archive/yy525/yyems-analytics/overview',
      },
      {
        title: 'YYEMS Analytics Monthly',
        icon: 'calendar_view_month',
        route: '/archive/yy525/yyems-analytics/monthly',
      },
      {
        title: 'Wealth Transactions',
        icon: 'payments',
        route: '/archive/wealth/list',
      },
      {
        title: 'Wealth Snapshots',
        icon: 'savings',
        route: '/archive/wealth/snapshots',
      },
    ],
  },
};
