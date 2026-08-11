import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Bitcoin, TrendingUp, Plus, Gift, Wallet,
  ArrowRight, Shield, Clock, Eye, EyeOff,
  BarChart2, Star, Bell, ChevronRight,
  Zap, CheckCircle, CircleDollarSign, Hand,
} from 'lucide-react';

const C = {
  forest: '#1B4332', green: '#2D6A4F', mint: '#40916C',
  gold: '#F4A422', mist: '#F0FAF5',
  g50: '#F8FAFC', g100: '#F1F5F9', g200: '#E2E8F0',
  g400: '#94A3B8', g500: '#64748B', g600: '#475569', g800: '#1E293B',
  success: '#10B981', danger: '#EF4444', paid: '#3B82F6',
};

const QUICK_ACTIONS = [
  { icon: Bitcoin,    label: 'Buy BTC',      sub: 'Best rates',     to: '/buy-bitcoin',  color: C.gold    },
  { icon: TrendingUp, label: 'Sell BTC',     sub: 'Get paid fast',  to: '/sell-bitcoin', color: C.green   },
  { icon: Gift,       label: 'Gift Cards',   sub: '100+ brands',    to: '/gift-cards',   color: '#8B5CF6' },
  { icon: Plus,       label: 'Create Offer', sub: 'Set your terms', to: '/create-offer', color: C.mint    },
];

