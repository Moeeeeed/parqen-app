// backend/services/referralService.js
const supabaseAdmin = require('../supabaseAdmin');

/**
 * Referral Service - Handles all referral-related business logic
 * - Tracking referrals
 * - Calculating commissions
 * - Withdrawing earnings
 * - Real-time updates
 */

class ReferralService {

    /**
     * Get referral stats for a user
     * @param {string} userId - User ID
     * @returns {Promise<Object>} Referral stats
     */
    async getReferralStats(userId) {
        try {
            // Get user's referral data
            const { data: user, error: userErr } = await supabaseAdmin
                .from('users')
                .select('referral_code, total_referrals, referral_earnings_btc, badge')
                .eq('id', userId)
                .single();

            if (userErr) throw userErr;

            // Get all referrals
            const { data: referrals, error: refErr } = await supabaseAdmin
                .from('users')
                .select('id, username, full_name, avatar_url, created_at, total_trades, badge')
                .eq('referred_by', userId)
                .order('created_at', { ascending: false });

            if (refErr) throw refErr;

            // Get earnings from affiliate_earnings
            const { data: earnings, error: earnErr } = await supabaseAdmin
                .from('affiliate_earnings')
                .select('commission_btc, commission_usd, status, created_at, referred_user_id, trade_amount_btc, trade_amount_usd')
                .eq('referrer_id', userId);

            if (earnErr) throw earnErr;

            // Calculate total earnings
            const totalEarningsBtc = earnings.reduce((sum, e) => sum + parseFloat(e.commission_btc || 0), 0);
            const totalEarningsUsd = earnings.reduce((sum, e) => sum + parseFloat(e.commission_usd || 0), 0);

            // Get referral trades (trades done by referred users)
            const referredUserIds = referrals.map(r => r.id);
            let referralTrades = [];
            let totalReferralTradeVolume = 0;

            if (referredUserIds.length > 0) {
                const { data: trades, error: tradeErr } = await supabaseAdmin
                    .from('trades')
                    .select('id, trade_ref, amount_btc, amount_usd, status, created_at, buyer_id, seller_id')
                    .or(`buyer_id.in.(${referredUserIds.join(',')}),seller_id.in.(${referredUserIds.join(',')})`)
                    .eq('status', 'COMPLETED')
                    .order('created_at', { ascending: false })
                    .limit(100);

                if (!tradeErr && trades) {
                    referralTrades = trades;
                    totalReferralTradeVolume = trades.reduce((sum, t) => sum + parseFloat(t.amount_usd || 0), 0);
                }
            }

            // Get pending earnings (not withdrawn)
            const pendingEarnings = earnings.filter(e => e.status !== 'WITHDRAWN');
            const pendingEarningsBtc = pendingEarnings.reduce((sum, e) => sum + parseFloat(e.commission_btc || 0), 0);
            const pendingEarningsUsd = pendingEarnings.reduce((sum, e) => sum + parseFloat(e.commission_usd || 0), 0);

            // Get referral commission tiers
            const tiers = this.getCommissionTiers(user?.total_referrals || referrals.length);

            return {
                success: true,
                stats: {
                    totalReferrals: user?.total_referrals || referrals.length,
                    totalEarningsBtc: parseFloat(totalEarningsBtc.toFixed(8)),
                    totalEarningsUsd: parseFloat(totalEarningsUsd.toFixed(2)),
                    pendingEarningsBtc: parseFloat(pendingEarningsBtc.toFixed(8)),
                    pendingEarningsUsd: parseFloat(pendingEarningsUsd.toFixed(2)),
                    totalReferralTrades: referralTrades.length,
                    totalReferralTradeVolume: parseFloat(totalReferralTradeVolume.toFixed(2)),
                    currentBadge: user?.badge || 'BEGINNER',
                    referralCode: user?.referral_code || '',
                    currentRate: tiers.currentRate,
                    nextTier: tiers.nextTier,
                    referralsToNextTier: tiers.referralsToNextTier,
                },
                referrals: referrals.map(r => {
                    const referralEarnings = earnings.filter(e => e.referred_user_id === r.id);
                    return {
                        ...r,
                        trade_count: r.total_trades || 0,
                        earnings_btc: parseFloat(referralEarnings.reduce((sum, e) => sum + parseFloat(e.commission_btc || 0), 0).toFixed(8)),
                        earnings_usd: parseFloat(referralEarnings.reduce((sum, e) => sum + parseFloat(e.commission_usd || 0), 0).toFixed(2)),
                        status: r.total_trades > 0 ? 'trading' : 'registered',
                        joined_at: r.created_at,
                    };
                }),
                referralTrades: referralTrades.map(t => ({
                    ...t,
                    referred_user: t.buyer_id === userId ? 'buyer' : 'seller'
                })),
                earnings: earnings.map(e => ({
                    ...e,
                    commission_btc: parseFloat(e.commission_btc || 0),
                    commission_usd: parseFloat(e.commission_usd || 0),
                }))
            };
        } catch (error) {
            console.error('[ReferralService] getReferralStats error:', error);
            throw error;
        }
    }

