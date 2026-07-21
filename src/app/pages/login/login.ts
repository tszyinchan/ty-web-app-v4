import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { APP_CONFIG, DEFAULT_ROUTES, SUBDOMAINS } from '../../app.constants';
import { AuthService } from '../../core/services/auth.service';
import { AuthError } from '@supabase/supabase-js';
import { Router } from '@angular/router';
import { getCurrentSubdomain } from '../../core/utils/app-env.util';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatSnackBarModule,
  ],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class Login {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly snack = inject(MatSnackBar);
  private readonly router = inject(Router);

  readonly appName = signal(APP_CONFIG.appName);
  readonly appIcon = signal('admin_panel_settings');
  readonly subtitle = signal('Enter your details below to continue.');

  readonly hidePassword = signal(true);
  readonly isLoading = signal(false);

  readonly loginForm = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  togglePasswordVisibility(event: MouseEvent) {
    event.preventDefault();
    this.hidePassword.update((v) => !v);
  }

  ngOnInit() {
    const currentApp = getCurrentSubdomain();

    if (currentApp === SUBDOMAINS.FILELINK) {
      this.appName.set('Filelink');
      this.appIcon.set('cloud_queue');
      this.subtitle.set('Access to your files and documents.');
    } else {
      this.appName.set('Jaxfr');
      this.appIcon.set('admin_panel_settings');
      this.subtitle.set('Welcome back. Please sign in to your account.');
    }
  }

  async onSubmit() {
    if (this.loginForm.invalid || this.isLoading()) return;
    this.isLoading.set(true);

    try {
      const { email, password } = this.loginForm.getRawValue();
      await this.authService.login(email, password);

      const currentApp = getCurrentSubdomain();
      const targetRoute =
        DEFAULT_ROUTES[currentApp as keyof typeof DEFAULT_ROUTES];

      await this.router.navigate([targetRoute]);
    } catch (e: unknown) {
      const message = (e as AuthError).message || '登入失敗，請檢查帳號密碼';
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
