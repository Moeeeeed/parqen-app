import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { API_URL } from '../App';
import { Timer, ArrowRight, Bell, X, Zap, Shield,
  User, Banknote, CreditCard, BarChart3, Unlock, ShoppingCart, Wallet, CheckCircle, Clock } from 'lucide-react';

// ─── Constants ───────────────────────────────────────────────────────────────
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

const symMap = { GHS:'₵', NGN:'₦', KES:'KSh', ZAR:'R', USD:'$', GBP:'£', EUR:'€' };
const fmt    = n => new Intl.NumberFormat('en-US', { minimumFractionDigits:0, maximumFractionDigits:0 }).format(n||0);

// Only real DB statuses — COMPLETED and CANCELLED are NOT active
const ACTIVE_STATUSES = new Set(['CREATED','FUNDS_LOCKED','PAYMENT_SENT','PAID','DISPUTED']);
const isActive = s => ACTIVE_STATUSES.has((s||'').toUpperCase());

// Match a trade to the page it belongs on
const matchesPage = (trade, page) => {
  if (!isActive(trade.status)) return false;
  const isGC = !!(
    trade.trade_type?.toUpperCase().includes('GIFT') ||
    trade.listing?.listing_type?.toUpperCase().includes('GIFT')
  );
  if (isGC)        return page === 'gift-cards';
  const type = (trade.trade_type || '').toUpperCase();
  if (page === 'buy')  return type === 'BUY';
  if (page === 'sell') return type === 'SELL';
  return false;
};

