// src/pages/Settings.js - COMPLETE CLEAN FILE

import React, { useState, useEffect, useRef, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { QRCodeSVG } from 'qrcode.react';
import PRQFooter from '../components/PRQFooter';
import {
  requestNotificationPermission,
  getNotificationPermission,
  isPushSupported,
  identifyUser
} from '../utils/notifications';
import {
  User, Lock, Mail, Phone, CreditCard, Bell,
  Shield, Globe, Save, Eye, EyeOff, CheckCircle,
  AlertCircle, Smartphone, LogOut, ChevronRight,
  Camera, BadgeCheck, Clock, Upload, RefreshCw,  FileText, DollarSign, Languages, MapPin, X, Check, Copy, ToggleLeft, ToggleRight,
  Ban, WifiOff, MessageCircle, Car, Plane,
  AlertTriangle, Circle, Send, Unlink, Link,
  Edit3, ChevronDown, Menu, Search
} from 'lucide-react';
import { toast } from 'react-toastify';

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5000/api";

const C = {
  forest: "#1B4332",
  green: "#2D6A4F",
  mint: "#40916C",
  gold: "#F4A422",
  mist: "#F0FAF5",
  white: "#FFFFFF",
  g50: "#F8FAFC",
  g100: "#F1F5F9",
  g200: "#E2E8F0",
  g400: "#94A3B8",
  g500: "#64748B",
  g600: "#475569",
  g700: "#334155",
  g800: "#1E293B",
  success: "#10B981",
  danger: "#EF4444",
  warn: "#F59E0B",
  paid: "#3B82F6",
};

const authH = () => {
  const t = localStorage.getItem("token");
  return t ? { Authorization: `Bearer ${t}` } : {};
};

// Country dial codes for the phone-change modal's searchable country picker
// (flag + name + dial code, ordered alphabetically like the NoOnes reference).
const PHONE_CODES = [
  { flag: '🇦🇫', code: '+93', name: 'Afghanistan' },
  { flag: '🇦🇱', code: '+355', name: 'Albania' },
  { flag: '🇩🇿', code: '+213', name: 'Algeria' },
  { flag: '🇦🇸', code: '+1684', name: 'American Samoa' },
  { flag: '🇦🇩', code: '+376', name: 'Andorra' },
  { flag: '🇦🇴', code: '+244', name: 'Angola' },
  { flag: '🇦🇮', code: '+1264', name: 'Anguilla' },
  { flag: '🇦🇬', code: '+1268', name: 'Antigua & Barbuda' },
  { flag: '🇦🇷', code: '+54', name: 'Argentina' },
  { flag: '🇦🇲', code: '+374', name: 'Armenia' },
  { flag: '🇦🇼', code: '+297', name: 'Aruba' },
  { flag: '🇦🇺', code: '+61', name: 'Australia' },
  { flag: '🇦🇹', code: '+43', name: 'Austria' },
  { flag: '🇦🇿', code: '+994', name: 'Azerbaijan' },
  { flag: '🇧🇸', code: '+1242', name: 'Bahamas' },
  { flag: '🇧🇭', code: '+973', name: 'Bahrain' },
  { flag: '🇧🇩', code: '+880', name: 'Bangladesh' },
  { flag: '🇧🇧', code: '+1246', name: 'Barbados' },
  { flag: '🇧🇾', code: '+375', name: 'Belarus' },
  { flag: '🇧🇪', code: '+32', name: 'Belgium' },
  { flag: '🇧🇿', code: '+501', name: 'Belize' },
  { flag: '🇧🇯', code: '+229', name: 'Benin' },
  { flag: '🇧🇲', code: '+1441', name: 'Bermuda' },
  { flag: '🇧🇹', code: '+975', name: 'Bhutan' },
  { flag: '🇧🇴', code: '+591', name: 'Bolivia' },
  { flag: '🇧🇦', code: '+387', name: 'Bosnia & Herzegovina' },
  { flag: '🇧🇼', code: '+267', name: 'Botswana' },
  { flag: '🇧🇷', code: '+55', name: 'Brazil' },
  { flag: '🇧🇳', code: '+673', name: 'Brunei' },
  { flag: '🇧🇬', code: '+359', name: 'Bulgaria' },
  { flag: '🇧🇫', code: '+226', name: 'Burkina Faso' },
  { flag: '🇧🇮', code: '+257', name: 'Burundi' },
  { flag: '🇰🇭', code: '+855', name: 'Cambodia' },
  { flag: '🇨🇲', code: '+237', name: 'Cameroon' },
  { flag: '🇨🇦', code: '+1', name: 'Canada' },
  { flag: '🇨🇻', code: '+238', name: 'Cape Verde' },
  { flag: '🇰🇾', code: '+1345', name: 'Cayman Islands' },
  { flag: '🇨🇫', code: '+236', name: 'Central African Republic' },
  { flag: '🇹🇩', code: '+235', name: 'Chad' },
  { flag: '🇨🇱', code: '+56', name: 'Chile' },
  { flag: '🇨🇳', code: '+86', name: 'China' },
  { flag: '🇨🇴', code: '+57', name: 'Colombia' },
  { flag: '🇨🇬', code: '+242', name: 'Congo' },
  { flag: '🇨🇷', code: '+506', name: 'Costa Rica' },
  { flag: '🇭🇷', code: '+385', name: 'Croatia' },
  { flag: '🇨🇺', code: '+53', name: 'Cuba' },
  { flag: '🇨🇾', code: '+357', name: 'Cyprus' },
  { flag: '🇨🇿', code: '+420', name: 'Czech Republic' },
  { flag: '🇩🇰', code: '+45', name: 'Denmark' },
  { flag: '🇩🇯', code: '+253', name: 'Djibouti' },
  { flag: '🇩🇲', code: '+1767', name: 'Dominica' },
  { flag: '🇩🇴', code: '+1809', name: 'Dominican Republic' },
  { flag: '🇪🇨', code: '+593', name: 'Ecuador' },
  { flag: '🇪🇬', code: '+20', name: 'Egypt' },
  { flag: '🇸🇻', code: '+503', name: 'El Salvador' },
  { flag: '🇬🇶', code: '+240', name: 'Equatorial Guinea' },
  { flag: '🇪🇷', code: '+291', name: 'Eritrea' },
  { flag: '🇪🇪', code: '+372', name: 'Estonia' },
  { flag: '🇪🇹', code: '+251', name: 'Ethiopia' },
  { flag: '🇫🇯', code: '+679', name: 'Fiji' },
  { flag: '🇫🇮', code: '+358', name: 'Finland' },
  { flag: '🇫🇷', code: '+33', name: 'France' },
  { flag: '🇬🇦', code: '+241', name: 'Gabon' },
  { flag: '🇬🇲', code: '+220', name: 'Gambia' },
  { flag: '🇬🇪', code: '+995', name: 'Georgia' },
  { flag: '🇩🇪', code: '+49', name: 'Germany' },
  { flag: '🇬🇭', code: '+233', name: 'Ghana' },
  { flag: '🇬🇷', code: '+30', name: 'Greece' },
  { flag: '🇬🇩', code: '+1473', name: 'Grenada' },
  { flag: '🇬🇹', code: '+502', name: 'Guatemala' },
  { flag: '🇬🇳', code: '+224', name: 'Guinea' },
  { flag: '🇬🇾', code: '+592', name: 'Guyana' },
  { flag: '🇭🇹', code: '+509', name: 'Haiti' },
  { flag: '🇭🇳', code: '+504', name: 'Honduras' },
  { flag: '🇭🇰', code: '+852', name: 'Hong Kong' },
  { flag: '🇭🇺', code: '+36', name: 'Hungary' },
  { flag: '🇮🇸', code: '+354', name: 'Iceland' },
  { flag: '🇮🇳', code: '+91', name: 'India' },
  { flag: '🇮🇩', code: '+62', name: 'Indonesia' },
  { flag: '🇮🇷', code: '+98', name: 'Iran' },
  { flag: '🇮🇶', code: '+964', name: 'Iraq' },
  { flag: '🇮🇪', code: '+353', name: 'Ireland' },
  { flag: '🇮🇱', code: '+972', name: 'Israel' },
  { flag: '🇮🇹', code: '+39', name: 'Italy' },
  { flag: '🇯🇲', code: '+1876', name: 'Jamaica' },
  { flag: '🇯🇵', code: '+81', name: 'Japan' },
  { flag: '🇯🇴', code: '+962', name: 'Jordan' },
  { flag: '🇰🇿', code: '+7', name: 'Kazakhstan' },
  { flag: '🇰🇪', code: '+254', name: 'Kenya' },
  { flag: '🇰🇼', code: '+965', name: 'Kuwait' },
  { flag: '🇰🇬', code: '+996', name: 'Kyrgyzstan' },
  { flag: '🇱🇦', code: '+856', name: 'Laos' },
  { flag: '🇱🇻', code: '+371', name: 'Latvia' },
  { flag: '🇱🇧', code: '+961', name: 'Lebanon' },
  { flag: '🇱🇸', code: '+266', name: 'Lesotho' },
  { flag: '🇱🇷', code: '+231', name: 'Liberia' },
  { flag: '🇱🇾', code: '+218', name: 'Libya' },
  { flag: '🇱🇮', code: '+423', name: 'Liechtenstein' },
  { flag: '🇱🇹', code: '+370', name: 'Lithuania' },
  { flag: '🇱🇺', code: '+352', name: 'Luxembourg' },
  { flag: '🇲🇴', code: '+853', name: 'Macao' },
  { flag: '🇲🇬', code: '+261', name: 'Madagascar' },
  { flag: '🇲🇼', code: '+265', name: 'Malawi' },
  { flag: '🇲🇾', code: '+60', name: 'Malaysia' },
  { flag: '🇲🇱', code: '+223', name: 'Mali' },
  { flag: '🇲🇹', code: '+356', name: 'Malta' },
  { flag: '🇲🇷', code: '+222', name: 'Mauritania' },
  { flag: '🇲🇺', code: '+230', name: 'Mauritius' },
  { flag: '🇲🇽', code: '+52', name: 'Mexico' },
  { flag: '🇲🇩', code: '+373', name: 'Moldova' },
  { flag: '🇲🇨', code: '+377', name: 'Monaco' },
  { flag: '🇲🇳', code: '+976', name: 'Mongolia' },
  { flag: '🇲🇪', code: '+382', name: 'Montenegro' },
  { flag: '🇲🇦', code: '+212', name: 'Morocco' },
  { flag: '🇲🇿', code: '+258', name: 'Mozambique' },
  { flag: '🇲🇲', code: '+95', name: 'Myanmar' },
  { flag: '🇳🇦', code: '+264', name: 'Namibia' },
  { flag: '🇳🇵', code: '+977', name: 'Nepal' },
  { flag: '🇳🇱', code: '+31', name: 'Netherlands' },
  { flag: '🇳🇿', code: '+64', name: 'New Zealand' },
  { flag: '🇳🇮', code: '+505', name: 'Nicaragua' },
  { flag: '🇳🇪', code: '+227', name: 'Niger' },
  { flag: '🇳🇬', code: '+234', name: 'Nigeria' },
  { flag: '🇰🇵', code: '+850', name: 'North Korea' },
  { flag: '🇲🇰', code: '+389', name: 'North Macedonia' },
  { flag: '🇳🇴', code: '+47', name: 'Norway' },
  { flag: '🇴🇲', code: '+968', name: 'Oman' },
  { flag: '🇵🇰', code: '+92', name: 'Pakistan' },
  { flag: '🇵🇸', code: '+970', name: 'Palestine' },
  { flag: '🇵🇦', code: '+507', name: 'Panama' },
  { flag: '🇵🇬', code: '+675', name: 'Papua New Guinea' },
  { flag: '🇵🇾', code: '+595', name: 'Paraguay' },
  { flag: '🇵🇪', code: '+51', name: 'Peru' },
  { flag: '🇵🇭', code: '+63', name: 'Philippines' },
  { flag: '🇵🇱', code: '+48', name: 'Poland' },
  { flag: '🇵🇹', code: '+351', name: 'Portugal' },
  { flag: '🇵🇷', code: '+1787', name: 'Puerto Rico' },
  { flag: '🇶🇦', code: '+974', name: 'Qatar' },
  { flag: '🇷🇴', code: '+40', name: 'Romania' },
  { flag: '🇷🇺', code: '+7', name: 'Russia' },
  { flag: '🇷🇼', code: '+250', name: 'Rwanda' },
  { flag: '🇸🇦', code: '+966', name: 'Saudi Arabia' },
  { flag: '🇸🇳', code: '+221', name: 'Senegal' },
  { flag: '🇷🇸', code: '+381', name: 'Serbia' },
  { flag: '🇸🇨', code: '+248', name: 'Seychelles' },
  { flag: '🇸🇱', code: '+232', name: 'Sierra Leone' },
  { flag: '🇸🇬', code: '+65', name: 'Singapore' },
  { flag: '🇸🇰', code: '+421', name: 'Slovakia' },
  { flag: '🇸🇮', code: '+386', name: 'Slovenia' },
  { flag: '🇸🇴', code: '+252', name: 'Somalia' },
  { flag: '🇿🇦', code: '+27', name: 'South Africa' },
  { flag: '🇰🇷', code: '+82', name: 'South Korea' },
  { flag: '🇸🇸', code: '+211', name: 'South Sudan' },
  { flag: '🇪🇸', code: '+34', name: 'Spain' },
  { flag: '🇱🇰', code: '+94', name: 'Sri Lanka' },
  { flag: '🇸🇩', code: '+249', name: 'Sudan' },
  { flag: '🇸🇪', code: '+46', name: 'Sweden' },
  { flag: '🇨🇭', code: '+41', name: 'Switzerland' },
  { flag: '🇸🇾', code: '+963', name: 'Syria' },
  { flag: '🇹🇼', code: '+886', name: 'Taiwan' },
  { flag: '🇹🇯', code: '+992', name: 'Tajikistan' },
  { flag: '🇹🇿', code: '+255', name: 'Tanzania' },
  { flag: '🇹🇭', code: '+66', name: 'Thailand' },
  { flag: '🇹🇬', code: '+228', name: 'Togo' },
  { flag: '🇹🇹', code: '+1868', name: 'Trinidad & Tobago' },
  { flag: '🇹🇳', code: '+216', name: 'Tunisia' },
  { flag: '🇹🇷', code: '+90', name: 'Turkey' },
  { flag: '🇹🇲', code: '+993', name: 'Turkmenistan' },
  { flag: '🇺🇬', code: '+256', name: 'Uganda' },
  { flag: '🇺🇦', code: '+380', name: 'Ukraine' },
  { flag: '🇦🇪', code: '+971', name: 'United Arab Emirates' },
  { flag: '🇬🇧', code: '+44', name: 'United Kingdom' },
  { flag: '🇺🇸', code: '+1', name: 'United States' },
  { flag: '🇺🇾', code: '+598', name: 'Uruguay' },
  { flag: '🇺🇿', code: '+998', name: 'Uzbekistan' },
  { flag: '🇻🇪', code: '+58', name: 'Venezuela' },
  { flag: '🇻🇳', code: '+84', name: 'Vietnam' },
  { flag: '🇾🇪', code: '+967', name: 'Yemen' },
  { flag: '🇿🇲', code: '+260', name: 'Zambia' },];

// Countries for the ID verification "Country" picker sheet — derived from the
// PHONE_CODES table (already a full alphabetical ISO list with flags) so this
// picker and the phone country-code picker can never drift apart.
const KYC_PICKER_COUNTRIES = PHONE_CODES.map(c => ({ flag: c.flag, name: c.name }));

// 'payment' has no sidebar entry; it is only opened from Trader settings → Payment accounts.
const INTERNAL_TABS = ['account', 'verification', 'security', 'notifications', 'payment'];

const maskEmail = (email) => {
  if (!email) return "—";
  const [local, domain] = email.split("@");
  if (!domain) return email;
  const show = Math.min(4, local.length);
  const masked = local.slice(0, show) + "•".repeat(Math.max(3, local.length - show));
  return `${masked}@${domain}`;
};

// Small-screen account rows deliberately use the same inline-edit interaction as
// the desktop settings fields, without turning each row into a separate card.
// `locked` keeps the pencil icon VISIBLE but non-functional: clicking it does
// nothing (no edit field, no typing, no save) — used for the one-time username
// lock so users can still see where the edit affordance would be.
// Shared viewport/keyboard tracking for Account Settings bottom sheets.
// Returns { innerPx, vvHeight, kbOverlap }:
//   innerPx   — layout viewport height in px (window.innerHeight)
//   vvHeight  — visual viewport height in px (window.visualViewport.height)
//   kbOverlap — how many px of the layout viewport's bottom are covered by the
//               on-screen keyboard (visual viewport shorter than layout viewport)
function useSheetViewport() {
  const [vp, setVp] = useState(() => {
    const inner = typeof window !== 'undefined' ? (window.innerHeight || 800) : 800;
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    const vvHeight = vv ? Math.round(vv.height) : inner;
    const overlap = vv ? Math.max(0, Math.round(inner - (vv.height + (vv.offsetTop || 0)))) : 0;
    return { innerPx: inner, vvHeight, kbOverlap: overlap };
  });

  useEffect(() => {
    const update = () => {
      const inner = Math.round(window.innerHeight || 800);
      const vv = window.visualViewport;
      const vvHeight = vv ? Math.round(vv.height) : inner;
      const overlap = vv ? Math.max(0, Math.round(inner - (vv.height + (vv.offsetTop || 0)))) : 0;
      setVp(prev => (prev.innerPx === inner && prev.vvHeight === vvHeight && prev.kbOverlap === overlap)
        ? prev
        : { innerPx: inner, vvHeight, kbOverlap: overlap });
    };
    update();
    const vv = window.visualViewport;
    if (vv) {
      vv.addEventListener('resize', update);
      vv.addEventListener('scroll', update);
    }
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => {
      if (vv) {
        vv.removeEventListener('resize', update);
        vv.removeEventListener('scroll', update);
      }
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, []);
  return vp;
}

// Shared bottom sheet for Account Settings confirm flows (E-mail change, Phone
// number change, and any future confirm sheet). The structural fix lives HERE
// once — not duplicated per screen. Contract:
//   - Rendered via createPortal to document.body to break out of all parent
//     stacking contexts and overflow constraints.
//   - Encapsulates its own full-screen backdrop with zIndex: 10000 (above
//     BottomNav's zIndex: 1000).
//   - Sheet container has zIndex: 10001, pinned at bottom: `${kbOverlap}px`.
//   - Header — title + close icon, pinned (flexShrink 0).
//   - Body   — children, scrolls internally (overflowY auto + minHeight 0) so
//              it can never push the footer out of view.
//   - Footer — actions pinned OUTSIDE the scroll area at the bottom of the sheet,
//              padded with env(safe-area-inset-bottom) and lifted above keyboard.
function AccountBottomSheet({ title, onClose, children, footer, centerOnDesktop = false }) {
  const { innerPx, vvHeight, kbOverlap } = useSheetViewport();

  // Desktop/centered mode (≥1024px): the Security-tab modals render as a
  // standard centered dialog instead of a bottom-anchored sheet. Mobile keeps
  // the sheet behavior exactly as before. Same useSyncExternalStore pattern as
  // idVerifyDesktop above — SSR-safe initializer, live breakpoint updates.
  const isDesktop = useSyncExternalStore(
    (cb) => { const mq = window.matchMedia('(min-width: 1024px)'); mq.addEventListener('change', cb); return () => mq.removeEventListener('change', cb); },
    () => window.matchMedia('(min-width: 1024px)').matches,
    () => false
  );
  const centered = centerOnDesktop && isDesktop;

  // Lock body scroll and listen for Escape key while sheet is open
  useEffect(() => {
    const origOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKey = (e) => {
      if (e.key === 'Escape' && onClose) onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => {
      document.body.style.overflow = origOverflow;
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  // Max sheet height dynamically caps at visible viewport minus top safe
  // clearance (40px). Tall sheets (e.g. the 2-step ID verification) stop 40px
  // short of the viewport top, leaving a visible strip of the page above them;
  // short sheets (Country/ID pickers, checklists) are content-sized and never
  // reach the cap, so their position is unchanged.
  const maxSheetHeight = Math.max(200, (vvHeight || (innerPx - kbOverlap)) - 40);

  const sheetContent = (
    <>
      <style>{`
        @keyframes acctSheetFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes acctSheetSlideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
      `}</style>

      {/* Backdrop (above BottomNav at zIndex: 1000) */}
      <div
        onClick={onClose}
        aria-hidden="true"
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          zIndex: 10000,
          animation: 'acctSheetFadeIn 0.2s ease-out',
        }}
      />

      {/* Bottom Sheet / centered dialog container */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={e => e.stopPropagation()}
        className="bg-white shadow-2xl w-full max-w-md"
        style={centered ? {
          // Desktop: standard centered modal — no bottom anchor, no drag handle,
          // rounded on all corners, fade-in instead of slide-up.
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 10001,
          borderRadius: 16,
          display: 'flex',
          flexDirection: 'column',
          maxHeight: `${maxSheetHeight}px`,
          overflow: 'hidden',
          animation: 'acctSheetFadeIn 0.2s ease-out',
        } : {
          position: 'fixed',
          bottom: `${kbOverlap}px`,
          left: 0,
          right: 0,
          margin: '0 auto',
          zIndex: 10001,
          borderRadius: '20px 20px 0 0',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: `${maxSheetHeight}px`,
          overflow: 'hidden',
          animation: 'acctSheetSlideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
          transition: 'bottom 0.15s ease-out, max-height 0.15s ease-out',
        }}
      >
        {/* Handle bar (pinned) — bottom-sheet affordance only, never on desktop */}
        {!centered && (
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 10, paddingBottom: 6, flexShrink: 0 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: C.g200 }} />
        </div>
        )}

        {/* Pinned header (title + close). paddingTop gives every modal
            (Security sheets and any other consumer) consistent breathing
            room between the modal's top edge and the title/X row (Issue 5). */}
        <div
          className="flex items-center justify-between mb-3"
          style={{ paddingLeft: 24, paddingRight: 24, paddingTop: 20, flexShrink: 0 }}
        >
          <h3 className="text-lg font-black" style={{ color: C.g800, margin: 0 }}>
            {title}
          </h3>
          <button
            onClick={onClose}
            aria-label="Close"
            type="button"
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              border: 'none',
              background: C.g100,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={18} color={C.g600} />
          </button>
        </div>

        {/* Scrollable body */}
        <div
          style={{
            paddingLeft: 24,
            paddingRight: 24,
            paddingBottom: 16,
            overflowY: 'auto',
            WebkitOverflowScrolling: 'touch',
            minHeight: 0,
            flex: '1 1 auto',
            overscrollBehavior: 'contain',
          }}
        >
          {children}
        </div>

        {/* Pinned footer (outside the scroll area, safe-area + keyboard aware).
            Rendered only when a footer is provided — checklist/info sheets
            (e.g. the Verification tab's "What you can do") have no actions. */}
        {footer !== undefined && (
          <div
            className="flex gap-3"
            style={{
              paddingLeft: 24,
              paddingRight: 24,
              paddingTop: 12,
              flexShrink: 0,
              // Desktop has no safe-area inset / keyboard lift — plain padding
              paddingBottom: centered
                ? '16px'
                : kbOverlap > 0
                  ? '16px'
                  : 'calc(16px + env(safe-area-inset-bottom, 0px))',
              borderTop: `1px solid ${C.g100}`,
              backgroundColor: C.white,
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </>
  );

  return typeof document !== 'undefined' ? createPortal(sheetContent, document.body) : null;
}

function MobileAccountField({ label, value, onSave, readOnly = false, type = 'text', status, onPencil, noPencil = false }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => { setDraft(value || ''); }, [value]);

  const save = async () => {
    if (draft === (value || '')) { setEditing(false); return; }
    setSaving(true);
    try {
      await onSave(draft);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  // When locked (readOnly) or noPencil, editing is unreachable
  useEffect(() => { if (readOnly || noPencil) setEditing(false); }, [readOnly, noPencil]);

  const handlePencilClick = () => {
    if (readOnly || noPencil) return;
    if (onPencil) { onPencil(); return; }
    setEditing(true);
  };

  return (
      <div className="py-2">
        <div className="flex items-center gap-1.5 mb-1">
          <p className="text-sm font-normal" style={{ color: C.g500 }}>{label}</p>
          {status}
        </div>
        {editing && !noPencil ? (
            <div className="flex items-center gap-2">
              <input type={type} value={draft} onChange={e => setDraft(e.target.value)}
                     onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }}
                     disabled={saving} autoFocus
                     className="min-w-0 flex-1 px-3 py-2.5 rounded-lg text-sm font-medium focus:outline-none"
                     style={{ border: `2px solid ${C.green}`, color: C.g800, backgroundColor: C.white }} />
              <button type="button" onClick={() => setEditing(false)} disabled={saving} className="text-xs font-bold" style={{ color: C.g500 }}>Cancel</button>
              <button type="button" onClick={save} disabled={saving} className="text-xs font-bold" style={{ color: C.green }}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
        ) : (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl" style={{ backgroundColor: '#F1F1F1' }}>
              <p className="flex-1 min-w-0 truncate text-sm font-bold" style={{ color: C.g800, userSelect: (readOnly || noPencil) ? 'none' : 'auto' }}>{value || '—'}</p>
              {!noPencil && (
                readOnly ? (
                  /* Locked: icon only — no button, no onClick, not focusable (light/faded grey) */
                  <span role="img" aria-label={`${label} is locked`} className="flex-shrink-0 p-0.5"
                        style={{ color: C.g400, cursor: 'not-allowed', userSelect: 'none' }}>
                    <Edit3 size={15} />
                  </span>
                ) : (
                  /* Active/editable: clickable button with darker, visible icon */
                  <button type="button" onClick={handlePencilClick} aria-label={`Edit ${label}`}
                          className="flex-shrink-0 p-0.5 hover:opacity-75 transition-opacity"
                          style={{ color: C.g700, cursor: 'pointer' }}>
                    <Edit3 size={15} />
                  </button>
                )
              )}
            </div>
        )}
      </div>
  );
}

// ─── Verification tab (NoOnes parity) — shared card pieces ─────────────────────────────────────────────────────────
// Grey status pill shown on every level card: "✓ Verified" once the level is
// complete, "Not Verified" otherwise. Light grey with dark text on both the
// light-mint cards and the dark-green current-level card, matching the
// NoOnes reference (check icon + label, rounded pill).
function VerifStatusPill({ verified }) {
  return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black flex-shrink-0"
            style={{ backgroundColor: C.g100, color: C.g700, cursor: 'default' }}>
        {verified ? <Check size={11} strokeWidth={3.5} /> : <Circle size={9} fill={C.g400} strokeWidth={0} />}
        {verified ? 'Verified' : 'Not Verified'}
      </span>
  );
}

// "What you can do" checklist — small green square checkbox with a white
// checkmark, followed by the label. Horizontal wrap inside desktop cards;
// vertical with comfortable row spacing inside the mobile bottom sheet.
function VerifChecklist({ items, vertical = false, light = false }) {
  if (!items || items.length === 0) return null;
  return (
      <div className={vertical ? 'flex flex-col gap-3.5' : 'flex items-center gap-x-5 gap-y-2 flex-wrap'}>
        {items.map((item) => (
            <div key={item} className={`flex items-center min-w-0 ${vertical ? 'gap-2.5' : 'gap-2'}`}>
              <span className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: C.success }}>
                <Check size={10} strokeWidth={3.5} color="#fff" />
              </span>
              <span className={`font-bold ${vertical ? 'text-sm' : 'text-xs'}`} style={{ color: light ? 'rgba(255,255,255,0.92)' : C.g700 }}>{item}</span>
            </div>
        ))}
      </div>
  );
}

// Countries available in the ID verification "Your details" step. The app's
// P2P markets are Ghana-focused, so Ghana is the default market; other West
// African markets kept selectable. Ghana first — it's the placeholder default.
// Countries for the ID verification "Country" field come from
// KYC_PICKER_COUNTRIES (top of file) — rendered as a nested searchable
// bottom-sheet picker inside the ID verification modal.

// "Open camera" capture — invokes the device camera directly via
// capture="environment" (rear camera for ID shots) or capture="user"
// (front camera for the selfie), so users cannot pick a pre-existing
// gallery image. Accepts the same image constraints as the rest of the app.
//
// Device notes: with capture present, Chrome/Safari Android/iOS launch the
// camera app straight away and offer NO gallery option (the chooser-with-
// camera-option behavior happens only when capture is absent). Desktop
// browsers ignore capture and show a file dialog — expected fallback.
// The attribute is rendered unconditionally (empty string coerces to the
// default "environment") so it can never be stripped from the DOM.
function LiveCapture({ label, capture = 'environment', captured, onCapture, onClear }) {
  const fileInputRef = useRef(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const captureAttr = capture || 'environment';

  const [isStreaming, setIsStreaming] = useState(false);
  const [cameraLoading, setCameraLoading] = useState(false);
  const [cameraDevices, setCameraDevices] = useState([]);
  const [activeDeviceIndex, setActiveDeviceIndex] = useState(0);

  // Stop camera tracks cleanly
  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsStreaming(false);
    setCameraLoading(false);
  };

  // Clean up stream on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
    };
  }, []);

  // Attach the stream to the <video> element once it actually mounts.
  // The video only renders after cameraLoading clears, so the ref is still
  // null at the moment getUserMedia resolves in startCamera — assigning
  // srcObject there was a silent no-op, leaving a source-less (black) video
  // and producing solid-black captured JPEGs. Re-run whenever the streaming
  // UI (re)mounts the video element.
  useEffect(() => {
    if (isStreaming && !cameraLoading && streamRef.current && videoRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [isStreaming, cameraLoading]);

  const isMobile = typeof navigator !== 'undefined' && /Mobile|Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');

  const startCamera = async () => {
    // If mobile or getUserMedia is unsupported, fall back to native input
    if (isMobile || !navigator?.mediaDevices?.getUserMedia) {
      fileInputRef.current?.click();
      return;
    }

    setCameraLoading(true);
    setIsStreaming(true);

    try {
      const preferredFacing = capture === 'user' ? 'user' : 'environment';
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: preferredFacing, width: { ideal: 1280 }, height: { ideal: 720 } }
        });
      } catch (e1) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 1280 }, height: { ideal: 720 } }
          });
        } catch (e2) {
          stream = await navigator.mediaDevices.getUserMedia({ video: true });
        }
      }

      streamRef.current = stream;

      // Query video input devices
      let videoInputs = [];
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        videoInputs = devices.filter(d => d.kind === 'videoinput');
        setCameraDevices(videoInputs);
        const track = stream.getVideoTracks()[0];
        const activeId = track?.getSettings()?.deviceId;
        const idx = videoInputs.findIndex(d => d.deviceId === activeId);
        setActiveDeviceIndex(idx !== -1 ? idx : 0);
      } catch {
        // Enumerate fallback
      }

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }
      setCameraLoading(false);
    } catch (err) {
      console.error('Webcam start error:', err);
      stopCamera();
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        toast.error('Webcam access denied. Please allow camera permissions in your browser or select a file.');
      } else if (err.name === 'NotFoundError') {
        toast.error('No webcam found on this device.');
      } else {
        toast.error('Could not start camera. You can select a photo file instead.');
      }
      // Trigger file dialog fallback
      fileInputRef.current?.click();
    }
  };

  const handleFlipCamera = async () => {
    try {
      let videoInputs = [];
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        videoInputs = devices.filter(d => d.kind === 'videoinput');
        setCameraDevices(videoInputs);
      } catch {
        videoInputs = cameraDevices;
      }

      // If only one camera exists (or none), stay on the same camera:
      // no error, no broken state, just no visible change
      if (videoInputs.length <= 1) {
        return;
      }

      const nextIndex = (activeDeviceIndex + 1) % videoInputs.length;
      const targetDevice = videoInputs[nextIndex];

      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }

      const newStream = await navigator.mediaDevices.getUserMedia({
        video: {
          deviceId: { exact: targetDevice.deviceId },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      });

      streamRef.current = newStream;
      setActiveDeviceIndex(nextIndex);
      if (videoRef.current) {
        videoRef.current.srcObject = newStream;
        videoRef.current.play().catch(() => {});
      }
    } catch (err) {
      console.warn('Flip camera fallback:', err);
      try {
        const recoverStream = await navigator.mediaDevices.getUserMedia({ video: true });
        streamRef.current = recoverStream;
        if (videoRef.current) {
          videoRef.current.srcObject = recoverStream;
          videoRef.current.play().catch(() => {});
        }
      } catch {}
    }
  };

  const handleTakePhoto = () => {
    const video = videoRef.current;
    if (!video) return;
    // Guard: a video with no rendered frames (still starting, or the stream
    // never attached) draws as a solid black JPEG — the "black thumbnail" bug.
    // Refuse instead of encoding a blank image.
    if (!video.videoWidth || !video.videoHeight) {
      toast.error('Camera is still starting — try again in a moment.');
      return;
    }
    const width = video.videoWidth;
    const height = video.videoHeight;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, width, height);

    canvas.toBlob((blob) => {
      if (!blob) {
        toast.error('Failed to capture photo. Please try again.');
        return;
      }
      const safeLabel = label.toLowerCase().replace(/[^a-z0-9]/g, '_');
      const file = new File([blob], `${safeLabel}_${Date.now()}.jpg`, { type: 'image/jpeg' });
      stopCamera();
      onCapture(file);
    }, 'image/jpeg', 0.92);
  };

  return (
      <div>
        <input ref={fileInputRef} type="file" accept="image/*" capture={captureAttr}
               className="hidden"
               onChange={e => { const f = e.target.files[0] || null; if (f) onCapture(f); e.target.value = ''; }} />

        {captured ? (
            <div className="flex items-center gap-3">
              <img src={captured.preview} alt={label} className="w-16 h-16 rounded-xl object-cover flex-shrink-0" style={{ border: `2px solid ${C.success}` }} />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-black" style={{ color: C.success }}>✓ {label} captured</p>
                <p className="text-xs" style={{ color: C.g400 }}>Max 10MB · JPG or PNG · live camera capture</p>
              </div>
              <button type="button" onClick={onClear}
                      className="text-xs font-bold hover:opacity-70" style={{ color: '#EF4444' }}>
                Retake
              </button>
            </div>
        ) : isStreaming ? (
            <div className="relative w-full rounded-2xl overflow-hidden bg-black flex flex-col items-center border border-gray-800">
              {/* Video Preview */}
              <div className="relative w-full flex items-center justify-center bg-black min-h-[220px] max-h-[340px] overflow-hidden">
                {cameraLoading ? (
                    <div className="flex flex-col items-center justify-center py-12 text-white/70">
                      <RefreshCw size={24} className="animate-spin mb-2" />
                      <p className="text-xs font-semibold">Starting camera…</p>
                    </div>
                ) : (
                    <>
                      <video
                          ref={videoRef}
                          autoPlay
                          playsInline
                          muted
                          className="w-full h-auto max-h-[340px] object-contain"
                      />
                      {/* Framing guideline overlay */}
                      <div className="absolute inset-3 pointer-events-none border border-white/30 rounded-xl flex items-end justify-center pb-2">
                        <span className="text-[10px] font-bold text-white/80 px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-sm shadow">
                          {capture === 'user' ? 'Align your face & ID inside the frame' : 'Align all four corners of ID inside the frame'}
                        </span>
                      </div>
                    </>
                )}
              </div>

              {/* Action Bar */}
              <div className="w-full bg-gray-950 px-3 py-2.5 flex items-center justify-between gap-2 border-t border-gray-800">
                <button
                    type="button"
                    onClick={handleFlipCamera}
                    disabled={cameraLoading}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-gray-200 transition hover:bg-white/10 hover:text-white active:scale-95 disabled:opacity-50"
                    title="Flip camera"
                >
                  <RefreshCw size={13} />
                  <span>Flip camera</span>
                </button>

                <button
                    type="button"
                    onClick={handleTakePhoto}
                    disabled={cameraLoading}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black shadow-md transition hover:opacity-90 active:scale-95 disabled:opacity-50"
                    style={{ backgroundColor: C.green, color: '#FFFFFF' }}
                >
                  <Camera size={15} />
                  <span>Take photo</span>
                </button>

                <button
                    type="button"
                    onClick={stopCamera}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold text-gray-400 transition hover:bg-white/10 hover:text-white"
                >
                  <X size={13} />
                  <span>Cancel</span>
                </button>
              </div>
            </div>
        ) : (
            <button type="button" onClick={startCamera}
                    className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-bold cursor-pointer transition hover:opacity-80"
                    style={{ color: C.g800, backgroundColor: C.g50, border: `1px solid ${C.g200}` }}>
              <Camera size={14} style={{ color: C.green }} />
              Open camera
            </button>
        )}
      </div>
  );
}

