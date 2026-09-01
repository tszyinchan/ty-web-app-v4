-- Fit patterns reuse tyapp_fit_session (same entry/set children).
-- is_pattern = true  → Day A/B/C/D 課表
-- is_pattern = false → 當日訓練紀錄
-- Paste into the Supabase SQL Editor. Safe to re-run.

ALTER TABLE public.tyapp_fit_session
  ADD COLUMN IF NOT EXISTS is_pattern boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS tyapp_fit_session_user_pattern_idx
  ON public.tyapp_fit_session (user_id, session_title)
  WHERE deleted_at IS NULL AND is_pattern = true;

CREATE INDEX IF NOT EXISTS tyapp_fit_session_user_log_idx
  ON public.tyapp_fit_session (user_id, session_date DESC)
  WHERE deleted_at IS NULL AND is_pattern = false;

NOTIFY pgrst, 'reload schema';
