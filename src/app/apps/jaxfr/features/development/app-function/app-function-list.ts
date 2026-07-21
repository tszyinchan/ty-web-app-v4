import { CommonModule } from "@angular/common";
import { Component, OnInit, OnDestroy, inject, computed } from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { RouterModule, Router, ActivatedRoute } from "@angular/router";
import { HeaderService } from "../../../../../core/services/header.service";
import { exportToCsv } from "../../../../../core/utils/csv-export.util";
import { AppCategoryService } from "../app-category/app-category.service";
import { AppFunctionService } from "./app-function.service";

@Component({
  selector: 'app-function-list',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './app-function-list.html',
})
export class AppFunctionList implements OnInit, OnDestroy {
  public functionService = inject(AppFunctionService);
  public categoryService = inject(AppCategoryService);
  private headerService = inject(HeaderService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  listVM = computed(() => {
    const functions = this.functionService.functions();
    const categories = this.categoryService.categories();

    return functions.map((func) => {
      const cat = categories.find(
        (c) => c.tb_tyapp_ap_ctgy_id === func.category_id,
      );
      return {
        ...func,
        categoryName: cat ? cat.display_name : 'Unknown Category',
      };
    });
  });

  ngOnInit() {
    const isLoading = computed(
      () => this.functionService.loading() || this.categoryService.loading(),
    );
    const isExportDisabled = computed(
      () => isLoading() || this.functionService.functions().length === 0,
    );

    this.headerService.setConfig({
      actions: [
        {
          label: 'Refresh',
          icon: 'refresh',
          type: 'secondary',
          disabled: isLoading,
          onClick: () => this.onRefresh(),
        },
        {
          label: 'Export',
          icon: 'download',
          type: 'secondary',
          disabled: isExportDisabled,
          onClick: () => this.onExport(),
        },
        {
          label: 'New Function',
          icon: 'add',
          type: 'primary',
          disabled: isLoading,
          onClick: () =>
            this.router.navigate(['../new'], { relativeTo: this.route }),
        },
      ],
    });

    this.functionService.fetchAllFunctions();
    this.categoryService.fetchAllCategories();
  }

  ngOnDestroy() {
    this.headerService.clear();
  }

  async onRefresh() {
    await this.functionService.fetchAllFunctions(true);
    await this.categoryService.fetchAllCategories(true);
  }

  onExport() {
    const data = this.listVM();
    if (data.length === 0) return;

    const headers = ['Function ID', 'Function Name', 'Category Name', 'Status'];
    const rows = data.map((item) => [
      item.tb_tyapp_ap_func_id,
      item.function_name,
      item.categoryName,
      item.status === 1 ? 'Active' : 'Inactive',
    ]);

    exportToCsv('App_Function_List', headers, rows);
  }
}
