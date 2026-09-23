-- CG v1: packages + slots + public overlay RPC.
-- Run in the Supabase SQL editor. Safe to re-run.

create table if not exists public.tyapp_cg_package (
  tb_tyapp_cgpk_id uuid primary key default gen_random_uuid(),
  tb_tyapp_cgpk_seq_no bigint generated always as identity,
  name text not null,
  role text not null check (role in ('channel', 'source')),
  status smallint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.tyapp_cg_slot (
  tb_tyapp_cgsl_id uuid primary key default gen_random_uuid(),
  tb_tyapp_cgsl_seq_no bigint generated always as identity,
  package_id uuid not null references public.tyapp_cg_package (tb_tyapp_cgpk_id),
  component_type text not null,
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

create index if not exists tyapp_cg_slot_package_id_idx
  on public.tyapp_cg_slot (package_id)
  where deleted_at is null;

alter table public.tyapp_cg_package enable row level security;
alter table public.tyapp_cg_slot enable row level security;

drop policy if exists tyapp_cg_package_authenticated_all on public.tyapp_cg_package;
create policy tyapp_cg_package_authenticated_all
  on public.tyapp_cg_package
  for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists tyapp_cg_slot_authenticated_all on public.tyapp_cg_slot;
create policy tyapp_cg_slot_authenticated_all
  on public.tyapp_cg_slot
  for all
  to authenticated
  using (true)
  with check (true);

grant select, insert, update on public.tyapp_cg_package to authenticated;
grant select, insert, update on public.tyapp_cg_slot to authenticated;

create or replace function public.tyapp_cg_package_soft_delete_single_record(record_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.tyapp_cg_slot
  set deleted_at = now(), updated_at = now()
  where package_id = record_id
    and deleted_at is null;

  update public.tyapp_cg_package
  set deleted_at = now(), updated_at = now()
  where tb_tyapp_cgpk_id = record_id
    and deleted_at is null;
end;
$$;

create or replace function public.tyapp_cg_slot_soft_delete_single_record(record_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.tyapp_cg_slot
  set deleted_at = now(), updated_at = now()
  where tb_tyapp_cgsl_id = record_id
    and deleted_at is null;
end;
$$;

create or replace function public.tyapp_cg_get_slot_by_token(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'slot', to_jsonb(s),
    'packageName', p.name,
    'packageRole', p.role
  )
  from public.tyapp_cg_slot s
  join public.tyapp_cg_package p
    on p.tb_tyapp_cgpk_id = s.package_id
  where s.public_token = p_token
    and s.deleted_at is null
    and p.deleted_at is null
    and s.status = 1
    and p.status = 1
  limit 1;
$$;

grant execute on function public.tyapp_cg_package_soft_delete_single_record(uuid)
  to authenticated;
grant execute on function public.tyapp_cg_slot_soft_delete_single_record(uuid)
  to authenticated;
grant execute on function public.tyapp_cg_get_slot_by_token(text)
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
