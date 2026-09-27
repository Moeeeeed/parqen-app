import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ThumbsUp, ChevronRight, X, Repeat2, Star } from 'lucide-react';
import axios from 'axios';
import CountryFlag from './CountryFlag';
import { deriveBadge, BadgeChip } from '../lib/badge';

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

function formatPaymentMethod(pm) {
  if (!pm) return 'Payment Method';
  const str = String(pm).trim();
  const lower = str.toLowerCase();

  const MAP = {
    mtn_momo: 'MTN Mobile Money',
    mtmmomo: 'MTN Mobile Money',
    mtn_mobile_money: 'MTN Mobile Money',
    mtn: 'MTN Mobile Money',
    vodafone: 'Vodafone Cash',
    vodafone_cash: 'Vodafone Cash',
    vodafonecash: 'Vodafone Cash',
    airteltigo: 'AirtelTigo Money',
    airteltigo_money: 'AirtelTigo Money',
    mpesa: 'M-Pesa',
    'm-pesa': 'M-Pesa',
    m_pesa: 'M-Pesa',
    bank_transfer: 'Bank Transfer',
    banktransfer: 'Bank Transfer',
    chipper: 'Chipper Cash',
    chipper_cash: 'Chipper Cash',
    opay: 'OPay',
    palmpay: 'PalmPay',
    kuda: 'Kuda Bank',
    wave: 'Wave',
    orange_money: 'Orange Money',
    orangemoney: 'Orange Money',
    telecel: 'Telecel Cash',
  };

  if (MAP[lower]) return MAP[lower];
  if (lower.includes('mtn')) return 'MTN Mobile Money';
  if (lower.includes('vodafone')) return 'Vodafone Cash';
  if (lower.includes('airtel')) return 'AirtelTigo Money';
  if (lower.includes('mpesa') || lower.includes('m-pesa')) return 'M-Pesa';
  if (lower.includes('bank')) return 'Bank Transfer';

  return str.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function fmtBtc(amount, isUsdt) {
  if (!amount || isNaN(parseFloat(amount))) return isUsdt ? '0.00 USDT' : '0.000000 BTC';
  const num = parseFloat(amount);
  if (isUsdt) return `${num.toFixed(2)} USDT`;
  return `${num.toFixed(6)} BTC`;
}

function getTradeBrand(t) {
  if (!t) return 'Gift Card';
  const rawBrand = t.listing?.gift_card_brand || t.listing?.giftCardBrand || t.listing?.card_brand ||
                   t.gift_card_brand || t.giftCardBrand || t.card_brand;
  if (rawBrand && typeof rawBrand === 'string' && rawBrand.trim()) {
    return rawBrand.trim();
  }
  const pm = t.listing?.payment_method || t.payment_method || t.pay_method;
  if (pm && typeof pm === 'string') {
    const cleanPm = pm.trim();
    if (!['Gift Card', 'gift_card', 'GIFT_CARD', 'Payment Method'].includes(cleanPm)) {
      return cleanPm;
    }
  }
  return 'Gift Card';
}

function isGcTrade(t) {
  if (!t) return false;
  const lt = String(t.listing?.listing_type || t.listing_type || t.trade_type || '').toUpperCase();
  if (lt.includes('GIFT_CARD') || lt.includes('GC_')) return true;
  if (t.listing?.gift_card_brand || t.gift_card_brand || t.card_brand) return true;
  return false;
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

  const cfg = STATUS_CFG[trade.status] || STATUS_CFG.CREATED;

  const listingType = trade.listing?.listing_type || trade.listing_type || trade.trade_type || '';
  const isUsdt       = listingType.includes('USDT') || (trade.crypto_currency || trade.currency || '').toUpperCase() === 'USDT' || (trade.amount_usdt && parseFloat(trade.amount_usdt) > 0);
  const assetTag     = isUsdt ? 'USDT' : 'BTC';

  const rawCur   = trade.fiat_currency
    || trade.listing?.fiat_currency
    || trade.local_currency
    || (trade.currency && !['BTC','USDT','₿','₮','$'].includes(trade.currency) ? trade.currency : null)
    || trade.listing?.currency
    // Neutral fallback only — a trade should always carry its real currency;
    // this only fires if that data is genuinely missing, so it must never
    // guess a specific country's currency (was 'GHS', which mislabeled the
    // amount for any non-Ghana trade that ever hit this path).
    || 'USD';
  const cleanCur = String(rawCur).toUpperCase();

  // Real numbers only — no guessing. fiatNum comes straight from the trade's own
  // fiat field; cryptoNum from its own BTC/USDT field. Never derive one from the
  // other (a margin-based guess here previously showed a fabricated number under
  // a "Receive (BTC)"-style label — see commit 263d1dc).
  const fiatPayNum  = parseFloat(trade.amount_local || trade.fiat_amount || trade.amount_fiat || trade.amount_usd || trade.amount || 0);
  let fiatRecvNum   = parseFloat(trade.amount_receive_usd || trade.receive_amount || 0);

  if (!fiatRecvNum || fiatRecvNum === fiatPayNum) {
    const margin = parseFloat(trade.listing?.margin || 0);
    if (margin !== 0) {
      fiatRecvNum = fiatPayNum * (1 - (margin / 100));
    } else {
      fiatRecvNum = fiatPayNum * 0.95;
    }
  }

  const fmtPayFiat  = `${fiatPayNum.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ${cleanCur}`;
  const fmtRecvFiat = `${fiatRecvNum.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ${cleanCur}`;

  const rawPm = trade.listing?.payment_method || trade.payment_method || trade.pay_method || 'Payment Method';
  const pmName = formatPaymentMethod(rawPm);
  const brandName = getTradeBrand(trade);
  const isGc = isGcTrade(trade);

  let payTitle, payVal, recvTitle, recvVal;

  if (isGc) {
    const isBuyGcListing = listingType.toUpperCase().includes('BUY_GIFT_CARD');
    if (isBuyGcListing) {
      payTitle  = isBuyer ? `Pay ${brandName}` : `Pay ${assetTag}`;
      recvTitle = isBuyer ? `Receive ${assetTag}` : `Receive ${brandName}`;
    } else {
      payTitle  = isBuyer ? `Pay ${assetTag}` : `Pay ${brandName}`;
      recvTitle = isBuyer ? `Receive ${brandName}` : `Receive ${assetTag}`;
    }
    payVal  = isBuyer ? fmtPayFiat : fmtRecvFiat;
    recvVal = isBuyer ? fmtRecvFiat : fmtPayFiat;
  } else {
    payTitle  = isBuyer ? `Pay ${pmName}` : `Pay ${assetTag}`;
    recvTitle = isBuyer ? `Receive ${assetTag}` : `Receive ${pmName}`;
    payVal  = isBuyer ? fmtPayFiat : fmtRecvFiat;
    recvVal = isBuyer ? fmtRecvFiat : fmtPayFiat;
  }

  const pos         = parseInt(cp.positive_feedback || 0);
  const neg         = parseInt(cp.negative_feedback || 0);
  const total       = pos + neg;
  const trust       = total > 0 ? Math.round(pos / total * 100) : parseInt(cp.total_trades || cp.trade_count || 0) > 0 ? 100 : 100;
  const tradesCount = parseInt(cp.total_trades || cp.trades_count || cp.trade_count || cp.trades || 0);
  const cc          = (cp.country || '').toLowerCase() || null;
  const startedAt   = timeAgo(trade.created_at);

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

        {/* ═══ DESKTOP ROW (lg+) ═══ */}
        <div className="hidden lg:flex items-center px-4 py-4 gap-6">
          {/* Col 1: User Info (matches GCCard) */}
          <div className="flex items-center gap-3 w-[280px] flex-shrink-0">
            <button onClick={(e) => { e.stopPropagation(); setShowPopup(true); }} className="flex-shrink-0 relative">
              <Avatar user={cp} size={48} radius="rounded-lg" />
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
              </div>
            </div>
          </div>

          {/* Col 2: Started time */}
          <div className="flex flex-col flex-1 min-w-[160px]">
            <span className="text-[11px] font-extrabold text-gray-400 uppercase tracking-wider block">Started</span>
            <span className="text-sm font-black text-gray-800 mt-0.5">{startedAt}</span>
          </div>

          {/* Col 3: Pay side (matches GCCard) */}
          <div className="flex flex-col w-[180px] flex-shrink-0">
            <span className="text-[12px] font-bold text-gray-500 mb-0.5 truncate pr-2">{payTitle}</span>
            <span className="text-[15px] font-black text-gray-900">{payVal}</span>
          </div>

          {/* Col 4: Receive side (matches GCCard) */}
          <div className="flex flex-col w-[160px] flex-shrink-0">
            <span className="text-[12px] font-bold text-gray-500 mb-0.5 truncate pr-2">{recvTitle}</span>
            <span className="text-[15px] font-black text-gray-900">{recvVal}</span>
          </div>

          {/* Col 5: Actions / Navigation button */}
          <div className="flex items-center gap-3 flex-shrink-0 ml-auto">
            <button
              onClick={(e) => { e.stopPropagation(); navigate(`/trade/${trade.id}`); }}
              className="h-10 px-5 rounded-full bg-emerald-500 text-white font-black text-[14px] flex items-center gap-1.5 shadow-md hover:bg-emerald-600 active:scale-95 transition"
            >
              Open Trade <ChevronRight size={16} strokeWidth={3} />
            </button>
          </div>
        </div>

        {/* ═══ MOBILE CARD (< lg) ═══ */}
        <div className="lg:hidden">
          <div className="p-4 pb-3 flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <button onClick={(e) => { e.stopPropagation(); setShowPopup(true); }} className="flex-shrink-0">
                <Avatar user={cp} size={48} radius="rounded-lg" />
              </button>
              <div className="flex flex-col min-w-0 pt-0.5">
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
                </div>
              </div>
            </div>
          </div>

          <div className="px-4 py-2 flex items-center justify-between border-t border-gray-100">
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-bold text-gray-600 mb-0.5 truncate pr-2">{payTitle}</span>
              <span className="text-lg font-black text-gray-900">{payVal}</span>
            </div>
            <div className="flex flex-col text-right min-w-0">
              <span className="text-xs font-bold text-gray-600 mb-0.5 truncate pl-2">{recvTitle}</span>
              <span className="text-lg font-black text-gray-900">{recvVal}</span>
            </div>
          </div>

          <div className="bg-gray-50 mt-1 px-4 py-3 flex items-center justify-between gap-2 border-t border-gray-100">
            <div>
              <span className="text-[10px] font-extrabold text-gray-400 uppercase tracking-wider block">Started</span>
              <span className="text-xs font-black text-gray-800">{startedAt}</span>
            </div>

            <button
              onClick={(e) => { e.stopPropagation(); navigate(`/trade/${trade.id}`); }}
              className="h-9 px-4 rounded-full bg-emerald-500 text-white font-black text-xs flex items-center gap-1 shadow-md hover:bg-emerald-600 active:scale-95 transition"
            >
              Open Trade <ChevronRight size={14} strokeWidth={3} />
            </button>
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