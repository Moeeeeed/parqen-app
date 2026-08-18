// scripts/investigate-usdt-balances.js
// Read-only investigation: trace where the USDT balance on two flagged accounts
// (Iraqiy_Xchange, Lhord_Exchange) actually came from. Makes NO writes.
//
// Checks, per user: wallets/user_balances row, wallet_transactions (deposits/
// withdrawals/swaps logged in USDT), swap_transactions (BTC<->USDT swaps),
// trades that paid out in USDT, seller_deposits (locked USDT for gift-card
// selling), affiliate_earnings, balance_audit, admin_audit_log, and recent
// wallet-related notifications.
//
// Usage: node scripts/investigate-usdt-balances.js

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}
const db = createClient(SUPABASE_URL, SERVICE_KEY);

const TARGETS = ['Iraqiy_Xchange', 'Lhord_Exchange'];

function fmt(n) { return parseFloat(n || 0).toFixed(6); }

async function findUser(nameHint) {
  // Try exact username first, then a fuzzy ILIKE in case of case/spacing drift.
  let { data } = await db.from('users').select('*').eq('username', nameHint).maybeSingle();
  if (data) return data;
  const { data: fuzzy } = await db.from('users').select('*').ilike('username', `%${nameHint.replace(/[_\s]/g, '%')}%`).limit(5);
  if (fuzzy && fuzzy.length === 1) return fuzzy[0];
  if (fuzzy && fuzzy.length > 1) {
    console.log(`  ⚠️  Multiple fuzzy matches for "${nameHint}":`, fuzzy.map(u => u.username));
    return fuzzy[0];
  }
  return null;
}

async function investigate(nameHint) {
  console.log(`\n${'='.repeat(70)}\nINVESTIGATING: ${nameHint}\n${'='.repeat(70)}`);

  const user = await findUser(nameHint);
  if (!user) { console.log('  ❌ No matching user found in `users` table.'); return; }

  console.log(`  User: ${user.username}  (id=${user.id})`);
  console.log(`  Email: ${user.email}`);
  console.log(`  Created: ${user.created_at}`);
  console.log(`  is_admin=${user.is_admin}  is_moderator=${user.is_moderator}`);
  console.log(`  KYC: verified=${user.is_id_verified ?? user.kyc_verified}  status=${user.kyc_status || 'n/a'}`);

  const { data: wallet } = await db.from('wallets').select('*').eq('user_id', user.id).maybeSingle();
  console.log('\n  -- wallets row --');
  if (wallet) {
    console.log(`    balance_btc=${fmt(wallet.balance_btc)}  balance_usdt=${fmt(wallet.balance_usdt)}  locked_usdt=${fmt(wallet.locked_balance_usdt)}`);
    console.log(`    updated_at=${wallet.updated_at}  created_at=${wallet.created_at}`);
  } else console.log('    (no row)');

  const { data: ub } = await db.from('user_balances').select('*').eq('user_id', user.id).maybeSingle();
  console.log('\n  -- user_balances row (secondary balance store) --');
  if (ub) console.log(`    balance_btc=${fmt(ub.balance_btc)}  balance_usd=${fmt(ub.balance_usd)}`);
  else console.log('    (no row)');

  const { data: wtx } = await db.from('wallet_transactions').select('*').eq('user_id', user.id).order('created_at', { ascending: true });
  console.log(`\n  -- wallet_transactions (${wtx?.length || 0} rows) --`);
  (wtx || []).forEach(t => console.log(`    ${t.created_at} | ${t.type} | ${t.currency || 'BTC'} | btc=${fmt(t.amount_btc)} usdt=${fmt(t.amount_usdt)} | ${t.status} | tx=${t.tx_hash || '-'} | dest=${t.destination_address || '-'} | notes="${t.notes || ''}"`));
  if (!wtx || wtx.length === 0) console.log('    (none — no logged deposit, withdrawal, escrow lock/release, or sweep)');

  const { data: swaps } = await db.from('swap_transactions').select('*').eq('user_id', user.id).order('created_at', { ascending: true });
  console.log(`\n  -- swap_transactions (${swaps?.length || 0} rows) --`);
  (swaps || []).forEach(s => console.log(`    ${s.created_at} | ${s.from_currency}->${s.to_currency} | from=${s.from_amount} to=${s.to_amount} | rate=${s.rate} | fee=${s.fee_amount} | status=${s.status} | ref=${s.swap_ref}`));

  const { data: trades } = await db.from('trades').select('id,status,currency,amount_usdt,amount_btc,amount_usd,buyer_id,seller_id,created_at,updated_at').or(`buyer_id.eq.${user.id},seller_id.eq.${user.id}`).order('created_at', { ascending: true });
  console.log(`\n  -- trades involving this user (${trades?.length || 0} rows) --`);
  (trades || []).forEach(t => console.log(`    ${t.created_at} | id=${t.id.slice(0,8)} | status=${t.status} | currency=${t.currency || 'BTC'} | usdt=${fmt(t.amount_usdt)} btc=${fmt(t.amount_btc)} usd=${fmt(t.amount_usd)} | role=${t.buyer_id===user.id?'buyer':'seller'}`));

  const { data: sd } = await db.from('seller_deposits').select('*').eq('user_id', user.id).order('created_at', { ascending: true });
  console.log(`\n  -- seller_deposits (${sd?.length || 0} rows) --`);
  (sd || []).forEach(d => console.log(`    ${d.created_at} | amount_usdt=${fmt(d.amount_usdt)} remaining=${fmt(d.remaining_amount)} status=${d.status}`));

  let affiliate = [];
  try {
    const { data } = await db.from('affiliate_earnings').select('*').or(`referrer_id.eq.${user.id},referred_user_id.eq.${user.id}`).order('created_at', { ascending: true });
    affiliate = data || [];
  } catch (e) { console.log('  (affiliate_earnings query failed:', e.message, ')'); }
  console.log(`\n  -- affiliate_earnings (${affiliate.length} rows) --`);
  affiliate.forEach(a => console.log(`    ${a.created_at} | referrer=${a.referrer_id?.slice(0,8)} referred=${a.referred_user_id?.slice(0,8)} | commission_btc=${fmt(a.commission_btc)} | status=${a.status}`));

  const { data: bal_audit } = await db.from('balance_audit').select('*').eq('user_id', user.id).order('created_at', { ascending: true });
  console.log(`\n  -- balance_audit — BTC only per schema (${bal_audit?.length || 0} rows) --`);
  (bal_audit || []).forEach(a => console.log(`    ${a.created_at} | reason=${a.reason} | change_btc=${fmt(a.change_btc)} | new_balance=${fmt(a.new_balance)} | trade=${a.trade_id?.slice(0,8) || '-'}`));

  const { data: admin_log } = await db.from('admin_audit_log').select('*').eq('target_id', user.id).order('created_at', { ascending: true });
  console.log(`\n  -- admin_audit_log (${admin_log?.length || 0} rows) --`);
  (admin_log || []).forEach(a => console.log(`    ${a.created_at} | admin=${a.admin_id?.slice(0,8)} | action=${a.action} | details=${JSON.stringify(a.details)}`));

  const { data: notifs } = await db.from('notifications').select('type,title,message,created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(15);
  console.log(`\n  -- recent notifications (${notifs?.length || 0} rows, most recent first) --`);
  (notifs || []).forEach(n => console.log(`    ${n.created_at} | [${n.type}] ${n.title} — ${n.message}`));
}

(async () => {
  for (const name of TARGETS) await investigate(name);
  console.log('\nDone.');
})().catch(e => { console.error('Fatal error:', e.message); process.exit(1); });
