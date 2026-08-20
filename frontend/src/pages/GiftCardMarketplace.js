import { useState, useEffect, useRef } from 'react';
import { useRates } from '../contexts/RatesContext';
import { useNavigate, Link } from 'react-router-dom';
import SEO from '../components/SEO';
import axios from 'axios';
import {
  CheckCircle, RefreshCw, AlertTriangle,
  BadgeCheck, Timer, X, Info, Shield,
  ArrowRight, PlusCircle, Filter, MapPin, Heart,
  Home, Wallet, User, Gift, Bitcoin,
  ChevronDown, CreditCard, ThumbsUp, ThumbsDown, Repeat2,
  Phone, Mail, Ban, ArrowUp, ArrowDown,
  Zap, Users, TrendingUp, Award, Sparkles, ShieldCheck,
  Crown, Star, MessageSquare, Wifi, Coins, Trophy, Globe
} from 'lucide-react';
import { toast } from 'react-toastify';
import CountryFlag, { resolveCode } from '../components/CountryFlag';
import { TRUST_MAP, deriveBadge, BadgeChip, BADGE_COLORS } from '../lib/badge';
import ActiveTradeCard from '../components/ActiveTradeCard';
import PRQFooter from '../components/PRQFooter';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

// ── Color palette ─────────────────────────────────────────────────────────────
const C = {
  forest: '#1B4332', green: '#2D6A4F', mint: '#40916C',
  gold: '#F4A422', accent: '#0D9488', mist: '#F0FAF5',
  g50: '#F8FAFC', g100: '#F1F5F9', g200: '#E2E8F0',
  g300: '#CBD5E1', g400: '#94A3B8', g500: '#64748B',
  g600: '#475569', g700: '#334155', g800: '#1E293B',
  success: '#10B981', danger: '#EF4444', online: '#22C55E',
  warn: '#F59E0B',
  // Design system constants
  cardRadius: 16,
};

// ── Featured badge config ─────────────────────────────────────────────────────
const FEATURED = {
  fast_responder: {
    tag: <span className="flex items-center gap-1.5"><Zap size={13} fill="currentColor" /> FAST RESPONDER OF THE WEEK</span>,
    ribbon: 'linear-gradient(90deg,#1E3A8A 0%,#3730A3 18%,#6366F1 38%,#A5B4FC 50%,#6366F1 62%,#3730A3 82%,#1E3A8A 100%)',
    border: '#4F46E5',
    glow: 'rgba(79,70,229,0.38)',
    bg: '#F9F9FF',
    bgGradient: 'linear-gradient(150deg,rgba(165,180,252,0.22) 0%,#F9F9FF 42%,rgba(99,102,241,0.12) 100%)',
    divider: 'rgba(79,70,229,0.20)',
    labelColor: '#3730A3',
    btnGradient: 'linear-gradient(135deg,#1E3A8A 0%,#4F46E5 55%,#818CF8 100%)',
    btnShadow: '0 4px 20px rgba(79,70,229,0.55)',
    pulse: true,
  },
  active_trader: {
    tag: <span className="flex items-center gap-1.5"><Crown size={13} fill="currentColor" /> ACTIVE TRADER OF THE WEEK</span>,
    ribbon: 'linear-gradient(90deg,#92400E 0%,#B45309 18%,#F59E0B 38%,#FDE68A 50%,#F59E0B 62%,#B45309 82%,#92400E 100%)',
    border: '#D97706',
    glow: 'rgba(217,119,6,0.38)',
    bg: '#FFFDF5',
    bgGradient: 'linear-gradient(150deg,rgba(253,230,138,0.28) 0%,#FFFDF5 42%,rgba(251,191,36,0.14) 100%)',
    divider: 'rgba(217,119,6,0.22)',
    labelColor: '#92400E',
    btnGradient: 'linear-gradient(135deg,#78350F 0%,#D97706 55%,#FBBF24 100%)',
    btnShadow: '0 4px 20px rgba(217,119,6,0.55)',
    pulse: true,
  },
};

// ── Trust badge map ───────────────────────────────────────────────────────────

const CUR_SYM = {
  GHS: '₵', NGN: '₦', KES: 'KSh', ZAR: 'R', UGX: 'USh', TZS: 'TSh',
  USD: '$', GBP: '£', EUR: '€', XAF: 'CFA', XOF: 'CFA',
  INR: '₹', CNY: '¥', JPY: '¥', KRW: '₩', PHP: '₱', THB: '฿',
  MYR: 'RM', IDR: 'Rp', VND: '₫', PKR: '₨', BDT: '৳', RUB: '₽', VES: 'Bs.',
};

const COUNTRY_REGIONS = {
  Africa: '#10B981', Asia: '#3B82F6', 'Middle East': '#F97316',
  Americas: '#EC4899', Europe: '#7C3AED', Oceania: '#0EA5E9',
};

const COUNTRIES = [
  { code: 'ALL', name: 'All Countries', flag: <Globe size={14} className="inline-block align-middle" />, region: null },
  // Africa
  { code: 'GH', name: 'Ghana', flag: '🇬🇭', region: 'Africa' },
  { code: 'NG', name: 'Nigeria', flag: '🇳🇬', region: 'Africa' },
  { code: 'KE', name: 'Kenya', flag: '🇰🇪', region: 'Africa' },
  { code: 'TZ', name: 'Tanzania', flag: '🇹🇿', region: 'Africa' },
  { code: 'UG', name: 'Uganda', flag: '🇺🇬', region: 'Africa' },
  { code: 'RW', name: 'Rwanda', flag: '🇷🇼', region: 'Africa' },
  { code: 'CI', name: "Côte d'Ivoire", flag: '🇨🇮', region: 'Africa' },
  { code: 'CM', name: 'Cameroon', flag: '🇨🇲', region: 'Africa' },
  { code: 'SN', name: 'Senegal', flag: '🇸🇳', region: 'Africa' },
  { code: 'ML', name: 'Mali', flag: '🇲🇱', region: 'Africa' },
  { code: 'BF', name: 'Burkina Faso', flag: '🇧🇫', region: 'Africa' },
  { code: 'BJ', name: 'Benin', flag: '🇧🇯', region: 'Africa' },
  { code: 'TG', name: 'Togo', flag: '🇹🇬', region: 'Africa' },
  { code: 'NE', name: 'Niger', flag: '🇳🇪', region: 'Africa' },
  { code: 'CD', name: 'DR Congo', flag: '🇨🇩', region: 'Africa' },
  { code: 'ZM', name: 'Zambia', flag: '🇿🇲', region: 'Africa' },
  { code: 'ZW', name: 'Zimbabwe', flag: '🇿🇼', region: 'Africa' },
  { code: 'MZ', name: 'Mozambique', flag: '🇲🇿', region: 'Africa' },
  { code: 'ZA', name: 'South Africa', flag: '🇿🇦', region: 'Africa' },
  { code: 'EG', name: 'Egypt', flag: '🇪🇬', region: 'Africa' },
  { code: 'MA', name: 'Morocco', flag: '🇲🇦', region: 'Africa' },
  { code: 'ET', name: 'Ethiopia', flag: '🇪🇹', region: 'Africa' },
  { code: 'TN', name: 'Tunisia', flag: '🇹🇳', region: 'Africa' },
  { code: 'DZ', name: 'Algeria', flag: '🇩🇿', region: 'Africa' },
  { code: 'AO', name: 'Angola', flag: '🇦🇴', region: 'Africa' },
  { code: 'GN', name: 'Guinea', flag: '🇬🇳', region: 'Africa' },
  // Asia
  { code: 'IN', name: 'India', flag: '🇮🇳', region: 'Asia' },
  { code: 'CN', name: 'China', flag: '🇨🇳', region: 'Asia' },
  { code: 'JP', name: 'Japan', flag: '🇯🇵', region: 'Asia' },
  { code: 'KR', name: 'South Korea', flag: '🇰🇷', region: 'Asia' },
  { code: 'HK', name: 'Hong Kong', flag: '🇭🇰', region: 'Asia' },
  { code: 'TW', name: 'Taiwan', flag: '🇹🇼', region: 'Asia' },
  { code: 'PH', name: 'Philippines', flag: '🇵🇭', region: 'Asia' },
  { code: 'ID', name: 'Indonesia', flag: '🇮🇩', region: 'Asia' },
  { code: 'PK', name: 'Pakistan', flag: '🇵🇰', region: 'Asia' },
  { code: 'BD', name: 'Bangladesh', flag: '🇧🇩', region: 'Asia' },
  { code: 'VN', name: 'Vietnam', flag: '🇻🇳', region: 'Asia' },
  { code: 'TH', name: 'Thailand', flag: '🇹🇭', region: 'Asia' },
  { code: 'MY', name: 'Malaysia', flag: '🇲🇾', region: 'Asia' },
  { code: 'SG', name: 'Singapore', flag: '🇸🇬', region: 'Asia' },
  // Middle East
  { code: 'AE', name: 'UAE', flag: '🇦🇪', region: 'Middle East' },
  { code: 'SA', name: 'Saudi Arabia', flag: '🇸🇦', region: 'Middle East' },
  { code: 'QA', name: 'Qatar', flag: '🇶🇦', region: 'Middle East' },
  { code: 'KW', name: 'Kuwait', flag: '🇰🇼', region: 'Middle East' },
  { code: 'IL', name: 'Israel', flag: '🇮🇱', region: 'Middle East' },
  { code: 'TR', name: 'Turkey', flag: '🇹🇷', region: 'Middle East' },
  // Americas
  { code: 'US', name: 'United States', flag: '🇺🇸', region: 'Americas' },
  { code: 'CA', name: 'Canada', flag: '🇨🇦', region: 'Americas' },
  { code: 'BR', name: 'Brazil', flag: '🇧🇷', region: 'Americas' },
  { code: 'MX', name: 'Mexico', flag: '🇲🇽', region: 'Americas' },
  { code: 'CO', name: 'Colombia', flag: '🇨🇴', region: 'Americas' },
  { code: 'AR', name: 'Argentina', flag: '🇦🇷', region: 'Americas' },
  { code: 'CL', name: 'Chile', flag: '🇨🇱', region: 'Americas' },
  { code: 'PE', name: 'Peru', flag: '🇵🇪', region: 'Americas' },
  // Europe
  { code: 'GB', name: 'United Kingdom', flag: '🇬🇧', region: 'Europe' },
  { code: 'DE', name: 'Germany', flag: '🇩🇪', region: 'Europe' },
  { code: 'FR', name: 'France', flag: '🇫🇷', region: 'Europe' },
  { code: 'IT', name: 'Italy', flag: '🇮🇹', region: 'Europe' },
  { code: 'ES', name: 'Spain', flag: '🇪🇸', region: 'Europe' },
  { code: 'NL', name: 'Netherlands', flag: '🇳🇱', region: 'Europe' },
  { code: 'SE', name: 'Sweden', flag: '🇸🇪', region: 'Europe' },
  { code: 'NO', name: 'Norway', flag: '🇳🇴', region: 'Europe' },
  { code: 'DK', name: 'Denmark', flag: '🇩🇰', region: 'Europe' },
  { code: 'CH', name: 'Switzerland', flag: '🇨🇭', region: 'Europe' },
  { code: 'PL', name: 'Poland', flag: '🇵🇱', region: 'Europe' },
  { code: 'UA', name: 'Ukraine', flag: '🇺🇦', region: 'Europe' },
  { code: 'PT', name: 'Portugal', flag: '🇵🇹', region: 'Europe' },
  { code: 'IE', name: 'Ireland', flag: '🇮🇪', region: 'Europe' },
  { code: 'EU', name: 'Europe (EUR)', flag: '🇪🇺', region: 'Europe' },
  // Oceania
  { code: 'AU', name: 'Australia', flag: '🇦🇺', region: 'Oceania' },
  { code: 'NZ', name: 'New Zealand', flag: '🇳🇿', region: 'Oceania' },
];

