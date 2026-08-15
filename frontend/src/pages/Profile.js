import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { API_URL } from '../App';
import { supabase } from '../lib/supabaseClient'; // eslint-disable-line no-unused-vars
import { useRates } from '../contexts/RatesContext';
import ProfileFlag from '../components/ProfileFlag'; // eslint-disable-line no-unused-vars
import CountryFlag from '../components/CountryFlag'; // eslint-disable-line no-unused-vars
import {
  Star, MapPin, Award, Shield, CheckCircle,
  Users, Clock, MessageCircle, Camera, Copy, Globe,
  RefreshCw, Edit2, Save, X,
  BadgeCheck, TrendingUp, Lock,
  ChevronRight, Phone, Mail, FileText, ThumbsUp,
  ThumbsDown, Target, Smartphone, ArrowRight,
  Bitcoin, ShoppingCart, Gift, Plus, Tag,
  Filter, ArrowUpDown, Zap, Briefcase, Medal,
  Crown, Diamond, Flame, Rocket,
  AlertTriangle, User, Info, XCircle, Lightbulb, PartyPopper
} from 'lucide-react';
import { toast } from 'react-toastify';
import { BadgeChip, TRUST_MAP, BADGE_ORDER, BADGE_THRESHOLDS, renderBadgeIcon } from '../lib/badge';
import { copyToClipboard } from '../utils/clipboard';

// ── Colors ──────────────────────────────────────────────────────────────────
const C = {
  forest: '#1B4332', green: '#2D6A4F', mint: '#40916C', sage: '#52B788',
  gold: '#F4A422', amber: '#F59E0B', mist: '#F0FAF5', white: '#FFFFFF',
  g50: '#F8FAFC', g100: '#F1F5F9', g200: '#E2E8F0', g300: '#CBD5E1',
  g400: '#94A3B8', g500: '#64748B', g600: '#475569', g700: '#334155', g800: '#1E293B',
  success: '#10B981', danger: '#EF4444', warn: '#F59E0B', paid: '#3B82F6',
  online: '#22C55E', purple: '#8B5CF6',
};

const MIGRATION_PLATFORM_LABELS = { noones: 'Noones', binance: 'Binance P2P', other: 'P2P' };
const MIGRATION_PLATFORMS = [
  { id: 'noones', label: 'Noones' },
  { id: 'binance', label: 'Binance P2P' },
  { id: 'other', label: 'Another P2P platform' },
];

// ── Move-my-feedback card ── for a logged-in user who hasn't migrated a P2P
// reputation yet. They're already signed in here, so this only asks for the
// platform + a screenshot — no email step needed.
function MigrateFeedbackCard({ email, autoOpen }) {
  const [open, setOpen] = useState(!!autoOpen);
  const [platform, setPlatform] = useState(null);
  const [screenshotFile, setScreenshotFile] = useState(null);
  const [screenshotPreview, setScreenshotPreview] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const compressScreenshot = (file, maxPx = 1200, quality = 0.8) =>
    new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image load failed')); };
      img.src = url;
    });

  const handleFile = (file) => {
    if (!file) return;
    setScreenshotFile(file);
    setScreenshotPreview(URL.createObjectURL(file));
    setError('');
  };

  const submit = async () => {
    if (!platform) { setError('Choose which platform you traded on'); return; }
    if (!screenshotFile) { setError('Please upload a screenshot of your P2P profile'); return; }
    setSubmitting(true); setError('');
    try {
      const screenshot = await compressScreenshot(screenshotFile);
      await axios.post(`${API_URL}/p2p-migration/submit`, { email, platform, screenshot });
      setSubmitted(true);
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong. Please try again.');
    } finally { setSubmitting(false); }
  };

  if (submitted) {
    return (
      <div className="mt-4 rounded-2xl p-4 text-center" style={{ background: '#ECFDF5', border: '1px solid #A7F3D0' }}>
        <CheckCircle size={18} style={{ color: '#059669', margin: '0 auto 6px' }} />
        <p style={{ fontSize: 12.5, fontWeight: 800, color: '#065F46', margin: 0 }}>Submitted! We'll review and reach out soon.</p>
      </div>
    );
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="mt-4 w-full flex items-center gap-2 justify-center"
        style={{ padding: '10px 16px', borderRadius: 99, border: 'none', background: `linear-gradient(135deg, ${C.forest} 0%, ${C.green} 100%)`, color: C.gold, fontSize: 12.5, fontWeight: 800, cursor: 'pointer' }}>
        <Globe size={14} style={{ color: C.gold }} /> Already trading on Noones or Binance P2P? Move your feedback here →
      </button>
    );
  }

  return (
    <div className="mt-4 rounded-2xl p-4" style={{ background: C.g50, border: `1px solid ${C.g200}`, textAlign: 'left' }}>
      <p style={{ fontSize: 12.5, fontWeight: 800, color: C.forest, margin: '0 0 10px' }}>Move your feedback from another P2P platform</p>
      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 10, fontSize: 11.5, background: '#FEF2F2', color: '#EF4444', marginBottom: 10 }}>
          <AlertTriangle size={12} />{error}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        {MIGRATION_PLATFORMS.map(p => (
          <button key={p.id} onClick={() => { setPlatform(p.id); setError(''); }}
            style={{ padding: '8px 14px', borderRadius: 99, border: `2px solid ${platform === p.id ? C.green : C.g200}`, background: platform === p.id ? '#ECFDF5' : '#fff', color: platform === p.id ? C.green : C.g600, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
            {p.label}
          </button>
        ))}
      </div>
      <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, padding: screenshotPreview ? 0 : '18px 12px', borderRadius: 12, border: `2px dashed ${screenshotPreview ? C.green : C.g200}`, cursor: 'pointer', overflow: 'hidden', background: screenshotPreview ? 'transparent' : '#fff', marginBottom: 10 }}>
        <input type="file" accept="image/*" onChange={e => handleFile(e.target.files?.[0])} style={{ display: 'none' }} />
        {screenshotPreview ? (
          <img src={screenshotPreview} alt="Screenshot preview" style={{ width: '100%', maxHeight: 160, objectFit: 'cover' }} />
        ) : (
          <>
            <FileText size={18} style={{ color: C.g400 }} />
            <span style={{ fontSize: 11.5, color: C.g500, fontWeight: 600 }}>Tap to upload a screenshot of your profile</span>
          </>
        )}
      </label>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => setOpen(false)}
          style={{ padding: '10px 16px', borderRadius: 12, border: `1.5px solid ${C.g200}`, background: '#fff', color: C.g500, fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
          Cancel
        </button>
        <button onClick={submit} disabled={submitting}
          style={{ flex: 1, padding: '10px 16px', borderRadius: 12, border: 'none', background: `linear-gradient(135deg, ${C.green}, ${C.mint})`, color: '#fff', fontSize: 12.5, fontWeight: 800, cursor: submitting ? 'not-allowed' : 'pointer', opacity: submitting ? 0.6 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          {submitting ? <><RefreshCw size={13} style={{ animation: 'spin 0.7s linear infinite' }} /> Submitting…</> : <>Submit for Review</>}
        </button>
      </div>
    </div>
  );
}

const BADGE_DEFS = BADGE_ORDER.map((key) => {
  const b = TRUST_MAP[key];
  const tradesNeeded = BADGE_THRESHOLDS[key];
  return {
    id: key.toLowerCase(),
    label: key,
    icon: renderBadgeIcon(b, 24),
    color: b.color,
    bg: b.bg.includes('gradient') ? b.bg : b.bg,
    desc: tradesNeeded
      ? `Level ${b.level}: ${tradesNeeded}+ successful trades completed.`
      : `Level ${b.level}: Starting your trading journey on PRAQEN.`,
    check: (u) => (tradesNeeded ? parseInt(u?.total_trades || 0, 10) >= tradesNeeded : true),
  };
});

const isoToFlag = (cc) => {
  if (!cc || cc.length !== 2) return '';
  return cc.toUpperCase().replace(/./g, c => String.fromCodePoint(0x1F1E6 + c.charCodeAt(0) - 65));
};

const COUNTRY_NAMES = {
  GH: 'Ghana', NG: 'Nigeria', KE: 'Kenya', ZA: 'South Africa', UG: 'Uganda', TZ: 'Tanzania',
  RW: 'Rwanda', CM: 'Cameroon', SN: 'Senegal', ML: 'Mali', CI: "Côte d'Ivoire", CD: 'DR Congo',
  ZM: 'Zambia', MZ: 'Mozambique', ZW: 'Zimbabwe', BF: 'Burkina Faso', BJ: 'Benin', TG: 'Togo',
  NE: 'Niger', ET: 'Ethiopia', EG: 'Egypt', MA: 'Morocco', DZ: 'Algeria', AO: 'Angola',
  NA: 'Namibia', BW: 'Botswana', MW: 'Malawi', LS: 'Lesotho', SZ: 'Eswatini',
  US: 'United States', GB: 'United Kingdom', DE: 'Germany', FR: 'France', IT: 'Italy',
  ES: 'Spain', NL: 'Netherlands', SE: 'Sweden', NO: 'Norway', PL: 'Poland', UA: 'Ukraine',
  TR: 'Turkey', VN: 'Vietnam', TH: 'Thailand', ID: 'Indonesia', PH: 'Philippines',
  MY: 'Malaysia', SG: 'Singapore', IN: 'India', CN: 'China', JP: 'Japan', KR: 'South Korea',
  PK: 'Pakistan', BD: 'Bangladesh', SA: 'Saudi Arabia', AE: 'UAE', QA: 'Qatar',
  BR: 'Brazil', MX: 'Mexico', CO: 'Colombia', AR: 'Argentina', CA: 'Canada',
  AU: 'Australia', NZ: 'New Zealand',
};

const PHONE_PREFIX_CC = {
  '+1': 'US', '+7': 'RU', '+20': 'EG', '+27': 'ZA', '+33': 'FR', '+44': 'GB', '+49': 'DE',
  '+55': 'BR', '+60': 'MY', '+61': 'AU', '+62': 'ID', '+63': 'PH', '+65': 'SG', '+66': 'TH',
  '+81': 'JP', '+82': 'KR', '+84': 'VN', '+86': 'CN', '+91': 'IN', '+92': 'PK', '+212': 'MA',
  '+213': 'DZ', '+221': 'SN', '+223': 'ML', '+225': 'CI', '+226': 'BF', '+227': 'NE',
  '+228': 'TG', '+229': 'BJ', '+233': 'GH', '+234': 'NG', '+237': 'CM', '+243': 'CD',
  '+250': 'RW', '+251': 'ET', '+254': 'KE', '+255': 'TZ', '+256': 'UG', '+260': 'ZM',
  '+263': 'ZW', '+264': 'NA', '+265': 'MW', '+966': 'SA', '+971': 'AE', '+974': 'QA',
};
function phoneToCC(phone) {
  if (!phone) return null;
  const d = String(phone).replace(/[\s\-()/]/g, '');
  if (!d.startsWith('+')) return null;
  const keys = Object.keys(PHONE_PREFIX_CC).sort((a, b) => b.length - a.length);
  for (const k of keys) { if (d.startsWith(k)) return PHONE_PREFIX_CC[k]; }
  return null;
}

const CUR_SYM = { GHS: '₵', NGN: '₦', KES: 'KSh', ZAR: 'R', USD: '$', GBP: '£', EUR: '€', UGX: 'USh', TZS: 'TSh', XAF: 'CFA', XOF: 'CFA', RWF: 'RF', ETB: 'Br', AUD: 'A$', CAD: 'C$', SGD: 'S$', INR: '₹' };
const offerTypeOf = l => {
  const lt = (l.listing_type || '').toUpperCase();
  if (lt.includes('GIFT')) return 'gift';
  if (lt === 'SELL' || lt === 'SELL_BITCOIN') return 'sell';
  return 'buy';
};
const OFFER_TYPE_CFG = {
  sell: { label: 'Selling BTC', color: '#2D6A4F', bg: '#ECFDF5' },
  buy: { label: 'Buying BTC', color: '#3B82F6', bg: '#EFF6FF' },
  gift: { label: 'Gift Card', color: '#8B5CF6', bg: '#F5F3FF' },
};
const fmt = (n, d = 0) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: d }).format(n || 0);
const fmtAge = (d) => {
  if (!d) return 'Recently';
  const s = (Date.now() - new Date(d)) / 1000;
  if (s < 300) return 'Online now';
  if (s < 3600) return `${~~(s / 60)}m ago`;
  if (s < 86400) return `${~~(s / 3600)}h ago`;
  const diff = Math.floor(s / 86400);
  if (diff < 30) return `${diff}d ago`;
  if (diff < 365) return `${Math.floor(diff / 30)}mo ago`;
  return `${Math.floor(diff / 365)}y ago`;
};

