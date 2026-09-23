import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
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
  imports: [RouterModule, FormsModule, MatIconModule],
  templateUrl: './cg-package-list.html',
  styleUrl: './cg-package-list.scss',
})
export class CgPackageList implements OnInit, OnDestroy {
  readonly cg = inject(CgService);
  private headerService = inject(HeaderService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

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
    this.headerService.setConfig({
      actions: [
        {
          label: 'Refresh',
          icon: 'refresh',
          type: 'secondary',
          disabled: this.cg.loading,
          onClick: () => void this.cg.fetchAllPackages(true),
        },
        {
          label: 'New package',
          icon: 'add',
          type: 'primary',
          disabled: this.cg.loading,
          onClick: () =>
            this.router.navigate(['../new'], { relativeTo: this.route }),
        },
      ],
    });
    void this.cg.fetchAllPackages();
    this.cg.clearDraft();
  }

  ngOnDestroy(): void {
    this.headerService.clear();
  }
}
