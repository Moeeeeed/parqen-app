import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import SEO from '../components/SEO';
import AuthLayout from '../components/AuthLayout';
import axios from 'axios';
import { API_URL } from '../App';
import {
  Mail, Lock, Eye, EyeOff, Shield, ArrowRight,
  AlertCircle, RefreshCw, CheckCircle
} from 'lucide-react';

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
    <div className="otp-boxes">
      {digits.map((d, i) => (
        <input key={i} ref={refs[i]} type="text" inputMode="numeric" maxLength={1}
          value={d}
          onChange={e => handleChange(i, e.target.value)}
          onKeyDown={e => handleKey(i, e)}
          onPaste={handlePaste}
          style={{
            width: 'clamp(34px, 11vw, 44px)', height: 'clamp(44px, 13vw, 52px)', borderRadius: 12,
            textAlign: 'center', fontSize: 20, fontWeight: 800,
            border: `2px solid ${d ? '#2D6A4F' : '#E2E8F0'}`,
            color: '#1B4332', background: d ? 'rgba(45,106,79,0.04)' : '#FFFFFF',
            outline: 'none', transition: 'all 0.2s',
            fontFamily: "'IBM Plex Sans', sans-serif",
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

  const [step, setStep] = useState('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [remember, setRemember] = useState(false);
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

  // Traders sent here from the "move my P2P feedback" prompt on Register
  // land on their Profile (with the migration card auto-opened) instead of Buy Bitcoin.
  const postLoginRedirect = (user) => {
    if (searchParams.get('next') === 'migrate' && user?.id) navigate(`/profile/${user.id}?migrate=1`);
    else navigate('/buy-bitcoin');
  };

  const go = newStep => {
    setStep(newStep); setError(''); setNotice('');
    setEmailOtp('');
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
  }, [onLogin, navigate, postLoginRedirect]);

  const googleInitialized = useRef(false);
  const googleBtnRef = useRef(null);

  // Initialize Google Identity Services once on mount
  useEffect(() => {
    /* global google */
    if (window.google?.accounts && !googleInitialized.current) {
      try {
        window.google.accounts.id.initialize({
          client_id: process.env.REACT_APP_GOOGLE_CLIENT_ID || '',
          callback: handleGoogleResponse,
          auto_select: false,
        });
        googleInitialized.current = true;
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
  }, [handleGoogleResponse]);

  const triggerGoogleLogin = () => {
    // Click the hidden Google button — this always works
    const hiddenBtn = googleBtnRef.current?.querySelector('div[role="button"]');
    if (hiddenBtn) {
      hiddenBtn.click();
    }
  };

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

  return (
    <>
      <SEO />
      <style>{`
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

        .submit-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
          transform: none !important;
        }

        .form-input-focus:focus {
          background: #FFFFFF !important;
          box-shadow: 0 0 0 2px rgba(45, 106, 79, 0.15) !important;
        }

        .otp-boxes {
          display: flex;
          justify-content: center;
          gap: clamp(4px, 2vw, 8px);
          width: 100%;
        }
      `}</style>

      <AuthLayout>
        <div className="auth-card animate-in">
          <div className="auth-card-top">
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <h1 style={{
                  fontSize: 22,
                  fontWeight: 800,
                  color: '#1B4332',
                  margin: '0 0 4px',
                  letterSpacing: '-0.3px',
                  fontFamily: "'IBM Plex Sans', sans-serif"
                }}>
                  {step === 'email' ? 'Welcome to PRAQEN' : step === 'email-otp' ? 'Check Your Email' : 'Two-Factor Auth'}
                </h1>
              </div>
              <div style={{ flexShrink: 0, position: 'relative' }}>
                {/* Hidden Google button — rendered by Google SDK, triggered by our icon */}
                <div ref={googleBtnRef} style={{ position: 'absolute', opacity: 0, width: 0, height: 0, overflow: 'hidden', pointerEvents: 'none' }} />
                {step === 'email' && (
                  <button
                    onClick={triggerGoogleLogin}
                    aria-label="Sign in with Google"
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: '50%',
                      border: 'none',
                      background: 'white',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: 0,
                      transition: 'transform 0.2s, box-shadow 0.2s',
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.boxShadow =
                        '0 3px 10px rgba(0,0,0,0.15)';
                      e.currentTarget.style.transform = 'scale(1.05)';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.boxShadow = 'none';
                      e.currentTarget.style.transform = 'scale(1)';
                    }}
                  >
                    <svg
                      width="42"
                      height="42"
                      viewBox="0 0 24 24"
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
                )}
              </div>
            </div>
          </div>

          <div className="auth-card-body animate-fade" key={step}>
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

            {/* EMAIL STEP */}
            {step === 'email' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6, color: '#4E5955', letterSpacing: '0.5px' }}>
                    Email/Phone number
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
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6, color: '#4E5955', letterSpacing: '0.5px' }}>
                    Password
                  </label>
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
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
                    <Link
                      to="/forgot-password"
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: '#2D6A4F',
                        textDecoration: 'underline',
                      }}
                    >
                      Forgot password?
                    </Link>
                  </div>
                </div>

                <button onClick={handleEmailLogin} disabled={loading}
                  className="submit-btn"
                  style={{
                    background: 'linear-gradient(135deg, #2D6A4F, #40916C)',
                    color: 'white',
                    boxShadow: '0 6px 20px rgba(45, 106, 79, 0.25)'
                  }}>
                  {loading ? (
                    <><RefreshCw size={16} className="animate-spin" />Log in…</>
                  ) : (
                    <>Log in</>
                  )}
                </button>

                <p
                  style={{
                    textAlign: 'center',
                    fontSize: 13,
                    color: '#64748B',
                    margin: 0,
                    marginTop: 10
                  }}
                >
                  No account yet?{' '}
                  <Link
                    to="/register"
                    style={{
                      color: '#2D6A4F',
                      fontWeight: 700,
                      textDecoration: 'underline',
                      textUnderlineOffset: '3px'
                    }}
                  >
                    Sign up
                  </Link>
                </p>
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
                    <>Verify & Log in <ArrowRight size={16} /></>
                  )}
                </button>

                <button onClick={resendEmailOtp} disabled={loading}
                  style={{
                    width: '100%', padding: '12px', borderRadius: 12,
                    background: 'none', border: 'none', cursor: 'pointer',
                    fontSize: 13, fontWeight: 600, color: '#2D6A4F',
                    fontFamily: "'IBM Plex Sans', sans-serif"
                  }}>
                  ← Resend code
                </button>

                <button onClick={() => go('email')}
                  style={{
                    width: '100%', padding: '12px', borderRadius: 12,
                    background: 'none', border: 'none', cursor: 'pointer',
                    fontSize: 13, fontWeight: 600, color: '#64748B',
                    fontFamily: "'IBM Plex Sans', sans-serif"
                  }}>
                  ← Back to login
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
                    <>Verify & Log in <ArrowRight size={16} /></>
                  )}
                </button>

                <button onClick={resend2FACode} disabled={loading}
                  style={{
                    width: '100%', padding: '12px', borderRadius: 12,
                    background: 'none', border: 'none', cursor: 'pointer',
                    fontSize: 13, fontWeight: 600, color: '#2D6A4F',
                    fontFamily: "'IBM Plex Sans', sans-serif"
                  }}>
                  ← Resend code
                </button>

                <button onClick={() => go('email')}
                  style={{
                    width: '100%', padding: '12px', borderRadius: 12,
                    background: 'none', border: 'none', cursor: 'pointer',
                    fontSize: 13, fontWeight: 600, color: '#64748B',
                    fontFamily: "'IBM Plex Sans', sans-serif"
                  }}>
                  ← Back to login
                </button>
              </div>
            )}
          </div>
        </div>
      </AuthLayout>
    </>
  );
}