export default function Home({ user }) {
  const navigate = useNavigate();
  const [showBal, setShowBal] = useState(true);

  const name = user?.username || user?.name || 'Trader';

  return (
    <div className="min-h-screen pb-24 md:pb-8"
      style={{ fontFamily: "'DM Sans', sans-serif", backgroundColor: C.g50 }}>      <style>{`
        @keyframes slideUp { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
        .slide { animation: slideUp .35s ease both; }
        .d1 { animation-delay:.05s } .d2 { animation-delay:.1s } .d3 { animation-delay:.15s }
        .card-tap { transition: transform .15s, box-shadow .15s; -webkit-tap-highlight-color: transparent; }
        .card-tap:active { transform: scale(.96); }
        * { box-sizing: border-box; }
        html, body { overscroll-behavior-y: none; }
      `}</style>

      {/* ── WELCOME BANNER ── */}
      <div className="px-3 pt-4 pb-3 max-w-2xl mx-auto w-full slide">
        <div className="rounded-2xl p-4 text-white relative overflow-hidden"
          style={{ background: `linear-gradient(135deg,${C.forest},${C.green})` }}>
          <div className="absolute inset-0 pointer-events-none"
            style={{ backgroundImage: 'radial-gradient(circle at 2px 2px,rgba(255,255,255,0.06) 1px,transparent 0)', backgroundSize: '22px 22px' }} />
          <div className="relative">
            <p className="text-white/60 text-xs mb-0.5 flex items-center gap-1">Welcome back <Hand size={14} /></p>
            <h1 className="text-lg font-black mb-3 truncate" style={{ fontFamily: "'Syne',sans-serif" }}>
              {name}
            </h1>

            {/* Balance row — stacks cleanly on all widths */}
            <div className="flex items-end justify-between gap-2 flex-wrap">
              <div className="min-w-0">
                <p className="text-white/50 text-xs mb-0.5">Wallet Balance</p>
                <div className="flex items-center gap-2">
                  <p className="text-2xl font-black leading-none">
                    {showBal ? '₵0.00' : '••••'}
                  </p>
                  <button onClick={() => setShowBal(v => !v)}
                    className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: 'rgba(255,255,255,0.12)' }}>
                    {showBal
                      ? <EyeOff size={13} className="text-white/70" />
                      : <Eye size={13} className="text-white/70" />}
                  </button>
                </div>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <Link to="/wallet"
                  className="px-3 py-1.5 rounded-xl font-bold text-xs bg-white hover:opacity-90 transition"
                  style={{ color: C.forest }}>
                  Top Up
                </Link>
                <Link to="/wallet"
                  className="px-3 py-1.5 rounded-xl font-bold text-xs border border-white/30 hover:bg-white/10 transition text-white">
                  Withdraw
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── QUICK ACTIONS — 2×2 on mobile, 1×4 on sm+ ── */}
      <div className="px-3 mb-4 max-w-2xl mx-auto w-full slide d1">
        <p className="text-xs font-black uppercase tracking-widest mb-2.5" style={{ color: C.g500 }}>Quick Actions</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
          {QUICK_ACTIONS.map(({ icon: Icon, label, sub, to, color }) => (
            <Link key={label} to={to}
              className="card-tap bg-white rounded-2xl border flex flex-col items-center gap-1.5 text-center"
              style={{ borderColor: C.g200, padding: '12px 8px' }}>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: `${color}15` }}>
                <Icon size={18} style={{ color }} />
              </div>
              <span className="text-xs font-black leading-tight" style={{ color: C.forest }}>{label}</span>
              <span className="text-xs" style={{ color: C.g400 }}>{sub}</span>
            </Link>
          ))}
        </div>
      </div>

      {/* ── STATS ROW — 2 cols on mobile, 4 on sm+ ── */}
      <div className="px-3 mb-4 max-w-2xl mx-auto w-full slide d2">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
          {[
            { label: 'Active Trades', value: '2',     icon: <Zap size={16} />,            color: C.gold    },
            { label: 'Completed',     value: '47',    icon: <CheckCircle size={16} />,    color: C.success },
            { label: 'Volume',        value: '₵125K', icon: <CircleDollarSign size={16} />, color: C.paid  },
            { label: 'Rating',        value: '4.9 ★', icon: <Star size={16} fill="currentColor" />, color: C.gold },
          ].map(({ label, value, icon, color }) => (
            <div key={label} className="bg-white rounded-xl p-3 border" style={{ borderColor: C.g200 }}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-base flex" style={{ color }}>{icon}</span>
                <p className="text-xs truncate ml-1" style={{ color: C.g400 }}>{label}</p>
              </div>
              <p className="text-lg font-black" style={{ color: C.forest }}>{value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── RECENT & ACCOUNT ── */}
      <div className="px-3 mb-4 max-w-2xl mx-auto w-full slide d3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">

          <div className="bg-white rounded-2xl p-4 border" style={{ borderColor: C.g200 }}>
            <div className="flex items-center gap-2 mb-3">
              <Clock size={14} style={{ color: C.gold }} />
              <p className="text-xs font-black" style={{ color: C.g600 }}>Last Trade</p>
            </div>
            <p className="font-black text-sm mb-0.5" style={{ color: C.forest }}>2 hours ago</p>
            <p className="text-xs mb-3" style={{ color: C.g400 }}>BTC → GHS · MTN MoMo</p>
            <Link to="/my-trades"
              className="flex items-center gap-1 text-xs font-bold hover:opacity-80 transition"
              style={{ color: C.green }}>
              View all trades <ChevronRight size={12} />
            </Link>
          </div>

          <div className="bg-white rounded-2xl p-4 border" style={{ borderColor: C.g200 }}>
            <div className="flex items-center gap-2 mb-3">
              <Shield size={14} style={{ color: C.green }} />
              <p className="text-xs font-black" style={{ color: C.g600 }}>Account Status</p>
            </div>
            <div className="flex items-center gap-1.5 mb-1">
              <p className="font-black text-sm" style={{ color: C.forest }}>Verified</p>
              <span className="text-xs px-1.5 py-0.5 rounded-full font-bold"
                style={{ backgroundColor: `${C.success}15`, color: C.success }}>✓ Active</span>
            </div>
            <p className="text-xs mb-3" style={{ color: C.g400 }}>All features unlocked</p>
            <Link to="/settings"
              className="flex items-center gap-1 text-xs font-bold hover:opacity-80 transition"
              style={{ color: C.green }}>
              Manage account <ChevronRight size={12} />
            </Link>
          </div>
        </div>
      </div>

      {/* ── SHORTCUT LINKS ── */}
      <div className="px-3 mb-4 max-w-2xl mx-auto w-full">
        <p className="text-xs font-black uppercase tracking-widest mb-2.5" style={{ color: C.g500 }}>My Account</p>
        <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: C.g200 }}>
          {[
            { icon: BarChart2, label: 'My Trades',     sub: 'View all trade history',  to: '/my-trades'   },
            { icon: Wallet,    label: 'My Wallet',     sub: 'Balance & transactions',  to: '/wallet'      },
            { icon: Star,      label: 'My Listings',   sub: 'Manage your offers',      to: '/my-listings' },
            { icon: Bell,      label: 'Notifications', sub: 'Alerts & updates',        to: '/settings'    },
          ].map(({ icon: Icon, label, sub, to }, i, arr) => (
            <Link key={label} to={to}
              className="flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 active:bg-gray-100 transition"
              style={{ borderBottom: i < arr.length - 1 ? `1px solid ${C.g100}` : 'none' }}>
              <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: C.mist }}>
                <Icon size={15} style={{ color: C.forest }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-black text-sm" style={{ color: C.forest }}>{label}</p>
                <p className="text-xs" style={{ color: C.g400 }}>{sub}</p>
              </div>
              <ChevronRight size={14} style={{ color: C.g400, flexShrink: 0 }} />
            </Link>
          ))}
        </div>
      </div>

      {/* ── FOOTER ── */}
      <div className="px-3 pb-2 max-w-2xl mx-auto text-center">
        <p className="text-xs font-black mb-1">
          <span style={{ color: C.forest }}>PRA</span><span style={{ color: C.gold }}>QEN</span>
          <span className="ml-1.5 px-1.5 py-0.5 rounded-full font-black text-xs"
            style={{ backgroundColor: '#EF4444', color: '#fff' }}>BETA</span>
        </p>
        <p className="text-xs" style={{ color: C.g400 }}>
          <a href="mailto:hello@praqen.com" style={{ color: C.green }}>hello@praqen.com</a>
          {' '}· © {new Date().getFullYear()} PRAQEN
        </p>
      </div>
    </div>
  );
}
