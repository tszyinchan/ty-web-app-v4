import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Router, RouterModule } from '@angular/router';
import { APP_CONFIG, DEFAULT_ROUTES } from '../../app.constants';
import { AccessService } from '../../core/services/access.service';
import { AppRegistryService } from '../../core/services/app-registry.service';
import { AuthService } from '../../core/services/auth.service';
import { getCurrentSubdomain } from '../../core/utils/app-env.util';

@Component({
  selector: 'app-reset-password',
  standalone: true,
  imports: [FormsModule, MatSnackBarModule, RouterModule],
  templateUrl: './reset-password.html',
  styleUrl: './reset-password.scss',
})
export class ResetPassword implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly access = inject(AccessService);
  private readonly appRegistry = inject(AppRegistryService);
  private readonly snack = inject(MatSnackBar);
  private readonly router = inject(Router);

  readonly appName = APP_CONFIG.appName;
  readonly hidePassword = signal(true);
  readonly isLoading = signal(false);
  readonly attempted = signal(false);
  readonly ready = signal(false);
  readonly invalidLink = signal(false);

  model = {
    password: '',
    confirm: '',
  };

  async ngOnInit() {
    const ok = await this.authService.waitForRecoverySession();
    if (!ok && !this.authService.isPasswordRecovery()) {
      this.invalidLink.set(true);
      this.ready.set(true);
      return;
    }
    this.ready.set(true);
  }

  togglePasswordVisibility(event: MouseEvent) {
    event.preventDefault();
    this.hidePassword.update((v) => !v);
  }

  showPasswordRequired() {
    return this.attempted() && !this.model.password;
  }

  showPasswordMin() {
    return (
      this.attempted() &&
      !!this.model.password &&
      this.model.password.length < 6
    );
  }

  showPasswordMismatch() {
    return (
      this.attempted() &&
      !!this.model.password &&
      !!this.model.confirm &&
      this.model.password !== this.model.confirm
    );
  }

  async onSubmit() {
    this.attempted.set(true);
    if (
      this.isLoading() ||
      this.invalidLink() ||
      this.model.password.length < 6 ||
      this.model.password !== this.model.confirm
    ) {
      return;
    }
    this.isLoading.set(true);

    try {
      await this.authService.completePasswordReset(this.model.password);

      const currentApp = getCurrentSubdomain();
      await Promise.all([
        this.appRegistry.fetchAllApps(),
        this.access.fetchMyAccess(true),
      ]);

      if (!this.authService.userProfile()) {
        await this.router.navigate(['/login'], { replaceUrl: true });
        this.snack.open('Password updated. Sign in with your new password.', 'OK', {
          duration: 5000,
          horizontalPosition: 'center',
          verticalPosition: 'bottom',
        });
        return;
      }

      if (!this.access.hasAppBySubdomain(currentApp)) {
        await this.authService.logout();
        await this.router.navigate(['/login'], { replaceUrl: true });
        return;
      }

      const targetRoute =
        DEFAULT_ROUTES[currentApp as keyof typeof DEFAULT_ROUTES];
      await this.router.navigate([targetRoute], { replaceUrl: true });
    } catch (e: unknown) {
      const message =
        e instanceof Error
          ? e.message
          : 'Could not update the password. Try again.';
      this.snack.open(message, 'OK', {
        duration: 5000,
        horizontalPosition: 'center',
        verticalPosition: 'bottom',
      });
    } finally {
      this.isLoading.set(false);
    }
  }
}