// EXAMPLE block for a document section: "EXAMPLE" label above a real reference
// image showing how the capture should be framed. Images live in frontend/public/
// (CRA copies public/ into the build root verbatim, so absolute paths work in
// dev and production — same mechanism as favicon.ico/logo192.png in index.html).
const DOC_EXAMPLE_IMG = {
  front: '/government_id_front.jpg',
  selfie: '/selfie_holding_id.jpg',
  back: '/government_id_back.jpg',
};
const DOC_EXAMPLE_ALT = {
  front: 'Example: front of government ID',
  selfie: 'Example: selfie holding your ID',
  back: 'Example: back of government ID',
};

function DocExample({ kind }) {
  return (
      <div className="mb-3 flex flex-col items-center">
        <p className="text-[10px] font-black tracking-widest mb-1.5" style={{ color: C.g400 }}>EXAMPLE</p>
        <div className="w-full max-w-[220px] rounded-xl overflow-hidden" style={{ border: `1px solid ${C.g200}`, backgroundColor: C.white }}>
          <img src={DOC_EXAMPLE_IMG[kind] || DOC_EXAMPLE_IMG.front}
               alt={DOC_EXAMPLE_ALT[kind] || DOC_EXAMPLE_ALT.front}
               className="w-full h-auto object-contain" />
        </div>
      </div>
  );
}

