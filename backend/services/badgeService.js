// services/badgeService.js
// Checks badge conditions and awards them automatically in the database.
// Called after trade completion, feedback submission, KYC updates, etc.

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

// Achievement badge definitions — mirrors frontend BADGE_DEFS
const ACHIEVEMENT_BADGES = [
  {
    name: 'Verified Identity',
    check: (u) => !!(u.kyc_verified || u.is_id_verified),
  },
  {
    name: 'Top Trader',
    check: (u) => parseInt(u.total_trades || 0) >= 100,
  },
  {
    name: 'High Volume',
    check: (u) => parseInt(u.total_trades || 0) * 100 >= 10000,
  },
  {
    name: 'Fast Responder',
    check: (u) => parseFloat(u.avg_reply_minutes || 99) < 5,
  },
  {
    name: 'Trusted Seller',
    check: (u) => parseInt(u.total_trades || 0) >= 20 && parseFloat(u.completion_rate || 0) >= 98,
  },
  {
    name: 'Veteran Trader',
    check: (u) => {
      if (!u.created_at) return false;
      const daysOld = (Date.now() - new Date(u.created_at).getTime()) / (1000 * 60 * 60 * 24);
      return daysOld >= 365;
    },
  },
];

// Trust badge tier thresholds (auto-upgrade only, never downgrade). Keyed off
// total_feedback_count — reviews actually received from completed trades — not
// total_trades, since that's what signals real buyer/seller trust. Mirrors
// BADGE_ORDER/BADGE_THRESHOLDS in frontend/src/lib/badge.js — keep both in sync.
const TRUST_TIERS = ['BEGINNER', 'STAR', 'TRADER', 'PRO', 'EXPERT'];

function computeTrustTier(feedbackCount) {
  const n = parseInt(feedbackCount || 0);
  if (n >= 10000) return 'EXPERT';
  if (n >= 3000)  return 'PRO';
  if (n >= 100)   return 'TRADER';
  if (n >= 1)     return 'STAR';
  return 'BEGINNER';
}

async function checkAndAwardBadges(userId) {
  if (!userId) return;
  try {
    const { data: user, error } = await supabaseAdmin
      .from('users')
      .select('id, total_trades, total_feedback_count, completion_rate, average_rating, kyc_verified, is_id_verified, is_email_verified, is_phone_verified, created_at, avg_reply_minutes, badge')
      .eq('id', userId)
      .single();

    if (error || !user) return;

    // ── Achievement badges ──────────────────────────────────────────────────
    for (const badgeDef of ACHIEVEMENT_BADGES) {
      const qualifies = badgeDef.check(user);
      try {
        const { data: existing } = await supabaseAdmin
          .from('user_badges')
          .select('is_unlocked')
          .eq('user_id', userId)
          .eq('badge_name', badgeDef.name)
          .maybeSingle();

        if (!existing) {
          // First time — insert record
          await supabaseAdmin.from('user_badges').insert({
            user_id:    userId,
            badge_name: badgeDef.name,
            is_unlocked: qualifies,
            unlocked_at: qualifies ? new Date().toISOString() : null,
          });
          if (qualifies) console.log(`🏅 Badge EARNED: "${badgeDef.name}" for ${userId.slice(0,8)}`);
        } else if (!existing.is_unlocked && qualifies) {
          // Newly qualifies — unlock it
          await supabaseAdmin
            .from('user_badges')
            .update({ is_unlocked: true, unlocked_at: new Date().toISOString() })
            .eq('user_id', userId)
            .eq('badge_name', badgeDef.name);
          console.log(`🏅 Badge EARNED: "${badgeDef.name}" for ${userId.slice(0,8)}`);
        }
        // Already unlocked or still locked with no change → skip
      } catch (badgeErr) {
        console.error(`Badge error for "${badgeDef.name}":`, badgeErr.message);
      }
    }

    // ── Trust tier — upgrade only, NEVER downgrade ────────────────────────
    // computeTrustTier uses total_feedback_count from DB. If it's lower than
    // expected (sparse feedback), we still must not take the badge away.
    const computedTier  = computeTrustTier(user.total_feedback_count);
    const currentBadge  = (user.badge || 'BEGINNER').toUpperCase();
    const currentIdx    = TRUST_TIERS.indexOf(currentBadge);
    const computedIdx   = TRUST_TIERS.indexOf(computedTier);

    // Only write to DB when upgrading — downgrade is permanently blocked
    if (computedIdx > currentIdx) {
      await supabaseAdmin.from('users').update({ badge: computedTier }).eq('id', userId);
      console.log(`⬆️  Trust badge: ${currentBadge} → ${computedTier} (user ${userId.slice(0,8)})`);
    } else if (computedIdx < currentIdx) {
      console.log(`🛡️  Badge downgrade blocked: ${currentBadge} → ${computedTier} would have been applied (user ${userId.slice(0,8)})`);
    }
  } catch (err) {
    console.error('checkAndAwardBadges error:', err.message);
  }
}

module.exports = { checkAndAwardBadges };
