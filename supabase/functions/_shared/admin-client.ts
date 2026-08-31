import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

export function readServiceKey(): string {
  const raw = Deno.env.get('SUPABASE_SECRET_KEYS') ?? '';
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const preferred =
        parsed['default'] ?? parsed['service_role'] ?? Object.values(parsed)[0];
      if (typeof preferred === 'string' && preferred) return preferred;
    } catch {
      // fall through to the other env vars
    }
  }
  const single = Deno.env.get('SUPABASE_SECRET_KEY') ?? '';
  if (single) return single;
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
}

function isOpaqueApiKey(key: string): boolean {
  return key.startsWith('sb_secret_') || key.startsWith('sb_publishable_');
}

/**
 * Admin client that bypasses RLS. Opaque sb_secret_ keys are not JWTs, so
 * they must go on `apikey` only — never `Authorization: Bearer`.
 */
export function createAdminClient(
  url: string,
  key: string,
): SupabaseClient {
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        headers.set('apikey', key);
        if (isOpaqueApiKey(key)) {
          const auth = headers.get('Authorization');
          if (auth && /^Bearer\s+sb_/i.test(auth)) {
            headers.delete('Authorization');
          }
        }
        return fetch(input, { ...init, headers });
      },
    },
  });
}
