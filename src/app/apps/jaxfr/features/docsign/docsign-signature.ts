import { DatePipe } from '@angular/common';
import {
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleChange, MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

import { DisplayNamePipe } from '../../../../core/pipes/display-name.pipe';
import { AuthService } from '../../../../core/services/auth.service';
import { HeaderService } from '../../../../core/services/header.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { DocsignSignatureKind } from './docsign.model';
import { DocsignService } from './docsign.service';
import { sanitizeSignatureSvg } from './docsign.util';

interface DrawPoint {
  x: number;
  y: number;
}

@Component({
  selector: 'app-docsign-signature',
  standalone: true,
  imports: [
    DatePipe,
    FormsModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  providers: [DisplayNamePipe],
  templateUrl: './docsign-signature.html',
  styleUrl: './docsign-signature.scss',
})
export class DocsignSignature implements OnInit, OnDestroy {
  private headerService = inject(HeaderService);
  private auth = inject(AuthService);
  private displayNamePipe = inject(DisplayNamePipe);
  private notification = inject(NotificationService);
  private sanitizer = inject(DomSanitizer);

  public docsignService = inject(DocsignService);

  readonly kindEnum = DocsignSignatureKind;
  private canvasRef = viewChild<ElementRef<HTMLCanvasElement>>('sigCanvas');

  kind = signal<DocsignSignatureKind>(DocsignSignatureKind.Name);
  signedName = signal('');
  signedMark = signal('');
  private strokes: DrawPoint[][] = [];
  private currentStroke: DrawPoint[] | null = null;

  currentSvg = computed(() => {
    const current = this.docsignService.mySignature();
    return this.trustSvg(current?.svg_markup);
  });

  history = computed(() =>
    this.docsignService.mySignatures().slice(1).map((row) => ({
      ...row,
      svgHtml: this.trustSvg(row.svg_markup),
    })),
  );

  async ngOnInit() {
    this.headerService.setConfig({
      backLink: '/docsign/list',
      title: 'My signature',
    });
    const me = this.auth.userProfile();
    this.signedName.set(me ? this.displayNamePipe.transform(me) : '');
    await this.docsignService.fetchMySignatures();
    const current = this.docsignService.mySignature();
    if (current) {
      this.kind.set(current.kind);
      this.signedName.set(current.signed_name);
      this.signedMark.set(current.signed_mark ?? '');
    }
  }

  ngOnDestroy() {
    this.headerService.clear();
  }

  onKindChange(event: MatButtonToggleChange) {
    const value = event.value;
    if (value === DocsignSignatureKind.Draw) {
      this.kind.set(DocsignSignatureKind.Draw);
      return;
    }
    this.kind.set(DocsignSignatureKind.Name);
  }

  onPointerDown(event: PointerEvent) {
    if (this.kind() !== DocsignSignatureKind.Draw) return;
    const canvas = this.canvasRef()?.nativeElement;
    if (!canvas) return;
    canvas.setPointerCapture(event.pointerId);
    this.currentStroke = [this.pointFromEvent(event, canvas)];
    this.redraw(canvas);
  }

  onPointerMove(event: PointerEvent) {
    const canvas = this.canvasRef()?.nativeElement;
    if (!canvas || !this.currentStroke) return;
    this.currentStroke.push(this.pointFromEvent(event, canvas));
    this.redraw(canvas);
  }

  onPointerUp() {
    if (this.currentStroke && this.currentStroke.length > 1) {
      this.strokes.push(this.currentStroke);
    }
    this.currentStroke = null;
  }

  clearDrawing() {
    this.strokes = [];
    this.currentStroke = null;
    const canvas = this.canvasRef()?.nativeElement;
    if (canvas) this.redraw(canvas);
  }

  async onSave() {
    const name = this.signedName().trim();
    if (!name) {
      this.notification.handleError(
        'Save Signature Failed',
        'Legal name is required',
      );
      return;
    }
    const kind = this.kind();
    const mark = this.signedMark().trim();
    if (kind === DocsignSignatureKind.Name && !mark) {
      this.notification.handleError(
        'Save Signature Failed',
        'Signature words are required',
      );
      return;
    }
    const svg =
      kind === DocsignSignatureKind.Draw ? this.strokesToSvg() : null;
    if (kind === DocsignSignatureKind.Draw && !svg) {
      this.notification.handleError(
        'Save Signature Failed',
        'Draw a signature before saving',
      );
      return;
    }
    await this.docsignService.saveUserSignature({
      kind,
      signedName: name,
      signedMark: kind === DocsignSignatureKind.Name ? mark : null,
      svgMarkup: svg,
    });
    this.clearDrawing();
  }

  private pointFromEvent(
    event: PointerEvent,
    canvas: HTMLCanvasElement,
  ): DrawPoint {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  private redraw(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const all = this.currentStroke
      ? [...this.strokes, this.currentStroke]
      : this.strokes;
    for (const stroke of all) {
      if (stroke.length < 2) continue;
      ctx.beginPath();
      ctx.moveTo(stroke[0].x, stroke[0].y);
      for (let i = 1; i < stroke.length; i++) {
        ctx.lineTo(stroke[i].x, stroke[i].y);
      }
      ctx.stroke();
    }
  }

  private strokesToSvg(): string | null {
    const paths = this.strokes
      .filter((stroke) => stroke.length > 1)
      .map((stroke) => {
        const d = stroke
          .map((point, index) =>
            `${index === 0 ? 'M' : 'L'}${point.x.toFixed(1)} ${point.y.toFixed(1)}`,
          )
          .join(' ');
        return d;
      });
    if (paths.length === 0) return null;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 160" width="400" height="160"><path d="${paths.join(' ')}" fill="none" stroke="#111" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }

  private trustSvg(svg: string | null | undefined): SafeHtml | null {
    const clean = sanitizeSignatureSvg(svg);
    if (!clean) return null;
    return this.sanitizer.bypassSecurityTrustHtml(clean);
  }
}