// sessionStorage helpers — track which trade IDs have already been popped up
// Uses the session (tab lifetime) so users only see each trade once per visit
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
function TradeCard({ trade, user, onClose }) {
  const isBuyer  = String(user?.id) === String(trade.buyer_id);
  const isSeller = String(user?.id) === String(trade.seller_id);
  // Gift card trades flip roles: seller_id is whoever brings the card (spends it to
  // ACQUIRE BTC — they're "buying"); buyer_id holds the BTC and gives it up for the
  // card ("selling"). Mirrors TradeDetail.js's isGiftCardTrade detection.
  const gcBrand = (trade?.gift_card_brand || '').toLowerCase().trim();
  const BTCBrands = ['bitcoin', 'btc', 'sell bitcoin', 'buy bitcoin', ''];
  const isGiftCardTrade = !!(
    (gcBrand && !BTCBrands.includes(gcBrand)) ||
    trade?.listing?.listing_type?.toUpperCase().includes('GIFT_CARD')
  );
  const st       = getStatus(trade.status);
  const cpName   = isBuyer
    ? (trade.seller?.username || trade.seller_name || '—')
    : (trade.buyer?.username  || trade.buyer_name  || '—');

  const cur      = trade.local_currency || trade.currency || '';
  const sym      = symMap[cur] || '';
  const localAmt = trade.amount_local || trade.local_amount || 0;
  const payDisp  = localAmt
    ? `${sym}${fmt(localAmt)} ${cur}`
    : `$${fmt(trade.amount_usd || 0)} USD`;
  const btcAmt   = parseFloat(trade.amount_btc || 0).toFixed(8);

  // Parse as UTC — Supabase TIMESTAMP cols return without 'Z', causing local-time misparse
  const toUTC = s => s ? new Date(/[Z+]/.test(s) ? s : s + 'Z') : null;
  // Live countdown — sanitize limit, prefer expires_at with validation
  const rawLimit  = parseInt(trade.listing?.time_limit || trade.time_limit || 30);
  const minsLimit = rawLimit > 1440 ? Math.min(480, Math.round(rawLimit / 60)) : Math.min(480, Math.max(5, rawLimit));
  const computedMs = (toUTC(trade.created_at) || new Date()).getTime() + minsLimit * 60000;
  // Use expires_at only if it's within 2× the limit of computed, otherwise use computed
  const deadlineMs = (() => {
    if (!trade.expires_at) return computedMs;
    const srv = toUTC(trade.expires_at).getTime();
    const diff = Math.abs(srv - computedMs);
    return diff <= minsLimit * 60 * 2000 ? srv : computedMs;
  })();

  const [timeLeft, setTimeLeft] = useState('');
  const [isUrgent, setIsUrgent] = useState(false);

  useEffect(() => {
    const tick = () => {
      const diff = deadlineMs - Date.now();
      if (diff <= 0) { setTimeLeft(''); setIsUrgent(false); return; }
      const m = Math.floor(diff / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setTimeLeft(`${m}:${String(s).padStart(2, '0')}`);
      setIsUrgent(diff < 300000);
    };
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [deadlineMs]);

  const isPaid      = ['PAYMENT_SENT','PAID'].includes(trade.status?.toUpperCase());
  const borderColor = isUrgent ? C.danger : st.color;
  const roleColor   = isBuyer  ? C.gold   : C.forest;

  // Who sends the "payment" (fiat/gift-card code) vs who releases BTC flips for gift
  // card trades: the card bringer (seller) sends the code; the BTC holder (buyer)
  // verifies and releases. See TradeDetail.js showMarkPaid/showRelease.
  const mustPay = isGiftCardTrade ? isSeller : isBuyer;
  const actionMsg = mustPay
    ? isPaid
        ? <><CheckCircle size={13} className="inline-block mr-1" style={{ color: C.success }} />{isGiftCardTrade ? 'Code sent' : 'Payment sent'} — awaiting release from {cpName}</>
        : isGiftCardTrade
          ? <><Banknote size={13} className="inline-block mr-1" />Send your gift card code to {cpName}</>
          : <><Banknote size={13} className="inline-block mr-1" />Send {payDisp} via {trade.payment_method || '—'} to {cpName}</>
    : isPaid
        ? <><Unlock size={13} className="inline-block mr-1" />{cpName} {isGiftCardTrade ? 'sent the code' : 'paid'}! {isGiftCardTrade ? 'Verify it' : `Check ${trade.payment_method || '—'}`} and RELEASE BITCOIN</>
        : <><Clock size={13} className="inline-block mr-1" />Waiting for {cpName} to send {isGiftCardTrade ? 'the gift card code' : 'payment'}…</>;

  return (
    <div className="rounded-2xl border-2 overflow-hidden" style={{ borderColor }}>

      {/* Role badge + timer */}
      <div className="flex items-center justify-between px-4 py-2.5"
        style={{ backgroundColor: isUrgent ? `${C.danger}12` : `${st.color}12` }}>
        <span className="font-black text-xs px-3 py-1 rounded-full"
          style={{ backgroundColor: roleColor, color: '#fff' }}>
          {(isGiftCardTrade ? isSeller : isBuyer)
            ? <><ShoppingCart size={11} className="inline-block mr-1" />YOU ARE BUYING</>
            : <><Wallet size={11} className="inline-block mr-1" />YOU ARE SELLING</>}
        </span>
        <div className="flex items-center gap-2">
          {timeLeft && timeLeft !== 'Expired' && (
            <span className={`font-mono text-xs font-black px-2 py-0.5 rounded-full ${isUrgent ? 'animate-pulse' : ''}`}
              style={{ backgroundColor: isUrgent ? C.danger : st.color, color: '#fff' }}>
              <Timer size={9} className="inline mr-0.5" />{timeLeft}
            </span>
          )}
          <span className="font-mono text-xs" style={{ color: C.g400 }}>
            #{String(trade.id || '').slice(0, 8).toUpperCase()}
          </span>
        </div>
      </div>

      {/* Action prompt */}
      <div className="px-4 py-2 border-b" style={{ borderColor: C.g100, backgroundColor: '#fffef9' }}>
        <p className="text-xs font-bold leading-snug" style={{ color: C.forest }}>{actionMsg}</p>
      </div>

      {/* Details */}
      <div className="px-4 py-3 space-y-2 bg-white">
        {[
          { key: 'buyer',   label: <span className="inline-flex items-center gap-1"><User size={11} className="inline-block" /> {isBuyer ? 'Seller' : 'Buyer'}:</span>, val: cpName, color: C.forest },
          { key: 'payment', label: <span className="inline-flex items-center gap-1"><CreditCard size={11} className="inline-block" /> Payment:</span>, val: trade.payment_method || '—', color: null },
          { key: 'amount',  label: <span className="inline-flex items-center gap-1"><Banknote size={11} className="inline-block" /> You {isBuyer ? 'Pay' : 'Get'}:</span>, val: payDisp, color: C.forest },
        ].map(({ key, label, val, color }) => (
          <div key={key} className="flex justify-between text-xs">
            <span style={{ color: C.g500 }}>{label}</span>
            <span className="font-bold" style={color ? { color } : {}}>{val}</span>
          </div>
        ))}
        <div className="flex justify-between text-xs">
          <span style={{ color: C.g500 }}>₿ You {isBuyer ? 'Receive' : 'Send'}:</span>
          <div className="text-right">
            <span className="font-black" style={{ color: isBuyer ? C.success : C.danger }}>
              ₿ {btcAmt}
            </span>
            <div className="text-xs font-bold" style={{ color: C.g400 }}>≈ {payDisp}</div>
          </div>
        </div>
        <div className="flex justify-between text-xs">
          <span className="inline-flex items-center gap-1" style={{ color: C.g500 }}><BarChart3 size={11} className="inline-block" /> Status:</span>
          <span className="font-bold px-2 py-0.5 rounded-full text-xs"
            style={{ backgroundColor: st.bg, color: st.color }}>{st.label}</span>
        </div>
      </div>

      {/* CTA */}
      <div className="px-4 pb-3 bg-white">
        <Link to={`/trade/${trade.id}`} onClick={onClose}
          className="flex items-center justify-center gap-2 py-2.5 rounded-xl text-white font-black text-xs w-full hover:opacity-90 transition shadow"
          style={{ backgroundColor: isUrgent ? C.danger : st.color }}>
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
// Behaviour:
//   • Fetches /api/my-trades on mount, then every 30 s
//   • Pops the modal ONCE per trade ID per browser session (sessionStorage)
//   • After dismiss the modal is gone — no floating button, no re-trigger
export default function ActiveTradeBanner({ user, currentPage }) {
  const [relevant, setRelevant] = useState([]);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    if (!user) return;
    const token   = localStorage.getItem('token');
    const headers = token ? { Authorization: `Bearer ${token}` } : {};

    const load = async () => {
      try {
        const r      = await axios.get(`${API_URL}/my-trades`, { headers });
        const trades = r.data.trades || [];

        // Filter to trades that belong on this page
        const pageActive = trades.filter(t => matchesPage(t, currentPage));
        setRelevant(pageActive);

        // Only pop for trade IDs not yet shown this session
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

  // Nothing relevant or user already dismissed — render nothing
  if (!showModal || relevant.length === 0) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }}>
      <div className="bg-white rounded-3xl shadow-2xl w-full overflow-hidden"
        style={{ maxWidth: 480, maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}>

        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4"
          style={{ background: `linear-gradient(135deg,${C.forest},${C.mint})` }}>
          <div className="w-3 h-3 rounded-full animate-pulse flex-shrink-0"
            style={{ backgroundColor: C.online }} />
          <Bell size={16} className="text-white flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-white font-black text-sm inline-flex items-center"><Zap size={14} className="inline-block mr-1" />You Have an Active Trade</p>
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.7)' }}>
              Action required — don't miss your trade window
            </p>
          </div>
          <button onClick={() => setShowModal(false)}
            className="text-white/50 hover:text-white transition flex-shrink-0"
            aria-label="Dismiss">
            <X size={18} />
          </button>
        </div>

        {/* Trade cards */}
        <div className="overflow-y-auto flex-1 p-4 space-y-3">
          {relevant.map(trade => (
            <TradeCard
              key={trade.id}
              trade={trade}
              user={user}
              onClose={() => setShowModal(false)}
            />
          ))}
        </div>

        {/* Footer — dismiss only, no floating re-trigger */}
        <div className="px-5 py-3 border-t flex items-center justify-between"
          style={{ borderColor: C.g200, backgroundColor: C.g50 }}>
          <div className="flex items-center gap-1.5">
            <Shield size={12} style={{ color: C.green }} />
            <p className="text-xs font-semibold" style={{ color: C.g500 }}>
              Escrow-protected · 0.5% fee on completion only
            </p>
          </div>
          <button onClick={() => setShowModal(false)}
            className="text-xs font-bold px-4 py-2 rounded-xl border hover:bg-gray-50 transition"
            style={{ borderColor: C.g200, color: C.g600 }}>
            Ignore
          </button>
        </div>
      </div>
    </div>
  );
}
