// services/affiliateLevelAwardService.js — automatic Affiliate Program level badges
// (Explorer / Builder / Titan / Legendary).
//
// The LEVEL itself is always computed live and read-only by affiliateSummaryService
// (straight from users.referred_by + trades — never stale). This service's only job is
// to notice when someone crosses a level for the FIRST time, save that as a permanent
// badge (same user_badges table the medals system already uses, different badge names —
// 'affiliate-explorer' etc.), and tell them about it once. Once saved, a level is never
// taken away here (the LEVELS table's keepUsers/keepVolume numbers are for a future
// "can you lose a level" feature — not built, not this service's concern).
//
// Everything that writes or notifies is switched by AFFILIATE_LEVELS_AUTO_ENABLED (must
// be exactly "true"). While it is off, evaluateUser() still returns the right answer
// (so a live "your current level" screen keeps working) — it just never saves or notifies.
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const affiliateSummaryService = require('./affiliateSummaryService');

const defaultSupabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

// Index-aligned with affiliateSummaryService.LEVELS (Explorer, Builder, Titan, Legendary).
const LEVEL_BADGE_IDS = ['affiliate-explorer', 'affiliate-builder', 'affiliate-titan', 'affiliate-legendary'];

const LEVEL_MESSAGE = [
  { emoji: '🧭', line: 'Your link is bringing in real traders — you\'re officially an Explorer.' },
  { emoji: '🚀', line: 'You leveled up to Builder — your network is growing fast.' },
  { emoji: '🏆', line: 'Titan status. Your network is one of the biggest on PRAQEN.' },
  { emoji: '👑', line: 'Legendary. The very top of the Affiliate Program — very few traders ever reach this.' },
];

function autoEnabled() {
  return process.env.AFFILIATE_LEVELS_AUTO_ENABLED === 'true';
}

// One evaluation per user at a time (a trade completing and the user opening a screen
// can overlap) — same lock pattern medalAwardService uses.
const _locks = new Map();
async function withUserLock(userId, fn) {
  const prev = _locks.get(userId) || Promise.resolve();
  let release;
  const gate = new Promise((r) => { release = r; });
  const chain = prev.then(() => gate);
  _locks.set(userId, chain);
  await prev;
  try { return await fn(); } finally { release(); if (_locks.get(userId) === chain) _locks.delete(userId); }
}

// Saves one level badge (once) — mirrors medalAwardService's saveMedal exactly: an
// update-where-not-yet-unlocked (or insert if the row doesn't exist yet) so two
// overlapping checks for the same user can never announce the same level twice.
async function saveLevelBadge(supabase, userId, badgeId, existingRow) {
  if (existingRow) {
    const { data, error } = await supabase.from('user_badges')
      .update({ is_unlocked: true, unlocked_at: new Date().toISOString() })
      .eq('user_id', userId).eq('badge_name', badgeId).eq('is_unlocked', false).select('id');
    if (error) throw new Error(error.message);
    return !!(data && data.length);
  }
  const { error } = await supabase.from('user_badges')
    .insert({ user_id: userId, badge_name: badgeId, is_unlocked: true, unlocked_at: new Date().toISOString() });
  if (error) {
    if (error.code === '23505') return false; // someone else wrote it first
    throw new Error(error.message);
  }
  return true;
}

async function notifyLevel(supabase, userId, levelIndex, { pushFn } = {}) {
  const name = affiliateSummaryService.LEVELS[levelIndex].name;
  const m = LEVEL_MESSAGE[levelIndex];
  const cash = affiliateSummaryService.cashEnabled();
  const rate = affiliateSummaryService.LEVELS[levelIndex].rate;
  const title = `${m.emoji} You're now a PRAQEN ${name}!`;
  const message = cash
    ? `${m.line} You now earn ${rate.toFixed(2)}% on every trade the people you brought make. It now shows on your profile.`
    : `${m.line} Your ${name} badge now shows on your profile and next to your name on the market.`;
  try {
    await supabase.from('notifications').insert({
      user_id: userId, type: 'affiliate_level', title, message,
      action: '/partner-program', is_read: false, created_at: new Date().toISOString(),
    });
  } catch (e) { console.error('[affiliateLevel] notification insert failed:', e.message); }
  try {
    const send = pushFn || require('./pushNotificationService').sendSystemAlert;
    await send(userId, title, message, 'https://praqen.com/partner-program');
  } catch (e) { console.error('[affiliateLevel] push failed:', e.message); }
}

