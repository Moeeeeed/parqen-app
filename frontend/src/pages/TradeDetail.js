import React, { useState, useEffect, useRef } from 'react';
import { useRates } from '../contexts/RatesContext';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  Send, Star, Clock, CheckCircle, AlertCircle, Lock,
  MessageCircle, Bitcoin, Shield, AlertTriangle,
  X, RefreshCw, Info, Check, CheckCheck, Timer,
  Paperclip, Flag, BadgeCheck, FileText, Copy, Globe,
  ChevronDown, ChevronUp, DollarSign, CreditCard,
Smartphone, Building2, ThumbsUp, ThumbsDown, Gift, Repeat2, Heart,
  Bell, Camera, Mail, PartyPopper, Rocket, Unlock, Stamp,
  Plus, Image as ImageIcon, File as FileIcon,
} from 'lucide-react';
import { toast } from 'react-toastify';
import { copyToClipboard } from '../utils/clipboard';
import { deriveBadge } from '../lib/badge';
import CountryFlag, { resolveCode } from '../components/CountryFlag';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const C = {
  forest:'#1B4332', green:'#2D6A4F', mint:'#40916C', sage:'#52B788',
  gold:'#F4A422', amber:'#F59E0B', mist:'#F0FAF5', white:'#FFFFFF',
  g50:'#F8FAFC', g100:'#F1F5F9', g200:'#E2E8F0', g300:'#CBD5E1',
  g400:'#94A3B8', g500:'#64748B', g600:'#475569', g700:'#334155', g800:'#1E293B',
  success:'#10B981', danger:'#EF4444', paid:'#3B82F6', warn:'#F59E0B',
  online:'#22C55E', purple:'#8B5CF6',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmtBtc = (n,d=8) => parseFloat(n||0).toFixed(d);
const fmtUsd = (n)     => `$${parseFloat(n||0).toFixed(2)}`;
const fmt    = (n,d=0) => new Intl.NumberFormat('en-US',{minimumFractionDigits:0,maximumFractionDigits:d}).format(n||0);
const authH  = ()      => { const t=localStorage.getItem('token'); return t?{Authorization:`Bearer ${t}`}:{}; };

// USD_RATES is now provided by RatesContext — do NOT define a static object here
const CUR_SYM   = {GHS:'₵',NGN:'₦',KES:'KSh',ZAR:'R',UGX:'USh',USD:'$',GBP:'£',EUR:'€'};




const STATUS_CFG = {
  CREATED:     {label:'Escrow Active',  color:C.green,   bg:`${C.green}15`,  icon:Lock},
  FUNDS_LOCKED:{label:'Escrow Active',  color:C.green,   bg:`${C.green}15`,  icon:Lock},
  PAYMENT_SENT:{label:'Payment Sent',   color:C.paid,    bg:`${C.paid}15`,   icon:Clock},
  PAID:        {label:'Payment Sent',   color:C.paid,    bg:`${C.paid}15`,   icon:Clock},
  COMPLETED:   {label:'Completed',  color:C.success, bg:`${C.success}15`,icon:CheckCircle},
  CANCELLED:   {label:'Cancelled',      color:C.g500,    bg:`${C.g500}15`,   icon:X},
  DISPUTED:    {label:'Disputed',    color:'#7C3AED', bg:'#EDE9FE',       icon:AlertTriangle},
};
const getS = s=>STATUS_CFG[s?.toUpperCase()]||STATUS_CFG.CREATED;
const fmtAge=d=>{if(!d)return'—';const s=(Date.now()-new Date(d))/1000;if(s<300)return'Online';if(s<3600)return`${~~(s/60)}m ago`;if(s<86400)return`${~~(s/3600)}h ago`;return`${~~(s/86400)}d ago`;};

// ─── Avatar ───────────────────────────────────────────────────────────────────
function Avatar({user,size=40,radius='rounded-full'}) {
  const [err,setErr]=useState(false);
  if(user?.avatar_url&&!err) return(
    <img src={user.avatar_url.startsWith('/')?`${API_URL}${user.avatar_url}`:user.avatar_url}
      onError={()=>setErr(true)} alt={user.username}
      className={`object-cover flex-shrink-0 ${radius}`} style={{width:size,height:size}}/>
  );
  return(
    <div className={`flex-shrink-0 flex items-center justify-center font-black text-white ${radius}`}
      style={{width:size,height:size,backgroundColor:C.green,fontSize:size*0.38}}>
      {(user?.username||'?').charAt(0).toUpperCase()}
    </div>
  );
}

// ─── Feedback modal ───────────────────────────────────────────────────────────
function FeedbackModal({name,onClose,onSubmit,submitting}) {
  const [isPositive, setIsPositive] = useState(null);
  const [comment,    setComment]    = useState('');

  const rating = isPositive ? 5 : 1;
  const canSubmit = isPositive !== null;

  const placeholder = isPositive === null
    ? 'Select Positive or Negative first…'
    : isPositive
      ? 'What went well? Tell the community… (optional)'
      : 'What went wrong? Your feedback helps others… (optional)';

  return(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4"
      style={{backgroundColor:'rgba(0,0,0,0.65)',backdropFilter:'blur(4px)'}}>
      <div className="bg-white w-full sm:max-w-sm rounded-t-3xl sm:rounded-2xl overflow-hidden shadow-2xl animate-slideUp sm:animate-bounceIn max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="p-5 text-white text-center"
          style={{background:`linear-gradient(135deg,${C.forest},${C.mint})`}}>
          <h2 className="text-lg font-black">Rate Your Trade</h2>
          <p className="text-white/70 text-xs mt-1">How was trading with <span className="font-black text-white">{name}</span>?</p>
        </div>

        <div className="p-5 space-y-4">

          {/* Positive / Negative selector */}
          <div className="grid grid-cols-2 gap-3">
            <button onClick={()=>setIsPositive(true)}
              className={`flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all ${
                isPositive===true
                  ? 'bg-emerald-50 border-emerald-500 scale-[1.02] shadow-md'
                  : 'bg-white border-gray-100 hover:border-emerald-200 hover:bg-emerald-50/30'
              }`}>
              <div className={`w-11 h-11 rounded-full flex items-center justify-center transition ${
                isPositive===true ? 'bg-emerald-500 text-white' : 'bg-gray-100 text-gray-400'
              }`}>
                <ThumbsUp size={22} fill={isPositive===true?'currentColor':'none'}/>
              </div>
              <span className={`font-black text-xs uppercase tracking-wide ${
                isPositive===true ? 'text-emerald-700' : 'text-gray-400'
              }`}>Positive</span>
            </button>

            <button onClick={()=>setIsPositive(false)}
              className={`flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all ${
                isPositive===false
                  ? 'bg-rose-50 border-rose-500 scale-[1.02] shadow-md'
                  : 'bg-white border-gray-100 hover:border-rose-200 hover:bg-rose-50/30'
              }`}>
              <div className={`w-11 h-11 rounded-full flex items-center justify-center transition ${
                isPositive===false ? 'bg-rose-500 text-white' : 'bg-gray-100 text-gray-400'
              }`}>
                <ThumbsDown size={22} fill={isPositive===false?'currentColor':'none'}/>
              </div>
              <span className={`font-black text-xs uppercase tracking-wide ${
                isPositive===false ? 'text-rose-700' : 'text-gray-400'
              }`}>Negative</span>
            </button>
          </div>

          {/* Selected sentiment label */}
          {isPositive!==null&&(
            <p className="text-center text-xs font-bold"
              style={{color:isPositive?'#059669':'#EF4444'}}>
              {isPositive?'Great experience!':'Bad experience'}
            </p>
          )}

          {/* Comment textarea */}
          <textarea value={comment} onChange={e=>setComment(e.target.value)}
            placeholder={placeholder}
            rows={3}
            disabled={isPositive===null}
            className="w-full px-3 py-2.5 border-2 rounded-xl text-sm focus:outline-none resize-none transition disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              borderColor: isPositive===false ? '#FCA5A5' : isPositive===true ? '#6EE7B7' : C.g200,
            }}/>

          {/* Actions */}
          <div className="flex gap-2">
            <button onClick={onClose} className="flex-1 py-2.5 rounded-xl font-bold text-sm border"
              style={{borderColor:C.g200,color:C.g600}}>Skip</button>
            <button onClick={()=>onSubmit(rating,comment)} disabled={submitting||!canSubmit}
              className="flex-1 py-2.5 rounded-xl font-black text-sm disabled:opacity-40 transition"
              style={{
                backgroundColor: isPositive===false ? '#EF4444' : C.gold,
                color: isPositive===false ? '#fff' : C.forest,
              }}>
              {submitting?'Submitting…':'Submit Feedback'}
            </button>
          </div>
        </div>
      </div>
      <style>{`@keyframes bounceIn {0%{transform:scale(0.85) translateY(20px);opacity:0;}60%{transform:scale(1.03) translateY(-8px);opacity:1;}100%{transform:scale(1) translateY(0);opacity:1;}} .animate-bounceIn{animation:bounceIn 0.55s ease-out;} @keyframes slideUp{from{transform:translateY(100%);opacity:0;}to{transform:translateY(0);opacity:1;}} .animate-slideUp{animation:slideUp 0.3s ease-out;}`}</style>
    </div>
  );
}

