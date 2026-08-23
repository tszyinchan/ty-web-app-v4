import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';

import { HeaderService } from '../../../../core/services/header.service';
import { DailyChecklistTemplateItem } from './daily-checklist.model';
import { DailyChecklistService } from './daily-checklist.service';

@Component({
  selector: 'app-daily-checklist-standard',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
  ],
  templateUrl: './daily-checklist-standard.html',
  styleUrl: './daily-checklist-standard.scss',
})
export class DailyChecklistStandard implements OnInit, OnDestroy {
  readonly service = inject(DailyChecklistService);
  private headerService = inject(HeaderService);

  newText = '';
  newRemarks = '';
  editingId = signal<string | null>(null);
  editText = '';
  editRemarks = '';

  ngOnInit() {
    const isBusy = computed(
      () => this.service.templateLoading() || this.service.busy(),
    );

    this.headerService.setConfig({
      title: 'Standard Checklist',
      backLink: '/daily-checklist',
      actions: [
        {
          label: 'Refresh',
          icon: 'refresh',
          type: 'secondary',
          disabled: isBusy,
          onClick: () => void this.service.fetchTemplateItems(true),
        },
      ],
    });

    void this.service.fetchTemplateItems();
  }

  ngOnDestroy() {
    this.headerService.clear();
  }

  async onAdd() {
    const text = this.newText.trim();
    if (!text) return;
    const ok = await this.service.addTemplateItem(text, this.newRemarks);
    if (ok) {
      this.newText = '';
      this.newRemarks = '';
    }
  }

  startEdit(item: DailyChecklistTemplateItem) {
    this.editingId.set(item.tb_tyapp_dcl_tpl_itm_id);
    this.editText = item.item_text;
    this.editRemarks = item.remarks ?? '';
  }

  cancelEdit() {
    this.editingId.set(null);
    this.editText = '';
    this.editRemarks = '';
  }

  async saveEdit() {
    const id = this.editingId();
    if (!id) return;
    const ok = await this.service.updateTemplateItem(
      id,
      this.editText,
      this.editRemarks,
    );
    if (ok) this.cancelEdit();
  }

  async onDelete(item: DailyChecklistTemplateItem) {
    if (!confirm(`Delete "${item.item_text}" from the Standard Checklist?`)) {
      return;
    }
    if (this.editingId() === item.tb_tyapp_dcl_tpl_itm_id) this.cancelEdit();
    await this.service.deleteTemplateItem(item.tb_tyapp_dcl_tpl_itm_id);
  }

  async move(item: DailyChecklistTemplateItem, direction: -1 | 1) {
    await this.service.moveTemplateItem(item.tb_tyapp_dcl_tpl_itm_id, direction);
  }

  canMoveUp(index: number): boolean {
    return index > 0;
  }

  canMoveDown(index: number): boolean {
    return index < this.service.templateItems().length - 1;
  }
}
