import { Component, input } from '@angular/core';
import { CgPreviewBackdrop } from './cg.constants';

@Component({
  selector: 'app-cg-stage',
  standalone: true,
  templateUrl: './cg-stage.html',
  styleUrl: './cg-stage.scss',
})
export class CgStage {
  readonly preview = input(false);
  readonly backdrop = input<CgPreviewBackdrop>(CgPreviewBackdrop.Checkerboard);
}
