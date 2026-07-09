import { Component, computed, inject, ViewChild } from '@angular/core';
import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs/operators';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

import { MatSidenav, MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatMenuModule } from '@angular/material/menu';
import { MatDividerModule } from '@angular/material/divider';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { AuthService } from '../core/services/auth.service';
import { HeaderService, HeaderAction } from '../core/services/header.service';
import { DisplayNamePipe } from '../core/pipes/display-name.pipe';
import { RoleLabelPipe } from '../core/pipes/role-label.pipe';
import { APP_CONFIG } from '../app.constants';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';

interface MenuLink {
  title: string;
  route: string;
}

interface MenuGroup {
  title: string;
  icon: string;
  adminOnly: boolean;
  defaultExpanded?: boolean;
  links: MenuLink[];
}

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatSidenavModule,
    MatToolbarModule,
    MatListModule,
    MatIconModule,
    MatButtonModule,
    MatExpansionModule,
    MatMenuModule,
    MatDividerModule,
    MatProgressSpinnerModule,
    DisplayNamePipe,
    RoleLabelPipe,
    MatSlideToggleModule,
  ],
  templateUrl: './layout.html',
  styleUrl: './layout.scss',
})
export class Layout {
  @ViewChild('drawer') drawer!: MatSidenav;

  private readonly auth = inject(AuthService);
  private readonly breakpointObserver = inject(BreakpointObserver);
  public readonly headerService = inject(HeaderService);

  readonly isHandset = toSignal(
    this.breakpointObserver
      .observe(Breakpoints.Handset)
      .pipe(map((r) => r.matches)),
    { initialValue: false },
  );

  readonly userProfile = this.auth.userProfile;
  readonly isAdmin = this.auth.isAdmin;

  private readonly masterMenu: MenuGroup[] = [
    {
      title: 'Work',
      icon: 'work',
      adminOnly: false,
      links: [
        { title: 'Attendance', route: '/work/attendance/list' },
        { title: 'Schedule', route: '/work/schedule/list' },
        { title: 'Employment', route: '/work/employment/list' },
      ],
    },
    {
      title: 'Articles',
      icon: 'article',
      adminOnly: false,
      links: [
        { title: 'Article Feed', route: '/article/feed' },
        { title: 'Article List', route: '/article/list' },
      ],
    },
    {
      title: 'Fitness',
      icon: 'fitness_center',
      adminOnly: false,
      links: [
        { title: 'Fit List', route: '/fit/list' },
        { title: 'Fit Thread', route: '/fit/thread' },
      ],
    },
    {
      title: 'YY525',
      icon: 'local_laundry_service',
      adminOnly: false,
      links: [{ title: 'Laundry Calendar', route: '/yy525/wash-log/calendar' }],
    },
    {
      title: 'User Management',
      icon: 'people_outline',
      adminOnly: true,
      defaultExpanded: false,
      links: [{ title: 'User List', route: '/users/list' }],
    },
    {
      title: 'Development',
      icon: 'code',
      adminOnly: true,
      defaultExpanded: false,
      links: [
        { title: 'App Categories', route: '/development/category/list' },
        { title: 'App Functions', route: '/development/function/list' },
        { title: 'App Logs', route: '/development/log/list' },
      ],
    },
    {
      title: 'Archive',
      icon: 'folder',
      adminOnly: false,
      defaultExpanded: false,
      links: [
        {
          title: 'YYEMS Analytics Overview',
          route: '/archive/yy525/yyems-analytics/overview',
        },
        {
          title: 'YYEMS Analytics Monthly',
          route: '/archive/yy525/yyems-analytics/monthly',
        },
        { title: 'TyWeb Content Manager', route: '/archive/tyweb/content' },
        { title: 'Wealth Transactions', route: '/archive/wealth/list' },
        { title: 'Wealth Snapshots', route: '/archive/wealth/snapshots' },
      ],
    },
  ];

  readonly navMenu = computed(() => {
    const admin = this.isAdmin();
    return this.masterMenu.filter((group) => (admin ? true : !group.adminOnly));
  });

  closeOnMobile() {
    if (this.isHandset()) this.drawer.close();
  }

  async onSignOut() {
    await this.auth.logout();
  }

  appVersion = computed(() => {
    const { major, minor, patch } = APP_CONFIG.version;
    return `${major}.${minor}.${patch}`;
  });

  getPrimaryActions(actions?: HeaderAction[]) {
    return (actions || []).filter((a) => a.type === 'primary');
  }

  getSecondaryActions(actions?: HeaderAction[]) {
    return (actions || []).filter((a) => a.type === 'secondary');
  }

  getToggleActions(actions?: HeaderAction[]) {
    return (actions || []).filter((a) => a.type === 'toggle');
  }

  getIconActions(actions?: HeaderAction[]) {
    return (actions || []).filter((a) => a.type === 'icon');
  }
}
