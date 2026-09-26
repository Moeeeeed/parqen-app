import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

// Display text and colours for the four levels. The NUMBERS the page shows for a
// user (users brought, active users, volume, level) always come from the server
// (/affiliate/summary). The unlock/keep numbers and shares come from
// /affiliate/config when it loads; the values below are only the fallback so the
// page still renders if that request fails.
export const LEVELS = [
  { n: 'Explorer',   r: 0.10, c: '#B7D9C4', f: 5,  v: 50,    kf: 3,  kv: 25,    ex: { f: 5,  t: 3, z: 60 },  get: ['0.10% of every trade your users make', 'Your personal link and scan code', 'Live progress dashboard'], bonus: ['Explorer badge'] },
  { n: 'Builder',    r: 0.12, c: '#2D6A4F', f: 10, v: 1000,  kf: 5,  kv: 500,   ex: { f: 10, t: 3, z: 100 }, get: ['0.12% of every trade your users make', 'Builder badge on your profile'], bonus: ['Priority support'] },
  { n: 'Titan',      r: 0.15, c: '#F4A422', f: 20, v: 10000, kf: 10, kv: 5000,  ex: { f: 20, t: 4, z: 200 }, get: ['0.15% of every trade your users make', 'Titan badge', 'Early access to new features'], bonus: ['Featured on the leaderboard'] },
  { n: 'Ambassador', r: 0.20, c: '#1B4332', f: 50, v: 50000, kf: 25, kv: 25000, ex: { f: 50, t: 5, z: 250 }, get: ['0.20% of every trade your users make', 'Ambassador badge', 'Direct line to the PRAQEN team'], bonus: ['Hall of Fame spot', 'Invites to PRAQEN events'] },
];

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

export const pct = (r) => `${r.toFixed(2)}%`;
export const money = (v) => `$${v > 0 && v < 10 ? v.toFixed(2) : Math.round(v).toLocaleString()}`;
export const usd = (n) => `${Math.round(n).toLocaleString()} USD`;

// Example monthly amount for a level. Only ever shown when payouts are on.
export function monthlyExample(l) {
  return (l.ex.f * l.ex.t * l.ex.z * l.r) / 100;
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
  const [cfg, setCfg] = useState({ loaded: false, cashEnabled: false, levels: LEVELS });
  useEffect(() => {
    let alive = true;
    axios.get(`${API_URL}/affiliate/config`, { timeout: 10000 })
      .then(({ data }) => {
        if (!alive) return;
        setCfg({ loaded: true, cashEnabled: data && data.cash_enabled === true, levels: mergeLevels(data && data.levels) });
      })
      .catch(() => { if (alive) setCfg({ loaded: true, cashEnabled: false, levels: LEVELS }); });
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
