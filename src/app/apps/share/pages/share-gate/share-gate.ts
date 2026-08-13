import { Component, OnInit, Type, inject, signal } from '@angular/core';
import { NgComponentOutlet } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

type ShareModuleLoader = () => Promise<Type<unknown>>;

/**
 * Maps the non-secret `module_key` returned by publicAccessGuard's RPC call
 * to the component that renders that module. Adding a future public module
 * only needs a new entry here plus a new row in tyapp_share_module - no
 * routing changes.
 */
const SHARE_MODULE_LOADERS: Record<string, ShareModuleLoader> = {
  'wash-log-calendar': () =>
    import('../../features/wash-log/wash-log-public').then(
      (m) => m.WashLogPublic,
    ),
};

@Component({
  selector: 'app-share-gate',
  standalone: true,
  imports: [NgComponentOutlet, MatProgressSpinnerModule],
  templateUrl: './share-gate.html',
  styleUrl: './share-gate.scss',
})
export class ShareGate implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  loadedComponent = signal<Type<unknown> | null>(null);

  async ngOnInit() {
    const moduleKey = this.route.snapshot.data['moduleKey'] as
      | string
      | undefined;
    const loader = moduleKey ? SHARE_MODULE_LOADERS[moduleKey] : undefined;

    if (!loader) {
      this.router.navigateByUrl('/not-found');
      return;
    }

    this.loadedComponent.set(await loader());
  }
}
