import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { API_URL } from '../App';
import { Timer, ArrowRight, Bell, X, Zap, Shield } from 'lucide-react';

const C = {
  forest:'#1B4332', green:'#2D6A4F', mint:'#40916C',
  gold:'#F4A422', g50:'#F8FAFC', g100:'#F1F5F9', g200:'#E2E8F0',
  g400:'#94A3B8', g500:'#64748B', g600:'#475569',
  success:'#10B981', danger:'#EF4444', paid:'#3B82F6', online:'#22C55E',
};

const STATUS_MAP = {
  CREATED:      { label:'Escrow Active', color:C.green,  bg:`${C.green}15`  },
  FUNDS_LOCKED: { label:'Escrow Active', color:C.green,  bg:`${C.green}15`  },
  PAYMENT_SENT: { label:'Payment Sent',  color:C.paid,   bg:`${C.paid}15`   },
  PAID:         { label:'Payment Sent',  color:C.paid,   bg:`${C.paid}15`   },
  DISPUTED:     { label:'Disputed',      color:C.danger, bg:`${C.danger}15` },
};
const getStatus = s => STATUS_MAP[s?.toUpperCase()] || STATUS_MAP.CREATED;

const symMap = { GHS:'₵', NGN:'₦', KES:'KSh', ZAR:'R', USD:'$', GBP:'£', EUR:'€', UGX:'USh' };
const fmt    = n => new Intl.NumberFormat('en-US',{minimumFractionDigits:0,maximumFractionDigits:0}).format(n||0);
const flag   = code => !code||code.length!==2?'🌍':code.toUpperCase().replace(/./g,c=>String.fromCodePoint(0x1F1E0+c.charCodeAt(0)-65));
const isGiftTrade = t => !!(t.trade_type?.toUpperCase().includes('GIFT')||t.listing?.listing_type?.toUpperCase().includes('GIFT'));
const tradeColor  = (isGift, isBuyer) => isGift ? '#8B5CF6' : isBuyer ? '#F59E0B' : '#2D6A4F';

// Only real DB active statuses — COMPLETED and CANCELLED are NOT active
const ACTIVE_STATUSES = new Set(['CREATED','FUNDS_LOCKED','PAYMENT_SENT','PAID','DISPUTED']);
const isActive = s => ACTIVE_STATUSES.has((s||'').toUpperCase());

const matchesPage = (trade, page) => {
  if (!isActive(trade.status)) return false;
  const isGC = !!(
    trade.trade_type?.toUpperCase().includes('GIFT') ||
    trade.listing?.listing_type?.toUpperCase().includes('GIFT')
  );
  if (isGC) return page === 'gift-cards';
  const type = (trade.trade_type || '').toUpperCase();
  if (page === 'buy')  return type === 'BUY';
  if (page === 'sell') return type === 'SELL';
  return false;
};

// sessionStorage helpers — popup fires only once per trade per browser session
const SEEN_KEY = 'praqen_shown_trade_alerts';
const getSeenIds = () => {
  try { return new Set(JSON.parse(sessionStorage.getItem(SEEN_KEY) || '[]')); }
  catch { return new Set(); }
};
const markSeen = ids => {
  try {
    const seen = getSeenIds();
    ids.forEach(id => seen.add(String(id)));
    sessionStorage.setItem(SEEN_KEY, JSON.stringify([...seen]));
  } catch {}
};

