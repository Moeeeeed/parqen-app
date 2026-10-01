import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ThumbsUp, ChevronRight, X, Repeat2, Star } from 'lucide-react';
import axios from 'axios';
import CountryFlag from './CountryFlag';
import CoinIcon from './CoinIcon';
import { deriveBadge, BadgeChip } from '../lib/badge';
import { useRates } from '../contexts/RatesContext';
import { cleanPaymentMethod, calculateReceiveAmount, fmtCurrency } from '../lib/p2pHelpers';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const STATUS_CFG = {
  CREATED:      { label: 'Active funded', statusColor: '#92400E', statusBg: '#FEF3C7' },
  FUNDS_LOCKED: { label: 'Active funded', statusColor: '#92400E', statusBg: '#FEF3C7' },
  PAYMENT_SENT: { label: 'Paid',          statusColor: '#15803D', statusBg: '#DCFCE7' },
  PAID:         { label: 'Paid',          statusColor: '#15803D', statusBg: '#DCFCE7' },
  DISPUTED:     { label: 'In Dispute',    statusColor: '#7C3AED', statusBg: '#EDE9FE' },
  CANCELLED:    { label: 'Cancelled',     statusColor: '#64748B', statusBg: '#F1F5F9' },
  EXPIRED:      { label: 'Expired',       statusColor: '#64748B', statusBg: '#F1F5F9' },
};

function getMyId() {
  try {
    const token = localStorage.getItem('token');
    if (!token) return null;
    return JSON.parse(atob(token.split('.')[1])).userId || null;
  } catch { return null; }
}

