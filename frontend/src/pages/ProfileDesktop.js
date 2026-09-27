import React, { useState, useRef, useEffect } from 'react';
import { BadgeChip } from '../lib/badge';
import { useNavigate } from 'react-router-dom';
import {
  Copy, Edit2, Share2, Shield, Star, Clock, CheckCircle,
  Tag, Award, X, RefreshCw, ThumbsUp, ThumbsDown, Target,
  ShoppingBag, MessageCircle, ExternalLink, Calendar,
  ArrowUpDown, ChevronDown, ChevronUp, Users, TrendingUp,
  Check, UserPlus, UserX, UserMinus, User, Link2
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { copyToClipboard } from '../utils/clipboard';
import { toast } from 'react-toastify';
import CountryFlag from '../components/CountryFlag';

// ── Payment method ID → display name ──────────────────────────────────────────
const PAYMENT_METHOD_NAMES = {
  mtn_momo: 'MTN Mobile Money', vodafone: 'Vodafone Cash', airteltigo: 'AirtelTigo Money',
  mpesa: 'M-Pesa', airtel_money: 'Airtel Money', orange_money: 'Orange Money',
  wave: 'Wave', chipper: 'Chipper Cash', ecocash: 'EcoCash',
  tigo_pesa: 'Tigo Pesa', moov_money: 'Moov Money', africell: 'Africell Money',
  paga: 'Paga', paypal: 'PayPal', cash_app: 'Cash App',
  apple_pay: 'Apple Pay', alipay: 'Alipay', wechat_pay: 'WeChat Pay',
  venmo: 'Venmo', zelle: 'Zelle', revolut: 'Revolut',
  skrill: 'Skrill', neteller: 'Neteller', payeer: 'Payeer', perfect_money: 'Perfect Money',
  wise: 'Wise', worldremit: 'WorldRemit', remitly: 'Remitly',
  western_union: 'Western Union', moneygram: 'MoneyGram',
  opay: 'OPay', palmpay: 'PalmPay', kuda: 'Kuda Bank',
  moniepoint: 'Moniepoint', gtbank: 'GTBank', access: 'Access Bank',
  paystack: 'Paystack', flutterwave: 'Flutterwave',
  bank_transfer: 'Bank Transfer', wire_transfer: 'Wire Transfer',
  mobile_banking: 'Mobile Banking', interbank: 'Interbank',
  ussd: 'USSD Transfer', instant_eft: 'Instant EFT',
  cash_deposit: 'Cash Deposit', cash_person: 'Cash in Person', cash_out: 'Cash Out',
  usdt: 'USDT', binance_pay: 'Binance Pay', btc_pay: 'Bitcoin',
  eth_pay: 'Ethereum', luno: 'Luno Wallet', yellow_card: 'Yellow Card',
};
const PAYMENT_CURRENCY_LABELS = {
  GHS: 'GHS', NGN: 'NGN', KES: 'KES', ZAR: 'ZAR', USD: 'USD', GBP: 'GBP', EUR: 'EUR',
  UGX: 'UGX', TZS: 'TZS', XAF: 'XAF', XOF: 'XOF', RWF: 'RWF', ETB: 'ETB',
  PKR: 'PKR', BDT: 'BDT', INR: 'INR', AUD: 'AUD', CAD: 'CAD', SGD: 'SGD',
  PHP: 'PHP', MYR: 'MYR', THB: 'THB', VND: 'VND', IDR: 'IDR',
};
const LOW_AMOUNT_THRESHOLD_USD = 5; // NoOnes convention: trades under $5 are "low amount"

const C = {
  forest: '#1B4332', green: '#2D6A4F', mint: '#40916C', sage: '#52B788',
  gold: '#F4A422', amber: '#F59E0B', mist: '#F0FAF5', white: '#FFFFFF',
  g50: '#F8FAFC', g100: '#F1F5F9', g200: '#E2E8F0', g300: '#CBD5E1',
  g400: '#94A3B8', g500: '#64748B', g600: '#475569', g700: '#334155', g800: '#1E293B',
  success: '#10B981', danger: '#EF4444', warn: '#F59E0B', paid: '#3B82F6',
  online: '#22C55E', purple: '#8B5CF6',
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

// ── Share Profile Modal (Desktop — centered, not bottom sheet) ────────────────
function ShareProfileModal({ user, onClose }) {
  const profileUrl = `https://praqen.com/profile/${user?.username || user?.id || ''}`;
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    copyToClipboard(profileUrl, 'Profile link copied!');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const shareOptions = [
    { label: 'X', color: '#000', bg: '#000', icon: 'M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z' },
    { label: 'Facebook', color: '#fff', bg: '#1877F2', icon: 'M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z' },
    { label: 'Telegram', color: '#fff', bg: '#26A5E4', icon: 'M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71l-4.14-3.05-2 1.93c-.23.23-.42.42-.83.42z' },
    { label: 'WhatsApp', color: '#fff', bg: '#25D366', icon: 'M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z' },
    { label: 'Email', color: '#fff', bg: '#EA4335', icon: 'M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 010 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.91 1.528-1.145C21.69 2.28 24 3.434 24 5.457z' },
  ];

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 10000 }} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        width: '100%', maxWidth: 520, maxHeight: '85vh',
        background: '#fff', borderRadius: 20, zIndex: 10001,
        boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
        overflow: 'auto', display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{ padding: '20px 24px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 18, fontWeight: 900, color: C.g800 }}>Share profile</span>
          <button onClick={onClose} style={{
            width: 36, height: 36, borderRadius: '50%', border: 'none',
            background: C.g100, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <X size={18} color={C.g600} strokeWidth={2.5} />
          </button>
        </div>

        <div style={{ padding: '16px 24px 20px', display: 'flex', gap: 24, alignItems: 'center' }}>
          {/* Left: link + share icons */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Link field */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 14px', borderRadius: 10,
              background: C.g50, border: `1px solid ${C.g200}`,
              marginBottom: 16,
            }}>
              <Share2 size={16} color={C.g400} style={{ flexShrink: 0 }} />
              <span style={{
                flex: 1, fontSize: 13, fontWeight: 600, color: C.g600,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{profileUrl}</span>
              <button onClick={handleCopy} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'none', border: 'none', cursor: 'pointer',
                flexShrink: 0, padding: 0,
              }}>
                {copied ? <CheckCircle size={16} color={C.green} /> : <Copy size={16} color={C.g500} />}
              </button>
            </div>

            {/* Share via */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: C.g600 }}>Or share via</span>
              <div style={{ display: 'flex', gap: 12 }}>
                {shareOptions.map(opt => (
                  <button key={opt.label} style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: 0,
                  }} title={opt.label}>
                    <svg viewBox="0 0 24 24" width="22" height="22" fill={C.g500}><path d={opt.icon} /></svg>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Right: QR code */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <QRCodeSVG
              value={profileUrl}
              size={100}
              level="M"
              includeMargin={false}
              fgColor={C.g800}
              bgColor="#ffffff"
            />
          </div>
        </div>
      </div>
    </>
  );
}

// ── Feedback Dropdown ─────────────────────────────────────────────────────────
function FeedbackDropdown({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const options = [
    { id: 'all', label: 'All feedback', sub: 'Feedback from all traders' },
    { id: 'buyers', label: 'From buyers', sub: 'Feedback written by buyers' },
    { id: 'sellers', label: 'From sellers', sub: 'Feedback written by sellers' },
  ];

  const current = options.find(o => o.id === value) || options[0];

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setOpen(!open)} style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '7px 14px', borderRadius: 10, border: `1px solid ${C.g200}`,
        background: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 700, color: C.g700,
      }}>
        {current.label}
        <ChevronDown size={14} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', right: 0, zIndex: 100,
          minWidth: 220, background: '#fff', borderRadius: 14,
          boxShadow: '0 10px 40px rgba(0,0,0,0.12)', border: `1px solid ${C.g100}`,
          padding: '6px 0',
        }}>
          {options.map(opt => (
            <button key={opt.id} onClick={() => { onChange(opt.id); setOpen(false); }} style={{
              width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
              padding: '10px 16px', background: value === opt.id ? `${C.green}10` : 'transparent',
              border: 'none', cursor: 'pointer', textAlign: 'left', gap: 2,
            }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: value === opt.id ? C.green : C.g700 }}>{opt.label}</span>
              <span style={{ fontSize: 11, color: C.g400 }}>{opt.sub}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Desktop Profile Component ────────────────────────────────────────────
export default function ProfileDesktop({
  user, own, reviews, offers, badges, earned, displayFeedbackCount,
  score, trust, posPct, rating, trades, emailOk, phoneOk, kycOk,
  verifPct, status, trustCount, isTrusted, trustLoading,
  onToggleTrust, onAvatarUpload, uploading, fileRef,
  onEditProfile, onEditBio,
  isBlocked, blockedCount, onToggleBlock, blockLoading,
  sharedTrades, onSendCrypto,
}) {
  const navigate = useNavigate();
  const [contentTab, setContentTab] = useState(null); // 'offers' | 'feedback' | 'history' | null
  const [viewMore, setViewMore] = useState(false);
  const [feedbackFilter, setFeedbackFilter] = useState('all'); // 'all' | 'positive' | 'negative'
  const [feedbackRole, setFeedbackRole] = useState('all'); // 'all' | 'buyers' | 'sellers'
  const [shareOpen, setShareOpen] = useState(false);
  const [historyTypeFilter, setHistoryTypeFilter] = useState('buy'); // 'buy' | 'sell'

  const rawCC = (user.country || '').toUpperCase().slice(0, 2);
  const phoneCC = rawCC;
  const countryName = user.country_name || COUNTRY_NAMES[rawCC] || rawCC || null;

  const positiveReviews = reviews.filter(r => r.rating >= 4);
  const negativeReviews = reviews.filter(r => r.rating < 4);
  let filteredReviews = feedbackFilter === 'positive' ? positiveReviews : feedbackFilter === 'negative' ? negativeReviews : reviews;
  if (feedbackRole === 'buyers') filteredReviews = filteredReviews.filter(r => r.reviewer_role === 'buyer' || (!r.reviewer_role && r.trade_type === 'sell'));
  else if (feedbackRole === 'sellers') filteredReviews = filteredReviews.filter(r => r.reviewer_role === 'seller' || (!r.reviewer_role && r.trade_type === 'buy'));

  const handleEditProfile = onEditProfile || (() => {});
  const handleEditBio = onEditBio || (() => {});

  return (
    <div style={{ minHeight: '100vh', background: '#f4f5f7', fontFamily: "'Inter', 'Roboto', 'DM Sans', sans-serif" }}>
      <div style={{ maxWidth: 1440, margin: '0 auto', padding: '32px 24px 64px' }}>


        {/* ══════════════════════════════════════════════════════════════════════════
            TOP ROW: Identity (Left) & Bio (Right)
            ══════════════════════════════════════════════════════════════════════════ */}
        <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
          
          {/* Left: Identity Card */}
          <div style={{
            flex: '2 1 0%', minWidth: 0, background: '#fff', borderRadius: 8, padding: 24,
            display: 'flex', justifyContent: 'space-between',
            boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
          }}>
            <div style={{ display: 'flex', gap: 20 }}>
              {/* Avatar */}
              <div style={{ flexShrink: 0 }}>
                <div style={{
                  width: 96, height: 96, borderRadius: 12, overflow: 'hidden',
                  background: `linear-gradient(135deg, ${C.gold}, #FBBF24)`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                  {user.avatar_url
                    ? <img src={user.avatar_url} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <span style={{ fontSize: 36, fontWeight: 800, color: C.forest }}>{user.username?.charAt(0)?.toUpperCase() || '?'}</span>
                  }
                </div>
                <input ref={fileRef} type="file" accept="image/*" onChange={onAvatarUpload} style={{ display: 'none' }} />
              </div>

              {/* Info Block */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, justifyContent: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {rawCC && <span style={{ fontSize: 16 }}>{isoToFlag(rawCC)}</span>}
                  <span style={{ fontSize: 20, fontWeight: 700, color: '#111827' }}>{user.username}</span>
                  <BadgeChip user={user} size="lg" />
                  {isTrusted && <Shield size={16} color={C.success} fill={C.success} />}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 4 }}>
                    <Award size={16} color={C.success} />
                    <span style={{ fontSize: 11, fontWeight: 700, color: C.success, textTransform: 'uppercase' }}>
                      POWER
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                  {(() => {
                    const lastSeen = user.last_seen_at || user.last_login;
                    const isActive = lastSeen && (Date.now() - new Date(lastSeen).getTime()) < 300000;
                    return (
                      <>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: isActive ? C.success : C.g400 }} />
                        <span style={{ fontSize: 14, fontWeight: 600, color: '#4b5563' }}>
                          {isActive ? 'Active' : `Seen ${fmtAge(lastSeen)}`}
                        </span>
                      </>
                    );
                  })()}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginTop: 8, fontSize: 13, color: '#6b7280' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Calendar size={14} color="#9ca3af" />
                    Joined {user.created_at ? new Date(user.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                  </span>
                  {phoneOk && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Check size={14} color={C.success} /> Phone verified {phoneCC && <CountryFlag countryCode={phoneCC} className="w-4 h-3 rounded-sm inline-block" />}
                    </span>
                  )}
                  {kycOk && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Check size={14} color={C.success} /> ID verified {rawCC && <CountryFlag countryCode={rawCC} className="w-4 h-3 rounded-sm inline-block" />}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexShrink: 0 }}>
              {own ? (
                <>
                  <button onClick={handleEditProfile} style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '8px 16px', borderRadius: 8,
                    border: '1px solid #e5e7eb', background: '#fff',
                    cursor: 'pointer', fontSize: 14, fontWeight: 600, color: '#374151',
                    whiteSpace: 'nowrap', flexShrink: 0
                  }}>
                    <Edit2 size={14} color="#6b7280" /> Edit profile
                  </button>
                  <button onClick={() => setShareOpen(true)} style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '8px 16px', borderRadius: 8,
                    border: '1px solid #e5e7eb', background: '#fff',
                    cursor: 'pointer', fontSize: 14, fontWeight: 600, color: '#374151',
                    whiteSpace: 'nowrap', flexShrink: 0
                  }}>
                    <ExternalLink size={14} color="#6b7280" /> Share profile
                  </button>
                </>
              ) : (
                <>
                  <button onClick={onSendCrypto} style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '8px 16px', borderRadius: 8,
                    border: 'none', background: C.forest,
                    cursor: 'pointer', fontSize: 14, fontWeight: 600, color: '#fff',
                    whiteSpace: 'nowrap', flexShrink: 0
                  }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
                    Send crypto
                  </button>
                  <button onClick={() => setShareOpen(true)} style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '8px 16px', borderRadius: 8,
                    border: '1px solid #e5e7eb', background: '#fff',
                    cursor: 'pointer', fontSize: 14, fontWeight: 600, color: '#374151',
                    whiteSpace: 'nowrap', flexShrink: 0
                  }}>
                    <ExternalLink size={14} color="#6b7280" /> Share profile
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Right: Bio Card */}
          <div style={{
            flex: '1 1 0%', minWidth: 0, background: '#fff', borderRadius: 8, padding: '24px 32px',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            textAlign: 'center', boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
          }}>
            {user.bio ? (
              <>
                <p style={{ fontSize: 15, fontWeight: 700, color: '#111827', lineHeight: 1.4 }}>
                  {'“'}{user.bio}{'”'}
                </p>
                {own && (
                  <button onClick={handleEditBio} style={{
                    marginTop: 8, background: 'none', border: 'none',
                    fontSize: 13, fontWeight: 600, color: C.success, cursor: 'pointer', padding: 0
                  }}>
                    Edit bio
                  </button>
                )}
              </>
            ) : own ? (
              <>
                <p style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>
                  {'“'}{user.username} Trusted{'”'}
                </p>
                <button onClick={handleEditBio} style={{
                  marginTop: 8, background: 'none', border: 'none',
                  fontSize: 13, fontWeight: 600, color: C.success, cursor: 'pointer', padding: 0
                }}>
                  Edit bio
                </button>
              </>
            ) : (
              <p style={{ fontSize: 14, fontWeight: 500, color: '#94A3B8', fontStyle: 'italic' }}>
                This user hasn't added a bio yet
              </p>
            )}
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════════════════
            CARD 2: Stats
            ══════════════════════════════════════════════════════════════════════════ */}
        <div style={{
          background: '#fff', borderRadius: 8, padding: '24px 32px', marginBottom: 24,
          boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
        }}>
          {/* Top row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
            <div style={{ display: 'flex', gap: 64 }}>
              {/* Positive Feedback */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, whiteSpace: 'nowrap' }}>
                  <span style={{ fontSize: 13, color: '#6b7280', whiteSpace: 'nowrap' }}>Positive feedback</span>
                  <ThumbsUp size={14} color={C.success} />
                </div>
                <span style={{ fontSize: 24, fontWeight: 700, color: C.success }}>+{fmt(user.positive_feedback || 0)}</span>
              </div>
              {/* Negative Feedback */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, whiteSpace: 'nowrap' }}>
                  <span style={{ fontSize: 13, color: '#6b7280', whiteSpace: 'nowrap' }}>Negative feedback</span>
                  <ThumbsDown size={14} color={C.danger} />
                </div>
                <span style={{ fontSize: 24, fontWeight: 700, color: C.danger }}>-{fmt(user.negative_feedback || 0)}</span>
              </div>
              {/* Trades Success */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <span style={{ fontSize: 13, color: '#6b7280' }}>Trades success (30d)</span>
                </div>
                <span style={{ fontSize: 24, fontWeight: 700, color: '#111827' }}>{posPct}%</span>
              </div>
            </div>

            {/* Trust Pills */}
            <div style={{ display: 'flex', gap: 12 }}>
              {[
                { label: 'Trusted by', value: fmt(trustCount), icon: <UserPlus size={14} color="#9ca3af" /> },
                { label: 'Blocked by', value: fmt(blockedCount), icon: <UserX size={14} color="#9ca3af" /> },
                { label: 'Has blocked', value: fmt(user.has_blocked_count || 0), icon: <UserMinus size={14} color="#9ca3af" /> },
              ].map(({ label, value, icon }) => (
                <div key={label} style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '6px 12px', borderRadius: 4, background: '#f9fafb', border: '1px solid #f3f4f6',
                  whiteSpace: 'nowrap', flexShrink: 0, minWidth: 'fit-content'
                }}>
                  {icon}
                  <span style={{ fontSize: 12, color: '#6b7280', whiteSpace: 'nowrap' }}>{label}:</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#374151', whiteSpace: 'nowrap' }}>{value}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ height: 1, background: '#f3f4f6', margin: '0 -32px 24px' }} />

          {/* Bottom row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: 48 }}>
              {[
                { label: 'Trades', value: fmt(user.total_trades || 0), icon: <ArrowUpDown size={14} /> },
                { label: 'Partners', value: fmt(user.trade_partners || 0), icon: <Users size={14} /> },
                { label: 'Avg. pay (30d)', value: user.avg_time_to_payment ? `${user.avg_time_to_payment}m` : '—', icon: <Clock size={14} /> },
                { label: 'Avg. release (30d)', value: user.avg_time_to_release ? `${user.avg_time_to_release}m` : '—', icon: <Clock size={14} /> },
                { label: 'Volume (30d)', value: user.total_volume_30d ? `$ ${fmt(user.total_volume_30d)} USD` : '—', icon: <span style={{ fontSize: 14, fontWeight: 700 }}>$</span> },
              ].map(({ label, value, icon }) => (
                <div key={label}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, color: '#6b7280' }}>
                    {icon}
                    <span style={{ fontSize: 12, fontWeight: 600 }}>{label}</span>
                  </div>
                  <span style={{ fontSize: 16, fontWeight: 700, color: '#111827' }}>{value}</span>
                </div>
              ))}
            </div>

            <button onClick={() => setViewMore(!viewMore)} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 16px', borderRadius: 20, border: '1px solid #e5e7eb',
              background: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#374151'
            }}>
              <span style={{ display: 'flex', gap: 2 }}>
                <span style={{ width: 3, height: 3, borderRadius: '50%', background: '#6b7280' }} />
                <span style={{ width: 3, height: 3, borderRadius: '50%', background: '#6b7280' }} />
                <span style={{ width: 3, height: 3, borderRadius: '50%', background: '#6b7280' }} />
              </span>
              View {viewMore ? 'less' : 'more'}
            </button>
          </div>

          {viewMore && (
            <div style={{ marginTop: 24, paddingTop: 24, borderTop: '1px solid #f3f4f6' }}>
              <div style={{ display: 'flex', gap: 48, flexWrap: 'wrap' }}>
                {[
                  { label: 'Trust Score', value: score, color: trust.color },
                  { label: 'Average Rating', value: rating.toFixed(1), color: C.amber },
                  { label: 'Last Active', value: fmtAge(user.last_seen_at || user.last_login), color: C.success },
                  { label: 'Trader Status', value: status, color: '#111827' },
                  { label: 'Country', value: rawCC ? `${isoToFlag(rawCC)} ${COUNTRY_NAMES[rawCC] || rawCC}` : '—', color: '#374151' },
                ].map(({ label, value, color }) => (
                  <div key={label}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 4 }}>{label}</span>
                    <span style={{ fontSize: 15, fontWeight: 700, color }}>{value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Trust + Block buttons — only on other users' profiles */}
          {!own && (
            <div style={{ display: 'flex', gap: 12, marginTop: viewMore ? 0 : 20 }}>
              <button onClick={onToggleTrust} disabled={trustLoading} style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                padding: '10px 16px', borderRadius: 8,
                border: '1px solid #e5e7eb',
                background: '#fff',
                cursor: trustLoading ? 'not-allowed' : 'pointer',
                fontSize: 13, fontWeight: 700, color: '#374151',
                opacity: trustLoading ? 0.6 : 1,
              }}>
                {trustLoading ? <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> : isTrusted ? <UserMinus size={14} /> : <UserPlus size={14} />}
                {isTrusted ? 'Remove trust' : 'Trust'}
              </button>
              <button onClick={onToggleBlock} disabled={blockLoading} style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                padding: '10px 16px', borderRadius: 8,
                border: '1px solid #e5e7eb',
                background: '#fff',
                cursor: blockLoading ? 'not-allowed' : 'pointer',
                fontSize: 13, fontWeight: 700, color: '#374151',
                opacity: blockLoading ? 0.6 : 1,
              }}>
                {blockLoading ? <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> : isBlocked ? <UserX size={14} /> : <UserX size={14} />}
                {isBlocked ? 'Unblock' : 'Block'}
              </button>
            </div>
          )}
        </div>

        {/* ══════════════════════════════════════════════════════════════════════════
            TABS & CONTENT (NoOnes style — tabs outside card, then content)
            ══════════════════════════════════════════════════════════════════════════ */}
        <div style={{
          display: 'flex', gap: 32, marginBottom: 16, borderBottom: '2px solid #e5e7eb'
        }}>
          {[
            { id: 'offers', label: 'Offers', count: offers.length, icon: <ShoppingBag size={16} /> },
            { id: 'feedback', label: 'Feedback', count: displayFeedbackCount, icon: <Users size={16} /> },
            ...(!own ? [{ id: 'history', label: 'History', count: sharedTrades.length, icon: <ArrowUpDown size={16} /> }] : []),
          ].map(({ id, label, count, icon }) => {
            const active = contentTab === id || (contentTab === null && id === 'offers');
            return (
              <button key={id} onClick={() => setContentTab(id)} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '0 0 12px', border: 'none', background: 'transparent', cursor: 'pointer',
                color: active ? '#111827' : '#6b7280',
                fontSize: 15, fontWeight: active ? 700 : 600,
                borderBottom: active ? `2px solid #111827` : '2px solid transparent',
                marginBottom: -2, transition: 'all 0.15s'
              }}>
                {icon} {label} ({count})
              </button>
            );
          })}
        </div>

        {/* Tab Content area */}
        <div style={{ padding: '8px 0' }}>
          {(contentTab === 'offers' || contentTab === null) && (
            <div>
              {offers.length === 0 ? (
                <div style={{
                  background: '#f9fafb', borderRadius: 8, padding: 48,
                  textAlign: 'center', border: `1px solid #f3f4f6`,
                }}>
                  <div style={{
                    width: 72, height: 72, borderRadius: 18, background: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    margin: '0 auto 14px', border: `1px solid #f3f4f6`,
                  }}>
                    <Tag size={30} style={{ color: '#d1d5db' }} />
                  </div>
                  <p style={{ fontSize: 15, fontWeight: 700, color: '#374151', marginBottom: 4 }}>No active offers</p>
                  <p style={{ fontSize: 13, color: '#9ca3af', marginBottom: 16 }}>This user is not accepting trades right now.</p>
                  {own && (
                    <button onClick={() => navigate('/create-offer')} style={{
                      padding: '11px 24px', borderRadius: 8,
                      background: C.success, color: '#fff', border: 'none',
                      fontSize: 13, fontWeight: 700, cursor: 'pointer',
                    }}>
                      Create an offer
                    </button>
                  )}
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
                  {offers.map(offer => {
                    const type = (offer.listing_type || '').toUpperCase().includes('GIFT') ? 'gift'
                      : (offer.listing_type || '').toUpperCase().includes('SELL') ? 'sell' : 'buy';
                    const typeCfg = { sell: { label: 'Selling', color: C.green, bg: '#ECFDF5' }, buy: { label: 'Buying', color: C.paid, bg: '#EFF6FF' }, gift: { label: 'Gift Card', color: C.purple, bg: '#F5F3FF' } };
                    const cfg = typeCfg[type] || typeCfg.buy;
                    return (
                      <div key={offer.id} onClick={() => navigate(`/listing/${offer.id}`)} style={{
                        background: '#fff', borderRadius: 8, padding: 16,
                        border: `1px solid #e5e7eb`, cursor: 'pointer',
                        transition: 'box-shadow 0.15s', boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                      }}
                        onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.06)'}
                        onMouseLeave={e => e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.05)'}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                          <span style={{
                            fontSize: 11, fontWeight: 700, padding: '3px 8px',
                            borderRadius: 4, background: cfg.bg, color: cfg.color,
                          }}>
                            {cfg.label}
                          </span>
                          <span style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af' }}>{fmtAge(offer.created_at)}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div>
                            <p style={{ fontSize: 10, color: '#9ca3af', marginBottom: 2 }}>Price</p>
                            <p style={{ fontSize: 16, fontWeight: 700, color: '#111827' }}>
                              {offer.bitcoin_price ? `$${fmt(parseFloat(offer.bitcoin_price), 0)}` : '—'}
                            </p>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <p style={{ fontSize: 10, color: '#9ca3af', marginBottom: 2 }}>Limit</p>
                            <p style={{ fontSize: 13, fontWeight: 700, color: '#374151' }}>
                              {offer.min_limit_local ? `$${fmt(parseFloat(offer.min_limit_local))}` : '—'}
                              {offer.max_limit_local ? ` – $${fmt(parseFloat(offer.max_limit_local))}` : ''}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {contentTab === 'feedback' && (
            <div>
              {/* Filter row */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div style={{ display: 'flex', gap: 12 }}>
                  {[
                    { id: 'positive', label: 'Positive', icon: <ThumbsUp size={14} style={{ color: C.success }} /> },
                    { id: 'negative', label: 'Negative', icon: <ThumbsDown size={14} style={{ color: C.danger }} /> },
                  ].map(f => (
                    <button key={f.id} onClick={() => setFeedbackFilter(feedbackFilter === f.id ? 'all' : f.id)} style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '8px 16px', borderRadius: 20, 
                      border: `1px solid ${feedbackFilter === f.id ? '#111827' : '#e5e7eb'}`,
                      background: feedbackFilter === f.id ? '#f9fafb' : '#fff',
                      color: '#111827',
                      fontSize: 13, fontWeight: 700, cursor: 'pointer',
                      transition: 'all 0.15s'
                    }}>
                      {f.icon} {f.label}
                    </button>
                  ))}
                </div>
                <FeedbackDropdown value={feedbackRole} onChange={setFeedbackRole} />
              </div>

              {/* Feedback entries — 5-column NoOnes layout */}
              {filteredReviews.length === 0 ? (
                <div style={{
                  background: '#f9fafb', borderRadius: 8, padding: 40,
                  textAlign: 'center', border: `1px solid #f3f4f6`,
                }}>
                  <MessageCircle size={32} style={{ color: '#d1d5db', margin: '0 auto 10px' }} />
                  <p style={{ fontSize: 14, fontWeight: 700, color: '#6b7280' }}>No feedback yet</p>
                  <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>Complete trades to get feedback.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>

                  {filteredReviews.map(r => {
                    const payId = (r.payment_method || '').trim().toLowerCase();
                    const payName = PAYMENT_METHOD_NAMES[payId] || (r.payment_method || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                    const tradeCurrency = r.trade?.local_currency || r.trade?.currency_symbol || '';
                    const tradeAmountUsd = parseFloat(r.trade?.amount_usd || 0);
                    const isLowAmount = tradeAmountUsd > 0 && tradeAmountUsd < LOW_AMOUNT_THRESHOLD_USD;
                    const reviewerCC = (r.reviewer?.country || '').toUpperCase().slice(0, 2);
                    const listingId = r.trade?.listing_id || r.listing_id;

                    return (
                      <div key={r.id} style={{
                        display: 'flex', alignItems: 'center', padding: '14px 24px',
                        borderBottom: '1px solid #f3f4f6', background: '#fff',
                        transition: 'background 0.1s',
                      }}
                        onMouseEnter={e => e.currentTarget.style.background = '#f9fafb'}
                        onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                      >
                        {/* 1. Avatar + Flag + Username + Date + Sentiment */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: 240, flexShrink: 0 }}>
                          {/* Avatar — real photo or styled initial fallback */}
                          <div style={{
                            width: 36, height: 36, borderRadius: 8,
                            background: r.reviewer?.avatar_url ? 'none' : `linear-gradient(135deg, ${C.green}, #374151)`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            flexShrink: 0, overflow: 'hidden',
                            border: r.reviewer?.avatar_url ? 'none' : `1px solid ${C.g200}`,
                          }}>
                            {r.reviewer?.avatar_url
                              ? <img src={r.reviewer.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              : <span style={{ fontSize: 13, fontWeight: 800, color: '#fff' }}>{(r.reviewer?.username || 'T')[0].toUpperCase()}</span>
                            }
                          </div>

                          {/* Name + Date */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                              {reviewerCC && (
                                <CountryFlag countryCode={reviewerCC} className="w-4 h-3" style={{ flexShrink: 0 }} />
                              )}
                              <span style={{ fontWeight: 700, fontSize: 13, color: '#111827', cursor: 'pointer' }}
                                onClick={() => r.reviewer?.id && navigate(`/profile/${r.reviewer.id}`)}>
                                {r.reviewer?.username || 'Trader'}
                              </span>
                              {r.rating >= 4 ? (
                                <ThumbsUp size={11} style={{ color: C.success, flexShrink: 0 }} />
                              ) : (
                                <ThumbsDown size={11} style={{ color: C.danger, flexShrink: 0 }} />
                              )}
                            </div>
                            <span style={{ fontSize: 11, color: '#9ca3af', fontWeight: 500 }}>
                              {r.created_at ? new Date(r.created_at).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}
                            </span>
                          </div>
                        </div>

                        {/* 2. Comment */}
                        <div style={{ flex: 1, minWidth: 0, paddingRight: 20 }}>
                          {r.comment ? (
                            <span style={{ fontSize: 13, fontWeight: 600, color: '#374151', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                              {r.comment}
                            </span>
                          ) : (
                            <span style={{ fontSize: 12, color: '#d1d5db', fontStyle: 'italic' }}>—</span>
                          )}
                        </div>

                        {/* 3. Payment Method + Currency pill + Low Amount pill */}
                        <div style={{ width: 200, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
                          {r.payment_method ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                              <span style={{ fontSize: 12, fontWeight: 700, color: '#1f2937' }}>
                                {payName}
                              </span>
                              {tradeCurrency && (
                                <span style={{
                                  fontSize: 10, fontWeight: 700, color: '#111827', background: '#F3F4F6',
                                  padding: '1px 6px', borderRadius: 4,
                                }}>
                                  {tradeCurrency.toUpperCase()}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span style={{ fontSize: 12, color: '#d1d5db' }}>—</span>
                          )}
                          {isLowAmount && (
                            <span style={{
                              fontSize: 9, fontWeight: 800, color: '#fff', background: C.success,
                              padding: '2px 7px', borderRadius: 4, textTransform: 'uppercase', letterSpacing: '0.03em',
                            }}>
                              Low amount
                            </span>
                          )}
                        </div>

                        {/* 4. Trades count */}
                        <div style={{ width: 100, flexShrink: 0 }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: '#4b5563' }}>
                            Trades {r.trade_count || 0}
                          </span>
                        </div>

                        {/* 5. View Offer link */}
                        <div style={{ width: 100, flexShrink: 0, textAlign: 'right' }}>
                          {listingId ? (
                            <button onClick={() => navigate(`/listing/${listingId}`)} style={{
                              fontSize: 12, fontWeight: 600, color: C.green,
                              background: 'none', border: 'none', cursor: 'pointer',
                              textDecoration: 'underline', padding: 0,
                              display: 'inline-flex', alignItems: 'center', gap: 4,
                            }}>
                              View offer <Link2 size={11} />
                            </button>
                          ) : (
                            <span style={{ fontSize: 12, color: '#d1d5db' }}>—</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════════════
              HISTORY TAB — trade history between two users
              ══════════════════════════════════════════════════════════════════════════ */}
          {contentTab === 'history' && !own && (
            <div>
              {/* Buy/Sell toggle */}
              <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                {[{ id: 'buy', label: 'Buy', count: sharedTrades.filter(t => t.buyer_id === user?.id).length },
                  { id: 'sell', label: 'Sell', count: sharedTrades.filter(t => t.seller_id === user?.id).length },
                ].map(f => (
                  <button key={f.id} onClick={() => setHistoryTypeFilter(f.id)} style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '8px 16px', borderRadius: 20,
                    border: `1px solid ${historyTypeFilter === f.id ? '#111827' : '#e5e7eb'}`,
                    background: historyTypeFilter === f.id ? '#f9fafb' : '#fff',
                    color: '#111827',
                    fontSize: 13, fontWeight: 700, cursor: 'pointer',
                  }}>
                    {f.label} <span style={{ fontSize: 12, fontWeight: 600, color: '#9ca3af' }}>{f.count}</span>
                  </button>
                ))}
              </div>

              {sharedTrades.length === 0 ? (
                <div style={{
                  background: '#f9fafb', borderRadius: 8, padding: 48,
                  textAlign: 'center', border: '1px solid #f3f4f6',
                }}>
                  <div style={{
                    width: 72, height: 72, borderRadius: 18, background: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    margin: '0 auto 14px', border: '1px solid #f3f4f6',
                  }}>
                    <ArrowUpDown size={30} style={{ color: '#d1d5db' }} />
                  </div>
                  <p style={{ fontSize: 15, fontWeight: 700, color: '#374151', marginBottom: 4 }}>
                    You haven't traded with this user before
                  </p>
                  <p style={{ fontSize: 13, color: '#9ca3af', marginBottom: 16 }}>
                    Past trades will appear here once you trade with this user
                  </p>
                  <button onClick={() => navigate('/buy-bitcoin')} style={{
                    padding: '11px 24px', borderRadius: 8,
                    background: C.success, color: '#fff', border: 'none',
                    fontSize: 13, fontWeight: 700, cursor: 'pointer',
                  }}>
                    Trade now
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {sharedTrades
                    .filter(t => historyTypeFilter === 'buy' ? t.buyer_id === user?.id : t.seller_id === user?.id)
                    .map(trade => {
                      const isBuyer = trade.buyer_id === user?.id;
                      // Build status label from real trade data
                      // Defensive: sanitize cancel_reason to prevent raw error messages leaking to UI
                      const rawCancelReason = trade.cancel_reason || '';
                      const isErrorLeak = typeof rawCancelReason === 'string' &&
                        (rawCancelReason.includes('TypeError') || 
                         rawCancelReason.includes('fetch failed') ||
                         rawCancelReason.includes('Error:') ||
                         rawCancelReason.includes('stack') ||
                         (rawCancelReason.includes('at ') && rawCancelReason.includes('(')));
                      const cancelLabel = isErrorLeak ? '' : 
                        (rawCancelReason ? rawCancelReason.charAt(0).toUpperCase() + rawCancelReason.slice(1) : '');
                      const statusCfg = {
                        COMPLETED: { label: 'Completed', color: C.success, bg: '#ECFDF5' },
                        CANCELLED: { label: cancelLabel || 'Cancelled', color: C.g500, bg: '#F9FAFB' },
                        REFUNDED: { label: 'Refunded', color: C.warn, bg: '#FFFBEB' },
                        CREATED: { label: 'In progress', color: C.paid, bg: '#EFF6FF' },
                        FUNDS_LOCKED: { label: 'Escrow', color: C.paid, bg: '#EFF6FF' },
                        PAYMENT_SENT: { label: 'Payment sent', color: C.warn, bg: '#FFFBEB' },
                        DISPUTED: { label: 'Disputed', color: C.danger, bg: '#FEF2F2' },
                      };
                      // Defensive: sanitize status to prevent raw error messages leaking to UI
                      const rawStatus = trade.status || '';
                      const safeStatus = typeof rawStatus === 'string' && 
                        (rawStatus.includes('Error') || rawStatus.includes('TypeError') || 
                         rawStatus.includes('fetch failed') || rawStatus.includes('stack')) ? 
                        'STATUS_UNAVAILABLE' : rawStatus;
                      const sc = statusCfg[safeStatus] || { label: safeStatus === 'STATUS_UNAVAILABLE' ? 'Status unavailable' : (safeStatus || 'Unknown'), color: C.g500, bg: '#F9FAFB' };
                      const payName = PAYMENT_METHOD_NAMES[trade.payment_method?.toLowerCase()] || trade.payment_method || '—';
                      const completedTime = trade.completed_at || trade.cancelled_at;
                      const tradeCurrency = trade.local_currency || trade.currency_symbol || 'USD';

                      return (
                        <div key={trade.id} style={{
                          background: '#fff', borderRadius: 8, padding: 16,
                          border: '1px solid #e5e7eb',
                        }}>
                          {/* Row 1: Status tag */}
                          <div style={{ marginBottom: 10 }}>
                            <span style={{
                              fontSize: 11, fontWeight: 700, padding: '3px 8px',
                              borderRadius: 4, background: sc.bg, color: sc.color,
                            }}>
                              {sc.label}
                            </span>
                          </div>
                          {/* Row 2: Receive / Pay columns - dynamic based on trade type */}
                          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
                            {/* Left column: Fiat/payment side */}
                            <div>
                              <p style={{ fontSize: 10, color: '#9ca3af', marginBottom: 2, textTransform: 'uppercase', fontWeight: 600 }}>
                                {isBuyer ? `Receive ${payName !== '—' ? payName : ''}` : `Pay ${payName !== '—' ? payName : ''}`}
                              </p>
                              <p style={{ fontSize: 15, fontWeight: 800, color: '#111827' }}>
                                {isBuyer
                                  ? (trade.amount_local ? `${fmt(parseFloat(trade.amount_local))} ${tradeCurrency}` : trade.amount_usd ? `$${fmt(parseFloat(trade.amount_usd), 2)} USD` : '—')
                                  : (trade.amount_local ? `${fmt(parseFloat(trade.amount_local))} ${tradeCurrency}` : trade.amount_usd ? `$${fmt(parseFloat(trade.amount_usd), 2)} USD` : '—')
                                }
                              </p>
                            </div>
                            {/* Right column: BTC leg - shows fiat equivalent, NOT raw BTC */}
                            <div style={{ textAlign: 'right' }}>
                              <p style={{ fontSize: 10, color: '#9ca3af', marginBottom: 2, textTransform: 'uppercase', fontWeight: 600 }}>
                                {isBuyer ? 'Pay (BTC)' : 'Receive (BTC)'}
                              </p>
                              <p style={{ fontSize: 15, fontWeight: 800, color: '#111827' }}>
                                {isBuyer
                                  ? (trade.amount_local ? `${fmt(parseFloat(trade.amount_local))} ${tradeCurrency}` : trade.amount_usd ? `$${fmt(parseFloat(trade.amount_usd), 2)} USD` : '—')
                                  : (trade.amount_receive_usd ? `$${fmt(parseFloat(trade.amount_receive_usd), 2)} USD` : trade.amount_local ? `${fmt(parseFloat(trade.amount_local))} ${tradeCurrency}` : trade.amount_usd ? `$${fmt(parseFloat(trade.amount_usd), 2)} USD` : '—')
                                }
                              </p>
                            </div>
                          </div>
                          {/* Row 3: Completion status + relative time - static chevron, no expand */}
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderTop: '1px solid #f3f4f6' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <CheckCircle size={12} color={sc.color} />
                              <span style={{ fontSize: 12, fontWeight: 600, color: sc.color }}>{sc.label}</span>
                              {completedTime && (
                                <span style={{ fontSize: 12, color: '#9ca3af' }}>{fmtAge(completedTime)}</span>
                              )}
                            </div>
                            <ChevronDown size={16} color='#9ca3af' style={{ transform: 'none' }} />
                          </div>
                          {/* Row 4: Trade / Offer ID with copy icons */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 6, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 11, color: '#9ca3af' }}>
                              Trade:{' '}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigator.clipboard?.writeText(trade.id);
                                  toast.success('Trade ID copied!');
                                }}
                                style={{
                                  background: 'none', border: 'none', cursor: 'pointer',
                                  color: '#111827', fontSize: 11, fontWeight: 600,
                                  padding: '2px 6px', borderRadius: 4, display: 'inline-flex',
                                  alignItems: 'center', gap: 3, marginLeft: 4
                                }}
                              >
                                {trade.id.slice(0, 8).toUpperCase()}
                                <Copy size={10} />
                              </button>
                            </span>
                            {trade.listing_id && (
                              <span style={{ fontSize: 11, color: '#9ca3af', marginLeft: 4 }}>
                                Offer:{' '}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigator.clipboard?.writeText(trade.listing_id);
                                    toast.success('Offer ID copied!');
                                  }}
                                  style={{
                                    background: 'none', border: 'none', cursor: 'pointer',
                                    color: '#111827', fontSize: 11, fontWeight: 600,
                                    padding: '2px 6px', borderRadius: 4, display: 'inline-flex',
                                    alignItems: 'center', gap: 3
                                  }}
                                >
                                  {trade.listing_id.slice(0, 8).toUpperCase()}
                                  <Copy size={10} />
                                </button>
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {shareOpen && <ShareProfileModal user={user} onClose={() => setShareOpen(false)} />}
    </div>
  );
}