const CURRENCIES = [
  { code: 'GHS', symbol: '₵', name: 'Ghana Cedi', region: 'Africa' },
  { code: 'NGN', symbol: '₦', name: 'Nigerian Naira', region: 'Africa' },
  { code: 'KES', symbol: 'KSh', name: 'Kenyan Shilling', region: 'Africa' },
  { code: 'ZAR', symbol: 'R', name: 'SA Rand', region: 'Africa' },
  { code: 'UGX', symbol: 'USh', name: 'Ugandan Shilling', region: 'Africa' },
  { code: 'TZS', symbol: 'TSh', name: 'Tanzanian Shilling', region: 'Africa' },
  { code: 'RWF', symbol: 'RF', name: 'Rwandan Franc', region: 'Africa' },
  { code: 'XOF', symbol: 'CFA', name: 'CFA Franc (West)', region: 'Africa' },
  { code: 'XAF', symbol: 'CFA', name: 'CFA Franc (Central)', region: 'Africa' },
  { code: 'EGP', symbol: 'E£', name: 'Egyptian Pound', region: 'Africa' },
  { code: 'MAD', symbol: 'MAD', name: 'Moroccan Dirham', region: 'Africa' },
  { code: 'ETB', symbol: 'Br', name: 'Ethiopian Birr', region: 'Africa' },
  { code: 'USD', symbol: '$', name: 'US Dollar', region: 'Americas' },
  { code: 'CAD', symbol: 'CA$', name: 'Canadian Dollar', region: 'Americas' },
  { code: 'BRL', symbol: 'R$', name: 'Brazilian Real', region: 'Americas' },
  { code: 'MXN', symbol: 'MX$', name: 'Mexican Peso', region: 'Americas' },
  { code: 'COP', symbol: 'COP$', name: 'Colombian Peso', region: 'Americas' },
  { code: 'ARS', symbol: 'AR$', name: 'Argentine Peso', region: 'Americas' },
  { code: 'CLP', symbol: 'CLP$', name: 'Chilean Peso', region: 'Americas' },
  { code: 'GBP', symbol: '£', name: 'British Pound', region: 'Europe' },
  { code: 'EUR', symbol: '€', name: 'Euro', region: 'Europe' },
  { code: 'CHF', symbol: 'CHF', name: 'Swiss Franc', region: 'Europe' },
  { code: 'SEK', symbol: 'kr', name: 'Swedish Krona', region: 'Europe' },
  { code: 'NOK', symbol: 'kr', name: 'Norwegian Krone', region: 'Europe' },
  { code: 'DKK', symbol: 'kr', name: 'Danish Krone', region: 'Europe' },
  { code: 'PLN', symbol: 'zł', name: 'Polish Zloty', region: 'Europe' },
  { code: 'UAH', symbol: '₴', name: 'Ukrainian Hryvnia', region: 'Europe' },
  { code: 'TRY', symbol: '₺', name: 'Turkish Lira', region: 'Europe' },
  { code: 'RUB', symbol: '₽', name: 'Russian Ruble', region: 'Europe' },
  { code: 'INR', symbol: '₹', name: 'Indian Rupee', region: 'Asia' },
  { code: 'CNY', symbol: '¥', name: 'Chinese Yuan', region: 'Asia' },
  { code: 'JPY', symbol: '¥', name: 'Japanese Yen', region: 'Asia' },
  { code: 'KRW', symbol: '₩', name: 'Korean Won', region: 'Asia' },
  { code: 'HKD', symbol: 'HK$', name: 'Hong Kong Dollar', region: 'Asia' },
  { code: 'SGD', symbol: 'S$', name: 'Singapore Dollar', region: 'Asia' },
  { code: 'MYR', symbol: 'RM', name: 'Malaysian Ringgit', region: 'Asia' },
  { code: 'THB', symbol: '฿', name: 'Thai Baht', region: 'Asia' },
  { code: 'IDR', symbol: 'Rp', name: 'Indonesian Rupiah', region: 'Asia' },
  { code: 'PHP', symbol: '₱', name: 'Philippine Peso', region: 'Asia' },
  { code: 'PKR', symbol: '₨', name: 'Pakistani Rupee', region: 'Asia' },
  { code: 'BDT', symbol: '৳', name: 'Bangladeshi Taka', region: 'Asia' },
  { code: 'VND', symbol: '₫', name: 'Vietnamese Dong', region: 'Asia' },
  { code: 'TWD', symbol: 'NT$', name: 'Taiwan Dollar', region: 'Asia' },
  { code: 'AED', symbol: 'AED', name: 'UAE Dirham', region: 'Middle East' },
  { code: 'SAR', symbol: 'SR', name: 'Saudi Riyal', region: 'Middle East' },
  { code: 'QAR', symbol: 'QR', name: 'Qatari Riyal', region: 'Middle East' },
  { code: 'ILS', symbol: '₪', name: 'Israeli Shekel', region: 'Middle East' },
  { code: 'AUD', symbol: 'A$', name: 'Australian Dollar', region: 'Oceania' },
  { code: 'NZD', symbol: 'NZ$', name: 'New Zealand Dollar', region: 'Oceania' },
];

const FOREIGN_CURRENCY_CODES = [
  'USD', 'GBP', 'CAD', 'EUR', 'AUD', 'SGD', 'CHF', 'SEK', 'NOK', 'DKK',
  'NZD', 'JPY', 'HKD', 'PLN', 'BRL', 'MXN'
];

const GC_FILTER_CURRENCIES = CURRENCIES.filter(c => FOREIGN_CURRENCY_CODES.includes(c.code));

const PAYMENT_OPTIONS = [
  'All Payments', 'MTN Mobile Money', 'Vodafone Cash', 'AirtelTigo Money',
  'M-Pesa', 'Bank Transfer', 'PayPal', 'Cash App', 'OPay', 'PalmPay',
  'Orange Money', 'Wave', 'Zelle', 'Revolut',
];

const GC_BRAND_GROUPS = [
  { cat: null, color: null, items: ['All Brands'] },
  {
    cat: '🛍️ Shopping', color: '#10B981', items: [
      'Amazon', 'Amazon (US)', 'Amazon (UK)', 'Amazon (CA)', 'Amazon (AU)', 'Amazon (DE)',
      'eBay', 'Walmart', 'Target', 'Best Buy', 'GameStop',
      'IKEA', 'H&M', 'Zara', 'ASOS', 'Shein', 'Temu',
      'Foot Locker', 'Nike Gift Card', 'Adidas', 'Old Navy',
      'Home Depot', "Macy's", 'Nordstrom', 'Sephora', 'Bath & Body Works',
      'Jumia Voucher',
    ]
  },
  {
    cat: '📱 Tech', color: '#3B82F6', items: [
      'Apple / iTunes', 'iTunes Denmark', 'Google Play', 'Microsoft / Xbox Store',
    ]
  },
  {
    cat: '🎮 Gaming', color: '#7C3AED', items: [
      'Steam', 'Xbox', 'PlayStation', 'Nintendo eShop',
      'Roblox', 'Razer Gold', 'Epic Games / Fortnite',
      'PUBG Mobile (UC)', 'Free Fire (Diamonds)', 'Garena',
      'Valorant (VP)', 'League of Legends (RP)', 'EA Play / Origin',
      'Minecraft', 'Clash of Clans', 'Mobile Legends',
      'Call of Duty (CP)', 'Genshin Impact', 'Honor of Kings',
    ]
  },
  {
    cat: '🎬 Streaming', color: '#EC4899', items: [
      'Netflix', 'Spotify', 'YouTube Premium', 'Disney+',
      'Hulu', 'HBO Max / Max', 'Amazon Prime', 'Apple TV+',
      'Twitch', 'Crunchyroll', 'Deezer', 'Tidal', 'SoundCloud',
    ]
  },
  {
    cat: '🍔 Food & Delivery', color: '#F97316', items: [
      'Starbucks', "McDonald's", 'Chipotle', "Dunkin'",
      'Uber Eats', 'DoorDash', 'Grubhub',
    ]
  },
  {
    cat: '✈️ Travel', color: '#0D9488', items: [
      'Airbnb', 'Uber', 'Hotels.com', 'Booking.com',
    ]
  },
  {
    cat: '💳 Financial / Prepaid', color: '#F59E0B', items: [
      'Visa Gift Card', 'Mastercard GC', 'American Express GC',
      'Paysafe Card', 'Neosurf', 'MoneyPak', 'PostePay', 'Crypto Voucher',
    ]
  },
  { cat: '📦 Other', color: '#64748B', items: ['Other'] },
];
// Flat list used by filter logic
const GC_BRANDS = GC_BRAND_GROUPS.flatMap(g => g.items);

const GC_FACE_VALUES = [10, 20, 25, 50, 100, 200, 500, 1000];

const fmt = (n, d = 0) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: d }).format(n || 0);
const fBtc = (n) => parseFloat(n || 0).toFixed(8);

const getUser = (u) => Array.isArray(u) ? u[0] : (u || {});
const getDisplayName = (u) => (u?.username || '');
const isVerified = (u) => !!(u?.kyc_verified || u?.is_verified || u?.is_id_verified || u?.is_email_verified);
const getTrades = (u) => parseInt(u?.total_trades ?? u?.trade_count ?? 0);
const getLastSeen = (u) => {
  const d = u?.last_seen_at || u?.last_login || u?.updated_at || u?.created_at;
  if (!d) return { label: '—', online: false };
  const s = (Date.now() - new Date(d)) / 1000;
  if (s < 300) return { label: 'ACTIVE NOW', online: true };
  if (s < 3600) { const m = ~~(s / 60); return { label: `${m} ${m === 1 ? 'min' : 'mins'} ago`, online: false }; }
  if (s < 86400) { const h = ~~(s / 3600); return { label: `${h} ${h === 1 ? 'hr' : 'hrs'} ago`, online: false }; }
  const dy = ~~(s / 86400); return { label: `${dy} ${dy === 1 ? 'day' : 'days'} ago`, online: false };
};
const getRateUSD = (l, btcPrice) => {
  if (l.pricing_type === 'fixed') { const s = parseFloat(l.bitcoin_price || 0); if (s > 100) return s; }
  return btcPrice * (1 + parseFloat(l.margin || 0) / 100);
};
const getBrand = (l) => l.gift_card_brand || l.giftCardBrand || l.card_brand || 'Gift Card';
const getFaceVal = (l) => { const v = l.face_value || l.card_value || l.amount_usd; return v ? parseFloat(v) : null; };
const getCardRange = (l) => {
  let arr = l.card_values || l.face_values || l.accepted_denominations || l.denominations || l.card_denominations;
  if (typeof arr === 'string') {
    // Handle PostgreSQL array format: {10,20,50}
    if (arr.startsWith('{')) arr = arr.replace(/[{}]/g, '').split(',').map(Number).filter(Boolean);
    else { try { arr = JSON.parse(arr); } catch { arr = arr.split(',').map(Number).filter(Boolean); } }
  }
  if (Array.isArray(arr) && arr.length) {
    const parsed = arr.map(v => parseFloat(v)).filter(v => !isNaN(v) && v > 0).sort((a, b) => a - b);
    if (parsed.length) return parsed;
  }
  const fv = getFaceVal(l);
  if (fv && fv > 0) return [fv];
  const min = parseFloat(l.min_face_value || l.min_card_value || l.min_limit_local || l.min_amount || l.min_limit || 0);
  const max = parseFloat(l.max_face_value || l.max_card_value || l.max_limit_local || l.max_amount || l.max_limit || 0);
  if (min > 0 && max > 0) return [{ min, max, isRange: true }];
  if (min > 0) return [min];
  return null;
};

// ── Avatar ────────────────────────────────────────────────────────────────────
const _avatarCache = {}; // userId → Promise<url> | url-string | null
function Avatar({ user, size = 48, radius = 'rounded-xl' }) {
  const [err, setErr] = useState(false);
  const [lazyUrl, setLazyUrl] = useState(null);
  const u = getUser(user);
  useEffect(() => {
    const stored = u?.avatar_url;
    const id = u?.id;
    if (stored || !id || err) return;
    const hit = _avatarCache[id];
    if (hit instanceof Promise) { hit.then(v => { if (v) setLazyUrl(v); }); return; }
    if (hit !== undefined) { setLazyUrl(hit); return; }
    const p = axios.get(`${API_URL}/users/${id}/avatar`)
      .then(r => r.data?.avatar_url || null)
      .catch(() => null)
      .then(v => { _avatarCache[id] = v; if (v) setLazyUrl(v); return v; });
    _avatarCache[id] = p;
  }, [u?.id, u?.avatar_url, err]);
  const url = u?.avatar_url || lazyUrl;
  if (url && !err) return (
    <img src={url} alt={u.username || 'user'} onError={() => setErr(true)}
      loading="lazy" width={size} height={size}
      className={`object-cover flex-shrink-0 ${radius}`} style={{ width: size, height: size }} />
  );
  return (
    <div className={`flex-shrink-0 flex items-center justify-center font-bold text-white ${radius}`}
      style={{ width: size, height: size, backgroundColor: C.accent, fontSize: Math.round(size * 0.38) }}>
      {(u?.username || '?').charAt(0).toUpperCase()}
    </div>
  );
}

// ── Gift Card Offer Card ──────────────────────────────────────────────────────
// Placeholder shown in place of GCCard while the initial /api/listings response is still
// loading, so the marketplace paints immediately instead of a blank/spinner block.
function GCCardSkeleton() {
  const bar = (style) => <div className="animate-pulse rounded-md" style={{ backgroundColor: C.g100, ...style }} />;
  return (
    <div className="rounded-2xl overflow-hidden w-full" style={{ border: `1px solid ${C.g200}`, background: '#fff' }}>
      <div className="p-3.5 space-y-3">
        <div className="flex items-center gap-2.5">
          {bar({ width: 36, height: 36, borderRadius: 10, flexShrink: 0 })}
          <div className="flex-1 space-y-1.5">
            {bar({ height: 10, width: '55%' })}
            {bar({ height: 8, width: '35%' })}
          </div>
        </div>
        {bar({ height: 14, width: '70%' })}
        {bar({ height: 34, width: '100%', borderRadius: 12 })}
        {bar({ height: 28, width: '100%', borderRadius: 10 })}
      </div>
    </div>
  );
}

