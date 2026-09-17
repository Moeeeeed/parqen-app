-- PRAQEN — 2026-09-04 — Add idempotency-key shape/ownership check to praqen_credit_deposit
--
-- Part 2 / step 2.1d of the deposit-reliability work.
--
-- WHY:
--   The deposit monitors pass p_idempotency_key = '<currency>:<user_id>:<txid>'.
--   Nothing inside the function checks that the key actually belongs to the
--   user + currency being credited. A key in that exact automatic shape that
--   names a DIFFERENT user or currency can only be a bug or a replay, and today
--   it would be accepted. This adds a single guard that rejects such a key.
--
-- WHAT CHANGES:
--   Exactly one new IF ... RAISE EXCEPTION block, added immediately after the
--   existing key-not-empty check. Everything else in this function is byte-for-byte
--   the currently-deployed body (from database/20260828_sync_btc_balance_mirrors.sql).
--
-- WHAT DOES NOT CHANGE:
--   • No balance, ledger row, mirror, checkpoint, or audit row is touched by
--     running this migration — it is CREATE OR REPLACE FUNCTION only.
--   • Free-form keys that do NOT match the automatic '<BTC|USDT>:<uuid>:' shape
--     (manual corrections, the reviewed back-fills, one-off correct-*.js scripts)
--     are deliberately left alone and still work.
--   • Every current automatic caller (depositMonitor.js, usdtDepositMonitor.js)
--     already passes a correctly-shaped key, so their behaviour is unchanged.
--
-- SAFE TO RUN ON PRODUCTION. Run ONCE in the Supabase SQL Editor. Review first.
--
-- VERIFY AFTER RUNNING (both statements should behave as noted):
--   -- (1) a well-formed key for a bogus user still fails INSIDE the function
--   --     (i.e. reaches the WALLET_NOT_FOUND path), proving the new check let it through:
--   SELECT public.praqen_credit_deposit(
--     '00000000-0000-0000-0000-000000000000'::uuid, 'USDT', 0.01, 0,
--     'USDT:00000000-0000-0000-0000-000000000000:deadbeef', 'verify');
--   --   => expected: ERROR containing 'WALLET_NOT_FOUND'  (NOT 'IDEMPOTENCY_KEY_MISMATCH')
--
--   -- (2) an automatic-shape key naming a different user is now rejected up front:
--   SELECT public.praqen_credit_deposit(
--     '00000000-0000-0000-0000-000000000000'::uuid, 'USDT', 0.01, 0,
--     'USDT:11111111-1111-1111-1111-111111111111:deadbeef', 'verify');
--   --   => expected: ERROR containing 'IDEMPOTENCY_KEY_MISMATCH'

CREATE OR REPLACE FUNCTION public.praqen_credit_deposit(
  p_user_id uuid,
  p_currency text,
  p_amount numeric,
  p_onchain_balance numeric,
  p_idempotency_key text,
  p_note text DEFAULT NULL::text
)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_new_balance NUMERIC;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT: amount must be positive';
  END IF;

  IF p_currency NOT IN ('BTC', 'USDT') THEN
    RAISE EXCEPTION 'INVALID_CURRENCY: must be BTC or USDT';
  END IF;

  IF p_idempotency_key IS NULL OR length(p_idempotency_key) = 0 THEN
    RAISE EXCEPTION 'INVALID_IDEMPOTENCY_KEY';
  END IF;

  -- 2026-09-04 (step 2.1d): if the key uses the automatic '<BTC|USDT>:<uuid>:...'
  -- shape, it MUST name THIS user and currency. A mismatched automatic-shape key
  -- is a bug or a replay — refuse it. Free-form keys are unaffected.
  IF p_idempotency_key ~ '^(BTC|USDT):[0-9a-fA-F-]{36}:'
     AND p_idempotency_key NOT LIKE (p_currency || ':' || p_user_id::text || ':%') THEN
    RAISE EXCEPTION 'IDEMPOTENCY_KEY_MISMATCH: automatic-format key % is not for %/%',
      p_idempotency_key, p_currency, p_user_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM wallets WHERE user_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'WALLET_NOT_FOUND: user has no wallet';
  END IF;

  INSERT INTO wallet_transactions (
    user_id,
    type,
    currency,
    amount_btc,
    amount_usdt,
    status,
    notes,
    idempotency_key,
    created_at
  )
  VALUES (
    p_user_id,
    'DEPOSIT',
    p_currency,
    CASE WHEN p_currency = 'BTC' THEN p_amount ELSE 0 END,
    CASE WHEN p_currency = 'USDT' THEN p_amount ELSE 0 END,
    'CONFIRMED',
    p_note,
    p_idempotency_key,
    now()
  );

  IF p_currency = 'BTC' THEN
    UPDATE wallets
    SET balance_btc = balance_btc + p_amount,
        updated_at = now()
    WHERE user_id = p_user_id
    RETURNING balance_btc INTO v_new_balance;
  ELSE
    UPDATE wallets
    SET balance_usdt = balance_usdt + p_amount,
        updated_at = now()
    WHERE user_id = p_user_id
    RETURNING balance_usdt INTO v_new_balance;
  END IF;

  IF p_currency = 'BTC' THEN
    UPDATE user_balances
    SET balance_btc = v_new_balance,
        updated_at = now()
    WHERE user_id = p_user_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION
        'BTC_BALANCE_MIRROR_MISSING: user_balances row not found for user %', p_user_id;
    END IF;

    UPDATE user_wallets
    SET balance_btc = v_new_balance,
        updated_at = now()
    WHERE user_id = p_user_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION
        'BTC_WALLET_MIRROR_MISSING: user_wallets row not found for user %', p_user_id;
    END IF;
  END IF;

  IF p_currency = 'BTC' THEN
    UPDATE user_wallets
    SET last_onchain_btc = p_onchain_balance,
        updated_at = now()
    WHERE user_id = p_user_id;
  ELSE
    UPDATE user_wallets
    SET last_onchain_usdt = p_onchain_balance,
        updated_at = now()
    WHERE user_id = p_user_id;
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'USER_WALLETS_NOT_FOUND: cannot advance deposit checkpoint';
  END IF;

  INSERT INTO balance_audit (
    user_id,
    change_btc,
    new_balance,
    reason,
    created_at
  )
  VALUES (
    p_user_id,
    CASE WHEN p_currency = 'BTC' THEN p_amount ELSE 0 END,
    v_new_balance,
    'DEPOSIT',
    now()
  );

  RETURN v_new_balance;
END;
$function$;
