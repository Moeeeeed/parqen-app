// routes/hdWalletRoutes.js
// PRAQEN — HD Wallet API Endpoints (Production Ready)
// All endpoints the Wallet.jsx frontend needs

require('dotenv').config();
const express           = require('express');
const router            = express.Router();
const actionCodeService = require('../services/actionCodeService');
const emailService           = require('../services/emailService');
const hdWallet               = require('../services/hdWalletService');
const depositMonitor         = require('../services/depositMonitor');
const tronHotWallet          = require('../services/tronHotWallet');
const realtimeDepositService = require('../services/realtimeDepositService');
const { updateOfferStatus }  = require('../services/offerStatusService');
const { sendTelegramAlert }  = require('../services/telegramService');
const { createClient } = require('@supabase/supabase-js');
const rateLimit = require('express-rate-limit');
const { requireNotBanned, isUserBanned } = require('../middleware/requireNotBanned');
const { getClientIp, isLockedOut, LOCKOUT_THRESHOLD } = require('../services/securityLogService');
const { calcWithdrawalFeeUsd } = require('../services/withdrawalFeeService');

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

// Break-glass fallback for CEO-only withdrawal approvals — mirrors the
// ADMIN_EMAIL fallback in server.js so the founder account is never locked
// out of approvals even before is_ceo is set on any user row.
const ADMIN_EMAIL = 'support@praqen.com';

// On-chain sends are irreversible — cap attempts independent of balance checks,
// which are vulnerable to a check-then-act race if hit rapidly in parallel.
const sendLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many withdrawal attempts. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ── Auth middleware — reads token from Authorization header ──────────────────
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('❌ JWT_SECRET not set — refusing to start hdWalletRoutes with an insecure fallback secret');
}

