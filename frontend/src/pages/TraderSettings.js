import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import axios from 'axios';
import {
  BarChart3, Tag, CreditCard, Users, Award, Settings, ArrowLeft,
  TrendingUp, Clock, CheckCircle, XCircle, AlertTriangle, ChevronRight,
  ChevronDown, Filter, Download, Search, Globe, Banknote, ShoppingCart,
  Gift, Activity, Zap, User, ArrowUpDown, Calendar, X,
  ThumbsUp, Copy, FileSpreadsheet, FileText,
} from 'lucide-react';
import { getStatusStyle } from '../components/Notifications';
import { fmtEarnedDate, medalMetaText } from '../lib/medals';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const C = {
  forest: '#1B4332', green: '#2D6A4F', mint: '#40916C', sage: '#52B788',
  gold: '#F4A422', amber: '#F59E0B', mist: '#F0FAF5', white: '#FFFFFF',
  g50: '#F8FAFC', g100: '#F1F5F9', g200: '#E2E8F0',
  g400: '#94A3B8', g500: '#64748B', g600: '#475569', g700: '#334155', g800: '#1E293B',
  success: '#10B981', danger: '#EF4444', warn: '#F59E0B', paid: '#3B82F6',
  online: '#22C55E', purple: '#8B5CF6',
};

const authH = () => { const t = localStorage.getItem('token'); return t ? { Authorization: `Bearer ${t}` } : {}; };
const fmt = (n, d = 0) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: d }).format(n || 0);
const fmtBtc = n => parseFloat(n || 0).toFixed(8);
const fmtAge = d => {
  if (!d) return '—';
  const s = (Date.now() - new Date(d)) / 1000;
  if (s < 60) return 'Just now';
  if (s < 3600) return `${~~(s / 60)}m ago`;
  if (s < 86400) return `${~~(s / 3600)}h ago`;
  return `${~~(s / 86400)}d ago`;
};
const codeToFlag = code => {
  if (!code || code.length !== 2) return null;
  const cc = code.toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return null;
  return String.fromCodePoint(...[...cc].map(c => 127397 + c.charCodeAt(0)));
};
const flag = code => codeToFlag(code) || '';
function CountryBadge({ code }) {
  const emoji = codeToFlag(code);
  const c = (code || '').toUpperCase();
  const ok = /^[A-Z]{2}$/.test(c);
  return (
    <span className="inline-flex items-center align-middle mr-0.5"
      style={{ fontSize: 13, lineHeight: 1 }}>
      {emoji || (ok ? c : <Globe size={9} style={{ display: 'block', color: C.g400 }} />)}
    </span>
  );
}
const SYM = { GHS: '', NGN: '₦', KES: 'KSh', ZAR: 'R', UGX: 'USh', USD: '$', GBP: '£', EUR: '€' };
const COUNTRY_FOR_CURRENCY = { GHS: 'GH', NGN: 'NG', KES: 'KE', ZAR: 'ZA', UGX: 'UG', USD: 'US', GBP: 'GB', EUR: 'EU' };

const tradeTypeOf = t => {
  const lt = (t.listing_type || t.listing?.listing_type || '').toUpperCase();
  if (lt.includes('GIFT')) return 'gift';
  return 'btc';
};

// Status helpers (from MyTrades.js)
const STATUS_MAP = {
  CREATED: { label: 'Escrow Active', short: 'Escrow', color: C.green, bg: `${C.green}15` },
  FUNDS_LOCKED: { label: 'Escrow Active', short: 'Escrow', color: C.green, bg: `${C.green}15` },
  PAYMENT_SENT: { label: 'Payment Sent', short: 'Paid', color: C.paid, bg: `${C.paid}15` },
  PAID: { label: 'Payment Sent', short: 'Paid', color: C.paid, bg: `${C.paid}15` },
  COMPLETED: { label: 'Completed', short: 'Released', color: C.success, bg: `${C.success}15` },
  CANCELLED: { label: 'Cancelled', short: 'Cancelled', color: C.g500, bg: C.g100 },
  EXPIRED: { label: 'Expired', short: 'Expired', color: C.g500, bg: C.g100 },
  DISPUTED: { label: 'Disputed', short: 'Dispute', color: C.danger, bg: `${C.danger}15` },
};
const EXPIRY_REASON_RE = /expir|time limit|payment window/i;
const getStatus = (s, cancelReason) => {
  const key = s?.toUpperCase();
  if (key === 'CANCELLED' && EXPIRY_REASON_RE.test(cancelReason || '')) return STATUS_MAP.EXPIRED;
  return STATUS_MAP[key] || STATUS_MAP.CREATED;
};
const isActiveTrade = s => ['CREATED', 'FUNDS_LOCKED', 'PAYMENT_SENT', 'PAID', 'DISPUTED'].includes((s || '').toUpperCase());

// ── Sidebar items ──────────────────────────────────────────────────────
const SIDEBAR_ITEMS = [
  { id: 'trade-insights', label: 'Trade insights', icon: BarChart3 },
  { id: 'p2p-offers', label: 'P2P offers', icon: Tag },
  { id: 'trade-statistics', label: 'Trade statistics', icon: TrendingUp },
  { id: 'payment-accounts', label: 'Payment accounts', icon: CreditCard },
  { id: 'traders', label: 'Traders', icon: Users },
  { id: 'badges', label: 'Badges & Medals', icon: Award },
  { id: 'account-settings', label: 'Account settings', icon: Settings },
];

// ── Supported currencies for filter ───────────────────────────────────
const CRYPTO_CURRENCIES = ['All', 'USDT', 'BTC', 'ETH', 'USDC', 'BCH', 'BNB', 'LTC', 'SOL'];
const TRADE_TYPES = ['All', 'Buy', 'Sell'];
const TRADE_STATUSES = ['All', 'Completed', 'Cancelled', 'Disputed', 'Expired'];
const DATE_OPTIONS = ['All time', 'Today', 'This week', 'This month', 'This year'];

