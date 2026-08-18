import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { useRates } from '../contexts/RatesContext';
import Notifications from './Notifications';
import {
  Wallet, User, Settings, LogOut, ChevronDown,
  BarChart3, Gift, List, Eye, EyeOff, ShoppingCart, Tag, TrendingUp,
  Plus, LayoutDashboard,
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
    color: active ? activeColor : C.g500,
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
      <div style={{ position: 'relative' }}
        onMouseEnter={() => handleGuideEnter('nav_create_offer')} onMouseLeave={handleGuideLeave}>
        {activeGuide === 'nav_create_offer' && (
          <div style={{
            position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 10000,
            width: 'min(215px, calc(100vw - 24px))',
            maxWidth: 'calc(100vw - 24px)',
            background: 'linear-gradient(135deg, #1E40AF 0%, #2563EB 100%)',
            borderRadius: 12, padding: '8px 9px',
            boxShadow: '0 10px 36px rgba(37,99,235,0.35)', pointerEvents: 'none',
            color: '#fff', boxSizing: 'border-box',
          }}>
            <p style={{ margin: '0 0 2px', fontWeight: 800, fontSize: 10.5 }}>+ Create Offer</p>
            <p style={{ margin: 0, fontSize: 9.5, color: 'rgba(255,255,255,0.9)', lineHeight: 1.4 }}>
              Create a new P2P buy or sell offer to trade Bitcoin, USDT, or Gift Cards on your terms.
            </p>
          </div>
        )}
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
          <Link to="/" style={{ textDecoration: 'none', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 9 }}>
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
    <nav style={{
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
        /* Below ~380px the wallet pill's show/hide toggle and the avatar's chevron
           are the least essential pixels — drop them first so the bell never gets
           pushed off the edge of the screen. */
        @media (max-width: 380px) {
          .prq-bal-toggle { display: none !important; }
          .prq-avatar-chevron { display: none !important; }
        }
      `}</style>
      <div className="max-w-[1400px] mx-auto px-4 md:px-10">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 64, gap: 6 }}>

          {/* Logo */}
          <Link to="/" style={{ textDecoration: 'none', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
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

          {/* Right: Wallet (desktop) · Avatar · Bell */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>

            {/* Wallet — compact mobile pill. Balance text is never truncated. */}
            <div className="flex md:hidden items-center" style={{ background: C.mist, border: `1px solid #c8e6d4`, borderRadius: 8, overflow: 'hidden', flexShrink: 0 }}>
              <Link to="/wallet"
                style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '5px 6px', textDecoration: 'none' }}>
                <Wallet size={11} color={C.forest} style={{ flexShrink: 0 }} />
                <span style={{ fontSize: 10.5, fontWeight: 900, color: C.forest, whiteSpace: 'nowrap' }}>
                  {showBal ? `${localCode} ${sym}${fmt(totalLocal, 2)}` : '•••'}
                </span>
              </Link>
              <button
                onClick={() => setShowBal(!showBal)}
                className="prq-bal-toggle"
                style={{ background: 'none', border: 'none', borderLeft: `1px solid #c8e6d4`, cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '5px 4px', flexShrink: 0 }}>
                {showBal ? <Eye size={10} color={C.green} /> : <EyeOff size={10} color={C.g400} />}
              </button>
            </div>

            {/* Wallet balance pill — desktop only */}
            <div className="hidden md:flex items-center"
              style={{ gap: 6, borderRadius: 8, padding: '6px 10px', flexShrink: 0 }}>
              <button onClick={() => setShowBal(!showBal)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 0, flexShrink: 0 }}
                title={showBal ? 'Hide balance' : 'Show balance'}>
                {showBal
                  ? <Eye size={14} color={C.g400} />
                  : <EyeOff size={14} color={C.g400} />}
              </button>
              <Link to="/wallet" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0, whiteSpace: 'nowrap' }}>
                <Wallet size={13} color={C.g500} style={{ flexShrink: 0 }} />
                <span style={{ fontSize: 13, fontWeight: 800, color: C.g700, whiteSpace: 'nowrap' }}>
                  {showBal ? `${localCode} ${sym}${fmt(totalLocal, 2)}` : '••••••'}
                </span>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: C.mint, display: 'inline-block', animation: 'prqPulseDot 2s ease-in-out infinite', flexShrink: 0 }} />
              </Link>
            </div>

            {/* Divider */}
            <div className="hidden md:block" style={{ width: 1, height: 24, background: C.g200 }} />

            {/* Avatar + dropdown — flexShrink:0 so it's never squeezed out on narrow phones */}
            <div style={{ position: 'relative', flexShrink: 0 }} ref={dropRef}>
              <button
                onClick={() => setProfileDrop(!profileDrop)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  background: C.g100, border: `1px solid ${C.g200}`,
                  borderRadius: 10, padding: '5px 7px 5px 5px',
                  cursor: 'pointer', transition: 'all 0.2s',
                }}>
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <div style={{
                    width: 30, height: 30, borderRadius: 8, overflow: 'hidden',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 900, fontSize: 13, color: '#fff',
                    background: `linear-gradient(135deg, ${C.gold}, #FBBF24)`,
                  }}>
                    {displayUser?.avatar_url
                      ? <img src={displayUser.avatar_url} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <span style={{ color: C.dark }}>{displayUser?.username?.charAt(0)?.toUpperCase() || 'U'}</span>}
                  </div>
                  {/* Online status dot — you're viewing this navbar, so the heartbeat is live */}
                  <span style={{
                    position: 'absolute', bottom: -2, right: -2, width: 9, height: 9,
                    borderRadius: '50%', background: '#22C55E', border: '2px solid #fff',
                  }} />
                </div>
                <span className="hidden md:block" style={{ fontSize: 13, fontWeight: 800, color: C.g800, maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {displayUser?.username || 'User'}
                </span>
                <ChevronDown size={13} color={C.g400} className="prq-avatar-chevron"
                  style={{ transform: profileDrop ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
              </button>

              {/* Dropdown */}
              {profileDrop && (
                <div className="prq-dropdown" style={{
                  position: 'absolute', top: 'calc(100% + 8px)', right: 0,
                  transformOrigin: 'top right',
                  width: 240, background: '#fff', borderRadius: 16,
                  boxShadow: '0 20px 60px rgba(0,0,0,0.18)', border: `1px solid ${C.g100}`,
                  overflow: 'hidden', zIndex: 50,
                }}>
                  {/* User header */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: `1px solid ${C.g100}`, background: C.mist }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: 10, overflow: 'hidden', flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontWeight: 900, fontSize: 14,
                      background: `linear-gradient(135deg, ${C.gold}, #FBBF24)`,
                    }}>
                      {displayUser?.avatar_url
                        ? <img src={displayUser.avatar_url} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : <span style={{ color: C.dark }}>{displayUser?.username?.charAt(0)?.toUpperCase() || 'U'}</span>}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ margin: 0, fontWeight: 900, fontSize: 13, color: C.forest, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {displayUser?.username || 'User'}
                      </p>
                      <p style={{ margin: 0, fontSize: 11, fontWeight: 600, color: C.g400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {displayUser?.email || ''}
                      </p>
                    </div>
                  </div>

                  {/* P2P Trade row */}
                  <Link to="/buy-bitcoin" onClick={() => setProfileDrop(false)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '10px 16px', textDecoration: 'none',
                      borderBottom: `1px solid ${C.g100}`,
                      background: isMarketActive ? C.mist : '#fff',
                    }}>
                    <TrendingUp size={14} color={isMarketActive ? C.forest : C.green} />
                    <span style={{ fontSize: 13, fontWeight: 800, color: isMarketActive ? C.forest : C.g800 }}>P2P Trade</span>
                  </Link>

                  {/* Nav links */}
                  <div style={{ padding: '6px 0' }}>
                    {[
                      { to: '/profile',     icon: User,     label: 'Your Profile',  color: C.green },
                      { to: '/my-trades',   icon: List,     label: 'My Trades',     color: C.green },
                      { to: '/my-listings', icon: BarChart3, label: 'My Offers',    color: C.green },
                      { to: '/gift-cards',  icon: Gift,     label: 'Gift Cards',    color: C.purple },
                      { to: '/settings',    icon: Settings, label: 'Settings',      color: C.green },
                    ].map(({ to, icon: Icon, label, color }) => (
                      <Link key={to} to={to} onClick={() => setProfileDrop(false)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: '9px 16px', textDecoration: 'none',
                          background: isActive(to) ? C.mist : '#fff',
                          transition: 'background 0.15s',
                        }}
                        onMouseEnter={e => { if (!isActive(to)) e.currentTarget.style.background = C.g100; }}
                        onMouseLeave={e => { if (!isActive(to)) e.currentTarget.style.background = '#fff'; }}>
                        <Icon size={14} color={isActive(to) ? C.forest : color} style={{ flexShrink: 0 }} />
                        <span style={{ fontSize: 13, fontWeight: 800, color: isActive(to) ? C.forest : C.g800 }}>{label}</span>
                      </Link>
                    ))}
                  </div>

                  <div style={{ borderTop: `1px solid ${C.g100}`, margin: '2px 12px' }} />
                  <button onClick={() => { setProfileDrop(false); handleLogout(); }}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 16px', background: 'none', border: 'none',
                      cursor: 'pointer', textAlign: 'left', marginBottom: 4,
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = '#FEF2F2'}
                    onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                    <LogOut size={14} color="#EF4444" style={{ flexShrink: 0 }} />
                    <span style={{ fontSize: 13, fontWeight: 800, color: '#DC2626' }}>Log out</span>
                  </button>
                </div>
              )}
            </div>

            {/* Notifications */}
            <Notifications user={displayUser} />
          </div>
        </div>
      </div>
      <div style={{ height: 2, background: `linear-gradient(90deg, ${C.forest}, ${C.mint}, ${C.gold})`, opacity: 0.6 }} />
    </nav>
  );
}
