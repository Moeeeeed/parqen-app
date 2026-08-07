import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import SEO from '../components/SEO';
import axios from 'axios';
import { API_URL } from '../App';
import {
  Mail, CheckCircle, RefreshCw, ArrowRight, AlertCircle,
  Shield, ChevronRight, Clock, Inbox, RotateCcw
} from 'lucide-react';

const C = {
  forest: '#1B4332', green: '#2D6A4F', mint: '#40916C',
  gold: '#F4A422', white: '#FFFFFF', mist: '#F0F9F4',
  g50: '#F8FAFC', g100: '#F1F5F9', g200: '#E2E8F0',
  g300: '#CBD5E1', g400: '#94A3B8', g500: '#64748B',
  g600: '#475569', g700: '#334155', g800: '#1E293B',
  success: '#10B981', danger: '#EF4444', amber: '#F59E0B',
};

const VERIFY_GUIDES = [
  {
    field: 'code',
    Icon: Shield,
    title: '6-Digit Verification Code',
    body: 'Check your email inbox or spam folder for your 6-digit code. You can paste all 6 digits directly into the boxes.',
    example: 'e.g. 123456',
  },
  {
    field: 'submit',
    Icon: CheckCircle,
    title: 'Verify & Activate',
    body: 'Click to verify your email code and log into your PRAQEN account securely.',
    example: 'Instant Verification',
  },
  {
    field: 'resend',
    Icon: RotateCcw,
    title: 'Resend Verification Code',
    body: "Didn't receive the email? Wait for the timer to finish and click here to send a fresh code.",
    example: 'Check inbox & spam folder',
  },
];

