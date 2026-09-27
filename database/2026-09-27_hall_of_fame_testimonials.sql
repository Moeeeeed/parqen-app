-- ─────────────────────────────────────────────────────────────────────────────
-- Partner Program "Hall of Fame": real testimonial quotes + X (Twitter) handle
-- per featured affiliate. Nothing auto-generates a quote — these are curated,
-- filled in directly in this table (or a future admin form) per user, once you
-- have their story. Who actually appears on the board is still ranked by real
-- stats (active users, then volume) exactly as before; the quote/handle are
-- shown ON TOP of that real ranking when present, and the card falls back to
-- the plain stats-only style when they're empty.
--
-- Run once in Supabase (SQL Editor).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE users ADD COLUMN IF NOT EXISTS hall_of_fame_quote TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS x_handle VARCHAR(50);