// ── Filter Dropdown Component ──────────────────────────────────────────
function FilterDropdown({ label, options, selected, onChange, multi = false }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const displayLabel = multi
    ? (selected.length > 0 && selected.length < options.length ? `${selected.length} selected` : `${label}: All`)
    : `${label}: ${selected || 'All'}`;

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '9px 11px', borderRadius: 10, border: 'none',
          background: '#F3F4F4', cursor: 'pointer', fontSize: 13, fontWeight: 700,
          color: C.g700, whiteSpace: 'nowrap',
        }}>
        {displayLabel}
        <ChevronDown size={14} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s', color: C.g700 }} />
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 100,
          minWidth: 160, background: '#fff', borderRadius: 12,
          boxShadow: '0 10px 40px rgba(0,0,0,0.12)', border: `1px solid ${C.g100}`,
          padding: '6px 0', maxHeight: 240, overflowY: 'auto',
        }}>
          {options.map(opt => {
            const isActive = multi ? (selected || []).includes(opt) : selected === opt;
            return (
              <button key={opt} onClick={() => {
                if (multi) {
                  const next = (selected || []).includes(opt) ? selected.filter(s => s !== opt) : [...(selected || []), opt];
                  onChange(next);
                } else {
                  onChange(opt);
                  setOpen(false);
                }
              }}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 14px', background: isActive ? `${C.green}10` : 'transparent',
                  border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                  color: isActive ? C.green : C.g700, textAlign: 'left',
                }}>
                {multi && (
                  <span style={{
                    width: 16, height: 16, borderRadius: 4, border: `2px solid ${isActive ? C.green : C.g300}`,
                    background: isActive ? C.green : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    {isActive && <CheckCircle size={10} color="#fff" />}
                  </span>
                )}
                {!multi && isActive && <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.green, flexShrink: 0 }} />}
                {opt}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Export Dropdown Component ────────────────────────────────────────
function ExportDropdown({ onExport, compact = false }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const options = [
    { id: 'csv', label: 'Export as CSV', icon: FileSpreadsheet },
    { id: 'pdf', label: 'Export as PDF', icon: FileText },
  ];

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: compact ? '7px 14px' : '8px 14px', borderRadius: 10, border: `1px solid ${C.g200}`,
          background: '#fff', cursor: 'pointer', fontSize: compact ? 12 : 13, fontWeight: 700,
          color: C.g700, whiteSpace: 'nowrap', width: 'fit-content',
        }}>
        <Download size={compact ? 12 : 13} />
        Export
        <ChevronDown size={compact ? 12 : 13} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', right: 0, zIndex: 100,
          minWidth: 160, background: '#fff', borderRadius: 12,
          boxShadow: '0 10px 40px rgba(0,0,0,0.12)', border: `1px solid ${C.g100}`,
          padding: '6px 0',
        }}>
          {options.map(o => (
            <button key={o.id} onClick={() => { onExport(o.id); setOpen(false); }}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 14px', background: 'transparent',
                border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                color: C.g700, textAlign: 'left',
              }}>
              <o.icon size={14} style={{ color: C.green, flexShrink: 0 }} />
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Trade Row Component ────────────────────────────────────────────────
function TradeRow({ trade, userId }) {
  const navigate = useNavigate();
  const isBuyer = String(userId) === String(trade.buyer_id);
  const st = getStatus(trade.status, trade.cancel_reason);
  const cp = isBuyer ? trade.seller : trade.buyer;
  const isGift = tradeTypeOf(trade) === 'gift';
  const typeColor = isGift ? C.purple : isBuyer ? C.amber : C.green;
  const cur = trade.local_currency || trade.currency || trade.listing?.currency || '';
  const cpCountry = cp?.country || trade.listing?.country || COUNTRY_FOR_CURRENCY[cur?.toUpperCase()] || '';
  const sym = SYM[cur] || '';
  const localAmt = parseFloat(trade.amount_local || 0);
  const btcAmt = parseFloat(trade.amount_btc || 0);
  // Exchange rate: local currency per 1 BTC (derived from the trade)
  const rate = btcAmt > 0 ? localAmt / btcAmt : 0;
  const localDisplay = (amt) => `${fmt(amt)} ${cur || 'USD'}`;

  // Buyer/seller display logic
  const payLabel = isBuyer ? 'Pay' : 'Receive';
  const receiveLabel = isBuyer ? 'Receive' : 'Pay';
  const payValue = isBuyer
    ? localDisplay(localAmt)
    : localDisplay(btcAmt * rate || localAmt);
  const receiveValue = isBuyer
    ? localDisplay(btcAmt * 0.995 * rate || localAmt * 0.995)
    : localDisplay(localAmt);
  const feedbackTotal = Number(cp?.positive_feedback || 0) + Number(cp?.negative_feedback || 0);
  const rawRating = Number(cp?.success_rate ?? cp?.positive_feedback_percent ?? cp?.average_rating);
  const successRate = rawRating
    ? Math.round(rawRating <= 5 ? rawRating * 20 : rawRating)
    : (feedbackTotal ? Math.round((Number(cp?.positive_feedback || 0) / feedbackTotal) * 100) : 100);

  return (
    <div
      className="ts-trade-row"
      onClick={() => navigate(`/trade/${trade.id}`)}
      style={{
        display: 'grid', gridTemplateColumns: 'minmax(190px,1.2fr) minmax(145px,0.78fr) minmax(190px,0.9fr) minmax(165px,0.8fr) 20px', alignItems: 'center', gap: 16,
        padding: '16px 32px', borderBottom: `1px solid ${C.g100}`,
        cursor: 'pointer', transition: 'background 0.15s',
      }}
      onMouseEnter={e => e.currentTarget.style.background = C.g50}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      {/* Trader avatar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
        <div style={{
        width: 36, height: 36, borderRadius: '50%', overflow: 'hidden', flexShrink: 0,
        background: `linear-gradient(135deg, ${C.gold}, #FBBF24)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 13, fontWeight: 900, color: C.g800,
        }}>
        {cp?.avatar_url
          ? <img src={cp.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <span>{cp?.username?.charAt(0)?.toUpperCase() || '?'}</span>}
        </div>

        {/* Trader info */}
        <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
          <span style={{ fontSize: 16, fontWeight: 600, color: C.g800, textDecoration: 'underline', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {cp?.username || '—'}
          </span>
          <CountryBadge code={cpCountry} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 800, color: C.g500 }}>
          <ThumbsUp size={15} strokeWidth={2} />
          {successRate}%
          <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: '50%', background: C.g500, marginLeft: 4 }} />
        </div>
        </div>
      </div>

      {/* Status */}
      <div>
        <div style={{ fontSize: 12, color: C.g500, marginBottom: 6 }}>
          {isActiveTrade(trade.status) ? 'Active' : `${st.label} ${fmtAge(trade.completed_at || trade.created_at)}`}
        </div>
        <span style={{ fontSize: 11, fontWeight: 800, color: st.color, background: st.bg, padding: '3px 7px', borderRadius: 4 }}>
          {isActiveTrade(trade.status) ? 'Active' : st.short}
        </span>
      </div>

      {/* Receive */}
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.g600, marginBottom: 6 }}>
          {receiveLabel} <span style={{ textDecoration: 'underline' }}>{trade.payment_method || 'payment'}</span>
        </div>
        <div style={{ fontSize: 16, fontWeight: 800, color: C.g800 }}>{receiveValue}</div>
      </div>

      {/* Pay */}
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.g600, marginBottom: 6 }}>{payLabel} ({isGift ? 'Gift card' : 'BTC'})</div>
        <div style={{ fontSize: 16, fontWeight: 800, color: C.g800 }}>{payValue}</div>
      </div>

      <ChevronRight size={16} style={{ color: C.g300, flexShrink: 0 }} />
    </div>
  );
}

