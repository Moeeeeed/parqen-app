import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import {
  AlertCircle, CheckCircle, Clock, Eye, X, Flag,
  MessageCircle, Send, CreditCard, User, DollarSign,
  Bitcoin, Shield, AlertTriangle, Star, TrendingUp,
  ThumbsUp, ThumbsDown, Lock, RefreshCw, LogIn,
  Phone, Building, Image, UserCheck, Gavel, Stamp,
  ChevronDown, BookOpen, History, Users, Scale,
  XCircle, ClipboardList, Paperclip, MessageSquare,
  ShoppingBag, Zap, ClipboardEdit, BarChart3,
} from 'lucide-react';
import { toast } from 'react-toastify';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const P = {
  primary: '#2D5F4F', secondary: '#FFD700', darkBg: '#1a3a2a', lightBg: '#f0f8f5',
  purple: '#7C3AED', purpleLight: '#EDE9FE', purpleDark: '#5B21B6',
  danger: '#EF4444', success: '#10B981', warning: '#F59E0B', info: '#3B82F6',
  gold: '#D97706', goldLight: '#FFFBEB',
};

const ADMIN_EMAIL = 'support@praqen.com';

// ── helpers ──────────────────────────────────────────────────────
const fmtDate  = d => !d ? '—' : new Date(d).toLocaleString('en-GB', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
const fmtBtc   = n => parseFloat(n || 0).toFixed(8);
const fmtUsd   = n => `$${parseFloat(n || 0).toLocaleString('en-US', { minimumFractionDigits:2, maximumFractionDigits:2 })}`;
const fmtAge   = d => { if (!d) return '—'; const s = (Date.now()-new Date(d))/1000; if(s<3600) return `${~~(s/60)}m ago`; if(s<86400) return `${~~(s/3600)}h ago`; return `${~~(s/86400)}d ago`; };
const getRatingStars = r => [...Array(5)].map((_,i) => <Star key={i} size={13} className={i < Math.round(r||0) ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'} />);
const resBadge = res => {
  const m = { BUYER_WINS:{l:<span className="inline-flex items-center gap-1"><CheckCircle size={13} className="inline-block" /> Buyer Won</span>,bg:'#ECFDF5',c:P.success}, SELLER_WINS:{l:<span className="inline-flex items-center gap-1"><CheckCircle size={13} className="inline-block" /> Seller Won</span>,bg:'#EFF6FF',c:P.info}, CANCEL:{l:<span className="inline-flex items-center gap-1"><XCircle size={13} className="inline-block" /> Trade Cancelled</span>,bg:'#FEF2F2',c:P.danger} }[res] || {l:res||'—',bg:'#f3f4f6',c:'#6b7280'};
  return <span className="px-3 py-1 rounded-full text-sm font-bold" style={{backgroundColor:m.bg,color:m.c}}>{m.l}</span>;
};
const badgeColor = b => {
  const m = { DIAMOND:{c:'#06B6D4',bg:'#ECFEFF'}, GOLD:{c:'#D97706',bg:'#FFFBEB'}, SILVER:{c:'#6B7280',bg:'#F9FAFB'}, BRONZE:{c:'#92400E',bg:'#FEF3C7'}, BEGINNER:{c:'#6B7280',bg:'#F3F4F6'} };
  return m[b] || m.BEGINNER;
};

// ================================================================
// LOGIN
// ================================================================
function ModeratorBrandHeader({ onLogout }) {
  return (
    <div className="w-full" style={{ backgroundColor:P.darkBg }}>
      <div className="max-w-md mx-auto sm:max-w-none sm:w-full px-4 py-4 flex items-center justify-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor:P.purple }}>
            <Gavel size={19} className="text-white" />
          </div>
          <div>
            <p className="leading-none text-center" style={{ fontFamily:'Georgia, serif', fontWeight:900, fontSize:19, letterSpacing:'0.02em' }}>
              <span style={{ color:'#fff' }}>PRA</span><span style={{ color:P.secondary }}>QEN</span>
            </p>
            <p className="text-[10px] font-black uppercase tracking-widest mt-0.5" style={{ color:'rgba(255,255,255,0.55)' }}>Dispute Resolution Center</p>
          </div>
        </div>
        {onLogout && (
          <button onClick={onLogout} title="Logout"
            className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-lg transition" style={{ backgroundColor:'rgba(239,68,68,0.15)' }}>
            <X size={14} style={{ color:'#f87171' }} /><span className="text-xs font-black" style={{ color:'#f87171' }}>Logout</span>
          </button>
        )}
      </div>
    </div>
  );
}

function ModeratorLogin({ onLogin, user }) {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [step, setStep]         = useState('credentials'); // 'credentials' | 'otp'
  const [otp, setOtp]           = useState('');
  const [pendingEmail, setPendingEmail] = useState('');

  const storedUser  = JSON.parse(localStorage.getItem('user') || 'null');
  const hasSession  = !!localStorage.getItem('token') && !!storedUser;
  const isAuthorized = user?.is_moderator || user?.is_admin;

  useEffect(() => {
    if (isAuthorized) {
      const tok = localStorage.getItem('token');
      if (tok) { localStorage.setItem('mod_token', tok); onLogin(user.username || 'PRAQEN Moderator'); }
    }
  }, [user]);

  const switchAccount = () => {
    localStorage.removeItem('token'); localStorage.removeItem('user');
    localStorage.removeItem('mod_token'); localStorage.removeItem('mod_user');
    localStorage.removeItem('team_token'); localStorage.removeItem('team_user');
    window.location.reload();
  };

  if (isAuthorized && localStorage.getItem('token')) {
    return (
      <div className="min-h-screen flex flex-col" style={{ backgroundColor: P.lightBg }}>
        <ModeratorBrandHeader />
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="text-center">
            <div className="w-12 h-12 border-4 rounded-full animate-spin mx-auto mb-4" style={{ borderColor:P.purple, borderTopColor:P.secondary }} />
            <p className="font-bold" style={{ color:P.primary }}>Authenticating…</p>
          </div>
        </div>
      </div>
    );
  }

  const finishLogin = (token, u) => {
    if (!u?.is_moderator && !u?.is_admin) { setError('Access denied. Moderator privileges required.'); return; }
    localStorage.setItem('token', token); localStorage.setItem('user', JSON.stringify(u)); localStorage.setItem('mod_token', token);
    axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    // Sync the app-level `user` state immediately so the Oath screen (and the
    // rest of the dashboard) knows who's signed in without needing a page reload.
    window.dispatchEvent(new Event('userUpdated'));
    onLogin(u.username || u.email || 'Moderator');
  };

  const handleLogin = async (e) => {
    e.preventDefault(); setError(''); setLoading(true);
    try {
      const r = await axios.post(`${API_URL}/auth/login`, { email: email.trim(), password });
      if (r.data.requiresOtp) {
        setPendingEmail(r.data.email || email.trim());
        setOtp('');
        setStep('otp');
      } else if (r.data.token) {
        finishLogin(r.data.token, r.data.user);
      } else {
        setError('Login failed. Please try again.');
      }
    } catch (err) { setError(err?.response?.data?.error || 'Invalid email or password.'); }
    setLoading(false);
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    if (otp.length !== 6) { setError('Enter the full 6-digit code.'); return; }
    setError(''); setLoading(true);
    try {
      const r = await axios.post(`${API_URL}/auth/verify-login-otp`, { email: pendingEmail, code: otp });
      if (r.data.success) finishLogin(r.data.token, r.data.user);
      else setError('Invalid code. Please try again.');
    } catch (err) { setError(err?.response?.data?.error || 'Invalid code. Please try again.'); setOtp(''); }
    setLoading(false);
  };

  const resendOtp = async () => {
    setError(''); setLoading(true);
    try {
      const r = await axios.post(`${API_URL}/auth/login`, { email: pendingEmail, password });
      if (r.data.requiresOtp) setError('');
    } catch (err) { setError(err?.response?.data?.error || 'Could not resend code.'); }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: P.lightBg }}>
      <ModeratorBrandHeader />
      <div className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">

          {hasSession && !isAuthorized && (
            <div className="flex items-center justify-between gap-3 mb-4 px-4 py-3 rounded-xl border" style={{ backgroundColor:'#FFFBEB', borderColor:'#FDE68A' }}>
              <div className="min-w-0">
                <p className="text-xs font-black" style={{ color:'#92400E' }}>Signed in as {storedUser?.full_name || storedUser?.username || storedUser?.email}</p>
                <p className="text-[11px] font-semibold" style={{ color:'#92400E' }}>This account doesn't have moderator access.</p>
              </div>
              <button onClick={switchAccount} className="flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-black text-white" style={{ backgroundColor:P.gold }}>
                Log Out
              </button>
            </div>
          )}

          <div className="bg-white rounded-2xl shadow-2xl p-8 border-t-4" style={{ borderColor: P.purple }}>
            {step === 'credentials' ? (
              <>
                <div className="text-center mb-8">
                  <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: P.purpleLight }}>
                    <Shield size={32} style={{ color: P.purple }} />
                  </div>
                  <h1 className="text-2xl font-black" style={{ color: P.darkBg }}>Moderator Sign In</h1>
                  <p className="text-gray-500 text-sm mt-1">Enter your moderator credentials to continue</p>
                </div>
                <form onSubmit={handleLogin} className="space-y-4">
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1.5">Email Address</label>
                    <input type="email" value={email} autoFocus onChange={e => { setEmail(e.target.value); setError(''); }} placeholder="your@praqen.com"
                      className="w-full px-4 py-3 border-2 rounded-xl text-sm focus:outline-none transition"
                      style={{ borderColor: error ? P.danger : email ? P.purple : '#e5e7eb' }} />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1.5">Password</label>
                    <input type="password" value={password} onChange={e => { setPassword(e.target.value); setError(''); }} placeholder="••••••••"
                      className="w-full px-4 py-3 border-2 rounded-xl text-sm focus:outline-none transition"
                      style={{ borderColor: error ? P.danger : password ? P.purple : '#e5e7eb' }} />
                  </div>
                  {error && (
                    <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-200">
                      <AlertTriangle size={14} className="text-red-600 flex-shrink-0 mt-0.5" />
                      <p className="text-sm font-semibold text-red-700">{error}</p>
                    </div>
                  )}
                  <button type="submit" disabled={!email.trim() || !password || loading}
                    className="w-full py-3 rounded-xl text-white font-black text-sm flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-40 transition"
                    style={{ backgroundColor: P.purple }}>
                    {loading ? <><RefreshCw size={14} className="animate-spin" /> Verifying…</> : <><LogIn size={14} /> Continue</>}
                  </button>
                </form>
                <p className="text-center text-xs text-gray-400 mt-6 inline-flex items-center gap-1"><Lock size={11} className="inline-block" /> Restricted access — all actions are permanently logged.</p>
              </>
            ) : (
              <>
                <div className="text-center mb-8">
                  <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: P.purpleLight }}>
                    <Shield size={32} style={{ color: P.purple }} />
                  </div>
                  <h1 className="text-2xl font-black" style={{ color: P.darkBg }}>Check Your Email</h1>
                  <p className="text-gray-500 text-sm mt-1">Enter the 6-digit code sent to <strong>{pendingEmail}</strong></p>
                </div>
                <form onSubmit={handleVerifyOtp} className="space-y-4">
                  <input type="text" inputMode="numeric" maxLength={6} value={otp} autoFocus
                    onChange={e => { setOtp(e.target.value.replace(/\D/g, '')); setError(''); }}
                    placeholder="••••••"
                    className="w-full px-4 py-3 border-2 rounded-xl text-center text-2xl tracking-[0.5em] font-black focus:outline-none transition"
                    style={{ borderColor: error ? P.danger : otp ? P.purple : '#e5e7eb' }} />
                  {error && (
                    <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-200">
                      <AlertTriangle size={14} className="text-red-600 flex-shrink-0 mt-0.5" />
                      <p className="text-sm font-semibold text-red-700">{error}</p>
                    </div>
                  )}
                  <button type="submit" disabled={otp.length !== 6 || loading}
                    className="w-full py-3 rounded-xl text-white font-black text-sm flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-40 transition"
                    style={{ backgroundColor: P.purple }}>
                    {loading ? <><RefreshCw size={14} className="animate-spin" /> Verifying…</> : <><LogIn size={14} /> Enter Moderator Dashboard</>}
                  </button>
                  <div className="flex items-center justify-between text-xs font-bold">
                    <button type="button" onClick={() => { setStep('credentials'); setError(''); }} style={{ color:'#6b7280' }}>← Back</button>
                    <button type="button" onClick={resendOtp} style={{ color:P.purple }}>Resend code</button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ================================================================
// CONFIRM RESOLUTION MODAL — replaces window.confirm()
// ================================================================
function ConfirmResolutionModal({ decision, tradeId, btcAmount, usdAmount, buyer, seller, modName, quorum, onConfirm, onCancel, submitting }) {
  const cfg = {
    BUYER_WINS:  { label:'BUYER WINS',       icon:<CheckCircle size={15} className="inline-block" />, color:P.success,  bg:'#ECFDF5', borderColor:'#6EE7B7', action:'Release BTC to Buyer' },
    SELLER_WINS: { label:'SELLER WINS',      icon:<CheckCircle size={15} className="inline-block" />, color:P.info,     bg:'#EFF6FF', borderColor:'#93C5FD', action:'Return BTC to Seller' },
    CANCEL:      { label:'CANCEL TRADE',     icon:<XCircle size={15} className="inline-block" />, color:P.danger,   bg:'#FEF2F2', borderColor:'#FCA5A5', action:'Refund Escrow to Seller' },
  }[decision] || { label:decision, icon:<Scale size={15} className="inline-block" />, color:P.purple, bg:P.purpleLight, borderColor:P.purple, action:'Resolve' };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" style={{ backgroundColor:'rgba(0,0,0,0.75)' }}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg flex flex-col overflow-hidden" style={{ maxHeight:'90vh' }}>

        {/* Header band */}
        <div className="px-6 py-5 flex items-center gap-3 flex-shrink-0" style={{ backgroundColor: cfg.bg, borderBottom:`3px solid ${cfg.borderColor}` }}>
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor:'white', boxShadow:`0 0 0 2px ${cfg.borderColor}` }}>
            <Gavel size={24} style={{ color: cfg.color }} />
          </div>
          <div>
            <p className="text-xs font-black uppercase tracking-widest" style={{ color:cfg.color }}>Confirm Your Vote</p>
            <p className="text-xl font-black" style={{ color:cfg.color }}>{cfg.icon} {cfg.label}</p>
          </div>
          <span className="ml-auto text-xs font-mono font-bold px-3 py-1 rounded-full" style={{ backgroundColor:'white', color:cfg.color }}>
            #{(tradeId||'').slice(0,8).toUpperCase()}
          </span>
        </div>

        {/* Scrollable body */}
        <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
          {/* Trade summary */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { l:'BTC at Stake', v:`₿ ${fmtBtc(btcAmount)}`, c:P.gold },
              { l:'USD Value',    v:fmtUsd(usdAmount),         c:P.success },
              { l:'Buyer',        v:buyer?.username||'—',       c:P.primary },
              { l:'Seller',       v:seller?.username||'—',      c:P.info },
            ].map(({l,v,c}) => (
              <div key={l} className="p-3 rounded-xl text-center border" style={{ backgroundColor:'#f8fafc' }}>
                <p className="text-xs font-bold text-gray-500 uppercase mb-1">{l}</p>
                <p className="text-sm font-black" style={{color:c}}>{v}</p>
              </div>
            ))}
          </div>

          {/* Action */}
          <div className="flex items-center gap-2 p-3 rounded-xl" style={{ backgroundColor:cfg.bg, border:`1px solid ${cfg.borderColor}` }}>
            <Stamp size={16} style={{ color:cfg.color, flexShrink:0 }} />
            <p className="text-sm font-black" style={{ color:cfg.color }}>Action: {cfg.action}</p>
          </div>

          <div className="flex items-start gap-2 p-3 rounded-xl border" style={{ backgroundColor:'#faf5ff', borderColor:'#c4b5fd' }}>
            <Shield size={14} style={{ color:P.purple, flexShrink:0, marginTop:2 }} />
            <p className="text-sm font-semibold" style={{ color:P.purpleDark }}>
              This is your own independent vote as <strong>{modName}</strong> — signed under the Moderator Oath of Trust you already swore.
              It does not resolve anything by itself; escrow only moves once {quorum || 3} moderators agree.
            </p>
          </div>
        </div>

        {/* Sticky footer — always visible */}
        <div className="px-6 py-4 flex gap-3 flex-shrink-0 border-t" style={{ borderColor:'#e5e7eb', backgroundColor:'white' }}>
          <button onClick={onCancel} disabled={submitting}
            className="flex-1 py-3 rounded-xl text-sm font-black border-2 transition hover:bg-gray-50 disabled:opacity-40"
            style={{ borderColor:'#e5e7eb', color:'#6b7280' }}>
            ← Go Back
          </button>
          <button onClick={onConfirm} disabled={submitting}
            className="flex-1 py-3 rounded-xl text-sm font-black text-white flex items-center justify-center gap-2 transition disabled:opacity-40"
            style={{ backgroundColor: cfg.color }}>
            {submitting ? <><RefreshCw size={14} className="animate-spin" /> Casting…</> : <><Gavel size={14} /> Confirm Your Vote</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ================================================================
// OATH OF TRUST — required once before a moderator can review or vote
// ================================================================
function OathScreen({ user, onSigned }) {
  const [fullName, setFullName] = useState(user?.full_name || '');
  const [email, setEmail]       = useState(user?.email || '');
  const [agree, setAgree]       = useState(false);
  const [signing, setSigning]   = useState(false);
  const authH = () => { const t = localStorage.getItem('token'); return t ? { Authorization:`Bearer ${t}` } : {}; };

  const sign = async () => {
    if (!agree || !fullName.trim() || !email.trim()) return;
    setSigning(true);
    try {
      const r = await axios.post(`${API_URL}/team/oath/sign`, { full_name: fullName.trim(), email: email.trim() }, { headers:authH() });
      // Keep the cached profile in sync so the corrected name/email show up immediately app-wide.
      const stored = JSON.parse(localStorage.getItem('user') || '{}');
      localStorage.setItem('user', JSON.stringify({ ...stored, full_name: r.data.full_name, email: r.data.email }));
      window.dispatchEvent(new Event('userUpdated'));
      toast.success('Oath signed — welcome to the panel');
      onSigned();
    } catch (e) { toast.error(e.response?.data?.error || 'Failed to sign oath'); }
    setSigning(false);
  };

  const logout = () => {
    localStorage.removeItem('token'); localStorage.removeItem('user');
    localStorage.removeItem('mod_token'); localStorage.removeItem('mod_user');
    localStorage.removeItem('team_token'); localStorage.removeItem('team_user');
    window.location.href = '/moderator';
  };

  const points = [
    'I will judge every case only on the evidence presented — never on relationships, favors, friendship, or pressure from any party.',
    "I will not discuss an open case with either party outside official PRAQEN channels, and will not accept anything of value from either side.",
    'I will not collude with another moderator to agree a verdict before votes are cast. My vote is mine alone until it is submitted.',
    'If I have any personal, family, or financial connection to either party, I will recuse myself from the case immediately.',
    'My full name and company email are permanently attached to every vote and comment I make — I am personally accountable for it.',
    'I understand a verdict found to be dishonest, coerced, or in breach of this oath can be reversed by an admin, and may end my role on this team.',
  ];

  return (
    <div className="min-h-screen" style={{ backgroundColor:P.lightBg }}>
      <ModeratorBrandHeader onLogout={logout} />
      <div className="py-10 px-4">
      <div className="max-w-2xl mx-auto bg-white rounded-3xl shadow-2xl overflow-hidden border-t-4" style={{ borderColor:P.purple }}>
        <div className="px-8 pt-5 flex justify-end sm:hidden">
          <button onClick={logout} className="flex items-center gap-1.5 text-xs font-black" style={{ color:P.danger }}>
            <X size={13} /> Logout
          </button>
        </div>
        <div className="px-8 py-7 flex items-center gap-4" style={{ backgroundColor:P.purpleLight }}>
          <div className="w-14 h-14 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor:P.purple }}>
            <Shield size={26} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-black" style={{ color:P.purpleDark }}>Moderator Oath of Trust</h1>
            <p className="text-sm text-gray-600 font-semibold mt-0.5">Required before you can review or vote on any dispute</p>
          </div>
        </div>

        <div className="px-8 py-6 space-y-5">
          <p className="text-sm leading-relaxed p-4 rounded-xl border-l-4" style={{ backgroundColor:'#f8fafc', borderColor:P.purple, color:'#334155' }}>
            Every verdict you cast releases or withholds real Bitcoin that belongs to real people. This oath exists so every trader on PRAQEN can trust the outcome — no matter which of you reviewed it, and no matter who they are to you.
          </p>

          <ol className="space-y-3">
            {points.map((pt, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-black flex-shrink-0" style={{ backgroundColor:P.purpleLight, color:P.purpleDark }}>{i + 1}</span>
                <p className="text-sm text-gray-700 leading-relaxed">{pt}</p>
              </li>
            ))}
          </ol>

          <div className="grid grid-cols-2 gap-3 pt-2 border-t" style={{ borderColor:'#e5e7eb' }}>
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">Your full name</label>
              <input type="text" value={fullName} onChange={e => setFullName(e.target.value)} placeholder="e.g. Frederick Fosu"
                className="w-full px-3 py-2 rounded-xl border-2 text-sm font-bold outline-none transition"
                style={{ borderColor: fullName.trim() ? P.purple : '#e5e7eb' }} />
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">Your company email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="name@praqen.com"
                className="w-full px-3 py-2 rounded-xl border-2 text-sm font-bold outline-none transition"
                style={{ borderColor: email.trim() ? P.purple : '#e5e7eb' }} />
            </div>
          </div>
          <p className="text-xs text-gray-400 -mt-3">This is exactly what will show on every vote and comment you make — double-check it's correct.</p>

          <label className="flex items-start gap-3 cursor-pointer p-4 rounded-xl border-2 transition"
            style={{ borderColor: agree ? P.purple : '#e5e7eb', backgroundColor: agree ? '#faf5ff' : 'white' }}>
            <input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} className="mt-0.5 accent-purple-600 w-4 h-4 flex-shrink-0 cursor-pointer" />
            <p className="text-sm font-bold" style={{ color: agree ? P.purpleDark : '#374151' }}>
              I have read all six points above, and I sign this oath knowing my name and email will appear on every verdict and comment I make from this account.
            </p>
          </label>

          <button onClick={sign} disabled={!agree || !fullName.trim() || !email.trim() || signing}
            className="w-full py-3.5 rounded-xl text-white font-black text-sm flex items-center justify-center gap-2 disabled:opacity-40 transition"
            style={{ backgroundColor:P.purple }}>
            {signing ? <><RefreshCw size={14} className="animate-spin" /> Signing…</> : <><Shield size={14} /> Sign Oath &amp; Enter Dispute Queue</>}
          </button>
        </div>
      </div>
      </div>
    </div>
  );
}