function FieldTooltip({ guide, onDismiss }) {
  if (!guide) return null;
  const IconComponent = guide.Icon || Shield;
  return (
    <div className="field-tooltip">
      <div className="field-tooltip-arrow" />
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <IconComponent size={18} style={{ color: '#fff', flexShrink: 0, marginTop: 2 }} />
        <div style={{ flex: 1, textAlign: 'left' }}>
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

function OTPInput({ value, onChange, hasError, onFocus }) {
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
          onFocus={onFocus}
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

export default function CheckEmail({ onLogin }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const email = searchParams.get('email');

  const [otp, setOtp] = useState('');
  const [otpError, setOtpError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [otpTimer, setOtpTimer] = useState(0);
  const [globalError, setGlobalError] = useState('');
  const [devCode, setDevCode] = useState('');
  const [hoveredField, setHoveredField] = useState(null);

  // If no email in URL, try to recover from localStorage or redirect to dashboard
  useEffect(() => {
    if (!email) {
      const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
      if (storedUser?.email) {
        navigate(`/verify-email?email=${encodeURIComponent(storedUser.email)}`, { replace: true });
      } else {
        navigate('/buy-bitcoin', { replace: true });
      }
    }
  }, [email, navigate]);

  // Timer countdown for resend
  useEffect(() => {
    if (otpTimer <= 0) return;
    const iv = setInterval(() => setOtpTimer(t => t - 1), 1000);
    return () => clearInterval(iv);
  }, [otpTimer]);

  const handleVerify = async () => {
    if (otp.length < 6) { setOtpError('Enter the full 6-digit code'); return; }
    setLoading(true);
    setOtpError('');
    setGlobalError('');
    try {
      const res = await axios.post(`${API_URL}/auth/verify-code`, { email, code: otp });
      if (res.data.success) {
        // Update stored auth with fresh token from verify-code endpoint
        if (res.data.token) {
          localStorage.setItem('token', res.data.token);
          axios.defaults.headers.common['Authorization'] = `Bearer ${res.data.token}`;
        }
        if (res.data.user) {
          localStorage.setItem('user', JSON.stringify(res.data.user));
        }
        if (onLogin && res.data.user && res.data.token) {
          onLogin(res.data.user, res.data.token);
        }
        setSuccess(true);
        setTimeout(() => navigate('/buy-bitcoin'), 1500);
      }
    } catch (err) {
      const errMsg = err.response?.data?.error || 'Invalid code. Please try again.';
      setOtpError(errMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setLoading(true);
    setGlobalError('');
    try {
      const res = await axios.post(`${API_URL}/auth/resend-code`, { email });
      setOtpTimer(60);
      if (res.data?.devCode) {
        setDevCode(res.data.devCode);
        setOtp(res.data.devCode);
      }
    } catch (err) {
      setGlobalError(err.response?.data?.error || 'Failed to resend code. Try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = () => {
    navigate('/buy-bitcoin');
  };

  // Full-screen branded layout matching Register.js aesthetic
  return (
    <>
      <SEO title="Verify Email - PRAQEN" />
      <style>{`
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body {
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
          -webkit-font-smoothing: antialiased;
          background: #F0F9F4;
        }
        .verify-layout {
          min-height: 100vh; min-height: 100dvh;
          display: flex; align-items: center; justify-content: center;
          padding: 24px 16px;
          background: linear-gradient(135deg, #F0F9F4 0%, #E8F5EC 100%);
        }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        @keyframes pulse-dot {
          0%, 100% { transform: scale(1); opacity: 0.5; }
          50% { transform: scale(1.3); opacity: 1; }
        }
        .animate-in { animation: fadeInUp 0.5s cubic-bezier(0.22, 0.68, 0, 1.1) both; }
        .animate-fade { animation: fadeIn 0.3s ease both; }
        .animate-spin { animation: spin 0.7s linear infinite; }
        .shimmer-text {
          background: linear-gradient(90deg, #2D6A4F 0%, #40916C 50%, #2D6A4F 100%);
          background-size: 200% 100%;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          animation: shimmer 2s infinite;
        }

        .field-tooltip {
          position: absolute;
          right: calc(100% + 14px);
          top: 50%;
          transform: translateY(-50%);
          width: 220px;
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

        @media (max-width: 850px) {
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
      `}</style>

      <div className="verify-layout">
        <div className="animate-in" style={{ width: '100%', maxWidth: 460 }}>
          {/* Card */}
          <div style={{
            background: '#FFFFFF',
            borderRadius: 28,
            boxShadow: '0 20px 60px rgba(27, 67, 50, 0.12), 0 0 0 1px rgba(27, 67, 50, 0.06)',
            overflow: 'hidden',
          }}>
            {/* Success State */}
            {success ? (
              <div style={{ padding: '48px 32px 40px', textAlign: 'center' }}>
                <div style={{
                  width: 80, height: 80, borderRadius: '50%',
                  background: 'rgba(16,185,129,0.1)', display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                  margin: '0 auto 20px'
                }}>
                  <CheckCircle size={42} style={{ color: '#10B981' }} />
                </div>
                <h3 style={{
                  fontSize: 24, fontWeight: 800, color: '#1B4332',
                  margin: '0 0 8px', fontFamily: "'Outfit', sans-serif"
                }}>
                  Email Verified! 🎉
                </h3>
                <p style={{ fontSize: 14, color: '#64748B', margin: '0 0 20px', lineHeight: 1.6 }}>
                  Your email has been confirmed. Taking you to the marketplace…
                </p>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 12, color: '#94A3B8' }}>
                  <RefreshCw size={12} className="animate-spin" />
                  Redirecting…
                </div>
              </div>
            ) : (
              <>
                {/* Header */}
                <div style={{
                  background: 'linear-gradient(135deg, #1B4332 0%, #2D6A4F 100%)',
                  padding: '40px 32px 28px', textAlign: 'center',
                }}>
                  <div style={{
                    width: 64, height: 64, borderRadius: 16,
                    background: '#F4A422', display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                    margin: '0 auto 16px',
                    boxShadow: '0 8px 24px rgba(244, 164, 34, 0.3)',
                  }}>
                    <Mail size={30} style={{ color: '#1B4332' }} />
                  </div>
                  <p style={{
                    fontSize: 12, color: '#F4A422', fontWeight: 600,
                    margin: '0 0 8px', letterSpacing: '0.5px',
                  }}>
                    ✅ Account created successfully!
                  </p>
                  <h1 style={{
                    fontSize: 22, fontWeight: 800, color: '#FFFFFF',
                    margin: '0 0 4px', fontFamily: "'Outfit', sans-serif",
                  }}>
                    Check Your Email
                  </h1>
                  <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', margin: 0, lineHeight: 1.5 }}>
                    We sent a 6-digit verification code to
                  </p>
                  <p style={{
                    fontSize: 14, fontWeight: 700, color: '#F4A422',
                    margin: '6px 0 0', wordBreak: 'break-all',
                  }}>
                    {email}
                  </p>
                </div>

                {/* Body */}
                <div style={{ padding: '28px 28px 24px' }}>
                  {/* Steps hint */}
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    gap: 8, marginBottom: 24,
                  }}>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '6px 14px', borderRadius: 20,
                      background: 'rgba(45,106,79,0.08)',
                      fontSize: 11, fontWeight: 600, color: '#2D6A4F',
                    }}>
                      <Inbox size={13} />
                      Step 1: Check your inbox
                    </div>
                    <ChevronRight size={14} style={{ color: '#CBD5E1' }} />
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '6px 14px', borderRadius: 20,
                      background: 'rgba(244,164,34,0.1)',
                      fontSize: 11, fontWeight: 600, color: '#F4A422',
                    }}>
                      <Mail size={13} />
                      Step 2: Enter code
                    </div>
                  </div>

                  {/* Error */}
                  {globalError && (
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '10px 14px', borderRadius: 12, fontSize: 12,
                      background: '#FEF2F2', color: '#EF4444',
                      border: '1.5px solid #FECACA', marginBottom: 16,
                    }}>
                      <AlertCircle size={14} style={{ flexShrink: 0 }} />
                      {globalError}
                    </div>
                  )}

                  {/* OTP Input */}
                  <div
                    style={{ position: 'relative', marginBottom: 20 }}
                    onMouseEnter={() => setHoveredField('code')}
                    onMouseLeave={() => setHoveredField(null)}
                  >
                    <p style={{
                      fontSize: 12, fontWeight: 700, color: '#475569',
                      textTransform: 'uppercase', letterSpacing: '0.5px',
                      marginBottom: 12, textAlign: 'center',
                    }}>
                      Enter Verification Code
                    </p>
                    <OTPInput value={otp} onChange={setOtp} hasError={!!otpError} onFocus={() => setHoveredField('code')} />
                    {hoveredField === 'code' && (
                      <FieldTooltip
                        guide={VERIFY_GUIDES.find(g => g.field === 'code')}
                        onDismiss={() => setHoveredField(null)}
                      />
                    )}
                    {otpError && (
                      <p style={{
                        textAlign: 'center', fontSize: 12, fontWeight: 600,
                        color: '#EF4444', display: 'flex', alignItems: 'center',
                        justifyContent: 'center', gap: 5, marginTop: 10,
                      }}>
                        <AlertCircle size={11} />{otpError}
                      </p>
                    )}
                  </div>

                  {/* Dev mode hint */}
                  {devCode && (
                    <div style={{
                      padding: '8px 14px', borderRadius: 10,
                      background: '#FEF3C7', border: '1px solid #FDE68A',
                      fontSize: 11, color: '#92400E', textAlign: 'center',
                      marginBottom: 16,
                    }}>
                      ⚡ Dev mode: code <strong>{devCode}</strong> auto-filled
                    </div>
                  )}

                  {/* Tips */}
                  <div style={{
                    display: 'flex', flexDirection: 'column', gap: 8,
                    marginBottom: 20,
                  }}>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '10px 14px', borderRadius: 12,
                      background: '#F8FAFC', fontSize: 12, color: '#64748B',
                    }}>
                      <Clock size={14} style={{ color: '#94A3B8', flexShrink: 0 }} />
                      <span>The code expires in <strong>10 minutes</strong></span>
                    </div>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '10px 14px', borderRadius: 12,
                      background: '#F8FAFC', fontSize: 12, color: '#64748B',
                    }}>
                      <Shield size={14} style={{ color: '#94A3B8', flexShrink: 0 }} />
                      <span>Check your <strong>spam</strong> or <strong>promotions</strong> folder</span>
                    </div>
                  </div>

                  {/* Verify Button */}
                  <div
                    style={{ position: 'relative' }}
                    onMouseEnter={() => setHoveredField('submit')}
                    onMouseLeave={() => setHoveredField(null)}
                  >
                    <button
                      onClick={handleVerify}
                      disabled={loading || otp.length < 6}
                      style={{
                        width: '100%',
                        padding: 15,
                        borderRadius: 14,
                        border: 'none',
                        background: otp.length >= 6 && !loading
                          ? 'linear-gradient(135deg, #2D6A4F 0%, #40916C 100%)'
                          : '#E2E8F0',
                        color: otp.length >= 6 && !loading ? '#FFFFFF' : '#94A3B8',
                        fontSize: 15,
                        fontWeight: 700,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 8,
                        cursor: otp.length >= 6 && !loading ? 'pointer' : 'not-allowed',
                        transition: 'all 0.2s ease',
                        boxShadow: otp.length >= 6 && !loading
                          ? '0 6px 20px rgba(45, 106, 79, 0.25)'
                          : 'none',
                        fontFamily: "'Inter', sans-serif",
                        position: 'relative',
                        overflow: 'visible',
                      }}
                    >
                      {loading ? (
                        <><RefreshCw size={16} className="animate-spin" /> Verifying…</>
                      ) : (
                        <><CheckCircle size={16} /> Verify Email <ArrowRight size={16} /></>
                      )}
                    </button>
                    {hoveredField === 'submit' && (
                      <FieldTooltip
                        guide={VERIFY_GUIDES.find(g => g.field === 'submit')}
                        onDismiss={() => setHoveredField(null)}
                      />
                    )}
                  </div>

                  {/* Divider */}
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    margin: '20px 0',
                  }}>
                    <div style={{ flex: 1, height: 1, background: '#E2E8F0' }} />
                    <span style={{ fontSize: 11, color: '#94A3B8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      or
                    </span>
                    <div style={{ flex: 1, height: 1, background: '#E2E8F0' }} />
                  </div>

                  {/* Resend */}
                  <div
                    style={{ position: 'relative', textAlign: 'center', marginBottom: 12 }}
                    onMouseEnter={() => setHoveredField('resend')}
                    onMouseLeave={() => setHoveredField(null)}
                  >
                    {otpTimer > 0 ? (
                      <p style={{ fontSize: 12, color: '#94A3B8', margin: 0 }}>
                        Resend in <span style={{ fontWeight: 700, color: '#2D6A4F' }}>{otpTimer}s</span>
                      </p>
                    ) : (
                      <button
                        onClick={handleResend}
                        disabled={loading}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: loading ? 'not-allowed' : 'pointer',
                          fontSize: 13,
                          fontWeight: 600,
                          color: '#2D6A4F',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '8px 16px',
                          borderRadius: 10,
                          fontFamily: "'Inter', sans-serif",
                          transition: 'background 0.2s',
                          opacity: loading ? 0.5 : 1,
                        }}
                      >
                        <RefreshCw size={13} />
                        Resend Verification Code
                      </button>
                    )}
                    {hoveredField === 'resend' && (
                      <FieldTooltip
                        guide={VERIFY_GUIDES.find(g => g.field === 'resend')}
                        onDismiss={() => setHoveredField(null)}
                      />
                    )}
                  </div>
                </div>

                {/* Footer */}
                <div style={{
                  padding: '14px 28px',
                  borderTop: '1px solid #F1F5F9',
                  background: '#F8FAFC',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  <button
                    onClick={handleSkip}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: 13,
                      fontWeight: 600,
                      color: '#64748B',
                      padding: '8px 16px',
                      borderRadius: 8,
                      fontFamily: "'Inter', sans-serif",
                      transition: 'color 0.2s',
                    }}
                  >
                    Skip for now — go to marketplace →
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Helper text below card */}
          {!success && (
            <p style={{
              textAlign: 'center', fontSize: 12, color: '#94A3B8',
              marginTop: 20, lineHeight: 1.6,
            }}>
              Didn't receive the email? Check your spam folder or{' '}
              <button
                onClick={handleResend}
                style={{
                  background: 'none', border: 'none',
                  cursor: 'pointer', color: '#2D6A4F',
                  fontWeight: 700, fontSize: 12,
                  textDecoration: 'underline',
                  fontFamily: "'Inter', sans-serif",
                }}
              >
                send again
              </button>
            </p>
          )}
        </div>
      </div>
    </>
  );
}
