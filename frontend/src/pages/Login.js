import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import SEO from '../components/SEO';
import axios from 'axios';
import { API_URL } from '../App';
import {
  Mail, Lock, Eye, EyeOff, Shield, ArrowRight, ArrowLeft,
  AlertCircle, RefreshCw, Smartphone, CheckCircle, ChevronDown,
  Home, Gift, Bitcoin, Star, Zap, Globe,
  Users, CircleDollarSign
} from 'lucide-react';

// Rest of the imports/constants unchanged ...


const C = {
  forest: '#1B4332', green: '#2D6A4F', mint: '#40916C',
  gold: '#F4A422', white: '#FFFFFF', mist: '#F0F9F4',
  g50: '#F8FAFC', g100: '#F1F5F9', g200: '#E2E8F0',
  g300: '#CBD5E1', g400: '#94A3B8', g500: '#64748B',
  g600: '#475569', g700: '#334155', g800: '#1E293B',
  success: '#10B981', danger: '#EF4444',
};

const COUNTRIES = [
  { flag: '🇬🇭', name: 'Ghana', code: '+233', min: 9, max: 9 },
  { flag: '🇳🇬', name: 'Nigeria', code: '+234', min: 10, max: 10 },
  { flag: '🇵🇰', name: 'Pakistan', code: '+92', min: 10, max: 10 },
  { flag: '🇰🇪', name: 'Kenya', code: '+254', min: 9, max: 9 },
  { flag: '🇿🇦', name: 'South Africa', code: '+27', min: 9, max: 9 },
  { flag: '🇹🇿', name: 'Tanzania', code: '+255', min: 9, max: 9 },
  { flag: '🇺🇬', name: 'Uganda', code: '+256', min: 9, max: 9 },
  { flag: '🇺🇸', name: 'United States', code: '+1', min: 10, max: 10 },
  { flag: '🇬🇧', name: 'United Kingdom', code: '+44', min: 10, max: 10 },
  { flag: '🇩🇪', name: 'Germany', code: '+49', min: 10, max: 11 },
  { flag: '🇫🇷', name: 'France', code: '+33', min: 9, max: 9 },
  { flag: '🇸🇦', name: 'Saudi Arabia', code: '+966', min: 9, max: 9 },
  { flag: '🇦🇪', name: 'UAE', code: '+971', min: 9, max: 9 },
  { flag: '🇮🇳', name: 'India', code: '+91', min: 10, max: 10 },
  { flag: '🇦🇺', name: 'Australia', code: '+61', min: 9, max: 9 },
  { flag: '🇨🇲', name: 'Cameroon', code: '+237', min: 9, max: 9 },

];

const BENEFITS = [
  { icon: Shield, title: '100% Escrow Protected', desc: 'Your Bitcoin is locked in secure escrow until both parties confirm the trade' },
  { icon: Zap, title: 'Lightning Fast Trades', desc: 'Complete your P2P trades in under 15 minutes with instant mobile money' },
  { icon: Globe, title: 'Best Market Rates', desc: 'Access competitive rates from verified traders across 180+ countries' },
];

const STATS = [
  { icon: Users, value: '50,000+', label: 'Active Traders' },
  { icon: Globe, value: '180+', label: 'Countries' },
  { icon: CircleDollarSign, value: '$25M+', label: 'Monthly Volume' },
  { icon: Star, value: '4.9/5', label: 'User Rating' },
];

function OtpBoxes({ value, onChange }) {
  const refs = [useRef(), useRef(), useRef(), useRef(), useRef(), useRef()];
  const digits = Array.from({ length: 6 }, (_, i) => value[i] || '');
  const focus = i => refs[i]?.current?.focus();

  const handleChange = (i, v) => {
    const d = v.replace(/\D/g, '').slice(-1);
    const arr = [...digits];
    arr[i] = d;
    onChange(arr.join(''));
    if (d && i < 5) focus(i + 1);
  };
  const handleKey = (i, e) => {
    if (e.key === 'Backspace' && !digits[i] && i > 0) {
      const arr = [...digits]; arr[i - 1] = '';
      onChange(arr.join('')); focus(i - 1);
    }
  };
  const handlePaste = e => {
    const p = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    onChange(p); focus(Math.min(p.length, 5)); e.preventDefault();
  };

  return (
    <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
      {digits.map((d, i) => (
        <input key={i} ref={refs[i]} type="text" inputMode="numeric" maxLength={1}
          value={d}
          onChange={e => handleChange(i, e.target.value)}
          onKeyDown={e => handleKey(i, e)}
          onPaste={handlePaste}
          style={{
            width: 44, height: 52, borderRadius: 12,
            textAlign: 'center', fontSize: 20, fontWeight: 800,
            border: `2px solid ${d ? '#2D6A4F' : '#E2E8F0'}`,
            color: '#1B4332', background: d ? 'rgba(45,106,79,0.04)' : '#FFFFFF',
            outline: 'none', transition: 'all 0.2s',
            fontFamily: "'Inter', sans-serif",
          }}
        />
      ))}
    </div>
  );
}

