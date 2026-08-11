import React, { useState, useEffect } from 'react';
import { X, Gift, Lock, CheckCircle, Zap, Bitcoin, PartyPopper } from 'lucide-react';
import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const C = {
  forest: '#1B4332', green: '#2D6A4F', mint: '#40916C',
  gold: '#F4A422', white: '#FFFFFF', mist: '#F0FAF5',
};

// Format a satoshi-level BTC amount nicely
function fmtBtc(btc) {
  if (!btc || btc === 0) return '0.00000000 BTC';
  return `${parseFloat(btc).toFixed(8)} BTC`;
}

export default function WelcomeBonusModal({ user, onClose }) {
  const [btcPrice, setBtcPrice] = useState(88000);
  const [step, setStep] = useState(null); // null = loading

  useEffect(() => {
    axios.get(`${API_URL}/bonus/status`)
      .then(r => {
        if (r.data.btc_price) setBtcPrice(r.data.btc_price);
        const s = r.data.step || 0;
        if (s === 0 || r.data.expired) {
          // User not in bonus programme (existing user or expired) — dismiss silently
          onClose();
        } else {
          setStep(s);
        }
      })
      .catch(() => {
        // Network error — show modal at step 1 (new user default)
        setStep(1);
      });
  }, [onClose]);

  // Still fetching — render nothing to avoid flash
  if (step === null) return null;

  const oneBtc  = parseFloat((1 / btcPrice).toFixed(8));
  const twoBtc  = parseFloat((2 / btcPrice).toFixed(8));

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9997,
        background: 'rgba(0,0,0,0.72)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '16px',
      }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        background: C.white, borderRadius: 24, maxWidth: 420, width: '100%',
        boxShadow: '0 24px 80px rgba(0,0,0,0.35)',
        overflow: 'hidden',
        fontFamily: 'system-ui,-apple-system,sans-serif',
      }}>
        {/* Header */}
        <div style={{
          background: `linear-gradient(135deg, ${C.forest} 0%, ${C.green} 60%, ${C.mint} 100%)`,
          padding: '24px 24px 20px',
          position: 'relative',
        }}>
          <button
            onClick={onClose}
            style={{
              position: 'absolute', top: 14, right: 14,
              background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 50,
              width: 32, height: 32, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: C.white,
            }}
          >
            <X size={16} />
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <div style={{
              background: C.gold, borderRadius: 14, width: 44, height: 44,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 14px rgba(244,164,34,0.45)',
            }}>
              <Gift size={22} color={C.forest} />
            </div>
            <div>
              <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: 700, margin: 0, letterSpacing: 1.5, textTransform: 'uppercase' }}>
                Welcome Gift
              </p>
              <p style={{ color: C.white, fontSize: 20, fontWeight: 900, margin: 0 }}>
                Earn $2 in Bitcoin
              </p>
            </div>
          </div>
          <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13, margin: 0 }}>
            Complete 2 easy steps to unlock your free BTC — offer valid for 30 days.
          </p>
        </div>

        {/* Steps */}
        <div style={{ padding: '20px 24px' }}>
          {/* Step 1 */}
          <StepRow
            num={1}
            done={step >= 1}
            icon={<CheckCircle size={18} />}
            title="Create your account"
            desc="You're in! Account created successfully."
            reward="$1.00 in BTC locked"
            rewardBtc={oneBtc}
            active={step === 1}
          />

          <div style={{ width: 2, height: 16, background: step >= 2 ? C.mint : '#E2E8F0', marginLeft: 23, marginTop: -4, marginBottom: -4 }} />

          {/* Step 2 */}
          <StepRow
            num={2}
            done={step >= 2}
            icon={<Zap size={18} />}
            title="Verify your phone or email"
            desc={step >= 2 ? '$1 BTC is locked in your wallet.' : 'Verify to claim your first $1.'}
            reward={step >= 2 ? <><span>$1.00 BTC locked</span> <Lock size={12} style={{ display: 'inline', verticalAlign: 'middle' }} /></> : '$1.00 unlocks on verify'}
            rewardBtc={step >= 2 ? oneBtc : null}
            active={step === 1}
          />

          <div style={{ width: 2, height: 16, background: step >= 3 ? C.mint : '#E2E8F0', marginLeft: 23, marginTop: -4, marginBottom: -4 }} />

          {/* Step 3 */}
          <StepRow
            num={3}
            done={step >= 3}
            icon={<Bitcoin size={18} />}
            title="Complete your first trade"
            desc={step >= 3 ? 'Both $2 BTC have been added to your wallet!' : 'Trade once — both $2 instantly unlock.'}
            reward={step >= 3 ? <><span>$2.00 BTC unlocked</span> <PartyPopper size={12} style={{ display: 'inline', verticalAlign: 'middle' }} /></> : '$2.00 unlocks on first trade'}
            rewardBtc={step >= 3 ? twoBtc : null}
            active={step === 2}
          />
        </div>

        {/* CTA */}
        <div style={{ padding: '0 24px 24px' }}>
          {step === 1 && (
            <ActionButton color={C.green} onClick={onClose} label="Verify Now to Claim $1 →" />
          )}
          {step === 2 && (
            <ActionButton color={C.green} onClick={onClose} label="Start Trading to Unlock $2 →" />
          )}
          {step === 3 && (
            <ActionButton color={C.mint} onClick={onClose} label="View My Wallet →" />
          )}
          <p style={{ textAlign: 'center', fontSize: 11, color: '#94A3B8', marginTop: 10, margin: '10px 0 0' }}>
            ≈ {fmtBtc(twoBtc)} total · Price based on live BTC rate
          </p>
        </div>
      </div>
    </div>
  );
}

