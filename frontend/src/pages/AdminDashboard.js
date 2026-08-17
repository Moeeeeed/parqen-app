import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { copyToClipboard } from '../utils/clipboard';
import {
  LayoutDashboard, Users, ArrowLeftRight, ArrowUpRight, AlertTriangle,
  ShieldCheck, DollarSign, List, Megaphone, LogOut,
  TrendingUp, CheckCircle, XCircle, Clock, Eye,
  Ban, UserCheck, Trash2, RefreshCw, ChevronLeft,
  ChevronRight, Search, X, Menu, Lock, Bitcoin,
  ThumbsUp, ThumbsDown, Star, Activity,
  Mail, Phone, UserPlus, MessageSquare, MessageCircle, Maximize2,
  ChevronUp, Lightbulb, Send, ExternalLink, Shield,
} from 'lucide-react';
import { Image, MapPin, CreditCard, User, Globe, ShoppingCart, Scale, Wrench, Upload, Landmark, Banknote, ClipboardList, Repeat, Moon, EyeOff, Pin, Sparkles, BarChart2, Inbox, Bug, Zap } from 'lucide-react';

// ─── Suggestion constants (shared with SuggestionsPanel) ─────
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

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';
const ADMIN_EMAIL = 'support@praqen.com';

// ─── colour palette ───────────────────────────────────────────
const C = {
  forest:'#1B4332', green:'#2D6A4F', mint:'#40916C',
  gold:'#F4A422', amber:'#F59E0B',
  g50:'#F8FAFC', g100:'#F1F5F9', g200:'#E2E8F0',
  g400:'#94A3B8', g500:'#64748B', g600:'#475569', g700:'#334155', g800:'#1E293B',
  success:'#10B981', danger:'#EF4444', paid:'#3B82F6', warn:'#F59E0B',
};

// ─── helpers ─────────────────────────────────────────────────
const authH  = () => { const t = localStorage.getItem('token') || localStorage.getItem('adminToken'); return t ? { Authorization: `Bearer ${t}` } : {}; };
const fmt    = (n, d = 0) => new Intl.NumberFormat('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }).format(n || 0);
const fmtBtc = (n) => parseFloat(n || 0).toFixed(6);
const fmtAge = (ts) => {
  if (!ts) return '—';
  const s = (Date.now() - new Date(ts)) / 1000;
  if (s < 60)  return 'Just now';
  if (s < 3600) return `${~~(s / 60)}m ago`;
  if (s < 86400) return `${~~(s / 3600)}h ago`;
  return `${~~(s / 86400)}d ago`;
};
const fmtDate = (ts) => ts ? new Date(ts).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' }) : '—';

// Country helpers — emoji flag from ISO 2-letter code, never defaults to Ghana
const ccToFlag = (cc) => {
  if (!cc || cc.length < 2) return '';
  const code = cc.toUpperCase().slice(0, 2);
  return code.split('').map(c => String.fromCodePoint(0x1F1E6 + c.charCodeAt(0) - 65)).join('');
};
const CC_NAMES = {
  GH:'Ghana', NG:'Nigeria', KE:'Kenya', ZA:'S. Africa', UG:'Uganda', TZ:'Tanzania',
  RW:'Rwanda', CM:'Cameroon', SN:'Senegal', CI:"Côte d'Ivoire", ZM:'Zambia', ZW:'Zimbabwe',
  ET:'Ethiopia', SD:'Sudan', AO:'Angola', MZ:'Mozambique', MG:'Madagascar', MW:'Malawi',
  NA:'Namibia', BW:'Botswana', SL:'S. Leone', LR:'Liberia', GN:'Guinea', ML:'Mali',
  BF:'Burkina Faso', NE:'Niger', TD:'Chad', CD:'DR Congo', CG:'Congo', GA:'Gabon',
  US:'USA', CA:'Canada', GB:'UK', DE:'Germany', FR:'France', IT:'Italy', ES:'Spain',
  NL:'Netherlands', BE:'Belgium', CH:'Switzerland', SE:'Sweden', NO:'Norway', DK:'Denmark',
  PL:'Poland', UA:'Ukraine', TR:'Turkey', RU:'Russia',
  CN:'China', IN:'India', JP:'Japan', KR:'S. Korea', SG:'Singapore', MY:'Malaysia',
  ID:'Indonesia', PH:'Philippines', VN:'Vietnam', TH:'Thailand', PK:'Pakistan', BD:'Bangladesh',
  SA:'Saudi Arabia', AE:'UAE', QA:'Qatar', KW:'Kuwait', EG:'Egypt', MA:'Morocco',
  BR:'Brazil', MX:'Mexico', CO:'Colombia', AR:'Argentina', AU:'Australia', NZ:'New Zealand',
};
const ccToName = (cc) => CC_NAMES[cc?.toUpperCase()?.slice(0,2)] || cc || '—';
// Priority country: stored country (IP geo / manual) → phone dial-code fallback.
// A VPN can only ever mask IP-based geolocation — there is no way to see a
// user's true physical location once they're behind one — so when `country`
// is empty we fall back to the country implied by their phone number's dial
// code instead of leaving the cell blank.
const resolveUserCountry = (u) => u?.country || u?.phone_country || null;
// True when the shown country came from the phone-number fallback rather
// than a direct geo/manual source — used to add a small "via phone" hint.
const isCountryFromPhoneFallback = (u) => !u?.country && !!u?.phone_country;
// Common countries for filter dropdown
const FILTER_COUNTRIES = [
  {cc:'GH',name:'Ghana'}, {cc:'NG',name:'Nigeria'}, {cc:'KE',name:'Kenya'},
  {cc:'ZA',name:'S. Africa'}, {cc:'UG',name:'Uganda'}, {cc:'TZ',name:'Tanzania'},
  {cc:'RW',name:'Rwanda'}, {cc:'CM',name:'Cameroon'}, {cc:'ET',name:'Ethiopia'},
  {cc:'CN',name:'China'}, {cc:'IN',name:'India'}, {cc:'PK',name:'Pakistan'},
  {cc:'US',name:'USA'}, {cc:'GB',name:'UK'}, {cc:'DE',name:'Germany'},
  {cc:'AE',name:'UAE'}, {cc:'SA',name:'Saudi Arabia'}, {cc:'BR',name:'Brazil'},
];
const statusColor = (s) => {
  const m = { COMPLETED:'#10B981', CANCELLED:'#6B7280', DISPUTED:'#8B5CF6', ACTIVE:'#3B82F6', PAID:'#3B82F6', PAYMENT_SENT:'#3B82F6', ESCROW:'#F59E0B', CREATED:'#F59E0B', FUNDS_LOCKED:'#F59E0B', OPEN:'#2D6A4F' };
  return m[s] || '#94A3B8';
};

// ─── KYC Image Block — fetches via backend proxy so private storage buckets work ──
function KycImageBlock({ userId, type, label, large, onZoom }) {
  const [src, setSrc] = React.useState(null);
  const [status, setStatus] = React.useState('loading'); // loading | ok | error

  React.useEffect(() => {
    if (!userId) return;
    const proxyUrl = `${API_URL}/admin/kyc/${userId}/image?type=${type}`;
    const token = localStorage.getItem('token') || localStorage.getItem('adminToken');
    fetch(proxyUrl, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then(r => {
        if (!r.ok) throw new Error(`${r.status}`);
        return r.blob();
      })
      .then(blob => {
        setSrc(URL.createObjectURL(blob));
        setStatus('ok');
      })
      .catch(() => setStatus('error'));
  }, [userId, type]);

  const height = large ? 128 : 110;
  return (
    <div className="mb-3">
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs font-black" style={{ color: C.g500 }}>{label}</p>
        {status === 'ok' && (
          <button onClick={() => onZoom(src)}
            className="flex items-center gap-1 text-xs font-bold hover:opacity-70 transition" style={{ color: C.forest }}>
            <Maximize2 size={11} /> Enlarge
          </button>
        )}
      </div>
      <div
        onClick={() => status === 'ok' && onZoom(src)}
        className={`w-full rounded-xl overflow-hidden border flex items-center justify-center ${status === 'ok' ? 'cursor-zoom-in' : ''}`}
        style={{ borderColor: C.g200, height, backgroundColor: C.g50 }}>
        {status === 'loading' && (
          <div className="flex flex-col items-center gap-1">
            <div className="w-5 h-5 border-2 rounded-full animate-spin" style={{ borderColor:`${C.forest}20`, borderTopColor:C.forest }} />
            <span className="text-xs" style={{ color: C.g400 }}>Loading…</span>
          </div>
        )}
        {status === 'error' && (
          <div className="flex flex-col items-center gap-2 px-3 text-center">
            <Image size={32} strokeWidth={1.5} style={{ color: C.g400 }} />
            <span className="text-xs font-semibold" style={{ color: C.g500 }}>Image not available</span>
            <button
              onClick={() => { setStatus('loading'); setSrc(null); const t = localStorage.getItem('token') || localStorage.getItem('adminToken'); fetch(`${API_URL}/admin/kyc/${userId}/image?type=${type}&t=${Date.now()}`, { headers: t ? { Authorization: `Bearer ${t}` } : {} }).then(r => { if (!r.ok) throw new Error(r.status); return r.blob(); }).then(b => { setSrc(URL.createObjectURL(b)); setStatus('ok'); }).catch(() => setStatus('error')); }}
              className="text-xs font-bold px-3 py-1 rounded-lg"
              style={{ backgroundColor: C.g100, color: C.g600 }}>
              Retry
            </button>
          </div>
        )}
        {status === 'ok' && (
          <img src={src} alt={label} className="w-full h-full object-cover" />
        )}
      </div>
    </div>
  );
}

// ─── Spinner ─────────────────────────────────────────────────
function Spin() {
  return <div className="flex items-center justify-center py-16"><div className="w-8 h-8 border-4 rounded-full animate-spin" style={{ borderColor:`${C.forest}20`, borderTopColor:C.forest }} /></div>;
}

// ─── Empty state ─────────────────────────────────────────────
function Empty({ icon = <Inbox size={40} strokeWidth={1.5} style={{ color: C.g400 }} />, text = 'No data found' }) {
  return <div className="flex flex-col items-center py-16 gap-2"><span className="text-4xl">{icon}</span><p className="text-sm font-semibold" style={{ color: C.g500 }}>{text}</p></div>;
}

// ─── Image lightbox modal ─────────────────────────────────────
function ImageModal({ src, label, onClose }) {
  if (!src) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.85)' }} onClick={onClose}>
      <div className="relative max-w-2xl w-full" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <span className="text-white text-sm font-black">{label}</span>
          <button onClick={onClose} className="text-white hover:text-gray-300 transition">
            <X size={20} />
          </button>
        </div>
        <img src={src} alt={label} className="w-full rounded-2xl max-h-[80vh] object-contain"
          style={{ backgroundColor: '#111' }} />
      </div>
    </div>
  );
}

// ─── Stat card ────────────────────────────────────────────────
function StatCard({ icon, label, value, sub, color = C.forest, bg = '#F0FDF4' }) {
  return (
    <div className="bg-white rounded-2xl border p-4 flex items-center gap-4" style={{ borderColor: C.g200 }}>
      <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: bg }}>
        <span style={{ color }}>{icon}</span>
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: C.g400 }}>{label}</p>
        <p className="text-xl font-black truncate" style={{ color: C.g800 }}>{value}</p>
        {sub && <p className="text-xs" style={{ color: C.g400 }}>{sub}</p>}
      </div>
    </div>
  );
}

// ─── Badge pill ───────────────────────────────────────────────
function Pill({ label, color = '#10B981', bg = '#F0FDF4' }) {
  return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-black" style={{ color, backgroundColor: bg }}>{label}</span>;
}

// ─── Country cell — shared across every users table so the fallback logic
// (IP geo → phone dial-code → "no location data") never drifts between them ──
function CountryCell({ user }) {
  const cc = resolveUserCountry(user);
  const viaPhone = isCountryFromPhoneFallback(user);
  const city = user?.city;
  if (!cc) {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-bold" style={{ backgroundColor: C.g100, color: C.g500 }}
        title="No IP geolocation, phone dial code, or manual location on file for this user">
        No location data
      </span>
    );
  }
  return (
    <div>
      <span className="text-sm leading-none">{ccToFlag(cc)}</span>
      <p className="text-xs font-bold mt-0.5" style={{ color: C.g700 }}>
        {ccToName(cc)}
        {viaPhone && (
          <span className="ml-1 font-semibold" style={{ color: C.g400 }} title="No IP/geo location on file — country inferred from phone dial code">
            (via phone)
          </span>
        )}
      </p>
      {city && <p className="text-xs" style={{ color: C.g400 }}>{city}</p>}
    </div>
  );
}

// ─── Section header ───────────────────────────────────────────
function SectionHead({ title, sub, action }) {
  return (
    <div className="flex items-start justify-between mb-5">
      <div>
        <h2 className="text-lg font-black" style={{ color: C.g800 }}>{title}</h2>
        {sub && <p className="text-xs mt-0.5" style={{ color: C.g400 }}>{sub}</p>}
      </div>
      {action}
    </div>
  );
}

