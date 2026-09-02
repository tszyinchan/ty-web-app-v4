import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AppFeatureService } from '../../apps/jaxfr/features/development/app-feature/app-feature.service';
import { AccessService } from '../services/access.service';
import { AppRegistryService } from '../services/app-registry.service';
import { AuthService } from '../services/auth.service';

export const featureAccessGuard: CanActivateFn = async (route) => {
  const auth = inject(AuthService);
  const access = inject(AccessService);
  const apps = inject(AppRegistryService);
  const features = inject(AppFeatureService);
  const router = inject(Router);

  const featureName = route.data['featureName'] as string | undefined;
  if (!featureName) {
    return router.createUrlTree(['/welcome']);
  }

  if (featureName === 'Archive') {
    return auth.isSuperAdmin()
      ? true
      : router.createUrlTree(['/welcome']);
  }

  if (auth.isSuperAdmin()) {
    return true;
  }

  if (featureName === 'User' && auth.isAdmin()) {
    return true;
  }

  await Promise.all([
    features.fetchAllFeatures(),
    apps.fetchAllApps(),
    access.fetchMyAccess(),
  ]);

  const feature = features.features().find((f) => f.name === featureName);
  if (
    !feature ||
    !access.hasFeature(feature.tb_tyapp_ap_ftr_id) ||
    !access.isAppActive(feature.app_id)
  ) {
    return router.createUrlTree(['/welcome']);
  }

  return true;
};
