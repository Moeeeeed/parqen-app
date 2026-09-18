-- ================================================================
-- PRAQEN — Complete Database Extensions & Wallet Schema Setup
-- Run this in your Supabase SQL Editor (Dashboard -> SQL Editor -> New Query)
-- Safe to re-run multiple times (uses CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS)
-- ================================================================

-- ── 1. WALLETS TABLE (Authoritative Single Source of Truth for Balances) ───
CREATE TABLE IF NOT EXISTS wallets (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  address             TEXT,
  private_key         TEXT,
  balance_btc         DECIMAL(18,8) DEFAULT 0,
  locked_balance_btc  DECIMAL(18,8) DEFAULT 0,
  balance_usdt        DECIMAL(18,6) DEFAULT 0,
  locked_balance_usdt DECIMAL(18,6) DEFAULT 0,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

ALTER TABLE wallets ADD COLUMN IF NOT EXISTS address             TEXT;
ALTER TABLE wallets ADD COLUMN IF NOT EXISTS private_key         TEXT;
ALTER TABLE wallets ADD COLUMN IF NOT EXISTS balance_btc         DECIMAL(18,8) DEFAULT 0;
ALTER TABLE wallets ADD COLUMN IF NOT EXISTS locked_balance_btc  DECIMAL(18,8) DEFAULT 0;
ALTER TABLE wallets ADD COLUMN IF NOT EXISTS balance_usdt        DECIMAL(18,6) DEFAULT 0;
ALTER TABLE wallets ADD COLUMN IF NOT EXISTS locked_balance_usdt DECIMAL(18,6) DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_wallets_user_id ON wallets(user_id);
ALTER TABLE wallets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "wallets_select_own" ON wallets;
CREATE POLICY "wallets_select_own" ON wallets FOR SELECT USING (user_id = auth.uid());

-- ── 2. USER_WALLETS TABLE (Deposit Address Tracking & Checkpoint) ────────
CREATE TABLE IF NOT EXISTS user_wallets (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  btc_address      VARCHAR(255),
  tron_address     TEXT,
  network          VARCHAR(20) DEFAULT 'mainnet',
  balance_btc      DECIMAL(18,8) DEFAULT 0,
  last_onchain_btc DECIMAL(18,8) DEFAULT 0,
  last_onchain_usdt DECIMAL(18,6) DEFAULT 0,
  is_active        BOOLEAN     DEFAULT true,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

ALTER TABLE user_wallets ADD COLUMN IF NOT EXISTS btc_address       VARCHAR(255);
ALTER TABLE user_wallets ADD COLUMN IF NOT EXISTS tron_address      TEXT;
ALTER TABLE user_wallets ADD COLUMN IF NOT EXISTS network           VARCHAR(20) DEFAULT 'mainnet';
ALTER TABLE user_wallets ADD COLUMN IF NOT EXISTS balance_btc       DECIMAL(18,8) DEFAULT 0;
ALTER TABLE user_wallets ADD COLUMN IF NOT EXISTS last_onchain_btc  DECIMAL(18,8) DEFAULT 0;
ALTER TABLE user_wallets ADD COLUMN IF NOT EXISTS last_onchain_usdt DECIMAL(18,6) DEFAULT 0;
ALTER TABLE user_wallets ADD COLUMN IF NOT EXISTS is_active         BOOLEAN DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_user_wallets_user_id    ON user_wallets(user_id);
CREATE INDEX IF NOT EXISTS idx_user_wallets_btc_address ON user_wallets(btc_address);
CREATE INDEX IF NOT EXISTS idx_user_wallets_tron_address ON user_wallets(tron_address) WHERE tron_address IS NOT NULL;
ALTER TABLE user_wallets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_wallets_select_own" ON user_wallets;
CREATE POLICY "user_wallets_select_own" ON user_wallets FOR SELECT USING (user_id = auth.uid());

-- ── 3. WALLET_TRANSACTIONS TABLE (Transaction Ledger) ────────────────────
CREATE TABLE IF NOT EXISTS wallet_transactions (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  trade_id            UUID        REFERENCES trades(id) ON DELETE SET NULL,
  type                VARCHAR(50),
  currency            VARCHAR(20) DEFAULT 'BTC',
  amount_btc          DECIMAL(18,8),
  amount_usdt         DECIMAL(18,6),
  amount_usd          DECIMAL,
  tx_hash             VARCHAR(255),
  coinbase_tx_id      VARCHAR(255),
  destination_address VARCHAR(255),
  status              VARCHAR(50) DEFAULT 'PENDING',
  notes               TEXT,
  idempotency_key     TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS currency            VARCHAR(20) DEFAULT 'BTC';
ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS amount_btc          DECIMAL(18,8);
ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS amount_usdt         DECIMAL(18,6);
ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS amount_usd          DECIMAL;
ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS tx_hash             VARCHAR(255);
ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS coinbase_tx_id      VARCHAR(255);
ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS destination_address VARCHAR(255);
ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS status              VARCHAR(50) DEFAULT 'PENDING';
ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS notes               TEXT;
ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS idempotency_key     TEXT;

CREATE INDEX IF NOT EXISTS idx_wallet_transactions_user_id  ON wallet_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_trade_id ON wallet_transactions(trade_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_transactions_idempotency_key ON wallet_transactions(idempotency_key) WHERE idempotency_key IS NOT NULL;
ALTER TABLE wallet_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "wallet_transactions_select_own" ON wallet_transactions;
CREATE POLICY "wallet_transactions_select_own" ON wallet_transactions FOR SELECT USING (user_id = auth.uid());

-- ── 4. DEPOSIT_TRACKING_V2 TABLE (Transaction Hash Idempotency Lock) ──────
CREATE TABLE IF NOT EXISTS public.deposit_tracking_v2 (
  id            UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  tx_hash       TEXT          NOT NULL,
  address       TEXT          NOT NULL,
  user_id       UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  currency      TEXT          NOT NULL CHECK (currency IN ('BTC', 'USDT')),
  amount        NUMERIC(24,8) NOT NULL CHECK (amount > 0),
  credited      BOOLEAN       NOT NULL DEFAULT false,
  credit_error  TEXT,
  detected_by   TEXT          NOT NULL DEFAULT 'realtime_monitor' CHECK (detected_by IN ('realtime_monitor', 'reconciliation_job', 'manual')),
  detected_at   TIMESTAMPTZ   NOT NULL DEFAULT now(),
  credited_at   TIMESTAMPTZ,
  UNIQUE (tx_hash, address)
);

CREATE INDEX IF NOT EXISTS idx_deposit_tracking_v2_user      ON public.deposit_tracking_v2(user_id);
CREATE INDEX IF NOT EXISTS idx_deposit_tracking_v2_uncredited ON public.deposit_tracking_v2(credited) WHERE credited = false;
ALTER TABLE public.deposit_tracking_v2 DISABLE ROW LEVEL SECURITY;
GRANT ALL ON public.deposit_tracking_v2 TO service_role;

-- ── 5. NOTIFICATIONS TABLE ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       VARCHAR(50) DEFAULT 'system',
  title      VARCHAR(255) NOT NULL,
  message    TEXT        NOT NULL,
  link       VARCHAR(255),
  action     VARCHAR(255),
  is_read    BOOLEAN     DEFAULT false,
  read_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS type    VARCHAR(50) DEFAULT 'system';
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS link    VARCHAR(255);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS action  VARCHAR(255);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS is_read BOOLEAN DEFAULT false;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread  ON notifications(user_id, is_read) WHERE is_read = false;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "notifications_select_own" ON notifications;
CREATE POLICY "notifications_select_own" ON notifications FOR SELECT USING (user_id = auth.uid());
DROP POLICY IF EXISTS "notifications_update_own" ON notifications;
CREATE POLICY "notifications_update_own" ON notifications FOR UPDATE USING (user_id = auth.uid());

-- ── 6. OTP_CODES TABLE ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS otp_codes (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        REFERENCES users(id) ON DELETE CASCADE,
  email      VARCHAR(255),
  phone      VARCHAR(50),
  code       VARCHAR(20) NOT NULL,
  purpose    VARCHAR(50) DEFAULT 'email_verification',
  expires_at TIMESTAMPTZ NOT NULL,
  used       BOOLEAN     DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_otp_codes_lookup ON otp_codes(email, code, used);
ALTER TABLE otp_codes ENABLE ROW LEVEL SECURITY;

-- ── 7. TRADE_IMAGES TABLE ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trade_images (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id   UUID        NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  image_url  TEXT        NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trade_images_trade_id ON trade_images(trade_id);
ALTER TABLE trade_images ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "trade_images_select_participants" ON trade_images;
CREATE POLICY "trade_images_select_participants" ON trade_images FOR SELECT USING (
  EXISTS (SELECT 1 FROM trades t WHERE t.id = trade_id AND (t.buyer_id = auth.uid() OR t.seller_id = auth.uid()))
);

-- ── 8. SELLER_DEPOSITS TABLE ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS seller_deposits (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id   UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  trade_id    UUID        REFERENCES trades(id) ON DELETE SET NULL,
  amount_usd  DECIMAL     NOT NULL,
  currency    VARCHAR(10) DEFAULT 'USD',
  status      VARCHAR(50) DEFAULT 'PENDING',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── 9. SECURITY_EVENTS & SECURITY_ACTION_CODES ───────────────────────────
CREATE TABLE IF NOT EXISTS security_events (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        REFERENCES users(id) ON DELETE CASCADE,
  event_type VARCHAR(100) NOT NULL,
  ip_address VARCHAR(100),
  details    JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS security_action_codes (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action     VARCHAR(100) NOT NULL,
  code       VARCHAR(255) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used       BOOLEAN     DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── 10. USER_TRUST & USER_BADGES ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_trust (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_id  UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       VARCHAR(10) NOT NULL CHECK (type IN ('trust', 'block')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, target_id, type)
);

CREATE TABLE IF NOT EXISTS user_badges (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  badge_name  VARCHAR(100) NOT NULL,
  is_unlocked BOOLEAN      DEFAULT false,
  unlocked_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ  DEFAULT NOW(),
  UNIQUE(user_id, badge_name)
);

CREATE INDEX IF NOT EXISTS idx_user_badges_user_id ON user_badges(user_id);
ALTER TABLE user_badges ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can view badges" ON user_badges;
CREATE POLICY "Anyone can view badges" ON user_badges FOR SELECT USING (true);

-- ── 11. AFFILIATE_EARNINGS TABLE (Referral System Commission Ledger) ───────
CREATE TABLE IF NOT EXISTS affiliate_earnings (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id      UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  referred_user_id UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  trade_id         UUID         REFERENCES trades(id) ON DELETE SET NULL,
  trade_amount_btc DECIMAL(18,8),
  trade_amount_usd DECIMAL,
  commission_btc   DECIMAL(18,8) NOT NULL,
  commission_usd   DECIMAL,
  commission_rate  DECIMAL,
  status           VARCHAR(50)  DEFAULT 'CREDITED',
  created_at       TIMESTAMPTZ  DEFAULT NOW()
);

ALTER TABLE affiliate_earnings ADD COLUMN IF NOT EXISTS trade_amount_btc DECIMAL(18,8);
ALTER TABLE affiliate_earnings ADD COLUMN IF NOT EXISTS trade_amount_usd DECIMAL;
ALTER TABLE affiliate_earnings ADD COLUMN IF NOT EXISTS commission_btc   DECIMAL(18,8);
ALTER TABLE affiliate_earnings ADD COLUMN IF NOT EXISTS commission_usd   DECIMAL;
ALTER TABLE affiliate_earnings ADD COLUMN IF NOT EXISTS commission_rate  DECIMAL;
ALTER TABLE affiliate_earnings ADD COLUMN IF NOT EXISTS status           VARCHAR(50) DEFAULT 'CREDITED';

CREATE INDEX IF NOT EXISTS idx_affiliate_earnings_referrer_id     ON affiliate_earnings(referrer_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_earnings_referred_user_id ON affiliate_earnings(referred_user_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_earnings_trade_id         ON affiliate_earnings(trade_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_earnings_status           ON affiliate_earnings(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_affiliate_earnings_trade_referrer ON affiliate_earnings(trade_id, referrer_id) WHERE trade_id IS NOT NULL;

ALTER TABLE affiliate_earnings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "affiliate_earnings_select_own" ON affiliate_earnings;
CREATE POLICY "affiliate_earnings_select_own" ON affiliate_earnings FOR SELECT USING (referrer_id = auth.uid() OR referred_user_id = auth.uid());

-- ── 12. USER & LISTING COLUMNS BACKFILL ───────────────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS badge VARCHAR(50) DEFAULT 'BEGINNER';
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_agent BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_moderator BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_ceo BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_verified BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS trusted_by_count INT DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS blocked_by_count INT DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS blocked_count INT DEFAULT 0;

-- Referral & Welcome Bonus Columns
ALTER TABLE users ADD COLUMN IF NOT EXISTS bonus_step INT DEFAULT 1;
ALTER TABLE users ADD COLUMN IF NOT EXISTS bonus_expires_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS bonus_unlocked_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS total_referrals INT DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_earnings_btc DECIMAL(18,8) DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_method VARCHAR(50) DEFAULT 'email';

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_referral_code ON users(referral_code) WHERE referral_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_referred_by ON users(referred_by) WHERE referred_by IS NOT NULL;

-- Listings Columns
ALTER TABLE listings ADD COLUMN IF NOT EXISTS asset VARCHAR(20) DEFAULT 'BTC';
ALTER TABLE listings ADD COLUMN IF NOT EXISTS crypto_currency VARCHAR(20) DEFAULT 'BTC';

-- ── 13. ATOMIC RPC FUNCTION: praqen_credit_deposit ───────────────────────
CREATE OR REPLACE FUNCTION public.praqen_credit_deposit(
  p_user_id uuid,
  p_currency text,
  p_amount numeric,
  p_onchain_balance numeric,
  p_idempotency_key text,
  p_note text DEFAULT NULL::text
)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_new_balance NUMERIC;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT: amount must be positive';
  END IF;

  IF p_currency NOT IN ('BTC', 'USDT') THEN
    RAISE EXCEPTION 'INVALID_CURRENCY: must be BTC or USDT';
  END IF;

  IF p_idempotency_key IS NULL OR length(p_idempotency_key) = 0 THEN
    RAISE EXCEPTION 'INVALID_IDEMPOTENCY_KEY';
  END IF;

  IF p_idempotency_key ~ '^(BTC|USDT):[0-9a-fA-F-]{36}:'
     AND p_idempotency_key NOT LIKE (p_currency || ':' || p_user_id::text || ':%') THEN
    RAISE EXCEPTION 'IDEMPOTENCY_KEY_MISMATCH: automatic-format key % is not for %/%',
      p_idempotency_key, p_currency, p_user_id;
  END IF;

  -- Ensure wallets row exists
  INSERT INTO wallets (user_id, balance_btc, locked_balance_btc, balance_usdt, locked_balance_usdt, updated_at)
  VALUES (p_user_id, 0, 0, 0, 0, now())
  ON CONFLICT (user_id) DO NOTHING;

  -- Ensure user_wallets row exists
  INSERT INTO user_wallets (user_id, network, balance_btc, last_onchain_btc, last_onchain_usdt, updated_at)
  VALUES (p_user_id, 'mainnet', 0, 0, 0, now())
  ON CONFLICT (user_id) DO NOTHING;

  -- Record transaction ledger row (idempotency key unique constraint prevents duplicates)
  INSERT INTO wallet_transactions (
    user_id,
    type,
    currency,
    amount_btc,
    amount_usdt,
    status,
    notes,
    idempotency_key,
    created_at
  )
  VALUES (
    p_user_id,
    'DEPOSIT',
    p_currency,
    CASE WHEN p_currency = 'BTC' THEN p_amount ELSE 0 END,
    CASE WHEN p_currency = 'USDT' THEN p_amount ELSE 0 END,
    'CONFIRMED',
    p_note,
    p_idempotency_key,
    now()
  );

  IF p_currency = 'BTC' THEN
    UPDATE wallets
    SET balance_btc = balance_btc + p_amount,
        updated_at = now()
    WHERE user_id = p_user_id
    RETURNING balance_btc INTO v_new_balance;

    -- Sync user_balances & user_wallets BTC mirrors
    UPDATE user_balances
    SET balance_btc = v_new_balance,
        updated_at = now()
    WHERE user_id = p_user_id;

    UPDATE user_wallets
    SET balance_btc = v_new_balance,
        last_onchain_btc = p_onchain_balance,
        updated_at = now()
    WHERE user_id = p_user_id;
  ELSE
    UPDATE wallets
    SET balance_usdt = balance_usdt + p_amount,
        updated_at = now()
    WHERE user_id = p_user_id
    RETURNING balance_usdt INTO v_new_balance;

    UPDATE user_wallets
    SET last_onchain_usdt = p_onchain_balance,
        updated_at = now()
    WHERE user_id = p_user_id;
  END IF;

  RETURN v_new_balance;
END;
$function$;

-- ── 14. ATOMIC RPC FUNCTION: praqen_release_escrow ───────────────────────
CREATE OR REPLACE FUNCTION public.praqen_release_escrow(
  p_trade_id    UUID,
  p_receiver_id UUID,
  p_company_id  UUID,
  p_amount_btc  NUMERIC,
  p_fee_btc     NUMERIC,
  p_amount_usd  NUMERIC,
  p_tx_hash     TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_lock_status  TEXT;
  v_trade_status TEXT;
  v_seller_id    UUID;
BEGIN
  SELECT status, seller_id INTO v_lock_status, v_seller_id
  FROM escrow_locks
  WHERE trade_id = p_trade_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ESCROW_NOT_FOUND: no escrow lock for trade %', p_trade_id;
  END IF;

  IF v_lock_status != 'LOCKED' THEN
    RAISE EXCEPTION 'ESCROW_NOT_LOCKED: escrow status is %', v_lock_status;
  END IF;

  SELECT status INTO v_trade_status
  FROM trades
  WHERE id = p_trade_id
  FOR UPDATE;

  IF v_trade_status = 'COMPLETED' THEN
    RAISE EXCEPTION 'TRADE_ALREADY_COMPLETED: trade % is already completed', p_trade_id;
  END IF;

  UPDATE escrow_locks
  SET status = 'RELEASED', released_at = now()
  WHERE trade_id = p_trade_id;

  UPDATE wallets
  SET balance_btc = balance_btc + p_amount_btc, updated_at = now()
  WHERE user_id = p_receiver_id;

  UPDATE wallets
  SET balance_btc = balance_btc + p_fee_btc, updated_at = now()
  WHERE user_id = p_company_id;

  UPDATE wallets
  SET locked_balance_btc = GREATEST(0, locked_balance_btc - (p_amount_btc + p_fee_btc)), updated_at = now()
  WHERE user_id = v_seller_id;

  UPDATE trades
  SET status = 'COMPLETED', updated_at = now()
  WHERE id = p_trade_id;
END;
$$;

-- ── 15. ATOMIC RPC FUNCTION: praqen_refund_escrow ────────────────────────
CREATE OR REPLACE FUNCTION public.praqen_refund_escrow(
  p_trade_id    UUID,
  p_provider_id UUID,
  p_amount_btc  NUMERIC,
  p_reason      TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE escrow_locks
  SET status = 'REFUNDED', released_at = now()
  WHERE trade_id = p_trade_id;

  UPDATE wallets
  SET balance_btc = balance_btc + p_amount_btc,
      locked_balance_btc = GREATEST(0, locked_balance_btc - p_amount_btc),
      updated_at = now()
  WHERE user_id = p_provider_id;

  UPDATE user_balances
  SET balance_btc = balance_btc + p_amount_btc, updated_at = now()
  WHERE user_id = p_provider_id;

  INSERT INTO wallet_transactions (
    user_id,
    type,
    currency,
    amount_btc,
    status,
    notes,
    created_at
  )
  VALUES (
    p_provider_id,
    'ESCROW_REFUND',
    'BTC',
    p_amount_btc,
    'CONFIRMED',
    p_reason,
    now()
  );
END;
$$;

-- ── 16. INITIALIZE WALLETS FOR ALL USERS ─────────────────────────────────
INSERT INTO wallets (user_id, balance_btc, locked_balance_btc, balance_usdt, locked_balance_usdt, created_at, updated_at)
SELECT u.id, 0, 0, 0, 0, NOW(), NOW()
FROM users u
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO user_wallets (user_id, network, balance_btc, last_onchain_btc, last_onchain_usdt, created_at, updated_at)
SELECT u.id, 'mainnet', 0, 0, 0, NOW(), NOW()
FROM users u
ON CONFLICT (user_id) DO NOTHING;
