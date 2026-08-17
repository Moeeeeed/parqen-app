import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  Bell, X, CheckCheck, ArrowRight,
  Megaphone, Eye, UserCircle, MessageCircle, Send, ChevronLeft, Globe,
  Crown, Link, Lock, CheckCircle, XCircle, DollarSign,
} from 'lucide-react';
import CountryFlag from './CountryFlag';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

// ── Color tokens ──────────────────────────────────────────────────────────────
const T = {
  forest: '#1B4332', green: '#2D6A4F', mint: '#40916C',
  gold: '#F4A422', amber: '#B45309',
  g50: '#F8FAFC', g100: '#F1F5F9', g200: '#E2E8F0',
  g400: '#94A3B8', g500: '#64748B', g600: '#475569', g700: '#334155', g800: '#1E293B',
  success: '#059669', danger: '#DC2626', warn: '#D97706', paid: '#2563EB',
  purple: '#6D28D9', teal: '#0D9488',
};

// Softer per-type palettes: accent is the text/icon color, bg is the card tint
const TYPE_PALETTE = {
  profile_view:  { accent: '#6D28D9', bg: '#F5F3FF', border: '#DDD6FE', dot: '#7C3AED' },
  offer_view:    { accent: '#B45309', bg: '#FFFBEB', border: '#FDE68A', dot: '#D97706' },
  trade_new:     { accent: '#1B4332', bg: '#F0FDF4', border: '#BBF7D0', dot: '#059669' },
  trade_cancel:  { accent: '#DC2626', bg: '#FEF2F2', border: '#FECACA', dot: '#EF4444' },
  trade_expire:  { accent: '#DC2626', bg: '#FEF2F2', border: '#FECACA', dot: '#EF4444' },
  trade_paid:    { accent: '#2563EB', bg: '#EFF6FF', border: '#BFDBFE', dot: '#3B82F6' },
  trade_done:    { accent: '#059669', bg: '#ECFDF5', border: '#A7F3D0', dot: '#10B981' },
  dispute:       { accent: '#B45309', bg: '#FFFBEB', border: '#FDE68A', dot: '#D97706' },
  system:        { accent: '#1B4332', bg: '#F0FDF4', border: '#D1FAE5', dot: '#2D6A4F' },
};

// A cancelled trade's `status` column is always CANCELLED — the backend never
// writes a separate EXPIRED status. The only signal that it auto-expired
// (vs. someone actually clicking Cancel) is the `cancel_reason` text, so any
// caller that has it should pass it as the second argument.
const EXPIRY_REASON_RE = /expir|time limit|payment window/i;

// ── Shared status style helper (reusable in MyTrades & notifications) ──────
export function getStatusStyle(status, cancelReason) {
  const s = (status || '').toUpperCase();
  if (['ACTIVE','IN_PROGRESS','OPEN','CREATED','PENDING','FUNDS_LOCKED','ESCROW','IN_REVIEW'].includes(s))
    return { bg: '#DBEAFE', color: '#2563EB', label: 'Active' };
  if (['COMPLETED','COMPLETE'].includes(s))
    return { bg: '#DCFCE7', color: '#16A34A', label: 'Completed' };
  if (['CANCELLED','CANCELED','CANCELLED_BY_BUYER','CANCELLED_BY_SELLER'].includes(s)) {
    if (EXPIRY_REASON_RE.test(cancelReason || '')) return { bg: '#F1F5F9', color: '#64748B', label: 'Expired' };
    return { bg: '#FEE2E2', color: '#DC2626', label: 'Cancelled' };
  }
  if (['DISPUTED','IN_DISPUTE'].includes(s))
    return { bg: '#EDE9FE', color: '#7C3AED', label: 'Dispute' };
  if (s === 'RESOLVED')
    return { bg: '#F3E8FF', color: '#9333EA', label: 'Resolved' };
  if (['EXPIRED','EXPIRE'].includes(s))
    return { bg: '#F1F5F9', color: '#64748B', label: 'Expired' };
  if (['PAYMENT_SENT','PAID'].includes(s))
    return { bg: '#DBEAFE', color: '#2563EB', label: 'Paid' };
  return { bg: '#F1F5F9', color: '#64748B', label: s || 'Unknown' };
}

// ── Country resolution helper ───────────────────────────────────────────────
// The flag always reflects the USER's own country (never inferred from the
// trade's currency or payment method). If the user has no country on their
// profile, we return null — never a guessed flag. (Inferring GH from every
// GHS trade made every profile show the same flag, which is wrong.)
export function resolveCountryCode(entity) {
  if (!entity) return null;
  return (
    entity.country_code ||
    entity.countryCode ||
    entity.country_iso ||
    entity.country_iso2 ||
    entity.country ||
    entity.nationality ||
    entity.location ||
    entity.geo_country ||
    entity.user?.country_code ||
    entity.user?.country ||
    entity.profile?.country_code ||
    entity.profile?.country ||
    null
  );
}

const CUR_SYM = { GHS:'₵', NGN:'₦', KES:'KSh', ZAR:'R', USD:'$', GBP:'£', EUR:'€', UGX:'USh', TZS:'TSh', XAF:'CFA', XOF:'CFA' };
const fmt    = n => new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n || 0);
const fmtBtc = n => parseFloat(n || 0).toFixed(6);

const relTime = d => {
  if (!d) return '';
  const m = Math.floor((Date.now() - new Date(d)) / 60000);
  if (m < 1)   return 'Just now';
  if (m < 60)  return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(d).toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
};

const absTime = d =>
  !d ? '' : new Date(d).toLocaleString('en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

// ── Small avatar ──────────────────────────────────────────────────────────────
function Avatar({ user, name, size = 38, color = T.forest }) {
  const [err, setErr] = useState(false);
  const label = name || user?.username || user?.full_name || '?';
  const initial = label.charAt(0).toUpperCase();
  if (user?.avatar_url && !err) {
    const src = user.avatar_url.startsWith('/') ? `${API_URL}${user.avatar_url}` : user.avatar_url;
    return <img src={src} onError={() => setErr(true)} alt={label}
      style={{ width: size, height: size, borderRadius: size * 0.3, objectFit: 'cover', flexShrink: 0 }} />;
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: size * 0.3, backgroundColor: color,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontWeight: 900, color: '#fff', fontSize: size * 0.4, flexShrink: 0,
    }}>{initial}</div>
  );
}

// ── Country flag badge ──────────────────────────────────────────────────────
// Renders the real flag when a code is resolvable. Renders nothing when it
// isn't — no "No country" placeholder, no layout shift.
//
// TEMP DEBUG: while country flags aren't appearing anywhere in the app, this
// logs the exact shape of every entity that fails to resolve a country code,
// so we can see in the browser console which field (if any) actually carries
// the country on your API responses. Remove the console.warn once we know
// the real field name and have wired resolveCountryCode() to it directly.
function FlagBadge({ entity, size = 16, marginLeft = 0 }) {
  const code = resolveCountryCode(entity);
  if (!code) {
    if (entity && process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.warn('[FlagBadge] could not resolve a country for:', entity);
    }
    return null;
  }
  return (
    <CountryFlag
      countryCode={code}
      style={{ width: size * 1.3, height: size, display: 'inline-block', marginLeft, verticalAlign: 'middle', borderRadius: 2 }}
    />
  );
}

// ── Icon circle ───────────────────────────────────────────────────────────────
// ── Shared image-style card container ────────────────────────────────────────
function NCard({ n, onNavigate, children }) {
  const shadowH = '0 4px 18px rgba(0,0,0,0.13)';
  return (
    <div onClick={() => onNavigate(n)}
      className={n._isNew ? 'notif-card-new' : ''}
      style={{
        background: '#fff', borderRadius: 16, margin: '0 0 10px',
        border: '1px solid #E5E7EB',
        boxShadow: 'none', cursor: 'pointer', overflow: 'hidden',
        transition: 'box-shadow 0.15s, transform 0.12s',
        opacity: n.is_read ? 0.88 : 1,
      }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = shadowH; e.currentTarget.style.transform = 'translateY(-1px)'; }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'translateY(0)'; }}>
      {children}
    </div>
  );
}
const NDivider = () => <div style={{ height: 1, background: '#F1F5F9', margin: '0 16px' }} />;