function verifyToken(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// ── Live BTC price helper — cached 60 s so polling doesn't hammer external APIs ─
let _btcPriceCache = { price: 88000, ts: 0 };
async function getLiveBtcPrice() {
    if (Date.now() - _btcPriceCache.ts < 60000) return _btcPriceCache.price;
    try {
        const r = await fetch('https://api.coinbase.com/v2/prices/BTC-USD/spot');
        const d = await r.json();
        const p = parseFloat(d.data.amount);
        if (p > 0) { _btcPriceCache = { price: p, ts: Date.now() }; return p; }
    } catch { /* fall through */ }
    try {
        const r = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd');
        const d = await r.json();
        const p = parseFloat(d.bitcoin?.usd);
        if (p > 0) { _btcPriceCache = { price: p, ts: Date.now() }; return p; }
    } catch { /* fall through */ }
    return _btcPriceCache.price; // return last known price rather than hard-coded fallback
}

// ── Withdrawal fee — tiered by USD value (see services/withdrawalFeeService.js),
// additive (added on top, receiver gets the full requested amount) — returns
// { feeUsd, feeBtc, label }. Changed from deductive 1.2% -> flat 2.2% additive
// on 2026-09-17, then to this tiered structure on 2026-09-27.
function calcWithdrawalFee(amountBtc, btcPrice) {
  const amountUsd = Math.round(amountBtc * btcPrice * 100) / 100;
  const { feeUsd, label } = calcWithdrawalFeeUsd(amountUsd);
  const feeBtc = parseFloat((feeUsd / btcPrice).toFixed(8));
  return { feeUsd, feeBtc, label };
}

// ============================================================
// GET /api/hd-wallet/wallet
// Returns user's BTC address + balance
// Called by Wallet.jsx on load
// ============================================================
// ── Auto-heal orphaned escrow locks ──────────────────────────────────────────
// Finds escrow_locks WHERE status='LOCKED' but the trade is already CANCELLED or COMPLETED.
// 5-minute cooldown per user so wallet auto-polling does not hammer the DB.
const _healCooldown = {};
async function autoHealOrphanedEscrows(userId) {
    const now = Date.now();
    if (_healCooldown[userId] && now - _healCooldown[userId] < 5 * 60 * 1000) return 0;
    _healCooldown[userId] = now;
    try {
        const { data: locks } = await supabaseAdmin
            .from('escrow_locks')
            .select('id, trade_id, amount_btc')
            .eq('seller_id', userId)
            .eq('status', 'LOCKED');

        if (!locks || locks.length === 0) return 0;

        // Batch-fetch every lock's trade in one round trip instead of one query per
        // lock — with several stale locks this loop was the wallet page's slowest
        // part, doing N sequential DB round trips before the wallet data even loaded.
        const { data: tradesData } = await supabaseAdmin
            .from('trades').select('id, status, fee_model, platform_fee_btc').in('id', locks.map(l => l.trade_id));
        const tradeById = new Map((tradesData || []).map(t => [t.id, t]));

        let healed = 0;
        for (const lock of locks) {
            const trade = tradeById.get(lock.trade_id);

            if (!trade) continue;
            // Only auto-refund when the trade is definitively over
            if (!['CANCELLED', 'COMPLETED'].includes(trade.status)) continue;

            // lock.amount_btc is the trade amount. Additive-fee trades locked
            // (amount + fee), so the reserve to unwind is amount + platform_fee_btc.
            const baseAmount = parseFloat(lock.amount_btc || 0);
            const amount = trade.fee_model === 'additive'
                ? parseFloat((baseAmount + parseFloat(trade.platform_fee_btc || 0)).toFixed(8))
                : baseAmount;
            if (amount <= 0) continue;

            console.log(`[AutoHeal] Orphaned escrow found — trade=${lock.trade_id.slice(0,8)} status=${trade.status} amount=${amount} — refunding to ${userId.slice(0,8)}`);

            // Claim the lock first (atomic — prevents double-refund)
            const { data: claimed } = await supabaseAdmin
                .from('escrow_locks')
                .update({ status: 'REFUNDING', released_at: new Date().toISOString() })
                .eq('id', lock.id)
                .eq('status', 'LOCKED')
                .select('id');

            if (!claimed || claimed.length === 0) continue; // already claimed by another request

            // Try atomic DB function first
            const { error: rpcErr } = await supabaseAdmin.rpc('praqen_refund_escrow', {
                p_trade_id:    lock.trade_id,
                p_provider_id: userId,
                p_amount_btc:  amount,
                p_reason:      `Auto-heal: escrow orphaned after trade ${trade.status}`,
            });

            if (rpcErr) {
                // RPC unavailable — manually credit balance_btc, debit locked_balance_btc
                console.warn(`[AutoHeal] RPC failed (${rpcErr.message}), applying manual refund`);

                const { data: bb } = await supabaseAdmin
                    .from('wallets').select('balance_btc, locked_balance_btc').eq('user_id', userId).single();
                const newAvail  = parseFloat((parseFloat(bb?.balance_btc || 0) + amount).toFixed(8));
                const newLocked = parseFloat((Math.max(0, parseFloat(bb?.locked_balance_btc || 0) - amount).toFixed(8)));

                await Promise.all([
                    supabaseAdmin.from('wallets').update({
                        balance_btc:        newAvail,
                        locked_balance_btc: newLocked,
                        updated_at:         new Date().toISOString(),
                    }).eq('user_id', userId),
                    supabaseAdmin.from('escrow_locks').update({ status: 'REFUNDED', released_at: new Date().toISOString() }).eq('id', lock.id),
                    supabaseAdmin.from('wallet_transactions').insert({
                        user_id:    userId,
                        type:       'ESCROW_REFUND',
                        amount_btc: amount,
                        status:     'CONFIRMED',
                        notes:      `Auto-heal refund — trade #${lock.trade_id.slice(0,8)} (${trade.status})`,
                        created_at: new Date().toISOString(),
                    }),
                ]);
            } else {
                // RPC ran — sync locked_balance_btc in case the DB function doesn't manage it
                console.log(`[AutoHeal] RPC refund OK — ₿${amount} restored to ${userId.slice(0,8)}`);
                const { data: bb } = await supabaseAdmin
                    .from('wallets').select('locked_balance_btc').eq('user_id', userId).single();
                const syncLocked = parseFloat((Math.max(0, parseFloat(bb?.locked_balance_btc || 0) - amount).toFixed(8)));
                await supabaseAdmin.from('wallets')
                    .update({ locked_balance_btc: syncLocked, updated_at: new Date().toISOString() })
                    .eq('user_id', userId).then(null, () => {});
            }

            await supabaseAdmin.from('notifications').insert({
                user_id:    userId,
                type:       'wallet',
                title:      '₿ Escrow Refunded',
                message:    `₿${amount.toFixed(8)} has been automatically returned to your wallet from a previously stuck trade.`,
                action:     '/wallet',
                is_read:    false,
                created_at: new Date().toISOString(),
            }).then(null, () => {});

            healed++;
        }

        if (healed > 0) console.log(`[AutoHeal] Restored ${healed} orphaned escrow(s) for ${userId.slice(0,8)}`);
        return healed;
    } catch (err) {
        console.error('[AutoHeal] Error:', err.message);
        return 0;
    }
}

router.get('/wallet', verifyToken, async (req, res) => {
    try {
        const userId = req.userId;
        console.log(`[Wallet] === loading wallet for userId=${userId} ===`);

        // Auto-heal orphaned escrow locks before reading balance
        await autoHealOrphanedEscrows(userId);

        // ── SINGLE SOURCE OF TRUTH: wallets table only ──────────────────────────
        // All four reads below are independent of each other — run them in one
        // round trip instead of four sequential ones (was the other big chunk of
        // wallet page load time, on top of the autoHealOrphanedEscrows N+1 above).
        const [
            { data: walletRow, error: walletErr },
            liveBtcPrice,
            { data: uwRow },
            { data: txs },
        ] = await Promise.all([
            supabaseAdmin.from('wallets').select('balance_btc, locked_balance_btc, balance_usdt, locked_balance_usdt').eq('user_id', userId).single(),
            getLiveBtcPrice(),
            supabaseAdmin.from('user_wallets').select('btc_address').eq('user_id', userId).maybeSingle(),
            supabaseAdmin
                .from('wallet_transactions')
                .select('id, type, status, currency, amount_btc, amount_usdt, tx_hash, notes, created_at')
                .eq('user_id', userId)
                .not('type', 'in', '(SWEEP,RESERVE_SWEEP,RESERVE_TOPUP)')  // internal platform operations — never shown to users
                .order('created_at', { ascending: false })
                .limit(50),
        ]);

        let activeWallet = walletRow;
        if (!activeWallet) {
            console.log(`[Wallet] No wallet row found for user ${userId} — provisioning wallet...`);
            try {
                await hdWallet.ensureWalletExists(userId);
                const { data: newWallet } = await supabaseAdmin
                    .from('wallets')
                    .select('balance_btc, locked_balance_btc, balance_usdt, locked_balance_usdt')
                    .eq('user_id', userId)
                    .maybeSingle();
                activeWallet = newWallet || { balance_btc: 0, locked_balance_btc: 0, balance_usdt: 0, locked_balance_usdt: 0 };
            } catch (wInitErr) {
                console.warn(`[Wallet] ensureWalletExists fallback:`, wInitErr.message);
                activeWallet = { balance_btc: 0, locked_balance_btc: 0, balance_usdt: 0, locked_balance_usdt: 0 };
            }
        }

        const available_btc = parseFloat(activeWallet.balance_btc || 0);
        const locked_btc    = parseFloat(activeWallet.locked_balance_btc || 0);
        const total_btc     = parseFloat((available_btc + locked_btc).toFixed(8));
        const balance_usd   = parseFloat((total_btc * liveBtcPrice).toFixed(2));

        console.log(`[Wallet] user=${userId.slice(0,8)} avail=${available_btc} locked=${locked_btc} total=${total_btc} price=${liveBtcPrice} usd=${balance_usd}`);

        // BTC deposit address — from user_wallets or users table (display only, NOT for balance)
        let address = uwRow?.btc_address || null;
        if (!address) {
            const { data: userRow } = await supabaseAdmin
                .from('users').select('bitcoin_wallet_address').eq('id', userId).single();
            address = userRow?.bitcoin_wallet_address || null;
        }

        res.json({
            success:      true,
            address,
            balance_btc:  total_btc,
            available_btc,
            locked_btc,
            balance_usd,
            balance_usdt:        parseFloat(activeWallet?.balance_usdt || 0),
            locked_balance_usdt: parseFloat(activeWallet?.locked_balance_usdt || 0),
            btc_price:    liveBtcPrice,
            network:      process.env.HD_NETWORK || 'mainnet',
            has_address:  !!address,
            transactions: txs || [],
        });
    } catch (error) {
        console.error('[Wallet] FATAL ERROR:', error.message, error.stack);
        res.status(500).json({ error: 'Failed to load wallet. Please try again.' });
    }
});

// ============================================================
// POST /api/hd-wallet/generate-address
// Force-generate or regenerate user's BTC address
// ============================================================
router.post('/generate-address', verifyToken, async (req, res) => {
  try {
    const userId  = req.userId;
    const addrData = hdWallet.generateUserAddress(userId);

    // Save to BOTH tables so deposit monitor, wallet page, and escrow all
    // read the same HD-wallet-controlled address. Saving only to users caused
    // user_wallets to keep the old Coinbase CDP address, which Coinbase sweeps.
    await Promise.all([
      supabaseAdmin.from('users').update({
        bitcoin_wallet_address: addrData.address,
        updated_at: new Date().toISOString(),
      }).eq('id', userId),

      supabaseAdmin.from('user_wallets').upsert({
        user_id:          userId,
        btc_address:      addrData.address,
        last_onchain_btc: 0,   // fresh address — no on-chain history yet
        updated_at:       new Date().toISOString(),
      }, { onConflict: 'user_id' }),
    ]);

    console.log(`[hdWalletRoutes] HD address saved for ${userId.slice(0,8)}: ${addrData.address}`);

    // Subscribe new address to real-time WebSocket monitor immediately
    realtimeDepositService.subscribeAddress(userId, addrData.address);

    res.json({
      success:  true,
      address:  addrData.address,
      network:  addrData.network,
      message:  'Your unique Bitcoin deposit address is ready',
    });

  } catch (error) {
    console.error('[hdWalletRoutes POST /generate-address]', error.message);
    res.status(500).json({ error: 'Failed to generate address. Please try again.' });
  }
});

// ============================================================
// GET /api/hd-wallet/balance
// Returns live balance from mempool + DB balance
// ============================================================
router.get('/balance', verifyToken, async (req, res) => {
  try {
    const userId = req.userId;

    const { data: user } = await supabaseAdmin
      .from('users')
      .select('bitcoin_wallet_address')
      .eq('id', userId)
      .single();

    if (!user?.bitcoin_wallet_address) {
      return res.json({ success: true, balance_btc: 0, confirmed_btc: 0, unconfirmed_btc: 0 });
    }

    // Live mempool balance
    const live = await hdWallet.checkBalance(user.bitcoin_wallet_address);

    // DB balance
    const { data: bal } = await supabaseAdmin
      .from('user_balances')
      .select('balance_btc')
      .eq('user_id', userId)
      .single();

    res.json({
      success:          true,
      address:          user.bitcoin_wallet_address,
      balance_btc:      parseFloat(bal?.balance_btc || 0),   // DB tracked balance
      confirmed_btc:    live.confirmed_btc,                   // live from mempool
      unconfirmed_btc:  live.unconfirmed_btc,
      network:          hdWallet.getNetwork(),
    });

  } catch (error) {
    console.error('[hdWalletRoutes GET /balance]', error.message);
    res.status(500).json({ error: 'Failed to load balance. Please try again.' });
  }
});

// Per-user cooldown map for BTC deposit checks (15 seconds)
const userBtcScanCooldown = new Map();

// ============================================================
// POST /api/hd-wallet/check-deposit
// Manually trigger deposit check for this user
// Called when user clicks "Check for New Payments"
// ============================================================
router.post('/check-deposit', verifyToken, async (req, res) => {
  try {
    const lastScan = userBtcScanCooldown.get(req.userId) || 0;
    const now = Date.now();
    if (now - lastScan < 15000) {
      const remainingSec = Math.ceil((15000 - (now - lastScan)) / 1000);
      return res.status(429).json({ error: `Please wait ${remainingSec}s before checking again.` });
    }
    userBtcScanCooldown.set(req.userId, now);

    const result = await depositMonitor.checkAddressNow(req.userId);

    // Deposit may have changed balance — re-evaluate offer status (fire and forget)
    updateOfferStatus(req.userId).catch(() => {});

    res.json({
      success:     true,
      balance_btc: result.balance_btc,
      address:     result.address,
      message:     result.balance_btc > 0
        ? `Balance: ${result.balance_btc.toFixed(8)} BTC`
        : 'No confirmed deposits yet. Confirmations take 10–60 minutes.',
    });

  } catch (error) {
    console.error('[hdWalletRoutes POST /check-deposit]', error.message);
    res.status(500).json({ error: 'Deposit check failed. Please try again.' });
  }
});

// ============================================================
// POST /api/hd-wallet/send
// Send BTC from user's PRAQEN wallet to any external address
// (Withdrawal)
// ============================================================
// Pause seller's SELL listings when their BTC balance hits zero.
async function pauseSellOffersIfEmpty(sellerId) {
  try {
    const { data: bal } = await supabaseAdmin
      .from('wallets').select('balance_btc').eq('user_id', sellerId).maybeSingle();
    if (parseFloat(bal?.balance_btc || 0) > 0.000001) return;

    const { data: paused } = await supabaseAdmin
      .from('listings')
      .update({ status: 'PAUSED', updated_at: new Date().toISOString() })
      .eq('seller_id', sellerId).eq('status', 'ACTIVE')
      .in('listing_type', ['SELL', 'SELL_BITCOIN']).select('id');

    if (paused && paused.length > 0) {
      console.log(`⏸ [AutoPause] ${paused.length} sell offer(s) paused after withdrawal — ${sellerId.slice(0,8)}`);
      await supabaseAdmin.from('notifications').insert({
        user_id: sellerId, type: 'wallet',
        title: '⏸ Sell Offers Paused',
        message: `Your sell offer${paused.length > 1 ? 's have' : ' has'} been paused because your Bitcoin balance is now empty. Top up to reactivate.`,
        action: '/wallet', is_read: false, created_at: new Date().toISOString(),
      });
    }
  } catch (err) { console.error('[pauseSellOffersIfEmpty withdrawal]', err.message); }
}

// Logs + flags (never throws) a failed BTC company-fee credit from the CEO
// withdrawal-approve route. Shared by both call sites (force-approved/queued
// and confirmed/broadcast) so the check can't drift out of sync between them.
// Deliberately non-throwing — this always runs after the withdrawal itself has
// already succeeded/broadcast, and a fee-crediting failure must never be able
// to affect that already-committed outcome.
async function flagCompanyFeeCreditFailureIfAny(walletFeeResult, mirrorFeeResult, newCompanyBalance, context) {
  if (walletFeeResult?.error) {
    console.error(`🚨 [${context}] company wallet fee credit FAILED — needs manual reconciliation:`, walletFeeResult.error.message);
    await supabaseAdmin.from('reconciliation_flags').insert({
      user_id: COMPANY_WALLET_ID, currency: 'BTC', source_table: 'wallets',
      authoritative_value: newCompanyBalance, mirror_value: null, diff: null,
      reason: 'SYNC_FAILURE', status: 'RECONCILIATION_REQUIRED',
      detail: { context, error: walletFeeResult.error.message },
    }).then(null, e => console.error(`🚨 [${context}] also failed to write reconciliation_flags:`, e.message));
  }
  if (mirrorFeeResult?.error) {
    console.error(`🚨 [${context}] company fee mirror sync (user_balances) FAILED:`, mirrorFeeResult.error.message);
  }
}

router.post('/send', verifyToken, requireNotBanned, sendLimiter, async (req, res) => {
  // Emergency kill-switch — SENDS_DISABLED=true in .env blocks external
  // withdrawals platform-wide without touching trading/internal transfers.
  // Checked in-process (not DB-backed) so it works even if Supabase is down.
  if (process.env.SENDS_DISABLED === 'true') {
    return res.status(503).json({
      error: 'Withdrawals are temporarily disabled for maintenance. Trading and internal transfers are unaffected — please try again later.',
    });
  }
  // Hoisted above the try block so the catch block below can actually see them —
  // `const`/destructured bindings declared inside `try {}` are NOT visible inside
  // the paired `catch (error) {}` (separate block scopes); referencing them there
  // previously threw ReferenceError instead of returning the intended error JSON.
  let toAddress, amount, available, sendUser, platformFee, platformFeeUsd,
      feeLabel, amountUserReceives, deducted = false, newBalance;
  try {
    const { toAddress: rawAddress, amountBtc, actionCode } = req.body;
    toAddress = (rawAddress || '').trim();
    const userId = req.userId;

    if (!toAddress || !amountBtc || parseFloat(amountBtc) <= 0) {
      return res.status(400).json({ error: 'Invalid address or amount' });
    }

    // SECURITY: Mainnet-only address check.
    // tb1 / m / n / 2 are TESTNET prefixes — sending real BTC there = permanent loss.
    const MAINNET_ADDRESS_RE = /^(bc1[a-zA-Z0-9]{25,87}|[13][a-zA-HJ-NP-Z1-9]{25,34})$/;
    if (!MAINNET_ADDRESS_RE.test(toAddress)) {
      return res.status(400).json({
        error: 'Invalid Bitcoin address. Only mainnet addresses are accepted (bc1..., 1..., 3...). Testnet addresses are blocked.',
      });
    }

    amount = parseFloat(amountBtc);

    // ── 2-verification required to send BTC out (external only) ─────────────
    // Internal PRAQEN-to-PRAQEN transfers remain free with 1 verification.
    // We check after resolving the destination so internal transfers aren't blocked.

    // ── Check if destination is a PRAQEN user address (internal transfer) ──
    const { data: internalWallet } = await supabaseAdmin
      .from('user_wallets')
      .select('user_id')
      .eq('btc_address', toAddress.trim())
      .single();

    if (internalWallet && internalWallet.user_id !== userId) {
      // ── INTERNAL TRANSFER — free, instant, no on-chain broadcast ─────────
      const recipientId = internalWallet.user_id;

      const crypto = require('crypto');
      const txRef  = 'INT_' + crypto
        .createHash('sha256').update(`${userId}:${recipientId}:${amount}:${Date.now()}`).digest('hex')
        .slice(0, 20).toUpperCase();

      // Sender debit + recipient credit + both ledger rows, atomically, in one
      // Postgres transaction — see database/2026-08-25_balance_integrity_fix.sql,
      // function praqen_internal_transfer. This replaces the old unguarded
      // read-JS-compute-write pattern (no optimistic lock on either leg), which
      // was a real double-spend/lost-update race under concurrent requests.
      let newSenderBalance, newRecipientBalance;
      try {
        const { data: rpcRows, error: transferErr } = await supabaseAdmin.rpc('praqen_internal_transfer', {
          p_sender_id:        userId,
          p_recipient_id:     recipientId,
          p_currency:         'BTC',
          p_amount:           amount,
          p_idempotency_key:  txRef,
          p_note:             'Internal transfer · No fee',
        });
        if (transferErr) throw transferErr;
        const row = Array.isArray(rpcRows) ? rpcRows[0] : rpcRows;
        newSenderBalance = parseFloat(row.sender_balance);
        newRecipientBalance = parseFloat(row.recipient_balance);
      } catch (transferErr) {
        if (/INSUFFICIENT_BALANCE/.test(transferErr.message || '')) {
          return res.status(400).json({ error: `Insufficient balance. Requested: ${amount.toFixed(8)} BTC` });
        }
        console.error('[InternalTransfer BTC] praqen_internal_transfer failed:', transferErr.message);
        return res.status(500).json({ error: 'Transfer failed — please try again' });
      }

      // Keep swapService._assertLedgerTrueBtc's reference current for both sides — without
      // this, an internal BTC transfer drifts wallets.balance_btc away from the last
      // escrow/swap-stamped figure and falsely blocks the next BTC->USDT swap for whichever
      // account isn't re-stamped (praqen_internal_transfer itself has no balance_audit insert).
      supabaseAdmin.from('balance_audit').insert({
        user_id: userId, change_btc: -amount, new_balance: newSenderBalance,
        reason: 'TRANSFER_OUT', created_at: new Date().toISOString(),
      }).then(null, e => console.error('[InternalTransfer BTC] sender ledger stamp failed:', e.message));
      supabaseAdmin.from('balance_audit').insert({
        user_id: recipientId, change_btc: amount, new_balance: newRecipientBalance,
        reason: 'TRANSFER_IN', created_at: new Date().toISOString(),
      }).then(null, e => console.error('[InternalTransfer BTC] recipient ledger stamp failed:', e.message));

      const [{ data: recip }, { data: senderUser }] = await Promise.all([
        supabaseAdmin.from('users').select('id, email, username').eq('id', recipientId).single(),
        supabaseAdmin.from('users').select('id, email, username').eq('id', userId).single(),
      ]);
      await supabaseAdmin.from('notifications').insert({
        user_id: recipientId, type: 'wallet',
        title: '₿ Bitcoin Received!',
        message: `₿${amount.toFixed(8)} received — instant internal transfer, no fee`,
        action: '/wallet', is_read: false, created_at: new Date().toISOString(),
      });

      // ── Telegram alerts (fire-and-forget) ────────────────────────────────
      sendTelegramAlert(recipientId, `₿ Bitcoin received! ${amount.toFixed(8)} BTC arrived instantly — no fee.`).catch(() => {});
      sendTelegramAlert(userId, `✅ Transfer sent! ${amount.toFixed(8)} BTC → @${recip?.username || 'PRAQEN user'} — instant & free.`).catch(() => {});

      const txNow = new Date().toISOString();
      if (senderUser?.email) {
        emailService.sendTxReceiptEmail(
          { id: userId, email: senderUser.email, username: senderUser.username },
          { type: 'TRANSFER_OUT', amount_btc: amount, status: 'CONFIRMED',
            notes: `Internal transfer → @${recip?.username || 'PRAQEN user'} · No fee`,
            created_at: txNow }
        ).catch(() => {});
      }
      if (recip?.email) {
        emailService.sendTxReceiptEmail(
          { id: recipientId, email: recip.email, username: recip.username },
          { type: 'TRANSFER_IN', amount_btc: amount, status: 'CONFIRMED',
            notes: `Internal transfer received from @${senderUser?.username || 'PRAQEN user'} · No fee`,
            created_at: txNow }
        ).catch(() => {});
      }

      console.log(`[InternalTransfer] ${userId.slice(0,8)} → ${recipientId.slice(0,8)} | ₿${amount} | FREE`);

      return res.json({
        success:     true,
        internal:    true,
        txRef,
        amount_btc:  amount,
        fee:         0,
        fee_label:   'Free — internal PRAQEN transfer',
        to:          recip?.username || toAddress,
        new_balance: newSenderBalance,
        message:     `₿${amount.toFixed(8)} sent instantly — no fee!`,
      });
    }

    // ── EXTERNAL SEND — on-chain broadcast ───────────────────────────────────

    // ── Withdrawal lock after email/phone change (NoOnes behavior) ────────────
    // Internal PRAQEN→PRAQEN transfers are unaffected (they returned above); this
    // only blocks on-chain withdrawals for 24h after a confirmed contact change.
    try {
      const { data: lockRow } = await supabaseAdmin
        .from('users')
        .select('withdrawal_locked_until')
        .eq('id', userId)
        .single();
      const lockedUntil = lockRow?.withdrawal_locked_until ? new Date(lockRow.withdrawal_locked_until) : null;
      if (lockedUntil && lockedUntil > new Date()) {
        const hrs = Math.ceil((lockedUntil - Date.now()) / 3600000);
        return res.status(403).json({
          error: `Withdrawals are temporarily disabled for 24 hours after changing your email or phone number. Try again in about ${hrs} hour(s).`,
          withdrawalLocked: true,
          lockedUntil: lockedUntil.toISOString(),
        });
      }
    } catch (lockErr) {
      // withdrawal_locked_until column may not exist yet (migration not run) — fail open.
      if (!/does not exist|schema cache/i.test(lockErr.message || '')) {
        console.warn('[hd-wallet/send] withdrawal lock check failed:', lockErr.message);
      }
    }

    // ── 2FA: enforce that user has 2FA enabled before sending BTC ──────────
    const { data: sendUser2FA } = await supabaseAdmin
      .from('users')
      .select('two_factor_enabled')
      .eq('id', userId)
      .single();
    if (!sendUser2FA?.two_factor_enabled) {
      return res.status(403).json({
        error: 'You must enable 2FA (email or authenticator) before sending funds. Go to Settings → Security to enable 2FA.',
        require2FA: true,
      });
    }

    // ── 2FA: require email action code before broadcasting on-chain ──────────
    if (!actionCode) {
      return res.status(403).json({
        error: 'Security verification required.',
        requireActionCode: true,
        action: 'send_btc',
      });
    }
    const sendCodeCheck = await actionCodeService.verify(userId, 'send_btc', actionCode);
    if (!sendCodeCheck.valid) return res.status(403).json({ error: sendCodeCheck.error });

    // All 3 verifications required to withdraw BTC to an external address
    const { data: sendUserData } = await supabaseAdmin
      .from('users')
      .select('email, username, is_email_verified, email_verified, is_phone_verified, phone_verified, is_id_verified, kyc_verified')
      .eq('id', userId).single();
    sendUser = sendUserData;

    const sHasEmail = !!(sendUser?.is_email_verified || sendUser?.email_verified);
    const sHasPhone = !!(sendUser?.is_phone_verified  || sendUser?.phone_verified);
    const sHasKyc   = !!(sendUser?.is_id_verified      || sendUser?.kyc_verified);
    const sVerifCount = [sHasEmail, sHasPhone, sHasKyc].filter(Boolean).length;

    if (sVerifCount < 3) {
      return res.status(403).json({
        error: 'KYC required: You must complete all 3 verification steps — Email, Phone, and ID verification — before sending Bitcoin to an external wallet. Go to Profile → Verification to complete your KYC.',
        requireVerification: 'kyc',
        verified: { email: sHasEmail, phone: sHasPhone, id: sHasKyc },
      });
    }

    const { data: bal } = await supabaseAdmin
      .from('wallets').select('balance_btc').eq('user_id', userId).single();

    available = parseFloat(bal?.balance_btc || 0);

    // ── Tiered PRAQEN withdrawal fee — additive: the fee is added ON TOP of
    // the requested amount. The receiver gets the FULL amount requested;
    // the sender's balance is debited (amount + fee). Changed from
    // deductive 1.2% -> additive 2.2% on 2026-09-17.
    const liveBtcPrice = await getLiveBtcPrice();
    const feeResult = calcWithdrawalFee(amount, liveBtcPrice);
    platformFee = feeResult.feeBtc;
    platformFeeUsd = feeResult.feeUsd;
    feeLabel = feeResult.label;
    amountUserReceives = amount; // additive — receiver gets the full requested amount, nothing deducted
    const totalDeduct = parseFloat((amount + platformFee).toFixed(8));

    // Bitcoin's dust relay policy rejects any on-chain output below ~546 sats —
    // the network itself will never broadcast one. Nothing upstream of this
    // ever checked amountUserReceives (what actually gets sent) against that,
    // so a request just above 0 could reach CEO approval, fail to broadcast
    // every single time, and revert back to the queue in a permanent loop —
    // exactly what happened to a 126-sat request. Reject it here instead,
    // with a clear reason, before it can ever be queued for approval.
    const MIN_ONCHAIN_SEND_SATS = 1000; // safely above the 546-sat dust limit
    if (Math.round(amountUserReceives * 1e8) < MIN_ONCHAIN_SEND_SATS) {
      return res.status(400).json({
        error: `Withdrawal too small to send on-chain. ₿${amountUserReceives.toFixed(8)} is below Bitcoin's network minimum of ₿${(MIN_ONCHAIN_SEND_SATS / 1e8).toFixed(8)}. Please withdraw a larger amount.`,
      });
    }

    if (available < totalDeduct) {
      return res.status(400).json({
        error: `Insufficient balance. Need ₿${totalDeduct.toFixed(8)} (₿${amount.toFixed(8)} + ${feeLabel} = ₿${platformFee.toFixed(8)}). Available: ₿${available.toFixed(8)}`,
      });
    }

    if (amountUserReceives <= 0) {
      return res.status(400).json({ error: 'Amount too small.' });
    }

    console.log(`[hdWalletRoutes] On-chain send: ₿${amountUserReceives} (+ ₿${platformFee} ${feeLabel} added on top) from ${userId.slice(0,8)} → ${toAddress}`);

    // ── Deduct BEFORE broadcasting, with an optimistic lock ────────────────────
    // Broadcasting first and deducting only after success (the old order) let two
    // concurrent requests both read the same `available`, both pass the balance
    // check above, and both broadcast a real on-chain send before either
    // deduction landed — an actual double-spend of hot-wallet funds. Deducting
    // first (and restoring it on any genuine failure below) closes that race.
    newBalance = parseFloat((available - totalDeduct).toFixed(8));
    const { data: deductRows, error: deductErr } = await supabaseAdmin
      .from('wallets')
      .update({ balance_btc: newBalance, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('balance_btc', available)
      .select('balance_btc');
    if (deductErr) {
      return res.status(500).json({ error: 'Failed to reserve BTC — please try again' });
    }
    if (!deductRows || deductRows.length === 0) {
      return res.status(409).json({ error: 'Balance changed — please retry the withdrawal' });
    }
    deducted = true;
    const [ubSync, uwSync] = await Promise.all([
      supabaseAdmin.from('user_balances').update({ balance_btc: newBalance, updated_at: new Date().toISOString() }).eq('user_id', userId),
      supabaseAdmin.from('user_wallets').update({ balance_btc: newBalance, updated_at: new Date().toISOString() }).eq('user_id', userId),
    ]);
    if (ubSync?.error) console.error(`🚨 [hd-wallet/send] user_balances mirror sync failed for ${userId.slice(0,8)}:`, ubSync.error.message);
    if (uwSync?.error) console.error(`🚨 [hd-wallet/send] user_wallets mirror sync failed for ${userId.slice(0,8)}:`, uwSync.error.message);
    // Keep swapService._assertLedgerTrueBtc's reference current — without this, a BTC
    // withdrawal drifts wallets.balance_btc away from the last escrow/swap-stamped figure
    // and falsely blocks this account's next BTC->USDT swap attempt.
    supabaseAdmin.from('balance_audit').insert({
      user_id: userId, change_btc: -totalDeduct, new_balance: newBalance,
      reason: 'WITHDRAWAL', created_at: new Date().toISOString(),
    }).then(null, e => console.error('[hd-wallet/send] ledger stamp failed:', e.message));
    // Immediately re-check this seller's gift-card listings against their new (lower)
    // balance — see GIFT_CARD_SAFETY_MIN_USD in offerStatusService.js. Best-effort; never
    // blocks the withdrawal itself.
    updateOfferStatus(userId).catch(() => {});

    // ── CEO SECURITY REVIEW — funds are already reserved above; nothing is ──
    // broadcast on-chain until a CEO-flagged account approves this request.
    // This is the anti-scam gate: catches compromised accounts / social-
    // engineered withdrawals before BTC actually leaves the platform.
    const reviewTs = new Date().toISOString();
    const { data: pendingRow, error: pendingErr } = await supabaseAdmin
      .from('wallet_transactions')
      .insert({
        user_id:             userId,
        type:                'WITHDRAWAL',
        amount_btc:          amountUserReceives,
        platform_fee_btc:    platformFee,
        status:              'PENDING_APPROVAL',
        destination_address: toAddress,
        // User-visible (Wallet.js shows tx.notes directly) — deliberately not "under
        // review": this reads the same way a normal pending blockchain confirmation would,
        // not PRAQEN scrutinizing the user's withdrawal.
        notes:               `Funds sending — pending 1st confirmation. Blockchain fee: ${feeLabel} (₿${platformFee.toFixed(8)} / $${platformFeeUsd}).`,
        created_at:          reviewTs,
      })
      .select('id')
      .single();

    if (pendingErr || !pendingRow) {
      throw new Error(pendingErr?.message || 'Failed to queue withdrawal for review');
    }

    console.log(`[hdWalletRoutes] Withdrawal ${pendingRow.id} queued for CEO review — ₿${amountUserReceives} from ${userId.slice(0,8)} → ${toAddress}`);

    // Notify every CEO-flagged account by email so review isn't blocked on one person
    // checking. Deliberately NOT an in-app `notifications` row: that table is tied to the
    // account and surfaces via the shared Navbar bell on every page inside the main app
    // shell (including /admin) — the CEO page is intentionally standalone with no bell, so
    // a notifications-table entry would show the alert everywhere except the one place it's
    // supposed to matter. The CEO page's own "Awaiting Review" list (live via /ceo/pulse)
    // is the single place this should be visible.
    const { data: ceoUsers } = await supabaseAdmin
      .from('users').select('id, email, username').or(`is_ceo.eq.true,email.eq.${ADMIN_EMAIL}`);
    for (const ceoU of (ceoUsers || [])) {
      if (ceoU.email) {
        emailService.sendCeoApprovalRequestEmail(ceoU, {
          requestId: pendingRow.id, amountBtc: amountUserReceives, toAddress,
          fromUser: sendUser, fromUserId: userId,
        }).catch(() => {});
      }
    }

    if (sendUser?.email) {
      emailService.sendTxReceiptEmail(
        { id: userId, email: sendUser.email, username: sendUser.username },
        { type: 'WITHDRAWAL', amount_btc: amountUserReceives, status: 'PENDING_APPROVAL',
          destination_address: toAddress, fee_btc: platformFee,
          notes: `Your withdrawal is on its way — pending 1st confirmation. You'll get an email once it's confirmed and sent.`,
          created_at: reviewTs }
      ).catch(() => {});
    }

    res.json({
      success:           true,
      pending:           true,
      requestId:         pendingRow.id,
      amount_requested:  amount,
      amount_sent:       amountUserReceives,
      platform_fee:      platformFee,
      fee_label:         `${feeLabel} — PRAQEN withdrawal fee`,
      to:                toAddress,
      new_balance:       newBalance,
      message:           `Withdrawal submitted — pending 1st confirmation. ₿${amountUserReceives.toFixed(8)} will be sent to ${toAddress} once confirmed — you'll get an email confirmation.`,
    });

  } catch (error) {
    console.error('[hdWalletRoutes POST /send]', error.message);
    const userId = req.userId;

    // Nothing is broadcast from this endpoint anymore — the balance is only ever
    // reserved and queued for CEO review. So any failure here (e.g. the
    // PENDING_APPROVAL insert itself failing) needs the reservation undone,
    // or a failed request would leave the user short with nothing pending.
    if (deducted) {
      const { error: restoreErr } = await supabaseAdmin
        .from('wallets').update({ balance_btc: available, updated_at: new Date().toISOString() }).eq('user_id', userId);
      if (restoreErr) {
        console.error('[hdWalletRoutes] CRITICAL: balance restore failed after send error!', restoreErr.message, 'user:', userId, 'amount:', amount);
      } else {
        const [ubRestore, uwRestore] = await Promise.all([
          supabaseAdmin.from('user_balances').update({ balance_btc: available, updated_at: new Date().toISOString() }).eq('user_id', userId),
          supabaseAdmin.from('user_wallets').update({ balance_btc: available, updated_at: new Date().toISOString() }).eq('user_id', userId),
        ]);
        if (ubRestore?.error) console.error(`🚨 [hd-wallet/send restore] user_balances mirror restore failed for ${userId.slice(0,8)}:`, ubRestore.error.message);
        if (uwRestore?.error) console.error(`🚨 [hd-wallet/send restore] user_wallets mirror restore failed for ${userId.slice(0,8)}:`, uwRestore.error.message);
        supabaseAdmin.from('balance_audit').insert({
          user_id: userId, change_btc: amount, new_balance: available,
          reason: 'WITHDRAWAL_REVERT', created_at: new Date().toISOString(),
        }).then(null, e => console.error('[hd-wallet/send restore] ledger stamp failed:', e.message));
      }
    }

    res.status(500).json({ error: 'Something went wrong while processing your withdrawal. Your funds are safe — please contact support if this continues.' });
  }
});

// ============================================================
// CEO WITHDRAWAL APPROVALS
// Every external send lands in wallet_transactions as PENDING_APPROVAL
// (see POST /send above). Only a CEO-flagged account (or ADMIN_EMAIL as a
// break-glass fallback) can push it on-chain or send the funds back.
//
// The same queue also carries company fee-collection cash-outs (see
// POST /api/admin/hot-wallet/collect-fees in server.js) — those rows are
// tagged by user_id === COMPANY_WALLET_ID rather than a real customer, so
// they route through this exact approve/reject flow but skip the
// customer-facing fee-credit and "your withdrawal" notification steps below.
// ============================================================
const COMPANY_WALLET_ID = '14762cd0-d3b2-474f-acab-fe0071961e9a';

// SECURITY: the ADMIN_EMAIL fallback below must never fire for an unverified email —
// see the identical warning on requireAdmin/requireFullAdminOrCeo in server.js:9869-9877.
// Registration issues a working JWT before the verification code is ever confirmed, so
// without the is_email_verified check anyone could register support@praqen.com and get
// instant, unverified CEO treasury access. This file doesn't share server.js's helpers,
// so the same fix is duplicated here rather than left out.
async function requireCeo(req, res) {
  const { data: u } = await supabaseAdmin
    .from('users').select('id, is_ceo, email, username, is_email_verified').eq('id', req.userId).single();
  const ok = !!(u?.is_ceo || (u?.email === ADMIN_EMAIL && u?.is_email_verified));
  if (!ok) { res.status(403).json({ error: 'CEO access required' }); return null; }
  return u;
}

// Same idea as requireCeo, but also accepts is_admin/is_moderator — used by the handful
// of routes (like /hot-wallet below) that legitimately need to be readable by the wider
// admin/moderator team, not just the CEO.
async function requireAdminOrCeo(req, res) {
  const { data: u } = await supabaseAdmin
    .from('users').select('id, is_admin, is_moderator, is_ceo, email, is_email_verified').eq('id', req.userId).single();
  const ok = !!(u?.is_admin || u?.is_moderator || u?.is_ceo || (u?.email === ADMIN_EMAIL && u?.is_email_verified));
  if (!ok) { res.status(403).json({ error: 'Admin access required' }); return null; }
  return u;
}

// CEO: add accounting-department emails here to grant Accountant Dashboard access without
// needing the is_accountant migration/Admin Panel toggle run first. Once
// database/add_accountant_role.sql has been applied and an admin flips is_accountant on a
// user (same self-service pattern as the existing agent grant), that column takes over —
// this array is just the zero-migration bootstrap path.
const ACCOUNTANT_EMAIL_ALLOWLIST = [];

// Read-only gate for the Accountant Dashboard: is_ceo/is_admin always pass (so the CEO can
// always check this page, per their own requirement), plus a dedicated is_accountant flag
// for non-admin accounting-department accounts. Tolerates is_accountant not existing yet —
// same graceful-degradation shape as isAgent() in server.js — so this route never 500s just
// because database/add_accountant_role.sql hasn't been run yet.
async function requireAccountant(req, res) {
  let u = null;
  try {
    const r = await supabaseAdmin.from('users')
      .select('id, is_admin, is_ceo, is_accountant, email, is_email_verified').eq('id', req.userId).single();
    u = r.data;
  } catch {
    try {
      const r = await supabaseAdmin.from('users')
        .select('id, is_admin, is_ceo, email, is_email_verified').eq('id', req.userId).single();
      u = r.data;
    } catch {}
  }
  const email = (u?.email || '').toLowerCase();
  const ok = !!(u?.is_admin || u?.is_ceo || u?.is_accountant || (email === ADMIN_EMAIL && u?.is_email_verified) || ACCOUNTANT_EMAIL_ALLOWLIST.includes(email));
  if (!ok) { res.status(403).json({ error: 'Accountant access required' }); return null; }
  return u;
}

// GET /api/hd-wallet/ceo/treasury
// One-shot overview for the CEO dashboard: BTC hot wallet, Tron gas + USDT hot
// wallet, the company/master wallet's BTC & USDT balances, and swap fee revenue.
router.get('/ceo/treasury', verifyToken, async (req, res) => {
  const COMPANY_WALLET_ID = '14762cd0-d3b2-474f-acab-fe0071961e9a';
  try {
    const ceo = await requireCeo(req, res); if (!ceo) return;

    const [hotBtcR, reserveBtcR, tronR, companyR, swapFeesR, recentSwapsR] = await Promise.allSettled([
      hdWallet.getHotWalletBalance(),
      hdWallet.getReserveWalletBalance(),
      tronHotWallet.getStatus(),
      supabaseAdmin.from('wallets')
        .select('balance_btc, locked_balance_btc, balance_usdt, locked_balance_usdt')
        .eq('user_id', COMPANY_WALLET_ID).maybeSingle(),
      // Capped — fine at current volume; move to a DB-side aggregate (RPC) once
      // swap_transactions grows large enough that this scan gets expensive.
      supabaseAdmin.from('swap_transactions').select('fee_btc, fee_usdt, created_at').limit(5000),
      supabaseAdmin.from('swap_transactions')
        .select('user_id, from_currency, to_currency, from_amount, to_amount, fee_btc, fee_usdt, created_at')
        .order('created_at', { ascending: false }).limit(20),
    ]);

    const hotWalletBtc = hotBtcR.status === 'fulfilled' ? hotBtcR.value : { error: hotBtcR.reason?.message || 'unavailable' };
    const reserveWalletBtc = reserveBtcR.status === 'fulfilled' ? reserveBtcR.value : { error: reserveBtcR.reason?.message || 'unavailable' };
    const tron          = tronR.status === 'fulfilled' ? tronR.value : { error: tronR.reason?.message || 'unavailable' };
    const companyRow    = companyR.status === 'fulfilled' ? companyR.value.data : null;

    const now = Date.now();
    const swapTotals = { totalFeeBtc: 0, totalFeeUsdt: 0, feeBtc24h: 0, feeUsdt24h: 0, count: 0 };
    if (swapFeesR.status === 'fulfilled') {
      for (const r of (swapFeesR.value.data || [])) {
        const feeBtc  = parseFloat(r.fee_btc || 0);
        const feeUsdt = parseFloat(r.fee_usdt || 0);
        swapTotals.totalFeeBtc  += feeBtc;
        swapTotals.totalFeeUsdt += feeUsdt;
        if (now - new Date(r.created_at).getTime() < 86400000) {
          swapTotals.feeBtc24h  += feeBtc;
          swapTotals.feeUsdt24h += feeUsdt;
        }
        swapTotals.count++;
      }
      swapTotals.totalFeeBtc  = parseFloat(swapTotals.totalFeeBtc.toFixed(8));
      swapTotals.totalFeeUsdt = parseFloat(swapTotals.totalFeeUsdt.toFixed(6));
      swapTotals.feeBtc24h    = parseFloat(swapTotals.feeBtc24h.toFixed(8));
      swapTotals.feeUsdt24h   = parseFloat(swapTotals.feeUsdt24h.toFixed(6));
    }

    res.json({
      success: true,
      hotWalletBtc,
      reserveWalletBtc,
      tron: tron?.error ? tron : {
        address:            tron.hot_wallet_address,
        usdt:                tron.hot_wallet_usdt,
        trx:                 tron.hot_wallet_trx,
        trxStatus:           tron.trx_status,
        minTrxReserve:       tron.min_trx_reserve,
        companyWalletUsdt:   tron.company_wallet_usdt,
        pendingSweeps:       tron.pending_sweeps,
        sweptTodayUsdt:      tron.swept_today_usdt,
        withdrawalFeeUsdt:   tron.withdrawal_fee_usdt,
      },
      companyWallet: {
        balance_btc:         parseFloat(companyRow?.balance_btc || 0),
        locked_balance_btc:  parseFloat(companyRow?.locked_balance_btc || 0),
        balance_usdt:        parseFloat(companyRow?.balance_usdt || 0),
        locked_balance_usdt: parseFloat(companyRow?.locked_balance_usdt || 0),
      },
      swapFees:    swapTotals,
      recentSwaps: recentSwapsR.status === 'fulfilled' ? (recentSwapsR.value.data || []) : [],
    });
  } catch (error) {
    console.error('[hdWalletRoutes GET /ceo/treasury]', error.message);
    res.status(500).json({ error: 'Failed to load treasury overview.' });
  }
});

// POST /api/hd-wallet/ceo/reserve/topup-hot  { amountBtc }
// Moves BTC from the company reserve wallet back into the hot wallet. CEO-only.
// This is the ONLY path that can ever spend reserve funds — see
// hdWallet.sendReserveToHot()'s comment. It broadcasts immediately rather than
// going through the customer-withdrawal PENDING_APPROVAL queue because both
// ends are company-controlled addresses (no external destination, no customer
// balance involved); it still requires a live CEO session to reach this route.
//
// IMPORTANT — interim architecture note: the reserve wallet is currently
// derived from the SAME MNEMONIC as the hot wallet (see hdWalletService.js).
// That means it protects against operational mistakes (a bug or runaway
// process draining the hot wallet) but NOT against a leaked .env/MNEMONIC —
// anyone with that mnemonic can derive the reserve key exactly as easily as
// the hot wallet's. Treat this as a stopgap until the reserve is moved to real
// separate key material (hardware-wallet multisig) outside this server.
router.post('/ceo/reserve/topup-hot', verifyToken, async (req, res) => {
  try {
    const ceo = await requireCeo(req, res); if (!ceo) return;

    const amount = parseFloat(req.body.amountBtc);
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Positive BTC amount required' });
    }

    const reserveBal = await hdWallet.getReserveWalletBalance();
    if (reserveBal.error) {
      return res.status(503).json({ error: `Could not verify reserve balance — blockchain API unreachable (${reserveBal.error}). Try again shortly.` });
    }
    // Requesting the full confirmed balance leaves nothing for the network fee —
    // sendBitcoin computes change as inputSum - amount - fee, which goes negative
    // and throws. Reject with a clear reason here instead of a generic 500 that
    // would just repeat on every retry at that exact amount.
    const RESERVE_FEE_BUFFER_BTC = 0.0001; // generous — covers fee for a handful of UTXOs at 5 sat/vbyte
    const maxSendableBtc = parseFloat((reserveBal.confirmed_btc - RESERVE_FEE_BUFFER_BTC).toFixed(8));
    if (amount > maxSendableBtc) {
      return res.status(400).json({
        error: `Reserve has ₿${reserveBal.confirmed_btc.toFixed(8)} but ~₿${RESERVE_FEE_BUFFER_BTC.toFixed(8)} must stay to cover the network fee — max you can move right now is ₿${Math.max(0, maxSendableBtc).toFixed(8)}.`,
      });
    }

    let result;
    try {
      result = await hdWallet.sendReserveToHot(amount);
    } catch (sendErr) {
      // Belt-and-suspenders — if the actual fee still exceeds the buffer above
      // (e.g. reserve is spread across many small UTXOs), surface it plainly
      // instead of a generic 500.
      if (/Not enough to cover fee/i.test(sendErr.message || '')) {
        return res.status(400).json({ error: `Amount too close to the full reserve balance — reduce it slightly to leave room for the network fee. (${sendErr.message})` });
      }
      throw sendErr;
    }

    const ts = new Date().toISOString();
    await supabaseAdmin.from('wallet_transactions').insert({
      user_id:             COMPANY_WALLET_ID,
      type:                'RESERVE_TOPUP',
      amount_btc:          amount,
      status:              'CONFIRMED',
      tx_hash:             result.txid,
      destination_address: result.to,
      notes:               `Reserve → hot wallet top-up, approved by CEO ${ceo.email} — tx: ${result.txid}`,
      created_at:          ts,
    }).then(null, logErr => {
      console.warn('[hdWalletRoutes] Reserve topup audit log failed (funds safe):', logErr.message);
    });

    console.log(`✅ [CEO] Reserve topup — ₿${amount} reserve → hot wallet | TX ${result.txid} | by ${ceo.email}`);
    res.json({
      success:      true,
      txid:         result.txid,
      explorer_url: result.explorer_url,
      message:      `₿${amount.toFixed(8)} moved from reserve to hot wallet.`,
    });
  } catch (error) {
    console.error('[hdWalletRoutes POST /ceo/reserve/topup-hot]', error.message);
    res.status(500).json({ error: 'Failed to top up hot wallet from reserve: ' + error.message });
  }
});

// Shared by GET /ceo/pulse's alert badge count and GET /ceo/security-events' full list —
// flags a security_events row as alert-worthy if it's a failed/blocked login against a
// privileged (CEO/admin/moderator) account, OR its IP has 3+ failures in the window
// (catches someone hammering regular-user accounts too, without lighting up on one normal
// typo). Defensive: security_events may not exist yet if the migration hasn't been run —
// returns a safe all-zero result with tableMissing:true rather than ever throwing.
async function getSecurityAlertSummary(windowHours = 24) {
  try {
    const sinceISO = new Date(Date.now() - windowHours * 3600000).toISOString();
    const [{ data: events, error }, { data: privUsers }] = await Promise.all([
      supabaseAdmin.from('security_events')
        .select('id, user_id, email_attempted, event_type, ip_address, created_at')
        .in('event_type', ['LOGIN_FAILED_PASSWORD', 'LOGIN_FAILED_OTP', 'LOGIN_FAILED_2FA', 'LOGIN_BLOCKED_BANNED', 'LOGIN_BLOCKED_LOCKOUT'])
        .gte('created_at', sinceISO).order('created_at', { ascending: false }).limit(500),
      supabaseAdmin.from('users').select('id').or('is_ceo.eq.true,is_admin.eq.true,is_moderator.eq.true'),
    ]);
    if (error) {
      if (/relation .*security_events.* does not exist/i.test(error.message || '')) {
        return { count: 0, events: [], topIps: [], privilegedFailures: 0, tableMissing: true };
      }
      throw error;
    }

    const privilegedIds = new Set((privUsers || []).map(u => u.id));
    const ipCounts = {};
    for (const e of events || []) { if (e.ip_address) ipCounts[e.ip_address] = (ipCounts[e.ip_address] || 0) + 1; }
    const flaggedIps = new Set(Object.entries(ipCounts).filter(([, c]) => c >= 3).map(([ip]) => ip));

    let privilegedFailures = 0;
    const flagged = (events || []).filter(e => {
      const isPriv = !!(e.user_id && privilegedIds.has(e.user_id));
      if (isPriv) privilegedFailures++;
      return isPriv || (e.ip_address && flaggedIps.has(e.ip_address));
    });
    const topIps = Object.entries(ipCounts).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([ip, count]) => ({ ip, count }));

    return { count: flagged.length, events: flagged, topIps, privilegedFailures, tableMissing: false };
  } catch (err) {
    console.error('[hdWalletRoutes getSecurityAlertSummary]', err.message);
    return { count: 0, events: [], topIps: [], privilegedFailures: 0, tableMissing: false };
  }
}

// GET /api/hd-wallet/ceo/pulse
// Company-wide read-only snapshot for the CEO dashboard: money in/out, trade volume,
// pending-approval counts across every queue in the app, new-user growth, and a recent
// activity feed. Every query here is a SELECT/count — nothing here writes to any table.
// Queried directly (not proxied through the admin/team endpoints that already expose most
// of these numbers individually) because this page is gated by is_ceo only, and those
// endpoints require is_admin/is_moderator instead — a CEO-only account wouldn't pass them.
router.get('/ceo/pulse', verifyToken, async (req, res) => {
  try {
    const ceo = await requireCeo(req, res); if (!ceo) return;

    const nowMs = Date.now();
    const since24hMs = nowMs - 86400000;
    const since48hMs = nowMs - 2 * 86400000;
    const since7dMs = nowMs - 7 * 86400000;
    const since14dMs = nowMs - 14 * 86400000;
    const since14dISO = new Date(since14dMs).toISOString();
    const todayStartMs = new Date().setHours(0, 0, 0, 0);

    const [
      depositsR, withdrawalsR, tradesR,
      pendingWdR, pendingKycR, pendingDisputesR, pendingMigrationR,
      newUsersR, activityR, totalUsersR,
      tradeFeesR, swapFeesR,
      kycApprovedR, kycRejectedR, bannedR, warnedR, securityAlertsR,
    ] = await Promise.allSettled([
      // Widened to 14d (was 7d) so "vs previous period" growth (prev24h = 24-48h ago,
      // prev7d = 7-14d ago) can be bucketed from the same fetch — no second round trip.
      // Bounded .limit() matches the existing swap_transactions precedent below ("fine at
      // current volume, move to a DB-side aggregate once this scan gets expensive").
      supabaseAdmin.from('wallet_transactions').select('amount_btc, amount_usdt, created_at')
        .eq('type', 'DEPOSIT').eq('status', 'CONFIRMED').gte('created_at', since14dISO).limit(5000),
      // Also pulls platform_fee_btc/platform_fee_usdt — same rows feed both "money out"
      // (amount_btc/usdt, what the user received) and the withdrawal-fee breakdown below
      // (what PRAQEN collected, in whichever currency), so this is fetched once, not twice.
      supabaseAdmin.from('wallet_transactions').select('amount_btc, amount_usdt, platform_fee_btc, platform_fee_usdt, created_at')
        .eq('type', 'WITHDRAWAL').eq('status', 'CONFIRMED').gte('created_at', since14dISO).limit(5000),
      supabaseAdmin.from('trades').select('amount_usd, amount_btc, created_at')
        .eq('status', 'COMPLETED').gte('created_at', since14dISO).limit(5000),
      supabaseAdmin.from('wallet_transactions').select('id', { count: 'exact', head: true })
        .eq('type', 'WITHDRAWAL').eq('status', 'PENDING_APPROVAL'),
      supabaseAdmin.from('users').select('id', { count: 'exact', head: true }).eq('kyc_status', 'pending'),
      supabaseAdmin.from('trades').select('id', { count: 'exact', head: true }).eq('status', 'DISPUTED'),
      supabaseAdmin.from('p2p_migration_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabaseAdmin.from('users').select('id, created_at').gte('created_at', since14dISO).limit(5000),
      supabaseAdmin.from('team_activity_log').select('actor, action, details, category, created_at')
        .order('created_at', { ascending: false }).limit(20),
      supabaseAdmin.from('users').select('id', { count: 'exact', head: true }),
      // Trade fees — company_profits is the canonical trade-fee ledger, written by
      // tradeEscrowService._creditCompanyFee-equivalent logic on every completed release.
      supabaseAdmin.from('company_profits').select('profit_btc, profit_usdt, profit_usd, collected_at')
        .gte('collected_at', since14dISO).limit(5000),
      // Swap fees — swap_transactions.fee_btc/fee_usdt, written by swapService._recordSwap
      // alongside the actual company-wallet credit (see swapService.js:_creditCompanyFee).
      supabaseAdmin.from('swap_transactions').select('fee_btc, fee_usdt, created_at')
        .gte('created_at', since14dISO).limit(5000),
      // Account health — same simple count-query pattern as pendingKycR above.
      supabaseAdmin.from('users').select('id', { count: 'exact', head: true }).eq('kyc_status', 'approved'),
      supabaseAdmin.from('users').select('id', { count: 'exact', head: true }).eq('kyc_status', 'rejected'),
      supabaseAdmin.from('users').select('id', { count: 'exact', head: true }).eq('account_status', 'banned'),
      supabaseAdmin.from('users').select('id', { count: 'exact', head: true }).eq('has_warning', true),
      // Login-security alert count — see getSecurityAlertSummary below. Wrapped in its own
      // try/catch there since security_events may not exist yet (migration not yet run).
      getSecurityAlertSummary(24),
    ]);

    // Splits an already-fetched 14d row set into last24h/last7d (rolling, as before) PLUS
    // prev24h ([24h,48h) ago) and prev7d ([7d,14d) ago) for "vs previous period" growth.
    // Compares as real Date values (not raw ISO strings) so it's correct regardless of the
    // exact timestamp precision/offset format Postgres returns.
    // btcField/usdtField/tsField are configurable so this same windowing logic works for
    // deposits/withdrawals (amount_btc/amount_usdt/created_at), trade fees (profit_btc/
    // profit_usdt/collected_at from company_profits), and swap fees (fee_btc/fee_usdt/
    // created_at from swap_transactions) without three near-duplicate reducers.
    const sumWindow = (rows, btcField = 'amount_btc', usdtField = 'amount_usdt', tsField = 'created_at') => {
      const r24 = { btc: 0, usdt: 0 }, r7 = { btc: 0, usdt: 0 }, p24 = { btc: 0, usdt: 0 }, p7 = { btc: 0, usdt: 0 };
      for (const row of rows) {
        const btc = parseFloat(row[btcField] || 0);
        const usdt = usdtField ? parseFloat(row[usdtField] || 0) : 0;
        const t = new Date(row[tsField]).getTime();
        if (t >= since24hMs) { r24.btc += btc; r24.usdt += usdt; }
        else if (t >= since48hMs) { p24.btc += btc; p24.usdt += usdt; }
        if (t >= since7dMs) { r7.btc += btc; r7.usdt += usdt; }
        else if (t >= since14dMs) { p7.btc += btc; p7.usdt += usdt; }
      }
      const round = (w) => ({ btc: parseFloat(w.btc.toFixed(8)), usdt: parseFloat(w.usdt.toFixed(2)) });
      return { last24h: round(r24), last7d: round(r7), prev24h: round(p24), prev7d: round(p7) };
    };

    const depositRows = depositsR.status === 'fulfilled' ? (depositsR.value.data || []) : [];
    const withdrawalRows = withdrawalsR.status === 'fulfilled' ? (withdrawalsR.value.data || []) : [];
    const tradeRows = tradesR.status === 'fulfilled' ? (tradesR.value.data || []) : [];

    const moneyIn = sumWindow(depositRows);
    const moneyOut = sumWindow(withdrawalRows);

    // Fees actually collected into the company wallet, broken out by source — verified
    // against the real crediting code in tradeEscrowService.js, hdWalletRoutes.js's own
    // approve handler above, and swapService.js's _creditCompanyFee before wiring this up.
    const tradeFeeRows = tradeFeesR.status === 'fulfilled' ? (tradeFeesR.value.data || []) : [];
    const swapFeeRows = swapFeesR.status === 'fulfilled' ? (swapFeesR.value.data || []) : [];
    const fees = {
      trade: sumWindow(tradeFeeRows, 'profit_btc', 'profit_usdt', 'collected_at'),
      withdrawal: sumWindow(withdrawalRows, 'platform_fee_btc', 'platform_fee_usdt', 'created_at'),
      swap: sumWindow(swapFeeRows, 'fee_btc', 'fee_usdt', 'created_at'),
    };

    const tradeVolume = (() => {
      let v24 = 0, v7 = 0, c24 = 0, c7 = 0, p24 = 0, p7 = 0, pc24 = 0, pc7 = 0;
      for (const t of tradeRows) {
        const usd = parseFloat(t.amount_usd || 0);
        const ts = new Date(t.created_at).getTime();
        if (ts >= since24hMs) { v24 += usd; c24++; }
        else if (ts >= since48hMs) { p24 += usd; pc24++; }
        if (ts >= since7dMs) { v7 += usd; c7++; }
        else if (ts >= since14dMs) { p7 += usd; pc7++; }
      }
      return {
        last24h: { usd: parseFloat(v24.toFixed(2)), count: c24 },
        last7d: { usd: parseFloat(v7.toFixed(2)), count: c7 },
        prev24h: { usd: parseFloat(p24.toFixed(2)), count: pc24 },
        prev7d: { usd: parseFloat(p7.toFixed(2)), count: pc7 },
      };
    })();

    const newUsersRows = newUsersR.status === 'fulfilled' ? (newUsersR.value.data || []) : [];
    const countOf = (r) => r.status === 'fulfilled' ? (r.value.count || 0) : 0;
    const newUsers = {
      today: newUsersRows.filter(u => new Date(u.created_at).getTime() >= todayStartMs).length,
      week: newUsersRows.filter(u => new Date(u.created_at).getTime() >= since7dMs).length,
      lastWeek: newUsersRows.filter(u => { const t = new Date(u.created_at).getTime(); return t < since7dMs && t >= since14dMs; }).length,
      total: countOf(totalUsersR),
    };

    const securityAlerts = securityAlertsR.status === 'fulfilled' ? securityAlertsR.value : { count: 0, tableMissing: true };

    res.json({
      success: true,
      moneyIn, moneyOut, tradeVolume, newUsers, fees,
      accountHealth: {
        kycApproved: countOf(kycApprovedR), kycRejected: countOf(kycRejectedR),
        banned: countOf(bannedR), warned: countOf(warnedR),
      },
      pending: {
        withdrawals: countOf(pendingWdR),
        kyc: countOf(pendingKycR),
        disputes: countOf(pendingDisputesR),
        p2pMigration: countOf(pendingMigrationR),
        securityAlerts: securityAlerts.count || 0,
      },
      securityTableMissing: !!securityAlerts.tableMissing,
      recentActivity: activityR.status === 'fulfilled' ? (activityR.value.data || []) : [],
    });
  } catch (error) {
    console.error('[hdWalletRoutes GET /ceo/pulse]', error.message);
    res.status(500).json({ error: 'Failed to load company pulse.' });
  }
});

// GET /api/hd-wallet/accountant/overview
// Read-only solvency snapshot for the Accountant Dashboard: same treasury wallet balances as
// /ceo/treasury (reused, not recomputed independently, so the two pages never quietly
// disagree), plus the one number CEO treasury didn't need but an accountant does — total
// user balances (platform liabilities) — and the current reconciliation_flags queue. This
// route only ever reads; it has no write/RPC path anywhere in it.
router.get('/accountant/overview', verifyToken, async (req, res) => {
  const COMPANY_WALLET_ID = '14762cd0-d3b2-474f-acab-fe0071961e9a';
  try {
    const acct = await requireAccountant(req, res); if (!acct) return;

    const [hotBtcR, reserveBtcR, tronR, companyR, walletsR, flagsR] = await Promise.allSettled([
      hdWallet.getHotWalletBalance(),
      hdWallet.getReserveWalletBalance(),
      tronHotWallet.getStatus(),
      supabaseAdmin.from('wallets')
        .select('balance_btc, locked_balance_btc, balance_usdt, locked_balance_usdt')
        .eq('user_id', COMPANY_WALLET_ID).maybeSingle(),
      // Full-table scan to sum what the platform owes every user — same capped-scan pattern
      // /ceo/treasury already uses for swap_transactions. ~1,500 rows today; revisit with a
      // DB-side SUM() RPC if this table grows enough for 10,000 to become a real ceiling.
      supabaseAdmin.from('wallets').select('balance_btc, balance_usdt').limit(10000),
      supabaseAdmin.from('reconciliation_flags').select('*').order('created_at', { ascending: false }).limit(50),
    ]);

    const hotWalletBtc     = hotBtcR.status === 'fulfilled' ? hotBtcR.value : { error: hotBtcR.reason?.message || 'unavailable' };
    const reserveWalletBtc = reserveBtcR.status === 'fulfilled' ? reserveBtcR.value : { error: reserveBtcR.reason?.message || 'unavailable' };
    const tron             = tronR.status === 'fulfilled' ? tronR.value : { error: tronR.reason?.message || 'unavailable' };
    const companyRow       = companyR.status === 'fulfilled' ? companyR.value.data : null;

    let totalLiabilityBtc = 0, totalLiabilityUsdt = 0, walletRowCount = 0, liabilitiesTruncated = false;
    if (walletsR.status === 'fulfilled') {
      const rows = walletsR.value.data || [];
      walletRowCount = rows.length;
      liabilitiesTruncated = rows.length >= 10000;
      for (const w of rows) {
        totalLiabilityBtc  += parseFloat(w.balance_btc  || 0);
        totalLiabilityUsdt += parseFloat(w.balance_usdt || 0);
      }
    }

    res.json({
      success: true,
      hotWalletBtc,
      reserveWalletBtc,
      tron: tron?.error ? tron : {
        usdt:          tron.hot_wallet_usdt,
        trx:           tron.hot_wallet_trx,
        trxStatus:     tron.trx_status,
        minTrxReserve: tron.min_trx_reserve,
      },
      companyWallet: {
        balance_btc:         parseFloat(companyRow?.balance_btc || 0),
        locked_balance_btc:  parseFloat(companyRow?.locked_balance_btc || 0),
        balance_usdt:        parseFloat(companyRow?.balance_usdt || 0),
        locked_balance_usdt: parseFloat(companyRow?.locked_balance_usdt || 0),
      },
      liabilities: {
        total_balance_btc:  parseFloat(totalLiabilityBtc.toFixed(8)),
        total_balance_usdt: parseFloat(totalLiabilityUsdt.toFixed(6)),
        user_wallet_rows:   walletRowCount,
        truncated:          liabilitiesTruncated,
      },
      reconciliationFlags: flagsR.status === 'fulfilled' ? (flagsR.value.data || []) : [],
      reconciliationTableMissing: flagsR.status === 'rejected',
    });
  } catch (error) {
    console.error('[hdWalletRoutes GET /accountant/overview]', error.message);
    res.status(500).json({ error: 'Failed to load accountant overview.' });
  }
});

// GET /api/hd-wallet/accountant/ledger?from=&to=
// Read-only transaction ledger for a date range, plus a by-type summary (revenue/cash-flow
// building blocks) computed from the same fetched rows so the summary and the raw rows can
// never disagree with each other. Defaults to the last 30 days. SELECT-only — no RPC calls.
router.get('/accountant/ledger', verifyToken, async (req, res) => {
  try {
    const acct = await requireAccountant(req, res); if (!acct) return;

    const toDate   = req.query.to   ? new Date(req.query.to)   : new Date();
    const fromDate = req.query.from ? new Date(req.query.from) : new Date(toDate.getTime() - 30 * 86400000);
    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) return res.status(400).json({ error: 'Invalid from/to date' });
    // Make "to" inclusive of the whole day it names.
    const toInclusive = new Date(toDate.getTime());
    toInclusive.setHours(23, 59, 59, 999);

    const LEDGER_CAP = 5000;
    const { data: rows, error } = await supabaseAdmin
      .from('wallet_transactions')
      .select('id, user_id, type, currency, amount_btc, amount_usdt, status, tx_hash, notes, created_at, platform_fee_btc, platform_fee_usdt')
      .gte('created_at', fromDate.toISOString())
      .lte('created_at', toInclusive.toISOString())
      .order('created_at', { ascending: false })
      .limit(LEDGER_CAP);
    if (error) return res.status(400).json({ error: error.message });

    // By-type summary — the accountant page derives its P&L/cash-flow cards from this
    // instead of a second, separately-computed aggregate, so the two views can't drift apart.
    const summary = {};
    for (const r of (rows || [])) {
      const key = r.type || 'UNKNOWN';
      if (!summary[key]) summary[key] = { count: 0, btc: 0, usdt: 0, feeBtc: 0, feeUsdt: 0 };
      summary[key].count++;
      summary[key].btc     += parseFloat(r.amount_btc || 0);
      summary[key].usdt    += parseFloat(r.amount_usdt || 0);
      summary[key].feeBtc  += parseFloat(r.platform_fee_btc || 0);
      summary[key].feeUsdt += parseFloat(r.platform_fee_usdt || 0);
    }
    for (const key of Object.keys(summary)) {
      summary[key].btc     = parseFloat(summary[key].btc.toFixed(8));
      summary[key].usdt    = parseFloat(summary[key].usdt.toFixed(6));
      summary[key].feeBtc  = parseFloat(summary[key].feeBtc.toFixed(8));
      summary[key].feeUsdt = parseFloat(summary[key].feeUsdt.toFixed(6));
    }

    res.json({
      success: true,
      from: fromDate.toISOString(),
      to: toInclusive.toISOString(),
      rowCount: (rows || []).length,
      truncated: (rows || []).length >= LEDGER_CAP,
      summary,
      transactions: rows || [],
    });
  } catch (error) {
    console.error('[hdWalletRoutes GET /accountant/ledger]', error.message);
    res.status(500).json({ error: 'Failed to load accountant ledger.' });
  }
});

// GET /api/hd-wallet/ceo/security-events
// Full 7-day login-security feed for the Security Alerts modal: every flagged failed/blocked
// login (see getSecurityAlertSummary above for what counts as "flagged"), which accounts are
// currently locked out, and the top offending IPs. Read-only.
router.get('/ceo/security-events', verifyToken, async (req, res) => {
  try {
    const ceo = await requireCeo(req, res); if (!ceo) return;

    const since7dISO = new Date(Date.now() - 7 * 86400000).toISOString();
    const { data: events, error } = await supabaseAdmin.from('security_events')
      .select('id, user_id, email_attempted, event_type, ip_address, user_agent, details, created_at')
      .gte('created_at', since7dISO).order('created_at', { ascending: false }).limit(200);

    if (error) {
      if (/relation .*security_events.* does not exist/i.test(error.message || '')) {
        return res.json({
          success: true, tableMissing: true, events: [],
          summary: { privilegedFailures: 0, lockedAccounts: [], topIps: [] },
        });
      }
      throw error;
    }

    const { data: privUsers } = await supabaseAdmin.from('users')
      .select('id, username, email, is_ceo, is_admin, is_moderator')
      .or('is_ceo.eq.true,is_admin.eq.true,is_moderator.eq.true');
    const privMap = Object.fromEntries((privUsers || []).map(u => [u.id, u]));

    const failEvents = (events || []).filter(e => e.event_type.startsWith('LOGIN_FAILED') || e.event_type.startsWith('LOGIN_BLOCKED'));
    const privilegedFailures = failEvents.filter(e => e.user_id && privMap[e.user_id]).length;

    const ipCounts = {};
    for (const e of failEvents) { if (e.ip_address) ipCounts[e.ip_address] = (ipCounts[e.ip_address] || 0) + 1; }
    const topIps = Object.entries(ipCounts).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([ip, count]) => ({ ip, count }));

    // Candidate locked accounts: users with >= LOCKOUT_THRESHOLD failed-password events in
    // the last 30 minutes among these rows — confirmed via isLockedOut (which also respects
    // a LOCKOUT_CLEARED marker, so a CEO-cleared account won't show as locked here either).
    const since30MinMs = Date.now() - 30 * 60000;
    const candidateCounts = {};
    for (const e of events || []) {
      if (e.event_type === 'LOGIN_FAILED_PASSWORD' && e.user_id && new Date(e.created_at).getTime() >= since30MinMs) {
        candidateCounts[e.user_id] = (candidateCounts[e.user_id] || 0) + 1;
      }
    }
    const candidates = Object.keys(candidateCounts).filter(id => candidateCounts[id] >= LOCKOUT_THRESHOLD);
    const lockStates = await Promise.all(candidates.map(async id => ({ id, ...(await isLockedOut(id)) })));
    const lockedIds = lockStates.filter(l => l.locked).map(l => l.id);
    const { data: lockedUsers } = lockedIds.length
      ? await supabaseAdmin.from('users').select('id, username, email').in('id', lockedIds)
      : { data: [] };
    const lockedUserMap = Object.fromEntries((lockedUsers || []).map(u => [u.id, u]));
    const lockedAccounts = lockStates.filter(l => l.locked).map(l => ({ ...l, user: lockedUserMap[l.id] || null }));

    // Resolve a readable "who" for each event (email_attempted already covers the
    // no-matching-account case; user_id resolves to a real account when there is one).
    const userIds = [...new Set((events || []).map(e => e.user_id).filter(Boolean))];
    const { data: eventUsers } = userIds.length
      ? await supabaseAdmin.from('users').select('id, username, email').in('id', userIds)
      : { data: [] };
    const eventUserMap = Object.fromEntries((eventUsers || []).map(u => [u.id, u]));

    res.json({
      success: true,
      tableMissing: false,
      events: (events || []).map(e => ({
        ...e,
        user: e.user_id ? (eventUserMap[e.user_id] || null) : null,
        is_privileged: !!(e.user_id && privMap[e.user_id]),
      })),
      summary: { privilegedFailures, lockedAccounts, topIps },
    });
  } catch (error) {
    console.error('[hdWalletRoutes GET /ceo/security-events]', error.message);
    res.status(500).json({ error: 'Failed to load security events.' });
  }
});