// ── Mobile Trade Row (NoOnes style) ─────────────────────────────────
function TradeRowMobile({ trade, userId }) {
  const navigate = useNavigate();
  const isBuyer = String(userId) === String(trade.buyer_id);
  const st = getStatus(trade.status, trade.cancel_reason);
  const cp = isBuyer ? trade.seller : trade.buyer;
  const isGift = tradeTypeOf(trade) === 'gift';
  const cur = trade.local_currency || trade.currency || trade.listing?.currency || '';
  const cpCountry = cp?.country || trade.listing?.country || COUNTRY_FOR_CURRENCY[cur?.toUpperCase()] || '';
  const sym = SYM[cur] || '';
  const localAmt = parseFloat(trade.amount_local || 0);
  const btcAmt = parseFloat(trade.amount_btc || 0);
  // Exchange rate: local currency per 1 BTC (derived from the trade itself)
  const rate = btcAmt > 0 ? localAmt / btcAmt : 0;
  // Both sides display in local currency — BTC amounts converted via the trade rate
  const btcToLocal = b => rate > 0 ? fmt(b * rate, 2) : fmtBtc(b);
  const localDisplay = (amt) => `${fmt(amt)} ${cur || 'USD'}`;

  const payLabel = isBuyer ? 'Pay' : 'Receive';
  const receiveLabel = isBuyer ? 'Receive' : 'Pay';
  const payValue = isBuyer
    ? localDisplay(localAmt)
    : localDisplay(btcAmt * rate || localAmt);
  const receiveValue = isBuyer
    ? localDisplay(btcAmt * 0.995 * rate || localAmt * 0.995)
    : localDisplay(localAmt);
  const feedbackTotal = Number(cp?.positive_feedback || 0) + Number(cp?.negative_feedback || 0);
  const rawRating = Number(cp?.success_rate ?? cp?.positive_feedback_percent ?? cp?.average_rating);
  const successRate = rawRating
    ? Math.round(rawRating <= 5 ? rawRating * 20 : rawRating)
    : (feedbackTotal ? Math.round((Number(cp?.positive_feedback || 0) / feedbackTotal) * 100) : 100);

  const tradeRefShort = String(trade.trade_ref || trade.id || '').slice(0, 10);
  const offerRefShort = String(trade.listing?.id || trade.listing_id || '').slice(0, 10);
  const [copiedField, setCopiedField] = React.useState(null);
  const handleCopy = (text, field) => {
    if (!text) return;
    navigator.clipboard?.writeText(text).catch(() => {});
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 1500);
  };

  return (
    <div
      className="ts-trade-row-mobile"
      onClick={() => navigate(`/trade/${trade.id}`)}
      style={{
        background: '#fff', borderRadius: 14, border: `1px solid ${C.g200}`,
        marginBottom: 10, overflow: 'hidden', cursor: 'pointer',
        transition: 'box-shadow 0.15s',
      }}
    >
      {/* Row 1: Avatar + flag + username + badge + status */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '14px 14px 0', gap: 10 }}>
        <div style={{
          width: 38, height: 38, borderRadius: '50%', overflow: 'hidden', flexShrink: 0,
          background: `linear-gradient(135deg, ${C.gold}, #FBBF24)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14, fontWeight: 900, color: C.g800,
        }}>
          {cp?.avatar_url
            ? <img src={cp.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <span>{cp?.username?.charAt(0)?.toUpperCase() || '?'}</span>}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ fontSize: 15, fontWeight: 800, color: C.g800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {cp?.username || '—'}
            </span>
            <CountryBadge code={cpCountry} />
            {cp?.badge && (
              <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 16, height: 16, borderRadius: '50%', background: C.green, flexShrink: 0 }}>
                <CheckCircle size={10} color="#fff" strokeWidth={3} />
              </span>
            )}
          </div>
        </div>
        <span style={{
          fontSize: 11, fontWeight: 800, color: st.color, background: st.bg,
          padding: '3px 9px', borderRadius: 6, flexShrink: 0, letterSpacing: 0.2,
        }}>
          {isActiveTrade(trade.status) ? 'Active' : st.short}
        </span>
      </div>

      {/* Row 2: Like% + Seen */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px 0', fontSize: 12 }}>
        <ThumbsUp size={13} strokeWidth={2.2} style={{ color: C.g400 }} />
        <span style={{ fontWeight: 700, color: C.g700 }}>{successRate}%</span>
        <span style={{ color: C.g300, fontWeight: 400 }}>·</span>
        <span style={{ fontWeight: 600, color: C.g500 }}>Seen {fmtAge(cp?.last_seen_at || trade.created_at)}</span>
      </div>

      {/* Row 3: Receive / Pay amounts */}
      <div style={{ display: 'flex', padding: '12px 14px 0', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.g600, marginBottom: 4 }}>
            {receiveLabel} <span style={{ textDecoration: 'underline', textUnderlineOffset: 2 }}>{trade.payment_method || 'payment'}</span>
          </div>
          <div style={{ fontSize: 17, fontWeight: 900, color: C.g800, lineHeight: 1.2 }}>{receiveValue}</div>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.g600, marginBottom: 4 }}>
            {payLabel} (<span style={{ textDecoration: 'underline', textUnderlineOffset: 2 }}>{isGift ? 'Gift card' : 'BTC'}</span>)
          </div>
          <div style={{ fontSize: 17, fontWeight: 900, color: C.g800, lineHeight: 1.2 }}>{payValue}</div>
        </div>
      </div>

      {/* Row 4: Completed / Active status */}
      <div style={{
        margin: '12px 14px 0', background: C.g50, borderRadius: 10,
        padding: '10px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Clock size={13} style={{ color: C.g400, flexShrink: 0 }} />
          <span style={{ fontSize: 13, color: C.g500 }}>
            <span style={{ fontWeight: 700, color: C.g700 }}>
              {isActiveTrade(trade.status) ? 'Active' : 'Completed'}
            </span>
            {!isActiveTrade(trade.status) && (
              <span style={{ fontWeight: 600, marginLeft: 4 }}>{fmtAge(trade.completed_at || trade.created_at)}</span>
            )}
          </span>
        </div>
        <ChevronRight size={16} style={{ color: C.g400, flexShrink: 0 }} />
      </div>

      {/* Row 5: Trade ID + Offer ID with copy */}
      <div style={{ display: 'flex', padding: '12px 14px 14px', gap: 16, borderTop: `1px solid ${C.g100}`, marginTop: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: C.g400 }}>Trade</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: C.g600, textDecoration: 'underline', textUnderlineOffset: 2 }}>{tradeRefShort || '—'}</span>
          <button onClick={e => { e.stopPropagation(); handleCopy(trade.id, 'trade'); }} style={{ background: 'none', border: 'none', padding: 2, cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
            {copiedField === 'trade' ? <CheckCircle size={12} style={{ color: C.success }} /> : <Copy size={12} style={{ color: C.g400 }} />}
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: C.g400 }}>Offer</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: C.g600, textDecoration: 'underline', textUnderlineOffset: 2 }}>{offerRefShort || '—'}</span>
          <button onClick={e => { e.stopPropagation(); handleCopy(trade.listing?.id || trade.listing_id, 'offer'); }} style={{ background: 'none', border: 'none', padding: 2, cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
            {copiedField === 'offer' ? <CheckCircle size={12} style={{ color: C.success }} /> : <Copy size={12} style={{ color: C.g400 }} />}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Empty State ────────────────────────────────────────────────────────
function EmptyState({ type }) {
  const navigate = useNavigate();
  return (
    <div style={{ textAlign: 'center', padding: '48px 24px' }}>
      <div style={{
        width: 64, height: 64, borderRadius: 20, background: `${C.green}10`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px',
      }}>
        <Activity size={28} style={{ color: C.green }} />
      </div>
      <h3 style={{ fontSize: 16, fontWeight: 800, color: C.g800, margin: '0 0 6px' }}>
        {type === 'active' ? 'No active trades' : 'No trade history'}
      </h3>
      <p style={{ fontSize: 13, color: C.g500, margin: '0 0 20px', maxWidth: 280, marginInline: 'auto' }}>
        {type === 'active'
          ? 'Your active trades will appear here once you start trading'
          : 'Your completed trades will appear here'}
      </p>
      {type === 'active' && (
        <button
          onClick={() => navigate('/buy-bitcoin')}
          style={{
            padding: '10px 24px', borderRadius: 12, background: C.green, color: '#fff',
            border: 'none', fontSize: 13, fontWeight: 800, cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}>
          <Zap size={14} /> Trade now
        </button>
      )}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────
export default function TraderSettings({ user }) {
  const navigate = useNavigate();
  const location = useLocation();

  // Parse sidebar tab from URL
  const urlParams = new URLSearchParams(location.search);
  const initialTab = urlParams.get('section') || 'trade-insights';
  const [activeSection, setActiveSection] = useState(initialTab);

  // Trade insights state
  const [activeTab, setActiveTab] = useState('history');
  const [trades, setTrades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // Filter state
  const [currencyFilter, setCurrencyFilter] = useState('All');
  const [typeFilter, setTypeFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [dateFilter, setDateFilter] = useState('All time');
  const [paymentMethodFilter, setPaymentMethodFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');

  // Mobile sidebar
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Unique payment methods from trades
  const [paymentMethods, setPaymentMethods] = useState(['All']);

  // Load trades
  const loadTrades = useCallback(async (reset = true) => {
    if (reset) setLoading(true);
    try {
      const p = reset ? 1 : page + 1;
      const params = new URLSearchParams({ page: String(p), limit: '50' });
      if (searchQuery.trim()) params.set('search', searchQuery.trim());
      const r = await axios.get(`${API_URL}/my-trades?${params.toString()}`, { headers: authH() });
      const data = r.data.trades || [];
      const total = r.data.total || 0;

      // Extract unique payment methods
      if (reset) {
        const methods = new Set(['All']);
        data.forEach(t => { if (t.payment_method) methods.add(t.payment_method); });
        setPaymentMethods([...methods]);
      }

      setTrades(prev => reset ? data : [...prev, ...data]);
      setPage(p);
      setHasMore(p * 50 < total);
    } catch (e) {
      console.error('Failed to load trades', e);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [page, searchQuery]);

  useEffect(() => {
    if (user) loadTrades(true);
  }, [user?.id]); // eslint-disable-line

  // Update URL when section changes
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    params.set('section', activeSection);
    navigate(`${location.pathname}?${params.toString()}`, { replace: true });
  }, [activeSection]); // eslint-disable-line

  // Filter trades
  const filteredTrades = trades.filter(t => {
    // Active vs History
    if (activeTab === 'active' && !isActiveTrade(t.status)) return false;
    if (activeTab === 'history' && isActiveTrade(t.status)) return false;

    // Currency filter
    if (currencyFilter !== 'All') {
      const tCur = (t.local_currency || t.currency || '').toUpperCase();
      if (tCur !== currencyFilter) return false;
    }

    // Type filter
    if (typeFilter !== 'All') {
      const isBuyer = String(user?.id) === String(t.buyer_id);
      if (typeFilter === 'Buy' && !isBuyer) return false;
      if (typeFilter === 'Sell' && isBuyer) return false;
    }

    // Status filter (history only)
    if (statusFilter !== 'All' && activeTab === 'history') {
      const st = getStatus(t.status, t.cancel_reason);
      if (statusFilter === 'Completed' && t.status !== 'COMPLETED') return false;
      if (statusFilter === 'Cancelled' && st !== STATUS_MAP.CANCELLED) return false;
      if (statusFilter === 'Disputed' && t.status !== 'DISPUTED') return false;
      if (statusFilter === 'Expired' && st !== STATUS_MAP.EXPIRED) return false;
    }

    // Payment method filter
    if (paymentMethodFilter !== 'All') {
      if (t.payment_method !== paymentMethodFilter) return false;
    }

    // Date filter
    if (dateFilter !== 'All time') {
      const now = new Date();
      const created = new Date(t.created_at);
      if (dateFilter === 'Today') {
        if (created.toDateString() !== now.toDateString()) return false;
      } else if (dateFilter === 'This week') {
        const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
        if (created < weekAgo) return false;
      } else if (dateFilter === 'This month') {
        if (created.getMonth() !== now.getMonth() || created.getFullYear() !== now.getFullYear()) return false;
      } else if (dateFilter === 'This year') {
        if (created.getFullYear() !== now.getFullYear()) return false;
      }
    }

    return true;
  });

  // Export helpers (shared by CSV & PDF)
  const EXPORT_HEADERS = ['ID', 'Status', 'Type', 'Payment Method', 'Amount BTC', 'Amount Local', 'Currency', 'Created At', 'Counterparty'];
  const buildExportRows = () => filteredTrades.map(t => {
    const isBuyer = String(user?.id) === String(t.buyer_id);
    const cp = isBuyer ? t.seller : t.buyer;
    return [
      String(t.id).slice(0, 8).toUpperCase(),
      t.status,
      isBuyer ? 'Buy' : 'Sell',
      t.payment_method || '',
      fmtBtc(t.amount_btc),
      t.amount_local || '',
      t.local_currency || t.currency || '',
      t.created_at || '',
      cp?.username || '',
    ];
  });

  // Export to CSV
  const handleExportCSV = () => {
    if (!filteredTrades.length) return;
    const rows = buildExportRows();
    const csv = [EXPORT_HEADERS, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `praqen-trades-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Export to PDF
  const handleExportPDF = () => {
    if (!filteredTrades.length) return;
    const rows = buildExportRows();
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(30, 41, 59);
    doc.text('PraQen Trade History', 40, 40);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text(`Exported ${new Date().toLocaleString()} · ${rows.length} trade${rows.length === 1 ? '' : 's'}`, 40, 56);
    autoTable(doc, {
      head: [EXPORT_HEADERS],
      body: rows,
      startY: 70,
      styles: { font: 'helvetica', fontSize: 8, cellPadding: 4, textColor: [51, 65, 85] },
      headStyles: { fillColor: [27, 67, 50], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [240, 250, 245] },
      margin: { left: 40, right: 40 },
    });
    doc.save(`praqen-trades-${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  const handleExport = format => {
    if (format === 'pdf') handleExportPDF();
    else handleExportCSV();
  };

  // ── Render ──────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: C.mist, fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`
        .ts-tab-btn { flex: 1; }
        /* Badges & Medals grid: 2-up base (tablet/mobile, matches existing
           mobile behavior), 4-up on desktop per reference layout. */
        .medals-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 28px 20px;
        }
        @media (min-width: 1024px) {
          .medals-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
        }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
        @media (max-width: 767px) {
          .ts-sidebar-desktop { display: none !important; }
          .ts-sidebar-mobile-trigger { display: flex !important; }
          .ts-desktop-filters { display: none !important; }
          .ts-mobile-filters { display: flex !important; }
          .ts-desktop-trades { display: none !important; }
          .ts-mobile-trades { display: block !important; }
        }
        @media (min-width: 768px) {
          .ts-sidebar-mobile-trigger { display: none !important; }
          .ts-sidebar-mobile-sheet { display: none !important; }
          .ts-desktop-filters { display: flex !important; }
          .ts-mobile-filters { display: none !important; }
          .ts-desktop-trades { display: block !important; }
          .ts-mobile-trades { display: none !important; }
          .ts-tab-btn { flex: none; width: fit-content; }
          .ts-page-wrap { max-width: 1720px !important; padding: 20px 22px 48px !important; }
          .ts-page-title { font-size: 40px !important; }
          .ts-layout { gap: 34px !important; }
          .ts-sidebar-desktop { width: 280px !important; }
          .ts-side-menu { padding: 6px !important; border-radius: 20px !important; border: 1px solid ${C.g200}; }
          .ts-side-menu > button { padding: 14px 18px !important; font-size: 15px !important; }
          .ts-main-card { border-radius: 12px !important; }
          .ts-main-card-header { padding: 34px 32px 0 !important; }
          .ts-main-heading { font-size: 28px !important; }
          .ts-main-subtitle { font-size: 18px !important; }
          .ts-search-row { display: none !important; }
        }
      `}</style>

      <div className="ts-page-wrap" style={{ maxWidth: 1200, margin: '0 auto', padding: '16px 16px 40px' }}>
        {/* Mobile header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h1 className="ts-page-title" style={{ fontSize: 20, fontWeight: 900, color: C.g800, margin: 0 }}>Trader settings</h1>
          <button
            className="ts-sidebar-mobile-trigger"
            onClick={() => setMobileSidebarOpen(true)}
            style={{ display: 'none', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer', padding: 6 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={C.g700} strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
        </div>

        <div className="ts-layout" style={{ display: 'flex', gap: 20 }}>
          {/* Desktop sidebar */}
          <div className="ts-sidebar-desktop" style={{ width: 220, flexShrink: 0 }}>
            <div className="ts-side-menu" style={{
              background: '#fff', borderRadius: 16, overflow: 'hidden',
              boxShadow: '0 1px 3px rgba(15,23,42,0.06)',
              position: 'sticky', top: 80,
              padding: 6,
            }}>
              {SIDEBAR_ITEMS.map((item) => {
                const isActive = activeSection === item.id;
                const isAccountSettings = item.id === 'account-settings';
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      if (isAccountSettings) {
                        navigate('/settings?tab=account');
                      } else {
                        setActiveSection(item.id);
                      }
                    }}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                      padding: '12px 16px', borderRadius: 10, border: 'none', cursor: 'pointer', textAlign: 'left',
                      background: isActive ? C.green : 'transparent',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = C.g50; }}
                    onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
                  >
                    <item.icon size={16} style={{ color: isActive ? '#fff' : C.g500, flexShrink: 0 }} />
                    <span style={{ fontSize: 13, fontWeight: 700, color: isActive ? '#fff' : C.g700 }}>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Mobile sidebar sheet — bottom sheet */}
          {mobileSidebarOpen && (
            <>
              <div onClick={() => setMobileSidebarOpen(false)}
                style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 10000, animation: 'fadeIn 0.2s ease' }} />
              <div className="ts-sidebar-mobile-sheet" style={{
                position: 'fixed', bottom: 0, left: 0, right: 0,
                width: '100%', maxHeight: '85vh',
                background: '#fff', borderRadius: '16px 16px 0 0', zIndex: 10001,
                boxShadow: '0 -4px 24px rgba(0,0,0,0.15)',
                overflow: 'hidden', display: 'flex', flexDirection: 'column',
                animation: 'slideUp 0.25s cubic-bezier(0.16,1,0.3,1)',
                paddingBottom: 'env(safe-area-inset-bottom, 0px)',
              }}>
                {/* Header */}
                <div style={{ padding: '20px 20px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 17, fontWeight: 900, color: C.g800 }}>Trader settings</span>
                  <button onClick={() => setMobileSidebarOpen(false)} style={{
                    width: 36, height: 36, borderRadius: '50%', border: 'none',
                    background: C.g100, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'background 0.15s',
                  }}
                    onMouseEnter={e => e.currentTarget.style.background = C.g200}
                    onMouseLeave={e => e.currentTarget.style.background = C.g100}
                  >
                    <X size={18} color={C.g600} strokeWidth={2.5} />
                  </button>
                </div>
                {/* Menu items */}
                <div style={{ padding: '16px 14px 18px', display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto' }}>
                  {SIDEBAR_ITEMS.map((item) => {
                    const isActive = activeSection === item.id;
                    const isAccountSettings = item.id === 'account-settings';
                    return (
                      <button
                        key={item.id}
                        onClick={() => {
                          setMobileSidebarOpen(false);
                          if (isAccountSettings) {
                            navigate('/settings?tab=account');
                          } else {
                            setActiveSection(item.id);
                          }
                        }}
                        style={{
                          width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                          padding: '16px 20px', borderRadius: 12, border: 'none',
                          background: isActive ? C.green : C.g50,
                          cursor: 'pointer', textAlign: 'left',
                          transition: 'background 0.15s, transform 0.1s',
                        }}
                        onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = C.g100; }}
                        onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = C.g50; }}
                        onMouseDown={e => e.currentTarget.style.transform = 'scale(0.98)'}
                        onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
                      >
                        <item.icon size={20} style={{ color: isActive ? '#fff' : C.g500, flexShrink: 0 }} />
                        <span style={{ fontSize: 15, fontWeight: 700, color: isActive ? '#fff' : C.g700 }}>{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {/* Main content */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {activeSection === 'trade-insights' && (
              <TradeInsights
                user={user}
                activeTab={activeTab}
                setActiveTab={setActiveTab}
                trades={filteredTrades}
                loading={loading}
                hasMore={hasMore}
                loadingMore={loadingMore}
                onLoadMore={() => { setLoadingMore(true); loadTrades(false); }}
                currencyFilter={currencyFilter}
                setCurrencyFilter={setCurrencyFilter}
                typeFilter={typeFilter}
                setTypeFilter={setTypeFilter}
                statusFilter={statusFilter}
                setStatusFilter={setStatusFilter}
                dateFilter={dateFilter}
                setDateFilter={setDateFilter}
                paymentMethodFilter={paymentMethodFilter}
                setPaymentMethodFilter={setPaymentMethodFilter}
                paymentMethods={paymentMethods}
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                onExport={handleExport}
              />
            )}
            {activeSection === 'p2p-offers' && <PlaceholderSection title="P2P offers" subtitle="Manage your trade offers" icon={Tag} />}
            {activeSection === 'trade-statistics' && <PlaceholderSection title="Trade statistics" subtitle="View your trading performance" icon={TrendingUp} />}
            {activeSection === 'payment-accounts' && <PlaceholderSection title="Payment accounts" subtitle="Manage your payment methods" icon={CreditCard} />}
            {activeSection === 'traders' && <PlaceholderSection title="Traders" subtitle="Find and connect with traders" icon={Users} />}
            {activeSection === 'badges' && <MedalsSection />}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Trade Insights Content ─────────────────────────────────────────────
function TradeInsights({
  user, activeTab, setActiveTab, trades, loading, hasMore, loadingMore, onLoadMore,
  currencyFilter, setCurrencyFilter, typeFilter, setTypeFilter,
  statusFilter, setStatusFilter, dateFilter, setDateFilter,
  paymentMethodFilter, setPaymentMethodFilter, paymentMethods,
  searchQuery, setSearchQuery, onExport,
}) {
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);

  // Count active filters for badge
  const activeFilterCount = [
    currencyFilter !== 'All',
    typeFilter !== 'All',
    statusFilter !== 'All',
    paymentMethodFilter !== 'All',
    dateFilter !== 'All time',
  ].filter(Boolean).length;

  return (
    <div className="ts-main-card" style={{
      background: '#fff', borderRadius: 16, overflow: 'hidden',
      boxShadow: '0 1px 3px rgba(15,23,42,0.06)',
    }}>
      {/* Mobile Filter Sheet */}
      {filterSheetOpen && (
        <>
          <div onClick={() => setFilterSheetOpen(false)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 998 }} />
          <div style={{
            position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 999,
            background: '#fff', borderRadius: '16px 16px 0 0',
            maxHeight: '85vh', overflowY: 'auto',
            boxShadow: '0 -4px 24px rgba(0,0,0,0.15)',
          }}>
            <div style={{ padding: '16px 20px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${C.g100}`, paddingBottom: 12 }}>
              <span style={{ fontSize: 16, fontWeight: 900, color: C.g800 }}>Filters</span>
              <button onClick={() => setFilterSheetOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
                <X size={20} color={C.g500} />
              </button>
            </div>
            <div style={{ padding: '14px 20px 24px' }}>
              {/* Currency */}
              <div style={{ marginBottom: 16 }}>
                <p style={{ fontSize: 11, fontWeight: 800, color: C.g400, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Currency</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {CRYPTO_CURRENCIES.map(opt => (
                    <button key={opt} onClick={() => setCurrencyFilter(opt)} style={{
                      padding: '6px 12px', borderRadius: 8, border: `1px solid ${currencyFilter === opt ? C.green : C.g200}`,
                      background: currencyFilter === opt ? `${C.green}10` : '#fff',
                      cursor: 'pointer', fontSize: 12, fontWeight: 700,
                      color: currencyFilter === opt ? C.green : C.g600,
                    }}>{opt}</button>
                  ))}
                </div>
              </div>
              {/* Type */}
              <div style={{ marginBottom: 16 }}>
                <p style={{ fontSize: 11, fontWeight: 800, color: C.g400, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Type</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {TRADE_TYPES.map(opt => (
                    <button key={opt} onClick={() => setTypeFilter(opt)} style={{
                      padding: '6px 12px', borderRadius: 8, border: `1px solid ${typeFilter === opt ? C.green : C.g200}`,
                      background: typeFilter === opt ? `${C.green}10` : '#fff',
                      cursor: 'pointer', fontSize: 12, fontWeight: 700,
                      color: typeFilter === opt ? C.green : C.g600,
                    }}>{opt}</button>
                  ))}
                </div>
              </div>
              {/* Status */}
              <div style={{ marginBottom: 16 }}>
                <p style={{ fontSize: 11, fontWeight: 800, color: C.g400, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Status</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {TRADE_STATUSES.map(opt => (
                    <button key={opt} onClick={() => setStatusFilter(opt)} style={{
                      padding: '6px 12px', borderRadius: 8, border: `1px solid ${statusFilter === opt ? C.green : C.g200}`,
                      background: statusFilter === opt ? `${C.green}10` : '#fff',
                      cursor: 'pointer', fontSize: 12, fontWeight: 700,
                      color: statusFilter === opt ? C.green : C.g600,
                    }}>{opt}</button>
                  ))}
                </div>
              </div>
              {/* Payment method */}
              <div style={{ marginBottom: 16 }}>
                <p style={{ fontSize: 11, fontWeight: 800, color: C.g400, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Payment method</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {paymentMethods.map(opt => (
                    <button key={opt} onClick={() => setPaymentMethodFilter(opt)} style={{
                      padding: '6px 12px', borderRadius: 8, border: `1px solid ${paymentMethodFilter === opt ? C.green : C.g200}`,
                      background: paymentMethodFilter === opt ? `${C.green}10` : '#fff',
                      cursor: 'pointer', fontSize: 12, fontWeight: 700,
                      color: paymentMethodFilter === opt ? C.green : C.g600,
                    }}>{opt}</button>
                  ))}
                </div>
              </div>
              {/* Date */}
              <div style={{ marginBottom: 16 }}>
                <p style={{ fontSize: 11, fontWeight: 800, color: C.g400, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Date</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {DATE_OPTIONS.map(opt => (
                    <button key={opt} onClick={() => setDateFilter(opt)} style={{
                      padding: '6px 12px', borderRadius: 8, border: `1px solid ${dateFilter === opt ? C.green : C.g200}`,
                      background: dateFilter === opt ? `${C.green}10` : '#fff',
                      cursor: 'pointer', fontSize: 12, fontWeight: 700,
                      color: dateFilter === opt ? C.green : C.g600,
                    }}>{opt}</button>
                  ))}
                </div>
              </div>
              {/* Clear all */}
              {activeFilterCount > 0 && (
                <button onClick={() => { setCurrencyFilter('All'); setTypeFilter('All'); setStatusFilter('All'); setPaymentMethodFilter('All'); setDateFilter('All time'); }}
                  style={{ width: '100%', padding: '10px', borderRadius: 10, border: `1px solid ${C.danger}`, background: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, color: C.danger }}>
                  Clear all filters
                </button>
              )}
              {/* Apply button */}
              <button onClick={() => setFilterSheetOpen(false)}
                style={{ width: '100%', padding: '12px', borderRadius: 10, border: 'none', background: C.green, cursor: 'pointer', fontSize: 14, fontWeight: 800, color: '#fff', marginTop: activeFilterCount > 0 ? 8 : 0 }}>
                Apply filters
              </button>
            </div>
          </div>
        </>
      )}

      {/* Header */}
      <div className="ts-main-card-header" style={{ padding: '20px 20px 0' }}>
        <h2 className="ts-main-heading" style={{ fontSize: 18, fontWeight: 900, color: C.g800, margin: '0 0 4px' }}>Trade insights</h2>
        <p className="ts-main-subtitle" style={{ fontSize: 13, color: C.g500, margin: '0 0 16px' }}>Get a complete overview of your trading journey</p>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 10 }}>
          {[
            { id: 'active', label: 'Active', icon: Zap },
            { id: 'history', label: 'History', icon: Clock },
          ].map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className="ts-tab-btn"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                padding: '11px 14px', background: activeTab === tab.id ? C.green : C.g100, border: 'none', borderRadius: 12,
                cursor: 'pointer', fontSize: 13, fontWeight: 800,
                color: activeTab === tab.id ? '#fff' : C.g800,
                transition: 'all 0.2s',
              }}>
              <tab.icon size={14} />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Filters (History tab only) */}
      {activeTab === 'history' && (
        <>
          {/* Desktop filters */}
          <div className="ts-desktop-filters" style={{
            padding: '12px 20px', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center',
            borderBottom: `1px solid ${C.g100}`, marginTop: 22,
          }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: C.g800, marginRight: 8 }}>Filters</span>
            <FilterDropdown label="Currency" options={CRYPTO_CURRENCIES} selected={currencyFilter} onChange={setCurrencyFilter} />
            <FilterDropdown label="Type" options={TRADE_TYPES} selected={typeFilter} onChange={setTypeFilter} />
            <FilterDropdown label="Status" options={TRADE_STATUSES} selected={statusFilter} onChange={setStatusFilter} />
            <FilterDropdown label="Payment method" options={paymentMethods} selected={paymentMethodFilter} onChange={setPaymentMethodFilter} />
            <FilterDropdown label="Date" options={DATE_OPTIONS} selected={dateFilter} onChange={setDateFilter} />
            <div style={{ flex: 1 }} />
            <ExportDropdown onExport={onExport} compact />
          </div>

          {/* Mobile filters */}
          <div className="ts-mobile-filters" style={{
            padding: '10px 16px', display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between',
            borderBottom: `1px solid ${C.g100}`, marginTop: 22,
          }}>
            <button onClick={() => setFilterSheetOpen(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '8px 14px', borderRadius: 10, border: `1px solid ${activeFilterCount > 0 ? C.green : C.g200}`,
                background: activeFilterCount > 0 ? `${C.green}08` : '#fff',
                cursor: 'pointer', fontSize: 13, fontWeight: 700,
                color: activeFilterCount > 0 ? C.green : C.g700, position: 'relative', width: 'fit-content',
              }}>
              <Filter size={14} />
              Filter
              {activeFilterCount > 0 && (
                <span style={{
                  position: 'absolute', top: -4, right: -4, width: 18, height: 18, borderRadius: '50%',
                  background: C.green, color: '#fff', fontSize: 10, fontWeight: 800,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>{activeFilterCount}</span>
              )}
            </button>
            <ExportDropdown onExport={onExport} />
          </div>
        </>
      )}

      {/* Search (always visible) */}
      <div className="ts-search-row" style={{ padding: '10px 20px', borderBottom: `1px solid ${C.g100}` }}>
        <div style={{ position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: C.g400 }} />
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search trades…"
            style={{
              width: '100%', padding: '8px 12px 8px 32px', borderRadius: 10,
              border: `1px solid ${C.g200}`, fontSize: 12, fontWeight: 600,
              outline: 'none', boxSizing: 'border-box',
            }}
          />
        </div>
      </div>

      {/* Trade list */}
      {loading ? (
        <div style={{ padding: '32px 20px', textAlign: 'center' }}>
          <div style={{ width: 24, height: 24, border: `3px solid ${C.g200}`, borderTopColor: C.green, borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto' }} />
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          <p style={{ fontSize: 12, color: C.g500, marginTop: 12 }}>Loading trades…</p>
        </div>
      ) : trades.length === 0 ? (
        <EmptyState type={activeTab} />
      ) : (
        <>
          {/* Desktop trade rows */}
          <div className="ts-desktop-trades">
            {trades.map(t => (
              <TradeRow key={t.id} trade={t} userId={user?.id} />
            ))}
          </div>
          {/* Mobile trade rows */}
          <div className="ts-mobile-trades" style={{ padding: '10px 12px' }}>
            {trades.map(t => (
              <TradeRowMobile key={t.id} trade={t} userId={user?.id} />
            ))}
          </div>
          {hasMore && (
            <div style={{ padding: '12px 20px', textAlign: 'center' }}>
              <button onClick={onLoadMore} disabled={loadingMore}
                style={{
                  padding: '8px 20px', borderRadius: 10, border: `1px solid ${C.g200}`,
                  background: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 700,
                  color: C.g700,
                }}>
                {loadingMore ? 'Loading…' : 'Load more'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Medals Grid (medal data fetch + grid; rendered for both Badges and Medals tabs) ─
function MedalsGrid({ tab = 'medals' }) {
  const [medals, setMedals] = useState(null); // null = loading
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await axios.get(`${API_URL}/users/me/medals`, { headers: authH() });
        if (!cancelled) setMedals(r.data.medals || []);
      } catch (e) {
        if (!cancelled) setError(e.response?.data?.error || 'Failed to load medals');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Bottom metadata line: tab-driven (Medals → earned date, falls back to
  // progress while unearned; Badges → progress). Locked/no-data medals return
  // null → line hidden. Icon muted-treatment state is separate (see below).
  const medalState = m => {
    if (m.earnedDate) return 'earned';
    if (m.progressCurrent != null && m.progressTarget != null && m.progressCurrent > 0) return 'progress';
    return 'locked';
  };

  const ICON = 88; // consistent square size across all medals

  return (
    <>
      {error ? (
        <div style={{ padding: '32px 24px', textAlign: 'center' }}>
          <p style={{ fontSize: 13, color: C.danger, fontWeight: 700, margin: 0 }}>{error}</p>
        </div>
      ) : !medals ? (
        <div style={{ padding: '40px 20px', textAlign: 'center' }}>
          <div style={{ width: 24, height: 24, border: `3px solid ${C.g200}`, borderTopColor: C.green, borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto' }} />
          <p style={{ fontSize: 12, color: C.g500, marginTop: 12 }}>Loading medals…</p>
        </div>
      ) : (
        <div className="medals-grid" style={{ padding: '20px 20px 28px' }}>
          {medals.map(m => {
            const state = medalState(m);
            const isMuted = state !== 'earned'; // locked + in-progress: grayscale, still recognizable
            const metaText = medalMetaText(m, tab);
            return (
              <div key={m.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                {/* Icon — fixed square, rounded like app cards; unearned =
                    light faded look: mostly transparent with only a slight
                    desaturation, so original colors/shape stay faintly visible
                    (never fully gray). Earned → no filter, full opacity. */}
                <div style={{
                  width: ICON, height: ICON, borderRadius: 16, overflow: 'hidden',
                  background: C.g100, flexShrink: 0,
                }}>
                  <img
                    src={m.icon}
                    alt={m.name}
                    loading="lazy"
                    style={{
                      width: '100%', height: '100%', objectFit: 'contain',
                      filter: isMuted ? 'grayscale(30%) opacity(0.4)' : 'none',
                      transition: 'filter 0.2s',
                    }}
                  />
                </div>
                <p style={{ fontSize: 13, fontWeight: 800, color: C.g800, margin: '10px 0 0' }}>{m.name}</p>
                <p style={{ fontSize: 12, color: C.sage, margin: '3px 0 0', maxWidth: 160, lineHeight: 1.25 }}>
                  {m.description || ''}
                </p>
                {/* Date or progress — one shared style block so both render with
                    identical quiet, secondary styling on every medal card */}
                {metaText && (
                  <p style={{ fontSize: 10, fontWeight: 500, color: C.g400, margin: '2px 0 0' }}>
                    {metaText}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

// ── Medals Section (Badges & Medals tab — Badges/Medals pill toggle) ────
function MedalsSection() {
  // Medals is the default landing tab (existing links point at this section).
  const [innerTab, setInnerTab] = useState('medals');

  return (
    <div className="ts-main-card" style={{
      background: '#fff', borderRadius: 16, overflow: 'hidden',
      boxShadow: '0 1px 3px rgba(15,23,42,0.06)',
    }}>
      <div className="ts-main-card-header" style={{ padding: '20px 20px 0' }}>
        <h2 className="ts-main-heading" style={{ fontSize: 18, fontWeight: 900, color: C.g800, margin: '0 0 4px' }}>Badges & Medals</h2>
        <p className="ts-main-subtitle" style={{ fontSize: 13, color: C.g500, margin: '0 0 16px' }}>
          View your trading progress toward badges and medals
        </p>

        {/* Badges / Medals pill toggle */}
        <div style={{ display: 'flex', gap: 10 }}>
          {[
            { id: 'badges', label: 'Badges' },
            { id: 'medals', label: 'Medals' },
          ].map(tab => (
            <button key={tab.id} onClick={() => setInnerTab(tab.id)}
              className="ts-tab-btn"
              style={{
                padding: '11px 18px', background: innerTab === tab.id ? C.green : C.g100,
                border: 'none', borderRadius: 8, cursor: 'pointer',
                fontSize: 13, fontWeight: innerTab === tab.id ? 800 : 700,
                color: innerTab === tab.id ? '#fff' : C.g600,
                transition: 'all 0.2s',
              }}>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <MedalsGrid tab={innerTab} />
    </div>
  );
}

// ── Placeholder Section ────────────────────────────────────────────────
function PlaceholderSection({ title, subtitle, icon: Icon }) {
  return (
    <div style={{
      background: '#fff', borderRadius: 16, overflow: 'hidden',
      boxShadow: '0 1px 3px rgba(15,23,42,0.06)', textAlign: 'center',
      padding: '48px 24px',
    }}>
      <div style={{
        width: 64, height: 64, borderRadius: 20, background: `${C.green}10`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px',
      }}>
        <Icon size={28} style={{ color: C.green }} />
      </div>
      <h3 style={{ fontSize: 16, fontWeight: 800, color: C.g800, margin: '0 0 6px' }}>{title}</h3>
      <p style={{ fontSize: 13, color: C.g500, margin: 0 }}>{subtitle}</p>
      <p style={{ fontSize: 11, color: C.g400, marginTop: 8 }}>Coming soon</p>
    </div>
  );
}
