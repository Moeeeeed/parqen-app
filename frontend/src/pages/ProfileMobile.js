import React, { useState, useRef } from 'react';
import { BadgeChip } from '../lib/badge';
import { useNavigate } from 'react-router-dom';
import {
  Copy, Edit2, Share2, ChevronDown, ChevronUp,
  ThumbsUp, ThumbsDown, Shield, Star, Clock, CheckCircle,
  Tag, Award, X, RefreshCw, User, Link2,
  ArrowUpDown, ShoppingBag, MessageCircle, ExternalLink, Target,
  UserPlus, UserX, UserMinus, Check
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { copyToClipboard } from '../utils/clipboard';
import { toast } from 'react-toastify';
import CountryFlag from '../components/CountryFlag';

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
const LOW_AMOUNT_THRESHOLD_USD = 5;

// ── Theme colors ─────────────────────────────────────────────────────────────
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

// ── Share Profile Bottom Sheet ────────────────────────────────────────────────
function ShareProfileSheet({ user, onClose }) {
  const profileUrl = `https://praqen.com/profile/${user?.username || user?.id || ''}`;
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    copyToClipboard(profileUrl, 'Profile link copied!');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const shareOptions = [
    { label: 'X', color: '#000', bg: '#000', icon: 'M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z' },
    { label: 'Facebook', color: '#fff', bg: '#1877F2', icon: 'M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z' },
    { label: 'Telegram', color: '#fff', bg: '#26A5E4', icon: 'M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71l-4.14-3.05-2 1.93c-.23.23-.42.42-.83.42z' },
    { label: 'WhatsApp', color: '#fff', bg: '#25D366', icon: 'M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z' },
    { label: 'Email', color: '#fff', bg: '#EA4335', icon: 'M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 010 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.91 1.528-1.145C21.69 2.28 24 3.434 24 5.457z' },
  ];

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 10000, animation: 'fadeIn 0.2s ease' }} />
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        width: '100%', maxHeight: '85vh',
        background: '#fff', borderRadius: '16px 16px 0 0', zIndex: 10001,
        boxShadow: '0 -4px 24px rgba(0,0,0,0.15)',
        overflow: 'hidden', display: 'flex', flexDirection: 'column',
        animation: 'slideUp 0.25s cubic-bezier(0.16,1,0.3,1)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 12, paddingBottom: 4 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: C.g200 }} />
        </div>
        <div style={{ padding: '4px 20px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 17, fontWeight: 900, color: C.g800 }}>Share profile</span>
          <button onClick={onClose} style={{
            width: 36, height: 36, borderRadius: '50%', border: 'none',
            background: C.g100, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <X size={18} color={C.g600} strokeWidth={2.5} />
          </button>
        </div>

        {/* Link input row */}
        <div style={{ padding: '0 16px', marginBottom: 16 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 14px', borderRadius: 10,
            background: C.g50, border: `1px solid ${C.g200}`,
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
        </div>

        {/* Share via */}
        <div style={{ padding: '0 16px', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'center' }}>
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

        {/* QR Code — real, scannable */}
        <div style={{ padding: '0 16px 24px', display: 'flex', justifyContent: 'center' }}>
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
    </>
  );
}

// ── Edit Profile Bottom Sheet ────────────────────────────────────────────────
function EditProfileSheet({ user, onClose, form, setForm, saving, saveProfile, onAvatarUpload, uploading, fileRef, editMode }) {
  const isBio = editMode === 'bio';
  const title = isBio ? 'Edit bio' : 'Edit profile';
  
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 10000, animation: 'fadeIn 0.2s ease' }} />
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        width: '100%', maxHeight: '85vh',
        background: '#fff', borderRadius: '16px 16px 0 0', zIndex: 10001,
        boxShadow: '0 -4px 24px rgba(0,0,0,0.15)',
        overflow: 'hidden', display: 'flex', flexDirection: 'column',
        animation: 'slideUp 0.25s cubic-bezier(0.16,1,0.3,1)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 12, paddingBottom: 4 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: C.g200 }} />
        </div>
        <div style={{ padding: '4px 20px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 17, fontWeight: 900, color: C.g800 }}>{title}</span>
          <button onClick={onClose} style={{
            width: 36, height: 36, borderRadius: '50%', border: 'none',
            background: C.g100, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <X size={18} color={C.g600} strokeWidth={2.5} />
          </button>
        </div>
        
        <div style={{ overflowY: 'auto', padding: '0 20px 24px' }}>
          {!isBio && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 24 }}>
              <div style={{ position: 'relative', width: 80, height: 80, marginBottom: 12 }}>
                <div style={{
                  width: '100%', height: '100%', borderRadius: 20, overflow: 'hidden',
                  background: `linear-gradient(135deg, ${C.gold}, #FBBF24)`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: `2px solid ${C.g200}`,
                }}>
                  {user?.avatar_url
                    ? <img src={user.avatar_url} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: uploading ? 0.5 : 1 }} />
                    : <span style={{ fontSize: 32, fontWeight: 900, color: C.forest, opacity: uploading ? 0.5 : 1 }}>{user?.username?.charAt(0)?.toUpperCase() || '?'}</span>
                  }
                </div>
                <button 
                  onClick={() => fileRef.current?.click()}
                  style={{
                    position: 'absolute', bottom: -6, right: -6,
                    width: 32, height: 32, borderRadius: 12, background: '#fff',
                    border: `2px solid ${C.g200}`, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                  }}
                >
                  {uploading ? <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Edit2 size={14} color={C.g700} />}
                </button>
              </div>
              <p style={{ fontSize: 12, color: C.g500, fontWeight: 600 }}>Tap to change photo</p>
            </div>
          )}

          {!isBio && (
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 800, color: C.g700, marginBottom: 6 }}>Username</label>
              <input 
                type="text" 
                value={form?.username || ''}
                onChange={e => setForm({ ...form, username: e.target.value })}
                style={{
                  width: '100%', padding: '12px 14px', borderRadius: 12,
                  border: `1.5px solid ${C.g200}`, background: C.g50,
                  fontSize: 14, fontWeight: 600, color: C.g800, boxSizing: 'border-box'
                }} 
              />
            </div>
          )}

          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 800, color: C.g700, marginBottom: 6 }}>Bio / Quote</label>
            <textarea 
              value={form?.bio || ''}
              onChange={e => setForm({ ...form, bio: e.target.value })}
              placeholder="A short intro or quote..."
              rows={4}
              maxLength={150}
              style={{
                width: '100%', padding: '12px 14px', borderRadius: 12,
                border: `1.5px solid ${C.g200}`, background: C.g50,
                fontSize: 14, fontWeight: 500, color: C.g800, boxSizing: 'border-box',
                resize: 'none', fontFamily: 'inherit'
              }} 
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
              <span style={{ fontSize: 11, color: (form?.bio?.length || 0) > 130 ? C.warn : C.g400 }}>
                {form?.bio?.length || 0}/150
              </span>
            </div>
          </div>
          
          <button 
            onClick={e => saveProfile(e)} 
            disabled={saving}
            style={{
              width: '100%', padding: '14px', borderRadius: 14, border: 'none',
              background: C.forest, color: '#fff', fontSize: 14, fontWeight: 800,
              cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8
            }}
          >
            {saving ? <><RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} /> Saving...</> : 'Save changes'}
          </button>
        </div>
      </div>
    </>
  );
}

