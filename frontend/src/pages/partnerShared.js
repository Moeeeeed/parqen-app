import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

// Display text and colours for the four levels. The NUMBERS the page shows for a
// user (users brought, active users, volume, level) always come from the server
// (/affiliate/summary). The unlock/keep numbers, shares and the platform fee rate
// come from /affiliate/config when it loads; the values below are only the
// fallback so the page still renders if that request fails.
//
// `r` (rate) is the affiliate's share of PRAQEN's own trading fee on their
// users' trades — e.g. r: 0.10 means 10% of whatever fee PRAQEN earns on that
// trade, NOT 10% of the trade's own value. See DEFAULT_FEE_RATE below.
export const LEVELS = [
  { n: 'Explorer',  r: 0.10, c: '#B7D9C4', f: 5,  v: 50,    kf: 3,  kv: 50,    ex: { f: 5,  t: 3, z: 60 },  get: ['10% of PRAQEN\'s fee on every trade your users make', 'Your personal link and scan code', 'Live progress dashboard'], bonus: ['Explorer badge'] },
  { n: 'Builder',   r: 0.20, c: '#2D6A4F', f: 15, v: 5000,  kf: 8,  kv: 1000,  ex: { f: 15, t: 3, z: 100 }, get: ['20% Commission', 'Builder Badge on your profile', 'VIP / Priority Support', 'Swags from PRAQEN'], bonus: [] },
  { n: 'Titan',     r: 0.30, c: '#F4A422', f: 50, v: 10000, kf: 25, kv: 3000,  ex: { f: 50, t: 4, z: 200 }, get: ['30% Commission', 'Titan Badge on your profile', 'VIP / Priority Support', 'Early access to new features', '2 Featured offers for 2 weeks in a month', 'Invitation to attend Meetups, AMA, or meetings once a month'], bonus: [] },
  { n: 'Legendary', r: 0.40, c: '#1B4332', f: 80, v: 70000, kf: 40, kv: 20000, ex: { f: 80, t: 5, z: 250 }, get: ['40% Commission', 'Legendary Badge on your profile', 'Direct line to the PRAQEN Team', 'Invitation to PRAQEN events', 'A special all-paid 3-day trip to a top African country (for staying Legendary a full year)', 'Can eventually be offered a role working with PRAQEN'], bonus: [] },
];

// Platform trading fee (2% on BTC/USDT P2P trades) — mirrors tradeEscrowService.js's
// FEE_RATE on the backend. Only used before /affiliate/config has loaded; the live
// value always comes from the server (see useAffiliateConfig), so this can never
// drift into an actual wrong payout — worst case it's a few seconds of a slightly
// stale calculator estimate.
export const DEFAULT_FEE_RATE = 0.02;

export const ACTIVE_MIN_USD = 20;
export const CLAIM_MIN_USD = 10;

// 'GH' -> 'Ghana'. Falls back to whatever is stored (already a full name, or unknown).
export function countryName(raw) {
  const v = String(raw || '').trim();
  if (/^[A-Za-z]{2}$/.test(v)) {
    try { return new Intl.DisplayNames(['en'], { type: 'region' }).of(v.toUpperCase()) || v; } catch (e) { return v; }
  }
  return v;
}

// r is a 0-1 fraction (0.10 = 10%) — display as a whole-number percent.
export const pct = (r) => `${Math.round(r * 100)}%`;
export const money = (v) => { const n = Number(v) || 0; return `$${n > 0 && n < 10 ? n.toFixed(2) : Math.round(n).toLocaleString()}`; };
export const usd = (n) => `${Math.round(Number(n) || 0).toLocaleString()} USD`;

// Example monthly amount for a level: example volume × PRAQEN's fee rate ×
// the affiliate's share of that fee. Only ever shown when payouts are on.
export function monthlyExample(l, feeRate = DEFAULT_FEE_RATE) {
  return l.ex.f * l.ex.t * l.ex.z * feeRate * l.r;
}

