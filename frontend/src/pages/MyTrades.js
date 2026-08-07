import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  Clock, CheckCircle, AlertCircle, Shield, Bitcoin,
  ArrowRight, RefreshCw, TrendingUp, Activity,
  AlertTriangle, Eye, MessageCircle, Zap, Timer,
  Filter, Search, DollarSign, X, Bell, ChevronRight, SlidersHorizontal,
  ArrowUpDown, Calendar, ChevronDown
} from 'lucide-react';
import { getStatusStyle } from '../components/Notifications';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const C = {
  forest:'#1B4332', green:'#2D6A4F', mint:'#40916C', sage:'#52B788',
  gold:'#F4A422', amber:'#F59E0B', mist:'#F0FAF5', white:'#FFFFFF',
  g50:'#F8FAFC', g100:'#F1F5F9', g200:'#E2E8F0',
  g400:'#94A3B8', g500:'#64748B', g600:'#475569', g700:'#334155', g800:'#1E293B',
  success:'#10B981', danger:'#EF4444', warn:'#F59E0B', paid:'#3B82F6',
  online:'#22C55E', purple:'#8B5CF6',
};

const authH = () => { const t=localStorage.getItem('token'); return t?{Authorization:`Bearer ${t}`}:{}; };
const fmt = (n,d=0) => new Intl.NumberFormat('en-US',{minimumFractionDigits:0,maximumFractionDigits:d}).format(n||0);
const fmtBtc = n => parseFloat(n||0).toFixed(8);
const fmtAge = d => {
  if(!d)return'—';
  const s=(Date.now()-new Date(d))/1000;
  if(s<60)return'Just now';
  if(s<3600)return`${~~(s/60)}m ago`;
  if(s<86400)return`${~~(s/3600)}h ago`;
  return`${~~(s/86400)}d ago`;
};
const flag = code => !code||code.length!==2?'🌍':code.toUpperCase().replace(/./g,c=>String.fromCodePoint(0x1F1E0+c.charCodeAt(0)-65));
const tradeTypeOf = t => {
  const lt = (t.listing_type||t.listing?.listing_type||'').toUpperCase();
  if (lt.includes('GIFT')) return 'gift';
  return 'btc';
};
const SYM = {GHS:'₵',NGN:'₦',KES:'KSh',ZAR:'R',UGX:'USh',USD:'$',GBP:'£',EUR:'€'};

// ─── Status config ─────────────────────────────────────────────────────────
const STATUS_MAP = {
  CREATED:      {label:'Escrow Active',   short:'Escrow',    color:C.green,   bg:`${C.green}15`,   dot:C.online,   urgent:true},
  FUNDS_LOCKED: {label:'Escrow Active',   short:'Escrow',    color:C.green,   bg:`${C.green}15`,   dot:C.online,   urgent:true},
  PAYMENT_SENT: {label:'Payment Sent',    short:'Paid',      color:C.paid,    bg:`${C.paid}15`,    dot:C.paid,     urgent:true},
  PAID:         {label:'Payment Sent',    short:'Paid',      color:C.paid,    bg:`${C.paid}15`,    dot:C.paid,     urgent:true},
  COMPLETED:    {label:'Completed',       short:'Done',      color:C.success, bg:`${C.success}15`, dot:C.success,  urgent:false},
  CANCELLED:    {label:'Cancelled',       short:'Cancelled', color:C.g500,    bg:`${C.g100}`,      dot:C.g400,     urgent:false},
  EXPIRED:      {label:'Expired',        short:'Expired',   color:C.g500,    bg:`${C.g100}`,      dot:C.g400,     urgent:false},
  DISPUTED:     {label:'Disputed',        short:'Dispute',   color:C.danger,  bg:`${C.danger}15`,  dot:C.danger,   urgent:true},
};
// The trades table only ever stores status=CANCELLED — auto-expiry never gets
// its own status value, it's only distinguishable via the cancel_reason text.
// Pass the trade's cancel_reason as the 2nd arg so an expired trade shows
// "Expired" instead of being indistinguishable from a real user cancellation.
const EXPIRY_REASON_RE = /expir|time limit|payment window/i;
const getStatus = (s, cancelReason) => {
  const key = s?.toUpperCase();
  if (key === 'CANCELLED' && EXPIRY_REASON_RE.test(cancelReason || '')) return STATUS_MAP.EXPIRED;
  return STATUS_MAP[key] || STATUS_MAP.CREATED;
};

// Only real DB statuses — excludes COMPLETED and CANCELLED
const isActive = s => ['CREATED','FUNDS_LOCKED','PAYMENT_SENT','PAID','DISPUTED'].includes((s||'').toUpperCase());

// ─── Stat card ─────────────────────────────────────────────────────────────
function StatCard({icon:Icon, label, value, color, sub}) {
  return(
    <div className="bg-white rounded-2xl border p-4 shadow-sm" style={{borderColor:C.g200}}>
      <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-2" style={{backgroundColor:`${color}15`}}>
        <Icon size={15} style={{color}}/>
      </div>
      <p className="text-xl font-black" style={{color:C.g800}}>{value}</p>
      <p className="text-xs font-semibold mt-0.5" style={{color:C.g500}}>{label}</p>
      {sub&&<p className="text-xs mt-0.5" style={{color:C.g400}}>{sub}</p>}
    </div>
  );
}

