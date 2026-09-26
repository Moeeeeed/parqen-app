import { useState, useEffect, useRef } from 'react';
import { useRates } from '../contexts/RatesContext';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import SEO from '../components/SEO';
import axios from 'axios';
import {
  Bitcoin, CheckCircle, RefreshCw,
  AlertTriangle, BadgeCheck, Timer,
  X, Info, ArrowRight, PlusCircle, MapPin, Heart, Plus, SlidersHorizontal, Coins,
  Filter, Home, Wallet, User, Gift, Shield,
  ChevronDown, ThumbsUp, ThumbsDown, Repeat2,
  Phone, Mail, Ban, ArrowUp, ArrowDown, Trophy, Zap,
  Flame,
} from 'lucide-react';
import { toast } from 'react-toastify';
import CountryFlag, { resolveCode } from '../components/CountryFlag';
import { BadgeChip, BADGE_COLORS } from '../lib/badge';
import ActiveTradeCard from '../components/ActiveTradeCard';
import { getCachedActiveTrades, setCachedActiveTrades, isGiftCardTrade } from '../utils/activeTradesCache';
import PRQFooter from '../components/PRQFooter';
import GettingStartedSteps from '../components/GettingStartedSteps';
import CoinIcon from '../components/CoinIcon';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const C = {
  forest:'#1B4332', green:'#2D6A4F', mint:'#40916C',
  gold:'#F4A422', sell:'#D97706', sellBg:'#FFFBEB',
  mist:'#F0FAF5', white:'#FFFFFF',
  g50:'#F8FAFC', g100:'#F1F5F9', g200:'#E2E8F0',
  g300:'#CBD5E1', g400:'#94A3B8', g500:'#64748B',
  g600:'#475569', g700:'#334155', g800:'#1E293B',
  success:'#10B981', danger:'#EF4444', online:'#22C55E',
  warn:'#F59E0B',
};

// ── Featured badge config ─────────────────────────────────────────────────────
const FEATURED = {
  hot_offer: {
    TagIcon:     Flame,
    tag:         'HOT OFFER · TRENDING NOW',
    ribbon:      'linear-gradient(90deg,#78350F 0%,#C2410C 18%,#EA580C 38%,#FCD34D 50%,#EA580C 62%,#C2410C 82%,#78350F 100%)',
    border:      '#D97706',
    glow:        'rgba(217,119,6,0.38)',
    bg:          '#FFFBEB',
    bgGradient:  'linear-gradient(150deg,rgba(253,211,77,0.22) 0%,#FFFBEB 42%,rgba(234,88,12,0.12) 100%)',
    divider:     'rgba(217,119,6,0.22)',
    labelColor:  '#92400E',
    btnGradient: 'linear-gradient(135deg,#78350F 0%,#D97706 55%,#FBBF24 100%)',
    btnShadow:   '0 4px 20px rgba(217,119,6,0.50)',
    pulse:       true,
  },
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
  {code:'ALL', name:'All Countries',  flag:'🌍', currency:'USD', symbol:'$',    region:null},
  // Africa
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
  // Asia
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
  // Middle East
  {code:'AE',  name:'UAE',            flag:'🇦🇪', currency:'AED', symbol:'AED',  region:'Middle East'},
  {code:'SA',  name:'Saudi Arabia',   flag:'🇸🇦', currency:'SAR', symbol:'SR',   region:'Middle East'},
  // Americas
  {code:'US',  name:'United States',  flag:'🇺🇸', currency:'USD', symbol:'$',    region:'Americas'},
  {code:'BR',  name:'Brazil',         flag:'🇧🇷', currency:'BRL', symbol:'R$',   region:'Americas'},
  {code:'MX',  name:'Mexico',         flag:'🇲🇽', currency:'MXN', symbol:'MX$',  region:'Americas'},
  {code:'CO',  name:'Colombia',       flag:'🇨🇴', currency:'COP', symbol:'COP$', region:'Americas'},
  // Europe
  {code:'GB',  name:'United Kingdom', flag:'🇬🇧', currency:'GBP', symbol:'£',    region:'Europe'},
  {code:'TR',  name:'Turkey',         flag:'🇹🇷', currency:'TRY', symbol:'₺',    region:'Europe'},
  {code:'PL',  name:'Poland',         flag:'🇵🇱', currency:'PLN', symbol:'zł',   region:'Europe'},
  {code:'UA',  name:'Ukraine',        flag:'🇺🇦', currency:'UAH', symbol:'₴',    region:'Europe'},
  {code:'EU',  name:'Europe (EUR)',   flag:'🇪🇺', currency:'EUR', symbol:'€',    region:'Europe'},
];

