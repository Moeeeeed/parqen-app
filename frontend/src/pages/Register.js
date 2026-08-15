import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import SEO from '../components/SEO';
import axios from 'axios';
import { API_URL } from '../App';
import {
  Mail, Lock, User, Eye, EyeOff, Shield, CheckCircle,
  ArrowRight, ArrowLeft, RefreshCw, AlertCircle, Smartphone,
  AtSign, Check, X, Home, Gift, LogIn, Phone, ChevronDown,
  Bitcoin, Zap, Globe, TrendingUp, Users, BadgeCheck, Star,
  ArrowUpRight, CircleDollarSign, Wallet, BarChart3, MapPin, PartyPopper,
  Upload
} from 'lucide-react';

// ─── Guided Onboarding Field Tips ───────────────────────────────────────────
const FIELD_GUIDES = [
  {
    field: 'fullName',
    Icon: User,
    title: 'Your Full Name',
    body: 'Enter your real full name as it appears on your ID. This helps verify your identity for secure trades.',
    example: 'e.g. John Doe',
  },
  {
    field: 'email',
    Icon: Mail,
    title: 'Email Address',
    body: "We'll send a verification link to this email. Use one you check regularly so you never miss a trade notification.",
    example: 'e.g. you@gmail.com',
  },
  {
    field: 'phone',
    Icon: Phone,
    title: 'Phone Number',
    body: 'Select your country code and enter your mobile number. We will send SMS verification code for fast trading.',
    example: 'e.g. 244 123 4567',
  },
  {
    field: 'username',
    Icon: AtSign,
    title: 'Choose a Username',
    body: 'Your public trading handle on PRAQEN. Use letters, numbers, underscores or dots. At least 3 characters.',
    example: 'e.g. john_doe99',
  },
  {
    field: 'password',
    Icon: Lock,
    title: 'Create a Strong Password',
    body: 'Must include uppercase, lowercase, and a number. A strong password keeps your Bitcoin wallet safe.',
    example: 'e.g. MyP@ss2024',
  },
  {
    field: 'confirm',
    Icon: CheckCircle,
    title: 'Confirm Your Password',
    body: 'Retype your password exactly. This prevents typos from locking you out of your account.',
    example: 'Must match your password above',
  },
  {
    field: 'agreed',
    Icon: Shield,
    title: 'Accept Terms',
    body: 'Check the box to confirm you agree to our Terms of Service and Privacy Policy. All trades are escrow-protected.',
    example: 'Required to create your account',
  },
  {
    field: 'submit',
    Icon: ArrowRight,
    title: 'Complete Registration',
    body: 'Click to create your free account. You will receive a 6-digit verification code to activate your account.',
    example: 'Fast & Secure setup',
  },
  {
    field: 'otp',
    Icon: Shield,
    title: 'Verification Code',
    body: 'Enter the 6-digit code sent to your email or phone. You can copy and paste all 6 digits directly.',
    example: 'e.g. 123456',
  },
];

// ─── Blue Tooltip Popup Component (left-side, responsive) ───────────────────
function FieldTooltip({ guide, onDismiss }) {
  if (!guide) return null;
  const IconComponent = guide.Icon || User;
  return (
    <div className="field-tooltip">
      {/* Arrow: points right on desktop (toward the input) */}
      <div className="field-tooltip-arrow" />
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <IconComponent size={18} style={{ color: '#fff', flexShrink: 0, marginTop: 2 }} />
        <div style={{ flex: 1 }}>
          <p style={{ margin: '0 0 4px', fontWeight: 800, fontSize: 12, color: '#fff', lineHeight: 1.3 }}>
            {guide.title}
          </p>
          <p style={{ margin: '0 0 6px', fontSize: 11, color: 'rgba(255,255,255,0.88)', lineHeight: 1.5 }}>
            {guide.body}
          </p>
          <div style={{
            fontSize: 10, color: 'rgba(255,255,255,0.65)',
            fontStyle: 'italic', background: 'rgba(255,255,255,0.12)',
            borderRadius: 6, padding: '3px 8px', display: 'inline-block',
          }}>
            {guide.example}
          </div>
        </div>
        <button
          onClick={onDismiss}
          style={{
            background: 'rgba(255,255,255,0.18)', border: 'none', borderRadius: '50%',
            width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: 'white', flexShrink: 0, padding: 0, fontSize: 11,
            lineHeight: 1,
          }}
          title="Dismiss"
        >×</button>
      </div>
    </div>
  );
}

const C = {
  forest: '#1B4332', green: '#2D6A4F', mint: '#40916C',
  gold: '#F4A422', white: '#FFFFFF', mist: '#F0F9F4',
  g50: '#F8FAFC', g100: '#F1F5F9', g200: '#E2E8F0',
  g300: '#CBD5E1', g400: '#94A3B8', g500: '#64748B',
  g600: '#475569', g700: '#334155', g800: '#1E293B',
  success: '#10B981', danger: '#EF4444', amber: '#F59E0B',
};

const PHONE_CODES = [
  { flag: '🇵🇰', code: '+92', name: 'Pakistan' },
  { flag: '🇬🇭', code: '+233', name: 'Ghana' },
  { flag: '🇳🇬', code: '+234', name: 'Nigeria' },
  { flag: '🇰🇪', code: '+254', name: 'Kenya' },
  { flag: '🇿🇦', code: '+27', name: 'South Africa' },
  { flag: '🇺🇬', code: '+256', name: 'Uganda' },
  { flag: '🇹🇿', code: '+255', name: 'Tanzania' },
  { flag: '🇷🇼', code: '+250', name: 'Rwanda' },
  { flag: '🇺🇸', code: '+1', name: 'United States' },
  { flag: '🇬🇧', code: '+44', name: 'United Kingdom' },
  { flag: '🇩🇪', code: '+49', name: 'Germany' },
  { flag: '🇫🇷', code: '+33', name: 'France' },
  { flag: '🇸🇦', code: '+966', name: 'Saudi Arabia' },
  { flag: '🇦🇪', code: '+971', name: 'UAE' },
  { flag: '🇮🇳', code: '+91', name: 'India' },
  { flag: '🇦🇺', code: '+61', name: 'Australia' },
  { flag: '🇨🇲', code: '+237', name: 'Cameroon' },
  { flag: '🇸🇳', code: '+221', name: 'Senegal' },
];

const PW_CHECKS = [
  { label: 'At least 8 characters', test: p => p.length >= 8 },
  { label: 'Uppercase letter (A–Z)', test: p => /[A-Z]/.test(p) },
  { label: 'Lowercase letter (a–z)', test: p => /[a-z]/.test(p) },
  { label: 'Number (0–9)', test: p => /\d/.test(p) },
];

const STATS = [
  { icon: Users, value: '50,000+', label: 'Active Traders' },
  { icon: Globe, value: '180+', label: 'Countries' },
  { icon: CircleDollarSign, value: '$25M+', label: 'Monthly Volume' },
  { icon: Star, value: '4.9/5', label: 'User Rating' },
];

const BENEFITS = [
  { icon: Shield, title: '100% Escrow Protected', desc: 'Your Bitcoin is locked in secure escrow until both parties confirm the trade' },
  { icon: Zap, title: 'Lightning Fast Trades', desc: 'Complete your P2P trades in under 15 minutes with instant mobile money' },
  { icon: TrendingUp, title: 'Best Market Rates', desc: 'Access competitive rates from verified traders across 180+ countries' },
];

const TESTIMONIALS = [
  { name: 'Sarah K.', location: 'Accra, Ghana', text: 'Praqen made my first Bitcoin purchase so easy! The escrow system gave me complete peace of mind.' },
  { name: 'David M.', location: 'Lagos, Nigeria', text: 'Best P2P platform worldwide. Fast trades and amazing customer support. Highly recommended!' },
];

