-- CG: per-layer look — inherit (default, follow Package) / color / mono.
-- Additive. Does NOT drop tables. Run in the Supabase SQL editor.
-- Output RPC already returns to_jsonb(layer), so the new column is included.

alter table public.tyapp_cg_layer
  add column if not exists look text not null default 'inherit';

alter table public.tyapp_cg_layer
  drop constraint if exists tyapp_cg_layer_look_check;

alter table public.tyapp_cg_layer
  add constraint tyapp_cg_layer_look_check
  check (look in ('inherit', 'color', 'mono'));

notify pgrst, 'reload schema';
