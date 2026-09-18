// services/accountEnforcement.js
// PRAQEN — single place that applies / lifts an account restriction and cascades
// every side effect that must travel with it.
//
// Three account states this module understands:
//   'active'  — normal.
//   'frozen'  — FULL restriction, TEMPORARY and REVERSIBLE. No login, no trade /
//               offer / swap / withdraw / transfer. The user's live listings are
//               hidden from the marketplace (by the seller-status filter in
//               /api/listings and /api/offers — their DB status is left untouched
//               so unfreeze restores them automatically). Open trades are
//               escalated to DISPUTED for a moderator. Funds are NOT moved by the
//               freeze itself — a frozen balance simply can't be spent because
//               every spend path already runs requireNotBanned / isUserBanned.
//   'banned'  — FULL restriction, PERMANENT. Everything 'frozen' does, plus the
//               user's listings are terminated (status -> 'BANNED') and are NOT
//               brought back by /unban.
//
// IMPORTANT — this module never touches a balance, an escrow lock, or a pending
// withdrawal's funds. It only:
//   * flips users.account_status (+ bumps token_version to kill live sessions)
//   * flips listings.status  (ban only)
//   * flips trades.status -> DISPUTED for in-flight trades
//   * writes notifications / a trade system-message
//   * sends the "account banned" email (ban only; there is no frozen template)
// Anything that would move money (rejecting + refunding a pending withdrawal,
// releasing escrow) is deliberately left to the existing CEO / moderator flows,
// which are already blocked from paying out a restricted account by
// isUserBanned() in middleware/requireNotBanned.js.

'use strict';

const { createClient } = require('@supabase/supabase-js');
const emailService = require('./emailService');

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

const RESTRICTED = ['banned', 'frozen'];
const OPEN_TRADE_STATUSES = ['CREATED', 'FUNDS_LOCKED', 'PAYMENT_SENT'];
const TERMINAL_LISTING_STATUSES = ['DELETED', 'CANCELLED', 'BANNED'];

const norm = (s) => String(s || '').trim().toLowerCase();

// Some deployments have not run the account-enforcement migration yet, so
// token_version / banned_at / frozen_at / *_reason may not exist. Every write
// that references them is attempted, then retried without them if Postgres says
// the column is missing (42703) — same graceful-degradation shape already used
// by the /dispute route for disputed_by.
function isMissingColumn(error) {
  if (!error) return false;
  // 42703 = Postgres "undefined_column"; PGRST204 = PostgREST "column not found
  // in schema cache" (what a write to an unknown column actually returns).
  if (error.code === '42703' || error.code === 'PGRST204') return true;
  return /column .* does not exist|could not find the .* column/i.test(error.message || '');
}

async function loadUser(userId) {
  const { data, error } = await supabaseAdmin
    .from('users')
    .select('id, email, username, full_name, account_status, token_version')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw new Error(`accountEnforcement: user lookup failed — ${error.message}`);
  if (!data) throw new Error('accountEnforcement: user not found');
  return data;
}

// Flip users.account_status and, best-effort, bump token_version + stamp
// when/why. Returns the token_version actually written (or null if the column
// isn't there yet).
async function writeStatus(userId, newStatus, { reason, currentTokenVersion }) {
  const nowIso = new Date().toISOString();
  const nextTv = (Number(currentTokenVersion) || 0) + 1;

  const full = {
    account_status: newStatus,
    updated_at: nowIso,
    token_version: nextTv,
  };
  if (newStatus === 'banned') { full.banned_at = nowIso; full.ban_reason = reason || null; }
  else if (newStatus === 'frozen') { full.frozen_at = nowIso; full.freeze_reason = reason || null; }
  else if (newStatus === 'active') {
    full.banned_at = null; full.ban_reason = null;
    full.frozen_at = null; full.freeze_reason = null;
  }

  let { error } = await supabaseAdmin.from('users').update(full).eq('id', userId);
  if (!error) return nextTv;

  if (!isMissingColumn(error)) {
    throw new Error(`accountEnforcement: failed to set account_status — ${error.message}`);
  }

  // Retry path 1: keep token_version, drop the timestamp/reason columns.
  const withoutStamps = { account_status: newStatus, updated_at: nowIso, token_version: nextTv };
  ({ error } = await supabaseAdmin.from('users').update(withoutStamps).eq('id', userId));
  if (!error) return nextTv;
  if (!isMissingColumn(error)) {
    throw new Error(`accountEnforcement: failed to set account_status — ${error.message}`);
  }

  // Retry path 2: bare status only (pre-migration DB).
  ({ error } = await supabaseAdmin.from('users')
    .update({ account_status: newStatus, updated_at: nowIso }).eq('id', userId));
  if (error) throw new Error(`accountEnforcement: failed to set account_status — ${error.message}`);
  return null;
}

