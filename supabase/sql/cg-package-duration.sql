-- CG: Package-level appear duration. 0 = cut, default 400 = fade.
-- Additive. Does NOT drop tables. Run in the Supabase SQL editor.

alter table public.tyapp_cg_package
  add column if not exists duration_ms integer not null default 400;

alter table public.tyapp_cg_package
  drop constraint if exists tyapp_cg_package_duration_ms_check;

alter table public.tyapp_cg_package
  add constraint tyapp_cg_package_duration_ms_check
  check (duration_ms >= 0 and duration_ms <= 5000);

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

grant execute on function public.tyapp_cg_get_output_by_token(text)
  to anon, authenticated;

notify pgrst, 'reload schema';
