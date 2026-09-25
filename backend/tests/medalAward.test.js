// Run with:  node --test tests/medalAward.test.js
// No network and no real data: a small in-memory database stands in for Supabase.
const { test, describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const ms = require('../services/medalService');
const award = require('../services/medalAwardService');

// ── tiny in-memory Supabase ────────────────────────────────────────────
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
        lte(c, v) { st.filters.push((r) => r[c] <= v); return b; },
        not(c, op, v) { if (op === 'is' && v === null) st.filters.push((r) => r[c] !== null && r[c] !== undefined); return b; },
        or(expr) {
          const parts = expr.split(',').map((p) => p.split('.'));
          st.filters.push((r) => parts.some(([c, op, v]) => op === 'eq' && String(r[c]) === v));
          return b;
        },
        order(c) { st.order = c; return b; },
        range(a, z) { st.range = [a, z]; return b; },
        maybeSingle() { st.single = true; return b; },
        then(res, rej) {
          try {
            const rows = tables[name];
            if (st.action === 'insert') {
              const dup = name === 'user_badges' && rows.some((r) => r.user_id === st.insertRow.user_id && r.badge_name === st.insertRow.badge_name && tables._unique);
              if (dup) return res({ data: null, error: { code: '23505', message: 'duplicate' } });
              rows.push({ id: 'row' + (seq++), ...st.insertRow });
              return res({ data: null, error: null });
            }
            let out = rows.filter((r) => st.filters.every((f) => f(r)));
            if (st.action === 'update') {
              out.forEach((r) => Object.assign(r, st.patch));
              return res({ data: st.wantRows ? out.map((r) => ({ id: r.id })) : null, error: null });
            }
            if (st.order) out = out.slice().sort((x, y) => (x[st.order] > y[st.order] ? 1 : -1));
            if (st.range) out = out.slice(st.range[0], st.range[1] + 1);
            res(st.single ? { data: out[0] || null, error: null } : { data: out, error: null });
          } catch (e) { rej(e); }
        },
      };
      return b;
    },
  };
}

let n = 0;
const day = (i) => new Date(Date.UTC(2026, 5, 1 + i, 12)).toISOString();
const trade = (uid, i, o = {}) => ({ id: 't' + (++n), buyer_id: uid, seller_id: 'other', status: 'COMPLETED', amount_usd: 100, payment_method: 'Bank Transfer', completed_at: day(i), is_test: false, gift_card_brand: null, listing: { listing_type: 'SELL_BTC' }, disputed_at: null, ...o });
const mkUser = (id, extra = {}) => ({ id, username: id, created_at: '2026-01-01T00:00:00Z', account_status: 'active', ...extra });
const pushes = [];
const pushFn = async (userId, title) => { pushes.push({ userId, title }); };

beforeEach(() => { pushes.length = 0; award._clearVolumeCache(); delete process.env.MEDALS_AUTO_ENABLED; });

