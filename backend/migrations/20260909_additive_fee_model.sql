-- 20260909_additive_fee_model.sql
-- Switches the P2P trade fee from "carved out of the trade amount" to
-- "added on top of it" (seller pays, buyer receives the full amount).
--
-- SAFE TO RUN ON A LIVE DB: one nullable column, no backfill.
--
-- Per-trade behaviour is pinned at escrow-lock time:
--   fee_model = 'additive'  -> BTC provider locks amount + fee; receiver gets the
--                              FULL amount; company gets the fee. Provider pays it.
--   fee_model IS NULL       -> legacy "inclusive": provider locks amount; receiver
--                              gets amount - fee; company gets fee.
--
-- Trades already FUNDS_LOCKED before this deploy have fee_model NULL and are
-- released / refunded under the legacy rules — no migration of in-flight trades
-- is needed. The backend also refuses to write 'additive' until this column
-- exists, so deploying the code before this migration simply keeps the old
-- behaviour until the column is added.

BEGIN;

ALTER TABLE trades ADD COLUMN IF NOT EXISTS fee_model text;

COMMENT ON COLUMN trades.fee_model IS
  'additive = platform fee added on top of the trade amount (seller pays, buyer gets full amount). NULL = legacy inclusive (fee carved out of the amount).';

COMMIT;
