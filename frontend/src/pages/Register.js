import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import SEO from '../components/SEO';
import AuthLayout from '../components/AuthLayout';
import axios from 'axios';
import { API_URL } from '../App';
import {
  Mail, Lock, User, Eye, EyeOff, Shield, ShieldCheck, CheckCircle,
  ArrowRight, ArrowLeft, RefreshCw, AlertCircle, Smartphone,
  AtSign, Check, Gift, Phone, Headphones, Trophy,
  Bitcoin, Zap, Globe, TrendingUp, Users, Star,
  ArrowUpRight, CircleDollarSign, Wallet, BarChart3, MapPin, PartyPopper,
  Upload, Bell
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

const FEATURES = [
  { icon: ShieldCheck, title: 'Secure escrow', desc: 'Funds are held safely and released only when the trade is completed.' },
  { icon: Zap, title: 'Trade protection', desc: 'Platform rules and safety checks help protect every transaction.' },
  { icon: Headphones, title: '24/7 Support', desc: 'Our team is available anytime to help resolve issues.' },
  { icon: Trophy, title: 'Partner Program', desc: 'Earn by inviting traders. Get lifetime commissions and shared rewards based on trading activity.' },
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
            fontFamily: "'IBM Plex Sans', sans-serif",
          }}
        />
      ))}
    </div>
  );
}

// ─── Welcome gate for traders coming from another P2P platform ──────────────
// Shown once, before the normal signup form. Captures an email + a screenshot
// of their existing P2P profile (so the team can see their username and
// feedback/trade count) for manual review — it never blocks registration.
// We never name a specific outside platform.
const MIGRATION_PLATFORMS = [
  { id: 'other', label: 'Another P2P platform' },
];

