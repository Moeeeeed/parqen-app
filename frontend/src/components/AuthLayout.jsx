import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ShieldCheck, Zap, Headphones, Trophy,
  Users, Globe, CircleDollarSign,
  Gift, Wallet, Bitcoin
} from 'lucide-react';
import PraqenLogo from './PraqenLogo';

const STATS = [
  { icon: Users, value: '50,000+', label: 'Active Traders' },
  { icon: Globe, value: '180+', label: 'Countries' },
  { icon: CircleDollarSign, value: '$25M+', label: 'Monthly Volume' },
];

const FEATURES = [
  { icon: ShieldCheck, title: 'Secure escrow', desc: 'Funds are held safely and released only when the trade is completed.' },
  { icon: Zap, title: 'Trade protection', desc: 'Platform rules and safety checks help protect every transaction.' },
  { icon: Headphones, title: '24/7 Support', desc: 'Our team is available anytime to help resolve issues.' },
  { icon: Trophy, title: 'Partner Program', desc: 'Earn by inviting traders. Get lifetime commissions and shared rewards based on trading activity.' },
];

export default function AuthLayout({ children }) {
  const navigate = useNavigate();

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700;800;900&display=swap');

        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }

        html, body {
          font-family: 'IBM Plex Sans', sans-serif;
          -webkit-font-smoothing: antialiased;
          background: #F0F9F4;
          overscroll-behavior: none;
        }

        /* ── Constrain the auth shell wrapper so it never exceeds the viewport ── */
        /* Root cause: AuthAwareShell sets inline overflowX:hidden, which per the
           CSS Overflow spec forces overflowY:auto — any sub-pixel extra height
           triggers a document scrollbar.  We lock the shell to 100vh on desktop
           and clip overflow on the cross-axis. */
        @media (min-width: 1024px) {
          .auth-shell {
            height: 100vh;
            height: 100dvh;
            min-height: 0;
            overflow: hidden !important;
          }
        }

        .auth-layout {
          display: flex;
          flex-direction: column;
          width: 100%;
          overflow-x: hidden;
        }

        @media (min-width: 1024px) {
          .auth-layout {
            height: 100vh;
            height: 100dvh;
            flex-direction: row;
            overflow: hidden;
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

        .animate-in {
          animation: fadeInUp 0.4s cubic-bezier(0.22, 0.68, 0, 1.1) both;
        }
        .animate-fade {
          animation: fadeIn 0.25s ease both;
        }
        .animate-spin {
          animation: spin 0.7s linear infinite;
        }

        /* Marketing Panel - Desktop Only (RIGHT) */
        .hero-panel {
          display: none;
        }

        @media (min-width: 1024px) {
          .hero-panel {
            display: flex;
            width: 50%;
            flex-shrink: 0;
            flex-direction: column;
            justify-content: flex-start;
            padding: 24px 32px;
            position: relative;
            overflow-y: auto;
            overflow-x: hidden;
            background: linear-gradient(160deg, #1B4332 0%, #1F4D3D 25%, #2D6A4F 60%, #40916C 100%);
            order: 2; /* Forces it to the right */
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

        /* Auth Panel (light, LEFT) */
        .form-panel {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 24px 16px 24px;
          background: #F0F9F4;
          width: 100%;
          overflow: hidden;
          position: relative;
        }

        @media (min-width: 1024px) {
          .form-panel {
            flex: 1;
            min-width: 0;
            min-height: 0;
            width: 50%;
            padding: 45px 101px 40px;
            order: 1; /* Forces it to the left */
            align-items: flex-start;
          }
        }

        /* Login/Register Card Container */
        .auth-card-container {
          width: 100%;
          max-width: 440px;
          display: flex;
          flex-direction: column;
          align-items: center;
          margin-top: 24px;
        }
        
        @media (min-width: 1024px) {
          .auth-card-container {
             margin-top: 40px; /* Small gap below logo on desktop */
             align-items: center;
             align-self: center; /* Center the card horizontally in the left panel */
             width: min(100%, 440px);
          }
        }

        .auth-card {
          width: 100%;
          background: #FFFFFF;
          border-radius: 20px;
          box-shadow: 0 4px 24px rgba(27, 67, 50, 0.08), 0 0 0 1px rgba(27, 67, 50, 0.04);
          overflow: hidden;
        }

        @media (min-width: 1024px) {
          .auth-card {
            border-radius: 24px;
            box-shadow: 0 20px 60px rgba(27, 67, 50, 0.1), 0 0 0 1px rgba(27, 67, 50, 0.05);
          }
        }

        .auth-card-top {
          padding: 22px 20px 14px;
        }

        @media (min-width: 1024px) {
          .auth-card-top {
            padding: 28px 28px 20px;
          }
        }

        .auth-card-body {
          padding: 14px 20px 22px;
        }

        @media (min-width: 1024px) {
          .auth-card-body {
            padding: 20px 28px 28px;
          }
        }

        /* Top Logo (Lightweight Wordmark) */
        .auth-logo {
          text-decoration: none;
          line-height: 1;
          display: flex;
          justify-content: center;
          width: 100%;
        }

        @media (min-width: 1024px) {
          .auth-logo {
            align-self: flex-start; /* Logo left aligned in left panel */
            margin-bottom: 8px;
            justify-content: flex-start;
          }
        }

        @media (max-width: 359px) {
          .form-panel {
            padding-inline: 12px;
          }

          .auth-card-top {
            padding-inline: 16px;
          }

          .auth-card-body {
            padding-inline: 16px;
          }
        }

      `}</style>

      <div className="auth-layout">

        {/* LIGHT PANEL (LEFT) */}
        <div className="form-panel">
          {/* Logo at the top */}
          <div className="auth-logo">
            <PraqenLogo fontSize={34} />
          </div>

          <div className="auth-card-container">
            {children}
          </div>
        </div>

        {/* GREEN PANEL (RIGHT, desktop only) */}
        <div className="hero-panel">
          <div className="hero-bg-pattern" />
          <div className="hero-glow-1" />
          <div className="hero-glow-2" />

          <div style={{ position: 'relative', zIndex: 2, padding: '0 20px' }}>
            {/* Headline starts near top */}
            <h1 style={{
              fontFamily: "'IBM Plex Sans', sans-serif",
              fontSize: 40,
              fontWeight: 600,
              color: 'white',
              lineHeight: 1.08,
              margin: '0 0 12px',
              letterSpacing: '-1px'
            }}>
              The leading <span style={{ color: '#F4A422' }}>peer-to-peer</span>
              <br />trading marketplace
            </h1>

            <p style={{
              fontSize: 16,
              color: 'rgba(255, 255, 255, 0.7)',
              lineHeight: 1.6,
              margin: '0 0 40px',
              fontWeight: 400
            }}>
              Trade independently or earn by growing through our Partner Program — all protected by secure escrow.
            </p>

            {/* Stats — dotted-border cards with flat green background */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 36 }}>
              {STATS.map(({ value, label }) => (
                <div key={label} style={{
                  flex: 1, textAlign: 'center',
                  padding: '16px 8px', borderRadius: 14,
                  border: '1px dotted rgba(244, 164, 34, 0.4)',

                }}>
                  <div style={{ fontSize: 24, fontWeight: 900, color: '#F4A422', lineHeight: 1.2 }}>{value}</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', fontWeight: 500, marginTop: 4 }}>{label}</div>
                </div>
              ))}
            </div>

            {/* Feature List */}
            <div >
              <h3 style={{ fontSize: 18, fontWeight: 800, color: 'white', margin: '0 0 6px', lineHeight: 1.3 }}>
                Your trades are secure
              </h3>
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', margin: '0 0 20px', lineHeight: 1.5 }}>
                Built with protections designed for safe peer-to-peer trading — and opportunities to earn.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {FEATURES.map(({ icon: Icon, title, desc }) => (
                  <div key={title} style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    <Icon size={18} style={{ color: '#F4A422', flexShrink: 0, marginTop: 1 }} />
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13, color: 'white', marginBottom: 2, lineHeight: 1.3 }}>{title}</div>
                      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', lineHeight: 1.5 }}>{desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
