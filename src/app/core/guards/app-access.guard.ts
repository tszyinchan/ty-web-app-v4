import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AccessService } from '../services/access.service';
import { AppRegistryService } from '../services/app-registry.service';
import { getCurrentSubdomain } from '../utils/app-env.util';

export const appAccessGuard: CanActivateFn = async () => {
  const access = inject(AccessService);
  const apps = inject(AppRegistryService);
  const router = inject(Router);
  const snack = inject(MatSnackBar);

  const currentApp = getCurrentSubdomain();

  await Promise.all([apps.fetchAllApps(), access.fetchMyAccess()]);

  if (access.hasAppBySubdomain(currentApp)) {
    return true;
  }

  const msg =
    currentApp === 'filelink'
      ? '拒絕存取：您沒有權限進入此模組。'
      : 'Access Denied: You do not have permission to access this app.';

  snack.open(msg, 'OK', {
    duration: 5000,
    horizontalPosition: 'center',
    verticalPosition: 'bottom',
  });

  return router.parseUrl('/login');
};
