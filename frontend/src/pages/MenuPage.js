import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useRates } from '../contexts/RatesContext';
import {
  ArrowLeft, Search, Eye, EyeOff, Bell,
  User, Settings, Shield, LogOut, ChevronRight,
  QrCode, Lightbulb, CheckCircle,
  Wallet, TrendingUp,
} from 'lucide-react';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const C = {
  forest: '#1B4332', green: '#2D6A4F', mint: '#40916C',
  gold: '#F4A422', goldDark: '#D4891A', mist: '#F0FAF5',
  dark: '#0D1F14',
  g50: '#F8FAFC', g100: '#F1F5F9', g200: '#E2E8F0',
  g300: '#CBD5E1', g400: '#94A3B8', g500: '#64748B',
  g600: '#475569', g700: '#334155', g800: '#1E293B',
  purple: '#8B5CF6',
};

const CURRENCY_SYMBOLS = { USD: '$', GBP: '£', EUR: '€', GHS: '₵', NGN: '₦', KES: 'KSh', ZAR: 'R' };
const fmt = (n, d = 2) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: d }).format(n || 0);

// ── Verification limits config ─────────────────────────────────────────────
// TODO: Backend wiring — replace these placeholder values with real limits from the API.
// These should come from an endpoint like GET /users/limits or /verification/limits.
const LIMITS_BY_LEVEL = {
  0: { daily: '$500', buySell: '$200', send: '$100' },
  1: { daily: '$2,000', buySell: '$1,000', send: '$500' },
  2: { daily: '$10,000', buySell: '$5,000', send: '$2,500' },
  3: { daily: 'Unlimited', buySell: 'Unlimited', send: 'Unlimited' },
};

