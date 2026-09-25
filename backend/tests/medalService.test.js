// tests/medalService.test.js — unit tests for medal unlock/progress logic
// (Trader Settings → Badges & Medals). Run with:  node --test tests/medalService.test.js
//
// Covers all 10 medal types with seeded mock stats: unlock at the exact
// threshold boundary, below-threshold progress fractions, Every Damn Day
// streak derivation, and earned-medal immutability in payload shaping.

const { test, describe, it } = require('node:test');
const assert = require('node:assert');
const {
  longestDailyStreak,
  buildMedalPayloads,
  newlyEarnedMedalIds,
  MEDAL_ORDER,
  MEDAL_META,
  MIN_TRADES_FOR_VOLUME_MEDALS,
  earnedAtForMedal,
} = require('../services/medalService');

// ── Seeded mock stats factory ───────────────────────────────────────────
const baseStats = () => ({
  totalTrades: 0,
  totalVolumeUsd: 0,
  momoTrades: 0,
  bankTrades: 0,
  giftCardTrades: 0,
  disputeCount: 0,
  cancelledCount: 0,
  dailyStreak: 0,
  registeredAt: null,
  volumePercentile: 0,
});

const day = n => new Date(Date.UTC(2026, 8, 1 + n, 15, 0, 0)).toISOString(); // Sep 2026, noon-ish UTC

const tradesOnDays = days => days.map(n => ({ completed_at: day(n) }));

// ── longestDailyStreak ──────────────────────────────────────────────────
describe('longestDailyStreak', () => {
  it('returns 0 for empty/null input', () => {
    assert.strictEqual(longestDailyStreak([]), 0);
    assert.strictEqual(longestDailyStreak(null), 0);
  });

  it('ignores trades without a completed_at', () => {
    assert.strictEqual(longestDailyStreak([{ buyer_id: 'x' }]), 0);
  });

  it('counts one trade any time during a day as that day active', () => {
    assert.strictEqual(longestDailyStreak(tradesOnDays([0])), 1);
    assert.strictEqual(longestDailyStreak(tradesOnDays([0, 1, 2])), 3);
  });

  it('counts multiple trades on the same day as one day', () => {
    const trades = [
      { completed_at: day(0) }, { completed_at: day(0) }, { completed_at: day(0) },
    ];
    assert.strictEqual(longestDailyStreak(trades), 1);
  });

  it('resets the run when a day is missed', () => {
    // 5 consecutive, gap, 3 consecutive → longest is 5
    assert.strictEqual(longestDailyStreak(tradesOnDays([0, 1, 2, 3, 4, 6, 7, 8])), 5);
  });

  it('returns the longest run, not the current run (progress never regresses)', () => {
    // Hit 12 in a row early, miss a day, then only 2 more
    const early = Array.from({ length: 12 }, (_, i) => i);
    const late = [14, 15];
    assert.strictEqual(longestDailyStreak(tradesOnDays([...early, ...late])), 12);
  });

  it('handles full 30-day streak', () => {
    assert.strictEqual(longestDailyStreak(tradesOnDays(Array.from({ length: 30 }, (_, i) => i))), 30);
  });

  it('treats month boundaries as consecutive days', () => {
    const trades = [
      { completed_at: '2026-08-30T10:00:00Z' },
      { completed_at: '2026-08-31T10:00:00Z' },
      { completed_at: '2026-09-01T10:00:00Z' },
    ];
    assert.strictEqual(longestDailyStreak(trades), 3);
  });

  it('is unbounded across years of history (no window cap)', () => {
    const trades = Array.from({ length: 40 }, (_, i) => ({ completed_at: day(i) }));
    assert.strictEqual(longestDailyStreak(trades), 40);
  });
});

// ── Per-medal unlock thresholds (exact boundary) ────────────────────────
// Membership helper: medal-level checks are independent, but one stats object
// (e.g. 50 total trades) can legitimately qualify several medals at once, so
// per-medal assertions use membership rather than exact arrays.
const earned = (stats, id) => newlyEarnedMedalIds(stats).includes(id);

