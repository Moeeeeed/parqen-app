import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLocalUser } from '../hooks/useLocalUser';
import useLastVisited, { VISITABLE_ROUTES, matchVisitableRoute } from '../hooks/useLastVisited';
import useMediaQuery from '../hooks/useMediaQuery';
import { iconColorFor } from '../theme/iconColors';
import PopupModal from '../components/PopupModal';
import DashboardDesktop from './dashboard/DashboardDesktop';
import axios from 'axios';
import {
  Wallet, Eye, EyeOff, Bitcoin, ArrowRight, Send, ArrowLeftRight,
  TrendingUp, Zap, Megaphone, ChevronRight, Gift, Settings,
  ShieldCheck, CreditCard, Bell, Disc, HelpCircle, Sparkles, Share2,
  ThumbsUp, Medal, Info, MoveRight, Award,
  ChevronDown, ChevronUp, Copy, Globe, Shield, Clock,
} from 'lucide-react';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

// ─── Color palette ─────────────────────────────────────────────────────────────
const C = {
  forest:'#1B4332', green:'#2D6A4F', mint:'#40916C', sage:'#52B788',
  gold:'#F4A422', amber:'#F59E0B', mist:'#F0FAF5', white:'#FFFFFF',
  g50:'#F8FAFC', g100:'#F1F5F9', g200:'#E2E8F0', g300:'#CBD5E1',
  g400:'#94A3B8', g500:'#64748B', g600:'#475569', g700:'#334155', g800:'#1E293B',
  success:'#10B981', danger:'#EF4444', warn:'#F59E0B', paid:'#3B82F6',
  online:'#22C55E', purple:'#8B5CF6', blue:'#3B82F6',
};

// ─── Helpers ───────────────────────────────────────────────────────────────────
const fmt     = (n, d=2) => new Intl.NumberFormat('en-US',{minimumFractionDigits:0,maximumFractionDigits:d}).format(n||0);
const fmtBtc  = (n)     => parseFloat(n||0).toFixed(8);
const fmtTs   = (iso)   => { const d=new Date(iso); const p=n=>String(n).padStart(2,'0'); return `${p(d.getDate())}/${p(d.getMonth()+1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`; };

// ─── Swap icon (Swap not in lucide-react@0.263) ───────────────────────────────
const SwapIcon = ArrowLeftRight;

// ─── Section header ────────────────────────────────────────────────────────────
function SectionHeader({ icon:Icon, title, action, onAction }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2">
        <Icon size={16} style={{color:C.green}}/>
        <h2 className="font-black text-sm" style={{color:C.forest}}>{title}</h2>
      </div>
      {action && (
        <button onClick={onAction} className="text-xs font-bold hover:underline flex items-center gap-1" style={{color:C.green}}>
          {action} <ChevronRight size={11}/>
        </button>
      )}
    </div>
  );
}

// ─── Icon+label tile (for grids) ───────────────────────────────────────────────
function Tile({ icon:Icon, label, route, onClick }) {
  // Shared limited palette — same mapping as desktop (src/theme/iconColors.js).
  const iconColor = iconColorFor(label);
  return (
    <button
      onClick={onClick || (() => {})}
      className="flex flex-col items-center gap-1.5 p-2 rounded-xl border hover:shadow-sm transition"
      style={{ borderColor: C.g100, background: C.white }}
    >
      <div className="w-10 h-10 rounded-xl flex items-center justify-center"
        style={{ backgroundColor: `${iconColor}15` }}>
        <Icon size={18} style={{ color: iconColor }}/>
      </div>
      <span className="text-xs font-semibold text-center" style={{ color: C.g600 }}>{label}</span>
    </button>
  );
}

// ─── Item for popup lists (full-width, icon + label) ───────────────────────────
function PopupItem({ icon:Icon, label, route, onClick }) {
  // Shared limited palette — same mapping as desktop (src/theme/iconColors.js).
  const iconColor = iconColorFor(label);
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 w-full px-4 py-3.5 text-left hover:bg-gray-50 transition"
    >
      <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: `${iconColor}15` }}>
        <Icon size={16} style={{ color: iconColor }}/>
      </div>
      <span className="text-sm font-bold" style={{ color: C.forest }}>{label}</span>
    </button>
  );
}

