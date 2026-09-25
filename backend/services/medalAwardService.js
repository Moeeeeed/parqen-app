// services/medalAwardService.js — automatic medals.
//
// * evaluateUser()    works out which medals a user has really earned (from their real trades)
//                     and, when asked to, saves them and tells the user.
// * revokeMedalsFor() takes every medal away (banned / frozen accounts).
// * getMedalsForUsers()/attachMedals() give the marketplace each seller's earned medals.
// * runSweep()        daily safety net: fixes restricted accounts and awards time-based medals.
//
// Nothing is ever awarded to a banned or frozen account, and test trades never count.
// The whole thing is switched by MEDALS_AUTO_ENABLED (must be exactly "true"). While it is off,
// nothing is written and nobody is notified; the medals screen still shows live progress.
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const ms = require('./medalService');

const defaultSupabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

const RESTRICTED = ['banned', 'frozen', 'suspended'];
const MEDAL_IDS = ms.MEDAL_ORDER;
const EXPIRY_REASON_RE = /expir|time limit|payment window/i;
const VOLUME_TTL_MS = 10 * 60 * 1000;

function medalsAutoEnabled() {
  return process.env.MEDALS_AUTO_ENABLED === 'true';
}

const isRestricted = (status) => RESTRICTED.includes(String(status || '').trim().toLowerCase());

