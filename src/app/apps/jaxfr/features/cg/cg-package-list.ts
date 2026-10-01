import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Router, RouterModule } from '@angular/router';
import { CgPackageRole } from '../../../../core/domains/cg/cg.constants';
import { CgService } from '../../../../core/domains/cg/cg.service';
import {
  layerSummary,
  packageRoleLabel,
} from '../../../../core/domains/cg/cg.util';
import { HeaderService } from '../../../../core/services/header.service';

@Component({
  selector: 'app-cg-package-list',
  standalone: true,
  imports: [
    RouterModule,
    FormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './cg-package-list.html',
  styleUrl: './cg-package-list.scss',
})
export class CgPackageList implements OnInit, OnDestroy {
  readonly cg = inject(CgService);
  private router = inject(Router);
  private headerService = inject(HeaderService);

  readonly Source = CgPackageRole.Source;
  searchQuery = signal('');

  listVm = computed(() => {
    const q = this.searchQuery().toLowerCase().trim();
    const layers = this.cg.layers();
    return this.cg
      .packages()
      .filter((pkg) => !q || pkg.name.toLowerCase().includes(q))
      .map((pkg) => {
        const packageLayers = layers.filter(
          (layer) => layer.package_id === pkg.tb_tyapp_cgpk_id,
        );
        return {
          ...pkg,
          roleLabel: packageRoleLabel(pkg.role),
          layerSummary: layerSummary(packageLayers),
        };
      });
  });

  ngOnInit(): void {
    const isLoading = computed(() => this.cg.loading());
    this.headerService.setConfig({
      title: 'CG',
      backLink: '/welcome',
      actions: [
        {
          label: 'Refresh',
          icon: 'refresh',
          type: 'secondary',
          disabled: isLoading,
          onClick: () => this.refresh(),
        },
        {
          label: 'New package',
          icon: 'add',
          type: 'primary',
          disabled: isLoading,
          onClick: () => this.newPackage(),
        },
      ],
    });
    void this.cg.fetchAllPackages();
    this.cg.clearDraft();
  }

  ngOnDestroy(): void {
    this.headerService.clear();
  }

  refresh(): void {
    void this.cg.fetchAllPackages(true);
  }

  newPackage(): void {
    void this.router.navigate(['/cg/new']);
  }
}
