import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ThumbsUp, ThumbsDown, Clock, ArrowRight, X, Repeat2 } from 'lucide-react';
import axios from 'axios';
import CountryFlag from './CountryFlag';
import { deriveBadge } from '../lib/badge';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const STATUS_CFG = {
  CREATED:      { label: '⏳ Waiting for Escrow', statusColor: '#D97706', statusBg: '#FEF3C7' },
  FUNDS_LOCKED: { label: '✅ Active & Funded',     statusColor: '#16A34A', statusBg: '#DCFCE7' },
  PAYMENT_SENT: { label: '💳 Payment Sent',        statusColor: '#2563EB', statusBg: '#DBEAFE' },
  DISPUTED:     { label: '⚠️ In Dispute',          statusColor: '#DC2626', statusBg: '#FEE2E2' },
};

// What market / page this trade belongs to
function getMarketInfo(listingType) {
  const t = (listingType || '').toUpperCase();
  if (t === 'SELL')                              return { label: 'SELL TRADE',  color: '#D97706', bg: '#FEF3C7' };
  if (t === 'BUY')                               return { label: 'BUY TRADE',   color: '#1B4332', bg: '#DCFCE7' };
  if (t === 'BUY_GIFT_CARD' || t === 'SELL_GIFT_CARD') return { label: 'GIFT CARD',   color: '#0D9488', bg: '#CCFBF1' };
  return { label: 'TRADE', color: '#475569', bg: '#F1F5F9' };
}

function getMyId() {
  try {
    const token = localStorage.getItem('token');
    if (!token) return null;
    return JSON.parse(atob(token.split('.')[1])).userId || null;
  } catch { return null; }
}

// Sanitize time limit: if > 1440 (24h in minutes) it was stored as seconds — convert
function sanitizeLimitMins(raw) {
  const n = parseInt(raw) || 30;
  if (n > 1440) return Math.min(480, Math.round(n / 60)); // seconds → minutes, cap 8h
  return Math.min(480, Math.max(5, n));
}

// Returns effective expires_at — validates server value against expected deadline.
// Returns null when expires_at is explicitly null (trade marked paid — timer permanently stopped).
function resolveExpiresAt(expiresAt, createdAt, limitMins) {
  // null means the server intentionally cleared it (buyer marked paid) — honour that
  if (expiresAt === null) return null;
  const computed = createdAt
    ? new Date(new Date(createdAt).getTime() + (limitMins || 30) * 60 * 1000).toISOString()
    : null;
  if (!expiresAt) return computed;
  // If server expires_at differs from computed by more than 2× the limit, the stored value
  // has bad data (e.g. seconds stored as minutes). Fall back to computed.
  if (computed) {
    const diffMs = Math.abs(new Date(expiresAt) - new Date(computed));
    if (diffMs > (limitMins || 30) * 60 * 2000) return computed;
  }
  return expiresAt;
}

