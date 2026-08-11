import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'react-toastify';
import { Shield, RefreshCw, ArrowRight, CheckCircle, Mail, RotateCcw, ArrowLeft } from 'lucide-react';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const C = { forest: '#1B4332', green: '#2D6A4F', gold: '#F4A422', mist: '#F0FAF5' };

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

export default function VerifyOTP({ onLogin }) {
  const navigate  = useNavigate();
  const location  = useLocation();

  const [digits,       setDigits]       = useState(['', '', '', '', '', '']);
  const [email,        setEmail]        = useState('');
  const [loading,      setLoading]      = useState(false);
  const [resendLoad,   setResendLoad]   = useState(false);
  const [timer,        setTimer]        = useState(60);
  const [canResend,    setCanResend]    = useState(false);
  const [purpose,      setPurpose]      = useState('verify');
  const [hoveredField, setHoveredField] = useState(null);
  const inputs = useRef([]);

  useEffect(() => {
    const stateEmail   = location.state?.email;
    const storedEmail  = localStorage.getItem('pendingEmail');
    const statePurpose = location.state?.purpose;

    setEmail(stateEmail || storedEmail || '');
    if (statePurpose) setPurpose(statePurpose);

    startTimer();
  }, []);

  const startTimer = () => {
    setTimer(60);
    setCanResend(false);
    const iv = setInterval(() => {
      setTimer(prev => {
        if (prev <= 1) { clearInterval(iv); setCanResend(true); return 0; }
        return prev - 1;
      });
    }, 1000);
  };

  const handleDigit = (index, value) => {
    const v = value.replace(/\D/g, '').slice(-1);
    const next = [...digits];
    next[index] = v;
    setDigits(next);
    if (v && index < 5) inputs.current[index + 1]?.focus();
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length === 6) {
      setDigits(pasted.split(''));
      inputs.current[5]?.focus();
    }
  };

  const handleVerify = async (e) => {
    e.preventDefault();
    const code = digits.join('');
    if (code.length !== 6) { toast.error('Enter all 6 digits'); return; }

    setLoading(true);
    try {
      const response = await axios.post(`${API_URL}/auth/verify-code`, { email, code });

      if (response.data.success) {
        localStorage.removeItem('pendingEmail');

        if (purpose === 'reset') {
          navigate('/reset-password', { state: { email, token: response.data.resetToken } });
          return;
        }

        // Auto-login if backend returned a token
        if (response.data.token && response.data.user && onLogin) {
          onLogin(response.data.user, response.data.token);
          toast.success('Email verified! Welcome to PRAQEN.');
          navigate('/');
        } else {
          toast.success('Email verified! Please login.');
          navigate('/login', { state: { message: 'Email verified! Please login.' } });
        }
      }
    } catch (error) {
      toast.error(error.response?.data?.error || 'Invalid or expired code');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (!canResend || !email) return;
    setResendLoad(true);
    try {
      const r = await axios.post(`${API_URL}/auth/resend-code`, { email });
      toast.success('New code sent — check your email');
      setDigits(['', '', '', '', '', '']);
      inputs.current[0]?.focus();
      startTimer();
      if (r.data?.devCode) {
        const d = r.data.devCode.toString().split('');
        setDigits(d);
        toast.info(`Dev mode: code auto-filled`, { autoClose: 3000 });
      }
    } catch (error) {
      const errData = error.response?.data;
      if (errData?.devCode) {
        const d = errData.devCode.toString().split('');
        setDigits(d);
        startTimer();
        toast.info(`Dev mode: code auto-filled`, { autoClose: 3000 });
      } else {
        toast.error(errData?.error || 'Failed to resend code');
      }
    } finally {
      setResendLoad(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center py-12 px-4" style={{ backgroundColor: C.mist }}>
      <style>{`
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

      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8">

        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
            style={{ backgroundColor: `${C.green}15` }}>
            <Shield size={32} style={{ color: C.green }} />
          </div>
          <h2 className="text-2xl font-black" style={{ color: C.forest }}>Verify Your Email</h2>
          <p className="text-gray-500 mt-2 text-sm">We sent a 6-digit code to</p>
          <p className="font-bold mt-1" style={{ color: C.forest }}>{email || 'your email'}</p>
        </div>

        <form onSubmit={handleVerify} className="space-y-6">

          {/* 6-box digit input */}
          <div
            style={{ position: 'relative' }}
            onMouseEnter={() => setHoveredField('code')}
            onMouseLeave={() => setHoveredField(null)}
          >
            <label className="block text-sm font-semibold text-gray-600 mb-3 text-center">
              Enter 6-digit code
            </label>
            <div className="flex gap-2 justify-center" onPaste={handlePaste}>
              {digits.map((d, i) => (
                <input
                  key={i}
                  ref={el => inputs.current[i] = el}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={d}
                  onChange={e => handleDigit(i, e.target.value)}
                  onKeyDown={e => handleKeyDown(i, e)}
                  onFocus={() => setHoveredField('code')}
                  style={{
                    width: 44, height: 54, textAlign: 'center', fontSize: 22,
                    fontWeight: 900, fontFamily: 'monospace',
                    border: `2px solid ${d ? C.green : '#E2E8F0'}`,
                    borderRadius: 12, outline: 'none',
                    color: C.forest, backgroundColor: d ? `${C.green}08` : '#fff',
                    transition: 'border-color .15s',
                  }}
                />
              ))}
            </div>
            {hoveredField === 'code' && (
              <FieldTooltip
                guide={VERIFY_GUIDES.find(g => g.field === 'code')}
                onDismiss={() => setHoveredField(null)}
              />
            )}
            <p className="text-xs text-gray-400 text-center mt-2">
              Tip: you can paste the 6-digit code directly
            </p>
          </div>

          <div
            style={{ position: 'relative' }}
            onMouseEnter={() => setHoveredField('submit')}
            onMouseLeave={() => setHoveredField(null)}
          >
            <button
              type="submit"
              disabled={loading || digits.join('').length < 6}
              className="w-full py-3.5 rounded-xl font-black text-white flex items-center justify-center gap-2 transition disabled:opacity-50"
              style={{ backgroundColor: C.green }}
            >
              {loading
                ? <><RefreshCw size={16} className="animate-spin" />Verifying…</>
                : <><ArrowRight size={16} />Verify Email</>}
            </button>
            {hoveredField === 'submit' && (
              <FieldTooltip
                guide={VERIFY_GUIDES.find(g => g.field === 'submit')}
                onDismiss={() => setHoveredField(null)}
              />
            )}
          </div>
        </form>

        {/* Resend */}
        <div
          className="mt-5 text-center"
          style={{ position: 'relative' }}
          onMouseEnter={() => setHoveredField('resend')}
          onMouseLeave={() => setHoveredField(null)}
        >
          {canResend ? (
            <button onClick={handleResend} disabled={resendLoad}
              className="text-sm font-bold" style={{ color: C.green }}>
              {resendLoad ? 'Sending…' : (<><RotateCcw size={14} className="inline mr-1" />Resend Code</>)}
            </button>
          ) : (
            <p className="text-sm text-gray-400">Resend in {timer}s</p>
          )}
          {hoveredField === 'resend' && (
            <FieldTooltip
              guide={VERIFY_GUIDES.find(g => g.field === 'resend')}
              onDismiss={() => setHoveredField(null)}
            />
          )}
        </div>

        <div className="mt-6 pt-5 border-t text-center">
          <button onClick={() => navigate('/login')} className="text-sm text-gray-400 hover:text-gray-600">
            <ArrowLeft size={14} className="inline mr-1" /> Back to Login
          </button>
        </div>
      </div>
    </div>
  );
}

