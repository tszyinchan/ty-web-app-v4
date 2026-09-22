export interface FeatureHubLink {
  title: string;
  icon: string;
  route: string;
  image?: string;
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
        image: '/icons/3d/calendar.png',
        route: '/work/attendance/list',
      },
      {
        title: 'Schedule',
        icon: 'calendar_month',
        image: '/icons/3d/clock.png',
        route: '/work/schedule/list',
      },
      {
        title: 'Jobs',
        icon: 'badge',
        image: '/icons/3d/badge.png',
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
        image: '/icons/3d/apps.png',
        route: '/development/app/list',
      },
      {
        title: 'Features',
        icon: 'category',
        image: '/icons/3d/features.png',
        route: '/development/feature/list',
      },
      {
        title: 'Logs',
        icon: 'history',
        image: '/icons/3d/analytics.png',
        route: '/development/log/list',
      },
    ],
  },
  user: {
    title: 'Users',
    links: [
      {
        title: 'Users',
        icon: 'people_outline',
        image: '/icons/3d/user.png',
        route: '/users/list',
      },
      {
        title: 'Groups',
        icon: 'groups',
        image: '/icons/3d/groups.png',
        route: '/users/groups/list',
      },
      {
        title: 'Invites',
        icon: 'mail_outline',
        image: '/icons/3d/mail.png',
        route: '/users/invites/list',
      },
    ],
  },
  yyems: {
    title: 'yyHome',
    links: [
      {
        title: 'Fridge',
        icon: 'kitchen',
        image: '/icons/3d/fridge.png',
        route: '/yyems/fridge',
      },
      {
        title: 'Kitchen',
        icon: 'restaurant',
        image: '/icons/3d/house.png',
        route: '/yyems/home',
      },
      {
        title: 'Bills',
        icon: 'receipt_long',
        image: '/icons/3d/payments.png',
        route: '/yyems/bills/list',
      },
      {
        title: 'Products',
        icon: 'shopping_basket',
        image: '/icons/3d/cart.png',
        route: '/yyems/items/list',
      },
      {
        title: 'Vendors',
        icon: 'storefront',
        image: '/icons/3d/store.png',
        route: '/yyems/vendors/list',
      },
      {
        title: 'Wallets',
        icon: 'account_balance_wallet',
        image: '/icons/3d/savings.png',
        route: '/yyems/wallets/list',
      },
    ],
  },
  archive: {
    title: 'Archive',
    links: [
      {
        title: 'YYEMS Analytics Overview',
        icon: 'analytics',
        image: '/icons/3d/analytics.png',
        route: '/archive/yy525/yyems-analytics/overview',
      },
      {
        title: 'YYEMS Analytics Monthly',
        icon: 'calendar_view_month',
        image: '/icons/3d/calendar.png',
        route: '/archive/yy525/yyems-analytics/monthly',
      },
      {
        title: 'Wealth Transactions',
        icon: 'payments',
        image: '/icons/3d/payments.png',
        route: '/archive/wealth/list',
      },
      {
        title: 'Wealth Snapshots',
        icon: 'savings',
        image: '/icons/3d/savings.png',
        route: '/archive/wealth/snapshots',
      },
    ],
  },
};
