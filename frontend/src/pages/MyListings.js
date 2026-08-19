import React, { useState, useEffect } from 'react';
import { useRates } from '../contexts/RatesContext';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'react-toastify';
import { copyToClipboard } from '../utils/clipboard';
import {
  Edit, Trash2, Eye, Plus, RefreshCw, Bitcoin,
  Clock, CheckCircle, Shield, Activity,
  Save, X, Gift, Search,
  ArrowRight, ShoppingCart, BarChart2,
  TrendingUp, Tag, CreditCard, ToggleLeft, ToggleRight,
  AlertTriangle, Copy, Zap, Minus, Share2,
  Globe, Wallet, Circle, Pause, Inbox, BellOff,
  Lightbulb, Link2, ClipboardEdit,
} from 'lucide-react';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const C = {
  forest:'#1B4332', green:'#2D6A4F', mint:'#40916C', sage:'#52B788',
  gold:'#F4A422', amber:'#F59E0B', mist:'#F0FAF5', white:'#FFFFFF',
  g50:'#F8FAFC', g100:'#F1F5F9', g200:'#E2E8F0',
  g400:'#94A3B8', g500:'#64748B', g600:'#475569', g700:'#334155', g800:'#1E293B',
  success:'#10B981', danger:'#EF4444', warn:'#F59E0B', paid:'#3B82F6',
  purple:'#8B5CF6', orange:'#F97316',
};

const CUR_SYM = {GHS:'₵',NGN:'₦',KES:'KSh',ZAR:'R',USD:'$',GBP:'£',EUR:'€',UGX:'USh',TZS:'TSh',XAF:'CFA',XOF:'CFA',RWF:'RF',ETB:'Br',AUD:'A$',CAD:'C$',SGD:'S$',INR:'₹'};
const fmt    = (n,d=0) => new Intl.NumberFormat('en-US',{minimumFractionDigits:0,maximumFractionDigits:d}).format(n||0);
const authH  = () => { const t=localStorage.getItem('token'); return t?{Authorization:`Bearer ${t}`}:{}; };
const flag   = code => !code||code.length!==2?<Globe size={13} className="inline-block" />:code.toUpperCase().replace(/./g,c=>String.fromCodePoint(0x1F1E0+c.charCodeAt(0)-65));

const tabOf = l => {
  const lt = (l.listing_type||'').toUpperCase();
  if (lt.includes('GIFT')) return 'gift';
  if (lt === 'SELL' || lt === 'SELL_BITCOIN') return 'sell';
  return 'buy';
};

const shareUrl = id => `${window.location.origin}/listing/${id}`;