// ── Real trade ref: prefers action URL or trade object over message regex ─────
function getRealTradeRef(n) {
  if (n.action) {
    const m = n.action.match(/\/trade\/([^/?#]+)/i);
    if (m) {
      const id = m[1].replace(/-/g, '');
      return id.slice(0, 8).toUpperCase();
    }
  }
  if (n.trade?.id) return String(n.trade.id).replace(/-/g, '').slice(0, 8).toUpperCase();
  const combined = (n.title || '') + ' ' + (n.message || '');
  const m = combined.match(/#([A-Za-z0-9]{4,12})/) || combined.match(/trade[^\w]([A-Za-z0-9]{4,12})/i);
  return m ? m[1].toUpperCase() : null;
}

// ─── 1. PROFILE VIEW card ─────────────────────────────────────────────────────
function ProfileViewCard({ n, onNavigate }) {
  const actor = n.actor;                                   // enriched by backend
  const msg = n.message || '';
  const nameMatch = msg.match(/^(.+?)\s+just viewed/i);
  const viewerName = actor?.username || (nameMatch ? nameMatch[1] : null);
  const isAnon = !viewerName;
  const PURPLE = '#6D28D9';
  const displayName = viewerName || 'Anonymous visitor';

  return (
    <NCard n={n} onNavigate={onNavigate}>
      {/* Header */}
      <div style={{ padding: '14px 16px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ fontWeight: 900, fontSize: 15, color: '#0F172A' }}>Profile View</span>
          <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'linear-gradient(135deg,#7C3AED,#5B21B6)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Eye size={11} color="#fff" />
          </div>
          <span style={{ fontSize: 12, color: T.g400, fontWeight: 600 }}>{tradeTimeStr(n.created_at)}</span>
          {!n.is_read && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#3B82F6', display: 'inline-block', flexShrink: 0 }} />}
        </div>
        <span style={{ fontSize: 12, fontWeight: 700, color: PURPLE, background: '#EDE9FE', padding: '4px 12px', borderRadius: 8, flexShrink: 0 }}>
          {isAnon ? 'Anonymous' : 'Viewed'}
        </span>
      </div>

      {/* Viewer name row */}
      <div style={{ padding: '0 16px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 13, color: '#374151', fontWeight: 500 }}>Someone visited your profile</span>
        <span style={{ fontSize: 13, color: T.g500, fontWeight: 600 }}>{isAnon ? '—' : displayName}</span>
      </div>

      <NDivider />

      {/* Body — real photo when available */}
      <div style={{ padding: '12px 16px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
        {isAnon ? (
          <div style={{ width: 44, height: 44, borderRadius: 13, background: '#EDE9FE', border: '2px dashed #C4B5FD', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <UserCircle size={22} color="#7C3AED" />
          </div>
        ) : (
          <Avatar user={actor} name={displayName} size={44} color={PURPLE} />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {displayName}
          </p>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: T.g500, fontWeight: 500 }}>
            {isAnon ? 'Browsed your profile anonymously' : 'Just visited your profile'}
          </p>
        </div>
        {!isAnon && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 800, color: PURPLE, flexShrink: 0 }}>
            View <ArrowRight size={12} />
          </span>
        )}
      </div>
    </NCard>
  );
}

// ─── 2. OFFER VIEW card ───────────────────────────────────────────────────────
function OfferViewCard({ n, onNavigate }) {
  const actor = n.actor;
  const msg = n.message || '';
  const nameMatch = msg.match(/^(.+?)\s+(?:just\s+)?viewed\s+your/i);
  const viewerName = actor?.username || (nameMatch ? nameMatch[1] : null);
  const isAnon = !viewerName;
  const hasProfile = n.action?.startsWith('/profile/');
  const AMBER = '#B45309';
  const displayName = viewerName || 'Anonymous visitor';

  return (
    <NCard n={n} onNavigate={onNavigate}>
      {/* Header */}
      <div style={{ padding: '14px 16px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ fontWeight: 900, fontSize: 15, color: '#0F172A' }}>Offer Viewed</span>
          <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'linear-gradient(135deg,#D97706,#92400E)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Eye size={11} color="#fff" />
          </div>
          <span style={{ fontSize: 12, color: T.g400, fontWeight: 600 }}>{tradeTimeStr(n.created_at)}</span>
          {!n.is_read && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#3B82F6', display: 'inline-block', flexShrink: 0 }} />}
        </div>
        <span style={{ fontSize: 12, fontWeight: 700, color: AMBER, background: '#FFFBEB', padding: '4px 12px', borderRadius: 8, flexShrink: 0 }}>
          {isAnon ? 'Anonymous' : 'Offer View'}
        </span>
      </div>

      {/* Info row */}
      <div style={{ padding: '0 16px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 13, color: '#374151', fontWeight: 500 }}>Someone viewed your offer</span>
        <span style={{ fontSize: 13, color: T.g500, fontWeight: 600 }}>{isAnon ? '—' : displayName}</span>
      </div>

      <NDivider />

      {/* Body — real photo when available */}
      <div style={{ padding: '12px 16px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
        {isAnon ? (
          <div style={{ width: 44, height: 44, borderRadius: 13, background: '#FFFBEB', border: '2px dashed #FDE68A', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <UserCircle size={22} color={AMBER} />
          </div>
        ) : (
          <Avatar user={actor} name={displayName} size={44} color={AMBER} />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {displayName}
          </p>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: T.g500, fontWeight: 500 }}>
            {isAnon ? 'Browsed your offer anonymously' : 'Might be interested in your offer'}
          </p>
        </div>
        {!isAnon && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 800, color: AMBER, flexShrink: 0 }}>
            {hasProfile ? 'Profile' : 'Offer'} <ArrowRight size={12} />
          </span>
        )}
      </div>
    </NCard>
  );
}

// ─── 3 & 4. UNIFIED TRADE CARD (image-style) ─────────────────────────────────

const tradeTimeStr = (ts) => {
  if (!ts) return '';
  const d = new Date(ts);
  const isToday = d.toDateString() === new Date().toDateString();
  const hm = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  return isToday
    ? `Today ${hm}`
    : d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' }) + ', ' + hm;
};

const KNOWN_GC_BRANDS = [
  'Apple / iTunes', 'iTunes Denmark', 'iTunes', 'Apple', 'Amazon', 'Google Play',
  'Steam', 'eBay', 'Walmart', 'Target', 'Visa Gift Card', 'Mastercard GC',
  'Amex Gift Card', 'Netflix', 'Spotify', 'Xbox', 'PlayStation', 'Nintendo',
  'Razer Gold', 'Nike Gift Card', 'MoneyPak', 'PostePay', 'PLS Gift Card',
  'Vanilla Card', 'Roblox', 'Fortnite V-Bucks', 'Starbucks', 'Sephora'
];

// ── Brand sanity guards ──────────────────────────────────────────────────────
// Never let a currency figure ("$10 USD", "kr50 DKK") or filler words ("via",
// "with", "buy") masquerade as a gift card brand. Real brands come from
// structured data (trade.gift_card_brand / listing.gift_card_brand / notification
// data) — the message fallbacks below only accept text that passes these checks.
const CURRENCY_CODE_RE = /\b(?:USD|GBP|CAD|EUR|AUD|SGD|CHF|SEK|NOK|DKK|NZD|JPY|HKD|PLN|BRL|MXN|GHS|NGN|KES|ZAR|UGX|TZS|XAF|XOF)\b/i;
const FILLER_WORDS_RE = /^(?:a|an|the|to|for|via|with|by|on|at|in|of|and|or|your|my|you|wants|want|buys|buy|sells|sell|buying|selling|paid|open|started|new|trade|gift|card)$/i;
const INVALID_BRAND_RE = /bitcoin|gift card|^gift$/i;
const isAmountLike = (s) => /\d|[$€£¥₵₦₹₩₮]/u.test(s) || CURRENCY_CODE_RE.test(s);
const isSaneBrandText = (s) => {
  const t = (s || '').trim();
  if (!t || INVALID_BRAND_RE.test(t) || isAmountLike(t)) return false;
  return !t.split(/\s+/).some(w => FILLER_WORDS_RE.test(w));
};

function resolveGiftCardBrand(n, trade) {
  const candidates = [
    trade?.gift_card_brand,
    trade?.giftCardBrand,
    trade?.listing?.gift_card_brand,
    trade?.listings?.gift_card_brand,
    n?.gift_card_brand,
    n?.giftCardBrand,
    n?.trade?.gift_card_brand,
    n?.trade?.giftCardBrand,
    n?.trade?.listing?.gift_card_brand,
    n?.trade?.listings?.gift_card_brand,
    n?.data?.gift_card_brand,
    n?.data?.giftCardBrand,
  ];
  for (const c of candidates) {
    if (isSaneBrandText(c)) return c.trim();
  }

  const combined = `${n?.title || ''} ${n?.message || ''} ${trade?.description || ''} ${trade?.trade_instructions || ''}`;
  // 1) Exact known brands — the safest match
  for (const brand of KNOWN_GC_BRANDS) {
    const escaped = brand.replace(/[/\\^$*+?.()|[\]{}]/g, '\\$&');
    if (new RegExp(`\\b${escaped}\\b`, 'i').test(combined)) {
      return brand;
    }
  }

  // 2) "X Gift Card" pattern — limited to a few words, must look like a brand
  //    name (no digits / currency codes / symbols / filler words)
  const gcMatch = combined.match(/([A-Za-z][A-Za-z0-9/&.\- ]*?)\s+(?:Gift Card|GC|Voucher)\b/i);
  if (gcMatch && isSaneBrandText(gcMatch[1])) {
    return gcMatch[1].trim();
  }

  return null;
}

function TradeNotifCard({ n, trade, userId, onNavigate, isChat = false }) {
  const isBuyer  = String(userId) === String(trade.buyer_id);
  const cpRaw    = isBuyer ? trade.seller : trade.buyer;
  // Fallback: parse counterparty name from message when not enriched in trade
  const msgActorName = !cpRaw
    ? (
        (n.message || '').match(/^([A-Za-z0-9_]+)\s+(?:wants to|cancelled|canceled|paid|disputed|completed)/i)?.[1]
        || (n.message || '').match(/\bwith\s+([A-Za-z0-9_]+)\b/i)?.[1]
      )
    : null;
  const cp = cpRaw || (msgActorName ? { username: msgActorName } : null);
  const local    = parseFloat(trade.amount_local || 0);
  const cur      = trade.local_currency || 'USD';
  const sym      = trade.currency_symbol || CUR_SYM[cur] || '';
  const btcRaw   = parseFloat(trade.amount_btc || 0);
  const btcStr   = btcRaw.toFixed(8);
  const gcBrand  = resolveGiftCardBrand(n, trade);
  const pm       = (gcBrand && gcBrand.toLowerCase() !== 'bitcoin' && gcBrand.toLowerCase() !== 'gift card')
    ? gcBrand
    : (trade.payment_method && trade.payment_method !== 'Gift Card' ? trade.payment_method : (gcBrand || 'Gift Card'));
  const st         = (trade.status || '').toUpperCase();
  const status     = getStatusStyle(st, trade.cancel_reason);
  const dateStr    = tradeTimeStr(trade.created_at || n.created_at);
  const isDone     = st === 'COMPLETED' || st === 'COMPLETE';

  // Detect gift card trade via trade_type or known gift card brand in payment method
  const GIFT_BRANDS = /amazon|itunes|apple|google.?play|steam|walmart|ebay|target|playstation|xbox|netflix|spotify|visa gift|mastercard gift|best buy/i;
  const isGiftCard = /gift/i.test(trade.trade_type || '') || Boolean(gcBrand && gcBrand.toLowerCase() !== 'bitcoin') || GIFT_BRANDS.test(pm);

  // Asset-aware direction label + header logo (₿ BTC / ₮ USDT)
  const isUsdt = String(trade.currency || '').toUpperCase() === 'USDT'
    || (trade.amount_usdt && parseFloat(trade.amount_usdt) > 0)
    || /USDT/i.test(trade.asset || '');
  const dirLabel = `${isBuyer ? 'Buy' : 'Sell'} ${isUsdt ? 'USDT' : 'BTC'}`;

  // USD equivalent of BTC (from amount_usd field, already in DB)
  const usdRaw   = parseFloat(trade.amount_usd || 0);
  const usdEqStr = usdRaw > 0 ? `≈ $${usdRaw.toFixed(2)} USD` : null;
  const fiatStr  = local > 0 ? `${sym}${local.toFixed(2)} ${cur}` : null;

  // Build left/right column data based on trade type + user role.
  // Rule: always lead with the amount the current user CARES ABOUT MOST.
  //   • Seller (BTC or gift card): sees what they RECEIVE first (fiat / BTC)
  //   • Buyer: sees what they PAY first (fiat), then what they GET (BTC)
  const basePay     = isDone ? 'You paid'     : 'You pay';
  const baseReceive = isDone ? 'You received' : 'You receive';

  let leftLabel, leftStr, leftSubStr, rightLabel, rightStr, rightSubStr;

  if (isGiftCard) {
    // The gift card brand is already shown once at the top of the card — the
    // amount row shows the card's VALUE (fiat), not the brand again. Both
    // columns follow the regular trade card format: currency value as the
    // primary bold line, BTC amount below in gray parentheses.
    const fiatPrimary = fiatStr || usdEqStr || `${btcStr} BTC`;
    const btcParen    = fiatStr ? `(${btcStr} BTC)` : null;
    if (isBuyer) {
      // Gift card buyer (paying with gift card to buy BTC):
      // LEFT: You pay/paid (card value)  |  RIGHT: You receive/received (value + BTC equiv)
      leftLabel   = basePay;
      leftStr     = fiatPrimary;
      leftSubStr  = null;
      rightLabel  = baseReceive;
      rightStr    = fiatPrimary;
      rightSubStr = btcParen;
    } else {
      // Gift card seller (selling BTC to receive gift card):
      // LEFT: You pay/paid (value + BTC equiv)  |  RIGHT: You receive/received (card value)
      leftLabel   = basePay;
      leftStr     = fiatPrimary;
      leftSubStr  = btcParen;
      rightLabel  = baseReceive;
      rightStr    = fiatPrimary;
      rightSubStr = null;
    }
  } else {
    if (!isBuyer) {
      // BTC seller  →  LEFT: what they RECEIVE (fiat)  |  RIGHT: what they PAY (fiat + BTC equiv on one line)
      leftLabel   = baseReceive;
      leftStr     = fiatStr || '—';
      leftSubStr  = null;
      rightLabel  = basePay;
      rightStr    = fiatStr || `${btcStr} BTC`;
      rightSubStr = fiatStr ? `(${btcStr} BTC)` : null;
    } else {
      // BTC buyer  →  LEFT: what they PAY (fiat)  |  RIGHT: what they RECEIVE (fiat + BTC equiv on one line)
      leftLabel   = basePay;
      leftStr     = fiatStr || '—';
      leftSubStr  = null;
      rightLabel  = baseReceive;
      rightStr    = fiatStr || `${btcStr} BTC`;
      rightSubStr = fiatStr ? `(${btcStr} BTC)` : null;
    }
  }

  const roleTag = isBuyer ? 'Buyer' : 'Seller';

  return (
    <NCard n={n} onNavigate={onNavigate}>
      {/* Header: coin icon + direction/role + date + status */}
      <div style={{ padding: '14px 16px 12px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, minWidth: 0 }}>
          {isUsdt ? (
            <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'linear-gradient(135deg,#0D9488,#0F766E)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 2px 6px rgba(13,148,136,0.4)' }}>
              <span style={{ fontSize: 17, color: '#fff', fontWeight: 900 }}>₮</span>
            </div>
          ) : (
            <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'linear-gradient(135deg,#F7931A,#E8790A)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 2px 6px rgba(247,147,26,0.4)' }}>
              <span style={{ fontSize: 17, color: '#fff', fontWeight: 900 }}>₿</span>
            </div>
          )}
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 900, fontSize: 15, color: '#0F172A' }}>{dirLabel}</span>
              <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', color: T.g400 }}>{roleTag}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
              <span style={{ fontSize: 12, color: T.g400, fontWeight: 600 }}>{dateStr}</span>
              {!n.is_read && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#3B82F6', display: 'inline-block', flexShrink: 0 }} />}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {(isChat || n._hasUnreadMsg) && (
            <span style={{ fontSize: 11, fontWeight: 800, color: '#2563EB', background: '#EFF6FF', padding: '4px 9px', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
              <MessageCircle size={11} /> {(n._msgCount > 1) ? `${n._msgCount} msgs` : 'New msg'}
            </span>
          )}
          <span style={{ fontSize: 12, fontWeight: 700, color: status.color, background: status.bg, padding: '4px 12px', borderRadius: 8 }}>
            {status.label}
          </span>
        </div>
      </div>

      {/* Payment method (red) | vendor avatar + name + flag */}
      <div style={{ padding: '0 16px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 13, color: '#DC2626', fontWeight: 600, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pm}</span>
        {cp ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, minWidth: 0 }}>
            <Avatar user={cp} name={cp.username} size={32} color={T.forest} />
            <div style={{ minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 13, color: '#EC4899', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>
                {cp.username}
              </span>
              <span style={{ display: 'block', marginTop: 2 }}>
                <FlagBadge entity={cp} size={15} marginLeft={0} />
              </span>
            </div>
          </div>
        ) : (
          <span style={{ fontSize: 13, color: T.g400 }}>—</span>
        )}
      </div>

      <NDivider />

      {/* Left | → | Right  (label + amount + optional secondary below) */}
      <div style={{ padding: '11px 16px 14px', display: 'flex', alignItems: 'center' }}>
        <div style={{ flex: 1 }}>
          <p style={{ margin: 0, fontSize: 12, color: T.g500, fontWeight: 400, marginBottom: 3 }}>{leftLabel}</p>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#0F172A', lineHeight: 1.2 }}>{leftStr}</p>
          {leftSubStr && <p style={{ margin: '2px 0 0', fontSize: 12, fontWeight: 400, color: T.g400 }}>{leftSubStr}</p>}
        </div>
        <div style={{ padding: '0 10px', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
          <ArrowRight size={18} strokeWidth={2.5} color={T.g500} />
        </div>
        <div style={{ flex: 1, textAlign: 'right' }}>
          <p style={{ margin: 0, fontSize: 12, color: T.g500, fontWeight: 400, marginBottom: 3 }}>{rightLabel}</p>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#0F172A', lineHeight: 1.2 }}>{rightStr}</p>
          {rightSubStr && <p style={{ margin: '2px 0 0', fontSize: 12, fontWeight: 400, color: T.g400 }}>{rightSubStr}</p>}
        </div>
      </div>
    </NCard>
  );
}

// ─── 5. TRADE MESSAGE card ────────────────────────────────────────────────────
function MessageCard({ n, onNavigate }) {
  const msg        = n.message || '';
  const colonIdx   = msg.indexOf(': ');
  const senderName = colonIdx > 0 ? msg.slice(0, colonIdx) : null;
  const preview    = colonIdx > 0 ? msg.slice(colonIdx + 2) : msg;
  const tradeRef   = getRealTradeRef(n);
  const BLUE       = '#2563EB';

  return (
    <NCard n={n} onNavigate={onNavigate}>
      {/* Header */}
      <div style={{ padding: '14px 16px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ fontWeight: 900, fontSize: 15, color: '#0F172A' }}>Trade Chat</span>
          <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'linear-gradient(135deg,#2563EB,#1D4ED8)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <MessageCircle size={11} color="#fff" />
          </div>
          <span style={{ fontSize: 12, color: T.g400, fontWeight: 600 }}>{tradeTimeStr(n.created_at)}</span>
          {!n.is_read && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#3B82F6', display: 'inline-block', flexShrink: 0 }} />}
        </div>
        {tradeRef
          ? <span style={{ fontSize: 12, fontWeight: 700, color: T.g600, background: T.g100, padding: '4px 10px', borderRadius: 8, fontFamily: 'monospace', flexShrink: 0 }}>#{tradeRef}</span>
          : <span style={{ fontSize: 12, fontWeight: 700, color: BLUE, background: '#EFF6FF', padding: '4px 12px', borderRadius: 8, flexShrink: 0 }}>Message</span>
        }
      </div>

      {/* Sender row */}
      <div style={{ padding: '0 16px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 13, color: '#374151', fontWeight: 500 }}>
          {senderName ? `Message from ${senderName}` : 'New trade message'}
        </span>
        <span style={{ fontSize: 13, color: T.g500, fontWeight: 600 }}>{senderName || '—'}</span>
      </div>

      <NDivider />

      {/* Preview */}
      <div style={{ padding: '12px 16px 14px' }}>
        <p style={{ margin: '0 0 10px', fontSize: 13, color: '#374151', lineHeight: 1.55, fontWeight: 500, wordBreak: 'break-word' }}>
          {preview || 'New message in your trade'}
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 800, color: BLUE }}>
            Open chat <ArrowRight size={12} />
          </span>
        </div>
      </div>
    </NCard>
  );
}

// ─── 6. GENERAL / SYSTEM card ─────────────────────────────────────────────────
function BasicCard({ n, userId, onNavigate }) {
  const [expanded, setExpanded] = useState(false);

  const title = (n.title || '').toLowerCase();
  const msg   = n.message || '';
  const type  = n.type || '';
  const vendor = n.actor;

  const isCancelled = /cancel/i.test(title)  || /cancel/i.test(type);
  const isExpired   = /expir/i.test(title)   || /expir/i.test(type)  || /expir/i.test(msg);
  const isNewTrade  = /new trade|trade request/i.test(title) || /trade_new|new_trade/i.test(type) || /wants to (buy|sell)/i.test(msg);
  const isDispute   = /disput/i.test(title)  || /disput/i.test(type);
  const isPayment   = /payment|paid/i.test(title);
  const isCompleted = /complet/i.test(title) || /complet/i.test(type)
    || type === 'trade_done' || type === 'trade_complete' || type === 'trade_completed';
  const isResolved  = /resolv/i.test(title)  || /resolv/i.test(type);
  const isActive    = /\bactive\b/i.test(title) || /\bactive\b/i.test(type);
  const isRefund    = /refund/i.test(msg);
  const isTradeRelated = isCancelled || isExpired || isNewTrade || isDispute
    || isPayment || isCompleted || isResolved || isActive;

  const tradeId = getRealTradeRef(n);

  // ── TRADE-RELATED: image-style card ──────────────────────────────────────────
  if (isTradeRelated) {
    const status = getStatusStyle(
      isCancelled ? 'CANCELLED'
      : isExpired ? 'EXPIRED'
      : isResolved ? 'RESOLVED'
      : isDispute ? 'DISPUTED'
      : isPayment ? 'PAID'
      : isCompleted ? 'COMPLETED'
      : 'ACTIVE'
    );

    // Parse payment method: enriched gift_card_brand first, then enriched payment_method, then parse from message
    const basicGcBrand = resolveGiftCardBrand(n, n?.trade);
    const pmM = msg.match(/\bvia\s+([^·\n]+?)(?:\s*·\s*|\s*$)/i);
    const pmViaRaw = pmM?.[1]?.trim();
    // Only trust the "via …" capture if it looks like a real method/brand —
    // never a currency amount like "10 USD" or "kr50 DKK"
    const pmViaOk = pmViaRaw && isSaneBrandText(pmViaRaw);
    const parsedPm = (basicGcBrand && basicGcBrand.toLowerCase() !== 'bitcoin' && basicGcBrand.toLowerCase() !== 'gift card')
      ? basicGcBrand
      : (n.payment_method && n.payment_method !== 'Gift Card' ? n.payment_method : (pmViaOk ? pmViaRaw : (basicGcBrand || 'Gift Card')));

    // BTC amount (₿ prefix in message)
    const btcM = msg.match(/[₿]([\d.]+)/);
    const parsedBtc = btcM ? parseFloat(btcM[1]) : null;
    const btcAmtStr = parsedBtc ? `₿${parsedBtc.toFixed(8)}` : null;

    // Local fiat amount + currency
    const fiatM = msg.match(/([\d,]+(?:\.\d+)?)\s*(GHS|NGN|KES|ZAR|USD|GBP|EUR|UGX|TZS|XAF|XOF)\b/i);
    const parsedLocalAmt = fiatM ? fiatM[1].replace(/,/g, '') : null;
    const parsedLocalCur = fiatM ? fiatM[2].toUpperCase() : null;
    const parsedLocalSym = parsedLocalCur ? (CUR_SYM[parsedLocalCur] || '') : '';
    const parsedLocalStr = parsedLocalAmt
      ? `${parsedLocalSym}${fmt(parsedLocalAmt)} ${parsedLocalCur}`
      : null;

    // Gift card detection for BasicCard (uses parsed payment method from message)
    const GIFT_BRANDS_RE = /amazon|itunes|apple|google.?play|steam|walmart|ebay|target|playstation|xbox|netflix|spotify|visa gift|mastercard gift|best buy/i;
    const basicIsGiftCard = Boolean(basicGcBrand && basicGcBrand.toLowerCase() !== 'bitcoin') || GIFT_BRANDS_RE.test(parsedPm) || /gift.?card/i.test(msg);

    // Direction — priority: enriched field → message keywords → type hints.
    // Label + header logo are asset-aware (₿ BTC / ₮ USDT), never the gift icon.
    const wantsBuy  = /wants to buy/i.test(msg);
    const wantsSell = /wants to sell/i.test(msg);
    const enrichedDir = n.direction || n.data?.direction;
    const isUsdt = (n.trade && (String(n.trade.currency || '').toUpperCase() === 'USDT'
      || (n.trade.amount_usdt && parseFloat(n.trade.amount_usdt) > 0)))
      || /\bUSDT\b|₮/i.test(msg);
    const assetTag = isUsdt ? 'USDT' : 'BTC';
    let dirLabel = 'Trade';
    if (enrichedDir === 'buy')          dirLabel = `Buy ${assetTag}`;
    else if (enrichedDir === 'sell')    dirLabel = `Sell ${assetTag}`;
    else if (wantsBuy)                  dirLabel = `Sell ${assetTag}`;
    else if (wantsSell)                 dirLabel = `Buy ${assetTag}`;
    else if (/\bbuy\b/i.test(type) && !/sell/i.test(type)) dirLabel = `Buy ${assetTag}`;
    else if (/\bsell\b/i.test(type) && !/buy/i.test(type)) dirLabel = `Sell ${assetTag}`;

    // Past tense for completed trades
    const isDone = isCompleted;
    const basePay2     = isDone ? 'You paid'     : 'You pay';
    const baseReceive2 = isDone ? 'You received' : 'You receive';

    // isSeller = true when we can detect the current user is selling BTC
    const isSeller = wantsBuy || enrichedDir === 'sell';
    const isBuyerB = wantsSell || enrichedDir === 'buy';

    // Build left/right layout using same seller-first rule as TradeNotifCard
    let bLeftLabel, bLeftStr, bLeftSubStr, bRightLabel, bRightStr, bRightSubStr;

    if (basicIsGiftCard) {
      // The gift card brand is already shown once at the top of the card — the
      // amount row shows the card's VALUE (fiat), not the brand again. Both
      // columns follow the regular trade card format: currency value as the
      // primary bold line, BTC amount below in gray parentheses.
      const bFiatPrimary = parsedLocalStr || btcAmtStr || 'BTC';
      const bBtcParen    = parsedLocalStr && btcAmtStr ? `(${btcAmtStr})` : null;
      if (isBuyerB || (!isSeller)) {
        // Gift card buyer (paying with gift card to buy BTC):
        // LEFT: You pay/paid (card value)  |  RIGHT: You receive/received (value + BTC equiv)
        bLeftLabel   = basePay2;
        bLeftStr     = bFiatPrimary;
        bLeftSubStr  = null;
        bRightLabel  = baseReceive2;
        bRightStr    = bFiatPrimary;
        bRightSubStr = bBtcParen;
      } else {
        // Gift card seller (selling BTC to receive gift card):
        // LEFT: You pay/paid (value + BTC equiv)  |  RIGHT: You receive/received (card value)
        bLeftLabel   = basePay2;
        bLeftStr     = bFiatPrimary;
        bLeftSubStr  = bBtcParen;
        bRightLabel  = baseReceive2;
        bRightStr    = bFiatPrimary;
        bRightSubStr = null;
      }
    } else if (isSeller) {
      // BTC seller: LEFT = what they RECEIVE (fiat)  |  RIGHT = what they PAY (fiat + BTC equiv on one line)
      bLeftLabel   = baseReceive2;
      bLeftStr     = parsedLocalStr || '—';
      bLeftSubStr  = null;
      bRightLabel  = basePay2;
      bRightStr    = parsedLocalStr || btcAmtStr || 'BTC';
      bRightSubStr = parsedLocalStr && btcAmtStr ? `(${btcAmtStr})` : null;
    } else {
      // BTC buyer: LEFT = what they PAY (fiat)  |  RIGHT = what they RECEIVE (fiat + BTC equiv on one line)
      bLeftLabel   = basePay2;
      bLeftStr     = parsedLocalStr || btcAmtStr || 'BTC';
      bLeftSubStr  = null;
      bRightLabel  = baseReceive2;
      bRightStr    = parsedLocalStr || btcAmtStr || 'BTC';
      bRightSubStr = parsedLocalStr && btcAmtStr ? `(${btcAmtStr})` : null;
    }

    // Actor: use enriched n.actor first, then parse username from message as fallback for letter avatar
    const parsedActorName = !vendor
      ? (
          // "alicebuyer wants to buy…" or "alicebuyer cancelled the trade…"
          msg.match(/^([A-Za-z0-9_]+)\s+(?:wants to|cancelled|canceled|paid|disputed|completed)/i)?.[1]
          // "Your trade with aliceseller is now open…" or "Trade with aliceseller…"
          || msg.match(/\bwith\s+([A-Za-z0-9_]+)\b/i)?.[1]
        )
      : null;
    const displayActor = vendor || (parsedActorName ? { username: parsedActorName } : null);

    // Extra direction hint: if actor username contains "buyer" → they buy → I sell, and vice versa
    if (dirLabel === 'Trade' && parsedActorName) {
      if (/buyer/i.test(parsedActorName))  dirLabel = `Sell ${assetTag}`;
      if (/seller/i.test(parsedActorName)) dirLabel = `Buy ${assetTag}`;
    }

    const roleTag = dirLabel.startsWith('Buy') ? 'Buyer' : dirLabel.startsWith('Sell') ? 'Seller' : null;

    return (
      <NCard n={n} onNavigate={onNavigate}>
        {/* Header: coin icon + direction/role + date + status */}
        <div style={{ padding: '14px 16px 12px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, minWidth: 0 }}>
            {isUsdt ? (
              <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'linear-gradient(135deg,#0D9488,#0F766E)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 2px 6px rgba(13,148,136,0.4)' }}>
                <span style={{ fontSize: 17, color: '#fff', fontWeight: 900 }}>₮</span>
              </div>
            ) : (
              <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'linear-gradient(135deg,#F7931A,#E8790A)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 2px 6px rgba(247,147,26,0.35)' }}>
                <span style={{ fontSize: 17, color: '#fff', fontWeight: 900 }}>₿</span>
              </div>
            )}
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 900, fontSize: 15, color: '#0F172A' }}>{dirLabel}</span>
                {roleTag && <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', color: T.g400 }}>{roleTag}</span>}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
                <span style={{ fontSize: 12, color: T.g400, fontWeight: 600 }}>{tradeTimeStr(n.created_at)}</span>
                {!n.is_read && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#3B82F6', display: 'inline-block', flexShrink: 0 }} />}
              </div>
            </div>
          </div>
          <span style={{ fontSize: 12, fontWeight: 700, color: status.color, background: status.bg, padding: '4px 12px', borderRadius: 8, flexShrink: 0 }}>
            {status.label}
          </span>
        </div>

        {/* Payment method (red) | Actor name + flag (pink) */}
        <div style={{ padding: '0 16px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ fontSize: 13, color: '#DC2626', fontWeight: 600, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {parsedPm}
          </span>
          {displayActor ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, minWidth: 0 }}>
              <Avatar user={displayActor} name={displayActor.username} size={32} color={T.forest} />
              <div style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 13, color: '#EC4899', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>
                  {displayActor.username}
                </span>
                <span style={{ display: 'block', marginTop: 2 }}>
                  <FlagBadge entity={displayActor} size={15} marginLeft={0} />
                </span>
              </div>
            </div>
          ) : parsedLocalStr ? (
            <span style={{ fontSize: 14, fontWeight: 800, color: '#F7931A', flexShrink: 0 }}>{parsedLocalStr}</span>
          ) : tradeId ? (
            <span style={{ fontSize: 12, color: '#EC4899', fontWeight: 800, fontFamily: 'monospace', background: '#FCE7F3', padding: '3px 10px', borderRadius: 7, flexShrink: 0 }}>#{tradeId}</span>
          ) : null}
        </div>

        <NDivider />

        {/* Left | → | Right  (label + amount + optional secondary below) */}
        <div style={{ padding: '11px 16px 14px', display: 'flex', alignItems: 'center' }}>
          <div style={{ flex: 1 }}>
            <p style={{ margin: 0, fontSize: 12, color: T.g500, fontWeight: 400, marginBottom: 3 }}>{bLeftLabel}</p>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#0F172A', lineHeight: 1.2 }}>{bLeftStr}</p>
            {bLeftSubStr && <p style={{ margin: '2px 0 0', fontSize: 12, fontWeight: 400, color: T.g400 }}>{bLeftSubStr}</p>}
          </div>
          <div style={{ padding: '0 10px', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
            <ArrowRight size={18} strokeWidth={2.5} color={T.g500} />
          </div>
          <div style={{ flex: 1, textAlign: 'right' }}>
            <p style={{ margin: 0, fontSize: 12, color: T.g500, fontWeight: 400, marginBottom: 3 }}>{bRightLabel}</p>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#0F172A', lineHeight: 1.2 }}>{bRightStr}</p>
            {bRightSubStr && <p style={{ margin: '2px 0 0', fontSize: 12, fontWeight: 400, color: T.g400 }}>{bRightSubStr}</p>}
          </div>
        </div>
        {isRefund && (
          <div style={{ padding: '0 16px 12px' }}>
            <p style={{ margin: 0, fontSize: 12, color: T.success, fontWeight: 700 }}><CheckCircle size={12} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} /> Your BTC has been refunded to your wallet</p>
          </div>
        )}
      </NCard>
    );
  }

  // ── SYSTEM / PRAQEN ──────────────────────────────────────────────────────────
  const GREEN  = '#1B4332';
  const PREVIEW_LIMIT = 120;
  const isLong = msg.length > PREVIEW_LIMIT;
  // Detect subtype for a richer label
  const isBtcReceived = /bitcoin received|btc received/i.test(n.title || '');
  const isBonus       = /bonus|reward|gift/i.test(n.title || '');
  const isBroadcast   = /broadcast|announcement|update/i.test(n.title || '');
  const sysLabel  = isBtcReceived ? 'Received' : isBonus ? 'Bonus' : isBroadcast ? 'Announcement' : 'PRAQEN';
  const sysColor  = isBtcReceived ? '#059669' : isBonus ? '#D97706' : GREEN;
  const sysBg     = isBtcReceived ? '#ECFDF5' : isBonus ? '#FFFBEB' : '#F0FDF4';

  return (
    <NCard n={n} onNavigate={onNavigate}>
      {/* Header */}
      <div style={{ padding: '14px 16px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ fontWeight: 900, fontSize: 15, color: '#0F172A' }}>PRAQEN</span>
          <div style={{ width: 22, height: 22, borderRadius: '50%', background: `linear-gradient(135deg,${sysColor},${sysColor}cc)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Megaphone size={11} color="#fff" />
          </div>
          <span style={{ fontSize: 12, color: T.g400, fontWeight: 600 }}>{tradeTimeStr(n.created_at)}</span>
          {!n.is_read && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#3B82F6', display: 'inline-block', flexShrink: 0 }} />}
        </div>
        <span style={{ fontSize: 12, fontWeight: 700, color: sysColor, background: sysBg, padding: '4px 12px', borderRadius: 8, flexShrink: 0 }}>
          {sysLabel}
        </span>
      </div>

      {/* Title row */}
      <div style={{ padding: '0 16px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 13, color: '#374151', fontWeight: 600, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {n.title || 'System notification'}
        </span>
        <span style={{ fontSize: 12, color: T.g400, fontWeight: 500, flexShrink: 0, whiteSpace: 'nowrap' }}>
          {absTime(n.created_at)}
        </span>
      </div>

      <NDivider />

      {/* Message body */}
      <div style={{ padding: '12px 16px 14px' }}>
        {msg && (
          <>
            <p style={{ margin: '0 0 8px', fontSize: 13, color: '#374151', lineHeight: 1.6, fontWeight: 500 }}>
              {expanded || !isLong ? msg : msg.slice(0, PREVIEW_LIMIT) + '…'}
            </p>
            {isLong && (
              <button onClick={e => { e.stopPropagation(); setExpanded(v => !v); }}
                style={{ padding: '3px 10px', borderRadius: 7, border: 'none', background: `${sysColor}15`, color: sysColor, fontSize: 11, fontWeight: 800, cursor: 'pointer' }}>
                {expanded ? '▲ Less' : '▼ Read more'}
              </button>
            )}
          </>
        )}
        {n.action && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: msg ? 8 : 0 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 800, color: sysColor }}>
              View <ArrowRight size={12} />
            </span>
          </div>
        )}
      </div>
    </NCard>
  );
}

// ─── REFERRAL CARD ────────────────────────────────────────────────────────────
function ReferralCard({ referral, onChat }) {
  const tc      = referral.trade_count || 0;
  const joinStr = referral.created_at
    ? new Date(referral.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    : '';
  return (
    <div style={{
      background: '#fff', borderRadius: 14, marginBottom: 10, padding: '12px 14px',
      border: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', gap: 10,
      boxShadow: '0 1px 6px rgba(0,0,0,0.06)',
    }}>
      <Avatar user={referral} name={referral.username} size={44} color={T.forest} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ fontWeight: 800, fontSize: 14, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {referral.username}
            <FlagBadge entity={referral} size={16} marginLeft={5} />
          </span>
        </div>
        <p style={{ margin: '3px 0 0', fontSize: 11, fontWeight: 500 }}>
          {tc > 0
            ? <span style={{ color: '#059669', fontWeight: 700 }}>✓ {tc} trade{tc !== 1 ? 's' : ''}</span>
            : <span style={{ color: T.warn, fontWeight: 700 }}>No trades yet</span>
          }
          {joinStr && <span style={{ color: T.g400 }}> · Joined {joinStr}</span>}
        </p>
      </div>
      <button
        onClick={() => onChat(referral)}
        style={{
          flexShrink: 0, padding: '7px 14px', borderRadius: 9, border: 'none',
          background: `linear-gradient(135deg,${T.forest},${T.mint})`,
          color: '#fff', fontSize: 12, fontWeight: 800, cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 5,
          boxShadow: '0 2px 8px rgba(27,67,50,0.3)',
        }}>
        <MessageCircle size={12} /> Chat
      </button>
    </div>
  );
}

// ─── Dispatcher ───────────────────────────────────────────────────────────────
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

const getTradeId = n =>
  n.trade?.id ? String(n.trade.id)
    : n.action?.match(UUID_RE)?.[0] ?? n.data?.trade_id ?? null;

// One card per trade: merge message notifications into the trade card badge
const dedupByTrade = list => {
  const groups = new Map();
  list.forEach(n => {
    const tid = getTradeId(n);
    if (!tid) return;
    const isMsg = n.type === 'message';
    if (!groups.has(tid)) {
      groups.set(tid, { best: n, hasUnread: isMsg && !n.is_read, count: isMsg && !n.is_read ? 1 : 0, hasNew: !!n._isNew });
    } else {
      const g = groups.get(tid);
      if (isMsg && !n.is_read) { g.hasUnread = true; g.count++; }
      if (n._isNew) g.hasNew = true;
      if (g.best.type === 'message' && !isMsg) g.best = n;
    }
  });
  const seen = new Set();
  return list.reduce((acc, n) => {
    const tid = getTradeId(n);
    if (!tid) { acc.push(n); return acc; }
    if (seen.has(tid)) return acc;
    seen.add(tid);
    const g = groups.get(tid);
    acc.push({ ...g.best, _hasUnreadMsg: g.hasUnread, _msgCount: g.count, _isNew: g.hasNew });
    return acc;
  }, []);
};

function NotifCard({ n, userId, onNavigate }) {
  const type = n.type || '';
  const [trade, setTrade] = useState(n.trade || null);

  // If backend didn't enrich the trade (old notifications), fetch it client-side
  useEffect(() => {
    if (trade) return;
    const isTradeType = type === 'trade' || type === 'message' || type === 'cancelled'
      || /trade|payment|dispute/i.test(type);
    if (!isTradeType) return;
    const uuidMatch = n.action?.match(UUID_RE) || n.data?.trade_id?.match(UUID_RE);
    const uuid = uuidMatch?.[0] || n.data?.trade_id;
    if (!uuid) return;
    const token = localStorage.getItem('token');
    fetch(`${API_URL}/trades/${uuid}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.trade || d?.id) setTrade(d.trade || d); })
      .catch(() => {});
  }, [n.action, n.data, type]); // eslint-disable-line

  if (type === 'profile_view' || /viewed your profile/i.test(n.message || '')) {
    return <ProfileViewCard n={n} onNavigate={onNavigate} />;
  }
  if (type === 'offer_view' || /viewed your offer/i.test((n.title || '') + (n.message || ''))) {
    return <OfferViewCard n={n} onNavigate={onNavigate} />;
  }
  if (type === 'message') {
    if (trade) return <TradeNotifCard n={n} trade={trade} userId={userId} onNavigate={onNavigate} isChat />;
    return <MessageCard n={n} onNavigate={onNavigate} />;
  }
  if (trade) {
    return <TradeNotifCard n={n} trade={trade} userId={userId} onNavigate={onNavigate} isChat={!!n._hasUnreadMsg} />;
  }
  return <BasicCard n={n} userId={userId} onNavigate={onNavigate} />;
}

// ─── Filter tabs ──────────────────────────────────────────────────────────────
// The "All" tab is intentionally removed — every notification lives under its
// own section tab (Trades | Views | Refs | News), never mixed together.
const FILTERS = [
  { id: 'trades',   label: 'Trades' },
  { id: 'views',    label: 'Views' },
  { id: 'referral', label: 'Refs' },
  { id: 'system',   label: 'News' },
];

const TRADE_TYPES = new Set(['trade', 'trade_cancel', 'cancelled', 'payment', 'dispute', 'message', 'support']);

function matchFilter(n, filter) {
  const type = (n.type || '').toLowerCase();
  const title = (n.title || '').toLowerCase();
  const msg = (n.message || '').toLowerCase();
  const action = (n.action || '').toLowerCase();

  if (filter === 'trades') {
    if (n.trade) return true;
    if (TRADE_TYPES.has(type)) return true;
    if (action.includes('/trade/')) return true;
    return /trade|payment|escrow|dispute/i.test(title + type);
  }
  if (filter === 'views')    return /profile_view|offer_view/i.test(type) || /viewed your/i.test(title + msg);
  if (filter === 'referral') return /referral|commission|affiliate/i.test(type + title + msg);
  if (filter === 'system')   return /update|broadcast|system|welcome|bonus|received|sent|transfer/i.test(type + title + msg);
  return true;
}

// ─── Main export ──────────────────────────────────────────────────────────────
export default function Notifications({ user }) {
  const navigate  = useNavigate();
  const ref       = useRef(null);
  const [notifs,   setNotifs]   = useState([]);
  const [showDrop, setShowDrop] = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [filter,   setFilter]   = useState('trades');
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 640);

  // ── Referral chat state ────────────────────────────────────────────────────
  const [referrals,   setReferrals]   = useState([]);
  const [myReferrer,  setMyReferrer]  = useState(null);
  const [refLoading,  setRefLoading]  = useState(false);
  const [chatRef,     setChatRef]     = useState(null);
  const [chatMsgs,    setChatMsgs]    = useState([]);
  const [chatInput,   setChatInput]   = useState('');
  const [chatSending, setChatSending] = useState(false);
  const [kbOffset,    setKbOffset]    = useState(0);
  const [toasts,       setToasts]     = useState([]);
  const chatBottomRef  = useRef(null);
  const chatInputRef   = useRef(null);
  const portalRef      = useRef(null);
  const seenIdsRef     = useRef(null); // tracks IDs from previous poll
  const errCountRef    = useRef(0);    // consecutive error count for backoff
  const [justArrivedIds, setJustArrivedIds] = useState(() => new Set()); // briefly highlights newly-arrived cards at the top

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Detect virtual keyboard height so chat input stays above it on mobile
  useEffect(() => {
    const vp = window.visualViewport;
    if (!vp) return;
    const onVPChange = () => {
      const kh = Math.max(0, window.innerHeight - vp.height - vp.offsetTop);
      setKbOffset(kh);
    };
    vp.addEventListener('resize', onVPChange);
    vp.addEventListener('scroll', onVPChange);
    return () => { vp.removeEventListener('resize', onVPChange); vp.removeEventListener('scroll', onVPChange); };
  }, []);

  const unread = notifs.filter(n => !n.is_read).length;
  const token  = () => localStorage.getItem('token');
  const hdrs   = () => ({ Authorization: `Bearer ${token()}` });

  const showToast = n => {
    const id = n.id + '-' + Date.now();
    setToasts(prev => [...prev, { id, title: n.title, message: n.message, action: n.action, trade: n.trade }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 6000);
  };

  const load = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const r = await axios.get(`${API_URL}/notifications`, { headers: hdrs(), timeout: 10000 });
      errCountRef.current = 0;
      // Backend already orders by created_at desc — re-sort defensively so the
      // newest notification always lands first regardless of any future backend change.
      const incoming = [...(r.data.notifications || [])]
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

      if (seenIdsRef.current === null) {
        // First load: show toasts for unread notifications created in the last 30 seconds
        // so a page-refresh or remount doesn't swallow recent trade/cancel alerts.
        const cutoff = Date.now() - 30_000;
        const recentUnread = incoming.filter(n => !n.is_read && new Date(n.created_at).getTime() > cutoff);
        const toastedKeys = new Set();
        recentUnread.slice(0, 3).forEach(n => {
          const key = `${n.title || ''}:${n.message || ''}`;
          if (!toastedKeys.has(key)) {
            toastedKeys.add(key);
            showToast(n);
          }
        });
      } else {
        // Subsequent polls: toast anything that is new since the last poll, and briefly
        // highlight those cards so the latest activity visibly "pops in" at the top.
        const freshIds = incoming.filter(n => !seenIdsRef.current.has(n.id)).map(n => n.id);
        if (freshIds.length) {
          setJustArrivedIds(new Set(freshIds));
          setTimeout(() => setJustArrivedIds(new Set()), 2600);
        }
        const freshUnread = incoming.filter(n => !n.is_read && freshIds.includes(n.id));
        const toastedKeys = new Set();
        freshUnread.slice(0, 3).forEach(n => {
          const key = `${n.title || ''}:${n.message || ''}`;
          if (!toastedKeys.has(key)) {
            toastedKeys.add(key);
            showToast(n);
          }
        });
      }
      seenIdsRef.current = new Set(incoming.map(n => n.id));
      setNotifs(incoming);
    } catch { errCountRef.current += 1; /* keep previous */ }
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (!user) return;
    load();
    // 15s base interval — fast enough that new trade activity feels near-live without
    // hammering the DB with the trade_ref lookup. Visibility handler (below) also
    // triggers an immediate refresh the moment the tab regains focus.
    const iv = setInterval(load, 15000);
    return () => clearInterval(iv);
  }, [user]); // eslint-disable-line

  useEffect(() => {
    const h = e => {
      const inBell   = ref.current    && ref.current.contains(e.target);
      const inPortal = portalRef.current && portalRef.current.contains(e.target);
      if (!inBell && !inPortal) setShowDrop(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  useEffect(() => {
    if (!user) return;
    const h = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', h);
    return () => document.removeEventListener('visibilitychange', h);
  }, [user]); // eslint-disable-line

  const markRead = async id => {
    setNotifs(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    try { await axios.put(`${API_URL}/notifications/${id}/read`, {}, { headers: hdrs() }); } catch {}
  };

  const markAllRead = async () => {
    setNotifs(prev => prev.map(n => ({ ...n, is_read: true })));
    try { await axios.put(`${API_URL}/notifications/read-all`, {}, { headers: hdrs() }); } catch {}
  };

  // ── Referral helpers ────────────────────────────────────────────────────────
  const loadReferrals = async () => {
    if (!user) return;
    setRefLoading(true);
    try {
      const r = await axios.get(`${API_URL}/my-referrals`, { headers: hdrs() });
      setReferrals(r.data.referrals || []);
      setMyReferrer(r.data.myReferrer || null);
    } catch {}
    finally { setRefLoading(false); }
  };

  const loadChatMsgs = async (uid) => {
    try {
      const r = await axios.get(`${API_URL}/referral-messages/${uid}`, { headers: hdrs() });
      setChatMsgs(r.data.messages || []);
    } catch {}
  };

  const sendChatMsg = async () => {
    if (!chatInput.trim() || !chatRef || chatSending) return;
    const text = chatInput.trim();
    setChatInput('');
    setChatSending(true);
    try {
      await axios.post(`${API_URL}/referral-messages/${chatRef.id}`, { message: text }, { headers: hdrs() });
      await loadChatMsgs(chatRef.id);
    } catch {}
    finally { setChatSending(false); }
  };

  // Load referrals when Referrals tab becomes active (not in chat)
  useEffect(() => {
    if (filter === 'referral' && user && !chatRef) loadReferrals();
  }, [filter, user, chatRef]); // eslint-disable-line

  // Poll chat messages while in a conversation
  useEffect(() => {
    if (!chatRef) { setChatMsgs([]); return; }
    loadChatMsgs(chatRef.id);
    const iv = setInterval(() => loadChatMsgs(chatRef.id), 5000);
    // Focus input after a short delay so the sheet has settled
    setTimeout(() => chatInputRef.current?.focus(), 350);
    return () => clearInterval(iv);
  }, [chatRef]); // eslint-disable-line

  // Auto-scroll messages container to bottom (same pattern as SuggestionsPanel)
  useEffect(() => {
    if (!chatBottomRef.current) return;
    chatBottomRef.current.scrollTop = chatBottomRef.current.scrollHeight;
  }, [chatMsgs]);

  const handleClick = n => {
    if (!n.is_read) markRead(n.id);
    setShowDrop(false);

    // For profile/offer view notifications: always land on the VIEWER's profile
    if (n.type === 'offer_view' || n.type === 'profile_view') {
      // New notifications store /profile/:uuid directly
      if (n.action?.startsWith('/profile/')) {
        navigate(n.action);
        return;
      }
      // Old notifications stored /listing/:id or /notifications — resolve viewer by username instead
      const nameMatch = (n.message || '').match(/^(.+?)\s+just\s+(?:viewed|browsed)/i);
      const viewerName = nameMatch?.[1];
      if (viewerName && viewerName !== 'Someone') {
        navigate(`/profile/${viewerName}`);
        return;
      }
      // Truly anonymous — nothing useful to navigate to
      return;
    }

    if (n.action) navigate(n.action);
  };

  const filtered = notifs.filter(n => matchFilter(n, filter));

  if (!user) return null;

  // ── Shared panel content (header + list + footer) ──────────────────────────
  const MobileFilters = [
    { id: 'trades',   label: 'Trades' },
    { id: 'views',    label: 'Views' },
    { id: 'referral', label: 'Refs' },
    { id: 'system',   label: 'News' },
  ];
  const tabDefs = isMobile ? MobileFilters : FILTERS;

  // True when the chat view should take over the full screen on mobile
  const mobileChat = isMobile && filter === 'referral' && !!chatRef;

  const PanelContent = (
    <>
      {/* ── Header — hidden on mobile when chat is open ── */}
      {/* TODO(design-cleanup): team lead flagged some header elements for removal — confirm which: "9+" unread bubble, "Offer View" pill duplicate of bell badge, eye icon on Offer Viewed cards. Remove only after team lead confirmation. */}
      {!mobileChat && <div style={{
        padding: isMobile ? '16px 18px 12px' : '14px 16px 10px',
        flexShrink: 0,
        borderBottom: `1px solid ${T.g200}`,
        backgroundColor: '#fff',
      }}>
        {/* Mobile drag handle */}
        {isMobile && (
          <div style={{
            width: 36, height: 4, borderRadius: 99,
            backgroundColor: T.g200, margin: '0 auto 14px',
          }} />
        )}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: isMobile ? 36 : 32, height: isMobile ? 36 : 32,
              borderRadius: 11,
              background: `linear-gradient(135deg,${T.forest},${T.mint})`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <Bell size={isMobile ? 17 : 15} color="#fff" />
            </div>
            <div>
              <p style={{ fontWeight: 900, fontSize: isMobile ? 17 : 15, color: '#0F172A', lineHeight: 1, margin: 0 }}>
                Notifications
              </p>
              <p style={{ fontSize: isMobile ? 12 : 11, color: T.g500, marginTop: 3, fontWeight: 700, margin: '3px 0 0' }}>
                {unread > 0 ? `${unread} unread` : 'All caught up'}
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {unread > 0 && (
              <button onClick={markAllRead}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  fontSize: isMobile ? 12 : 11, fontWeight: 700, color: T.green,
                  background: `${T.green}10`, border: `1px solid ${T.green}25`,
                  borderRadius: 9, padding: isMobile ? '7px 12px' : '4px 9px', cursor: 'pointer',
                }}>
                <CheckCheck size={isMobile ? 13 : 11} /> Mark all read
              </button>
            )}
            <button onClick={() => setShowDrop(false)}
              style={{
                background: T.g100, border: 'none', cursor: 'pointer',
                width: isMobile ? 36 : 28, height: isMobile ? 36 : 28,
                borderRadius: 9,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
              <X size={isMobile ? 17 : 14} color={T.g600} />
            </button>
          </div>
        </div>

        {/* Filter tabs */}
        <div style={{ display: 'flex', gap: isMobile ? 6 : 4 }}>
          {tabDefs.map(f => {
            const count = notifs.filter(n => !n.is_read && matchFilter(n, f.id)).length;
            const active = filter === f.id;
            return (
              <button key={f.id} onClick={() => { if (f.id !== 'referral') setChatRef(null); setFilter(f.id); }}
                style={{
                  flex: 1,
                  padding: isMobile ? '9px 6px' : '6px 4px',
                  borderRadius: 10, border: 'none',
                  fontSize: isMobile ? 12 : 10,
                  fontWeight: 800, cursor: 'pointer', textAlign: 'center',
                  backgroundColor: active ? T.forest : T.g100,
                  color: active ? '#fff' : T.g600,
                  transition: 'all 0.15s',
                  position: 'relative',
                }}>
                {f.label}
                {count > 0 && !active && (
                  <span style={{
                    position: 'absolute', top: -3, right: -3,
                    minWidth: 15, height: 15, borderRadius: 99, padding: '0 3px',
                    backgroundColor: T.danger, color: '#fff',
                    fontSize: 9, fontWeight: 900,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>{count > 9 ? '9+' : count}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>}

      {/* ── List / Referral panel ── */}
      {filter === 'referral' && chatRef ? (
        /* ── CHAT VIEW — mirrors SuggestionsPanel stable layout ── */
        <>
          {/* Green header bar */}
          <div style={{ flexShrink: 0, background: `linear-gradient(135deg,${T.forest},${T.mint})` }}>
            {isMobile && (
              <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 10, paddingBottom: 4 }}>
                <div style={{ width: 38, height: 4, borderRadius: 99, backgroundColor: 'rgba(255,255,255,0.3)' }} />
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', minHeight: isMobile ? 60 : 56 }}>
              <button
                onClick={() => { setChatRef(null); setChatInput(''); }}
                style={{ width: isMobile ? 40 : 32, height: isMobile ? 40 : 32, borderRadius: 12, border: 'none', background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, WebkitTapHighlightColor: 'transparent' }}>
                <ChevronLeft size={isMobile ? 22 : 18} color="white" />
              </button>
              <Avatar user={chatRef} name={chatRef.username} size={isMobile ? 38 : 32} color="rgba(255,255,255,0.2)" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontWeight: 900, fontSize: isMobile ? 15 : 13, color: '#fff', lineHeight: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {chatRef.username}
                  <FlagBadge entity={chatRef} size={14} marginLeft={6} />
                </p>
                <p style={{ margin: '3px 0 0', fontSize: isMobile ? 12 : 10, color: 'rgba(255,255,255,0.7)', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', backgroundColor: '#4ADE80', flexShrink: 0 }} />
                  {chatRef.trade_count > 0 ? `${chatRef.trade_count} trade${chatRef.trade_count !== 1 ? 's' : ''}` : 'No trades yet'} · Referral chat
                </p>
              </div>
              <button onClick={() => { setChatRef(null); setChatInput(''); setShowDrop(false); }}
                style={{ width: isMobile ? 40 : 32, height: isMobile ? 40 : 32, borderRadius: 12, border: 'none', background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, WebkitTapHighlightColor: 'transparent' }}>
                <X size={isMobile ? 18 : 14} color="white" />
              </button>
            </div>
          </div>

          {/* Messages — flex-1 + overflow-y:auto, exactly like SuggestionsPanel */}
          <div ref={chatBottomRef}
            style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: isMobile ? '14px 14px 6px' : '12px 12px 4px', backgroundColor: '#F8FAFC', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {chatMsgs.length === 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, textAlign: 'center', padding: '40px 20px' }}>
                <MessageCircle size={40} color={T.g400} />
                <p style={{ fontWeight: 800, fontSize: isMobile ? 15 : 14, color: T.g700, margin: '0 0 6px' }}>Start the conversation</p>
                <p style={{ fontSize: isMobile ? 13 : 12, color: T.g400, lineHeight: 1.6 }}>
                  Say hi to <strong>{chatRef.username}</strong> and encourage them to trade!
                </p>
              </div>
            )}
            {chatMsgs.map(m => {
              const mine = String(m.sender_id) === String(user?.id);
              return (
                <div key={m.id} style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start' }}>
                  <div style={{
                    maxWidth: '80%', padding: isMobile ? '10px 14px' : '8px 12px',
                    fontSize: isMobile ? 15 : 13, lineHeight: 1.5,
                    borderRadius: mine ? '18px 18px 4px 18px' : '4px 18px 18px 18px',
                    backgroundColor: mine ? T.forest : '#fff',
                    color: mine ? '#fff' : '#1E293B',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
                    wordBreak: 'break-word',
                  }}>
                    <p style={{ margin: 0 }}>{m.message}</p>
                    <p style={{ margin: '4px 0 0', fontSize: 10, opacity: 0.6, textAlign: mine ? 'right' : 'left' }}>
                      {relTime(m.created_at)}
                    </p>
                  </div>
                </div>
              );
            })}
            <div style={{ float: 'left', clear: 'both' }} />
          </div>

          {/* Input bar — flex-shrink-0, matches SuggestionsPanel exactly */}
          <div style={{
            flexShrink: 0,
            display: 'flex', gap: 8, alignItems: 'flex-end',
            padding: isMobile ? '10px 14px' : '10px 12px',
            paddingBottom: isMobile ? 'max(12px, env(safe-area-inset-bottom))' : 10,
            borderTop: `1.5px solid ${T.g200}`,
            backgroundColor: '#fff',
          }}>
            <textarea
              ref={chatInputRef}
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMsg(); } }}
              placeholder={`Message ${chatRef.username}…`}
              rows={1}
              style={{
                flex: 1, padding: isMobile ? '12px 14px' : '10px 12px',
                borderRadius: 14,
                fontSize: 16,
                resize: 'none', outline: 'none', lineHeight: 1.4,
                border: `2px solid ${chatInput ? T.forest : T.g200}`,
                maxHeight: isMobile ? 120 : 90,
                fontFamily: 'inherit',
                WebkitTapHighlightColor: 'transparent',
                transition: 'border-color 0.15s',
              }}
            />
            <button
              onClick={sendChatMsg}
              disabled={!chatInput.trim() || chatSending}
              style={{
                width: isMobile ? 48 : 40, height: isMobile ? 48 : 40,
                borderRadius: 14, border: 'none', cursor: 'pointer', flexShrink: 0,
                background: `linear-gradient(135deg,${T.forest},${T.mint})`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                opacity: (!chatInput.trim() || chatSending) ? 0.4 : 1,
                WebkitTapHighlightColor: 'transparent',
                transition: 'opacity 0.15s',
              }}>
              <Send size={isMobile ? 18 : 15} color="white" />
            </button>
          </div>
        </>

      ) : (
        <div style={{ overflowY: 'auto', flex: 1, WebkitOverflowScrolling: 'touch', background: '#F4F7FA', padding: '10px 10px 6px' }}>
          {filter === 'referral' ? (
            /* ── REFERRAL LIST ── */
            refLoading ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 0' }}>
                <div style={{ width: 30, height: 30, borderRadius: '50%', border: `2.5px solid ${T.mint}`, borderTopColor: 'transparent', animation: 'notif-spin 0.8s linear infinite', marginBottom: 12 }} />
                <p style={{ fontSize: 13, color: T.g400, fontWeight: 600 }}>Loading…</p>
                <style>{`@keyframes notif-spin{to{transform:rotate(360deg)}}`}</style>
              </div>
            ) : (referrals.length === 0 && !myReferrer) ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 24px', textAlign: 'center' }}>
                <Link size={44} color={T.g400} />
                <p style={{ fontWeight: 900, fontSize: 15, color: T.g700, marginBottom: 6 }}>No referrals yet</p>
                <p style={{ fontSize: 13, color: T.g400, lineHeight: 1.6, maxWidth: 260 }}>Share your referral link and earn rewards when friends join and start trading on PRAQEN.</p>
              </div>
            ) : (
              <>
                {/* ── Who referred me (reply back to referrer) ── */}
                {myReferrer && (
                  <div style={{ marginBottom: 14 }}>
                    <p style={{ fontSize: 11, color: T.mint, fontWeight: 800, margin: '2px 4px 8px', textTransform: 'uppercase', letterSpacing: 0.6 }}>
                      <Crown size={11} style={{ display: 'inline', marginRight: 2, verticalAlign: 'middle' }} /> Your Referrer
                    </p>
                    <ReferralCard referral={myReferrer} onChat={setChatRef} />
                    {referrals.length > 0 && (
                      <div style={{ height: 1, background: T.g200, margin: '14px 0 12px' }} />
                    )}
                  </div>
                )}
                {/* ── My referrals ── */}
                {referrals.length > 0 && (
                  <>
                    <p style={{ fontSize: 11, color: T.g400, fontWeight: 700, margin: '2px 4px 10px', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      <Link size={11} style={{ display: 'inline', marginRight: 2, verticalAlign: 'middle' }} /> My Referrals · {referrals.length}
                    </p>
                    {referrals.map(r => (
                      <ReferralCard key={r.id} referral={r} onChat={setChatRef} />
                    ))}
                  </>
                )}
              </>
            )
          ) : loading && notifs.length === 0 ? (
            /* ── LOADING ── */
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 0' }}>
              <div style={{ width: 30, height: 30, borderRadius: '50%', border: `2.5px solid ${T.mint}`, borderTopColor: 'transparent', animation: 'notif-spin 0.8s linear infinite', marginBottom: 12 }} />
              <p style={{ fontSize: 13, color: T.g400, fontWeight: 600 }}>Loading…</p>
              <style>{`@keyframes notif-spin{to{transform:rotate(360deg)}}`}</style>
            </div>
          ) : filtered.length === 0 ? (
            /* ── EMPTY ── */
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 24px', textAlign: 'center' }}>
              <div style={{ width: 60, height: 60, borderRadius: 18, backgroundColor: T.g100, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
                <Bell size={26} style={{ color: T.g400 }} />
              </div>
              <p style={{ fontWeight: 900, fontSize: 15, color: T.g700, marginBottom: 6 }}>
                {`No ${tabDefs.find(f => f.id === filter)?.label.toLowerCase()} notifications`}
              </p>
              <p style={{ fontSize: 13, color: T.g400, lineHeight: 1.6, maxWidth: 260 }}>
                {'Nothing here yet — check back soon.'}
              </p>
            </div>
          ) : (
            /* ── NOTIFICATION LIST ── */
            /* TODO(design-cleanup): team lead circled some card elements in red on reference screenshot — once annotated image available, remove flagged items (candidates: unread count bubble, "Offer View" pill, eye icon on Offer Viewed). Don't guess. */
            dedupByTrade(filtered.map(n => ({ ...n, _isNew: justArrivedIds.has(n.id) }))).map(n => (
              <NotifCard key={n.id} n={n} userId={user?.id} onNavigate={handleClick} />
            ))
          )}
        </div>
      )}

      {/* ── Footer (hidden in chat mode — chat has its own input) ── */}
      {!(filter === 'referral' && chatRef) && (
        <div style={{
          padding: isMobile ? '12px 18px' : '10px 16px',
          borderTop: `1px solid ${T.g200}`,
          backgroundColor: T.g50, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          paddingBottom: isMobile ? 'max(12px, env(safe-area-inset-bottom))' : 10,
        }}>
          {filter === 'referral' ? (
            <p style={{ fontSize: isMobile ? 13 : 12, color: T.g600, fontWeight: 700, margin: 0 }}>
              {referrals.length} referral{referrals.length !== 1 ? 's' : ''}
            </p>
          ) : (
            <p style={{ fontSize: isMobile ? 13 : 12, color: T.g600, fontWeight: 700, margin: 0 }}>
              {filtered.length} notification{filtered.length !== 1 ? 's' : ''}
              <span style={{ color: T.g400 }}> · {tabDefs.find(f => f.id === filter)?.label}</span>
            </p>
          )}
          <button
            onClick={() => { setShowDrop(false); navigate('/my-trades'); }}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              fontSize: isMobile ? 13 : 11, fontWeight: 900, color: T.green,
              background: 'none', border: 'none', cursor: 'pointer',
              padding: isMobile ? '8px 0' : '4px 0',
            }}>
            My trades <ArrowRight size={isMobile ? 13 : 11} />
          </button>
        </div>
      )}
    </>
  );

  return (
    <div className="relative" ref={ref} style={{ flexShrink: 0 }}>
      <style>{`
        @keyframes notif-pop-in {
          0%   { transform: scale(0.96) translateY(-6px); box-shadow: 0 0 0 0 rgba(45,106,79,0.35); }
          40%  { transform: scale(1.01) translateY(0); box-shadow: 0 0 0 6px rgba(45,106,79,0.12); }
          100% { transform: scale(1) translateY(0); box-shadow: 0 0 0 0 rgba(45,106,79,0); }
        }
        .notif-card-new { animation: notif-pop-in 0.55s ease-out; border-color: #2D6A4F !important; }
      `}</style>

      {/* ── Bell button ── */}
      <button
        onClick={() => { setShowDrop(v => !v); if (!showDrop) load(); }}
        style={{
          position: 'relative', padding: '8px', borderRadius: 12,
          border: 'none', background: 'transparent', cursor: 'pointer',
          minWidth: 40, minHeight: 40,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
        aria-label="Notifications">
        <Bell size={22} style={{ color: T.forest }} />
        {unread > 0 && (
          <span style={{
            position: 'absolute', top: 2, right: 2,
            minWidth: 18, height: 18, padding: '0 4px', borderRadius: 99,
            backgroundColor: T.danger, color: '#fff',
            fontSize: 10, fontWeight: 900,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            lineHeight: 1,
          }}>
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {/* ── MOBILE — portalled to body to escape Navbar stacking context ── */}
      {showDrop && isMobile && createPortal(
        <>
          {/* Backdrop */}
          <div
            onClick={() => { setShowDrop(false); setChatRef(null); }}
            style={{ position: 'fixed', inset: 0, zIndex: 1001, backgroundColor: 'rgba(0,0,0,0.45)' }}
          />
          {/* Sheet */}
          <div ref={portalRef} style={{
            position: 'fixed',
            bottom: 0, left: 0, right: 0,
            zIndex: 1002,
            backgroundColor: '#fff',
            borderRadius: mobileChat ? 0 : '22px 22px 0 0',
            display: 'flex', flexDirection: 'column',
            height: mobileChat ? '92dvh' : '90dvh',
            maxHeight: '92dvh',
            overflow: 'hidden',
            boxShadow: '0 -8px 40px rgba(0,0,0,0.18)',
          }}>
            {PanelContent}
          </div>
        </>,
        document.body
      )}

      {/* ── DESKTOP: dropdown ── */}
      {showDrop && !isMobile && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 8px)', right: 0,
          backgroundColor: '#fff',
          borderRadius: 18, border: `1px solid ${T.g200}`,
          display: 'flex', flexDirection: 'column',
          width: 'min(440px, calc(100vw - 32px))',
          maxHeight: '84vh',
          boxShadow: '0 20px 60px rgba(0,0,0,0.14)',
          overflow: 'hidden',
          zIndex: 999,
        }}>
          {PanelContent}
        </div>
      )}

      {/* ── Toast notifications portal ── */}
      {toasts.length > 0 && createPortal(
        <div style={{ position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 9999,
          display: 'flex', flexDirection: 'column', gap: 10, width: 'min(380px, calc(100vw - 32px))', pointerEvents: 'none' }}>
          {toasts.map(t => (
            <div key={t.id} style={{ pointerEvents: 'auto', background: '#fff',
              borderRadius: 16, boxShadow: '0 8px 32px rgba(0,0,0,0.18)', overflow: 'hidden',
              border: `1.5px solid ${T.g200}`, animation: 'prqSlideDown 0.3s ease' }}>
              <div style={{ height: 4, background: `linear-gradient(90deg,${T.forest},${T.mint})` }} />
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 14px' }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                  background: `linear-gradient(135deg,${T.forest},${T.mint})`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {(t.title || '').startsWith('💰') ? <DollarSign size={18} color="#fff" />
                    : (t.title || '').startsWith('🔒') ? <Lock size={18} color="#fff" />
                    : (t.title || '').startsWith('💬') ? <MessageCircle size={18} color="#fff" />
                    : (t.title || '').startsWith('❌') ? <XCircle size={18} color="#fff" />
                    : (t.title || '').startsWith('✅') ? <CheckCircle size={18} color="#fff" />
                    : <Bell size={18} color="#fff" />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontWeight: 800, fontSize: 13, color: '#0F172A',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {(t.title || '').replace(/^[^\w]+ ?/, '')}
                  </p>
                  <p style={{ margin: '3px 0 0', fontSize: 12, color: T.g500, lineHeight: 1.4,
                    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {t.message}
                  </p>
                  {t.trade && (
                    <p style={{ margin: '5px 0 0', fontSize: 11, fontWeight: 700, color: T.success,
                      background: '#ECFDF5', display: 'inline-block', padding: '2px 8px', borderRadius: 6 }}>
                      <Lock size={11} style={{ display: 'inline', marginRight: 3, verticalAlign: 'middle' }} /> Active Trade
                    </p>
                  )}
                </div>
                <button onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, flexShrink: 0,
                    color: T.g400, display: 'flex', alignItems: 'center' }}>
                  <X size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>,
        document.body
      )}

      <style>{`
        @keyframes prqSlideDown {
          from { opacity: 0; transform: translateY(-16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}