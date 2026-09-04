import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { useRates } from '../contexts/RatesContext';
import Notifications from './Notifications';
import ProfileDropdownPanel from './ProfileDropdownPanel';
import {
  Wallet, ChevronDown,
  Gift, Eye, EyeOff, TrendingUp,
  Plus, LayoutDashboard, ShoppingCart, Tag, List,
  Menu, Search, X, Home, ArrowRightLeft, Globe,
  HelpCircle, MessageCircle, CreditCard, Users,
} from 'lucide-react';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const C = {
  forest: '#1B4332', green: '#2D6A4F', mint: '#40916C',
  gold: '#F4A422', goldDark: '#D4891A', goldLight: '#FEF3C7',
  mist: '#F0FAF5', dark: '#0D1F14',
  g100: '#F1F5F9', g200: '#E2E8F0',
  g400: '#94A3B8', g500: '#64748B', g700: '#334155', g800: '#1E293B',
  purple: '#8B5CF6', purpleLight: '#EDE9FE',
};

const fmt    = (n, d = 2) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: d }).format(n || 0);
const fmtBtc = (n)        => parseFloat(n || 0).toFixed(4);

export default function Navbar({ user, onLogout }) {
  const navigate   = useNavigate();
  const location   = useLocation();
  const { rates: USD_RATES, btcUsd } = useRates();
  const [profileDrop,     setProfileDrop]     = useState(false);
  const [marketDrop,      setMarketDrop]      = useState(false);
  const [mobileMenuOpen,  setMobileMenuOpen]  = useState(false);
  const [expandedSections, setExpandedSections] = useState({});
  const [hdBalance,       setHdBalance]       = useState(() => parseFloat(localStorage.getItem('praqen_btc_balance') || 0));
  const [balanceUsd,      setBalanceUsd]      = useState(() => parseFloat(localStorage.getItem('praqen_usd_balance') || 0));
  const [lockedBtc,       setLockedBtc]       = useState(() => parseFloat(localStorage.getItem('praqen_locked_btc') || 0));
  const [usdtBalance,     setUsdtBalance]     = useState(() => parseFloat(localStorage.getItem('praqen_usdt_balance') || 0));
  const [localUser,       setLocalUser]       = useState(user);
  const [showBal,         setShowBal]         = useState(true);
  const [displayCurrency, setDisplayCurrency] = useState(localStorage.getItem('praqen_currency') || 'USD');
  const dropRef   = useRef(null);
  const marketRef = useRef(null);
  const [activeGuide, setActiveGuide] = useState(null);
  const guideTimer = useRef(null);

  function handleGuideEnter(id) { clearTimeout(guideTimer.current); setActiveGuide(id); }
  function handleGuideLeave() { guideTimer.current = setTimeout(() => setActiveGuide(null), 140); }


useEffect(() => {
  const sync = () => {
    const raw = localStorage.getItem('user');
    if (!raw) { setLocalUser(null); return; }
    const s = JSON.parse(raw);
    setLocalUser(s?.id ? s : null);
  };
  sync();
  window.addEventListener('storage', sync);
  window.addEventListener('userUpdated', sync);
  return () => {
    window.removeEventListener('storage', sync);
    window.removeEventListener('userUpdated', sync);
  };
}, []);

useEffect(() => { setLocalUser(user?.id ? user : null); }, [user?.id]);

  // Lock body scroll when hamburger menu or profile overlay is open
  useEffect(() => {
    const shouldLock = mobileMenuOpen || profileDrop;
    const html = document.documentElement;
    const body = document.body;
    if (shouldLock) {
      html.style.overflow = 'hidden';
      body.style.overflow = 'hidden';
    } else {
      html.style.overflow = '';
      body.style.overflow = '';
    }
    return () => {
      html.style.overflow = '';
      body.style.overflow = '';
    };
  }, [mobileMenuOpen, profileDrop]);



  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;
    axios.get(`${API_URL}/users/profile`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => {
        if (res.data.preferred_currency) {
          setDisplayCurrency(res.data.preferred_currency);
          localStorage.setItem('praqen_currency', res.data.preferred_currency);
        }
      })
      .catch(() => {
        const saved = localStorage.getItem('praqen_currency');
        if (saved) setDisplayCurrency(saved);
      });
  }, [user?.id]);

  useEffect(() => {
    if (!user) return;
    loadBalance();
    const iv = setInterval(loadBalance, 30000);
    return () => clearInterval(iv);
  }, [user]);

  const loadBalance = async () => {
    try {
      const tk = localStorage.getItem('token');
      if (!tk) return;
      const headers = { Authorization: `Bearer ${tk}` };

      // Fetch BTC + USDT in parallel
      const [btcRes, usdtRes] = await Promise.all([
        axios.get(`${API_URL}/hd-wallet/wallet`, { headers }).catch(() => ({ data: { success: true, balance_btc: 0, available_btc: 0, locked_btc: 0 } })),
        axios.get(`${API_URL}/wallet/usdt`, { headers }).catch(() => ({ data: {} })),
      ]);

      const avail      = parseFloat(btcRes.data?.available_btc ?? btcRes.data?.balance_btc ?? 0);
      const locked     = parseFloat(btcRes.data?.locked_btc || 0);
      const btcPrice   = parseFloat(btcRes.data?.btc_price || 0);
      // Total BTC value includes escrow-locked funds (money is still the user's)
      const totalBtcUsd = btcPrice > 0 ? (avail + locked) * btcPrice : parseFloat(btcRes.data?.balance_usd || 0);

      const usdtAvail  = parseFloat(usdtRes.data?.balance_usdt || 0);
      const usdtLocked = parseFloat(usdtRes.data?.locked_balance_usdt || 0);
      const totalUsdt  = usdtAvail + usdtLocked; // USDT is 1:1 with USD

      const combinedUsd = totalBtcUsd + totalUsdt;

      setHdBalance(avail);
      setLockedBtc(locked);
      setUsdtBalance(totalUsdt);
      setBalanceUsd(combinedUsd);

      localStorage.setItem('praqen_btc_balance',  avail.toString());
      localStorage.setItem('praqen_locked_btc',   locked.toString());
      localStorage.setItem('praqen_usdt_balance', totalUsdt.toString());
      localStorage.setItem('praqen_usd_balance',  combinedUsd.toString());
    } catch {}
  };

  useEffect(() => {
    const h = e => {
      if (dropRef.current   && !dropRef.current.contains(e.target))   setProfileDrop(false);
      if (marketRef.current && !marketRef.current.contains(e.target)) setMarketDrop(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const displayUser = localUser?.id ? localUser : user;
  const totalBtc    = parseFloat(hdBalance || 0);
  const fxRate      = displayCurrency === 'USD' ? 1 : (USD_RATES?.[displayCurrency] || 1);
  // Combined USD = BTC (available + locked) * price + USDT (available + locked)
  // Fall back to live BTC price + cached USDT when API hasn't responded yet.
  const totalLocal  = balanceUsd > 0
    ? balanceUsd * fxRate
    : (totalBtc * (btcUsd || 88000) + (usdtBalance || 0)) * fxRate;
  const localCode   = displayCurrency;
  const CURRENCY_SYMBOLS = { USD:'$', GBP:'£', EUR:'€', GHS:'₵', NGN:'₦', KES:'KSh', ZAR:'R' };
  const sym         = CURRENCY_SYMBOLS[displayCurrency] || '';
  const handleLogout = () => { onLogout(); navigate('/login'); };

  const isActive       = (path) => location.pathname === path;
  const isMarketActive = ['/buy-bitcoin', '/sell-bitcoin', '/buy-usdt', '/sell-usdt'].some(p => location.pathname.startsWith(p));
  const isGiftActive   = location.pathname.startsWith('/gift-cards') || location.pathname.startsWith('/sell-gift-card');

  // ── Desktop Nav Links ───────────────────────────────────────────────────────
  const segStyle = (active, activeColor) => ({
    display: 'flex', alignItems: 'center', gap: 6,
    color: active ? activeColor : '#111827',
    background: active ? '#fff' : 'transparent',
    boxShadow: active ? '0 1px 5px rgba(15,23,42,0.10)' : 'none',
    borderRadius: 999, padding: '7px 14px',
    fontSize: '13.5px', fontWeight: 800,
    textDecoration: 'none', whiteSpace: 'nowrap', border: 'none',
    cursor: 'pointer', transition: 'all 0.2s',
  });

  const DesktopNavLinks = () => (
    <div className="hidden md:flex items-center flex-1 justify-center" style={{ gap: 12 }}>

      {/* Segmented control — one cohesive track instead of separate floating pills */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 2,
        background: C.g100, borderRadius: 999, padding: 4,
      }}>
        <Link to="/dashboard" style={segStyle(isActive('/dashboard'), C.forest)}>
          <LayoutDashboard size={14} />
          Dashboard
        </Link>

{/* P2P Marketplace Dropdown */}
        <div className="relative" ref={marketRef}>
          <div style={{ position: 'relative' }}
            onMouseEnter={() => handleGuideEnter('nav_p2p_trade')} onMouseLeave={handleGuideLeave}>
            {activeGuide === 'nav_p2p_trade' && !marketDrop && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 8px)', left: 0, zIndex: 10000,
                width: 'min(210px, calc(100vw - 24px))',
                maxWidth: 'calc(100vw - 24px)',
                background: 'linear-gradient(135deg, #1E40AF 0%, #2563EB 100%)',
                borderRadius: 12, padding: '8px 9px',
                boxShadow: '0 10px 36px rgba(37,99,235,0.35)', pointerEvents: 'none',
                color: '#fff', boxSizing: 'border-box',
              }}>
                <p style={{ margin: '0 0 2px', fontWeight: 800, fontSize: 10.5 }}>P2P Trading</p>
                <p style={{ margin: 0, fontSize: 9.5, color: 'rgba(255,255,255,0.9)', lineHeight: 1.4 }}>
                  Buy & Sell Bitcoin (BTC) or Tether (USDT) directly with verified peers using local payment methods.
                </p>
              </div>
            )}
            <button onClick={() => setMarketDrop(!marketDrop)} style={segStyle(isMarketActive || marketDrop, C.forest)}>
              <TrendingUp size={14} />
              P2P Trade
              <span style={{
                fontSize: '8.5px', background: C.gold, color: '#fff',
                padding: '1.5px 5px', borderRadius: '20px', fontWeight: 900, letterSpacing: '0.3px',
              }}>BETA</span>
              <ChevronDown size={12} style={{ transform: marketDrop ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
            </button>
          </div>

          {marketDrop && (
            <div className="prq-dropdown" style={{
              position: 'absolute', top: 'calc(100% + 10px)', left: 0,
              transformOrigin: 'top left',
              width: '218px', background: '#fff', borderRadius: '16px',
              boxShadow: '0 20px 60px rgba(0,0,0,0.18)', border: `1px solid ${C.g100}`,
              overflow: 'hidden', zIndex: 50,
            }}>
              <p style={{ margin: 0, padding: '10px 16px 6px', fontSize: 10, fontWeight: 800, letterSpacing: '0.6px', color: C.g400, textTransform: 'uppercase' }}>Bitcoin</p>
              <Link to="/buy-bitcoin" onClick={() => setMarketDrop(false)}
                style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 16px', textDecoration: 'none', background: isActive('/buy-bitcoin') ? C.mist : '#fff', transition: 'background 0.15s' }}
                onMouseEnter={e => { if (!isActive('/buy-bitcoin')) e.currentTarget.style.background = C.g100; }}
                onMouseLeave={e => { if (!isActive('/buy-bitcoin')) e.currentTarget.style.background = '#fff'; }}>
                <div style={{ width: 34, height: 34, borderRadius: 10, background: '#DCFCE7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <ShoppingCart size={16} color="#16A34A" />
                </div>
                <div>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: C.g800 }}>Buy Bitcoin</p>
                  <p style={{ margin: 0, fontSize: 10, color: C.g400 }}>Pay with local currency</p>
                </div>
              </Link>
              <Link to="/sell-bitcoin" onClick={() => setMarketDrop(false)}
                style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 16px', textDecoration: 'none', borderBottom: `1px solid ${C.g100}`, background: isActive('/sell-bitcoin') ? C.mist : '#fff', transition: 'background 0.15s' }}
                onMouseEnter={e => { if (!isActive('/sell-bitcoin')) e.currentTarget.style.background = C.g100; }}
                onMouseLeave={e => { if (!isActive('/sell-bitcoin')) e.currentTarget.style.background = '#fff'; }}>
                <div style={{ width: 34, height: 34, borderRadius: 10, background: '#FEF9C3', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Tag size={16} color={C.goldDark} />
                </div>
                <div>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: C.g800 }}>Sell Bitcoin</p>
                  <p style={{ margin: 0, fontSize: 10, color: C.g400 }}>Get paid in local currency</p>
                </div>
              </Link>
              <p style={{ margin: 0, padding: '10px 16px 6px', fontSize: 10, fontWeight: 800, letterSpacing: '0.6px', color: C.g400, textTransform: 'uppercase' }}>USDT</p>
              <Link to="/buy-usdt" onClick={() => setMarketDrop(false)}
                style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 16px', textDecoration: 'none', background: isActive('/buy-usdt') ? C.mist : '#fff', transition: 'background 0.15s' }}
                onMouseEnter={e => { if (!isActive('/buy-usdt')) e.currentTarget.style.background = C.g100; }}
                onMouseLeave={e => { if (!isActive('/buy-usdt')) e.currentTarget.style.background = '#fff'; }}>
                <div style={{ width: 34, height: 34, borderRadius: 10, background: '#D1FAE5', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <span style={{ fontSize: 14, fontWeight: 900, color: '#0D9488' }}>₮</span>
                </div>
                <div>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: C.g800 }}>Buy USDT</p>
                  <p style={{ margin: 0, fontSize: 10, color: C.g400 }}>Pay with local currency</p>
                </div>
              </Link>
              <Link to="/sell-usdt" onClick={() => setMarketDrop(false)}
                style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 16px 13px', textDecoration: 'none', background: isActive('/sell-usdt') ? C.mist : '#fff', transition: 'background 0.15s' }}
                onMouseEnter={e => { if (!isActive('/sell-usdt')) e.currentTarget.style.background = C.g100; }}
                onMouseLeave={e => { if (!isActive('/sell-usdt')) e.currentTarget.style.background = '#fff'; }}>
                <div style={{ width: 34, height: 34, borderRadius: 10, background: '#FEF9C3', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <span style={{ fontSize: 14, fontWeight: 900, color: C.goldDark }}>₮</span>
                </div>
                <div>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: C.g800 }}>Sell USDT</p>
                  <p style={{ margin: 0, fontSize: 10, color: C.g400 }}>Get paid in local currency</p>
                </div>
              </Link>
            </div>
          )}
        </div>

        <Link to="/gift-cards" style={segStyle(isGiftActive, C.purple)}>
          <Gift size={14} />
          Gift Cards
        </Link>

        <Link to="/my-trades" style={segStyle(isActive('/my-trades'), C.g800)}>
          <List size={14} />
          My Trades
        </Link>
    </div>
 
      {/* Create Offer — deliberately outside the track so it reads as an action, not a tab */}
      <div style={{ position: 'relative' }}>
        <Link to="/create-offer"
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: `linear-gradient(135deg, ${C.gold}, #FBBF24)`,
            color: '#0D1F14', borderRadius: 999, padding: '9px 18px',
            fontSize: '13.5px', fontWeight: 900,
            textDecoration: 'none', whiteSpace: 'nowrap',
            boxShadow: '0 4px 14px rgba(244,164,34,0.4)',
            transition: 'all 0.2s',
          }}>
          <Plus size={15} strokeWidth={3} />
          Create Offer
        </Link>
      </div>
    </div>
  );

  // ── Guest Navbar ────────────────────────────────────────────────────────────
  if (!user) return (
    <nav style={{
      background: '#ffffff',
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 1000,
      borderBottom: `1px solid ${C.g200}`,
      boxShadow: '0 2px 16px rgba(0,0,0,0.07)',
      fontFamily: "'DM Sans', sans-serif",
      paddingTop: 'env(safe-area-inset-top, 0px)',
      paddingLeft: 'env(safe-area-inset-left, 0px)',
      paddingRight: 'env(safe-area-inset-right, 0px)',
    }}>      <div className="max-w-[1280px] mx-auto px-4 md:px-8">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 64, gap: 12 }}>
          {/* Mobile hamburger + search (hidden on desktop) */}
          <div className="prq-main-nav-hamburger" style={{ display: 'none', alignItems: 'center', gap: 2, flexShrink: 0 }}>
            <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Menu size={20} color={C.g700} />
            </button>
            <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Search size={20} color={C.g700} />
            </button>
          </div>

          <Link to="/" className="prq-main-nav-logo" style={{ textDecoration: 'none', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 9 }}>
            <div style={{
              width: 30, height: 30, borderRadius: 9, background: C.gold,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 16, fontWeight: 900, color: C.dark, fontFamily: 'Georgia,serif',
              boxShadow: '0 2px 8px rgba(244,164,34,0.45)', flexShrink: 0,
            }}>P</div>
            <span style={{ fontSize: 21, fontWeight: 900, letterSpacing: '-0.5px' }}>
              <span style={{ color: C.forest }}>PRA</span><span style={{ color: C.gold }}>QEN</span>
            </span>
          </Link>
          <DesktopNavLinks />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <Link to="/login" className="hidden sm:inline-block" style={{
              padding: '8px 18px', borderRadius: 10, fontSize: 13, fontWeight: 800,
              border: `2px solid ${C.g200}`, color: C.forest,
              textDecoration: 'none', transition: 'all 0.2s', background: 'transparent',
            }}>Log In</Link>
            <Link to="/register" style={{
              padding: '8px 18px', borderRadius: 10, fontSize: 13, fontWeight: 800,
              background: `linear-gradient(135deg, ${C.gold}, #FBBF24)`,
              color: C.dark, textDecoration: 'none',
              boxShadow: '0 2px 12px rgba(244,164,34,0.4)',
            }}>Sign Up</Link>
          </div>
        </div>
      </div>
      <div style={{ height: 2, background: `linear-gradient(90deg, ${C.forest}, ${C.mint}, ${C.gold})`, opacity: 0.6 }} />
    </nav>
  );

  // ── Authenticated Navbar ────────────────────────────────────────────────────
  return (
    <>
    <nav className={mobileMenuOpen ? 'prq-hamburger-nav-hidden' : ''} style={{
      background: '#ffffff',
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 1000,
      borderBottom: `1px solid ${C.g200}`,
      boxShadow: '0 2px 16px rgba(0,0,0,0.07)',
      fontFamily: "'DM Sans', sans-serif",
      paddingTop: 'env(safe-area-inset-top, 0px)',
      paddingLeft: 'env(safe-area-inset-left, 0px)',
      paddingRight: 'env(safe-area-inset-right, 0px)',
    }}>      <style>{`
        @keyframes prqPulseDot{0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.4;transform:scale(0.75)}}
        @keyframes prqDropIn{from{opacity:0;transform:translateY(-6px) scale(0.97)}to{opacity:1;transform:translateY(0) scale(1)}}
        .prq-dropdown{animation:prqDropIn 0.16s cubic-bezier(0.16,1,0.3,1)}
        /* Brand name always stays visible — just runs a bit smaller on narrow phones
           so there's still room for the wallet balance, avatar and bell. */
        @media (max-width: 400px) { .prq-logo-wordmark { font-size: 16px !important; } }
        /* Below ~380px the avatar's chevron is the least essential pixel —
           drop it so the bell never gets pushed off the edge of the screen.
           The balance eye toggle is always visible. */
        @media (max-width: 380px) {
          .prq-avatar-chevron { display: none !important; }
        }
        /* Hide PRAQEN logo on mobile — replaced by hamburger+search */
        @media (max-width: 767px) {
          .prq-main-nav-logo { display: none !important; }
          .prq-main-nav-desktop-cluster { display: none !important; }
          .prq-main-nav-hamburger { display: flex !important; }
          .prq-hamburger-nav-hidden { display: none !important; }
        }
        @media (min-width: 768px) {
          .prq-main-nav-hamburger { display: none !important; }
          .prq-nav-avatar-bell-group { display: flex !important; }
        }
      `}</style>
      <div className="max-w-[1400px] mx-auto px-4 md:px-10">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 64, gap: 6 }}>

          {/* Mobile hamburger + search (hidden on desktop) */}
          <div className="prq-main-nav-hamburger" style={{ display: 'none', alignItems: 'center', gap: 2, flexShrink: 0 }}>
            <button
              onClick={() => setMobileMenuOpen(p => !p)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {mobileMenuOpen ? <X size={20} color={C.g700} /> : <Menu size={20} color={C.g700} />}
            </button>
            <button
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Search size={20} color={C.g700} />
            </button>
          </div>

          {/* Logo (hidden on mobile via CSS) */}
          <Link to="/" className="prq-main-nav-logo" style={{ textDecoration: 'none', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 30, height: 30, borderRadius: 9, background: C.gold,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 16, fontWeight: 900, color: C.dark, fontFamily: 'Georgia,serif',
              boxShadow: '0 2px 8px rgba(244,164,34,0.45)', flexShrink: 0,
            }}>P</div>
            <span className="prq-logo-wordmark" style={{ fontSize: 21, fontWeight: 900, letterSpacing: '-0.5px', flexShrink: 0 }}>
              <span style={{ color: C.forest }}>PRA</span><span style={{ color: C.gold }}>QEN</span>
            </span>
          </Link>

          {/* Center Nav */}
          <DesktopNavLinks />

          {/* Right: Profile cluster (username + balance + avatar + bell) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flexShrink: 0 }}>

            {/* Mobile profile cluster — username above balance, right-aligned, plain text */}
            <div className="flex md:hidden items-center prq-main-nav-mobile-cluster" style={{ flexShrink: 0, display: mobileMenuOpen ? 'none' : undefined }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: C.g500, lineHeight: 1.1, maxWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {displayUser?.username || 'User'}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Link to="/wallet" style={{ textDecoration: 'none', whiteSpace: 'nowrap' }}>
                    <span style={{ fontSize: 13, fontWeight: 800, color: C.g800 }}>
                      {showBal ? `${fmt(totalLocal, 2)} ${localCode}` : '•••'}
                    </span>
                  </Link>
                  <button
                    onClick={() => setShowBal(!showBal)}
                    className="prq-bal-toggle"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 0, flexShrink: 0 }}
                    title={showBal ? 'Hide balance' : 'Show balance'}>
                    {showBal ? <Eye size={12} color={C.g400} /> : <EyeOff size={12} color={C.g400} />}
                  </button>
                </div>
              </div>
            </div>

            {/* Desktop profile cluster — NoOnes style: username on top, balance + eye toggle
                right below it (plain text, no boxed pill), then avatar, then bell — all
                grouped as one cluster, right-aligned. */}
            <div className="hidden md:flex items-center prq-main-nav-desktop-cluster" style={{ gap: 10, flexShrink: 0 }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}>
                {/* Username */}
                <span style={{ fontSize: 12, fontWeight: 700, color: C.g500, lineHeight: 1.2, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {displayUser?.username || 'User'}
                </span>
                {/* Balance + eye toggle — plain, no pill/border, wallet click still goes to /wallet */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                  <Link to="/wallet" style={{ textDecoration: 'none', whiteSpace: 'nowrap' }}>
                    <span style={{ fontSize: 14, fontWeight: 800, color: C.g800 }}>
                      {showBal ? `${fmt(totalLocal, 2)} ${localCode}` : '•••• ••'}
                    </span>
                  </Link>
                  <button
                    onClick={() => setShowBal(!showBal)}
                    className="prq-bal-toggle"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 0, flexShrink: 0 }}
                    title={showBal ? 'Hide balance' : 'Show balance'}>
                    {showBal
                      ? <Eye size={14} color={C.g400} />
                      : <EyeOff size={14} color={C.g400} />}
                  </button>
                </div>
              </div>
            </div>

            {/* Avatar + bell — hidden on mobile when hamburger menu is open */}
            <div className="prq-nav-avatar-bell-group" style={{ display: mobileMenuOpen ? 'none' : 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              {/* Avatar + dropdown trigger — plain circular avatar, no chevron/extra label,
                  shared between mobile and desktop */}
              <div style={{ position: 'relative', flexShrink: 0 }} ref={dropRef}>
                <button
                  onClick={() => setProfileDrop(p => !p)}
                  style={{
                    display: 'flex', alignItems: 'center',
                    background: 'none', border: 'none', padding: 0,
                    cursor: 'pointer', flexShrink: 0,
                  }}>
                  <div style={{ position: 'relative', flexShrink: 0 }}>
                    <div style={{
                      width: 34, height: 34, borderRadius: '50%', overflow: 'hidden',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontWeight: 900, fontSize: 13, color: '#fff',
                      background: `linear-gradient(135deg, ${C.gold}, #FBBF24)`,
                    }}>
                      {displayUser?.avatar_url
                        ? <img src={displayUser.avatar_url} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : <span style={{ color: C.dark }}>{displayUser?.username?.charAt(0)?.toUpperCase() || 'U'}</span>}
                    </div>
                    {/* Online status dot */}
                    <span style={{
                      position: 'absolute', bottom: -1, right: -1, width: 9, height: 9,
                      borderRadius: '50%', background: '#22C55E', border: '2px solid #fff',
                    }} />
                  </div>
                </button>

                {/* Desktop dropdown panel */}
                {profileDrop && (
                  <ProfileDropdownPanel
                    user={displayUser}
                    onLogout={handleLogout}
                    onClose={() => setProfileDrop(false)}
                    balance={totalLocal}
                    showBal={showBal}
                    onToggleBal={() => setShowBal(p => !p)}
                    localCode={localCode}
                  />
                )}
              </div>

              {/* Notifications bell */}
              <Notifications user={displayUser} />
            </div>
          </div>
        </div>
      </div>
      <div style={{ height: 2, background: `linear-gradient(90deg, ${C.forest}, ${C.mint}, ${C.gold})`, opacity: 0.6 }} />
    </nav>

    {/* Mobile hamburger menu drawer — outside <nav> so it replaces the nav on mobile */}
    {mobileMenuOpen && (
      <>
        {/* Backdrop */}
        <div
          onClick={() => setMobileMenuOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 998 }}
        />
        {/* Drawer panel */}
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            width: '100vw', maxWidth: '100vw', background: '#fff', zIndex: 999,
            overflowY: 'auto', WebkitOverflowScrolling: 'touch', display: 'flex', flexDirection: 'column',
          }}>
            {/* Top bar: X + Search left, Language pill right */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: `1px solid ${C.g100}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <X size={20} color={C.g700} />
                </button>
                <button
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Search size={20} color={C.g700} />
                </button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 12px', borderRadius: 99, border: `1px solid ${C.g200}`, background: C.g50 }}>
                <Globe size={13} color={C.g500} />
                <span style={{ fontSize: 12, fontWeight: 700, color: C.g700 }}>English</span>
              </div>
            </div>

            {/* Menu items */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {/* Main */}
              <Link to="/dashboard" onClick={() => setMobileMenuOpen(false)}
                style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', textDecoration: 'none', borderBottom: `1px solid ${C.g100}` }}>
                <Home size={18} color={C.g500} />
                <span style={{ fontSize: 14, fontWeight: 700, color: C.g800 }}>Main</span>
              </Link>

              {/* Trade — expandable */}
              <div>
                <button
                  onClick={() => setExpandedSections(p => ({ ...p, trade: !p.trade }))}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', background: 'none', border: 'none', borderBottom: `1px solid ${C.g100}`, cursor: 'pointer', textAlign: 'left' }}>
                  <TrendingUp size={18} color={C.g500} />
                  <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: C.g800 }}>Trade</span>
                  <ChevronDown size={16} color={C.g400} style={{ transform: expandedSections.trade ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                </button>
                {expandedSections.trade && (
                  <div style={{ background: C.g50 }}>
                    <Link to="/buy-bitcoin" onClick={() => setMobileMenuOpen(false)}
                      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px 12px 48px', textDecoration: 'none', borderBottom: `1px solid ${C.g100}` }}>
                      <ShoppingCart size={16} color={C.green} />
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: C.g800 }}>P2P Trading</span>
                          <span style={{ fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 99, background: '#DCFCE7', color: '#16A34A' }}>LOW FEES</span>
                        </div>
                        <p style={{ margin: '2px 0 0', fontSize: 11, color: C.g400 }}>Trade OTC bank and Mobile money</p>
                      </div>
                    </Link>
                    <Link to="/my-listings" onClick={() => setMobileMenuOpen(false)}
                      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px 12px 48px', textDecoration: 'none' }}>
                      <Tag size={16} color={C.gold} />
                      <div style={{ flex: 1 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: C.g800 }}>My offers</span>
                        <p style={{ margin: '2px 0 0', fontSize: 11, color: C.g400 }}>View your created offers</p>
                      </div>
                    </Link>
                  </div>
                )}
              </div>

              {/* Wallet — expandable */}
              <div>
                <button
                  onClick={() => setExpandedSections(p => ({ ...p, wallet: !p.wallet }))}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', background: 'none', border: 'none', borderBottom: `1px solid ${C.g100}`, cursor: 'pointer', textAlign: 'left' }}>
                  <Wallet size={18} color={C.g500} />
                  <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: C.g800 }}>Wallet</span>
                  <ChevronDown size={16} color={C.g400} style={{ transform: expandedSections.wallet ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                </button>
                {expandedSections.wallet && (
                  <div style={{ background: C.g50 }}>
                    <Link to="/wallet" onClick={() => setMobileMenuOpen(false)}
                      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px 12px 48px', textDecoration: 'none', margin: '4px 8px', borderRadius: 12, background: C.forest }}>
                      <div style={{ width: 32, height: 32, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Wallet size={15} color="#fff" />
                      </div>
                      <div style={{ flex: 1 }}>
                        <span style={{ fontSize: 13, fontWeight: 800, color: '#fff' }}>Assets</span>
                        <p style={{ margin: '2px 0 0', fontSize: 11, color: 'rgba(255,255,255,0.75)' }}>My assets in the PraQen wallet</p>
                      </div>
                    </Link>
                    <Link to="/swap" onClick={() => setMobileMenuOpen(false)}
                      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px 12px 48px', textDecoration: 'none', borderBottom: `1px solid ${C.g100}` }}>
                      <ArrowRightLeft size={16} color={C.purple} />
                      <div style={{ flex: 1 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: C.g800 }}>Swap</span>
                        <p style={{ margin: '2px 0 0', fontSize: 11, color: C.g400 }}>Exchange between your assets</p>
                      </div>
                    </Link>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px 12px 48px', opacity: 0.5 }}>
                      <CreditCard size={16} color={C.g400} />
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: C.g800 }}>Visa card</span>
                          <span style={{ fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 99, background: '#FEF3C7', color: '#92400E' }}>Coming soon</span>
                        </div>
                        <p style={{ margin: '2px 0 0', fontSize: 11, color: C.g400 }}>Spend crypto anywhere</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Partner program */}
              <Link to="/partner" onClick={() => setMobileMenuOpen(false)}
                style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', textDecoration: 'none', borderBottom: `1px solid ${C.g100}` }}>
                <Users size={18} color={C.g500} />
                <div>
                  <span style={{ fontSize: 14, fontWeight: 700, color: C.g800 }}>Partner program</span>
                  <p style={{ margin: '2px 0 0', fontSize: 11, color: C.g400 }}>Collaborate with us</p>
                </div>
              </Link>

              {/* Support — expandable */}
              <div>
                <button
                  onClick={() => setExpandedSections(p => ({ ...p, support: !p.support }))}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', background: 'none', border: 'none', borderBottom: `1px solid ${C.g100}`, cursor: 'pointer', textAlign: 'left' }}>
                  <HelpCircle size={18} color={C.g500} />
                  <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: C.g800 }}>Support</span>
                  <ChevronDown size={16} color={C.g400} style={{ transform: expandedSections.support ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                </button>
                {expandedSections.support && (
                  <div style={{ background: C.g50 }}>
                    <Link to="/faq" onClick={() => setMobileMenuOpen(false)}
                      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px 12px 48px', textDecoration: 'none', borderBottom: `1px solid ${C.g100}` }}>
                      <HelpCircle size={16} color={C.paid} />
                      <div style={{ flex: 1 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: C.g800 }}>Help center</span>
                        <p style={{ margin: '2px 0 0', fontSize: 11, color: C.g400 }}>Frequently asked questions</p>
                      </div>
                    </Link>
                    <a href="#" target="_blank" rel="noopener noreferrer"
                      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px 12px 48px', textDecoration: 'none' }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="#5865F2"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg>
                      <div style={{ flex: 1 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: C.g800 }}>Discord</span>
                        <p style={{ margin: '2px 0 0', fontSize: 11, color: C.g400 }}>Stay updated with PraQen</p>
                      </div>
                    </a>
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}