// DESKTOP searchable inline dropdown for the "Country" field in ID verification
// Step 1 — anchored directly below the field (no modal, no bottom sheet).
// Shares the SAME data source (KYC_PICKER_COUNTRIES) and the SAME
// case-insensitive name-filter predicate as the mobile bottom-sheet picker —
// only the container differs. Closes on selection, outside click, or Escape.
function SearchableCountrySelect({ value, onChange, triggerStyle }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Identical filter logic to the mobile Country bottom sheet.
  const q = query.trim().toLowerCase();
  const results = KYC_PICKER_COUNTRIES.filter(c => !q || c.name.toLowerCase().includes(q));

  return (
      <div ref={rootRef} className="relative">
        <button type="button" onClick={() => { setQuery(''); setOpen(o => !o); }}
                className="w-full flex items-center justify-between px-3 py-2 border-2 rounded-xl text-sm font-semibold focus:outline-none"
                style={triggerStyle}>
          <span style={{ color: value ? C.g800 : C.g400 }}>{value || 'Select country'}</span>
          <ChevronDown size={16} style={{ color: C.g400, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
        </button>
        {open && (
            <div className="absolute left-0 right-0 mt-1 z-30 bg-white rounded-xl shadow-lg overflow-hidden"
                 style={{ border: `1px solid ${C.g200}` }}>
              {/* Search row — same magnifying-glass icon + "Search" placeholder
                  as the mobile picker. */}
              <div className="relative px-2 pt-2 pb-2" style={{ borderBottom: `1px solid ${C.g100}` }}>
                <Search size={15} className="absolute left-5 top-1/2 -translate-y-1/2" style={{ color: C.g400 }} />
                <input type="text" value={query} autoFocus
                       onChange={e => setQuery(e.target.value)}
                       placeholder="Search"
                       className="w-full pl-9 pr-3 py-2 rounded-lg text-sm focus:outline-none"
                       style={{ border: `1px solid ${C.g200}`, color: C.g800, backgroundColor: C.white }} />
              </div>
              {/* Scrollable alphabetically-sorted list (KYC_PICKER_COUNTRIES order). */}
              <div style={{ maxHeight: 260, overflowY: 'auto' }}>
                {results.map(c => (
                    <button key={c.name} type="button"
                            onClick={() => { onChange(c.name); setOpen(false); }}
                            className="w-full flex items-center gap-3 px-3 py-2.5 text-left transition hover:bg-gray-50"
                            style={{ borderBottom: `1px solid ${C.g100}` }}>
                      <span className="text-lg leading-none">{c.flag}</span>
                      <span className="flex-1 min-w-0 truncate text-sm font-semibold" style={{ color: C.g800 }}>{c.name}</span>
                      {value === c.name && <Check size={14} style={{ color: C.green, flexShrink: 0 }} />}
                    </button>
                ))}
                {results.length === 0 && (
                    <p className="px-3 py-4 text-sm text-center" style={{ color: C.g400 }}>No countries found</p>
                )}
              </div>
            </div>
        )}
      </div>
  );
}

// ─── Toggle Switch ────────────────────────────────────────────────────────────
function Toggle({ checked, onChange, disabled = false, label }) {
  return (
      <button
          type="button"
          role="switch"
          aria-checked={checked}
          aria-label={label}
          disabled={disabled}
          onClick={() => !disabled && onChange(!checked)}
          className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 
        focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-green-500
        ${checked ? "bg-green-500" : "bg-gray-300"}
        ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
      >
      <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-md transition-transform
          ${checked ? "translate-x-5" : "translate-x-0"}`}
      />
      </button>
  );
}

// ─── Push Enable Card ──────────────────────────────────────────────────────────
function PushEnableCard({ user }) {
  const [permission, setPermission] = React.useState("default");
  const [requesting, setRequesting] = React.useState(false);

  React.useEffect(() => {
    if (!isPushSupported()) {
      setPermission("unsupported");
      return;
    }
    getNotificationPermission().then(setPermission);
  }, []);

  if (permission === "unsupported") {
    return (
        <div className="rounded-2xl border p-4 flex items-start gap-3" style={{ borderColor: '#FED7AA', backgroundColor: '#FFF7ED' }}>
          <WifiOff size={20} className="flex-shrink-0" style={{color:'#B45309'}}/>
          <div>
            <p className="text-sm font-black" style={{ color: '#92400E' }}>Push not supported</p>
            <p className="text-xs mt-0.5" style={{ color: '#B45309' }}>Your browser doesn't support push notifications. Use Chrome or Safari for the best experience.</p>
          </div>
        </div>
    );
  }

  if (permission === "granted") {
    return (
        <div className="rounded-2xl border p-4 flex items-center gap-3" style={{ borderColor: '#A7F3D0', backgroundColor: '#ECFDF5' }}>
          <Bell size={20} className="flex-shrink-0" style={{color:'#059669'}}/>
          <div className="flex-1">
            <p className="text-sm font-black" style={{ color: '#065F46' }}>Push notifications are ON</p>
            <p className="text-xs mt-0.5" style={{ color: '#059669' }}>You'll get instant alerts for trades, payments and messages — even when the browser is closed.</p>
          </div>
          <span className="text-xs font-black px-2 py-1 rounded-full" style={{ backgroundColor: '#D1FAE5', color: '#065F46' }}>✓ Active</span>
        </div>
    );
  }

  if (permission === "denied") {
    return (
        <div className="rounded-2xl border p-4 flex items-start gap-3" style={{ borderColor: '#FECACA', backgroundColor: '#FEF2F2' }}>
          <Ban size={20} className="flex-shrink-0" style={{color:'#B91C1C'}}/>
          <div>
            <p className="text-sm font-black" style={{ color: '#991B1B' }}>Notifications blocked</p>
            <p className="text-xs mt-1" style={{ color: '#B91C1C' }}>
              You've blocked notifications for this site. To re-enable:
              click the lock icon in your browser address bar → Site settings → Notifications → Allow.
            </p>
          </div>
        </div>
    );
  }

  return (
      <div className="rounded-2xl border p-4" style={{ borderColor: '#A5F3FC', backgroundColor: '#ECFEFF' }}>
        <div className="flex items-start gap-3 mb-3">
          <Bell size={24} className="flex-shrink-0" style={{color:'#0891B2'}}/>
          <div>
            <p className="text-sm font-black" style={{ color: '#164E63' }}>Enable Instant Trade Alerts</p>
            <p className="text-xs mt-0.5" style={{ color: '#0891B2' }}>
              Get notified the moment someone opens a trade with you, sends payment, or releases Bitcoin — even when you're not on the site.
            </p>
            <p className="text-xs mt-1" style={{ color: '#0891B2' }}>
              Works on Android &amp; iPhone (add to home screen for iOS).
            </p>
          </div>
        </div>
        <button
            disabled={requesting}
            onClick={async () => {
              // If browser permission is already blocked, show instructions immediately
              if (window.Notification?.permission === 'denied') {
                setPermission('denied');
                toast.error('Notifications are blocked in your browser. Click the lock icon in the address bar \u2192 Site settings \u2192 Notifications \u2192 Allow.');
                return;
              }
              setRequesting(true);
              try {
                const granted = await requestNotificationPermission();
                setPermission(granted ? "granted" : "denied");
                if (granted) {
                  toast.success("Trade alerts enabled! You'll never miss a trade.");
                  // Re-link user to OneSignal after permission grant
                  if (user?.id) {
                    identifyUser(user.id).catch(() => {});
                  }
                } else {
                  toast.info("Notifications not enabled. You can turn them on later.");
                }
              } catch (e) {
                console.error('[Push] Permission request error:', e);
                setPermission("denied");
                toast.error("Something went wrong. Please try again.");
              } finally {
                setRequesting(false);
              }
            }}
            className="w-full py-3 rounded-xl font-black text-sm flex items-center justify-center gap-2 transition-opacity hover:opacity-90"
            style={{ backgroundColor: "#0E7490", color: "#fff" }}
        >
          <Bell size={15} />
          {requesting ? "Requesting permission…" : "Enable Instant Trade Alerts"}
        </button>
      </div>
  );
}

// ─── Telegram Notifications Card ────────────────────────────────────────────
function TelegramCard() {
  const [status, setStatus] = React.useState({ connected: false, enabled: false });
  const [linkingCode, setLinkingCode] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [polling, setPolling] = React.useState(false);

  // Fetch status on mount
  React.useEffect(() => {
    fetchStatus();
  }, []);

  // Poll for connection after generating a code
  React.useEffect(() => {
    if (!linkingCode || !polling) return;
    const interval = setInterval(async () => {
      try {
        const r = await axios.get(`${API_URL}/telegram/status`, { headers: authH() });
        if (r.data?.connected) {
          clearInterval(interval);
          setLinkingCode(null);
          setPolling(false);
          setStatus(r.data);
          toast.success('✅ Telegram connected successfully!');
        }
      } catch { /* ignore */ }
    }, 3000);
    return () => clearInterval(interval);
  }, [linkingCode, polling]);

  const fetchStatus = async () => {
    try {
      const r = await axios.get(`${API_URL}/telegram/status`, { headers: authH() });
      setStatus(r.data);
    } catch { /* ignore */ }
  };

  const handleConnect = async () => {
    setLoading(true);
    try {
      const r = await axios.post(`${API_URL}/telegram/link`, {}, { headers: authH() });
      if (r.data?.code) {
        setLinkingCode(r.data.code);
        setPolling(true);
      }
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Failed to generate linking code.');
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (newVal) => {
    try {
      await axios.post(`${API_URL}/telegram/toggle`, { enabled: newVal }, { headers: authH() });
      setStatus(s => ({ ...s, enabled: newVal }));
      toast.success(newVal ? '🔔 Telegram alerts enabled.' : '🔕 Telegram alerts disabled.');
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Failed to update settings.');
    }
  };

  const handleDisconnect = async () => {
    if (!window.confirm('Disconnect Telegram? You will stop receiving alerts.')) return;
    try {
      await axios.post(`${API_URL}/telegram/disconnect`, {}, { headers: authH() });
      setStatus({ connected: false, enabled: false });
      setLinkingCode(null);
      setPolling(false);
      toast.success('Telegram disconnected.');
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Failed to disconnect.');
    }
  };

  // ── Connected state ──────────────────────────────────────────────────
  if (status.connected) {
    return (
      <div className="rounded-2xl border p-4" style={{ borderColor: '#A7F3D0', backgroundColor: '#ECFDF5' }}>
        <div className="flex items-start gap-3 mb-3">
          <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#0D9488' }}>
            <Send size={18} color="#fff" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-black" style={{ color: '#065F46' }}>Telegram Connected</p>
            <p className="text-xs mt-0.5" style={{ color: '#059669' }}>
              {status.connectedAt ? `Linked ${new Date(status.connectedAt).toLocaleDateString()}` : 'Linked'}
              {status.enabled ? ' — alerts active' : ' — alerts paused'}
            </p>
          </div>
        </div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-bold text-gray-700">Alerts Enabled</p>
          <Toggle checked={status.enabled} onChange={handleToggle} />
        </div>
        <button onClick={handleDisconnect}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold border-2 transition hover:bg-red-50 mt-2"
                style={{ borderColor: '#FECACA', color: '#991B1B' }}>
          <Unlink size={13} /> Disconnect Telegram
        </button>
      </div>
    );
  }

  // ── Linking code shown ───────────────────────────────────────────────
  if (linkingCode) {
    return (
      <div className="rounded-2xl border p-4" style={{ borderColor: '#A5F3FC', backgroundColor: '#ECFEFF' }}>
        <div className="flex items-start gap-3 mb-3">
          <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#0891B2' }}>
            <Send size={18} color="#fff" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-black" style={{ color: '#164E63' }}>Link Your Telegram</p>
            <p className="text-xs mt-0.5" style={{ color: '#0891B2' }}>Waiting for you to send the code in Telegram…</p>
          </div>
        </div>
        <div className="p-4 rounded-xl text-center" style={{ backgroundColor: 'white', border: '2px dashed #0891B2' }}>
          <p className="text-xs text-gray-500 mb-2">Your linking code:</p>
          <p className="text-3xl font-black tracking-widest" style={{ color: '#0891B2', fontFamily: 'monospace' }}>{linkingCode}</p>
        </div>
        <div className="mt-3 p-3 rounded-xl text-xs space-y-1" style={{ backgroundColor: 'rgba(8,145,178,0.08)', color: '#155E75' }}>
          <p className="font-bold">Steps:</p>
          <p>1. Open Telegram and search for <span className="font-bold">@PraqenAssistBot</span></p>
          <p>2. Send this code: <span className="font-bold">{linkingCode}</span></p>
          <p>3. Wait a few seconds — we'll detect it automatically</p>
        </div>
        <div className="flex items-center gap-2 mt-3">
          <RefreshCw size={13} className="animate-spin" style={{ color: '#0891B2' }} />
          <p className="text-xs font-bold" style={{ color: '#0891B2' }}>Waiting for connection…</p>
        </div>
      </div>
    );
  }

  // ── Not connected — show connect button ──────────────────────────────
  return (
    <div className="rounded-2xl border p-4" style={{ borderColor: '#A5F3FC', backgroundColor: '#ECFEFF' }}>
      <div className="flex items-start gap-3 mb-3">
        <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#0891B2' }}>
          <Send size={18} color="#fff" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-black" style={{ color: '#164E63' }}>Telegram Trade Alerts</p>
          <p className="text-xs mt-0.5" style={{ color: '#0891B2' }}>
            Get instant trade alerts via Telegram — never miss a payment, release or dispute.
          </p>
        </div>
      </div>
      <button onClick={handleConnect} disabled={loading}
              className="w-full py-3 rounded-xl font-black text-sm flex items-center justify-center gap-2 transition-opacity hover:opacity-90"
              style={{ backgroundColor: '#0891B2', color: '#fff' }}>
        <Link size={15} />
        {loading ? 'Generating code…' : 'Connect Telegram'}
      </button>
    </div>
  );
}

// ── Currencies — full list with flags and symbols ─────────────────────────────
const CURRENCIES = [
  // Major Global
  { code: "USD", label: "US Dollar", symbol: "$", flag: "🇺🇸" },
  { code: "EUR", label: "Euro", symbol: "€", flag: "🇪🇺" },
  { code: "GBP", label: "British Pound", symbol: "£", flag: "🇬🇧" },
  { code: "CHF", label: "Swiss Franc", symbol: "Fr", flag: "🇨🇭" },
  { code: "JPY", label: "Japanese Yen", symbol: "¥", flag: "🇯🇵" },
  { code: "CNY", label: "Chinese Yuan", symbol: "¥", flag: "🇨🇳" },
  { code: "CAD", label: "Canadian Dollar", symbol: "CA$", flag: "🇨🇦" },
  { code: "AUD", label: "Australian Dollar", symbol: "A$", flag: "🇦🇺" },
  { code: "NZD", label: "New Zealand Dollar", symbol: "NZ$", flag: "🇳🇿" },
  { code: "SGD", label: "Singapore Dollar", symbol: "S$", flag: "🇸🇬" },
  { code: "HKD", label: "Hong Kong Dollar", symbol: "HK$", flag: "🇭🇰" },
  // Middle East
  { code: "AED", label: "UAE Dirham", symbol: "د.إ", flag: "🇦🇪" },
  { code: "SAR", label: "Saudi Riyal", symbol: "﷼", flag: "🇸🇦" },
  { code: "QAR", label: "Qatari Riyal", symbol: "﷼", flag: "🇶🇦" },
  { code: "KWD", label: "Kuwaiti Dinar", symbol: "KD", flag: "🇰🇼" },
  { code: "BHD", label: "Bahraini Dinar", symbol: "BD", flag: "🇧🇭" },
  { code: "OMR", label: "Omani Rial", symbol: "﷼", flag: "🇴🇲" },
  // Africa
  { code: "GHS", label: "Ghana Cedi", symbol: "₵", flag: "🇬🇭" },
  { code: "NGN", label: "Nigerian Naira", symbol: "₦", flag: "🇳🇬" },
  { code: "KES", label: "Kenyan Shilling", symbol: "KSh", flag: "🇰🇪" },
  { code: "ZAR", label: "South African Rand", symbol: "R", flag: "🇿🇦" },
  { code: "UGX", label: "Ugandan Shilling", symbol: "USh", flag: "🇺🇬" },
  { code: "TZS", label: "Tanzanian Shilling", symbol: "TSh", flag: "🇹🇿" },
  { code: "RWF", label: "Rwandan Franc", symbol: "Fr", flag: "🇷🇼" },
  { code: "ETB", label: "Ethiopian Birr", symbol: "Br", flag: "🇪🇹" },
  { code: "XOF", label: "CFA Franc (UEMOA)", symbol: "CFA", flag: <Globe size={14} className="inline-block" /> },
  { code: "XAF", label: "CFA Franc (CEMAC)", symbol: "CFA", flag: <Globe size={14} className="inline-block" /> },
  { code: "MAD", label: "Moroccan Dirham", symbol: "DH", flag: "🇲🇦" },
  { code: "EGP", label: "Egyptian Pound", symbol: "£", flag: "🇪🇬" },
  { code: "ZMW", label: "Zambian Kwacha", symbol: "ZK", flag: "🇿🇲" },
  { code: "MWK", label: "Malawian Kwacha", symbol: "MK", flag: "🇲🇼" },
  { code: "SLL", label: "Sierra Leone Leone", symbol: "Le", flag: "🇸🇱" },
  { code: "GMD", label: "Gambian Dalasi", symbol: "D", flag: "🇬🇲" },
  { code: "GNF", label: "Guinean Franc", symbol: "Fr", flag: "🇬🇳" },
  // Asia
  { code: "INR", label: "Indian Rupee", symbol: "₹", flag: "🇮🇳" },
  { code: "PKR", label: "Pakistani Rupee", symbol: "₨", flag: "🇵🇰" },
  { code: "BDT", label: "Bangladeshi Taka", symbol: "৳", flag: "🇧🇩" },
  { code: "IDR", label: "Indonesian Rupiah", symbol: "Rp", flag: "🇮🇩" },
  { code: "PHP", label: "Philippine Peso", symbol: "₱", flag: "🇵🇭" },
  { code: "MYR", label: "Malaysian Ringgit", symbol: "RM", flag: "🇲🇾" },
  { code: "THB", label: "Thai Baht", symbol: "฿", flag: "🇹🇭" },
  { code: "VND", label: "Vietnamese Dong", symbol: "₫", flag: "🇻🇳" },
  { code: "KRW", label: "South Korean Won", symbol: "₩", flag: "🇰🇷" },
  { code: "TWD", label: "Taiwan Dollar", symbol: "NT$", flag: "🇹🇼" },
  { code: "LKR", label: "Sri Lankan Rupee", symbol: "₨", flag: "🇱🇰" },
  // Europe (non-EUR)
  { code: "TRY", label: "Turkish Lira", symbol: "₺", flag: "🇹🇷" },
  { code: "RUB", label: "Russian Ruble", symbol: "₽", flag: "🇷🇺" },
  { code: "PLN", label: "Polish Zloty", symbol: "zł", flag: "🇵🇱" },
  { code: "UAH", label: "Ukrainian Hryvnia", symbol: "₴", flag: "🇺🇦" },
  { code: "SEK", label: "Swedish Krona", symbol: "kr", flag: "🇸🇪" },
  { code: "NOK", label: "Norwegian Krone", symbol: "kr", flag: "🇳🇴" },
  { code: "DKK", label: "Danish Krone", symbol: "kr", flag: "🇩🇰" },
  // Americas
  { code: "BRL", label: "Brazilian Real", symbol: "R$", flag: "🇧🇷" },
  { code: "MXN", label: "Mexican Peso", symbol: "MX$", flag: "🇲🇽" },
  { code: "COP", label: "Colombian Peso", symbol: "$", flag: "🇨🇴" },
  { code: "ARS", label: "Argentine Peso", symbol: "$", flag: "🇦🇷" },
  { code: "CLP", label: "Chilean Peso", symbol: "$", flag: "🇨🇱" },
];

// ── Languages ─────────────────────────────────────────────────────────────────
const LANGUAGES = [
  { code: "en", label: "English", native: "English" },
  { code: "fr", label: "French", native: "Français" },
  { code: "pt", label: "Portuguese", native: "Português" },
  { code: "es", label: "Spanish", native: "Español" },
  { code: "de", label: "German", native: "Deutsch" },
  { code: "it", label: "Italian", native: "Italiano" },
  { code: "ar", label: "Arabic", native: "العربية" },
  { code: "zh", label: "Chinese", native: "中文" },
  { code: "hi", label: "Hindi", native: "हिन्दी" },
  { code: "bn", label: "Bengali", native: "বাংলা" },
  { code: "ru", label: "Russian", native: "Русский" },
  { code: "ja", label: "Japanese", native: "日本語" },
  { code: "ko", label: "Korean", native: "한국어" },
  { code: "tr", label: "Turkish", native: "Türkçe" },
  { code: "sw", label: "Swahili", native: "Kiswahili" },
  { code: "ha", label: "Hausa", native: "Hausa" },
  { code: "yo", label: "Yoruba", native: "Yorùbá" },
  { code: "ig", label: "Igbo", native: "Igbo" },
  { code: "am", label: "Amharic", native: "አማርኛ" },
  { code: "so", label: "Somali", native: "Soomaali" },
  { code: "tw", label: "Twi (Akan)", native: "Twi" },
  { code: "ur", label: "Urdu", native: "اردو" },
  { code: "id", label: "Indonesian", native: "Bahasa Indonesia" },
  { code: "ms", label: "Malay", native: "Bahasa Melayu" },
  { code: "vi", label: "Vietnamese", native: "Tiếng Việt" },
  { code: "th", label: "Thai", native: "ภาษาไทย" },
  { code: "tl", label: "Filipino", native: "Filipino" },
  { code: "nl", label: "Dutch", native: "Nederlands" },
  { code: "pl", label: "Polish", native: "Polski" },
  { code: "uk", label: "Ukrainian", native: "Українська" },
];

// ── Timezones grouped by region ──────────────────────────────────────────────
const TIMEZONE_GROUPS = {
  "Africa": [
    { tz: "Africa/Accra", label: "Accra, Abidjan, Dakar — Ghana · Côte d'Ivoire · Senegal (GMT+0)" },
    { tz: "Africa/Lagos", label: "Lagos — Nigeria · Benin · Cameroon (GMT+1)" },
    { tz: "Africa/Nairobi", label: "Nairobi — Kenya · Tanzania · Uganda · Somalia (GMT+3)" },
    { tz: "Africa/Johannesburg", label: "Johannesburg — South Africa · Zimbabwe · Zambia (GMT+2)" },
    { tz: "Africa/Addis_Ababa", label: "Addis Ababa — Ethiopia · Eritrea (GMT+3)" },
    { tz: "Africa/Kigali", label: "Kigali — Rwanda (GMT+2)" },
    { tz: "Africa/Dar_es_Salaam", label: "Dar es Salaam — Tanzania (GMT+3)" },
    { tz: "Africa/Kampala", label: "Kampala — Uganda (GMT+3)" },
    { tz: "Africa/Douala", label: "Douala — Cameroon · Central Africa (GMT+1)" },
    { tz: "Africa/Cairo", label: "Cairo — Egypt (GMT+2)" },
    { tz: "Africa/Casablanca", label: "Casablanca — Morocco (GMT+0/+1)" },
    { tz: "Africa/Khartoum", label: "Khartoum — Sudan (GMT+3)" },
    { tz: "Africa/Lusaka", label: "Lusaka — Zambia (GMT+2)" },
    { tz: "Africa/Harare", label: "Harare — Zimbabwe (GMT+2)" },
    { tz: "Africa/Maputo", label: "Maputo — Mozambique (GMT+2)" },
    { tz: "Africa/Luanda", label: "Luanda — Angola (GMT+1)" },
    { tz: "Africa/Abidjan", label: "Abidjan — Côte d'Ivoire (GMT+0)" },
    { tz: "Africa/Bamako", label: "Bamako — Mali · Guinea · Burkina Faso (GMT+0)" },
    { tz: "Africa/Conakry", label: "Conakry — Guinea (GMT+0)" },
    { tz: "Africa/Freetown", label: "Freetown — Sierra Leone (GMT+0)" },
  ],
  "Asia & Middle East": [
    { tz: "Asia/Dubai", label: "Dubai — UAE (GMT+4)" },
    { tz: "Asia/Riyadh", label: "Riyadh — Saudi Arabia (GMT+3)" },
    { tz: "Asia/Qatar", label: "Doha — Qatar (GMT+3)" },
    { tz: "Asia/Kuwait", label: "Kuwait City (GMT+3)" },
    { tz: "Asia/Baghdad", label: "Baghdad — Iraq (GMT+3)" },
    { tz: "Asia/Beirut", label: "Beirut — Lebanon (GMT+2/+3)" },
    { tz: "Asia/Kolkata", label: "Mumbai, Delhi — India (GMT+5:30)" },
    { tz: "Asia/Karachi", label: "Karachi — Pakistan (GMT+5)" },
    { tz: "Asia/Dhaka", label: "Dhaka — Bangladesh (GMT+6)" },
    { tz: "Asia/Colombo", label: "Colombo — Sri Lanka (GMT+5:30)" },
    { tz: "Asia/Shanghai", label: "Beijing, Shanghai — China (GMT+8)" },
    { tz: "Asia/Hong_Kong", label: "Hong Kong (GMT+8)" },
    { tz: "Asia/Taipei", label: "Taipei — Taiwan (GMT+8)" },
    { tz: "Asia/Tokyo", label: "Tokyo — Japan (GMT+9)" },
    { tz: "Asia/Seoul", label: "Seoul — South Korea (GMT+9)" },
    { tz: "Asia/Singapore", label: "Singapore (GMT+8)" },
    { tz: "Asia/Kuala_Lumpur", label: "Kuala Lumpur — Malaysia (GMT+8)" },
    { tz: "Asia/Jakarta", label: "Jakarta — Indonesia (GMT+7)" },
    { tz: "Asia/Manila", label: "Manila — Philippines (GMT+8)" },
    { tz: "Asia/Bangkok", label: "Bangkok — Thailand (GMT+7)" },
    { tz: "Asia/Ho_Chi_Minh", label: "Ho Chi Minh City — Vietnam (GMT+7)" },
  ],
  "Europe": [
    { tz: "Europe/London", label: "London — UK · Ireland (GMT+0/+1)" },
    { tz: "Europe/Paris", label: "Paris — France · Belgium · Netherlands (GMT+1/+2)" },
    { tz: "Europe/Berlin", label: "Berlin — Germany · Austria (GMT+1/+2)" },
    { tz: "Europe/Zurich", label: "Zurich — Switzerland (GMT+1/+2)" },
    { tz: "Europe/Madrid", label: "Madrid — Spain (GMT+1/+2)" },
    { tz: "Europe/Rome", label: "Rome — Italy (GMT+1/+2)" },
    { tz: "Europe/Lisbon", label: "Lisbon — Portugal (GMT+0/+1)" },
    { tz: "Europe/Amsterdam", label: "Amsterdam — Netherlands (GMT+1/+2)" },
    { tz: "Europe/Stockholm", label: "Stockholm — Sweden (GMT+1/+2)" },
    { tz: "Europe/Oslo", label: "Oslo — Norway (GMT+1/+2)" },
    { tz: "Europe/Copenhagen", label: "Copenhagen — Denmark (GMT+1/+2)" },
    { tz: "Europe/Warsaw", label: "Warsaw — Poland (GMT+1/+2)" },
    { tz: "Europe/Kiev", label: "Kyiv — Ukraine (GMT+2/+3)" },
    { tz: "Europe/Moscow", label: "Moscow — Russia (GMT+3)" },
    { tz: "Europe/Istanbul", label: "Istanbul — Turkey (GMT+3)" },
    { tz: "Europe/Athens", label: "Athens — Greece (GMT+2/+3)" },
    { tz: "Europe/Bucharest", label: "Bucharest — Romania (GMT+2/+3)" },
  ],
  "Americas": [
    { tz: "America/New_York", label: "New York — USA Eastern (GMT-5/-4)" },
    { tz: "America/Chicago", label: "Chicago — USA Central (GMT-6/-5)" },
    { tz: "America/Denver", label: "Denver — USA Mountain (GMT-7/-6)" },
    { tz: "America/Los_Angeles", label: "Los Angeles — USA Pacific (GMT-8/-7)" },
    { tz: "America/Toronto", label: "Toronto — Canada Eastern (GMT-5/-4)" },
    { tz: "America/Vancouver", label: "Vancouver — Canada Pacific (GMT-8/-7)" },
    { tz: "America/Sao_Paulo", label: "São Paulo — Brazil (GMT-3)" },
    { tz: "America/Mexico_City", label: "Mexico City (GMT-6/-5)" },
    { tz: "America/Bogota", label: "Bogotá — Colombia (GMT-5)" },
    { tz: "America/Lima", label: "Lima — Peru (GMT-5)" },
    { tz: "America/Buenos_Aires", label: "Buenos Aires — Argentina (GMT-3)" },
    { tz: "America/Santiago", label: "Santiago — Chile (GMT-4/-3)" },
  ],
  "Pacific & Oceania": [
    { tz: "Australia/Sydney", label: "Sydney — Australia Eastern (GMT+10/+11)" },
    { tz: "Australia/Melbourne", label: "Melbourne — Australia Eastern (GMT+10/+11)" },
    { tz: "Australia/Perth", label: "Perth — Australia Western (GMT+8)" },
    { tz: "Pacific/Auckland", label: "Auckland — New Zealand (GMT+12/+13)" },
    { tz: "Pacific/Fiji", label: "Fiji (GMT+12)" },
  ],
  "UTC": [{ tz: "UTC", label: "UTC — Coordinated Universal Time (GMT+0)" }],
};

// ─── Main Settings Component ────────────────────────────────────────────────────
export default function Settings({ user, setUser }) {
  const navigate = useNavigate();
  const location = useLocation();
  // Tabs that render content inside Settings. "profile", "devices",
  // "activity" and "trader-settings" are route entries — clicking them navigates
  // away instead of switching sub-tabs, so they must never be persisted as the
  // active tab (a stale value would otherwise render an empty content area).

  const [activeTab, setActiveTab] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get('tab');
    if (tabParam && INTERNAL_TABS.includes(tabParam)) {
      return tabParam;
    }
    const savedTab = localStorage.getItem('praqen_active_tab');
    if (savedTab && savedTab !== 'payment' && INTERNAL_TABS.includes(savedTab)) {
      return savedTab;
    }
    return 'account';
  });

  // Save tab to URL and localStorage
  useEffect(() => {
    if (activeTab && INTERNAL_TABS.includes(activeTab)) {
      if (activeTab !== 'payment') localStorage.setItem('praqen_active_tab', activeTab);
      const params = new URLSearchParams(location.search);
      params.set('tab', activeTab);
      const newUrl = `${window.location.pathname}?${params.toString()}`;
      window.history.replaceState({}, '', newUrl);
    }
  }, [activeTab, location.pathname]);

  // Read URL param on page load
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tabParam = params.get('tab');
    if (tabParam && INTERNAL_TABS.includes(tabParam)) {
      setActiveTab(tabParam);
      if (tabParam !== 'payment') localStorage.setItem('praqen_active_tab', tabParam);
    }
  }, [location.search]);

  const [loading, setLoading] = useState(false);

  // Account info
  const [accountForm, setAccountForm] = useState({
    username: "",
    fullName: "",
    email: "",
    phone: "",
    bio: "",
    location: "",
  });

  // Security
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [showPw, setShowPw] = useState({ current: false, new: false, confirm: false });
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [passwordErrors, setPasswordErrors] = useState({});

  // Preferences — lazy-init from localStorage
  const [prefs, setPrefs] = useState(() => ({
    nameDisplay: localStorage.getItem("praqen_name_display") || "full",
    currency: localStorage.getItem("praqen_currency") || "USD",
    language: localStorage.getItem("praqen_language") || "en",
    timezone: localStorage.getItem("praqen_timezone") || "Africa/Accra",
    showOnline: true,
  }));

  // Notifications State with localStorage
  const [notifs, setNotifs] = useState(() => {
    const saved = localStorage.getItem('praqen_notifications');
    if (saved) {
      try { return JSON.parse(saved); } catch {}
    }
    return {
      email_trades: true,
      email_security: true,
      email_marketing: false,
      push_trades: true,
      push_messages: true,
      push_disputes: true,
    };
  });

  // Payment methods
  const [payments, setPayments] = useState({
    bankName: "",
    accountNumber: "",
    mobileProvider: "",
    mobileNumber: "",
  });

  // Real security info
  const [secInfo, setSecInfo] = useState({
    ip: null,
    country: null,
    flag: null,
    city: null,
    device: "—",
    browser: "—",
    language: "—",
    loading: true,
  });

  useEffect(() => {
    if (activeTab !== "security") return;
    const ua = navigator.userAgent;
    const isMobile = /Mobile|Android|iPhone|iPad|iPod/i.test(ua);
    const browser = /Edg\//i.test(ua) ? "Edge" : /OPR\//i.test(ua) ? "Opera" : /Chrome/i.test(ua) ? "Chrome" : /Firefox/i.test(ua) ? "Firefox" : /Safari/i.test(ua) ? "Safari" : "Browser";
    const device = isMobile ? "Mobile" : "Desktop";
    const lang = navigator.language || navigator.languages?.[0] || "en";
    let langLabel = lang;
    try {
      langLabel = new Intl.DisplayNames([lang], { type: "language" }).of(lang.split("-")[0]) || lang;
    } catch {}
    setSecInfo((prev) => ({ ...prev, device: `${device} · ${browser}`, language: langLabel }));
    const tk = localStorage.getItem('token');
    fetch(`${API_URL}/me/security`, { headers: tk ? { Authorization: `Bearer ${tk}` } : {} })
        .then(r => r.json())
        .then(d => {
          if (d.ip) {
            const cc = (d.country_code || '').toUpperCase();
            const flag = cc.length === 2 ? cc.replace(/./g, c => String.fromCodePoint(0x1F1E6 + c.charCodeAt(0) - 65)) : '';
            setSecInfo(prev => ({ ...prev, ip: d.ip, country: d.country || cc || null, flag, city: d.city, loading: false }));
          } else {
            setSecInfo(prev => ({ ...prev, loading: false }));
          }
        })
        .catch(() => setSecInfo(prev => ({ ...prev, loading: false })));
  }, [activeTab]);

  const [hideFullName, setHideFullName] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // ── NoOnes-parity: one-time username lock + email/phone change modals ────────
  // STATE, not derived: starts from the user record fetched from the backend
  // (has_changed_username / username_changed_at — never local-only state) and is
  // flipped to true IMMEDIATELY after a successful username change so the UI locks
  // without a refresh. The backend independently rejects second attempts with 403.
  const [usernameLocked, setUsernameLocked] = useState(
    !!(user?.hasChangedUsername || user?.username_changed || user?.has_changed_username || user?.username_changed_at)
  );
  // Keep in sync when the user record is (re)fetched from the backend.
  useEffect(() => {
    setUsernameLocked(!!(user?.hasChangedUsername || user?.username_changed || user?.has_changed_username || user?.username_changed_at));
  }, [user?.hasChangedUsername, user?.username_changed, user?.has_changed_username, user?.username_changed_at]);
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [emailDraft, setEmailDraft] = useState('');
  const [emailSaving, setEmailSaving] = useState(false);
  const [phoneModalOpen, setPhoneModalOpen] = useState(false);
  const [phoneDraft, setPhoneDraft] = useState('');
  const [phoneCountry, setPhoneCountry] = useState(PHONE_CODES[0]);
  const [countrySearch, setCountrySearch] = useState('');
  const [countryListOpen, setCountryListOpen] = useState(false);
  const [phoneSaving, setPhoneSaving] = useState(false);

  // Phone verification flow — Verification tab (currently dormant: no level
  // card renders it; kept pending a placement decision). SMS and WhatsApp
  // only: the old "send phone code to email" variant (which rendered an email
  // input under a "Phone Number" heading) was removed as part of the
  // NoOnes-parity rebuild.
  const [phoneStep, setPhoneStep] = useState(() => {
    if (user?.is_phone_verified || user?.phone_verified) return "done";
    return "idle";
  });
  const [phoneOtpMethod, setPhoneOtpMethod] = useState("sms");
  const [phoneOtpCode, setPhoneOtpCode] = useState("");

  // Avatar upload
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [bioDraft, setBioDraft] = useState("");
  const [bioEditing, setBioEditing] = useState(false);
  const [bioSaving, setBioSaving] = useState(false);

  const compressAvatar = (file, maxPx = 800, quality = 0.8) =>
    new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        let w = img.width, h = img.height;
        if (w > maxPx || h > maxPx) { const s = maxPx / Math.max(w, h); w = Math.round(w * s); h = Math.round(h * s); }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image load failed'));
      };
      img.src = url;
    });

  const handleAvatarClick = () => fileRef.current?.click();
  const handleAvatarUpload = async (e) => {
    const f = e.target.files?.[0];
    if (!f || !f.type.startsWith('image/')) return;
    if (f.size > 8 * 1024 * 1024) { toast.error('Image must be under 8MB'); return; }
    setAvatarPreview(URL.createObjectURL(f));
    setUploading(true);
    try {
      const b64 = await compressAvatar(f);
      const tk = localStorage.getItem('token');
      const r = await axios.post(`${API_URL}/users/upload-avatar`, { image: b64, userId: user?.id }, { headers: { Authorization: `Bearer ${tk}` } });
      if (r.data.success) {
        const url = r.data.avatar_url;
        if (url) { setUser(u => ({ ...u, avatar_url: url })); const cu = JSON.parse(localStorage.getItem('user') || '{}'); cu.avatar_url = url; localStorage.setItem('user', JSON.stringify(cu)); window.dispatchEvent(new Event('userUpdated')); }
        toast.success('Avatar updated!');
      }
    } catch (err) { toast.error('Upload failed'); setAvatarPreview(null); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  const saveBioOnly = async () => {
    setBioSaving(true);
    try {
      const r = await axios.put(`${API_URL}/users/profile`, { bio: bioDraft }, { headers: authH() });
      if (r.data.success) {
        setAccountForm(p => ({ ...p, bio: bioDraft }));
        if (setUser) setUser(u => ({ ...u, bio: bioDraft }));
        const cu = JSON.parse(localStorage.getItem('user') || '{}'); cu.bio = bioDraft; localStorage.setItem('user', JSON.stringify(cu));
        window.dispatchEvent(new Event('userUpdated'));
        toast.success('Bio updated!');
        setBioEditing(false);
      }
    } catch (e) { toast.error(e?.response?.data?.error || 'Failed to update bio'); }
    finally { setBioSaving(false); }
  };

  // Email verification
  const [emailVerifyStep, setEmailVerifyStep] = useState("idle");
  const [emailCode, setEmailCode] = useState("");
  const [emailCodeLoading, setEmailCodeLoading] = useState(false);

  // KYC upload — 2-step ID verification modal, opened ONLY by the Level 2
  // "Verify" button (the card chevron shows the "What you can do" checklist).
  const [idVerifyOpen, setIdVerifyOpen] = useState(false);
  const [idVerifyStep, setIdVerifyStep] = useState("details");
  const [idForm, setIdForm] = useState({ fullName: "", dob: "", country: "", city: "", postalCode: "", address: "", idType: "", docNumber: "" });
  const [idDocs, setIdDocs] = useState({ front: null, selfie: null, back: null });
  const [kycLoading, setKycLoading] = useState(false);
  const [kycSubmitted, setKycSubmitted] = useState(() => {
    const kyc = JSON.parse(localStorage.getItem("praqen_kyc") || "{}");
    const ls = JSON.parse(localStorage.getItem("user") || "{}");
    const status = kyc.status || ls.kyc_status || user?.kyc_status;
    return status === "pending";
  });
  const [kycStatus, setKycStatus] = useState(() => {
    const kyc = JSON.parse(localStorage.getItem("praqen_kyc") || "{}");
    const ls = JSON.parse(localStorage.getItem("user") || "{}");
    return kyc.status || ls.kyc_status || user?.kyc_status || null;
  });
  const [kycSubmittedType, setKycSubmittedType] = useState(() => {
    const kyc = JSON.parse(localStorage.getItem("praqen_kyc") || "{}");
    const ls = JSON.parse(localStorage.getItem("user") || "{}");
    return kyc.id_type || ls.kyc_id_type || user?.kyc_id_type || null;
  });
  const [kycSubmittedAt, setKycSubmittedAt] = useState(() => {
    const kyc = JSON.parse(localStorage.getItem("praqen_kyc") || "{}");
    const ls = JSON.parse(localStorage.getItem("user") || "{}");
    return kyc.submitted_at || ls.kyc_submitted_at || user?.kyc_submitted_at || null;
  });
  const [kycRejectedReason, setKycRejectedReason] = useState(user?.kyc_rejection_reason || null);

  // ID document types for the ID verification picker sheet — SINGLE config.
  // To add a type later (team lead: more coming), append one entry here — the
  // picker sheet and field render from this array, nothing else.
  const KYC_ID_TYPES = [
    { value: "passport", label: "Passport" },
    { value: "id_card", label: "ID card" },
  ];

  const [emailResendCount, setEmailResendCount] = useState(() => parseInt(localStorage.getItem("prq_email_resend") || "0"));
  const [phoneResendCount, setPhoneResendCount] = useState(() => parseInt(localStorage.getItem("prq_phone_resend") || "0"));

  const [emailVerified, setEmailVerified] = useState(!!(user?.is_email_verified || user?.email_verified));
  const [phoneVerified, setPhoneVerified] = useState(!!(user?.is_phone_verified || user?.phone_verified));
  // NoOnes-parity level flags — Level 3 (proof of address) comes from a
  // dedicated backend boolean (migration
  // 2026-09-20_verification_levels_noones_parity.sql). The profile endpoint
  // reads it defensively, so it defaults to false when the column doesn't
  // exist yet instead of breaking the page. (identity_basics_verified stays a
  // backend-internal sub-flag set automatically alongside KYC submission —
  // it is no longer a separate UI level.)
  const [addressVerified, setAddressVerified] = useState(!!user?.address_verified);
  const [kycVerified, setKycVerified] = useState(() => {
    if (user?.kyc_verified || user?.is_id_verified) return true;
    const ls = JSON.parse(localStorage.getItem("user") || "{}");
    return ls.kyc_status === "approved" || user?.kyc_status === "approved";
  });
  const [verificationSyncing, setVerificationSyncing] = useState(true);
  // Verification tab UI state — per-card accordion expansion (desktop) and the
  // currently-open "What you can do" bottom sheet (mobile). Purely UI state:
  // every Verified flag comes from the profile already fetched for the page.
  const [expandedLevels, setExpandedLevels] = useState({});
  const [verifSheetLevel, setVerifSheetLevel] = useState(null);
  // Separate mobile sheet for the unlocked level's verification FLOW (e.g. the
  // Level 1 email code/OTP) — the "What you can do" sheet is checklist-only.
  const [verifFlowLevel, setVerifFlowLevel] = useState(null);
  const toggleLevel = (n) => setExpandedLevels(prev => ({ ...prev, [n]: !prev[n] }));
  // Open the Level 2 (ID verification) 2-step modal — triggered ONLY by the
  // "Verify" button, never by the card chevron. Prefills the legal name from
  // the profile; resets to step 1 each time it opens.
  // Nested country-picker sheet state — opens ON TOP of Step 1 (its own portal
  // + backdrop stack above the details sheet); closing or selecting returns to
  // Step 1 with every other field untouched.
  const [idCountryOpen, setIdCountryOpen] = useState(false);
  const [idCountrySearch, setIdCountrySearch] = useState('');
  // Nested ID-document picker sheet — same component/pattern as the country one.
  const [idTypeOpen, setIdTypeOpen] = useState(false);
  // Desktop check — matches the cards' md: breakpoint (768px). On desktop the
  // Level 2 "Verify" flow renders INLINE inside the card; on mobile it mounts
  // as the shared bottom sheet. Live-updates when the window crosses 768px.
  const idVerifyDesktop = useSyncExternalStore(
    (cb) => { const mq = window.matchMedia('(min-width: 768px)'); mq.addEventListener('change', cb); return () => mq.removeEventListener('change', cb); },
    () => window.matchMedia('(min-width: 768px)').matches,
    () => false
  );
  const openIdVerify = () => {
    setIdForm(f => ({ ...f, fullName: f.fullName || user?.full_name || accountForm?.fullName || '' }));
    setIdVerifyStep('details');
    setIdCountryOpen(false);
    setIdCountrySearch('');
    setIdTypeOpen(false);
    setIdVerifyOpen(true);
  };


  const [twoFAEnabled, setTwoFAEnabled] = useState(!!user?.two_factor_enabled);
  const [twoFAStep, setTwoFAStep] = useState('idle'); // idle | otp
  const [twoFACode, setTwoFACode] = useState('');
  const [twoFASending, setTwoFASending] = useState(false);
  const [twoFAActivating, setTwoFAActivating] = useState(false);
  const [twoFADisabling, setTwoFADisabling] = useState(false);
  const [twoFADisablePw, setTwoFADisablePw] = useState('');
  const [showDisable2FA, setShowDisable2FA] = useState(false);
  const [logoutConfirm, setLogoutConfirm] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [nameDisplaySaving, setNameDisplaySaving] = useState(false);
  const [nameDisplaySaved, setNameDisplaySaved] = useState(false);

  // ── Security tab state (NoOnes parity redesign) ───────────────────────────
  // 2FA data comes from GET /api/users/security (method + per-event prefs);
  // local user object is kept in sync for the login flow's requires2FA step.
  const [twoFAMethod, setTwoFAMethod] = useState('none'); // 'none' | 'totp' | 'email'
  const [twoFAEvents, setTwoFAEvents] = useState({ login: true, sending_crypto: true, releasing_crypto: true });
  const [secSheet, setSecSheet] = useState(null);
  // secSheet: 'password' | '2fa-events' | '2fa-code' | '2fa-conflict' | 'close-account'
  const [sec2FAPurpose, setSec2FAPurpose] = useState('confirm'); // 'confirm' | 'totp-setup' | 'events'
  const [secPendingMethod, setSecPendingMethod] = useState(null); // method being enabled when conflict fires
  const [secConflictFrom, setSecConflictFrom] = useState(null); // method that is currently active
  const [secTotpSetup, setSecTotpSetup] = useState(null); // { secret, otpauth_url }
  const [secConfirmCode, setSecConfirmCode] = useState(['', '', '', '', '', '']);
  const [secConfirmError, setSecConfirmError] = useState('');
  const [secConfirmBusy, setSecConfirmBusy] = useState(false);
  const [secEventDraft, setSecEventDraft] = useState(null); // event prefs draft while confirming
  const [secEventBusy, setSecEventBusy] = useState(false);
  const [secResendBusy, setSecResendBusy] = useState(false);
  const [secResendFailed, setSecResendFailed] = useState(false);
  const [secCopiedField, setSecCopiedField] = useState(null); // 'secret' | 'uri' — brief copy feedback
  const secCopyTimerRef = useRef(null);
  const TWO_FA_EVENT_KEYS = ['login', 'sending_crypto', 'releasing_crypto'];
  const [secWalletBalance, setSecWalletBalance] = useState(null); // USD balance for Close Account sheet
  const [secWalletLoading, setSecWalletLoading] = useState(false);
  const [secClosing, setSecClosing] = useState(false);
  const secCodeRefs = useRef([]);

  // Sync local 2FA state from the user object / fresh profile fetches
  useEffect(() => {
    setTwoFAEnabled(!!user?.two_factor_enabled);
    setTwoFAMethod(user?.two_factor_enabled ? (user.two_factor_method || 'email') : 'none');
  }, [user?.two_factor_enabled, user?.two_factor_method]);

  // Load per-event 2FA preferences when the Security tab opens
  useEffect(() => {
    if (activeTab !== 'security') return;
    const tk = localStorage.getItem('token');
    if (!tk) return;
    axios.get(`${API_URL}/users/security`, { headers: authH() })
      .then(({ data }) => {
        setTwoFAEnabled(!!data.two_factor_enabled);
        setTwoFAMethod(data.two_factor_method || 'none');
        if (data.two_fa_events) setTwoFAEvents(data.two_fa_events);
      })
      .catch(() => { /* fall back to user-object state */ });
  }, [activeTab]);

  const METHOD_LABELS = { totp: 'Google Authenticator or Authy', email: 'Email' };

  const syncTwoFAUser = (enabled, method) => {
    if (setUser) setUser((u) => ({ ...u, two_factor_enabled: enabled, two_factor_method: method || null }));
    const stored = JSON.parse(localStorage.getItem('user') || '{}');
    localStorage.setItem('user', JSON.stringify({ ...stored, two_factor_enabled: enabled, two_factor_method: method || null }));
    window.dispatchEvent(new Event('userUpdated'));
  };

  const closeSecSheet = () => {
    setSecSheet(null);
    setSecConfirmCode(['', '', '', '', '', '']);
    setSecConfirmError('');
    setSecTotpSetup(null);
    setSecEventDraft(null);
    setSecWalletBalance(null);
    setSecResendFailed(false);
    setSecCopiedField(null);
    clearTimeout(secCopyTimerRef.current);
  };

  // Shared code-entry confirm — dispatches on what the user is confirming.
  const handleSecConfirm = async () => {
    const code = secConfirmCode.join('');
    if (code.length !== 6 || secConfirmBusy) return;
    setSecConfirmBusy(true);
    setSecConfirmError('');
    try {
      if (sec2FAPurpose === 'totp-setup') {
        await axios.post(`${API_URL}/users/2fa/totp/confirm`, { code }, { headers: authH() });
        setTwoFAEnabled(true);
        setTwoFAMethod('totp');
        syncTwoFAUser(true, 'totp');
        toast.success('Authenticator app 2FA enabled!');
        closeSecSheet();
        return;
      }
      if (sec2FAPurpose === 'events') {
        const draft = secEventDraft || {};
        await axios.patch(`${API_URL}/users/security`,
          { events: draft, actionCode: code },
          { headers: authH() });
        setTwoFAEvents(e => ({ ...e, ...draft }));
        // Return to the event list so the confirmed toggle change is visible;
        // the staged draft is dropped — only code-confirmed changes ever apply.
        setSecEventDraft(null);
        setSecConfirmCode(['', '', '', '', '', '']);
        setSecConfirmError('');
        setSecSheet('2fa-events');
        toast.success('2FA event settings updated');
        return;
      }
      // 'confirm' — confirm a settings change with the current method
      toast.success('Confirmed');
      closeSecSheet();
    } catch (e) {
      setSecConfirmError(e?.response?.data?.error || 'Invalid or expired code. Please try again.');
    } finally {
      setSecConfirmBusy(false);
    }
  };

  // Cancel from the code-entry sheet: for the event-settings flow, go back to
  // the event list with the staged change dropped — the toggle reverts, since
  // it was never applied. Every other purpose just closes the sheets.
  const cancelSecConfirm = () => {
    if (sec2FAPurpose === 'events') {
      setSecEventDraft(null);
      setSecConfirmCode(['', '', '', '', '', '']);
      setSecConfirmError('');
      setSecSheet('2fa-events');
      return;
    }
    closeSecSheet();
  };

  // Resend the email action code from the 2fa-code sheet — shared by every
  // purpose that uses the email channel (enable-2FA confirm, event-prefs
  // confirm). Failure surfaces as a toast AND an inline dismissible banner
  // with a Try again action, so the user isn't left with only a transient toast.
  const handleSecResendCode = async () => {
    if (secResendBusy) return;
    setSecResendBusy(true);
    setSecResendFailed(false);
    try {
      await axios.post(`${API_URL}/auth/send-action-code`, { action: 'enable_2fa' }, { headers: authH() });
      toast.success(`Security code sent to ${user?.email}!`);
    } catch (e) {
      setSecResendFailed(true);
      toast.error(e?.response?.data?.error || 'Failed to send security code');
    } finally {
      setSecResendBusy(false);
    }
  };

  // Copy a TOTP setup value (secret key or otpauth:// URI) to the clipboard
  // with brief "Copied!" feedback. Falls back to the legacy execCommand
  // path when the async Clipboard API is unavailable (older browsers /
  // permission issues); surfaces a toast if both fail.
  const handleSecCopy = async (text, field) => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setSecCopiedField(field);
      clearTimeout(secCopyTimerRef.current);
      secCopyTimerRef.current = setTimeout(() => setSecCopiedField(null), 1800);
    } catch (e) {
      toast.error('Copy failed — please select the text and copy it manually.');
    }
  };

  // "Enable" on the Google Authenticator option — generate secret + QR first.
  const startTotpSetup = async () => {
    if (twoFAEnabled && twoFAMethod !== 'totp') {
      setSecPendingMethod('totp');
      setSecConflictFrom(twoFAMethod);
      setSecSheet('2fa-conflict');
      return;
    }
    setSec2FAPurpose('totp-setup');
    setSecTotpSetup(null);
    setSecSheet('2fa-code');
    try {
      const { data } = await axios.post(`${API_URL}/users/2fa/totp/setup`, {}, { headers: authH() });
      setSecTotpSetup({ secret: data.secret, otpauth_url: data.otpauth_url });
    } catch (e) {
      const d = e?.response?.data || {};
      if (d.conflict) {
        setSecPendingMethod('totp');
        setSecConflictFrom(d.active_method || twoFAMethod);
        setSecSheet('2fa-conflict');
      } else {
        toast.error(d.error || 'Failed to start authenticator setup');
        closeSecSheet();
      }
    }
  };

  // "Enable" on the Email option — send an action code, then confirm via sheet.
  const startEmailSetup = async () => {
    if (twoFAEnabled && twoFAMethod !== 'email') {
      setSecPendingMethod('email');
      setSecConflictFrom(twoFAMethod);
      setSecSheet('2fa-conflict');
      return;
    }
    if (!emailVerified) {
      toast.error('Verify your email address first — see the Verification tab.');
      return;
    }
    setSec2FAPurpose('confirm');
    setSecSheet('2fa-code');
    try {
      await axios.post(`${API_URL}/auth/send-action-code`, { action: 'enable_2fa' }, { headers: authH() });
      toast.success(`Security code sent to ${user?.email}!`);
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Failed to send security code');
      closeSecSheet();
    }
  };

  // Both "Manage" buttons open the event-settings sheet; the Disable 2FA row
  // inside it (or the conflict sheet's "Manage 2FA") is the explicit way off a
  // method — mutual exclusivity means you must deactivate before switching.
  const startTotpManage = () => {
    setSec2FAPurpose('confirm');
    setSecSheet('2fa-events');
  };

  const startEmailManage = () => {
    setSec2FAPurpose('confirm');
    setSecSheet('2fa-events');
  };

  // Confirm disable of the active 2FA method (password check enforced server-side)
  const handleSecDisable2FA = async () => {
    if (!twoFADisablePw) {
      toast.error('Enter your current password to disable 2FA');
      return;
    }
    setTwoFADisabling(true);
    try {
      await axios.patch(`${API_URL}/users/toggle-2fa`,
        { two_factor_enabled: false, password: twoFADisablePw },
        { headers: authH() });
      setTwoFAEnabled(false);
      setTwoFAMethod('none');
      setShowDisable2FA(false);
      setTwoFADisablePw('');
      syncTwoFAUser(false, null);
      toast.success('Two-factor authentication disabled');
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Failed to disable 2FA');
    } finally {
      setTwoFADisabling(false);
    }
  };

  // Save event-toggle changes — requires a fresh code from the active method.
  // The payload is staged only: the toggle does NOT move (visually or in state)
  // until the code entered in the 2fa-code sheet is verified by the server.
  const saveSecEvents = async (nextEvents) => {
    if (!twoFAEnabled || !twoFAMethod) {
      toast.error('Enable 2FA first before choosing which events require a code.');
      return;
    }
    // Nothing actually changed (e.g. footer "Continue" with no edits) — don't
    // make the user confirm a no-op with a fresh code.
    const cur = twoFAEvents;
    if (TWO_FA_EVENT_KEYS.every(k => !!cur[k] === !!nextEvents[k])) {
      setSecEventDraft(null);
      setSecSheet('2fa-events');
      toast.info('No changes to save');
      return;
    }
    setSecEventDraft(nextEvents);
    setSec2FAPurpose('events');
    setSecConfirmCode(['', '', '', '', '', '']);
    setSecConfirmError('');
    if (twoFAMethod === 'email') {
      // A fresh email action code is needed for the PATCH — send it up-front
      try {
        setSecSheet('2fa-code');
        await axios.post(`${API_URL}/auth/send-action-code`, { action: 'enable_2fa' }, { headers: authH() });
        toast.success(`Security code sent to ${user?.email}!`);
      } catch (e) {
        toast.error(e?.response?.data?.error || 'Failed to send security code');
        // Stay in the event list with the change unstaged (toggle never moved).
        setSecEventDraft(null);
        setSecSheet('2fa-events');
      }
    } else {
      setSecSheet('2fa-code');
    }
  };

  // Close account — check wallet balance, warn, then request confirmation email
  const openCloseAccount = async () => {
    setSecSheet('close-account');
    setSecWalletLoading(true);
    try {
      const { data } = await axios.get(`${API_URL}/wallet`, { headers: authH() });
      setSecWalletBalance(parseFloat(data?.wallet?.balance_usd ?? 0));
    } catch {
      setSecWalletBalance(0);
    } finally {
      setSecWalletLoading(false);
    }
  };

  const handleSecCloseAccount = async () => {
    if (secClosing) return;
    setSecClosing(true);
    try {
      await axios.post(`${API_URL}/users/close-account`, {}, { headers: authH() });
      toast.success('Confirmation link sent to your email. Open it to submit your closure request.');
      closeSecSheet();
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Failed to submit close-account request');
    } finally {
      setSecClosing(false);
    }
  };

  useEffect(() => {
    if (!user) {
      navigate("/login");
      return;
    }
    setAccountForm({
      username: user.username || "",
      fullName: user.full_name || "",
      email: user.email || "",
      phone: user.phone || "",
      bio: user.bio || "",
      location: user.location || "",
    });
    const saved = localStorage.getItem("hide_full_name");
    if (saved !== null) {
      setHideFullName(saved === "true");
    } else if (user.hide_full_name !== undefined) {
      setHideFullName(!!user.hide_full_name);
    }
    setEmailVerified(!!(user.is_email_verified || user.email_verified));
    setPhoneVerified(!!(user.is_phone_verified || user.phone_verified));
    setAddressVerified(!!user.address_verified);
    setKycVerified(!!(user.kyc_verified || user.is_id_verified));
    setTwoFAEnabled(!!user.two_factor_enabled);
    // One-time username lock — read from the backend user record on load
    setUsernameLocked(!!(user.hasChangedUsername || user.username_changed || user.has_changed_username || user.username_changed_at));
  }, [user, navigate]);

  // On mount, fetch fresh profile + KYC status
  useEffect(() => {
    const tk = localStorage.getItem("token");
    if (!tk) {
      setVerificationSyncing(false);
      return;
    }

    Promise.allSettled([
      axios.get(`${API_URL}/users/profile`, { headers: authH() }),
      axios.get(`${API_URL}/kyc/status`, { headers: authH() }),
    ])
        .then(([profileResult, kycResult]) => {
          const profileRes = profileResult.status === "fulfilled" ? profileResult.value : null;
          const kycRes = kycResult.status === "fulfilled" ? kycResult.value : null;
          const fresh = profileRes?.data?.user || profileRes?.data;
          if (fresh?.id) {
            const emailOk = !!(fresh.is_email_verified || fresh.email_verified);
            const phoneOk = !!(fresh.is_phone_verified || fresh.phone_verified);
            setEmailVerified(emailOk);
            setPhoneVerified(phoneOk);
            setAddressVerified(!!fresh.address_verified);
            setTwoFAEnabled(!!fresh.two_factor_enabled);
            if (emailOk) {
              localStorage.removeItem("prq_email_resend");
              setEmailResendCount(0);
            }
            if (phoneOk) {
              localStorage.removeItem("prq_phone_resend");
              setPhoneResendCount(0);
              setPhoneStep("done");
              setPhoneOtpCode("");
            }
            if (fresh.phone) setAccountForm((prev) => ({ ...prev, phone: fresh.phone }));
            if (fresh.location) setAccountForm((prev) => ({ ...prev, location: fresh.location }));
            setPrefs((p) => {
              const currency = fresh.preferred_currency || p.currency;
              const language = fresh.preferred_language || p.language;
              const timezone = fresh.timezone || fresh.preferred_timezone || p.timezone;
              const nameDisplay = fresh.name_display || (fresh.hide_full_name ? "hide" : null) || p.nameDisplay;
              if (currency) localStorage.setItem("praqen_currency", currency);
              if (language) localStorage.setItem("praqen_language", language);
              if (timezone) localStorage.setItem("praqen_timezone", timezone);
              if (nameDisplay) localStorage.setItem("praqen_name_display", nameDisplay);
              return { ...p, currency, language, timezone, nameDisplay, showOnline: fresh.show_online !== false };
            });
            if (setUser) setUser((u) => ({ ...u, ...fresh }));
            const stored = JSON.parse(localStorage.getItem("user") || "{}");
            localStorage.setItem("user", JSON.stringify({ ...stored, ...fresh }));
          }
          if (kycRes) {
            const kyc = kycRes.data;
            const isVerified = !!(kyc.is_id_verified || kyc.kyc_status === "approved");
            setKycVerified(isVerified);
            if (kyc.kyc_rejection_reason) setKycRejectedReason(kyc.kyc_rejection_reason);
            const kycStored = JSON.parse(localStorage.getItem("praqen_kyc") || "{}");
            if (kyc.kyc_status) {
              setKycStatus(kyc.kyc_status);
              kycStored.status = kyc.kyc_status;
            }
            if (kyc.kyc_id_type) {
              setKycSubmittedType(kyc.kyc_id_type);
              kycStored.id_type = kyc.kyc_id_type;
            }
            if (kyc.kyc_submitted_at) {
              setKycSubmittedAt(kyc.kyc_submitted_at);
              kycStored.submitted_at = kyc.kyc_submitted_at;
            }
            if (kyc.kyc_status === "pending") {
              setKycSubmitted(true);
              kycStored.status = "pending";
            } else if (kyc.kyc_status === "approved") {
              setKycSubmitted(false);
              localStorage.removeItem("praqen_kyc");
            }
            if (kyc.kyc_status !== "approved") {
              localStorage.setItem("praqen_kyc", JSON.stringify(kycStored));
            }
          }
        })
        .catch(() => {
          axios.get(`${API_URL}/users/profile`, { headers: authH() })
              .then(r => {
                const fresh = r.data.user || r.data;
                if (!fresh?.id) return;
                setEmailVerified(!!(fresh.is_email_verified || fresh.email_verified));
                setPhoneVerified(!!(fresh.is_phone_verified || fresh.phone_verified));
                setAddressVerified(!!fresh.address_verified);
                setKycVerified(!!(fresh.kyc_verified || fresh.is_id_verified));
                if (fresh.phone) setAccountForm(prev => ({ ...prev, phone: fresh.phone }));
                if (fresh.kyc_status) {
                  setKycStatus(fresh.kyc_status);
                  if (fresh.kyc_status === 'pending') {
                    setKycSubmitted(true);
                    const kycFallback = JSON.parse(localStorage.getItem('praqen_kyc') || '{}');
                    kycFallback.status = 'pending';
                    localStorage.setItem('praqen_kyc', JSON.stringify(kycFallback));
                  } else if (fresh.kyc_status === 'approved') {
                    setKycSubmitted(false);
                    localStorage.removeItem('praqen_kyc');
                  }
                }
                if (fresh.kyc_id_type) { setKycSubmittedType(fresh.kyc_id_type); }
              }).catch(() => {});
        })
        .finally(() => setVerificationSyncing(false));
  }, []);

  const handleAccountUpdate = async (e) => {
    e.preventDefault();
    setLoading(true);
    const phoneIsLocked = phoneVerified || phoneStep === "done";
    try {
      const payload = {
        username: accountForm.username,
        fullName: accountForm.fullName,
        bio: accountForm.bio,
      };
      if (!phoneIsLocked) payload.phone = accountForm.phone;
      const locationLocked = kycVerified || !!(user?.is_id_verified || user?.kyc_verified || user?.kyc_status === "approved");
      if (!locationLocked) payload.location = accountForm.location;
      const r = await axios.put(`${API_URL}/users/profile`, payload, {
        headers: authH(),
      });
      const updated = r.data.user || {};
      // Lock immediately if this save changed the username (one-time lock — the
      // backend sets has_changed_username in the same update, so no refresh needed).
      if (accountForm.username !== (user?.username || "")) setUsernameLocked(true);
      const locationUpdate = locationLocked ? {} : { location: accountForm.location };
      if (setUser) setUser({
        ...user,
        username: accountForm.username,
        full_name: accountForm.fullName,
        ...locationUpdate,
        ...(phoneIsLocked ? {} : { phone: accountForm.phone }),
        ...updated,
      });
      const stored = JSON.parse(localStorage.getItem("user") || "{}");
      localStorage.setItem("user", JSON.stringify({
        ...stored,
        username: accountForm.username,
        full_name: accountForm.fullName,
        ...locationUpdate,
        ...(phoneIsLocked ? {} : { phone: accountForm.phone }),
        ...updated,
      }));
      window.dispatchEvent(new Event("userUpdated"));
      toast.success("Account updated!");
    } catch (e) {
      toast.error(e?.response?.data?.error || "Failed to update");
    } finally {
      setLoading(false);
    }
  };

  const saveMobileAccountField = async (field, value) => {
    if (field === 'username' && !value.trim()) {
      toast.error('Username is required');
      throw new Error('Username is required');
    }
    const next = { ...accountForm, [field]: value };
    const phoneIsLocked = phoneVerified || phoneStep === 'done';
    const locationLocked = kycVerified || !!(user?.is_id_verified || user?.kyc_verified || user?.kyc_status === 'approved');
    const payload = { username: next.username, fullName: next.fullName, bio: next.bio };
    if (!phoneIsLocked) payload.phone = next.phone;
    if (!locationLocked) payload.location = next.location;

    try {
      const r = await axios.put(`${API_URL}/users/profile`, payload, { headers: authH() });
      const updated = r.data.user || {};
      // Lock immediately on a successful username change — the backend sets
      // has_changed_username in the same update, so no refresh is needed.
      if (field === 'username') setUsernameLocked(true);
      setAccountForm(next);
      const userUpdate = {
        username: next.username,
        full_name: next.fullName,
        ...(phoneIsLocked ? {} : { phone: next.phone }),
        ...(locationLocked ? {} : { location: next.location }),
      };
      if (setUser) setUser(u => ({ ...u, ...userUpdate, ...updated }));
      const stored = JSON.parse(localStorage.getItem('user') || '{}');
      localStorage.setItem('user', JSON.stringify({ ...stored, ...userUpdate, ...updated }));
      window.dispatchEvent(new Event('userUpdated'));
      toast.success(`${field === 'fullName' ? 'Full name' : field[0].toUpperCase() + field.slice(1)} updated!`);
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Failed to update');
      throw e;
    }
  };

  // ── NoOnes-parity email change — saves the new email and triggers the shared
  // 24-hour withdrawal lock (backend sets withdrawal_locked_until = max lock).
  const handleEmailChange = async () => {
    const newEmail = (emailDraft || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
      toast.error('Enter a valid email address');
      return;
    }
    setEmailSaving(true);
    try {
      const r = await axios.put(`${API_URL}/users/profile`, { email: newEmail, withdrawal_lock: true }, { headers: authH() });
      const updated = r.data.user || {};
      setAccountForm(p => ({ ...p, email: newEmail }));
      if (setUser) setUser(u => ({ ...u, ...updated, email: newEmail }));
      const stored = JSON.parse(localStorage.getItem('user') || '{}');
      localStorage.setItem('user', JSON.stringify({ ...stored, ...updated, email: newEmail }));
      window.dispatchEvent(new Event('userUpdated'));
      toast.success('Email updated! Withdrawals are disabled for 24 hours.');
      setEmailModalOpen(false);
      setEmailDraft('');
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Failed to update email');
    } finally {
      setEmailSaving(false);
    }
  };

  // ── NoOnes-parity phone change — saves country code + number and triggers the
  // same shared 24-hour withdrawal lock as the email change.
  const handlePhoneChange = async () => {
    const digits = (phoneDraft || '').replace(/[\s\-()]/g, '');
    if (!digits) {
      toast.error('Enter your phone number');
      return;
    }
    const fullPhone = `${phoneCountry.code}${digits.replace(/^\+/, '')}`;
    if (fullPhone.replace(/\D/g, '').length < 8) {
      toast.error('That doesn\'t look like a full phone number');
      return;
    }
    setPhoneSaving(true);
    try {
      const r = await axios.put(`${API_URL}/users/profile`, { phone: fullPhone, withdrawal_lock: true }, { headers: authH() });
      const updated = r.data.user || {};
      setAccountForm(p => ({ ...p, phone: fullPhone }));
      if (setUser) setUser(u => ({ ...u, ...updated, phone: fullPhone }));
      const stored = JSON.parse(localStorage.getItem('user') || '{}');
      localStorage.setItem('user', JSON.stringify({ ...stored, ...updated, phone: fullPhone }));
      window.dispatchEvent(new Event('userUpdated'));
      toast.success('Phone number updated! Withdrawals are disabled for 24 hours.');
      setPhoneModalOpen(false);
      setPhoneDraft('');
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Failed to update phone number');
    } finally {
      setPhoneSaving(false);
    }
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    if (passwordForm.newPassword.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }
    setPasswordSuccess(false);
    setLoading(true);
    try {
      await axios.post(`${API_URL}/auth/change-password`, {
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword
      }, { headers: authH() });
      toast.success('Password changed!');
      setPasswordSuccess(true);
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setTimeout(() => setPasswordSuccess(false), 5000);
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Failed to change password');
    } finally {
      setLoading(false);
    }
  };

  const handlePaymentUpdate = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await axios.put(`${API_URL}/users/payment-methods`, payments, {
        headers: authH(),
      });
      toast.success("Payment methods saved!");
    } catch {
      toast.error("Failed to save payment methods");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    setLogoutConfirm(true);
  };

  const handleLogoutConfirm = async () => {
    setLoggingOut(true);
    await new Promise(r => setTimeout(r, 400));
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('praqen_kyc');
    if (setUser) setUser(null);
    window.dispatchEvent(new Event("userUpdated"));
    toast.info('Logged out');
    setLogoutConfirm(false);
    setLoggingOut(false);
    navigate('/login');
  };

  const handleSendPhoneOtp = async () => {
    const isEmail = phoneOtpMethod === "email";
    if (isEmail) {
      const email = (accountForm.email || "").trim().toLowerCase();
      if (!email) {
        toast.error("Please enter your email address first");
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        toast.error("That doesn't look like a valid email address.");
        return;
      }
      setAccountForm((prev) => ({ ...prev, email }));
      setPhoneStep("sending");
      try {
        const r = await axios.post(`${API_URL}/users/send-phone-otp`, { phone: email, method: "email" }, { headers: authH() });
        setPhoneStep("otp");
        if (r.data?.devCode) {
          setPhoneOtpCode(r.data.devCode);
          toast.info(`Dev: code auto-filled (${r.data.devCode})`, { autoClose: 8000 });
        } else {
          toast.success("Code sent to your email! Check inbox and spam folder.");
        }
      } catch (e) {
        const errData = e?.response?.data;
        if (errData?.devCode) {
          setPhoneOtpCode(errData.devCode);
          setPhoneStep("otp");
          toast.warning(`Send failed — dev code auto-filled: ${errData.devCode}`, { autoClose: 10000 });
        } else {
          toast.error(errData?.error || "Failed to send code. Please try again.");
          setPhoneStep("idle");
        }
      }
      return;
    }
    const raw = accountForm.phone || "";
    const phone = raw.trim().replace(/[\s\-()]/g, "");
    if (!phone) {
      toast.error("Please enter your phone number first");
      return;
    }
    if (!phone.startsWith("+")) {
      toast.error("Please include your country code, e.g. +233 for Ghana, +234 for Nigeria");
      return;
    }
    const digitCount = phone.replace(/\D/g, "").length;
    if (digitCount < 10 || digitCount > 15) {
      toast.error("That doesn't look like a full number. Example for Ghana: +233241234567 (country code + 9-digit number, no leading 0).");
      return;
    }
    setAccountForm((prev) => ({ ...prev, phone }));
    setPhoneStep("sending");
    try {
      const r = await axios.post(`${API_URL}/users/send-phone-otp`, { phone, method: phoneOtpMethod }, { headers: authH() });
      setPhoneStep("otp");
      if (r.data?.devCode) {
        setPhoneOtpCode(r.data.devCode);
        toast.info(`Dev: code auto-filled (${r.data.devCode})`, { autoClose: 8000 });
      } else {
        const msg = phoneOtpMethod === 'email' ? 'Code sent to your email! Check inbox and spam folder.' :
            phoneOtpMethod === 'sms' ? 'Code sent via SMS to your phone!' : 'Code sent via WhatsApp!';
        toast.success(msg);
      }
    } catch (e) {
      const errData = e?.response?.data;
      if (errData?.devCode) {
        setPhoneOtpCode(errData.devCode);
        setPhoneStep("otp");
        toast.warning(`Send failed — dev code auto-filled: ${errData.devCode}`, { autoClose: 10000 });
      } else {
        toast.error(errData?.error || "Failed to send code. Please try again.");
        setPhoneStep("idle");
      }
    }
  };

  const handleVerifyPhoneOtp = async () => {
    if (phoneOtpCode.length < 6) {
      toast.error("Enter the full 6-digit code");
      return;
    }
    setPhoneStep("verifying");
    try {
      const isEmail = phoneOtpMethod === "email";
      await axios.post(`${API_URL}/users/verify-phone-otp`, {
        phone: isEmail ? undefined : accountForm.phone,
        email: isEmail ? (accountForm.email || "").trim() : undefined,
        otp: phoneOtpCode,
      }, { headers: authH() });
      toast.success("Phone number verified!");
      markPhoneVerifiedLocally(isEmail ? accountForm.email : accountForm.phone);
    } catch (e) {
      toast.error(e?.response?.data?.error || "Invalid or expired code. Tap Resend to get a new one.");
      setPhoneStep("otp");
    }
  };

  const handleSendEmailCode = async () => {
    setEmailCodeLoading(true);
    try {
      const r = await axios.post(`${API_URL}/users/resend-verification`, {}, { headers: authH() });
      toast.success("Verification code sent! Check your inbox and spam/junk folder.");
      setEmailVerifyStep("otp");
      const nc = emailResendCount + 1;
      setEmailResendCount(nc);
      localStorage.setItem("prq_email_resend", String(nc));
      if (r.data?.devCode) {
        setEmailCode(r.data.devCode);
        toast.info(`Dev: code auto-filled (${r.data.devCode})`, { autoClose: 8000 });
      }
    } catch (e) {
      const errData = e?.response?.data;
      if (errData?.devCode) {
        setEmailCode(errData.devCode);
        setEmailVerifyStep("otp");
        toast.warning(`Email failed — dev code auto-filled: ${errData.devCode}`, { autoClose: 10000 });
      } else {
        toast.error(errData?.error || "Failed to send code");
      }
    } finally {
      setEmailCodeLoading(false);
    }
  };

  const handleVerifyEmailCode = async () => {
    if (emailCode.length < 6) {
      toast.error("Enter the 6-digit code");
      return;
    }
    setEmailVerifyStep("verifying");
    try {
      await axios.post(`${API_URL}/users/verify-email-code`, { code: emailCode }, { headers: authH() });
      toast.success("Email verified!");
      setEmailVerified(true);
      if (setUser) setUser((u) => ({ ...u, is_email_verified: true, email_verified: true }));
      const stored = JSON.parse(localStorage.getItem("user") || "{}");
      localStorage.setItem("user", JSON.stringify({ ...stored, is_email_verified: true, email_verified: true }));
      window.dispatchEvent(new Event("userUpdated"));
      setEmailVerifyStep("idle");
      setEmailCode("");
    } catch (e) {
      toast.error(e?.response?.data?.error || "Invalid or expired code");
      setEmailVerifyStep("otp");
    }
  };

  const handleEnable2FA = async () => {
    if (!emailVerified) {
      toast.error("Verify your email address first — see the Verification tab.");
      return;
    }
    setTwoFASending(true);
    try {
      await axios.post(`${API_URL}/auth/send-action-code`, { action: "enable_2fa" }, { headers: authH() });
      toast.success(`Security code sent to ${user?.email}!`);
      setTwoFAStep("otp");
    } catch (e) {
      toast.error(e?.response?.data?.error || "Failed to send security code");
    } finally {
      setTwoFASending(false);
    }
  };

  const handleActivate2FA = async () => {
    if (twoFACode.length < 6) {
      toast.error("Enter the 6-digit code");
      return;
    }
    setTwoFAActivating(true);
    try {
      await axios.patch(`${API_URL}/users/toggle-2fa`,
        { two_factor_enabled: true, two_factor_method: "email", actionCode: twoFACode },
        { headers: authH() });
      toast.success("Two-factor authentication enabled!");
      setTwoFAEnabled(true);
      setTwoFAStep("idle");
      setTwoFACode("");
      if (setUser) setUser((u) => ({ ...u, two_factor_enabled: true, two_factor_method: "email" }));
      const stored = JSON.parse(localStorage.getItem("user") || "{}");
      localStorage.setItem("user", JSON.stringify({ ...stored, two_factor_enabled: true, two_factor_method: "email" }));
      window.dispatchEvent(new Event("userUpdated"));
    } catch (e) {
      toast.error(e?.response?.data?.error || "Invalid or expired code");
    } finally {
      setTwoFAActivating(false);
    }
  };

  const handleDisable2FA = async () => {
    if (!twoFADisablePw) {
      toast.error("Enter your current password to disable 2FA");
      return;
    }
    setTwoFADisabling(true);
    try {
      await axios.patch(`${API_URL}/users/toggle-2fa`,
        { two_factor_enabled: false, password: twoFADisablePw },
        { headers: authH() });
      toast.success("Two-factor authentication disabled");
      setTwoFAEnabled(false);
      setShowDisable2FA(false);
      setTwoFADisablePw("");
      if (setUser) setUser((u) => ({ ...u, two_factor_enabled: false, two_factor_method: null }));
      const stored = JSON.parse(localStorage.getItem("user") || "{}");
      localStorage.setItem("user", JSON.stringify({ ...stored, two_factor_enabled: false, two_factor_method: null }));
      window.dispatchEvent(new Event("userUpdated"));
    } catch (e) {
      toast.error(e?.response?.data?.error || "Failed to disable 2FA");
    } finally {
      setTwoFADisabling(false);
    }
  };

  const saveNameDisplay = async (selectedMode = prefs.nameDisplay) => {
    const mode = selectedMode;
    setNameDisplaySaving(true);
    setNameDisplaySaved(false);
    try {
      await axios.put(`${API_URL}/users/profile`, { name_display: mode }, { headers: authH() });
      setHideFullName(mode === "hide");
      localStorage.setItem("hide_full_name", mode === "hide" ? "true" : "false");
      localStorage.setItem("praqen_name_display", mode);
      if (setUser) setUser((u) => ({ ...u, name_display: mode, hide_full_name: mode === "hide" }));
      toast.success("Name display saved");
      setNameDisplaySaved(true);
      setTimeout(() => setNameDisplaySaved(false), 3000);
    } catch (e) {
      toast.error(e?.response?.data?.error || "Failed to save — please try again");
    } finally {
      setNameDisplaySaving(false);
    }
  };

  const markPhoneVerifiedLocally = (phone) => {
    setPhoneVerified(true);
    setPhoneStep("done");
    localStorage.removeItem("prq_phone_step");
    if (setUser) setUser((u) => ({ ...u, is_phone_verified: true, phone_verified: true, phone }));
    const stored = JSON.parse(localStorage.getItem("user") || "{}");
    localStorage.setItem("user", JSON.stringify({ ...stored, is_phone_verified: true, phone_verified: true, phone }));
    window.dispatchEvent(new Event("userUpdated"));
  };

  const compressImage = (fileInput, maxPx = 1400, quality = 0.82) =>
      new Promise((resolve, reject) => {
        const file = fileInput instanceof Blob ? fileInput : (fileInput?.file || fileInput);
        if (!file || !(file instanceof Blob)) {
          reject(new Error("Invalid file object"));
          return;
        }
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
          const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
          const w = Math.round(img.width * scale);
          const h = Math.round(img.height * scale);
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          canvas.getContext("2d").drawImage(img, 0, 0, w, h);
          URL.revokeObjectURL(url);
          resolve(canvas.toDataURL("image/jpeg", quality));
        };
        img.onerror = () => {
          URL.revokeObjectURL(url);
          reject(new Error("Image load failed"));
        };
        img.src = url;
      });

  const handleIdVerifySubmit = async () => {
    if (!idDocs.front || !idDocs.selfie || !idForm.idType) {
      toast.error("Capture your ID front and a selfie holding your ID before submitting");
      return;
    }
    const fullName = (idForm.fullName || '').trim().replace(/\s+/g, ' ');
    if (!fullName) { toast.error("Please enter your full legal name"); return; }
    if (!idForm.dob) { toast.error("Please enter your date of birth"); return; }
    setKycLoading(true);
    try {
      const [idImage, selfieImage, idImageBack] = await Promise.all([
        compressImage(idDocs.front),
        compressImage(idDocs.selfie),
        idDocs.back ? compressImage(idDocs.back) : Promise.resolve(null),
      ]);
      await axios.post(`${API_URL}/kyc/upload`, {
        idImage, selfieImage, idImageBack: idImageBack || undefined,
        idType: idForm.idType, fullName, dateOfBirth: idForm.dob,
        documentNumber: idForm.docNumber, country: idForm.country, city: idForm.city,
        postalCode: idForm.postalCode, address: idForm.address,
      }, { headers: authH() });
      toast.success("Documents received! We'll review within 24 hours.");
      const submittedAt = new Date().toISOString();
      setKycSubmitted(true);
      setKycStatus("pending");
      setKycSubmittedType(idForm.idType);
      setKycSubmittedAt(submittedAt);
      localStorage.setItem("praqen_kyc", JSON.stringify({ status: "pending", id_type: idForm.idType, submitted_at: submittedAt }));
      // Identity details confirmed in the same submission — persist locally too.
      setAccountForm(p => ({ ...p, fullName }));
      if (setUser) setUser(u => ({ ...u, full_name: fullName, identity_basics_verified: true }));
      const userStored = JSON.parse(localStorage.getItem("user") || "{}");
      localStorage.setItem("user", JSON.stringify({ ...userStored, full_name: fullName, identity_basics_verified: true }));
      window.dispatchEvent(new Event("userUpdated"));
      // Back in the Verification tab, Level 2 now shows "Pending review" —
      // it only becomes "✓ Verified" after backend/admin approval.
      setIdVerifyOpen(false);
      setIdDocs({ front: null, selfie: null, back: null });
    } catch (e) {
      const msg = e?.response?.data?.error || (e?.response?.status === 413 ? "Images are too large. Please use smaller photos and try again." : null) || "Failed to submit KYC. Please check your connection and try again.";
      toast.error(msg);
    } finally {
      setKycLoading(false);
    }
  };

  const handleSavePreferences = async (preferences = prefs) => {
    setLoading(true);
    try {
      await axios.put(`${API_URL}/users/preferences`, { ...preferences, show_online: preferences.showOnline }, { headers: authH() });
      localStorage.setItem("praqen_currency", preferences.currency);
      localStorage.setItem("praqen_language", preferences.language);
      localStorage.setItem("praqen_timezone", preferences.timezone);
      if (setUser) setUser((u) => ({ ...u, preferred_currency: preferences.currency, preferred_language: preferences.language, timezone: preferences.timezone, show_online: preferences.showOnline }));
      toast.success("Preferences saved!");
    } catch (e) {
      toast.error("Failed to save preferences");
    } finally {
      setLoading(false);
    }
  };

  const updatePreference = (updates) => {
    const next = { ...prefs, ...updates };
    setPrefs(next);
    handleSavePreferences(next);
  };

  // Fetch Notifications Function
  const fetchNotifications = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/user/notification-preferences`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.data) {
        const data = response.data;
        setNotifs({
          email_trades: data.email_trades ?? true,
          email_security: data.email_security ?? true,
          email_marketing: data.email_marketing ?? false,
          push_trades: data.push_trades ?? true,
          push_messages: data.push_messages ?? true,
          push_disputes: data.push_disputes ?? true,
        });
        localStorage.setItem('praqen_notifications', JSON.stringify(data));
      }
    } catch (error) {
      console.error('Failed to fetch notifications:', error);
      const saved = localStorage.getItem('praqen_notifications');
      if (saved) {
        try { setNotifs(JSON.parse(saved)); } catch {}
      }
    }
  };

  // Save Notifications Function
  const handleSaveNotifications = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const payload = {
        email_trades: notifs.email_trades,
        email_security: notifs.email_security,
        email_marketing: notifs.email_marketing,
        push_trades: notifs.push_trades,
        push_messages: notifs.push_messages,
        push_disputes: notifs.push_disputes,
      };

      await axios.put(`${API_URL}/user/notification-preferences`, payload, {
        headers: { Authorization: `Bearer ${token}` }
      });

      localStorage.setItem('praqen_notifications', JSON.stringify(notifs));
      toast.success('Notification preferences saved successfully!');
    } catch (error) {
      console.error('Save error:', error);
      toast.error(error?.response?.data?.error || 'Failed to save preferences');
    } finally {
      setLoading(false);
    }
  };

  // Fetch notifications when Notifications tab opens
  useEffect(() => {
    if (activeTab === 'notifications') {
      fetchNotifications();
    }
  }, [activeTab]);

  // NoOnes-parity settings menu — exact order, no Developer / Connected apps &
  // websites (excluded by spec), no Preferences / Payment (they exist elsewhere
  // in the app but must not appear in this list). "Profile" navigates to the
  // user's profile page instead of opening an account settings sub-tab.
  const TABS = [
    { id: "profile", icon: User, label: "Profile", route: "/profile" },
    { id: "verification", icon: Shield, label: "Verification" },
    { id: "security", icon: Lock, label: "Security" },
    { id: "devices", icon: Smartphone, label: "Devices", route: "/devices" },
    { id: "activity", icon: Clock, label: "Activity log", route: "/activity-log" },
    { id: "notifications", icon: Bell, label: "Notifications" },
    { id: "trader-settings", icon: CreditCard, label: "Trader settings", route: "/trader-settings" },
  ];

  // Desktop (≥1024px) media query — drives the NoOnes-style desktop redesign
  // of the Security tab (pill sidebar nav, horizontal settings rows, compact
  // outlined pill buttons). Mobile/tablet layouts are untouched.
  const isDesktop = useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia('(min-width: 1024px)');
      mq.addEventListener('change', cb);
      return () => mq.removeEventListener('change', cb);
    },
    () => window.matchMedia('(min-width: 1024px)').matches,
    () => false
  );

  const inputCls = "w-full px-4 py-2.5 border rounded-lg text-sm focus:outline-none focus:border-green-500 transition";
  const inputStyle = () => ({
    borderColor: C.g200,
    color: C.g800,
    backgroundColor: C.g50,
  });
  const labelCls = "block text-xs font-semibold mb-1.5";

  // ── Security tab — shared pieces (NoOnes parity) ────────────────────────────
  // Gold "Activated" badge shown next to the ACTIVE 2FA method's title.
  const SecActivatedBadge = () => (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-black flex-shrink-0"
          style={{ backgroundColor: '#FEF3C7', color: '#B45309' }}>
      Activated
    </span>
  );

  // Small toggle switch used by the 2FA event settings sheet (green when on).
  const SecToggle = ({ on, onClick, disabled, ariaLabel }) => (
    <button type="button" role="switch" aria-checked={on} aria-label={ariaLabel || 'Toggle'} onClick={onClick} disabled={disabled}
            className="relative flex-shrink-0 transition-colors duration-200 rounded-full"
            style={{ width: 40, height: 22, backgroundColor: on ? C.success : '#CBD5E1', opacity: disabled ? 0.6 : 1 }}>
      <span className="absolute top-0.5 rounded-full bg-white shadow transition-all duration-200"
            style={{ width: 18, height: 18, left: on ? 20 : 2 }} />
    </button>
  );

  // 6 individual single-digit boxes with auto-advance and paste support.
  const SecCodeInputs = ({ values, onChange, refs }) => {
    const focusIdx = (i) => refs.current[i]?.focus();
    const setDigit = (i, ch) => {
      const digits = ch.replace(/\D/g, '');
      if (!digits) return;
      const next = [...values];
      let cursor = i;
      for (const d of digits) {
        if (cursor > 5) break;
        next[cursor] = d;
        cursor += 1;
      }
      onChange(next);
      focusIdx(Math.min(cursor, 5));
    };
    return (
      <div className="flex gap-2" style={{ direction: 'ltr' }}>
        {values.map((v, i) => (
          <input key={i} ref={el => { refs.current[i] = el; }}
                 value={v}
                 inputMode="numeric" autoComplete="one-time-code" maxLength={6}
                 onChange={e => setDigit(i, e.target.value)}
                 onKeyDown={e => { if (e.key === 'Backspace' && !values[i] && i > 0) focusIdx(i - 1); }}
                 onFocus={e => e.target.select()}
                 className="flex-1 min-w-0 aspect-square text-center text-xl font-black rounded-lg outline-none transition"
                 style={{
                   border: `2px solid ${v ? C.green : C.g200}`,
                   color: C.g800,
                   backgroundColor: C.g50,
                 }} />
        ))}
      </div>
    );
  };

  return (
      <div className="min-h-screen flex flex-col md:overflow-x-hidden" style={{ backgroundColor: C.mist, fontFamily: "'DM Sans',sans-serif" }}>
        <div className="max-w-6xl mx-auto w-full px-4 py-4 md:max-w-none md:w-auto md:mx-8 md:py-8">
          {/* Header row — mobile: 'Account settings' + hamburger | desktop: 'Settings' heading + subtitle */}
          <div className="mb-2 md:mb-8 flex items-center justify-between">
            {/* Mobile heading */}
            <h1 className="md:hidden text-xl font-black" style={{ color: C.forest, fontFamily: "'Syne',sans-serif" }}>Account settings</h1>
            {/* Desktop heading + subtitle */}
            <div className="hidden md:block">
              <h1 className="text-2xl md:text-3xl font-black" style={{ color: C.forest, fontFamily: "'Syne',sans-serif" }}>Settings</h1>
              <p className="text-sm mt-1" style={{ color: C.g500 }}>Manage your account, security and preferences</p>
            </div>
            {/* Hamburger menu — mobile only */}
            <button onClick={() => setMobileMenuOpen(true)}
                    className="md:hidden flex items-center justify-center w-10 h-10 rounded-xl transition hover:bg-white/80"
                    style={{ flexShrink: 0 }}>
              <Menu size={22} style={{ color: C.g700 }} />
            </button>
          </div>

          <div className="flex flex-col md:flex-row gap-4 md:gap-6">            {/* Sidebar tabs — horizontal pill bar removed on mobile (hamburger menu replaces it) */}
            <div className="md:w-52 flex-shrink-0">

              {/* Desktop: vertical sidebar. ≥1024px: NoOnes-style pill nav —
                  each item its own rounded card; the active item is a solid
                  green pill with white text/icon; inactive items are light
                  gray with a subtle darken on hover. 768–1023px keeps the
                  previous white-card list; mobile uses the hamburger menu. */}
              {isDesktop ? (
                  <div className="hidden md:flex flex-col gap-1.5">
                    {TABS.map(({ id, icon: Icon, label, route }) => (
                        <button key={id} onClick={() => (route ? navigate(route) : setActiveTab(id))}
                                className={`w-full flex items-center gap-3 px-4 py-3 text-left rounded-[10px] transition-all duration-150 ${activeTab === id ? '' : 'hover:brightness-95'}`}
                                style={{
                                  backgroundColor: activeTab === id ? C.green : C.g50,
                                  boxShadow: activeTab === id ? '0 1px 2px rgba(15, 23, 42, 0.10)' : 'none',
                                }}>
                          <Icon size={16} style={{ color: activeTab === id ? '#FFFFFF' : C.g400 }} />
                          <span className="text-sm font-bold" style={{ color: activeTab === id ? '#FFFFFF' : C.g700 }}>{label}</span>
                        </button>
                    ))}
                  </div>
              ) : (
                  <div className="hidden md:block bg-white rounded-2xl shadow-sm border overflow-hidden" style={{ borderColor: C.g200 }}>
                    {TABS.map(({ id, icon: Icon, label, route }) => (
                        <button key={id} onClick={() => (route ? navigate(route) : setActiveTab(id))}
                                className="w-full flex items-center gap-3 px-4 py-3 text-left transition border-b last:border-0 hover:bg-gray-50"
                                style={{
                                  borderColor: C.g100,
                                  backgroundColor: activeTab === id ? `${C.green}10` : 'transparent',
                                  borderLeft: activeTab === id ? `3px solid ${C.green}` : '3px solid transparent'
                                }}>
                          <Icon size={16} style={{ color: activeTab === id ? C.green : C.g400 }} />
                          <span className="text-sm font-bold" style={{ color: activeTab === id ? C.green : C.g600 }}>{label}</span>
                        </button>
                    ))}
                  </div>
              )}
            </div>

            {/* Main content */}
            <div className="flex-1 min-w-0 space-y-5">
              {/* ── ACCOUNT ─────────────────────────────────────────── */}
              {activeTab === 'account' && (
                  <>
                    <input ref={fileRef} type="file" accept="image/*" onChange={handleAvatarUpload} style={{ display: 'none' }} />

                    {/* ── Top row: Avatar + Bio (side-by-side on desktop ≥1024px) ── */}
                    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-5">
                      {/* Avatar card */}
                      <div className="bg-white rounded-2xl shadow-sm border p-5" style={{ borderColor: C.g200 }}>
                        <div className="flex flex-col gap-3">
                          <div onClick={handleAvatarClick} className="cursor-pointer" style={{ width: 96, height: 96, borderRadius: 12, overflow: 'hidden', border: `2px solid ${C.g200}`, background: C.g100, position: 'relative', flexShrink: 0 }}>
                            {(avatarPreview || user?.avatar_url) ? (
                                <img src={avatarPreview || user?.avatar_url} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : (
                                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: `linear-gradient(135deg, ${C.gold}, #FBBF24)` }}>
                                  <span style={{ fontSize: 32, fontWeight: 900, color: C.forest }}>{user?.username?.charAt(0)?.toUpperCase() || 'U'}</span>
                                </div>
                            )}
                            {uploading && (
                                <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  <RefreshCw size={20} color="#fff" className="animate-spin" />
                                </div>
                            )}
                          </div>
                          <div>
                            <h2 className="text-sm font-bold" style={{ color: C.g800 }}>Avatar</h2>
                            <p className="text-xs mt-0.5" style={{ color: C.g500, lineHeight: 1.5 }}>
                              Upload a clear photo, preferably of yourself. Please avoid explicit or inappropriate images — they will be removed immediately.
                            </p>
                          </div>
                          <button onClick={handleAvatarClick} disabled={uploading}
                                  className="self-start flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition hover:opacity-90 disabled:opacity-50"
                                  style={{ border: `1px solid ${C.g200}`, backgroundColor: C.white, color: C.g700 }}>
                            {uploading ? <><RefreshCw size={13} className="animate-spin" /> Uploading…</> : <><Upload size={13} /> Upload image</>}
                          </button>
                        </div>
                      </div>

                      {/* Bio card */}
                      <div className="bg-white rounded-2xl shadow-sm border p-5 flex flex-col" style={{ borderColor: C.g200 }}>
                        <textarea
                            value={bioEditing ? bioDraft : (accountForm.bio || '')}
                            onChange={e => {
                              const val = e.target.value;
                              if (val.length <= 150) setBioDraft(val);
                            }}
                            readOnly={!bioEditing}
                            placeholder="Tell traders a bit about yourself…"
                            rows={3}
                            className="w-full px-4 py-3 border rounded-lg text-sm resize-none focus:outline-none focus:border-green-500 transition"
                            style={{
                              borderColor: C.g200,
                              color: bioEditing ? C.g800 : C.g500,
                              backgroundColor: C.g50,
                              cursor: bioEditing ? 'text' : 'default',
                              fontFamily: "'DM Sans',sans-serif",
                            }} />
                        <div className="flex items-center justify-between mt-2.5">
                          <p className="text-xs" style={{ color: (bioDraft || '').length >= 150 ? C.danger : C.g400 }}>Maximum 150 characters</p>
                          <div className="flex gap-2">
                            <button type="button"
                                    onClick={() => { if (bioEditing) { setBioDraft(accountForm.bio || ''); setBioEditing(false); } else { setBioDraft(accountForm.bio || ''); setBioEditing(true); } }}
                                    className="px-4 py-2 rounded-xl text-sm font-bold transition"
                                    style={{ backgroundColor: bioEditing ? '#fff' : C.green, color: bioEditing ? C.g600 : '#fff', border: bioEditing ? `1px solid ${C.g200}` : 'none' }}>
                              {bioEditing ? 'Cancel' : <><Edit3 size={13} className="inline" /> Edit</>}
                            </button>
                            <button type="button" onClick={saveBioOnly}
                                    disabled={!bioEditing || bioSaving || bioDraft === (accountForm.bio || '')}
                                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold text-white disabled:opacity-50 transition"
                                    style={{ backgroundColor: (!bioEditing || bioDraft === (accountForm.bio || '')) ? C.g200 : C.green }}>
                              {bioSaving ? <RefreshCw size={13} className="animate-spin" /> : <Save size={13} />} Save
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Mobile: one compact page flow, without section cards. */}
                    <div className="md:hidden" style={{ backgroundColor: C.white }}>
                      <section className="px-4 pt-3 pb-2">
                        {/* Name — appears automatically after verification, no edit pencil. */}
                        <MobileAccountField label="Name" value={accountForm.fullName}
                                            noPencil={true} readOnly={true}
                                            status={kycVerified ? <span className="text-xs" style={{ color: C.success }}>✓ Verified</span> : null} />
                        {/* Username locks permanently after ONE change (persisted server-side). */}
                        <MobileAccountField label="Username" value={accountForm.username}
                                            readOnly={usernameLocked} onSave={value => saveMobileAccountField('username', value)}
                                            status={usernameLocked ? <Lock size={12} style={{ color: C.g400 }} /> : null} />
                        <MobileAccountField label="E-mail" value={accountForm.email}
                                            status={emailVerified ? <span className="text-xs" style={{ color: C.success }}>✓ Verified</span> : <span className="text-xs" style={{ color: C.warn }}>Unverified</span>}
                                            onPencil={() => setEmailModalOpen(true)} />
                        {!emailVerified && emailVerifyStep === 'idle' && (
                            <button type="button" onClick={handleSendEmailCode} disabled={emailCodeLoading} className="mb-2 text-xs font-bold" style={{ color: C.paid }}>
                              {emailCodeLoading ? 'Sending code…' : 'Verify e-mail'}
                            </button>
                        )}
                        {(emailVerifyStep === 'otp' || emailVerifyStep === 'verifying') && (
                            <div className="flex gap-2 items-center pb-2">
                              <input type="text" inputMode="numeric" maxLength={6} placeholder="Verification code" value={emailCode}
                                     onChange={e => setEmailCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                     className="min-w-0 flex-1 px-3 py-2 rounded-lg text-sm focus:outline-none" style={{ border: `1px solid ${C.g200}` }} />
                              <button type="button" onClick={handleVerifyEmailCode} disabled={emailVerifyStep === 'verifying' || emailCode.length < 6} className="text-xs font-bold" style={{ color: C.green }}>
                                {emailVerifyStep === 'verifying' ? 'Verifying…' : 'Confirm'}
                              </button>
                            </div>
                        )}
                        <MobileAccountField label="Phone number" value={accountForm.phone} type="tel"
                                            status={(phoneVerified || phoneStep === 'done') && <span className="text-xs" style={{ color: C.success }}>✓ Verified</span>}
                                            onPencil={() => { setPhoneDraft(''); setCountrySearch(''); setCountryListOpen(false); setPhoneModalOpen(true); }} />
                      </section>

                      <section className="px-4 pt-2 pb-5">
                        <h2 className="text-base font-semibold" style={{ color: C.g800 }}>Account preferences</h2>
                        <div className="mt-2 mb-3" style={{ borderBottom: `1px solid ${C.g200}` }} />
                        <p className="text-sm font-normal mb-1.5" style={{ color: C.g500 }}>Name display</p>
                        <div className="space-y-1.5">
                          {(() => {
                            const full = accountForm.fullName || user?.full_name || '';
                            const parts = full.trim().split(/\s+/).filter(Boolean);
                            const initial = parts.length > 1 ? `${parts[0]} ${parts.slice(1).map(part => `${part[0]}.`).join(' ')}` : full;
                            return [
                              { val: 'initial', text: `Show first name and last name initial${initial ? ` (${initial})` : ''}` },
                              { val: 'full', text: `Show full name${full ? ` (${full})` : ''}` },
                              { val: 'hide', text: `Hide full name${accountForm.username ? ` (${accountForm.username})` : ''}` },
                            ];
                          })().map(({ val, text }) => (
                              <label key={val} className="flex items-start gap-2 cursor-pointer text-sm leading-5" style={{ color: C.g700 }}>
                                <input type="radio" name="mobileNameDisplay" value={val} checked={prefs.nameDisplay === val}
                                       disabled={nameDisplaySaving}
                                       onChange={() => { setPrefs(p => ({ ...p, nameDisplay: val })); saveNameDisplay(val); }}
                                       className="accent-green-600 flex-shrink-0" style={{ width: 18, height: 18, marginTop: 1 }} />
                                <span>{text}</span>
                              </label>
                          ))}
                        </div>
                        <div className="mt-4 space-y-3">
                          <div>
                            <label className="block text-sm font-normal mb-1" style={{ color: C.g500 }}>Preferred currency</label>
                            <select value={prefs.currency} onChange={e => updatePreference({ currency: e.target.value })} className="w-full px-3 py-2.5 rounded-xl text-sm font-bold" style={{ border: 'none', backgroundColor: '#F1F1F1', color: C.g800 }}>
                              {CURRENCIES.map(({ code, label, symbol, flag }) => <option key={code} value={code}>{flag} {label} ({symbol})</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="block text-sm font-normal mb-1" style={{ color: C.g500 }}>Language</label>
                            <select value={prefs.language} onChange={e => updatePreference({ language: e.target.value })} className="w-full px-3 py-2.5 rounded-xl text-sm font-bold" style={{ border: 'none', backgroundColor: '#F1F1F1', color: C.g800 }}>
                              {LANGUAGES.map(({ code, label, native }) => <option key={code} value={code}>{label}{native !== label ? ` — ${native}` : ''}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="block text-sm font-normal mb-1" style={{ color: C.g500 }}>Timezone</label>
                            <select value={prefs.timezone} onChange={e => updatePreference({ timezone: e.target.value })} className="w-full px-3 py-2.5 rounded-xl text-sm font-bold" style={{ border: 'none', backgroundColor: '#F1F1F1', color: C.g800 }}>
                              {Object.entries(TIMEZONE_GROUPS).map(([region, zones]) => <optgroup key={region} label={region}>{zones.map(({ tz, label }) => <option key={tz} value={tz}>{label}</option>)}</optgroup>)}
                            </select>
                          </div>
                        </div>
                        <div className="flex items-center justify-between mt-4">
                          <span className="text-sm" style={{ color: C.g700 }}>Show online</span>
                          <Toggle checked={prefs.showOnline} onChange={showOnline => updatePreference({ showOnline })} label="Show online" />
                        </div>
                      </section>
                    </div>

                    {/* Desktop account page visual treatment, matching the two-column reference. */}
                    <style>{`
                      @media (min-width: 768px) {
                        .desktop-account-grid .desktop-account-card { border-radius: 0; box-shadow: none; }
                        .desktop-account-grid .desktop-field-label {
                          font-size: 16px !important;
                          font-weight: 400 !important;
                          line-height: 22px;
                        }
                        .desktop-account-grid .desktop-field {
                          min-height: 50px;
                          background: #F1F1F1 !important;
                          border-color: transparent !important;
                          border-radius: 12px !important;
                        }
                        .desktop-account-grid .desktop-field input {
                          min-height: 50px;
                          padding: 12px 14px !important;
                          background: transparent !important;
                          border-color: transparent !important;
                          border-radius: 12px !important;
                          font-size: 16px !important;
                          font-weight: 700 !important;
                        }
                        .desktop-account-grid .desktop-field > span { font-size: 16px; font-weight: 700; }
                        .desktop-account-grid .desktop-preference-field {
                          min-height: 50px;
                          padding: 12px 14px !important;
                          border-color: transparent !important;
                          border-radius: 12px !important;
                          background: #F1F1F1 !important;
                          font-size: 16px !important;
                          font-weight: 700 !important;
                        }
                        .desktop-account-grid .desktop-name-option { font-size: 16px; line-height: 22px; }
                        .desktop-account-grid .desktop-show-online > span { font-size: 16px; }
                        .desktop-account-grid form > div > p { display: none; }
                      }
                    `}</style>

                    {/* ── Bottom row: Account info + Preferences (desktop ≥768px) ── */}
                    <div className="desktop-account-grid hidden md:grid grid-cols-1 lg:grid-cols-2 gap-7 -mt-1 pb-32">
                      {/* Account information */}
                      <div className="desktop-account-card bg-white rounded-2xl shadow-sm border p-6" style={{ borderColor: C.g200 }}>
                        <h2 className="text-[20px] font-semibold mb-0.5" style={{ color: C.g800 }}>Account information</h2>
                        <div style={{ borderBottom: `1px solid ${C.g100}`, marginBottom: 14 }} />
                        <form onSubmit={handleAccountUpdate} className="space-y-2">
                          {/* Name — appears automatically after verification, no edit pencil. */}
                          <div>
                            <label className={`${labelCls} desktop-field-label`} style={{ display: 'flex', alignItems: 'center', gap: 5, color: C.g500, marginBottom: 2 }}>
                              Name {kycVerified && <Lock size={11} style={{ color: C.g400 }} />}
                            </label>
                            <div className="desktop-field px-4 py-2.5 border rounded-lg text-sm font-medium flex items-center justify-between"
                                 style={{ borderColor: C.g200, backgroundColor: C.g50, color: accountForm.fullName ? C.g800 : C.g500 }}>
                              <span>{accountForm.fullName || '—'}</span>
                              {kycVerified && <Lock size={13} style={{ color: C.g400 }} />}
                            </div>
                            <p className="text-xs mt-1" style={{ color: C.g400 }}>Full name appears automatically after verification.</p>
                          </div>

                          {/* Username — permanently locked after ONE change (persisted flag).
                              The pencil stays visible but is non-functional: clicking does
                              nothing and the value is not editable by any means. */}
                          <div>
                            <label className={`${labelCls} desktop-field-label`} style={{ display: 'flex', alignItems: 'center', gap: 5, color: C.g500, marginBottom: 2 }}>
                              Username {usernameLocked && <Lock size={11} style={{ color: C.g400 }} />}
                            </label>
                            {usernameLocked ? (
                                <div className="desktop-field px-4 py-2.5 border rounded-lg text-sm font-medium flex items-center justify-between"
                                     style={{ borderColor: C.g200, backgroundColor: C.g50, color: C.g500 }}>
                                  {/* Plain text — NOT an input: not focusable or editable
                                      by any means (click, tab, etc.) while locked. */}
                                  <span tabIndex={-1} style={{ outline: 'none', userSelect: 'none' }}>{accountForm.username}</span>
                                  {/* Pencil remains VISIBLE but light/faded grey and has no onClick while locked. */}
                                  <span role="img" aria-label="Username is locked"
                                        className="flex-shrink-0"
                                        style={{ display: 'flex', alignItems: 'center', cursor: 'not-allowed', userSelect: 'none' }}>
                                    <Edit3 size={14} style={{ color: C.g400 }} />
                                  </span>
                                </div>
                            ) : (
                                <div className="desktop-field relative">
                                  <input type="text" value={accountForm.username}
                                         onChange={e => setAccountForm({ ...accountForm, username: e.target.value })}
                                         className={inputCls} required style={{ ...inputStyle(), paddingRight: 36 }} />
                                  <Edit3 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: C.g700 }} />
                                </div>
                            )}
                            {usernameLocked ?
                                <p className="text-xs mt-1 flex items-center gap-1" style={{ color: C.g400 }}><Lock size={9} />Username is permanently locked.</p> :
                                <p className="text-xs mt-1 flex items-center gap-1" style={{ color: '#D97706' }}><AlertTriangle size={12} className="inline-block" />You can only change your username once. Choose carefully.</p>
                            }
                          </div>

                          {/* Email Address — pencil opens the NoOnes-style change modal
                              ("E-mail" title + 24h withdrawal-lock warning). */}
                          <div>
                            <label className={`${labelCls} desktop-field-label`} style={{ display: 'flex', alignItems: 'center', gap: 6, color: C.g500, marginBottom: 2 }}>
                              E-mail
                              {emailVerified ?
                                  <span className="text-xs font-medium inline-flex items-center gap-1" style={{ color: C.success }}><CheckCircle size={12} />Verified</span> :
                                  <span className="text-xs font-black px-2 py-0.5 rounded-full inline-flex items-center gap-1" style={{ backgroundColor: '#FFF7ED', color: C.warn }}><AlertTriangle size={11} className="inline-block" />Unverified</span>}
                            </label>
                            <div className="desktop-field px-4 py-2.5 border rounded-lg text-sm font-medium flex items-center justify-between"
                                 style={{ borderColor: emailVerified ? '#DCFCE7' : '#FDE68A', backgroundColor: C.g50, color: C.g700 }}>
                              <span className="truncate">{maskEmail(accountForm.email)}</span>
                              <button type="button" onClick={() => { setEmailDraft(accountForm.email || ''); setEmailModalOpen(true); }}
                                      aria-label="Change email" className="flex-shrink-0 hover:opacity-75 transition-opacity"
                                      style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                                <Edit3 size={14} style={{ color: C.g700 }} />
                              </button>
                            </div>
                            <p className="text-xs mt-1" style={{ color: C.g400 }}>Changing your email triggers a 24-hour withdrawal lock.</p>
                            {!emailVerified && (
                                <div className="mt-2 space-y-2">
                                  {emailVerifyStep === 'idle' && (
                                      <button type="button" onClick={handleSendEmailCode} disabled={emailCodeLoading}
                                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black disabled:opacity-60"
                                              style={{ backgroundColor: C.paid, color: 'white' }}>
                                        {emailCodeLoading ? <RefreshCw size={11} className="animate-spin" /> : <Mail size={11} />}
                                        {emailCodeLoading ? 'Sending code…' : 'Verify Email →'}
                                      </button>
                                  )}
                                  {(emailVerifyStep === 'otp' || emailVerifyStep === 'verifying') && (
                                      <>
                                        <p className="text-xs" style={{ color: C.g500 }}>Code sent to your email — enter it below:</p>
                                        <div className="flex gap-2 flex-wrap items-center">
                                          <input type="text" inputMode="numeric" maxLength={6}
                                                 placeholder="000000" value={emailCode}
                                                 onChange={e => setEmailCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                                 className="px-3 py-2 border-2 rounded-xl text-sm font-black focus:outline-none w-36"
                                                 style={{ borderColor: C.paid, letterSpacing: '0.2em', color: C.g800 }} />
                                          <button type="button" onClick={handleVerifyEmailCode}
                                                  disabled={emailVerifyStep === 'verifying' || emailCode.length < 6}
                                                  className="px-3 py-2 rounded-xl text-white text-xs font-black disabled:opacity-50"
                                                  style={{ backgroundColor: C.success }}>
                                            {emailVerifyStep === 'verifying' ? 'Verifying…' : '✓ Confirm'}
                                          </button>
                                          <button type="button" onClick={() => { setEmailVerifyStep('idle'); setEmailCode(''); }}
                                                  className="text-xs underline" style={{ color: C.g400 }}>Resend</button>
                                        </div>
                                      </>
                                  )}
                                </div>
                            )}
                          </div>

                          {/* Phone Number */}
                          <div>
                            <label className={`${labelCls} desktop-field-label`} style={{ display: 'flex', alignItems: 'center', gap: 6, color: C.g500, marginBottom: 2 }}>
                              Phone Number
                              {phoneVerified || phoneStep === 'done' ?
                                  <span className="text-xs font-medium" style={{ color: C.success }}>✓ Verified</span> :
                                  accountForm.phone ?
                                      <span className="text-xs font-black px-2 py-0.5 rounded-full inline-flex items-center gap-1" style={{ backgroundColor: '#FFF7ED', color: C.warn }}><AlertTriangle size={11} className="inline-block" />Unverified</span> : null}
                            </label>
                            {/* Pencil opens the NoOnes-style change modal
                                (searchable country picker + 24h lock warning). */}
                            <div className="desktop-field px-4 py-2.5 border rounded-lg text-sm font-medium flex items-center justify-between"
                                 style={{ borderColor: '#DCFCE7', backgroundColor: C.g50, color: C.g700 }}>
                              <span>{accountForm.phone || '—'}</span>
                              <button type="button" onClick={() => { setPhoneDraft(''); setCountrySearch(''); setCountryListOpen(false); setPhoneModalOpen(true); }}
                                      aria-label="Change phone number" className="flex-shrink-0 hover:opacity-75 transition-opacity"
                                      style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                                <Edit3 size={14} style={{ color: C.g700 }} />
                              </button>
                            </div>
                            <p className="text-xs mt-1" style={{ color: C.g400 }}>Changing your phone triggers a 24-hour withdrawal lock.</p>
                          </div>


                          <button type="submit" disabled={loading}
                                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-white font-bold text-sm hover:opacity-90 disabled:opacity-50"
                                  style={{ backgroundColor: C.green }}>
                            {loading ? <><RefreshCw size={15} className="animate-spin" /> Saving…</> : <><Save size={15} /> Save Changes</>}
                          </button>
                        </form>
                      </div>

                      {/* Account preferences */}
                      <div className="desktop-account-card bg-white rounded-2xl shadow-sm border p-6" style={{ borderColor: C.g200 }}>
                        <h2 className="text-[20px] font-semibold mb-0.5" style={{ color: C.g800 }}>Account preferences</h2>
                        <div style={{ borderBottom: `1px solid ${C.g100}`, marginBottom: 14 }} />

                        {/* Name display */}
                        <div className="mb-5">
                          <p className="desktop-field-label text-xs font-semibold mb-2" style={{ color: C.g600 }}>Name display</p>
                          <div className="flex flex-col gap-0">
                            {(() => {
                              const full = accountForm.fullName || user?.full_name || '';
                              const initial = full ? full.trim().split(/\s+/).map((w, i) => i === 0 ? w : w[0] + '.').join(' ') : 'Samuel K.';
                              return [
                                { val: 'initial', label: `Show first name and last name initial`, example: full ? `${full.split(' ')[0]} ${(full.split(' ')[1] || '').charAt(0)}.` : 'Zeinudeen H.' },
                                { val: 'full', label: 'Show full name', example: full || 'Zeinudeen Hamisu' },
                                { val: 'hide', label: 'Hide full name', example: accountForm.username || user?.username || 'Iraqiy_Gh' },
                              ];
                            })().map(({ val, label, example }) => (
                                <label key={val} className="desktop-name-option flex items-start gap-2 py-1.5 cursor-pointer transition hover:bg-gray-50 -mx-1 px-1 rounded-lg leading-5">
                                  <input type="radio" name="nameDisplay" value={val} checked={prefs.nameDisplay === val}
                                         onChange={() => { setPrefs(p => ({ ...p, nameDisplay: val })); saveNameDisplay(val); }}
                                         className="accent-green-600 flex-shrink-0" style={{ width: 16, height: 16, marginTop: 2 }} />
                                  <span className="min-w-0 text-sm break-words" style={{ color: C.g800 }}>{label} <span style={{ color: C.g400 }}>({example})</span></span>
                                </label>
                            ))}
                          </div>
                        </div>

                        {/* Preferred currency */}
                        <div className="mb-5">
                          <label className={`${labelCls} desktop-field-label`} style={{ color: C.g500 }}>Preferred currency</label>
                          <div className="relative">
                            <select value={prefs.currency} onChange={e => updatePreference({ currency: e.target.value })}
                                    className={`${inputCls} desktop-preference-field`} style={{ ...inputStyle(true), appearance: 'none', paddingRight: 36 }}>
                              {CURRENCIES.map(({ code, label, symbol, flag }) => (
                                  <option key={code} value={code}>{flag} {label} ({symbol})</option>
                              ))}
                            </select>
                            <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: C.g400 }} />
                          </div>
                        </div>

                        {/* Language */}
                        <div className="mb-5">
                          <label className={`${labelCls} desktop-field-label`} style={{ color: C.g500 }}>Language</label>
                          <div className="relative">
                            <select value={prefs.language} onChange={e => updatePreference({ language: e.target.value })}
                                    className={`${inputCls} desktop-preference-field`} style={{ ...inputStyle(true), appearance: 'none', paddingRight: 36 }}>
                              {LANGUAGES.map(({ code, label, native }) => (
                                  <option key={code} value={code}>{label}{native !== label ? ` — ${native}` : ''}</option>
                              ))}
                            </select>
                            <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: C.g400 }} />
                          </div>
                        </div>

                        {/* Timezone */}
                        <div className="mb-5">
                          <label className={`${labelCls} desktop-field-label`} style={{ color: C.g500 }}>Timezone</label>
                          <div className="relative">
                            <select value={prefs.timezone} onChange={e => updatePreference({ timezone: e.target.value })}
                                    className={`${inputCls} desktop-preference-field`} style={{ ...inputStyle(true), appearance: 'none', paddingRight: 36 }}>
                              {Object.entries(TIMEZONE_GROUPS).map(([region, zones]) => (
                                  <optgroup key={region} label={region}>
                                    {zones.map(({ tz, label }) => (
                                        <option key={tz} value={tz}>{label}</option>
                                    ))}
                                  </optgroup>
                              ))}
                            </select>
                            <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: C.g400 }} />
                          </div>
                        </div>

                        <div className="desktop-show-online flex items-center justify-between pt-1">
                          <span className="text-sm" style={{ color: C.g700 }}>Show online</span>
                          <Toggle checked={prefs.showOnline} onChange={showOnline => updatePreference({ showOnline })} label="Show online" />
                        </div>
                      </div>
                    </div>
                  </>
              )}

              {/* ── VERIFICATION (NoOnes parity — stacked level cards) ── */}
              {activeTab === 'verification' && (
                  <div className="space-y-4">
                    {verificationSyncing && (
                        <div className="bg-white rounded-2xl border p-10 flex items-center justify-center gap-3" style={{ borderColor: C.g200 }}>
                          <RefreshCw size={18} className="animate-spin" style={{ color: C.green }} />
                          <span className="text-sm font-bold" style={{ color: C.g500 }}>Loading verification status…</span>
                        </div>
                    )}
                    {!verificationSyncing && (() => {
                      const underReview = !emailVerified && emailResendCount >= 3;
                      const kycPending = (kycSubmitted || kycStatus === 'pending') && !kycVerified;
                      const kycRejected = kycStatus === 'rejected' && !kycVerified;
                      // Highest fully-completed level, computed STRICTLY in sequence:
                      // level N+1 only counts when level N is complete, so out-of-order
                      // flags can never unlock a level early. Three levels, numbered 1–3:
                      // 1 Email, 2 ID verification (includes name + DOB),
                      // 3 Proof of address.
                      let completedIdx = -1;
                      if (emailVerified) completedIdx = 1;
                      if (completedIdx === 1 && kycVerified) completedIdx = 2;
                      if (completedIdx === 2 && addressVerified) completedIdx = 3;
                      // nextLevel = the currently unlocked, actionable step. The dark-green
                      // "Your current level" highlight marks it; once everything is done it
                      // rests on the final level.
                      const nextLevel = completedIdx + 1;
                      const highlightLevel = Math.min(nextLevel, 3);
                      const levelState = (n) => (n <= completedIdx ? 'verified' : n === nextLevel ? 'unlocked' : 'locked');

                      const LEVELS = [
                        {
                          n: 1,
                          title: 'Email verification',
                          subtitle: 'Activate your account by verifying your email',
                          verified: emailVerified,
                          checklist: ['Verify identity', 'Browse P2P marketplace', 'Browse gift card store'],
                        },
                        {
                          n: 2,
                          title: 'ID verification',
                          subtitle: 'Confirm your name and date of birth, then verify your ID to raise your limits and trade with more confidence and trust',
                          verified: kycVerified,
                          checklist: ['Unlimited lifetime trading and send-out limits', 'No daily limits', '100000 USD per trade limit'],
                        },
                        {
                          n: 3,
                          title: 'Proof of address verification',
                          subtitle: 'Available upon request after ID verification',
                          verified: addressVerified,
                          checklist: null,
                        },
                      ];

                      // ── Level 1 detail — email send-code / OTP flow (existing handlers).
                      const renderEmailFlow = (light) => (
                          <div className="space-y-2">
                            {underReview ? (
                                <div className="rounded-xl border overflow-hidden" style={{ borderColor: '#FDE68A' }}>
                                  <div className="px-4 py-2.5 flex items-center gap-2" style={{ backgroundColor: '#FEF3C7', borderBottom: '1px solid #FDE68A' }}>
                                    <Mail size={13} style={{ color: '#D97706', flexShrink: 0 }} />
                                    <p className="text-xs font-black" style={{ color: '#92400E' }}>Email is Under Manual Review</p>
                                  </div>
                                  <div className="px-4 py-3 space-y-2" style={{ backgroundColor: '#FFFBEB' }}>
                                    <p className="text-xs leading-relaxed" style={{ color: '#78350F' }}>
                                      We tried to send a code to <strong>{maskEmail(accountForm.email)}</strong> but couldn't confirm delivery.
                                      Our team will manually verify your email and notify you within <strong>24 hours</strong>.
                                    </p>
                                    <p className="text-xs" style={{ color: '#92400E' }}>You'll receive an update once your email is approved or rejected.</p>
                                    <a href="mailto:hello@praqen.com"
                                       className="inline-flex items-center gap-1.5 text-xs font-black mt-1"
                                       style={{ color: '#D97706' }}>
                                      <Mail size={11} /> hello@praqen.com
                                    </a>
                                  </div>
                                </div>
                            ) : (
                                <>
                                  {emailVerifyStep === 'idle' && (
                                      <button onClick={handleSendEmailCode} disabled={emailCodeLoading}
                                              className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-xs font-black disabled:opacity-60"
                                              style={{ backgroundColor: C.paid }}>
                                        <Mail size={13} />
                                        {emailCodeLoading ? 'Sending…' : 'Send Verification Code →'}
                                      </button>
                                  )}
                                  {(emailVerifyStep === 'otp' || emailVerifyStep === 'verifying') && (
                                      <>
                                        <p className="text-xs font-bold" style={{ color: light ? 'rgba(255,255,255,0.9)' : '#1e40af' }}>Code sent! Check your inbox and spam folder:</p>
                                        <div className="flex gap-2 flex-wrap items-center">
                                          <input type="text" inputMode="numeric" maxLength={6}
                                                 placeholder="000000" value={emailCode}
                                                 onChange={e => setEmailCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                                 className="px-3 py-2 border-2 rounded-xl text-sm font-black focus:outline-none w-36"
                                                 style={{ borderColor: light ? 'rgba(255,255,255,0.5)' : '#3b82f6', letterSpacing: '0.2em', color: C.g800, backgroundColor: 'white' }} />
                                          <button onClick={handleVerifyEmailCode}
                                                  disabled={emailVerifyStep === 'verifying' || emailCode.length < 6}
                                                  className="px-4 py-2 rounded-xl text-white text-xs font-black disabled:opacity-50"
                                                  style={{ backgroundColor: C.success }}>
                                            {emailVerifyStep === 'verifying' ? 'Verifying…' : '✓ Verify'}
                                          </button>
                                          <button onClick={() => { setEmailVerifyStep('idle'); setEmailCode(''); }}
                                                  className="text-xs underline"
                                                  style={{ color: light ? 'rgba(255,255,255,0.6)' : '#94a3b8' }}>Resend</button>
                                        </div>
                                      </>
                                  )}
                                </>
                            )}
                          </div>
                      );

                      // ── Level 2 (ID verification) — 2-step modal, opened ONLY by the
                      // "Verify" button. The card chevron shows ONLY the "What you can do"
                      // checklist (Zeinudeen: "The dropdown only shows 'What you can do'"),
                      // so this card renders NO inline form anymore.
                      const dobMaxDate = new Date(Date.now() - 18 * 365.25 * 24 * 3600 * 1000).toISOString().slice(0, 10);
                      const dobAgeOk = (() => {
                        if (!idForm.dob) return false;
                        const d = new Date(`${idForm.dob}T00:00:00`);
                        if (Number.isNaN(d.getTime())) return false;
                        const now = new Date();
                        let age = now.getFullYear() - d.getFullYear();
                        const m = now.getMonth() - d.getMonth();
                        if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
                        return age >= 18;
                      })();
                      const detailsValid = idForm.fullName.trim().length >= 2 && dobAgeOk
                          && idForm.country && idForm.city.trim() && idForm.postalCode.trim()
                          && idForm.address.trim() && idForm.idType && idForm.docNumber.trim();
                      const stillNeeded = [
                        !idDocs.front && 'Government ID — front',
                        !idDocs.selfie && 'Selfie holding your ID',
                      ].filter(Boolean);

                      // Camera constraints — same limits as the rest of the app
                      // (Max 10MB · JPG or PNG), enforced before preview.
                      const handleDocCapture = (slot, file) => {
                        if (file.size > 10 * 1024 * 1024) { toast.error('Photo is too large. Max 10MB · JPG or PNG'); return; }
                        if (!/^image\/(jpeg|png)$/.test(file.type)) { toast.error('Only JPG or PNG photos are accepted'); return; }
                        const preview = URL.createObjectURL(file);
                        setIdDocs(prev => {
                          if (prev[slot]) URL.revokeObjectURL(prev[slot].preview);
                          return { ...prev, [slot]: { file, preview } };
                        });
                      };
                      const handleDocClear = (slot) => {
                        setIdDocs(prev => {
                          if (prev[slot]) URL.revokeObjectURL(prev[slot].preview);
                          return { ...prev, [slot]: null };
                        });
                      };

                      const idFieldLabel = (text) => (
                          <label className="text-xs font-black block mb-1.5" style={{ color: C.g600 }}>{text}</label>
                      );
                      const idInputStyle = (filled) => ({
                        borderColor: filled ? C.success : C.g200,
                        color: C.g800,
                        backgroundColor: 'white',
                      });

                      const renderDocSection = (slot, title, desc, { optional = false, capture = 'environment' } = {}) => (
                          <div className="rounded-xl border p-4" style={{ borderColor: idDocs[slot] ? C.success : C.g200 }}>
                            <div className="flex items-start gap-2 mb-1">
                              <p className="text-xs font-black flex-1" style={{ color: C.g800 }}>{title}</p>
                              {optional && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded flex-shrink-0" style={{ backgroundColor: C.g100, color: C.g500 }}>OPTIONAL</span>}
                            </div>
                            <p className="text-xs mb-3" style={{ color: C.g500 }}>{desc}</p>
                            <DocExample kind={slot} />
                            {/* One capture component for both platforms — LiveCapture
                                uses the native capture="user"/"environment" file input
                                on mobile (camera app opens directly, no gallery) and
                                getUserMedia webcam preview with Take photo / Flip camera
                                on desktop. Same onCapture path either way. */}
                            <LiveCapture
                                label={title}
                                capture={capture}
                                captured={idDocs[slot]}
                                onCapture={f => handleDocCapture(slot, f)}
                                onClear={() => handleDocClear(slot)}
                            />
                          </div>
                      );

                      // The 2-step ID verification flow — ONE shared step body + footer,
                      // two containers: mobile → shared AccountBottomSheet (sticky header,
                      // scrollable body, safe-area footer); desktop → rendered INLINE
                      // inside the Level 2 card by renderLevelCard (no overlay). Step 1
                      // "Your details" validates locally and holds data in component
                      // state; ONE submission happens at the end of step 2 via the
                      // existing /kyc/upload endpoint.
                      const idVerifyFooter = () => (
                          <div className="flex gap-3">
                            {idVerifyStep === 'details' ? (
                                <>
                                  <button onClick={() => setIdVerifyOpen(false)} disabled={kycLoading}
                                          className="flex-1 px-4 py-2.5 rounded-xl text-xs font-black whitespace-nowrap"
                                          style={{ backgroundColor: C.g100, color: C.g600 }}>
                                    Cancel
                                  </button>
                                  <button onClick={() => setIdVerifyStep('docs')} disabled={!detailsValid || kycLoading}
                                          className="flex-1 px-4 py-2.5 rounded-xl text-xs font-black whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
                                          style={{ backgroundColor: C.green, color: '#fff' }}>
                                    Continue to documents
                                  </button>
                                </>
                            ) : (
                                <>
                                  <button onClick={() => setIdVerifyStep('details')} disabled={kycLoading}
                                          className="flex-1 px-4 py-2.5 rounded-xl text-xs font-black whitespace-nowrap"
                                          style={{ backgroundColor: C.g100, color: C.g600 }}>
                                    Back
                                  </button>
                                  <button onClick={handleIdVerifySubmit} disabled={kycLoading || stillNeeded.length > 0}
                                          className="flex-1 px-4 py-2.5 rounded-xl text-xs font-black whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
                                          style={{ backgroundColor: C.green, color: '#fff' }}>
                                    {kycLoading ? 'Submitting…' : 'Submit for review'}
                                  </button>
                                </>
                            )}
                          </div>
                      );

                      const renderIdVerifyFlowBody = ({ withFooter = true } = {}) => (
                          <>
                            {/* Step-1 heading row — visible on desktop inline mode only
                                (mobile gets the step title in the sheet header instead) */}
                            {idVerifyStep === 'details' && (
                                <div className="hidden md:flex items-center gap-2 mb-3">
                                  <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-black flex-shrink-0" style={{ backgroundColor: C.green, color: '#fff' }}>1</span>
                                  <p className="text-xs font-black" style={{ color: C.g800 }}>Your details</p>
                                  <span className="ml-auto text-[10px] font-black" style={{ color: C.g400 }}>Step 1 of 2</span>
                                </div>
                            )}
                            {idVerifyStep === 'details' ? (
                                <div className="space-y-2.5 pb-2">
                                  <p className="text-xs leading-relaxed" style={{ color: C.g500 }}>
                                    We ask for this because we hold funds on your behalf. Your documents are encrypted, seen only by our review team, and deleted once the review is done.
                                  </p>
                                  <div>
                                    {idFieldLabel('Full legal name')}
                                    <input type="text" value={idForm.fullName} placeholder="Enter your full legal name"
                                           onChange={e => setIdForm(f => ({ ...f, fullName: e.target.value }))}
                                           className="w-full px-3 py-2 border-2 rounded-xl text-sm font-semibold focus:outline-none"
                                           style={idInputStyle(idForm.fullName.trim().length >= 2)} />
                                  </div>
                                  <div>
                                    {idFieldLabel('Date of birth')}
                                    <input type="date" value={idForm.dob} max={dobMaxDate}
                                           onChange={e => setIdForm(f => ({ ...f, dob: e.target.value }))}
                                           className="w-full px-3 py-2 border-2 rounded-xl text-sm font-semibold focus:outline-none"
                                           style={idInputStyle(!!idForm.dob)} />
                                    <p className="text-xs mt-1 font-bold" style={{ color: idForm.dob && !dobAgeOk ? '#DC2626' : C.g400 }}>
                                      You must be at least 18.
                                    </p>
                                  </div>
                                  <div>
                                    {idFieldLabel('Country')}
                                    {/* Responsive picker, mirroring the flow's container
                                        split: desktop (≥ md) → SearchableCountrySelect,
                                        an inline dropdown anchored below the field with
                                        the same search + flag-list pattern and filter
                                        logic as the mobile sheet (shared data source
                                        KYC_PICKER_COUNTRIES); mobile (< md) → tappable
                                        field opening the nested searchable bottom sheet. */}
                                    {idVerifyDesktop ? (
                                        <SearchableCountrySelect
                                            value={idForm.country}
                                            onChange={name => setIdForm(f => ({ ...f, country: name }))}
                                            triggerStyle={idInputStyle(!!idForm.country)} />
                                    ) : (
                                        <button type="button" onClick={() => { setIdCountrySearch(''); setIdCountryOpen(true); }}
                                                className="w-full flex items-center justify-between px-3 py-2 border-2 rounded-xl text-sm font-semibold focus:outline-none"
                                                style={idInputStyle(!!idForm.country)}>
                                          <span style={{ color: idForm.country ? C.g800 : C.g400 }}>{idForm.country || 'Select country'}</span>
                                          <ChevronDown size={16} style={{ color: C.g400 }} />
                                        </button>
                                    )}
                                  </div>
                                  {/* Nested country picker — MOBILE ONLY (opens ON TOP of
                                      the Step 1 sheet, own portal + backdrop stack above
                                      it; X or selecting a country returns here with every
                                      field untouched). Same search + flag-list pattern as
                                      the phone code picker. Desktop uses the <select> above. */}
                                  {idCountryOpen && !idVerifyDesktop && (
                                      <AccountBottomSheet title="Country" onClose={() => setIdCountryOpen(false)}>
                                        <div className="relative mb-2">
                                          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: C.g400 }} />
                                          <input type="text" value={idCountrySearch} autoFocus
                                                 onChange={e => setIdCountrySearch(e.target.value)}
                                                 placeholder="Search"
                                                 className="w-full pl-9 pr-3 py-2 rounded-lg text-sm focus:outline-none"
                                                 style={{ border: `1px solid ${C.g200}`, color: C.g800, backgroundColor: C.white }} />
                                        </div>
                                        <div style={{ maxHeight: 280, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
                                          {KYC_PICKER_COUNTRIES
                                              .filter(c => !idCountrySearch.trim() || c.name.toLowerCase().includes(idCountrySearch.trim().toLowerCase()))
                                              .map(c => (
                                                  <button key={c.name} type="button"
                                                          onClick={() => { setIdForm(f => ({ ...f, country: c.name })); setIdCountryOpen(false); }}
                                                          className="w-full flex items-center gap-3 px-3 py-2.5 text-left transition hover:bg-gray-50"
                                                          style={{ borderBottom: `1px solid ${C.g100}` }}>
                                                    <span className="text-lg leading-none">{c.flag}</span>
                                                    <span className="flex-1 min-w-0 truncate text-sm font-semibold" style={{ color: C.g800 }}>{c.name}</span>
                                                    {idForm.country === c.name && <Check size={14} style={{ color: C.green, flexShrink: 0 }} />}
                                                  </button>
                                              ))}
                                          {KYC_PICKER_COUNTRIES.filter(c => !idCountrySearch.trim() || c.name.toLowerCase().includes(idCountrySearch.trim().toLowerCase())).length === 0 && (
                                              <p className="px-3 py-4 text-sm text-center" style={{ color: C.g400 }}>No countries found</p>
                                          )}
                                        </div>
                                      </AccountBottomSheet>
                                  )}
                                  <div>
                                    {idFieldLabel('City')}
                                    <input type="text" value={idForm.city} placeholder="Enter city"
                                           onChange={e => setIdForm(f => ({ ...f, city: e.target.value }))}
                                           className="w-full px-3 py-2 border-2 rounded-xl text-sm font-semibold focus:outline-none"
                                           style={idInputStyle(idForm.city.trim().length > 0)} />
                                  </div>
                                  <div>
                                    {idFieldLabel('Postal code')}
                                    <input type="text" value={idForm.postalCode} placeholder="Enter postal code"
                                           onChange={e => setIdForm(f => ({ ...f, postalCode: e.target.value }))}
                                           className="w-full px-3 py-2 border-2 rounded-xl text-sm font-semibold focus:outline-none"
                                           style={idInputStyle(idForm.postalCode.trim().length > 0)} />
                                  </div>
                                  <div>
                                    {idFieldLabel('Address')}
                                    <input type="text" value={idForm.address} placeholder="Enter address"
                                           onChange={e => setIdForm(f => ({ ...f, address: e.target.value }))}
                                           className="w-full px-3 py-2 border-2 rounded-xl text-sm font-semibold focus:outline-none"
                                           style={idInputStyle(idForm.address.trim().length > 0)} />
                                  </div>
                                  <div>
                                    {idFieldLabel('ID document')}
                                    {/* Responsive picker — desktop (≥ md): native <select>
                                        (inline dropdown, no modal); mobile (< md): tappable
                                        field opening the nested bottom-sheet picker. Shared
                                        data source: KYC_ID_TYPES. */}
                                    {idVerifyDesktop ? (
                                        <select value={idForm.idType}
                                                onChange={e => setIdForm(f => ({ ...f, idType: e.target.value }))}
                                                className="w-full px-3 py-2 border-2 rounded-xl text-sm font-semibold focus:outline-none"
                                                style={idInputStyle(!!idForm.idType)}>
                                          <option value="" disabled>Select document type</option>
                                          {KYC_ID_TYPES.map(t => (
                                              <option key={t.value} value={t.value}>{t.label}</option>
                                          ))}
                                        </select>
                                    ) : (
                                        <button type="button" onClick={() => setIdTypeOpen(true)}
                                                className="w-full flex items-center justify-between px-3 py-2 border-2 rounded-xl text-sm font-semibold focus:outline-none"
                                                style={idInputStyle(!!idForm.idType)}>
                                          <span style={{ color: idForm.idType ? C.g800 : C.g400 }}>
                                            {KYC_ID_TYPES.find(t => t.value === idForm.idType)?.label || 'Select document type'}
                                          </span>
                                          <ChevronDown size={16} style={{ color: C.g400 }} />
                                        </button>
                                    )}
                                  </div>
                                  {/* Nested ID-document picker — MOBILE ONLY, same shared
                                      bottom-sheet pattern as the Country picker (portal-stacked
                                      on top of Step 1; search omitted for a 2-item list).
                                      Desktop uses the <select> above. */}
                                  {idTypeOpen && !idVerifyDesktop && (
                                      <AccountBottomSheet title="ID document" onClose={() => setIdTypeOpen(false)}>
                                        <div style={{ maxHeight: 280, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
                                          {KYC_ID_TYPES.map(t => (
                                              <button key={t.value} type="button"
                                                      onClick={() => { setIdForm(f => ({ ...f, idType: t.value })); setIdTypeOpen(false); }}
                                                      className="w-full flex items-center gap-3 px-3 py-2.5 text-left transition hover:bg-gray-50"
                                                      style={{ borderBottom: `1px solid ${C.g100}` }}>
                                                <span className="flex-1 min-w-0 truncate text-sm font-semibold" style={{ color: C.g800 }}>{t.label}</span>
                                                {idForm.idType === t.value && <Check size={14} style={{ color: C.green, flexShrink: 0 }} />}
                                              </button>
                                          ))}
                                        </div>
                                      </AccountBottomSheet>
                                  )}
                                  <div>
                                    {idFieldLabel('Document number')}
                                    <input type="text" value={idForm.docNumber} placeholder="Enter document number"
                                           onChange={e => setIdForm(f => ({ ...f, docNumber: e.target.value }))}
                                           className="w-full px-3 py-2 border-2 rounded-xl text-sm font-semibold focus:outline-none"
                                           style={idInputStyle(idForm.docNumber.trim().length > 0)} />
                                  </div>
                                </div>
                            ) : (
                                <div className="space-y-2.5 pb-2">
                                  {/* Step-2 heading row — desktop inline mode only */}
                                  <div className="hidden md:flex items-center gap-2">
                                    <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-black flex-shrink-0" style={{ backgroundColor: C.green, color: '#fff' }}>2</span>
                                    <p className="text-xs font-black" style={{ color: C.g800 }}>Your documents</p>
                                    <span className="ml-auto text-[10px] font-black" style={{ color: C.g400 }}>Step 2 of 2</span>
                                  </div>
                                  <p className="text-xs leading-relaxed font-bold" style={{ color: C.g600 }}>
                                    Upload each document below. ID and selfie must be taken live from your camera.
                                  </p>
                                  <p className="text-xs leading-relaxed" style={{ color: C.g400 }}>
                                    Complete your verification data — required documents must be uploaded before review.
                                  </p>
                                  {renderDocSection('front', 'Government ID — front', 'Passport photo page, national ID or driving licence. All four corners visible.')}
                                  {renderDocSection('selfie', 'Selfie holding your ID', 'Your face and the ID in the same photo, both readable.', { capture: 'user' })}
                                  {renderDocSection('back', 'Government ID — back', 'Only if your ID has a back — passports do not.', { optional: true })}
                                  {stillNeeded.length > 0 ? (
                                      <p className="text-xs font-bold px-3 py-2.5 rounded-xl" style={{ backgroundColor: '#FFFBEB', color: '#92400E' }}>
                                        Still needed: {stillNeeded.join(', ')}.
                                      </p>
                                  ) : (
                                      <p className="text-xs font-black px-3 py-2.5 rounded-xl flex items-center gap-2" style={{ backgroundColor: C.mist, color: C.green }}>
                                        <CheckCircle size={13} className="flex-shrink-0" /> All required documents captured — ready to submit.
                                      </p>
                                  )}
                                </div>
                            )}
                            {withFooter && (
                                <div className="mt-4">
                                  {idVerifyFooter()}
                                </div>
                            )}
                          </>
                      );

                      // ── Shared detail body — used by the desktop expanded area AND the
                      // mobile "What you can do" bottom sheet. The verification flow renders
                      // ONLY on the unlocked card; verified and locked cards expand to the
                      // "What you can do" checklist only, so a locked level never exposes
                      // another level's form.
                      const renderLevelDetail = (lvl, { vertical = false, light = false, state = 'locked' } = {}) => {
                        const flow =
                            state !== 'unlocked' ? null :
                                lvl.n === 1 ? renderEmailFlow(light) :
                                    lvl.n === 2 ? null :
                                        lvl.n === 3 ? (
                                            <p className="text-xs leading-relaxed" style={{ color: light ? 'rgba(255,255,255,0.75)' : C.g600 }}>
                                              Proof of address verification unlocks after your ID is verified — contact support to request it once Level 2 is complete.
                                            </p>
                                        ) : null;
                        return (
                            <>
                              {flow}
                              {lvl.checklist && (
                                  <div className={flow ? 'mt-4 pt-4' : ''} style={flow ? { borderTop: `1px solid ${light ? 'rgba(255,255,255,0.18)' : C.g200}` } : null}>
                                    <p className="text-xs font-black mb-2.5" style={{ color: light ? 'rgba(255,255,255,0.85)' : C.g600 }}>What you can do:</p>
                                    <VerifChecklist items={lvl.checklist} vertical={vertical} light={light} />
                                  </div>
                              )}
                            </>
                        );
                      };

                      // ── One level card — three states (NoOnes progression model):
                      //   verified → grey non-clickable "✓ Verified" pill, muted card
                      //   unlocked → white clickable "Verify" button + dark-green
                      //              "Your current level" highlight
                      //   locked   → greyed-out disabled "Verify" button, muted card
                      // The chevron expands details in every state (the checklist is
                      // always available; the verification flow renders only when
                      // unlocked, so a locked level never shows another level's form).
                      const renderLevelCard = (lvl) => {
                        const state = levelState(lvl.n);
                        const isHighlight = lvl.n === highlightLevel;
                        const expanded = !!expandedLevels[lvl.n];
                        const isL1 = lvl.n === 2; // the ID verification card (levels now number 1–3)
                        const titleColor = isHighlight ? '#FFFFFF' : C.forest;
                        const subColor = isHighlight ? 'rgba(255,255,255,0.72)' : C.g600;
                        // "Verify" is the ONLY trigger for the verification process —
                        // for Level 2 it opens the 2-step modal (never inline, never via
                        // the chevron). Locked levels render it disabled, no onClick.
                        const verifyBtn = (mobile) => (
                            <button type="button"
                                    onClick={mobile
                                        ? (e) => { e.stopPropagation(); if (state === 'unlocked') { if (isL1) openIdVerify(); else setVerifFlowLevel(lvl.n); } }
                                        : (state === 'unlocked' ? (isL1 ? openIdVerify : () => toggleLevel(lvl.n)) : undefined)}
                                    disabled={state !== 'unlocked'}
                                    aria-disabled={state !== 'unlocked'}
                                    aria-label={isL1 && kycPending
                                        ? 'ID verification pending review'
                                        : `Verify Level ${lvl.n}${state === 'locked' ? ' — locked until the previous level is complete' : ''}`}
                                    className={`flex-shrink-0 px-4 py-1.5 rounded-lg text-xs font-black transition ${state === 'locked' ? 'cursor-not-allowed' : 'cursor-pointer hover:opacity-90'}`}
                                    style={state === 'unlocked'
                                        ? { backgroundColor: C.white, color: C.g800, border: 'none' }
                                        : { backgroundColor: C.white, color: C.g400, border: `1px solid ${C.g200}`, opacity: 0.6 }}>
                              Verify
                            </button>
                        );
                        // Status control shown top-right of each card: verified pill,
                        // pending/rejected review pills (Level 2), or the Verify button.
                        const statusControl = (mobile) => {
                          if (state === 'verified') return <VerifStatusPill verified />;
                          if (isL1 && kycPending) return (
                              <span className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black animate-pulse"
                                    style={{ backgroundColor: '#FEF3C7', color: '#92400E', cursor: 'default' }}>
                                <Clock size={12} /> Pending review
                              </span>
                          );
                          if (isL1 && kycRejected) return (
                              <span className="flex-shrink-0 inline-flex items-center gap-2">
                                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black"
                                      style={{ backgroundColor: '#FEE2E2', color: '#991B1B', cursor: 'default' }}>
                                  <X size={12} /> Rejected
                                </span>
                                {verifyBtn(mobile)}
                              </span>
                          );
                          return verifyBtn(mobile);
                        };
                        return (
                            <div key={lvl.n} className="rounded-2xl overflow-hidden" style={{ backgroundColor: isHighlight ? C.forest : '#E7F5EE' }}>
                              {/* Mobile card: title + › row, subtitle below, status control below that.
                                  Tapping the card opens its "What you can do" sheet (checklist only —
                                  the Level 2 flow opens via its Verify button, as a 2-step modal). */}
                              <div className="md:hidden cursor-pointer" role="button" tabIndex={0}
                                   onClick={() => setVerifSheetLevel(lvl.n)}
                                   onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setVerifSheetLevel(lvl.n); }}>
                                <div className="flex items-center gap-3 px-4 pt-4">
                                  <p className="flex-1 min-w-0 font-black text-sm" style={{ color: titleColor }}>
                                    Level {lvl.n} <span style={{ opacity: 0.5, fontWeight: 700 }}>|</span> {lvl.title}
                                  </p>
                                  <span className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center"
                                        style={{ backgroundColor: isHighlight ? 'rgba(255,255,255,0.14)' : C.white, border: isHighlight ? 'none' : `1px solid ${C.g200}`, color: isHighlight ? '#fff' : C.g500 }}>
                                    <ChevronRight size={15} />
                                  </span>
                                </div>
                                <p className="px-4 pt-1.5 text-xs leading-relaxed" style={{ color: subColor }}>{lvl.subtitle}</p>
                                {isL1 && kycRejected && (
                                    <p className="px-4 pt-1.5 text-xs font-bold" style={{ color: '#B91C1C' }}>
                                      Previous submission was rejected{kycRejectedReason ? ` — ${kycRejectedReason}` : ''}. Tap Verify to re-submit.
                                    </p>
                                )}
                                <div className="px-4 pt-2.5 pb-4">
                                  {statusControl(true)}
                                </div>
                              </div>

                              {/* Desktop card: title row with status control + chevron on the right, subtitle under the title */}
                              <div className="hidden md:block px-5 pt-5" style={{ paddingBottom: expanded ? 0 : 20 }}>
                                <div className="flex items-start gap-3">
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <p className="font-black text-sm" style={{ color: titleColor }}>
                                        Level {lvl.n} <span style={{ opacity: 0.5, fontWeight: 700 }}>|</span> {lvl.title}
                                      </p>
                                      {isHighlight && (
                                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black" style={{ backgroundColor: C.gold, color: C.forest }}>
                                            Your current level
                                          </span>
                                      )}
                                    </div>
                                    <p className="text-xs mt-1 leading-relaxed" style={{ color: subColor }}>{lvl.subtitle}</p>
                                    {isL1 && kycRejected && (
                                        <p className="text-xs mt-1 font-bold" style={{ color: '#B91C1C' }}>
                                          Previous submission was rejected{kycRejectedReason ? ` — ${kycRejectedReason}` : ''}. Click Verify to re-submit.
                                        </p>
                                    )}
                                  </div>
                                  {statusControl(false)}
                                  <button type="button" onClick={() => toggleLevel(lvl.n)} aria-expanded={expanded}
                                          aria-label={`${expanded ? 'Collapse' : 'Expand'} Level ${lvl.n} details`}
                                          className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:opacity-80"
                                          style={{ backgroundColor: isHighlight ? 'rgba(255,255,255,0.14)' : C.white, border: isHighlight ? 'none' : `1px solid ${C.g200}`, color: isHighlight ? '#fff' : C.g500 }}>
                                    <ChevronDown size={15} style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                                  </button>
                                </div>
                                {expanded && (
                                    <div className="pt-4 pb-5">
                                      {renderLevelDetail(lvl, { light: isHighlight, state })}
                                    </div>
                                )}
                                {/* Level 2 desktop: "Verify" expands the 2-step flow INLINE
                                    inside the card (no overlay) — same shared step body as
                                    the mobile sheet, different container only. The body was
                                    designed as a light panel (mobile sheet is white), so it
                                    renders inside its own white inner card nested in the
                                    dark-green Level 2 card — dark text/labels stay readable
                                    and both breakpoints share one visual language. */}
                                {isL1 && state === 'unlocked' && idVerifyOpen && (
                                    <div className="pt-4 pb-5">
                                      <div className="bg-white rounded-2xl p-5" style={{ border: `1px solid ${C.g200}` }}>
                                        {renderIdVerifyFlowBody()}
                                      </div>
                                    </div>
                                )}
                              </div>
                            </div>
                        );
                      };

                      return (
                          <>
                            <div className="space-y-3">
                              {LEVELS.map(renderLevelCard)}
                            </div>

                            {/* ── Mobile "What you can do" bottom sheet — checklist ONLY.
                                No level title/subtitle/duplicate label here: that info
                                lives on the card behind the sheet (NoOnes reference).
                                Reuses the shared AccountBottomSheet (sticky header +
                                close, scrollable body, safe-area padding). ── */}
                            {verifSheetLevel !== null && (() => {
                              const sheetLvl = LEVELS.find(l => l.n === verifSheetLevel) || LEVELS[0];
                              return (
                                  <AccountBottomSheet title="What you can do" onClose={() => setVerifSheetLevel(null)}>
                                    <div className="pt-1 pb-3">
                                      {sheetLvl.checklist
                                          ? <VerifChecklist items={sheetLvl.checklist} vertical />
                                          : <p className="text-sm" style={{ color: C.g500 }}>No checklist for this level.</p>}
                                    </div>
                                  </AccountBottomSheet>
                              );
                            })()}

                            {/* ── Mobile verification FLOW sheet (unlocked non-ID-verification
                                levels — i.e. the Level 1 email code/OTP) — opened ONLY
                                by the card's Verify button, never by the checklist. ── */}
                            {verifFlowLevel !== null && (() => {
                              const flowLvl = LEVELS.find(l => l.n === verifFlowLevel) || LEVELS[0];
                              return (
                                  <AccountBottomSheet
                                      title={flowLvl.n === 1 ? 'Verify your email' : `Verify Level ${flowLvl.n}`}
                                      onClose={() => setVerifFlowLevel(null)}>
                                    <div className="pt-1 pb-3">
                                      {flowLvl.n === 1 ? renderEmailFlow(false) : null}
                                    </div>
                                  </AccountBottomSheet>
                              );
                            })()}

                            {/* ── Level 2 ID verification flow — MOBILE container only
                                (shared bottom sheet). On desktop the SAME flow body renders
                                INLINE inside the Level 2 card (see renderLevelCard) —
                                opened ONLY by the card's Verify button either way. ── */}
                            {idVerifyOpen && !idVerifyDesktop && (
                                <AccountBottomSheet
                                    title={`ID verification — step ${idVerifyStep === 'details' ? '1' : '2'} of 2: ${idVerifyStep === 'details' ? 'your details' : 'your documents'}`}
                                    onClose={() => setIdVerifyOpen(false)}
                                    footer={idVerifyFooter()}>
                                  {renderIdVerifyFlowBody({ withFooter: false })}
                                </AccountBottomSheet>
                            )}
                          </>
                      );
                    })()}
                  </div>
              )}

              {/* ── SECURITY (NoOnes parity redesign) ───────────────────────────────── */}
              {activeTab === 'security' && (
                  <div className="space-y-5">

                    {/* Security section. Mobile: one white wrapper card with the
                        shared "Security" heading (NoOnes mobile parity). Desktop
                        ≥1024px: NoOnes desktop layout — separate light-gray
                        rounded cards with page-background gaps between them; the
                        shared heading is hidden because each card carries its own
                        title. */}
                    <div className="bg-white rounded-2xl shadow-sm border p-5 md:p-6 lg:bg-transparent lg:rounded-none lg:border-0 lg:shadow-none lg:p-0">
                      <h2 className="text-base font-black mb-1 lg:hidden" style={{ color: C.g800 }}>Security</h2>
                      <p className="text-xs mb-4 lg:hidden" style={{ color: C.g500 }}>Keep your account secure</p>

                      {/* Card 1 — "Change password". Mobile: sub-section inside
                          the wrapper; desktop ≥1024px: its own light-gray card. */}
                      <div className="lg:bg-[#F1F5F9] lg:rounded-xl lg:p-6 lg:mb-5">
                        <div className="lg:flex lg:items-center lg:justify-between lg:gap-6">
                          <div className="lg:min-w-0">
                            <h3 className="text-base font-black mb-1 lg:text-lg lg:font-bold" style={{ color: C.g800 }}>{isDesktop ? 'Change password' : 'Password'}</h3>
                            <p className="text-xs mb-4 lg:mb-0 lg:text-sm" style={{ color: C.g500 }}>This action will log you out of all currently active sessions</p>
                          </div>
                          <button onClick={() => { setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' }); setPasswordSuccess(false); setSecSheet('password'); }}
                                  className={isDesktop
                                    ? 'px-5 py-2.5 rounded-lg border text-sm font-medium transition-colors hover:bg-[#F8FAFC] flex-shrink-0'
                                    : 'w-full py-2.5 rounded-xl text-white text-sm font-bold transition hover:opacity-90'}
                                  style={isDesktop
                                    ? { borderColor: C.g200, color: C.g700, backgroundColor: '#FFFFFF' }
                                    : { backgroundColor: C.green }}>
                            Change
                          </button>
                        </div>
                      </div>

                      {/* Internal divider — mobile wrapper only; desktop splits
                          into separate cards with page-background gaps instead */}
                      <div className="border-t my-5 lg:hidden" style={{ borderColor: C.g200 }} />

                      {/* Card 2 — 2FA settings (both method rows live in this one
                          card, separated by a divider, on mobile AND desktop) */}
                      <div className="lg:bg-[#F1F5F9] lg:rounded-xl lg:p-6">
                        <h3 className="text-base font-black mb-1 lg:text-lg lg:font-bold" style={{ color: C.g800 }}>2FA settings</h3>
                        <p className="text-xs mb-4 lg:text-sm" style={{ color: C.g500 }}>Set up 2FA to make your account more secure</p>
                        <div className="border-t pt-4 lg:border-t-0 lg:pt-0" style={{ borderColor: C.g200 }}>

                          {/* Option A — Google Authenticator or Authy.
                              Mobile: button full-width BELOW title + description.
                              Desktop ≥1024px: horizontal row — title (+ Activated
                              badge) and description left, compact outlined
                              rounded-rect button (Manage/Enable) right, centered. */}
                          <div className="lg:flex lg:items-center lg:justify-between lg:gap-6">
                            <div className="lg:min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="text-sm font-bold" style={{ color: C.g800 }}>Google Authenticator or Authy (recommended)</p>
                                {twoFAEnabled && twoFAMethod === 'totp' && <SecActivatedBadge />}
                              </div>
                              <p className="text-xs mt-1" style={{ color: C.g500 }}>The app generates a temporary passcode that's valid for a limited time</p>
                            </div>
                            {twoFAEnabled && twoFAMethod === 'totp' ? (
                              <button onClick={startTotpManage}
                                      className={isDesktop
                                        ? 'px-5 py-2.5 rounded-lg border text-sm font-medium transition-colors hover:bg-[#F8FAFC] flex-shrink-0'
                                        : 'w-full mt-3 py-2.5 rounded-xl text-white text-sm font-bold transition hover:opacity-90'}
                                      style={isDesktop
                                        ? { borderColor: C.g200, color: C.g700, backgroundColor: '#FFFFFF' }
                                        : { backgroundColor: C.green }}>
                                Manage
                              </button>
                            ) : (
                              <button onClick={startTotpSetup} disabled={twoFASending}
                                      className={isDesktop
                                        ? 'px-5 py-2.5 rounded-lg border text-sm font-medium transition-colors hover:bg-[#F8FAFC] flex-shrink-0 disabled:opacity-50'
                                        : 'w-full mt-3 py-2.5 rounded-xl text-white text-sm font-bold transition hover:opacity-90 disabled:opacity-50'}
                                      style={isDesktop
                                        ? { borderColor: C.g200, color: C.g700, backgroundColor: '#FFFFFF' }
                                        : { backgroundColor: C.green }}>
                                {twoFASending ? 'Sending…' : 'Enable'}
                              </button>
                            )}
                          </div>

                          <div className="border-t my-4" style={{ borderColor: C.g200 }} />

                          {/* Option B — Email. Same responsive row pattern as
                              Option A: stacked on mobile, horizontal row with a
                              compact outlined pill on desktop. */}
                          <div className="lg:flex lg:items-center lg:justify-between lg:gap-6">
                            <div className="lg:min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="text-sm font-bold" style={{ color: C.g800 }}>Email</p>
                                {twoFAEnabled && twoFAMethod === 'email' && <SecActivatedBadge />}
                              </div>
                              <p className="text-xs mt-1" style={{ color: C.g500 }}>Receive temporary passcodes by email, valid for a limited time</p>
                            </div>
                            {twoFAEnabled && twoFAMethod === 'email' ? (
                              <button onClick={startEmailManage}
                                      className={isDesktop
                                        ? 'px-5 py-2.5 rounded-lg border text-sm font-medium transition-colors hover:bg-[#F8FAFC] flex-shrink-0'
                                        : 'w-full mt-3 py-2.5 rounded-xl text-white text-sm font-bold transition hover:opacity-90'}
                                      style={isDesktop
                                        ? { borderColor: C.g200, color: C.g700, backgroundColor: '#FFFFFF' }
                                        : { backgroundColor: C.green }}>
                                Manage
                              </button>
                            ) : (
                              <button onClick={startEmailSetup} disabled={twoFASending || !emailVerified}
                                      className={isDesktop
                                        ? 'px-5 py-2.5 rounded-lg border text-sm font-medium transition-colors hover:bg-[#F8FAFC] flex-shrink-0 disabled:opacity-50'
                                        : 'w-full mt-3 py-2.5 rounded-xl text-white text-sm font-bold transition hover:opacity-90 disabled:opacity-50'}
                                      style={isDesktop
                                        ? { borderColor: C.g200, color: C.g700, backgroundColor: '#FFFFFF' }
                                        : { backgroundColor: C.green }}>
                                {twoFASending ? 'Sending…' : 'Enable'}
                              </button>
                            )}
                          </div>

                          {/* Disable flow for the ACTIVE method (password-confirmed) */}
                          {showDisable2FA && (
                            <div className="mt-4 p-3 rounded-xl border" style={{ borderColor: C.g100, backgroundColor: C.g50 }}>
                              <label className={labelCls}>Current password</label>
                              <input type="password" value={twoFADisablePw}
                                     onChange={e => setTwoFADisablePw(e.target.value)}
                                     placeholder="Enter your password to confirm"
                                     className={inputCls} style={inputStyle(twoFADisablePw)} />
                              <div className="flex gap-2 mt-2">
                                <button onClick={() => { setShowDisable2FA(false); setTwoFADisablePw(''); }}
                                        className="flex-1 py-2 rounded-lg border font-semibold text-xs transition hover:bg-gray-50"
                                        style={{ borderColor: C.g200, color: C.g600 }}>
                                  Cancel
                                </button>
                                <button onClick={handleSecDisable2FA} disabled={twoFADisabling || !twoFADisablePw}
                                        className="flex-1 py-2 rounded-lg text-white font-bold text-xs transition hover:opacity-90 disabled:opacity-50"
                                        style={{ backgroundColor: C.danger }}>
                                  {twoFADisabling ? 'Disabling…' : 'Disable 2FA'}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Card 3 — Close account. Light-gray card on desktop. */}
                    <div className="bg-white rounded-2xl shadow-sm border p-5 md:p-6 lg:bg-[#F1F5F9] lg:rounded-xl lg:border-0 lg:shadow-none" style={{ borderColor: C.g200 }}>
                      <div className="lg:flex lg:items-center lg:justify-between lg:gap-6">
                        <div className="lg:min-w-0">
                          <h2 className="text-base font-black mb-1 lg:text-lg lg:font-bold" style={{ color: C.g800 }}>Close account</h2>
                          <p className="text-xs mb-4 lg:mb-0 lg:text-sm lg:leading-relaxed" style={{ color: C.g500 }}>
                            Closing your account will delete all your information on PraQen, including past trades, transactions, and more. Once you submit the request, you'll receive a confirmation link via email, and a moderator will process your request
                          </p>
                        </div>
                        {/* Desktop action button (mobile keeps its position below) */}
                        {isDesktop && (
                          <button onClick={openCloseAccount}
                                  className="px-5 py-2.5 rounded-lg text-white text-sm font-medium transition hover:opacity-90 flex-shrink-0"
                                  style={{ backgroundColor: C.danger }}>
                            Close
                          </button>
                        )}
                      </div>
                      <div className="border-t pt-4" style={{ borderColor: C.g200 }}>
                        <p className="text-sm font-bold" style={{ color: C.g800 }}>Account</p>
                        <p className="text-xs mt-0.5 mb-3" style={{ color: C.g500 }}>Closing your account is permanent and cannot be undone</p>
                        {!isDesktop && (
                          <button onClick={openCloseAccount}
                                  className="w-full py-2.5 rounded-xl text-white font-bold text-sm transition hover:opacity-90"
                                  style={{ backgroundColor: C.danger }}>
                            Close
                          </button>
                        )}
                      </div>
                    </div>

                  </div>
              )}

              {/* DEPRECATED legacy Account Security info card — replaced by the NoOnes-parity cards above */}
              {false && activeTab === 'security' && (<div>
                    <div className="bg-white rounded-2xl shadow-sm border p-5 md:p-6" style={{ borderColor: C.g200 }}>
                      <h2 className="text-lg font-black mb-4" style={{ color: C.forest }}>Account Security (legacy)</h2>
                      <div className="space-y-2">
                        <div className="flex items-center gap-3 p-2.5 md:p-3 rounded-xl" style={{ backgroundColor: C.g50 }}>
                          <Globe size={16} style={{ color: C.forest, flexShrink: 0 }} />
                          <div className="min-w-0">
                            <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: C.g500 }}>Registered Country</p>
                            {secInfo.loading ? (
                                <div className="h-4 w-28 rounded animate-pulse mt-1" style={{ backgroundColor: C.g200 }} />
                            ) : (
                                <p className="text-sm font-black" style={{ color: C.g800 }}>
                                  {secInfo.flag} {secInfo.country || user?.country || '—'}
                                  {secInfo.city ? <span className="font-normal text-xs ml-1.5" style={{ color: C.g500 }}>{secInfo.city}</span> : null}
                                </p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-3 p-2.5 md:p-3 rounded-xl" style={{ backgroundColor: C.g50 }}>
                          <Shield size={16} style={{ color: C.forest, flexShrink: 0 }} />
                          <div className="min-w-0">
                            <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: C.g500 }}>IP Address</p>
                            {secInfo.loading ? (
                                <div className="h-4 w-32 rounded animate-pulse mt-1" style={{ backgroundColor: C.g200 }} />
                            ) : (
                                <p className="text-sm font-black font-mono" style={{ color: C.g800 }}>{secInfo.ip || '—'}</p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-3 p-2.5 md:p-3 rounded-xl" style={{ backgroundColor: C.g50 }}>
                          <Clock size={16} style={{ color: C.forest, flexShrink: 0 }} />
                          <div className="min-w-0">
                            <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: C.g500 }}>Last Active</p>
                            <p className="text-sm font-black flex items-center gap-1.5" style={{ color: C.success }}>
                          <span className="relative flex h-2.5 w-2.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
                          </span>
                              Online now
                            </p>
                          </div>
                        </div>

                        {user?.last_login && (
                            <div className="flex items-center gap-3 p-2.5 md:p-3 rounded-xl" style={{ backgroundColor: C.g50 }}>
                              <LogOut size={16} style={{ color: C.forest, flexShrink: 0 }} />
                              <div className="min-w-0">
                                <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: C.g500 }}>Last Login</p>
                                <p className="text-sm font-black" style={{ color: C.g800 }}>
                                  {new Date(user.last_login).toLocaleDateString('en-US', {
                                    year: 'numeric', month: 'short', day: 'numeric',
                                    hour: '2-digit', minute: '2-digit'
                                  })}
                                </p>
                              </div>
                            </div>
                        )}

                        <div className="flex items-center gap-3 p-2.5 md:p-3 rounded-xl" style={{ backgroundColor: C.g50 }}>
                          <Smartphone size={16} style={{ color: C.forest, flexShrink: 0 }} />
                          <div className="min-w-0">
                            <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: C.g500 }}>Device Access</p>
                            <p className="text-sm font-black" style={{ color: C.g800 }}>{secInfo.device}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 p-2.5 md:p-3 rounded-xl" style={{ backgroundColor: C.g50 }}>
                          <Languages size={16} style={{ color: C.forest, flexShrink: 0 }} />
                          <div className="min-w-0">
                            <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: C.g500 }}>Language</p>
                            <p className="text-sm font-black" style={{ color: C.g800 }}>{secInfo.language}</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="bg-white rounded-2xl shadow-sm border p-6" style={{ borderColor: C.g200 }}>
                      <h2 className="text-lg font-black mb-5" style={{ color: C.forest }}>Change Password (legacy)</h2>
                      {passwordSuccess && (
                          <div className="mb-5 flex items-center gap-2.5 p-3 rounded-xl border" style={{ backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' }}>
                            <CheckCircle size={18} style={{ color: C.success, flexShrink: 0 }} />
                            <div>
                              <p className="text-sm font-black" style={{ color: '#065F46' }}>Password changed successfully!</p>
                              <p className="text-xs mt-0.5" style={{ color: '#059669' }}>Your password has been updated. Use your new password next time you log in.</p>
                            </div>
                          </div>
                      )}

                      <form onSubmit={handlePasswordChange} className="space-y-4">
                        {[
                          { key: 'currentPassword', label: 'Current Password', show: showPw.current, toggle: () => setShowPw({ ...showPw, current: !showPw.current }) },
                          { key: 'newPassword', label: 'New Password', show: showPw.new, toggle: () => setShowPw({ ...showPw, new: !showPw.new }) },
                          { key: 'confirmPassword', label: 'Confirm New Password', show: showPw.confirm, toggle: () => setShowPw({ ...showPw, confirm: !showPw.confirm }) },
                        ].map(({ key, label, show, toggle }) => (
                            <div key={key}>
                              <label className={labelCls}>{label}</label>
                              <div className="relative">
                                <input type={show ? 'text' : 'password'} value={passwordForm[key]}
                                       onChange={e => setPasswordForm({ ...passwordForm, [key]: e.target.value })}
                                       className={`${inputCls} pr-10 ${passwordErrors[key] ? 'border-red-400' : ''}`}
                                       style={passwordErrors[key] ? { borderColor: C.danger, color: C.g800 } : inputStyle(passwordForm[key])}
                                       required />
                                <button type="button" onClick={toggle} className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600 transition">
                                  {show ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                              </div>
                              {passwordErrors[key] && (
                                  <p className="flex items-center gap-1 text-xs font-bold mt-1" style={{ color: C.danger }}>
                                    <AlertCircle size={11} />
                                    {passwordErrors[key]}
                                  </p>
                              )}
                            </div>
                        ))}
                        {passwordForm.newPassword && !passwordSuccess && (
                            <div>
                              <p className="text-xs text-gray-500 mb-1">Password strength</p>
                              <div className="flex gap-1">
                                {[1, 2, 3, 4].map((i) => {
                                  const len = passwordForm.newPassword.length;
                                  const hasUpper = /[A-Z]/.test(passwordForm.newPassword);
                                  const hasNum = /\d/.test(passwordForm.newPassword);
                                  const hasSpec = /[^a-zA-Z0-9]/.test(passwordForm.newPassword);
                                  let metCount = 0;
                                  if (len >= 8) metCount++;
                                  if (hasUpper) metCount++;
                                  if (hasNum) metCount++;
                                  if (hasSpec) metCount++;
                                  const color = metCount <= 1 ? C.danger : metCount === 2 ? C.warn : C.success;
                                  return <div key={i} className="h-1.5 flex-1 rounded-full" style={{ backgroundColor: i <= metCount ? color : C.g200 }} />;
                                })}
                              </div>
                              <p className="text-xs font-bold mt-1" style={{ color: (() => {
                                  const len = passwordForm.newPassword.length;
                                  const hasUpper = /[A-Z]/.test(passwordForm.newPassword);
                                  const hasNum = /\d/.test(passwordForm.newPassword);
                                  const hasSpec = /[^a-zA-Z0-9]/.test(passwordForm.newPassword);
                                  let m = 0;
                                  if (len >= 8) m++;
                                  if (hasUpper) m++;
                                  if (hasNum) m++;
                                  if (hasSpec) m++;
                                  return m <= 1 ? C.danger : m === 2 ? C.warn : C.success;
                                })() }}>
                                {(() => {
                                  const len = passwordForm.newPassword.length;
                                  const hasUpper = /[A-Z]/.test(passwordForm.newPassword);
                                  const hasNum = /\d/.test(passwordForm.newPassword);
                                  const hasSpec = /[^a-zA-Z0-9]/.test(passwordForm.newPassword);
                                  let m = 0;
                                  if (len >= 8) m++;
                                  if (hasUpper) m++;
                                  if (hasNum) m++;
                                  if (hasSpec) m++;
                                  return m <= 1 ? 'Weak' : m === 2 ? 'Medium' : 'Strong';
                                })()}
                              </p>
                            </div>
                        )}
                        <button type="submit" disabled={loading}
                                className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-white font-bold text-sm hover:opacity-90 disabled:opacity-50 transition-all"
                                style={{ backgroundColor: C.green }}>
                          {loading ? <><RefreshCw size={15} className="animate-spin" /> Updating…</> : <><Lock size={15} /> Update Password</>}
                        </button>
                      </form>
                    </div>

                    {/* DEPRECATED legacy security block — replaced by the NoOnes-parity cards + bottom sheets above */}
                    {false && (<div className="bg-white rounded-2xl shadow-sm border p-6" style={{ borderColor: C.g200 }}>
                      <h2 className="text-lg font-black mb-4" style={{ color: C.forest }}>Account Actions</h2>
                      <div className="space-y-3">
                        <div className="rounded-xl border p-3" style={{ borderColor: C.g100 }}>
                          {twoFAEnabled ? (
                              <>
                                <div className="flex items-center justify-between">
                                  <div className="flex items-start gap-3">
                                    <Shield size={18} style={{ color: C.success, flexShrink: 0, marginTop: 2 }} />
                                    <div>
                                      <p className="text-sm font-bold" style={{ color: C.g800 }}>Two-Factor Authentication</p>
                                      <p className="text-xs mt-0.5" style={{ color: C.success }}>Enabled via email — your account is protected</p>
                                    </div>
                                  </div>
                                  {!showDisable2FA && (
                                      <button onClick={() => setShowDisable2FA(true)}
                                              className="text-xs font-bold px-3 py-1.5 rounded-lg transition hover:bg-red-50"
                                              style={{ color: C.danger }}>
                                        Disable
                                      </button>
                                  )}
                                </div>
                                {showDisable2FA && (
                                    <div className="mt-3 pt-3 border-t" style={{ borderColor: C.g100 }}>
                                      <label className={labelCls}>Current Password</label>
                                      <input type="password" value={twoFADisablePw}
                                             onChange={e => setTwoFADisablePw(e.target.value)}
                                             placeholder="Enter your password to confirm"
                                             className={inputCls} style={inputStyle(twoFADisablePw)} />
                                      <div className="flex gap-2 mt-2">
                                        <button onClick={() => { setShowDisable2FA(false); setTwoFADisablePw(''); }}
                                                className="flex-1 py-2 rounded-lg border font-semibold text-xs transition hover:bg-gray-50"
                                                style={{ borderColor: C.g200, color: C.g600 }}>
                                          Cancel
                                        </button>
                                        <button onClick={handleDisable2FA} disabled={twoFADisabling || !twoFADisablePw}
                                                className="flex-1 py-2 rounded-lg text-white font-bold text-xs transition hover:opacity-90 disabled:opacity-50"
                                                style={{ backgroundColor: C.danger }}>
                                          {twoFADisabling ? 'Disabling…' : 'Disable 2FA'}
                                        </button>
                                      </div>
                                    </div>
                                )}
                              </>
                          ) : twoFAStep === 'idle' ? (
                              <div className="flex items-center justify-between">
                                <div className="flex items-start gap-3">
                                  <Shield size={18} style={{ color: C.g400, flexShrink: 0, marginTop: 2 }} />
                                  <div>
                                    <p className="text-sm font-bold" style={{ color: C.g800 }}>Two-Factor Authentication</p>
                                    <p className="text-xs mt-0.5" style={{ color: C.g500 }}>
                                      {emailVerified ? 'Add extra security to your account' : 'Verify your email first, then enable 2FA'}
                                    </p>
                                  </div>
                                </div>
                                <button onClick={handleEnable2FA} disabled={twoFASending || !emailVerified}
                                        className="text-xs font-bold px-3 py-1.5 rounded-lg transition hover:opacity-80 disabled:opacity-50"
                                        style={{ backgroundColor: C.green, color: '#fff' }}>
                                  {twoFASending ? 'Sending…' : 'Enable'}
                                </button>
                              </div>
                          ) : (
                              <div>
                                <div className="flex items-start gap-3 mb-3">
                                  <Shield size={18} style={{ color: C.g400, flexShrink: 0, marginTop: 2 }} />
                                  <div>
                                    <p className="text-sm font-bold" style={{ color: C.g800 }}>Enter the code we emailed you</p>
                                    <p className="text-xs mt-0.5" style={{ color: C.g500 }}>Sent to {user?.email} — expires in 5 minutes</p>
                                  </div>
                                </div>
                                <input type="text" inputMode="numeric" value={twoFACode}
                                       onChange={e => setTwoFACode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                       placeholder="000000" maxLength={6}
                                       className="w-full text-center text-2xl font-mono tracking-widest border-2 rounded-xl py-2.5 mb-2 outline-none transition"
                                       style={{ borderColor: twoFACode.length === 6 ? C.green : C.g200, color: C.g800 }} />
                                <p className="text-xs text-center mb-2" style={{ color: C.g400 }}>
                                  Didn't get it?{' '}
                                  <button onClick={handleEnable2FA} disabled={twoFASending} className="font-semibold underline" style={{ color: C.green }}>
                                    {twoFASending ? 'Sending…' : 'Resend code'}
                                  </button>
                                </p>
                                <div className="flex gap-2">
                                  <button onClick={() => { setTwoFAStep('idle'); setTwoFACode(''); }}
                                          className="flex-1 py-2 rounded-lg border font-semibold text-xs transition hover:bg-gray-50"
                                          style={{ borderColor: C.g200, color: C.g600 }}>
                                    Cancel
                                  </button>
                                  <button onClick={handleActivate2FA} disabled={twoFACode.length !== 6 || twoFAActivating}
                                          className="flex-1 py-2 rounded-lg text-white font-bold text-xs transition hover:opacity-90 disabled:opacity-50"
                                          style={{ backgroundColor: C.green }}>
                                    {twoFAActivating ? 'Activating…' : 'Activate 2FA'}
                                  </button>
                                </div>
                              </div>
                          )}
                        </div>

                        <div className="flex items-center justify-between p-3 rounded-xl border border-red-100 bg-red-50">
                          <div>
                            <p className="text-sm font-bold text-red-700">Log Out</p>
                            <p className="text-xs text-red-400">Sign out of your account on this device</p>
                          </div>
                          <button onClick={handleLogout} disabled={loggingOut || logoutConfirm}
                                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-white text-xs font-bold hover:opacity-90 disabled:opacity-50 transition-all"
                                  style={{ backgroundColor: C.danger }}>
                            {loggingOut ? <><RefreshCw size={13} className="animate-spin" /> Logging out…</> : <><LogOut size={13} /> Log Out</>}
                          </button>
                        </div>
                      </div>                     </div>
                     )}
                   </div>
               )}

               {/* ── SECURITY bottom sheets (NoOnes parity) ───────────────────────── */}

               {/* 1. Change password */}
               {secSheet === 'password' && (
                   <AccountBottomSheet
                       title="Change password"
                       onClose={closeSecSheet}
                       centerOnDesktop
                       footer={
                         <>
                           <button onClick={closeSecSheet}
                                   className="flex-1 py-2.5 rounded-xl font-bold text-sm border-2 transition hover:bg-gray-50"
                                   style={{ borderColor: C.g200, color: C.g600 }}>
                             Cancel
                           </button>
                           <button onClick={(e) => handlePasswordChange(e)} disabled={loading}
                                   className="flex-1 py-2.5 rounded-xl font-bold text-sm text-white transition hover:opacity-90 disabled:opacity-50"
                                   style={{ backgroundColor: C.green }}>
                             {loading ? 'Updating…' : 'Continue'}
                           </button>
                         </>
                       }>
                     <div className="flex items-start gap-2.5 p-3 rounded-xl mb-4" style={{ backgroundColor: '#ECFDF5' }}>
                       <Shield size={16} style={{ color: C.success, flexShrink: 0, marginTop: 1 }} />
                       <p className="text-xs font-semibold" style={{ color: '#065F46' }}>Changing your password will log you out of all active sessions</p>
                     </div>
                     {[
                       { key: 'currentPassword', label: 'Current password', show: showPw.current, toggle: () => setShowPw({ ...showPw, current: !showPw.current }) },
                       { key: 'newPassword', label: 'New password', show: showPw.new, toggle: () => setShowPw({ ...showPw, new: !showPw.new }) },
                       { key: 'confirmPassword', label: 'Confirm password', show: showPw.confirm, toggle: () => setShowPw({ ...showPw, confirm: !showPw.confirm }) },
                     ].map(({ key, label, show, toggle }) => (
                         <div key={key} className="mb-3">
                           <label className={labelCls}>{label}</label>
                           <div className="relative">
                             <input type={show ? 'text' : 'password'} value={passwordForm[key]}
                                    onChange={e => setPasswordForm({ ...passwordForm, [key]: e.target.value })}
                                    className={`${inputCls} pr-10 ${passwordErrors[key] ? 'border-red-400' : ''}`}
                                    style={passwordErrors[key] ? { borderColor: C.danger, color: C.g800 } : inputStyle(passwordForm[key])}
                                    required />
                             <button type="button" onClick={toggle} className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600 transition">
                               {show ? <EyeOff size={16} /> : <Eye size={16} />}
                             </button>
                           </div>
                           {passwordErrors[key] && (
                               <p className="flex items-center gap-1 text-xs font-bold mt-1" style={{ color: C.danger }}>
                                 <AlertCircle size={11} />
                                 {passwordErrors[key]}
                               </p>
                           )}
                         </div>
                     ))}
                   </AccountBottomSheet>
               )}

               {/* 2. 2FA event settings — toggle list */}
               {secSheet === '2fa-events' && (
                   <AccountBottomSheet
                       title="2FA event settings"
                       onClose={closeSecSheet}
                       centerOnDesktop
                       footer={
                         <>
                           <button onClick={closeSecSheet}
                                   className="flex-1 py-2.5 rounded-xl font-bold text-sm border-2 transition hover:bg-gray-50"
                                   style={{ borderColor: C.g200, color: C.g600 }}>
                             Cancel
                           </button>
                           <button onClick={() => saveSecEvents({ ...twoFAEvents, ...(secEventDraft || {}) })} disabled={secEventBusy}
                                   className="flex-1 py-2.5 rounded-xl font-bold text-sm text-white transition hover:opacity-90 disabled:opacity-50"
                                   style={{ backgroundColor: C.green }}>
                             Continue
                           </button>
                         </>
                       }>
                     <p className="text-sm mb-4" style={{ color: C.g500 }}>Choose which account events require a 2FA code</p>
                     {[{ key: 'login', label: 'Log in' },
                       { key: 'sending_crypto', label: 'Sending cryptocurrency' },
                       { key: 'releasing_crypto', label: 'Releasing cryptocurrency' }].map(({ key, label }) => (
                         <div key={key} className="flex items-center justify-between py-3.5 border-b last:border-b-0" style={{ borderColor: C.g100 }}>
                           <p className="text-sm font-bold" style={{ color: C.g800 }}>{label}</p>
                           <SecToggle
                               on={!!twoFAEvents[key]}
                               disabled={secEventBusy}
                               ariaLabel={`${label} 2FA requirement`}
                               onClick={() => {
                                 // Two-step confirm (NoOnes parity): stage the change
                                 // WITHOUT flipping the switch, then require a fresh
                                 // code from the active method. The toggle only moves
                                 // after the code verifies; cancel/wrong code = revert.
                                 const cur = secEventDraft || twoFAEvents;
                                 saveSecEvents({ ...cur, [key]: !cur[key] });
                               }} />
                         </div>
                     ))}
                     {/* Deactivate the active method — required before the other method can be enabled */}
                     {!showDisable2FA && (
                       <button type="button" onClick={() => { setShowDisable2FA(true); closeSecSheet(); }}
                               className="mt-4 text-xs font-bold px-3 py-2 rounded-lg transition hover:bg-red-50"
                               style={{ color: C.danger }}>
                         Disable 2FA
                       </button>
                     )}
                   </AccountBottomSheet>
               )}

               {/* 3. Two-factor authentication code entry (6-digit + Paste) */}
               {secSheet === '2fa-code' && (
                   <AccountBottomSheet
                       title="Two-factor authentication"
                       onClose={cancelSecConfirm}
                       centerOnDesktop
                       footer={
                         <>
                           <button onClick={cancelSecConfirm}
                                   className="flex-1 py-2.5 rounded-xl font-bold text-sm border-2 transition hover:bg-gray-50"
                                   style={{ borderColor: C.g200, color: C.g600 }}>
                             Cancel
                           </button>
                           <button onClick={handleSecConfirm}
                                   disabled={secConfirmCode.join('').length !== 6 || secConfirmBusy}
                                   className="flex-1 py-2.5 rounded-xl font-bold text-sm text-white transition hover:opacity-90 disabled:opacity-50"
                                   style={{ backgroundColor: C.green }}>
                             {secConfirmBusy ? 'Verifying…' : 'Continue'}
                           </button>
                         </>
                       }>
                     <p className="text-sm mb-4" style={{ color: C.g500 }}>
                       {twoFAMethod === 'email'
                         ? `Please enter the 2FA code sent to your email${user?.email ? ` (${user.email})` : ''} to confirm`
                         : 'Please enter the 2FA code from your authenticator app to confirm'}
                     </p>
                     <label className={labelCls}>Enter verification code</label>
                     <SecCodeInputs values={secConfirmCode} onChange={(v) => { setSecConfirmCode(v); setSecConfirmError(''); }} refs={secCodeRefs} />
                     <div className="flex items-center justify-between mt-3">
                       <button type="button"
                               onClick={async () => {
                                 try {
                                   const text = await navigator.clipboard.readText();
                                   const digits = (text || '').replace(/\D/g, '').slice(0, 6);
                                   if (digits.length === 6) {
                                     setSecConfirmCode(digits.split(''));
                                     setSecConfirmError('');
                                   } else {
                                     toast.error('Clipboard does not contain a 6-digit code');
                                   }
                                 } catch {
                                   toast.error('Could not read the clipboard. Paste manually instead.');
                                 }
                               }}
                               className="text-xs font-bold underline"
                               style={{ color: C.green }}>
                         Paste
                       </button>
                       {twoFAMethod === 'email' && (
                         <button type="button"
                                 onClick={handleSecResendCode}
                                 disabled={secResendBusy}
                                 className="text-xs font-bold underline disabled:opacity-50"
                                 style={{ color: C.green }}>
                           {secResendBusy ? 'Sending…' : 'Resend code'}
                         </button>
                       )}
                     </div>
                     {secConfirmError && (
                       <p className="flex items-center gap-1 text-xs font-bold mt-3" style={{ color: C.danger }}>
                         <AlertCircle size={12} /> {secConfirmError}
                       </p>
                     )}
                     {/* Code-delivery failure banner: dismissible + retryable
                         (Issue 3) — shown only after an actual send failure. */}
                     {secResendFailed && (
                       <div className="flex items-center justify-between gap-2 mt-3 p-3 rounded-xl border" style={{ borderColor: C.danger, backgroundColor: 'rgba(220,38,38,0.06)' }}>
                         <p className="flex items-center gap-1 text-xs font-bold" style={{ color: C.danger }}>
                           <AlertCircle size={12} /> We couldn't send your code. Check your connection and try again.
                         </p>
                         <div className="flex items-center gap-2 flex-shrink-0">
                           <button type="button" onClick={handleSecResendCode} disabled={secResendBusy}
                                   className="text-xs font-bold underline disabled:opacity-50" style={{ color: C.danger }}>
                             Try again
                           </button>
                           <button type="button" onClick={() => setSecResendFailed(false)} aria-label="Dismiss error"
                                   className="text-xs font-bold" style={{ color: C.g500 }}>
                             <X size={14} />
                           </button>
                         </div>
                       </div>
                     )}
                     {/* TOTP setup step: scannable QR code (primary) with the
                         manual key as a collapsed fallback. The QR re-renders
                         automatically whenever the secret is regenerated
                         (cancel + reopen setup), since it's driven by state. */}
                     {sec2FAPurpose === 'totp-setup' && secTotpSetup && (
                       <div className="mt-4 p-3 rounded-xl flex flex-col items-center" style={{ backgroundColor: C.g50 }}>
                         <p className="text-xs font-bold mb-3 text-center" style={{ color: C.g700 }}>Scan with Google Authenticator or Authy</p>
                         {secTotpSetup.otpauth_url ? (
                           <div className="bg-white p-3 rounded-xl" style={{ border: `1px solid ${C.g200}` }}>
                             <QRCodeSVG value={secTotpSetup.otpauth_url} size={180} level="M" marginSize={2} />
                           </div>
                         ) : null}
                         <details className="w-full mt-3">
                           <summary className="text-xs font-bold cursor-pointer text-center" style={{ color: C.green }}>
                             Can't scan? Enter this code manually
                           </summary>
                           <div className="mt-2">
                             <div className="flex items-start justify-between gap-2">
                               <p className="text-xs font-mono break-all min-w-0 flex-1" style={{ color: C.g500 }}>{secTotpSetup.secret}</p>
                               <button type="button"
                                       onClick={() => handleSecCopy(secTotpSetup.secret, 'secret')}
                                       aria-label="Copy secret key"
                                       className="flex-shrink-0 flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-md border transition-colors"
                                       style={{
                                         borderColor: C.g200,
                                         color: secCopiedField === 'secret' ? C.success : C.g600,
                                         backgroundColor: secCopiedField === 'secret' ? '#ECFDF5' : 'transparent',
                                       }}>
                                 {secCopiedField === 'secret' ? <Check size={11} /> : <Copy size={11} />}
                                 {secCopiedField === 'secret' ? 'Copied!' : 'Copy'}
                               </button>
                             </div>
                             <div className="flex items-start justify-between gap-2 mt-2">
                               <p className="text-[10px] font-mono break-all min-w-0 flex-1" style={{ color: C.g400 }}>{secTotpSetup.otpauth_url}</p>
                               <button type="button"
                                       onClick={() => handleSecCopy(secTotpSetup.otpauth_url, 'uri')}
                                       aria-label="Copy setup URI"
                                       className="flex-shrink-0 flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-md border transition-colors"
                                       style={{
                                         borderColor: C.g200,
                                         color: secCopiedField === 'uri' ? C.success : C.g600,
                                         backgroundColor: secCopiedField === 'uri' ? '#ECFDF5' : 'transparent',
                                       }}>
                                 {secCopiedField === 'uri' ? <Check size={11} /> : <Copy size={11} />}
                                 {secCopiedField === 'uri' ? 'Copied!' : 'Copy'}
                               </button>
                             </div>
                           </div>
                         </details>
                       </div>
                     )}
                   </AccountBottomSheet>
               )}

               {/* 4. Action required — method conflict (mutual exclusivity) */}
               {secSheet === '2fa-conflict' && (
                   <AccountBottomSheet
                       title="Action required"
                       onClose={closeSecSheet}
                       centerOnDesktop
                       footer={
                         <>
                           <button onClick={closeSecSheet}
                                   className="flex-1 py-2.5 rounded-xl font-bold text-sm border-2 transition hover:bg-gray-50"
                                   style={{ borderColor: C.g200, color: C.g600 }}>
                             Cancel
                           </button>
                           <button onClick={() => {
                             // Route to manage/disable the currently active method
                             setShowDisable2FA(true);
                             setSecSheet(null);
                             setSecConfirmCode(['', '', '', '', '', '']);
                             setSecConfirmError('');
                           }}
                                   className="flex-1 py-2.5 rounded-xl font-bold text-sm text-white transition hover:opacity-90"
                                   style={{ backgroundColor: C.green }}>
                             Manage 2FA
                           </button>
                         </>
                       }>
                     <p className="text-sm leading-relaxed" style={{ color: C.g700 }}>
                       {(METHOD_LABELS[secPendingMethod] || 'That method')}-based 2FA cannot be enabled while {(METHOD_LABELS[secConflictFrom] || 'another method')} is active. Please disable it first
                     </p>
                   </AccountBottomSheet>
               )}

               {/* 5. Close account — wallet balance warning + email confirmation request */}
               {secSheet === 'close-account' && (
                   <AccountBottomSheet
                       title="Close account"
                       onClose={closeSecSheet}
                       centerOnDesktop
                       footer={
                         <>
                           <button onClick={closeSecSheet}
                                   className="flex-1 py-2.5 rounded-xl font-bold text-sm border-2 transition hover:bg-gray-50"
                                   style={{ borderColor: C.g200, color: C.g600 }}>
                             Cancel
                           </button>
                           <button onClick={handleSecCloseAccount}
                                   disabled={secClosing || secWalletLoading || (secWalletBalance ?? 0) > 0}
                                   className="flex-1 py-2.5 rounded-xl font-bold text-sm text-white transition hover:opacity-90 disabled:opacity-50"
                                   style={{ backgroundColor: C.green }}>
                             {secClosing ? 'Submitting…' : 'Continue'}
                           </button>
                         </>
                       }>
                     <p className="text-sm mb-4" style={{ color: C.g700 }}>To close your account, please complete the following:</p>

                     <button type="button" onClick={() => { closeSecSheet(); navigate('/wallet'); }}
                             className="w-full flex items-center justify-between p-3 rounded-xl border mb-4 transition hover:bg-gray-50"
                             style={{ borderColor: C.g200 }}>
                       <div className="text-left">
                         <p className="text-sm font-bold" style={{ color: C.g800 }}>Wallet</p>
                         <p className="text-xs" style={{ color: C.g500 }}>Withdraw all funds from your wallet</p>
                       </div>
                       <ChevronRight size={16} style={{ color: C.g400 }} />
                     </button>

                     <div className="p-3 rounded-xl" style={{ backgroundColor: '#FEF2F2' }}>
                       <p className="text-xs font-semibold leading-relaxed" style={{ color: '#991B1B' }}>
                         {secWalletLoading
                           ? 'Checking your wallet balance…'
                           : secWalletBalance > 0
                             ? `Your remaining wallet balance of $${secWalletBalance.toFixed(2)} USD will be lost and cannot be recovered. This action is irreversible. Are you sure you want to continue?`
                             : 'Your remaining wallet balance will be lost and cannot be recovered. This action is irreversible. Are you sure you want to continue?'}
                       </p>
                     </div>
                   </AccountBottomSheet>
               )}

               {/* ── PREFERENCES ─────────────────────────────────────── */}
              {activeTab === 'preferences' && (
                  <div className="space-y-4">
                    <div className="bg-white rounded-2xl shadow-sm border p-6" style={{ borderColor: C.g200 }}>
                      <h2 className="text-lg font-black mb-1" style={{ color: C.forest }}>Account Preferences</h2>
                      <p className="text-xs mb-6" style={{ color: C.g400 }}>Customize how prices, dates, and content display across PRAQEN</p>

                      <div className="space-y-6">
                        <div>
                          <label className={labelCls}><DollarSign size={14} className="inline mr-1" /> Preferred Currency</label>
                          <select value={prefs.currency} onChange={e => setPrefs({ ...prefs, currency: e.target.value })}
                                  className={inputCls} style={inputStyle(true)}>
                            {CURRENCIES.map(({ code, label, symbol, flag }) => (
                                <option key={code} value={code}>{flag} {label} ({symbol})</option>
                            ))}
                          </select>
                          {(() => {
                            const cur = CURRENCIES.find(c => c.code === prefs.currency);
                            return cur ? (
                                <div className="mt-2 flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold" style={{ backgroundColor: C.g50, color: C.g600 }}>
                                  <span className="text-base">{cur.flag}</span>
                                  <span>{cur.label}</span>
                                  <span className="ml-auto font-black" style={{ color: C.green }}>{cur.symbol}</span>
                                </div>
                            ) : null;
                          })()}
                        </div>

                        <div>
                          <label className={labelCls}><Languages size={14} className="inline mr-1" /> Language</label>
                          <select value={prefs.language} onChange={e => setPrefs({ ...prefs, language: e.target.value })}
                                  className={inputCls} style={inputStyle(true)}>
                            {LANGUAGES.map(({ code, label, native }) => (
                                <option key={code} value={code}>{label}{native !== label ? ` — ${native}` : ''}</option>
                            ))}
                          </select>
                          {(() => {
                            const lang = LANGUAGES.find(l => l.code === prefs.language);
                            return lang ? (
                                <div className="mt-2 flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold" style={{ backgroundColor: C.g50, color: C.g600 }}>
                                  <span>{lang.label}</span>
                                  {lang.native !== lang.label && <span style={{ color: C.g400 }}>({lang.native})</span>}
                                </div>
                            ) : null;
                          })()}
                        </div>

                        <div>
                          <label className={labelCls}><MapPin size={14} className="inline mr-1" /> Timezone</label>
                          <select value={prefs.timezone} onChange={e => setPrefs({ ...prefs, timezone: e.target.value })}
                                  className={inputCls} style={inputStyle(true)}>
                            {Object.entries(TIMEZONE_GROUPS).map(([region, zones]) => (
                                <optgroup key={region} label={region}>
                                  {zones.map(({ tz, label }) => (
                                      <option key={tz} value={tz}>{label}</option>
                                  ))}
                                </optgroup>
                            ))}
                          </select>
                          {prefs.timezone && (
                              <div className="mt-2 flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold" style={{ backgroundColor: C.g50, color: C.g600 }}>
                                <Clock size={14} className="inline-block" style={{ color: C.g600 }} />
                                <span>{prefs.timezone.replace(/_/g, ' ')}</span>
                                <span className="ml-auto font-black" style={{ color: C.green }}>
                            {(() => { try { return new Intl.DateTimeFormat('en', { timeZone: prefs.timezone, timeZoneName: 'short' }).formatToParts(new Date()).find(p => p.type === 'timeZoneName')?.value || ''; } catch { return ''; } })()}
                          </span>
                              </div>
                          )}
                        </div>

                        <button onClick={handleSavePreferences} disabled={loading}
                                className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-white font-bold text-sm hover:opacity-90 disabled:opacity-50 transition"
                                style={{ backgroundColor: C.green }}>
                          {loading ? <><RefreshCw size={15} className="animate-spin" /> Saving…</> : <><Save size={15} /> Save Preferences</>}
                        </button>
                        <p className="text-xs" style={{ color: C.g400 }}>
                          Currency affects price display in your wallet and marketplace. Language and timezone are saved to your account.
                        </p>
                      </div>
                    </div>
                  </div>
              )}

              {/* ── PAYMENT METHODS ──────────────────────────────────── */}
              {activeTab === 'payment' && (
                  <div className="bg-white rounded-2xl shadow-sm border p-6" style={{ borderColor: C.g200 }}>
                    <h2 className="text-lg font-black mb-2" style={{ color: C.forest }}>Payment Methods</h2>
                    <p className="text-xs text-gray-400 mb-5">These details are shared with buyers/sellers during a trade</p>
                    <form onSubmit={handlePaymentUpdate} className="space-y-4">
                      <div>
                        <label className={labelCls}>Bank Name</label>
                        <input type="text" value={payments.bankName} onChange={e => setPayments({ ...payments, bankName: e.target.value })}
                               placeholder="e.g. GCB Bank, GTBank, Ecobank" className={inputCls} style={inputStyle(payments.bankName)} />
                      </div>
                      <div>
                        <label className={labelCls}>Bank Account Number</label>
                        <input type="text" value={payments.accountNumber} onChange={e => setPayments({ ...payments, accountNumber: e.target.value })}
                               placeholder="Enter account number" className={inputCls} style={inputStyle(payments.accountNumber)} />
                      </div>
                      <div>
                        <label className={labelCls}>Mobile Money Provider</label>
                        <select value={payments.mobileProvider} onChange={e => setPayments({ ...payments, mobileProvider: e.target.value })}
                                className={inputCls} style={inputStyle(payments.mobileProvider)}>
                          <option value="">Select provider</option>
                          <option value="mtn">MTN Mobile Money</option>
                          <option value="vodafone">Vodafone Cash</option>
                          <option value="airteltigo">AirtelTigo Money</option>
                          <option value="mpesa">M-Pesa</option>
                          <option value="opay">OPay</option>
                          <option value="palmpay">PalmPay</option>
                          <option value="wave">Wave</option>
                        </select>
                      </div>
                      <div>
                        <label className={labelCls}>Mobile Money Number</label>
                        <input type="tel" value={payments.mobileNumber} onChange={e => setPayments({ ...payments, mobileNumber: e.target.value })}
                               placeholder="+233 XX XXX XXXX" className={inputCls} style={inputStyle(payments.mobileNumber)} />
                      </div>
                      <div className="p-3 rounded-xl text-xs font-semibold flex items-start gap-2" style={{ backgroundColor: `${C.warn}12`, color: '#92400E' }}>
                        <AlertCircle size={13} className="flex-shrink-0 mt-0.5" />
                        Your payment details are only shared with your trade partner during an active trade. Never share outside the platform.
                      </div>
                      <button type="submit" disabled={loading}
                              className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-white font-bold text-sm hover:opacity-90 disabled:opacity-50"
                              style={{ backgroundColor: C.green }}>
                        {loading ? <><RefreshCw size={15} className="animate-spin" /> Saving…</> : <><Save size={15} /> Save Payment Methods</>}
                      </button>
                    </form>
                  </div>
              )}

              {/* ── NOTIFICATIONS ───────────────────────────────────── */}
              {activeTab === 'notifications' && (
                  <div className="bg-white rounded-2xl shadow-sm border p-6" style={{ borderColor: C.g200 }}>
                    <h2 className="text-lg font-black mb-5" style={{ color: C.forest }}>Notification Preferences</h2>
                    <div className="space-y-4">
                      <PushEnableCard user={user} />
                      <TelegramCard />

                      {[
                        { grpKey: 'email', section: <span className="inline-flex items-center gap-1.5"><Mail size={14} className="inline-block" />Email Notifications</span>, items: [
                            { key: 'email_trades', label: 'Trade Updates', desc: 'New trades, payments, releases' },
                            { key: 'email_security', label: 'Security Alerts', desc: 'Login attempts, password changes' },
                            { key: 'email_marketing', label: 'News & Promotions', desc: 'Platform updates and offers' },
                          ] },
                        { grpKey: 'push', section: <span className="inline-flex items-center gap-1.5"><Bell size={14} className="inline-block" />Push Notification Types</span>, items: [
                            { key: 'push_trades', label: 'Trade Alerts', desc: 'New trades, payments, BTC releases' },
                            { key: 'push_messages', label: 'Chat Messages', desc: 'New messages in trade chat' },
                            { key: 'push_disputes', label: 'Dispute Alerts', desc: 'Dispute opened or resolved' },
                          ] },
                      ].map(({ section, items, grpKey }) => (
                          <div key={grpKey}>
                            <p className="text-sm font-black text-gray-700 mb-2">{section}</p>
                            <div className="space-y-2">
                              {items.map(({ key, label, desc }) => (
                                  <div key={key} className="flex items-center justify-between p-3 rounded-xl bg-gray-50 border" style={{ borderColor: C.g100 }}>
                                    <div>
                                      <p className="text-sm font-bold text-gray-800">{label}</p>
                                      <p className="text-xs text-gray-500">{desc}</p>
                                    </div>
                                    <Toggle checked={notifs[key]} onChange={v => setNotifs({ ...notifs, [key]: v })} />
                                  </div>
                              ))}
                            </div>
                          </div>
                      ))}

                      <button onClick={handleSaveNotifications} disabled={loading}
                              className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-white font-bold text-sm hover:opacity-90 disabled:opacity-50 transition"
                              style={{ backgroundColor: C.green }}>
                        {loading ? <><RefreshCw size={15} className="animate-spin" /> Saving…</> : <><Save size={15} /> Save Preferences</>}
                      </button>
                    </div>
                  </div>
              )}
            </div>
          </div>
        </div>

        {/* ── E-mail change modal (NoOnes parity) ─────────────────────────────── */}
        {emailModalOpen && (
            <AccountBottomSheet
                title="E-mail"
                onClose={() => { setEmailModalOpen(false); setEmailDraft(''); }}
                footer={
                  <>
                    <button onClick={() => { setEmailModalOpen(false); setEmailDraft(''); }}
                            className="flex-1 py-2.5 rounded-xl font-bold text-sm border-2 transition hover:bg-gray-50"
                            style={{ borderColor: C.g200, color: C.g600 }}>
                      Cancel
                    </button>
                    <button onClick={handleEmailChange} disabled={emailSaving || !emailDraft.trim()}
                            className="flex-1 py-2.5 rounded-xl font-bold text-sm text-white transition hover:opacity-90 disabled:opacity-50"
                            style={{ backgroundColor: C.green }}>
                      {emailSaving ? 'Saving…' : 'Continue'}
                    </button>
                  </>
                }>
              <p className="text-sm mb-4" style={{ color: C.g500 }}>Change your email address on PraQen</p>
              <input type="email" value={emailDraft}
                     onChange={e => setEmailDraft(e.target.value)}
                     onKeyDown={e => { if (e.key === 'Enter' && !emailSaving && emailDraft.trim()) handleEmailChange(); }}
                     placeholder="Enter new email address"
                     className="w-full px-4 py-2.5 border rounded-lg text-sm focus:outline-none focus:border-green-500 transition"
                     style={{ borderColor: C.g200, color: C.g800, backgroundColor: C.g50 }} />
              <div className="mt-4 p-3 rounded-xl text-xs font-semibold leading-relaxed"
                   style={{ backgroundColor: '#FEF3C7', color: '#92400E' }}>
                Changing your email will temporarily disable wallet withdrawals for 24 hours. Are you sure you want to continue?
              </div>
            </AccountBottomSheet>
        )}

        {/* ── Phone number change modal (NoOnes parity) ───────────────────────── */}
        {phoneModalOpen && (
            <AccountBottomSheet
                title="Phone number"
                onClose={() => { setPhoneModalOpen(false); setCountryListOpen(false); setPhoneDraft(''); }}
                footer={
                  <>
                    <button onClick={() => { setPhoneModalOpen(false); setCountryListOpen(false); setPhoneDraft(''); }}
                            className="flex-1 py-2.5 rounded-xl font-bold text-sm border-2 transition hover:bg-gray-50"
                            style={{ borderColor: C.g200, color: C.g600 }}>
                      Cancel
                    </button>
                    <button onClick={handlePhoneChange} disabled={phoneSaving || !phoneDraft.trim()}
                            className="flex-1 py-2.5 rounded-xl font-bold text-sm text-white transition hover:opacity-90 disabled:opacity-50"
                            style={{ backgroundColor: C.green }}>
                      {phoneSaving ? 'Saving…' : 'Continue'}
                    </button>
                  </>
                }>
              <p className="text-sm mb-4" style={{ color: C.g500 }}>Please set your phone number with country code</p>

              {/* Country code selector + phone input */}
              <div className="flex items-stretch gap-2">
                <button type="button" onClick={() => setCountryListOpen(o => !o)}
                        className="flex items-center gap-1.5 px-3 rounded-lg border text-sm font-bold flex-shrink-0"
                        style={{ borderColor: C.g200, backgroundColor: C.g50, color: C.g800 }}>
                  <span className="text-base leading-none">{phoneCountry.flag}</span>
                  <span>{phoneCountry.code}</span>
                  <ChevronDown size={14} style={{ color: C.g400 }} />
                </button>
                <input type="tel" value={phoneDraft}
                       onChange={e => setPhoneDraft(e.target.value)}
                       onKeyDown={e => { if (e.key === 'Enter' && !phoneSaving && phoneDraft.trim()) handlePhoneChange(); }}
                       placeholder="Enter new phone number"
                       className="min-w-0 flex-1 px-4 py-2.5 border rounded-lg text-sm focus:outline-none focus:border-green-500 transition"
                       style={{ borderColor: C.g200, color: C.g800, backgroundColor: C.g50 }} />
              </div>

              {/* Searchable country list (search bar + scrollable flag/name/dial rows) */}
              {countryListOpen && (
                  <div className="mt-2 border rounded-xl overflow-hidden" style={{ borderColor: C.g200 }}>
                    <div className="p-2 border-b" style={{ borderColor: C.g100, backgroundColor: C.g50 }}>
                      <input type="text" value={countrySearch}
                             onChange={e => setCountrySearch(e.target.value)}
                             placeholder="Search country"
                             className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
                             style={{ border: `1px solid ${C.g200}`, color: C.g800, backgroundColor: C.white }} />
                    </div>
                    <div style={{ maxHeight: 220, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
                      {PHONE_CODES
                          .filter(c => {
                            const q = countrySearch.trim().toLowerCase();
                            return !q || c.name.toLowerCase().includes(q) || c.code.includes(q);
                          })
                          .map(c => (
                              <button key={`${c.name}-${c.code}`} type="button"
                                      onClick={() => { setPhoneCountry(c); setCountryListOpen(false); setCountrySearch(''); }}
                                      className="w-full flex items-center gap-3 px-3 py-2.5 text-left transition hover:bg-gray-50"
                                      style={{ borderBottom: `1px solid ${C.g100}` }}>
                                <span className="text-lg leading-none">{c.flag}</span>
                                <span className="flex-1 min-w-0 truncate text-sm font-semibold" style={{ color: C.g800 }}>{c.name}</span>
                                <span className="text-sm font-bold" style={{ color: C.g500 }}>{c.code}</span>
                              </button>
                          ))}
                      {PHONE_CODES.filter(c => {
                        const q = countrySearch.trim().toLowerCase();
                        return !q || c.name.toLowerCase().includes(q) || c.code.includes(q);
                      }).length === 0 && (
                          <p className="px-3 py-4 text-sm text-center" style={{ color: C.g400 }}>No countries found</p>
                      )}
                    </div>
                  </div>
              )}

              <div className="mt-4 p-3 rounded-xl text-xs font-semibold leading-relaxed"
                   style={{ backgroundColor: '#FEF3C7', color: '#92400E' }}>
                Changing your phone will temporarily disable wallet withdrawals for 24 hours. Are you sure you want to continue?
              </div>
            </AccountBottomSheet>
        )}

        {/* Logout Confirm Modal */}
        {logoutConfirm && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
              <div className="bg-white rounded-2xl shadow-xl border max-w-sm w-full p-6" style={{ borderColor: C.g200 }}>
                <div className="text-center mb-5">
                  <div className="mx-auto w-12 h-12 rounded-full flex items-center justify-center mb-3" style={{ backgroundColor: '#FEF2F2' }}>
                    <LogOut size={22} style={{ color: C.danger }} />
                  </div>
                  <h3 className="text-lg font-black" style={{ color: C.g800 }}>Log Out?</h3>
                  <p className="text-sm mt-1" style={{ color: C.g500 }}>Are you sure you want to sign out of your account?</p>
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setLogoutConfirm(false)} disabled={loggingOut}
                          className="flex-1 py-2.5 rounded-xl font-bold text-sm border-2 transition hover:bg-gray-50"
                          style={{ borderColor: C.g200, color: C.g600 }}>
                    Cancel
                  </button>
                  <button onClick={handleLogoutConfirm} disabled={loggingOut}
                          className="flex-1 py-2.5 rounded-xl font-bold text-sm text-white transition hover:opacity-90 disabled:opacity-50"
                          style={{ backgroundColor: C.danger }}>
                    {loggingOut ? 'Logging out…' : 'Yes, Log Out'}
                  </button>
                </div>
              </div>
            </div>
        )}

        {/* ── FOOTER ──────────────────────────────────────────────────────────── */}
        <PRQFooter />

        {/* ── Mobile bottom sheet menu ── */}
        {mobileMenuOpen && (
            <>
              {/* Backdrop */}
              <div onClick={() => setMobileMenuOpen(false)}
                   style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 10000 }} />
              {/* Sheet */}
              <div style={{
                position: 'fixed', bottom: 0, left: 0, right: 0,
                background: '#fff', zIndex: 10001,
                borderRadius: '20px 20px 0 0',
                maxHeight: '85vh', overflowY: 'auto',
                paddingBottom: 'env(safe-area-inset-bottom, 16px)',
                animation: 'slideUp 0.25s cubic-bezier(0.16,1,0.3,1)',
              }}>
                <style>{`
                  @keyframes slideUp {
                    from { transform: translateY(100%); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                  }
                `}</style>
                {/* Handle bar */}
                <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 12, paddingBottom: 4 }}>
                  <div style={{ width: 36, height: 4, borderRadius: 2, background: C.g200 }} />
                </div>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 20px 16px' }}>
                  <h3 style={{ fontSize: 16, fontWeight: 800, color: C.g800, margin: 0 }}>Settings</h3>
                  <button onClick={() => setMobileMenuOpen(false)}
                          style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: C.g100, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <X size={18} color={C.g600} />
                  </button>
                </div>
                {/* Tab items */}
                <div style={{ padding: '0 12px 16px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {TABS.map(({ id, icon: Icon, label, route }) => (
                      <button key={id} onClick={() => { setMobileMenuOpen(false); if (route) { navigate(route); } else { setActiveTab(id); } }}
                              style={{
                                width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                                padding: '12px 16px', borderRadius: 12, border: 'none',
                                background: activeTab === id ? C.green : 'transparent',
                                cursor: 'pointer', textAlign: 'left', transition: 'background 0.15s',
                              }}>
                        <Icon size={18} style={{ color: activeTab === id ? '#fff' : C.g400, flexShrink: 0 }} />
                        <span style={{ fontSize: 14, fontWeight: 700, color: activeTab === id ? '#fff' : C.g700 }}>{label}</span>
                      </button>
                  ))}
                </div>
              </div>
            </>
        )}
      </div>
  );
}
