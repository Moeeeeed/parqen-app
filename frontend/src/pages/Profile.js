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
import { BadgeChip, TRUST_MAP, BADGE_ORDER, BADGE_THRESHOLDS, renderBadgeIcon, SafetyBadge, SafetyBanner } from '../lib/badge';
import { copyToClipboard } from '../utils/clipboard';
import ProfileMobile from './ProfileMobile';
import ProfileDesktop from './ProfileDesktop';

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
// reputation yet. Collects exactly what admin needs to verify the claim:
// account email (from the PRAQEN account, read-only), full name, feedback
// count, and a screenshot showing that name + count. Checks on mount whether
// this user already has a submission on file so a pending/rejected request
// survives a page reload instead of the form re-showing empty every time —
// and once submitted, the form locks (read-only "waiting for approval") until
// admin reviews it.
function MigrateFeedbackCard({ email, autoOpen }) {
  const [open, setOpen] = useState(!!autoOpen);
  const [platform, setPlatform] = useState(null);
  const [fullName, setFullName] = useState('');
  const [feedbackCount, setFeedbackCount] = useState('');
  const [screenshotFile, setScreenshotFile] = useState(null);
  const [screenshotPreview, setScreenshotPreview] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [checkingStatus, setCheckingStatus] = useState(true);
  const [existing, setExisting] = useState(null); // { status, platform, full_name, feedback_count, admin_notes } | null

  useEffect(() => {
    const tk = localStorage.getItem('token');
    if (!tk) { setCheckingStatus(false); return; }
    axios.get(`${API_URL}/p2p-migration/my-status`, { headers: { Authorization: `Bearer ${tk}` } })
      .then(r => setExisting(r.data?.submission || null))
      .catch(() => {})
      .finally(() => setCheckingStatus(false));
  }, []);

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
    if (!fullName.trim()) { setError('Enter your full name as it appears on your P2P profile'); return; }
    if (!feedbackCount.trim()) { setError('Enter your feedback count'); return; }
    if (!screenshotFile) { setError('Please upload a screenshot of your P2P profile'); return; }
    setSubmitting(true); setError('');
    try {
      const screenshot = await compressScreenshot(screenshotFile);
      const tk = localStorage.getItem('token');
      await axios.post(`${API_URL}/p2p-migration/submit`,
        { email, platform, screenshot, fullName: fullName.trim(), feedbackCount: feedbackCount.trim() },
        tk ? { headers: { Authorization: `Bearer ${tk}` } } : {});
      setSubmitted(true);
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong. Please try again.');
    } finally { setSubmitting(false); }
  };

  if (checkingStatus) return null;

  // Locked "waiting for approval" view — either just submitted this session,
  // or reloaded the page and a pending request already exists on file.
  const pendingExisting = existing && existing.status === 'pending';
  if (submitted || pendingExisting) {
    const shown = existing || { platform, full_name: fullName, feedback_count: feedbackCount };
    return (
      <div className="mt-4 rounded-2xl p-4" style={{ background: '#FFFBEB', border: '1px solid #FDE68A', textAlign: 'left' }}>
        <div className="flex items-center gap-2" style={{ marginBottom: 8 }}>
          <Clock size={16} style={{ color: '#D97706', flexShrink: 0 }} />
          <p style={{ fontSize: 12.5, fontWeight: 800, color: '#92400E', margin: 0 }}>Waiting for approval</p>
        </div>
        <p style={{ fontSize: 11.5, color: '#92400E', margin: '0 0 10px', lineHeight: 1.5 }}>
          Your {MIGRATION_PLATFORM_LABELS[shown.platform] || 'P2P'} reputation submission is locked in and under review — we'll notify you once it's approved.
        </p>
        <div style={{ borderRadius: 10, background: '#fff', border: '1px solid #FDE68A', padding: '8px 12px' }}>
          {[
            ['Email', email],
            ['Full name', shown.full_name],
            ['Feedback count', shown.feedback_count],
          ].map(([label, val]) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 11.5 }}>
              <span style={{ color: '#92400E', opacity: 0.7 }}>{label}</span>
              <span style={{ color: '#92400E', fontWeight: 700 }}>{val || '—'}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Rejected — show the reason (if any) and let them resubmit.
  const wasRejected = existing && existing.status === 'rejected';

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="mt-4 w-full flex items-center gap-2 justify-center"
        style={{ padding: '10px 16px', borderRadius: 99, border: 'none', background: `linear-gradient(135deg, ${C.forest} 0%, ${C.green} 100%)`, color: C.gold, fontSize: 12.5, fontWeight: 800, cursor: 'pointer' }}>
        <Globe size={14} style={{ color: C.gold }} />
        {wasRejected ? 'Resubmit your P2P feedback →' : 'Already trading on Noones or Binance P2P? Move your feedback here →'}
      </button>
    );
  }

  return (
    <div className="mt-4 rounded-2xl p-4" style={{ background: C.g50, border: `1px solid ${C.g200}`, textAlign: 'left' }}>
      <p style={{ fontSize: 12.5, fontWeight: 800, color: C.forest, margin: '0 0 4px' }}>Move your feedback from another P2P platform</p>
      <p style={{ fontSize: 11, color: C.g500, margin: '0 0 10px', lineHeight: 1.5 }}>
        We need your full name and feedback count, plus a screenshot of your P2P profile that clearly shows both — this is how our team verifies the claim.
      </p>
      {wasRejected && (
        <div style={{ padding: '8px 12px', borderRadius: 10, fontSize: 11.5, background: '#FEF2F2', color: '#991B1B', marginBottom: 10 }}>
          Your last submission wasn't approved{existing.admin_notes ? `: ${existing.admin_notes}` : '.'} You can fix and resubmit below.
        </div>
      )}
      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 10, fontSize: 11.5, background: '#FEF2F2', color: '#EF4444', marginBottom: 10 }}>
          <AlertTriangle size={12} />{error}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', borderRadius: 10, background: '#fff', border: `1px solid ${C.g200}`, marginBottom: 10 }}>
        <span style={{ fontSize: 11.5, color: C.g500, fontWeight: 600 }}>Your account email</span>
        <span style={{ fontSize: 11.5, color: C.g700, fontWeight: 800 }}>{email}</span>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        {MIGRATION_PLATFORMS.map(p => (
          <button key={p.id} onClick={() => { setPlatform(p.id); setError(''); }}
            style={{ padding: '8px 14px', borderRadius: 99, border: `2px solid ${platform === p.id ? C.green : C.g200}`, background: platform === p.id ? '#ECFDF5' : '#fff', color: platform === p.id ? C.green : C.g600, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
            {p.label}
          </button>
        ))}
      </div>

      <input type="text" value={fullName} onChange={e => { setFullName(e.target.value); setError(''); }}
        placeholder="Full name (as shown on your P2P profile)"
        style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: `1.5px solid ${C.g200}`, fontSize: 12.5, marginBottom: 8, boxSizing: 'border-box', color: C.g800 }} />

      <input type="text" value={feedbackCount} onChange={e => { setFeedbackCount(e.target.value); setError(''); }}
        placeholder="Feedback count (e.g. 793)"
        style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: `1.5px solid ${C.g200}`, fontSize: 12.5, marginBottom: 10, boxSizing: 'border-box', color: C.g800 }} />

      <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, padding: screenshotPreview ? 0 : '18px 12px', borderRadius: 12, border: `2px dashed ${screenshotPreview ? C.green : C.g200}`, cursor: 'pointer', overflow: 'hidden', background: screenshotPreview ? 'transparent' : '#fff', marginBottom: 10 }}>
        <input type="file" accept="image/*" onChange={e => handleFile(e.target.files?.[0])} style={{ display: 'none' }} />
        {screenshotPreview ? (
          <img src={screenshotPreview} alt="Screenshot preview" style={{ width: '100%', maxHeight: 160, objectFit: 'cover' }} />
        ) : (
          <>
            <FileText size={18} style={{ color: C.g400 }} />
            <span style={{ fontSize: 11.5, color: C.g500, fontWeight: 600, textAlign: 'center' }}>Upload a screenshot of your profile showing your full name and feedback count</span>
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
  const feedbackNeeded = BADGE_THRESHOLDS[key];
  return {
    id: key.toLowerCase(),
    label: key,
    icon: renderBadgeIcon(b, 24),
    color: b.color,
    bg: b.bg.includes('gradient') ? b.bg : b.bg,
    desc: feedbackNeeded
      ? `Level ${b.level}: ${feedbackNeeded}+ feedback received from completed trades.`
      : `Level ${b.level}: Starting your trading journey on PRAQEN.`,
    check: (u) => (feedbackNeeded ? parseInt(u?.total_feedback_count || 0, 10) >= feedbackNeeded : true),
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
  buy: { label: 'Buying BTC', color: C.g800, bg: C.g100 },
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
  { label: 'Standard', limit: 2000, color: C.g800, requires: ['email', 'phone'] },
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
          <p className="font-black text-sm mt-0.5 truncate" style={{ color: C.g800 }}>{listing.payment_method || '—'}</p>
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
  const [own, setOwn] = useState(false);
  const [badges, setBadges] = useState([]);
  const [visibleCount, setVisibleCount] = useState(5);
  const [isTrusted, setIsTrusted] = useState(false);
  const [trustCount, setTrustCount] = useState(0);
  const [trustLoading, setTrustLoading] = useState(false);
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

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
  // Feedback count shown in the UI: on-platform review rows OR the verified count
  // carried over from a P2P migration (Noones / Binance P2P / other), whichever is
  // higher. A migrated trader can have thousands of verified feedback and zero
  // on-platform review rows yet — without this the tab/badge would show 0.
  const migratedFeedback = parseInt(user.total_feedback_count || user.positive_feedback || 0, 10) || 0;
  const displayFeedbackCount = Math.max(reviews.length, migratedFeedback);
  const status = trades >= 50 ? 'Active Trader' : trades >= 5 ? 'Growing Trader' : trades >= 1 ? 'New Trader' : 'Unverified';
  const countryName = user.country_name || COUNTRY_NAMES[userCC] || userCC || null;
  const city = user.city || user.last_seen_location?.split('(')[1]?.replace(')', '') || null;

  const TABS = [
    { id: 'overview', label: 'Overview', icon: Users, count: null },
    { id: 'offers', label: 'Offers', icon: Tag, count: offers.length },
    { id: 'verification', label: 'Verification', icon: BadgeCheck, count: verifPct < 100 ? `${verifPct}%` : null },
    { id: 'reputation', label: 'Feedback', icon: Star, count: displayFeedbackCount || null },
    { id: 'badges', label: 'Badges', icon: Award, count: `${earned.length}/${BADGE_DEFS.length}` },
  ];

  const RING_R = 58, RING_C = 2 * Math.PI * RING_R;

  // ── Desktop layout ─────────────────────────────────────────────────────────
  if (!isMobile) {
    return (
      <ProfileDesktop
        user={user}
        own={own}
        reviews={reviews}
        offers={offers}
        badges={badges}
        earned={earned}
        displayFeedbackCount={displayFeedbackCount}
        score={score}
        trust={trust}
        posPct={posPct}
        rating={rating}
        trades={trades}
        emailOk={emailOk}
        phoneOk={phoneOk}
        kycOk={kycOk}
        verifPct={verifPct}
        status={status}
        trustCount={trustCount}
        isTrusted={isTrusted}
        trustLoading={trustLoading}
        onToggleTrust={handleToggleTrust}
        onEditProfile={() => navigate('/settings?tab=account')}
        onEditBio={() => navigate('/settings?tab=account')}
      />
    );
  }

  // ── Mobile layout ──────────────────────────────────────────────────────────
  return (
    <ProfileMobile
      user={user}
      own={own}
      reviews={reviews}
      offers={offers}
      badges={badges}
      earned={earned}
      displayFeedbackCount={displayFeedbackCount}
      score={score}
      trust={trust}
      posPct={posPct}
      rating={rating}
      trades={trades}
      emailOk={emailOk}
      phoneOk={phoneOk}
      kycOk={kycOk}
      verifPct={verifPct}
      status={status}
      trustCount={trustCount}
      isTrusted={isTrusted}
      trustLoading={trustLoading}
      onToggleTrust={handleToggleTrust}
      onEditProfile={() => navigate('/settings?tab=account')}
      onEditBio={() => navigate('/settings?tab=account')}
    />
  );
}
