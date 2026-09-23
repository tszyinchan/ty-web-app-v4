import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { CgService } from '../../../../core/domains/cg/cg.service';
import { countLogoSlots, packageRoleLabel } from '../../../../core/domains/cg/cg.util';
import { HeaderService } from '../../../../core/services/header.service';

@Component({
  selector: 'app-cg-package-list',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  templateUrl: './cg-package-list.html',
  styleUrl: './cg-package-list.scss',
})
export class CgPackageList implements OnInit, OnDestroy {
  readonly cg = inject(CgService);
  private headerService = inject(HeaderService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  searchQuery = signal('');

  listVm = computed(() => {
    const q = this.searchQuery().toLowerCase().trim();
    const slots = this.cg.slots();
    return this.cg
      .packages()
      .filter((pkg) => !q || pkg.name.toLowerCase().includes(q))
      .map((pkg) => {
        const packageSlots = slots.filter(
          (slot) => slot.package_id === pkg.tb_tyapp_cgpk_id,
        );
        return {
          ...pkg,
          roleLabel: packageRoleLabel(pkg.role),
          logoCount: countLogoSlots(packageSlots),
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
  }

  ngOnDestroy(): void {
    this.headerService.clear();
  }
}
