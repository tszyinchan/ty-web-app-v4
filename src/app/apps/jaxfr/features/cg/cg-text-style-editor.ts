import { Component, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonToggleChange, MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { CgWheelSelect, CgWheelStep } from '../../../../core/domains/cg/cg-wheel.directive';
import {
  CG_SUBTITLE_FONT_GROUPS,
  CG_SUBTITLE_FONT_OPTIONS,
  CG_TEXT_GRADIENT_ANGLE,
  CG_TEXT_GRADIENT_TO,
  CG_TEXT_WEIGHT_BOLD,
  CG_TEXT_WEIGHT_REGULAR,
  CgSubtitleFontGroup,
} from '../../../../core/domains/cg/cg.constants';
import { CgSubtitleStyle } from '../../../../core/domains/cg/cg.model';

@Component({
  selector: 'app-cg-text-style-editor',
  standalone: true,
  imports: [FormsModule, MatButtonToggleModule, MatIconModule, CgWheelSelect, CgWheelStep],
  templateUrl: './cg-text-style-editor.html',
  styleUrl: './cg-text-style-editor.scss',
})
export class CgTextStyleEditor {
  readonly paint = input.required<CgSubtitleStyle>();
  readonly changed = output<void>();

  readonly fontGroups = CG_SUBTITLE_FONT_GROUPS;
  readonly fontOptions = CG_SUBTITLE_FONT_OPTIONS;
  readonly textGradientTo = CG_TEXT_GRADIENT_TO;
  readonly textGradientAngle = CG_TEXT_GRADIENT_ANGLE;
  readonly customFontOpen = signal(false);
  readonly fontWheelValues: readonly string[] = [
    '',
    ...CG_SUBTITLE_FONT_GROUPS.flatMap((group) =>
      CG_SUBTITLE_FONT_OPTIONS.filter((font) => font.group === group.id).map(
        (font) => font.value,
      ),
    ) as string[],
  ];

  fontsInGroup(group: CgSubtitleFontGroup) {
    return this.fontOptions.filter((font) => font.group === group);
  }

  selectedFontValue(): string {
    if (this.customFontOpen()) return '__custom__';
    const family = this.paint().fontFamily?.trim();
    if (!family) return '';
    const match = this.fontOptions.find((opt) => opt.value === family);
    return match ? match.value : '__custom__';
  }

  isCustomFont(): boolean {
    return this.selectedFontValue() === '__custom__';
  }

  onFontSelect(value: string): void {
    if (value === '__custom__') {
      this.customFontOpen.set(true);
      this.changed.emit();
      return;
    }
    this.customFontOpen.set(false);
    this.paint().fontFamily = value || undefined;
    this.changed.emit();
  }

  toggles(): string[] {
    const style = this.paint();
    const values: string[] = [];
    if (style.fontWeight === CG_TEXT_WEIGHT_BOLD) values.push('bold');
    if (style.italic) values.push('italic');
    if (style.underline) values.push('underline');
    if (style.strike) values.push('strike');
    return values;
  }

  onToggles(event: MatButtonToggleChange): void {
    const raw = Array.isArray(event.value)
      ? event.value
      : event.source.buttonToggleGroup?.value;
    const selected = Array.isArray(raw) ? raw : [];
    const style = this.paint();
    style.fontWeight = selected.includes('bold')
      ? CG_TEXT_WEIGHT_BOLD
      : CG_TEXT_WEIGHT_REGULAR;
    style.italic = selected.includes('italic');
    style.underline = selected.includes('underline');
    style.strike = selected.includes('strike');
    this.changed.emit();
  }

  gradientOn(): boolean {
    return this.paint().gradientTo !== undefined;
  }

  onFill(event: MatButtonToggleChange): void {
    const style = this.paint();
    if (event.value === 'gradient') {
      style.gradientTo = style.gradientTo || CG_TEXT_GRADIENT_TO;
      style.gradientAngle = style.gradientAngle ?? CG_TEXT_GRADIENT_ANGLE;
    } else {
      style.gradientTo = undefined;
      style.gradientAngle = undefined;
    }
    this.changed.emit();
  }

  touch(): void {
    this.changed.emit();
  }
}
