-- Lets an approved P2P migration request (Noones / Binance P2P / other) stamp
-- the trader's old reputation onto their PRAQEN profile, shown on Profile.js.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS p2p_migrated_platform TEXT,
  ADD COLUMN IF NOT EXISTS p2p_migrated_username TEXT,
  ADD COLUMN IF NOT EXISTS p2p_migrated_feedback TEXT,
  ADD COLUMN IF NOT EXISTS p2p_migration_approved_at TIMESTAMPTZ;
