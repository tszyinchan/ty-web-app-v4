import { NgStyle } from '@angular/common';
import { Component, computed, input } from '@angular/core';
import { DEFAULT_LOGO_LAYOUT } from './cg.constants';
import { CgLayout } from './cg.model';
import { layoutToCss } from './cg.util';

@Component({
  selector: 'app-cg-logo',
  standalone: true,
  imports: [NgStyle],
  templateUrl: './cg-logo.html',
  styleUrl: './cg-logo.scss',
})
export class CgLogo {
  readonly imageUrl = input('');
  readonly layout = input<CgLayout>({ ...DEFAULT_LOGO_LAYOUT });
  readonly visible = input(true);

  readonly css = computed(() => layoutToCss(this.layout()));
  readonly hasFixedWidth = computed(
    () => this.layout().width != null && Number.isFinite(this.layout().width),
  );
}
