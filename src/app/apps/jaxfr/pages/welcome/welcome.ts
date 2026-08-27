import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { RouterModule } from '@angular/router';

import { APP_CONFIG } from '../../../../app.constants';
import { TyappApp } from '../../../../core/models/app.model';
import { RecordStatus } from '../../../../core/models/status.enum';
import { resolveWelcomeLauncherMode } from '../../../../core/models/user-preference.model';
import { DisplayNamePipe } from '../../../../core/pipes/display-name.pipe';
import { AccessService } from '../../../../core/services/access.service';
import { AppRegistryService } from '../../../../core/services/app-registry.service';
import { AuthService } from '../../../../core/services/auth.service';
import { HeaderService } from '../../../../core/services/header.service';
import { PresenceService } from '../../../../core/services/presence.service';
import { ViewportService } from '../../../../core/services/viewport.service';
import { UserPreferenceService } from '../../features/settings/user-preference.service';
import { FeatureHubLink, FEATURE_HUBS } from '../feature-hub/feature-hub.config';
import { AppFeature } from '../../features/development/app-feature/app-feature.model';
import { AppFeatureService } from '../../features/development/app-feature/app-feature.service';

interface WelcomeCategory {
  name: string;
  icon: string;
  image: string | null;
  route: string;
  appOrder: number;
  order: number;
  links: FeatureHubLink[];
}

interface WelcomeArchiveItem {
  title: string;
  route: string;
  image: string | null;
}

const CATEGORY_IMAGES: Record<string, string> = {
  Work: '/icons/3d/work.png',
  Article: '/icons/3d/article.png',
  Fit: '/icons/3d/fit.png',
  'Daily Checklist': '/icons/3d/checklist.png',
  Filelink: '/icons/3d/filelink.png',
  'Tyweb Control': '/icons/3d/web.png',
  Chat: '/icons/3d/chat.png',
  'Doc Sign': '/icons/3d/docsign.png',
  Settings: '/icons/3d/settings.png',
  User: '/icons/3d/user.png',
  Development: '/icons/3d/development.png',
  YYEMS: '/icons/3d/payments.png',
};

const CATEGORY_LABELS: Record<string, string> = {
  YYEMS: '525',
};

const ARCHIVE_IMAGES: Record<string, string> = {
  analytics: '/icons/3d/analytics.png',
  calendar_view_month: '/icons/3d/calendar.png',
  payments: '/icons/3d/payments.png',
  savings: '/icons/3d/savings.png',
};

const TILE_TONES: Record<string, string> = {
  Work: 'blue',
  Article: 'gold',
  Fit: 'green',
  'Daily Checklist': 'green',
  Filelink: 'teal',
  'Tyweb Control': 'teal',
  Chat: 'purple',
  'Doc Sign': 'blue',
  Settings: 'slate',
  User: 'orange',
  Development: 'red',
  YYEMS: 'gold',
};

const HUB_ROUTES: Record<string, string> = {
  Work: '/work',
  Development: '/development',
  User: '/users',
  YYEMS: '/yyems',
};

const FALLBACK_TILES: { name: string; icon: string; route: string }[] = [
  { name: 'Work', icon: 'work', route: '/work' },
  { name: 'Article', icon: 'article', route: '/article/feed' },
  { name: 'Fit', icon: 'fitness_center', route: '/fit/list' },
  { name: 'Filelink', icon: 'link', route: '/filelink/list' },
  { name: 'Tyweb Control', icon: 'web', route: '/tyweb' },
  { name: 'Chat', icon: 'chat', route: '/chat' },
  { name: 'Settings', icon: 'settings', route: '/settings' },
  { name: 'User', icon: 'people_outline', route: '/users' },
  { name: 'Development', icon: 'code', route: '/development' },
  { name: 'YYEMS', icon: 'kitchen', route: '/yyems' },
];

const LAST_ORDER = Number.MAX_SAFE_INTEGER;

const hubLinks = (hub: string): FeatureHubLink[] => FEATURE_HUBS[hub]?.links ?? [];

const CATEGORY_LINKS: Record<string, FeatureHubLink[]> = {
  Work: hubLinks('work'),
  Development: hubLinks('development'),
  User: hubLinks('user'),
  YYEMS: hubLinks('yyems'),
  Article: [
    { title: 'Feed', icon: 'dynamic_feed', route: '/article/feed' },
    { title: 'List', icon: 'list', route: '/article/list' },
  ],
  Fit: [
    { title: 'Sessions', icon: 'fitness_center', route: '/fit/list' },
    { title: 'Thread', icon: 'forum', route: '/fit/thread' },
  ],
  'Daily Checklist': [
    { title: 'Log', icon: 'checklist', route: '/daily-checklist' },
    { title: 'Others', icon: 'groups', route: '/daily-checklist/shared' },
    { title: 'Library', icon: 'category', route: '/daily-checklist/items' },
    { title: 'Stats', icon: 'insights', route: '/daily-checklist/dashboard' },
  ],
  'Doc Sign': [
    { title: 'Sign list', icon: 'list', route: '/docsign/list' },
    { title: 'Print log', icon: 'print', route: '/docsign/prints' },
    { title: 'Signature', icon: 'draw', route: '/docsign/signature' },
  ],
};

@Component({
  selector: 'app-welcome',
  standalone: true,
  imports: [RouterModule, MatIconModule, DisplayNamePipe],
  templateUrl: './welcome.html',
  styleUrl: './welcome.scss',
  host: {
    '[class.launcher-narrow]': 'isNarrow()',
  },
})
export class Welcome implements OnInit, OnDestroy {
  private readonly auth = inject(AuthService);
  private readonly access = inject(AccessService);
  private readonly features = inject(AppFeatureService);
  private readonly apps = inject(AppRegistryService);
  private readonly header = inject(HeaderService);
  private readonly presence = inject(PresenceService);
  private readonly prefs = inject(UserPreferenceService);
  private readonly viewport = inject(ViewportService);

