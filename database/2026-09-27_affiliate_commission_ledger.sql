-- ─────────────────────────────────────────────────────────────────────────────
-- Affiliate Program: real commission ledger (for the NEW level-based rates —
-- separate from the OLD affiliate_earnings/commission_btc engine, which is
-- untouched and still governs whatever it already governs).
--
-- Only ever written to when REFERRAL_PAYOUTS_ENABLED=true (affiliateCommissionService
-- checks affiliateSummaryService.cashEnabled() before doing anything). Until that
-- switch is on, this table stays empty and every leaderboard/summary total_commission_usd
-- correctly reads as 0 — there is no real money to show yet.
--
-- Written once per (trade, affiliate) pair, right after a trade's platform fee is
-- confirmed COLLECTED (tradeEscrowService.js's release flow, fire-and-forget,
-- never blocks or affects the trade itself). level_index/level_name/rate are
-- snapshotted AT THE TIME of the trade, so a later level change never rewrites
-- historical rows.
--
-- Run once in Supabase (SQL Editor).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS affiliate_commission_ledger (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id      UUID NOT NULL REFERENCES users(id),
  referred_user_id  UUID REFERENCES users(id),
  trade_id          UUID NOT NULL,
  level_index       INT NOT NULL,
  level_name        VARCHAR(20) NOT NULL,
  rate              NUMERIC NOT NULL,
  currency          VARCHAR(10) NOT NULL,
  platform_fee_usd  NUMERIC NOT NULL,
  commission_usd    NUMERIC NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- At most one commission row per trade per affiliate — the write path is
-- fire-and-forget and could in principle fire twice for the same trade
-- (a retry, a double-call); this makes that a safe no-op instead of double pay.
CREATE UNIQUE INDEX IF NOT EXISTS idx_affiliate_commission_ledger_trade_affiliate
  ON affiliate_commission_ledger(trade_id, affiliate_id);

CREATE INDEX IF NOT EXISTS idx_affiliate_commission_ledger_affiliate ON affiliate_commission_ledger(affiliate_id);
