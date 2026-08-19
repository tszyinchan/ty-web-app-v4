import { Component, inject, signal, OnInit } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { APP_CONFIG, DEFAULT_ROUTES, SUBDOMAINS } from '../../app.constants';
import { AccessService } from '../../core/services/access.service';
import { AppRegistryService } from '../../core/services/app-registry.service';
import { AuthService } from '../../core/services/auth.service';
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
export class Login implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly access = inject(AccessService);
  private readonly appRegistry = inject(AppRegistryService);
  private readonly snack = inject(MatSnackBar);
  private readonly router = inject(Router);

  readonly appName = signal(APP_CONFIG.appName);
  readonly appIcon = signal('admin_panel_settings');
  readonly titlePrefix = signal('Sign in to');
  readonly subtitle = signal('Enter your details below to continue.');

  readonly emailLabel = signal('Email address');
  readonly emailReqErr = signal('Email is required');
  readonly emailInvErr = signal('Please enter a valid email');

  readonly pwdLabel = signal('Password');
  readonly pwdReqErr = signal('Password is required');
  readonly pwdMinErr = signal('At least 6 characters');

  readonly signInBtn = signal('Sign In');
  readonly signingInBtn = signal('Signing in...');
  readonly defaultErrorMsg = signal(
    'Login failed. Please check your credentials.',
  );

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
      this.titlePrefix.set('登入');
      this.subtitle.set('請輸入您的帳號密碼以存取檔案。');

      this.emailLabel.set('電子郵件');
      this.emailReqErr.set('請輸入電子郵件');
      this.emailInvErr.set('請輸入有效的電子郵件格式');

      this.pwdLabel.set('密碼');
      this.pwdReqErr.set('請輸入密碼');
      this.pwdMinErr.set('密碼長度至少需 6 個字元');

      this.signInBtn.set('登入');
      this.signingInBtn.set('登入中...');
      this.defaultErrorMsg.set('登入失敗，請檢查帳號密碼');
    } else {
      this.appName.set('Jaxfr');
      this.appIcon.set('admin_panel_settings');
      this.titlePrefix.set('Sign in to');
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
      let message = errorMessage || this.defaultErrorMsg();

      if (errorMessage === 'APP_ACCESS_DENIED') {
        const currentApp = getCurrentSubdomain();
        message =
          currentApp === SUBDOMAINS.FILELINK
            ? '您沒有權限存取此模組，請聯絡管理員。'
            : 'You do not have permission to access this app.';
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
