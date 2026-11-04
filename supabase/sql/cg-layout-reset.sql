-- CG: unified 9-grid placement (inset-from-anchor for every Element).
-- Subtitle X/Y changed meaning (point-in-frame -> inset from the Anchor edge),
-- so old rows would render in the wrong place. We are early stage: soft delete
-- every CG Layer and Package and rebuild from a clean state.
--
-- Soft delete only (sets deleted_at); nothing is dropped and rows can be
-- restored by setting deleted_at back to null.
-- Every Output / OBS URL becomes invalid until the Package is rebuilt.
-- Run once in the Supabase SQL editor, then open the Panel.

-- Child first, then parent.
update public.tyapp_cg_layer
set deleted_at = now()
where deleted_at is null;

update public.tyapp_cg_package
set deleted_at = now()
where deleted_at is null;
