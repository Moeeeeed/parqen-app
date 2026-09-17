// READ-ONLY. Why do these users have BTC/USDT locked? SELECT-only, no writes.
'use strict';
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY);
const f8 = n => Number(n || 0).toFixed(8);
const f2 = n => Number(n || 0).toFixed(2);
const NAMES = process.argv.slice(2).length ? process.argv.slice(2) : ['Ketamin1205', 'SprySole976', 'raufadams07'];

(async () => {
  for (const name of NAMES) {
    const { data: u } = await db.from('users').select('*').ilike('username', name).maybeSingle();
    console.log('\n' + '='.repeat(84));
    if (!u) { console.log('### ' + name + ' — NOT FOUND'); continue; }
    const uid = u.id;
    console.log('### ' + u.username + '  id=' + uid + '  email=' + u.email);
    console.log('    account_status=' + JSON.stringify(u.account_status) + '  created=' + String(u.created_at).slice(0, 10));
    ['frozen_at', 'freeze_reason', 'banned_at', 'ban_reason', 'token_version', 'has_warning', 'is_banned'].forEach(k => {
      if (u[k] !== undefined && u[k] !== null && u[k] !== false && u[k] !== 0) console.log('    ' + k + ' = ' + JSON.stringify(u[k]));
    });

    const { data: w } = await db.from('wallets').select('*').eq('user_id', uid).maybeSingle();
    console.log('  wallets : BTC avail=' + f8(w && w.balance_btc) + ' locked=' + f8(w && w.locked_balance_btc)
      + ' | USDT avail=' + f2(w && w.balance_usdt) + ' locked=' + f2(w && w.locked_balance_usdt) + ' | upd ' + (w && w.updated_at));

    const { data: el } = await db.from('escrow_locks').select('*').eq('seller_id', uid).order('locked_at', { ascending: false });
    const term = ['RELEASED', 'REFUNDED'];
    const elActive = (el || []).filter(e => !term.includes(e.status));
    console.log('  escrow_locks: total=' + (el || []).length + '  non-terminal=' + elActive.length);
    for (const e of elActive) {
      const { data: t } = await db.from('trades').select('trade_ref,status').eq('id', e.trade_id).maybeSingle();
      console.log('     ' + String(e.locked_at).slice(0, 19) + ' | ' + String(e.status).padEnd(10) + ' | ' + e.currency
        + ' | BTC ' + f8(e.amount_btc) + ' USDT ' + f2(e.amount_usdt) + ' | trade ' + String(e.trade_id).slice(0, 8)
        + ' (' + (t ? t.trade_ref + '/' + t.status : '??') + ') | released_at=' + (e.released_at || '-'));
    }
    const lockSumBtc = elActive.filter(e => (e.currency || 'BTC') === 'BTC').reduce((s, e) => s + Number(e.amount_btc || 0), 0);
    const lockSumUsdt = elActive.filter(e => (e.currency || '') === 'USDT').reduce((s, e) => s + Number(e.amount_usdt || 0), 0);
    console.log('     >>> non-terminal escrow_locks: BTC ' + f8(lockSumBtc) + ' / USDT ' + f2(lockSumUsdt)
      + '   vs wallets.locked  BTC ' + f8(w && w.locked_balance_btc) + ' / USDT ' + f2(w && w.locked_balance_usdt));

    const { data: tr } = await db.from('trades')
      .select('id,trade_ref,status,amount_btc,amount_usd,currency,fee_model,buyer_id,seller_id,created_at,cancel_reason,dispute_reason,disputed_at')
      .or('buyer_id.eq.' + uid + ',seller_id.eq.' + uid)
      .not('status', 'in', '(COMPLETED,CANCELLED,EXPIRED,REFUNDED)')
      .order('created_at', { ascending: false });
    console.log('  non-terminal trades (' + (tr || []).length + '):');
    (tr || []).forEach(t => console.log('     ' + String(t.created_at).slice(0, 19) + ' | ' + (t.trade_ref || t.id.slice(0, 8))
      + ' | ' + (t.seller_id === uid ? 'SELLER/provider' : 'BUYER') + ' | ' + f8(t.amount_btc) + 'BTC $' + t.amount_usd
      + ' | ' + t.status + ' | fee_model=' + (t.fee_model || '-') + ' | ' + String(t.dispute_reason || t.cancel_reason || '')));

    const { data: ba } = await db.from('balance_audit').select('*').eq('user_id', uid).order('created_at', { ascending: false }).limit(20);
    const holds = (ba || []).filter(r => /HOLD|CLAWBACK|ADMIN|CORRECTION|ADJUST|REVERS/i.test(r.reason || ''));
    console.log('  balance_audit HOLD/ADMIN/CORRECTION entries (' + holds.length + '):');
    holds.forEach(r => console.log('     ' + String(r.created_at).slice(0, 19) + ' | ' + r.reason + ' | change_btc=' + r.change_btc + ' | new_balance=' + r.new_balance + ' | trade=' + (r.trade_id || '-')));

    const { data: nt } = await db.from('notifications').select('created_at,title,message').eq('user_id', uid)
      .or('title.ilike.%hold%,title.ilike.%frozen%,title.ilike.%review%,title.ilike.%ban%,title.ilike.%suspend%')
      .order('created_at', { ascending: false }).limit(8);
    console.log('  hold/freeze notifications (' + (nt || []).length + '):');
    (nt || []).forEach(n => console.log('     ' + String(n.created_at).slice(0, 19) + ' | ' + n.title + ' | ' + String(n.message).slice(0, 100)));

    const { data: rf } = await db.from('reconciliation_flags').select('created_at,reason,currency,diff,status').eq('user_id', uid).order('created_at', { ascending: false }).limit(6);
    console.log('  reconciliation_flags (' + (rf || []).length + '):');
    (rf || []).forEach(r => console.log('     ' + String(r.created_at).slice(0, 19) + ' | ' + r.reason + ' | ' + r.currency + ' | diff=' + r.diff + ' | ' + r.status));
  }
})().then(() => process.exit(0)).catch(e => { console.error('FATAL', e.stack || e.message); process.exit(1); });