function calcTrust(u) {
  let s = 0;
  if (u?.is_email_verified || u?.email_verified) s += 10;
  if (u?.is_phone_verified || u?.phone_verified) s += 15;
  if (u?.kyc_verified || u?.is_id_verified) s += 15;
  s += Math.min(30, Math.floor(parseInt(u?.total_trades || 0) / 2));
  s += Math.floor(parseFloat(u?.average_rating || 0) / 5 * 20);
  if (u?.created_at) s += Math.min(10, Math.floor((Date.now() - new Date(u.created_at)) / (1000 * 60 * 60 * 24 * 36)));
  return Math.min(100, s);
}
const trustLvl = (s) => s >= 71 ? { label: 'High Trust', color: C.success, bg: '#ECFDF5' } : s >= 41 ? { label: 'Medium Trust', color: C.warn, bg: '#FFFBEB' } : { label: 'Low Trust', color: C.danger, bg: '#FEF2F2' };

const TIERS = [
  { label: 'Basic', limit: 500, color: C.g400, requires: [] },
  { label: 'Standard', limit: 2000, color: C.paid, requires: ['email', 'phone'] },
  { label: 'Advanced', limit: 10000, color: C.success, requires: ['email', 'phone', 'kyc'] },
  { label: 'VIP', limit: 50000, color: C.gold, requires: ['email', 'phone', 'kyc', '50trades'] },
];
function getTier(u) {
  const e = !!(u?.is_email_verified || u?.email_verified), p = !!(u?.is_phone_verified || u?.phone_verified), k = !!(u?.kyc_verified || u?.is_id_verified), t = parseInt(u?.total_trades || 0);
  if (e && p && k && t >= 50) return 3; if (e && p && k) return 2; if (e && p) return 1; return 0;
}

// ── Profile Offer Card ───────────────────────────────────────────────────────
function ProfileOfferCard({ listing, navigate, btcUsd }) {
  const type = offerTypeOf(listing);
  const cfg = OFFER_TYPE_CFG[type];
  const cur = listing.currency || 'USD';
  const sym = listing.currency_symbol || CUR_SYM[cur] || '$';
  const margin = parseFloat(listing.margin || 0);
  const minLocal = parseFloat(listing.min_limit_local || listing.min_limit_usd || 0);
  const maxLocal = parseFloat(listing.max_limit_local || listing.max_limit_usd || 0);
  const marginDisplay = margin === 0 ? 'Market rate' : margin > 0 ? `+${margin}% above market` : `${margin}% below market`;
  const marginColor = margin > 0 ? C.danger : margin < 0 ? C.success : C.g500;
  const rangeDisplay = minLocal > 0 && maxLocal > 0 ? `${sym}${fmt(minLocal)} – ${sym}${fmt(maxLocal)}` : '—';
  const Icon = type === 'sell' ? Bitcoin : type === 'gift' ? Gift : ShoppingCart;
  const price = parseFloat(listing.bitcoin_price) || (btcUsd > 0 ? btcUsd * (1 + margin / 100) : 0);

  return (
    <div onClick={() => navigate(`/listing/${listing.id}`)}
      className="bg-white rounded-2xl border overflow-hidden cursor-pointer hover:shadow-md transition-all"
      style={{ borderColor: `${cfg.color}30` }}>
      <div className="flex items-center gap-2.5 px-3.5 sm:px-4 pt-3 pb-2.5" style={{ backgroundColor: cfg.bg }}>
        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'white' }}>
          <Icon size={16} style={{ color: cfg.color }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-black text-sm" style={{ color: C.forest }}>{cfg.label}</span>
            {listing.gift_card_brand && (
              <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: 'white', color: cfg.color }}>
                {listing.gift_card_brand}
              </span>
            )}
            <span className="text-xs font-bold px-1.5 py-0.5 rounded-full flex items-center gap-1" style={{ backgroundColor: 'white', color: C.success }}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: C.success }} />Live
            </span>
          </div>
          <p className="text-xs mt-0.5 truncate" style={{ color: C.g500 }}>
            {(listing.country_name || listing.country) ? `${listing.country_name || listing.country} · ` : ''}Posted {fmtAge(listing.created_at)}
          </p>
        </div>
      </div>
      <div className="flex items-center justify-between px-3.5 sm:px-4 py-2.5 border-t border-b" style={{ borderColor: C.g100 }}>
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wide" style={{ color: C.g400 }}>Price / BTC</p>
          <p className="font-black text-lg truncate" style={{ color: C.forest }}>{price > 0 ? `$${fmt(price, 0)}` : '—'}</p>
        </div>
        <span className="text-xs font-black px-2.5 py-1 rounded-full flex-shrink-0" style={{ backgroundColor: `${marginColor}12`, color: marginColor }}>
          {marginDisplay}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-px" style={{ backgroundColor: C.g100 }}>
        <div className="bg-white px-3.5 sm:px-4 py-2.5 min-w-0 overflow-hidden">
          <p className="text-xs font-bold uppercase" style={{ color: C.g400, letterSpacing: '0.04em' }}>Limit</p>
          <p className="font-black text-sm mt-0.5 truncate" style={{ color: C.forest }}>{rangeDisplay}</p>
          <p className="text-xs" style={{ color: C.g400 }}>{cur}</p>
        </div>
        <div className="bg-white px-3.5 sm:px-4 py-2.5 min-w-0 overflow-hidden">
          <p className="text-xs font-bold uppercase" style={{ color: C.g400, letterSpacing: '0.04em' }}>Payment</p>
          <p className="font-black text-sm mt-0.5 truncate" style={{ color: C.paid }}>{listing.payment_method || '—'}</p>
          {listing.time_limit && <p className="text-xs" style={{ color: C.g400 }}>{listing.time_limit} min window</p>}
        </div>
      </div>
      <div className="px-3.5 sm:px-4 py-2.5">
        <button onClick={e => { e.stopPropagation(); navigate(`/listing/${listing.id}`); }}
          className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-white font-black text-xs hover:opacity-90 active:scale-[0.98] transition"
          style={{ backgroundColor: cfg.color }}>
          {type === 'buy' ? 'Sell to this offer' : type === 'sell' ? 'Buy from this offer' : 'View Offer'} <ArrowRight size={12} />
        </button>
      </div>
    </div>
  );
}

// ── Section Header ───────────────────────────────────────────────────────────
function SectionHeader({ icon, title, action, actionLabel }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ color: C.green, display: 'flex' }}>{icon}</span>
        <p style={{ fontWeight: 900, fontSize: 14, color: C.forest }}>{title}</p>
      </div>
      {action && <button onClick={action} style={{ fontSize: 12, fontWeight: 700, color: C.green, background: 'none', border: 'none', cursor: 'pointer' }}>{actionLabel} →</button>}
    </div>
  );
}

