import { createAdminClient, readServiceKey } from '../_shared/admin-client.ts';

const ADMIN_ROLE = 900;
const SUPER_ADMIN_ROLE = 998;
const RECORD_ACTIVE = 1;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

interface Body {
  user_id?: unknown;
  redirect_to?: unknown;
}

function jsonResponse(
  body: Record<string, unknown>,
  status = 200,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

function asTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function bearerToken(header: string | null): string {
  if (!header) return '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? '';
}

function isAllowedRedirect(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.pathname !== '/reset-password') return false;
    if (parsed.search || parsed.hash) return false;
    if (
      parsed.protocol === 'http:' &&
      (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') &&
      parsed.port === '4200'
    ) {
      return true;
    }
    // Production Jaxfr is app.tszyin.com — not jaxfr.*
    if (
      parsed.protocol === 'https:' &&
      parsed.hostname === 'app.tszyin.com'
    ) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

function canManageTarget(
  actorRole: number,
  targetRole: number,
): boolean {
  if (actorRole >= SUPER_ADMIN_ROLE) return true;
  if (actorRole >= ADMIN_ROLE) return targetRole < SUPER_ADMIN_ROLE;
  return false;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'invalid_request' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = readServiceKey();
  if (!supabaseUrl || !serviceKey) {
    return jsonResponse({ error: 'invalid_request' }, 500);
  }

  const jwt = bearerToken(req.headers.get('Authorization'));
  if (!jwt || jwt.startsWith('sb_')) {
    return jsonResponse({ error: 'unauthorized' }, 401);
  }

  let payload: Body;
  try {
    payload = (await req.json()) as Body;
  } catch {
    return jsonResponse({ error: 'invalid_request' }, 400);
  }

  const targetUserId = asTrimmedString(payload.user_id);
  const redirectTo = asTrimmedString(payload.redirect_to);
  if (!targetUserId || !isAllowedRedirect(redirectTo)) {
    return jsonResponse({ error: 'invalid_request' }, 400);
  }

  const supabase = createAdminClient(supabaseUrl, serviceKey);
  const { data: authData, error: authError } =
    await supabase.auth.getUser(jwt);
  if (authError || !authData.user) {
    return jsonResponse({ error: 'unauthorized' }, 401);
  }

  const { data: actor, error: actorError } = await supabase
    .from('tyapp_user')
    .select('user_id, role, status, deleted_at')
    .eq('user_id', authData.user.id)
    .maybeSingle();

  if (
    actorError ||
    !actor ||
    actor.deleted_at ||
    actor.status !== RECORD_ACTIVE ||
    actor.role < ADMIN_ROLE
  ) {
    return jsonResponse({ error: 'forbidden' }, 403);
  }

  const { data: target, error: targetError } = await supabase
    .from('tyapp_user')
    .select('user_id, role, deleted_at')
    .eq('user_id', targetUserId)
    .maybeSingle();

  if (targetError || !target || target.deleted_at) {
    return jsonResponse({ error: 'user_unavailable' }, 400);
  }
  if (!canManageTarget(actor.role, target.role)) {
    return jsonResponse({ error: 'forbidden' }, 403);
  }

  const { data: authUser, error: lookupError } =
    await supabase.auth.admin.getUserById(targetUserId);
  const email = authUser.user?.email;
  if (lookupError || !email) {
    return jsonResponse({ error: 'user_unavailable' }, 400);
  }

  const { error: resetError } = await supabase.auth.resetPasswordForEmail(
    email,
    { redirectTo },
  );
  if (resetError) {
    console.error('send-password-reset', resetError);
    return jsonResponse({ error: 'update_failed' }, 400);
  }

  return jsonResponse({ ok: true });
});
