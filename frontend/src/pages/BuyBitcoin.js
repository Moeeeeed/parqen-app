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
  Phone, Mail, Ban, ArrowUp, ArrowDown, Trophy, Crown, Zap, Flame,
  CreditCard, Smartphone, Waves, Circle, Send, Apple, Diamond, Globe,
  Building2, Landmark, LinkIcon, Layers, Sparkles, Banknote, Hexagon,
  Moon, Rocket, Star, Search, SearchX, Hourglass, ServerCrash,
  Siren, MessageSquare, ShieldCheck, Leaf,
} from 'lucide-react';
import { toast } from 'react-toastify';
import CountryFlag, { resolveCode } from '../components/CountryFlag';
import { BadgeChip, BADGE_COLORS } from '../lib/badge';
import ActiveTradeCard from '../components/ActiveTradeCard';
import PRQFooter from '../components/PRQFooter';
import GettingStartedSteps from '../components/GettingStartedSteps';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const C = {
  forest:'#1B4332', green:'#2D6A4F', mint:'#40916C',
  gold:'#F4A422', mist:'#F0FAF5', white:'#FFFFFF',
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
  {code:'ALL', name:'All Countries',  flag:<Globe size={15} className="inline-block align-middle" />, currency:'USD', symbol:'$',    region:null},
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
  {code:'MZ',  name:'Mozambique',     flag:'🇲🇿', currency:'MZN', symbol:'MT',   region:'Africa'},
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
  {value:'all',            label:'All Methods',                   icon:<CreditCard size={13} />, cat:null},
  {value:'mtn',            label:'MTN Mobile Money',              icon:<Smartphone size={13} />, cat:'Mobile Money'},
  {value:'vodafone',       label:'Vodafone Cash',                 icon:<Smartphone size={13} />, cat:'Mobile Money'},
  {value:'airteltigo',     label:'AirtelTigo Money',              icon:<Smartphone size={13} />, cat:'Mobile Money'},
  {value:'mpesa',          label:'M-Pesa',                        icon:<Smartphone size={13} />, cat:'Mobile Money'},
  {value:'airtel money',   label:'Airtel Money',                  icon:<Smartphone size={13} />, cat:'Mobile Money'},
  {value:'orange money',   label:'Orange Money',                  icon:<Smartphone size={13} />, cat:'Mobile Money'},
  {value:'wave',           label:'Wave',                          icon:<Waves size={13} />, cat:'Mobile Money'},
  {value:'chipper',        label:'Chipper Cash',                  icon:<Wallet size={13} />, cat:'Mobile Money'},
  {value:'ecocash',        label:'EcoCash',                       icon:<Smartphone size={13} />, cat:'Mobile Money'},
  {value:'tigo pesa',      label:'Tigo Pesa / Mixx',              icon:<Smartphone size={13} />, cat:'Mobile Money'},
  {value:'moov money',     label:'Moov Money',                    icon:<Smartphone size={13} />, cat:'Mobile Money'},
  {value:'africell',       label:'Africell Money',                icon:<Smartphone size={13} />, cat:'Mobile Money'},
  {value:'paga',           label:'Paga',                          icon:<Circle size={13} fill="currentColor" style={{color:'#16A34A'}} />, cat:'Mobile Money'},
  {value:'paypal',         label:'PayPal',                        icon:<Wallet size={13} />, cat:'Digital Wallet'},
  {value:'cash app',       label:'Cash App',                      icon:<Send size={13} />, cat:'Digital Wallet'},
  {value:'apple pay',      label:'Apple Pay',                     icon:<Apple size={13} />, cat:'Digital Wallet'},
  {value:'alipay',         label:'Alipay',                        icon:<Circle size={13} fill="currentColor" style={{color:'#1677FF'}} />, cat:'Digital Wallet'},
  {value:'wechat',         label:'WeChat Pay',                    icon:<MessageSquare size={13} />, cat:'Digital Wallet'},
  {value:'venmo',          label:'Venmo',                         icon:<Circle size={13} fill="currentColor" style={{color:'#3D95CE'}} />, cat:'Digital Wallet'},
  {value:'zelle',          label:'Zelle',                         icon:<Circle size={13} fill="currentColor" style={{color:'#6D1ED4'}} />, cat:'Digital Wallet'},
  {value:'revolut',        label:'Revolut',                       icon:<Diamond size={13} />, cat:'Digital Wallet'},
  {value:'skrill',         label:'Skrill',                        icon:<CreditCard size={13} />, cat:'Digital Wallet'},
  {value:'neteller',       label:'Neteller',                      icon:<CreditCard size={13} />, cat:'Digital Wallet'},
  {value:'payeer',         label:'Payeer',                        icon:<CreditCard size={13} />, cat:'Digital Wallet'},
  {value:'perfect money',  label:'Perfect Money',                 icon:<CreditCard size={13} />, cat:'Digital Wallet'},
  {value:'wise',           label:'Wise',                          icon:<Globe size={13} />, cat:'Remittance'},
  {value:'worldremit',     label:'WorldRemit',                    icon:<Send size={13} />, cat:'Remittance'},
  {value:'remitly',        label:'Remitly',                       icon:<Rocket size={13} />, cat:'Remittance'},
  {value:'western union',  label:'Western Union',                 icon:<Building2 size={13} />, cat:'Remittance'},
  {value:'moneygram',      label:'MoneyGram',                     icon:<Building2 size={13} />, cat:'Remittance'},
  {value:'bank transfer',  label:'Bank Transfer',                 icon:<Landmark size={13} />, cat:'Bank'},
  {value:'wire transfer',  label:'Wire Transfer',                 icon:<LinkIcon size={13} />, cat:'Bank'},
  {value:'mobile banking', label:'Mobile Banking App',            icon:<Smartphone size={13} />, cat:'Bank'},
  {value:'interbank',      label:'Interbank (GhIPSS/NIBSS/EFT)',  icon:<Landmark size={13} />, cat:'Bank'},
  {value:'ussd',           label:'USSD Bank Transfer',            icon:<Phone size={13} />, cat:'Bank'},
  {value:'instant eft',    label:'Instant EFT (South Africa)',    icon:<Landmark size={13} />, cat:'Bank'},
  {value:'cash deposit',   label:'Cash Deposit (Bank Counter)',   icon:<Landmark size={13} />, cat:'Bank'},
  {value:'opay',           label:'OPay',                          icon:<Circle size={13} fill="currentColor" style={{color:'#16A34A'}} />, cat:'FinTech'},
  {value:'palmpay',        label:'PalmPay',                       icon:<Leaf size={13} />, cat:'FinTech'},
  {value:'kuda',           label:'Kuda Bank',                     icon:<Landmark size={13} />, cat:'FinTech'},
  {value:'moniepoint',     label:'Moniepoint',                    icon:<Landmark size={13} />, cat:'FinTech'},
  {value:'paystack',       label:'Paystack',                      icon:<Layers size={13} />, cat:'FinTech'},
  {value:'flutterwave',    label:'Flutterwave (Barter)',           icon:<Sparkles size={13} />, cat:'FinTech'},
  {value:'cash in person', label:'Cash in Person (Face-to-Face)', icon:<Banknote size={13} />, cat:'Cash'},
  {value:'cash out',       label:'Cash Out',                      icon:<Banknote size={13} />, cat:'Cash'},
  {value:'usdt',           label:'USDT (Tether – TRC20)',          icon:<Banknote size={13} />, cat:'Crypto'},
  {value:'binance pay',    label:'Binance Pay',                   icon:<Circle size={13} fill="currentColor" style={{color:'#F0B90B'}} />, cat:'Crypto'},
  {value:'bitcoin',        label:'Bitcoin (BTC)',                  icon:<Bitcoin size={13} />, cat:'Crypto'},
  {value:'ethereum',       label:'Ethereum (ETH)',                icon:<Hexagon size={13} />, cat:'Crypto'},
  {value:'luno',           label:'Luno Wallet',                   icon:<Moon size={13} />, cat:'Crypto'},
  {value:'yellow card',    label:'Yellow Card Wallet',            icon:<Circle size={13} fill="currentColor" style={{color:'#FBBF24'}} />, cat:'Crypto'},
];

const PM_CAT_COLORS = {
  'Mobile Money':'#10B981','Digital Wallet':'#3B82F6','Remittance':'#0D9488',
  'Bank':'#7C3AED','FinTech':'#F59E0B','Cash':'#F4A422','Crypto':'#F97316',
};

const fmt  = (n, d=0) => new Intl.NumberFormat('en-US', {minimumFractionDigits:0, maximumFractionDigits:d}).format(n||0);
const fBtc = (n)      => parseFloat(n||0).toFixed(8);

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
const getRateUSD = (l, btcPrice) => {
  if (l.pricing_type==='fixed') { const s=parseFloat(l.bitcoin_price||0); if(s>100) return s; }
  return btcPrice * (1 + parseFloat(l.margin||0)/100);
};
const calcBtc = (fiatAmt, btcUSD, marginPct, usdToLocal) => {
  const sellerRateLocal = btcUSD * (1+marginPct/100) * usdToLocal;
  const btcReceived     = fiatAmt / sellerRateLocal;
  return { btcReceived };
};

// ── Avatar — lazy-loads from /api/users/:id/avatar when listing response has no photo ──
const _avatarCache = {}; // userId → Promise<url> | url-string | null
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
      style={{width:size, height:size, backgroundColor:C.green, fontSize:Math.round(size*0.38)}}>
      {(u?.username||'?').charAt(0).toUpperCase()}
    </div>
  );
}

// ── Featured badge config ─────────────────────────────────────────────────────
const FEATURED = {
  active_trader: {
    TagIcon:     Crown,
    tag:         'ACTIVE TRADER OF THE WEEK',
    ribbon:      'linear-gradient(90deg,#064E3B 0%,#065F46 18%,#059669 38%,#6EE7B7 50%,#059669 62%,#065F46 82%,#064E3B 100%)',
    border:      '#059669',
    glow:        'rgba(5,150,105,0.35)',
    bg:          '#F0FAF5',
    bgGradient:  'linear-gradient(150deg,rgba(110,231,183,0.22) 0%,#F0FAF5 42%,rgba(16,185,129,0.12) 100%)',
    divider:     'rgba(5,150,105,0.20)',
    labelColor:  '#064E3B',
    btnGradient: 'linear-gradient(135deg,#064E3B 0%,#059669 55%,#34D399 100%)',
    btnShadow:   '0 4px 20px rgba(5,150,105,0.50)',
    pulse:       true,
  },
  fast_responder: {
    TagIcon:     Zap,
    tag:         'FAST RESPONDER OF THE WEEK',
    ribbon:      'linear-gradient(90deg,#1E3A8A,#4338CA,#818CF8,#4338CA,#1E3A8A)',
    border:      '#4F46E5',
    glow:        'rgba(79,70,229,0.28)',
    bg:          'rgba(79,70,229,0.05)',
    divider:     'rgba(79,70,229,0.14)',
    labelColor:  '#3730A3',
    btnGradient: 'linear-gradient(135deg,#1E3A8A 0%,#4F46E5 60%,#818CF8 100%)',
    btnShadow:   '0 4px 14px rgba(79,70,229,0.40)',
  },
  hot_offer: {
    TagIcon:     Flame,
    tag:         'HOT OFFER · TRENDING NOW',
    ribbon:      'linear-gradient(90deg,#7C2D12,#EA580C,#FCD34D,#EA580C,#7C2D12)',
    border:      '#EA580C',
    glow:        'rgba(234,88,12,0.28)',
    bg:          'rgba(234,88,12,0.05)',
    divider:     'rgba(234,88,12,0.14)',
    labelColor:  '#C2410C',
    btnGradient: 'linear-gradient(135deg,#7C2D12 0%,#EA580C 60%,#F97316 100%)',
    btnShadow:   '0 4px 14px rgba(234,88,12,0.40)',
  },
};

