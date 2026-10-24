-- CG traffic v1: cheaper overlay output + a tiny "state" RPC for the safety poll.
-- Additive and re-runnable. Does NOT drop tables or change columns.
-- Run in the Supabase SQL editor BEFORE deploying the frontend that calls it.
--
-- What changes
--   1. tyapp_cg_get_output_by_token now returns a slimmer Layer object (only
--      what the overlay renders) plus `rev`, a content signature that EXCLUDES
--      the subtitle cue (`payload.index` / `payload.cursor`).
--   2. tyapp_cg_get_output_state_by_token returns `{ rev, cues }` (a few
--      hundred bytes). The overlay poll compares `rev` and only downloads the
--      full output when it changed, so firing cues no longer causes downloads.
--   3. tyapp_cg_get_output_version_by_token and tyapp_cg_layer_set_cue are NOT
--      touched: overlays that have not been refreshed in OBS keep working.
--
-- Rollback: re-run the tyapp_cg_get_output_by_token definition in
-- supabase/sql/cg-package-look.sql (it returns to_jsonb(l) rows). The new
-- functions can stay; nothing else depends on them.

-- One Layer as the overlay needs it. Keys match normalizeLayer in cg.util.ts
-- (name / created_at / updated_at / deleted_at / seq_no are not rendered).
create or replace function public.tyapp_cg_layer_output_json(l public.tyapp_cg_layer)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'tb_tyapp_cgly_id', l.tb_tyapp_cgly_id,
    'package_id', l.package_id,
    'element_type', l.element_type,
    'public_token', l.public_token,
    'layout', l.layout,
    'payload', l.payload,
    'visible', l.visible,
    'look', l.look,
    'sort_order', l.sort_order,
    'status', l.status
  );
$$;

-- Internal builder shared by both public RPCs. `rev` is computed from the same
-- `layers` value that is returned, in the same statement, so data and `rev`
-- can never disagree.
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
  -- Layer token first (kind = layer, exactly one Layer, On/Off ignored).
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
    -- Package token (kind = package, visible Layers in z-order).
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

  -- Content signature: everything the overlay renders except the live cue.
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
            (e -> 'payload') - 'index' - 'cursor',
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

-- Public full output (same name and grants as before; richer `rev`, slimmer rows).
create or replace function public.tyapp_cg_get_output_by_token(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return public.tyapp_cg_build_output(p_token);
end;
$$;

-- Cheap safety-poll state: content `rev` + the current cue of every Layer.
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
    ), '[]'::jsonb)
  );
end;
$$;

-- Internal helpers are not callable from the API; only the two wrappers below are.
revoke all on function public.tyapp_cg_layer_output_json(public.tyapp_cg_layer)
  from public, anon, authenticated;
revoke all on function public.tyapp_cg_build_output(text)
  from public, anon, authenticated;

grant execute on function public.tyapp_cg_get_output_by_token(text)
  to anon, authenticated;
grant execute on function public.tyapp_cg_get_output_state_by_token(text)
  to anon, authenticated;

notify pgrst, 'reload schema';
