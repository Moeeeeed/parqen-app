// pages/CeoDashboard.js
// PRAQEN — CEO Treasury Dashboard. Completely standalone (no shared chrome,
// no other admin sections) — the one place that shows every wallet that
// holds real company money, and the one place external withdrawals get
// approved before they broadcast. Gated server-side by is_ceo (see
// requireCeo in backend/routes/hdWalletRoutes.js) — this page only hides
// the UI for everyone else; the backend is the real gate.
import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import {
  Bitcoin, Fuel, Wallet, ArrowUpRight, RefreshCw, LogOut, ShieldCheck,
  Repeat, Clock, CheckCircle, XCircle, Landmark,
} from 'lucide-react';

const API_URL     = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';
const ADMIN_EMAIL = 'support@praqen.com';

const C = {
  forest:'#1B4332', green:'#2D6A4F', mint:'#40916C', gold:'#F4A422',
  g50:'#F8FAFC', g100:'#F1F5F9', g200:'#E2E8F0', g400:'#94A3B8',
  g500:'#64748B', g600:'#475569', g700:'#334155', g800:'#1E293B',
  success:'#10B981', danger:'#EF4444', warn:'#F59E0B',
};

const authH = () => {
  const t = localStorage.getItem('ceoToken') || localStorage.getItem('token');
  return t ? { Authorization: `Bearer ${t}` } : {};
};
const fmtBtc  = (n) => parseFloat(n || 0).toFixed(6);
const fmtUsdt = (n) => parseFloat(n || 0).toFixed(2);
const fmtAge  = (ts) => {
  if (!ts) return '—';
  const s = (Date.now() - new Date(ts)) / 1000;
  if (s < 60)    return 'Just now';
  if (s < 3600)  return `${~~(s / 60)}m ago`;
  if (s < 86400) return `${~~(s / 3600)}h ago`;
  return `${~~(s / 86400)}d ago`;
};

function Pill({ label, color = C.success, bg = '#F0FDF4' }) {
  return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-black" style={{ color, backgroundColor: bg }}>{label}</span>;
}

function Spin() {
  return <div className="flex items-center justify-center py-16"><div className="w-8 h-8 border-4 rounded-full animate-spin" style={{ borderColor: `${C.forest}20`, borderTopColor: C.forest }} /></div>;
}

// ─── Login screen (CEO-only — same account backend's requireCeo accepts) ──────
// Mirrors the main app's Login.js flow exactly: password login never returns a
// token directly — it always sends a 6-digit email OTP first, then (only if
// the account has 2FA enabled) a second code. Skipping either step is why a
// straight POST /auth/login never comes back with a token.
function CeoLogin({ onAuth }) {
  const [step, setStep]         = useState('password'); // 'password' | 'email-otp' | '2fa'
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [emailOtp, setEmailOtp] = useState('');
  const [twoFACode, setTwoFACode] = useState('');
  const [tempToken, setTempToken] = useState('');
  const [loading, setLoading]   = useState(false);
  const [err, setErr]           = useState('');
  const [notice, setNotice]     = useState('');

  const finish = (user, token) => {
    if (!(user?.is_ceo || user?.email === ADMIN_EMAIL)) {
      setErr('This account does not have CEO access');
      return;
    }
    localStorage.setItem('ceoToken', token);
    localStorage.setItem('ceoUser', JSON.stringify(user));
    onAuth(user);
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
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: `linear-gradient(145deg,${C.forest} 0%,#0c2418 50%,${C.green} 100%)` }}>
      <div className="w-full max-w-sm bg-white rounded-3xl p-7 shadow-2xl">
        <div className="flex flex-col items-center mb-6">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-3" style={{ backgroundColor: C.gold }}>
            <ShieldCheck size={26} style={{ color: C.forest }} />
          </div>
          <h1 className="font-black text-lg" style={{ color: C.g800 }}>CEO Treasury</h1>
          <p className="text-xs mt-1" style={{ color: C.g400 }}>Restricted — CEO-flagged accounts only</p>
        </div>

        {step === 'password' && (
          <form onSubmit={submitPassword} className="space-y-3">
            <input type="email" required placeholder="Email" value={email} onChange={e => setEmail(e.target.value)}
              className="w-full border rounded-xl px-4 py-3 text-sm outline-none" style={{ borderColor: C.g200 }} />
            <input type="password" required placeholder="Password" value={password} onChange={e => setPassword(e.target.value)}
              className="w-full border rounded-xl px-4 py-3 text-sm outline-none" style={{ borderColor: C.g200 }} />
            {err && <p className="text-xs font-bold" style={{ color: C.danger }}>{err}</p>}
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
            {err && <p className="text-xs font-bold" style={{ color: C.danger }}>{err}</p>}
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
            {err && <p className="text-xs font-bold" style={{ color: C.danger }}>{err}</p>}
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

// ─── Treasury stat card ─────────────────────────────────────────────────────
function TreasuryCard({ icon, label, primary, primarySub, secondary, secondarySub, color, bg, footer }) {
  return (
    <div className="bg-white rounded-2xl border p-5" style={{ borderColor: C.g200 }}>
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: bg }}>
          <span style={{ color }}>{icon}</span>
        </div>
        <p className="text-xs font-black uppercase tracking-wide" style={{ color: C.g500 }}>{label}</p>
      </div>
      <p className="text-2xl font-black" style={{ color: C.g800 }}>{primary}</p>
      {primarySub && <p className="text-xs font-semibold mt-0.5" style={{ color: C.g400 }}>{primarySub}</p>}
      {secondary && (
        <div className="mt-2 pt-2 border-t" style={{ borderColor: C.g100 }}>
          <p className="text-sm font-black" style={{ color: C.g700 }}>{secondary}</p>
          {secondarySub && <p className="text-xs" style={{ color: C.g400 }}>{secondarySub}</p>}
        </div>
      )}
      {footer && <p className="text-xs mt-2" style={{ color: C.g400 }}>{footer}</p>}
    </div>
  );
}