    /**
     * Get commission tiers based on referral count
     * @param {number} referralCount - Total referrals
     * @returns {Object} Commission tiers
     */
    getCommissionTiers(referralCount) {
        const tiers = [
            { min: 0, max: 9, rate: 0.10, label: 'Bronze' },
            { min: 10, max: 24, rate: 0.15, label: 'Silver' },
            { min: 25, max: 49, rate: 0.20, label: 'Gold' },
            { min: 50, max: 99, rate: 0.25, label: 'Platinum' },
            { min: 100, max: Infinity, rate: 0.30, label: 'Diamond' },
        ];

        let currentTier = tiers[0];
        let nextTier = null;
        let referralsToNextTier = 0;

        for (let i = 0; i < tiers.length; i++) {
            if (referralCount >= tiers[i].min) {
                currentTier = tiers[i];
                if (i < tiers.length - 1) {
                    nextTier = tiers[i + 1];
                    referralsToNextTier = nextTier.min - referralCount;
                }
            }
        }

        return {
            currentRate: currentTier.rate,
            currentLabel: currentTier.label,
            nextTier: nextTier ? {
                label: nextTier.label,
                rate: nextTier.rate,
                minReferrals: nextTier.min,
            } : null,
            referralsToNextTier: nextTier ? Math.max(0, nextTier.min - referralCount) : 0,
        };
    }

    /**
     * Get list of referrals for a user
     * @param {string} userId - User ID
     * @returns {Promise<Array>} List of referrals
     */
    async getReferralList(userId) {
        try {
            const { data: referrals, error } = await supabaseAdmin
                .from('users')
                .select('id, username, full_name, avatar_url, created_at, total_trades, badge, last_seen_at, country')
                .eq('referred_by', userId)
                .order('created_at', { ascending: false });

            if (error) throw error;

            // Get earnings per referral
            const { data: earnings } = await supabaseAdmin
                .from('affiliate_earnings')
                .select('referred_user_id, commission_btc, commission_usd')
                .eq('referrer_id', userId);

            const earningsMap = {};
            (earnings || []).forEach(e => {
                if (!earningsMap[e.referred_user_id]) {
                    earningsMap[e.referred_user_id] = { btc: 0, usd: 0 };
                }
                earningsMap[e.referred_user_id].btc += parseFloat(e.commission_btc || 0);
                earningsMap[e.referred_user_id].usd += parseFloat(e.commission_usd || 0);
            });

            // Get last trade date for each referral
            const referralIds = referrals.map(r => r.id);
            let lastTradeMap = {};
            if (referralIds.length > 0) {
                const { data: trades } = await supabaseAdmin
                    .from('trades')
                    .select('buyer_id, seller_id, created_at')
                    .or(`buyer_id.in.(${referralIds.join(',')}),seller_id.in.(${referralIds.join(',')})`)
                    .eq('status', 'COMPLETED')
                    .order('created_at', { ascending: false });

                (trades || []).forEach(t => {
                    const userId = t.buyer_id || t.seller_id;
                    if (!lastTradeMap[userId]) {
                        lastTradeMap[userId] = t.created_at;
                    }
                });
            }

            const enriched = (referrals || []).map(r => ({
                ...r,
                earnings_btc: parseFloat((earningsMap[r.id]?.btc || 0).toFixed(8)),
                earnings_usd: parseFloat((earningsMap[r.id]?.usd || 0).toFixed(2)),
                status: r.total_trades > 0 ? 'trading' : 'registered',
                last_trade: lastTradeMap[r.id] || null,
            }));

            return {
                success: true,
                referrals: enriched,
                total: enriched.length,
                activeTraders: enriched.filter(r => r.status === 'trading').length,
            };
        } catch (error) {
            console.error('[ReferralService] getReferralList error:', error);
            throw error;
        }
    }