// ── Offer Card ────────────────────────────────────────────────────────────────
function OfferCard({listing, btcPriceUSD, onViewSeller, onBuy, liked, onToggleLike, featuredType, liveSeenAt, userBuyAmt}) {
  const { rates: USD_RATES } = useRates();
  const u         = getUser(listing.users);
  // liveSeenAt comes from the 30s server poll — always fresher than the cached listing
  const [seen, setSeen] = useState(() => getLastSeen({ ...u, last_seen_at: liveSeenAt || u.last_seen_at }));
  useEffect(() => {
    setSeen(getLastSeen({ ...u, last_seen_at: liveSeenAt || u.last_seen_at }));
  }, [liveSeenAt]);
  useEffect(() => {
    const id = setInterval(() => setSeen(getLastSeen({ ...u, last_seen_at: liveSeenAt || u.last_seen_at })), 30000);
    return () => clearInterval(id);
  }, [liveSeenAt]);
  const trades    = getTrades(u);
  const margin    = parseFloat(listing.margin||0);
  const cur       = listing.currency || 'GHS';
  const sym       = listing.currency_symbol || CUR_SYM[cur] || '₵';
  const usdRate   = USD_RATES[cur] || 1;
  const rateLocal = getRateUSD(listing, btcPriceUSD) * usdRate;

  const minLocal = listing.min_limit_local || (listing.min_limit_usd ? listing.min_limit_usd*usdRate : 100*usdRate);
  const maxLocal = listing.max_limit_local || (listing.max_limit_usd ? listing.max_limit_usd*usdRate : 1000*usdRate);

  const examplePay = (userBuyAmt && parseFloat(userBuyAmt) > 0)
    ? parseFloat(userBuyAmt)
    : (minLocal || Math.round(100*usdRate));
  const { btcReceived } = calcBtc(examplePay, btcPriceUSD, margin, usdRate);
  const fiatEquiv = parseFloat((btcReceived * btcPriceUSD * usdRate).toFixed(2));

  const marginLabel = margin===0 ? 'Market rate' : margin>0 ? `+${margin}% above market` : `${Math.abs(margin)}% below market`;
  const marginBg    = margin>0 ? C.danger : margin<0 ? C.success : C.g400;

  const pos   = parseInt(u.positive_feedback||0);
  const neg   = parseInt(u.negative_feedback||0);

  const pmLabel = listing.payment_method || 'Payment';

  const ft = featuredType ? FEATURED[featuredType] : null;

  return (
    <div className={`rounded-2xl overflow-hidden transition-all w-full hover:-translate-y-0.5 ${ft ? '' : 'shadow-[0_1px_2px_rgba(27,67,50,0.04),0_10px_28px_-14px_rgba(27,67,50,0.18)] hover:shadow-[0_2px_4px_rgba(27,67,50,0.06),0_20px_44px_-16px_rgba(27,67,50,0.28)]'}`}
      style={{
        background: ft?.bgGradient || (ft ? ft.bg : '#fff'),
        border: ft ? `2.5px solid ${ft.border}` : `1px solid ${C.g200}`,
        boxShadow: ft ? `0 0 0 3px ${ft.glow}, 0 10px 36px ${ft.glow}` : undefined,
        animation: ft?.pulse ? 'featuredPulse 2.5s ease-in-out infinite' : undefined,
      }}>
      {ft && (
        <div style={{position:'relative', overflow:'hidden'}}>
          <div className="flex items-center justify-center gap-2"
            style={{
              background: ft.ribbon,
              padding: ft.pulse ? '10px 16px' : '8px 16px',
            }}>
            {ft.TagIcon && <ft.TagIcon size={14} strokeWidth={2.5} color="#fff" style={{ flexShrink: 0 }} />}
            <span style={{
              fontSize: ft.pulse ? 12 : 11,
              fontWeight: 900,
              letterSpacing: '0.12em',
              color: '#fff',
              textShadow: '0 1px 6px rgba(0,0,0,0.45)',
              whiteSpace: 'nowrap',
            }}>
              {ft.tag}
            </span>
          </div>
          {ft.pulse && (
            <div style={{
              position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
              background: 'linear-gradient(90deg,transparent 0%,rgba(255,255,255,0.30) 50%,transparent 100%)',
              animation: 'shimmer 2.4s linear infinite',
              pointerEvents: 'none',
            }}/>
          )}
        </div>
      )}
      <div className="px-3.5 pt-3 pb-2">
        <div className="flex items-start justify-between gap-2">
          {/* Left section: Avatar + Username & Like/Dislike/Trades */}
          <div className="flex items-start gap-2.5 min-w-0 flex-1">
            <div className="relative flex-shrink-0">
              <button onClick={onViewSeller}>
                <Avatar user={u} size={40} radius="rounded-xl"/>
              </button>
              {seen.online && (
                <span className="absolute -bottom-0.5 -right-0.5">
                  <span className="absolute inline-flex w-3 h-3 rounded-full animate-ping"
                    style={{backgroundColor:C.online, opacity:0.6}}/>
                  <span className="relative inline-flex rounded-full w-3 h-3 border-2 border-white"
                    style={{backgroundColor:C.online}}/>
                </span>
              )}
            </div>

            <div className="flex flex-col gap-0.5 items-start min-w-0 flex-1">
              {/* Row 1: CountryFlag + Name + Verified Badge */}
              <div className="flex items-center gap-1.5 min-w-0">
                <CountryFlag
                  countryCode={u?.country_code || u?.country || u?.location || null}
                  className="w-4 h-3 rounded-sm flex-shrink-0"/>
                <button onClick={onViewSeller}
                  className="font-black text-sm hover:underline leading-tight truncate min-w-0"
                  style={{color:C.g800}}>
                  {getDisplayName(u) || 'Seller'}
                </button>
                {isVerified(u) && <BadgeCheck size={14} style={{color:'#3B82F6', flexShrink:0}}/>}
              </div>

              {/* Row 2: Like / Dislike buttons & trades count */}
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <span className="inline-flex items-center gap-0.5 font-bold"
                  style={{color:'#16A34A', fontSize:'11px'}}>
                  <ThumbsUp size={10} strokeWidth={2.5}/>{fmt(pos)}
                </span>
                <span className="inline-flex items-center gap-0.5 font-bold"
                  style={{color:'#EF4444', fontSize:'11px'}}>
                  <ThumbsDown size={10} strokeWidth={2.5}/>{fmt(neg)}
                </span>
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold" style={{color:C.g500}}>
                  <Repeat2 size={10} strokeWidth={2.5} style={{color:C.g400}}/>
                  {fmt(trades)} trades
                </span>
              </div>
            </div>
          </div>

          {/* Right section: Stacked BEGINNER badge & Active status pill */}
          <div className="flex flex-col gap-1 items-end flex-shrink-0 pt-0.5">
            <div>
              <BadgeChip user={u} size="xs" />
            </div>
            <div>
              {seen.online ? (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold flex-shrink-0"
                  style={{backgroundColor:'#F0FDF4', color:C.online}}>
                  <span className="relative flex w-1.5 h-1.5 flex-shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{backgroundColor:C.online}}/>
                    <span className="relative inline-flex rounded-full w-1.5 h-1.5" style={{backgroundColor:C.online}}/>
                  </span>
                  Active
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium flex-shrink-0"
                  style={{backgroundColor:C.g100, color:C.g400}}>
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{backgroundColor:C.g300}}/>
                  {seen.label}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div style={{height:1, backgroundColor: ft ? ft.divider : C.g100}}/>

      <div className="px-3.5 py-2.5 grid grid-cols-2 gap-2.5">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide mb-0.5" style={{color: ft ? ft.labelColor : C.g500}}>You pay</p>
          <p className="text-base font-bold leading-tight" style={{color:C.g800, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', paddingRight:'4px'}}>
            {fmt(examplePay, 2)}&nbsp;<span style={{fontSize:'0.7em', color:C.g500}}>{cur}</span>
          </p>
        </div>
        <div className="border-l pl-3" style={{borderColor: ft ? ft.divider : C.g100}}>
          <p className="text-[11px] font-bold uppercase tracking-wide mb-0.5" style={{color: ft ? ft.labelColor : C.g500}}>You receive</p>
          <p className="text-base font-bold leading-tight" style={{color:C.g800, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', paddingRight:'4px'}}>
            {fmt(fiatEquiv, 2)}&nbsp;<span style={{fontSize:'0.7em', color:C.g500}}>{cur}</span>
          </p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <p className="text-[10px] font-semibold" style={{color:C.g500}}>
              ≈ {fBtc(btcReceived)} BTC
            </p>
          </div>
        </div>
      </div>

      {/* Payment method pill above the divider line */}
      <div className="px-3.5 pt-1 pb-2">
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold capitalize"
          style={{backgroundColor:'rgba(22,163,74,0.08)', color:'#16A34A', border:'1px solid rgba(22,163,74,0.15)'}}>
          {pmLabel}
        </span>
      </div>

      <div className="px-3.5 pb-2.5" style={{borderTop:`1px solid ${ft ? ft.divider : C.g100}`}}>
        {/* ── Rate / % / Range — grey info board ───── */}
        <div className="group relative mt-1">
          <div className="rounded-xl px-2.5 py-2 flex items-center justify-between transition-colors"
            style={{backgroundColor:C.g100, border:`1px solid ${C.g200}`}}>

            <div className="min-w-0">
              {/* Row 1: Rate */}
              <p className="text-xs font-semibold" style={{color:C.g600}}>
                Rate:&nbsp;<span style={{color:C.g800, fontWeight:700}}>{fmt(rateLocal)}</span>&nbsp;<span style={{color:C.g500, fontSize:'0.85em'}}>{cur}</span>
              </p>

              {/* Row 2: Range */}
              {(minLocal > 0 || maxLocal > 0) && (
                <p className="text-xs font-semibold mt-1" style={{color:C.g600}}>
                  Range:&nbsp;<span style={{color:C.g700, fontWeight:700}}>{fmt(minLocal)}</span>&nbsp;–&nbsp;<span style={{color:C.g700, fontWeight:700}}>{fmt(maxLocal)}</span>&nbsp;<span style={{color:C.g500, fontSize:'0.85em'}}>{cur}</span>
                </p>
              )}
            </div>

            {/* +5% badge vertically centered in rate box, shifted noticeably leftward */}
            <div className="flex items-center flex-shrink-0 ml-4 mr-6">
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-black"
                style={{
                  backgroundColor: margin < 0 ? 'rgba(16,185,129,0.14)' : margin > 0 ? 'rgba(239,68,68,0.12)' : '#E2E8F0',
                  color: margin < 0 ? '#16A34A' : margin > 0 ? '#EF4444' : C.g500,
                  border: margin < 0 ? '1px solid rgba(16,185,129,0.25)' : margin > 0 ? '1px solid rgba(239,68,68,0.25)' : `1px solid ${C.g300}`,
                }}>
                {margin === 0 ? 'Market' : `${margin > 0 ? '+' : ''}${margin}%`}
              </span>
            </div>
          </div>

          {/* Tooltip — visible on hover */}
          <div className="absolute bottom-full left-0 right-0 mb-3 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity"
            style={{zIndex:20}}>
            <div className="rounded-xl shadow-2xl border p-3 text-xs"
              style={{backgroundColor:'#1E293B', borderColor:'#334155', color:'#E2E8F0', position:'relative'}}>
              <p className="font-black text-[10px] uppercase tracking-wider mb-2" style={{color:'#64748B'}}>Offer Details</p>
              <div className="flex items-center justify-between mb-1.5">
                <span style={{color:'#94A3B8'}}>Rate</span>
                <span className="font-bold" style={{color:'#F0FAF5'}}>{fmt(rateLocal)} {cur}</span>
              </div>
              <div className="flex items-center justify-between mb-1.5">
                <span style={{color:'#94A3B8'}}>Margin</span>
                <span className="font-bold"
                  style={{color: margin < 0 ? '#4ADE80' : margin > 0 ? '#F87171' : '#94A3B8'}}>
                  {margin === 0 ? 'Market rate' : `${margin > 0 ? '+' : ''}${margin}%`}
                </span>
              </div>
              {(minLocal > 0 || maxLocal > 0) && (
                <div className="flex items-center justify-between">
                  <span style={{color:'#94A3B8'}}>Range</span>
                  <span className="font-bold" style={{color:'#F0FAF5'}}>{fmt(minLocal)} – {fmt(maxLocal)} {cur}</span>
                </div>
              )}
              <div style={{position:'absolute', bottom:'-5px', left:'20px', width:10, height:10, backgroundColor:'#1E293B', border:'1px solid #334155', borderTop:'none', borderLeft:'none', transform:'rotate(45deg)'}}/>
            </div>
          </div>
        </div>
      </div>

      <div className="px-3.5 pb-3 flex items-center gap-2">
        <button onClick={onViewSeller}
          className="w-9 h-9 rounded-xl border flex items-center justify-center flex-shrink-0 transition"
          style={{
            borderColor: ft ? ft.border : C.g200,
            backgroundColor: ft ? `${ft.border}12` : 'transparent',
          }}>
          <Info size={14} style={{color: ft ? ft.border : C.g400}}/>
        </button>
        <button onClick={onBuy}
          className="flex-1 h-9 rounded-xl text-white font-black text-sm flex items-center justify-center gap-1.5 hover:opacity-90 active:scale-[0.98] transition"
          style={{
            background: ft ? ft.btnGradient : C.forest,
            boxShadow: ft ? ft.btnShadow : undefined,
          }}>
          BUY BTC <ArrowRight size={14}/>
        </button>
      </div>
    </div>
  );
}

// ── Profile Modal ─────────────────────────────────────────────────────────────
function ProfileModal({seller, listing, onClose, onTrade, btcPriceUSD}) {
  const [tab,        setTab]        = useState('overview');
  const [reviews,    setReviews]    = useState([]);
  const [rvLoad,     setRvLoad]     = useState(false);
  const [freshSeller, setFreshSeller] = useState(null);
  const { rates: USD_RATES } = useRates();

  // Fetch full profile (with verification fields) on open — l.users join omits them
  const sellerId = getUser(seller)?.id;
  useEffect(() => {
    if (!sellerId) return;
    axios.get(`${API_URL}/users/${sellerId}`)
      .then(r => { const d = r.data.user || r.data; if (d?.id) setFreshSeller(d); })
      .catch(() => {});
  }, [sellerId]);

  const u      = getUser(freshSeller || seller);
  const seen   = getLastSeen(u);
  const trades = getTrades(u);
  const rating = parseFloat(u.average_rating || 0);
  const margin = parseFloat(listing?.margin || 0);
  const cur    = listing?.currency || 'GHS';
  const sym    = listing?.currency_symbol || CUR_SYM[cur] || '₵';
  const usdRate   = USD_RATES[cur] || 1;
  const rateLocal = getRateUSD(listing || {}, btcPriceUSD || 68000) * usdRate;

  // Proper verification — only use the dedicated verified flags, never raw phone/email presence
  const phoneOk = !!(u.is_phone_verified || u.phone_verified);
  const emailOk = !!(u.is_email_verified || u.email_verified);
  const kycOk   = !!(u.is_id_verified || u.kyc_verified);
  const pos     = parseInt(u.positive_feedback || 0);
  const neg     = parseInt(u.negative_feedback || 0);
  const total   = pos + neg;
  const trust   = total > 0 ? Math.round(pos / total * 100) : trades > 0 ? 100 : 0;
  const compRate = parseFloat(u.completion_rate || 0);
  const blocks  = parseInt(u.blocks_received || u.blocks_count || 0);
  const ccCode  = resolveCode(u.country || u.location);
  const avgReply = u.avg_response_time || u.avg_reply_minutes;
  const payMins  = parseFloat(u.avg_payment_time || u.avg_response_time || u.avg_reply_minutes || 0);
  const avgPayDisplay = payMins > 0 ? (() => { const m=Math.floor(payMins),s=Math.round((payMins-m)*60); return s>0?`${m}m ${s}s`:m>0?`${m}m`:`${s}s`; })() : '—';
  const locCC    = ccCode ? ccCode.toUpperCase() : '';
  const CC_NAME  = {GH:'Ghana',NG:'Nigeria',KE:'Kenya',ZA:'S. Africa',UG:'Uganda',TZ:'Tanzania',RW:'Rwanda',CM:'Cameroon',SN:'Senegal',ML:'Mali',CI:"Côte d'Ivoire",CD:'DR Congo',ZM:'Zambia',MZ:'Mozambique',ZW:'Zimbabwe',BF:'Burkina Faso',BJ:'Benin',TG:'Togo',NE:'Niger',ET:'Ethiopia',EG:'Egypt',MA:'Morocco',DZ:'Algeria',AO:'Angola',US:'USA',GB:'UK',DE:'Germany',FR:'France',IT:'Italy',ES:'Spain',NL:'Netherlands',SE:'Sweden',NO:'Norway',PL:'Poland',UA:'Ukraine',TR:'Turkey',VN:'Vietnam',TH:'Thailand',ID:'Indonesia',PH:'Philippines',MY:'Malaysia',SG:'Singapore',IN:'India',CN:'China',JP:'Japan',KR:'S. Korea',PK:'Pakistan',BD:'Bangladesh',SA:'Saudi Arabia',AE:'UAE',QA:'Qatar',BR:'Brazil',MX:'Mexico',CO:'Colombia',AR:'Argentina',CA:'Canada',AU:'Australia',NZ:'New Zealand'};
  const countryName = (u.country && u.country.length > 2) ? u.country : (CC_NAME[locCC] || u.location || (locCC || '—'));

  // Load real reviews when feedback tab is opened
  useEffect(() => {
    if (tab !== 'feedback' || !u.id || reviews.length) return;
    setRvLoad(true);
    axios.get(`${API_URL}/users/${u.id}/reviews`)
      .then(r => setReviews(r.data.reviews || []))
      .catch(() => {})
      .finally(() => setRvLoad(false));
  }, [tab, u.id]);

  if (!seller) return null;

  const TABS = [
    { id:'overview',  label:<span className="inline-flex items-center gap-1"><User size={12}/> Profile</span>    },
    { id:'feedback',  label:<span className="inline-flex items-center gap-1"><MessageSquare size={12}/> Reviews ({total})</span>},
    { id:'rules',     label:<span className="inline-flex items-center gap-1"><Shield size={12}/> Rules</span>      },
    { id:'offer',     label:<span className="inline-flex items-center gap-1"><BarChart2 size={12}/> Offer</span>      },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{backgroundColor:'rgba(0,0,0,0.6)', backdropFilter:'blur(6px)'}}
      onClick={e => e.target === e.currentTarget && onClose()}>

      <div className="bg-white w-full sm:max-w-sm rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col sm:mb-0"
        style={{
          maxHeight:'92dvh',
          marginBottom:'calc(60px + env(safe-area-inset-bottom, 0px))',
          border:`1px solid ${C.g200}`,
          animation:'slideUp .28s cubic-bezier(0.34,1.56,0.64,1)',
        }}>
        <style>{`@keyframes slideUp{from{transform:translateY(40px);opacity:0}to{transform:translateY(0);opacity:1}}`}</style>

        {/* ── DRAG HANDLE (mobile) ── */}
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
                style={{backgroundColor: seen.online ? C.online : C.g400}}/>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                <Link to={u?.id ? `/profile/${u.id}` : '#'}
                  onClick={() => { if (!u?.id) return; const tk = localStorage.getItem('token'); axios.post(`${API_URL}/users/${u.id}/view-profile`, {}, tk ? { headers: { Authorization: `Bearer ${tk}` } } : {}).catch(()=>{}); }}
                  className="font-black text-white text-base leading-tight truncate"
                  style={{textDecoration:'none', borderBottom:'1.5px solid rgba(255,255,255,0.4)', paddingBottom:'1px'}}>
                  {getDisplayName(u) || 'User'}
                </Link>
                {kycOk && <BadgeCheck size={15} style={{color:'#93C5FD', flexShrink:0}}/>}
              </div>
              <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
                <CountryFlag countryCode={ccCode} className="w-4 h-3 rounded-sm"/>
                {(u.country_name || u.country) && (
                  <span className="text-white/80 text-xs font-bold">{u.country_name || u.country}</span>
                )}
                <span className="text-white/40 text-xs">·</span>
                <span className="text-white/60 text-xs">{seen.online ? <span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full inline-block" style={{backgroundColor:'#4ADE80'}}/> Active now</span> : seen.label}</span>
              </div>
              <BadgeChip user={u} size="sm" />
            </div>
          </div>

          {/* ── STATS 2×2 GRID ── */}
          <div className="grid grid-cols-2 gap-2">
            {/* Activity */}
            {/* Last active */}
            <div className="flex items-center gap-2 rounded-xl px-3 py-2.5"
              style={{backgroundColor:'rgba(255,255,255,0.12)'}}>
              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{backgroundColor: seen.online ? '#4ADE80' : '#94A3B8'}}/>
              <div className="min-w-0">
                <p className="text-white font-black text-xs leading-tight truncate">
                  {seen.online ? 'Online now' : seen.label}
                </p>
                <p className="text-white/50 text-xs leading-tight">Last active</p>
              </div>
            </div>
            {/* Location — real flag image, real country name */}
            <div className="flex items-center gap-2 rounded-xl px-3 py-2.5"
              style={{backgroundColor:'rgba(255,255,255,0.12)'}}>
              <CountryFlag countryCode={ccCode} className="w-5 h-3.5 rounded-sm flex-shrink-0"/>
              <div className="min-w-0">
                <p className="text-white font-black text-xs leading-tight truncate">{countryName}</p>
                <p className="text-white/50 text-xs leading-tight">Location</p>
              </div>
            </div>
            {/* Avg. response */}
            <div className="flex items-center gap-2 rounded-xl px-3 py-2.5"
              style={{backgroundColor:'rgba(255,255,255,0.12)'}}>
              <Timer size={14} style={{color:'#FDE68A', flexShrink:0}}/>
              <div className="min-w-0">
                <p className="text-white font-black text-xs leading-tight">{avgPayDisplay}</p>
                <p className="text-white/50 text-xs leading-tight">Avg. response</p>
              </div>
            </div>
            {/* Trusted by */}
            <div className="flex items-center gap-2 rounded-xl px-3 py-2.5"
              style={{backgroundColor:'rgba(255,255,255,0.12)'}}>
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
              onClick={() => { const tk = localStorage.getItem('token'); axios.post(`${API_URL}/users/${u.id}/view-profile`, {}, tk ? { headers: { Authorization: `Bearer ${tk}` } } : {}).catch(()=>{}); }}
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
              {/* Key stats */}
              <div className="grid grid-cols-3 gap-2">
                {[
                  {label:'Trades',      value:fmt(trades),           sub:'completed'},
                  {label:'Rating',      value:<span className="inline-flex items-center gap-1 justify-center"><Star size={13} fill="currentColor" className="text-amber-500"/>{rating.toFixed(1)}</span>, sub:`of 5.0`},
                  {label:'Completion',  value:`${compRate.toFixed(0)}%`, sub:'rate'},
                ].map(({label,value,sub}) => (
                  <div key={label} className="rounded-xl p-3 text-center"
                    style={{backgroundColor:C.mist, border:`1px solid ${C.g200}`}}>
                    <p className="font-black text-sm" style={{color:C.forest}}>{value}</p>
                    <p className="text-xs font-semibold mt-0.5" style={{color:C.g500}}>{label}</p>
                    <p className="text-xs" style={{color:C.g400}}>{sub}</p>
                  </div>
                ))}
              </div>

              {/* Positive / Negative */}
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
                  {label:'Phone Number', ok:phoneOk,  icon:<Phone size={14}/>},
                  {label:'Email Address',ok:emailOk,  icon:<Mail size={14}/>},
                  {label:'ID / KYC',     ok:kycOk,    icon:<ShieldCheck size={14}/>},
                ].map(({label,ok,icon}) => (
                  <div key={label} className="flex items-center justify-between px-3 py-2.5 border-t"
                    style={{borderColor:C.g100}}>
                    <div className="flex items-center gap-2">
                      <span className="text-sm flex items-center">{icon}</span>
                      <span className="text-xs font-semibold" style={{color:C.g700}}>{label}</span>
                    </div>
                    <span className={`text-xs font-black px-2.5 py-1 rounded-full`}
                      style={{
                        backgroundColor: ok ? '#F0FDF4' : '#FEF2F2',
                        color: ok ? '#16A34A' : '#DC2626',
                      }}>
                      {ok ? '✓ Verified' : '✗ Not verified'}
                    </span>
                  </div>
                ))}
              </div>

              {/* Bio */}
              {u.bio && (
                <div className="rounded-xl p-3" style={{backgroundColor:C.g50, border:`1px solid ${C.g200}`}}>
                  <p className="text-xs font-bold mb-1" style={{color:C.g500}}>About</p>
                  <p className="text-xs leading-relaxed" style={{color:C.g700}}>{u.bio}</p>
                </div>
              )}

              {/* Extra info */}
              <div className="rounded-xl overflow-hidden" style={{border:`1px solid ${C.g200}`}}>
                {[
                  avgReply ? {label:'Avg. Response', value:`~${Math.round(avgReply)} min`} : null,
                  {label:'Country', value: (() => {
                    const cc = (u.country||'').slice(0,2).toUpperCase();
                    if (!cc) return '—';
                    const flag = cc.replace(/./g,c=>String.fromCodePoint(0x1F1E0+c.charCodeAt(0)-65));
                    return `${flag} ${u.country || cc}`;
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

          {/* FEEDBACK / REVIEWS */}
          {tab==='feedback' && (
            <div className="space-y-3">
              {/* Summary bar */}
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
                    <p className="text-xs flex items-center justify-center gap-1" style={{color:C.g400}}><ThumbsUp size={11} className="text-green-600"/> Positive</p>
                  </div>
                  <div className="text-center flex-1">
                    <p className="font-black text-sm" style={{color:'#DC2626'}}>{fmt(neg)}</p>
                    <p className="text-xs flex items-center justify-center gap-1" style={{color:C.g400}}><ThumbsDown size={11} className="text-red-600"/> Negative</p>
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
                  <p className="mb-2"><MessageSquare size={28} className="inline-block" style={{color:C.g400}}/></p>
                  <p className="font-bold text-sm" style={{color:C.g700}}>No reviews yet</p>
                  <p className="text-xs mt-1" style={{color:C.g400}}>Be the first to trade with this seller</p>
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
                      style={{
                        borderColor: isPos ? '#86EFAC' : '#FCA5A5',
                        backgroundColor: isPos ? '#F0FDF4' : '#FEF2F2',
                      }}>
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-black text-white flex-shrink-0"
                            style={{backgroundColor: isPos ? '#16A34A' : '#DC2626'}}>
                            {isPos ? <ThumbsUp size={12} strokeWidth={2.5}/> : <ThumbsDown size={12} strokeWidth={2.5}/>}
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

          {/* TRADE RULES */}
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

          {/* OFFER DETAILS */}
          {tab==='offer' && (
            <div className="rounded-xl overflow-hidden" style={{border:`1px solid ${C.g200}`}}>
              {[
                {label:'Payment Method', value:listing?.payment_method||'—'},
                {label:'Rate / BTC',     value:`${sym}${fmt(rateLocal,0)} ${cur}`},
                {label:'Margin',         value:margin===0?'At market':margin>0?`+${margin}% above market`:`${margin}% below market`},
                {label:'Trade Limits',   value:listing?.min_limit_local && listing?.max_limit_local
                  ? `${sym}${fmt(listing.min_limit_local)} – ${sym}${fmt(listing.max_limit_local)} ${cur}`
                  : `$${listing?.min_limit_usd||10} – $${listing?.max_limit_usd||1000} USD`},
                {label:'Time Limit',     value:`${listing?.time_limit||30} minutes`},
                {label:'Country',        value: (() => {
                  const raw = listing?.country_name || u.country || '';
                  if (!raw) return '—';
                  const cc = raw.slice(0,2).toUpperCase();
                  const flag = cc.replace(/./g,c=>String.fromCodePoint(0x1F1E0+c.charCodeAt(0)-65));
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

        {/* ── FOOTER ACTIONS ── */}
        <div className="p-4 flex gap-3 flex-shrink-0 border-t" style={{borderColor:C.g200}}>
          <button onClick={onClose}
            className="flex-1 py-3 rounded-2xl border text-sm font-bold hover:bg-gray-50 transition"
            style={{borderColor:C.g200, color:C.g600}}>
            Close
          </button>
          <button onClick={() => { onClose(); onTrade(); }}
            className="flex-1 py-3 rounded-2xl text-white text-sm font-black flex items-center justify-center gap-2 shadow-md"
            style={{backgroundColor:C.forest}}>
            <Bitcoin size={15}/> Buy BTC
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Skeleton card ─────────────────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div className="bg-white rounded-2xl border animate-pulse w-full" style={{borderColor:C.g200}}>
      <div className="px-4 pt-4 pb-3 flex gap-3">
        <div className="w-12 h-12 rounded-xl flex-shrink-0" style={{backgroundColor:C.g200}}/>
        <div className="flex-1 space-y-2 pt-1">
          <div className="h-3 rounded-lg w-2/3" style={{backgroundColor:C.g200}}/>
          <div className="h-2.5 rounded-lg w-1/2" style={{backgroundColor:C.g100}}/>
        </div>
      </div>
      <div style={{height:1, backgroundColor:C.g100}}/>
      <div className="px-4 py-3 grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <div className="h-2 rounded w-1/2" style={{backgroundColor:C.g100}}/>
          <div className="h-7 rounded-lg w-3/4" style={{backgroundColor:C.g200}}/>
        </div>
        <div className="space-y-1.5 pl-3">
          <div className="h-2 rounded w-1/2" style={{backgroundColor:C.g100}}/>
          <div className="h-7 rounded-lg w-3/4" style={{backgroundColor:C.g200}}/>
        </div>
      </div>
      <div className="px-4 pb-4">
        <div className="h-11 rounded-xl" style={{backgroundColor:C.g200}}/>
      </div>
    </div>
  );
}

// ── Main BuyBitcoin Page ──────────────────────────────────────────────────────
export default function BuyBitcoin({user}) {
  const navigate = useNavigate();
  const { rates: USD_RATES, btcUsd: contextBtcUsd } = useRates();
  // Use cached data (up to 30 min old) only if it actually has user profile data.
  // If users are all null the cache is stale/bad — skip it and force a fresh fetch.
  const _hasUsers  = (data) => Array.isArray(data) && data.some(l => l.users && (l.users.id || l.users.username));
  const _cacheAll  = () => { try { const c=JSON.parse(localStorage.getItem('praqen_market_all')||'null'); if(!c||Date.now()-c.ts>1800000||!_hasUsers(c.data)) return null; return c?.data||null; } catch { return null; } };
  const _sellNow   = () => { const a=_cacheAll(); return a?a.filter(l=>(l.asset||'BTC')==='BTC'&&(l.listing_type==='SELL'||l.listing_type==='SELL_BITCOIN')):[]; };
  const [listings,     setListings]     = useState(()=>_sellNow());
  const [loading,      setLoading]      = useState(()=>_sellNow().length===0);
  const [loadError,    setLoadError]    = useState(false);
  const [retrying,     setRetrying]     = useState(false);
  const [btcPrice,     setBtcPrice]     = useState(68000);
  const [selCountry,    setSelCountry]    = useState(COUNTRIES[0]);
  const [countrySearch, setCountrySearch] = useState('');
  const [selPayment,    setSelPayment]    = useState('all');
  const [paymentSearch, setPaymentSearch] = useState('');
  const [showFilters,   setShowFilters]   = useState(false);
  const [showCountry,   setShowCountry]   = useState(false);
  const [showPayment,   setShowPayment]   = useState(false);
  const [showBuyMenu, setShowBuyMenu] = useState(false);
  const [showSellMenu, setShowSellMenu] = useState(false);
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [sortBy,       setSortBy]       = useState('rate_low');
  const [modal,        setModal]        = useState(null);
  const [liked,        setLiked]        = useState(new Set());
  const [buyAmt,       setBuyAmt]       = useState('');
  const [activeTrades, setActiveTrades] = useState([]);
  const [showAllTrades, setShowAllTrades] = useState(false);
  const [pausedOffer,  setPausedOffer]  = useState(false);
  const [userBtcBalance, setUserBtcBalance] = useState(0);
  const [lastSynced,   setLastSynced]   = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [affLeaderboard, setAffLeaderboard] = useState([]);
  const [traderSearch,   setTraderSearch]   = useState('');
  const [selCurrency,    setSelCurrency]    = useState(CURRENCIES[0]);
  const [showCurrency,   setShowCurrency]   = useState(false);
  const [currencySearch, setCurrencySearch] = useState('');
  const [liveStatus,     setLiveStatus]     = useState({}); // userId → last_seen_at (fresh from server)
  const currencyRef = useRef(null);
  const countryRef  = useRef(null);
  const paymentRef  = useRef(null);
  const sortRef     = useRef(null);

  useEffect(() => {
    if (contextBtcUsd > 0) setBtcPrice(contextBtcUsd);
  }, [contextBtcUsd]);

  // Auto-detect country + currency on first load
  useEffect(() => {
    const applyCountry = (cc) => {
      const code = (cc || '').toUpperCase().slice(0, 2);
      const matched = COUNTRIES.find(c => c.code === code);
      if (!matched || matched.code === 'ALL') return false;
      setSelCountry(matched);
      const cur = CURRENCIES.find(c => c.code === matched.currency);
      if (cur) setSelCurrency(cur);
      return true;
    };

    // 1. Use logged-in user's profile country
    if (user) {
      const cc = user.country_code || (user.country?.length <= 3 ? user.country : null) || '';
      if (applyCountry(cc)) return;
    }

    // 2. Fallback: IP-based detection for guests
    fetch('https://ipapi.co/json/')
      .then(r => r.json())
      .then(data => {
        if (data?.country_code) {
          const cc = data.country_code.toUpperCase();
          const matched = COUNTRIES.find(c => c.code === cc);
          if (matched && matched.code !== 'ALL') {
            setSelCountry(matched);
            const cur = CURRENCIES.find(c => c.code === (data.currency || matched.currency));
            if (cur) setSelCurrency(cur);
          }
        }
      })
      .catch(() => {});
  }, []);

  const loadListings = async (attempt = 1, force = false) => {
    // Skip fetch if cache is fresh (< 5 minutes) and this is not a forced refresh
    if (attempt === 1 && !force) {
      try {
        const c = JSON.parse(localStorage.getItem('praqen_market_all') || 'null');
        if (c && Date.now() - c.ts < 300000 && _hasUsers(c.data)) {
          const sellOffers = (c.data || []).filter(l => (l.asset || 'BTC') === 'BTC' && (l.listing_type === 'SELL' || l.listing_type === 'SELL_BITCOIN'));
          if (sellOffers.length > 0) {
            setListings(sellOffers);
            setLoading(false);
            return;
          }
        }
      } catch {}
    }
    setLoadError(false);
    setRetrying(false);
    try {
      const r = await axios.get(`${API_URL}/listings`, { timeout: 20000 });
      const all = (r.data.listings || []).map(l => ({...l, users: Array.isArray(l.users) ? l.users[0] : l.users}));
      const sellOffers = all.filter(l => (l.asset || 'BTC') === 'BTC' && (l.listing_type === 'SELL' || l.listing_type === 'SELL_BITCOIN'));
      if (sellOffers.length > 0) {
        setListings(sellOffers);
        setLastSynced(new Date());
        try { localStorage.setItem('praqen_market_all', JSON.stringify({ data: all, ts: Date.now() })); } catch {}
      } else if (!listings.length) {
        // Truly empty marketplace — show empty state but don't cache
        setListings([]);
        setLastSynced(new Date());
      }
    } catch (err) {
      // 503 = DB temporarily down; longer retry delay so we don't spam the server
      const retryDelay = err?.response?.status === 503 ? 5000 : 1000;
      if (attempt < 3) {
        setRetrying(true);
        setTimeout(() => loadListings(attempt + 1, force), retryDelay);
      } else {
        setRetrying(false);
        // All retries failed — fall back to any stale localStorage cache (no TTL check)
        try {
          const stale = JSON.parse(localStorage.getItem('praqen_market_all') || 'null');
          if (stale && _hasUsers(stale.data)) {
            const sellOffers = (stale.data || []).filter(l => (l.asset || 'BTC') === 'BTC' && (l.listing_type === 'SELL' || l.listing_type === 'SELL_BITCOIN'));
            if (sellOffers.length > 0) {
              setListings(sellOffers);
              toast.warn('Showing cached offers — server is busy. Prices may be slightly outdated.', { autoClose: 6000 });
              return;
            }
          }
        } catch {}
        if (!listings.length) setLoadError(true);
      }
    }
    finally { if (attempt === 1 || attempt >= 3) setLoading(false); }
  };

  useEffect(() => {
    loadListings();
    const interval = setInterval(() => loadListings(1, true), 60000);
    return () => clearInterval(interval);
  }, []);

  // Poll fresh last_seen_at for all visible sellers every 30s — keeps online dots accurate
  const fetchOnlineStatus = (currentListings) => {
    const ids = [...new Set((currentListings || listings).map(l => l.users?.id).filter(Boolean))];
    if (ids.length === 0) return;
    axios.get(`${API_URL}/users/online-status?ids=${ids.join(',')}`)
      .then(r => { if (r.data?.status) setLiveStatus(r.data.status); })
      .catch(() => {});
  };

  useEffect(() => {
    if (listings.length > 0) fetchOnlineStatus(listings);
    const iv = setInterval(() => fetchOnlineStatus(), 30000);
    return () => clearInterval(iv);
  }, [listings.length > 0]); // re-run when listings first populate

  useEffect(() => {
    const fetchBoard = () => {
      axios.get(`${API_URL}/referral/leaderboard`).then(r => {
        if (r.data?.leaderboard) setAffLeaderboard(r.data.leaderboard.slice(0, 3));
      }).catch(() => {});
    };
    fetchBoard();
    const iv = setInterval(fetchBoard, 60000);
    return () => clearInterval(iv);
  }, []);

  // Auto-detect user location by IP — sets COUNTRY only, not currency.
  // Currency stays at USD (shows all offers) until the user manually picks one.
  useEffect(() => {
    const detected = sessionStorage.getItem('praqen_geo');
    if (detected) {
      try {
        const { countryCode } = JSON.parse(detected);
        const match = COUNTRIES.find(c => c.code === countryCode);
        if (match && match.code !== 'ALL') setSelCountry(match);
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
        const match = COUNTRIES.find(c => c.code === countryCode);
        if (match && match.code !== 'ALL') setSelCountry(match);
      })
      .catch(() => {})
      .finally(() => clearTimeout(geoTimeout));
  }, []);

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
    // All independent fetches fire in parallel on mount
    Promise.all([
      axios.post(`${API_URL}/users/heartbeat`, {}, { headers: h }).catch(() => {}),
      axios.get(`${API_URL}/user/balance`, { headers: h }).then(r => setUserBtcBalance(parseFloat(r.data?.balance_btc || 0))).catch(() => {}),
      fetchTrades(),
    ]);
    const iv1 = setInterval(() => axios.post(`${API_URL}/users/heartbeat`, {}, { headers: h }).catch(() => {}), 60000);
    const iv2 = setInterval(fetchTrades, 10000);
    return () => { clearInterval(iv1); clearInterval(iv2); };
  }, [user]);

  useEffect(() => {
    const h = e => {
      if (currencyRef.current && !currencyRef.current.contains(e.target)) {
        setShowCurrency(false);
        setCurrencySearch('');
      }
      if (countryRef.current && !countryRef.current.contains(e.target)) setShowCountry(false);
      if (paymentRef.current && !paymentRef.current.contains(e.target)) {
        setShowPayment(false);
        setPaymentSearch('');
      }
      if (sortRef.current && !sortRef.current.contains(e.target)) {
        setShowSortMenu(false);
      }
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const handleRefresh = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      await loadListings(1, true);
    } finally {
      setIsRefreshing(false);
    }
  };

  const getFiltered = () => {
    let list = [...listings];
    // Offers with no country set are treated as global — always visible regardless of country filter
    if (selCountry.code !== 'ALL') list = list.filter(l => {
      const offerCountry = (l.country_code || l.country || '').toUpperCase();
      return offerCountry === '' || offerCountry === selCountry.code;
    });
    // Only filter by currency when user explicitly picks a non-USD currency
    if (selCurrency.code !== 'USD') {
      list = list.filter(l => (l.currency || l.fiat_currency || 'USD').toUpperCase() === selCurrency.code);
    }
    if (selPayment !== 'all') list = list.filter(l => String(l.payment_method || '').toLowerCase().includes(selPayment));
    if (buyAmt && parseFloat(buyAmt) > 0) {
      const amtUsd = parseFloat(buyAmt) / (USD_RATES[selCurrency.code] || 1);
      list = list.filter(l => {
        const minUsd = parseFloat(l.min_limit_usd || 0);
        const maxUsd = parseFloat(l.max_limit_usd || l.max_limit_local || 999999);
        return amtUsd >= minUsd && amtUsd <= maxUsd;
      });
    }
    if (sortBy === 'rate_low')  list.sort((a, b) => parseFloat(a.margin||0) - parseFloat(b.margin||0));
    else if (sortBy === 'rate_high') list.sort((a, b) => parseFloat(b.margin||0) - parseFloat(a.margin||0));
    else if (sortBy === 'rating') list.sort((a, b) => (b.users?.average_rating || 0) - (a.users?.average_rating || 0));
    else if (sortBy === 'trades') list.sort((a, b) => (b.users?.total_trades || b.users?.trade_count || 0) - (a.users?.total_trades || a.users?.trade_count || 0));
    if (traderSearch.trim()) {
      const search = traderSearch.trim().toLowerCase();
      list = list.filter(offer => (offer.users?.username || '').toLowerCase().includes(search));
    }
    return list;
  };

  const handleTradeExpire = (id) => setActiveTrades(prev => prev.filter(t =>
    t.id !== id ||
    ['PAYMENT_SENT','DISPUTED'].includes(t.status) ||
    !t.expires_at  // server cleared the deadline (buyer marked paid) — never remove
  ));

  const handleCreateOffer = () => {
    if (!user) { navigate('/login?message=Please log in to create an offer'); return; }
    const balanceUsd = userBtcBalance * btcPrice;
    if (balanceUsd < 10) {
      toast.warn(
        <span className="inline-flex items-start gap-2"><AlertTriangle size={16} className="flex-shrink-0 mt-0.5"/> Your wallet has ${balanceUsd.toFixed(2)}. Load at least $10 in BTC — your offer will only show in the market once your balance is $10+.</span>,
        { autoClose: 6000 }
      );
    }
    navigate('/create-offer');
  };

  const handleBuy = (id) => {
    if (!user) {
      navigate('/login?message=Please log in to start trading');
      return;
    }
    navigate(`/listing/${id}`);
  };

  const filtered = getFiltered();
  const cur = selCurrency.code;
  const sym = selCurrency.symbol;
  const usdRate = USD_RATES[cur] || 1;
  const btcLocal = btcPrice * usdRate;
  const selPmInfo = PAYMENT_OPTIONS.find(p => p.value === selPayment);
  const onlineCnt = listings.filter(l => (Date.now() - new Date(l.users?.last_seen_at || l.users?.last_login || 0)) / 1000 < 300).length;
  const sellerCount = new Set(listings.map(l => l.seller_id)).size;

  // Active Trader of the Week — Iraqiy_Xchange MTN Mobile Money offer only
  const ACTIVE_TRADER_USERNAME = 'iraqiy_xchange';
  const activeTraderListingId = listings.find(l =>
    (l.users?.username || '').toLowerCase() === ACTIVE_TRADER_USERNAME &&
    /mtn/i.test(l.payment_method || '')
  )?.id || null;

  const hasFilters = selPayment !== 'all' || buyAmt || selCountry.code !== 'ALL' || selCurrency.code !== 'USD' || !!traderSearch.trim();

  return (
    <div className="min-h-screen flex flex-col"
      style={{backgroundColor:C.g100, fontFamily:"'DM Sans',sans-serif"}}>
      <SEO />
      <style>{`
        @keyframes slideUp { from{transform:translateY(100%);opacity:0} to{transform:translateY(0);opacity:1} }
        @keyframes featuredPulse { 0%,100%{box-shadow:0 0 0 3px rgba(5,150,105,0.25),0 8px 32px rgba(5,150,105,0.15)} 50%{box-shadow:0 0 0 6px rgba(5,150,105,0.45),0 16px 48px rgba(5,150,105,0.28)} }
        @keyframes shimmer { 0%{transform:translateX(-130%)} 100%{transform:translateX(130%)} }
        input[type=number]::-webkit-inner-spin-button,
        input[type=number]::-webkit-outer-spin-button { -webkit-appearance:none; margin:0; }
        * { -webkit-tap-highlight-color: transparent; box-sizing: border-box; }
        html, body { overscroll-behavior: none; }
      `}</style>

      {/* ══ 1. RATE BAR ════════════════════════════════════════ */}
      <div style={{backgroundColor:C.forest}} className="w-full flex-shrink-0">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 py-2 sm:py-2.5">
          <div className="flex items-center justify-between gap-3">

            <div className="flex-1 min-w-0">
              <p className="text-base sm:text-xl md:text-3xl font-black text-white leading-tight mb-1.5">
                Buy Bitcoin with{' '}
                <span style={{color:C.gold}}>
                  {selPayment==='all' ? 'Local Currency' : (selPmInfo?.label || 'Mobile Money')}
                </span>
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-semibold" style={{color:'rgba(255,255,255,0.5)'}}>
                  1 BTC = <span className="font-black" style={{color:'rgba(255,255,255,0.9)'}}>${fmt(btcPrice)} USD</span>
                </span>
                <span style={{color:'rgba(255,255,255,0.2)', fontSize:10}}>|</span>
                <span className="text-xs font-semibold" style={{color:'rgba(255,255,255,0.5)'}}>
                  1 USD = <span className="font-black" style={{color:'rgba(255,255,255,0.75)'}}>
                    {cur==='USD' ? `₵${fmt(USD_RATES['GHS']||1,2)} GHS` : `${sym}${fmt(usdRate,2)} ${cur}`}
                  </span>
                </span>
              </div>
            </div>

            <button onClick={loadListings}
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
          <div className="flex-1 relative">
            <button onClick={()=>setShowBuyMenu(v=>!v)}
              className="w-full text-center py-3 text-xs font-black border-b-2 transition-all flex items-center justify-center gap-1"
              style={{borderColor:C.forest, color:C.forest, backgroundColor:`${C.forest}18`}}>
              Buy BTC <ChevronDown size={12} className={`transition-transform ${showBuyMenu?'rotate-180':''}`}/>
            </button>
            {showBuyMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={()=>setShowBuyMenu(false)}/>
                <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1.5 w-52 rounded-2xl border shadow-xl overflow-hidden z-50 bg-white"
                  style={{borderColor:C.g200}}>
                  <button onClick={()=>setShowBuyMenu(false)}
                    className="w-full flex items-center gap-2.5 px-3.5 py-3 text-left transition"
                    style={{backgroundColor:'rgba(247,147,26,0.08)'}}>
                    <span className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 font-black text-xs text-white"
                      style={{background:'linear-gradient(135deg,#F7931A,#e8830a)'}}>₿</span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-xs font-black" style={{color:C.g800}}>Bitcoin</span>
                      <span className="block text-[10px] font-semibold" style={{color:C.g400}}>BTC · you're here</span>
                    </span>
                    <CheckCircle size={14} style={{color:'#e8830a', flexShrink:0}}/>
                  </button>
                  <button onClick={()=>{setShowBuyMenu(false); navigate('/buy-usdt');}}
                    className="w-full flex items-center gap-2.5 px-3.5 py-3 text-left hover:bg-gray-50 transition border-t"
                    style={{borderColor:C.g100}}>
                    <span className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 font-black text-xs text-white"
                      style={{background:'#26A17B'}}>₮</span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-xs font-black" style={{color:C.g800}}>Tether</span>
                      <span className="block text-[10px] font-semibold" style={{color:C.g400}}>USDT</span>
                    </span>
                    <ArrowRight size={13} style={{color:C.g300}}/>
                  </button>
                </div>
              </>
            )}
          </div>

          <div className="flex-1 relative">
            <button onClick={()=>setShowSellMenu(v=>!v)}
              className="w-full text-center py-3 text-xs font-black border-b-2 border-transparent transition-all flex items-center justify-center gap-1"
              style={{color:C.g400}}>
              Sell <ChevronDown size={12} className={`transition-transform ${showSellMenu?'rotate-180':''}`}/>
            </button>
            {showSellMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={()=>setShowSellMenu(false)}/>
                <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1.5 w-52 rounded-2xl border shadow-xl overflow-hidden z-50 bg-white"
                  style={{borderColor:C.g200}}>
                  <button onClick={()=>{setShowSellMenu(false); navigate('/sell-bitcoin');}}
                    className="w-full flex items-center gap-2.5 px-3.5 py-3 text-left hover:bg-gray-50 transition">
                    <span className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 font-black text-xs text-white"
                      style={{background:'linear-gradient(135deg,#F7931A,#e8830a)'}}>₿</span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-xs font-black" style={{color:C.g800}}>Bitcoin</span>
                      <span className="block text-[10px] font-semibold" style={{color:C.g400}}>BTC</span>
                    </span>
                    <ArrowRight size={13} style={{color:C.g300}}/>
                  </button>
                  <button onClick={()=>{setShowSellMenu(false); navigate('/sell-usdt');}}
                    className="w-full flex items-center gap-2.5 px-3.5 py-3 text-left hover:bg-gray-50 transition border-t"
                    style={{borderColor:C.g100}}>
                    <span className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 font-black text-xs text-white"
                      style={{background:'#26A17B'}}>₮</span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-xs font-black" style={{color:C.g800}}>Tether</span>
                      <span className="block text-[10px] font-semibold" style={{color:C.g400}}>USDT</span>
                    </span>
                    <ArrowRight size={13} style={{color:C.g300}}/>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Getting-started guide — shown to logged-in users who haven't funded their wallet yet */}
      {user && userBtcBalance * btcPrice < 10 && <GettingStartedSteps userId={user.id} />}

      {/* Low-balance reminder — shown to logged-in sellers whose BTC is below $10 */}
      {user && userBtcBalance * btcPrice < 10 && (
        <div className="flex-shrink-0 px-3 pt-3">
          <div className="max-w-7xl mx-auto rounded-2xl overflow-hidden shadow-lg"
            style={{border:'2px solid #B91C1C'}}>
            <div className="flex items-center gap-2 px-4 py-2.5"
              style={{background:'linear-gradient(135deg,#991B1B,#DC2626)'}}>
              <Siren size={18} className="text-white flex-shrink-0"/>
              <span className="text-xs sm:text-sm font-black text-white tracking-wide uppercase">
                Action Required — Your Offer Is Not Visible To Buyers
              </span>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-4" style={{backgroundColor:'#FEF2F2'}}>
              <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{backgroundColor:'#FEE2E2'}}>
                <Wallet size={20} style={{color:'#B91C1C'}}/>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-base font-black" style={{color:'#7F1D1D'}}>Keep your wallet funded to stay active</p>
                <p className="text-sm mt-1 leading-relaxed font-semibold" style={{color:'#B91C1C'}}>
                  Your Bitcoin wallet must have at least <strong>$10 and above</strong> for your buy and sell offers to appear in the marketplace — and to unlock your first bonus on your way to becoming a vendor.
                  Current balance: <strong>${(userBtcBalance * btcPrice).toFixed(2)}</strong>.
                  Top up now to activate your offer.
                </p>
              </div>
              <button
                onClick={()=>navigate('/wallet')}
                className="flex-shrink-0 w-full sm:w-auto px-6 py-3 rounded-xl text-sm font-black text-white shadow-md hover:opacity-90 transition"
                style={{background:'linear-gradient(135deg,#B91C1C,#DC2626)'}}>
                Top Up Now →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ 3. FILTER BAR ══════════════════════════════════════ */}
      <div className="bg-white border-b flex-shrink-0" style={{borderColor:C.g200}}>
        <div className="max-w-7xl mx-auto px-3 py-3 space-y-2">

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">

            <div>
              <p className="text-xs font-black mb-1 tracking-wide" style={{color:C.g500}}>AMOUNT</p>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-black pointer-events-none select-none"
                  style={{color:buyAmt?C.forest:C.g400}}>{sym}</span>
                <input
                  type="number" min="0" placeholder="e.g. 50"
                  value={buyAmt}
                  onChange={e=>setBuyAmt(e.target.value)}
                  className="w-full pl-6 pr-7 py-2.5 rounded-xl border-2 font-black focus:outline-none"
                  style={{borderColor:buyAmt?C.forest:C.g200, color:C.g800, backgroundColor:buyAmt?`${C.forest}08`:'transparent', fontSize:'16px'}}
                />
                {buyAmt&&(
                  <button onClick={()=>setBuyAmt('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center rounded-full"
                    style={{backgroundColor:C.g200}}>
                    <X size={9} style={{color:C.g600}}/>
                  </button>
                )}
              </div>
            </div>

            <div className="relative" ref={currencyRef}>
              <p className="text-xs font-black mb-1 tracking-wide" style={{color:C.g500}}>CURRENCY</p>
              <button
                onClick={()=>{setShowCurrency(!showCurrency);setShowCountry(false);setShowPayment(false);}}
                className="w-full flex items-center gap-1.5 px-2.5 py-2.5 rounded-xl border-2 font-bold transition"
                style={{
                  borderColor:     selCurrency.code!=='USD' ? C.forest : C.g200,
                  color:           selCurrency.code!=='USD' ? C.forest : C.g600,
                  backgroundColor: selCurrency.code!=='USD' ? `${C.forest}08` : 'transparent',
                }}>
                <span className="text-xs font-black flex-shrink-0">{selCurrency.symbol}</span>
                <span className="text-xs font-black flex-1 text-left truncate">{selCurrency.code}</span>
                <ChevronDown size={11} className={`transition-transform flex-shrink-0 ${showCurrency?'rotate-180':''}`}
                  style={{color:selCurrency.code!=='USD' ? C.forest : C.g400}}/>
              </button>
              {showCurrency && (
                <div className="absolute top-full right-0 mt-1.5 bg-white rounded-2xl shadow-2xl z-50 border overflow-hidden"
                  style={{borderColor:C.g100,minWidth:'220px',maxWidth:'calc(100vw - 24px)'}}>
                  <div className="p-2 border-b sticky top-0 bg-white relative" style={{borderColor:C.g100}}>
                    <Search size={13} style={{position:'absolute',left:16,top:'50%',transform:'translateY(-50%)',color:C.g400,pointerEvents:'none'}}/>
                    <input type="text" placeholder="Search currency…"
                      value={currencySearch} onChange={e=>setCurrencySearch(e.target.value)}
                      autoFocus
                      className="w-full pl-8 pr-3 py-1.5 font-semibold rounded-xl border focus:outline-none"
                      style={{borderColor:C.g200,color:C.g800,fontSize:'16px'}}/>
                  </div>
                  <div className="overflow-y-auto max-h-56">
                    {CURRENCIES.filter(c=>!currencySearch||c.code.toLowerCase().includes(currencySearch.toLowerCase())||c.name.toLowerCase().includes(currencySearch.toLowerCase())).map(c=>(
                      <button key={c.code} onClick={()=>{setSelCurrency(c);setShowCurrency(false);setCurrencySearch('');}}
                        className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-gray-50 border-b last:border-0 transition"
                        style={{borderColor:C.g50,backgroundColor:selCurrency.code===c.code?`${C.forest}08`:'transparent'}}>
                        <span className="text-sm font-black flex-shrink-0 w-8 text-center" style={{color:C.g700}}>{c.symbol}</span>
                        <div className="flex-1 text-left min-w-0">
                          <p className="font-bold text-xs" style={{color:C.g800}}>{c.code}</p>
                          <p className="text-xs truncate" style={{color:C.g400}}>{c.name}</p>
                        </div>
                        {selCurrency.code===c.code&&<CheckCircle size={11} style={{color:C.green,flexShrink:0}}/>}
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
                  borderColor:     selPayment!=='all' ? C.forest : C.g200,
                  color:           selPayment!=='all' ? C.forest : C.g600,
                  backgroundColor: selPayment!=='all' ? `${C.forest}08` : 'transparent',
                }}>
                <span className="text-sm leading-none flex-shrink-0 flex items-center">{PAYMENT_OPTIONS.find(p=>p.value===selPayment)?.icon||<CreditCard size={13}/>}</span>
                <span className="text-xs font-black truncate flex-1 text-left">
                  {PAYMENT_OPTIONS.find(p=>p.value===selPayment)?.label||'All Methods'}
                </span>
                <ChevronDown size={11} className={`transition-transform flex-shrink-0 ${showPayment?'rotate-180':''}`}
                  style={{color:selPayment!=='all' ? C.forest : C.g400}}/>
              </button>
              {showPayment && (
                <div className="absolute top-full left-0 mt-1.5 bg-white rounded-2xl shadow-2xl z-50 border overflow-hidden"
                  style={{borderColor:C.g100,minWidth:'220px',maxWidth:'calc(100vw - 24px)'}}>
                  <div className="p-2 border-b sticky top-0 bg-white relative" style={{borderColor:C.g100}}>
                    <Search size={13} style={{position:'absolute',left:16,top:'50%',transform:'translateY(-50%)',color:C.g400,pointerEvents:'none'}}/>
                    <input type="text" placeholder="Search payment…"
                      value={paymentSearch} onChange={e=>setPaymentSearch(e.target.value)}
                      autoFocus
                      className="w-full pl-8 pr-3 py-1.5 font-semibold rounded-xl border focus:outline-none"
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
                          style={{backgroundColor:selPayment===p.value?`${C.forest}08`:'transparent'}}>
                          <span className="text-sm flex-shrink-0">{p.icon}</span>
                          <span className="flex-1 text-left font-semibold text-xs leading-tight" style={{color:C.g800}}>{p.label}</span>
                          {selPayment===p.value && <CheckCircle size={11} style={{color:C.green,flexShrink:0}}/>}
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
                  borderColor:     selCountry.code!=='ALL' ? C.forest : C.g200,
                  color:           selCountry.code!=='ALL' ? C.forest : C.g600,
                  backgroundColor: selCountry.code!=='ALL' ? `${C.forest}08` : 'transparent',
                }}>
                <span className="text-sm leading-none flex-shrink-0">{selCountry.flag}</span>
                <span className="text-xs font-black truncate flex-1 text-left">{selCountry.name}</span>
                <ChevronDown size={11} className={`transition-transform flex-shrink-0 ${showCountry?'rotate-180':''}`}
                  style={{color:selCountry.code!=='ALL' ? C.forest : C.g400}}/>
              </button>
              {showCountry && (
                <div className="absolute top-full right-0 mt-1.5 bg-white rounded-2xl shadow-2xl z-50 border overflow-hidden"
                  style={{borderColor:C.g100,minWidth:'240px',maxWidth:'calc(100vw - 24px)'}}>
                  <div className="p-2 border-b sticky top-0 bg-white relative" style={{borderColor:C.g100}}>
                    <Search size={13} style={{position:'absolute',left:16,top:'50%',transform:'translateY(-50%)',color:C.g400,pointerEvents:'none'}}/>
                    <input type="text" placeholder="Search country…"
                      value={countrySearch} onChange={e=>setCountrySearch(e.target.value)}
                      autoFocus
                      className="w-full pl-8 pr-3 py-1.5 font-semibold rounded-xl border focus:outline-none"
                      style={{borderColor:C.g200,color:C.g800,fontSize:'16px'}}/>
                  </div>
                  <div className="overflow-y-auto max-h-60">
                    {(() => {
                      const q = countrySearch.toLowerCase();
                      const filtered = COUNTRIES.filter(c=>!q||c.name.toLowerCase().includes(q));
                      let lastReg = null;
                      return filtered.map(c=>{
                        const regHdr = !q && c.region && c.region!==lastReg
                          ? (lastReg=c.region, <div key={`r-${c.region}`} className="px-3 py-1" style={{backgroundColor:'#F8FAFC'}}>
                              <span className="text-xs font-black uppercase tracking-wider" style={{color:COUNTRY_REGIONS[c.region]||C.g500}}>{c.region}</span>
                            </div>)
                          : (c.region&&(lastReg=c.region), null);
                        return [regHdr,
                          <button key={c.code} onClick={()=>{setSelCountry(c);setShowCountry(false);setCountrySearch('');if(c.currency){const matched=CURRENCIES.find(cur=>cur.code===c.currency);if(matched)setSelCurrency(matched);}}}
                            className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-gray-50 border-b last:border-0 transition"
                            style={{borderColor:C.g50,backgroundColor:selCountry.code===c.code?`${C.forest}08`:'transparent'}}>
                            <span className="text-base flex-shrink-0">{c.flag}</span>
                            <div className="flex-1 text-left min-w-0">
                              <p className="font-bold text-xs truncate" style={{color:C.g800}}>{c.name}</p>
                              {c.currency&&<p className="text-xs" style={{color:C.g400}}>{c.symbol} {c.currency}</p>}
                            </div>
                            {selCountry.code===c.code&&<CheckCircle size={11} style={{color:C.green,flexShrink:0}}/>}
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
            <div className="relative" ref={sortRef}>
              <button onClick={()=>setShowSortMenu(!showSortMenu)}
                className="flex-shrink-0 px-2.5 py-2 font-bold border-2 rounded-xl focus:outline-none flex items-center gap-1 bg-white"
                style={{borderColor:sortBy!=='rate_low'?C.forest:C.g200, color:C.g800, fontSize:'13px'}}>
                <span>{sortBy === 'rate_low' ? 'Best Rate' : sortBy === 'rating' ? 'Top Rated' : 'Most Trades'}</span>
                <ChevronDown size={11} className={`transition-transform ${showSortMenu?'rotate-180':''}`}/>
              </button>
              {showSortMenu && (
                <div className="absolute bottom-full left-0 mb-1.5 bg-white rounded-xl shadow-xl z-50 border overflow-hidden"
                  style={{borderColor:C.g200, minWidth:'120px'}}>
                  {[
                    {value:'rate_low', label:'Best Rate'},
                    {value:'rating', label:'Top Rated'},
                    {value:'trades', label:'Most Trades'}
                  ].map(opt=>(
                    <button key={opt.value} onClick={()=>{setSortBy(opt.value); setShowSortMenu(false);}}
                      className="w-full text-left px-3 py-2 text-xs font-bold hover:bg-gray-50 transition"
                      style={{backgroundColor: sortBy===opt.value ? `${C.forest}08` : 'transparent', color: sortBy===opt.value ? C.forest : C.g800}}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0 flex items-center border-2 rounded-xl overflow-hidden"
              style={{borderColor:traderSearch.trim()?C.forest:C.g200}}>
              <input
                type="text"
                placeholder="Search seller…"
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
              style={{backgroundColor:C.forest, whiteSpace:'nowrap'}}>
              <PlusCircle size={12}/> Create
            </button>
            {hasFilters && (
              <button onClick={()=>{setBuyAmt('');setSelPayment('all');setSelCountry(COUNTRIES[0]);setSelCurrency(CURRENCIES[0]);setSortBy('rate_low');setPaymentSearch('');setTraderSearch('');setCurrencySearch('');setCountrySearch('');}}
                className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-xl text-xs font-black border-2 transition"
                style={{borderColor:C.danger, color:C.danger, backgroundColor:'#FEF2F2'}}>
                <X size={12}/>
              </button>
            )}
          </div>

        </div>
      </div>

      {/* ── Inline active trade cards ── */}
      {activeTrades.length > 0 && (
        <div className="px-3 mb-2 max-w-7xl mx-auto w-full">
          {activeTrades.slice(0, showAllTrades ? activeTrades.length : 3).map(trade => (
            <ActiveTradeCard key={trade.id} trade={trade} pageColor="#1B4332" onExpire={handleTradeExpire} />
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
            const onlineCount = filtered.filter(l => {
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
                  <span className="font-black" style={{color:C.g800}}>{filtered.length}</span> active offer{filtered.length!==1?'s':''}
                  {selCountry.code!=='ALL' ? ` in ${selCountry.flag} ${selCountry.name}` : ''}
                </span>
              </div>
            );
          })()}

        </div>

        {(loading && !listings.length) || retrying ? (
          <div className="bg-white rounded-2xl border p-8 text-center" style={{borderColor:C.g200}}>
            <p className="mb-3 flex justify-center"><Hourglass size={44} style={{color:C.g400}}/></p>
            <p className="font-black text-base mb-1" style={{color:C.g800}}>
              {retrying ? 'Waking up server…' : 'Loading offers…'}
            </p>
            <p className="text-sm" style={{color:C.g400}}>
              {retrying ? 'Our server is starting up, this takes a few seconds' : 'Fetching the latest offers for you'}
            </p>
            <div className="flex justify-center mt-4">
              <div className="w-8 h-8 border-4 rounded-full animate-spin" style={{borderColor:`${C.forest}40`, borderTopColor:'transparent'}}/>
            </div>
          </div>
        ) : loadError && !listings.length ? (
          <div className="bg-white rounded-2xl border p-8 text-center" style={{borderColor:C.g200}}>
            <p className="mb-3 flex justify-center"><ServerCrash size={44} style={{color:C.g400}}/></p>
            <p className="font-black text-base mb-1" style={{color:C.g800}}>Couldn't load offers</p>
            <p className="text-sm mb-4" style={{color:C.g400}}>Server may be busy. Please try again.</p>
            <button onClick={()=>{ setLoading(true); loadListings(1, true); }}
              className="px-6 py-2.5 rounded-xl text-white text-sm font-black hover:opacity-90 transition flex items-center gap-2 mx-auto"
              style={{backgroundColor:C.forest}}>
              <RefreshCw size={14}/> Try Again
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-2xl border p-6 sm:p-10 text-center" style={{borderColor:C.g200}}>
            <p className="mb-4 flex justify-center"><SearchX size={44} style={{color:C.g400}}/></p>
            <p className="font-black text-base mb-1" style={{color:C.g800}}>No offers found</p>
            <p className="text-sm" style={{color:C.g400}}>Adjust your filters or create the first offer</p>
            <button onClick={()=>handleCreateOffer()}
              className="mt-4 px-6 py-2.5 rounded-xl text-white text-sm font-black hover:opacity-90 transition"
              style={{backgroundColor:C.forest}}>
              Create Offer
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 w-full">
            {filtered.map(l=>(
              <div key={l.id} className="w-full">
                <OfferCard
                  listing={l}
                  btcPriceUSD={btcPrice}
                  userBuyAmt={buyAmt}
                  featuredType={l.id === activeTraderListingId ? 'active_trader' : undefined}
                  liveSeenAt={liveStatus[l.users?.id] || null}
                  onViewSeller={()=>{
                    setModal({seller:l.users||{}, listing:l});
                    const tk = localStorage.getItem('token');
                    axios.post(`${API_URL}/offers/${l.id}/view`, {}, tk ? { headers: { Authorization: `Bearer ${tk}` } } : {}).catch(()=>{});
                  }}
                  onBuy={()=>handleBuy(l.id)}
                  liked={liked.has(l.id)}
                  onToggleLike={()=>setLiked(prev=>{
                    const n=new Set(prev);
                    n.has(l.id) ? n.delete(l.id) : n.add(l.id);
                    return n;
                  })}
                />
              </div>
            ))}
          </div>
        )}

        {/* ── Trade Safety Banner ── */}
        <div style={{display:'flex',alignItems:'center',gap:11,padding:'13px 15px',borderRadius:12,background:'linear-gradient(135deg,#FFFBEB,#FEF3C7)',border:'1.5px solid #FCD34D',boxShadow:'0 2px 8px rgba(217,119,6,0.12)'}}>
          <div style={{width:34,height:34,borderRadius:9,background:'#FDE68A',border:'1px solid #FCD34D',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
            <AlertTriangle size={17} style={{color:'#B45309'}}/>
          </div>
          <div>
            <p style={{margin:0,fontSize:13,fontWeight:900,color:'#92400E',lineHeight:1.3}}>Trade Safely</p>
            <p style={{margin:0,fontSize:11,color:'#92400E',fontWeight:600,lineHeight:1.4,marginTop:1}}>Never send payment outside an active trade. All trades are escrow-protected.</p>
          </div>
        </div>

        {/* ── NEW USER BONUS CARD ── */}
        {!user && (
        <div style={{borderRadius:14,overflow:'hidden',boxShadow:'0 4px 20px rgba(27,67,50,0.18)'}}>
          <div style={{background:'linear-gradient(135deg,#1B4332 0%,#2D6A4F 60%,#40916C 100%)',padding:'14px 14px 12px',position:'relative'}}>
            {/* Dot pattern */}
            <div style={{position:'absolute',inset:0,opacity:0.06,backgroundImage:'radial-gradient(circle at 2px 2px,white 1px,transparent 0)',backgroundSize:'16px 16px',pointerEvents:'none'}}/>
            {/* Gold accent top border */}
            <div style={{position:'absolute',top:0,left:0,right:0,height:3,background:'linear-gradient(90deg,#F4A422,#FBBF24,#F4A422)',borderRadius:'14px 14px 0 0'}}/>
            <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:8,marginBottom:10,position:'relative'}}>
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                <div style={{width:32,height:32,borderRadius:10,background:'#F4A422',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,boxShadow:'0 2px 8px rgba(244,164,34,0.45)'}}><Gift size={16} style={{color:'#1B4332'}}/></div>
                <div>
                  <p style={{margin:0,fontSize:12,fontWeight:900,color:'#FFFFFF',lineHeight:1.2}}>New users earn <span style={{color:'#F4A422'}}>$2 FREE Bitcoin!</span></p>
                  <p style={{margin:0,fontSize:9,color:'rgba(255,255,255,0.55)',marginTop:2}}>Offer valid 30 days · Limited time</p>
                </div>
              </div>
              <button onClick={()=>navigate('/register')}
                style={{flexShrink:0,padding:'6px 12px',borderRadius:8,border:'none',cursor:'pointer',background:'#F4A422',color:'#1B4332',fontWeight:900,fontSize:10,whiteSpace:'nowrap',boxShadow:'0 2px 8px rgba(244,164,34,0.4)'}}>
                Claim →
              </button>
            </div>
            {/* 3-step flow */}
            <div style={{display:'grid',gridTemplateColumns:'1fr auto 1fr auto 1fr',alignItems:'center',gap:3,position:'relative'}}>
              {[
                {icon:<CheckCircle size={13} style={{color:'#fff'}}/>,label:'Register',sub:'$1 locked'},
                {icon:<Zap size={13} style={{color:'#fff'}}/>,label:'Verify',  sub:'stays safe'},
                {icon:<Bitcoin size={13} style={{color:'#fff'}}/>, label:'1 Trade', sub:'$2 unlocks'},
              ].map(({icon,label,sub},i,arr)=>(
                <>
                  <div key={label} style={{background:'rgba(255,255,255,0.08)',border:'1px solid rgba(255,255,255,0.14)',borderRadius:8,padding:'6px 4px',textAlign:'center'}}>
                    <div style={{fontSize:13,lineHeight:1,marginBottom:2}}>{icon}</div>
                    <div style={{fontSize:9,fontWeight:800,color:'#fff',lineHeight:1}}>{label}</div>
                    <div style={{fontSize:7,color:'rgba(255,255,255,0.45)',marginTop:2,lineHeight:1}}>{sub}</div>
                  </div>
                  {i < arr.length-1 && <div key={`sep-${i}`} style={{fontSize:10,color:'rgba(255,255,255,0.25)',textAlign:'center',flexShrink:0}}>›</div>}
                </>
              ))}
            </div>
          </div>
        </div>
        )}

        {/* ── AFFILIATE PROMO CARD ── */}
        <div style={{borderRadius:16,overflow:'hidden',boxShadow:'0 6px 28px rgba(27,67,50,0.22)'}}>

          {/* Header — brand gradient with subtle pattern + glow for a premium, eye-catching feel */}
          <div style={{padding:'20px 18px 18px',background:`linear-gradient(135deg,${C.forest},${C.green})`,position:'relative',overflow:'hidden'}}>
            <div style={{position:'absolute',inset:0,opacity:0.08,backgroundImage:'radial-gradient(circle at 2px 2px,white 1px,transparent 0)',backgroundSize:'18px 18px'}}/>
            <div style={{position:'absolute',top:-30,right:-20,width:140,height:140,borderRadius:'50%',background:C.gold,opacity:0.15,filter:'blur(40px)'}}/>
            <div style={{position:'relative',display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}>
              <div>
                <div style={{display:'flex',alignItems:'center',gap:7,marginBottom:8}}>
                  <span style={{display:'flex',alignItems:'center',gap:4,fontSize:11,fontWeight:900,color:C.forest,background:C.gold,borderRadius:6,padding:'3px 9px',letterSpacing:0.5,textTransform:'uppercase'}}>
                    <Bitcoin size={11}/>Affiliate
                  </span>
                  <span style={{display:'flex',alignItems:'center',gap:4,fontSize:9,fontWeight:700,color:'#fff',background:'rgba(255,255,255,0.15)',borderRadius:5,padding:'2px 8px'}}>
                    <span style={{width:6,height:6,borderRadius:'50%',background:'#6EE7B7',display:'inline-block'}}/>LIVE
                  </span>
                </div>
                <p style={{margin:0,fontSize:20,fontWeight:900,color:'#fff',lineHeight:1.2}}>Invite friends. Earn BTC forever.</p>
                <p style={{margin:0,fontSize:12,color:'rgba(255,255,255,0.7)',marginTop:5,fontWeight:500}}>Earn on every trade your referrals make — for life.</p>
              </div>
              <button onClick={()=>navigate(user ? '/dashboard?tab=affiliate' : '/register')}
                style={{flexShrink:0,padding:'12px 20px',borderRadius:11,border:'none',cursor:'pointer',background:C.gold,color:C.forest,fontWeight:900,fontSize:13,whiteSpace:'nowrap',boxShadow:'0 4px 16px rgba(244,164,34,0.45)'}}>
                Get Link <ArrowRight size={14} style={{display:'inline',marginLeft:4,verticalAlign:'-2px'}}/>
              </button>
            </div>
          </div>

          {/* Commission tiers — single brand-color progression (mint → gold), not a rainbow */}
          <div style={{padding:'12px 16px',background:'#fff',borderBottom:`1px solid ${C.g100}`}}>
            <p style={{margin:'0 0 8px',fontSize:10,fontWeight:800,color:C.g500,textTransform:'uppercase',letterSpacing:0.8}}>Commission Tiers</p>
            <div style={{position:'relative'}}>
              <div style={{display:'flex',gap:6,overflowX:'auto',paddingBottom:2}}>
                {[
                  {refs:'0–9',   rate:'0.20%', c:C.mint},
                  {refs:'10–24', rate:'0.25%', c:C.green},
                  {refs:'25–49', rate:'0.35%', c:C.forest},
                  {refs:'50–99', rate:'0.40%', c:'#B8811A'},
                  {refs:'100+',  rate:'0.50%', c:C.gold},
                ].map(t=>(
                  <div key={t.refs} style={{flex:'0 0 auto',background:`${t.c}0D`,border:`1.5px solid ${t.c}30`,borderRadius:10,padding:'9px 12px',textAlign:'center',minWidth:58}}>
                    <div style={{fontSize:14,fontWeight:900,color:t.c,lineHeight:1}}>{t.rate}</div>
                    <div style={{fontSize:9,color:C.g400,fontWeight:600,marginTop:3,lineHeight:1}}>{t.refs} refs</div>
                  </div>
                ))}
              </div>
              <div style={{
                position:'absolute',top:0,right:0,bottom:2,width:24,
                background:'linear-gradient(to right, transparent, #ffffff)',
                pointerEvents:'none',
              }}/>
            </div>
          </div>

          {/* Leaderboard */}
          {affLeaderboard.length > 0 && (
            <div style={{background:'#fff'}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'7px 14px 6px',background:C.mist}}>
                <div style={{display:'flex',alignItems:'center',gap:5}}>
                  <Trophy size={11} style={{color:C.gold}}/>
                  <span style={{fontSize:9,fontWeight:900,color:C.forest,textTransform:'uppercase',letterSpacing:0.8}}>Top Earners</span>
                </div>
                <span style={{fontSize:9,color:C.green,fontWeight:600,background:'#fff',borderRadius:4,padding:'1px 6px'}}>All Time</span>
              </div>
              {affLeaderboard.map((u,i)=>{
                const bc = BADGE_COLORS[u.badge] || '#64748B';
                const rankBg = i===0?C.gold:i===1?C.g300:'#C08A4E';
                const earnedUsd = ((u.earned_btc||0)*(btcPrice||76000));
                return (
                  <div key={u.username} style={{display:'flex',alignItems:'center',gap:9,padding:'7px 14px',borderTop:`1px solid ${C.g50}`}}>
                    <div style={{width:18,height:18,borderRadius:'50%',flexShrink:0,background:rankBg,display:'flex',alignItems:'center',justifyContent:'center'}}>
                      <span style={{fontSize:9,fontWeight:900,color:'#fff'}}>{i+1}</span>
                    </div>
                    <div style={{width:26,height:26,borderRadius:8,flexShrink:0,background:`${bc}15`,border:`1.5px solid ${bc}35`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,fontWeight:900,color:bc}}>
                      {(u.username||'?')[0].toUpperCase()}
                    </div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:'flex',alignItems:'center',gap:4}}>
<span style={{fontSize:10,fontWeight:800,color:'#1E293B',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:80}}>{u.username}</span>
                        <BadgeChip user={u} badgeName={u.badge} size="xs" />
                      </div>
                      <span style={{fontSize:8,color:C.g400,fontWeight:500}}>{u.referrals} referral{u.referrals !== 1 ? 's' : ''} · {u.affiliate_trades} ref trade{u.affiliate_trades !== 1 ? 's' : ''}</span>
                    </div>
                    <div style={{textAlign:'right',flexShrink:0}}>
                      <div style={{fontSize:11,fontWeight:900,color:C.gold,lineHeight:1}}>₿{(()=>{const v=parseFloat(u.earned_btc||0);return v>0&&v<0.0001?v.toFixed(8):v.toFixed(5);})()}</div>
                      <div style={{fontSize:8,color:C.g400,fontWeight:500,marginTop:1}}>${earnedUsd>=1000?(earnedUsd/1000).toFixed(1)+'k':earnedUsd>=1?earnedUsd.toFixed(2):earnedUsd<0.01?'<$0.01':earnedUsd.toFixed(2)}</div>
                    </div>
                  </div>
                );
              })}
              <div style={{padding:'6px 14px',background:C.mist,borderTop:`1px solid ${C.g100}`,textAlign:'center'}}>
                <span style={{fontSize:9,color:C.green,fontWeight:700}}>Could you be next? <span style={{textDecoration:'underline',cursor:'pointer'}} onClick={()=>navigate('/dashboard?tab=affiliate')}>View full leaderboard →</span></span>
              </div>
            </div>
          )}

          <p style={{margin:0,padding:'6px 14px 9px',textAlign:'center',fontSize:9,color:C.g400,fontWeight:600,letterSpacing:0.3,background:'#fff'}}>
            Free to join · No minimum payout · Lifetime commission
          </p>
        </div>

      </div>

      <PRQFooter/>

      {modal && (
        <ProfileModal
          seller={modal.seller}
          listing={modal.listing}
          btcPriceUSD={btcPrice}
          onClose={()=>setModal(null)}
          onTrade={()=>handleBuy(modal.listing?.id)}
        />
      )}
    </div>
  );
}