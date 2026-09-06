import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  User, Settings, Shield, LogOut, ChevronRight,
  QrCode, Lightbulb, CheckCircle, TrendingUp,
} from 'lucide-react';

const C = {
  forest: '#1B4332', green: '#2D6A4F', mint: '#40916C',
  gold: '#F4A422', mist: '#F0FAF5',
  g50: '#F8FAFC', g100: '#F1F5F9', g200: '#E2E8F0',
  g300: '#CBD5E1', g400: '#94A3B8', g500: '#64748B',
  g700: '#334155', g800: '#1E293B',
};

// TODO: Backend wiring — replace these placeholder values with real limits from the API.
const LIMITS_BY_LEVEL = {
  0: { daily: '$500', buySell: '$200', send: '$100' },
  1: { daily: '$2,000', buySell: '$1,000', send: '$500' },
  2: { daily: '$10,000', buySell: '$5,000', send: '$2,500' },
  3: { daily: 'Unlimited', buySell: 'Unlimited', send: 'Unlimited' },
};

export default function ProfileDropdownPanel({ user, onLogout, onClose, balance, showBal, onToggleBal, localCode }) {
  const navigate = useNavigate();

  const displayUser = user;
  const emailOk = !!(displayUser?.is_email_verified || displayUser?.email_verified);
  const phoneOk = !!(displayUser?.is_phone_verified || displayUser?.phone_verified);
  const kycOk = !!(displayUser?.kyc_verified || displayUser?.is_id_verified);
  const verifSteps = [emailOk, phoneOk, kycOk].filter(Boolean).length;
  const verifLevel = kycOk ? 3 : phoneOk ? 2 : emailOk ? 1 : 0;
  const limits = LIMITS_BY_LEVEL[verifLevel];

  const menuItems = [
    {
      icon: User, iconColor: C.green,
      title: 'Profile', subtitle: 'Your public profile',
      trailing: <QrCode size={18} color={C.g400} />,
      onClick: () => { onClose(); navigate(`/profile/${displayUser?.id}`); },
    },
    {
      icon: TrendingUp, iconColor: C.forest,
      title: 'Trade Settings', subtitle: 'Trade history, partners, statistics',
      trailing: <ChevronRight size={18} color={C.g300} />,
      onClick: () => { onClose(); navigate('/trader-settings'); },
    },
    {
      icon: Settings, iconColor: C.g500,
      title: 'Account settings', subtitle: 'Verification, notifications, security',
      trailing: <ChevronRight size={18} color={C.g300} />,
      onClick: () => { onClose(); navigate('/settings?tab=account'); },
    },
    {
      icon: Lightbulb, iconColor: '#F59E0B',
      title: 'Submit an idea',      subtitle: 'Improve PraQen with us',
      trailing: <ChevronRight size={18} color={C.g300} />,
      onClick: () => { onClose(); navigate('/settings?tab=feedback'); },
    },
  ];

  const handleLogout = () => { onClose(); onLogout(); };

  // Prevent body scroll when mobile overlay is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = '';
    };
  }, []);

  return (
    <>
    <style>{`
      @media (max-width: 520px) {
        .prq-profile-dropdown {
          position: fixed !important;
          inset: 0 !important;
          top: 64px !important;
          width: 100% !important;
          max-width: none !important;
          border-radius: 0 !important;
          border: none !important;
          box-shadow: none !important;
          background: #F0FAF5 !important;
          flex-direction: column !important;
          z-index: 999 !important;
          overflow-y: auto !important;
        }
        .prq-profile-dropdown-limits {
          width: 100% !important;
          border-left: none !important;
          border-top: 1px solid #E2E8F0 !important;
          order: 2 !important;
        }
        .prq-profile-dropdown-menu {
          order: 1 !important;
          width: 100% !important;
          flex: none !important;
        }
        .prq-profile-dropdown-menu-scroll {
          flex: none !important;
          overflow-y: visible !important;
        }
      }
    `}</style>
    <div className="prq-dropdown prq-profile-dropdown" style={{
      position: 'absolute', top: 'calc(100% + 8px)', right: 0,
      transformOrigin: 'top right',
      width: 480, maxHeight: 'calc(100vh - 100px)',
      background: '#fff', borderRadius: 16,
      boxShadow: '0 20px 60px rgba(0,0,0,0.18)', border: `1px solid ${C.g100}`,
      overflow: 'hidden', zIndex: 50,
      display: 'flex', flexDirection: 'row',
    }}>



      {/* ── Limits (left on desktop, second on mobile via CSS order) ── */}
      <div className="prq-profile-dropdown-limits" style={{
        width: 220, flexShrink: 0,
        borderLeft: `1px solid ${C.g100}`,
        display: 'flex', flexDirection: 'column',
        background: '#fff',
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 16px 12px',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <Shield size={18} color={C.forest} />
          <span style={{ fontSize: 14, fontWeight: 800, color: C.g800, flex: 1 }}>
            Your limits: Level {verifLevel}
          </span>
        </div>

        {/* Verified badge */}
        <div style={{ padding: '0 16px 12px' }}>
          {verifLevel === 3 ? (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '4px 10px', borderRadius: 99,
              background: '#ECFDF5', color: '#059669',
              fontSize: 11, fontWeight: 800,
            }}>
              <CheckCircle size={12} /> Verified
            </span>
          ) : (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '4px 10px', borderRadius: 99,
              background: '#FEF3C7', color: '#92400E',
              fontSize: 11, fontWeight: 800,
            }}>
              {verifSteps}/3 steps completed
            </span>
          )}
        </div>

        {/* Limit rows */}
        <div style={{ borderTop: `1px solid ${C.g100}` }}>
          {[
            { label: 'Daily', value: limits.daily },
            { label: 'Buy/Sell', value: limits.buySell },
            { label: 'Send', value: limits.send },
          ].map((row, i, arr) => (
            <div key={row.label} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 16px',
              borderBottom: i < arr.length - 1 ? `1px solid ${C.g100}` : 'none',
            }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: C.g500 }}>
                {row.label}
              </span>
              <span style={{
                fontSize: 13, fontWeight: 800,
                color: row.value === 'Unlimited' ? '#059669' : C.g800,
              }}>
                {row.value}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Menu + Logout (right on desktop, first on mobile via CSS order) */}
      <div className="prq-profile-dropdown-menu" style={{
        flex: 1, minWidth: 0,
        display: 'flex', flexDirection: 'column',
        background: '#fff',
      }}>
        <div style={{ overflowY: 'auto', flex: 1 }} className="thin-scroll prq-profile-dropdown-menu-scroll">
          {menuItems.map((item, i) => (
            <button
              key={item.title}
              onClick={item.onClick}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 16px', background: 'none', border: 'none',
                cursor: 'pointer', textAlign: 'left',
                borderBottom: i < menuItems.length - 1 ? `1px solid ${C.g100}` : 'none',
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = C.g50}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}
            >
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: `${item.iconColor}10`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                <item.icon size={17} color={item.iconColor} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 13.5, fontWeight: 800, color: C.g800, lineHeight: 1.2 }}>
                  {item.title}
                </p>
                <p style={{ margin: '1px 0 0', fontSize: 11, fontWeight: 500, color: C.g400, lineHeight: 1.3 }}>
                  {item.subtitle}
                </p>
              </div>
              {item.trailing}
            </button>
          ))}
        </div>

        {/* Logout */}
        <div style={{ borderTop: `1px solid ${C.g100}` }}>
          <button
            onClick={handleLogout}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 10,
              padding: '11px 16px', background: 'none', border: 'none',
              cursor: 'pointer', textAlign: 'left',
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = '#FEF2F2'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}
          >
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: '#FEE2E2',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <LogOut size={17} color="#EF4444" />
            </div>
            <span style={{ fontSize: 13.5, fontWeight: 800, color: '#DC2626' }}>
              Log out
            </span>
          </button>
        </div>
      </div>
    </div>
    </>
  );
}
