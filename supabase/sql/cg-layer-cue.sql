-- CG: lightweight subtitle cue + cheap overlay version check.
-- Additive. Does NOT drop tables. Run in the Supabase SQL editor.
-- Deploy this before the frontend that calls these RPCs.

-- Cue only writes payload.index / payload.cursor (not the full lines array).
create or replace function public.tyapp_cg_layer_set_cue(
  p_layer_id uuid,
  p_index int,
  p_cursor int
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.tyapp_cg_layer
  set
    payload = jsonb_set(
      jsonb_set(
        coalesce(payload, '{}'::jsonb),
        '{index}',
        to_jsonb(p_index),
        true
      ),
      '{cursor}',
      to_jsonb(p_cursor),
      true
    ),
    updated_at = now()
  where tb_tyapp_cgly_id = p_layer_id
    and deleted_at is null;
end;
$$;

-- Overlay safety poll: return max(updated_at) so the client can skip a full
-- tyapp_cg_get_output_by_token download when nothing changed.
create or replace function public.tyapp_cg_get_output_version_by_token(p_token text)
returns timestamptz
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result timestamptz;
begin
  select greatest(l.updated_at, p.updated_at)
  into result
  from public.tyapp_cg_layer l
  join public.tyapp_cg_package p
    on p.tb_tyapp_cgpk_id = l.package_id
  where l.public_token = p_token
    and l.deleted_at is null
    and p.deleted_at is null
    and l.status = 1
    and p.status = 1
  limit 1;

  if result is not null then
    return result;
  end if;

  select greatest(
    p.updated_at,
    coalesce((
      select max(l.updated_at)
      from public.tyapp_cg_layer l
      where l.package_id = p.tb_tyapp_cgpk_id
        and l.deleted_at is null
        and l.status = 1
    ), p.updated_at)
  )
  into result
  from public.tyapp_cg_package p
  where p.public_token = p_token
    and p.deleted_at is null
    and p.status = 1
  limit 1;

  return result;
end;
$$;

grant execute on function public.tyapp_cg_layer_set_cue(uuid, int, int)
  to authenticated;
grant execute on function public.tyapp_cg_get_output_version_by_token(text)
  to anon, authenticated;

notify pgrst, 'reload schema';