// ─── Individual trade card ───────────────────────────────────────────────────
function TradeCard({ trade, user, onClose, onExpire }) {
  const isBuyer   = String(user?.id) === String(trade.buyer_id);
  const st        = getStatus(trade.status);
  const cp        = isBuyer ? (trade.seller||{}) : (trade.buyer||{});
  const cpName    = cp.username||(isBuyer?trade.seller_name:trade.buyer_name)||'—';
  const cpFlag    = flag(cp.country||trade.listing?.country||'');
  const isGift    = isGiftTrade(trade);
  const typeColor = tradeColor(isGift, isBuyer);
  const typeLabel = isGift ? '🎁 GIFT CARD' : isBuyer ? '🛒 BUYING BTC' : '💰 SELLING BTC';

  const cur       = trade.local_currency || trade.currency || '';
  const sym       = symMap[cur] || '';
  const localAmt  = trade.amount_local || trade.local_amount || 0;
  const btcAmt    = parseFloat(trade.amount_btc || 0);
  // Additive fee model: the seller pays the platform fee on top — the buyer
  // always receives the full escrowed amount, nothing deducted.
  const btcNet    = btcAmt;
  const payDisp   = localAmt ? `${sym}${fmt(localAmt)} ${cur}` : `$${fmt(trade.amount_usd||0)} USD`;

  // Parse as UTC — Supabase TIMESTAMP cols return without 'Z', causing local-time misparse
  const toUTC = s => new Date(/[Z+]/.test(s) ? s : s + 'Z');
  const deadline = trade.expires_at
    ? toUTC(trade.expires_at).getTime()
    : toUTC(trade.created_at).getTime() + 30*60*1000;
  const [timeLeft, setTimeLeft] = useState(null);
  const [isUrgent, setIsUrgent] = useState(false);
  const expiredRef = React.useRef(false);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const tick = () => {
      const diff = Math.max(0, deadline - Date.now());
      const secs = Math.floor(diff / 1000);
      setTimeLeft(secs);
      setIsUrgent(diff > 0 && diff < 300000);
      if (diff === 0 && !expiredRef.current) {
        expiredRef.current = true;
        axios.post(`${API_URL}/trades/${trade.id}/auto-cancel`,
          { reason: '30-minute payment window expired' }, { headers }
        ).catch(() => {});
        setTimeout(() => onExpire && onExpire(trade.id), 2500);
      }
    };
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [trade.id, trade.created_at]);

  const fmtT = s => {
    if (s === null) return '--:--';
    if (s <= 0) return '00:00';
    return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
  };

  const isPaid    = ['PAYMENT_SENT','PAID'].includes(trade.status?.toUpperCase());
  const borderCol = (isUrgent && !isPaid) ? C.danger : typeColor;

  const actionMsg = isBuyer
    ? isPaid ? `✅ Payment sent — awaiting release from ${cpName}`
             : `💸 Send ${payDisp} via ${trade.payment_method||'—'} to ${cpName}`
    : isPaid ? `🔓 ${cpName} paid! Check ${trade.payment_method||'—'} and RELEASE BITCOIN`
             : `⏳ Waiting for ${cpName} to send payment…`;

  return (
    <div className="rounded-2xl border-2 overflow-hidden" style={{ borderColor: borderCol }}>

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5"
        style={{ backgroundColor: `${typeColor}12` }}>
        <span className="font-black text-xs px-3 py-1 rounded-full text-white"
          style={{ backgroundColor: typeColor }}>
          {typeLabel}
        </span>
        <div className="flex items-center gap-2">
          {timeLeft !== null && !isPaid && (
            <span className={`font-mono text-xs font-black px-2 py-0.5 rounded-full ${isUrgent?'animate-pulse':''}`}
              style={{ backgroundColor: isUrgent ? C.danger : typeColor, color: '#fff' }}>
              <Timer size={9} className="inline mr-0.5" />{fmtT(timeLeft)}
            </span>
          )}
          <span className="font-mono text-xs" style={{ color: C.g400 }}>
            #{String(trade.id||'').slice(0,8).toUpperCase()}
          </span>
        </div>
      </div>

      {/* Action prompt */}
      <div className="px-4 py-2 border-b" style={{ borderColor: C.g100, backgroundColor: '#fffef9' }}>
        <p className="text-xs font-bold leading-snug" style={{ color: C.forest }}>{actionMsg}</p>
      </div>

      {/* Details */}
      <div className="px-4 py-3 space-y-2 bg-white">
        <div className="flex justify-between text-xs">
          <span style={{ color: C.g500 }}>👤 {isBuyer?'Seller':'Buyer'}</span>
          <span className="font-bold" style={{ color: C.forest }}>{cpFlag} {cpName}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span style={{ color: C.g500 }}>💳 Payment</span>
          <span className="font-bold">{trade.payment_method||'—'}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span style={{ color: C.g500 }}>💵 {isBuyer?'You Pay':'Buyer Pays'}</span>
          <span className="font-black" style={{ color: C.forest }}>{payDisp}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span style={{ color: C.g500 }}>🔒 BTC Escrow</span>
          <span className="font-black" style={{ color: '#F59E0B' }}>₿{btcAmt.toFixed(8)}</span>
        </div>
        <div className="flex justify-between text-xs pt-1 border-t" style={{ borderColor: C.g100 }}>
          <span style={{ color: C.g500 }}>✅ You Receive</span>
          <span className="font-black" style={{ color: isBuyer ? C.success : typeColor }}>
            {isBuyer ? `₿${btcNet.toFixed(8)}` : payDisp}
          </span>
        </div>
        {isBuyer && (
          <p className="text-[9px] text-right -mt-1" style={{ color: C.g400 }}>full amount · seller pays the fee</p>
        )}
        <div className="flex justify-between text-xs">
          <span style={{ color: C.g500 }}>📊 Status</span>
          <span className="font-bold px-2 py-0.5 rounded-full text-xs"
            style={{ backgroundColor: st.bg, color: st.color }}>{st.label}</span>
        </div>
      </div>

      {isUrgent && !isPaid && (
        <div className="px-4 py-2 border-t animate-pulse" style={{ borderColor: C.danger, backgroundColor: `${C.danger}08` }}>
          <p className="text-xs font-black" style={{ color: C.danger }}>
            ⚠️ Under 5 min left! Trade cancels at 00:00 — BTC returns to wallet instantly.
          </p>
        </div>
      )}

      {/* CTA */}
      <div className="px-4 pb-3 bg-white">
        <Link to={`/trade/${trade.id}`} onClick={onClose}
          className="flex items-center justify-center gap-2 py-2.5 rounded-xl text-white font-black text-xs w-full hover:opacity-90 transition shadow"
          style={{ backgroundColor: isUrgent ? C.danger : typeColor }}>
          <Zap size={13} /> Open Trade Now <ArrowRight size={12} />
        </Link>
      </div>
    </div>
  );
}

