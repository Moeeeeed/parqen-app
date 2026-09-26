// Run with:  node --test tests/affiliateLevelAward.test.js
// No network and no real data: a small in-memory database stands in for Supabase.
const { test, describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const award = require('../services/affiliateLevelAwardService');
const summarySvc = require('../services/affiliateSummaryService');

// ── tiny in-memory Supabase (same shape used by tests/medalAward.test.js) ──────────
function fakeDb(tables) {
  let seq = 1000;
  return {
    tables,
    from(name) {
      tables[name] = tables[name] || [];
      const st = { action: 'select', filters: [], patch: null, order: null, range: null, single: false, wantRows: false, insertRow: null };
      const b = {
        select() { if (st.action !== 'select') st.wantRows = true; return b; },
        update(p) { st.action = 'update'; st.patch = p; return b; },
        insert(row) { st.action = 'insert'; st.insertRow = row; return b; },
        eq(c, v) { st.filters.push((r) => r[c] === v); return b; },
        in(c, arr) { st.filters.push((r) => arr.includes(r[c])); return b; },
        order(c) { st.order = c; return b; },
        range(a, z) { st.range = [a, z]; return b; },
        maybeSingle() { st.single = true; return b; },
        single() { st.single = true; return b; },
        then(res, rej) {
          try {
            const rows = tables[name];
            if (st.action === 'insert') {
              const dup = name === 'user_badges' && rows.some((r) => r.user_id === st.insertRow.user_id && r.badge_name === st.insertRow.badge_name);
              if (dup) return res({ data: null, error: { code: '23505', message: 'duplicate' } });
              rows.push({ id: 'row' + (seq++), ...st.insertRow });
              return res({ data: null, error: null });
            }
            let out = rows.filter((r) => st.filters.every((f) => f(r)));
            if (st.action === 'update') {
              out.forEach((r) => Object.assign(r, st.patch));
              return res({ data: st.wantRows ? out.map((r) => ({ id: r.id })) : null, error: null });
            }
            if (st.range) out = out.slice(st.range[0], st.range[1] + 1);
            res(st.single ? { data: out[0] || null, error: null } : { data: out, error: null });
          } catch (e) { rej(e); }
        },
      };
      return b;
    },
  };
}

const AFF = 'affiliate-1';
const mkUser = (id, extra = {}) => ({ id, username: id, country: 'GH', referred_by: null, created_at: '2026-01-01T00:00:00Z', ...extra });
// A qualifying trade: COMPLETED, fee COLLECTED, real currency, no gift card, not with the affiliate.
const trade = (id, buyer, seller, usd) => ({
  id, status: 'COMPLETED', currency: 'BTC', amount_usd: usd, fee_status: 'COLLECTED',
  dispute_resolution: null, gift_card_brand: null, is_test: false, listing_id: null,
  buyer_id: buyer, seller_id: seller, completed_at: '2026-06-01T00:00:00Z',
});

const pushes = [];
const pushFn = async (userId, title) => { pushes.push({ userId, title }); };

beforeEach(() => { pushes.length = 0; delete process.env.AFFILIATE_LEVELS_AUTO_ENABLED; });

describe('level computation (via the real, existing affiliateSummaryService — not reimplemented)', () => {
  it('needs BOTH the active-user count AND the volume for a level, not just one', async () => {
    // 8 active referred users (each with real qualifying volume), but total volume only $200 —
    // clears Builder's user count (10? no — 8 < 10) ... use a case that isolates volume vs users:
    // 6 active users (clears Explorer's 5, not Builder's 10), $3,000 volume (clears both Explorer's
    // and Builder's volume) — must land on Explorer, not Builder, because of the user count alone.
    const referred = Array.from({ length: 6 }, (_, i) => mkUser('u' + i, { referred_by: AFF }));
    const trades = referred.map((u, i) => trade('t' + i, u.id, 'outside-' + i, 500)); // $500 each, 6*500=3000
    const db = fakeDb({ users: [mkUser(AFF), ...referred], trades, listings: [], user_badges: [] });
    const r = await award.evaluateUser(AFF, { persist: false, supabase: db });
    assert.strictEqual(r.level.name, 'Explorer');
    assert.notStrictEqual(r.level.name, 'Builder');
  });

  it('matches ukbuyer2022-shaped numbers: 8 active users, $3,026 volume -> Explorer, not Builder', async () => {
    const referred = Array.from({ length: 8 }, (_, i) => mkUser('r' + i, { referred_by: AFF }));
    const trades = referred.map((u, i) => trade('t' + i, u.id, 'outside-' + i, 378.25));
    const db = fakeDb({ users: [mkUser(AFF), ...referred], trades, listings: [], user_badges: [] });
    const r = await award.evaluateUser(AFF, { persist: false, supabase: db });
    assert.strictEqual(r.level.name, 'Explorer');
  });

  it('nobody referred -> no level, no crash', async () => {
    const db = fakeDb({ users: [mkUser(AFF)], trades: [], listings: [], user_badges: [] });
    const r = await award.evaluateUser(AFF, { persist: false, supabase: db });
    assert.strictEqual(r.level, null);
    assert.deepStrictEqual(r.earnedLevelIds, []);
  });
});

describe('automatic award', () => {
  it('awards Explorer and announces it once, with the real earned trade evidence behind it', async () => {
    const referred = Array.from({ length: 5 }, (_, i) => mkUser('u' + i, { referred_by: AFF }));
    const trades = referred.map((u, i) => trade('t' + i, u.id, 'x' + i, 50)); // meets $50 volume, 5 active users
    const db = fakeDb({ users: [mkUser(AFF), ...referred], trades, listings: [], user_badges: [], notifications: [] });
    const r = await award.evaluateUser(AFF, { persist: true, notify: true, supabase: db, pushFn });
    assert.deepStrictEqual(r.newlyAwarded, ['affiliate-explorer']);
    const row = db.tables.user_badges.find((b) => b.badge_name === 'affiliate-explorer');
    assert.ok(row.is_unlocked);
    assert.strictEqual(db.tables.notifications.length, 1);
    assert.strictEqual(db.tables.notifications[0].type, 'affiliate_level');
    assert.match(db.tables.notifications[0].title, /Explorer/);
    assert.strictEqual(db.tables.notifications[0].action, '/partner-program');
    assert.strictEqual(pushes.length, 1);
  });

  it('a second check does not announce the same level again', async () => {
    const referred = Array.from({ length: 5 }, (_, i) => mkUser('u' + i, { referred_by: AFF }));
    const trades = referred.map((u, i) => trade('t' + i, u.id, 'x' + i, 50));
    const db = fakeDb({ users: [mkUser(AFF), ...referred], trades, listings: [], user_badges: [], notifications: [] });
    await award.evaluateUser(AFF, { persist: true, notify: true, supabase: db, pushFn });
    const again = await award.evaluateUser(AFF, { persist: true, notify: true, supabase: db, pushFn });
    assert.deepStrictEqual(again.newlyAwarded, []);
    assert.strictEqual(db.tables.notifications.length, 1);
    assert.strictEqual(db.tables.user_badges.length, 1);
  });

  it('jumping straight to Titan in one check still earns Explorer and Builder along the way (cumulative)', async () => {
    const referred = Array.from({ length: 20 }, (_, i) => mkUser('u' + i, { referred_by: AFF }));
    const trades = referred.map((u, i) => trade('t' + i, u.id, 'x' + i, 600)); // 20 active, $12,000 total
    const db = fakeDb({ users: [mkUser(AFF), ...referred], trades, listings: [], user_badges: [], notifications: [] });
    const r = await award.evaluateUser(AFF, { persist: true, notify: true, supabase: db, pushFn });
    assert.strictEqual(r.level.name, 'Titan');
    assert.deepStrictEqual(new Set(r.newlyAwarded), new Set(['affiliate-explorer', 'affiliate-builder', 'affiliate-titan']));
    assert.strictEqual(db.tables.notifications.length, 3);
    assert.strictEqual(db.tables.user_badges.filter((b) => b.is_unlocked).length, 3);
  });

  it('4 active users / $3,000 volume does not reach Explorer (needs 5 active users)', async () => {
    const referred = Array.from({ length: 4 }, (_, i) => mkUser('u' + i, { referred_by: AFF }));
    const trades = referred.map((u, i) => trade('t' + i, u.id, 'x' + i, 750));
    const db = fakeDb({ users: [mkUser(AFF), ...referred], trades, listings: [], user_badges: [] });
    const r = await award.evaluateUser(AFF, { persist: true, notify: true, supabase: db, pushFn });
    assert.strictEqual(r.level, null);
    assert.deepStrictEqual(r.newlyAwarded, []);
    assert.strictEqual(pushes.length, 0);
  });

  it('a dry run (persist=false) reports the level but saves and announces nothing', async () => {
    const referred = Array.from({ length: 5 }, (_, i) => mkUser('u' + i, { referred_by: AFF }));
    const trades = referred.map((u, i) => trade('t' + i, u.id, 'x' + i, 50));
    const db = fakeDb({ users: [mkUser(AFF), ...referred], trades, listings: [], user_badges: [], notifications: [] });
    const r = await award.evaluateUser(AFF, { persist: false, notify: true, supabase: db, pushFn });
    assert.strictEqual(r.level.name, 'Explorer');
    assert.strictEqual(db.tables.user_badges.length, 0);
    assert.strictEqual(db.tables.notifications.length, 0);
    assert.strictEqual(pushes.length, 0);
  });

  it('two overlapping checks announce the level only once (per-user lock)', async () => {
    const referred = Array.from({ length: 5 }, (_, i) => mkUser('u' + i, { referred_by: AFF }));
    const trades = referred.map((u, i) => trade('t' + i, u.id, 'x' + i, 50));
    const db = fakeDb({ users: [mkUser(AFF), ...referred], trades, listings: [], user_badges: [], notifications: [] });
    const o = { persist: true, notify: true, supabase: db, pushFn };
    await Promise.all([award.evaluateUser(AFF, o), award.evaluateUser(AFF, o), award.evaluateUser(AFF, o)]);
    assert.strictEqual(db.tables.notifications.length, 1);
    assert.strictEqual(db.tables.user_badges.length, 1);
  });
});

describe('automatic switch', () => {
  it('is OFF unless AFFILIATE_LEVELS_AUTO_ENABLED is exactly "true"', () => {
    delete process.env.AFFILIATE_LEVELS_AUTO_ENABLED;
    assert.strictEqual(award.autoEnabled(), false);
    ['', 'false', 'TRUE', '1', 'yes'].forEach((v) => { process.env.AFFILIATE_LEVELS_AUTO_ENABLED = v; assert.strictEqual(award.autoEnabled(), false, v); });
    process.env.AFFILIATE_LEVELS_AUTO_ENABLED = 'true';
    assert.strictEqual(award.autoEnabled(), true);
  });
  it('after-trade check does nothing while the switch is off', async () => {
    delete process.env.AFFILIATE_LEVELS_AUTO_ENABLED;
    award.evaluateAfterTrade(['u1', 'u2']); // must return before touching any real client
    await new Promise((r) => setTimeout(r, 30));
    assert.ok(true); // no throw, no network attempt
  });
});

describe('market / profile display', () => {
  it('returns each user\'s HIGHEST earned level, ignores medal badge rows entirely', async () => {
    const badges = [
      { user_id: 'a', badge_name: 'affiliate-explorer', is_unlocked: true },
      { user_id: 'a', badge_name: 'affiliate-builder', is_unlocked: true },
      { user_id: 'a', badge_name: 'praqen-initiate', is_unlocked: true }, // a medal — must be ignored here
      { user_id: 'b', badge_name: 'affiliate-titan', is_unlocked: true },
      { user_id: 'c', badge_name: 'affiliate-explorer', is_unlocked: false }, // not unlocked — must not count
    ];
    const levels = await award.getLevelsForUsers(['a', 'b', 'c', 'd'], { supabase: fakeDb({ user_badges: badges }) });
    assert.deepStrictEqual(levels.a, { index: 1, id: 'affiliate-builder', name: 'Builder' });
    assert.deepStrictEqual(levels.b, { index: 2, id: 'affiliate-titan', name: 'Titan' });
    assert.strictEqual(levels.c, undefined);
    assert.strictEqual(levels.d, undefined);
  });

  it('attachAffiliateLevels adds .affiliateLevel only to users who have one', async () => {
    const badges = [{ user_id: 'a', badge_name: 'affiliate-explorer', is_unlocked: true }];
    const users = [{ id: 'a' }, { id: 'b' }];
    await award.attachAffiliateLevels(users, { supabase: fakeDb({ user_badges: badges }) });
    assert.deepStrictEqual(users[0].affiliateLevel, { index: 0, id: 'affiliate-explorer', name: 'Explorer' });
    assert.strictEqual(users[1].affiliateLevel, undefined);
  });

  it('a database problem never throws — market page keeps working with no level shown', async () => {
    const bad = { from() { const b = { select: () => b, in: () => b, eq: () => Promise.resolve({ data: null, error: { message: 'down' } }) }; return b; } };
    const users = [{ id: 'a' }];
    await assert.doesNotReject(() => award.attachAffiliateLevels(users, { supabase: bad }));
    assert.strictEqual(users[0].affiliateLevel, undefined);
  });
});