describe('medal unlock thresholds', () => {
  it('praqen-initiate unlocks at exactly 10 trades', () => {
    assert.deepStrictEqual(newlyEarnedMedalIds({ ...baseStats(), totalTrades: 9 }), []);
    assert.ok(earned({ ...baseStats(), totalTrades: 10 }, 'praqen-initiate'));
    assert.ok(earned({ ...baseStats(), totalTrades: 50 }, 'praqen-initiate'));
  });

  it('deca-dealer unlocks at exactly 10,000 USD volume (with at least 10 trades)', () => {
    assert.ok(!earned({ ...baseStats(), totalTrades: 50, totalVolumeUsd: 9999.99 }, 'deca-dealer'));
    assert.ok(earned({ ...baseStats(), totalTrades: 10, totalVolumeUsd: 10000 }, 'deca-dealer'));
  });

  it('deca-dealer and top-1-club need 10 completed trades: one big trade is not enough', () => {
    assert.ok(!earned({ ...baseStats(), totalTrades: 1, totalVolumeUsd: 15388, volumePercentile: 99 }, 'deca-dealer'));
    assert.ok(!earned({ ...baseStats(), totalTrades: 5, totalVolumeUsd: 17933, volumePercentile: 100 }, 'top-1-club'));
    assert.ok(!earned({ ...baseStats(), totalTrades: 9, totalVolumeUsd: 20000, volumePercentile: 100 }, 'deca-dealer'));
    assert.ok(earned({ ...baseStats(), totalTrades: 10, totalVolumeUsd: 20000, volumePercentile: 100 }, 'deca-dealer'));
    assert.ok(earned({ ...baseStats(), totalTrades: 10, totalVolumeUsd: 20000, volumePercentile: 100 }, 'top-1-club'));
    assert.strictEqual(MIN_TRADES_FOR_VOLUME_MEDALS, 10);
  });

  it('deca-dealer with enough volume but too few trades shows trade progress, not "done"', () => {
    const m = buildMedalPayloads({ ...baseStats(), totalTrades: 4, totalVolumeUsd: 12000 }, {}).find((x) => x.id === 'deca-dealer');
    assert.strictEqual(m.earnedDate, null);
    assert.strictEqual(m.progressCurrent, 4);
    assert.strictEqual(m.progressTarget, 10);
  });

  it('deca-dealer earned date is the later of "passed $10,000" and "10th trade"', () => {
    const t = (i, amt) => ({ completed_at: new Date(Date.UTC(2026, 5, 1 + i)).toISOString(), amount_usd: amt });
    const big = [t(0, 12000), ...Array.from({ length: 11 }, (_, i) => t(i + 1, 10))];
    assert.strictEqual(earnedAtForMedal('deca-dealer', big, null), big[9].completed_at); // 10th trade came after the volume
    const late = [...Array.from({ length: 10 }, (_, i) => t(i, 10)), t(10, 12000)];
    assert.strictEqual(earnedAtForMedal('deca-dealer', late, null), late[10].completed_at); // volume crossed last
  });

  it('momo-master unlocks at exactly 100 momo trades', () => {
    assert.deepStrictEqual(newlyEarnedMedalIds({ ...baseStats(), momoTrades: 99 }), []);
    assert.ok(earned({ ...baseStats(), momoTrades: 100 }, 'momo-master'));
  });

  it('bank-transfer-boss unlocks at exactly 25 bank trades', () => {
    assert.deepStrictEqual(newlyEarnedMedalIds({ ...baseStats(), bankTrades: 24 }), []);
    assert.ok(earned({ ...baseStats(), bankTrades: 25 }, 'bank-transfer-boss'));
  });

  it('gift-card-savage unlocks at exactly 10 gift card trades', () => {
    assert.deepStrictEqual(newlyEarnedMedalIds({ ...baseStats(), giftCardTrades: 9 }), []);
    assert.ok(earned({ ...baseStats(), giftCardTrades: 10 }, 'gift-card-savage'));
  });

  it('clean-sheet needs 20 trades AND zero disputes', () => {
    assert.ok(!earned({ ...baseStats(), totalTrades: 20, disputeCount: 1 }, 'clean-sheet'));
    assert.ok(!earned({ ...baseStats(), totalTrades: 19, disputeCount: 0 }, 'clean-sheet'));
    assert.ok(earned({ ...baseStats(), totalTrades: 20, disputeCount: 0 }, 'clean-sheet'));
  });

  it('no-slip-zone needs 15 trades AND zero cancellations', () => {
    assert.ok(!earned({ ...baseStats(), totalTrades: 15, cancelledCount: 1 }, 'no-slip-zone'));
    assert.ok(!earned({ ...baseStats(), totalTrades: 14, cancelledCount: 0 }, 'no-slip-zone'));
    assert.ok(earned({ ...baseStats(), totalTrades: 15, cancelledCount: 0 }, 'no-slip-zone'));
  });

  it('every-damn-day unlocks at exactly a 30-day streak', () => {
    assert.deepStrictEqual(newlyEarnedMedalIds({ ...baseStats(), dailyStreak: 29 }), []);
    assert.ok(earned({ ...baseStats(), dailyStreak: 30 }, 'every-damn-day'));
    assert.ok(earned({ ...baseStats(), dailyStreak: 45 }, 'every-damn-day'));
  });

  it('the-og unlocks after 365 days of registration', () => {
    const yearAgo = new Date(Date.now() - 366 * 86400000).toISOString();
    const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString();
    assert.deepStrictEqual(newlyEarnedMedalIds({ ...baseStats(), registeredAt: monthAgo }), []);
    assert.ok(earned({ ...baseStats(), registeredAt: yearAgo }, 'the-og'));
    assert.deepStrictEqual(newlyEarnedMedalIds({ ...baseStats(), registeredAt: null }), []);
  });

  it('top-1-club unlocks at the 99th percentile (ranking-based)', () => {
    assert.deepStrictEqual(newlyEarnedMedalIds({ ...baseStats(), volumePercentile: 98.4 }), []);
    assert.ok(earned({ ...baseStats(), totalTrades: 10, volumePercentile: 99 }, 'top-1-club'));
    assert.ok(earned({ ...baseStats(), totalTrades: 10, volumePercentile: 100 }, 'top-1-club'));
  });

  it('a heavy trader earns many medals at once', () => {
    const stats = {
      ...baseStats(),
      totalTrades: 30,
      totalVolumeUsd: 25000,
      momoTrades: 120,
      bankTrades: 30,
      giftCardTrades: 12,
      disputeCount: 0,
      cancelledCount: 0,
      dailyStreak: 31,
      registeredAt: new Date(Date.now() - 400 * 86400000).toISOString(),
      volumePercentile: 99.5,
    };
    assert.deepStrictEqual(newlyEarnedMedalIds(stats), MEDAL_ORDER);
  });
});