function GCCard({ listing, btcPriceUSD, onViewSeller, onTrade, featuredType }) {
  const { rates: USD_RATES } = useRates();
  const u = getUser(listing.users);
  const [seen, setSeen] = useState(() => getLastSeen(u));
  useEffect(() => {
    const id = setInterval(() => setSeen(getLastSeen(u)), 30000);
    return () => clearInterval(id);
  }, []);
  const trades = getTrades(u);
  const brand = getBrand(listing);
  const fv = getFaceVal(listing);
  const margin = parseFloat(listing.margin || 0);
  const cur = listing.currency || 'USD';
  const sym = listing.currency_symbol || CUR_SYM[cur] || '$';
  const usdRate = USD_RATES[cur] || 1;
  const rateUSD = getRateUSD(listing, btcPriceUSD);
  const rateLocal = rateUSD * usdRate;

  const cardType = listing.card_type || 'both';
  const cardRange = getCardRange(listing);

  // Fallback local starting value if range not found
  const localVal = cardRange
    ? (cardRange[0]?.isRange ? cardRange[0].min : cardRange[0])
    : (listing.min_limit_local || listing.min_amount || fv || 0);

  // Card-value side of the trade — always the gift card's face value, regardless of which direction this listing runs.
  const cardSide = (() => {
    if (!cardRange) {
      return { val: localVal > 0 ? `${sym}${fmt(localVal)}` : 'Flexible', sub: localVal > 0 ? `${cur} starting` : cur };
    }
    if (cardRange[0]?.isRange) return { val: `${sym}${fmt(cardRange[0].min)}`, sub: `${cur} starting` };
    if (cardRange.length === 1) return { val: `${sym}${fmt(cardRange[0])}`, sub: `${cur} card` };
    return { val: `${sym}${fmt(cardRange[0])}`, sub: `${cur} starting` };
  })();

  // Convert local currency value into USD equivalent for crypto calculation
  const refUSD = localVal > 0 ? (usdRate > 0 ? localVal / usdRate : localVal) : 1;
  const btcOut = refUSD / (rateUSD || 1);
  const viewerIsBuyingCard = listing.listing_type === 'BUY_GIFT_CARD';
  
  // Crypto side value formatted in local offer currency (e.g., £, C$, ₵, $) matching the offer currency
  const receiveLocal = btcOut * (rateLocal || (btcPriceUSD * usdRate) || 0);
  const cryptoSide = { val: `${sym}${receiveLocal < 1 ? receiveLocal.toFixed(2) : fmt(receiveLocal, 2)}`, sub: `≈ ${fBtc(btcOut)} BTC` };
  const youGive    = viewerIsBuyingCard ? cardSide   : cryptoSide;
  const youReceive = viewerIsBuyingCard ? cryptoSide : cardSide;

  const rangeLabel = !cardRange ? (localVal > 0 ? `${sym}${fmt(localVal)}+` : 'Any value')
    : cardRange[0]?.isRange ? `${sym}${fmt(cardRange[0].min)} – ${sym}${fmt(cardRange[0].max)}`
    : cardRange.map(v => `${sym}${fmt(v)}`).join(' | ');

  const pos = parseInt(u.positive_feedback || 0);
  const neg = parseInt(u.negative_feedback || 0);

  const brandLabel = /card/i.test(brand) ? brand.toUpperCase() : `${brand.toUpperCase()} CARD`;
  const ft = featuredType ? FEATURED[featuredType] : null;

  return (
    <div className={`rounded-2xl overflow-hidden transition-all w-full hover:-translate-y-0.5 ${ft ? '' : 'shadow-[0_1px_2px_rgba(27,67,50,0.04),0_10px_28px_-14px_rgba(27,67,50,0.18)] hover:shadow-[0_2px_4px_rgba(27,67,50,0.06),0_20px_44px_-16px_rgba(27,67,50,0.28)]'}`}
      style={{
        background: ft?.bgGradient || (ft ? ft.bg : '#fff'),
        border: ft ? `2.5px solid ${ft.border}` : `1px solid ${C.g200}`,
        boxShadow: ft ? `0 0 0 3px ${ft.glow}, 0 10px 36px ${ft.glow}` : undefined,
        animation: ft?.pulse ? (featuredType === 'fast_responder' ? 'fastResponderPulse 2.5s ease-in-out infinite' : 'featuredPulse 2.5s ease-in-out infinite') : undefined,
      }}>

      {/* ─ Featured ribbon ───────────────────────────────────────── */}
      {ft && (
        <div style={{ position: 'relative', overflow: 'hidden' }}>
          <div className="flex items-center justify-center gap-2"
            style={{ background: ft.ribbon, padding: '10px 16px' }}>
            <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: '0.08em', color: '#fff', textShadow: '0 1px 4px rgba(0,0,0,0.4)', whiteSpace: 'nowrap' }}>
              {ft.tag}
            </span>
          </div>
          {ft.pulse && (
            <div style={{
              position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
              background: 'linear-gradient(90deg,transparent 0%,rgba(255,255,255,0.30) 50%,transparent 100%)',
              animation: 'shimmer 2.4s linear infinite',
              pointerEvents: 'none',
            }} />
          )}
        </div>
      )}

      {/* ─ Seller row ────────────────────────────────────────────── */}
      <div className="px-3.5 pt-3 pb-2">
        <div className="flex items-start justify-between gap-2">
          {/* Left section: Avatar + Username & Like/Dislike/Trades */}
          <div className="flex items-start gap-2.5 min-w-0 flex-1">
            <div className="relative flex-shrink-0">
              <button onClick={onViewSeller}>
                <Avatar user={u} size={40} radius="rounded-xl" />
              </button>
              {seen.online && (
                <span className="absolute -bottom-0.5 -right-0.5">
                  <span className="absolute inline-flex w-3 h-3 rounded-full animate-ping"
                    style={{ backgroundColor: C.online, opacity: 0.6 }} />
                  <span className="relative inline-flex rounded-full w-3 h-3 border-2 border-white"
                    style={{ backgroundColor: C.online }} />
                </span>
              )}
            </div>

            <div className="flex flex-col gap-0.5 items-start min-w-0 flex-1">
              <div className="flex items-center gap-1.5 min-w-0">
                <CountryFlag
                  countryCode={u?.country_code || u?.country || u?.location || null}
                  className="w-4 h-3 rounded-sm flex-shrink-0" />
                <button onClick={onViewSeller}
                  className="font-black text-sm hover:underline leading-tight truncate min-w-0"
                  style={{ color: C.g800 }}>
                  {getDisplayName(u) || 'Seller'}
                </button>
                {isVerified(u) && <BadgeCheck size={14} style={{ color: '#3B82F6', flexShrink: 0 }} />}
                {listing.listing_type === 'SELL_GIFT_CARD' && listing.seller_has_deposit && (
                  <span title="Seller has a $200 security deposit locked" className="inline-flex items-center gap-0.5 flex-shrink-0"
                    style={{ color: '#16A34A' }}>
                    <ShieldCheck size={14} />
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                <span className="inline-flex items-center gap-0.5 font-bold flex-shrink-0"
                  style={{ color: '#16A34A', fontSize: '11px' }}>
                  <ThumbsUp size={10} strokeWidth={2.5} />{fmt(pos)}
                </span>
                <span className="inline-flex items-center gap-0.5 font-bold flex-shrink-0"
                  style={{ color: '#EF4444', fontSize: '11px' }}>
                  <ThumbsDown size={10} strokeWidth={2.5} />{fmt(neg)}
                </span>
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold flex-shrink-0" style={{ color: C.g500 }}>
                  <Repeat2 size={10} strokeWidth={2.5} style={{ color: C.g400 }} />
                  {fmt(trades)} trades
                </span>
              </div>
            </div>
          </div>

          {/* Right section: Stacked BadgeChip & Active status pill */}
          <div className="flex flex-col gap-1 items-end flex-shrink-0 pt-0.5">
            <div>
              <BadgeChip user={u} size="xs" />
            </div>
            <div>
              {seen.online ? (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold flex-shrink-0"
                  style={{ backgroundColor: '#F0FDF4', color: C.online }}>
                  <span className="relative flex w-1.5 h-1.5 flex-shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ backgroundColor: C.online }} />
                    <span className="relative inline-flex rounded-full w-1.5 h-1.5" style={{ backgroundColor: C.online }} />
                  </span>
                  Active
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium flex-shrink-0"
                  style={{ backgroundColor: C.g100, color: C.g400 }}>
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: C.g300 }} />
                  {seen.label}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ─ Divider ───────────────────────────────────────────────── */}
      <div style={{ height: 1, backgroundColor: ft ? ft.divider : C.g100 }} />

      {/* ─ You Give / You Receive ────────────────────────────────── */}
      <div className="px-3.5 py-2.5 grid grid-cols-2 gap-2.5">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide mb-0.5" style={{ color: ft ? ft.labelColor : C.g500 }}>You give</p>
          <p className="text-base font-bold leading-tight" style={{ color: C.g800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: '4px' }}>
            {youGive.val}
          </p>
          <p className="text-[10px] font-semibold mt-0.5" style={{ color: C.g500 }}>{youGive.sub}</p>
        </div>
        <div className="border-l pl-3" style={{ borderColor: ft ? ft.divider : C.g100 }}>
          <p className="text-[11px] font-bold uppercase tracking-wide mb-0.5" style={{ color: ft ? ft.labelColor : C.g500 }}>You receive</p>
          <p className="text-base font-bold leading-tight" style={{ color: C.g800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: '4px' }}>
            {youReceive.val}
          </p>
          <p className="text-[10px] font-semibold mt-0.5" style={{ color: C.g500 }}>{youReceive.sub}</p>
        </div>
      </div>

      {/* Brand + card type pills above the divider line */}
      <div className="px-3.5 pt-1 pb-2 flex items-center gap-1.5 flex-wrap">
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold"
          style={{ backgroundColor: 'rgba(13,148,136,0.08)', color: C.accent, border: '1px solid rgba(13,148,136,0.15)' }}>
          {brandLabel}
        </span>
        {(cardType === 'physical' || cardType === 'both') && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold" style={{ backgroundColor: '#DCFCE7', color: '#166534' }}>
            Physical
          </span>
        )}
        {(cardType === 'ecode' || cardType === 'both') && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold" style={{ backgroundColor: '#EDE9FE', color: '#5B21B6' }}>
            E-Code
          </span>
        )}
        {listing.listing_type === 'SELL_GIFT_CARD' && listing.seller_has_deposit && (
          <span title="Seller has locked a $200 security deposit — PRAQEN-approved"
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold"
            style={{ backgroundColor: '#DCFCE7', color: '#166534', border: '1px solid rgba(22,101,52,0.2)' }}>
            <ShieldCheck size={12} /> S. Deposit
          </span>
        )}
      </div>

      <div className="px-3.5 pb-2.5" style={{ borderTop: `1px solid ${ft ? ft.divider : C.g100}` }}>
        {/* ── Rate / % / Range — grey info board ───── */}
        <div className="group relative mt-1">
          <div className="rounded-xl px-2.5 py-2 flex items-center justify-between transition-colors"
            style={{ backgroundColor: C.g100, border: `1px solid ${C.g200}` }}>

            <div className="min-w-0">
              <p className="text-xs font-semibold" style={{ color: C.g600 }}>
                Rate:&nbsp;<span style={{ color: C.g800, fontWeight: 700 }}>{fmt(rateLocal)}</span>&nbsp;<span style={{ color: C.g500, fontSize: '0.85em' }}>{cur}</span>
              </p>
              <p className="text-xs font-semibold mt-1 truncate" style={{ color: C.g600, maxWidth: 190 }}>
                Range:&nbsp;<span style={{ color: C.g700, fontWeight: 700 }}>{rangeLabel}</span>
              </p>
            </div>

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
            style={{ zIndex: 20 }}>
            <div className="rounded-xl shadow-2xl border p-3 text-xs"
              style={{ backgroundColor: '#1E293B', borderColor: '#334155', color: '#E2E8F0', position: 'relative' }}>
              <p className="font-black text-[10px] uppercase tracking-wider mb-2" style={{ color: '#64748B' }}>Offer Details</p>
              <div className="flex items-center justify-between mb-1.5">
                <span style={{ color: '#94A3B8' }}>Rate</span>
                <span className="font-bold" style={{ color: '#F0FAF5' }}>{fmt(rateLocal)} {cur}</span>
              </div>
              <div className="flex items-center justify-between mb-1.5">
                <span style={{ color: '#94A3B8' }}>Margin</span>
                <span className="font-bold"
                  style={{ color: margin < 0 ? '#4ADE80' : margin > 0 ? '#F87171' : '#94A3B8' }}>
                  {margin === 0 ? 'Market rate' : `${margin > 0 ? '+' : ''}${margin}%`}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span style={{ color: '#94A3B8' }}>Range</span>
                <span className="font-bold" style={{ color: '#F0FAF5' }}>{rangeLabel}</span>
              </div>
              <div style={{ position: 'absolute', bottom: '-5px', left: '20px', width: 10, height: 10, backgroundColor: '#1E293B', border: '1px solid #334155', borderTop: 'none', borderLeft: 'none', transform: 'rotate(45deg)' }} />
            </div>
          </div>
        </div>
      </div>

      {/* ─ Actions ───────────────────────────────────────────────── */}
      <div className="px-3.5 pb-3 flex items-center gap-2">
        <button onClick={onViewSeller}
          className="w-9 h-9 rounded-xl border flex items-center justify-center flex-shrink-0 transition"
          style={{
            borderColor: ft ? ft.border : C.g200,
            backgroundColor: ft ? `${ft.border}12` : 'transparent',
          }}>
          <Info size={14} style={{ color: ft ? ft.border : C.g400 }} />
        </button>
        <div style={{ position: 'relative', flex: 1 }}>
          <button onClick={onTrade}
            className="w-full h-9 rounded-xl text-white font-black text-sm flex items-center justify-center gap-1.5 hover:opacity-90 active:scale-[0.98] transition"
            style={{
              background: ft ? ft.btnGradient : C.forest,
              boxShadow: ft ? ft.btnShadow : undefined,
            }}>
            {viewerIsBuyingCard ? 'BUY' : 'SELL'} <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Seller Modal ──────────────────────────────────────────────────────────────
