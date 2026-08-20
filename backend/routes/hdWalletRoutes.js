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

// ── Withdrawal fee — flat 3% — returns { feeUsd, feeBtc, label } ─────────────
function calcWithdrawalFee(amountBtc, btcPrice) {
  const amountUsd = Math.round(amountBtc * btcPrice * 100) / 100;
  const feeUsd = amountUsd * 0.03;
  const feeBtc = parseFloat((feeUsd / btcPrice).toFixed(8));
  return { feeUsd: parseFloat(feeUsd.toFixed(2)), feeBtc, label: '3% fee' };
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

        let healed = 0;
        for (const lock of locks) {
            const { data: trade } = await supabaseAdmin
                .from('trades').select('id, status').eq('id', lock.trade_id).single();

            if (!trade) continue;
            // Only auto-refund when the trade is definitively over
            if (!['CANCELLED', 'COMPLETED'].includes(trade.status)) continue;

            const amount = parseFloat(lock.amount_btc || 0);
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
        const [{ data: walletRow, error: walletErr }, liveBtcPrice] = await Promise.all([
            supabaseAdmin.from('wallets').select('balance_btc, locked_balance_btc, balance_usdt, locked_balance_usdt').eq('user_id', userId).single(),
            getLiveBtcPrice(),
        ]);

        if (walletErr || !walletRow) {
            console.error(`[Wallet] No wallet row for user ${userId}:`, walletErr?.message);
            return res.status(404).json({ error: 'Wallet not found for this user' });
        }

        const available_btc = parseFloat(walletRow.balance_btc || 0);
        const locked_btc    = parseFloat(walletRow.locked_balance_btc || 0);
        const total_btc     = parseFloat((available_btc + locked_btc).toFixed(8));
        const balance_usd   = parseFloat((total_btc * liveBtcPrice).toFixed(2));

        console.log(`[Wallet] user=${userId.slice(0,8)} avail=${available_btc} locked=${locked_btc} total=${total_btc} price=${liveBtcPrice} usd=${balance_usd}`);

        // BTC deposit address — from user_wallets or users table (display only, NOT for balance)
        const { data: uwRow } = await supabaseAdmin
            .from('user_wallets').select('btc_address').eq('user_id', userId).maybeSingle();
        let address = uwRow?.btc_address || null;
        if (!address) {
            const { data: userRow } = await supabaseAdmin
                .from('users').select('bitcoin_wallet_address').eq('id', userId).single();
            address = userRow?.bitcoin_wallet_address || null;
        }

        const { data: txs } = await supabaseAdmin
            .from('wallet_transactions')
            .select('id, type, status, currency, amount_btc, amount_usdt, tx_hash, notes, created_at')
            .eq('user_id', userId)
            .neq('type', 'SWEEP')  // internal platform operation — never shown to users
            .order('created_at', { ascending: false })
            .limit(50);

        res.json({
            success:      true,
            address,
            balance_btc:  total_btc,
            available_btc,
            locked_btc,
            balance_usd,
            balance_usdt:        parseFloat(walletRow.balance_usdt || 0),
            locked_balance_usdt: parseFloat(walletRow.locked_balance_usdt || 0),
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

// ============================================================
// POST /api/hd-wallet/check-deposit
// Manually trigger deposit check for this user
// Called when user clicks "Check for New Payments"
// ============================================================
router.post('/check-deposit', verifyToken, async (req, res) => {
  try {
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
      .from('user_balances').select('balance_btc').eq('user_id', sellerId).single();
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

router.post('/send', verifyToken, sendLimiter, async (req, res) => {
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

      const { data: senderBal } = await supabaseAdmin
        .from('wallets').select('balance_btc').eq('user_id', userId).single();
      available = parseFloat(senderBal?.balance_btc || 0);
      if (available < amount) {
        return res.status(400).json({
          error: `Insufficient balance. Available: ${available.toFixed(8)} BTC, Requested: ${amount.toFixed(8)} BTC`,
        });
      }

      const newSenderBalance    = parseFloat((available - amount).toFixed(8));
      const { data: recipBal }  = await supabaseAdmin
        .from('wallets').select('balance_btc').eq('user_id', recipientId).single();
      const newRecipientBalance = parseFloat((parseFloat(recipBal?.balance_btc || 0) + amount).toFixed(8));

      // Deduct sender — keep all three tables in sync
      await Promise.all([
        supabaseAdmin.from('wallets')
          .update({ balance_btc: newSenderBalance, updated_at: new Date().toISOString() })
          .eq('user_id', userId),
        supabaseAdmin.from('user_balances')
          .update({ balance_btc: newSenderBalance, updated_at: new Date().toISOString() })
          .eq('user_id', userId),
        supabaseAdmin.from('user_wallets')
          .update({ balance_btc: newSenderBalance, updated_at: new Date().toISOString() })
          .eq('user_id', userId),
      ]);

      // Credit recipient — keep all three tables in sync (wallets via safe select-then-write; see setWalletBalance)
      await Promise.all([
        hdWallet.setWalletBalance(recipientId, newRecipientBalance),
        supabaseAdmin.from('user_balances')
          .upsert({ user_id: recipientId, balance_btc: newRecipientBalance, updated_at: new Date().toISOString() }, { onConflict: 'user_id' }),
        supabaseAdmin.from('user_wallets')
          .update({ balance_btc: newRecipientBalance, updated_at: new Date().toISOString() })
          .eq('user_id', recipientId),
      ]);

      const crypto = require('crypto');
      const txRef  = 'INT_' + crypto
        .createHash('sha256').update(`${userId}:${recipientId}:${amount}:${Date.now()}`).digest('hex')
        .slice(0, 20).toUpperCase();

      await supabaseAdmin.from('wallet_transactions').insert([
        {
          user_id: userId, type: 'TRANSFER_OUT', amount_btc: amount,
          status: 'CONFIRMED', tx_hash: txRef,
          notes: `Internal transfer → PRAQEN user · No fee`,
          created_at: new Date().toISOString(),
        },
        {
          user_id: recipientId, type: 'TRANSFER_IN', amount_btc: amount,
          status: 'CONFIRMED', tx_hash: txRef,
          notes: `Internal transfer received · No fee`,
          created_at: new Date().toISOString(),
        },
      ]);

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

    // ── Tiered PRAQEN withdrawal fee ─────────────────────────────────────────
    const liveBtcPrice = await getLiveBtcPrice();
    const feeResult = calcWithdrawalFee(amount, liveBtcPrice);
    platformFee = feeResult.feeBtc;
    platformFeeUsd = feeResult.feeUsd;
    feeLabel = feeResult.label;
    amountUserReceives = parseFloat((amount - platformFee).toFixed(8));

    if (available < amount) {
      return res.status(400).json({
        error: `Insufficient balance. Available: ₿${available.toFixed(8)}, requested ₿${amount.toFixed(8)} (includes ${feeLabel} = ₿${platformFee.toFixed(8)})`,
      });
    }

    if (amountUserReceives <= 0) {
      return res.status(400).json({ error: 'Amount too small after fee deduction.' });
    }

    console.log(`[hdWalletRoutes] On-chain send: ₿${amountUserReceives} (+ ₿${platformFee} ${feeLabel}) from ${userId.slice(0,8)} → ${toAddress}`);

    // ── Deduct BEFORE broadcasting, with an optimistic lock ────────────────────
    // Broadcasting first and deducting only after success (the old order) let two
    // concurrent requests both read the same `available`, both pass the balance
    // check above, and both broadcast a real on-chain send before either
    // deduction landed — an actual double-spend of hot-wallet funds. Deducting
    // first (and restoring it on any genuine failure below) closes that race.
    newBalance = parseFloat((available - amount).toFixed(8));
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
    await Promise.all([
      supabaseAdmin.from('user_balances').update({ balance_btc: newBalance, updated_at: new Date().toISOString() }).eq('user_id', userId),
      supabaseAdmin.from('user_wallets').update({ balance_btc: newBalance, updated_at: new Date().toISOString() }).eq('user_id', userId),
    ]);
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
        await Promise.all([
          supabaseAdmin.from('user_balances').update({ balance_btc: available, updated_at: new Date().toISOString() }).eq('user_id', userId),
          supabaseAdmin.from('user_wallets').update({ balance_btc: available, updated_at: new Date().toISOString() }).eq('user_id', userId),
        ]);
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

async function requireCeo(req, res) {
  const { data: u } = await supabaseAdmin
    .from('users').select('id, is_ceo, email, username').eq('id', req.userId).single();
  const ok = !!(u?.is_ceo || u?.email === ADMIN_EMAIL);
  if (!ok) { res.status(403).json({ error: 'CEO access required' }); return null; }
  return u;
}

// GET /api/hd-wallet/ceo/treasury
// One-shot overview for the CEO dashboard: BTC hot wallet, Tron gas + USDT hot
// wallet, the company/master wallet's BTC & USDT balances, and swap fee revenue.
router.get('/ceo/treasury', verifyToken, async (req, res) => {
  const COMPANY_WALLET_ID = '14762cd0-d3b2-474f-acab-fe0071961e9a';
  try {
    const ceo = await requireCeo(req, res); if (!ceo) return;

    const [hotBtcR, tronR, companyR, swapFeesR, recentSwapsR] = await Promise.allSettled([
      hdWallet.getHotWalletBalance(),
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
    const since7dMs = nowMs - 7 * 86400000;
    const since7dISO = new Date(since7dMs).toISOString();
    const todayStartMs = new Date().setHours(0, 0, 0, 0);

    const [
      depositsR, withdrawalsR, tradesR,
      pendingWdR, pendingKycR, pendingDisputesR, pendingMigrationR,
      newUsersR, activityR, totalUsersR,
      tradeFeesR, swapFeesR,
    ] = await Promise.allSettled([
      // 7d window fetched once; 24h is derived from the same rows below — avoids a second
      // round trip for the overlapping window. Bounded .limit() matches the existing
      // swap_transactions precedent above ("fine at current volume, move to a DB-side
      // aggregate once this scan gets expensive").
      supabaseAdmin.from('wallet_transactions').select('amount_btc, amount_usdt, created_at')
        .eq('type', 'DEPOSIT').eq('status', 'CONFIRMED').gte('created_at', since7dISO).limit(5000),
      // Also pulls platform_fee_btc/platform_fee_usdt — same rows feed both "money out"
      // (amount_btc/usdt, what the user received) and the withdrawal-fee breakdown below
      // (what PRAQEN collected, in whichever currency), so this is fetched once, not twice.
      supabaseAdmin.from('wallet_transactions').select('amount_btc, amount_usdt, platform_fee_btc, platform_fee_usdt, created_at')
        .eq('type', 'WITHDRAWAL').eq('status', 'CONFIRMED').gte('created_at', since7dISO).limit(5000),
      supabaseAdmin.from('trades').select('amount_usd, amount_btc, created_at')
        .eq('status', 'COMPLETED').gte('created_at', since7dISO).limit(5000),
      supabaseAdmin.from('wallet_transactions').select('id', { count: 'exact', head: true })
        .eq('type', 'WITHDRAWAL').eq('status', 'PENDING_APPROVAL'),
      supabaseAdmin.from('users').select('id', { count: 'exact', head: true }).eq('kyc_status', 'pending'),
      supabaseAdmin.from('trades').select('id', { count: 'exact', head: true }).eq('status', 'DISPUTED'),
      supabaseAdmin.from('p2p_migration_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabaseAdmin.from('users').select('id, created_at').gte('created_at', since7dISO).limit(5000),
      supabaseAdmin.from('team_activity_log').select('actor, action, details, category, created_at')
        .order('created_at', { ascending: false }).limit(20),
      supabaseAdmin.from('users').select('id', { count: 'exact', head: true }),
      // Trade fees — company_profits is the canonical trade-fee ledger, written by
      // tradeEscrowService._creditCompanyFee-equivalent logic on every completed release.
      supabaseAdmin.from('company_profits').select('profit_btc, profit_usdt, profit_usd, collected_at')
        .gte('collected_at', since7dISO).limit(5000),
      // Swap fees — swap_transactions.fee_btc/fee_usdt, written by swapService._recordSwap
      // alongside the actual company-wallet credit (see swapService.js:_creditCompanyFee).
      supabaseAdmin.from('swap_transactions').select('fee_btc, fee_usdt, created_at')
        .gte('created_at', since7dISO).limit(5000),
    ]);

    // Splits an already-fetched 7d row set into 24h/7d sums for both currency columns.
    // Compares as real Date values (not raw ISO strings) so it's correct regardless of the
    // exact timestamp precision/offset format Postgres returns.
    // btcField/usdtField/tsField are configurable so this same windowing logic works for
    // deposits/withdrawals (amount_btc/amount_usdt/created_at), trade fees (profit_btc/
    // profit_usdt/collected_at from company_profits), and swap fees (fee_btc/fee_usdt/
    // created_at from swap_transactions) without three near-duplicate reducers.
    const sumWindow = (rows, btcField = 'amount_btc', usdtField = 'amount_usdt', tsField = 'created_at') => {
      const r24 = { btc: 0, usdt: 0 }, r7 = { btc: 0, usdt: 0 };
      for (const row of rows) {
        const btc = parseFloat(row[btcField] || 0);
        const usdt = usdtField ? parseFloat(row[usdtField] || 0) : 0;
        r7.btc += btc; r7.usdt += usdt;
        if (new Date(row[tsField]).getTime() >= since24hMs) { r24.btc += btc; r24.usdt += usdt; }
      }
      return {
        last24h: { btc: parseFloat(r24.btc.toFixed(8)), usdt: parseFloat(r24.usdt.toFixed(2)) },
        last7d: { btc: parseFloat(r7.btc.toFixed(8)), usdt: parseFloat(r7.usdt.toFixed(2)) },
      };
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
      let v24 = 0, v7 = 0, c24 = 0, c7 = 0;
      for (const t of tradeRows) {
        const usd = parseFloat(t.amount_usd || 0);
        v7 += usd; c7++;
        if (new Date(t.created_at).getTime() >= since24hMs) { v24 += usd; c24++; }
      }
      return {
        last24h: { usd: parseFloat(v24.toFixed(2)), count: c24 },
        last7d: { usd: parseFloat(v7.toFixed(2)), count: c7 },
      };
    })();

    const newUsersRows = newUsersR.status === 'fulfilled' ? (newUsersR.value.data || []) : [];
    const countOf = (r) => r.status === 'fulfilled' ? (r.value.count || 0) : 0;
    const newUsers = {
      today: newUsersRows.filter(u => new Date(u.created_at).getTime() >= todayStartMs).length,
      week: newUsersRows.length,
      total: countOf(totalUsersR),
    };

    res.json({
      success: true,
      moneyIn, moneyOut, tradeVolume, newUsers, fees,
      pending: {
        withdrawals: countOf(pendingWdR),
        kyc: countOf(pendingKycR),
        disputes: countOf(pendingDisputesR),
        p2pMigration: countOf(pendingMigrationR),
      },
      recentActivity: activityR.status === 'fulfilled' ? (activityR.value.data || []) : [],
    });
  } catch (error) {
    console.error('[hdWalletRoutes GET /ceo/pulse]', error.message);
    res.status(500).json({ error: 'Failed to load company pulse.' });
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
          .select('id, username, email, created_at, is_email_verified, email_verified, is_phone_verified, phone_verified, is_id_verified, kyc_verified')
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
          await Promise.all([
            hdWallet.setWalletBalance(COMPANY_WALLET_ID, ncb),
            supabaseAdmin.from('user_balances').upsert({ user_id: COMPANY_WALLET_ID, balance_btc: ncb, updated_at: ts }, { onConflict: 'user_id' }),
          ]);
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
      await Promise.all([
        hdWallet.setWalletBalance(COMPANY_WALLET_ID, newCompanyBalance),
        supabaseAdmin.from('user_balances').upsert({ user_id: COMPANY_WALLET_ID, balance_btc: newCompanyBalance, updated_at: ts }, { onConflict: 'user_id' }),
      ]);
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

    const { data: txRow } = await supabaseAdmin
      .from('wallet_transactions').select('*').eq('id', id).eq('status', 'PENDING_APPROVAL').maybeSingle();
    if (!txRow) return res.status(404).json({ error: 'No pending withdrawal found with that ID — it may have already been reviewed.' });

    const isUsdt = txRow.currency === 'USDT';
    const isFeeCollection = txRow.user_id === COMPANY_WALLET_ID;
    const sendAmount = isUsdt ? parseFloat(txRow.amount_usdt) : parseFloat(txRow.amount_btc);
    const platformFee = isUsdt ? parseFloat(txRow.platform_fee_usdt || 0) : parseFloat(txRow.platform_fee_btc || 0);
    const refundAmount = parseFloat((sendAmount + platformFee).toFixed(isUsdt ? 6 : 8));
    const userId = txRow.user_id;
    const ts = new Date().toISOString();
    const balField = isUsdt ? 'balance_usdt' : 'balance_btc';

    const { data: bal } = await supabaseAdmin.from('wallets').select(balField).eq('user_id', userId).single();
    const newBalance = parseFloat((parseFloat(bal?.[balField] || 0) + refundAmount).toFixed(isUsdt ? 6 : 8));

    await Promise.all([
      supabaseAdmin.from('wallets').update({ [balField]: newBalance, updated_at: ts }).eq('user_id', userId),
      supabaseAdmin.from('user_balances').update({ [balField]: newBalance, updated_at: ts }).eq('user_id', userId),
      supabaseAdmin.from('user_wallets').update({ [balField]: newBalance, updated_at: ts }).eq('user_id', userId),
    ]);

    await supabaseAdmin.from('wallet_transactions').update({
      status: 'REJECTED', reviewed_by: ceo.id, reviewed_at: ts, rejection_reason: reason,
    }).eq('id', id);

    // BTC has a dedicated rejection-email template; USDT relies on the in-app notification
    // below for now — same scope decision as the approve handler above.
    const { data: targetUser } = await supabaseAdmin.from('users').select('id, email, username').eq('id', userId).single();
    if (!isUsdt && targetUser?.email) {
      emailService.sendWithdrawalRejectedEmail(targetUser, sendAmount, reason).catch(() => {});
    }
    const symbol = isUsdt ? '₮' : '₿';
    const decimals = isUsdt ? 2 : 8;
    supabaseAdmin.from('notifications').insert({
      user_id: userId, type: 'wallet',
      title: isFeeCollection ? '⚠️ Fee Collection Declined' : '⚠️ Withdrawal Declined',
      message: isFeeCollection
        ? `Fee collection of ${symbol}${sendAmount.toFixed(decimals)} was declined — the full amount was returned to the company wallet. Reason: ${reason}`
        : `We weren't able to complete your withdrawal of ${symbol}${sendAmount.toFixed(decimals)} — the full amount (${symbol}${refundAmount.toFixed(decimals)}) was returned to your wallet. Reason: ${reason}`,
      action: '/wallet', is_read: false, created_at: ts,
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