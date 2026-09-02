import { createAdminClient, readServiceKey } from '../_shared/admin-client.ts';

const SUPER_ADMIN_ROLE = 998;
const RECORD_ACTIVE = 1;
const MIN_PASSWORD_LENGTH = 6;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

interface Body {
  user_id?: unknown;
  password?: unknown;
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
  const password =
    typeof payload.password === 'string' ? payload.password : '';
  if (!targetUserId || password.length < MIN_PASSWORD_LENGTH) {
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
    actor.role < SUPER_ADMIN_ROLE
  ) {
    return jsonResponse({ error: 'forbidden' }, 403);
  }

  const { data: target, error: targetError } = await supabase
    .from('tyapp_user')
    .select('user_id, deleted_at')
    .eq('user_id', targetUserId)
    .maybeSingle();

  if (targetError || !target || target.deleted_at) {
    return jsonResponse({ error: 'user_unavailable' }, 400);
  }

  const { error: updateError } = await supabase.auth.admin.updateUserById(
    targetUserId,
    { password },
  );

  if (updateError) {
    console.error('set-user-password update', updateError);
    const message = (updateError.message ?? '').toLowerCase();
    if (
      message.includes('leaked') ||
      message.includes('pwned') ||
      message.includes('weak')
    ) {
      return jsonResponse({ error: 'weak_password' }, 400);
    }
    return jsonResponse({ error: 'update_failed' }, 400);
  }

  return jsonResponse({ ok: true });
});