// POST /api/hd-wallet/ceo/security-events/:userId/unlock
// Manually clears a login lockout for a legitimate user caught by the failed-password
// threshold — inserts a LOCKOUT_CLEARED marker that isLockedOut() treats as resetting the
// failure count (see securityLogService.js), so no schema change is needed just for this.
router.post('/ceo/security-events/:userId/unlock', verifyToken, async (req, res) => {
  try {
    const ceo = await requireCeo(req, res); if (!ceo) return;
    const { userId } = req.params;

    const { error } = await supabaseAdmin.from('security_events').insert({
      user_id: userId,
      event_type: 'LOCKOUT_CLEARED',
      ip_address: getClientIp(req),
      user_agent: (req.headers['user-agent'] || '').slice(0, 500),
      details: { clearedBy: ceo.email || ceo.username || ceo.id },
    });
    if (error) throw error;

    res.json({ success: true, message: 'Lockout cleared — this account can log in again immediately.' });
  } catch (error) {
    console.error('[hdWalletRoutes POST /ceo/security-events/:userId/unlock]', error.message);
    res.status(500).json({ error: 'Failed to clear lockout: ' + error.message });
  }
});

// GET /api/hd-wallet/ceo-withdrawals?status=PENDING_APPROVAL
router.get('/ceo-withdrawals', verifyToken, async (req, res) => {
  try {
    const ceo = await requireCeo(req, res); if (!ceo) return;
    const status = req.query.status || 'PENDING_APPROVAL';

    let { data: rows, error } = await supabaseAdmin
      .from('wallet_transactions')
      .select('id, user_id, currency, amount_btc, amount_usdt, platform_fee_btc, platform_fee_usdt, destination_address, status, notes, tx_hash, rejection_reason, reviewed_by, reviewed_at, created_at')
      .eq('type', 'WITHDRAWAL')
      .eq('status', status)
      .order('created_at', { ascending: status === 'PENDING_APPROVAL' })
      .limit(100);

    // Resilient to platform_fee_usdt not existing yet (database/fix_usdt_withdrawal_approval_gap.sql
    // not run) — fall back to the BTC-only column set rather than hiding every withdrawal,
    // BTC included, behind one missing column. USDT rows just won't show their fee in that case.
    if (error && /platform_fee_usdt/i.test(error.message || '')) {
      console.warn('[hdWalletRoutes GET /ceo-withdrawals] platform_fee_usdt missing — run database/fix_usdt_withdrawal_approval_gap.sql. Falling back.');
      ({ data: rows, error } = await supabaseAdmin
        .from('wallet_transactions')
        .select('id, user_id, currency, amount_btc, amount_usdt, platform_fee_btc, destination_address, status, notes, tx_hash, rejection_reason, reviewed_by, reviewed_at, created_at')
        .eq('type', 'WITHDRAWAL')
        .eq('status', status)
        .order('created_at', { ascending: status === 'PENDING_APPROVAL' })
        .limit(100));
    }
    if (error) throw error;

    const userIds = [...new Set((rows || []).map(r => r.user_id))];
    const { data: users } = userIds.length
      ? await supabaseAdmin
          .from('users')
          .select('id, username, email, created_at, is_email_verified, email_verified, is_phone_verified, phone_verified, is_id_verified, kyc_verified, account_status')
          .in('id', userIds)
      : { data: [] };
    const userMap = Object.fromEntries((users || []).map(u => [u.id, u]));

    res.json({
      success:     true,
      // Fee-collection cash-outs (PRAQEN's own accumulated fees, not a customer
      // withdrawal) share this queue — flagged so the CEO dashboard can tell them
      // apart instead of showing the company wallet as if it were a user.
      withdrawals: (rows || []).map(r => ({
        ...r,
        user: userMap[r.user_id] || null,
        is_fee_collection: r.user_id === COMPANY_WALLET_ID,
      })),
    });
  } catch (error) {
    console.error('[hdWalletRoutes GET /ceo-withdrawals]', error.message);
    res.status(500).json({ error: 'Failed to load withdrawal requests.' });
  }
});