// Ban only: terminate the seller's live listings. Frozen listings are left
// alone (the marketplace seller-status filter hides them; unfreeze un-hides
// them with zero DB work).
async function terminateListings(userId) {
  const { data: live, error: readErr } = await supabaseAdmin
    .from('listings')
    .select('id, status')
    .eq('seller_id', userId);
  if (readErr) {
    console.error(`[accountEnforcement] listing lookup failed for ${userId.slice(0, 8)}:`, readErr.message);
    return 0;
  }
  const ids = (live || [])
    .filter(l => !TERMINAL_LISTING_STATUSES.includes(String(l.status || '').toUpperCase()))
    .map(l => l.id);
  if (ids.length === 0) return 0;

  const applyStatus = async (status) => supabaseAdmin
    .from('listings')
    .update({ status, updated_at: new Date().toISOString() })
    .in('id', ids)
    .select('id');

  let { data, error } = await applyStatus('BANNED');
  if (error && /violates check constraint|invalid input value|check constraint/i.test(error.message || '')) {
    // DB doesn't allow the 'BANNED' listing status — fall back to a universally
    // accepted value that still keeps the listing off the market.
    ({ data, error } = await applyStatus('inactive'));
  }
  if (error) {
    console.error(`[accountEnforcement] listing termination failed for ${userId.slice(0, 8)}:`, error.message);
    return 0;
  }
  return (data || []).length;
}

// Escalate every in-flight trade the user is part of to DISPUTED so a moderator
// resolves it — the user can no longer act on it themselves. No escrow / balance
// movement here: DISPUTED is a safe holding state the moderator tools already
// know how to settle.
async function escalateOpenTrades(userId, label, adminId) {
  const { data: trades, error } = await supabaseAdmin
    .from('trades')
    .select('id, buyer_id, seller_id, status, trade_ref')
    .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`)
    .in('status', OPEN_TRADE_STATUSES);
  if (error) {
    console.error(`[accountEnforcement] open-trade lookup failed for ${userId.slice(0, 8)}:`, error.message);
    return { disputed: 0, tradeIds: [] };
  }
  const toEscalate = (trades || []).filter(t => norm(t.status) !== 'disputed');
  const done = [];

  for (const t of toEscalate) {
    const payload = {
      status: 'DISPUTED',
      disputed_at: new Date().toISOString(),
      disputed_by: adminId || null,
      dispute_reason: `Auto-escalated: counterparty account ${label}. A moderator will review and settle this trade.`,
      expires_at: null,
    };
    let { error: uErr } = await supabaseAdmin.from('trades')
      .update(payload).eq('id', t.id).in('status', OPEN_TRADE_STATUSES);

    if (isMissingColumn(uErr)) {
      delete payload.disputed_by;
      ({ error: uErr } = await supabaseAdmin.from('trades')
        .update(payload).eq('id', t.id).in('status', OPEN_TRADE_STATUSES));
    }
    if (uErr) {
      console.error(`[accountEnforcement] could not escalate trade ${t.id.slice(0, 8)}:`, uErr.message);
      continue;
    }
    done.push(t.id);

    const other = t.buyer_id === userId ? t.seller_id : t.buyer_id;
    if (other) {
      await supabaseAdmin.from('notifications').insert({
        user_id: other, type: 'support',
        title: '⚠️ Trade Escalated to a Moderator',
        message: `Trade #${(t.trade_ref || t.id).toString().slice(0, 8)} has been moved to dispute because the other party's account was ${label}. A moderator will review it — no action is needed from you right now.`,
        action: `/trade/${t.id}`, is_read: false, created_at: new Date().toISOString(),
      }).catch(() => {});
    }
    await supabaseAdmin.from('messages').insert({
      trade_id: t.id, sender_id: null, recipient_id: null,
      message_text: `🚨 DISPUTE OPENED — a party's account was ${label}. Moderators notified.`,
      message_type: 'SYSTEM', sender_role: 'system', created_at: new Date().toISOString(),
    }).catch(() => {});
  }

  return { disputed: done.length, tradeIds: done };
}

// Look up (do NOT touch) the user's pending withdrawals so the caller can report
// them. They can't be paid out while the account is restricted — the CEO approve
// route re-checks isUserBanned() on the withdrawal owner before releasing — so
// this module leaves them exactly where they are for a CEO to reject/refund
// through the normal flow.
async function listPendingWithdrawals(userId) {
  const { data, error } = await supabaseAdmin
    .from('wallet_transactions')
    .select('id, currency, amount_btc, amount_usdt, status, created_at')
    .eq('user_id', userId)
    .eq('type', 'WITHDRAWAL')
    .eq('status', 'PENDING_APPROVAL');
  if (error) {
    console.error(`[accountEnforcement] pending-withdrawal lookup failed for ${userId.slice(0, 8)}:`, error.message);
    return [];
  }
  return data || [];
}

