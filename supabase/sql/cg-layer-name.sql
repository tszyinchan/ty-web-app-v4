-- CG: optional display name per Layer (tile footer + desk textbox).
-- Additive. Does NOT drop tables. Run in the Supabase SQL editor.
-- Output RPC already returns to_jsonb(layer), so the new column is included.

alter table public.tyapp_cg_layer
  add column if not exists name text not null default '';

notify pgrst, 'reload schema';