// ── Progress fractions while locked ─────────────────────────────────────
describe('progress fractions for locked medals', () => {
  it('shows current/target for below-threshold medals', () => {
    const stats = { ...baseStats(), totalTrades: 9, momoTrades: 71, bankTrades: 3 };
    const byId = Object.fromEntries(buildMedalPayloads(stats).map(m => [m.id, m]));
    assert.strictEqual(byId['praqen-initiate'].progressCurrent, 9);
    assert.strictEqual(byId['praqen-initiate'].progressTarget, 10);
    assert.strictEqual(byId['momo-master'].progressCurrent, 71);
    assert.strictEqual(byId['momo-master'].progressTarget, 100);
    assert.strictEqual(byId['bank-transfer-boss'].progressCurrent, 3);
    assert.strictEqual(byId['bank-transfer-boss'].progressTarget, 25);
  });

  it('every-damn-day exposes streak progress once real trades exist', () => {
    const stats = { ...baseStats(), dailyStreak: 12 };
    const byId = Object.fromEntries(buildMedalPayloads(stats).map(m => [m.id, m]));
    assert.strictEqual(byId['every-damn-day'].progressCurrent, 12);
    assert.strictEqual(byId['every-damn-day'].progressTarget, 30);
    assert.strictEqual(byId['every-damn-day'].earnedDate, null);
  });

  it('zero-progress medals report 0/target (frontend hides the line)', () => {
    const byId = Object.fromEntries(buildMedalPayloads(baseStats()).map(m => [m.id, m]));
    assert.strictEqual(byId['praqen-initiate'].progressCurrent, 0);
    assert.strictEqual(byId['praqen-initiate'].progressTarget, 10);
  });

  it('top-1-club has no progress fraction (ranking-based)', () => {
    const byId = Object.fromEntries(buildMedalPayloads({ ...baseStats(), volumePercentile: 42 }).map(m => [m.id, m]));
    assert.strictEqual(byId['top-1-club'].progressCurrent, null);
    assert.strictEqual(byId['top-1-club'].progressTarget, null);
  });
});

// ── Earned immutability in payload shaping ──────────────────────────────
describe('earned-medal immutability', () => {
  it('earned medals keep earnedDate and never show live progress', () => {
    // Metric later changed: trades dropped to 1 — must not affect the medal.
    const stats = { ...baseStats(), totalTrades: 1 };
    const medals = buildMedalPayloads(stats, { 'praqen-initiate': '2025-07-29T12:00:00.000Z' });
    const m = medals.find(x => x.id === 'praqen-initiate');
    assert.strictEqual(m.earnedDate, '2025-07-29T12:00:00.000Z');
    assert.strictEqual(m.progressCurrent, null);
    assert.strictEqual(m.progressTarget, null);
  });

  it('newlyEarnedMedalIds skips already-earned ids (no re-lock path)', () => {
    const stats = { ...baseStats(), totalTrades: 10 };
    assert.deepStrictEqual(newlyEarnedMedalIds(stats, ['praqen-initiate']), []);
  });

  it('qualifying medals absent from user_badges are returned even when other medals are already earned', () => {
    const stats = { ...baseStats(), totalTrades: 20, disputeCount: 0 };
    assert.deepStrictEqual(newlyEarnedMedalIds(stats, ['praqen-initiate']), ['clean-sheet', 'no-slip-zone']);
  });
});

