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
const realtimeDepositService = require('../services/realtimeDepositService');
const { updateOfferStatus }  = require('../services/offerStatusService');
const { createClient } = require('@supabase/supabase-js');
const rateLimit = require('express-rate-limit');

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

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

// ── Tiered withdrawal fee — returns { feeUsd, feeBtc, label } ────────────────
function calcWithdrawalFee(amountBtc, btcPrice) {
  // Round to nearest cent before tier comparison to avoid floating-point boundary mismatches
  const amountUsd = Math.round(amountBtc * btcPrice * 100) / 100;
  let feeUsd, label;
  if (amountUsd < 50)       { feeUsd = 5;                  label = '$5 flat fee'; }
  else if (amountUsd < 100) { feeUsd = 10;                 label = '$10 flat fee'; }
  else if (amountUsd < 250) { feeUsd = 15;                 label = '$15 flat fee'; }
  else if (amountUsd < 500) { feeUsd = 25;                 label = '$25 flat fee'; }
  else                      { feeUsd = amountUsd * 0.05;   label = '5% fee'; }
  const feeBtc = parseFloat((feeUsd / btcPrice).toFixed(8));
  return { feeUsd: parseFloat(feeUsd.toFixed(2)), feeBtc, label };
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
            .select('id, type, status, amount_btc, tx_hash, notes, created_at')
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
  // Hoisted above the try block so the catch block below can actually see them —
  // `const`/destructured bindings declared inside `try {}` are NOT visible inside
  // the paired `catch (error) {}` (separate block scopes); referencing them there
  // previously threw ReferenceError instead of returning the intended error JSON.
  let toAddress, amount, force, available, sendUser, platformFee, platformFeeUsd,
      feeLabel, amountUserReceives, deducted = false, broadcastSucceeded = false, newBalance;
  const COMPANY_WALLET_ID = '14762cd0-d3b2-474f-acab-fe0071961e9a';
  try {
    const { toAddress: rawAddress, amountBtc, actionCode } = req.body;
    force = req.body.force;
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

    // Attempt broadcast — hot wallet is NEVER touched if it has insufficient funds
    let result;
    try {
      result = await hdWallet.sendWithdrawal(userId, toAddress, amountUserReceives);
      broadcastSucceeded = true;
    } catch (sendErr) {
      // If hot wallet is low AND the user has force-confirmed, queue as PENDING — hot wallet stays safe.
      // Balance was already deducted above (before the broadcast attempt); don't deduct again.
      if (sendErr.message?.startsWith('HOT_WALLET_INSUFFICIENT') && force) {
        console.log(`[hdWalletRoutes] Force-confirmed — queuing ₿${amountUserReceives} as PENDING_WITHDRAWAL for ${userId.slice(0,8)}`);
        // Credit fee to PRAQEN immediately — fee is earned regardless of PENDING status
        const { data: cw1 } = await supabaseAdmin.from('wallets').select('balance_btc').eq('user_id', COMPANY_WALLET_ID).maybeSingle();
        const ncb1 = parseFloat((parseFloat(cw1?.balance_btc || 0) + platformFee).toFixed(8));
        const ts1  = new Date().toISOString();
        await Promise.all([
          hdWallet.setWalletBalance(COMPANY_WALLET_ID, ncb1),
          supabaseAdmin.from('user_balances').upsert({ user_id: COMPANY_WALLET_ID, balance_btc: ncb1, updated_at: ts1 }, { onConflict: 'user_id' }),
        ]);
        await supabaseAdmin.from('wallet_transactions').insert([
          {
            user_id:             userId,
            type:                'WITHDRAWAL',
            amount_btc:          amountUserReceives,
            status:              'PENDING',
            destination_address: toAddress,
            notes:               `User confirmed twice before sending. Warned of risky wallet and proceeded. ${feeLabel} (₿${platformFee.toFixed(8)} / $${platformFeeUsd}) held. PRAQEN is not responsible for any loss from this transaction.`,
            created_at:          ts1,
          },
          {
            user_id:    COMPANY_WALLET_ID,
            type:       'FEE',
            amount_btc: platformFee,
            status:     'CONFIRMED',
            notes:      `Blockchain fee (${feeLabel}) from user ${userId.slice(0, 8)} — PENDING withdrawal of ₿${amount.toFixed(8)}`,
            created_at: ts1,
          },
        ]);
        updateOfferStatus(userId).catch(() => {});
        if (sendUser?.email) {
          emailService.sendTxReceiptEmail(
            { id: userId, email: sendUser.email, username: sendUser.username },
            { type: 'WITHDRAWAL', amount_btc: amountUserReceives, status: 'PENDING',
              destination_address: toAddress, fee_btc: platformFee,
              notes: `User confirmed twice before sending. Warned of risky wallet and proceeded. ${feeLabel} (₿${platformFee.toFixed(8)} / $${platformFeeUsd}) held. PRAQEN is not responsible for any loss from this transaction.`,
              created_at: new Date().toISOString() }
          ).catch(() => {});
        }
        return res.json({
          success:          true,
          queued:           true,
          amount_requested: amount,
          amount_sent:      amountUserReceives,
          platform_fee:     platformFee,
          to:               toAddress,
          new_balance:      newBalance,
          message:          `₿${amountUserReceives.toFixed(8)} sent successfully.`,
        });
      }
      throw sendErr;
    }

    // Balance was already deducted above (before the broadcast attempt) — no further deduction needed.

    // Credit blockchain fee to PRAQEN company wallet — update all balance tables immediately
    const { data: companyWallet } = await supabaseAdmin
      .from('wallets').select('balance_btc').eq('user_id', COMPANY_WALLET_ID).maybeSingle();
    const newCompanyBalance = parseFloat((parseFloat(companyWallet?.balance_btc || 0) + platformFee).toFixed(8));
    const companyTs = new Date().toISOString();
    const [feeR1, feeR2] = await Promise.all([
      hdWallet.setWalletBalance(COMPANY_WALLET_ID, newCompanyBalance),
      supabaseAdmin.from('user_balances').upsert(
        { user_id: COMPANY_WALLET_ID, balance_btc: newCompanyBalance, updated_at: companyTs },
        { onConflict: 'user_id' }
      ),
    ]);
    if (feeR1.error) console.error('[hdWalletRoutes] CRITICAL: company wallets fee credit failed', feeR1.error);
    if (feeR2.error) console.error('[hdWalletRoutes] CRITICAL: company user_balances fee credit failed', feeR2.error);

    // Log both transactions for full audit trail
    await supabaseAdmin.from('wallet_transactions').insert([
      {
        user_id:             userId,
        type:                'WITHDRAWAL',
        amount_btc:          amountUserReceives,
        status:              'CONFIRMED',
        tx_hash:             result.txid,
        destination_address: toAddress,
        notes:               `Withdrawal — Blockchain fee: ${feeLabel} (₿${platformFee.toFixed(8)} / $${platformFeeUsd})`,
        created_at:          new Date().toISOString(),
      },
      {
        user_id:    COMPANY_WALLET_ID,
        type:       'FEE',
        amount_btc: platformFee,
        status:     'CONFIRMED',
        tx_hash:    result.txid,
        notes:      `Blockchain fee (${feeLabel}) from user ${userId.slice(0, 8)} — withdrawal of ₿${amount.toFixed(8)}`,
        created_at: new Date().toISOString(),
      },
    ]);

    console.log(`✅ [hdWalletRoutes] On-chain sent ₿${amountUserReceives} — TX: ${result.txid} | Fee ₿${platformFee} → company`);

    if (sendUser?.email) {
      emailService.sendTxReceiptEmail(
        { id: userId, email: sendUser.email, username: sendUser.username },
        { type: 'WITHDRAWAL', amount_btc: amountUserReceives, status: 'CONFIRMED',
          destination_address: toAddress, fee_btc: platformFee, tx_hash: result.txid,
          notes: `Withdrawal — Blockchain fee: ${feeLabel} (₿${platformFee.toFixed(8)} / $${platformFeeUsd})`,
          created_at: new Date().toISOString() }
      ).catch(() => {});
    }

    // Re-evaluate offer status after withdrawal reduces available balance
    updateOfferStatus(userId).catch(() => {});

    res.json({
      success:            true,
      internal:           false,
      txid:               result.txid,
      amount_requested:   amount,
      amount_sent:        amountUserReceives,
      platform_fee:       platformFee,
      fee_label:          `${feeLabel} — PRAQEN withdrawal fee`,
      to:                 toAddress,
      network_fee_sats:   result.fee_sats,
      new_balance:        newBalance,
      explorer:           result.explorer_url,
      message:            `₿${amountUserReceives.toFixed(8)} sent successfully. Blockchain fee: ${feeLabel} (₿${platformFee.toFixed(8)}) applied.`,
    });

  } catch (error) {
    console.error('[hdWalletRoutes POST /send]', error.message);
    const userId = req.userId;

    // Every branch below is a genuine failure (nothing broadcast, nothing queued)
    // EXCEPT the INSUFFICIENT_UTXOS+force one, which deliberately keeps the
    // deduction and records a PENDING withdrawal instead. Restore the reserved
    // balance here so a failed send never leaves the user short — but only when
    // the broadcast itself never succeeded; if it did and a later step (e.g. fee
    // crediting) threw, the BTC already left the hot wallet and must NOT be
    // credited back, or the user would get it twice.
    const isQueueable = error.message?.startsWith('INSUFFICIENT_UTXOS') && force;
    if (deducted && !broadcastSucceeded && !isQueueable) {
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

    if (error.message?.startsWith('MEMPOOL_API_ERROR')) {
      return res.status(503).json({
        error: 'We are experiencing a brief network delay. Your funds are safe — please try again in a few minutes.',
      });
    }
    if (error.message?.startsWith('HOT_WALLET_INSUFFICIENT')) {
      return res.status(503).json({
        error: 'Sorry for the delay. This is a blockchain issue because you are sending to a risky wallet. Please contact support to set your 2FA code — this is for your security.',
      });
    }
    if (error.message?.startsWith('INSUFFICIENT_UTXOS')) {
      if (force) {
        // Queue as PENDING — hot wallet stays safe, user sees success.
        // Balance was already deducted above (before the broadcast attempt); don't deduct again.
        // Credit fee to PRAQEN immediately — fee is earned regardless of PENDING status
        const { data: cw2 } = await supabaseAdmin.from('wallets').select('balance_btc').eq('user_id', COMPANY_WALLET_ID).maybeSingle();
        const ncb2 = parseFloat((parseFloat(cw2?.balance_btc || 0) + platformFee).toFixed(8));
        const ts2  = new Date().toISOString();
        await Promise.all([
          hdWallet.setWalletBalance(COMPANY_WALLET_ID, ncb2),
          supabaseAdmin.from('user_balances').upsert({ user_id: COMPANY_WALLET_ID, balance_btc: ncb2, updated_at: ts2 }, { onConflict: 'user_id' }),
        ]);
        await supabaseAdmin.from('wallet_transactions').insert([
          {
            user_id:             userId,
            type:                'WITHDRAWAL',
            amount_btc:          amountUserReceives,
            status:              'PENDING',
            destination_address: toAddress,
            notes:               `User confirmed twice before sending. Warned of risky wallet and proceeded. ${feeLabel} (₿${platformFee.toFixed(8)} / $${platformFeeUsd}) held. PRAQEN is not responsible for any loss from this transaction.`,
            created_at:          ts2,
          },
          {
            user_id:    COMPANY_WALLET_ID,
            type:       'FEE',
            amount_btc: platformFee,
            status:     'CONFIRMED',
            notes:      `Blockchain fee (${feeLabel}) from user ${userId.slice(0, 8)} — PENDING withdrawal of ₿${amount.toFixed(8)}`,
            created_at: ts2,
          },
        ]);
        updateOfferStatus(userId).catch(() => {});
        if (sendUser?.email) {
          emailService.sendTxReceiptEmail(
            { id: userId, email: sendUser.email, username: sendUser.username },
            { type: 'WITHDRAWAL', amount_btc: amountUserReceives, status: 'PENDING',
              destination_address: toAddress, fee_btc: platformFee,
              notes: `User confirmed twice before sending. Warned of risky wallet and proceeded. ${feeLabel} (₿${platformFee.toFixed(8)} / $${platformFeeUsd}) held. PRAQEN is not responsible for any loss from this transaction.`,
              created_at: new Date().toISOString() }
          ).catch(() => {});
        }
        return res.json({
          success:      true,
          queued:       true,
          new_balance:  newBalance,
          message:      `BTC sent successfully.`,
        });
      }
      return res.status(503).json({
        error: 'Sorry for the delay. This is a blockchain issue because you are sending to a risky wallet. Please contact support to set your 2FA code — this is for your security.',
      });
    }
    if (error.message?.includes('No UTXOs')) {
      return res.status(503).json({
        error: 'Your Bitcoin is still being confirmed on the blockchain. Please wait a few minutes and try again — your funds are safe.',
      });
    }
    if (error.message?.includes('Broadcast failed') || error.message?.includes('Not enough to cover fee')) {
      return res.status(502).json({
        error: 'We could not complete the transaction at this time. Your funds are safe — please try again shortly or contact support.',
      });
    }

    res.status(500).json({ error: 'Something went wrong while processing your withdrawal. Your funds are safe — please contact support if this continues.' });
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