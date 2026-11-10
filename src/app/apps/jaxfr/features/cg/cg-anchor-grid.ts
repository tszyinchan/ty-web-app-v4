import { Component, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { CG_ANCHOR_GRID_OPTIONS, CgAnchor } from '../../../../core/domains/cg/cg.constants';

/**
 * 3×3 Anchor picker. The cell position is the Stage position.
 * Stored values stay the nine `CgAnchor` strings; only the display changed.
 */
@Component({
  selector: 'app-cg-anchor-grid',
  standalone: true,
  imports: [MatIconModule],
  templateUrl: './cg-anchor-grid.html',
  styleUrl: './cg-anchor-grid.scss',
})
export class CgAnchorGrid {
  readonly value = input.required<CgAnchor>();
  readonly label = input('Anchor');
  readonly picked = output<CgAnchor>();

  readonly anchors = CG_ANCHOR_GRID_OPTIONS;

  pick(anchor: CgAnchor): void {
    if (anchor !== this.value()) this.picked.emit(anchor);
  }
}