// Server rules (name/rate/users/volume/keep) laid over the local display text.
export function mergeLevels(serverLevels) {
  if (!Array.isArray(serverLevels) || serverLevels.length !== LEVELS.length) return LEVELS;
  return LEVELS.map((l, i) => {
    const s = serverLevels[i] || {};
    return {
      ...l,
      n: s.name || l.n,
      r: typeof s.rate === 'number' ? s.rate : l.r,
      f: typeof s.users === 'number' ? s.users : l.f,
      v: typeof s.volume === 'number' ? s.volume : l.v,
      kf: typeof s.keepUsers === 'number' ? s.keepUsers : l.kf,
      kv: typeof s.keepVolume === 'number' ? s.keepVolume : l.kv,
    };
  });
}

const BADGE_SHAPES = [
  (c, c2) => <path d="M32 8l6 12 13 2-9 9 2 13-12-6-12 6 2-13-9-9 13-2z" fill={c} stroke={c2} strokeWidth="2" strokeLinejoin="round" />,
  (c, c2) => (
    <>
      <path d="M22 6h20v22l-10 8-10-8z" fill={c} stroke={c2} strokeWidth="2" strokeLinejoin="round" />
      <circle cx="32" cy="42" r="12" fill="#fff" stroke={c2} strokeWidth="3" />
      <path d="M32 35.500l2.300 4.800 5.200.700-3.800 3.600.900 5.200-4.600-2.500-4.600 2.500.900-5.200-3.800-3.600 5.200-.700z" fill={c2} />
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

// Public program rules + the payout switch. Anything that goes wrong means
// "payouts off", the safe default.
export function useAffiliateConfig() {
  const [cfg, setCfg] = useState({ loaded: false, cashEnabled: false, levels: LEVELS, feeRate: DEFAULT_FEE_RATE });
  useEffect(() => {
    let alive = true;
    axios.get(`${API_URL}/affiliate/config`, { timeout: 10000 })
      .then(({ data }) => {
        if (!alive) return;
        setCfg({
          loaded: true,
          cashEnabled: data && data.cash_enabled === true,
          levels: mergeLevels(data && data.levels),
          feeRate: typeof (data && data.fee_rate) === 'number' ? data.fee_rate : DEFAULT_FEE_RATE,
        });
      })
      .catch(() => { if (alive) setCfg({ loaded: true, cashEnabled: false, levels: LEVELS, feeRate: DEFAULT_FEE_RATE }); });
    return () => { alive = false; };
  }, []);
  return cfg;
}

// The signed-in affiliate's numbers, exactly as the server computed them.
// The page never works these out itself.
// Returns { loading, error, data }.
export function useAffiliateSummary(user) {
  const [state, setState] = useState({ loading: false, error: false, data: null });
  const uid = user ? user.id : null;
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!uid || !token) { setState({ loading: false, error: false, data: null }); return undefined; }
    let alive = true;
    setState({ loading: true, error: false, data: null });
    axios.get(`${API_URL}/affiliate/summary`, { headers: { Authorization: `Bearer ${token}` }, timeout: 20000 })
      .then(({ data }) => { if (alive) setState({ loading: false, error: false, data }); })
      .catch(() => { if (alive) setState({ loading: false, error: true, data: null }); });
    return () => { alive = false; };
  }, [uid]);
  return state;
}

// Submit a Builder application. Only ever called once the server-computed
// numbers already qualify — the server re-checks this itself regardless.
// Returns the server's success message on success, throws with .message set
// to the server's error text otherwise.
export async function applyForBuilder() {
  const token = localStorage.getItem('token');
  if (!token) throw new Error('Please log in first.');
  try {
    const { data } = await axios.post(`${API_URL}/affiliate/builder/apply`, {}, {
      headers: { Authorization: `Bearer ${token}` }, timeout: 15000,
    });
    return data?.message || 'Application received.';
  } catch (e) {
    throw new Error(e?.response?.data?.error || 'Could not submit application. Please try again.');
  }
}

// Public leaderboard, ranked by active users.
export function useAffiliateLeaderboard() {
  const [board, setBoard] = useState(null);
  useEffect(() => {
    let alive = true;
    axios.get(`${API_URL}/affiliate/leaderboard`, { timeout: 20000 })
      .then(({ data }) => { if (alive) setBoard(Array.isArray(data.leaderboard) ? data.leaderboard : []); })
      .catch(() => { if (alive) setBoard([]); });
    return () => { alive = false; };
  }, []);
  return board;
}

export function useMergedLevels(cfg) {
  return useMemo(() => cfg.levels || LEVELS, [cfg.levels]);
}