function P2PWelcomeGate({ userEmail, onDone }) {
  const [stage, setStage] = useState('intro'); // intro | form | submitted
  const [platform, setPlatform] = useState(null);
  const [email, setEmail] = useState(userEmail || '');
  const [screenshotFile, setScreenshotFile] = useState(null);
  const [screenshotPreview, setScreenshotPreview] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const finish = () => onDone();

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
      fontFamily: "'IBM Plex Sans', -apple-system, BlinkMacSystemFont, sans-serif",
    }}>
      <style>{`@keyframes p2pSpin { to { transform: rotate(360deg); } } .p2p-spin { animation: p2pSpin 0.7s linear infinite; }`}</style>
      <div style={{ width: '100%', maxWidth: 460 }}>
        <div style={{ background: '#FFFFFF', borderRadius: 28, boxShadow: '0 20px 60px rgba(27,67,50,0.12), 0 0 0 1px rgba(27,67,50,0.06)', overflow: 'hidden' }}>

          {stage === 'submitted' ? (
            <div style={{ padding: '48px 32px 40px', textAlign: 'center' }}>
              <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'rgba(16,185,129,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                <CheckCircle size={42} style={{ color: '#10B981' }} />
              </div>
              <h3 style={{ fontSize: 24, fontWeight: 800, color: C.forest, margin: '0 0 8px' }}>Awesome, you're in!</h3>
              <p style={{ fontSize: 14, color: C.g500, margin: '0 0 16px', lineHeight: 1.6 }}>
                Thanks for sharing your {platformLabel} profile — our team will take a look and reach out soon. In the meantime, let's get your PRAQEN account set up!
              </p>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 16px', borderRadius: 14, background: '#FFFBEB', border: '1px solid #FDE68A', textAlign: 'left', marginBottom: 24 }}>
                <Bell size={16} style={{ color: '#92400E', flexShrink: 0, marginTop: 1 }} />
                <p style={{ fontSize: 12.5, color: '#92400E', margin: 0, lineHeight: 1.6, fontWeight: 600 }}>
                  Keep an eye on your <strong>Profile page</strong> — we'll send you a notification the moment your {platformLabel} reputation is approved.
                </p>
              </div>
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
                <h1 style={{ fontSize: 24, fontWeight: 800, color: '#fff', margin: '0 0 6px' }}>Welcome to PRAQEN!</h1>
                <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.78)', margin: 0, lineHeight: 1.5 }}>
                  We're so glad you're here — let's get you set up in no time.
                </p>
              </div>

              <div style={{ padding: '28px 28px 24px' }}>
                {stage === 'intro' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <p style={{ fontSize: 13, color: C.g600, lineHeight: 1.6, margin: '0 0 4px', textAlign: 'center' }}>
                      Already building a reputation on <strong style={{ color: C.g800 }}>another P2P platform</strong>? Bring it with you and skip the cold start.
                    </p>
                    {MIGRATION_PLATFORMS.map(p => (
                      <button key={p.id} onClick={() => pickPlatform(p.id)}
                        style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderRadius: 14, border: `2px solid ${C.g200}`, background: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 14, color: C.g800, fontFamily: "'IBM Plex Sans', sans-serif" }}>
                        <Globe size={18} style={{ color: C.g400, flexShrink: 0 }} />
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
                      style={{ width: '100%', padding: '14px 16px', borderRadius: 14, border: 'none', background: `linear-gradient(135deg, ${C.green}, ${C.mint})`, color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: "'IBM Plex Sans', sans-serif" }}>
                      I'm new here — let's go! <ArrowRight size={16} />
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
                    {!userEmail && (
                      <div>
                        <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6, color: C.g600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Your Email</label>
                        <div style={{ position: 'relative' }}>
                          <Mail size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: C.g400 }} />
                          <input type="email" value={email} onChange={e => { setEmail(e.target.value); setError(''); }}
                            placeholder="you@example.com"
                            style={{ width: '100%', padding: '13px 14px 13px 44px', fontSize: 14, borderRadius: 14, border: `2px solid ${email ? C.green : C.g200}`, outline: 'none', color: C.g800, fontFamily: "'IBM Plex Sans', sans-serif" }} />
                        </div>
                      </div>
                    )}

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
                      style={{ width: '100%', padding: 15, borderRadius: 14, border: 'none', background: `linear-gradient(135deg, ${C.green}, ${C.mint})`, color: '#fff', fontSize: 15, fontWeight: 700, cursor: submitting ? 'not-allowed' : 'pointer', opacity: submitting ? 0.6 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: "'IBM Plex Sans', sans-serif" }}>
                      {submitting ? <><RefreshCw size={16} className="p2p-spin" /> Submitting…</> : <>Submit for Review <ArrowRight size={16} /></>}
                    </button>

                    <button onClick={() => { setStage('intro'); setError(''); }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: C.g500, fontFamily: "'IBM Plex Sans', sans-serif" }}>
                      ← Back
                    </button>
                  </div>
                )}
              </div>

              {stage === 'form' && (
                <div style={{ padding: '14px 28px', borderTop: `1px solid ${C.g100}`, background: C.g50, textAlign: 'center' }}>
                  <button onClick={finish}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: C.g500, fontFamily: "'IBM Plex Sans', sans-serif" }}>
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
  const [showMigrationGate, setShowMigrationGate] = useState(false);
  const pendingNavRef = useRef(null);
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
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errs, setErrs] = useState({});
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
      });
      if (res.data.success && res.data.token) {
        localStorage.setItem('token', res.data.token);
        onLogin(res.data.user, res.data.token);
        pendingNavRef.current = () => navigate('/buy-bitcoin');
        setShowMigrationGate(true);
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

  const googleBtnRef = useRef(null);

  useEffect(() => {
    /* global google */
    const googleClientId = process.env.REACT_APP_GOOGLE_CLIENT_ID;
    if (googleClientId && window.google && window.google.accounts) {
      try {
        window.google.accounts.id.initialize({
          client_id: googleClientId,
          callback: handleGoogleResponse,
          auto_select: false,
        });
        // Render a hidden Google button so we have a reliable click target
        if (googleBtnRef.current) {
          window.google.accounts.id.renderButton(googleBtnRef.current, {
            type: 'standard',
            size: 'large',
            shape: 'circle',
            text: 'none',
            width: 36,
          });
        }
      } catch (err) {
        console.error('Google Sign-In initialization failed:', err);
      }
    }
  }, [mode, step]);

  const triggerGoogleSignup = () => {
    // Click the hidden Google button — this always works
    const hiddenBtn = googleBtnRef.current?.querySelector('div[role="button"]');
    if (hiddenBtn) {
      hiddenBtn.click();
    }
  };

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
    if (!email) e.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = 'Enter a valid email';
    if (!password) e.password = 'Password is required';
    else if (PW_CHECKS.filter(c => c.test(password)).length < 3) e.password = 'Password is too weak';
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
        email,
        password,
      });
      if (res.data.success && res.data.token) {
        localStorage.setItem('token', res.data.token);
        // Don't call onLogin() yet — it sets `user` in App.js, and App.js's
        // /register route is `!user ? <Register/> : <Navigate to="/"/>`. Setting
        // user while we're still sitting on /register (to show the migration
        // gate below) makes the parent swap this whole component out for a
        // redirect to "/" on the very next render, before the gate or the
        // verify-email navigation ever happens — new users skipped email
        // verification entirely. Deferring onLogin() to the same moment we
        // navigate ourselves means we're already leaving /register by the
        // time App.js's redirect would apply, so nothing races it.
        // Email users go to dedicated verification page
        pendingNavRef.current = () => {
          onLogin(res.data.user, res.data.token);
          navigate(`/verify-email?email=${encodeURIComponent(email)}`);
        };
        setShowMigrationGate(true);
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
    setEmail(''); setPhone(''); setOtp(''); setPassword(''); setResetToken('');
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
    borderRadius: 12,
    border: 'none',
    color: '#1E293B',
    background: error ? '#FEF2F2' : '#F1F5F9',
    outline: 'none',
    transition: 'all 0.2s ease',
    fontFamily: "'IBM Plex Sans', sans-serif",
  });

  const inputWithRightIcon = (filled, error) => ({
    ...inputStyle(filled, error),
    paddingRight: 46,
  });

  if (showMigrationGate) {
    return <P2PWelcomeGate userEmail={email} onDone={() => {
      setShowMigrationGate(false);
      pendingNavRef.current?.();
      pendingNavRef.current = null;
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
          font-family: 'IBM Plex Sans', -apple-system, BlinkMacSystemFont, sans-serif;
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
          background: #F0F9F4;
          overscroll-behavior: none;
          -webkit-overflow-scrolling: touch;
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

        /* Form Card */
        .register-card {
          width: 100%;
          max-width: 440px;
          background: #FFFFFF;
          border-radius: 20px;
          box-shadow: 0 4px 24px rgba(27, 67, 50, 0.08), 0 0 0 1px rgba(27, 67, 50, 0.04);
          overflow: visible;
        }

        @media (min-width: 1024px) {
          .register-card {
            border-radius: 24px;
            box-shadow: 0 20px 60px rgba(27, 67, 50, 0.1), 0 0 0 1px rgba(27, 67, 50, 0.05);
          }
        }

        .card-top {
          padding: 24px 24px 16px;
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
          text-align: center;
          margin: 0 0 4px;
          letter-spacing: -0.3px;
          font-family: 'IBM Plex Sans', sans-serif;
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

        /* Method Toggle — clean segmented control */
        .method-toggle {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 4px;
          padding: 3px;
          border-radius: 10px;
          background: #F1F5F9;
          margin-bottom: 16px;
        }

        .method-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          padding: 10px 14px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 600;
          border: none;
          cursor: pointer;
          transition: all 0.2s ease;
          background: transparent;
          color: #64748B;
          font-family: 'IBM Plex Sans', sans-serif;
        }

        .method-btn.active {
          background: white;
          color: #2D6A4F;
          box-shadow: 0 1px 4px rgba(0,0,0,0.08);
        }

        /* Input Focus */
        .form-input-focus:focus {
          background: #FFFFFF !important;
          box-shadow: 0 0 0 2px rgba(45, 106, 79, 0.15) !important;
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
          font-family: 'IBM Plex Sans', sans-serif;
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

      <AuthLayout>



        {/* Main Registration Card */}
        <div className="register-card animate-in">
          {/* Heading row: title left, Google icon right */}
          <div style={{ padding: '24px 24px 16px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <h1 className="card-title">
                {mode === 'register' ? 'Create your free PraQen account' : 'Reset Password'}
              </h1>
              {/* <p className="card-subtitle">
                    {mode === 'register'
                      ? 'Join the future of P2P trading'
                      : "We'll help you get back in"
                    }
                  </p> */}
            </div>
            {mode === 'register' && step === 1 && (
              <div style={{ flexShrink: 0, position: 'relative' }}>
                <div
                  ref={googleBtnRef}
                  style={{
                    position: 'absolute',
                    opacity: 0,
                    width: 0,
                    height: 0,
                    overflow: 'hidden',
                    pointerEvents: 'none',
                  }}
                />

                <button
                  onClick={triggerGoogleSignup}
                  aria-label="Sign up with Google"
                  style={{
                    width: 40,
                    height: 40,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 0,

                    // Remove button box/background
                    border: 'none',
                    outline: 'none',
                    background: 'transparent',
                    boxShadow: 'none',
                  }}
                >
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    style={{
                      display: 'block',
                    }}
                  >
                    <path
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                      fill="#4285F4"
                    />
                    <path
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      fill="#34A853"
                    />
                    <path
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                      fill="#FBBC05"
                    />
                    <path
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                      fill="#EA4335"
                    />
                  </svg>
                </button>
              </div>
            )}
          </div>

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

                {/* Email */}
                <div
                  style={{ position: 'relative' }}
                  onMouseEnter={() => setHoveredField('email')}
                  onMouseLeave={() => setHoveredField(null)}
                >
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6, color: '#475569', letterSpacing: '0.5px' }}>
                    Email
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

                {/* Password */}
                <div
                  style={{ position: 'relative' }}
                  onMouseEnter={() => setHoveredField('password')}
                  onMouseLeave={() => setHoveredField(null)}
                >
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6, color: '#475569', letterSpacing: '0.5px' }}>
                    Password
                  </label>
                  <div style={{ position: 'relative' }}>
                    <Lock size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#94A3B8', pointerEvents: 'none', zIndex: 1 }} />
                    <input id="reg-password-input"
                      type={showPw ? 'text' : 'password'}
                      value={password}
                      placeholder="Password"
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
                        fontFamily: "'IBM Plex Sans', sans-serif",
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
                  fontFamily: "'IBM Plex Sans', sans-serif",
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
                      fontFamily: "'IBM Plex Sans', sans-serif",
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
                <h3 style={{ fontSize: 24, fontWeight: 800, color: '#1B4332', margin: '0 0 8px', fontFamily: "'IBM Plex Sans', sans-serif" }}>
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
                <h3 style={{ fontSize: 24, fontWeight: 800, color: '#1B4332', margin: '0 0 8px', fontFamily: "'IBM Plex Sans', sans-serif" }}>
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
          {step !== 4 && step !== 'f4' && mode === 'forgot' && (
            <div style={{ padding: '12px 24px', borderTop: '1px solid #F1F5F9', display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={backToRegister} style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 12, fontWeight: 600, color: '#64748B',
                fontFamily: "'IBM Plex Sans', sans-serif", padding: '4px 8px',
                borderRadius: 8,
              }}>
                ← Register instead
              </button>
            </div>
          )}
        </div>
      </AuthLayout>
    </>
  );
}
