-- Fix KEN IGHO's inflated total_trades (currently 5,445 -- test-trade
-- inflation) down to the real number, and re-arm the protection trigger
-- immediately afterward so it keeps guarding the column for every future
-- update, including this account's own future trade completions.
--
-- Target value: 10 -- verified directly against trades: is_test = false AND
-- status = 'COMPLETED' = 10 rows for this account. (Real CANCELLED = 13,
-- but cancelled trades never counted toward total_trades anywhere else in
-- this codebase, so they're excluded here too, for consistency.)
--
-- Run this whole file in one go in the Supabase SQL Editor.

BEGIN;

DO $$
DECLARE
  v_user_id     uuid := '65830906-297b-4eb5-8c60-ed0e9a4aac82'; -- KEN IGHO -- resolved and
                                                                  -- verified directly against
                                                                  -- this exact id, not by a
                                                                  -- username pattern (which
                                                                  -- may match more than one
                                                                  -- account and pick the wrong
                                                                  -- row).
  v_username    text;
  v_trigger     text;
  v_admin_id    uuid := '14762cd0-d3b2-474f-acab-fe0071961e9a'; -- praqen CEO account
  v_before      int;
  v_computed    int;
  v_after       int;
BEGIN
  -- Confirm the id actually resolves to a real user before doing anything else.
  SELECT username INTO v_username FROM users WHERE id = v_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No user with id % -- stopping, nothing changed.', v_user_id;
  END IF;

  -- Find the real trigger name rather than guessing it -- avoids the whole
  -- protect_user_stats vs protect_user_stats_trigger question entirely.
  SELECT tgname INTO v_trigger
  FROM pg_trigger
  WHERE tgrelid = 'public.users'::regclass
    AND tgname ILIKE '%protect%user%stat%'
  LIMIT 1;

  IF v_trigger IS NULL THEN
    RAISE EXCEPTION 'No trigger matching protect_user_stats found on public.users -- stopping, nothing changed.';
  END IF;

  SELECT total_trades INTO v_before FROM users WHERE id = v_user_id;

  -- The real, verified count: is_test = false AND status = 'COMPLETED'.
  SELECT count(*) INTO v_computed
  FROM trades
  WHERE (buyer_id = v_user_id OR seller_id = v_user_id)
    AND is_test = false
    AND status = 'COMPLETED';

  RAISE NOTICE 'user=% (%) trigger=% before=% computed=%', v_username, v_user_id, v_trigger, v_before, v_computed;

  EXECUTE format('ALTER TABLE users DISABLE TRIGGER %I', v_trigger);

  UPDATE users SET total_trades = v_computed WHERE id = v_user_id;

  EXECUTE format('ALTER TABLE users ENABLE TRIGGER %I', v_trigger);

  SELECT total_trades INTO v_after FROM users WHERE id = v_user_id;
  RAISE NOTICE 'after=%', v_after;

  IF v_after != v_computed THEN
    RAISE EXCEPTION 'Update did not take -- total_trades is % instead of %. Rolling back, nothing changed.', v_after, v_computed;
  END IF;

  -- Best-effort audit trail: wrapped in its own sub-block so that if this
  -- specific insert fails for any reason (schema mismatch, etc.), it can
  -- only log a warning -- it can never roll back the total_trades fix
  -- above, which is the actual point of this migration.
  BEGIN
    INSERT INTO admin_audit_log (admin_id, target_id, action, details)
    VALUES (
      v_admin_id,
      v_user_id,
      'CORRECT_TOTAL_TRADES',
      jsonb_build_object(
        'before', v_before,
        'computed', v_computed,
        'after', v_after,
        'reason', 'total_trades was inflated by test trades (is_test=true); corrected to the real is_test=false AND status=COMPLETED count. Trigger temporarily disabled and re-enabled within this same transaction.'
      )
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Audit log insert failed (total_trades fix above is unaffected): %', SQLERRM;
  END;
END $$;

-- Final confirmation: total_trades = 10, trigger_status = 'O' (enabled).
SELECT
  u.username,
  u.total_trades,
  t.tgname   AS trigger_name,
  t.tgenabled AS trigger_status -- 'O' = enabled, 'D' = disabled
FROM users u
CROSS JOIN pg_trigger t
WHERE u.id = '65830906-297b-4eb5-8c60-ed0e9a4aac82'
  AND t.tgrelid = 'public.users'::regclass
  AND t.tgname ILIKE '%protect%user%stat%';

-- The DO block above is self-protecting: any RAISE EXCEPTION aborts this
-- whole transaction automatically, so COMMIT below has nothing to commit if
-- anything went wrong. If the SELECT above shows total_trades = 10 and
-- trigger_status = 'O', this COMMIT makes it permanent.
COMMIT;
