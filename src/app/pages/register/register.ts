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
  selector: 'app-register',
  standalone: true,
  imports: [FormsModule, MatSnackBarModule, RouterModule],
  templateUrl: './register.html',
  styleUrl: './register.scss',
})
export class Register implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly access = inject(AccessService);
  private readonly appRegistry = inject(AppRegistryService);
  private readonly snack = inject(MatSnackBar);
  private readonly router = inject(Router);

  readonly appName = APP_CONFIG.appName;
  readonly hidePassword = signal(true);
  readonly isLoading = signal(false);
  readonly attempted = signal(false);

  model = {
    code: '',
    email: '',
    password: '',
    legal_first_name: '',
    legal_last_name: '',
  };

  ngOnInit() {
    if (this.authService.userProfile()) {
      void this.router.navigate(['/welcome'], { replaceUrl: true });
    }
  }

  togglePasswordVisibility(event: MouseEvent) {
    event.preventDefault();
    this.hidePassword.update((v) => !v);
  }

  showCodeRequired() {
    return this.attempted() && !this.model.code.trim();
  }

  showEmailRequired() {
    return this.attempted() && !this.model.email.trim();
  }

  showEmailInvalid() {
    return (
      this.attempted() &&
      !!this.model.email.trim() &&
      !isValidEmail(this.model.email)
    );
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

  showFirstNameRequired() {
    return this.attempted() && !this.model.legal_first_name.trim();
  }

  showLastNameRequired() {
    return this.attempted() && !this.model.legal_last_name.trim();
  }

  isFormInvalid() {
    return (
      !this.model.code.trim() ||
      !this.model.email.trim() ||
      !isValidEmail(this.model.email) ||
      this.model.password.length < 6 ||
      !this.model.legal_first_name.trim() ||
      !this.model.legal_last_name.trim()
    );
  }

  async onSubmit() {
    this.attempted.set(true);
    if (this.isFormInvalid() || this.isLoading()) return;
    this.isLoading.set(true);

    try {
      await this.authService.register({
        code: this.model.code.trim(),
        email: this.model.email.trim(),
        password: this.model.password,
        legal_first_name: this.model.legal_first_name.trim(),
        legal_last_name: this.model.legal_last_name.trim(),
      });

      const currentApp = getCurrentSubdomain();
      await Promise.all([
        this.appRegistry.fetchAllApps(),
        this.access.fetchMyAccess(true),
      ]);

      if (!this.access.hasAppBySubdomain(currentApp)) {
        await this.authService.logout();
        throw new Error('APP_ACCESS_DENIED');
      }

      const targetRoute =
        DEFAULT_ROUTES[currentApp as keyof typeof DEFAULT_ROUTES];
      await this.router.navigate([targetRoute]);
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : undefined;
      let message =
        errorMessage ||
        'Registration failed. Check your invitation code and try again.';

      if (errorMessage === 'APP_ACCESS_DENIED') {
        message =
          'Account created, but this invitation does not include access to this app. Ask an admin to update your access.';
      }

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

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}
