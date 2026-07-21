import { Pipe, PipeTransform } from '@angular/core';
import { TyappUser } from '../models/user.model';

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
      case 1:
        result = buildName(
          legal_first_name,
          legal_middle_name,
          legal_last_name,
        );
        break;
      case 2:
        result = buildName(
          legal_last_name,
          legal_middle_name,
          legal_first_name,
        );
        break;
      case 3:
        result = buildName(
          preferred_first_name,
          legal_middle_name,
          legal_last_name,
        );
        break;
      case 4:
        result = buildName(
          legal_last_name,
          legal_middle_name,
          preferred_first_name,
        );
        break;
      case 5:
        result = customized_display_name || '';
        break;
      default:
        result = customized_display_name || '';
    }

    return result.trim() || user_id || 'Unknown User';
  }
}
