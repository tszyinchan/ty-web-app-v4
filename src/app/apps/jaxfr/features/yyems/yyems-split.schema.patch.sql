-- Split stats: settle Out bills for one group in Postgres.
-- Same rules as settleOneBill / splitBreakdown in yyems.util.ts.
-- Safe to re-run. Paste in the Supabase SQL editor.

CREATE INDEX IF NOT EXISTS tyapp_yyems_out_group_idx
  ON public.tyapp_yyems (group_id)
  WHERE deleted_at IS NULL AND in_or_out = 'out';

CREATE OR REPLACE FUNCTION public.tyapp_yyems_split_group_totals(
  p_group_id uuid,
  p_user_a uuid,
  p_user_b uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_eps numeric := 0.005;
  v_bill record;
  v_amount numeric;
  v_currency text;
  v_payer uuid;
  v_paid_a numeric;
  v_paid_b numeric;
  v_outside numeric;
  v_share_count int;
  v_weight_sum int;
  v_cents int;
  v_used int;
  v_i int;
  v_portion int;
  v_borne_a numeric;
  v_borne_b numeric;
  v_pair_share_n int;
  v_kind_a text;
  v_kind_b text;
  v_uid uuid;
  v_w int;
  v_missing int := 0;
  v_unset int := 0;
  v_bucket jsonb;
  v_people jsonb;
  v_currencies jsonb := '{}'::jsonb;
  v_code text;
  v_net_a numeric;
  v_net_b numeric;
  v_shares uuid[];
  v_weights int[];
BEGIN
  IF NOT public.tyapp_yyems_is_household_member() THEN
    RAISE EXCEPTION 'not a household member';
  END IF;
  IF p_group_id IS NULL OR p_user_a IS NULL OR p_user_b IS NULL OR p_user_a = p_user_b THEN
    RAISE EXCEPTION 'invalid split pair';
  END IF;

  SELECT count(*)::int
  INTO v_unset
  FROM public.tyapp_yyems b
  WHERE b.deleted_at IS NULL
    AND b.in_or_out = 'out'
    AND b.group_id IS NULL;

  FOR v_bill IN
    SELECT
      b.tb_tyapp_yym_id,
      b.amount,
      b.currency,
      b.wallet_amount,
      fa.owner_user_id AS payer_user_id,
      fa.currency AS wallet_currency
    FROM public.tyapp_yyems b
    LEFT JOIN public.tyapp_yyems_wallet w
      ON w.tb_tyapp_ywl_id = b.wallet_id
     AND w.deleted_at IS NULL
    LEFT JOIN public.tyapp_yyems_financial_account fa
      ON fa.tb_tyapp_yfa_id = w.financial_account_id
     AND fa.deleted_at IS NULL
    WHERE b.deleted_at IS NULL
      AND b.in_or_out = 'out'
      AND b.group_id = p_group_id
    ORDER BY b.tb_tyapp_yym_id
  LOOP
    SELECT count(*)::int
    INTO v_share_count
    FROM public.tyapp_yyems_bill_share s
    WHERE s.yyems_id = v_bill.tb_tyapp_yym_id;

    IF v_share_count = 0 THEN
      v_missing := v_missing + 1;
      CONTINUE;
    END IF;

    -- Client skips when wallet or FA cannot be resolved (payer may still be null = joint).
    IF v_bill.wallet_currency IS NULL THEN
      CONTINUE;
    END IF;

    IF v_bill.wallet_amount IS NOT NULL THEN
      v_amount := round(v_bill.wallet_amount::numeric, 2);
      v_currency := v_bill.wallet_currency;
    ELSE
      v_amount := round(v_bill.amount::numeric, 2);
      v_currency := v_bill.currency;
    END IF;

    v_payer := v_bill.payer_user_id;
    v_paid_a := 0;
    v_paid_b := 0;
    v_outside := 0;

    IF v_payer IS NULL THEN
      v_paid_a := round(v_amount / 2, 2);
      v_paid_b := round(v_amount - v_paid_a, 2);
    ELSIF v_payer = p_user_a THEN
      v_paid_a := v_amount;
    ELSIF v_payer = p_user_b THEN
      v_paid_b := v_amount;
    ELSE
      v_outside := v_amount;
    END IF;

    -- allocateByShare: order user_id ascending; last weight gets remainder cents.
    SELECT coalesce(array_agg(s.user_id ORDER BY s.user_id), ARRAY[]::uuid[]),
           coalesce(array_agg(GREATEST(0, round(s.share::numeric * 100))::int ORDER BY s.user_id), ARRAY[]::int[])
    INTO v_shares, v_weights
    FROM public.tyapp_yyems_bill_share s
    WHERE s.yyems_id = v_bill.tb_tyapp_yym_id;

    v_weight_sum := 0;
    FOR v_i IN 1 .. coalesce(array_length(v_weights, 1), 0) LOOP
      v_weight_sum := v_weight_sum + v_weights[v_i];
    END LOOP;

    v_cents := round(v_amount * 100)::int;
    v_used := 0;
    v_borne_a := 0;
    v_borne_b := 0;

    FOR v_i IN 1 .. coalesce(array_length(v_shares, 1), 0) LOOP
      v_uid := v_shares[v_i];
      v_w := v_weights[v_i];
      IF v_weight_sum <= 0 THEN
        v_portion := 0;
      ELSIF v_i = array_length(v_shares, 1) THEN
        v_portion := v_cents - v_used;
      ELSE
        v_portion := floor((v_cents::numeric * v_w) / v_weight_sum)::int;
      END IF;
      v_used := v_used + v_portion;
      IF v_uid = p_user_a THEN
        v_borne_a := v_borne_a + (v_portion::numeric / 100);
      ELSIF v_uid = p_user_b THEN
        v_borne_b := v_borne_b + (v_portion::numeric / 100);
      END IF;
    END LOOP;

    -- paidBucket for each of the pair (shares in pair with share > eps).
    SELECT count(*)::int
    INTO v_pair_share_n
    FROM public.tyapp_yyems_bill_share s
    WHERE s.yyems_id = v_bill.tb_tyapp_yym_id
      AND s.user_id IN (p_user_a, p_user_b)
      AND s.share::numeric > v_eps;

    IF v_pair_share_n = 0 THEN
      v_kind_a := NULL;
      v_kind_b := NULL;
    ELSIF v_pair_share_n > 1 THEN
      v_kind_a := 'both';
      v_kind_b := 'both';
    ELSE
      SELECT s.user_id
      INTO v_uid
      FROM public.tyapp_yyems_bill_share s
      WHERE s.yyems_id = v_bill.tb_tyapp_yym_id
        AND s.user_id IN (p_user_a, p_user_b)
        AND s.share::numeric > v_eps
      LIMIT 1;
      IF v_uid = p_user_a THEN
        v_kind_a := 'self';
        v_kind_b := 'other';
      ELSE
        v_kind_a := 'other';
        v_kind_b := 'self';
      END IF;
    END IF;

    v_bucket := coalesce(v_currencies -> v_currency, jsonb_build_object(
      'currency', v_currency,
      'paid_a', 0, 'paid_b', 0,
      'borne_a', 0, 'borne_b', 0,
      'self_a', 0, 'other_a', 0, 'both_a', 0,
      'self_b', 0, 'other_b', 0, 'both_b', 0,
      'outside', 0
    ));

    v_bucket := jsonb_set(v_bucket, '{paid_a}', to_jsonb(round((v_bucket->>'paid_a')::numeric + v_paid_a, 2)));
    v_bucket := jsonb_set(v_bucket, '{paid_b}', to_jsonb(round((v_bucket->>'paid_b')::numeric + v_paid_b, 2)));
    v_bucket := jsonb_set(v_bucket, '{borne_a}', to_jsonb(round((v_bucket->>'borne_a')::numeric + v_borne_a, 2)));
    v_bucket := jsonb_set(v_bucket, '{borne_b}', to_jsonb(round((v_bucket->>'borne_b')::numeric + v_borne_b, 2)));
    v_bucket := jsonb_set(v_bucket, '{outside}', to_jsonb(round((v_bucket->>'outside')::numeric + v_outside, 2)));

    IF v_paid_a > v_eps AND v_kind_a IS NOT NULL THEN
      IF v_kind_a = 'self' THEN
        v_bucket := jsonb_set(v_bucket, '{self_a}', to_jsonb(round((v_bucket->>'self_a')::numeric + v_paid_a, 2)));
      ELSIF v_kind_a = 'other' THEN
        v_bucket := jsonb_set(v_bucket, '{other_a}', to_jsonb(round((v_bucket->>'other_a')::numeric + v_paid_a, 2)));
      ELSE
        v_bucket := jsonb_set(v_bucket, '{both_a}', to_jsonb(round((v_bucket->>'both_a')::numeric + v_paid_a, 2)));
      END IF;
    END IF;

    IF v_paid_b > v_eps AND v_kind_b IS NOT NULL THEN
      IF v_kind_b = 'self' THEN
        v_bucket := jsonb_set(v_bucket, '{self_b}', to_jsonb(round((v_bucket->>'self_b')::numeric + v_paid_b, 2)));
      ELSIF v_kind_b = 'other' THEN
        v_bucket := jsonb_set(v_bucket, '{other_b}', to_jsonb(round((v_bucket->>'other_b')::numeric + v_paid_b, 2)));
      ELSE
        v_bucket := jsonb_set(v_bucket, '{both_b}', to_jsonb(round((v_bucket->>'both_b')::numeric + v_paid_b, 2)));
      END IF;
    END IF;

    v_currencies := jsonb_set(v_currencies, ARRAY[v_currency], v_bucket);
  END LOOP;

  -- Shape response to match SplitCurrencyBreakdown (+ paid/borne for the formula).
  v_people := '[]'::jsonb;
  FOR v_code, v_bucket IN
    SELECT key, value FROM jsonb_each(v_currencies) ORDER BY key
  LOOP
    v_net_a := round((v_bucket->>'paid_a')::numeric - (v_bucket->>'borne_a')::numeric, 2);
    v_net_b := round((v_bucket->>'paid_b')::numeric - (v_bucket->>'borne_b')::numeric, 2);
    v_people := v_people || jsonb_build_array(jsonb_build_object(
      'currency', v_code,
      'people', jsonb_build_array(
        jsonb_build_object(
          'userId', p_user_a,
          'selfPaid', (v_bucket->>'self_a')::numeric,
          'otherPaid', (v_bucket->>'other_a')::numeric,
          'bothPaid', (v_bucket->>'both_a')::numeric
        ),
        jsonb_build_object(
          'userId', p_user_b,
          'selfPaid', (v_bucket->>'self_b')::numeric,
          'otherPaid', (v_bucket->>'other_b')::numeric,
          'bothPaid', (v_bucket->>'both_b')::numeric
        )
      ),
      'nets', jsonb_build_array(v_net_a, v_net_b),
      'paid', jsonb_build_array((v_bucket->>'paid_a')::numeric, (v_bucket->>'paid_b')::numeric),
      'borne', jsonb_build_array((v_bucket->>'borne_a')::numeric, (v_bucket->>'borne_b')::numeric),
      'firstPaysSecond', round(0 - v_net_a, 2),
      'outsidePaid', (v_bucket->>'outside')::numeric
    ));
  END LOOP;

  RETURN jsonb_build_object(
    'currencies', v_people,
    'missingShareCount', v_missing,
    'unsetCount', v_unset
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.tyapp_yyems_split_group_totals(uuid, uuid, uuid)
  TO authenticated;