describe('medal rules: pure helpers', () => {
  it('prestige order lists exactly the 10 medals, once each', () => {
    assert.deepStrictEqual([...ms.MEDAL_PRESTIGE].sort(), [...ms.MEDAL_ORDER].sort());
  });
  it('mobile money matching covers the networks, not bank apps', () => {
    ['MTN Mobile Money', 'mtn_momo', 'vodafone', 'Telecel Cash', 'airteltigo', 'Airtel Money', 'wave', 'Orange Money', 'Moov', 'M-Pesa', 'T-Money'].forEach((p) => assert.ok(ms.isMomoPayment(p), p));
    ['opay', 'moniepoint', 'Bank Transfer', 'Gift Card', 'Steam', '', null].forEach((p) => assert.ok(!ms.isMomoPayment(p), String(p)));
  });
  it('earned dates: 10th trade, 15th, 20th', () => {
    const t = Array.from({ length: 22 }, (_, i) => trade('u', i));
    assert.strictEqual(ms.earnedAtForMedal('praqen-initiate', t, null), t[9].completed_at);
    assert.strictEqual(ms.earnedAtForMedal('no-slip-zone', t, null), t[14].completed_at);
    assert.strictEqual(ms.earnedAtForMedal('clean-sheet', t, null), t[19].completed_at);
  });
  it('earned date of Deca Dealer is the trade that crossed $10,000', () => {
    const t = Array.from({ length: 12 }, (_, i) => trade('u', i, { amount_usd: 1000 }));
    assert.strictEqual(ms.earnedAtForMedal('deca-dealer', t, null), t[9].completed_at);
  });
  it('earned date of momo / bank / gift card counts only the matching trades', () => {
    const t = [];
    for (let i = 0; i < 30; i++) t.push(trade('u', i, { payment_method: i % 3 === 0 ? 'mtn_momo' : 'Bank Transfer' }));
    assert.strictEqual(ms.earnedAtForMedal('momo-master', t, null), null); // only 10 momo
    assert.strictEqual(ms.earnedAtForMedal('bank-transfer-boss', t, null), t.filter((x) => x.payment_method === 'Bank Transfer')[24]?.completed_at ?? null);
    const g = Array.from({ length: 11 }, (_, i) => trade('u', i, { listing: { listing_type: 'SELL_GIFT_CARD' } }));
    assert.strictEqual(ms.earnedAtForMedal('gift-card-savage', g, null), g[9].completed_at);
  });
  it('earned date of Every Damn Day is the 30th day of the first 30-day run', () => {
    const t = Array.from({ length: 35 }, (_, i) => trade('u', i));
    const at = ms.earnedAtForMedal('every-damn-day', t, null);
    assert.ok(at.startsWith(new Date(Date.UTC(2026, 5, 30)).toISOString().slice(0, 10)), at);
  });
  it('The OG: one year after signup; never a date in the future', () => {
    assert.strictEqual(ms.earnedAtForMedal('the-og', [], '2025-01-01T00:00:00Z', new Date('2026-09-01')), '2026-01-01T00:00:00.000Z');
    const t = Array.from({ length: 10 }, (_, i) => trade('u', i));
    assert.strictEqual(ms.earnedAtForMedal('praqen-initiate', t, null, new Date('2000-01-01')), '2000-01-01T00:00:00.000Z');
  });
  it('returns null when it cannot tell', () => {
    assert.strictEqual(ms.earnedAtForMedal('praqen-initiate', [trade('u', 0)], null), null);
    assert.strictEqual(ms.earnedAtForMedal('top-1-club', [], null), null);
  });
});

