-- Fix trades_status_check to allow the CANCELLING intermediate state.
--
-- tradeEscrowService.cancelTrade() atomically claims a trade for cancellation by
-- flipping its status to CANCELLING before doing the refund (this closes a real
-- double-refund race between e.g. a user's manual cancel and the 60s auto-expiry
-- cron firing on the same trade at once — see tradeEscrowService.js ~line 782).
-- The trades table's CHECK constraint was never updated to allow that value, so
-- every cancellation attempt fails at that very first step with:
--   "new row for relation "trades" violates check constraint "trades_status_check""
-- This blocks manual cancel, auto-expiry, AND dispute-initiated cancellation, since
-- all three call the same cancelTrade() function.
--
-- Same fix, same reasoning as the already-applied
-- database/fix_escrow_lock_status_constraint.sql, just for the trades table.
--
-- Run this once in the Supabase SQL Editor.

ALTER TABLE trades
DROP CONSTRAINT IF EXISTS trades_status_check;

ALTER TABLE trades
ADD CONSTRAINT trades_status_check
CHECK (status IN (
  'CREATED', 'FUNDS_LOCKED', 'PAYMENT_SENT', 'DISPUTED',
  'CANCELLING', 'CANCELLED', 'COMPLETED'
));

-- If this ALTER fails with something like "check constraint is violated by some row",
-- Postgres will tell you the offending status value — that means some existing trade
-- has a status this list doesn't cover yet (e.g. a legacy value like ESCROW/ACTIVE/
-- OPEN/PAID from an older version of the app). Add that value to the list above and
-- re-run; do not drop or alter any existing trade rows to force it through.
