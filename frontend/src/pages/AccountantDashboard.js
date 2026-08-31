import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { useRates } from '../contexts/RatesContext';
import {
  Landmark, Wallet, Bitcoin, Fuel, Shield, AlertTriangle, LogOut, RefreshCw,
  Download, ScrollText, Flag, ArrowDownCircle, ArrowUpCircle, ShieldCheck, ShieldAlert,
  Search,
} from 'lucide-react';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';
const authH = () => {
  const t = localStorage.getItem('accountantToken') || localStorage.getItem('token');
  return t ? { Authorization: `Bearer ${t}` } : {};
};

const fmtBtc  = (n) => parseFloat(n || 0).toFixed(6);
const fmtUsdt = (n) => parseFloat(n || 0).toFixed(2);
const fmtUsd  = (n) => parseFloat(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const toDateInput = (d) => d.toISOString().slice(0, 10);

const C = {
  forest: '#1B4332', forestLight: '#2D6A4F',
  g50: '#F8FAFC', g100: '#F1F5F9', g200: '#E2E8F0', g300: '#CBD5E1',
  g400: '#94A3B8', g500: '#64748B', g600: '#475569', g700: '#334155', g800: '#1E293B',
};

// ── Accountant-only login screen ────────────────────────────────────────
function AccountantLogin({ onAuth }) {
  const [step, setStep]           = useState('password');
  const [email, setEmail]         = useState('');
  const [password, setPassword]   = useState('');
  const [emailOtp, setEmailOtp]   = useState('');
  const [twoFACode, setTwoFACode] = useState('');
  const [tempToken, setTempToken] = useState('');
  const [loading, setLoading]     = useState(false);
  const [err, setErr]             = useState('');
  const [notice, setNotice]       = useState('');

  const finish = (u, token) => {
    if (!(u?.is_accountant || u?.is_admin || u?.is_ceo)) {
      setErr("This account doesn't have Accountant Dashboard access. Ask the CEO to grant it.");
      return;
    }
    localStorage.setItem('accountantToken', token);
    localStorage.setItem('accountantUser', JSON.stringify(u));
    onAuth(u);
  };

  const submitPassword = async (e) => {
    e.preventDefault();
    setErr(''); setNotice(''); setLoading(true);
    try {
      const { data } = await axios.post(`${API_URL}/auth/login`, { email, password });
      if (data.requiresOtp) {
        setEmailOtp('');
        setNotice(`A 6-digit code was sent to ${data.email || email}`);
        setStep('email-otp');
      } else if (data.success) {
        finish(data.user, data.token);
      }
    } catch (e) {
      setErr(e.response?.data?.error || 'Login failed. Check your details and try again.');
    } finally { setLoading(false); }
  };

  const submitEmailOtp = async (e) => {
    e.preventDefault();
    if (emailOtp.length !== 6) { setErr('Enter the full 6-digit code'); return; }
    setErr(''); setLoading(true);
    try {
      const { data } = await axios.post(`${API_URL}/auth/verify-login-otp`, { email, code: emailOtp });
      if (data.requires2FA) {
        setTempToken(data.tempToken);
        setNotice(`Enter the code from your ${data.twoFactorMethod === 'totp' ? 'authenticator app' : data.twoFactorMethod === 'sms' ? 'phone' : 'email'}`);
        setTwoFACode('');
        setStep('2fa');
      } else if (data.success) {
        finish(data.user, data.token);
      }
    } catch (e) {
      setErr(e.response?.data?.error || 'Invalid code. Please try again.');
      setEmailOtp('');
    } finally { setLoading(false); }
  };

  const submit2FA = async (e) => {
    e.preventDefault();
    if (twoFACode.length !== 6) { setErr('Enter the full 6-digit code'); return; }
    setErr(''); setLoading(true);
    try {
      const { data } = await axios.post(`${API_URL}/auth/verify-2fa-login`, { tempToken, code: twoFACode });
      if (data.success) finish(data.user, data.token);
    } catch (e) {
      setErr(e.response?.data?.error || 'Invalid code. Please try again.');
      setTwoFACode('');
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: `linear-gradient(145deg,${C.forest} 0%,#0c2418 50%,${C.forestLight} 100%)` }}>
      <div className="w-full max-w-sm bg-white rounded-3xl p-7 shadow-2xl">
        <div className="flex flex-col items-center mb-6">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-3" style={{ backgroundColor: C.forest }}>
            <Landmark size={26} color="#fff" />
          </div>
          <h1 className="font-black text-lg" style={{ color: C.g800 }}>PRAQEN Accounting</h1>
          <p className="text-xs mt-1 text-center" style={{ color: C.g400 }}>Read-only financial reporting — sign in with your accountant account</p>
        </div>

        {step === 'password' && (
          <form onSubmit={submitPassword} className="space-y-3">
            <input type="email" required placeholder="Email" value={email} onChange={e => setEmail(e.target.value)}
              className="w-full border rounded-xl px-4 py-3 text-sm outline-none" style={{ borderColor: C.g200 }} />
            <input type="password" required placeholder="Password" value={password} onChange={e => setPassword(e.target.value)}
              className="w-full border rounded-xl px-4 py-3 text-sm outline-none" style={{ borderColor: C.g200 }} />
            {err && <p className="text-xs font-bold" style={{ color: '#DC2626' }}>{err}</p>}
            <button type="submit" disabled={loading}
              className="w-full py-3 rounded-xl text-sm font-black transition"
              style={{ backgroundColor: loading ? C.g200 : C.forest, color: loading ? C.g400 : '#fff' }}>
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
        )}

        {step === 'email-otp' && (
          <form onSubmit={submitEmailOtp} className="space-y-3">
            {notice && <p className="text-xs font-semibold" style={{ color: C.g600 }}>{notice}</p>}
            <input type="text" inputMode="numeric" maxLength={6} required placeholder="6-digit code"
              value={emailOtp} onChange={e => setEmailOtp(e.target.value.replace(/\D/g, ''))}
              className="w-full border rounded-xl px-4 py-3 text-sm outline-none tracking-widest text-center font-black" style={{ borderColor: C.g200 }} />
            {err && <p className="text-xs font-bold" style={{ color: '#DC2626' }}>{err}</p>}
            <button type="submit" disabled={loading}
              className="w-full py-3 rounded-xl text-sm font-black transition"
              style={{ backgroundColor: loading ? C.g200 : C.forest, color: loading ? C.g400 : '#fff' }}>
              {loading ? 'Verifying…' : 'Verify Code'}
            </button>
            <button type="button" onClick={() => { setStep('password'); setErr(''); setNotice(''); }}
              className="w-full text-xs font-bold py-1" style={{ color: C.g500 }}>
              ← Back
            </button>
          </form>
        )}

        {step === '2fa' && (
          <form onSubmit={submit2FA} className="space-y-3">
            {notice && <p className="text-xs font-semibold" style={{ color: C.g600 }}>{notice}</p>}
            <input type="text" inputMode="numeric" maxLength={6} required placeholder="6-digit 2FA code"
              value={twoFACode} onChange={e => setTwoFACode(e.target.value.replace(/\D/g, ''))}
              className="w-full border rounded-xl px-4 py-3 text-sm outline-none tracking-widest text-center font-black" style={{ borderColor: C.g200 }} />
            {err && <p className="text-xs font-bold" style={{ color: '#DC2626' }}>{err}</p>}
            <button type="submit" disabled={loading}
              className="w-full py-3 rounded-xl text-sm font-black transition"
              style={{ backgroundColor: loading ? C.g200 : C.forest, color: loading ? C.g400 : '#fff' }}>
              {loading ? 'Verifying…' : 'Verify & Sign In'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function StatCard({ icon, label, color, bg, primary, secondary, footer }) {
  return (
    <div className="bg-white rounded-2xl border p-4" style={{ borderColor: C.g200 }}>
      <div className="flex items-center gap-2 mb-2">
        <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ backgroundColor: bg, color }}>{icon}</div>
        <p className="text-[11px] font-black uppercase tracking-wide" style={{ color: C.g500 }}>{label}</p>
      </div>
      <p className="text-xl font-black" style={{ color: C.g800 }}>{primary}</p>
      {secondary && <p className="text-[11px] mt-0.5" style={{ color: C.g500 }}>{secondary}</p>}
      {footer && <p className="text-[10px] mt-1.5" style={{ color: C.g400 }}>{footer}</p>}
    </div>
  );
}

// ── NEW: Revenue Trend Chart ────────────────────────────────────────────
function RevenueTrendChart({ data }) {
  if (!data || data.length === 0) return null;
  
  const maxVal = Math.max(...data.map(d => d.value), 1);
  const width = 600;
  const height = 150;
  const padding = 10;
  
  const points = data.map((d, i) => {
    const x = padding + (i * (width - 2*padding)) / (data.length - 1);
    const y = height - padding - (d.value / maxVal) * (height - 2*padding);
    return `${x},${y}`;
  }).join(' ');
  
  return (
    <div style={{ background: '#fff', borderRadius: 12, padding: 16, marginTop: 16, border: `1px solid ${C.g200}` }}>
      <h3 style={{ fontSize: 13, fontWeight: 800, color: C.g800, marginBottom: 12 }}>
        📊 Fee Revenue Trend (30 Days)
      </h3>
      <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={{ overflow: 'visible' }}>
        <line x1={padding} y1={height-padding} x2={width-padding} y2={height-padding} stroke="#CBD5E1" strokeWidth="1" />
        <line x1={padding} y1={padding} x2={padding} y2={height-padding} stroke="#CBD5E1" strokeWidth="1" />
        <polyline
          points={points}
          fill="none"
          stroke="#059669"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {data.map((d, i) => {
          const x = padding + (i * (width - 2*padding)) / (data.length - 1);
          const y = height - padding - (d.value / maxVal) * (height - 2*padding);
          return (
            <circle key={i} cx={x} cy={y} r="3" fill="#059669">
              <title>{`${d.date}: $${d.value.toFixed(2)}`}</title>
            </circle>
          );
        })}
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: C.g400, marginTop: 4 }}>
        <span>{data[0]?.date}</span>
        <span>{data[data.length-1]?.date}</span>
      </div>
    </div>
  );
}

// ── NEW: Search Bar ─────────────────────────────────────────────────────
function SearchBar({ onSearch }) {
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');
  
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <input
        type="text"
        value={query}
        onChange={(e) => { setQuery(e.target.value); onSearch(e.target.value, typeFilter); }}
        placeholder="🔍 Search user, email, or tx hash..."
        style={{
          flex: 1, minWidth: 200, padding: '8px 12px', borderRadius: 8,
          border: `1px solid ${C.g200}`, fontSize: 12, outline: 'none'
        }}
      />
      <select
        value={typeFilter}
        onChange={(e) => { setTypeFilter(e.target.value); onSearch(query, e.target.value); }}
        style={{
          padding: '8px 12px', borderRadius: 8, border: `1px solid ${C.g200}`,
          fontSize: 12, outline: 'none', background: 'white'
        }}
      >
        <option value="ALL">All Types</option>
        <option value="DEPOSIT">Deposits</option>
        <option value="WITHDRAWAL">Withdrawals</option>
        <option value="FEE">Fees</option>
        <option value="ESCROW_LOCK">Escrow Locks</option>
        <option value="ESCROW_RELEASE">Escrow Releases</option>
        <option value="TRANSFER_IN">Transfers In</option>
        <option value="TRANSFER_OUT">Transfers Out</option>
        <option value="SWAP">Swaps</option>
      </select>
    </div>
  );
}