// ─── Wallet menu items ──────────────────────────────────────────────────────────
const WALLET_MENU_ITEMS = [
  { label:'Receive',    icon:ArrowRight,  route:'/receive' },
  { label:'Send',       icon:Send,        route:'/send' },
  { label:'Transfer',   icon:MoveRight,   route:'/transfer' },
  { label:'Swap',       icon:SwapIcon,    route:'/swap' },
];

// ─── Product & services items ──────────────────────────────────────────────────
// Icon colors are NOT stored per item — the shared palette in
// src/theme/iconColors.js derives them from the label (neutral by default,
// brand orange/green only for money/trading actions).
const PRODUCTS_AND_SERVICES = [
  { label:'P2P Trading',       icon:ArrowLeftRight, route:'/buy-bitcoin' },
  { label:'Contact support',   icon:HelpCircle,     route:'/contact' },
  { label:'Gift card checker', icon:Gift,           route:'/gift-cards' },
  { label:'Wallet',            icon:Wallet,         route:'/wallet' },
  { label:'Import feedback',   icon:ThumbsUp,       route:'/feedback/:tradeId/:userId' },
  { label:'Fees',              icon:Info,           route:'/fees' },
  { label:'Medals',            icon:Medal,          route:'/medals' },
  { label:'Quick start',       icon:Sparkles,       route:'/quick-start' },
  { label:'Invite & earn',     icon:Share2,         route:'/invite' },
];

// ─── Account & settings items ──────────────────────────────────────────────────
const ACCOUNT_AND_SETTINGS = [
  { label:'My offers',        icon:Gift,        route:'/my-listings' },
  { label:'Account settings', icon:Settings,    route:'/settings' },
  { label:'Trade insights',   icon:TrendingUp,  route:'/trade-insights' },
  { label:'Payment accounts', icon:CreditCard,  route:'/payment-accounts' },
  { label:'Devices',          icon:ShieldCheck, route:'/devices' },
  { label:'Security',         icon:ShieldCheck, route:'/security' },
  { label:'Discord',          icon:Disc,        route:'/discord' },
  { label:'Status',           icon:Bell,        route:'/status' },
];

// ─── PraQen news items ─────────────────────────────────────────────────────────
const PRAQUE_NEWS = [
  {
    id: 1,
    title: 'P2P Trading Volume Hits New High',
    description: 'Our community traded over 500 BTC last week — the highest weekly volume since launch.',
    actionLabel: 'View Report',
    route: '/trade-insights',
    timestamp: '2026-09-03T08:39:00',
    icon: <TrendingUp size={18} color="#F59E0B" />,
    color: '#F59E0B',
  },
  {
    id: 2,
    title: 'New Feature: Instant Withdrawals',
    description: 'Withdraw your earnings to your external wallet in seconds — no more waiting for manual processing.',
    actionLabel: 'Withdraw Funds Now',
    route: '/wallet',
    timestamp: '2026-08-31T14:22:00',
    icon: <Zap size={18} color="#10B981" />,
    color: '#10B981',
  },
];

// ─── Quick tab row items ────────────────────────────────────────────────────────
const QUICK_TABS = [
  { label:'Launch hub', route:'/dashboard', icon:Bitcoin },
  { label:'Trades',      route:'/my-trades', icon:ArrowLeftRight },
  { label:'Support',     route:'/contact',   icon:HelpCircle },
];

// ─── Icon lookup for Last Visited ──────────────────────────────────────────────
const iconMap = {
  Bitcoin, TrendingUp, MessageCircle: () => null, Wallet, User: () => null, Gift,
  Settings, HelpCircle, ShieldCheck, CreditCard, Bell, Disc,
  MoveRight, Info, AlertTriangle: () => null, Sparkles,
};

function resolveIcon(name) {
  if (name === 'MessageCircle') return null;
  if (name === 'User') return null;
  if (name === 'AlertTriangle') return null;
  return iconMap[name] || null;
}

