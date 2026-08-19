import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AppFeatureService } from '../../apps/jaxfr/features/development/app-feature/app-feature.service';
import { AccessService } from '../services/access.service';
import { AuthService } from '../services/auth.service';

export const featureAccessGuard: CanActivateFn = async (route) => {
  const auth = inject(AuthService);
  const access = inject(AccessService);
  const features = inject(AppFeatureService);
  const router = inject(Router);

  const featureName = route.data['featureName'] as string | undefined;
  if (!featureName) {
    return router.createUrlTree(['/welcome']);
  }

  await Promise.all([features.fetchAllFeatures(), access.fetchMyAccess()]);

  const feature = features.features().find((f) => f.name === featureName);
  const isAdminOnly =
    featureName === 'User' ||
    featureName === 'Development' ||
    !!feature?.is_admin_only;

  // Admin-only features are gated by role so an admin can never lock
  // themselves out of User Edit / Development. Regular features need a grant.
  if (isAdminOnly) {
    return auth.isAdmin() ? true : router.createUrlTree(['/welcome']);
  }

  if (!feature || !access.hasFeature(feature.tb_tyapp_ap_ftr_id)) {
    return router.createUrlTree(['/welcome']);
  }

  return true;
};