// ── NEW: Top Users Stats ────────────────────────────────────────────────
function TopUsersStats({ users }) {
  if (!users || users.length === 0) return null;
  
  return (
    <div style={{ background: '#fff', borderRadius: 12, padding: 16, marginTop: 16, border: `1px solid ${C.g200}` }}>
      <h3 style={{ fontSize: 13, fontWeight: 800, color: C.g800, marginBottom: 12 }}>
        🏆 Top Traders (Real Trade Count)
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {users.slice(0, 5).map((u, i) => (
          <div key={u.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: C.g50, borderRadius: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 16, fontWeight: 800, color: i === 0 ? '#D97706' : C.g500 }}>#{i+1}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: C.g800 }}>{u.username}</span>
            </div>
            <span style={{ fontSize: 12, color: '#059669', fontWeight: 700 }}>{u.total_trades} trades</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const RANGE_PRESETS = [
  { id: '7d',  label: '7 Days',  days: 7 },
  { id: '30d', label: '30 Days', days: 30 },
  { id: '90d', label: '90 Days', days: 90 },
];

export default function AccountantDashboard({ user: appUser }) {
  const [acctUser, setAcctUser] = useState(null);
  useEffect(() => {
    const stored = localStorage.getItem('accountantUser');
    const token  = localStorage.getItem('accountantToken');
    if (stored && token) {
      try {
        const u = JSON.parse(stored);
        if (u?.is_accountant || u?.is_admin || u?.is_ceo) { setAcctUser(u); return; }
      } catch {}
    }
    if (appUser && (appUser.is_accountant || appUser.is_admin || appUser.is_ceo)) setAcctUser(appUser);
  }, [appUser]);

  if (!acctUser) return <AccountantLogin onAuth={setAcctUser} />;
  return <AccountantDashboardInner user={acctUser} />;
}

function AccountantDashboardInner({ user }) {
  const { btcUsd } = useRates();
  const usdOf = (btc, usdt) => (parseFloat(btc || 0) * (btcUsd || 0)) + parseFloat(usdt || 0);

  const [overview, setOverview]   = useState(null);
  const [loadingOv, setLoadingOv] = useState(true);
  const [accessDenied, setAccessDenied] = useState(null);

  const [rangeId, setRangeId] = useState('30d');
  const [fromDate, setFromDate] = useState(toDateInput(new Date(Date.now() - 30 * 86400000)));
  const [toDate, setToDate]     = useState(toDateInput(new Date()));
  const [ledger, setLedger]       = useState(null);
  const [loadingLedger, setLoadingLedger] = useState(true);

  const [revenueTrend, setRevenueTrend] = useState([]);
  const [topUsers, setTopUsers] = useState([]);
  const [filteredTx, setFilteredTx] = useState(null);

  const loadOverview = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API_URL}/hd-wallet/accountant/overview`, { headers: authH() });
      setOverview(data);
      setAccessDenied(null);
    } catch (e) {
      if (e.response?.status === 403) setAccessDenied(e.response?.data?.error || 'Accountant access required');
      else toast.error(e.response?.data?.error || 'Failed to load overview');
    } finally { setLoadingOv(false); }
  }, []);

  const loadLedger = useCallback(async () => {
    setLoadingLedger(true);
    try {
      const { data } = await axios.get(`${API_URL}/hd-wallet/accountant/ledger`, {
        headers: authH(), params: { from: fromDate, to: toDate },
      });
      setLedger(data);
      setFilteredTx(null);
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to load ledger');
    } finally { setLoadingLedger(false); }
  }, [fromDate, toDate]);

  const loadTrend = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API_URL}/hd-wallet/accountant/revenue-trend`, { headers: authH() });
      setRevenueTrend(data || []);
    } catch (e) { console.log('Trend load error:', e.message); }
  }, []);

  const loadTopUsers = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API_URL}/hd-wallet/accountant/top-users`, { headers: authH() });
      setTopUsers(data || []);
    } catch (e) { console.log('Top users load error:', e.message); }
  }, []);

  useEffect(() => { loadOverview(); }, [loadOverview]);
  useEffect(() => { loadLedger(); }, [loadLedger]);
  useEffect(() => { loadTrend(); loadTopUsers(); }, [loadTrend, loadTopUsers]);

  useEffect(() => {
    const iv = setInterval(() => loadOverview(), 60000);
    return () => clearInterval(iv);
  }, [loadOverview]);

  const applyPreset = (preset) => {
    setRangeId(preset.id);
    setToDate(toDateInput(new Date()));
    setFromDate(toDateInput(new Date(Date.now() - preset.days * 86400000)));
  };

  const logout = () => {
    localStorage.removeItem('accountantToken');
    localStorage.removeItem('accountantUser');
    window.location.href = '/accountant-dashboard';
  };

  const exportCsv = () => {
    const rows = filteredTx || ledger?.transactions || [];
    if (!rows.length) { toast.error('Nothing to export for this range'); return; }
    const cols = ['created_at', 'type', 'currency', 'amount_btc', 'amount_usdt', 'platform_fee_btc', 'platform_fee_usdt', 'status', 'tx_hash', 'notes'];
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [cols.join(',')].concat(
      rows.map(t => cols.map(c => esc(t[c])).join(','))
    );
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `praqen-ledger_${fromDate}_to_${toDate}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleSearch = (query, typeFilter) => {
    const allTx = ledger?.transactions || [];
    const filtered = allTx.filter(tx => {
      const matchesQuery = !query || 
        (tx.username?.toLowerCase().includes(query.toLowerCase()) ||
         tx.tx_hash?.toLowerCase().includes(query.toLowerCase()) ||
         tx.type?.toLowerCase().includes(query.toLowerCase()));
      const matchesType = typeFilter === 'ALL' || tx.type === typeFilter;
      return matchesQuery && matchesType;
    });
    setFilteredTx(filtered);
  };

  if (accessDenied) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 text-center px-6" style={{ backgroundColor: '#F8FAFC' }}>
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ backgroundColor: '#FEF2F2' }}>
          <AlertTriangle size={32} color="#DC2626" />
        </div>
        <div>
          <p className="text-base font-black" style={{ color: '#DC2626' }}>Access Denied</p>
          <p className="text-xs mt-1 max-w-sm leading-relaxed" style={{ color: C.g500 }}>{accessDenied}</p>
        </div>
      </div>
    );
  }

  const t   = overview || {};
  const hot = t.hotWalletBtc || {};
  const res = t.reserveWalletBtc || {};
  const tron = t.tron || {};
  const company = t.companyWallet || {};
  const liab = t.liabilities || {};

  const assetsUsd = usdOf(hot.total_btc ?? hot.confirmed_btc, 0)
    + usdOf(res.total_btc ?? res.confirmed_btc, 0)
    + usdOf(company.balance_btc, company.balance_usdt)
    + parseFloat(tron.usdt || 0);
  const liabilitiesUsd = usdOf(liab.total_balance_btc, liab.total_balance_usdt);
  const coveragePct = liabilitiesUsd > 0 ? (assetsUsd / liabilitiesUsd) * 100 : null;
  const solvent = coveragePct === null ? null : coveragePct >= 100;

  const s = ledger?.summary || {};
  const feeRevenueBtc  = (s.FEE?.feeBtc || 0) || Object.values(s).reduce((sum, v) => sum + (v.feeBtc || 0), 0);
  const feeRevenueUsdt = (s.FEE?.feeUsdt || 0) || Object.values(s).reduce((sum, v) => sum + (v.feeUsdt || 0), 0);
  const depositsBtc  = s.DEPOSIT?.btc || 0,  depositsUsdt  = s.DEPOSIT?.usdt || 0;
  const withdrawBtc  = Math.abs(s.WITHDRAWAL?.btc || 0), withdrawUsdt = Math.abs(s.WITHDRAWAL?.usdt || 0);
  const displayTx = filteredTx || ledger?.transactions || [];

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#F8FAFC' }}>
      <div className="sticky top-0 z-50 border-b" style={{ backgroundColor: '#fff', borderColor: C.g200 }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: `linear-gradient(135deg, ${C.forest}, ${C.forestLight})` }}>
              <Landmark size={18} color="white" />
            </div>
            <div>
              <h1 className="text-sm font-black" style={{ color: C.g800 }}>Accountant Dashboard</h1>
              <p className="text-[10px]" style={{ color: C.g400 }}>Read-only — reporting &amp; records only</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => { loadOverview(); loadLedger(); loadTrend(); loadTopUsers(); }}
              className="p-2 rounded-xl border hover:bg-gray-50 transition" style={{ borderColor: C.g200 }} title="Refresh">
              <RefreshCw size={15} style={{ color: C.g500 }} />
            </button>
            <button onClick={logout} className="p-2 rounded-xl border hover:bg-gray-50 transition" style={{ borderColor: C.g200 }} title="Log out">
              <LogOut size={15} style={{ color: C.g500 }} />
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-5 space-y-6">

        {/* ── Solvency ─────────────────────────────────────────────────── */}
        <div>
          <h2 className="text-sm font-black uppercase tracking-wide mb-3" style={{ color: C.g500 }}>Solvency — Assets vs. What We Owe Users</h2>
          {loadingOv ? (
            <div className="flex justify-center py-8"><div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: C.forest }} /></div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
                <div className="rounded-2xl p-5 sm:col-span-1"
                  style={{ backgroundColor: solvent === false ? '#FEF2F2' : '#F0FDF4', border: `1.5px solid ${solvent === false ? '#FCA5A5' : '#86EFAC'}` }}>
                  <div className="flex items-center gap-2 mb-2">
                    {solvent === false ? <ShieldAlert size={20} color="#DC2626" /> : <ShieldCheck size={20} color="#16A34A" />}
                    <p className="text-[11px] font-black uppercase tracking-wide" style={{ color: solvent === false ? '#991B1B' : '#166534' }}>Coverage Ratio</p>
                  </div>
                  <p className="text-3xl font-black" style={{ color: solvent === false ? '#DC2626' : '#16A34A' }}>
                    {coveragePct === null ? '—' : `${coveragePct.toFixed(1)}%`}
                  </p>
                  <p className="text-[11px] mt-1" style={{ color: C.g600 }}>
                    Assets ${fmtUsd(assetsUsd)} vs. owed ${fmtUsd(liabilitiesUsd)}
                  </p>
                  {liab.truncated && <p className="text-[10px] mt-1 font-bold" style={{ color: '#DC2626' }}>⚠ user_wallets scan capped at 10,000 rows — liability total may be incomplete</p>}
                </div>

                <StatCard icon={<Bitcoin size={16} />} label="Hot Wallet · BTC" color="#F59E0B" bg="#FFFBEB"
                  primary={`$${fmtUsd(usdOf(hot.total_btc ?? hot.confirmed_btc, 0))}`}
                  secondary={hot.error ? `Error: ${hot.error}` : `₿${fmtBtc(hot.total_btc ?? hot.confirmed_btc)}`} />
                <StatCard icon={<Shield size={16} />} label="Reserve Wallet · BTC" color="#0F766E" bg="#F0FDFA"
                  primary={`$${fmtUsd(usdOf(res.total_btc ?? res.confirmed_btc, 0))}`}
                  secondary={res.error ? `Error: ${res.error}` : `₿${fmtBtc(res.total_btc ?? res.confirmed_btc)}`} />
                <StatCard icon={<Wallet size={16} />} label="Hot Wallet · USDT" color="#059669" bg="#F0FDF4"
                  primary={`$${fmtUsd(tron.usdt)}`} secondary={`₮${fmtUsdt(tron.usdt)} USDT`} />
                <StatCard icon={<Fuel size={16} />} label="Gas Wallet · TRX" color="#DC2626" bg="#FEF2F2"
                  primary={`${parseFloat(tron.trx || 0).toFixed(2)} TRX`} secondary={`Min reserve ${parseFloat(tron.minTrxReserve || 0).toFixed(0)} TRX — ${tron.trxStatus || '—'}`} />
                <StatCard icon={<Landmark size={16} />} label="Company / Master Wallet" color="#1B4332" bg="#F0FDF4"
                  primary={`$${fmtUsd(usdOf(company.balance_btc, company.balance_usdt))}`}
                  secondary={`₿${fmtBtc(company.balance_btc)} + ₮${fmtUsdt(company.balance_usdt)}`} />
              </div>
              <p className="text-[11px]" style={{ color: C.g400 }}>
                Total user balances owed: ₿{fmtBtc(liab.total_balance_btc)} + ₮{fmtUsdt(liab.total_balance_usdt)} across {liab.user_wallet_rows || 0} wallets.
              </p>
            </>
          )}
        </div>

        {/* ── NEW: Search Bar ─────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border p-4" style={{ borderColor: C.g200 }}>
          <p className="text-[11px] font-black uppercase tracking-wide mb-3" style={{ color: C.g500 }}>🔍 Search & Filter</p>
          <SearchBar onSearch={handleSearch} />
        </div>

        {/* ── NEW: Revenue Trend ───────────────────────────────────────── */}
        {revenueTrend.length > 0 && <RevenueTrendChart data={revenueTrend} />}

        {/* ── NEW: Top Users ──────────────────────────────────────────── */}
        <TopUsersStats users={topUsers} />

        {/* ── Date range ───────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-2">
          {RANGE_PRESETS.map(p => (
            <button key={p.id} onClick={() => applyPreset(p)}
              className="px-3 py-1.5 rounded-xl text-[11px] font-bold transition"
              style={{
                backgroundColor: rangeId === p.id ? C.forest : 'white', color: rangeId === p.id ? '#fff' : C.g500,
                border: `1px solid ${rangeId === p.id ? C.forest : C.g200}`,
              }}>{p.label}</button>
          ))}
          <input type="date" value={fromDate} onChange={e => { setRangeId(null); setFromDate(e.target.value); }}
            className="px-2.5 py-1.5 rounded-xl text-[11px] border outline-none" style={{ borderColor: C.g200 }} />
          <span className="text-[11px]" style={{ color: C.g400 }}>to</span>
          <input type="date" value={toDate} onChange={e => { setRangeId(null); setToDate(e.target.value); }}
            className="px-2.5 py-1.5 rounded-xl text-[11px] border outline-none" style={{ borderColor: C.g200 }} />
          <button onClick={exportCsv}
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold text-white transition"
            style={{ backgroundColor: C.forest }}>
            <Download size={13} /> Export CSV
          </button>
        </div>

        {/* ── Revenue / cash flow ──────────────────────────────────────── */}
        <div>
          <h2 className="text-sm font-black uppercase tracking-wide mb-3" style={{ color: C.g500 }}>Revenue &amp; Cash Flow — {fromDate} to {toDate}</h2>
          {loadingLedger ? (
            <div className="flex justify-center py-8"><div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: C.forest }} /></div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-3">
                <StatCard icon={<Landmark size={16} />} label="Fee Revenue" color="#1B4332" bg="#F0FDF4"
                  primary={`$${fmtUsd(usdOf(feeRevenueBtc, feeRevenueUsdt))}`} secondary={`₿${fmtBtc(feeRevenueBtc)} + ₮${fmtUsdt(feeRevenueUsdt)}`} />
                <StatCard icon={<ArrowDownCircle size={16} />} label="Deposits In" color="#2563EB" bg="#EFF6FF"
                  primary={`$${fmtUsd(usdOf(depositsBtc, depositsUsdt))}`} secondary={`₿${fmtBtc(depositsBtc)} + ₮${fmtUsdt(depositsUsdt)}`} />
                <StatCard icon={<ArrowUpCircle size={16} />} label="Withdrawals Out" color="#DC2626" bg="#FEF2F2"
                  primary={`$${fmtUsd(usdOf(withdrawBtc, withdrawUsdt))}`} secondary={`₿${fmtBtc(withdrawBtc)} + ₮${fmtUsdt(withdrawUsdt)}`} />
                <StatCard icon={<ScrollText size={16} />} label="Transactions" color="#64748B" bg="#F1F5F9"
                  primary={displayTx.length} secondary={ledger?.truncated ? '⚠ capped at 5,000' : `${Object.keys(s).length} types`} />
              </div>
            </>
          )}
        </div>

        {/* ── Reconciliation ───────────────────────────────────────────── */}
        <div>
          <h2 className="text-sm font-black uppercase tracking-wide mb-3 flex items-center gap-2" style={{ color: C.g500 }}>
            <Flag size={14} /> Reconciliation Flags {t.reconciliationFlags?.length ? `(${t.reconciliationFlags.length})` : ''}
          </h2>
          {t.reconciliationTableMissing ? (
            <p className="text-xs" style={{ color: C.g400 }}>reconciliation_flags table not found — this shows nothing until the balance-integrity migration is applied.</p>
          ) : !t.reconciliationFlags?.length ? (
            <p className="text-xs" style={{ color: C.g400 }}>No open reconciliation flags.</p>
          ) : (
            <div className="bg-white rounded-2xl border overflow-x-auto" style={{ borderColor: C.g200 }}>
              <table className="w-full text-xs">
                <thead><tr className="text-left" style={{ color: C.g400 }}>
                  <th className="px-3 py-2 font-bold">Date</th><th className="px-3 py-2 font-bold">Reason</th>
                  <th className="px-3 py-2 font-bold">Currency</th><th className="px-3 py-2 font-bold">Diff</th>
                  <th className="px-3 py-2 font-bold">Status</th>
                </tr></thead>
                <tbody>
                  {t.reconciliationFlags.map((f, i) => (
                    <tr key={f.id || i} className="border-t" style={{ borderColor: C.g100 }}>
                      <td className="px-3 py-2" style={{ color: C.g600 }}>{new Date(f.created_at).toLocaleString()}</td>
                      <td className="px-3 py-2 font-bold" style={{ color: C.g800 }}>{f.reason}</td>
                      <td className="px-3 py-2" style={{ color: C.g600 }}>{f.currency}</td>
                      <td className="px-3 py-2" style={{ color: C.g600 }}>{f.diff ?? '—'}</td>
                      <td className="px-3 py-2">
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: '#FEF2F2', color: '#991B1B' }}>{f.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Transaction ledger ───────────────────────────────────────── */}
        <div>
          <h2 className="text-sm font-black uppercase tracking-wide mb-3" style={{ color: C.g500 }}>Transaction Ledger {filteredTx && `(${filteredTx.length} filtered)`}</h2>
          <div className="bg-white rounded-2xl border overflow-x-auto" style={{ borderColor: C.g200, maxHeight: 480, overflowY: 'auto' }}>
            <table className="w-full text-xs">
              <thead className="sticky top-0" style={{ backgroundColor: '#fff' }}><tr className="text-left" style={{ color: C.g400 }}>
                <th className="px-3 py-2 font-bold">Date</th><th className="px-3 py-2 font-bold">Type</th>
                <th className="px-3 py-2 font-bold">Currency</th><th className="px-3 py-2 font-bold">BTC</th>
                <th className="px-3 py-2 font-bold">USDT</th><th className="px-3 py-2 font-bold">Fee</th>
                <th className="px-3 py-2 font-bold">Status</th>
              </tr></thead>
              <tbody>
                {displayTx.map((tx, i) => (
                  <tr key={tx.id || i} className="border-t" style={{ borderColor: C.g100 }}>
                    <td className="px-3 py-2 whitespace-nowrap" style={{ color: C.g600 }}>{new Date(tx.created_at).toLocaleString()}</td>
                    <td className="px-3 py-2 font-bold" style={{ color: C.g800 }}>{tx.type}</td>
                    <td className="px-3 py-2" style={{ color: C.g600 }}>{tx.currency}</td>
                    <td className="px-3 py-2" style={{ color: C.g600 }}>{tx.amount_btc ? fmtBtc(tx.amount_btc) : '—'}</td>
                    <td className="px-3 py-2" style={{ color: C.g600 }}>{tx.amount_usdt ? fmtUsdt(tx.amount_usdt) : '—'}</td>
                    <td className="px-3 py-2" style={{ color: C.g600 }}>{(tx.platform_fee_btc || tx.platform_fee_usdt) ? `${fmtBtc(tx.platform_fee_btc)} / ${fmtUsdt(tx.platform_fee_usdt)}` : '—'}</td>
                    <td className="px-3 py-2" style={{ color: C.g600 }}>{tx.status}</td>
                  </tr>
                ))}
                {!loadingLedger && !displayTx.length && (
                  <tr><td colSpan={7} className="px-3 py-8 text-center" style={{ color: C.g400 }}>No transactions in this range.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}