// PostgREST returns at most 1,000 rows per request, so "all rows" must be paged.
async function fetchAllRows(makeQuery) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await makeQuery().range(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

// One evaluation per user at a time (a trade completing and the user opening the screen can overlap).
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

// ── Everyone's volume (for the Top 1% Club), refreshed at most every 10 minutes ──
let _volCache = null;
async function getVolumeIndex(supabase, { force = false, now = Date.now() } = {}) {
  if (!force && _volCache && now - _volCache.ts < VOLUME_TTL_MS) return _volCache.vol;
  const trades = await fetchAllRows(() => supabase
    .from('trades')
    .select('id, buyer_id, seller_id, amount_usd, is_test')
    .eq('status', 'COMPLETED')
    .order('id', { ascending: true }));
  _volCache = { ts: now, vol: ms.volumesByUser(trades) };
  return _volCache.vol;
}
function _clearVolumeCache() { _volCache = null; }

// ── The stats the medal rules use, from real (non-test) trades only ─────
async function loadUserAndTrades(supabase, userId) {
  const { data: user, error: uErr } = await supabase
    .from('users').select('id, username, created_at, account_status').eq('id', userId).maybeSingle();
  if (uErr) throw new Error(uErr.message);
  if (!user) return { user: null, completed: [] };
  const rows = await fetchAllRows(() => supabase
    .from('trades')
    .select('id, buyer_id, seller_id, amount_usd, payment_method, completed_at, is_test, gift_card_brand, listing:listing_id(listing_type)')
    .eq('status', 'COMPLETED')
    .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`)
    .order('id', { ascending: true }));
  return { user, completed: rows.filter((t) => t.is_test !== true) };
}

async function computeStats(supabase, user, completed, { percentile } = {}) {
  const [{ data: disputeRows }, { data: cancelRows }] = await Promise.all([
    supabase.from('trades').select('id, is_test').not('disputed_at', 'is', null).or(`buyer_id.eq.${user.id},seller_id.eq.${user.id}`),
    supabase.from('trades').select('id, cancel_reason, is_test').eq('status', 'CANCELLED').or(`buyer_id.eq.${user.id},seller_id.eq.${user.id}`),
  ]);
  const disputeCount = (disputeRows || []).filter((t) => t.is_test !== true).length;
  const cancelledCount = (cancelRows || []).filter((t) => t.is_test !== true && !EXPIRY_REASON_RE.test(t.cancel_reason || '')).length;
  let volumePercentile = percentile;
  if (volumePercentile === undefined) {
    try { volumePercentile = ms.percentileFromVolumes(await getVolumeIndex(supabase), user.id); } catch (e) { volumePercentile = 0; }
  }
  return {
    totalTrades: completed.length,
    totalVolumeUsd: completed.reduce((s, t) => s + parseFloat(t.amount_usd || 0), 0),
    momoTrades: completed.filter((t) => ms.isMomoPayment(t.payment_method)).length,
    bankTrades: completed.filter((t) => ms.isBankPayment(t.payment_method)).length,
    giftCardTrades: completed.filter(ms.isGiftCardRow).length,
    disputeCount,
    cancelledCount,
    dailyStreak: ms.longestDailyStreak(completed),
    registeredAt: user.created_at || null,
    volumePercentile,
  };
}

// ── Save a medal (once) and tell the user ───────────────────────────────
async function notifyMedal(supabase, userId, medalId, { pushFn } = {}) {
  const meta = ms.MEDAL_META[medalId];
  if (!meta) return;
  const title = `🥇 New medal: ${meta.name}`;
  const message = `You earned the "${meta.name}" medal (${meta.description}). It now shows next to your name on PRAQEN.`;
  try {
    await supabase.from('notifications').insert({
      user_id: userId, type: 'medal', title, message,
      action: '/trader-settings?section=badges', is_read: false, created_at: new Date().toISOString(),
    });
  } catch (e) { console.error('[medals] notification insert failed:', e.message); }
  try {
    const send = pushFn || require('./pushNotificationService').sendSystemAlert;
    await send(userId, title, `You earned "${meta.name}" — ${meta.description}`, 'https://praqen.com/trader-settings?section=badges');
  } catch (e) { console.error('[medals] push failed:', e.message); }
}

// Returns true only for the caller that actually flipped the medal on (so it is announced once).
async function saveMedal(supabase, userId, medalId, iso, existingRow) {
  if (existingRow) {
    const { data, error } = await supabase.from('user_badges')
      .update({ is_unlocked: true, unlocked_at: iso })
      .eq('user_id', userId).eq('badge_name', medalId).eq('is_unlocked', false).select('id');
    if (error) throw new Error(error.message);
    return !!(data && data.length);
  }
  const { error } = await supabase.from('user_badges')
    .insert({ user_id: userId, badge_name: medalId, is_unlocked: true, unlocked_at: iso });
  if (error) {
    if (error.code === '23505') return false; // someone else wrote it first
    throw new Error(error.message);
  }
  return true;
}

// Take every medal away (used for banned / frozen accounts). Returns how many were taken.
async function revokeMedalsFor(userId, { supabase = defaultSupabase } = {}) {
  const { data, error } = await supabase.from('user_badges')
    .update({ is_unlocked: false, unlocked_at: null })
    .eq('user_id', userId).in('badge_name', MEDAL_IDS).eq('is_unlocked', true).select('id');
  if (error) throw new Error(error.message);
  const n = (data || []).length;
  if (n) console.log(`[medals] revoked ${n} medal(s) from restricted account ${String(userId).slice(0, 8)}`);
  return n;
}

// Work out (and, if persist=true, save) the medals of one user.
// Returns { user, restricted, stats, earned:[{id,earnedAt}], newlyAwarded:[ids], revoked }.
async function evaluateUser(userId, opts = {}) {
  const { persist = false, notify = false, supabase = defaultSupabase, now = new Date(), percentile, pushFn } = opts;
  return withUserLock(userId, async () => {
    const { user, completed } = await loadUserAndTrades(supabase, userId);
    if (!user) return null;

    if (isRestricted(user.account_status)) {
      const revoked = persist ? await revokeMedalsFor(userId, { supabase }) : 0;
      return { user, restricted: true, stats: null, earned: [], newlyAwarded: [], revoked };
    }

    const stats = await computeStats(supabase, user, completed, { percentile });
    const { data: rows } = await supabase.from('user_badges')
      .select('badge_name, is_unlocked, unlocked_at').eq('user_id', userId).in('badge_name', MEDAL_IDS);
    const saved = {};
    (rows || []).forEach((r) => { if (r.is_unlocked && r.unlocked_at) saved[r.badge_name] = r.unlocked_at; });

    const qualifies = ms.newlyEarnedMedalIds(stats, []); // everything the rules give right now
    const earned = [];
    const newlyAwarded = [];
    for (const id of MEDAL_IDS) {
      if (saved[id]) { earned.push({ id, earnedAt: saved[id] }); continue; }
      if (!qualifies.includes(id)) continue;
      const at = ms.earnedAtForMedal(id, completed, user.created_at, now) || now.toISOString();
      if (persist) {
        const won = await saveMedal(supabase, userId, id, at, (rows || []).find((r) => r.badge_name === id));
        if (won) {
          newlyAwarded.push(id);
          console.log(`🥇 Medal EARNED: "${id}" for ${String(userId).slice(0, 8)} (${user.username})`);
          if (notify) await notifyMedal(supabase, userId, id, { pushFn });
        }
      }
      earned.push({ id, earnedAt: at });
    }
    return { user, restricted: false, stats, earned, newlyAwarded, revoked: 0 };
  });
}

// After a trade completes: check both people. Never throws, never blocks the trade.
function evaluateAfterTrade(userIds) {
  if (!medalsAutoEnabled()) return;
  [...new Set((userIds || []).filter(Boolean))].forEach((id) => {
    evaluateUser(id, { persist: true, notify: true }).catch((e) => console.error('[medals] after-trade check failed:', e.message));
  });
}

// ── Market display ──────────────────────────────────────────────────────
async function getMedalsForUsers(userIds, { supabase = defaultSupabase } = {}) {
  const ids = [...new Set((userIds || []).filter(Boolean))];
  const map = {};
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await supabase.from('user_badges')
      .select('user_id, badge_name').eq('is_unlocked', true).in('badge_name', MEDAL_IDS).in('user_id', ids.slice(i, i + 100));
    if (error) throw new Error(error.message);
    (data || []).forEach((r) => { (map[r.user_id] = map[r.user_id] || []).push(r.badge_name); });
  }
  Object.keys(map).forEach((id) => {
    map[id] = ms.MEDAL_PRESTIGE.filter((m) => map[id].includes(m));
  });
  return map;
}

// Adds `medals: [ids]` to each user-like object that has an id. Never throws (the market must still load).
async function attachMedals(objects, opts = {}) {
  try {
    const list = (objects || []).filter((o) => o && o.id);
    if (!list.length) return objects;
    const map = await getMedalsForUsers(list.map((o) => o.id), opts);
    list.forEach((o) => { o.medals = map[o.id] || []; });
  } catch (e) {
    console.error('[medals] could not attach medals:', e.message);
  }
  return objects;
}

// ── Sweep / first-day backfill ──────────────────────────────────────────
// Candidates = everyone with a real completed trade, plus accounts old enough for The OG.
async function listCandidateUserIds(supabase) {
  const trades = await fetchAllRows(() => supabase.from('trades')
    .select('id, buyer_id, seller_id, is_test').eq('status', 'COMPLETED').order('id', { ascending: true }));
  const ids = new Set();
  trades.filter((t) => t.is_test !== true).forEach((t) => { if (t.buyer_id) ids.add(t.buyer_id); if (t.seller_id) ids.add(t.seller_id); });
  const cutoff = new Date(Date.now() - 365 * 86400000).toISOString();
  const old = await fetchAllRows(() => supabase.from('users').select('id').lte('created_at', cutoff).order('id', { ascending: true }));
  old.forEach((u) => ids.add(u.id));
  return [...ids];
}

// apply=false is a DRY RUN: it saves nothing and notifies nobody, and returns what would happen.
async function runSweep({ apply = false, notify = true, supabase = defaultSupabase, onProgress, pushFn } = {}) {
  _clearVolumeCache();
  const index = await getVolumeIndex(supabase, { force: true });

  // 1. medals sitting on restricted accounts are taken away
  const held = await fetchAllRows(() => supabase.from('user_badges')
    .select('id, user_id').in('badge_name', MEDAL_IDS).eq('is_unlocked', true).order('id', { ascending: true }));
  const holders = [...new Set(held.map((r) => r.user_id))];
  const revoked = [];
  for (let i = 0; i < holders.length; i += 100) {
    const { data: us } = await supabase.from('users').select('id, username, account_status').in('id', holders.slice(i, i + 100));
    for (const u of us || []) {
      if (isRestricted(u.account_status)) {
        const n = apply ? await revokeMedalsFor(u.id, { supabase }) : held.filter((r) => r.user_id === u.id).length;
        revoked.push({ userId: u.id, username: u.username, status: u.account_status, medals: n });
      }
    }
  }

  // 2. award what people have earned
  const candidates = await listCandidateUserIds(supabase);
  const awards = [];
  const skippedRestricted = [];
  let done = 0;
  for (const id of candidates) {
    try {
      const r = await evaluateUser(id, { persist: apply, notify: apply && notify, supabase, pushFn, percentile: ms.percentileFromVolumes(index, id) });
      if (r && r.restricted) skippedRestricted.push({ userId: id, username: r.user.username, status: r.user.account_status });
      else if (r) {
        const already = await supabase.from('user_badges').select('badge_name').eq('user_id', id).eq('is_unlocked', true).in('badge_name', MEDAL_IDS);
        const have = new Set((already.data || []).map((x) => x.badge_name));
        // dry run: everything earned that is not saved yet; apply: what this run just saved
        const list = apply ? r.newlyAwarded : r.earned.map((e) => e.id).filter((m) => !have.has(m));
        if (list.length) awards.push({ userId: id, username: r.user.username, medals: list, stats: r.stats, earned: r.earned.filter((e) => list.includes(e.id)) });
      }
    } catch (e) {
      console.error(`[medals] sweep failed for ${String(id).slice(0, 8)}:`, e.message);
    }
    done++;
    if (onProgress && done % 25 === 0) onProgress(done, candidates.length);
  }
  return { apply, candidates: candidates.length, awards, revoked, skippedRestricted };
}

// Daily job (only when MEDALS_AUTO_ENABLED=true).
function startDailySweep({ intervalMs = 24 * 60 * 60 * 1000, firstDelayMs = 10 * 60 * 1000 } = {}) {
  const tick = () => {
    if (!medalsAutoEnabled()) return;
    runSweep({ apply: true, notify: true })
      .then((r) => console.log(`[medals] daily sweep: ${r.candidates} checked, ${r.awards.reduce((s, a) => s + a.medals.length, 0)} awarded, ${r.revoked.length} restricted account(s) cleaned`))
      .catch((e) => console.error('[medals] daily sweep failed:', e.message));
  };
  setTimeout(tick, firstDelayMs);
  return setInterval(tick, intervalMs);
}

module.exports = {
  medalsAutoEnabled,
  isRestricted,
  fetchAllRows,
  getVolumeIndex,
  _clearVolumeCache,
  loadUserAndTrades,
  computeStats,
  evaluateUser,
  evaluateAfterTrade,
  revokeMedalsFor,
  getMedalsForUsers,
  attachMedals,
  runSweep,
  startDailySweep,
};
