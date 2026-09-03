-- PRAQEN — 2026-09-04 — Part 2 support tables (steps 2.3a and 2.3c)
--
-- Two small operational tables. Neither holds money or balances. Purely
-- infrastructure for the deposit pipeline:
--
--   deposit_recheck_queue  (2.3a) — an address whose poll failed (explorer 429 /
--     timeout / DNS) is parked here so the NEXT cycle retries it instead of
--     dropping it. Rows are deleted as soon as a check succeeds.
--
--   realtime_tx_dedupe     (2.3c) — the realtime WebSocket's "already handled
--     this txid" set, currently in-memory only and wiped on every restart. Backed
--     by this table so a restart / reconnect can't replay history as new.
--
-- SAFE TO RUN ON PRODUCTION. Additive only — CREATE TABLE IF NOT EXISTS +
-- indexes + grants. Run ONCE in the Supabase SQL Editor.
--
-- ROLLBACK (only if you are removing the feature):
--   DROP TABLE IF EXISTS public.deposit_recheck_queue;
--   DROP TABLE IF EXISTS public.realtime_tx_dedupe;

-- ── 2.3a ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.deposit_recheck_queue (
  address       TEXT        NOT NULL,
  currency      TEXT        NOT NULL CHECK (currency IN ('BTC', 'USDT')),
  user_id       UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason        TEXT,
  attempts      INT         NOT NULL DEFAULT 1,
  first_seen    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_attempt  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (address, currency)
);
CREATE INDEX IF NOT EXISTS idx_deposit_recheck_queue_currency ON public.deposit_recheck_queue (currency);

ALTER TABLE public.deposit_recheck_queue DISABLE ROW LEVEL SECURITY;
GRANT ALL ON public.deposit_recheck_queue TO service_role;

-- ── 2.3c ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.realtime_tx_dedupe (
  dedupe_key  TEXT        PRIMARY KEY,          -- "<txid>:<userId>"
  kind        TEXT        NOT NULL CHECK (kind IN ('confirmed', 'pending')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_realtime_tx_dedupe_created ON public.realtime_tx_dedupe (created_at);

ALTER TABLE public.realtime_tx_dedupe DISABLE ROW LEVEL SECURITY;
GRANT ALL ON public.realtime_tx_dedupe TO service_role;