// ================================================================
// VOTE SEATS — quorum grid, blind until you've cast your own vote
// ================================================================
function identity(m) { return m?.full_name || m?.username || 'Unknown'; }

function VoteSeats({ moderators, votes, currentUserId }) {
  return (
    <div className="grid sm:grid-cols-2 gap-3">
      {moderators.map(m => {
        const v = (votes || []).find(x => x.moderator_id === m.id);
        const isMe = m.id === currentUserId;
        let stateLabel, cardStyle, icon;
        if (v && v.vote) {
          const isBuyer = v.vote === 'BUYER_WINS', isSeller = v.vote === 'SELLER_WINS';
          stateLabel = v.vote === 'CANCEL' ? 'Voted · Cancel Trade' : isBuyer ? 'Voted · Buyer Wins' : 'Voted · Seller Wins';
          cardStyle = { backgroundColor: isBuyer ? '#ECFDF5' : isSeller ? '#EFF6FF' : '#FEF2F2', borderColor: isBuyer ? '#6EE7B7' : isSeller ? '#93C5FD' : '#FCA5A5' };
          icon = <CheckCircle size={14} style={{ color: isBuyer ? P.success : isSeller ? P.info : P.danger }} />;
        } else if (v) {
          stateLabel = 'Voted · hidden until you vote';
          cardStyle = { backgroundColor:'#f9fafb', borderColor:'#e5e7eb', borderStyle:'dashed' };
          icon = <Lock size={13} className="text-gray-400" />;
        } else {
          stateLabel = 'Not yet voted';
          cardStyle = { backgroundColor:'#f9fafb', borderColor:'#e5e7eb' };
          icon = <Lock size={13} className="text-gray-300" />;
        }
        return (
          <div key={m.id} className="p-3 rounded-xl border-2" style={cardStyle}>
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-black truncate">{identity(m)}{isMe && <span className="ml-1 font-semibold text-gray-400">(you)</span>}</p>
                <p className="text-[10px] text-gray-400 truncate">{m.email}</p>
              </div>
              {icon}
            </div>
            <p className="text-[11px] font-bold mt-1.5 text-gray-500">{stateLabel}</p>
          </div>
        );
      })}
    </div>
  );
}