async function notifyUser(userId, state, reason) {
  const map = {
    banned: {
      title: '🚫 Account Banned',
      message: reason
        ? `Your PRAQEN account has been banned. Reason: ${reason}. Trading, offers, swaps and withdrawals are disabled. Contact support@praqen.com if you believe this is a mistake.`
        : 'Your PRAQEN account has been banned. Trading, offers, swaps and withdrawals are disabled. Contact support@praqen.com if you believe this is a mistake.',
    },
    frozen: {
      title: '❄️ Account Frozen',
      message: reason
        ? `Your PRAQEN account has been temporarily frozen while we review it. Reason: ${reason}. You won't be able to log in, trade, swap or withdraw until the review is complete. Your balance is safe. Contact support@praqen.com.`
        : `Your PRAQEN account has been temporarily frozen while we review it. You won't be able to log in, trade, swap or withdraw until the review is complete. Your balance is safe. Contact support@praqen.com.`,
    },
    active: {
      title: '✅ Account Reinstated',
      message: 'Your PRAQEN account restriction has been lifted. You may need to sign in again. Welcome back.',
    },
  };
  const n = map[state] || map.active;
  await supabaseAdmin.from('notifications').insert({
    user_id: userId, type: 'security', title: n.title, message: n.message,
    action: '/', is_read: false, created_at: new Date().toISOString(),
  }).catch(() => {});
}

// ── Public API ───────────────────────────────────────────────────────────────

// Apply a restriction. state must be 'banned' or 'frozen'.
async function setAccountState(userId, state, { reason = '', adminId = null } = {}) {
  const target = norm(state);
  if (!RESTRICTED.includes(target)) {
    throw new Error(`setAccountState: state must be 'banned' or 'frozen' (got '${state}')`);
  }

  const user = await loadUser(userId);
  const previousStatus = norm(user.account_status) || 'active';

  const tokenVersion = await writeStatus(userId, target, {
    reason, currentTokenVersion: user.token_version,
  });

  const label = target === 'banned' ? 'banned' : 'frozen';

  const listingsTerminated = target === 'banned' ? await terminateListings(userId) : 0;
  const { disputed, tradeIds } = await escalateOpenTrades(userId, label, adminId);
  const pendingWithdrawals = await listPendingWithdrawals(userId);

  await notifyUser(userId, target, reason);

  if (target === 'banned' && user.email) {
    emailService.sendAccountBannedEmail(user, reason).catch(() => {});
  }

  console.log(`[accountEnforcement] ${label.toUpperCase()} ${userId.slice(0, 8)} by ${adminId ? adminId.slice(0, 8) : 'system'} — listings:${listingsTerminated} disputed:${disputed} pendingWithdrawals:${pendingWithdrawals.length}${tokenVersion == null ? ' (token_version column missing — live sessions NOT invalidated until migration runs)' : ''}`);

  return {
    success: true,
    state: target,
    previousStatus,
    tokenVersion,
    listingsTerminated,
    tradesDisputed: disputed,
    disputedTradeIds: tradeIds,
    pendingWithdrawals,
  };
}

// Lift a restriction. toState is 'active' (the only supported target for now).
// Ban -> active is "unban": listings stay terminated (permanent), only login is
// reinstated. Frozen -> active is "unfreeze": listings were never touched, so
// they return to the marketplace on their own.
async function clearAccountState(userId, { adminId = null } = {}) {
  const user = await loadUser(userId);
  const previousStatus = norm(user.account_status) || 'active';

  if (!RESTRICTED.includes(previousStatus)) {
    // Already unrestricted — make it idempotent, don't error.
    return { success: true, state: 'active', previousStatus, tokenVersion: null, noop: true };
  }

  const tokenVersion = await writeStatus(userId, 'active', {
    reason: null, currentTokenVersion: user.token_version,
  });

  await notifyUser(userId, 'active');

  console.log(`[accountEnforcement] CLEAR (${previousStatus} -> active) ${userId.slice(0, 8)} by ${adminId ? adminId.slice(0, 8) : 'system'}`);

  return {
    success: true,
    state: 'active',
    previousStatus,
    tokenVersion,
    // Disputed trades are intentionally left for a moderator to settle; unban
    // does not auto-restore terminated listings.
    note: previousStatus === 'banned'
      ? 'Login reinstated. Terminated listings are NOT restored; open disputes remain with moderators.'
      : 'Full access restored. Listings reappear in the marketplace automatically; open disputes remain with moderators.',
  };
}

module.exports = { setAccountState, clearAccountState, RESTRICTED };