// ── Definition integrity ────────────────────────────────────────────────
describe('medal definitions', () => {
  it('all 10 medals have name, description and icon and appear exactly once', () => {
    assert.strictEqual(MEDAL_ORDER.length, 10);
    assert.strictEqual(new Set(MEDAL_ORDER).size, 10);
    for (const id of MEDAL_ORDER) {
      assert.ok(MEDAL_META[id], `missing meta for ${id}`);
      assert.ok(MEDAL_META[id].name, `missing name for ${id}`);
      assert.ok(MEDAL_META[id].description, `missing description for ${id}`);
      assert.ok(MEDAL_META[id].icon.startsWith('/'), `icon for ${id} should be a public path`);
    }
  });
});

// ── Top 1% Club ranking (added with the paging / test-trade fix) ─────────
const { volumesByUser, percentileFromVolumes } = require('../services/medalService');

describe('volume ranking', () => {
  it('credits both sides of a trade and adds up per user', () => {
    const v = volumesByUser([
      { buyer_id: 'a', seller_id: 'b', amount_usd: '100' },
      { buyer_id: 'a', seller_id: 'c', amount_usd: 50 },
    ]);
    assert.deepStrictEqual(v, { a: 150, b: 100, c: 50 });
  });

  it('ignores test trades, empty amounts and missing rows', () => {
    const v = volumesByUser([
      { buyer_id: 'a', seller_id: 'b', amount_usd: 900, is_test: true },
      { buyer_id: 'a', seller_id: 'b', amount_usd: 0 },
      { buyer_id: 'a', seller_id: 'b', amount_usd: null },
      null,
      { buyer_id: 'a', seller_id: 'b', amount_usd: 10, is_test: false },
    ]);
    assert.deepStrictEqual(v, { a: 10, b: 10 });
  });

  it('does not double count a trade where buyer and seller are the same id', () => {
    assert.deepStrictEqual(volumesByUser([{ buyer_id: 'a', seller_id: 'a', amount_usd: 40 }]), { a: 40 });
  });

  it('percentile: the biggest trader is 100, the smallest is near 0', () => {
    const vol = {};
    for (let i = 1; i <= 100; i++) vol['u' + i] = i * 10;
    assert.strictEqual(percentileFromVolumes(vol, 'u100'), 100);
    assert.strictEqual(percentileFromVolumes(vol, 'u99'), 99);
    assert.strictEqual(percentileFromVolumes(vol, 'u1'), 1);
  });

  it('percentile: Top 1% Club needs >= 99, only a handful at the very top qualify (rounding makes it just under 2%)', () => {
    const vol = {};
    for (let i = 1; i <= 300; i++) vol['u' + i] = i;
    const qualifying = Object.keys(vol).filter((id) => percentileFromVolumes(vol, id) >= 99);
    assert.ok(qualifying.length >= 1 && qualifying.length <= 5, 'qualifying: ' + qualifying.length);
  });

  it('percentile: a user with no volume is 0, a lone trader is 100', () => {
    assert.strictEqual(percentileFromVolumes({ a: 5, b: 9 }, 'nobody'), 0);
    assert.strictEqual(percentileFromVolumes({ a: 5 }, 'a'), 100);
    assert.strictEqual(percentileFromVolumes({}, 'a'), 0);
  });

  it('percentile: tied volumes rank the same', () => {
    assert.strictEqual(percentileFromVolumes({ a: 10, b: 10, c: 5, d: 1 }, 'a'), 100);
    assert.strictEqual(percentileFromVolumes({ a: 10, b: 10, c: 5, d: 1 }, 'b'), 100);
  });

  it('test-account volume can no longer push real traders down the ranking', () => {
    const trades = [
      { buyer_id: 'real1', seller_id: 'real2', amount_usd: 100 },
      { buyer_id: 'test1', seller_id: 'test2', amount_usd: 1000000, is_test: true },
    ];
    const v = volumesByUser(trades);
    assert.strictEqual(percentileFromVolumes(v, 'real1'), 100);
    assert.strictEqual(v.test1, undefined);
  });
});
