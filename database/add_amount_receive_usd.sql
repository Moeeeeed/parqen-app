-- Add amount_receive_usd column to trades table.
-- This stores the fiat-equivalent value of the BTC at the MARKET rate at trade
-- creation time, which differs from amount_usd (the payment amount) whenever
-- the seller has a margin.
--
-- Example: buyer pays $25, seller has +5% margin.
--   amount_usd        = $25.00  (what the buyer pays)
--   amount_btc        = 0.00039683 BTC (at $63k seller rate)
--   amount_receive_usd = $23.81  (0.00039683 × $60k market rate — the true receive value)

ALTER TABLE trades ADD COLUMN IF NOT EXISTS amount_receive_usd DECIMAL DEFAULT NULL;