    /**
     * Withdraw referral earnings to user's wallet
     * @param {string} userId - User ID
     * @returns {Promise<Object>} Withdrawal result
     */
    async withdrawEarnings(userId) {
        try {
            // Get pending earnings
            const { data: earnings, error: earnErr } = await supabaseAdmin
                .from('affiliate_earnings')
                .select('id, commission_btc, commission_usd')
                .eq('referrer_id', userId)
                .neq('status', 'WITHDRAWN');

            if (earnErr) throw earnErr;

            const totalEarningsBtc = earnings.reduce((sum, e) => sum + parseFloat(e.commission_btc || 0), 0);
            const totalEarningsUsd = earnings.reduce((sum, e) => sum + parseFloat(e.commission_usd || 0), 0);

            if (totalEarningsBtc <= 0) {
                throw new Error('No earnings to withdraw');
            }

            // Check minimum withdrawal ($10 USD)
            const btcPrice = await this.getBTCPrice();
            const totalUsd = totalEarningsBtc * btcPrice;

            if (totalUsd < 10) {
                throw new Error(`Minimum $10 USD required. Current: $${totalUsd.toFixed(2)}`);
            }

            // Credit to user's wallet
            const { data: wallet, error: walletErr } = await supabaseAdmin
                .from('wallets')
                .select('balance_btc')
                .eq('user_id', userId)
                .single();

            if (walletErr) throw walletErr;

            const newBalance = parseFloat((parseFloat(wallet?.balance_btc || 0) + totalEarningsBtc).toFixed(8));

            await supabaseAdmin
                .from('wallets')
                .update({ balance_btc: newBalance, updated_at: new Date().toISOString() })
                .eq('user_id', userId);

            // Also update user_balances
            await supabaseAdmin
                .from('user_balances')
                .update({ balance_btc: newBalance, updated_at: new Date().toISOString() })
                .eq('user_id', userId);

            // Re-certify the new BTC balance in balance_audit — swapService.js's
            // _assertLedgerTrueBtc refuses any swap where wallets.balance_btc doesn't
            // match the last BTC-context row here. Without stamping it after crediting
            // referral earnings too, a user who withdraws referral earnings after their
            // first trade or swap would have every subsequent swap falsely blocked.
            supabaseAdmin.from('balance_audit').insert({
                user_id:     userId,
                change_btc:  totalEarningsBtc,
                new_balance: newBalance,
                reason:      'REFERRAL_WITHDRAWAL',
                created_at:  new Date().toISOString(),
            }).then(null, (e) => console.error(`[ReferralService] ⚠️ balance_audit stamp failed after referral withdrawal for ${userId.slice(0, 8)} — their next swap may be falsely blocked:`, e.message));

            // Mark earnings as withdrawn
            const ids = earnings.map(e => e.id);
            await supabaseAdmin
                .from('affiliate_earnings')
                .update({ status: 'WITHDRAWN' })
                .in('id', ids);

            // Reset referral_earnings_btc in users table
            await supabaseAdmin
                .from('users')
                .update({ referral_earnings_btc: 0 })
                .eq('id', userId);

            // Log transaction
            await supabaseAdmin.from('wallet_transactions').insert({
                user_id: userId,
                type: 'REFERRAL_WITHDRAWAL',
                amount_btc: totalEarningsBtc,
                amount_usd: totalUsd,
                status: 'CONFIRMED',
                notes: `Referral earnings withdrawal — ₿${totalEarningsBtc.toFixed(8)} from ${ids.length} commission(s)`,
                created_at: new Date().toISOString()
            });

            return {
                success: true,
                amountBtc: parseFloat(totalEarningsBtc.toFixed(8)),
                amountUsd: parseFloat(totalUsd.toFixed(2)),
                newBalance,
                commissionCount: ids.length,
                message: `₿${totalEarningsBtc.toFixed(8)} added to your wallet!`
            };
        } catch (error) {
            console.error('[ReferralService] withdrawEarnings error:', error);
            throw error;
        }
    }

    /**
     * Get current BTC price
     * @returns {Promise<number>} BTC price in USD
     */
    async getBTCPrice() {
        try {
            const response = await fetch('https://api.coinbase.com/v2/prices/BTC-USD/spot', {
                signal: AbortSignal.timeout(5000)
            });
            const data = await response.json();
            return parseFloat(data.data.amount) || 88000;
        } catch (error) {
            console.error('[ReferralService] getBTCPrice error:', error);
            return 88000; // fallback
        }
    }

