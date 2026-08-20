import { useState, useEffect, useRef } from 'react';
import { useRates } from '../contexts/RatesContext';
import { useNavigate, Link } from 'react-router-dom';
import SEO from '../components/SEO';
import axios from 'axios';
import {
  Bitcoin, CheckCircle, RefreshCw,
  AlertTriangle, BadgeCheck, Timer,
  Heart, MapPin, X, Info, Shield, ArrowRight, PlusCircle,
  Filter, Home, Wallet, User, Gift,
  ChevronDown, TrendingUp, BarChart2, ThumbsUp, ThumbsDown, Repeat2,
  Ban, Coins,
  Globe, CreditCard, Smartphone, Waves, Circle, Banknote, Apple,
  Diamond, MessageCircle, Landmark, Building2, Link2, Send, Phone,
  Palmtree, Sparkles, Moon, Star, ClipboardList, Loader2, WifiOff,
  Search, BarChart3, Mail, FileText,
} from 'lucide-react';
import { toast } from 'react-toastify';
import CountryFlag, { resolveCode } from '../components/CountryFlag';
import { BadgeChip } from '../lib/badge';
import ActiveTradeCard from '../components/ActiveTradeCard';
import PRQFooter from '../components/PRQFooter';
import GettingStartedSteps from '../components/GettingStartedSteps';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const C = {
  forest:'#1B4332', green:'#2D6A4F', mint:'#40916C',
  gold:'#F4A422', sell:'#D97706',
  mist:'#F0FAF5', white:'#FFFFFF',
  g50:'#F8FAFC', g100:'#F1F5F9', g200:'#E2E8F0',
  g300:'#CBD5E1', g400:'#94A3B8', g500:'#64748B',
  g600:'#475569', g700:'#334155', g800:'#1E293B',
  success:'#10B981', danger:'#EF4444', online:'#22C55E',
  warn:'#F59E0B',
};

const CUR_SYM = {
  GHS:'₵', NGN:'₦', KES:'KSh', ZAR:'R', UGX:'USh', TZS:'TSh',
  USD:'$', GBP:'£', EUR:'€', XAF:'CFA', XOF:'CFA', RWF:'RF',
  MZN:'MT', ZMW:'ZK', CDF:'FC', EGP:'E£', MAD:'MAD',
  INR:'₹', CNY:'¥', PHP:'₱', IDR:'Rp', PKR:'₨', BDT:'৳',
  VND:'₫', THB:'฿', MYR:'RM', SGD:'S$', AED:'AED', SAR:'SR',
  BRL:'R$', MXN:'MX$', COP:'COP$', TRY:'₺', PLN:'zł', UAH:'₴',
};

const CURRENCIES = [
  {code:'USD', symbol:'$',    name:'US Dollar'},
  {code:'GHS', symbol:'₵',    name:'Ghana Cedi'},
  {code:'NGN', symbol:'₦',    name:'Nigerian Naira'},
  {code:'KES', symbol:'KSh',  name:'Kenyan Shilling'},
  {code:'ZAR', symbol:'R',    name:'SA Rand'},
  {code:'UGX', symbol:'USh',  name:'Uganda Shilling'},
  {code:'TZS', symbol:'TSh',  name:'Tanzania Shilling'},
  {code:'RWF', symbol:'RF',   name:'Rwanda Franc'},
  {code:'XOF', symbol:'CFA',  name:'CFA Franc (West)'},
  {code:'XAF', symbol:'CFA',  name:'CFA Franc (Central)'},
  {code:'EGP', symbol:'E£',   name:'Egyptian Pound'},
  {code:'MAD', symbol:'MAD',  name:'Moroccan Dirham'},
  {code:'GBP', symbol:'£',    name:'British Pound'},
  {code:'EUR', symbol:'€',    name:'Euro'},
  {code:'INR', symbol:'₹',    name:'Indian Rupee'},
  {code:'CNY', symbol:'¥',    name:'Chinese Yuan'},
  {code:'PHP', symbol:'₱',    name:'Philippine Peso'},
  {code:'IDR', symbol:'Rp',   name:'Indonesian Rupiah'},
  {code:'PKR', symbol:'₨',    name:'Pakistani Rupee'},
  {code:'BDT', symbol:'৳',    name:'Bangladeshi Taka'},
  {code:'VND', symbol:'₫',    name:'Vietnamese Dong'},
  {code:'THB', symbol:'฿',    name:'Thai Baht'},
  {code:'MYR', symbol:'RM',   name:'Malaysian Ringgit'},
  {code:'SGD', symbol:'S$',   name:'Singapore Dollar'},
  {code:'AED', symbol:'AED',  name:'UAE Dirham'},
  {code:'SAR', symbol:'SR',   name:'Saudi Riyal'},
  {code:'BRL', symbol:'R$',   name:'Brazilian Real'},
  {code:'MXN', symbol:'MX$',  name:'Mexican Peso'},
  {code:'COP', symbol:'COP$', name:'Colombian Peso'},
  {code:'TRY', symbol:'₺',    name:'Turkish Lira'},
  {code:'PLN', symbol:'zł',   name:'Polish Zloty'},
  {code:'UAH', symbol:'₴',    name:'Ukrainian Hryvnia'},
];

const COUNTRY_REGIONS = {
  Africa:'#10B981', Asia:'#3B82F6', 'Middle East':'#F97316',
  Americas:'#EC4899', Europe:'#7C3AED',
};

const COUNTRIES = [
  {code:'ALL', name:'All Countries',  flag:<Globe size={14} className="inline-block" style={{color:C.g400}}/>, currency:'USD', symbol:'$',    region:null},
  {code:'GH',  name:'Ghana',          flag:'🇬🇭', currency:'GHS', symbol:'₵',    region:'Africa'},
  {code:'NG',  name:'Nigeria',        flag:'🇳🇬', currency:'NGN', symbol:'₦',    region:'Africa'},
  {code:'KE',  name:'Kenya',          flag:'🇰🇪', currency:'KES', symbol:'KSh',  region:'Africa'},
  {code:'TZ',  name:'Tanzania',       flag:'🇹🇿', currency:'TZS', symbol:'TSh',  region:'Africa'},
  {code:'UG',  name:'Uganda',         flag:'🇺🇬', currency:'UGX', symbol:'USh',  region:'Africa'},
  {code:'RW',  name:'Rwanda',         flag:'🇷🇼', currency:'RWF', symbol:'RF',   region:'Africa'},
  {code:'CI',  name:"Côte d'Ivoire",  flag:'🇨🇮', currency:'XOF', symbol:'CFA',  region:'Africa'},
  {code:'CM',  name:'Cameroon',       flag:'🇨🇲', currency:'XAF', symbol:'CFA',  region:'Africa'},
  {code:'SN',  name:'Senegal',        flag:'🇸🇳', currency:'XOF', symbol:'CFA',  region:'Africa'},
  {code:'ML',  name:'Mali',           flag:'🇲🇱', currency:'XOF', symbol:'CFA',  region:'Africa'},
  {code:'BF',  name:'Burkina Faso',   flag:'🇧🇫', currency:'XOF', symbol:'CFA',  region:'Africa'},
  {code:'BJ',  name:'Benin',          flag:'🇧🇯', currency:'XOF', symbol:'CFA',  region:'Africa'},
  {code:'TG',  name:'Togo',           flag:'🇹🇬', currency:'XOF', symbol:'CFA',  region:'Africa'},
  {code:'NE',  name:'Niger',          flag:'🇳🇪', currency:'XOF', symbol:'CFA',  region:'Africa'},
  {code:'CD',  name:'DR Congo',       flag:'🇨🇩', currency:'CDF', symbol:'FC',   region:'Africa'},
  {code:'ZM',  name:'Zambia',         flag:'🇿🇲', currency:'ZMW', symbol:'ZK',   region:'Africa'},
  {code:'ZW',  name:'Zimbabwe',       flag:'🇿🇼', currency:'USD', symbol:'$',    region:'Africa'},
  {code:'MZ',  name:'Mozambique',     flag:'🇿🇲', currency:'MZN', symbol:'MT',   region:'Africa'},
  {code:'ZA',  name:'South Africa',   flag:'🇿🇦', currency:'ZAR', symbol:'R',    region:'Africa'},
  {code:'EG',  name:'Egypt',          flag:'🇪🇬', currency:'EGP', symbol:'E£',   region:'Africa'},
  {code:'MA',  name:'Morocco',        flag:'🇲🇦', currency:'MAD', symbol:'MAD',  region:'Africa'},
  {code:'IN',  name:'India',          flag:'🇮🇳', currency:'INR', symbol:'₹',    region:'Asia'},
  {code:'CN',  name:'China',          flag:'🇨🇳', currency:'CNY', symbol:'¥',    region:'Asia'},
  {code:'PH',  name:'Philippines',    flag:'🇵🇭', currency:'PHP', symbol:'₱',    region:'Asia'},
  {code:'ID',  name:'Indonesia',      flag:'🇮🇩', currency:'IDR', symbol:'Rp',   region:'Asia'},
  {code:'PK',  name:'Pakistan',       flag:'🇵🇰', currency:'PKR', symbol:'₨',    region:'Asia'},
  {code:'BD',  name:'Bangladesh',     flag:'🇧🇩', currency:'BDT', symbol:'৳',    region:'Asia'},
  {code:'VN',  name:'Vietnam',        flag:'🇻🇳', currency:'VND', symbol:'₫',    region:'Asia'},
  {code:'TH',  name:'Thailand',       flag:'🇹🇭', currency:'THB', symbol:'฿',    region:'Asia'},
  {code:'MY',  name:'Malaysia',       flag:'🇲🇾', currency:'MYR', symbol:'RM',   region:'Asia'},
  {code:'SG',  name:'Singapore',      flag:'🇸🇬', currency:'SGD', symbol:'S$',   region:'Asia'},
  {code:'AE',  name:'UAE',            flag:'🇦🇪', currency:'AED', symbol:'AED',  region:'Middle East'},
  {code:'SA',  name:'Saudi Arabia',   flag:'🇸🇦', currency:'SAR', symbol:'SR',   region:'Middle East'},
  {code:'US',  name:'United States',  flag:'🇺🇸', currency:'USD', symbol:'$',    region:'Americas'},
  {code:'BR',  name:'Brazil',         flag:'🇧🇷', currency:'BRL', symbol:'R$',   region:'Americas'},
  {code:'MX',  name:'Mexico',         flag:'🇲🇽', currency:'MXN', symbol:'MX$',  region:'Americas'},
  {code:'CO',  name:'Colombia',       flag:'🇨🇴', currency:'COP', symbol:'COP$', region:'Americas'},
  {code:'GB',  name:'United Kingdom', flag:'🇬🇧', currency:'GBP', symbol:'£',    region:'Europe'},
  {code:'TR',  name:'Turkey',         flag:'🇹🇷', currency:'TRY', symbol:'₺',    region:'Europe'},
  {code:'PL',  name:'Poland',         flag:'🇵🇱', currency:'PLN', symbol:'zł',   region:'Europe'},
  {code:'UA',  name:'Ukraine',        flag:'🇺🇦', currency:'UAH', symbol:'₴',    region:'Europe'},
  {code:'EU',  name:'Europe (EUR)',   flag:'🇪🇺', currency:'EUR', symbol:'€',    region:'Europe'},
];