function StepRow({ done, icon, title, desc, reward, rewardBtc, active }) {
  const bg = done ? '#D1FAE5' : active ? '#FEF3C7' : '#F1F5F9';
  const iconColor = done ? '#065F46' : active ? '#92400E' : '#94A3B8';
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '10px 0' }}>
      <div style={{
        width: 38, height: 38, borderRadius: 50, background: bg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: iconColor, flexShrink: 0, marginTop: 2,
      }}>
        {icon}
      </div>
      <div style={{ flex: 1 }}>
        <p style={{ margin: 0, fontWeight: 800, fontSize: 14, color: done ? '#065F46' : '#1E293B' }}>{title}</p>
        <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64748B' }}>{desc}</p>
        {reward && (
          <p style={{ margin: '4px 0 0', fontSize: 12, fontWeight: 700, color: done ? '#065F46' : '#92400E' }}>
            {reward}{rewardBtc ? ` · ≈ ${fmtBtc(rewardBtc)}` : ''}
          </p>
        )}
      </div>
      {done && (
        <div style={{ color: '#10B981', flexShrink: 0, marginTop: 8 }}>
          <CheckCircle size={18} />
        </div>
      )}
      {active && !done && (
        <div style={{
          background: '#F4A422', color: '#1B4332', fontSize: 10, fontWeight: 800,
          borderRadius: 20, padding: '2px 8px', flexShrink: 0, marginTop: 10,
          letterSpacing: 0.5,
        }}>
          NEXT
        </div>
      )}
    </div>
  );
}

function ActionButton({ label, onClick, color }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%', padding: '14px', borderRadius: 14, border: 'none',
        background: color, color: '#FFFFFF', fontWeight: 900, fontSize: 15,
        cursor: 'pointer', letterSpacing: 0.3,
        boxShadow: `0 4px 16px ${color}55`,
        transition: 'opacity 0.15s',
      }}
      onMouseEnter={e => e.target.style.opacity = '0.9'}
      onMouseLeave={e => e.target.style.opacity = '1'}
    >
      {label}
    </button>
  );
}
