-- ─────────────────────────────────────────────────────────────────────────────
-- Affiliate Program: Builder level requires a manual interview/approval, unlike
-- Explorer/Titan/Legendary which unlock automatically from the numbers alone.
--
-- Flow: user hits Builder's numbers (15 active users, $5,000 volume) -> the
-- Partner Program page shows an "Apply" button instead of auto-granting the
-- level -> POST /api/affiliate/builder/apply inserts a 'pending' row here and
-- notifies admins -> Ken interviews them and flips status to 'approved' or
-- 'rejected' (via the admin endpoints, or directly in this table) -> approved
-- users' effective level becomes Builder (they were capped at Explorer's rate
-- until then); rejected users can apply again later if invited to.
--
-- Run once in Supabase (SQL Editor).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS affiliate_builder_applications (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                    UUID NOT NULL REFERENCES users(id),
  status                     VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending | approved | rejected
  active_users_at_apply      INT NOT NULL DEFAULT 0,
  qualified_volume_at_apply  NUMERIC NOT NULL DEFAULT 0,
  applied_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at                TIMESTAMPTZ,
  reviewed_by                UUID REFERENCES users(id),
  rejection_reason           TEXT,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_affiliate_builder_apps_user ON affiliate_builder_applications(user_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_builder_apps_status ON affiliate_builder_applications(status);

-- At most one active (pending or approved) application per user at a time —
-- a rejected application doesn't block re-applying, but a pending/approved one does.
CREATE UNIQUE INDEX IF NOT EXISTS idx_affiliate_builder_apps_one_active
  ON affiliate_builder_applications(user_id) WHERE status IN ('pending', 'approved');