function SellerModal({ seller, listing, onClose, onTrade, btcPriceUSD }) {
  const [tab, setTab] = useState('overview');
  const [reviews, setReviews] = useState([]);
  const [rvLoad, setRvLoad] = useState(false);
  const [freshSeller, setFreshSeller] = useState(null);
  const { rates: USD_RATES } = useRates();

  const sellerId = getUser(seller)?.id;
  useEffect(() => {
    if (!sellerId) return;
    axios.get(`${API_URL}/users/${sellerId}`)
      .then(r => { const d = r.data.user || r.data; if (d?.id) setFreshSeller(d); })
      .catch(() => { });
  }, [sellerId]);

  const u = getUser(freshSeller || seller);
  const badge = deriveBadge(u);
  const seen = getLastSeen(u);
  const trades = getTrades(u);
  const rating = parseFloat(u.average_rating || 0);
  const brand = getBrand(listing || {});
  const fv = getFaceVal(listing || {});
  const cur = listing?.currency || 'USD';
  const sym = listing?.currency_symbol || CUR_SYM[cur] || '$';
  const usdRate = USD_RATES[cur] || 1;
  const rate = getRateUSD(listing || {}, btcPriceUSD || 68000) * usdRate;
  const margin = parseFloat(listing?.margin || 0);

  const phoneOk = !!(u.is_phone_verified || u.phone_verified);
  const emailOk = !!(u.is_email_verified || u.email_verified);
  const kycOk = !!(u.is_id_verified || u.kyc_verified);
  const pos = parseInt(u.positive_feedback || 0);
  const neg = parseInt(u.negative_feedback || 0);
  const total = pos + neg;
  const trust = total > 0 ? Math.round(pos / total * 100) : trades > 0 ? 100 : 0;
  const compRate = parseFloat(u.completion_rate || 0);
  const blocks = parseInt(u.blocks_received || u.blocks_count || 0);
  const ccCode = resolveCode(u.country || u.location);
  const avgReply = u.avg_response_time || u.avg_reply_minutes;
  const payMins = parseFloat(u.avg_payment_time || u.avg_response_time || u.avg_reply_minutes || 0);
  const avgPayDisplay = payMins > 0 ? (() => { const m = Math.floor(payMins), s = Math.round((payMins - m) * 60); return s > 0 ? `${m}m ${s}s` : m > 0 ? `${m}m` : `${s}s`; })() : '—';
  const locCC = ccCode ? ccCode.toUpperCase() : '';
  const CC_NAME = { GH: 'Ghana', NG: 'Nigeria', KE: 'Kenya', ZA: 'S. Africa', UG: 'Uganda', TZ: 'Tanzania', RW: 'Rwanda', CM: 'Cameroon', SN: 'Senegal', ML: 'Mali', CI: "Côte d'Ivoire", CD: 'DR Congo', ZM: 'Zambia', MZ: 'Mozambique', ZW: 'Zimbabwe', BF: 'Burkina Faso', BJ: 'Benin', TG: 'Togo', NE: 'Niger', ET: 'Ethiopia', EG: 'Egypt', MA: 'Morocco', DZ: 'Algeria', AO: 'Angola', US: 'USA', GB: 'UK', DE: 'Germany', FR: 'France', IT: 'Italy', ES: 'Spain', NL: 'Netherlands', SE: 'Sweden', NO: 'Norway', PL: 'Poland', UA: 'Ukraine', TR: 'Turkey', VN: 'Vietnam', TH: 'Thailand', ID: 'Indonesia', PH: 'Philippines', MY: 'Malaysia', SG: 'Singapore', IN: 'India', CN: 'China', JP: 'Japan', KR: 'S. Korea', PK: 'Pakistan', BD: 'Bangladesh', SA: 'Saudi Arabia', AE: 'UAE', QA: 'Qatar', BR: 'Brazil', MX: 'Mexico', CO: 'Colombia', AR: 'Argentina', CA: 'Canada', AU: 'Australia', NZ: 'New Zealand' };
  const countryName = (u.country && u.country.length > 2) ? u.country : (CC_NAME[locCC] || u.location || (locCC || '—'));

  useEffect(() => {
    if (tab !== 'feedback' || !u.id || reviews.length) return;
    setRvLoad(true);
    axios.get(`${API_URL}/users/${u.id}/reviews`)
      .then(r => setReviews(r.data.reviews || []))
      .catch(() => { })
      .finally(() => setRvLoad(false));
  }, [tab, u.id]);

  if (!seller) return null;

  const TABS = [
    { id: 'overview', label: '👤 Profile' },
    { id: 'feedback', label: `💬 Reviews (${total})` },
    { id: 'rules', label: '📋 Rules' },
    { id: 'offer', label: '📊 Offer' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>

      <div className="bg-white w-full sm:max-w-sm rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[92dvh] sm:max-h-[85vh] mb-[calc(60px_+_env(safe-area-inset-bottom,_0px))] sm:mb-0"
        style={{ border: `1px solid ${C.g200}`, animation: 'slideUp .28s cubic-bezier(0.34,1.56,0.64,1)' }}>
        <style>{`@keyframes slideUp{from{transform:translateY(40px);opacity:0}to{transform:translateY(0);opacity:1}}`}</style>

        {/* Drag handle */}
        <div className="flex justify-center pt-2.5 pb-1 flex-shrink-0 sm:hidden">
          <div className="w-10 h-1 rounded-full" style={{ backgroundColor: C.g200 }} />
        </div>

        {/* Header */}
        <div className="relative px-4 pt-3 pb-4 flex-shrink-0"
          style={{ background: `linear-gradient(135deg,${C.forest} 0%,${C.mint} 100%)` }}>
          <button onClick={onClose}
            className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center"
            style={{ backgroundColor: 'rgba(255,255,255,0.18)' }}>
            <X size={15} className="text-white" />
          </button>

          {/* Gift card brand tag */}
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg mb-3"
            style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}>
            <CreditCard size={11} className="text-white/70" />
            <span className="text-xs font-bold text-white">{brand}</span>
            {fv && <span className="text-xs font-bold text-white/70">${fv}</span>}
          </div>

          <div className="flex items-center gap-3 mb-4">
            <div className="relative flex-shrink-0">
              <Avatar user={u} size={56} radius="rounded-2xl" />
              <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-white"
                style={{ backgroundColor: seen.online ? C.online : C.g400 }} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                <a href={u?.id ? `/profile/${u.id}` : '#'}
                  onClick={() => u?.id && axios.post(`${API_URL}/users/${u.id}/view-profile`).catch(() => { })}
                  className="font-bold text-white text-base leading-tight truncate"
                  style={{ textDecoration: 'none', borderBottom: '1.5px solid rgba(255,255,255,0.4)', paddingBottom: '1px' }}>
                  {getDisplayName(u) || 'Seller'}
                </a>
                {kycOk && <BadgeCheck size={15} style={{ color: '#93C5FD', flexShrink: 0 }} />}
              </div>
              <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
                <CountryFlag countryCode={ccCode} className="w-4 h-3 rounded-sm" />
                <span className="text-white/60 text-xs">{seen.online ? '🟢 Active now' : seen.label}</span>
              </div>
              <span className={`inline-flex items-center gap-px px-2 py-0.5 rounded-full border text-xs font-bold ${badge.animate ? 'shadow' : ''}`}
                style={{ background: badge.bg, borderColor: badge.borderColor, boxShadow: badge.glow ? `0 0 6px ${badge.glow}` : undefined }}>
                <span style={{ color: badge.iconColor || badge.textColor }}>{badge.icon}</span>
                <span style={{ color: badge.textColor }}>{badge.label}</span>
              </span>
            </div>
          </div>

          {/* Stats 2×2 grid */}
          <div className="grid grid-cols-2 gap-2">
            {/* Last active */}
            <div className="flex items-center gap-2 rounded-xl px-3 py-2.5" style={{ backgroundColor: 'rgba(255,255,255,0.12)' }}>
              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: seen.online ? '#4ADE80' : '#94A3B8' }} />
              <div className="min-w-0">
                <p className="text-white font-bold text-xs leading-tight truncate">{seen.online ? 'Online now' : seen.label}</p>
                <p className="text-white/50 text-xs leading-tight">Last active</p>
              </div>
            </div>
            {/* Location — real flag image, real country name */}
            <div className="flex items-center gap-2 rounded-xl px-3 py-2.5" style={{ backgroundColor: 'rgba(255,255,255,0.12)' }}>
              <CountryFlag countryCode={ccCode} className="w-5 h-3.5 rounded-sm flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-white font-bold text-xs leading-tight truncate">{countryName}</p>
                <p className="text-white/50 text-xs leading-tight">Location</p>
              </div>
            </div>
            {/* Avg. response */}
            <div className="flex items-center gap-2 rounded-xl px-3 py-2.5" style={{ backgroundColor: 'rgba(255,255,255,0.12)' }}>
              <Timer size={14} style={{ color: '#FDE68A', flexShrink: 0 }} />
              <div className="min-w-0">
                <p className="text-white font-bold text-xs leading-tight">{avgPayDisplay}</p>
                <p className="text-white/50 text-xs leading-tight">Avg. response</p>
              </div>
            </div>
            {/* Trusted by */}
            <div className="flex items-center gap-2 rounded-xl px-3 py-2.5" style={{ backgroundColor: 'rgba(255,255,255,0.12)' }}>
              <Heart size={14} style={{ color: pos > 0 ? '#86EFAC' : 'rgba(255,255,255,0.5)', flexShrink: 0 }} />
              <div className="min-w-0">
                <p className="text-white font-bold text-xs leading-tight">{pos > 0 ? `${fmt(pos)} users` : 'No ratings yet'}</p>
                <p className="text-white/50 text-xs leading-tight">Trusted by</p>
              </div>
            </div>
          </div>

          {/* ── VIEW FULL PROFILE LINK ── */}
          {u?.id && (
            <a href={`/profile/${u.id}`}
              onClick={() => axios.post(`${API_URL}/users/${u.id}/view-profile`).catch(() => { })}
              className="mt-3 flex items-center justify-center gap-1.5 w-full py-2 rounded-xl text-xs font-bold transition hover:bg-white/20 active:scale-95"
              style={{
                color: 'rgba(255,255,255,0.9)',
                border: '1.5px solid rgba(255,255,255,0.25)',
                backgroundColor: 'rgba(255,255,255,0.1)',
                textDecoration: 'none',
              }}>
              <span>View Full Profile</span>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M7 17L17 7M17 7H7M17 7v10" />
              </svg>
            </a>
          )}
        </div>

        {/* Tabs */}
        <div className="flex border-b flex-shrink-0 overflow-x-auto" style={{ borderColor: C.g200 }}>
          {TABS.map(({ id, label }) => (
            <button key={id} onClick={() => setTab(id)}
              className="flex-shrink-0 px-3 py-2.5 text-xs font-bold whitespace-nowrap transition"
              style={{
                color: tab === id ? C.green : C.g500,
                borderBottom: tab === id ? `2px solid ${C.green}` : '2px solid transparent',
                backgroundColor: tab === id ? `${C.green}08` : 'transparent',
              }}>
              {label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto p-4" style={{ WebkitOverflowScrolling: 'touch', minHeight: 0 }}>

          {/* OVERVIEW */}
          {tab === 'overview' && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'Trades', value: fmt(trades), sub: 'completed' },
                  { label: 'Rating', value: <span className="inline-flex items-center gap-1 justify-center"><Star size={13} fill="currentColor" className="text-amber-500" /> {rating.toFixed(1)}</span>, sub: 'of 5.0' },
                  { label: 'Completion', value: `${compRate.toFixed(0)}%`, sub: 'rate' },
                ].map(({ label, value, sub }) => (
                  <div key={label} className="rounded-xl p-3 text-center"
                    style={{ backgroundColor: C.mist, border: `1px solid ${C.g200}` }}>
                    <p className="font-bold text-sm" style={{ color: C.forest }}>{value}</p>
                    <p className="text-xs font-semibold mt-0.5" style={{ color: C.g500 }}>{label}</p>
                    <p className="text-xs" style={{ color: C.g400 }}>{sub}</p>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <div className="flex-1 flex items-center gap-2 rounded-xl px-3 py-2.5"
                  style={{ backgroundColor: '#F0FDF4', border: '1px solid #86EFAC' }}>
                  <ThumbsUp size={14} style={{ color: '#16A34A', flexShrink: 0 }} />
                  <div>
                    <p className="font-bold text-sm" style={{ color: '#16A34A' }}>{fmt(pos)}</p>
                    <p className="text-xs" style={{ color: '#166534' }}>Positive</p>
                  </div>
                </div>
                <div className="flex-1 flex items-center gap-2 rounded-xl px-3 py-2.5"
                  style={{ backgroundColor: '#FEF2F2', border: '1px solid #FCA5A5' }}>
                  <ThumbsDown size={14} style={{ color: '#DC2626', flexShrink: 0 }} />
                  <div>
                    <p className="font-bold text-sm" style={{ color: '#DC2626' }}>{fmt(neg)}</p>
                    <p className="text-xs" style={{ color: '#991B1B' }}>Negative</p>
                  </div>
                </div>
              </div>
              <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${C.g200}` }}>
                <p className="text-xs font-bold px-3 py-2 uppercase tracking-wider"
                  style={{ color: C.g500, backgroundColor: C.g50 }}>Verification</p>
                {[
                  { label: 'Phone Number', ok: phoneOk, icon: <Phone size={14} className="text-gray-500" /> },
                  { label: 'Email Address', ok: emailOk, icon: <Mail size={14} className="text-gray-500" /> },
                  { label: 'ID / KYC', ok: kycOk, icon: <ShieldCheck size={14} className="text-gray-500" /> },
                ].map(({ label, ok, icon }) => (
                  <div key={label} className="flex items-center justify-between px-3 py-2.5 border-t"
                    style={{ borderColor: C.g100 }}>
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{icon}</span>
                      <span className="text-xs font-semibold" style={{ color: C.g700 }}>{label}</span>
                    </div>
                    <span className="text-xs font-bold px-2.5 py-1 rounded-full"
                      style={{ backgroundColor: ok ? '#F0FDF4' : '#FEF2F2', color: ok ? '#16A34A' : '#DC2626' }}>
                      {ok ? '✓ Verified' : '✗ Not verified'}
                    </span>
                  </div>
                ))}
              </div>
              {u.bio && (
                <div className="rounded-xl p-3" style={{ backgroundColor: C.g50, border: `1px solid ${C.g200}` }}>
                  <p className="text-xs font-bold mb-1" style={{ color: C.g500 }}>About</p>
                  <p className="text-xs leading-relaxed" style={{ color: C.g700 }}>{u.bio}</p>
                </div>
              )}
              <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${C.g200}` }}>
                {[
                  avgReply ? { label: 'Avg. Response', value: `~${Math.round(avgReply)} min` } : null,
                  {
                    label: 'Country', value: (() => {
                      const cc = (u.country || '').slice(0, 2).toUpperCase();
                      if (!cc) return '—';
                      const flag = cc.replace(/./g, c => String.fromCodePoint(0x1F1E0 + c.charCodeAt(0) - 65));
                      return `${flag} ${u.country || cc}`;
                    })()
                  },
                  { label: 'Member since', value: u.created_at ? new Date(u.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '—' },
                ].filter(Boolean).map(({ label, value }) => (
                  <div key={label} className="flex items-center justify-between px-3 py-2.5 border-b last:border-0"
                    style={{ borderColor: C.g100 }}>
                    <span className="text-xs font-semibold" style={{ color: C.g500 }}>{label}</span>
                    <span className="text-xs font-bold" style={{ color: C.g800 }}>{value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* FEEDBACK */}
          {tab === 'feedback' && (
            <div className="space-y-3">
              <div className="flex gap-2 p-3 rounded-xl"
                style={{ backgroundColor: C.mist, border: `1px solid ${C.g200}` }}>
                <div className="text-center px-3">
                  <p className="text-2xl font-bold" style={{ color: C.forest }}>{rating.toFixed(1)}</p>
                  <p className="text-xs" style={{ color: C.g400 }}>Rating</p>
                </div>
                <div className="w-px" style={{ backgroundColor: C.g200 }} />
                <div className="flex-1 flex items-center gap-3 px-2">
                  <div className="text-center flex-1">
                    <p className="font-bold text-sm" style={{ color: '#16A34A' }}>{fmt(pos)}</p>
                    <p className="text-xs flex items-center justify-center gap-1" style={{ color: C.g400 }}>
                      <ThumbsUp size={11} className="text-green-600" /> Positive
                    </p>
                  </div>
                  <div className="text-center flex-1">
                    <p className="font-bold text-sm" style={{ color: '#DC2626' }}>{fmt(neg)}</p>
                    <p className="text-xs flex items-center justify-center gap-1" style={{ color: C.g400 }}>
                      <ThumbsDown size={11} className="text-red-600" /> Negative
                    </p>
                  </div>
                  <div className="text-center flex-1">
                    <p className="font-bold text-sm" style={{ color: C.forest }}>{trust}%</p>
                    <p className="text-xs" style={{ color: C.g400 }}>Trust</p>
                  </div>
                </div>
              </div>
              {rvLoad ? (
                <div className="space-y-2">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="rounded-xl p-3 border animate-pulse" style={{ borderColor: C.g200 }}>
                      <div className="flex gap-2 mb-2">
                        <div className="w-7 h-7 rounded-full" style={{ backgroundColor: C.g200 }} />
                        <div className="flex-1 space-y-1.5">
                          <div className="h-2.5 rounded w-1/3" style={{ backgroundColor: C.g200 }} />
                          <div className="h-2 rounded w-1/4" style={{ backgroundColor: C.g100 }} />
                        </div>
                      </div>
                      <div className="h-2.5 rounded w-4/5" style={{ backgroundColor: C.g100 }} />
                    </div>
                  ))}
                </div>
              ) : reviews.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-3xl mb-2" style={{ color: C.g400 }}>
                    <MessageSquare size={28} className="inline-block align-middle" />
                  </p>
                  <p className="font-bold text-sm" style={{ color: C.g700 }}>No reviews yet</p>
                  <p className="text-xs mt-1" style={{ color: C.g400 }}>Be the first to trade with this seller</p>
                </div>
              ) : (
                reviews.slice(0, 20).map((rv, i) => {
                  const isPos = rv.rating >= 4;
                  const ago = rv.created_at ? (() => {
                    const s = (Date.now() - new Date(rv.created_at)) / 1000;
                    if (s < 3600) return `${~~(s / 60)}m ago`;
                    if (s < 86400) return `${~~(s / 3600)}h ago`;
                    return `${~~(s / 86400)}d ago`;
                  })() : '';
                  return (
                    <div key={i} className="rounded-xl border p-3"
                      style={{ borderColor: isPos ? '#86EFAC' : '#FCA5A5', backgroundColor: isPos ? '#F0FDF4' : '#FEF2F2' }}>
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                            style={{ backgroundColor: isPos ? '#16A34A' : '#DC2626' }}>
                            {isPos ? <ThumbsUp size={12} strokeWidth={2.5} /> : <ThumbsDown size={12} strokeWidth={2.5} />}
                          </div>
                          <span className="text-xs font-bold" style={{ color: isPos ? '#166534' : '#991B1B' }}>
                            {rv.reviewer?.username || 'Anonymous'}
                          </span>
                        </div>
                        <span className="text-xs" style={{ color: C.g400 }}>{ago}</span>
                      </div>
                      {rv.comment && (
                        <p className="text-xs leading-relaxed pl-8" style={{ color: isPos ? '#14532D' : '#7F1D1D' }}>
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
          {tab === 'rules' && (
            <div className="space-y-3">
              <div className="p-3.5 rounded-xl text-sm leading-relaxed whitespace-pre-wrap"
                style={{ backgroundColor: C.mist, color: C.g700, border: `1px solid ${C.g200}` }}>
                {listing?.trade_instructions || listing?.listing_terms || listing?.description ||
                  'Send the gift card code and PIN in the trade chat. Wait for buyer confirmation before release.'}
              </div>
              <div className="flex items-center gap-2.5 p-3 rounded-xl"
                style={{ backgroundColor: '#FFFBEB', border: '1px solid #FDE68A' }}>
                <Timer size={14} style={{ color: C.warn, flexShrink: 0 }} />
                <p className="text-xs font-bold" style={{ color: '#92400E' }}>
                  Time limit: {listing?.time_limit || 30} min — auto-cancels if not completed
                </p>
              </div>
              <div className="flex items-start gap-2.5 p-3 rounded-xl"
                style={{ backgroundColor: '#FEF2F2', border: '1px solid #FCA5A5' }}>
                <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" style={{ color: C.danger }} />
                <p className="text-xs leading-relaxed" style={{ color: '#991B1B' }}>
                  Only share card codes inside the active trade chat. Escrow protects both parties.
                </p>
              </div>
            </div>
          )}

          {/* OFFER DETAILS */}
          {tab === 'offer' && (
            <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${C.g200}` }}>
              {[
                { label: 'Card Brand', value: brand },
                { label: 'Face Value', value: fv ? `$${fv} USD` : 'Varies' },
                { label: 'Payment Method', value: listing?.payment_method || '—' },
                { label: 'Rate / BTC', value: `${sym}${fmt(rate, 0)} ${cur}` },
                { label: 'Margin', value: margin === 0 ? 'At market' : margin > 0 ? `+${margin}% above market` : `${margin}% below market` },
                { label: 'Time Limit', value: `${listing?.time_limit || 30} minutes` },
                {
                  label: 'Country', value: (() => {
                    const raw = listing?.country_name || u.country || '';
                    if (!raw) return '—';
                    const cc = raw.slice(0, 2).toUpperCase();
                    const flag = cc.replace(/./g, c => String.fromCodePoint(0x1F1E0 + c.charCodeAt(0) - 65));
                    return `${flag} ${raw}`;
                  })()
                },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-center justify-between px-3.5 py-3 border-b last:border-0"
                  style={{ borderColor: C.g100 }}>
                  <span className="text-xs font-semibold" style={{ color: C.g500 }}>{label}</span>
                  <span className="text-xs font-bold text-right ml-4" style={{ color: C.g800, maxWidth: '60%' }}>{value}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="p-4 flex gap-3 flex-shrink-0 border-t" style={{ borderColor: C.g200 }}>
          <button onClick={onClose}
            className="flex-1 py-3 rounded-2xl border text-sm font-bold hover:bg-gray-50 transition"
            style={{ borderColor: C.g200, color: C.g600 }}>
            Close
          </button>
          <button onClick={() => { onClose(); onTrade(); }}
            className="flex-1 py-3 rounded-2xl text-white text-sm font-black flex items-center justify-center gap-2 shadow-md active:scale-[0.98] transition"
            style={{ background: FEATURED.fast_responder.btnGradient, boxShadow: FEATURED.fast_responder.btnShadow }}>
            Trade Now <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Skeleton card ─────────────────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div className="bg-white rounded-2xl border animate-pulse w-full" style={{ borderColor: C.g200 }}>
      <div className="h-16 rounded-t-2xl" style={{ backgroundColor: C.g200 }} />
      <div className="px-4 pt-3 pb-4 space-y-2.5">
        <div className="h-3 rounded-lg w-2/3" style={{ backgroundColor: C.g200 }} />
        <div className="h-2.5 rounded-lg w-1/2" style={{ backgroundColor: C.g100 }} />
        <div className="h-9 rounded-xl mt-1" style={{ backgroundColor: C.g200 }} />
      </div>
    </div>
  );
}


// ── Main GiftCards Page ───────────────────────────────────────────────────────
export default function GiftCards({ user }) {
  const navigate = useNavigate();
  const { rates: USD_RATES, btcUsd: contextBtcUsd } = useRates();
  const _hasUsers = (data) => Array.isArray(data) && data.some(l => l.users && (l.users.id || l.users.username));
  const _cacheAll = () => { try { const c = JSON.parse(localStorage.getItem('praqen_market_all') || 'null'); if (!c || Date.now() - c.ts > 1800000 || !_hasUsers(c.data)) return null; return c?.data || null; } catch { return null; } };
  const isGcListing = (l) => l.listing_type === 'BUY_GIFT_CARD' || l.listing_type === 'SELL_GIFT_CARD';
  const _gcNow = () => { const a = _cacheAll(); return a ? a.filter(isGcListing) : []; };
  const [listings, setListings] = useState(() => _gcNow());
  const [loading, setLoading] = useState(() => _gcNow().length === 0);
  const [loadError, setLoadError] = useState(false);
  const [retrying, setRetrying] = useState(false);
  // How many of the already-filtered results are rendered at once. Progressive reveal so the
  // initial paint is ~24 cards instead of every matching listing at once, without changing
  // what /api/listings fetches (the existing filter stack below — currency, country, brand,
  // trader search, amount, sort — is entirely client-side with no server-side equivalent, so
  // this windows the display rather than the network request).
  const [visibleCount, setVisibleCount] = useState(24);
  const [btcPrice, setBtcPrice] = useState(68000);
  const [affLeaderboard, setAffLeaderboard] = useState([]);
  const [selCurrency, setSelCurrency] = useState(CURRENCIES.find(c => c.code === 'USD') || CURRENCIES[0]);
  const [selBrand, setSelBrand] = useState('All Brands');
  const [selCountry, setSelCountry] = useState(COUNTRIES[0]);
  const [amountInput, setAmountInput] = useState('');
  const [sortBy, setSortBy] = useState('rate_low');
  const [traderSearch, setTraderSearch] = useState('');
  const [showCurrency, setShowCurrency] = useState(false);
  const [showBrand, setShowBrand] = useState(false);
  const [showCountry, setShowCountry] = useState(false);
  const [showAssetMenu, setShowAssetMenu] = useState(false);
  const [showSellAssetMenu, setShowSellAssetMenu] = useState(false);
  const [cryptoFilter, setCryptoFilter] = useState('ALL'); // 'ALL' | 'BTC' | 'USDT'
  const [showCryptoMenu, setShowCryptoMenu] = useState(false);
  const [gcMode, setGcMode] = useState('buy'); // 'buy' | 'sell' | 'all'
  const [modal, setModal] = useState(null);
  const [activeTrades, setActiveTrades] = useState([]);
  const [showAllTrades, setShowAllTrades] = useState(false);
  const [pausedOffer, setPausedOffer] = useState(false);
  const [currencySearch, setCurrencySearch] = useState('');
  const [brandSearch, setBrandSearch] = useState('');
  const [countrySearch, setCountrySearch] = useState('');
  const currencyRef = useRef(null);
  const brandRef = useRef(null);
  const countryRef = useRef(null);
  const cryptoRef = useRef(null);
  const [activeGuide, setActiveGuide] = useState(null);
  const guideTimer = useRef(null);

  function handleGuideEnter(id) { clearTimeout(guideTimer.current); setActiveGuide(id); }
  function handleGuideLeave() { guideTimer.current = setTimeout(() => setActiveGuide(null), 140); }

  const GUIDE_TOTAL = 4;
  function MarketGuide({ id, icon: Icon = Info, title, body, example, guideStep, align = 'left' }) {
    if (activeGuide !== id) return null;
    const isTab = id.startsWith('tab_');
    const isRightTab = id.includes('giftcards') || id.includes('crypto');
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
        animation: 'gcGuideFadeDown 0.2s ease both',
        pointerEvents: 'none',
        overflowY: 'auto',
        boxSizing: 'border-box', color: '#fff',
      }}>
        <style>{`
          @keyframes gcGuideFadeUp{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
          @keyframes gcGuideFadeDown{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:translateY(0)}}
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

  useEffect(() => { if (contextBtcUsd > 0) setBtcPrice(contextBtcUsd); }, [contextBtcUsd]);
  useEffect(() => {
    loadListings();
    const interval = setInterval(() => loadListings(1, true), 60000);
    return () => clearInterval(interval);
  }, []);
  useEffect(() => {
    const tk = localStorage.getItem('token');
    if (!tk) return;
    const h = { Authorization: `Bearer ${tk}` };
    const toUTC = s => new Date(/[Z+]/.test(s) ? s : s + 'Z');
    const fetchTrades = () => axios.get(`${API_URL}/trades/active`, { headers: h }).then(res => {
      if (res.data.success) {
        const now = Date.now();
        setActiveTrades((res.data.trades || []).filter(t =>
          ['PAYMENT_SENT', 'DISPUTED'].includes(t.status) ||
          !t.expires_at || toUTC(t.expires_at).getTime() > now
        ));
      }
    }).catch(() => { });
    Promise.all([
      axios.post(`${API_URL}/users/heartbeat`, {}, { headers: h }).catch(() => { }),
      fetchTrades(),
    ]);
    const iv1 = setInterval(() => axios.post(`${API_URL}/users/heartbeat`, {}, { headers: h }).catch(() => { }), 60000);
    const iv2 = setInterval(fetchTrades, 10000);
    return () => { clearInterval(iv1); clearInterval(iv2); };
  }, [user]);
  useEffect(() => {
    const h = e => {
      if (currencyRef.current && !currencyRef.current.contains(e.target)) { setShowCurrency(false); setCurrencySearch(''); }
      if (brandRef.current && !brandRef.current.contains(e.target)) { setShowBrand(false); setBrandSearch(''); }
      if (countryRef.current && !countryRef.current.contains(e.target)) { setShowCountry(false); setCountrySearch(''); }
      if (cryptoRef.current && !cryptoRef.current.contains(e.target)) { setShowCryptoMenu(false); }
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  // Reset the reveal window whenever the active filter set changes, so switching brand/
  // country/mode/etc. starts back at the first 24 matches instead of showing a stale count.
  useEffect(() => {
    setVisibleCount(24);
  }, [gcMode, cryptoFilter, selBrand, amountInput, selCountry.code, traderSearch, sortBy]);
  const loadListings = async (attempt = 1, force = false) => {
    // Skip fetch if cache is fresh (< 5 minutes) and not forced
    if (attempt === 1 && !force) {
      try {
        const c = JSON.parse(localStorage.getItem('praqen_market_all') || 'null');
        if (c && Date.now() - c.ts < 300000 && _hasUsers(c.data)) {
          const gcOffers = (c.data || []).filter(isGcListing);
          if (gcOffers.length > 0) {
            setListings(gcOffers);
            setLoading(false);
            return;
          }
        }
      } catch { }
    }
    setLoadError(false);
    setRetrying(false);
    try {
      const r = await axios.get(`${API_URL}/listings`, { timeout: 20000 });
      const all = (r.data.listings || []).map(l => ({ ...l, users: Array.isArray(l.users) ? l.users[0] : l.users }));
      const data = all.filter(isGcListing);
      // Only update if we got real data — never blank out the list on an empty response
      if (data.length > 0) {
        setListings(data);
        try { localStorage.setItem('praqen_market_all', JSON.stringify({ data: all, ts: Date.now() })); } catch { }
      } else if (!listings.length) {
        setListings(data);
        try { localStorage.setItem('praqen_market_all', JSON.stringify({ data: all, ts: Date.now() })); } catch { }
      }
      const tk = localStorage.getItem('token');
      if (tk) {
        axios.get(`${API_URL}/my-listings`, { headers: { Authorization: `Bearer ${tk}` } })
          .then(myR => {
            const myPaused = (myR.data.listings || []).filter(l =>
              l.status === 'PAUSED' && isGcListing(l)
            );
            setPausedOffer(myPaused.length > 0);
          }).catch(() => { });
      }
    } catch {
      if (attempt < 3) {
        setRetrying(true);
        // Capped exponential backoff instead of a flat 1s retry — attempt 2 waits ~500ms,
        // attempt 3 waits ~1.5s, so a struggling server isn't immediately hammered 3x.
        const backoffMs = attempt === 1 ? 500 : 1500;
        setTimeout(() => loadListings(attempt + 1, force), backoffMs);
      } else {
        setRetrying(false);
        if (!listings.length) setLoadError(true);
      }
    }
    finally { if (attempt === 1 || attempt >= 3) setLoading(false); }
  };

useEffect(() => {
      axios.get(`${API_URL}/referral/leaderboard`).then(r => {
        if (r.data?.leaderboard) setAffLeaderboard(r.data.leaderboard.slice(0, 3));
      }).catch(() => { });
    }, []);

    const getFiltered = () => {
      let list = [...listings];
      // Filter by mode — "All" shows every gift card offer; "Sell" narrows to offers
      // where the viewer sells their own card (BUY_GIFT_CARD listings — people requesting
      // to buy one). This matches ListingDetail.js's role assignment (trade_type:
      // SELL_GIFT_CARD -> viewer BUYs) and the Buy/Sell Bitcoin page convention.
      if (gcMode === 'buy') {
        list = list.filter(l => l.listing_type === 'BUY_GIFT_CARD');
      } else if (gcMode === 'sell') {
        list = list.filter(l => l.listing_type === 'SELL_GIFT_CARD');
      }

      if (cryptoFilter === 'BTC') list = list.filter(l => (l.asset || l.crypto_asset || 'BTC').toUpperCase() === 'BTC');
      if (cryptoFilter === 'USDT') list = list.filter(l => (l.asset || l.crypto_asset || 'BTC').toUpperCase() === 'USDT');
    if (selBrand !== 'All Brands') list = list.filter(l => (getBrand(l) || '').toLowerCase().includes(selBrand.toLowerCase()));
    const amt = parseFloat(amountInput);
    if (!isNaN(amt) && amt > 0) list = list.filter(l => {
      const range = getCardRange(l);
      if (!range) return true;
      if (range[0]?.isRange) return amt >= range[0].min && amt <= range[0].max;
      return range.some(v => Math.abs(v - amt) < 0.01);
    });
    if (selCountry.code !== 'ALL') list = list.filter(l =>
      (l.country_code || '').toUpperCase() === selCountry.code ||
      (l.users?.country_code || '').toUpperCase() === selCountry.code
    );
    if (traderSearch.trim()) list = list.filter(l =>
      (l.users?.username || '').toLowerCase().includes(traderSearch.trim().toLowerCase())
    );
    if (sortBy === 'rate_low') list.sort((a, b) => parseFloat(a.margin || 0) - parseFloat(b.margin || 0));
    if (sortBy === 'rate_high') list.sort((a, b) => parseFloat(b.margin || 0) - parseFloat(a.margin || 0));
    if (sortBy === 'rating') list.sort((a, b) => (b.users?.average_rating || 0) - (a.users?.average_rating || 0));
    if (sortBy === 'trades') list.sort((a, b) => getTrades(b.users) - getTrades(a.users));

    // One offer per seller per payment method
    const seen = new Set();
    list = list.filter(l => {
      const key = `${l.seller_id}:${String(l.payment_method || '').toLowerCase().trim()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return list;
  };

  const handleTradeExpire = (id) => setActiveTrades(prev => prev.filter(t =>
    t.id !== id ||
    ['PAYMENT_SENT', 'DISPUTED'].includes(t.status) ||
    !t.expires_at  // server cleared the deadline (buyer marked paid) — never remove
  ));

  const handleTrade = (id) => {
    if (!user) { navigate('/login?message=Please log in to start trading'); return; }
    navigate(`/listing/${id}`);
  };

  const filtered = getFiltered();
  const cur = selCurrency.code || 'GHS';
  const sym = selCurrency.symbol || '₵';
  const usdRate = USD_RATES[cur] || 1;
  const btcLocal = btcPrice * usdRate;
  const onlineCnt = listings.filter(l => (Date.now() - new Date(l.users?.last_seen_at || l.users?.last_login || 0)) / 1000 < 300).length;
  const sellerCount = new Set(listings.map(l => l.seller_id)).size;

  // Fast Responder of the Week — pinned by username, stable for 1 week
  const ACTIVE_TRADER_USERNAME = 'kingkong79-pro';
  const activeTraderListingId = listings.find(l =>
    (l.users?.username || '').toLowerCase() === ACTIVE_TRADER_USERNAME &&
    getCardRange(l)
  )?.id || null;
  const hasFilters = amountInput.trim() !== '' || selBrand !== 'All Brands' || selCountry.code !== 'ALL' || traderSearch.trim() !== '' || sortBy !== 'rate_low';

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: C.g100, fontFamily: "'DM Sans',sans-serif" }}>
      <SEO title="Gift Card Marketplace | Buy & Sell Gift Cards with Crypto | PRAQEN"
        description="Trade iTunes, Amazon, Steam, Google Play gift cards for BTC and USDT safely with P2P escrow." />
      <style>{`
        @keyframes slideUp { from{transform:translateY(100%);opacity:0} to{transform:translateY(0);opacity:1} }
        @keyframes featuredPulse { 0%,100%{box-shadow:0 0 0 3px rgba(13,148,136,0.25),0 8px 32px rgba(13,148,136,0.15)} 50%{box-shadow:0 0 0 6px rgba(13,148,136,0.45),0 16px 48px rgba(13,148,136,0.28)} }
        @keyframes shimmer { 0%{transform:translateX(-130%)} 100%{transform:translateX(130%)} }
        input[type=number]::-webkit-inner-spin-button,
        input[type=number]::-webkit-outer-spin-button { -webkit-appearance:none; margin:0; }
        * { -webkit-tap-highlight-color: transparent; box-sizing: border-box; }
        html, body { overscroll-behavior: none; }
      `}</style>

      {/* ══════════════════════════════════════════════════
          1. RATE BAR
      ══════════════════════════════════════════════════ */}
      <div style={{ backgroundColor: C.forest }} className="w-full flex-shrink-0">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 py-2 sm:py-2.5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-base sm:text-xl md:text-3xl font-black text-white leading-tight mb-1.5">
                Gift Card <span style={{ color: C.gold }}>Marketplace</span>
              </p>
              <div className="flex items-center gap-2 whitespace-nowrap overflow-hidden">
                <span className="text-xs font-medium" style={{ color: 'rgba(255,255,255,0.45)' }}>
                  1 BTC = <span className="font-semibold" style={{ color: 'rgba(255,255,255,0.8)' }}>${fmt(btcPrice)} USD</span>
                </span>
                <span style={{ color: 'rgba(255,255,255,0.18)', fontSize: 11 }}>|</span>
                <span className="text-xs font-medium" style={{ color: 'rgba(255,255,255,0.45)' }}>
                  1 USD = <span className="font-semibold" style={{ color: 'rgba(255,255,255,0.65)' }}>
                    {cur === 'USD' ? `₵${fmt(USD_RATES['GHS'] || 1, 2)} GHS` : `${sym}${fmt(usdRate, 2)} ${cur}`}
                  </span>
                </span>
              </div>
            </div>
            <button onClick={() => loadListings(1, true)}
              className="w-9 h-9 rounded-xl flex items-center justify-center transition hover:bg-white/20 flex-shrink-0"
              style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}>
              <RefreshCw size={15} className={`text-white ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════
          2. TAB NAVIGATION
      ══════════════════════════════════════════════════ */}
      <div className="bg-white border-b sticky z-30 flex-shrink-0" style={{ top: 'var(--navbar-h)', borderColor: C.g200 }}>
        <div className="flex w-full">
          <div className="flex-1 relative">
            <button onClick={() => setGcMode('buy')}
              className="w-full text-center py-3 text-xs font-black border-b-2 transition-all flex items-center justify-center gap-1"
              style={{
                borderColor: gcMode === 'buy' ? C.forest : 'transparent',
                color: gcMode === 'buy' ? C.forest : C.g400,
                backgroundColor: gcMode === 'buy' ? `${C.forest}18` : 'transparent',
              }}>
              Buy
            </button>
          </div>

          <div className="flex-1 relative">
            <button onClick={() => setGcMode('sell')}
              className="w-full text-center py-3 text-xs font-black border-b-2 transition-all flex items-center justify-center gap-1"
              style={{
                borderColor: gcMode === 'sell' ? C.gold : 'transparent',
                color: gcMode === 'sell' ? C.gold : C.g400,
                backgroundColor: gcMode === 'sell' ? 'rgba(244,164,34,0.08)' : 'transparent',
              }}>
              Sell
            </button>
          </div>

          {/* ── 3rd Dropdown: Crypto Filter (All Crypto / BTC / USDT) ── */}
          <div className="flex-1 relative" ref={cryptoRef}>
            <button onClick={() => setShowCryptoMenu(v => !v)}
              className="w-full text-center py-3 text-xs font-black border-b-2 border-transparent transition-all flex items-center justify-center gap-1.5"
              style={{ color: cryptoFilter === 'ALL' ? '#0D9488' : C.g700 }}>
              {cryptoFilter === 'ALL' && <span className="text-xs">🪙</span>}
              {cryptoFilter === 'BTC' && <span className="w-4 h-4 rounded-full flex items-center justify-center font-black text-[10px] text-white" style={{background:'linear-gradient(135deg,#F7931A,#e8830a)'}}>₿</span>}
              {cryptoFilter === 'USDT' && <span className="w-4 h-4 rounded-full flex items-center justify-center font-black text-[10px] text-white" style={{background:'#26A17B'}}>₮</span>}
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
                    style={{ backgroundColor: cryptoFilter === 'ALL' ? 'rgba(13,148,136,0.06)' : 'transparent' }}>
                    <span className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 font-black text-xs text-white"
                      style={{ background: 'linear-gradient(135deg, #0D9488, #0f766e)' }}>🌐</span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-xs font-black" style={{ color: C.g800 }}>All Crypto</span>
                      <span className="block text-[10px] font-semibold" style={{ color: C.g400 }}>Show both BTC & USDT offers</span>
                    </span>
                    {cryptoFilter === 'ALL' && <CheckCircle size={14} style={{ color: '#0D9488', flexShrink: 0 }} />}
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

      {/* ══ PAUSED OFFER BANNER — shown to seller when their gift card offer is paused ══ */}
      {pausedOffer && (
        <div className="flex-shrink-0 px-3 pt-3">
          <div className="max-w-7xl mx-auto rounded-2xl p-4 flex items-start gap-3"
            style={{ backgroundColor: '#FFFBEB', border: '1.5px solid #FCD34D' }}>
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: '#FEF3C7' }}>
              <Wallet size={16} style={{ color: '#D97706' }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold" style={{ color: '#92400E' }}>Your gift card offer is off the market</p>
              <p className="text-xs mt-0.5 leading-relaxed" style={{ color: '#B45309' }}>
                Your Bitcoin wallet is empty, so your offer has been automatically paused. Top up your wallet to bring it back to the marketplace.
              </p>
            </div>
            <button
              onClick={() => window.location.href = '/wallet'}
              className="flex-shrink-0 px-3 py-2 rounded-xl text-xs font-black text-white"
              style={{ backgroundColor: '#D97706' }}>
              Top Up Wallet
            </button>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════
          4. FILTER BAR
      ══════════════════════════════════════════════════ */}
      <div className="bg-white border-b" style={{ borderColor: C.g200 }}>
        <div className="max-w-7xl mx-auto px-3 py-3">

          {/* 2×2 grid on mobile, 4-col on sm+ */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">

            {/* ── AMOUNT ── */}
            <div style={{ position: 'relative' }}
              onMouseEnter={() => handleGuideEnter('gc_amount')} onMouseLeave={handleGuideLeave}>
              <MarketGuide id="gc_amount" icon={Gift} guideStep={1}
                title="Card Value / Amount"
                body="Enter the card amount in USD or local currency. The list will automatically filter to show vendors who trade cards within this value range."
                example="Type 50 to find vendors accepting $50 gift cards" />
              <p className="text-xs font-bold mb-1 tracking-wide" style={{ color: C.g500 }}>AMOUNT</p>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold pointer-events-none select-none"
                  style={{ color: amountInput ? C.forest : C.g400 }}>$</span>
                <input
                  type="number" min="0" placeholder="e.g. 50"
                  value={amountInput}
                  onChange={e => setAmountInput(e.target.value)}
                  onFocus={() => handleGuideEnter('gc_amount')} onBlur={handleGuideLeave}
                  className="w-full pl-6 pr-7 py-2.5 rounded-xl border-2 font-bold focus:outline-none"
                  style={{
                    borderColor: amountInput ? C.forest : C.g200,
                    color: C.g800,
                    backgroundColor: amountInput ? `${C.forest}08` : 'transparent',
                    fontSize: '16px',
                  }}
                />
                {amountInput && (
                  <button onClick={() => setAmountInput('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center rounded-full"
                    style={{ backgroundColor: C.g200 }}>
                    <X size={9} style={{ color: C.g600 }} />
                  </button>
                )}
              </div>
            </div>

            {/* ── CURRENCY ── */}
            <div style={{ position: 'relative' }}
              onMouseEnter={() => handleGuideEnter('gc_currency')} onMouseLeave={handleGuideLeave}>
              {!showCurrency && (
                <MarketGuide id="gc_currency" icon={CreditCard} guideStep={2} align="right"
                  title="Currency"
                  body="Filter by the currency of the gift card or payment currency. All card values will update to show amounts in your chosen currency."
                  example="USD for US Cards · EUR for European Cards · GHS for Ghana" />
              )}
              <p className="text-xs font-bold mb-1 tracking-wide" style={{ color: C.g500 }}>CURRENCY</p>
              <div className="relative" ref={currencyRef}>
                <button onFocus={() => handleGuideEnter('gc_currency')} onBlur={handleGuideLeave}
                  onClick={() => { setShowCurrency(!showCurrency); setCurrencySearch(''); setShowBrand(false); setShowCountry(false); }}
                  className="w-full flex items-center gap-1.5 px-3 py-2.5 rounded-xl border-2 font-bold transition"
                  style={{
                    borderColor: selCurrency.code !== 'USD' ? C.forest : C.g200,
                    color: selCurrency.code !== 'USD' ? C.forest : C.g600,
                    backgroundColor: selCurrency.code !== 'USD' ? `${C.forest}08` : 'transparent'
                  }}>
                  <span className="text-xs font-bold flex-shrink-0">{selCurrency.symbol}</span>
                  <span className="text-xs font-bold flex-1 text-left">{selCurrency.code}</span>
                  <ChevronDown size={12} className={`transition-transform flex-shrink-0 ${showCurrency ? 'rotate-180' : ''}`}
                    style={{ color: C.g400 }} />
                </button>
                {showCurrency && (
                  <div className="dropdown-panel absolute top-full right-0 mt-1.5 bg-white rounded-2xl shadow-2xl z-50 border overflow-hidden"
                    style={{ borderColor: C.g100, minWidth: '200px', maxWidth: 'calc(100vw - 24px)' }}>
                    <div className="px-2 py-2 border-b sticky top-0 bg-white" style={{ borderColor: C.g100 }}>
                      <input type="text" placeholder="Search currency..." value={currencySearch}
                        onChange={e => setCurrencySearch(e.target.value)} onClick={e => e.stopPropagation()}
                        className="w-full px-2.5 py-1.5 rounded-lg focus:outline-none"
                        style={{ border: `1.5px solid ${C.g200}`, color: C.g800, backgroundColor: C.g50, fontSize: '16px' }} />
                    </div>
                    <div style={{ maxHeight: 260, overflowY: 'auto' }}>
                      {(() => {
                        const q = currencySearch.toLowerCase();
                        const filtered = GC_FILTER_CURRENCIES.filter(c => !q || c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q));
                        let lastRegion = null;
                        return filtered.map(c => {
                          const regionHdr = !q && c.region !== lastRegion
                            ? (lastRegion = c.region, (
                              <div key={`r-${c.region}`} className="px-3 py-1.5" style={{ backgroundColor: '#F8FAFC', borderBottom: `1px solid ${C.g100}` }}>
                                <span className="text-xs font-bold uppercase tracking-wider" style={{ color: COUNTRY_REGIONS[c.region] || C.g500 }}>{c.region}</span>
                              </div>
                            ))
                            : (lastRegion = c.region, null);
                          return [regionHdr,
                            <button key={c.code} onClick={() => { setSelCurrency(c); setShowCurrency(false); setCurrencySearch(''); }}
                              className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-gray-50 border-b last:border-0 transition"
                              style={{ borderColor: C.g50, backgroundColor: selCurrency.code === c.code ? `${C.forest}08` : 'transparent' }}>
                              <span className="text-sm font-bold w-6 text-center flex-shrink-0" style={{ color: C.forest }}>{c.symbol}</span>
                              <div className="flex-1 text-left">
                                <p className="font-bold text-xs" style={{ color: C.g800 }}>{c.code}</p>
                                <p className="text-xs" style={{ color: C.g400 }}>{c.name}</p>
                              </div>
                              {selCurrency.code === c.code && <CheckCircle size={13} style={{ color: C.green }} />}
                            </button>
                          ];
                        });
                      })()}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ── PAYMENT (Gift Card Brand) ── */}
            <div style={{ position: 'relative' }}
              onMouseEnter={() => handleGuideEnter('gc_brand')} onMouseLeave={handleGuideLeave}>
              {!showBrand && (
                <MarketGuide id="gc_brand" icon={Gift} guideStep={3}
                  title="Gift Card Brand"
                  body="Filter by the specific gift card brand you want to buy or sell. Pick Amazon, iTunes, Google Play, Steam, Razer Gold and more."
                  example="Amazon · Apple iTunes · Google Play · Steam · Razer Gold" />
              )}
              <p className="text-xs font-bold mb-1 tracking-wide" style={{ color: C.g500 }}>PAYMENT</p>
              <div className="relative" ref={brandRef}>
                <button onFocus={() => handleGuideEnter('gc_brand')} onBlur={handleGuideLeave}
                  onClick={() => { setShowBrand(!showBrand); setBrandSearch(''); setShowCurrency(false); setShowCountry(false); }}
                  className="w-full flex items-center gap-1.5 px-3 py-2.5 rounded-xl border-2 font-bold transition"
                  style={{
                    borderColor: selBrand !== 'All Brands' ? C.forest : C.g200,
                    color: selBrand !== 'All Brands' ? C.forest : C.g600,
                    backgroundColor: selBrand !== 'All Brands' ? `${C.forest}08` : 'transparent'
                  }}>
                  <span className="text-xs font-bold flex-1 text-left truncate">
                    {selBrand === 'All Brands' ? 'All Cards' : selBrand}
                  </span>
                  <ChevronDown size={12} className={`transition-transform flex-shrink-0 ${showBrand ? 'rotate-180' : ''}`}
                    style={{ color: selBrand !== 'All Brands' ? C.forest : C.g400 }} />
                </button>
                {showBrand && (
                  <div className="absolute top-full left-0 right-0 mt-1.5 bg-white rounded-2xl shadow-2xl z-50 border overflow-hidden"
                    style={{ borderColor: C.g100 }}>
                    <div className="px-2 py-2 border-b sticky top-0 bg-white" style={{ borderColor: C.g100 }}>
                      <input type="text" placeholder="Search card brand..." value={brandSearch}
                        onChange={e => setBrandSearch(e.target.value)} onClick={e => e.stopPropagation()}
                        className="w-full px-2.5 py-1.5 rounded-lg focus:outline-none"
                        style={{ border: `1.5px solid ${C.g200}`, color: C.g800, backgroundColor: C.g50, fontSize: '16px' }} />
                    </div>
                    <div style={{ maxHeight: 260, overflowY: 'auto' }}>
                      {brandSearch.trim() ? (
                        GC_BRANDS.filter(b => b.toLowerCase().includes(brandSearch.toLowerCase())).map(b => (
                          <button key={b} onClick={() => { setSelBrand(b); setShowBrand(false); setBrandSearch(''); }}
                            className="w-full flex items-center justify-between px-3 py-2.5 text-xs hover:bg-gray-50 border-b last:border-0 transition"
                            style={{ borderColor: C.g50, backgroundColor: selBrand === b ? `${C.forest}08` : 'transparent' }}>
                            <span className="font-semibold" style={{ color: C.g800 }}>{b === 'All Brands' ? 'All Cards' : b}</span>
                            {selBrand === b && <CheckCircle size={11} style={{ color: C.green }} />}
                          </button>
                        ))
                      ) : (
                        GC_BRAND_GROUPS.map(group => (
                          <div key={group.cat || 'all'}>
                            {group.cat && (
                              <div className="px-3 py-1.5 sticky top-0" style={{ backgroundColor: '#F8FAFC', borderBottom: `1px solid ${C.g100}` }}>
                                <span className="text-xs font-bold uppercase tracking-wider" style={{ color: group.color || C.g500 }}>{group.cat}</span>
                              </div>
                            )}
                            {group.items.map(b => (
                              <button key={b} onClick={() => { setSelBrand(b); setShowBrand(false); setBrandSearch(''); }}
                                className="w-full flex items-center justify-between px-3 py-2.5 text-xs hover:bg-gray-50 border-b last:border-0 transition"
                                style={{ borderColor: C.g50, backgroundColor: selBrand === b ? `${C.forest}08` : 'transparent' }}>
                                <span className="font-semibold" style={{ color: C.g800 }}>{b === 'All Brands' ? 'All Cards' : b}</span>
                                {selBrand === b && <CheckCircle size={11} style={{ color: C.green }} />}
                              </button>
                            ))}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ── COUNTRY ── */}
            <div style={{ position: 'relative' }}
              onMouseEnter={() => handleGuideEnter('gc_country')} onMouseLeave={handleGuideLeave}>
              {!showCountry && (
                <MarketGuide id="gc_country" icon={Globe} guideStep={4} align="right"
                  title="Country / Region"
                  body="Filter vendors by country. Local vendors can complete trade verification and payouts faster in your country."
                  example="Ghana · Nigeria · Kenya · USA · All Countries" />
              )}
              <p className="text-xs font-bold mb-1 tracking-wide" style={{ color: C.g500 }}>COUNTRY</p>
              <div className="relative" ref={countryRef}>
                <button onFocus={() => handleGuideEnter('gc_country')} onBlur={handleGuideLeave}
                  onClick={() => { setShowCountry(!showCountry); setShowCurrency(false); setShowBrand(false); }}
                  className="w-full flex items-center gap-1.5 px-3 py-2.5 rounded-xl border-2 font-bold transition"
                  style={{
                    borderColor: selCountry.code !== 'ALL' ? C.forest : C.g200,
                    color: selCountry.code !== 'ALL' ? C.forest : C.g600,
                    backgroundColor: selCountry.code !== 'ALL' ? `${C.forest}08` : 'transparent'
                  }}>
                  <span className="text-xs">{selCountry.flag}</span>
                  <span className="text-xs font-bold flex-1 text-left">{selCountry.name}</span>
                  <ChevronDown size={12} className={`transition-transform flex-shrink-0 ${showCountry ? 'rotate-180' : ''}`}
                    style={{ color: selCountry.code !== 'ALL' ? C.forest : C.g400 }} />
                </button>
                {showCountry && (
                  <div className="absolute top-full right-0 mt-1.5 bg-white rounded-2xl shadow-2xl z-50 border overflow-hidden"
                    style={{ borderColor: C.g100, minWidth: '220px', maxWidth: 'calc(100vw - 24px)' }}>
                    <div className="p-2 border-b sticky top-0 bg-white" style={{ borderColor: C.g100 }}>
                      <input type="text" placeholder="Search country…"
                        value={countrySearch} onChange={e => setCountrySearch(e.target.value)}
                        className="w-full px-3 py-1.5 font-semibold rounded-xl border focus:outline-none"
                        style={{ borderColor: C.g200, color: C.g800, fontSize: '16px' }} />
                    </div>
                    <div className="overflow-y-auto max-h-56">
                      {(() => {
                        const q = countrySearch.toLowerCase();
                        const filtered = COUNTRIES.filter(c => !q || c.name.toLowerCase().includes(q));
                        let lastReg = null;
                        return filtered.map(c => {
                          const regHdr = !q && c.region && c.region !== lastReg
                            ? (lastReg = c.region, <div key={`r-${c.region}`} className="px-3 py-1" style={{ backgroundColor: '#F8FAFC' }}>
                              <span className="text-xs font-bold uppercase tracking-wider" style={{ color: COUNTRY_REGIONS[c.region] || C.g500 }}>{c.region}</span>
                            </div>)
                            : (c.region && (lastReg = c.region), null);
                          return [regHdr,
                            <button key={c.code} onClick={() => { setSelCountry(c); setShowCountry(false); setCountrySearch(''); }}
                              className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-gray-50 border-b last:border-0 transition"
                              style={{ borderColor: C.g50, backgroundColor: selCountry.code === c.code ? `${C.forest}08` : 'transparent' }}>
                              <span className="text-sm">{c.flag}</span>
                              <span className="text-xs font-bold flex-1 text-left" style={{ color: C.g800 }}>{c.name}</span>
                              {selCountry.code === c.code && <CheckCircle size={13} style={{ color: C.green }} />}
                            </button>
                          ];
                        });
                      })()}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Sort + Search + Create + Clear — all on one line */}
          <div className="mt-2 flex items-center gap-2">
            <span className="text-xs font-bold flex-shrink-0" style={{ color: C.g500 }}>Sort:</span>
            <select value={sortBy} onChange={e => setSortBy(e.target.value)}
              className="flex-shrink-0 px-2 py-2 font-bold border-2 rounded-xl focus:outline-none"
              style={{ borderColor: sortBy !== 'rate_low' ? C.forest : C.g200, color: C.g800, fontSize: '13px', width: '105px' }}>
              <option value="rate_low">Best Rate</option>
              <option value="rate_high">Highest Rate</option>
              <option value="rating">Top Rated</option>
              <option value="trades">Most Trades</option>
            </select>
            <div className="flex-1 min-w-0 flex items-center border-2 rounded-xl overflow-hidden"
              style={{ borderColor: traderSearch.trim() ? C.forest : C.g200 }}>
              <input
                type="text"
                placeholder="Search trader…"
                value={traderSearch}
                onChange={e => setTraderSearch(e.target.value)}
                className="flex-1 min-w-0 px-2.5 py-2 font-bold focus:outline-none bg-transparent"
                style={{ color: C.g800, fontSize: '16px' }} />
              {traderSearch.trim() && (
                <button onClick={() => setTraderSearch('')} className="px-2 flex-shrink-0" style={{ color: C.g400 }}>
                  <X size={12} />
                </button>
              )}
            </div>
            <button onClick={() => navigate('/create-offer')}
              className="flex-shrink-0 flex items-center gap-1 px-2.5 py-2 rounded-xl text-white font-black text-xs transition hover:opacity-90 active:scale-[0.97]"
              style={{ backgroundColor: C.accent, whiteSpace: 'nowrap' }}>
              <PlusCircle size={12} /> Create
            </button>
            {hasFilters && (
              <button onClick={() => { setAmountInput(''); setSelBrand('All Brands'); setSelCountry(COUNTRIES[0]); setTraderSearch(''); setSortBy('rate_low'); setCountrySearch(''); }}
                className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-xl text-xs font-bold border-2 transition"
                style={{ borderColor: C.danger, color: C.danger, backgroundColor: '#FEF2F2' }}>
                ✕
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════
          5. OFFER GRID
      ══════════════════════════════════════════════════ */}
      <div className="max-w-7xl mx-auto w-full px-2 sm:px-3 pt-2 pb-3 space-y-3">

        {/* ── Inline active trade cards ── */}
        {activeTrades.length > 0 && (
          <div className="mb-2 overflow-hidden">
            {activeTrades.slice(0, showAllTrades ? activeTrades.length : 3).map(trade => (
              <ActiveTradeCard key={trade.id} trade={trade} pageColor="#0D9488" onExpire={handleTradeExpire} />
            ))}
            {activeTrades.length > 3 && (
              <button onClick={() => setShowAllTrades(p => !p)}
                className="w-full text-xs font-semibold py-1.5 rounded-xl border mb-1"
                style={{ color: '#92400E', borderColor: '#F59E0B', backgroundColor: '#FFFBEB' }}>
                {showAllTrades ? 'Show less ▲' : `Show all (${activeTrades.length}) ▼`}
              </button>
            )}
          </div>
        )}

        {/* Count row */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full animate-pulse flex-shrink-0"
              style={{ backgroundColor: C.online, boxShadow: `0 0 0 3px ${C.online}30` }} />
            <span className="text-xs font-bold" style={{ color: C.online }}>{onlineCnt} online</span>
          </div>
          <span style={{ color: C.g300, fontSize: 11 }}>·</span>
          <span className="text-xs font-semibold" style={{ color: C.g500 }}>
            <span className="font-bold" style={{ color: C.g800 }}>{filtered.length}</span> active offer{filtered.length !== 1 ? 's' : ''}
            {selCountry.code !== 'ALL' ? ` in ${selCountry.flag} ${selCountry.name}` : ''}
          </span>
        </div>

        {(loading && !listings.length) || retrying ? (
          <>
            {retrying && (
              <p className="text-xs font-semibold text-center" style={{ color: C.g500 }}>
                Our server is starting up, this takes a few seconds…
              </p>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 w-full">
              {Array.from({ length: 8 }).map((_, i) => <GCCardSkeleton key={i} />)}
            </div>
          </>
        ) : loadError && !listings.length ? (
          <div className="bg-white rounded-2xl border p-8 text-center" style={{ borderColor: C.g200 }}>
            <div className="flex justify-center mb-3">
              <Wifi size={44} style={{ color: C.g400 }} />
            </div>
            <p className="font-bold text-base mb-1" style={{ color: C.g800 }}>Couldn't load offers</p>
            <p className="text-sm mb-4" style={{ color: C.g400 }}>Server may be busy. Please try again.</p>
            <button onClick={() => { setLoading(true); loadListings(1, true); }}
              className="px-6 py-2.5 rounded-xl text-white text-sm font-black hover:opacity-90 transition flex items-center gap-2 mx-auto"
              style={{ backgroundColor: C.forest }}>
              <RefreshCw size={14} /> Try Again
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-2xl border p-10 text-center" style={{ borderColor: C.g200 }}>
            <div className="flex justify-center mb-4">
              <Gift size={44} style={{ color: C.g400 }} />
            </div>
            <p className="font-bold text-base mb-1" style={{ color: C.g800 }}>No gift card offers found</p>
            {/* If this side (Buy/Sell) is empty only because of the current gcMode filter — not
                because the whole market is quiet — point at the side that actually has offers
                instead of leaving the page looking dead. */}
            {(() => {
              const otherType = gcMode === 'sell' ? 'BUY_GIFT_CARD' : gcMode === 'buy' ? 'SELL_GIFT_CARD' : null;
              const otherCount = otherType ? listings.filter(l => l.listing_type === otherType).length : 0;
              if (otherType && otherCount > 0) {
                return (
                  <>
                    <p className="text-sm" style={{ color: C.g400 }}>
                      No one's posted a {gcMode === 'sell' ? 'Sell' : 'Buy'} offer yet — but the {gcMode === 'sell' ? 'Buy' : 'Sell'} side has {otherCount} active offer{otherCount !== 1 ? 's' : ''} right now.
                    </p>
                    <button onClick={() => setGcMode(gcMode === 'sell' ? 'buy' : 'sell')}
                      className="mt-4 px-6 py-2.5 rounded-xl text-sm font-black hover:opacity-90 transition mr-2"
                      style={{ backgroundColor: C.g100, color: C.g700 }}>
                      View {gcMode === 'sell' ? 'Buy' : 'Sell'} Offers
                    </button>
                  </>
                );
              }
              return <p className="text-sm" style={{ color: C.g400 }}>Try a different brand or be the first to post</p>;
            })()}
            <button onClick={() => navigate('/create-offer')}
              className="mt-4 px-6 py-2.5 rounded-xl text-white text-sm font-black hover:opacity-90 transition"
              style={{ backgroundColor: C.forest }}>
              Post Offer
            </button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 w-full">
              {filtered.slice(0, visibleCount).map(l => (
                <GCCard
                  key={l.id}
                  listing={l}
                  btcPriceUSD={btcPrice}
                  featuredType={l.id === activeTraderListingId ? 'fast_responder' : undefined}
                  onViewSeller={() => setModal({ seller: l.users || {}, listing: l })}
                  onTrade={() => handleTrade(l.id)}
                />
              ))}
            </div>
            {filtered.length > visibleCount && (
              <button onClick={() => setVisibleCount(v => v + 24)}
                className="mx-auto px-6 py-2.5 rounded-xl text-sm font-black hover:opacity-90 transition"
                style={{ backgroundColor: C.g100, color: C.g700 }}>
                Load more ({filtered.length - visibleCount} more offer{filtered.length - visibleCount !== 1 ? 's' : ''})
              </button>
            )}
          </>
        )}

        {/* ── Trade Safety Banner ── */}
        <div style={{display:'flex',alignItems:'center',gap:11,padding:'13px 15px',borderRadius:12,background:'linear-gradient(135deg,#FFFBEB,#FEF3C7)',border:'1.5px solid #FCD34D',boxShadow:'0 2px 8px rgba(217,119,6,0.12)'}}>
          <div style={{width:34,height:34,borderRadius:9,background:'#FDE68A',border:'1px solid #FCD34D',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
            <AlertTriangle size={17} style={{color:'#B45309'}}/>
          </div>
          <div>
            <p style={{margin:0,fontSize:13,fontWeight:900,color:'#92400E',lineHeight:1.3}}>Trade Safely</p>
            <p style={{margin:0,fontSize:11,color:'#92400E',fontWeight:600,lineHeight:1.4,marginTop:1}}>Only share gift card codes inside the active escrow trade. Every trade is platform-protected.</p>
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
                <div style={{width:32,height:32,borderRadius:10,background:'#F4A422',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,fontSize:16,boxShadow:'0 2px 8px rgba(244,164,34,0.45)'}}>🎁</div>
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
                {icon:'✅',label:'Register',sub:'$1 locked'},
                {icon:'⚡',label:'Verify',  sub:'stays safe'},
                {icon:'₿', label:'1 Trade', sub:'$2 unlocks'},
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

      {/* ══════════════════════════════════════════════════
          6. FOOTER
      ══════════════════════════════════════════════════ */}
      <PRQFooter />

      {modal && (
        <SellerModal
          seller={modal.seller}
          listing={modal.listing}
          btcPriceUSD={btcPrice}
          onClose={() => setModal(null)}
          onTrade={() => handleTrade(modal.listing?.id)}
        />
      )}
    </div>
  );
}
