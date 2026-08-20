import { CommonModule } from '@angular/common';
import {
  Component,
  DoCheck,
  HostListener,
  NgZone,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { RouterModule } from '@angular/router';
import { RecordStatus } from '../../../../core/models/status.enum';
import {
  HeaderAction,
  HeaderService,
} from '../../../../core/services/header.service';
import { TyWebSettings } from './tyweb.model';
import { TywebService } from './tyweb.service';

@Component({
  selector: 'app-tyweb-edit',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatSlideToggleModule,
  ],
  templateUrl: './tyweb-edit.html',
  styleUrl: './tyweb-edit.scss',
})
export class TywebEdit implements OnInit, OnDestroy, DoCheck {
  private zone = inject(NgZone);
  private headerService = inject(HeaderService);
  readonly tywebService = inject(TywebService);

  readonly RecordStatus = RecordStatus;

  item = signal<TyWebSettings | null>(null);
  originalDataStr = signal('');
  isDirty = signal(false);
  isSaveDisabled = signal(true);

  syncStatus = computed<'loading' | 'up-to-date' | 'unsaved' | 'none'>(() => {
    if (this.tywebService.loading()) return 'loading';
    if (this.isDirty()) return 'unsaved';
    if (this.item()) return 'up-to-date';
    return 'none';
  });

  @HostListener('window:beforeunload', ['$event'])
  onBeforeUnload(event: BeforeUnloadEvent) {
    if (this.isDirty()) {
      event.preventDefault();
      return false;
    }
    return true;
  }

  ngDoCheck() {
    const current = this.item();
    const original = this.originalDataStr();

    if (current && original) {
      const currentlyDirty = JSON.stringify(current) !== original;
      if (this.isDirty() !== currentlyDirty) {
        this.isDirty.set(currentlyDirty);
      }

      const disabled = this.tywebService.loading() || !currentlyDirty;
      if (this.isSaveDisabled() !== disabled) {
        this.isSaveDisabled.set(disabled);
      }
    } else if (!this.isSaveDisabled()) {
      this.isSaveDisabled.set(true);
    }
  }

  async ngOnInit() {
    const actions: HeaderAction[] = [
      {
        label: 'Save Changes',
        icon: 'check',
        type: 'primary',
        disabled: this.isSaveDisabled,
        onClick: () => this.onSave(),
      },
    ];

    this.headerService.setConfig({
      title: 'Tyweb Control',
      backLink: '/welcome',
      syncStatus: this.syncStatus,
      actions,
    });

    const fresh = await this.tywebService.fetch();
    this.zone.run(() => {
      if (fresh) {
        this.item.set(structuredClone(fresh));
        this.originalDataStr.set(JSON.stringify(fresh));
      } else {
        this.item.set(null);
        this.originalDataStr.set('');
      }
    });
  }

  async onSave() {
    const data = this.item();
    if (!data) return;

    const success = await this.tywebService.save(data);
    if (success) {
      const saved = this.tywebService.settings();
      this.zone.run(() => {
        if (saved) {
          this.item.set(structuredClone(saved));
          this.originalDataStr.set(JSON.stringify(saved));
        }
        this.isDirty.set(false);
      });
    }
  }

  ngOnDestroy() {
    this.headerService.clear();
  }
}