// ================================================================
// LOGIN SCREEN
// ================================================================
function AdminLogin({ onAuth }) {
  const [email, setEmail]       = useState(ADMIN_EMAIL);
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const [err, setErr]           = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    setLoading(true);
    try {
      const r = await axios.post(`${API_URL}/auth/login`, { email, password });
      const { token, user } = r.data;
      if (!token) throw new Error('No token returned');
      if (user?.email !== ADMIN_EMAIL && !user?.is_admin) {
        throw new Error('This account does not have admin access');
      }
      localStorage.setItem('adminToken', token);
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      onAuth(user, token);
    } catch (e) {
      setErr(e.response?.data?.error || e.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: `linear-gradient(145deg,${C.forest} 0%,#0c2418 50%,${C.green} 100%)` }}>
      <div className="w-full max-w-sm mx-4">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex w-16 h-16 rounded-2xl items-center justify-center mb-3" style={{ backgroundColor: C.gold }}>
            <span className="text-3xl font-black" style={{ color: C.forest, fontFamily: 'Georgia,serif' }}>P</span>
          </div>
          <h1 className="text-white text-2xl font-black" style={{ fontFamily: 'Georgia,serif' }}>PRAQEN</h1>
          <p className="text-white/50 text-sm mt-1 font-semibold tracking-widest uppercase">Admin Panel</p>
        </div>

        <form onSubmit={submit} className="bg-white rounded-3xl p-8 shadow-2xl">
          <h2 className="text-xl font-black mb-1" style={{ color: C.g800 }}>Admin Login</h2>
          <p className="text-sm mb-6" style={{ color: C.g400 }}>Sign in with your administrator account</p>

          {err && (
            <div className="flex items-center gap-2 mb-4 px-3 py-2.5 rounded-xl text-sm" style={{ backgroundColor:'#FEF2F2', border:'1px solid #FCA5A5', color:'#991B1B' }}>
              <XCircle size={14} /> {err}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="text-xs font-bold block mb-1.5" style={{ color: C.g600 }}>Email Address</label>
              <input value={email} onChange={e => setEmail(e.target.value)} type="email" required
                className="w-full px-4 py-3 rounded-xl border text-sm font-semibold outline-none focus:ring-2"
                style={{ borderColor: C.g200, color: C.g800 }}
                placeholder="admin@praqen.com" />
            </div>
            <div>
              <label className="text-xs font-bold block mb-1.5" style={{ color: C.g600 }}>Password</label>
              <input value={password} onChange={e => setPassword(e.target.value)} type="password" required
                className="w-full px-4 py-3 rounded-xl border text-sm font-semibold outline-none focus:ring-2"
                style={{ borderColor: C.g200, color: C.g800 }}
                placeholder="••••••••" />
            </div>
          </div>

          <button type="submit" disabled={loading}
            className="w-full mt-6 py-3.5 rounded-xl text-sm font-black flex items-center justify-center gap-2 transition"
            style={{ backgroundColor: loading ? C.g200 : C.forest, color: loading ? C.g400 : '#fff' }}>
            {loading ? <><RefreshCw size={14} className="animate-spin" /> Signing in…</> : <><Lock size={14} /> Sign in to Admin Panel</>}
          </button>
        </form>

        <p className="text-center mt-6 text-white/30 text-xs">PRAQEN Admin • Restricted Access</p>
      </div>
    </div>
  );
}

// ================================================================
// OVERVIEW SECTION
// ================================================================
function Overview() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    axios.get(`${API_URL}/admin/stats`, { headers: authH() })
      .then(r => setStats(r.data))
      .catch(() => toast.error('Failed to load stats'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <Spin />;
  if (!stats) return <Empty text="Could not load stats" />;

  const maxTrade = Math.max(...(stats.tradeDays || []).map(d => d.count), 1);

  return (
    <div className="space-y-6">
      <SectionHead title="Platform Overview" sub={`Live data — ${new Date().toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric' })}`}
        action={<button onClick={load} className="p-2 rounded-xl border hover:bg-gray-50 transition" style={{ borderColor: C.g200 }}><RefreshCw size={14} style={{ color: C.g500 }} /></button>} />

      {/* KPI Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={<Users size={22} />}      label="Total Users"      value={fmt(stats.totalUsers)}     sub={`+${stats.newUsersToday} today`} />
        <StatCard icon={<ArrowLeftRight size={22}/>} label="Total Trades"  value={fmt(stats.totalTrades)}    sub={`${stats.activeTrades} active`} color="#3B82F6" bg="#EFF6FF" />
        <StatCard icon={<DollarSign size={22} />}  label="Platform Revenue" value={`$${fmt(stats.totalRevUsd,2)}`} sub={`${fmtBtc(stats.totalRevBtc)} BTC`} color="#F59E0B" bg="#FFFBEB" />
        <StatCard icon={<Activity size={22} />}    label="Volume (USD)"    value={`$${fmt(stats.totalVolumeUsd,0)}`} sub={`${fmtBtc(stats.totalVolumeBtc)} BTC`} color="#8B5CF6" bg="#F5F3FF" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={<CheckCircle size={22} />} label="Completed"    value={fmt(stats.completedTrades)} color={C.success} bg="#F0FDF4" />
        <StatCard icon={<AlertTriangle size={22}/>} label="Disputes"    value={fmt(stats.openDisputes)}   color="#EF4444" bg="#FEF2F2" />
        <StatCard icon={<ShieldCheck size={22} />} label="Pending KYC"  value={fmt(stats.pendingKyc)}     color="#F59E0B" bg="#FFFBEB" />
        <StatCard icon={<List size={22} />}         label="Listings"     value={fmt(stats.activeListings)} sub="active" color={C.green} bg="#F0FDF4" />
      </div>

      {/* Trade chart */}
      <div className="bg-white rounded-2xl border p-5" style={{ borderColor: C.g200 }}>
        <h3 className="font-black text-sm mb-4" style={{ color: C.g700 }}>Trades — Last 7 Days</h3>
        <div className="flex items-end gap-2 h-28">
          {(stats.tradeDays || []).map((d, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <span className="text-xs font-bold" style={{ color: C.g500 }}>{d.count}</span>
              <div className="w-full rounded-t-lg transition-all" style={{ height: `${Math.max((d.count / maxTrade) * 88, 4)}px`, backgroundColor: d.count > 0 ? C.forest : C.g200 }} />
              <span className="text-xs font-semibold" style={{ color: C.g400 }}>{d.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label:'Verified Users',    value:`${fmt(stats.verifiedUsers)}`,    sub:'email verified' },
          { label:'KYC Verified',      value:`${fmt(stats.kycVerified)}`,      sub:'identity confirmed' },
          { label:'New This Week',     value:`${fmt(stats.newUsersWeek)}`,     sub:'new registrations' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-2xl border p-4 text-center" style={{ borderColor: C.g200 }}>
            <p className="text-2xl font-black" style={{ color: C.forest }}>{s.value}</p>
            <p className="text-xs font-bold mt-1" style={{ color: C.g700 }}>{s.label}</p>
            <p className="text-xs" style={{ color: C.g400 }}>{s.sub}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ================================================================
// USERS SECTION
// ================================================================
function UsersSection() {
  const [users, setUsers]         = useState([]);
  const [total, setTotal]         = useState(0);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [page, setPage]           = useState(1);
  const [filter, setFilter]       = useState('');
  const [countryFilter, setCountryFilter] = useState('');
  const [selected, setSelected]   = useState(null);
  const [acting, setActing]       = useState(false);
  const [zoomImg, setZoomImg]     = useState(null);
  const [geoStats, setGeoStats]   = useState(null);
  const LIMIT = 20;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${API_URL}/admin/users`, {
        headers: authH(),
        params: { search, status: filter, country: countryFilter, page, limit: LIMIT },
      });
      setUsers(r.data.users || []);
      setTotal(r.data.total || 0);
    } catch (err) { toast.error(err.response?.data?.error || 'Failed to load users'); }
    finally { setLoading(false); }
  }, [search, filter, countryFilter, page]);

  useEffect(() => { setPage(1); }, [search, filter, countryFilter]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    axios.get(`${API_URL}/admin/stats`, { headers: authH() }).then(r => setGeoStats(r.data)).catch(() => {});
  }, []);

  const act = async (id, updates, label) => {
    setActing(true);
    try {
      await axios.put(`${API_URL}/admin/users/${id}`, updates, { headers: authH() });
      toast.success(`${label} successful`);
      load();
      if (selected?.id === id) setSelected(s => ({ ...s, ...updates }));
    } catch (e) { toast.error(e.response?.data?.error || 'Action failed'); }
    finally { setActing(false); }
  };

  const del = async (id) => {
    if (!window.confirm('Permanently delete this user? This cannot be undone.')) return;
    try {
      await axios.delete(`${API_URL}/admin/users/${id}`, { headers: authH() });
      toast.success('User deleted');
      setSelected(null);
      load();
    } catch (e) { toast.error(e.response?.data?.error || 'Delete failed'); }
  };

  return (
    <div className="space-y-4">
      {zoomImg && <ImageModal src={zoomImg.src} label={zoomImg.label} onClose={() => setZoomImg(null)} />}
      <SectionHead title={`Users (${fmt(total)})`} sub="Manage user accounts, roles, and verification" />

      {/* Location coverage — a VPN can only ever hide IP-based geolocation
          (there's no way around that), so this tracks how many accounts have
          *some* location signal (IP geo, or phone dial-code fallback) vs none,
          rather than promising a location for every user. */}
      {geoStats && (
        <div className="bg-white rounded-2xl border p-4 flex items-center gap-4 flex-wrap" style={{ borderColor: C.g200 }}>
          <div className="flex items-center gap-3 flex-1 min-w-[220px]">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#EFF6FF' }}>
              <Activity size={20} style={{ color: '#3B82F6' }} />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: C.g400 }}>Location coverage</p>
              <p className="text-sm font-black" style={{ color: C.g800 }}>
                {fmt(geoStats.usersWithLocation)} of {fmt(geoStats.totalUsers)} users ({geoStats.locationCoveragePct}%)
              </p>
            </div>
          </div>
          <div className="flex-1 min-w-[160px]">
            <div className="w-full h-2 rounded-full overflow-hidden" style={{ backgroundColor: C.g100 }}>
              <div className="h-full rounded-full" style={{ width: `${geoStats.locationCoveragePct}%`, backgroundColor: geoStats.locationCoveragePct >= 70 ? '#22C55E' : geoStats.locationCoveragePct >= 40 ? '#F59E0B' : '#EF4444' }} />
            </div>
            <p className="text-xs mt-1" style={{ color: C.g400 }}>{fmt(geoStats.usersWithoutLocation)} users with no IP geo, phone dial-code, or manual location on file</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <div className="flex items-center gap-2 bg-white border rounded-xl px-3 py-2 flex-1 min-w-[200px]" style={{ borderColor: C.g200 }}>
          <Search size={14} style={{ color: C.g400 }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search username, email…"
            className="flex-1 text-sm outline-none" style={{ color: C.g700 }} />
          {search && <button onClick={() => setSearch('')}><X size={13} style={{ color: C.g400 }} /></button>}
        </div>
        <select value={filter} onChange={e => setFilter(e.target.value)}
          className="bg-white border rounded-xl px-3 py-2 text-sm font-semibold outline-none" style={{ borderColor: C.g200, color: C.g700 }}>
          <option value="">All status</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="banned">Banned</option>
          <option value="phone_pending">Phone Pending</option>
          <option value="kyc_pending">KYC Pending</option>
        </select>
        <select value={countryFilter} onChange={e => setCountryFilter(e.target.value)}
          className="bg-white border rounded-xl px-3 py-2 text-sm font-semibold outline-none" style={{ borderColor: C.g200, color: C.g700 }}>
          <option value="">All countries</option>
          {FILTER_COUNTRIES.map(({ cc, name }) => (
            <option key={cc} value={cc}>{ccToFlag(cc)} {name}</option>
          ))}
        </select>
        <button onClick={load} className="bg-white border rounded-xl px-3 py-2" style={{ borderColor: C.g200 }}>
          <RefreshCw size={14} style={{ color: C.g500 }} />
        </button>
      </div>

      <div className="flex gap-4">
        {/* Table */}
        <div className="flex-1 bg-white rounded-2xl border overflow-hidden" style={{ borderColor: C.g200 }}>
          {loading ? <Spin /> : users.length === 0 ? <Empty icon={<User size={40} strokeWidth={1.5} style={{ color: C.g400 }} />} text="No users found" /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead style={{ backgroundColor: C.g50 }}>
                  <tr>
                    {['User', 'Country', 'Status', 'Trades', 'Verified', 'Joined', 'Actions'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-black uppercase tracking-wide" style={{ color: C.g500 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {users.map((u, i) => (
                    <tr key={u.id} className="border-t hover:bg-gray-50 cursor-pointer transition"
                      style={{ borderColor: C.g100 }}
                      onClick={() => setSelected(u)}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-black text-white flex-shrink-0"
                            style={{ backgroundColor: C.forest }}>{(u.username || '?')[0].toUpperCase()}</div>
                          <div>
                            <p className="font-bold text-xs" style={{ color: C.g800 }}>{u.username}</p>
                            <p className="text-xs" style={{ color: C.g400 }}>{u.email}</p>
                          </div>
                          {u.is_admin && <span className="text-xs px-1.5 py-0.5 rounded font-black" style={{ backgroundColor:'#FFFBEB', color:'#92400E' }}>ADMIN</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3"><CountryCell user={u} /></td>
                      <td className="px-4 py-3">
                        <Pill label={u.account_status || 'active'}
                          color={u.account_status === 'banned' ? '#991B1B' : u.account_status === 'suspended' ? '#92400E' : '#166534'}
                          bg={u.account_status === 'banned' ? '#FEF2F2' : u.account_status === 'suspended' ? '#FFFBEB' : '#F0FDF4'} />
                      </td>
                      <td className="px-4 py-3 text-xs font-bold" style={{ color: C.g700 }}>{u.total_trades || 0}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1 flex-wrap">
                          {u.is_email_verified && <span title="Email verified" className="inline-flex items-center"><Mail size={13} /></span>}
                          {u.is_phone_verified
                            ? <span title="Phone verified" className="inline-flex items-center"><Phone size={13} /></span>
                            : u.phone_number && <span title="Phone pending review" className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-black" style={{ backgroundColor:'#FFFBEB', color:'#92400E' }}><Phone size={12} /> Pending</span>}
                          {u.is_id_verified
                            ? <span title="KYC verified" className="inline-flex items-center"><CreditCard size={13} /></span>
                            : u.kyc_status === 'pending' && <span title="KYC pending review" className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-black" style={{ backgroundColor:'#F5F3FF', color:'#6D28D9' }}><CreditCard size={12} /> Pending</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: C.g400 }}>{fmtDate(u.created_at)}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <button onClick={e => { e.stopPropagation(); act(u.id, { account_status: u.account_status === 'banned' ? 'active' : 'banned' }, u.account_status === 'banned' ? 'Unban' : 'Ban'); }}
                            className="p-1.5 rounded-lg hover:bg-gray-100 transition" title={u.account_status === 'banned' ? 'Unban' : 'Ban'}>
                            <Ban size={13} style={{ color: u.account_status === 'banned' ? C.success : C.danger }} />
                          </button>
                          <button onClick={e => { e.stopPropagation(); del(u.id); }}
                            className="p-1.5 rounded-lg hover:bg-red-50 transition" title="Delete">
                            <Trash2 size={13} style={{ color: C.danger }} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {total > LIMIT && (
            <div className="flex items-center justify-between px-4 py-3 border-t" style={{ borderColor: C.g100 }}>
              <span className="text-xs" style={{ color: C.g400 }}>Showing {(page - 1) * LIMIT + 1}–{Math.min(page * LIMIT, total)} of {total}</span>
              <div className="flex gap-2">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-1 rounded disabled:opacity-30">
                  <ChevronLeft size={16} style={{ color: C.g500 }} />
                </button>
                <button onClick={() => setPage(p => p + 1)} disabled={page * LIMIT >= total} className="p-1 rounded disabled:opacity-30">
                  <ChevronRight size={16} style={{ color: C.g500 }} />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* User detail panel */}
        {selected && (
          <div className="w-72 bg-white rounded-2xl border p-4 flex-shrink-0" style={{ borderColor: C.g200 }}>
            <div className="flex items-start justify-between mb-4">
              <h3 className="font-black text-sm" style={{ color: C.g800 }}>User Detail</h3>
              <button onClick={() => setSelected(null)}><X size={14} style={{ color: C.g400 }} /></button>
            </div>
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-xl font-black text-white mb-3" style={{ backgroundColor: C.forest }}>
              {(selected.username || '?')[0].toUpperCase()}
            </div>
            <p className="font-black" style={{ color: C.g800 }}>{selected.username}</p>
            <p className="text-xs mb-1" style={{ color: C.g400 }}>{selected.email}</p>
            <p className="text-xs mb-4" style={{ color: C.g500 }}>Joined {fmtDate(selected.created_at)}</p>

            <div className="space-y-1.5 mb-4">
              {[
                { label:'Trades',     value: selected.total_trades || 0 },
                { label:'Rating',     value: <span className="inline-flex items-center gap-1"><Star size={13} className="text-amber-400" fill="currentColor" />{parseFloat(selected.average_rating || 0).toFixed(1)}</span> },
                { label:'Completion', value: `${parseFloat(selected.completion_rate || 0).toFixed(1)}%` },
                { label:'Badge',      value: selected.badge || 'BEGINNER' },
                { label:'Last login', value: fmtAge(selected.last_login) },
              ].map(r => (
                <div key={r.label} className="flex items-center justify-between py-1.5 border-b" style={{ borderColor: C.g100 }}>
                  <span className="text-xs" style={{ color: C.g400 }}>{r.label}</span>
                  <span className="text-xs font-bold" style={{ color: C.g700 }}>{r.value}</span>
                </div>
              ))}

              {/* ── Country block ── */}
              <div className="py-2 border-b" style={{ borderColor: C.g100 }}>
                <p className="text-xs font-black uppercase tracking-wide mb-1.5 inline-flex items-center gap-1" style={{ color: C.g400 }}><MapPin size={12} /> Location</p>
                {(() => {
                  const ipCC    = selected.country;
                  const phoneCC = selected.phone_country;
                  const kycCC   = selected.kyc_country;
                  const bestCC  = resolveUserCountry(selected);
                  const rows = [
                    { label: 'Detected (IP)',   cc: ipCC,    source: selected.last_seen_location || selected.country_name },
                    { label: 'Phone country',   cc: phoneCC, source: phoneCC ? `+prefix → ${ccToName(phoneCC)}` : null },
                    { label: 'KYC country',     cc: kycCC,   source: kycCC ? ccToName(kycCC) : null },
                    { label: 'City',            cc: null,    source: selected.city || null, isText: true },
                  ];
                  return (
                    <div className="space-y-1">
                      {rows.map(({ label, cc, source, isText }) => (
                        <div key={label} className="flex items-center justify-between text-xs">
                          <span style={{ color: C.g500 }}>{label}</span>
                          {isText
                            ? <span className="font-bold" style={{ color: source ? C.g700 : C.g400 }}>{source || '—'}</span>
                            : cc
                              ? <span className="font-bold" style={{ color: C.g700 }}>{ccToFlag(cc)} {ccToName(cc)}</span>
                              : <span style={{ color: C.g400 }}>—</span>
                          }
                        </div>
                      ))}
                      {bestCC && (
                        <div className="mt-1 pt-1 border-t flex items-center justify-between text-xs" style={{ borderColor: C.g100 }}>
                          <span className="font-black" style={{ color: C.g600 }}>Best match</span>
                          <span className="font-black" style={{ color: C.forest }}>{ccToFlag(bestCC)} {ccToName(bestCC)}</span>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>

              {/* Phone number row */}
              <div className="flex items-center justify-between py-1.5 border-b" style={{ borderColor: C.g100 }}>
                <span className="text-xs" style={{ color: C.g400 }}>Phone</span>
                {selected.phone_number
                  ? <span className="text-xs font-bold" style={{ color: selected.is_phone_verified ? C.success : '#D97706' }}>
                      {selected.phone_number}{!selected.is_phone_verified && <Clock size={11} className="inline-block ml-1" />}
                    </span>
                  : <span className="text-xs" style={{ color: C.g400 }}>—</span>}
              </div>
              {/* KYC status row */}
              {(selected.kyc_status || selected.id_type) && (
                <div className="flex items-center justify-between py-1.5 border-b" style={{ borderColor: C.g100 }}>
                  <span className="text-xs" style={{ color: C.g400 }}>KYC</span>
                  <span className="text-xs font-bold" style={{ color: selected.kyc_status === 'approved' ? C.success : selected.kyc_status === 'pending' ? '#D97706' : C.danger }}>
                    {selected.id_type ? `${selected.id_type} — ` : ''}{selected.kyc_status || '—'}
                  </span>
                </div>
              )}
            </div>

            {/* ── KYC ID images ── */}
            {(selected.id_front_url || selected.id_back_url) && (
              <div className="mt-3 space-y-2">
                <p className="text-xs font-black uppercase tracking-wider inline-flex items-center gap-1" style={{ color: C.g400 }}>
                  <CreditCard size={13} /> Identity Documents
                </p>
                {selected.id_front_url && (
                  <KycImageBlock
                    userId={selected.id} type="front" label="ID Front"
                    onZoom={(src) => setZoomImg({ src, label: `${selected.username} — ID Front` })}
                  />
                )}
                {selected.id_back_url && (
                  <KycImageBlock
                    userId={selected.id} type="back" label="ID Back"
                    onZoom={(src) => setZoomImg({ src, label: `${selected.username} — ID Back` })}
                  />
                )}
              </div>
            )}

            <div className="space-y-2 mt-3">
              {/* Verify Email */}
              {!selected.is_email_verified && (
                <button disabled={acting} onClick={async () => {
                  setActing(true);
                  try {
                    await axios.put(`${API_URL}/admin/users/${selected.id}/verify-email`, {}, { headers: authH() });
                    toast.success(<span className="inline-flex items-center gap-1">Email verified <CheckCircle size={14} /></span>);
                    load();
                    setSelected(s => ({ ...s, is_email_verified: true }));
                  } catch (e) { toast.error(e.response?.data?.error || 'Failed'); }
                  finally { setActing(false); }
                }}
                  className="w-full py-2.5 rounded-xl text-xs font-black flex items-center justify-center gap-1.5"
                  style={{ backgroundColor: '#EFF6FF', color: '#1D4ED8' }}>
                  <Mail size={12} /> Verify Email
                </button>
              )}
              {/* Verify Phone */}
              {!selected.is_phone_verified && selected.phone_number && (
                <div>
                  <p className="text-xs mb-1.5 px-0.5" style={{ color: C.g400 }}>
                    Number submitted: <span className="font-black" style={{ color: C.g700 }}>{selected.phone_number}</span>
                  </p>
                  <button disabled={acting} onClick={async () => {
                    setActing(true);
                    try {
                      await axios.put(`${API_URL}/admin/users/${selected.id}/verify-phone`, {}, { headers: authH() });
                      toast.success(<span className="inline-flex items-center gap-1">Phone verified <CheckCircle size={14} /></span>);
                      load();
                      setSelected(s => ({ ...s, is_phone_verified: true }));
                    } catch (e) { toast.error(e.response?.data?.error || 'Failed'); }
                    finally { setActing(false); }
                  }}
                    className="w-full py-2.5 rounded-xl text-xs font-black flex items-center justify-center gap-1.5"
                    style={{ backgroundColor: '#F0FDF4', color: '#166534' }}>
                    <Phone size={12} /> Approve Phone ✓
                  </button>
                </div>
              )}
              {!selected.is_phone_verified && !selected.phone_number && (
                <div className="w-full py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5"
                  style={{ backgroundColor: C.g50, color: C.g400, border: `1px dashed ${C.g200}` }}>
                  <Phone size={12} /> No phone submitted
                </div>
              )}
              {/* Ban / Unban */}
              <button disabled={acting} onClick={async () => {
                setActing(true);
                const isBanned = selected.account_status === 'banned';
                const endpoint = isBanned ? 'unban' : 'ban';
                const label = isBanned ? 'Unban' : 'Ban user';
                try {
                  await axios.put(`${API_URL}/admin/users/${selected.id}/${endpoint}`, {}, { headers: authH() });
                  toast.success(`${label} successful`);
                  load();
                  setSelected(s => ({ ...s, account_status: isBanned ? 'active' : 'banned' }));
                } catch (e) { toast.error(e.response?.data?.error || 'Action failed'); }
                finally { setActing(false); }
              }}
                className="w-full py-2.5 rounded-xl text-xs font-black flex items-center justify-center gap-1.5"
                style={{ backgroundColor: selected.account_status === 'banned' ? '#F0FDF4' : '#FEF2F2', color: selected.account_status === 'banned' ? '#166534' : '#991B1B' }}>
                <Ban size={12} /> {selected.account_status === 'banned' ? 'Unban User' : 'Ban User'}
              </button>
              {/* KYC toggle */}
              <button disabled={acting} onClick={async () => {
                setActing(true);
                try {
                  if (selected.is_id_verified) {
                    await axios.put(`${API_URL}/admin/kyc/${selected.id}/reject`, { reason: 'Revoked by admin' }, { headers: authH() });
                    toast.success('KYC revoked');
                    setSelected(s => ({ ...s, is_id_verified: false, kyc_status: 'rejected' }));
                  } else {
                    await axios.put(`${API_URL}/admin/kyc/${selected.id}/approve`, {}, { headers: authH() });
                    toast.success(<span className="inline-flex items-center gap-1">KYC approved <CheckCircle size={14} /></span>);
                    setSelected(s => ({ ...s, is_id_verified: true, kyc_status: 'approved' }));
                  }
                  load();
                } catch (e) { toast.error(e.response?.data?.error || 'Action failed'); }
                finally { setActing(false); }
              }}
                className="w-full py-2.5 rounded-xl text-xs font-black flex items-center justify-center gap-1.5"
                style={{ backgroundColor: '#F5F3FF', color: '#6D28D9' }}>
                <ShieldCheck size={12} /> {selected.is_id_verified ? 'Revoke KYC' : 'Approve KYC'}
              </button>
              {/* Admin toggle */}
              <button disabled={acting} onClick={async () => {
                setActing(true);
                try {
                  const r = await axios.put(`${API_URL}/admin/users/${selected.id}/make-admin`, {}, { headers: authH() });
                  toast.success('Role updated');
                  load();
                  setSelected(s => ({ ...s, is_admin: r.data.is_admin }));
                } catch (e) { toast.error(e.response?.data?.error || 'Action failed'); }
                finally { setActing(false); }
              }}
                className="w-full py-2.5 rounded-xl text-xs font-black flex items-center justify-center gap-1.5"
                style={{ backgroundColor: '#FFFBEB', color: '#92400E' }}>
                <UserCheck size={12} /> {selected.is_admin ? 'Remove Admin' : 'Make Admin'}
              </button>
              <button onClick={() => del(selected.id)}
                className="w-full py-2.5 rounded-xl text-xs font-black flex items-center justify-center gap-1.5"
                style={{ backgroundColor: '#FEF2F2', color: '#991B1B' }}>
                <Trash2 size={12} /> Delete Account
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ================================================================
// TRADES SECTION
// ================================================================
function TradesSection() {
  const [trades, setTrades]   = useState([]);
  const [total, setTotal]     = useState(0);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter]   = useState('');
  const [page, setPage]       = useState(1);
  const [selected, setSelected] = useState(null);
  const [acting, setActing]   = useState(false);
  const LIMIT = 20;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${API_URL}/admin/trades/all`, { headers: authH(), params: { status: filter, page, limit: LIMIT } });
      setTrades(r.data.trades || []);
      setTotal(r.data.total || 0);
    } catch { toast.error('Failed to load trades'); }
    finally { setLoading(false); }
  }, [filter, page]);

  useEffect(() => { setPage(1); }, [filter]);
  useEffect(() => { load(); }, [load]);

  const forceStatus = async (id, status) => {
    if (!window.confirm(`Force trade status to ${status}?`)) return;
    setActing(true);
    try {
      await axios.put(`${API_URL}/admin/trades/${id}`, { status }, { headers: authH() });
      toast.success(`Trade set to ${status}`);
      load();
      setSelected(null);
    } catch (e) { toast.error(e.response?.data?.error || 'Failed'); }
    finally { setActing(false); }
  };

  const STATUS_OPTS = ['', 'CREATED', 'FUNDS_LOCKED', 'PAYMENT_SENT', 'COMPLETED', 'CANCELLED', 'DISPUTED'];

  return (
    <div className="space-y-4">
      <SectionHead title={`All Trades (${fmt(total)})`} sub="Monitor and manage platform trades" />

      <div className="flex gap-2 flex-wrap">
        <select value={filter} onChange={e => setFilter(e.target.value)}
          className="bg-white border rounded-xl px-3 py-2 text-sm font-semibold outline-none" style={{ borderColor: C.g200, color: C.g700 }}>
          {STATUS_OPTS.map(s => <option key={s} value={s}>{s || 'All statuses'}</option>)}
        </select>
        <button onClick={load} className="bg-white border rounded-xl px-3 py-2" style={{ borderColor: C.g200 }}>
          <RefreshCw size={14} style={{ color: C.g500 }} />
        </button>
      </div>

      <div className="flex gap-4">
        <div className="flex-1 bg-white rounded-2xl border overflow-hidden" style={{ borderColor: C.g200 }}>
          {loading ? <Spin /> : trades.length === 0 ? <Empty icon={<RefreshCw size={40} strokeWidth={1.5} style={{ color: C.g400 }} />} text="No trades found" /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead style={{ backgroundColor: C.g50 }}>
                  <tr>
                    {['Trade ID', 'Buyer', 'Seller', 'Amount', 'Status', 'Date'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-black uppercase tracking-wide" style={{ color: C.g500 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {trades.map(t => (
                    <tr key={t.id} onClick={() => setSelected(t)}
                      className="border-t hover:bg-gray-50 cursor-pointer transition" style={{ borderColor: C.g100 }}>
                      <td className="px-4 py-3 text-xs font-mono" style={{ color: C.g600 }}>{(t.trade_ref || t.id).slice(0, 12).toUpperCase()}</td>
                      <td className="px-4 py-3 text-xs font-semibold" style={{ color: C.g700 }}>{t.buyer?.username || '—'}</td>
                      <td className="px-4 py-3 text-xs font-semibold" style={{ color: C.g700 }}>{t.seller?.username || '—'}</td>
                      <td className="px-4 py-3 text-xs font-bold" style={{ color: C.g800 }}>
                        ${fmt(t.amount_usd, 2)}<br />
                        <span className="font-normal text-xs" style={{ color: C.g400 }}>{fmtBtc(t.amount_btc)} BTC</span>
                      </td>
                      <td className="px-4 py-3">
                        <Pill label={t.status} color={statusColor(t.status)} bg={`${statusColor(t.status)}15`} />
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: C.g400 }}>{fmtDate(t.created_at)}</td>
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

        {/* Trade detail */}
        {selected && (
          <div className="w-72 bg-white rounded-2xl border p-4 flex-shrink-0" style={{ borderColor: C.g200 }}>
            <div className="flex items-start justify-between mb-4">
              <h3 className="font-black text-sm" style={{ color: C.g800 }}>Trade Detail</h3>
              <button onClick={() => setSelected(null)}><X size={14} style={{ color: C.g400 }} /></button>
            </div>
            <Pill label={selected.status} color={statusColor(selected.status)} bg={`${statusColor(selected.status)}15`} />
            <div className="space-y-1.5 mt-3 mb-4">
              {[
                { label:'ID',      value: (selected.trade_ref || selected.id).slice(0, 12).toUpperCase() },
                { label:'Buyer',   value: selected.buyer?.username || '—' },
                { label:'Seller',  value: selected.seller?.username || '—' },
                { label:'USD',     value: `$${fmt(selected.amount_usd, 2)}` },
                { label:'BTC',     value: `${fmtBtc(selected.amount_btc)} BTC` },
                { label:'Created', value: fmtDate(selected.created_at) },
              ].map(r => (
                <div key={r.label} className="flex items-center justify-between py-1.5 border-b" style={{ borderColor: C.g100 }}>
                  <span className="text-xs" style={{ color: C.g400 }}>{r.label}</span>
                  <span className="text-xs font-bold" style={{ color: C.g700 }}>{r.value}</span>
                </div>
              ))}
            </div>
            {!['COMPLETED','CANCELLED'].includes(selected.status) && (
              <div className="space-y-2">
                <p className="text-xs font-black mb-1" style={{ color: C.g500 }}>Force Actions</p>
                <button disabled={acting} onClick={() => forceStatus(selected.id, 'COMPLETED')}
                  className="w-full py-2.5 rounded-xl text-xs font-black inline-flex items-center justify-center gap-1.5" style={{ backgroundColor:'#F0FDF4', color:'#166534' }}><CheckCircle size={13} /> Force Complete</button>
                <button disabled={acting} onClick={() => forceStatus(selected.id, 'CANCELLED')}
                  className="w-full py-2.5 rounded-xl text-xs font-black inline-flex items-center justify-center gap-1.5" style={{ backgroundColor:'#FEF2F2', color:'#991B1B' }}><XCircle size={13} /> Force Cancel</button>
                <button disabled={acting} onClick={() => forceStatus(selected.id, 'DISPUTED')}
                  className="w-full py-2.5 rounded-xl text-xs font-black inline-flex items-center justify-center gap-1.5" style={{ backgroundColor:'#F5F3FF', color:'#6D28D9' }}><AlertTriangle size={13} /> Mark Disputed</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ================================================================
// DISPUTES SECTION
// ================================================================
function DisputesSection() {
  const [disputes, setDisputes] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [selected, setSelected] = useState(null);
  const [resolution, setRes]    = useState('BUYER_WINS');
  const [notes, setNotes]       = useState('');
  const [submitting, setSub]    = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${API_URL}/admin/disputes`, { headers: authH() });
      setDisputes(r.data.disputes || []);
    } catch { toast.error('Failed to load disputes'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const resolve = async () => {
    if (!selected) return;
    if (!window.confirm(`Cast your vote: ${resolution}? This is one vote — escrow only moves once enough moderators agree, or via admin override.`)) return;
    setSub(true);
    try {
      const r = await axios.post(`${API_URL}/admin/disputes/${selected.id}/resolve`, { resolution, notes }, { headers: authH() });
      const { status, message } = r.data;
      if (status === 'RESOLVED') { toast.success(`Dispute resolved: ${resolution}`); setSelected(null); setNotes(''); }
      else if (status === 'SPLIT') { toast.error(message || 'Vote is split — escalated for admin review.'); }
      else { toast.success(message || 'Vote recorded.'); }
      load();
    } catch (e) {
      const err = e.response?.data?.error || 'Failed to resolve';
      toast.error(err.includes('Oath') ? 'Sign the Moderator Oath of Trust at /moderator first.' : err);
    }
    finally { setSub(false); }
  };

  return (
    <div className="space-y-4">
      <SectionHead title={`Open Disputes (${disputes.length})`} sub="Mediate and resolve trade disputes"
        action={<button onClick={load} className="p-2 rounded-xl border" style={{ borderColor: C.g200 }}><RefreshCw size={14} style={{ color: C.g500 }} /></button>} />

      {loading ? <Spin /> : disputes.length === 0 ? <Empty icon={<Scale size={40} strokeWidth={1.5} style={{ color: C.g400 }} />} text="No open disputes" /> : (
        <div className="flex gap-4">
          <div className="flex-1 space-y-3">
            {disputes.map(d => (
              <div key={d.id} onClick={() => setSelected(d)}
                className="bg-white rounded-2xl border p-4 cursor-pointer transition hover:shadow-md"
                style={{ borderColor: selected?.id === d.id ? '#EF4444' : C.g200, borderWidth: selected?.id === d.id ? 2 : 1 }}>
                <div className="flex items-start justify-between mb-2">
                  <Pill label="DISPUTED" color="#991B1B" bg="#FEF2F2" />
                  <span className="text-xs" style={{ color: C.g400 }}>{fmtAge(d.created_at)}</span>
                </div>
                <p className="text-xs font-bold mb-1" style={{ color: C.g700 }}>
                  <ShoppingCart size={12} className="inline-block mr-1 mb-0.5" /> {d.buyer?.username || 'Buyer'} vs {d.seller?.username || 'Seller'}
                </p>
                <p className="text-xs" style={{ color: C.g500 }}>Trade #{(d.trade_id || '').slice(0, 8).toUpperCase()}</p>
                <p className="text-xs mt-1.5 leading-relaxed" style={{ color: C.g600 }}>
                  {d.reason?.slice(0, 120)}{d.reason?.length > 120 ? '…' : ''}
                </p>
              </div>
            ))}
          </div>

          {selected && (
            <div className="w-80 bg-white rounded-2xl border p-5 flex-shrink-0" style={{ borderColor: C.g200 }}>
              <div className="flex items-start justify-between mb-4">
                <h3 className="font-black text-sm" style={{ color: C.g800 }}>Resolve Dispute</h3>
                <button onClick={() => setSelected(null)}><X size={14} style={{ color: C.g400 }} /></button>
              </div>
              <div className="space-y-1.5 mb-4">
                {[
                  { label:'Buyer',  value: selected.buyer?.username  || '—' },
                  { label:'Seller', value: selected.seller?.username || '—' },
                  { label:'Reason', value: selected.reason },
                ].map(r => (
                  <div key={r.label} className="py-1.5 border-b" style={{ borderColor: C.g100 }}>
                    <span className="text-xs font-semibold" style={{ color: C.g400 }}>{r.label}</span>
                    <p className="text-xs font-bold mt-0.5" style={{ color: C.g700 }}>{r.value}</p>
                  </div>
                ))}
              </div>

              <div className="space-y-2 mb-4">
                <p className="text-xs font-black" style={{ color: C.g700 }}>Decision</p>
                {[
                  { v:'BUYER_WINS',  label:'Buyer Wins — release BTC to buyer',  color:'#1D4ED8', bg:'#EFF6FF' },
                  { v:'SELLER_WINS', label:'Seller Wins — funds stay with seller', color:'#166534', bg:'#F0FDF4' },
                  { v:'CANCEL',      label:'Cancel — return BTC to seller',       color:'#991B1B', bg:'#FEF2F2' },
                ].map(opt => (
                  <button key={opt.v} onClick={() => setRes(opt.v)}
                    className="w-full text-left py-2.5 px-3 rounded-xl text-xs font-bold transition border-2"
                    style={{ backgroundColor: resolution === opt.v ? opt.bg : '#fff', color: resolution === opt.v ? opt.color : C.g500, borderColor: resolution === opt.v ? opt.color : C.g200 }}>
                    {opt.label}
                  </button>
                ))}
              </div>

              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
                placeholder="Moderator notes (optional)…"
                className="w-full border rounded-xl px-3 py-2.5 text-xs outline-none resize-none mb-3"
                style={{ borderColor: C.g200, color: C.g700 }} />

              <button onClick={resolve} disabled={submitting}
                className="w-full py-3 rounded-xl text-sm font-black transition"
                style={{ backgroundColor: submitting ? C.g200 : C.forest, color: submitting ? C.g400 : '#fff' }}>
                {submitting ? 'Casting vote…' : <span className="inline-flex items-center gap-2"><Scale size={15} /> Cast Vote</span>}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ================================================================
// SELLER SECURITY DEPOSITS — $200 USDT deposits gift-card sellers lock
// before listing. Approve/reject withdrawal requests, seize on lost
// disputes, and see the total currently locked across all sellers.
// ================================================================
const DEPOSIT_STATUS_PILL = {
  LOCKED:              { label: 'Locked',              color: '#166534', bg: '#F0FDF4' },
  PENDING_WITHDRAWAL:  { label: 'Pending Withdrawal',  color: '#92400E', bg: '#FFFBEB' },
  WITHDRAWN:           { label: 'Withdrawn',            color: C.g500,   bg: C.g100    },
  SEIZED:              { label: 'Seized',               color: '#991B1B', bg: '#FEF2F2' },
};

function SellerDepositsSection() {
  const [deposits, setDeposits] = useState([]);
  const [totalLocked, setTotalLocked] = useState(0);
  const [loading, setLoading] = useState(true);
  const [seizeFor, setSeizeFor] = useState(null); // deposit row being seized
  const [seizeAmount, setSeizeAmount] = useState('');
  const [seizeBuyerId, setSeizeBuyerId] = useState('');
  const [seizeTradeId, setSeizeTradeId] = useState('');
  const [seizeReason, setSeizeReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${API_URL}/admin/seller-deposits`, { headers: authH() });
      setDeposits(r.data.deposits || []);
      setTotalLocked(parseFloat(r.data.total_locked_usdt || 0));
    } catch { toast.error('Failed to load seller deposits'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const approve = async (userId) => {
    if (!window.confirm('Release this security deposit back to the seller?')) return;
    try {
      await axios.post(`${API_URL}/admin/seller-deposits/${userId}/approve-withdrawal`, {}, { headers: authH() });
      toast.success('Deposit withdrawal approved');
      load();
    } catch (e) { toast.error(e.response?.data?.error || 'Failed to approve withdrawal'); }
  };

  const reject = async (userId) => {
    const reason = window.prompt('Reason for rejecting this withdrawal request (optional):') || '';
    try {
      await axios.post(`${API_URL}/admin/seller-deposits/${userId}/reject-withdrawal`, { reason }, { headers: authH() });
      toast.success('Withdrawal request rejected — deposit stays locked');
      load();
    } catch (e) { toast.error(e.response?.data?.error || 'Failed to reject withdrawal'); }
  };

  const openSeize = (d) => {
    setSeizeFor(d);
    setSeizeAmount(d.remaining_amount);
    setSeizeBuyerId('');
    setSeizeTradeId('');
    setSeizeReason('');
  };

  const submitSeize = async () => {
    if (!seizeFor || !seizeAmount || !seizeBuyerId) {
      toast.error('Amount and buyer ID are required');
      return;
    }
    setSubmitting(true);
    try {
      await axios.post(`${API_URL}/admin/seller-deposits/${seizeFor.user_id}/seize`, {
        amount: parseFloat(seizeAmount),
        buyer_id: seizeBuyerId.trim(),
        trade_id: seizeTradeId.trim() || undefined,
        reason: seizeReason.trim() || undefined,
      }, { headers: authH() });
      toast.success('Deposit seized and credited to buyer');
      setSeizeFor(null);
      load();
    } catch (e) { toast.error(e.response?.data?.error || 'Failed to seize deposit'); }
    finally { setSubmitting(false); }
  };

  const daysRemaining = (d) => Math.max(0, Math.ceil((new Date(d.eligible_at).getTime() - Date.now()) / 86400000));

  return (
    <div className="space-y-4">
      <SectionHead title="Seller Security Deposits" sub="Gift-card sellers' $200 USDT deposits — approve withdrawals, seize on lost disputes"
        action={<button onClick={load} className="p-2 rounded-xl border" style={{ borderColor: C.g200 }}><RefreshCw size={14} style={{ color: C.g500 }} /></button>} />

      <StatCard icon={<DollarSign size={20} />} label="Total Locked" value={`₮${totalLocked.toFixed(2)}`}
        sub={`${deposits.filter(d => d.status === 'LOCKED' || d.status === 'PENDING_WITHDRAWAL').length} active deposits`} />

      {loading ? <Spin /> : deposits.length === 0 ? <Empty icon={<Lock size={40} strokeWidth={1.5} style={{ color: C.g400 }} />} text="No seller deposits yet" /> : (
        <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: C.g200 }}>
          <table className="w-full text-xs">
            <thead>
              <tr style={{ backgroundColor: C.g50 }}>
                {['Seller', 'Status', 'Remaining', 'Locked', 'Eligible', 'Actions'].map(h => (
                  <th key={h} className="text-left px-4 py-2.5 font-black" style={{ color: C.g500 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {deposits.map(d => {
                const pill = DEPOSIT_STATUS_PILL[d.status] || { label: d.status, color: C.g500, bg: C.g100 };
                return (
                  <tr key={d.id} className="border-t" style={{ borderColor: C.g100 }}>
                    <td className="px-4 py-2.5">
                      <p className="font-bold" style={{ color: C.g800 }}>{d.user?.username || d.user_id?.slice(0, 8)}</p>
                      <p style={{ color: C.g400 }}>{d.user?.email}</p>
                    </td>
                    <td className="px-4 py-2.5"><Pill label={pill.label} color={pill.color} bg={pill.bg} /></td>
                    <td className="px-4 py-2.5 font-bold" style={{ color: C.g700 }}>₮{parseFloat(d.remaining_amount).toFixed(2)}</td>
                    <td className="px-4 py-2.5" style={{ color: C.g500 }}>{fmtAge(d.locked_at)}</td>
                    <td className="px-4 py-2.5" style={{ color: C.g500 }}>
                      {d.status === 'LOCKED' ? (daysRemaining(d) > 0 ? `${daysRemaining(d)}d left` : 'Eligible now') : '—'}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1.5">
                        {d.status === 'PENDING_WITHDRAWAL' && (
                          <>
                            <button onClick={() => approve(d.user_id)}
                              className="px-2.5 py-1 rounded-lg font-bold" style={{ backgroundColor: '#F0FDF4', color: '#166534' }}>
                              Approve
                            </button>
                            <button onClick={() => reject(d.user_id)}
                              className="px-2.5 py-1 rounded-lg font-bold" style={{ backgroundColor: '#FEF2F2', color: '#991B1B' }}>
                              Reject
                            </button>
                          </>
                        )}
                        {d.status === 'LOCKED' && (
                          <button onClick={() => openSeize(d)}
                            className="px-2.5 py-1 rounded-lg font-bold" style={{ backgroundColor: '#FEF2F2', color: '#991B1B' }}>
                            Seize
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {seizeFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}>
          <div className="bg-white rounded-2xl border p-5 w-full max-w-sm" style={{ borderColor: C.g200 }}>
            <div className="flex items-start justify-between mb-4">
              <h3 className="font-black text-sm" style={{ color: C.g800 }}>
                Seize Deposit — {seizeFor.user?.username || seizeFor.user_id?.slice(0, 8)}
              </h3>
              <button onClick={() => setSeizeFor(null)}><X size={14} style={{ color: C.g400 }} /></button>
            </div>
            <p className="text-xs mb-3" style={{ color: C.g500 }}>
              Moves USDT from this seller's deposit to the wronged buyer's wallet. Use after a dispute resolves against this seller.
            </p>
            <div className="space-y-2.5">
              <div>
                <label className="text-xs font-bold" style={{ color: C.g600 }}>Amount to seize (max ₮{parseFloat(seizeFor.remaining_amount).toFixed(2)})</label>
                <input type="number" value={seizeAmount} onChange={e => setSeizeAmount(e.target.value)}
                  max={seizeFor.remaining_amount} min="0" step="0.01"
                  className="w-full border rounded-xl px-3 py-2 text-sm outline-none mt-1" style={{ borderColor: C.g200 }} />
              </div>
              <div>
                <label className="text-xs font-bold" style={{ color: C.g600 }}>Buyer user ID (receives the credit)</label>
                <input type="text" value={seizeBuyerId} onChange={e => setSeizeBuyerId(e.target.value)}
                  className="w-full border rounded-xl px-3 py-2 text-sm outline-none mt-1" style={{ borderColor: C.g200 }} />
              </div>
              <div>
                <label className="text-xs font-bold" style={{ color: C.g600 }}>Trade ID (optional)</label>
                <input type="text" value={seizeTradeId} onChange={e => setSeizeTradeId(e.target.value)}
                  className="w-full border rounded-xl px-3 py-2 text-sm outline-none mt-1" style={{ borderColor: C.g200 }} />
              </div>
              <div>
                <label className="text-xs font-bold" style={{ color: C.g600 }}>Reason</label>
                <textarea value={seizeReason} onChange={e => setSeizeReason(e.target.value)} rows={2}
                  className="w-full border rounded-xl px-3 py-2 text-sm outline-none mt-1 resize-none" style={{ borderColor: C.g200 }} />
              </div>
            </div>
            <button onClick={submitSeize} disabled={submitting}
              className="w-full py-3 rounded-xl text-sm font-black transition mt-4"
              style={{ backgroundColor: submitting ? C.g200 : '#991B1B', color: submitting ? C.g400 : '#fff' }}>
              {submitting ? 'Seizing…' : 'Confirm Seizure'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ================================================================
// TEAM ACTIVITY — who's on the moderator team, and when they last logged in
// ================================================================
function TeamActivitySection() {
  const [team, setTeam]       = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${API_URL}/admin/team-activity`, { headers: authH() });
      setTeam(r.data.team || []);
    } catch { toast.error('Failed to load team activity'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); const iv = setInterval(load, 30000); return () => clearInterval(iv); }, []);

  const isOnline = ts => ts && (Date.now() - new Date(ts).getTime()) < 5 * 60 * 1000;

  return (
    <div className="space-y-4">
      <SectionHead title={`Team (${team.length})`} sub="Everyone with moderator or admin access, and when they last logged in"
        action={<button onClick={load} className="p-2 rounded-xl border" style={{ borderColor: C.g200 }}><RefreshCw size={14} style={{ color: C.g500 }} /></button>} />

      {loading ? <Spin /> : team.length === 0 ? <Empty icon={<ShieldCheck size={40} strokeWidth={1.5} style={{ color: C.g400 }} />} text="No team members yet" /> : (
        <div className="grid md:grid-cols-2 gap-4">
          {team.map(m => {
            const online = isOnline(m.last_seen_at);
            return (
              <div key={m.id} className="bg-white rounded-2xl border p-4" style={{ borderColor: C.g200 }}>
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 relative" style={{ backgroundColor: C.forest + '15' }}>
                      <Shield size={17} style={{ color: C.forest }} />
                      <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white"
                        style={{ backgroundColor: online ? '#10B981' : C.g400 }} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-black truncate" style={{ color: C.g800 }}>{m.full_name || m.username}</p>
                      <p className="text-xs truncate" style={{ color: C.g500 }}>{m.email}</p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    {m.is_admin && <Pill label="ADMIN" color="#B45309" bg="#FFFBEB" />}
                    <Pill label={online ? 'ONLINE' : 'OFFLINE'} color={online ? '#166534' : C.g500} bg={online ? '#F0FDF4' : C.g100} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2 rounded-lg" style={{ backgroundColor: C.g50 }}>
                    <p className="font-semibold" style={{ color: C.g400 }}>Last active</p>
                    <p className="font-bold mt-0.5" style={{ color: C.g700 }}>{m.last_seen_at ? fmtAge(m.last_seen_at) : '—'}</p>
                  </div>
                  <div className="p-2 rounded-lg" style={{ backgroundColor: C.g50 }}>
                    <p className="font-semibold" style={{ color: C.g400 }}>Last login</p>
                    <p className="font-bold mt-0.5" style={{ color: C.g700 }}>{m.last_login ? fmtAge(m.last_login) : '—'}</p>
                  </div>
                  <div className="p-2 rounded-lg" style={{ backgroundColor: C.g50 }}>
                    <p className="font-semibold" style={{ color: C.g400 }}>Oath of Trust</p>
                    <p className="font-bold mt-0.5" style={{ color: m.oath_signed ? '#166534' : '#B91C1C' }}>{m.oath_signed ? 'Signed ✓' : 'Not signed'}</p>
                  </div>
                  <div className="p-2 rounded-lg" style={{ backgroundColor: C.g50 }}>
                    <p className="font-semibold" style={{ color: C.g400 }}>Votes cast</p>
                    <p className="font-bold mt-0.5" style={{ color: C.g700 }}>{m.votes_cast}</p>
                  </div>
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
// ================================================================
// PHONE VERIFICATION SECTION
// ================================================================
function PhoneVerifSection() {
  const [users, setUsers]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [acting, setActing]     = useState(null); // userId being acted on
  const [rejectTarget, setRejectTarget] = useState(null); // {id, phone, username}
  const [rejectReason, setRejectReason] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${API_URL}/admin/phone/pending`, { headers: authH() });
      setUsers(r.data.users || []);
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to load pending phone verifications');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const approve = async (userId) => {
    setActing(userId);
    try {
      await axios.post(`${API_URL}/admin/phone/approve`, { userId }, { headers: authH() });
      toast.success(<span className="inline-flex items-center gap-1"><CheckCircle size={14} /> Phone number approved! User notified.</span>);
      load();
    } catch (e) { toast.error(e.response?.data?.error || 'Approval failed'); }
    finally { setActing(null); }
  };

  const confirmReject = async () => {
    if (!rejectTarget) return;
    setActing(rejectTarget.id);
    try {
      await axios.post(`${API_URL}/admin/phone/reject`,
        { userId: rejectTarget.id, reason: rejectReason || 'Phone number could not be verified' },
        { headers: authH() });
      toast.success('Phone rejected. User notified and can re-submit.');
      setRejectTarget(null);
      setRejectReason('');
      load();
    } catch (e) { toast.error(e.response?.data?.error || 'Rejection failed'); }
    finally { setActing(null); }
  };

  return (
    <div className="space-y-4">
      <SectionHead
        title={`Pending Phone Verifications${users.length > 0 ? ` (${users.length})` : ''}`}
        sub="Users who submitted a phone number but have not been verified yet"
        action={
          <button onClick={load} className="p-2 rounded-xl border hover:bg-gray-50 transition" style={{ borderColor: C.g200 }}>
            <RefreshCw size={14} style={{ color: C.g500 }} />
          </button>
        }
      />

      {/* Reject reason modal */}
      {rejectTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <h3 className="font-black text-base mb-1" style={{ color: C.g800 }}>Reject Phone Number</h3>
            <p className="text-xs mb-4" style={{ color: C.g500 }}>
              Rejecting <strong>{rejectTarget.phone_number}</strong> for <strong>{rejectTarget.username}</strong>.
              The number will be cleared so they can re-submit.
            </p>
            <textarea
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              placeholder="e.g. Invalid number, cannot verify ownership…"
              rows={3}
              className="w-full border rounded-xl p-3 text-sm outline-none mb-4 resize-none"
              style={{ borderColor: C.g200, color: C.g700 }} />
            <div className="flex gap-2">
              <button onClick={() => { setRejectTarget(null); setRejectReason(''); }}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold border"
                style={{ borderColor: C.g200, color: C.g600 }}>
                Cancel
              </button>
              <button onClick={confirmReject} disabled={!!acting}
                className="flex-1 py-2.5 rounded-xl text-sm font-black text-white"
                style={{ backgroundColor: C.danger }}>
                {acting ? 'Rejecting…' : 'Reject & Notify'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: C.g200 }}>
        {loading ? <Spin /> : users.length === 0 ? (
          <Empty icon={<Phone size={40} strokeWidth={1.5} style={{ color: C.g400 }} />} text="No pending phone verifications — all clear!" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead style={{ backgroundColor: C.g50 }}>
                <tr>
                  {['User / Real Name', 'Phone Number', 'Country', 'Submitted', 'Waiting', 'Actions'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-black uppercase tracking-wide" style={{ color: C.g500 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map(u => {
                  const submittedDate = u.submitted_at || u.created_at;
                  const waitDays = submittedDate
                    ? Math.floor((Date.now() - new Date(submittedDate)) / 86400000)
                    : null;
                  return (
                  <tr key={u.id} className="border-t hover:bg-gray-50 transition" style={{ borderColor: C.g100 }}>
                    {/* User */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-black text-white flex-shrink-0"
                          style={{ backgroundColor: C.forest }}>
                          {(u.username || '?')[0].toUpperCase()}
                        </div>
                        <div>
                          <p className="font-black text-xs" style={{ color: C.g800 }}>{u.username}</p>
                          {u.full_name && (
                            <p className="text-xs font-semibold inline-flex items-center gap-1" style={{ color: C.mint }}><User size={12} /> {u.full_name}</p>
                          )}
                          <p className="text-xs" style={{ color: C.g400 }}>{u.email}</p>
                        </div>
                      </div>
                    </td>
                    {/* Phone */}
                    <td className="px-4 py-3">
                      <span className="font-black text-sm px-2 py-1 rounded-lg"
                        style={{ backgroundColor: '#FFFBEB', color: '#92400E' }}>
                        {u.phone || u.phone_number}
                      </span>
                    </td>
                    {/* Country */}
                    <td className="px-4 py-3"><CountryCell user={u} /></td>
                    {/* Submitted date */}
                    <td className="px-4 py-3 text-xs" style={{ color: C.g500 }}>
                      {u.submitted_at ? (
                        <>{fmtDate(u.submitted_at)}<br /><span style={{ color: C.g400 }}>{fmtAge(u.submitted_at)}</span></>
                      ) : (
                        <span style={{ color: C.g300 }}>—</span>
                      )}
                    </td>
                    {/* Waiting duration */}
                    <td className="px-4 py-3">
                      {waitDays !== null && (
                        <span className="text-xs font-black px-2 py-0.5 rounded-full"
                          style={{
                            backgroundColor: waitDays >= 3 ? '#FEF2F2' : waitDays >= 1 ? '#FFFBEB' : '#F0FDF4',
                            color: waitDays >= 3 ? '#991B1B' : waitDays >= 1 ? '#92400E' : '#166534',
                          }}>
                          {waitDays === 0 ? 'Today' : `${waitDays}d`}
                        </span>
                      )}
                    </td>
                    {/* Actions */}
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button
                          disabled={acting === u.id}
                          onClick={() => approve(u.id)}
                          className="px-3 py-1.5 rounded-lg text-xs font-black transition hover:opacity-80 flex items-center gap-1"
                          style={{ backgroundColor: '#F0FDF4', color: '#166534' }}>
                          {acting === u.id ? '…' : <><CheckCircle size={11} /> Approve</>}
                        </button>
                        <button
                          disabled={acting === u.id}
                          onClick={() => { setRejectTarget({ id: u.id, phone_number: u.phone_number, username: u.username }); setRejectReason(''); }}
                          className="px-3 py-1.5 rounded-lg text-xs font-black transition hover:opacity-80 flex items-center gap-1"
                          style={{ backgroundColor: '#FEF2F2', color: '#991B1B' }}>
                          <XCircle size={11} /> Reject
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
    </div>
  );
}

// ================================================================
// KYC REVIEW SECTION
// ================================================================
function KycSection() {
  const [submissions, setSubs]     = useState([]);
  const [loading, setLoading]      = useState(true);
  const [filter, setFilter]        = useState('pending');
  const [selected, setSelected]    = useState(null);
  const [acting, setActing]        = useState(false);
  const [zoomImg, setZoomImg]      = useState(null);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [migrationNeeded, setMigrationNeeded] = useState(false);
  const [migrationHint, setMigrationHint]     = useState('');
  const [backfilling, setBackfilling]         = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setMigrationNeeded(false);
    try {
      const r = await axios.get(`${API_URL}/admin/kyc`, { headers: authH(), params: { status: filter } });
      setSubs(r.data.submissions || []);
      if (r.data.migration_needed) {
        setMigrationNeeded(true);
        setMigrationHint(r.data.migration_hint || '');
      }
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to load KYC');
    }
    finally { setLoading(false); }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const backfill = async () => {
    setBackfilling(true);
    try {
      const r = await axios.post(`${API_URL}/admin/backfill-kyc`, {}, { headers: authH() });
      if (r.data.updated > 0) {
        toast.success(`Fixed ${r.data.updated} legacy submission(s) — now showing as pending`);
        load();
      } else {
        toast.info('No legacy submissions found to fix');
      }
    } catch (e) { toast.error(e.response?.data?.error || 'Backfill failed'); }
    finally { setBackfilling(false); }
  };

  const approve = async (id) => {
    setActing(true);
    try {
      await axios.put(`${API_URL}/admin/kyc/${id}/approve`, {}, { headers: authH() });
      toast.success(<span className="inline-flex items-center gap-1">KYC approved <CheckCircle size={14} /></span>);
      setSelected(null); load();
    } catch (e) { toast.error(e.response?.data?.error || 'Failed'); }
    finally { setActing(false); }
  };

  const reject = (u) => {
    setRejectTarget(u);
    setRejectReason('');
  };

  const confirmReject = async () => {
    if (!rejectTarget) return;
    setActing(true);
    try {
      await axios.put(`${API_URL}/admin/kyc/${rejectTarget.id}/reject`,
        { reason: rejectReason || 'Documents unclear or invalid. Please resubmit with clearer photos.' },
        { headers: authH() });
      toast.success('KYC rejected — user notified.');
      setSelected(null);
      setRejectTarget(null);
      setRejectReason('');
      load();
    } catch (e) { toast.error(e.response?.data?.error || 'Failed'); }
    finally { setActing(false); }
  };

  return (
    <div className="space-y-4">
      {zoomImg && <ImageModal src={zoomImg.src} label={zoomImg.label} onClose={() => setZoomImg(null)} />}

      {/* KYC Reject reason modal */}
      {rejectTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <h3 className="font-black text-base mb-1" style={{ color: C.g800 }}>Reject KYC Submission</h3>
            <p className="text-xs mb-4" style={{ color: C.g500 }}>
              Rejecting documents for <strong>{rejectTarget.username}</strong>{rejectTarget.full_name ? ` (${rejectTarget.full_name})` : ''}.
              The user will be notified with your reason.
            </p>
            <textarea
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              placeholder="e.g. Photo blurry, ID not readable, selfie face not visible…"
              rows={3}
              className="w-full border rounded-xl p-3 text-sm outline-none mb-4 resize-none"
              style={{ borderColor: C.g200, color: C.g700 }} />
            <div className="flex gap-2">
              <button onClick={() => { setRejectTarget(null); setRejectReason(''); }}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold border"
                style={{ borderColor: C.g200, color: C.g600 }}>
                Cancel
              </button>
              <button onClick={confirmReject} disabled={acting}
                className="flex-1 py-2.5 rounded-xl text-sm font-black text-white"
                style={{ backgroundColor: '#EF4444' }}>
                {acting ? 'Rejecting…' : <span className="inline-flex items-center gap-1.5"><XCircle size={14} /> Reject & Notify</span>}
              </button>
            </div>
          </div>
        </div>
      )}

      <SectionHead title="KYC Review" sub="Review and approve user identity documents"
        action={
          <div className="flex gap-2 items-center">
            {['pending','approved','rejected','all'].map(s => (
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

      {/* Migration warning banner */}
      {migrationNeeded && (
        <div className="flex items-start gap-3 p-4 rounded-2xl border-2" style={{ backgroundColor:'#FFFBEB', borderColor:'#F59E0B' }}>
          <AlertTriangle size={18} style={{ color:'#92400E', flexShrink:0, marginTop:1 }} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-black" style={{ color:'#92400E' }}>Database Migration Required</p>
            <p className="text-xs mt-0.5 mb-3" style={{ color:'#A16207' }}>
              KYC columns are missing from your database. Run <code className="font-mono bg-yellow-100 px-1 rounded">admin_columns.sql</code> in your Supabase SQL Editor to enable full KYC management.
            </p>
            <details className="mb-2">
              <summary className="text-xs font-bold cursor-pointer" style={{ color:'#92400E' }}>Show SQL to run →</summary>
              <pre className="mt-2 text-xs p-3 rounded-xl overflow-x-auto" style={{ backgroundColor:'#1E293B', color:'#94A3B8' }}>{`ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_status VARCHAR(20) DEFAULT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS id_type VARCHAR(50) DEFAULT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS id_front_url TEXT DEFAULT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS id_back_url TEXT DEFAULT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS selfie_url TEXT DEFAULT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_submitted_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_approved_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_rejection_reason TEXT DEFAULT NULL;
UPDATE users SET kyc_status = 'approved' WHERE is_id_verified = true AND kyc_status IS NULL;`}</pre>
            </details>
          </div>
        </div>
      )}

      {/* Backfill button — shown when results are empty and not loading */}
      {!loading && !migrationNeeded && submissions.length === 0 && filter === 'pending' && (
        <div className="flex items-center gap-3 p-4 rounded-2xl border" style={{ backgroundColor:'#EFF6FF', borderColor:'#BFDBFE' }}>
          <div className="flex-1">
            <p className="text-sm font-black" style={{ color:'#1E40AF' }}>No pending submissions found</p>
            <p className="text-xs mt-0.5" style={{ color:'#3B82F6' }}>
              If users uploaded documents before the KYC tracking was set up, click below to mark them as pending.
            </p>
          </div>
          <button onClick={backfill} disabled={backfilling}
            className="flex-shrink-0 px-4 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 transition"
            style={{ backgroundColor: backfilling ? C.g200 : C.forest, color: backfilling ? C.g400 : '#fff' }}>
            {backfilling ? <><RefreshCw size={12} className="animate-spin" /> Fixing…</> : <><Wrench size={13} /> Fix Legacy Submissions</>}
          </button>
        </div>
      )}

      {loading ? <Spin /> : submissions.length === 0 ? null : (
        <div className="flex gap-4">
          <div className="flex-1 grid grid-cols-1 gap-3">
            {submissions.map(u => {
              const waitDays = u.kyc_submitted_at
                ? Math.floor((Date.now() - new Date(u.kyc_submitted_at)) / 86400000)
                : null;
              return (
              <div key={u.id} onClick={() => setSelected(u)}
                className="bg-white rounded-2xl border p-4 cursor-pointer hover:shadow-md transition"
                style={{ borderColor: selected?.id === u.id ? C.forest : C.g200, borderWidth: selected?.id === u.id ? 2 : 1 }}>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-black text-white flex-shrink-0" style={{ backgroundColor: C.forest }}>
                    {(u.username || '?')[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-black text-sm" style={{ color: C.g800 }}>{u.username}</p>
                    {u.full_name && <p className="text-xs font-semibold inline-flex items-center gap-1" style={{ color: C.mint }}><User size={12} /> {u.full_name}</p>}
                    <p className="text-xs truncate" style={{ color: C.g400 }}>{u.email}</p>
                    {u.country && <p className="text-xs inline-flex items-center gap-1" style={{ color: C.g500 }}><Globe size={12} /> {u.country}</p>}
                  </div>
                  <div className="text-right flex flex-col items-end gap-1">
                    <Pill label={u.kyc_status || 'unverified'}
                      color={u.kyc_status === 'approved' ? '#166534' : u.kyc_status === 'rejected' ? '#991B1B' : u.kyc_status === 'pending' ? '#92400E' : '#475569'}
                      bg={u.kyc_status === 'approved' ? '#F0FDF4' : u.kyc_status === 'rejected' ? '#FEF2F2' : u.kyc_status === 'pending' ? '#FFFBEB' : C.g100} />
                    <p className="text-xs" style={{ color: C.g400 }}>{u.id_type || (u.id_front_url ? 'Has doc' : 'No doc')}</p>
                    {waitDays !== null && (
                      <span className="text-xs font-black px-1.5 py-0.5 rounded-full"
                        style={{
                          backgroundColor: waitDays >= 3 ? '#FEF2F2' : waitDays >= 1 ? '#FFFBEB' : '#F0FDF4',
                          color: waitDays >= 3 ? '#991B1B' : waitDays >= 1 ? '#92400E' : '#166534',
                        }}>
                        {waitDays === 0 ? 'Today' : `${waitDays}d waiting`}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              );
            })}
          </div>

          {selected && (
            <div className="w-80 bg-white rounded-2xl border p-5 flex-shrink-0" style={{ borderColor: C.g200 }}>
              <div className="flex items-start justify-between mb-4">
                <h3 className="font-black text-sm" style={{ color: C.g800 }}>KYC Submission</h3>
                <button onClick={() => setSelected(null)}><X size={14} style={{ color: C.g400 }} /></button>
              </div>
              <p className="font-black" style={{ color: C.g800 }}>{selected.username}</p>
              {selected.full_name && (
                <div className="flex items-center gap-1.5 mt-0.5 mb-1 px-2 py-1 rounded-lg"
                  style={{ backgroundColor: '#F0FDF4' }}>
                  <UserCheck size={12} style={{ color: C.mint }} />
                  <span className="text-xs font-black" style={{ color: C.forest }}>{selected.full_name}</span>
                </div>
              )}
              <p className="text-xs mb-3" style={{ color: C.g400 }}>{selected.email}</p>
              <div className="space-y-1.5 mb-4">
                {[
                  { label:'Real Name',  value: selected.full_name || '—' },
                  { label:'Country',    value: selected.country || '—' },
                  { label:'Phone',      value: selected.phone_number ? `${selected.phone_number}${selected.is_phone_verified ? ' ✓' : ' (unverified)'}` : '—' },
                  { label:'ID Type',    value: selected.id_type || '—' },
                  { label:'Submitted',  value: selected.kyc_submitted_at ? `${fmtDate(selected.kyc_submitted_at)} (${fmtAge(selected.kyc_submitted_at)})` : '—' },
                  { label:'Status',     value: selected.kyc_status || 'pending' },
                ].map(r => (
                  <div key={r.label} className="flex justify-between py-1.5 border-b" style={{ borderColor: C.g100 }}>
                    <span className="text-xs" style={{ color: C.g400 }}>{r.label}</span>
                    <span className="text-xs font-bold text-right max-w-40 truncate" style={{ color: C.g700 }}>{r.value}</span>
                  </div>
                ))}
              </div>

              {/* Always show image section — null URL means storage upload failed */}
              <div className="mb-3">
                <p className="text-xs font-black uppercase tracking-wider mb-2 inline-flex items-center gap-1" style={{ color: C.g400 }}><CreditCard size={13} /> Identity Documents</p>
                {(!selected.id_front_url && !selected.id_back_url) ? (
                  <div className="rounded-xl border-2 border-dashed p-4" style={{ borderColor: '#FCA5A5', backgroundColor: '#FEF2F2' }}>
                    <p className="text-xs font-black mb-1 inline-flex items-center gap-1.5" style={{ color: '#991B1B' }}><AlertTriangle size={13} /> Documents not saved to storage</p>
                    <p className="text-xs mb-3" style={{ color: '#B91C1C' }}>
                      The user's images failed to upload. Make sure the <code className="font-mono bg-red-100 px-1 rounded">kyc-documents</code> bucket exists in Supabase Storage, then ask the user to resubmit.
                    </p>
                    {selected.kyc_status === 'pending' && (
                      <button
                        disabled={acting}
                        onClick={() => { setRejectTarget(selected); setRejectReason('Your document upload failed on our end. Please go to Settings → Verification → Identity (KYC) and resubmit your ID photos.'); }}
                        className="w-full py-2 rounded-lg text-xs font-black inline-flex items-center justify-center gap-1.5"
                        style={{ backgroundColor: '#EF4444', color: '#fff' }}>
                        <Upload size={12} /> Reject & Ask User to Resubmit
                      </button>
                    )}
                  </div>
                ) : (
                  <>
                    {selected.id_front_url && (
                      <KycImageBlock
                        userId={selected.id} type="front" label="ID Front" large
                        onZoom={(src) => setZoomImg({ src, label: `${selected.username} — ID Front` })}
                      />
                    )}
                    {selected.id_back_url && (
                      <KycImageBlock
                        userId={selected.id} type="back" label="ID Back" large
                        onZoom={(src) => setZoomImg({ src, label: `${selected.username} — ID Back` })}
                      />
                    )}
                  </>
                )}
              </div>

              {selected.kyc_status === 'pending' && (
                <div className="flex gap-2">
                  <button disabled={acting} onClick={() => approve(selected.id)}
                    className="flex-1 py-2.5 rounded-xl text-xs font-black" style={{ backgroundColor:'#F0FDF4', color:'#166534' }}>
                    {acting ? '…' : <span className="inline-flex items-center gap-1.5"><CheckCircle size={13} /> Approve</span>}
                  </button>
                  <button disabled={acting} onClick={() => reject(selected)}
                    className="flex-1 py-2.5 rounded-xl text-xs font-black" style={{ backgroundColor:'#FEF2F2', color:'#991B1B' }}>
                    <span className="inline-flex items-center gap-1.5"><XCircle size={13} /> Reject</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ================================================================
// P2P MIGRATION SECTION — leads from Noones / Binance P2P / other,
// captured on /register before they create an account.
// ================================================================
const MIGRATION_PLATFORM_LABEL = { noones: 'Noones', binance: 'Binance P2P', other: 'Other P2P' };

function P2PMigrationSection() {
  const [submissions, setSubs] = useState([]);
  const [loading, setLoading]  = useState(true);
  const [filter, setFilter]    = useState('pending');
  const [zoomImg, setZoomImg]  = useState(null);
  const [acting, setActing]    = useState(false);
  const [migrationNeeded, setMigrationNeeded] = useState(false);
  const [migrationHint, setMigrationHint]     = useState('');

  // Approve modal — collects what the admin saw in the screenshot
  const [approveTarget, setApproveTarget] = useState(null);
  const [usernameSeen, setUsernameSeen]   = useState('');
  const [feedbackCount, setFeedbackCount] = useState('');
  const [approveNotes, setApproveNotes]   = useState('');

  // Reject modal
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

      {/* Approve modal */}
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

      {/* Reject modal */}
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
// FINANCE SECTION
// ================================================================
// ── Platform Wallets sub-card ─────────────────────────────────────────────────
function PlatformWalletsCard() {
  const [wallets, setWallets]   = useState(null);
  const [checking, setChecking] = useState(false);
  const [copied, setCopied]     = useState('');
  const [btcPrice, setBtcPrice] = useState(0);
  const [priceSource, setPriceSrc] = useState('');

  // Fetch live BTC price directly — bypasses any backend cache
  const fetchLiveBtcPrice = async () => {
    const sources = [
      { url: 'https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT', parse: d => parseFloat(d.price), name: 'Binance' },
      { url: 'https://api.coinbase.com/v2/prices/BTC-USD/spot',            parse: d => parseFloat(d.data.amount), name: 'Coinbase' },
      { url: 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd', parse: d => parseFloat(d.bitcoin.usd), name: 'CoinGecko' },
    ];
    for (const src of sources) {
      try {
        const r = await fetch(src.url, { signal: AbortSignal.timeout(5000) });
        const d = await r.json();
        const p = src.parse(d);
        if (p > 1000) { setBtcPrice(p); setPriceSrc(src.name); return p; }
      } catch {}
    }
    return 0;
  };

  const fetchWallets = async () => {
    setChecking(true);
    try {
      // Fetch wallet data + live BTC price in parallel
      const [hwRes, infoRes, livePrice] = await Promise.all([
        axios.get(`${API_URL}/hd-wallet/hot-wallet`, { headers: authH() }),
        axios.get(`${API_URL}/hd-wallet/info`,        { headers: authH() }),
        fetchLiveBtcPrice(),
      ]);
      setWallets({ hot: hwRes.data, fee: infoRes.data });
      if (livePrice > 0) setBtcPrice(livePrice);
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to load wallet balances');
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => { fetchWallets(); }, []);

  const copy = (text, key) => {
    copyToClipboard(text, 'Copied!')
      .then((ok) => { if (ok) setCopied(key); setTimeout(() => setCopied(''), 2000); });
  };

  const toUsd = (btc) => btcPrice > 0
    ? `$${(btc * btcPrice).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : '—';

  return (
    <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: C.g200 }}>
      <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: C.g100, backgroundColor: '#F0FDF4' }}>
        <div>
          <h3 className="font-black text-sm inline-flex items-center gap-1.5" style={{ color: C.forest }}><Landmark size={15} /> Platform Wallets — Live BTC Balance</h3>
          <p className="text-xs mt-0.5" style={{ color: C.g500 }}>Hot withdrawal wallet + fee collection wallet</p>
        </div>
        <button onClick={fetchWallets} disabled={checking}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black transition hover:opacity-80 disabled:opacity-50"
          style={{ backgroundColor: C.forest, color: '#fff' }}>
          <RefreshCw size={12} className={checking ? 'animate-spin' : ''} />
          {checking ? 'Checking…' : 'Refresh'}
        </button>
      </div>

      {checking && !wallets ? (
        <div className="flex items-center justify-center py-10 gap-3">
          <RefreshCw size={18} className="animate-spin" style={{ color: C.g400 }} />
          <span className="text-sm" style={{ color: C.g500 }}>Checking live blockchain balances…</span>
        </div>
      ) : wallets ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x" style={{ borderColor: C.g100 }}>

          {/* Hot Wallet */}
          {(() => {
            const hw      = wallets.hot;
            const total   = parseFloat(hw.total_btc   ?? hw.confirmed_btc ?? 0);
            const conf    = parseFloat(hw.confirmed_btc   ?? 0);
            const unconf  = parseFloat(hw.unconfirmed_btc ?? 0);
            const hasUnconf = unconf > 0;
            const isEmpty  = total === 0;
            return (
              <div className="p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: !isEmpty ? '#D1FAE5' : '#FEF2F2' }}>
                    <Bitcoin size={16} color={!isEmpty ? C.forest : '#DC2626'} />
                  </div>
                  <div>
                    <p className="font-black text-xs" style={{ color: C.g700 }}>Hot Withdrawal Wallet</p>
                    <p className="text-[11px]" style={{ color: C.g400 }}>
                      Fund this to enable user withdrawals
                      {hw.source && <span className="ml-1 opacity-60">· via {hw.source}</span>}
                    </p>
                  </div>
                </div>

                {/* Main balance — shows TOTAL (confirmed + unconfirmed) */}
                <div className="p-3 rounded-xl" style={{ backgroundColor: !isEmpty ? '#F0FDF4' : '#FEF2F2' }}>
                  <p className="text-[11px] font-black uppercase tracking-wide mb-1"
                    style={{ color: !isEmpty ? C.forest : '#DC2626' }}>
                    Total Balance
                  </p>
                  <p className="text-2xl font-black" style={{ color: !isEmpty ? C.forest : '#DC2626' }}>
                    ₿{total.toFixed(8)}
                  </p>
                  {btcPrice > 0 && (
                    <p className="text-sm font-bold mt-0.5" style={{ color: !isEmpty ? C.forest : '#DC2626' }}>
                      {toUsd(total)}
                    </p>
                  )}

                  {/* Breakdown row */}
                  <div className="flex gap-4 mt-2 pt-2 border-t" style={{ borderColor: !isEmpty ? '#BBF7D0' : '#FECACA' }}>
                    <div>
                      <p className="text-[10px] font-black uppercase" style={{ color: C.g500 }}>Confirmed</p>
                      <p className="text-xs font-black" style={{ color: C.g700 }}>₿{conf.toFixed(8)}</p>
                      {btcPrice > 0 && <p className="text-[10px]" style={{ color: C.g400 }}>{toUsd(conf)}</p>}
                    </div>
                    {hasUnconf && (
                      <div>
                        <p className="text-[10px] font-black uppercase" style={{ color: '#D97706' }}>Pending (unconf.)</p>
                        <p className="text-xs font-black" style={{ color: '#D97706' }}>₿{unconf.toFixed(8)}</p>
                        {btcPrice > 0 && <p className="text-[10px]" style={{ color: '#D97706' }}>{toUsd(unconf)}</p>}
                      </div>
                    )}
                  </div>

                  {isEmpty && (
                    <p className="text-xs font-bold mt-2" style={{ color: '#DC2626' }}>
                      <AlertTriangle size={12} className="inline-block mr-1" /> Empty — users cannot withdraw until funded
                    </p>
                  )}
                  {hw.balance_error && (
                    <p className="text-[10px] mt-1" style={{ color: '#DC2626' }}>
                      <AlertTriangle size={11} className="inline-block mr-1" /> API error: {hw.balance_error}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <code className="flex-1 text-[11px] bg-gray-50 border px-2 py-1.5 rounded-lg truncate font-mono"
                    style={{ borderColor: C.g200, color: C.g600 }}>
                    {hw.hot_wallet_address}
                  </code>
                  <button onClick={() => copy(hw.hot_wallet_address, 'hot')}
                    className="px-2.5 py-1.5 rounded-lg text-[11px] font-black transition hover:opacity-80 flex-shrink-0"
                    style={{ backgroundColor: copied === 'hot' ? C.forest : C.g100, color: copied === 'hot' ? '#fff' : C.g600 }}>
                    {copied === 'hot' ? '✓ Copied' : 'Copy'}
                  </button>
                </div>
                <a href={`https://mempool.space/address/${hw.hot_wallet_address}`}
                  target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] font-bold hover:underline"
                  style={{ color: '#2563EB' }}>
                  View on mempool.space ↗
                </a>
              </div>
            );
          })()}

          {/* Fee Wallet */}
          <div className="p-5 space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: '#FEF3C7' }}>
                <DollarSign size={16} color="#D97706" />
              </div>
              <div>
                <p className="font-black text-xs" style={{ color: C.g700 }}>Fee Collection Wallet</p>
                <p className="text-[11px]" style={{ color: C.g400 }}>1% on BTC trades · 2% on gift cards</p>
              </div>
            </div>

            <div className="p-3 rounded-xl" style={{ backgroundColor: '#FFFBEB' }}>
              <p className="text-xs font-semibold" style={{ color: '#D97706' }}>Fee rate: {wallets.fee.praqen_fee_rate}</p>
              <p className="text-xs mt-0.5" style={{ color: C.g400 }}>Network: {wallets.fee.network}</p>
            </div>

            <div className="flex items-center gap-2">
              <code className="flex-1 text-[11px] bg-gray-50 border px-2 py-1.5 rounded-lg truncate font-mono"
                style={{ borderColor: C.g200, color: C.g600 }}>
                {wallets.fee.praqen_fee_wallet}
              </code>
              <button onClick={() => copy(wallets.fee.praqen_fee_wallet, 'fee')}
                className="px-2.5 py-1.5 rounded-lg text-[11px] font-black transition hover:opacity-80 flex-shrink-0"
                style={{ backgroundColor: copied === 'fee' ? '#D97706' : C.g100, color: copied === 'fee' ? '#fff' : C.g600 }}>
                {copied === 'fee' ? '✓ Copied' : 'Copy'}
              </button>
            </div>
            <a href={`https://mempool.space/address/${wallets.fee.praqen_fee_wallet}`}
              target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1 text-[11px] font-bold hover:underline"
              style={{ color: '#2563EB' }}>
              View on mempool.space ↗
            </a>
          </div>
        </div>
      ) : (
        <div className="py-8 text-center">
          <p className="text-sm font-semibold" style={{ color: C.g400 }}>Click Refresh to check live balances</p>
        </div>
      )}
    </div>
  );
}

// ── USDT Hot Wallet sub-card — parity with PlatformWalletsCard (BTC) ─────────
function UsdtWalletCard() {
  const [data,     setData]     = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [busy,     setBusy]     = useState(false);
  const [copied,   setCopied]   = useState('');
  const [sendTo,   setSendTo]   = useState('');
  const [sendAmt,  setSendAmt]  = useState('');
  const [sending,  setSending]  = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${API_URL}/admin/usdt-wallet`, { headers: authH() });
      setData(r.data);
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to load USDT wallet');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const copy = (text, key) => {
    copyToClipboard(text, 'Copied!')
      .then((ok) => { if (ok) setCopied(key); setTimeout(() => setCopied(''), 2000); });
  };

  const processSweeps = async () => {
    setBusy(true);
    try {
      await axios.post(`${API_URL}/admin/hot-wallet/process-sweeps`, {}, { headers: authH() });
      toast.success('Pending sweeps processed');
      await load();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to process sweeps');
    } finally {
      setBusy(false);
    }
  };

  const sendUsdt = async () => {
    const amount = parseFloat(sendAmt);
    if (!sendTo || !amount || amount <= 0) { toast.error('Enter a valid address and amount'); return; }
    if (!window.confirm(`Send ₮${amount.toFixed(2)} USDT from the hot wallet to ${sendTo}? This broadcasts on-chain immediately and cannot be undone.`)) return;
    setSending(true);
    try {
      const r = await axios.post(`${API_URL}/admin/hot-wallet/send-usdt`,
        { toAddress: sendTo, amountUsdt: amount }, { headers: authH() });
      toast.success(`Sent ₮${amount.toFixed(2)} USDT — txid ${r.data.txid?.slice(0, 10)}…`);
      setSendTo(''); setSendAmt('');
      await load();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Send failed');
    } finally {
      setSending(false);
    }
  };

  const s = data?.status;
  const trxColor = s?.trx_status === 'ok' ? C.forest : s?.trx_status === 'low' ? '#D97706' : '#DC2626';
  const trxBg    = s?.trx_status === 'ok' ? '#F0FDF4' : s?.trx_status === 'low' ? '#FFFBEB' : '#FEF2F2';

  return (
    <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: C.g200 }}>
      <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: C.g100, backgroundColor: '#ECFEFF' }}>
        <div>
          <h3 className="font-black text-sm inline-flex items-center gap-1.5" style={{ color: '#0E7490' }}><DollarSign size={15} /> USDT Hot Wallet — Live TRC-20 Balance</h3>
          <p className="text-xs mt-0.5" style={{ color: C.g500 }}>Tron mainnet · deposits sweep here, withdrawals send from here</p>
        </div>
        <button onClick={load} disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black transition hover:opacity-80 disabled:opacity-50"
          style={{ backgroundColor: '#0E7490', color: '#fff' }}>
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          {loading ? 'Checking…' : 'Refresh'}
        </button>
      </div>

      {loading && !data ? (
        <div className="flex items-center justify-center py-10 gap-3">
          <RefreshCw size={18} className="animate-spin" style={{ color: C.g400 }} />
          <span className="text-sm" style={{ color: C.g500 }}>Checking live Tron balances…</span>
        </div>
      ) : s ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x" style={{ borderColor: C.g100 }}>
            {/* USDT balance */}
            <div className="p-5 space-y-3">
              <p className="text-[11px] font-black uppercase tracking-wide" style={{ color: C.g400 }}>Hot Wallet USDT</p>
              <p className="text-2xl font-black" style={{ color: '#0E7490' }}>₮{fmt(s.hot_wallet_usdt, 2)}</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-[11px] bg-gray-50 border px-2 py-1.5 rounded-lg truncate font-mono"
                  style={{ borderColor: C.g200, color: C.g600 }}>
                  {s.hot_wallet_address}
                </code>
                <button onClick={() => copy(s.hot_wallet_address, 'usdt')}
                  className="px-2.5 py-1.5 rounded-lg text-[11px] font-black transition hover:opacity-80 flex-shrink-0"
                  style={{ backgroundColor: copied === 'usdt' ? '#0E7490' : C.g100, color: copied === 'usdt' ? '#fff' : C.g600 }}>
                  {copied === 'usdt' ? '✓ Copied' : 'Copy'}
                </button>
              </div>
              <a href={`https://tronscan.org/#/address/${s.hot_wallet_address}`}
                target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-1 text-[11px] font-bold hover:underline" style={{ color: '#2563EB' }}>
                View on TronScan ↗
              </a>
            </div>

            {/* TRX gas */}
            <div className="p-5 space-y-3">
              <p className="text-[11px] font-black uppercase tracking-wide" style={{ color: C.g400 }}>Gas Reserve (TRX)</p>
              <div className="p-3 rounded-xl" style={{ backgroundColor: trxBg }}>
                <p className="text-xl font-black" style={{ color: trxColor }}>{fmt(s.hot_wallet_trx, 2)} TRX</p>
                <p className="text-[11px] font-bold uppercase mt-1" style={{ color: trxColor }}>{s.trx_status}</p>
                <p className="text-[10px] mt-1" style={{ color: C.g400 }}>Min reserve: {s.min_trx_reserve} TRX</p>
              </div>
              {s.trx_status !== 'ok' && (
                <p className="text-[11px] font-bold" style={{ color: '#DC2626' }}>
                  <AlertTriangle size={11} className="inline-block mr-1" /> Sweeps &amp; withdrawals need TRX for gas — top up soon
                </p>
              )}
            </div>

            {/* Company wallet + sweep status */}
            <div className="p-5 space-y-3">
              <p className="text-[11px] font-black uppercase tracking-wide" style={{ color: C.g400 }}>Company Fee Wallet</p>
              <p className="text-xl font-black" style={{ color: '#D97706' }}>₮{fmt(s.company_wallet_usdt, 2)}</p>
              <div className="flex gap-4 pt-2 border-t" style={{ borderColor: C.g100 }}>
                <div>
                  <p className="text-[10px] font-black uppercase" style={{ color: C.g500 }}>Pending Sweeps</p>
                  <p className="text-xs font-black" style={{ color: (s.pending_sweeps || 0) > 0 ? '#D97706' : C.forest }}>{s.pending_sweeps || 0}</p>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase" style={{ color: C.g500 }}>Swept Today</p>
                  <p className="text-xs font-black" style={{ color: C.forest }}>₮{fmt(s.swept_today_usdt, 2)}</p>
                </div>
              </div>
              <button onClick={processSweeps} disabled={busy}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black transition hover:opacity-80 disabled:opacity-50"
                style={{ backgroundColor: C.g100, color: C.g700 }}>
                <Repeat size={12} className={busy ? 'animate-spin' : ''} />
                {busy ? 'Processing…' : 'Process Pending Sweeps'}
              </button>
            </div>
          </div>

          {/* Admin — send USDT externally */}
          <div className="px-5 py-4 border-t" style={{ borderColor: C.g100, backgroundColor: C.g50 }}>
            <p className="text-[11px] font-black uppercase tracking-wide mb-2 inline-flex items-center gap-1.5" style={{ color: C.g500 }}>
              <Send size={12} /> Send USDT From Hot Wallet (external)
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <input value={sendTo} onChange={e => setSendTo(e.target.value)} placeholder="Destination Tron address (T…)"
                className="flex-1 text-xs font-mono px-3 py-2 rounded-lg border" style={{ borderColor: C.g200 }} />
              <input value={sendAmt} onChange={e => setSendAmt(e.target.value)} placeholder="Amount USDT" type="number" min="0" step="0.01"
                className="sm:w-32 text-xs font-bold px-3 py-2 rounded-lg border" style={{ borderColor: C.g200 }} />
              <button onClick={sendUsdt} disabled={sending}
                className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-xs font-black transition hover:opacity-80 disabled:opacity-50 flex-shrink-0"
                style={{ backgroundColor: '#DC2626', color: '#fff' }}>
                <Send size={12} /> {sending ? 'Sending…' : 'Send'}
              </button>
            </div>
            <p className="text-[10px] mt-1.5" style={{ color: C.g400 }}>Moves real on-chain USDT immediately — for treasury rebalancing / cold storage moves, not user withdrawals.</p>
          </div>
        </>
      ) : (
        <div className="py-8 text-center">
          <p className="text-sm font-semibold" style={{ color: C.g400 }}>Click Refresh to check live balances</p>
        </div>
      )}
    </div>
  );
}

// ── USDT activity tabs — deposits / sweeps / internal / external ────────────
function UsdtActivityCard() {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab,     setTab]     = useState('deposits'); // deposits | sweeps | internal | external

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${API_URL}/admin/usdt-wallet`, { headers: authH() });
      setData(r.data);
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to load USDT activity');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading && !data) return <Spin />;
  if (!data) return <Empty text="No USDT activity data" />;

  const t = data.totals || {};
  const tabs = [
    ['deposits', <><ArrowLeftRight size={12} /> Deposits</>, t.depositCount],
    ['sweeps',   <><Repeat size={12} /> Sweeps</>,            t.sweepCount],
    ['internal', <><Repeat size={12} /> Internal</>,          t.internalCount],
    ['external', <><ArrowUpRight size={12} /> External</>,   t.withdrawalCount],
  ];

  const sweepStatusColor = (status) => status === 'COMPLETED' ? { color: '#166534', bg: '#F0FDF4' }
    : status === 'STALE' ? { color: '#6B7280', bg: '#F3F4F6' }
    : { color: '#92400E', bg: '#FFFBEB' };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-3">
        <StatCard icon={<ArrowLeftRight size={22} />} label="Total Deposited" value={`₮${fmt(t.depositsUsdt, 2)}`}
          sub={`${t.depositCount || 0} deposits`} color="#0E7490" bg="#ECFEFF" />
        <StatCard icon={<Repeat size={22} />}          label="Total Swept"    value={`₮${fmt(t.sweptUsdt, 2)}`}
          sub={`${t.sweepCount || 0} sweeps · ${t.pendingSweepCount || 0} pending`} color={C.forest} bg="#F0FDF4" />
        <StatCard icon={<Repeat size={22} />}          label="Internal Transfers" value={`₮${fmt(t.internalUsdt, 2)}`}
          sub={`${t.internalCount || 0} transfers`} color="#8B5CF6" bg="#F5F3FF" />
        <StatCard icon={<ArrowUpRight size={22} />}   label="External Sent"  value={`₮${fmt(t.withdrawnUsdt, 2)}`}
          sub={`${t.withdrawalCount || 0} sends`} color="#EF4444" bg="#FEF2F2" />
      </div>

      <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: C.g200 }}>
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: C.g100 }}>
          <h3 className="font-black text-sm" style={{ color: C.g800 }}>USDT Activity</h3>
          <div className="flex items-center gap-2">
            <div className="flex rounded-xl overflow-hidden border" style={{ borderColor: C.g200 }}>
              {tabs.map(([key, label]) => (
                <button key={key} onClick={() => setTab(key)}
                  className="px-3 py-1.5 text-xs font-black inline-flex items-center gap-1 transition"
                  style={{ backgroundColor: tab === key ? '#0E7490' : 'transparent', color: tab === key ? '#fff' : C.g500 }}>
                  {label}
                </button>
              ))}
            </div>
            <button onClick={load} className="p-2 rounded-xl border hover:bg-gray-50 transition" style={{ borderColor: C.g200 }}>
              <RefreshCw size={14} style={{ color: C.g500 }} />
            </button>
          </div>
        </div>

        {tab === 'deposits' && (
          (data.deposits || []).length === 0
            ? <Empty icon={<ArrowLeftRight size={40} strokeWidth={1.5} style={{ color: C.g400 }} />} text="No USDT deposits yet" />
            : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead style={{ backgroundColor: C.g50 }}>
                    <tr>{['User', 'Amount (USDT)', 'Notes', 'Date'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-black uppercase tracking-wide" style={{ color: C.g500 }}>{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody>
                    {data.deposits.map(d => (
                      <tr key={d.id} className="border-t hover:bg-gray-50" style={{ borderColor: C.g100 }}>
                        <td className="px-4 py-3"><span className="text-xs font-black px-2 py-0.5 rounded-full" style={{ backgroundColor: '#ECFEFF', color: '#0E7490' }}>@{d.username}</span></td>
                        <td className="px-4 py-3 text-xs font-black" style={{ color: '#0E7490' }}>₮{fmt(d.amount_usdt, 2)}</td>
                        <td className="px-4 py-3 text-xs" style={{ color: C.g400 }}>{d.notes || '—'}</td>
                        <td className="px-4 py-3 text-xs" style={{ color: C.g400 }}>{fmtDate(d.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
        )}

        {tab === 'sweeps' && (
          (data.sweeps || []).length === 0
            ? <Empty icon={<Repeat size={40} strokeWidth={1.5} style={{ color: C.g400 }} />} text="No sweeps yet" />
            : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead style={{ backgroundColor: C.g50 }}>
                    <tr>{['User', 'From Address', 'Amount (USDT)', 'Status', 'Date'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-black uppercase tracking-wide" style={{ color: C.g500 }}>{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody>
                    {data.sweeps.map(sw => {
                      const sc = sweepStatusColor(sw.status);
                      return (
                        <tr key={sw.id} className="border-t hover:bg-gray-50" style={{ borderColor: C.g100 }}>
                          <td className="px-4 py-3"><span className="text-xs font-black px-2 py-0.5 rounded-full" style={{ backgroundColor: '#F0FDF4', color: C.forest }}>@{sw.username}</span></td>
                          <td className="px-4 py-3 text-[11px] font-mono" style={{ color: C.g500 }}>{sw.from_address?.slice(0, 10)}…{sw.from_address?.slice(-4)}</td>
                          <td className="px-4 py-3 text-xs font-black" style={{ color: C.forest }}>₮{fmt(sw.amount_usdt, 2)}</td>
                          <td className="px-4 py-3"><Pill label={sw.status} color={sc.color} bg={sc.bg} /></td>
                          <td className="px-4 py-3 text-xs" style={{ color: C.g400 }}>{fmtDate(sw.created_at)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
        )}

        {tab === 'internal' && (
          (data.internal || []).length === 0
            ? <Empty icon={<Repeat size={40} strokeWidth={1.5} style={{ color: C.g400 }} />} text="No internal USDT transfers yet" />
            : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead style={{ backgroundColor: C.g50 }}>
                    <tr>{['Sender', 'Recipient', 'Amount (USDT)', 'Date'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-black uppercase tracking-wide" style={{ color: C.g500 }}>{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody>
                    {data.internal.map(t2 => (
                      <tr key={t2.id} className="border-t hover:bg-gray-50" style={{ borderColor: C.g100 }}>
                        <td className="px-4 py-3"><span className="text-xs font-black px-2 py-0.5 rounded-full" style={{ backgroundColor: '#F0FDF4', color: C.forest }}>@{t2.sender}</span></td>
                        <td className="px-4 py-3"><span className="text-xs font-black px-2 py-0.5 rounded-full" style={{ backgroundColor: '#EFF6FF', color: '#1D4ED8' }}>@{t2.recipient}</span></td>
                        <td className="px-4 py-3 text-xs font-black" style={{ color: C.forest }}>₮{fmt(t2.amount_usdt, 2)}</td>
                        <td className="px-4 py-3 text-xs" style={{ color: C.g400 }}>{fmtDate(t2.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
        )}

        {tab === 'external' && (
          (data.withdrawals || []).length === 0
            ? <Empty icon={<ArrowUpRight size={40} strokeWidth={1.5} style={{ color: C.g400 }} />} text="No external USDT sends yet" />
            : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead style={{ backgroundColor: C.g50 }}>
                    <tr>{['User', 'Amount (USDT)', 'Notes', 'Status', 'Date'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-black uppercase tracking-wide" style={{ color: C.g500 }}>{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody>
                    {data.withdrawals.map(w => (
                      <tr key={w.id} className="border-t hover:bg-gray-50" style={{ borderColor: C.g100 }}>
                        <td className="px-4 py-3"><span className="text-xs font-black px-2 py-0.5 rounded-full" style={{ backgroundColor: '#F0FDF4', color: C.forest }}>@{w.username}</span></td>
                        <td className="px-4 py-3 text-xs font-black" style={{ color: '#EF4444' }}>₮{fmt(w.amount_usdt, 2)}</td>
                        <td className="px-4 py-3 text-xs" style={{ color: C.g400 }}>{w.notes || '—'}</td>
                        <td className="px-4 py-3"><Pill label={w.status || 'CONFIRMED'} color="#166534" bg="#F0FDF4" /></td>
                        <td className="px-4 py-3 text-xs" style={{ color: C.g400 }}>{fmtDate(w.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
        )}
      </div>
    </div>
  );
}

function FinanceSection() {
  const [data,      setData]    = useState(null);
  const [transfers, setTransfers] = useState(null);
  const [btcPrice,  setBtcPrice] = useState(0);
  const [loading,   setLoading] = useState(true);
  const [txTab,     setTxTab]   = useState('internal'); // 'internal' | 'external'

  const toUsd = (btc) => btcPrice > 0
    ? `≈ $${(parseFloat(btc || 0) * btcPrice).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : '';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rev, tr, priceRes] = await Promise.all([
        axios.get(`${API_URL}/admin/revenue`,   { headers: authH() }),
        axios.get(`${API_URL}/admin/transfers`, { headers: authH() }),
        fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd')
          .then(r => r.json()).then(d => d?.bitcoin?.usd || 0).catch(() => 0),
      ]);
      setData(rev.data);
      setTransfers(tr.data);
      if (priceRes > 0) setBtcPrice(priceRes);
    } catch { toast.error('Failed to load finance data'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <Spin />;
  if (!data)   return <Empty text="No financial data" />;

  const escrowBal    = parseFloat(transfers?.escrowBalanceBtc || 0);
  const totalFeesBtc = parseFloat(data.totalRevBtc || 0);
  const totalFeesUsd = parseFloat(data.totalRevUsd || 0);
  const internalBtc  = parseFloat(transfers?.totalInternalBtc || 0);
  const externalBtc  = parseFloat(transfers?.totalExternalBtc || 0);

  return (
    <div className="space-y-5">
      <SectionHead title="Finance & Revenue" sub="Real-time platform revenue, transfer activity and escrow wallet"
        action={<button onClick={load} className="p-2 rounded-xl border hover:bg-gray-50 transition" style={{ borderColor: C.g200 }}><RefreshCw size={14} style={{ color: C.g500 }} /></button>} />

      <PlatformWalletsCard />
      <UsdtWalletCard />
      <UsdtActivityCard />

      {/* ── Revenue + Escrow snapshot ──────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-2xl border p-4 space-y-1" style={{ borderColor: C.g200 }}>
          <p className="text-[11px] font-black uppercase tracking-wide" style={{ color: C.g400 }}>Escrow Fee Wallet Balance</p>
          <p className="text-xl font-black" style={{ color: C.forest }}>₿{fmtBtc(escrowBal)}</p>
          <p className="text-xs font-semibold" style={{ color: C.g500 }}>{toUsd(escrowBal)}</p>
          <p className="text-[10px] mt-1" style={{ color: C.g400 }}>Live balance · praqen system account</p>
        </div>
        <div className="bg-white rounded-2xl border p-4 space-y-1" style={{ borderColor: C.g200 }}>
          <p className="text-[11px] font-black uppercase tracking-wide" style={{ color: C.g400 }}>Total Escrow Fees Collected</p>
          <p className="text-xl font-black" style={{ color: '#F59E0B' }}>₿{fmtBtc(totalFeesBtc)}</p>
          <p className="text-xs font-semibold" style={{ color: C.g500 }}>${fmt(totalFeesUsd, 2)} USD</p>
          <p className="text-[10px] mt-1" style={{ color: C.g400 }}>1% BTC / 2% gift card — on completed trades only ({data.profits?.length || 0} trades)</p>
        </div>
      </div>

      {/* ── Transfer volume stats ─────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard icon={<ArrowLeftRight size={22} />} label="Internal Transfers" value={`₿${fmtBtc(internalBtc)}`}
          sub={`${transfers?.internalCount || 0} transfers · ${toUsd(internalBtc)}`} color={C.green} bg="#F0FDF4" />
        <StatCard icon={<ArrowUpRight size={22} />}   label="External Withdrawals" value={`₿${fmtBtc(externalBtc)}`}
          sub={`${transfers?.withdrawalCount || 0} withdrawals · ${toUsd(externalBtc)}`} color="#EF4444" bg="#FEF2F2" />
        <StatCard icon={<TrendingUp size={22} />}     label="Affiliate Payouts"   value={`₿${fmtBtc(data.totalAffBtc)}`}
          sub={`${(data.affiliates || []).filter(a => a.status === 'COMPLETED').length} paid out`} color="#8B5CF6" bg="#F5F3FF" />
      </div>

      {/* ── Transfer Activity ─────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: C.g200 }}>
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: C.g100 }}>
          <h3 className="font-black text-sm" style={{ color: C.g800 }}>Transfer Activity</h3>
          <div className="flex rounded-xl overflow-hidden border" style={{ borderColor: C.g200 }}>
            {[['internal', <><Repeat size={12} /> Internal</>], ['external', <><ArrowUpRight size={12} /> External</>]].map(([key, label]) => (
              <button key={key} onClick={() => setTxTab(key)}
                className="px-3 py-1.5 text-xs font-black inline-flex items-center gap-1 transition"
                style={{ backgroundColor: txTab === key ? C.forest : 'transparent', color: txTab === key ? '#fff' : C.g500 }}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {txTab === 'internal' && (
          transfers?.internal?.length === 0
            ? <Empty icon={<Repeat size={40} strokeWidth={1.5} style={{ color: C.g400 }} />} text="No internal transfers yet" />
            : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead style={{ backgroundColor: C.g50 }}>
                    <tr>
                      {['Sender', 'Recipient', 'Amount (BTC)', 'Amount (USD)', 'Date'].map(h => (
                        <th key={h} className="text-left px-4 py-3 text-xs font-black uppercase tracking-wide" style={{ color: C.g500 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(transfers?.internal || []).map(t => (
                      <tr key={t.id} className="border-t hover:bg-gray-50" style={{ borderColor: C.g100 }}>
                        <td className="px-4 py-3">
                          <span className="text-xs font-black px-2 py-0.5 rounded-full" style={{ backgroundColor: '#F0FDF4', color: C.forest }}>@{t.sender}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs font-black px-2 py-0.5 rounded-full" style={{ backgroundColor: '#EFF6FF', color: '#1D4ED8' }}>@{t.recipient}</span>
                        </td>
                        <td className="px-4 py-3 text-xs font-black" style={{ color: C.forest }}>₿{fmtBtc(t.amount_btc)}</td>
                        <td className="px-4 py-3 text-xs font-semibold" style={{ color: C.g500 }}>{toUsd(t.amount_btc)}</td>
                        <td className="px-4 py-3 text-xs" style={{ color: C.g400 }}>{fmtDate(t.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
        )}

        {txTab === 'external' && (
          transfers?.withdrawals?.length === 0
            ? <Empty icon={<ArrowUpRight size={40} strokeWidth={1.5} style={{ color: C.g400 }} />} text="No external withdrawals yet" />
            : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead style={{ backgroundColor: C.g50 }}>
                    <tr>
                      {['User', 'Amount (BTC)', 'Amount (USD)', 'Status', 'Date'].map(h => (
                        <th key={h} className="text-left px-4 py-3 text-xs font-black uppercase tracking-wide" style={{ color: C.g500 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(transfers?.withdrawals || []).map(t => (
                      <tr key={t.id} className="border-t hover:bg-gray-50" style={{ borderColor: C.g100 }}>
                        <td className="px-4 py-3">
                          <span className="text-xs font-black px-2 py-0.5 rounded-full" style={{ backgroundColor: '#F0FDF4', color: C.forest }}>@{t.username}</span>
                        </td>
                        <td className="px-4 py-3 text-xs font-black" style={{ color: '#EF4444' }}>₿{fmtBtc(t.amount_btc)}</td>
                        <td className="px-4 py-3 text-xs font-semibold" style={{ color: C.g500 }}>{toUsd(t.amount_btc)}</td>
                        <td className="px-4 py-3">
                          <Pill label={t.status || 'PENDING'}
                            color={t.status === 'COMPLETED' ? '#166534' : t.status === 'REVERSED' ? '#991B1B' : '#92400E'}
                            bg={t.status === 'COMPLETED' ? '#F0FDF4' : t.status === 'REVERSED' ? '#FEF2F2' : '#FFFBEB'} />
                        </td>
                        <td className="px-4 py-3 text-xs" style={{ color: C.g400 }}>{fmtDate(t.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
        )}
      </div>

      {/* ── Escrow Fee Collections ────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: C.g200 }}>
        <div className="px-5 py-4 border-b" style={{ borderColor: C.g100 }}>
          <h3 className="font-black text-sm" style={{ color: C.g800 }}>Escrow Fee Collections</h3>
          <p className="text-xs mt-0.5" style={{ color: C.g400 }}>1% on BTC trades · 2% on gift card trades — credited to escrow wallet on completion</p>
        </div>
        {(data.profits || []).length === 0 ? <Empty icon={<Banknote size={40} strokeWidth={1.5} style={{ color: C.g400 }} />} text="No fee collections yet" /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead style={{ backgroundColor: C.g50 }}>
                <tr>
                  {['Trade ID', 'BTC Fee', 'USD Fee', 'Status', 'Date'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-black uppercase tracking-wide" style={{ color: C.g500 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(data.profits || []).slice(0, 50).map(p => (
                  <tr key={p.id} className="border-t hover:bg-gray-50" style={{ borderColor: C.g100 }}>
                    <td className="px-4 py-3 text-xs font-mono" style={{ color: C.g600 }}>{(p.trade_id || '').slice(0, 8).toUpperCase()}…</td>
                    <td className="px-4 py-3 text-xs font-black" style={{ color: '#F59E0B' }}>₿{fmtBtc(p.profit_btc)}</td>
                    <td className="px-4 py-3 text-xs font-black" style={{ color: C.g800 }}>${fmt(p.profit_usd, 2)}</td>
                    <td className="px-4 py-3"><Pill label={p.status || 'COLLECTED'} color="#166534" bg="#F0FDF4" /></td>
                    <td className="px-4 py-3 text-xs" style={{ color: C.g400 }}>{fmtDate(p.collected_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Affiliate Commissions ─────────────────────────────────────── */}
      {(data.affiliates || []).length > 0 && (
        <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: C.g200 }}>
          <div className="px-5 py-4 border-b" style={{ borderColor: C.g100 }}>
            <h3 className="font-black text-sm" style={{ color: C.g800 }}>Affiliate Commissions</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead style={{ backgroundColor: C.g50 }}>
                <tr>
                  {['BTC Commission', 'USD Commission', 'Status', 'Date'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-black uppercase tracking-wide" style={{ color: C.g500 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(data.affiliates || []).slice(0, 20).map((a, i) => (
                  <tr key={i} className="border-t hover:bg-gray-50" style={{ borderColor: C.g100 }}>
                    <td className="px-4 py-3 text-xs font-bold" style={{ color: C.g800 }}>₿{fmtBtc(a.commission_btc)}</td>
                    <td className="px-4 py-3 text-xs font-bold" style={{ color: C.g800 }}>${fmt(a.commission_usd, 2)}</td>
                    <td className="px-4 py-3"><Pill label={a.status} color={a.status === 'COMPLETED' ? '#166534' : '#92400E'} bg={a.status === 'COMPLETED' ? '#F0FDF4' : '#FFFBEB'} /></td>
                    <td className="px-4 py-3 text-xs" style={{ color: C.g400 }}>{fmtDate(a.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ================================================================
// LISTINGS SECTION
// ================================================================
// Clear, unambiguous listing-status pill — ACTIVE gets a pulsing green dot
// and the explicit words "Live in Market" so it can't be mistaken for the
// generic ACTIVE/PAUSED/CLOSED text the plain Pill component would show.
function ListingStatusPill({ status, effectivelyVisible }) {
  if (status === 'ACTIVE') {
    // DB status is ACTIVE, but GET /api/listings is silently excluding this row because the
    // seller's live balance can't currently cover it — the seller sees it as "active" but no
    // buyer can find it. Distinguish that from genuinely live so admins aren't misled.
    if (effectivelyVisible === false) {
      return <Pill label="Active but hidden (low balance)" color="#92400E" bg="#FFFBEB" />;
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-black" style={{ color: '#166534', backgroundColor: '#F0FDF4', border: '1px solid #86EFAC' }}>
        <span className="relative flex w-1.5 h-1.5 flex-shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ backgroundColor: '#22C55E' }} />
          <span className="relative inline-flex rounded-full w-1.5 h-1.5" style={{ backgroundColor: '#22C55E' }} />
        </span>
        Live in Market
      </span>
    );
  }
  if (status === 'PAUSED') {
    return <Pill label="Paused — hidden from market" color="#92400E" bg="#FFFBEB" />;
  }
  return <Pill label="Closed" color="#6B7280" bg="#F3F4F6" />;
}

function ListingsSection() {
  const [listings, setListings] = useState([]);
  const [total, setTotal]       = useState(0);
  const [loading, setLoading]   = useState(true);
  const [filter, setFilter]     = useState('');
  const [page, setPage]         = useState(1);
  const [acting, setActing]     = useState(false);
  const [counts, setCounts]     = useState(null);
  const LIMIT = 20;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${API_URL}/admin/listings/all`, { headers: authH(), params: { status: filter, page, limit: LIMIT } });
      setListings(r.data.listings || []);
      setTotal(r.data.total || 0);
    } catch { toast.error('Failed to load listings'); }
    finally { setLoading(false); }
  }, [filter, page]);

  const loadCounts = useCallback(async () => {
    try {
      const r = await axios.get(`${API_URL}/admin/stats`, { headers: authH() });
      setCounts(r.data);
    } catch { /* counts are a bonus widget — a failed fetch shouldn't block the table */ }
  }, []);

  useEffect(() => { setPage(1); }, [filter]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadCounts(); }, [loadCounts]);

  const toggle = async (id, currentStatus) => {
    setActing(true);
    try {
      const newStatus = currentStatus === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
      await axios.put(`${API_URL}/admin/listings/${id}`, { status: newStatus }, { headers: authH() });
      toast.success(`Listing ${newStatus.toLowerCase()}`);
      load(); loadCounts();
    } catch (e) { toast.error(e.response?.data?.error || 'Failed'); }
    finally { setActing(false); }
  };

  const del = async (id) => {
    if (!window.confirm('Delete this listing permanently?')) return;
    try {
      await axios.delete(`${API_URL}/admin/listings/${id}`, { headers: authH() });
      toast.success('Listing deleted');
      load(); loadCounts();
    } catch (e) { toast.error(e.response?.data?.error || 'Delete failed'); }
  };

  return (
    <div className="space-y-4">
      <SectionHead title={`Listings (${fmt(total)})`} sub="Manage marketplace listings" />

      {/* Live-in-market breakdown — answers "how many offers are actually
          visible to buyers right now" at a glance, before scrolling the table */}
      {counts && (
        <div className="grid grid-cols-3 gap-3">
          <button onClick={() => setFilter('ACTIVE')} className="text-left">
            <StatCard icon={<Activity size={22} />} label="Live in Market" value={fmt(counts.activeListings)} sub="visible to buyers now" color="#166534" bg="#F0FDF4" />
          </button>
          <button onClick={() => setFilter('PAUSED')} className="text-left">
            <StatCard icon={<Clock size={22} />} label="Paused" value={fmt(counts.pausedListings)} sub="hidden from market" color="#92400E" bg="#FFFBEB" />
          </button>
          <button onClick={() => setFilter('CLOSED')} className="text-left">
            <StatCard icon={<XCircle size={22} />} label="Closed" value={fmt(counts.closedListings)} sub="no longer tradable" color="#6B7280" bg="#F3F4F6" />
          </button>
        </div>
      )}

      <div className="flex gap-2">
        <select value={filter} onChange={e => setFilter(e.target.value)}
          className="bg-white border rounded-xl px-3 py-2 text-sm font-semibold outline-none" style={{ borderColor: C.g200, color: C.g700 }}>
          <option value="">All statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="PAUSED">Paused</option>
          <option value="CLOSED">Closed</option>
        </select>
        <button onClick={load} className="bg-white border rounded-xl px-3 py-2" style={{ borderColor: C.g200 }}>
          <RefreshCw size={14} style={{ color: C.g500 }} />
        </button>
      </div>

      <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: C.g200 }}>
        {loading ? <Spin /> : listings.length === 0 ? <Empty icon={<ClipboardList size={40} strokeWidth={1.5} style={{ color: C.g400 }} />} text="No listings found" /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead style={{ backgroundColor: C.g50 }}>
                <tr>
                  {['Seller', 'Type', 'Brand', 'Amount', 'Status', 'Date', 'Actions'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-black uppercase tracking-wide" style={{ color: C.g500 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {listings.map(l => (
                  <tr key={l.id} className="border-t hover:bg-gray-50 transition" style={{ borderColor: C.g100 }}>
                    <td className="px-4 py-3 text-xs font-semibold" style={{ color: C.g700 }}>{l.seller?.username || '—'}</td>
                    <td className="px-4 py-3 text-xs" style={{ color: C.g500 }}>{l.listing_type || '—'}</td>
                    <td className="px-4 py-3 text-xs font-bold" style={{ color: C.g800 }}>{l.gift_card_brand || l.payment_method || '—'}</td>
                    <td className="px-4 py-3 text-xs font-bold" style={{ color: C.g800 }}>${fmt(l.amount_usd, 0)}</td>
                    <td className="px-4 py-3">
                      <ListingStatusPill status={l.status} effectivelyVisible={l.effectively_visible} />
                    </td>
                    <td className="px-4 py-3 text-xs" style={{ color: C.g400 }}>{fmtDate(l.created_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1.5">
                        <button disabled={acting} onClick={() => toggle(l.id, l.status)}
                          className="px-2 py-1 rounded-lg text-xs font-bold transition"
                          style={{ backgroundColor: l.status === 'ACTIVE' ? '#FFFBEB' : '#F0FDF4', color: l.status === 'ACTIVE' ? '#92400E' : '#166534' }}>
                          {l.status === 'ACTIVE' ? 'Pause' : 'Activate'}
                        </button>
                        <button onClick={() => del(l.id)} className="p-1.5 rounded-lg hover:bg-red-50 transition" title="Delete">
                          <Trash2 size={13} style={{ color: C.danger }} />
                        </button>
                      </div>
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
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-1 disabled:opacity-30"><ChevronLeft size={16} /></button>
              <button onClick={() => setPage(p => p + 1)} disabled={page * LIMIT >= total} className="p-1 disabled:opacity-30"><ChevronRight size={16} /></button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ================================================================
// BROADCAST SECTION
// ================================================================
const PROMO_EMAIL_SUBJECT = '⚠️ Keep Your Offers Active — Verify KYC & Trade on PRAQEN!';
const PROMO_EMAIL_BODY = `<h1 style="font-size:24px;font-weight:900;color:#1B4332;margin:0 0 6px;text-align:center;">⚠️ Important: Keep Your Offers Active!</h1>
<p style="margin:0 0 28px;color:#64748B;font-size:15px;text-align:center;">Dear <strong style="color:#1B4332;">{username}</strong>, your activity matters. Inactive offers will be deactivated automatically.</p>

<div style="background:linear-gradient(135deg,#FFF7ED,#FFFBEB);border-radius:14px;padding:22px;margin-bottom:14px;border:2px solid #FDE68A;">
  <p style="margin:0 0 8px;font-size:17px;font-weight:900;color:#92400E;">🔒 Verify Your KYC Now</p>
  <p style="margin:0;font-size:14px;color:#78350F;line-height:1.7;">Complete your identity verification to unlock unlimited trading and keep your badge active. Go to <strong>Settings → Identity Verification</strong>.</p>
</div>

<div style="background:linear-gradient(135deg,#F0FDF4,#DCFCE7);border-radius:14px;padding:22px;margin-bottom:14px;border:2px solid #86EFAC;">
  <p style="margin:0 0 8px;font-size:17px;font-weight:900;color:#166534;">🚀 Keep Trading — Keep Your Badge</p>
  <p style="margin:0;font-size:14px;color:#15803D;line-height:1.7;">Active traders keep their badges and feedback growing. Inactive offers will be paused. Stay active to stay on top!</p>
</div>

<div style="background:linear-gradient(135deg,#EFF6FF,#DBEAFE);border-radius:14px;padding:22px;margin-bottom:14px;border:2px solid #BFDBFE;">
  <p style="margin:0 0 8px;font-size:17px;font-weight:900;color:#1E40AF;">🎁 New Features &amp; Promotions Coming!</p>
  <p style="margin:0;font-size:14px;color:#1E40AF;line-height:1.7;">We're bringing exciting new features and promotions to PRAQEN. Stay active to be the first to benefit!</p>
</div>

<div style="background:#F8FAFC;border-radius:14px;padding:20px 24px;margin-bottom:24px;border:1.5px solid #E2E8F0;">
  <p style="margin:0 0 14px;font-size:15px;font-weight:900;color:#1B4332;">✅ What to do right now:</p>
  <p style="margin:6px 0;font-size:14px;color:#334155;"><strong>1.</strong> Update your active offers in the marketplace</p>
  <p style="margin:6px 0;font-size:14px;color:#334155;"><strong>2.</strong> Complete KYC — Email ✓ Phone ✓ ID Verification</p>
  <p style="margin:6px 0;font-size:14px;color:#334155;"><strong>3.</strong> Start a trade and grow your reputation score</p>
</div>

<div style="text-align:center;margin:24px 0;">
  <a href="https://praqen.com/trade" style="display:inline-block;background:linear-gradient(135deg,#1B4332,#2D6A4F);color:#fff;text-decoration:none;font-size:16px;font-weight:900;padding:16px 40px;border-radius:12px;letter-spacing:0.5px;">🚀 Start Trading Now</a>
</div>

<p style="text-align:center;font-size:14px;color:#94A3B8;margin:0;">— The PRAQEN Team 💙</p>`;

function BroadcastSection() {
  const [broadcastTab, setBTab] = useState('push');

  // Push / in-app state
  const [title, setTitle]   = useState('');
  const [msg, setMsg]       = useState('');
  const [type, setType]     = useState('system');
  const [sending, setSend]  = useState(false);
  const [history, setHistory] = useState([]);

  // Email blast state
  const [emailSubject, setESubject]       = useState(PROMO_EMAIL_SUBJECT);
  const [emailBody,    setEBody]          = useState(PROMO_EMAIL_BODY);
  const [sendingEmail, setSendingEmail]   = useState(false);
  const [emailResult,  setEmailResult]    = useState(null);
  const [showPreview,  setShowPreview]    = useState(false);
  const [showEmailConfirm, setShowEmailConfirm] = useState(false);

  // Eid blast state
  const [sendingEid, setSendingEid]     = useState(false);
  const [eidResult,  setEidResult]      = useState(null);
  const [showEidConfirm, setShowEidConfirm] = useState(false);

  // USDT announcement blast state
  const [sendingUsdt, setSendingUsdt]     = useState(false);
  const [usdtResult,  setUsdtResult]      = useState(null);
  const [showUsdtConfirm, setShowUsdtConfirm] = useState(false);

  const send = async () => {
    if (!title.trim() || !msg.trim()) return toast.error('Title and message required');
    if (!window.confirm(`Send this notification to ALL active users?`)) return;
    setSend(true);
    try {
      const r = await axios.post(`${API_URL}/admin/broadcast`, { title, message: msg, type }, { headers: authH() });
      toast.success(<span className="inline-flex items-center gap-1">Sent to {r.data.sent} users <CheckCircle size={14} /></span>);
      setHistory(h => [{ title, message: msg, type, sent: r.data.sent, time: new Date() }, ...h.slice(0, 9)]);
      setTitle(''); setMsg('');
    } catch (e) { toast.error(e.response?.data?.error || 'Failed to broadcast'); }
    finally { setSend(false); }
  };

  const sendEmail = async () => {
    setSendingEmail(true);
    setEmailResult(null);
    try {
      const r = await axios.post(`${API_URL}/admin/broadcast-email`, {
        subject: emailSubject,
        htmlBody: emailBody,
        broadcastType: 'promo',
      }, { headers: authH() });
      toast.success(<span className="inline-flex items-center gap-1.5"><Mail size={13} /> Email broadcast started! Check server logs for progress.</span>);
      setEmailResult({ ok: true, message: r.data.message });
    } catch (e) {
      const err = e.response?.data?.error || 'Failed to send email broadcast';
      toast.error(err);
      setEmailResult({ ok: false, message: err });
    }
    finally { setSendingEmail(false); }
  };

  const sendEidBlast = async () => {
    setSendingEid(true);
    setEidResult(null);
    try {
      const r = await axios.post(`${API_URL}/admin/broadcast/eid-bonus`, {}, { headers: authH() });
      toast.success(<span className="inline-flex items-center gap-1.5"><Moon size={13} /> Eid broadcast started! Check server logs for progress.</span>);
      setEidResult({ ok: true, message: r.data.message });
    } catch (e) {
      const err = e.response?.data?.error || 'Failed to send Eid broadcast';
      toast.error(err);
      setEidResult({ ok: false, message: err });
    } finally { setSendingEid(false); }
  };

  const sendUsdtBlast = async () => {
    setSendingUsdt(true);
    setUsdtResult(null);
    try {
      const r = await axios.post(`${API_URL}/admin/broadcast/usdt-announcement`, {}, { headers: authH() });
      toast.success(<span className="inline-flex items-center gap-1.5"><DollarSign size={13} /> USDT announcement broadcast started! Check server logs for progress.</span>);
      setUsdtResult({ ok: true, message: r.data.message });
    } catch (e) {
      const err = e.response?.data?.error || 'Failed to send USDT announcement broadcast';
      toast.error(err);
      setUsdtResult({ ok: false, message: err });
    } finally { setSendingUsdt(false); }
  };

  return (
    <div className="space-y-5">
      <SectionHead title="Broadcast Center" sub="Send push notifications or email blasts to all users" />

      {/* Tab switcher */}
      <div className="flex gap-1 p-1 rounded-2xl w-fit" style={{ backgroundColor: C.g100 }}>
        {[
          { id: 'push',  label: <span className="inline-flex items-center gap-1.5"><Megaphone size={14} /> Push / In-App</span> },
          { id: 'email', label: <span className="inline-flex items-center gap-1.5"><Mail size={14} /> Email Blast</span> },
          { id: 'eid',   label: <span className="inline-flex items-center gap-1.5"><Moon size={14} /> Eid Blast</span> },
          { id: 'usdt',  label: <span className="inline-flex items-center gap-1.5"><DollarSign size={14} /> USDT Blast</span> },
        ].map(t => (
          <button key={t.id} onClick={() => setBTab(t.id)}
            className="px-5 py-2.5 rounded-xl text-sm font-black transition"
            style={{
              backgroundColor: broadcastTab === t.id ? C.forest : 'transparent',
              color: broadcastTab === t.id ? '#fff' : C.g600,
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {broadcastTab === 'push' ? (
        <div className="grid lg:grid-cols-2 gap-5">
          <div className="bg-white rounded-2xl border p-6" style={{ borderColor: C.g200 }}>
            <h3 className="font-black text-sm mb-4" style={{ color: C.g800 }}>Compose Notification</h3>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold block mb-1.5" style={{ color: C.g600 }}>Type</label>
                <select value={type} onChange={e => setType(e.target.value)}
                  className="w-full border rounded-xl px-3 py-2.5 text-sm font-semibold outline-none" style={{ borderColor: C.g200, color: C.g700 }}>
                  <option value="system">System Announcement</option>
                  <option value="promo">Promotion</option>
                  <option value="security">Security Alert</option>
                  <option value="update">Platform Update</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-bold block mb-1.5" style={{ color: C.g600 }}>Title</label>
                <input value={title} onChange={e => setTitle(e.target.value)} maxLength={100}
                  className="w-full border rounded-xl px-3 py-2.5 text-sm outline-none" style={{ borderColor: C.g200, color: C.g700 }}
                  placeholder="Notification title…" />
              </div>
              <div>
                <label className="text-xs font-bold block mb-1.5" style={{ color: C.g600 }}>Message</label>
                <textarea value={msg} onChange={e => setMsg(e.target.value)} rows={4} maxLength={500}
                  className="w-full border rounded-xl px-3 py-2.5 text-sm outline-none resize-none" style={{ borderColor: C.g200, color: C.g700 }}
                  placeholder="Write your message to all users…" />
                <p className="text-xs mt-1 text-right" style={{ color: C.g400 }}>{msg.length}/500</p>
              </div>
              <button onClick={send} disabled={sending || !title || !msg}
                className="w-full py-3.5 rounded-xl text-sm font-black flex items-center justify-center gap-2 transition"
                style={{ backgroundColor: sending || !title || !msg ? C.g200 : C.forest, color: sending || !title || !msg ? C.g400 : '#fff' }}>
                {sending ? <><RefreshCw size={14} className="animate-spin" /> Sending…</> : <><Megaphone size={14} /> Send to All Users</>}
              </button>
            </div>
          </div>

          <div className="bg-white rounded-2xl border p-6" style={{ borderColor: C.g200 }}>
            <h3 className="font-black text-sm mb-4" style={{ color: C.g800 }}>Recent Broadcasts</h3>
            {history.length === 0 ? (
              <Empty icon={<Megaphone size={40} strokeWidth={1.5} style={{ color: C.g400 }} />} text="No broadcasts sent this session" />
            ) : (
              <div className="space-y-3">
                {history.map((h, i) => (
                  <div key={i} className="p-3 rounded-xl" style={{ backgroundColor: C.g50, border:`1px solid ${C.g200}` }}>
                    <div className="flex items-start justify-between mb-1">
                      <p className="text-xs font-black" style={{ color: C.g800 }}>{h.title}</p>
                      <span className="text-xs" style={{ color: C.g400 }}>{h.time.toLocaleTimeString()}</span>
                    </div>
                    <p className="text-xs" style={{ color: C.g600 }}>{h.message.slice(0, 80)}…</p>
                    <p className="text-xs mt-1 font-semibold inline-flex items-center gap-1" style={{ color: C.success }}><CheckCircle size={12} /> Sent to {h.sent} users</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* ── Email Blast ── */
        <div className="grid lg:grid-cols-2 gap-5">
          <div className="bg-white rounded-2xl border p-6 space-y-4" style={{ borderColor: C.g200 }}>
            <div className="flex items-center justify-between">
              <h3 className="font-black text-sm inline-flex items-center gap-1.5" style={{ color: C.g800 }}><Mail size={14} /> Compose Email Blast</h3>
              <span className="text-xs px-2 py-1 rounded-full font-black" style={{ backgroundColor: '#FFF7ED', color: '#C2410C' }}>
                Sends to ALL users
              </span>
            </div>

            {/* Warning */}
            <div className="p-3 rounded-xl flex items-start gap-2.5" style={{ backgroundColor: '#FFF7ED', border: '1px solid #FDE68A' }}>
              <AlertTriangle size={18} className="flex-shrink-0" />
              <p className="text-xs font-semibold leading-relaxed" style={{ color: '#92400E' }}>
                This sends a real email to every user with a registered email address.
                Use <strong>{'{{username}}'}</strong> in the body — it will be replaced with each user's name.
              </p>
            </div>

            <div>
              <label className="text-xs font-bold block mb-1.5" style={{ color: C.g600 }}>Subject Line</label>
              <input value={emailSubject} onChange={e => setESubject(e.target.value)}
                className="w-full border rounded-xl px-3 py-2.5 text-sm outline-none" style={{ borderColor: C.g200, color: C.g700 }} />
            </div>

            <div>
              <label className="text-xs font-bold block mb-1.5" style={{ color: C.g600 }}>
                HTML Body <span style={{ color: C.g400, fontWeight: 400 }}>(use {'{{username}}'} for personalisation)</span>
              </label>
              <textarea value={emailBody} onChange={e => setEBody(e.target.value)} rows={10}
                className="w-full border rounded-xl px-3 py-2.5 text-xs font-mono outline-none resize-y" style={{ borderColor: C.g200, color: C.g700 }} />
            </div>

            <div className="flex gap-3">
              <button onClick={() => setShowPreview(p => !p)}
                className="flex-1 py-3 rounded-xl text-sm font-black border transition hover:bg-gray-50"
                style={{ borderColor: C.g200, color: C.g600 }}>
                {showPreview ? <span className="inline-flex items-center gap-1.5"><EyeOff size={14} /> Hide Preview</span> : <span className="inline-flex items-center gap-1.5"><Eye size={14} /> Preview Email</span>}
              </button>
              <button
                onClick={() => {
                  if (!emailSubject.trim() || !emailBody.trim()) return toast.error('Subject and body required');
                  setShowEmailConfirm(true);
                }}
                disabled={sendingEmail || !emailSubject.trim() || !emailBody.trim()}
                className="flex-1 py-3 rounded-xl text-sm font-black flex items-center justify-center gap-2 transition"
                style={{
                  backgroundColor: sendingEmail || !emailSubject.trim() ? C.g200 : '#DC2626',
                  color: sendingEmail || !emailSubject.trim() ? C.g400 : '#fff',
                }}>
                {sendingEmail
                  ? <><RefreshCw size={14} className="animate-spin" /> Sending…</>
                  : <><Mail size={14} /> Send to All Users</>}
              </button>
            </div>

            {emailResult && (
              <div className="p-3 rounded-xl text-xs font-semibold"
                style={{
                  backgroundColor: emailResult.ok ? '#F0FDF4' : '#FEF2F2',
                  color: emailResult.ok ? '#166534' : '#991B1B',
                  border: `1px solid ${emailResult.ok ? '#86EFAC' : '#FECACA'}`,
                }}>
                <span className="inline-flex items-center gap-1.5">{emailResult.ok ? <CheckCircle size={13} /> : <XCircle size={13} />} {emailResult.message}</span>
              </div>
            )}
          </div>

          {/* Preview pane */}
          <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: C.g200 }}>
            <div className="px-5 py-3 border-b flex items-center justify-between" style={{ borderColor: C.g100 }}>
              <h3 className="font-black text-sm inline-flex items-center gap-1.5" style={{ color: C.g800 }}><Mail size={14} /> Email Preview</h3>
              <span className="text-xs" style={{ color: C.g400 }}>Rendered for: <strong>Preview User</strong></span>
            </div>
            {showPreview ? (
              <iframe
                srcDoc={`<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="margin:0;padding:16px;background:#F0FAF5;font-family:Arial,sans-serif;">${emailBody.replace(/\{username\}/gi, 'yourname')}</body></html>`}
                title="Email Preview"
                style={{ width: '100%', height: 480, border: 'none' }}
                sandbox="allow-same-origin"
              />
            ) : (
              <div className="flex flex-col items-center justify-center py-20" style={{ color: C.g400 }}>
                <Mail size={40} strokeWidth={1.5} />
                <p className="text-sm font-semibold">Click "Preview Email" to see how it looks</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Eid Blast Tab ── */}
      {broadcastTab === 'eid' && (
        <div className="grid lg:grid-cols-2 gap-5">
          {/* Left: send panel */}
          <div className="bg-white rounded-2xl border p-6 space-y-4" style={{ borderColor: C.g200 }}>
            <div className="flex items-center justify-between">
              <h3 className="font-black text-sm inline-flex items-center gap-1.5" style={{ color: C.g800 }}><Moon size={14} /> Eid Mubarak Email Blast</h3>
              <span className="text-xs px-2 py-1 rounded-full font-black" style={{ backgroundColor: '#FFF7ED', color: '#C2410C' }}>
                Sends to ALL users
              </span>
            </div>

            {/* Email preview card */}
            <div className="rounded-2xl overflow-hidden" style={{ border: '2px solid #F4A422' }}>
              <div className="px-5 py-4 text-center" style={{ background: 'linear-gradient(135deg,#1B4332 0%,#2D6A4F 60%,#40916C 100%)' }}>
                <p style={{ fontSize: 28, margin: '0 0 4px' }}>🌙</p>
                <p className="font-black text-lg" style={{ color: '#F4A422', margin: 0 }}>Eid Mubarak!</p>
                <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13, margin: '4px 0 0' }}>عيد مبارك</p>
              </div>
              <div className="px-5 py-4 space-y-3" style={{ backgroundColor: '#FFFBEB' }}>
                <div>
                  <p className="text-xs font-black mb-1" style={{ color: '#92400E' }}>SUBJECT</p>
                  <p className="text-sm font-semibold" style={{ color: '#1E293B' }}>🌙 Eid Mubarak + $2 FREE Bitcoin — Just for You!</p>
                </div>
                <div className="h-px" style={{ backgroundColor: '#FDE68A' }} />
                <p className="text-xs leading-relaxed" style={{ color: '#78350F' }}>
                  Each user gets a <strong>fully personalised</strong> email with their name, a $2 Bitcoin bonus announcement, and their unique referral link pre-filled. Commission tiers and CTAs are included.
                </p>
                <div className="grid grid-cols-3 gap-2 pt-1">
                  {[
                    { icon: '🎁', label: '$2 BTC Bonus' },
                    { icon: '🔗', label: 'Personal Link' },
                    { icon: '💸', label: '0.5% Commission' },
                  ].map(({ icon, label }) => (
                    <div key={label} className="text-center p-2 rounded-xl" style={{ backgroundColor: '#FEF3C7' }}>
                      <p style={{ fontSize: 18, margin: '0 0 2px' }}>{icon}</p>
                      <p className="text-xs font-black" style={{ color: '#92400E' }}>{label}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Warning */}
            <div className="p-3 rounded-xl flex items-start gap-2.5" style={{ backgroundColor: '#FFF7ED', border: '1px solid #FDE68A' }}>
              <AlertTriangle size={18} className="flex-shrink-0" />
              <p className="text-xs font-semibold leading-relaxed" style={{ color: '#92400E' }}>
                This sends a real personalised email to every user. Each email includes their actual username and referral code from the database.
              </p>
            </div>

            <button
              onClick={() => setShowEidConfirm(true)}
              disabled={sendingEid}
              className="w-full py-4 rounded-2xl text-sm font-black flex items-center justify-center gap-2 transition"
              style={{
                background: sendingEid ? C.g200 : 'linear-gradient(135deg,#1B4332 0%,#2D6A4F 100%)',
                color: sendingEid ? C.g400 : '#fff',
                boxShadow: sendingEid ? 'none' : '0 6px 20px rgba(27,67,50,0.35)',
              }}>
              {sendingEid
                ? <><RefreshCw size={14} className="animate-spin" /> Sending…</>
                : <span className="inline-flex items-center gap-1.5"><Moon size={14} /> Send Eid Mubarak Email to All Users</span>}
            </button>

            {eidResult && (
              <div className="p-3 rounded-xl text-xs font-semibold"
                style={{
                  backgroundColor: eidResult.ok ? '#F0FDF4' : '#FEF2F2',
                  color: eidResult.ok ? '#166534' : '#991B1B',
                  border: `1px solid ${eidResult.ok ? '#86EFAC' : '#FECACA'}`,
                }}>
                <span className="inline-flex items-center gap-1.5">{eidResult.ok ? <CheckCircle size={13} /> : <XCircle size={13} />} {eidResult.message}</span>
              </div>
            )}
          </div>

          {/* Right: what's included */}
          <div className="bg-white rounded-2xl border p-6" style={{ borderColor: C.g200 }}>
            <h3 className="font-black text-sm mb-4 inline-flex items-center gap-1.5" style={{ color: C.g800 }}><List size={15} /> What's in the Email</h3>
            <div className="space-y-3">
              {[
                { icon: '🌙', title: 'Eid Mubarak header', desc: 'Dark green gradient with crescent and Arabic text "عيد مبارك"' },
                { icon: '👋', title: 'Personal greeting', desc: 'Addressed to each user by their username from the database' },
                { icon: '🎁', title: '$2 BTC bonus announcement', desc: '3-step table: Register → Verify → Trade to unlock $2 in Bitcoin' },
                { icon: '🔗', title: 'Referral link pre-filled', desc: "Their unique https://praqen.com/register?ref=CODE link in a styled box" },
                { icon: '💸', title: '5-tier commission breakdown', desc: '0.20% → 0.50% commission pills shown visually' },
                { icon: '🚀', title: 'Two action buttons', desc: '"Start Trading Now" and "Share & Earn" CTAs' },
                { icon: '🤲', title: "Eid du'a closing", desc: '"Eid Mubarak — تقبل الله منا ومنكم" with PRAQEN footer' },
              ].map(({ icon, title, desc }) => (
                <div key={title} className="flex items-start gap-3 p-3 rounded-xl" style={{ backgroundColor: C.g50, border: `1px solid ${C.g100}` }}>
                  <span className="text-xl flex-shrink-0">{icon}</span>
                  <div>
                    <p className="text-xs font-black" style={{ color: C.g800 }}>{title}</p>
                    <p className="text-xs mt-0.5" style={{ color: C.g500 }}>{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Eid Confirm Modal ── */}
      {showEidConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
          onClick={() => setShowEidConfirm(false)}
        >
          <div
            className="w-full max-w-md rounded-3xl overflow-hidden shadow-2xl"
            style={{ backgroundColor: '#fff' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="px-7 pt-8 pb-6 text-center" style={{ background: 'linear-gradient(135deg,#1B4332 0%,#2D6A4F 60%,#40916C 100%)' }}>
              <p style={{ fontSize: 48, margin: '0 0 8px' }}>🌙</p>
              <h2 className="text-xl font-black" style={{ color: '#F4A422' }}>Send Eid Mubarak Email?</h2>
              <p className="text-sm mt-1 font-semibold" style={{ color: 'rgba(255,255,255,0.75)' }}>This will send to ALL users — cannot be undone</p>
            </div>

            <div className="px-7 py-6 space-y-4">
              <div className="p-4 rounded-2xl" style={{ backgroundColor: '#FFFBEB', border: '2px solid #FDE68A' }}>
                <p className="text-xs font-black mb-1" style={{ color: '#92400E' }}>WHAT WILL BE SENT</p>
                <p className="text-sm font-semibold" style={{ color: '#1E293B' }}>
                  🌙 Eid Mubarak + $2 FREE Bitcoin — Just for You!
                </p>
                <p className="text-xs mt-2" style={{ color: '#78350F' }}>
                  Personalised with each user's name and their unique referral code.
                </p>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-2xl" style={{ backgroundColor: '#FEF2F2', border: '1px solid #FECACA' }}>
                <Megaphone size={20} className="flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-black" style={{ color: '#991B1B' }}>Sends to EVERY registered user</p>
                  <p className="text-xs mt-0.5" style={{ color: '#B91C1C' }}>
                    Sent in batches of 5 with rate-limit delays. Check server logs for progress.
                  </p>
                </div>
              </div>
            </div>

            <div className="px-7 pb-7 flex gap-3">
              <button
                onClick={() => setShowEidConfirm(false)}
                className="flex-1 py-3.5 rounded-2xl text-sm font-black border transition hover:bg-gray-50"
                style={{ borderColor: '#E2E8F0', color: '#475569' }}>
                Cancel
              </button>
              <button
                onClick={() => { setShowEidConfirm(false); sendEidBlast(); }}
                className="flex-1 py-3.5 rounded-2xl text-sm font-black text-white flex items-center justify-center gap-2 transition"
                style={{ background: 'linear-gradient(135deg,#1B4332,#2D6A4F)', boxShadow: '0 4px 14px rgba(27,67,50,0.4)' }}>
                <Moon size={15} /> Yes, Send Now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── USDT Blast Tab ── */}
      {broadcastTab === 'usdt' && (
        <div className="grid lg:grid-cols-2 gap-5">
          {/* Left: send panel */}
          <div className="bg-white rounded-2xl border p-6 space-y-4" style={{ borderColor: C.g200 }}>
            <div className="flex items-center justify-between">
              <h3 className="font-black text-sm inline-flex items-center gap-1.5" style={{ color: C.g800 }}><DollarSign size={14} /> Happy New Month — USDT Wallet Live</h3>
              <span className="text-xs px-2 py-1 rounded-full font-black" style={{ backgroundColor: '#FFF7ED', color: '#C2410C' }}>
                Sends to ALL users
              </span>
            </div>

            {/* Email preview card */}
            <div className="rounded-2xl overflow-hidden" style={{ border: '2px solid #F4A422' }}>
              <div className="px-5 py-4 text-center" style={{ background: 'linear-gradient(135deg,#1B4332 0%,#2D6A4F 60%,#40916C 100%)' }}>
                <p style={{ fontSize: 28, margin: '0 0 4px' }}>🎉</p>
                <p className="font-black text-lg" style={{ color: '#F4A422', margin: 0 }}>Happy New Month!</p>
                <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13, margin: '4px 0 0' }}>USDT Wallet is Live 💵</p>
              </div>
              <div className="px-5 py-4 space-y-3" style={{ backgroundColor: '#FFFBEB' }}>
                <div>
                  <p className="text-xs font-black mb-1" style={{ color: '#92400E' }}>SUBJECT</p>
                  <p className="text-sm font-semibold" style={{ color: '#1E293B' }}>🎉 Happy New Month! USDT Wallet is Live — Deposit, Trade &amp; Earn $2 Per Referral</p>
                </div>
                <div className="h-px" style={{ backgroundColor: '#FDE68A' }} />
                <p className="text-xs leading-relaxed" style={{ color: '#78350F' }}>
                  Each user gets a <strong>fully personalised</strong> email announcing the new USDT wallet, with Deposit &amp; Create Offer CTAs, and their unique referral link pre-filled.
                </p>
                <div className="grid grid-cols-3 gap-2 pt-1">
                  {[
                    { icon: '₮', label: 'USDT Wallet Live' },
                    { icon: '➕', label: 'Create Offer CTA' },
                    { icon: '🎁', label: '$2 Referral Bonus' },
                  ].map(({ icon, label }) => (
                    <div key={label} className="text-center p-2 rounded-xl" style={{ backgroundColor: '#FEF3C7' }}>
                      <p style={{ fontSize: 18, margin: '0 0 2px' }}>{icon}</p>
                      <p className="text-xs font-black" style={{ color: '#92400E' }}>{label}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Warning */}
            <div className="p-3 rounded-xl flex items-start gap-2.5" style={{ backgroundColor: '#FFF7ED', border: '1px solid #FDE68A' }}>
              <AlertTriangle size={18} className="flex-shrink-0" />
              <p className="text-xs font-semibold leading-relaxed" style={{ color: '#92400E' }}>
                This sends a real personalised email to every user. Each email includes their actual username and referral code from the database.
              </p>
            </div>

            <button
              onClick={() => setShowUsdtConfirm(true)}
              disabled={sendingUsdt}
              className="w-full py-4 rounded-2xl text-sm font-black flex items-center justify-center gap-2 transition"
              style={{
                background: sendingUsdt ? C.g200 : 'linear-gradient(135deg,#1B4332 0%,#2D6A4F 100%)',
                color: sendingUsdt ? C.g400 : '#fff',
                boxShadow: sendingUsdt ? 'none' : '0 6px 20px rgba(27,67,50,0.35)',
              }}>
              {sendingUsdt
                ? <><RefreshCw size={14} className="animate-spin" /> Sending…</>
                : <span className="inline-flex items-center gap-1.5"><DollarSign size={14} /> Send USDT Announcement to All Users</span>}
            </button>

            {usdtResult && (
              <div className="p-3 rounded-xl text-xs font-semibold"
                style={{
                  backgroundColor: usdtResult.ok ? '#F0FDF4' : '#FEF2F2',
                  color: usdtResult.ok ? '#166534' : '#991B1B',
                  border: `1px solid ${usdtResult.ok ? '#86EFAC' : '#FECACA'}`,
                }}>
                <span className="inline-flex items-center gap-1.5">{usdtResult.ok ? <CheckCircle size={13} /> : <XCircle size={13} />} {usdtResult.message}</span>
              </div>
            )}
          </div>

          {/* Right: what's included */}
          <div className="bg-white rounded-2xl border p-6" style={{ borderColor: C.g200 }}>
            <h3 className="font-black text-sm mb-4 inline-flex items-center gap-1.5" style={{ color: C.g800 }}><List size={15} /> What's in the Email</h3>
            <div className="space-y-3">
              {[
                { icon: '🎉', title: 'Happy New Month header', desc: 'Dark green gradient banner celebrating the new month' },
                { icon: '👋', title: 'Personal greeting', desc: 'Addressed to each user by their username from the database' },
                { icon: '₮', title: 'USDT wallet announcement', desc: 'Explains deposit & trade with a "Go to My Wallet" button' },
                { icon: '📢', title: 'Create Offer card', desc: 'Encourages posting a buy/sell offer with a direct CTA' },
                { icon: '🔗', title: 'Referral link pre-filled', desc: "Their unique https://praqen.com/signup?ref=CODE link in a styled box" },
                { icon: '🎁', title: '$2 referral bonus mention', desc: 'New traders who sign up, verify & trade unlock a $2 BTC welcome bonus' },
                { icon: '🚀', title: 'Two action buttons', desc: '"Deposit & Trade USDT" and "Share & Earn" CTAs' },
              ].map(({ icon, title, desc }) => (
                <div key={title} className="flex items-start gap-3 p-3 rounded-xl" style={{ backgroundColor: C.g50, border: `1px solid ${C.g100}` }}>
                  <span className="text-xl flex-shrink-0">{icon}</span>
                  <div>
                    <p className="text-xs font-black" style={{ color: C.g800 }}>{title}</p>
                    <p className="text-xs mt-0.5" style={{ color: C.g500 }}>{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── USDT Blast Confirm Modal ── */}
      {showUsdtConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
          onClick={() => setShowUsdtConfirm(false)}
        >
          <div
            className="w-full max-w-md rounded-3xl overflow-hidden shadow-2xl"
            style={{ backgroundColor: '#fff' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="px-7 pt-8 pb-6 text-center" style={{ background: 'linear-gradient(135deg,#1B4332 0%,#2D6A4F 60%,#40916C 100%)' }}>
              <p style={{ fontSize: 48, margin: '0 0 8px' }}>💵</p>
              <h2 className="text-xl font-black" style={{ color: '#F4A422' }}>Send USDT Announcement Email?</h2>
              <p className="text-sm mt-1 font-semibold" style={{ color: 'rgba(255,255,255,0.75)' }}>This will send to ALL users — cannot be undone</p>
            </div>

            <div className="px-7 py-6 space-y-4">
              <div className="p-4 rounded-2xl" style={{ backgroundColor: '#FFFBEB', border: '2px solid #FDE68A' }}>
                <p className="text-xs font-black mb-1" style={{ color: '#92400E' }}>WHAT WILL BE SENT</p>
                <p className="text-sm font-semibold" style={{ color: '#1E293B' }}>
                  🎉 Happy New Month! USDT Wallet is Live — Deposit, Trade &amp; Earn $2 Per Referral
                </p>
                <p className="text-xs mt-2" style={{ color: '#78350F' }}>
                  Personalised with each user's name and their unique referral code.
                </p>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-2xl" style={{ backgroundColor: '#FEF2F2', border: '1px solid #FECACA' }}>
                <Megaphone size={20} className="flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-black" style={{ color: '#991B1B' }}>Sends to EVERY registered user</p>
                  <p className="text-xs mt-0.5" style={{ color: '#B91C1C' }}>
                    Sent in batches of 5 with rate-limit delays. Check server logs for progress.
                  </p>
                </div>
              </div>
            </div>

            <div className="px-7 pb-7 flex gap-3">
              <button
                onClick={() => setShowUsdtConfirm(false)}
                className="flex-1 py-3.5 rounded-2xl text-sm font-black border transition hover:bg-gray-50"
                style={{ borderColor: '#E2E8F0', color: '#475569' }}>
                Cancel
              </button>
              <button
                onClick={() => { setShowUsdtConfirm(false); sendUsdtBlast(); }}
                className="flex-1 py-3.5 rounded-2xl text-sm font-black text-white flex items-center justify-center gap-2 transition"
                style={{ background: 'linear-gradient(135deg,#1B4332,#2D6A4F)', boxShadow: '0 4px 14px rgba(27,67,50,0.4)' }}>
                <DollarSign size={15} /> Yes, Send Now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Email Blast Confirm Modal ── */}
      {showEmailConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
          onClick={() => setShowEmailConfirm(false)}
        >
          <div
            className="w-full max-w-md rounded-3xl overflow-hidden shadow-2xl"
            style={{ backgroundColor: '#fff' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Top banner */}
            <div className="px-7 pt-8 pb-6 text-center" style={{ background: 'linear-gradient(135deg,#FFF7ED 0%,#FEF3C7 100%)' }}>
              <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
                style={{ backgroundColor: '#FBBF24', boxShadow: '0 8px 24px rgba(251,191,36,0.4)' }}>
                <Mail size={28} color="#fff" />
              </div>
              <h2 className="text-xl font-black" style={{ color: '#1B4332' }}>Send Email Blast?</h2>
              <p className="text-sm mt-1 font-semibold" style={{ color: '#92400E' }}>This action cannot be undone</p>
            </div>

            {/* Body */}
            <div className="px-7 py-6 space-y-4">
              {/* Subject preview */}
              <div className="p-3 rounded-2xl" style={{ backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                <p className="text-xs font-bold mb-1" style={{ color: '#94A3B8' }}>SUBJECT</p>
                <p className="text-sm font-semibold leading-snug" style={{ color: '#1E293B' }}>
                  {emailSubject.length > 70 ? emailSubject.slice(0, 70) + '…' : emailSubject}
                </p>
              </div>

              {/* Warning row */}
              <div className="flex items-start gap-3 p-3 rounded-2xl" style={{ backgroundColor: '#FEF2F2', border: '1px solid #FECACA' }}>
                <Megaphone size={20} className="flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-black" style={{ color: '#991B1B' }}>Sends to EVERY registered user</p>
                  <p className="text-xs mt-0.5" style={{ color: '#B91C1C' }}>
                    Each user will receive a personalised copy at their registered email address.
                  </p>
                </div>
              </div>

              {/* Checklist */}
              {[
                'Email is personalised with {username}',
                'Subject line looks correct',
                'HTML body has been previewed',
              ].map(item => (
                <div key={item} className="flex items-center gap-2.5">
                  <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: '#F0FDF4', border: '1.5px solid #86EFAC' }}>
                    <CheckCircle size={12} color="#16A34A" />
                  </div>
                  <p className="text-xs font-semibold" style={{ color: '#475569' }}>{item}</p>
                </div>
              ))}
            </div>

            {/* Buttons */}
            <div className="px-7 pb-7 flex gap-3">
              <button
                onClick={() => setShowEmailConfirm(false)}
                className="flex-1 py-3.5 rounded-2xl text-sm font-black border transition hover:bg-gray-50"
                style={{ borderColor: '#E2E8F0', color: '#475569' }}>
                Cancel
              </button>
              <button
                onClick={() => { setShowEmailConfirm(false); sendEmail(); }}
                className="flex-1 py-3.5 rounded-2xl text-sm font-black text-white flex items-center justify-center gap-2 transition"
                style={{ backgroundColor: '#DC2626', boxShadow: '0 4px 14px rgba(220,38,38,0.4)' }}>
                <Mail size={15} /> Yes, Send Now
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ================================================================
// SUGGESTIONS SECTION
// ================================================================
function SuggestionsSection() {
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

      {/* Stats */}
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

      {/* Filters */}
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

      {/* Table */}
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

      {/* ── Full-screen detail modal ── */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.6)' }} onClick={closeModal}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl flex flex-col overflow-hidden"
            style={{ maxHeight: '92vh' }} onClick={e => e.stopPropagation()}>

            {/* Modal header */}
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

            {/* Scrollable body */}
            <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">

              {/* Meta row */}
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

              {/* Title */}
              <div>
                <p className="text-xs font-black uppercase tracking-widest mb-2" style={{ color: C.g400 }}>Title</p>
                <p className="text-lg font-black leading-snug" style={{ color: C.g800 }}>
                  {selected.title}
                </p>
              </div>

              {/* Full message body */}
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

              {/* Existing admin reply (read-only preview) */}
              {selected.admin_reply && (
                <div>
                  <p className="text-xs font-black uppercase tracking-widest mb-2" style={{ color: C.g400 }}>Previous Reply</p>
                  <div className="p-4 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap"
                    style={{ backgroundColor: '#F0FDF4', border: '1px solid #86EFAC', color: '#166534' }}>
                    {selected.admin_reply}
                  </div>
                </div>
              )}

              {/* Status update */}
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

              {/* Reply textarea — always visible */}
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

            {/* Modal footer */}
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
// NEW USERS SECTION
// ================================================================
function NewUsersSection() {
  const [users, setUsers]     = useState([]);
  const [total, setTotal]     = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${API_URL}/admin/users/new`, { headers: authH() });
      setUsers(r.data.users || []);
      setTotal(r.data.total || 0);
    } catch { toast.error('Failed to load new users'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      <SectionHead title={`New Users (${total})`} sub="Users who joined in the last 7 days"
        action={<button onClick={load} className="p-2 rounded-xl border hover:bg-gray-50 transition" style={{ borderColor: C.g200 }}><RefreshCw size={14} style={{ color: C.g500 }} /></button>} />

      {/* Summary pills */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Total New', value: total, color: C.forest, bg: '#F0FDF4' },
          { label: 'No Trades', value: users.filter(u => !u.total_trades).length, color: C.amber, bg: '#FFFBEB' },
          { label: 'Unverified', value: users.filter(u => !u.is_email_verified).length, color: C.danger, bg: '#FEF2F2' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-2xl border p-4 text-center" style={{ borderColor: C.g200 }}>
            <p className="text-2xl font-black" style={{ color: s.color }}>{s.value}</p>
            <p className="text-xs font-bold mt-1" style={{ color: C.g700 }}>{s.label}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: C.g200 }}>
        {loading ? <Spin /> : users.length === 0 ? <Empty icon={<Sparkles size={40} strokeWidth={1.5} style={{ color: C.g400 }} />} text="No new users in the last 7 days" /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead style={{ backgroundColor: C.g50 }}>
                <tr>
                  {['User', 'Country', 'Trades', 'Verified', 'Joined', 'Status'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-black uppercase tracking-wide" style={{ color: C.g500 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id} className="border-t hover:bg-gray-50 transition" style={{ borderColor: C.g100 }}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-black text-white flex-shrink-0"
                          style={{ backgroundColor: !u.total_trades ? C.amber : C.forest }}>
                          {(u.username || '?')[0].toUpperCase()}
                        </div>
                        <div>
                          <p className="font-bold text-xs" style={{ color: C.g800 }}>{u.username}</p>
                          <p className="text-xs truncate max-w-[120px]" style={{ color: C.g400 }}>{u.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3"><CountryCell user={u} /></td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-black" style={{ color: u.total_trades ? C.success : C.g400 }}>
                        {u.total_trades || 0}
                      </span>
                      {!u.total_trades && <span className="ml-1 text-xs" style={{ color: C.g400 }}>none</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <span title="Email" className="inline-flex items-center" style={{ opacity: u.is_email_verified ? 1 : 0.25 }}><Mail size={13} /></span>
                        <span title="Phone" className="inline-flex items-center" style={{ opacity: u.is_phone_verified ? 1 : 0.25 }}><Phone size={13} /></span>
                        <span title="KYC"   className="inline-flex items-center" style={{ opacity: u.is_id_verified    ? 1 : 0.25 }}><CreditCard size={13} /></span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs" style={{ color: C.g400 }}>{fmtAge(u.created_at)}</td>
                    <td className="px-4 py-3">
                      <Pill label={u.account_status || 'active'}
                        color={u.account_status === 'banned' ? '#991B1B' : '#166534'}
                        bg={u.account_status === 'banned' ? '#FEF2F2' : '#F0FDF4'} />
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
// REPORTS & ISSUES SECTION
// ================================================================
function ReportsSection() {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab]         = useState('disputes');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${API_URL}/admin/reports`, { headers: authH() });
      setData(r.data);
    } catch { toast.error('Failed to load reports'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      <SectionHead title="Reports & Issues" sub="Trade disputes and user feedback"
        action={<button onClick={load} className="p-2 rounded-xl border hover:bg-gray-50 transition" style={{ borderColor: C.g200 }}><RefreshCw size={14} style={{ color: C.g500 }} /></button>} />

      {/* Tabs */}
      <div className="flex gap-2">
        {[
          { id:'disputes', label:`Disputes (${data?.disputes?.length || 0})` },
          { id:'feedback', label:`Feedback (${data?.feedback?.length || 0})` },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className="px-4 py-2 rounded-xl text-xs font-bold transition"
            style={{ backgroundColor: tab === t.id ? C.forest : C.g100, color: tab === t.id ? '#fff' : C.g600 }}>
            {t.label}
          </button>
        ))}
      </div>

      {loading ? <Spin /> : !data ? <Empty text="No report data" /> : tab === 'disputes' ? (
        <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: C.g200 }}>
          {data.disputes.length === 0 ? <Empty icon={<Scale size={40} strokeWidth={1.5} style={{ color: C.g400 }} />} text="No active disputes" /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead style={{ backgroundColor: C.g50 }}>
                  <tr>
                    {['Trade', 'Buyer', 'Seller', 'Amount', 'Reason', 'Opened'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-black uppercase tracking-wide" style={{ color: C.g500 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.disputes.map(d => (
                    <tr key={d.id} className="border-t hover:bg-gray-50" style={{ borderColor: C.g100 }}>
                      <td className="px-4 py-3 text-xs font-mono" style={{ color: C.g600 }}>{(d.trade_ref || d.id || '').slice(0,8).toUpperCase()}</td>
                      <td className="px-4 py-3 text-xs font-semibold" style={{ color: C.g700 }}>{d.buyer?.username || '—'}</td>
                      <td className="px-4 py-3 text-xs font-semibold" style={{ color: C.g700 }}>{d.seller?.username || '—'}</td>
                      <td className="px-4 py-3 text-xs font-bold" style={{ color: C.g800 }}>${fmt(d.amount_usd, 2)}</td>
                      <td className="px-4 py-3 text-xs max-w-[200px]" style={{ color: C.g600 }}>
                        {(d.dispute_reason || '—').slice(0, 60)}{(d.dispute_reason || '').length > 60 ? '…' : ''}
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: C.g400 }}>{fmtAge(d.disputed_at || d.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: C.g200 }}>
          {data.feedback.length === 0 ? <Empty icon={<MessageSquare size={40} strokeWidth={1.5} style={{ color: C.g400 }} />} text="No feedback yet" /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead style={{ backgroundColor: C.g50 }}>
                  <tr>
                    {['Reviewer', 'Reviewed', 'Rating', 'Comment', 'Date'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-black uppercase tracking-wide" style={{ color: C.g500 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.feedback.map(f => (
                    <tr key={f.id} className="border-t hover:bg-gray-50" style={{ borderColor: C.g100 }}>
                      <td className="px-4 py-3 text-xs font-semibold" style={{ color: C.g700 }}>{f.reviewer?.username || '—'}</td>
                      <td className="px-4 py-3 text-xs font-semibold" style={{ color: C.g700 }}>{f.reviewed?.username || '—'}</td>
                      <td className="px-4 py-3">
                        <span className="text-xs font-black" style={{ color: f.rating >= 4 ? C.success : f.rating >= 3 ? C.amber : C.danger }}>
                          {Array.from({ length: Math.min(f.rating || 0, 5) }).map((_, i) => <Star key={i} size={12} fill="currentColor" className="inline-block" />)} {f.rating}/5
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs max-w-[220px]" style={{ color: C.g600 }}>
                        {(f.comment || '—').slice(0, 80)}{(f.comment || '').length > 80 ? '…' : ''}
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: C.g400 }}>{fmtAge(f.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ================================================================
// ACTIVITY LOG SECTION
// ================================================================
function ActivitySection() {
  const [activity, setActivity] = useState([]);
  const [loading, setLoading]   = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${API_URL}/admin/activity`, { headers: authH() });
      setActivity(r.data.activity || []);
    } catch { toast.error('Failed to load activity'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onlineThreshold = 5 * 60 * 1000; // 5 minutes
  const isOnline = (ts) => ts && (Date.now() - new Date(ts)) < onlineThreshold;

  return (
    <div className="space-y-4">
      <SectionHead title="Activity Log" sub="Recent user logins and session activity (last 100 active users)"
        action={<button onClick={load} className="p-2 rounded-xl border hover:bg-gray-50 transition" style={{ borderColor: C.g200 }}><RefreshCw size={14} style={{ color: C.g500 }} /></button>} />

      {/* Online now count */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Online Now',   value: activity.filter(u => isOnline(u.last_seen_at)).length, color: C.success, bg: '#F0FDF4' },
          { label: 'Active Today', value: activity.filter(u => u.last_seen_at && (Date.now() - new Date(u.last_seen_at)) < 86400000).length, color: C.forest, bg: '#F0FDF4' },
          { label: 'Active Week',  value: activity.filter(u => u.last_seen_at && (Date.now() - new Date(u.last_seen_at)) < 7*86400000).length, color: '#3B82F6', bg: '#EFF6FF' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-2xl border p-4 text-center" style={{ borderColor: C.g200 }}>
            <p className="text-2xl font-black" style={{ color: s.color }}>{s.value}</p>
            <p className="text-xs font-bold mt-1" style={{ color: C.g700 }}>{s.label}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: C.g200 }}>
        {loading ? <Spin /> : activity.length === 0 ? <Empty icon={<BarChart2 size={40} strokeWidth={1.5} style={{ color: C.g400 }} />} text="No activity data yet" /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead style={{ backgroundColor: C.g50 }}>
                <tr>
                  {['User', 'Status', 'Last Seen', 'Last Login', 'Trades', 'Country'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-black uppercase tracking-wide" style={{ color: C.g500 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {activity.map(u => {
                  const online = isOnline(u.last_seen_at);
                  return (
                    <tr key={u.id} className="border-t hover:bg-gray-50 transition" style={{ borderColor: C.g100 }}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="relative">
                            <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-black text-white"
                              style={{ backgroundColor: online ? C.success : C.forest }}>
                              {(u.username || '?')[0].toUpperCase()}
                            </div>
                            {online && (
                              <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white" style={{ backgroundColor: C.success }} />
                            )}
                          </div>
                          <div>
                            <p className="font-bold text-xs" style={{ color: C.g800 }}>{u.username}</p>
                            <p className="text-xs truncate max-w-[120px]" style={{ color: C.g400 }}>{u.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Pill label={online ? 'Online' : u.account_status || 'active'}
                          color={online ? '#166534' : u.account_status === 'banned' ? '#991B1B' : '#475569'}
                          bg={online ? '#F0FDF4' : u.account_status === 'banned' ? '#FEF2F2' : C.g100} />
                      </td>
                      <td className="px-4 py-3 text-xs font-semibold" style={{ color: online ? C.success : C.g500 }}>
                        {online ? <span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full inline-block" style={{ backgroundColor: '#10B981' }} /> Now</span> : fmtAge(u.last_seen_at)}
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: C.g400 }}>{fmtAge(u.last_login)}</td>
                      <td className="px-4 py-3 text-xs font-bold" style={{ color: C.g700 }}>{u.total_trades || 0}</td>
                      <td className="px-4 py-3"><CountryCell user={u} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ================================================================
// SUPPORT TICKETS SECTION
// ================================================================
function SupportTicketsSection() {
  const [tickets, setTickets]   = useState([]);
  const [total, setTotal]       = useState(0);
  const [loading, setLoading]   = useState(true);
  const [selected, setSelected] = useState(null);
  const [messages, setMessages] = useState([]);
  const [reply, setReply]       = useState('');
  const [sending, setSending]   = useState(false);
  const [statusFilter, setStat] = useState('');
  const chatEndRef              = useRef(null);

  const TICKET_STATUSES = {
    open:     { label: 'Open',     color: '#3B82F6', bg: '#EFF6FF', dot: <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: '#3B82F6' }} /> },
    active:   { label: 'Active',   color: '#166534', bg: '#F0FDF4', dot: <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: '#22C55E' }} /> },
    resolved: { label: 'Resolved', color: '#6D28D9', bg: '#F5F3FF', dot: <CheckCircle size={12} /> },
    closed:   { label: 'Closed',   color: '#6B7280', bg: '#F9FAFB', dot: <Lock size={12} /> },
  };

  function fmtAge(ts) {
    if (!ts) return '';
    const s = (Date.now() - new Date(ts)) / 1000;
    if (s < 60)    return 'just now';
    if (s < 3600)  return `${~~(s / 60)}m ago`;
    if (s < 86400) return `${~~(s / 3600)}h ago`;
    return `${~~(s / 86400)}d ago`;
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${API_URL}/admin/support/tickets`, {
        headers: authH(),
        params: { status: statusFilter, limit: 100 },
      });
      setTickets(r.data.tickets || []);
      setTotal(r.data.total || 0);
    } catch { toast.error('Failed to load tickets'); }
    finally { setLoading(false); }
  }, [statusFilter]);

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
      toast.success(<span className="inline-flex items-center gap-1">Reply sent <CheckCircle size={14} /></span>);
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
      <SectionHead title={`Support Tickets (${total})`} sub="View and reply to user support tickets in real time"
        action={<button onClick={load} className="p-2 rounded-xl border hover:bg-gray-50 transition" style={{ borderColor: C.g200 }}><RefreshCw size={14} style={{ color: C.g500 }} /></button>} />

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

      {/* Filter + Table */}
      <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: C.g200 }}>
        <div className="flex items-center gap-2 px-4 py-3 border-b flex-wrap" style={{ borderColor: C.g100 }}>
          <p className="text-xs font-black flex-1" style={{ color: C.g700 }}>Filter by Status</p>
          {['', 'open', 'active', 'resolved', 'closed'].map(s => (
            <button key={s} onClick={() => setStat(s)}
              className="px-3 py-1.5 rounded-lg text-xs font-black transition"
              style={{ backgroundColor: statusFilter === s ? C.forest : C.g100, color: statusFilter === s ? '#fff' : C.g600 }}>
              {s === '' ? 'All' : <span className="inline-flex items-center gap-1">{TICKET_STATUSES[s]?.dot}{TICKET_STATUSES[s]?.label}</span>}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <RefreshCw size={20} className="animate-spin" style={{ color: C.g400 }} />
          </div>
        ) : tickets.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-sm font-semibold" style={{ color: C.g400 }}>No tickets found</p>
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
                        <span className="text-xs px-2 py-1 rounded-full font-black inline-flex items-center gap-1" style={{ backgroundColor: st.bg, color: st.color }}>
                          {st.dot}{st.label}
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
              {/* User account details bar */}
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
                    {selected.user_email && (
                      <span className="text-[11px] inline-flex items-center gap-1" style={{ color: C.g500 }}><Mail size={11} /> {selected.user_email}</span>
                    )}
                    {selected.user_phone && (
                      <span className="text-[11px] inline-flex items-center gap-1" style={{ color: C.g500 }}><Phone size={11} /> {selected.user_phone}</span>
                    )}
                    {selected.user_country && (
                      <span className="text-[11px] inline-flex items-center gap-1" style={{ color: C.g500 }}><Globe size={11} /> {selected.user_country}</span>
                    )}
                    {selected.user_joined && (
                      <span className="text-[11px]" style={{ color: C.g400 }}>
                        Joined {new Date(selected.user_joined).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              {/* Ticket title + controls */}
              <div className="flex items-start justify-between px-5 py-3">
                <div className="flex-1 min-w-0 pr-4">
                  <p className="font-black text-sm leading-snug" style={{ color: C.g800 }}>{selected.subject}</p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="text-xs font-black px-2 py-0.5 rounded-full inline-flex items-center gap-1"
                      style={{ backgroundColor: (TICKET_STATUSES[selected.status] || TICKET_STATUSES.open).bg, color: (TICKET_STATUSES[selected.status] || TICKET_STATUSES.open).color }}>
                      {(TICKET_STATUSES[selected.status] || TICKET_STATUSES.open).dot}{(TICKET_STATUSES[selected.status] || TICKET_STATUSES.open).label}
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
// MAIN ADMIN DASHBOARD
// ================================================================
const NAV = [
  { id:'overview',     label:'Overview',      icon:LayoutDashboard },
  { id:'users',        label:'Users',         icon:Users           },
  { id:'newusers',     label:'New Users',     icon:UserPlus        },
  { id:'trades',       label:'Trades',        icon:ArrowLeftRight  },
  { id:'disputes',     label:'Disputes',      icon:AlertTriangle   },
  { id:'deposits',     label:'Deposits',      icon:Lock            },
  { id:'team',         label:'Team',          icon:Shield          },
  { id:'phone-verif',  label:'Phone Verif.',  icon:Phone           },
  { id:'kyc',          label:'KYC Review',    icon:ShieldCheck     },
  { id:'p2p-migration',label:'P2P Migration', icon:Repeat          },
  { id:'finance',      label:'Finance',       icon:DollarSign      },
  { id:'listings',     label:'Listings',      icon:List            },
  { id:'suggestions',  label:'User Messages',  icon:MessageSquare   },
  { id:'support',      label:'Support Chat',   icon:MessageCircle   },
  { id:'reports',      label:'Reports',       icon:Star            },
  { id:'activity',     label:'Activity Log',  icon:Activity        },
  { id:'broadcast',    label:'Broadcast',     icon:Megaphone       },
];

export default function AdminDashboard({ user: appUser, onLogin }) {
  const [adminUser, setAdminUser] = useState(null);
  const [section, setSection]     = useState('overview');
  const [sideOpen, setSideOpen]   = useState(true);

  // Check existing admin token on mount
  useEffect(() => {
    // Main app user takes priority — their token is always fresh
    if (appUser && (appUser.email === ADMIN_EMAIL || appUser.is_admin)) {
      const mainToken = localStorage.getItem('token');
      if (mainToken) axios.defaults.headers.common['Authorization'] = `Bearer ${mainToken}`;
      setAdminUser(appUser);
      return;
    }
    // Fall back to stored admin-specific token
    const token = localStorage.getItem('token') || localStorage.getItem('adminToken');
    const stored = localStorage.getItem('adminUser');
    if (token && stored) {
      try {
        const u = JSON.parse(stored);
        if (u?.email === ADMIN_EMAIL || u?.is_admin) {
          axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
          setAdminUser(u);
        }
      } catch {}
    }
  }, [appUser]);

  const handleAuth = (user, token) => {
    localStorage.setItem('adminUser', JSON.stringify(user));
    setAdminUser(user);
    if (onLogin) onLogin(user, token);
  };

  const logout = () => {
    localStorage.removeItem('adminToken');
    localStorage.removeItem('adminUser');
    setAdminUser(null);
  };

  if (!adminUser) return <AdminLogin onAuth={handleAuth} />;

  const CONTENT = {
    overview:    <Overview />,
    users:       <UsersSection />,
    newusers:    <NewUsersSection />,
    trades:      <TradesSection />,
    disputes:    <DisputesSection />,
    deposits:    <SellerDepositsSection />,
    team:        <TeamActivitySection />,
    'phone-verif': <PhoneVerifSection />,
    kyc:         <KycSection />,
    'p2p-migration': <P2PMigrationSection />,
    finance:     <FinanceSection />,
    listings:    <ListingsSection />,
    suggestions: <SuggestionsSection />,
    support:     <SupportTicketsSection />,
    reports:     <ReportsSection />,
    activity:    <ActivitySection />,
    broadcast:   <BroadcastSection />,
  };

  return (
    <div className="flex min-h-screen" style={{ backgroundColor: C.g50 }}>

      {/* ── SIDEBAR ── */}
      <aside className={`${sideOpen ? 'w-56' : 'w-16'} flex-shrink-0 flex flex-col transition-all duration-200`}
        style={{ backgroundColor: C.forest, minHeight: '100vh' }}>
        {/* Logo */}
        <div className="flex items-center gap-3 px-4 py-5 border-b" style={{ borderColor:'rgba(255,255,255,0.1)' }}>
          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: C.gold }}>
            <span className="text-sm font-black" style={{ color: C.forest, fontFamily:'Georgia,serif' }}>P</span>
          </div>
          {sideOpen && <span className="text-white font-black text-sm tracking-wide" style={{ fontFamily:'Georgia,serif' }}>PRAQEN Admin</span>}
        </div>

        {/* Nav items */}
        <nav className="flex-1 py-3 overflow-y-auto">
          {NAV.map(n => {
            const Icon = n.icon;
            const active = section === n.id;
            return (
              <button key={n.id} onClick={() => setSection(n.id)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left transition"
                style={{
                  backgroundColor: active ? 'rgba(255,255,255,0.15)' : 'transparent',
                  color: active ? '#fff' : 'rgba(255,255,255,0.55)',
                  borderLeft: active ? `3px solid ${C.gold}` : '3px solid transparent',
                }}>
                <Icon size={16} className="flex-shrink-0" />
                {sideOpen && <span className="text-xs font-bold">{n.label}</span>}
              </button>
            );
          })}
        </nav>

        {/* Team Portal shortcut */}
        <div style={{ padding: '8px 10px 10px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <button
            onClick={() => window.location.href = '/team'}
            title="Open Team Portal"
            style={{
              width: '100%', display: 'flex', alignItems: 'center',
              gap: sideOpen ? 10 : 0, justifyContent: sideOpen ? 'flex-start' : 'center',
              padding: sideOpen ? '9px 14px' : '9px 0',
              border: '1px solid rgba(244,164,34,0.35)',
              borderRadius: 10, cursor: 'pointer',
              background: 'rgba(244,164,34,0.08)',
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(244,164,34,0.18)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(244,164,34,0.08)'}>
            <ExternalLink size={14} style={{ color: '#F4A422', flexShrink: 0 }} />
            {sideOpen && (
              <span style={{ fontSize: 12, fontWeight: 700, color: '#F4A422', flex: 1, textAlign: 'left' }}>Team Portal</span>
            )}
          </button>
        </div>

        {/* Footer */}
        <div className="border-t p-3" style={{ borderColor:'rgba(255,255,255,0.1)' }}>
          {sideOpen && (
            <div className="flex items-center gap-2 mb-3 px-1">
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-black" style={{ backgroundColor: C.gold, color: C.forest }}>
                {(adminUser.username || 'A')[0].toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-black text-white truncate">{adminUser.username || 'Admin'}</p>
                <p className="text-xs" style={{ color:'rgba(255,255,255,0.4)' }}>Administrator</p>
              </div>
            </div>
          )}
          <div className="flex gap-2">
            <button onClick={() => setSideOpen(s => !s)} className="p-2 rounded-lg hover:bg-white/10 transition" title="Toggle sidebar">
              <Menu size={14} style={{ color:'rgba(255,255,255,0.6)' }} />
            </button>
            <button onClick={logout} className="p-2 rounded-lg hover:bg-white/10 transition" title="Sign out">
              <LogOut size={14} style={{ color:'rgba(255,255,255,0.6)' }} />
            </button>
          </div>
        </div>
      </aside>

      {/* ── MAIN CONTENT ── */}
      <main className="flex-1 min-w-0 overflow-auto">
        {/* Top bar */}
        <div className="flex items-center justify-between px-6 py-4 bg-white border-b sticky top-0 z-10" style={{ borderColor: C.g200 }}>
          <div>
            <h1 className="font-black text-base" style={{ color: C.g800 }}>
              {NAV.find(n => n.id === section)?.label || 'Admin'}
            </h1>
            <p className="text-xs" style={{ color: C.g400 }}>PRAQEN Platform Administration</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: C.success }} />
            <span className="text-xs font-semibold" style={{ color: C.g500 }}>{adminUser.email}</span>
          </div>
        </div>

        {/* Section content */}
        <div className="p-6">
          {CONTENT[section]}
        </div>
      </main>
    </div>
  );
}