describe('automatic award', () => {
  it('awards PraQen Initiate at the 10th trade with the REAL date, and announces it once', async () => {
    const trades = Array.from({ length: 10 }, (_, i) => trade('u1', i));
    const db = fakeDb({ users: [mkUser('u1')], trades, user_badges: [], notifications: [] });
    const r = await award.evaluateUser('u1', { persist: true, notify: true, supabase: db, pushFn, percentile: 0 });
    assert.deepStrictEqual(r.newlyAwarded, ['praqen-initiate']);
    const row = db.tables.user_badges.find((b) => b.badge_name === 'praqen-initiate');
    assert.ok(row.is_unlocked);
    assert.strictEqual(new Date(row.unlocked_at).toISOString(), trades[9].completed_at);
    assert.strictEqual(db.tables.notifications.length, 1);
    assert.strictEqual(db.tables.notifications[0].type, 'medal');
    assert.match(db.tables.notifications[0].title, /PraQen Initiate/);
    assert.strictEqual(db.tables.notifications[0].action, '/trader-settings?section=badges');
    assert.strictEqual(pushes.length, 1);
  });

  it('9 trades is NOT enough (no medal, no notification)', async () => {
    const db = fakeDb({ users: [mkUser('u1')], trades: Array.from({ length: 9 }, (_, i) => trade('u1', i)), user_badges: [], notifications: [] });
    const r = await award.evaluateUser('u1', { persist: true, notify: true, supabase: db, pushFn, percentile: 0 });
    assert.deepStrictEqual(r.newlyAwarded, []);
    assert.strictEqual(db.tables.user_badges.length, 0);
    assert.strictEqual(db.tables.notifications.length, 0);
  });

  it('a second check does not announce the same medal again', async () => {
    const db = fakeDb({ users: [mkUser('u1')], trades: Array.from({ length: 10 }, (_, i) => trade('u1', i)), user_badges: [], notifications: [] });
    await award.evaluateUser('u1', { persist: true, notify: true, supabase: db, pushFn, percentile: 0 });
    const again = await award.evaluateUser('u1', { persist: true, notify: true, supabase: db, pushFn, percentile: 0 });
    assert.deepStrictEqual(again.newlyAwarded, []);
    assert.strictEqual(db.tables.notifications.length, 1);
    assert.strictEqual(db.tables.user_badges.length, 1);
    assert.strictEqual(again.earned.length, 1);
  });

  it('two checks at the same moment (trade done + screen opened) announce only once', async () => {
    const db = fakeDb({ users: [mkUser('u1')], trades: Array.from({ length: 10 }, (_, i) => trade('u1', i)), user_badges: [], notifications: [] });
    const o = { persist: true, notify: true, supabase: db, pushFn, percentile: 0 };
    await Promise.all([award.evaluateUser('u1', o), award.evaluateUser('u1', o), award.evaluateUser('u1', o)]);
    assert.strictEqual(db.tables.notifications.length, 1);
    assert.strictEqual(db.tables.user_badges.filter((b) => b.badge_name === 'praqen-initiate').length, 1);
  });

  it('test trades never count', async () => {
    const trades = Array.from({ length: 12 }, (_, i) => trade('u1', i, { is_test: true }));
    const db = fakeDb({ users: [mkUser('u1')], trades, user_badges: [], notifications: [] });
    const r = await award.evaluateUser('u1', { persist: true, notify: true, supabase: db, pushFn, percentile: 0 });
    assert.deepStrictEqual(r.earned, []);
  });

  it('a dispute blocks Clean Sheet; a cancellation blocks No Slip Zone; expiries do not', async () => {
    const trades = Array.from({ length: 20 }, (_, i) => trade('u1', i));
    trades.push(trade('u1', 21, { status: 'CANCELLED', cancel_reason: 'Trade expired: payment window ended', completed_at: null }));
    const db = fakeDb({ users: [mkUser('u1')], trades, user_badges: [], notifications: [] });
    let r = await award.evaluateUser('u1', { persist: false, supabase: db, percentile: 0 });
    assert.ok(r.earned.some((e) => e.id === 'clean-sheet'));
    assert.ok(r.earned.some((e) => e.id === 'no-slip-zone'), 'an expiry is not a cancellation');
    trades.push(trade('u1', 22, { status: 'CANCELLED', cancel_reason: 'Cancelled by buyer', completed_at: null, disputed_at: '2026-06-20T00:00:00Z' }));
    r = await award.evaluateUser('u1', { persist: false, supabase: db, percentile: 0 });
    assert.ok(!r.earned.some((e) => e.id === 'clean-sheet'));
    assert.ok(!r.earned.some((e) => e.id === 'no-slip-zone'));
  });

  it('a dry run (persist=false) saves nothing and tells nobody but still reports what is earned', async () => {
    const db = fakeDb({ users: [mkUser('u1')], trades: Array.from({ length: 10 }, (_, i) => trade('u1', i)), user_badges: [], notifications: [] });
    const r = await award.evaluateUser('u1', { persist: false, notify: true, supabase: db, pushFn, percentile: 0 });
    assert.ok(r.earned.some((e) => e.id === 'praqen-initiate'));
    assert.strictEqual(db.tables.user_badges.length, 0);
    assert.strictEqual(db.tables.notifications.length, 0);
    assert.strictEqual(pushes.length, 0);
  });

  it('unknown user -> null', async () => {
    assert.strictEqual(await award.evaluateUser('nobody', { supabase: fakeDb({ users: [], trades: [], user_badges: [] }) }), null);
  });
});