const PAYMENT_OPTIONS = [
  {value:'all',            label:'All Methods',                   icon:<CreditCard size={14} className="inline-block"/>, cat:null},
  {value:'mtn',            label:'MTN Mobile Money',              icon:<Smartphone size={14} className="inline-block"/>, cat:'Mobile Money'},
  {value:'vodafone',       label:'Vodafone Cash',                 icon:<Smartphone size={14} className="inline-block"/>, cat:'Mobile Money'},
  {value:'airteltigo',     label:'AirtelTigo Money',              icon:<Smartphone size={14} className="inline-block"/>, cat:'Mobile Money'},
  {value:'mpesa',          label:'M-Pesa',                        icon:<Smartphone size={14} className="inline-block"/>, cat:'Mobile Money'},
  {value:'airtel money',   label:'Airtel Money',                  icon:<Smartphone size={14} className="inline-block"/>, cat:'Mobile Money'},
  {value:'orange money',   label:'Orange Money',                  icon:<Smartphone size={14} className="inline-block"/>, cat:'Mobile Money'},
  {value:'wave',           label:'Wave',                          icon:<Waves size={14} className="inline-block"/>, cat:'Mobile Money'},
  {value:'chipper',        label:'Chipper Cash',                  icon:<Heart size={14} style={{color:'#22C55E'}} className="inline-block"/>, cat:'Mobile Money'},
  {value:'ecocash',        label:'EcoCash',                       icon:<Smartphone size={14} className="inline-block"/>, cat:'Mobile Money'},
  {value:'tigo pesa',      label:'Tigo Pesa / Mixx',              icon:<Smartphone size={14} className="inline-block"/>, cat:'Mobile Money'},
  {value:'moov money',     label:'Moov Money',                    icon:<Smartphone size={14} className="inline-block"/>, cat:'Mobile Money'},
  {value:'africell',       label:'Africell Money',                icon:<Smartphone size={14} className="inline-block"/>, cat:'Mobile Money'},
  {value:'paga',           label:'Paga',                          icon:<Circle size={14} fill="#22C55E" strokeWidth={0} className="inline-block"/>, cat:'Mobile Money'},
  {value:'paypal',         label:'PayPal',                        icon:<Wallet size={14} className="inline-block"/>, cat:'Digital Wallet'},
  {value:'cash app',       label:'Cash App',                      icon:<Banknote size={14} className="inline-block"/>, cat:'Digital Wallet'},
  {value:'apple pay',      label:'Apple Pay',                     icon:<Apple size={14} className="inline-block"/>, cat:'Digital Wallet'},
  {value:'alipay',         label:'Alipay',                        icon:<Circle size={14} fill="#3B82F6" strokeWidth={0} className="inline-block"/>, cat:'Digital Wallet'},
  {value:'wechat',         label:'WeChat Pay',                    icon:<MessageCircle size={14} className="inline-block"/>, cat:'Digital Wallet'},
  {value:'venmo',          label:'Venmo',                         icon:<Circle size={14} fill="#60A5FA" strokeWidth={0} className="inline-block"/>, cat:'Digital Wallet'},
  {value:'zelle',          label:'Zelle',                         icon:<Circle size={14} fill="#A855F7" strokeWidth={0} className="inline-block"/>, cat:'Digital Wallet'},
  {value:'revolut',        label:'Revolut',                       icon:<Diamond size={14} className="inline-block"/>, cat:'Digital Wallet'},
  {value:'skrill',         label:'Skrill',                        icon:<CreditCard size={14} className="inline-block"/>, cat:'Digital Wallet'},
  {value:'neteller',       label:'Neteller',                      icon:<CreditCard size={14} className="inline-block"/>, cat:'Digital Wallet'},
  {value:'payeer',         label:'Payeer',                        icon:<CreditCard size={14} className="inline-block"/>, cat:'Digital Wallet'},
  {value:'perfect money',  label:'Perfect Money',                 icon:<CreditCard size={14} className="inline-block"/>, cat:'Digital Wallet'},
  {value:'wise',           label:'Wise',                          icon:<Globe size={14} className="inline-block"/>, cat:'Remittance'},
  {value:'worldremit',     label:'WorldRemit',                    icon:<Globe size={14} className="inline-block"/>, cat:'Remittance'},
  {value:'remitly',        label:'Remitly',                       icon:<Send size={14} className="inline-block" style={{color:'#0EA5E9'}}/>, cat:'Remittance'},
  {value:'western union',  label:'Western Union',                 icon:<Building2 size={14} className="inline-block"/>, cat:'Remittance'},
  {value:'moneygram',      label:'MoneyGram',                     icon:<Building2 size={14} className="inline-block"/>, cat:'Remittance'},
  {value:'bank transfer',  label:'Bank Transfer',                 icon:<Landmark size={14} className="inline-block"/>, cat:'Bank'},
  {value:'wire transfer',  label:'Wire Transfer',                 icon:<Link2 size={14} className="inline-block"/>, cat:'Bank'},
  {value:'mobile banking', label:'Mobile Banking App',            icon:<Smartphone size={14} className="inline-block"/>, cat:'Bank'},
  {value:'interbank',      label:'Interbank (GhIPSS/NIBSS/EFT)',  icon:<Landmark size={14} className="inline-block"/>, cat:'Bank'},
  {value:'ussd',           label:'USSD Bank Transfer',            icon:<Phone size={14} className="inline-block"/>, cat:'Bank'},
  {value:'instant eft',    label:'Instant EFT (South Africa)',    icon:<Landmark size={14} className="inline-block"/>, cat:'Bank'},
  {value:'cash deposit',   label:'Cash Deposit (Bank Counter)',   icon:<Landmark size={14} className="inline-block"/>, cat:'Bank'},
  {value:'opay',           label:'OPay',                          icon:<Circle size={14} fill="#22C55E" strokeWidth={0} className="inline-block"/>, cat:'FinTech'},
  {value:'palmpay',        label:'PalmPay',                       icon:<Palmtree size={14} className="inline-block"/>, cat:'FinTech'},
  {value:'kuda',           label:'Kuda Bank',                     icon:<Landmark size={14} className="inline-block"/>, cat:'FinTech'},
  {value:'moniepoint',     label:'Moniepoint',                    icon:<Landmark size={14} className="inline-block"/>, cat:'FinTech'},
  {value:'paystack',       label:'Paystack',                      icon:<Heart size={14} style={{color:'#22C55E'}} className="inline-block"/>, cat:'FinTech'},
  {value:'flutterwave',    label:'Flutterwave (Barter)',           icon:<Sparkles size={14} className="inline-block"/>, cat:'FinTech'},
  {value:'cash in person', label:'Cash in Person (Face-to-Face)', icon:<Banknote size={14} className="inline-block"/>, cat:'Cash'},
  {value:'cash out',       label:'Cash Out',                      icon:<Banknote size={14} className="inline-block"/>, cat:'Cash'},
  {value:'usdt',           label:'USDT (Tether – TRC20)',          icon:<Banknote size={14} className="inline-block"/>, cat:'Crypto'},
  {value:'binance pay',    label:'Binance Pay',                   icon:<Circle size={14} fill="#F0B90B" strokeWidth={0} className="inline-block"/>, cat:'Crypto'},
  {value:'bitcoin',        label:'Bitcoin (BTC)',                  icon:'₿',  cat:'Crypto'},
  {value:'ethereum',       label:'Ethereum (ETH)',                icon:'⬡',  cat:'Crypto'},
  {value:'luno',           label:'Luno Wallet',                   icon:<Moon size={14} className="inline-block"/>, cat:'Crypto'},
  {value:'yellow card',    label:'Yellow Card Wallet',            icon:<Circle size={14} fill="#EAB308" strokeWidth={0} className="inline-block"/>, cat:'Crypto'},
];

const PM_CAT_COLORS = {
  'Mobile Money':'#10B981','Digital Wallet':'#3B82F6','Remittance':'#0D9488',
  'Bank':'#7C3AED','FinTech':'#F59E0B','Cash':'#F4A422','Crypto':'#F97316',
};

const fmt   = (n, d=0) => new Intl.NumberFormat('en-US', {minimumFractionDigits:0, maximumFractionDigits:d}).format(n||0);
const fUsdt = (n)       => parseFloat(n||0).toFixed(2);

const getUser     = (u) => Array.isArray(u) ? u[0] : (u||{});
const getDisplayName = (u) => (u?.username || '');
const isVerified  = (u) => !!(u?.kyc_verified||u?.is_verified||u?.is_id_verified||u?.is_email_verified);
const getTrades   = (u) => parseInt(u?.total_trades ?? u?.trade_count ?? 0);
const getLastSeen = (u) => {
  const d = u?.last_seen_at||u?.last_login||u?.updated_at||u?.created_at;
  if (!d) return {label:'—', online:false};
  const s = (Date.now()-new Date(d))/1000;
  if (s<300)   return {label:'ACTIVE NOW', online:true};
  if (s<3600)  { const m=~~(s/60); return {label:`${m} ${m===1?'min':'mins'} ago`, online:false}; }
  if (s<86400) { const h=~~(s/3600); return {label:`${h} ${h===1?'hr':'hrs'} ago`, online:false}; }
  const dy=~~(s/86400); return {label:`${dy} ${dy===1?'day':'days'} ago`, online:false};
};
const getRateUSD = (l, usdtPrice) => {
  if (l.pricing_type==='fixed') { const s=parseFloat(l.bitcoin_price||0); if(s>0.01) return s; }
  return (usdtPrice || 1) * (1 + parseFloat(l.margin||0)/100);
};

// ── Avatar ────────────────────────────────────────────────────────────────────
const _avatarCache = {};
function Avatar({user, size=36, radius='rounded-xl'}) {
  const [err, setErr] = useState(false);
  const [lazyUrl, setLazyUrl] = useState(null);
  const u = getUser(user);
  useEffect(() => {
    const stored = u?.avatar_url;
    const id = u?.id;
    if (stored || !id || err) return;
    const hit = _avatarCache[id];
    if (hit instanceof Promise) { hit.then(v => { if(v) setLazyUrl(v); }); return; }
    if (hit !== undefined) { setLazyUrl(hit); return; }
    const p = axios.get(`${API_URL}/users/${id}/avatar`)
      .then(r => r.data?.avatar_url || null)
      .catch(() => null)
      .then(v => { _avatarCache[id] = v; if(v) setLazyUrl(v); return v; });
    _avatarCache[id] = p;
  }, [u?.id, u?.avatar_url, err]);
  const url = u?.avatar_url || lazyUrl;
  if (url && !err) {
    return (
      <img src={url} alt={u.username||'user'} onError={()=>setErr(true)}
        className={`object-cover flex-shrink-0 ${radius}`}
        style={{width:size, height:size}}/>
    );
  }
  return (
    <div className={`flex-shrink-0 flex items-center justify-center font-black text-white ${radius}`}
      style={{width:size, height:size, backgroundColor:C.sell, fontSize:Math.round(size*0.38)}}>
      {(u?.username||'?').charAt(0).toUpperCase()}
    </div>
  );
}

