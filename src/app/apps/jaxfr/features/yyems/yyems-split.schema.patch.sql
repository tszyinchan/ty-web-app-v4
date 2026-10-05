-- Split = AppSheet Stat: Ownership=yyems only, (FRD_paid - CTY_paid)/2 per FA currency.
-- Settlement amount: wallet_amount + FA currency if set, else amount + bill currency.
-- In reverses sign (like AppSheet auto_amount). Safe to re-run.

CREATE OR REPLACE FUNCTION public.tyapp_yyhome_split_group_totals(
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
  v_cty uuid;
  v_frd uuid;
  v_paid_cty numeric;
  v_paid_frd numeric;
  v_bucket jsonb;
  v_currencies jsonb := '{}'::jsonb;
  v_people jsonb := '[]'::jsonb;
  v_code text;
BEGIN
  IF NOT public.tyapp_yyhome_is_household_member() THEN
    RAISE EXCEPTION 'not a household member';
  END IF;
  IF p_user_a IS NULL OR p_user_b IS NULL OR p_user_a = p_user_b THEN
    RAISE EXCEPTION 'invalid split pair';
  END IF;

  -- Resolve which uuid is cty / frd via appsheet_525_user_id.
  SELECT user_id INTO v_cty
  FROM public.tyapp_user
  WHERE user_id IN (p_user_a, p_user_b)
    AND appsheet_525_user_id = 'cty'
    AND deleted_at IS NULL
  LIMIT 1;
  SELECT user_id INTO v_frd
  FROM public.tyapp_user
  WHERE user_id IN (p_user_a, p_user_b)
    AND appsheet_525_user_id = 'frd'
    AND deleted_at IS NULL
  LIMIT 1;

  IF v_cty IS NULL OR v_frd IS NULL THEN
    RAISE EXCEPTION 'pair must map to appsheet_525_user_id cty and frd';
  END IF;

  FOR v_bill IN
    SELECT
      b.tb_tyapp_yhbl_id,
      b.in_or_out,
      b.amount,
      b.currency,
      b.wallet_amount,
      fa.owner_user_id AS payer_user_id,
      fa.currency AS wallet_currency
    FROM public.tyapp_yyhome_bill b
    LEFT JOIN public.tyapp_yyhome_wallet w
      ON w.tb_tyapp_yhwl_id = b.wallet_id
     AND w.deleted_at IS NULL
    LEFT JOIN public.tyapp_yyhome_financial_account fa
      ON fa.tb_tyapp_yhfa_id = w.financial_account_id
     AND fa.deleted_at IS NULL
    WHERE b.deleted_at IS NULL
      AND b.ownership = 'yyems'
      -- AppSheet Stat is global for the pair; p_group_id is unused this round.
    ORDER BY b.tb_tyapp_yhbl_id
  LOOP
    IF v_bill.wallet_currency IS NULL THEN
      CONTINUE;
    END IF;

    -- Settlement: wallet_amount in FA currency when set, else amount in bill currency.
    IF v_bill.wallet_amount IS NOT NULL THEN
      v_amount := round(abs(v_bill.wallet_amount::numeric), 2);
      v_currency := v_bill.wallet_currency;
    ELSE
      v_amount := round(abs(v_bill.amount::numeric), 2);
      v_currency := v_bill.currency;
    END IF;

    IF v_bill.in_or_out = 'in' THEN
      v_amount := -v_amount;
    END IF;

    IF abs(v_amount) <= v_eps THEN
      CONTINUE;
    END IF;

    v_payer := v_bill.payer_user_id;
    -- AppSheet Stat only aggregates FA owner cty/frd (joint pot skipped).
    IF v_payer IS DISTINCT FROM v_cty AND v_payer IS DISTINCT FROM v_frd THEN
      CONTINUE;
    END IF;

    v_bucket := coalesce(v_currencies -> v_currency, jsonb_build_object(
      'currency', v_currency,
      'paid_cty', 0,
      'paid_frd', 0
    ));

    IF v_payer = v_cty THEN
      v_bucket := jsonb_set(
        v_bucket,
        '{paid_cty}',
        to_jsonb(round((v_bucket->>'paid_cty')::numeric + v_amount, 2))
      );
    ELSE
      v_bucket := jsonb_set(
        v_bucket,
        '{paid_frd}',
        to_jsonb(round((v_bucket->>'paid_frd')::numeric + v_amount, 2))
      );
    END IF;

    v_currencies := jsonb_set(v_currencies, ARRAY[v_currency], v_bucket);
  END LOOP;

  FOR v_code, v_bucket IN
    SELECT key, value FROM jsonb_each(v_currencies) ORDER BY key
  LOOP
    v_paid_cty := round((v_bucket->>'paid_cty')::numeric, 2);
    v_paid_frd := round((v_bucket->>'paid_frd')::numeric, 2);
    -- AppSheet Stat: each bears half of joint spend.
    -- net = paid − borne; viewerPays = −net (positive = you pay the other).
    IF p_user_a = v_cty THEN
      v_people := v_people || jsonb_build_array(jsonb_build_object(
        'currency', v_code,
        'people', jsonb_build_array(
          jsonb_build_object(
            'userId', v_cty,
            'selfPaid', 0, 'otherPaid', 0, 'bothPaid', v_paid_cty
          ),
          jsonb_build_object(
            'userId', v_frd,
            'selfPaid', 0, 'otherPaid', 0, 'bothPaid', v_paid_frd
          )
        ),
        'nets', jsonb_build_array(
          round((v_paid_cty - v_paid_frd) / 2, 2),
          round((v_paid_frd - v_paid_cty) / 2, 2)
        ),
        'paid', jsonb_build_array(v_paid_cty, v_paid_frd),
        'borne', jsonb_build_array(
          round((v_paid_cty + v_paid_frd) / 2, 2),
          round((v_paid_cty + v_paid_frd) / 2, 2)
        ),
        'firstPaysSecond', round((v_paid_frd - v_paid_cty) / 2, 2),
        'outsidePaid', 0
      ));
    ELSE
      v_people := v_people || jsonb_build_array(jsonb_build_object(
        'currency', v_code,
        'people', jsonb_build_array(
          jsonb_build_object(
            'userId', v_frd,
            'selfPaid', 0, 'otherPaid', 0, 'bothPaid', v_paid_frd
          ),
          jsonb_build_object(
            'userId', v_cty,
            'selfPaid', 0, 'otherPaid', 0, 'bothPaid', v_paid_cty
          )
        ),
        'nets', jsonb_build_array(
          round((v_paid_frd - v_paid_cty) / 2, 2),
          round((v_paid_cty - v_paid_frd) / 2, 2)
        ),
        'paid', jsonb_build_array(v_paid_frd, v_paid_cty),
        'borne', jsonb_build_array(
          round((v_paid_cty + v_paid_frd) / 2, 2),
          round((v_paid_cty + v_paid_frd) / 2, 2)
        ),
        'firstPaysSecond', round((v_paid_cty - v_paid_frd) / 2, 2),
        'outsidePaid', 0
      ));
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'currencies', v_people,
    'missingShareCount', 0,
    'unsetCount', 0
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.tyapp_yyhome_split_group_totals(uuid, uuid, uuid)
  TO authenticated;
