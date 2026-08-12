import { Pipe, PipeTransform } from '@angular/core';
import { NameDisplayMode, TyappUser } from '../models/user.model';

@Pipe({
  name: 'tyDisplayName',
  standalone: true,
  pure: false
})
export class DisplayNamePipe implements PipeTransform {
  transform(user: TyappUser | null | undefined): string {
    if (!user) return 'Unknown User';

    const {
      name_display_mode,
      legal_first_name,
      legal_middle_name,
      legal_last_name,
      preferred_first_name,
      customized_display_name,
      user_id,
    } = user;

    const buildName = (...parts: (string | null | undefined)[]) =>
      parts.filter((p) => !!p).join(' ');

    let result = '';

    switch (name_display_mode) {
      case NameDisplayMode.LegalFirstMiddleLast:
        result = buildName(
          legal_first_name,
          legal_middle_name,
          legal_last_name,
        );
        break;
      case NameDisplayMode.LegalLastMiddleFirst:
        result = buildName(
          legal_last_name,
          legal_middle_name,
          legal_first_name,
        );
        break;
      case NameDisplayMode.PreferredFirstMiddleLast:
        result = buildName(
          preferred_first_name,
          legal_middle_name,
          legal_last_name,
        );
        break;
      case NameDisplayMode.PreferredLastMiddleFirst:
        result = buildName(
          legal_last_name,
          legal_middle_name,
          preferred_first_name,
        );
        break;
      case NameDisplayMode.CustomizedOnly:
        result = customized_display_name || '';
        break;
      default:
        result = customized_display_name || '';
    }

    return result.trim() || user_id || 'Unknown User';
  }
}