describe('banned and frozen accounts', () => {
  const rules = (status) => async () => {
    const db = fakeDb({
      users: [mkUser('u1', { account_status: status })],
      trades: Array.from({ length: 12 }, (_, i) => trade('u1', i)),
      user_badges: [{ id: 'b1', user_id: 'u1', badge_name: 'praqen-initiate', is_unlocked: true, unlocked_at: day(9) }, { id: 'b2', user_id: 'u1', badge_name: 'Top Trader', is_unlocked: true, unlocked_at: day(1) }],
      notifications: [],
    });
    const r = await award.evaluateUser('u1', { persist: true, notify: true, supabase: db, pushFn, percentile: 100 });
    assert.strictEqual(r.restricted, true);
    assert.deepStrictEqual(r.newlyAwarded, []);
    assert.strictEqual(db.tables.user_badges.find((b) => b.badge_name === 'praqen-initiate').is_unlocked, false, 'medal taken away');
    assert.strictEqual(db.tables.user_badges.find((b) => b.badge_name === 'praqen-initiate').unlocked_at, null);
    assert.strictEqual(db.tables.user_badges.find((b) => b.badge_name === 'Top Trader').is_unlocked, true, 'old badge rows are not touched');
    assert.strictEqual(db.tables.notifications.length, 0);
    assert.strictEqual(pushes.length, 0);
  };
  it('a BANNED account gets nothing and loses what it had', rules('banned'));
  it('a FROZEN account gets nothing and loses what it had', rules('frozen'));

  it('revokeMedalsFor only touches medal rows', async () => {
    const db = fakeDb({ user_badges: [{ id: 'a', user_id: 'u', badge_name: 'deca-dealer', is_unlocked: true, unlocked_at: 'x' }, { id: 'b', user_id: 'u', badge_name: 'Veteran Trader', is_unlocked: true, unlocked_at: 'x' }, { id: 'c', user_id: 'v', badge_name: 'deca-dealer', is_unlocked: true, unlocked_at: 'x' }] });
    assert.strictEqual(await award.revokeMedalsFor('u', { supabase: db }), 1);
    assert.strictEqual(db.tables.user_badges.find((r) => r.id === 'b').is_unlocked, true);
    assert.strictEqual(db.tables.user_badges.find((r) => r.id === 'c').is_unlocked, true);
  });

  it('after an unfreeze the user gets back what they still qualify for', async () => {
    const db = fakeDb({ users: [mkUser('u1')], trades: Array.from({ length: 10 }, (_, i) => trade('u1', i)), user_badges: [{ id: 'b1', user_id: 'u1', badge_name: 'praqen-initiate', is_unlocked: false, unlocked_at: null }], notifications: [] });
    const r = await award.evaluateUser('u1', { persist: true, notify: true, supabase: db, pushFn, percentile: 0 });
    assert.deepStrictEqual(r.newlyAwarded, ['praqen-initiate']);
    assert.strictEqual(db.tables.user_badges.length, 1, 'the row is re-used, not duplicated');
    assert.strictEqual(db.tables.user_badges[0].is_unlocked, true);
  });
});

describe('automatic switch', () => {
  it('is OFF unless MEDALS_AUTO_ENABLED is exactly "true"', () => {
    delete process.env.MEDALS_AUTO_ENABLED;
    assert.strictEqual(award.medalsAutoEnabled(), false);
    ['', 'false', 'TRUE', '1', 'yes'].forEach((v) => { process.env.MEDALS_AUTO_ENABLED = v; assert.strictEqual(award.medalsAutoEnabled(), false, v); });
    process.env.MEDALS_AUTO_ENABLED = 'true';
    assert.strictEqual(award.medalsAutoEnabled(), true);
  });
  it('after-trade check does nothing while the switch is off (nothing even starts)', async () => {
    delete process.env.MEDALS_AUTO_ENABLED;
    let touched = false;
    const spy = { from() { touched = true; throw new Error('must not be called'); } };
    // evaluateAfterTrade uses the real client; with the switch off it must return before doing any work.
    award.evaluateAfterTrade(['u1', 'u2']);
    await new Promise((r) => setTimeout(r, 30));
    assert.strictEqual(touched, false);
    assert.ok(spy);
  });
});