// ── Main Mobile Profile Component ─────────────────────────────────────────────
export default function ProfileMobile({
  user, own, reviews, offers, badges, earned, displayFeedbackCount,
  score, trust, posPct, rating, trades, emailOk, phoneOk, kycOk,
  verifPct, status, trustCount, isTrusted, trustLoading,
  onToggleTrust, onAvatarUpload, uploading, fileRef,
  editing, setEditing, form, setForm, saving, saveProfile,
  isBlocked, blockedCount, onToggleBlock, blockLoading,
  sharedTrades, onSendCrypto,
}) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('profile');
  const [contentTab, setContentTab] = useState(null); // 'offers' | 'feedback' | 'history' | null
  const [viewMore, setViewMore] = useState(false);
  const [feedbackFilter, setFeedbackFilter] = useState('all');
  const [shareOpen, setShareOpen] = useState(false);
  const [editMode, setEditMode] = useState(null); // 'profile' | 'bio' | null
  const [historyTypeFilter, setHistoryTypeFilter] = useState('buy');

  // Sync editing prop
  React.useEffect(() => {
    if (editing && !editMode) setEditMode('profile');
    if (!editing && editMode) setEditMode(null);
  }, [editing]); // eslint-disable-line

  const handleCloseEdit = () => {
    setEditMode(null);
    setEditing && setEditing(false);
  };

  const rawCC = (user.country || '').toUpperCase().slice(0, 2);
  const phoneCC = rawCC;

  const positiveReviews = reviews.filter(r => r.rating >= 4);
  const negativeReviews = reviews.filter(r => r.rating < 4);
  const filteredReviews = feedbackFilter === 'positive' ? positiveReviews : feedbackFilter === 'negative' ? negativeReviews : reviews;

  const handleEditProfile = () => {
    navigate('/settings?tab=account');
  };
  const handleEditBio = () => {
    navigate('/settings?tab=account');
  };

  return (
    <div style={{ minHeight: '100vh', background: C.mist, fontFamily: "'DM Sans',sans-serif", paddingBottom: 72 }}>
      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
      `}</style>

      {/* ════════════════════════════════════════════════════════════════════════════
          CARD 1: Profile Identity Block
          ═══════════════════════════════════════════════════════════════════════════ */}
      <div style={{
        background: '#fff', margin: '12px 12px 0', padding: '20px 16px 16px',
        borderRadius: 16, boxShadow: '0 1px 4px rgba(15,23,42,0.06)',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
          {/* Avatar — plain square/rounded-square, no camera overlay */}
          <div style={{ flexShrink: 0 }}>
            <div style={{
              width: 72, height: 72, borderRadius: 16, overflow: 'hidden',
              background: `linear-gradient(135deg, ${C.gold}, #FBBF24)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: `2px solid ${C.g200}`,
            }}>
              {user.avatar_url
                ? <img src={user.avatar_url} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <span style={{ fontSize: 28, fontWeight: 900, color: C.forest }}>{user.username?.charAt(0)?.toUpperCase() || '?'}</span>
              }
            </div>
            {/* Hidden file input still needed for avatar upload via Edit profile */}
            <input ref={fileRef} type="file" accept="image/*" onChange={onAvatarUpload} style={{ display: 'none' }} />
          </div>

          {/* User info — everything left-aligned next to avatar */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Username row: flag + username + copy + badge — all inline */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              flexWrap: 'nowrap', marginBottom: 4, overflow: 'hidden',
            }}>
              {rawCC && <span style={{ fontSize: 14, flexShrink: 0 }}>{isoToFlag(rawCC)}</span>}
              <span style={{
                fontSize: 17, fontWeight: 900, color: C.g800,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {user.username}
              </span>
              <BadgeChip user={user} size="sm" />
              <button onClick={() => copyToClipboard(user.username || '', 'Username copied!')}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 24, height: 24, borderRadius: 6, border: 'none',
                  background: C.g100, cursor: 'pointer', flexShrink: 0,
                }}>
                <Copy size={11} color={C.g500} />
              </button>
              {/* Trust badge — inline on same row */}
              <span style={{
                fontSize: 10, fontWeight: 900, padding: '3px 8px',
                borderRadius: 99, background: trust.bg, color: trust.color,
                flexShrink: 0, whiteSpace: 'nowrap',
              }}>
                {trust.label.toUpperCase()}
              </span>
            </div>

            {/* Active status — real last-seen */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              {(() => {
                const lastSeen = user.last_seen_at || user.last_login;
                const isActive = lastSeen && (Date.now() - new Date(lastSeen).getTime()) < 300000;
                return (
                  <>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: isActive ? C.online : C.g400, flexShrink: 0 }} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: C.g500 }}>
                      {isActive ? 'Active' : `Seen ${fmtAge(lastSeen)}`}
                    </span>
                  </>
                );
              })()}
            </div>

            {/* Verification badges — pill/badge style with green check */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              {phoneOk && (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 3,
                  fontSize: 11, fontWeight: 700, padding: '3px 8px',
                  borderRadius: 99, background: '#ECFDF5', color: '#059669',
                }}>
                  <CheckCircle size={10} strokeWidth={2.5} /> Phone verified {phoneCC && <CountryFlag countryCode={phoneCC} className="w-3.5 h-2.5 rounded-sm inline-block" />}
                </span>
              )}
              {kycOk && (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 3,
                  fontSize: 11, fontWeight: 700, padding: '3px 8px',
                  borderRadius: 99, background: '#ECFDF5', color: '#059669',
                }}>
                  <CheckCircle size={10} strokeWidth={2.5} /> ID verified {rawCC && <CountryFlag countryCode={rawCC} className="w-3.5 h-2.5 rounded-sm inline-block" />}
                </span>
              )}
              {!phoneOk && !kycOk && (
                <span style={{ fontSize: 11, fontWeight: 600, color: C.g400 }}>No verifications yet</span>
              )}
            </div>
          </div>
        </div>

        {/* Action Buttons Row — inside same card */}
        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          {own ? (
            <button onClick={handleEditProfile} style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              padding: '11px 0', borderRadius: 12, border: 'none',
              background: C.g100, cursor: 'pointer', fontSize: 13, fontWeight: 800, color: C.g700,
            }}>
              <Edit2 size={14} /> Edit profile
            </button>
          ) : (
            <button onClick={onSendCrypto} style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              padding: '11px 0', borderRadius: 12, border: 'none',
              background: C.forest, cursor: 'pointer', fontSize: 13, fontWeight: 800, color: '#fff',
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
              Send crypto
            </button>
          )}
          <button onClick={() => setShareOpen(true)} style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            padding: '11px 0', borderRadius: 12, border: 'none',
            background: C.g100, cursor: 'pointer', fontSize: 13, fontWeight: 800, color: C.g700,
          }}>
            <Share2 size={14} /> Share profile
          </button>
        </div>

        {/* Bio — inside same card */}
        {user.bio ? (
          <div style={{ marginTop: 14 }}>
            <p style={{
              fontSize: 13, fontWeight: 600, color: C.g600, textAlign: 'center',
              lineHeight: 1.6, fontStyle: 'italic',
            }}>
              &ldquo;{user.bio}&rdquo;
            </p>
            {own && (
              <button onClick={handleEditBio} style={{
                display: 'block', margin: '6px auto 0', background: 'none', border: 'none',
                fontSize: 12, fontWeight: 700, color: C.green, cursor: 'pointer',
                textDecoration: 'underline', padding: 0,
              }}>
                Edit bio
              </button>
            )}
          </div>
        ) : !own ? (
          <div style={{ marginTop: 14 }}>
            <p style={{
              fontSize: 13, fontWeight: 500, color: C.g400, textAlign: 'center',
              lineHeight: 1.6, fontStyle: 'italic',
            }}>
              This user hasn't added a bio yet
            </p>
          </div>
        ) : null}

        {/* P2P migrated badge */}
        {user.p2p_migrated_platform && (
          <div style={{
            marginTop: 12, padding: '8px 12px', borderRadius: 10,
            background: '#FFFBEB', border: '1px solid #FDE68A',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <Award size={14} style={{ color: '#92400E', flexShrink: 0 }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: '#92400E' }}>
              Verified P2P Trader{user.p2p_migrated_username ? ` · @${user.p2p_migrated_username}` : ''}
            </span>
          </div>
        )}
      </div>

      {/* ════════════════════════════════════════════════════════════════════════════
          CARD 2: Tabs + Stats Content
          ═══════════════════════════════════════════════════════════════════════════ */}
      <div style={{
        background: '#ffffff', margin: '12px 12px 0', borderRadius: 16,
        boxShadow: '0 1px 4px rgba(15,23,42,0.06)', overflow: 'hidden',
      }}>
        {/* Segmented Tab Control — connected, single rounded container */}
        <div style={{
          display: 'inline-flex', width: 'auto', margin: '16px 16px 0', borderRadius: 12,
          background: C.g100, padding: 3,
        }}>
          {[
            { id: 'profile', label: 'Profile' },
            { id: 'trade-stats', label: 'Trade statistics' },
          ].map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
              padding: '9px 14px', borderRadius: 10, border: 'none',
              background: activeTab === t.id ? '#fff' : 'transparent',
              color: activeTab === t.id ? C.g800 : C.g500,
              fontSize: 13, fontWeight: 800, cursor: 'pointer',
              boxShadow: activeTab === t.id ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              transition: 'all 0.15s',
            }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Profile Tab Content — label first, icon after */}
        {activeTab === 'profile' && (
          <div style={{ padding: '12px 16px 16px' }}>
            {[
              { label: 'Positive feedback', value: `+${fmt(user.positive_feedback || 0)}`, color: C.success, icon: <ThumbsUp size={14} style={{ color: C.success }} /> },
              { label: 'Negative feedback', value: `-${fmt(user.negative_feedback || 0)}`, color: C.danger, icon: <ThumbsDown size={14} style={{ color: C.danger }} /> },
              { label: 'Trades success (30d)', value: `${posPct}%`, color: C.g800, icon: null },
              { label: 'Joined', value: user.created_at ? new Date(user.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—', color: C.g600, icon: null },
            ].map(({ label, value, color, icon }, i, arr) => (
              <div key={label} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 0',
                borderBottom: i < arr.length - 1 ? `1px solid ${C.g100}` : 'none',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: C.g700 }}>{label}</span>
                  {icon && <span style={{ color: C.g400, display: 'flex', alignItems: 'center' }}>{icon}</span>}
                </div>
                <span style={{ fontSize: 14, fontWeight: 900, color }}>{value}</span>
              </div>
            ))}
          </div>
        )}

        {/* Trade Statistics Tab Content */}
        {activeTab === 'trade-stats' && (
          <div style={{ padding: '12px 16px 16px' }}>
            {[
              { label: 'Trades released', value: fmt(user.total_trades || 0), color: C.g800 },
              { label: 'Trade partners', value: fmt(user.trade_partners || 0), color: C.g800 },
              { label: 'Avg. time to payment (30d)', value: user.avg_time_to_payment ? `${user.avg_time_to_payment}m` : '—', color: C.g800 },
              { label: 'Avg. time to release (30d)', value: user.avg_time_to_release ? `${user.avg_time_to_release}m` : '—', color: C.g800 },
              { label: 'Total volume (30d)', value: user.total_volume_30d ? `$${fmt(user.total_volume_30d)}` : '—', color: C.forest },
            ].map(({ label, value, color }, i, arr) => (
              <div key={label} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '13px 0',
                borderBottom: i < arr.length - 1 ? `1px solid ${C.g100}` : 'none',
              }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: C.g600 }}>{label}</span>
                <span style={{ fontSize: 14, fontWeight: 900, color }}>{value}</span>
              </div>
            ))}
          </div>
        )}

        {/* Trust Counters — horizontal: icon + label : value, all on one line */}
        <div style={{
          display: 'flex', gap: 6, padding: '0 16px 16px',
        }}>
          {[
            { label: 'Trusted by', value: fmt(trustCount), icon: <UserPlus size={14} color="#9ca3af" /> },
            { label: 'Blocked by', value: fmt(blockedCount), icon: <UserX size={14} color="#9ca3af" /> },
            { label: 'Has blocked', value: fmt(user.has_blocked_count || 0), icon: <UserMinus size={14} color="#9ca3af" /> },
          ].map(({ label, value, icon }) => (
            <div key={label} style={{
              flex: 1, padding: '8px 6px', borderRadius: 10,
              background: C.g50, border: `1px solid ${C.g100}`,
              display: 'flex', alignItems: 'center', gap: 4,
            }}>
              {icon}
              <span style={{ fontSize: 10, fontWeight: 700, color: C.g500, whiteSpace: 'nowrap' }}>{label}:</span>
              <span style={{ fontSize: 12, fontWeight: 900, color: C.g800 }}>{value}</span>
            </div>
          ))}
        </div>

        {/* View More — leading icon + text only, no trailing chevron */}
        <div style={{ padding: '0 16px 16px' }}>
          <button onClick={() => setViewMore(!viewMore)} style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            padding: '11px 0', borderRadius: 12, border: `1px solid ${C.g200}`,
            background: C.g50, cursor: 'pointer', fontSize: 13, fontWeight: 800, color: C.g600,
          }}>
            <ChevronDown size={16} style={{ transform: viewMore ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
            {viewMore ? 'View less' : 'View more'}
          </button>

          {viewMore && (
            <div style={{ marginTop: 10, background: C.g50, borderRadius: 12, overflow: 'hidden', border: `1px solid ${C.g100}` }}>
              {[
                { label: 'Trust Score', value: score, color: trust.color },
                { label: 'Average Rating', value: rating.toFixed(1), color: C.amber },
                { label: 'Total Trades', value: fmt(trades), color: C.forest },
                { label: 'Last Active', value: fmtAge(user.last_seen_at || user.last_login), color: C.success },
                { label: 'Trader Status', value: status, color: C.g800 },
                { label: 'Country', value: rawCC ? `${isoToFlag(rawCC)} ${COUNTRY_NAMES[rawCC] || rawCC}` : '—', color: C.g700 },
              ].map(({ label, value, color }, i, arr) => (
                <div key={label} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '12px 14px',
                  borderBottom: i < arr.length - 1 ? `1px solid ${C.g100}` : 'none',
                }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: C.g500 }}>{label}</span>
                  <span style={{ fontSize: 13, fontWeight: 900, color }}>{value}</span>
                </div>
              ))}
            </div>
          )}

          {/* Trust + Block buttons — only on other users' profiles */}
          {!own && (
            <div style={{ display: 'flex', gap: 10, marginTop: viewMore ? 0 : 12 }}>
              <button onClick={onToggleTrust} disabled={trustLoading} style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                padding: '11px 0', borderRadius: 12, border: 'none',
                background: C.g100,
                cursor: trustLoading ? 'not-allowed' : 'pointer',
                fontSize: 13, fontWeight: 800, color: C.g700,
                opacity: trustLoading ? 0.6 : 1,
              }}>
                {trustLoading ? <RefreshCw size={14} /> : isTrusted ? <UserMinus size={14} /> : <UserPlus size={14} />}
                {isTrusted ? 'Remove trust' : 'Trust'}
              </button>
              <button onClick={onToggleBlock} disabled={blockLoading} style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                padding: '11px 0', borderRadius: 12, border: 'none',
                background: C.g100,
                cursor: blockLoading ? 'not-allowed' : 'pointer',
                fontSize: 13, fontWeight: 800, color: C.g700,
                opacity: blockLoading ? 0.6 : 1,
              }}>
                {blockLoading ? <RefreshCw size={14} /> : <UserX size={14} />}
                {isBlocked ? 'Unblock' : 'Block'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════════════════
          CARD 3: Offers & Feedback Toggle + Content
          ═══════════════════════════════════════════════════════════════════════════ */}
      <div style={{
        background: '#fff', margin: '12px 12px 0', borderRadius: 16,
        boxShadow: '0 1px 4px rgba(15,23,42,0.06)', overflow: 'hidden',
      }}>
        {/* Offers/Feedback/History toggle — plain tab-style text links, not solid buttons */}
        <div style={{
          display: 'flex', padding: '12px 16px 0', gap: 20,
          borderBottom: `1px solid ${C.g100}`,
          overflowX: 'auto',
        }}>
          {[
            { id: 'offers', label: 'Offers', count: offers.length, icon: <ShoppingBag size={15} /> },
            { id: 'feedback', label: 'Feedback', count: displayFeedbackCount, icon: <MessageCircle size={15} /> },
            ...(!own ? [{ id: 'history', label: 'History', count: sharedTrades.length, icon: <ArrowUpDown size={15} /> }] : []),
          ].map(({ id, label, count, icon }) => (
            <button key={id} onClick={() => setContentTab(contentTab === id ? null : id)} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '0 0 8px', borderRadius: 0, border: 'none', borderBottom: '2px solid transparent',
              borderBottomColor: contentTab === id ? C.green : 'transparent',
              background: 'transparent', cursor: 'pointer',
              color: contentTab === id ? C.green : C.g500,
              fontSize: 13, fontWeight: contentTab === id ? 900 : 700,
              transition: 'all 0.15s',
            }}>
              {icon} {label} ({count})
            </button>
          ))}
        </div>

        {/* ── Feedback List Content ──────────────────────────────────────── */}
        {contentTab === 'feedback' && (
          <div style={{ padding: '12px 16px 16px' }}>
            {/* Sub-filter row */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ display: 'flex', gap: 6 }}>
                {[
                  { id: 'positive', label: 'Positive' },
                  { id: 'negative', label: 'Negative' },
                ].map(f => (
                  <button key={f.id} onClick={() => setFeedbackFilter(feedbackFilter === f.id ? 'all' : f.id)} style={{
                    padding: '5px 12px', borderRadius: 20, border: 'none',
                    background: feedbackFilter === f.id ? C.green : C.g100,
                    color: feedbackFilter === f.id ? '#fff' : C.g600,
                    fontSize: 11, fontWeight: 700, cursor: 'pointer',
                  }}>
                    {f.label}
                  </button>
                ))}
              </div>
              <button style={{
                width: 32, height: 32, borderRadius: 8, border: `1px solid ${C.g200}`,
                background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <ArrowUpDown size={14} color={C.g500} />
              </button>
            </div>

            {filteredReviews.length === 0 ? (
              <div style={{ padding: 32, textAlign: 'center' }}>
                <MessageCircle size={28} style={{ color: C.g300, margin: '0 auto 8px' }} />
                <p style={{ fontSize: 13, fontWeight: 700, color: C.g500 }}>
                  {feedbackFilter === 'positive' ? 'No positive feedback yet' : feedbackFilter === 'negative' ? 'No negative feedback' : 'No feedback yet'}
                </p>
                <p style={{ fontSize: 12, color: C.g400, marginTop: 4 }}>
                  {feedbackFilter === 'all' ? 'Complete trades to get feedback.' : 'Try a different filter.'}
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {filteredReviews.map((r, idx) => {
                  const payId = (r.payment_method || '').trim().toLowerCase();
                  const payName = PAYMENT_METHOD_NAMES[payId] || (r.payment_method || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                  const tradeCurrency = r.trade?.local_currency || r.trade?.currency_symbol || '';
                  const tradeAmountUsd = parseFloat(r.trade?.amount_usd || 0);
                  const isLowAmount = tradeAmountUsd > 0 && tradeAmountUsd < LOW_AMOUNT_THRESHOLD_USD;
                  const reviewerCC = (r.reviewer?.country || '').toUpperCase().slice(0, 2);
                  const listingId = r.trade?.listing_id || r.listing_id;

                  return (
                    <React.Fragment key={r.id}>
                      <div style={{ padding: '14px 0' }}>
                        {/* Row 1: Avatar + Flag + Username + Date ... View offer */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                            {/* Avatar — real photo or styled initial fallback */}
                            <div style={{
                              width: 30, height: 30, borderRadius: 8,
                              background: r.reviewer?.avatar_url ? 'none' : `linear-gradient(135deg, ${C.green}, ${C.g800})`,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              flexShrink: 0, overflow: 'hidden',
                              border: r.reviewer?.avatar_url ? 'none' : `1px solid ${C.g200}`,
                            }}>
                              {r.reviewer?.avatar_url
                                ? <img src={r.reviewer.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                : <span style={{ fontSize: 11, fontWeight: 800, color: '#fff' }}>{(r.reviewer?.username || 'T')[0].toUpperCase()}</span>
                              }
                            </div>
                            {reviewerCC && (
                              <CountryFlag countryCode={reviewerCC} className="w-4 h-3" style={{ flexShrink: 0 }} />
                            )}
                            <span style={{ fontWeight: 800, fontSize: 13, color: C.g800, textDecoration: 'underline', cursor: 'pointer' }}
                              onClick={() => r.reviewer?.id && navigate(`/profile/${r.reviewer.id}`)}>
                              {r.reviewer?.username || 'Trader'}
                            </span>
                            <span style={{ fontSize: 11, color: C.g400 }}>{fmtAge(r.created_at)}</span>
                          </div>
                          {listingId && (
                            <button onClick={() => navigate(`/listing/${listingId}`)} style={{
                              fontSize: 11, fontWeight: 700, color: C.green,
                              background: 'none', border: 'none', cursor: 'pointer',
                              display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0,
                              textDecoration: 'underline', padding: 0,
                            }}>
                              View offer <Link2 size={10} />
                            </button>
                          )}
                        </div>

                        {/* Row 2: Sentiment icon + full date */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6, marginLeft: 38 }}>
                          {r.rating >= 4 ? (
                            <ThumbsUp size={12} style={{ color: C.success }} />
                          ) : (
                            <ThumbsDown size={12} style={{ color: C.danger }} />
                          )}
                          <span style={{ fontSize: 11, color: C.g400 }}>
                            {r.created_at ? new Date(r.created_at).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}
                          </span>
                        </div>

                        {/* Comment */}
                        {r.comment && (
                          <p style={{ fontSize: 13, color: C.g700, lineHeight: 1.5, marginBottom: 8, marginLeft: 0 }}>
                            {r.comment}
                          </p>
                        )}

                        {/* Row 3: Payment method + currency + LOW AMOUNT + Trades count */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            {r.payment_method ? (
                              <>
                                <span style={{ fontSize: 12, fontWeight: 800, color: '#1f2937' }}>
                                  {payName}
                                </span>
                                {tradeCurrency && (
                                  <span style={{
                                    fontSize: 10, fontWeight: 700, color: C.g800, background: C.g100,
                                    padding: '1px 6px', borderRadius: 4,
                                  }}>
                                    {tradeCurrency.toUpperCase()}
                                  </span>
                                )}
                              </>
                            ) : null}
                            {isLowAmount && (
                              <span style={{
                                fontSize: 9, fontWeight: 800, padding: '2px 7px',
                                borderRadius: 4, background: C.success, color: '#fff',
                                textTransform: 'uppercase', letterSpacing: '0.03em',
                              }}>
                                LOW AMOUNT
                              </span>
                            )}
                          </div>
                          {r.trade_count != null && (
                            <span style={{ fontSize: 11, color: C.g500, fontWeight: 600 }}>
                              Trades {r.trade_count}
                            </span>
                          )}
                        </div>
                      </div>
                      {idx < filteredReviews.length - 1 && (
                        <div style={{ height: 1, background: C.g100 }} />
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Offers List Content ──────────────────────────────────────── */}
        {contentTab === 'offers' && (
          <div style={{ padding: '12px 16px 16px' }}>
            {offers.length === 0 ? (
              <div style={{
                background: C.g50, borderRadius: 12, padding: 36,
                textAlign: 'center', border: `1px solid ${C.g100}`,
              }}>
                <div style={{
                  width: 56, height: 56, borderRadius: 14, background: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  margin: '0 auto 10px', border: `1px solid ${C.g100}`,
                }}>
                  <Tag size={24} style={{ color: C.g300 }} />
                </div>
                <p style={{ fontSize: 14, fontWeight: 800, color: C.g700, marginBottom: 4 }}>No active offers</p>
                <p style={{ fontSize: 12, color: C.g400, marginBottom: 14 }}>This user is not accepting trades right now.</p>
                {own && (
                  <button onClick={() => navigate('/create-offer')} style={{
                    width: '100%', padding: '11px 0', borderRadius: 12,
                    background: C.green, color: '#fff', border: 'none',
                    fontSize: 13, fontWeight: 800, cursor: 'pointer',
                  }}>
                    Create an offer
                  </button>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {offers.map(offer => {
                  const type = (offer.listing_type || '').toUpperCase().includes('GIFT') ? 'gift'
                    : (offer.listing_type || '').toUpperCase().includes('SELL') ? 'sell' : 'buy';
                  const typeCfg = { sell: { label: 'Selling', color: C.green, bg: '#ECFDF5' }, buy: { label: 'Buying', color: C.paid, bg: '#EFF6FF' }, gift: { label: 'Gift Card', color: C.purple, bg: '#F5F3FF' } };
                  const cfg = typeCfg[type] || typeCfg.buy;
                  return (
                    <div key={offer.id} onClick={() => navigate(`/listing/${offer.id}`)} style={{
                      background: C.g50, borderRadius: 12, padding: 12,
                      border: `1px solid ${C.g100}`, cursor: 'pointer',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                        <span style={{
                          fontSize: 11, fontWeight: 800, padding: '3px 8px',
                          borderRadius: 8, background: cfg.bg, color: cfg.color,
                        }}>
                          {cfg.label}
                        </span>
                        <span style={{ fontSize: 11, fontWeight: 600, color: C.g400 }}>{fmtAge(offer.created_at)}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div>
                          <p style={{ fontSize: 10, color: C.g400, marginBottom: 1 }}>Price</p>
                          <p style={{ fontSize: 15, fontWeight: 900, color: C.g800 }}>
                            {offer.bitcoin_price ? `$${fmt(parseFloat(offer.bitcoin_price), 0)}` : '—'}
                          </p>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <p style={{ fontSize: 10, color: C.g400, marginBottom: 1 }}>Limit</p>
                          <p style={{ fontSize: 12, fontWeight: 800, color: C.g700 }}>
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

        {/* ── History Tab Content ──────────────────────────────────────────── */}
        {contentTab === 'history' && !own && (
          <div style={{ padding: '12px 16px 16px' }}>
            {/* Buy/Sell toggle */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              {[{ id: 'buy', label: 'Buy', count: sharedTrades.filter(t => t.buyer_id === user?.id).length },
                { id: 'sell', label: 'Sell', count: sharedTrades.filter(t => t.seller_id === user?.id).length },
              ].map(f => (
                <button key={f.id} onClick={() => setHistoryTypeFilter(f.id)} style={{
                  padding: '6px 14px', borderRadius: 20, border: 'none',
                  background: historyTypeFilter === f.id ? C.green : C.g100,
                  color: historyTypeFilter === f.id ? '#fff' : C.g600,
                  fontSize: 12, fontWeight: 700, cursor: 'pointer',
                }}>
                  {f.label} <span style={{ fontWeight: 600, opacity: 0.8 }}>{f.count}</span>
                </button>
              ))}
            </div>

            {sharedTrades.length === 0 ? (
              <div style={{ padding: 32, textAlign: 'center' }}>
                <ArrowUpDown size={28} style={{ color: C.g300, margin: '0 auto 8px' }} />
                <p style={{ fontSize: 13, fontWeight: 700, color: C.g700 }}>
                  You haven't traded with this user before
                </p>
                <p style={{ fontSize: 12, color: C.g400, marginTop: 4 }}>
                  Past trades will appear here once you trade with this user
                </p>
                <button onClick={() => navigate('/buy-bitcoin')} style={{
                  marginTop: 14, padding: '10px 24px', borderRadius: 12,
                  background: C.green, color: '#fff', border: 'none',
                  fontSize: 13, fontWeight: 800, cursor: 'pointer',
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
                    // Defensive: sanitize cancel_reason to prevent raw error messages leaking to UI
                    const rawCancelReason = trade.cancel_reason || '';
                    const isErrorLeak = typeof rawCancelReason === 'string' &&
                      (rawCancelReason.includes('TypeError') || 
                       rawCancelReason.includes('fetch failed') ||
                       rawCancelReason.includes('Error:') ||
                       rawCancelReason.includes('stack') ||
                       rawCancelReason.includes('at ') && rawCancelReason.includes('('));
                    const cancelLabel = isErrorLeak ? '' : 
                      (rawCancelReason ? rawCancelReason.charAt(0).toUpperCase() + rawCancelReason.slice(1) : '');
                    const statusCfg = {
                      COMPLETED: { label: 'Completed', color: C.success, bg: '#ECFDF5' },
                      CANCELLED: { label: cancelLabel || 'Cancelled', color: C.g500, bg: C.g100 },
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
                    const sc = statusCfg[safeStatus] || { label: safeStatus === 'STATUS_UNAVAILABLE' ? 'Status unavailable' : (safeStatus || 'Unknown'), color: C.g500, bg: C.g100 };
                    const payName = PAYMENT_METHOD_NAMES[trade.payment_method?.toLowerCase()] || trade.payment_method || '—';
                    const completedTime = trade.completed_at || trade.cancelled_at;
                    const tradeCurrency = trade.local_currency || trade.currency_symbol || 'USD';

                    return (
                      <div key={trade.id} style={{
                        background: C.g50, borderRadius: 12, padding: 12,
                        border: `1px solid ${C.g100}`,
                      }}>
                        {/* Status tag */}
                        <div style={{ marginBottom: 8 }}>
                          <span style={{
                            fontSize: 11, fontWeight: 800, padding: '3px 8px',
                            borderRadius: 8, background: sc.bg, color: sc.color,
                          }}>
                            {sc.label}
                          </span>
                        </div>
                        {/* Receive / Pay columns - dynamic based on trade type */}
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
                          {/* Left column: Fiat/payment side */}
                          <div>
                            <p style={{ fontSize: 10, color: '#9ca3af', marginBottom: 1, fontWeight: 600, textTransform: 'uppercase' }}>
                              {isBuyer ? `Receive ${payName !== '—' ? payName : ''}` : `Pay ${payName !== '—' ? payName : ''}`}
                            </p>
                            <p style={{ fontSize: 14, fontWeight: 800, color: '#111827' }}>
                              {isBuyer
                                ? (trade.amount_local ? `${fmt(parseFloat(trade.amount_local))} ${tradeCurrency}` : trade.amount_usd ? `$${fmt(parseFloat(trade.amount_usd), 2)} USD` : '—')
                                : (trade.amount_local ? `${fmt(parseFloat(trade.amount_local))} ${tradeCurrency}` : trade.amount_usd ? `$${fmt(parseFloat(trade.amount_usd), 2)} USD` : '—')
                              }
                            </p>
                          </div>
                          {/* Right column: BTC leg - shows fiat equivalent, NOT raw BTC */}
                          <div style={{ textAlign: 'right' }}>
                            <p style={{ fontSize: 10, color: '#9ca3af', marginBottom: 1, fontWeight: 600, textTransform: 'uppercase' }}>
                              {isBuyer ? 'Pay (BTC)' : 'Receive (BTC)'}
                            </p>
                            <p style={{ fontSize: 14, fontWeight: 800, color: '#111827' }}>
                              {isBuyer
                                ? (trade.amount_local ? `${fmt(parseFloat(trade.amount_local))} ${tradeCurrency}` : trade.amount_usd ? `$${fmt(parseFloat(trade.amount_usd), 2)} USD` : '—')
                                : (trade.amount_receive_usd ? `$${fmt(parseFloat(trade.amount_receive_usd), 2)} USD` : trade.amount_local ? `${fmt(parseFloat(trade.amount_local))} ${tradeCurrency}` : trade.amount_usd ? `$${fmt(parseFloat(trade.amount_usd), 2)} USD` : '—')
                              }
                            </p>
                          </div>
                        </div>
                        {/* Completion status row - static, no expand behavior */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderTop: `1px solid ${C.g100}` }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <CheckCircle size={12} color={sc.color} />
                            <span style={{ fontSize: 12, fontWeight: 600, color: sc.color }}>{sc.label}</span>
                            {completedTime && (
                              <span style={{ fontSize: 12, color: C.g400 }}>{fmtAge(completedTime)}</span>
                            )}
                          </div>
                          <ChevronDown size={16} color={C.g400} style={{ transform: 'none' }} />
                        </div>
                        {/* Trade / Offer ID row with copy icons */}
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

      {/* ── Spacing before bottom nav ─────────────────────────────────────────── */}
      <div style={{ height: 24 }} />

      {/* ── Share Profile Sheet ────────────────────────────────────────────────── */}
      {shareOpen && <ShareProfileSheet user={user} onClose={() => setShareOpen(false)} />}

      {/* ── Edit Profile Sheet ─────────────────────────────────────────────────── */}
      {editMode && (
        <EditProfileSheet 
          user={user} 
          onClose={handleCloseEdit} 
          form={form} 
          setForm={setForm} 
          saving={saving} 
          saveProfile={saveProfile} 
          onAvatarUpload={onAvatarUpload} 
          uploading={uploading} 
          fileRef={fileRef} 
          editMode={editMode}
        />
      )}
    </div>
  );
}
