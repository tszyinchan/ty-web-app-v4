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
import { ThemeService } from '../../../../core/services/theme.service';
import { ViewportService } from '../../../../core/services/viewport.service';
import { UserPreferenceService } from '../../features/settings/user-preference.service';
import { FeatureHubLink, FEATURE_HUBS } from '../feature-hub/feature-hub.config';
import { AppFeature } from '../../features/development/app-feature/app-feature.model';
import { AppFeatureService } from '../../features/development/app-feature/app-feature.service';
import {
  ARCHIVE_IMAGES,
  HUB_ROUTES,
  isLauncherShipped,
  launcherGroup,
  launcherImage,
  launcherLabel,
} from './launcher.registry';

interface WelcomeCategory {
  name: string;
  icon: string;
  image: string | null;
  route: string;
  appOrder: number;
  order: number;
  links: FeatureHubLink[];
  shipped: boolean;
}

interface WelcomeArchiveItem {
  title: string;
  route: string;
  image: string | null;
}

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
    { title: 'Patterns', icon: 'view_list', route: '/fit/patterns' },
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
  private readonly theme = inject(ThemeService);

  readonly versionDate = APP_CONFIG.versionDate;
  readonly userProfile = this.auth.userProfile;
  readonly isNarrow = this.viewport.isNarrow;
  readonly chromeLogoSrc = computed(() =>
    this.theme.resolvedColorMode() === 'dark' ? 'logo-dark.svg' : 'logo.svg',
  );
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
  readonly settingsOpen = signal(true);
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

    return catalog
      .filter((feature) => {
        if (feature.name === 'Archive') return false;
        if (!feature.show_in_launcher) return false;
        if (feature.status !== RecordStatus.Active) return false;
        if (!feature.route || !feature.icon) return false;
        if (!this.access.isAppActive(feature.app_id)) return false;
        if (feature.name === 'User' && this.auth.isAdmin()) return true;
        return this.access.hasFeature(feature.tb_tyapp_ap_ftr_id);
      })
      .map((feature) => this.toCategory(feature, apps))
      .sort((a, b) => {
        const appDiff = a.appOrder - b.appOrder;
        if (appDiff !== 0) return appDiff;
        return a.order - b.order;
      });
  });

  readonly featureTiles = computed(() =>
    this.categories().filter((tile) => launcherGroup(tile.name) === 'features'),
  );

  readonly settingsTiles = computed(() =>
    this.categories().filter((tile) => launcherGroup(tile.name) === 'settings'),
  );

  private toCategory(feature: AppFeature, apps: TyappApp[]): WelcomeCategory {
    return this.withLinks({
      name: feature.name,
      icon: feature.icon as string,
      image: launcherImage(feature.name),
      route: this.featureHubRoute(feature.name, feature.route as string),
      shipped: isLauncherShipped(feature.name),
      ...this.orderOf(feature, apps),
    });
  }

  private featureHubRoute(featureName: string, fallbackRoute: string): string {
    if (featureName === 'User' && !this.auth.isAdmin()) {
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
      image: tile.image ?? launcherImage(tile.name),
      links: tile.shipped && links.length > 1 ? links : [],
    };
  }

  private linksFor(name: string): FeatureHubLink[] {
    if (name === 'User' && !this.auth.isAdmin()) return [];
    return CATEGORY_LINKS[name] ?? [];
  }

  private orderOf(feature: AppFeature | undefined, apps: TyappApp[]) {
    const app = apps.find((row) => row.tb_tyapp_app_id === feature?.app_id);
    return {
      appOrder: app?.customized_order ?? LAST_ORDER,
      order: feature?.customized_order ?? LAST_ORDER,
    };
  }

  toggleFeatures() {
    this.featuresOpen.update((open) => !open);
  }

  toggleSettings() {
    this.settingsOpen.update((open) => !open);
  }

  toggleArchive() {
    this.archiveOpen.update((open) => !open);
  }

  tileLabel(name: string): string {
    return launcherLabel(name);
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