// GET /api/hd-wallet/ceo-withdrawals/:id/audit
// Read-only — pulls together everything the CEO needs to decide approve/reject on one
// withdrawal request: KYC status, wallet balance, first deposit, recent completed trades
// (what funded the balance — gift card sale, payment-method sale, or straight BTC buy),
// this user's own send-out history, and dispute record. Nothing here mutates any row —
// it's purely informational, called from the "Audit" button next to Approve/Reject.
router.get('/ceo-withdrawals/:id/audit', verifyToken, async (req, res) => {
  try {
    const ceo = await requireCeo(req, res); if (!ceo) return;
    const { id } = req.params;

    const { data: txRow } = await supabaseAdmin
      .from('wallet_transactions').select('*').eq('id', id).eq('type', 'WITHDRAWAL').maybeSingle();
    if (!txRow) return res.status(404).json({ error: 'Withdrawal request not found.' });

    if (txRow.user_id === COMPANY_WALLET_ID) {
      return res.json({ success: true, is_fee_collection: true });
    }

    const userId = txRow.user_id;

    const [
      userR, walletR, firstDepositR, depositAggR,
      recentTradesR, tradeVolumeR, withdrawalHistR, disputeTradesR, btcPrice,
    ] = await Promise.all([
      supabaseAdmin.from('users').select(
        'id, username, email, full_name, created_at, is_email_verified, email_verified, ' +
        'is_phone_verified, phone_verified, is_id_verified, kyc_verified, kyc_status, kyc_submitted_at, ' +
        'account_status, has_warning, total_trades, average_rating, positive_feedback, negative_feedback'
      ).eq('id', userId).maybeSingle(),
      supabaseAdmin.from('wallets').select('balance_btc, locked_balance_btc, balance_usdt, locked_balance_usdt').eq('user_id', userId).maybeSingle(),
      supabaseAdmin.from('wallet_transactions').select('id, currency, amount_btc, amount_usdt, created_at, tx_hash')
        .eq('user_id', userId).eq('type', 'DEPOSIT').eq('status', 'CONFIRMED')
        .order('created_at', { ascending: true }).limit(1).maybeSingle(),
      supabaseAdmin.from('wallet_transactions').select('currency, amount_btc, amount_usdt', { count: 'exact' })
        .eq('user_id', userId).eq('type', 'DEPOSIT').eq('status', 'CONFIRMED').limit(1000),
      supabaseAdmin.from('trades').select(
        'id, status, trade_type, trade_ref, amount_btc, amount_usd, payment_method, gift_card_brand, ' +
        'buyer_id, seller_id, created_at, completed_at'
      ).or(`buyer_id.eq.${userId},seller_id.eq.${userId}`).eq('status', 'COMPLETED')
        .order('completed_at', { ascending: false }).limit(15),
      supabaseAdmin.from('trades').select('amount_usd', { count: 'exact' })
        .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`).eq('status', 'COMPLETED').limit(1000),
      supabaseAdmin.from('wallet_transactions').select(
        'id, currency, amount_btc, amount_usdt, destination_address, status, tx_hash, rejection_reason, created_at, reviewed_at'
      ).eq('user_id', userId).eq('type', 'WITHDRAWAL').neq('id', id)
        .order('created_at', { ascending: false }).limit(15),
      supabaseAdmin.from('trades').select('id, buyer_id, seller_id, dispute_resolution, disputed_at, resolved_at')
        .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`).not('dispute_resolution', 'is', null),
      getLiveBtcPrice().catch(() => null),
    ]);

    const user = userR.data;
    if (!user) return res.status(404).json({ error: 'This withdrawal has no matching user record.' });

    const deposits = depositAggR.data || [];
    const depositTotalBtc  = deposits.reduce((s, d) => s + parseFloat(d.amount_btc || 0), 0);
    const depositTotalUsdt = deposits.reduce((s, d) => s + parseFloat(d.amount_usdt || 0), 0);

    const trades = recentTradesR.data || [];
    const volumeRows = tradeVolumeR.data || [];
    const totalVolumeUsd = volumeRows.reduce((s, t) => s + parseFloat(t.amount_usd || 0), 0);

    const withdrawalHistory = withdrawalHistR.data || [];
    const rejectedCount = withdrawalHistory.filter(w => w.status === 'REJECTED').length;
    const confirmedCount = withdrawalHistory.filter(w => w.status === 'CONFIRMED').length;

    let wins = 0, losses = 0, neutral = 0;
    for (const t of (disputeTradesR.data || [])) {
      const wasBuyer = t.buyer_id === userId;
      if (t.dispute_resolution === 'CANCEL') neutral++;
      else if ((wasBuyer && t.dispute_resolution === 'BUYER_WINS') || (!wasBuyer && t.dispute_resolution === 'SELLER_WINS')) wins++;
      else losses++;
    }

    const kycApproved = !!(user.is_id_verified || user.kyc_verified) && (user.kyc_status ? user.kyc_status === 'approved' : true);
    const accountAgeMs = user.created_at ? Date.now() - new Date(user.created_at).getTime() : null;

    // Flags are signals for the CEO to weigh, not a verdict — no auto approve/reject logic here.
    const flags = [];
    if (!kycApproved) flags.push({ level: 'high', text: 'KYC is not approved for this account' });
    if (user.account_status === 'banned') flags.push({ level: 'high', text: 'Account is banned' });
    if (user.has_warning) flags.push({ level: 'medium', text: 'Account has an active warning' });
    if (accountAgeMs !== null && accountAgeMs < 24 * 3600 * 1000) flags.push({ level: 'high', text: 'Account is less than 24 hours old' });
    if ((volumeRows.length || 0) === 0) flags.push({ level: 'high', text: 'No completed trades — no trading history to explain the funds' });
    if (deposits.length === 0) flags.push({ level: 'medium', text: 'No confirmed deposits on record' });
    if (rejectedCount > 0) flags.push({ level: 'medium', text: `${rejectedCount} previous withdrawal(s) from this user were rejected` });
    if (losses > 0) flags.push({ level: 'medium', text: `Lost ${losses} dispute(s) as the party at fault` });
    if ((user.negative_feedback || 0) > 0) flags.push({ level: 'low', text: `${user.negative_feedback} negative feedback rating(s)` });

    res.json({
      success: true,
      is_fee_collection: false,
      request: {
        currency: txRow.currency, amount_btc: txRow.amount_btc, amount_usdt: txRow.amount_usdt,
        destination_address: txRow.destination_address, created_at: txRow.created_at,
      },
      user: { ...user, kyc_approved: kycApproved },
      wallet: walletR.data || { balance_btc: 0, locked_balance_btc: 0, balance_usdt: 0, locked_balance_usdt: 0 },
      btcUsdPrice: btcPrice,
      firstDeposit: firstDepositR.data || null,
      deposits: {
        count: depositAggR.count ?? deposits.length,
        totalBtc: depositTotalBtc, totalUsdt: depositTotalUsdt,
        capped: deposits.length >= 1000,
      },
      trades: {
        recent: trades,
        totalCompleted: tradeVolumeR.count ?? volumeRows.length,
        totalVolumeUsd,
        capped: volumeRows.length >= 1000,
      },
      withdrawals: {
        history: withdrawalHistory,
        confirmedCount, rejectedCount,
      },
      disputes: { wins, losses, neutral, total: wins + losses + neutral },
      flags,
    });
  } catch (error) {
    console.error('[hdWalletRoutes GET /ceo-withdrawals/:id/audit]', error.message);
    res.status(500).json({ error: 'Failed to load audit details: ' + error.message });
  }
});