// ─── Edit Modal ───────────────────────────────────────────────────────────────
function EditModal({ listing, onClose, onSave, saving, walletBtc, btcPrice }) {
  const { rates: USD_RATES } = useRates();
  const cur = listing.currency || 'USD';
  const sym = listing.currency_symbol || CUR_SYM[cur] || '$';
  const usdRate = USD_RATES[cur] || 1;
  const isSell = (listing.listing_type || '').toUpperCase() === 'SELL' || (listing.listing_type || '').toUpperCase() === 'SELL_BITCOIN';

  // Wallet capacity in local currency (only relevant for SELL offers)
  const walletCapLocal = isSell ? Math.floor(walletBtc * (btcPrice || 88000) * usdRate) : Infinity;
  const minAllowed = Math.ceil(10 * usdRate); // $10 in local currency

  const [form, setForm] = useState({
    margin:             parseFloat(listing.margin || 0),
    min_limit_local:    listing.min_limit_local || Math.round((listing.min_limit_usd || 10) * usdRate),
    max_limit_local:    listing.max_limit_local || Math.round((listing.max_limit_usd || 1000) * usdRate),
    payment_method:     listing.payment_method || '',
    trade_instructions: listing.trade_instructions || '',
    listing_terms:      listing.listing_terms || '',
    time_limit:         listing.time_limit || 30,
  });

  const set = (k,v) => setForm(f=>({...f,[k]:v}));

  const minVal = parseFloat(form.min_limit_local) || 0;
  const maxVal = parseFloat(form.max_limit_local) || 0;
  const minBelowFloor = minVal < minAllowed;
  const maxAboveCap   = isSell && walletCapLocal < Infinity && maxVal > walletCapLocal;
  const maxBelowMin   = maxVal > 0 && minVal > 0 && maxVal < minVal;
  const canSave = !minBelowFloor && !maxAboveCap && !maxBelowMin && minVal > 0 && maxVal > 0;

  return (
    <div className="fixed inset-0 flex items-end md:items-center justify-center p-0 md:p-4"
      style={{backgroundColor:'rgba(0,0,0,0.6)',backdropFilter:'blur(6px)',zIndex:1100}}>
      {/* flex-col + max-h ensures the footer is ALWAYS on screen, never cut off by the navbar */}
      <div className="bg-white w-full md:max-w-lg rounded-t-3xl md:rounded-3xl shadow-2xl flex flex-col max-h-[92dvh] md:max-h-[85vh]">

        {/* Header — fixed height, never scrolls */}
        <div className="flex items-center justify-between px-5 py-4 border-b flex-shrink-0" style={{borderColor:C.g100}}>
          <div>
            <h2 className="font-black text-lg" style={{color:C.forest}}>Edit Offer</h2>
            <p className="text-sm font-semibold mt-0.5" style={{color:C.g500}}>
              #{String(listing.id||'').slice(0,8).toUpperCase()} · {listing.payment_method}
            </p>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-gray-100">
            <X size={18} style={{color:C.g500}}/>
          </button>
        </div>

        {/* Scrollable fields — flex-1 + min-h-0 makes it shrink so footer stays visible */}
        <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-5">
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-black" style={{color:C.g700}}>Margin</label>
              {(() => {
                const m = parseFloat(form.margin);
                const isNeg = !isNaN(m) && m < 0;
                const isPos = !isNaN(m) && m > 0;
                return (
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-lg"
                    style={{
                      backgroundColor: isPos ? `${C.success}15` : isNeg ? `${C.danger}15` : `${C.g400}15`,
                      color: isPos ? C.success : isNeg ? C.danger : C.g500,
                    }}>
                    {isPos ? `+${m}% above market` : isNeg ? `${m}% below market` : 'At market rate'}
                  </span>
                );
              })()}
            </div>
            <div className="flex items-center gap-3">
              <button onClick={()=>set('margin',parseFloat(Math.max(-10,parseFloat((form.margin-0.5).toFixed(1)))))}
                className="w-11 h-11 rounded-xl border-2 flex items-center justify-center flex-shrink-0"
                style={{borderColor:C.danger,backgroundColor:`${C.danger}10`}}>
                <Minus size={16} style={{color:C.danger}}/>
              </button>
              <div className="flex-1 relative">
                <input type="number" step="0.5" min="-10" max="100"
                  value={form.margin}
                  onChange={e => {
                    const raw = e.target.value;
                    if (raw === '' || raw === '-') { set('margin', raw); return; }
                    const n = parseFloat(raw);
                    if (!isNaN(n)) set('margin', Math.max(-10, Math.min(100, n)));
                  }}
                  onBlur={() => {
                    const n = parseFloat(form.margin);
                    if (isNaN(n)) set('margin', 0);
                    else set('margin', Math.max(-10, Math.min(100, parseFloat(n.toFixed(1)))));
                  }}
                  className="w-full px-4 pr-10 py-3.5 text-xl font-black border-2 rounded-xl focus:outline-none text-center"
                  style={{
                    borderColor: form.margin < 0 ? C.danger : C.green,
                    color: form.margin < 0 ? C.danger : form.margin > 0 ? C.success : C.g500,
                  }}/>
                <span className="absolute right-3 top-1/2 -translate-y-1/2 font-black text-base" style={{color:C.g400}}>%</span>
              </div>
              <button onClick={()=>set('margin',parseFloat(Math.min(100,parseFloat((form.margin+0.5).toFixed(1)))))}
                className="w-11 h-11 rounded-xl border-2 flex items-center justify-center flex-shrink-0"
                style={{borderColor:C.success,backgroundColor:`${C.success}10`}}>
                <Plus size={16} style={{color:C.success}}/>
              </button>
            </div>
            <p className="text-xs mt-1.5 font-semibold" style={{color:C.g400}}>
              Negative = below market rate (attracts more buyers) · Positive = your profit above market
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-black" style={{color:C.g700}}>Trade Range ({sym} {cur})</label>
              {isSell && walletCapLocal < Infinity && (
                <span className="text-xs font-bold px-2 py-0.5 rounded-lg inline-flex items-center gap-1"
                  style={{backgroundColor:`${C.success}15`, color:C.success}}>
                  <Wallet size={12} className="inline-block" /> Wallet cap: {sym}{fmt(walletCapLocal)}
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                {key:'min_limit_local', label:'Minimum', isMin:true, isMax:false},
                {key:'max_limit_local', label:'Maximum', isMin:false, isMax:true},
              ].map(({key, label, isMin, isMax})=>{
                const val = parseFloat(form[key]) || 0;
                const hasErr = (isMin && val > 0 && val < minAllowed) ||
                               (isMax && maxAboveCap) ||
                               (isMax && maxBelowMin);
                return (
                <div key={key}>
                  <p className="text-sm font-bold mb-1.5" style={{color: hasErr ? C.danger : C.g500}}>
                    {label}
                    {isMax && walletCapLocal < Infinity && (
                      <span className="ml-1 text-xs font-semibold" style={{color:C.g400}}>
                        (max {sym}{fmt(walletCapLocal)})
                      </span>
                    )}
                    {isMin && (
                      <span className="ml-1 text-xs font-semibold" style={{color:C.g400}}>
                        (min {sym}{fmt(minAllowed)})
                      </span>
                    )}
                  </p>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-black" style={{color:C.g400}}>{sym}</span>
                    <input type="number" value={form[key]} onChange={e=>set(key,e.target.value)}
                      onBlur={() => {
                        if (isMin && val < minAllowed) set(key, minAllowed);
                        if (isMax && isSell && walletCapLocal < Infinity && val > walletCapLocal) set(key, walletCapLocal);
                      }}
                      min={isMin ? minAllowed : 1}
                      max={isMax && walletCapLocal < Infinity ? walletCapLocal : undefined}
                      className="w-full pl-8 pr-3 py-3 text-base font-bold border-2 rounded-xl focus:outline-none"
                      style={{borderColor: hasErr ? C.danger : form[key] ? C.green : C.g200, color:C.forest}}/>
                  </div>
                  {val > 0 && (
                    <p className="text-xs mt-0.5 font-semibold" style={{color: hasErr ? C.danger : C.g400}}>
                      ≈ ${fmt(val / usdRate, 0)} USD
                    </p>
                  )}
                </div>
                );
              })}
            </div>
            {(minBelowFloor || maxAboveCap || maxBelowMin) && (
              <div className="mt-2 p-2.5 rounded-xl flex items-start gap-2"
                style={{backgroundColor:`${C.danger}10`}}>
                <AlertTriangle size={13} style={{color:C.danger, flexShrink:0, marginTop:1}}/>
                <p className="text-xs font-semibold" style={{color:C.danger}}>
                  {minBelowFloor && `Minimum must be at least ${sym}${fmt(minAllowed)} (= $10 USD). `}
                  {maxAboveCap && `Maximum cannot exceed your wallet balance of ${sym}${fmt(walletCapLocal)} ${cur}. `}
                  {maxBelowMin && `Maximum must be greater than or equal to minimum. `}
                </p>
              </div>
            )}
          </div>

          <div>
            <label className="text-sm font-black mb-2 block" style={{color:C.g700}}>Payment Method</label>
            <input type="text" value={form.payment_method} onChange={e=>set('payment_method',e.target.value)}
              placeholder="e.g. MTN Mobile Money"
              className="w-full px-4 py-3 text-base font-semibold border-2 rounded-xl focus:outline-none"
              style={{borderColor:form.payment_method?C.green:C.g200}}/>
          </div>

          <div>
            <label className="text-sm font-black mb-2 block" style={{color:C.g700}}>Payment Window</label>
            <div className="grid grid-cols-6 gap-1.5">
              {[15,30,45,60,90,120].map(t=>(
                <button key={t} onClick={()=>set('time_limit',t)}
                  className="py-2.5 rounded-xl text-sm font-black border-2 transition"
                  style={{borderColor:form.time_limit===t?C.green:C.g200,backgroundColor:form.time_limit===t?C.green:'transparent',color:form.time_limit===t?C.white:C.g500}}>
                  {t}<span style={{fontSize:11}}>m</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-sm font-black mb-2 block" style={{color:C.g700}}>Trade Instructions</label>
            <textarea value={form.trade_instructions} onChange={e=>set('trade_instructions',e.target.value)}
              rows={3} placeholder="Tell traders exactly how to pay you…"
              className="w-full px-4 py-3 text-sm font-medium border-2 rounded-xl focus:outline-none resize-none"
              style={{borderColor:C.g200}}/>
          </div>

          <div>
            <label className="text-sm font-black mb-2 block" style={{color:C.g700}}>
              Offer Terms <span className="font-normal text-xs" style={{color:C.g400}}>(optional)</span>
            </label>
            <textarea value={form.listing_terms} onChange={e=>set('listing_terms',e.target.value)}
              rows={2} placeholder="Any conditions or restrictions…"
              className="w-full px-4 py-3 text-sm font-medium border-2 rounded-xl focus:outline-none resize-none"
              style={{borderColor:C.g200}}/>
          </div>
        </div>

        {/* Footer — flex-shrink-0 keeps it pinned to bottom, safe area handles iOS home indicator */}
        <div className="flex-shrink-0 px-5 pt-4 border-t flex gap-3"
          style={{borderColor:C.g100, paddingBottom:'max(24px, env(safe-area-inset-bottom, 24px))'}}>
          <button onClick={onClose}
            className="flex-1 py-4 rounded-2xl border text-base font-bold hover:bg-gray-50 transition"
            style={{borderColor:C.g200,color:C.g600}}>Cancel</button>
          <button onClick={()=>canSave && onSave(listing.id,form,usdRate)} disabled={saving||!canSave}
            className="flex-2 py-4 rounded-2xl text-white text-base font-black flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-50 transition"
            style={{backgroundColor: canSave ? C.green : C.g400, flex:2, cursor: canSave ? 'pointer' : 'not-allowed'}}>
            {saving?<><RefreshCw size={16} className="animate-spin"/>Saving…</>:<><Save size={16}/>Save Changes</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Toggle Switch ────────────────────────────────────────────────────────────
function ToggleSwitch({ active, onToggle, loading }) {
  return (
    <button onClick={e=>{e.stopPropagation();onToggle();}} disabled={loading}
      title={active?'Pause offer':'Activate offer'}
      className="relative flex-shrink-0 transition-all disabled:opacity-50"
      style={{width:44,height:24}}>
      <div className="w-full h-full rounded-full transition-all duration-300"
        style={{backgroundColor:active?C.success:C.g300}}/>
      <div className="absolute top-1 transition-all duration-300 w-4 h-4 rounded-full bg-white shadow flex items-center justify-center"
        style={{left:active?'calc(100% - 18px)':'4px'}}>
        {loading
          ? <RefreshCw size={8} className="animate-spin" style={{color:active?C.success:C.g400}}/>
          : active
            ? <Zap size={8} style={{color:C.success}}/>
            : <X size={7} style={{color:C.g400}}/>}
      </div>
    </button>
  );
}

// ─── Compact Offer Card ───────────────────────────────────────────────────────
function OfferCard({ listing, onEdit, onDelete, onToggle, walletBtc }) {
  const { rates: USD_RATES } = useRates();
  const [toggling,       setToggling]       = useState(false);
  const [confirmDelete,  setConfirmDelete]  = useState(false);
  const [copied,         setCopied]         = useState(false);

  const isActive = listing.status === 'ACTIVE';
  const tab      = tabOf(listing);
  const cur      = listing.currency || 'USD';
  const sym      = listing.currency_symbol || CUR_SYM[cur] || '$';
  const usdRate  = USD_RATES[cur] || 1;
  const margin   = parseFloat(listing.margin || 0);
  const minLocal = listing.min_limit_local || (listing.min_limit_usd ? listing.min_limit_usd * usdRate : 0);
  const maxLocal = listing.max_limit_local || (listing.max_limit_usd ? listing.max_limit_usd * usdRate : 0);
  const views    = parseInt(listing.view_count || 0);

  const isBuyGiftCard   = (listing.listing_type || '').toUpperCase() === 'BUY_GIFT_CARD';
  const walletUsd       = parseFloat(walletBtc || 0) * 88000;
  const pausedLowBal    = !isActive && isBuyGiftCard && walletUsd < 10;
  // Paused due to inactivity: PAUSED, not a low-balance gift card case
  const pausedInactive  = !isActive && !pausedLowBal;


  const coin = listing.asset === 'USDT' ? 'USDT' : 'BTC';
  const TYPE_CFG = {
    sell: { label:`Sell ${coin}`,   badge:`Buy ${coin} page`,    color:C.green,  icon:Bitcoin      },
    buy:  { label:`Buy ${coin}`,    badge:`Sell ${coin} page`,   color:C.paid,   icon:ShoppingCart },
    gift: { label:'Gift Card',      badge:'Gift Cards page',     color:C.purple, icon:Gift         },
  };
  const tc   = TYPE_CFG[tab] || TYPE_CFG.sell;
  const Icon = tc.icon;

  const handleToggle = async () => {
    setToggling(true);
    await onToggle(listing.id, listing.status);
    setToggling(false);
  };

  const copyLink = () => {
    copyToClipboard(shareUrl(listing.id), 'Link copied!')
      .then((ok) => { if (ok) { setCopied(true); setTimeout(()=>setCopied(false),2000); } });
  };

  const marginDisplay = margin === 0 ? 'Market' : margin > 0 ? `+${margin}%` : `${margin}%`;
  const marginColor   = margin > 0 ? C.success : margin < 0 ? C.danger : C.g500;
  const rangeDisplay  = minLocal > 0 && maxLocal > 0
    ? `${sym}${fmt(minLocal)}–${sym}${fmt(maxLocal)}`
    : '—';

  return (
    <div className="bg-white rounded-xl border transition-all w-full overflow-hidden"
      style={{borderColor: isActive ? `${tc.color}40` : C.g200, opacity: isActive ? 1 : 0.75}}>

      {/* ── Top: type + status + toggle + delete ── */}
      <div className="flex items-center gap-2 px-3 pt-2.5 pb-2 border-b" style={{borderColor:C.g100}}>
        {/* Icon */}
        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{backgroundColor:`${tc.color}15`}}>
          <Icon size={15} style={{color:tc.color}}/>
        </div>

        {/* Label + ID */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-black text-sm" style={{color:C.forest}}>{tc.label}</span>
            <span className="text-xs font-bold px-2 py-0.5 rounded-full"
              style={{backgroundColor:`${tc.color}12`,color:tc.color}}>
              {tc.badge}
            </span>
            {listing.gift_card_brand && (
              <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                style={{backgroundColor:`${C.purple}12`,color:C.purple}}>
                {listing.gift_card_brand}
              </span>
            )}
          </div>
          <p className="text-xs font-bold mt-0.5" style={{color:isActive?C.success:C.g400}}>
            {isActive
            ? <span className="inline-flex items-center gap-1"><Circle size={9} fill="currentColor" className="inline-block" /> Live</span>
            : <span className="inline-flex items-center gap-1"><Pause size={10} className="inline-block" /> Paused</span>} · #{String(listing.id||'').slice(0,6).toUpperCase()}
          </p>
        </div>

        {/* Toggle */}
        <div className="flex flex-col items-center flex-shrink-0">
          <ToggleSwitch active={isActive} onToggle={handleToggle} loading={toggling}/>
          <span style={{fontSize:9,fontWeight:900,color:isActive?C.success:C.g400}}>
            {isActive?'ON':'OFF'}
          </span>
        </div>

        {/* Delete */}
        {confirmDelete ? (
          <div className="flex items-center gap-1 flex-shrink-0">
            <button onClick={()=>setConfirmDelete(false)}
              className="text-xs font-bold px-2 py-1 rounded-lg border"
              style={{borderColor:C.g200,color:C.g500}}>No</button>
            <button onClick={()=>{setConfirmDelete(false);onDelete(listing.id);}}
              className="text-xs font-black px-2.5 py-1 rounded-lg text-white"
              style={{backgroundColor:C.danger}}>Del</button>
          </div>
        ) : (
          <button onClick={()=>setConfirmDelete(true)}
            className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{backgroundColor:`${C.danger}10`}}>
            <Trash2 size={11} style={{color:C.danger}}/>
          </button>
        )}
      </div>

      {/* ── Metrics: 2×2 grid ── */}
      <div className="grid grid-cols-2 gap-px" style={{backgroundColor:C.g100}}>
        <div className="bg-white px-3 py-2.5">
          <p className="text-xs font-bold uppercase" style={{color:C.g400,letterSpacing:'0.04em'}}>Margin</p>
          <p className="font-black text-sm mt-0.5" style={{color:marginColor}}>{marginDisplay}</p>
        </div>
        <div className="bg-white px-3 py-2.5 min-w-0 overflow-hidden">
          <p className="text-xs font-bold uppercase" style={{color:C.g400,letterSpacing:'0.04em'}}>Range</p>
          <p className="font-black text-sm mt-0.5 truncate" style={{color:C.forest}}>{rangeDisplay} {cur}</p>
        </div>
        <div className="bg-white px-3 py-2.5 min-w-0 overflow-hidden">
          <p className="text-xs font-bold uppercase" style={{color:C.g400,letterSpacing:'0.04em'}}>Payment</p>
          <p className="font-black text-sm mt-0.5 truncate" style={{color:C.paid}}>{listing.payment_method||'—'}</p>
        </div>
        <div className="bg-white px-3 py-2.5">
          <p className="text-xs font-bold uppercase" style={{color:C.g400,letterSpacing:'0.04em'}}>Views · Time</p>
          <p className="font-black text-sm mt-0.5" style={{color:C.g600}}>
            <Eye size={11} className="inline mr-0.5" style={{color:C.amber}}/>{fmt(views)}
            <span className="mx-1" style={{color:C.g300}}>·</span>
            <Clock size={11} className="inline mr-0.5"/>{listing.time_limit||30}m
          </p>
        </div>
      </div>

      {/* ── Low-balance warning for paused BUY_GIFT_CARD offers ── */}
      {pausedLowBal && (
        <div className="mx-3 mb-3 rounded-xl overflow-hidden border-2" style={{borderColor:'#F59E0B'}}>
          <div className="flex items-center gap-2 px-3 py-2"
            style={{background:'linear-gradient(135deg,#92400E,#B45309)'}}>
            <AlertTriangle size={14} className="inline-block" style={{color:'#FDE68A'}} />
            <span className="text-xs font-black text-white tracking-wide">Offer Paused — Insufficient Balance</span>
          </div>
          <div className="px-3 py-2.5" style={{backgroundColor:'#FFFBEB'}}>
            <p className="text-xs font-semibold leading-relaxed" style={{color:'#92400E'}}>
              Your gift card buying offer was automatically paused because your PRAQEN wallet has less than <strong>$10 worth of Bitcoin</strong>.
            </p>
            <p className="text-xs font-bold mt-1.5" style={{color:'#B45309'}}>
              <ArrowRight size={12} className="inline-block mr-1" /> Top up your wallet with at least <strong>$10 in BTC</strong> and your offer will be reactivated automatically.
            </p>
          </div>
        </div>
      )}

      {/* ── Inactivity pause warning ── */}
      {pausedInactive && (
        <div className="mx-3 mb-3 rounded-xl overflow-hidden" style={{border:`2px solid ${C.danger}50`}}>
          <div className="flex items-center gap-2 px-3 py-2"
            style={{background:`linear-gradient(135deg,#991B1B,${C.danger})`}}>
            <BellOff size={14} className="inline-block" style={{color:'#FECACA'}} />
            <span className="text-xs font-black text-white tracking-wide">Offer Paused — Inactivity Detected</span>
          </div>
          <div className="px-3 py-2.5" style={{backgroundColor:'#FEF2F2'}}>
            <p className="text-xs font-semibold leading-relaxed mb-2" style={{color:'#991B1B'}}>
              This offer was automatically paused because your account showed no activity for <strong>10+ days</strong>. It is no longer visible to buyers in the marketplace.
            </p>
            <button
              onClick={handleToggle}
              disabled={toggling}
              className="w-full py-2 rounded-lg text-xs font-black text-white flex items-center justify-center gap-1.5 transition active:scale-[0.98]"
              style={{background:`linear-gradient(135deg,${C.forest},${C.green})`, opacity: toggling ? 0.7 : 1}}>
              {toggling
                ? <><RefreshCw size={11} className="animate-spin"/> Reactivating…</>
                : <><Zap size={11}/> Reactivate Offer — Go Live Now</>}
            </button>
          </div>
        </div>
      )}

      {/* ── Actions ── */}
      <div className="flex gap-2 p-3">
        <button onClick={()=>onEdit(listing)}
          className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-black border transition flex-1"
          style={{borderColor:C.green,color:C.green}}>
          <Edit size={13}/> Edit
        </button>
        <button onClick={copyLink}
          className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-black border transition flex-1"
          style={{borderColor:copied?C.success:C.paid,color:copied?C.success:C.paid,backgroundColor:copied?`${C.success}08`:`${C.paid}06`}}>
          {copied ? <><CheckCircle size={13}/> Copied!</> : <><Share2 size={13}/> Share</>}
        </button>
      </div>
    </div>
  );
}

// ─── Tab panel ────────────────────────────────────────────────────────────────
function TabPanel({ listings, onEdit, onDelete, onToggle, onToggleAll, search, walletBtc }) {
  const filtered = listings.filter(l => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (l.payment_method||'').toLowerCase().includes(q) ||
      (l.country_name||l.country||'').toLowerCase().includes(q) ||
      (l.gift_card_brand||'').toLowerCase().includes(q) ||
      String(l.margin||'').includes(q)
    );
  });

  const activeCount = listings.filter(l=>l.status==='ACTIVE').length;
  const allActive   = activeCount === listings.length && listings.length > 0;

  if (listings.length === 0) {
    return (
      <div className="text-center py-10">
        <Inbox size={42} className="inline-block mb-2" style={{color:C.g400}} />
        <p className="font-bold text-sm" style={{color:C.g700}}>No offers here yet</p>
        <p className="text-xs mt-1" style={{color:C.g400}}>Create an offer to get started</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Per-tab bulk toggle */}
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold" style={{color:C.g500}}>
          {filtered.length} offer{filtered.length!==1?'s':''} · {activeCount} active
        </p>
        <button
          onClick={()=>onToggleAll(listings.map(l=>l.id), allActive?'PAUSED':'ACTIVE')}
          className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-black border transition hover:bg-gray-50"
          style={{borderColor:C.g200,color:allActive?C.warn:C.success}}>
          {allActive
            ? <><ToggleLeft size={11}/> Pause tab</>
            : <><ToggleRight size={11}/> Activate tab</>}
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-6 rounded-xl border" style={{borderColor:C.g200}}>
          <Search size={22} className="inline-block mb-1" style={{color:C.g400}} />
          <p className="font-bold text-xs" style={{color:C.g700}}>No offers match your search</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(l => (
            <OfferCard key={l.id} listing={l} onEdit={onEdit} onDelete={onDelete} onToggle={onToggle} walletBtc={walletBtc}/>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({icon:Icon, label, value, color, sub}) {
  return (
    <div className="bg-white rounded-xl border p-3 shadow-sm" style={{borderColor:C.g200}}>
      <div className="w-8 h-8 rounded-lg flex items-center justify-center mb-1.5"
        style={{backgroundColor:`${color}15`}}>
        <Icon size={14} style={{color}}/>
      </div>
      <p className="text-xl font-black" style={{color:C.g800}}>{value}</p>
      <p className="text-xs font-semibold mt-0.5" style={{color:C.g500}}>{label}</p>
      {sub&&<p className="text-xs mt-0.5" style={{color:C.g400}}>{sub}</p>}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function MyListings({ user }) {
  const navigate = useNavigate();
  const { btcUsd: btcPrice } = useRates();
  const [listings,    setListings]    = useState([]);
  const [walletBtc,   setWalletBtc]   = useState(0);
  const [loading,     setLoading]     = useState(true);
  const [editListing, setEditListing] = useState(null);
  const [saving,      setSaving]      = useState(false);
  const [search,      setSearch]      = useState('');
  const [activeTab,   setActiveTab]   = useState('sell');

  useEffect(()=>{ if(!user){navigate('/login');return;} load(); },[user]);

  const load = async () => {
    setLoading(true);
    try {
      const [listingsRes, walletRes] = await Promise.allSettled([
        axios.get(`${API_URL}/my-listings`, { headers: authH() }),
        axios.get(`${API_URL}/hd-wallet/wallet`, { headers: authH() }),
      ]);

      let currentListings = [];
      if (listingsRes.status === 'fulfilled') {
        currentListings = (listingsRes.value.data.listings || []).filter(l => l.status !== 'DELETED');
      } else {
        toast.error('Failed to load your offers');
      }

      let currentWalletBtc = 0;
      if (walletRes.status === 'fulfilled') {
        currentWalletBtc = parseFloat(walletRes.value.data.available_btc || walletRes.value.data.balance_btc || 0);
        setWalletBtc(currentWalletBtc);
      }

      // Auto-reactivate PAUSED SELL and BUY_GIFT_CARD offers when wallet has $10+ worth of BTC
      const liveBtcPrice = btcPrice || 88000;
      if (currentWalletBtc * liveBtcPrice >= 10) {
        const pausedBtcRequired = currentListings.filter(l => {
          const lt = (l.listing_type || '').toUpperCase();
          return l.status === 'PAUSED' && (lt === 'SELL' || lt === 'SELL_BITCOIN' || lt === 'BUY_GIFT_CARD');
        });
        if (pausedBtcRequired.length > 0) {
          await Promise.allSettled(
            pausedBtcRequired.map(l =>
              axios.patch(`${API_URL}/listings/${l.id}/status`, { status: 'ACTIVE' }, { headers: authH() })
            )
          );
          currentListings = currentListings.map(l =>
            pausedBtcRequired.some(p => p.id === l.id) ? { ...l, status: 'ACTIVE' } : l
          );
        }
      }

      setListings(currentListings);
    } finally { setLoading(false); }
  };

  const saveEdit = async (id, form, usdRate) => {
    setSaving(true);
    try {
      const rate = usdRate || 1;
      const minLocal = parseFloat(form.min_limit_local) || 0;
      const maxLocal = parseFloat(form.max_limit_local) || 0;
      const r = await axios.put(`${API_URL}/listings/${id}`, {
        margin:             parseFloat(form.margin),
        min_limit_local:    minLocal,
        max_limit_local:    maxLocal,
        min_limit_usd:      parseFloat((minLocal / rate).toFixed(2)),
        max_limit_usd:      parseFloat((maxLocal / rate).toFixed(2)),
        payment_method:     form.payment_method,
        trade_instructions: form.trade_instructions,
        listing_terms:      form.listing_terms,
        time_limit:         parseInt(form.time_limit),
      },{headers:authH()});
      if (r.data.success) {
        toast.success('Offer updated!');
        setEditListing(null);
        setListings(prev=>prev.map(l=>l.id===id?{
          ...l, ...form,
          margin:           parseFloat(form.margin),
          min_limit_local:  minLocal,
          max_limit_local:  maxLocal,
          min_limit_usd:    parseFloat((minLocal / rate).toFixed(2)),
          max_limit_usd:    parseFloat((maxLocal / rate).toFixed(2)),
        }:l));
      }
    } catch(e) { toast.error(e.response?.data?.error||'Failed to update'); }
    finally { setSaving(false); }
  };

  // Instant remove — revert only the specific item on failure
  const deleteListing = async (id) => {
    const removed = listings.find(l=>l.id===id);
    setListings(prev=>prev.filter(l=>l.id!==id));
    try {
      await axios.delete(`${API_URL}/listings/${id}`,{headers:authH()});
      toast.success('Offer deleted');
    } catch(e) {
      if(removed) setListings(prev=>[removed,...prev.filter(l=>l.id!==id)]);
      toast.error(e.response?.data?.error||'Failed to delete. Try again.');
    }
  };

  // Optimistic toggle — revert on failure
  const toggleStatus = async (id, current) => {
    const next = current==='ACTIVE'?'PAUSED':'ACTIVE';
    setListings(prev=>prev.map(l=>l.id===id?{...l,status:next}:l));
    try {
      const r = await axios.patch(`${API_URL}/listings/${id}/status`,{status:next},{headers:authH()});
      if (!r.data.success) {
        setListings(prev=>prev.map(l=>l.id===id?{...l,status:current}:l));
        toast.error('Failed to update status');
      } else {
        toast.success(`Offer ${next==='ACTIVE'?'activated':'paused'}`);
      }
    } catch {
      setListings(prev=>prev.map(l=>l.id===id?{...l,status:current}:l));
      toast.error('Failed to update status');
    }
  };

  // Bulk toggle for a subset of IDs
  const toggleAll = async (ids, targetStatus) => {
    setListings(prev=>prev.map(l=>ids.includes(l.id)?{...l,status:targetStatus}:l));
    const results = await Promise.allSettled(
      ids.map(id=>axios.patch(`${API_URL}/listings/${id}/status`,{status:targetStatus},{headers:authH()}))
    );
    const failed = results.filter(r=>r.status==='rejected').length;
    if (failed===0) toast.success(`All offers ${targetStatus==='ACTIVE'?'activated':'paused'}`);
    else { toast.warn(`${failed} offer(s) failed to update`); load(); }
  };

  const sellListings  = listings.filter(l=>tabOf(l)==='sell');
  const buyListings   = listings.filter(l=>tabOf(l)==='buy');
  const gcListings    = listings.filter(l=>tabOf(l)==='gift');
  const totalActive   = listings.filter(l=>l.status==='ACTIVE').length;
  const totalViews    = listings.reduce((s,l)=>s+parseInt(l.view_count||0),0);
  const allIds       = listings.map(l=>l.id);
  const allAreActive = listings.length > 0 && totalActive === listings.length;

  const TABS = [
    {id:'sell', label:'Sell Offers',      count:sellListings.length, color:C.green,  icon:Bitcoin},
    {id:'buy',  label:'Buy Offers',       count:buyListings.length,  color:C.paid,   icon:ShoppingCart},
    {id:'gift', label:'Gift Card Offers', count:gcListings.length,   color:C.purple, icon:Gift},
  ];
  const tabListings = activeTab==='sell'?sellListings:activeTab==='buy'?buyListings:gcListings;

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{backgroundColor:C.mist}}>
      <div className="text-center">
        <div className="w-10 h-10 border-4 rounded-full animate-spin mx-auto mb-3"
          style={{borderColor:C.sage,borderTopColor:'transparent'}}/>
        <p className="text-sm font-semibold" style={{color:C.green}}>Loading your offers…</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col" style={{backgroundColor:C.g50,fontFamily:"'DM Sans',sans-serif"}}>
      <div className="max-w-3xl mx-auto w-full px-3 sm:px-4 py-5 space-y-4">

        {/* ── HEADER ── */}
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h1 className="font-black text-xl sm:text-2xl" style={{color:C.forest,fontFamily:"'Syne',sans-serif"}}>
              My Offers
            </h1>
            <p className="text-xs mt-0.5" style={{color:C.g500}}>
              {listings.length} total · {totalActive} active · {totalViews} views
            </p>
          </div>
          <div className="flex gap-1.5 flex-shrink-0">
            <button onClick={load}
              className="flex items-center gap-1 px-2.5 py-2 rounded-xl border text-xs font-bold hover:bg-white transition"
              style={{borderColor:C.g200,color:C.g600}}>
              <RefreshCw size={12}/><span className="hidden sm:inline">Refresh</span>
            </button>
            <button onClick={()=>navigate('/create-offer')}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black hover:opacity-90 transition shadow-sm"
              style={{backgroundColor:C.gold,color:C.forest}}>
              <Plus size={13}/> <span className="hidden sm:inline">Create </span>Offer
            </button>
          </div>
        </div>

        {/* ── STATS ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <StatCard icon={Activity}    label="Total Offers" value={listings.length}    color={C.green}/>
          <StatCard icon={CheckCircle} label="Active"       value={totalActive}        color={C.success} sub="Live on market"/>
          <StatCard icon={Eye}         label="Total Views"  value={fmt(totalViews)}    color={C.amber}/>
          <StatCard icon={Bitcoin}     label="Sell"         value={sellListings.length} color={C.gold}   sub={`${buyListings.length} buy · ${gcListings.length} gift`}/>
        </div>

        {/* ── GLOBAL ON / OFF ALL ── */}
        {listings.length > 0 && (
          <div className="flex items-center justify-between p-3 rounded-xl border flex-wrap gap-2"
            style={{backgroundColor:allAreActive?`${C.warn}08`:`${C.success}08`,borderColor:allAreActive?`${C.warn}30`:`${C.success}30`}}>
            <div className="min-w-0">
              <p className="text-xs font-black" style={{color:C.forest}}>
                {allAreActive
                ? <span className="inline-flex items-center gap-1"><Zap size={12} /> All offers are live</span>
                : totalActive===0
                ? <span className="inline-flex items-center gap-1"><Pause size={12} /> All offers are paused</span>
                : `${totalActive} of ${listings.length} offers active`}
              </p>
              <p className="text-xs mt-0.5" style={{color:C.g500}}>Toggle all offers at once</p>
            </div>
            <div className="flex gap-2 flex-shrink-0">
              <button
                onClick={()=>toggleAll(allIds, 'ACTIVE')}
                disabled={allAreActive}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-black text-white disabled:opacity-40 transition hover:opacity-90"
                style={{backgroundColor:C.success}}>
                <ToggleRight size={12}/> All ON
              </button>
              <button
                onClick={()=>toggleAll(allIds, 'PAUSED')}
                disabled={totalActive===0}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-black text-white disabled:opacity-40 transition hover:opacity-90"
                style={{backgroundColor:C.warn}}>
                <ToggleLeft size={12}/> All OFF
              </button>
            </div>
          </div>
        )}

        {/* ── EMPTY STATE ── */}
        {listings.length === 0 && (
          <div className="bg-white rounded-2xl border p-10 text-center shadow-sm" style={{borderColor:C.g200}}>
            <div className="mb-4 flex justify-center"><ClipboardEdit size={44} style={{color:C.g200}} /></div>
            <h3 className="font-black text-lg mb-2" style={{color:C.forest}}>No offers yet</h3>
            <p className="text-sm mb-5" style={{color:C.g500}}>Create your first offer to start earning on PRAQEN.</p>
            <button onClick={()=>navigate('/create-offer')}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-white font-black text-sm hover:opacity-90"
              style={{backgroundColor:C.green}}>
              <Plus size={15}/> Create Your First Offer
            </button>
          </div>
        )}

        {listings.length > 0 && (
          <>
            {/* ── TABS ── */}
            <div className="bg-white rounded-2xl border overflow-hidden w-full" style={{borderColor:C.g200}}>
              {/* Tab bar */}
              <div className="flex border-b" style={{borderColor:C.g100}}>
                {TABS.map(tab=>{
                  const TabIcon = tab.icon;
                  const isCur = activeTab===tab.id;
                  return (
                    <button key={tab.id} onClick={()=>setActiveTab(tab.id)}
                      className="flex-1 flex flex-col sm:flex-row items-center justify-center gap-1 px-1 py-2.5 font-black transition relative overflow-hidden"
                      style={{color:isCur?tab.color:C.g400,backgroundColor:isCur?`${tab.color}06`:'transparent',fontSize:11}}>
                      {isCur&&(
                        <div className="absolute bottom-0 left-0 right-0 h-0.5 rounded-t-full"
                          style={{backgroundColor:tab.color}}/>
                      )}
                      <TabIcon size={13}/>
                      <span className="truncate max-w-full" style={{fontSize:10}}>
                        <span className="hidden sm:inline">{tab.label}</span>
                        <span className="sm:hidden">{tab.label.split(' ')[0]}</span>
                      </span>
                      {tab.count>0&&(
                        <span className="font-black px-1.5 py-0.5 rounded-full flex-shrink-0"
                          style={{backgroundColor:isCur?tab.color:C.g100,color:isCur?'#fff':C.g500,fontSize:10}}>
                          {tab.count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Search + description */}
              <div className="px-3 sm:px-4 py-2 border-b flex items-center gap-2"
                style={{borderColor:C.g100,backgroundColor:C.g50}}>
                <p className="text-xs font-semibold flex-1 hidden sm:block" style={{color:C.g500}}>
                  {activeTab==='sell'&&'Listed on the Buy Bitcoin marketplace page'}
                  {activeTab==='buy' &&'Listed on the Sell Bitcoin marketplace page'}
                  {activeTab==='gift'&&'Listed on the Gift Cards marketplace page'}
                </p>
                <div className="relative w-full sm:w-40 flex-shrink-0">
                  <Search size={10} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{color:C.g400}}/>
                  <input value={search} onChange={e=>setSearch(e.target.value)}
                    placeholder="Search offers…"
                    className="w-full pl-7 pr-3 py-1.5 text-xs border rounded-lg focus:outline-none"
                    style={{borderColor:search?C.green:C.g200}}/>
                </div>
              </div>

              {/* Tab content */}
              <div className="p-2.5 sm:p-3">
                <TabPanel
                  listings={tabListings}
                  onEdit={setEditListing}
                  onDelete={deleteListing}
                  onToggle={toggleStatus}
                  onToggleAll={toggleAll}
                  search={search}
                  walletBtc={walletBtc}
                />
              </div>
            </div>

            {/* ── CREATE MORE CTA ── */}
            <div className="flex items-center justify-between p-3.5 rounded-xl border flex-wrap gap-2"
              style={{backgroundColor:`${C.green}06`,borderColor:`${C.green}20`}}>
              <div className="min-w-0">
                <p className="text-sm font-black" style={{color:C.forest}}>Want more trades?</p>
                <p className="text-xs" style={{color:C.g500}}>Create another offer to reach more buyers and sellers.</p>
              </div>
              <button onClick={()=>navigate('/create-offer')}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-white font-black text-xs hover:opacity-90 flex-shrink-0"
                style={{backgroundColor:C.green}}>
                <Plus size={13}/> New Offer <ArrowRight size={12}/>
              </button>
            </div>

            {/* ── TIPS ── */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {[
                {icon:<Lightbulb size={14} style={{color:C.gold}} />,title:'Competitive margin gets more trades',desc:'Offers within ±5% of market rate receive 3× more trade requests.'},
                {icon:<Zap size={14} style={{color:C.gold}} />,title:'Keep offers active',               desc:'Paused offers disappear from the marketplace. Activate to stay visible.'},
                {icon:<Link2 size={14} style={{color:C.gold}} />,title:'Share your offer link',             desc:'Send your offer link directly to buyers or sellers to skip the marketplace queue.'},
              ].map(({icon,title,desc})=>(
                <div key={title} className="flex items-start gap-2.5 p-3 rounded-xl border"
                  style={{backgroundColor:`${C.gold}06`,borderColor:`${C.gold}20`}}>
                  <span className="text-base flex-shrink-0 inline-flex items-center">{icon}</span>
                  <div>
                    <p className="text-xs font-black" style={{color:C.forest}}>{title}</p>
                    <p className="text-xs mt-0.5 leading-relaxed" style={{color:C.g500}}>{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* ── FOOTER ── */}
      <footer className="mt-8" style={{backgroundColor:C.forest}}>
        <div className="max-w-3xl mx-auto px-3 sm:px-4 pt-8 pb-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-6">
            <div>
              <span className="text-xl font-black" style={{fontFamily:"'Syne',sans-serif"}}>
                <span className="text-white">PRA</span><span style={{color:C.gold}}>QEN</span>
              </span>
              <p className="text-xs mt-2 leading-relaxed" style={{color:'rgba(255,255,255,0.4)'}}>
                The world's most trusted P2P Bitcoin platform. Escrow-protected. Fast. Honest.
              </p>
              <div className="flex gap-2 flex-wrap mt-3">
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
                    <svg viewBox="0 0 24 24" width="15" height="15" fill={color} aria-hidden="true"><path d={d}/></svg>
                  </a>
                ))}
              </div>
            </div>
            <div>
              <p className="text-white font-black text-sm mb-3">Trade</p>
              <div className="space-y-2">
                {[['Buy Bitcoin','/buy-bitcoin'],['Sell Bitcoin','/sell-bitcoin'],['Gift Cards','/gift-cards'],['My Trades','/my-trades'],['Create Offer','/create-offer'],['Blog','/blog'],['Privacy','/privacy'],['Terms','/terms']].map(([l,h])=>(
                  <a key={l} href={h} className="block text-xs hover:text-white transition" style={{color:'rgba(255,255,255,0.4)'}}>{l}</a>
                ))}
              </div>
            </div>
            <div>
              <p className="text-white font-black text-sm mb-3">Support</p>
              <div className="space-y-2">
                {[['Discord','https://discord.gg/V6zCZxfdy'],
                  ['hello@praqen.com','mailto:hello@praqen.com']].map(([l,h])=>(
                  <a key={l} href={h} target="_blank" rel="noopener noreferrer"
                    className="block text-xs hover:text-white transition" style={{color:'rgba(255,255,255,0.4)'}}>{l}</a>
                ))}
              </div>
            </div>
          </div>
          <div className="flex flex-col md:flex-row items-center justify-between gap-2 pt-4 border-t"
            style={{borderColor:'rgba(255,255,255,0.08)'}}>
            <p className="text-xs" style={{color:'rgba(255,255,255,0.3)'}}>
              © {new Date().getFullYear()} PRAQEN. All rights reserved.
            </p>
            <p className="text-xs flex items-center gap-1" style={{color:'rgba(255,255,255,0.3)'}}>
              <Shield size={10}/> Escrow Protected · 0.5% fee on completion only
            </p>
          </div>
        </div>
      </footer>

      {editListing && (
        <EditModal listing={editListing} onClose={()=>setEditListing(null)} onSave={saveEdit} saving={saving}
          walletBtc={walletBtc} btcPrice={btcPrice || 88000}/>
      )}
    </div>
  );
}
