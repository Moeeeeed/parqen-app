-- PRAQEN — seller_deposits table
-- One-time $200 USDT security deposit a user must lock before creating
-- SELL_GIFT_CARD listings. Covers unlimited listings/trades while LOCKED.
-- Run this once in the Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS seller_deposits (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount_usdt      DECIMAL(18,6) NOT NULL DEFAULT 200,
  remaining_amount DECIMAL(18,6) NOT NULL DEFAULT 200,
  status           VARCHAR(20) NOT NULL DEFAULT 'LOCKED',
    -- LOCKED | PENDING_WITHDRAWAL | WITHDRAWN | SEIZED
  locked_at            TIMESTAMP NOT NULL DEFAULT now(),
  eligible_at          TIMESTAMP NOT NULL,   -- locked_at + 7 days, set at insert time
  withdrawal_requested_at TIMESTAMP,
  withdrawn_at         TIMESTAMP,
  seized_amount        DECIMAL(18,6) NOT NULL DEFAULT 0,
  seized_at            TIMESTAMP,
  admin_notes          TEXT,
  created_at           TIMESTAMP NOT NULL DEFAULT now(),
  updated_at           TIMESTAMP NOT NULL DEFAULT now()
);

-- Only one active (LOCKED or awaiting withdrawal) deposit per user at a time.
-- History (WITHDRAWN / SEIZED rows) is preserved for audit purposes.
CREATE UNIQUE INDEX IF NOT EXISTS uq_seller_deposits_one_active_per_user
  ON seller_deposits(user_id) WHERE status IN ('LOCKED', 'PENDING_WITHDRAWAL');

CREATE INDEX IF NOT EXISTS idx_seller_deposits_user_id ON seller_deposits(user_id);
CREATE INDEX IF NOT EXISTS idx_seller_deposits_status  ON seller_deposits(status);

ALTER TABLE seller_deposits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own deposit" ON seller_deposits
  FOR SELECT USING (auth.uid() = user_id);

-- Service role bypasses RLS automatically, so no INSERT/UPDATE policy needed for the backend.
