import { inject, NgZone } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SupabaseService } from '../services/supabase.service';

/**
 * Gates the `share` subdomain's `:accessKey/:moduleId` route. Both segments are
 * opaque random strings validated server-side via a Postgres RPC that never
 * returns the real secrets to the browser - only the internal `module_key`
 * (or null) needed to decide which public module component to render.
 *
 * On any failure (wrong key, unknown module, RPC error) we redirect to the
 * same generic not-found route regardless of cause, so a wrong guess is
 * indistinguishable from a URL that never existed.
 */
export const publicAccessGuard: CanActivateFn = async (route) => {
  const supabase = inject(SupabaseService).client;
  const router = inject(Router);
  const zone = inject(NgZone);

  const accessKey = route.paramMap.get('accessKey');
  const moduleId = route.paramMap.get('moduleId');

  const { data, error } = await supabase.rpc('tyapp_validate_share_access', {
    p_access_key: accessKey,
    p_module_id: moduleId,
  });

  return zone.run(() => {
    const moduleKey = data as string | null;

    if (error || !moduleKey) {
      return router.parseUrl('/not-found');
    }

    route.data = { ...route.data, moduleKey };
    return true;
  });
};
