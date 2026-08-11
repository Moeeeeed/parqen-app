// PushSetup.js — Three clean prompts for push notifications
// 1. NotificationPrompt  — asks for browser push permission after login
// 2. AndroidInstallBanner — Android PWA install banner
// 3. IOSInstallGuide      — iOS Safari "Add to Home Screen" guide

import React, { useState, useEffect } from 'react';
import { requestNotificationPermission } from '../utils/notifications';
import { Bell, Zap, DollarSign, CheckCircle, Share, Plus, Smartphone } from 'lucide-react';

const C = {
  forest:  '#1B4332',
  green:   '#2D6A4F',
  gold:    '#F4A422',
  white:   '#FFFFFF',
  g50:     '#F8FAFC',
  g100:    '#F1F5F9',
  g200:    '#E2E8F0',
  g400:    '#94A3B8',
  g500:    '#64748B',
  g600:    '#475569',
  g700:    '#334155',
  g800:    '#1E293B',
  success: '#10B981',
};

// ─────────────────────────────────────────────────────────────────────────────
// 1. NOTIFICATION PERMISSION PROMPT
// Shows 3 seconds after login. Only once per user. Skips if already granted.
// ─────────────────────────────────────────────────────────────────────────────
export function NotificationPrompt({ userId }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!userId) return;
    if (typeof Notification === 'undefined') return;
    if (Notification.permission !== 'default') return;
    const key = `prq_notif_prompted_${userId}`;
    if (localStorage.getItem(key)) return;

    const t = setTimeout(() => setVisible(true), 3000);
    return () => clearTimeout(t);
  }, [userId]);

  const allow = async () => {
    localStorage.setItem(`prq_notif_prompted_${userId}`, '1');
    setVisible(false);
    await requestNotificationPermission();
  };

  const dismiss = () => {
    localStorage.setItem(`prq_notif_prompted_${userId}`, '1');
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <>
      <div
        onClick={dismiss}
        style={{
          position: 'fixed', inset: 0,
          backgroundColor: 'rgba(0,0,0,0.55)',
          zIndex: 9990, animation: 'prqFadeIn .2s ease',
        }}
      />

      <div style={{
        position: 'fixed', left: '50%', top: '50%',
        transform: 'translate(-50%,-50%)',
        width: 'min(340px, calc(100vw - 32px))',
        backgroundColor: C.white, borderRadius: 24,
        boxShadow: '0 24px 64px rgba(0,0,0,0.22)',
        zIndex: 9991, overflow: 'hidden',
        animation: 'prqSlideUp .3s ease',
      }}>

        {/* Green header */}
        <div style={{
          background: `linear-gradient(135deg, ${C.forest}, ${C.green})`,
          padding: '28px 24px 22px', textAlign: 'center',
        }}>
          <div style={{
            width: 60, height: 60, borderRadius: 18, margin: '0 auto 14px',
            backgroundColor: 'rgba(255,255,255,0.15)',
            display: 'flex', alignItems: 'center',
            justifyContent: 'center',
          }}><Bell size={30} color="rgba(255,255,255,0.92)" /></div>
          <p style={{
            color: '#fff', fontWeight: 900, fontSize: 18,
            margin: 0, lineHeight: 1.3,
          }}>
            Never miss a trade
          </p>
          <p style={{
            color: 'rgba(255,255,255,0.72)', fontSize: 13,
            marginTop: 8, marginBottom: 0, lineHeight: 1.6,
          }}>
            Get instant alerts when someone opens a trade, sends payment, or releases Bitcoin.
          </p>
        </div>

        {/* Benefits */}
        <div style={{ padding: '20px 20px 8px' }}>
          {[
            { icon: <Zap size={17} color={C.green} />, text: 'New trade request — respond before it expires' },
            { icon: <DollarSign size={17} color={C.green} />, text: 'Payment received — release Bitcoin on time'    },
            { icon: <CheckCircle size={17} color={C.green} />, text: 'Bitcoin released — confirm funds arrived'       },
          ].map(({ icon, text }) => (
            <div key={text} style={{
              display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12,
            }}>
              <div style={{
                width: 38, height: 38, borderRadius: 11, flexShrink: 0,
                backgroundColor: `${C.success}18`,
                display: 'flex', alignItems: 'center',
                justifyContent: 'center',
              }}>{icon}</div>
              <p style={{
                fontSize: 13, fontWeight: 600,
                color: C.g700, margin: 0, lineHeight: 1.45,
              }}>{text}</p>
            </div>
          ))}
        </div>

        {/* Buttons */}
        <div style={{ padding: '4px 20px 24px' }}>
          <button
            onClick={allow}
            style={{
              width: '100%', padding: '14px', borderRadius: 14,
              backgroundColor: C.forest, color: '#fff',
              fontWeight: 900, fontSize: 15, border: 'none',
              cursor: 'pointer', marginBottom: 10,
              transition: 'opacity .15s',
            }}
          >
            <Bell size={15} style={{ display: 'inline', marginRight: 5, verticalAlign: 'middle' }} /> Turn On Notifications
          </button>
          <button
            onClick={dismiss}
            style={{
              width: '100%', padding: '12px', borderRadius: 14,
              backgroundColor: 'transparent', color: C.g500,
              fontWeight: 600, fontSize: 14,
              border: `1.5px solid ${C.g200}`,
              cursor: 'pointer',
            }}
          >
            Maybe Later
          </button>
        </div>
      </div>

      <style>{`
        @keyframes prqFadeIn   { from{opacity:0}        to{opacity:1}              }
        @keyframes prqSlideUp  { from{transform:translate(-50%,-44%);opacity:0}
                                   to{transform:translate(-50%,-50%);opacity:1}    }
      `}</style>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. ANDROID PWA INSTALL BANNER
// Listens for the browser's beforeinstallprompt event (Chrome on Android).
// Shows a clean banner above the bottom nav. Remembers if dismissed for 7 days.
// ─────────────────────────────────────────────────────────────────────────────
export function AndroidInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [visible, setVisible]               = useState(false);

  useEffect(() => {
    // Already running as installed PWA — don't show
    const inPWA =
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true;
    if (inPWA) return;

    // User dismissed it within the last 7 days — don't nag
    const ts = localStorage.getItem('prq_pwa_dismissed_at');
    if (ts && Date.now() - parseInt(ts, 10) < 7 * 24 * 60 * 60 * 1000) return;

    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setVisible(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const install = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    localStorage.setItem('prq_pwa_dismissed_at', Date.now().toString());
    setVisible(false);
    setDeferredPrompt(null);
  };

  const dismiss = () => {
    localStorage.setItem('prq_pwa_dismissed_at', Date.now().toString());
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <>
      <div style={{
        position: 'fixed', bottom: 72, left: 12, right: 12,
        backgroundColor: C.white, borderRadius: 20,
        boxShadow: '0 8px 32px rgba(0,0,0,0.16)',
        zIndex: 9980, padding: '14px 14px 14px 16px',
        display: 'flex', alignItems: 'center', gap: 12,
        border: `1.5px solid ${C.g100}`,
        animation: 'prqBannerUp .35s ease',
      }}>

        {/* App icon */}
        <div style={{
          width: 48, height: 48, borderRadius: 14, flexShrink: 0,
          background: `linear-gradient(135deg, ${C.forest}, ${C.green})`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'Georgia, serif', fontWeight: 900,
          fontSize: 24, color: C.gold,
        }}>P</div>

        {/* Text */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{
            fontWeight: 800, fontSize: 14,
            color: C.g800, margin: 0, lineHeight: 1.3,
          }}>
            Install PRAQEN
          </p>
          <p style={{
            fontSize: 12, color: C.g500,
            margin: '2px 0 0', lineHeight: 1.4,
          }}>
            Instant trade alerts on your phone
          </p>
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <button
            onClick={dismiss}
            style={{
              padding: '8px 11px', borderRadius: 10,
              backgroundColor: C.g100, color: C.g600,
              fontWeight: 700, fontSize: 12,
              border: 'none', cursor: 'pointer',
            }}
          >
            Not now
          </button>
          <button
            onClick={install}
            style={{
              padding: '8px 14px', borderRadius: 10,
              backgroundColor: C.gold, color: C.forest,
              fontWeight: 900, fontSize: 13,
              border: 'none', cursor: 'pointer',
            }}
          >
            Install
          </button>
        </div>
      </div>

      <style>{`
        @keyframes prqBannerUp {
          from { transform:translateY(16px); opacity:0 }
          to   { transform:translateY(0);    opacity:1 }
        }
      `}</style>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. iOS INSTALL GUIDE
// Detects iPhone/iPad running Safari (not Chrome or Firefox for iOS).
// Shows a bottom sheet with 3 clear steps. Shown once per device.
// ─────────────────────────────────────────────────────────────────────────────
export function IOSInstallGuide() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const isIOS =
      /iPad|iPhone|iPod/.test(navigator.userAgent) &&
      !window.MSStream;
    const isIOSSafari =
      isIOS && !/CriOS|FxiOS|OPiOS|mercury/.test(navigator.userAgent);
    const isStandalone = window.navigator.standalone === true;

    if (!isIOSSafari || isStandalone) return;
    if (localStorage.getItem('prq_ios_guide_seen')) return;

    const t = setTimeout(() => setVisible(true), 5000);
    return () => clearTimeout(t);
  }, []);

  const dismiss = () => {
    localStorage.setItem('prq_ios_guide_seen', '1');
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <>
      <div
        onClick={dismiss}
        style={{
          position: 'fixed', inset: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          zIndex: 9990, animation: 'prqFadeIn .2s ease',
        }}
      />

      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        backgroundColor: C.white,
        borderRadius: '24px 24px 0 0',
        padding: '8px 20px 48px',
        zIndex: 9991,
        animation: 'prqSheetUp .35s ease',
        boxShadow: '0 -8px 40px rgba(0,0,0,0.15)',
      }}>

        {/* Drag handle */}
        <div style={{
          width: 40, height: 4, borderRadius: 2,
          backgroundColor: C.g200,
          margin: '12px auto 22px',
        }} />

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 22 }}>
          <div style={{ marginBottom: 10, display: 'flex', justifyContent: 'center' }}><Smartphone size={38} color={C.g800} /></div>
          <p style={{
            fontWeight: 900, fontSize: 18,
            color: C.g800, margin: 0, lineHeight: 1.3,
          }}>
            Get trade alerts on iPhone
          </p>
          <p style={{
            fontSize: 13, color: C.g500,
            marginTop: 8, marginBottom: 0, lineHeight: 1.6,
          }}>
            Install PRAQEN to your home screen so we can send you instant trade notifications.
          </p>
        </div>

        {/* Steps */}
        {[
          {
            n: '1',
            icon: <Share size={15} color={C.g800} />,
            title: 'Tap the Share button',
            sub: 'It is the box with an arrow — at the bottom of Safari',
          },
          {
            n: '2',
            icon: <Plus size={15} color={C.g800} />,
            title: 'Tap "Add to Home Screen"',
            sub: 'Scroll down in the share sheet until you see it',
          },
          {
            n: '3',
            icon: <CheckCircle size={15} color={C.g800} />,
            title: 'Tap "Add" to confirm',
            sub: 'Open PRAQEN from your home screen and you are done!',
          },
        ].map(({ n, icon, title, sub }) => (
          <div key={n} style={{
            display: 'flex', alignItems: 'flex-start', gap: 14,
            marginBottom: 12, padding: '13px 14px',
            borderRadius: 16, backgroundColor: C.g50,
            border: `1px solid ${C.g100}`,
          }}>
            <div style={{
              width: 34, height: 34, borderRadius: 10, flexShrink: 0,
              backgroundColor: C.forest,
              display: 'flex', alignItems: 'center',
              justifyContent: 'center',
              color: '#fff', fontWeight: 900, fontSize: 14,
            }}>{n}</div>
            <div style={{ flex: 1 }}>
              <p style={{
                fontWeight: 800, fontSize: 14,
                color: C.g800, margin: 0, lineHeight: 1.3,
              }}>
                {icon} {title}
              </p>
              <p style={{
                fontSize: 12, color: C.g500,
                margin: '3px 0 0', lineHeight: 1.5,
              }}>{sub}</p>
            </div>
          </div>
        ))}

        <button
          onClick={dismiss}
          style={{
            width: '100%', padding: '15px', borderRadius: 14,
            backgroundColor: C.forest, color: '#fff',
            fontWeight: 900, fontSize: 15,
            border: 'none', cursor: 'pointer', marginTop: 6,
          }}
        >
          Got it!
        </button>
      </div>

      <style>{`
        @keyframes prqFadeIn  { from{opacity:0} to{opacity:1} }
        @keyframes prqSheetUp { from{transform:translateY(100%)} to{transform:translateY(0)} }
      `}</style>
    </>
  );
}
