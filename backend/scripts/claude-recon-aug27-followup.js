// READ-ONLY follow-up. Closes 3 gaps in claude-recon-aug27-doublecredits.js:
//  (1) deposit_tracking_v2 real live columns (select *),
//  (2) SECOND independent blockchain source per full TXID (mempool.space + blockchair),
//  (3) tighter analysis: ukbuyer2022 partial-txid rows + topboy1 un-reversed Aug-24 dup.
// SELECT-only + public explorer GETs. NO insert/update/delete/rpc/reversal/deploy.
require('dotenv').config();
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY);
const f8 = n => Number(n || 0).toFixed(8);
const sleep = ms => new Promise(r => setTimeout(r, ms));

const USERS = ['king888', 'ukbuyer2022', 'messi_10', 'kingkong79-Pro', 'thetraderx', 'yornnguyen', 'topboy1', 'donrex'];

// full TXIDs from the first run (per user) for 2nd-source verification
const TXIDS = {
  king888: ['eea66cf8d0ebb7fc911400a40e1cf5e9cb5199eca8c903cbd1472ffc2dce7801', 'cc26732490c72447953859c640821a4b042851473121b9ee466265f888c49eec', '21d1781a052868deb0b918fd1df3d75ab5216dbe1819713dc7cb34d537e90ed6'],
  ukbuyer2022: ['69edf957e3bf4c3662bd579372d202bac773910e477230f7341268f8a52790f9', 'accf02f19a2a3713c7b2dad4fce4f17e110bcbcc149a170b7abb5e3dd00d0439', 'e123af79ab4ec7e1a78fa33d13e784757b62c0e5a6f8ee695f19a116c71561a8', 'c22d36bd0c36b655baf62cc9c4bfdb53a83daf3d1dfce82867384ed2d163e5c0', '3f131e63ea8b70d4e976718ca54474c60a1c753c534691ffbf6351aa3fd9960e', '03aa782aa08973e992e996bca13250f0d5b71c66eb3975a3d1cefe3d098d2783'],
  messi_10: ['aaf1a73787a67ea7fbc8eb56a7a9063fe09e7f003931411071f5d26b954f0a44'],
  'kingkong79-Pro': ['245c5cb4339d9cc12d1e9b8041b09d0b19f99553d843a52618ff2d17e424efe0', '022a23f40f932e6730f8ef6fce8a2de42c8041aec6b134f3bae4be2456e85989', '1b85b436f34191e886f9580be1e9da4d08870422f3c00eeda5c07624d3938879', '45d68c7748aff86c868cf4e8bca00a343f1957f060c70c1b1b4e44c0de431b55', '5b86f64b2712cb38cd22eef54c11547be1f69041c25f4afd809710628d1540ad', 'c16fe68d1827e0d38501987ecc3788df1cd4067829d590b95d1e7b3f48901451', '74d18b61ce2dbdd629f9b08c7a682f4b9c811d503ac22e1284e1739b8ed43263'],
  thetraderx: ['315ee4c54c053ef9a37da60c8c074a2224682c31c6546f3b65229ca692e73c56'],
  yornnguyen: ['198b3a1e60f14a18e57c897cf4124a7fdf1c434a54bc5007c2c1b9ba76415353', 'ce9b0e05cee2727222bfb4cf479235c16dee388b1a9481370043b4c1760c53eb'],
  topboy1: ['acad69325a56a9c50d712c03e30c2bc59196002d56e0ee82eedf1c648c3c4743', 'f6c8c7181fb9ea1dc1f5e6d27ccc3c65d5f34dff0babd2de188c471214d78719'],
  donrex: ['62de3da66c94120ab40664164af18faacc210c4569d351f1fcced0d623c2414a'],
};

