-- Safe patch for an already-created Daily Checklist database.
-- Adds five extra mood keys. Existing green/gold/red/blue/purple rows stay valid.
-- Paste into the Supabase SQL Editor and run.

ALTER TABLE public.tyapp_daily_checklist_day
  DROP CONSTRAINT IF EXISTS tyapp_daily_checklist_day_mood_key;

ALTER TABLE public.tyapp_daily_checklist_day
  ADD CONSTRAINT tyapp_daily_checklist_day_mood_key
    CHECK (mood_key IS NULL OR mood_key IN (
      'green', 'gold', 'red', 'blue', 'purple',
      'grin', 'rest', 'blank', 'cry', 'mad'
    ));
