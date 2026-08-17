import { createClient } from 'npm:@supabase/supabase-js@2';
import { buildPushPayload } from 'npm:@block65/webcrypto-web-push@1.0.2';

const PUSH_BODY_MAX = 120;

interface ChatMessageRecord {
  tb_tyapp_chat_msg_id?: string;
  room_id?: string;
  sender_user_id?: string;
  body_plain?: string | null;
  deleted_at?: string | null;
}

interface WebhookBody {
  type?: string;
  table?: string;
  record?: ChatMessageRecord;
  old_record?: ChatMessageRecord | null;
}

interface RoomRow {
  name: string;
  member_user_ids: string[];
  deleted_at: string | null;
}

interface SenderRow {
  legal_first_name: string | null;
  preferred_first_name: string | null;
  customized_display_name: string | null;
}

interface PushSubRow {
  tb_tyapp_usr_psh_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function truncateBody(text: string | null | undefined): string {
  const trimmed = (text ?? '').trim();
  if (!trimmed) return 'New message';
  if (trimmed.length <= PUSH_BODY_MAX) return trimmed;
  return `${trimmed.slice(0, PUSH_BODY_MAX - 1)}…`;
}

function senderLabel(row: SenderRow | null): string {
  if (!row) return 'Someone';
  const name = (
    row.customized_display_name ||
    row.preferred_first_name ||
    row.legal_first_name ||
    ''
  ).trim();
  return name || 'Someone';
}

function readServiceKey(): string {
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (legacy) return legacy;
  const single = Deno.env.get('SUPABASE_SECRET_KEY') ?? '';
  if (single) return single;
  const raw = Deno.env.get('SUPABASE_SECRET_KEYS') ?? '';
  if (!raw) return '';
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const preferred =
      parsed['default'] ?? parsed['service_role'] ?? Object.values(parsed)[0];
    return typeof preferred === 'string' ? preferred : '';
  } catch {
    return '';
  }
}

function extractRecord(body: WebhookBody): ChatMessageRecord | null {
  if (body.record && typeof body.record === 'object') return body.record;
  const maybe = body as ChatMessageRecord;
  if (maybe.room_id && maybe.sender_user_id) return maybe;
  return null;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const expectedSecret = Deno.env.get('PUSH_WEBHOOK_SECRET') ?? '';
  const providedSecret = req.headers.get('x-webhook-secret') ?? '';
  if (!expectedSecret || providedSecret !== expectedSecret) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  const vapidPublic = Deno.env.get('VAPID_PUBLIC_KEY') ?? '';
  const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';
  const vapidSubject = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:jaxfr@local';
  if (!vapidPublic || !vapidPrivate) {
    return jsonResponse({ error: 'VAPID keys are not configured' }, 500);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = readServiceKey();
  if (!supabaseUrl || !serviceKey) {
    return jsonResponse({ error: 'Supabase env is not configured' }, 500);
  }

  let payload: WebhookBody;
  try {
    payload = (await req.json()) as WebhookBody;
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400);
  }

  if (payload.type && payload.type !== 'INSERT') {
    return jsonResponse({ skipped: true, reason: 'not_insert' });
  }
  if (payload.table && payload.table !== 'tyapp_chat_message') {
    return jsonResponse({ skipped: true, reason: 'wrong_table' });
  }

  const record = extractRecord(payload);
  if (!record?.room_id || !record.sender_user_id) {
    return jsonResponse({ skipped: true, reason: 'missing_record' });
  }
  if (record.deleted_at) {
    return jsonResponse({ skipped: true, reason: 'deleted' });
  }

  const supabase = createClient(supabaseUrl, serviceKey);
  const { data: roomData, error: roomError } = await supabase
    .from('tyapp_chat_room')
    .select('name, member_user_ids, deleted_at')
    .eq('tb_tyapp_chat_rm_id', record.room_id)
    .maybeSingle();

  if (roomError) {
    return jsonResponse({ error: roomError.message }, 500);
  }

  const room = roomData as RoomRow | null;
  if (!room || room.deleted_at) {
    return jsonResponse({ skipped: true, reason: 'room_missing' });
  }

  const recipientIds = (room.member_user_ids ?? []).filter(
    (id) => id && id !== record.sender_user_id,
  );
  if (recipientIds.length === 0) {
    return jsonResponse({ sent: 0, reason: 'no_recipients' });
  }

  const { data: senderData } = await supabase
    .from('tyapp_user')
    .select('legal_first_name, preferred_first_name, customized_display_name')
    .eq('user_id', record.sender_user_id)
    .maybeSingle();

  const { data: subData, error: subError } = await supabase
    .from('tyapp_push_subscription')
    .select('tb_tyapp_usr_psh_id, endpoint, p256dh, auth')
    .in('user_id', recipientIds);

  if (subError) {
    return jsonResponse({ error: subError.message }, 500);
  }

  const subscriptions = (subData ?? []) as PushSubRow[];
  const title = room.name || 'Jaxfr';
  const body = `${senderLabel(senderData as SenderRow | null)}: ${truncateBody(record.body_plain)}`;
  const url = `/chat/${record.room_id}`;
  const message = { data: JSON.stringify({ title, body, url }) };
  const vapid = {
    subject: vapidSubject,
    publicKey: vapidPublic,
    privateKey: vapidPrivate,
  };

  let sent = 0;
  const staleIds: string[] = [];
  const statuses: number[] = [];

  for (const sub of subscriptions) {
    try {
      const pushRequest = await buildPushPayload(
        message,
        {
          endpoint: sub.endpoint,
          expirationTime: null,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        vapid,
      );
      const res = await fetch(sub.endpoint, pushRequest);
      statuses.push(res.status);
      if (res.status === 404 || res.status === 410) {
        staleIds.push(sub.tb_tyapp_usr_psh_id);
      } else if (res.ok || res.status === 201) {
        sent += 1;
      }
    } catch {
      statuses.push(0);
    }
  }

  if (staleIds.length > 0) {
    await supabase
      .from('tyapp_push_subscription')
      .delete()
      .in('tb_tyapp_usr_psh_id', staleIds);
  }

  return jsonResponse({
    sent,
    stale: staleIds.length,
    recipients: recipientIds.length,
    subscriptions: subscriptions.length,
    statuses,
  });
});
