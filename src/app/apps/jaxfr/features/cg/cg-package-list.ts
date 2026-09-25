import { DOCUMENT } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Router, RouterModule } from '@angular/router';
import { CgPackageRole } from '../../../../core/domains/cg/cg.constants';
import { CgService } from '../../../../core/domains/cg/cg.service';
import {
  layerSummary,
  packageRoleLabel,
  setCgDesktopViewport,
} from '../../../../core/domains/cg/cg.util';

@Component({
  selector: 'app-cg-package-list',
  standalone: true,
  imports: [RouterModule, FormsModule, MatButtonModule, MatIconModule],
  templateUrl: './cg-package-list.html',
  styleUrl: './cg-package-list.scss',
})
export class CgPackageList implements OnInit, OnDestroy {
  readonly cg = inject(CgService);
  private router = inject(Router);
  private document = inject(DOCUMENT);

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
    setCgDesktopViewport(this.document, true);
    void this.cg.fetchAllPackages();
    this.cg.clearDraft();
  }

  ngOnDestroy(): void {
    setCgDesktopViewport(this.document, false);
  }

  refresh(): void {
    void this.cg.fetchAllPackages(true);
  }

  newPackage(): void {
    void this.router.navigate(['/cg/new']);
  }
}
