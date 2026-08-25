-- ============================================================================
-- Non-destructive test suite for 2026-08-25_balance_integrity_fix.sql
--
-- Run this AFTER the migration, in the Supabase SQL Editor, as ONE script.
-- Everything happens inside BEGIN ... ROLLBACK — a synthetic test user and
-- two synthetic wallets rows are created, exercised, and then the whole
-- transaction is rolled back at the end, so NOTHING persists. No real user,
-- and no real balance, is touched by this file.
--
-- Read the RAISE NOTICE output after running — every check prints PASS or
-- FAIL with the reason. Do not apply the migration to other environments
-- (or consider Phase 1 "verified") until every line here reads PASS.
-- ============================================================================

BEGIN;

DO $$
DECLARE
  v_user_a   UUID := gen_random_uuid();
  v_user_b   UUID := gen_random_uuid();
  v_res      RECORD;
  v_bal_a    NUMERIC;
  v_bal_b    NUMERIC;
  v_tx_id    UUID;
  v_caught   BOOLEAN;
  v_ceo_id   UUID := gen_random_uuid();
BEGIN
  RAISE NOTICE '--- Setting up synthetic test users (rolled back at end, never committed) ---';

  INSERT INTO users (id, email, password_hash, username, has_warning)
  VALUES
    (v_user_a, 'test-a-' || v_user_a || '@praqen.test', 'x', 'test_a_' || substr(v_user_a::text, 1, 8), false),
    (v_user_b, 'test-b-' || v_user_b || '@praqen.test', 'x', 'test_b_' || substr(v_user_b::text, 1, 8), false);

  INSERT INTO wallets (user_id, private_key, balance_btc, balance_usdt, locked_balance_btc, locked_balance_usdt)
  VALUES
    (v_user_a, 'test-key-a', 1.00000000, 500.000000, 0, 0),
    (v_user_b, 'test-key-b', 0.00000000, 0.000000, 0, 0);

  ------------------------------------------------------------------------
  -- TEST 1: praqen_internal_transfer — basic success (BTC)
  ------------------------------------------------------------------------
  SELECT * INTO v_res FROM praqen_internal_transfer(v_user_a, v_user_b, 'BTC', 0.3, 'test-key-1', 'test transfer');
  IF v_res.sender_balance = 0.7 AND v_res.recipient_balance = 0.3 THEN
    RAISE NOTICE 'PASS: TEST 1 basic BTC transfer — sender=0.7 recipient=0.3';
  ELSE
    RAISE NOTICE 'FAIL: TEST 1 basic BTC transfer — got sender=%, recipient=%', v_res.sender_balance, v_res.recipient_balance;
  END IF;

  ------------------------------------------------------------------------
  -- TEST 2: idempotency — replaying the exact same key must be a no-op
  ------------------------------------------------------------------------
  v_caught := false;
  BEGIN
    PERFORM * FROM praqen_internal_transfer(v_user_a, v_user_b, 'BTC', 0.3, 'test-key-1', 'replay');
  EXCEPTION WHEN unique_violation THEN
    v_caught := true;
  END;
  SELECT balance_btc INTO v_bal_a FROM wallets WHERE user_id = v_user_a;
  IF v_caught AND v_bal_a = 0.7 THEN
    RAISE NOTICE 'PASS: TEST 2 idempotency — replayed key rejected, balance unchanged at 0.7';
  ELSE
    RAISE NOTICE 'FAIL: TEST 2 idempotency — caught=%, sender balance=% (expected 0.7)', v_caught, v_bal_a;
  END IF;

  ------------------------------------------------------------------------
  -- TEST 3: insufficient balance is rejected, nothing moves
  ------------------------------------------------------------------------
  v_caught := false;
  BEGIN
    PERFORM * FROM praqen_internal_transfer(v_user_a, v_user_b, 'BTC', 999, 'test-key-3', 'too much');
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'INSUFFICIENT_BALANCE%' THEN v_caught := true; END IF;
  END;
  SELECT balance_btc INTO v_bal_a FROM wallets WHERE user_id = v_user_a;
  IF v_caught AND v_bal_a = 0.7 THEN
    RAISE NOTICE 'PASS: TEST 3 insufficient balance rejected, sender still 0.7';
  ELSE
    RAISE NOTICE 'FAIL: TEST 3 insufficient balance — caught=%, sender balance=%', v_caught, v_bal_a;
  END IF;

  ------------------------------------------------------------------------
  -- TEST 4: invalid amounts rejected (zero, negative, null)
  ------------------------------------------------------------------------
  v_caught := false;
  BEGIN
    PERFORM * FROM praqen_internal_transfer(v_user_a, v_user_b, 'BTC', 0, 'test-key-4a', 'zero');
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'INVALID_AMOUNT%' THEN v_caught := true; END IF;
  END;
  IF NOT v_caught THEN RAISE NOTICE 'FAIL: TEST 4a zero amount was NOT rejected'; END IF;

  v_caught := false;
  BEGIN
    PERFORM * FROM praqen_internal_transfer(v_user_a, v_user_b, 'BTC', -0.1, 'test-key-4b', 'negative');
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'INVALID_AMOUNT%' THEN v_caught := true; END IF;
  END;
  IF NOT v_caught THEN RAISE NOTICE 'FAIL: TEST 4b negative amount was NOT rejected'; END IF;

  v_caught := false;
  BEGIN
    PERFORM * FROM praqen_internal_transfer(v_user_a, v_user_b, 'BTC', NULL, 'test-key-4c', 'null');
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'INVALID_AMOUNT%' THEN v_caught := true; END IF;
  END;
  IF NOT v_caught THEN RAISE NOTICE 'FAIL: TEST 4c null amount was NOT rejected'; END IF;

  RAISE NOTICE 'PASS (if no FAIL above): TEST 4 zero/negative/null amounts all rejected';

  ------------------------------------------------------------------------
  -- TEST 5: self-transfer rejected
  ------------------------------------------------------------------------
  v_caught := false;
  BEGIN
    PERFORM * FROM praqen_internal_transfer(v_user_a, v_user_a, 'BTC', 0.1, 'test-key-5', 'self');
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'SELF_TRANSFER%' THEN v_caught := true; END IF;
  END;
  IF v_caught THEN
    RAISE NOTICE 'PASS: TEST 5 self-transfer rejected';
  ELSE
    RAISE NOTICE 'FAIL: TEST 5 self-transfer was NOT rejected';
  END IF;

  ------------------------------------------------------------------------
  -- TEST 6: USDT side of the same function works independently of BTC
  ------------------------------------------------------------------------
  SELECT * INTO v_res FROM praqen_internal_transfer(v_user_a, v_user_b, 'USDT', 200, 'test-key-6', 'usdt transfer');
  IF v_res.sender_balance = 300 AND v_res.recipient_balance = 200 THEN
    RAISE NOTICE 'PASS: TEST 6 USDT transfer — sender=300 recipient=200';
  ELSE
    RAISE NOTICE 'FAIL: TEST 6 USDT transfer — got sender=%, recipient=%', v_res.sender_balance, v_res.recipient_balance;
  END IF;

  ------------------------------------------------------------------------
  -- TEST 7: praqen_credit_deposit — basic success + duplicate rejected
  ------------------------------------------------------------------------
  SELECT praqen_credit_deposit(v_user_b, 'BTC', 0.05, 0.35, 'test-deposit-1', 'test deposit') INTO v_bal_b;
  IF v_bal_b = 0.35 THEN
    RAISE NOTICE 'PASS: TEST 7a deposit credit — new balance 0.35';
  ELSE
    RAISE NOTICE 'FAIL: TEST 7a deposit credit — got %', v_bal_b;
  END IF;

  v_caught := false;
  BEGIN
    PERFORM praqen_credit_deposit(v_user_b, 'BTC', 0.05, 0.35, 'test-deposit-1', 'replay');
  EXCEPTION WHEN unique_violation THEN
    v_caught := true;
  END;
  SELECT balance_btc INTO v_bal_b FROM wallets WHERE user_id = v_user_b;
  IF v_caught AND v_bal_b = 0.35 THEN
    RAISE NOTICE 'PASS: TEST 7b duplicate deposit rejected, balance still 0.35 (no double-credit)';
  ELSE
    RAISE NOTICE 'FAIL: TEST 7b duplicate deposit — caught=%, balance=%', v_caught, v_bal_b;
  END IF;

  ------------------------------------------------------------------------
  -- TEST 8: praqen_reject_withdrawal — atomic claim + refund + double-reject blocked
  ------------------------------------------------------------------------
  INSERT INTO wallet_transactions (id, user_id, type, amount_btc, platform_fee_btc, status, destination_address, created_at)
  VALUES (gen_random_uuid(), v_user_a, 'WITHDRAWAL', 0.2, 0.01, 'PENDING_APPROVAL', 'bc1testaddress', now())
  RETURNING id INTO v_tx_id;

  SELECT balance_btc INTO v_bal_a FROM wallets WHERE user_id = v_user_a; -- 0.7 before refund

  SELECT * INTO v_res FROM praqen_reject_withdrawal(v_tx_id, v_ceo_id, 'test rejection reason');
  SELECT balance_btc INTO v_bal_a FROM wallets WHERE user_id = v_user_a;
  IF v_res.refunded_amount = 0.21 AND v_bal_a = 0.91 THEN
    RAISE NOTICE 'PASS: TEST 8a reject-withdrawal refunded 0.21 (amount+fee), sender now 0.91';
  ELSE
    RAISE NOTICE 'FAIL: TEST 8a reject-withdrawal — refunded=%, sender balance=% (expected 0.21 / 0.91)', v_res.refunded_amount, v_bal_a;
  END IF;

  v_caught := false;
  BEGIN
    PERFORM * FROM praqen_reject_withdrawal(v_tx_id, v_ceo_id, 'second reject attempt');
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'ALREADY_REVIEWED%' THEN v_caught := true; END IF;
  END;
  SELECT balance_btc INTO v_bal_a FROM wallets WHERE user_id = v_user_a;
  IF v_caught AND v_bal_a = 0.91 THEN
    RAISE NOTICE 'PASS: TEST 8b double-reject blocked — balance still 0.91 (no double refund)';
  ELSE
    RAISE NOTICE 'FAIL: TEST 8b double-reject — caught=%, balance=% (expected still 0.91)', v_caught, v_bal_a;
  END IF;

  RAISE NOTICE '--- All tests executed. Review PASS/FAIL lines above. Rolling back — nothing persists. ---';
END $$;

ROLLBACK;

-- Confirm rollback actually happened: this SELECT (run AFTER the block above,
-- in a fresh statement) should return 0 rows, since the whole test — including
-- the INSERT INTO users — was inside the rolled-back transaction.
SELECT count(*) AS should_be_zero FROM users WHERE email LIKE 'test-a-%@praqen.test' OR email LIKE 'test-b-%@praqen.test';
