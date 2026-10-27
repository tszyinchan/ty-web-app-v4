-- CG Title: small On/Off write + rev that ignores Title air.
-- Additive. Does NOT drop tables. Run in the Supabase SQL editor
-- BEFORE the frontend that calls tyapp_cg_layer_set_title_air.
--
-- `rev` still excludes the subtitle cue. It also excludes payload.title.onAir
-- and payload.title.live.on, so toggling a Title does not download the full
-- output. Live text (live.a / live.b / live.source) stays in `rev`.
-- The safety-poll state gains `titles` so a lost On/Off can be recovered
-- the same way a lost subtitle cue is.

create or replace function public.tyapp_cg_payload_without_air(p_payload jsonb)
returns jsonb
language sql
immutable
as $$
  select case
    when jsonb_typeof(p_payload -> 'title') = 'object' then
      jsonb_set(
        jsonb_set(
          coalesce(p_payload, '{}'::jsonb) - 'index' - 'cursor',
          '{title,onAir}',
          'null'::jsonb,
          true
        ),
        '{title,live,on}',
        'null'::jsonb,
        true
      )
    else
      coalesce(p_payload, '{}'::jsonb) - 'index' - 'cursor'
  end;
$$;

create or replace function public.tyapp_cg_build_output(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_kind text;
  v_name text;
  v_role text;
  v_duration integer;
  v_look text;
  v_layers jsonb;
  v_rev text;
begin
  select
    'layer',
    p.name,
    p.role,
    p.duration_ms,
    p.look,
    jsonb_build_array(public.tyapp_cg_layer_output_json(l))
  into v_kind, v_name, v_role, v_duration, v_look, v_layers
  from public.tyapp_cg_layer l
  join public.tyapp_cg_package p
    on p.tb_tyapp_cgpk_id = l.package_id
  where l.public_token = p_token
    and l.deleted_at is null
    and p.deleted_at is null
    and l.status = 1
    and p.status = 1
  limit 1;

  if v_kind is null then
    select
      'package',
      p.name,
      p.role,
      p.duration_ms,
      p.look,
      coalesce((
        select jsonb_agg(public.tyapp_cg_layer_output_json(l) order by l.sort_order)
        from public.tyapp_cg_layer l
        where l.package_id = p.tb_tyapp_cgpk_id
          and l.deleted_at is null
          and l.status = 1
          and l.visible = true
      ), '[]'::jsonb)
    into v_kind, v_name, v_role, v_duration, v_look, v_layers
    from public.tyapp_cg_package p
    where p.public_token = p_token
      and p.deleted_at is null
      and p.status = 1
    limit 1;
  end if;

  if v_kind is null then
    return null;
  end if;

  v_rev := md5(
    jsonb_build_array(
      v_kind,
      v_duration,
      v_look,
      coalesce((
        select jsonb_agg(
          jsonb_build_array(
            e -> 'tb_tyapp_cgly_id',
            e -> 'element_type',
            e -> 'layout',
            public.tyapp_cg_payload_without_air(e -> 'payload'),
            e -> 'look',
            e -> 'sort_order',
            e -> 'visible'
          )
          order by t.ord
        )
        from jsonb_array_elements(v_layers) with ordinality as t(e, ord)
      ), '[]'::jsonb)
    )::text
  );

  return jsonb_build_object(
    'kind', v_kind,
    'packageName', v_name,
    'packageRole', v_role,
    'durationMs', v_duration,
    'look', v_look,
    'layers', v_layers,
    'rev', v_rev
  );
end;
$$;

create or replace function public.tyapp_cg_get_output_state_by_token(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_out jsonb;
begin
  v_out := public.tyapp_cg_build_output(p_token);
  if v_out is null then
    return null;
  end if;

  return jsonb_build_object(
    'rev', v_out -> 'rev',
    'cues', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', e -> 'tb_tyapp_cgly_id',
          'index', e -> 'payload' -> 'index',
          'cursor', e -> 'payload' -> 'cursor'
        )
      )
      from jsonb_array_elements(v_out -> 'layers') as e
    ), '[]'::jsonb),
    'titles', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', e -> 'tb_tyapp_cgly_id',
          'onAir', coalesce(e -> 'payload' -> 'title' -> 'onAir', '[]'::jsonb),
          'liveOn', coalesce(e -> 'payload' -> 'title' -> 'live' -> 'on', 'false'::jsonb)
        )
      )
      from jsonb_array_elements(v_out -> 'layers') as e
      where jsonb_typeof(e -> 'payload' -> 'title') = 'object'
    ), '[]'::jsonb)
  );
end;
$$;

-- Writes only title.onAir and title.live. Does not touch the queue or styles.
create or replace function public.tyapp_cg_layer_set_title_air(
  p_layer_id uuid,
  p_on_air jsonb,
  p_live jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if jsonb_typeof(p_on_air) is distinct from 'array' then
    p_on_air := '[]'::jsonb;
  end if;
  if jsonb_typeof(p_live) is distinct from 'object' then
    p_live := '{}'::jsonb;
  end if;

  update public.tyapp_cg_layer
  set
    payload = jsonb_set(
      jsonb_set(
        coalesce(payload, '{}'::jsonb),
        '{title,onAir}',
        p_on_air,
        true
      ),
      '{title,live}',
      p_live,
      true
    ),
    updated_at = now()
  where tb_tyapp_cgly_id = p_layer_id
    and deleted_at is null;
end;
$$;

revoke all on function public.tyapp_cg_payload_without_air(jsonb)
  from public, anon, authenticated;
revoke all on function public.tyapp_cg_build_output(text)
  from public, anon, authenticated;

grant execute on function public.tyapp_cg_get_output_state_by_token(text)
  to anon, authenticated;
grant execute on function public.tyapp_cg_layer_set_title_air(uuid, jsonb, jsonb)
  to authenticated;

notify pgrst, 'reload schema';
