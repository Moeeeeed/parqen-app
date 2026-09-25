// services/medalService.js — medal definitions + unlock/progress logic for
// Trader Settings → Badges & Medals. Extracted from server.js so the pure
// logic (streaks, thresholds, payload shaping) is unit-testable without a
// database; the route in server.js only wires I/O (Supabase + user_badges).
//
// Model: compute-on-read. Progress is always derived from source-of-truth
// data (trades/users) at request time — nothing accumulates, so a missed
// trigger event can never silently drop a medal's progress. Earned medals
// persist to user_badges (is_unlocked + unlocked_at) and are skipped on
// recompute, so a medal can never regress from earned back to locked.

// ── Streak logic (Every Damn Day) ───────────────────────────────────────
// Derives the longest run of consecutive days with 1+ completed trade from
// real trade data — no separate daily-activity tracking needed. The streak
// counts *calendar days* in the UTC day-bucket of each trade's completed_at,
// so a single trade any time during a day keeps the day "active".
//
// Returns the streak that matters for a 30-day target: the LONGEST run in
// the user's history (not the current run), so progress never regresses —
// a user who hit 12 days in a row, missed a day, then did 5 more days still
// shows 12/30, not 5/30. A medal earned off the longest streak stays earned
// forever because longest-streak can only grow over time.
function longestDailyStreak(completedTrades) {
  if (!Array.isArray(completedTrades) || completedTrades.length === 0) return 0;
  const days = new Set();
  for (const t of completedTrades) {
    const ts = t?.completed_at;
    if (!ts) continue;
    const d = new Date(ts);
    if (isNaN(d.getTime())) continue;
    days.add(d.toISOString().slice(0, 10)); // UTC day bucket, e.g. '2026-09-14'
  }
  if (days.size === 0) return 0;
  const sorted = [...days].sort();
  let best = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(`${sorted[i - 1]}T00:00:00Z`).getTime();
    const curr = new Date(`${sorted[i]}T00:00:00Z`).getTime();
    run = curr - prev === 86400000 ? run + 1 : 1; // consecutive UTC day → extend, else reset
    if (run > best) best = run;
  }
  return best;
}

// ── Pure per-medal checks (operating on stats) ──────────────────────────
// Each definition: id, name, description, icon (filename in frontend/public/),
// isUnlocked(stats), and optional progress(stats) → { current, target } for
// locked medals, or null when earned / not tracked. All numeric thresholds
// are real data only — no hardcoded/fabricated stats.
const MEDAL_CHECKS = {
  'praqen-initiate': {
    progress: s => (s.totalTrades >= 10 ? null : { current: Math.min(s.totalTrades, 10), target: 10 }),
    isUnlocked: s => s.totalTrades >= 10,
  },
  'deca-dealer': {
    progress: s => (s.totalVolumeUsd >= 10000 ? null : { current: Math.floor(s.totalVolumeUsd), target: 10000 }),
    isUnlocked: s => s.totalVolumeUsd >= 10000,
  },
  'momo-master': {
    progress: s => (s.momoTrades >= 100 ? null : { current: s.momoTrades, target: 100 }),
    isUnlocked: s => s.momoTrades >= 100,
  },
  'bank-transfer-boss': {
    progress: s => (s.bankTrades >= 25 ? null : { current: s.bankTrades, target: 25 }),
    isUnlocked: s => s.bankTrades >= 25,
  },
  'gift-card-savage': {
    progress: s => (s.giftCardTrades >= 10 ? null : { current: s.giftCardTrades, target: 10 }),
    isUnlocked: s => s.giftCardTrades >= 10,
  },
  'clean-sheet': {
    // `disputed_at` stays stamped on resolved disputes too, so a
    // resolved-against-you dispute still counts against the medal.
    progress: s => (s.totalTrades >= 20 && s.disputeCount === 0 ? null : { current: Math.max(0, Math.min(s.totalTrades, 20)), target: 20 }),
    isUnlocked: s => s.totalTrades >= 20 && s.disputeCount === 0,
  },
  'no-slip-zone': {
    progress: s => (s.totalTrades >= 15 && s.cancelledCount === 0 ? null : { current: Math.max(0, Math.min(s.totalTrades, 15)), target: 15 }),
    isUnlocked: s => s.totalTrades >= 15 && s.cancelledCount === 0,
  },
  'every-damn-day': {
    progress: s => (s.dailyStreak >= 30 ? null : { current: s.dailyStreak, target: 30 }),
    isUnlocked: s => s.dailyStreak >= 30,
  },
  'the-og': {
    progress: s => {
      if (!s.registeredAt) return null;
      const days = (Date.now() - new Date(s.registeredAt).getTime()) / 86400000;
      return days >= 365 ? null : { current: Math.floor(days), target: 365 };
    },
    isUnlocked: s => !!s.registeredAt && (Date.now() - new Date(s.registeredAt).getTime()) >= 365 * 86400000,
  },
  // Ranking-based, not a fixed target: percentile is computed live
  // server-side over all users' completed-trade volume (never exposed via
  // admin endpoints). No progress line — a percentile isn't meaningfully
  // fraction-able. Once earned it persists like every other medal.
  'top-1-club': {
    isUnlocked: s => s.volumePercentile >= 99,
  },
};

