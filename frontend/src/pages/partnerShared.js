import React, { useEffect, useState } from 'react';
import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

// Partner levels. `rate` is the % of each completed trade's value paid to the
// partner. A friend counts as "active" once they have completed a trade.
export const LEVELS = [
  { n: 'Starter',    r: 0.10, c: '#B7D9C4', f: 0,  v: 0,     ex: { f: 2,  t: 3, z: 120 }, get: ['0.10% on every friend trade', 'Your link and scan code', 'Live earnings dashboard'], bonus: ['Starter badge'] },
  { n: 'Builder',    r: 0.12, c: '#2D6A4F', f: 3,  v: 1000,  ex: { f: 5,  t: 3, z: 150 }, get: ['0.12% on every friend trade', 'Builder badge on your profile'], bonus: ['Priority support'] },
  { n: 'Pro',        r: 0.15, c: '#F4A422', f: 10, v: 10000, ex: { f: 15, t: 4, z: 200 }, get: ['0.15% on every friend trade', 'Pro badge', 'Early access to new features'], bonus: ['Featured on the leaderboard'] },
  { n: 'Ambassador', r: 0.20, c: '#1B4332', f: 30, v: 50000, ex: { f: 40, t: 5, z: 250 }, get: ['0.20% on every friend trade', 'Ambassador badge', 'Direct line to the PRAQEN team'], bonus: ['Hall of Fame spot', 'Invites to PRAQEN events'] },
];

export const CLAIM_MIN_USD = 10;

export const pct = (r) => `${r.toFixed(2)}%`;
export const money = (v) => `$${v > 0 && v < 10 ? v.toFixed(2) : Math.round(v).toLocaleString()}`;
export const usd = (n) => `${Math.round(n).toLocaleString()} USD`;

export function monthlyExample(l) {
  return (l.ex.f * l.ex.t * l.ex.z * l.r) / 100;
}

// Level from the last 30 days: enough active friends OR enough friend volume.
export function levelIndexFor(activeFriends, volume30) {
  let idx = 0;
  LEVELS.forEach((l, i) => {
    if (i > 0 && (activeFriends >= l.f || volume30 >= l.v)) idx = i;
  });
  return idx;
}

const BADGE_SHAPES = [
  (c, c2) => <path d="M32 8l6 12 13 2-9 9 2 13-12-6-12 6 2-13-9-9 13-2z" fill={c} stroke={c2} strokeWidth="2" strokeLinejoin="round" />,
  (c, c2) => (
    <>
      <path d="M22 6h20v22l-10 8-10-8z" fill={c} stroke={c2} strokeWidth="2" strokeLinejoin="round" />
      <circle cx="32" cy="42" r="12" fill="#fff" stroke={c2} strokeWidth="3" />
      <path d="M27 42l4 4 7-8" stroke={c2} strokeWidth="3" fill="none" strokeLinecap="round" />
    </>
  ),
  (c, c2) => <path d="M38 6l-20 30h12l-4 22 22-32H36z" fill={c} stroke={c2} strokeWidth="2" strokeLinejoin="round" />,
  (c, c2) => (
    <>
      <path d="M20 10h24l10 14-22 30L10 24z" fill={c} stroke={c2} strokeWidth="2" strokeLinejoin="round" />
      <path d="M10 24h44M26 10l6 14 6-14M32 54L24 24M32 54l8-30" stroke="#fff" strokeOpacity=".7" strokeWidth="1.6" fill="none" />
    </>
  ),
];
const BADGE_FILL = ['#B7D9C4', '#2D6A4F', '#F4A422', '#1B4332'];
const BADGE_EDGE = ['#2D6A4F', '#1B4332', '#B9770E', '#F4A422'];

export function Badge({ i, size = 40 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      {BADGE_SHAPES[i](BADGE_FILL[i], BADGE_EDGE[i])}
    </svg>
  );
}

// Loads the signed-in partner's real numbers from the existing referral API.
// Returns null while loading / when signed out.
export function usePartnerStats(user) {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!user || !token) { setStats(null); return undefined; }
    let alive = true;
    const auth = { headers: { Authorization: `Bearer ${token}` } };
    Promise.all([
      axios.get(`${API_URL}/referral/earnings`, auth),
      axios.get(`${API_URL}/my-referrals`, auth).catch(() => ({ data: {} })),
    ])
      .then(([{ data }, { data: mine }]) => {
        if (!alive) return;
        const rows = data.earnings || [];
        const friends = data.referredUsers || [];
        const cutoff = Date.now() - 30 * 86400000;
        let lifetimeUsd = 0; let lifetimeVol = 0; let vol30 = 0;
        const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
        const perFriend = {};
        rows.forEach((e) => {
          const usdAmt = parseFloat(e.trade_amount_usd || 0);
          const btcAmt = parseFloat(e.trade_amount_btc || 0);
          const comBtc = parseFloat(e.commission_btc || 0);
          lifetimeVol += usdAmt;
          if (btcAmt > 0) lifetimeUsd += comBtc * (usdAmt / btcAmt);
          if (new Date(e.created_at).getTime() >= cutoff) vol30 += usdAmt;
          const earnedUsd = btcAmt > 0 ? comBtc * (usdAmt / btcAmt) : 0;
          const pf = perFriend[e.referred_user_id] || (perFriend[e.referred_user_id] = { life: 0, month: 0 });
          pf.life += earnedUsd;
          if (new Date(e.created_at) >= monthStart) pf.month += earnedUsd;
        });
        const byName = {};
        (mine.referrals || []).forEach((r) => { byName[r.username] = r; });
        const countryById = {};
        (mine.referrals || []).forEach((r) => { countryById[r.id] = r.country || null; });
        const history = rows.map((e) => {
          const btcAmt = parseFloat(e.trade_amount_btc || 0);
          const usdAmt = parseFloat(e.trade_amount_usd || 0);
          const comBtc = parseFloat(e.commission_btc || 0);
          const ru = e.referred_user || {};
          return {
            id: e.id,
            username: ru.username || `user_${String(e.referred_user_id || '').slice(0, 8)}`,
            country: countryById[e.referred_user_id] || null,
            btc: comBtc,
            usd: btcAmt > 0 ? comBtc * (usdAmt / btcAmt) : 0,
            date: e.created_at,
            status: e.status,
          };
        }).sort((a, b) => new Date(b.date) - new Date(a.date));
        const list = (mine.referrals && mine.referrals.length ? mine.referrals : friends).map((r) => {
          const id = r.id || (byName[r.username] && byName[r.username].id);
          const pf = perFriend[id] || { life: 0, month: 0 };
          return {
            id, username: r.username, country: r.country || null, avatar_url: r.avatar_url || null,
            trades: r.trade_count != null ? r.trade_count : (r.total_trades || 0),
            joined: r.created_at || r.joined_at || null,
            monthUsd: pf.month, lifetimeUsd: pf.life,
          };
        });
        const active = friends.filter((f) => (f.total_trades || 0) > 0).length;
        setStats({
          total: data.referralCount != null ? data.referralCount : friends.length,
          active,
          lifetimeUsd,
          lifetimeVol,
          vol30,
          earnedBtc: parseFloat(data.totalEarned || 0),
          friends: list,
          history,
          invitedBy: mine.myReferrer || null,
          level: levelIndexFor(active, vol30),
        });
      })
      .catch(() => { if (alive) setStats({ friends: [], history: [], invitedBy: null, total: 0, active: 0, lifetimeUsd: 0, lifetimeVol: 0, vol30: 0, earnedBtc: 0, level: 0 }); });
    return () => { alive = false; };
  }, [user]);

  return stats;
}