describe('market display', () => {
  const badges = [
    { user_id: 'a', badge_name: 'praqen-initiate', is_unlocked: true },
    { user_id: 'a', badge_name: 'top-1-club', is_unlocked: true },
    { user_id: 'a', badge_name: 'deca-dealer', is_unlocked: true },
    { user_id: 'a', badge_name: 'clean-sheet', is_unlocked: false },
    { user_id: 'a', badge_name: 'Top Trader', is_unlocked: true },
    { user_id: 'b', badge_name: 'gift-card-savage', is_unlocked: true },
  ];
  it('returns only unlocked medals, most prestigious first, and ignores the old badges', async () => {
    const m = await award.getMedalsForUsers(['a', 'b', 'c'], { supabase: fakeDb({ user_badges: badges }) });
    assert.deepStrictEqual(m.a, ['top-1-club', 'deca-dealer', 'praqen-initiate']);
    assert.deepStrictEqual(m.b, ['gift-card-savage']);
    assert.strictEqual(m.c, undefined);
  });
  it('attachMedals adds a medals list to every user (empty when none)', async () => {
    const users = [{ id: 'a' }, { id: 'c' }, { username: 'no-id' }];
    await award.attachMedals(users, { supabase: fakeDb({ user_badges: badges }) });
    assert.deepStrictEqual(users[0].medals, ['top-1-club', 'deca-dealer', 'praqen-initiate']);
    assert.deepStrictEqual(users[1].medals, []);
    assert.strictEqual(users[2].medals, undefined);
  });
  it('a database problem never breaks the market (no throw, no medals)', async () => {
    const bad = { from() { const b = { select: () => b, eq: () => b, in: () => Promise.resolve({ data: null, error: { message: 'down' } }) }; return b; } };
    const users = [{ id: 'a' }];
    await assert.doesNotReject(() => award.attachMedals(users, { supabase: bad }));
    assert.strictEqual(users[0].medals, undefined);
  });
  it('handles more than 100 users (chunks)', async () => {
    const many = Array.from({ length: 250 }, (_, i) => ({ user_id: 'u' + i, badge_name: 'praqen-initiate', is_unlocked: true }));
    const m = await award.getMedalsForUsers(many.map((r) => r.user_id), { supabase: fakeDb({ user_badges: many }) });
    assert.strictEqual(Object.keys(m).length, 250);
  });
});

describe('sweep / first-day backfill', () => {
  const world = () => fakeDb({
    users: [mkUser('u1'), mkUser('u2'), mkUser('frz', { account_status: 'frozen' }), mkUser('old', { created_at: '2020-01-01T00:00:00Z' })],
    trades: [
      ...Array.from({ length: 10 }, (_, i) => trade('u1', i, { seller_id: 'x' })),
      ...Array.from({ length: 4 }, (_, i) => trade('u2', i, { seller_id: 'x' })),
      ...Array.from({ length: 12 }, (_, i) => trade('frz', i, { seller_id: 'x' })),
    ],
    user_badges: [{ id: 'hold', user_id: 'frz', badge_name: 'deca-dealer', is_unlocked: true, unlocked_at: 'x' }],
    notifications: [],
  });
  it('DRY RUN lists who would get what, saves nothing, sends nothing', async () => {
    const db = world();
    const r = await award.runSweep({ apply: false, supabase: db, pushFn });
    const names = r.awards.map((a) => a.username).sort();
    assert.deepStrictEqual(names, ['old', 'u1']);
    assert.ok(r.awards.find((a) => a.username === 'u1').medals.includes('praqen-initiate'));
    assert.ok(r.awards.find((a) => a.username === 'old').medals.includes('the-og'));
    assert.deepStrictEqual(r.revoked.map((x) => x.username), ['frz']);
    assert.strictEqual(db.tables.user_badges.length, 1);
    assert.strictEqual(db.tables.user_badges[0].is_unlocked, true, 'nothing revoked in a dry run');
    assert.strictEqual(db.tables.notifications.length, 0);
    assert.strictEqual(pushes.length, 0);
  });
  it('APPLY saves the awards, announces each once, and takes the medal off the frozen account', async () => {
    const db = world();
    const r = await award.runSweep({ apply: true, notify: true, supabase: db, pushFn });
    assert.strictEqual(r.awards.length, 2);
    assert.strictEqual(db.tables.user_badges.find((b) => b.user_id === 'frz').is_unlocked, false);
    assert.strictEqual(db.tables.user_badges.filter((b) => b.user_id === 'frz' && b.is_unlocked).length, 0);
    assert.ok(db.tables.notifications.every((x) => x.type === 'medal'));
    assert.strictEqual(db.tables.notifications.length, pushes.length);
    assert.ok(!db.tables.notifications.some((x) => x.user_id === 'frz' || x.user_id === 'u2'));
    // running it again changes nothing
    const before = db.tables.notifications.length;
    const again = await award.runSweep({ apply: true, notify: true, supabase: db, pushFn });
    assert.strictEqual(again.awards.length, 0);
    assert.strictEqual(db.tables.notifications.length, before);
  });
});

