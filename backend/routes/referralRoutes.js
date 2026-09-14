// backend/routes/referralRoutes.js
const express = require('express');
const router = express.Router();
const supabaseAdmin = require('../supabaseAdmin');
const { verifyToken } = require('../middleware/auth');

// GET /api/referral/stats - Get referral stats for logged-in user
router.get('/stats', verifyToken, async (req, res) => {
    try {
        const userId = req.userId;

        // Get user's referral data
        const { data: user, error: userErr } = await supabaseAdmin
            .from('users')
            .select('referral_code, total_referrals, referral_earnings_btc, badge')
            .eq('id', userId)
            .single();

        if (userErr) throw userErr;

        // Get all referrals (users who signed up with this user's code)
        const { data: referrals, error: refErr } = await supabaseAdmin
            .from('users')
            .select('id, username, full_name, avatar_url, created_at, total_trades, badge')
            .eq('referred_by', userId)
            .order('created_at', { ascending: false });

        if (refErr) throw refErr;

        // Get total earnings from affiliate_earnings
        const { data: earnings, error: earnErr } = await supabaseAdmin
            .from('affiliate_earnings')
            .select('commission_btc, trade_amount_btc, status, created_at, referred_user_id')
            .eq('referrer_id', userId);

        if (earnErr) throw earnErr;

        // Calculate total earnings
        const totalEarnings = earnings.reduce((sum, e) => sum + parseFloat(e.commission_btc || 0), 0);

        // Get referral trades (trades done by referred users)
        const referredUserIds = referrals.map(r => r.id);
        let referralTrades = [];
        if (referredUserIds.length > 0) {
            const { data: trades } = await supabaseAdmin
                .from('trades')
                .select('id, trade_ref, amount_btc, amount_usd, status, created_at, buyer_id, seller_id')
                .or(`buyer_id.in.(${referredUserIds.join(',')}),seller_id.in.(${referredUserIds.join(',')})`)
                .eq('status', 'COMPLETED')
                .order('created_at', { ascending: false })
                .limit(50);

            referralTrades = trades || [];
        }

        // Get referral trade count
        const totalReferralTrades = earnings.length;

        res.json({
            success: true,
            stats: {
                totalReferrals: user?.total_referrals || referrals.length,
                totalEarningsBtc: parseFloat(totalEarnings.toFixed(8)),
                totalReferralTrades,
                currentBadge: user?.badge || 'BEGINNER',
                referralCode: user?.referral_code || '',
                totalEarningsUsd: totalEarnings * 88000, // approximate USD value
            },
            referrals: referrals.map(r => ({
                ...r,
                trade_count: r.total_trades || 0,
                earnings: earnings.filter(e => e.referred_user_id === r.id)
                    .reduce((sum, e) => sum + parseFloat(e.commission_btc || 0), 0)
            })),
            referralTrades: referralTrades.map(t => ({
                ...t,
                referred_user: t.buyer_id === userId ? 'buyer' : 'seller'
            }))
        });
    } catch (error) {
        console.error('[referral/stats] error:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/referral/list - Get list of referrals
router.get('/list', verifyToken, async (req, res) => {
    try {
        const userId = req.userId;

        const { data: referrals, error } = await supabaseAdmin
            .from('users')
            .select('id, username, full_name, avatar_url, created_at, total_trades, badge, last_seen_at')
            .eq('referred_by', userId)
            .order('created_at', { ascending: false });

        if (error) throw error;

        // Get earnings per referral
        const { data: earnings } = await supabaseAdmin
            .from('affiliate_earnings')
            .select('referred_user_id, commission_btc')
            .eq('referrer_id', userId);

        const earningsMap = {};
        (earnings || []).forEach(e => {
            earningsMap[e.referred_user_id] = (earningsMap[e.referred_user_id] || 0) + parseFloat(e.commission_btc || 0);
        });

        const enriched = (referrals || []).map(r => ({
            ...r,
            earnings_btc: earningsMap[r.id] || 0,
            status: r.total_trades > 0 ? 'trading' : 'registered'
        }));

        res.json({ success: true, referrals: enriched });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST /api/referral/withdraw - Withdraw referral earnings to wallet
router.post('/withdraw', verifyToken, async (req, res) => {
    try {
        const userId = req.userId;

        // Get pending earnings
        const { data: earnings, error: earnErr } = await supabaseAdmin
            .from('affiliate_earnings')
            .select('id, commission_btc')
            .eq('referrer_id', userId)
            .neq('status', 'WITHDRAWN');

        if (earnErr) throw earnErr;

        const totalEarnings = earnings.reduce((sum, e) => sum + parseFloat(e.commission_btc || 0), 0);

        if (totalEarnings <= 0) {
            return res.status(400).json({ error: 'No earnings to withdraw' });
        }

        // Get BTC price to check $10 minimum
        const btcRes = await fetch('https://api.coinbase.com/v2/prices/BTC-USD/spot');
        const btcData = await btcRes.json();
        const btcPrice = parseFloat(btcData.data.amount);

        const totalUsd = totalEarnings * btcPrice;
        if (totalUsd < 10) {
            return res.status(400).json({
                error: `Minimum $10 USD required. Current: $${totalUsd.toFixed(2)}`
            });
        }

        // Credit to user's wallet
        const { data: wallet, error: walletErr } = await supabaseAdmin
            .from('wallets')
            .select('balance_btc')
            .eq('user_id', userId)
            .single();

        if (walletErr) throw walletErr;

        const newBalance = parseFloat((parseFloat(wallet?.balance_btc || 0) + totalEarnings).toFixed(8));

        await supabaseAdmin
            .from('wallets')
            .update({ balance_btc: newBalance, updated_at: new Date().toISOString() })
            .eq('user_id', userId);

        // Mark earnings as withdrawn
        const ids = earnings.map(e => e.id);
        await supabaseAdmin
            .from('affiliate_earnings')
            .update({ status: 'WITHDRAWN' })
            .in('id', ids);

        // Sync balance mirrors, reset users.referral_earnings_btc, record transaction
        await Promise.allSettled([
            supabaseAdmin.from('user_balances').update({ balance_btc: newBalance, updated_at: new Date().toISOString() }).eq('user_id', userId),
            supabaseAdmin.from('user_wallets').update({ balance_btc: newBalance, updated_at: new Date().toISOString() }).eq('user_id', userId),
            supabaseAdmin.from('users').update({ referral_earnings_btc: 0 }).eq('id', userId),
            supabaseAdmin.from('wallet_transactions').insert({
                user_id: userId,
                type: 'REFERRAL_WITHDRAWAL',
                currency: 'BTC',
                amount_btc: totalEarnings,
                amount_usd: totalUsd,
                status: 'CONFIRMED',
                notes: `Referral earnings withdrawal — ₿${totalEarnings.toFixed(8)} from ${ids.length} commission(s)`,
                created_at: new Date().toISOString()
            }),
        ]);

        res.json({
            success: true,
            amountBtc: totalEarnings,
            amountUsd: totalUsd,
            newBalance,
            message: `₿${totalEarnings.toFixed(8)} added to your wallet!`
        });
    } catch (error) {
        console.error('[referral/withdraw] error:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;