function PwStrength({ password }) {
  const passed = PW_CHECKS.filter(c => c.test(password)).length;
  const colors = ['', C.danger, '#F97316', C.amber, C.success, C.success];
  const labels = ['', 'Weak', 'Fair', 'Good', 'Strong', 'Very Strong'];
  if (!password) return null;
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <div style={{ display: 'flex', gap: 4, flex: 1 }}>
          {[1, 2, 3, 4].map(i => (
            <div key={i} style={{
              height: 4, flex: 1, borderRadius: 99,
              background: i <= passed ? colors[passed] : '#E2E8F0',
              transition: 'background 0.3s'
            }} />
          ))}
        </div>
        <span style={{
          fontSize: 11, fontWeight: 700, color: colors[passed],
          textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap'
        }}>
          {labels[passed]}
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 8px' }}>
        {PW_CHECKS.map(({ label, test }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {test(password) ? (
              <Check size={12} style={{ color: '#10B981', flexShrink: 0 }} />
            ) : (
              <div style={{
                width: 12, height: 12, borderRadius: '50%',
                border: '2px solid #CBD5E1', flexShrink: 0
              }} />
            )}
            <span style={{
              fontSize: 11, color: test(password) ? '#64748B' : '#94A3B8',
              transition: 'color 0.2s'
            }}>
              {label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function OTPInput({ value, onChange, hasError }) {
  const refs = [useRef(), useRef(), useRef(), useRef(), useRef(), useRef()];
  const digits = (value + '      ').slice(0, 6).split('');

  const handleKey = (i, e) => {
    if (e.key === 'Backspace') {
      onChange(value.slice(0, Math.max(0, i)));
      if (i > 0) refs[i - 1].current?.focus();
    } else if (/^\d$/.test(e.key)) {
      const arr = (value + '      ').slice(0, 6).split('');
      arr[i] = e.key;
      onChange(arr.join('').replace(/\s/g, ''));
      if (i < 5) refs[i + 1].current?.focus();
    }
    e.preventDefault();
  };

  const handlePaste = e => {
    const paste = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    onChange(paste);
    refs[Math.min(paste.length, 5)].current?.focus();
    e.preventDefault();
  };

  return (
    <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
      {digits.map((d, i) => (
        <input key={i} ref={refs[i]} type="text" inputMode="numeric" maxLength={1}
          value={d === ' ' ? '' : d}
          onKeyDown={e => handleKey(i, e)}
          onPaste={handlePaste}
          onChange={() => { }}
          style={{
            width: 44, height: 52, borderRadius: 12,
            textAlign: 'center', fontSize: 20, fontWeight: 800,
            border: `2px solid ${hasError ? '#EF4444' : (d !== ' ' && d) ? '#2D6A4F' : '#E2E8F0'}`,
            color: '#1B4332',
            background: hasError ? '#FEF2F2' : (d !== ' ' && d) ? 'rgba(45,106,79,0.04)' : '#FFFFFF',
            outline: 'none', transition: 'all 0.2s',
            fontFamily: "'Inter', sans-serif",
          }}
        />
      ))}
    </div>
  );
}

// ─── Welcome gate for traders coming from Noones / Binance P2P / other ──────
// Shown once, before the normal signup form. Captures an email + a screenshot
// of their existing P2P profile (so the admin can see their username and
// feedback/trade count) for manual review — it never blocks registration.
const MIGRATION_PLATFORMS = [
  { id: 'noones', label: 'Noones', emoji: '🟠' },
  { id: 'binance', label: 'Binance P2P', emoji: '🟡' },
  { id: 'other', label: 'Another P2P platform', emoji: '🌍' },
];

function P2PWelcomeGate({ onDone }) {
  const [stage, setStage] = useState('intro'); // intro | form | submitted
  const [platform, setPlatform] = useState(null);
  const [email, setEmail] = useState('');
  const [screenshotFile, setScreenshotFile] = useState(null);
  const [screenshotPreview, setScreenshotPreview] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const finish = () => {
    localStorage.setItem('praqen_migration_seen', '1');
    onDone(stage === 'submitted' ? email : '');
  };

  const pickPlatform = (id) => { setPlatform(id); setStage('form'); setError(''); };

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
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError('Enter a valid email address'); return; }
    if (!screenshotFile) { setError('Please upload a screenshot of your P2P profile'); return; }
    setSubmitting(true); setError('');
    try {
      const screenshot = await compressScreenshot(screenshotFile);
      await axios.post(`${API_URL}/p2p-migration/submit`, { email, platform, screenshot });
      setStage('submitted');
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong. Please try again.');
    } finally { setSubmitting(false); }
  };

  const platformLabel = MIGRATION_PLATFORMS.find(p => p.id === platform)?.label || 'P2P';

  return (
    <div style={{
      minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '24px 16px', background: 'linear-gradient(135deg, #F0F9F4 0%, #E8F5EC 100%)',
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    }}>
      <style>{`@keyframes p2pSpin { to { transform: rotate(360deg); } } .p2p-spin { animation: p2pSpin 0.7s linear infinite; }`}</style>
      <div style={{ width: '100%', maxWidth: 460 }}>
        <div style={{ background: '#FFFFFF', borderRadius: 28, boxShadow: '0 20px 60px rgba(27,67,50,0.12), 0 0 0 1px rgba(27,67,50,0.06)', overflow: 'hidden' }}>

          {stage === 'submitted' ? (
            <div style={{ padding: '48px 32px 40px', textAlign: 'center' }}>
              <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'rgba(16,185,129,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                <CheckCircle size={42} style={{ color: '#10B981' }} />
              </div>
              <h3 style={{ fontSize: 24, fontWeight: 800, color: C.forest, margin: '0 0 8px' }}>Awesome, you're in! 🎉</h3>
              <p style={{ fontSize: 14, color: C.g500, margin: '0 0 24px', lineHeight: 1.6 }}>
                Thanks for sharing your {platformLabel} profile — our team will take a look and reach out soon. In the meantime, let's get your PRAQEN account set up!
              </p>
              <button onClick={finish}
                style={{ width: '100%', padding: 15, borderRadius: 14, border: 'none', background: `linear-gradient(135deg, ${C.green}, ${C.mint})`, color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                Let's Create My Account <ArrowRight size={16} />
              </button>
            </div>
          ) : (
            <>
              <div style={{ background: `linear-gradient(135deg, ${C.forest} 0%, ${C.green} 100%)`, padding: '36px 32px 26px', textAlign: 'center' }}>
                <div style={{
                  width: 64, height: 64, borderRadius: 20, background: C.gold, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  margin: '0 auto 16px', boxShadow: '0 8px 24px rgba(244,164,34,0.35)',
                  fontFamily: 'Georgia, serif', fontWeight: 900, fontSize: 32, color: C.forest,
                }}>
                  P
                </div>
                <h1 style={{ fontSize: 24, fontWeight: 800, color: '#fff', margin: '0 0 6px' }}>Welcome to PRAQEN! 🎉</h1>
                <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.78)', margin: 0, lineHeight: 1.5 }}>
                  We're so glad you're here — let's get you set up in no time.
                </p>
              </div>

              <div style={{ padding: '28px 28px 24px' }}>
                {stage === 'intro' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <p style={{ fontSize: 13, color: C.g600, lineHeight: 1.6, margin: '0 0 4px', textAlign: 'center' }}>
                      Already building a reputation on <strong style={{ color: C.g800 }}>Noones</strong> or <strong style={{ color: C.g800 }}>Binance P2P</strong>? Bring it with you and skip the cold start 👇
                    </p>
                    {MIGRATION_PLATFORMS.map(p => (
                      <button key={p.id} onClick={() => pickPlatform(p.id)}
                        style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderRadius: 14, border: `2px solid ${C.g200}`, background: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 14, color: C.g800, fontFamily: "'Inter', sans-serif" }}>
                        <span style={{ fontSize: 18 }}>{p.emoji}</span>
                        <span style={{ flex: 1, textAlign: 'left' }}>{p.label}</span>
                        <ArrowRight size={16} style={{ color: C.g400 }} />
                      </button>
                    ))}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '4px 0' }}>
                      <div style={{ flex: 1, height: 1, background: C.g100 }} />
                      <span style={{ fontSize: 11, fontWeight: 600, color: C.g400 }}>OR</span>
                      <div style={{ flex: 1, height: 1, background: C.g100 }} />
                    </div>
                    <button onClick={finish}
                      style={{ width: '100%', padding: '14px 16px', borderRadius: 14, border: 'none', background: `linear-gradient(135deg, ${C.green}, ${C.mint})`, color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: "'Inter', sans-serif" }}>
                      🆕 I'm new here — let's go! <ArrowRight size={16} />
                    </button>
                  </div>
                )}

                {stage === 'form' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {error && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 12, fontSize: 12, background: '#FEF2F2', color: '#EF4444', border: '1.5px solid #FECACA' }}>
                        <AlertCircle size={14} style={{ flexShrink: 0 }} /> {error}
                      </div>
                    )}
                    <div>
                      <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6, color: C.g600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Your Email</label>
                      <div style={{ position: 'relative' }}>
                        <Mail size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: C.g400 }} />
                        <input type="email" value={email} onChange={e => { setEmail(e.target.value); setError(''); }}
                          placeholder="you@example.com"
                          style={{ width: '100%', padding: '13px 14px 13px 44px', fontSize: 14, borderRadius: 14, border: `2px solid ${email ? C.green : C.g200}`, outline: 'none', color: C.g800, fontFamily: "'Inter', sans-serif" }} />
                      </div>
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6, color: C.g600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Screenshot of your {platformLabel} profile
                      </label>
                      <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, padding: screenshotPreview ? 0 : '28px 16px', borderRadius: 14, border: `2px dashed ${screenshotPreview ? C.green : C.g200}`, cursor: 'pointer', overflow: 'hidden', background: screenshotPreview ? 'transparent' : C.g50 }}>
                        <input type="file" accept="image/*" onChange={e => handleFile(e.target.files?.[0])} style={{ display: 'none' }} />
                        {screenshotPreview ? (
                          <img src={screenshotPreview} alt="Screenshot preview" style={{ width: '100%', maxHeight: 200, objectFit: 'cover' }} />
                        ) : (
                          <>
                            <Upload size={22} style={{ color: C.g400 }} />
                            <span style={{ fontSize: 12, color: C.g500, fontWeight: 600 }}>Tap to upload a screenshot</span>
                            <span style={{ fontSize: 11, color: C.g400 }}>Show your username & feedback/trade count</span>
                          </>
                        )}
                      </label>
                    </div>

                    <button onClick={submit} disabled={submitting}
                      style={{ width: '100%', padding: 15, borderRadius: 14, border: 'none', background: `linear-gradient(135deg, ${C.green}, ${C.mint})`, color: '#fff', fontSize: 15, fontWeight: 700, cursor: submitting ? 'not-allowed' : 'pointer', opacity: submitting ? 0.6 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: "'Inter', sans-serif" }}>
                      {submitting ? <><RefreshCw size={16} className="p2p-spin" /> Submitting…</> : <>Submit for Review <ArrowRight size={16} /></>}
                    </button>

                    <button onClick={() => { setStage('intro'); setError(''); }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: C.g500, fontFamily: "'Inter', sans-serif" }}>
                      ← Back
                    </button>
                  </div>
                )}
              </div>

              {stage === 'form' && (
                <div style={{ padding: '14px 28px', borderTop: `1px solid ${C.g100}`, background: C.g50, textAlign: 'center' }}>
                  <button onClick={finish}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: C.g500, fontFamily: "'Inter', sans-serif" }}>
                    Changed your mind? Skip and create my account →
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Register({ onLogin }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [welcomeStep, setWelcomeStep] = useState(() =>
    localStorage.getItem('praqen_migration_seen') === '1' ? 'done' : 'intro'
  );
  const [mode, setMode] = useState('register');
  const [step, setStep] = useState(1);
  const [method, setMethod] = useState('email');
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [otpTimer, setOtpTimer] = useState(0);
  const [phoneCode, setPhoneCode] = useState(PHONE_CODES[0]);
  const [showCodes, setShowCodes] = useState(false);
  const [globalError, setGlobalError] = useState('');
  const [currentTestimonial, setCurrentTestimonial] = useState(0);
  // Hover-based tooltip state
  const [hoveredField, setHoveredField] = useState(null);

  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [otpError, setOtpError] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [username, setUsername] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [errs, setErrs] = useState({});
  const [referralCode, setReferralCode] = useState('');
  const [referrerInfo, setReferrerInfo] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const refCode = params.get('ref');
    if (refCode) {
      setReferralCode(refCode);
      localStorage.setItem('referralCode', refCode);
    } else {
      const stored = localStorage.getItem('referralCode');
      if (stored) setReferralCode(stored);
    }
  }, [location.search]);

  useEffect(() => {
    if (!referralCode) { setReferrerInfo(null); return; }
    axios.get(`${API_URL}/auth/referrer?code=${encodeURIComponent(referralCode)}`)
      .then(r => { if (r.data.success) setReferrerInfo(r.data.referrer); })
      .catch(() => { });
  }, [referralCode]);

  useEffect(() => {
    if (otpTimer <= 0) return;
    const iv = setInterval(() => setOtpTimer(t => t - 1), 1000);
    return () => clearInterval(iv);
  }, [otpTimer]);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTestimonial(prev => (prev + 1) % TESTIMONIALS.length);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleGoogleResponse = async (response) => {
    setLoading(true);
    setGlobalError('');
    try {
      const res = await axios.post(`${API_URL}/auth/google`, {
        credential: response.credential,
        referralCode: referralCode || undefined,
      });
      if (res.data.success && res.data.token) {
        localStorage.setItem('token', res.data.token);
        localStorage.removeItem('referralCode');
        onLogin(res.data.user, res.data.token);
        navigate('/buy-bitcoin');
      }
    } catch (err) {
      if (!err.response) {
        setGlobalError('Cannot reach the server. Please check your internet connection and try again.');
      } else {
        setGlobalError(err.response.data?.error || 'Google registration failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    /* global google */
    const googleClientId = process.env.REACT_APP_GOOGLE_CLIENT_ID;
    if (googleClientId && window.google && window.google.accounts) {
      try {
        window.google.accounts.id.initialize({
          client_id: googleClientId,
          callback: handleGoogleResponse,
        });
        const btnContainer = document.getElementById('googleBtnRegister');
        if (btnContainer) {
          window.google.accounts.id.renderButton(btnContainer, {
            theme: 'outline',
            size: 'large',
            width: '100%',
            text: 'continue_with',
          });
        }
      } catch (err) {
        console.error('Google Sign-In initialization failed:', err);
      }
    }
  }, [mode, step]);

  const contact = method === 'email' ? email : `${phoneCode.code}${phone}`;

  const validateContact = () => {
    const e = {};
    if (method === 'email') {
      if (!email) e.email = 'Email is required';
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = 'Enter a valid email';
    } else {
      if (!phone) e.phone = 'Phone number is required';
      else if (phone.length < 7) e.phone = 'Enter a valid phone number';
    }
    setErrs(e);
    return Object.keys(e).length === 0;
  };

  const validateAll = () => {
    const e = {};
    if (method === 'email') {
      if (!email) e.email = 'Email is required';
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = 'Enter a valid email';
    } else {
      if (!phone) e.phone = 'Phone number is required';
      else if (phone.length < 7) e.phone = 'Enter a valid phone number';
    }
    if (!fullName.trim()) e.fullName = 'Full name is required';
    if (!username.trim()) e.username = 'Username is required';
    else if (username.length < 3) e.username = 'At least 3 characters';
    else if (!/^[a-z0-9_.@-]+$/.test(username)) e.username = 'Letters, numbers, _ . @ - only';
    if (!password) e.password = 'Password is required';
    else if (PW_CHECKS.filter(c => c.test(password)).length < 3) e.password = 'Password is too weak';
    if (password !== confirm) e.confirm = 'Passwords do not match';
    if (!agreed) e.agreed = 'You must agree to continue';
    setErrs(e);
    return Object.keys(e).length === 0;
  };

  const validateNewPassword = () => {
    const e = {};
    if (!password) e.password = 'Required';
    else if (PW_CHECKS.filter(c => c.test(password)).length < 3) e.password = 'Too weak';
    if (password !== confirm) e.confirm = 'Passwords do not match';
    setErrs(e);
    return Object.keys(e).length === 0;
  };

  const sendOTP = async () => {
    if (!validateContact()) return;
    setLoading(true); setGlobalError('');
    try {
      // Forgot-password codes for email go through the email verification-code
      // pipeline (/send-verification); /send-otp only supports phone (SMS/WhatsApp).
      const r = method === 'email'
        ? await axios.post(`${API_URL}/auth/send-verification`, { email: contact })
        : await axios.post(`${API_URL}/auth/send-otp`, { phone: contact, channel: 'sms', purpose: 'forgot-password' });
      setStep('f2'); setOtpTimer(60);
      // Dev mode: if email/SMS delivery failed, auto-fill the OTP
      if (r.data?.devCode) {
        setOtp(r.data.devCode);
      }
    } catch (err) {
      const errData = err.response?.data;
      if (errData?.devCode) {
        setOtp(errData.devCode);
        setStep('f2'); setOtpTimer(60);
      } else {
        setGlobalError(errData?.error || 'Failed to send code. Try again.');
      }
    }
    finally { setLoading(false); }
  };

  const verifyOTP = async () => {
    if (otp.length < 6) { setOtpError('Enter the 6-digit code'); return; }
    setLoading(true); setOtpError('');
    try {
      if (method === 'email') {
        const { data } = await axios.post(`${API_URL}/auth/verify-code`, {
          email: contact, code: otp, purpose: mode === 'forgot' ? 'forgot-password' : undefined,
        });
        if (mode === 'forgot') setResetToken(data.resetToken || '');
      } else {
        const { data } = await axios.post(`${API_URL}/auth/verify-otp`, {
          contact, otp, purpose: mode === 'register' ? 'register' : 'forgot-password',
        });
        if (mode === 'forgot') setResetToken(data.resetToken || '');
      }
      setStep(mode === 'register' ? 3 : 'f3');
    } catch (err) { setOtpError(err.response?.data?.error || 'Incorrect code. Try again.'); }
    finally { setLoading(false); }
  };

  const handleRegister = async () => {
    if (!validateAll()) return;
    setLoading(true); setGlobalError('');
    try {
      const res = await axios.post(`${API_URL}/auth/register`, {
        email: method === 'email' ? email : undefined,
        phone: method === 'phone' ? contact : undefined,
        username: username.toLowerCase(),
        fullName, password,
        referralCode: referralCode || undefined,
      });
      if (res.data.success && res.data.token) {
        localStorage.setItem('token', res.data.token);
        localStorage.removeItem('referralCode');
        onLogin(res.data.user, res.data.token);
        if (method === 'email' && email) {
          // Email users go to dedicated verification page
          navigate(`/verify-email?email=${encodeURIComponent(email)}`);
        } else {
          // Phone users: the SMS code was already sent during registration —
          // send them straight to Settings to enter it, instead of silently
          // leaving the account unverified.
          setStep(4);
          setTimeout(() => navigate('/settings?tab=verification'), 1800);
        }
      }
    } catch (err) {
      if (!err.response) {
        setGlobalError('Cannot reach the server. Please check your internet connection and try again.');
      } else {
        setGlobalError(err.response.data?.error || 'Registration failed. Please try again.');
      }
    }
    finally { setLoading(false); }
  };

  const handleResetPassword = async () => {
    if (!validateNewPassword()) return;
    if (!resetToken) { setGlobalError('Your code verification expired. Please start over.'); return; }
    setLoading(true); setGlobalError('');
    try {
      await axios.post(`${API_URL}/auth/reset-password`, { newPassword: password, token: resetToken });
      setStep('f4');
    } catch (err) { setGlobalError(err.response?.data?.error || 'Failed to reset password.'); }
    finally { setLoading(false); }
  };

  const startForgot = () => {
    setMode('forgot'); setStep('f1');
    setEmail(''); setPhone(''); setOtp(''); setPassword(''); setConfirm(''); setResetToken('');
    setErrs({}); setGlobalError('');
  };

  const backToRegister = () => {
    setMode('register'); setStep(1);
    setOtp(''); setErrs({}); setGlobalError('');
  };

  const inputStyle = (filled, error) => ({
    width: '100%',
    padding: '13px 14px 13px 44px',
    fontSize: 14,
    borderRadius: 14,
    border: `2px solid ${error ? '#EF4444' : filled ? '#2D6A4F' : '#E2E8F0'}`,
    color: '#1E293B',
    background: error ? '#FEF2F2' : filled ? '#F8FAFC' : '#FFFFFF',
    outline: 'none',
    transition: 'all 0.2s ease',
    fontFamily: "'Inter', sans-serif",
  });

  const inputWithRightIcon = (filled, error) => ({
    ...inputStyle(filled, error),
    paddingRight: 46,
  });

  if (welcomeStep !== 'done') {
    return <P2PWelcomeGate onDone={(capturedEmail) => {
      if (capturedEmail) { setEmail(capturedEmail); setMethod('email'); }
      setWelcomeStep('done');
    }} />;
  }

  return (
    <>
      <SEO />
      <style>{`
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }

        html, body {
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
          background: #F0F9F4;
          overscroll-behavior: none;
          -webkit-overflow-scrolling: touch;
        }

        .register-layout {
          min-height: 100vh;
          min-height: 100dvh;
          display: flex;
          flex-direction: column;
          width: 100%;
        }

        @media (min-width: 1024px) {
          .register-layout {
            flex-direction: row;
          }
        }

        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @keyframes tooltipIn {
          from { opacity: 0; transform: translateY(-50%) scale(0.85); }
          to { opacity: 1; transform: translateY(-50%) scale(1); }
        }
        @keyframes pulse-gold {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.1); }
        }
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }

        .animate-in {
          animation: fadeInUp 0.4s cubic-bezier(0.22, 0.68, 0, 1.1) both;
        }
        .animate-fade {
          animation: fadeIn 0.25s ease both;
        }
        .animate-spin {
          animation: spin 0.7s linear infinite;
        }
        .pulse-gold {
          animation: pulse-gold 2s ease-in-out infinite;
        }

        /* ─── Field Tooltip (Blue popup) ─────────────────────────── */
        .field-tooltip {
          position: absolute;
          /* Default: LEFT of the input on desktop */
          right: calc(100% + 14px);
          top: 50%;
          transform: translateY(-50%);
          width: 210px;
          background: linear-gradient(135deg, #1E40AF 0%, #2563EB 100%);
          border-radius: 14px;
          padding: 12px 14px;
          box-shadow: 0 10px 36px rgba(37, 99, 235, 0.32), 0 2px 8px rgba(0,0,0,0.08);
          z-index: 1000;
          animation: tooltipFadeIn 0.22s ease both;
          pointer-events: auto;
        }

        @keyframes tooltipFadeIn {
          from { opacity: 0; transform: translateY(-50%) scale(0.9); }
          to   { opacity: 1; transform: translateY(-50%) scale(1); }
        }

        /* Arrow: points RIGHT (toward the input) */
        .field-tooltip-arrow {
          position: absolute;
          right: -8px;
          top: 50%;
          transform: translateY(-50%);
          width: 0;
          height: 0;
          border-top: 7px solid transparent;
          border-bottom: 7px solid transparent;
          border-left: 8px solid #1E40AF;
        }

        /* On screens where there's no room to the left — show BELOW */
        @media (max-width: 1200px) {
          .field-tooltip {
            right: auto;
            left: 0;
            top: calc(100% + 8px);
            transform: none;
            width: 100%;
            max-width: 100%;
            animation: tooltipDropIn 0.22s ease both;
          }
          @keyframes tooltipDropIn {
            from { opacity: 0; transform: translateY(-6px); }
            to   { opacity: 1; transform: translateY(0); }
          }
          .field-tooltip-arrow {
            display: none;
          }
        }

        /* Hero Panel - Desktop Only */
        .hero-panel {
          display: none;
        }

        @media (min-width: 1024px) {
          .hero-panel {
            display: flex;
            width: 50%;
            flex-shrink: 0;
            flex-direction: column;
            justify-content: center;
            padding: 60px 56px;
            position: relative;
            overflow: hidden;
            background: linear-gradient(160deg, #1B4332 0%, #1F4D3D 25%, #2D6A4F 60%, #40916C 100%);
          }
        }

        .hero-bg-pattern {
          position: absolute;
          inset: 0;
          opacity: 0.04;
          background-image: 
            radial-gradient(circle at 25% 25%, white 2px, transparent 2px),
            radial-gradient(circle at 75% 75%, white 2px, transparent 2px);
          background-size: 60px 60px;
          background-position: 0 0, 30px 30px;
        }

        .hero-glow-1 {
          position: absolute;
          top: -150px;
          right: -150px;
          width: 500px;
          height: 500px;
          border-radius: 50%;
          background: #F4A422;
          opacity: 0.1;
          filter: blur(100px);
          pointer-events: none;
        }

        .hero-glow-2 {
          position: absolute;
          bottom: -100px;
          left: -100px;
          width: 400px;
          height: 400px;
          border-radius: 50%;
          background: #40916C;
          opacity: 0.15;
          filter: blur(80px);
          pointer-events: none;
        }

        .hero-content {
          position: relative;
          z-index: 2;
        }

        .hero-badge {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          padding: 10px 22px;
          border-radius: 50px;
          background: rgba(255, 255, 255, 0.1);
          border: 1.5px solid rgba(255, 255, 255, 0.2);
          backdrop-filter: blur(10px);
          margin-bottom: 36px;
        }

        .hero-title {
          font-family: 'Outfit', sans-serif;
          font-size: 44px;
          font-weight: 900;
          color: white;
          line-height: 1.1;
          margin: 0 0 16px;
          letter-spacing: -1px;
        }

        .hero-title .highlight {
          background: linear-gradient(135deg, #F4A422, #FBBF24);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .hero-description {
          font-size: 16px;
          color: rgba(255, 255, 255, 0.7);
          line-height: 1.6;
          margin: 0 0 40px;
          font-weight: 400;
        }

        .stats-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          margin-bottom: 40px;
        }

        .stat-card {
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 14px 16px;
          border-radius: 16px;
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.1);
          backdrop-filter: blur(10px);
          transition: transform 0.3s ease, background 0.3s ease;
        }

        .stat-card:hover {
          background: rgba(255, 255, 255, 0.12);
          transform: translateY(-2px);
        }

        .stat-icon {
          width: 44px;
          height: 44px;
          border-radius: 12px;
          background: rgba(244, 164, 34, 0.2);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #F4A422;
          flex-shrink: 0;
        }

        .stat-value {
          font-size: 18px;
          font-weight: 800;
          color: white;
          line-height: 1.2;
        }

        .stat-label {
          font-size: 11px;
          color: rgba(255, 255, 255, 0.5);
          font-weight: 500;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .testimonial-card {
          padding: 20px;
          border-radius: 20px;
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.1);
          backdrop-filter: blur(10px);
        }

        .testimonial-quote {
          font-size: 14px;
          color: rgba(255, 255, 255, 0.8);
          line-height: 1.7;
          margin: 0 0 12px;
          font-style: italic;
        }

        .testimonial-author {
          font-size: 13px;
          font-weight: 700;
          color: white;
        }

        .testimonial-location {
          font-size: 11px;
          color: rgba(255, 255, 255, 0.5);
        }

        .testimonial-dots {
          display: flex;
          gap: 6px;
          margin-top: 12px;
        }

        .testimonial-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.2);
          cursor: pointer;
          transition: all 0.3s;
        }

        .testimonial-dot.active {
          background: #F4A422;
          width: 24px;
          border-radius: 4px;
        }

        .hero-footer {
          position: relative;
          z-index: 2;
          display: flex;
          align-items: center;
          gap: 8px;
          color: rgba(255, 255, 255, 0.35);
          font-size: 12px;
          margin-top: auto;
        }

        /* Form Panel */
        .form-panel {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
          background: linear-gradient(180deg, #F0F9F4 0%, #E8F5EC 100%);
          width: 100%;
        }

        @media (min-width: 1024px) {
          .form-panel {
            width: 50%;
            padding: 40px;
          }
        }

        /* Mobile Hero Strip - hidden on desktop */
        .mobile-hero-strip {
          margin-bottom: 16px;
          width: 100%;
          max-width: 460px;
        }

        @media (min-width: 1024px) {
          .mobile-hero-strip {
            display: none;
          }
        }

        .mobile-benefits-strip {
          display: flex;
          gap: 8px;
          overflow-x: auto;
          padding: 4px 0;
          -webkit-overflow-scrolling: touch;
          scrollbar-width: none;
          -ms-overflow-style: none;
        }

        .mobile-benefits-strip::-webkit-scrollbar {
          display: none;
        }

        .mobile-benefit-pill {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 14px;
          border-radius: 50px;
          background: linear-gradient(135deg, #1B4332, #2D6A4F);
          color: white;
          white-space: nowrap;
          font-size: 11px;
          font-weight: 600;
          flex-shrink: 0;
        }

        /* Form Card */
        .register-card {
          width: 100%;
          max-width: 460px;
          background: #FFFFFF;
          border-radius: 24px;
          box-shadow: 0 4px 24px rgba(27, 67, 50, 0.08), 0 0 0 1px rgba(27, 67, 50, 0.04);
          overflow: visible;
        }

        @media (min-width: 1024px) {
          .register-card {
            border-radius: 28px;
            box-shadow: 0 20px 60px rgba(27, 67, 50, 0.12), 0 0 0 1px rgba(27, 67, 50, 0.06);
          }
        }

        .card-top {
          padding: 24px 24px 16px;
          text-align: center;
          border-bottom: 1px solid #F1F5F9;
        }

        @media (min-width: 1024px) {
          .card-top {
            padding: 28px 28px 20px;
          }
        }

        .logo-badge {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: linear-gradient(135deg, #1B4332, #2D6A4F);
          color: white;
          padding: 8px 18px;
          border-radius: 50px;
          margin-bottom: 16px;
          font-weight: 700;
          font-size: 14px;
          letter-spacing: 3px;
        }

        .card-title {
          font-size: 22px;
          font-weight: 800;
          color: #1B4332;
          margin: 0 0 4px;
          letter-spacing: -0.3px;
          font-family: 'Outfit', sans-serif;
        }

        .card-subtitle {
          font-size: 13px;
          color: #64748B;
          margin: 0;
          font-weight: 400;
        }

        .card-body {
          padding: 16px 24px 24px;
        }

        @media (min-width: 1024px) {
          .card-body {
            padding: 20px 28px 28px;
          }
        }

        .card-footer-bar {
          padding: 12px 24px;
          border-top: 1px solid #F1F5F9;
          background: #F8FAFC;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        @media (min-width: 1024px) {
          .card-footer-bar {
            padding: 14px 28px;
          }
        }

        /* Method Toggle */
        .method-toggle {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 6px;
          padding: 4px;
          border-radius: 12px;
          background: #F1F5F9;
          margin-bottom: 16px;
        }

        .method-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          padding: 10px 14px;
          border-radius: 10px;
          font-size: 13px;
          font-weight: 600;
          border: none;
          cursor: pointer;
          transition: all 0.2s ease;
          background: transparent;
          color: #64748B;
          font-family: 'Inter', sans-serif;
        }

        .method-btn.active {
          background: white;
          color: #2D6A4F;
          box-shadow: 0 2px 8px rgba(0,0,0,0.08);
        }

        /* Input Focus */
        .form-input-focus:focus {
          border-color: #2D6A4F !important;
          box-shadow: 0 0 0 4px rgba(45, 106, 79, 0.08) !important;
        }

        /* Submit Button */
        .submit-btn {
          width: 100%;
          padding: 15px;
          border-radius: 14px;
          border: none;
          background: linear-gradient(135deg, #2D6A4F 0%, #40916C 100%);
          color: white;
          font-size: 15px;
          font-weight: 700;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          cursor: pointer;
          transition: all 0.2s ease;
          box-shadow: 0 6px 20px rgba(45, 106, 79, 0.25);
          margin-top: 8px;
          font-family: 'Inter', sans-serif;
          position: relative;
          overflow: hidden;
        }

        .submit-btn::before {
          content: '';
          position: absolute;
          top: 0;
          left: -100%;
          width: 100%;
          height: 100%;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent);
          transition: left 0.6s;
        }

        .submit-btn:hover::before {
          left: 100%;
        }

        .submit-btn:hover {
          transform: translateY(-1px);
          box-shadow: 0 8px 24px rgba(45, 106, 79, 0.3);
        }

        .submit-btn:active {
          transform: scale(0.98);
        }

        .submit-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
          transform: none !important;
        }

        /* Success */
        .shimmer-text {
          background: linear-gradient(90deg, #2D6A4F 0%, #40916C 50%, #2D6A4F 100%);
          background-size: 200% 100%;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          animation: shimmer 2s infinite;
        }

        /* Phone Dropdown scrollbar */
        .phone-dropdown-scroll::-webkit-scrollbar {
          width: 4px;
        }
        .phone-dropdown-scroll::-webkit-scrollbar-track {
          background: transparent;
        }
        .phone-dropdown-scroll::-webkit-scrollbar-thumb {
          background: #CBD5E1;
          border-radius: 2px;
        }
      `}</style>

      <div className="register-layout">
        {/* Desktop Left Hero Panel */}
        <div className="hero-panel">
          <div className="hero-bg-pattern" />
          <div className="hero-glow-1" />
          <div className="hero-glow-2" />

          <div className="hero-content">
            <div className="hero-badge">
              <Bitcoin size={22} className="pulse-gold" style={{ color: '#F4A422' }} />
              <span style={{
                color: 'white',
                fontWeight: 800,
                letterSpacing: '4px',
                fontSize: 15,
                textTransform: 'uppercase'
              }}>
                Praqen
              </span>
            </div>

            <h1 className="hero-title">
              Trade Bitcoin &amp; USDT<br />
              <span className="highlight">Peer-to-Peer</span><br />
              with Confidence
            </h1>

            <p className="hero-description">
              Join the world's most trusted P2P Bitcoin &amp; USDT marketplace.
              Trade directly with verified users, protected by
              industry-leading escrow technology.
            </p>

            <div className="stats-grid">
              {STATS.map(({ icon: Icon, value, label }) => (
                <div key={label} className="stat-card">
                  <div className="stat-icon">
                    <Icon size={20} />
                  </div>
                  <div>
                    <div className="stat-value">{value}</div>
                    <div className="stat-label">{label}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="testimonial-card">
              <p className="testimonial-quote">
                "{TESTIMONIALS[currentTestimonial].text}"
              </p>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <p className="testimonial-author">
                    {TESTIMONIALS[currentTestimonial].name}
                  </p>
                  <p className="testimonial-location">
                    <MapPin size={12} style={{ color: 'currentColor', verticalAlign: '-1px', flexShrink: 0 }} /> {TESTIMONIALS[currentTestimonial].location}
                  </p>
                </div>
                <div className="testimonial-dots">
                  {TESTIMONIALS.map((_, i) => (
                    <div
                      key={i}
                      className={`testimonial-dot ${i === currentTestimonial ? 'active' : ''}`}
                      onClick={() => setCurrentTestimonial(i)}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="hero-footer">
            <Shield size={14} />
            All data encrypted · SOC 2 Type II · ISO 27001
          </div>
        </div>

        {/* Right Form Panel */}
        <div className="form-panel">
          <div style={{ width: '100%', maxWidth: 460 }}>
            {/* Mobile Hero Strip */}
            <div className="mobile-hero-strip">
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                marginBottom: 12,
                flexWrap: 'wrap'
              }}>
                <div style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 14px',
                  borderRadius: 50,
                  background: 'linear-gradient(135deg, #1B4332, #2D6A4F)',
                }}>
                  <Bitcoin size={16} style={{ color: '#F4A422' }} />
                  <span style={{
                    color: 'white',
                    fontWeight: 700,
                    fontSize: 12,
                    letterSpacing: '2px'
                  }}>
                    PRAQEN
                  </span>
                </div>
                <div style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: '#2D6A4F',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4
                }}>
                  <Star size={12} fill="#F4A422" color="#F4A422" />
                  4.9/5 · 50K+ traders
                </div>
              </div>

              <div className="mobile-benefits-strip">
                {BENEFITS.map(({ icon: Icon, title }) => (
                  <div key={title} className="mobile-benefit-pill">
                    <Icon size={12} style={{ color: '#F4A422', flexShrink: 0 }} />
                    {title}
                  </div>
                ))}
              </div>
            </div>

            {/* Main Registration Card */}
            <div className="register-card animate-in">
              <div className="card-top">
                <div className="logo-badge" style={{ display: 'none' }}>
                  <Bitcoin size={18} style={{ color: '#F4A422' }} />
                  PRAQEN
                </div>
                <h1 className="card-title">
                  {mode === 'register' ? 'Create Account' : 'Reset Password'}
                </h1>
                <p className="card-subtitle">
                  {mode === 'register'
                    ? 'Join the future of P2P trading'
                    : "We'll help you get back in"
                  }
                </p>
              </div>

              {/* ── REFERRAL BANNER ── shown when arriving via an affiliate link */}
              {referralCode && mode === 'register' && (
                <div style={{
                  margin: '0 0 4px',
                  padding: '12px 16px',
                  borderRadius: 14,
                  background: 'linear-gradient(135deg, #1B4332 0%, #2D6A4F 100%)',
                  border: '1.5px solid #40916C',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                }}>
                  <div style={{
                    width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
                    background: referrerInfo?.avatar_url ? `url(${referrerInfo.avatar_url}) center/cover` : 'linear-gradient(135deg,#F4A422,#E07C0E)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 900, fontSize: 15, color: '#1B4332',
                  }}>
                    {!referrerInfo?.avatar_url && (referrerInfo?.username?.charAt(0).toUpperCase() || <Gift size={18} style={{ color: '#1B4332' }} />)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {referrerInfo ? (
                      <>
                        <p style={{ color: '#F4A422', fontWeight: 800, fontSize: 13, margin: 0 }}>
                          You were invited by <span style={{ color: '#fff' }}>@{referrerInfo.username}</span>!
                        </p>
                        <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, margin: '2px 0 0', fontWeight: 500 }}>
                          Sign up now and start trading on the world's #1 P2P Bitcoin &amp; USDT platform
                        </p>
                      </>
                    ) : (
                      <>
                        <p style={{ color: '#F4A422', fontWeight: 800, fontSize: 13, margin: 0 }}>
                          You have a referral invitation!
                        </p>
                        <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, margin: '2px 0 0', fontWeight: 500 }}>
                          Sign up now and start trading on the world's #1 P2P Bitcoin &amp; USDT platform
                        </p>
                      </>
                    )}
                  </div>
                  <div style={{
                    flexShrink: 0, padding: '4px 10px', borderRadius: 20,
                    background: 'rgba(244,164,34,0.2)', border: '1px solid rgba(244,164,34,0.4)',
                    fontSize: 10, fontWeight: 800, color: '#F4A422', textTransform: 'uppercase', letterSpacing: '0.5px',
                  }}>
                    Referral
                  </div>
                </div>
              )}

              <div className="card-body animate-fade" key={step}>
                {/* REGISTER STEP 1 */}
                {step === 1 && mode === 'register' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {globalError && (
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '10px 14px', borderRadius: 12, fontSize: 12,
                        background: '#FEF2F2', color: '#EF4444',
                        border: '1.5px solid #FECACA'
                      }}>
                        <AlertCircle size={14} style={{ flexShrink: 0 }} />
                        {globalError}
                      </div>
                    )}

                    {/* Method Toggle */}
                    <div className="method-toggle">
                      <button
                        onClick={() => { setMethod('email'); setErrs({}); }}
                        className={`method-btn ${method === 'email' ? 'active' : ''}`}
                      >
                        <Mail size={14} />
                        Email
                      </button>
                      <button
                        onClick={() => { setMethod('phone'); setErrs({}); }}
                        className={`method-btn ${method === 'phone' ? 'active' : ''}`}
                      >
                        <Smartphone size={14} />
                        Phone
                      </button>
                    </div>

                    {/* Google OAuth Button */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, margin: '6px 0 10px' }}>
                      <div id="googleBtnRegister" style={{ minHeight: 40 }}></div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ flex: 1, height: 1, background: '#E2E8F0' }}></div>
                        <span style={{ fontSize: 11, color: '#94A3B8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Or register with</span>
                        <div style={{ flex: 1, height: 1, background: '#E2E8F0' }}></div>
                      </div>
                    </div>

                    {/* Email or Phone */}
                    {method === 'email' ? (
                      <div
                        style={{ position: 'relative' }}
                        onMouseEnter={() => setHoveredField('email')}
                        onMouseLeave={() => setHoveredField(null)}
                      >
                        <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                          Email Address
                        </label>
                        <div style={{ position: 'relative' }}>
                          <Mail size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#94A3B8', pointerEvents: 'none', zIndex: 1 }} />
                          <input
                            type="email"
                            value={email}
                            placeholder="you@example.com"
                            onFocus={() => setHoveredField('email')}
                            onChange={e => setEmail(e.target.value)}
                            className="form-input-focus"
                            style={inputStyle(!!email, errs.email)}
                          />
                          {hoveredField === 'email' && (
                            <FieldTooltip
                              guide={FIELD_GUIDES.find(g => g.field === 'email')}
                              onDismiss={() => setHoveredField(null)}
                            />
                          )}
                        </div>
                        {errs.email && (
                          <p style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#EF4444', marginTop: 5, fontWeight: 500 }}>
                            <AlertCircle size={10} />{errs.email}
                          </p>
                        )}
                      </div>
                    ) : (
                      <div
                        style={{ position: 'relative' }}
                        onMouseEnter={() => setHoveredField('phone')}
                        onMouseLeave={() => setHoveredField(null)}
                      >
                        <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                          Phone Number
                        </label>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <div style={{ position: 'relative', flexShrink: 0 }}>
                            <button
                              onClick={() => setShowCodes(!showCodes)}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 6,
                                padding: '13px 14px', border: '2px solid #E2E8F0',
                                borderRadius: 14, background: 'white', cursor: 'pointer',
                                fontSize: 13, fontWeight: 600, color: '#334155',
                                flexShrink: 0, transition: 'border-color 0.2s',
                                fontFamily: "'Inter', sans-serif",
                              }}
                            >
                              <span style={{ fontSize: 18 }}>{phoneCode.flag}</span>
                              <span>{phoneCode.code}</span>
                              <ChevronDown size={12} style={{ color: '#94A3B8' }} />
                            </button>
                            {showCodes && (
                              <div style={{
                                position: 'absolute', top: 'calc(100% + 8px)', left: 0,
                                width: 280, maxWidth: 'calc(100vw - 32px)',
                                background: 'white', borderRadius: 18,
                                boxShadow: '0 20px 60px rgba(0,0,0,0.15)', zIndex: 100,
                                border: '1px solid #F1F5F9', overflow: 'hidden'
                              }}>
                                <div className="phone-dropdown-scroll" style={{ maxHeight: 220, overflowY: 'auto' }}>
                                  {PHONE_CODES.map(pc => (
                                    <button
                                      key={pc.code}
                                      onClick={() => { setPhoneCode(pc); setShowCodes(false); }}
                                      style={{
                                        width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                                        padding: '11px 16px', background: phoneCode.code === pc.code ? 'rgba(45,106,79,0.06)' : 'transparent',
                                        border: 'none', borderBottom: '1px solid #F8FAFC',
                                        cursor: 'pointer', textAlign: 'left', fontSize: 13,
                                        fontFamily: "'Inter', sans-serif",
                                      }}
                                    >
                                      <span style={{ fontSize: 20 }}>{pc.flag}</span>
                                      <span style={{ flex: 1, fontWeight: 600, color: '#334155' }}>{pc.name}</span>
                                      <span style={{ fontSize: 12, fontWeight: 700, color: phoneCode.code === pc.code ? '#2D6A4F' : '#94A3B8' }}>
                                        {pc.code}
                                      </span>
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                          <div style={{ flex: 1, position: 'relative' }}>
                            <Phone size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94A3B8', pointerEvents: 'none', zIndex: 1 }} />
                            <input
                              type="tel"
                              value={phone}
                              placeholder="244 123 4567"
                              onFocus={() => setHoveredField('phone')}
                              onChange={e => setPhone(e.target.value.replace(/\D/g, ''))}
                              className="form-input-focus"
                              style={{ ...inputStyle(!!phone, errs.phone), paddingLeft: 38 }}
                            />
                          </div>
                        </div>
                        {hoveredField === 'phone' && (
                          <FieldTooltip
                            guide={FIELD_GUIDES.find(g => g.field === 'phone')}
                            onDismiss={() => setHoveredField(null)}
                          />
                        )}
                        {errs.phone && (
                          <p style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#EF4444', marginTop: 5, fontWeight: 500 }}>
                            <AlertCircle size={10} />{errs.phone}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Full Name */}
                    <div
                      style={{ position: 'relative' }}
                      onMouseEnter={() => setHoveredField('fullName')}
                      onMouseLeave={() => setHoveredField(null)}
                    >
                      <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Full Name
                      </label>
                      <div style={{ position: 'relative' }}>
                        <User size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#94A3B8', pointerEvents: 'none', zIndex: 1 }} />
                        <input id="reg-fullname-input"
                          type="text"
                          value={fullName}
                          placeholder="John Doe"
                          onChange={e => setFullName(e.target.value)}
                          className="form-input-focus"
                          style={inputStyle(!!fullName, errs.fullName)}
                        />
                        {hoveredField === 'fullName' && (
                          <FieldTooltip
                            guide={FIELD_GUIDES.find(g => g.field === 'fullName')}
                            onDismiss={() => setHoveredField(null)}
                          />
                        )}
                      </div>
                      {errs.fullName && (
                        <p style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#EF4444', marginTop: 5, fontWeight: 500 }}>
                          <AlertCircle size={10} />{errs.fullName}
                        </p>
                      )}
                    </div>

                    {/* Username */}
                    <div
                      style={{ position: 'relative' }}
                      onMouseEnter={() => setHoveredField('username')}
                      onMouseLeave={() => setHoveredField(null)}
                    >
                      <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Username
                      </label>
                      <div style={{ position: 'relative' }}>
                        <AtSign size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#94A3B8', pointerEvents: 'none', zIndex: 1 }} />
                        <input id="reg-username-input"
                          type="text"
                          value={username}
                          placeholder="john_doe"
                          onChange={e => setUsername(e.target.value.toLowerCase())}
                          className="form-input-focus"
                          style={inputStyle(!!username, errs.username)}
                        />
                        {hoveredField === 'username' && (
                          <FieldTooltip
                            guide={FIELD_GUIDES.find(g => g.field === 'username')}
                            onDismiss={() => setHoveredField(null)}
                          />
                        )}
                      </div>
                      {errs.username && (
                        <p style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#EF4444', marginTop: 5, fontWeight: 500 }}>
                          <AlertCircle size={10} />{errs.username}
                        </p>
                      )}
                    </div>

                    {/* Password */}
                    <div
                      style={{ position: 'relative' }}
                      onMouseEnter={() => setHoveredField('password')}
                      onMouseLeave={() => setHoveredField(null)}
                    >
                      <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Password
                      </label>
                      <div style={{ position: 'relative' }}>
                        <Lock size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#94A3B8', pointerEvents: 'none', zIndex: 1 }} />
                        <input id="reg-password-input"
                          type={showPw ? 'text' : 'password'}
                          value={password}
                          placeholder="••••••••"
                          onChange={e => setPassword(e.target.value)}
                          className="form-input-focus"
                          style={inputWithRightIcon(!!password, errs.password)}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPw(!showPw)}
                          style={{
                            position: 'absolute', right: 14, top: '50%',
                            transform: 'translateY(-50%)', background: 'none',
                            border: 'none', cursor: 'pointer', color: '#94A3B8',
                            padding: 4, display: 'flex', alignItems: 'center'
                          }}
                        >
                          {showPw ? <EyeOff size={17} /> : <Eye size={17} />}
                        </button>
                        {hoveredField === 'password' && (
                          <FieldTooltip
                            guide={FIELD_GUIDES.find(g => g.field === 'password')}
                            onDismiss={() => setHoveredField(null)}
                          />
                        )}
                      </div>
                      {errs.password && (
                        <p style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#EF4444', marginTop: 5, fontWeight: 500 }}>
                          <AlertCircle size={10} />{errs.password}
                        </p>
                      )}
                      <PwStrength password={password} />
                    </div>

                    {/* Confirm Password */}
                    <div
                      style={{ position: 'relative' }}
                      onMouseEnter={() => setHoveredField('confirm')}
                      onMouseLeave={() => setHoveredField(null)}
                    >
                      <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Confirm Password
                      </label>
                      <div style={{ position: 'relative' }}>
                        <Lock size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#94A3B8', pointerEvents: 'none', zIndex: 1 }} />
                        <input id="reg-confirm-password-input"
                          type={showConfirm ? 'text' : 'password'}
                          value={confirm}
                          placeholder="Repeat your password"
                          onChange={e => setConfirm(e.target.value)}
                          className="form-input-focus"
                          style={inputWithRightIcon(!!confirm, errs.confirm)}
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirm(!showConfirm)}
                          style={{
                            position: 'absolute', right: 14, top: '50%',
                            transform: 'translateY(-50%)', background: 'none',
                            border: 'none', cursor: 'pointer', color: '#94A3B8',
                            padding: 4, display: 'flex', alignItems: 'center'
                          }}
                        >
                          {showConfirm ? <EyeOff size={17} /> : <Eye size={17} />}
                        </button>
                        {hoveredField === 'confirm' && (
                          <FieldTooltip
                            guide={FIELD_GUIDES.find(g => g.field === 'confirm')}
                            onDismiss={() => setHoveredField(null)}
                          />
                        )}
                      </div>
                      {errs.confirm && (
                        <p style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#EF4444', marginTop: 5, fontWeight: 500 }}>
                          <AlertCircle size={10} />{errs.confirm}
                        </p>
                      )}
                    </div>

                    {/* Terms */}
                    <div
                      style={{ position: 'relative' }}
                      onMouseEnter={() => setHoveredField('agreed')}
                      onMouseLeave={() => setHoveredField(null)}
                    >
                      <div
                        id="reg-terms-checkbox"
                        onClick={() => setAgreed(!agreed)}
                        style={{
                          display: 'flex', alignItems: 'flex-start', gap: 10,
                          cursor: 'pointer', padding: 4, borderRadius: 10,
                          transition: 'background 0.2s'
                        }}
                      >
                        <div style={{
                          width: 22, height: 22, borderRadius: 7,
                          border: `2px solid ${errs.agreed ? '#EF4444' : agreed ? '#2D6A4F' : '#CBD5E1'}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          flexShrink: 0, marginTop: 1, transition: 'all 0.2s',
                          cursor: 'pointer', background: agreed ? '#2D6A4F' : 'transparent'
                        }}>
                          {agreed && <Check size={12} color="white" />}
                        </div>
                        <p style={{ fontSize: 12, lineHeight: 1.5, color: '#64748B', margin: 0 }}>
                          I agree to the{' '}
                          <a href="/terms" style={{ color: '#2D6A4F', fontWeight: 700, textDecoration: 'none' }} onClick={e => e.stopPropagation()}>
                            Terms of Service
                          </a>
                          {' '}and{' '}
                          <a href="/privacy" style={{ color: '#2D6A4F', fontWeight: 700, textDecoration: 'none' }} onClick={e => e.stopPropagation()}>
                            Privacy Policy
                          </a>.
                          I understand all trades are escrow-protected.
                        </p>
                      </div>
                      {hoveredField === 'agreed' && (
                        <FieldTooltip
                          guide={FIELD_GUIDES.find(g => g.field === 'agreed')}
                          onDismiss={() => setHoveredField(null)}
                        />
                      )}
                      {errs.agreed && (
                        <p style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#EF4444', marginTop: 5, fontWeight: 500 }}>
                          <AlertCircle size={10} />{errs.agreed}
                        </p>
                      )}
                    </div>

                    {/* Submit */}
                    <div
                      style={{ position: 'relative' }}
                      onMouseEnter={() => setHoveredField('submit')}
                      onMouseLeave={() => setHoveredField(null)}
                    >
                      <button
                        id="reg-submit-btn"
                        onClick={handleRegister}
                        disabled={loading}
                        className="submit-btn"
                      >
                        {loading ? (
                          <>
                            <RefreshCw size={16} className="animate-spin" />
                            Creating Account…
                          </>
                        ) : (
                          <>
                            Create Account
                            <ArrowRight size={16} />
                          </>
                        )}
                      </button>
                      {hoveredField === 'submit' && (
                        <FieldTooltip
                          guide={FIELD_GUIDES.find(g => g.field === 'submit')}
                          onDismiss={() => setHoveredField(null)}
                        />
                      )}
                    </div>

                    {/* Sign In Link */}
                    <p style={{ textAlign: 'center', fontSize: 13, color: '#64748B', margin: 0 }}>
                      Already have an account?{' '}
                      <Link to="/login" style={{ color: '#2D6A4F', fontWeight: 700, textDecoration: 'none' }}>
                        Sign In
                      </Link>
                    </p>
                  </div>
                )}

                {/* FORGOT PASSWORD f1 */}
                {step === 'f1' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {globalError && (
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '10px 14px', borderRadius: 12, fontSize: 12,
                        background: '#FEF2F2', color: '#EF4444',
                        border: '1.5px solid #FECACA'
                      }}>
                        <AlertCircle size={14} style={{ flexShrink: 0 }} />
                        {globalError}
                      </div>
                    )}

                    <div className="method-toggle">
                      <button onClick={() => setMethod('email')} className={`method-btn ${method === 'email' ? 'active' : ''}`}>
                        <Mail size={14} />Email
                      </button>
                      <button onClick={() => setMethod('phone')} className={`method-btn ${method === 'phone' ? 'active' : ''}`}>
                        <Smartphone size={14} />Phone
                      </button>
                    </div>

                    {method === 'email' ? (
                      <div>
                        <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                          Email Address
                        </label>
                        <div style={{ position: 'relative' }}>
                          <Mail size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#94A3B8', pointerEvents: 'none', zIndex: 1 }} />
                          <input id="reg-email-input" type="email" value={email} placeholder="you@example.com"
                            onChange={e => setEmail(e.target.value)} className="form-input-focus"
                            style={inputStyle(!!email, errs.email)} />
                        </div>
                        {errs.email && <p style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#EF4444', marginTop: 5, fontWeight: 500 }}><AlertCircle size={10} />{errs.email}</p>}
                      </div>
                    ) : (
                      <div>
                        <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                          Phone Number
                        </label>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button onClick={() => setShowCodes(!showCodes)} style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            padding: '13px 14px', border: '2px solid #E2E8F0',
                            borderRadius: 14, background: 'white', cursor: 'pointer',
                            fontSize: 13, fontWeight: 600, color: '#334155', flexShrink: 0,
                            fontFamily: "'Inter', sans-serif",
                          }}>
                            <span style={{ fontSize: 18 }}>{phoneCode.flag}</span>
                            <span>{phoneCode.code}</span>
                          </button>
                          <div style={{ flex: 1, position: 'relative' }}>
                            <Phone size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94A3B8', pointerEvents: 'none', zIndex: 1 }} />
                            <input type="tel" value={phone} placeholder="244 123 4567"
                              onChange={e => setPhone(e.target.value.replace(/\D/g, ''))} className="form-input-focus"
                              style={{ ...inputStyle(!!phone, errs.phone), paddingLeft: 38 }} />
                          </div>
                        </div>
                        {errs.phone && <p style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#EF4444', marginTop: 5, fontWeight: 500 }}><AlertCircle size={10} />{errs.phone}</p>}
                      </div>
                    )}

                    <button onClick={sendOTP} disabled={loading} className="submit-btn">
                      {loading ? <><RefreshCw size={16} className="animate-spin" />Sending code…</> : <>Send Reset Code <ArrowRight size={16} /></>}
                    </button>

                    <button onClick={backToRegister} style={{
                      width: '100%', background: 'none', border: 'none', cursor: 'pointer',
                      fontSize: 13, fontWeight: 600, color: '#64748B', padding: 8,
                      fontFamily: "'Inter', sans-serif",
                    }}>
                      ← Back to Register
                    </button>
                  </div>
                )}

                {/* FORGOT f2 OTP */}
                {step === 'f2' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{
                        width: 56, height: 56, borderRadius: 16,
                        background: 'rgba(45,106,79,0.08)', display: 'flex',
                        alignItems: 'center', justifyContent: 'center',
                        margin: '0 auto 12px', fontSize: 26
                      }}>
                        {method === 'email' ? <Mail size={26} style={{ color: '#2D6A4F' }} /> : <Smartphone size={26} style={{ color: '#2D6A4F' }} />}
                      </div>
                      <p style={{ fontSize: 12, color: '#64748B', margin: '0 0 4px' }}>We sent a 6-digit code to</p>
                      <p style={{ fontSize: 14, fontWeight: 700, color: '#1B4332', margin: 0, wordBreak: 'break-all' }}>{contact}</p>
                    </div>

                    {globalError && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 12, fontSize: 12, background: '#FEF2F2', color: '#EF4444' }}>
                        <AlertCircle size={14} />{globalError}
                      </div>
                    )}

                    <OTPInput value={otp} onChange={setOtp} hasError={!!otpError} />

                    {otpError && (
                      <p style={{ textAlign: 'center', fontSize: 12, fontWeight: 600, color: '#EF4444', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, margin: 0 }}>
                        <AlertCircle size={11} />{otpError}
                      </p>
                    )}

                    <button onClick={verifyOTP} disabled={loading || otp.length < 6} className="submit-btn">
                      {loading ? <><RefreshCw size={16} className="animate-spin" />Verifying…</> : <>Verify Code <ArrowRight size={16} /></>}
                    </button>

                    <div style={{ textAlign: 'center' }}>
                      {otpTimer > 0 ? (
                        <p style={{ fontSize: 12, color: '#94A3B8', margin: 0 }}>
                          Resend in <span style={{ fontWeight: 700, color: '#2D6A4F' }}>{otpTimer}s</span>
                        </p>
                      ) : (
                        <button onClick={() => { setOtp(''); sendOTP(); }} style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          fontSize: 12, fontWeight: 700, color: '#2D6A4F',
                          display: 'flex', alignItems: 'center', gap: 5, margin: '0 auto',
                          fontFamily: "'Inter', sans-serif",
                        }}>
                          <RefreshCw size={11} />Resend Code
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* FORGOT f3 New Password */}
                {step === 'f3' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {globalError && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 12, fontSize: 12, background: '#FEF2F2', color: '#EF4444' }}>
                        <AlertCircle size={14} />{globalError}
                      </div>
                    )}

                    <div>
                      <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        New Password
                      </label>
                      <div style={{ position: 'relative' }}>
                        <Lock size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#94A3B8', pointerEvents: 'none', zIndex: 1 }} />
                        <input type={showPw ? 'text' : 'password'} value={password}
                          placeholder="Create a new strong password"
                          onChange={e => setPassword(e.target.value)} className="form-input-focus"
                          style={inputWithRightIcon(!!password, errs.password)} />
                        <button type="button" onClick={() => setShowPw(!showPw)} style={{
                          position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)',
                          background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8',
                          padding: 4, display: 'flex', alignItems: 'center'
                        }}>
                          {showPw ? <EyeOff size={17} /> : <Eye size={17} />}
                        </button>
                      </div>
                      {errs.password && <p style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#EF4444', marginTop: 5, fontWeight: 500 }}><AlertCircle size={10} />{errs.password}</p>}
                      <PwStrength password={password} />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Confirm New Password
                      </label>
                      <div style={{ position: 'relative' }}>
                        <Lock size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#94A3B8', pointerEvents: 'none', zIndex: 1 }} />
                        <input type={showConfirm ? 'text' : 'password'} value={confirm}
                          placeholder="Repeat your password"
                          onChange={e => setConfirm(e.target.value)} className="form-input-focus"
                          style={inputWithRightIcon(!!confirm, errs.confirm)} />
                        <button type="button" onClick={() => setShowConfirm(!showConfirm)} style={{
                          position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)',
                          background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8',
                          padding: 4, display: 'flex', alignItems: 'center'
                        }}>
                          {showConfirm ? <EyeOff size={17} /> : <Eye size={17} />}
                        </button>
                      </div>
                      {errs.confirm && <p style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#EF4444', marginTop: 5, fontWeight: 500 }}><AlertCircle size={10} />{errs.confirm}</p>}
                    </div>

                    <button onClick={handleResetPassword} disabled={loading} className="submit-btn">
                      {loading ? <><RefreshCw size={16} className="animate-spin" />Resetting…</> : <>Reset Password <ArrowRight size={16} /></>}
                    </button>
                  </div>
                )}

                {/* Success States */}
                {step === 4 && (
                  <div style={{ textAlign: 'center', padding: '16px 0' }}>
                    <div style={{
                      width: 80, height: 80, borderRadius: '50%',
                      background: 'rgba(16,185,129,0.1)', display: 'flex',
                      alignItems: 'center', justifyContent: 'center',
                      margin: '0 auto 20px'
                    }}>
                      <CheckCircle size={42} style={{ color: '#10B981' }} />
                    </div>
                    <h3 style={{ fontSize: 24, fontWeight: 800, color: '#1B4332', margin: '0 0 8px', fontFamily: "'Outfit', sans-serif" }}>
                      Welcome to <span className="shimmer-text">PRAQEN</span>! <PartyPopper size={18} style={{ color: '#F4A422', verticalAlign: 'middle' }} />
                    </h3>
                    <p style={{ fontSize: 14, color: '#64748B', margin: '0 0 16px', lineHeight: 1.6 }}>
                      Your account is ready. Redirecting to the marketplace…
                    </p>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 12, color: '#94A3B8' }}>
                      <RefreshCw size={12} className="animate-spin" />
                      Taking you to live offers…
                    </div>
                  </div>
                )}

                {step === 'f4' && (
                  <div style={{ textAlign: 'center', padding: '16px 0' }}>
                    <div style={{
                      width: 80, height: 80, borderRadius: '50%',
                      background: 'rgba(16,185,129,0.1)', display: 'flex',
                      alignItems: 'center', justifyContent: 'center',
                      margin: '0 auto 20px'
                    }}>
                      <CheckCircle size={42} style={{ color: '#10B981' }} />
                    </div>
                    <h3 style={{ fontSize: 24, fontWeight: 800, color: '#1B4332', margin: '0 0 8px', fontFamily: "'Outfit', sans-serif" }}>
                      Password Reset! <CheckCircle size={18} style={{ color: '#10B981', verticalAlign: 'middle' }} />
                    </h3>
                    <p style={{ fontSize: 14, color: '#64748B', margin: '0 0 20px', lineHeight: 1.6 }}>
                      You can now log in with your new password.
                    </p>
                    <button onClick={() => navigate('/login')} className="submit-btn">
                      Go to Login <ArrowRight size={16} />
                    </button>
                  </div>
                )}
              </div>

              {/* Card Footer */}
              {step !== 4 && step !== 'f4' && (
                <div className="card-footer-bar">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#94A3B8' }}>
                    <Shield size={11} />
                    <span>SSL · Zero fraud</span>
                  </div>
                  <div>
                    {mode === 'register' && step === 1 && (
                      <button onClick={startForgot} style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        fontSize: 12, fontWeight: 600, color: '#2D6A4F',
                        fontFamily: "'Inter', sans-serif", padding: '4px 8px',
                        borderRadius: 8, transition: 'background 0.2s'
                      }}>
                        Forgot password?
                      </button>
                    )}
                    {mode === 'forgot' && (
                      <button onClick={backToRegister} style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        fontSize: 12, fontWeight: 600, color: '#64748B',
                        fontFamily: "'Inter', sans-serif", padding: '4px 8px',
                        borderRadius: 8,
                      }}>
                        ← Register instead
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}