export default function Login({ onLogin }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const msg = searchParams.get('message');

  const [step, setStep] = useState('choose');
  const [otpSent, setOtpSent] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [remember, setRemember] = useState(false);
  const [country, setCountry] = useState(COUNTRIES[0]);
  const [phone, setPhone] = useState('');
  const [showDrop, setShowDrop] = useState(false);
  const [search, setSearch] = useState('');
  const [otp, setOtp] = useState('');
  const [emailOtp, setEmailOtp] = useState('');
  const [pendingEmail, setPendingEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // 2FA login state
  const [tempToken, setTempToken] = useState('');
  const [twoFAMethod, setTwoFAMethod] = useState('email');
  const [twoFACode, setTwoFACode] = useState('');
  const [twoFALoading, setTwoFALoading] = useState(false);

  const fullPhone = `${country.code}${phone.replace(/^0+/, '')}`;

  // Traders sent here from the "move my P2P feedback" prompt on Register
  // land on their Profile (with the migration card auto-opened) instead of Buy Bitcoin.
  const postLoginRedirect = (user) => {
    if (searchParams.get('next') === 'migrate' && user?.id) navigate(`/profile/${user.id}?migrate=1`);
    else navigate('/buy-bitcoin');
  };

  const go = newStep => {
    setStep(newStep); setError(''); setNotice('');
    setOtp(''); setEmailOtp(''); setOtpSent(false); setShowDrop(false); setSearch('');
  };

  const filteredCountries = COUNTRIES.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) || c.code.includes(search)
  );

  const validatePhone = () => {
    const digits = phone.replace(/^0+/, '');
    if (!digits || digits.length < country.min) {
      setError(`Enter a valid ${country.name} number (${country.min}–${country.max} digits after country code)`);
      return false;
    }
    return true;
  };

  const handleGoogleResponse = useCallback(async (response) => {
    setLoading(true);
    setError('');
    try {
      const res = await axios.post(`${API_URL}/auth/google`, {
        credential: response.credential,
      });
      if (res.data.success && res.data.token) {
        onLogin(res.data.user, res.data.token);
        postLoginRedirect(res.data.user);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Google login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [onLogin, navigate]);

  const googleInitialized = useRef(false);

  // Initialize Google Identity Services once on mount
  useEffect(() => {
    /* global google */
    if (window.google?.accounts && !googleInitialized.current) {
      try {
        window.google.accounts.id.initialize({
          client_id: process.env.REACT_APP_GOOGLE_CLIENT_ID || '',
          callback: handleGoogleResponse,
        });
        googleInitialized.current = true;
      } catch (err) {
        console.error('Google Sign-In initialization failed:', err);
      }
    }
  }, [handleGoogleResponse]);

  // Render the Google button only when the choose step is active
  useEffect(() => {
    if (step === 'choose' && window.google?.accounts) {
      const container = document.getElementById('googleBtnLogin');
      if (container) {
        try {
          container.innerHTML = '';
          window.google.accounts.id.renderButton(container, {
            theme: 'outline', size: 'large', width: '380', text: 'continue_with',
          });
        } catch (err) {
          console.error('Google Sign-In render failed:', err);
        }
      }
    }
  }, [step]);

  const handleEmailLogin = async e => {
    e?.preventDefault(); setError('');
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError('Enter a valid email address'); return; }
    if (!password) { setError('Password is required'); return; }
    setLoading(true);
    try {
      const { data } = await axios.post(`${API_URL}/auth/login`, { email, password });
      if (data.requiresOtp) {
        if (remember) localStorage.setItem('remember_contact', email);
        setPendingEmail(data.email || email);
        setEmailOtp('');
        setStep('email-otp');
        setNotice(`A 6-digit code was sent to ${data.email || email}`);
      } else if (data.success) {
        if (remember) localStorage.setItem('remember_contact', email);
        onLogin(data.user, data.token);
        postLoginRedirect(data.user);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed. Check your details and try again.');
    } finally { setLoading(false); }
  };

  const handleVerifyEmailOtp = async () => {
    if (emailOtp.length !== 6) { setError('Enter the full 6-digit code'); return; }
    setLoading(true); setError('');
    try {
      const { data } = await axios.post(`${API_URL}/auth/verify-login-otp`, { email: pendingEmail, code: emailOtp });
      if (data.requires2FA) {
        // 2FA is enabled — show 2FA code input step
        setTempToken(data.tempToken);
        setTwoFAMethod(data.twoFactorMethod || 'email');
        let methodLabel = 'email';
        if (data.twoFactorMethod === 'sms') methodLabel = 'phone';
        else if (data.twoFactorMethod === 'whatsapp') methodLabel = 'WhatsApp';
        else if (data.twoFactorMethod === 'totp') methodLabel = 'authenticator app';
        setNotice(`Enter the code from your ${methodLabel}`);
        setTwoFACode('');
        setStep('2fa-otp');
      } else if (data.success) {
        onLogin(data.user, data.token);
        postLoginRedirect(data.user);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Invalid code. Please try again.');
      setEmailOtp('');
    } finally { setLoading(false); }
  };

  const handleVerify2FA = async () => {
    if (twoFACode.length !== 6) { setError('Enter the full 6-digit code'); return; }
    setTwoFALoading(true); setError('');
    try {
      const { data } = await axios.post(`${API_URL}/auth/verify-2fa-login`, { tempToken, code: twoFACode });
      if (data.success) {
        onLogin(data.user, data.token);
        postLoginRedirect(data.user);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Invalid code. Please try again.');
      setTwoFACode('');
    } finally { setTwoFALoading(false); }
  };

  const resend2FACode = async () => {
    setError(''); setTwoFACode(''); setNotice('');
    setLoading(true);
    try {
      // Re-send by calling login again to get a fresh OTP
      const { data } = await axios.post(`${API_URL}/auth/verify-login-otp`, { email: pendingEmail, code: emailOtp });
      if (data.requires2FA) {
        setTempToken(data.tempToken);
        setTwoFAMethod(data.twoFactorMethod || 'email');
        setNotice(`New code sent to your ${data.twoFactorMethod === 'sms' ? 'phone' : 'email'}`);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Could not resend code. Please log in again.');
    } finally { setLoading(false); }
  };

  const resendEmailOtp = async () => {
    setError(''); setEmailOtp(''); setNotice('');
    setLoading(true);
    try {
      const { data } = await axios.post(`${API_URL}/auth/login`, { email: pendingEmail, password });
      if (data.requiresOtp) setNotice(`New code sent to ${pendingEmail}`);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not resend code. Try logging in again.');
    } finally { setLoading(false); }
  };

  const sendSms = async () => {
    setError('');
    if (!validatePhone()) return;
    setLoading(true);
    try {
      await axios.post(`${API_URL}/auth/send-otp`, { phone: fullPhone, channel: 'sms' });
      setOtpSent(true); setNotice(`Code sent to ${fullPhone}`);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to send code. Try again.');
    } finally { setLoading(false); }
  };

  const verifySms = async () => {
    if (otp.length !== 6) { setError('Enter the full 6-digit code'); return; }
    setLoading(true); setError('');
    try {
      await axios.post(`${API_URL}/auth/verify-otp`, { phone: fullPhone, code: otp });
      const { data } = await axios.post(`${API_URL}/auth/login`, { phone: fullPhone, method: 'phone' });
      if (data.success) { onLogin(data.user, data.token); postLoginRedirect(data.user); }
    } catch (err) {
      setError(err.response?.data?.error || 'Invalid code. Please try again.');
      setOtp('');
    } finally { setLoading(false); }
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
          background: #F0F9F4;
          overscroll-behavior: none;
        }

        .login-layout {
          min-height: 100vh;
          min-height: 100dvh;
          display: flex;
          flex-direction: column;
          width: 100%;
        }

        @media (min-width: 1024px) {
          .login-layout {
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
        @keyframes pulse-gold {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.1); }
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

        /* Hero Panel - Desktop */
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
            background:
              radial-gradient(1100px 700px at 85% -10%, rgba(244, 164, 34, 0.16) 0%, transparent 55%),
              radial-gradient(700px 500px at 12% 0%, rgba(244, 164, 34, 0.1) 0%, transparent 60%),
              radial-gradient(900px 650px at -10% 110%, rgba(64, 145, 108, 0.42) 0%, transparent 60%),
              linear-gradient(160deg, #1B4332 0%, #1F4D3D 30%, #2D6A4F 65%, #40916C 100%);
          }
        }

        .hero-bg-pattern {
          position: absolute;
          inset: 0;
          opacity: 0.06;
          background-image:
            radial-gradient(circle at 50% 50%, white 1px, transparent 1.5px),
            radial-gradient(circle at 50% 50%, rgba(244, 164, 34, 0.55) 1px, transparent 1.5px);
          background-size: 40px 40px;
          background-position: 0 0, 20px 20px;
          -webkit-mask-image: radial-gradient(ellipse at center, black 25%, transparent 78%);
          mask-image: radial-gradient(ellipse at center, black 25%, transparent 78%);
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
          opacity: 0.12;
          filter: blur(80px);
          pointer-events: none;
        }

        /* Hero Stat Cards */
        .stat-card {
          background: linear-gradient(150deg, rgba(255, 255, 255, 0.1), rgba(240, 249, 244, 0.05));
          border: 1px solid rgba(240, 249, 244, 0.16);
          box-shadow: 0 10px 28px rgba(0, 0, 0, 0.16), inset 0 1px 0 rgba(255, 255, 255, 0.1);
          transition: transform 0.25s ease, box-shadow 0.25s ease, border-color 0.25s ease;
        }

        .stat-card:hover {
          transform: translateY(-3px);
          border-color: rgba(244, 164, 34, 0.3);
          box-shadow: 0 16px 36px rgba(0, 0, 0, 0.26), inset 0 1px 0 rgba(255, 255, 255, 0.14);
        }

        .stat-card-icon {
          background: rgba(244, 164, 34, 0.14);
          border: 1px solid rgba(244, 164, 34, 0.32);
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.18);
          transition: background 0.25s ease, transform 0.25s ease;
        }

        .stat-card:hover .stat-card-icon {
          background: rgba(244, 164, 34, 0.2);
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

        /* Mobile Hero Strip */
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

        /* Login Card */
        .login-card {
          width: 100%;
          max-width: 460px;
          background: #FFFFFF;
          border-radius: 24px;
          box-shadow: 0 4px 24px rgba(27, 67, 50, 0.08), 0 0 0 1px rgba(27, 67, 50, 0.04);
          overflow: hidden;
        }

        @media (min-width: 1024px) {
          .login-card {
            border-radius: 28px;
            box-shadow: 0 20px 60px rgba(27, 67, 50, 0.12), 0 0 0 1px rgba(27, 67, 50, 0.06);
          }
        }

        .card-top {
          padding: 24px 24px 16px;
          text-align: center;
          border-bottom: 1px solid #F1F5F9;
        }

        .card-body {
          padding: 16px 24px 24px;
        }

        .card-footer-bar {
          padding: 12px 24px;
          border-top: 1px solid #F1F5F9;
          background: #F8FAFC;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        /* Method Cards */
        .method-card {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 16px;
          border-radius: 16px;
          border: 2px solid #E2E8F0;
          background: white;
          cursor: pointer;
          transition: all 0.2s ease;
          width: 100%;
          text-align: left;
          font-family: 'Inter', sans-serif;
        }

        .method-card:hover {
          border-color: #2D6A4F;
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(27,67,50,0.1);
        }

        .method-icon {
          width: 48px;
          height: 48px;
          border-radius: 14px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        /* Submit Button */
        .submit-btn {
          width: 100%;
          padding: 15px;
          border-radius: 14px;
          border: none;
          font-size: 15px;
          font-weight: 700;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          cursor: pointer;
          transition: all 0.2s ease;
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

        .submit-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
          transform: none !important;
        }

        .form-input-focus:focus {
          border-color: #2D6A4F !important;
          box-shadow: 0 0 0 4px rgba(45, 106, 79, 0.08) !important;
        }
      `}</style>

      <div className="login-layout">
        {/* Desktop Left Hero Panel */}
        <div className="hero-panel">
          <div className="hero-bg-pattern" />
          <div className="hero-glow-1" />
          <div className="hero-glow-2" />

          <div style={{ position: 'relative', zIndex: 2 }}>
            {/* Brand Badge */}
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 24px',
              borderRadius: 50,
              background: 'linear-gradient(135deg, rgba(27, 67, 50, 0.96), rgba(45, 106, 79, 0.78))',
              border: '1px solid rgba(244, 164, 34, 0.55)',
              boxShadow: '0 10px 28px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.16), 0 0 0 4px rgba(244, 164, 34, 0.06)',
              backdropFilter: 'blur(12px)',
              marginBottom: 36
            }}>
              <Bitcoin size={22} style={{ color: '#F4A422' }} />
              <span style={{ color: 'white', fontWeight: 800, letterSpacing: '4px', fontSize: 15 }}>
                PRAQEN
              </span>
            </div>

            <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <span style={{
                  width: 26, height: 3, borderRadius: 2,
                  background: 'linear-gradient(90deg, #F4A422, rgba(244, 164, 34, 0))',
                  flexShrink: 0
                }} />
                <span style={{
                  fontSize: 11, fontWeight: 700, letterSpacing: '3px', color: '#F4A422',
                  textTransform: 'uppercase', lineHeight: 1
                }}>
                  Sign In
                </span>
              </div>
              <h1 style={{
                fontFamily: "'Outfit', sans-serif",
                fontSize: 44,
                fontWeight: 900,
                color: 'white',
                lineHeight: 1.08,
                margin: 0,
                letterSpacing: '-1px'
              }}>
                Welcome Back!
              </h1>
            </div>

            <p style={{
              fontSize: 16,
              color: 'rgba(255, 255, 255, 0.7)',
              lineHeight: 1.6,
              margin: '0 0 40px',
              fontWeight: 400
            }}>
              Sign in to continue trading Bitcoin &amp; USDT peer-to-peer with confidence.
            </p>

            {/* Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 40 }}>
              {STATS.map(({ icon: Icon, value, label }) => (
                <div key={label} className="stat-card" style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  padding: '18px 18px', borderRadius: 18,
                  backdropFilter: 'blur(12px)'
                }}>
                  <div className="stat-card-icon" style={{
                    width: 46, height: 46, borderRadius: 13,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#F4A422', flexShrink: 0
                  }}>
                    <Icon size={21} />
                  </div>
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: 'white', lineHeight: 1.2 }}>{value}</div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.6px', marginTop: 3 }}>{label}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{
            position: 'relative', zIndex: 2, display: 'flex', alignItems: 'center', gap: 10,
            color: 'rgba(255,255,255,0.72)', fontSize: 12, marginTop: 'auto',
            paddingTop: 24, borderTop: '1px solid rgba(255,255,255,0.12)'
          }}>
            <Shield size={15} style={{ color: '#F4A422', flexShrink: 0 }} />
            <span style={{ lineHeight: 1.4 }}>All data encrypted · SOC 2 Type II · ISO 27001</span>
          </div>
        </div>

        {/* Right Form Panel */}
        <div className="form-panel">
          <div style={{ width: '100%', maxWidth: 460 }}>
            {/* Mobile Hero Strip */}
            <div className="mobile-hero-strip">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '6px 14px', borderRadius: 50,
                  background: 'linear-gradient(135deg, #1B4332, #2D6A4F)',
                }}>
                  <Bitcoin size={16} style={{ color: '#F4A422' }} />
                  <span style={{ color: 'white', fontWeight: 700, fontSize: 12, letterSpacing: '2px' }}>
                    PRAQEN
                  </span>
                </div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#2D6A4F', display: 'flex', alignItems: 'center', gap: 4 }}>
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

            {/* Login Card */}
            <div className="login-card animate-in">
              <div className="card-top">
                <h1 style={{
                  fontSize: 22,
                  fontWeight: 800,
                  color: '#1B4332',
                  margin: '0 0 4px',
                  letterSpacing: '-0.3px',
                  fontFamily: "'Outfit', sans-serif"
                }}>
                  {step === 'choose' ? 'Sign In' : step === 'email' ? 'Email Sign In' : step === 'email-otp' ? 'Check Your Email' : step === '2fa-otp' ? 'Two-Factor Auth' : otpSent ? 'Verify Code' : 'Phone Sign In'}
                </h1>
                <p style={{ fontSize: 13, color: '#64748B', margin: 0, fontWeight: 400 }}>
                  {step === 'choose' ? 'Choose your sign-in method'
                    : step === 'email' ? 'Sign in with your email & password'
                      : step === 'email-otp' ? `We sent a 6-digit code to ${pendingEmail}`
                        : step === '2fa-otp' ? `Enter the code from your ${twoFAMethod === 'sms' ? 'phone' : twoFAMethod === 'whatsapp' ? 'WhatsApp' : twoFAMethod === 'totp' ? 'authenticator app' : 'email'}`
                          : otpSent ? `Code sent to ${fullPhone}`
                            : "We'll send a 6-digit code via SMS"}
                </p>
              </div>

              <div className="card-body animate-fade" key={step + String(otpSent)}>
                {/* Alerts */}
                {msg && !error && (
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 14px', borderRadius: 12, fontSize: 12, background: '#FFFBEB', color: '#92400E', border: '1.5px solid #FDE68A', marginBottom: 14 }}>
                    <AlertCircle size={13} style={{ flexShrink: 0, marginTop: 1 }} />{msg}
                  </div>
                )}
                {error && (
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 14px', borderRadius: 12, fontSize: 12, background: '#FEF2F2', color: '#EF4444', border: '1.5px solid #FECACA', marginBottom: 14 }}>
                    <AlertCircle size={13} style={{ flexShrink: 0, marginTop: 1 }} />{error}
                  </div>
                )}
                {notice && !error && (
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 14px', borderRadius: 12, fontSize: 12, background: '#F0FDF4', color: '#10B981', border: '1.5px solid #BBF7D0', marginBottom: 14 }}>
                    <CheckCircle size={13} style={{ flexShrink: 0, marginTop: 1 }} />{notice}
                  </div>
                )}

                {step === 'choose' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {/* Google OAuth Button */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, margin: '4px 0 8px' }}>
                      <div id="googleBtnLogin" style={{ minHeight: 40 }}></div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ flex: 1, height: 1, background: '#E2E8F0' }}></div>
                        <span style={{ fontSize: 11, color: '#94A3B8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Or continue with</span>
                        <div style={{ flex: 1, height: 1, background: '#E2E8F0' }}></div>
                      </div>
                    </div>

                    {/* Email Method */}
                    <button className="method-card" onClick={() => go('email')}>
                      <div className="method-icon" style={{ background: 'linear-gradient(135deg, #2D6A4F, #40916C)' }}>
                        <Mail size={22} color="white" />
                      </div>
                      <div style={{ flex: 1 }}>
                        <p style={{ fontWeight: 700, fontSize: 14, color: '#1B4332', margin: '0 0 2px' }}>
                          Continue with Email
                        </p>
                        <p style={{ fontSize: 12, color: '#64748B', margin: 0 }}>
                          Sign in with your email & password
                        </p>
                      </div>
                      <ArrowRight size={18} style={{ color: '#CBD5E1', flexShrink: 0 }} />
                    </button>

                    {/* Phone Method */}
                    <button className="method-card" onClick={() => go('sms')}>
                      <div className="method-icon" style={{ background: 'linear-gradient(135deg, #3B82F6, #6366F1)' }}>
                        <Smartphone size={22} color="white" />
                      </div>
                      <div style={{ flex: 1 }}>
                        <p style={{ fontWeight: 700, fontSize: 14, color: '#1B4332', margin: '0 0 2px' }}>
                          Continue with Phone (SMS)
                        </p>
                        <p style={{ fontSize: 12, color: '#64748B', margin: 0 }}>
                          Get a one-time 6-digit code via text
                        </p>
                      </div>
                      <ArrowRight size={18} style={{ color: '#CBD5E1', flexShrink: 0 }} />
                    </button>

                    {/* Trust Pills */}
                    <div style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      gap: 16, padding: '12px', borderRadius: 12,
                      background: '#F8FAFC', border: '1px solid #F1F5F9',
                      flexWrap: 'wrap'
                    }}>
                      {[
                        { Icon: Lock, label: '256-bit SSL' },
                        { Icon: CheckCircle, label: '2.4M+ traders' },
                        { Icon: Globe, label: '180+ countries' }
                      ].map(({ Icon, label: lb }) => (
                        <div key={lb} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: '#64748B' }}>
                          <Icon size={13} style={{ color: '#2D6A4F', flexShrink: 0 }} />
                          {lb}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* EMAIL STEP */}
                {step === 'email' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '10px 14px', borderRadius: 12,
                      background: 'rgba(45,106,79,0.06)', border: '1.5px solid rgba(45,106,79,0.15)'
                    }}>
                      <Mail size={14} style={{ color: '#2D6A4F' }} />
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#2D6A4F' }}>Email Sign In</span>
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Email Address
                      </label>
                      <div style={{ position: 'relative' }}>
                        <Mail size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#94A3B8', pointerEvents: 'none', zIndex: 1 }} />
                        <input type="email" value={email}
                          onChange={e => { setEmail(e.target.value); setError(''); }}
                          onKeyDown={e => e.key === 'Enter' && handleEmailLogin(e)}
                          placeholder="you@example.com"
                          className="form-input-focus"
                          style={inputStyle(!!email, false)} />
                      </div>
                    </div>

                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <label style={{ fontSize: 12, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                          Password
                        </label>
                        <Link to="/forgot-password" style={{ fontSize: 12, fontWeight: 600, color: '#2D6A4F', textDecoration: 'none' }}>
                          Forgot?
                        </Link>
                      </div>
                      <div style={{ position: 'relative' }}>
                        <Lock size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#94A3B8', pointerEvents: 'none', zIndex: 1 }} />
                        <input type={showPw ? 'text' : 'password'} value={password}
                          onChange={e => { setPassword(e.target.value); setError(''); }}
                          onKeyDown={e => e.key === 'Enter' && handleEmailLogin(e)}
                          placeholder="Enter your password"
                          className="form-input-focus"
                          style={inputWithRightIcon(!!password, false)} />
                        <button type="button" onClick={() => setShowPw(!showPw)}
                          style={{
                            position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)',
                            background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8',
                            padding: 4, display: 'flex', alignItems: 'center'
                          }}>
                          {showPw ? <EyeOff size={17} /> : <Eye size={17} />}
                        </button>
                      </div>
                    </div>

                    {/* Remember Me */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
                      onClick={() => setRemember(!remember)}>
                      <div style={{
                        width: 20, height: 20, borderRadius: 6,
                        border: `2px solid ${remember ? '#2D6A4F' : '#CBD5E1'}`,
                        background: remember ? '#2D6A4F' : 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'all 0.2s', flexShrink: 0
                      }}>
                        {remember && (
                          <svg width="11" height="9" viewBox="0 0 11 9" fill="none">
                            <path d="M1 4.5L4 7.5L10 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </div>
                      <span style={{ fontSize: 13, color: '#64748B', userSelect: 'none' }}>Remember me on this device</span>
                    </div>

                    <button onClick={handleEmailLogin} disabled={loading}
                      className="submit-btn"
                      style={{
                        background: 'linear-gradient(135deg, #2D6A4F, #40916C)',
                        color: 'white',
                        boxShadow: '0 6px 20px rgba(45, 106, 79, 0.25)'
                      }}>
                      {loading ? (
                        <><RefreshCw size={16} className="animate-spin" />Signing in…</>
                      ) : (
                        <>Sign In <ArrowRight size={16} /></>
                      )}
                    </button>
                  </div>
                )}

                {/* EMAIL OTP STEP */}
                {step === 'email-otp' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '14px', borderRadius: 14,
                      background: 'rgba(45,106,79,0.06)', border: '1.5px solid rgba(45,106,79,0.15)'
                    }}>
                      <div style={{
                        width: 40, height: 40, borderRadius: 12,
                        background: 'linear-gradient(135deg, #2D6A4F, #40916C)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                      }}>
                        <Mail size={18} color="white" />
                      </div>
                      <div>
                        <p style={{ fontWeight: 700, fontSize: 13, color: '#1B4332', margin: '0 0 2px' }}>Code sent!</p>
                        <p style={{ fontSize: 12, color: '#2D6A4F', margin: 0 }}>Check your inbox at {pendingEmail}</p>
                      </div>
                    </div>

                    <div style={{ textAlign: 'center' }}>
                      <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 12, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Enter 6-digit code
                      </label>
                      <OtpBoxes value={emailOtp} onChange={v => { setEmailOtp(v); setError(''); }} />
                    </div>

                    <button onClick={handleVerifyEmailOtp} disabled={loading || emailOtp.length !== 6}
                      className="submit-btn"
                      style={{
                        background: 'linear-gradient(135deg, #2D6A4F, #40916C)',
                        color: 'white',
                        boxShadow: '0 6px 20px rgba(45, 106, 79, 0.25)',
                        opacity: (loading || emailOtp.length !== 6) ? 0.55 : 1
                      }}>
                      {loading ? (
                        <><RefreshCw size={16} className="animate-spin" />Verifying…</>
                      ) : (
                        <>Verify & Sign In <ArrowRight size={16} /></>
                      )}
                    </button>

                    <button onClick={resendEmailOtp} disabled={loading}
                      style={{
                        width: '100%', padding: '12px', borderRadius: 12,
                        background: 'none', border: 'none', cursor: 'pointer',
                        fontSize: 13, fontWeight: 600, color: '#2D6A4F',
                        fontFamily: "'Inter', sans-serif"
                      }}>
                      ← Resend code
                    </button>
                  </div>
                )}

                {/* 2FA STEP */}
                {step === '2fa-otp' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '14px', borderRadius: 14,
                      background: 'rgba(45,106,79,0.06)', border: '1.5px solid rgba(45,106,79,0.15)'
                    }}>
                      <div style={{
                        width: 40, height: 40, borderRadius: 12,
                        background: 'linear-gradient(135deg, #2D6A4F, #40916C)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                      }}>
                        <Shield size={18} color="white" />
                      </div>
                      <div>
                        <p style={{ fontWeight: 700, fontSize: 13, color: '#1B4332', margin: '0 0 2px' }}>2FA Required</p>
                        <p style={{ fontSize: 12, color: '#2D6A4F', margin: 0 }}>Extra security check for this account</p>
                      </div>
                    </div>

                    <div style={{ textAlign: 'center' }}>
                      <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 12, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Enter 6-digit code
                      </label>
                      <OtpBoxes value={twoFACode} onChange={v => { setTwoFACode(v); setError(''); }} />
                    </div>

                    <button onClick={handleVerify2FA} disabled={twoFALoading || twoFACode.length !== 6}
                      className="submit-btn"
                      style={{
                        background: 'linear-gradient(135deg, #2D6A4F, #40916C)',
                        color: 'white',
                        boxShadow: '0 6px 20px rgba(45, 106, 79, 0.25)',
                        opacity: (twoFALoading || twoFACode.length !== 6) ? 0.55 : 1
                      }}>
                      {twoFALoading ? (
                        <><RefreshCw size={16} className="animate-spin" />Verifying…</>
                      ) : (
                        <>Verify & Sign In <ArrowRight size={16} /></>
                      )}
                    </button>

                    <button onClick={resend2FACode} disabled={loading}
                      style={{
                        width: '100%', padding: '12px', borderRadius: 12,
                        background: 'none', border: 'none', cursor: 'pointer',
                        fontSize: 13, fontWeight: 600, color: '#2D6A4F',
                        fontFamily: "'Inter', sans-serif"
                      }}>
                      ← Resend code
                    </button>
                  </div>
                )}

                {/* SMS STEP */}
                {step === 'sms' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '10px 14px', borderRadius: 12,
                      background: 'rgba(59,130,246,0.06)', border: '1.5px solid rgba(99,102,241,0.15)'
                    }}>
                      <Smartphone size={14} style={{ color: '#3B82F6' }} />
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#3B82F6' }}>Phone (SMS) Sign In</span>
                    </div>

                    {!otpSent ? (
                      <>
                        <div>
                          <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            Phone Number
                          </label>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <div style={{ position: 'relative', flexShrink: 0 }}>
                              <button onClick={() => { setShowDrop(!showDrop); setSearch(''); }}
                                style={{
                                  display: 'flex', alignItems: 'center', gap: 6,
                                  padding: '13px 14px', border: `2px solid ${showDrop ? '#2D6A4F' : '#E2E8F0'}`,
                                  borderRadius: 14, background: 'white', cursor: 'pointer',
                                  fontSize: 13, fontWeight: 600, color: '#334155',
                                  fontFamily: "'Inter', sans-serif", whiteSpace: 'nowrap'
                                }}>
                                <span style={{ fontSize: 18 }}>{country.flag}</span>
                                <span>{country.code}</span>
                                <ChevronDown size={12} style={{ color: '#94A3B8', transform: showDrop ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                              </button>
                              {showDrop && (
                                <div style={{
                                  position: 'absolute', top: 'calc(100% + 8px)', left: 0,
                                  width: 280, maxWidth: 'calc(100vw - 32px)',
                                  background: 'white', borderRadius: 18,
                                  boxShadow: '0 20px 60px rgba(0,0,0,0.15)', zIndex: 100,
                                  border: '1px solid #F1F5F9', overflow: 'hidden'
                                }}>
                                  <div style={{ padding: 10, borderBottom: '1px solid #F1F5F9' }}>
                                    <input autoFocus value={search}
                                      onChange={e => setSearch(e.target.value)}
                                      placeholder="Search country…"
                                      style={{
                                        width: '100%', padding: '10px 12px', borderRadius: 10,
                                        border: '1.5px solid #E2E8F0', fontSize: 13, color: '#1E293B',
                                        background: '#F8FAFC', outline: 'none', fontFamily: "'Inter', sans-serif"
                                      }} />
                                  </div>
                                  <div style={{ maxHeight: 220, overflowY: 'auto' }}>
                                    {filteredCountries.map(c => (
                                      <button key={`${c.name}-${c.code}`}
                                        onClick={() => { setCountry(c); setShowDrop(false); setPhone(''); setError(''); }}
                                        style={{
                                          width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                                          padding: '11px 16px', background: country.name === c.name ? 'rgba(45,106,79,0.06)' : 'transparent',
                                          border: 'none', borderBottom: '1px solid #F8FAFC',
                                          cursor: 'pointer', textAlign: 'left', fontSize: 13,
                                          fontFamily: "'Inter', sans-serif"
                                        }}>
                                        <span style={{ fontSize: 20 }}>{c.flag}</span>
                                        <span style={{ flex: 1, fontWeight: 600, color: '#334155' }}>{c.name}</span>
                                        <span style={{ fontSize: 12, fontWeight: 700, color: country.name === c.name ? '#2D6A4F' : '#94A3B8' }}>{c.code}</span>
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                            <div style={{ flex: 1, position: 'relative' }}>
                              <Smartphone size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94A3B8', pointerEvents: 'none', zIndex: 1 }} />
                              <input type="tel" value={phone}
                                onChange={e => { setPhone(e.target.value.replace(/\D/g, '')); setError(''); }}
                                placeholder={`${country.min}–${country.max} digits`}
                                className="form-input-focus"
                                style={{ ...inputStyle(!!phone, false), paddingLeft: 38 }} />
                            </div>
                          </div>
                          <p style={{ fontSize: 11, color: '#94A3B8', margin: '6px 0 0' }}>
                            {country.flag} {country.name} · {country.code} · Enter without leading zero
                          </p>
                        </div>

                        <button onClick={sendSms} disabled={loading}
                          className="submit-btn"
                          style={{
                            background: 'linear-gradient(135deg, #3B82F6, #6366F1)',
                            color: 'white',
                            boxShadow: '0 6px 20px rgba(59, 130, 246, 0.25)'
                          }}>
                          {loading ? (
                            <><RefreshCw size={16} className="animate-spin" />Sending code…</>
                          ) : (
                            <><Smartphone size={16} />Send SMS Code</>
                          )}
                        </button>
                      </>
                    ) : (
                      <>
                        <div style={{
                          display: 'flex', alignItems: 'center', gap: 12,
                          padding: '14px', borderRadius: 14,
                          background: 'rgba(59,130,246,0.06)', border: '1.5px solid rgba(99,102,241,0.15)'
                        }}>
                          <div style={{
                            width: 40, height: 40, borderRadius: 12,
                            background: 'linear-gradient(135deg, #3B82F6, #6366F1)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            flexShrink: 0
                          }}>
                            <Smartphone size={18} color="white" />
                          </div>
                          <div>
                            <p style={{ fontWeight: 700, fontSize: 13, color: '#1E40AF', margin: '0 0 2px' }}>Code sent!</p>
                            <p style={{ fontSize: 12, color: '#3B82F6', margin: 0 }}>Check messages at {fullPhone}</p>
                          </div>
                        </div>

                        <div style={{ textAlign: 'center' }}>
                          <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 12, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            Enter 6-digit code
                          </label>
                          <OtpBoxes value={otp} onChange={v => { setOtp(v); setError(''); }} />
                        </div>

                        <button onClick={verifySms} disabled={loading || otp.length !== 6}
                          className="submit-btn"
                          style={{
                            background: 'linear-gradient(135deg, #3B82F6, #6366F1)',
                            color: 'white',
                            boxShadow: '0 6px 20px rgba(59, 130, 246, 0.25)',
                            opacity: (loading || otp.length !== 6) ? 0.55 : 1
                          }}>
                          {loading ? (
                            <><RefreshCw size={16} className="animate-spin" />Verifying…</>
                          ) : (
                            <>Verify & Sign In <ArrowRight size={16} /></>
                          )}
                        </button>

                        <button onClick={() => { setOtpSent(false); setOtp(''); setError(''); setNotice(''); }}
                          style={{
                            width: '100%', padding: '12px', borderRadius: 12,
                            background: 'none', border: 'none', cursor: 'pointer',
                            fontSize: 13, fontWeight: 600, color: '#3B82F6',
                            fontFamily: "'Inter', sans-serif"
                          }}>
                          ← Resend code
                        </button>
                      </>
                    )}
                  </div>
                )}

                {/* Divider & Register CTA — hidden during OTP/2FA verification */}
                {step !== 'email-otp' && step !== '2fa-otp' && (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
                      <div style={{ flex: 1, height: 1, background: '#E2E8F0' }} />
                      <span style={{ fontSize: 11, fontWeight: 600, color: '#94A3B8' }}>OR</span>
                      <div style={{ flex: 1, height: 1, background: '#E2E8F0' }} />
                    </div>

                    <button onClick={() => navigate('/register')}
                      className="submit-btn"
                      style={{
                        background: 'none',
                        border: '2px solid #2D6A4F',
                        color: '#2D6A4F',
                        boxShadow: 'none'
                      }}>
                      Create a Free Account
                    </button>
                  </>
                )}
              </div>

              {/* Card Footer */}
              <div className="card-footer-bar">
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#94A3B8' }}>
                  <Shield size={11} />
                  <span>SSL · Zero fraud</span>
                </div>
                <button onClick={() => go(step === 'email-otp' ? 'email' : step === '2fa-otp' ? 'email' : 'choose')}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    fontSize: 12, fontWeight: 600, color: '#64748B',
                    fontFamily: "'Inter', sans-serif", padding: '4px 8px', borderRadius: 8
                  }}>
                  ← Back
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}