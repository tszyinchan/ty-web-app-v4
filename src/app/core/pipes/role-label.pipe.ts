import { Pipe, PipeTransform } from '@angular/core';
import { USER_ROLES } from '../models/user.model';

@Pipe({
  name: 'tyRoleLabel',
  standalone: true,
})
export class RoleLabelPipe implements PipeTransform {
  transform(role: number | undefined | null): string {
    if (role === undefined || role === null) return 'Guest';

    if (role >= USER_ROLES.SUPER_ADMIN) return 'Super Administrator';
    if (role >= USER_ROLES.ADMIN) return 'Administrator';
    if (role >= USER_ROLES.USER) return 'User';

    return 'Unknown';
  }
}
