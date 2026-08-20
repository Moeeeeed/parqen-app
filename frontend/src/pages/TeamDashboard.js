import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import {
  LayoutDashboard, Users, ArrowLeftRight, AlertTriangle,
  Shield, LogOut, RefreshCw, X, Eye, Search,
  CheckCircle, Clock, TrendingUp, Activity, MessageCircle,
  Send, ChevronLeft, ChevronRight, Lock, Star,
  Bell, Gavel, Menu, XCircle, Info, Zap,
  MessageSquare, Hash, Trophy, ThumbsUp, ThumbsDown,
  UserCheck, Phone, Filter, Award, DollarSign, ArrowUpRight,
  BookOpen, CreditCard, Receipt, Plus, Trash2, Edit2, AlertCircle, Calendar,
  PieChart, Briefcase, BarChart2, Megaphone, ClipboardList, FileText, AlertOctagon,
  CalendarDays, Download, Tag, Pin, GripVertical, CheckSquare, Square, FileDown,
  Globe, ShieldOff, UserX, Layers,
  Gift, User, Mail, Smartphone, Circle, Medal, Scale, Minus, MailOpen,
  Repeat, ChevronUp, Bug, Lightbulb,
} from 'lucide-react';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

// Team access is validated by the backend (is_moderator || is_admin flag)
const isTeamEmail = (email) => !!(email); // backend enforces — just ensure non-empty

const C = {
  forest: '#1B4332', green: '#2D6A4F', mint: '#40916C',
  gold: '#F4A422', amber: '#F59E0B',
  purple: '#7C3AED', purpleLight: '#EDE9FE', purpleDark: '#5B21B6',
  g50: '#F8FAFC', g100: '#F1F5F9', g200: '#E2E8F0',
  g400: '#94A3B8', g500: '#64748B', g600: '#475569', g700: '#334155', g800: '#1E293B',
  success: '#10B981', danger: '#EF4444', paid: '#3B82F6', warn: '#F59E0B',
};

// ─── Suggestion + P2P-migration constants — shared shape with AdminDashboard.js's versions,
// since these sections are ported from there onto the Team Portal (same backend endpoints,
// now also open to moderators via requireTeamOrCeo — see server.js).
const SUGGESTION_CATS = [
  { id: 'feature',     label: 'Feature Request', icon: <Lightbulb size={14} className="inline-block" /> },
  { id: 'trading',     label: 'Trading Tip',      icon: <TrendingUp size={14} className="inline-block" /> },
  { id: 'bug',         label: 'Bug Report',       icon: <Bug size={14} className="inline-block" /> },
  { id: 'improvement', label: 'Improvement',      icon: <Zap size={14} className="inline-block" /> },
  { id: 'other',       label: 'Other',            icon: <MessageSquare size={14} className="inline-block" /> },
];
const SUGGESTION_STATUS = {
  open:      { label: 'Open',         color: '#3B82F6', bg: '#EFF6FF'  },
  reviewing: { label: 'Under Review', color: '#92400E', bg: '#FFFBEB'  },
  planned:   { label: 'Planned',      color: '#6D28D9', bg: '#F5F3FF'  },
  building:  { label: 'Building',     color: '#EA580C', bg: '#FFF7ED'  },
  done:      { label: 'Done',         color: '#166534', bg: '#F0FDF4'  },
  rejected:  { label: 'Not Planned',  color: '#6B7280', bg: '#F9FAFB'  },
};
const MIGRATION_PLATFORM_LABEL = { noones: 'Noones', binance: 'Binance P2P', other: 'Other P2P' };

const authH = () => {
  const t = localStorage.getItem('team_token') || localStorage.getItem('token');
  return t ? { Authorization: `Bearer ${t}` } : {};
};
const fmt = (n, d = 0) => new Intl.NumberFormat('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }).format(n || 0);
const fmtBtc = (n) => parseFloat(n || 0).toFixed(6);
const fmtAge = (ts) => {
  if (!ts) return '—';
  const s = (Date.now() - new Date(ts)) / 1000;
  if (s < 60) return 'Just now';
  if (s < 3600) return `${~~(s / 60)}m ago`;
  if (s < 86400) return `${~~(s / 3600)}h ago`;
  return `${~~(s / 86400)}d ago`;
};
const fmtDate = (ts) =>
  ts ? new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
const statusColor = (s) => {
  const m = { COMPLETED: '#10B981', CANCELLED: '#6B7280', DISPUTED: '#8B5CF6', ACTIVE: '#3B82F6', PAID: '#3B82F6', PAYMENT_SENT: '#3B82F6', ESCROW: '#F59E0B', CREATED: '#F59E0B', FUNDS_LOCKED: '#F59E0B', OPEN: '#2D6A4F' };
  return m[s] || '#94A3B8';
};
const badgeColor = (b) => {
  const m = { DIAMOND: { c: '#06B6D4', bg: '#ECFEFF' }, GOLD: { c: '#D97706', bg: '#FFFBEB' }, SILVER: { c: '#6B7280', bg: '#F9FAFB' }, BRONZE: { c: '#92400E', bg: '#FEF3C7' }, BEGINNER: { c: '#6B7280', bg: '#F3F4F6' } };
  return m[b] || m.BEGINNER;
};

function Spin() {
  return <div className="flex items-center justify-center py-16"><div className="w-8 h-8 border-4 rounded-full animate-spin" style={{ borderColor: `${C.forest}20`, borderTopColor: C.forest }} /></div>;
}
function Empty({ icon = <MailOpen size={36} className="mx-auto" style={{ color: C.g300 }} />, text = 'No data found' }) {
  return <div className="flex flex-col items-center py-12 gap-2"><span className="text-4xl">{icon}</span><p className="text-sm font-semibold" style={{ color: C.g500 }}>{text}</p></div>;
}
function Pill({ label, color = '#10B981', bg = '#F0FDF4' }) {
  return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-black" style={{ color, backgroundColor: bg }}>{label}</span>;
}
function SectionHead({ title, sub, action }) {
  return (
    <div className="flex items-start justify-between mb-5 flex-wrap gap-3">
      <div>
        <h2 className="text-lg font-black" style={{ color: C.g800 }}>{title}</h2>
        {sub && <p className="text-xs mt-0.5" style={{ color: C.g400 }}>{sub}</p>}
      </div>
      {action}
    </div>
  );
}
function ImageModal({ src, label, onClose }) {
  if (!src) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.85)' }} onClick={onClose}>
      <div className="relative max-w-2xl w-full" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <p className="text-white text-sm font-bold">{label}</p>
          <button onClick={onClose} className="p-1.5 rounded-full" style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}>
            <X size={16} color="#fff" />
          </button>
        </div>
        <img src={src} alt={label} className="w-full h-auto rounded-xl" />
      </div>
    </div>
  );
}
function StatCard({ icon, label, value, sub, color = C.forest, bg = '#F0FDF4', pulse }) {
  return (
    <div className="bg-white rounded-2xl border p-4 flex items-center gap-4" style={{ borderColor: C.g200 }}>
      <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 relative" style={{ backgroundColor: bg }}>
        <span style={{ color }}>{icon}</span>
        {pulse && <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-red-500 animate-pulse" />}
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: C.g400 }}>{label}</p>
        <p className="text-xl font-black truncate" style={{ color: C.g800 }}>{value}</p>
        {sub && <p className="text-xs" style={{ color: C.g400 }}>{sub}</p>}
      </div>
    </div>
  );
}
function Stars({ rating }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1,2,3,4,5].map(i => (
        <Star key={i} size={11} className={i <= Math.round(rating || 0) ? 'fill-yellow-400 text-yellow-400' : 'text-gray-200 fill-gray-200'} />
      ))}
    </div>
  );
}

// ================================================================
// LOGIN  (multi-step: email → password  OR  first-time setup)
// ================================================================
function TeamLogin({ onAuth }) {
  // step: 'email' | 'login' | 'otp' | 'setup'
  const [step, setStep]         = useState('email');
  const [email, setEmail]       = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm]   = useState('');
  const [otp, setOtp]           = useState('');
  const [loading, setLoading]   = useState(false);
  const [err, setErr]           = useState('');

  // Step 1: check if email can access team portal
  const checkEmail = async (e) => {
    e.preventDefault(); setErr(''); setLoading(true);
    try {
      const r = await axios.post(`${API_URL}/team/check-email`, { email });
      const { status, error: msg } = r.data;
      if (status === 'has_account') { setStep('login'); }
      else if (status === 'needs_setup') { setStep('setup'); }
      else { setErr(msg || 'Access denied.'); }
    } catch (ex) { setErr(ex.response?.data?.error || 'Could not verify email. Try again.'); }
    setLoading(false);
  };

  // Step 2a: existing account — password, then a mandatory email code (no bypass)
  const doLogin = async (e) => {
    e.preventDefault(); setErr(''); setLoading(true);
    try {
      const r = await axios.post(`${API_URL}/team/login`, { email, password });
      if (r.data.requiresOtp) {
        setOtp('');
        setStep('otp');
      } else {
        setErr('Login failed. Please try again.');
      }
    } catch (ex) { setErr(ex.response?.data?.error || ex.message || 'Login failed'); }
    setLoading(false);
  };

  // Step 2a-ii: verify the emailed code — this is the only path that ever issues a token
  const verifyOtp = async (e) => {
    e.preventDefault();
    if (otp.length !== 6) { setErr('Enter the full 6-digit code.'); return; }
    setErr(''); setLoading(true);
    try {
      const r = await axios.post(`${API_URL}/auth/verify-login-otp`, { email, code: otp });
      const { token, user } = r.data;
      if (!token) throw new Error('Verification failed. Please try again.');
      localStorage.setItem('team_token', token);
      localStorage.setItem('team_user', JSON.stringify(user));
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      onAuth(user);
    } catch (ex) { setErr(ex.response?.data?.error || ex.message || 'Invalid code. Please try again.'); setOtp(''); }
    setLoading(false);
  };

  const resendOtp = async () => {
    setErr(''); setLoading(true);
    try { await axios.post(`${API_URL}/team/login`, { email, password }); }
    catch (ex) { setErr(ex.response?.data?.error || 'Could not resend code.'); }
    setLoading(false);
  };

  // Step 2b: new team member — set name + password
  const doSetup = async (e) => {
    e.preventDefault(); setErr('');
    if (password !== confirm) { setErr('Passwords do not match'); return; }
    if (password.length < 8) { setErr('Password must be at least 8 characters'); return; }
    if (!fullName.trim()) { setErr('Please enter your full name'); return; }
    setLoading(true);
    try {
      const r = await axios.post(`${API_URL}/team/setup-account`, { email, full_name: fullName.trim(), password });
      const { token, user } = r.data;
      if (!token) throw new Error('Setup failed — no token returned');
      localStorage.setItem('team_token', token);
      localStorage.setItem('team_user', JSON.stringify(user));
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      onAuth(user);
    } catch (ex) { setErr(ex.response?.data?.error || ex.message || 'Setup failed. Try again.'); }
    setLoading(false);
  };

  const bg = `linear-gradient(145deg,${C.forest} 0%,#0c2418 50%,${C.green} 100%)`;

  const Header = () => (
    <div className="text-center mb-8">
      <div className="inline-flex w-16 h-16 rounded-2xl items-center justify-center mb-3" style={{ backgroundColor: C.gold }}>
        <span className="text-3xl font-black" style={{ color: C.forest, fontFamily: 'Georgia,serif' }}>P</span>
      </div>
      <h1 className="text-white text-2xl font-black" style={{ fontFamily: 'Georgia,serif' }}>PRAQEN</h1>
      <p className="text-white/50 text-sm mt-1 font-semibold tracking-widest uppercase">Team Portal</p>
    </div>
  );

  const ErrBox = () => err ? (
    <div className="flex items-center gap-2 mb-4 px-3 py-2.5 rounded-xl text-sm"
      style={{ backgroundColor: '#FEF2F2', border: '1px solid #FCA5A5', color: '#991B1B' }}>
      <XCircle size={14} className="flex-shrink-0" /> {err}
    </div>
  ) : null;

  if (step === 'email') return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: bg }}>
      <div className="w-full max-w-sm">
        <Header />
        <form onSubmit={checkEmail} className="bg-white rounded-3xl p-8 shadow-2xl">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: C.purpleLight }}>
              <Shield size={20} style={{ color: C.purple }} />
            </div>
            <div>
              <h2 className="text-lg font-black" style={{ color: C.g800 }}>Team Access</h2>
              <p className="text-xs" style={{ color: C.g400 }}>Enter your work email to continue</p>
            </div>
          </div>
          <ErrBox />
          <div>
            <label className="text-xs font-bold block mb-1.5" style={{ color: C.g600 }}>Work Email</label>
            <input value={email} onChange={e => setEmail(e.target.value)} type="email" required autoFocus
              className="w-full px-4 py-3 rounded-xl border text-sm font-semibold outline-none"
              style={{ borderColor: C.g200, color: C.g800 }} placeholder="yourname@praqen.com" />
          </div>
          <button type="submit" disabled={loading}
            className="w-full mt-5 py-3.5 rounded-xl text-sm font-black flex items-center justify-center gap-2 transition"
            style={{ backgroundColor: loading ? C.g200 : C.purple, color: loading ? C.g400 : '#fff' }}>
            {loading ? <><RefreshCw size={14} className="animate-spin" /> Checking…</> : <>Continue →</>}
          </button>
        </form>
        <p className="text-center mt-6 text-white/30 text-xs">Restricted Access • All actions are logged</p>
      </div>
    </div>
  );

  if (step === 'login') return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: bg }}>
      <div className="w-full max-w-sm">
        <Header />
        <form onSubmit={doLogin} className="bg-white rounded-3xl p-8 shadow-2xl">
          <button type="button" onClick={() => { setStep('email'); setErr(''); }}
            className="flex items-center gap-1.5 text-xs font-bold mb-5" style={{ color: C.g400 }}>
            <ChevronLeft size={14} /> Back
          </button>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: C.purpleLight }}>
              <Lock size={20} style={{ color: C.purple }} />
            </div>
            <div>
              <h2 className="text-lg font-black" style={{ color: C.g800 }}>Welcome back</h2>
              <p className="text-xs truncate max-w-xs" style={{ color: C.g400 }}>{email}</p>
            </div>
          </div>
          <ErrBox />
          <div>
            <label className="text-xs font-bold block mb-1.5" style={{ color: C.g600 }}>Your Password</label>
            <input value={password} onChange={e => setPassword(e.target.value)} type="password" required autoFocus
              className="w-full px-4 py-3 rounded-xl border text-sm font-semibold outline-none"
              style={{ borderColor: C.g200, color: C.g800 }} placeholder="••••••••" />
          </div>
          <button type="submit" disabled={loading}
            className="w-full mt-5 py-3.5 rounded-xl text-sm font-black flex items-center justify-center gap-2 transition"
            style={{ backgroundColor: loading ? C.g200 : C.purple, color: loading ? C.g400 : '#fff' }}>
            {loading ? <><RefreshCw size={14} className="animate-spin" /> Signing in…</> : <><Lock size={14} /> Sign In</>}
          </button>
        </form>
        <p className="text-center mt-6 text-white/30 text-xs">Restricted Access • All actions are logged</p>
      </div>
    </div>
  );

  if (step === 'otp') return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: bg }}>
      <div className="w-full max-w-sm">
        <Header />
        <form onSubmit={verifyOtp} className="bg-white rounded-3xl p-8 shadow-2xl">
          <button type="button" onClick={() => { setStep('login'); setErr(''); }}
            className="flex items-center gap-1.5 text-xs font-bold mb-5" style={{ color: C.g400 }}>
            <ChevronLeft size={14} /> Back
          </button>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: C.purpleLight }}>
              <Shield size={20} style={{ color: C.purple }} />
            </div>
            <div>
              <h2 className="text-lg font-black" style={{ color: C.g800 }}>Check your email</h2>
              <p className="text-xs truncate max-w-xs" style={{ color: C.g400 }}>Code sent to {email}</p>
            </div>
          </div>
          <ErrBox />
          <div>
            <label className="text-xs font-bold block mb-1.5" style={{ color: C.g600 }}>6-Digit Code</label>
            <input value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, ''))} inputMode="numeric" maxLength={6} required autoFocus
              className="w-full px-4 py-3 rounded-xl border text-center text-2xl tracking-[0.5em] font-black outline-none"
              style={{ borderColor: C.g200, color: C.g800 }} placeholder="••••••" />
          </div>
          <button type="submit" disabled={loading || otp.length !== 6}
            className="w-full mt-5 py-3.5 rounded-xl text-sm font-black flex items-center justify-center gap-2 transition"
            style={{ backgroundColor: loading ? C.g200 : C.purple, color: loading ? C.g400 : '#fff' }}>
            {loading ? <><RefreshCw size={14} className="animate-spin" /> Verifying…</> : <><Lock size={14} /> Enter Team Portal</>}
          </button>
          <button type="button" onClick={resendOtp} disabled={loading}
            className="w-full mt-3 text-xs font-bold" style={{ color: C.purple }}>
            Resend code
          </button>
        </form>
        <p className="text-center mt-6 text-white/30 text-xs">Restricted Access • All actions are logged</p>
      </div>
    </div>
  );

  // step === 'setup'
  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: bg }}>
      <div className="w-full max-w-sm">
        <Header />
        <form onSubmit={doSetup} className="bg-white rounded-3xl p-8 shadow-2xl">
          <button type="button" onClick={() => { setStep('email'); setErr(''); }}
            className="flex items-center gap-1.5 text-xs font-bold mb-5" style={{ color: C.g400 }}>
            <ChevronLeft size={14} /> Back
          </button>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#F0FDF4' }}>
              <UserCheck size={20} style={{ color: C.forest }} />
            </div>
            <div>
              <h2 className="text-lg font-black" style={{ color: C.g800 }}>Create your account</h2>
              <p className="text-xs" style={{ color: C.g400 }}>First time? Set your name and password</p>
            </div>
          </div>
          <p className="text-xs mb-5 px-1" style={{ color: C.g500 }}>
            Signing up as <span className="font-bold" style={{ color: C.g700 }}>{email}</span>
          </p>
          <ErrBox />
          <div className="space-y-4">
            <div>
              <label className="text-xs font-bold block mb-1.5" style={{ color: C.g600 }}>Your Full Name</label>
              <input value={fullName} onChange={e => setFullName(e.target.value)} type="text" required autoFocus
                className="w-full px-4 py-3 rounded-xl border text-sm font-semibold outline-none"
                style={{ borderColor: C.g200, color: C.g800 }} placeholder="e.g. Kwame Mensah" />
            </div>
            <div>
              <label className="text-xs font-bold block mb-1.5" style={{ color: C.g600 }}>Create Password</label>
              <input value={password} onChange={e => setPassword(e.target.value)} type="password" required
                className="w-full px-4 py-3 rounded-xl border text-sm font-semibold outline-none"
                style={{ borderColor: C.g200, color: C.g800 }} placeholder="At least 8 characters" />
            </div>
            <div>
              <label className="text-xs font-bold block mb-1.5" style={{ color: C.g600 }}>Confirm Password</label>
              <input value={confirm} onChange={e => setConfirm(e.target.value)} type="password" required
                className="w-full px-4 py-3 rounded-xl border text-sm font-semibold outline-none"
                style={{ borderColor: confirm && confirm !== password ? C.danger : C.g200, color: C.g800 }} placeholder="Re-enter password" />
            </div>
          </div>
          <button type="submit" disabled={loading}
            className="w-full mt-5 py-3.5 rounded-xl text-sm font-black flex items-center justify-center gap-2 transition"
            style={{ backgroundColor: loading ? C.g200 : C.forest, color: loading ? C.g400 : '#fff' }}>
            {loading ? <><RefreshCw size={14} className="animate-spin" /> Creating…</> : <><UserCheck size={14} /> Create My Account</>}
          </button>
        </form>
        <p className="text-center mt-6 text-white/30 text-xs">Your password is encrypted and stored securely</p>
      </div>
    </div>
  );
}

