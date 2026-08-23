// pages/CeoDashboard.js
// PRAQEN — CEO Treasury Dashboard. Completely standalone (no shared chrome,
// no other admin sections) — the one place that shows every wallet that
// holds real company money, and the one place external withdrawals get
// approved before they broadcast. Gated server-side by is_ceo (see
// requireCeo in backend/routes/hdWalletRoutes.js) — this page only hides
// the UI for everyone else; the backend is the real gate.
import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { useRates } from '../contexts/RatesContext';
import {
  Bitcoin, Fuel, Wallet, ArrowUpRight, ArrowDownRight, RefreshCw, LogOut, ShieldCheck,
  Shield, Repeat, Clock, CheckCircle, XCircle, Landmark, TrendingUp, TrendingDown, Users, ExternalLink,
  Activity, AlertCircle, MessageSquare, Search, X, Send, AlertTriangle, Paperclip,
  MessageCircle, Gift, CreditCard, Lock, Unlock, UserCheck, UserX,
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
const fmtUsd  = (n) => parseFloat(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtAge  = (ts) => {
  if (!ts) return '—';
  const s = (Date.now() - new Date(ts)) / 1000;
  if (s < 60)    return 'Just now';
  if (s < 3600)  return `${~~(s / 60)}m ago`;
  if (s < 86400) return `${~~(s / 3600)}h ago`;
  return `${~~(s / 86400)}d ago`;
};
const statusColor = (s) => {
  const m = { COMPLETED: '#10B981', CANCELLED: '#6B7280', DISPUTED: '#8B5CF6', ACTIVE: '#3B82F6', PAID: '#3B82F6', PAYMENT_SENT: '#3B82F6', ESCROW: '#F59E0B', CREATED: '#F59E0B', FUNDS_LOCKED: '#F59E0B', OPEN: '#2D6A4F' };
  return m[s] || '#94A3B8';
};

function Pill({ label, color = C.success, bg = '#F0FDF4' }) {
  return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-black" style={{ color, backgroundColor: bg }}>{label}</span>;
}

function Spin() {
  return <div className="flex items-center justify-center py-16"><div className="w-8 h-8 border-4 rounded-full animate-spin" style={{ borderColor: `${C.forest}20`, borderTopColor: C.forest }} /></div>;
}

// ─── "Needs Your Attention" badge — read-only count + link to where it's actually
// handled (Admin/Moderator pages already have the real approve/reject UI for these).
function AttentionBadge({ icon, label, count, href, onClick }) {
  const hot = count > 0;
  const Tag = href ? 'a' : 'button';
  return (
    <Tag href={href} onClick={onClick} target={href ? '_blank' : undefined} rel={href ? 'noopener noreferrer' : undefined}
      className="flex items-center gap-3 px-4 py-3 rounded-2xl border transition hover:-translate-y-0.5 flex-1 min-w-[180px]"
      style={{ borderColor: hot ? '#FCD34D' : C.g200, backgroundColor: hot ? '#FFFBEB' : '#fff' }}>
      <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: hot ? '#FDE68A' : C.g100 }}>
        <span style={{ color: hot ? '#92400E' : C.g500 }}>{icon}</span>
      </div>
      <div className="flex-1 text-left">
        <p className="text-lg font-black leading-none" style={{ color: hot ? '#92400E' : C.g800 }}>{count}</p>
        <p className="text-xs font-bold mt-0.5" style={{ color: C.g500 }}>{label}</p>
      </div>
      {href && <ExternalLink size={13} style={{ color: C.g400, flexShrink: 0 }} />}
    </Tag>
  );
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

// ─── Growth badge — arrow + percentage vs. the previous equivalent period. No charting
// library in this project (checked package.json) so this stays a plain text+icon delta,
// matching every other stat visual on this page. null/undefined pct (previous period was
// zero, or data not available) renders nothing rather than a misleading "0%" or "∞%".
function GrowthBadge({ pct, label }) {
  if (pct === null || pct === undefined || !isFinite(pct)) return null;
  const up = pct >= 0;
  const Icon = up ? TrendingUp : TrendingDown;
  const color = up ? '#166534' : '#991B1B';
  const bg = up ? '#F0FDF4' : '#FEF2F2';
  return (
    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-xs font-black" style={{ color, backgroundColor: bg }}>
      <Icon size={11} /> {Math.abs(pct).toFixed(1)}%{label ? ` ${label}` : ''}
    </span>
  );
}

// Growth % of a combined-USD current window vs. its equivalent previous window. Both sides
// use the same usdOf(btc, usdt) conversion the rest of this page already uses, so a growth
// figure combining BTC+USDT rows is apples-to-apples. null when there's no previous-period
// data to compare against (avoids a division-by-zero "∞%" or a misleading spike from 0).
const growthOf = (usdOfFn, current, previous) => {
  const curUsd = usdOfFn(current?.btc, current?.usdt);
  const prevUsd = usdOfFn(previous?.btc, previous?.usdt);
  if (!prevUsd) return null;
  return ((curUsd - prevUsd) / prevUsd) * 100;
};

// ─── Treasury stat card ─────────────────────────────────────────────────────
// primaryColor/secondaryColor default to the card's own icon `color` when not given, so a
// card's headline number matches its theme (green for money in, red for money out, etc.)
// instead of always being plain gray.
function TreasuryCard({ icon, label, primary, primarySub, secondary, secondarySub, color, bg, footer, primaryColor, secondaryColor, growthPct }) {
  return (
    <div className="bg-white rounded-2xl border p-5" style={{ borderColor: C.g200 }}>
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: bg }}>
          <span style={{ color }}>{icon}</span>
        </div>
        <p className="text-xs font-black uppercase tracking-wide" style={{ color: C.g500 }}>{label}</p>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <p className="text-2xl font-black" style={{ color: primaryColor || color || C.g800 }}>{primary}</p>
        <GrowthBadge pct={growthPct} label="vs prior" />
      </div>
      {primarySub && <p className="text-xs font-semibold mt-0.5" style={{ color: C.g400 }}>{primarySub}</p>}
      {secondary && (
        <div className="mt-2 pt-2 border-t" style={{ borderColor: C.g100 }}>
          <p className="text-sm font-black" style={{ color: secondaryColor || C.g700 }}>{secondary}</p>
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

// ─── Audit panel — everything the CEO needs to decide approve/reject on one withdrawal,
// pulled from GET /ceo-withdrawals/:id/audit (read-only, no mutation). Renders inside an
// expanded table row so it stays anchored to the request it's about; its own body scrolls
// (max-height + overflow-y-auto) instead of pushing the whole page around.
function AuditRow({ label, value, mono }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <span className="text-xs font-semibold" style={{ color: C.g500 }}>{label}</span>
      <span className={`text-xs font-bold text-right ${mono ? 'font-mono' : ''}`} style={{ color: C.g800, wordBreak: mono ? 'break-all' : 'normal' }}>{value}</span>
    </div>
  );
}

function AuditSection({ icon, title, children }) {
  return (
    <div className="bg-white rounded-xl border p-3.5" style={{ borderColor: C.g200 }}>
      <h4 className="text-xs font-black uppercase tracking-wide flex items-center gap-1.5 mb-2" style={{ color: C.g600 }}>
        {icon} {title}
      </h4>
      {children}
    </div>
  );
}

const FLAG_STYLE = {
  high:   { color: '#991B1B', bg: '#FEF2F2', border: '#FECACA' },
  medium: { color: '#92400E', bg: '#FFFBEB', border: '#FDE68A' },
  low:    { color: '#475569', bg: '#F1F5F9', border: '#E2E8F0' },
};

function AuditPanel({ data, loading, error }) {
  if (loading) return <div className="py-8"><Spin /></div>;
  if (error) return (
    <div className="flex flex-col items-center py-8 gap-2">
      <XCircle size={28} strokeWidth={1.5} style={{ color: C.danger }} />
      <p className="text-sm font-semibold" style={{ color: C.danger }}>{error}</p>
    </div>
  );
  if (!data) return null;

  if (data.is_fee_collection) {
    return (
      <div className="flex items-center gap-2 py-6 justify-center">
        <Landmark size={16} style={{ color: C.g500 }} />
        <p className="text-sm font-semibold" style={{ color: C.g500 }}>This is PRAQEN's own fee-collection cash-out — no customer to audit.</p>
      </div>
    );
  }

  const { user, wallet, firstDeposit, deposits, trades, withdrawals, disputes, flags, request, btcUsdPrice } = data;

  return (
    <div className="max-h-[70vh] overflow-y-auto pr-1 space-y-3">
      {/* Risk flags first — the fastest read for a go/no-go call */}
      {flags.length > 0 ? (
        <div className="space-y-1.5">
          {flags.map((f, i) => {
            const s = FLAG_STYLE[f.level] || FLAG_STYLE.low;
            return (
              <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg border" style={{ backgroundColor: s.bg, borderColor: s.border }}>
                <AlertTriangle size={13} style={{ color: s.color, flexShrink: 0 }} />
                <span className="text-xs font-bold" style={{ color: s.color }}>{f.text}</span>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg border" style={{ backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' }}>
          <ShieldCheck size={13} style={{ color: '#166534', flexShrink: 0 }} />
          <span className="text-xs font-bold" style={{ color: '#166534' }}>No red flags found — KYC approved, verified account, trading history present.</span>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <AuditSection icon={<ShieldCheck size={13} />} title="Identity & KYC">
          <p className="font-black text-sm mb-0.5" style={{ color: C.g800 }}>{user.username || user.email}</p>
          <p className="text-xs mb-1.5" style={{ color: C.g400 }}>{user.email}</p>
          <VerifBadges user={user} />
          <div className="mt-2 space-y-0.5">
            <AuditRow label="KYC status" value={user.kyc_approved ? 'Approved' : (user.kyc_status || 'Not approved')} />
            <AuditRow label="Account status" value={user.account_status || 'active'} />
            <AuditRow label="Account age" value={user.created_at ? fmtAge(user.created_at) : '—'} />
            <AuditRow label="Rating" value={`${parseFloat(user.average_rating || 0).toFixed(1)} ★ · +${user.positive_feedback || 0} / -${user.negative_feedback || 0}`} />
          </div>
        </AuditSection>

        <AuditSection icon={<Wallet size={13} />} title="Current Wallet Balance">
          <AuditRow label="BTC available" value={`₿${fmtBtc(wallet.balance_btc)} ${btcUsdPrice ? `($${fmtUsd(parseFloat(wallet.balance_btc || 0) * btcUsdPrice)})` : ''}`} />
          {parseFloat(wallet.locked_balance_btc || 0) > 0 && <AuditRow label="BTC locked" value={`₿${fmtBtc(wallet.locked_balance_btc)}`} />}
          <AuditRow label="USDT available" value={`₮${fmtUsdt(wallet.balance_usdt)} ($${fmtUsd(wallet.balance_usdt)})`} />
          {parseFloat(wallet.locked_balance_usdt || 0) > 0 && <AuditRow label="USDT locked" value={`₮${fmtUsdt(wallet.locked_balance_usdt)}`} />}
          <div className="mt-2 pt-2 border-t" style={{ borderColor: C.g100 }}>
            <AuditRow label="This request" value={
              request.currency === 'USDT'
                ? `₮${fmtUsdt(request.amount_usdt)} ($${fmtUsd(request.amount_usdt)})`
                : `₿${fmtBtc(request.amount_btc)}${btcUsdPrice ? ` ($${fmtUsd(parseFloat(request.amount_btc || 0) * btcUsdPrice)})` : ''}`
            } />
            <AuditRow label="Waiting" value={fmtAge(request.created_at)} />
            <AuditRow label="Destination" value={(request.destination_address || '').slice(0, 14) + '…'} mono />
          </div>
        </AuditSection>

        <AuditSection icon={<ArrowDownRight size={13} />} title="First Deposit">
          {firstDeposit ? (
            <>
              <AuditRow label="Date" value={fmtAge(firstDeposit.created_at)} />
              <AuditRow label="Amount" value={firstDeposit.currency === 'USDT' ? `₮${fmtUsdt(firstDeposit.amount_usdt)}` : `₿${fmtBtc(firstDeposit.amount_btc)}`} />
              <div className="mt-2 pt-2 border-t" style={{ borderColor: C.g100 }}>
                <AuditRow label="Total deposits" value={`${deposits.count}${deposits.capped ? '+' : ''}`} />
                <AuditRow label="Deposited (all-time)" value={`₿${fmtBtc(deposits.totalBtc)} + ₮${fmtUsdt(deposits.totalUsdt)}`} />
              </div>
            </>
          ) : (
            <p className="text-xs font-semibold" style={{ color: C.danger }}>No confirmed deposit on record — funds must have come entirely from trades.</p>
          )}
        </AuditSection>

        <AuditSection icon={<TrendingUp size={13} />} title="Trade Volume">
          <AuditRow label="Completed trades" value={`${trades.totalCompleted}${trades.capped ? '+' : ''}`} />
          <AuditRow label="Lifetime volume" value={`$${fmtUsd(trades.totalVolumeUsd)}`} />
          <AuditRow label="Disputes" value={`${disputes.total} total · ${disputes.wins} won · ${disputes.losses} lost`} />
          {btcUsdPrice && <AuditRow label="Live BTC price" value={`$${fmtUsd(btcUsdPrice)}`} />}
        </AuditSection>
      </div>

      {/* What funded the balance — recent completed trades, gift card / payment method visible per row */}
      <AuditSection icon={<Gift size={13} />} title={`Recent Completed Trades (${trades.recent.length})`}>
        {trades.recent.length === 0 ? (
          <p className="text-xs font-semibold" style={{ color: C.g400 }}>No completed trades — this account has no trading history.</p>
        ) : (
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-xs">
              <thead>
                <tr>
                  {['When', 'Role', 'Type', 'Amount', 'Funded via'].map(h => (
                    <th key={h} className="text-left px-2 py-1.5 font-black" style={{ color: C.g400 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {trades.recent.map(t => {
                  const isBuyer = t.buyer_id === user.id;
                  const isGC = !!t.gift_card_brand;
                  return (
                    <tr key={t.id} className="border-t" style={{ borderColor: C.g100 }}>
                      <td className="px-2 py-1.5 whitespace-nowrap" style={{ color: C.g500 }}>{fmtAge(t.completed_at || t.created_at)}</td>
                      <td className="px-2 py-1.5"><Pill label={isBuyer ? 'Buyer' : 'Seller'} color={isBuyer ? '#2D6A4F' : '#3B82F6'} bg={isBuyer ? '#F0FDF4' : '#EFF6FF'} /></td>
                      <td className="px-2 py-1.5 font-bold" style={{ color: C.g700 }}>{t.trade_type || '—'}</td>
                      <td className="px-2 py-1.5 font-bold whitespace-nowrap" style={{ color: C.g700 }}>${fmtUsd(t.amount_usd)} <span className="font-medium" style={{ color: C.g400 }}>(₿{fmtBtc(t.amount_btc)})</span></td>
                      <td className="px-2 py-1.5">
                        <span className="inline-flex items-center gap-1 font-bold" style={{ color: isGC ? '#92400E' : C.g600 }}>
                          {isGC ? <Gift size={11} /> : <CreditCard size={11} />} {isGC ? t.gift_card_brand : (t.payment_method || '—')}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </AuditSection>

      {/* Prior send-outs — has this user withdrawn before, and did any of those get declined? */}
      <AuditSection icon={<Clock size={13} />} title={`Previous Send-Outs (${withdrawals.history.length}) — ${withdrawals.confirmedCount} sent · ${withdrawals.rejectedCount} rejected`}>
        {withdrawals.history.length === 0 ? (
          <p className="text-xs font-semibold" style={{ color: C.g400 }}>This is this user's first withdrawal request.</p>
        ) : (
          <div className="space-y-1.5">
            {withdrawals.history.map(w => (
              <div key={w.id} className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg" style={{ backgroundColor: C.g50 }}>
                <span className="text-xs font-bold" style={{ color: C.g700 }}>
                  {w.currency === 'USDT' ? `₮${fmtUsdt(w.amount_usdt)}` : `₿${fmtBtc(w.amount_btc)}`}
                </span>
                <span className="text-xs" style={{ color: C.g400 }}>{fmtAge(w.created_at)}</span>
                <Pill label={WD_STATUS_PILL[w.status]?.label || w.status} color={(WD_STATUS_PILL[w.status] || {}).color || C.g500} bg={(WD_STATUS_PILL[w.status] || {}).bg || C.g100} />
                {w.status === 'REJECTED' && w.rejection_reason && <span className="text-xs italic flex-1 text-right" style={{ color: C.g400 }}>{w.rejection_reason}</span>}
              </div>
            ))}
          </div>
        )}
      </AuditSection>
    </div>
  );
}

// Waiting time gets more urgent the longer a request sits — green under an hour,
// amber up to 6h, red past that, so a stale request stands out in the list at a glance.
const waitColor = (ageMs) => {
  const h = ageMs / 3600000;
  if (h < 1) return '#166534';
  if (h < 6) return '#92400E';
  return '#991B1B';
};

function WithdrawalApprovals() {
  const { btcUsd } = useRates();
  const [tab, setTab]         = useState('PENDING_APPROVAL');
  const [rows, setRows]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId]   = useState(null);
  const [loadErr, setLoadErr] = useState('');
  const [auditId, setAuditId]         = useState(null);
  const [auditCache, setAuditCache]   = useState({});
  const [auditLoading, setAuditLoading] = useState(null);
  const [auditErr, setAuditErr]       = useState({});

  const toggleAudit = async (id) => {
    if (auditId === id) { setAuditId(null); return; }
    setAuditId(id);
    if (auditCache[id]) return;
    setAuditLoading(id);
    try {
      const r = await axios.get(`${API_URL}/hd-wallet/ceo-withdrawals/${id}/audit`, { headers: authH() });
      setAuditCache(c => ({ ...c, [id]: r.data }));
    } catch (e) {
      setAuditErr(er => ({ ...er, [id]: e.response?.data?.error || 'Failed to load audit details' }));
    } finally { setAuditLoading(null); }
  };

  const load = useCallback(async (status, silent = false) => {
    if (!silent) setLoading(true);
    setLoadErr('');
    try {
      const r = await axios.get(`${API_URL}/hd-wallet/ceo-withdrawals`, { params: { status: status || tab }, headers: authH() });
      setRows(r.data.withdrawals || []);
    } catch (e) {
      const msg = e.response?.data?.error || 'Failed to load withdrawal requests';
      setLoadErr(msg);
      if (!silent) toast.error(msg);
    }
    finally { if (!silent) setLoading(false); }
  }, [tab]);

  useEffect(() => { load(tab); }, [tab, load]);

  // Poll the Awaiting Review tab so a new request shows up without a manual refresh — this
  // list (not a cross-app notification popup) is now the one place a pending approval is
  // surfaced, so it needs to actually update on its own while the page is open.
  useEffect(() => {
    if (tab !== 'PENDING_APPROVAL') return;
    const iv = setInterval(() => load(tab, true), 20000);
    return () => clearInterval(iv);
  }, [tab, load]);

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
    <div id="send-out-approvals" className="bg-white rounded-2xl border p-5" style={{ borderColor: C.g200 }}>
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

      {loading ? <Spin /> : loadErr ? (
        <div className="flex flex-col items-center py-14 gap-2">
          <XCircle size={36} strokeWidth={1.5} style={{ color: C.danger }} />
          <p className="text-sm font-semibold" style={{ color: C.danger }}>{loadErr}</p>
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center py-14 gap-2">
          <ShieldCheck size={36} strokeWidth={1.5} style={{ color: C.g400 }} />
          <p className="text-sm font-semibold" style={{ color: C.g500 }}>Nothing here</p>
        </div>
      ) : (
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-xs">
            <thead>
              <tr style={{ backgroundColor: C.g50 }}>
                {['User', 'Amount', 'Destination', 'Waiting', 'Status', 'Actions'].map(h => (
                  <th key={h} className="text-left px-3 py-2.5 font-black whitespace-nowrap" style={{ color: C.g500 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(w => {
                const pill = WD_STATUS_PILL[w.status] || { label: w.status, color: C.g500, bg: C.g100 };
                return (
                  <React.Fragment key={w.id}>
                  <tr className="border-t align-top" style={{ borderColor: C.g100 }}>
                    <td className="px-3 py-2.5">
                      {w.is_fee_collection ? (
                        <>
                          <Pill label="🏦 PRAQEN Fee Collection" color="#92400E" bg="#FEF3C7" />
                          <p className="mt-1" style={{ color: C.g400 }}>Company wallet — not a customer</p>
                        </>
                      ) : (
                        <>
                          <p className="font-bold" style={{ color: C.g800 }}>{w.user?.username || w.user_id?.slice(0, 8)}</p>
                          <p style={{ color: C.g400 }}>{w.user?.email}</p>
                          <VerifBadges user={w.user} />
                          {w.user?.account_status === 'banned' && (
                            <p className="mt-1"><Pill label="⛔ BANNED — cannot approve" color="#991B1B" bg="#FEF2F2" /></p>
                          )}
                        </>
                      )}
                    </td>
                    <td className="px-3 py-2.5 font-bold whitespace-nowrap" style={{ color: C.g700 }}>
                      <div className="flex items-center gap-1.5">
                        <Pill label={w.currency === 'USDT' ? 'USDT' : 'BTC'} color={w.currency === 'USDT' ? '#0F766E' : '#B45309'} bg={w.currency === 'USDT' ? '#F0FDFA' : '#FEF3C7'} />
                        <span>{w.currency === 'USDT' ? `₮${fmtUsdt(w.amount_usdt)}` : `₿${fmtBtc(w.amount_btc)}`}</span>
                      </div>
                      <p className="font-black mt-0.5" style={{ color: C.forest }}>
                        ${fmtUsd(w.currency === 'USDT' ? w.amount_usdt : parseFloat(w.amount_btc || 0) * btcUsd)}
                      </p>
                      {w.currency === 'USDT'
                        ? (w.platform_fee_usdt ? <p className="font-medium" style={{ color: C.g400 }}>fee ₮{fmtUsdt(w.platform_fee_usdt)}</p> : null)
                        : (w.platform_fee_btc ? <p className="font-medium" style={{ color: C.g400 }}>fee ₿{fmtBtc(w.platform_fee_btc)}</p> : null)}
                    </td>
                    <td className="px-3 py-2.5 font-mono" style={{ color: C.g600, wordBreak: 'break-all', maxWidth: 200 }}>{w.destination_address}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span className="font-bold" style={{ color: w.status === 'PENDING_APPROVAL' ? waitColor(Date.now() - new Date(w.created_at)) : C.g500 }}>
                        {fmtAge(w.created_at)}
                      </span>
                      {w.reviewed_at && <p className="mt-0.5" style={{ color: C.g400 }}>Reviewed {fmtAge(w.reviewed_at)}</p>}
                    </td>
                    <td className="px-3 py-2.5">
                      <Pill label={pill.label} color={pill.color} bg={pill.bg} />
                      {w.status === 'REJECTED' && w.rejection_reason && <p className="mt-1" style={{ color: C.g400 }}>{w.rejection_reason}</p>}
                      {w.tx_hash && <p className="mt-1 font-mono" style={{ color: C.g400 }}>{w.tx_hash.slice(0, 16)}…</p>}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {!w.is_fee_collection && (
                          <button disabled={auditLoading === w.id} onClick={() => toggleAudit(w.id)}
                            className="px-2.5 py-1 rounded-lg font-bold flex items-center gap-1"
                            style={{ backgroundColor: auditId === w.id ? C.forest : C.g100, color: auditId === w.id ? '#fff' : C.g600, opacity: auditLoading === w.id ? 0.6 : 1 }}>
                            <Search size={11} /> {auditId === w.id ? 'Hide Audit' : 'Audit'}
                          </button>
                        )}
                        {w.status === 'PENDING_APPROVAL' && (
                          <>
                            <button disabled={busyId === w.id || w.user?.account_status === 'banned'}
                              onClick={() => approve(w.id)}
                              title={w.user?.account_status === 'banned' ? 'This account is banned — reject instead' : undefined}
                              className="px-2.5 py-1 rounded-lg font-bold"
                              style={{ backgroundColor: '#F0FDF4', color: '#166534', opacity: (busyId === w.id || w.user?.account_status === 'banned') ? 0.4 : 1 }}>
                              Approve
                            </button>
                            <button disabled={busyId === w.id} onClick={() => reject(w.id)}
                              className="px-2.5 py-1 rounded-lg font-bold" style={{ backgroundColor: '#FEF2F2', color: '#991B1B', opacity: busyId === w.id ? 0.5 : 1 }}>
                              Reject
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                  {auditId === w.id && (
                    <tr style={{ borderColor: C.g100 }} className="border-t">
                      <td colSpan={6} className="px-3 py-3" style={{ backgroundColor: C.g50 }}>
                        <AuditPanel data={auditCache[w.id]} loading={auditLoading === w.id} error={auditErr[w.id]} />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── KYC image — fetched as a blob with the CEO's auth token (can't just point an <img>
// at a private, auth-gated endpoint) and rendered from an object URL, same pattern
// AdminDashboard.js already uses for the same endpoint.
function KycImageBlock({ userId, type, label, onZoom }) {
  const [src, setSrc]       = useState(null);
  const [status, setStatus] = useState('loading'); // loading | ok | error

  useEffect(() => {
    if (!userId) return;
    setStatus('loading'); setSrc(null);
    fetch(`${API_URL}/admin/kyc/${userId}/image?type=${type}`, { headers: authH() })
      .then(r => { if (!r.ok) throw new Error(String(r.status)); return r.blob(); })
      .then(blob => { setSrc(URL.createObjectURL(blob)); setStatus('ok'); })
      .catch(() => setStatus('error'));
  }, [userId, type]);

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs font-black" style={{ color: C.g500 }}>{label}</p>
        {status === 'ok' && <span className="text-xs font-bold" style={{ color: C.forest }}>Tap to enlarge</span>}
      </div>
      <div onClick={() => status === 'ok' && onZoom(src)}
        className={`w-full rounded-xl overflow-hidden border flex items-center justify-center ${status === 'ok' ? 'cursor-zoom-in' : ''}`}
        style={{ borderColor: C.g200, height: 210, backgroundColor: C.g50 }}>
        {status === 'loading' && <div className="w-5 h-5 border-2 rounded-full animate-spin" style={{ borderColor: `${C.forest}20`, borderTopColor: C.forest }} />}
        {status === 'error' && <span className="text-xs font-semibold" style={{ color: C.g400 }}>Not available</span>}
        {status === 'ok' && <img src={src} alt={label} className="w-full h-full object-cover" />}
      </div>
    </div>
  );
}

function ImageZoomModal({ src, onClose }) {
  if (!src) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.85)' }} onClick={onClose}>
      <img src={src} alt="KYC document" className="max-w-full max-h-full rounded-xl" onClick={e => e.stopPropagation()} />
    </div>
  );
}

// ─── KYC review modal — full submissions list with images + approve/reject, so the CEO can
// act without leaving this page. Uses the same GET/PUT /api/admin/kyc* endpoints Admin uses
// (server.js now also accepts is_ceo on those specific routes via requireFullAdminOrCeo —
// scoped to just KYC, not a blanket admin-access grant).
function KycReviewModal({ onClose, onActed }) {
  const [subs, setSubs]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState('');
  const [busyId, setBusyId]   = useState(null);
  const [zoomSrc, setZoomSrc] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setLoadErr('');
    try {
      const r = await axios.get(`${API_URL}/admin/kyc`, { params: { status: 'pending' }, headers: authH() });
      setSubs(r.data.submissions || []);
    } catch (e) { setLoadErr(e.response?.data?.error || 'Failed to load KYC submissions'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const approve = async (userId) => {
    setBusyId(userId);
    try {
      await axios.put(`${API_URL}/admin/kyc/${userId}/approve`, {}, { headers: authH() });
      toast.success('KYC approved');
      setSubs(s => s.filter(u => u.id !== userId));
      onActed();
    } catch (e) { toast.error(e.response?.data?.error || 'Failed to approve'); }
    finally { setBusyId(null); }
  };

  const reject = async (userId) => {
    const reason = window.prompt('Reason for rejecting this KYC submission (the user will see this):');
    if (reason === null) return;
    if (!reason.trim()) { toast.error('A reason is required to reject'); return; }
    setBusyId(userId);
    try {
      await axios.put(`${API_URL}/admin/kyc/${userId}/reject`, { reason: reason.trim() }, { headers: authH() });
      toast.success('KYC rejected');
      setSubs(s => s.filter(u => u.id !== userId));
      onActed();
    } catch (e) { toast.error(e.response?.data?.error || 'Failed to reject'); }
    finally { setBusyId(null); }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.6)' }} onClick={onClose}>
      {/* Single scroll region (flex column, header fixed + body flex-1 overflow-y-auto) —
          no nested scrollbars, and the modal never grows taller than the viewport. */}
      <div className="bg-white rounded-2xl w-full max-w-lg flex flex-col" style={{ maxHeight: '88vh' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b flex-shrink-0" style={{ borderColor: C.g200 }}>
          <h2 className="font-black text-base flex items-center gap-2" style={{ color: C.g800 }}>
            <ShieldCheck size={18} /> KYC Review{subs.length > 0 ? ` (${subs.length})` : ''}
          </h2>
          <button onClick={onClose} className="p-2 rounded-xl" style={{ backgroundColor: C.g100 }}>
            <XCircle size={16} style={{ color: C.g500 }} />
          </button>
        </div>
        <div className="p-5 space-y-5 overflow-y-auto flex-1">
          {loading ? <Spin /> : loadErr ? (
            <p className="text-sm font-semibold text-center py-10" style={{ color: C.danger }}>{loadErr}</p>
          ) : subs.length === 0 ? (
            <div className="flex flex-col items-center py-14 gap-2">
              <ShieldCheck size={36} strokeWidth={1.5} style={{ color: C.g400 }} />
              <p className="text-sm font-semibold" style={{ color: C.g500 }}>Nothing pending</p>
            </div>
          ) : subs.map(u => (
            <div key={u.id} className="rounded-2xl border p-4" style={{ borderColor: C.g200 }}>
              {/* Name/email/badges/time all stacked in one simple left-aligned column —
                  nothing to misalign regardless of how narrow the modal gets. */}
              <p className="font-black text-sm" style={{ color: C.g800 }}>{u.username || u.email}</p>
              <p className="text-xs mt-0.5" style={{ color: C.g400 }}>{u.email}</p>
              <div className="flex items-center flex-wrap gap-1.5 mt-1.5">
                <VerifBadges user={u} />
                <span className="text-xs" style={{ color: C.g400 }}>· {fmtAge(u.kyc_submitted_at || u.created_at)}</span>
              </div>

              <div className="space-y-3 mt-3 mb-3">
                <KycImageBlock userId={u.id} type="front" label="ID Front" onZoom={setZoomSrc} />
                <KycImageBlock userId={u.id} type="back" label="ID Back" onZoom={setZoomSrc} />
              </div>

              <div className="flex items-center gap-2">
                <button disabled={busyId === u.id} onClick={() => approve(u.id)}
                  className="flex-1 py-2 rounded-xl font-bold text-sm" style={{ backgroundColor: '#F0FDF4', color: '#166534', opacity: busyId === u.id ? 0.5 : 1 }}>
                  Approve
                </button>
                <button disabled={busyId === u.id} onClick={() => reject(u.id)}
                  className="flex-1 py-2 rounded-xl font-bold text-sm" style={{ backgroundColor: '#FEF2F2', color: '#991B1B', opacity: busyId === u.id ? 0.5 : 1 }}>
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
      <ImageZoomModal src={zoomSrc} onClose={() => setZoomSrc(null)} />
    </div>
  );
}

const MIGRATION_PLATFORM_LABELS = { noones: 'Noones', binance: 'Binance P2P', other: 'Other platform' };

// ─── P2P-migration review modal — same shape as KYC review, but the screenshot bucket is
// public so it's a plain <img src>, no auth-blob fetch needed. Approve/reject use
// requireFullAdminOrCeo the same way the KYC routes above do.
function MigrationReviewModal({ onClose, onActed }) {
  const [subs, setSubs]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState('');
  const [busyId, setBusyId]   = useState(null);
  const [zoomSrc, setZoomSrc] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setLoadErr('');
    try {
      const r = await axios.get(`${API_URL}/admin/p2p-migration`, { params: { status: 'pending' }, headers: authH() });
      setSubs(r.data.submissions || []);
    } catch (e) { setLoadErr(e.response?.data?.error || 'Failed to load migration requests'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const approve = async (id) => {
    setBusyId(id);
    try {
      await axios.put(`${API_URL}/admin/p2p-migration/${id}/approve`, {}, { headers: authH() });
      toast.success('Migration request approved');
      setSubs(s => s.filter(x => x.id !== id));
      onActed();
    } catch (e) { toast.error(e.response?.data?.error || 'Failed to approve'); }
    finally { setBusyId(null); }
  };

  const reject = async (id) => {
    const notes = window.prompt('Reason for rejecting this migration request (optional):') || null;
    setBusyId(id);
    try {
      await axios.put(`${API_URL}/admin/p2p-migration/${id}/reject`, { notes }, { headers: authH() });
      toast.success('Migration request rejected');
      setSubs(s => s.filter(x => x.id !== id));
      onActed();
    } catch (e) { toast.error(e.response?.data?.error || 'Failed to reject'); }
    finally { setBusyId(null); }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.6)' }} onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg flex flex-col" style={{ maxHeight: '88vh' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b flex-shrink-0" style={{ borderColor: C.g200 }}>
          <h2 className="font-black text-base flex items-center gap-2" style={{ color: C.g800 }}>
            <Repeat size={18} /> Migration Requests{subs.length > 0 ? ` (${subs.length})` : ''}
          </h2>
          <button onClick={onClose} className="p-2 rounded-xl" style={{ backgroundColor: C.g100 }}>
            <XCircle size={16} style={{ color: C.g500 }} />
          </button>
        </div>
        <div className="p-5 space-y-5 overflow-y-auto flex-1">
          {loading ? <Spin /> : loadErr ? (
            <p className="text-sm font-semibold text-center py-10" style={{ color: C.danger }}>{loadErr}</p>
          ) : subs.length === 0 ? (
            <div className="flex flex-col items-center py-14 gap-2">
              <Repeat size={36} strokeWidth={1.5} style={{ color: C.g400 }} />
              <p className="text-sm font-semibold" style={{ color: C.g500 }}>Nothing pending</p>
            </div>
          ) : subs.map(sReq => (
            <div key={sReq.id} className="rounded-2xl border p-4" style={{ borderColor: C.g200 }}>
              <p className="font-black text-sm" style={{ color: C.g800 }}>{sReq.email}</p>
              <div className="flex items-center flex-wrap gap-1.5 mt-1.5">
                <Pill label={MIGRATION_PLATFORM_LABELS[sReq.platform] || sReq.platform} color="#7C3AED" bg="#F5F3FF" />
                <span className="text-xs" style={{ color: C.g400 }}>· {fmtAge(sReq.created_at)}</span>
              </div>

              <div className="mt-3 mb-3">
                <p className="text-xs font-black mb-1" style={{ color: C.g500 }}>Screenshot</p>
                {sReq.screenshot_url ? (
                  <div onClick={() => setZoomSrc(sReq.screenshot_url)}
                    className="w-full rounded-xl overflow-hidden border cursor-zoom-in flex items-center justify-center"
                    style={{ borderColor: C.g200, height: 210, backgroundColor: C.g50 }}>
                    <img src={sReq.screenshot_url} alt="P2P history screenshot" className="w-full h-full object-cover" />
                  </div>
                ) : (
                  <p className="text-xs font-semibold" style={{ color: C.g400 }}>No screenshot attached</p>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button disabled={busyId === sReq.id} onClick={() => approve(sReq.id)}
                  className="flex-1 py-2 rounded-xl font-bold text-sm" style={{ backgroundColor: '#F0FDF4', color: '#166534', opacity: busyId === sReq.id ? 0.5 : 1 }}>
                  Approve
                </button>
                <button disabled={busyId === sReq.id} onClick={() => reject(sReq.id)}
                  className="flex-1 py-2 rounded-xl font-bold text-sm" style={{ backgroundColor: '#FEF2F2', color: '#991B1B', opacity: busyId === sReq.id ? 0.5 : 1 }}>
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
      <ImageZoomModal src={zoomSrc} onClose={() => setZoomSrc(null)} />
    </div>
  );
}

const SECURITY_EVENT_LABEL = {
  LOGIN_SUCCESS: { label: 'Login succeeded', color: '#166534', bg: '#F0FDF4' },
  LOGIN_FAILED_PASSWORD: { label: 'Wrong password', color: '#991B1B', bg: '#FEF2F2' },
  LOGIN_FAILED_OTP: { label: 'Wrong email code', color: '#991B1B', bg: '#FEF2F2' },
  LOGIN_FAILED_2FA: { label: 'Wrong 2FA code', color: '#991B1B', bg: '#FEF2F2' },
  LOGIN_2FA_REQUIRED: { label: '2FA code sent', color: '#7C3AED', bg: '#F5F3FF' },
  LOGIN_BLOCKED_BANNED: { label: 'Blocked — banned account', color: '#991B1B', bg: '#FEF2F2' },
  LOGIN_BLOCKED_LOCKOUT: { label: 'Blocked — locked out', color: '#92400E', bg: '#FFFBEB' },
  LOCKOUT_CLEARED: { label: 'Lockout cleared by CEO', color: '#166534', bg: '#F0FDF4' },
};

// ─── Security Alerts modal — real login-security data (see database/security_events.sql +
// backend/services/securityLogService.js): failed passwords, failed OTP/2FA codes, blocked
// banned-account logins, blocked lockouts, and which accounts are currently locked out with
// a one-click Unlock. Same modal shell as KycReviewModal/MigrationReviewModal above.
function SecurityAlertsModal({ ceoUser, onClose, onActed }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState('');
  const [busyId, setBusyId]   = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setLoadErr('');
    try {
      const r = await axios.get(`${API_URL}/hd-wallet/ceo/security-events`, { headers: authH() });
      setData(r.data);
    } catch (e) { setLoadErr(e.response?.data?.error || 'Failed to load security events'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const unlock = async (userId) => {
    setBusyId(userId);
    try {
      await axios.post(`${API_URL}/hd-wallet/ceo/security-events/${userId}/unlock`, {}, { headers: authH() });
      toast.success('Lockout cleared — this account can log in again');
      load();
      onActed();
    } catch (e) { toast.error(e.response?.data?.error || 'Failed to clear lockout'); }
    finally { setBusyId(null); }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.6)' }} onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-2xl flex flex-col" style={{ maxHeight: '88vh' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b flex-shrink-0" style={{ borderColor: C.g200 }}>
          <h2 className="font-black text-base flex items-center gap-2" style={{ color: C.g800 }}>
            <Lock size={18} /> Security Alerts — last 7 days
          </h2>
          <button onClick={onClose} className="p-2 rounded-xl" style={{ backgroundColor: C.g100 }}>
            <XCircle size={16} style={{ color: C.g500 }} />
          </button>
        </div>
        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          {!ceoUser?.two_factor_enabled && (
            <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl border" style={{ borderColor: '#FDE68A', backgroundColor: '#FFFBEB' }}>
              <AlertTriangle size={14} style={{ color: '#92400E', flexShrink: 0, marginTop: 1 }} />
              <p className="text-xs font-bold" style={{ color: '#92400E' }}>
                2FA isn't enabled on your own account yet — turn it on in Settings → Security so your CEO login gets the same protection this page is built to enforce.
              </p>
            </div>
          )}
          {loading ? <Spin /> : loadErr ? (
            <p className="text-sm font-semibold text-center py-10" style={{ color: C.danger }}>{loadErr}</p>
          ) : data?.tableMissing ? (
            <div className="flex flex-col items-center py-10 gap-2 text-center">
              <AlertTriangle size={36} strokeWidth={1.5} style={{ color: C.warn }} />
              <p className="text-sm font-bold" style={{ color: C.g700 }}>Security logging isn't set up yet</p>
              <p className="text-xs max-w-sm" style={{ color: C.g500 }}>
                Run <code className="font-mono px-1 rounded" style={{ backgroundColor: C.g100 }}>database/security_events.sql</code> once in the Supabase SQL Editor, then this fills in automatically on every login attempt.
              </p>
            </div>
          ) : (
            <>
              {data.summary.lockedAccounts.length > 0 && (
                <div>
                  <h3 className="text-xs font-black uppercase tracking-wide mb-2" style={{ color: C.g500 }}>
                    Currently Locked Out ({data.summary.lockedAccounts.length})
                  </h3>
                  <div className="space-y-1.5">
                    {data.summary.lockedAccounts.map(l => (
                      <div key={l.id} className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl border" style={{ borderColor: '#FDE68A', backgroundColor: '#FFFBEB' }}>
                        <div>
                          <p className="text-sm font-bold" style={{ color: C.g800 }}>{l.user?.username || l.id.slice(0, 8)}</p>
                          <p className="text-xs" style={{ color: C.g500 }}>{l.user?.email} · {l.failureCount} failed attempts · unlocks in {Math.max(1, Math.ceil((new Date(l.unlocksAt).getTime() - Date.now()) / 60000))}m</p>
                        </div>
                        <button disabled={busyId === l.id} onClick={() => unlock(l.id)}
                          className="px-3 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1 flex-shrink-0"
                          style={{ backgroundColor: '#F0FDF4', color: '#166534', opacity: busyId === l.id ? 0.5 : 1 }}>
                          <Unlock size={12} /> Unlock now
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {data.summary.topIps.length > 0 && (
                <div>
                  <h3 className="text-xs font-black uppercase tracking-wide mb-2" style={{ color: C.g500 }}>Top IPs by Failed Attempts</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {data.summary.topIps.map(ip => (
                      <span key={ip.ip} className="text-xs font-mono px-2 py-1 rounded-lg" style={{ backgroundColor: C.g100, color: C.g700 }}>
                        {ip.ip} <span className="font-black" style={{ color: C.danger }}>×{ip.count}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <h3 className="text-xs font-black uppercase tracking-wide mb-2" style={{ color: C.g500 }}>
                  Recent Events ({data.events.length}) · {data.summary.privilegedFailures} against admin/CEO accounts
                </h3>
                {data.events.length === 0 ? (
                  <div className="flex flex-col items-center py-10 gap-2">
                    <ShieldCheck size={32} strokeWidth={1.5} style={{ color: C.g400 }} />
                    <p className="text-sm font-semibold" style={{ color: C.g500 }}>Nothing flagged in the last 7 days</p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {data.events.map(e => {
                      const pill = SECURITY_EVENT_LABEL[e.event_type] || { label: e.event_type, color: C.g600, bg: C.g100 };
                      return (
                        <div key={e.id} className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg" style={{ backgroundColor: C.g50 }}>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <Pill label={pill.label} color={pill.color} bg={pill.bg} />
                              {e.is_privileged && <Pill label="⚠️ Admin/CEO account" color="#991B1B" bg="#FEF2F2" />}
                            </div>
                            <p className="text-xs mt-1 truncate" style={{ color: C.g600 }}>
                              {e.user?.username || e.email_attempted || 'Unknown'} · <span className="font-mono">{e.ip_address || '—'}</span>
                            </p>
                          </div>
                          <span className="text-xs flex-shrink-0" style={{ color: C.g400 }}>{fmtAge(e.created_at)}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Support Chat — join any live trade as PRAQEN Support and chat in real time. Ported
// from TeamDashboard.js's SupportChatSection (same feature, same backend endpoints — just
// widened server-side to also accept is_ceo, see requireAdminOrCeo / moderator-join /
// senderRole in server.js) with one real fix: the original never rendered trade proof
// images at all (plain-text messages only) — this version fetches and shows them.
function SupportChatSection({ ceoUser }) {
  const [trades, setTrades]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [messages, setMessages] = useState([]);
  const [images, setImages]   = useState([]);
  const [newMsg, setNewMsg]   = useState('');
  const [sending, setSending] = useState(false);
  const [joined, setJoined]   = useState(false);
  const [searchQ, setSearchQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('active');
  const [zoomSrc, setZoomSrc] = useState(null);
  const chatEnd = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${API_URL}/admin/trades/all`, { headers: authH(), params: { limit: 50, page: 1 } });
      let list = r.data.trades || [];
      if (statusFilter === 'active') list = list.filter(t => ['FUNDS_LOCKED', 'PAYMENT_SENT', 'DISPUTED', 'ACTIVE'].includes(t.status));
      if (searchQ.trim()) {
        const q = searchQ.trim().toLowerCase();
        list = list.filter(t =>
          t.id?.toLowerCase().includes(q) ||
          t.trade_ref?.toLowerCase().includes(q) ||
          t.buyer?.username?.toLowerCase().includes(q) ||
          t.seller?.username?.toLowerCase().includes(q)
        );
      }
      setTrades(list);
    } catch { toast.error('Failed to load trades'); }
    setLoading(false);
  }, [statusFilter, searchQ]);

  useEffect(() => { load(); }, [load]);

  const loadChat = useCallback(async (tradeId) => {
    if (!tradeId) return;
    try {
      const [msgR, imgR] = await Promise.all([
        axios.get(`${API_URL}/messages/${tradeId}`, { headers: authH() }),
        axios.get(`${API_URL}/trades/${tradeId}/images`, { headers: authH() }),
      ]);
      setMessages(msgR.data.messages || []);
      setImages(imgR.data.images || []);
    } catch {}
  }, []);

  useEffect(() => {
    if (!selected) return;
    loadChat(selected.id);
    const iv = setInterval(() => loadChat(selected.id), 4000);
    return () => clearInterval(iv);
  }, [selected, loadChat]);

  useEffect(() => { chatEnd.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const openTrade = (t) => { setSelected(t); setJoined(false); setMessages([]); setImages([]); };

  const joinAsSupport = async () => {
    try { await axios.post(`${API_URL}/trades/${selected.id}/moderator-join`, {}, { headers: authH() }); } catch {}
    setJoined(true);
    toast.success('Joined as PRAQEN Support');
    loadChat(selected.id);
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!newMsg.trim() || !joined) return;
    setSending(true);
    try {
      await axios.post(`${API_URL}/messages`, { tradeId: selected.id, message: newMsg.trim() }, { headers: authH() });
      setNewMsg('');
      loadChat(selected.id);
    } catch { toast.error('Failed to send'); }
    setSending(false);
  };

  return (
    <div>
      <h2 className="text-sm font-black uppercase tracking-wide mb-3" style={{ color: C.g500 }}>Support Chat</h2>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-xs" style={{ color: C.g400 }}>Join any live trade as PRAQEN Support and help users in real time</p>
          <button onClick={load} className="p-2 rounded-xl border hover:bg-gray-50 transition flex-shrink-0" style={{ borderColor: C.g200 }}>
            <RefreshCw size={14} style={{ color: C.g500 }} />
          </button>
        </div>

        <div className="flex items-start gap-3 p-4 rounded-xl" style={{ backgroundColor: '#EFF6FF', border: '1px solid #BFDBFE' }}>
          <MessageSquare size={16} style={{ color: '#3B82F6', flexShrink: 0, marginTop: 1 }} />
          <p className="text-xs font-semibold" style={{ color: '#1E40AF' }}>
            Select any active trade below → click <strong>Join as Support</strong> → your messages will appear with a PRAQEN Support badge visible to both the buyer and seller.
          </p>
        </div>

        <div className="flex gap-2 flex-wrap">
          <div className="flex items-center gap-2 bg-white border rounded-xl px-3 py-2 flex-1 min-w-[200px]" style={{ borderColor: C.g200 }}>
            <Search size={13} style={{ color: C.g400 }} />
            <input value={searchQ} onChange={e => setSearchQ(e.target.value)}
              placeholder="Search by trade ID, buyer or seller name…"
              className="flex-1 text-sm outline-none" style={{ color: C.g700 }} />
            {searchQ && <button onClick={() => setSearchQ('')}><X size={13} style={{ color: C.g400 }} /></button>}
          </div>
          <div className="flex rounded-xl overflow-hidden border" style={{ borderColor: C.g200 }}>
            {[{ v: 'active', l: 'Active' }, { v: 'all', l: 'All' }].map(o => (
              <button key={o.v} onClick={() => setStatusFilter(o.v)}
                className="px-4 py-2 text-xs font-bold transition"
                style={{ backgroundColor: statusFilter === o.v ? C.forest : 'white', color: statusFilter === o.v ? 'white' : C.g600 }}>
                {o.l}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-4 flex-col lg:flex-row" style={{ minHeight: 500 }}>
          {/* Trade list */}
          <div className="w-full lg:w-80 flex-shrink-0 space-y-2 overflow-y-auto" style={{ maxHeight: 600 }}>
            {loading ? <Spin /> : trades.length === 0 ? (
              <div className="flex flex-col items-center py-14 gap-2">
                <MessageCircle size={36} strokeWidth={1.5} style={{ color: C.g400 }} />
                <p className="text-sm font-semibold" style={{ color: C.g500 }}>No trades found</p>
              </div>
            ) : trades.map(t => {
              const isGC = !!t.gift_card_brand;
              const typeLabel = isGC ? `${t.gift_card_brand} Gift Card` : (t.payment_method || 'Payment method —');
              return (
              <div key={t.id} onClick={() => openTrade(t)}
                className="bg-white rounded-xl border-2 p-3 cursor-pointer hover:shadow-md transition"
                style={{ borderColor: selected?.id === t.id ? C.forest : C.g200 }}>
                <div className="flex items-center gap-2 mb-2">
                  <Pill label={t.status} color={statusColor(t.status)} bg={`${statusColor(t.status)}15`} />
                  <span className="text-xs font-mono ml-auto" style={{ color: C.g400 }}>#{(t.id || '').slice(0, 8).toUpperCase()}</span>
                </div>
                <div className="flex items-center gap-3 mb-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-black text-white flex-shrink-0" style={{ backgroundColor: C.green }}>
                      {(t.buyer?.username || '?')[0].toUpperCase()}
                    </div>
                    <div className="leading-tight min-w-0">
                      <p className="text-[9px] font-bold uppercase tracking-wide" style={{ color: C.g400 }}>Buyer</p>
                      <p className="text-xs font-bold truncate" style={{ color: C.g700 }}>{t.buyer?.username || '—'}</p>
                    </div>
                  </div>
                  <span className="text-xs flex-shrink-0" style={{ color: C.g400 }}>→</span>
                  <div className="flex items-center gap-1.5 min-w-0">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-black text-white flex-shrink-0" style={{ backgroundColor: '#3B82F6' }}>
                      {(t.seller?.username || '?')[0].toUpperCase()}
                    </div>
                    <div className="leading-tight min-w-0">
                      <p className="text-[9px] font-bold uppercase tracking-wide" style={{ color: C.g400 }}>Seller</p>
                      <p className="text-xs font-bold truncate" style={{ color: C.g700 }}>{t.seller?.username || '—'}</p>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 mb-2 px-2 py-1 rounded-lg" style={{ backgroundColor: isGC ? '#FEF3C7' : '#F1F5F9' }}>
                  {isGC ? <Gift size={11} style={{ color: '#B45309', flexShrink: 0 }} /> : <CreditCard size={11} style={{ color: C.g500, flexShrink: 0 }} />}
                  <span className="text-xs font-bold truncate" style={{ color: isGC ? '#92400E' : C.g600 }}>{typeLabel}</span>
                </div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-xs font-black" style={{ color: C.g800 }}>${fmtUsd(t.amount_usd)}</span>
                  <span className="text-xs" style={{ color: C.g400 }}>{fmtAge(t.created_at)}</span>
                </div>
                {t.status === 'DISPUTED' && (
                  <div className="mt-2 flex items-center gap-1 text-xs font-bold" style={{ color: C.danger }}>
                    <AlertTriangle size={11} /> Disputed — needs attention
                  </div>
                )}
              </div>
              );
            })}
          </div>

          {/* Chat panel */}
          {selected ? (
            <div className="flex-1 bg-white rounded-2xl border flex flex-col overflow-hidden" style={{ borderColor: C.g200, maxHeight: 600 }}>
              <div className="px-5 py-4 border-b flex items-center gap-3 flex-shrink-0" style={{ borderColor: C.g100, backgroundColor: C.g50 }}>
                <div>
                  <p className="font-black text-sm" style={{ color: C.g800 }}>{selected.buyer?.username} ↔ {selected.seller?.username}</p>
                  <p className="text-xs" style={{ color: C.g500 }}>
                    ${fmtUsd(selected.amount_usd)} · {selected.gift_card_brand ? `${selected.gift_card_brand} Gift Card` : (selected.payment_method || '—')} · #{selected.id.slice(0, 8).toUpperCase()}
                  </p>
                </div>
                <div className="ml-auto flex items-center gap-2">
                  <Pill label={selected.status} color={statusColor(selected.status)} bg={`${statusColor(selected.status)}15`} />
                  <button onClick={() => setSelected(null)} className="p-1.5 rounded-lg hover:bg-gray-200">
                    <X size={14} style={{ color: C.g500 }} />
                  </button>
                </div>
              </div>

              {!joined ? (
                <div className="px-5 py-3 flex items-center gap-3 flex-shrink-0" style={{ backgroundColor: '#faf5ff', borderBottom: '1px solid #c4b5fd' }}>
                  <Shield size={14} style={{ color: '#7C3AED' }} />
                  <p className="text-xs font-bold flex-1" style={{ color: '#5B21B6' }}>You are viewing this chat. Join to reply as PRAQEN Support.</p>
                  <button onClick={joinAsSupport} className="px-3 py-1.5 rounded-lg text-xs font-black text-white" style={{ backgroundColor: '#7C3AED' }}>
                    Join as Support
                  </button>
                </div>
              ) : (
                <div className="px-5 py-2 flex items-center gap-2 flex-shrink-0" style={{ backgroundColor: '#faf5ff', borderBottom: '1px solid #c4b5fd' }}>
                  <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: '#a855f7' }} />
                  <p className="text-xs font-bold" style={{ color: '#5B21B6' }}>
                    You are live in this chat as <strong>PRAQEN Support · {ceoUser?.username}</strong>
                  </p>
                </div>
              )}

              {/* Proof images — the piece the original Team Portal version never rendered */}
              {images.length > 0 && (
                <div className="px-5 py-3 border-b flex-shrink-0" style={{ borderColor: C.g100, backgroundColor: '#fffbeb' }}>
                  <span className="text-xs font-bold flex items-center gap-1 mb-2" style={{ color: C.g600 }}>
                    <Paperclip size={12} /> {images.length} uploaded proof{images.length !== 1 ? 's' : ''}
                  </span>
                  <div className="flex gap-2 flex-wrap">
                    {images.map((img, i) => {
                      const src = img.image_url || img.url;
                      if (!src) return null;
                      return (
                        <button key={i} onClick={() => setZoomSrc(src)}
                          className="w-16 h-16 rounded-xl overflow-hidden border-2 hover:opacity-80 transition flex-shrink-0"
                          style={{ borderColor: C.gold }}>
                          <img src={src} alt="Payment proof" className="w-full h-full object-cover" onError={e => { e.target.style.display = 'none'; }} />
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0" style={{ backgroundColor: '#f9fafb' }}>
                {messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full">
                    <MessageCircle size={36} className="mb-2" style={{ color: C.g400 }} />
                    <p className="text-sm font-semibold" style={{ color: C.g400 }}>No messages yet in this trade</p>
                  </div>
                ) : messages.map((m, i) => {
                  const isMod = m.sender_role === 'moderator' || (m.message_text || m.message || '').startsWith('[MODERATOR]');
                  const isSys = !m.sender_id || m.message_type === 'SYSTEM' || m.sender_role === 'system';
                  const text = (m.message_text || m.message || '').replace(/^\[MODERATOR\]\s*/, '');
                  const isBuyer = m.sender_id === selected.buyer_id || m.sender_id === selected.buyer?.id;
                  const timeStr = new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                  if (isSys) return (
                    <div key={i} className="flex justify-center">
                      <span className="px-3 py-1 rounded-full text-xs" style={{ backgroundColor: C.g200, color: C.g600 }}>{text}</span>
                    </div>
                  );
                  if (isMod) return (
                    <div key={i} className="flex justify-center">
                      <div className="w-full max-w-[90%] rounded-xl overflow-hidden border-2" style={{ borderColor: '#7C3AED' }}>
                        <div className="px-3 py-1.5 flex items-center gap-2" style={{ background: 'linear-gradient(90deg,#5B21B6,#7C3AED)' }}>
                          <Shield size={11} color="#fff" />
                          <span className="text-xs font-black text-white">PRAQEN Support</span>
                          <span className="ml-auto text-xs text-white/50">{timeStr}</span>
                        </div>
                        <div className="px-3 py-2" style={{ backgroundColor: '#faf5ff' }}>
                          <p className="text-xs font-medium" style={{ color: '#4c1d95' }}>{text}</p>
                        </div>
                      </div>
                    </div>
                  );
                  return (
                    <div key={i} className={`flex ${isBuyer ? 'justify-start' : 'justify-end'}`}>
                      <div className="max-w-[70%] rounded-xl border overflow-hidden"
                        style={{ backgroundColor: isBuyer ? 'white' : '#f0fdf4', borderColor: isBuyer ? C.g200 : '#86efac' }}>
                        <div className="px-3 py-1 flex items-center gap-1.5" style={{ backgroundColor: isBuyer ? '#f9fafb' : '#dcfce7' }}>
                          <div className="w-4 h-4 rounded-full flex items-center justify-center text-xs font-black text-white flex-shrink-0"
                            style={{ backgroundColor: isBuyer ? C.green : '#3B82F6' }}>
                            {(isBuyer ? selected.buyer?.username : selected.seller?.username || '?')[0].toUpperCase()}
                          </div>
                          <span className="text-xs font-black" style={{ color: isBuyer ? C.green : '#3B82F6' }}>
                            {isBuyer ? selected.buyer?.username : selected.seller?.username}
                          </span>
                          <span className="ml-auto text-xs" style={{ color: C.g400 }}>{timeStr}</span>
                        </div>
                        <div className="px-3 py-2">
                          <p className="text-xs break-words" style={{ color: C.g800 }}>{text}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={chatEnd} />
              </div>

              <form onSubmit={sendMessage} className="flex gap-2 p-4 border-t flex-shrink-0" style={{ borderColor: C.g100 }}>
                <div className="flex-1 relative">
                  <input type="text" value={newMsg} onChange={e => setNewMsg(e.target.value)}
                    disabled={!joined}
                    placeholder={joined ? 'Type support message — visible to both parties…' : 'Join the chat first to reply'}
                    className="w-full pl-9 pr-4 py-2.5 border rounded-xl text-xs font-medium outline-none disabled:bg-gray-50 disabled:text-gray-400"
                    style={{ borderColor: newMsg ? '#7C3AED' : C.g200 }} />
                  <Shield size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: joined ? '#7C3AED' : C.g400 }} />
                </div>
                <button type="submit" disabled={sending || !newMsg.trim() || !joined}
                  className="px-4 py-2.5 rounded-xl text-white font-black text-xs flex items-center gap-1.5 disabled:opacity-40"
                  style={{ backgroundColor: '#7C3AED' }}>
                  {sending ? <RefreshCw size={12} className="animate-spin" /> : <Send size={12} />} Send
                </button>
              </form>
            </div>
          ) : (
            <div className="flex-1 bg-white rounded-2xl border flex items-center justify-center py-14" style={{ borderColor: C.g200 }}>
              <div className="text-center">
                <MessageSquare size={48} className="mx-auto mb-3" style={{ color: C.g400 }} />
                <p className="font-black" style={{ color: C.g600 }}>Select a trade to open the chat</p>
                <p className="text-xs mt-1" style={{ color: C.g400 }}>Choose any active trade from the left panel</p>
              </div>
            </div>
          )}
        </div>
      </div>
      <ImageZoomModal src={zoomSrc} onClose={() => setZoomSrc(null)} />
    </div>
  );
}

// ─── Main dashboard ─────────────────────────────────────────────────────────
export default function CeoDashboard({ user: appUser }) {
  const { btcUsd } = useRates();
  const [ceoUser, setCeoUser]     = useState(null);
  const [treasury, setTreasury]   = useState(null);
  const [loadingT, setLoadingT]   = useState(true);
  const [pulse, setPulse]         = useState(null);
  const [loadingP, setLoadingP]   = useState(true);
  const [kycModalOpen, setKycModalOpen] = useState(false);
  const [migrationModalOpen, setMigrationModalOpen] = useState(false);
  const [securityModalOpen, setSecurityModalOpen] = useState(false);
  // BTC + USDT (≈$1) combined into one USD figure for the Company Pulse headlines below.
  const usdOf = (btc, usdt) => (parseFloat(btc || 0) * btcUsd) + parseFloat(usdt || 0);

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

  const loadPulse = useCallback(async (silent = false) => {
    if (!silent) setLoadingP(true);
    try {
      const r = await axios.get(`${API_URL}/hd-wallet/ceo/pulse`, { headers: authH() });
      setPulse(r.data);
    } catch (e) { if (!silent) toast.error(e.response?.data?.error || 'Failed to load company pulse'); }
    finally { if (!silent) setLoadingP(false); }
  }, []);

  useEffect(() => { if (ceoUser) { loadTreasury(); loadPulse(); } }, [ceoUser, loadTreasury, loadPulse]);

  // Keeps the Approvals badges (pending KYC/disputes/migration counts) current without a
  // manual refresh — same reasoning as the withdrawal-list polling below.
  useEffect(() => {
    if (!ceoUser) return;
    const iv = setInterval(() => loadPulse(true), 30000);
    return () => clearInterval(iv);
  }, [ceoUser, loadPulse]);

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
            <button onClick={() => { loadTreasury(); loadPulse(); }} className="p-2.5 rounded-xl transition" style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}>
              <RefreshCw size={16} color="#fff" className={(loadingT || loadingP) ? 'animate-spin' : ''} />
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
            {/* Company Pulse — money in vs. out, trade volume, growth */}
            {pulse && (
              <div>
                <h2 className="text-sm font-black uppercase tracking-wide mb-3" style={{ color: C.g500 }}>Company Pulse</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <TreasuryCard
                    icon={<ArrowDownRight size={18} />} label="Money In · 24h" color="#059669" bg="#F0FDF4"
                    primary={`$${fmtUsd(usdOf(pulse.moneyIn.last24h.btc, pulse.moneyIn.last24h.usdt))}`}
                    growthPct={growthOf(usdOf, pulse.moneyIn.last24h, pulse.moneyIn.prev24h)}
                    primarySub={`₿${fmtBtc(pulse.moneyIn.last24h.btc)} + ₮${fmtUsdt(pulse.moneyIn.last24h.usdt)} USDT`}
                    secondary={`$${fmtUsd(usdOf(pulse.moneyIn.last7d.btc, pulse.moneyIn.last7d.usdt))}`}
                    secondaryColor="#059669"
                    secondarySub={`Last 7 days · ₿${fmtBtc(pulse.moneyIn.last7d.btc)} + ₮${fmtUsdt(pulse.moneyIn.last7d.usdt)}`}
                    footer="Confirmed deposits" />

                  <TreasuryCard
                    icon={<ArrowUpRight size={18} />} label="Money Out · 24h" color="#DC2626" bg="#FEF2F2"
                    primary={`$${fmtUsd(usdOf(pulse.moneyOut.last24h.btc, pulse.moneyOut.last24h.usdt))}`}
                    growthPct={growthOf(usdOf, pulse.moneyOut.last24h, pulse.moneyOut.prev24h)}
                    primarySub={`₿${fmtBtc(pulse.moneyOut.last24h.btc)} + ₮${fmtUsdt(pulse.moneyOut.last24h.usdt)} USDT`}
                    secondary={`$${fmtUsd(usdOf(pulse.moneyOut.last7d.btc, pulse.moneyOut.last7d.usdt))}`}
                    secondaryColor="#DC2626"
                    secondarySub={`Last 7 days · ₿${fmtBtc(pulse.moneyOut.last7d.btc)} + ₮${fmtUsdt(pulse.moneyOut.last7d.usdt)}`}
                    footer="Confirmed withdrawals" />

                  <TreasuryCard
                    icon={<TrendingUp size={18} />} label="Trade Volume · 24h" color="#7C3AED" bg="#F5F3FF"
                    primary={`$${fmtUsd(pulse.tradeVolume.last24h.usd)}`}
                    growthPct={pulse.tradeVolume.prev24h?.usd ? ((pulse.tradeVolume.last24h.usd - pulse.tradeVolume.prev24h.usd) / pulse.tradeVolume.prev24h.usd) * 100 : null}
                    primarySub={`${pulse.tradeVolume.last24h.count} completed trade${pulse.tradeVolume.last24h.count !== 1 ? 's' : ''}`}
                    secondary={`$${fmtUsd(pulse.tradeVolume.last7d.usd)}`}
                    secondaryColor="#7C3AED"
                    secondarySub={`${pulse.tradeVolume.last7d.count} trades · 7 days`} />

                  <TreasuryCard
                    icon={<Users size={18} />} label="New Users" color="#F59E0B" bg="#FFFBEB"
                    primary={pulse.newUsers.today}
                    primarySub="Signed up today"
                    secondary={pulse.newUsers.week}
                    secondaryColor="#F59E0B"
                    secondarySub={
                      <span className="inline-flex items-center gap-1.5">
                        This week
                        <GrowthBadge pct={pulse.newUsers.lastWeek ? ((pulse.newUsers.week - pulse.newUsers.lastWeek) / pulse.newUsers.lastWeek) * 100 : null} label="vs last week" />
                      </span>
                    }
                    footer={pulse.newUsers.total != null ? `${pulse.newUsers.total.toLocaleString()} total users on PRAQEN` : undefined} />
                </div>
              </div>
            )}

            {/* Fees Collected — verified against the actual company-wallet-crediting code
                (tradeEscrowService.js, this file's own withdrawal-approve handler, and
                swapService.js's _creditCompanyFee) before wiring this up: all three sources
                genuinely land in the company wallet. Broken out per source since that's what
                was asked for — the /admin revenue report only sums trade fees (company_profits),
                so it under-counts withdrawal + swap fees even though nothing is actually lost. */}
            {pulse?.fees && (
              <div>
                <h2 className="text-sm font-black uppercase tracking-wide mb-3" style={{ color: C.g500 }}>Fees Collected</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <TreasuryCard
                    icon={<Bitcoin size={18} />} label="Trade Fees · 24h" color="#1B4332" bg="#F0FDF4"
                    primary={`$${fmtUsd(usdOf(pulse.fees.trade.last24h.btc, pulse.fees.trade.last24h.usdt))}`}
                    growthPct={growthOf(usdOf, pulse.fees.trade.last24h, pulse.fees.trade.prev24h)}
                    primarySub={`₿${fmtBtc(pulse.fees.trade.last24h.btc)} + ₮${fmtUsdt(pulse.fees.trade.last24h.usdt)}`}
                    secondary={`$${fmtUsd(usdOf(pulse.fees.trade.last7d.btc, pulse.fees.trade.last7d.usdt))}`}
                    secondaryColor="#1B4332"
                    secondarySub="Last 7 days"
                    footer="Collected on every completed trade" />

                  <TreasuryCard
                    icon={<ArrowUpRight size={18} />} label="Withdrawal Fees · 24h" color="#DC2626" bg="#FEF2F2"
                    primary={`$${fmtUsd(usdOf(pulse.fees.withdrawal.last24h.btc, pulse.fees.withdrawal.last24h.usdt))}`}
                    growthPct={growthOf(usdOf, pulse.fees.withdrawal.last24h, pulse.fees.withdrawal.prev24h)}
                    primarySub={`₿${fmtBtc(pulse.fees.withdrawal.last24h.btc)} + ₮${fmtUsdt(pulse.fees.withdrawal.last24h.usdt)}`}
                    secondary={`$${fmtUsd(usdOf(pulse.fees.withdrawal.last7d.btc, pulse.fees.withdrawal.last7d.usdt))}`}
                    secondaryColor="#DC2626"
                    secondarySub="Last 7 days"
                    footer="Collected when you approve a send-out" />

                  <TreasuryCard
                    icon={<Repeat size={18} />} label="Swap Fees · 24h" color="#7C3AED" bg="#F5F3FF"
                    primary={`$${fmtUsd(usdOf(pulse.fees.swap.last24h.btc, pulse.fees.swap.last24h.usdt))}`}
                    growthPct={growthOf(usdOf, pulse.fees.swap.last24h, pulse.fees.swap.prev24h)}
                    primarySub={`₿${fmtBtc(pulse.fees.swap.last24h.btc)} + ₮${fmtUsdt(pulse.fees.swap.last24h.usdt)}`}
                    secondary={`$${fmtUsd(usdOf(pulse.fees.swap.last7d.btc, pulse.fees.swap.last7d.usdt))}`}
                    secondaryColor="#7C3AED"
                    secondarySub="Last 7 days"
                    footer="Collected on every BTC ⇄ USDT swap" />

                  <TreasuryCard
                    icon={<Landmark size={18} />} label="Total Fees · 24h" color="#F59E0B" bg="#FFFBEB"
                    primary={`$${fmtUsd(
                      usdOf(pulse.fees.trade.last24h.btc, pulse.fees.trade.last24h.usdt) +
                      usdOf(pulse.fees.withdrawal.last24h.btc, pulse.fees.withdrawal.last24h.usdt) +
                      usdOf(pulse.fees.swap.last24h.btc, pulse.fees.swap.last24h.usdt)
                    )}`}
                    growthPct={(() => {
                      const cur = usdOf(pulse.fees.trade.last24h.btc, pulse.fees.trade.last24h.usdt)
                        + usdOf(pulse.fees.withdrawal.last24h.btc, pulse.fees.withdrawal.last24h.usdt)
                        + usdOf(pulse.fees.swap.last24h.btc, pulse.fees.swap.last24h.usdt);
                      const prev = usdOf(pulse.fees.trade.prev24h.btc, pulse.fees.trade.prev24h.usdt)
                        + usdOf(pulse.fees.withdrawal.prev24h.btc, pulse.fees.withdrawal.prev24h.usdt)
                        + usdOf(pulse.fees.swap.prev24h.btc, pulse.fees.swap.prev24h.usdt);
                      return prev ? ((cur - prev) / prev) * 100 : null;
                    })()}
                    secondary={`$${fmtUsd(
                      usdOf(pulse.fees.trade.last7d.btc, pulse.fees.trade.last7d.usdt) +
                      usdOf(pulse.fees.withdrawal.last7d.btc, pulse.fees.withdrawal.last7d.usdt) +
                      usdOf(pulse.fees.swap.last7d.btc, pulse.fees.swap.last7d.usdt)
                    )}`}
                    secondaryColor="#F59E0B"
                    secondarySub="Last 7 days"
                    footer="Trade + withdrawal + swap, combined — vs. the prior 24h period" />
                </div>
              </div>
            )}

            {/* 📈 Growth & Health — the "is this platform actually growing, and is anything
                quietly going wrong" section: signups vs last week, KYC pipeline breakdown,
                and account-standing counts. All from GET /ceo/pulse's accountHealth/newUsers
                fields (Part 3) — no new endpoint needed, same TreasuryCard grid as above. */}
            {pulse && (
              <div>
                <h2 className="text-sm font-black uppercase tracking-wide mb-3" style={{ color: C.g500 }}>📈 Growth &amp; Health</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <TreasuryCard
                    icon={<Users size={18} />} label="Signups This Week" color="#2D6A4F" bg="#F0FDF4"
                    primary={pulse.newUsers.week}
                    growthPct={pulse.newUsers.lastWeek ? ((pulse.newUsers.week - pulse.newUsers.lastWeek) / pulse.newUsers.lastWeek) * 100 : null}
                    primarySub={`${pulse.newUsers.lastWeek} the week before`}
                    footer={`${pulse.newUsers.today} today · ${pulse.newUsers.total?.toLocaleString?.() ?? pulse.newUsers.total} total`} />

                  <TreasuryCard
                    icon={<ShieldCheck size={18} />} label="KYC Pipeline" color="#3B82F6" bg="#EFF6FF"
                    primary={pulse.accountHealth.kycApproved}
                    primarySub="Approved"
                    secondary={`${pulse.pending.kyc} pending`}
                    secondaryColor="#92400E"
                    secondarySub={`${pulse.accountHealth.kycRejected} rejected all-time`} />

                  <TreasuryCard
                    icon={<UserCheck size={18} />} label="Account Standing" color="#059669" bg="#F0FDF4"
                    primary={(pulse.newUsers.total || 0) - pulse.accountHealth.banned}
                    primarySub="Active accounts"
                    secondary={pulse.accountHealth.banned}
                    secondaryColor="#991B1B"
                    secondarySub="Banned" />

                  <TreasuryCard
                    icon={<UserX size={18} />} label="Active Warnings" color="#F59E0B" bg="#FFFBEB"
                    primary={pulse.accountHealth.warned}
                    primarySub="Accounts with an open warning"
                    footer="Warned, not restricted from trading" />
                </div>
              </div>
            )}

            {/* ✅ Approvals — everything that needs the CEO's sign-off before it goes out,
                in one place. Withdrawals (real money leaving the platform) sits right here
                with its full table; KYC and Migration open a review modal on this same page;
                Disputes stays a link out to /moderator since resolving one requires a
                3-moderator quorum vote, not a single approve/reject — that's not something
                to duplicate here. */}
            {pulse && (
              <div>
                <h2 className="text-sm font-black uppercase tracking-wide mb-3" style={{ color: C.g500 }}>✅ Approvals</h2>
                <div className="flex flex-wrap gap-3 mb-4">
                  <AttentionBadge icon={<ArrowUpRight size={16} />} label="Withdrawals Pending" count={pulse.pending.withdrawals}
                    onClick={() => document.getElementById('send-out-approvals')?.scrollIntoView({ behavior: 'smooth' })} />
                  <AttentionBadge icon={<ShieldCheck size={16} />} label="KYC Pending" count={pulse.pending.kyc} onClick={() => setKycModalOpen(true)} />
                  <AttentionBadge icon={<Repeat size={16} />} label="Migration Requests" count={pulse.pending.p2pMigration} onClick={() => setMigrationModalOpen(true)} />
                  <AttentionBadge icon={<AlertCircle size={16} />} label="Disputes Open · resolved by moderator vote" count={pulse.pending.disputes} href="/moderator" />
                  <AttentionBadge icon={<Lock size={16} />} label="Security Alerts" count={pulse.pending.securityAlerts} onClick={() => setSecurityModalOpen(true)} />
                </div>
                <WithdrawalApprovals />
              </div>
            )}

            {/* Treasury wallets */}
            <div>
              <h2 className="text-sm font-black uppercase tracking-wide mb-3" style={{ color: C.g500 }}>Wallets</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <TreasuryCard
                  icon={<Bitcoin size={18} />} label="Hot Wallet · BTC" color="#F59E0B" bg="#FFFBEB"
                  primary={`$${fmtUsd(usdOf(hotBtc.total_btc ?? hotBtc.confirmed_btc, 0))}`}
                  primarySub={hotBtc.error ? `Error: ${hotBtc.error}` : `₿${fmtBtc(hotBtc.total_btc ?? hotBtc.confirmed_btc)} · ${fmtBtc(hotBtc.confirmed_btc)} confirmed${parseFloat(hotBtc.unconfirmed_btc || 0) > 0 ? ` · ${fmtBtc(hotBtc.unconfirmed_btc)} pending` : ''}`}
                  footer="Funds user BTC withdrawals" />

                <TreasuryCard
                  icon={<Fuel size={18} />} label="Gas Wallet · TRX" color="#DC2626" bg="#FEF2F2"
                  primary={`${parseFloat(tron.trx || 0).toFixed(2)} TRX`}
                  primarySub={tron.error ? `Error: ${tron.error}` : `Min reserve ${parseFloat(tron.minTrxReserve || 0).toFixed(0)} TRX — ${tron.trxStatus || '—'}`}
                  footer="Pays gas for USDT sweeps/sends — no live TRX/USD price wired up" />

                <TreasuryCard
                  icon={<Wallet size={18} />} label="Hot Wallet · USDT" color="#059669" bg="#F0FDF4"
                  primary={`$${fmtUsd(tron.usdt)}`}
                  primarySub={`₮${fmtUsdt(tron.usdt)} USDT · swept today ₮${fmtUsdt(tron.sweptTodayUsdt)}${tron.pendingSweeps ? ` · ${tron.pendingSweeps} pending sweep(s)` : ''}`}
                  footer="Funds user USDT withdrawals" />

                <TreasuryCard
                  icon={<Landmark size={18} />} label="Master / Company Wallet" color="#1B4332" bg="#F0FDF4"
                  primary={`$${fmtUsd(usdOf(company.balance_btc, company.balance_usdt))}`}
                  primarySub={`₿${fmtBtc(company.balance_btc)}${company.locked_balance_btc > 0 ? ` (+₿${fmtBtc(company.locked_balance_btc)} locked)` : ''} + ₮${fmtUsdt(company.balance_usdt)}${company.locked_balance_usdt > 0 ? ` (+₮${fmtUsdt(company.locked_balance_usdt)} locked)` : ''}`}
                  footer="Platform fee revenue" />
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

            {/* Recent Activity — everything the admin/moderator team has done recently
                (KYC approvals, bans, dispute resolutions, etc.) — read-only feed */}
            {pulse && (
              <div>
                <h2 className="text-sm font-black uppercase tracking-wide mb-3" style={{ color: C.g500 }}>Recent Activity</h2>
                <div className="bg-white rounded-2xl border" style={{ borderColor: C.g200 }}>
                  {(pulse.recentActivity || []).length === 0 ? (
                    <div className="flex flex-col items-center py-14 gap-2">
                      <Activity size={36} strokeWidth={1.5} style={{ color: C.g400 }} />
                      <p className="text-sm font-semibold" style={{ color: C.g500 }}>Nothing logged yet</p>
                    </div>
                  ) : (
                    <div className="divide-y" style={{ borderColor: C.g100 }}>
                      {pulse.recentActivity.map((a, i) => (
                        <div key={i} className="flex items-start justify-between gap-3 px-4 py-3">
                          <div className="flex items-start gap-2.5">
                            <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5" style={{ backgroundColor: C.g100 }}>
                              <Activity size={13} style={{ color: C.g500 }} />
                            </div>
                            <div>
                              <p className="text-sm font-bold" style={{ color: C.g800 }}>
                                {a.actor} <span className="font-semibold" style={{ color: C.g600 }}>{a.action}</span>
                              </p>
                              {a.details && <p className="text-xs mt-0.5" style={{ color: C.g400 }}>{a.details}</p>}
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1 flex-shrink-0">
                            <span className="text-xs whitespace-nowrap" style={{ color: C.g400 }}>{fmtAge(a.created_at)}</span>
                            {a.category && <Pill label={a.category} color={C.g600} bg={C.g100} />}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            <SupportChatSection ceoUser={ceoUser} />
          </>
        )}
      </div>

      {kycModalOpen && <KycReviewModal onClose={() => setKycModalOpen(false)} onActed={loadPulse} />}
      {migrationModalOpen && <MigrationReviewModal onClose={() => setMigrationModalOpen(false)} onActed={loadPulse} />}
      {securityModalOpen && <SecurityAlertsModal ceoUser={ceoUser} onClose={() => setSecurityModalOpen(false)} onActed={loadPulse} />}
    </div>
  );
}