// ─── Withdrawal approvals ───────────────────────────────────────────────────
const WD_STATUS_PILL = {
  PENDING_APPROVAL: { label: 'Awaiting Review', color: '#92400E', bg: '#FFFBEB' },
  PENDING:           { label: 'Queued',          color: '#92400E', bg: '#FFFBEB' },
  CONFIRMED:         { label: 'Sent',            color: '#166534', bg: '#F0FDF4' },
  REJECTED:          { label: 'Rejected',        color: '#991B1B', bg: '#FEF2F2' },
};
const WD_TABS = [
  { id: 'PENDING_APPROVAL', label: 'Awaiting Review', icon: Clock },
  { id: 'CONFIRMED',        label: 'Approved',        icon: CheckCircle },
  { id: 'REJECTED',         label: 'Rejected',        icon: XCircle },
];

function VerifBadges({ user }) {
  if (!user) return null;
  const email = user.is_email_verified || user.email_verified;
  const phone = user.is_phone_verified || user.phone_verified;
  const kyc   = user.is_id_verified || user.kyc_verified;
  const badge = (label, ok) => (
    <span key={label} className="text-[10px] font-black px-1.5 py-0.5 rounded"
      style={{ backgroundColor: ok ? '#F0FDF4' : '#FEF2F2', color: ok ? '#166534' : '#991B1B' }}>{label}</span>
  );
  return <div className="flex items-center gap-1 mt-1">{badge('EMAIL', email)}{badge('PHONE', phone)}{badge('KYC', kyc)}</div>;
}

