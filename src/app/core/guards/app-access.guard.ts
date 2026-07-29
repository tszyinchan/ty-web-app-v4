import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { getCurrentSubdomain } from '../utils/app-env.util';
import { MatSnackBar } from '@angular/material/snack-bar';

export const appAccessGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const snack = inject(MatSnackBar);

  const profile = authService.userProfile();
  const currentApp = getCurrentSubdomain();

  if (profile?.allowed_apps && profile.allowed_apps.includes(currentApp)) {
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