// Works out (and, if persist=true, saves) one user's affiliate level badges.
// Returns { userId, level: {index,name,rate} | null, earnedLevelIds: [...], newlyAwarded: [...] }.
// `level` is always the live, accurate answer — even when persist/notify are both false,
// so a "your current level" screen can call this with no side effects.
async function evaluateUser(userId, opts = {}) {
  const { persist = false, notify = false, supabase = defaultSupabase, pushFn } = opts;
  return withUserLock(userId, async () => {
    let summary;
    try {
      summary = await affiliateSummaryService.getAffiliateSummary(supabase, userId, {});
    } catch (e) {
      console.error('[affiliateLevel] getAffiliateSummary failed for', String(userId).slice(0, 8), ':', e.message);
      return null;
    }
    const levelIdx = summary.level ? summary.level.index : -1;

    const { data: rows } = await supabase.from('user_badges')
      .select('badge_name, is_unlocked').eq('user_id', userId).in('badge_name', LEVEL_BADGE_IDS);
    const already = new Set((rows || []).filter((r) => r.is_unlocked).map((r) => r.badge_name));

    const earnedLevelIds = [];
    const newlyAwarded = [];
    // Cumulative, like medals: everything from Explorer up to (and including) the
    // current level gets a badge, not just the current one — so jumping straight to
    // Titan in one trade still leaves Explorer and Builder earned along the way.
    for (let i = 0; i <= levelIdx; i++) {
      const badgeId = LEVEL_BADGE_IDS[i];
      if (already.has(badgeId)) { earnedLevelIds.push(badgeId); continue; }
      if (persist) {
        const existingRow = (rows || []).find((r) => r.badge_name === badgeId);
        const won = await saveLevelBadge(supabase, userId, badgeId, existingRow);
        if (won) {
          newlyAwarded.push(badgeId);
          console.log(`🏅 Affiliate level EARNED: "${badgeId}" for ${String(userId).slice(0, 8)}`);
          if (notify) await notifyLevel(supabase, userId, i, { pushFn });
        }
      }
      earnedLevelIds.push(badgeId);
    }
    return { userId, level: summary.level, earnedLevelIds, newlyAwarded };
  });
}

// After a trade completes: if the buyer and/or seller was brought in by someone
// (users.referred_by), re-check THAT referrer's level — a trade by a referred user is
// the only thing that can move a referrer's numbers. Never blocks the trade.
function evaluateAfterTrade(participantUserIds) {
  if (!autoEnabled()) return;
  const ids = [...new Set((participantUserIds || []).filter(Boolean))];
  if (!ids.length) return;
  (async () => {
    try {
      const { data: rows } = await defaultSupabase.from('users').select('id, referred_by').in('id', ids);
      const referrerIds = [...new Set((rows || []).map((r) => r.referred_by).filter(Boolean))];
      referrerIds.forEach((rid) => {
        evaluateUser(rid, { persist: true, notify: true }).catch((e) => console.error('[affiliateLevel] after-trade check failed:', e.message));
      });
    } catch (e) { console.error('[affiliateLevel] evaluateAfterTrade failed:', e.message); }
  })();
}

// ── Market / profile display ────────────────────────────────────────────
// Highest earned level badge id for each user (or none) — for market cards and profiles.
async function getLevelsForUsers(userIds, { supabase = defaultSupabase } = {}) {
  const ids = [...new Set((userIds || []).filter(Boolean))];
  const out = {};
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const { data, error } = await supabase.from('user_badges')
      .select('user_id, badge_name').in('user_id', chunk).in('badge_name', LEVEL_BADGE_IDS).eq('is_unlocked', true);
    if (error) { console.error('[affiliateLevel] could not attach levels:', error.message); continue; }
    (data || []).forEach((r) => {
      const idx = LEVEL_BADGE_IDS.indexOf(r.badge_name);
      if (idx < 0) return;
      if (out[r.user_id] === undefined || idx > out[r.user_id]) out[r.user_id] = idx;
    });
  }
  const named = {};
  ids.forEach((id) => {
    if (out[id] === undefined) return;
    named[id] = { index: out[id], id: LEVEL_BADGE_IDS[out[id]], name: affiliateSummaryService.LEVELS[out[id]].name };
  });
  return named;
}

// Attaches `.affiliateLevel` ({index,id,name}) to each user object with an `id`. Never
// throws — a lookup failure just leaves users without a level shown, exactly like
// attachMedals in medalAwardService.js.
async function attachAffiliateLevels(users, opts = {}) {
  try {
    const list = (users || []).filter((u) => u && u.id);
    if (!list.length) return users;
    const levels = await getLevelsForUsers(list.map((u) => u.id), opts);
    list.forEach((u) => { if (levels[u.id]) u.affiliateLevel = levels[u.id]; });
  } catch (e) { console.error('[affiliateLevel] attachAffiliateLevels failed:', e.message); }
  return users;
}

module.exports = {
  autoEnabled,
  LEVEL_BADGE_IDS,
  evaluateUser,
  evaluateAfterTrade,
  getLevelsForUsers,
  attachAffiliateLevels,
};