function WithdrawalApprovals() {
  const [tab, setTab]         = useState('PENDING_APPROVAL');
  const [rows, setRows]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId]   = useState(null);

  const load = useCallback(async (status) => {
    setLoading(true);
    try {
      const r = await axios.get(`${API_URL}/hd-wallet/ceo-withdrawals`, { params: { status: status || tab }, headers: authH() });
      setRows(r.data.withdrawals || []);
    } catch (e) { toast.error(e.response?.data?.error || 'Failed to load withdrawal requests'); }
    finally { setLoading(false); }
  }, [tab]);

  useEffect(() => { load(tab); }, [tab, load]);

  const approve = async (id, force = false) => {
    setBusyId(id);
    try {
      const r = await axios.post(`${API_URL}/hd-wallet/ceo-withdrawals/${id}/approve`, { force }, { headers: authH() });
      toast.success(r.data.message || 'Withdrawal approved');
      load(tab);
    } catch (e) {
      const err = e.response?.data;
      if (err?.hotWalletLow && !force) {
        setBusyId(null);
        if (window.confirm(`${err.error}\n\nForce-approve anyway? It will be queued and broadcast automatically once the hot wallet is topped up.`)) {
          approve(id, true);
        }
        return;
      }
      toast.error(err?.error || 'Failed to approve withdrawal');
    } finally { setBusyId(null); }
  };

  const reject = async (id) => {
    const reason = window.prompt('Reason for declining this withdrawal (required — the user will see this):');
    if (reason === null) return;
    if (!reason.trim()) { toast.error('A reason is required to reject a withdrawal'); return; }
    setBusyId(id);
    try {
      await axios.post(`${API_URL}/hd-wallet/ceo-withdrawals/${id}/reject`, { reason: reason.trim() }, { headers: authH() });
      toast.success('Withdrawal rejected — full amount returned to the user');
      load(tab);
    } catch (e) { toast.error(e.response?.data?.error || 'Failed to reject withdrawal'); }
    finally { setBusyId(null); }
  };

  return (
    <div className="bg-white rounded-2xl border p-5" style={{ borderColor: C.g200 }}>
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-lg font-black flex items-center gap-2" style={{ color: C.g800 }}>
            <ArrowUpRight size={18} /> Send-Out Approvals
          </h2>
          <p className="text-xs mt-0.5" style={{ color: C.g400 }}>Every external BTC withdrawal waits here until you approve or reject it — nothing broadcasts without sign-off</p>
        </div>
        <button onClick={() => load(tab)} className="p-2 rounded-xl border flex-shrink-0" style={{ borderColor: C.g200 }}>
          <RefreshCw size={14} style={{ color: C.g500 }} />
        </button>
      </div>

      <div className="flex gap-1.5 mb-4">
        {WD_TABS.map(t => {
          const Icon = t.icon;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className="px-3 py-2 rounded-xl text-xs font-black transition flex items-center gap-1.5"
              style={{ backgroundColor: tab === t.id ? C.forest : C.g100, color: tab === t.id ? '#fff' : C.g600 }}>
              <Icon size={13} /> {t.label}
            </button>
          );
        })}
      </div>

      {loading ? <Spin /> : rows.length === 0 ? (
        <div className="flex flex-col items-center py-14 gap-2">
          <ShieldCheck size={36} strokeWidth={1.5} style={{ color: C.g400 }} />
          <p className="text-sm font-semibold" style={{ color: C.g500 }}>Nothing here</p>
        </div>
      ) : (
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-xs">
            <thead>
              <tr style={{ backgroundColor: C.g50 }}>
                {['User', 'Amount', 'Destination', 'Requested', 'Status', 'Actions'].map(h => (
                  <th key={h} className="text-left px-3 py-2.5 font-black whitespace-nowrap" style={{ color: C.g500 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(w => {
                const pill = WD_STATUS_PILL[w.status] || { label: w.status, color: C.g500, bg: C.g100 };
                return (
                  <tr key={w.id} className="border-t align-top" style={{ borderColor: C.g100 }}>
                    <td className="px-3 py-2.5">
                      <p className="font-bold" style={{ color: C.g800 }}>{w.user?.username || w.user_id?.slice(0, 8)}</p>
                      <p style={{ color: C.g400 }}>{w.user?.email}</p>
                      <VerifBadges user={w.user} />
                    </td>
                    <td className="px-3 py-2.5 font-bold whitespace-nowrap" style={{ color: C.g700 }}>
                      ₿{fmtBtc(w.amount_btc)}
                      {w.platform_fee_btc ? <p className="font-medium" style={{ color: C.g400 }}>fee ₿{fmtBtc(w.platform_fee_btc)}</p> : null}
                    </td>
                    <td className="px-3 py-2.5 font-mono" style={{ color: C.g600, wordBreak: 'break-all', maxWidth: 200 }}>{w.destination_address}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap" style={{ color: C.g500 }}>{fmtAge(w.created_at)}</td>
                    <td className="px-3 py-2.5">
                      <Pill label={pill.label} color={pill.color} bg={pill.bg} />
                      {w.status === 'REJECTED' && w.rejection_reason && <p className="mt-1" style={{ color: C.g400 }}>{w.rejection_reason}</p>}
                      {w.tx_hash && <p className="mt-1 font-mono" style={{ color: C.g400 }}>{w.tx_hash.slice(0, 16)}…</p>}
                    </td>
                    <td className="px-3 py-2.5">
                      {w.status === 'PENDING_APPROVAL' && (
                        <div className="flex items-center gap-1.5">
                          <button disabled={busyId === w.id} onClick={() => approve(w.id)}
                            className="px-2.5 py-1 rounded-lg font-bold" style={{ backgroundColor: '#F0FDF4', color: '#166534', opacity: busyId === w.id ? 0.5 : 1 }}>
                            Approve
                          </button>
                          <button disabled={busyId === w.id} onClick={() => reject(w.id)}
                            className="px-2.5 py-1 rounded-lg font-bold" style={{ backgroundColor: '#FEF2F2', color: '#991B1B', opacity: busyId === w.id ? 0.5 : 1 }}>
                            Reject
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Main dashboard ─────────────────────────────────────────────────────────
export default function CeoDashboard({ user: appUser }) {
  const [ceoUser, setCeoUser]     = useState(null);
  const [treasury, setTreasury]   = useState(null);
  const [loadingT, setLoadingT]   = useState(true);

  useEffect(() => {
    if (appUser && (appUser.is_ceo || appUser.email === ADMIN_EMAIL)) {
      setCeoUser(appUser);
      return;
    }
    const stored = localStorage.getItem('ceoUser');
    const token  = localStorage.getItem('ceoToken');
    if (stored && token) {
      try {
        const u = JSON.parse(stored);
        if (u?.is_ceo || u?.email === ADMIN_EMAIL) setCeoUser(u);
      } catch {}
    }
  }, [appUser]);

  const loadTreasury = useCallback(async () => {
    setLoadingT(true);
    try {
      const r = await axios.get(`${API_URL}/hd-wallet/ceo/treasury`, { headers: authH() });
      setTreasury(r.data);
    } catch (e) { toast.error(e.response?.data?.error || 'Failed to load treasury overview'); }
    finally { setLoadingT(false); }
  }, []);

  useEffect(() => { if (ceoUser) loadTreasury(); }, [ceoUser, loadTreasury]);

  if (!ceoUser) return <CeoLogin onAuth={setCeoUser} />;

  const logout = () => {
    localStorage.removeItem('ceoToken');
    localStorage.removeItem('ceoUser');
    setCeoUser(null);
  };

  const t = treasury || {};
  const hotBtc  = t.hotWalletBtc || {};
  const tron    = t.tron || {};
  const company = t.companyWallet || {};
  const swaps   = t.swapFees || {};

  return (
    <div className="min-h-screen" style={{ backgroundColor: C.g50 }}>
      {/* Header */}
      <div style={{ background: `linear-gradient(135deg, ${C.forest} 0%, ${C.green} 100%)` }} className="px-5 md:px-8 py-5">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: C.gold }}>
              <ShieldCheck size={20} style={{ color: C.forest }} />
            </div>
            <div>
              <h1 className="font-black text-base text-white">CEO Treasury</h1>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.55)' }}>{ceoUser.username || ceoUser.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={loadTreasury} className="p-2.5 rounded-xl transition" style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}>
              <RefreshCw size={16} color="#fff" className={loadingT ? 'animate-spin' : ''} />
            </button>
            <button onClick={logout} className="p-2.5 rounded-xl transition" style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}>
              <LogOut size={16} color="#fff" />
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-5 md:px-8 py-6 space-y-6">
        {loadingT && !treasury ? <Spin /> : (
          <>
            {/* Treasury wallets */}
            <div>
              <h2 className="text-sm font-black uppercase tracking-wide mb-3" style={{ color: C.g500 }}>Wallets</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <TreasuryCard
                  icon={<Bitcoin size={18} />} label="Hot Wallet · BTC" color="#F59E0B" bg="#FFFBEB"
                  primary={`₿${fmtBtc(hotBtc.total_btc ?? hotBtc.confirmed_btc)}`}
                  primarySub={hotBtc.error ? `Error: ${hotBtc.error}` : `${fmtBtc(hotBtc.confirmed_btc)} confirmed${parseFloat(hotBtc.unconfirmed_btc || 0) > 0 ? ` · ${fmtBtc(hotBtc.unconfirmed_btc)} pending` : ''}`}
                  footer="Funds user BTC withdrawals" />

                <TreasuryCard
                  icon={<Fuel size={18} />} label="Gas Wallet · TRX" color="#DC2626" bg="#FEF2F2"
                  primary={`${parseFloat(tron.trx || 0).toFixed(2)} TRX`}
                  primarySub={tron.error ? `Error: ${tron.error}` : `Min reserve ${parseFloat(tron.minTrxReserve || 0).toFixed(0)} TRX — ${tron.trxStatus || '—'}`}
                  footer="Pays gas for USDT sweeps/sends" />

                <TreasuryCard
                  icon={<Wallet size={18} />} label="Hot Wallet · USDT" color="#059669" bg="#F0FDF4"
                  primary={`₮${fmtUsdt(tron.usdt)}`}
                  primarySub={`Swept today ₮${fmtUsdt(tron.sweptTodayUsdt)}${tron.pendingSweeps ? ` · ${tron.pendingSweeps} pending sweep(s)` : ''}`}
                  footer="Funds user USDT withdrawals" />

                <TreasuryCard
                  icon={<Landmark size={18} />} label="Master / Company Wallet" color="#1B4332" bg="#F0FDF4"
                  primary={`₿${fmtBtc(company.balance_btc)}`}
                  primarySub={company.locked_balance_btc > 0 ? `+ ₿${fmtBtc(company.locked_balance_btc)} locked` : 'Platform fee revenue (BTC)'}
                  secondary={`₮${fmtUsdt(company.balance_usdt)}`}
                  secondarySub={company.locked_balance_usdt > 0 ? `+ ₮${fmtUsdt(company.locked_balance_usdt)} locked` : 'Platform fee revenue (USDT)'} />
              </div>
            </div>

            {/* Swap fees */}
            <div>
              <h2 className="text-sm font-black uppercase tracking-wide mb-3" style={{ color: C.g500 }}>Swap Fees</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <TreasuryCard
                  icon={<Repeat size={18} />} label="Last 24 Hours" color="#7C3AED" bg="#F5F3FF"
                  primary={`₿${fmtBtc(swaps.feeBtc24h)}`} primarySub="BTC fees earned"
                  secondary={`₮${fmtUsdt(swaps.feeUsdt24h)}`} secondarySub="USDT fees earned" />
                <TreasuryCard
                  icon={<Repeat size={18} />} label="All-Time" color="#7C3AED" bg="#F5F3FF"
                  primary={`₿${fmtBtc(swaps.totalFeeBtc)}`} primarySub={`BTC fees · ${swaps.count || 0} swaps recorded`}
                  secondary={`₮${fmtUsdt(swaps.totalFeeUsdt)}`} secondarySub="USDT fees" />
              </div>

              {(t.recentSwaps || []).length > 0 && (
                <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: C.g200 }}>
                  <table className="w-full text-xs">
                    <thead>
                      <tr style={{ backgroundColor: C.g50 }}>
                        {['When', 'Route', 'Amount', 'Fee'].map(h => (
                          <th key={h} className="text-left px-4 py-2.5 font-black" style={{ color: C.g500 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {t.recentSwaps.map((s, i) => (
                        <tr key={i} className="border-t" style={{ borderColor: C.g100 }}>
                          <td className="px-4 py-2 whitespace-nowrap" style={{ color: C.g500 }}>{fmtAge(s.created_at)}</td>
                          <td className="px-4 py-2 font-bold" style={{ color: C.g700 }}>{s.from_currency} → {s.to_currency}</td>
                          <td className="px-4 py-2" style={{ color: C.g600 }}>{parseFloat(s.from_amount || 0).toFixed(6)}</td>
                          <td className="px-4 py-2 font-bold" style={{ color: C.g700 }}>
                            {parseFloat(s.fee_btc || 0) > 0 ? `₿${fmtBtc(s.fee_btc)}` : `₮${fmtUsdt(s.fee_usdt)}`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Withdrawal approvals */}
            <WithdrawalApprovals />
          </>
        )}
      </div>
    </div>
  );
}