function timeAgo(dateStr) {
  if (!dateStr) return '1m ago';
  const diffSecs = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diffSecs < 60) return '1m ago';
  const mins = Math.floor(diffSecs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function Avatar({ user, size = 48, radius = 'rounded-lg' }) {
  const url = user?.avatar_url;
  const initial = (user?.username || '?').charAt(0).toUpperCase();
  if (url) {
    return (
      <img
        src={url}
        alt={user?.username || 'user'}
        className={`object-cover flex-shrink-0 ${radius}`}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className={`flex-shrink-0 flex items-center justify-center font-bold text-white ${radius}`}
      style={{ width: size, height: size, backgroundColor: '#0D9488', fontSize: Math.round(size * 0.38) }}
    >
      {initial}
    </div>
  );
}

// Popup — fetches fresh profile so badge is always accurate
function TraderPopup({ cpId, cpFallback, onClose }) {
  const [user, setUser] = useState(cpFallback || {});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!cpId) { setLoading(false); return; }
    axios.get(`${API_URL}/users/${cpId}`)
      .then(r => { if (r.data?.user || r.data) setUser(r.data.user || r.data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [cpId]);

  const badge      = deriveBadge(user);
  const pos        = parseInt(user.positive_feedback || 0);
  const neg        = parseInt(user.negative_feedback || 0);
  const total      = pos + neg;
  const trust      = total > 0 ? Math.round(pos / total * 100) : parseInt(user.total_trades || 0) > 0 ? 100 : 0;
  const trades     = parseInt(user.total_trades || 0);
  const completion = parseFloat(user.completion_rate || 0);
  const rating     = parseFloat(user.average_rating || 0);
  const cc         = (user.country || '').toLowerCase() || null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}>
      <style>{`@keyframes slideUp{from{transform:translateY(40px);opacity:0}to{transform:translateY(0);opacity:1}}`}</style>
      <div
        className="bg-white w-full sm:max-w-xs rounded-t-3xl sm:rounded-2xl overflow-hidden shadow-2xl"
        style={{ border: '1px solid #E2E8F0', animation: 'slideUp .22s ease' }}
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="relative px-5 pt-5 pb-4"
          style={{ background: 'linear-gradient(135deg,#1B4332 0%,#2D6A4F 100%)' }}>
          <button onClick={onClose}
            className="absolute top-3 right-3 w-7 h-7 rounded-full flex items-center justify-center"
            style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}>
            <X size={14} className="text-white" />
          </button>

          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center font-black text-2xl text-white flex-shrink-0"
              style={{ backgroundColor: 'rgba(255,255,255,0.15)', border: '2px solid rgba(255,255,255,0.25)' }}>
              {(user.username || '?').charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 mb-1.5">
                <CountryFlag countryCode={cc} className="w-4 h-3 rounded-sm flex-shrink-0" />
                <span className="font-black text-base text-white leading-tight truncate">
                  {user.username || '—'}
                </span>
              </div>
              {loading ? (
                <div className="h-5 w-24 rounded-full animate-pulse" style={{ backgroundColor: 'rgba(255,255,255,0.15)' }} />
              ) : (
                <span
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full border font-bold ${badge.animate ? 'shadow-md' : ''}`}
                  style={{
                    background: badge.bg,
                    borderColor: badge.borderColor,
                    fontSize: '11px',
                    boxShadow: badge.glow ? `0 0 10px ${badge.glow}` : undefined,
                  }}>
                  <span style={{ color: badge.iconColor || badge.textColor, fontSize: '13px' }}>{badge.icon}</span>
                  <span style={{ color: badge.textColor }}>{badge.label}</span>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2 p-4">
          {[
            { label: 'Trades',     value: trades,                                        color: '#1B4332' },
            { label: 'Trust',      value: `${trust}%`,                                   color: trust >= 80 ? '#16A34A' : trust >= 50 ? '#D97706' : '#DC2626' },
            { label: 'Completion', value: completion > 0 ? `${Math.round(completion)}%` : '—', color: '#2563EB' },
            { label: 'Positive',   value: pos,                                           color: '#16A34A' },
            { label: 'Negative',   value: neg,                                           color: '#DC2626' },
            {
              label: 'Rating',
              value: rating > 0
                ? <span className="inline-flex items-center justify-center gap-1">{rating.toFixed(1)}<Star size={11} fill="currentColor" /></span>
                : '—',
              color: '#D97706',
            },
          ].map(({ label, value, color }) => (
            <div key={label} className="rounded-xl px-3 py-2.5 text-center"
              style={{ backgroundColor: '#F8FAFC', border: '1px solid #F1F5F9' }}>
              <p className="text-[9px] font-black uppercase tracking-wider mb-0.5" style={{ color: '#94A3B8' }}>{label}</p>
              <p className="font-black text-sm leading-tight" style={{ color }}>{loading ? '…' : value}</p>
            </div>
          ))}
        </div>

        <div className="px-4 pb-5">
          <button onClick={onClose}
            className="w-full py-3 rounded-xl text-sm font-black text-white hover:opacity-90 transition"
            style={{ backgroundColor: '#1B4332' }}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ActiveTradeCard({ trade }) {
  const navigate  = useNavigate();
  const myId      = getMyId();
  const isBuyer   = myId ? String(trade.buyer_id) === String(myId) : true;
  const [showPopup, setShowPopup] = useState(false);

  const { rates: USD_RATES, btcUsd: contextBtcUsd } = useRates();

  // Counterparty object
  const cp = (isBuyer
    ? (typeof trade.seller === 'object' ? trade.seller : {})
    : (typeof trade.buyer  === 'object' ? trade.buyer  : {})
  ) || {};

  const cfg = STATUS_CFG[trade.status] || STATUS_CFG.CREATED;

  const listingType = String(trade.listing?.listing_type || trade.listing_type || trade.trade_type || '').toUpperCase();
  const isUsdt       = listingType.includes('USDT') || (trade.crypto_currency || trade.currency || '').toUpperCase() === 'USDT' || (trade.amount_usdt && parseFloat(trade.amount_usdt) > 0);
  const assetTag     = isUsdt ? 'USDT' : 'BTC';

  // Dynamic currency handling — reads trade's local currency, never hardcoded
  const rawCur   = trade.fiat_currency
    || trade.local_currency
    || trade.listing?.fiat_currency
    || trade.listing?.currency
    || (trade.currency && !['BTC','USDT','₿','₮','$'].includes(trade.currency) ? trade.currency : null)
    || 'USD';
  const cleanCur = String(rawCur).toUpperCase();
  const usdRate  = USD_RATES[cleanCur] || 1;

  // Margin % locked at trade creation (falls back to linked offer margin, or 0)
  const margin = trade.margin !== undefined && trade.margin !== null
    ? parseFloat(trade.margin)
    : (trade.listing?.margin !== undefined && trade.listing?.margin !== null ? parseFloat(trade.listing.margin) : 0);

  // Rate locked at trade creation (falls back to linked offer price, or live rate)
  const lockedRate = parseFloat(trade.btc_price || trade.rate || trade.listing?.bitcoin_price || contextBtcUsd || 89000);

  // Pay amount in local fiat
  const payAmt   = parseFloat(trade.amount_local || trade.fiat_amount || trade.amount_fiat || trade.amount_usd || trade.amount || 0);

  // Perform calculations using calculateReceiveAmount with locked values
  const { receiveFiat, sellerRateLocal } = calculateReceiveAmount({
    payAmount: payAmt,
    margin,
    rate: lockedRate,
    usdRate,
  });

  // Payment method — cleaned to strip listing-type words like "sell"
  const rawPm  = trade.listing?.payment_method || trade.payment_method || trade.pay_method || '';
  const pmName = cleanPaymentMethod(rawPm, 'Payment');

  // Labels matching Offer Card format exactly: "Pay {pmLabel}" / "Receive ({assetLabel})"
  const payTitle  = `Pay ${pmName}`;
  const recvTitle = `Receive (${assetTag})`;

  // Formatted string values in the dynamic currency
  const payVal  = fmtCurrency(payAmt, cleanCur);
  const recvVal = fmtCurrency(receiveFiat, cleanCur);

  const marginBg    = margin > 0 ? '#EF4444' : margin < 0 ? '#10B981' : '#94A3B8';
  const marginLabel = margin === 0 ? 'MARKET' : `${margin > 0 ? '+' : ''}${margin}%`;

  const pos         = parseInt(cp.positive_feedback || 0);
  const neg         = parseInt(cp.negative_feedback || 0);
  const total       = pos + neg;
  const trust       = total > 0 ? Math.round(pos / total * 100) : parseInt(cp.total_trades || cp.trade_count || 0) > 0 ? 100 : 100;
  const tradesCount = parseInt(cp.total_trades || cp.trades_count || cp.trade_count || cp.trades || 0);
  const cc          = (cp.country || '').toLowerCase() || null;
  const startedAt   = timeAgo(trade.created_at);

  // Online status indicator
  const lastSeen = cp.last_seen_at;
  const isOnline = lastSeen ? (Date.now() - new Date(lastSeen).getTime()) < 5 * 60 * 1000 : false;

  return (
    <>
      <div
        onClick={() => navigate(`/trade/${trade.id}`)}
        className="w-full bg-white border border-amber-300/80 shadow-sm hover:shadow-md rounded-xl overflow-hidden mb-3 relative cursor-pointer transition-all"
        style={{ background: 'linear-gradient(180deg, #FFFDF5 0%, #FFFFFF 100%)' }}
      >
        {/* Active Trade Top Banner */}
        <div className="flex items-center justify-between px-4 py-1.5 bg-amber-50/80 border-b border-amber-200/60">
          <div className="flex items-center gap-1.5 text-amber-900 font-black text-[11px] uppercase tracking-wider">
            <Repeat2 size={13} className="text-amber-700" />
            <span>Active Escrow Trade</span>
          </div>
          <span
            className="px-2.5 py-0.5 rounded text-[11px] font-black tracking-tight"
            style={{ backgroundColor: cfg.statusBg, color: cfg.statusColor }}
          >
            {cfg.label}
          </span>
        </div>

        {/* ═══ DESKTOP ROW (lg+) ═══ — mirrors Offer Card structure */}
        <div className="hidden lg:flex items-center px-4 py-4 gap-6">
          {/* Col 1: User Info */}
          <div className="flex items-center gap-3 w-[280px] flex-shrink-0">
            <button onClick={(e) => { e.stopPropagation(); setShowPopup(true); }} className="flex-shrink-0 relative">
              <Avatar user={cp} size={48} radius="rounded-lg" />
              <div
                className="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full border-2 border-white"
                style={{ backgroundColor: isOnline ? '#22C55E' : '#94A3B8' }}
              />
            </button>
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <CountryFlag countryCode={cc} className="w-4 h-3 rounded-sm shadow-sm" />
                <button
                  onClick={(e) => { e.stopPropagation(); setShowPopup(true); }}
                  className="font-black text-[15px] hover:underline truncate"
                  style={{ color: '#111827', textUnderlineOffset: '2px' }}
                >
                  {cp.username || 'Trader'}
                </button>
                <BadgeChip user={cp} size="xs" />
              </div>
              <div className="flex items-center gap-2 mt-1 text-xs text-gray-500 font-semibold">
                <div className="flex items-center gap-1">
                  <ThumbsUp size={13} className="text-gray-400" strokeWidth={2.5} />
                  <span className="text-gray-700">{trust}%</span>
                </div>
                <span className="text-gray-700">{tradesCount} Trades</span>
                <div className="flex items-center gap-1">
                  <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-500' : 'bg-gray-400'}`} />
                  <span className={isOnline ? 'text-emerald-600 font-bold' : ''}>{isOnline ? 'Active' : startedAt}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Col 2: Rate + Margin + Started */}
          <div className="flex flex-col flex-1 min-w-[200px]">
            <div className="flex items-center gap-1.5">
              <CoinIcon coin={assetTag} size={18} />
              <span className="font-black text-[16px] text-gray-900">
                {sellerRateLocal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {cleanCur}
              </span>
              <span className="px-1.5 py-0.5 rounded text-[11px] font-black tracking-wide text-white" style={{ backgroundColor: marginBg }}>
                {marginLabel}
              </span>
            </div>
            <span className="text-[13px] font-semibold text-gray-500 mt-1">Started {startedAt}</span>
          </div>

          {/* Col 3: Pay */}
          <div className="flex flex-col w-[180px] flex-shrink-0">
            <span className="text-[12px] font-bold text-gray-500 mb-0.5 truncate pr-2">{payTitle}</span>
            <span className="text-[15px] font-black text-gray-900">{payVal}</span>
          </div>

          {/* Col 4: Receive */}
          <div className="flex flex-col w-[160px] flex-shrink-0">
            <span className="text-[12px] font-bold text-gray-500 mb-0.5 truncate pr-2">{recvTitle}</span>
            <span className="text-[15px] font-black text-gray-900">{recvVal}</span>
          </div>

          {/* Col 5: Open Trade Action */}
          <div className="flex items-center gap-3 flex-shrink-0 ml-auto">
            <button
              onClick={(e) => { e.stopPropagation(); navigate(`/trade/${trade.id}`); }}
              className="h-10 px-6 rounded-full bg-[#10B981] text-white font-black text-[15px] flex items-center gap-1.5 shadow-md hover:bg-emerald-600 active:scale-95 transition"
            >
              Open Trade <ChevronRight size={16} strokeWidth={3} />
            </button>
          </div>
        </div>

        {/* ═══ MOBILE CARD (< lg) ═══ — mirrors Offer Card mobile layout */}
        <div className="lg:hidden">
          <div className="p-4 pb-3 flex items-start gap-3">
            <button onClick={(e) => { e.stopPropagation(); setShowPopup(true); }} className="flex-shrink-0 relative">
              <Avatar user={cp} size={48} radius="rounded-lg" />
              <div
                className="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full border-2 border-white"
                style={{ backgroundColor: isOnline ? '#22C55E' : '#94A3B8' }}
              />
            </button>
            <div className="flex flex-col flex-1 min-w-0 pt-0.5">
              <div className="flex items-center gap-1.5 flex-wrap">
                <CountryFlag countryCode={cc} className="w-4 h-3 rounded-sm shadow-sm" />
                <button
                  onClick={(e) => { e.stopPropagation(); setShowPopup(true); }}
                  className="font-black text-[15px] hover:underline"
                  style={{ color: '#111827', textUnderlineOffset: '2px' }}
                >
                  {cp.username || 'Trader'}
                </button>
                <BadgeChip user={cp} size="xs" />
              </div>
              <div className="flex items-center gap-2.5 mt-1 text-xs text-gray-600 font-semibold">
                <div className="flex items-center gap-1">
                  <ThumbsUp size={13} className="text-gray-400" strokeWidth={2.5} />
                  <span className="text-gray-700">{trust}%</span>
                </div>
                <span>{tradesCount} Trades</span>
                <div className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-500' : 'bg-gray-400'}`} />
                  <span className={isOnline ? 'text-emerald-600 font-bold' : 'text-gray-500'}>
                    {isOnline ? 'Active' : startedAt}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="px-4 py-2 flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-xs font-bold text-gray-600 mb-0.5">{payTitle}</span>
              <span className="text-lg font-black text-gray-900">{payVal}</span>
            </div>
            <div className="flex flex-col text-right">
              <span className="text-xs font-bold text-gray-600 mb-0.5">{recvTitle}</span>
              <span className="text-lg font-black text-gray-900">{recvVal}</span>
            </div>
          </div>

          <div className="bg-gray-50 mt-1 px-4 py-3 flex items-center justify-between gap-2 border-t border-gray-100">
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <CoinIcon coin={assetTag} size={16} />
                <span className="font-black text-[15px] text-gray-900 truncate">
                  {sellerRateLocal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {cleanCur}
                </span>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-black tracking-wide text-white" style={{ backgroundColor: marginBg }}>
                  {marginLabel}
                </span>
              </div>
              <div className="text-xs font-semibold text-gray-600 mt-1">Started {startedAt}</div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={(e) => { e.stopPropagation(); navigate(`/trade/${trade.id}`); }}
                className="h-9 px-4 rounded-full bg-[#10B981] text-white font-black text-[15px] flex items-center gap-1.5 shadow-md hover:bg-emerald-600 active:scale-95 transition"
              >
                Open Trade <ChevronRight size={14} strokeWidth={3} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {showPopup && (
        <TraderPopup
          cpId={cp.id}
          cpFallback={cp}
          onClose={() => setShowPopup(false)}
        />
      )}
    </>
  );
}