    /**
     * Calculate commission for a trade
     * @param {string} referrerId - Referrer's user ID
     * @param {string} referredUserId - Referred user's ID
     * @param {string} tradeId - Trade ID
     * @param {number} tradeAmountBtc - Trade amount in BTC
     * @param {number} tradeAmountUsd - Trade amount in USD
     * @returns {Promise<Object>} Commission result
     */
    async calculateAndCreateCommission(referrerId, referredUserId, tradeId, tradeAmountBtc, tradeAmountUsd) {
        try {
            // Get referrer's total referrals count for tier
            const { data: referrer } = await supabaseAdmin
                .from('users')
                .select('total_referrals')
                .eq('id', referrerId)
                .single();

            if (!referrer) return null;

            const referralCount = referrer.total_referrals || 0;
            const tier = this.getCommissionTiers(referralCount);
            const commissionRate = tier.currentRate / 100; // Convert percentage to decimal

            const commissionBtc = parseFloat((parseFloat(tradeAmountBtc || 0) * commissionRate).toFixed(8));
            const commissionUsd = parseFloat((parseFloat(tradeAmountUsd || 0) * commissionRate).toFixed(2));

            if (commissionBtc <= 0) return null;

            // Create commission record
            const { data: commission, error } = await supabaseAdmin
                .from('affiliate_earnings')
                .insert({
                    referrer_id: referrerId,
                    referred_user_id: referredUserId,
                    trade_id: tradeId,
                    commission_btc: commissionBtc,
                    commission_usd: commissionUsd,
                    trade_amount_btc: tradeAmountBtc,
                    trade_amount_usd: tradeAmountUsd,
                    commission_rate: tier.currentRate,
                    status: 'PENDING',
                    created_at: new Date().toISOString()
                })
                .select()
                .single();

            if (error) throw error;

            // Update referrer's total earnings in users table
            const { data: totalEarnings } = await supabaseAdmin
                .from('affiliate_earnings')
                .select('commission_btc')
                .eq('referrer_id', referrerId)
                .neq('status', 'WITHDRAWN');

            const totalBtc = (totalEarnings || []).reduce((sum, e) => sum + parseFloat(e.commission_btc || 0), 0);

            await supabaseAdmin
                .from('users')
                .update({ referral_earnings_btc: parseFloat(totalBtc.toFixed(8)) })
                .eq('id', referrerId);

            return {
                success: true,
                commission: commission,
                rate: tier.currentRate,
                tier: tier.currentLabel,
            };
        } catch (error) {
            console.error('[ReferralService] calculateAndCreateCommission error:', error);
            return null;
        }
    }

    /**
     * Get referral leaderboard (top 10 referrers)
     * @returns {Promise<Array>} Leaderboard
     */
    async getLeaderboard() {
        try {
            // Get all users with referrals
            const { data: users, error } = await supabaseAdmin
                .from('users')
                .select('id, username, total_referrals, referral_earnings_btc, badge, avatar_url')
                .gt('total_referrals', 0)
                .order('total_referrals', { ascending: false })
                .limit(10);

            if (error) throw error;

            // Get earnings for each user
            const userIds = users.map(u => u.id);
            let earningsMap = {};
            if (userIds.length > 0) {
                const { data: earnings } = await supabaseAdmin
                    .from('affiliate_earnings')
                    .select('referrer_id, commission_btc')
                    .in('referrer_id', userIds);

                (earnings || []).forEach(e => {
                    earningsMap[e.referrer_id] = (earningsMap[e.referrer_id] || 0) + parseFloat(e.commission_btc || 0);
                });
            }

            return users.map((u, index) => ({
                rank: index + 1,
                ...u,
                total_earnings_btc: parseFloat((earningsMap[u.id] || 0).toFixed(8)),
            }));
        } catch (error) {
            console.error('[ReferralService] getLeaderboard error:', error);
            return [];
        }
    }

    /**
     * Check if user has reached a new badge tier
     * @param {string} userId - User ID
     * @returns {Promise<Object>} Badge status
     */
    async checkBadgeUpgrade(userId) {
        try {
            const { data: user } = await supabaseAdmin
                .from('users')
                .select('total_referrals, badge')
                .eq('id', userId)
                .single();

            if (!user) return null;

            const referralCount = user.total_referrals || 0;
            let newBadge = 'BEGINNER';

            if (referralCount >= 100) newBadge = 'LEGEND';
            else if (referralCount >= 50) newBadge = 'MASTER';
            else if (referralCount >= 25) newBadge = 'ELITE';
            else if (referralCount >= 10) newBadge = 'PRO';
            else newBadge = 'BEGINNER';

            if (newBadge !== user.badge) {
                await supabaseAdmin
                    .from('users')
                    .update({ badge: newBadge })
                    .eq('id', userId);

                return {
                    upgraded: true,
                    oldBadge: user.badge,
                    newBadge: newBadge,
                    message: `🎉 Congratulations! You've been upgraded to ${newBadge} tier!`,
                };
            }

            return {
                upgraded: false,
                currentBadge: user.badge,
                nextBadge: this.getNextBadge(referralCount),
                referralsToNext: this.getReferralsToNextBadge(referralCount),
            };
        } catch (error) {
            console.error('[ReferralService] checkBadgeUpgrade error:', error);
            return null;
        }
    }

    getNextBadge(referralCount) {
        if (referralCount < 10) return { name: 'PRO', min: 10 };
        if (referralCount < 25) return { name: 'ELITE', min: 25 };
        if (referralCount < 50) return { name: 'MASTER', min: 50 };
        if (referralCount < 100) return { name: 'LEGEND', min: 100 };
        return null;
    }

    getReferralsToNextBadge(referralCount) {
        const next = this.getNextBadge(referralCount);
        return next ? Math.max(0, next.min - referralCount) : 0;
    }
}

module.exports = new ReferralService();