// POST /api/hd-wallet/ceo-withdrawals/:id/approve
router.post('/ceo-withdrawals/:id/approve', verifyToken, async (req, res) => {
  // Declared here (not inside the try block) so the catch block below can still see it —
  // it tracks whether it's safe to release the PROCESSING claim back to PENDING_APPROVAL.
  let revertOnFailure = true;
  try {
    const ceo = await requireCeo(req, res); if (!ceo) return;
    const { id } = req.params;
    const force = !!req.body.force;

    const { data: txRow } = await supabaseAdmin
      .from('wallet_transactions').select('*').eq('id', id).eq('status', 'PENDING_APPROVAL').maybeSingle();
    if (!txRow) return res.status(404).json({ error: 'No pending withdrawal found with that ID — it may have already been reviewed.' });

    // Re-check the withdrawal OWNER's current ban status (not the approving CEO's) —
    // an account banned after the withdrawal was requested must never be approved.
    // Checked before the PROCESSING claim below so a rejection here leaves the row
    // untouched at PENDING_APPROVAL — no status flip, no audit-trail loss.
    if (await isUserBanned(txRow.user_id)) {
      return res.status(403).json({
        error: 'ACCOUNT_BANNED',
        message: 'This withdrawal belongs to a banned account and cannot be approved.',
      });
    }

    // Atomically claim this row before sending anything — flips PENDING_APPROVAL -> PROCESSING
    // only if it's still PENDING_APPROVAL. A double-click, a duplicate approve request, or two
    // CEO sessions hitting approve at once will only ever have ONE of them win this update;
    // the rest get a 409 instead of a second on-chain send of the same withdrawal.
    const { data: claimed, error: claimErr } = await supabaseAdmin
      .from('wallet_transactions')
      .update({ status: 'PROCESSING' })
      .eq('id', id)
      .eq('status', 'PENDING_APPROVAL')
      .select('id');
    if (claimErr) throw claimErr;
    if (!claimed || claimed.length === 0) {
      return res.status(409).json({ error: 'This withdrawal is already being processed by another approval request — refresh and check its status before retrying.' });
    }
    // If anything below fails WITHOUT a broadcast having happened, revertOnFailure (declared
    // above the try block) stays true and we put this row back to PENDING_APPROVAL so the CEO
    // can safely retry. Once a send actually broadcasts, it flips to false — every code path
    // after that ends in a terminal status (CONFIRMED or queued PENDING).

    const isUsdt = txRow.currency === 'USDT';
    // Company fee-collection cash-outs (see server.js POST /api/admin/hot-wallet/collect-fees)
    // share this exact queue and approve flow, tagged by user_id === COMPANY_WALLET_ID instead
    // of a real customer. platformFee is always 0 on those rows, so the fee-credit calls below
    // are no-ops for them regardless — this flag only controls the FEE ledger row and the
    // notification wording, which would otherwise misleadingly describe PRAQEN's own cash-out
    // as "a fee from user <company wallet id>" / "your withdrawal."
    const isFeeCollection = txRow.user_id === COMPANY_WALLET_ID;
    const platformFee = isUsdt ? parseFloat(txRow.platform_fee_usdt || 0) : parseFloat(txRow.platform_fee_btc || 0);
    const sendAmount = isUsdt ? parseFloat(txRow.amount_usdt) : parseFloat(txRow.amount_btc);
    const { data: targetUser } = await supabaseAdmin
      .from('users').select('id, email, username').eq('id', txRow.user_id).single();

    let result;
    try {
      result = isUsdt
        ? await tronHotWallet.sendUsdtToExternal(txRow.destination_address, sendAmount)
        : await hdWallet.sendWithdrawal(txRow.user_id, txRow.destination_address, sendAmount);
    } catch (sendErr) {
      const lowHotWallet = isUsdt
        ? /^HOT_WALLET_(USDT|TRX)_INSUFFICIENT/.test(sendErr.message || '')
        : (sendErr.message?.startsWith('HOT_WALLET_INSUFFICIENT') || sendErr.message?.startsWith('INSUFFICIENT_UTXOS'));
      if (lowHotWallet && force) {
        // CEO force-approved despite a low hot wallet — queue it (funds stay deducted from the
        // user, fee is still earned) instead of broadcasting; the sweep/retry job picks it up.
        const ts = new Date().toISOString();
        if (isUsdt) {
          await tronHotWallet.creditFeeToCompany(platformFee, `USDT withdrawal fee from ${txRow.user_id.slice(0, 8)} — force-approved, queued`);
        } else {
          const { data: cw } = await supabaseAdmin.from('wallets').select('balance_btc').eq('user_id', COMPANY_WALLET_ID).maybeSingle();
          const ncb = parseFloat((parseFloat(cw?.balance_btc || 0) + platformFee).toFixed(8));
          const [walletFeeResult, mirrorFeeResult] = await Promise.all([
            hdWallet.setWalletBalance(COMPANY_WALLET_ID, ncb),
            supabaseAdmin.from('user_balances').upsert({ user_id: COMPANY_WALLET_ID, balance_btc: ncb, updated_at: ts }, { onConflict: 'user_id' }),
          ]);
          await flagCompanyFeeCreditFailureIfAny(walletFeeResult, mirrorFeeResult, ncb, 'CEO withdrawal-approve BTC company fee (force-approved/queued path)');
        }
        await supabaseAdmin.from('wallet_transactions').update({
          status: 'PENDING', reviewed_by: ceo.id, reviewed_at: ts,
          notes: `${txRow.notes || ''} — PRAQEN-approved ${ts}; queued (hot wallet low, force-approved).`,
        }).eq('id', id);
        if (!isUsdt && targetUser?.email) {
          emailService.sendTxReceiptEmail(
            { id: targetUser.id, email: targetUser.email, username: targetUser.username },
            { type: 'WITHDRAWAL', amount_btc: sendAmount, status: 'PENDING',
              destination_address: txRow.destination_address, fee_btc: platformFee,
              notes: 'Confirmed by PRAQEN — broadcasting shortly.', created_at: ts }
          ).catch(() => {});
        }
        return res.json({ success: true, queued: true, message: 'Approved — queued for broadcast (hot wallet is currently low).' });
      }
      throw sendErr;
    }

    // Broadcast succeeded — from this point on, funds have (or may have) already moved
    // on-chain. Never revert this row back to PENDING_APPROVAL after this point, even if
    // something below fails (fee crediting, DB update) — that would let the CEO retry and
    // send a second payout for a withdrawal that already went out.
    revertOnFailure = false;

    // Credit the platform fee and mark this reviewed + confirmed
    const ts = new Date().toISOString();
    if (isUsdt) {
      await tronHotWallet.creditFeeToCompany(platformFee, `USDT withdrawal fee from ${txRow.user_id.slice(0, 8)} — PRAQEN-approved`);
    } else {
      const { data: companyWallet } = await supabaseAdmin.from('wallets').select('balance_btc').eq('user_id', COMPANY_WALLET_ID).maybeSingle();
      const newCompanyBalance = parseFloat((parseFloat(companyWallet?.balance_btc || 0) + platformFee).toFixed(8));
      const [walletFeeResult, mirrorFeeResult] = await Promise.all([
        hdWallet.setWalletBalance(COMPANY_WALLET_ID, newCompanyBalance),
        supabaseAdmin.from('user_balances').upsert({ user_id: COMPANY_WALLET_ID, balance_btc: newCompanyBalance, updated_at: ts }, { onConflict: 'user_id' }),
      ]);
      // Never throws (see flagCompanyFeeCreditFailureIfAny below) — this runs after
      // revertOnFailure = false above, so a fee-credit failure here must only be
      // logged/flagged, never allowed to affect the already-broadcast withdrawal.
      await flagCompanyFeeCreditFailureIfAny(walletFeeResult, mirrorFeeResult, newCompanyBalance, 'CEO withdrawal-approve BTC company fee (confirmed/broadcast path)');
    }
    await supabaseAdmin.from('wallet_transactions').update({
      status: 'CONFIRMED', tx_hash: result.txid, reviewed_by: ceo.id, reviewed_at: ts,
      notes: `${txRow.notes || ''} — Confirmed by PRAQEN ${ts}.`,
    }).eq('id', id);
    // A fee-collection row has no platform fee to log against itself — skip the FEE
    // ledger entry entirely rather than insert a $0 "fee from user <company wallet id>" row.
    if (!isFeeCollection) {
      await supabaseAdmin.from('wallet_transactions').insert(isUsdt ? {
        user_id: COMPANY_WALLET_ID, type: 'FEE', currency: 'USDT', amount_usdt: platformFee, status: 'CONFIRMED',
        tx_hash: `${result.txid}_FEE`, notes: `USDT blockchain fee from user ${txRow.user_id.slice(0, 8)} — PRAQEN-approved withdrawal`, created_at: ts,
      } : {
        user_id: COMPANY_WALLET_ID, type: 'FEE', amount_btc: platformFee, status: 'CONFIRMED',
        tx_hash: result.txid, notes: `Blockchain fee from user ${txRow.user_id.slice(0, 8)} — PRAQEN-approved withdrawal`, created_at: ts,
      });
    }

    // BTC has a dedicated tx-receipt email template; USDT relies on the in-app notification
    // inserted below for now (scope decision — extending that email template is separate work).
    if (!isUsdt && targetUser?.email) {
      emailService.sendTxReceiptEmail(
        { id: targetUser.id, email: targetUser.email, username: targetUser.username },
        { type: 'WITHDRAWAL', amount_btc: sendAmount, status: 'CONFIRMED',
          destination_address: txRow.destination_address, fee_btc: platformFee, tx_hash: result.txid,
          notes: 'Confirmed by PRAQEN and sent.', created_at: ts }
      ).catch(() => {});
    }
    supabaseAdmin.from('notifications').insert({
      user_id: txRow.user_id, type: 'wallet',
      title: isFeeCollection ? '✅ Fee Collection Sent' : '✅ Withdrawal Approved & Sent',
      message: isFeeCollection
        ? `Fee collection of ₮${sendAmount.toFixed(2)} to the cold wallet has been confirmed.`
        : (isUsdt
          ? `Your withdrawal of ₮${sendAmount.toFixed(2)} has been confirmed and is on its way.`
          : `Your withdrawal of ₿${sendAmount.toFixed(8)} has been confirmed and is on its way.`),
      action: '/wallet', is_read: false, created_at: ts,
    }).then(null, () => {});

    console.log(`✅ [CEO] Approved ${isFeeCollection ? 'fee collection' : 'withdrawal'} ${id} — ${isUsdt ? '₮' : '₿'}${sendAmount} → ${txRow.destination_address} | TX ${result.txid} | by ${ceo.email}`);
    res.json({ success: true, txid: result.txid, message: 'Withdrawal approved and broadcast.' });
  } catch (error) {
    console.error('[hdWalletRoutes POST /ceo-withdrawals/:id/approve]', error.message);
    const id = req.params.id;
    if (revertOnFailure) {
      // Nothing broadcast yet — safe to release the claim so the CEO can retry.
      await supabaseAdmin.from('wallet_transactions')
        .update({ status: 'PENDING_APPROVAL' })
        .eq('id', id).eq('status', 'PROCESSING')
        .then(null, (e) => console.error(`[hdWalletRoutes] failed to release PROCESSING claim on ${id}:`, e.message));
    } else {
      // Funds already left the hot wallet but something after that failed (fee credit,
      // DB update). Leaving this at PROCESSING on purpose — it must NOT go back to
      // PENDING_APPROVAL, or a retry would send a second payout. This needs a human to
      // reconcile: check the on-chain tx history for this row's destination/amount and
      // manually mark it CONFIRMED with the real tx_hash.
      console.error(`🚨 [hdWalletRoutes] Withdrawal ${id} may have broadcast on-chain but failed to finalize in the DB — left at PROCESSING, needs manual reconciliation. Error: ${error.message}`);
    }
    if (error.message?.startsWith('HOT_WALLET_INSUFFICIENT') || error.message?.startsWith('INSUFFICIENT_UTXOS') || /^HOT_WALLET_(USDT|TRX)_INSUFFICIENT/.test(error.message || '')) {
      // Surface the specific shortage (e.g. "TRX gas" vs "USDT balance") instead of a
      // generic message — USDT balance and TRX gas are two different things to top up,
      // and collapsing them into one message left the CEO guessing which one was short.
      const detail = error.message.replace(/^HOT_WALLET_(USDT|TRX)_INSUFFICIENT:\s*/, '').replace(/^HOT_WALLET_INSUFFICIENT:\s*/, '');
      return res.status(503).json({
        error: `Hot wallet has insufficient funds to broadcast this right now — ${detail} Or retry with "force" to queue it for later.`,
        hotWalletLow: true,
      });
    }
    res.status(500).json({ error: 'Failed to approve withdrawal: ' + error.message });
  }
});