  readonly versionDate = APP_CONFIG.versionDate;
  readonly userProfile = this.auth.userProfile;
  readonly isNarrow = this.viewport.isNarrow;
  readonly launcherMode = computed(() =>
    resolveWelcomeLauncherMode(
      this.prefs.welcomeLauncherMode(),
      this.viewport.isNarrow(),
    ),
  );

  readonly appVersion = computed(() => {
    const { major, minor, patch } = APP_CONFIG.version;
    return `${major}.${minor}.${patch}`;
  });

  readonly showArchive = this.auth.isSuperAdmin;
  readonly featuresOpen = signal(true);
  readonly archiveOpen = signal(true);

  readonly archiveItems = computed<WelcomeArchiveItem[]>(() => {
    if (!this.auth.isSuperAdmin()) return [];
    return hubLinks('archive').map((link) => ({
      title: link.title,
      route: link.route,
      image: ARCHIVE_IMAGES[link.icon] ?? null,
    }));
  });

  readonly loading = computed(
    () => this.features.loading() || this.apps.loading(),
  );

  readonly categories = computed(() => {
    this.access.myFeatureIds();
    const catalog = this.features.features();
    const apps = this.apps.apps();
    const isSuperAdmin = this.auth.isSuperAdmin();

    const featureTiles = catalog
      .filter((feature) => {
        if (feature.name === 'Archive') return false;
        if (!feature.show_in_launcher) return false;
        if (feature.status !== RecordStatus.Active) return false;
        if (!feature.route || !feature.icon) return false;
        if (!this.access.isAppActive(feature.app_id)) return false;
        return this.access.hasFeature(feature.tb_tyapp_ap_ftr_id);
      })
      .map((feature) => this.toCategory(feature, apps));

    const shown = new Set(featureTiles.map((tile) => tile.name));
    const fallbackTiles = FALLBACK_TILES.flatMap((tile) => {
      if (shown.has(tile.name)) return [];
      const feature = catalog.find((row) => row.name === tile.name);
      const parent = this.parentApp(tile.name, feature, apps);
      if (!parent || !this.access.isAppActive(parent.tb_tyapp_app_id)) {
        return [];
      }
      const resolved = {
        ...tile,
        route: this.featureHubRoute(tile.name, tile.route),
      };
      if (isSuperAdmin) {
        return [this.withLinks({ ...resolved, ...this.orderOf(feature, apps) })];
      }
      if (!feature || !this.access.hasFeature(feature.tb_tyapp_ap_ftr_id)) {
        return [];
      }
      return [this.withLinks({ ...resolved, ...this.orderOf(feature, apps) })];
    });

    const categories = [...featureTiles, ...fallbackTiles].sort((a, b) => {
      const appDiff = a.appOrder - b.appOrder;
      if (appDiff !== 0) return appDiff;
      return a.order - b.order;
    });
    return categories;
  });

  private toCategory(feature: AppFeature, apps: TyappApp[]): WelcomeCategory {
    return this.withLinks({
      name: feature.name,
      icon: feature.icon as string,
      image: CATEGORY_IMAGES[feature.name] ?? null,
      route: this.featureHubRoute(feature.name, feature.route as string),
      ...this.orderOf(feature, apps),
    });
  }

  private featureHubRoute(featureName: string, fallbackRoute: string): string {
    if (featureName === 'User' && !this.auth.isSuperAdmin()) {
      const myId = this.auth.userProfile()?.user_id;
      if (myId) return `/users/edit/${myId}`;
    }
    if (HUB_ROUTES[featureName]) return HUB_ROUTES[featureName];
    return fallbackRoute;
  }

  private withLinks(
    tile: Omit<WelcomeCategory, 'links' | 'image'> & { image?: string | null },
  ): WelcomeCategory {
    const links = this.linksFor(tile.name);
    return {
      ...tile,
      image: tile.image ?? CATEGORY_IMAGES[tile.name] ?? null,
      links: links.length > 1 ? links : [],
    };
  }

  private linksFor(name: string): FeatureHubLink[] {
    if (name === 'User' && !this.auth.isSuperAdmin()) return [];
    return CATEGORY_LINKS[name] ?? [];
  }

  toggleFeatures() {
    this.featuresOpen.update((open) => !open);
  }

  toggleArchive() {
    this.archiveOpen.update((open) => !open);
  }

  private parentApp(
    tileName: string,
    feature: AppFeature | undefined,
    apps: TyappApp[],
  ): TyappApp | undefined {
    if (feature) {
      return apps.find((row) => row.tb_tyapp_app_id === feature.app_id);
    }
    return (
      apps.find((row) => row.name === tileName) ??
      apps.find((row) => row.name === 'Jaxfr')
    );
  }

  private orderOf(feature: AppFeature | undefined, apps: TyappApp[]) {
    const app = apps.find((row) => row.tb_tyapp_app_id === feature?.app_id);
    return {
      appOrder: app?.customized_order ?? LAST_ORDER,
      order: feature?.customized_order ?? LAST_ORDER,
    };
  }

  tileTone(name: string): string {
    return TILE_TONES[name] ?? 'blue';
  }

  tileLabel(name: string): string {
    return CATEGORY_LABELS[name] ?? name;
  }

  async onSignOut() {
    await this.presence.flush();
    await this.auth.logout();
  }

  ngOnInit() {
    void this.features.fetchAllFeatures();
    void this.apps.fetchAllApps();
    void this.access.fetchMyAccess();
  }

  ngOnDestroy() {
    this.header.clear();
  }
}