// ── Main Profile Component ───────────────────────────────────────────────────
export default function Profile({ userId: propUserId }) {
  const { id: urlId } = useParams(); const navigate = useNavigate(); const fileRef = useRef(null);
  const [searchParams] = useSearchParams();
  const autoOpenMigrate = searchParams.get('migrate') === '1';
  const userId = urlId || propUserId;
  const { btcUsd } = useRates();
  const [user, setUser] = useState(null); const [reviews, setReviews] = useState([]);
  const [offers, setOffers] = useState([]); const [offersLoading, setOffersLoading] = useState(true);
  const [offerFilter, setOfferFilter] = useState('all'); const [offerSort, setOfferSort] = useState('newest');
  const [loading, setLoading] = useState(true); const [loadError, setLoadError] = useState(false);
  const [tab, setTab] = useState('overview');
  const [uploading, setUploading] = useState(false); const [own, setOwn] = useState(false);
  const [editing, setEditing] = useState(false); const [saving, setSaving] = useState(false);
  const [badges, setBadges] = useState([]);
  const [form, setForm] = useState({ username: '', full_name: '', bio: '', location: '', website: '' });
  const [visibleCount, setVisibleCount] = useState(5);
  const [isTrusted, setIsTrusted] = useState(false);
  const [trustCount, setTrustCount] = useState(0);
  const [trustLoading, setTrustLoading] = useState(false);

  useEffect(() => {
    if (!userId) {
      let cu = {}; try { cu = JSON.parse(localStorage.getItem('user') || '{}'); } catch { }
      cu.id ? navigate(`/profile/${cu.id}`) : navigate('/login');
      return;
    }
    let cu = {}; try { cu = JSON.parse(localStorage.getItem('user') || '{}'); } catch { }
    setOwn(cu.id === userId);
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (userId) load(); }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

  const load = async () => {
    setLoading(true); setLoadError(false);
    try {
      const tk = localStorage.getItem('token');
      let cu = {}; try { cu = JSON.parse(localStorage.getItem('user') || '{}'); } catch { cu = {}; }
      const isOwn = !!(tk && cu.id && cu.id === userId);

      if (isOwn) {
        const r = await axios.get(`${API_URL}/users/profile`, { headers: { Authorization: `Bearer ${tk}` } });
        const u = r.data.user || r.data;
        if (!u || !u.id) throw new Error('profile_empty');
        setUser(u); setTrustCount(u.trusted_by_count || u.trust_count || 0);
        try { localStorage.setItem('user', JSON.stringify(u)); } catch { }
        setForm({ username: u.username || '', full_name: u.full_name || '', bio: u.bio || '', location: u.location || '', website: u.website || '' });
        setOffersLoading(true);
        const [rvRes, badgeRes, offRes] = await Promise.allSettled([
          axios.get(`${API_URL}/users/${u.id}/reviews`),
          axios.post(`${API_URL}/users/check-badges`, {}, { headers: { Authorization: `Bearer ${tk}` } }),
          axios.get(`${API_URL}/users/${u.id}/listings`),
        ]);
        if (rvRes.status === 'fulfilled') setReviews(rvRes.value.data.reviews || []);
        setBadges(badgeRes.status === 'fulfilled' ? badgeRes.value.data.badges || [] : []);
        setOffers(offRes.status === 'fulfilled' ? offRes.value.data.listings || [] : []);
        setOffersLoading(false);
      } else {
        const r = await axios.get(`${API_URL}/users/${userId}`);
        const u = r.data.user;
        if (!u || !u.id) throw new Error('profile_empty');
        setUser(u); setTrustCount(u.trusted_by_count || u.trust_count || 0);
        const tk2 = localStorage.getItem('token');
        setOffersLoading(true);
        const [rvRes, relRes, offRes] = await Promise.allSettled([
          axios.get(`${API_URL}/users/${u.id}/reviews`),
          tk2 ? axios.get(`${API_URL}/users/${u.id}/relationship`, { headers: { Authorization: `Bearer ${tk2}` } }) : Promise.resolve(null),
          axios.get(`${API_URL}/users/${u.id}/listings`),
        ]);
        setReviews(rvRes.status === 'fulfilled' ? rvRes.value.data.reviews || [] : r.data.reviews || []);
        if (relRes.status === 'fulfilled' && relRes.value?.data) setIsTrusted(relRes.value.data.is_trusted || false);
        setOffers(offRes.status === 'fulfilled' ? offRes.value.data.listings || [] : []);
        setOffersLoading(false);
      }
    } catch (e) {
      console.error('[Profile] load error:', e?.response?.status, e?.response?.data || e?.message);
      const status = e?.response?.status;
      if (status === 404) { setUser(null); setLoadError(false); }
      else if (status === 401) { setLoadError(true); toast.error('Please log in to view this profile.'); }
      else if (e?.message === 'profile_empty') { setLoadError(true); toast.error('This profile could not be loaded. Please try again.'); }
      else { setLoadError(true); toast.error("We couldn't load this profile. Please check your connection and try again."); }
    } finally { setLoading(false); }
  };

  const upload = async (e) => {
    const f = e.target.files[0]; if (!f || !f.type.startsWith('image/')) return;
    if (f.size > 2 * 1024 * 1024) { toast.error('Image must be under 2MB'); return; }
    setUploading(true);
    try {
      const b64 = await new Promise((res, rej) => { const rd = new FileReader(); rd.onload = () => res(rd.result); rd.onerror = rej; rd.readAsDataURL(f); });
      const tk = localStorage.getItem('token');
      const r = await axios.post(`${API_URL}/users/upload-avatar`, { image: b64, userId }, { headers: { Authorization: `Bearer ${tk}` } });
      if (r.data.success) { const url = r.data.avatar_url; if (url) { setUser(p => ({ ...p, avatar_url: url })); const cu = JSON.parse(localStorage.getItem('user') || '{}'); cu.avatar_url = url; localStorage.setItem('user', JSON.stringify(cu)); window.dispatchEvent(new Event('userUpdated')); } toast.success('Photo updated!'); }
    } catch (err) { toast.error('Upload failed'); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  const saveProfile = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      const tk = localStorage.getItem('token');
      const r = await axios.put(`${API_URL}/users/profile`, form, { headers: { Authorization: `Bearer ${tk}` } });
      if (r.data.success) { const u = r.data.user || { ...user, ...form }; setUser(u); const cu = JSON.parse(localStorage.getItem('user') || '{}'); Object.assign(cu, form); localStorage.setItem('user', JSON.stringify(cu)); window.dispatchEvent(new Event('userUpdated')); toast.success('Profile updated!'); setEditing(false); }
    } catch (err) { toast.error('Update failed'); }
    finally { setSaving(false); }
  };

  const handleToggleTrust = async () => {
    const tk = localStorage.getItem('token');
    if (!tk) { navigate('/login'); return; }
    setTrustLoading(true);
    try {
      const r = await axios.post(`${API_URL}/users/${user.id}/trust`, {}, { headers: { Authorization: `Bearer ${tk}` } });
      setIsTrusted(r.data.trusted);
      setTrustCount(r.data.trusted_by_count ?? (r.data.trusted ? trustCount + 1 : Math.max(0, trustCount - 1)));
      toast.success(r.data.trusted ? 'User added to your trusted list' : 'Trust removed');
    } catch (err) { toast.error(err?.response?.data?.error || 'Failed to update trust'); }
    finally { setTrustLoading(false); }
  };

  // ── Loading / Error states ──────────────────────────────────────────────────
  if (loading) return (<div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: C.mist }}><div className="w-12 h-12 border-4 rounded-full animate-spin" style={{ borderColor: C.sage, borderTopColor: 'transparent' }} /></div>);
  if (!loading && loadError) return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: C.mist }}>
      <div className="bg-white rounded-2xl p-8 text-center max-w-sm w-full shadow-sm" style={{ border: `1px solid ${C.g200}` }}>
        <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: '#FFF7ED' }}><AlertTriangle size={30} style={{ color: '#F59E0B' }} /></div>
        <h2 className="font-black text-lg mb-2" style={{ color: C.forest }}>Couldn't Load Profile</h2>
        <p className="text-sm mb-6 leading-relaxed" style={{ color: C.g500 }}>Something went wrong loading this profile. Please check your connection and try again.</p>
        <div className="flex flex-col gap-2">
          <button onClick={() => load()} className="px-5 py-2.5 rounded-xl text-white font-bold text-sm" style={{ backgroundColor: C.green }}>Try Again</button>
          <button onClick={() => navigate('/buy-bitcoin')} className="px-5 py-2.5 rounded-xl font-bold text-sm" style={{ backgroundColor: C.g100, color: C.g700 }}>Go to Marketplace</button>
        </div>
      </div>
    </div>
  );
  if (!loading && !user) return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: C.mist }}>
      <div className="bg-white rounded-2xl p-8 text-center max-w-sm w-full shadow-sm" style={{ border: `1px solid ${C.g200}` }}>
        <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: '#FEF2F2' }}><User size={30} style={{ color: '#EF4444' }} /></div>
        <h2 className="font-black text-lg mb-2" style={{ color: C.forest }}>Profile Not Found</h2>
        <p className="text-sm mb-6 leading-relaxed" style={{ color: C.g500 }}>This profile doesn't exist or may have been removed.</p>
        <button onClick={() => navigate('/buy-bitcoin')} className="px-5 py-2.5 rounded-xl text-white font-bold text-sm" style={{ backgroundColor: C.green }}>Go to Marketplace</button>
      </div>
    </div>
  );

  // ── Computed values ──────────────────────────────────────────────────────────
  const rawCC = (user.country || '').toUpperCase().slice(0, 2);
  const userCC = rawCC;
  const phoneCC = phoneToCC(user.phone) || rawCC;
  const kycCC = rawCC;

  const score = calcTrust(user); const trust = trustLvl(score);
  const tierIdx = getTier(user); const tier = TIERS[tierIdx]; const nextTier = TIERS[tierIdx + 1];
  const emailOk = !!(user.is_email_verified || user.email_verified);
  const phoneOk = !!(user.is_phone_verified || user.phone_verified);
  const kycOk = !!(user.kyc_verified || user.is_id_verified);
  const verifPct = Math.round([emailOk, phoneOk, kycOk].filter(Boolean).length / 3 * 100);
  const earned = BADGE_DEFS.filter(b => badges.some(badge => badge.badge_name === b.label && badge.is_unlocked) || b.check(user));
  const trades = parseInt(user.total_trades || 0); const rating = parseFloat(user.average_rating || 0);
  const posPct = reviews.length ? Math.round(reviews.filter(r => r.rating >= 4).length / reviews.length * 100) : 100;
  const status = trades >= 50 ? 'Active Trader' : trades >= 5 ? 'Growing Trader' : trades >= 1 ? 'New Trader' : 'Unverified';
  const countryName = user.country_name || COUNTRY_NAMES[userCC] || userCC || null;
  const city = user.city || user.last_seen_location?.split('(')[1]?.replace(')', '') || null;

  const TABS = [
    { id: 'overview', label: 'Overview', icon: Users, count: null },
    { id: 'offers', label: 'Offers', icon: Tag, count: offers.length },
    { id: 'verification', label: 'Verification', icon: BadgeCheck, count: verifPct < 100 ? `${verifPct}%` : null },
    { id: 'reputation', label: 'Reviews', icon: Star, count: reviews.length },
    { id: 'badges', label: 'Badges', icon: Award, count: `${earned.length}/${BADGE_DEFS.length}` },
  ];

  const RING_R = 58, RING_C = 2 * Math.PI * RING_R;

  return (
    <div className="min-h-screen" style={{ backgroundColor: C.mist, fontFamily: "'DM Sans',sans-serif", width: '100%', maxWidth: '100vw', overflowX: 'hidden' }}>
      <style>{`
        @media (min-width: 1024px) {
          .profile-desktop-grid {
            display: flow-root !important;
            max-width: 1240px !important;
            margin: 0 auto !important;
            padding: 32px !important;
            box-sizing: border-box !important;
          }
          .profile-left-rail {
            float: left !important;
            clear: left !important;
            width: 300px !important;
            display: flex !important;
            flex-direction: column !important;
            gap: 24px !important;
            box-sizing: border-box !important;
          }
          .profile-left-card {
            float: left !important;
            clear: left !important;
            width: 300px !important;
            background: white !important;
            border-radius: 20px !important;
            box-shadow: 0 2px 12px rgba(0,0,0,0.06) !important;
            padding: 24px !important;
            box-sizing: border-box !important;
          }
          .profile-left-nav-card {
            order: 1 !important;
            background: white !important;
            border-radius: 16px !important;
            box-shadow: 0 2px 12px rgba(0,0,0,0.06) !important;
            overflow: hidden !important;
            margin-top: 0 !important;
            box-sizing: border-box !important;
            border: none !important;
          }
          .profile-left-ref-card {
            order: 2 !important;
            margin-top: 0 !important;
            box-sizing: border-box !important;
            max-width: none !important;
            width: 100% !important;
          }
          .profile-left-ref-card > div {
            background: #FFFBF0 !important;
            border-radius: 16px !important;
            box-shadow: 0 2px 12px rgba(0,0,0,0.06) !important;
            padding: 24px !important;
            max-width: none !important;
            width: 100% !important;
            box-sizing: border-box !important;
          }
          .profile-right-column-item {
            float: right !important;
            clear: right !important;
            width: calc(100% - 324px) !important;
            margin-bottom: 24px !important;
            box-sizing: border-box !important;
          }
          .profile-right-stat-card {
            background: white !important;
            border-radius: 20px !important;
            box-shadow: 0 2px 12px rgba(0,0,0,0.06) !important;
            padding: 24px !important;
            border-top: none !important;
            box-sizing: border-box !important;
          }
          .profile-stat-cols {
            display: grid !important;
            grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
            gap: 24px !important;
            background: transparent !important;
            border: none !important;
          }
          .profile-stat-box {
            border: none !important;
            background: transparent !important;
            padding: 0 !important;
          }
          .profile-target-bar {
            border-top: none !important;
            padding-top: 0 !important;
            padding-bottom: 0 !important;
            justify-content: flex-start !important;
            margin-top: 12px !important;
          }
          .profile-right-content-wrapper {
            display: flow-root !important;
            margin-left: 324px !important;
            width: calc(100% - 324px) !important;
            max-width: none !important;
            padding: 0 !important;
            box-sizing: border-box !important;
          }
          .profile-edit-card {
            background: white !important;
            border-radius: 20px !important;
            box-shadow: 0 2px 12px rgba(0,0,0,0.06) !important;
            padding: 24px !important;
            box-sizing: border-box !important;
            border: none !important;
          }
          footer {
            clear: both !important;
          }
        }
      `}</style>

      <div className="profile-desktop-grid">

        {/* ── PROFILE HERO ─────────────────────────────────────────────────── */}
        <div className="pt-6 pb-0 px-3 sm:px-6 lg:contents" style={{ backgroundColor: C.mist, boxSizing: 'border-box' }}>
          <div className="lg:contents" style={{ maxWidth: 720, width: '100%', margin: '0 auto' }}>
            <div className="rounded-3xl bg-white lg:contents" style={{ boxShadow: '0 1px 3px rgba(15,23,42,0.06),0 12px 32px -12px rgba(15,23,42,0.10)', overflow: 'hidden', width: '100%', boxSizing: 'border-box' }}>

              <div className="profile-left-card" style={{ background: `linear-gradient(180deg,${C.mist} 0%,#FFFFFF 55%)`, paddingTop: 36, paddingBottom: 8 }}>
                <div className="flex flex-col items-center text-center px-5">

                  {/* Avatar + trust ring */}
                  <div className="relative" style={{ width: 128, height: 128, flexShrink: 0 }}>
                    <svg width="128" height="128" viewBox="0 0 128 128" style={{ position: 'absolute', inset: 0, transform: 'rotate(-90deg)' }}>
                      <circle cx="64" cy="64" r={RING_R} fill="none" stroke={C.g100} strokeWidth="4" />
                      <circle cx="64" cy="64" r={RING_R} fill="none" stroke={trust.color} strokeWidth="4" strokeLinecap="round"
                        strokeDasharray={RING_C} strokeDashoffset={RING_C - (RING_C * score / 100)} style={{ transition: 'stroke-dashoffset 0.8s ease' }} />
                    </svg>
                    <div className="rounded-full overflow-hidden absolute" style={{ width: 108, height: 108, top: 10, left: 10, backgroundColor: '#0f172a', border: '3px solid white', boxShadow: '0 4px 14px rgba(15,23,42,0.15)' }}>
                      {user.avatar_url
                        ? <img src={user.avatar_url} alt="avatar" className="w-full h-full object-cover" />
                        : <div className="w-full h-full flex items-center justify-center font-black text-4xl" style={{ color: '#F4A422' }}>{user.username?.charAt(0)?.toUpperCase() || '?'}</div>}
                    </div>
                    {own && (
                      <button onClick={() => fileRef.current?.click()} disabled={uploading}
                        className="absolute rounded-full shadow-md flex items-center justify-center"
                        style={{ bottom: 2, right: 2, width: 32, height: 32, backgroundColor: C.forest, border: '2.5px solid white' }}>
                        {uploading ? <RefreshCw size={13} className="animate-spin" style={{ color: 'white' }} /> : <Camera size={13} style={{ color: 'white' }} />}
                      </button>
                    )}
                    <input ref={fileRef} type="file" accept="image/*" onChange={upload} className="hidden" />
                  </div>

                  {/* Trust pill */}
                  <span className="mt-3 inline-flex items-center gap-1.5" style={{ fontSize: 11, fontWeight: 900, padding: '4px 12px', borderRadius: 99, backgroundColor: trust.bg, color: trust.color }}>
                    <Shield size={11} />{score} · {trust.label}
                  </span>

                  {/* Username */}
                  <h1 className="mt-3" style={{ color: '#111827', fontFamily: "'Syne',sans-serif", fontSize: 'clamp(1.3rem,4.5vw,2.1rem)', fontWeight: 900, letterSpacing: '0.01em', lineHeight: 1.15, wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                    {user.username}
                  </h1>

                  <div className="mt-1.5"><BadgeChip user={user} /></div>

                  {/* ID + Location */}
                  <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 mt-2.5" style={{ fontSize: 12 }}>
                    <span className="font-mono font-bold flex items-center gap-1" style={{ color: C.g500 }}>
                      #{String(user.id || '').slice(0, 8).toUpperCase()}
                      <button onClick={() => { copyToClipboard(user.id || '', 'ID copied!'); }} className="hover:opacity-70"><Copy size={10} /></button>
                    </span>
                    <span style={{ color: C.g300 }}>·</span>
                    <span className="font-bold flex items-center gap-1" style={{ color: C.g500 }}>
                      <MapPin size={11} style={{ flexShrink: 0 }} />
                      {userCC ? isoToFlag(userCC) : ''}{' '}
                      {countryName ? (city ? `${countryName}, ${city}` : countryName) : user.location || '—'}
                    </span>
                  </div>

                  {/* Bio */}
                  {user.bio && <p className="mt-3 max-w-md" style={{ color: C.g600, fontSize: 13, lineHeight: 1.6 }}>{user.bio}</p>}

                  {/* Verification chips */}
                  <div className="flex flex-wrap items-center justify-center gap-1.5 mt-4">
                    {[
                      { ok: emailOk, label: 'Email', flag: null },
                      { ok: phoneOk, label: 'Phone', flag: phoneCC ? isoToFlag(phoneCC) : null },
                      { ok: kycOk, label: 'ID', flag: kycCC ? isoToFlag(kycCC) : null },
                    ].map(({ ok, label, flag }) => (
                      <span key={label} className="inline-flex items-center gap-1" style={{ fontSize: 11, fontWeight: 800, padding: '4px 10px', borderRadius: 99, backgroundColor: ok ? '#ECFDF5' : C.g50, color: ok ? '#059669' : C.g400 }}>
                        {ok ? <CheckCircle size={11} /> : <div style={{ width: 11, height: 11, borderRadius: '50%', border: '2px solid #D1D5DB' }} />}
                        {label}{flag && ok ? ` ${flag}` : ''}
                      </span>
                    ))}
                  </div>

                  {/* Verified P2P migration reputation (Noones / Binance P2P / other) */}
                  {user.p2p_migrated_platform && (
                    <div className="inline-flex items-center gap-1.5 mt-2.5" style={{ fontSize: 11, fontWeight: 800, padding: '5px 12px', borderRadius: 99, backgroundColor: '#FFFBEB', color: '#92400E', border: '1px solid #FDE68A' }}>
                      <BadgeCheck size={12} />
                      Verified {MIGRATION_PLATFORM_LABELS[user.p2p_migrated_platform] || 'P2P'} Trader
                      {user.p2p_migrated_username && ` · @${user.p2p_migrated_username}`}
                      {user.p2p_migrated_feedback && ` · ${user.p2p_migrated_feedback}`}
                    </div>
                  )}

                  {/* Move feedback from another P2P platform — own profile, not yet migrated */}
                  {own && !user.p2p_migrated_platform && (
                    <MigrateFeedbackCard email={user.email} autoOpen={autoOpenMigrate} />
                  )}

                  {/* Actions */}
                  <div className="flex items-center justify-center gap-2 mt-5">
                    {!own && (
                      <button onClick={handleToggleTrust} disabled={trustLoading}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 20px', borderRadius: 99, fontSize: 13, fontWeight: 900, cursor: 'pointer', backgroundColor: isTrusted ? 'white' : C.forest, color: isTrusted ? '#16A34A' : 'white', border: `2px solid ${isTrusted ? '#86EFAC' : C.forest}`, transition: 'all 0.2s', whiteSpace: 'nowrap', opacity: trustLoading ? 0.7 : 1 }}>
                        {trustLoading ? <RefreshCw size={13} style={{ animation: 'spin 0.7s linear infinite' }} /> : isTrusted ? <CheckCircle size={13} /> : <Shield size={13} />}
                        {isTrusted ? 'Trusted ✓' : 'Trust this user'}
                      </button>
                    )}
                    {own && !editing && (
                      <button onClick={() => setEditing(true)}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 20px', borderRadius: 99, backgroundColor: C.forest, color: 'white', fontSize: 13, fontWeight: 900, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                        <Edit2 size={13} />Edit Profile
                      </button>
                    )}
                  </div>

                  <p className="flex items-center gap-1.5 mt-3" style={{ fontSize: 11, color: C.g400 }}>
                    <Clock size={11} />
                    Joined {fmtAge(user.created_at)}
                    {user.created_at && ` · ${new Date(user.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`}
                    {!own && <> · Trusted by {fmt(trustCount)} {trustCount === 1 ? 'user' : 'users'}</>}
                  </p>
                </div>
              </div>

              {/* ── 2×2 Stat grid ── */}
              <div className="grid grid-cols-2 gap-px profile-right-column-item profile-right-stat-card profile-stat-cols" style={{ borderTop: `1px solid ${C.g100}`, backgroundColor: C.g100 }}>
                {[
                  { label: 'Trust Score', value: score, icon: <Shield size={13} />, color: trust.color },
                  { label: 'Rating', value: parseFloat(user.average_rating || 0).toFixed(1), icon: <Star size={13} fill="#D97706" color="#D97706" />, color: '#D97706' },
                  { label: 'Positive', value: fmt(user.positive_feedback || 0), icon: <ThumbsUp size={13} />, color: '#16A34A' },
                  { label: 'Negative', value: fmt(user.negative_feedback || 0), icon: <ThumbsDown size={13} />, color: '#EF4444' },
                ].map(({ label, value, icon, color }) => (
                  <div key={label} className="flex flex-col items-center justify-center gap-1 py-4 profile-stat-box" style={{ backgroundColor: 'white' }}>
                    <span style={{ color, opacity: 0.85 }}>{icon}</span>
                    <span style={{ fontSize: 'clamp(15px,3.6vw,19px)', fontWeight: 900, color: C.g800, lineHeight: 1 }}>{value}</span>
                    <span style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.g400 }}>{label}</span>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-center gap-1.5 py-2.5 profile-right-column-item profile-target-bar" style={{ borderTop: `1px solid ${C.g100}`, fontSize: 11, color: C.g500 }}>
                <Target size={12} style={{ color: C.g400 }} />
                <span><strong style={{ color: C.g700 }}>{fmt(user.total_trades || 0)}</strong> trades completed</span>
              </div>

              {/* ── Edit form ── */}
              {own && editing && (
                <div className="border-t profile-right-column-item profile-edit-card" style={{ borderColor: C.g200, backgroundColor: '#F8FAFC' }}>
                  <div className="px-4 sm:px-6 py-5">
                    <div className="flex items-center justify-between mb-5">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#1B4332,#2D6A4F)' }}>
                          <Edit2 size={14} color="white" />
                        </div>
                        <div>
                          <p className="font-black text-sm leading-none" style={{ color: C.forest }}>Edit Profile</p>
                          <p className="text-[11px] mt-0.5" style={{ color: C.g400 }}>Changes save to your public profile</p>
                        </div>
                      </div>
                      <button type="button" onClick={() => setEditing(false)}
                        className="flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-bold transition hover:bg-red-50"
                        style={{ color: C.g500, border: `1.5px solid ${C.g200}` }}>
                        <X size={11} />Close
                      </button>
                    </div>
                    <form onSubmit={saveProfile} className="space-y-4 max-w-2xl">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider mb-1.5" style={{ color: C.g600 }}>
                            Username {user.username_changed && <Lock size={9} style={{ color: C.g400 }} />}
                          </label>
                          {user.username_changed ? (
                            <div className="flex items-center justify-between px-3 py-2.5 rounded-xl border-2 text-sm font-medium" style={{ borderColor: C.g200, backgroundColor: C.g100, color: C.g500 }}>
                              <span>{form.username}</span><Lock size={12} style={{ color: C.g400 }} />
                            </div>
                          ) : (
                            <input value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} placeholder="Username"
                              className="w-full px-3 py-2.5 rounded-xl text-sm font-bold border-2 focus:outline-none transition"
                              style={{ borderColor: form.username ? C.sage : C.g200, color: C.g800 }} />
                          )}
                          <p className="text-[11px] mt-1 flex items-center gap-1" style={{ color: user.username_changed ? C.g400 : '#B45309' }}>
                            {user.username_changed ? <><Lock size={8} />Permanently locked</> : <><AlertTriangle size={10} style={{ color: 'currentColor' }} />One-time change — choose carefully</>}
                          </p>
                        </div>
                        <div>
                          <label className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider mb-1.5" style={{ color: C.g600 }}>
                            Full Name {kycOk && <Lock size={9} style={{ color: C.g400 }} />}
                          </label>
                          {kycOk ? (
                            <div className="flex items-center justify-between px-3 py-2.5 rounded-xl border-2 text-sm font-medium" style={{ borderColor: C.g200, backgroundColor: C.g100, color: C.g500 }}>
                              <span>{form.full_name}</span><Lock size={12} style={{ color: C.g400 }} />
                            </div>
                          ) : (
                            <input value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} placeholder="Full Name"
                              className="w-full px-3 py-2.5 rounded-xl text-sm border-2 focus:outline-none transition"
                              style={{ borderColor: form.full_name ? C.sage : C.g200, color: C.g800 }} />
                          )}
                          <p className="text-[11px] mt-1 flex items-center gap-1" style={{ color: kycOk ? C.g400 : C.g500 }}>
                            {kycOk ? <><Lock size={8} />Locked after ID verification</> : <><Info size={10} style={{ color: 'currentColor' }} />Locks permanently after ID verification</>}
                          </p>
                        </div>
                      </div>
                      <div>
                        <label className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider mb-1.5" style={{ color: C.g600 }}>
                          <MapPin size={9} /> Location {kycOk && <Lock size={9} style={{ color: C.g400 }} />}
                        </label>
                        {kycOk ? (
                          <div className="flex items-center justify-between px-3 py-2.5 rounded-xl border-2 text-sm font-medium" style={{ borderColor: C.g200, backgroundColor: C.g100, color: C.g500 }}>
                            <span>{form.location || '—'}</span><Lock size={12} style={{ color: C.g400 }} />
                          </div>
                        ) : (
                          <input value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} placeholder="e.g. Accra, Ghana"
                            className="w-full px-3 py-2.5 rounded-xl text-sm border-2 focus:outline-none transition"
                            style={{ borderColor: form.location ? C.sage : C.g200 }} />
                        )}
                        {kycOk && <p className="text-[11px] mt-1 flex items-center gap-1" style={{ color: C.g400 }}><Lock size={8} />Locked after ID verification</p>}
                      </div>
                      <div>
                        <label className="flex items-center justify-between text-[11px] font-black uppercase tracking-wider mb-1.5" style={{ color: C.g600 }}>
                          <span>Bio</span>
                          <span className="font-normal normal-case" style={{ color: (form.bio || '').trim().split(/\s+/).filter(Boolean).length >= 100 ? C.danger : C.g400 }}>
                            {(form.bio || '').trim() === '' ? 0 : (form.bio || '').trim().split(/\s+/).filter(Boolean).length}/100 words
                          </span>
                        </label>
                        <textarea value={form.bio}
                          onChange={e => { const v = e.target.value; const wc = v.trim() === '' ? 0 : v.trim().split(/\s+/).length; if (wc <= 100) setForm({ ...form, bio: v }); }}
                          placeholder="Tell traders about yourself… (max 100 words)" rows={3}
                          className="w-full px-3 py-2.5 rounded-xl text-sm border-2 focus:outline-none resize-none transition"
                          style={{ borderColor: form.bio ? C.sage : C.g200 }} />
                      </div>
                      <div className="flex gap-2 pt-1">
                        <button type="submit" disabled={saving}
                          className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl font-black text-sm text-white transition hover:opacity-90 disabled:opacity-50"
                          style={{ backgroundColor: C.green }}>
                          {saving ? <><RefreshCw size={13} className="animate-spin" />Saving…</> : <><Save size={13} />Save Changes</>}
                        </button>
                        <button type="button" onClick={() => setEditing(false)}
                          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl font-black text-sm border transition hover:bg-gray-100"
                          style={{ borderColor: C.g200, color: C.g600 }}>
                          <X size={13} />Cancel
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Left rail elements column wrapper ── */}
        <div className="profile-left-rail">

          {/* ── REFERRAL CARD (own profile only) ─────────────────────────────── */}
          {own && user && (
            <div className="mx-auto px-3 sm:px-6 mt-3 flex justify-center sm:justify-end profile-left-ref-card" style={{ maxWidth: 720, boxSizing: 'border-box', width: '100%' }}>
              <div className="rounded-2xl w-full sm:w-auto" style={{ backgroundColor: '#FFFBF0', boxShadow: '0 1px 2px rgba(15,23,42,0.04)', padding: 16, maxWidth: 280 }}>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'rgba(244,164,34,0.15)' }}>
                    <Gift size={15} style={{ color: '#F4A422' }} />
                  </div>
                  <p className="font-black text-xs" style={{ color: '#92400E' }}>Refer &amp; earn</p>
                </div>
                <div className="flex items-center gap-3 mb-3">
                  <div>
                    <p className="font-black text-base leading-none" style={{ color: '#1B4332' }}>{user.total_referrals || 0}</p>
                    <p className="text-gray-400 leading-none mt-1" style={{ fontSize: 9 }}>Referrals</p>
                  </div>
                  <div className="w-px h-7" style={{ backgroundColor: '#FDE68A' }} />
                  <div>
                    <p className="font-black text-base leading-none" style={{ color: '#F4A422' }}>₿{(user.referral_earnings_btc || 0).toFixed(4)}</p>
                    <p className="text-gray-400 leading-none mt-1" style={{ fontSize: 9 }}>Earned</p>
                  </div>
                </div>
                <p className="text-[11px] mb-3 leading-snug" style={{ color: '#92400E' }}>
                  Earn <strong>0.1% BTC</strong> on every trade your referrals complete.
                </p>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => { copyToClipboard(`https://praqen.com/ref/${user.referral_code || user.username}`, 'Referral link copied!'); }}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl font-black text-[11px] text-white hover:opacity-90 active:scale-95 transition"
                    style={{ backgroundColor: '#F4A422' }}>
                    <Copy size={11} />Copy link
                  </button>
                  <button onClick={() => { const link = `https://praqen.com/ref/${user.referral_code || user.username}`; if (navigator.share) { navigator.share({ title: 'Join PRAQEN', text: 'Trade Bitcoin safely with me on PRAQEN!', url: link }).catch(() => { }); } else { copyToClipboard(link, 'Link copied!'); } }}
                    className="flex items-center justify-center rounded-xl text-white hover:opacity-90 active:scale-95 transition flex-shrink-0"
                    style={{ backgroundColor: '#1B4332', width: 32, height: 32 }}>
                    <ArrowRight size={13} />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── VERTICAL TAB NAV ─────────────────────────────────────────────── */}
          <div className="mx-auto px-3 sm:px-6 mt-4 profile-left-nav-card" style={{ maxWidth: 720, boxSizing: 'border-box', width: '100%' }}>
            <div className="rounded-2xl bg-white overflow-hidden" style={{ boxShadow: '0 1px 2px rgba(15,23,42,0.05)' }}>
              {TABS.map((t, i) => {
                const Icon = t.icon; const active = tab === t.id;
                return (
                  <button key={t.id} onClick={() => setTab(t.id)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left transition"
                    style={{ borderTop: i > 0 ? `1px solid ${C.g100}` : 'none', backgroundColor: active ? `${C.green}08` : 'transparent', borderLeft: active ? `3px solid ${C.green}` : '3px solid transparent' }}>
                    <Icon size={16} style={{ color: active ? C.green : C.g400, flexShrink: 0 }} />
                    <span className="flex-1 text-sm font-bold" style={{ color: active ? C.forest : C.g600 }}>{t.label}</span>
                    {t.count !== null && t.count !== undefined && (
                      <span style={{ fontSize: 11, fontWeight: 800, color: active ? C.green : C.g400 }}>{t.count}</span>
                    )}
                    <ChevronRight size={14} style={{ color: active ? C.green : C.g300, flexShrink: 0 }} />
                  </button>
                );
              })}
            </div>
          </div>

        </div> {/* End .profile-left-rail */}

        {/* ── TAB CONTENT ──────────────────────────────────────────────────── */}
        <div className="profile-right-content-wrapper" style={{ maxWidth: 900, margin: '0 auto', padding: '20px 12px 40px', boxSizing: 'border-box' }}>

          {/* ── OVERVIEW ── */}
          {tab === 'overview' && (
            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_280px]" style={{ gap: 20, alignItems: 'start' }}>

              {/* Left column */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

                {/* Trust breakdown */}
                <div style={{ background: 'white', borderRadius: 20, padding: 22, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', border: `1.5px solid ${C.g100}` }}>
                  <SectionHeader icon={<Shield size={15} />} title="Trust Score Breakdown" />
                  <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 12 }}>
                    <p style={{ fontWeight: 900, fontSize: 44, color: trust.color, lineHeight: 1 }}>{score}</p>
                    <span style={{ fontSize: 12, fontWeight: 800, padding: '4px 12px', borderRadius: 20, background: trust.bg, color: trust.color }}>{trust.label}</span>
                  </div>
                  <div style={{ height: 10, borderRadius: 99, background: C.g100, marginBottom: 16, overflow: 'hidden' }}>
                    <div style={{ height: '100%', borderRadius: 99, width: `${score}%`, background: `linear-gradient(90deg,${C.green},${trust.color})`, transition: 'width 0.7s' }} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {[
                      { label: 'Email verified', done: emailOk, pts: 10 },
                      { label: 'Phone verified', done: phoneOk, pts: 15 },
                      { label: 'KYC completed', done: kycOk, pts: 15 },
                      { label: 'Trade activity', done: trades > 0, pts: 30 },
                      { label: 'Rating score', done: rating > 0, pts: 20 },
                      { label: 'Account age', done: true, pts: 10 },
                    ].map(({ label, done, pts }) => (
                      <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', borderRadius: 10, background: done ? `${C.success}08` : C.g50 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {done ? <CheckCircle size={12} style={{ color: C.success }} /> : <div style={{ width: 12, height: 12, borderRadius: '50%', border: `2px solid ${C.g300}` }} />}
                          <span style={{ fontSize: 12, fontWeight: 600, color: done ? C.g700 : C.g400 }}>{label}</span>
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 800, color: done ? C.success : C.g300 }}>+{pts} pts</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${C.g100}`, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <CheckCircle size={13} style={{ color: C.success }} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: C.g600 }}>Trusted by <strong style={{ color: C.forest }}>{fmt(trustCount)}</strong> {trustCount === 1 ? 'user' : 'users'}</span>
                  </div>
                </div>

                {/* Trade Limits */}
                <div style={{ background: 'white', borderRadius: 20, padding: 22, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', border: `1.5px solid ${C.g100}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ color: C.green, display: 'flex' }}><Lock size={15} /></span>
                      <p style={{ fontWeight: 900, fontSize: 14, color: C.forest }}>Trade Limits</p>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 800, padding: '4px 12px', borderRadius: 20, color: 'white', background: `linear-gradient(135deg,${tier.color},${tier.color}cc)` }}>{tier.label} Tier</span>
                  </div>
                  <p style={{ fontWeight: 900, fontSize: 36, color: tier.color, lineHeight: 1 }}>${fmt(tier.limit)}</p>
                  <p style={{ fontSize: 12, color: C.g400, marginBottom: 14 }}>Per transaction limit</p>
                  <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
                    {TIERS.map((t, i) => (
                      <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                        <div style={{ height: 8, width: '100%', borderRadius: 99, background: i <= tierIdx ? t.color : C.g200 }} />
                        <span style={{ fontSize: 9, color: i <= tierIdx ? t.color : C.g300, fontWeight: 700 }}>{t.label}</span>
                      </div>
                    ))}
                  </div>
                  {nextTier && own && (
                    <div style={{ padding: 14, borderRadius: 14, background: `${C.gold}08`, border: `1.5px solid ${C.gold}25` }}>
                      <p style={{ fontWeight: 900, fontSize: 12, color: C.forest, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Target size={14} style={{ color: C.forest, flexShrink: 0 }} />
                        Unlock {nextTier.label} — ${fmt(nextTier.limit)}/trade
                      </p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
                        {nextTier.requires.map(req => {
                          const done = req === 'email' ? emailOk : req === 'phone' ? phoneOk : req === 'kyc' ? kycOk : trades >= 50;
                          return (
                            <div key={req} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                              {done ? <CheckCircle size={11} style={{ color: C.success }} /> : <div style={{ width: 11, height: 11, borderRadius: '50%', border: `2px solid ${C.warn}` }} />}
                              <span style={{ color: done ? C.success : C.g600, fontWeight: 600 }}>{req === 'email' ? 'Verify email' : req === 'phone' ? 'Verify phone' : req === 'kyc' ? 'Complete KYC' : 'Complete 50+ trades'}</span>
                            </div>
                          );
                        })}
                      </div>
                      <button onClick={() => navigate('/settings?tab=verification')}
                        style={{ width: '100%', padding: '10px 0', borderRadius: 12, background: `linear-gradient(135deg,${C.green},${C.paid})`, color: 'white', fontWeight: 900, fontSize: 12, border: 'none', cursor: 'pointer' }}>
                        Upgrade Account → Increase Trade Limits
                      </button>
                    </div>
                  )}
                </div>

                {/* Recent Reviews */}
                <div style={{ background: 'white', borderRadius: 20, padding: 22, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', border: `1.5px solid ${C.g100}` }}>
                  <SectionHeader icon={<Star size={15} />} title="Recent Reviews" action={reviews.length > 5 ? () => setTab('reputation') : null} actionLabel="View all" />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {reviews.slice(0, 5).map(r => (
                      <div key={r.id} style={{ display: 'flex', gap: 12, padding: 14, borderRadius: 14, background: C.g50, border: `1px solid ${C.g100}` }}>
                        <div style={{ width: 36, height: 36, borderRadius: 12, background: `linear-gradient(135deg,${C.green},${C.paid})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 14, color: 'white', flexShrink: 0 }}>
                          {r.reviewer?.username?.charAt(0)?.toUpperCase() || '?'}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                            <span style={{ fontWeight: 800, fontSize: 12, color: C.forest }}>{r.reviewer?.username || 'Trader'}</span>
                            <div style={{ display: 'flex', gap: 1 }}>{[1, 2, 3, 4, 5].map(i => <Star key={i} size={9} style={{ fill: i <= r.rating ? '#FBBF24' : '#E5E7EB', color: i <= r.rating ? '#FBBF24' : '#E5E7EB' }} />)}</div>
                            {r.is_verified_trade && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 10, background: `${C.success}15`, color: C.success }}>✓ Verified</span>}
                          </div>
                          {r.comment && <p style={{ fontSize: 12, color: C.g600, lineHeight: 1.5 }}>{r.comment}</p>}
                          <p style={{ fontSize: 11, color: C.g400, marginTop: 4 }}>{fmtAge(r.created_at)}</p>
                        </div>
                      </div>
                    ))}
                    {reviews.length === 0 && (
                      <div style={{ textAlign: 'center', padding: '32px 0' }}>
                        <MessageCircle size={32} style={{ color: C.g300, margin: '0 auto 8px' }} />
                        <p style={{ fontSize: 12, color: C.g400 }}>No reviews yet. Complete trades to get feedback.</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Right sidebar */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

                {/* Badges preview */}
                <div style={{ background: 'white', borderRadius: 20, padding: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', border: `1.5px solid ${C.g100}` }}>
                  <SectionHeader icon={<Award size={15} />} title="Badges" action={() => setTab('badges')} actionLabel="View all" />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <div style={{ flex: 1, height: 6, borderRadius: 99, background: C.g100 }}>
                      <div style={{ height: '100%', borderRadius: 99, width: `${(earned.length / BADGE_DEFS.length) * 100}%`, background: `linear-gradient(90deg,${C.gold},${C.amber})` }} />
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 900, color: C.gold, whiteSpace: 'nowrap' }}>{earned.length}/{BADGE_DEFS.length}</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
                    {BADGE_DEFS.map(b => {
                      const unlocked = badges.some(ba => ba.badge_name === b.label && ba.is_unlocked) || b.check(user);
                      return (
                        <div key={b.id} title={b.label}
                          style={{ aspectRatio: '1', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, cursor: 'pointer', background: unlocked ? `${b.color}15` : 'rgba(0,0,0,0.03)', border: `1.5px solid ${unlocked ? b.color + '40' : C.g100}`, filter: unlocked ? 'none' : 'grayscale(1)', opacity: unlocked ? 1 : 0.3, transition: 'transform 0.2s' }}
                          onMouseOver={e => e.currentTarget.style.transform = 'scale(1.1)'}
                          onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'}>
                          {b.icon}
                        </div>
                      );
                    })}
                  </div>
                  {earned.length === 0 && <p style={{ textAlign: 'center', fontSize: 11, color: C.g400, marginTop: 12 }}>Complete tasks to earn your first badge</p>}
                </div>

                {/* Account status */}
                <div style={{ background: 'white', borderRadius: 20, padding: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', border: `1.5px solid ${C.g100}` }}>
                  <SectionHeader icon={<TrendingUp size={15} />} title="Account Status" />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {[
                      { icon: <Clock size={12} />, label: 'Last Active', value: fmtAge(user.last_seen_at || user.last_login || user.updated_at), color: C.success },
                      { icon: <Target size={12} />, label: 'Trader Status', value: status, color: C.paid },
                      { icon: <MapPin size={12} />, label: 'Country', value: rawCC ? `${isoToFlag(rawCC)} ${COUNTRY_NAMES[rawCC] || rawCC}` : '—', color: C.green },
                      { icon: <Globe size={12} />, label: 'Language', value: 'English', color: C.g500 },
                      { icon: <Smartphone size={12} />, label: 'Device', value: 'Mobile & Web', color: C.purple },
                    ].map(({ icon, label, value, color }) => (
                      <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 0', borderBottom: `1px solid ${C.g50}` }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: C.g400 }}>{icon}<span style={{ fontSize: 11, fontWeight: 600, color: C.g500 }}>{label}</span></div>
                        <span style={{ fontSize: 11, fontWeight: 700, color }}>{value}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Quick actions */}
                {own && (
                  <div style={{ background: `linear-gradient(135deg,${C.forest},${C.green})`, borderRadius: 20, padding: 20, color: 'white' }}>
                    <p style={{ fontWeight: 900, fontSize: 13, marginBottom: 14 }}>Quick Actions</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {[
                        { label: 'Create New Offer', icon: <Plus size={12} />, onClick: () => navigate('/create-offer') },
                        { label: 'View My Trades', icon: <ChevronRight size={12} />, onClick: () => navigate('/my-trades') },
                        { label: 'Settings & Verification', icon: <ChevronRight size={12} />, onClick: () => navigate('/settings') },
                      ].map(({ label, icon, onClick }) => (
                        <button key={label} onClick={onClick}
                          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: 12, background: 'rgba(255,255,255,0.12)', color: 'white', fontWeight: 700, fontSize: 12, border: 'none', cursor: 'pointer', textAlign: 'left', transition: 'background 0.2s' }}
                          onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'}
                          onMouseOut={e => e.currentTarget.style.background = 'rgba(255,255,255,0.12)'}>
                          {label}{icon}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── OFFERS TAB ── */}
          {tab === 'offers' && (() => {
            const buyCount = offers.filter(o => offerTypeOf(o) === 'buy').length;
            const sellCount = offers.filter(o => offerTypeOf(o) === 'sell').length;
            const giftCount = offers.filter(o => offerTypeOf(o) === 'gift').length;
            const visible = offers
              .filter(o => offerFilter === 'all' ? true : offerTypeOf(o) === offerFilter)
              .sort((a, b) => offerSort === 'rate' ? parseFloat(a.margin || 0) - parseFloat(b.margin || 0) : new Date(b.created_at) - new Date(a.created_at));
            return (
              <div style={{ maxWidth: 700 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
                  <div>
                    <p style={{ fontWeight: 900, fontSize: 15, color: C.forest }}>{own ? 'Your Active Offers' : `${user.username}'s Active Offers`}</p>
                    <p style={{ fontSize: 12, color: C.g500, marginTop: 3 }}>{own ? 'Live offers anyone can trade with you on.' : 'Anyone can pick an offer to start a trade.'}</p>
                  </div>
                  {own && (
                    <button onClick={() => navigate('/create-offer')}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 18px', borderRadius: 12, background: `linear-gradient(135deg,${C.green},${C.paid})`, color: 'white', fontWeight: 900, fontSize: 13, border: 'none', cursor: 'pointer' }}>
                      <Plus size={13} />Create Offer
                    </button>
                  )}
                </div>

                {!offersLoading && offers.length > 0 && (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 16 }}>
                      {[
                        { label: 'Total', value: offers.length, color: C.forest },
                        { label: 'Buying', value: buyCount, color: C.paid },
                        { label: 'Selling', value: sellCount, color: C.green },
                        { label: 'Gift', value: giftCount, color: C.purple },
                      ].map(({ label, value, color }) => (
                        <div key={label} style={{ background: 'white', borderRadius: 14, padding: '12px 14px', textAlign: 'center', border: `1.5px solid ${C.g100}`, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                          <p style={{ fontWeight: 900, fontSize: 20, color, lineHeight: 1 }}>{value}</p>
                          <p style={{ fontSize: 11, fontWeight: 600, color: C.g500, marginTop: 4 }}>{label}</p>
                        </div>
                      ))}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Filter size={11} style={{ color: C.g400 }} />
                        {[['all', 'All'], ['buy', 'Buying'], ['sell', 'Selling'], ['gift', 'Gift']].map(([val, lbl]) => (
                          <button key={val} onClick={() => setOfferFilter(val)}
                            style={{ padding: '6px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700, cursor: 'pointer', border: 'none', background: offerFilter === val ? C.forest : C.g100, color: offerFilter === val ? 'white' : C.g600, transition: 'all 0.2s' }}>
                            {lbl}
                          </button>
                        ))}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <ArrowUpDown size={11} style={{ color: C.g400 }} />
                        {[['newest', 'Newest'], ['rate', 'Best Rate']].map(([val, lbl]) => (
                          <button key={val} onClick={() => setOfferSort(val)}
                            style={{ padding: '6px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700, cursor: 'pointer', border: 'none', background: offerSort === val ? C.forest : C.g100, color: offerSort === val ? 'white' : C.g600, transition: 'all 0.2s' }}>
                            {lbl}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                {offersLoading ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {[1, 2, 3].map(i => (<div key={i} style={{ background: 'white', borderRadius: 16, padding: 16, border: `1.5px solid ${C.g100}` }}><div style={{ height: 14, borderRadius: 8, width: '40%', background: C.g200, marginBottom: 10 }} /><div style={{ height: 10, borderRadius: 6, width: '65%', background: C.g100 }} /></div>))}
                  </div>
                ) : offers.length === 0 ? (
                  <div style={{ background: 'white', borderRadius: 20, padding: 40, textAlign: 'center', border: `1.5px solid ${C.g100}` }}>
                    <Tag size={32} style={{ color: C.g300, margin: '0 auto 12px' }} />
                    <p style={{ fontWeight: 800, fontSize: 14, color: C.g700, marginBottom: 6 }}>{own ? "You don't have any active offers" : `${user.username} has no active offers`}</p>
                    <p style={{ fontSize: 12, color: C.g400, marginBottom: 20 }}>{own ? 'Create an offer so other traders can find and trade with you.' : 'Check back later, or browse the marketplace.'}</p>
                    <button onClick={() => navigate(own ? '/create-offer' : '/buy-bitcoin')}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '11px 22px', borderRadius: 12, background: `linear-gradient(135deg,${C.green},${C.paid})`, color: 'white', fontWeight: 900, fontSize: 13, border: 'none', cursor: 'pointer' }}>
                      {own ? <><Plus size={14} />Create Your First Offer</> : <><Bitcoin size={14} />Browse Marketplace</>}
                    </button>
                  </div>
                ) : visible.length === 0 ? (
                  <div style={{ background: 'white', borderRadius: 16, padding: 24, textAlign: 'center', border: `1.5px solid ${C.g100}` }}>
                    <p style={{ fontWeight: 700, fontSize: 13, color: C.g600 }}>No offers match this filter</p>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 14 }}>
                    {visible.map(o => <ProfileOfferCard key={o.id} listing={o} navigate={navigate} btcUsd={btcUsd} />)}
                  </div>
                )}
              </div>
            );
          })()}

          {/* ── VERIFICATION TAB ── */}
          {tab === 'verification' && (
            <div style={{ maxWidth: 640, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ borderRadius: 20, padding: 24, background: verifPct === 100 ? `linear-gradient(135deg,${C.success},${C.mint})` : `linear-gradient(135deg,${C.forest},${C.green})`, color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <p style={{ fontWeight: 900, fontSize: 18, fontFamily: "'Syne',sans-serif" }}>{verifPct === 100 ? <span className="inline-flex items-center gap-1.5"><CheckCircle size={16} /> Fully Verified!</span> : 'Complete Verification'}</p>
                  <p style={{ opacity: 0.7, fontSize: 12, marginTop: 4 }}>{[emailOk, phoneOk, kycOk].filter(Boolean).length}/3 steps — unlock higher trade limits</p>
                </div>
                <p style={{ fontWeight: 900, fontSize: 36, lineHeight: 1 }}>{verifPct}%</p>
              </div>

              {[
                {
                  ok: emailOk, icon: <Mail size={18} />, title: 'Email',
                  status: emailOk ? <span className="inline-flex items-center gap-1"><CheckCircle size={11} /> Verified</span> : <span className="inline-flex items-center gap-1"><XCircle size={11} /> Not Verified</span>, statusColor: emailOk ? C.success : C.danger,
                  detail: emailOk ? `${user.email || ''} — required to create offers & trade` : 'Go to Settings → Verification to verify your email.',
                  lockIcon: emailOk && <Lock size={14} style={{ color: C.success }} />
                },
                {
                  ok: phoneOk, icon: <Phone size={18} />, title: 'Phone Number',
                  status: phoneOk ? <span className="inline-flex items-center gap-1"><CheckCircle size={11} /> Verified</span> : user.phone ? <span className="inline-flex items-center gap-1"><Clock size={11} /> Under Review</span> : <span className="inline-flex items-center gap-1"><AlertTriangle size={11} /> Not Added</span>,
                  statusColor: phoneOk ? C.success : user.phone ? C.warn : C.g400,
                  detail: phoneOk ? `${user.phone || ''} — verified` : user.phone ? `${user.phone} — waiting for approval` : 'Go to Settings → Verification to add your phone.',
                  lockIcon: phoneOk ? <Lock size={14} style={{ color: C.success }} /> : user.phone ? <Clock size={14} style={{ color: C.warn }} /> : null
                },
                {
                  ok: kycOk, icon: <FileText size={18} />, title: 'Identity (KYC)',
                  status: kycOk ? <span className="inline-flex items-center gap-1"><CheckCircle size={11} /> Verified</span> : user.kyc_status === 'pending' ? <span className="inline-flex items-center gap-1"><Clock size={11} /> Under Review</span> : 'Not Submitted',
                  statusColor: kycOk ? C.success : user.kyc_status === 'pending' ? C.warn : C.g400,
                  detail: kycOk ? 'ID verified — Advanced & VIP limits unlocked' : user.kyc_status === 'pending' ? 'Documents submitted — waiting for approval' : 'Go to Settings → Verification to upload your ID.',
                  lockIcon: kycOk ? <Lock size={14} style={{ color: C.success }} /> : user.kyc_status === 'pending' ? <Clock size={14} style={{ color: C.warn }} /> : null
                },
              ].map(({ ok, icon, title, status, statusColor, detail, lockIcon }) => (
                <div key={title} style={{ background: 'white', borderRadius: 18, padding: 18, border: `2px solid ${ok ? C.success : C.g200}`, boxShadow: '0 2px 10px rgba(0,0,0,0.05)', display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 14, background: ok ? `${C.success}15` : `${C.green}10`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: ok ? C.success : C.green, flexShrink: 0 }}>
                    {ok ? <CheckCircle size={18} style={{ color: C.success }} /> : icon}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                      <p style={{ fontWeight: 900, fontSize: 14, color: C.forest }}>{title}</p>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: `${statusColor}15`, color: statusColor }}>{status}</span>
                    </div>
                    <p style={{ fontSize: 12, color: C.g500, lineHeight: 1.5 }}>{detail}</p>
                  </div>
                  {lockIcon}
                </div>
              ))}

              <div style={{ background: 'white', borderRadius: 18, padding: 20, border: `1.5px solid ${C.g100}`, boxShadow: '0 2px 10px rgba(0,0,0,0.05)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                  <Shield size={14} style={{ color: C.green }} />
                  <p style={{ fontWeight: 900, fontSize: 14, color: C.forest }}>Account Security</p>
                </div>
                {[
                  { icon: <MapPin size={12} />, label: 'Registered Country', value: rawCC ? `${isoToFlag(rawCC)} ${user.country_name || COUNTRY_NAMES[rawCC] || rawCC}` : '—', color: C.paid },
                  { icon: <Clock size={12} />, label: 'Last Active', value: fmtAge(user.last_seen_at || user.last_login || user.updated_at), color: C.success },
                  { icon: <Smartphone size={12} />, label: 'Device Access', value: 'Mobile & Web Browser', color: C.green },
                  { icon: <Globe size={12} />, label: 'Language', value: 'English', color: C.g500 },
                ].map(({ icon, label, value, color }) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 0', borderBottom: `1px solid ${C.g100}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: C.g400 }}>{icon}<span style={{ fontSize: 12, color: C.g500 }}>{label}</span></div>
                    <span style={{ fontSize: 12, fontWeight: 700, color }}>{value}</span>
                  </div>
                ))}
              </div>

              {!kycOk && own && (
                <button onClick={() => navigate('/settings?tab=verification')}
                  style={{ width: '100%', padding: '14px 0', borderRadius: 14, background: `linear-gradient(135deg,${C.green},${C.paid})`, color: 'white', fontWeight: 900, fontSize: 14, border: 'none', cursor: 'pointer' }}>
                  Go to Settings → Complete Verification
                </button>
              )}
            </div>
          )}

          {/* ── REPUTATION TAB ── */}
          {tab === 'reputation' && (
            <div style={{ maxWidth: 640, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ background: 'white', borderRadius: 20, padding: 22, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', border: `1.5px solid ${C.g100}` }}>
                <p style={{ fontWeight: 900, fontSize: 15, color: C.forest, marginBottom: 16 }}>Reputation Summary</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 20 }}>
                  {[
                    { label: 'Avg Rating', value: rating.toFixed(1), sub: 'out of 5.0', color: C.amber },
                    { label: 'Positive', value: `${posPct}%`, sub: `${reviews.filter(r => r.rating >= 4).length} reviews`, color: C.success },
                    { label: 'Negative', value: `${100 - posPct}%`, sub: `${reviews.filter(r => r.rating < 4).length} reviews`, color: C.danger },
                  ].map(({ label, value, sub, color }) => (
                    <div key={label} style={{ textAlign: 'center', padding: 16, borderRadius: 16, background: C.g50, border: `1.5px solid ${C.g100}` }}>
                      <p style={{ fontWeight: 900, fontSize: 24, color, lineHeight: 1 }}>{value}</p>
                      <p style={{ fontWeight: 700, fontSize: 11, color: C.g500, marginTop: 4 }}>{label}</p>
                      <p style={{ fontSize: 11, color: C.g400 }}>{sub}</p>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', justifyContent: 'center', gap: 3, marginBottom: 16 }}>
                  {[1, 2, 3, 4, 5].map(i => <Star key={i} size={20} style={{ fill: i <= Math.round(rating) ? '#FBBF24' : '#E5E7EB', color: i <= Math.round(rating) ? '#FBBF24' : '#E5E7EB' }} />)}
                </div>
                {[5, 4, 3, 2, 1].map(n => {
                  const cnt = reviews.filter(r => r.rating === n).length;
                  const pct = reviews.length ? Math.round(cnt / reviews.length * 100) : 0;
                  return (
                    <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: C.g500, width: 14, textAlign: 'right' }}>{n}</span>
                      <Star size={10} style={{ fill: '#FBBF24', color: '#FBBF24', flexShrink: 0 }} />
                      <div style={{ flex: 1, height: 8, borderRadius: 99, background: C.g200, overflow: 'hidden' }}>
                        <div style={{ height: '100%', borderRadius: 99, width: `${pct}%`, background: C.amber }} />
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 600, color: C.g400, width: 20, textAlign: 'right' }}>{cnt}</span>
                    </div>
                  );
                })}
              </div>
              <div style={{ background: 'white', borderRadius: 20, overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', border: `1.5px solid ${C.g100}` }}>
                <div style={{ padding: '16px 20px', borderBottom: `1px solid ${C.g100}` }}>
                  <p style={{ fontWeight: 900, fontSize: 14, color: C.forest }}>All Reviews ({reviews.length})</p>
                </div>
                {reviews.length === 0 ? (
                  <div style={{ padding: 40, textAlign: 'center' }}>
                    <MessageCircle size={32} style={{ color: C.g300, margin: '0 auto 8px' }} />
                    <p style={{ fontSize: 12, color: C.g400 }}>No reviews yet. Complete trades to get feedback.</p>
                  </div>
                ) : (
                  <>
                    {reviews.slice(0, visibleCount).map(r => (
                      <div key={r.id} style={{ display: 'flex', gap: 12, padding: '14px 20px', borderBottom: `1px solid ${C.g50}` }}>
                        <div style={{ width: 34, height: 34, borderRadius: 10, background: `linear-gradient(135deg,${C.green},${C.paid})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 13, color: 'white', flexShrink: 0 }}>
                          {r.reviewer?.username?.charAt(0)?.toUpperCase() || '?'}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 3 }}>
                            <span style={{ fontWeight: 800, fontSize: 12, color: C.forest }}>{r.reviewer?.username || 'Trader'}</span>
                            <div style={{ display: 'flex', gap: 1 }}>{[1, 2, 3, 4, 5].map(i => <Star key={i} size={9} style={{ fill: i <= r.rating ? '#FBBF24' : '#E5E7EB', color: i <= r.rating ? '#FBBF24' : '#E5E7EB' }} />)}</div>
                            {r.is_verified_trade && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 10, background: `${C.success}15`, color: C.success }}>✓ Verified Trade</span>}
                          </div>
                          {r.comment && <p style={{ fontSize: 12, color: C.g600, lineHeight: 1.5 }}>{r.comment}</p>}
                          <p style={{ fontSize: 11, color: C.g400, marginTop: 4 }}>{fmtAge(r.created_at)}</p>
                        </div>
                      </div>
                    ))}
                    {visibleCount < reviews.length && (
                      <div style={{ padding: '14px 20px', borderTop: `1px solid ${C.g100}` }}>
                        <button onClick={() => setVisibleCount(v => v + 5)}
                          style={{ width: '100%', padding: '10px 0', borderRadius: 12, fontSize: 12, fontWeight: 800, color: C.g600, background: C.g50, border: `1.5px solid ${C.g200}`, cursor: 'pointer' }}>
                          Load More · {reviews.length - visibleCount} remaining
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {/* ── BADGES TAB ── */}
          {tab === 'badges' && (
            <div style={{ maxWidth: 720, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ borderRadius: 20, padding: 24, background: `linear-gradient(135deg,${C.forest},${C.green})`, position: 'relative', overflow: 'hidden', color: 'white' }}>
                <div style={{ position: 'absolute', top: -30, right: -30, width: 120, height: 120, borderRadius: '50%', background: C.gold, opacity: 0.1, filter: 'blur(30px)' }} />
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
                  <div>
                    <p style={{ fontWeight: 900, fontSize: 20, fontFamily: "'Syne',sans-serif", display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Medal size={22} style={{ flexShrink: 0 }} />
                      Badge Collection
                    </p>
                    <p style={{ opacity: 0.6, fontSize: 12, marginTop: 4 }}>
                      {earned.length === 0 ? 'Complete tasks below to start earning badges' :
                        earned.length === BADGE_DEFS.length ? <span className="inline-flex items-center gap-1"><PartyPopper size={12} /> All badges earned — legendary status!</span> :
                          `${earned.length} earned · ${BADGE_DEFS.length - earned.length} more to unlock`}
                    </p>
                  </div>
                  <p style={{ fontWeight: 900, fontSize: 40, lineHeight: 1 }}>{earned.length}<span style={{ opacity: 0.3, fontSize: 24 }}>/{BADGE_DEFS.length}</span></p>
                </div>
                <div style={{ height: 10, borderRadius: 99, background: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', borderRadius: 99, width: `${(earned.length / BADGE_DEFS.length) * 100}%`, background: `linear-gradient(90deg,${C.gold},${C.amber})`, transition: 'width 0.7s' }} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 14 }}>
                {BADGE_DEFS.map(b => {
                  const has = badges.some(ba => ba.badge_name === b.label && ba.is_unlocked) || b.check(user);
                  const daysOld = user?.created_at ? Math.floor((Date.now() - new Date(user.created_at)) / (1000 * 60 * 60 * 24)) : 0;
                  const daysLeft = Math.max(0, 365 - daysOld);
                  return (
                    <div key={b.id} style={{ borderRadius: 18, border: `2px solid ${has ? b.color : C.g200}`, background: has ? b.bg : '#FAFAFA', boxShadow: has ? `0 4px 24px ${b.color}20` : 'none', overflow: 'hidden', transition: 'all 0.3s' }}>
                      <div style={{ padding: 18 }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                          <div style={{ width: 52, height: 52, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, flexShrink: 0, background: has ? `${b.color}20` : 'rgba(0,0,0,0.05)', filter: has ? 'none' : 'grayscale(1)', opacity: has ? 1 : 0.4 }}>
                            {b.icon}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                              <p style={{ fontWeight: 900, fontSize: 13, color: has ? b.color : C.g500 }}>{b.label}</p>
                              {has ? <span style={{ fontSize: 10, fontWeight: 900, padding: '2px 8px', borderRadius: 20, color: 'white', background: b.color }}>✓ EARNED</span>
                                : <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, color: C.g400, background: C.g100, display: 'inline-flex', alignItems: 'center', gap: 4 }}><Lock size={10} /> LOCKED</span>}
                            </div>
                            <p style={{ fontSize: 12, lineHeight: 1.5, color: has ? C.g600 : C.g400 }}>{b.desc}</p>
                          </div>
                        </div>
                        {!has && b.id === 'top_trader' && (
                          <div style={{ marginTop: 12, padding: 10, borderRadius: 12, background: 'rgba(244,164,34,0.08)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 6 }}><span style={{ fontWeight: 700, color: C.g500 }}>Progress</span><span style={{ fontWeight: 900, color: b.color }}>{Math.min(100, trades)}/100 trades</span></div>
                            <div style={{ height: 8, borderRadius: 99, background: C.g200, overflow: 'hidden' }}><div style={{ height: '100%', borderRadius: 99, width: `${Math.min(100, trades)}%`, background: b.color }} /></div>
                            <p style={{ fontSize: 11, marginTop: 5, color: C.g400 }}>{Math.max(0, 100 - trades)} more trades needed</p>
                          </div>
                        )}
                        {!has && b.id === 'high_volume' && (
                          <div style={{ marginTop: 12, padding: 10, borderRadius: 12, background: 'rgba(16,185,129,0.08)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 6 }}><span style={{ fontWeight: 700, color: C.g500 }}>Volume traded</span><span style={{ fontWeight: 900, color: b.color }}>${fmt(Math.min(trades * 100, 10000))}/$10,000</span></div>
                            <div style={{ height: 8, borderRadius: 99, background: C.g200, overflow: 'hidden' }}><div style={{ height: '100%', borderRadius: 99, width: `${Math.min(100, (trades * 100 / 10000) * 100)}%`, background: b.color }} /></div>
                            <p style={{ fontSize: 11, marginTop: 5, color: C.g400 }}>${fmt(Math.max(0, 10000 - trades * 100))} more volume needed</p>
                          </div>
                        )}
                        {!has && b.id === 'trusted_seller' && (
                          <div style={{ marginTop: 12, padding: 10, borderRadius: 12, background: 'rgba(239,68,68,0.06)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 6 }}><span style={{ fontWeight: 700, color: C.g500 }}>Trades toward goal</span><span style={{ fontWeight: 900, color: b.color }}>{Math.min(20, trades)}/20</span></div>
                            <div style={{ height: 8, borderRadius: 99, background: C.g200, overflow: 'hidden' }}><div style={{ height: '100%', borderRadius: 99, width: `${Math.min(100, (trades / 20) * 100)}%`, background: b.color }} /></div>
                            <p style={{ fontSize: 11, marginTop: 5, color: C.g400 }}>Also requires 98%+ positive feedback</p>
                          </div>
                        )}
                        {!has && b.id === 'veteran' && (
                          <div style={{ marginTop: 12, padding: 10, borderRadius: 12, background: 'rgba(109,40,217,0.06)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 6 }}><span style={{ fontWeight: 700, color: C.g500 }}>Account age</span><span style={{ fontWeight: 900, color: b.color }}>{Math.min(365, daysOld)}/365 days</span></div>
                            <div style={{ height: 8, borderRadius: 99, background: C.g200, overflow: 'hidden' }}><div style={{ height: '100%', borderRadius: 99, width: `${Math.min(100, (daysOld / 365) * 100)}%`, background: b.color }} /></div>
                            <p style={{ fontSize: 11, marginTop: 5, color: C.g400 }}>{daysLeft > 0 ? `${daysLeft} more days to go` : 'Unlock is imminent!'}</p>
                          </div>
                        )}
                      </div>
                      <div style={{ padding: '12px 18px', borderTop: `1px solid ${has ? `${b.color}25` : C.g100}`, background: has ? `${b.color}06` : 'rgba(0,0,0,0.02)', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                        {has ? (
                          <><CheckCircle size={12} style={{ color: b.color, flexShrink: 0, marginTop: 1 }} /><p style={{ fontSize: 11, fontWeight: 700, color: b.color }}>Achievement unlocked · Badge visible on your public profile</p></>
                        ) : (
                          <>
                            <ArrowRight size={12} style={{ color: C.g400, flexShrink: 0, marginTop: 1 }} />
                            <div>
                              <p style={{ fontSize: 10, fontWeight: 900, color: C.g500, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>HOW TO EARN</p>
                              <p style={{ fontSize: 11, lineHeight: 1.5, color: C.g400 }}>
                                {b.id === 'verified_identity' && <span>Go to <button onClick={() => navigate('/settings?tab=verification')} style={{ color: C.green, fontWeight: 700, textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 11 }}>Settings → Verification</button> and complete KYC.</span>}
                                {b.id === 'top_trader' && `Complete ${Math.max(0, 100 - trades)} more successful trades to reach 100 total.`}
                                {b.id === 'high_volume' && `Trade $${fmt(Math.max(0, 10000 - trades * 100))} more in total volume.`}
                                {b.id === 'fast_responder' && 'Consistently respond to trade requests within 5 minutes.'}
                                {b.id === 'trusted_seller' && 'Reach 20 completed trades with 98%+ positive feedback.'}
                                {b.id === 'veteran' && (daysLeft > 0 ? `Account must be 1+ year old. ${daysLeft} day${daysLeft !== 1 ? 's' : ''} remaining.` : 'Your veteran badge is nearly ready!')}
                              </p>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {earned.length < BADGE_DEFS.length && own && (
                <div style={{ borderRadius: 18, padding: 20, border: `1.5px solid ${C.gold}40`, background: 'linear-gradient(135deg,#FFFBEB,#FFF7ED)' }}>
                  <div style={{ display: 'flex', gap: 12 }}>
                    <span style={{ fontSize: 22, flexShrink: 0 }}><Lightbulb size={22} style={{ color: '#F59E0B' }} /></span>
                    <div>
                      <p style={{ fontWeight: 900, fontSize: 13, color: '#92400E', marginBottom: 10 }}>Tips to earn badges faster</p>
                      {[
                        [<CheckCircle size={13} className="inline-block" />, 'Start with Verification — completing KYC unlocks Verified Identity badge immediately.'],
                        [<TrendingUp size={13} className="inline-block" />, 'Every completed trade counts toward Top Trader (100 trades) and High Volume ($10k).'],
                        [<Zap size={13} className="inline-block" />, 'Reply to trade requests in under 5 minutes consistently to earn Fast Responder.'],
                        [<Lock size={13} className="inline-block" />, 'Complete 20+ trades with 98%+ positive feedback to unlock Trusted Seller.'],
                        [<Award size={13} className="inline-block" />, 'Veteran badge is time-based — it unlocks automatically after your account turns 1 year old.'],
                      ].map(([icon, tip], i) => (
                        <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 6 }}>
                          <span style={{ fontSize: 13, flexShrink: 0 }}>{icon}</span>
                          <p style={{ fontSize: 12, lineHeight: 1.5, color: '#B45309' }}>{tip}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {earned.length === BADGE_DEFS.length && (
                <div style={{ borderRadius: 20, padding: 32, textAlign: 'center', background: `linear-gradient(135deg,${C.forest},${C.gold})`, position: 'relative', overflow: 'hidden' }}>
                  <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(circle at 2px 2px,rgba(255,255,255,0.06) 1px,transparent 0)', backgroundSize: '20px 20px' }} />
                  <p style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}><PartyPopper size={48} style={{ color: '#FBBF24' }} /></p>
                  <p style={{ fontWeight: 900, fontSize: 24, color: 'white', fontFamily: "'Syne',sans-serif", marginBottom: 6 }}>Legendary Status!</p>
                  <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13 }}>You've earned all 6 badges. You're among the most trusted traders on PRAQEN.</p>
                </div>
              )}
            </div>
          )}
        </div>

      </div> {/* End .profile-desktop-grid */}

      {/* ── FOOTER ── */}
      <footer style={{ background: `linear-gradient(135deg,${C.forest},${C.green})`, marginTop: 32 }}>
        <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 20px', boxSizing: 'border-box' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <div style={{ width: 30, height: 30, borderRadius: 10, background: C.gold, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 15, color: C.forest }}>P</div>
            <span style={{ color: 'white', fontWeight: 900, fontSize: 15, fontFamily: "'Syne',sans-serif" }}>PRAQEN</span>
          </div>
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, marginBottom: 16 }}>The world's most trusted P2P Bitcoin platform.</p>
          <div style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
            <a href="/blog" style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>Blog</a>
            <a href="/privacy" style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>Privacy</a>
            <a href="/terms" style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>Terms</a>
          </div>
          <p style={{ color: 'rgba(255,255,255,0.25)', fontSize: 11, textAlign: 'center' }}>© {new Date().getFullYear()} PRAQEN. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}