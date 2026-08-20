-- Filelink Allowed Users must share one user group (same rule as Chat rooms).
-- Paste after user-group.schema.sql (needs tyapp_user_ids_share_a_group).
-- Safe to re-run.
--
-- Owner + allowed_users must all belong to one active group. Empty
-- allowed_users (private link) is allowed. Existing mixed grants can stay
-- until you add someone; shrinking the list is always allowed.

CREATE OR REPLACE FUNCTION public.tyapp_filelink_enforce_single_group()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ids uuid[];
BEGIN
  v_ids := ARRAY[NEW.user_id] || COALESCE(NEW.allowed_users, '{}');

  IF TG_OP = 'INSERT' THEN
    IF NOT public.tyapp_user_ids_share_a_group(v_ids) THEN
      RAISE EXCEPTION 'Everyone granted access must belong to the same user group';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.allowed_users IS DISTINCT FROM OLD.allowed_users
     AND cardinality(COALESCE(NEW.allowed_users, '{}'))
       > cardinality(COALESCE(OLD.allowed_users, '{}'))
     AND NOT public.tyapp_user_ids_share_a_group(v_ids) THEN
    RAISE EXCEPTION 'Everyone granted access must belong to the same user group';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tyapp_filelink_enforce_single_group
  ON public.tyapp_filelink_item;
CREATE TRIGGER tyapp_filelink_enforce_single_group
  BEFORE INSERT OR UPDATE OF user_id, allowed_users
  ON public.tyapp_filelink_item
  FOR EACH ROW
  EXECUTE FUNCTION public.tyapp_filelink_enforce_single_group();