// ─── Main Dashboard ────────────────────────────────────────────────────────────
export default function Dashboard({ user }) {
  const navigate = useNavigate();
  const displayUser = useLocalUser(user);

  // ── Desktop layout gate (NoOnes-style two-column dashboard) ───────────────
  // Only activates at ≥1280px; below that the original stacked layout renders.
  const isDesktop = useMediaQuery('(min-width: 1280px)');

  // ── Last Visited wiring ──────────────────────────────────────────────────────
  const { visited: lastVisited } = useLastVisited();
  const lastVisitedItems = lastVisited
    .map(entry => {
      const meta = matchVisitableRoute(entry.route);
      if (!meta) return null;
      return { label: meta.label, icon: meta.icon, route: entry.route };
    })
    .filter(Boolean);

  // ── Wallet balance + BTC price ───────────────────────────────────────────────
  const [walletBalance, setWalletBalance] = useState(0);
  const [refreshedBalance, setRefreshedBalance] = useState(() => walletBalance);
  const [showBalance, setShowBalance] = useState(true);
  const [btcPrice, setBtcPrice] = useState(0);
  const [ghsRate, setGhsRate] = useState(0);
  const [loading, setLoading] = useState(true);
  const ghsBalance = walletBalance * ghsRate;

  const fetchWalletBalance = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return null;
      const res = await axios.get(`${API_URL}/hd-wallet/wallet`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const bal = parseFloat(res.data?.balance_btc || 0);
      setWalletBalance(bal);
      setRefreshedBalance(bal);
      localStorage.setItem('praqen_btc_balance', bal.toString());
      return bal;
    } catch { /* silent */ }
    return null;
  };

  const fetchBtcPrice = async () => {
    try {
      const res = await fetch('https://api.coinbase.com/v2/prices/BTC-USD/spot');
      const data = await res.json();
      setBtcPrice(parseFloat(data.data.amount));
    } catch { /* silent */ }
  };

  const fetchGhsRate = async () => {
    try {
      const res = await fetch('https://api.coinbase.com/v2/prices/BTC-GHS/spot');
      const data = await res.json();
      setGhsRate(parseFloat(data.data.amount));
    } catch { /* silent */ }
  };

  // ── Popup state ──────────────────────────────────────────────────────────────
  const [walletMenuOpen, setWalletMenuOpen]       = useState(false);
  const [showAllProductsOpen, setShowAllProductsOpen] = useState(false);
  const [showAllAccountOpen, setShowAllAccountOpen]   = useState(false);
  const [userInfoExpanded, setUserInfoExpanded]   = useState(false);

  // ── Load on mount ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const init = async () => {
      await fetchWalletBalance();
      await fetchBtcPrice();
      await fetchGhsRate();
      setLoading(false);
    };
    init();
  }, [user]);

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{backgroundColor:C.mist}}>
      <div className="text-center">
        <div className="w-12 h-12 border-4 rounded-full animate-spin mx-auto mb-3"
          style={{borderColor:C.sage, borderTopColor:'transparent'}}/>
        <p className="text-sm font-semibold" style={{color:C.green}}>Loading dashboard…</p>
      </div>
    </div>
  );

  // ── Handle navigation for tiles ──────────────────────────────────────────────
  const go = (route) => {
    if (!route) return;
    // Handle parameterized routes
    if (route.includes(':')) {
      navigate(route);
    } else {
      navigate(route);
    }
  };

  // ── Desktop layout (≥1280px): NoOnes-style two-column dashboard ──────────
  // Mobile/tablet keeps the original stacked single-column layout below.
  if (isDesktop) {
    return (
      <div className="min-h-screen" style={{backgroundColor:C.mist, fontFamily:"'DM Sans',sans-serif"}}>
        <DashboardDesktop
          user={displayUser}
          walletBalance={walletBalance}
          ghsRate={ghsRate}
          showBalance={showBalance}
          onToggleBalance={() => setShowBalance(!showBalance)}
          lastVisitedItems={lastVisitedItems}
          resolveIcon={resolveIcon}
          onTakeTour={() => {}}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-10" style={{backgroundColor:C.mist, fontFamily:"'DM Sans',sans-serif"}}>

      {/* ── WALLET BALANCE CARD (B1) ──────────────────────────────────────────── */}
      <div className="max-w-6xl mx-auto px-4 pt-4 pb-2">
        <div className="rounded-2xl border shadow-sm overflow-hidden relative" style={{backgroundColor:C.g50, borderColor:C.g200}}>
          <div className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Wallet size={14} style={{color:C.green}}/>
                <h2 className="font-black text-sm" style={{color:C.forest}}>Wallet Balance</h2>
                <button
                  onClick={() => setShowBalance(!showBalance)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center', color: C.g500 }}
                  aria-label={showBalance ? 'Hide balance' : 'Show balance'}
                >
                  {showBalance ? <EyeOff size={14} style={{ color: C.g500 }}/> : <Eye size={14} style={{ color: C.g500 }}/>}
                </button>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-black" style={{ color: C.forest }}>
                  {showBalance ? `GHS ₵${fmt(ghsBalance, 2)}` : '******' }
                </p>
              </div>
              <button
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-white text-xs font-black border"
                style={{ borderColor: 'rgba(255,255,255,0.3)', background: 'rgba(255,255,255,0.1)' }}
                onClick={() => navigate('/wallet')}
              >
                View
              </button>
            </div>
          </div>
          {/* Three-dot menu */}
          <button
            onClick={() => setWalletMenuOpen(true)}
            className="absolute top-3 right-3 w-7 h-7 rounded-full bg-white/80 flex items-center justify-center text-sm font-bold border shadow-sm"
            style={{ borderColor: C.g200, color: C.g500 }}
            aria-label="Wallet options"
          >
            •••
          </button>
        </div>
      </div>

      {/* ── NEWS SECTION (B3) ─────────────────────────────────────────────────── */}
      <div className="max-w-6xl mx-auto px-4 py-4">
        <div className="bg-white rounded-2xl border shadow-sm overflow-hidden" style={{ borderColor: C.g200 }}>
          <div className="px-4 py-3 border-b" style={{ borderColor: C.g100 }}>
            <div className="flex items-center gap-2">
              <Megaphone size={14} style={{ color: C.amber }}/>
              <h2 className="font-black text-sm" style={{ color: C.forest }}>PraQen news</h2>
            </div>
          </div>
          <div className="p-3">
            <div className="space-y-3">
              {PRAQUE_NEWS.slice(0, 2).map(news => (
                <div key={news.id} className="flex gap-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: `${news.color}15` }}>
                    {news.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold truncate" style={{ color: C.forest }}>{news.title}</p>
                    <p className="text-xs mt-0.5 line-clamp-2" style={{ color: C.g500 }}>{news.description}</p>
                    <div className="flex items-center justify-between mt-2">
                      <button
                        onClick={() => navigate(news.route)}
                        className="text-xs font-bold px-3 py-1.5 rounded-xl border"
                        style={{ borderColor: C.g200, color: C.forest, background: C.white }}
                      >
                        {news.actionLabel}
                      </button>
                      <p className="text-xs" style={{ color: C.g400 }}>
                        {fmtTs(news.timestamp)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <button
              onClick={() => navigate('/notifications')}
              className="mt-3 w-full flex items-center justify-center gap-1 py-2.5 rounded-xl text-xs font-bold border"
              style={{ borderColor: C.g200, color: C.g600, background: C.white }}
            >
              View more <ChevronRight size={12} />
            </button>
          </div>
        </div>
      </div>

      {/* ── QUICK TAB ROW (B4) ────────────────────────────────────────────────── */}
      <div className="max-w-6xl mx-auto px-4 pb-2">
        <div className="bg-white rounded-2xl border shadow-sm overflow-hidden" style={{ borderColor: C.g200 }}>
          <div className="p-3">
            <div className="grid grid-cols-3 gap-2">
              {QUICK_TABS.map(({ label, icon:Icon, route }) => (
                <button
                  key={label}
                  onClick={() => navigate(route)}
                  className="flex flex-col items-center gap-1.5 p-3 rounded-xl border hover:shadow-sm transition hover:-translate-y-0.5"
                  style={{ borderColor: C.g100, background: C.white }}
                >
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                    style={{ backgroundColor: `${iconColorFor(label)}15` }}>
                    <Icon size={18} style={{ color: iconColorFor(label) }}/>
                  </div>
                  <span className="text-xs font-bold" style={{ color: C.g700 }}>{label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── LAST VISITED (B5) — hidden until the user has visit history ─────── */}
      {lastVisitedItems.length > 0 && (
      <div className="max-w-6xl mx-auto px-4 py-4">
        <div className="px-4 py-3 border-b" style={{ borderColor: C.g100 }}>
          <h2 className="font-black text-sm text-center" style={{ color: C.forest }}>Last visited</h2>
        </div>
        <div className="p-3 grid grid-cols-3 gap-2">
          {lastVisitedItems.map(({ label, icon:iconName, route }) => {
            const Icon = resolveIcon(iconName);
            if (!Icon) return null;
            return (
              <Tile
                key={route}
                icon={Icon}
                label={label}
                route={route}
                onClick={() => navigate(route)}
              />
            );
          })}
        </div>
      </div>
      )}

      {/* ── PRODUCT & SERVICES (B6) ───────────────────────────────────────────── */}
      <div className="max-w-6xl mx-auto px-4 py-4">
        <div className="bg-white rounded-2xl border shadow-sm overflow-hidden" style={{ borderColor: C.g200 }}>
          <div className="px-4 py-3 border-b" style={{ borderColor: C.g100 }}>
            <div className="flex items-center gap-2">
              <ArrowLeftRight size={14} style={{ color: C.green }}/>
              <h2 className="font-black text-sm" style={{ color: C.forest }}>Product & services</h2>
            </div>
          </div>
          <div className="p-3">
            <div className="grid grid-cols-3 gap-2">
              {PRODUCTS_AND_SERVICES.map(({ label, icon:Icon, route }) => (
                <Tile
                  key={label}
                  icon={Icon}
                  label={label}
                  route={route}
                  onClick={() => navigate(route)}
                />
              ))}
            </div>
            <button
              onClick={() => setShowAllProductsOpen(true)}
              className="md:hidden mt-3 w-full flex items-center justify-center py-2.5 rounded-xl text-xs font-bold bg-green-50 text-green-700 border-0"
            >
              Show all <ChevronRight size={12} />
            </button>
          </div>
        </div>
      </div>

      {/* ── PRODUCTS & SERVICES POPUP (B6 — Part D) ───────────────────────────── */}
      <PopupModal
        open={showAllProductsOpen}
        onClose={() => setShowAllProductsOpen(false)}
        title="All Products & Services"
      >
        <div className="grid grid-cols-2 gap-3">
          {PRODUCTS_AND_SERVICES.map(({ label, icon:Icon, route }) => (
            <button
              key={label}
              onClick={() => { setShowAllProductsOpen(false); navigate(route); }}
              className="flex flex-col items-center gap-1.5 p-3 rounded-xl border hover:shadow-sm transition"
              style={{ borderColor: C.g100, background: C.white, borderRadius: '16px' }}
            >
              <div className="w-12 h-12 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: `${iconColorFor(label)}15`, borderRadius: '14px' }}>
                <Icon size={22} style={{ color: iconColorFor(label) }} strokeWidth={2} />
              </div>
              <span className="text-xs font-semibold text-center leading-tight" style={{ color: C.g600 }}>{label}</span>
            </button>
          ))}
        </div>
      </PopupModal>

      {/* ── ACCOUNT & SETTINGS (B7) ───────────────────────────────────────────── */}
      <div className="max-w-6xl mx-auto px-4 py-4">
        <div className="bg-white rounded-2xl border shadow-sm overflow-hidden" style={{ borderColor: C.g200 }}>
          <div className="px-4 py-3 border-b" style={{ borderColor: C.g100 }}>
            <div className="flex items-center gap-2">
              <Settings size={14} style={{ color: C.g600 }}/>
              <h2 className="font-black text-sm" style={{ color: C.forest }}>Account & settings</h2>
            </div>
          </div>
          <div className="p-3">
            <div className="grid grid-cols-3 gap-2">
              {ACCOUNT_AND_SETTINGS.map(({ label, icon:Icon, route }) => (
                <Tile
                  key={label}
                  icon={Icon}
                  label={label}
                  route={route}
                  onClick={() => navigate(route)}
                />
              ))}
            </div>
            <button
              onClick={() => setShowAllAccountOpen(true)}
              className="md:hidden mt-3 w-full flex items-center justify-center py-2.5 rounded-xl text-xs font-bold bg-green-50 text-green-700 border-0"
            >
              Show all <ChevronRight size={12} />
            </button>
          </div>
        </div>
      </div>

      {/* ── ACCOUNT & SETTINGS POPUP (B7 — Part D) ────────────────────────────── */}
      <PopupModal
        open={showAllAccountOpen}
        onClose={() => setShowAllAccountOpen(false)}
        title="All Account & Settings"
      >
        <div className="divide-y" style={{ borderColor: C.g100 }}>
          {ACCOUNT_AND_SETTINGS.map(({ label, icon:Icon, route }) => (
            <PopupItem
              key={label}
              icon={Icon}
              label={label}
              route={route}
              onClick={() => { setShowAllAccountOpen(false); navigate(route); }}
            />
          ))}
        </div>
      </PopupModal>

      {/* ── REWARDS HUB (B8) ──────────────────────────────────────────────────── */}
      <div className="max-w-6xl mx-auto px-4 py-4">
        <div className="bg-white rounded-2xl border shadow-sm overflow-hidden" style={{ borderColor: C.g200 }}>
          <div className="px-4 py-3 border-b" style={{ borderColor: C.g100 }}>
            <h2 className="font-black text-sm text-center" style={{ color: C.forest }}>Rewards hub</h2>
          </div>
          <div className="p-4">
            <div className="flex flex-col items-center gap-3">
              <Tile
                icon={Award}
                label="Partner program"
                route="/partner-program"
                onClick={() => navigate('/partner-program')}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── USER INFO CARD (expandable) ────────────────────────────────────────── */}
      <div className="max-w-6xl mx-auto px-4 pb-6">
        <div className="bg-white rounded-2xl border shadow-sm overflow-hidden" style={{ borderColor: C.g200 }}>
          <div className="px-4 py-3">
            {/* Top row: avatar | name + badge + limits | gear + chevron */}
            <div className="flex items-start gap-3">
              {/* Avatar — real image with letter fallback */}
              <div className="relative flex-shrink-0">
                {displayUser?.avatar_url ? (
                  <img
                    src={displayUser.avatar_url}
                    alt="Profile"
                    className="w-10 h-10 rounded-full object-cover"
                    style={{ border: '2px solid white', boxShadow: '0 2px 6px rgba(15,23,42,0.1)' }}
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                      e.currentTarget.nextElementSibling.style.display = 'flex';
                    }}
                  />
                ) : null}
                <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: C.purple, color: 'white', fontSize: 18, fontWeight: 900, display: displayUser?.avatar_url ? 'none' : 'flex' }}>
                  {displayUser?.username?.charAt(0)?.toUpperCase() || '?'}
                </div>
              </div>

              {/* Name + badge + limits */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-black truncate" style={{ color: C.forest }}>{displayUser?.username || 'User'}</p>
                  {displayUser?.badge && (
                    <span className="text-xs" style={{ color: C.gold }}>★</span>
                  )}
                </div>
                <p className="text-xs mt-0.5" style={{ color: C.g500 }}>Limits: Unlimited</p>
              </div>

              {/* Right-side icons */}
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => navigate('/settings')}
                  className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-gray-100 transition"
                  style={{ color: C.g500 }}
                  aria-label="Settings"
                >
                  <Settings size={16} />
                </button>
                <button
                  onClick={() => setUserInfoExpanded(!userInfoExpanded)}
                  className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-gray-100 transition"
                  style={{ color: C.g500 }}
                  aria-label={userInfoExpanded ? 'Collapse details' : 'Expand details'}
                >
                  {userInfoExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </button>
              </div>
            </div>

            {/* Expanded details */}
            {userInfoExpanded && (
              <>
                {/* Divider between Handle and Current badge groups */}
                <div className="space-y-3 pt-3">
                  {/* First group: Joined / Country / Handle */}
                  <div className="space-y-2.5">
                    {/* Joined */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Clock size={13} style={{ color: C.g500 }}/>
                        <span className="text-xs font-semibold" style={{ color: C.g600 }}>Joined</span>
                      </div>
                      <span className="text-xs font-bold" style={{ color: C.forest, textAlign: 'right' }}>
                        {displayUser?.created_at
                          ? new Date(displayUser.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
                          : '—'}
                      </span>
                    </div>

                    {/* Country */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Globe size={13} style={{ color: C.g500 }}/>
                        <span className="text-xs font-semibold" style={{ color: C.g600 }}>Country</span>
                      </div>
                      <span className="text-xs font-bold flex items-center gap-1" style={{ color: C.forest }}>
                        {(() => {
                          const cc = (displayUser?.country_code || displayUser?.country || '').toString().toUpperCase().slice(0, 2);
                          if (cc && cc.length === 2 && /[A-Z]{2}/.test(cc)) {
                            return String.fromCodePoint(0x1F1E6 + cc.charCodeAt(0) - 65) + String.fromCodePoint(0x1F1E6 + cc.charCodeAt(1) - 65) + ' ';
                          }
                          return '';
                        })()}
                        {(displayUser?.country_name || displayUser?.country || '—').toString().slice(0, 20)}
                      </span>
                    </div>

                    {/* Handle */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold" style={{ color: C.g600 }}>Handle</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold" style={{ color: C.forest }}>@{displayUser?.username || '—'}</span>
                        <button
                          onClick={() => { if (displayUser?.username) { navigator.clipboard.writeText('@' + displayUser.username); } }}
                          className="w-6 h-6 rounded flex items-center justify-center hover:bg-gray-100 transition flex-shrink-0"
                          style={{ color: C.g500 }}
                          aria-label="Copy handle"
                        >
                          <Copy size={12} />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Divider line between the two groups */}
                  <div className="border-t" style={{ borderColor: C.g200 }} />

                  {/* Second group: Current badge / Medals / Limits */}
                  <div className="space-y-2.5 pt-1">
                    {/* Current badge */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold flex items-center gap-1" style={{ color: C.g600 }}>
                          Current badge <Info size={11} style={{ color: C.g400 }}/>
                        </span>
                      </div>
                      <span className="text-xs font-bold" style={{ color: C.forest, textAlign: 'right' }}>
                        {displayUser?.badge || '—'}
                      </span>
                    </div>

                    {/* Medals */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold flex items-center gap-1" style={{ color: C.g600 }}>
                          Medals <Info size={11} style={{ color: C.g400 }}/>
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Medal size={14} style={{ color: C.gold }}/>
                        <Medal size={14} style={{ color: '#94A3B8' }}/>
                        <Medal size={14} style={{ color: '#CD7F32' }}/>
                        <span className="text-xs font-bold ml-1" style={{ color: C.g500 }}>+0</span>
                      </div>
                    </div>

                    {/* Limits */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold flex items-center gap-1" style={{ color: C.g600 }}>
                          Limits <Info size={11} style={{ color: C.g400 }}/>
                        </span>
                      </div>
                      <span className="text-xs font-bold" style={{ color: C.forest, textAlign: 'right' }}>Unlimited</span>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── WALLET MENU POPUP (B1 — Part D) ───────────────────────────────────── */}
      <PopupModal
        open={walletMenuOpen}
        onClose={() => setWalletMenuOpen(false)}
        title="Wallet options"
      >
        <div className="divide-y" style={{ borderColor: C.g100 }}>
          {WALLET_MENU_ITEMS.map(({ label, icon:Icon, route }) => (
            <PopupItem
              key={label}
              icon={Icon}
              label={label}
              route={route}
              onClick={() => { setWalletMenuOpen(false); navigate(route); }}
            />
          ))}
          {/* Bottom bar */}
          <div className="flex flex-col md:flex-row items-center justify-between gap-2 pt-5 border-t"
            style={{borderColor:'rgba(255,255,255,0.08)'}}>
            <p className="text-xs" style={{color:'rgba(255,255,255,0.3)'}}>
              © {new Date().getFullYear()} PRAQEN. All rights reserved. Built with honesty.
            </p>
            <p className="text-xs flex items-center gap-1.5" style={{color:'rgba(255,255,255,0.3)'}}>
              <Shield size={11}/> Escrow Protected · 2% fee on completion only
            </p>
          </div>
        </div>
      </PopupModal>

    </div>
  );
}
