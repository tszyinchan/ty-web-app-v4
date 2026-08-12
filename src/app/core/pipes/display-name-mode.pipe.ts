import { Pipe, PipeTransform } from '@angular/core';
import { NameDisplayMode } from '../models/user.model';

@Pipe({
  name: 'tyDisplayNameMode',
  standalone: true
})
export class DisplayNameModePipe implements PipeTransform {
  transform(mode: number): string {
    const modes: { [key: number]: string } = {
      [NameDisplayMode.LegalFirstMiddleLast]: 'Legal Name (First Middle Last)',
      [NameDisplayMode.LegalLastMiddleFirst]: 'Legal Name (Last Middle First)',
      [NameDisplayMode.PreferredFirstMiddleLast]: 'Preferred Name (First Middle Last)',
      [NameDisplayMode.PreferredLastMiddleFirst]: 'Preferred Name (Last Middle First)',
      [NameDisplayMode.CustomizedOnly]: 'Customized Only'
    };
    return modes[mode] || `Unknown Mode (${mode})`;
  }
}