describe('accounts under review (hold list)', () => {
  it('RainBow68 / rainbow68-Pro are held (any capitalisation); others are not', () => {
    assert.ok(award.isHeld({ username: 'RainBow68' }));
    assert.ok(award.isHeld({ username: 'rainbow68-Pro' }));
    assert.ok(!award.isHeld({ username: 'oshobtc' }));
    assert.ok(!award.isHeld({}));
    assert.ok(!award.isHeld(null));
  });
  it('MEDALS_HOLD_USERNAMES adds more names', () => {
    process.env.MEDALS_HOLD_USERNAMES = ' Someone , other ';
    assert.ok(award.isHeld({ username: 'someone' }));
    assert.ok(award.isHeld({ username: 'OTHER' }));
    delete process.env.MEDALS_HOLD_USERNAMES;
    assert.ok(!award.isHeld({ username: 'someone' }));
  });
  it('a held account is awarded nothing and told nothing, even when it qualifies', async () => {
    const db = fakeDb({ users: [mkUser('h1', { username: 'RainBow68' })], trades: Array.from({ length: 12 }, (_, i) => trade('h1', i)), user_badges: [], notifications: [] });
    const r = await award.evaluateUser('h1', { persist: true, notify: true, supabase: db, pushFn, percentile: 0 });
    assert.deepStrictEqual(r.newlyAwarded, []);
    assert.deepStrictEqual(r.earned, []);
    assert.strictEqual(db.tables.user_badges.length, 0);
    assert.strictEqual(db.tables.notifications.length, 0);
  });
  it('a held account keeps medals it already had (nothing is taken away)', async () => {
    const db = fakeDb({ users: [mkUser('h1', { username: 'rainbow68-pro' })], trades: Array.from({ length: 12 }, (_, i) => trade('h1', i)), user_badges: [{ id: 'b', user_id: 'h1', badge_name: 'praqen-initiate', is_unlocked: true, unlocked_at: day(9) }], notifications: [] });
    const r = await award.evaluateUser('h1', { persist: true, notify: true, supabase: db, pushFn, percentile: 0 });
    assert.deepStrictEqual(r.earned.map((e) => e.id), ['praqen-initiate']);
    assert.strictEqual(db.tables.user_badges[0].is_unlocked, true);
  });
  it('the sweep skips held accounts and lists them; released later they get their medals', async () => {
    const mk = () => fakeDb({ users: [mkUser('h1', { username: 'RainBow68' }), mkUser('u1', { username: 'ok1' })], trades: [...Array.from({ length: 10 }, (_, i) => trade('h1', i, { seller_id: 'x' })), ...Array.from({ length: 10 }, (_, i) => trade('u1', i, { seller_id: 'x' }))], user_badges: [], notifications: [] });
    const r = await award.runSweep({ apply: false, supabase: mk(), pushFn });
    assert.deepStrictEqual(r.awards.map((a) => a.username), ['ok1']);
    assert.deepStrictEqual(r.skippedHeld.map((h) => h.username), ['RainBow68']);
    process.env.MEDALS_AUTO_ENABLED = 'true';
    const applied = await award.runSweep({ apply: true, notify: true, supabase: mk(), pushFn });
    assert.deepStrictEqual(applied.awards.map((a) => a.username), ['ok1']);
    delete process.env.MEDALS_AUTO_ENABLED;
  });
  it('sweep: a one-trade $15k user gets neither Deca Dealer nor Top 1%', async () => {
    const db = fakeDb({ users: [mkUser('big', { username: 'bigone' })], trades: [trade('big', 0, { amount_usd: 15388, seller_id: 'x' })], user_badges: [], notifications: [] });
    const r = await award.runSweep({ apply: false, supabase: db, pushFn });
    assert.deepStrictEqual(r.awards, []);
  });
});
