import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MAT_DIALOG_DATA, MatDialogClose } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { CgOutputFrame } from '../../../../core/domains/cg/cg-output-frame';
import { CgPreviewBackdrop } from '../../../../core/domains/cg/cg.constants';
import { CgService } from '../../../../core/domains/cg/cg.service';

export interface CgOnAirDialogData {
  token: string;
  packageName: string;
}

/** Enlarged Package On air monitor (same live overlay iframe). */
@Component({
  selector: 'app-cg-on-air-dialog',
  standalone: true,
  imports: [
    MatButtonModule,
    MatButtonToggleModule,
    MatDialogClose,
    MatIconModule,
    CgOutputFrame,
  ],
  templateUrl: './cg-on-air-dialog.html',
  styleUrl: './cg-on-air-dialog.scss',
})
export class CgOnAirDialog {
  readonly data = inject<CgOnAirDialogData>(MAT_DIALOG_DATA);
  readonly cg = inject(CgService);
  readonly backdrops = CgPreviewBackdrop;
}