const PAYMENT_OPTIONS = [
  {value:'all',            label:'All Methods',                   icon:'💳', cat:null},
  // Mobile Money
  {value:'mtn_momo',            label:'MTN Mobile Money',              icon:'📱', cat:'Mobile Money'},
  {value:'vodafone',       label:'Vodafone Cash',                 icon:'📱', cat:'Mobile Money'},
  {value:'airteltigo',     label:'AirtelTigo Money',              icon:'📱', cat:'Mobile Money'},
  {value:'mpesa',          label:'M-Pesa',                        icon:'📱', cat:'Mobile Money'},
  {value:'airtel money',   label:'Airtel Money',                  icon:'📱', cat:'Mobile Money'},
  {value:'orange money',   label:'Orange Money',                  icon:'📱', cat:'Mobile Money'},
  {value:'wave',           label:'Wave',                          icon:'🌊', cat:'Mobile Money'},
  {value:'chipper',        label:'Chipper Cash',                  icon:'💚', cat:'Mobile Money'},
  {value:'ecocash',        label:'EcoCash',                       icon:'📱', cat:'Mobile Money'},
  {value:'tigo pesa',      label:'Tigo Pesa / Mixx',              icon:'📱', cat:'Mobile Money'},
  {value:'moov money',     label:'Moov Money',                    icon:'📱', cat:'Mobile Money'},
  {value:'africell',       label:'Africell Money',                icon:'📱', cat:'Mobile Money'},
  {value:'paga',           label:'Paga',                          icon:'🟢', cat:'Mobile Money'},
  // Digital Wallet
  {value:'paypal',         label:'PayPal',                        icon:'💰', cat:'Digital Wallet'},
  {value:'cash app',       label:'Cash App',                      icon:'💸', cat:'Digital Wallet'},
  {value:'apple pay',      label:'Apple Pay',                     icon:'🍎', cat:'Digital Wallet'},
  {value:'alipay',         label:'Alipay',                        icon:'💙', cat:'Digital Wallet'},
  {value:'wechat',         label:'WeChat Pay',                    icon:'💬', cat:'Digital Wallet'},
  {value:'venmo',          label:'Venmo',                         icon:'🔵', cat:'Digital Wallet'},
  {value:'zelle',          label:'Zelle',                         icon:'💜', cat:'Digital Wallet'},
  {value:'revolut',        label:'Revolut',                       icon:'🔷', cat:'Digital Wallet'},
  {value:'skrill',         label:'Skrill',                        icon:'💳', cat:'Digital Wallet'},
  {value:'neteller',       label:'Neteller',                      icon:'💳', cat:'Digital Wallet'},
  {value:'payeer',         label:'Payeer',                        icon:'💳', cat:'Digital Wallet'},
  {value:'perfect money',  label:'Perfect Money',                 icon:'💳', cat:'Digital Wallet'},
  // Remittance
  {value:'wise',           label:'Wise',                          icon:'🌍', cat:'Remittance'},
  {value:'worldremit',     label:'WorldRemit',                    icon:'🌐', cat:'Remittance'},
  {value:'remitly',        label:'Remitly',                       icon:'🚀', cat:'Remittance'},
  {value:'western union',  label:'Western Union',                 icon:'🏢', cat:'Remittance'},
  {value:'moneygram',      label:'MoneyGram',                     icon:'🏢', cat:'Remittance'},
  // Bank
  {value:'bank transfer',  label:'Bank Transfer',                 icon:'🏦', cat:'Bank'},
  {value:'wire transfer',  label:'Wire Transfer',                 icon:'🔗', cat:'Bank'},
  {value:'mobile banking', label:'Mobile Banking App',            icon:'📲', cat:'Bank'},
  {value:'interbank',      label:'Interbank (GhIPSS/NIBSS/EFT)',  icon:'🏦', cat:'Bank'},
  {value:'ussd',           label:'USSD Bank Transfer',            icon:'📞', cat:'Bank'},
  {value:'instant eft',    label:'Instant EFT (South Africa)',    icon:'🏦', cat:'Bank'},
  {value:'cash deposit',   label:'Cash Deposit (Bank Counter)',   icon:'🏦', cat:'Bank'},
  // FinTech
  {value:'opay',           label:'OPay',                          icon:'🟢', cat:'FinTech'},
  {value:'palmpay',        label:'PalmPay',                       icon:'🌴', cat:'FinTech'},
  {value:'kuda',           label:'Kuda Bank',                     icon:'🏦', cat:'FinTech'},
  {value:'moniepoint',     label:'Moniepoint',                    icon:'🏦', cat:'FinTech'},
  {value:'paystack',       label:'Paystack',                      icon:'💚', cat:'FinTech'},
  {value:'flutterwave',    label:'Flutterwave (Barter)',           icon:'🦋', cat:'FinTech'},
  // Cash
  {value:'cash in person', label:'Cash in Person (Face-to-Face)', icon:'💵', cat:'Cash'},
  {value:'cash out',       label:'Cash Out',                      icon:'💵', cat:'Cash'},
  // Crypto
  {value:'usdt',           label:'USDT (Tether – TRC20)',          icon:'💵', cat:'Crypto'},
  {value:'binance pay',    label:'Binance Pay',                   icon:'🟡', cat:'Crypto'},
  {value:'bitcoin',        label:'Bitcoin (BTC)',                  icon:'₿',  cat:'Crypto'},
  {value:'ethereum',       label:'Ethereum (ETH)',                icon:'⬡',  cat:'Crypto'},
  {value:'luno',           label:'Luno Wallet',                   icon:'🌙', cat:'Crypto'},
  {value:'yellow card',    label:'Yellow Card Wallet',            icon:'💛', cat:'Crypto'},
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

// ── Avatar ────────────────────────────────────────────────────────────────────
const _avatarCache = {}; // userId → Promise<url> | url-string | null
function Avatar({user, size=48, radius='rounded-xl'}) {
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
   // ── Offer Card (Sell side) ────────────────────────────────────────────────────
function OfferCard({listing, btcPriceUSD, onViewBuyer, onSell, liked, onToggleLike, featuredType, liveSeenAt, userSellAmt}) {
  const { rates: USD_RATES } = useRates();
  const u         = getUser(listing.users);
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

  const examplePay = (userSellAmt && parseFloat(userSellAmt) > 0)
    ? parseFloat(userSellAmt)
    : (minLocal || Math.round(100*usdRate));
  const { btcReceived } = calcBtc(examplePay, btcPriceUSD, margin, usdRate);
  const fiatEquiv = parseFloat((btcReceived * btcPriceUSD * usdRate).toFixed(2));

  const marginLabel = margin===0 ? 'Market rate' : margin>0 ? `+${margin}% above market` : `${Math.abs(margin)}% below market`;
  const marginBg    = margin>0 ? C.danger : margin<0 ? C.success : C.g400;

  const pos   = parseInt(u.positive_feedback||0);
  const neg   = parseInt(u.negative_feedback||0);
  const total = pos + neg;
  const trust = total > 0 ? Math.round(pos/total*100) : trades > 0 ? 100 : 0;

  const pmLabel = (listing.payment_method === 'mtmmomo' || listing.payment_method === 'mtn_momo') ? 'MTN Mobile Money' : (listing.payment_method || 'Payment');
  const ft = featuredType ? FEATURED[featuredType] : null;

  return (
    <div className={`bg-white rounded-xl overflow-hidden transition-all w-full flex flex-col border hover:shadow-md ${ft ? 'border-amber-500 shadow-amber-500/20' : ''}`}
      style={{ borderColor: ft ? ft.border : C.g200 }}>
      
      {ft && (
        <div className="flex items-center justify-center gap-1.5 py-1.5 px-3" style={{background: ft.ribbon}}>
          <span className="text-[10px] font-black text-white tracking-widest">{ft.tag}</span>
        </div>
      )}

      {/* ═══ DESKTOP ROW (lg+) ═══ */}
      <div className="hidden lg:flex items-center px-4 py-4 gap-6">
        {/* Col 1: User Info */}
        <div className="flex items-center gap-3 w-[280px] flex-shrink-0">
          <button onClick={onViewBuyer} className="flex-shrink-0 relative">
            <Avatar user={u} size={48} radius="rounded-lg"/>
            <div className="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full border-2 border-white"
                style={{backgroundColor: seen.online ? C.online : C.g400}}/>
          </button>
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <CountryFlag countryCode={u?.country_code || u?.country || u?.location} className="w-4 h-3 rounded-sm shadow-sm" />
              <button onClick={onViewBuyer} className="font-black text-[15px] hover:underline truncate" style={{color:'#111827',textUnderlineOffset:'2px'}}>
                {getDisplayName(u) || 'Buyer'}
              </button>
              <BadgeChip user={u} size="xs" />
            </div>
            <div className="flex items-center gap-2 mt-1 text-xs text-gray-500 font-semibold">
              <div className="flex items-center gap-1"><ThumbsUp size={13} className="text-gray-400" strokeWidth={2.5}/><span className="text-gray-700">{trust}%</span></div>
              <span className="text-gray-700">{fmt(trades)} Trades</span>
              <div className="flex items-center gap-1">
                <span className={`w-1.5 h-1.5 rounded-full ${seen.online?'bg-emerald-500':'bg-gray-400'}`}/>
                <span className={seen.online?"text-emerald-600 font-bold":""}>{seen.online?'Active':seen.label}</span>
              </div>
            </div>
          </div>
        </div>
        {/* Col 2: Price + Range */}
        <div className="flex flex-col flex-1 min-w-[200px]">
          <div className="flex items-center gap-1.5">
            <CoinIcon coin="BTC" size={18} />
            <span className="font-black text-[16px] text-gray-900">{fmt(rateLocal,2)} {cur}</span>
            <span className="px-1.5 py-0.5 rounded text-[11px] font-black tracking-wide" style={{backgroundColor:marginBg,color:'#fff'}}>
              {margin===0?'MARKET':`${margin>0?'+':''}${margin}%`}
            </span>
          </div>
          <span className="text-[13px] font-semibold text-gray-500 mt-1">{fmt(minLocal)} - {fmt(maxLocal)} {cur}</span>
        </div>
        {/* Col 3: Payment Method */}
        <div className="flex flex-col w-[180px] flex-shrink-0">
          <span className="text-[12px] font-bold text-gray-500 mb-0.5">Receive {pmLabel}</span>
          <span className="text-[15px] font-black text-gray-900">{fmt(examplePay,2)} {cur}</span>
        </div>
        {/* Col 4: Pay */}
        <div className="flex flex-col w-[160px] flex-shrink-0">
          <span className="text-[12px] font-bold text-gray-500 mb-0.5">Pay (BTC)</span>
          <span className="text-[15px] font-black text-gray-900">{fmt(fiatEquiv,2)} {cur}</span>
        </div>
        {/* Col 5: Actions */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <button onClick={onViewBuyer} className="w-10 h-10 rounded-full border border-gray-200 flex items-center justify-center bg-gray-50 text-gray-600 hover:bg-gray-100 transition shadow-sm"><Info size={18}/></button>
          <button onClick={onSell} className="h-10 px-6 rounded-full bg-[#F4A422] text-white font-black text-[15px] flex items-center gap-1.5 shadow-md hover:bg-[#D4891A] active:scale-95 transition">
            Sell <CoinIcon coin="BTC" size={22} ring />
          </button>
        </div>
      </div>

      {/* ═══ MOBILE CARD (< lg) ═══ */}
      <div className="lg:hidden">
        <div className="p-4 pb-3 flex items-start gap-3">
          <button onClick={onViewBuyer} className="flex-shrink-0"><Avatar user={u} size={48} radius="rounded-lg"/></button>
          <div className="flex flex-col flex-1 min-w-0 pt-0.5">
            <div className="flex items-center gap-1.5 flex-wrap">
              <CountryFlag countryCode={u?.country_code || u?.country || u?.location} className="w-4 h-3 rounded-sm shadow-sm" />
              <button onClick={onViewBuyer} className="font-black text-[15px] hover:underline" style={{color:'#111827',textUnderlineOffset:'2px'}}>{getDisplayName(u)||'Buyer'}</button>
              <BadgeChip user={u} size="xs" />
            </div>
            <div className="flex items-center gap-2.5 mt-1 text-xs text-gray-600 font-semibold">
              <div className="flex items-center gap-1"><ThumbsUp size={13} className="text-gray-400" strokeWidth={2.5}/><span className="text-gray-700">{trust}%</span></div>
              <span>{fmt(trades)} Trades</span>
              <div className="flex items-center gap-1.5">
                {seen.online?<span className="w-2 h-2 rounded-full bg-emerald-500"/>:<span className="w-2 h-2 rounded-full bg-gray-400"/>}
                <span className={seen.online?"text-emerald-600 font-bold":"text-gray-500"}>{seen.online?'Active':seen.label}</span>
              </div>
            </div>
          </div>
        </div>
        <div className="px-4 py-2 flex items-center justify-between">
          <div className="flex flex-col"><span className="text-xs font-bold text-gray-600 mb-0.5">Receive {pmLabel}</span><span className="text-lg font-black text-gray-900">{fmt(examplePay,2)} {cur}</span></div>
          <div className="flex flex-col text-right"><span className="text-xs font-bold text-gray-600 mb-0.5">Pay (BTC)</span><span className="text-lg font-black text-gray-900">{fmt(fiatEquiv,2)} {cur}</span></div>
        </div>
        <div className="bg-gray-50 mt-1 px-4 py-3 flex items-center justify-between gap-2 border-t border-gray-100">
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <CoinIcon coin="BTC" size={16} />
              <span className="font-black text-[15px] text-gray-900 truncate">{fmt(rateLocal,2)} {cur}</span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-black tracking-wide" style={{backgroundColor:marginBg,color:'#fff'}}>{margin===0?'MARKET':`${margin>0?'+':''}${margin}%`}</span>
            </div>
            <div className="text-xs font-semibold text-gray-600 mt-1">{fmt(minLocal)} - {fmt(maxLocal)} {cur}</div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button onClick={onViewBuyer} className="w-9 h-9 rounded-full border border-gray-300 flex items-center justify-center bg-white text-gray-700 hover:bg-gray-100 transition shadow-sm"><Info size={16}/></button>
            <button onClick={onSell} className="h-9 px-4 rounded-full bg-[#F4A422] text-white font-black text-[15px] flex items-center gap-1.5 shadow-md hover:bg-[#D4891A] active:scale-95 transition">
              Sell <CoinIcon coin="BTC" size={20} ring />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Buyer Modal ───────────────────────────────────────────────────────────────
function BuyerModal({buyer, listing, onClose, onTrade, btcPriceUSD}) {
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
  const rateLocal = getRateUSD(listing || {}, btcPriceUSD || 68000) * usdRate;

  const phoneOk  = !!(u.is_phone_verified || u.phone_verified);
  const emailOk  = !!(u.is_email_verified || u.email_verified);
  const kycOk    = !!(u.is_id_verified || u.kyc_verified);
  const pos      = parseInt(u.positive_feedback || 0);
  const neg      = parseInt(u.negative_feedback || 0);
  const total    = pos + neg;
  const trust    = total > 0 ? Math.round(pos / total * 100) : trades > 0 ? 100 : 0;
  const compRate = parseFloat(u.completion_rate || 0);
  const blocks   = parseInt(u.blocks_received || u.blocks_count || 0);
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
    { id:'overview', label:'👤 Profile'           },
    { id:'feedback', label:`💬 Reviews (${total})`},
    { id:'rules',    label:'📋 Rules'              },
    { id:'offer',    label:'📊 Offer'              },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{backgroundColor:'rgba(0,0,0,0.6)', backdropFilter:'blur(6px)'}}
      onClick={e => e.target === e.currentTarget && onClose()}>

      <div className="bg-white w-full sm:max-w-sm rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col sm:mb-0"
        style={{maxHeight:'92dvh', marginBottom:'calc(60px + env(safe-area-inset-bottom, 0px))', border:`1px solid ${C.g200}`, animation:'slideUp .28s cubic-bezier(0.34,1.56,0.64,1)'}}>
        <style>{`@keyframes slideUp{from{transform:translateY(40px);opacity:0}to{transform:translateY(0);opacity:1}}`}</style>

        {/* Drag handle */}
        <div className="flex justify-center pt-2.5 pb-1 flex-shrink-0 sm:hidden">
          <div className="w-10 h-1 rounded-full" style={{backgroundColor:C.g200}}/>
        </div>

        {/* Header */}
        <div className="relative px-4 pt-3 pb-4 flex-shrink-0"
          style={{background:`linear-gradient(135deg,${C.forest} 0%,${C.sell} 100%)`}}>
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
                <span className="text-white/60 text-xs">{seen.online ? '🟢 Active now' : seen.label}</span>
              </div>
              <BadgeChip user={u} size="sm" />
            </div>
          </div>

          {/* Stats 2×2 grid */}
          <div className="grid grid-cols-2 gap-2">
            {/* Last active */}
            <div className="flex items-center gap-2 rounded-xl px-3 py-2.5" style={{backgroundColor:'rgba(255,255,255,0.12)'}}>
              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{backgroundColor: seen.online ? '#4ADE80' : '#94A3B8'}}/>
              <div className="min-w-0">
                <p className="text-white font-black text-xs leading-tight truncate">{seen.online ? 'Online now' : seen.label}</p>
                <p className="text-white/50 text-xs leading-tight">Last active</p>
              </div>
            </div>
            {/* Location — real flag image, real country name */}
            <div className="flex items-center gap-2 rounded-xl px-3 py-2.5" style={{backgroundColor:'rgba(255,255,255,0.12)'}}>
              <CountryFlag countryCode={ccCode} className="w-5 h-3.5 rounded-sm flex-shrink-0"/>
              <div className="min-w-0">
                <p className="text-white font-black text-xs leading-tight truncate">{countryName}</p>
                <p className="text-white/50 text-xs leading-tight">Location</p>
              </div>
            </div>
            {/* Avg. response */}
            <div className="flex items-center gap-2 rounded-xl px-3 py-2.5" style={{backgroundColor:'rgba(255,255,255,0.12)'}}>
              <Timer size={14} style={{color:'#FDE68A', flexShrink:0}}/>
              <div className="min-w-0">
                <p className="text-white font-black text-xs leading-tight">{avgPayDisplay}</p>
                <p className="text-white/50 text-xs leading-tight">Avg. response</p>
              </div>
            </div>
            {/* Trusted by */}
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
                  {label:'Rating',     value:`⭐ ${rating.toFixed(1)}`, sub:'of 5.0'},
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
                {[
                  {label:'Phone Number', ok:phoneOk, icon:'📱'},
                  {label:'Email Address',ok:emailOk, icon:'📧'},
                  {label:'ID / KYC',     ok:kycOk,   icon:'🪪'},
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
                    const flag = ccUp.replace(/./g,c=>String.fromCodePoint(0x1F1E0+c.charCodeAt(0)-65));
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
                    <p className="text-xs" style={{color:C.g400}}>👍 Positive</p>
                  </div>
                  <div className="text-center flex-1">
                    <p className="font-black text-sm" style={{color:'#DC2626'}}>{fmt(neg)}</p>
                    <p className="text-xs" style={{color:C.g400}}>👎 Negative</p>
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
                  <p className="text-3xl mb-2">💬</p>
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
                            {isPos ? '👍' : '👎'}
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
                  'Confirm payment received in your account before releasing Bitcoin. Never release early.'}
              </div>
              <div className="flex items-center gap-2.5 p-3 rounded-xl"
                style={{backgroundColor:C.sellBg, border:'1px solid #FDE68A'}}>
                <Timer size={14} style={{color:C.sell, flexShrink:0}}/>
                <p className="text-xs font-bold" style={{color:'#92400E'}}>
                  Time limit: {listing?.time_limit||30} minutes — auto-cancels if unpaid
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

        {/* Footer actions */}
        <div className="p-4 flex gap-3 flex-shrink-0 border-t" style={{borderColor:C.g200}}>
          <button onClick={onClose}
            className="flex-1 py-3 rounded-2xl border text-sm font-bold hover:bg-gray-50 transition"
            style={{borderColor:C.g200, color:C.g600}}>
            Close
          </button>
          <button onClick={() => { onClose(); onTrade(); }}
            className="flex-1 py-3 rounded-2xl text-white text-sm font-black flex items-center justify-center gap-2 shadow-md"
            style={{backgroundColor:C.sell}}>
            <Bitcoin size={15}/> Sell BTC
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

// ── Main SellBitcoin Page ─────────────────────────────────────────────────────
export default function SellBitcoin({user}) {
  const navigate = useNavigate();
  const autoDetectDone = useRef(false);
  const location = useLocation();
  const { rates: USD_RATES, btcUsd: contextBtcUsd } = useRates();
  // Use cached data only if it actually contains user profile data — null users = bad cache
  const _hasUsers  = (data) => Array.isArray(data) && data.some(l => l.users && (l.users.id || l.users.username));
  const _cacheAll  = () => { try { const c=JSON.parse(localStorage.getItem('praqen_market_all')||'null'); if(!c||Date.now()-c.ts>1800000||!_hasUsers(c.data)) return null; return c?.data||null; } catch { return null; } };
  const _buyNow    = () => { const a=_cacheAll(); return a?a.filter(l=>['BUY','BUY_BITCOIN','BUY_USDT'].includes(l.listing_type)):[]; };
  const [offers,       setOffers]       = useState(()=>_buyNow());
  const [loading,      setLoading]      = useState(()=>_buyNow().length===0);
  const [loadError,    setLoadError]    = useState(false);
  const [retrying,     setRetrying]     = useState(false);
  const [btcPrice,     setBtcPrice]     = useState(68000);
  const [selCountry,    setSelCountry]    = useState(COUNTRIES[0]);
  const [countrySearch, setCountrySearch] = useState('');
  const [selPayment,    setSelPayment]    = useState('all');
  const [paymentSearch, setPaymentSearch] = useState('');
  const [showFilters,   setShowFilters]   = useState(false);
  const [showCountry,   setShowCountry]   = useState(false);
  const [advFilters, setAdvFilters] = useState({
    topRated: false,
    verified: false,
    trusted: false,
    recentlyActive: false,
    acceptable: false
  });
  const [showPayment,   setShowPayment]   = useState(false);
  const [showAllCryptoMenu, setShowAllCryptoMenu] = useState(false);
  const [selectedCrypto, setSelectedCrypto] = useState(() => location.state?.selectedCrypto || null);
  const [sortBy,       setSortBy]       = useState('rate_high');
  const [modal,        setModal]        = useState(null);
  const [sellAmt,      setSellAmt]      = useState('');
  const [activeTrades, setActiveTrades] = useState(() => getCachedActiveTrades('p2p'));
  const [showAllTrades, setShowAllTrades] = useState(false);
  const [traderSearch,   setTraderSearch]   = useState('');
  const [selCurrency,    setSelCurrency]    = useState(CURRENCIES[0]);
  const [showCurrency,   setShowCurrency]   = useState(false);
  const [currencySearch, setCurrencySearch] = useState('');
  const [liveStatus,     setLiveStatus]     = useState({});
  const currencyRef = useRef(null);
  const countryRef  = useRef(null);
  const paymentRef  = useRef(null);

  useEffect(()=>{ if(contextBtcUsd>0) setBtcPrice(contextBtcUsd); },[contextBtcUsd]);

  // Auto-detect country + currency on first load
  useEffect(() => {
    if (autoDetectDone.current) return;
    const applyCountry = (cc) => {
      const codeOrName = (cc || '').trim();
      if (!codeOrName) return false;
      
      let matched = COUNTRIES.find(c => c.code.toLowerCase() === codeOrName.toLowerCase());
      if (!matched) {
        matched = COUNTRIES.find(c => c.name.toLowerCase() === codeOrName.toLowerCase());
      }
      
      if (!matched || matched.code === 'ALL') return false;
      setSelCountry(matched);
      const cur = CURRENCIES.find(c => c.code === matched.currency);
      if (cur) setSelCurrency(cur);
      return true;
    };

    // 1. Use logged-in user's profile country
    if (user) {
      const cc = user.country_code || user.country || '';
      if (applyCountry(cc)) {
        autoDetectDone.current = true;
        return;
      }
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
  useEffect(()=>{
    loadOffers();
    const interval = setInterval(() => loadOffers(1, true), 60000);
    return () => clearInterval(interval);
  },[]);

  const fetchOnlineStatus = (currentOffers) => {
    const ids = [...new Set((currentOffers || offers).map(l => l.users?.id).filter(Boolean))];
    if (ids.length === 0) return;
    axios.get(`${API_URL}/users/online-status?ids=${ids.join(',')}`)
      .then(r => { if (r.data?.status) setLiveStatus(r.data.status); })
      .catch(() => {});
  };

  useEffect(() => {
    if (offers.length > 0) fetchOnlineStatus(offers);
    const iv = setInterval(() => fetchOnlineStatus(), 30000);
    return () => clearInterval(iv);
  }, [offers.length > 0]);
  useEffect(()=>{
    const tk = localStorage.getItem('token');
    if (!tk) return;
    const h = { Authorization: `Bearer ${tk}` };
    const toUTC = (s) => {
      if (!s) return null;
      if (s instanceof Date) return s;
      let str = String(s).trim().replace(' ', 'T');
      if (!str.endsWith('Z') && !/[+-]\d{2}/.test(str)) str += 'Z';
      const d = new Date(str);
      return isNaN(d.getTime()) ? new Date(s) : d;
    };
    const fetchTrades = () => axios.get(`${API_URL}/trades/active`, { headers: h }).then(res => {
      if (res.data?.success || Array.isArray(res.data?.trades)) {
        const now = Date.now();
        const raw = res.data.trades || [];
        setCachedActiveTrades(raw);
        const filtered = raw.filter(t => {
          if (isGiftCardTrade(t)) return false;
          if (!t.status) return true;
          if (['PAYMENT_SENT', 'DISPUTED', 'FUNDS_LOCKED', 'CREATED'].includes(t.status)) {
            if (!t.expires_at) return true;
            const parsed = toUTC(t.expires_at);
            const expTime = parsed ? parsed.getTime() : NaN;
            if (isNaN(expTime)) return true;
            return expTime > now - 60000;
          }
          return false;
        });
        setActiveTrades(filtered);
      }
    }).catch(() => {});
    Promise.all([
      axios.post(`${API_URL}/users/heartbeat`, {}, { headers: h }).catch(() => {}),
      fetchTrades(),
    ]);
    const iv1 = setInterval(() => axios.post(`${API_URL}/users/heartbeat`, {}, { headers: h }).catch(() => {}), 60000);
    const iv2 = setInterval(fetchTrades, 10000);
    return () => { clearInterval(iv1); clearInterval(iv2); };
  },[user]);
  useEffect(()=>{
    const h = e => {
      if(currencyRef.current&&!currencyRef.current.contains(e.target)){setShowCurrency(false);setCurrencySearch('');}
      if(countryRef.current&&!countryRef.current.contains(e.target)){setShowCountry(false);setCountrySearch('');}
      if(paymentRef.current&&!paymentRef.current.contains(e.target)){setShowPayment(false);setPaymentSearch('');}
    };
    document.addEventListener('mousedown',h);
    return () => document.removeEventListener('mousedown',h);
  },[]);

  const loadOffers = async (attempt = 1, force = false) => {
    // Skip fetch if cache is fresh (< 5 minutes) and not forced
    if (attempt === 1 && !force) {
      try {
        const c = JSON.parse(localStorage.getItem('praqen_market_all') || 'null');
        if (c && Date.now() - c.ts < 300000 && _hasUsers(c.data)) {
          const buyOffers = (c.data || []).filter(l => (l.asset || 'BTC') === 'BTC' && (l.listing_type === 'BUY' || l.listing_type === 'BUY_BITCOIN'));
          if (buyOffers.length > 0) {
            setOffers(buyOffers);
            setLoading(false);
            return;
          }
        }
      } catch {}
    }
    setLoadError(false);
    setRetrying(false);
    try {
      const res = await axios.get(`${API_URL}/listings`, { timeout: 20000 });
      const all = (res.data.listings||[]).map(l=>({...l, users:Array.isArray(l.users)?l.users[0]:l.users}));
      const data = all.filter(l=>['BUY','BUY_BITCOIN','BUY_USDT'].includes(l.listing_type));
      if (data.length > 0) {
        setOffers(data);
        try { localStorage.setItem('praqen_market_all', JSON.stringify({ data: all, ts: Date.now() })); } catch {}
      } else {
        // Truly empty marketplace — show empty state but don't cache
        setOffers([]);
      }
    } catch (err) {
      // 503 = DB temporarily down; longer retry delay so we don't spam the server
      const retryDelay = err?.response?.status === 503 ? 3000 : 1000;
      if (attempt < 3) {
        setRetrying(true);
        setTimeout(() => loadOffers(attempt + 1, force), retryDelay);
      } else {
        setRetrying(false);
        if (!offers.length) setLoadError(true);
      }
    }
    finally { if (attempt === 1 || attempt >= 3) setLoading(false); }
  };

  const getFiltered = () => {
    let list = [...offers];
    if (selectedCrypto === 'BTC') {
      list = list.filter(l => (l.asset || 'BTC') === 'BTC');
    } else if (selectedCrypto === 'USDT') {
      list = list.filter(l => l.asset === 'USDT');
    }
    if (selCountry.code !== 'ALL') {
      list = list.filter(l => {
        const offerCountry = (l.country_code || l.country || '').toUpperCase();
        return offerCountry === '' || offerCountry === selCountry.code;
      });
    }
    list = list.filter(l => (l.currency || l.fiat_currency || 'USD').toUpperCase() === selCurrency.code);
    if (selPayment !== 'all') {
      list = list.filter(l => String(l.payment_method || '').toLowerCase().includes(selPayment));
    }
    if (sellAmt && parseFloat(sellAmt) > 0) {
      const a = parseFloat(sellAmt);
      const _cur  = selCurrency.code;
      const _rate = USD_RATES[_cur] || 1;
      list = list.filter(l => {
        if (l.min_limit_local && l.max_limit_local && l.currency === _cur) {
          return a >= (l.min_limit_local) && a <= (l.max_limit_local);
        }
        const aUsd = _rate > 0 ? a / _rate : a;
        return aUsd >= (l.min_limit_usd || 0) && aUsd <= (l.max_limit_usd || 999999);
      });
    }
    
    if (sortBy === 'rate_high' || sortBy === 'rate_low') list.sort((a,b) => parseFloat(b.margin||0) - parseFloat(a.margin||0));
    else if (sortBy === 'rating') list.sort((a,b) => (b.users?.average_rating||0) - (a.users?.average_rating||0));
    else if (sortBy === 'trades') list.sort((a,b) => getTrades(b.users) - getTrades(a.users));

    if (traderSearch.trim()) list = list.filter(l =>
      (l.users?.username||'').toLowerCase().includes(traderSearch.trim().toLowerCase())
    );

    // One offer per buyer per payment method
    const seen = new Set();
    list = list.filter(l => {
      const key = `${l.seller_id}:${String(l.payment_method||'').toLowerCase().trim()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Advanced Filters
    if (advFilters.topRated) {
      list = list.filter(l => {
        const u = getUser(l.users);
        if (!u) return false;
        return u.badge && u.badge !== 'BEGINNER' && u.badge !== 'PRO';
      });
    }
    if (advFilters.verified) {
      list = list.filter(l => {
        const u = getUser(l.users);
        return u && (u.is_id_verified || u.kyc_verified || u.id_verified);
      });
    }
    if (advFilters.trusted) {
      list = list.filter(l => {
        const u = getUser(l.users);
        return u && (u.trusted_count > 0 || parseFloat(u.feedback_score || 0) > 90);
      });
    }
    if (advFilters.recentlyActive) {
      list = list.filter(l => {
        const u = getUser(l.users);
        if (!u) return false;
        const lastSeen = liveStatus[u.id] || u.last_seen;
        if (!lastSeen) return false;
        const diff = new Date() - new Date(lastSeen);
        return diff < 30 * 60 * 1000;
      });
    }
    if (advFilters.acceptable) {
      list = list.filter(l => l.active !== false);
    }

    return list;
  };

  const handleTradeExpire = (id) => setActiveTrades(prev => {
    const updated = prev.filter(t =>
      t.id !== id ||
      ['PAYMENT_SENT','DISPUTED'].includes(t.status) ||
      !t.expires_at
    );
    setCachedActiveTrades(updated);
    return updated;
  });

  const handleCreateOffer = () => {
    if (!user) { navigate('/login?message=Please log in to create an offer'); return; }
    navigate('/create-offer');
  };

  const handleSell = (id) => {
    if (!user) { navigate('/login?message=Please log in to start trading'); return; }
    navigate(`/listing/${id}`);
  };

  const filtered   = getFiltered();
  const cur        = selCurrency.code;
  const sym        = selCurrency.symbol;
  const usdRate    = USD_RATES[cur] || 1;
  const btcLocal   = btcPrice * usdRate;
  const selPmInfo  = PAYMENT_OPTIONS.find(p=>p.value===selPayment);
  const onlineCnt   = offers.filter(l=>(Date.now()-new Date(l.users?.last_seen_at||l.users?.last_login||0))/1000<300).length;
  const hasFilters  = selPayment!=='all' || sellAmt || selCountry.code!=='ALL' || selCurrency.code!=='USD' || !!traderSearch.trim() || Object.values(advFilters).some(v => v);

  return (
    <div className="min-h-screen flex flex-col"
      style={{backgroundColor:C.g100, fontFamily:"'DM Sans',sans-serif"}}>
      <SEO />
      <style>{`
        @keyframes slideUp { from{transform:translateY(100%);opacity:0} to{transform:translateY(0);opacity:1} }
        @keyframes hotOfferPulse { 0%,100%{box-shadow:0 0 0 3px rgba(217,119,6,0.25),0 8px 32px rgba(217,119,6,0.15)} 50%{box-shadow:0 0 0 6px rgba(217,119,6,0.45),0 16px 48px rgba(217,119,6,0.28)} }
        @keyframes shimmer { 0%{transform:translateX(-130%)} 100%{transform:translateX(130%)} }
        input[type=number]::-webkit-inner-spin-button,
        input[type=number]::-webkit-outer-spin-button { -webkit-appearance:none; margin:0; }
        * { -webkit-tap-highlight-color: transparent; box-sizing: border-box; }
        html, body { overscroll-behavior: none; }
      `}</style>

      {/* ══ 1. NOONES-STYLE HEADER & CONVERSION BAR ════════════════════════════════════ */}
      <div className="w-full bg-white border-b px-4 py-4" style={{borderColor:C.g200}}>
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl sm:text-3xl font-black" style={{color:C.g800}}>
              Sell <span style={{color: (!selectedCrypto || selectedCrypto === 'ALL') ? '#0D9488' : selectedCrypto === 'USDT' ? '#0F766E' : '#F4A422'}}>
                {(!selectedCrypto || selectedCrypto === 'ALL') ? 'All Crypto' : selectedCrypto === 'USDT' ? 'Tether (USDT)' : 'Bitcoin (BTC)'}
              </span>
              {selPayment !== 'all' && (
                <span className="font-bold" style={{color: '#F4A422'}}> for {selPmInfo?.label || selPayment}</span>
              )}
            </h1>
            <button className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200">
              <Info size={18} />
            </button>
          </div>

          <div className="flex items-center gap-4 mt-2 text-xs font-bold text-gray-600">
            <div className="flex items-center gap-1.5">
              <span className="w-4 h-4 rounded-full bg-gray-200 flex items-center justify-center text-[10px]">$</span>
              <span>1 USD = {fmt(usdRate, 2)} {cur}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <CoinIcon coin="BTC" size={16} />
              <span>1 BTC = {fmt(btcPrice * usdRate, 1)} {cur}</span>
            </div>
          </div>

          {/* ══ MOBILE CONTROL CARD (Original Light Styling, Mobile Layout) ══ */}
          <div className="block sm:hidden mt-3 bg-white rounded-2xl p-2.5 border border-gray-200 shadow-sm space-y-2.5">
            {/* Top Row: Buy/Sell Toggle (Left) & Asset Selector Dropdown (Right) */}
            <div className="flex items-center justify-between gap-2">
              {/* Buy / Sell Toggle Pills */}
              <div className="flex bg-gray-100 p-1 rounded-xl shrink-0">
                <button
                  onClick={() => navigate(selectedCrypto === 'USDT' ? '/buy-usdt' : '/buy-bitcoin')}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-black transition text-gray-600 hover:text-gray-900"
                >
                  <ArrowDown size={13} strokeWidth={3} /> Buy
                </button>
                <button
                  onClick={() => navigate(selectedCrypto === 'USDT' ? '/sell-usdt' : '/sell-bitcoin')}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-black transition bg-[#F4A422] text-white shadow-sm"
                >
                  <ArrowUp size={13} strokeWidth={3} /> Sell
                </button>
              </div>

              {/* Crypto / Asset Dropdown Selector */}
              <div className="relative shrink-0">
                <button
                  onClick={() => setShowAllCryptoMenu(v => !v)}
                  className="h-9 px-3 rounded-xl border bg-gray-50 border-gray-200 flex items-center gap-1.5 text-xs font-black text-gray-800 hover:bg-gray-100 transition"
                >
                  {selectedCrypto === 'BTC' ? (
                    <>
                      <CoinIcon coin="BTC" size={16} />
                      <span>BTC</span>
                    </>
                  ) : selectedCrypto === 'USDT' ? (
                    <>
                      <CoinIcon coin="USDT" size={16} />
                      <span>USDT</span>
                    </>
                  ) : (
                    <>
                      <Coins size={14} className="text-amber-600" />
                      <span>All Crypto</span>
                    </>
                  )}
                  <ChevronDown size={13} className="text-gray-400" />
                </button>

                {/* Menu Overlay for Mobile */}
                {showAllCryptoMenu && (
                  <div className="absolute right-0 top-full mt-1.5 w-48 rounded-2xl border border-gray-200 shadow-xl overflow-hidden z-50 bg-white">
                    <div className="fixed inset-0 z-40" onClick={() => setShowAllCryptoMenu(false)} />
                    <div className="relative z-50 py-1">
                      <button
                        onClick={() => { setSelectedCrypto(null); setShowAllCryptoMenu(false); navigate('/sell-bitcoin', { state: { selectedCrypto: null } }); }}
                        className={`w-full flex items-center gap-2 px-3 py-2 text-left text-xs font-black transition ${!selectedCrypto ? 'bg-amber-50 text-amber-700' : 'text-gray-800 hover:bg-gray-50'}`}
                      >
                        <Coins size={15} className="text-amber-600" />
                        <span>All Crypto</span>
                      </button>
                      <button
                        onClick={() => { setSelectedCrypto('BTC'); setShowAllCryptoMenu(false); navigate('/sell-bitcoin', { state: { selectedCrypto: 'BTC' } }); }}
                        className={`w-full flex items-center gap-2 px-3 py-2 text-left text-xs font-black transition border-t border-gray-100 ${selectedCrypto === 'BTC' ? 'bg-amber-50 text-amber-700' : 'text-gray-800 hover:bg-gray-50'}`}
                      >
                        <CoinIcon coin="BTC" size={16} />
                        <span>Bitcoin</span>
                      </button>
                      <button
                        onClick={() => { setSelectedCrypto('USDT'); setShowAllCryptoMenu(false); navigate('/sell-usdt', { state: { selectedCrypto: 'USDT' } }); }}
                        className={`w-full flex items-center gap-2 px-3 py-2 text-left text-xs font-black transition border-t border-gray-100 ${selectedCrypto === 'USDT' ? 'bg-teal-50 text-teal-700' : 'text-gray-800 hover:bg-gray-50'}`}
                      >
                        <CoinIcon coin="USDT" size={16} />
                        <span>Tether</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Centered Small "FOR" Badge */}
            <div className="relative flex justify-center -my-1 z-10">
              <span className="bg-white text-amber-600 border border-amber-200 text-[9px] font-black tracking-wider px-2 py-0.5 rounded shadow-sm uppercase">
                FOR
              </span>
            </div>

            {/* Bottom Row: Payment Method Dropdown (Left) & Amount Input with Currency (Right) */}
            <div className="grid grid-cols-2 gap-2 pt-0.5">
              {/* Payment Method Button */}
              <button
                onClick={() => setShowPayment(true)}
                className="h-9 px-3 rounded-xl border bg-gray-50 border-gray-200 flex items-center justify-between text-xs font-bold text-gray-700 hover:bg-gray-100 transition overflow-hidden"
              >
                <span className="truncate">{selPmInfo?.label || 'All Methods'}</span>
                <ChevronDown size={13} className="text-gray-400 shrink-0 ml-1" />
              </button>

              {/* Amount Input with Currency Badge */}
              <div className="h-9 px-2.5 rounded-xl border bg-gray-50 border-gray-200 flex items-center justify-between gap-1">
                <input
                  type="number"
                  placeholder="Amount"
                  value={sellAmt}
                  onChange={e => setSellAmt(e.target.value)}
                  className="w-full bg-transparent text-xs font-bold text-gray-800 placeholder-gray-400 focus:outline-none"
                />
                <button
                  onClick={() => setShowCurrency(true)}
                  className="shrink-0 flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-gray-200/70 border border-gray-300/50 text-[10px] font-black text-gray-700 hover:bg-gray-300 transition"
                >
                  {selCurrency.code}
                </button>
              </div>
            </div>
          </div>

          {/* ══ 2. DESKTOP CONTROL CARD (UNTOUCHED FOR DESKTOP) ════════════════════════════════════ */}
          <div className="hidden sm:flex mt-4 bg-white rounded-2xl border p-2 sm:p-3 shadow-sm flex-wrap items-center gap-2 sm:gap-3" style={{borderColor:C.g200}}>
            
            {/* Toggle Pill (Buy/Sell) */}
            <div className="flex bg-gray-100 p-1 rounded-xl shrink-0">
              <button onClick={()=>navigate(selectedCrypto==='USDT'?'/buy-usdt':'/buy-bitcoin')}
                className="flex items-center gap-1 sm:gap-1.5 px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-black transition text-gray-600 hover:text-gray-900">
                <ArrowDown size={14} strokeWidth={3} /> Buy
              </button>
              <button onClick={()=>navigate(selectedCrypto==='USDT'?'/sell-usdt':'/sell-bitcoin')}
                className="flex items-center gap-1 sm:gap-1.5 px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-black transition bg-[#F4A422] text-white shadow-sm">
                <ArrowUp size={14} strokeWidth={3} /> Sell
              </button>
            </div>

            {/* Crypto Dropdown */}
            <div className="relative shrink-0">
              <button onClick={()=>setShowAllCryptoMenu(v=>!v)}
                className="h-[36px] sm:h-[40px] px-2 sm:px-3 rounded-xl border bg-gray-50 flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm font-black text-gray-800 hover:bg-gray-100 transition"
                style={{borderColor: C.g200}}>
                {selectedCrypto === 'BTC' ? (
                  <><CoinIcon coin="BTC" size={20} /> BTC</>
                ) : selectedCrypto === 'USDT' ? (
                  <><CoinIcon coin="USDT" size={20} /> USDT</>
                ) : (
                  <><Coins size={15} className="text-amber-600" /> All Crypto</>
                )}
                <ChevronDown size={14} className="text-gray-400" />
              </button>
              {showAllCryptoMenu && (
                <div className="absolute left-0 top-full mt-1.5 w-48 sm:w-56 rounded-2xl border shadow-xl overflow-hidden z-50 bg-white" style={{borderColor:C.g200}}>
                  <div className="fixed inset-0 z-40" onClick={()=>setShowAllCryptoMenu(false)}/>
                  <div className="relative z-50">
                    <button onClick={()=>{setSelectedCrypto(null); setShowAllCryptoMenu(false); navigate('/sell-bitcoin', { state: { selectedCrypto: null } });}}
                      className={`w-full flex items-center gap-2.5 px-3.5 py-3 text-left transition ${!selectedCrypto ? 'bg-amber-50/80' : 'hover:bg-gray-50'}`}>
                      <span className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 font-black text-xs text-white" style={{background:'linear-gradient(135deg,#D97706,#B45309)'}}><Coins size={14} /></span>
                      <span className="flex-1 min-w-0"><span className="block text-xs font-black text-gray-800">All Crypto</span></span>
                    </button>
                    <button onClick={()=>{setSelectedCrypto('BTC'); setShowAllCryptoMenu(false); navigate('/sell-bitcoin', { state: { selectedCrypto: 'BTC' } });}}
                      className={`w-full flex items-center gap-2.5 px-3.5 py-3 text-left transition border-t ${selectedCrypto === 'BTC' ? 'bg-amber-50/80' : 'hover:bg-gray-50'}`} style={{borderColor:C.g100}}>
                      <CoinIcon coin="BTC" size={28} />
                      <span className="flex-1 min-w-0"><span className="block text-xs font-black text-gray-800">Bitcoin</span></span>
                    </button>
                    <button onClick={()=>{setSelectedCrypto('USDT'); setShowAllCryptoMenu(false); navigate('/sell-usdt', { state: { selectedCrypto: 'USDT' } });}}
                      className={`w-full flex items-center gap-2.5 px-3.5 py-3 text-left transition border-t ${selectedCrypto === 'USDT' ? 'bg-amber-50/80' : 'hover:bg-gray-50'}`} style={{borderColor:C.g100}}>
                      <CoinIcon coin="USDT" size={28} />
                      <span className="flex-1 min-w-0"><span className="block text-xs font-black text-gray-800">Tether</span></span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Payment Method */}
            <div className="relative shrink-0 flex-1 sm:flex-none sm:w-40">
              <span className="absolute -top-2 left-3 px-1 bg-white text-[9px] font-black text-amber-600 tracking-wider uppercase z-10">USING</span>
              <button
                onClick={() => setShowPayment(true)}
                className="w-full h-[36px] sm:h-[40px] flex items-center justify-between px-3 rounded-xl border bg-gray-50 text-xs font-bold text-gray-700 hover:bg-gray-100 transition"
                style={{borderColor: C.g200}}>
                <span className="truncate">{selPmInfo?.label || 'All Methods'}</span>
                <ChevronDown size={14} className="text-gray-400 flex-shrink-0" />
              </button>
            </div>

            {/* Amount Input */}
            <div className="relative flex-1 min-w-[140px] flex items-center bg-gray-50 rounded-xl border pl-3 pr-1" style={{borderColor: C.g200, height: '40px'}}>
              <span className="absolute -top-2 left-3 px-1 bg-white text-[9px] font-black text-gray-500 tracking-wider uppercase z-10">AMOUNT</span>
              <input
                type="number"
                placeholder="Enter amount..."
                value={sellAmt}
                onChange={e => setSellAmt(e.target.value)}
                className="w-full bg-transparent text-xs font-bold focus:outline-none text-gray-800 h-full"
              />
              <button
                onClick={() => setShowCurrency(true)}
                className="flex-shrink-0 flex items-center gap-1 pl-2 border-l hover:bg-gray-200 transition text-xs font-black text-gray-700 h-full px-2 rounded-r-lg"
                style={{borderColor: C.g200}}>
                {selCurrency.code}
                <ChevronDown size={12} className="text-gray-400" />
              </button>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 ml-auto shrink-0">
              <button
                onClick={() => handleCreateOffer()}
                className="hidden lg:flex px-4 h-[40px] rounded-xl text-white text-xs font-black items-center gap-1.5 hover:opacity-90 transition"
                style={{backgroundColor: '#D97706'}}>
                <PlusCircle size={15} /> Create
              </button>
              <button onClick={() => setShowFilters(true)}
                className="h-[40px] px-3 sm:px-4 rounded-xl flex items-center gap-2 text-xs font-black transition border bg-gray-50 hover:bg-gray-100 text-gray-700"
                style={{borderColor: C.g200}}>
                <Filter size={14} />
                <span className="hidden sm:inline">Filters</span>
                {hasFilters && <span className="w-2 h-2 rounded-full text-white" style={{backgroundColor:'#D97706'}} />}
              </button>
              <button onClick={() => { setLoading(true); loadOffers(1, true); }}
                className="w-[40px] h-[40px] rounded-xl flex items-center justify-center transition border hover:bg-gray-50 bg-gray-50 text-gray-700"
                style={{borderColor: C.g200}}>
                <RefreshCw size={15} className={loading?'animate-spin':''}/>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Inline active trade cards (Immediately below filter bar) ── */}
      {activeTrades.length > 0 && (
        <div className="px-3 mt-3 mb-2 max-w-7xl mx-auto w-full">
          <div className="flex items-center gap-2 mb-2 font-black text-sm text-gray-900">
            <Repeat2 size={16} /> Active trades ({activeTrades.length})
          </div>
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

        {/* Mobile Offers Header & Action Buttons Row */}
        <div className="flex sm:hidden items-center justify-between my-1 px-0.5">
          <h2 className="text-xl font-black text-gray-900">Offers</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleCreateOffer()}
              className="w-9 h-9 rounded-xl border bg-gray-50 border-gray-200 text-gray-700 flex items-center justify-center font-bold shadow-sm hover:bg-gray-100 transition"
              title="Create Offer"
            >
              <Plus size={16} />
            </button>
            <button
              onClick={() => setShowFilters(true)}
              className="h-9 px-2.5 rounded-xl border bg-gray-50 border-gray-200 text-gray-700 flex items-center gap-1.5 text-xs font-bold shadow-sm hover:bg-gray-100 transition"
            >
              <SlidersHorizontal size={14} />
              {hasFilters && (
                <span className="w-4 h-4 rounded-full bg-amber-500 text-white text-[10px] font-black flex items-center justify-center">
                  1
                </span>
              )}
            </button>
            <button
              onClick={() => { setLoading(true); loadOffers(1, true); }}
              className="w-9 h-9 rounded-xl border bg-gray-50 border-gray-200 text-gray-700 flex items-center justify-center shadow-sm hover:bg-gray-100 transition"
              title="Refresh"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        <div className="hidden sm:flex items-center justify-between flex-wrap gap-2">
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

        {(loading && !offers.length) || retrying ? (
          <div className="bg-white rounded-2xl border p-8 text-center" style={{borderColor:C.g200}}>
            <p className="text-5xl mb-3">⏳</p>
            <p className="font-black text-base mb-1" style={{color:C.g800}}>
              {retrying ? 'Waking up server…' : 'Loading offers…'}
            </p>
            <p className="text-sm" style={{color:C.g400}}>
              {retrying ? 'Our server is starting up, this takes a few seconds' : 'Fetching the latest offers for you'}
            </p>
            <div className="flex justify-center mt-4">
              <div className="w-8 h-8 border-4 rounded-full animate-spin" style={{borderColor:`${C.sell}40`, borderTopColor:'transparent'}}/>
            </div>
          </div>
        ) : loadError && !offers.length ? (
          <div className="bg-white rounded-2xl border p-8 text-center" style={{borderColor:C.g200}}>
            <p className="text-5xl mb-3">📡</p>
            <p className="font-black text-base mb-1" style={{color:C.g800}}>Couldn't load offers</p>
            <p className="text-sm mb-4" style={{color:C.g400}}>Server may be busy. Please try again.</p>
            <button onClick={()=>{ setLoading(true); loadOffers(1, true); }}
              className="px-6 py-2.5 rounded-xl text-white text-sm font-black hover:opacity-90 transition flex items-center gap-2 mx-auto"
              style={{backgroundColor:C.sell}}>
              <RefreshCw size={14}/> Try Again
            </button>
          </div>
        ) : filtered.length===0 ? (
          <div className="bg-white rounded-2xl border p-6 sm:p-10 text-center" style={{borderColor:C.g200}}>
            <p className="text-5xl mb-4">🔍</p>
            <p className="font-black text-base mb-1" style={{color:C.g800}}>No buyers found</p>
            <p className="text-sm" style={{color:C.g400}}>Adjust your filters or post the first buy offer</p>
            <button onClick={()=>navigate('/create-offer')}
              className="mt-4 px-6 py-2.5 rounded-xl text-white text-sm font-black hover:opacity-90 transition"
              style={{backgroundColor:C.sell}}>
              Post Buy Offer
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-1 gap-3 w-full">
            {filtered.map(l=>(
              <div key={l.id} className="w-full h-full flex flex-col">
                <OfferCard
                  listing={l}
                  btcPriceUSD={btcPrice}
                  userSellAmt={sellAmt}
                  liveSeenAt={liveStatus[l.users?.id] || null}
                  onViewBuyer={()=>{
                    setModal({buyer:l.users||{}, listing:l});
                    axios.post(`${API_URL}/listings/${l.id}/view`).catch(()=>{});
                  }}
                  onSell={()=>handleSell(l.id)}
                />
              </div>
            ))}
          </div>
        )}

        <div style={{display:'flex',alignItems:'center',gap:11,padding:'13px 15px',borderRadius:12,background:'linear-gradient(135deg,#FFFBEB,#FEF3C7)',border:'1.5px solid #FCD34D',boxShadow:'0 2px 8px rgba(217,119,6,0.12)'}}>
          <div style={{width:34,height:34,borderRadius:9,background:'#FDE68A',border:'1px solid #FCD34D',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
            <AlertTriangle size={17} style={{color:'#B45309'}}/>
          </div>
          <span style={{fontSize:13,color:'#92400E',lineHeight:1.4}}><strong style={{fontWeight:900}}>Sell Safely:</strong> <span style={{fontWeight:600}}>Never release Bitcoin before confirming payment. All trades are escrow-protected.</span></span>
        </div>

{/* ── NEW USER BONUS CARD — sell-page amber theme, no emoji ── */}
<div style={{borderRadius:14,overflow:'hidden',boxShadow:'0 4px 20px rgba(180,83,9,0.2)'}}>
  <div style={{background:'linear-gradient(135deg,#78350F 0%,#B45309 60%,#D97706 100%)',padding:'16px 16px 14px',position:'relative',overflow:'hidden'}}>
    <div style={{position:'absolute',inset:0,opacity:0.07,backgroundImage:'radial-gradient(circle at 2px 2px,white 1px,transparent 0)',backgroundSize:'16px 16px',pointerEvents:'none'}}/>
    <div style={{position:'absolute',top:0,left:0,right:0,height:3,background:'linear-gradient(90deg,#F4A422,#FBBF24,#F4A422)'}}/>

    <div style={{position:'relative',display:'flex',flexWrap:'wrap',alignItems:'center',justifyContent:'space-between',gap:10,marginBottom:13}}>
      <div style={{display:'flex',alignItems:'center',gap:10,minWidth:0,flex:'1 1 220px'}}>
        <div style={{width:36,height:36,borderRadius:10,background:'#F4A422',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,boxShadow:'0 2px 8px rgba(244,164,34,0.45)'}}>
          <Gift size={17} style={{color:'#78350F'}}/>
        </div>
        <div style={{minWidth:0}}>
          <p style={{margin:0,fontSize:13.5,fontWeight:900,color:'#FFFFFF',lineHeight:1.35}}>New users earn <span style={{color:'#FDE68A'}}>$2 FREE Bitcoin</span></p>
          <p style={{margin:0,fontSize:10.5,color:'rgba(255,255,255,0.65)',marginTop:3,lineHeight:1.4}}>Offer valid 30 days · Share your link so friends can claim it</p>
        </div>
      </div>
      <button onClick={()=>navigate('/register')}
        style={{flexShrink:0,padding:'9px 16px',borderRadius:9,border:'none',cursor:'pointer',background:'#F4A422',color:'#78350F',fontWeight:900,fontSize:12,whiteSpace:'nowrap',boxShadow:'0 3px 10px rgba(244,164,34,0.4)'}}>
        Claim <ArrowRight size={12} style={{display:'inline',marginLeft:3,verticalAlign:'-1px'}}/>
      </button>
    </div>

<div style={{position:'relative',display:'flex',gap:7}}>
  {[
    {Icon:CheckCircle, label:'Register',sub:'$1 locked'},
    {Icon:Zap,         label:'Verify',  sub:'stays safe'},
    {Icon:Bitcoin,     label:'1 Trade', sub:'$2 unlocks'},
  ].map(({Icon,label,sub})=>(
    <div key={label} style={{flex:'1 1 0',minWidth:0,background:'rgba(255,255,255,0.1)',border:'1px solid rgba(255,255,255,0.16)',borderRadius:10,padding:'10px 6px',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center'}}>
      <Icon size={15} style={{color:'#FDE68A',marginBottom:4}}/>
      <div style={{fontSize:11,fontWeight:800,color:'#fff',lineHeight:1.2}}>{label}</div>
      <div style={{fontSize:9,color:'rgba(255,255,255,0.6)',marginTop:2,lineHeight:1.2}}>{sub}</div>
    </div>
  ))}
</div>
  </div>
</div>

        {/* ── AFFILIATE PROMO CARD ── */}
        <div style={{borderRadius:14,overflow:'hidden',boxShadow:'0 4px 20px rgba(217,119,6,0.15)'}}>

          {/* Header — sell-theme gradient so it pops, matches the bonus card above */}
          <div style={{padding:'16px 16px 14px',background:'linear-gradient(135deg,#B45309,#D97706)',position:'relative',overflow:'hidden'}}>
            <div style={{position:'absolute',top:-24,right:-16,width:110,height:110,borderRadius:'50%',background:'#F4A422',opacity:0.18,filter:'blur(35px)'}}/>
            <div style={{position:'relative',display:'flex',alignItems:'center',justifyContent:'space-between',gap:10,flexWrap:'wrap'}}>
              <div>
                <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:6}}>
                  <span style={{display:'flex',alignItems:'center',gap:3,fontSize:10,fontWeight:900,color:'#78350F',background:'#F4A422',borderRadius:5,padding:'2px 8px',letterSpacing:0.4,textTransform:'uppercase'}}>
                    <Bitcoin size={10}/>Referral Program
                  </span>
                  <span style={{fontSize:9,color:'rgba(255,255,255,0.65)',fontWeight:500}}>Earn on every referral trade</span>
                </div>
                <p style={{margin:0,fontSize:16,fontWeight:900,color:'#fff',lineHeight:1.2}}>Invite friends. Earn Bitcoin together.</p>
              </div>
              <button onClick={()=>navigate('/partner-program')}
                style={{flexShrink:0,padding:'10px 16px',borderRadius:10,border:'none',cursor:'pointer',background:'#F4A422',color:'#78350F',fontWeight:900,fontSize:11,whiteSpace:'nowrap',boxShadow:'0 3px 12px rgba(244,164,34,0.4)'}}>
                Get Link <ArrowRight size={12} style={{display:'inline',marginLeft:3,verticalAlign:'-2px'}}/>
              </button>
            </div>
          </div>

          <div style={{padding:'10px 14px',background:'#fff',textAlign:'center'}}>
            <span onClick={()=>navigate('/partner-program')} style={{fontSize:11,fontWeight:700,color:'#1B4332',cursor:'pointer',textDecoration:'underline'}}>See the Referral Program page for current rates →</span>
          </div>


          <p style={{margin:0,padding:'7px 14px 11px',textAlign:'center',fontSize:9,color:'#94A3B8',fontWeight:600}}>
            Free to join
          </p>
        </div>

      </div>

      {/* ══ 5. FOOTER ══════════════════════════════════════════ */}
      {/* ══ 3. NOONES FILTER DRAWER MODAL ════════════════════════════════════ */}
      {showFilters && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex justify-end transition-opacity">
          <div className="w-full max-w-md bg-white h-full flex flex-col justify-between p-4 overflow-y-auto animate-slideLeft">
            <div className="space-y-6">
              <div className="flex items-center justify-between border-b pb-3" style={{borderColor:C.g200}}>
                <h3 className="text-lg font-black text-gray-900">Filters</h3>
                <button onClick={() => setShowFilters(false)} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 transition">
                  <X size={18} />
                </button>
              </div>

              {/* Country selection row */}
              <div className="flex items-center justify-between py-2 border-b" style={{borderColor:C.g100}}>
                <span className="text-sm font-bold text-gray-700">Country</span>
                <button
                  onClick={() => setShowCountry(true)}
                  className="flex items-center gap-1 text-sm font-black text-gray-900 hover:text-emerald-600">
                  <span>{selCountry.flag} {selCountry.name}</span>
                  <ChevronDown size={14} />
                </button>
              </div>

              {/* Sorting row */}
              <div className="flex items-center justify-between py-2 border-b" style={{borderColor:C.g100}}>
                <span className="text-sm font-bold text-gray-700">Sorting</span>
                <select
                  value={sortBy}
                  onChange={e => setSortBy(e.target.value)}
                  className="text-sm font-black text-gray-900 bg-transparent focus:outline-none cursor-pointer">
                  <option value="rate_low">Recommended</option>
                  <option value="rating">Top Rated</option>
                  <option value="trades">Most Trades</option>
                </select>
              </div>

              {/* Toggles section */}
              <div className="space-y-4 pt-2">
                {[
                  { key: 'topRated', title: 'Show only top-rated traders', desc: 'Experienced traders with badges' },
                  { key: 'verified', title: 'Verified users only', desc: 'Show offers from ID-verified users' },
                  { key: 'trusted', title: 'Trusted users only', desc: 'Show offers from trusted users' },
                  { key: 'recentlyActive', title: 'Recently active', desc: 'Last seen 30 mins ago' },
                  { key: 'acceptable', title: 'Acceptable only', desc: 'Show only offers that I can accept now' },
                ].map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-black text-gray-800">{item.title}</p>
                      <p className="text-[10px] font-semibold text-gray-400">{item.desc}</p>
                    </div>
                    <input type="checkbox"
                      checked={advFilters[item.key]}
                      onChange={(e) => setAdvFilters(prev => ({...prev, [item.key]: e.target.checked}))}
                      className="w-5 h-5 accent-emerald-500 rounded cursor-pointer" />
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-6 border-t space-y-2" style={{borderColor:C.g200}}>
              <button
                onClick={() => setShowFilters(false)}
                className="w-full py-3.5 rounded-xl bg-emerald-500 text-white font-black text-sm shadow-md hover:bg-emerald-600 transition">
                Apply
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ 5. NOONES CURRENCY MODAL ════════════════════════════════════ */}
      {showCurrency && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex flex-col justify-end md:flex-row md:justify-end">
          <div className="w-full md:max-w-md bg-white h-[85vh] md:h-full rounded-t-2xl md:rounded-none flex flex-col p-4 overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-3 mb-4" style={{borderColor:C.g200}}>
              <h3 className="text-lg font-black text-gray-900">Currency</h3>
              <button onClick={() => setShowCurrency(false)} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 transition">
                <X size={18} />
              </button>
            </div>
            <input
              type="text"
              placeholder="Search..."
              value={currencySearch}
              onChange={e => setCurrencySearch(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-gray-100 text-sm font-bold focus:outline-none mb-4"
            />
            <div className="space-y-1 flex-1 overflow-y-auto">
              {CURRENCIES.filter(c => !currencySearch || c.name.toLowerCase().includes(currencySearch.toLowerCase()) || c.code.toLowerCase().includes(currencySearch.toLowerCase())).map((c, idx) => {
                const countryCode = c.code.substring(0, 2).toLowerCase();
                return (
                  <button
                    key={idx}
                    onClick={() => { setSelCurrency(c); setShowCurrency(false); }}
                    className={`w-full flex items-center justify-between p-3 rounded-xl text-xs font-bold border-b transition ${selCurrency.code === c.code ? 'bg-emerald-50 text-emerald-700' : 'hover:bg-gray-50 text-gray-800'}`}
                    style={{borderColor:C.g100}}>
                    <div className="flex items-center gap-3">
                      <span className="w-6 h-6 rounded-sm object-cover overflow-hidden bg-gray-100 flex items-center justify-center text-[10px]">
                        <CountryFlag countryCode={countryCode} />
                      </span>
                      <span className="text-sm font-black text-gray-800">{c.name}</span>
                    </div>
                    {selCurrency.code === c.code && <CheckCircle size={16} className="text-emerald-600" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ══ 6. NOONES COUNTRY MODAL ════════════════════════════════════ */}
      {showCountry && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-2xl max-h-[80vh] flex flex-col p-4 overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-3 mb-4" style={{borderColor:C.g200}}>
              <h3 className="text-lg font-black text-gray-900">Country</h3>
              <button onClick={() => setShowCountry(false)} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 transition">
                <X size={18} />
              </button>
            </div>
            <input
              type="text"
              placeholder="Search..."
              value={countrySearch}
              onChange={e => setCountrySearch(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-gray-100 text-sm font-bold focus:outline-none mb-4"
            />
            <div className="space-y-1 flex-1 overflow-y-auto">
              {(() => {
                const q = countrySearch.toLowerCase();
                const filteredC = COUNTRIES.filter(c => !q || c.name.toLowerCase().includes(q));
                let lastReg = null;
                return filteredC.map((c, idx) => {
                  const regHdr = !q && c.region && c.region !== lastReg
                    ? (lastReg = c.region, (
                      <div key={`r-${c.region}`} className="px-1 py-1.5 mt-2 first:mt-0">
                        <span className="text-[10px] font-black uppercase tracking-wider text-gray-400">{c.region}</span>
                      </div>
                    ))
                    : (c.region && (lastReg = c.region), null);
                  return [regHdr,
                    <button
                      key={c.code}
                      onClick={() => {
                        setSelCountry(c);
                        setShowCountry(false);
                        setCountrySearch('');
                        if (c.currency) { const matched = CURRENCIES.find(curr => curr.code === c.currency); if (matched) setSelCurrency(matched); }
                      }}
                      className={`w-full flex items-center justify-between p-3 rounded-xl text-xs font-bold border-b transition ${selCountry.code === c.code ? 'bg-emerald-50 text-emerald-700' : 'hover:bg-gray-50 text-gray-800'}`}
                      style={{borderColor:C.g100}}>
                      <div className="flex items-center gap-3">
                        <span className="text-base flex-shrink-0">{c.flag}</span>
                        <span className="text-sm font-black text-gray-800">{c.name}</span>
                      </div>
                      {selCountry.code === c.code && <CheckCircle size={16} className="text-emerald-600" />}
                    </button>
                  ];
                });
              })()}
            </div>
          </div>
        </div>
      )}

      {/* ══ 4. NOONES PAYMENT METHOD MODAL (WITH FULL PRAQEN PAYMENT OPTIONS) ════════════════════════════════════ */}
      {showPayment && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex flex-col justify-end md:flex-row md:justify-end">
          <div className="w-full md:max-w-md bg-white h-[85vh] md:h-full rounded-t-2xl md:rounded-none flex flex-col justify-between p-4 overflow-y-auto">
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b pb-3" style={{borderColor:C.g200}}>
                <h3 className="text-lg font-black text-gray-900">Payment methods</h3>
                <button onClick={() => setShowPayment(false)} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 transition">
                  <X size={18} />
                </button>
              </div>

              <input
                type="text"
                placeholder="Search payment method…"
                value={paymentSearch}
                onChange={e => setPaymentSearch(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-gray-100 text-xs font-bold focus:outline-none"
              />

              <div className="space-y-2">
                <p className="text-xs font-black text-gray-800">Most popular</p>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { label: 'All Methods', val: 'all' },
                    { label: 'MTN Mobile Money', val: 'mtn_momo' },
                    { label: 'Vodafone Cash', val: 'vodafone' },
                    { label: 'M-Pesa', val: 'mpesa' },
                    { label: 'Bank Transfer', val: 'bank transfer' }
                  ].map((m, i) => (
                    <button
                      key={i}
                      onClick={() => { setSelPayment(m.val); setShowPayment(false); }}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${selPayment === m.val ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'}`}>
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1 pt-2 max-h-[60vh] overflow-y-auto">
                {PAYMENT_OPTIONS.filter(p => !paymentSearch || p.label.toLowerCase().includes(paymentSearch.toLowerCase()) || p.value.toLowerCase().includes(paymentSearch.toLowerCase())).map((p, idx) => (
                  <button
                    key={idx}
                    onClick={() => { setSelPayment(p.value); setShowPayment(false); }}
                    className={`w-full flex items-center justify-between p-3 rounded-xl text-xs font-bold border-b transition ${selPayment === p.value ? 'bg-emerald-50 text-emerald-700' : 'hover:bg-gray-50 text-gray-800'}`}
                    style={{borderColor:C.g100}}>
                    <div className="flex items-center gap-2.5">
                      <span className="text-base">{p.icon}</span>
                      <span>{p.label}</span>
                    </div>
                    {selPayment === p.value && <CheckCircle size={14} className="text-emerald-600" />}
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-4 border-t" style={{borderColor:C.g200}}>
              <button
                onClick={() => setShowPayment(false)}
                className="w-full py-3.5 rounded-xl bg-emerald-500 text-white font-black text-sm shadow-md hover:bg-emerald-600 transition">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
        {/* Related SEO Guides Section */}
            <div className="mt-8 mb-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    Helpful Trading Guides
                </h4>
                <ul className="text-xs space-y-1.5 text-blue-600 dark:text-blue-400">
                    <li>
                        <a href="/blog/p2p-crypto-trading-fees" className="hover:underline">
                            → Understanding P2P Crypto Trading Fees
                        </a>
                    </li>
                    <li>
                        <a href="/blog/p2p-crypto-escrow-works" className="hover:underline">
                            → How P2P Crypto Escrow Works
                        </a>
                    </li>
                    <li>
                        <a href="/blog/p2p-trading-scams-and-how-to-avoid-themes" className="hover:underline">
                            → P2P Trading Scams & How to Stay Safe
                        </a>
                    </li>
                </ul>
            </div>

        
      <PRQFooter/>

      {modal && (
        <BuyerModal
          buyer={modal.buyer}
          listing={modal.listing}
          btcPriceUSD={btcPrice}
          onClose={()=>setModal(null)}
          onTrade={()=>handleSell(modal.listing?.id)}
        />
      )}
    </div>
  );
}