// ─── Active trade alert banner ──────────────────────────────────────────────
function ActiveAlert({trade, userId, onDismiss, onExpire}) {
  const isBuyer    = String(userId)===String(trade.buyer_id);
  const st         = getStatus(trade.status, trade.cancel_reason);
  const cp         = isBuyer ? trade.seller : trade.buyer;
  const payMethod  = trade.payment_method||'Mobile Money';
  const cur        = trade.local_currency||trade.currency||trade.listing?.currency||'GHS';
  const sym        = SYM[cur]||'₵';
  const localAmt   = parseFloat(trade.amount_local||trade.local_amount||0);
  const btcAmt     = parseFloat(trade.amount_btc||0);
  const btcNet     = btcAmt * 0.995; // after 0.5% fee
  const isPaid     = ['PAYMENT_SENT','PAID'].includes(trade.status?.toUpperCase());
  const isDisputed = trade.status?.toUpperCase()==='DISPUTED';
  const isGift     = tradeTypeOf(trade)==='gift';
  const typeColor  = isDisputed ? C.danger : isGift ? C.purple : isBuyer ? C.amber : C.green;
  const cpFlag     = flag(cp?.country_code||trade.listing?.country_code||'');

  // Countdown — use expires_at from DB (authoritative). Fallback to created_at + 30 min.
  const [timeLeft, setTimeLeft] = React.useState(null);
  const expiredRef = React.useRef(false);
  React.useEffect(()=>{
    if(!trade.created_at) return;
    // Parse as UTC — Supabase TIMESTAMP cols return without 'Z', causing local-time misparse
    const toUTC = s => new Date(/[Z+]/.test(s) ? s : s + 'Z');
    const deadline = trade.expires_at
      ? toUTC(trade.expires_at).getTime()
      : toUTC(trade.created_at).getTime() + 30*60*1000;
    const tick = ()=>{
      const rem = Math.max(0, Math.floor((deadline - Date.now())/1000));
      setTimeLeft(rem);
      if (rem===0 && !expiredRef.current) {
        expiredRef.current = true;
        axios.post(`${API_URL}/trades/${trade.id}/auto-cancel`,
          {reason:'30-minute payment window expired'},
          {headers:authH()}
        ).catch(()=>{});
        setTimeout(()=> onExpire && onExpire(trade.id), 2500);
      }
    };
    tick();
    const iv = setInterval(tick,1000);
    return()=>clearInterval(iv);
  },[trade.expires_at, trade.created_at, trade.id]);

  const fmtTimer = s=>{
    if(s===null||s===undefined)return'--:--';
    if(s<=0)return'00:00';
    const m=Math.floor(s/60),sc=s%60;
    return`${String(m).padStart(2,'0')}:${String(sc).padStart(2,'0')}`;
  };
  const urgent = timeLeft!==null&&timeLeft<300&&timeLeft>0;

  const roleMsg = isBuyer
    ? isPaid ? `✅ Payment sent — awaiting Bitcoin release from ${cp?.username||'seller'}`
             : `💸 Send ${sym}${fmt(localAmt)} ${cur} via ${payMethod} to ${cp?.username||'seller'}`
    : isPaid ? `🔓 ${cp?.username||'Buyer'} paid! Check your ${payMethod} and RELEASE BITCOIN`
             : `⏳ ${cp?.username||'Buyer'} is sending ${sym}${fmt(localAmt)} via ${payMethod}…`;

  return(
    <div className="rounded-2xl overflow-hidden shadow-xl border-2"
      style={{borderColor: urgent&&!isPaid ? C.danger : typeColor}}>

      {/* Top bar */}
      <div className="flex items-center gap-2 px-4 py-2"
        style={{background:`linear-gradient(90deg,${C.forest},${typeColor})`}}>
        <div className="w-2 h-2 rounded-full flex-shrink-0 animate-pulse" style={{backgroundColor:C.online}}/>
        <Bell size={12} className="text-white flex-shrink-0"/>
        <span className="text-xs font-black text-white flex-1">
          {isDisputed?'🚨 DISPUTE ACTIVE — SUPPORT REVIEWING'
           :isGift?'🎁 GIFT CARD TRADE — ACTION REQUIRED'
           :'⚡ ACTIVE TRADE — ACTION REQUIRED'}
        </span>
        {timeLeft!==null&&!isPaid&&!isDisputed&&(
          <span className={`text-xs font-black px-2.5 py-0.5 rounded-full flex-shrink-0 ${urgent?'animate-pulse':''}`}
            style={{backgroundColor:urgent?C.danger:'rgba(255,255,255,0.2)',color:'#fff'}}>
            <Timer size={10} className="inline mr-1"/>
            {fmtTimer(timeLeft)}
          </span>
        )}
        <button onClick={()=>onDismiss(trade.id)} className="text-white/50 hover:text-white ml-1 flex-shrink-0">
          <X size={13}/>
        </button>
      </div>

      {/* Body */}
      <div className="bg-white">
        <div className="px-4 pt-3 pb-2 border-b" style={{borderColor:C.g100}}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="text-xs font-black px-2 py-0.5 rounded-full"
                  style={{backgroundColor:`${typeColor}20`,color:typeColor}}>
                  {isGift?'🎁 GIFT CARD':isBuyer?'🛒 YOU ARE BUYING':'💰 YOU ARE SELLING'}
                </span>
                <span className="text-xs font-black px-2 py-0.5 rounded-full"
                  style={{backgroundColor:getStatusStyle(trade.status, trade.cancel_reason).bg,color:getStatusStyle(trade.status, trade.cancel_reason).color}}>{st.label}</span>
                <span className="text-xs font-mono" style={{color:C.g400}}>
                  #{String(trade.id||'').slice(0,8).toUpperCase()}
                </span>
              </div>
              <p className="text-sm font-black leading-tight" style={{color:C.forest}}>{roleMsg}</p>
            </div>
            <Link to={`/trade/${trade.id}`}
              className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-white font-black text-xs hover:opacity-90 transition shadow flex-shrink-0"
              style={{backgroundColor:typeColor}}>
              <Zap size={12}/> {isDisputed?'View Dispute':'Open Trade'} <ArrowRight size={11}/>
            </Link>
          </div>
        </div>

        {/* 4-column details */}
        <div className="grid grid-cols-2 sm:grid-cols-4 divide-x" style={{divideColor:C.g100}}>
          <div className="px-3 py-2.5 text-center border-r" style={{borderColor:C.g100}}>
            <p className="text-xs font-bold uppercase tracking-wider mb-0.5" style={{color:C.g400}}>
              {isBuyer?'Seller':'Buyer'}
            </p>
            <p className="text-xs font-black" style={{color:C.forest}}>
              {cpFlag} {cp?.username||'—'}
            </p>
          </div>
          <div className="px-3 py-2.5 text-center border-r" style={{borderColor:C.g100}}>
            <p className="text-xs font-bold uppercase tracking-wider mb-0.5" style={{color:C.g400}}>
              {isBuyer?'You Pay':'Buyer Pays'}
            </p>
            <p className="text-xs font-black" style={{color:C.forest}}>
              {sym}{fmt(localAmt,0)} {cur}
            </p>
          </div>
          <div className="px-3 py-2.5 text-center border-r" style={{borderColor:C.g100}}>
            <p className="text-xs font-bold uppercase tracking-wider mb-0.5" style={{color:C.g400}}>
              BTC Escrow
            </p>
            <p className="text-xs font-black" style={{color:C.amber}}>₿{fmtBtc(btcAmt)}</p>
          </div>
          <div className="px-3 py-2.5 text-center">
            <p className="text-xs font-bold uppercase tracking-wider mb-0.5" style={{color:C.g400}}>
              You Receive
            </p>
            <p className="text-xs font-black" style={{color:isBuyer?C.success:typeColor}}>
              {isBuyer?`₿${fmtBtc(btcNet)}`:`${sym}${fmt(localAmt,0)} ${cur}`}
            </p>
          </div>
        </div>

        {urgent&&!isPaid&&(
          <div className="flex items-center gap-2 px-4 py-2 border-t animate-pulse"
            style={{borderColor:C.danger,backgroundColor:`${C.danger}08`}}>
            <AlertTriangle size={12} style={{color:C.danger,flexShrink:0}}/>
            <p className="text-xs font-black" style={{color:C.danger}}>
              ⚠️ Under 5 minutes left! Trade auto-cancels at 00:00 — BTC returns to wallet instantly.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Trade row card ─────────────────────────────────────────────────────────
function TradeCard({trade, userId}) {
  const isBuyer  = String(userId)===String(trade.buyer_id);
  const st       = getStatus(trade.status, trade.cancel_reason);
  const cp       = isBuyer ? trade.seller : trade.buyer;
  const active   = isActive(trade.status);
  const isGift   = tradeTypeOf(trade)==='gift';
  const typeColor= isGift ? C.purple : isBuyer ? C.amber : C.green;
  const typeLabel= isGift ? '🎁 GIFT CARD' : isBuyer ? '🛒 BUYING BTC' : '💰 SELLING BTC';

  const lcur     = trade.local_currency||trade.currency||trade.listing?.currency||'';
  const lsym     = SYM[lcur]||'';
  const lamount  = parseFloat(trade.amount_local||trade.local_amount||0);
  const btcAmt   = parseFloat(trade.amount_btc||0);
  const btcNet   = btcAmt * 0.995;
  const cpFlag   = flag(cp?.country_code||trade.listing?.country_code||'');

  const payDisplay = (lamount&&lcur)
    ? `${lsym}${lamount.toLocaleString()} ${lcur}`
    : `$${trade.amount_usd?.toLocaleString()||'0'} USD`;

  return(
    <Link to={`/trade/${trade.id}`}
      className="block bg-white rounded-2xl overflow-hidden hover:shadow-md transition-all"
      style={{border:`${active?2:1}px solid ${active?typeColor:C.g200}`}}>

      {/* Header strip */}
      <div className="flex items-center justify-between px-4 py-2.5"
        style={{backgroundColor:active?`${typeColor}10`:C.g50}}>
        <span className="font-black text-xs px-3 py-1 rounded-full text-white"
          style={{backgroundColor:typeColor}}>
          {typeLabel}
        </span>
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold px-2 py-0.5 rounded-full"
            style={{backgroundColor:getStatusStyle(trade.status, trade.cancel_reason).bg,color:getStatusStyle(trade.status, trade.cancel_reason).color}}>{st.short}</span>
          <span className="text-xs font-mono" style={{color:C.g400}}>
            #{String(trade.id||'').slice(0,8).toUpperCase()}
          </span>
        </div>
      </div>

      {/* Details */}
      <div className="px-4 py-3 space-y-2.5">
        <div className="flex justify-between items-center">
          <span className="text-xs font-bold uppercase" style={{color:C.g500}}>
            👤 {isBuyer?'Seller':'Buyer'}
          </span>
          <span className="font-bold text-sm" style={{color:C.forest}}>
            {cpFlag} {cp?.username||'—'}
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-xs font-bold uppercase" style={{color:C.g500}}>💳 Payment</span>
          <span className="text-sm font-medium" style={{color:C.g700}}>{trade.payment_method||'—'}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-xs font-bold uppercase" style={{color:C.g500}}>
            💵 {isBuyer?'You Pay':'Buyer Pays'}
          </span>
          <span className="font-black text-sm" style={{color:C.forest}}>{payDisplay}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-xs font-bold uppercase" style={{color:C.g500}}>🔒 BTC Escrow</span>
          <span className="font-black text-sm" style={{color:C.amber}}>₿{btcAmt.toFixed(8)}</span>
        </div>
        <div className="flex justify-between items-center pt-1 border-t" style={{borderColor:C.g100}}>
          <span className="text-xs font-bold uppercase" style={{color:C.g500}}>✅ You Receive</span>
          <span className="font-black text-sm" style={{color:isBuyer?C.success:typeColor}}>
            {isBuyer ? `₿${btcNet.toFixed(8)}` : payDisplay}
          </span>
        </div>
      </div>

      <div className="px-4 pb-3 flex items-center justify-between">
        <span className="text-xs" style={{color:C.g400}}>{fmtAge(trade.created_at)}</span>
        <span className="text-xs font-bold flex items-center gap-1" style={{color:typeColor}}>
          View Trade <ChevronRight size={11}/>
        </span>
      </div>
    </Link>
  );
}

// ─── Active Trade Modal Popup ───────────────────────────────────────────────
function ActiveTradeModal({ trades, userId, onClose }) {
  if (!trades.length) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{backgroundColor:'rgba(0,0,0,0.75)',backdropFilter:'blur(6px)'}}>
      <div className="bg-white rounded-3xl shadow-2xl w-full overflow-hidden"
        style={{maxWidth:480,maxHeight:'88vh',display:'flex',flexDirection:'column'}}>

        <div className="flex items-center gap-3 px-5 py-4"
          style={{background:`linear-gradient(135deg,${C.forest},${C.mint})`}}>
          <div className="w-3 h-3 rounded-full animate-pulse flex-shrink-0" style={{backgroundColor:C.online}}/>
          <Bell size={16} className="text-white flex-shrink-0"/>
          <div className="flex-1 min-w-0">
            <p className="text-white font-black text-sm">⚡ You Have {trades.length} Active Trade{trades.length>1?'s':''}</p>
            <p className="text-xs" style={{color:'rgba(255,255,255,0.7)'}}>Action required — 30 min window per trade</p>
          </div>
          <button onClick={onClose} className="text-white/50 hover:text-white transition flex-shrink-0">
            <X size={18}/>
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-4 space-y-3">
          {trades.map(trade=>{
            const isBuyer  = String(userId)===String(trade.buyer_id);
            const st       = getStatus(trade.status, trade.cancel_reason);
            const cp       = isBuyer ? trade.seller : trade.buyer;
            const cpName   = cp?.username||(isBuyer?trade.seller_name:trade.buyer_name)||'—';
            const cpFlag   = flag(cp?.country_code||trade.listing?.country_code||'');
            const isGift   = tradeTypeOf(trade)==='gift';
            const typeColor= isGift ? C.purple : isBuyer ? C.amber : C.green;
            const typeLabel= isGift ? '🎁 GIFT CARD' : isBuyer ? '🛒 BUYING BTC' : '💰 SELLING BTC';
            const cur      = trade.local_currency||trade.currency||'';
            const sym      = SYM[cur]||'';
            const localAmt = trade.amount_local||trade.local_amount||0;
            const btcAmt   = parseFloat(trade.amount_btc||0);
            const btcNet   = btcAmt * 0.995;
            const payDisp  = localAmt ? `${sym}${fmt(localAmt)} ${cur}` : `$${fmt(trade.amount_usd||0)} USD`;

            return(
              <div key={trade.id} className="rounded-2xl border-2 overflow-hidden"
                style={{borderColor:typeColor}}>
                <div className="flex items-center justify-between px-4 py-2.5"
                  style={{backgroundColor:`${typeColor}12`}}>
                  <span className="font-black text-xs px-3 py-1 rounded-full text-white"
                    style={{backgroundColor:typeColor}}>{typeLabel}</span>
                  <span className="font-mono text-xs" style={{color:C.g400}}>
                    #{String(trade.id||'').slice(0,8).toUpperCase()}
                  </span>
                </div>

                <div className="px-4 py-3 space-y-2 bg-white">
                  <div className="flex justify-between text-xs">
                    <span style={{color:C.g500}}>👤 {isBuyer?'Seller':'Buyer'}</span>
                    <span className="font-bold" style={{color:C.forest}}>{cpFlag} {cpName}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span style={{color:C.g500}}>💳 Payment</span>
                    <span className="font-bold">{trade.payment_method||'—'}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span style={{color:C.g500}}>💵 {isBuyer?'You Pay':'Buyer Pays'}</span>
                    <span className="font-black" style={{color:C.forest}}>{payDisp}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span style={{color:C.g500}}>🔒 BTC Escrow</span>
                    <span className="font-black" style={{color:C.amber}}>₿{btcAmt.toFixed(8)}</span>
                  </div>
                  <div className="flex justify-between text-xs pt-1 border-t" style={{borderColor:C.g100}}>
                    <span style={{color:C.g500}}>✅ You Receive</span>
                    <span className="font-black" style={{color:isBuyer?C.success:typeColor}}>
                      {isBuyer?`₿${btcNet.toFixed(8)}`:payDisp}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span style={{color:C.g500}}>📊 Status</span>
                    <span className="font-bold px-2 py-0.5 rounded-full"
                      style={{backgroundColor:getStatusStyle(trade.status, trade.cancel_reason).bg,color:getStatusStyle(trade.status, trade.cancel_reason).color}}>{st.label}</span>
                  </div>
                </div>

                <div className="px-4 pb-3 bg-white">
                  <Link to={`/trade/${trade.id}`} onClick={onClose}
                    className="flex items-center justify-center gap-2 py-2.5 rounded-xl text-white font-black text-xs w-full hover:opacity-90 transition shadow"
                    style={{backgroundColor:typeColor}}>
                    <Zap size={13}/> Open Trade Now <ArrowRight size={12}/>
                  </Link>
                </div>
              </div>
            );
          })}
        </div>

        <div className="px-5 py-3 border-t flex items-center justify-between"
          style={{borderColor:C.g200,backgroundColor:C.g50}}>
          <div className="flex items-center gap-1.5">
            <Shield size={12} style={{color:C.green}}/>
            <p className="text-xs font-semibold" style={{color:C.g500}}>Escrow-protected · 30 min window</p>
          </div>
          <button onClick={onClose}
            className="text-xs font-bold px-4 py-2 rounded-xl border hover:bg-gray-50 transition"
            style={{borderColor:C.g200,color:C.g600}}>Dismiss</button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────
export default function MyTrades({user}) {
  const navigate  = useNavigate();
  const _cache = () => { try{const c=JSON.parse(sessionStorage.getItem('praqen_trades')||'null');return c&&Date.now()-c.ts<60000?c.data:null;}catch{return null;} };
  const [trades,    setTrades]    = useState(()=>_cache()||[]);
  const [loading,   setLoading]   = useState(()=>!_cache());
  const [loadingMore, setLoadingMore] = useState(false);
  const [page,      setPage]      = useState(1);
  const [hasMore,   setHasMore]   = useState(false);
  const [filter,    setFilter]    = useState('all');
  const [search,    setSearch]    = useState('');
  const [dismissed, setDismissed] = useState(new Set());
  const [showModal, setShowModal] = useState(false);

  // Advanced filters & sorting
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [typeFilter,   setTypeFilter]   = useState('all');   // all | buying | selling | gift
  const [sortBy,       setSortBy]       = useState('newest'); // newest | oldest | amount_desc | amount_asc
  const [dateFrom,     setDateFrom]     = useState('');
  const [dateTo,       setDateTo]       = useState('');
  const [amountMin,    setAmountMin]    = useState('');
  const [amountMax,    setAmountMax]    = useState('');

  const advancedActiveCount =
    (typeFilter !== 'all' ? 1 : 0) +
    (sortBy !== 'newest' ? 1 : 0) +
    (dateFrom ? 1 : 0) + (dateTo ? 1 : 0) +
    (amountMin ? 1 : 0) + (amountMax ? 1 : 0);

  const clearAdvanced = () => {
    setTypeFilter('all'); setSortBy('newest');
    setDateFrom(''); setDateTo(''); setAmountMin(''); setAmountMax('');
  };
  const timerRef = useRef(null);

  // sessionStorage helpers — same key as ActiveTradeBanner so both share seen state
  const getSeenIds = () => {
    try { return new Set(JSON.parse(sessionStorage.getItem('praqen_shown_trade_alerts')||'[]')); }
    catch { return new Set(); }
  };
  const markSeen = ids => {
    try {
      const seen = getSeenIds();
      ids.forEach(id=>seen.add(String(id)));
      sessionStorage.setItem('praqen_shown_trade_alerts', JSON.stringify([...seen]));
    } catch {}
  };

  useEffect(()=>{
    if(!user){navigate('/login');return;}
    load(trades.length === 0);
    timerRef.current = setInterval(()=>{ if(document.visibilityState==='visible') silentRefresh(); },15000);
    return()=>clearInterval(timerRef.current);
  },[user]);

  // Pop the modal ONCE per trade per session when new active trades appear
  useEffect(()=>{
    const seen   = getSeenIds();
    const fresh  = trades.filter(t=>isActive(t.status)&&!seen.has(String(t.id)));
    if(fresh.length>0){
      markSeen(fresh.map(t=>t.id));
      setShowModal(true);
    }
  },[trades]);

  const LIMIT = 30;

  const load = async(showSpinner = false)=>{
    if (showSpinner) setLoading(true);
    try{
      const r = await axios.get(`${API_URL}/my-trades?page=1&limit=${LIMIT}`,{headers:authH()});
      const data = r.data.trades||[];
      const total = r.data.total||0;
      setTrades(data);
      setPage(1);
      setHasMore(total > LIMIT);
      try { sessionStorage.setItem('praqen_trades', JSON.stringify({data, ts:Date.now()})); } catch {}
    }catch(e){ console.error('Failed to load trades',e); }
    finally{ setLoading(false); }
  };

  const loadMore = async()=>{
    if (loadingMore) return;
    setLoadingMore(true);
    try{
      const nextPage = page + 1;
      const r = await axios.get(`${API_URL}/my-trades?page=${nextPage}&limit=${LIMIT}`,{headers:authH()});
      const more = r.data.trades||[];
      const total = r.data.total||0;
      setTrades(prev => [...prev, ...more]);
      setPage(nextPage);
      setHasMore(nextPage * LIMIT < total);
    }catch{}
    finally{ setLoadingMore(false); }
  };

  const silentRefresh = async()=>{
    try{
      const r = await axios.get(`${API_URL}/my-trades?page=1&limit=${LIMIT}`,{headers:authH()});
      const data = r.data.trades||[];
      const total = r.data.total||0;
      setTrades(data);
      setHasMore(total > LIMIT);
      try { sessionStorage.setItem('praqen_trades', JSON.stringify({data, ts:Date.now()})); } catch {}
    }catch{}
  };

  // Called when a trade's 30-min timer hits 0 — mark it cancelled locally instantly
  const handleExpire = (tradeId) => {
    setTrades(prev => prev.map(t =>
      String(t.id)===String(tradeId) ? {...t, status:'CANCELLED'} : t
    ));
  };

  // All active trades (for modal — no dismiss filter)
  const allActiveTrades = trades.filter(t=>isActive(t.status));
  // Active trades that need banner attention — not dismissed
  const activeTrades = trades.filter(t=>isActive(t.status)&&!dismissed.has(t.id));

  // Stats
  const completed  = trades.filter(t=>t.status==='COMPLETED').length;
  const active     = trades.filter(t=>isActive(t.status)).length;
  const disputed   = trades.filter(t=>t.status==='DISPUTED').length;
  const totalBtc   = trades.filter(t=>t.status==='COMPLETED').reduce((s,t)=>s+parseFloat(t.amount_btc||0),0);

  // Filtered list
  const filtered = trades
    .filter(t=>{
      if(filter==='active')    return isActive(t.status);
      if(filter==='completed') return t.status==='COMPLETED';
      if(filter==='cancelled') return t.status==='CANCELLED';
      if(filter==='disputed')  return t.status==='DISPUTED';
      return true;
    })
    .filter(t=>{
      if(!search.trim()) return true;
      const q=search.toLowerCase();
      return(
        String(t.id||'').toLowerCase().includes(q)||
        (t.seller?.username||'').toLowerCase().includes(q)||
        (t.buyer?.username||'').toLowerCase().includes(q)||
        (t.payment_method||'').toLowerCase().includes(q)||
        (t.listings?.gift_card_brand||'').toLowerCase().includes(q)
      );
    })
    .filter(t=>{
      if(typeFilter==='all') return true;
      const isBuyer = String(user?.id)===String(t.buyer_id);
      const isGift  = tradeTypeOf(t)==='gift';
      if(typeFilter==='gift')    return isGift;
      if(typeFilter==='buying')  return isBuyer && !isGift;
      if(typeFilter==='selling') return !isBuyer && !isGift;
      return true;
    })
    .filter(t=>{
      if(!dateFrom && !dateTo) return true;
      const created = new Date(t.created_at);
      if(dateFrom && created < new Date(dateFrom)) return false;
      if(dateTo){ const end = new Date(dateTo); end.setHours(23,59,59,999); if(created > end) return false; }
      return true;
    })
    .filter(t=>{
      const amt = parseFloat(t.amount_btc||0);
      if(amountMin && amt < parseFloat(amountMin)) return false;
      if(amountMax && amt > parseFloat(amountMax)) return false;
      return true;
    });

  const sortTrades = arr => {
    switch(sortBy){
      case 'oldest':      return [...arr].sort((a,b)=>new Date(a.created_at)-new Date(b.created_at));
      case 'amount_desc': return [...arr].sort((a,b)=>parseFloat(b.amount_btc||0)-parseFloat(a.amount_btc||0));
      case 'amount_asc':  return [...arr].sort((a,b)=>parseFloat(a.amount_btc||0)-parseFloat(b.amount_btc||0));
      default:             // 'newest' — active trades still surface first
        return [...arr].sort((a,b)=>{
          const aAct=isActive(a.status)?1:0, bAct=isActive(b.status)?1:0;
          if(aAct!==bAct) return bAct-aAct;
          return new Date(b.created_at)-new Date(a.created_at);
        });
    }
  };


  return(
    <div className="min-h-screen flex flex-col" style={{backgroundColor:C.g50, fontFamily:"'DM Sans',sans-serif"}}>
      <style>{`
        @keyframes pulse-once{0%,100%{opacity:1}50%{opacity:0.6}}
        .animate-pulse-once{animation:pulse-once 1.8s ease-in-out 3}
        @keyframes slideUp{from{transform:translateY(20px);opacity:0}to{transform:translateY(0);opacity:1}}
        .slide-up{animation:slideUp 0.35s ease-out}
      `}</style>

      {/* ── ACTIVE TRADE MODAL POPUP ─────────────────────────────── */}
      {showModal&&(
        <ActiveTradeModal
          trades={allActiveTrades}
          userId={user?.id}
          onClose={()=>setShowModal(false)}
        />
      )}


      <div className="max-w-5xl mx-auto w-full px-4 py-5 space-y-5">

        {/* ── HEADER ─────────────────────────────────────────── */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="font-black text-2xl" style={{color:C.forest, fontFamily:"'Syne',sans-serif"}}>
              My Trades
            </h1>
            <p className="text-xs mt-0.5" style={{color:C.g500}}>
              {trades.length} total · {active} active · {completed} completed
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={load}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-bold hover:bg-white transition"
              style={{borderColor:C.g200, color:C.g600}}>
              <RefreshCw size={12}/> Refresh
            </button>
            <button onClick={()=>navigate('/buy-bitcoin')}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-black hover:opacity-90 transition"
              style={{backgroundColor:C.gold, color:C.forest}}>
              <Bitcoin size={14}/> New Trade
            </button>
          </div>
        </div>

        {/* ── ACTIVE TRADE ALERTS — top priority ─────────────── */}
        {activeTrades.length>0&&(
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full animate-pulse" style={{backgroundColor:C.danger}}/>
              <p className="text-xs font-black" style={{color:C.danger}}>
                {activeTrades.length} TRADE{activeTrades.length>1?'S':''} NEED YOUR ATTENTION
              </p>
            </div>
            {activeTrades.map(t=>(
              <ActiveAlert
                key={t.id}
                trade={t}
                userId={user?.id}
                onDismiss={id=>setDismissed(prev=>new Set([...prev,id]))}
                onExpire={handleExpire}
              />
            ))}
          </div>
        )}

        {/* ── STATS ──────────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard icon={Activity}    label="Total Trades"  value={trades.length}      color={C.green}/>
          <StatCard icon={Zap}         label="Active Now"    value={active}             color={C.warn}  sub={active>0?'Needs action':''}/>
          <StatCard icon={CheckCircle} label="Completed"     value={completed}          color={C.success}/>
          <StatCard icon={Bitcoin}     label="BTC Traded"    value={`₿${fmtBtc(totalBtc)}`} color={C.gold}/>
        </div>

        {/* ── FILTER + SEARCH ────────────────────────────────── */}
        <div className="bg-white rounded-2xl border p-3 space-y-2" style={{borderColor:C.g200}}>
          <div className="flex gap-1 flex-wrap">
            {[
              ['all',       `All (${trades.length})`],
              ['active',    `Active (${active})`],
              ['completed', `Completed (${completed})`],
              ['disputed',  `Disputes (${disputed})`],
              ['cancelled', 'Cancelled'],
            ].map(([val,lbl])=>(
              <button key={val} onClick={()=>setFilter(val)}
                className="px-3 py-1.5 rounded-xl text-xs font-bold transition"
                style={{
                  backgroundColor:filter===val?C.green:'transparent',
                  color:filter===val?C.white:C.g500,
                }}>
                {lbl}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2" style={{color:C.g400}}/>
              <input value={search} onChange={e=>setSearch(e.target.value)}
                placeholder="Search by Trade ID, username, payment…"
                className="w-full pl-7 pr-3 py-2 text-xs border-2 rounded-xl focus:outline-none"
                style={{borderColor:search?C.green:C.g200}}/>
            </div>
            <button onClick={()=>setShowAdvanced(v=>!v)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border-2 transition flex-shrink-0"
              style={{
                borderColor: advancedActiveCount>0||showAdvanced ? C.green : C.g200,
                backgroundColor: advancedActiveCount>0 ? `${C.green}10` : 'transparent',
                color: advancedActiveCount>0 ? C.green : C.g600,
              }}>
              <SlidersHorizontal size={12}/> Filters
              {advancedActiveCount>0&&(
                <span className="w-4 h-4 rounded-full text-white flex items-center justify-center flex-shrink-0"
                  style={{backgroundColor:C.green, fontSize:9}}>{advancedActiveCount}</span>
              )}
              <ChevronDown size={11} style={{transform:showAdvanced?'rotate(180deg)':'none', transition:'transform 0.15s'}}/>
            </button>
          </div>

          {/* ── ADVANCED FILTERS PANEL ── */}
          {showAdvanced&&(
            <div className="pt-2 mt-1 border-t space-y-3" style={{borderColor:C.g100}}>
              {/* Trade type */}
              <div>
                <p className="text-xs font-black uppercase tracking-wide mb-1.5" style={{color:C.g400}}>Trade Type</p>
                <div className="flex gap-1 flex-wrap">
                  {[
                    ['all',     'All Types'],
                    ['buying',  '🛒 Buying'],
                    ['selling', '💰 Selling'],
                    ['gift',    '🎁 Gift Cards'],
                  ].map(([val,lbl])=>(
                    <button key={val} onClick={()=>setTypeFilter(val)}
                      className="px-3 py-1.5 rounded-xl text-xs font-bold transition"
                      style={{
                        backgroundColor:typeFilter===val?C.forest:C.g50,
                        color:typeFilter===val?C.white:C.g600,
                      }}>
                      {lbl}
                    </button>
                  ))}
                </div>
              </div>

              {/* Sort by */}
              <div>
                <p className="text-xs font-black uppercase tracking-wide mb-1.5" style={{color:C.g400}}>
                  <ArrowUpDown size={10} className="inline mr-1"/>Sort By
                </p>
                <div className="flex gap-1 flex-wrap">
                  {[
                    ['newest',      'Newest First'],
                    ['oldest',      'Oldest First'],
                    ['amount_desc', 'Amount: High → Low'],
                    ['amount_asc',  'Amount: Low → High'],
                  ].map(([val,lbl])=>(
                    <button key={val} onClick={()=>setSortBy(val)}
                      className="px-3 py-1.5 rounded-xl text-xs font-bold transition"
                      style={{
                        backgroundColor:sortBy===val?C.forest:C.g50,
                        color:sortBy===val?C.white:C.g600,
                      }}>
                      {lbl}
                    </button>
                  ))}
                </div>
              </div>

              {/* Date range + amount range */}
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-wide mb-1.5" style={{color:C.g400}}>
                    <Calendar size={10} className="inline mr-1"/>Date Range
                  </p>
                  <div className="flex items-center gap-1.5">
                    <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)}
                      className="flex-1 min-w-0 px-2 py-1.5 text-xs border-2 rounded-xl focus:outline-none"
                      style={{borderColor:dateFrom?C.green:C.g200, color:C.g700}}/>
                    <span className="text-xs flex-shrink-0" style={{color:C.g400}}>to</span>
                    <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)}
                      className="flex-1 min-w-0 px-2 py-1.5 text-xs border-2 rounded-xl focus:outline-none"
                      style={{borderColor:dateTo?C.green:C.g200, color:C.g700}}/>
                  </div>
                </div>
                <div>
                  <p className="text-xs font-black uppercase tracking-wide mb-1.5" style={{color:C.g400}}>
                    <Bitcoin size={10} className="inline mr-1"/>BTC Amount Range
                  </p>
                  <div className="flex items-center gap-1.5">
                    <input type="number" step="0.00000001" min="0" value={amountMin} onChange={e=>setAmountMin(e.target.value)}
                      placeholder="Min"
                      className="flex-1 min-w-0 px-2 py-1.5 text-xs border-2 rounded-xl focus:outline-none"
                      style={{borderColor:amountMin?C.green:C.g200, color:C.g700}}/>
                    <span className="text-xs flex-shrink-0" style={{color:C.g400}}>to</span>
                    <input type="number" step="0.00000001" min="0" value={amountMax} onChange={e=>setAmountMax(e.target.value)}
                      placeholder="Max"
                      className="flex-1 min-w-0 px-2 py-1.5 text-xs border-2 rounded-xl focus:outline-none"
                      style={{borderColor:amountMax?C.green:C.g200, color:C.g700}}/>
                  </div>
                </div>
              </div>

              {advancedActiveCount>0&&(
                <button onClick={clearAdvanced}
                  className="flex items-center gap-1.5 text-xs font-bold hover:underline"
                  style={{color:C.danger}}>
                  <X size={11}/> Clear advanced filters
                </button>
              )}
            </div>
          )}
        </div>

        {/* ── TRADE LIST ─────────────────────────────────────── */}
        {loading && !trades.length ? (
          <div className="space-y-2">
            {Array(4).fill(0).map((_,i)=>(
              <div key={i} className="bg-white rounded-2xl border animate-pulse p-4" style={{borderColor:C.g200}}>
                <div className="flex justify-between mb-3">
                  <div className="h-5 rounded-full w-32" style={{backgroundColor:C.g200}}/>
                  <div className="h-4 rounded w-20" style={{backgroundColor:C.g100}}/>
                </div>
                <div className="space-y-2">
                  <div className="h-3 rounded w-3/4" style={{backgroundColor:C.g100}}/>
                  <div className="h-3 rounded w-1/2" style={{backgroundColor:C.g100}}/>
                  <div className="h-3 rounded w-2/3" style={{backgroundColor:C.g100}}/>
                </div>
              </div>
            ))}
          </div>
        ) : trades.length===0?(
          <div className="bg-white rounded-2xl border p-10 text-center shadow-sm" style={{borderColor:C.g200}}>
            <div className="text-5xl mb-4">🔄</div>
            <h3 className="font-black text-lg mb-2" style={{color:C.forest}}>No trades yet</h3>
            <p className="text-sm mb-5" style={{color:C.g500}}>
              Browse the marketplace and start your first Bitcoin trade.
            </p>
            <div className="flex justify-center gap-3 flex-wrap">
              <button onClick={()=>navigate('/buy-bitcoin')}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-white font-black text-sm"
                style={{backgroundColor:C.green}}>
                <Bitcoin size={15}/> Buy Bitcoin
              </button>
              <button onClick={()=>navigate('/sell-bitcoin')}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-black text-sm border"
                style={{borderColor:C.g200, color:C.g700}}>
                Sell Bitcoin
              </button>
            </div>
          </div>
        ) : filtered.length===0 ? (
          <div className="bg-white rounded-2xl border p-8 text-center" style={{borderColor:C.g200}}>
            <p className="text-3xl mb-2">🔍</p>
            <p className="font-bold text-sm" style={{color:C.g700}}>No trades match your filter</p>
          </div>
        ) : (
          <div className="space-y-2">
            {/* Separator: active first, then others */}
            {active>0&&filter==='all'&&(
              <p className="text-xs font-black uppercase tracking-widest px-1" style={{color:C.g400}}>
                Active Trades
              </p>
            )}
            {(() => {
              const sorted = sortTrades(filtered);
              return sorted.map((t,i)=>{
                const prevActive = i>0&&isActive(sorted[i-1].status);
                const thisActive = isActive(t.status);
                return(
                  <React.Fragment key={t.id}>
                    {/* Separator between active and non-active — only meaningful for default sort */}
                    {i>0&&prevActive&&!thisActive&&filter==='all'&&sortBy==='newest'&&(
                      <p className="text-xs font-black uppercase tracking-widest px-1 pt-2" style={{color:C.g400}}>
                        Trade History
                      </p>
                    )}
                    <TradeCard trade={t} userId={user?.id}/>
                  </React.Fragment>
                );
              });
            })()}
          </div>
        )}

        {/* Load More */}
        {hasMore&&filter==='all'&&!search&&advancedActiveCount===0&&(
          <div className="flex justify-center mt-3">
            <button onClick={loadMore} disabled={loadingMore}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl font-black text-sm border-2 transition hover:opacity-80"
              style={{borderColor:C.green,color:C.green,backgroundColor:'#fff'}}>
              {loadingMore
                ? <><RefreshCw size={14} className="animate-spin"/> Loading…</>
                : <><Activity size={14}/> Load More Trades</>}
            </button>
          </div>
        )}

        {/* Escrow safety info */}
        {trades.length>0&&(
          <div className="flex items-start gap-3 p-4 rounded-2xl border"
            style={{backgroundColor:`${C.green}06`, borderColor:`${C.green}20`}}>
            <Shield size={14} style={{color:C.green, flexShrink:0, marginTop:1}}/>
            <div>
              <p className="text-xs font-black mb-0.5" style={{color:C.forest}}>All trades are escrow-protected</p>
              <p className="text-xs leading-relaxed" style={{color:C.g500}}>
                Bitcoin is locked in escrow from the moment a trade starts. It is only released when both parties confirm. 0.5% fee auto-deducted on completion.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── FOOTER ─────────────────────────────────────────────── */}
      <footer className="mt-8" style={{backgroundColor:C.forest}}>
        <div className="max-w-5xl mx-auto px-4 pt-8 pb-5">
          <div className="grid md:grid-cols-3 gap-8 mb-6">
            <div>
              <div className="mb-3">
                <span className="text-xl font-black" style={{fontFamily:"'Syne',sans-serif"}}>
                  <span className="text-white">PRA</span><span style={{color:C.gold}}>QEN</span>
                </span>
              </div>
              <p className="text-xs leading-relaxed mb-4" style={{color:'rgba(255,255,255,0.4)'}}>
                The world's most trusted P2P Bitcoin platform. Escrow-protected. Fast. Honest.
              </p>
              <div className="flex gap-2 flex-wrap">
                {[
                  {label:'TikTok',    href:'https://www.tiktok.com/@praqen', bg:'rgba(0,0,0,0.55)', color:'#ffffff', d:'M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z'},
                  {label:'Instagram', href:'https://www.instagram.com/praqen?igsh=MTRkZWg2amp5YnJlYQ%3D%3D&utm_source=qr', bg:'rgba(228,64,95,0.3)', color:'#E4405F', d:'M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z'},
                  {label:'X (Twitter)', href:'https://x.com/praqenapp?s=21', bg:'rgba(255,255,255,0.12)', color:'#ffffff', d:'M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z'},
                  {label:'Discord',   href:'https://discord.gg/V6zCZxfdy', bg:'rgba(88,101,242,0.35)', color:'#5865F2', d:'M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z'},
                  {label:'LinkedIn',  href:'https://www.linkedin.com/in/pra-qen-045373402/', bg:'rgba(10,102,194,0.35)', color:'#0A66C2', d:'M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z'},
                ].map(({label,href,bg,color,d})=>(
                  <a key={label} href={href} target="_blank" rel="noopener noreferrer" title={label}
                    className="w-8 h-8 rounded-lg flex items-center justify-center hover:scale-110 transition-transform"
                    style={{backgroundColor:bg}}>
                    <svg viewBox="0 0 24 24" width="15" height="15" fill={color} aria-hidden="true">
                      <path d={d}/>
                    </svg>
                  </a>
                ))}
              </div>
            </div>
            <div>
              <p className="text-white font-black text-sm mb-3">Trade</p>
              <div className="space-y-2">
                {[['Buy Bitcoin','/buy-bitcoin'],['Sell Bitcoin','/sell-bitcoin'],['Gift Cards','/gift-cards'],['Create Offer','/create-offer'],['My Listings','/my-listings'],['Blog','/blog'],['Privacy','/privacy'],['Terms','/terms']].map(([l,h])=>(
                  <a key={l} href={h} className="block text-xs hover:text-white transition" style={{color:'rgba(255,255,255,0.4)'}}>{l}</a>
                ))}
              </div>
            </div>
            <div>
              <p className="text-white font-black text-sm mb-3">Community</p>
              <div className="space-y-2">
                {[
                  ['TikTok',             'https://www.tiktok.com/@praqen'],
                  ['Discord',            'https://discord.gg/V6zCZxfdy'],
                  ['X (Twitter)',        'https://x.com/praqenapp?s=21'],
                  ['Instagram',          'https://www.instagram.com/praqen?igsh=MTRkZWg2amp5YnJlYQ%3D%3D&utm_source=qr'],
                  ['LinkedIn',           'https://www.linkedin.com/in/pra-qen-045373402/'],
                  ['hello@praqen.com', 'mailto:hello@praqen.com'],
                ].map(([l,h])=>(
                  <a key={l} href={h} target={h.startsWith('mailto')?'_self':'_blank'} rel="noopener noreferrer" className="block text-xs hover:text-white transition" style={{color:'rgba(255,255,255,0.4)'}}>{l}</a>
                ))}
              </div>
            </div>
          </div>
          <div className="flex flex-col md:flex-row items-center justify-between gap-2 pt-4 border-t"
            style={{borderColor:'rgba(255,255,255,0.08)'}}>
            <p className="text-xs" style={{color:'rgba(255,255,255,0.3)'}}>© {new Date().getFullYear()} PRAQEN. All rights reserved.</p>
            <p className="text-xs flex items-center gap-1" style={{color:'rgba(255,255,255,0.3)'}}>
              <Shield size={10}/> Escrow Protected · 0.5% fee on completion only
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
