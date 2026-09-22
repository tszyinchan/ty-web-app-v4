/**
 * Welcome launcher registry. Keys must match `tyapp_app_feature.name`.
 * Update `shipped` in the same commit as the feature route/module.
 * Prefer matching display text in DB `name`; use `label` only for rare exceptions.
 */
export type LauncherGroup = 'features' | 'settings';

export interface LauncherRegistryEntry {
  image: string;
  group: LauncherGroup;
  shipped: boolean;
  label?: string;
}

export const LAUNCHER_REGISTRY: Record<string, LauncherRegistryEntry> = {
  Work: {
    image: '/icons/3d/work.png',
    group: 'features',
    shipped: true,
  },
  Article: {
    image: '/icons/3d/article.png',
    group: 'features',
    shipped: true,
  },
  Workout: {
    image: '/icons/3d/fit.png',
    group: 'features',
    shipped: true,
  },
  'Daily Log': {
    image: '/icons/3d/checklist.png',
    group: 'features',
    shipped: true,
  },
  Filelink: {
    image: '/icons/3d/filelink.png',
    group: 'features',
    shipped: true,
  },
  Tyweb: {
    image: '/icons/3d/web.png',
    group: 'features',
    shipped: true,
  },
  Chat: {
    image: '/icons/3d/chat.png',
    group: 'features',
    shipped: true,
  },
  DocSign: {
    image: '/icons/3d/docsign.png',
    group: 'features',
    shipped: true,
  },
  yyHome: {
    image: '/icons/3d/kitchen.png',
    group: 'features',
    shipped: true,
  },
  Settings: {
    image: '/icons/3d/settings.png',
    group: 'settings',
    shipped: true,
  },
  Users: {
    image: '/icons/3d/user.png',
    group: 'settings',
    shipped: true,
  },
  Development: {
    image: '/icons/3d/development.png',
    group: 'settings',
    shipped: true,
  },
};

export const ARCHIVE_IMAGES: Record<string, string> = {
  analytics: '/icons/3d/analytics.png',
  calendar_view_month: '/icons/3d/calendar.png',
  payments: '/icons/3d/payments.png',
  savings: '/icons/3d/savings.png',
};

export const HUB_ROUTES: Record<string, string> = {
  Work: '/work',
  Development: '/development',
  Users: '/users',
  yyHome: '/yyems',
  'Daily Log': '/daily-log',
};

export function launcherImage(name: string): string | null {
  return LAUNCHER_REGISTRY[name]?.image ?? null;
}

export function launcherGroup(name: string): LauncherGroup {
  return LAUNCHER_REGISTRY[name]?.group ?? 'features';
}

export function isLauncherShipped(name: string): boolean {
  const entry = LAUNCHER_REGISTRY[name];
  // Not in registry → treat as Coming soon (DB ahead of this build).
  if (!entry) return false;
  return entry.shipped;
}

export function launcherLabel(name: string): string {
  return LAUNCHER_REGISTRY[name]?.label ?? name;
}