const MEDAL_META = {
  'praqen-initiate': { name: 'PraQen Initiate', description: 'First 10 trades', icon: '/praqen-initiate.jpg' },
  'deca-dealer': { name: 'Deca Dealer', description: 'Trade volume of 10,000 USD', icon: '/deca-dealer.jpg' },
  'momo-master': { name: 'Momo Master', description: '100+ mobile money trades', icon: '/momo-master.jpg' },
  'bank-transfer-boss': { name: 'Bank Transfer Boss', description: '25+ bank transfer trades', icon: '/bank-transfer-boss.jpg' },
  'gift-card-savage': { name: 'Gift Card Savage', description: '10+ gift card trades', icon: '/gift-card-savage.jpg' },
  'clean-sheet': { name: 'Clean Sheet', description: 'Complete 20 trades, zero disputes', icon: '/clean-sheet.jpg' },
  'no-slip-zone': { name: 'No Slip Zone', description: 'Complete 15 trades, zero cancellations', icon: '/no-slip-zone.jpg' },
  'every-damn-day': { name: 'Every Damn Day', description: '1+ trade per day for 30 days', icon: '/every-damn-day.jpg' },
  'the-og': { name: 'The OG', description: '1+ year on PraQen', icon: '/the-og.jpg' },
  'top-1-club': { name: 'Top 1% Club', description: 'Top 1% of traders by volume', icon: '/top-1-club.jpg' },
};

// Display order for the grid.
const MEDAL_ORDER = [
  'praqen-initiate', 'deca-dealer', 'momo-master', 'bank-transfer-boss',
  'gift-card-savage', 'clean-sheet', 'no-slip-zone', 'every-damn-day',
  'the-og', 'top-1-club',
];

// Build API payloads from stats + earned-date map. Pure; exported for tests.
function buildMedalPayloads(stats, earnedDateByMedalId = {}) {
  return MEDAL_ORDER.map(id => {
    const def = MEDAL_CHECKS[id];
    const meta = MEDAL_META[id];
    const earnedDate = earnedDateByMedalId[id] || null;
    // Earned medals never re-derive progress (immutable once earned); the
    // frontend hides the progress line for earnedDate rows and shows the
    // formatted earned date instead.
    const prog = earnedDate ? null : (def.progress ? def.progress(stats) : null);
    return {
      id,
      name: meta.name,
      description: meta.description,
      icon: meta.icon,
      earnedDate,
      progressCurrent: prog?.current ?? null,
      progressTarget: prog?.target ?? null,
    };
  });
}

// Which medal ids does this stats object newly qualify for? Pure; exported
// for tests. Callers skip ids already recorded in user_badges.
function newlyEarnedMedalIds(stats, alreadyEarnedIds = []) {
  const already = new Set(alreadyEarnedIds);
  return MEDAL_ORDER.filter(id => !already.has(id) && MEDAL_CHECKS[id].isUnlocked(stats));
}

module.exports = {
  longestDailyStreak,
  MEDAL_CHECKS,
  MEDAL_META,
  MEDAL_ORDER,
  buildMedalPayloads,
  newlyEarnedMedalIds,
};
