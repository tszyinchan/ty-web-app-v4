-- CG v2: Package + Layer + dual Output (package token + layer token).
-- Drops v1 slot tables. Safe to re-run. Feature catalog row is kept.
-- Run in the Supabase SQL editor.

drop function if exists public.tyapp_cg_get_slot_by_token(text);
drop function if exists public.tyapp_cg_slot_soft_delete_single_record(uuid);
drop function if exists public.tyapp_cg_package_soft_delete_single_record(uuid);
drop function if exists public.tyapp_cg_get_output_by_token(text);
drop function if exists public.tyapp_cg_layer_soft_delete_single_record(uuid);

drop table if exists public.tyapp_cg_layer;
drop table if exists public.tyapp_cg_slot;
drop table if exists public.tyapp_cg_package;

create table public.tyapp_cg_package (
  tb_tyapp_cgpk_id uuid primary key default gen_random_uuid(),
  tb_tyapp_cgpk_seq_no bigint generated always as identity,
  name text not null,
  role text not null check (role in ('channel', 'source')),
  public_token text not null unique,
  duration_ms integer not null default 400
    check (duration_ms >= 0 and duration_ms <= 5000),
  look text not null default 'color'
    check (look in ('color', 'mono')),
  status smallint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.tyapp_cg_layer (
  tb_tyapp_cgly_id uuid primary key default gen_random_uuid(),
  tb_tyapp_cgly_seq_no bigint generated always as identity,
  package_id uuid not null references public.tyapp_cg_package (tb_tyapp_cgpk_id),
  element_type text not null,
  public_token text not null unique,
  layout jsonb not null default '{}'::jsonb,
  payload jsonb not null default '{}'::jsonb,
  visible boolean not null default true,
  sort_order integer not null default 0,
  status smallint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index tyapp_cg_layer_package_id_idx
  on public.tyapp_cg_layer (package_id)
  where deleted_at is null;

alter table public.tyapp_cg_package enable row level security;
alter table public.tyapp_cg_layer enable row level security;

create policy tyapp_cg_package_authenticated_all
  on public.tyapp_cg_package
  for all
  to authenticated
  using (true)
  with check (true);

create policy tyapp_cg_layer_authenticated_all
  on public.tyapp_cg_layer
  for all
  to authenticated
  using (true)
  with check (true);

grant select, insert, update on public.tyapp_cg_package to authenticated;
grant select, insert, update on public.tyapp_cg_layer to authenticated;

create or replace function public.tyapp_cg_package_soft_delete_single_record(record_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.tyapp_cg_layer
  set deleted_at = now(), updated_at = now()
  where package_id = record_id
    and deleted_at is null;

  update public.tyapp_cg_package
  set deleted_at = now(), updated_at = now()
  where tb_tyapp_cgpk_id = record_id
    and deleted_at is null;
end;
$$;

create or replace function public.tyapp_cg_layer_soft_delete_single_record(record_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.tyapp_cg_layer
  set deleted_at = now(), updated_at = now()
  where tb_tyapp_cgly_id = record_id
    and deleted_at is null;
end;
$$;

create or replace function public.tyapp_cg_get_output_by_token(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  select jsonb_build_object(
    'kind', 'layer',
    'packageName', p.name,
    'packageRole', p.role,
    'durationMs', p.duration_ms,
    'look', p.look,
    'layers', jsonb_build_array(to_jsonb(l))
  )
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

  select jsonb_build_object(
    'kind', 'package',
    'packageName', p.name,
    'packageRole', p.role,
    'durationMs', p.duration_ms,
    'look', p.look,
    'layers', coalesce((
      select jsonb_agg(to_jsonb(l) order by l.sort_order)
      from public.tyapp_cg_layer l
      where l.package_id = p.tb_tyapp_cgpk_id
        and l.deleted_at is null
        and l.status = 1
        and l.visible = true
    ), '[]'::jsonb)
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

grant execute on function public.tyapp_cg_package_soft_delete_single_record(uuid)
  to authenticated;
grant execute on function public.tyapp_cg_layer_soft_delete_single_record(uuid)
  to authenticated;
grant execute on function public.tyapp_cg_get_output_by_token(text)
  to anon, authenticated;

insert into public.tyapp_app_feature (
  app_id,
  name,
  icon,
  route,
  is_admin_only,
  show_in_launcher,
  remarks,
  status,
  customized_order
)
select
  a.tb_tyapp_app_id,
  'CG',
  'live_tv',
  '/cg',
  false,
  true,
  'Broadcast CG packages and OBS overlays',
  1,
  40
from public.tyapp_app a
where lower(a.name) = 'jaxfr'
  and a.deleted_at is null
  and not exists (
    select 1
    from public.tyapp_app_feature f
    where f.name = 'CG'
      and f.deleted_at is null
  );

insert into public.tyapp_user_feature_access (user_id, feature_id)
select ua.user_id, f.tb_tyapp_ap_ftr_id
from public.tyapp_app_feature f
join public.tyapp_user_app_access ua
  on ua.app_id = f.app_id
where f.name = 'CG'
  and f.deleted_at is null
on conflict (user_id, feature_id) do nothing;

notify pgrst, 'reload schema';