// ================================================================
// PLATFORM STATS
// ================================================================
function PlatformStatsSection() {
  const token = localStorage.getItem('team_token') || localStorage.getItem('token');
  const cfg = { headers: { Authorization: `Bearer ${token}` } };
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [btcPrice, setBtcPrice] = useState(0);

  const load = useCallback(async () => {
    try {
      const [sRes, pRes] = await Promise.all([
        axios.get(`${API_URL}/team/platform-stats`, cfg),
        axios.get(`${API_URL}/btc-price`, cfg).catch(() => ({ data: { price: 0 } })),
      ]);
      setStats(sRes.data);
      setBtcPrice(pRes.data?.price || 0);
    } catch (err) { toast.error(err.response?.data?.error || 'Failed to load stats'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
    const iv = setInterval(load, 30000);
    return () => clearInterval(iv);
  }, [load]);

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: C.forest }} /></div>;

  const vol = parseFloat(stats?.totalVolumeBtc || 0);
  const volUsd = btcPrice > 0 ? `≈ $${(vol * btcPrice).toLocaleString('en-US', { maximumFractionDigits: 0 })}` : '';

  const cards = [
    { label: 'Total Users',      value: stats?.totalUsers?.toLocaleString(),  sub: `+${stats?.newToday} today · +${stats?.newThisWeek} this week`, color: C.forest, bg: '#F0FDF4', icon: Users },
    { label: 'Active Trades',    value: stats?.activeTrades?.toLocaleString(), sub: `${stats?.completedToday} completed today`, color: '#3B82F6', bg: '#EFF6FF', icon: Activity },
    { label: 'Total Trades',     value: stats?.totalTrades?.toLocaleString(),  sub: `All time`, color: '#8B5CF6', bg: '#F5F3FF', icon: ArrowLeftRight },
    { label: 'Open Disputes',    value: stats?.disputed?.toLocaleString(),     sub: 'Needs attention', color: stats?.disputed > 0 ? '#EF4444' : '#10B981', bg: stats?.disputed > 0 ? '#FEF2F2' : '#ECFDF5', icon: AlertTriangle },
    { label: 'KYC Pending',      value: stats?.kycPending?.toLocaleString(),   sub: 'Awaiting review', color: '#F59E0B', bg: '#FFFBEB', icon: Shield },
    { label: 'Banned Users',     value: stats?.bannedUsers?.toLocaleString(),  sub: 'Account restricted', color: '#EF4444', bg: '#FEF2F2', icon: UserX },
    { label: 'Trade Volume',     value: `₿${vol.toFixed(4)}`, sub: volUsd, color: C.gold, bg: '#FFFBEB', icon: TrendingUp },
    { label: 'Vol Today',        value: `₿${parseFloat(stats?.volumeTodayBtc || 0).toFixed(6)}`, sub: 'Completed trades', color: '#10B981', bg: '#ECFDF5', icon: BarChart2 },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-black" style={{ color: C.g800 }}>Platform Stats</h2>
          <p className="text-xs mt-0.5" style={{ color: C.g400 }}>Live overview · auto-updates every 30s</p>
        </div>
        <button onClick={load} className="p-2 rounded-xl border hover:bg-gray-50" style={{ borderColor: C.g200 }}><RefreshCw size={14} style={{ color: C.g500 }} /></button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {cards.map(({ label, value, sub, color, bg, icon: Icon }) => (
          <div key={label} className="bg-white rounded-2xl border p-4" style={{ borderColor: C.g200 }}>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ backgroundColor: bg }}><Icon size={15} style={{ color }} /></div>
              <p className="text-[10px] font-black uppercase tracking-wide" style={{ color: C.g500 }}>{label}</p>
            </div>
            <p className="text-2xl font-black" style={{ color }}>{value}</p>
            <p className="text-[10px] mt-0.5 font-semibold" style={{ color: C.g400 }}>{sub}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ================================================================
// ANNOUNCEMENTS
// ================================================================
const ANN_PRIORITIES = [
  { id: 'low',    label: 'Low',    color: '#6B7280', bg: '#F9FAFB' },
  { id: 'normal', label: 'Normal', color: '#3B82F6', bg: '#EFF6FF' },
  { id: 'high',   label: 'High',   color: '#F59E0B', bg: '#FFFBEB' },
  { id: 'urgent', label: 'Urgent', color: '#EF4444', bg: '#FEF2F2' },
];
const annPri = (id) => ANN_PRIORITIES.find(p => p.id === id) || ANN_PRIORITIES[1];

function AnnouncementsSection() {
  const token = localStorage.getItem('team_token') || localStorage.getItem('token');
  const cfg = { headers: { Authorization: `Bearer ${token}` } };
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: '', body: '', priority: 'normal' });
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(null);

  const load = useCallback(async () => {
    try { const { data } = await axios.get(`${API_URL}/team/announcements`, cfg); setItems(data.announcements || []); }
    catch (err) { toast.error(err.response?.data?.error || 'Failed to load'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openNew = () => { setForm({ title: '', body: '', priority: 'normal' }); setEditId(null); setShowForm(true); };
  const openEdit = (a) => { setForm({ title: a.title, body: a.body, priority: a.priority }); setEditId(a.id); setShowForm(true); };

  const save = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      if (editId) { const { data } = await axios.patch(`${API_URL}/team/announcements/${editId}`, form, cfg); setItems(i => i.map(a => a.id === editId ? data.announcement : a)); toast.success('Updated'); }
      else { const { data } = await axios.post(`${API_URL}/team/announcements`, form, cfg); setItems(i => [data.announcement, ...i]); toast.success('Posted'); }
      setShowForm(false);
    } catch (err) { toast.error(err.response?.data?.error || 'Failed'); }
    finally { setSaving(false); }
  };

  const togglePin = async (a) => {
    try { const { data } = await axios.patch(`${API_URL}/team/announcements/${a.id}`, { pinned: !a.pinned }, cfg); setItems(i => i.map(x => x.id === a.id ? data.announcement : x)); }
    catch (err) { toast.error('Failed to pin'); }
  };

  const remove = async (id) => {
    if (!window.confirm('Delete this announcement?')) return;
    try { await axios.delete(`${API_URL}/team/announcements/${id}`, cfg); setItems(i => i.filter(a => a.id !== id)); toast.success('Deleted'); }
    catch (err) { toast.error('Failed to delete'); }
  };

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: C.forest }} /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div><h2 className="text-lg font-black" style={{ color: C.g800 }}>Announcements</h2><p className="text-xs mt-0.5" style={{ color: C.g400 }}>Team notices, updates and pinned alerts</p></div>
        <button onClick={openNew} className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-white" style={{ backgroundColor: C.forest }}><Plus size={13} /> Post Announcement</button>
      </div>

      {showForm && (
        <form onSubmit={save} className="bg-white rounded-2xl border p-4 space-y-3" style={{ borderColor: C.forest }}>
          <p className="text-xs font-black uppercase tracking-wide" style={{ color: C.g500 }}>{editId ? 'Edit' : 'New'} Announcement</p>
          <div>
            <label className="block text-[10px] font-bold mb-1" style={{ color: C.g500 }}>Title *</label>
            <input required value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Announcement title" className="w-full px-3 py-2.5 text-sm rounded-xl border outline-none" style={{ borderColor: C.g200 }} />
          </div>
          <div>
            <label className="block text-[10px] font-bold mb-1" style={{ color: C.g500 }}>Message *</label>
            <textarea required value={form.body} onChange={e => setForm(f => ({ ...f, body: e.target.value }))} rows={4} placeholder="Write your announcement…" className="w-full px-3 py-2.5 text-sm rounded-xl border outline-none resize-none" style={{ borderColor: C.g200 }} />
          </div>
          <div>
            <label className="block text-[10px] font-bold mb-2" style={{ color: C.g500 }}>Priority</label>
            <div className="flex gap-2">
              {ANN_PRIORITIES.map(p => (
                <button key={p.id} type="button" onClick={() => setForm(f => ({ ...f, priority: p.id }))}
                  className="px-3 py-1 rounded-xl text-[11px] font-bold transition"
                  style={{ backgroundColor: form.priority === p.id ? p.color : p.bg, color: form.priority === p.id ? '#fff' : p.color }}>{p.label}</button>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="flex-1 py-2 rounded-xl text-xs font-bold text-white" style={{ backgroundColor: C.forest, opacity: saving ? 0.6 : 1 }}>{saving ? 'Saving…' : editId ? 'Update' : 'Post'}</button>
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 rounded-xl text-xs font-bold border" style={{ borderColor: C.g200, color: C.g500 }}>Cancel</button>
          </div>
        </form>
      )}

      {items.length === 0 && !showForm && (
        <div className="bg-white rounded-2xl border py-14 text-center" style={{ borderColor: C.g200 }}>
          <Megaphone size={32} className="mx-auto mb-2" style={{ color: C.g200 }} />
          <p className="text-sm font-bold" style={{ color: C.g400 }}>No announcements yet</p>
        </div>
      )}

      {items.map(a => {
        const pri = annPri(a.priority);
        const isOpen = expanded === a.id;
        return (
          <div key={a.id} className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: a.pinned ? C.forest : C.g200 }}>
            {a.pinned && <div className="flex items-center gap-1.5 px-4 py-1.5 text-[10px] font-black uppercase tracking-wide" style={{ backgroundColor: C.forest, color: '#fff' }}><Pin size={10} /> Pinned</div>}
            <div className="p-4">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-[10px] font-black px-2 py-0.5 rounded-full" style={{ backgroundColor: pri.bg, color: pri.color }}>{pri.label}</span>
                    <span className="text-[10px]" style={{ color: C.g400 }}>by {a.created_by} · {fmtDate(a.created_at)}</span>
                  </div>
                  <p className="font-black text-sm" style={{ color: C.g800 }}>{a.title}</p>
                  <p className="text-xs mt-1 leading-relaxed" style={{ color: C.g600, display: isOpen ? 'block' : '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{a.body}</p>
                  {a.body.length > 120 && <button onClick={() => setExpanded(isOpen ? null : a.id)} className="text-[10px] font-bold mt-1" style={{ color: C.forest }}>{isOpen ? 'Show less' : 'Read more'}</button>}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => togglePin(a)} className="p-1.5 rounded-lg hover:bg-gray-50" title={a.pinned ? 'Unpin' : 'Pin'} style={{ color: a.pinned ? C.forest : C.g300 }}><Pin size={13} /></button>
                  <button onClick={() => openEdit(a)} className="p-1.5 rounded-lg hover:bg-gray-50" style={{ color: C.g400 }}><Edit2 size={13} /></button>
                  <button onClick={() => remove(a.id)} className="p-1.5 rounded-lg hover:bg-gray-50" style={{ color: '#EF4444' }}><Trash2 size={13} /></button>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ================================================================
// TASK MANAGER
// ================================================================
const TASK_COLS = [
  { id: 'todo',        label: 'To Do',       color: '#6B7280', bg: '#F9FAFB' },
  { id: 'in-progress', label: 'In Progress', color: '#3B82F6', bg: '#EFF6FF' },
  { id: 'done',        label: 'Done',        color: '#10B981', bg: '#ECFDF5' },
];
const TASK_PRIORITIES = [
  { id: 'low',    label: 'Low',    color: '#6B7280' },
  { id: 'medium', label: 'Medium', color: '#F59E0B' },
  { id: 'high',   label: 'High',   color: '#EF4444' },
  { id: 'urgent', label: 'Urgent', color: '#7C3AED' },
];
const tPri = (id) => TASK_PRIORITIES.find(p => p.id === id) || TASK_PRIORITIES[1];

function TaskManagerSection() {
  const token = localStorage.getItem('team_token') || localStorage.getItem('token');
  const cfg = { headers: { Authorization: `Bearer ${token}` } };
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', assigned_to: '', priority: 'medium', due_date: '' });
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try { const { data } = await axios.get(`${API_URL}/team/tasks`, cfg); setTasks(data.tasks || []); }
    catch (err) { toast.error(err.response?.data?.error || 'Failed to load tasks'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openNew = () => { setForm({ title: '', description: '', assigned_to: '', priority: 'medium', due_date: '' }); setEditId(null); setShowForm(true); };
  const openEdit = (t) => { setForm({ title: t.title, description: t.description || '', assigned_to: t.assigned_to || '', priority: t.priority, due_date: t.due_date || '' }); setEditId(t.id); setShowForm(true); };

  const save = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      if (editId) { const { data } = await axios.patch(`${API_URL}/team/tasks/${editId}`, form, cfg); setTasks(ts => ts.map(t => t.id === editId ? data.task : t)); toast.success('Task updated'); }
      else { const { data } = await axios.post(`${API_URL}/team/tasks`, form, cfg); setTasks(ts => [data.task, ...ts]); toast.success('Task created'); }
      setShowForm(false);
    } catch (err) { toast.error(err.response?.data?.error || 'Failed'); }
    finally { setSaving(false); }
  };

  const move = async (id, status) => {
    try { const { data } = await axios.patch(`${API_URL}/team/tasks/${id}`, { status }, cfg); setTasks(ts => ts.map(t => t.id === id ? data.task : t)); }
    catch (err) { toast.error('Failed to move task'); }
  };

  const remove = async (id) => {
    if (!window.confirm('Delete task?')) return;
    try { await axios.delete(`${API_URL}/team/tasks/${id}`, cfg); setTasks(ts => ts.filter(t => t.id !== id)); toast.success('Deleted'); }
    catch (err) { toast.error('Failed'); }
  };

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: C.forest }} /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div><h2 className="text-lg font-black" style={{ color: C.g800 }}>Task Manager</h2><p className="text-xs mt-0.5" style={{ color: C.g400 }}>Assign and track team tasks</p></div>
        <button onClick={openNew} className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-white" style={{ backgroundColor: C.forest }}><Plus size={13} /> New Task</button>
      </div>

      {showForm && (
        <form onSubmit={save} className="bg-white rounded-2xl border p-4 space-y-3" style={{ borderColor: C.forest }}>
          <p className="text-xs font-black uppercase tracking-wide" style={{ color: C.g500 }}>{editId ? 'Edit' : 'New'} Task</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-[10px] font-bold mb-1" style={{ color: C.g500 }}>Task Title *</label>
              <input required value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="What needs to be done?" className="w-full px-3 py-2.5 text-sm rounded-xl border outline-none" style={{ borderColor: C.g200 }} />
            </div>
            <div>
              <label className="block text-[10px] font-bold mb-1" style={{ color: C.g500 }}>Assign To</label>
              <input value={form.assigned_to} onChange={e => setForm(f => ({ ...f, assigned_to: e.target.value }))} placeholder="Team member name" className="w-full px-3 py-2.5 text-sm rounded-xl border outline-none" style={{ borderColor: C.g200 }} />
            </div>
            <div>
              <label className="block text-[10px] font-bold mb-1" style={{ color: C.g500 }}>Due Date</label>
              <input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} className="w-full px-3 py-2.5 text-sm rounded-xl border outline-none" style={{ borderColor: C.g200 }} />
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-bold mb-2" style={{ color: C.g500 }}>Priority</label>
            <div className="flex gap-2">
              {TASK_PRIORITIES.map(p => (
                <button key={p.id} type="button" onClick={() => setForm(f => ({ ...f, priority: p.id }))}
                  className="px-3 py-1 rounded-xl text-[11px] font-bold border transition"
                  style={{ backgroundColor: form.priority === p.id ? p.color : 'transparent', borderColor: p.color, color: form.priority === p.id ? '#fff' : p.color }}>{p.label}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-bold mb-1" style={{ color: C.g500 }}>Description</label>
            <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} placeholder="Additional details…" className="w-full px-3 py-2.5 text-sm rounded-xl border outline-none resize-none" style={{ borderColor: C.g200 }} />
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="flex-1 py-2 rounded-xl text-xs font-bold text-white" style={{ backgroundColor: C.forest, opacity: saving ? 0.6 : 1 }}>{saving ? 'Saving…' : editId ? 'Update Task' : 'Create Task'}</button>
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 rounded-xl text-xs font-bold border" style={{ borderColor: C.g200, color: C.g500 }}>Cancel</button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-3 gap-4" style={{ minHeight: 300 }}>
        {TASK_COLS.map(col => {
          const colTasks = tasks.filter(t => t.status === col.id);
          return (
            <div key={col.id} className="rounded-2xl border overflow-hidden" style={{ borderColor: C.g200, backgroundColor: col.bg }}>
              <div className="flex items-center gap-2 px-4 py-3 border-b" style={{ borderColor: C.g100 }}>
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: col.color }} />
                <p className="text-xs font-black" style={{ color: C.g700 }}>{col.label}</p>
                <span className="ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: col.color + '20', color: col.color }}>{colTasks.length}</span>
              </div>
              <div className="p-2 space-y-2">
                {colTasks.map(t => {
                  const pri = tPri(t.priority);
                  const isOverdue = t.due_date && new Date(t.due_date) < new Date() && t.status !== 'done';
                  return (
                    <div key={t.id} className="bg-white rounded-xl p-3 shadow-sm">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-xs font-black leading-snug" style={{ color: C.g800 }}>{t.title}</p>
                        <div className="flex gap-1 flex-shrink-0">
                          <button onClick={() => openEdit(t)} className="p-1 rounded" style={{ color: C.g300 }}><Edit2 size={11} /></button>
                          <button onClick={() => remove(t.id)} className="p-1 rounded" style={{ color: '#EF4444' }}><Trash2 size={11} /></button>
                        </div>
                      </div>
                      {t.description && <p className="text-[10px] mt-1 leading-snug" style={{ color: C.g400 }}>{t.description}</p>}
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <span className="text-[10px] font-bold" style={{ color: pri.color }}>● {pri.label}</span>
                        {t.assigned_to && <span className="text-[10px] font-semibold" style={{ color: C.g500 }}>→ {t.assigned_to}</span>}
                        {t.due_date && <span className="text-[10px] font-semibold" style={{ color: isOverdue ? '#EF4444' : C.g400 }}>{isOverdue ? '⚠ ' : ''}{fmtDate(t.due_date)}</span>}
                      </div>
                      <div className="flex gap-1 mt-2">
                        {TASK_COLS.filter(cc => cc.id !== col.id).map(cc => (
                          <button key={cc.id} onClick={() => move(t.id, cc.id)}
                            className="flex-1 py-0.5 rounded-lg text-[9px] font-bold transition"
                            style={{ backgroundColor: cc.bg, color: cc.color }}>→ {cc.label}</button>
                        ))}
                      </div>
                    </div>
                  );
                })}
                {colTasks.length === 0 && <p className="text-[10px] text-center py-6 font-semibold" style={{ color: C.g300 }}>No tasks</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ================================================================
// ACTIVITY LOG
// ================================================================
const LOG_CATS = [
  { id: 'general',  label: 'General',  color: '#6B7280', bg: '#F9FAFB' },
  { id: 'trade',    label: 'Trade',    color: '#3B82F6', bg: '#EFF6FF' },
  { id: 'finance',  label: 'Finance',  color: '#10B981', bg: '#ECFDF5' },
  { id: 'user',     label: 'User',     color: '#8B5CF6', bg: '#F5F3FF' },
  { id: 'dispute',  label: 'Dispute',  color: '#EF4444', bg: '#FEF2F2' },
];
const logCat = (id) => LOG_CATS.find(c => c.id === id) || LOG_CATS[0];

function ActivityLogSection() {
  const token = localStorage.getItem('team_token') || localStorage.getItem('token');
  const cfg = { headers: { Authorization: `Bearer ${token}` } };
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [showLogForm, setShowLogForm] = useState(false);
  const [logForm, setLogForm] = useState({ action: '', details: '', category: 'general' });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try { const { data } = await axios.get(`${API_URL}/team/activity-log`, cfg); setLogs(data.logs || []); }
    catch (err) { toast.error(err.response?.data?.error || 'Failed to load log'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const addLog = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      const { data } = await axios.post(`${API_URL}/team/activity-log`, logForm, cfg);
      setLogs(l => [data.log, ...l]);
      setLogForm({ action: '', details: '', category: 'general' });
      setShowLogForm(false);
      toast.success('Logged');
    } catch (err) { toast.error(err.response?.data?.error || 'Failed'); }
    finally { setSaving(false); }
  };

  const filtered = filter === 'all' ? logs : logs.filter(l => l.category === filter);

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: C.forest }} /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div><h2 className="text-lg font-black" style={{ color: C.g800 }}>Activity Log</h2><p className="text-xs mt-0.5" style={{ color: C.g400 }}>Audit trail of team actions</p></div>
        <div className="flex gap-2">
          <button onClick={load} className="p-2 rounded-xl border hover:bg-gray-50" style={{ borderColor: C.g200 }}><RefreshCw size={14} style={{ color: C.g500 }} /></button>
          <button onClick={() => setShowLogForm(v => !v)} className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-white" style={{ backgroundColor: C.forest }}><Plus size={13} /> Log Action</button>
        </div>
      </div>

      {showLogForm && (
        <form onSubmit={addLog} className="bg-white rounded-2xl border p-4 space-y-3" style={{ borderColor: C.forest }}>
          <p className="text-xs font-black uppercase tracking-wide" style={{ color: C.g500 }}>Log a Team Action</p>
          <div>
            <label className="block text-[10px] font-bold mb-1" style={{ color: C.g500 }}>Category</label>
            <div className="flex flex-wrap gap-2">
              {LOG_CATS.map(cat => (
                <button key={cat.id} type="button" onClick={() => setLogForm(f => ({ ...f, category: cat.id }))}
                  className="px-3 py-1 rounded-xl text-[11px] font-bold"
                  style={{ backgroundColor: logForm.category === cat.id ? cat.color : cat.bg, color: logForm.category === cat.id ? '#fff' : cat.color }}>{cat.label}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-bold mb-1" style={{ color: C.g500 }}>Action *</label>
            <input required value={logForm.action} onChange={e => setLogForm(f => ({ ...f, action: e.target.value }))} placeholder="e.g. Resolved trade dispute #ABC123" className="w-full px-3 py-2.5 text-sm rounded-xl border outline-none" style={{ borderColor: C.g200 }} />
          </div>
          <div>
            <label className="block text-[10px] font-bold mb-1" style={{ color: C.g500 }}>Details</label>
            <textarea value={logForm.details} onChange={e => setLogForm(f => ({ ...f, details: e.target.value }))} rows={2} placeholder="Additional context…" className="w-full px-3 py-2.5 text-sm rounded-xl border outline-none resize-none" style={{ borderColor: C.g200 }} />
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="flex-1 py-2 rounded-xl text-xs font-bold text-white" style={{ backgroundColor: C.forest, opacity: saving ? 0.6 : 1 }}>{saving ? 'Logging…' : 'Add to Log'}</button>
            <button type="button" onClick={() => setShowLogForm(false)} className="px-4 py-2 rounded-xl text-xs font-bold border" style={{ borderColor: C.g200, color: C.g500 }}>Cancel</button>
          </div>
        </form>
      )}

      <div className="flex gap-2 overflow-x-auto pb-1">
        {[{ id: 'all', label: 'All' }, ...LOG_CATS].map(cat => (
          <button key={cat.id} onClick={() => setFilter(cat.id)}
            className="px-3 py-1.5 rounded-xl text-[11px] font-bold whitespace-nowrap transition"
            style={{ backgroundColor: filter === cat.id ? C.forest : 'white', color: filter === cat.id ? '#fff' : C.g500, border: `1px solid ${C.g200}` }}>{cat.label}</button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border py-14 text-center" style={{ borderColor: C.g200 }}>
          <FileText size={32} className="mx-auto mb-2" style={{ color: C.g200 }} />
          <p className="text-sm font-bold" style={{ color: C.g400 }}>No activity logged yet</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: C.g200 }}>
          {filtered.map((log, i) => {
            const cat = logCat(log.category);
            return (
              <div key={log.id} className="flex items-start gap-3 px-4 py-3" style={{ borderTop: i > 0 ? `1px solid ${C.g100}` : 'none' }}>
                <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5" style={{ backgroundColor: cat.bg }}>
                  <Activity size={12} style={{ color: cat.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-black" style={{ color: C.g800 }}>{log.actor}</span>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: cat.bg, color: cat.color }}>{cat.label}</span>
                    <span className="text-[10px]" style={{ color: C.g400 }}>{new Date(log.created_at).toLocaleString()}</span>
                  </div>
                  <p className="text-xs mt-0.5" style={{ color: C.g700 }}>{log.action}</p>
                  {log.details && <p className="text-[10px] mt-0.5 italic" style={{ color: C.g400 }}>{log.details}</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ================================================================
// RISK MONITOR
// ================================================================
function RiskMonitorSection() {
  const token = localStorage.getItem('team_token') || localStorage.getItem('token');
  const cfg = { headers: { Authorization: `Bearer ${token}` } };
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('banned');

  const load = useCallback(async () => {
    try { const { data: d } = await axios.get(`${API_URL}/team/risk-monitor`, cfg); setData(d); }
    catch (err) { toast.error(err.response?.data?.error || 'Failed to load'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const unban = async (id) => {
    if (!window.confirm('Unban this user?')) return;
    try { await axios.post(`${API_URL}/team/risk-monitor/unban/${id}`, {}, cfg); toast.success('User unbanned'); load(); }
    catch (err) { toast.error('Failed'); }
  };

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: C.forest }} /></div>;

  const tabs = [
    { id: 'banned',   label: `Banned (${data?.banned?.length || 0})`,      color: '#EF4444' },
    { id: 'kycfail',  label: `KYC Rejected (${data?.kycFail?.length || 0})`, color: '#F59E0B' },
    { id: 'disputed', label: `Open Disputes (${data?.disputed?.length || 0})`, color: '#8B5CF6' },
  ];

  const rows = tab === 'banned' ? data?.banned || [] : tab === 'kycfail' ? data?.kycFail || [] : data?.disputed || [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div><h2 className="text-lg font-black" style={{ color: C.g800 }}>Risk Monitor</h2><p className="text-xs mt-0.5" style={{ color: C.g400 }}>Flagged accounts, rejected KYC and open disputes</p></div>
        <button onClick={load} className="p-2 rounded-xl border hover:bg-gray-50" style={{ borderColor: C.g200 }}><RefreshCw size={14} style={{ color: C.g500 }} /></button>
      </div>

      <div className="flex rounded-2xl overflow-hidden border" style={{ borderColor: C.g200 }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} className="flex-1 py-2.5 text-xs font-black transition"
            style={{ backgroundColor: tab === t.id ? t.color : 'white', color: tab === t.id ? '#fff' : C.g500 }}>{t.label}</button>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="bg-white rounded-2xl border py-12 text-center" style={{ borderColor: C.g200 }}>
          <CheckCircle size={32} className="mx-auto mb-2" style={{ color: '#10B981' }} />
          <p className="text-sm font-bold" style={{ color: C.g400 }}>All clear — nothing to review</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: C.g200 }}>
          {rows.map((r, i) => (
            <div key={r.id} className="flex items-center gap-3 px-4 py-3" style={{ borderTop: i > 0 ? `1px solid ${C.g100}` : 'none' }}>
              <div className="w-8 h-8 rounded-full flex items-center justify-center font-black text-xs flex-shrink-0" style={{ backgroundColor: C.g100, color: C.g600 }}>
                {(r.username || r.id || '?')[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-black" style={{ color: C.g800 }}>{r.username || `Trade ${r.id?.slice(0, 8)}`}</p>
                <p className="text-[10px]" style={{ color: C.g400 }}>
                  {tab === 'banned' && `${r.email} · ${r.total_trades || 0} trades · ${r.country || '—'}`}
                  {tab === 'kycfail' && `${r.email} · ${r.country || '—'}`}
                  {tab === 'disputed' && `₿${parseFloat(r.btc_amount || 0).toFixed(6)} · ${fmtDate(r.created_at)}`}
                </p>
              </div>
              {tab === 'banned' && (
                <button onClick={() => unban(r.id)} className="px-3 py-1 rounded-xl text-[11px] font-bold" style={{ backgroundColor: '#ECFDF5', color: '#10B981' }}>Unban</button>
              )}
              <span className="text-[10px]" style={{ color: C.g400 }}>{fmtDate(r.created_at)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ================================================================
// TEAM SHIFTS / SCHEDULE
// ================================================================
const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];

function ShiftsSection() {
  const token = localStorage.getItem('team_token') || localStorage.getItem('token');
  const cfg = { headers: { Authorization: `Bearer ${token}` } };
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ member_name: '', day_of_week: 'Monday', start_time: '09:00', end_time: '17:00', timezone: 'WAT', notes: '' });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try { const { data } = await axios.get(`${API_URL}/team/shifts`, cfg); setShifts(data.shifts || []); }
    catch (err) { toast.error(err.response?.data?.error || 'Failed to load shifts'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async (e) => {
    e.preventDefault(); setSaving(true);
    try { const { data } = await axios.post(`${API_URL}/team/shifts`, form, cfg); setShifts(s => [...s, data.shift]); setShowForm(false); toast.success('Shift added'); }
    catch (err) { toast.error(err.response?.data?.error || 'Failed'); }
    finally { setSaving(false); }
  };

  const remove = async (id) => {
    try { await axios.delete(`${API_URL}/team/shifts/${id}`, cfg); setShifts(s => s.filter(sh => sh.id !== id)); toast.success('Removed'); }
    catch (err) { toast.error('Failed'); }
  };

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: C.forest }} /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div><h2 className="text-lg font-black" style={{ color: C.g800 }}>Team Schedule</h2><p className="text-xs mt-0.5" style={{ color: C.g400 }}>Weekly shift coverage for all team members</p></div>
        <button onClick={() => setShowForm(v => !v)} className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-white" style={{ backgroundColor: C.forest }}><Plus size={13} /> Add Shift</button>
      </div>

      {showForm && (
        <form onSubmit={save} className="bg-white rounded-2xl border p-4 space-y-3" style={{ borderColor: C.forest }}>
          <p className="text-xs font-black uppercase tracking-wide" style={{ color: C.g500 }}>New Shift</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-[10px] font-bold mb-1" style={{ color: C.g500 }}>Team Member Name *</label>
              <input required value={form.member_name} onChange={e => setForm(f => ({ ...f, member_name: e.target.value }))} placeholder="Full name" className="w-full px-3 py-2.5 text-sm rounded-xl border outline-none" style={{ borderColor: C.g200 }} />
            </div>
            <div>
              <label className="block text-[10px] font-bold mb-1" style={{ color: C.g500 }}>Day</label>
              <select value={form.day_of_week} onChange={e => setForm(f => ({ ...f, day_of_week: e.target.value }))} className="w-full px-3 py-2.5 text-sm rounded-xl border outline-none" style={{ borderColor: C.g200 }}>
                {DAYS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold mb-1" style={{ color: C.g500 }}>Timezone</label>
              <input value={form.timezone} onChange={e => setForm(f => ({ ...f, timezone: e.target.value }))} placeholder="WAT, GMT, EST…" className="w-full px-3 py-2.5 text-sm rounded-xl border outline-none" style={{ borderColor: C.g200 }} />
            </div>
            <div>
              <label className="block text-[10px] font-bold mb-1" style={{ color: C.g500 }}>Start Time</label>
              <input type="time" value={form.start_time} onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))} className="w-full px-3 py-2.5 text-sm rounded-xl border outline-none" style={{ borderColor: C.g200 }} />
            </div>
            <div>
              <label className="block text-[10px] font-bold mb-1" style={{ color: C.g500 }}>End Time</label>
              <input type="time" value={form.end_time} onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))} className="w-full px-3 py-2.5 text-sm rounded-xl border outline-none" style={{ borderColor: C.g200 }} />
            </div>
            <div className="col-span-2">
              <label className="block text-[10px] font-bold mb-1" style={{ color: C.g500 }}>Notes</label>
              <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="e.g. On call for disputes" className="w-full px-3 py-2.5 text-sm rounded-xl border outline-none" style={{ borderColor: C.g200 }} />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="flex-1 py-2 rounded-xl text-xs font-bold text-white" style={{ backgroundColor: C.forest, opacity: saving ? 0.6 : 1 }}>{saving ? 'Saving…' : 'Add Shift'}</button>
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 rounded-xl text-xs font-bold border" style={{ borderColor: C.g200, color: C.g500 }}>Cancel</button>
          </div>
        </form>
      )}

      <div className="overflow-x-auto">
        <table className="w-full" style={{ minWidth: 600 }}>
          <thead>
            <tr>
              {DAYS.map(d => (
                <th key={d} className="px-2 py-2 text-[10px] font-black uppercase tracking-wide text-center" style={{ color: C.g500 }}>{d.slice(0, 3)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(() => {
              const members = [...new Set(shifts.map(s => s.member_name))];
              if (members.length === 0) return (
                <tr><td colSpan={7} className="py-10 text-center text-xs font-semibold" style={{ color: C.g400 }}>No shifts scheduled yet</td></tr>
              );
              return members.map(member => (
                <tr key={member}>
                  {DAYS.map(day => {
                    const sh = shifts.filter(s => s.member_name === member && s.day_of_week === day);
                    return (
                      <td key={day} className="px-1 py-1 align-top">
                        {sh.map(s => (
                          <div key={s.id} className="rounded-xl p-2 mb-1" style={{ backgroundColor: C.forest + '15', borderLeft: `3px solid ${C.forest}` }}>
                            <p className="text-[10px] font-black truncate" style={{ color: C.forest }}>{s.member_name}</p>
                            <p className="text-[9px] font-semibold" style={{ color: C.g500 }}>{s.start_time}–{s.end_time}</p>
                            <p className="text-[9px]" style={{ color: C.g400 }}>{s.timezone}</p>
                            {s.notes && <p className="text-[9px] italic mt-0.5" style={{ color: C.g400 }}>{s.notes}</p>}
                            <button onClick={() => remove(s.id)} className="mt-1 text-[9px] font-bold" style={{ color: '#EF4444' }}>Remove</button>
                          </div>
                        ))}
                      </td>
                    );
                  })}
                </tr>
              ));
            })()}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ================================================================
// KNOWLEDGE BASE
// ================================================================
const KB_CATS = ['General','Policy','Procedures','Technical','FAQ','Legal','Onboarding'];

function KnowledgeBaseSection() {
  const token = localStorage.getItem('team_token') || localStorage.getItem('token');
  const cfg = { headers: { Authorization: `Bearer ${token}` } };
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: '', category: 'General', content: '', tags: '' });
  const [editId, setEditId] = useState(null);
  const [viewArt, setViewArt] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try { const { data } = await axios.get(`${API_URL}/team/knowledge-base`, cfg); setArticles(data.articles || []); }
    catch (err) { toast.error(err.response?.data?.error || 'Failed to load'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openNew = () => { setForm({ title: '', category: 'General', content: '', tags: '' }); setEditId(null); setShowForm(true); setViewArt(null); };
  const openEdit = (a) => { setForm({ title: a.title, category: a.category, content: a.content, tags: a.tags || '' }); setEditId(a.id); setShowForm(true); setViewArt(null); };

  const save = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      if (editId) { const { data } = await axios.patch(`${API_URL}/team/knowledge-base/${editId}`, form, cfg); setArticles(a => a.map(x => x.id === editId ? data.article : x)); toast.success('Updated'); }
      else { const { data } = await axios.post(`${API_URL}/team/knowledge-base`, form, cfg); setArticles(a => [data.article, ...a]); toast.success('Article added'); }
      setShowForm(false);
    } catch (err) { toast.error(err.response?.data?.error || 'Failed'); }
    finally { setSaving(false); }
  };

  const remove = async (id) => {
    if (!window.confirm('Delete this article?')) return;
    try { await axios.delete(`${API_URL}/team/knowledge-base/${id}`, cfg); setArticles(a => a.filter(x => x.id !== id)); setViewArt(null); toast.success('Deleted'); }
    catch (err) { toast.error('Failed'); }
  };

  const filtered = articles.filter(a => {
    const q = search.toLowerCase();
    return (!q || a.title?.toLowerCase().includes(q) || a.content?.toLowerCase().includes(q) || a.tags?.toLowerCase().includes(q))
      && (catFilter === 'all' || a.category === catFilter);
  });

  const cats = [...new Set(articles.map(a => a.category))];

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: C.forest }} /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div><h2 className="text-lg font-black" style={{ color: C.g800 }}>Knowledge Base</h2><p className="text-xs mt-0.5" style={{ color: C.g400 }}>SOPs, policies and team guides</p></div>
        <button onClick={openNew} className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-white" style={{ backgroundColor: C.forest }}><Plus size={13} /> New Article</button>
      </div>

      <div className="flex gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-1 min-w-0 bg-white border rounded-xl px-3 py-2" style={{ borderColor: C.g200 }}>
          <Search size={13} style={{ color: C.g400 }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search articles…" className="flex-1 text-xs outline-none bg-transparent" />
          {search && <button onClick={() => setSearch('')}><X size={12} style={{ color: C.g400 }} /></button>}
        </div>
        <select value={catFilter} onChange={e => setCatFilter(e.target.value)} className="bg-white border rounded-xl px-3 py-2 text-xs font-bold outline-none" style={{ borderColor: C.g200, color: C.g500 }}>
          <option value="all">All Categories</option>
          {cats.map(cat => <option key={cat} value={cat}>{cat}</option>)}
        </select>
      </div>

      {showForm && (
        <form onSubmit={save} className="bg-white rounded-2xl border p-4 space-y-3" style={{ borderColor: C.forest }}>
          <p className="text-xs font-black uppercase tracking-wide" style={{ color: C.g500 }}>{editId ? 'Edit' : 'New'} Article</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-[10px] font-bold mb-1" style={{ color: C.g500 }}>Title *</label>
              <input required value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Article title" className="w-full px-3 py-2.5 text-sm rounded-xl border outline-none" style={{ borderColor: C.g200 }} />
            </div>
            <div>
              <label className="block text-[10px] font-bold mb-1" style={{ color: C.g500 }}>Category</label>
              <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} className="w-full px-3 py-2.5 text-sm rounded-xl border outline-none" style={{ borderColor: C.g200 }}>
                {KB_CATS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold mb-1" style={{ color: C.g500 }}>Tags</label>
              <input value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))} placeholder="e.g. dispute, refund, kyc" className="w-full px-3 py-2.5 text-sm rounded-xl border outline-none" style={{ borderColor: C.g200 }} />
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-bold mb-1" style={{ color: C.g500 }}>Content *</label>
            <textarea required value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))} rows={8} placeholder="Write your article here… use plain text, numbered steps, bullet points, etc." className="w-full px-3 py-2.5 text-sm rounded-xl border outline-none resize-none font-mono leading-relaxed" style={{ borderColor: C.g200 }} />
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="flex-1 py-2 rounded-xl text-xs font-bold text-white" style={{ backgroundColor: C.forest, opacity: saving ? 0.6 : 1 }}>{saving ? 'Saving…' : editId ? 'Update Article' : 'Publish Article'}</button>
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 rounded-xl text-xs font-bold border" style={{ borderColor: C.g200, color: C.g500 }}>Cancel</button>
          </div>
        </form>
      )}

      {viewArt && !showForm && (
        <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: C.g200 }}>
          <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: C.g100 }}>
            <div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full mr-2" style={{ backgroundColor: '#F0FDF4', color: C.forest }}>{viewArt.category}</span>
              <span className="text-[10px]" style={{ color: C.g400 }}>by {viewArt.created_by} · {fmtDate(viewArt.updated_at)}</span>
            </div>
            <div className="flex gap-2">
              <button onClick={() => openEdit(viewArt)} className="p-1.5 rounded-lg border" style={{ borderColor: C.g200, color: C.g500 }}><Edit2 size={13} /></button>
              <button onClick={() => remove(viewArt.id)} className="p-1.5 rounded-lg border" style={{ borderColor: '#FCA5A5', color: '#EF4444' }}><Trash2 size={13} /></button>
              <button onClick={() => setViewArt(null)} className="p-1.5 rounded-lg border" style={{ borderColor: C.g200, color: C.g500 }}><X size={13} /></button>
            </div>
          </div>
          <div className="px-5 py-4">
            <h3 className="text-lg font-black mb-3" style={{ color: C.g800 }}>{viewArt.title}</h3>
            <pre className="text-xs leading-relaxed whitespace-pre-wrap" style={{ color: C.g700, fontFamily: 'inherit' }}>{viewArt.content}</pre>
            {viewArt.tags && <div className="flex flex-wrap gap-1.5 mt-4">{viewArt.tags.split(',').map(tag => tag.trim()).filter(Boolean).map(tag => <span key={tag} className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: C.g100, color: C.g500 }}>#{tag}</span>)}</div>}
          </div>
        </div>
      )}

      {filtered.length === 0 && !showForm ? (
        <div className="bg-white rounded-2xl border py-14 text-center" style={{ borderColor: C.g200 }}>
          <FileText size={32} className="mx-auto mb-2" style={{ color: C.g200 }} />
          <p className="text-sm font-bold" style={{ color: C.g400 }}>{articles.length === 0 ? 'No articles yet — write the first one' : 'No results'}</p>
        </div>
      ) : (
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(min(260px,100%),1fr))' }}>
          {filtered.map(a => (
            <div key={a.id} onClick={() => { setViewArt(a); setShowForm(false); }} className="bg-white rounded-2xl border p-4 cursor-pointer hover:shadow-md transition-shadow" style={{ borderColor: C.g200 }}>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: '#F0FDF4', color: C.forest }}>{a.category}</span>
              </div>
              <p className="font-black text-sm mb-1" style={{ color: C.g800 }}>{a.title}</p>
              <p className="text-[11px] leading-relaxed" style={{ color: C.g500, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{a.content}</p>
              {a.tags && <div className="flex flex-wrap gap-1 mt-2">{a.tags.split(',').map(t => t.trim()).filter(Boolean).map(tag => <span key={tag} className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: C.g100, color: C.g500 }}>#{tag}</span>)}</div>}
              <p className="text-[10px] mt-2" style={{ color: C.g400 }}>{fmtDate(a.updated_at)} · {a.created_by}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ================================================================
// ACTIVE OFFERS
// ================================================================
function ActiveOffersSection() {
  const token = localStorage.getItem('team_token') || localStorage.getItem('token');
  const cfg   = { headers: { Authorization: `Bearer ${token}` } };

  const [data, setData]           = useState(null);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [typeFilter, setTypeFilter] = useState('all');  // all | btc | giftcard
  const [view, setView]           = useState('offers'); // offers | users
  const [expanded, setExpanded]   = useState(null);

  const load = useCallback(async () => {
    try {
      const { data: d } = await axios.get(`${API_URL}/team/active-offers`, cfg);
      setData(d);
    } catch (err) { toast.error(err.response?.data?.error || 'Failed to load active offers'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); const iv = setInterval(load, 60000); return () => clearInterval(iv); }, [load]);

  const isGiftCard = (o) => o.listing_type === 'GIFT_CARD' || o.gift_card_brand || o.card_type;

  const filtered = (data?.offers || []).filter(o => {
    const q = search.toLowerCase();
    const matchSearch = !q
      || o.seller?.username?.toLowerCase().includes(q)
      || o.payment_method?.toLowerCase().includes(q)
      || o.gift_card_brand?.toLowerCase().includes(q)
      || o.country_name?.toLowerCase().includes(q);
    const matchType = typeFilter === 'all'
      || (typeFilter === 'btc' && !isGiftCard(o))
      || (typeFilter === 'giftcard' && isGiftCard(o));
    return matchSearch && matchType;
  });

  const filteredByUser = (data?.byUser || []).map(({ user, offers }) => ({
    user,
    offers: offers.filter(o => {
      const q = search.toLowerCase();
      const matchSearch = !q || user?.username?.toLowerCase().includes(q) || o.payment_method?.toLowerCase().includes(q);
      const matchType = typeFilter === 'all' || (typeFilter === 'btc' && !isGiftCard(o)) || (typeFilter === 'giftcard' && isGiftCard(o));
      return matchSearch && matchType;
    }),
  })).filter(({ offers }) => offers.length > 0);

  const btcCount  = (data?.offers || []).filter(o => !isGiftCard(o)).length;
  const gcCount   = (data?.offers || []).filter(o =>  isGiftCard(o)).length;

  const lastSeen = (ts) => {
    if (!ts) return 'Unknown';
    const mins = Math.floor((Date.now() - new Date(ts)) / 60000);
    if (mins < 2)   return 'Online now';
    if (mins < 60)  return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24)   return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  const onlineColor = (ts) => {
    if (!ts) return C.g300;
    const mins = (Date.now() - new Date(ts)) / 60000;
    if (mins < 10)  return '#10B981';
    if (mins < 60)  return '#F59E0B';
    return C.g300;
  };

  const AvatarBubble = ({ u, size = 36 }) => (
    u?.avatar_url
      ? <img src={u.avatar_url} alt={u.username} className="rounded-full object-cover flex-shrink-0" style={{ width: size, height: size }} />
      : <div className="rounded-full flex items-center justify-center font-black flex-shrink-0" style={{ width: size, height: size, fontSize: size * 0.38, backgroundColor: C.forest + '20', color: C.forest }}>
          {(u?.username || '?')[0].toUpperCase()}
        </div>
  );

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: C.forest }} /></div>;

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-black" style={{ color: C.g800 }}>Active Offers</h2>
          <p className="text-xs mt-0.5" style={{ color: C.g400 }}>Users currently live in the marketplace · auto-refreshes every 60s</p>
        </div>
        <button onClick={load} className="p-2 rounded-xl border hover:bg-gray-50" style={{ borderColor: C.g200 }}>
          <RefreshCw size={14} style={{ color: C.g500 }} />
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Total Active Offers', value: data?.total || 0,        color: C.forest, bg: '#F0FDF4' },
          { label: 'BTC Offers',          value: btcCount,                color: '#F59E0B', bg: '#FFFBEB' },
          { label: 'Gift Card Offers',    value: gcCount,                 color: '#8B5CF6', bg: '#F5F3FF' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-2xl border p-4 text-center" style={{ borderColor: C.g200 }}>
            <p className="text-2xl font-black" style={{ color: s.color }}>{s.value}</p>
            <p className="text-[10px] font-bold mt-0.5 uppercase tracking-wide" style={{ color: C.g400 }}>{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-1 min-w-[180px] bg-white border rounded-xl px-3 py-2" style={{ borderColor: C.g200 }}>
          <Search size={13} style={{ color: C.g400 }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by username, payment, country…" className="flex-1 text-xs outline-none bg-transparent" />
          {search && <button onClick={() => setSearch('')}><X size={12} style={{ color: C.g400 }} /></button>}
        </div>
        <div className="flex rounded-xl overflow-hidden border" style={{ borderColor: C.g200 }}>
          {[['all','All'], ['btc','BTC'], ['giftcard','Gift Cards']].map(([id, label]) => (
            <button key={id} onClick={() => setTypeFilter(id)} className="px-3 py-2 text-xs font-bold transition"
              style={{ backgroundColor: typeFilter === id ? C.forest : 'white', color: typeFilter === id ? '#fff' : C.g500 }}>{label}</button>
          ))}
        </div>
        <div className="flex rounded-xl overflow-hidden border" style={{ borderColor: C.g200 }}>
          {[['offers','By Offer'], ['users','By User']].map(([id, label]) => (
            <button key={id} onClick={() => setView(id)} className="px-3 py-2 text-xs font-bold transition"
              style={{ backgroundColor: view === id ? C.forest : 'white', color: view === id ? '#fff' : C.g500 }}>{label}</button>
          ))}
        </div>
      </div>

      {/* ── BY OFFER VIEW ── */}
      {view === 'offers' && (
        <>
          {filtered.length === 0 ? (
            <div className="bg-white rounded-2xl border py-14 text-center" style={{ borderColor: C.g200 }}>
              <Layers size={32} className="mx-auto mb-2" style={{ color: C.g200 }} />
              <p className="text-sm font-bold" style={{ color: C.g400 }}>No active offers found</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: C.g200 }}>
              <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: C.g100 }}>
                <p className="text-xs font-black" style={{ color: C.g700 }}>{filtered.length} offers</p>
              </div>
              {filtered.map((o, i) => {
                const gc     = isGiftCard(o);
                const pmList = (() => { try { return JSON.parse(o.payment_methods || '[]'); } catch { return o.payment_method ? [o.payment_method] : []; } })();
                return (
                  <div key={o.id} className="px-4 py-3 hover:bg-gray-50 transition" style={{ borderTop: i > 0 ? `1px solid ${C.g100}` : 'none' }}>
                    <div className="flex items-center gap-3">
                      {/* Avatar + online dot */}
                      <div className="relative flex-shrink-0">
                        <AvatarBubble u={o.seller} size={38} />
                        <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white" style={{ backgroundColor: onlineColor(o.seller?.last_seen_at) }} />
                      </div>

                      {/* Main info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-black" style={{ color: C.g800 }}>{o.seller?.username || '—'}</span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: gc ? '#F5F3FF' : '#FFFBEB', color: gc ? '#8B5CF6' : '#F59E0B' }}>
                            {gc ? <><Gift size={12} className="inline-block mr-1" /> {o.gift_card_brand || o.card_type || 'Gift Card'}</> : '₿ BTC'}
                          </span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: o.listing_type === 'SELL' ? '#FEF2F2' : '#ECFDF5', color: o.listing_type === 'SELL' ? '#EF4444' : '#10B981' }}>
                            {o.listing_type === 'SELL' ? 'SELL' : 'BUY'}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 mt-1 flex-wrap text-[11px]">
                          <span style={{ color: C.g500 }}>Limits: <span className="font-bold" style={{ color: C.g700 }}>{o.currency_symbol || '$'}{parseFloat(o.min_limit_usd || 0).toFixed(0)} – {o.currency_symbol || '$'}{parseFloat(o.max_limit_usd || 0).toFixed(0)}</span></span>
                          {pmList.length > 0 && <span style={{ color: C.g500 }}>via <span className="font-bold" style={{ color: C.g700 }}>{pmList.slice(0, 2).join(', ')}{pmList.length > 2 ? ` +${pmList.length - 2}` : ''}</span></span>}
                          {o.country_name && <span className="inline-flex items-center gap-1" style={{ color: C.g400 }}><Globe size={11} className="inline-block" /> {o.country_name}</span>}
                        </div>
                      </div>

                      {/* Rate + seller stats */}
                      <div className="text-right flex-shrink-0">
                        {o.margin != null && <p className="text-sm font-black" style={{ color: o.margin >= 0 ? C.forest : '#EF4444' }}>{o.margin > 0 ? '+' : ''}{o.margin}%</p>}
                        <p className="inline-flex items-center text-[10px]" style={{ color: C.g400 }}>{o.seller?.total_trades || 0} trades · <Star size={10} className="inline-block mx-0.5" />{parseFloat(o.seller?.average_rating || 0).toFixed(1)}</p>
                        <p className="text-[9px]" style={{ color: onlineColor(o.seller?.last_seen_at) }}>{lastSeen(o.seller?.last_seen_at)}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ── BY USER VIEW ── */}
      {view === 'users' && (
        <>
          {filteredByUser.length === 0 ? (
            <div className="bg-white rounded-2xl border py-14 text-center" style={{ borderColor: C.g200 }}>
              <Users size={32} className="mx-auto mb-2" style={{ color: C.g200 }} />
              <p className="text-sm font-bold" style={{ color: C.g400 }}>No active sellers found</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredByUser.map(({ user, offers: uOffers }) => {
                const isOpen = expanded === user.id;
                const gcOffers  = uOffers.filter(o =>  isGiftCard(o));
                const btcOffers = uOffers.filter(o => !isGiftCard(o));
                return (
                  <div key={user.id} className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: C.g200 }}>
                    {/* User row */}
                    <div className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50" onClick={() => setExpanded(isOpen ? null : user.id)}>
                      <div className="relative flex-shrink-0">
                        <AvatarBubble u={user} size={42} />
                        <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white" style={{ backgroundColor: onlineColor(user?.last_seen_at) }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-black text-sm" style={{ color: C.g800 }}>{user.username}</p>
                          {user.badge && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: '#FFFBEB', color: '#F59E0B' }}>{user.badge}</span>}
                        </div>
                        <div className="flex items-center gap-3 mt-0.5 text-[11px] flex-wrap">
                          <span style={{ color: C.g500 }}>{user.total_trades || 0} trades</span>
                          <span className="inline-flex items-center gap-1" style={{ color: C.g500 }}><Star size={11} className="inline-block" /> {parseFloat(user.average_rating || 0).toFixed(1)}</span>
                          <span style={{ color: C.g500 }}>{parseFloat(user.completion_rate || 0).toFixed(0)}% completion</span>
                          <span className="inline-flex items-center gap-1" style={{ color: C.g400 }}><Globe size={11} className="inline-block" /> {user.country || '—'}</span>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="flex items-center gap-1.5 justify-end">
                          {btcOffers.length > 0 && <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: '#FFFBEB', color: '#F59E0B' }}>₿ {btcOffers.length}</span>}
                          {gcOffers.length  > 0 && <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: '#F5F3FF', color: '#8B5CF6' }}><Gift size={11} className="inline-block" /> {gcOffers.length}</span>}
                        </div>
                        <p className="text-[9px] mt-1" style={{ color: onlineColor(user.last_seen_at) }}>{lastSeen(user.last_seen_at)}</p>
                        <ChevronRight size={14} className="ml-auto mt-1" style={{ color: C.g300, transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }} />
                      </div>
                    </div>

                    {/* Expanded offer list */}
                    {isOpen && (
                      <div className="border-t" style={{ borderColor: C.g100 }}>
                        {uOffers.map((o, i) => {
                          const pmList = (() => { try { return JSON.parse(o.payment_methods || '[]'); } catch { return o.payment_method ? [o.payment_method] : []; } })();
                          return (
                            <div key={o.id} className="flex items-center gap-3 px-4 py-2.5" style={{ borderTop: i > 0 ? `1px solid ${C.g100}` : 'none', backgroundColor: '#FAFAFA' }}>
                              <div className="flex items-center gap-1.5 flex-shrink-0">
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: isGiftCard(o) ? '#F5F3FF' : '#FFFBEB', color: isGiftCard(o) ? '#8B5CF6' : '#F59E0B' }}>
                                  {isGiftCard(o) ? <><Gift size={11} className="inline-block mr-1" /> {o.gift_card_brand || o.card_type || 'GC'}</> : '₿ BTC'}
                                </span>
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: o.listing_type === 'SELL' ? '#FEF2F2' : '#ECFDF5', color: o.listing_type === 'SELL' ? '#EF4444' : '#10B981' }}>
                                  {o.listing_type === 'SELL' ? 'SELL' : 'BUY'}
                                </span>
                              </div>
                              <div className="flex-1 min-w-0 text-[11px]">
                                <span style={{ color: C.g500 }}>Limit: <span className="font-bold" style={{ color: C.g700 }}>{o.currency_symbol || '$'}{parseFloat(o.min_limit_usd || 0).toFixed(0)}–{parseFloat(o.max_limit_usd || 0).toFixed(0)}</span></span>
                                {pmList.length > 0 && <span className="ml-2" style={{ color: C.g400 }}>· {pmList.slice(0, 2).join(', ')}</span>}
                              </div>
                              {o.margin != null && <span className="text-xs font-black flex-shrink-0" style={{ color: o.margin >= 0 ? C.forest : '#EF4444' }}>{o.margin > 0 ? '+' : ''}{o.margin}%</span>}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ================================================================
// REPORTS & EXPORTS
// ================================================================
function ReportsSection() {
  const token = localStorage.getItem('team_token') || localStorage.getItem('token');
  const [from, setFrom] = useState('');
  const [to, setTo]     = useState('');
  const [downloading, setDownloading] = useState('');

  const download = async (type) => {
    setDownloading(type);
    try {
      const params = new URLSearchParams();
      if (from) params.append('from', from);
      if (to)   params.append('to',   to + 'T23:59:59');
      const res = await axios.get(`${API_URL}/team/reports/${type}?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob',
      });
      const url  = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href  = url;
      link.setAttribute('download', `${type}-report-${new Date().toISOString().slice(0,10)}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success(`${type} report downloaded`);
    } catch { toast.error('Download failed'); }
    finally { setDownloading(''); }
  };

  const reports = [
    { id: 'trades', label: 'Trades Report', desc: 'All trades with status, BTC amount, currency and timestamps', color: '#3B82F6', bg: '#EFF6FF', icon: ArrowLeftRight },
    { id: 'fees',   label: 'Fee Transactions', desc: 'All escrow fees collected from trades and gift card transactions', color: '#10B981', bg: '#ECFDF5', icon: DollarSign },
    { id: 'users',  label: 'User Signups',  desc: 'All registered users with KYC status, trade count and country', color: '#8B5CF6', bg: '#F5F3FF', icon: Users },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-black" style={{ color: C.g800 }}>Reports & Exports</h2>
        <p className="text-xs mt-0.5" style={{ color: C.g400 }}>Download CSV reports for any date range</p>
      </div>

      <div className="bg-white rounded-2xl border p-4" style={{ borderColor: C.g200 }}>
        <p className="text-xs font-black mb-3" style={{ color: C.g500 }}>Date Range (optional — leave blank for all time)</p>
        <div className="flex gap-3 flex-wrap">
          <div>
            <label className="block text-[10px] font-bold mb-1" style={{ color: C.g500 }}>From</label>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="px-3 py-2 text-sm rounded-xl border outline-none" style={{ borderColor: C.g200 }} />
          </div>
          <div>
            <label className="block text-[10px] font-bold mb-1" style={{ color: C.g500 }}>To</label>
            <input type="date" value={to} onChange={e => setTo(e.target.value)} className="px-3 py-2 text-sm rounded-xl border outline-none" style={{ borderColor: C.g200 }} />
          </div>
          {(from || to) && <button onClick={() => { setFrom(''); setTo(''); }} className="self-end px-3 py-2 text-xs font-bold rounded-xl border" style={{ borderColor: C.g200, color: C.g400 }}>Clear</button>}
        </div>
      </div>

      <div className="space-y-3">
        {reports.map(r => (
          <div key={r.id} className="bg-white rounded-2xl border flex items-center gap-4 p-4" style={{ borderColor: C.g200 }}>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: r.bg }}>
              <r.icon size={18} style={{ color: r.color }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-black text-sm" style={{ color: C.g800 }}>{r.label}</p>
              <p className="text-xs mt-0.5" style={{ color: C.g400 }}>{r.desc}</p>
              {(from || to) && <p className="text-[10px] mt-0.5 font-semibold" style={{ color: r.color }}>{from || 'start'} → {to || 'today'}</p>}
            </div>
            <button onClick={() => download(r.id)} disabled={downloading === r.id}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-white flex-shrink-0 transition"
              style={{ backgroundColor: downloading === r.id ? C.g300 : r.color }}>
              <Download size={13} />
              {downloading === r.id ? 'Downloading…' : 'Download CSV'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ================================================================
// STAFF DIRECTORY
// ================================================================
const DEPARTMENTS = [
  'General', 'Executive / CEO', 'Management', 'Team Lead',
  'Tech Team', 'Engineering', 'Product Manager',
  'Marketing', 'Marketers', 'Customer Support',
  'Finance', 'Operations', 'Ambassador', 'Advocate',
  'Internship', 'Legal', 'HR',
];
const CONTRACT_TYPES = [
  { id: 'full-time',  label: 'Full-time',   color: '#10B981', bg: '#ECFDF5' },
  { id: 'part-time',  label: 'Part-time',   color: '#3B82F6', bg: '#EFF6FF' },
  { id: 'contract',   label: 'Contractor',  color: '#8B5CF6', bg: '#F5F3FF' },
  { id: 'intern',     label: 'Intern',      color: '#F59E0B', bg: '#FFFBEB' },
];
const STAFF_STATUSES = [
  { id: 'active',     label: 'Active',      color: '#10B981', dot: '#10B981' },
  { id: 'on-leave',   label: 'On Leave',    color: '#F59E0B', dot: '#F59E0B' },
  { id: 'terminated', label: 'Terminated',  color: '#EF4444', dot: '#EF4444' },
];
const SALARY_PERIODS = ['monthly','weekly','yearly'];
const ctMeta  = (id) => CONTRACT_TYPES.find(c => c.id === id)  || CONTRACT_TYPES[0];
const stMeta  = (id) => STAFF_STATUSES.find(s => s.id === id)  || STAFF_STATUSES[0];

const initials = (n = '') => n.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
const tenure = (startDate) => {
  if (!startDate) return '—';
  const months = Math.max(0, (new Date() - new Date(startDate)) / (1000 * 60 * 60 * 24 * 30.44) | 0);
  if (months < 1) return 'Just started';
  if (months < 12) return `${months} month${months !== 1 ? 's' : ''}`;
  const y = Math.floor(months / 12), m = months % 12;
  return `${y}yr${y !== 1 ? 's' : ''}${m > 0 ? ` ${m}mo` : ''}`;
};
const contractEnd = (startDate, months) => {
  if (!startDate || !months) return null;
  const d = new Date(startDate);
  d.setMonth(d.getMonth() + parseInt(months));
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};
const fmtSalary = (amt, period) => {
  const n = parseFloat(amt || 0);
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / ${period || 'mo'}`;
};

const BLANK_FORM = {
  full_name: '', role: '', department: 'General', official_email: '', personal_email: '',
  phone: '', salary_usd: '', salary_period: 'monthly', contract_type: 'full-time',
  contract_months: '', start_date: new Date().toISOString().slice(0, 10),
  status: 'active', bio: '', address: '', emergency_contact: '', emergency_phone: '', notes: '',
};

function StaffSection() {
  const token = localStorage.getItem('team_token') || localStorage.getItem('token');
  const cfg   = { headers: { Authorization: `Bearer ${token}` } };

  const [staff, setStaff]               = useState([]);
  const [loading, setLoading]           = useState(true);
  const [search, setSearch]             = useState('');
  const [deptFilter, setDeptFilter]     = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [viewMember, setViewMember]     = useState(null);
  const [showForm, setShowForm]         = useState(false);
  const [form, setForm]                 = useState(BLANK_FORM);
  const [editId, setEditId]             = useState(null);
  const [saving, setSaving]             = useState(false);
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [avatarBase64, setAvatarBase64]   = useState(null);
  const fileRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API_URL}/team/staff`, cfg);
      setStaff(data.staff || []);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to load staff');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openAdd = () => {
    setForm(BLANK_FORM);
    setEditId(null);
    setAvatarPreview(null);
    setAvatarBase64(null);
    setShowForm(true);
  };

  const openEdit = (m) => {
    setForm({
      full_name: m.full_name || '', role: m.role || '', department: m.department || 'General',
      official_email: m.official_email || '', personal_email: m.personal_email || '',
      phone: m.phone || '', salary_usd: m.salary_usd ?? '', salary_period: m.salary_period || 'monthly',
      contract_type: m.contract_type || 'full-time', contract_months: m.contract_months || '',
      start_date: m.start_date || new Date().toISOString().slice(0, 10),
      status: m.status || 'active', bio: m.bio || '', address: m.address || '',
      emergency_contact: m.emergency_contact || '', emergency_phone: m.emergency_phone || '',
      notes: m.notes || '',
    });
    setEditId(m.id);
    setAvatarPreview(m.avatar_url || null);
    setAvatarBase64(null);
    setShowForm(true);
    setViewMember(null);
  };

  const handleAvatar = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) { toast.error('Image must be under 3MB'); return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
      setAvatarPreview(ev.target.result);
      setAvatarBase64(ev.target.result);
    };
    reader.readAsDataURL(file);
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...form };
      if (avatarBase64) payload.avatar_base64 = avatarBase64;
      if (editId) {
        const { data } = await axios.patch(`${API_URL}/team/staff/${editId}`, payload, cfg);
        setStaff(s => s.map(m => m.id === editId ? data.member : m));
        toast.success('Staff record updated');
      } else {
        const { data } = await axios.post(`${API_URL}/team/staff`, payload, cfg);
        setStaff(s => [data.member, ...s]);
        toast.success('Staff member added');
      }
      setShowForm(false);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save');
    } finally { setSaving(false); }
  };

  const remove = async (id) => {
    if (!window.confirm('Delete this staff record? This cannot be undone.')) return;
    try {
      await axios.delete(`${API_URL}/team/staff/${id}`, cfg);
      setStaff(s => s.filter(m => m.id !== id));
      setViewMember(null);
      toast.success('Deleted');
    } catch (err) { toast.error(err.response?.data?.error || 'Failed to delete'); }
  };

  const field = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const filtered = staff.filter(m => {
    const q = search.toLowerCase();
    const matchSearch = !q || m.full_name?.toLowerCase().includes(q) || m.role?.toLowerCase().includes(q) || m.department?.toLowerCase().includes(q) || m.official_email?.toLowerCase().includes(q);
    const matchDept   = deptFilter === 'all'   || m.department === deptFilter;
    const matchStatus = statusFilter === 'all' || m.status === statusFilter;
    return matchSearch && matchDept && matchStatus;
  });

  const activeCount  = staff.filter(m => m.status === 'active').length;
  const leaveCount   = staff.filter(m => m.status === 'on-leave').length;
  const depts        = [...new Set(staff.map(m => m.department).filter(Boolean))];

  const AvatarCircle = ({ m, size = 48, textSize = 'text-lg' }) => (
    m?.avatar_url
      ? <img src={m.avatar_url} alt={m.full_name} className="rounded-full object-cover flex-shrink-0" style={{ width: size, height: size }} />
      : <div className={`rounded-full flex items-center justify-center font-black flex-shrink-0 ${textSize}`}
          style={{ width: size, height: size, backgroundColor: C.forest, color: '#fff' }}>
          {initials(m?.full_name)}
        </div>
  );

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: C.forest }} />
    </div>
  );

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-black" style={{ color: C.g800 }}>Staff Directory</h2>
          <p className="text-xs mt-0.5" style={{ color: C.g400 }}>Official staff records, contracts and employment details</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="p-2 rounded-xl border hover:bg-gray-50 transition" style={{ borderColor: C.g200 }}>
            <RefreshCw size={14} style={{ color: C.g500 }} />
          </button>
          <button onClick={openAdd} className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-white" style={{ backgroundColor: C.forest }}>
            <Plus size={13} /> Add Staff Member
          </button>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Total Staff', value: staff.length, color: C.forest, bg: '#F0FDF4' },
          { label: 'Active',      value: activeCount,  color: '#10B981', bg: '#ECFDF5' },
          { label: 'On Leave',    value: leaveCount,   color: '#F59E0B', bg: '#FFFBEB' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-2xl border p-4 text-center" style={{ borderColor: C.g200 }}>
            <p className="text-2xl font-black" style={{ color: s.color }}>{s.value}</p>
            <p className="text-[10px] font-bold mt-0.5 uppercase tracking-wide" style={{ color: C.g400 }}>{s.label}</p>
          </div>
        ))}
      </div>

      {/* Search + filters */}
      <div className="flex flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-1 min-w-0 bg-white border rounded-xl px-3 py-2" style={{ borderColor: C.g200 }}>
          <Search size={13} style={{ color: C.g400 }} />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, role, department…"
            className="flex-1 text-xs outline-none bg-transparent" style={{ color: C.g800 }} />
          {search && <button onClick={() => setSearch('')}><X size={12} style={{ color: C.g400 }} /></button>}
        </div>
        <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)}
          className="bg-white border rounded-xl px-3 py-2 text-xs font-bold outline-none" style={{ borderColor: C.g200, color: C.g500 }}>
          <option value="all">All Departments</option>
          {depts.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="bg-white border rounded-xl px-3 py-2 text-xs font-bold outline-none" style={{ borderColor: C.g200, color: C.g500 }}>
          <option value="all">All Status</option>
          {STAFF_STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
      </div>

      {/* Staff grid */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border py-16 text-center" style={{ borderColor: C.g200 }}>
          <Users size={36} className="mx-auto mb-2" style={{ color: C.g200 }} />
          <p className="text-sm font-bold" style={{ color: C.g400 }}>{staff.length === 0 ? 'No staff members yet — add the first one' : 'No results match your filters'}</p>
        </div>
      ) : (
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(min(280px,100%),1fr))' }}>
          {filtered.map(m => {
            const ct  = ctMeta(m.contract_type);
            const st  = stMeta(m.status);
            return (
              <div key={m.id} onClick={() => setViewMember(m)}
                className="bg-white rounded-2xl border p-5 cursor-pointer hover:shadow-md transition-shadow group relative"
                style={{ borderColor: C.g200 }}>
                {/* Status dot */}
                <div className="absolute top-4 right-4 w-2.5 h-2.5 rounded-full" style={{ backgroundColor: st.dot }} title={st.label} />

                {/* Avatar + name */}
                <div className="flex items-center gap-3 mb-4">
                  <AvatarCircle m={m} size={52} textSize="text-xl" />
                  <div className="min-w-0">
                    <p className="font-black text-sm truncate" style={{ color: C.g800 }}>{m.full_name}</p>
                    <p className="text-xs truncate mt-0.5" style={{ color: C.g500 }}>{m.role}</p>
                    <span className="inline-block mt-1 text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: '#F0FDF4', color: C.forest }}>{m.department}</span>
                  </div>
                </div>

                {/* Details */}
                <div className="space-y-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold px-2 py-0.5 rounded-full text-[10px]" style={{ backgroundColor: ct.bg, color: ct.color }}>{ct.label}</span>
                    <span className="font-semibold" style={{ color: C.g400 }}>{tenure(m.start_date)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span style={{ color: C.g500 }}>Started</span>
                    <span className="font-semibold" style={{ color: C.g700 }}>{fmtDate(m.start_date)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span style={{ color: C.g500 }}>Salary</span>
                    <span className="font-black" style={{ color: C.forest }}>{fmtSalary(m.salary_usd, m.salary_period)}</span>
                  </div>
                  {m.official_email && (
                    <div className="flex items-center justify-between">
                      <span style={{ color: C.g500 }}>Email</span>
                      <span className="font-semibold truncate ml-2 max-w-[140px]" style={{ color: C.g700 }}>{m.official_email}</span>
                    </div>
                  )}
                </div>

                {/* Hover overlay hint */}
                <div className="absolute inset-0 rounded-2xl pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity" style={{ border: `1.5px solid ${C.forest}` }} />
              </div>
            );
          })}
        </div>
      )}

      {/* ─── Detail Modal ─── */}
      {viewMember && !showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}>
          <div className="bg-white rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl" style={{ maxHeight: '90vh', overflowY: 'auto' }}>
            {/* Banner */}
            <div className="h-24 relative" style={{ background: `linear-gradient(135deg,${C.forest},#0c2418)` }}>
              <button onClick={() => setViewMember(null)} className="absolute top-4 right-4 p-1.5 rounded-full bg-white bg-opacity-20 hover:bg-opacity-30 transition">
                <X size={14} style={{ color: '#fff' }} />
              </button>
            </div>

            {/* Avatar overlapping banner */}
            <div className="px-6 pb-6">
              <div className="-mt-10 mb-4 flex items-end justify-between">
                <div className="ring-4 ring-white rounded-full">
                  <AvatarCircle m={viewMember} size={72} textSize="text-2xl" />
                </div>
                <div className="flex gap-2">
                  <button onClick={() => openEdit(viewMember)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border" style={{ borderColor: C.g200, color: C.g600 }}>
                    <Edit2 size={12} /> Edit
                  </button>
                  <button onClick={() => remove(viewMember.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border" style={{ borderColor: '#FCA5A5', color: '#EF4444' }}>
                    <Trash2 size={12} /> Remove
                  </button>
                </div>
              </div>

              <div className="mb-1 flex items-center gap-2 flex-wrap">
                <h2 className="text-xl font-black" style={{ color: C.g800 }}>{viewMember.full_name}</h2>
                <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: stMeta(viewMember.status).dot + '20', color: stMeta(viewMember.status).color }}>
                  ● {stMeta(viewMember.status).label}
                </span>
              </div>
              <p className="text-sm font-semibold mb-1" style={{ color: C.g500 }}>{viewMember.role}</p>
              <span className="inline-block text-[11px] font-bold px-2.5 py-1 rounded-full mb-4" style={{ backgroundColor: '#F0FDF4', color: C.forest }}>{viewMember.department}</span>

              {viewMember.bio && (
                <p className="text-xs leading-relaxed mb-4 p-3 rounded-xl" style={{ backgroundColor: C.g50, color: C.g600 }}>{viewMember.bio}</p>
              )}

              {/* Info grid */}
              {[
                ['Employment', [
                  ['Contract',   ctMeta(viewMember.contract_type).label],
                  ['Start Date', fmtDate(viewMember.start_date)],
                  ['Tenure',     tenure(viewMember.start_date)],
                  ['Contract End', viewMember.contract_months ? contractEnd(viewMember.start_date, viewMember.contract_months) : 'Permanent'],
                  ['Salary',     fmtSalary(viewMember.salary_usd, viewMember.salary_period)],
                ]],
                ['Contact', [
                  ['Official Email',  viewMember.official_email],
                  ['Personal Email',  viewMember.personal_email],
                  ['Phone',           viewMember.phone],
                  ['Address',         viewMember.address],
                ]],
                ['Emergency', [
                  ['Contact Name',  viewMember.emergency_contact],
                  ['Contact Phone', viewMember.emergency_phone],
                ]],
              ].map(([section, rows]) => {
                const filled = rows.filter(([, v]) => v);
                if (!filled.length) return null;
                return (
                  <div key={section} className="mb-4">
                    <p className="text-[10px] font-black uppercase tracking-widest mb-2" style={{ color: C.g400 }}>{section}</p>
                    <div className="bg-white border rounded-2xl overflow-hidden" style={{ borderColor: C.g100 }}>
                      {filled.map(([label, value], i) => (
                        <div key={label} className="flex items-center justify-between px-4 py-2.5" style={{ borderTop: i > 0 ? `1px solid ${C.g100}` : 'none' }}>
                          <span className="text-xs" style={{ color: C.g400 }}>{label}</span>
                          <span className="text-xs font-bold text-right max-w-[60%]" style={{ color: C.g800 }}>{value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}

              {viewMember.notes && (
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest mb-2" style={{ color: C.g400 }}>Notes</p>
                  <p className="text-xs leading-relaxed p-3 rounded-xl" style={{ backgroundColor: '#FFFBEB', color: C.g600 }}>{viewMember.notes}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── Add / Edit Form Modal ─── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}>
          <div className="bg-white rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl" style={{ maxHeight: '92vh', overflowY: 'auto' }}>
            <div className="sticky top-0 bg-white z-10 flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: C.g100 }}>
              <div>
                <h3 className="font-black text-sm" style={{ color: C.g800 }}>{editId ? 'Edit Staff Record' : 'Add New Staff Member'}</h3>
                <p className="text-[10px] mt-0.5" style={{ color: C.g400 }}>Fill in all official employment details</p>
              </div>
              <button onClick={() => setShowForm(false)} className="p-1.5 rounded-full hover:bg-gray-100">
                <X size={16} style={{ color: C.g500 }} />
              </button>
            </div>

            <form onSubmit={save} className="p-6 space-y-6">

              {/* Avatar upload */}
              <div className="flex items-center gap-4">
                <div className="relative cursor-pointer" onClick={() => fileRef.current?.click()}>
                  {avatarPreview
                    ? <img src={avatarPreview} alt="preview" className="w-20 h-20 rounded-full object-cover ring-2" style={{ ringColor: C.forest }} />
                    : <div className="w-20 h-20 rounded-full flex items-center justify-center text-2xl font-black" style={{ backgroundColor: C.forest + '20', color: C.forest }}>
                        {initials(form.full_name) || <Plus size={24} />}
                      </div>
                  }
                  <div className="absolute bottom-0 right-0 w-6 h-6 rounded-full flex items-center justify-center" style={{ backgroundColor: C.forest }}>
                    <Edit2 size={10} style={{ color: '#fff' }} />
                  </div>
                </div>
                <div>
                  <p className="text-xs font-bold" style={{ color: C.g700 }}>Profile Photo</p>
                  <p className="text-[10px] mt-0.5" style={{ color: C.g400 }}>JPG, PNG · max 3MB</p>
                  <button type="button" onClick={() => fileRef.current?.click()}
                    className="mt-2 text-[11px] font-bold px-3 py-1 rounded-xl border" style={{ borderColor: C.g200, color: C.g500 }}>
                    Upload Photo
                  </button>
                  <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatar} />
                </div>
              </div>

              {/* Section: Basic Info */}
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest mb-3" style={{ color: C.g400 }}>Basic Information</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="block text-[10px] font-bold mb-1" style={{ color: C.g500 }}>Full Name *</label>
                    <input required value={form.full_name} onChange={e => field('full_name', e.target.value)}
                      placeholder="e.g. John Adeyemi" className="w-full px-3 py-2.5 text-sm rounded-xl border outline-none" style={{ borderColor: C.g200 }} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold mb-1" style={{ color: C.g500 }}>Role / Position *</label>
                    <input required value={form.role} onChange={e => field('role', e.target.value)}
                      placeholder="e.g. Lead Developer" className="w-full px-3 py-2.5 text-sm rounded-xl border outline-none" style={{ borderColor: C.g200 }} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold mb-1" style={{ color: C.g500 }}>Department</label>
                    <select value={form.department} onChange={e => field('department', e.target.value)}
                      className="w-full px-3 py-2.5 text-sm rounded-xl border outline-none" style={{ borderColor: C.g200 }}>
                      {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold mb-1" style={{ color: C.g500 }}>Status</label>
                    <select value={form.status} onChange={e => field('status', e.target.value)}
                      className="w-full px-3 py-2.5 text-sm rounded-xl border outline-none" style={{ borderColor: C.g200 }}>
                      {STAFF_STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              {/* Section: Contract & Pay */}
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest mb-3" style={{ color: C.g400 }}>Contract & Compensation</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold mb-1" style={{ color: C.g500 }}>Contract Type</label>
                    <div className="flex flex-wrap gap-1.5">
                      {CONTRACT_TYPES.map(ct => (
                        <button key={ct.id} type="button" onClick={() => field('contract_type', ct.id)}
                          className="px-3 py-1 rounded-xl text-[11px] font-bold transition"
                          style={{ backgroundColor: form.contract_type === ct.id ? ct.color : ct.bg, color: form.contract_type === ct.id ? '#fff' : ct.color }}>
                          {ct.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold mb-1" style={{ color: C.g500 }}>Contract Duration</label>
                    <div className="flex gap-2">
                      <input type="number" min="1" value={form.contract_months} onChange={e => field('contract_months', e.target.value)}
                        placeholder="e.g. 12" className="flex-1 px-3 py-2.5 text-sm rounded-xl border outline-none" style={{ borderColor: C.g200 }} />
                      <span className="flex items-center text-xs font-semibold" style={{ color: C.g400 }}>months</span>
                    </div>
                    <p className="text-[10px] mt-1" style={{ color: C.g400 }}>Leave blank for permanent</p>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold mb-1" style={{ color: C.g500 }}>Start Date *</label>
                    <input required type="date" value={form.start_date} onChange={e => field('start_date', e.target.value)}
                      className="w-full px-3 py-2.5 text-sm rounded-xl border outline-none" style={{ borderColor: C.g200 }} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold mb-1" style={{ color: C.g500 }}>Salary (USD)</label>
                    <div className="flex gap-2">
                      <input type="number" min="0" step="0.01" value={form.salary_usd} onChange={e => field('salary_usd', e.target.value)}
                        placeholder="0.00" className="flex-1 px-3 py-2.5 text-sm rounded-xl border outline-none" style={{ borderColor: C.g200 }} />
                      <select value={form.salary_period} onChange={e => field('salary_period', e.target.value)}
                        className="px-2 py-2.5 text-xs rounded-xl border outline-none" style={{ borderColor: C.g200 }}>
                        {SALARY_PERIODS.map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              {/* Section: Contact */}
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest mb-3" style={{ color: C.g400 }}>Contact Details</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold mb-1" style={{ color: C.g500 }}>Official Email</label>
                    <input type="email" value={form.official_email} onChange={e => field('official_email', e.target.value)}
                      placeholder="name@praqen.com" className="w-full px-3 py-2.5 text-sm rounded-xl border outline-none" style={{ borderColor: C.g200 }} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold mb-1" style={{ color: C.g500 }}>Personal Email</label>
                    <input type="email" value={form.personal_email} onChange={e => field('personal_email', e.target.value)}
                      placeholder="personal@gmail.com" className="w-full px-3 py-2.5 text-sm rounded-xl border outline-none" style={{ borderColor: C.g200 }} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold mb-1" style={{ color: C.g500 }}>Phone Number</label>
                    <input type="tel" value={form.phone} onChange={e => field('phone', e.target.value)}
                      placeholder="+234 800 000 0000" className="w-full px-3 py-2.5 text-sm rounded-xl border outline-none" style={{ borderColor: C.g200 }} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold mb-1" style={{ color: C.g500 }}>Home Address</label>
                    <input value={form.address} onChange={e => field('address', e.target.value)}
                      placeholder="City, State, Country" className="w-full px-3 py-2.5 text-sm rounded-xl border outline-none" style={{ borderColor: C.g200 }} />
                  </div>
                </div>
              </div>

              {/* Section: Emergency */}
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest mb-3" style={{ color: C.g400 }}>Emergency Contact</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold mb-1" style={{ color: C.g500 }}>Contact Name</label>
                    <input value={form.emergency_contact} onChange={e => field('emergency_contact', e.target.value)}
                      placeholder="Next of kin name" className="w-full px-3 py-2.5 text-sm rounded-xl border outline-none" style={{ borderColor: C.g200 }} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold mb-1" style={{ color: C.g500 }}>Contact Phone</label>
                    <input type="tel" value={form.emergency_phone} onChange={e => field('emergency_phone', e.target.value)}
                      placeholder="+234 800 000 0000" className="w-full px-3 py-2.5 text-sm rounded-xl border outline-none" style={{ borderColor: C.g200 }} />
                  </div>
                </div>
              </div>

              {/* Section: Bio & Notes */}
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest mb-3" style={{ color: C.g400 }}>Additional Details</p>
                <div className="space-y-3">
                  <div>
                    <label className="block text-[10px] font-bold mb-1" style={{ color: C.g500 }}>Bio / Description</label>
                    <textarea value={form.bio} onChange={e => field('bio', e.target.value)} rows={2}
                      placeholder="Brief description of role and responsibilities…"
                      className="w-full px-3 py-2.5 text-sm rounded-xl border outline-none resize-none" style={{ borderColor: C.g200 }} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold mb-1" style={{ color: C.g500 }}>Internal Notes</label>
                    <textarea value={form.notes} onChange={e => field('notes', e.target.value)} rows={2}
                      placeholder="Private notes visible only to the team…"
                      className="w-full px-3 py-2.5 text-sm rounded-xl border outline-none resize-none" style={{ borderColor: C.g200 }} />
                  </div>
                </div>
              </div>

              {/* Submit */}
              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={saving}
                  className="flex-1 py-3 rounded-xl text-sm font-black text-white transition"
                  style={{ backgroundColor: C.forest, opacity: saving ? 0.7 : 1 }}>
                  {saving ? 'Saving…' : editId ? 'Update Staff Record' : 'Add Staff Member'}
                </button>
                <button type="button" onClick={() => setShowForm(false)}
                  className="px-5 py-3 rounded-xl text-sm font-bold border" style={{ borderColor: C.g200, color: C.g500 }}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ================================================================
// COMPANY BOOKS — Loans / Debt + Expenses
// ================================================================
const EXPENSE_CATEGORIES = [
  { id: 'salary',      label: 'Salary & Payroll',   color: '#3B82F6', bg: '#EFF6FF' },
  { id: 'tools',       label: 'Tools & Equipment',  color: '#8B5CF6', bg: '#F5F3FF' },
  { id: 'software',    label: 'Software & SaaS',    color: '#06B6D4', bg: '#ECFEFF' },
  { id: 'marketing',   label: 'Marketing & Ads',    color: '#F59E0B', bg: '#FFFBEB' },
  { id: 'operations',  label: 'Operations',         color: '#10B981', bg: '#ECFDF5' },
  { id: 'other',       label: 'Other',              color: '#6B7280', bg: '#F9FAFB' },
];
function catMeta(id) { return EXPENSE_CATEGORIES.find(c => c.id === id) || EXPENSE_CATEGORIES[5]; }

const CURRENCIES = [
  { code: 'USD', label: 'USD — US Dollar' },
  { code: 'GHS', label: 'GHS — Ghana Cedi' },
  { code: 'NGN', label: 'NGN — Nigerian Naira' },
  { code: 'KES', label: 'KES — Kenyan Shilling' },
  { code: 'ZAR', label: 'ZAR — South African Rand' },
  { code: 'XOF', label: 'XOF — West African CFA Franc' },
  { code: 'GBP', label: 'GBP — British Pound' },
  { code: 'EUR', label: 'EUR — Euro' },
];

function CompanyBooksSection() {
  const token = localStorage.getItem('team_token') || localStorage.getItem('token');
  const cfg   = { headers: { Authorization: `Bearer ${token}` } };

  const [tab, setTab]         = useState('loans');   // 'loans' | 'expenses'
  const [loans, setLoans]     = useState(null);
  const [expenses, setExpenses] = useState(null);
  const [totalOwed, setTotalOwed]   = useState('0.00');
  const [totalSpent, setTotalSpent] = useState('0.00');
  const [byCategory, setByCategory] = useState({});
  const [loading, setLoading] = useState(true);

  // add loan form
  const [showLoanForm, setShowLoanForm]   = useState(false);
  const [loanForm, setLoanForm]           = useState({ title: '', lender: '', amount: '', currency: 'USD', due_date: '', notes: '' });
  const [savingLoan, setSavingLoan]       = useState(false);
  const [fxRates, setFxRates]             = useState({});
  const [fxLoading, setFxLoading]         = useState(false);

  // add expense form
  const [showExpForm, setShowExpForm]     = useState(false);
  const [expForm, setExpForm]             = useState({ category: 'other', title: '', amount_usd: '', expense_date: new Date().toISOString().slice(0, 10), paid_by: '', notes: '' });
  const [savingExp, setSavingExp]         = useState(false);

  // record payment modal
  const [payLoan, setPayLoan]             = useState(null);
  const [payAmount, setPayAmount]         = useState('');
  const [savingPay, setSavingPay]         = useState(false);

  const loadAll = useCallback(async () => {
    try {
      const [lRes, eRes] = await Promise.all([
        axios.get(`${API_URL}/team/loans`, cfg),
        axios.get(`${API_URL}/team/expenses`, cfg),
      ]);
      setLoans(lRes.data.loans);
      setTotalOwed(lRes.data.totalOwed);
      setExpenses(eRes.data.expenses);
      setTotalSpent(eRes.data.totalSpent);
      setByCategory(eRes.data.byCategory || {});
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to load company books');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Live fiat exchange rates (base USD) — used to convert local-currency loan amounts to USD
  useEffect(() => {
    setFxLoading(true);
    fetch('https://open.er-api.com/v6/latest/USD')
      .then(r => r.json())
      .then(d => { if (d?.result === 'success') setFxRates(d.rates || {}); })
      .catch(() => {})
      .finally(() => setFxLoading(false));
  }, []);

  const fmt = (v) => `$${parseFloat(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  // rate = units of `currency` per 1 USD
  const fxRate    = loanForm.currency === 'USD' ? 1 : (fxRates[loanForm.currency] || null);
  const loanUsdPreview = fxRate && loanForm.amount ? parseFloat(loanForm.amount) / fxRate : null;

  const addLoan = async (e) => {
    e.preventDefault();
    setSavingLoan(true);
    try {
      const rate = loanForm.currency === 'USD' ? 1 : fxRates[loanForm.currency];
      if (!rate) { toast.error('Exchange rate unavailable — try again in a moment'); setSavingLoan(false); return; }
      const amount_usd = parseFloat(loanForm.amount || 0) / rate;
      await axios.post(`${API_URL}/team/loans`, {
        title: loanForm.title, lender: loanForm.lender, due_date: loanForm.due_date, notes: loanForm.notes,
        amount_usd, currency: loanForm.currency, original_amount: parseFloat(loanForm.amount || 0), fx_rate: rate,
      }, cfg);
      toast.success('Loan added');
      setShowLoanForm(false);
      setLoanForm({ title: '', lender: '', amount: '', currency: 'USD', due_date: '', notes: '' });
      loadAll();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed to add loan'); }
    finally { setSavingLoan(false); }
  };

  const deleteLoan = async (id) => {
    if (!window.confirm('Delete this loan record?')) return;
    try { await axios.delete(`${API_URL}/team/loans/${id}`, cfg); toast.success('Deleted'); loadAll(); }
    catch (err) { toast.error(err.response?.data?.error || 'Failed to delete'); }
  };

  const markPaid = async () => {
    if (!payLoan) return;
    setSavingPay(true);
    try {
      const prev   = parseFloat(payLoan.amount_paid_usd || 0);
      const total  = parseFloat(payLoan.amount_usd || 0);
      const newPaid = Math.min(total, prev + parseFloat(payAmount || 0));
      const status  = newPaid >= total ? 'paid' : 'active';
      await axios.patch(`${API_URL}/team/loans/${payLoan.id}`, { amount_paid_usd: newPaid, status }, cfg);
      toast.success(status === 'paid' ? 'Loan fully paid off!' : 'Payment recorded');
      setPayLoan(null); setPayAmount('');
      loadAll();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed to record payment'); }
    finally { setSavingPay(false); }
  };

  const addExpense = async (e) => {
    e.preventDefault();
    setSavingExp(true);
    try {
      await axios.post(`${API_URL}/team/expenses`, expForm, cfg);
      toast.success('Expense recorded');
      setShowExpForm(false);
      setExpForm({ category: 'other', title: '', amount_usd: '', expense_date: new Date().toISOString().slice(0, 10), paid_by: '', notes: '' });
      loadAll();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed to add expense'); }
    finally { setSavingExp(false); }
  };

  const deleteExpense = async (id) => {
    if (!window.confirm('Delete this expense?')) return;
    try { await axios.delete(`${API_URL}/team/expenses/${id}`, cfg); toast.success('Deleted'); loadAll(); }
    catch (err) { toast.error(err.response?.data?.error || 'Failed to delete'); }
  };

  const activeLoans = (loans || []).filter(l => l.status !== 'paid');
  const paidLoans   = (loans || []).filter(l => l.status === 'paid');

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: C.forest }}></div>
    </div>
  );

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-black" style={{ color: C.g800 }}>Company Books</h2>
          <p className="text-xs mt-0.5" style={{ color: C.g400 }}>Loans &amp; debt obligations · Business expenses</p>
        </div>
        <button onClick={loadAll} className="p-2 rounded-xl border hover:bg-gray-50 transition" style={{ borderColor: C.g200 }}>
          <RefreshCw size={14} style={{ color: C.g500 }} />
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border p-4" style={{ borderColor: C.g200 }}>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#FEF2F2' }}>
              <CreditCard size={15} style={{ color: '#EF4444' }} />
            </div>
            <p className="text-xs font-black uppercase tracking-wide" style={{ color: C.g500 }}>Total Debt Owed</p>
          </div>
          <p className="text-2xl font-black" style={{ color: '#EF4444' }}>{fmt(totalOwed)}</p>
          <p className="text-[10px] mt-1 font-semibold" style={{ color: C.g400 }}>{activeLoans.length} active loan{activeLoans.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="bg-white rounded-2xl border p-4" style={{ borderColor: C.g200 }}>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#FFF7ED' }}>
              <Receipt size={15} style={{ color: '#F97316' }} />
            </div>
            <p className="text-xs font-black uppercase tracking-wide" style={{ color: C.g500 }}>Total Spent</p>
          </div>
          <p className="text-2xl font-black" style={{ color: '#F97316' }}>{fmt(totalSpent)}</p>
          <p className="text-[10px] mt-1 font-semibold" style={{ color: C.g400 }}>{(expenses || []).length} expense record{(expenses || []).length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {/* Expense breakdown by category */}
      {Object.keys(byCategory).length > 0 && (
        <div className="bg-white rounded-2xl border p-4" style={{ borderColor: C.g200 }}>
          <div className="flex items-center gap-2 mb-3">
            <PieChart size={14} style={{ color: C.g500 }} />
            <p className="text-xs font-black uppercase tracking-wide" style={{ color: C.g500 }}>Spending by Category</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(byCategory).sort((a, b) => b[1] - a[1]).map(([cat, amt]) => {
              const meta = catMeta(cat);
              return (
                <div key={cat} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold" style={{ backgroundColor: meta.bg, color: meta.color }}>
                  <span>{meta.label}</span>
                  <span className="opacity-80">{fmt(amt)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tab switcher */}
      <div className="flex rounded-2xl overflow-hidden border" style={{ borderColor: C.g200 }}>
        {[['loans', 'Loans & Debt', CreditCard], ['expenses', 'Expenses', Receipt]].map(([id, label, Icon]) => (
          <button key={id} onClick={() => setTab(id)}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-black transition"
            style={{ backgroundColor: tab === id ? C.forest : 'white', color: tab === id ? '#fff' : C.g500 }}>
            <Icon size={13} />
            {label}
          </button>
        ))}
      </div>

      {/* ── LOANS TAB ── */}
      {tab === 'loans' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold" style={{ color: C.g500 }}>Active Loans ({activeLoans.length})</p>
            <button onClick={() => setShowLoanForm(v => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-white transition"
              style={{ backgroundColor: C.forest }}>
              <Plus size={12} /> Add Loan
            </button>
          </div>

          {/* Add loan form */}
          {showLoanForm && (
            <form onSubmit={addLoan} className="bg-white rounded-2xl border p-4 space-y-3" style={{ borderColor: C.forest }}>
              <p className="text-xs font-black uppercase tracking-wide" style={{ color: C.g500 }}>New Loan / Debt</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold mb-1" style={{ color: C.g500 }}>Loan Title *</label>
                  <input required value={loanForm.title} onChange={e => setLoanForm(f => ({ ...f, title: e.target.value }))}
                    placeholder="e.g. Business starter loan"
                    className="w-full px-3 py-2 text-xs rounded-xl border outline-none" style={{ borderColor: C.g200 }} />
                </div>
                <div>
                  <label className="block text-[10px] font-bold mb-1" style={{ color: C.g500 }}>Lender / Source *</label>
                  <input required value={loanForm.lender} onChange={e => setLoanForm(f => ({ ...f, lender: e.target.value }))}
                    placeholder="e.g. Angel investor"
                    className="w-full px-3 py-2 text-xs rounded-xl border outline-none" style={{ borderColor: C.g200 }} />
                </div>
                <div>
                  <label className="block text-[10px] font-bold mb-1" style={{ color: C.g500 }}>Amount *</label>
                  <div className="flex gap-2">
                    <input required type="number" min="0" step="0.01" value={loanForm.amount} onChange={e => setLoanForm(f => ({ ...f, amount: e.target.value }))}
                      placeholder="200.00"
                      className="flex-1 min-w-0 px-3 py-2 text-xs rounded-xl border outline-none" style={{ borderColor: C.g200 }} />
                    <select value={loanForm.currency} onChange={e => setLoanForm(f => ({ ...f, currency: e.target.value }))}
                      className="px-2 py-2 text-xs rounded-xl border outline-none" style={{ borderColor: C.g200 }}>
                      {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.code}</option>)}
                    </select>
                  </div>
                  {loanForm.currency !== 'USD' && (
                    <p className="text-[10px] mt-1 font-semibold" style={{ color: C.g400 }}>
                      {fxLoading ? 'Fetching exchange rate…'
                        : loanUsdPreview != null ? `≈ ${fmt(loanUsdPreview)} USD (1 USD = ${fxRate.toLocaleString()} ${loanForm.currency})`
                        : 'Exchange rate unavailable'}
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-[10px] font-bold mb-1" style={{ color: C.g500 }}>Due Date</label>
                  <input type="date" value={loanForm.due_date} onChange={e => setLoanForm(f => ({ ...f, due_date: e.target.value }))}
                    className="w-full px-3 py-2 text-xs rounded-xl border outline-none" style={{ borderColor: C.g200 }} />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-bold mb-1" style={{ color: C.g500 }}>Notes</label>
                <textarea value={loanForm.notes} onChange={e => setLoanForm(f => ({ ...f, notes: e.target.value }))}
                  rows={2} placeholder="Additional details..."
                  className="w-full px-3 py-2 text-xs rounded-xl border outline-none resize-none" style={{ borderColor: C.g200 }} />
              </div>
              <div className="flex gap-2">
                <button type="submit" disabled={savingLoan}
                  className="flex-1 py-2 rounded-xl text-xs font-bold text-white transition"
                  style={{ backgroundColor: C.forest, opacity: savingLoan ? 0.6 : 1 }}>
                  {savingLoan ? 'Saving…' : 'Add Loan'}
                </button>
                <button type="button" onClick={() => setShowLoanForm(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold border" style={{ borderColor: C.g200, color: C.g500 }}>
                  Cancel
                </button>
              </div>
            </form>
          )}

          {/* Active loans list */}
          {activeLoans.length === 0 && !showLoanForm && (
            <div className="bg-white rounded-2xl border py-12 text-center" style={{ borderColor: C.g200 }}>
              <CreditCard size={32} className="mx-auto mb-2" style={{ color: C.g200 }} />
              <p className="text-sm font-bold" style={{ color: C.g400 }}>No active loans</p>
            </div>
          )}

          {activeLoans.map(loan => {
            const total    = parseFloat(loan.amount_usd || 0);
            const paid     = parseFloat(loan.amount_paid_usd || 0);
            const remaining = Math.max(0, total - paid);
            const pct      = total > 0 ? Math.round((paid / total) * 100) : 0;
            const isOverdue = loan.due_date && new Date(loan.due_date) < new Date() && loan.status !== 'paid';
            return (
              <div key={loan.id} className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: isOverdue ? '#FCA5A5' : C.g200 }}>
                {isOverdue && (
                  <div className="flex items-center gap-2 px-4 py-2 text-xs font-bold" style={{ backgroundColor: '#FEF2F2', color: '#EF4444' }}>
                    <AlertCircle size={12} /> OVERDUE
                  </div>
                )}
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-black text-sm" style={{ color: C.g800 }}>{loan.title}</p>
                      <p className="text-xs mt-0.5" style={{ color: C.g400 }}>from <span className="font-bold">{loan.lender}</span>
                        {loan.due_date && <span> · due {new Date(loan.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>}
                      </p>
                      {loan.currency && loan.currency !== 'USD' && loan.original_amount != null && (
                        <p className="text-[10px] mt-0.5 font-semibold" style={{ color: C.g400 }}>
                          Originally {parseFloat(loan.original_amount).toLocaleString()} {loan.currency}
                        </p>
                      )}
                      {loan.notes && <p className="text-[10px] mt-1 italic" style={{ color: C.g400 }}>{loan.notes}</p>}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-lg font-black" style={{ color: '#EF4444' }}>{fmt(remaining)}</p>
                      <p className="text-[10px] font-semibold" style={{ color: C.g400 }}>remaining of {fmt(total)}</p>
                    </div>
                  </div>
                  {/* Progress bar */}
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-[10px] font-bold mb-1" style={{ color: C.g400 }}>
                      <span>Paid {fmt(paid)} ({pct}%)</span>
                      <span>Remaining {fmt(remaining)}</span>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: C.g100 }}>
                      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: pct === 100 ? '#10B981' : '#3B82F6' }}></div>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button onClick={() => { setPayLoan(loan); setPayAmount(''); }}
                      className="flex-1 py-1.5 rounded-xl text-[11px] font-bold text-white" style={{ backgroundColor: '#3B82F6' }}>
                      Record Payment
                    </button>
                    <button onClick={() => deleteLoan(loan.id)}
                      className="p-1.5 rounded-xl border" style={{ borderColor: C.g200, color: '#EF4444' }}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Paid loans */}
          {paidLoans.length > 0 && (
            <div>
              <p className="text-xs font-bold mt-2" style={{ color: C.g500 }}>Paid Off ({paidLoans.length})</p>
              {paidLoans.map(loan => (
                <div key={loan.id} className="flex items-center gap-3 bg-white rounded-2xl border px-4 py-3 mt-2 opacity-60" style={{ borderColor: C.g200 }}>
                  <CheckCircle size={16} style={{ color: '#10B981' }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-black" style={{ color: C.g800 }}>{loan.title}</p>
                    <p className="text-[10px]" style={{ color: C.g400 }}>{fmt(loan.amount_usd)} · {loan.lender}</p>
                  </div>
                  <button onClick={() => deleteLoan(loan.id)} className="p-1 rounded-lg" style={{ color: C.g300 }}>
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── EXPENSES TAB ── */}
      {tab === 'expenses' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold" style={{ color: C.g500 }}>{(expenses || []).length} records</p>
            <button onClick={() => setShowExpForm(v => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-white"
              style={{ backgroundColor: C.forest }}>
              <Plus size={12} /> Add Expense
            </button>
          </div>

          {/* Add expense form */}
          {showExpForm && (
            <form onSubmit={addExpense} className="bg-white rounded-2xl border p-4 space-y-3" style={{ borderColor: C.forest }}>
              <p className="text-xs font-black uppercase tracking-wide" style={{ color: C.g500 }}>New Expense</p>
              <div>
                <label className="block text-[10px] font-bold mb-1" style={{ color: C.g500 }}>Category</label>
                <div className="flex flex-wrap gap-2">
                  {EXPENSE_CATEGORIES.map(cat => (
                    <button key={cat.id} type="button" onClick={() => setExpForm(f => ({ ...f, category: cat.id }))}
                      className="px-3 py-1 rounded-xl text-[11px] font-bold transition"
                      style={{ backgroundColor: expForm.category === cat.id ? cat.color : cat.bg, color: expForm.category === cat.id ? '#fff' : cat.color }}>
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold mb-1" style={{ color: C.g500 }}>Title *</label>
                  <input required value={expForm.title} onChange={e => setExpForm(f => ({ ...f, title: e.target.value }))}
                    placeholder="e.g. Cloudflare subscription"
                    className="w-full px-3 py-2 text-xs rounded-xl border outline-none" style={{ borderColor: C.g200 }} />
                </div>
                <div>
                  <label className="block text-[10px] font-bold mb-1" style={{ color: C.g500 }}>Amount (USD) *</label>
                  <input required type="number" min="0" step="0.01" value={expForm.amount_usd} onChange={e => setExpForm(f => ({ ...f, amount_usd: e.target.value }))}
                    placeholder="0.00"
                    className="w-full px-3 py-2 text-xs rounded-xl border outline-none" style={{ borderColor: C.g200 }} />
                </div>
                <div>
                  <label className="block text-[10px] font-bold mb-1" style={{ color: C.g500 }}>Date</label>
                  <input type="date" value={expForm.expense_date} onChange={e => setExpForm(f => ({ ...f, expense_date: e.target.value }))}
                    className="w-full px-3 py-2 text-xs rounded-xl border outline-none" style={{ borderColor: C.g200 }} />
                </div>
                <div>
                  <label className="block text-[10px] font-bold mb-1" style={{ color: C.g500 }}>Paid By</label>
                  <input value={expForm.paid_by} onChange={e => setExpForm(f => ({ ...f, paid_by: e.target.value }))}
                    placeholder="Name or team member"
                    className="w-full px-3 py-2 text-xs rounded-xl border outline-none" style={{ borderColor: C.g200 }} />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-bold mb-1" style={{ color: C.g500 }}>Notes</label>
                <textarea value={expForm.notes} onChange={e => setExpForm(f => ({ ...f, notes: e.target.value }))}
                  rows={2} placeholder="Details..."
                  className="w-full px-3 py-2 text-xs rounded-xl border outline-none resize-none" style={{ borderColor: C.g200 }} />
              </div>
              <div className="flex gap-2">
                <button type="submit" disabled={savingExp}
                  className="flex-1 py-2 rounded-xl text-xs font-bold text-white"
                  style={{ backgroundColor: C.forest, opacity: savingExp ? 0.6 : 1 }}>
                  {savingExp ? 'Saving…' : 'Record Expense'}
                </button>
                <button type="button" onClick={() => setShowExpForm(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold border" style={{ borderColor: C.g200, color: C.g500 }}>
                  Cancel
                </button>
              </div>
            </form>
          )}

          {(expenses || []).length === 0 && !showExpForm && (
            <div className="bg-white rounded-2xl border py-12 text-center" style={{ borderColor: C.g200 }}>
              <Receipt size={32} className="mx-auto mb-2" style={{ color: C.g200 }} />
              <p className="text-sm font-bold" style={{ color: C.g400 }}>No expenses recorded yet</p>
            </div>
          )}

          {(expenses || []).map(exp => {
            const meta = catMeta(exp.category);
            return (
              <div key={exp.id} className="flex items-center gap-3 bg-white rounded-2xl border px-4 py-3.5" style={{ borderColor: C.g200 }}>
                <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: meta.bg }}>
                  <Briefcase size={15} style={{ color: meta.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-black" style={{ color: C.g800 }}>{exp.title}</p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: meta.bg, color: meta.color }}>{meta.label}</span>
                    <span className="text-[10px]" style={{ color: C.g400 }}>
                      {new Date(exp.expense_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                    {exp.paid_by && <span className="text-[10px]" style={{ color: C.g400 }}>by {exp.paid_by}</span>}
                  </div>
                  {exp.notes && <p className="text-[10px] mt-0.5 italic" style={{ color: C.g400 }}>{exp.notes}</p>}
                </div>
                <div className="text-right flex-shrink-0 flex items-center gap-2">
                  <p className="text-sm font-black" style={{ color: '#F97316' }}>{fmt(exp.amount_usd)}</p>
                  <button onClick={() => deleteExpense(exp.id)} className="p-1.5 rounded-lg border" style={{ borderColor: C.g200, color: C.g300 }}>
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Record Payment Modal */}
      {payLoan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="bg-white rounded-2xl w-full max-w-sm p-5 space-y-4">
            <div className="flex items-center justify-between">
              <p className="font-black text-sm" style={{ color: C.g800 }}>Record Payment</p>
              <button onClick={() => setPayLoan(null)} className="p-1 rounded-lg" style={{ color: C.g400 }}><X size={16} /></button>
            </div>
            <div className="p-3 rounded-xl" style={{ backgroundColor: C.g100 }}>
              <p className="text-xs font-bold" style={{ color: C.g800 }}>{payLoan.title}</p>
              <p className="text-[10px] mt-0.5" style={{ color: C.g400 }}>
                Remaining: {fmt(Math.max(0, parseFloat(payLoan.amount_usd) - parseFloat(payLoan.amount_paid_usd)))}
              </p>
            </div>
            <div>
              <label className="block text-[10px] font-bold mb-1" style={{ color: C.g500 }}>Payment Amount (USD)</label>
              <input type="number" min="0.01" step="0.01" value={payAmount}
                onChange={e => setPayAmount(e.target.value)}
                placeholder="Enter amount paid"
                className="w-full px-3 py-2 text-sm rounded-xl border outline-none" style={{ borderColor: C.g200 }} />
            </div>
            <div className="flex gap-2">
              <button onClick={markPaid} disabled={!payAmount || savingPay}
                className="flex-1 py-2 rounded-xl text-xs font-bold text-white"
                style={{ backgroundColor: '#3B82F6', opacity: !payAmount || savingPay ? 0.6 : 1 }}>
                {savingPay ? 'Saving…' : 'Confirm Payment'}
              </button>
              <button onClick={() => setPayLoan(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold border" style={{ borderColor: C.g200, color: C.g500 }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

// ================================================================
// TEAM FINANCE — escrow fee wallet only (no hot wallet, no transfer fees)
// ================================================================
const ESCROW_FEE_WALLET = 'bc1qd8z3zdn2e3eul6y8nmcyjvgle3yzv8ttvsjp49';

function TeamFinanceSection() {
  const [fees, setFees]         = useState(null);
  const [btcPrice, setBtcPrice] = useState(0);
  const [loading, setLoading]   = useState(true);
  const [tab, setTab]           = useState('all');
  const [page, setPage]         = useState(1);
  const PER_PAGE = 20;

  const usd = (btc) => btcPrice > 0
    ? `$${(parseFloat(btc || 0) * btcPrice).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : '';

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const r = await axios.get(`${API_URL}/team/escrow-fees`, { headers: authH() });
      setFees(r.data);
    } catch (e) { if (!silent) toast.error('Failed to load fee data'); }
    finally { if (!silent) setLoading(false); }
  }, []);

  const loadPrice = useCallback(async () => {
    try {
      const r = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd');
      const d = await r.json();
      if (d?.bitcoin?.usd > 0) setBtcPrice(d.bitcoin.usd);
    } catch {}
  }, []);

  // Initial load + auto-refresh every 10 s (silent, no spinner)
  useEffect(() => {
    load();
    loadPrice();
    const iv = setInterval(() => load(true), 10000);
    return () => clearInterval(iv);
  }, [load, loadPrice]);

  const records  = fees?.records || [];
  const filtered = tab === 'trade' ? records.filter(r => !r.is_gift_card)
                 : tab === 'gc'    ? records.filter(r => r.is_gift_card)
                 : records;
  const paged      = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  const totalPages = Math.ceil(filtered.length / PER_PAGE);

  const available = parseFloat(fees?.availableBtc || 0);
  const locked    = parseFloat(fees?.lockedBtc    || 0);
  const total     = parseFloat(fees?.totalBtc     || 0);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-black" style={{ color: C.g800 }}>Finance · Escrow Fee Wallet</h2>
          <p className="text-xs mt-0.5" style={{ color: C.g400 }}>Live balance and all fees collected from trades &amp; gift card transactions</p>
        </div>
        <button onClick={() => load()} className="p-2 rounded-xl border hover:bg-gray-50 transition" style={{ borderColor: C.g200 }}>
          <RefreshCw size={14} style={{ color: C.g500 }} />
        </button>
      </div>

      {/* Wallet balance card */}
      <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: C.g200 }}>
        {/* Card header */}
        <div className="px-5 py-4 flex items-center justify-between" style={{ background: `linear-gradient(135deg, ${C.forest} 0%, ${C.green} 100%)` }}>
          <div>
            <p className="text-[10px] font-black tracking-widest uppercase text-white/50">PRAQEN</p>
            <p className="text-sm font-black text-white mt-0.5">Escrow Fee Wallet</p>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full" style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}>
            <div className="w-1.5 h-1.5 rounded-full bg-green-300 animate-pulse" />
            <p className="text-[11px] font-bold text-white/70">Live</p>
          </div>
        </div>

        {/* Balance rows */}
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: `${C.forest}30`, borderTopColor: C.forest }} />
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: C.g100 }}>
            {/* Available Balance */}
            <div className="flex items-center justify-between px-5 py-4">
              <p className="text-sm font-bold" style={{ color: C.g600 }}>Available Balance</p>
              <div className="text-right">
                <p className="text-xl font-black" style={{ color: C.forest }}>₿ {available.toFixed(8)}</p>
                {btcPrice > 0 && (
                  <p className="text-sm font-semibold mt-0.5" style={{ color: C.g500 }}>≈ {usd(available)}</p>
                )}
              </div>
            </div>
            {/* Locked in Escrow */}
            <div className="flex items-center justify-between px-5 py-4" style={{ backgroundColor: locked > 0 ? '#FFFBEB' : C.g50 }}>
              <p className="text-sm font-bold" style={{ color: C.g600 }}>Locked in Escrow</p>
              <div className="text-right">
                <p className="text-xl font-black" style={{ color: locked > 0 ? C.warn : C.g400 }}>₿ {locked.toFixed(8)}</p>
              </div>
            </div>
            {/* Total Balance */}
            <div className="flex items-center justify-between px-5 py-5" style={{ backgroundColor: '#F0FDF4' }}>
              <p className="text-sm font-black" style={{ color: C.forest }}>Total Balance</p>
              <div className="text-right">
                <p className="text-2xl font-black" style={{ color: C.forest }}>₿ {total.toFixed(8)}</p>
                {btcPrice > 0 && (
                  <p className="text-base font-bold mt-0.5" style={{ color: C.green }}>≈ {usd(total)}</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        {btcPrice > 0 && !loading && (
          <div className="px-5 py-2.5 border-t flex items-center justify-between" style={{ borderColor: C.g100, backgroundColor: C.g50 }}>
            <p className="text-[11px] font-semibold" style={{ color: C.g400 }}>BTC price: ${btcPrice.toLocaleString('en-US')}</p>
            <p className="text-[11px] font-semibold" style={{ color: C.g400 }}>auto-updates every 10s</p>
          </div>
        )}
      </div>

      {/* Summary stats */}
      {!loading && fees && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white rounded-2xl border p-4" style={{ borderColor: C.g200 }}>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#F0FDF4' }}>
                <ArrowLeftRight size={15} style={{ color: C.forest }} />
              </div>
              <p className="text-xs font-black uppercase tracking-wide" style={{ color: C.g500 }}>Trade Fees</p>
            </div>
            <p className="text-xl font-black" style={{ color: C.forest }}>₿{fees.totalTradeBtc}</p>
            {btcPrice > 0 && <p className="text-xs font-semibold mt-0.5" style={{ color: C.g500 }}>{usd(fees.totalTradeBtc)}</p>}
            <p className="text-[10px] mt-2 font-bold" style={{ color: C.g400 }}>{fees.tradeCount} trades · 0.5% fee</p>
          </div>
          <div className="bg-white rounded-2xl border p-4" style={{ borderColor: C.g200 }}>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#FFFBEB' }}>
                <DollarSign size={15} style={{ color: C.gold }} />
              </div>
              <p className="text-xs font-black uppercase tracking-wide" style={{ color: C.g500 }}>Gift Card Fees</p>
            </div>
            <p className="text-xl font-black" style={{ color: C.gold }}>₿{fees.totalGcBtc}</p>
            {btcPrice > 0 && <p className="text-xs font-semibold mt-0.5" style={{ color: C.g500 }}>{usd(fees.totalGcBtc)}</p>}
            <p className="text-[10px] mt-2 font-bold" style={{ color: C.g400 }}>{fees.gcCount} trades · 2% fee</p>
          </div>
          <div className="bg-white rounded-2xl border p-4" style={{ borderColor: C.g200 }}>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#EFF6FF' }}>
                <TrendingUp size={15} style={{ color: C.paid }} />
              </div>
              <p className="text-xs font-black uppercase tracking-wide" style={{ color: C.g500 }}>Total Fees Collected</p>
            </div>
            <p className="text-xl font-black" style={{ color: C.paid }}>₿{fees.totalFeeBtc}</p>
            {btcPrice > 0 && <p className="text-xs font-semibold mt-0.5" style={{ color: C.g500 }}>{usd(fees.totalFeeBtc)}</p>}
            <p className="text-[10px] mt-2 font-bold" style={{ color: C.g400 }}>{(fees.tradeCount || 0) + (fees.gcCount || 0)} total trades</p>
          </div>
        </div>
      )}

      {/* Transaction list */}
      {!loading && fees && (
        <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: C.g200 }}>
          <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: C.g100 }}>
            <div>
              <h3 className="font-black text-sm" style={{ color: C.g800 }}>Fee Transaction History</h3>
              <p className="text-xs mt-0.5" style={{ color: C.g400 }}>{records.length} records</p>
            </div>
            <div className="flex rounded-xl overflow-hidden border" style={{ borderColor: C.g200 }}>
              {[['all', 'All'], ['trade', <span className="inline-flex items-center gap-1"><RefreshCw size={12} className="inline-block" />Trades</span>], ['gc', <span className="inline-flex items-center gap-1"><Gift size={12} className="inline-block" />Gift Cards</span>]].map(([v, l]) => (
                <button key={v} onClick={() => { setTab(v); setPage(1); }}
                  className="px-3 py-1.5 text-xs font-bold transition"
                  style={{ backgroundColor: tab === v ? C.forest : 'transparent', color: tab === v ? '#fff' : C.g500 }}>
                  {l}
                </button>
              ))}
            </div>
          </div>

          {paged.length === 0 ? (
            <div className="py-16 text-center">
              <DollarSign size={36} className="mx-auto mb-2" style={{ color: C.g200 }} />
              <p className="text-sm font-semibold" style={{ color: C.g400 }}>No fee records</p>
            </div>
          ) : (
            paged.map((r, i) => (
              <div key={r.id || i} className="flex items-center gap-4 px-5 py-4 border-t hover:bg-gray-50 transition" style={{ borderColor: C.g100 }}>
                <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: r.is_gift_card ? '#FFFBEB' : '#F0FDF4' }}>
                  {r.is_gift_card
                    ? <DollarSign size={16} style={{ color: C.gold }} />
                    : <ArrowUpRight size={16} style={{ color: C.forest }} />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-black" style={{ color: C.g800 }}>
                    {r.is_gift_card ? 'Gift Card' : 'Trade'} · Platform fee from trade {r.trade_ref}
                  </p>
                  <p className="text-[11px] font-semibold mt-0.5" style={{ color: C.g400 }}>
                    {r.rate}% of ₿{parseFloat(r.trade_btc || 0).toFixed(8)}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-black" style={{ color: C.success }}>+₿{parseFloat(r.amount_btc || 0).toFixed(8)}</p>
                  <p className="text-[11px] font-semibold mt-0.5" style={{ color: C.g400 }}>
                    {btcPrice > 0 ? usd(r.amount_btc) + ' · ' : ''}{fmtAge(r.collected_at)}
                  </p>
                </div>
              </div>
            ))
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-5 py-3 border-t" style={{ borderColor: C.g100 }}>
              <p className="text-xs" style={{ color: C.g400 }}>Page {page} of {totalPages} · {filtered.length} records</p>
              <div className="flex gap-2">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold disabled:opacity-40"
                  style={{ backgroundColor: C.g100, color: C.g600 }}>
                  <ChevronLeft size={13} />
                </button>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold disabled:opacity-40"
                  style={{ backgroundColor: C.g100, color: C.g600 }}>
                  <ChevronRight size={13} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ================================================================
// OVERVIEW
// ================================================================
function OverviewSection({ teamUser }) {
  const [stats, setStats] = useState(null);
  const [recent, setRecent] = useState([]);
  const [disputes, setDisputes] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [s, t, d] = await Promise.allSettled([
      axios.get(`${API_URL}/admin/stats`, { headers: authH() }),
      axios.get(`${API_URL}/admin/trades/all`, { headers: authH(), params: { limit: 6, page: 1 } }),
      axios.get(`${API_URL}/admin/disputes`, { headers: authH() }),
    ]);
    if (s.status === 'fulfilled') setStats(s.value.data);
    if (t.status === 'fulfilled') setRecent(t.value.data.trades?.slice(0, 6) || []);
    if (d.status === 'fulfilled') setDisputes((d.value.data.disputes || []).filter(x => ['OPEN','DISPUTED','IN_REVIEW'].includes(x.status)));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  if (loading) return <Spin />;

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <div className="rounded-2xl p-5 flex items-center gap-4" style={{ background: `linear-gradient(135deg,${C.forest},${C.green})` }}>
        <div className="w-12 h-12 rounded-xl flex items-center justify-center text-xl font-black text-white flex-shrink-0"
          style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}>
          {(teamUser?.username || 'T')[0].toUpperCase()}
        </div>
        <div className="flex-1">
          <p className="text-white/60 text-xs font-semibold uppercase tracking-widest">Welcome back</p>
          <p className="text-white text-xl font-black">{teamUser?.username}</p>
          <p className="text-white/50 text-xs">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
        </div>
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-black flex-shrink-0"
          style={{ backgroundColor: 'rgba(255,255,255,0.15)', color: 'white' }}>
          <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" /> Online
        </span>
      </div>

      {disputes.length > 0 && (
        <div className="rounded-xl p-4 border-2 flex items-center gap-3" style={{ backgroundColor: '#FEF2F2', borderColor: '#FCA5A5' }}>
          <AlertTriangle size={20} style={{ color: C.danger, flexShrink: 0 }} />
          <div className="flex-1">
            <p className="font-black text-sm" style={{ color: '#991B1B' }}>{disputes.length} open dispute{disputes.length > 1 ? 's' : ''} need attention</p>
            <p className="text-xs mt-0.5" style={{ color: '#B91C1C' }}>Go to Disputes section to review and resolve</p>
          </div>
          <span className="text-2xl font-black" style={{ color: C.danger }}>{disputes.length}</span>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={<Users size={22} />} label="Total Users" value={fmt(stats?.totalUsers)} sub={`+${stats?.newUsersToday || 0} today`} />
        <StatCard icon={<ArrowLeftRight size={22} />} label="Active Trades" value={fmt(stats?.activeTrades)} sub="right now" color="#3B82F6" bg="#EFF6FF" />
        <StatCard icon={<AlertTriangle size={22} />} label="Open Disputes" value={fmt(stats?.openDisputes)} sub="need action" color={C.danger} bg="#FEF2F2" pulse={stats?.openDisputes > 0} />
        <StatCard icon={<TrendingUp size={22} />} label="Volume (USD)" value={`$${fmt(stats?.totalVolumeUsd, 0)}`} sub={`${fmtBtc(stats?.totalVolumeBtc)} BTC`} color={C.purple} bg="#F5F3FF" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={<CheckCircle size={22} />} label="Completed" value={fmt(stats?.completedTrades)} color={C.success} bg="#F0FDF4" />
        <StatCard icon={<Shield size={22} />} label="KYC Pending" value={fmt(stats?.pendingKyc)} color={C.warn} bg="#FFFBEB" />
        <StatCard icon={<Activity size={22} />} label="Total Trades" value={fmt(stats?.totalTrades)} color={C.green} bg="#F0FDF4" />
        <StatCard icon={<UserCheck size={22} />} label="New This Week" value={fmt(stats?.newUsersWeek)} color={C.gold} bg="#FFFBEB" />
      </div>

      {stats?.tradeDays && (
        <div className="bg-white rounded-2xl border p-5" style={{ borderColor: C.g200 }}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-black text-sm" style={{ color: C.g700 }}>Trades — Last 7 Days</h3>
            <button onClick={load} className="p-2 rounded-xl border hover:bg-gray-50 transition" style={{ borderColor: C.g200 }}>
              <RefreshCw size={13} style={{ color: C.g500 }} />
            </button>
          </div>
          <div className="flex items-end gap-2 h-28">
            {stats.tradeDays.map((d, i) => {
              const max = Math.max(...stats.tradeDays.map(x => x.count), 1);
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-xs font-bold" style={{ color: C.g500 }}>{d.count}</span>
                  <div className="w-full rounded-t-lg transition-all" style={{ height: `${Math.max((d.count / max) * 88, 4)}px`, backgroundColor: d.count > 0 ? C.forest : C.g200 }} />
                  <span className="text-xs font-semibold" style={{ color: C.g400 }}>{d.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: C.g200 }}>
        <div className="px-5 py-4 border-b flex items-center justify-between" style={{ borderColor: C.g100 }}>
          <h3 className="font-black text-sm" style={{ color: C.g800 }}>Recent Trades</h3>
          <Pill label="Live" color={C.success} bg="#F0FDF4" />
        </div>
        {recent.length === 0 ? <Empty icon={<RefreshCw size={36} className="mx-auto" style={{ color: C.g300 }} />} text="No trades yet" /> : (
          <div className="divide-y" style={{ borderColor: C.g100 }}>
            {recent.map(t => (
              <div key={t.id} className="px-5 py-3 flex items-center gap-3 hover:bg-gray-50 transition">
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-black text-white flex-shrink-0"
                  style={{ backgroundColor: C.green }}>{(t.buyer?.username || '?')[0].toUpperCase()}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-black truncate" style={{ color: C.g800 }}>
                    {t.buyer?.username || '—'} → {t.seller?.username || '—'}
                  </p>
                  <p className="text-xs" style={{ color: C.g400 }}>{fmtAge(t.created_at)} · {t.payment_method || '—'}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-xs font-black" style={{ color: C.g800 }}>${fmt(t.amount_usd, 2)}</p>
                  <Pill label={t.status} color={statusColor(t.status)} bg={`${statusColor(t.status)}15`} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ================================================================
// P2P MIGRATION — traders who submitted a screenshot from Noones/Binance/other
// platforms before signing up. Ported from AdminDashboard.js's P2PMigrationSection
// (same backend endpoints — now open to moderators too via requireTeamOrCeo).
// ================================================================
function P2PMigrationSection() {
  const [submissions, setSubs] = useState([]);
  const [loading, setLoading]  = useState(true);
  const [filter, setFilter]    = useState('pending');
  const [zoomImg, setZoomImg]  = useState(null);
  const [acting, setActing]    = useState(false);
  const [migrationNeeded, setMigrationNeeded] = useState(false);
  const [migrationHint, setMigrationHint]     = useState('');

  const [approveTarget, setApproveTarget] = useState(null);
  const [usernameSeen, setUsernameSeen]   = useState('');
  const [feedbackCount, setFeedbackCount] = useState('');
  const [approveNotes, setApproveNotes]   = useState('');

  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectNotes, setRejectNotes]   = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setMigrationNeeded(false);
    try {
      const r = await axios.get(`${API_URL}/admin/p2p-migration`, { headers: authH(), params: { status: filter } });
      setSubs(r.data.submissions || []);
      if (r.data.migration_needed) {
        setMigrationNeeded(true);
        setMigrationHint(r.data.migration_hint || '');
      }
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to load P2P migration requests');
    } finally { setLoading(false); }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const openApprove = (s) => {
    setApproveTarget(s);
    setUsernameSeen(s.admin_username_seen || '');
    setFeedbackCount(s.admin_feedback_count || '');
    setApproveNotes(s.admin_notes || '');
  };

  const confirmApprove = async () => {
    if (!approveTarget) return;
    setActing(true);
    try {
      await axios.put(`${API_URL}/admin/p2p-migration/${approveTarget.id}/approve`,
        { usernameSeen, feedbackCount, notes: approveNotes }, { headers: authH() });
      toast.success(<span className="inline-flex items-center gap-1"><CheckCircle size={14} /> Approved</span>);
      setApproveTarget(null); setUsernameSeen(''); setFeedbackCount(''); setApproveNotes('');
      load();
    } catch (e) { toast.error(e.response?.data?.error || 'Approval failed'); }
    finally { setActing(false); }
  };

  const confirmReject = async () => {
    if (!rejectTarget) return;
    setActing(true);
    try {
      await axios.put(`${API_URL}/admin/p2p-migration/${rejectTarget.id}/reject`,
        { notes: rejectNotes }, { headers: authH() });
      toast.success('Rejected');
      setRejectTarget(null); setRejectNotes('');
      load();
    } catch (e) { toast.error(e.response?.data?.error || 'Rejection failed'); }
    finally { setActing(false); }
  };

  return (
    <div className="space-y-4">
      {zoomImg && <ImageModal src={zoomImg.src} label={zoomImg.label} onClose={() => setZoomImg(null)} />}

      {approveTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <h3 className="font-black text-base mb-1" style={{ color: C.g800 }}>Approve Migration Request</h3>
            <p className="text-xs mb-4" style={{ color: C.g500 }}>
              Log what you saw on their {MIGRATION_PLATFORM_LABEL[approveTarget.platform] || 'P2P'} profile screenshot for <strong>{approveTarget.email}</strong>.
            </p>
            <label className="block text-xs font-bold mb-1" style={{ color: C.g600 }}>Username on that platform</label>
            <input value={usernameSeen} onChange={e => setUsernameSeen(e.target.value)}
              placeholder="e.g. trader_jane"
              className="w-full border rounded-xl p-2.5 text-sm outline-none mb-3" style={{ borderColor: C.g200, color: C.g700 }} />
            <label className="block text-xs font-bold mb-1" style={{ color: C.g600 }}>Feedback / trade count</label>
            <input value={feedbackCount} onChange={e => setFeedbackCount(e.target.value)}
              placeholder="e.g. 412 trades, 99% positive"
              className="w-full border rounded-xl p-2.5 text-sm outline-none mb-3" style={{ borderColor: C.g200, color: C.g700 }} />
            <label className="block text-xs font-bold mb-1" style={{ color: C.g600 }}>Notes (optional)</label>
            <textarea value={approveNotes} onChange={e => setApproveNotes(e.target.value)} rows={2}
              className="w-full border rounded-xl p-2.5 text-sm outline-none mb-4 resize-none" style={{ borderColor: C.g200, color: C.g700 }} />
            <div className="flex gap-2">
              <button onClick={() => setApproveTarget(null)}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold border" style={{ borderColor: C.g200, color: C.g600 }}>
                Cancel
              </button>
              <button onClick={confirmApprove} disabled={acting}
                className="flex-1 py-2.5 rounded-xl text-sm font-black text-white" style={{ backgroundColor: C.forest }}>
                {acting ? 'Saving…' : <span className="inline-flex items-center gap-1.5"><CheckCircle size={14} /> Approve</span>}
              </button>
            </div>
          </div>
        </div>
      )}

      {rejectTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <h3 className="font-black text-base mb-1" style={{ color: C.g800 }}>Reject Migration Request</h3>
            <p className="text-xs mb-4" style={{ color: C.g500 }}>Rejecting the request from <strong>{rejectTarget.email}</strong>.</p>
            <textarea value={rejectNotes} onChange={e => setRejectNotes(e.target.value)}
              placeholder="e.g. Screenshot doesn't match a real profile…" rows={3}
              className="w-full border rounded-xl p-3 text-sm outline-none mb-4 resize-none" style={{ borderColor: C.g200, color: C.g700 }} />
            <div className="flex gap-2">
              <button onClick={() => setRejectTarget(null)}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold border" style={{ borderColor: C.g200, color: C.g600 }}>
                Cancel
              </button>
              <button onClick={confirmReject} disabled={acting}
                className="flex-1 py-2.5 rounded-xl text-sm font-black text-white" style={{ backgroundColor: '#EF4444' }}>
                {acting ? 'Rejecting…' : <span className="inline-flex items-center gap-1.5"><XCircle size={14} /> Reject</span>}
              </button>
            </div>
          </div>
        </div>
      )}

      <SectionHead title="P2P Migration Requests" sub="Traders who submitted a screenshot from Noones / Binance P2P / other platforms before signing up"
        action={
          <div className="flex gap-2 items-center">
            {['pending', 'approved', 'rejected', 'all'].map(s => (
              <button key={s} onClick={() => setFilter(s)}
                className="px-3 py-1.5 rounded-lg text-xs font-bold capitalize transition"
                style={{ backgroundColor: filter === s ? C.forest : C.g100, color: filter === s ? '#fff' : C.g600 }}>
                {s}
              </button>
            ))}
            <button onClick={load} className="p-2 rounded-xl border hover:bg-gray-50 transition" style={{ borderColor: C.g200 }}>
              <RefreshCw size={14} style={{ color: C.g500 }} />
            </button>
          </div>
        } />

      {migrationNeeded && (
        <div className="flex items-start gap-3 p-4 rounded-2xl border-2" style={{ backgroundColor: '#FFFBEB', borderColor: '#F59E0B' }}>
          <AlertTriangle size={18} style={{ color: '#92400E', flexShrink: 0, marginTop: 1 }} />
          <div>
            <p className="text-sm font-black" style={{ color: '#92400E' }}>Database Migration Required</p>
            <p className="text-xs mt-0.5" style={{ color: '#A16207' }}>{migrationHint}</p>
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: C.g200 }}>
        {loading ? <Spin /> : submissions.length === 0 ? (
          <Empty icon={<Users size={40} strokeWidth={1.5} style={{ color: C.g400 }} />} text="No P2P migration requests — all clear!" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead style={{ backgroundColor: C.g50 }}>
                <tr>
                  {['Email', 'Platform', 'Screenshot', 'Reviewed Info', 'Submitted', 'Status', 'Actions'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-black uppercase tracking-wide" style={{ color: C.g500 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {submissions.map(s => (
                  <tr key={s.id} className="border-t hover:bg-gray-50 transition" style={{ borderColor: C.g100 }}>
                    <td className="px-4 py-3 font-bold text-xs" style={{ color: C.g800 }}>{s.email}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-black px-2 py-1 rounded-lg" style={{ backgroundColor: '#FFFBEB', color: '#92400E' }}>
                        {MIGRATION_PLATFORM_LABEL[s.platform] || 'Other'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {s.screenshot_url ? (
                        <img src={s.screenshot_url} alt="P2P profile screenshot"
                          onClick={() => setZoomImg({ src: s.screenshot_url, label: s.email })}
                          className="w-14 h-14 object-cover rounded-lg cursor-pointer border" style={{ borderColor: C.g200 }} />
                      ) : <span className="text-xs" style={{ color: C.g400 }}>No image</span>}
                    </td>
                    <td className="px-4 py-3 text-xs" style={{ color: C.g600 }}>
                      {s.admin_username_seen || s.admin_feedback_count ? (
                        <>
                          {s.admin_username_seen && <p className="font-bold">@{s.admin_username_seen}</p>}
                          {s.admin_feedback_count && <p style={{ color: C.g400 }}>{s.admin_feedback_count}</p>}
                        </>
                      ) : <span style={{ color: C.g400 }}>—</span>}
                    </td>
                    <td className="px-4 py-3 text-xs" style={{ color: C.g500 }}>
                      {fmtDate(s.created_at)}<br /><span style={{ color: C.g400 }}>{fmtAge(s.created_at)}</span>
                    </td>
                    <td className="px-4 py-3">
                      <Pill label={s.status}
                        color={s.status === 'approved' ? '#166534' : s.status === 'rejected' ? '#991B1B' : '#92400E'}
                        bg={s.status === 'approved' ? '#F0FDF4' : s.status === 'rejected' ? '#FEF2F2' : '#FFFBEB'} />
                    </td>
                    <td className="px-4 py-3">
                      {s.status === 'pending' ? (
                        <div className="flex gap-2">
                          <button onClick={() => openApprove(s)}
                            className="px-3 py-1.5 rounded-lg text-xs font-black text-white" style={{ backgroundColor: C.forest }}>
                            Approve
                          </button>
                          <button onClick={() => { setRejectTarget(s); setRejectNotes(''); }}
                            className="px-3 py-1.5 rounded-lg text-xs font-black" style={{ backgroundColor: '#FEF2F2', color: '#991B1B' }}>
                            Reject
                          </button>
                        </div>
                      ) : <span className="text-xs" style={{ color: C.g400 }}>Reviewed</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ================================================================
// USER MESSAGES & SUGGESTIONS — every message/suggestion sent by users, click to read
// the full message and reply. Ported from AdminDashboard.js's SuggestionsSection (same
// backend endpoints — now open to moderators too via requireTeamOrCeo).
// ================================================================
function TeamSuggestionsSection() {
  const [suggestions, setSugs] = useState([]);
  const [total, setTotal]      = useState(0);
  const [loading, setLoading]  = useState(true);
  const [selected, setSelected]= useState(null);
  const [sort, setSort]        = useState('new');
  const [catFilter, setCat]    = useState('');
  const [statusFilter, setStat]= useState('');
  const [acting, setActing]    = useState(false);
  const [reply, setReply]      = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${API_URL}/admin/suggestions`, {
        headers: authH(),
        params: { sort, category: catFilter, status: statusFilter, limit: 100 },
      });
      setSugs(r.data.suggestions || []);
      setTotal(r.data.total || 0);
    } catch { toast.error('Failed to load suggestions'); }
    finally { setLoading(false); }
  }, [sort, catFilter, statusFilter]);

  useEffect(() => { load(); }, [load]);

  const update = async (id, updates) => {
    setActing(true);
    try {
      const r = await axios.put(`${API_URL}/admin/suggestions/${id}`, updates, { headers: authH() });
      const updated = r.data.suggestion;
      setSugs(prev => prev.map(s => s.id === id ? updated : s));
      if (selected?.id === id) setSelected(updated);
      toast.success(<span className="inline-flex items-center gap-1">Updated <CheckCircle size={14} /></span>);
    } catch (e) { toast.error(e.response?.data?.error || 'Failed'); }
    finally { setActing(false); }
  };

  const del = async (id) => {
    if (!window.confirm('Delete this suggestion permanently?')) return;
    try {
      await axios.delete(`${API_URL}/admin/suggestions/${id}`, { headers: authH() });
      setSugs(prev => prev.filter(s => s.id !== id));
      if (selected?.id === id) setSelected(null);
      toast.success('Deleted');
    } catch { toast.error('Delete failed'); }
  };

  const openModal = (s) => { setSelected(s); setReply(s.admin_reply || ''); };
  const closeModal = () => { setSelected(null); setReply(''); };

  const submitReply = async () => {
    if (!reply.trim() || !selected) return;
    await update(selected.id, { admin_reply: reply.trim() });
  };

  const counts = {
    open:     suggestions.filter(s => s.status === 'open').length,
    pipeline: suggestions.filter(s => ['planned','building','reviewing'].includes(s.status)).length,
    done:     suggestions.filter(s => s.status === 'done').length,
  };

  return (
    <div className="space-y-5">
      <SectionHead title={`User Messages & Suggestions (${total})`} sub="All messages sent by users — click any row to read the full message, see the username, and reply"
        action={<button onClick={load} className="p-2 rounded-xl border hover:bg-gray-50 transition" style={{ borderColor: C.g200 }}><RefreshCw size={14} style={{ color: C.g500 }} /></button>} />

      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Total Ideas',  value: total,           color: C.forest,   bg: '#F0FDF4' },
          { label: 'Open',         value: counts.open,     color: '#3B82F6',  bg: '#EFF6FF' },
          { label: 'In Pipeline',  value: counts.pipeline, color: '#6D28D9',  bg: '#F5F3FF' },
          { label: 'Shipped',     value: counts.done,     color: '#166534',  bg: '#F0FDF4' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-2xl border p-4 text-center" style={{ borderColor: C.g200 }}>
            <p className="text-2xl font-black" style={{ color: s.color }}>{s.value}</p>
            <p className="text-xs font-bold mt-1" style={{ color: C.g600 }}>{s.label}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-2 flex-wrap">
        <select value={sort} onChange={e => setSort(e.target.value)}
          className="bg-white border rounded-xl px-3 py-2 text-sm font-semibold outline-none" style={{ borderColor: C.g200, color: C.g700 }}>
          <option value="new">Newest First</option>
          <option value="votes">Most Voted</option>
        </select>
        <select value={catFilter} onChange={e => setCat(e.target.value)}
          className="bg-white border rounded-xl px-3 py-2 text-sm font-semibold outline-none" style={{ borderColor: C.g200, color: C.g700 }}>
          <option value="">All Categories</option>
          {SUGGESTION_CATS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStat(e.target.value)}
          className="bg-white border rounded-xl px-3 py-2 text-sm font-semibold outline-none" style={{ borderColor: C.g200, color: C.g700 }}>
          <option value="">All Statuses</option>
          {Object.entries(SUGGESTION_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: C.g200 }}>
        {loading ? <Spin /> : suggestions.length === 0 ? <Empty icon={<Lightbulb size={40} strokeWidth={1.5} style={{ color: C.g400 }} />} text="No suggestions yet" /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead style={{ backgroundColor: C.g50 }}>
                <tr>
                  {['Votes', 'Title / Message', 'Category', 'Status', 'From User', 'Date', 'Actions'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-black uppercase tracking-wide" style={{ color: C.g500 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {suggestions.map(s => {
                  const cat  = SUGGESTION_CATS.find(c => c.id === s.category) || SUGGESTION_CATS[4];
                  const stat = SUGGESTION_STATUS[s.status] || SUGGESTION_STATUS.open;
                  return (
                    <tr key={s.id} onClick={() => openModal(s)}
                      className="border-t hover:bg-green-50 cursor-pointer transition"
                      style={{ borderColor: C.g100 }}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <ChevronUp size={13} style={{ color: C.forest }} />
                          <span className="font-black text-sm" style={{ color: C.forest }}>{s.upvotes || 0}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3" style={{ maxWidth: 300 }}>
                        <p className="font-bold text-xs mb-0.5 leading-snug" style={{ color: C.g800 }}>
                          {s.is_pinned && <Pin size={12} className="mr-1 inline-block" />}{s.title}
                        </p>
                        {s.body && (
                          <p className="text-xs leading-relaxed line-clamp-2" style={{ color: C.g500 }}>
                            {s.body}
                          </p>
                        )}
                        {s.admin_reply && (
                          <span className="inline-flex items-center gap-1 mt-1 text-xs font-bold px-2 py-0.5 rounded-full"
                            style={{ backgroundColor: '#F0FDF4', color: '#166534' }}>
                            <MessageSquare size={10} /> Replied
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs px-2 py-0.5 rounded-full font-bold inline-flex items-center gap-1" style={{ backgroundColor: C.g100, color: C.g600 }}>
                          {cat.icon}{cat.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <Pill label={stat.label} color={stat.color} bg={stat.bg} />
                      </td>
                      <td className="px-4 py-3 text-xs font-semibold" style={{ color: C.g600 }}>{s.username || 'Anonymous'}</td>
                      <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: C.g400 }}>{fmtDate(s.created_at)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button onClick={e => { e.stopPropagation(); openModal(s); }}
                            className="px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1 hover:opacity-80 transition"
                            style={{ backgroundColor: '#EFF6FF', color: '#3B82F6' }}>
                            <Eye size={11} /> Open
                          </button>
                          <button onClick={e => { e.stopPropagation(); del(s.id); }}
                            className="p-1.5 rounded-lg hover:bg-red-50 transition">
                            <Trash2 size={12} style={{ color: C.danger }} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.6)' }} onClick={closeModal}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl flex flex-col overflow-hidden"
            style={{ maxHeight: '92vh' }} onClick={e => e.stopPropagation()}>

            <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: C.g100 }}>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg"
                  style={{ backgroundColor: '#F0FDF4' }}>
                  {(SUGGESTION_CATS.find(c => c.id === selected.category) || SUGGESTION_CATS[4]).icon}
                </div>
                <div>
                  <p className="text-xs font-bold" style={{ color: C.g500 }}>Community Suggestion</p>
                  <p className="text-xs font-black" style={{ color: C.g800 }}>
                    {(SUGGESTION_CATS.find(c => c.id === selected.category) || SUGGESTION_CATS[4]).label}
                  </p>
                </div>
              </div>
              <button onClick={closeModal} className="p-2 rounded-xl hover:bg-gray-100 transition">
                <X size={18} style={{ color: C.g500 }} />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">

              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl"
                  style={{ backgroundColor: '#F0FDF4', border: '1px solid #86EFAC' }}>
                  <ChevronUp size={14} style={{ color: C.forest }} />
                  <span className="font-black text-sm" style={{ color: C.forest }}>{selected.upvotes || 0}</span>
                  <span className="text-xs font-semibold" style={{ color: C.mint }}>votes</span>
                </div>
                <Pill label={(SUGGESTION_STATUS[selected.status] || SUGGESTION_STATUS.open).label}
                  color={(SUGGESTION_STATUS[selected.status] || SUGGESTION_STATUS.open).color}
                  bg={(SUGGESTION_STATUS[selected.status] || SUGGESTION_STATUS.open).bg} />
                {selected.is_pinned && (
                  <span className="text-xs px-2 py-1 rounded-xl font-bold"
                    style={{ backgroundColor: '#FFFBEB', color: '#92400E' }}><Pin size={11} className="mr-1 inline-block" /> Pinned</span>
                )}
                <span className="ml-auto text-xs font-semibold" style={{ color: C.g400 }}>
                  {selected.username || 'Anonymous'} · {fmtDate(selected.created_at)}
                </span>
              </div>

              <div>
                <p className="text-xs font-black uppercase tracking-widest mb-2" style={{ color: C.g400 }}>Title</p>
                <p className="text-lg font-black leading-snug" style={{ color: C.g800 }}>
                  {selected.title}
                </p>
              </div>

              {selected.body ? (
                <div>
                  <p className="text-xs font-black uppercase tracking-widest mb-2" style={{ color: C.g400 }}>Full Message</p>
                  <div className="p-4 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap"
                    style={{ backgroundColor: C.g50, color: C.g700, border: `1px solid ${C.g200}`, minHeight: 80 }}>
                    {selected.body}
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-2xl text-sm" style={{ backgroundColor: C.g50, color: C.g400, fontStyle: 'italic' }}>
                  No additional message — title only.
                </div>
              )}

              {selected.admin_reply && (
                <div>
                  <p className="text-xs font-black uppercase tracking-widest mb-2" style={{ color: C.g400 }}>Previous Reply</p>
                  <div className="p-4 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap"
                    style={{ backgroundColor: '#F0FDF4', border: '1px solid #86EFAC', color: '#166534' }}>
                    {selected.admin_reply}
                  </div>
                </div>
              )}

              <div>
                <p className="text-xs font-black uppercase tracking-widest mb-2" style={{ color: C.g400 }}>Update Status</p>
                <select value={selected.status || 'open'} disabled={acting}
                  onChange={e => update(selected.id, { status: e.target.value })}
                  className="w-full border rounded-xl px-4 py-3 text-sm font-semibold outline-none"
                  style={{ borderColor: C.g200, color: C.g700, backgroundColor: '#fff' }}>
                  <option value="open">Open</option>
                  <option value="reviewing">Under Review</option>
                  <option value="planned">Planned</option>
                  <option value="building">Building Now</option>
                  <option value="done">Done / Shipped</option>
                  <option value="rejected">Not Planned</option>
                </select>
              </div>

              <div>
                <p className="text-xs font-black uppercase tracking-widest mb-2" style={{ color: C.g400 }}>
                  {selected.admin_reply ? 'Edit Your Reply' : 'Reply to User'}
                </p>
                <textarea
                  value={reply}
                  onChange={e => setReply(e.target.value)}
                  rows={4}
                  placeholder="Write a public reply — the user will be notified via their notification bell…"
                  className="w-full border rounded-2xl px-4 py-3 text-sm outline-none resize-none"
                  style={{ borderColor: C.g200, color: C.g700, backgroundColor: '#fff', lineHeight: 1.6 }}
                />
              </div>
            </div>

            <div className="px-6 py-4 border-t flex items-center gap-3" style={{ borderColor: C.g100, backgroundColor: C.g50 }}>
              <button onClick={submitReply} disabled={acting || !reply.trim()}
                className="flex-1 py-3 rounded-xl text-sm font-black flex items-center justify-center gap-2 transition"
                style={{
                  backgroundColor: acting || !reply.trim() ? C.g200 : C.forest,
                  color: acting || !reply.trim() ? C.g400 : '#fff',
                  cursor: acting || !reply.trim() ? 'not-allowed' : 'pointer',
                }}>
                <Send size={14} />
                {acting ? 'Saving…' : selected.admin_reply ? 'Update Reply' : 'Send Reply'}
              </button>
              <button disabled={acting} onClick={() => update(selected.id, { is_pinned: !selected.is_pinned })}
                className="px-4 py-3 rounded-xl text-sm font-black transition hover:opacity-80"
                style={{ backgroundColor: '#FFFBEB', color: '#92400E' }}>
                <span className="inline-flex items-center gap-1.5">{selected.is_pinned ? <><Pin size={12} /> Unpin</> : <><Pin size={12} /> Pin</>}</span>
              </button>
              <button onClick={() => del(selected.id)}
                className="px-4 py-3 rounded-xl text-sm font-black flex items-center gap-1.5 transition hover:opacity-80"
                style={{ backgroundColor: '#FEF2F2', color: '#991B1B' }}>
                <Trash2 size={13} /> Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ================================================================
// SUPPORT CHAT — join any live trade as support
// ================================================================
function SupportChatSection({ teamUser }) {
  const [trades, setTrades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMsg, setNewMsg] = useState('');
  const [sending, setSending] = useState(false);
  const [joined, setJoined] = useState(false);
  const [searchQ, setSearchQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('active');
  const chatEnd = useRef(null);

  const STATUS_MAP = { active: ['FUNDS_LOCKED', 'PAYMENT_SENT', 'DISPUTED'], all: [] };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { limit: 50, page: 1 };
      const r = await axios.get(`${API_URL}/admin/trades/all`, { headers: authH(), params });
      let list = r.data.trades || [];
      if (statusFilter === 'active') list = list.filter(t => ['FUNDS_LOCKED','PAYMENT_SENT','DISPUTED','ACTIVE'].includes(t.status));
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
      const r = await axios.get(`${API_URL}/messages/${tradeId}`, { headers: authH() });
      setMessages(r.data.messages || []);
    } catch {}
  }, []);

  useEffect(() => {
    if (!selected) return;
    loadChat(selected.id);
    const iv = setInterval(() => loadChat(selected.id), 4000);
    return () => clearInterval(iv);
  }, [selected, loadChat]);

  useEffect(() => { chatEnd.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const openTrade = (t) => { setSelected(t); setJoined(false); setMessages([]); };

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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-black" style={{ color: C.g800 }}>Support Chat</h2>
          <p className="text-xs mt-0.5" style={{ color: C.g400 }}>Join any live trade as PRAQEN Support and help users in real time</p>
        </div>
        <button onClick={load} className="p-2 rounded-xl border hover:bg-gray-50 transition" style={{ borderColor: C.g200 }}>
          <RefreshCw size={14} style={{ color: C.g500 }} />
        </button>
      </div>

      {/* How it works banner */}
      <div className="flex items-start gap-3 p-4 rounded-xl" style={{ backgroundColor: '#EFF6FF', border: '1px solid #BFDBFE' }}>
        <MessageSquare size={16} style={{ color: C.paid, flexShrink: 0, marginTop: 1 }} />
        <p className="text-xs font-semibold" style={{ color: '#1E40AF' }}>
          Select any active trade below → click <strong>Join as Support</strong> → your messages will appear with a PRAQEN Support badge visible to both the buyer and seller.
        </p>
      </div>

      {/* Filters */}
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

      <div className="flex gap-4" style={{ minHeight: 500 }}>
        {/* Trade list */}
        <div className="w-80 flex-shrink-0 space-y-2 overflow-y-auto" style={{ maxHeight: 600 }}>
          {loading ? <Spin /> : trades.length === 0 ? <Empty icon={<MessageCircle size={36} className="mx-auto" style={{ color: C.g300 }} />} text="No trades found" /> :
            trades.map(t => (
              <div key={t.id}
                onClick={() => openTrade(t)}
                className="bg-white rounded-xl border-2 p-3 cursor-pointer hover:shadow-md transition"
                style={{ borderColor: selected?.id === t.id ? C.forest : C.g200 }}>
                <div className="flex items-center gap-2 mb-2">
                  <Pill label={t.status} color={statusColor(t.status)} bg={`${statusColor(t.status)}15`} />
                  <span className="text-xs font-mono ml-auto" style={{ color: C.g400 }}>#{(t.id || '').slice(0, 8).toUpperCase()}</span>
                </div>
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-6 h-6 rounded-full bg-green-700 flex items-center justify-center text-xs font-black text-white">
                    {(t.buyer?.username || '?')[0].toUpperCase()}
                  </div>
                  <span className="text-xs font-bold" style={{ color: C.g700 }}>{t.buyer?.username || '—'}</span>
                  <span className="text-xs" style={{ color: C.g400 }}>→</span>
                  <div className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center text-xs font-black text-white">
                    {(t.seller?.username || '?')[0].toUpperCase()}
                  </div>
                  <span className="text-xs font-bold" style={{ color: C.g700 }}>{t.seller?.username || '—'}</span>
                </div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-xs font-black" style={{ color: C.g800 }}>${fmt(t.amount_usd, 2)}</span>
                  <span className="text-xs" style={{ color: C.g400 }}>{fmtAge(t.created_at)}</span>
                </div>
                {t.status === 'DISPUTED' && (
                  <div className="mt-2 flex items-center gap-1 text-xs font-bold" style={{ color: C.danger }}>
                    <AlertTriangle size={11} /> Disputed — needs attention
                  </div>
                )}
              </div>
            ))
          }
        </div>

        {/* Chat panel */}
        {selected ? (
          <div className="flex-1 bg-white rounded-2xl border flex flex-col overflow-hidden" style={{ borderColor: C.g200, maxHeight: 600 }}>
            {/* Chat header */}
            <div className="px-5 py-4 border-b flex items-center gap-3 flex-shrink-0" style={{ borderColor: C.g100, backgroundColor: C.g50 }}>
              <div>
                <p className="font-black text-sm" style={{ color: C.g800 }}>
                  {selected.buyer?.username} ↔ {selected.seller?.username}
                </p>
                <p className="text-xs" style={{ color: C.g500 }}>
                  ${fmt(selected.amount_usd, 2)} · {selected.payment_method || '—'} · #{selected.id.slice(0, 8).toUpperCase()}
                </p>
              </div>
              <div className="ml-auto flex items-center gap-2">
                <Pill label={selected.status} color={statusColor(selected.status)} bg={`${statusColor(selected.status)}15`} />
                <button onClick={() => setSelected(null)} className="p-1.5 rounded-lg hover:bg-gray-200">
                  <X size={14} style={{ color: C.g500 }} />
                </button>
              </div>
            </div>

            {/* Join banner */}
            {!joined && (
              <div className="px-5 py-3 flex items-center gap-3 flex-shrink-0" style={{ backgroundColor: '#faf5ff', borderBottom: `1px solid #c4b5fd` }}>
                <Shield size={14} style={{ color: C.purple }} />
                <p className="text-xs font-bold flex-1" style={{ color: C.purpleDark }}>
                  You are viewing this chat. Join to reply as PRAQEN Support.
                </p>
                <button onClick={joinAsSupport}
                  className="px-3 py-1.5 rounded-lg text-xs font-black text-white"
                  style={{ backgroundColor: C.purple }}>
                  Join as Support
                </button>
              </div>
            )}
            {joined && (
              <div className="px-5 py-2 flex items-center gap-2 flex-shrink-0" style={{ backgroundColor: '#faf5ff', borderBottom: `1px solid #c4b5fd` }}>
                <div className="w-2 h-2 rounded-full bg-purple-500 animate-pulse" />
                <p className="text-xs font-bold" style={{ color: C.purpleDark }}>
                  You are live in this chat as <strong>PRAQEN Support · {teamUser?.username}</strong>
                </p>
              </div>
            )}

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0" style={{ backgroundColor: '#f9fafb' }}>
              {messages.length === 0
                ? <div className="flex flex-col items-center justify-center h-full">
                    <MessageCircle size={36} className="mb-2 text-gray-300" />
                    <p className="text-sm font-semibold text-gray-400">No messages yet in this trade</p>
                  </div>
                : messages.map((m, i) => {
                  const isMod = m.sender_role === 'moderator' || (m.message_text || m.message || '').startsWith('[MODERATOR]');
                  const isSys = !m.sender_id || m.message_type === 'SYSTEM' || m.sender_role === 'system';
                  const text = (m.message_text || m.message || '').replace(/^\[MODERATOR\]\s*/, '');
                  const isBuyer = m.sender_id === selected.buyer_id || m.sender_id === selected.buyer?.id;
                  const timeStr = new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                  if (isSys) return (
                    <div key={i} className="flex justify-center">
                      <span className="bg-gray-200 text-gray-600 px-3 py-1 rounded-full text-xs">{text}</span>
                    </div>
                  );
                  if (isMod) return (
                    <div key={i} className="flex justify-center">
                      <div className="w-full max-w-[90%] rounded-xl overflow-hidden border-2" style={{ borderColor: C.purple }}>
                        <div className="px-3 py-1.5 flex items-center gap-2" style={{ background: `linear-gradient(90deg,${C.purpleDark},${C.purple})` }}>
                          <Shield size={11} className="text-white" />
                          <span className="text-xs font-black text-white">PRAQEN Support</span>
                          <span className="ml-auto text-xs text-white/50">{timeStr}</span>
                        </div>
                        <div className="px-3 py-2" style={{ backgroundColor: '#faf5ff' }}>
                          <p className="text-xs text-purple-900 font-medium">{text}</p>
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
                            style={{ backgroundColor: isBuyer ? C.green : C.paid }}>
                            {(isBuyer ? selected.buyer?.username : selected.seller?.username || '?')[0].toUpperCase()}
                          </div>
                          <span className="text-xs font-black" style={{ color: isBuyer ? C.green : C.paid }}>
                            {isBuyer ? selected.buyer?.username : selected.seller?.username}
                          </span>
                          <span className="ml-auto text-xs" style={{ color: C.g400 }}>{timeStr}</span>
                        </div>
                        <div className="px-3 py-2">
                          <p className="text-xs text-slate-800 break-words">{text}</p>
                        </div>
                      </div>
                    </div>
                  );
                })
              }
              <div ref={chatEnd} />
            </div>

            {/* Send message */}
            <form onSubmit={sendMessage} className="flex gap-2 p-4 border-t flex-shrink-0" style={{ borderColor: C.g100 }}>
              <div className="flex-1 relative">
                <input type="text" value={newMsg} onChange={e => setNewMsg(e.target.value)}
                  disabled={!joined}
                  placeholder={joined ? 'Type support message — visible to both parties…' : 'Join the chat first to reply'}
                  className="w-full pl-9 pr-4 py-2.5 border rounded-xl text-xs font-medium outline-none disabled:bg-gray-50 disabled:text-gray-400"
                  style={{ borderColor: newMsg ? C.purple : C.g200 }} />
                <Shield size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: joined ? C.purple : C.g400 }} />
              </div>
              <button type="submit" disabled={sending || !newMsg.trim() || !joined}
                className="px-4 py-2.5 rounded-xl text-white font-black text-xs flex items-center gap-1.5 disabled:opacity-40"
                style={{ backgroundColor: C.purple }}>
                {sending ? <RefreshCw size={12} className="animate-spin" /> : <Send size={12} />} Send
              </button>
            </form>
          </div>
        ) : (
          <div className="flex-1 bg-white rounded-2xl border flex items-center justify-center" style={{ borderColor: C.g200 }}>
            <div className="text-center">
              <MessageSquare size={48} className="mx-auto mb-3 text-gray-300" />
              <p className="font-black" style={{ color: C.g600 }}>Select a trade to open the chat</p>
              <p className="text-xs mt-1" style={{ color: C.g400 }}>Choose any active trade from the left panel</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ================================================================
// LIVE AI CHAT — view & reply to user support ticket conversations
// ================================================================
function LiveAIChatSection() {
  const [tickets, setTickets]   = useState([]);
  const [total, setTotal]       = useState(0);
  const [loading, setLoading]   = useState(true);
  const [selected, setSelected] = useState(null);
  const [messages, setMessages] = useState([]);
  const [reply, setReply]       = useState('');
  const [sending, setSending]   = useState(false);
  const [statusFilter, setStat] = useState('');
  const [searchQ, setSearchQ]   = useState('');
  const chatEndRef              = useRef(null);

  const TICKET_STATUSES = {
    open:     { label: 'Open',     color: '#3B82F6', bg: '#EFF6FF', dot: <Circle size={10} fill="#3B82F6" strokeWidth={0} className="inline-block" /> },
    active:   { label: 'Active',   color: '#166534', bg: '#F0FDF4', dot: <Circle size={10} fill="#10B981" strokeWidth={0} className="inline-block" /> },
    resolved: { label: 'Resolved', color: '#6D28D9', bg: '#F5F3FF', dot: <CheckCircle size={10} className="inline-block" style={{ color: '#6D28D9' }} /> },
    closed:   { label: 'Closed',   color: '#6B7280', bg: '#F9FAFB', dot: <Lock size={10} className="inline-block" style={{ color: '#6B7280' }} /> },
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${API_URL}/admin/support/tickets`, {
        headers: authH(),
        params: { status: statusFilter, limit: 100 },
      });
      let list = r.data.tickets || [];
      if (searchQ.trim()) {
        const q = searchQ.trim().toLowerCase();
        list = list.filter(t =>
          t.username?.toLowerCase().includes(q) ||
          t.subject?.toLowerCase().includes(q) ||
          t.category?.toLowerCase().includes(q)
        );
      }
      setTickets(list);
      setTotal(r.data.total || 0);
    } catch { toast.error('Failed to load chats'); }
    finally { setLoading(false); }
  }, [statusFilter, searchQ]);

  useEffect(() => { load(); }, [load]);

  const openTicket = async (ticket) => {
    setSelected(ticket);
    setReply('');
    setMessages([]);
    try {
      const r = await axios.get(`${API_URL}/admin/support/tickets/${ticket.id}/messages`, { headers: authH() });
      setMessages(r.data.messages || []);
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    } catch { toast.error('Failed to load messages'); }
  };

  const sendReply = async () => {
    if (!reply.trim() || !selected || sending) return;
    setSending(true);
    try {
      const r = await axios.post(`${API_URL}/admin/support/tickets/${selected.id}/reply`, { message: reply.trim() }, { headers: authH() });
      setMessages(prev => [...prev, r.data.message]);
      setReply('');
      setTickets(prev => prev.map(t => t.id === selected.id ? { ...t, status: 'active', updated_at: new Date().toISOString() } : t));
      setSelected(prev => prev ? { ...prev, status: 'active' } : prev);
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
      toast.success('Reply sent');
    } catch (e) { toast.error(e.response?.data?.error || 'Failed to send'); }
    finally { setSending(false); }
  };

  const updateStatus = async (id, status) => {
    try {
      await axios.patch(`${API_URL}/admin/support/tickets/${id}/status`, { status }, { headers: authH() });
      setTickets(prev => prev.map(t => t.id === id ? { ...t, status } : t));
      if (selected?.id === id) setSelected(prev => prev ? { ...prev, status } : prev);
      toast.success('Status updated');
    } catch { toast.error('Failed to update status'); }
  };

  const counts = {
    open:     tickets.filter(t => t.status === 'open').length,
    active:   tickets.filter(t => t.status === 'active').length,
    resolved: tickets.filter(t => t.status === 'resolved').length,
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-black" style={{ color: C.g800 }}>Live AI Chat ({total})</h2>
          <p className="text-xs mt-0.5" style={{ color: C.g400 }}>View and reply to users chatting with our AI support</p>
        </div>
        <button onClick={load} className="p-2 rounded-xl border hover:bg-gray-50 transition" style={{ borderColor: C.g200 }}>
          <RefreshCw size={14} style={{ color: C.g500 }} />
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Total',    value: total,          color: C.forest,  bg: '#F0FDF4' },
          { label: 'Open',     value: counts.open,    color: '#3B82F6', bg: '#EFF6FF' },
          { label: 'Active',   value: counts.active,  color: '#166534', bg: '#F0FDF4' },
          { label: 'Resolved', value: counts.resolved, color: '#6D28D9', bg: '#F5F3FF' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-2xl border p-4 text-center" style={{ borderColor: C.g200 }}>
            <p className="text-2xl font-black" style={{ color: s.color }}>{s.value}</p>
            <p className="text-xs font-bold mt-1" style={{ color: C.g600 }}>{s.label}</p>
          </div>
        ))}
      </div>

      {/* Search + Filter */}
      <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: C.g200 }}>
        <div className="flex items-center gap-2 px-4 py-3 border-b flex-wrap" style={{ borderColor: C.g100 }}>
          <div className="flex items-center gap-2 flex-1 min-w-[180px]">
            <Search size={13} style={{ color: C.g400 }} />
            <input value={searchQ} onChange={e => setSearchQ(e.target.value)}
              placeholder="Search by username, subject…"
              className="flex-1 text-xs outline-none" style={{ color: C.g700 }} />
            {searchQ && <button onClick={() => setSearchQ('')}><X size={12} style={{ color: C.g400 }} /></button>}
          </div>
          <div className="flex items-center gap-1 flex-wrap">
            {['', 'open', 'active', 'resolved', 'closed'].map(s => (
              <button key={s} onClick={() => setStat(s)}
                className="px-3 py-1.5 rounded-lg text-xs font-black transition"
                style={{ backgroundColor: statusFilter === s ? C.forest : C.g100, color: statusFilter === s ? '#fff' : C.g600 }}>
                {s === '' ? 'All' : <span className="inline-flex items-center gap-1">{TICKET_STATUSES[s]?.dot} {TICKET_STATUSES[s]?.label}</span>}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <RefreshCw size={20} className="animate-spin" style={{ color: C.g400 }} />
          </div>
        ) : tickets.length === 0 ? (
          <div className="py-16 text-center">
            <MessageCircle size={36} className="mx-auto mb-2" style={{ color: C.g200 }} />
            <p className="text-sm font-semibold" style={{ color: C.g400 }}>No chats found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ backgroundColor: C.g50 }}>
                  {['User', 'Subject', 'Category', 'Status', 'Last Update', 'Action'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-black" style={{ color: C.g600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tickets.map(t => {
                  const st = TICKET_STATUSES[t.status] || TICKET_STATUSES.open;
                  return (
                    <tr key={t.id} className="border-t hover:bg-gray-50 cursor-pointer transition"
                      style={{ borderColor: C.g100 }} onClick={() => openTicket(t)}>
                      <td className="px-4 py-3">
                        <p className="text-xs font-black" style={{ color: C.g800 }}>{t.username || 'Unknown'}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-xs font-semibold max-w-[200px] truncate" style={{ color: C.g700 }}>{t.subject}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs capitalize font-bold" style={{ color: C.g500 }}>{t.category || 'general'}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs px-2 py-1 rounded-full font-black" style={{ backgroundColor: st.bg, color: st.color }}>
                          {st.dot} {st.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs" style={{ color: C.g400 }}>{fmtAge(t.updated_at)}</span>
                      </td>
                      <td className="px-4 py-3">
                        <button onClick={e => { e.stopPropagation(); openTicket(t); }}
                          className="text-xs px-3 py-1.5 rounded-lg font-black transition hover:opacity-80"
                          style={{ backgroundColor: '#EFF6FF', color: '#3B82F6' }}>
                          View Chat
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Chat Modal */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}>
          <div className="bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col w-full" style={{ maxWidth: 560, height: '85vh' }}>
            {/* Modal header */}
            <div className="flex-shrink-0 border-b" style={{ borderColor: C.g100 }}>
              {/* User info bar */}
              <div className="flex items-center gap-3 px-5 py-3 border-b" style={{ borderColor: C.g100, backgroundColor: '#F0FDF4' }}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 font-black text-sm"
                  style={{ backgroundColor: C.forest, color: '#fff' }}>
                  {selected.avatar_url
                    ? <img src={selected.avatar_url} alt="" className="w-full h-full rounded-xl object-cover" />
                    : (selected.username || 'U')[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-black text-sm leading-none" style={{ color: C.g800 }}>
                    {selected.full_name || selected.username}
                    <span className="font-normal text-xs ml-1.5" style={{ color: C.g500 }}>@{selected.username}</span>
                  </p>
                  <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                    {selected.user_email && <span className="inline-flex items-center gap-1 text-[11px]" style={{ color: C.g500 }}><Mail size={11} className="inline-block" /> {selected.user_email}</span>}
                    {selected.user_phone && <span className="inline-flex items-center gap-1 text-[11px]" style={{ color: C.g500 }}><Phone size={11} className="inline-block" /> {selected.user_phone}</span>}
                    {selected.user_country && <span className="inline-flex items-center gap-1 text-[11px]" style={{ color: C.g500 }}><Globe size={11} className="inline-block" /> {selected.user_country}</span>}
                    {selected.user_joined && <span className="text-[11px]" style={{ color: C.g400 }}>Joined {new Date(selected.user_joined).toLocaleDateString()}</span>}
                  </div>
                </div>
              </div>
              {/* Ticket title + controls */}
              <div className="flex items-start justify-between px-5 py-3">
                <div className="flex-1 min-w-0 pr-4">
                  <p className="font-black text-sm leading-snug" style={{ color: C.g800 }}>{selected.subject}</p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="text-xs font-black px-2 py-0.5 rounded-full"
                      style={{ backgroundColor: (TICKET_STATUSES[selected.status] || TICKET_STATUSES.open).bg, color: (TICKET_STATUSES[selected.status] || TICKET_STATUSES.open).color }}>
                      {(TICKET_STATUSES[selected.status] || TICKET_STATUSES.open).dot} {(TICKET_STATUSES[selected.status] || TICKET_STATUSES.open).label}
                    </span>
                    <span className="text-xs capitalize px-2 py-0.5 rounded-full" style={{ backgroundColor: C.g100, color: C.g600 }}>{selected.category}</span>
                    <span className="text-xs" style={{ color: C.g400 }}>{fmtAge(selected.updated_at)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <select value={selected.status} onChange={e => updateStatus(selected.id, e.target.value)}
                    className="text-xs border rounded-lg px-2 py-1 outline-none"
                    style={{ borderColor: C.g200, color: C.g700, backgroundColor: '#fff' }}>
                    <option value="open">Open</option>
                    <option value="active">Active</option>
                    <option value="resolved">Resolved</option>
                    <option value="closed">Closed</option>
                  </select>
                  <button onClick={() => { setSelected(null); setMessages([]); }}
                    className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-gray-100 transition">
                    <X size={16} style={{ color: C.g500 }} />
                  </button>
                </div>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {messages.length === 0 ? (
                <div className="flex items-center justify-center py-12">
                  <p className="text-sm" style={{ color: C.g400 }}>No messages yet.</p>
                </div>
              ) : messages.map(m => (
                <div key={m.id} className={`flex ${m.is_admin ? 'justify-end' : 'justify-start'}`}>
                  {!m.is_admin && (
                    <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mr-2 self-end" style={{ backgroundColor: C.g200 }}>
                      <span className="text-xs font-black" style={{ color: C.g600 }}>{(selected.username || 'U')[0].toUpperCase()}</span>
                    </div>
                  )}
                  <div className="max-w-[75%]">
                    {!m.is_admin && <p className="text-xs font-black mb-1 ml-1" style={{ color: C.g500 }}>{selected.username}</p>}
                    <div className="px-4 py-2.5 text-sm leading-relaxed"
                      style={{
                        backgroundColor: m.is_admin ? C.forest : C.g100,
                        color: m.is_admin ? '#fff' : C.g700,
                        borderRadius: m.is_admin ? '16px 4px 16px 16px' : '4px 16px 16px 16px',
                      }}>
                      {m.message}
                    </div>
                    <p className="text-xs mt-1 px-1" style={{ color: C.g400, textAlign: m.is_admin ? 'right' : 'left' }}>{fmtAge(m.created_at)}</p>
                  </div>
                  {m.is_admin && (
                    <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ml-2 self-end" style={{ backgroundColor: C.forest }}>
                      <span className="text-xs font-black text-white" style={{ fontFamily: 'Georgia,serif' }}>P</span>
                    </div>
                  )}
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>

            {/* Reply input */}
            <div className="flex-shrink-0 flex gap-3 p-4 border-t" style={{ borderColor: C.g100 }}>
              <textarea
                value={reply}
                onChange={e => setReply(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), sendReply())}
                rows={2}
                placeholder="Type your reply… (Enter to send, Shift+Enter for new line)"
                className="flex-1 border rounded-xl px-4 py-3 text-sm outline-none resize-none transition"
                style={{ borderColor: C.g200, color: C.g800 }}
              />
              <button onClick={sendReply} disabled={sending || !reply.trim()}
                className="w-12 h-12 self-end rounded-xl flex items-center justify-center transition hover:opacity-80"
                style={{ backgroundColor: reply.trim() ? C.forest : C.g100, color: reply.trim() ? '#fff' : C.g400 }}>
                {sending ? <RefreshCw size={16} className="animate-spin" /> : <Send size={16} />}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ================================================================
// TRADE LOOKUP — search by trade ID
// ================================================================
function TradeLookupSection() {
  const [tradeId, setTradeId] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [trades, setTrades] = useState([]);
  const [total, setTotal] = useState(0);
  const [listLoading, setListLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [page, setPage] = useState(1);
  const LIMIT = 20;

  const loadList = useCallback(async () => {
    setListLoading(true);
    try {
      const r = await axios.get(`${API_URL}/admin/trades/all`, { headers: authH(), params: { status: filter, page, limit: LIMIT } });
      setTrades(r.data.trades || []); setTotal(r.data.total || 0);
    } catch {}
    setListLoading(false);
  }, [filter, page]);

  useEffect(() => { setPage(1); }, [filter]);
  useEffect(() => { loadList(); }, [loadList]);

  const lookup = async (e) => {
    e.preventDefault();
    if (!tradeId.trim()) return;
    setErr(''); setResult(null); setLoading(true);
    try {
      const r = await axios.get(`${API_URL}/admin/trades/all`, { headers: authH(), params: { limit: 100, page: 1 } });
      const all = r.data.trades || [];
      const q = tradeId.trim().toLowerCase();
      const found = all.find(t =>
        t.id?.toLowerCase() === q ||
        t.id?.toLowerCase().startsWith(q) ||
        t.trade_ref?.toLowerCase() === q ||
        t.trade_ref?.toLowerCase().startsWith(q)
      );
      if (found) setResult(found);
      else setErr(`No trade found for "${tradeId.trim()}"`);
    } catch { setErr('Failed to search. Try again.'); }
    setLoading(false);
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-black" style={{ color: C.g800 }}>Trade Lookup</h2>
        <p className="text-xs mt-0.5" style={{ color: C.g400 }}>Search by trade ID to see full trade details and diagnose user issues</p>
      </div>

      {/* Search box */}
      <form onSubmit={lookup} className="flex gap-2">
        <div className="flex-1 flex items-center gap-2 bg-white border-2 rounded-xl px-4 py-3" style={{ borderColor: tradeId ? C.forest : C.g200 }}>
          <Hash size={16} style={{ color: C.g400 }} />
          <input value={tradeId} onChange={e => { setTradeId(e.target.value); setErr(''); setResult(null); }}
            placeholder="Paste full or partial trade ID…"
            className="flex-1 text-sm font-semibold outline-none" style={{ color: C.g800 }} />
          {tradeId && <button type="button" onClick={() => { setTradeId(''); setResult(null); setErr(''); }}><X size={13} style={{ color: C.g400 }} /></button>}
        </div>
        <button type="submit" disabled={loading || !tradeId.trim()}
          className="px-5 py-3 rounded-xl text-sm font-black text-white flex items-center gap-2 disabled:opacity-40"
          style={{ backgroundColor: C.forest }}>
          {loading ? <RefreshCw size={14} className="animate-spin" /> : <Search size={14} />} Look Up
        </button>
      </form>

      {err && (
        <div className="flex items-center gap-2 p-3 rounded-xl" style={{ backgroundColor: '#FEF2F2', border: '1px solid #FCA5A5' }}>
          <XCircle size={14} style={{ color: C.danger }} />
          <p className="text-sm font-bold" style={{ color: '#991B1B' }}>{err}</p>
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="bg-white rounded-2xl border-2 overflow-hidden" style={{ borderColor: C.forest }}>
          <div className="px-5 py-4 flex items-center gap-3" style={{ backgroundColor: '#F0FDF4' }}>
            <CheckCircle size={20} style={{ color: C.forest }} />
            <div>
              <p className="text-xs font-black uppercase tracking-wider" style={{ color: C.forest }}>Trade Found</p>
              <p className="font-black" style={{ color: C.g800 }}>#{result.id.slice(0, 14).toUpperCase()}</p>
            </div>
            <div className="ml-auto">
              <Pill label={result.status} color={statusColor(result.status)} bg={`${statusColor(result.status)}15`} />
            </div>
          </div>
          <div className="p-5 grid grid-cols-2 md:grid-cols-3 gap-4">
            {[
              { label: 'Buyer', value: result.buyer?.username || '—', color: C.green },
              { label: 'Seller', value: result.seller?.username || '—', color: C.paid },
              { label: 'USD Amount', value: `$${fmt(result.amount_usd, 2)}`, color: C.gold },
              { label: 'BTC Amount', value: `${fmtBtc(result.amount_btc)} BTC`, color: C.g700 },
              { label: 'Payment Method', value: result.payment_method || '—', color: C.g700 },
              { label: 'Status', value: result.status, color: statusColor(result.status) },
              { label: 'Buyer Confirmed', value: result.buyer_confirmed ? <><CheckCircle size={13} className="inline-block mr-1" style={{ color: C.success }} />Yes</> : <><Clock size={13} className="inline-block mr-1" style={{ color: C.warn }} />No</>, color: C.g700 },
              { label: 'Created', value: fmtDate(result.created_at), color: C.g700 },
              { label: 'Last Updated', value: fmtAge(result.updated_at), color: C.g500 },
            ].map(({ label, value, color }) => (
              <div key={label} className="p-3 rounded-xl border" style={{ backgroundColor: C.g50, borderColor: C.g200 }}>
                <p className="text-xs font-semibold mb-1" style={{ color: C.g400 }}>{label}</p>
                <p className="text-sm font-black" style={{ color }}>{value}</p>
              </div>
            ))}
          </div>
          {result.dispute_reason && (
            <div className="mx-5 mb-5 p-3 rounded-xl border" style={{ backgroundColor: '#FEF2F2', borderColor: '#FCA5A5' }}>
              <p className="text-xs font-black text-red-700 mb-1">Dispute Reason</p>
              <p className="text-sm text-red-800 font-semibold">{result.dispute_reason}</p>
            </div>
          )}
        </div>
      )}

      {/* All trades table */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="font-black text-sm" style={{ color: C.g700 }}>All Trades ({fmt(total)})</p>
          <div className="flex gap-2">
            <select value={filter} onChange={e => setFilter(e.target.value)}
              className="bg-white border rounded-xl px-3 py-1.5 text-xs font-semibold outline-none" style={{ borderColor: C.g200, color: C.g700 }}>
              {['', 'CREATED', 'FUNDS_LOCKED', 'PAYMENT_SENT', 'DISPUTED', 'COMPLETED', 'CANCELLED'].map(s => (
                <option key={s} value={s}>{s || 'All statuses'}</option>
              ))}
            </select>
            <button onClick={loadList} className="p-1.5 rounded-xl border" style={{ borderColor: C.g200 }}>
              <RefreshCw size={13} style={{ color: C.g500 }} />
            </button>
          </div>
        </div>
        <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: C.g200 }}>
          {listLoading ? <Spin /> : trades.length === 0 ? <Empty icon={<RefreshCw size={36} className="mx-auto" style={{ color: C.g300 }} />} text="No trades" /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead style={{ backgroundColor: C.g50 }}>
                  <tr>
                    {['Trade ID', 'Buyer', 'Seller', 'Amount', 'Payment', 'Status', 'Date'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-black uppercase tracking-wide" style={{ color: C.g500 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {trades.map(t => (
                    <tr key={t.id}
                      className="border-t hover:bg-gray-50 cursor-pointer transition"
                      style={{ borderColor: C.g100 }}
                      onClick={() => { setTradeId(t.id); setResult(t); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
                      <td className="px-4 py-3 text-xs font-mono" style={{ color: C.g600 }}>#{t.id.slice(0, 10).toUpperCase()}</td>
                      <td className="px-4 py-3 text-xs font-semibold" style={{ color: C.g700 }}>{t.buyer?.username || '—'}</td>
                      <td className="px-4 py-3 text-xs font-semibold" style={{ color: C.g700 }}>{t.seller?.username || '—'}</td>
                      <td className="px-4 py-3">
                        <p className="text-xs font-black" style={{ color: C.g800 }}>${fmt(t.amount_usd, 2)}</p>
                        <p className="text-xs" style={{ color: C.g400 }}>{fmtBtc(t.amount_btc)} BTC</p>
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: C.g500 }}>{t.payment_method || '—'}</td>
                      <td className="px-4 py-3"><Pill label={t.status} color={statusColor(t.status)} bg={`${statusColor(t.status)}15`} /></td>
                      <td className="px-4 py-3 text-xs" style={{ color: C.g400 }}>{fmtAge(t.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {total > LIMIT && (
            <div className="flex items-center justify-between px-4 py-3 border-t" style={{ borderColor: C.g100 }}>
              <span className="text-xs" style={{ color: C.g400 }}>{(page - 1) * LIMIT + 1}–{Math.min(page * LIMIT, total)} of {total}</span>
              <div className="flex gap-2">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-1 rounded disabled:opacity-30"><ChevronLeft size={16} /></button>
                <button onClick={() => setPage(p => p + 1)} disabled={page * LIMIT >= total} className="p-1 rounded disabled:opacity-30"><ChevronRight size={16} /></button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ================================================================
// DISPUTES / SUPPORT QUEUE
// ================================================================
function DisputesSection({ teamUser }) {
  const [disputes, setDisputes] = useState([]);
  const [resolved, setResolved] = useState([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMsg, setNewMsg] = useState('');
  const [sending, setSending] = useState(false);
  const [joined, setJoined] = useState(false);
  const [notes, setNotes] = useState('');
  const [resolution, setResolution] = useState('BUYER_WINS');
  const [submitting, setSubmitting] = useState(false);
  const [tab, setTab] = useState('open');
  const [detailTab, setDetailTab] = useState('details');
  const chatEnd = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${API_URL}/admin/disputes`, { headers: authH() });
      const all = r.data.disputes || [];
      setDisputes(all.filter(d => ['OPEN','DISPUTED','IN_REVIEW'].includes(d.status)));
      setResolved(all.filter(d => ['COMPLETED','CANCELLED'].includes(d.status) && (d.dispute_reason || d.reason || d.dispute_resolution)));
    } catch { toast.error('Failed to load disputes'); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const loadChat = useCallback(async (id) => {
    if (!id) return;
    try { const r = await axios.get(`${API_URL}/messages/${id}`, { headers: authH() }); setMessages(r.data.messages || []); } catch {}
  }, []);

  useEffect(() => {
    if (!active) return;
    loadChat(active.trade_id);
    const iv = setInterval(() => loadChat(active.trade_id), 5000);
    return () => clearInterval(iv);
  }, [active, loadChat]);
  useEffect(() => { chatEnd.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const openDispute = (d) => { setActive(d); setJoined(false); setNotes(''); setDetailTab('details'); setMessages([]); };

  const joinChat = async () => {
    try { await axios.post(`${API_URL}/trades/${active.trade_id}/moderator-join`, {}, { headers: authH() }); } catch {}
    setJoined(true); toast.success('Joined dispute chat'); loadChat(active.trade_id);
  };

  const sendMessage = async (e) => {
    e.preventDefault(); if (!newMsg.trim()) return; setSending(true);
    try {
      await axios.post(`${API_URL}/messages`, { tradeId: active.trade_id, message: newMsg.trim() }, { headers: authH() });
      setNewMsg(''); loadChat(active.trade_id);
    } catch { toast.error('Send failed'); }
    setSending(false);
  };

  const resolve = async () => {
    if (!notes.trim()) { toast.error('Write decision notes first.'); return; }
    if (!window.confirm(`Cast your vote: ${resolution}? This is one vote, not a final ruling — funds only move once enough moderators agree.`)) return;
    setSubmitting(true);
    try {
      const r = await axios.post(`${API_URL}/admin/disputes/${active.id}/resolve`, { resolution, notes }, { headers: authH() });
      const { status, message } = r.data;
      if (status === 'RESOLVED') { toast.success(`Dispute resolved: ${resolution}`); setActive(null); }
      else if (status === 'SPLIT') { toast.error(message || 'Vote is split — escalated for admin review.'); }
      else { toast.success(message || 'Vote recorded.'); }
      load();
    } catch (e) {
      const err = e.response?.data?.error || 'Failed';
      toast.error(err.includes('Oath') ? 'Sign the Moderator Oath of Trust at /moderator first.' : err);
    }
    setSubmitting(false);
  };

  const fmtB = n => parseFloat(n || 0).toFixed(8);
  const fmtU = n => `$${parseFloat(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-black" style={{ color: C.g800 }}>Disputes</h2>
          <p className="text-xs mt-0.5" style={{ color: C.g400 }}>Review disputes, chat with users, and issue rulings</p>
        </div>
        <button onClick={load} className="p-2 rounded-xl border hover:bg-gray-50" style={{ borderColor: C.g200 }}><RefreshCw size={14} style={{ color: C.g500 }} /></button>
      </div>

      <div className="flex gap-1 p-1 rounded-xl" style={{ backgroundColor: C.g100 }}>
        {[{ id: 'open', label: `Open (${disputes.length})`, color: C.danger }, { id: 'resolved', label: `Resolved (${resolved.length})`, color: C.success }].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className="flex-1 py-2 px-4 rounded-lg text-sm font-black transition"
            style={{ backgroundColor: tab === t.id ? 'white' : 'transparent', color: tab === t.id ? t.color : C.g500, boxShadow: tab === t.id ? '0 1px 3px rgba(0,0,0,0.08)' : 'none' }}>
            {t.label}
          </button>
        ))}
      </div>

      {loading ? <Spin /> : (
        <div className="flex gap-4">
          <div className="flex-1 space-y-3 min-w-0">
            {tab === 'open' && (disputes.length === 0
              ? <div className="bg-white rounded-2xl border p-8 text-center" style={{ borderColor: C.g200 }}><CheckCircle size={40} className="mx-auto mb-3" style={{ color: C.success }} /><p className="font-black" style={{ color: C.g700 }}>No open disputes</p></div>
              : disputes.map(d => (
                <div key={d.id} onClick={() => openDispute(active?.id === d.id ? null : d)}
                  className="bg-white rounded-2xl border-2 p-4 cursor-pointer hover:shadow-md transition"
                  style={{ borderColor: active?.id === d.id ? C.danger : '#FCA5A5', backgroundColor: '#FFF5F5' }}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                        <Pill label="DISPUTED" color="#991B1B" bg="#FEF2F2" />
                        <span className="text-xs font-mono" style={{ color: C.g400 }}>#{(d.trade_id || '').slice(0, 8).toUpperCase()}</span>
                        <span className="text-xs ml-auto" style={{ color: C.g400 }}>{fmtAge(d.created_at)}</span>
                      </div>
                      <p className="text-sm font-black mb-1 truncate" style={{ color: C.g800 }}>{d.reason || 'User opened a dispute'}</p>
                      <p className="text-xs" style={{ color: C.g500 }}>Buyer: <strong>{d.buyer?.username}</strong> · Seller: <strong>{d.seller?.username}</strong> · ₿{fmtB(d.trade_details?.amount_btc)}</p>
                    </div>
                    <span className="text-xs px-2 py-1 rounded-lg font-bold" style={{ backgroundColor: C.purpleLight, color: C.purple }}>Review →</span>
                  </div>
                </div>
              ))
            )}
            {tab === 'resolved' && (resolved.length === 0 ? <Empty icon={<Scale size={36} className="mx-auto" style={{ color: C.g300 }} />} text="No resolved disputes yet" /> :
              resolved.map(d => {
                const res = d.resolution || d.dispute_resolution;
                const rc = res === 'BUYER_WINS' ? C.success : res === 'SELLER_WINS' ? C.paid : C.danger;
                return (
                  <div key={d.id} className="bg-white rounded-2xl border p-4" style={{ borderColor: C.g200 }}>
                    <div className="flex items-center gap-2 mb-2">
                      <Pill label={res?.replace(/_/g, ' ') || 'RESOLVED'} color={rc} bg={`${rc}15`} />
                      <span className="text-xs font-mono" style={{ color: C.g400 }}>#{(d.trade_id || '').slice(0, 8).toUpperCase()}</span>
                      <span className="text-xs ml-auto" style={{ color: C.g400 }}>{fmtAge(d.resolved_at || d.updated_at)}</span>
                    </div>
                    <p className="text-sm font-bold mb-1" style={{ color: C.g700 }}>{d.reason || 'Dispute resolved'}</p>
                    <p className="text-xs" style={{ color: C.g500 }}>Buyer: <strong>{d.buyer?.username}</strong> · Seller: <strong>{d.seller?.username}</strong>{d.resolved_by_name ? ` · Resolved by: ${d.resolved_by_name}` : ''}</p>
                  </div>
                );
              })
            )}
          </div>

          {active && tab === 'open' && (
            <div className="w-96 bg-white rounded-2xl border flex flex-col flex-shrink-0 overflow-hidden" style={{ borderColor: C.g200, maxHeight: '82vh' }}>
              <div className="px-5 py-4 border-b flex items-center justify-between flex-shrink-0" style={{ borderColor: C.g100, backgroundColor: '#faf5ff' }}>
                <div>
                  <p className="text-xs font-black uppercase tracking-wider" style={{ color: C.purple }}>Active Dispute</p>
                  <p className="font-black text-sm" style={{ color: C.g800 }}>#{(active.trade_id || '').slice(0, 8).toUpperCase()}</p>
                </div>
                <button onClick={() => setActive(null)} className="p-1.5 rounded-lg hover:bg-gray-100"><X size={16} style={{ color: C.g400 }} /></button>
              </div>
              <div className="flex border-b px-2 flex-shrink-0" style={{ borderColor: C.g100 }}>
                {[{ id: 'details', l: 'Details' }, { id: 'chat', l: 'Chat' }, { id: 'resolve', l: 'Resolve' }].map(t => (
                  <button key={t.id} onClick={() => setDetailTab(t.id)}
                    className={`py-3 px-3 text-xs font-bold border-b-2 transition ${detailTab === t.id ? 'border-purple-600 text-purple-600' : 'border-transparent text-gray-500'}`}>{t.l}</button>
                ))}
              </div>
              <div className="flex-1 overflow-y-auto p-4 min-h-0">
                {detailTab === 'details' && (
                  <div className="space-y-3">
                    <div className="p-3 rounded-xl" style={{ backgroundColor: '#FEF2F2', border: '1px solid #FCA5A5' }}>
                      <p className="text-xs font-black text-red-700 mb-1">Dispute Reason</p>
                      <p className="text-sm font-bold text-red-800">{active.reason || 'No reason provided'}</p>
                      <p className="text-xs text-red-400 mt-1">{fmtAge(active.created_at)}</p>
                    </div>
                    {[
                      { l: 'BTC in Escrow', v: `₿ ${fmtB(active.trade_details?.amount_btc)}`, c: C.gold },
                      { l: 'USD Value', v: fmtU(active.trade_details?.amount_usd), c: C.success },
                      { l: 'Buyer', v: active.buyer?.username || '—', c: C.green },
                      { l: 'Seller', v: active.seller?.username || '—', c: C.paid },
                      { l: 'Payment', v: active.trade_details?.payment_method || '—', c: C.g600 },
                      { l: 'Buyer Confirmed', v: active.trade_details?.buyer_confirmed ? <><CheckCircle size={13} className="inline-block mr-1" style={{ color: C.success }} />Yes</> : <><Clock size={13} className="inline-block mr-1" style={{ color: C.warn }} />No</>, c: C.g600 },
                    ].map(({ l, v, c }) => (
                      <div key={l} className="flex justify-between py-2 border-b text-sm" style={{ borderColor: C.g100 }}>
                        <span style={{ color: C.g400 }}>{l}</span>
                        <span className="font-black" style={{ color: c }}>{v}</span>
                      </div>
                    ))}
                  </div>
                )}
                {detailTab === 'chat' && (
                  <div className="flex flex-col" style={{ height: 380 }}>
                    {!joined && (
                      <div className="bg-purple-50 border border-purple-200 rounded-xl p-3 mb-3 text-center">
                        <p className="font-black text-purple-800 text-xs mb-2">Join to chat with both parties</p>
                        <button onClick={joinChat} className="px-4 py-1.5 rounded-lg text-white font-black text-xs" style={{ backgroundColor: C.purple }}>Join Chat</button>
                      </div>
                    )}
                    <div className="flex-1 overflow-y-auto space-y-2 p-2 rounded-xl border min-h-0" style={{ backgroundColor: C.g50 }}>
                      {messages.length === 0
                        ? <div className="flex items-center justify-center h-full"><p className="text-xs text-gray-400">No messages</p></div>
                        : messages.map((m, i) => {
                          const isMod = m.sender_role === 'moderator' || (m.message_text || m.message || '').startsWith('[MODERATOR]');
                          const isSys = !m.sender_id || m.message_type === 'SYSTEM';
                          const text = (m.message_text || m.message || '').replace(/^\[MODERATOR\]\s*/, '');
                          const isBuyer = m.sender_id === active.buyer?.id;
                          if (isSys) return <div key={i} className="flex justify-center"><span className="bg-gray-200 text-gray-600 px-3 py-1 rounded-full text-xs">{text}</span></div>;
                          if (isMod) return (
                            <div key={i} className="flex justify-center">
                              <div className="w-full rounded-lg overflow-hidden border" style={{ borderColor: C.purple }}>
                                <div className="px-2 py-1 flex items-center gap-1" style={{ background: C.purple }}><Shield size={10} className="text-white" /><span className="text-xs font-black text-white">Support</span></div>
                                <div className="px-2 py-1.5" style={{ backgroundColor: '#faf5ff' }}><p className="text-xs text-purple-900">{text}</p></div>
                              </div>
                            </div>
                          );
                          return (
                            <div key={i} className={`flex ${isBuyer ? 'justify-start' : 'justify-end'}`}>
                              <div className="max-w-[80%] rounded-xl px-3 py-2 border" style={{ backgroundColor: isBuyer ? 'white' : '#f0fdf4', borderColor: isBuyer ? C.g200 : '#86efac' }}>
                                <p className="text-xs font-bold mb-0.5" style={{ color: isBuyer ? C.green : C.paid }}>{isBuyer ? active.buyer?.username : active.seller?.username}</p>
                                <p className="text-xs">{text}</p>
                              </div>
                            </div>
                          );
                        })
                      }
                      <div ref={chatEnd} />
                    </div>
                    {joined && (
                      <form onSubmit={sendMessage} className="flex gap-2 mt-2">
                        <input value={newMsg} onChange={e => setNewMsg(e.target.value)} placeholder="Message both parties…"
                          className="flex-1 px-3 py-2 border rounded-xl text-xs outline-none" style={{ borderColor: C.g200 }} />
                        <button type="submit" disabled={sending || !newMsg.trim()} className="px-3 py-2 rounded-xl text-white font-black text-xs disabled:opacity-40" style={{ backgroundColor: C.purple }}>
                          {sending ? <RefreshCw size={11} className="animate-spin" /> : <Send size={11} />}
                        </button>
                      </form>
                    )}
                  </div>
                )}
                {detailTab === 'resolve' && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      {[{ l: 'BTC', v: `₿ ${fmtB(active.trade_details?.amount_btc)}`, c: C.gold }, { l: 'USD', v: fmtU(active.trade_details?.amount_usd), c: C.success }, { l: 'Buyer', v: active.buyer?.username, c: C.green }, { l: 'Seller', v: active.seller?.username, c: C.paid }].map(({ l, v, c }) => (
                        <div key={l} className="p-2 rounded-xl text-center border" style={{ backgroundColor: C.g50 }}><p className="text-xs text-gray-400">{l}</p><p className="text-sm font-black" style={{ color: c }}>{v}</p></div>
                      ))}
                    </div>
                    <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Decision notes (required)…"
                      className="w-full border rounded-xl px-3 py-2 text-xs outline-none resize-none"
                      style={{ borderColor: notes ? C.purple : C.g200 }} />
                    <div className="space-y-1.5">
                      {[
                        { v: 'BUYER_WINS', l: <span className="inline-flex items-center gap-1"><CheckCircle size={13} className="inline-block" style={{ color: C.success }} />Buyer Wins</span>, c: C.success, bg: '#ECFDF5' },
                        { v: 'SELLER_WINS', l: <span className="inline-flex items-center gap-1"><CheckCircle size={13} className="inline-block" style={{ color: C.paid }} />Seller Wins</span>, c: C.paid, bg: '#EFF6FF' },
                        { v: 'CANCEL', l: <span className="inline-flex items-center gap-1"><XCircle size={13} className="inline-block" style={{ color: C.danger }} />Cancel Trade</span>, c: C.danger, bg: '#FEF2F2' },
                      ].map(o => (
                        <button key={o.v} onClick={() => setResolution(o.v)}
                          className="w-full text-left py-2.5 px-3 rounded-xl text-xs font-bold border-2 transition"
                          style={{ backgroundColor: resolution === o.v ? o.bg : 'white', color: resolution === o.v ? o.c : C.g500, borderColor: resolution === o.v ? o.c : C.g200 }}>
                          {o.l}
                        </button>
                      ))}
                    </div>
                    <button onClick={resolve} disabled={submitting || !notes.trim()}
                      className="w-full py-3 rounded-xl text-sm font-black text-white flex items-center justify-center gap-2 disabled:opacity-40"
                      style={{ backgroundColor: C.purple }}>
                      {submitting ? <><RefreshCw size={14} className="animate-spin" /> Processing…</> : <><Gavel size={14} /> Cast Vote</>}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ================================================================
// FEEDBACK — all platform reviews
// ================================================================
function FeedbackSection() {
  const [reviews, setReviews] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [ratingFilter, setRatingFilter] = useState('');
  const [page, setPage] = useState(1);
  const LIMIT = 30;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${API_URL}/admin/reviews`, { headers: authH(), params: { page, limit: LIMIT, rating: ratingFilter } });
      setReviews(r.data.reviews || []); setTotal(r.data.total || 0);
    } catch { toast.error('Failed to load feedback'); }
    setLoading(false);
  }, [page, ratingFilter]);

  useEffect(() => { setPage(1); }, [ratingFilter]);
  useEffect(() => { load(); }, [load]);

  const positive = reviews.filter(r => r.rating >= 4).length;
  const negative = reviews.filter(r => r.rating <= 2).length;
  const avg = reviews.length ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1) : '—';

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-black" style={{ color: C.g800 }}>User Feedback</h2>
          <p className="text-xs mt-0.5" style={{ color: C.g400 }}>All platform reviews left by users after completed trades</p>
        </div>
        <button onClick={load} className="p-2 rounded-xl border hover:bg-gray-50" style={{ borderColor: C.g200 }}><RefreshCw size={14} style={{ color: C.g500 }} /></button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total Reviews', value: fmt(total), icon: <Star size={20} />, color: C.gold, bg: '#FFFBEB' },
          { label: 'Avg Rating', value: avg, icon: <TrendingUp size={20} />, color: C.success, bg: '#F0FDF4' },
          { label: 'Positive (4-5★)', value: fmt(positive), icon: <ThumbsUp size={20} />, color: C.success, bg: '#F0FDF4' },
          { label: 'Negative (1-2★)', value: fmt(negative), icon: <ThumbsDown size={20} />, color: C.danger, bg: '#FEF2F2' },
        ].map(({ label, value, icon, color, bg }) => (
          <StatCard key={label} icon={icon} label={label} value={value} color={color} bg={bg} />
        ))}
      </div>

      {/* Filter */}
      <div className="flex gap-2 items-center">
        <Filter size={14} style={{ color: C.g400 }} />
        <div className="flex gap-1">
          {['', '5', '4', '3', '2', '1'].map(r => (
            <button key={r} onClick={() => setRatingFilter(r)}
              className="px-3 py-1.5 rounded-lg text-xs font-bold transition"
              style={{
                backgroundColor: ratingFilter === r ? C.forest : 'white',
                color: ratingFilter === r ? 'white' : C.g600,
                border: `1px solid ${ratingFilter === r ? C.forest : C.g200}`,
              }}>
              {r ? `${r}★` : 'All'}
            </button>
          ))}
        </div>
        <span className="text-xs ml-2" style={{ color: C.g400 }}>{fmt(total)} reviews</span>
      </div>

      {/* Reviews list */}
      {loading ? <Spin /> : reviews.length === 0 ? <Empty icon={<Star size={36} className="mx-auto" style={{ color: C.g300 }} />} text="No reviews yet" /> : (
        <div className="space-y-3">
          {reviews.map((rv, i) => (
            <div key={rv.id || i} className="bg-white rounded-2xl border p-4 hover:shadow-sm transition" style={{ borderColor: C.g200 }}>
              <div className="flex items-start gap-3">
                {/* Reviewer */}
                <div className="flex-shrink-0">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-black text-white"
                    style={{ backgroundColor: C.forest }}>
                    {(rv.reviewer?.username || '?')[0].toUpperCase()}
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <p className="text-sm font-black" style={{ color: C.g800 }}>{rv.reviewer?.username || 'Anonymous'}</p>
                    <span className="text-xs" style={{ color: C.g400 }}>reviewed</span>
                    <p className="text-sm font-black" style={{ color: C.green }}>{rv.reviewee?.username || '—'}</p>
                    <span className="ml-auto text-xs" style={{ color: C.g400 }}>{fmtAge(rv.created_at)}</span>
                  </div>
                  <div className="flex items-center gap-2 mb-2">
                    <Stars rating={rv.rating} />
                    <span className="text-xs font-black" style={{ color: rv.rating >= 4 ? C.success : rv.rating <= 2 ? C.danger : C.warn }}>
                      {rv.rating}/5
                    </span>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${rv.rating >= 4 ? 'bg-green-50 text-green-700' : rv.rating <= 2 ? 'bg-red-50 text-red-700' : 'bg-yellow-50 text-yellow-700'}`}>
                      {rv.rating >= 4 ? <><ThumbsUp size={12} className="inline-block mr-1" />Positive</> : rv.rating <= 2 ? <><ThumbsDown size={12} className="inline-block mr-1" />Negative</> : <><Minus size={12} className="inline-block mr-1" />Neutral</>}
                    </span>
                  </div>
                  {rv.comment && (
                    <p className="text-sm text-gray-700 leading-relaxed bg-gray-50 px-3 py-2 rounded-xl border" style={{ borderColor: C.g100 }}>
                      "{rv.comment}"
                    </p>
                  )}
                  {rv.trade_id && (
                    <p className="text-xs mt-1.5" style={{ color: C.g400 }}>
                      Trade #{rv.trade_id.slice(0, 8).toUpperCase()}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {total > LIMIT && (
        <div className="flex items-center justify-between">
          <span className="text-xs" style={{ color: C.g400 }}>{(page - 1) * LIMIT + 1}–{Math.min(page * LIMIT, total)} of {total}</span>
          <div className="flex gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg border text-xs font-bold disabled:opacity-30"
              style={{ borderColor: C.g200, color: C.g600 }}><ChevronLeft size={13} /> Prev</button>
            <button onClick={() => setPage(p => p + 1)} disabled={page * LIMIT >= total}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg border text-xs font-bold disabled:opacity-30"
              style={{ borderColor: C.g200, color: C.g600 }}>Next <ChevronRight size={13} /></button>
          </div>
        </div>
      )}
    </div>
  );
}

// ================================================================
// TOP TRADERS
// ================================================================
function TopTradersSection() {
  const [traders, setTraders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState('trades');
  const [selected, setSelected] = useState(null);
  const [userReviews, setUserReviews] = useState([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${API_URL}/admin/top-traders`, { headers: authH(), params: { sort, limit: 30 } });
      setTraders(r.data.traders || []);
    } catch (err) { toast.error(err.response?.data?.error || 'Failed to load top traders'); }
    setLoading(false);
  }, [sort]);

  useEffect(() => { load(); }, [load]);

  const viewUser = async (u) => {
    setSelected(u); setUserReviews([]); setReviewsLoading(true);
    try {
      const r = await axios.get(`${API_URL}/users/${u.id}/reviews`);
      setUserReviews(r.data.reviews?.slice(0, 5) || []);
    } catch {}
    setReviewsLoading(false);
  };

  const medals = [
    <Medal size={22} className="inline-block" style={{ color: '#F59E0B', fill: '#FDE68A' }} />,
    <Medal size={22} className="inline-block" style={{ color: '#9CA3AF', fill: '#E5E7EB' }} />,
    <Medal size={22} className="inline-block" style={{ color: '#92400E', fill: '#D6B38A' }} />,
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-black" style={{ color: C.g800 }}>Top Traders</h2>
          <p className="text-xs mt-0.5" style={{ color: C.g400 }}>Most active users and highest value traders on the platform</p>
        </div>
        <button onClick={load} className="p-2 rounded-xl border hover:bg-gray-50" style={{ borderColor: C.g200 }}><RefreshCw size={14} style={{ color: C.g500 }} /></button>
      </div>

      {/* Sort toggle */}
      <div className="flex gap-2 items-center">
        <Trophy size={14} style={{ color: C.gold }} />
        <div className="flex rounded-xl overflow-hidden border" style={{ borderColor: C.g200 }}>
          {[{ v: 'trades', l: 'Most Trades' }, { v: 'volume', l: 'Most Volume' }].map(o => (
            <button key={o.v} onClick={() => setSort(o.v)}
              className="px-4 py-2 text-xs font-bold transition"
              style={{ backgroundColor: sort === o.v ? C.forest : 'white', color: sort === o.v ? 'white' : C.g600 }}>
              {o.l}
            </button>
          ))}
        </div>
        <span className="text-xs" style={{ color: C.g400 }}>Sorted by: <strong>{sort === 'trades' ? 'number of trades' : 'USD volume'}</strong></span>
      </div>

      <div className="flex gap-4">
        {/* Leaderboard */}
        <div className="flex-1 bg-white rounded-2xl border overflow-hidden" style={{ borderColor: C.g200 }}>
          {loading ? <Spin /> : traders.length === 0 ? <Empty icon={<Trophy size={36} className="mx-auto" style={{ color: C.g300 }} />} text="No data yet" /> : (
            <>
              {/* Top 3 podium */}
              {traders.slice(0, 3).length > 0 && (
                <div className="p-5 border-b" style={{ borderColor: C.g100, background: `linear-gradient(135deg,${C.g50},white)` }}>
                  <p className="text-xs font-black uppercase tracking-widest mb-4" style={{ color: C.g500 }}>Top Performers</p>
                  <div className="flex gap-3">
                    {traders.slice(0, 3).map((u, i) => {
                      const bd = badgeColor(u.badge);
                      return (
                        <div key={u.id} onClick={() => viewUser(u)}
                          className="flex-1 rounded-2xl border-2 p-4 text-center cursor-pointer hover:shadow-lg transition"
                          style={{ borderColor: i === 0 ? C.gold : i === 1 ? '#9CA3AF' : '#92400E' }}>
                          <div className="text-2xl mb-2">{medals[i]}</div>
                          <div className="w-12 h-12 rounded-xl flex items-center justify-center text-xl font-black text-white mx-auto mb-2"
                            style={{ backgroundColor: C.forest }}>{(u.username || '?')[0].toUpperCase()}</div>
                          <p className="font-black text-sm truncate" style={{ color: C.g800 }}>{u.username}</p>
                          <span className="inline-block px-2 py-0.5 rounded-full text-xs font-black mt-1" style={{ backgroundColor: bd.bg, color: bd.c }}>{u.badge || 'BEGINNER'}</span>
                          <p className="text-lg font-black mt-2" style={{ color: C.forest }}>
                            {sort === 'trades' ? fmt(u.total_trades) : `$${fmt(u.total_volume_usd, 0)}`}
                          </p>
                          <p className="text-xs" style={{ color: C.g400 }}>{sort === 'trades' ? 'trades' : 'volume'}</p>
                          <div className="flex items-center justify-center gap-1 mt-1">
                            <Star size={11} className="fill-yellow-400 text-yellow-400" />
                            <span className="text-xs font-bold" style={{ color: C.g600 }}>{parseFloat(u.average_rating || 0).toFixed(1)}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Rest of leaderboard */}
              <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead style={{ backgroundColor: C.g50 }}>
                  <tr>
                    {['#', 'Trader', 'Badge', 'Trades', 'Volume', 'Rating', 'Status', 'Last Active'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-black uppercase tracking-wide" style={{ color: C.g500 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {traders.map((u, i) => {
                    const bd = badgeColor(u.badge);
                    return (
                      <tr key={u.id} onClick={() => viewUser(selected?.id === u.id ? null : u)}
                        className="border-t hover:bg-gray-50 cursor-pointer transition"
                        style={{ borderColor: C.g100, backgroundColor: selected?.id === u.id ? '#F0FDF4' : undefined }}>
                        <td className="px-4 py-3 text-sm font-black" style={{ color: i < 3 ? C.gold : C.g500 }}>
                          {i < 3 ? medals[i] : i + 1}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-black text-white flex-shrink-0"
                              style={{ backgroundColor: C.forest }}>{(u.username || '?')[0].toUpperCase()}</div>
                            <div>
                              <p className="font-bold text-xs" style={{ color: C.g800 }}>{u.username}</p>
                              <p className="text-xs" style={{ color: C.g400 }}>{u.country || '—'}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs font-black px-2 py-0.5 rounded-full" style={{ backgroundColor: bd.bg, color: bd.c }}>{u.badge || 'BEGINNER'}</span>
                        </td>
                        <td className="px-4 py-3 text-sm font-black" style={{ color: C.g800 }}>{fmt(u.total_trades)}</td>
                        <td className="px-4 py-3 text-sm font-bold" style={{ color: C.g700 }}>
                          {u.total_volume_usd ? `$${fmt(u.total_volume_usd, 0)}` : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <Stars rating={u.average_rating} />
                            <span className="text-xs font-bold ml-1" style={{ color: C.g700 }}>{parseFloat(u.average_rating || 0).toFixed(1)}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <Pill
                            label={u.account_status || 'active'}
                            color={u.account_status === 'banned' ? '#991B1B' : '#166534'}
                            bg={u.account_status === 'banned' ? '#FEF2F2' : '#F0FDF4'}
                          />
                        </td>
                        <td className="px-4 py-3 text-xs" style={{ color: C.g400 }}>{fmtAge(u.last_seen_at)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            </>
          )}
        </div>

        {/* User detail panel */}
        {selected && (
          <div className="w-72 bg-white rounded-2xl border p-5 flex-shrink-0" style={{ borderColor: C.g200 }}>
            <div className="flex items-start justify-between mb-4">
              <h3 className="font-black text-sm" style={{ color: C.g800 }}>Trader Profile</h3>
              <button onClick={() => setSelected(null)}><X size={14} style={{ color: C.g400 }} /></button>
            </div>
            <div className="text-center mb-4">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-black text-white mx-auto mb-2"
                style={{ backgroundColor: C.forest }}>{(selected.username || '?')[0].toUpperCase()}</div>
              <p className="font-black" style={{ color: C.g800 }}>{selected.username}</p>
              <p className="text-xs mb-2" style={{ color: C.g400 }}>{selected.country || '—'}</p>
              <div className="flex items-center justify-center gap-1 mb-1"><Stars rating={selected.average_rating} /></div>
              <span className="text-xs font-black px-3 py-1 rounded-full" style={{ backgroundColor: badgeColor(selected.badge).bg, color: badgeColor(selected.badge).c }}>{selected.badge || 'BEGINNER'}</span>
            </div>
            <div className="space-y-1.5 mb-4">
              {[
                { l: 'Total Trades', v: fmt(selected.total_trades) },
                { l: 'Volume', v: selected.total_volume_usd ? `$${fmt(selected.total_volume_usd, 0)}` : '—' },
                { l: 'Avg Rating', v: <span className="inline-flex items-center gap-1"><Star size={12} className="inline-block" style={{ color: C.gold }} />{parseFloat(selected.average_rating || 0).toFixed(1)}</span> },
                { l: 'Positive', v: <span className="inline-flex items-center gap-1"><ThumbsUp size={12} className="inline-block" style={{ color: C.success }} />{fmt(selected.positive_feedback)}</span> },
                { l: 'Negative', v: <span className="inline-flex items-center gap-1"><ThumbsDown size={12} className="inline-block" style={{ color: C.danger }} />{fmt(selected.negative_feedback)}</span> },
                { l: 'Member Since', v: fmtDate(selected.created_at) },
                { l: 'Last Active', v: fmtAge(selected.last_seen_at) },
                { l: 'Status', v: selected.account_status || 'active' },
              ].map(({ l, v }) => (
                <div key={l} className="flex justify-between py-1.5 border-b text-xs" style={{ borderColor: C.g100 }}>
                  <span style={{ color: C.g400 }}>{l}</span>
                  <span className="font-bold" style={{ color: C.g700 }}>{v}</span>
                </div>
              ))}
            </div>
            <div>
              <p className="text-xs font-black mb-2" style={{ color: C.g600 }}>Recent Reviews</p>
              {reviewsLoading ? <Spin /> : userReviews.length === 0
                ? <p className="text-xs text-center py-3" style={{ color: C.g400 }}>No reviews yet</p>
                : userReviews.map((rv, i) => (
                  <div key={i} className="border-b py-2 last:border-0" style={{ borderColor: C.g100 }}>
                    <div className="flex items-center gap-1 mb-0.5"><Stars rating={rv.rating} /><span className="text-xs font-bold ml-1">{rv.rating}/5</span></div>
                    {rv.comment && <p className="text-xs" style={{ color: C.g500 }}>"{rv.comment?.slice(0, 80)}{rv.comment?.length > 80 ? '…' : ''}"</p>}
                    <p className="text-xs mt-0.5" style={{ color: C.g400 }}>by {rv.reviewer?.username || '?'} · {fmtAge(rv.created_at)}</p>
                  </div>
                ))
              }
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ================================================================
// USERS — view-only
// ================================================================
function UsersSection() {
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  const [userReviews, setUserReviews] = useState([]);
  const LIMIT = 20;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${API_URL}/admin/users`, { headers: authH(), params: { search, page, limit: LIMIT } });
      setUsers(r.data.users || []); setTotal(r.data.total || 0);
    } catch { toast.error('Failed to load users'); }
    setLoading(false);
  }, [search, page]);

  useEffect(() => { setPage(1); }, [search]);
  useEffect(() => { load(); }, [load]);

  const viewUser = async (u) => {
    setSelected(u); setUserReviews([]);
    try { const r = await axios.get(`${API_URL}/users/${u.id}/reviews`); setUserReviews(r.data.reviews?.slice(0, 4) || []); } catch {}
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-black" style={{ color: C.g800 }}>Users</h2>
          <p className="text-xs mt-0.5" style={{ color: C.g400 }}>View user accounts — read only</p>
        </div>
        <button onClick={load} className="p-2 rounded-xl border hover:bg-gray-50" style={{ borderColor: C.g200 }}><RefreshCw size={14} style={{ color: C.g500 }} /></button>
      </div>
      <div className="flex items-center gap-2 p-3 rounded-xl" style={{ backgroundColor: '#FFFBEB', border: '1px solid #FDE68A' }}>
        <Info size={13} style={{ color: C.warn, flexShrink: 0 }} />
        <p className="text-xs font-semibold" style={{ color: '#92400E' }}>View only. To ban, delete, or change roles — use the Admin Panel.</p>
      </div>
      <div className="flex items-center gap-2 bg-white border rounded-xl px-3 py-2" style={{ borderColor: C.g200 }}>
        <Search size={14} style={{ color: C.g400 }} />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search username or email…"
          className="flex-1 text-sm outline-none" style={{ color: C.g700 }} />
        {search && <button onClick={() => setSearch('')}><X size={13} style={{ color: C.g400 }} /></button>}
      </div>
      <div className="flex gap-4">
        <div className="flex-1 bg-white rounded-2xl border overflow-hidden" style={{ borderColor: C.g200 }}>
          {loading ? <Spin /> : users.length === 0 ? <Empty icon={<User size={36} className="mx-auto" style={{ color: C.g300 }} />} text="No users found" /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead style={{ backgroundColor: C.g50 }}>
                  <tr>{['User', 'Status', 'Trades', 'Rating', 'Badge', 'Verified', 'Joined', 'View'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-black uppercase tracking-wide" style={{ color: C.g500 }}>{h}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.id} className="border-t hover:bg-gray-50 transition" style={{ borderColor: C.g100 }}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-black text-white flex-shrink-0"
                            style={{ backgroundColor: C.forest }}>{(u.username || '?')[0].toUpperCase()}</div>
                          <div><p className="font-bold text-xs" style={{ color: C.g800 }}>{u.username}</p><p className="text-xs" style={{ color: C.g400 }}>{u.email}</p></div>
                        </div>
                      </td>
                      <td className="px-4 py-3"><Pill label={u.account_status || 'active'} color={u.account_status === 'banned' ? '#991B1B' : '#166534'} bg={u.account_status === 'banned' ? '#FEF2F2' : '#F0FDF4'} /></td>
                      <td className="px-4 py-3 text-xs font-bold" style={{ color: C.g700 }}>{u.total_trades || 0}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1"><Stars rating={u.average_rating} /><span className="text-xs font-bold" style={{ color: C.g700 }}>{parseFloat(u.average_rating || 0).toFixed(1)}</span></div>
                      </td>
                      <td className="px-4 py-3"><span className="text-xs font-black px-2 py-0.5 rounded-full" style={{ backgroundColor: badgeColor(u.badge).bg, color: badgeColor(u.badge).c }}>{u.badge || 'BEGINNER'}</span></td>
                      <td className="px-4 py-3"><span className="inline-flex items-center gap-1 text-xs">
                        {u.is_email_verified && <Mail size={13} style={{ color: C.success }} />}
                        {u.is_phone_verified && <Smartphone size={13} style={{ color: C.success }} />}
                        {u.is_id_verified && <FileText size={13} style={{ color: C.success }} />}
                      </span></td>
                      <td className="px-4 py-3 text-xs" style={{ color: C.g400 }}>{fmtDate(u.created_at)}</td>
                      <td className="px-4 py-3">
                        <button onClick={() => viewUser(selected?.id === u.id ? null : u)} className="p-1.5 rounded-lg hover:bg-gray-100">
                          <Eye size={14} style={{ color: C.g500 }} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {total > LIMIT && (
            <div className="flex items-center justify-between px-4 py-3 border-t" style={{ borderColor: C.g100 }}>
              <span className="text-xs" style={{ color: C.g400 }}>{(page - 1) * LIMIT + 1}–{Math.min(page * LIMIT, total)} of {total}</span>
              <div className="flex gap-2">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-1 rounded disabled:opacity-30"><ChevronLeft size={16} /></button>
                <button onClick={() => setPage(p => p + 1)} disabled={page * LIMIT >= total} className="p-1 rounded disabled:opacity-30"><ChevronRight size={16} /></button>
              </div>
            </div>
          )}
        </div>
        {selected && (
          <div className="w-64 bg-white rounded-2xl border p-4 flex-shrink-0" style={{ borderColor: C.g200 }}>
            <div className="flex items-start justify-between mb-3"><h3 className="font-black text-sm" style={{ color: C.g800 }}>User Detail</h3><button onClick={() => setSelected(null)}><X size={14} style={{ color: C.g400 }} /></button></div>
            <div className="w-12 h-12 rounded-xl flex items-center justify-center text-xl font-black text-white mb-2" style={{ backgroundColor: C.forest }}>{(selected.username || '?')[0].toUpperCase()}</div>
            <p className="font-black text-sm" style={{ color: C.g800 }}>{selected.username}</p>
            <p className="text-xs mb-3" style={{ color: C.g400 }}>{selected.email}</p>
            <div className="space-y-1.5 mb-3">
              {[
                { l: 'Status', v: selected.account_status || 'active' },
                { l: 'Trades', v: fmt(selected.total_trades) },
                { l: 'Volume', v: selected.total_volume_usd ? `$${fmt(selected.total_volume_usd, 0)}` : '—' },
                { l: 'Rating', v: <span className="inline-flex items-center gap-1"><Star size={12} className="inline-block" style={{ color: C.gold }} />{parseFloat(selected.average_rating || 0).toFixed(1)}</span> },
                { l: 'Badge', v: selected.badge || 'BEGINNER' },
                { l: 'Phone', v: selected.phone_number || '—' },
                { l: 'KYC', v: selected.kyc_status || '—' },
                { l: 'Last Active', v: fmtAge(selected.last_seen_at) },
                { l: 'Joined', v: fmtDate(selected.created_at) },
              ].map(({ l, v }) => (
                <div key={l} className="flex justify-between py-1 border-b text-xs" style={{ borderColor: C.g100 }}>
                  <span style={{ color: C.g400 }}>{l}</span><span className="font-bold" style={{ color: C.g700 }}>{v}</span>
                </div>
              ))}
            </div>
            <p className="text-xs font-black mb-2" style={{ color: C.g600 }}>Recent Reviews</p>
            {userReviews.length === 0
              ? <p className="text-xs text-center py-2" style={{ color: C.g400 }}>No reviews</p>
              : userReviews.map((rv, i) => (
                <div key={i} className="border-b py-1.5 last:border-0" style={{ borderColor: C.g100 }}>
                  <div className="flex items-center gap-1"><Stars rating={rv.rating} /></div>
                  {rv.comment && <p className="text-xs mt-0.5" style={{ color: C.g500 }}>"{rv.comment?.slice(0, 60)}{rv.comment?.length > 60 ? '…' : ''}"</p>}
                </div>
              ))
            }
          </div>
        )}
      </div>
    </div>
  );
}

// ================================================================
// LIVE CLOCK
// ================================================================
function LiveClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const iv = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(iv);
  }, []);
  const time = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const date = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', lineHeight: 1.2 }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: C.g700, fontVariantNumeric: 'tabular-nums' }}>{time}</span>
      <span style={{ fontSize: 10, fontWeight: 600, color: C.g400 }}>{date}</span>
    </div>
  );
}

// ================================================================
// VENDOR DEPOSITS — new gift-card sellers awaiting the $200 security
// deposit review before they're allowed to publish listings. Visible to
// the whole team; approve/reject is admin-only (money-adjacent trust call).
// ================================================================
function VendorDepositsSection({ teamUser }) {
  const [deposits, setDeposits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState(null);
  const isAdmin = !!teamUser?.is_admin;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${API_URL}/team/seller-deposits/pending`, { headers: authH() });
      setDeposits(r.data.deposits || []);
    } catch (err) { toast.error(err.response?.data?.error || 'Failed to load pending deposits'); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const approve = async (d) => {
    if (!window.confirm(`Approve ${d.user?.username || 'this user'}'s $${d.amount_usdt} deposit? They'll immediately be able to create gift card offers.`)) return;
    setActingId(d.id);
    try {
      await axios.post(`${API_URL}/admin/seller-deposits/${d.user_id}/approve-deposit`, {}, { headers: authH() });
      toast.success(`Approved — ${d.user?.username || 'user'} can now sell gift cards.`);
      load();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed to approve deposit'); }
    setActingId(null);
  };

  const reject = async (d) => {
    const reason = window.prompt(`Reject ${d.user?.username || 'this user'}'s $${d.amount_usdt} deposit and refund it to their wallet?\n\nOptional reason (shown to the user):`, '');
    if (reason === null) return; // cancelled
    setActingId(d.id);
    try {
      await axios.post(`${API_URL}/admin/seller-deposits/${d.user_id}/reject-deposit`, { reason }, { headers: authH() });
      toast.success(`Rejected — $${d.amount_usdt} refunded to ${d.user?.username || 'user'}'s wallet.`);
      load();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed to reject deposit'); }
    setActingId(null);
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-black" style={{ color: C.g800 }}>Vendor Deposits</h2>
        <p className="text-xs mt-0.5" style={{ color: C.g400 }}>New gift-card sellers' $200 security deposits, awaiting review before they can list</p>
      </div>

      {!isAdmin && (
        <div className="rounded-2xl border p-3.5 flex items-start gap-2.5" style={{ backgroundColor: '#FFFBEB', borderColor: '#FDE68A' }}>
          <Shield size={15} style={{ color: '#B45309', flexShrink: 0, marginTop: 1 }} />
          <p className="text-xs leading-relaxed" style={{ color: '#92400E' }}>
            You can view pending deposits here, but approving or rejecting them requires full admin access.
          </p>
        </div>
      )}

      {loading ? <Spin /> : deposits.length === 0 ? (
        <Empty icon={<Shield size={36} className="mx-auto" style={{ color: C.g300 }} />} text="No deposits waiting on review" />
      ) : (
        <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: C.g200 }}>
          {deposits.map((d, i) => (
            <div key={d.id} className={`flex items-center justify-between gap-3 flex-wrap px-4 py-3.5 ${i > 0 ? 'border-t' : ''}`} style={{ borderColor: C.g100 }}>
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-black text-white flex-shrink-0" style={{ backgroundColor: C.forest }}>
                  {(d.user?.username || '?')[0].toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-sm" style={{ color: C.g800 }}>{d.user?.username || 'Unknown'}</p>
                  <p className="text-xs" style={{ color: C.g400 }}>{d.user?.email || '—'} · locked {fmtAge(d.locked_at)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-sm font-black px-2.5 py-1 rounded-lg" style={{ backgroundColor: C.g50, color: C.g700 }}>
                  ${fmt(d.amount_usdt)} USDT
                </span>
                <button onClick={() => approve(d)} disabled={!isAdmin || actingId === d.id}
                  className="px-3 py-1.5 rounded-lg text-xs font-black text-white"
                  style={{ backgroundColor: !isAdmin ? C.g300 : (actingId === d.id ? C.g400 : C.green), cursor: !isAdmin ? 'not-allowed' : 'pointer' }}>
                  {actingId === d.id ? '…' : 'Approve'}
                </button>
                <button onClick={() => reject(d)} disabled={!isAdmin || actingId === d.id}
                  className="px-3 py-1.5 rounded-lg text-xs font-black text-white"
                  style={{ backgroundColor: !isAdmin ? C.g300 : (actingId === d.id ? C.g400 : C.danger), cursor: !isAdmin ? 'not-allowed' : 'pointer' }}>
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ================================================================
// MAIN
// ================================================================
export default function TeamDashboard({ user: propUser }) {
  const [teamUser, setTeamUser] = useState(null);
  const [loggedIn, setLoggedIn] = useState(false);
  const [section, setSection] = useState('overview');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [disputeCount, setDisputeCount] = useState(0);
  const [pendingDepositCount, setPendingDepositCount] = useState(0);

  useEffect(() => {
    const token = localStorage.getItem('team_token');
    const stored = localStorage.getItem('team_user');
    let validSession = false;
    if (token && stored) {
      let u = null;
      try { u = JSON.parse(stored); } catch { /* corrupt — treat as invalid below */ }
      if (u && (u.is_moderator || u.is_admin)) {
        setTeamUser(u); setLoggedIn(true);
        axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
        validSession = true;
      } else {
        // Stale/invalid saved session (e.g. from before this account had team access,
        // or corrupt JSON) — clear it and fall through to try the admin-session
        // auto-login below instead of leaving the user stuck on the login form with
        // no way back in short of manually clearing storage themselves.
        localStorage.removeItem('team_token'); localStorage.removeItem('team_user');
      }
    }
    if (!validSession && propUser && (propUser.is_moderator || propUser.is_admin) && localStorage.getItem('token')) {
      const t = localStorage.getItem('token');
      localStorage.setItem('team_token', t); localStorage.setItem('team_user', JSON.stringify(propUser));
      setTeamUser(propUser); setLoggedIn(true);
      axios.defaults.headers.common['Authorization'] = `Bearer ${t}`;
    }
  }, [propUser]);

  useEffect(() => {
    if (!loggedIn) return;
    const poll = async () => {
      try {
        const r = await axios.get(`${API_URL}/admin/disputes`, { headers: authH() });
        setDisputeCount((r.data.disputes || []).filter(d => ['OPEN','DISPUTED','IN_REVIEW'].includes(d.status)).length);
      } catch {}
    };
    poll(); const iv = setInterval(poll, 30000); return () => clearInterval(iv);
  }, [loggedIn]);

  useEffect(() => {
    if (!loggedIn) return;
    const poll = async () => {
      try {
        const r = await axios.get(`${API_URL}/team/seller-deposits/pending`, { headers: authH() });
        setPendingDepositCount((r.data.deposits || []).length);
      } catch {}
    };
    poll(); const iv = setInterval(poll, 30000); return () => clearInterval(iv);
  }, [loggedIn]);

  const logout = () => {
    localStorage.removeItem('team_token'); localStorage.removeItem('team_user');
    setLoggedIn(false); setTeamUser(null);
    delete axios.defaults.headers.common['Authorization'];
  };

  if (!loggedIn) return <TeamLogin onAuth={(u) => { setTeamUser(u); setLoggedIn(true); }} />;

  const NAV_GROUPS = [
    { label: 'Dashboard', items: [
      { id: 'overview',       label: 'Overview',        icon: LayoutDashboard },
      { id: 'stats',          label: 'Platform Stats',  icon: BarChart2 },
      { id: 'active-offers',  label: 'Active Offers',   icon: Layers },
    ]},
    { label: 'Operations', items: [
      { id: 'trade-lookup',   label: 'Trade Lookup',    icon: Hash },
      { id: 'disputes',       label: 'Disputes',        icon: Gavel,        badge: disputeCount },
      { id: 'support-chat',   label: 'Support Chat',    icon: MessageSquare },
      { id: 'p2p-migration',  label: 'P2P Migration',   icon: Repeat },
      { id: 'user-messages',  label: 'User Messages',   icon: Lightbulb },
      { id: 'feedback',       label: 'Feedback',        icon: Star },
      { id: 'risk-monitor',   label: 'Risk Monitor',    icon: AlertOctagon },
      { id: 'top-traders',    label: 'Top Traders',     icon: Trophy },
      { id: 'vendor-deposits', label: 'Vendor Deposits', icon: Shield,      badge: pendingDepositCount },
    ]},
    { label: 'Team', items: [
      { id: 'announcements',  label: 'Announcements',   icon: Megaphone },
      { id: 'tasks',          label: 'Task Manager',    icon: ClipboardList },
      { id: 'activity-log',   label: 'Activity Log',    icon: Activity },
      { id: 'shifts',         label: 'Team Schedule',   icon: CalendarDays },
      { id: 'ai-chat',        label: 'AI Assistant',    icon: MessageCircle },
    ]},
    { label: 'Finance', items: [
      { id: 'finance',        label: 'Finance',         icon: DollarSign },
      { id: 'company-books',  label: 'Company Books',   icon: BookOpen },
    ]},
    { label: 'People', items: [
      { id: 'users',          label: 'Users',           icon: Users },
      { id: 'staff',          label: 'Staff Directory', icon: Briefcase },
    ]},
    { label: 'Tools', items: [
      { id: 'knowledge-base', label: 'Knowledge Base',  icon: FileText },
      { id: 'reports',        label: 'Reports & Exports', icon: Download },
    ]},
  ];

  const allNavItems = NAV_GROUPS.flatMap(g => g.items);
  const currentNav  = allNavItems.find(n => n.id === section);
  const avatarLetter = (teamUser?.full_name || teamUser?.username || 'T')[0].toUpperCase();
  const roleLabel    = teamUser?.is_admin ? 'Admin' : 'Moderator';

  const sidebarW = sidebarOpen ? 248 : 60;

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', backgroundColor: '#EEF2F7', fontFamily: "'Inter','Segoe UI',system-ui,sans-serif" }}>

      {/* ══════════════════════════════════════════
          SIDEBAR
      ══════════════════════════════════════════ */}
      <aside style={{
        width: sidebarW, flexShrink: 0, display: 'flex', flexDirection: 'column',
        height: '100vh', overflow: 'hidden', position: 'relative', zIndex: 30,
        background: `linear-gradient(180deg, #0f2d1f 0%, ${C.forest} 40%, #1a3d2b 100%)`,
        boxShadow: '4px 0 24px rgba(0,0,0,0.18)',
        transition: 'width 0.22s cubic-bezier(0.4,0,0.2,1)',
      }}>

        {/* Logo bar */}
        <div style={{ padding: '18px 14px 14px', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: `linear-gradient(135deg,${C.gold},#e8930f)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 2px 8px rgba(244,164,34,0.4)' }}>
            <span style={{ fontSize: 17, fontWeight: 900, color: C.forest, fontFamily: 'Georgia,serif' }}>P</span>
          </div>
          {sidebarOpen && (
            <div style={{ minWidth: 0, flex: 1 }}>
              <p style={{ margin: 0, color: '#fff', fontWeight: 900, fontSize: 15, fontFamily: 'Georgia,serif', letterSpacing: '0.02em' }}>PRAQEN</p>
              <p style={{ margin: 0, color: 'rgba(255,255,255,0.3)', fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase' }}>Team Portal</p>
            </div>
          )}
          <button onClick={() => setSidebarOpen(o => !o)} style={{ marginLeft: sidebarOpen ? 'auto' : undefined, padding: 5, borderRadius: 7, border: 'none', background: 'rgba(255,255,255,0.08)', cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'rgba(255,255,255,0.5)', flexShrink: 0, transition: 'background 0.15s' }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.15)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}>
            <Menu size={14} />
          </button>
        </div>

        {/* Nav groups */}
        <nav style={{ flex: 1, overflowY: 'auto', padding: '6px 0 8px', scrollbarWidth: 'none' }}>
          {NAV_GROUPS.map((group) => (
            <div key={group.label} style={{ marginBottom: 2 }}>
              {sidebarOpen ? (
                <p style={{ margin: 0, padding: '10px 16px 3px', fontSize: 9, fontWeight: 800, letterSpacing: '0.13em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.22)' }}>
                  {group.label}
                </p>
              ) : (
                <div style={{ height: 10 }} />
              )}
              {group.items.map(({ id, label, icon: Icon, badge }) => {
                const active = section === id;
                return (
                  <button key={id} onClick={() => setSection(id)}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center',
                      gap: sidebarOpen ? 10 : 0, justifyContent: sidebarOpen ? 'flex-start' : 'center',
                      padding: sidebarOpen ? '8px 14px 8px 16px' : '9px 0',
                      border: 'none', cursor: 'pointer', position: 'relative',
                      background: active ? 'rgba(255,255,255,0.11)' : 'transparent',
                      borderLeft: active ? `3px solid ${C.gold}` : '3px solid transparent',
                      transition: 'background 0.14s',
                    }}
                    onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
                    onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}>
                    <Icon size={15} style={{ color: active ? C.gold : 'rgba(255,255,255,0.42)', flexShrink: 0, transition: 'color 0.14s' }} />
                    {sidebarOpen && (
                      <span style={{ fontSize: 13, fontWeight: active ? 700 : 500, color: active ? '#fff' : 'rgba(255,255,255,0.52)', flex: 1, textAlign: 'left', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', transition: 'color 0.14s' }}>
                        {label}
                      </span>
                    )}
                    {badge > 0 && (
                      <span style={{ minWidth: 17, height: 17, borderRadius: 9, background: C.danger, color: '#fff', fontSize: 9, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px', flexShrink: 0, ...(sidebarOpen ? {} : { position: 'absolute', top: 3, right: 4 }) }}>
                        {badge > 9 ? '9+' : badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        {/* User footer */}
        <div style={{ padding: '10px 10px 14px', borderTop: '1px solid rgba(255,255,255,0.07)', flexShrink: 0 }}>
          {sidebarOpen ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px', borderRadius: 10, background: 'rgba(255,255,255,0.06)', marginBottom: 6, border: '1px solid rgba(255,255,255,0.07)' }}>
              <div style={{ width: 30, height: 30, borderRadius: 8, background: `linear-gradient(135deg,${C.gold},#e8930f)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span style={{ fontSize: 12, fontWeight: 900, color: C.forest }}>{avatarLetter}</span>
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <p style={{ margin: 0, color: '#fff', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{teamUser?.full_name || teamUser?.username}</p>
                <p style={{ margin: 0, color: 'rgba(255,255,255,0.3)', fontSize: 10, fontWeight: 600 }}>{roleLabel}</p>
              </div>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e', flexShrink: 0, boxShadow: '0 0 6px #22c55e' }} />
            </div>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 6 }}>
              <div style={{ width: 32, height: 32, borderRadius: 9, background: `linear-gradient(135deg,${C.gold},#e8930f)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: 13, fontWeight: 900, color: C.forest }}>{avatarLetter}</span>
              </div>
            </div>
          )}
          <button onClick={logout}
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: sidebarOpen ? 'flex-start' : 'center', gap: 8, padding: '7px 10px', borderRadius: 8, border: 'none', background: 'transparent', cursor: 'pointer', color: 'rgba(255,255,255,0.35)', fontSize: 12, fontWeight: 600, transition: 'all 0.15s' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.12)'; e.currentTarget.style.color = '#fca5a5'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(255,255,255,0.35)'; }}>
            <LogOut size={13} style={{ flexShrink: 0 }} />
            {sidebarOpen && <span>Sign Out</span>}
          </button>
        </div>
      </aside>

      {/* ══════════════════════════════════════════
          RIGHT PANEL
      ══════════════════════════════════════════ */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>

        {/* ── Topbar ── */}
        <header style={{ height: 58, flexShrink: 0, background: '#fff', borderBottom: `1px solid ${C.g200}`, display: 'flex', alignItems: 'center', gap: 14, padding: '0 22px', boxShadow: '0 1px 4px rgba(0,0,0,0.05)', zIndex: 10 }}>

          {/* Left: breadcrumb */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px 4px 6px', borderRadius: 8, background: C.g100, border: `1px solid ${C.g200}` }}>
              {currentNav && (() => { const NavIcon = currentNav.icon; return <>
                <div style={{ width: 24, height: 24, borderRadius: 6, background: C.forest, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <NavIcon size={12} style={{ color: C.gold }} />
                </div>
                <span style={{ fontSize: 13, fontWeight: 700, color: C.g700, whiteSpace: 'nowrap' }}>{currentNav.label}</span>
              </>; })()}
            </div>
            {disputeCount > 0 && (
              <button onClick={() => setSection('disputes')}
                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 7, border: `1.5px solid ${C.danger}`, background: '#FEF2F2', cursor: 'pointer', color: C.danger, fontSize: 11, fontWeight: 800, animation: 'pulse 2s infinite' }}>
                <Bell size={11} />
                {disputeCount} Open Dispute{disputeCount !== 1 ? 's' : ''}
              </button>
            )}
          </div>

          {/* Right: clock + user chip */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
            <LiveClock />
            <div style={{ width: 1, height: 28, background: C.g200 }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 10px 4px 4px', borderRadius: 10, background: C.g50, border: `1px solid ${C.g200}` }}>
              <div style={{ width: 30, height: 30, borderRadius: 8, background: `linear-gradient(135deg,${C.forest},${C.green})`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span style={{ fontSize: 12, fontWeight: 900, color: C.gold }}>{avatarLetter}</span>
              </div>
              <div>
                <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: C.g800, lineHeight: 1.3 }}>{(teamUser?.full_name || teamUser?.username || '').split(' ').slice(0,2).join(' ')}</p>
                <p style={{ margin: 0, fontSize: 10, fontWeight: 600, lineHeight: 1.3, color: teamUser?.is_admin ? C.purple : C.mint }}>{roleLabel}</p>
              </div>
            </div>
          </div>
        </header>

        {/* ── Scrollable content ── */}
        <main style={{ flex: 1, overflowY: 'auto', padding: '28px 28px 40px', scrollbarWidth: 'thin', scrollbarColor: `${C.g200} transparent` }}>
          {section === 'overview'       && <OverviewSection teamUser={teamUser} />}
          {section === 'support-chat'   && <SupportChatSection teamUser={teamUser} />}
          {section === 'p2p-migration'  && <P2PMigrationSection />}
          {section === 'user-messages'  && <TeamSuggestionsSection />}
          {section === 'ai-chat'        && <LiveAIChatSection />}
          {section === 'stats'          && <PlatformStatsSection />}
          {section === 'active-offers'  && <ActiveOffersSection />}
          {section === 'announcements'  && <AnnouncementsSection />}
          {section === 'tasks'          && <TaskManagerSection />}
          {section === 'activity-log'   && <ActivityLogSection />}
          {section === 'risk-monitor'   && <RiskMonitorSection />}
          {section === 'shifts'         && <ShiftsSection />}
          {section === 'knowledge-base' && <KnowledgeBaseSection />}
          {section === 'reports'        && <ReportsSection />}
          {section === 'finance'        && <TeamFinanceSection />}
          {section === 'company-books'  && <CompanyBooksSection />}
          {section === 'staff'          && <StaffSection />}
          {section === 'trade-lookup'   && <TradeLookupSection />}
          {section === 'disputes'       && <DisputesSection teamUser={teamUser} />}
          {section === 'feedback'       && <FeedbackSection />}
          {section === 'top-traders'    && <TopTradersSection />}
          {section === 'vendor-deposits' && <VendorDepositsSection teamUser={teamUser} />}
          {section === 'users'          && <UsersSection />}
        </main>
      </div>
    </div>
  );
}
