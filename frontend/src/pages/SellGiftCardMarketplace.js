import { useState, useEffect, useRef, Fragment } from 'react';
import { useRates } from '../contexts/RatesContext';
import { useNavigate, Link } from 'react-router-dom';
import SEO from '../components/SEO';
import WeeklyStarsSection from '../components/WeeklyStarsSection';
import axios from 'axios';
import {
  CheckCircle, RefreshCw, AlertTriangle,
  BadgeCheck, Timer, X, Info, Shield,
  ArrowRight, PlusCircle, Filter, MapPin, Heart,
  Home, Wallet, User, Gift, Bitcoin,
  ChevronDown, CreditCard, ThumbsUp, ThumbsDown, Repeat2,
  Phone, Mail, Ban, ArrowUp, ArrowDown,
  Zap, Users, TrendingUp, Award, Sparkles, ShieldCheck,
  Crown, Star, MessageSquare, Wifi, Coins, Trophy, Globe, Plus, SlidersHorizontal
} from 'lucide-react';
import { toast } from 'react-toastify';
import CountryFlag, { resolveCode } from '../components/CountryFlag';
import { TRUST_MAP, deriveBadge, BadgeChip, BADGE_COLORS, SafetyBadge } from '../lib/badge';
import ActiveTradeCard from '../components/ActiveTradeCard';
import { getCachedActiveTrades, setCachedActiveTrades, isGiftCardTrade } from '../utils/activeTradesCache';
import PRQFooter from '../components/PRQFooter';
import CoinIcon from '../components/CoinIcon';

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
      'Amazon', 'eBay', 'Walmart', 'Target', 'Best Buy', 'GameStop',
      'IKEA', 'H&M', 'Zara', 'ASOS', 'Shein', 'Temu',
      'Foot Locker', 'Nike Gift Card', 'Adidas', 'Old Navy',
      'Home Depot', "Macy's", 'Nordstrom', 'Sephora', 'Bath & Body Works',
      'Jumia Voucher',
    ]
  },
  {
    cat: '📱 Tech', color: '#3B82F6', items: [
      'Apple / iTunes', 'Google Play', 'Microsoft / Xbox Store',
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

const matchesBrand = (l, targetBrand) => {
  if (!targetBrand || targetBrand === 'All Brands' || targetBrand === 'All Cards') return true;

  const b1 = String(l.gift_card_brand || l.giftCardBrand || l.card_brand || '').toLowerCase();
  const b2 = String(l.payment_method || '').toLowerCase();
  const b3 = String(l.description || l.title || l.listing_terms || l.trade_instructions || '').toLowerCase();
  const combined = `${b1} ${b2} ${b3}`.trim();

  const target = targetBrand.toLowerCase().trim();

  if (target.includes('/')) {
    const parts = target.split('/').map(p => p.trim()).filter(Boolean);
    return parts.some(p => combined.includes(p));
  }

  const cleanTarget = target.replace(/\b(gift card|gc|voucher|store|card)\b/gi, '').trim();

  if (cleanTarget.length >= 2) {
    if (combined.includes(cleanTarget)) return true;
  }

  return combined.includes(target);
};

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
// Fixed-price listings store bitcoin_price already in the listing's LOCAL currency
// (CreateOffer.js labels the field "Fixed Price ({currency} per {asset})") — this
// now always returns a local-currency rate directly, so callers must NOT multiply
// by usdRate again (that used to double-convert fixed prices — a listing fixed at
// 555 XOF/USDT displayed as ~333,000). See quoteService.js for the matching backend
// fix. Gift cards trade against both BTC and USDT (see the crypto filter below) — a
// USDT-asset listing priced at 'market' must use the ~$1 USDT peg, not the BTC
// rate, or its amounts come out ~88,000x too high.
const isUsdtAsset = (l) => {
  if (!l) return false;
  const a = String(l.asset || l.crypto_asset || l.currency_crypto || '').toUpperCase();
  return a === 'USDT' || a === 'TETHER' || a.includes('USDT') || a.includes('TETHER');
};
const getRateLocal = (l, btcPrice, usdRate) => {
  const isUsdt = isUsdtAsset(l);
  if (l.pricing_type === 'fixed') {
    const s = parseFloat(l.bitcoin_price || 0);
    if (s > (isUsdt ? 0.01 : 100)) return s;
  }
  return (isUsdt ? 1 : btcPrice) * (1 + parseFloat(l.margin || 0) / 100) * usdRate;
};
const getBrand = (l) => l.gift_card_brand || l.giftCardBrand || l.card_brand || l.payment_method || 'Gift Card';
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
    <img src={url} alt={u.username || 'user'} loading="lazy" onError={() => setErr(true)}
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

function GCCard({ listing, btcPriceUSD, onViewSeller, onTrade, featuredType, liveSeenAt, userBuyAmt }) {
  const { rates: USD_RATES } = useRates();
  const u = getUser(listing.users);
  const [seen, setSeen] = useState(() => getLastSeen({ ...u, last_seen_at: liveSeenAt || u.last_seen_at }));
  useEffect(() => {
    setSeen(getLastSeen({ ...u, last_seen_at: liveSeenAt || u.last_seen_at }));
  }, [liveSeenAt]);
  useEffect(() => {
    const id = setInterval(() => setSeen(getLastSeen({ ...u, last_seen_at: liveSeenAt || u.last_seen_at })), 30000);
    return () => clearInterval(id);
  }, [liveSeenAt]);
  const trades = getTrades(u);
  const brand = getBrand(listing);
  const fv = getFaceVal(listing);
  const margin = parseFloat(listing.margin || 0);
  const cur = listing.currency || 'USD';
  const sym = listing.currency_symbol || CUR_SYM[cur] || '$';
  const usdRate = USD_RATES[cur] || 1;
  const isUsdtCard = isUsdtAsset(listing);
  const spotPriceUSD = isUsdtCard ? 1 : btcPriceUSD;
  const rateLocal = getRateLocal(listing, btcPriceUSD, usdRate);
  const rateUSD = usdRate > 0 ? rateLocal / usdRate : rateLocal;

  const cardType = listing.card_type || 'both';
  const cardRange = getCardRange(listing);

  // Fallback local starting value if range not found
  const localVal = (userBuyAmt && parseFloat(userBuyAmt) > 0) ? parseFloat(userBuyAmt) : (cardRange
    ? (cardRange[0]?.isRange ? cardRange[0].min : cardRange[0])
    : (listing.min_limit_local || listing.min_amount || fv || 0));

  // Card-value side of the trade — formatted as amount + currency code (e.g. 100 USD, 100 EUR, 100 GBP)
  const cardSide = (() => {
    if (userBuyAmt && parseFloat(userBuyAmt) > 0) return { val: `${fmt(localVal)} ${cur}`, sub: '' };
    if (!cardRange) {
      return { val: localVal > 0 ? `${fmt(localVal)} ${cur}` : 'Flexible', sub: '' };
    }
    if (cardRange[0]?.isRange) return { val: `${fmt(cardRange[0].min)} ${cur}`, sub: '' };
    if (cardRange.length === 1) return { val: `${fmt(cardRange[0])} ${cur}`, sub: '' };
    return { val: `${fmt(cardRange[0])} ${cur}`, sub: '' };
  })();

  // Convert local currency value into USD equivalent for crypto calculation
  const refUSD = localVal > 0 ? (usdRate > 0 ? localVal / usdRate : localVal) : 1;
  const btcOut = refUSD / (rateUSD || 1);
  const viewerIsBuyingCard = listing.listing_type === 'BUY_GIFT_CARD';
  const assetLabel = isUsdtCard ? 'USDT' : 'BTC';
  const receiveValLocal = (btcOut * spotPriceUSD) * usdRate;
  const cryptoSide = { val: `${fmt(receiveValLocal, 2)} ${cur}`, sub: `(${isUsdtCard ? fmt(btcOut, 2) : fBtc(btcOut)} ${assetLabel})` };
  const youGive = viewerIsBuyingCard ? cardSide : cryptoSide;
  const youReceive = viewerIsBuyingCard ? cryptoSide : cardSide;
  const giveLabel = viewerIsBuyingCard ? `Pay ${brand}` : `Pay ${assetLabel}`;
  const receiveLabel = viewerIsBuyingCard ? `Receive ${assetLabel}` : `Receive ${brand}`;

  const minLocal = listing.min_limit_local || (listing.min_limit_usd ? listing.min_limit_usd * usdRate : 100 * usdRate);
  const maxLocal = listing.max_limit_local || (listing.max_limit_usd ? listing.max_limit_usd * usdRate : 1000 * usdRate);

  const pos = parseInt(u.positive_feedback || 0);
  const neg = parseInt(u.negative_feedback || 0);
  const total = pos + neg;
  const trust = total > 0 ? Math.round(pos / total * 100) : trades > 0 ? 100 : 0;

  const brandLabel = /card/i.test(brand) ? brand.toUpperCase() : `${brand.toUpperCase()} CARD`;
  const ft = featuredType ? FEATURED[featuredType] : null;

  return (
    <div className={`w-full bg-white border transition-all ${ft ? '' : 'border-gray-200 shadow-sm hover:shadow-md'} rounded-xl overflow-hidden`}
      style={{
        borderColor: ft ? ft.border : undefined,
        boxShadow: ft ? `0 0 0 1px ${ft.border}, 0 4px 20px ${ft.glow}` : undefined,
      }}>
      {ft && (
        <div className="flex items-center justify-center gap-1.5 py-1.5 px-3" style={{ background: ft.ribbon }}>
          <span className="text-[10px] font-black text-white tracking-widest">{ft.tag}</span>
        </div>
      )}

      {/* ═══ DESKTOP ROW (lg+) ═══ */}
      <div className="hidden lg:flex items-center px-4 py-4 gap-6">
        {/* Col 1: User Info */}
        <div className="flex items-center gap-3 w-[280px] flex-shrink-0">
          <button onClick={onViewSeller} className="flex-shrink-0 relative">
            <Avatar user={u} size={48} radius="rounded-lg" />
            <div className="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full border-2 border-white"
              style={{ backgroundColor: seen.online ? C.online : C.g400 }} />
          </button>
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <CountryFlag countryCode={u?.country_code || u?.country || u?.location} className="w-4 h-3 rounded-sm shadow-sm" />
              <button onClick={onViewSeller} className="font-black text-[15px] hover:underline truncate" style={{ color: '#111827', textUnderlineOffset: '2px' }}>
                {getDisplayName(u) || 'Seller'}
              </button>
              <BadgeChip user={u} size="xs" />
            </div>
            <div className="flex items-center gap-2 mt-1 text-xs text-gray-500 font-semibold">
              <div className="flex items-center gap-1"><ThumbsUp size={13} className="text-gray-400" strokeWidth={2.5} /><span className="text-gray-700">{trust}%</span></div>
              <span className="text-gray-700">{fmt(trades)} Trades</span>
              <div className="flex items-center gap-1">
                <span className={`w-1.5 h-1.5 rounded-full ${seen.online ? 'bg-emerald-500' : 'bg-gray-400'}`} />
                <span className={seen.online ? "text-emerald-600 font-bold" : ""}>{seen.online ? 'Active' : seen.label}</span>
              </div>
            </div>
          </div>
        </div>
        {/* Col 2: Price + Range */}
        <div className="flex flex-col flex-1 min-w-[200px]">
          <div className="flex items-center gap-1.5">
            <CoinIcon coin="BTC" size={18} />
            <span className="font-black text-[16px] text-gray-900">{fmt(rateLocal, 2)} {cur}</span>
            <span className="px-1.5 py-0.5 rounded text-[11px] font-black tracking-wide" style={{ backgroundColor: margin < 0 ? '#10B981' : margin > 0 ? '#EF4444' : '#64748B', color: '#fff' }}>
              {margin === 0 ? 'MARKET' : `${margin > 0 ? '+' : ''}${margin}%`}
            </span>
          </div>
          <span className="text-[13px] font-semibold text-gray-500 mt-1">{fmt(minLocal)} - {fmt(maxLocal)} {cur}</span>
        </div>
        {/* Col 3: You Give */}
        <div className="flex flex-col w-[180px] flex-shrink-0">
          <span className="text-[12px] font-bold text-gray-500 mb-0.5 truncate pr-2">{giveLabel}</span>
          <span className="text-[15px] font-black text-gray-900">{youGive.val}</span>
          <span className="text-[11px] font-semibold text-gray-500 mt-0.5">{youGive.sub}</span>
        </div>
        {/* Col 4: You Receive */}
        <div className="flex flex-col w-[160px] flex-shrink-0">
          <span className="text-[12px] font-bold text-gray-500 mb-0.5 truncate pr-2">{receiveLabel}</span>
          <span className="text-[15px] font-black text-gray-900">{youReceive.val}</span>
          <span className="text-[11px] font-semibold text-gray-500 mt-0.5">{youReceive.sub}</span>
        </div>
        {/* Col 5: Actions */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <button onClick={onViewSeller} className="w-10 h-10 rounded-full border border-gray-200 flex items-center justify-center bg-gray-50 text-gray-600 hover:bg-gray-100 transition shadow-sm"><Info size={18} /></button>
          <button onClick={onTrade} className={`h-10 px-6 rounded-full text-white font-black text-[15px] flex items-center gap-1.5 shadow-md active:scale-95 transition ${viewerIsBuyingCard ? "bg-[#10B981] hover:bg-emerald-600" : "bg-[#F4A422] hover:bg-[#D4891A]"}`}>
            {viewerIsBuyingCard ? "Buy" : "Sell"} <CoinIcon coin="BTC" size={22} ring />
          </button>
        </div>
      </div>

      {/* ═══ MOBILE CARD (< lg) ═══ */}
      <div className="lg:hidden">
        <div className="p-4 pb-3 flex items-start gap-3">
          <button onClick={onViewSeller} className="flex-shrink-0"><Avatar user={u} size={48} radius="rounded-lg" /></button>
          <div className="flex flex-col flex-1 min-w-0 pt-0.5">
            <div className="flex items-center gap-1.5 flex-wrap">
              <CountryFlag countryCode={u?.country_code || u?.country || u?.location} className="w-4 h-3 rounded-sm shadow-sm" />
              <button onClick={onViewSeller} className="font-black text-[15px] hover:underline" style={{ color: '#111827', textUnderlineOffset: '2px' }}>{getDisplayName(u) || 'Seller'}</button>
              <BadgeChip user={u} size="xs" />
            </div>
            <div className="flex items-center gap-2.5 mt-1 text-xs text-gray-600 font-semibold">
              <div className="flex items-center gap-1"><ThumbsUp size={13} className="text-gray-400" strokeWidth={2.5} /><span className="text-gray-700">{trust}%</span></div>
              <span>{fmt(trades)} Trades</span>
              <div className="flex items-center gap-1.5">
                {seen.online ? <span className="w-2 h-2 rounded-full bg-emerald-500" /> : <span className="w-2 h-2 rounded-full bg-gray-400" />}
                <span className={seen.online ? "text-emerald-600 font-bold" : "text-gray-500"}>{seen.online ? 'Active' : seen.label}</span>
              </div>
            </div>
          </div>
        </div>
        <div className="px-4 py-2 flex items-center justify-between">
          <div className="flex flex-col"><span className="text-xs font-bold text-gray-600 mb-0.5 truncate pr-2 max-w-[140px]">{giveLabel}</span><span className="text-lg font-black text-gray-900">{youGive.val}</span></div>
          <div className="flex flex-col text-right"><span className="text-xs font-bold text-gray-600 mb-0.5 truncate pl-2 max-w-[140px]">{receiveLabel}</span><span className="text-lg font-black text-gray-900">{youReceive.val}</span></div>
        </div>
        <div className="bg-gray-50 mt-1 px-4 py-3 flex items-center justify-between gap-2 border-t border-gray-100">
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <CoinIcon coin="BTC" size={16} />
              <span className="font-black text-[15px] text-gray-900 truncate">{fmt(rateLocal, 2)} {cur}</span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-black tracking-wide" style={{ backgroundColor: margin < 0 ? '#10B981' : margin > 0 ? '#EF4444' : '#64748B', color: '#fff' }}>{margin === 0 ? 'MARKET' : `${margin > 0 ? '+' : ''}${margin}%`}</span>
            </div>
            <div className="text-xs font-semibold text-gray-600 mt-1">{fmt(minLocal)} - {fmt(maxLocal)} {cur}</div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button onClick={onViewSeller} className="w-9 h-9 rounded-full border border-gray-300 flex items-center justify-center bg-white text-gray-700 hover:bg-gray-100 transition shadow-sm"><Info size={16} /></button>
            <button onClick={onTrade} className={`h-9 px-4 rounded-full text-white font-black text-[15px] flex items-center gap-1.5 shadow-md active:scale-95 transition ${viewerIsBuyingCard ? "bg-[#10B981] hover:bg-emerald-600" : "bg-[#F4A422] hover:bg-[#D4891A]"}`}>
              {viewerIsBuyingCard ? "Buy" : "Sell"} <CoinIcon coin="BTC" size={20} ring />
            </button>
          </div>
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
  const rate = getRateLocal(listing || {}, btcPriceUSD || 68000, usdRate);
  const margin = parseFloat(listing?.margin || 0);

  const phoneOk = !!(u.is_phone_verified || u.phone_verified);
  const emailOk = !!(u.is_email_verified || u.email_verified);
  const kycOk = !!(u.is_id_verified || u.kyc_verified);
  const pos = parseInt(u.positive_feedback || 0);
  const neg = parseInt(u.negative_feedback || 0);
  const total = pos + neg;
  const trust = total > 0 ? Math.round(pos / total * 100) : trades > 0 ? 100 : 0;
  // pos/neg is a legacy trust counter that's never allowed to decrease and can be wildly
  // inflated relative to real reviews — the tab count must match what actually loads there.
  const reviewCount = parseInt(u.total_feedback_count ?? total);
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
    { id: 'feedback', label: `💬 Feedback (${reviewCount})` },
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
                      const flag = cc.replace(/./g, c => String.fromCodePoint(0x1F1E6 + c.charCodeAt(0) - 65));
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
                    const flag = cc.replace(/./g, c => String.fromCodePoint(0x1F1E6 + c.charCodeAt(0) - 65));
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
export default function SellGiftCardMarketplace({ user }) {
  const navigate = useNavigate();
  const { rates: USD_RATES, btcUsd: contextBtcUsd } = useRates();
  const _hasUsers = (data) => Array.isArray(data) && data.some(l => l.users && (l.users.id || l.users.username));
  const _cacheAll = () => { try { const c = JSON.parse(localStorage.getItem('praqen_market_all') || 'null'); if (!c || Date.now() - c.ts > 1800000 || !_hasUsers(c.data)) return null; return c?.data || null; } catch { return null; } };
  const isGcListing = (l) => l.listing_type === 'BUY_GIFT_CARD' || l.listing_type === 'SELL_GIFT_CARD';
  const _gcNow = () => { const a = _cacheAll(); return a ? a.filter(isGcListing) : []; };
  const [listings, setListings] = useState(() => _gcNow());
  const [liveStatus, setLiveStatus] = useState({});
  const [traderOfWeek, setTraderOfWeek] = useState(null); // auto-picked winner from the backend, not hardcoded
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
  const [selCurrency, setSelCurrency] = useState(CURRENCIES.find(c => c.code === 'USD') || CURRENCIES[0]);
  const [selBrand, setSelBrand] = useState('All Brands');
  const [selCountry, setSelCountry] = useState(COUNTRIES[0]);
  const [amountInput, setAmountInput] = useState('');
  const [sortBy, setSortBy] = useState('rate_low');
  const [traderSearch, setTraderSearch] = useState('');
  const [showCurrency, setShowCurrency] = useState(false);
  const [showBrand, setShowBrand] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showCountry, setShowCountry] = useState(false);
  const [showAssetMenu, setShowAssetMenu] = useState(false);
  const [showSellAssetMenu, setShowSellAssetMenu] = useState(false);
  const [cryptoFilter, setCryptoFilter] = useState('ALL'); // 'ALL' | 'BTC' | 'USDT'
  const [showCryptoMenu, setShowCryptoMenu] = useState(false);
  const [gcMode, setGcMode] = useState('sell'); // 'buy' | 'sell' | 'all'
  const [modal, setModal] = useState(null);
  const [activeTrades, setActiveTrades] = useState(() => getCachedActiveTrades('gift-card'));
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

  // Touch devices synthesize mouseenter/focus on tap with no real mouseleave to
  // clear it afterward, so these hover-hint bubbles were getting stuck open over
  // the controls beneath them (reported: stuck open over the BTC/USDT picker on
  // mobile). Hover-hint tooltips only make sense where hover exists — skip them
  // entirely on touch; the field labels alone are still there for touch users.
  function handleGuideEnter(id) {
    if (typeof window !== 'undefined' && window.matchMedia && !window.matchMedia('(hover: hover)').matches) return;
    clearTimeout(guideTimer.current); setActiveGuide(id);
  }
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
  // Auto-picked "Active Trader of the Week" — backend rotates this weekly based on
  // real trade counts, replacing what used to be a hardcoded username here.
  useEffect(() => {
    axios.get(`${API_URL}/trader-of-week`)
      .then(r => setTraderOfWeek(r.data?.winners?.gift_card || null))
      .catch(() => { });
  }, []);
  useEffect(() => {
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
          if (!isGiftCardTrade(t)) return false;
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
    }).catch(() => { });
    Promise.all([
      axios.post(`${API_URL}/users/heartbeat`, {}, { headers: h }).catch(() => { }),
      fetchTrades(),
    ]);
    const iv1 = setInterval(() => { if (localStorage.getItem('token')) axios.post(`${API_URL}/users/heartbeat`, {}, { headers: h }).catch(() => { }) }, 60000);
    const iv2 = setInterval(fetchTrades, 10000);
    const iv3 = setInterval(() => fetchOnlineStatus(), 30000);
    return () => { clearInterval(iv1); clearInterval(iv2); clearInterval(iv3); };
  }, [user, listings]);
  useEffect(() => {
    const h = e => {
      if (currencyRef.current && !currencyRef.current.contains(e.target)) { setShowCurrency(false); setCurrencySearch(''); }
      if (brandRef.current && !brandRef.current.contains(e.target) && !e.target.closest?.('.brand-dropdown-container')) { setShowBrand(false); setBrandSearch(''); }
      if (countryRef.current && !countryRef.current.contains(e.target) && !e.target.closest?.('.country-dropdown-container')) { setShowCountry(false); setCountrySearch(''); }
      if (cryptoRef.current && !cryptoRef.current.contains(e.target) && !e.target.closest?.('.crypto-dropdown-container')) { setShowCryptoMenu(false); }
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  // Reset the reveal window whenever the active filter set changes, so switching brand/
  // country/mode/etc. starts back at the first 24 matches instead of showing a stale count.
  useEffect(() => {
    setVisibleCount(24);
  }, [gcMode, cryptoFilter, selBrand, amountInput, selCountry.code, traderSearch, sortBy]);
  // Helper to fetch online status of the users currently on the page
  const fetchOnlineStatus = (currentListings) => {
    const ids = [...new Set((currentListings || listings).map(l => l.users?.id).filter(Boolean))];
    if (ids.length === 0) return;
    axios.get(`${API_URL}/users/online-status?ids=${ids.join(',')}`)
      .then(r => { if (r.data?.status) setLiveStatus(r.data.status); })
      .catch(() => { });
  };

  const loadListings = async (attempt = 1, force = false) => {
    // Show cached data immediately for fast render (stale-while-revalidate),
    // but ALWAYS fetch fresh data from the API in the background so newly
    // created offers appear without waiting for cache expiry or manual refresh.
    if (attempt === 1 && !force) {
      try {
        const c = JSON.parse(localStorage.getItem('praqen_market_all') || 'null');
        if (c && Date.now() - c.ts < 300000 && _hasUsers(c.data)) {
          const gcOffers = (c.data || []).filter(isGcListing);
          if (gcOffers.length > 0) {
            setListings(gcOffers);
            setLoading(false);
            // Don't return — continue to fetch fresh data below
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
        fetchOnlineStatus(data);
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
        const backoffMs = attempt === 1 ? 500 : 1500;
        setTimeout(() => loadListings(attempt + 1, force), backoffMs);
      } else {
        setRetrying(false);
        // Only show error if no cached data is being displayed
        if (!listings.length) setLoadError(true);
      }
    }
    finally { if (attempt === 1 || attempt >= 3) setLoading(false); }
  };

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

    if (cryptoFilter === 'BTC') {
      list = list.filter(l => !isUsdtAsset(l));
    } else if (cryptoFilter === 'USDT') {
      list = list.filter(l => isUsdtAsset(l));
    }

    if (selBrand !== 'All Brands') {
      list = list.filter(l => matchesBrand(l, selBrand));
    }
    const amt = parseFloat(amountInput);
    if (!isNaN(amt) && amt > 0) list = list.filter(l => {
      const range = getCardRange(l);
      if (!range) return true;
      if (range[0]?.isRange) return amt >= range[0].min && amt <= range[0].max;
      return range.some(v => Math.abs(v - amt) < 0.01);
    });
    // l.country_code / l.users?.country_code never come back from /api/listings — the
    // listings select only returns `country`, and the users select doesn't include a
    // country field at all — so this filter was matching against two always-undefined
    // fields and silently emptying the whole page for anyone with a country selected
    // (which happens automatically on load via IP/profile auto-detect above). Matches
    // BuyBitcoin.js's pattern: real `country` field, with no-country listings treated
    // as globally visible instead of hidden.
    if (selCountry.code !== 'ALL') list = list.filter(l => {
      const offerCountry = (l.country || '').toUpperCase();
      return offerCountry === '' || offerCountry === selCountry.code;
    });
    if (traderSearch.trim()) list = list.filter(l =>
      (l.users?.username || '').toLowerCase().includes(traderSearch.trim().toLowerCase())
    );
    if (sortBy === 'rate_low') list.sort((a, b) => parseFloat(a.margin || 0) - parseFloat(b.margin || 0));
    if (sortBy === 'rate_high') list.sort((a, b) => parseFloat(b.margin || 0) - parseFloat(a.margin || 0));
    if (sortBy === 'rating') list.sort((a, b) => (b.users?.average_rating || 0) - (a.users?.average_rating || 0));
    if (sortBy === 'trades') list.sort((a, b) => getTrades(b.users) - getTrades(a.users));

    // One offer per seller per card brand
    const seen = new Set();
    list = list.filter(l => {
      const brandKey = String(l.gift_card_brand || l.giftCardBrand || l.card_brand || l.payment_method || '').toLowerCase().trim();
      const key = `${l.seller_id}:${brandKey}`;
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

  // Active Trader of the Week — auto-picked weekly by the backend (services/
  // traderOfWeekService.js) from real trade counts, not a hardcoded username.
  // Exactly one featured badge per page: use the weekly pick if their listing is
  // still live here, otherwise fall back to today's top offer by trade count — this
  // page previously had no fallback, so the badge silently never showed whenever the
  // weekly winner's listing had gone stale.
  const activeTraderListingId = traderOfWeek?.listing_id || null;
  const activeTraderIsLive = !!activeTraderListingId && listings.some(l => l.id === activeTraderListingId);
  const rankedByTrades = [...listings]
    .filter(l => l.id !== activeTraderListingId && getTrades(l.users) > 0)
    .sort((a, b) => getTrades(b.users) - getTrades(a.users));
  const fastResponderListingId = activeTraderIsLive ? null : (rankedByTrades[0]?.id || null);
  const featuredListingId = activeTraderIsLive ? activeTraderListingId : fastResponderListingId;
  const featuredBadgeType = activeTraderIsLive ? 'active_trader' : 'fast_responder';
  const hasFilters = amountInput.trim() !== '' || selBrand !== 'All Brands' || selCountry.code !== 'ALL' || traderSearch.trim() !== '' || sortBy !== 'rate_low';

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: C.g100, fontFamily: "'DM Sans',sans-serif" }}>
      <SEO title="Sell Gift Cards | Gift Card Marketplace | PRAQEN"
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


      {/* ══ 1. NOONES-STYLE HEADER & CONVERSION BAR ════════════════════════════════════ */}
      <div className="w-full bg-white border-b px-4 py-4" style={{ borderColor: C.g200 }}>
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl sm:text-3xl font-black" style={{ color: C.g800 }}>
              {gcMode === 'buy' ? 'Buy' : 'Sell'} <span style={{ color: cryptoFilter === 'USDT' ? '#0F766E' : '#F4A422' }}>
                {cryptoFilter === 'ALL' ? 'All Crypto' : cryptoFilter === 'USDT' ? 'USDT' : 'BTC'}
              </span>
              {selBrand !== 'All Brands' && (
                <span className="font-bold" style={{ color: '#F4A422' }}> with {selBrand}</span>
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

          {/* ══ MOBILE CONTROL CARD (Light Theme) ══ */}
          <div className="block sm:hidden mt-3 bg-white rounded-2xl p-2.5 border border-gray-200 shadow-sm space-y-2.5">
            {/* Top Row: Buy/Sell Toggle (Left) & Asset Selector Dropdown (Right) */}
            <div className="flex items-center justify-between gap-2">
              {/* Buy / Sell Toggle Pills */}
              <div className="flex bg-gray-100 p-1 rounded-xl">
                <button
                  onClick={() => setGcMode('buy')}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-black transition ${gcMode === 'buy' ? 'bg-emerald-500 text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'
                    }`}
                >
                  <ArrowDown size={13} strokeWidth={3} /> Buy
                </button>
                <button
                  onClick={() => setGcMode('sell')}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-black transition ${gcMode === 'sell' ? 'bg-[#F4A422] text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'
                    }`}
                >
                  <ArrowUp size={13} strokeWidth={3} /> Sell
                </button>
              </div>

              {/* Crypto / Asset Dropdown Selector */}
              <div className="relative crypto-dropdown-container" ref={e => { cryptoRef.current = e; }}>
                <button
                  onClick={() => setShowCryptoMenu(v => !v)}
                  className="h-9 px-3 rounded-xl bg-gray-50 border border-gray-200 flex items-center gap-1.5 text-xs font-black text-gray-800 hover:bg-gray-100 transition"
                >
                  {cryptoFilter === 'BTC' ? (
                    <>
                      <CoinIcon coin="BTC" size={16} />
                      <span>BTC</span>
                    </>
                  ) : cryptoFilter === 'USDT' ? (
                    <>
                      <CoinIcon coin="USDT" size={16} />
                      <span>USDT</span>
                    </>
                  ) : (
                    <>
                      <Coins size={14} className="text-[#F4A422]" />
                      <span>All Crypto</span>
                    </>
                  )}
                  <ChevronDown size={13} className="text-gray-400" />
                </button>

                {/* Menu Overlay for Mobile */}
                {showCryptoMenu && (
                  <div className="absolute right-0 top-full mt-1.5 w-48 rounded-2xl border border-gray-200 shadow-xl overflow-hidden z-50 bg-white">
                    <div className="relative z-50 py-1">
                      <button
                        onClick={() => { setCryptoFilter('ALL'); setShowCryptoMenu(false); }}
                        className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left text-xs font-black text-gray-800 hover:bg-gray-50"
                      >
                        <Coins size={16} className="text-[#F4A422]" />
                        <span>All Crypto</span>
                      </button>
                      <button
                        onClick={() => { setCryptoFilter('BTC'); setShowCryptoMenu(false); }}
                        className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left text-xs font-black text-gray-800 hover:bg-gray-50 border-t border-gray-100"
                      >
                        <CoinIcon coin="BTC" size={20} />
                        <span>Bitcoin</span>
                      </button>
                      <button
                        onClick={() => { setCryptoFilter('USDT'); setShowCryptoMenu(false); }}
                        className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left text-xs font-black text-gray-800 hover:bg-gray-50 border-t border-gray-100"
                      >
                        <span className="w-5 h-5 rounded-full bg-teal-500 text-white flex items-center justify-center text-[10px]">₮</span>
                        <span>Tether (USDT)</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Centered Small Badge (FOR for Sell, WITH for Buy) */}
            <div className="relative flex justify-center -my-1 z-10">
              <span className={`bg-white border text-[9px] font-black tracking-wider px-2 py-0.5 rounded shadow-sm uppercase ${gcMode === 'sell' ? 'border-amber-200 text-amber-600' : 'border-emerald-200 text-emerald-600'
                }`}>
                {gcMode === 'sell' ? 'FOR' : 'WITH'}
              </span>
            </div>

            {/* Bottom Row: Brand Dropdown (Left) & Amount Input with Currency (Right) */}
            <div className="grid grid-cols-2 gap-2 pt-0.5">
              {/* Brand Button */}
              <div className="relative brand-dropdown-container" ref={e => { brandRef.current = e; }}>
                <button
                  onClick={() => { setShowBrand(!showBrand); setBrandSearch(''); }}
                  className="w-full h-9 px-3 rounded-xl bg-gray-50 border border-gray-200 flex items-center justify-between text-xs font-bold text-gray-800 hover:bg-gray-100 transition overflow-hidden"
                >
                  <span className="truncate">{selBrand === 'All Brands' ? 'All Cards' : selBrand}</span>
                  <ChevronDown size={13} className="text-gray-400 shrink-0 ml-1" />
                </button>

                {showBrand && (
                  <div className="absolute top-full left-0 right-0 mt-1.5 bg-white rounded-2xl shadow-2xl z-50 border overflow-hidden"
                    style={{ borderColor: C.g100, minWidth: '220px' }}>
                    <div className="px-2 py-2 border-b sticky top-0 bg-white z-40" style={{ borderColor: C.g100 }}>
                      <input type="text" placeholder="Search card brand..." value={brandSearch}
                        onChange={e => setBrandSearch(e.target.value)} onClick={e => e.stopPropagation()}
                        className="w-full px-2.5 py-1.5 rounded-lg focus:outline-none"
                        style={{ border: `1.5px solid ${C.g200}`, color: C.g800, backgroundColor: C.g50, fontSize: '14px' }} />
                    </div>
                    <div style={{ maxHeight: 240, overflowY: 'auto' }} className="relative z-30">
                      {brandSearch.trim() ? (
                        GC_BRANDS.filter(b => b.toLowerCase().includes(brandSearch.toLowerCase())).map(b => (
                          <button key={b} onClick={() => { setSelBrand(b); setShowBrand(false); setBrandSearch(''); }}
                            className="w-full flex items-center justify-between px-3 py-2.5 text-xs hover:bg-gray-50 border-b last:border-0 transition text-left"
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
                                <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: group.color || C.g500 }}>{group.cat}</span>
                              </div>
                            )}
                            {group.items.map(b => (
                              <button key={b} onClick={() => { setSelBrand(b); setShowBrand(false); setBrandSearch(''); }}
                                className="w-full flex items-center justify-between px-3 py-2.5 text-xs hover:bg-gray-50 border-b last:border-0 transition text-left"
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

              {/* Amount Input with Currency Badge */}
              <div className="h-9 px-2.5 rounded-xl bg-gray-50 border border-gray-200 flex items-center justify-between gap-1">
                <input
                  type="number"
                  placeholder="Amount"
                  value={amountInput}
                  onChange={e => setAmountInput(e.target.value)}
                  className="w-full bg-transparent text-xs font-bold text-gray-900 placeholder-gray-400 focus:outline-none"
                />
                <button
                  onClick={() => setShowCurrency(true)}
                  className="shrink-0 flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-gray-200 border border-gray-300 text-[10px] font-black text-gray-700 hover:text-gray-900"
                >
                  {selCurrency.code}
                </button>
              </div>
            </div>
          </div>

          {/* ══ 2. DESKTOP CONTROL CARD ════════════════════════════════════ */}
          <div className="hidden sm:flex mt-4 bg-white rounded-2xl border p-2 sm:p-3 shadow-sm flex-wrap items-center gap-2 sm:gap-3" style={{ borderColor: C.g200 }}>

            {/* Toggle Pill (Buy/Sell) */}
            <div className="flex bg-gray-100 p-1 rounded-xl shrink-0">
              <button onClick={() => setGcMode('buy')}
                className={`flex items-center gap-1 sm:gap-1.5 px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-black transition ${gcMode === 'buy' ? 'bg-[#10B981] text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}>
                <ArrowDown size={14} strokeWidth={3} /> Buy
              </button>
              <button onClick={() => setGcMode('sell')}
                className={`flex items-center gap-1 sm:gap-1.5 px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-black transition ${gcMode === 'sell' ? 'bg-[#F4A422] text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}>
                <ArrowUp size={14} strokeWidth={3} /> Sell
              </button>
            </div>

            {/* Crypto Dropdown */}
            <div className="relative shrink-0 crypto-dropdown-container" ref={e => { cryptoRef.current = e; }}>
              <button onClick={() => setShowCryptoMenu(v => !v)}
                className="h-[36px] sm:h-[40px] px-2 sm:px-3 rounded-xl border bg-gray-50 flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm font-black text-gray-800 hover:bg-gray-100 transition"
                style={{ borderColor: C.g200 }}>
                {cryptoFilter === 'BTC' ? (
                  <><CoinIcon coin="BTC" size={20} /> BTC</>
                ) : cryptoFilter === 'USDT' ? (
                  <><CoinIcon coin="USDT" size={20} /> USDT</>
                ) : (
                  <><Coins size={15} className="text-emerald-600" /> All Crypto</>
                )}
                <ChevronDown size={14} className="text-gray-400" />
              </button>
              {showCryptoMenu && (
                <div className="absolute left-0 top-full mt-1.5 w-48 sm:w-56 rounded-2xl border shadow-xl overflow-hidden z-50 bg-white" style={{ borderColor: C.g200 }}>
                  <div className="relative z-50">
                    <button onClick={() => { setCryptoFilter('ALL'); setShowCryptoMenu(false); }}
                      className={`w-full flex items-center gap-2.5 px-3.5 py-3 text-left transition ${cryptoFilter === 'ALL' ? 'bg-emerald-50/80' : 'hover:bg-gray-50'}`}>
                      <span className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 font-black text-xs text-white" style={{ background: 'linear-gradient(135deg,#0D9488,#14B8A6)' }}><Coins size={14} /></span>
                      <span className="flex-1 min-w-0"><span className="block text-xs font-black text-gray-800">All Crypto</span></span>
                    </button>
                    <button onClick={() => { setCryptoFilter('BTC'); setShowCryptoMenu(false); }}
                      className={`w-full flex items-center gap-2.5 px-3.5 py-3 text-left transition border-t ${cryptoFilter === 'BTC' ? 'bg-amber-50/80' : 'hover:bg-gray-50'}`} style={{ borderColor: C.g100 }}>
                      <CoinIcon coin="BTC" size={28} />
                      <span className="flex-1 min-w-0"><span className="block text-xs font-black text-gray-800">Bitcoin</span></span>
                    </button>
                    <button onClick={() => { setCryptoFilter('USDT'); setShowCryptoMenu(false); }}
                      className={`w-full flex items-center gap-2.5 px-3.5 py-3 text-left transition border-t ${cryptoFilter === 'USDT' ? 'bg-teal-50/80' : 'hover:bg-gray-50'}`} style={{ borderColor: C.g100 }}>
                      <span className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 font-black text-xs text-white" style={{ background: 'linear-gradient(135deg,#0F766E,#14B8A6)' }}>₮</span>
                      <span className="flex-1 min-w-0"><span className="block text-xs font-black text-gray-800">Tether (USDT)</span></span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Brand Dropdown (Replaces Payment Method) */}
            <div className="relative shrink-0 flex-1 sm:flex-none sm:w-40 brand-dropdown-container" ref={e => { brandRef.current = e; }}>
              <span className="absolute -top-2 left-3 px-1 bg-white text-[9px] font-black text-emerald-600 tracking-wider uppercase z-10">BRAND</span>
              <button
                onClick={() => { setShowBrand(!showBrand); setBrandSearch(''); }}
                className="w-full h-[36px] sm:h-[40px] flex items-center justify-between px-3 rounded-xl border bg-gray-50 text-xs font-bold text-gray-700 hover:bg-gray-100 transition"
                style={{ borderColor: C.g200 }}>
                <span className="truncate">{selBrand === 'All Brands' ? 'All Cards' : selBrand}</span>
                <ChevronDown size={14} className="text-gray-400 flex-shrink-0" />
              </button>

              {showBrand && (
                <div className="absolute top-full left-0 right-0 mt-1.5 bg-white rounded-2xl shadow-2xl z-50 border overflow-hidden"
                  style={{ borderColor: C.g100, minWidth: '240px' }}>
                  <div className="px-2 py-2 border-b sticky top-0 bg-white z-40" style={{ borderColor: C.g100 }}>
                    <input type="text" placeholder="Search card brand..." value={brandSearch}
                      onChange={e => setBrandSearch(e.target.value)} onClick={e => e.stopPropagation()}
                      className="w-full px-2.5 py-1.5 rounded-lg focus:outline-none"
                      style={{ border: `1.5px solid ${C.g200}`, color: C.g800, backgroundColor: C.g50, fontSize: '16px' }} />
                  </div>
                  <div style={{ maxHeight: 260, overflowY: 'auto' }} className="relative z-30">
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

            {/* Amount Input */}
            <div className="relative flex-1 min-w-[140px] flex items-center bg-gray-50 rounded-xl border pl-3 pr-1" style={{ borderColor: C.g200, height: '40px' }}>
              <span className="absolute -top-2 left-3 px-1 bg-white text-[9px] font-black text-gray-500 tracking-wider uppercase z-10">AMOUNT</span>
              <input
                type="number"
                placeholder="Enter amount..."
                value={amountInput}
                onChange={e => setAmountInput(e.target.value)}
                className="w-full bg-transparent text-xs font-bold focus:outline-none text-gray-800 h-full"
              />
              <button
                onClick={() => setShowCurrency(true)}
                className="flex-shrink-0 flex items-center gap-1 pl-2 border-l hover:bg-gray-200 transition text-xs font-black text-gray-700 h-full px-2 rounded-r-lg"
                style={{ borderColor: C.g200 }}>
                {selCurrency.code}
                <ChevronDown size={12} className="text-gray-400" />
              </button>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 shrink-0 ml-auto sm:ml-0">
              <button onClick={() => navigate('/create-offer')}
                className="h-[36px] sm:h-[40px] px-3 sm:px-4 rounded-xl bg-emerald-500 text-white text-xs sm:text-sm font-black flex items-center gap-1.5 shadow-sm hover:bg-emerald-600 transition">
                <PlusCircle size={14} /> <span className="hidden sm:inline">Create</span>
              </button>

              <button onClick={() => setShowFilters(true)}
                className="h-[36px] sm:h-[40px] px-3 sm:px-4 rounded-xl border bg-white text-gray-700 text-xs sm:text-sm font-black flex items-center gap-1.5 hover:bg-gray-50 transition"
                style={{ borderColor: C.g200 }}>
                <Filter size={14} /> <span className="hidden sm:inline">Filters</span>
              </button>

              <button onClick={() => loadListings(1, true)}
                className="w-[36px] h-[36px] sm:w-[40px] sm:h-[40px] rounded-xl border bg-white flex items-center justify-center text-gray-500 hover:bg-gray-50 hover:text-emerald-600 transition"
                style={{ borderColor: C.g200 }}>
                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              </button>
            </div>

          </div>
        </div>
      </div>

      {/* ── Inline active trade cards ── */}
      {activeTrades.length > 0 && (
        <div className="px-3 mt-3 mb-2 max-w-7xl mx-auto w-full">
          <div className="flex items-center gap-2 mb-2 font-black text-sm text-gray-900">
            <Repeat2 size={16} /> Active trades ({activeTrades.length})
          </div>
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

      {/* ══════════════════════════════════════════════════
          5. OFFER GRID
      ══════════════════════════════════════════════════ */}
      <div className="max-w-7xl mx-auto w-full px-2 sm:px-3 pt-2 pb-3 space-y-3">

        {/* Mobile Offers Header & Action Buttons Row */}
        <div className="flex sm:hidden items-center justify-between my-1 px-0.5">
          <h2 className="text-xl font-black text-gray-900">Offers</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/create-offer')}
              className="w-9 h-9 rounded-xl bg-gray-50 border border-gray-200 text-gray-700 flex items-center justify-center font-bold shadow-sm hover:bg-gray-100 transition"
              title="Create Offer"
            >
              <Plus size={16} />
            </button>
            <button
              onClick={() => setShowFilters(true)}
              className="h-9 px-2.5 rounded-xl bg-gray-50 border border-gray-200 text-gray-700 flex items-center gap-1.5 text-xs font-bold shadow-sm hover:bg-gray-100 transition"
            >
              <SlidersHorizontal size={14} />
              {hasFilters && (
                <span className="w-4 h-4 rounded-full bg-emerald-500 text-white text-[10px] font-black flex items-center justify-center">
                  1
                </span>
              )}
            </button>
            <button
              onClick={() => loadListings(1, true)}
              className="w-9 h-9 rounded-xl bg-gray-50 border border-gray-200 text-gray-700 flex items-center justify-center shadow-sm hover:bg-gray-100 transition"
              title="Refresh"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-1 gap-3 w-full">
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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-1 gap-3 w-full">
              {filtered.slice(0, visibleCount).map(l => (
                <GCCard
                  key={l.id}
                  listing={l}
                  btcPriceUSD={btcPrice}
                  featuredType={l.id === featuredListingId ? featuredBadgeType : undefined}
                  onViewSeller={() => setModal({ seller: l.users || {}, listing: l })}
                  onTrade={() => handleTrade(l.id)}
                  liveSeenAt={liveStatus[l.users?.id] || null}
                  userBuyAmt={amountInput}
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '13px 15px', borderRadius: 12, background: 'linear-gradient(135deg,#FFFBEB,#FEF3C7)', border: '1.5px solid #FCD34D', boxShadow: '0 2px 8px rgba(217,119,6,0.12)' }}>
          <div style={{ width: 34, height: 34, borderRadius: 9, background: '#FDE68A', border: '1px solid #FCD34D', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <AlertTriangle size={17} style={{ color: '#B45309' }} />
          </div>
          <div>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 900, color: '#92400E', lineHeight: 1.3 }}>Trade Safely</p>
            <p style={{ margin: 0, fontSize: 11, color: '#92400E', fontWeight: 600, lineHeight: 1.4, marginTop: 1 }}>Only share gift card codes inside the active escrow trade. Every trade is platform-protected.</p>
          </div>
        </div>

        {/* ── NEW USER BONUS CARD ── */}
        {!user && (
          <div style={{ borderRadius: 14, overflow: 'hidden', boxShadow: '0 4px 20px rgba(27,67,50,0.18)' }}>
            <div style={{ background: 'linear-gradient(135deg,#1B4332 0%,#2D6A4F 60%,#40916C 100%)', padding: '14px 14px 12px', position: 'relative' }}>
              {/* Dot pattern */}
              <div style={{ position: 'absolute', inset: 0, opacity: 0.06, backgroundImage: 'radial-gradient(circle at 2px 2px,white 1px,transparent 0)', backgroundSize: '16px 16px', pointerEvents: 'none' }} />
              {/* Gold accent top border */}
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'linear-gradient(90deg,#F4A422,#FBBF24,#F4A422)', borderRadius: '14px 14px 0 0' }} />
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 10, position: 'relative' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 10, background: '#F4A422', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 16, boxShadow: '0 2px 8px rgba(244,164,34,0.45)' }}>🎁</div>
                  <div>
                    <p style={{ margin: 0, fontSize: 12, fontWeight: 900, color: '#FFFFFF', lineHeight: 1.2 }}>New users earn <span style={{ color: '#F4A422' }}>$2 FREE Bitcoin!</span></p>
                    <p style={{ margin: 0, fontSize: 9, color: 'rgba(255,255,255,0.55)', marginTop: 2 }}>Offer valid 30 days · Limited time</p>
                  </div>
                </div>
                <button onClick={() => navigate('/register')}
                  style={{ flexShrink: 0, padding: '6px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', background: '#F4A422', color: '#1B4332', fontWeight: 900, fontSize: 10, whiteSpace: 'nowrap', boxShadow: '0 2px 8px rgba(244,164,34,0.4)' }}>
                  Claim →
                </button>
              </div>
              {/* 3-step flow */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr auto 1fr', alignItems: 'center', gap: 3, position: 'relative' }}>
                {[
                  { icon: '✅', label: 'Register', sub: '$1 locked' },
                  { icon: '⚡', label: 'Verify', sub: 'stays safe' },
                  { icon: '₿', label: '1 Trade', sub: '$2 unlocks' },
                ].map(({ icon, label, sub }, i, arr) => (
                  <Fragment key={label}>
                    <div style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 8, padding: '6px 4px', textAlign: 'center' }}>
                      <div style={{ fontSize: 13, lineHeight: 1, marginBottom: 2 }}>{icon}</div>
                      <div style={{ fontSize: 9, fontWeight: 800, color: '#fff', lineHeight: 1 }}>{label}</div>
                      <div style={{ fontSize: 7, color: 'rgba(255,255,255,0.45)', marginTop: 2, lineHeight: 1 }}>{sub}</div>
                    </div>
                    {i < arr.length - 1 && <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', textAlign: 'center', flexShrink: 0 }}>›</div>}
                  </Fragment>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── AFFILIATE PROMO CARD ── */}
        <div style={{ borderRadius: 16, overflow: 'hidden', boxShadow: '0 6px 28px rgba(27,67,50,0.22)' }}>

          {/* Header — brand gradient with subtle pattern + glow for a premium, eye-catching feel */}
          <div style={{ padding: '20px 18px 18px', background: `linear-gradient(135deg,${C.forest},${C.green})`, position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', inset: 0, opacity: 0.08, backgroundImage: 'radial-gradient(circle at 2px 2px,white 1px,transparent 0)', backgroundSize: '18px 18px' }} />
            <div style={{ position: 'absolute', top: -30, right: -20, width: 140, height: 140, borderRadius: '50%', background: C.gold, opacity: 0.15, filter: 'blur(40px)' }} />
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 900, color: C.forest, background: C.gold, borderRadius: 6, padding: '3px 9px', letterSpacing: 0.5, textTransform: 'uppercase' }}>
                    <Bitcoin size={11} />Affiliate
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9, fontWeight: 700, color: '#fff', background: 'rgba(255,255,255,0.15)', borderRadius: 5, padding: '2px 8px' }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#6EE7B7', display: 'inline-block' }} />LIVE
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: 20, fontWeight: 900, color: '#fff', lineHeight: 1.2 }}>Invite friends. Earn Bitcoin together.</p>
                <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 5, fontWeight: 500 }}>Earn when the friends you invite trade on PRAQEN.</p>
              </div>
              <button onClick={() => navigate('/partner-program')}
                style={{ flexShrink: 0, padding: '12px 20px', borderRadius: 11, border: 'none', cursor: 'pointer', background: C.gold, color: C.forest, fontWeight: 900, fontSize: 13, whiteSpace: 'nowrap', boxShadow: '0 4px 16px rgba(244,164,34,0.45)' }}>
                Get Link <ArrowRight size={14} style={{ display: 'inline', marginLeft: 4, verticalAlign: '-2px' }} />
              </button>
            </div>
          </div>

          <div style={{padding:'10px 14px',background:'#fff',textAlign:'center'}}>
            <span onClick={()=>navigate('/partner-program')} style={{fontSize:11,fontWeight:700,color:'#1B4332',cursor:'pointer',textDecoration:'underline'}}>See the Referral Program page for current rates →</span>
          </div>


          <p style={{ margin: 0, padding: '6px 14px 9px', textAlign: 'center', fontSize: 9, color: C.g400, fontWeight: 600, letterSpacing: 0.3, background: '#fff' }}>
            Free to join
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


      {/* ══ NOONES CURRENCY MODAL ════════════════════════════════════ */}
      {showCurrency && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex flex-col justify-end md:flex-row md:justify-end">
          <div className="w-full md:max-w-md bg-white h-[85vh] md:h-full rounded-t-2xl md:rounded-none flex flex-col p-4 overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-3 mb-4" style={{ borderColor: C.g200 }}>
              <h3 className="text-lg font-black text-gray-900">Currency</h3>
              <button onClick={() => setShowCurrency(false)} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 transition">
                <X size={18} />
              </button>
            </div>
            <input
              type="text"
              placeholder="Search..."
              value={currencySearch}
              onChange={(e) => setCurrencySearch(e.target.value)}
              className="w-full px-4 py-3 bg-gray-50 border rounded-xl font-semibold mb-4 focus:outline-none"
              style={{ borderColor: C.g200 }}
            />
            <div className="space-y-1 flex-1 overflow-y-auto">
              {GC_FILTER_CURRENCIES.filter(c => !currencySearch || c.name.toLowerCase().includes(currencySearch.toLowerCase()) || c.code.toLowerCase().includes(currencySearch.toLowerCase())).map((c, idx) => {
                const countryCode = c.code.substring(0, 2).toLowerCase();
                return (
                  <button
                    key={idx}
                    onClick={() => { setSelCurrency(c); setShowCurrency(false); }}
                    className={`w-full flex items-center justify-between p-3 rounded-xl text-xs font-bold border-b transition ${selCurrency.code === c.code ? 'bg-emerald-50 text-emerald-700' : 'hover:bg-gray-50 text-gray-800'}`}
                    style={{ borderColor: C.g100 }}>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-black text-gray-800">{c.code}</span>
                      <span className="text-xs text-gray-500">{c.name}</span>
                    </div>
                    {selCurrency.code === c.code && <CheckCircle size={16} className="text-emerald-600" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ══ NOONES FILTER DRAWER MODAL ════════════════════════════════════ */}
      {showFilters && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex justify-end transition-opacity">
          <div className="w-full max-w-md bg-white h-full flex flex-col justify-between p-4 overflow-y-auto animate-slideLeft">
            <div className="space-y-6">
              <div className="flex items-center justify-between border-b pb-3" style={{ borderColor: C.g200 }}>
                <h3 className="text-lg font-black text-gray-900">Filters</h3>
                <button onClick={() => setShowFilters(false)} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 transition">
                  <X size={18} />
                </button>
              </div>

              {/* Country Selection */}
              <div>
                <span className="text-sm font-bold text-gray-700 block mb-2">Location</span>
                <button
                  onClick={() => setShowCountry(!showCountry)}
                  className="w-full flex items-center justify-between px-3 py-3 rounded-xl border bg-gray-50 text-sm font-bold text-gray-700 hover:bg-gray-100 transition"
                  style={{ borderColor: C.g200 }}>
                  <div className="flex items-center gap-2">
                    <span>{selCountry.flag}</span>
                    <span>{selCountry.name}</span>
                  </div>
                  <ChevronDown size={16} className="text-gray-400" />
                </button>
                {showCountry && (
                  <div className="mt-2 rounded-xl border overflow-hidden" style={{ borderColor: C.g100 }}>
                    <div className="p-2 border-b bg-gray-50" style={{ borderColor: C.g100 }}>
                      <input type="text" placeholder="Search country…"
                        value={countrySearch} onChange={e => setCountrySearch(e.target.value)}
                        className="w-full px-3 py-1.5 font-semibold rounded-lg border focus:outline-none"
                        style={{ borderColor: C.g200, color: C.g800, fontSize: '14px' }} />
                    </div>
                    <div className="overflow-y-auto max-h-56 bg-white">
                      {COUNTRIES.filter(c => !countrySearch.toLowerCase() || c.name.toLowerCase().includes(countrySearch.toLowerCase())).map(c => (
                        <button key={c.code} onClick={() => { setSelCountry(c); setShowCountry(false); setCountrySearch(''); }}
                          className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-gray-50 border-b last:border-0 transition"
                          style={{ borderColor: C.g50, backgroundColor: selCountry.code === c.code ? `${C.forest}08` : 'transparent' }}>
                          <span className="text-sm">{c.flag}</span>
                          <span className="text-xs font-bold flex-1 text-left" style={{ color: C.g800 }}>{c.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Search Trader */}
              <div>
                <span className="text-sm font-bold text-gray-700 block mb-2">Trader Search</span>
                <div className="flex items-center border rounded-xl overflow-hidden bg-gray-50" style={{ borderColor: C.g200 }}>
                  <input
                    type="text"
                    placeholder="Search username..."
                    value={traderSearch}
                    onChange={e => setTraderSearch(e.target.value)}
                    className="flex-1 min-w-0 px-3 py-3 font-bold focus:outline-none bg-transparent"
                    style={{ color: C.g800, fontSize: '14px' }} />
                  {traderSearch.trim() && (
                    <button onClick={() => setTraderSearch('')} className="px-3" style={{ color: C.g400 }}>
                      <X size={14} />
                    </button>
                  )}
                </div>
              </div>

              {/* Sorting */}
              <div className="flex items-center justify-between py-2 border-b" style={{ borderColor: C.g100 }}>
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

            </div>

            <div className="pt-6 border-t space-y-2" style={{ borderColor: C.g200 }}>
              <button
                onClick={() => setShowFilters(false)}
                className="w-full py-3.5 rounded-xl bg-[#10B981] text-white font-black text-sm shadow-md transition">
                Apply
              </button>
            </div>
          </div>
        </div>
      )}

    </div>);
}