// POST /api/hd-wallet/ceo-withdrawals/:id/reject  { reason }
// Returns the full reserved amount (payout + fee) to the user — nothing was ever broadcast.
router.post('/ceo-withdrawals/:id/reject', verifyToken, async (req, res) => {
  try {
    const ceo = await requireCeo(req, res); if (!ceo) return;
    const { id } = req.params;
    const reason = (req.body.reason || '').trim();
    if (!reason) return res.status(400).json({ error: 'A rejection reason is required.' });

    // Atomic claim + refund + finalize, all in one Postgres transaction — see
    // database/2026-08-25_balance_integrity_fix.sql, function
    // praqen_reject_withdrawal. This replaces the old flow, which (unlike its
    // approve sibling) had no atomic claim before crediting the refund — two
    // concurrent reject calls on the same withdrawal could both refund it. The
    // function claims PENDING_APPROVAL -> PROCESSING first (only one caller
    // wins), and releases the claim back to PENDING_APPROVAL if the refund
    // itself fails, so a retry is always safe.
    let txRow, refundAmount;
    try {
      const { data: preRow } = await supabaseAdmin
        .from('wallet_transactions').select('*').eq('id', id).maybeSingle();
      if (!preRow) return res.status(404).json({ error: 'No withdrawal found with that ID.' });
      txRow = preRow;

      const { data: rpcRows, error: rejectErr } = await supabaseAdmin.rpc('praqen_reject_withdrawal', {
        p_tx_id:  id,
        p_ceo_id: ceo.id,
        p_reason: reason,
      });
      if (rejectErr) throw rejectErr;
      const row = Array.isArray(rpcRows) ? rpcRows[0] : rpcRows;
      refundAmount = parseFloat(row.refunded_amount);

      // Keep swapService._assertLedgerTrueBtc's reference current — praqen_reject_withdrawal
      // has no balance_audit insert of its own, so without this a BTC withdrawal reject
      // drifts wallets.balance_btc away from the last escrow/swap-stamped figure and falsely
      // blocks this account's next BTC->USDT swap attempt. USDT side already covered by the
      // 'WITHDRAWAL' stamp taken when the withdrawal was first requested.
      if (row.refunded_currency !== 'USDT') {
        const { data: postWal } = await supabaseAdmin.from('wallets').select('balance_btc').eq('user_id', row.refunded_user_id).maybeSingle();
        if (postWal) {
          supabaseAdmin.from('balance_audit').insert({
            user_id: row.refunded_user_id, change_btc: refundAmount, new_balance: parseFloat(postWal.balance_btc),
            reason: 'WITHDRAWAL_REJECTED', created_at: new Date().toISOString(),
          }).then(null, e => console.error('[ceo-withdrawals/reject] ledger stamp failed:', e.message));
        }
      }
    } catch (rejectErr) {
      if (/ALREADY_REVIEWED/.test(rejectErr.message || '')) {
        return res.status(404).json({ error: 'No pending withdrawal found with that ID — it may have already been reviewed.' });
      }
      console.error('[hdWalletRoutes POST /ceo-withdrawals/:id/reject] praqen_reject_withdrawal failed:', rejectErr.message);
      return res.status(500).json({ error: 'Failed to reject withdrawal: ' + rejectErr.message });
    }

    const isUsdt = txRow.currency === 'USDT';
    const isFeeCollection = txRow.user_id === COMPANY_WALLET_ID;
    const sendAmount = isUsdt ? parseFloat(txRow.amount_usdt) : parseFloat(txRow.amount_btc);
    const userId = txRow.user_id;

    // A CEO's rejection reason is often the actual next-step instruction (e.g.
    // "please use BTC instead") — this used to only reach BTC users, since the
    // rejection email only fired for !isUsdt. USDT users got nothing but an
    // in-app notification, easy to miss, which is how a reason telling someone
    // to switch withdrawal methods went unseen and they just resubmitted the
    // same USDT withdrawal again. Both currencies now get the email.
    const { data: targetUser } = await supabaseAdmin.from('users').select('id, email, username').eq('id', userId).single();
    if (!isFeeCollection && targetUser?.email) {
      emailService.sendWithdrawalRejectedEmail(targetUser, sendAmount, reason, isUsdt ? 'USDT' : 'BTC').catch(() => {});
    }
    const symbol = isUsdt ? '₮' : '₿';
    const decimals = isUsdt ? 2 : 8;
    supabaseAdmin.from('notifications').insert({
      user_id: userId, type: 'wallet',
      title: isFeeCollection ? '⚠️ Fee Collection Declined' : '⚠️ Withdrawal Declined',
      message: isFeeCollection
        ? `Fee collection of ${symbol}${sendAmount.toFixed(decimals)} was declined — the full amount was returned to the company wallet. Reason: ${reason}`
        : `We weren't able to complete your withdrawal of ${symbol}${sendAmount.toFixed(decimals)} — the full amount (${symbol}${refundAmount.toFixed(decimals)}) was returned to your wallet. Next step: ${reason}`,
      action: '/wallet', is_read: false, created_at: new Date().toISOString(),
    }).then(null, () => {});

    console.log(`⛔ [CEO] Rejected ${isFeeCollection ? 'fee collection' : 'withdrawal'} ${id} — ${symbol}${refundAmount} refunded to ${userId.slice(0,8)} | by ${ceo.email} | reason: ${reason}`);
    res.json({ success: true, message: isFeeCollection ? 'Fee collection rejected and funds returned to the company wallet.' : 'Withdrawal rejected and funds returned to the user.' });
  } catch (error) {
    console.error('[hdWalletRoutes POST /ceo-withdrawals/:id/reject]', error.message);
    res.status(500).json({ error: 'Failed to reject withdrawal: ' + error.message });
  }
});

