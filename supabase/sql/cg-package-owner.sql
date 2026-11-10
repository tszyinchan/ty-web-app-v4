-- CG: package owner. Each signed-in user sees and writes only their packages.
-- Layers follow the parent package (no layer user_id).
-- Overlay read RPCs stay anonymous and are not replaced here.
-- Additive. Does NOT drop tables. Safe to re-run. Run in the Supabase SQL editor
-- before the frontend that writes user_id.

alter table public.tyapp_cg_package
  add column if not exists user_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'tyapp_cg_package_user_id_fkey'
      and conrelid = 'public.tyapp_cg_package'::regclass
  ) then
    alter table public.tyapp_cg_package
      add constraint tyapp_cg_package_user_id_fkey
      foreign key (user_id) references public.tyapp_user (user_id);
  end if;
end $$;

-- Existing rows go to the single active Super Admin (USER_ROLES.SUPER_ADMIN = 998).
-- More or fewer than one: stop, do not guess an owner.
do $$
declare
  v_missing int;
  v_count int;
  v_owner uuid;
begin
  select count(*) into v_missing
  from public.tyapp_cg_package
  where user_id is null;

  if v_missing = 0 then
    return;
  end if;

  select count(*) into v_count
  from public.tyapp_user
  where role >= 998
    and deleted_at is null
    and status = 1;

  if v_count <> 1 then
    raise exception
      'Expected exactly one active Super Admin to own existing CG packages, found %',
      v_count;
  end if;

  select user_id into v_owner
  from public.tyapp_user
  where role >= 998
    and deleted_at is null
    and status = 1;

  update public.tyapp_cg_package
  set user_id = v_owner
  where user_id is null;
end $$;

alter table public.tyapp_cg_package
  alter column user_id set not null;

drop policy if exists tyapp_cg_package_authenticated_all
  on public.tyapp_cg_package;
drop policy if exists tyapp_cg_package_owner
  on public.tyapp_cg_package;

create policy tyapp_cg_package_owner
  on public.tyapp_cg_package
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists tyapp_cg_layer_authenticated_all
  on public.tyapp_cg_layer;
drop policy if exists tyapp_cg_layer_owner
  on public.tyapp_cg_layer;

create policy tyapp_cg_layer_owner
  on public.tyapp_cg_layer
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.tyapp_cg_package p
      where p.tb_tyapp_cgpk_id = package_id
        and p.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.tyapp_cg_package p
      where p.tb_tyapp_cgpk_id = package_id
        and p.user_id = auth.uid()
    )
  );

-- Internal. Callers are the security-definer write RPCs below.
create or replace function public.tyapp_cg_assert_package_owner(p_package_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.tyapp_cg_package
    where tb_tyapp_cgpk_id = p_package_id
      and user_id = auth.uid()
      and deleted_at is null
  ) then
    raise exception 'CG package not found';
  end if;
end;
$$;

revoke all on function public.tyapp_cg_assert_package_owner(uuid)
  from public, anon, authenticated;

create or replace function public.tyapp_cg_package_soft_delete_single_record(record_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.tyapp_cg_assert_package_owner(record_id);

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
declare
  v_package_id uuid;
begin
  select package_id into v_package_id
  from public.tyapp_cg_layer
  where tb_tyapp_cgly_id = record_id
    and deleted_at is null;

  if v_package_id is null then
    raise exception 'CG package not found';
  end if;

  perform public.tyapp_cg_assert_package_owner(v_package_id);

  update public.tyapp_cg_layer
  set deleted_at = now(), updated_at = now()
  where tb_tyapp_cgly_id = record_id
    and deleted_at is null;
end;
$$;

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
declare
  v_package_id uuid;
begin
  select package_id into v_package_id
  from public.tyapp_cg_layer
  where tb_tyapp_cgly_id = p_layer_id
    and deleted_at is null;

  if v_package_id is null then
    raise exception 'CG package not found';
  end if;

  perform public.tyapp_cg_assert_package_owner(v_package_id);

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
declare
  v_package_id uuid;
begin
  select package_id into v_package_id
  from public.tyapp_cg_layer
  where tb_tyapp_cgly_id = p_layer_id
    and deleted_at is null;

  if v_package_id is null then
    raise exception 'CG package not found';
  end if;

  perform public.tyapp_cg_assert_package_owner(v_package_id);

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

grant execute on function public.tyapp_cg_package_soft_delete_single_record(uuid)
  to authenticated;
grant execute on function public.tyapp_cg_layer_soft_delete_single_record(uuid)
  to authenticated;
grant execute on function public.tyapp_cg_layer_set_cue(uuid, int, int)
  to authenticated;
grant execute on function public.tyapp_cg_layer_set_title_air(uuid, jsonb, jsonb)
  to authenticated;

notify pgrst, 'reload schema';