// ─── Confirm action modal (Pay / Release) ────────────────────────────────────
function ConfirmActionModal({icon:Icon, iconBg, title, lines, confirmLabel, confirmBg, confirmColor='#fff', onClose, onConfirm, submitting}) {
  return(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4"
      style={{backgroundColor:'rgba(0,0,0,0.6)',backdropFilter:'blur(4px)'}}>
      <div className="w-full sm:max-w-[360px] max-h-[90vh] overflow-y-auto"
        style={{
          backgroundColor:'#fff',
          borderRadius:'20px 20px 0 0',
          overflow:'hidden',
          boxShadow:'0 25px 60px rgba(0,0,0,0.3)',
          animation:'slideUp .3s ease',
          boxSizing:'border-box',
        }}>
        {/* Icon + title */}
        <div style={{display:'flex',flexDirection:'column',alignItems:'center',padding:'24px 20px 16px'}}>
          <div style={{
            width:56,height:56,borderRadius:14,
            display:'flex',alignItems:'center',justifyContent:'center',
            backgroundColor:iconBg,marginBottom:12,
            boxShadow:'0 4px 14px rgba(0,0,0,0.15)',
          }}>
            <Icon size={26} style={{color:'#fff'}}/>
          </div>
          <p style={{fontWeight:900,fontSize:16,color:'#1E293B',margin:0,textAlign:'center'}}>{title}</p>
        </div>

        {/* Info lines */}
        <div style={{padding:'0 16px 16px',display:'flex',flexDirection:'column',gap:8}}>
          {lines.map((l,i)=>(
            <div key={i} style={{
              display:'flex',alignItems:'flex-start',gap:10,
              padding:'10px 12px',borderRadius:12,backgroundColor:'#F8FAFC',
              boxSizing:'border-box',
            }}>
              <span style={{fontSize:16,flexShrink:0,lineHeight:1.3}}>{l.icon}</span>
              <p style={{fontSize:12,color:'#334155',margin:0,lineHeight:1.5}}>{l.text}</p>
            </div>
          ))}
        </div>

        {/* Buttons */}
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,padding:'0 16px 20px',boxSizing:'border-box'}}>
          <button onClick={onClose} disabled={submitting}
            style={{
              padding:'13px 0',borderRadius:14,fontWeight:700,fontSize:13,
              border:'2px solid #E2E8F0',backgroundColor:'#fff',color:'#64748B',
              cursor:'pointer',
            }}>
            Go Back
          </button>
          <button onClick={onConfirm} disabled={submitting}
            style={{
              padding:'13px 0',borderRadius:14,fontWeight:900,fontSize:13,
              backgroundColor:confirmBg,color:confirmColor,border:'none',
              cursor:submitting?'not-allowed':'pointer',
              opacity:submitting?0.5:1,
              display:'flex',alignItems:'center',justifyContent:'center',gap:6,
            }}>
            {submitting?<><RefreshCw size={14} style={{animation:'spin 1s linear infinite'}}/>Processing…</>:confirmLabel}
          </button>
        </div>
      </div>
      <style>{`@keyframes slideUp{from{transform:translateY(100%);opacity:0;}to{transform:translateY(0);opacity:1;}} @keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

// ─── Cancel modal ─────────────────────────────────────────────────────────────
function CancelModal({onClose,onConfirm,submitting}) {
  const [reason,setReason]=useState('');
  return(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4"
      style={{backgroundColor:'rgba(0,0,0,0.6)',backdropFilter:'blur(4px)'}}>
      <div className="w-full sm:max-w-[360px] max-h-[90vh] overflow-y-auto"
        style={{
          backgroundColor:'#fff',
          borderRadius:'20px 20px 0 0',
          overflow:'hidden',
          boxShadow:'0 25px 60px rgba(0,0,0,0.3)',
          animation:'slideUp .3s ease',
        }}>
        {/* Header */}
        <div style={{padding:'20px 20px 16px',borderBottom:'1px solid #F1F5F9',display:'flex',alignItems:'center',gap:'12px'}}>
          <div style={{width:42,height:42,borderRadius:12,backgroundColor:'#FEE2E2',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
            <AlertTriangle size={20} style={{color:C.danger}}/>
          </div>
          <div>
            <p style={{fontWeight:900,fontSize:16,color:C.danger,margin:0}}>Cancel Trade?</p>
            <p style={{fontSize:12,color:'#B45309',margin:0,marginTop:2,fontWeight:700}}>Escrow BTC returns to the seller</p>
          </div>
        </div>

        {/* Body */}
        <div style={{padding:'16px 20px 20px'}}>
          <p style={{fontSize:12.5,color:'#1E293B',marginBottom:8,fontWeight:800}}>Reason for cancelling <span style={{color:C.danger}}>*</span></p>
          <textarea
            value={reason}
            onChange={e=>setReason(e.target.value)}
            placeholder="e.g. Payment method not working…"
            rows={3}
            style={{
              width:'100%',boxSizing:'border-box',
              padding:'10px 12px',fontSize:13,
              border:`2px solid ${reason.trim()?C.danger:C.g200}`,
              borderRadius:12,outline:'none',resize:'none',
              fontFamily:'inherit',color:'#1E293B',fontWeight:600,
            }}
          />
          <p style={{fontSize:11,color:C.g500,marginTop:6,fontWeight:600}}>
            This will be shown to the other party and logged on the trade.
          </p>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginTop:14}}>
            <button onClick={onClose} disabled={submitting}
              style={{
                padding:'12px 0',borderRadius:14,fontWeight:700,fontSize:13,
                border:`2px solid ${C.g200}`,backgroundColor:'#fff',color:C.g600,
                cursor:'pointer',
              }}>
              Go Back
            </button>
            <button onClick={()=>onConfirm(reason)} disabled={!reason.trim()||submitting}
              style={{
                padding:'12px 0',borderRadius:14,fontWeight:900,fontSize:13,
                backgroundColor:C.danger,color:'#fff',border:'none',
                cursor:reason.trim()&&!submitting?'pointer':'not-allowed',
                opacity:reason.trim()&&!submitting?1:0.45,
                display:'flex',alignItems:'center',justifyContent:'center',gap:6,
              }}>
              {submitting?<><RefreshCw size={13} style={{animation:'spin 1s linear infinite'}}/>Cancelling…</>:'Confirm Cancel'}
            </button>
          </div>
        </div>
      </div>
      <style>{`@keyframes slideUp{from{transform:translateY(100%);opacity:0;}to{transform:translateY(0);opacity:1;}} @keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

// ─── Image viewer ─────────────────────────────────────────────────────────────
function ImgModal({src,onClose}) {
  return(
    <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4" onClick={onClose}>
      <img src={src} alt="Proof" className="max-w-full max-h-screen object-contain rounded-xl"/>
      <button onClick={onClose} className="absolute top-4 right-4 bg-white rounded-full p-2 shadow-lg"><X size={20}/></button>
    </div>
  );
}

// ─── Dispute / report-to-moderator modal ─────────────────────────────────────
const DISPUTE_REASONS=[
  'Seller is not responding',
  'Payment sent but Bitcoin not released',
  'Wrong payment amount received',
  'Incorrect payment method used',
  'Suspected scam or fraud attempt',
  'Seller / buyer violated trade terms',
  'Other — describe below',
];
function DisputeModal({onClose,onSubmit,submitting}){
  const [selected,setSelected]=useState('');
  const [details,setDetails]=useState('');
  const isOther=selected==='Other — describe below';
  const canSubmit=selected&&(!isOther||details.trim().length>4);
  const fullReason=isOther?details.trim():(details.trim()?`${selected} — ${details.trim()}`:selected);
  return(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4"
      style={{backgroundColor:'rgba(0,0,0,0.65)',backdropFilter:'blur(4px)'}} onClick={onClose}>
      <div className="bg-white w-full sm:max-w-sm rounded-t-3xl sm:rounded-2xl overflow-hidden shadow-2xl max-h-[90vh] overflow-y-auto"
        style={{animation:'slideUp .3s ease'}} onClick={e=>e.stopPropagation()}>
        {/* Header */}
        <div className="px-5 pt-5 pb-4 flex items-start justify-between"
          style={{background:'linear-gradient(135deg,#FEF2F2,#FFF7F7)',borderBottom:'1px solid #FEE2E2'}}>
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <Flag size={15} style={{color:'#DC2626'}}/>
              <h3 className="font-black text-sm" style={{color:'#991B1B'}}>Report to Moderator</h3>
            </div>
            <p className="text-xs" style={{color:'#B91C1C'}}>A PRAQEN moderator will review your case within <strong>24 hours</strong>. All chats are logged.</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ml-3" style={{backgroundColor:'#FEE2E2'}}>
            <X size={13} style={{color:'#DC2626'}}/>
          </button>
        </div>
        {/* Reason list */}
        <div className="p-5 space-y-2">
          <p className="text-xs font-black mb-3" style={{color:'#334155'}}>What is the problem?</p>
          {DISPUTE_REASONS.map(r=>(
            <button key={r} onClick={()=>setSelected(r)}
              className="w-full text-left px-3.5 py-2.5 rounded-xl border text-xs font-semibold transition-all"
              style={{
                backgroundColor:selected===r?'#FEF2F2':'#FAFAFA',
                borderColor:selected===r?'#F87171':'#E2E8F0',
                color:selected===r?'#B91C1C':'#475569',
              }}>
              <span className="mr-2 text-sm">{selected===r?'◉':'○'}</span>{r}
            </button>
          ))}
        </div>
        {/* Details textarea */}
        {selected&&(
          <div className="px-5 pb-4">
            <p className="text-xs font-bold mb-2" style={{color:'#334155'}}>
              {isOther?'Describe what happened (required):':'Additional details for the moderator (optional):'}
            </p>
            <textarea value={details} onChange={e=>setDetails(e.target.value)}
              placeholder={isOther?'Please explain in detail what happened…':'Any extra context to help the moderator resolve faster…'}
              rows={3}
              className="w-full border rounded-xl px-3.5 py-2.5 text-xs resize-none outline-none"
              style={{borderColor:'#E2E8F0',color:'#334155'}}/>
          </div>
        )}
        {/* Action buttons */}
        <div className="px-5 pb-5 flex gap-3">
          <button onClick={onClose}
            className="flex-1 py-3 rounded-2xl border text-xs font-bold"
            style={{borderColor:'#E2E8F0',color:'#64748B'}}>
            Cancel
          </button>
          <button onClick={()=>canSubmit&&!submitting&&onSubmit(fullReason)}
            disabled={!canSubmit||submitting}
            className="flex-1 py-3 rounded-2xl text-xs font-black transition"
            style={{backgroundColor:canSubmit?'#DC2626':'#E2E8F0',color:canSubmit?'#fff':'#94A3B8'}}>
            {submitting?'Submitting…':'Submit Report'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── User profile popup ───────────────────────────────────────────────────────
function ProfilePopup({user, label, trade, onClose}) {
  const [tab,        setTab]        = useState('overview');
  const [reviews,    setReviews]    = useState([]);
  const [rvLoad,     setRvLoad]     = useState(false);
  const [freshUser,  setFreshUser]  = useState(null);

  // Fetch full profile (with verification flags) on open
  useEffect(() => {
    if (!user?.id) return;
    axios.get(`${API_URL}/users/${user.id}`)
      .then(r => { const d = r.data.user || r.data; if (d?.id) setFreshUser(d); })
      .catch(() => {});
  }, [user?.id]);

  // Load real reviews when feedback tab is opened
  useEffect(() => {
    if (tab !== 'feedback' || !user?.id || reviews.length) return;
    setRvLoad(true);
    axios.get(`${API_URL}/users/${user.id}/reviews`)
      .then(r => setReviews(r.data.reviews || []))
      .catch(() => {})
      .finally(() => setRvLoad(false));
  }, [tab, user?.id]);

  if (!user) return null;

  const u          = freshUser || user;
  const badge      = deriveBadge(u);
  const rating     = parseFloat(u.average_rating || 0);
  const trades     = parseInt(u.total_trades || 0);
  const pos        = parseInt(u.positive_feedback || 0);
  const neg        = parseInt(u.negative_feedback || 0);
  const total      = pos + neg;
  const trust      = total > 0 ? Math.round(pos / total * 100) : trades > 0 ? 100 : 0;
  const compRate   = parseFloat(u.completion_rate || 0);
  const phoneOk    = !!(u.is_phone_verified || u.phone_verified);
  const emailOk    = !!(u.is_email_verified || u.email_verified);
  const kycOk      = !!(u.is_id_verified || u.kyc_verified);
  const memberSince= u.created_at ? new Date(u.created_at).toLocaleDateString('en-US',{month:'short',year:'numeric'}) : '—';
  const avgReply   = u.avg_response_time || u.avg_reply_minutes;
  const payMins    = parseFloat(u.avg_payment_time || u.avg_response_time || 0);
  const avgPayDisplay = payMins > 0 ? (() => { const m=Math.floor(payMins),s=Math.round((payMins-m)*60); return s>0?`${m}m ${s}s`:m>0?`${m}m`:`${s}s`; })() : '—';
  const ccCode     = resolveCode(u.country || u.location);
  const locCC      = ccCode ? ccCode.toUpperCase() : '';
  const CC_NAME    = {GH:'Ghana',NG:'Nigeria',KE:'Kenya',ZA:'S. Africa',UG:'Uganda',TZ:'Tanzania',RW:'Rwanda',CM:'Cameroon',SN:'Senegal',CI:"Côte d'Ivoire",ZM:'Zambia',ZW:'Zimbabwe',ET:'Ethiopia',EG:'Egypt',MA:'Morocco',US:'USA',GB:'UK',DE:'Germany',FR:'France',IT:'Italy',ES:'Spain',VN:'Vietnam',TH:'Thailand',ID:'Indonesia',PH:'Philippines',MY:'Malaysia',SG:'Singapore',CN:'China',IN:'India',JP:'Japan',KR:'S. Korea',PK:'Pakistan',BD:'Bangladesh',SA:'Saudi Arabia',AE:'UAE',QA:'Qatar',BR:'Brazil',MX:'Mexico',CA:'Canada',AU:'Australia'};
  const countryName= (u.country && u.country.length > 2) ? u.country : (CC_NAME[locCC] || u.location || locCC || '—');
  const flagComponent = locCC ? (
    <CountryFlag countryCode={locCC} className="w-5 h-3.5 rounded-sm inline-block" />
  ) : (
    <Globe size={14} style={{color: 'rgba(255,255,255,0.4)'}}/>
  );

  // Last active
  const rawSeen    = fmtAge(u.last_seen_at || u.last_login || u.updated_at);
  const isOnline   = rawSeen === 'Online';

  const TABS = [
    { id:'overview',  label:'Profile' },
    { id:'feedback',  label:`Reviews (${total})` },
    { id:'rules',     label:'Rules' },
    { id:'trade',     label:'Trade' },
  ];

  // Trade tab helpers
  const listing   = trade?.listing || {};
  const tradeAmt  = trade?.amount_local || trade?.fiat_amount;
  const tradeBtc  = trade?.btc_amount || trade?.amount_btc;
  const tradeStatus = trade?.status || '—';
  const tradeOpened = trade?.created_at ? new Date(trade.created_at).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '—';
  const cur       = trade?.currency || listing?.currency || 'GHS';
  const sym       = listing?.currency_symbol || CUR_SYM[cur] || '₵';

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{backgroundColor:'rgba(0,0,0,0.6)', backdropFilter:'blur(6px)'}}
      onClick={e => e.target === e.currentTarget && onClose()}>

      <div className="bg-white w-full sm:max-w-sm rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col"
        style={{
          maxHeight:'92dvh',
          border:`1px solid ${C.g200}`,
          animation:'slideUp .28s cubic-bezier(0.34,1.56,0.64,1)',
        }}>
        <style>{`@keyframes slideUp{from{transform:translateY(40px);opacity:0}to{transform:translateY(0);opacity:1}}`}</style>

        {/* drag handle (mobile) */}
        <div className="flex justify-center pt-2.5 pb-1 flex-shrink-0 sm:hidden">
          <div className="w-10 h-1 rounded-full" style={{backgroundColor:C.g200}}/>
        </div>

        {/* ── HEADER ── */}
        <div className="relative px-4 pt-3 pb-4 flex-shrink-0"
          style={{background:`linear-gradient(135deg,${C.forest} 0%,${C.mint} 100%)`}}>
          <button onClick={onClose}
            className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center"
            style={{backgroundColor:'rgba(255,255,255,0.18)'}}>
            <X size={15} className="text-white"/>
          </button>

          <div className="flex items-center gap-3 mb-4">
            <div className="relative flex-shrink-0">
              <Avatar user={u} size={56} radius="rounded-2xl"/>
              <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-white"
                style={{backgroundColor: isOnline ? C.online : C.g400}}/>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                <span className="font-black text-white text-base leading-tight truncate">
                  {u.username || 'User'}
                </span>
                {kycOk && <BadgeCheck size={15} style={{color:'#93C5FD', flexShrink:0}}/>}
              </div>
              <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
                <span className="text-xs flex items-center">{flagComponent}</span>
                <span className="text-white/60 text-xs">{isOnline ? 'Active now' : rawSeen}</span>
              </div>
              <span className="inline-flex items-center gap-px px-2 py-0.5 rounded-full border text-xs font-black"
                style={{background:badge.bg, borderColor:badge.borderColor, boxShadow:badge.glow?`0 0 6px ${badge.glow}`:undefined}}>
                <span style={{color:badge.iconColor||badge.textColor}}>{badge.icon}</span>
                <span style={{color:badge.textColor}}>{badge.label}</span>
              </span>
            </div>
          </div>

          {/* ── STATS 2×2 GRID ── */}
          <div className="grid grid-cols-2 gap-2">
            <div className="flex items-center gap-2 rounded-xl px-3 py-2.5"
              style={{backgroundColor:'rgba(255,255,255,0.12)'}}>
              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{backgroundColor: isOnline ? '#4ADE80' : '#94A3B8'}}/>
              <div className="min-w-0">
                <p className="text-white font-black text-xs leading-tight truncate">
                  {isOnline ? 'Online now' : rawSeen}
                </p>
                <p className="text-white/50 text-xs leading-tight">Last active</p>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-xl px-3 py-2.5"
              style={{backgroundColor:'rgba(255,255,255,0.12)'}}>
              <span className="flex-shrink-0 flex items-center">{flagComponent}</span>
              <div className="min-w-0">
                <p className="text-white font-black text-xs leading-tight truncate">{countryName}</p>
                <p className="text-white/50 text-xs leading-tight">Location</p>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-xl px-3 py-2.5"
              style={{backgroundColor:'rgba(255,255,255,0.12)'}}>
              <Timer size={14} style={{color:'#FDE68A', flexShrink:0}}/>
              <div className="min-w-0">
                <p className="text-white font-black text-xs leading-tight">{avgPayDisplay}</p>
                <p className="text-white/50 text-xs leading-tight">Avg. response</p>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-xl px-3 py-2.5"
              style={{backgroundColor:'rgba(255,255,255,0.12)'}}>
              <Heart size={14} style={{color: pos > 0 ? '#86EFAC' : 'rgba(255,255,255,0.5)', flexShrink:0}}/>
              <div className="min-w-0">
                <p className="text-white font-black text-xs leading-tight">{pos > 0 ? `${fmt(pos)} users` : 'No ratings yet'}</p>
                <p className="text-white/50 text-xs leading-tight">Trusted by</p>
              </div>
            </div>
          </div>
        </div>

        {/* ── TABS ── */}
        <div className="flex border-b flex-shrink-0 overflow-x-auto" style={{borderColor:C.g200}}>
          {TABS.map(({id, label}) => (
            <button key={id} onClick={() => setTab(id)}
              className="flex-shrink-0 px-3 py-2.5 text-xs font-bold whitespace-nowrap transition"
              style={{
                color: tab===id ? C.green : C.g500,
                borderBottom: tab===id ? `2px solid ${C.green}` : '2px solid transparent',
                backgroundColor: tab===id ? `${C.green}08` : 'transparent',
              }}>
              {label}
            </button>
          ))}
        </div>

        {/* ── TAB CONTENT ── */}
        <div className="flex-1 overflow-y-auto p-4" style={{WebkitOverflowScrolling:'touch', minHeight:0}}>

          {/* OVERVIEW */}
          {tab==='overview' && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                {[
                  {label:'Trades',     value:fmt(trades),                sub:'completed'},
                  {label:'Rating',     value:`${rating.toFixed(1)}`,  sub:'of 5.0'},
                  {label:'Completion', value:`${compRate.toFixed(0)}%`,  sub:'rate'},
                ].map(({label:lbl,value,sub}) => (
                  <div key={lbl} className="rounded-xl p-3 text-center"
                    style={{backgroundColor:C.mist, border:`1px solid ${C.g200}`}}>
                    <p className="font-black text-sm" style={{color:C.forest}}>{value}</p>
                    <p className="text-xs font-semibold mt-0.5" style={{color:C.g500}}>{lbl}</p>
                    <p className="text-xs" style={{color:C.g400}}>{sub}</p>
                  </div>
                ))}
              </div>

              <div className="flex gap-2">
                <div className="flex-1 flex items-center gap-2 rounded-xl px-3 py-2.5"
                  style={{backgroundColor:'#F0FDF4', border:'1px solid #86EFAC'}}>
                  <ThumbsUp size={14} style={{color:'#16A34A', flexShrink:0}}/>
                  <div>
                    <p className="font-black text-sm" style={{color:'#16A34A'}}>{fmt(pos)}</p>
                    <p className="text-xs" style={{color:'#166534'}}>Positive</p>
                  </div>
                </div>
                <div className="flex-1 flex items-center gap-2 rounded-xl px-3 py-2.5"
                  style={{backgroundColor:'#FEF2F2', border:'1px solid #FCA5A5'}}>
                  <ThumbsDown size={14} style={{color:'#DC2626', flexShrink:0}}/>
                  <div>
                    <p className="font-black text-sm" style={{color:'#DC2626'}}>{fmt(neg)}</p>
                    <p className="text-xs" style={{color:'#991B1B'}}>Negative</p>
                  </div>
                </div>
              </div>

              {/* Verification badges */}
              <div className="rounded-xl overflow-hidden" style={{border:`1px solid ${C.g200}`}}>
                <p className="text-xs font-black px-3 py-2 uppercase tracking-wider"
                  style={{color:C.g500, backgroundColor:C.g50}}>Verification</p>
                {[
                  {label:'Phone Number', ok:phoneOk, icon:<Smartphone size={16} style={{flexShrink:0}}/>},
                  {label:'Email Address',ok:emailOk, icon:<Mail size={16} style={{flexShrink:0}}/>},
                  {label:'ID / KYC',     ok:kycOk,   icon:<BadgeCheck size={16} style={{flexShrink:0}}/>},
                ].map(({label:lbl,ok,icon}) => (
                  <div key={lbl} className="flex items-center justify-between px-3 py-2.5 border-t"
                    style={{borderColor:C.g100}}>
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{icon}</span>
                      <span className="text-xs font-semibold" style={{color:C.g700}}>{lbl}</span>
                    </div>
                    <span className="text-xs font-black px-2.5 py-1 rounded-full"
                      style={{
                        backgroundColor: ok ? '#F0FDF4' : '#FEF2F2',
                        color: ok ? '#16A34A' : '#DC2626',
                      }}>
                      {ok ? 'Verified' : 'Not verified'}
                    </span>
                  </div>
                ))}
              </div>

              {u.bio && (
                <div className="rounded-xl p-3" style={{backgroundColor:C.g50, border:`1px solid ${C.g200}`}}>
                  <p className="text-xs font-bold mb-1" style={{color:C.g500}}>About</p>
                  <p className="text-xs leading-relaxed" style={{color:C.g700}}>{u.bio}</p>
                </div>
              )}

              <div className="rounded-xl overflow-hidden" style={{border:`1px solid ${C.g200}`}}>
                {[
                  avgReply ? {label:'Avg. Response', value:`~${Math.round(avgReply)} min`} : null,
                  {label:'Trade Role',   value: label || 'Counterparty'},
                  {label:'Member since', value: memberSince},
                ].filter(Boolean).map(({label:lbl,value}) => (
                  <div key={lbl} className="flex items-center justify-between px-3 py-2.5 border-b last:border-0"
                    style={{borderColor:C.g100}}>
                    <span className="text-xs font-semibold" style={{color:C.g500}}>{lbl}</span>
                    <span className="text-xs font-black" style={{color:C.g800}}>{value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* REVIEWS */}
          {tab==='feedback' && (
            <div className="space-y-3">
              <div className="flex gap-2 p-3 rounded-xl"
                style={{backgroundColor:C.mist, border:`1px solid ${C.g200}`}}>
                <div className="text-center px-3">
                  <p className="text-2xl font-black" style={{color:C.forest}}>{rating.toFixed(1)}</p>
                  <p className="text-xs" style={{color:C.g400}}>Rating</p>
                </div>
                <div className="w-px" style={{backgroundColor:C.g200}}/>
                <div className="flex-1 flex items-center gap-3 px-2">
                  <div className="text-center flex-1">
                    <p className="font-black text-sm" style={{color:'#16A34A'}}>{fmt(pos)}</p>
                    <p className="text-xs" style={{color:C.g400}}>Positive</p>
                  </div>
                  <div className="text-center flex-1">
                    <p className="font-black text-sm" style={{color:'#DC2626'}}>{fmt(neg)}</p>
                    <p className="text-xs" style={{color:C.g400}}>Negative</p>
                  </div>
                  <div className="text-center flex-1">
                    <p className="font-black text-sm" style={{color:C.forest}}>{trust}%</p>
                    <p className="text-xs" style={{color:C.g400}}>Trust</p>
                  </div>
                </div>
              </div>

              {rvLoad ? (
                <div className="space-y-2">
                  {[1,2,3].map(i => (
                    <div key={i} className="rounded-xl p-3 border animate-pulse" style={{borderColor:C.g200}}>
                      <div className="flex gap-2 mb-2">
                        <div className="w-7 h-7 rounded-full" style={{backgroundColor:C.g200}}/>
                        <div className="flex-1 space-y-1.5">
                          <div className="h-2.5 rounded w-1/3" style={{backgroundColor:C.g200}}/>
                          <div className="h-2 rounded w-1/4" style={{backgroundColor:C.g100}}/>
                        </div>
                      </div>
                      <div className="h-2.5 rounded w-4/5" style={{backgroundColor:C.g100}}/>
                    </div>
                  ))}
                </div>
              ) : reviews.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-3xl mb-2">
                    <MessageCircle size={32} style={{color:C.g300}}/>
                  </p>
                  <p className="font-bold text-sm" style={{color:C.g700}}>No reviews yet</p>
                  <p className="text-xs mt-1" style={{color:C.g400}}>Complete trades to earn reviews</p>
                </div>
              ) : (
                reviews.slice(0,20).map((rv, i) => {
                  const isPos = rv.rating >= 4;
                  const ago = rv.created_at ? (() => {
                    const s = (Date.now()-new Date(rv.created_at))/1000;
                    if(s<3600) return `${~~(s/60)}m ago`;
                    if(s<86400) return `${~~(s/3600)}h ago`;
                    return `${~~(s/86400)}d ago`;
                  })() : '';
                  return (
                    <div key={i} className="rounded-xl border p-3"
                      style={{
                        borderColor: isPos ? '#86EFAC' : '#FCA5A5',
                        backgroundColor: isPos ? '#F0FDF4' : '#FEF2F2',
                      }}>
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-black text-white flex-shrink-0"
                            style={{backgroundColor: isPos ? '#16A34A' : '#DC2626'}}>
                            {isPos ? <ThumbsUp size={14} /> : <ThumbsDown size={14} />}
                          </div>
                          <span className="text-xs font-black" style={{color: isPos ? '#166534' : '#991B1B'}}>
                            {rv.reviewer?.username || 'Anonymous'}
                          </span>
                        </div>
                        <span className="text-xs" style={{color:C.g400}}>{ago}</span>
                      </div>
                      {rv.comment && (
                        <p className="text-xs leading-relaxed pl-8"
                          style={{color: isPos ? '#14532D' : '#7F1D1D'}}>
                          "{rv.comment}"
                        </p>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* RULES */}
          {tab==='rules' && (
            <div className="space-y-3">
              <div className="p-3.5 rounded-xl text-sm leading-relaxed whitespace-pre-wrap"
                style={{backgroundColor:C.mist, color:C.g700, border:`1px solid ${C.g200}`}}>
                {listing?.trade_instructions || listing?.listing_terms || listing?.description ||
                  'Send payment within the time limit and tap "I Have Paid". Share a screenshot of your payment if requested.'}
              </div>
              <div className="flex items-center gap-2.5 p-3 rounded-xl"
                style={{backgroundColor:'#FFFBEB', border:'1px solid #FDE68A'}}>
                <Timer size={14} style={{color:C.warn, flexShrink:0}}/>
                <p className="text-xs font-bold" style={{color:'#92400E'}}>
                  Time limit: {listing?.time_limit||30} minutes — trade auto-cancels if unpaid
                </p>
              </div>
              <div className="flex items-start gap-2.5 p-3 rounded-xl"
                style={{backgroundColor:'#FEF2F2', border:'1px solid #FCA5A5'}}>
                <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" style={{color:C.danger}}/>
                <p className="text-xs leading-relaxed" style={{color:'#991B1B'}}>
                  <strong>Never release BTC</strong> before confirming payment is received in your account. Escrow protects every trade.
                </p>
              </div>
            </div>
          )}

          {/* TRADE DETAILS */}
          {tab==='trade' && (
            <div className="rounded-xl overflow-hidden" style={{border:`1px solid ${C.g200}`}}>
              {[
                {label:'Trade ID',       value: trade?.id ? `#${String(trade.id).slice(0,8).toUpperCase()}` : '—'},
                {label:'Status',         value: tradeStatus},
                {label:'Payment Method', value: listing?.payment_method || trade?.payment_method || '—'},
                {label:'Fiat Amount',    value: tradeAmt ? `${sym}${fmt(tradeAmt)} ${cur}` : '—'},
                {label:'BTC Amount',     value: tradeBtc ? `${fmtBtc(tradeBtc,6)} BTC` : '—'},
                {label:'Time Limit',     value: `${listing?.time_limit || 30} minutes`},
                {label:'Opened',         value: tradeOpened},
                {label:'Your Role',      value: label || 'Counterparty'},
              ].map(({label:lbl,value}) => (
                <div key={lbl} className="flex items-center justify-between px-3.5 py-3 border-b last:border-0"
                  style={{borderColor:C.g100}}>
                  <span className="text-xs font-semibold" style={{color:C.g500}}>{lbl}</span>
                  <span className="text-xs font-black text-right ml-4" style={{color:C.g800, maxWidth:'60%'}}>{value}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── FOOTER ── */}
        <div className="p-4 flex-shrink-0 border-t" style={{borderColor:C.g200}}>
          <button onClick={onClose}
            className="w-full py-3 rounded-2xl border text-sm font-bold hover:bg-gray-50 transition"
            style={{borderColor:C.g200, color:C.g600}}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Offer terms accordion ────────────────────────────────────────────────────
function OfferTerms({trade}) {
  const [open,setOpen]=useState(false);
  const terms=trade?.trade_instructions||trade?.listing_terms||trade?.offer_terms||
    'Standard trade rules apply. Send payment within the time limit and click "I Have Paid". Include trade ID as reference.';
  return(
    <div className="bg-white rounded-2xl border overflow-hidden shadow-sm" style={{borderColor:C.g200}}>
      <button onClick={()=>setOpen(!open)}
        className="w-full flex items-center gap-2 p-3 text-left hover:bg-gray-50 transition">
        <FileText size={13} style={{color:C.green}}/>
        <span className="text-xs font-bold flex-1" style={{color:C.g700}}>Trade Instructions</span>
        {open?<ChevronUp size={12} style={{color:C.g400}}/>:<ChevronDown size={12} style={{color:C.g400}}/>}
      </button>
      {open&&(
        <div className="border-t px-3 pb-3 pt-2 text-xs leading-relaxed whitespace-pre-wrap"
          style={{borderColor:C.g100,color:C.g600}}>
          {terms}
        </div>
      )}
    </div>
  );
}

// ─── Main Trade Detail ────────────────────────────────────────────────────────
export default function TradeDetail({user}) {
  const {id}       = useParams();
  const navigate   = useNavigate();
  const { rates: USD_RATES, btcUsd: contextBtcUsd } = useRates();
  const msgEnd     = useRef(null);
  const chatRef    = useRef(null);
  const fileRef    = useRef(null);
  const cameraRef  = useRef(null);
  const docRef     = useRef(null);
  const attachMenuRef = useRef(null);
  const textareaRef = useRef(null);
  const scrolled        = useRef(false);
  const prevMsgCount    = useRef(0);
  const autoCancelled   = useRef(false);
  const typingTimer     = useRef(null);

  const [trade,     setTrade]     = useState(null);
  const [btcPrice,  setBtcPrice]  = useState(68000); // Default to standard market price during load
  const [seller,    setSeller]    = useState(null);
  const [buyer,     setBuyer]     = useState(null);
  const [messages,  setMessages]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [msg,       setMsg]       = useState('');
  const [sending,   setSending]   = useState(false);
  const [submitting,setSubmitting]= useState(false);
  const [uploading, setUploading] = useState(false);
  const [images,    setImages]    = useState([]);
  const [timeLeft,  setTimeLeft]  = useState(null);
  const [showCancel,     setShowCancel]     = useState(false);
  const [showPayConfirm, setShowPayConfirm] = useState(false);
  const [showRelConfirm, setShowRelConfirm] = useState(false);
  const [showFb,         setShowFb]         = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [tradeCompleted, setTradeCompleted] = useState(false);
  const [show2FA,        setShow2FA]        = useState(false);
  const [show2FAWarning, setShow2FAWarning] = useState(false);
  const [actionCode2FA,  setActionCode2FA]  = useState('');
  const [sending2FA,     setSending2FA]     = useState(false);
  const [imgSrc,    setImgSrc]    = useState(null);
  const [fbSub,     setFbSub]     = useState(false);
  const [profUser,  setProfUser]  = useState(null);
  const [profLabel, setProfLabel] = useState('');
  const [loadErr,   setLoadErr]   = useState(false);
  const [errMsg,    setErrMsg]    = useState('');
  const [paidAt,    setPaidAt]    = useState(null);

  const toastShown  = useRef(false);
  const [infoOpen,  setInfoOpen]  = useState(false);
  const [showDisputeModal,  setShowDisputeModal]  = useState(false);
  const [disputeSubmitting, setDisputeSubmitting] = useState(false);
  const [cpTyping,  setCpTyping]  = useState(false);
  const [activeTab, setActiveTab]  = useState('chat');
  const [showAttachMenu, setShowAttachMenu] = useState(false);

  const status = (trade?.status||'').toUpperCase();
  const isBuyer     = user&&trade&&String(user.id)===String(trade.buyer_id);
  const isSeller    = user&&trade&&String(user.id)===String(trade.seller_id);
  const isCompleted = status==='COMPLETED';
  const isCancelled = status==='CANCELLED';
  const isDisputed  = status==='DISPUTED';
  const isPaid      = ['PAYMENT_SENT','PAID'].includes(status);
  const isEscrow    = ['CREATED','FUNDS_LOCKED','ESCROW','ACTIVE','OPEN'].includes(status);

  useEffect(() => {
    if (contextBtcUsd > 0) setBtcPrice(contextBtcUsd);
  }, [contextBtcUsd]);

  // Lock document scroll on mobile so the body never scrolls — only the internal
  // message list scroll container moves. Replaced the broken position:sticky approach.
  useEffect(() => {
    document.documentElement.classList.add('trade-page');
    return () => document.documentElement.classList.remove('trade-page');
  }, []);

  // Close the attach popup on an outside click
  useEffect(() => {
    if (!showAttachMenu) return;
    const onClick = e => { if (attachMenuRef.current && !attachMenuRef.current.contains(e.target)) setShowAttachMenu(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [showAttachMenu]);

  const isActive    = !isCompleted&&!isCancelled;
  const cfg         = getS(status);
  const CfgIcon     = cfg.icon;
  const tradeAge    = trade?.created_at ? (()=>{
    const diff=Math.floor((Date.now()-new Date(trade.created_at))/1000);
    if(diff<3600)return`${Math.floor(diff/60)} min ago`;
    if(diff<86400)return`${Math.floor(diff/3600)}h ago`;
    return`${Math.floor(diff/86400)}d ago`;
  })() : '—';

  useEffect(()=>{
    if(!user){navigate('/login');return;}
    if(!id)return;
    loadAll();
    const sendHb=()=>axios.post(`${API_URL}/users/heartbeat`,{},{headers:authH()}).catch(()=>{});
    sendHb();
    const iv=setInterval(()=>{refreshTrade();loadMessages();},5000);
    const tv=setInterval(()=>{fetchTyping();},2000);
    const hb=setInterval(sendHb,30000);
    return()=>{clearInterval(iv);clearInterval(tv);clearInterval(hb);};
  },[id,user]);

  useEffect(()=>{
    // Freeze timer once buyer has marked payment — trade is locked until seller releases or dispute resolves.
    // Disputed trades are also frozen — only the moderator can give a final verdict.
    if(!trade?.created_at||!isActive||isDisputed||isPaid)return;
    // Parse timestamps as UTC — Supabase returns TIMESTAMP cols without 'Z', causing local-time misparse
    const toUTC = s => s ? new Date(/[Z+]/.test(s) ? s : s + 'Z') : null;
    // Use the stored expires_at (authoritative). Fallback to created_at + time_limit for old trades.
    const deadline = trade.expires_at
      ? toUTC(trade.expires_at).getTime()
      : toUTC(trade.created_at).getTime() + (Math.max(trade?.listing?.time_limit||0, trade?.time_limit||0, 30)) * 60 * 1000;
    // 5-minute grace period: after timer hits 0, buyer still has 300s to click "Mark Paid"
    // before the trade is auto-cancelled. Backend cron also uses the same grace buffer.
    const GRACE_SECS = 300;
    const iv=setInterval(()=>{
      const raw = Math.floor((deadline - Date.now()) / 1000);
      setTimeLeft(Math.max(0, raw));
      // Auto-cancel only fires after the full grace period AND only for unpaid+escrow trades
      if(raw < -GRACE_SECS && isEscrow && !isDisputed && !isPaid && !autoCancelled.current){
        autoCancelled.current = true;
        clearInterval(iv);
        autoCancel();
      }
    },1000);
    return()=>clearInterval(iv);
  },[trade?.expires_at,trade?.created_at,status,isPaid]);

  useEffect(()=>{
    const alreadyDone = trade?.user_gave_feedback || localStorage.getItem('fb_done_'+id);
    if(isCompleted && !alreadyDone && !tradeCompleted){
      const t=setTimeout(()=>setShowFb(true),1500);
      return()=>clearTimeout(t);
    }
  },[isCompleted, trade?.user_gave_feedback, tradeCompleted, id]);

  useEffect(()=>{
    if(messages.length===0)return;
    const isNewMsg=messages.length>prevMsgCount.current;
    prevMsgCount.current=messages.length;
    if(!isNewMsg||!scrolled.current)return;
    const el=chatRef.current;
    if(!el)return;
    const distFromBottom=el.scrollHeight-el.scrollTop-el.clientHeight;
    if(distFromBottom<150) el.scrollTop=el.scrollHeight;
  },[messages]);

  // ── Paid-at tracking ─────────────────────────────────────────────────────
  // Records when payment was actually made, used for the "paid" timestamp
  // shown in the system message. Uses the server's paid_at (survives page
  // refresh), then updated_at, then falls back to Date.now() (set by markPaid
  // on first click).
  useEffect(() => {
    if (isPaid) {
      if (!paidAt) {
        const ts = trade?.paid_at || trade?.updated_at;
        setPaidAt(ts ? new Date(ts).getTime() : Date.now());
      }
    } else {
      setPaidAt(null);
    }
  }, [isPaid, trade?.paid_at, trade?.updated_at]);

  const loadAll=async()=>{
    await Promise.all([loadTrade(), loadMessages(), loadImages()]);
  };

  const loadTrade=async()=>{
    if(!id)return;
    try{
      setLoadErr(false);
      const r=await axios.get(`${API_URL}/trades/${id}`,{headers:authH(),timeout:15000});
      const t=r.data.trade;
      setTrade(t);
      toastShown.current=false;
      if(t.seller) setSeller(t.seller);
      if(t.buyer)  setBuyer(t.buyer);
    }catch(e){
      const status = e.response?.status;
      console.error('[TradeDetail] loadTrade error — status:', status, 'msg:', e.message);
      if(status===401){navigate('/login');return;}
      // 503 or timeout → server is slow, auto-retry once after 3 seconds
      if(status===503 || !e.response){
        setTimeout(()=>{ setLoading(true); loadTrade(); }, 3000);
        toast.info('Server is busy — retrying…');
        return;
      }
      let msg='';
      if(status===404) msg='Trade not found';
      else if(status===403) msg='You do not have access to this trade';
      else msg='Failed to load trade — please try again';
      setErrMsg(msg);
      setLoadErr(true);
      if(!toastShown.current){ toastShown.current=true; toast.error(msg); }
    }finally{setLoading(false);}
  };

  const refreshTrade=async()=>{
    if(!id)return;
    try{
      const r=await axios.get(`${API_URL}/trades/${id}`,{headers:authH()});
      const t=r.data.trade;
      setTrade(t);
      if(t.seller) setSeller(t.seller);
      if(t.buyer)  setBuyer(t.buyer);
    }catch{}
  };

  const loadMessages=async()=>{
    if(!id)return;
    try{
      const r=await axios.get(`${API_URL}/messages/${id}`,{headers:authH()});
      const msgs=r.data.messages||[];
      setMessages(msgs);
      if(!scrolled.current&&msgs.length>0){
        scrolled.current=true;
        setTimeout(()=>{if(chatRef.current)chatRef.current.scrollTop=chatRef.current.scrollHeight;},100);
      }
    }catch{}
  };

  const loadImages=async()=>{
    if(!id)return;
    try{const r=await axios.get(`${API_URL}/trades/${id}/images`,{headers:authH()});setImages(r.data.images||[]);}catch{}
  };

  const fetchTyping=async()=>{
    if(!id)return;
    try{const r=await axios.get(`${API_URL}/trades/${id}/typing`,{headers:authH()});setCpTyping(!!r.data.isTyping);}catch{}
  };

  const sendTypingPing=()=>{
    if(!id)return;
    clearTimeout(typingTimer.current);
    axios.post(`${API_URL}/trades/${id}/typing`,{},{headers:authH()}).catch(()=>{});
    typingTimer.current=setTimeout(()=>{},3000);
  };

  const postSys=async(text)=>{
    try{await axios.post(`${API_URL}/messages`,{tradeId:id,message:text,isSystem:true},{headers:authH()});await loadMessages();}
    catch(e){console.error('[postSys] failed to post system message:',e?.response?.status,e?.response?.data||e?.message);}
  };

  const sendMessage=async(e)=>{
    e.preventDefault();
    if(!msg.trim())return;
    setSending(true);
    try{
      await axios.post(`${API_URL}/messages`,{tradeId:id,message:msg},{headers:authH()});
      setMsg('');await loadMessages();
      setTimeout(()=>{if(chatRef.current)chatRef.current.scrollTop=chatRef.current.scrollHeight;},100);
    }catch(error){const serverError=error?.response?.data?.error||error?.response?.data?.message;toast.error(serverError||'Send failed');}
    finally{setSending(false);}
  };

  const MAX_IMAGES_PER_SEND = 5;

  const uploadSingleImage=async(file)=>{
    const b64=await new Promise((res,rej)=>{const rd=new FileReader();rd.onload=()=>res(rd.result);rd.onerror=rej;rd.readAsDataURL(file);});
    await axios.post(`${API_URL}/trades/${id}/upload-image`,{image:b64,type:isBuyer?'payment':'giftcard'},{headers:authH()});
    // Send as a real chat message so both users see the image inline
    await axios.post(`${API_URL}/messages`,{tradeId:id,message:b64},{headers:authH()});
  };

  const uploadImage=async(fileList)=>{
    const files=Array.from(fileList||[]);
    if(files.length===0)return;

    if(files.length>MAX_IMAGES_PER_SEND){
      toast.error(`You can only send up to ${MAX_IMAGES_PER_SEND} images at a time.`);
      if(fileRef.current)fileRef.current.value='';
      return;
    }

    // Validate every file up front — images only, 5MB max each — before uploading any of them
    for(const f of files){
      if(!f.type.startsWith('image/')){
        toast.error('Only images can be sent here.');
        if(fileRef.current)fileRef.current.value='';
        return;
      }
      if(f.size>5*1024*1024){
        toast.error(`"${f.name}" is over 5MB — please choose a smaller image.`);
        if(fileRef.current)fileRef.current.value='';
        return;
      }
    }

    setUploading(true);
    let successCount=0;
    try{
      for(const f of files){
        try{
          await uploadSingleImage(f);
          successCount++;
        }catch{
          toast.error(`Failed to send "${f.name}"`);
        }
      }
      if(successCount>0){
        toast.success(successCount===1 ? 'Image sent!' : `${successCount} images sent!`);
        await loadImages();await loadMessages();
        setTimeout(()=>{if(chatRef.current)chatRef.current.scrollTop=chatRef.current.scrollHeight;},100);
      }
    }finally{
      setUploading(false);
      if(fileRef.current)fileRef.current.value='';
    }
  };

  const markPaid=async()=>{
    setShowPayConfirm(false);
    setSubmitting(true);
    // Block auto-cancel IMMEDIATELY — before the API round-trip completes.
    // The timer interval uses a stale closure; autoCancelled ref is always current.
    autoCancelled.current = true;
    try{
      await axios.post(`${API_URL}/trades/${id}/mark-paid`,{},{headers:authH()});
      setPaidAt(Date.now()); // Record the paid timestamp shown in the system message
      toast.success(isGiftCardTrade ? 'Code sent! Waiting for buyer to verify.' : 'Payment confirmed!');
      // Post this as a real system message in the chat (matches the "Trade
      // Complete"/"Trade Cancelled" system messages below) instead of only a
      // floating banner outside the message flow — the isPmt card renderer
      // in the message list picks this up from the "confirmed payment" text.
      await postSys(isGiftCardTrade
        ? 'Seller confirmed sending the gift card code. Buyer: please verify the code, then release Bitcoin.'
        : `Buyer confirmed payment via ${payMethod}. Seller: please check your account now.`);
      await loadTrade();
    }catch(e){
      // Only unblock auto-cancel if the trade hasn't actually been paid yet
      if(!['PAYMENT_SENT','PAID'].includes(trade?.status)) autoCancelled.current = false;
      toast.error(e?.response?.data?.error||'Failed');
    }
    finally{setSubmitting(false);}
  };

  const requestRelease=async()=>{
    setShowRelConfirm(false);
    setSending2FA(true);
    try{
      await axios.post(`${API_URL}/auth/send-action-code`,{action:'release_btc'},{headers:authH()});
      setActionCode2FA('');
      setShow2FA(true);
      toast.info('Security code sent to your email.');
    }catch(e){toast.error(e?.response?.data?.error||'Failed to send security code.');}
    finally{setSending2FA(false);}
  };

  const handleReleaseClick=()=>{
    if(!user?.two_factor_enabled){setShow2FAWarning(true);return;}
    setShowRelConfirm(true);
  };

  const releaseBtc=async()=>{
    if(!actionCode2FA||actionCode2FA.length!==6){toast.error('Enter the 6-digit code from your email.');return;}
    setShow2FA(false);
    setSubmitting(true);
    try{
      await axios.post(`${API_URL}/trades/${id}/release`,{actionCode:actionCode2FA},{headers:authH()});
      setActionCode2FA('');
      await postSys('TRADE COMPLETE! Bitcoin has been released to the buyer. Congratulations to both parties — always come back and trade safely on PRAQEN!');
      toast.success('Trade complete! Please leave feedback.');
      setTradeCompleted(true);
      setShowSuccessModal(true);
      await loadTrade();
    }catch(e){
      const msg=e?.response?.data?.error||'Failed';
      toast.error(msg);
      if(msg.toLowerCase().includes('code')||msg.toLowerCase().includes('security')){setShow2FA(true);}
    }
    finally{setSubmitting(false);}
  };

  const cancelTrade=async(reason)=>{
    setSubmitting(true);
    try{
      await axios.post(`${API_URL}/trades/${id}/cancel`,{reason},{headers:authH()});
      await postSys(`Trade cancelled. Reason: ${reason}. Escrow funds returned.`);
      toast.info('Cancelled');setShowCancel(false);await loadTrade();
    }catch(e){
      console.error('Cancel trade error:', e);
      toast.error(e?.response?.data?.error || 'Failed to cancel trade. Please try again.');
    }
    finally{setSubmitting(false);}
  };

  const autoCancel=async()=>{
    // Always fetch fresh trade state before auto-cancelling — interval closures are stale.
    // If the buyer marked paid (even a second ago), the API will block the cancel anyway,
    // but we skip the call entirely to avoid noisy 403 errors.
    try{
      const { data: fresh } = await axios.get(`${API_URL}/trades/${id}`,{headers:authH()});
      const freshStatus = (fresh?.trade?.status || fresh?.status || '').toUpperCase();
      if(['PAYMENT_SENT','PAID','COMPLETED','CANCELLED','DISPUTED'].includes(freshStatus)){
        console.log('[autoCancel] Skipped — live status is', freshStatus);
        return;
      }
    }catch(_){}
    try{
      await axios.post(`${API_URL}/trades/${id}/auto-cancel`,{reason:'Payment window expired'},{headers:authH()});
      await postSys('Payment window closed. Trade cancelled and Bitcoin returned to seller\'s wallet.');
      toast.warning('Time expired — Bitcoin returned to seller wallet');
      await loadTrade();
    }catch(e){console.error('Auto cancel error:',e);}
  };

  const openDispute=()=>setShowDisputeModal(true);

  const submitDispute=async(reason)=>{
    setDisputeSubmitting(true);
    try{
      await axios.post(`${API_URL}/trades/${id}/dispute`,{reason},{headers:authH()});
      toast.warning('Dispute reported. A moderator will review within 24 hours.');
      setShowDisputeModal(false);
      await loadTrade();
      await loadMessages();
    }catch{toast.error('Failed to submit report. Please try again.');}
    finally{setDisputeSubmitting(false);}
  };

  const dismissFeedbackModal=()=>{
    localStorage.setItem('fb_done_'+id,'1');
    setShowFb(false);
    setShowSuccessModal(false);
  };

  const submitFeedback=async(rating,comment)=>{
    setFbSub(true);
    try{
      await axios.post(`${API_URL}/trades/${id}/feedback`,{rating,comment,toUserId:isBuyer?trade.seller_id:trade.buyer_id},{headers:authH()});
      toast.success('Feedback submitted!');
      dismissFeedbackModal();
      await loadTrade();
    }catch(e){toast.error(e?.response?.data?.error||'Failed');}
    finally{setFbSub(false);}
  };

  const fmtTimer=s=>{
    if(s===null||s===undefined)return'--:--';
    if(s<=0)return'00:00';
    const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),sc=s%60;
    return h>0?`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sc).padStart(2,'0')}`
      :`${String(m).padStart(2,'0')}:${String(sc).padStart(2,'0')}`;
  };

  if(loading) return(
    <div className="min-h-screen flex items-center justify-center" style={{backgroundColor:C.mist}}>
      <div className="text-center space-y-3">
        <div className="w-12 h-12 rounded-full border-4 animate-spin mx-auto" style={{borderColor:C.sage,borderTopColor:'transparent'}}/>
        <p className="text-sm font-semibold" style={{color:C.green}}>Loading trade…</p>
      </div>
    </div>
  );

  if(loadErr||!trade) return(
    <div className="min-h-screen flex items-center justify-center" style={{backgroundColor:C.mist}}>
      <div className="text-center space-y-4 p-8 bg-white rounded-2xl shadow-lg max-w-md">
        <AlertCircle size={56} style={{color:C.danger}} className="mx-auto"/>
        <p className="font-black text-xl" style={{color:C.forest}}>{errMsg||'Trade not found'}</p>
        <p className="text-sm text-gray-500">
          {errMsg&&errMsg!=='Trade not found'
            ? errMsg
            : "This trade doesn't exist or you don't have access."}
        </p>
        <div className="flex gap-3 justify-center">
          <button onClick={()=>{toastShown.current=false;setLoadErr(false);setLoading(true);loadAll();}} className="px-6 py-2.5 rounded-xl font-bold text-sm border-2" style={{borderColor:C.green,color:C.green}}>
            Try Again
          </button>
          <button onClick={()=>navigate('/dashboard')} className="px-6 py-2.5 rounded-xl font-bold text-white text-sm" style={{backgroundColor:C.green}}>
            ← Dashboard
          </button>
        </div>
      </div>
    </div>
  );

  // ── REAL DATA CALCULATIONS ──────────────────────────────────────────────────
  const shortId    = (trade.id||'').slice(0,8).toUpperCase();
  const cur        = trade.local_currency || trade.currency || trade.listing?.currency || 'GHS';
  const sym        = CUR_SYM[cur] || trade.currency_symbol || trade.listing?.currency_symbol || '₵';

  // VERIFIED FORMULAS
  const userPays    = parseFloat(trade.amount_local || (parseFloat(trade.amount_usd || 0) * (USD_RATES[cur] || 1)) || 0);
  const margin      = parseFloat(trade.margin || trade.listing?.margin || 0);
  const btcReceived = parseFloat(trade.amount_btc || 0); // From database (already correct)

  // btcValueInLocal calculation: local amount / (1 + margin%) = Market value of the received BTC
  const btcValueInLocal = margin !== 0 ? userPays / (1 + margin / 100) : userPays;

  // Back-calculate Gross BTC and Fee for the expandable breakdown
  const FEE_RATE     = 0.005;
  const btcGross     = btcReceived / (1 - FEE_RATE);
  const feeBtc       = btcGross - btcReceived;

  // Rate locked at trade creation
  const sellerRate   = parseFloat(trade.seller_rate_local || trade.seller_rate || (btcGross > 0 ? userPays / btcGross : 0));

  const localAmt     = userPays; // map for legacy button logic
  const usdRate      = (USD_RATES && USD_RATES[cur]) ? USD_RATES[cur] : 0;
  const timeLimit    = trade?.listing?.time_limit || trade?.time_limit || 30;
  const urgent       = timeLeft !== null && timeLeft < 300 && timeLeft > 0;
  const payMethod    = trade.payment_method || 'Mobile Money';

  // Counterparty
  const cp         = isBuyer?seller:buyer;
  const cpBadge    = deriveBadge(cp);
  const cpSeen     = fmtAge(cp?.last_seen_at || cp?.last_login || cp?.updated_at);
  const cpOnline   = cpSeen==='Online';
  const cpIsOnline = cp?.is_online === true;
  const cpLastSeenVal = cp?.last_seen_at || cp?.last_login || cp?.updated_at;
  const cpLastSeenSecs = cpLastSeenVal ? (Date.now() - new Date(cpLastSeenVal)) / 1000 : Infinity;
  const cpIsAway   = !cpIsOnline && cpLastSeenSecs <= 1800;
  const cpPos      = parseInt(cp?.positive_feedback||0);
  const cpNeg      = parseInt(cp?.negative_feedback||0);
  const cpFeedbackPct = (cpPos+cpNeg)>0 ? ((cpPos/(cpPos+cpNeg))*100).toFixed(1) : (parseFloat(cp?.completion_rate||100).toFixed(1));

  // Gift card trade: card SELLER marks "sent code", BTC BUYER releases after confirming
  // BTC trade:       BTC BUYER marks "sent payment", BTC SELLER releases after confirming
  //
  // IMPORTANT: gift_card_brand = 'Bitcoin' means it is a BTC trade, NOT a gift card trade.
  // Only trust the listing_type from the Supabase join. The gift_card_brand field alone
  // is unreliable because some Bitcoin listings have gift_card_brand = 'Bitcoin'.
  const gcBrand = (trade?.gift_card_brand || '').toLowerCase().trim();
  const BTCBrands = ['bitcoin', 'btc', 'sell bitcoin', 'buy bitcoin', ''];
  const isGiftCardTrade = !!(
    (gcBrand && !BTCBrands.includes(gcBrand)) ||
    trade?.listing?.listing_type?.includes('GIFT_CARD')
  );
  const isSellFlow = isSeller && !isGiftCardTrade;
  const T = isSellFlow ? {
    primary: '#D97706', dark: '#B45309',
    grad: 'linear-gradient(135deg, #D97706, #F59E0B)',
  } : {
    primary: C.forest, dark: C.green,
    grad: `linear-gradient(135deg, ${C.forest}, ${C.green})`,
  };

  const showMarkPaid  = isGiftCardTrade ? (isSeller&&isEscrow&&isActive) : (isBuyer&&isEscrow&&isActive);
  const showRelease   = isGiftCardTrade ? (isBuyer&&isPaid&&isActive)    : (isSeller&&isPaid&&isActive);
  // Either side can open a dispute at any point during an active trade — not
  // just after payment is marked sent. The backend places no status gate on
  // /api/trades/:id/dispute either, so this just lets users reach a moderator
  // as soon as something feels wrong instead of waiting on the other party.
  const showDispute   = isActive&&!isDisputed&&(isBuyer||isSeller);

  // ── Cancel eligibility ────────────────────────────────────────────────────
  // Mirrors the backend rule in POST /api/trades/:id/cancel exactly:
  // - While DISPUTED: ONLY the person who opened the dispute can cancel it — the
  //   other side can't cancel their way out of a dispute filed against them, and
  //   legacy disputes with no recorded opener can't be self-cancelled by anyone.
  // - Otherwise (not yet disputed): only the BUYER can cancel. Sellers hold the
  //   escrowed BTC — letting them cancel on demand would let a dishonest seller
  //   pocket a payment and still reclaim the BTC, or strong-arm the buyer. A
  //   seller who wants out must open a dispute instead.
  const showCancelBtn = isActive && (isBuyer || isSeller) && (
    isDisputed
      ? !!trade?.disputed_by && String(trade.disputed_by) === String(user?.id)
      : isBuyer
  );

  // Read receipts: timestamp of the last message the counterparty sent
  const lastCpMsgTime = messages
    .filter(m=>m.sender_id&&String(m.sender_id)!==String(user?.id))
    .reduce((max,m)=>Math.max(max,new Date(m.created_at).getTime()),0);

  return(
    <div className="max-h-screen flex flex-col overflow-hidden trade-mobile-root" style={{backgroundColor:C.g50,fontFamily:"'DM Sans',sans-serif"}}>

      {/* ── MAIN CONTENT ─────────────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto w-full px-3 py-3 pb-4 flex-1 min-h-0 flex flex-col overflow-hidden">

        <div className="flex flex-col gap-3 lg:h-[calc(100vh-64px)] md:h-[calc(100vh-64px)] flex-1 min-h-0 max-w-3xl md:max-w-5xl lg:max-w-6xl mx-auto w-full">
          <div className="flex-1 min-w-0 min-h-0 md:flex md:flex-row md:gap-3 overflow-clip">

            {/* ── ACTIONS PANEL (desktop: fixed-width left column; mobile: tab-controlled) ── */}
            <div className={`w-full h-full overflow-y-auto pb-4 ${
              activeTab === 'actions' ? 'block' : 'hidden'
            } md:block md:w-80 md:flex-shrink-0 md:overflow-y-auto md:h-full md:pb-0`}>
              <div className="space-y-3 pr-1">

            {/* ── TRADE PROGRESS ───────────────────────────────────────── */}
            <div className="bg-white rounded-2xl border shadow-sm p-4" style={{borderColor:C.g200}}>
              <p className="text-xs font-black uppercase tracking-wider mb-3 flex items-center gap-1" style={{color:C.g400}}><FileText size={13}/> Trade Progress</p>
              <div className="space-y-2.5">
                {(isGiftCardTrade ? [
                  {label:'Trade opened — Alice\'s BTC locked in escrow',  done:true},
                  {label:'Card seller sends gift card code to buyer',      done:isPaid||isCompleted},
                  {label:'Buyer verifies the code is valid',              done:isCompleted},
                  {label:'Buyer releases BTC to card seller (0.5% fee)',  done:isCompleted},
                ] : [
                  {label:'Trade opened — BTC locked in escrow',           done:true},
                  {label:`Buyer sends payment via ${payMethod}`,          done:isPaid||isCompleted},
                  {label:'Seller confirms payment received',              done:isPaid||isCompleted},
                  {label:'Bitcoin released to buyer (0.5% fee deducted)', done:isCompleted},
                ]).map(({label,done},i)=>(
                  <div key={i} className="flex items-center gap-2.5">
                    <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{backgroundColor:done?C.green:C.g200}}>
                      {done?<Check size={11} className="text-white"/>
                        :<div className="w-1.5 h-1.5 rounded-full" style={{backgroundColor:C.g400}}/>}
                    </div>
                    <span className="text-xs leading-tight"
                      style={{color:done?C.g700:C.g400,fontWeight:done?600:400}}>{label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* ── ACTION BUTTONS ───────────────────────────────────────── */}
            <div className="space-y-2">

              {/* ── WHAT TO DO NEXT — instruction banner ─────────────── */}
              {isActive&&isEscrow&&(
                <div className="p-3 rounded-xl text-xs font-semibold border"
                  style={{backgroundColor:'#FFFBEB',borderColor:'#FDE68A',color:'#92400E'}}>
                  {isGiftCardTrade
                    ? isSeller
                      ? <><Gift size={14} style={{flexShrink:0}}/> Your turn: Send your gift card code to the buyer in the chat, then click "I SENT THE CODE".</>
                      : <><Clock size={14} style={{flexShrink:0}}/> Waiting for the card seller to send you the gift card code&hellip;</>
                    : isBuyer
                      ? <><CreditCard size={14} style={{flexShrink:0}}/> Your turn: Send {payMethod} payment now, then click "I HAVE PAID" to notify the seller.</>
                      : <><Clock size={14} style={{flexShrink:0}}/> Waiting for the buyer to send payment&hellip;</>}
                </div>
              )}
              {isActive&&isPaid&&isGiftCardTrade&&(
                <div className="p-3 rounded-xl text-xs font-semibold border"
                  style={{backgroundColor:'#F0FDF4',borderColor:'#86EFAC',color:'#166534'}}>
                  {isBuyer
                    ? <><CheckCircle size={14} style={{flexShrink:0}}/> Code received! Test it — if it works, click RELEASE BITCOIN to pay the seller.</>
                    : <><Clock size={14} style={{flexShrink:0}}/> Buyer is verifying your gift card code. Bitcoin releases once they confirm.</>}
                </div>
              )}

              {/* ── MARK PAID / SENT CODE button ── */}
              {showMarkPaid&&(
                <button onClick={()=>setShowPayConfirm(true)} disabled={submitting}
                  className="w-full py-4 rounded-xl font-black text-base shadow-lg flex items-center justify-center gap-2 transition disabled:opacity-50 disabled:cursor-not-allowed bg-[#2D6A4F] text-white hover:bg-[#D1FAE5] hover:text-[#2D6A4F] hover:border-[#2D6A4F]"
                  style={{border:'2px solid transparent'}}>
                  {submitting
                    ?<><RefreshCw size={16} className="animate-spin"/>Processing…</>
                    :isGiftCardTrade
                      ?<><Check size={18}/><Gift size={16} style={{marginLeft:2}}/> I SENT THE CODE</>
                      :<><Check size={18}/> I HAVE PAID</>}
                </button>
              )}

              {/* ── RELEASE BITCOIN button ── */}
              {showRelease&&(
                <button onClick={handleReleaseClick} disabled={submitting}
                  className="flex w-full py-4 rounded-xl text-white font-black text-base shadow-lg hover:opacity-90 disabled:opacity-50 items-center justify-center gap-2 transition"
                  style={{backgroundColor:C.green}}>
                  {submitting
                    ?<><RefreshCw size={16} className="animate-spin"/>Processing…</>
                    :<><Bitcoin size={18}/><Unlock size={16} style={{marginLeft:2}}/> RELEASE BITCOIN</>}
                </button>
              )}
              {showDispute&&(
                <button onClick={openDispute}
                  className="w-full py-2 rounded-lg font-semibold text-xs shadow-sm flex items-center justify-center gap-1.5 transition hover:opacity-90"
                  style={{
                    backgroundColor: '#9333EA',
                    color: '#fff',
                    cursor: 'pointer',
                  }}>
                  <Flag size={12}/>
                  Open Dispute
                </button>
              )}
              {showCancelBtn && !isPaid && (
                <button onClick={()=>setShowCancel(true)}
                  className="w-full py-2 rounded-xl font-semibold text-xs border hover:bg-gray-50 transition"
                  style={{borderColor:C.g200,color:C.g500}}>
                  Cancel Trade
                </button>
              )}
              {isCompleted&&(
                <div className="py-4 px-5 rounded-xl text-center text-white shadow"
                  style={{background:`linear-gradient(135deg,${C.forest},${C.mint})`}}>
                  <CheckCircle size={24} className="mx-auto mb-1"/>
                  <p className="font-black text-sm">Trade Complete</p>
                  <p className="text-xs text-white/60 mt-0.5">0.5% fee auto-collected by escrow</p>
                  {!trade?.user_gave_feedback&&!localStorage.getItem('fb_done_'+id)&&(
                    <button onClick={()=>setShowFb(true)} className="mt-2 text-xs underline text-white/80">
                      Leave feedback →
                    </button>
                  )}
                </div>
              )}
              {isCancelled&&(
                <div className="py-3 px-5 rounded-xl text-center border" style={{backgroundColor:C.g100,borderColor:C.g200}}>
                  <X size={20} className="mx-auto mb-1" style={{color:C.g500}}/>
                  <p className="font-bold text-sm" style={{color:C.g700}}>Trade Cancelled</p>
                  <p className="text-xs mt-0.5 mb-3" style={{color:C.g400}}>Escrow funds returned</p>
                  <div className="flex gap-2 justify-center flex-wrap">
                    <button onClick={()=>navigate(isSeller?'/sell-bitcoin':'/buy-bitcoin')}
                      className="px-3 py-1.5 rounded-lg font-black text-xs text-white hover:opacity-90 transition"
                      style={{backgroundColor:C.green}}>
                      <><Rocket size={14} style={{display:'inline'}}/> Start New Trade</>
                    </button>
                    <button onClick={()=>navigate('/buy-bitcoin')}
                      className="px-3 py-1.5 rounded-lg font-black text-xs border bg-white hover:bg-gray-50 transition"
                      style={{borderColor:C.g200,color:C.g700}}>
                      Marketplace →
                    </button>
                  </div>
                </div>
              )}
              {isDisputed&&(
                <div className="py-3 px-5 rounded-xl text-center text-white"
                  style={{background:'linear-gradient(135deg,#4C1D95,#7C3AED)'}}>
                  <Shield size={20} className="mx-auto mb-1"/>
                  <p className="font-bold text-sm">Dispute Under Review</p>
                  <p className="text-xs text-white/70 mt-0.5">PRAQEN Moderator reviewing within 24h</p>
                </div>
              )}
            </div>

            {/* Trade instructions accordion */}
            <OfferTerms trade={trade}/>

            {/* ── TRADE INFO + ACTIONS — single collapsible ─────────── */}
            {(()=>{

              return(
                <div className="bg-white rounded-2xl border shadow-sm overflow-hidden" style={{borderColor:C.g200}}>
                  {/* Accordion header */}
                  <button onClick={()=>setInfoOpen(!infoOpen)}
                    className="w-full flex items-center gap-2 px-4 py-3 hover:bg-gray-50 transition"
                    style={{borderBottom:infoOpen?`1px solid ${C.g100}`:'none'}}>
                    <Info size={13} style={{color:C.green}}/>
                    <span className="text-xs font-black flex-1 text-left" style={{color:C.forest}}>
                      Trade Info & Actions
                    </span>
                    <span className="text-xs font-mono mr-1" style={{color:C.g400}}>#{shortId}</span>
                    {infoOpen?<ChevronUp size={13} style={{color:C.g400}}/>:<ChevronDown size={13} style={{color:C.g400}}/>}
                  </button>

                  {infoOpen&&(
                    <div className="p-3 space-y-1">
                      {/* Info rows */}
                      {[
                        {label:'Trade ID',    val:<div className="flex items-center gap-1.5"><span className="font-mono font-bold text-xs" style={{color:C.forest}}>#{shortId}</span><button onClick={()=>{copyToClipboard(trade.id||'', 'Copied!');}} className="w-5 h-5 rounded flex items-center justify-center hover:bg-gray-100"><Copy size={10} style={{color:C.g400}}/></button></div>},
                        {label:'Offer',       val:<div className="flex items-center gap-1.5"><span className="font-mono font-bold text-xs" style={{color:C.g700}}>#{String(trade.listing_id||'').slice(0,8).toUpperCase()}</span><button onClick={()=>{copyToClipboard(trade.listing_id||'', 'Copied!');}} className="w-5 h-5 rounded flex items-center justify-center hover:bg-gray-100"><Copy size={10} style={{color:C.g400}}/></button></div>},
                        {label:'Started',     val:<span className="font-bold text-xs" style={{color:C.g700}}>{tradeAge}</span>},
                        {label:'Rate',        val:<span className="font-black text-xs" style={{color:C.forest}}>{sym}{fmt(sellerRate)} {cur}/BTC</span>},
                        {label:'Payment',     val:<span className="font-bold text-xs" style={{color:C.g700}}>{payMethod}</span>},
                        {label:'Status',      val:<span className="font-black text-xs px-2 py-0.5 rounded-full" style={{backgroundColor:cfg.bg,color:cfg.color}}>{cfg.label}</span>},
                      ].map(({label,val})=>(
                        <div key={label} className="flex items-center justify-between py-1.5 border-b last:border-0 text-xs"
                          style={{borderColor:C.g50}}>
                          <span style={{color:C.g400}}>{label}</span>
                          {val}
                        </div>
                      ))}

                      {/* Actions */}
                      <div className="pt-2 space-y-1.5">
                        <p className="text-xs font-black uppercase tracking-widest" style={{color:C.g400}}>Actions</p>

                        <button onClick={()=>{copyToClipboard(trade.id||'', 'Trade ID copied!');}}
                          className="w-full flex items-center gap-2 p-2.5 rounded-xl hover:bg-gray-50 transition text-left border"
                          style={{borderColor:C.g100}}>
                          <Copy size={12} style={{color:C.paid}}/>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-black" style={{color:C.g700}}>Copy Trade ID</p>
                            <p className="text-xs font-mono truncate" style={{color:C.g400}}>{(trade.id||'').slice(0,20)}…</p>
                          </div>
                        </button>

                        <button
                          onClick={()=>{
                            const reason=window.prompt('Describe the problem:');
                            if(!reason?.trim())return;
                            const sub=encodeURIComponent(`Trade Report: #${shortId}`);
                            const body=encodeURIComponent(`Trade ID: ${trade.id}\nOffer: ${trade.listing_id||'—'}\nProblem: ${reason}\nUser: ${user?.username||'—'}`);
                            window.open(`mailto:hello@praqen.com?subject=${sub}&body=${body}`,'_blank');
                            toast.info('Email opened to report trade');
                          }}
                          className="w-full flex items-center gap-2 p-2.5 rounded-xl hover:bg-red-50 transition text-left border"
                          style={{borderColor:C.g100}}>
                          <Flag size={12} style={{color:C.danger}}/>
                          <p className="text-xs font-black" style={{color:C.danger}}>Report a Problem</p>
                        </button>

                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Escrow info */}
            <div className="bg-white rounded-2xl border p-4 space-y-1.5" style={{borderColor:C.g200}}>
              <div className="flex items-center gap-2 mb-2">
                <Shield size={13} style={{color:C.green}}/>
                <span className="text-xs font-black" style={{color:C.forest}}>Escrow Protection</span>
              </div>
              {[
                <><Lock size={12} style={{flexShrink:0}}/> BTC locked in escrow when trade opens</>,
                <><DollarSign size={12} style={{flexShrink:0}}/> Buyer pays via agreed payment method</>,
                <><CheckCircle size={12} style={{flexShrink:0}}/> Seller confirms → releases BTC to buyer</>,
                <><DollarSign size={12} style={{flexShrink:0}}/> 0.5% fee auto-deducted to PRAQEN wallet</>,
                <><AlertTriangle size={12} style={{flexShrink:0}}/> Open dispute if problem — resolved in 24h</>,
              ].map((t,i)=><p key={i} className="text-xs flex items-center gap-1.5" style={{color:C.g600}}>{t}</p>)}

              {/* Trade Reference */}
              {(trade?.trade_ref) && (
                <div className="mt-3 pt-3 border-t" style={{borderColor:C.g100}}>
                  <p className="text-xs font-semibold mb-1" style={{color:C.g500}}>Trade Reference</p>
                  <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2" style={{border:`1.5px solid ${C.g200}`}}>
                    <span className="font-mono font-black text-sm flex-1" style={{color:C.forest, letterSpacing:'0.05em'}}>
                      {trade.trade_ref}
                    </span>
                    <button
                      onClick={()=>{copyToClipboard(trade.trade_ref, 'Reference copied!');}}
                      className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center hover:bg-gray-200 transition"
                      title="Copy reference">
                      <Copy size={12} style={{color:C.g500}}/>
                    </button>
                  </div>
                  <p className="text-xs mt-1" style={{color:C.g400}}>Share this ID with support if you have issues</p>
                </div>
              )}
            </div>

              </div>
            </div>

            {/* ── CHAT COLUMN (desktop: right column, flex-fill; mobile: tab-controlled) ── */}
            <div className={`w-full h-full flex-col ${
              activeTab === 'chat' ? 'flex' : 'hidden'
            } md:flex md:flex-1 md:h-full md:min-w-0 md:overflow-hidden`}>
            <div className="bg-white rounded-2xl border shadow-sm overflow-clip flex flex-col min-h-0 flex-1"
              style={{borderColor:C.g200}}>

            {/* ── Partner Header ── */}
              <div className="flex-shrink-0 px-4 py-3 border-b" style={{borderColor:C.g100}}>
                <div className="flex items-center justify-between mb-2">
                 <button
  onClick={()=>{setProfUser(cp);setProfLabel(isBuyer?'Seller':'Buyer');}}
  className="flex items-center gap-2.5 hover:opacity-80 active:opacity-60 transition">
  <div className="relative flex-shrink-0">
    <Avatar user={cp} size={44} />
    {((cp?.is_online ?? true) || cpIsAway) && (
      <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white"
        style={{backgroundColor: (cp?.is_online ?? true) ? '#22C55E' : '#F59E0B'}} />
    )}
    {(cp?.country || cp?.location) && (
      <span className="absolute -bottom-0.5 -left-0.5 rounded-sm border-2 border-white overflow-hidden flex-shrink-0" style={{lineHeight:0}}>
        <CountryFlag countryCode={cp.country || cp.location} className="w-4 h-3 block" />
      </span>
    )}
  </div>
  <span className="font-black text-base" style={{color:C.g800}}>{cp?.username || 'User'}</span>
  {!(cp?.country || cp?.location) && <Globe size={14} style={{color:C.g400}}/>}
</button>
                  {/* TODO: Confirm positive_feedback/negative_feedback are returned on cp object from /trades/:id — if not, the ?? 0 fallback hides the gap */}
                  <div className="flex items-center gap-2">
                    <span className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-sm font-black" style={{background:'#DCFCE7',color:'#166534'}}>
                      <ThumbsUp size={13}/> {cp?.positive_feedback ?? cp?.thumbs_up ?? 0}
                    </span>
                    <span className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-sm font-black" style={{background:'#FEE2E2',color:'#991B1B'}}>
                      <ThumbsDown size={13}/> {cp?.negative_feedback ?? cp?.thumbs_down ?? 0}
                    </span>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-sm font-semibold"
                    style={{color: isCompleted ? '#16A34A' : isPaid ? '#16A34A' : (cp?.is_online ?? true) ? '#22C55E' : C.g400}}>
                    <span className="w-2.5 h-2.5 rounded-full"
                      style={{background: isCompleted ? '#16A34A' : isPaid ? '#16A34A' : (cp?.is_online ?? true) ? '#22C55E' : C.g400}}/>
                    {isCompleted ? 'Trade completed' : isPaid ? 'Paid' : (cp?.is_online ?? true) ? 'Active' : fmtAge(cp?.last_seen_at)}
                  </span>
                  {isEscrow && isActive && !isDisputed && (
                    <span
                      className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-black shadow-sm ${
                        !isPaid && ((timeLeft !== null && timeLeft <= 0) || urgent) ? 'animate-pulse' : ''
                      }`}
                      style={{
                        color:'#fff',
                        background: isPaid
                          ? 'linear-gradient(135deg,#15803D,#22C55E)'
                          : (timeLeft !== null && timeLeft <= 0)
                            ? 'linear-gradient(135deg,#B91C1C,#EF4444)'
                            : urgent
                              ? 'linear-gradient(135deg,#B45309,#F59E0B)'
                              : `linear-gradient(135deg,${C.forest},${C.mint})`,
                        boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
                      }}>
                      {isPaid ? <Check size={14}/> : <Timer size={14}/>}
                      {isPaid ? 'Paid' : (timeLeft !== null && timeLeft <= 0) ? '⏰ Expired' : fmtTimer(timeLeft)}
                    </span>
                  )}
                 <button
  type="button"
  onClick={()=>{setProfUser(cp);setProfLabel(isBuyer?'Seller':'Buyer');}}
  className="flex items-center gap-1.5 text-sm font-bold" style={{color:C.green}}>
  <Info size={16}/> Partner details
</button>
                </div>
              </div>

              {/* Messages */}
              <div ref={chatRef} className="flex-1 overflow-y-auto px-4 pb-4 pt-2 space-y-3" style={{backgroundColor:'#F9FAFB',minHeight:0,WebkitOverflowScrolling:'touch',touchAction:'pan-y'}}>

                {/* ── Trade Summary Banner — scrolls away with the rest of the chat, not pinned ── */}
                <div className="-mx-4 -mt-2 mb-3 flex items-center gap-2.5 px-4 py-2.5"
                  style={{ backgroundColor: isSeller ? C.danger : C.green }}>
                  <div className="flex-shrink-0 flex items-center justify-center"
                    style={{
                      width:26, height:26, borderRadius:'50%',
                      border:'1.5px solid rgba(255,255,255,0.85)',
                      backgroundColor:'rgba(255,255,255,0.14)',
                      transform:'rotate(-8deg)',
                      boxShadow:'0 0 0 2px rgba(255,255,255,0.18)',
                    }}
                    title="Verified escrow trade">
                    <Stamp size={14} style={{color:'#fff'}}/>
                  </div>
                  <p className="text-xs leading-snug font-black uppercase tracking-wide" style={{color:'#fff'}}>
                    {isBuyer
                      ? `YOU ARE BUYING ${fmtBtc(btcReceived)} BTC FOR ${userPays.toFixed(2)} (${cur}) WITH ${payMethod}`
                      : isSeller
                        ? `YOU ARE SELLING ${fmtBtc(btcReceived)} BTC FOR ${userPays.toFixed(2)} (${cur}) WITH ${payMethod}`
                        : `PAY ${userPays.toFixed(2)} (${cur}) VIA ${payMethod} FOR ${fmtBtc(btcReceived)} BTC`
                    }
                  </p>
                </div>

                {/* Proof images */}
                {images.length>0&&(
                  <div className="flex gap-2 flex-wrap">
                    <span className="text-xs w-full font-bold flex items-center gap-1" style={{color:C.g400}}><Paperclip size={12}/> Uploaded Proofs:</span>
                    {images.map((img,i)=>{
                      const src=img.image_url||img.url;
                      if(!src)return null;
                      const fullSrc=(src.startsWith('http')||src.startsWith('data:')||src.startsWith('blob:'))?src:`${API_URL}${src}`;
                      return(
                        <button key={i} onClick={()=>setImgSrc(fullSrc)}
                          className="w-14 h-14 rounded-xl overflow-hidden border-2 hover:opacity-80 transition"
                          style={{borderColor:C.green}}>
                          <img src={fullSrc} alt="Proof" className="w-full h-full object-cover"
                            onError={e=>{e.target.style.display='none';}}/>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* System message — trade opened notice. Stays visible for the life of the trade
                    (paid, completed, cancelled, disputed, or expired) so either party can always
                    scroll back and re-read the original terms. */}
                {(isBuyer||isSeller) && (()=>{
                  const openedRaw = trade.created_at;
                  const openedDate = openedRaw ? new Date(/[Z+]/.test(openedRaw)?openedRaw:openedRaw+'Z') : new Date();
                  const openedLabel = `${String(openedDate.getDate()).padStart(2,'0')}/${String(openedDate.getMonth()+1).padStart(2,'0')}/${openedDate.getFullYear()} ${String(openedDate.getHours()).padStart(2,'0')}:${String(openedDate.getMinutes()).padStart(2,'0')}`;
                  const sysText = isBuyer
                    ? `You are buying ${fmtBtc(btcReceived)} BTC (${sym}${fmt(btcValueInLocal,2)} ${cur}) for ${sym}${fmt(userPays,2)} ${cur} via ${payMethod}. It is now safe for you to pay. You will have ${timeLimit} minutes to make your payment and click on the "PAID" button before the trade expires.`
                    : `You are selling ${fmtBtc(btcReceived)} BTC (${sym}${fmt(btcValueInLocal,2)} ${cur}) for ${sym}${fmt(userPays,2)} ${cur} via ${payMethod}. Wait for the buyer to send payment via ${payMethod}, then confirm it before releasing the Bitcoin. The buyer has ${timeLimit} minutes to pay before the trade expires.`;
                  return(
                    <div className="-mx-4 -mt-2 mb-3 px-4 py-3.5" style={{backgroundColor:'#F3F4F6'}}>
                      <p className="text-sm font-black mb-1.5" style={{color:'#111827'}}>System message</p>
                      <p className="text-sm leading-relaxed" style={{color:'#1F2937'}}>{sysText}</p>
                      <p className="text-xs mt-2" style={{color:'#9CA3AF'}}>{openedLabel}</p>
                    </div>
                  );
                })()}

                {/* Messages */}
                {messages.length===0?(
                  <div className="flex flex-col items-center justify-center py-10 text-center">
                    <MessageCircle size={40} className="mb-2 opacity-15" style={{color:C.green}}/>
                    <p className="text-sm font-semibold" style={{color:C.g400}}>No messages yet</p>
                    <p className="text-xs" style={{color:C.g300}}>Start the conversation below</p>
                  </div>
                ):messages.map((m,i)=>{
                  const isOwn=String(m.sender_id)===String(user?.id);
                  const isMod=m.sender_role==='moderator';
                  const isSys=(!m.sender_id||m.message_type==='SYSTEM'||m.sender_role==='system')&&m.sender_role!=='moderator';
                  const text=m.message_text||m.message||'';
                  const ts=new Date(m.created_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});

                  /* ── SYSTEM event banners ─────────────────────────────── */
                  if(isSys){
                    const isSuccess=/complet|released|btc.*released|verified|unlock/i.test(text);
                    const isDanger =/cancel|expired|refund|failed/i.test(text);
                    const isWarn   =/warning|urgent|expir|time.*left|5 minute/i.test(text);
                    const isPmt    =/⏳.*payment|payment.*sent|buyer.*paid|mark.*paid|sent.*payment|confirmed payment|payment.*confirm|payment confirmed/i.test(text);
                    const isOpen   =/trade.*open|escrow.*lock|btc.*locked|opened/i.test(text);
                    const isDisp   =/disput|moderator|support.*review/i.test(text);

                    /* ── PAYMENT CONFIRMED — simple green system message ── */
                    if(isPmt) return(
                      <div key={i} className="flex justify-center my-3 px-1">
                        <div className="w-full max-w-[95%] rounded-2xl p-4" style={{backgroundColor:'#F0FDF4', border:'1px solid #86EFAC'}}>
                          <p className="text-sm font-black mb-1.5" style={{color:'#15803D'}}>System message</p>
                          <p className="text-sm leading-relaxed font-semibold" style={{color:'#166534'}}>
                            {isBuyer
                              ? 'Partner is now verifying your payment. Once partner confirms the payment, funds will be sent to you.'
                              : isSeller
                                ? <>Buyer confirmed payment via {payMethod}. Check your account — if received, tap <strong>RELEASE BITCOIN</strong> to complete the trade. Payment not received? Open a dispute so a moderator can help.</>
                                : text}
                          </p>
                          <p className="text-xs font-semibold mt-2.5" style={{color:'#4D7C0F'}}>{ts}</p>
                        </div>
                      </div>
                    );

                    /* ── TRADE COMPLETE — celebration card ─────────────── */
                    if(isSuccess) return(
                      <div key={i} className="flex justify-center my-4 px-1">
                        <div className="w-full max-w-[95%] rounded-2xl overflow-hidden"
                          style={{
                            background:'linear-gradient(145deg,#1E3A5F,#1D4ED8,#2563EB)',
                            boxShadow:'0 0 0 2px #93C5FD, 0 8px 32px rgba(37,99,235,0.55)',
                          }}>
                          <div className="flex items-center justify-between px-4 py-2.5"
                            style={{borderBottom:'1px solid rgba(255,255,255,0.15)'}}>
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                                style={{background:'rgba(255,255,255,0.18)',border:'1.5px solid rgba(255,255,255,0.35)'}}>
                                <PartyPopper size={18} style={{color:'#fff'}}/>
                              </div>
                              <span className="font-black text-white text-xs tracking-[0.15em] uppercase">Trade Complete</span>
                            </div>
                            <span className="text-xs font-semibold" style={{color:'rgba(255,255,255,0.5)'}}>{ts}</span>
                          </div>
                          <div className="px-4 py-3">
                            <p className="text-sm font-black text-white leading-snug">{text}</p>
                            <div className="mt-2.5 px-3 py-2 rounded-xl text-xs font-black"
                              style={{background:'rgba(37,99,235,0.15)',color:'#BFDBFE',border:'1px solid rgba(147,197,253,0.3)'}}>
                              Bitcoin has left escrow. Leave feedback to help the community!
                            </div>
                          </div>
                        </div>
                      </div>
                    );

                    /* ── other system banners (generic) ─────────────────── */
                    let grad, iconBg, icon, label;
                    if(isDisp)  {grad='linear-gradient(135deg,#7F1D1D,#DC2626)';iconBg='#FEF2F2';icon=<AlertTriangle size={16}/>;label='DISPUTE';}
                    else if(isDanger){grad='linear-gradient(135deg,#450a0a,#991B1B)';iconBg='#FEE2E2';icon=<X size={16}/>;label='CANCELLED';}
                    else if(isWarn)  {grad='linear-gradient(135deg,#431407,#C2410C)';iconBg='#FED7AA';icon=<AlertTriangle size={16}/>;label='ALERT';}
                    else if(isOpen)  {grad='linear-gradient(135deg,#0c1a10,#1B4332)';iconBg='#D1FAE5';icon=<Lock size={16}/>;label='TRADE OPEN';}
                    else             {grad='linear-gradient(135deg,#1e293b,#334155)';iconBg='#E2E8F0';icon=<Info size={16}/>;label='INFO';}

                    return(
                      <div key={i} className="flex justify-center my-3 px-1">
                        <div className="w-full max-w-[95%] rounded-2xl overflow-hidden shadow-lg">
                          <div className="flex items-center gap-2.5 px-3.5 py-2" style={{background:grad}}>
                            <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-base" style={{backgroundColor:iconBg}}>
                              {icon}
                            </div>
                            <span className="text-xs font-black tracking-widest flex-1" style={{color:'rgba(255,255,255,0.85)',letterSpacing:'0.08em'}}>{label}</span>
                            <span className="text-xs font-semibold" style={{color:'rgba(255,255,255,0.5)'}}>{ts}</span>
                          </div>
                          <div className="px-4 py-2.5" style={{background:'rgba(0,0,0,0.03)'}}>
                            <p className="text-xs font-semibold leading-relaxed" style={{color:'#1E293B'}}>{text}</p>
                          </div>
                        </div>
                      </div>
                    );
                  }

                  /* ── MODERATOR message ───────────────────────────────── */
                  if(isMod) return(
                    <div key={i} className="flex justify-center my-3 px-1">
                      <div className="w-full max-w-[95%] rounded-2xl overflow-hidden shadow-xl" style={{border:'2px solid #7C3AED'}}>
                        <div className="flex items-center justify-between px-4 py-2.5" style={{background:'linear-gradient(135deg,#2E1065,#6D28D9)'}}>
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0" style={{backgroundColor:'#FFD700'}}>
                              <Shield size={12} style={{color:'#2E1065'}}/>
                            </div>
                            <span className="text-xs font-black tracking-widest" style={{color:'#FFD700',letterSpacing:'0.1em'}}>PRAQEN MODERATOR</span>
                          </div>
                          <span className="text-xs font-black px-2 py-0.5 rounded-full" style={{backgroundColor:'rgba(255,215,0,0.2)',color:'#FFD700',border:'1px solid rgba(255,215,0,0.4)'}}>OFFICIAL</span>
                        </div>
                        <div className="px-4 py-3" style={{backgroundColor:'#F5F0FF'}}>
                          <p className="text-sm font-medium leading-relaxed whitespace-pre-line" style={{color:'#2E1065'}}>{text}</p>
                          <p className="text-xs mt-2 text-right font-semibold" style={{color:'#7C3AED'}}>{ts}</p>
                        </div>
                      </div>
                    </div>
                  );

                  /* ── USER chat bubbles ───────────────────────────────── */
                  const isImage = text.startsWith('data:image/');
                  /* Group messages from same sender — tighter gap */
                  const prevMsg = i > 0 ? messages[i-1] : null;
                  const prevIsSameSender = prevMsg && String(prevMsg.sender_id) === String(m.sender_id);
                  const groupMargin = prevIsSameSender ? 'mt-1' : 'mt-4';
                  return(
                    <div key={i} className={`flex ${isOwn?'justify-end':'justify-start'} items-end gap-2 ${groupMargin}`}>
                      {/* Avatar — left for received */}
                      {!isOwn&&(
                        <button onClick={()=>{setProfUser(cp);setProfLabel(isBuyer?'Seller':'Buyer');}}
                          className="flex-shrink-0 hover:opacity-80 active:opacity-60 transition">
                          <div className="relative">
                            <Avatar user={cp} size={28} radius="rounded-full" />
                            {((cp?.is_online ?? true) || cpIsAway) && (
                              <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-1.5 border-white"
                                style={{backgroundColor: (cp?.is_online ?? true) ? '#22C55E' : '#F59E0B'}} />
                            )}
                          </div>
                        </button>
                      )}
                      <div className="max-w-[72%] flex flex-col">
                        {isImage?(
                          <div className="rounded-2xl overflow-hidden shadow-sm"
                            style={{border:`2px solid ${isOwn?'#0B8FD9':'#14532D'}`}}>
                            {/* Sender name inside bubble — top */}
                            {!isOwn && (
                              <div className="flex items-center justify-between px-3 pt-2.5 pb-1"
                                style={{background:'#14532D'}}>
                                <p className="text-xs font-bold" style={{color:'rgba(255,255,255,0.7)'}}>
                                  {cp?.username || 'User'}
                                </p>
                              </div>
                            )}
                            <button type="button" onClick={()=>setImgSrc(text)}
                              className="block w-full text-left cursor-pointer"
                              style={{width:260}}>
                              <div className="flex flex-col items-center justify-center gap-1.5 px-4"
                                style={{height:130,background:isOwn?'rgba(11,143,217,0.08)':'rgba(20,83,45,0.10)'}}>
                                <div className="w-9 h-9 rounded-lg flex items-center justify-center"
                                  style={{background:isOwn?'rgba(11,143,217,0.15)':'rgba(20,83,45,0.18)'}}>
                                  <Camera size={18} style={{color:isOwn?'#334155':'#14532D'}} />
                                </div>
                                <span className="text-xs font-bold" style={{color:isOwn?'#334155':'#14532D'}}>
                                  Image attached — tap to view
                                </span>
                              </div>
                            </button>
                            {/* Timestamp inside bubble — bottom */}
                            <div className="px-3 pb-2.5 pt-1"
                              style={{background:isOwn?'#0B8FD9':'#14532D'}}>
                              <p className="text-xs" style={{color:'rgba(255,255,255,0.6)'}}>
                                {new Date(m.created_at).toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})} {new Date(m.created_at).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',hour12:false})}
                              </p>
                            </div>
                          </div>
                        ):(
                          <div className={`rounded-2xl px-4 shadow-sm ${isOwn ? 'py-3' : 'pt-3 pb-1.5'}`}
                            style={{ background: isOwn ? '#DCFCE7' : '#14532D', border: isOwn ? '1px solid #BBF7D0' : 'none' }}>
                            {/* ── TOP: sender name + copy icon (received only — own messages don't show name) ── */}
                            {!isOwn && (
                              <div className="flex items-center justify-between mb-2">
                                <p className="text-xs font-bold" style={{color:'rgba(255,255,255,0.7)'}}>
                                  {cp?.username || 'User'}
                                </p>
                                <button type="button"
                                  onClick={()=>copyToClipboard(text, 'Message copied!')}
                                  className="flex-shrink-0 flex items-center justify-center w-5 h-5"
                                  title="Copy message">
                                  <Copy size={13} style={{color:'rgba(255,255,255,0.5)'}}/>
                                </button>
                              </div>
                            )}
                            {/* ── MIDDLE: message text ── */}
                            <p className="text-sm font-bold break-words leading-relaxed mb-2"
                              style={{color: isOwn ? '#166534' : '#fff'}}>
                              {text}
                            </p>
                            {/* ── BOTTOM: timestamp + copy icon (right for sent) ── */}
                            {isOwn && (
                              <div className="flex items-center justify-between">
                                <p className="text-xs" style={{color:'#4D7C0F'}}>
                                  {new Date(m.created_at).toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})} {new Date(m.created_at).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',hour12:false})}
                                </p>
                                <button type="button"
                                  onClick={()=>copyToClipboard(text, 'Message copied!')}
                                  className="flex-shrink-0 flex items-center justify-center w-5 h-5"
                                  title="Copy message">
                                  <Copy size={13} style={{color:'rgba(22,101,52,0.55)'}}/>
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                        {!isOwn && (
                          <p className="text-xs mt-1" style={{color:'#94A3B8'}}>
                            {new Date(m.created_at).toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})} {new Date(m.created_at).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',hour12:false})}
                          </p>
                        )}
                        {/* Read receipts */}
                        <div className={`flex items-center gap-1 mt-0.5 ${isOwn?'justify-end':'justify-start'}`}>
                          {isOwn&&(
                            m.is_read||new Date(m.created_at).getTime()<lastCpMsgTime
                              ?<CheckCheck size={12} style={{color:'#3B82F6'}}/>
                              :<Check size={12} style={{color:C.g300}}/>
                          )}
                        </div>
                      </div>
                      {/* Avatar — right for sent (removed — own profile shouldn't show) */}
                    </div>
                  );
                })}

                {/* ── Typing indicator ── */}
                {cpTyping&&(
                  <div className="flex justify-start">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-black mr-2 flex-shrink-0"
                      style={{backgroundColor:C.mint,color:C.white}}>
                      {cp?.username?.charAt(0)?.toUpperCase()||'?'}
                    </div>
                    <div className="px-4 py-3 rounded-2xl rounded-tl shadow-sm flex items-center gap-1"
                      style={{backgroundColor:'#fff',border:`1px solid ${C.g200}`}}>
                      <span className="text-xs font-semibold mr-1" style={{color:C.g400}}>{cp?.username||'User'}</span>
                      {[0,1,2].map(d=>(
                        <span key={d} className="w-2 h-2 rounded-full inline-block"
                          style={{backgroundColor:C.g400,animation:`typingDot 1.2s ease-in-out ${d*0.2}s infinite`}}/>
                      ))}
                    </div>
                  </div>
                )}
                <style>{`@keyframes typingDot{0%,60%,100%{transform:translateY(0);opacity:0.4;}30%{transform:translateY(-4px);opacity:1;}}`}</style>

                {/* ── System message — trade completed, mirrors the payment-verification card ── */}
                {isCompleted && (()=>{
                  const doneRaw = trade.updated_at || trade.created_at;
                  const doneDate = doneRaw ? new Date(/[Z+]/.test(doneRaw)?doneRaw:doneRaw+'Z') : new Date();
                  const doneLabel = `${String(doneDate.getDate()).padStart(2,'0')}/${String(doneDate.getMonth()+1).padStart(2,'0')}/${doneDate.getFullYear()} ${String(doneDate.getHours()).padStart(2,'0')}:${String(doneDate.getMinutes()).padStart(2,'0')}`;
                  return(
                    <div className="flex justify-center my-3 px-1">
                      <div className="w-full max-w-[95%] rounded-2xl p-4" style={{backgroundColor:'#F0FDF4', border:'1px solid #86EFAC'}}>
                        <p className="text-sm font-black mb-1.5" style={{color:'#15803D'}}>System message</p>
                        <p className="text-sm leading-relaxed font-semibold" style={{color:'#166534'}}>
                          Trade completed. The Bitcoin has been released and the trade is now closed.
                        </p>
                        <p className="text-xs font-semibold mt-2.5" style={{color:'#4D7C0F'}}>{doneLabel}</p>
                      </div>
                    </div>
                  );
                })()}

                {/* ── Congratulations banner ── */}
                {isCompleted&&(
                  <div className="mx-1 my-2 rounded-xl overflow-hidden shadow-md"
                    style={{background:`linear-gradient(135deg,${C.forest},${C.mint})`}}>
                    <div className="px-4 py-3 text-center">
                      <p className="text-white font-black text-sm"><PartyPopper size={20} style={{display:'inline'}}/> Congratulations!</p>
                      <p className="text-xs font-bold mt-0.5 mb-2" style={{color:'rgba(255,255,255,0.8)'}}>
                        You just {isBuyer?'bought':'sold'} Bitcoin successfully!
                      </p>
                      <p className="text-xs mb-3 leading-snug" style={{color:'rgba(255,255,255,0.7)'}}>
                        Always come back &amp; trade more — PRAQEN's safe escrow protects every trade.
                      </p>
                      <div className="flex gap-2 justify-center">
                        <button onClick={()=>navigate('/buy-bitcoin')}
                          className="px-3 py-1.5 rounded-lg font-black text-xs hover:opacity-90 transition"
                          style={{backgroundColor:C.gold,color:C.forest}}>
                          <><Rocket size={14} style={{display:'inline'}}/> Trade Again</>
                        </button>
                        <button onClick={()=>navigate('/dashboard')}
                          className="px-3 py-1.5 rounded-lg font-black text-xs border hover:bg-white/10 transition"
                          style={{borderColor:'rgba(255,255,255,0.35)',color:'#fff'}}>
                          Dashboard →
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── Trade cancelled banner ── */}
                {isCancelled&&(
                  <div className="mx-1 my-2 rounded-xl overflow-hidden shadow-md border"
                    style={{background:'#fff',borderColor:C.g200}}>
                    <div className="px-4 py-3 text-center">
                      <div className="w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-2"
                        style={{backgroundColor:'#FEE2E2'}}>
                        <X size={20} style={{color:C.danger}}/>
                      </div>
                      <p className="font-black text-sm" style={{color:C.g800}}>Trade Cancelled</p>
                      <p className="text-xs font-semibold mt-0.5 mb-2" style={{color:C.g500}}>
                        This chat is closed — escrow funds were returned to the seller.
                      </p>
                      {trade?.cancel_reason&&(
                        <p className="text-xs mb-3 leading-snug px-3 py-2 rounded-lg" style={{color:C.g600,backgroundColor:C.g50}}>
                          Reason: {trade.cancel_reason}
                        </p>
                      )}
                      <div className="flex gap-2 justify-center flex-wrap">
                        <button onClick={()=>navigate(isSeller?'/sell-bitcoin':'/buy-bitcoin')}
                          className="px-3 py-1.5 rounded-lg font-black text-xs text-white hover:opacity-90 transition"
                          style={{backgroundColor:C.green}}>
                          <><Rocket size={14} style={{display:'inline'}}/> Start New Trade</>
                        </button>
                        <button onClick={()=>navigate('/buy-bitcoin')}
                          className="px-3 py-1.5 rounded-lg font-black text-xs border hover:bg-gray-50 transition"
                          style={{borderColor:C.g200,color:C.g700}}>
                          Browse Marketplace →
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── Payment confirmed banner — scrolls with the rest of the chat, not pinned ──
                     Driven directly by trade.status (isPaid), not by whether a chat
                     message successfully posted, so it always shows regardless of the message bug. ── */}
                {isActive&&isPaid&&(()=>{
                  const paidLabel = (()=>{
                    const d = paidAt ? new Date(paidAt) : new Date();
                    return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
                  })();
                  return(
                    <div className="rounded-2xl p-4" style={{backgroundColor:'#EFF6FF', border:'1px solid #93C5FD'}}>
                      <p className="text-sm font-black mb-1.5" style={{color:'#1D4ED8'}}>System message</p>
                      <p className="text-sm leading-relaxed font-semibold" style={{color:'#1E40AF'}}>
                        {isBuyer
                          ? 'Your payment has been sent successfully. The seller has been notified and will check their account now. Once they confirm receipt, your Bitcoin will be released to you automatically.'
                          : <>The buyer has confirmed payment. Please check your {payMethod} account right now. Check your account — if payment received, tap <strong>RELEASE BITCOIN</strong> to complete the trade. Payment not received? Open a dispute so a moderator can help.</>}
                      </p>
                      <p className="text-xs font-semibold mt-2.5" style={{color:'#3B82F6'}}>{paidLabel}</p>
                    </div>
                  );
                })()}

                <div ref={msgEnd}/>
              </div>

              {/* Input — floating pill composer */}
              {isActive?(
                <div className="flex-shrink-0 px-4 pb-4 pt-2 bg-[#F9FAFB] rounded-b-2xl">
                  <form onSubmit={sendMessage}
                    className="flex items-center gap-3 p-1.5 pl-3 pr-1.5 bg-white border-2 rounded-full shadow-[0_2px_8px_rgba(0,0,0,0.06)] transition-colors"
                    style={{borderColor: msg.trim()?`${C.mint}55`:'#E5E7EB'}}>

                    {/* ── Attach button + popup menu ── */}
                    <div className="relative flex-shrink-0" ref={attachMenuRef}>
                      <button type="button" onClick={()=>setShowAttachMenu(v=>!v)} disabled={uploading}
                        className="w-9 h-9 rounded-full flex items-center justify-center disabled:opacity-40 flex-shrink-0 transition-transform"
                        style={{
                          background:`linear-gradient(135deg,${C.mint}25,${C.green}20)`,
                          border:`1px solid ${C.mint}55`,
                          outline:'none',
                          transform: showAttachMenu?'rotate(45deg)':'rotate(0deg)',
                        }}>
                        {uploading?<RefreshCw size={15} className="animate-spin" style={{color:C.green}}/>
                          :<Plus size={17} style={{color:C.green}}/>}
                      </button>

                      {showAttachMenu&&(
                        <div className="absolute bottom-full left-0 mb-2 w-52 bg-white rounded-2xl shadow-2xl border overflow-hidden z-50"
                          style={{borderColor:C.g200}}>
                          {[
                            {label:'Take a Photo', icon:Camera, bg:`${C.gold}22`, color:C.gold, onClick:()=>cameraRef.current?.click()},
                            {label:'Upload Image', icon:ImageIcon, bg:`${C.mint}22`, color:C.green, onClick:()=>fileRef.current?.click()},
                            {label:'File',         icon:FileIcon, bg:'#DBEAFE', color:'#2563EB', onClick:()=>docRef.current?.click()},
                          ].map(({label,icon:Ic,bg,color,onClick})=>(
                            <button key={label} type="button"
                              onClick={()=>{onClick();setShowAttachMenu(false);}}
                              className="w-full flex items-center gap-3 px-3.5 py-3 hover:bg-gray-50 transition text-left">
                              <span className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{backgroundColor:bg}}>
                                <Ic size={16} style={{color}}/>
                              </span>
                              <span className="text-sm font-bold" style={{color:C.g700}}>{label}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Gallery — normal photo picker */}
                    <input ref={fileRef} type="file" accept="image/*" multiple onChange={e=>{uploadImage(e.target.files);e.target.value='';}} className="hidden"/>
                    {/* Camera — opens the device camera directly on mobile */}
                    <input ref={cameraRef} type="file" accept="image/*" capture="environment" onChange={e=>{uploadImage(e.target.files);e.target.value='';}} className="hidden"/>
                    {/* Files — broader picker (still only images are accepted server-side) */}
                    <input ref={docRef} type="file" multiple onChange={e=>{uploadImage(e.target.files);e.target.value='';}} className="hidden"/>

                    <input type="text" value={msg}
                      onChange={e=>{setMsg(e.target.value);sendTypingPing();}}
                      placeholder="Write a message..."
                      className="flex-1 min-w-0 px-2 py-2 font-medium bg-transparent border-0 focus:outline-none focus:ring-0 text-slate-800 placeholder-slate-400"
                      style={{fontSize:15}}/>
                    <button type="submit" disabled={!msg.trim()||sending}
                      className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition disabled:cursor-not-allowed"
                      style={{
                        background: !msg.trim()||sending ? '#F1F5F9' : `linear-gradient(135deg,${C.forest},${C.mint})`,
                        color: !msg.trim()||sending ? '#94A3B8' : '#ffffff',
                        boxShadow: !msg.trim()||sending ? 'none' : `0 2px 10px ${C.mint}66`,
                      }}>
                      {sending?<RefreshCw size={14} className="animate-spin"/>:<Send size={15}/>}
                    </button>
                  </form>
                </div>
              ):(
                <div className="border-t p-3 text-center text-sm font-bold flex-shrink-0"
                  style={{borderColor:C.g100,color:C.g400}}>
                  Chat closed — trade {isCompleted?'completed successfully':'cancelled'}
                </div>
              )}
            </div>
          </div>
        </div>

          {/* Tab Navigation Switcher (mobile only — hidden entirely at md and above) */}
          <div className="flex-shrink-0 bg-white border border-[#E5E7EB] rounded-[24px] shadow-[0_4px_16px_rgba(0,0,0,0.06)] p-2 flex gap-2 max-w-sm mx-auto w-full md:hidden">
            <button type="button" onClick={() => setActiveTab('actions')}
              className="flex-1 py-3 px-4 rounded-[16px] font-black text-sm flex items-center justify-center gap-2 transition duration-200 outline-none border border-transparent hover:opacity-90"
              style={activeTab === 'actions'
                ? {background:`linear-gradient(135deg,${C.forest},${C.mint})`,color:'#fff',boxShadow:'0 2px 8px rgba(27,67,50,0.25)'}
                : {backgroundColor:'#fff',color:C.g700}}>
              <Flag size={16} />
              <span>Actions</span>
            </button>

            <button type="button" onClick={() => setActiveTab('chat')}
              className="flex-1 py-3 px-4 rounded-[16px] font-black text-sm flex items-center justify-center gap-2 transition duration-200 outline-none border border-transparent hover:opacity-90"
              style={activeTab === 'chat'
                ? {background:`linear-gradient(135deg,${C.forest},${C.mint})`,color:'#fff',boxShadow:'0 2px 8px rgba(27,67,50,0.25)'}
                : {backgroundColor:'#fff',color:C.g700}}>
              <MessageCircle size={16} />
              <span>Chat</span>
            </button>
          </div>

        </div>
      </div>

      {/* Constrain page height to exactly calc(100svh - var(--navbar-h)) so the
          body never overflows or scrolls. The flex column chain then constrains every child
          properly — partner header stays pinned (flex-shrink-0) and only the message list
          scrolls inside its own overflow-y:auto region. */}
      <style>{`
        html.trade-page, .trade-page body {
          overflow:hidden!important;
        }
        .trade-mobile-root {
          min-height:calc(100svh - var(--navbar-h))!important;
          max-height:calc(100svh - var(--navbar-h))!important;
          height:calc(100svh - var(--navbar-h))!important;
        }
        /* BottomNav is hidden on /trade/ routes (see BottomNav.js), so the global
           .pb-nav-mobile reserved space below AppShell is dead weight here — it pushed
           total page height ~60px past the viewport, silently clipped by the overflow:hidden
           above. Zeroing it makes the trade page's real height match the viewport exactly. */
        .trade-page .pb-nav-mobile {
          padding-bottom: 0 !important;
        }
      `}</style>

      {/* ── MODALS ─────────────────────────────────────────────────────────── */}
      {profUser && <ProfilePopup user={profUser} label={profLabel} trade={trade} onClose={()=>setProfUser(null)}/>}
      {showSuccessModal && <FeedbackModal name={cp?.username} onClose={dismissFeedbackModal} onSubmit={submitFeedback} submitting={fbSub}/>}
      {showFb && <FeedbackModal name={cp?.username} onClose={dismissFeedbackModal} onSubmit={submitFeedback} submitting={fbSub}/>}
      {showCancel && <CancelModal onClose={()=>setShowCancel(false)} onConfirm={cancelTrade} submitting={submitting}/>}
      {imgSrc && <ImgModal src={imgSrc} onClose={()=>setImgSrc(null)}/>}
      {showDisputeModal && <DisputeModal onClose={()=>setShowDisputeModal(false)} onSubmit={submitDispute} submitting={disputeSubmitting}/>}

      {/* ── Pay confirmation modal ───────────────────────────────────── */}
      {showPayConfirm && (
        <ConfirmActionModal
          icon={isGiftCardTrade ? Gift : Check}
          iconBg={C.gold}
          title={isGiftCardTrade ? 'Confirm Gift Card Sent?' : 'Confirm Payment Sent?'}
          lines={isGiftCardTrade ? [
            {icon:<Gift size={16}/>, text:'You are confirming you have sent the gift card code to the buyer in the chat.'},
            {icon:<AlertTriangle size={16} style={{color:C.warn}}/>, text:'Only confirm if you have already shared the code. This cannot be undone.'},
            {icon:<Lock size={16}/>, text:'The buyer will verify the code before Bitcoin is released.'},
          ] : [
            {icon:<CreditCard size={16}/>, text:`You are confirming you have sent the full payment via ${payMethod}.`},
            {icon:<AlertTriangle size={16} style={{color:C.warn}}/>, text:'Only confirm if you have already completed the transfer. This cannot be undone.'},
            {icon:<Lock size={16}/>, text:'The seller will verify payment before releasing Bitcoin to you.'},
          ]}
          confirmLabel={isGiftCardTrade ? 'Yes, I Sent the Code' : 'Yes, I Have Paid'}
          confirmBg={C.gold}
          confirmColor={C.forest}
          onClose={()=>setShowPayConfirm(false)}
          onConfirm={markPaid}
          submitting={submitting}
        />
      )}

      {/* ── Release confirmation modal ───────────────────────────────── */}
      {showRelConfirm && (
        <ConfirmActionModal
          icon={Bitcoin}
          iconBg={C.green}
          title="Release Bitcoin to Buyer?"
          lines={[
            {icon:<CheckCircle size={16}/>, text:'Only release Bitcoin AFTER you have confirmed the payment in your bank or mobile money account.'},
            {icon:<AlertTriangle size={16} style={{color:C.warn}}/>, text:'This action is PERMANENT and cannot be reversed. Bitcoin will leave escrow immediately.'},
            {icon:<Lock size={16}/>, text:'A 0.5% fee will be automatically deducted by the escrow system.'},
            {icon:<Shield size={16}/>, text:'A security code will be sent to your email to confirm this action.'},
          ]}
          confirmLabel={sending2FA?'Sending code…':'Send Security Code'}
          confirmBg={C.green}
          confirmColor="#fff"
          onClose={()=>setShowRelConfirm(false)}
          onConfirm={requestRelease}
          submitting={sending2FA}
        />
      )}

      {show2FA && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{backgroundColor:'rgba(0,0,0,0.6)',backdropFilter:'blur(4px)'}}>
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{backgroundColor:`${C.green}15`}}>
                <Lock size={24} style={{color:C.green}}/>
              </div>
              <div>
                <h3 className="font-black text-base" style={{color:C.g800}}>Security Verification</h3>
                <p className="text-xs" style={{color:C.g400}}>Check your email for the code</p>
              </div>
            </div>
            <p className="text-sm mb-4" style={{color:C.g600}}>
              Enter the 6-digit code sent to your email to release Bitcoin. Code expires in 5 minutes.
            </p>
            <input
              type="text"
              inputMode="numeric"
              value={actionCode2FA}
              onChange={e=>setActionCode2FA(e.target.value.replace(/\D/g,'').slice(0,6))}
              placeholder="000000"
              autoFocus
              className="w-full text-center text-3xl font-mono tracking-widest border-2 rounded-xl py-3 mb-1 outline-none transition"
              style={{borderColor:actionCode2FA.length===6?C.green:C.g200,color:C.g800}}
              maxLength={6}
            />
            <p className="text-xs text-center mb-4" style={{color:C.g400}}>
              Didn't receive it?{' '}
              <button onClick={requestRelease} className="font-semibold underline" style={{color:C.green}}>
                {sending2FA?'Sending…':'Resend code'}
              </button>
            </p>
            <div className="flex gap-3">
              <button onClick={()=>{setShow2FA(false);setActionCode2FA('');}}
                className="flex-1 py-3 rounded-xl border font-semibold text-sm transition hover:bg-gray-50"
                style={{borderColor:C.g200,color:C.g600}}>
                Cancel
              </button>
              <button onClick={releaseBtc} disabled={actionCode2FA.length!==6||submitting}
                className="flex-1 py-3 rounded-xl text-white font-black text-sm transition hover:opacity-90 disabled:opacity-40"
                style={{backgroundColor:C.green}}>
                {submitting?'Releasing…':<><Unlock size={16}/> Release Bitcoin</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 2FA warning — user must enable 2FA before releasing ────────────── */}
      {show2FAWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{backgroundColor:'rgba(0,0,0,0.6)',backdropFilter:'blur(4px)'}}>
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{backgroundColor:`${C.warn}20`}}>
                <AlertTriangle size={20} style={{color:C.warn}} />
              </div>
              <div>
                <h3 className="font-black text-base" style={{color:C.g800}}>2FA Required</h3>
                <p className="text-xs" style={{color:C.g400}}>Enable two-factor authentication first</p>
              </div>
            </div>
            <p className="text-sm mb-4" style={{color:C.g600}}>
              You must enable 2FA (email or authenticator app) before you can release Bitcoin to a buyer.
              This adds an extra layer of security to protect your account and funds.
            </p>
            <div className="flex gap-3">
              <button onClick={()=>setShow2FAWarning(false)}
                className="flex-1 py-3 rounded-xl border font-semibold text-sm transition hover:bg-gray-50"
                style={{borderColor:C.g200,color:C.g600}}>
                Cancel
              </button>
              <button onClick={()=>{navigate('/settings?tab=security');}}
                className="flex-1 py-3 rounded-xl text-white font-black text-sm transition hover:opacity-90"
                style={{backgroundColor:C.green}}>
                Go to Settings
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    // </div>
  );
}