// ============================================================
// GET /api/hd-wallet/transactions
// Returns user's full transaction history
// ============================================================
router.get('/transactions', verifyToken, async (req, res) => {
  try {
    const userId = req.userId;

    const { data: txs, error } = await supabaseAdmin
      .from('wallet_transactions')
      .select('*')
      .eq('user_id', userId)
      .neq('type', 'SWEEP')        // internal platform operation — never shown to users
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;

    res.json({
      success:      true,
      transactions: txs || [],
      count:        txs?.length || 0,
    });

  } catch (error) {
    console.error('[hdWalletRoutes GET /transactions]', error.message);
    res.status(500).json({ error: 'Failed to load transactions. Please try again.' });
  }
});

// ============================================================
// POST /api/hd-wallet/escrow-address
// Generate escrow address for a trade
// Called when trade is created
// ============================================================
router.post('/escrow-address', verifyToken, async (req, res) => {
  try {
    const { tradeId } = req.body;
    if (!tradeId) return res.status(400).json({ error: 'Trade ID is required' });

    const addrData = hdWallet.generateEscrowAddress(tradeId);

    res.json({
      success:       true,
      escrow_address: addrData.address,
      trade_id:      tradeId,
      network:       addrData.network,
    });

  } catch (error) {
    console.error('[hdWalletRoutes POST /escrow-address]', error.message);
    res.status(500).json({ error: 'Failed to create escrow address. Please try again.' });
  }
});