async function mempool(txid) {
  try {
    const r = await axios.get('https://mempool.space/api/tx/' + txid, { timeout: 15000 });
    return { ok: true, time: r.data.status && r.data.status.block_time ? new Date(r.data.status.block_time * 1000).toISOString() : null, vout: (r.data.vout || []).map(o => ({ addr: o.scriptpubkey_address, v: o.value / 1e8 })) };
  } catch (e) { return { ok: false, err: (e.response && e.response.status) || e.message }; }
}
async function blockchair(txid) {
  try {
    const r = await axios.get('https://api.blockchair.com/bitcoin/dashboards/transaction/' + txid, { timeout: 15000 });
    const d = r.data && r.data.data && r.data.data[txid];
    if (!d) return { ok: false, err: 'no data' };
    return { ok: true, time: d.transaction && d.transaction.time, vout: (d.outputs || []).map(o => ({ addr: o.recipient, v: (o.value || 0) / 1e8 })) };
  } catch (e) { return { ok: false, err: (e.response && e.response.status) || e.message }; }
}
const recTo = (vout, addrs) => { const s = new Set(addrs); return (vout || []).filter(o => s.has(o.addr)).reduce((a, o) => a + o.v, 0); };

(async () => {
  console.log('READ-ONLY follow-up  ' + new Date().toISOString() + '  (no writes / no rpc)\n');

  // ---------- (1) deposit_tracking_v2 real schema + rows ----------
  console.log('='.repeat(90) + '\n(1) deposit_tracking_v2 — live table\n' + '='.repeat(90));
  try {
    const { data, error } = await supa.from('deposit_tracking_v2').select('*').limit(1000);
    if (error) console.log('  query error: ' + error.message);
    else {
      console.log('  total rows in table: ' + (data || []).length);
      if (data && data.length) console.log('  live columns: ' + Object.keys(data[0]).join(', '));
      const { data: users } = await supa.from('users').select('id, username').in('username', USERS.map(u => u));
      // usernames may be case-different; fetch broadly
      const { data: allU } = await supa.from('users').select('id, username').or(USERS.map(u => 'username.ilike.' + u).join(','));
      const idToName = {}; (allU || []).forEach(u => idToName[u.id] = u.username);
      const mine = (data || []).filter(r => idToName[r.user_id]);
      console.log('  rows for the 8 audited users: ' + mine.length);
      mine.forEach(r => console.log('   ' + idToName[r.user_id] + ' | ' + JSON.stringify(r)));
    }
  } catch (e) { console.log('  exception: ' + e.message); }

  // ---------- (2) second-source verification ----------
  console.log('\n' + '='.repeat(90) + '\n(2) SECOND-SOURCE on-chain verification (mempool.space + blockchair)\n' + '='.repeat(90));
  const { data: allU2 } = await supa.from('users').select('id, username').or(USERS.map(u => 'username.ilike.' + u).join(','));
  for (const uname of USERS) {
    const urow = (allU2 || []).find(x => x.username.toLowerCase() === uname.toLowerCase());
    if (!urow) { console.log('\n' + uname + ': user not found'); continue; }
    const { data: uw } = await supa.from('user_wallets').select('btc_address').eq('user_id', urow.id).maybeSingle();
    const { data: wal } = await supa.from('wallets').select('address').eq('user_id', urow.id).maybeSingle();
    const addrs = [uw && uw.btc_address, wal && wal.address].filter(Boolean);
    console.log('\n### ' + uname + '  addrs=' + addrs.join(','));
    for (const txid of (TXIDS[uname] || [])) {
      const m = await mempool(txid); await sleep(900);
      const b = await blockchair(txid); await sleep(1200);
      const mv = m.ok ? f8(recTo(m.vout, addrs)) : ('ERR ' + m.err);
      const bv = b.ok ? f8(recTo(b.vout, addrs)) : ('ERR ' + b.err);
      let agree = '';
      if (m.ok && b.ok) agree = (Math.abs(recTo(m.vout, addrs) - recTo(b.vout, addrs)) < 1e-8) ? '  AGREE' : '  <<< DISAGREE';
      console.log('  ' + txid.slice(0, 20) + '… | mempool=' + mv + ' (t=' + (m.time || '?') + ') | blockchair=' + bv + agree);
    }
  }

  // ---------- (3a) ukbuyer2022 tighter cross-match ----------
  console.log('\n' + '='.repeat(90) + '\n(3a) ukbuyer2022 — full Aug-27 DEPOSIT list + txid-prefix cross-match (any date)\n' + '='.repeat(90));
  {
    const urow = (allU2 || []).find(x => x.username.toLowerCase() === 'ukbuyer2022');
    const { data: rows } = await supa.from('wallet_transactions')
      .select('id, type, amount_btc, status, tx_hash, idempotency_key, description, notes, created_at')
      .eq('user_id', urow.id).order('created_at', { ascending: true });
    const btc = (rows || []).filter(r => true);
    const aug27deps = btc.filter(r => (r.type || '').toUpperCase() === 'DEPOSIT' && r.created_at >= '2026-08-27T00:00:00Z' && r.created_at < '2026-08-28T00:00:00Z');
    for (const d of aug27deps) {
      const km = (d.idempotency_key || '').match(/([0-9a-f]{64})/i);
      const dm = ((d.description || '') + ' ' + (d.notes || '')).match(/([0-9a-f]{8,64})/i);
      const txid = km ? km[1] : (dm ? dm[1] : null);
      console.log('\n  Aug-27 row ' + d.id + ' | ' + d.created_at + ' | ' + f8(d.amount_btc) + ' | ' + d.status + ' | txid=' + (txid || '?') + ' | ' + (d.description || ''));
      if (!txid) continue;
      const pfx = txid.slice(0, 8);
      btc.filter(r => r.id !== d.id).forEach(r => {
        const hay = ((r.tx_hash || '') + ' ' + (r.description || '') + ' ' + (r.notes || '') + ' ' + (r.idempotency_key || '')).toLowerCase();
        if (hay.includes(txid.toLowerCase()) || hay.includes(pfx.toLowerCase())) {
          const when = r.created_at < d.created_at ? 'BEFORE' : 'after';
          console.log('     [' + when + ' this row] ' + r.created_at + ' | ' + r.type + ' | ' + f8(r.amount_btc) + ' | ' + r.status + ' | key=' + (r.idempotency_key || '(none)') + ' | ' + (r.description || '').slice(0, 90));
        }
      });
    }
  }

  // ---------- (3b) topboy1 full deposit + dup-log check ----------
  console.log('\n' + '='.repeat(90) + '\n(3b) topboy1 — every DEPOSIT + SWEEP row (spot the un-reversed Aug-24 dup)\n' + '='.repeat(90));
  {
    const urow = (allU2 || []).find(x => x.username.toLowerCase() === 'topboy1');
    const { data: rows } = await supa.from('wallet_transactions')
      .select('id, type, amount_btc, status, idempotency_key, description, created_at')
      .eq('user_id', urow.id).in('type', ['DEPOSIT', 'SWEEP']).order('created_at', { ascending: true });
    (rows || []).forEach(r => console.log('  ' + r.created_at + ' | ' + r.type.padEnd(8) + ' | ' + f8(r.amount_btc) + ' | ' + r.status.padEnd(9) + ' | key=' + (r.idempotency_key || '(none)') + ' | ' + (r.description || '')));
    const confDep = (rows || []).filter(r => r.type === 'DEPOSIT' && ['CONFIRMED', 'COMPLETED'].includes(r.status.toUpperCase()));
    const sum = confDep.reduce((s, r) => s + Number(r.amount_btc || 0), 0);
    console.log('  --> CONFIRMED DEPOSIT rows: ' + confDep.length + ' | sum ' + f8(sum) + ' | on-chain ever received (from run 1) 0.01014756');
    console.log('  --> phantom = ' + f8(sum - 0.01014756) + ' (all DEPOSIT credits minus true single on-chain receipt)');
  }

  console.log('\n=== END follow-up — nothing written, no RPC, no deploy. ===');
})().then(() => process.exit(0)).catch(e => { console.error('FATAL', e.stack || e); process.exit(1); });