// ── Buyer Offer Card (Sell USDT) ───────────────────────────────────────────────
function OfferCard({listing, usdtPriceUSD, onViewBuyer, onSell, liked, onToggleLike, liveSeenAt, userSellAmt}) {
  const { rates: USD_RATES } = useRates();
  const u         = getUser(listing.users);
  const [seen, setSeen] = useState(() => getLastSeen({ ...u, last_seen_at: liveSeenAt || u.last_seen_at }));
  useEffect(() => { setSeen(getLastSeen({ ...u, last_seen_at: liveSeenAt || u.last_seen_at })); }, [liveSeenAt]);
  useEffect(() => {
    const id = setInterval(() => setSeen(getLastSeen({ ...u, last_seen_at: liveSeenAt || u.last_seen_at })), 30000);
    return () => clearInterval(id);
  }, [liveSeenAt]);
  const trades    = getTrades(u);
  const margin    = parseFloat(listing.margin||0);
  const cur       = listing.currency || 'GHS';
  const sym       = listing.currency_symbol || CUR_SYM[cur] || '₵';
  const usdRate   = USD_RATES[cur] || 1;
  const rateLocal = getRateUSD(listing, usdtPriceUSD) * usdRate;

  const minLocal = listing.min_limit_local || (listing.min_limit_usd ? listing.min_limit_usd*usdRate : 100*usdRate);
  const maxLocal = listing.max_limit_local || (listing.max_limit_usd ? listing.max_limit_usd*usdRate : 1000*usdRate);

  const examplePay = (userSellAmt && parseFloat(userSellAmt) > 0)
    ? parseFloat(userSellAmt)
    : (minLocal || Math.round(100*usdRate));
  const usdtAmount = examplePay / rateLocal;
  // Market value of that USDT at the real USDT/USD rate — NOT the buyer's
  // marked-up rate. Deliberately different from examplePay whenever margin
  // != 0, so the margin's effect is visible instead of the "you sell" line
  // just echoing "you receive" back unchanged.
  const usdtMarketFiat = parseFloat((usdtAmount * (usdtPriceUSD || 1) * usdRate).toFixed(2));

  const marginLabel = margin===0 ? 'Market rate' : margin>0 ? `+${margin}%` : `${Math.abs(margin)}%`;
  const marginBg    = margin>0 ? C.danger : margin<0 ? C.success : C.g400;

  const pos   = parseInt(u.positive_feedback||0);
  const neg   = parseInt(u.negative_feedback||0);
  const pmLabel = listing.payment_method || 'Payment';

  return (
    <div className="rounded-2xl overflow-hidden transition-all w-full" style={{border:`1px solid ${C.g200}`, background:'#fff'}}>
      <div className="px-4 pt-4 pb-2">
        <div className="flex items-start gap-3">
          <div className="relative flex-shrink-0">
            <button onClick={onViewBuyer}>
              <Avatar user={u} size={48} radius="rounded-xl"/>
            </button>
            {seen.online && (
              <span className="absolute -bottom-0.5 -right-0.5">
                <span className="absolute inline-flex w-3.5 h-3.5 rounded-full animate-ping"
                  style={{backgroundColor:C.online, opacity:0.6}}/>
                <span className="relative inline-flex w-3.5 h-3.5 rounded-full border-2 border-white"
                  style={{backgroundColor:C.online}}/>
              </span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <CountryFlag countryCode={u?.country_code || u?.country || u?.location || null} className="w-4 h-3 rounded-sm flex-shrink-0"/>
              <button onClick={onViewBuyer} className="font-black text-sm hover:underline leading-tight truncate"
                style={{color:C.g800, maxWidth:'130px'}}>{getDisplayName(u) || 'Buyer'}</button>
              {isVerified(u) && <BadgeCheck size={14} style={{color:'#3B82F6', flexShrink:0}}/>}
              {u.country && <span className="text-xs font-semibold flex-shrink-0" style={{color:C.g500}}>· {resolveCode(u.country)?.toUpperCase() || u.country}</span>}
              <BadgeChip user={u} size="xs" />
            </div>
            <div className="flex items-center justify-between mt-1.5 gap-1">
              <div className="flex items-center gap-1.5">
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md font-bold"
                  style={{backgroundColor:'rgba(22,163,74,0.10)', color:'#16A34A', fontSize:'11px'}}>
                  <ThumbsUp size={10} strokeWidth={2.5}/>{fmt(pos)}
                </span>
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md font-bold"
                  style={{backgroundColor:'rgba(239,68,68,0.08)', color:'#EF4444', fontSize:'11px'}}>
                  <ThumbsDown size={10} strokeWidth={2.5}/>{fmt(neg)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-xs font-bold"
                  style={{backgroundColor:C.g100, color:C.g600}}>
                  <Repeat2 size={9} strokeWidth={2.5}/>{fmt(trades)} trades
                </span>
                {seen.online ? (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-xs font-bold"
                    style={{backgroundColor:'#F0FDF4', color:C.online}}>
                    <span className="relative flex w-1.5 h-1.5 flex-shrink-0">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{backgroundColor:C.online}}/>
                      <span className="relative inline-flex rounded-full w-1.5 h-1.5" style={{backgroundColor:C.online}}/>
                    </span>
                    Active
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-xs font-medium"
                    style={{backgroundColor:C.g100, color:C.g400}}>
                    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{backgroundColor:C.g300}}/>
                    {seen.label}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-2.5">
          <span className="inline-flex flex-col px-2.5 py-1.5 rounded-lg" style={{backgroundColor:C.g100}}>
            <span className="text-xs font-normal leading-tight" style={{color:C.g400}}>Payment method:</span>
            <span className="text-xs font-black leading-tight tracking-wide" style={{color:C.g700}}>{pmLabel.toUpperCase()}</span>
          </span>
        </div>
      </div>

      <div style={{height:1, backgroundColor:C.g100}}/>

      <div className="px-4 py-3 grid grid-cols-2 gap-2">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide mb-1" style={{color:C.g500}}>YOU SELL</p>
          <p className="text-lg font-bold leading-tight truncate" style={{color:C.g800}}>
            {sym}{fmt(usdtMarketFiat, 2)}
          </p>
          <p className="text-xs font-semibold mt-0.5" style={{color:C.g500}}>≈ USDT {fUsdt(usdtAmount)}</p>
        </div>
        <div className="border-l pl-3" style={{borderColor:C.g100}}>
          <p className="text-xs font-bold uppercase tracking-wide mb-1" style={{color:C.g500}}>YOU RECEIVE</p>
          <p className="text-lg font-bold leading-tight truncate" style={{color:C.g800}}>
            {sym}{fmt(examplePay, 2)}
          </p>
          <p className="text-xs font-semibold mt-0.5" style={{color:C.g400}}>{cur}</p>
          <span className="inline-block mt-1.5 font-semibold px-2 py-0.5 rounded"
            style={{backgroundColor:marginBg, color:'#fff', fontSize:'10px', letterSpacing:'0.01em'}}>
            {marginLabel}
          </span>
        </div>
      </div>

      <div className="px-4 pb-2">
        <p className="text-xs font-semibold" style={{color:C.g600}}>
          Rate: {sym}{fmt(rateLocal)}/USDT
        </p>
      </div>

      {(minLocal > 0 || maxLocal > 0) && (
        <div className="px-4 pb-2">
          <p className="text-xs font-bold" style={{color:C.g600}}>
            LIMIT {fmt(minLocal)} – {fmt(maxLocal)} {cur}
          </p>
        </div>
      )}

      <div className="px-4 pb-4 flex items-center gap-2">
        <button onClick={onViewBuyer}
          className="w-10 h-11 rounded-xl border flex items-center justify-center flex-shrink-0 transition"
          style={{borderColor:C.g200, backgroundColor:'transparent'}}>
          <Info size={15} style={{color:C.g400}}/>
        </button>
        <button onClick={onSell}
          className="flex-1 h-11 rounded-xl text-white font-black text-base flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.98] transition"
          style={{background:`linear-gradient(135deg,${C.sell},${C.gold})`, boxShadow:'0 4px 14px rgba(217,119,6,0.35)'}}>
          SELL USDT <ArrowRight size={15}/>
        </button>
      </div>
    </div>
  );
}

// ── Buyer Modal ───────────────────────────────────────────────────────────────
function BuyerModal({buyer, listing, onClose, onTrade, usdtPriceUSD}) {
  const [tab,        setTab]        = useState('overview');
  const [reviews,    setReviews]    = useState([]);
  const [rvLoad,     setRvLoad]     = useState(false);
  const [freshBuyer, setFreshBuyer] = useState(null);
  const { rates: USD_RATES } = useRates();

  const buyerId = getUser(buyer)?.id;
  useEffect(() => {
    if (!buyerId) return;
    axios.get(`${API_URL}/users/${buyerId}`)
      .then(r => { const d = r.data.user || r.data; if (d?.id) setFreshBuyer(d); })
      .catch(() => {});
  }, [buyerId]);

  const u      = getUser(freshBuyer || buyer);
  const seen   = getLastSeen(u);
  const trades = getTrades(u);
  const rating = parseFloat(u.average_rating || 0);
  const margin = parseFloat(listing?.margin || 0);
  const cur    = listing?.currency || 'GHS';
  const sym    = listing?.currency_symbol || CUR_SYM[cur] || '₵';
  const usdRate   = USD_RATES[cur] || 1;
  const rateLocal = getRateUSD(listing || {}, usdtPriceUSD || 1) * usdRate;

  const phoneOk  = !!(u.is_phone_verified || u.phone_verified);
  const emailOk  = !!(u.is_email_verified || u.email_verified);
  const kycOk    = !!(u.is_id_verified || u.kyc_verified);
  const pos      = parseInt(u.positive_feedback || 0);
  const neg      = parseInt(u.negative_feedback || 0);
  const total    = pos + neg;
  const trust    = total > 0 ? Math.round(pos / total * 100) : trades > 0 ? 100 : 0;
  const compRate = parseFloat(u.completion_rate || 0);
  const ccCode   = resolveCode(u.country || u.location);
  const avgReply = u.avg_response_time || u.avg_reply_minutes;
  const payMins  = parseFloat(u.avg_payment_time || u.avg_response_time || u.avg_reply_minutes || 0);
  const avgPayDisplay = payMins > 0 ? (() => { const m=Math.floor(payMins),s=Math.round((payMins-m)*60); return s>0?`${m}m ${s}s`:m>0?`${m}m`:`${s}s`; })() : '—';
  const locCC    = ccCode ? ccCode.toUpperCase() : '';
  const CC_NAME  = {GH:'Ghana',NG:'Nigeria',KE:'Kenya',ZA:'S. Africa',UG:'Uganda',TZ:'Tanzania',RW:'Rwanda',CM:'Cameroon',SN:'Senegal',ML:'Mali',CI:"Côte d'Ivoire",CD:'DR Congo',ZM:'Zambia',MZ:'Mozambique',ZW:'Zimbabwe',BF:'Burkina Faso',BJ:'Benin',TG:'Togo',NE:'Niger',ET:'Ethiopia',EG:'Egypt',MA:'Morocco',DZ:'Algeria',AO:'Angola',US:'USA',GB:'UK',DE:'Germany',FR:'France',IT:'Italy',ES:'Spain',NL:'Netherlands',SE:'Sweden',NO:'Norway',PL:'Poland',UA:'Ukraine',TR:'Turkey',VN:'Vietnam',TH:'Thailand',ID:'Indonesia',PH:'Philippines',MY:'Malaysia',SG:'Singapore',IN:'India',CN:'China',JP:'Japan',KR:'S. Korea',PK:'Pakistan',BD:'Bangladesh',SA:'Saudi Arabia',AE:'UAE',QA:'Qatar',BR:'Brazil',MX:'Mexico',CO:'Colombia',AR:'Argentina',CA:'Canada',AU:'Australia',NZ:'New Zealand'};
  const countryName = (u.country && u.country.length > 2) ? u.country : (CC_NAME[locCC] || u.location || (locCC || '—'));

  useEffect(() => {
    if (tab !== 'feedback' || !u.id || reviews.length) return;
    setRvLoad(true);
    axios.get(`${API_URL}/users/${u.id}/reviews`)
      .then(r => setReviews(r.data.reviews || []))
      .catch(() => {})
      .finally(() => setRvLoad(false));
  }, [tab, u.id]);

  if (!buyer) return null;

  const TABS = [
    { id:'overview', label:<span className="inline-flex items-center gap-1"><User size={12} className="inline-block"/>Profile</span> },
    { id:'feedback', label:<span className="inline-flex items-center gap-1"><MessageCircle size={12} className="inline-block"/>Reviews ({total})</span>},
    { id:'rules',    label:<span className="inline-flex items-center gap-1"><ClipboardList size={12} className="inline-block"/>Rules</span> },
    { id:'offer',    label:<span className="inline-flex items-center gap-1"><BarChart3 size={12} className="inline-block"/>Offer</span> },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{backgroundColor:'rgba(0,0,0,0.6)', backdropFilter:'blur(6px)'}}
      onClick={e => e.target === e.currentTarget && onClose()}>

      <div className="bg-white w-full sm:max-w-sm rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[92dvh] sm:max-h-[85vh] mb-[calc(60px_+_env(safe-area-inset-bottom,_0px))] sm:mb-0"
        style={{border:`1px solid ${C.g200}`, animation:'slideUp .28s cubic-bezier(0.34,1.56,0.64,1)'}}>
        <style>{`@keyframes slideUp{from{transform:translateY(40px);opacity:0}to{transform:translateY(0);opacity:1}}`}</style>

        {/* Drag handle */}
        <div className="flex justify-center pt-2.5 pb-1 flex-shrink-0 sm:hidden">
          <div className="w-10 h-1 rounded-full" style={{backgroundColor:C.g200}}/>
        </div>

        {/* Header */}
        <div className="relative px-4 pt-3 pb-4 flex-shrink-0"
          style={{background:`linear-gradient(135deg,${C.sell} 0%,#D97706 50%,${C.gold} 100%)`}}>
          <button onClick={onClose}
            className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center"
            style={{backgroundColor:'rgba(255,255,255,0.18)'}}>
            <X size={15} className="text-white"/>
          </button>

          <div className="flex items-center gap-3 mb-4">
            <div className="relative flex-shrink-0">
              <Avatar user={u} size={56} radius="rounded-2xl"/>
              <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-white"
                style={{backgroundColor: seen.online ? C.online : C.g400}}/>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                <Link to={u?.id ? `/profile/${u.id}` : '#'}
                  onClick={() => u?.id && axios.post(`${API_URL}/users/${u.id}/view-profile`).catch(()=>{})}
                  className="font-black text-white text-base leading-tight truncate"
                  style={{textDecoration:'none', borderBottom:'1.5px solid rgba(255,255,255,0.4)', paddingBottom:'1px'}}>
                  {getDisplayName(u) || 'Buyer'}
                </Link>
                {kycOk && <BadgeCheck size={15} style={{color:'#93C5FD', flexShrink:0}}/>}
              </div>
              <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
                <CountryFlag countryCode={ccCode} className="w-4 h-3 rounded-sm"/>
                {(u.country_name || u.country) && (
                  <span className="text-white/80 text-xs font-bold">{u.country_name || u.country}</span>
                )}
                <span className="text-white/40 text-xs">·</span>
                <span className="text-white/60 text-xs inline-flex items-center gap-1">
                  {seen.online
                    ? <><span className="inline-block w-1.5 h-1.5 rounded-full" style={{backgroundColor:'#4ADE80'}}/>Active now</>
                    : seen.label}
                </span>
              </div>
              <BadgeChip user={u} size="sm" />
            </div>
          </div>

          {/* Stats 2×2 grid */}
          <div className="grid grid-cols-2 gap-2">
            <div className="flex items-center gap-2 rounded-xl px-3 py-2.5" style={{backgroundColor:'rgba(255,255,255,0.12)'}}>
              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{backgroundColor: seen.online ? '#4ADE80' : '#94A3B8'}}/>
              <div className="min-w-0">
                <p className="text-white font-black text-xs leading-tight truncate">{seen.online ? 'Online now' : seen.label}</p>
                <p className="text-white/50 text-xs leading-tight">Last active</p>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-xl px-3 py-2.5" style={{backgroundColor:'rgba(255,255,255,0.12)'}}>
              <CountryFlag countryCode={ccCode} className="w-5 h-3.5 rounded-sm flex-shrink-0"/>
              <div className="min-w-0">
                <p className="text-white font-black text-xs leading-tight truncate">{countryName}</p>
                <p className="text-white/50 text-xs leading-tight">Location</p>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-xl px-3 py-2.5" style={{backgroundColor:'rgba(255,255,255,0.12)'}}>
              <Timer size={14} style={{color:'#FDE68A', flexShrink:0}}/>
              <div className="min-w-0">
                <p className="text-white font-black text-xs leading-tight">{avgPayDisplay}</p>
                <p className="text-white/50 text-xs leading-tight">Avg. response</p>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-xl px-3 py-2.5" style={{backgroundColor:'rgba(255,255,255,0.12)'}}>
              <Heart size={14} style={{color: pos > 0 ? '#86EFAC' : 'rgba(255,255,255,0.5)', flexShrink:0}}/>
              <div className="min-w-0">
                <p className="text-white font-black text-xs leading-tight">{pos > 0 ? `${fmt(pos)} users` : 'No ratings yet'}</p>
                <p className="text-white/50 text-xs leading-tight">Trusted by</p>
              </div>
            </div>
          </div>

          {/* ── VIEW FULL PROFILE LINK ── */}
          {u?.id && (
            <Link to={`/profile/${u.id}`}
              onClick={() => axios.post(`${API_URL}/users/${u.id}/view-profile`).catch(()=>{})}
              className="mt-3 flex items-center justify-center gap-1.5 w-full py-2 rounded-xl text-xs font-bold transition hover:bg-white/20 active:scale-95"
              style={{
                color:'rgba(255,255,255,0.9)',
                border:'1.5px solid rgba(255,255,255,0.25)',
                backgroundColor:'rgba(255,255,255,0.1)',
                textDecoration:'none',
              }}>
              <span>View Full Profile</span>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M7 17L17 7M17 7H7M17 7v10"/>
              </svg>
            </Link>
          )}
        </div>

        {/* Tabs */}
        <div className="flex border-b flex-shrink-0 overflow-x-auto" style={{borderColor:C.g200}}>
          {TABS.map(({id, label}) => (
            <button key={id} onClick={() => setTab(id)}
              className="flex-shrink-0 px-3 py-2.5 text-xs font-bold whitespace-nowrap transition"
              style={{
                color: tab===id ? C.sell : C.g500,
                borderBottom: tab===id ? `2px solid ${C.sell}` : '2px solid transparent',
                backgroundColor: tab===id ? `${C.sell}10` : 'transparent',
              }}>
              {label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto p-4" style={{WebkitOverflowScrolling:'touch', minHeight:0}}>

          {/* OVERVIEW */}
          {tab==='overview' && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                {[
                  {label:'Trades',     value:fmt(trades),               sub:'completed'},
                  {label:'Rating',     value:<span className="inline-flex items-center gap-1"><Star size={12} className="inline-block fill-yellow-400 text-yellow-400"/>{rating.toFixed(1)}</span>, sub:'of 5.0'},
                  {label:'Completion', value:`${compRate.toFixed(0)}%`, sub:'rate'},
                ].map(({label,value,sub}) => (
                  <div key={label} className="rounded-xl p-3 text-center"
                    style={{backgroundColor:C.mist, border:`1px solid ${C.g200}`}}>
                    <p className="font-black text-sm" style={{color:C.forest}}>{value}</p>
                    <p className="text-xs font-semibold mt-0.5" style={{color:C.g500}}>{label}</p>
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
              <div className="rounded-xl overflow-hidden" style={{border:`1px solid ${C.g200}`}}>
                <p className="text-xs font-black px-3 py-2 uppercase tracking-wider"
                  style={{color:C.g500, backgroundColor:C.g50}}>Verification</p>
                {u.full_name && u.name_display !== 'hide' && !u.hide_full_name && (
                  <div className="flex items-center justify-between px-3 py-2.5 border-t" style={{borderColor:C.g100}}>
                    <div className="flex items-center gap-2">
                      <span className="text-sm flex items-center"><User size={14}/></span>
                      <span className="text-xs font-semibold" style={{color:C.g700}}>Full Name</span>
                    </div>
                    <span className="text-xs font-black" style={{color:C.g800}}>{u.full_name}</span>
                  </div>
                )}
                {[
                  {label:'Phone Number', ok:phoneOk, icon:<Smartphone size={14} className="inline-block"/>},
                  {label:'Email Address',ok:emailOk, icon:<Mail size={14} className="inline-block"/>},
                  {label:'ID / KYC',     ok:kycOk,   icon:<FileText size={14} className="inline-block"/>},
                ].map(({label,ok,icon}) => (
                  <div key={label} className="flex items-center justify-between px-3 py-2.5 border-t"
                    style={{borderColor:C.g100}}>
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{icon}</span>
                      <span className="text-xs font-semibold" style={{color:C.g700}}>{label}</span>
                    </div>
                    <span className="text-xs font-black px-2.5 py-1 rounded-full"
                      style={{backgroundColor: ok ? '#F0FDF4' : '#FEF2F2', color: ok ? '#16A34A' : '#DC2626'}}>
                      {ok ? '✓ Verified' : '✗ Not verified'}
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
                  {label:'Country', value: (() => {
                    const cc = resolveCode(u.country || u.location);
                    if (!cc) return u.location || '—';
                    const ccUp = cc.toUpperCase();
                    const flag = ccUp.replace(/./g,c=>String.fromCodePoint(0x1F1E6+c.charCodeAt(0)-65));
                    return `${flag} ${countryName}`;
                  })()},
                  {label:'Member since', value: u.created_at ? new Date(u.created_at).toLocaleDateString('en-US',{month:'short',year:'numeric'}) : '—'},
                ].filter(Boolean).map(({label,value}) => (
                  <div key={label} className="flex items-center justify-between px-3 py-2.5 border-b last:border-0"
                    style={{borderColor:C.g100}}>
                    <span className="text-xs font-semibold" style={{color:C.g500}}>{label}</span>
                    <span className="text-xs font-black" style={{color:C.g800}}>{value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* FEEDBACK */}
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
                    <p className="text-xs inline-flex items-center justify-center gap-1" style={{color:C.g400}}><ThumbsUp size={11} className="inline-block"/>Positive</p>
                  </div>
                  <div className="text-center flex-1">
                    <p className="font-black text-sm" style={{color:'#DC2626'}}>{fmt(neg)}</p>
                    <p className="text-xs inline-flex items-center justify-center gap-1" style={{color:C.g400}}><ThumbsDown size={11} className="inline-block"/>Negative</p>
                  </div>
                  <div className="text-center flex-1">
                    <p className="font-black text-sm" style={{color:C.forest}}>{trust}%</p>
                    <p className="text-xs" style={{color:C.g400}}>Trust</p>
                  </div>
                </div>
              </div>
              {rvLoad ? (
                <div className="space-y-2">
                  {[1,2,3].map(i=>(
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
                  <MessageCircle size={36} className="mx-auto mb-2" style={{color:C.g300}}/>
                  <p className="font-bold text-sm" style={{color:C.g700}}>No reviews yet</p>
                  <p className="text-xs mt-1" style={{color:C.g400}}>Be the first to trade with this buyer</p>
                </div>
              ) : (
                reviews.slice(0, 20).map((rv, i) => {
                  const isPos = rv.rating >= 4;
                  const ago = rv.created_at ? (() => {
                    const s = (Date.now()-new Date(rv.created_at))/1000;
                    if(s<3600) return `${~~(s/60)}m ago`;
                    if(s<86400) return `${~~(s/3600)}h ago`;
                    return `${~~(s/86400)}d ago`;
                  })() : '';
                  return (
                    <div key={i} className="rounded-xl border p-3"
                      style={{borderColor: isPos ? '#86EFAC' : '#FCA5A5', backgroundColor: isPos ? '#F0FDF4' : '#FEF2F2'}}>
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-black text-white flex-shrink-0"
                            style={{backgroundColor: isPos ? '#16A34A' : '#DC2626'}}>
                            {isPos ? <ThumbsUp size={12} className="inline-block"/> : <ThumbsDown size={12} className="inline-block"/>}
                          </div>
                          <span className="text-xs font-black" style={{color: isPos ? '#166534' : '#991B1B'}}>
                            {rv.reviewer?.username || 'Anonymous'}
                          </span>
                        </div>
                        <span className="text-xs" style={{color:C.g400}}>{ago}</span>
                      </div>
                      {rv.comment && (
                        <p className="text-xs leading-relaxed pl-8" style={{color: isPos ? '#14532D' : '#7F1D1D'}}>
                          "{rv.comment}"
                        </p>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* TRADE RULES */}
          {tab==='rules' && (
            <div className="space-y-3">
              <div className="p-3.5 rounded-xl text-sm leading-relaxed whitespace-pre-wrap"
                style={{backgroundColor:C.mist, color:C.g700, border:`1px solid ${C.g200}`}}>
                {listing?.trade_instructions || listing?.listing_terms || listing?.description ||
                  'Confirm payment received in your account before releasing USDT. Never release early.'}
              </div>
              <div className="flex items-center gap-2.5 p-3 rounded-xl"
                style={{backgroundColor:'#FFFBEB', border:'1px solid #FDE68A'}}>
                <Timer size={14} style={{color:C.sell, flexShrink:0}}/>
                <p className="text-xs font-bold" style={{color:'#92400E'}}>
                  Time limit: {listing?.time_limit||30} minutes — auto-cancels if unpaid
                </p>
              </div>
              <div className="flex items-start gap-2.5 p-3 rounded-xl"
                style={{backgroundColor:'#FEF2F2', border:'1px solid #FCA5A5'}}>
                <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" style={{color:C.danger}}/>
                <p className="text-xs leading-relaxed" style={{color:'#991B1B'}}>
                  <strong>Never release USDT</strong> before confirming payment is received in your account. Escrow protects every trade.
                </p>
              </div>
            </div>
          )}

          {/* OFFER DETAILS */}
          {tab==='offer' && (
            <div className="rounded-xl overflow-hidden" style={{border:`1px solid ${C.g200}`}}>
              {[
                {label:'Payment Method', value:listing?.payment_method||'—'},
                {label:'Rate / USDT',    value:`${sym}${fmt(rateLocal,2)} ${cur}`},
                {label:'Margin',         value:margin===0?'At market':margin>0?`+${margin}% above market`:`${margin}% below market`},
                {label:'Trade Limits',   value:listing?.min_limit_local && listing?.max_limit_local
                  ? `${sym}${fmt(listing.min_limit_local)} – ${sym}${fmt(listing.max_limit_local)} ${cur}`
                  : `$${listing?.min_limit_usd||10} – $${listing?.max_limit_usd||1000} USD`},
                {label:'Time Limit',     value:`${listing?.time_limit||30} minutes`},
                {label:'Country',        value: (() => {
                  const raw = listing?.country_name || u.country || '';
                  if (!raw) return '—';
                  const cc = raw.slice(0,2).toUpperCase();
                  const flag = cc.replace(/./g,c=>String.fromCodePoint(0x1F1E6+c.charCodeAt(0)-65));
                  return `${flag} ${raw}`;
                })()},
              ].map(({label,value}) => (
                <div key={label} className="flex items-center justify-between px-3.5 py-3 border-b last:border-0"
                  style={{borderColor:C.g100}}>
                  <span className="text-xs font-semibold" style={{color:C.g500}}>{label}</span>
                  <span className="text-xs font-black text-right ml-4" style={{color:C.g800, maxWidth:'60%'}}>{value}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="p-4 flex gap-3 flex-shrink-0 border-t" style={{borderColor:C.g200}}>
          <button onClick={onClose}
            className="flex-1 py-3 rounded-2xl border text-sm font-bold hover:bg-gray-50 transition"
            style={{borderColor:C.g200, color:C.g600}}>
            Close
          </button>
          <button onClick={onTrade}
            className="flex-1 py-3 rounded-2xl text-white text-sm font-black flex items-center justify-center gap-2 shadow-md"
            style={{background:`linear-gradient(135deg,${C.sell},${C.gold})`}}>
            <span className="font-black">₮</span> Sell USDT
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════════
export default function SellUSDT({user}) {
  const navigate = useNavigate();
  const { rates: USD_RATES } = useRates();
  const _cacheAll = () => {
    try {
      const c = JSON.parse(localStorage.getItem('praqen_market_all') || 'null');
      if (c && Array.isArray(c.data)) return c.data;
    } catch {}
    return null;
  };
  const _buyNow   = () => { const a=_cacheAll(); return a?a.filter(l=>(l.listing_type==='BUY'||l.listing_type==='BUY_BITCOIN')):[]; };
  const [offers,       setOffers]       = useState(()=>_buyNow());
  const [loading,      setLoading]      = useState(()=>_buyNow().length===0);
  const [loadError,    setLoadError]    = useState(false);
  const [selCountry,    setSelCountry]    = useState(COUNTRIES[0]);
  const [countrySearch, setCountrySearch] = useState('');
  const [selPayment,    setSelPayment]    = useState('all');
  const [paymentSearch, setPaymentSearch] = useState('');
  const [showCountry,   setShowCountry]   = useState(false);
  const [showPayment,   setShowPayment]   = useState(false);
  const [showAssetMenu, setShowAssetMenu] = useState(false);
  const [showSellAssetMenu, setShowSellAssetMenu] = useState(false);
  const [cryptoFilter, setCryptoFilter] = useState('ALL'); // 'ALL' | 'BTC' | 'USDT'
  const [showCryptoMenu, setShowCryptoMenu] = useState(false);
  const [sortBy,       setSortBy]       = useState('rate_high');
  const [modal,        setModal]        = useState(null);
  const [sellAmt,      setSellAmt]      = useState('');
  const [activeTrades, setActiveTrades] = useState([]);
  const [userUsdtBalance, setUserUsdtBalance] = useState(0);
  const [showAllTrades, setShowAllTrades] = useState(false);
  const [traderSearch, setTraderSearch] = useState('');
  const [selCurrency,  setSelCurrency]  = useState(CURRENCIES[0]);
  const [showCurrency, setShowCurrency] = useState(false);
  const [currencySearch, setCurrencySearch] = useState('');
  const [liveStatus,   setLiveStatus]   = useState({});
  const currencyRef = useRef(null);
  const countryRef  = useRef(null);
  const paymentRef  = useRef(null);
  const [activeGuide, setActiveGuide] = useState(null);
  const guideTimer   = useRef(null);

  function handleGuideEnter(id) { clearTimeout(guideTimer.current); setActiveGuide(id); }
  function handleGuideLeave()   { guideTimer.current = setTimeout(() => setActiveGuide(null), 140); }

  const GUIDE_TOTAL = 4;
  function MarketGuide({ id, icon: Icon = Info, title, body, example, guideStep, align = 'left' }) {
    if (activeGuide !== id) return null;
    const isTab = id.startsWith('tab_');
    const isRightTab = id.includes('crypto') || id.includes('giftcards');
    const alignRight = isRightTab || align === 'right';

    const posStyle = {
      top: 'calc(100% + 8px)',
      maxHeight: 'calc(100vh - 24px)',
      ...(alignRight ? { right: 0, left: 'auto' } : { left: 0, right: 'auto' }),
    };

    return (
      <div style={{
        position: 'absolute',
        ...posStyle,
        zIndex: 10000,
        width: 'min(215px, calc(100vw - 24px))',
        maxWidth: 'calc(100vw - 24px)',
        background: 'linear-gradient(135deg,#1E40AF 0%,#2563EB 100%)',
        borderRadius: 12, padding: '8px 9px',
        boxShadow: '0 10px 36px rgba(37,99,235,0.30),0 2px 8px rgba(0,0,0,0.08)',
        animation: 'sellUsdtGuideFadeDown 0.2s ease both',
        pointerEvents: 'none',
        overflowY: 'auto',
        boxSizing: 'border-box', color: '#fff',
      }}>
        <style>{`
          @keyframes sellUsdtGuide{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
          @keyframes sellUsdtGuideFadeDown{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:translateY(0)}}
        `}</style>
        {guideStep && (
          <div style={{ marginBottom: 5 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
              <span style={{ background: 'rgba(255,255,255,0.25)', borderRadius: 20, padding: '1px 6px', fontSize: 8.5, fontWeight: 800, color: '#fff', letterSpacing: 0.5, textTransform: 'uppercase' }}>Step {guideStep} of {GUIDE_TOTAL}</span>
              <span style={{ fontSize: 8.5, color: 'rgba(255,255,255,0.6)', fontWeight: 600 }}>{Math.round((guideStep / GUIDE_TOTAL) * 100)}%</span>
            </div>
            <div style={{ height: 3, background: 'rgba(255,255,255,0.18)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ width: `${(guideStep / GUIDE_TOTAL) * 100}%`, height: '100%', background: 'rgba(255,255,255,0.75)', borderRadius: 2 }} />
            </div>
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 7 }}>
          <div style={{ width: 19, height: 19, borderRadius: '50%', background: 'rgba(255,255,255,0.22)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {guideStep ? <span style={{ fontWeight: 900, fontSize: 9.5, color: '#fff' }}>{guideStep}</span> : <Icon size={10} style={{ color: '#fff' }} />}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: '0 0 2px', fontWeight: 800, fontSize: 10.5, color: '#fff', lineHeight: 1.25 }}>{title}</p>
            <p style={{ margin: '0 0 4px', fontSize: 9.5, color: 'rgba(255,255,255,0.9)', lineHeight: 1.4 }}>{body}</p>
            {example && <div style={{ fontSize: 8.5, color: 'rgba(255,255,255,0.68)', fontStyle: 'italic', background: 'rgba(255,255,255,0.12)', borderRadius: 6, padding: '2px 7px', display: 'inline-block' }}>💡 {example}</div>}
          </div>
        </div>
      </div>
    );
  }

  const usdtPrice = 1;

  const selPmInfo  = PAYMENT_OPTIONS.find(p => p.value === selPayment);
  const hasFilters = selPayment !== 'all' || selCountry.code !== 'ALL' || selCurrency.code !== 'USD' || sortBy !== 'rate_high' || !!sellAmt || !!traderSearch;

  const loadListings = async (attempt = 1, force = false) => {
    if (attempt === 1 && !force) {
      try {
        const c = JSON.parse(localStorage.getItem('praqen_market_all') || 'null');
        if (c && Array.isArray(c.data) && c.data.length > 0) {
          const age = Date.now() - (c.ts || 0);
          const hasProfiles = c.data.some(l => l.users && (l.users.id || l.users.username));
          if (age < 300000 && hasProfiles) {
            const buyOffers = c.data.filter(l => (l.listing_type==='BUY'||l.listing_type==='BUY_BITCOIN'));
            if (buyOffers.length > 0) {
              setOffers(buyOffers);
              setLoading(false);
              return;
            }
          }
        }
      } catch {}
    }
    setLoading(true);
    setLoadError(false);
    const retryDelay = Math.min(2000 * Math.pow(2, attempt - 1), 15000);
    try {
      const r = await axios.get(`${API_URL}/listings`, { timeout: 15000 });
      const all = (r.data.listings || []).map(l => ({
        ...l, users: Array.isArray(l.users) ? l.users[0] : l.users,
      }));
      const data = all.filter(l => (l.listing_type==='BUY'||l.listing_type==='BUY_BITCOIN'));
      if (all.length > 0) {
        try { localStorage.setItem('praqen_market_all', JSON.stringify({ data: all, ts: Date.now() })); } catch {}
      }
      if (data.length > 0) {
        setOffers(data);
      } else if (!offers.length) {
        setOffers([]);
      }
      setLoading(false);
    } catch (err) {
      if (attempt < 3) {
        setTimeout(() => loadListings(attempt + 1, force), retryDelay);
      } else {
        try {
          const c = JSON.parse(localStorage.getItem('praqen_market_all') || 'null');
          if (c && Array.isArray(c.data)) {
            const buyOffers = c.data.filter(l => (l.listing_type==='BUY'||l.listing_type==='BUY_BITCOIN'));
            if (buyOffers.length > 0) {
              setOffers(buyOffers);
              toast.warn('Showing cached offers — server is busy. Prices may be outdated.', { autoClose: 6000 });
            }
          }
        } catch {}
        setLoading(false);
        if (!offers.length) setLoadError(true);
      }
    }
  };

  useEffect(() => {
    loadListings();
    const interval = setInterval(() => loadListings(1, true), 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const h = e => {
      if (currencyRef.current && !currencyRef.current.contains(e.target)){setShowCurrency(false);setCurrencySearch('');}
      if (countryRef.current && !countryRef.current.contains(e.target)){setShowCountry(false);setCountrySearch('');}
      if (paymentRef.current && !paymentRef.current.contains(e.target)){setShowPayment(false);setPaymentSearch('');}
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  useEffect(() => {
    if (offers.length === 0) return;
    const uids = [...new Set(offers.map(l => getUser(l.users)?.id).filter(Boolean))];
    if (uids.length === 0) return;
    const fetchStatus = async () => {
      try {
        const r = await axios.get(`${API_URL}/users/online-status?ids=${uids.join(',')}`, { timeout: 8000 });
        if (r.data?.status) setLiveStatus(r.data.status);
      } catch {}
    };
    fetchStatus();
    const iv = setInterval(fetchStatus, 30000);
    return () => clearInterval(iv);
  }, [offers]);

  // ── Fetch active trades ────────────────────────────────────────────────
  useEffect(() => {
    const tk = localStorage.getItem('token');
    if (!tk) return;
    const h = { Authorization: `Bearer ${tk}` };
    const toUTC = s => new Date(/[Z+]/.test(s) ? s : s + 'Z');
    const fetchTrades = () => axios.get(`${API_URL}/trades/active`, { headers: h }).then(res => {
      if (res.data.success) {
        const now = Date.now();
        setActiveTrades((res.data.trades||[]).filter(t =>
          ['PAYMENT_SENT','DISPUTED'].includes(t.status) ||
          !t.expires_at || toUTC(t.expires_at).getTime() > now
        ));
      }
    }).catch(() => {});
    Promise.all([
      axios.post(`${API_URL}/users/heartbeat`, {}, { headers: h }).catch(() => {}),
      fetchTrades(),
    ]);
  }, []);

  // ── Own USDT balance — drives the getting-started guide ────────────────────
  useEffect(() => {
    const tk = localStorage.getItem('token');
    if (!tk) return;
    axios.get(`${API_URL}/wallet/usdt`, { headers: { Authorization: `Bearer ${tk}` } })
      .then(r => setUserUsdtBalance(parseFloat(r.data?.balance_usdt || 0)))
      .catch(() => {});
  }, []);

  // ── Auto-detect country + currency on first load ───────────────────────────
  useEffect(() => {
    const applyCountry = (cc) => {
      const code = (cc || '').toUpperCase().slice(0, 2);
      const matched = COUNTRIES.find(c => c.code === code);
      if (!matched || matched.code === 'ALL') return false;
      setSelCountry(matched);
      const curMatch = CURRENCIES.find(c => c.code === matched.currency);
      if (curMatch) setSelCurrency(curMatch);
      return true;
    };
    if (user) {
      const cc = user.country_code || (user.country?.length <= 3 ? user.country : null) || '';
      if (applyCountry(cc)) return;
    }
    const detected = sessionStorage.getItem('praqen_geo');
    if (detected) {
      try {
        const { countryCode } = JSON.parse(detected);
        applyCountry(countryCode);
      } catch {}
      return;
    }
    const geoController = new AbortController();
    const geoTimeout = setTimeout(() => geoController.abort(), 3000);
    fetch('https://ipapi.co/json/', { signal: geoController.signal })
      .then(r => r.json())
      .then(data => {
        const countryCode = (data.country_code || '').toUpperCase();
        sessionStorage.setItem('praqen_geo', JSON.stringify({ countryCode }));
        applyCountry(countryCode);
      })
      .catch(() => {})
      .finally(() => clearTimeout(geoTimeout));
  }, []);

  const handleTradeExpire = (id) => setActiveTrades(prev => prev.filter(t =>
    t.id !== id ||
    ['PAYMENT_SENT','DISPUTED'].includes(t.status) ||
    !t.expires_at
  ));

  const filtered = offers.filter(l => {
    const asset = (l.asset || 'BTC').toUpperCase();
    if (cryptoFilter === 'BTC' && asset !== 'BTC') return false;
    if (cryptoFilter === 'USDT' && asset !== 'USDT') return false;
    const cur = (l.currency || 'USD').toUpperCase();
    const pm  = (l.payment_method || '').toLowerCase();
    if (selCountry.code !== 'ALL' && (l.country || '').toUpperCase() !== selCountry.code) return false;
    if (selCurrency.code !== 'USD' && cur !== selCurrency.code) return false;
    if (selPayment !== 'all' && pm !== selPayment && !pm.includes(selPayment)) return false;
    if (traderSearch && !getDisplayName(l.users).toLowerCase().includes(traderSearch.toLowerCase())) return false;
    if (sellAmt && parseFloat(sellAmt) > 0) {
      const amt = parseFloat(sellAmt);
      const mx  = parseFloat(l.max_limit_local || l.max_limit_usd * (USD_RATES[cur] || 1) || Infinity);
      const mn  = parseFloat(l.min_limit_local || l.min_limit_usd * (USD_RATES[cur] || 1) || 0);
      if (amt > mx || amt < mn) return false;
    }
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === 'rate_low')  return (a.margin || 0) - (b.margin || 0);
    if (sortBy === 'rate_high') return (b.margin || 0) - (a.margin || 0);
    return 0;
  });

  const handleCreateOffer = () => {
    if (!user) { navigate('/login?message=Please log in to create an offer'); return; }
    navigate('/create-offer');
  };

  const handleSell = (id) => {
    if (!user) {
      navigate('/login?message=Please log in to start trading');
      return;
    }
    const listing = offers.find(l => l.id === id);
    if (listing) {
      setModal({ type: 'buyer', buyer: listing.users, listing });
    }
  };

  const cur = selCurrency.code;
  const sym = selCurrency.symbol;
  const usdRate = USD_RATES[cur] || 1;

  return (
    <div className="min-h-screen flex flex-col"
      style={{backgroundColor:C.g100, fontFamily:"'DM Sans',sans-serif"}}>
      <SEO
        title="Sell USDT for Local Currency | PRAQEN P2P Marketplace"
        description="Sell USDT (Tether) to verified buyers and get paid in local currency — mobile money, bank transfer, and more on PRAQEN."
        url="/sell-usdt"
      />

      {/* ══ 1. RATE BAR ════════════════════════════════════════ */}
      <div style={{backgroundColor:C.forest}} className="w-full flex-shrink-0">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 py-3 sm:py-3.5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-base sm:text-xl md:text-3xl font-black text-white leading-tight mb-1.5">
                Sell USDT for{' '}
                <span style={{color:C.gold}}>
                  {selPayment==='all' ? 'Local Currency' : (selPmInfo?.label || 'Mobile Money')}
                </span>
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-semibold" style={{color:'rgba(255,255,255,0.5)'}}>
                  1 USDT ≈ <span className="font-black" style={{color:'rgba(255,255,255,0.9)'}}>${fmt(usdtPrice,2)} USD</span>
                </span>
                <span style={{color:'rgba(255,255,255,0.2)', fontSize:10}}>|</span>
                <span className="text-xs font-semibold" style={{color:'rgba(255,255,255,0.5)'}}>
                  1 USD = <span className="font-black" style={{color:'rgba(255,255,255,0.75)'}}>
                    {cur==='USD' ? `₵${fmt(USD_RATES['GHS']||1,2)} GHS` : `${sym}${fmt(usdRate,2)} ${cur}`}
                  </span>
                </span>
              </div>
            </div>
            <button onClick={() => loadListings(1, true)}
              className="w-9 h-9 rounded-xl flex items-center justify-center transition hover:bg-white/20 flex-shrink-0"
              style={{backgroundColor:'rgba(255,255,255,0.1)'}}>
              <RefreshCw size={15} className={`text-white ${loading?'animate-spin':''}`}/>
            </button>
          </div>
        </div>
      </div>

      {/* ══ 2. TAB NAVIGATION ══════════════════════════════════ */}
      <div className="bg-white border-b sticky z-30 flex-shrink-0" style={{top:'var(--navbar-h)',borderColor:C.g200}}>
        <div className="flex w-full">
          <div className="flex-1">
            <button onClick={()=>navigate('/buy-usdt')}
              className="w-full text-center py-3 text-xs font-black border-b-2 border-transparent transition-all"
              style={{color:C.g400}}>
              Buy
            </button>
          </div>

          <div className="flex-1">
            <button
              className="w-full text-center py-3 text-xs font-black border-b-2 transition-all"
              style={{borderColor:C.sell, color:C.sell, backgroundColor:`${C.sell}18`}}>
              Sell
            </button>
          </div>

          {/* ── 3rd Dropdown: Crypto Filter (All Crypto / BTC / USDT) ── */}
          <div className="flex-1 relative">
            <button onClick={() => setShowCryptoMenu(v => !v)}
              className="w-full text-center py-3 text-xs font-black border-b-2 border-transparent transition-all flex items-center justify-center gap-1.5"
              style={{ color: cryptoFilter === 'ALL' ? C.sell : C.g700 }}>
              {cryptoFilter === 'ALL' && <span className="text-xs">🪙</span>}
              {cryptoFilter === 'BTC' && <span className="w-4 h-4 rounded-full flex items-center justify-center font-black text-[10px] text-white" style={{ background: 'linear-gradient(135deg,#F7931A,#e8830a)' }}>₿</span>}
              {cryptoFilter === 'USDT' && <span className="w-4 h-4 rounded-full flex items-center justify-center font-black text-[10px] text-white" style={{ background: '#26A17B' }}>₮</span>}
              <span>{cryptoFilter === 'ALL' ? 'All Crypto' : cryptoFilter}</span>
              <ChevronDown size={12} className={`transition-transform ${showCryptoMenu ? 'rotate-180' : ''}`} />
            </button>
            {showCryptoMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowCryptoMenu(false)} />
                <div className="absolute right-0 sm:left-1/2 sm:-translate-x-1/2 top-full mt-1.5 w-56 rounded-2xl border shadow-xl overflow-hidden z-50 bg-white"
                  style={{ borderColor: C.g200 }}>
                  <button onClick={() => { setCryptoFilter('ALL'); setShowCryptoMenu(false); }}
                    className="w-full flex items-center gap-2.5 px-3.5 py-3 text-left hover:bg-gray-50 transition"
                    style={{ backgroundColor: cryptoFilter === 'ALL' ? 'rgba(217,119,6,0.08)' : 'transparent' }}>
                    <span className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 font-black text-xs text-white"
                      style={{ background: 'linear-gradient(135deg, #D97706, #F59E0B)' }}>🌐</span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-xs font-black" style={{ color: C.g800 }}>All Crypto</span>
                      <span className="block text-[10px] font-semibold" style={{ color: C.g400 }}>Show both BTC & USDT offers</span>
                    </span>
                    {cryptoFilter === 'ALL' && <CheckCircle size={14} style={{ color: C.sell, flexShrink: 0 }} />}
                  </button>

                  <button onClick={() => { setCryptoFilter('BTC'); setShowCryptoMenu(false); }}
                    className="w-full flex items-center gap-2.5 px-3.5 py-3 text-left hover:bg-gray-50 transition border-t"
                    style={{ borderColor: C.g100, backgroundColor: cryptoFilter === 'BTC' ? 'rgba(247,147,26,0.08)' : 'transparent' }}>
                    <span className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 font-black text-xs text-white"
                      style={{ background: 'linear-gradient(135deg,#F7931A,#e8830a)' }}>₿</span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-xs font-black" style={{ color: C.g800 }}>Bitcoin</span>
                      <span className="block text-[10px] font-semibold" style={{ color: C.g400 }}>BTC offers only</span>
                    </span>
                    {cryptoFilter === 'BTC' && <CheckCircle size={14} style={{ color: '#e8830a', flexShrink: 0 }} />}
                  </button>

                  <button onClick={() => { setCryptoFilter('USDT'); setShowCryptoMenu(false); }}
                    className="w-full flex items-center gap-2.5 px-3.5 py-3 text-left hover:bg-gray-50 transition border-t"
                    style={{ borderColor: C.g100, backgroundColor: cryptoFilter === 'USDT' ? 'rgba(38,161,123,0.08)' : 'transparent' }}>
                    <span className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 font-black text-xs text-white"
                      style={{ background: '#26A17B' }}>₮</span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-xs font-black" style={{ color: C.g800 }}>Tether</span>
                      <span className="block text-[10px] font-semibold" style={{ color: C.g400 }}>USDT offers only</span>
                    </span>
                    {cryptoFilter === 'USDT' && <CheckCircle size={14} style={{ color: '#26A17B', flexShrink: 0 }} />}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Getting-started guide — shown to logged-in users who haven't funded their wallet yet */}
      {user && userUsdtBalance < 10 && <GettingStartedSteps userId={user.id} />}

      {/* ══ 3. FILTER BAR ══════════════════════════════════════ */}
      <div className="bg-white border-b flex-shrink-0" style={{borderColor:C.g200}}>
        <div className="max-w-7xl mx-auto px-3 py-3 space-y-2">

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">

            <div style={{ position: 'relative' }}
              onMouseEnter={() => handleGuideEnter('usdt_sell_amount')} onMouseLeave={handleGuideLeave}>
              <MarketGuide id="usdt_sell_amount" icon={Coins} guideStep={1}
                title="Trade Amount"
                body="Enter how much USDT you want to sell. The list filters to buyers who accept orders of your size."
                example="Type 100 to find buyers purchasing $100+ USDT" />
              <p className="text-xs font-black mb-1 tracking-wide" style={{color:C.g500}}>AMOUNT</p>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-black pointer-events-none select-none"
                  style={{color:sellAmt?C.sell:C.g400}}>{sym}</span>
                <input
                  type="number" min="0" placeholder="e.g. 50"
                  value={sellAmt}
                  onChange={e=>setSellAmt(e.target.value)}
                  onFocus={()=>handleGuideEnter('usdt_sell_amount')} onBlur={handleGuideLeave}
                  className="w-full pl-6 pr-7 py-2.5 rounded-xl border-2 font-black focus:outline-none"
                  style={{borderColor:sellAmt?C.sell:C.g200, color:C.g800, backgroundColor:sellAmt?`${C.sell}08`:'transparent', fontSize:'16px'}}
                />
                {sellAmt&&(
                  <button onClick={()=>setSellAmt('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center rounded-full"
                    style={{backgroundColor:C.g200}}>
                    <X size={9} style={{color:C.g600}}/>
                  </button>
                )}
              </div>
            </div>

            <div className="relative" ref={currencyRef}
              onMouseEnter={() => handleGuideEnter('usdt_sell_currency')} onMouseLeave={handleGuideLeave}>
              {!showCurrency && (
                <MarketGuide id="usdt_sell_currency" icon={CreditCard} guideStep={2} align="right"
                  title="Currency"
                  body="Choose the currency you want to receive payment in."
                  example="GHS for Ghana · NGN for Nigeria · KES for Kenya" />
              )}
              <p className="text-xs font-black mb-1 tracking-wide" style={{color:C.g500}}>CURRENCY</p>
              <button
                onFocus={()=>handleGuideEnter('usdt_sell_currency')} onBlur={handleGuideLeave}
                onClick={()=>{setShowCurrency(!showCurrency);setShowCountry(false);setShowPayment(false);}}
                className="w-full flex items-center gap-1.5 px-2.5 py-2.5 rounded-xl border-2 font-bold transition"
                style={{
                  borderColor:     selCurrency.code!=='USD' ? C.sell : C.g200,
                  color:           selCurrency.code!=='USD' ? C.sell : C.g600,
                  backgroundColor: selCurrency.code!=='USD' ? `${C.sell}08` : 'transparent',
                }}>
                <span className="text-xs font-black flex-shrink-0">{selCurrency.symbol}</span>
                <span className="text-xs font-black flex-1 text-left truncate">{selCurrency.code}</span>
                <ChevronDown size={11} className={`transition-transform flex-shrink-0 ${showCurrency?'rotate-180':''}`}
                  style={{color:selCurrency.code!=='USD' ? C.sell : C.g400}}/>
              </button>
              {showCurrency && (
                <div className="absolute top-full right-0 mt-1.5 bg-white rounded-2xl shadow-2xl z-50 border overflow-hidden"
                  style={{borderColor:C.g100,minWidth:'220px',maxWidth:'calc(100vw - 24px)'}}>
                  <div className="p-2 border-b sticky top-0 bg-white" style={{borderColor:C.g100}}>
                    <input type="text" placeholder="Search currency…"
                      value={currencySearch} onChange={e=>setCurrencySearch(e.target.value)}
                      autoFocus
                      className="w-full px-3 py-1.5 font-semibold rounded-xl border focus:outline-none"
                      style={{borderColor:C.g200,color:C.g800,fontSize:'16px'}}/>
                  </div>
                  <div className="overflow-y-auto max-h-56">
                    {CURRENCIES.filter(c=>!currencySearch||c.code.toLowerCase().includes(currencySearch.toLowerCase())||c.name.toLowerCase().includes(currencySearch.toLowerCase())).map(c=>(
                      <button key={c.code} onClick={()=>{setSelCurrency(c);setShowCurrency(false);setCurrencySearch('');}}
                        className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-gray-50 border-b last:border-0 transition"
                        style={{borderColor:C.g50,backgroundColor:selCurrency.code===c.code?`${C.sell}08`:'transparent'}}>
                        <span className="text-sm font-black flex-shrink-0 w-8 text-center" style={{color:C.g700}}>{c.symbol}</span>
                        <div className="flex-1 text-left min-w-0">
                          <p className="font-bold text-xs" style={{color:C.g800}}>{c.code}</p>
                          <p className="text-xs truncate" style={{color:C.g400}}>{c.name}</p>
                        </div>
                        {selCurrency.code===c.code&&<CheckCircle size={11} style={{color:C.sell,flexShrink:0}}/>}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="relative" ref={paymentRef}>
              <p className="text-xs font-black mb-1 tracking-wide" style={{color:C.g500}}>PAYMENT</p>
              <button
                onClick={()=>{setShowPayment(!showPayment);setShowCurrency(false);setShowCountry(false);}}
                className="w-full flex items-center gap-1.5 px-2.5 py-2.5 rounded-xl border-2 font-bold transition"
                style={{
                  borderColor:     selPayment!=='all' ? C.sell : C.g200,
                  color:           selPayment!=='all' ? C.sell : C.g600,
                  backgroundColor: selPayment!=='all' ? `${C.sell}08` : 'transparent',
                }}>
                <span className="text-sm leading-none flex-shrink-0">{selPmInfo?.icon||<CreditCard size={14} className="inline-block"/>}</span>
                <span className="text-xs font-black truncate flex-1 text-left">
                  {selPayment==='all' ? 'All Methods' : (selPmInfo?.label||'All Methods')}
                </span>
                <ChevronDown size={11} className={`transition-transform flex-shrink-0 ${showPayment?'rotate-180':''}`}
                  style={{color:selPayment!=='all' ? C.sell : C.g400}}/>
              </button>
              {showPayment && (
                <div className="absolute top-full left-0 mt-1.5 bg-white rounded-2xl shadow-2xl z-50 border overflow-hidden"
                  style={{borderColor:C.g100,minWidth:'220px',maxWidth:'calc(100vw - 24px)'}}>
                  <div className="p-2 border-b sticky top-0 bg-white" style={{borderColor:C.g100}}>
                    <input type="text" placeholder="Search payment…"
                      value={paymentSearch} onChange={e=>setPaymentSearch(e.target.value)}
                      autoFocus
                      className="w-full px-3 py-1.5 font-semibold rounded-xl border focus:outline-none"
                      style={{borderColor:C.g200,color:C.g800,fontSize:'16px'}}/>
                  </div>
                  <div className="overflow-y-auto max-h-56">
                  {(() => {
                    const q = paymentSearch.toLowerCase();
                    let lastCat = null;
                    return PAYMENT_OPTIONS.filter(p=>!q||p.label.toLowerCase().includes(q)||p.value.toLowerCase().includes(q)).map(p => {
                      const catHeader = !q && p.cat && p.cat !== lastCat ? (lastCat = p.cat, (
                        <div key={`h-${p.cat}`} className="px-3 py-1" style={{backgroundColor:'#F8FAFC'}}>
                          <span className="text-xs font-black uppercase tracking-wider" style={{color:PM_CAT_COLORS[p.cat]||C.g500}}>{p.cat}</span>
                        </div>
                      )) : (lastCat = p.cat || lastCat, null);
                      return [catHeader, (
                        <button key={p.value} onClick={()=>{setSelPayment(p.value);setShowPayment(false);setPaymentSearch('');}}
                          className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 transition"
                          style={{backgroundColor:selPayment===p.value?`${C.sell}08`:'transparent'}}>
                          <span className="text-sm flex-shrink-0">{p.icon}</span>
                          <span className="flex-1 text-left font-semibold text-xs leading-tight" style={{color:C.g800}}>{p.label}</span>
                          {selPayment===p.value && <CheckCircle size={11} style={{color:C.sell,flexShrink:0}}/>}
                        </button>
                      )];
                    });
                  })()}
                  </div>
                </div>
              )}
            </div>

            <div className="relative" ref={countryRef}>
              <p className="text-xs font-black mb-1 tracking-wide" style={{color:C.g500}}>COUNTRY</p>
              <button
                onClick={()=>{setShowCountry(!showCountry);setShowCurrency(false);setShowPayment(false);}}
                className="w-full flex items-center gap-1.5 px-2.5 py-2.5 rounded-xl border-2 font-bold transition"
                style={{
                  borderColor:     selCountry.code!=='ALL' ? C.sell : C.g200,
                  color:           selCountry.code!=='ALL' ? C.sell : C.g600,
                  backgroundColor: selCountry.code!=='ALL' ? `${C.sell}08` : 'transparent',
                }}>
                <span className="text-sm leading-none flex-shrink-0">{selCountry.flag}</span>
                <span className="text-xs font-black truncate flex-1 text-left">{selCountry.name}</span>
                <ChevronDown size={11} className={`transition-transform flex-shrink-0 ${showCountry?'rotate-180':''}`}
                  style={{color:selCountry.code!=='ALL' ? C.sell : C.g400}}/>
              </button>
              {showCountry && (
                <div className="absolute top-full right-0 mt-1.5 bg-white rounded-2xl shadow-2xl z-50 border overflow-hidden"
                  style={{borderColor:C.g100,minWidth:'240px',maxWidth:'calc(100vw - 24px)'}}>
                  <div className="p-2 border-b sticky top-0 bg-white" style={{borderColor:C.g100}}>
                    <input type="text" placeholder="Search country…"
                      value={countrySearch} onChange={e=>setCountrySearch(e.target.value)}
                      autoFocus
                      className="w-full px-3 py-1.5 font-semibold rounded-xl border focus:outline-none"
                      style={{borderColor:C.g200,color:C.g800,fontSize:'16px'}}/>
                  </div>
                  <div className="overflow-y-auto max-h-60">
                    {(() => {
                      const q = countrySearch.toLowerCase();
                      const filteredC = COUNTRIES.filter(c=>!q||c.name.toLowerCase().includes(q));
                      let lastReg = null;
                      return filteredC.map(c=>{
                        const regHdr = !q && c.region && c.region!==lastReg
                          ? (lastReg=c.region, <div key={`r-${c.region}`} className="px-3 py-1" style={{backgroundColor:'#F8FAFC'}}>
                              <span className="text-xs font-black uppercase tracking-wider" style={{color:COUNTRY_REGIONS[c.region]||C.g500}}>{c.region}</span>
                            </div>)
                          : (c.region&&(lastReg=c.region), null);
                        return [regHdr,
                          <button key={c.code} onClick={()=>{setSelCountry(c);setShowCountry(false);setCountrySearch('');if(c.currency){const matched=CURRENCIES.find(curr=>curr.code===c.currency);if(matched)setSelCurrency(matched);}}}
                            className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-gray-50 border-b last:border-0 transition"
                            style={{borderColor:C.g50,backgroundColor:selCountry.code===c.code?`${C.sell}08`:'transparent'}}>
                            <span className="text-base flex-shrink-0">{c.flag}</span>
                            <div className="flex-1 text-left min-w-0">
                              <p className="font-bold text-xs truncate" style={{color:C.g800}}>{c.name}</p>
                              {c.currency&&<p className="text-xs" style={{color:C.g400}}>{c.symbol} {c.currency}</p>}
                            </div>
                            {selCountry.code===c.code&&<CheckCircle size={11} style={{color:C.sell,flexShrink:0}}/>}
                          </button>
                        ];
                      });
                    })()}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-black flex-shrink-0" style={{color:C.g500}}>Sort:</span>
            <select value={sortBy} onChange={e=>setSortBy(e.target.value)}
              className="flex-shrink-0 px-2 py-2 font-bold border-2 rounded-xl focus:outline-none"
              style={{borderColor:sortBy!=='rate_high'?C.sell:C.g200, color:C.g800, fontSize:'13px', width:'105px'}}>
              <option value="rate_low">Rate: Low</option>
              <option value="rate_high">Rate: High</option>
            </select>
            <div className="flex-1 min-w-0 flex items-center border-2 rounded-xl overflow-hidden"
              style={{borderColor:traderSearch.trim()?C.sell:C.g200}}>
              <input
                type="text"
                placeholder="Search buyer…"
                value={traderSearch}
                onChange={e=>setTraderSearch(e.target.value)}
                className="flex-1 min-w-0 px-2.5 py-2 font-bold focus:outline-none bg-transparent"
                style={{color:C.g800, fontSize:'16px'}}/>
              {traderSearch.trim()&&(
                <button onClick={()=>setTraderSearch('')} className="px-2 flex-shrink-0" style={{color:C.g400}}>
                  <X size={12}/>
                </button>
              )}
            </div>
            <button onClick={()=>handleCreateOffer()}
              className="flex-shrink-0 flex items-center gap-1 px-2.5 py-2 rounded-xl text-white font-black text-xs transition hover:opacity-90 active:scale-[0.97]"
              style={{backgroundColor:C.sell, whiteSpace:'nowrap'}}>
              <PlusCircle size={12}/> Create
            </button>
            {hasFilters && (
              <button onClick={()=>{setSellAmt('');setSelPayment('all');setSelCountry(COUNTRIES[0]);setSelCurrency(CURRENCIES[0]);setSortBy('rate_high');setPaymentSearch('');setTraderSearch('');setCurrencySearch('');setCountrySearch('');}}
                className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-xl text-xs font-black border-2 transition"
                style={{borderColor:C.danger, color:C.danger, backgroundColor:'#FEF2F2'}}>
                <X size={14}/>
              </button>
            )}
          </div>

        </div>
      </div>

      {/* ── Inline active trade cards ── */}
      {activeTrades.length > 0 && (
        <div className="px-3 mb-2 max-w-7xl mx-auto w-full">
          {activeTrades.slice(0, showAllTrades ? activeTrades.length : 3).map(trade => (
            <ActiveTradeCard key={trade.id} trade={trade} pageColor="#D97706" onExpire={handleTradeExpire} />
          ))}
          {activeTrades.length > 3 && (
            <button onClick={() => setShowAllTrades(p => !p)}
              className="w-full text-xs font-semibold py-1.5 rounded-xl border mb-1"
              style={{color:'#92400E', borderColor:'#F59E0B', backgroundColor:'#FFFBEB'}}>
              {showAllTrades ? 'Show less ▲' : `Show all (${activeTrades.length}) ▼`}
            </button>
          )}
        </div>
      )}

      {/* ══ 4. OFFER GRID ══════════════════════════════════════ */}
      <div className="max-w-7xl mx-auto w-full px-3 pt-2 pb-3 space-y-3">

        <div className="flex items-center justify-between flex-wrap gap-2">
          {(() => {
            const onlineCount = sorted.filter(l => {
              const seen = liveStatus[l.users?.id] || l.users?.last_seen_at;
              return seen && (Date.now() - new Date(seen)) < 5 * 60 * 1000;
            }).length;
            return (
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full animate-pulse flex-shrink-0"
                    style={{backgroundColor:C.online, boxShadow:`0 0 0 3px ${C.online}30`}}/>
                  <span className="text-xs font-black" style={{color:C.online}}>{onlineCount} online</span>
                </div>
                <span style={{color:C.g300, fontSize:10}}>·</span>
                <span className="text-xs font-semibold" style={{color:C.g500}}>
                  <span className="font-black" style={{color:C.g800}}>{sorted.length}</span> active offer{sorted.length!==1?'s':''}
                  {selCountry.code!=='ALL' ? ` in ${selCountry.flag} ${selCountry.name}` : ''}
                </span>
              </div>
            );
          })()}
        </div>

        {(loading && !offers.length) ? (
          <div className="bg-white rounded-2xl border p-8 text-center" style={{borderColor:C.g200}}>
            <Loader2 size={48} className="animate-spin mx-auto" style={{color:C.sell}}/>
            <p className="font-black text-base mb-1" style={{color:C.g800}}>Loading offers…</p>
            <p className="text-sm" style={{color:C.g400}}>Fetching the latest offers for you</p>
            <div className="flex justify-center mt-4">
              <div className="w-8 h-8 border-4 rounded-full animate-spin" style={{borderColor:`${C.sell}40`, borderTopColor:'transparent'}}/>
            </div>
          </div>
        ) : loadError && !offers.length ? (
          <div className="bg-white rounded-2xl border p-8 text-center" style={{borderColor:C.g200}}>
            <WifiOff size={48} className="mx-auto" style={{color:C.g300}}/>
            <p className="font-black text-base mb-1" style={{color:C.g800}}>Couldn't load offers</p>
            <p className="text-sm mb-4" style={{color:C.g400}}>Server may be busy. Please try again.</p>
            <button onClick={()=>{ setLoading(true); loadListings(1, true); }}
              className="px-6 py-2.5 rounded-xl text-white text-sm font-black hover:opacity-90 transition flex items-center gap-2 mx-auto"
              style={{backgroundColor:C.sell}}>
              <RefreshCw size={14}/> Try Again
            </button>
          </div>
        ) : sorted.length === 0 ? (
          <div className="bg-white rounded-2xl border p-6 sm:p-10 text-center" style={{borderColor:C.g200}}>
            <Search size={48} className="mx-auto" style={{color:C.g300}}/>
            <p className="font-black text-base mb-1" style={{color:C.g800}}>No USDT buy offers found</p>
            <p className="text-sm" style={{color:C.g400}}>No USDT buy offers yet. Be the first to list a USDT offer.</p>
            <button onClick={()=>handleCreateOffer()}
              className="mt-4 px-6 py-2.5 rounded-xl text-white text-sm font-black hover:opacity-90 transition"
              style={{backgroundColor:C.sell}}>
              + Create USDT Offer
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 w-full">
            {sorted.map(l=>(
              <div key={l.id} className="w-full">
                <OfferCard
                  listing={l}
                  usdtPriceUSD={usdtPrice}
                  userSellAmt={sellAmt}
                  featuredType={null}
                  liveSeenAt={liveStatus[getUser(l.users)?.id] || null}
                  onViewBuyer={()=>{
                    setModal({type:'buyer', buyer:l.users, listing:l});
                    axios.post(`${API_URL}/listings/${l.id}/view`).catch(()=>{});
                  }}
                  onSell={()=>handleSell(l.id)}
                  liked={false}
                  onToggleLike={()=>{}}
                />
              </div>
            ))}
          </div>
        )}
{/* ── Sell Safety Banner ── */}
<div style={{display:'flex',alignItems:'center',gap:11,padding:'13px 15px',borderRadius:12,background:'linear-gradient(135deg,#FFFBEB,#FEF3C7)',border:'1.5px solid #FCD34D',boxShadow:'0 2px 8px rgba(217,119,6,0.12)'}}>
  <div style={{width:34,height:34,borderRadius:9,background:'#FDE68A',border:'1px solid #FCD34D',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
    <AlertTriangle size={17} style={{color:'#B45309'}}/>
  </div>
  <div>
    <p style={{margin:0,fontSize:13,fontWeight:900,color:'#92400E',lineHeight:1.3}}>Sell Safely</p>
    <p style={{margin:0,fontSize:11,color:'#92400E',fontWeight:600,lineHeight:1.4,marginTop:1}}>Never release USDT before confirming payment. All trades are escrow-protected.</p>
  </div>
</div>

{/* ── USDT AFFILIATE SECTION — full parity, sell-page amber/gold theme ── */}
<div style={{borderRadius:16,overflow:'hidden',boxShadow:'0 6px 28px rgba(180,83,9,0.2)'}}>

  {/* Header — amber/brown, distinct from Buy's teal so Sell stays visually differentiated */}
  <div style={{padding:'20px 18px 18px',background:'linear-gradient(135deg,#92400E,#D97706)',position:'relative',overflow:'hidden'}}>
    <div style={{position:'absolute',inset:0,opacity:0.08,backgroundImage:'radial-gradient(circle at 2px 2px,white 1px,transparent 0)',backgroundSize:'18px 18px'}}/>
    <div style={{position:'absolute',top:-30,right:-20,width:140,height:140,borderRadius:'50%',background:C.gold,opacity:0.15,filter:'blur(40px)'}}/>
    <div style={{position:'relative',display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}>
      <div>
        <div style={{display:'flex',alignItems:'center',gap:7,marginBottom:8}}>
          <span style={{display:'flex',alignItems:'center',gap:4,fontSize:11,fontWeight:900,color:'#92400E',background:C.gold,borderRadius:6,padding:'3px 9px',letterSpacing:0.5,textTransform:'uppercase'}}>
            ₮ USDT Affiliate
          </span>
          <span style={{display:'flex',alignItems:'center',gap:4,fontSize:9,fontWeight:700,color:'#fff',background:'rgba(255,255,255,0.15)',borderRadius:5,padding:'2px 8px'}}>
            <span style={{width:6,height:6,borderRadius:'50%',background:'#6EE7B7',display:'inline-block'}}/>LIVE
          </span>
        </div>
        <p style={{margin:0,fontSize:20,fontWeight:900,color:'#fff',lineHeight:1.2}}>Earn USDT on every referral trade.</p>
        <p style={{margin:0,fontSize:12,color:'rgba(255,255,255,0.75)',marginTop:5,fontWeight:500}}>Share your link — your earnings are paid in USDT, for life.</p>
      </div>
      <button onClick={()=>navigate(user ? '/dashboard?tab=affiliate' : '/register')}
        style={{flexShrink:0,padding:'12px 20px',borderRadius:11,border:'none',cursor:'pointer',background:C.gold,color:'#92400E',fontWeight:900,fontSize:13,whiteSpace:'nowrap',boxShadow:'0 4px 16px rgba(244,164,34,0.45)'}}>
        Get Link <ArrowRight size={14} style={{display:'inline',marginLeft:4,verticalAlign:'-2px'}}/>
      </button>
    </div>
  </div>

  {/* Commission tiers — single amber-family progression */}
  <div style={{padding:'12px 16px',background:'#fff',borderBottom:`1px solid ${C.g100}`}}>
    <p style={{margin:'0 0 8px',fontSize:10,fontWeight:800,color:C.g500,textTransform:'uppercase',letterSpacing:0.8}}>Commission Tiers</p>
    <div style={{position:'relative'}}>
      <div style={{display:'flex',gap:6,overflowX:'auto',paddingBottom:2}}>
        {[
          {refs:'0–9',   rate:'0.20%', c:'#FCD34D'},
          {refs:'10–24', rate:'0.25%', c:'#F59E0B'},
          {refs:'25–49', rate:'0.35%', c:'#D97706'},
          {refs:'50–99', rate:'0.40%', c:'#B45309'},
          {refs:'100+',  rate:'0.50%', c:'#92400E'},
        ].map(t=>(
          <div key={t.refs} style={{flex:'0 0 auto',background:`${t.c}0D`,border:`1.5px solid ${t.c}30`,borderRadius:10,padding:'9px 12px',textAlign:'center',minWidth:58}}>
            <div style={{fontSize:14,fontWeight:900,color:t.c,lineHeight:1}}>{t.rate}</div>
            <div style={{fontSize:9,color:C.g400,fontWeight:600,marginTop:3,lineHeight:1}}>{t.refs} refs</div>
          </div>
        ))}
      </div>
      <div style={{position:'absolute',top:0,right:0,bottom:2,width:24,background:'linear-gradient(to right, transparent, #ffffff)',pointerEvents:'none'}}/>
    </div>
  </div>

  <div style={{padding:'10px 16px',textAlign:'center',background:'#fff'}}>
    <p style={{margin:0,fontSize:10,color:C.g400,fontWeight:600}}>Free to join · No minimum payout · Lifetime commission</p>
  </div>
</div>

      </div>

      <PRQFooter/>

      {modal && (
        <BuyerModal
          buyer={modal.buyer}
          listing={modal.listing}
          usdtPriceUSD={usdtPrice}
          onClose={()=>setModal(null)}
          onTrade={()=>handleSell(modal.listing?.id)}
        />
      )}
    </div>
  );
}