// ============================================================
// GET /api/hd-wallet/hot-wallet
// Returns platform hot wallet address + on-chain balance
// (admin use — fund this address to enable user withdrawals)
// ============================================================
router.get('/hot-wallet', verifyToken, async (req, res) => {
  try {
    // Was gated by verifyToken only — any logged-in trader could read the live hot-wallet
    // address and balance. Only the admin/moderator/CEO team should see this.
    const admin = await requireAdminOrCeo(req, res); if (!admin) return;
    const info = await hdWallet.getHotWalletBalance();
    const total = info.total_btc ?? info.confirmed_btc;
    res.json({
      success:            true,
      hot_wallet_address: info.address,
      confirmed_btc:      info.confirmed_btc,
      unconfirmed_btc:    info.unconfirmed_btc,
      total_btc:          total,
      tx_count:           info.tx_count,
      source:             info.source,
      balance_error:      info.error || null,
      message: total > 0
        ? `Hot wallet: ${info.confirmed_btc.toFixed(8)} BTC confirmed` +
          (info.unconfirmed_btc > 0 ? ` + ${info.unconfirmed_btc.toFixed(8)} BTC pending` : '')
        : 'Hot wallet is empty — send BTC to the address above to enable user withdrawals',
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// GET /api/hd-wallet/network
// Returns current network (testnet or mainnet)
// ============================================================
router.get('/network', (req, res) => {
  try {
    const network = hdWallet.getNetwork();
    res.json({
      success: true,
      network,
      message: network === 'testnet'
        ? '⚠️ TESTNET — Using fake BTC for development'
        : '✅ MAINNET — Real Bitcoin',
    });
  } catch (error) {
    console.error('[hdWalletRoutes GET /network]', error.message);
    res.status(500).json({ error: 'Failed to get network info.' });
  }
});

// ============================================================
// GET /api/hd-wallet/info
// Returns PRAQEN fee wallet address and system info
// ============================================================
router.get('/info', verifyToken, async (req, res) => {
  try {
    const info = hdWallet.getInfo();
    res.json({ success: true, ...info });
  } catch (error) {
    console.error('[hdWalletRoutes GET /info]', error.message);
    res.status(500).json({ error: 'Failed to get wallet info.' });
  }
});

// ============================================================
// GET /api/hd-wallet/realtime-status
// Shows whether the WebSocket deposit monitor is connected
// Useful for debugging — call this to confirm real-time is live
// ============================================================
router.get('/realtime-status', verifyToken, async (req, res) => {
  try {
    const status = realtimeDepositService.getStatus();
    res.json({
      success: true,
      realtime: {
        connected:         status.connected,
        monitored_wallets: status.monitored_wallets,
        reconnect_delay_s: status.reconnect_delay_s,
        message:           status.connected
          ? `Real-time WebSocket connected — monitoring ${status.monitored_wallets} wallet(s)`
          : `WebSocket disconnected — reconnecting in ${status.reconnect_delay_s}s. 5-min scanner still active.`,
      },
      scanner: depositMonitor.getStatus(),
    });
  } catch (error) {
    console.error('[hdWalletRoutes GET /realtime-status]', error.message);
    res.status(500).json({ error: 'Failed to get realtime status.' });
  }
});

module.exports = router;
