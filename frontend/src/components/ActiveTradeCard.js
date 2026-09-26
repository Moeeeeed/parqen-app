import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ThumbsUp, ThumbsDown, ChevronRight, X, Repeat2, Star } from 'lucide-react';
import axios from 'axios';
import CountryFlag from './CountryFlag';
import { deriveBadge } from '../lib/badge';

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

function fmtLocal(cur, amount) {
  if (!amount || isNaN(parseFloat(amount))) return null;
  const num = parseFloat(amount);
  const code = (cur && cur.length === 3) ? cur.toUpperCase() : 'USD';
  return `${num.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ${code}`;
}

function fmtBtc(amount, isUsdt) {
  if (!amount || isNaN(parseFloat(amount))) return isUsdt ? '0.00 USDT' : '0.000000 BTC';
  const num = parseFloat(amount);
  if (isUsdt) return `${num.toFixed(2)} USDT`;
  return `${num.toFixed(6)} BTC`;
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
    || 'GHS';
  const cleanCur = String(rawCur).toUpperCase();

  const fiatNum   = parseFloat(trade.amount_local || trade.fiat_amount || trade.amount_fiat || trade.amount_usd || trade.amount || 0);
  const cryptoNum = parseFloat(trade.amount_btc || trade.amount_usdt || trade.crypto_amount || trade.amount_crypto || trade.btc_amount || trade.usdt_amount || 0);

  const fmtFiat   = `${fiatNum.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ${cleanCur}`;
  const fmtCrypto = fmtBtc(cryptoNum, isUsdt);

  const rawPm = trade.listing?.payment_method || trade.payment_method || trade.pay_method || 'Mobile Money';
  const pmName = formatPaymentMethod(rawPm);

  const payTitle   = isBuyer ? `Pay ${pmName}` : `Pay (${assetTag})`;
  const payVal     = isBuyer ? fmtFiat : fmtCrypto;
  const recvTitle  = isBuyer ? `Receive (${assetTag})` : `Receive ${pmName}`;
  const recvVal    = isBuyer ? fmtCrypto : fmtFiat;

  const pos       = parseInt(cp.positive_feedback || 0);
  const neg       = parseInt(cp.negative_feedback || 0);
  const total     = pos + neg;
  const trust     = total > 0 ? Math.round(pos / total * 100) : parseInt(cp.total_trades || cp.trade_count || 0) > 0 ? 100 : 100;
  const cc        = (cp.country || '').toLowerCase() || null;
  const startedAt = timeAgo(trade.created_at);

  return (
    <>
      <div
        onClick={() => navigate(`/trade/${trade.id}`)}
        className="bg-white rounded-2xl p-4 mb-3 border border-gray-200/90 shadow-sm cursor-pointer hover:shadow-md transition-all relative overflow-hidden"
      >
        {/* Top Header Row: Counterparty Avatar, Username, Trust, and Status Pill */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex items-center gap-3 min-w-0">
            <div
              onClick={(e) => { e.stopPropagation(); setShowPopup(true); }}
              className="w-10 h-10 rounded-xl bg-gray-100 border border-gray-200 flex items-center justify-center text-gray-500 font-bold text-sm shrink-0 hover:bg-gray-200 transition"
            >
              {cp.avatar_url ? (
                <img src={cp.avatar_url} alt="" className="w-full h-full rounded-xl object-cover" />
              ) : (
                (cp.username || '?').charAt(0).toUpperCase()
              )}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <CountryFlag countryCode={cc} className="w-4 h-3 rounded-sm shrink-0" />
                <button
                  onClick={(e) => { e.stopPropagation(); setShowPopup(true); }}
                  className="font-black text-sm text-gray-900 truncate hover:underline underline-offset-2"
                >
                  {cp.username || '—'}
                </button>
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-500 font-medium mt-0.5">
                <span className="flex items-center gap-1 font-semibold text-gray-700">
                  <ThumbsUp size={11} className="text-emerald-600" /> {trust}%
                </span>
                <span>•</span>
                <span>Seen {timeAgo(cp.last_seen_at || cp.last_login)}</span>
              </div>
            </div>
          </div>

          {/* Right Status Badge */}
          <span
            className="px-2.5 py-1 rounded-md text-xs font-black shrink-0 tracking-tight"
            style={{ backgroundColor: cfg.statusBg, color: cfg.statusColor }}
          >
            {cfg.label}
          </span>
        </div>

        {/* Middle Row: Pay Amount & Receive Amount */}
        <div className="grid grid-cols-2 gap-4 py-2 border-t border-gray-100">
          <div className="min-w-0">
            <span className="text-xs font-bold text-gray-500 block mb-0.5 whitespace-nowrap truncate">{payTitle}</span>
            <span className="text-base sm:text-lg font-black text-gray-900 block truncate">{payVal}</span>
          </div>
          <div className="text-right min-w-0">
            <span className="text-xs font-bold text-gray-500 block mb-0.5 whitespace-nowrap truncate">{recvTitle}</span>
            <span className="text-base sm:text-lg font-black text-gray-900 block truncate">{recvVal}</span>
          </div>
        </div>

        {/* Bottom Row: Started Time + Action Button */}
        <div className="mt-3 pt-2.5 bg-gray-50 -mx-4 -mb-4 px-4 py-3 rounded-b-2xl flex items-center justify-between border-t border-gray-100">
          <div>
            <span className="text-[11px] font-extrabold text-gray-400 uppercase tracking-wider block">Started</span>
            <span className="text-xs font-black text-gray-800">{startedAt}</span>
          </div>

          <button
            onClick={(e) => { e.stopPropagation(); navigate(`/trade/${trade.id}`); }}
            className="w-9 h-9 rounded-xl bg-emerald-500 text-white flex items-center justify-center shadow-md hover:bg-emerald-600 active:scale-95 transition"
            title="Open Trade"
          >
            <ChevronRight size={20} strokeWidth={3} />
          </button>
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