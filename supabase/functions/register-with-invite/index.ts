import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

const USER_ROLE = 100;
const RECORD_ACTIVE = 1;
const NAME_DISPLAY_CUSTOMIZED_ONLY = 5;
const GENERIC_INVITE_ERROR = 'invalid_invite';
const MIN_PASSWORD_LENGTH = 6;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

interface RegisterBody {
  code?: unknown;
  email?: unknown;
  password?: unknown;
  display_name?: unknown;
  legal_first_name?: unknown;
  legal_last_name?: unknown;
}

interface InvitationRow {
  tb_tyapp_inv_id: string;
  code: string;
  status: number;
  max_uses: number;
  uses_count: number;
  expires_at: string | null;
  app_ids: string[] | null;
  feature_ids: string[] | null;
  group_id: string | null;
  deleted_at: string | null;
}

interface AppRow {
  tb_tyapp_app_id: string;
  name: string;
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

function readServiceKey(): string {
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

function asTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isInviteUsable(row: InvitationRow): boolean {
  if (row.deleted_at) return false;
  if (row.status !== RECORD_ACTIVE) return false;
  if (row.uses_count >= row.max_uses) return false;
  if (row.expires_at) {
    const expires = new Date(row.expires_at).getTime();
    if (Number.isNaN(expires) || expires <= Date.now()) return false;
  }
  return true;
}

async function nextProfileSeq(supabase: SupabaseClient): Promise<number> {
  const { data, error } = await supabase
    .from('tyapp_user')
    .select('tb_tyapp_pofl_seq_no')
    .order('tb_tyapp_pofl_seq_no', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  const current =
    data && typeof data.tb_tyapp_pofl_seq_no === 'number'
      ? data.tb_tyapp_pofl_seq_no
      : 0;
  return current + 1;
}

async function rollbackUser(
  supabase: SupabaseClient,
  userId: string,
): Promise<void> {
  await supabase
    .from('tyapp_user_group_member')
    .delete()
    .eq('user_id', userId);
  await supabase
    .from('tyapp_user_feature_access')
    .delete()
    .eq('user_id', userId);
  await supabase.from('tyapp_user_app_access').delete().eq('user_id', userId);
  await supabase.from('tyapp_user').delete().eq('user_id', userId);
  await supabase.auth.admin.deleteUser(userId);
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

  let payload: RegisterBody;
  try {
    payload = (await req.json()) as RegisterBody;
  } catch {
    return jsonResponse({ error: 'invalid_request' }, 400);
  }

  const code = asTrimmedString(payload.code);
  const email = asTrimmedString(payload.email).toLowerCase();
  const password = typeof payload.password === 'string' ? payload.password : '';
  const displayName = asTrimmedString(payload.display_name);
  const legalFirstName = asTrimmedString(payload.legal_first_name) || null;
  const legalLastName = asTrimmedString(payload.legal_last_name) || null;

  if (
    !code ||
    !email ||
    !displayName ||
    password.length < MIN_PASSWORD_LENGTH
  ) {
    return jsonResponse({ error: 'invalid_request' }, 400);
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  const { data: inviteData, error: inviteError } = await supabase
    .from('tyapp_invitation')
    .select(
      'tb_tyapp_inv_id, code, status, max_uses, uses_count, expires_at, app_ids, feature_ids, group_id, deleted_at',
    )
    .eq('code', code)
    .is('deleted_at', null)
    .maybeSingle();

  if (inviteError) {
    return jsonResponse({ error: GENERIC_INVITE_ERROR }, 400);
  }

  const invite = inviteData as InvitationRow | null;
  if (!invite || !isInviteUsable(invite)) {
    return jsonResponse({ error: GENERIC_INVITE_ERROR }, 400);
  }

  const { data: created, error: createError } =
    await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

  if (createError || !created.user) {
    const message = (createError?.message ?? '').toLowerCase();
    if (
      message.includes('already') ||
      message.includes('registered') ||
      message.includes('exists')
    ) {
      return jsonResponse({ error: 'email_taken' }, 409);
    }
    return jsonResponse({ error: GENERIC_INVITE_ERROR }, 400);
  }

  const userId = created.user.id;

  try {
    const seqNo = await nextProfileSeq(supabase);
    const appIds = [...new Set((invite.app_ids ?? []).filter(Boolean))];
    const featureIds = [...new Set((invite.feature_ids ?? []).filter(Boolean))];

    let allowedApps: string[] = [];
    let filteredAppIds: string[] = [];
    if (appIds.length > 0) {
      const { data: appRows, error: appError } = await supabase
        .from('tyapp_app')
        .select('tb_tyapp_app_id, name')
        .in('tb_tyapp_app_id', appIds)
        .is('deleted_at', null);
      if (appError) throw appError;
      const apps = (appRows ?? []) as AppRow[];
      allowedApps = apps.map((app) => app.name.toLowerCase());
      const validAppIds = new Set(apps.map((app) => app.tb_tyapp_app_id));
      filteredAppIds = appIds.filter((id) => validAppIds.has(id));
    }

    const { error: profileError } = await supabase.from('tyapp_user').insert({
      user_id: userId,
      tb_tyapp_pofl_seq_no: seqNo,
      role: USER_ROLE,
      legal_first_name: legalFirstName,
      legal_last_name: legalLastName,
      legal_middle_name: null,
      preferred_first_name: null,
      customized_display_name: displayName,
      name_display_mode: NAME_DISPLAY_CUSTOMIZED_ONLY,
      status: RECORD_ACTIVE,
      remarks: null,
      appsheet_525_user_id: null,
      allowed_apps: allowedApps,
    });
    if (profileError) throw profileError;

    if (filteredAppIds.length > 0) {
      const { error: appGrantError } = await supabase
        .from('tyapp_user_app_access')
        .insert(filteredAppIds.map((app_id) => ({ user_id: userId, app_id })));
      if (appGrantError) throw appGrantError;
    }

    if (featureIds.length > 0) {
      const { data: featureRows, error: featureLookupError } = await supabase
        .from('tyapp_app_feature')
        .select('tb_tyapp_ap_ftr_id')
        .in('tb_tyapp_ap_ftr_id', featureIds)
        .is('deleted_at', null);
      if (featureLookupError) throw featureLookupError;
      const validFeatureIds = new Set(
        (featureRows ?? []).map(
          (row) => row.tb_tyapp_ap_ftr_id as string,
        ),
      );
      const filteredFeatureIds = featureIds.filter((id) =>
        validFeatureIds.has(id),
      );
      if (filteredFeatureIds.length > 0) {
        const { error: featureGrantError } = await supabase
          .from('tyapp_user_feature_access')
          .insert(
            filteredFeatureIds.map((feature_id) => ({
              user_id: userId,
              feature_id,
            })),
          );
        if (featureGrantError) throw featureGrantError;
      }
    }

    if (invite.group_id) {
      const { data: groupRow, error: groupError } = await supabase
        .from('tyapp_user_group')
        .select('tb_tyapp_usr_grp_id, status, deleted_at')
        .eq('tb_tyapp_usr_grp_id', invite.group_id)
        .maybeSingle();
      if (groupError) throw groupError;
      if (
        groupRow &&
        !groupRow.deleted_at &&
        groupRow.status === RECORD_ACTIVE
      ) {
        const { error: memberError } = await supabase
          .from('tyapp_user_group_member')
          .insert({ group_id: invite.group_id, user_id: userId });
        if (memberError) throw memberError;
      }
    }

    const { data: consumed, error: consumeError } = await supabase
      .from('tyapp_invitation')
      .update({ uses_count: invite.uses_count + 1 })
      .eq('tb_tyapp_inv_id', invite.tb_tyapp_inv_id)
      .eq('uses_count', invite.uses_count)
      .is('deleted_at', null)
      .select('tb_tyapp_inv_id')
      .maybeSingle();

    if (consumeError) throw consumeError;
    if (!consumed) {
      throw new Error('invite_race');
    }

    return jsonResponse({ ok: true });
  } catch {
    await rollbackUser(supabase, userId);
    return jsonResponse({ error: GENERIC_INVITE_ERROR }, 400);
  }
});