export default function MenuPage({ user }) {
  const navigate = useNavigate();
  const { btcUsd } = useRates();
  const [showBal, setShowBal] = useState(false);
  const [balanceUsd, setBalanceUsd] = useState(() =>
    parseFloat(localStorage.getItem('praqen_usd_balance') || 0)
  );
  const [unreadCount, setUnreadCount] = useState(0);

  const displayUser = user;

  // ── Verification level ──────────────────────────────────────────────────
  const emailOk = !!(displayUser?.is_email_verified || displayUser?.email_verified);
  const phoneOk = !!(displayUser?.is_phone_verified || displayUser?.phone_verified);
  const kycOk = !!(displayUser?.kyc_verified || displayUser?.is_id_verified);
  const verifSteps = [emailOk, phoneOk, kycOk].filter(Boolean).length;
  // Level: 0 = none, 1 = email, 2 = email+phone, 3 = all
  const verifLevel = kycOk ? 3 : phoneOk ? 2 : emailOk ? 1 : 0;
  const limits = LIMITS_BY_LEVEL[verifLevel];

  // ── Load balance ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const loadBalance = async () => {
      try {
        const tk = localStorage.getItem('token');
        if (!tk) return;
        const headers = { Authorization: `Bearer ${tk}` };
        const [btcRes, usdtRes] = await Promise.all([
          axios.get(`${API_URL}/hd-wallet/wallet`, { headers }).catch(() => ({ data: { available_btc: 0, locked_btc: 0, btc_price: 0 } })),
          axios.get(`${API_URL}/wallet/usdt`, { headers }).catch(() => ({ data: {} })),
        ]);
        const avail = parseFloat(btcRes.data?.available_btc ?? btcRes.data?.balance_btc ?? 0);
        const locked = parseFloat(btcRes.data?.locked_btc || 0);
        const btcPrice = parseFloat(btcRes.data?.btc_price || 0);
        const totalBtcUsd = btcPrice > 0 ? (avail + locked) * btcPrice : 0;
        const usdtAvail = parseFloat(usdtRes.data?.balance_usdt || 0);
        const usdtLocked = parseFloat(usdtRes.data?.locked_balance_usdt || 0);
        const totalUsdt = usdtAvail + usdtLocked;
        const combined = totalBtcUsd + totalUsdt;
        setBalanceUsd(combined);
        localStorage.setItem('praqen_usd_balance', combined.toString());
      } catch {}
    };
    loadBalance();
    const iv = setInterval(loadBalance, 30000);
    return () => clearInterval(iv);
  }, [user]);

  // ── Load unread notification count ──────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const tk = localStorage.getItem('token');
    if (!tk) return;
    axios.get(`${API_URL}/notifications/unread-count`, { headers: { Authorization: `Bearer ${tk}` } })
      .then(r => setUnreadCount(r.data?.count || 0))
      .catch(() => {});
  }, [user]);

  // ── Balance formatting ──────────────────────────────────────────────────
  const balDisplay = showBal ? `$${fmt(balanceUsd, 2)}` : '••••••';

  // ── Menu items ──────────────────────────────────────────────────────────
  const menuItems = [
    {
      icon: User,
      iconColor: C.green,
      title: 'Profile',
      subtitle: 'Your public profile',
      trailing: <QrCode size={18} color={C.g400} />,
      onClick: () => navigate(`/profile/${displayUser?.id}`),
    },
    {
      icon: TrendingUp,
      iconColor: C.forest,
      title: 'Trade Settings',
      subtitle: 'Trade history, partners, statistics',
      trailing: <ChevronRight size={18} color={C.g300} />,
      onClick: () => navigate('/trader-settings'),
    },
    {
      icon: Settings,
      iconColor: C.g500,
      title: 'Account settings',
      subtitle: 'Verification, notifications, security',
      trailing: <ChevronRight size={18} color={C.g300} />,
      onClick: () => navigate('/settings?tab=account'),
    },
    {
      icon: Lightbulb,
      iconColor: '#F59E0B',
      title: 'Submit an idea',
      subtitle: 'Improve PraQen with us',
      trailing: <ChevronRight size={18} color={C.g300} />,
      onClick: () => {
        // TODO: Navigate to a dedicated feedback/idea submission page if one is created.
        // For now, navigate to settings where the feedback section exists.
        navigate('/settings?tab=feedback');
      },
    },
  ];

  const handleLogout = () => {
    // The logout logic lives in App.js — dispatch an event that App listens to,
    // or navigate and let the user handle it. Since App's logout is passed via props
    // in Navbar but we don't have it here, we clear tokens directly and reload.
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.dispatchEvent(new Event('userUpdated'));
    navigate('/login');
  };

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: C.mist,
      fontFamily: "'DM Sans', sans-serif",
      paddingBottom: 'calc(60px + env(safe-area-inset-bottom, 0px))',
    }}>
      {/* ── Content ─────────────────────────────────────────────────────── */}
      <div style={{ maxWidth: 600, margin: '0 auto', padding: '12px 16px 24px' }}>

        {/* Back button */}
        <button
          onClick={() => navigate(-1)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'none', border: 'none', cursor: 'pointer',
            padding: '4px 0', marginBottom: 8,
            color: C.g500, fontSize: 13, fontWeight: 700,
          }}
        >
          <ArrowLeft size={16} />
          Back
        </button>

        {/* ── Menu List ─────────────────────────────────────────────────── */}
        <div style={{
          background: '#fff', borderRadius: 16,
          boxShadow: '0 1px 3px rgba(15,23,42,0.06), 0 4px 16px -4px rgba(15,23,42,0.08)',
          overflow: 'hidden', marginBottom: 16,
        }}>
          {menuItems.map((item, i) => (
            <button
              key={item.title}
              onClick={item.onClick}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 14,
                padding: '14px 18px', background: 'none', border: 'none',
                cursor: 'pointer', textAlign: 'left',
                borderBottom: i < menuItems.length - 1 ? `1px solid ${C.g100}` : 'none',
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = C.g50}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}
            >
              {/* Icon */}
              <div style={{
                width: 40, height: 40, borderRadius: 12,
                background: `${item.iconColor}10`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                <item.icon size={19} color={item.iconColor} />
              </div>

              {/* Text */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{
                  margin: 0, fontSize: 14.5, fontWeight: 800, color: C.g800,
                  lineHeight: 1.2,
                }}>
                  {item.title}
                </p>
                <p style={{
                  margin: '2px 0 0', fontSize: 12, fontWeight: 500,
                  color: C.g400, lineHeight: 1.3,
                }}>
                  {item.subtitle}
                </p>
              </div>

              {/* Trailing element */}
              <div style={{ flexShrink: 0 }}>
                {item.trailing}
              </div>
            </button>
          ))}
        </div>

        {/* ── Verification Limits Section ───────────────────────────────── */}
        <div style={{
          background: '#fff', borderRadius: 16,
          boxShadow: '0 1px 3px rgba(15,23,42,0.06), 0 4px 16px -4px rgba(15,23,42,0.08)',
          overflow: 'hidden', marginBottom: 16,
        }}>
          {/* Header */}
          <div style={{
            padding: '14px 18px',
            display: 'flex', alignItems: 'center', gap: 8,
            borderBottom: `1px solid ${C.g100}`,
          }}>
            <Shield size={18} color={C.forest} />
            <span style={{
              fontSize: 14.5, fontWeight: 800, color: C.g800,
              flex: 1,
            }}>
              Your limits: Level {verifLevel}
            </span>
            {verifLevel === 3 ? (
              <span style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '3px 10px', borderRadius: 99,
                background: '#ECFDF5', color: '#059669',
                fontSize: 11, fontWeight: 800,
              }}>
                <CheckCircle size={12} /> Verified
              </span>
            ) : (
              <span style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '3px 10px', borderRadius: 99,
                background: '#FEF3C7', color: '#92400E',
                fontSize: 11, fontWeight: 800,
              }}>
                {verifSteps}/3 steps
              </span>
            )}
          </div>

          {/* Limit rows */}
          {[
            { label: 'Daily', value: limits.daily },
            { label: 'Buy/Sell', value: limits.buySell },
            { label: 'Send', value: limits.send },
          ].map((row, i, arr) => (
            <div
              key={row.label}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '13px 18px',
                borderBottom: i < arr.length - 1 ? `1px solid ${C.g100}` : 'none',
              }}
            >
              <span style={{
                fontSize: 13.5, fontWeight: 600, color: C.g500,
              }}>
                {row.label}
              </span>
              <span style={{
                fontSize: 14, fontWeight: 800,
                color: row.value === 'Unlimited' ? '#059669' : C.g800,
              }}>
                {row.value}
              </span>
            </div>
          ))}
        </div>

        {/* ── Logout Button ─────────────────────────────────────────────── */}
        <button
          onClick={handleLogout}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 12,
            padding: '14px 18px', background: '#fff', border: 'none',
            borderRadius: 16, cursor: 'pointer',
            boxShadow: '0 1px 3px rgba(15,23,42,0.06)',
            transition: 'background 0.15s',
          }}
          onMouseEnter={e => e.currentTarget.style.background = '#FEF2F2'}
          onMouseLeave={e => e.currentTarget.style.background = '#fff'}
        >
          <div style={{
            width: 40, height: 40, borderRadius: 12,
            background: '#FEE2E2',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <LogOut size={19} color="#EF4444" />
          </div>
          <span style={{
            fontSize: 14.5, fontWeight: 800, color: '#DC2626',
          }}>
            Log out
          </span>
        </button>
      </div>
    </div>
  );
}
