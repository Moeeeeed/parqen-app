// src/pages/Settings.js - COMPLETE CLEAN FILE

import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import {
  requestNotificationPermission,
  getNotificationPermission,
  isPushSupported
} from '../utils/notifications';
import {
  User, Lock, Mail, Phone, CreditCard, Bell,
  Shield, Globe, Save, Eye, EyeOff, CheckCircle,
  AlertCircle, Smartphone, LogOut, ChevronRight,
  Camera, BadgeCheck, Clock, Upload, RefreshCw,
  FileText, DollarSign, Languages, MapPin, X,
  ToggleLeft, ToggleRight,
  Ban, WifiOff, MessageCircle, Car, Plane, Zap,
  AlertTriangle, Circle
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

const maskEmail = (email) => {
  if (!email) return "—";
  const [local, domain] = email.split("@");
  if (!domain) return email;
  const show = Math.min(4, local.length);
  const masked = local.slice(0, show) + "•".repeat(Math.max(3, local.length - show));
  return `${masked}@${domain}`;
};

// ─── Verification Step ────────────────────────────────────────────────────────
function VerifStep({ n, title, desc, done, active, badge }) {
  return (
      <div className={`flex items-start gap-4 p-4 rounded-xl border transition ${done ? 'bg-green-50 border-green-200' : active ? 'border-blue-200 bg-blue-50' : 'bg-gray-50 border-gray-100'}`}>
        <div className={`w-9 h-9 rounded-full flex items-center justify-center font-black text-sm flex-shrink-0 ${done ? 'bg-green-500 text-white' : active ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-500'}`}>
          {done ? <CheckCircle size={18} /> : n}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className={`font-bold text-sm ${done ? 'text-green-800' : active ? 'text-blue-800' : 'text-gray-600'}`}>{title}</p>
            {badge && <span className={`text-xs font-black px-2 py-0.5 rounded-full ${done ? 'bg-green-200 text-green-800' : 'bg-gray-200 text-gray-600'}`}>{badge}</span>}
          </div>
          <p className={`text-xs mt-0.5 ${done ? 'text-green-600' : active ? 'text-blue-600' : 'text-gray-400'}`}>{desc}</p>
        </div>
        {done ? <CheckCircle size={16} className="text-green-500 flex-shrink-0 mt-0.5" /> :
            active ? <span className="text-xs font-bold text-blue-600 flex-shrink-0 mt-0.5">Required →</span> :
                <Clock size={16} className="text-gray-300 flex-shrink-0 mt-0.5" />}
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
function PushEnableCard() {
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
              setRequesting(true);
              const granted = await requestNotificationPermission();
              setPermission(granted ? "granted" : "denied");
              setRequesting(false);
              if (granted)
                toast.success("Trade alerts enabled! You'll never miss a trade.");
              else
                toast.info("Notifications not enabled. You can turn them on later.");
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
  const [activeTab, setActiveTab] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get('tab');
    const validTabs = ['account', 'verification', 'security', 'preferences', 'payment', 'notifications'];
    if (tabParam && validTabs.includes(tabParam)) {
      return tabParam;
    }
    const savedTab = localStorage.getItem('praqen_active_tab');
    if (savedTab && validTabs.includes(savedTab)) {
      return savedTab;
    }
    return 'account';
  });

  // Save tab to URL and localStorage
  useEffect(() => {
    const validTabs = ['account', 'verification', 'security', 'preferences', 'payment', 'notifications'];
    if (activeTab && validTabs.includes(activeTab)) {
      localStorage.setItem('praqen_active_tab', activeTab);
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
    const validTabs = ['account', 'verification', 'security', 'preferences', 'payment', 'notifications'];
    if (tabParam && validTabs.includes(tabParam)) {
      setActiveTab(tabParam);
      localStorage.setItem('praqen_active_tab', tabParam);
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

  // Phone verification flow
  const [phoneStep, setPhoneStep] = useState(() => {
    if (user?.is_phone_verified || user?.phone_verified) return "done";
    return "idle";
  });
  const [phoneOtpMethod, setPhoneOtpMethod] = useState("email");
  const [phoneOtpCode, setPhoneOtpCode] = useState("");

  // Email verification
  const [emailVerifyStep, setEmailVerifyStep] = useState("idle");
  const [emailCode, setEmailCode] = useState("");
  const [emailCodeLoading, setEmailCodeLoading] = useState(false);

  // KYC upload
  const [kycIdType, setKycIdType] = useState("");
  const [kycFiles, setKycFiles] = useState({ front: null, back: null });
  const [kycStep, setKycStep] = useState("select");
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

  const KYC_ID_TYPES = [
    { value: "ghana_card", label: <span className="inline-flex items-center gap-1.5"><FileText size={13} className="inline-block" />Ghana Card</span> },
    { value: "drivers_license", label: <span className="inline-flex items-center gap-1.5"><Car size={13} className="inline-block" />Driver's Licence</span> },
    { value: "passport", label: <span className="inline-flex items-center gap-1.5"><Plane size={13} className="inline-block" />Passport</span> },
    { value: "id_card", label: <span className="inline-flex items-center gap-1.5"><CreditCard size={13} className="inline-block" />ID Card</span> },
    { value: "order_id", label: <span className="inline-flex items-center gap-1.5"><FileText size={13} className="inline-block" />Order ID Under Your Name</span> },
  ];

  const [emailResendCount, setEmailResendCount] = useState(() => parseInt(localStorage.getItem("prq_email_resend") || "0"));
  const [phoneResendCount, setPhoneResendCount] = useState(() => parseInt(localStorage.getItem("prq_phone_resend") || "0"));

  const [emailVerified, setEmailVerified] = useState(!!(user?.is_email_verified || user?.email_verified));
  const [phoneVerified, setPhoneVerified] = useState(!!(user?.is_phone_verified || user?.phone_verified));
  const [kycVerified, setKycVerified] = useState(() => {
    if (user?.kyc_verified || user?.is_id_verified) return true;
    const ls = JSON.parse(localStorage.getItem("user") || "{}");
    return ls.kyc_status === "approved" || user?.kyc_status === "approved";
  });
  const [verificationSyncing, setVerificationSyncing] = useState(true);
  const verLevel = kycVerified ? 3 : phoneVerified ? 2 : emailVerified ? 1 : 0;

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
    setKycVerified(!!(user.kyc_verified || user.is_id_verified));
    setTwoFAEnabled(!!user.two_factor_enabled);
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
              return { ...p, currency, language, timezone, nameDisplay };
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
      const locationUpdate = locationLocked ? {} : { location: accountForm.location };
      if (setUser) setUser({
        ...user,
        username: accountForm.username,
        full_name: accountForm.fullName,
        ...locationUpdate,
        ...(phoneIsLocked ? {} : { phone: accountForm.phone }),
      });
      const stored = JSON.parse(localStorage.getItem("user") || "{}");
      localStorage.setItem("user", JSON.stringify({
        ...stored,
        username: accountForm.username,
        full_name: accountForm.fullName,
        ...locationUpdate,
        ...(phoneIsLocked ? {} : { phone: accountForm.phone }),
      }));
      window.dispatchEvent(new Event("userUpdated"));
      toast.success("Account updated!");
    } catch (e) {
      toast.error(e?.response?.data?.error || "Failed to update");
    } finally {
      setLoading(false);
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
      await axios.post(`${API_URL}/users/verify-phone-otp`, { phone: accountForm.phone, otp: phoneOtpCode }, { headers: authH() });
      toast.success("Phone number verified!");
      markPhoneVerifiedLocally(accountForm.phone);
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

  const saveNameDisplay = async () => {
    const mode = prefs.nameDisplay;
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

  const compressImage = (file, maxPx = 1400, quality = 0.82) =>
      new Promise((resolve, reject) => {
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

  const handleKycSubmit = async () => {
    if (!kycFiles.front || !kycFiles.back || !kycIdType) {
      toast.error("Please upload both the front and back of your ID card");
      return;
    }
    setKycLoading(true);
    setKycStep("processing");
    try {
      const [idImage, idImageBack] = await Promise.all([
        compressImage(kycFiles.front),
        compressImage(kycFiles.back),
      ]);
      await axios.post(`${API_URL}/kyc/upload`, { idImage, idImageBack, idType: kycIdType }, { headers: authH() });
      toast.success("Documents received! We'll review within 24 hours.");
      const submittedAt = new Date().toISOString();
      setKycSubmitted(true);
      setKycStatus("pending");
      setKycSubmittedType(kycIdType);
      setKycSubmittedAt(submittedAt);
      setKycStep("done");
      localStorage.setItem("praqen_kyc", JSON.stringify({ status: "pending", id_type: kycIdType, submitted_at: submittedAt }));
    } catch (e) {
      const msg = e?.response?.data?.error || (e?.response?.status === 413 ? "Images are too large. Please use smaller photos and try again." : null) || "Failed to submit KYC. Please check your connection and try again.";
      toast.error(msg);
      setKycStep("ready");
    } finally {
      setKycLoading(false);
    }
  };

  const handleSavePreferences = async () => {
    setLoading(true);
    try {
      await axios.put(`${API_URL}/users/preferences`, prefs, { headers: authH() });
      localStorage.setItem("praqen_currency", prefs.currency);
      localStorage.setItem("praqen_language", prefs.language);
      localStorage.setItem("praqen_timezone", prefs.timezone);
      if (setUser) setUser((u) => ({ ...u, preferred_currency: prefs.currency, preferred_language: prefs.language, timezone: prefs.timezone }));
      toast.success("Preferences saved!");
    } catch (e) {
      toast.error("Failed to save preferences");
    } finally {
      setLoading(false);
    }
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

  const TABS = [
    { id: "account", icon: User, label: "Account" },
    { id: "verification", icon: Shield, label: "Verification" },
    { id: "security", icon: Lock, label: "Security" },
    { id: "preferences", icon: Globe, label: "Preferences" },
    { id: "payment", icon: CreditCard, label: "Payment" },
    { id: "notifications", icon: Bell, label: "Notifications" },
  ];

  const inputCls = "w-full px-4 py-2.5 border-2 rounded-xl text-sm focus:outline-none transition";
  const inputStyle = (active) => ({
    borderColor: active ? C.green : C.g200,
    color: C.g800,
  });
  const labelCls = "block text-sm font-bold mb-1.5 text-gray-700";

  return (
      <div className="min-h-screen flex flex-col" style={{ backgroundColor: C.mist, fontFamily: "'DM Sans',sans-serif" }}>
        <div className="max-w-5xl mx-auto w-full px-4 py-4 md:py-8">
          {/* Header */}
          <div className="mb-4 md:mb-8">
            <h1 className="text-2xl md:text-3xl font-black" style={{ color: C.forest, fontFamily: "'Syne',sans-serif" }}>Settings</h1>
            <p className="text-sm mt-1" style={{ color: C.g500 }}>Manage your account, security and preferences</p>
          </div>

          <div className="flex flex-col md:flex-row gap-4 md:gap-6">
            {/* Sidebar tabs */}
            <div className="md:w-52 flex-shrink-0">
              {/* Mobile: horizontal scrollable pill tab bar */}
              <div className="md:hidden flex gap-2 overflow-x-auto no-scrollbar pb-1 -mx-1 px-1">
                {TABS.map(({ id, icon: Icon, label }) => (
                    <button key={id} onClick={() => setActiveTab(id)}
                            className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-bold whitespace-nowrap transition"
                            style={{
                              backgroundColor: activeTab === id ? C.green : C.white,
                              color: activeTab === id ? '#fff' : C.g500,
                              border: `1.5px solid ${activeTab === id ? C.green : C.g200}`,
                            }}>
                      <Icon size={13} style={{ flexShrink: 0 }} />
                      {label}
                    </button>
                ))}
                <button onClick={handleLogout}
                        className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-bold whitespace-nowrap"
                        style={{ backgroundColor: '#FEF2F2', color: '#EF4444', border: '1.5px solid #FECACA' }}>
                  <LogOut size={13} style={{ flexShrink: 0 }} />
                  Logout
                </button>
              </div>

              {/* Desktop: vertical sidebar */}
              <div className="hidden md:block bg-white rounded-2xl shadow-sm border overflow-hidden" style={{ borderColor: C.g200 }}>
                {TABS.map(({ id, icon: Icon, label }) => (
                    <button key={id} onClick={() => setActiveTab(id)}
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
                <button onClick={handleLogout}
                        className="w-full flex items-center gap-3 px-4 py-3 text-left transition hover:bg-red-50"
                        style={{ borderTop: `1px solid ${C.g100}` }}>
                  <LogOut size={16} className="text-red-400" />
                  <span className="text-sm font-bold text-red-500">Log Out</span>
                </button>
              </div>
            </div>

            {/* Main content */}
            <div className="flex-1 min-w-0 space-y-5">
              {/* ── ACCOUNT ─────────────────────────────────────────── */}
              {activeTab === 'account' && (
                  <>
                    {/* Account information */}
                    <div className="bg-white rounded-2xl shadow-sm border p-6" style={{ borderColor: C.g200 }}>
                      <h2 className="text-lg font-black mb-5" style={{ color: C.forest }}>Account Information</h2>
                      <form onSubmit={handleAccountUpdate} className="space-y-4">
                        <div className="grid md:grid-cols-2 gap-4">
                          <div>
                            <label className={labelCls} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                              Username {user?.username_changed && <Lock size={12} style={{ color: C.g400 }} />}
                            </label>
                            {user?.username_changed ? (
                                <div className="px-4 py-2.5 border-2 rounded-xl text-sm font-medium flex items-center justify-between"
                                     style={{ borderColor: C.g200, backgroundColor: C.g100, color: C.g500 }}>
                                  <span>{accountForm.username}</span>
                                  <Lock size={13} style={{ color: C.g400 }} />
                                </div>
                            ) : (
                                <input type="text" value={accountForm.username}
                                       onChange={e => setAccountForm({ ...accountForm, username: e.target.value })}
                                       className={inputCls} required style={inputStyle(accountForm.username)} />
                            )}
                            {user?.username_changed ?
                                <p className="text-xs mt-1 flex items-center gap-1" style={{ color: C.g400 }}><Lock size={9} />Username is permanently locked.</p> :
                                <p className="text-xs mt-1 flex items-center gap-1" style={{ color: '#D97706' }}><AlertTriangle size={12} className="inline-block" />You can only change your username once. Choose carefully.</p>
                            }
                          </div>
                          <div>
                            <label className={labelCls} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                              Full Name {kycVerified && <Lock size={12} style={{ color: C.g400 }} />}
                            </label>
                            {kycVerified ? (
                                <div className="px-4 py-2.5 border-2 rounded-xl text-sm font-medium flex items-center justify-between"
                                     style={{ borderColor: C.g200, backgroundColor: C.g100, color: C.g500 }}>
                                  <span>{accountForm.fullName}</span>
                                  <Lock size={13} style={{ color: C.g400 }} />
                                </div>
                            ) : (
                                <input type="text" value={accountForm.fullName}
                                       onChange={e => setAccountForm({ ...accountForm, fullName: e.target.value })}
                                       className={inputCls} style={inputStyle(accountForm.fullName)} />
                            )}
                            {kycVerified ?
                                <p className="text-xs mt-1 flex items-center gap-1" style={{ color: C.g400 }}><Lock size={9} />Locked after ID verification.</p> :
                                <p className="text-xs mt-1" style={{ color: C.g500 }}>ℹ Full name cannot be changed after ID verification.</p>
                            }
                          </div>
                        </div>

                        <div className="grid md:grid-cols-2 gap-4">
                          <div>
                            <label className={labelCls} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              Email Address
                              {emailVerified ?
                                  <span className="text-xs font-black px-2 py-0.5 rounded-full" style={{ backgroundColor: '#ECFDF5', color: C.success }}>✓ Verified</span> :
                                  <span className="text-xs font-black px-2 py-0.5 rounded-full inline-flex items-center gap-1" style={{ backgroundColor: '#FFF7ED', color: C.warn }}><AlertTriangle size={11} className="inline-block" />Unverified</span>}
                            </label>
                            <div className="px-4 py-2.5 border-2 rounded-xl text-sm font-medium flex items-center justify-between"
                                 style={{ borderColor: emailVerified ? '#DCFCE7' : '#FDE68A', backgroundColor: C.g50, color: C.g700 }}>
                              <span className="truncate">{maskEmail(accountForm.email)}</span>
                              {emailVerified ?
                                  <CheckCircle size={14} style={{ color: C.success, flexShrink: 0 }} /> :
                                  <AlertCircle size={14} style={{ color: C.warn, flexShrink: 0 }} />}
                            </div>
                            <p className="text-xs mt-1" style={{ color: C.g400 }}>This is the email used to register. It cannot be changed.</p>
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

                          <div>
                            <label className={labelCls} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              Phone Number
                              {phoneVerified || phoneStep === 'done' ?
                                  <span className="text-xs font-black px-2 py-0.5 rounded-full" style={{ backgroundColor: '#ECFDF5', color: C.success }}>✓ Verified</span> :
                                  accountForm.phone ?
                                      <span className="text-xs font-black px-2 py-0.5 rounded-full inline-flex items-center gap-1" style={{ backgroundColor: '#FFF7ED', color: C.warn }}><AlertTriangle size={11} className="inline-block" />Unverified</span> : null}
                            </label>
                            {phoneVerified || phoneStep === 'done' ? (
                                <div className="px-4 py-2.5 border-2 rounded-xl text-sm font-medium flex items-center justify-between"
                                     style={{ borderColor: '#DCFCE7', backgroundColor: C.g50, color: C.g700 }}>
                                  <span>{accountForm.phone || 'Your number has been verified'}</span>
                                  <CheckCircle size={14} style={{ color: C.success, flexShrink: 0 }} />
                                </div>
                            ) : (
                                <input type="tel" value={accountForm.phone}
                                       onChange={e => setAccountForm({ ...accountForm, phone: e.target.value })}
                                       placeholder="+[country code] your number — e.g. +233XXXXXXXXX"
                                       className={inputCls} style={inputStyle(accountForm.phone)} />
                            )}
                            {phoneVerified || phoneStep === 'done' ?
                                <p className="text-xs mt-1 flex items-center gap-1" style={{ color: C.g400 }}><Lock size={9} />Phone number locked after verification.</p> :
                                <p className="text-xs mt-1" style={{ color: C.g400 }}>Go to the Verification tab to verify your phone number instantly.</p>}
                          </div>
                        </div>

                        {(() => {
                          const locationLocked = kycVerified || !!(user?.is_id_verified || user?.kyc_verified || user?.kyc_status === 'approved');
                          return (
                              <div>
                                <label className={labelCls} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                  Location {locationLocked && <Lock size={12} style={{ color: C.g400 }} />}
                                </label>
                                {locationLocked ? (
                                    <div className="px-4 py-2.5 border-2 rounded-xl text-sm font-medium flex items-center justify-between"
                                         style={{ borderColor: C.g200, backgroundColor: C.g100, color: C.g500 }}>
                                      <span>{accountForm.location || '—'}</span>
                                      <Lock size={13} style={{ color: C.g400 }} />
                                    </div>
                                ) : (
                                    <input type="text" value={accountForm.location}
                                           onChange={e => setAccountForm({ ...accountForm, location: e.target.value })}
                                           placeholder="e.g. Accra, Ghana"
                                           className={inputCls} style={inputStyle(accountForm.location)} />
                                )}
                                {locationLocked ?
                                    <p className="text-xs mt-1 flex items-center gap-1" style={{ color: C.g400 }}><Lock size={9} />Location locked after ID verification.</p> :
                                    <p className="text-xs mt-1" style={{ color: C.g500 }}>ℹ Location will be locked once your ID is verified.</p>
                                }
                              </div>
                          );
                        })()}

                        <div>
                          <label className={labelCls}>Bio <span className="font-normal text-gray-400">(optional)</span></label>
                          <textarea
                              value={accountForm.bio}
                              onChange={e => {
                                const val = e.target.value;
                                const wc = val.trim() === '' ? 0 : val.trim().split(/\s+/).length;
                                if (wc <= 100) setAccountForm({ ...accountForm, bio: val });
                              }}
                              placeholder="Tell traders a bit about yourself… (max 100 words)"
                              rows={2}
                              className={inputCls + " resize-none"} style={inputStyle(accountForm.bio)} />
                          <p className="text-xs mt-0.5 text-right"
                             style={{ color: (accountForm.bio || '').trim() === '' ? C.g400 : (accountForm.bio || '').trim().split(/\s+/).length >= 100 ? C.danger : C.g400 }}>
                            {(accountForm.bio || '').trim() === '' ? 0 : (accountForm.bio || '').trim().split(/\s+/).length}/100 words
                          </p>
                        </div>

                        <button type="submit" disabled={loading}
                                className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-white font-bold text-sm hover:opacity-90 disabled:opacity-50"
                                style={{ backgroundColor: C.green }}>
                          {loading ? <><RefreshCw size={15} className="animate-spin" /> Saving…</> : <><Save size={15} /> Save Changes</>}
                        </button>
                      </form>
                    </div>

                    {/* Name display preferences */}
                    <div className="bg-white rounded-2xl shadow-sm border p-6" style={{ borderColor: C.g200 }}>
                      <h2 className="text-lg font-black mb-1" style={{ color: C.forest }}>Name Display</h2>
                      <p className="text-xs text-gray-400 mb-4">How your name appears to other traders on the platform</p>

                      <div className="space-y-2 mb-4">
                        {(() => {
                          const full = accountForm.fullName || user?.full_name || '';
                          const initial = full ? full.trim().split(/\s+/).map((w, i) => i === 0 ? w : w[0] + '.').join(' ') : 'Samuel K.';
                          return [
                            { val: 'full', label: 'Show full name', desc: 'Your full name is visible to all traders', example: full || 'Samuel Kwame' },
                            { val: 'initial', label: 'Show first name and last initial', desc: 'Only first name + last initial shown', example: initial },
                            { val: 'hide', label: 'Hide full name', desc: 'Only your username is shown', example: accountForm.username || user?.username || 'samuel123' },
                          ];
                        })().map(({ val, label, desc, example }) => (
                            <label key={val} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition ${prefs.nameDisplay === val ? 'border-green-300 bg-green-50' : 'border-gray-100 hover:border-gray-200'}`}>
                              <input type="radio" name="nameDisplay" value={val} checked={prefs.nameDisplay === val}
                                     onChange={() => setPrefs(p => ({ ...p, nameDisplay: val }))}
                                     className="accent-green-600" />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-gray-800">{label}</p>
                                <p className="text-xs text-gray-500">{desc}</p>
                              </div>
                              <span className="text-xs font-mono px-2 py-0.5 rounded-lg flex-shrink-0" style={{ backgroundColor: C.g100, color: C.g600 }}>{example}</span>
                            </label>
                        ))}
                      </div>

                      <div className="mb-4 px-4 py-3 rounded-xl border" style={{ backgroundColor: C.mist, borderColor: C.g200 }}>
                        <p className="text-xs font-bold mb-1" style={{ color: C.g500 }}>Preview — what traders see:</p>
                        <p className="text-sm font-black" style={{ color: C.forest }}>
                          {(() => {
                            const full = accountForm.fullName || user?.full_name || '';
                            const username = accountForm.username || user?.username || '';
                            if (prefs.nameDisplay === 'hide' || !full) return username;
                            if (prefs.nameDisplay === 'initial') {
                              const parts = full.trim().split(/\s+/);
                              return parts.length < 2 ? full : parts[0] + ' ' + parts.slice(1).map(p => p[0] + '.').join(' ');
                            }
                            return full;
                          })()}
                        </p>
                      </div>

                      <button onClick={saveNameDisplay} disabled={nameDisplaySaving}
                              className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-white font-bold text-sm hover:opacity-90 disabled:opacity-50 transition"
                              style={{ backgroundColor: nameDisplaySaved ? C.success : C.green }}>
                        {nameDisplaySaving ? <><RefreshCw size={15} className="animate-spin" /> Saving…</> :
                            nameDisplaySaved ? <><CheckCircle size={15} /> Saved!</> :
                                <><Save size={15} /> Save Name Display</>}
                      </button>
                    </div>
                  </>
              )}

              {/* ── VERIFICATION ────────────────────────────────────── */}
              {activeTab === 'verification' && (
                  <div className="space-y-4 max-w-2xl">
                    {verificationSyncing && (
                        <div className="bg-white rounded-2xl border p-10 flex items-center justify-center gap-3" style={{ borderColor: C.g200 }}>
                          <RefreshCw size={18} className="animate-spin" style={{ color: C.green }} />
                          <span className="text-sm font-bold" style={{ color: C.g500 }}>Loading verification status…</span>
                        </div>
                    )}
                    {!verificationSyncing && <>
                      <div className="rounded-2xl p-5 border"
                           style={{ background: verLevel === 3 ? `linear-gradient(135deg,${C.success},${C.mint})` : `linear-gradient(135deg,${C.forest},${C.green})`, borderColor: 'transparent' }}>
                        <div className="flex items-center gap-3 mb-3">
                          <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}>
                            <Shield size={24} className="text-white" />
                          </div>
                          <div>
                            <p className="text-white font-black text-lg">Verification Level {verLevel}/3</p>
                            <p className="text-white/70 text-xs">
                              {verLevel === 3 ? <><CheckCircle size={13} className="inline-block mr-1" />Fully verified — maximum trade limits</> :
                                  verLevel === 2 ? <><Zap size={13} className="inline-block mr-1" />KYC required for higher limits</> :
                                      verLevel === 1 ? <><AlertTriangle size={13} className="inline-block mr-1" />Add phone to unlock more features</> :
                                          <><Circle size={10} fill="#EF4444" strokeWidth={0} className="inline-block mr-1" />Start verification to begin trading</>}
                            </p>
                          </div>
                          <div className="ml-auto text-right">
                            <p className="text-white/70 text-xs mb-1">Trade limit</p>
                            <p className="text-white font-black text-sm">
                              {verLevel >= 3 ? 'Unlimited' : verLevel >= 2 ? '$2,000' : verLevel >= 1 ? '$500' : '$100'}
                            </p>
                          </div>
                        </div>
                        <div className="w-full h-2 rounded-full bg-white/20">
                          <div className="h-2 rounded-full transition-all" style={{ width: `${(verLevel / 3) * 100}%`, backgroundColor: C.gold }} />
                        </div>
                      </div>

                      <div className="space-y-3">
                        {(() => {
                          const underReview = !emailVerified && emailResendCount >= 3;
                          return (
                              <div className={`p-4 rounded-xl border transition ${emailVerified ? 'bg-green-50 border-green-200' : underReview ? 'bg-amber-50 border-amber-200' : 'border-blue-200 bg-blue-50'}`}>
                                <div className="flex items-start gap-4">
                                  <div className={`w-9 h-9 rounded-full flex items-center justify-center font-black text-sm flex-shrink-0 ${emailVerified ? 'bg-green-500 text-white' : underReview ? 'bg-amber-400 text-white' : 'bg-blue-500 text-white'}`}>
                                    {emailVerified ? <CheckCircle size={18} /> : underReview ? <Clock size={18} /> : 1}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <p className={`font-bold text-sm ${emailVerified ? 'text-green-800' : underReview ? 'text-amber-800' : 'text-blue-800'}`}>Email Verification</p>
                                      <span className={`text-xs font-black px-2 py-0.5 rounded-full ${emailVerified ? 'bg-green-200 text-green-800' : underReview ? 'bg-amber-200 text-amber-800' : 'bg-blue-200 text-blue-800'}`}>
                                  {emailVerified ? '✓ Verified' : underReview ? <><Clock size={11} className="inline-block mr-1" />Under Review</> : 'Basic'}
                                </span>
                                    </div>
                                    <p className={`text-xs mt-0.5 ${emailVerified ? 'text-green-600' : underReview ? 'text-amber-700' : 'text-blue-600'}`}>
                                      {emailVerified ? `${maskEmail(accountForm.email)} is verified ✓` : underReview ? 'Being reviewed by our team' : 'Verify your email address to start trading'}
                                    </p>

                                    {underReview && (
                                        <div className="mt-3 rounded-xl border overflow-hidden" style={{ borderColor: '#FDE68A' }}>
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
                                    )}

                                    {!emailVerified && !underReview && (
                                        <div className="mt-3 space-y-2">
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
                                                <p className="text-xs" style={{ color: '#1e40af' }}>Code sent! Check your inbox and spam folder:</p>
                                                <div className="flex gap-2 flex-wrap items-center">
                                                  <input type="text" inputMode="numeric" maxLength={6}
                                                         placeholder="000000" value={emailCode}
                                                         onChange={e => setEmailCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                                         className="px-3 py-2 border-2 rounded-xl text-sm font-black focus:outline-none w-36"
                                                         style={{ borderColor: '#3b82f6', letterSpacing: '0.2em', color: C.g800 }} />
                                                  <button onClick={handleVerifyEmailCode}
                                                          disabled={emailVerifyStep === 'verifying' || emailCode.length < 6}
                                                          className="px-4 py-2 rounded-xl text-white text-xs font-black disabled:opacity-50"
                                                          style={{ backgroundColor: C.success }}>
                                                    {emailVerifyStep === 'verifying' ? 'Verifying…' : '✓ Verify'}
                                                  </button>
                                                  <button onClick={() => { setEmailVerifyStep('idle'); setEmailCode(''); }}
                                                          className="text-xs underline text-gray-400">Resend</button>
                                                </div>
                                              </>
                                          )}
                                        </div>
                                    )}
                                  </div>
                                  {emailVerified ?
                                      <CheckCircle size={16} className="text-green-500 flex-shrink-0 mt-0.5" /> :
                                      underReview ? <Clock size={16} style={{ color: '#D97706', flexShrink: 0, marginTop: 2 }} /> :
                                          <span className="text-xs font-bold text-blue-600 flex-shrink-0 mt-0.5">Required →</span>}
                                </div>
                              </div>
                          );
                        })()}

                        {(() => {
                          const done = phoneVerified || phoneStep === 'done';
                          return (
                              <div className={`p-4 rounded-xl border transition ${done ? 'bg-green-50 border-green-200' : emailVerified ? 'border-blue-200 bg-blue-50' : 'bg-gray-50 border-gray-100'}`}>
                                <div className="flex items-start gap-4">
                                  <div className={`w-9 h-9 rounded-full flex items-center justify-center font-black text-sm flex-shrink-0 ${done ? 'bg-green-500 text-white' : emailVerified ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-500'}`}>
                                    {done ? <CheckCircle size={18} /> : 2}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <p className={`font-bold text-sm ${done ? 'text-green-800' : emailVerified ? 'text-blue-800' : 'text-gray-600'}`}>Phone Number</p>
                                      <span className={`text-xs font-black px-2 py-0.5 rounded-full ${done ? 'bg-green-200 text-green-800' : 'bg-gray-200 text-gray-600'}`}>
                                  {done ? '✓ Verified' : 'Not Verified'}
                                </span>
                                    </div>
                                    <p className={`text-xs mt-0.5 ${done ? 'text-green-600' : emailVerified ? 'text-blue-600' : 'text-gray-400'}`}>
                                      {done ? accountForm.phone ? `${accountForm.phone} — verified ✓` : 'Phone verified — you can now trade up to $2,000 ✓' :
                                          'Add your phone number to unlock the $2,000 trade limit'}
                                    </p>

                                    {!done && emailVerified && (
                                        <div className="mt-3 space-y-2">
                                          {phoneStep === 'idle' && (
                                              <>
                                                <input type="tel" placeholder="+233 XX XXX XXXX" value={accountForm.phone || ''}
                                                       onChange={e => setAccountForm({ ...accountForm, phone: e.target.value })}
                                                       className="w-full px-3 py-2 border-2 rounded-xl text-sm focus:outline-none"
                                                       style={{ borderColor: accountForm.phone ? C.green : C.g200, color: C.g800, backgroundColor: 'white' }} />
                                                <p className="text-xs font-bold" style={{ color: '#1e40af' }}>How would you like to receive your code?</p>
                                                <div className="flex gap-2">
                                                  <button onClick={() => setPhoneOtpMethod('email')}
                                                          className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl border-2 text-xs font-black transition ${phoneOtpMethod === 'email' ? 'border-blue-500 bg-blue-50 text-blue-800' : 'border-gray-200 bg-white text-gray-500'}`}>
                                                    <Mail size={12} /> Email
                                                  </button>
                                                  <button onClick={() => setPhoneOtpMethod('sms')}
                                                          className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl border-2 text-xs font-black transition ${phoneOtpMethod === 'sms' ? 'border-orange-500 bg-orange-50 text-orange-800' : 'border-gray-200 bg-white text-gray-500'}`}>
                                                    <Smartphone size={12} /> SMS
                                                  </button>
                                                  <button onClick={() => setPhoneOtpMethod('whatsapp')}
                                                          className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl border-2 text-xs font-black transition ${phoneOtpMethod === 'whatsapp' ? 'border-green-500 bg-green-50 text-green-800' : 'border-gray-200 bg-white text-gray-500'}`}>
                                                    <MessageCircle size={12} /> WhatsApp
                                                  </button>
                                                </div>
                                                <button onClick={handleSendPhoneOtp} disabled={!accountForm.phone}
                                                        className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-xs font-black disabled:opacity-60"
                                                        style={{ backgroundColor: C.paid }}>
                                                  <Smartphone size={13} /> Send Verification Code →
                                                </button>
                                              </>
                                          )}

                                          {phoneStep === 'sending' && (
                                              <div className="flex items-center gap-2 text-xs font-bold" style={{ color: '#1e40af' }}>
                                                <RefreshCw size={13} className="animate-spin" /> Sending your code…
                                              </div>
                                          )}

                                          {(phoneStep === 'otp' || phoneStep === 'verifying') && (
                                              <>
                                                <p className="text-xs" style={{ color: '#1e40af' }}>
                                                  {phoneOtpMethod === 'email' ? 'Code sent to your email — check inbox and spam folder:' :
                                                      phoneOtpMethod === 'sms' ? `Code sent via SMS to ${accountForm.phone}:` :
                                                          `Code sent via WhatsApp to ${accountForm.phone}:`}
                                                </p>
                                                <div className="flex gap-2 flex-wrap items-center">
                                                  <input type="text" inputMode="numeric" maxLength={6}
                                                         placeholder="000000" value={phoneOtpCode}
                                                         onChange={e => setPhoneOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                                         className="px-3 py-2 border-2 rounded-xl text-sm font-black focus:outline-none w-36"
                                                         style={{ borderColor: '#3b82f6', letterSpacing: '0.2em', color: C.g800 }} autoFocus />
                                                  <button onClick={handleVerifyPhoneOtp}
                                                          disabled={phoneStep === 'verifying' || phoneOtpCode.length < 6}
                                                          className="px-4 py-2 rounded-xl text-white text-xs font-black disabled:opacity-50"
                                                          style={{ backgroundColor: C.success }}>
                                                    {phoneStep === 'verifying' ? 'Verifying…' : '✓ Verify'}
                                                  </button>
                                                  <button onClick={() => { setPhoneStep('idle'); setPhoneOtpCode(''); }}
                                                          className="text-xs underline text-gray-400">Resend</button>
                                                </div>
                                              </>
                                          )}
                                        </div>
                                    )}

                                    {!done && !emailVerified && (
                                        <p className="text-xs mt-2 font-bold" style={{ color: '#94a3b8' }}>Complete email verification first (Step 1).</p>
                                    )}
                                  </div>
                                  {done ? <CheckCircle size={16} className="text-green-500 flex-shrink-0 mt-0.5" /> :
                                      emailVerified ? null : <Clock size={16} className="text-gray-300 flex-shrink-0 mt-0.5" />}
                                </div>
                              </div>
                          );
                        })()}

                        {(() => {
                          const kycPending = (kycSubmitted || kycStatus === 'pending') && !kycVerified;
                          const kycRejected = kycStatus === 'rejected' && !kycVerified;
                          const displayType = kycSubmittedType || kycIdType;
                          const typeLabel = KYC_ID_TYPES.find(t => t.value === displayType)?.label || 'Government ID';
                          const submittedAgo = kycSubmittedAt ? (() => {
                            const s = (Date.now() - new Date(kycSubmittedAt)) / 1000;
                            if (s < 3600) return `${Math.floor(s / 60)}m ago`;
                            if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
                            return `${Math.floor(s / 86400)}d ago`;
                          })() : null;
                          return (
                              <div className={`p-4 rounded-xl border transition ${kycVerified ? 'bg-green-50 border-green-200' : kycRejected ? 'bg-red-50 border-red-200' : kycPending ? 'bg-amber-50 border-amber-200' : phoneVerified ? 'border-blue-200 bg-blue-50' : 'bg-gray-50 border-gray-100'}`}>
                                <div className="flex items-start gap-4">
                                  <div className={`w-9 h-9 rounded-full flex items-center justify-center font-black text-sm flex-shrink-0 ${kycVerified ? 'bg-green-500 text-white' : kycRejected ? 'bg-red-500 text-white' : kycPending ? 'bg-amber-400 text-white' : phoneVerified ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-500'}`}>
                                    {kycVerified ? <CheckCircle size={18} /> : kycPending ? <Clock size={18} /> : kycRejected ? '✕' : 3}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <p className={`font-bold text-sm ${kycVerified ? 'text-green-800' : kycRejected ? 'text-red-800' : kycPending ? 'text-amber-800' : phoneVerified ? 'text-blue-800' : 'text-gray-600'}`}>Identity (KYC)</p>
                                      <span className={`text-xs font-black px-2 py-0.5 rounded-full ${kycVerified ? 'bg-green-200 text-green-800' : kycRejected ? 'bg-red-200 text-red-800' : kycPending ? 'bg-amber-200 text-amber-800' : 'bg-gray-200 text-gray-600'}`}>
                                  {kycVerified ? '✓ Verified' : kycRejected ? '✗ Rejected' : kycPending ? <><Clock size={11} className="inline-block mr-1" />Under Review</> : 'Advanced'}
                                </span>
                                    </div>
                                    <p className={`text-xs mt-0.5 ${kycVerified ? 'text-green-600' : kycRejected ? 'text-red-600' : kycPending ? 'text-amber-700' : phoneVerified ? 'text-blue-600' : 'text-gray-400'}`}>
                                      {kycVerified ? 'Identity verified — unlimited trading unlocked ✓' :
                                          kycRejected ? 'Your documents were not accepted — please re-submit' :
                                              kycPending ? 'Documents received and under review by our team' :
                                                  'Upload your government ID (front + back) for unlimited trading'}
                                    </p>

                                    {kycPending && (
                                        <div className="mt-3 rounded-xl border overflow-hidden" style={{ borderColor: '#FDE68A' }}>
                                          <div className="px-4 py-2.5 flex items-center gap-2" style={{ backgroundColor: '#FEF3C7', borderBottom: '1px solid #FDE68A' }}>
                                            <Clock size={13} style={{ color: '#D97706', flexShrink: 0 }} />
                                            <p className="text-xs font-black" style={{ color: '#92400E' }}>Documents Under Review</p>
                                            <span className="ml-auto text-xs font-black px-2 py-0.5 rounded-full animate-pulse inline-flex items-center gap-1" style={{ backgroundColor: '#FCD34D', color: '#78350F' }}><Clock size={10} className="inline-block" />Pending</span>
                                          </div>
                                          <div className="px-4 py-3 space-y-2" style={{ backgroundColor: '#FFFBEB' }}>
                                            {displayType && (
                                                <div className="flex items-center gap-2">
                                                  <CheckCircle size={12} style={{ color: '#D97706', flexShrink: 0 }} />
                                                  <span className="text-xs font-semibold" style={{ color: '#92400E' }}>Document: {typeLabel}</span>
                                                </div>
                                            )}
                                            <div className="flex items-center gap-2">
                                              <CheckCircle size={12} style={{ color: '#D97706', flexShrink: 0 }} />
                                              <span className="text-xs font-semibold" style={{ color: '#92400E' }}>ID front uploaded ✓</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                              <CheckCircle size={12} style={{ color: '#D97706', flexShrink: 0 }} />
                                              <span className="text-xs font-semibold" style={{ color: '#92400E' }}>ID back uploaded ✓</span>
                                            </div>
                                            {submittedAgo && (
                                                <div className="flex items-center gap-2">
                                                  <Clock size={12} style={{ color: '#D97706', flexShrink: 0 }} />
                                                  <span className="text-xs font-semibold" style={{ color: '#92400E' }}>Submitted {submittedAgo}</span>
                                                </div>
                                            )}
                                            <p className="text-xs leading-relaxed pt-1" style={{ color: '#78350F' }}>
                                              Our team reviews documents within <strong>24 hours</strong>. You will receive an in-app notification when approved or if we need more information.
                                            </p>
                                            <a href="mailto:hello@praqen.com" className="inline-flex items-center gap-1.5 text-xs font-black" style={{ color: '#D97706' }}>
                                              <Mail size={11} /> hello@praqen.com
                                            </a>
                                          </div>
                                        </div>
                                    )}

                                    {kycRejected && (
                                        <div className="mt-3 rounded-xl border overflow-hidden" style={{ borderColor: '#FCA5A5' }}>
                                          <div className="px-4 py-2.5 flex items-center gap-2" style={{ backgroundColor: '#FEF2F2', borderBottom: '1px solid #FCA5A5' }}>
                                            <X size={14} style={{ color: '#991B1B' }} />
                                            <p className="text-xs font-black" style={{ color: '#991B1B' }}>KYC Not Approved</p>
                                            <span className="ml-auto text-xs font-black px-2 py-0.5 rounded-full" style={{ backgroundColor: '#FCA5A5', color: '#7F1D1D' }}>Rejected</span>
                                          </div>
                                          <div className="px-4 py-3 space-y-2" style={{ backgroundColor: '#FFF5F5' }}>
                                            {kycRejectedReason && (
                                                <p className="text-xs font-semibold leading-relaxed" style={{ color: '#991B1B' }}>Reason: {kycRejectedReason}</p>
                                            )}
                                            <p className="text-xs leading-relaxed" style={{ color: '#7F1D1D' }}>Please re-submit your documents with clearer, well-lit photos. Make sure all text on the ID is readable.</p>
                                            <button onClick={() => { setKycStatus(null); setKycSubmitted(false); setKycStep('select'); setKycFiles({ front: null, back: null }); setKycIdType(''); localStorage.removeItem('praqen_kyc'); }}
                                                    className="w-full mt-1 py-2 rounded-xl text-xs font-black" style={{ backgroundColor: '#EF4444', color: '#fff' }}>
                                              Re-submit KYC Documents
                                            </button>
                                          </div>
                                        </div>
                                    )}

                                    {!kycVerified && !kycPending && kycStatus !== 'approved' && phoneVerified && (
                                        <div className="mt-4 space-y-4">
                                          <div className={`rounded-xl border-2 p-4 transition ${kycIdType ? 'border-green-300 bg-green-50' : 'border-dashed border-gray-200 bg-gray-50'}`}>
                                            <div className="flex items-center gap-2 mb-2">
                                              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black flex-shrink-0 ${kycIdType ? 'bg-green-500 text-white' : 'bg-blue-500 text-white'}`}>
                                                {kycIdType ? '✓' : '1'}
                                              </div>
                                              <p className="text-xs font-black text-gray-700">Select your ID type</p>
                                            </div>
                                            <select value={kycIdType} onChange={e => { setKycIdType(e.target.value); if (e.target.value) setKycStep('upload_id'); setKycFiles({ front: null, back: null }); }}
                                                    className="w-full px-3 py-2.5 border-2 rounded-xl text-sm font-semibold focus:outline-none transition"
                                                    style={{ borderColor: kycIdType ? C.success : C.g200, color: C.g800, backgroundColor: 'white' }}>
                                              <option value="">— Choose a document type —</option>
                                              {KYC_ID_TYPES.map(({ value, label }) => (
                                                  <option key={value} value={value}>{label}</option>
                                              ))}
                                            </select>
                                          </div>

                                          {kycIdType && (
                                              <div className={`rounded-xl border-2 p-4 transition ${kycFiles.front ? 'border-green-300 bg-green-50' : 'border-dashed border-blue-200 bg-blue-50'}`}>
                                                <div className="flex items-center gap-2 mb-2">
                                                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black flex-shrink-0 ${kycFiles.front ? 'bg-green-500 text-white' : 'bg-blue-500 text-white'}`}>
                                                    {kycFiles.front ? '✓' : '2'}
                                                  </div>
                                                  <div>
                                                    <p className="text-xs font-black text-gray-700">Front of {KYC_ID_TYPES.find(t => t.value === kycIdType)?.label}</p>
                                                    <p className="text-xs text-gray-400">Clear photo showing your name, photo and ID number</p>
                                                  </div>
                                                </div>
                                                <div className="mb-2 px-3 py-2 rounded-lg text-xs" style={{ backgroundColor: '#EFF6FF', color: '#1D4ED8', border: '1px solid #BFDBFE' }}>
                                                  <CheckCircle size={12} className="inline-block mr-1" />Make sure the <strong>entire card is visible</strong>, all text is readable, and there is <strong>no glare or blur</strong>
                                                </div>
                                                <label className="flex items-center gap-3 px-4 py-3 rounded-xl border-2 border-dashed cursor-pointer hover:border-blue-400 transition bg-white"
                                                       style={{ borderColor: kycFiles.front ? C.success : '#93C5FD' }}>
                                                  <Upload size={18} style={{ color: kycFiles.front ? C.success : '#3B82F6', flexShrink: 0 }} />
                                                  <div className="flex-1 min-w-0">
                                                    <p className="text-xs font-bold" style={{ color: kycFiles.front ? C.success : '#1D4ED8' }}>
                                                      {kycFiles.front ? `✓ ${kycFiles.front.name}` : 'Tap to upload FRONT of ID'}
                                                    </p>
                                                    {!kycFiles.front && <p className="text-xs text-gray-400">Max 10MB · JPG or PNG</p>}
                                                  </div>
                                                  {kycFiles.front && (
                                                      <button type="button" onClick={e => { e.preventDefault(); setKycFiles(f => ({ ...f, front: null })); }}
                                                              className="text-xs text-red-400 font-bold hover:text-red-600">Remove</button>
                                                  )}
                                                  <input type="file" accept="image/*" className="hidden"
                                                         onChange={e => { const f = e.target.files[0] || null; setKycFiles(prev => ({ ...prev, front: f })); if (f) setKycStep('upload_back'); }} />
                                                </label>
                                              </div>
                                          )}

                                          {kycIdType && kycFiles.front && (
                                              <div className={`rounded-xl border-2 p-4 transition ${kycFiles.back ? 'border-green-300 bg-green-50' : 'border-dashed border-orange-200 bg-orange-50'}`}>
                                                <div className="flex items-center gap-2 mb-2">
                                                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black flex-shrink-0 ${kycFiles.back ? 'bg-green-500 text-white' : 'bg-orange-500 text-white'}`}>
                                                    {kycFiles.back ? '✓' : '3'}
                                                  </div>
                                                  <div>
                                                    <p className="text-xs font-black text-gray-700">Back of {KYC_ID_TYPES.find(t => t.value === kycIdType)?.label}</p>
                                                    <p className="text-xs text-gray-400">Clear photo of the reverse side of your ID</p>
                                                  </div>
                                                </div>
                                                <div className="mb-2 px-3 py-2 rounded-lg text-xs" style={{ backgroundColor: '#FFF7ED', color: '#C2410C', border: '1px solid #FED7AA' }}>
                                                  <CheckCircle size={12} className="inline-block mr-1" />Flip your ID and photograph the <strong>back side</strong> — all details must be <strong>clear and unobstructed</strong>
                                                </div>
                                                <label className="flex items-center gap-3 px-4 py-3 rounded-xl border-2 border-dashed cursor-pointer hover:border-orange-400 transition bg-white"
                                                       style={{ borderColor: kycFiles.back ? C.success : '#FDBA74' }}>
                                                  <Upload size={18} style={{ color: kycFiles.back ? C.success : '#EA580C', flexShrink: 0 }} />
                                                  <div className="flex-1 min-w-0">
                                                    <p className="text-xs font-bold" style={{ color: kycFiles.back ? C.success : '#9A3412' }}>
                                                      {kycFiles.back ? `✓ ${kycFiles.back.name}` : 'Tap to upload BACK of ID'}
                                                    </p>
                                                    {!kycFiles.back && <p className="text-xs text-gray-400">Max 10MB · JPG or PNG</p>}
                                                  </div>
                                                  {kycFiles.back && (
                                                      <button type="button" onClick={e => { e.preventDefault(); setKycFiles(f => ({ ...f, back: null })); }}
                                                              className="text-xs text-red-400 font-bold hover:text-red-600">Remove</button>
                                                  )}
                                                  <input type="file" accept="image/*" className="hidden"
                                                         onChange={e => { const f = e.target.files[0] || null; setKycFiles(prev => ({ ...prev, back: f })); if (f) setKycStep('ready'); }} />
                                                </label>
                                              </div>
                                          )}

                                          {kycStep === 'processing' && (
                                              <div className="rounded-xl border-2 border-blue-200 bg-blue-50 p-5 text-center">
                                                <RefreshCw size={28} className="animate-spin mx-auto mb-2 text-blue-500" />
                                                <p className="text-sm font-black text-blue-800">Processing your documents…</p>
                                                <p className="text-xs text-blue-600 mt-1">Securely uploading and encrypting your files</p>
                                              </div>
                                          )}

                                          {kycIdType && kycFiles.front && kycFiles.back && kycStep !== 'processing' && (
                                              <div className="rounded-xl border-2 border-green-200 bg-green-50 p-4">
                                                <div className="flex items-center gap-2 mb-3">
                                                  <CheckCircle size={16} className="text-green-600 flex-shrink-0" />
                                                  <p className="text-xs font-black text-green-800">All documents uploaded — ready to submit</p>
                                                </div>
                                                <div className="space-y-1 mb-4">
                                                  <div className="flex items-center gap-2 text-xs text-green-700">
                                                    <CheckCircle size={11} className="text-green-500 flex-shrink-0" />
                                                    <span>{KYC_ID_TYPES.find(t => t.value === kycIdType)?.label} selected</span>
                                                  </div>
                                                  <div className="flex items-center gap-2 text-xs text-green-700">
                                                    <CheckCircle size={11} className="text-green-500 flex-shrink-0" />
                                                    <span>ID front: {kycFiles.front.name}</span>
                                                  </div>
                                                  <div className="flex items-center gap-2 text-xs text-green-700">
                                                    <CheckCircle size={11} className="text-green-500 flex-shrink-0" />
                                                    <span>ID back: {kycFiles.back.name}</span>
                                                  </div>
                                                </div>
                                                <button onClick={handleKycSubmit} disabled={kycLoading}
                                                        className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-white text-sm font-black disabled:opacity-50 transition hover:opacity-90"
                                                        style={{ backgroundColor: C.green }}>
                                                  <Shield size={15} />
                                                  Submit for Review — Secure &amp; Encrypted
                                                </button>
                                                <p className="text-xs text-gray-400 text-center mt-2">We typically review within 24 hours</p>
                                              </div>
                                          )}
                                        </div>
                                    )}
                                  </div>
                                  {kycVerified ? <CheckCircle size={16} className="text-green-500 flex-shrink-0 mt-0.5" /> :
                                      kycPending ? <Clock size={16} style={{ color: '#D97706', flexShrink: 0, marginTop: 2 }} /> :
                                          phoneVerified ? null : <Clock size={16} className="text-gray-300 flex-shrink-0 mt-0.5" />}
                                </div>
                              </div>
                          );
                        })()}
                      </div>
                    </>}
                  </div>
              )}

              {/* ── SECURITY ────────────────────────────────────────── */}
              {activeTab === 'security' && (
                  <div className="space-y-5">
                    <div className="bg-white rounded-2xl shadow-sm border p-5 md:p-6" style={{ borderColor: C.g200 }}>
                      <h2 className="text-lg font-black mb-4" style={{ color: C.forest }}>Account Security</h2>
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
                      <h2 className="text-lg font-black mb-5" style={{ color: C.forest }}>Change Password</h2>
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

                    <div className="bg-white rounded-2xl shadow-sm border p-6" style={{ borderColor: C.g200 }}>
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
                      </div>
                    </div>
                  </div>
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
                      <PushEnableCard />

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
        <footer style={{ backgroundColor: C.forest }}>
          <div className="max-w-5xl mx-auto px-4 pt-10 pb-6">
            <div className="grid md:grid-cols-3 gap-8 mb-6">
              <div>
              <span className="text-xl font-black" style={{ fontFamily: "'Syne',sans-serif" }}>
                <span className="text-white">PRA</span><span style={{ color: C.gold }}>QEN</span>
              </span>
                <p className="text-xs leading-relaxed my-3" style={{ color: 'rgba(255,255,255,0.4)' }}>
                  The world's most trusted P2P Bitcoin platform. Escrow-protected. 0.5% fee only.
                </p>
                <div className="flex gap-2 flex-wrap">
                  {[
                    { label: 'TikTok', href: 'https://www.tiktok.com/@praqen', bg: 'rgba(0,0,0,0.55)', color: '#ffffff', d: 'M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z' },
                    { label: 'Instagram', href: 'https://www.instagram.com/praqen?igsh=MTRkZWg2amp5YnJlYQ%3D%3D&utm_source=qr', bg: 'rgba(228,64,95,0.3)', color: '#E4405F', d: 'M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z' },
                    { label: 'X (Twitter)', href: 'https://x.com/praqenapp?s=21', bg: 'rgba(255,255,255,0.12)', color: '#ffffff', d: 'M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z' },
                    { label: 'Discord', href: 'https://discord.gg/V6zCZxfdy', bg: 'rgba(88,101,242,0.35)', color: '#5865F2', d: 'M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z' },
                    { label: 'LinkedIn', href: 'https://www.linkedin.com/in/pra-qen-045373402/', bg: 'rgba(10,102,194,0.35)', color: '#0A66C2', d: 'M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z' },
                  ].map(({ label, href, bg, color, d }) => (
                      <a key={label} href={href} target="_blank" rel="noopener noreferrer" title={label}
                         className="w-8 h-8 rounded-lg flex items-center justify-center hover:scale-110 transition-transform"
                         style={{ backgroundColor: bg }}>
                        <svg viewBox="0 0 24 24" width="15" height="15" fill={color} aria-hidden="true"><path d={d} /></svg>
                      </a>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-white font-black text-sm mb-3">Account</p>
                <div className="space-y-2">
                  {[['Profile', '/profile'], ['My Trades', '/my-trades'], ['My Listings', '/my-listings'], ['Wallet', '/wallet'], ['Dashboard', '/dashboard'], ['Blog', '/blog'], ['Privacy', '/privacy'], ['Terms', '/terms']].map(([l, h]) => (
                      <a key={l} href={h} className="block text-xs hover:text-white transition" style={{ color: 'rgba(255,255,255,0.4)' }}>{l}</a>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-white font-black text-sm mb-3">Support</p>
                <div className="space-y-2">
                  {[['Discord', 'https://discord.gg/V6zCZxfdy'], ['hello@praqen.com', 'mailto:hello@praqen.com']].map(([l, h]) => (
                      <a key={l} href={h} target="_blank" rel="noopener noreferrer" className="block text-xs hover:text-white transition" style={{ color: 'rgba(255,255,255,0.4)' }}>{l}</a>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex flex-col md:flex-row items-center justify-between gap-2 pt-4 border-t" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>© {new Date().getFullYear()} PRAQEN. All rights reserved.</p>
              <p className="text-xs flex items-center gap-1" style={{ color: 'rgba(255,255,255,0.3)' }}>
                <Shield size={10} /> Escrow Protected · 0.5% fee on completion only
              </p>
            </div>
          </div>
        </footer>
      </div>
  );
}