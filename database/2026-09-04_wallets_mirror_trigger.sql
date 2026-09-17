-- PRAQEN — 2026-09-04 — Part 2 / step 2.8 (OPTIONAL, recommended)
-- Keep user_balances + user_wallets BTC/USDT mirrors in lock-step with wallets
-- via ONE trigger, so no writer can ever leave a mirror stale again.
--
-- WHY:
--   `wallets` is authoritative. `user_balances.balance_btc` and
--   `user_wallets.balance_btc` are legacy mirrors that only SOME writers update.
--   Result: ~62 MIRROR_DRIFT flags/day, and praqen_credit_deposit hard-fails
--   (rolls the whole credit back, retries forever) if a mirror ROW is missing.
--   A single AFTER-UPDATE trigger on wallets fixes every writer at once.
--
-- WHAT IT DOES:
--   After any UPDATE of wallets.balance_btc / balance_usdt, copy the new values
--   into the matching user_balances row and user_wallets row (if those rows
--   exist — it never creates them, and never touches any other column).
--   USDT is written to user_wallets only; user_balances has no balance_usdt
--   column on the live schema, so only balance_btc/balance_usd is mirrored there.
--
-- WHAT IT DOES NOT DO:
--   • never changes wallets itself (AFTER trigger, no NEW rewrite)
--   • never creates a user_balances / user_wallets row
--   • never touches locked_*, addresses, checkpoints, or any non-balance column
--   • no effect on INSERT or DELETE of wallets
--
-- RISK: it runs on every wallets balance update (the hottest write path). It is
--   a plain 1-2 row UPDATE with no loops, no external calls. Review, then run
--   ONCE in the Supabase SQL Editor. Watch write latency for a few minutes after.
--
-- ROLLBACK:
--   DROP TRIGGER IF EXISTS trg_wallets_mirror_sync ON public.wallets;
--   DROP FUNCTION IF EXISTS public.fn_wallets_mirror_sync();
--
-- AFTER RUNNING: reconcile and clear the existing MIRROR_DRIFT backlog once
--   (the mirrors will now be correct going forward), e.g.
--     UPDATE reconciliation_flags SET status='RESOLVED', resolved_at=now(),
--       resolution_notes='mirror trigger 2026-09-04 — mirrors now auto-synced'
--     WHERE reason='MIRROR_DRIFT' AND status='RECONCILIATION_REQUIRED';

CREATE OR REPLACE FUNCTION public.fn_wallets_mirror_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- only act when a balance actually changed
  IF NEW.balance_btc IS DISTINCT FROM OLD.balance_btc
     OR NEW.balance_usdt IS DISTINCT FROM OLD.balance_usdt THEN

    UPDATE public.user_balances
       SET balance_btc = NEW.balance_btc,
           updated_at  = now()
     WHERE user_id = NEW.user_id
       AND balance_btc IS DISTINCT FROM NEW.balance_btc;

    UPDATE public.user_wallets
       SET balance_btc = NEW.balance_btc,
           updated_at  = now()
     WHERE user_id = NEW.user_id
       AND balance_btc IS DISTINCT FROM NEW.balance_btc;
  END IF;

  RETURN NULL; -- AFTER trigger; return value ignored
END;
$$;

DROP TRIGGER IF EXISTS trg_wallets_mirror_sync ON public.wallets;
CREATE TRIGGER trg_wallets_mirror_sync
  AFTER UPDATE OF balance_btc, balance_usdt ON public.wallets
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_wallets_mirror_sync();
