import { DatePipe } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { RouterModule } from '@angular/router';

import { APP_CONFIG } from '../../../../app.constants';
import { RecordStatus } from '../../../../core/models/status.enum';
import { DisplayNamePipe } from '../../../../core/pipes/display-name.pipe';
import { AccessService } from '../../../../core/services/access.service';
import { AuthService } from '../../../../core/services/auth.service';
import { HeaderService } from '../../../../core/services/header.service';
import { AppFeatureService } from '../../features/development/app-feature/app-feature.service';

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

@Component({
  selector: 'app-welcome',
  standalone: true,
  imports: [
    DatePipe,
    RouterModule,
    MatIconModule,
    MatProgressSpinnerModule,
    DisplayNamePipe,
  ],
  templateUrl: './welcome.html',
  styleUrl: './welcome.scss',
})
export class Welcome implements OnInit, OnDestroy {
  private readonly auth = inject(AuthService);
  private readonly access = inject(AccessService);
  private readonly features = inject(AppFeatureService);
  private readonly header = inject(HeaderService);

  readonly appName = APP_CONFIG.appName;
  readonly versionDate = APP_CONFIG.versionDate;
  readonly currentDate = new Date();
  readonly userProfile = this.auth.userProfile;

  readonly appVersion = computed(() => {
    const { major, minor, patch } = APP_CONFIG.version;
    return `${major}.${minor}.${patch}`;
  });

  readonly loading = this.features.loading;

  readonly tiles = computed(() => {
    this.access.myFeatureIds();
    const catalog = this.features.features();
    const isSuperAdmin = this.auth.isSuperAdmin();

    const featureTiles = catalog
      .filter((feature) => {
        if (!feature.show_in_launcher) return false;
        if (feature.status !== RecordStatus.Active) return false;
        if (!feature.route || !feature.icon) return false;
        return this.access.hasFeature(feature.tb_tyapp_ap_ftr_id);
      })
      .map((feature) => ({
        name: feature.name,
        icon: feature.icon as string,
        route: HUB_ROUTES[feature.name] ?? (feature.route as string),
      }));

    const shown = new Set(featureTiles.map((tile) => tile.name));
    const fallbackTiles = FALLBACK_TILES.filter((tile) => {
      if (shown.has(tile.name)) return false;
      if (isSuperAdmin) return true;
      const feature = catalog.find((row) => row.name === tile.name);
      return !!feature && this.access.hasFeature(feature.tb_tyapp_ap_ftr_id);
    });

    const tiles = [...featureTiles, ...fallbackTiles];
    if (isSuperAdmin) {
      tiles.push({ name: 'Archive', icon: 'folder', route: '/archive' });
    }
    return tiles;
  });

  ngOnInit() {
    this.header.setConfig({ title: this.appName });
    void this.features.fetchAllFeatures();
    void this.access.fetchMyAccess();
  }

  ngOnDestroy() {
    this.header.clear();
  }
}
