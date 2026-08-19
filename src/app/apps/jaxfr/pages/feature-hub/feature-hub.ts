import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';

import { HeaderService } from '../../../../core/services/header.service';
import { FEATURE_HUBS, FeatureHubConfig } from './feature-hub.config';

@Component({
  selector: 'app-feature-hub',
  standalone: true,
  imports: [RouterModule, MatIconModule],
  templateUrl: './feature-hub.html',
  styleUrl: './feature-hub.scss',
})
export class FeatureHub implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly header = inject(HeaderService);

  hub: FeatureHubConfig | null = null;

  ngOnInit() {
    const hubKey = this.route.snapshot.data['hub'] as string | undefined;
    this.hub = hubKey ? (FEATURE_HUBS[hubKey] ?? null) : null;

    if (!this.hub) {
      void this.router.navigateByUrl('/welcome');
      return;
    }

    this.header.setConfig({ title: this.hub.title });
  }

  ngOnDestroy() {
    this.header.clear();
  }
}