// MM:SS countdown
function TradeTimer({ expiresAt, timeLimitMins = 30, onExpire }) {
  const limitSecs    = Math.max(60, timeLimitMins * 60);
  const expiredFired = useRef(false);
  const mountTime    = useRef(Date.now());

  const calcRemaining = () => {
    if (expiresAt) {
      const diff = Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000);
      return Math.max(0, diff);
    }
    // No server expiry deadline — show a static countdown from mount time (visual only).
    // onExpire must NOT fire when expiresAt is null: null means the server intentionally
    // cleared the deadline (buyer marked paid) and the trade must stay locked forever.
    const elapsed = Math.floor((Date.now() - mountTime.current) / 1000);
    return Math.max(0, limitSecs - elapsed);
  };

  const [secs, setSecs] = useState(calcRemaining);

  useEffect(() => {
    expiredFired.current = false;
    mountTime.current = Date.now();
    setSecs(calcRemaining());
    const tick = setInterval(() => {
      const remaining = calcRemaining();
      setSecs(remaining);
      // Only fire onExpire when we have a real server deadline (expiresAt is set).
      // If expiresAt is null the server cleared the timer intentionally — never expire.
      if (remaining === 0 && !expiredFired.current && expiresAt) {
        expiredFired.current = true;
        onExpire?.();
      }
    }, 1000);
    return () => clearInterval(tick);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expiresAt]);

  const expired = secs === 0;
  const urgent  = !expired && secs < 300;
  const pct     = Math.min(100, Math.round((secs / limitSecs) * 100));
  const mm      = String(Math.floor(secs / 60)).padStart(2, '0');
  const ss      = String(secs % 60).padStart(2, '0');
  const color   = urgent ? '#D97706' : '#16A34A';
  const bg      = urgent ? '#FEF3C7' : '#DCFCE7';

  // When expired, remove the timer entirely (leave space clean)
  if (expired) return null;

  return (
    <div className="flex flex-col items-end gap-1 flex-shrink-0">
      <span className={`inline-flex items-center gap-1 text-xs font-mono font-black px-2.5 py-1 rounded-full ${urgent ? 'animate-pulse' : ''}`}
        style={{ backgroundColor: bg, color }}>
        <Clock size={10} />
        {mm}:{ss}
      </span>
      <div className="w-20 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: '#E5E7EB' }}>
        <div className="h-full rounded-full transition-all duration-1000"
          style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

function fmtLocal(sym, amount) {
  if (!amount || isNaN(parseFloat(amount))) return null;
  const num = parseFloat(amount);
  return `${sym || ''}${num.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function fmtBtc(amount) {
  if (!amount || isNaN(parseFloat(amount))) return null;
  return `₿ ${parseFloat(amount).toFixed(6)}`;
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
              {/* Badge — always from fresh profile data */}
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
            { label: 'Rating',     value: rating > 0 ? `${rating.toFixed(1)} ⭐` : '—', color: '#D97706' },
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

export default function ActiveTradeCard({ trade, onExpire, pageColor }) {
  const navigate  = useNavigate();
  const myId      = getMyId();
  const isBuyer   = myId ? String(trade.buyer_id) === String(myId) : true;
  const [showPopup, setShowPopup] = useState(false);

  // Counterparty object
  const cp = (isBuyer
    ? (typeof trade.seller === 'object' ? trade.seller : {})
    : (typeof trade.buyer  === 'object' ? trade.buyer  : {})
  ) || {};

  const cfg      = STATUS_CFG[trade.status] || STATUS_CFG.CREATED;
  const btnColor = pageColor || '#1B4332';

  // Listing type — check nested join AND direct field; fall back to role when unknown
  const listingType   = trade.listing?.listing_type || trade.listing_type || trade.trade_type || '';
  const market        = listingType
    ? getMarketInfo(listingType)
    : { label: isBuyer ? 'BUY TRADE' : 'SELL TRADE', color: isBuyer ? '#1B4332' : '#D97706', bg: isBuyer ? '#DCFCE7' : '#FEF3C7' };
  const timeLimitMins = sanitizeLimitMins(trade.listing?.time_limit || trade.time_limit || 30);

  // Timer: use server expires_at, fall back to created_at + limit
  const effectiveExpiresAt = resolveExpiresAt(trade.expires_at, trade.created_at, timeLimitMins);

  // Badge from joined data — may be null, deriveBadge handles gracefully
  const badge = deriveBadge(cp);

  // Amounts
  const sym      = trade.currency_symbol || '';
  const localAmt = fmtLocal(sym, trade.amount_local) || fmtLocal('$', trade.amount_usd);
  const btcAmt   = fmtBtc(trade.amount_btc);

  const youPayAmt   = isBuyer ? localAmt : btcAmt;
  const youRecvAmt  = isBuyer ? btcAmt   : localAmt;
  const roleLabel   = isBuyer ? 'You are the Buyer' : 'You are the Seller';

  const pos    = parseInt(cp.positive_feedback || 0);
  const neg    = parseInt(cp.negative_feedback || 0);
  const cpTrades = parseInt(cp.total_trades || cp.trade_count || 0);
  const cc     = (cp.country || '').toLowerCase() || null;

  return (
    <>
      <style>{`@keyframes pmtBorderPulse{0%,100%{box-shadow:0 0 0 2px rgba(37,99,235,0.25),0 1px 6px rgba(0,0,0,0.06);}50%{box-shadow:0 0 0 3px rgba(37,99,235,0.5),0 2px 10px rgba(37,99,235,0.18);}}`}</style>
      <div className="rounded-xl mb-2.5 overflow-hidden w-full transition-all"
        style={{
          background: '#FFFFFF',
          border: trade.status === 'PAYMENT_SENT' ? '1px solid #2563EB50' : `1px solid ${cfg.statusColor}30`,
          borderLeft: trade.status === 'PAYMENT_SENT' ? '3.5px solid #2563EB' : `3.5px solid ${btnColor}`,
          boxShadow: '0 1.5px 6px rgba(0,0,0,0.05)',
          animation: trade.status === 'PAYMENT_SENT' ? 'pmtBorderPulse 2.5s ease-in-out infinite' : undefined,
        }}>

        {/* ── Header Row: Market Label + Role + Feedback/Trades + Status + Timer ── */}
        <div className="flex items-center justify-between px-3 pt-2 pb-1 gap-1.5 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="inline-flex items-center text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: market.bg, color: market.color }}>
              {market.label}
            </span>
            <span className="text-[10px] font-bold text-gray-400">
              {roleLabel}
            </span>
          </div>

          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full"
              style={{ backgroundColor: cfg.statusBg, color: cfg.statusColor }}>
              {cfg.label}
            </span>
            {['CREATED', 'FUNDS_LOCKED'].includes(trade.status) && effectiveExpiresAt && (
              <TradeTimer
                expiresAt={effectiveExpiresAt}
                timeLimitMins={timeLimitMins}
                onExpire={() => onExpire?.(trade.id)}
              />
            )}
            {['CREATED', 'FUNDS_LOCKED'].includes(trade.status) && !effectiveExpiresAt && (
              <span className="inline-flex items-center gap-0.5 text-[9px] font-black px-2 py-0.5 rounded-full"
                style={{ backgroundColor: '#DCFCE7', color: '#16A34A' }}>
                🔒 Locked
              </span>
            )}
            {trade.status === 'PAYMENT_SENT' && (
              <span className="inline-flex items-center gap-0.5 text-[9px] font-black px-2 py-0.5 rounded-full"
                style={{ backgroundColor: '#DBEAFE', color: '#1D4ED8' }}>
                🔒 Awaiting Release
              </span>
            )}
            {trade.status === 'DISPUTED' && (
              <span className="inline-flex items-center gap-0.5 text-[9px] font-black px-2 py-0.5 rounded-full"
                style={{ backgroundColor: '#FEE2E2', color: '#DC2626' }}>
                ⚖️ In Review
              </span>
            )}
          </div>
        </div>

        {/* ── Main Row: Counterparty info + Stats + Amounts + Action button ── */}
        <div className="px-3 py-1.5 flex items-center justify-between gap-2 flex-wrap sm:flex-nowrap">
          {/* Counterparty info + Trade stats & Feedback always visible */}
          <div className="flex items-center gap-1.5 min-w-0 flex-shrink-0 flex-wrap">
            <CountryFlag countryCode={cc} className="w-3.5 h-2.5 rounded-sm flex-shrink-0" />
            <button
              onClick={() => setShowPopup(true)}
              className="font-black text-xs truncate hover:underline decoration-dotted"
              style={{ color: btnColor, maxWidth: '95px' }}>
              {cp.username || '—'}
            </button>
            <span
              className={`inline-flex items-center font-bold px-1.5 py-0.2 rounded-full border flex-shrink-0 ${badge.animate ? 'shadow-sm' : ''}`}
              style={{
                background: badge.bg,
                borderColor: badge.borderColor,
                fontSize: '8.5px',
                boxShadow: badge.glow ? `0 0 5px ${badge.glow}` : undefined,
              }}>
              <span style={{ color: badge.iconColor || badge.textColor }}>{badge.icon}</span>
              <span style={{ color: badge.textColor }} className="ml-0.5">{badge.label}</span>
            </span>

            {/* Trade count & Positive/Negative feedback — ALWAYS VISIBLE ON ALL SCREENS */}
            <div className="flex items-center gap-1.5 text-[10px] font-semibold text-gray-500 bg-gray-50 px-1.5 py-0.5 rounded border border-gray-100">
              <span className="flex items-center gap-0.5 text-gray-600"><Repeat2 size={9} />{cpTrades}</span>
              <span className="flex items-center gap-0.5 text-emerald-600"><ThumbsUp size={9} />{pos}</span>
              <span className="flex items-center gap-0.5 text-rose-600"><ThumbsDown size={9} />{neg}</span>
            </div>
          </div>

          {/* Amount summary pill */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg flex-1 min-w-[170px] justify-between"
            style={{ backgroundColor: '#F8FAFC', border: '1px solid #F1F5F9' }}>
            <div className="min-w-0">
              <span className="text-[8px] font-black uppercase text-gray-400 block leading-none mb-0.5">You Pay</span>
              <span className="font-extrabold text-xs text-gray-900 leading-tight block truncate">
                {youPayAmt || '—'}
              </span>
            </div>

            <ArrowRight size={11} className="text-gray-400 flex-shrink-0" />

            <div className="min-w-0 text-right">
              <span className="text-[8px] font-black uppercase block leading-none mb-0.5" style={{ color: btnColor }}>You Get</span>
              <span className="font-extrabold text-xs leading-tight block truncate" style={{ color: btnColor }}>
                {youRecvAmt || '—'}
              </span>
            </div>
          </div>

          {/* Action Button */}
          <button
            onClick={() => navigate(`/trade/${trade.id}`)}
            className="px-3 py-1.5 text-white text-[11px] font-black tracking-wider uppercase rounded-lg flex items-center justify-center gap-1 hover:opacity-90 active:scale-[0.98] transition-all flex-shrink-0 w-full sm:w-auto"
            style={{ backgroundColor: trade.status === 'PAYMENT_SENT' ? '#2563EB' : btnColor }}>
            <span>{trade.status === 'PAYMENT_SENT' ? 'Open' : 'Attend'}</span>
            <ArrowRight size={11} />
          </button>
        </div>

        {/* ── Payment-sent notice bar ── */}
        {trade.status === 'PAYMENT_SENT' && (
          <div className="mx-3 mb-2 px-2.5 py-1 rounded-md flex items-center gap-1.5"
            style={{ backgroundColor: '#EFF6FF', border: '1px solid #BFDBFE' }}>
            <span className="text-xs">✅</span>
            <p className="text-[10px] font-bold leading-tight" style={{ color: '#1E40AF' }}>
              Payment sent — awaiting Bitcoin release from {cp.username || 'seller'}
            </p>
          </div>
        )}
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