// ─── Main export ─────────────────────────────────────────────────────────────
// Props:
//   user        — logged-in user object (needs .id)
//   currentPage — 'buy' | 'sell' | 'gift-cards'
//
// Popup fires ONCE per trade ID per browser session (sessionStorage).
// After dismiss the modal is gone — no floating bubble, no re-trigger.
export default function ActiveTradeBanner({ user, currentPage }) {
  const [relevant,  setRelevant]  = useState([]);
  const [showModal, setShowModal] = useState(false);

  // Remove a trade from the relevant list when its timer hits 0
  const handleExpire = (tradeId) => {
    setRelevant(prev => prev.filter(t => String(t.id) !== String(tradeId)));
  };

  useEffect(() => {
    if (!user) return;
    const token   = localStorage.getItem('token');
    const headers = token ? { Authorization: `Bearer ${token}` } : {};

    const load = async () => {
      try {
        const r      = await axios.get(`${API_URL}/my-trades`, { headers });
        const trades = r.data.trades || [];
        const pageActive = trades.filter(t => matchesPage(t, currentPage));
        setRelevant(pageActive);
        const fresh = pageActive.filter(t => !getSeenIds().has(String(t.id)));
        if (fresh.length > 0) {
          markSeen(fresh.map(t => t.id));
          setShowModal(true);
        }
      } catch {}
    };

    load();
    const iv = setInterval(load, 30000);
    return () => clearInterval(iv);
  }, [user, currentPage]);

  // Auto-close modal if all trades expired/gone
  useEffect(() => {
    if (relevant.length === 0) setShowModal(false);
  }, [relevant]);

  if (!showModal || relevant.length === 0) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }}>
      <div className="bg-white rounded-3xl shadow-2xl w-full overflow-hidden"
        style={{ maxWidth: 480, maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}>

        <div className="flex items-center gap-3 px-5 py-4"
          style={{ background: `linear-gradient(135deg,${C.forest},${C.mint})` }}>
          <div className="w-3 h-3 rounded-full animate-pulse flex-shrink-0" style={{ backgroundColor: C.online }}/>
          <Bell size={16} className="text-white flex-shrink-0"/>
          <div className="flex-1 min-w-0">
            <p className="text-white font-black text-sm">⚡ Active Trade — Action Required</p>
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.7)' }}>
              30 min window · BTC in escrow
            </p>
          </div>
          <button onClick={() => setShowModal(false)} className="text-white/50 hover:text-white transition flex-shrink-0">
            <X size={18}/>
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-4 space-y-3">
          {relevant.map(trade => (
            <TradeCard
              key={trade.id}
              trade={trade}
              user={user}
              onClose={() => setShowModal(false)}
              onExpire={handleExpire}
            />
          ))}
        </div>

        <div className="px-5 py-3 border-t flex items-center justify-between"
          style={{ borderColor: C.g200, backgroundColor: C.g50 }}>
          <div className="flex items-center gap-1.5">
            <Shield size={12} style={{ color: C.green }}/>
            <p className="text-xs font-semibold" style={{ color: C.g500 }}>
              Escrow-protected · 2% fee on completion only
            </p>
          </div>
          <button onClick={() => setShowModal(false)}
            className="text-xs font-bold px-4 py-2 rounded-xl border hover:bg-gray-50 transition"
            style={{ borderColor: C.g200, color: C.g600 }}>
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
