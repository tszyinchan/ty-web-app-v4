import { DatePipe } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { RouterModule } from '@angular/router';

import { APP_CONFIG } from '../../../../app.constants';
import { TyappApp } from '../../../../core/models/app.model';
import { RecordStatus } from '../../../../core/models/status.enum';
import { DisplayNamePipe } from '../../../../core/pipes/display-name.pipe';
import { AccessService } from '../../../../core/services/access.service';
import { AppRegistryService } from '../../../../core/services/app-registry.service';
import { AuthService } from '../../../../core/services/auth.service';
import { HeaderService } from '../../../../core/services/header.service';
import { PresenceService } from '../../../../core/services/presence.service';
import { AppFeature } from '../../features/development/app-feature/app-feature.model';
import { AppFeatureService } from '../../features/development/app-feature/app-feature.service';

const TILE_TONES: Record<string, string> = {
  Work: 'blue',
  Article: 'gold',
  Fit: 'green',
  Filelink: 'teal',
  Chat: 'purple',
  Settings: 'slate',
  User: 'orange',
  Development: 'red',
  Archive: 'slate',
};

const HUB_ROUTES: Record<string, string> = {
  Work: '/work',
  Development: '/development',
};

const FALLBACK_TILES: { name: string; icon: string; route: string }[] = [
  { name: 'Work', icon: 'work', route: '/work' },
  { name: 'Article', icon: 'article', route: '/article/feed' },
  { name: 'Fit', icon: 'fitness_center', route: '/fit/list' },
  { name: 'Filelink', icon: 'link', route: '/filelink/list' },
  { name: 'Chat', icon: 'chat', route: '/chat' },
  { name: 'Settings', icon: 'settings', route: '/settings/notifications' },
  { name: 'User', icon: 'people_outline', route: '/users/list' },
  { name: 'Development', icon: 'code', route: '/development' },
];

const LAST_ORDER = Number.MAX_SAFE_INTEGER;

@Component({
  selector: 'app-welcome',
  standalone: true,
  imports: [DatePipe, RouterModule, MatIconModule, DisplayNamePipe],
  templateUrl: './welcome.html',
  styleUrl: './welcome.scss',
})
export class Welcome implements OnInit, OnDestroy {
  private readonly auth = inject(AuthService);
  private readonly access = inject(AccessService);
  private readonly features = inject(AppFeatureService);
  private readonly apps = inject(AppRegistryService);
  private readonly header = inject(HeaderService);
  private readonly presence = inject(PresenceService);

  readonly appName = APP_CONFIG.appName;
  readonly versionDate = APP_CONFIG.versionDate;
  readonly currentDate = new Date();
  readonly userProfile = this.auth.userProfile;

  readonly appVersion = computed(() => {
    const { major, minor, patch } = APP_CONFIG.version;
    return `${major}.${minor}.${patch}`;
  });

  readonly loading = computed(
    () => this.features.loading() || this.apps.loading(),
  );

  readonly tiles = computed(() => {
    this.access.myFeatureIds();
    const catalog = this.features.features();
    const apps = this.apps.apps();
    const isSuperAdmin = this.auth.isSuperAdmin();

    const featureTiles = catalog
      .filter((feature) => {
        if (!feature.show_in_launcher) return false;
        if (feature.status !== RecordStatus.Active) return false;
        if (!feature.route || !feature.icon) return false;
        if (!this.access.isAppActive(feature.app_id)) return false;
        return this.access.hasFeature(feature.tb_tyapp_ap_ftr_id);
      })
      .map((feature) => this.toTile(feature, apps));

    const shown = new Set(featureTiles.map((tile) => tile.name));
    const fallbackTiles = FALLBACK_TILES.flatMap((tile) => {
      if (shown.has(tile.name)) return [];
      const feature = catalog.find((row) => row.name === tile.name);
      const parent = this.parentApp(tile.name, feature, apps);
      if (!parent || !this.access.isAppActive(parent.tb_tyapp_app_id)) {
        return [];
      }
      if (isSuperAdmin) {
        return [
          {
            ...tile,
            ...this.orderOf(feature, apps),
          },
        ];
      }
      if (!feature || !this.access.hasFeature(feature.tb_tyapp_ap_ftr_id)) {
        return [];
      }
      return [
        {
          ...tile,
          ...this.orderOf(feature, apps),
        },
      ];
    });

    const tiles = [...featureTiles, ...fallbackTiles].sort((a, b) => {
      const appDiff = a.appOrder - b.appOrder;
      if (appDiff !== 0) return appDiff;
      return a.order - b.order;
    });
    if (isSuperAdmin) {
      tiles.push({
        name: 'Archive',
        icon: 'folder',
        route: '/archive',
        appOrder: LAST_ORDER,
        order: LAST_ORDER,
      });
    }
    return tiles;
  });

  private toTile(feature: AppFeature, apps: TyappApp[]) {
    return {
      name: feature.name,
      icon: feature.icon as string,
      route: HUB_ROUTES[feature.name] ?? (feature.route as string),
      ...this.orderOf(feature, apps),
    };
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
