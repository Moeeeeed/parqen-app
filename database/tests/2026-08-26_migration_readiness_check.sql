-- ============================================================================
-- Migration readiness check — read-only, zero side effects
-- Run this in the SEPARATE TESTING Supabase's SQL Editor ONLY.
--
-- SAFETY: every statement in this file is SELECT or introspection against
-- system catalogs (information_schema / pg_catalog). There is no CREATE,
-- ALTER, DROP, INSERT, UPDATE, or DELETE anywhere in this file, and no RPC
-- is called. The whole thing is additionally wrapped in BEGIN...ROLLBACK as
-- a hard guarantee that nothing can persist even if that were somehow wrong.
--
-- Purpose: confirms the CURRENT state of the testing database before
-- 2026-08-25_balance_integrity_fix.sql is applied — copy the entire
-- "Messages"/"Notices" panel output after running this and send it back.
-- ============================================================================

BEGIN;

DO $$
DECLARE
  r RECORD;
  v_count INT;
  v_exists BOOLEAN;
BEGIN
  RAISE NOTICE '=====================================================';
  RAISE NOTICE '1. SCHEMA OVERVIEW — wallets, wallet_transactions, user_wallets';
  RAISE NOTICE '=====================================================';

  FOR r IN
    SELECT table_name, column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN ('wallets', 'wallet_transactions', 'user_wallets')
    ORDER BY table_name, ordinal_position
  LOOP
    RAISE NOTICE '  [%] % — % (nullable: %)', r.table_name, r.column_name, r.data_type, r.is_nullable;
  END LOOP;

  RAISE NOTICE '=====================================================';
  RAISE NOTICE '2. DUPLICATE wallets.user_id CHECK';
  RAISE NOTICE '=====================================================';

  SELECT COUNT(*) INTO v_count FROM (
    SELECT user_id FROM wallets GROUP BY user_id HAVING COUNT(*) > 1
  ) d;
  IF v_count = 0 THEN
    RAISE NOTICE '  PASS: no duplicate wallets.user_id rows found';
  ELSE
    RAISE NOTICE '  FAIL: % user_id(s) have more than one wallets row', v_count;
  END IF;

  RAISE NOTICE '=====================================================';
  RAISE NOTICE '3. INVALID BTC/USDT BALANCE CHECK';
  RAISE NOTICE '   (negative, NULL, or out of generous sane bounds —';
  RAISE NOTICE '    same bounds as the migration''s own CHECK constraints:';
  RAISE NOTICE '    BTC 0..21,000,000 / USDT 0..1,000,000,000.';
  RAISE NOTICE '    Postgres NUMERIC sorts NaN above all finite values,';
  RAISE NOTICE '    so the upper bound also catches NaN.)';
  RAISE NOTICE '=====================================================';

  SELECT COUNT(*) INTO v_count FROM wallets
    WHERE balance_btc IS NULL OR balance_btc < 0 OR balance_btc > 21000000;
  RAISE NOTICE '  balance_btc invalid rows: %', v_count;

  SELECT COUNT(*) INTO v_count FROM wallets
    WHERE locked_balance_btc IS NULL OR locked_balance_btc < 0 OR locked_balance_btc > 21000000;
  RAISE NOTICE '  locked_balance_btc invalid rows: %', v_count;

  SELECT COUNT(*) INTO v_count FROM wallets
    WHERE balance_usdt IS NULL OR balance_usdt < 0 OR balance_usdt > 1000000000;
  RAISE NOTICE '  balance_usdt invalid rows: %', v_count;

  SELECT COUNT(*) INTO v_count FROM wallets
    WHERE locked_balance_usdt IS NULL OR locked_balance_usdt < 0 OR locked_balance_usdt > 1000000000;
  RAISE NOTICE '  locked_balance_usdt invalid rows: %', v_count;

  -- If any user_id shows up here, list it explicitly for follow-up.
  FOR r IN
    SELECT user_id, balance_btc, locked_balance_btc, balance_usdt, locked_balance_usdt
    FROM wallets
    WHERE balance_btc IS NULL OR balance_btc < 0 OR balance_btc > 21000000
       OR locked_balance_btc IS NULL OR locked_balance_btc < 0 OR locked_balance_btc > 21000000
       OR balance_usdt IS NULL OR balance_usdt < 0 OR balance_usdt > 1000000000
       OR locked_balance_usdt IS NULL OR locked_balance_usdt < 0 OR locked_balance_usdt > 1000000000
  LOOP
    RAISE NOTICE '  >>> OFFENDING ROW: user_id=% btc=% locked_btc=% usdt=% locked_usdt=%',
      r.user_id, r.balance_btc, r.locked_balance_btc, r.balance_usdt, r.locked_balance_usdt;
  END LOOP;

  RAISE NOTICE '=====================================================';
  RAISE NOTICE '4. wallet_transactions.idempotency_key EXISTS?';
  RAISE NOTICE '=====================================================';

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'wallet_transactions' AND column_name = 'idempotency_key'
  ) INTO v_exists;
  RAISE NOTICE '  idempotency_key column exists: %', v_exists;

  RAISE NOTICE '=====================================================';
  RAISE NOTICE '5. reconciliation_flags TABLE EXISTS?';
  RAISE NOTICE '=====================================================';

  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'reconciliation_flags'
  ) INTO v_exists;
  RAISE NOTICE '  reconciliation_flags table exists: %', v_exists;

  RAISE NOTICE '=====================================================';
  RAISE NOTICE '6-7. RPC EXISTENCE + SECURITY CONFIG (SECURITY DEFINER, search_path)';
  RAISE NOTICE '=====================================================';

  FOR r IN
    SELECT p.proname,
           p.prosecdef AS is_security_definer,
           p.proconfig AS config_settings   -- e.g. {search_path=public, pg_temp} or NULL if unset
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('praqen_credit_deposit', 'praqen_internal_transfer', 'praqen_reject_withdrawal')
  LOOP
    RAISE NOTICE '  FOUND: % | SECURITY DEFINER: % | config (search_path etc.): %',
      r.proname, r.is_security_definer, COALESCE(r.config_settings::text, '(none set)');
  END LOOP;

  -- Explicitly call out any of the 3 that are MISSING, one by one.
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname='public' AND p.proname='praqen_credit_deposit') THEN
    RAISE NOTICE '  MISSING: praqen_credit_deposit does not exist yet';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname='public' AND p.proname='praqen_internal_transfer') THEN
    RAISE NOTICE '  MISSING: praqen_internal_transfer does not exist yet';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname='public' AND p.proname='praqen_reject_withdrawal') THEN
    RAISE NOTICE '  MISSING: praqen_reject_withdrawal does not exist yet';
  END IF;

  RAISE NOTICE '=====================================================';
  RAISE NOTICE '8. EXECUTE PRIVILEGES — PUBLIC / anon / authenticated / service_role';
  RAISE NOTICE '=====================================================';

  FOR r IN
    SELECT routine_name, grantee, privilege_type
    FROM information_schema.routine_privileges
    WHERE routine_schema = 'public'
      AND routine_name IN ('praqen_credit_deposit', 'praqen_internal_transfer', 'praqen_reject_withdrawal')
    ORDER BY routine_name, grantee
  LOOP
    RAISE NOTICE '  % — grantee=% privilege=%', r.routine_name, r.grantee, r.privilege_type;
  END LOOP;

  RAISE NOTICE '  (If the 3 functions above show as MISSING in section 6-7, this section';
  RAISE NOTICE '   will show no rows — that''s expected, there is nothing to grant on yet.)';

  RAISE NOTICE '--- Checking project-level DEFAULT privileges for NEW functions in schema public ---';
  FOR r IN
    SELECT defaclrole::regrole::text AS default_for_role,
           defaclnamespace::regnamespace::text AS schema_name,
           defaclobjtype,
           defaclacl::text AS acl
    FROM pg_default_acl
    WHERE defaclnamespace::regnamespace::text = 'public'
      AND defaclobjtype = 'f'
  LOOP
    RAISE NOTICE '  DEFAULT ACL for role=% schema=% objtype=function: %', r.default_for_role, r.schema_name, r.acl;
  END LOOP;
  RAISE NOTICE '  (If NO rows printed above, this project has NOT customized the default —';
  RAISE NOTICE '   meaning Postgres''s built-in default applies: EXECUTE TO PUBLIC on any';
  RAISE NOTICE '   brand-new function, unless a migration explicitly REVOKEs it, as the';
  RAISE NOTICE '   hardened migration now does for these 3 functions.)';

  RAISE NOTICE '=====================================================';
  RAISE NOTICE 'DONE. Copy everything above (this whole Messages panel) and send it back.';
  RAISE NOTICE 'Nothing was created, altered, or written — rolling back now.';
  RAISE NOTICE '=====================================================';
END $$;

ROLLBACK;