// ================================================================
// TEAM DISCUSSION — internal, threaded, open notes on a dispute
// (separate from the buyer/seller-facing Live Chat tab)
// ================================================================
function TeamDiscussion({ tradeId }) {
  const [comments, setComments] = useState([]);
  const [text, setText]         = useState('');
  const [replyTo, setReplyTo]   = useState(null);
  const [posting, setPosting]   = useState(false);
  const authH = () => { const t = localStorage.getItem('token'); return t ? { Authorization:`Bearer ${t}` } : {}; };

  const load = async () => {
    try { const r = await axios.get(`${API_URL}/admin/disputes/${tradeId}/comments`, { headers:authH() }); setComments(r.data.comments || []); } catch {}
  };
  useEffect(() => { load(); const iv = setInterval(load, 5000); return () => clearInterval(iv); }, [tradeId]);

  const post = async (e) => {
    e.preventDefault(); if (!text.trim()) return; setPosting(true);
    try {
      await axios.post(`${API_URL}/admin/disputes/${tradeId}/comments`, { message: text.trim(), parent_id: replyTo }, { headers:authH() });
      setText(''); setReplyTo(null); load();
    } catch (e) { toast.error(e.response?.data?.error || 'Failed to post'); }
    setPosting(false);
  };

  const byParent = {};
  comments.forEach(c => { const k = c.parent_id || 'root'; (byParent[k] = byParent[k] || []).push(c); });

  const renderThread = (parentKey = 'root', depth = 0) => (byParent[parentKey] || []).map(c => (
    <div key={c.id} style={{ marginLeft: depth * 24 }} className="mb-3">
      <div className="rounded-xl border p-3" style={{ backgroundColor: c.is_admin_override ? '#FFFBEB' : '#f9fafb', borderColor: c.is_admin_override ? '#FDE68A' : '#e5e7eb' }}>
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <span className="text-xs font-black" style={{ color: c.is_admin_override ? P.gold : P.purpleDark }}>{c.author?.full_name || c.author?.username || 'Unknown'}</span>
          <span className="text-[10px] text-gray-400">{c.author?.email}</span>
          <span className="text-[10px] text-gray-400">· {fmtDate(c.created_at)}</span>
          {c.is_admin_override && <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full" style={{ backgroundColor:P.gold, color:'white' }}>Admin Override</span>}
        </div>
        <p className="text-sm text-gray-700 whitespace-pre-wrap">{c.message}</p>
      </div>
      <button onClick={() => setReplyTo(c.id)} className="text-xs font-bold mt-1 ml-1" style={{ color:P.purple }}>Reply</button>
      {renderThread(c.id, depth + 1)}
    </div>
  ));

  return (
    <div>
      {comments.length === 0 ? (
        <div className="text-center py-10"><MessageCircle size={32} className="mx-auto mb-2 text-gray-300" /><p className="text-gray-400 font-semibold text-sm">No team notes yet — be the first to weigh in</p></div>
      ) : renderThread()}
      <form onSubmit={post} className="mt-4 space-y-2">
        {replyTo && (
          <div className="flex items-center justify-between text-xs font-bold px-3 py-1.5 rounded-lg" style={{ backgroundColor:P.purpleLight, color:P.purpleDark }}>
            Replying to a note <button type="button" onClick={() => setReplyTo(null)} className="underline">cancel</button>
          </div>
        )}
        <div className="flex gap-2">
          <input value={text} onChange={e => setText(e.target.value)} placeholder="Add your note for the team…"
            className="flex-1 px-3 py-2.5 border-2 rounded-xl text-sm outline-none" style={{ borderColor: text ? P.purple : '#e5e7eb' }} />
          <button type="submit" disabled={posting || !text.trim()} className="px-4 py-2.5 rounded-xl text-white font-bold text-sm disabled:opacity-40" style={{ backgroundColor:P.purple }}>Post</button>
        </div>
      </form>
    </div>
  );
}

// ================================================================
// DISPUTE REVIEW MODAL
// ================================================================
function DisputeModal({ dispute, modName, currentUserId, isAdmin, onClose, onResolved, readOnly = false }) {
  const [activeTab, setActiveTab]         = useState('details');
  const [chatMessages, setChatMessages]   = useState([]);
  const [newMessage, setNewMessage]       = useState('');
  const [sendingMsg, setSendingMsg]       = useState(false);
  const [images, setImages]               = useState([]);
  const [buyerStats, setBuyerStats]       = useState(null);
  const [sellerStats, setSellerStats]     = useState(null);
  const [buyerReviews, setBuyerReviews]   = useState([]);
  const [sellerReviews, setSellerReviews] = useState([]);
  const [buyerDisputes, setBuyerDisputes]   = useState(null);
  const [sellerDisputes, setSellerDisputes] = useState(null);
  const [modJoined, setModJoined]         = useState(false);
  const [zoomImg, setZoomImg]             = useState(null);
  const [resolutionNotes, setNotes]       = useState('');
  const [confirmModal, setConfirmModal]   = useState(null);
  const [submitting, setSubmitting]       = useState(false);
  const [voteData, setVoteData]           = useState({ votes:[], my_vote:null, quorum:3, tally:{}, is_split:false, can_override:false, hours_since_disputed:0 });
  const [moderators, setModerators]       = useState([]);
  const [overrideReason, setOverrideReason] = useState('');
  const [submittingOverride, setSubmittingOverride] = useState(false);
  const chatEnd = useRef(null);

  const authH = () => { const t = localStorage.getItem('token'); return t ? { Authorization:`Bearer ${t}` } : {}; };

  const loadChat = async () => {
    try { const r = await axios.get(`${API_URL}/messages/${dispute.trade_id}`, { headers:authH() }); setChatMessages(r.data.messages || []); } catch {}
  };
  const loadImages = async () => {
    try { const r = await axios.get(`${API_URL}/trades/${dispute.trade_id}/images`, { headers:authH() }); setImages(r.data.images || []); } catch {}
  };
  const loadStats = async () => {
    try {
      if (dispute.buyer?.id) {
        const r = await axios.get(`${API_URL}/users/${dispute.buyer.id}`, { headers:authH() }); setBuyerStats(r.data.user||r.data);
        try { const rv = await axios.get(`${API_URL}/users/${dispute.buyer.id}/reviews`, { headers:authH() }); setBuyerReviews(rv.data.reviews||[]); } catch { setBuyerReviews([]); }
        try { const dh = await axios.get(`${API_URL}/admin/users/${dispute.buyer.id}/dispute-history`, { headers:authH() }); setBuyerDisputes(dh.data); } catch { setBuyerDisputes(null); }
      }
      if (dispute.seller?.id) {
        const r = await axios.get(`${API_URL}/users/${dispute.seller.id}`, { headers:authH() }); setSellerStats(r.data.user||r.data);
        try { const rv = await axios.get(`${API_URL}/users/${dispute.seller.id}/reviews`, { headers:authH() }); setSellerReviews(rv.data.reviews||[]); } catch { setSellerReviews([]); }
        try { const dh = await axios.get(`${API_URL}/admin/users/${dispute.seller.id}/dispute-history`, { headers:authH() }); setSellerDisputes(dh.data); } catch { setSellerDisputes(null); }
      }
    } catch {}
  };

  const loadVoteData = async () => {
    if (readOnly) return;
    try {
      const r = await axios.get(`${API_URL}/admin/disputes/${dispute.trade_id}`, { headers:authH() });
      setVoteData(r.data);
    } catch {}
  };
  const loadModerators = async () => {
    try { const r = await axios.get(`${API_URL}/team/moderators`, { headers:authH() }); setModerators(r.data.moderators || []); } catch {}
  };

  useEffect(() => {
    loadChat(); loadImages(); loadStats(); loadModerators(); loadVoteData();
    const iv = setInterval(() => { loadChat(); loadVoteData(); }, 5000);
    return () => clearInterval(iv);
  }, [dispute.trade_id]);

  useEffect(() => { chatEnd.current?.scrollIntoView({ behavior:'smooth' }); }, [chatMessages]);

  const joinChat = async () => {
    try { await axios.post(`${API_URL}/trades/${dispute.trade_id}/moderator-join`, {}, { headers:authH() }); } catch {}
    setModJoined(true); toast.success('Joined dispute chat'); loadChat();
  };

  const sendMessage = async (e) => {
    e.preventDefault(); if (!newMessage.trim()) return; setSendingMsg(true);
    try {
      await axios.post(`${API_URL}/messages`, { tradeId:dispute.trade_id, message:newMessage.trim() }, { headers:authH() });
      setNewMessage(''); loadChat();
    } catch { toast.error('Failed to send'); } finally { setSendingMsg(false); }
  };

  const openConfirm = (decision) => {
    if (!resolutionNotes.trim()) { toast.error('You must write your decision notes before confirming.'); return; }
    setConfirmModal(decision);
  };

  const handleConfirmResolve = async () => {
    setSubmitting(true);
    try {
      const r = await axios.post(`${API_URL}/admin/disputes/${dispute.trade_id}/resolve`, {
        resolution: confirmModal,
        notes: resolutionNotes,
      }, { headers:authH() });
      const { status, message, tally } = r.data;
      setConfirmModal(null);
      if (status === 'RESOLVED') {
        toast.success(`Dispute resolved: ${confirmModal.replace(/_/g, ' ')}`);
        onResolved();
      } else if (status === 'SPLIT') {
        toast.error(message || 'Vote is split — escalated for admin review.');
        loadVoteData();
      } else {
        toast.success(message || 'Your vote was recorded.');
        loadVoteData();
      }
      void tally;
    } catch (e) { toast.error(e.response?.data?.error || 'Failed to submit your vote'); }
    finally { setSubmitting(false); }
  };

  const submitOverride = async (decision) => {
    if (!overrideReason.trim()) { toast.error('Write a reason before overriding.'); return; }
    if (!window.confirm(`Confirm admin override: ${decision.replace(/_/g, ' ')}? This is logged and visible to the whole team.`)) return;
    setSubmittingOverride(true);
    try {
      await axios.post(`${API_URL}/admin/disputes/${dispute.trade_id}/override`, { resolution: decision, reason: overrideReason.trim() }, { headers:authH() });
      toast.success(`Resolved by admin override: ${decision.replace(/_/g, ' ')}`);
      onResolved();
    } catch (e) { toast.error(e.response?.data?.error || 'Override failed'); }
    finally { setSubmittingOverride(false); }
  };

  const tabs = readOnly
    ? [
        { id:'details', l:<span className="inline-flex items-center gap-1.5"><ClipboardList size={13} /> Details</span> },
        { id:'user-history', l:<span className="inline-flex items-center gap-1.5"><Users size={13} /> Profiles</span> },
        { id:'evidence', l:<span className="inline-flex items-center gap-1.5"><Paperclip size={13} /> Evidence ({images.length})</span> },
        { id:'chat', l:<span className="inline-flex items-center gap-1.5"><MessageCircle size={13} /> Chat History</span> },
        { id:'discussion', l:<span className="inline-flex items-center gap-1.5"><MessageSquare size={13} /> Team Discussion</span> },
        { id:'ruling', l:<span className="inline-flex items-center gap-1.5"><Scale size={13} /> Ruling</span> },
      ]
    : [
        { id:'details', l:<span className="inline-flex items-center gap-1.5"><ClipboardList size={13} /> Details</span> },
        { id:'user-history', l:<span className="inline-flex items-center gap-1.5"><Users size={13} /> User History</span> },
        { id:'evidence', l:<span className="inline-flex items-center gap-1.5"><Paperclip size={13} /> Evidence ({images.length})</span> },
        { id:'chat', l:<span className="inline-flex items-center gap-1.5"><MessageCircle size={13} /> Live Chat</span> },
        { id:'discussion', l:<span className="inline-flex items-center gap-1.5"><MessageSquare size={13} /> Team Discussion</span> },
        { id:'resolve', l:<span className="inline-flex items-center gap-1.5"><Scale size={13} /> Resolve</span> },
      ];

  return (
    <>
      {/* Lightbox */}
      {zoomImg && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-[80] p-4" onClick={() => setZoomImg(null)}>
          <img src={zoomImg} alt="Evidence" className="max-w-full max-h-screen object-contain rounded-xl" />
          <button onClick={() => setZoomImg(null)} className="absolute top-4 right-4 bg-white rounded-full p-2 shadow-lg"><X size={20} /></button>
        </div>
      )}

      {/* Confirm modal */}
      {confirmModal && (
        <ConfirmResolutionModal
          decision={confirmModal}
          tradeId={dispute.trade_id}
          btcAmount={dispute.trade_details?.amount_btc}
          usdAmount={dispute.trade_details?.amount_usd}
          buyer={dispute.buyer}
          seller={dispute.seller}
          modName={modName}
          quorum={voteData.quorum}
          submitting={submitting}
          onConfirm={handleConfirmResolve}
          onCancel={() => setConfirmModal(null)}
        />
      )}

      <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-2xl w-full max-w-5xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">

          {/* Modal header */}
          <div className="bg-white border-b px-6 py-4 flex items-center justify-between flex-shrink-0" style={{ borderColor:'#e5e7eb' }}>
            <div className="flex items-center gap-3">
              {readOnly ? (
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor:'#F0FDF4' }}>
                  <History size={20} style={{ color:P.success }} />
                </div>
              ) : (
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor:P.purpleLight }}>
                  <Gavel size={20} style={{ color:P.purple }} />
                </div>
              )}
              <div>
                <p className="text-xs font-black uppercase tracking-widest" style={{ color: readOnly ? P.success : P.purple }}>
                  {readOnly ? 'Resolved Dispute — Read Only' : 'Active Dispute Review'}
                </p>
                <p className="font-black text-slate-800">Trade #{(dispute.trade_id||dispute.id||'').slice(0,8).toUpperCase()}</p>
              </div>
              {readOnly && resBadge(dispute.resolution||dispute.dispute_resolution)}
            </div>
            <button onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100 transition"><X size={20} style={{ color:'#9ca3af' }} /></button>
          </div>

          {/* Tabs */}
          <div className="border-b px-6 flex gap-0 overflow-x-auto bg-gray-50 flex-shrink-0" style={{ borderColor:'#e5e7eb' }}>
            {tabs.map(({ id, l }) => (
              <button key={id} onClick={() => setActiveTab(id)}
                className={`py-3 px-4 text-sm font-bold whitespace-nowrap border-b-2 transition ${activeTab===id ? 'border-purple-600 text-purple-600 bg-white' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>{l}</button>
            ))}
          </div>

          {/* Tab body */}
          <div className="flex-1 overflow-y-auto p-6">

            {/* ── DETAILS ── */}
            {activeTab === 'details' && (
              <div className="space-y-5">
                <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                  <h3 className="font-black text-red-800 mb-2 flex items-center gap-2"><AlertTriangle size={18} /> Dispute Reason</h3>
                  <p className="text-base font-bold text-red-700">{dispute.reason || 'No reason provided'}</p>
                  <p className="text-sm text-red-500 mt-1 font-semibold">Opened: {fmtDate(dispute.created_at)}</p>
                </div>
                <div className="grid md:grid-cols-2 gap-5">
                  {[
                    { title:'Trade Information', icon:DollarSign, rows:[{ l:'BTC Amount', v:`₿ ${fmtBtc(dispute.trade_details?.amount_btc)}` }, { l:'USD Amount', v:fmtUsd(dispute.trade_details?.amount_usd) }, { l:'Status', v:dispute.trade_details?.status||'DISPUTED' }, { l:'Started', v:fmtDate(dispute.trade_details?.created_at) }] },
                    { title:'Payment Info', icon:CreditCard, rows:[{ l:'Method', v:dispute.trade_details?.payment_method||'—' }, { l:'Buyer Confirmed', v:dispute.trade_details?.buyer_confirmed ? <span className="inline-flex items-center gap-1"><CheckCircle size={13} style={{color:P.success}} /> Yes</span> : <span className="inline-flex items-center gap-1"><Clock size={13} style={{color:'#9ca3af'}} /> No</span> }, { l:'Sent At', v:fmtDate(dispute.trade_details?.buyer_confirmed_at) }] },
                  ].map(({ title, icon:Icon, rows }) => (
                    <div key={title} className="bg-gray-50 rounded-xl p-4 border">
                      <h3 className="font-black text-gray-800 mb-3 flex items-center gap-2"><Icon size={16} /> {title}</h3>
                      {rows.map(({ l, v }) => <div key={l} className="flex justify-between py-2 border-b last:border-0 text-sm"><span className="font-bold text-gray-600">{l}</span><span className="font-black text-slate-900">{v}</span></div>)}
                    </div>
                  ))}
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                  <h3 className="font-black text-blue-800 mb-2 flex items-center gap-2"><Shield size={16} /> Escrow Status</h3>
                  <p className="text-base font-bold text-blue-700 flex items-center gap-1.5"><Lock size={15} className="inline-block" /> ₿{fmtBtc(dispute.trade_details?.amount_btc)} locked in escrow. {readOnly ? 'Dispute resolved.' : 'Awaiting your decision.'}</p>
                </div>
              </div>
            )}

            {/* ── USER HISTORY ── */}
            {activeTab === 'user-history' && (
              <div className="space-y-5">
                {[
                  { stats:buyerStats,  reviews:buyerReviews,  disputes:buyerDisputes,  d:dispute.buyer,  role:'Buyer',  color:P.primary, bg:'bg-green-50' },
                  { stats:sellerStats, reviews:sellerReviews, disputes:sellerDisputes, d:dispute.seller, role:'Seller', color:P.info,    bg:'bg-blue-50' },
                ].map(({ stats, reviews, disputes, d, role, color, bg }) => {
                  const joinedDays = stats?.created_at ? Math.floor((Date.now() - new Date(stats.created_at)) / 86400000) : null;
                  const joinedAgo  = joinedDays == null ? '—' : joinedDays < 30 ? `${joinedDays}d ago` : joinedDays < 365 ? `${Math.floor(joinedDays / 30)}mo ago` : `${(joinedDays / 365).toFixed(1)}yr ago`;
                  const lastActive = stats?.last_seen_at || stats?.last_login;
                  return (
                  <div key={role} className={`${bg} rounded-xl p-5 border`}>
                    <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                      <h3 className="font-black text-lg" style={{ color }}>{role}: {d?.username||'Unknown'}</h3>
                      {stats?.badge && (
                        <span className="text-xs font-black uppercase px-2.5 py-1 rounded-full" style={{ backgroundColor:badgeColor(stats.badge).bg, color:badgeColor(stats.badge).c }}>{stats.badge}</span>
                      )}
                      {stats?.account_status && stats.account_status !== 'active' && (
                        <span className="text-xs font-black uppercase px-2.5 py-1 rounded-full bg-red-100 text-red-700">{stats.account_status}</span>
                      )}
                    </div>
                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="bg-white rounded-xl p-4 border">
                        <p className="font-black text-sm mb-3 text-gray-700 flex items-center gap-1.5"><BarChart3 size={14} /> Trade Stats</p>
                        {[
                          { l:'Total Trades',     v:stats?.total_trades||0 },
                          { l:'Completion Rate',  v:`${parseFloat(stats?.completion_rate||0).toFixed(1)}%` },
                          { l:'Rating',           v:<span className="flex items-center gap-1">{getRatingStars(stats?.average_rating)}<span className="font-black ml-1">{parseFloat(stats?.average_rating||0).toFixed(1)}/5</span></span> },
                          { l:'Joined',           v:`${fmtDate(stats?.created_at)?.split(',')[0]||'—'} (${joinedAgo})` },
                          { l:'Referrals Made',   v:stats?.total_referrals||0 },
                          { l:'Last Active',      v:lastActive ? fmtAge(lastActive) : '—' },
                          { l:'Country',          v:stats?.country||'—' },
                        ].map(({ l, v }) => (
                          <div key={l} className="flex justify-between py-2 border-b last:border-0 text-sm"><span className="font-bold text-gray-600">{l}</span><span className="font-black text-slate-900">{v}</span></div>
                        ))}
                      </div>

                      <div className="bg-white rounded-xl p-4 border">
                        <p className="font-black text-sm mb-3 text-gray-700 flex items-center gap-1.5"><Shield size={14} /> Verification &amp; Trust</p>
                        {[
                          { l:'Email Verified', v:stats?.is_email_verified },
                          { l:'Phone Verified', v:stats?.is_phone_verified },
                          { l:'ID Verified',    v:stats?.is_id_verified },
                        ].map(({ l, v }) => (
                          <div key={l} className="flex justify-between items-center py-2 border-b last:border-0 text-sm">
                            <span className="font-bold text-gray-600">{l}</span>
                            <span className="flex items-center gap-1 font-black" style={{ color: v ? P.success : '#9ca3af' }}>
                              {v ? <UserCheck size={13} /> : <AlertTriangle size={13} />} {v ? 'Yes' : 'No'}
                            </span>
                          </div>
                        ))}
                      </div>

                      <div className="bg-white rounded-xl p-4 border">
                        <p className="font-black text-sm mb-3 text-gray-700 flex items-center gap-1.5"><Scale size={14} /> Dispute Record</p>
                        {disputes == null ? (
                          <p className="text-sm text-gray-400 font-semibold">Loading…</p>
                        ) : disputes.total === 0 ? (
                          <div className="flex items-center gap-2 py-1">
                            <CheckCircle size={16} style={{ color:P.success }} />
                            <p className="text-sm font-bold" style={{ color:P.success }}>Clean record — never been in a dispute before</p>
                          </div>
                        ) : (
                          <>
                            <div className="grid grid-cols-4 gap-2 mb-2 text-center">
                              {[
                                { l:'Total',  v:disputes.total,   c:'#6b7280' },
                                { l:'Won',    v:disputes.wins,    c:P.success },
                                { l:'Lost',   v:disputes.losses,  c:P.danger },
                                { l:'Neutral',v:disputes.neutral, c:P.gold },
                              ].map(({ l, v, c }) => (
                                <div key={l} className="p-2 rounded-lg bg-gray-50 border">
                                  <p className="text-lg font-black" style={{ color:c }}>{v}</p>
                                  <p className="text-[10px] font-bold text-gray-500 uppercase">{l}</p>
                                </div>
                              ))}
                            </div>
                            {disputes.losses > 0 && (
                              <p className="text-xs font-bold flex items-center gap-1" style={{ color:P.danger }}>
                                <AlertTriangle size={12} /> Has lost {disputes.losses} past dispute{disputes.losses>1?'s':''} — worth weighing in this review.
                              </p>
                            )}
                          </>
                        )}
                      </div>

                      <div className="bg-white rounded-xl p-4 border">
                        <p className="font-black text-sm mb-3 text-gray-700 flex items-center gap-1.5"><MessageCircle size={14} /> Recent Feedback</p>
                        {reviews.length === 0 ? <p className="text-sm text-gray-500 font-semibold">No feedback yet</p> :
                          reviews.slice(0, 3).map((rv, i) => (
                            <div key={i} className="border-b py-2 last:border-0">
                              <div className="flex gap-0.5 mb-1">{getRatingStars(rv.rating)}</div>
                              <p className="text-xs text-gray-600 font-medium">{rv.comment?.substring(0,80)}…</p>
                            </div>
                          ))}
                      </div>
                    </div>
                  </div>
                  );
                })}
              </div>
            )}

            {/* ── EVIDENCE ── */}
            {activeTab === 'evidence' && (
              images.length === 0
                ? <div className="text-center py-16"><Image size={48} className="mx-auto mb-3 text-gray-300" /><p className="text-lg font-bold text-gray-500">No evidence uploaded</p></div>
                : <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {images.map((img, i) => (
                      <div key={i} className="border-2 rounded-xl overflow-hidden cursor-pointer hover:shadow-lg transition" onClick={() => setZoomImg(img.image_url||img.url)}>
                        <img src={img.image_url||img.url} alt={`Evidence ${i+1}`} className="w-full h-48 object-cover" />
                        <div className="p-3 bg-gray-50">
                          <p className="text-sm font-bold text-gray-700 flex items-center gap-1"><Paperclip size={13} className="inline-block" /> {img.user_id===dispute.buyer?.id ? 'Buyer' : 'Seller'}</p>
                          <p className="text-xs text-gray-500">{fmtDate(img.created_at)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
            )}

            {/* ── CHAT ── */}
            {(activeTab === 'chat' || activeTab === 'resolve') && activeTab === 'chat' && (
              <div className="flex flex-col" style={{ height: 500 }}>
                {!readOnly && !modJoined && (
                  <div className="bg-purple-50 border border-purple-200 rounded-xl p-5 mb-4 text-center">
                    <Shield size={32} className="mx-auto mb-2 text-purple-600" />
                    <p className="font-black text-purple-800 mb-3">Your messages will appear with a special MODERATOR badge visible to both parties</p>
                    <button onClick={joinChat} className="px-6 py-2.5 rounded-xl text-white font-black text-sm inline-flex items-center gap-1.5" style={{ backgroundColor:P.purple }}>
                      <Gavel size={14} /> Join Dispute Chat
                    </button>
                  </div>
                )}
                {(readOnly || modJoined) && (
                  <div className="flex items-center gap-2 px-4 py-2 rounded-xl mb-3 border" style={{ backgroundColor:'#faf5ff', borderColor:'#c4b5fd' }}>
                    <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor:P.purple }} />
                    <p className="text-sm font-bold" style={{ color:P.purpleDark }}>
                      {readOnly ? 'Viewing resolved dispute chat — read only' : `You are live in this chat as MODERATOR · ${modName}`}
                    </p>
                  </div>
                )}
                <div className="flex-1 overflow-y-auto space-y-3 rounded-xl p-4 border min-h-0" style={{ backgroundColor:'#f9fafb' }}>
                  {chatMessages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full">
                      <MessageCircle size={40} className="mb-2 text-gray-300" />
                      <p className="text-gray-400 font-semibold">No messages yet</p>
                    </div>
                  ) : chatMessages.map((m, i) => {
                    const isMod = m.sender_role === 'moderator' || (m.message_text||m.message||'').startsWith('[MODERATOR]');
                    const isSys = !m.sender_id || m.message_type === 'SYSTEM' || m.sender_role === 'system';
                    const isBuyer = m.sender_id === dispute.buyer?.id;
                    const text = (m.message_text||m.message||'').replace(/^\[MODERATOR\]\s*/,'');
                    const timeStr = new Date(m.created_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});

                    // System message (dispute opened, moderator joined, etc.)
                    if (isSys) {
                      const isModJoinMsg = text.includes('Moderator') || text.includes('moderator');
                      const isRulingMsg = text.includes('BUYER_WINS') || text.includes('SELLER_WINS') || text.includes('CANCEL') || text.includes('resolved') || text.includes('Resolved');
                      if (isRulingMsg) return (
                        <div key={i} className="flex justify-center">
                          <div className="rounded-2xl overflow-hidden border-2 border-amber-400 shadow-lg max-w-[90%] w-full">
                            <div className="flex items-center gap-2 px-4 py-2.5" style={{ background:'linear-gradient(90deg,#D97706,#F59E0B)' }}>
                              <Gavel size={16} className="text-white" />
                              <span className="text-sm font-black text-white tracking-wide inline-flex items-center gap-1.5"><Scale size={14} className="inline-block" /> OFFICIAL RULING</span>
                              <span className="ml-auto text-xs text-white/70">{timeStr}</span>
                            </div>
                            <div className="px-4 py-3" style={{ backgroundColor:'#FFFBEB' }}>
                              <p className="text-sm font-bold text-amber-900 text-center">{text}</p>
                            </div>
                          </div>
                        </div>
                      );
                      if (isModJoinMsg) return (
                        <div key={i} className="flex justify-center">
                          <div className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold border" style={{ backgroundColor:'#faf5ff', borderColor:'#c4b5fd', color:P.purpleDark }}>
                            <Shield size={13} style={{ color:P.purple }} />
                            {text}
                          </div>
                        </div>
                      );
                      return (
                        <div key={i} className="flex justify-center">
                          <div className="bg-gray-200 text-gray-600 px-4 py-2 rounded-xl text-sm font-medium max-w-[85%] text-center">{text}</div>
                        </div>
                      );
                    }

                    // Moderator message — very unique & authoritative
                    if (isMod) return (
                      <div key={i} className="flex justify-center">
                        <div className="w-full max-w-[90%] rounded-2xl overflow-hidden shadow-lg border-2" style={{ borderColor:P.purple }}>
                          {/* Authority header */}
                          <div className="flex items-center gap-2 px-4 py-2.5" style={{ background:`linear-gradient(90deg,${P.purpleDark},${P.purple})` }}>
                            <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor:'rgba(255,255,255,0.25)' }}>
                              <Shield size={13} className="text-white" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <span className="text-xs font-black text-white/60 uppercase tracking-widest">Official Moderator</span>
                              <p className="text-sm font-black text-white leading-none inline-flex items-center gap-1.5"><Gavel size={13} className="inline-block" /> {modName || 'PRAQEN Moderator'}</p>
                            </div>
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                              <span className="text-xs text-white/60">{timeStr}</span>
                            </div>
                          </div>
                          {/* Message body */}
                          <div className="px-4 py-3" style={{ background:'linear-gradient(180deg,#faf5ff,#f3e8ff)' }}>
                            <p className="text-sm font-bold text-purple-900 leading-relaxed">{text}</p>
                          </div>
                          {/* Footer stripe */}
                          <div className="px-4 py-1.5 flex items-center gap-1" style={{ backgroundColor:P.purpleLight }}>
                            <span className="text-xs font-black text-purple-500 uppercase tracking-widest">Praqen Dispute Resolution · Moderator Statement</span>
                          </div>
                        </div>
                      </div>
                    );

                    // Regular user message
                    return (
                      <div key={i} className={`flex ${isBuyer ? 'justify-start' : 'justify-end'}`}>
                        <div className={`max-w-[70%] rounded-2xl border overflow-hidden`} style={{ backgroundColor: isBuyer ? 'white' : '#f0fdf4', borderColor: isBuyer ? '#e5e7eb' : '#86efac' }}>
                          <div className="px-3 py-1.5 flex items-center gap-1.5" style={{ backgroundColor: isBuyer ? '#f9fafb' : '#dcfce7' }}>
                            <div className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-black text-white flex-shrink-0"
                              style={{ backgroundColor: isBuyer ? P.primary : P.info }}>{(isBuyer ? dispute.buyer?.username : dispute.seller?.username || '?')[0]?.toUpperCase()}</div>
                            <span className="text-xs font-black inline-flex items-center gap-1.5" style={{ color: isBuyer ? P.primary : P.info }}>{isBuyer ? <><User size={11} className="inline-block" /> Buyer</> : <><ShoppingBag size={11} className="inline-block" /> Seller</>} · {isBuyer ? dispute.buyer?.username : dispute.seller?.username}</span>
                          </div>
                          <div className="px-4 py-3">
                            <p className="text-sm font-medium text-slate-800 break-words">{text}</p>
                            <p className="text-xs text-gray-400 mt-1 text-right">{timeStr}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={chatEnd} />
                </div>
                {!readOnly && modJoined && (
                  <form onSubmit={sendMessage} className="flex gap-2 mt-3 flex-shrink-0">
                    <div className="flex-1 relative">
                      <input type="text" value={newMessage} onChange={e => setNewMessage(e.target.value)}
                        placeholder="Type as Moderator — visible to both parties with your badge…"
                        className="w-full pl-10 pr-4 py-3 border-2 rounded-xl text-sm font-medium focus:outline-none"
                        style={{ borderColor: newMessage ? P.purple : '#e5e7eb' }} />
                      <Shield size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: P.purple }} />
                    </div>
                    <button type="submit" disabled={sendingMsg || !newMessage.trim()}
                      className="px-5 py-3 rounded-xl text-white font-black text-sm flex items-center gap-2 disabled:opacity-40"
                      style={{ backgroundColor: P.purple }}>
                      {sendingMsg ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />} Send
                    </button>
                  </form>
                )}
              </div>
            )}

            {/* ── TEAM DISCUSSION (internal, all moderators) ── */}
            {activeTab === 'discussion' && (
              <TeamDiscussion tradeId={dispute.trade_id} />
            )}

            {/* ── RESOLVE ── */}
            {activeTab === 'resolve' && !readOnly && (
              <div className="space-y-5">
                <div className="p-4 rounded-xl border-2" style={{ backgroundColor:'#faf5ff', borderColor:'#c4b5fd' }}>
                  <h3 className="font-black mb-3 flex items-center gap-2" style={{ color:P.purpleDark }}><Shield size={18} /> Before You Vote</h3>
                  <ul className="space-y-1.5">
                    {[
                        { icon:CheckCircle, text:'Review all uploaded evidence (Evidence tab)' },
                        { icon:MessageCircle, text:'Read the full chat history (Chat tab)' },
                        { icon:MessageSquare, text:'Read the Team Discussion tab — and add your own notes' },
                        { icon:Users, text:'Check both user trade profiles' },
                        { icon:ClipboardEdit, text:'Write clear notes explaining your reasoning' },
                      ].map(({ icon:Icon, text }) => (
                      <li key={text} className="text-sm font-semibold flex items-start gap-2" style={{ color:P.purpleDark }}><Icon size={14} className="mt-0.5 flex-shrink-0" /> {text}</li>
                    ))}
                  </ul>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 bg-gray-50 rounded-xl border">
                  {[{ l:'BTC at Stake', v:`₿ ${fmtBtc(dispute.trade_details?.amount_btc)}`, c:P.gold }, { l:'USD Value', v:fmtUsd(dispute.trade_details?.amount_usd), c:P.success }, { l:'Buyer', v:dispute.buyer?.username||'—', c:P.primary }, { l:'Seller', v:dispute.seller?.username||'—', c:P.info }].map(({ l,v,c }) => (
                    <div key={l} className="text-center bg-white p-3 rounded-xl border"><p className="text-xs font-bold text-gray-500 uppercase mb-1">{l}</p><p className="text-base font-black" style={{ color:c }}>{v}</p></div>
                  ))}
                </div>

                {/* Quorum panel */}
                <div className="p-4 rounded-xl border-2" style={{ borderColor:'#e5e7eb' }}>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-black text-gray-700 flex items-center gap-2"><Users size={15} /> Verdict Votes</p>
                    <span className="text-xs font-black text-gray-500">
                      {voteData.is_split ? 'Tied — no majority' : `${Math.max(...Object.values(voteData.tally||{}), 0)} of ${voteData.quorum||3} needed`}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden mb-3">
                    <div className="h-full rounded-full transition-all" style={{
                      width: `${Math.min(100, (Math.max(...Object.values(voteData.tally||{}), 0) / (voteData.quorum||3)) * 100)}%`,
                      backgroundColor: voteData.is_split ? P.danger : P.purple,
                    }} />
                  </div>
                  <VoteSeats moderators={moderators} votes={voteData.votes} currentUserId={currentUserId} />
                </div>

                {voteData.is_split && (
                  <div className="flex items-start gap-2 p-4 rounded-xl border" style={{ backgroundColor:'#FFFBEB', borderColor:'#FDE68A' }}>
                    <Clock size={16} style={{ color:P.gold, flexShrink:0, marginTop:2 }} />
                    <p className="text-sm font-bold" style={{ color:'#92400E' }}>
                      The panel is tied with no majority — this case is escalated for an admin decision.
                    </p>
                  </div>
                )}

                <div>
                  <label className="block text-base font-black text-gray-800 mb-2 inline-flex items-center gap-1.5">
                    <ClipboardEdit size={16} className="inline-block" /> Your Reasoning <span className="text-red-500">*</span>
                  </label>
                  <textarea value={resolutionNotes} onChange={e => setNotes(e.target.value)} rows={5}
                    placeholder="Write your full reasoning here — visible to the rest of the moderator team once you vote…"
                    className="w-full px-4 py-3 border-2 rounded-xl text-sm font-medium focus:outline-none resize-none"
                    style={{ borderColor: resolutionNotes ? P.purple : '#e5e7eb' }} />
                  <p className="text-xs mt-1 font-semibold" style={{ color: resolutionNotes ? P.success : '#9ca3af' }}>
                    {resolutionNotes ? `${resolutionNotes.length} chars — ready to submit` : 'Required before you can cast your vote'}
                  </p>
                </div>
                <div className="grid md:grid-cols-3 gap-4">
                  {[
                    { label:<span className="inline-flex items-center gap-1.5"><CheckCircle size={16} className="inline-block" /> Buyer Wins</span>, sub:'Release BTC to buyer', decision:'BUYER_WINS', color:P.success, bg:'#ECFDF5', border:'#6EE7B7' },
                    { label:<span className="inline-flex items-center gap-1.5"><CheckCircle size={16} className="inline-block" /> Seller Wins</span>, sub:'Return BTC to seller', decision:'SELLER_WINS', color:P.info, bg:'#EFF6FF', border:'#93C5FD' },
                    { label:<span className="inline-flex items-center gap-1.5"><XCircle size={16} className="inline-block" /> Cancel Trade</span>, sub:'Refund escrow to seller', decision:'CANCEL', color:P.danger, bg:'#FEF2F2', border:'#FCA5A5' },
                  ].map(({ label, sub, decision, color, bg, border }) => (
                    <button key={decision} onClick={() => openConfirm(decision)} disabled={!resolutionNotes.trim()}
                      className="p-5 rounded-2xl border-2 text-left transition disabled:opacity-40 disabled:cursor-not-allowed hover:shadow-xl hover:-translate-y-0.5"
                      style={{ backgroundColor:bg, borderColor:border }}>
                      <div className="flex items-center gap-2 mb-2">
                        <Gavel size={18} style={{ color }} />
                        <p className="font-black text-base" style={{ color }}>{label}</p>
                      </div>
                      <p className="text-sm font-semibold" style={{ color }}>{sub}</p>
                      <p className="text-xs mt-2 font-bold text-gray-400">Cast your vote →</p>
                    </button>
                  ))}
                </div>
                <div className="flex items-start gap-2 p-4 rounded-xl bg-blue-50 border border-blue-200">
                  <AlertCircle size={16} className="text-blue-600 flex-shrink-0 mt-0.5" />
                  <p className="text-sm font-bold text-blue-700">Your vote alone does not resolve this case. Escrow only moves once {voteData.quorum || 3} moderators agree on the same outcome.</p>
                </div>

                {/* Admin override — full power, available anytime, admins only */}
                {isAdmin && (
                  <div className="p-4 rounded-2xl border-2" style={{ backgroundColor:'#FFFBEB', borderColor:P.gold }}>
                    <h3 className="font-black mb-1 flex items-center gap-2" style={{ color:'#92400E' }}><Stamp size={16} /> Admin Override</h3>
                    <p className="text-xs font-semibold mb-3" style={{ color:'#92400E' }}>You can resolve this case directly at any time. Requires a written reason — logged to the team discussion thread.</p>
                    <textarea value={overrideReason} onChange={e => setOverrideReason(e.target.value)} rows={2}
                      placeholder="Required: why are you overriding? (e.g. team unresponsive, evidence reviewed independently)…"
                      className="w-full px-3 py-2 border-2 rounded-xl text-sm outline-none resize-none mb-3" style={{ borderColor:'#FDE68A' }} />
                    <div className="grid md:grid-cols-3 gap-2">
                      {[
                        { l:'Buyer Wins', decision:'BUYER_WINS' },
                        { l:'Seller Wins', decision:'SELLER_WINS' },
                        { l:'Cancel Trade', decision:'CANCEL' },
                      ].map(({ l, decision }) => (
                        <button key={decision} onClick={() => submitOverride(decision)} disabled={submittingOverride || !overrideReason.trim()}
                          className="py-2.5 rounded-xl text-white font-black text-xs disabled:opacity-40" style={{ backgroundColor:P.gold }}>
                          {submittingOverride ? 'Processing…' : `Confirm: ${l}`}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── RULING (read-only view for resolved disputes) ── */}
            {activeTab === 'ruling' && readOnly && (
              <div className="space-y-5">
                <div className="rounded-2xl overflow-hidden border-2" style={{ borderColor: dispute.resolution==='BUYER_WINS' ? P.success : dispute.resolution==='SELLER_WINS' ? P.info : P.danger }}>
                  <div className="px-6 py-4 flex items-center gap-3" style={{ background:`linear-gradient(90deg,${P.gold},${P.warning})` }}>
                    <Gavel size={24} className="text-white" />
                    <div>
                      <p className="text-xs font-black text-white/70 uppercase tracking-widest">Official Ruling</p>
                      <p className="text-xl font-black text-white">{resBadge(dispute.resolution||dispute.dispute_resolution)}</p>
                    </div>
                    <span className="ml-auto text-xs text-white/70 font-mono">Trade #{(dispute.trade_id||'').slice(0,8).toUpperCase()}</span>
                  </div>
                  <div className="p-5 space-y-4" style={{ backgroundColor:'#FFFBEB' }}>
                    <div className="flex items-center gap-3 p-3 rounded-xl border border-amber-200 bg-white flex-wrap">
                      <Shield size={18} style={{ color:P.purple }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-black" style={{ color:P.purple }}>
                          {dispute.resolved_via === 'ADMIN_OVERRIDE' ? 'Resolved by admin override: ' : 'Resolved by consensus of: '}
                          {dispute.resolved_by_name || 'PRAQEN Moderator'}
                        </p>
                        {(dispute.resolved_by_list || []).some(v => v.email) && (
                          <p className="text-xs text-gray-500">{(dispute.resolved_by_list || []).map(v => v.email).filter(Boolean).join(', ')}</p>
                        )}
                        <p className="text-xs text-gray-500">{fmtDate(dispute.resolved_at||dispute.updated_at)}</p>
                      </div>
                      {dispute.resolved_via && (
                        <span className="text-[10px] font-black uppercase px-2.5 py-1 rounded-full flex-shrink-0" style={{ backgroundColor: dispute.resolved_via === 'ADMIN_OVERRIDE' ? P.gold : P.success, color:'white' }}>
                          {dispute.resolved_via === 'ADMIN_OVERRIDE' ? 'Admin Override' : '3-Vote Quorum'}
                        </span>
                      )}
                    </div>
                    {dispute.override_reason && (
                      <div className="p-4 rounded-xl border" style={{ backgroundColor:'#FFFBEB', borderColor:P.gold }}>
                        <p className="text-sm font-black mb-1 inline-flex items-center gap-1.5" style={{ color:'#92400E' }}><AlertTriangle size={13} className="inline-block" /> Admin Override Reason</p>
                        <p className="text-sm leading-relaxed" style={{ color:'#92400E' }}>{dispute.override_reason}</p>
                      </div>
                    )}
                    {(dispute.resolution_notes||dispute.dispute_notes) && (
                      <div className="p-4 rounded-xl border" style={{ backgroundColor:'#faf5ff', borderColor:'#c4b5fd' }}>
                        <p className="text-sm font-black text-purple-700 mb-2 inline-flex items-center gap-1.5"><ClipboardEdit size={14} className="inline-block" /> Moderator's Ruling Notes</p>
                        <p className="text-sm text-purple-800 leading-relaxed whitespace-pre-wrap">{dispute.resolution_notes||dispute.dispute_notes}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// ================================================================
// MAIN DASHBOARD
// ================================================================
export default function ModeratorDashboard({ user }) {
  const [modName, setModName]             = useState('');
  const [loggedIn, setLoggedIn]           = useState(false);
  const [disputes, setDisputes]           = useState([]);
  const [resolved, setResolved]           = useState([]);
  const [loading, setLoading]             = useState(true);
  const [activeDispute, setActiveDispute] = useState(null);
  const [viewDispute, setViewDispute]     = useState(null);
  const [showGuidelines, setShowGuidelines] = useState(false);
  const [oathSigned, setOathSigned]       = useState(null); // null = checking, true/false once known

  useEffect(() => {
    const t = localStorage.getItem('mod_token');
    // `mod_token` alone is just a marker written by client-side JS — it proves nothing on
    // its own. Only trust it once `user` (populated from the server's own /profile response)
    // confirms real is_admin/is_moderator, so editing localStorage can't fake this gate.
    if (t && (user?.is_moderator || user?.is_admin)) { setLoggedIn(true); setModName(user?.username || 'PRAQEN Moderator'); }
  }, [user]);
  useEffect(() => {
    if ((user?.is_moderator || user?.is_admin) && !loggedIn) {
      const tok = localStorage.getItem('token');
      if (tok) { localStorage.setItem('mod_token', tok); setLoggedIn(true); setModName(user.username||'PRAQEN Moderator'); }
    }
  }, [user]);

  const authH = () => { const t = localStorage.getItem('token'); return t ? { Authorization:`Bearer ${t}` } : {}; };

  const checkOath = async () => {
    try { const r = await axios.get(`${API_URL}/team/oath-status`, { headers:authH() }); setOathSigned(!!r.data.signed); }
    catch { setOathSigned(false); }
  };
  useEffect(() => { if (loggedIn) checkOath(); }, [loggedIn]);
  useEffect(() => { if (loggedIn && oathSigned) loadAll(); }, [loggedIn, oathSigned]);

  const loadAll = async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${API_URL}/admin/disputes`, { headers:authH() });
      const all = r.data.disputes || [];
      setDisputes(all.filter(d => ['OPEN','DISPUTED','IN_REVIEW'].includes(d.status)));
      setResolved(all.filter(d => (['COMPLETED','CANCELLED'].includes(d.status) && (d.dispute_reason || d.reason || d.dispute_resolution))));
    } catch { setDisputes([]); setResolved([]); }
    setLoading(false);
  };

  const logout = () => {
    // Clear every session key — leaving `token`/`user` behind would let the
    // login screen's auto-relogin effect silently sign you right back in.
    localStorage.removeItem('token'); localStorage.removeItem('user');
    localStorage.removeItem('mod_token'); localStorage.removeItem('mod_user');
    localStorage.removeItem('team_token'); localStorage.removeItem('team_user');
    window.location.href = '/moderator';
  };

  if (!loggedIn) return <ModeratorLogin user={user} onLogin={name => { setLoggedIn(true); setModName(name); }} />;

  if (oathSigned === null) return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor:P.lightBg }}>
      <div className="w-10 h-10 border-4 rounded-full animate-spin" style={{ borderColor:P.purple, borderTopColor:P.secondary }} />
    </div>
  );
  if (oathSigned === false) return <OathScreen user={user} onSigned={() => setOathSigned(true)} />;

  const open     = disputes.filter(d => d.status==='OPEN'||d.status==='DISPUTED');
  const inReview = disputes.filter(d => d.status==='IN_REVIEW');
  const totalBtc = resolved.reduce((s,d) => s+parseFloat(d.amount_btc||d.trade_details?.amount_btc||0), 0);
  const totalUsd = resolved.reduce((s,d) => s+parseFloat(d.amount_usd||d.trade_details?.amount_usd||0), 0);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor:P.lightBg }}>
      <div className="text-center">
        <div className="w-12 h-12 border-4 rounded-full animate-spin mx-auto mb-4" style={{ borderColor:P.purple, borderTopColor:P.secondary }} />
        <p className="font-bold" style={{ color:P.primary }}>Loading disputes…</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen" style={{ backgroundColor:P.lightBg }}>

      {/* ── TOP APP BAR — this page is fully standalone (no site nav/footer) ── */}
      <div className="sticky top-0 z-40 shadow-md" style={{ backgroundColor:P.darkBg }}>
        <div className="max-w-7xl mx-auto px-4 py-3.5 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor:P.purple }}>
              <Gavel size={19} className="text-white" />
            </div>
            <div>
              <p className="leading-none" style={{ fontFamily:'Georgia, serif', fontWeight:900, fontSize:19, letterSpacing:'0.02em' }}>
                <span style={{ color:'#fff' }}>PRA</span><span style={{ color:P.secondary }}>QEN</span>
              </p>
              <p className="text-[10px] font-black uppercase tracking-widest mt-0.5" style={{ color:'rgba(255,255,255,0.55)' }}>Dispute Resolution Center</p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="text-right mr-1 hidden sm:block">
              <p className="text-white text-sm font-black leading-none">{modName}</p>
              <p className="text-[10px] font-semibold mt-0.5" style={{ color:'rgba(255,255,255,0.5)' }}>{user?.email}</p>
            </div>
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black text-white" style={{ backgroundColor:P.purple }}>
              <Shield size={10} /> MODERATOR
            </span>
            {user?.email === ADMIN_EMAIL && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black text-white" style={{ backgroundColor:P.gold }}>
                ADMIN
              </span>
            )}
            <button onClick={() => setShowGuidelines(!showGuidelines)} title="Guidelines"
              className="p-2 rounded-lg hover:bg-white/10 transition"><BookOpen size={16} className="text-white/80" /></button>
            <button onClick={loadAll} title="Refresh"
              className="p-2 rounded-lg hover:bg-white/10 transition"><RefreshCw size={16} className="text-white/80" /></button>
            <button onClick={logout} title="Logout"
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg transition" style={{ backgroundColor:'rgba(239,68,68,0.15)' }}>
              <X size={14} style={{ color:'#f87171' }} /><span className="text-xs font-black" style={{ color:'#f87171' }}>Logout</span>
            </button>
          </div>
        </div>
      </div>

      <div className="py-8 px-4">
      <div className="max-w-7xl mx-auto">

        {/* GUIDELINES */}
        {showGuidelines && (
          <div className="rounded-2xl p-6 mb-8 border-2" style={{ backgroundColor:'#faf5ff', borderColor:'#c4b5fd' }}>
            <h3 className="font-black text-lg mb-4 flex items-center gap-2" style={{ color:P.purpleDark }}>
              <Shield size={20} /> Fair Dispute Resolution Guidelines
            </h3>
            <div className="grid md:grid-cols-3 gap-4">
              {[
                { icon:CheckCircle, title:'Buyer Wins', c:'text-green-700', bg:'bg-green-50', pts:['Buyer has valid payment proof','Seller failed to release BTC','Seller sent fake/invalid item','Clear evidence of seller fraud'] },
                { icon:CheckCircle, title:'Seller Wins', c:'text-blue-700', bg:'bg-blue-50', pts:['Buyer never sent payment','Buyer provided fake proof','Buyer attempted scam','Seller provided valid item'] },
                { icon:XCircle, title:'Cancel Trade', c:'text-red-700', bg:'bg-red-50', pts:['Mutual misunderstanding','Technical platform issue','Insufficient evidence from both','Refund BTC to seller'] },
              ].map(({ icon:Icon, title, c, bg, pts }) => (
                <div key={title} className={`${bg} rounded-xl p-4`}>
                  <p className={`font-black text-base ${c} mb-3 inline-flex items-center gap-1.5`}><Icon size={16} className="inline-block" /> {title}</p>
                  <ul className="space-y-1.5">{pts.map(p => <li key={p} className={`text-sm ${c}`}>• {p}</li>)}</ul>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* STATS */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-5 mb-8">
          {[
            { icon:AlertCircle, label:'Open Disputes',  value:open.length,       color:P.danger,   sub:open.length>0 ? <span className="inline-flex items-center gap-1"><Zap size={13} className="inline-block" /> Needs action</span> : <span className="inline-flex items-center gap-1"><CheckCircle size={13} className="inline-block" /> All clear</span> },
            { icon:Clock,       label:'In Review',      value:inReview.length,   color:P.warning,  sub:'Being reviewed now' },
            { icon:CheckCircle, label:'Total Resolved', value:resolved.length,   color:P.success,  sub:'Click any to review' },
            { icon:TrendingUp,  label:'Total Volume',   value:fmtUsd(totalUsd),  color:P.purple,   sub:`₿ ${fmtBtc(totalBtc)} BTC` },
          ].map(({ icon:Icon, label, value, color, sub }) => (
            <div key={label} className="bg-white rounded-2xl shadow p-5 border-l-4" style={{ borderColor:color }}>
              <div className="flex items-center gap-3 mb-2"><Icon size={28} style={{ color }} /><p className="text-gray-600 text-sm font-semibold">{label}</p></div>
              <p className="text-3xl font-black text-slate-900">{value}</p>
              {sub && <p className="text-sm text-gray-500 mt-1 font-medium">{sub}</p>}
            </div>
          ))}
        </div>

        {/* OPEN DISPUTES */}
        <div className="bg-white rounded-2xl shadow p-6 mb-6">
          <h2 className="text-2xl font-black mb-6 inline-flex items-center gap-2" style={{ color:P.primary }}><AlertTriangle size={22} className="inline-block" /> Open Disputes ({open.length})</h2>
          {open.length === 0 ? (
            <div className="text-center py-12"><CheckCircle size={48} className="mx-auto mb-3 text-green-400" /><p className="text-lg font-bold text-gray-500">No open disputes — all clear!</p></div>
          ) : (
            <div className="space-y-4">
              {open.map(d => (
                <div key={d.id} className="border-2 border-red-200 bg-red-50 rounded-xl p-4 hover:shadow-md transition">
                  <div className="flex justify-between items-start gap-4 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
                        <span className="font-black text-sm text-red-700">DISPUTED</span>
                        <span className="bg-red-100 text-red-800 px-2 py-0.5 rounded-full text-xs font-semibold">#{(d.trade_id||d.id||'').slice(0,8).toUpperCase()}</span>
                        <span className="bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full text-xs font-semibold">{fmtAge(d.created_at)}</span>
                      </div>
                      <p className="font-bold text-slate-900 mb-2">{d.reason||'User opened a dispute'}</p>
                      <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-gray-600">
                        <span><strong>BTC:</strong> ₿{fmtBtc(d.trade_details?.amount_btc)}</span>
                        <span><strong>USD:</strong> {fmtUsd(d.trade_details?.amount_usd)}</span>
                        {d.trade_details?.payment_method && <span><strong>Payment:</strong> {d.trade_details.payment_method}</span>}
                        <span><strong>Buyer:</strong> {d.buyer?.username||'Unknown'}</span>
                        <span><strong>Seller:</strong> {d.seller?.username||'Unknown'}</span>
                      </div>
                    </div>
                    <button onClick={() => setActiveDispute(d)}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl text-white font-bold text-sm hover:opacity-90 transition flex-shrink-0"
                      style={{ backgroundColor:P.purple }}>
                      <Eye size={16} /> Review & Join
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* IN REVIEW */}
        {inReview.length > 0 && (
          <div className="bg-white rounded-2xl shadow p-6 mb-6">
            <h2 className="text-2xl font-black mb-6 inline-flex items-center gap-2" style={{ color:P.primary }}><Clock size={22} className="inline-block" /> In Review ({inReview.length})</h2>
            <div className="space-y-4">
              {inReview.map(d => (
                <div key={d.id} className="border-2 border-yellow-300 bg-yellow-50 rounded-xl p-4 hover:shadow-md transition">
                  <div className="flex justify-between items-start gap-4 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <span className="bg-yellow-200 text-yellow-800 px-2 py-0.5 rounded-full text-xs font-semibold">IN REVIEW</span>
                        <span className="text-xs font-mono text-gray-500">#{(d.trade_id||d.id||'').slice(0,8).toUpperCase()}</span>
                        <span className="text-xs text-gray-400">{fmtAge(d.created_at)}</span>
                      </div>
                      <p className="font-bold text-slate-900 mb-2">{d.reason||'Dispute under review'}</p>
                      <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-gray-600">
                        <span><strong>BTC:</strong> ₿{fmtBtc(d.trade_details?.amount_btc)}</span>
                        <span><strong>USD:</strong> {fmtUsd(d.trade_details?.amount_usd)}</span>
                        <span><strong>Buyer:</strong> {d.buyer?.username||'—'} ({d.buyer?.total_trades||0} trades)</span>
                        <span><strong>Seller:</strong> {d.seller?.username||'—'} ({d.seller?.total_trades||0} trades)</span>
                      </div>
                    </div>
                    <button onClick={() => setActiveDispute(d)}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl text-white font-bold text-sm hover:opacity-90 flex-shrink-0"
                      style={{ backgroundColor:P.warning }}>
                      <Eye size={16} /> Continue Review
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* RESOLVED DISPUTES — always visible, fully clickable */}
        <div className="bg-white rounded-2xl shadow p-6">
          <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
            <div>
              <h2 className="text-2xl font-black" style={{ color:P.primary }}>
                <History size={22} className="inline mr-2 -mt-1" style={{ color:P.success }} />
                Resolved Disputes ({resolved.length})
              </h2>
              <p className="text-sm text-gray-500 mt-1 font-medium">Full history is kept permanently — click any ruling to review all details, chat, and evidence</p>
            </div>
            {resolved.length > 0 && (
              <div className="flex gap-4">
                {[
                  { lbl:'Total Resolved', val:resolved.length, color:P.success },
                  { lbl:'BTC Handled',    val:`₿ ${fmtBtc(totalBtc)}`, color:P.gold },
                  { lbl:'USD Volume',     val:fmtUsd(totalUsd), color:P.info },
                ].map(({ lbl, val, color }) => (
                  <div key={lbl} className="text-center px-4 py-2 rounded-xl border bg-gray-50">
                    <p className="text-xs font-bold text-gray-500 uppercase mb-0.5">{lbl}</p>
                    <p className="text-base font-black" style={{ color }}>{val}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {resolved.length === 0 ? (
            <div className="text-center py-12">
              <History size={48} className="mx-auto mb-3 text-gray-300" />
              <p className="text-lg font-bold text-gray-500">No resolved disputes yet.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {resolved.map(d => {
                const res      = d.resolution||d.dispute_resolution;
                const btcAmt   = parseFloat(d.amount_btc||d.trade_details?.amount_btc||0);
                const usdAmt   = parseFloat(d.amount_usd||d.trade_details?.amount_usd||0);
                const resColor = res==='BUYER_WINS' ? P.success : res==='SELLER_WINS' ? P.info : P.danger;
                const resBg    = res==='BUYER_WINS' ? '#ECFDF5' : res==='SELLER_WINS' ? '#EFF6FF' : '#FEF2F2';
                return (
                  <div key={d.id} className="border-2 rounded-2xl overflow-hidden cursor-pointer hover:shadow-lg transition group"
                    style={{ borderColor: resColor }}
                    onClick={() => setViewDispute(d)}>
                    {/* Ruling banner */}
                    <div className="px-5 py-3 flex items-center gap-3 flex-wrap" style={{ backgroundColor:resBg }}>
                      {resBadge(res)}
                      <span className="text-sm font-mono text-gray-500">#{(d.trade_id||d.id||'').slice(0,8).toUpperCase()}</span>
                      <span className="text-sm text-gray-500">Resolved {fmtAge(d.resolved_at||d.updated_at)}</span>
                      <span className="ml-auto flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full border group-hover:bg-white transition" style={{ color:P.purple, borderColor:'#c4b5fd' }}>
                        <Eye size={11} /> View Full Details
                      </span>
                    </div>
                    {/* Summary */}
                    <div className="p-5">
                      <p className="text-base font-black text-slate-900 mb-3">{d.reason||d.dispute_reason||'Dispute resolved'}</p>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                        {[
                          { lbl:'BTC Traded', val:`₿ ${fmtBtc(btcAmt)}`, c:P.gold },
                          { lbl:'USD Value',  val:fmtUsd(usdAmt),         c:P.success },
                          { lbl:'Buyer',      val:d.buyer?.username||'—',  c:P.primary },
                          { lbl:'Seller',     val:d.seller?.username||'—', c:P.info },
                        ].map(({ lbl,val,c }) => (
                          <div key={lbl} className="p-3 rounded-xl border text-center bg-gray-50">
                            <p className="text-xs font-bold text-gray-500 uppercase mb-1">{lbl}</p>
                            <p className="text-sm font-black" style={{ color:c }}>{val}</p>
                          </div>
                        ))}
                      </div>
                      <div className="flex items-center gap-2 p-3 rounded-xl flex-wrap" style={{ backgroundColor:'#faf5ff', border:'1px solid #c4b5fd' }}>
                        <Shield size={14} style={{ color:P.purple }} />
                        <p className="text-sm font-bold" style={{ color:P.purple }}>
                          {d.resolved_via === 'ADMIN_OVERRIDE' ? 'Admin override: ' : 'Consensus of: '}
                          {d.resolved_by_name || 'PRAQEN Moderator'} · {fmtDate(d.resolved_at||d.updated_at)}
                        </p>
                        {d.resolved_via && (
                          <span className="ml-auto text-[9px] font-black uppercase px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: d.resolved_via === 'ADMIN_OVERRIDE' ? P.gold : P.success }}>
                            {d.resolved_via === 'ADMIN_OVERRIDE' ? 'Override' : 'Quorum'}
                          </span>
                        )}
                      </div>
                      {(d.resolution_notes||d.dispute_notes) && (
                        <div className="mt-3 p-3 rounded-xl border" style={{ backgroundColor:'#faf5ff', borderColor:'#c4b5fd' }}>
                          <p className="text-xs font-black text-purple-700 mb-1 inline-flex items-center gap-1.5"><ClipboardEdit size={13} className="inline-block" /> Notes Preview</p>
                          <p className="text-sm text-purple-800 leading-relaxed line-clamp-2">{d.resolution_notes||d.dispute_notes}</p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
      </div>

      {/* Active dispute modal */}
      {activeDispute && (
        <DisputeModal
          dispute={activeDispute}
          modName={modName}
          currentUserId={user?.id}
          isAdmin={!!(user?.is_admin || user?.email === ADMIN_EMAIL)}
          readOnly={false}
          onClose={() => setActiveDispute(null)}
          onResolved={() => { setActiveDispute(null); loadAll(); }}
        />
      )}

      {/* Resolved dispute viewer (read-only) */}
      {viewDispute && (
        <DisputeModal
          dispute={viewDispute}
          modName={modName}
          currentUserId={user?.id}
          isAdmin={!!(user?.is_admin || user?.email === ADMIN_EMAIL)}
          readOnly={true}
          onClose={() => setViewDispute(null)}
          onResolved={() => {}}
        />
      )}
    </div>
  );
}
