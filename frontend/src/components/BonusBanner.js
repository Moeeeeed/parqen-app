import React, { useState, useEffect, useCallback } from 'react';
import { Gift, Lock, X, ChevronRight, CheckCircle, Zap, Bitcoin } from 'lucide-react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const C = {
  forest: '#1B4332', green: '#2D6A4F', mint: '#40916C',
  gold: '#F4A422', white: '#FFFFFF',
};

function fmtCountdown(ms) {
  if (ms <= 0) return '0d 0h';
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (d > 0) return `${d}d ${h}h left`;
  if (h > 0) return `${h}h ${m}m left`;
  return `${m}m left`;
}

function fmtBtc(btc) {
  return parseFloat(btc || 0).toFixed(6);
}

export default function BonusBanner({ userId }) {
  const [bonus, setBonus] = useState(null);
  const [dismissed, setDismissed] = useState(false);
  const [msLeft, setMsLeft] = useState(0);
  const navigate = useNavigate();

  const dismissKey = `prq_bonus_dismissed_${userId}`;

  const load = useCallback(async () => {
    if (!userId) return;
    if (localStorage.getItem(dismissKey)) { setDismissed(true); return; }
    try {
      const { data } = await axios.get(`${API_URL}/bonus/status`);
      if (!data || data.step === 0 || data.expired) return;
      setBonus(data);
      setMsLeft(data.ms_remaining || 0);
    } catch (_) {}
  }, [userId, dismissKey]);

  useEffect(() => { load(); }, [load]);

  // Tick the countdown every minute
  useEffect(() => {
    if (!bonus || bonus.step === 3) return;
    const t = setInterval(() => setMsLeft(p => Math.max(0, p - 60000)), 60000);
    return () => clearInterval(t);
  }, [bonus]);

  if (!bonus || bonus.step === 0 || dismissed) return null;
  if (bonus.expired) return null;

  const handleDismiss = () => {
    // Step 3 can be permanently dismissed; steps 1-2 only hide for the session
    if (bonus.step === 3) localStorage.setItem(dismissKey, '1');
    setDismissed(true);
  };

  const bgGradient = bonus.step === 3
    ? 'linear-gradient(135deg,#065F46 0%,#047857 100%)'
    : 'linear-gradient(135deg,#1B4332 0%,#2D6A4F 80%,#40916C 100%)';

  return (
    <div style={{
      background: bgGradient,
      borderBottom: `3px solid ${C.gold}`,
      position: 'relative',
    }}>
      <style>{`
        .bonus-banner-inner {
          max-width: 1152px; margin: 0 auto; padding: 10px 16px;
          display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
        }
        .bonus-banner-top {
          display: flex; align-items: center; gap: 10px;
          flex: 1 1 220px; min-width: 220px;
        }
        .bonus-banner-actions {
          display: flex; align-items: center; gap: 8px; flex-shrink: 0;
          flex-wrap: wrap;
        }
        @media (max-width: 640px) {
          .bonus-banner-inner { flex-direction: column; align-items: stretch; }
          .bonus-banner-top { min-width: 0; flex-basis: auto; }
          .bonus-banner-actions { justify-content: space-between; width: 100%; }
        }
      `}</style>

      <div className="bonus-banner-inner">
        {/* Icon + text */}
        <div className="bonus-banner-top">
          <div style={{
            background: C.gold, borderRadius: 10, width: 34, height: 34,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, boxShadow: '0 2px 8px rgba(244,164,34,0.4)',
          }}>
            {bonus.step === 3 ? <CheckCircle size={18} color={C.forest} /> : <Gift size={18} color={C.forest} />}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            {bonus.step === 1 && (
              <>
                <p style={{ margin: 0, color: C.white, fontWeight: 800, fontSize: 13 }}>
                  <Gift size={14} className="inline-block mr-1" />$1 Bitcoin waiting — verify to claim it!
                </p>
                <p style={{ margin: 0, color: 'rgba(255,255,255,0.7)', fontSize: 11, marginTop: 1 }}>
                  Verify your account to lock in your first $1 BTC · {fmtCountdown(msLeft)}
                </p>
              </>
            )}
            {bonus.step === 2 && (
              <>
                <p style={{ margin: 0, color: C.white, fontWeight: 800, fontSize: 13 }}>
                  <Lock size={14} className="inline-block mr-1" />$1 BTC locked · Trade once to unlock $2 instantly!
                </p>
                <p style={{ margin: 0, color: 'rgba(255,255,255,0.7)', fontSize: 11, marginTop: 1 }}>
                  ≈ {fmtBtc(bonus.locked_btc)} BTC locked · Complete your first trade · {fmtCountdown(msLeft)}
                </p>
              </>
            )}
            {bonus.step === 3 && (
              <>
                <p style={{ margin: 0, color: C.gold, fontWeight: 800, fontSize: 13 }}>
                  <CheckCircle size={14} className="inline-block mr-1" />$2 Bitcoin unlocked — check your wallet!
                </p>
                <p style={{ margin: 0, color: 'rgba(255,255,255,0.7)', fontSize: 11, marginTop: 1 }}>
                  ≈ {fmtBtc(bonus.unlocked_btc)} BTC has been credited to your balance.
                </p>
              </>
            )}
          </div>
        </div>

        {/* Pills + CTA + dismiss */}
        <div className="bonus-banner-actions">
          <div style={{ display: 'flex', gap: 4 }}>
            <StepPill icon={<CheckCircle size={10} />} label="Account" done={bonus.step >= 1} />
            <StepPill icon={<Zap size={10} />}         label="Verify"  done={bonus.step >= 2} />
            <StepPill icon={<Bitcoin size={10} />}      label="Trade"   done={bonus.step >= 3} />
          </div>

          {bonus.step < 3 && (
            <button
              onClick={() => navigate(bonus.step === 1 ? '/settings' : '/buy-bitcoin')}
              style={{
                background: C.gold, color: C.forest, border: 'none', borderRadius: 8,
                padding: '6px 12px', fontWeight: 900, fontSize: 12, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0,
                whiteSpace: 'nowrap',
              }}
            >
              {bonus.step === 1 ? 'Verify Now' : 'Trade Now'} <ChevronRight size={12} />
            </button>
          )}

          <button
            onClick={handleDismiss}
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: 'rgba(255,255,255,0.5)', padding: 4, flexShrink: 0,
              display: 'flex', alignItems: 'center',
            }}
            title="Dismiss"
          >
            <X size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

function StepPill({ icon, label, done }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 3,
      background: done ? 'rgba(244,164,34,0.25)' : 'rgba(255,255,255,0.1)',
      borderRadius: 20, padding: '3px 8px',
      color: done ? C.gold : 'rgba(255,255,255,0.45)',
      fontSize: 10, fontWeight: 700,
    }}>
      {icon} {label}
    </div>
  );
}
