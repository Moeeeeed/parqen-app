import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const SOCIALS = [
  { label: 'TikTok', href: 'https://www.tiktok.com/@praqen', bg: 'rgba(0,0,0,0.55)', color: '#ffffff',
    svg: 'M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z' },
  { label: 'Instagram', href: 'https://www.instagram.com/praqen?igsh=MTRkZWg2amp5YnJlYQ%3D%3D&utm_source=qr', bg: 'rgba(228,64,95,0.3)', color: '#E4405F',
    svg: 'M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z' },
  { label: 'X (Twitter)', href: 'https://x.com/praqenapp?s=21', bg: 'rgba(255,255,255,0.12)', color: '#ffffff',
    svg: 'M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z' },
  { label: 'Discord', href: 'https://discord.gg/V6zCZxfdy', bg: 'rgba(88,101,242,0.35)', color: '#5865F2',
    svg: 'M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z' },
  { label: 'LinkedIn', href: 'https://www.linkedin.com/in/pra-qen-045373402/', bg: 'rgba(10,102,194,0.35)', color: '#0A66C2',
    svg: 'M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z' },
];

// ── Icon set — plain stroke-based SVGs, no emoji ────────────────────────────
const ICON_PATHS = {
  search:   'M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.35-4.35',
  card:     'M2 7a2 2 0 012-2h16a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V7zM2 10h20M6 15h4',
  zap:      'M13 2L4.5 13.5H11L10 22l8.5-11.5H12z',
  bitcoin:  'M9.5 4.5v15M14 4.5v15M6 8h9.5a3 3 0 010 6H6m0-6v6m0-6H4.5M6 14h10a3 3 0 010 6H6m0-6v6m0-6H4.5m1.5 6H4.5',
  rocket:   'M12 2c2.5 2 4 5.5 4 9 0 2-.5 3.5-1.5 5L12 19l-2.5-3c-1-1.5-1.5-3-1.5-5 0-3.5 1.5-7 4-9zM9 16l-3 1 1-3M15 16l3 1-1-3M10.5 9a1.5 1.5 0 103 0 1.5 1.5 0 00-3 0z',
  lock:     'M6 11V8a6 6 0 1112 0v3M5 11h14a1 1 0 011 1v8a1 1 0 01-1 1H5a1 1 0 01-1-1v-8a1 1 0 011-1z',
  shield:   'M12 2l8 3.5V11c0 5.2-3.4 9.9-8 11-4.6-1.1-8-5.8-8-11V5.5L12 2zM9 12l2 2 4-4',
};

function Icon({ name, size = 16, color = 'currentColor', strokeWidth = 2 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
      strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICON_PATHS[name]} />
    </svg>
  );
}

const STEPS = [
  { icon: 'search',  step: '01', title: 'Find Trusted Offer', desc: 'Browse listings & check seller profile, ratings & verified status' },
  { icon: 'card',    step: '02', title: 'Select Payment', desc: 'Pick MTN MoMo, Bank or any preferred payment option' },
  { icon: 'zap',     step: '03', title: 'Open Trade · 1 Min', desc: 'Funds locked in escrow instantly — safe & automatic' },
  { icon: 'bitcoin', step: '04', title: 'BTC in Your Wallet', desc: 'Confirm payment · BTC released free to any wallet of your choice' },
];

// Every `to` below must match a real route in App.js — this footer previously
// linked to /help, /escrow, /fees, /contact, /about, /security, /offers and
// /sellers, none of which exist, so those clicks went nowhere.
const LINK_COLUMNS = [
  {
    heading: 'Marketplace',
    links: [
      { label: 'Buy Bitcoin', to: '/buy-bitcoin' },
      { label: 'Sell Bitcoin', to: '/sell-bitcoin' },
      { label: 'Gift Cards', to: '/gift-cards' },
      { label: 'Create Offer', to: '/create-offer' },
    ],
  },
  {
    heading: 'Account',
    links: [
      { label: 'Dashboard', to: '/dashboard' },
      { label: 'My Wallet', to: '/wallet' },
      { label: 'My Trades', to: '/my-trades' },
      { label: 'Register', to: '/register' },
    ],
  },
  {
    heading: 'Company',
    links: [
      { label: 'Blog', to: '/blog' },
      { label: 'Terms of Service', to: '/terms' },
      { label: 'Privacy Policy', to: '/privacy' },
    ],
  },
];

// ── Design tokens: one scale, used everywhere below ────────────────────────
// Solid brand forest green (matches the homepage footer) + a single gold
// accent — no secondary teal hue.
const T = {
  primary: '#ffffff',
  secondary: 'rgba(255,255,255,0.55)',
  muted: 'rgba(255,255,255,0.35)',
  micro: 11,
  body: 12.5,
  emph: 14,
  cardBg: 'rgba(255,255,255,0.05)',
  cardBorder: 'rgba(255,255,255,0.10)',
  goldBg: 'rgba(244,164,34,0.12)',
  goldBorder: 'rgba(244,164,34,0.32)',
  gold: '#F4A422',
};

function Badge({ children }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontSize: T.micro, fontWeight: 700,
      color: T.gold,
      background: T.goldBg,
      border: `1px solid ${T.goldBorder}`,
      borderRadius: 5, padding: '3px 8px', whiteSpace: 'nowrap',
    }}>
      {children}
    </span>
  );
}

export default function PRQFooter() {
  const nav = useNavigate();

  return (
    <footer style={{
      background: '#1B4332',
      fontFamily: "'DM Sans',sans-serif",
      borderTop: '1px solid rgba(255,255,255,0.08)',
      width: '100%', boxSizing: 'border-box',
    }}>
      <style>{`
        .prq-footer-links {
          grid-template-columns: minmax(220px, 1.2fr) repeat(3, minmax(140px, 1fr));
        }
        @media (max-width: 860px) {
          .prq-footer-links {
            grid-template-columns: repeat(2, 1fr) !important;
          }
        }
        @media (max-width: 560px) {
          .prq-footer-links {
            grid-template-columns: 1fr !important;
          }
          .prq-footer-shell {
            padding: 0 18px !important;
          }
        }
      `}</style>
      {/* Centered, max-width shell — this is what fixes the "everything glued to
          the left edge" problem. Every section below shares this container so
          content grows to fill the full footer width on desktop instead of
          hugging the left side, and re-collapses gracefully on mobile. */}
      <div className="prq-footer-shell" style={{ maxWidth: 1200, margin: '0 auto', padding: '0 32px', boxSizing: 'border-box' }}>
        {/* ── How to Buy — 4 equal columns, fills full width ── */}
        <div style={{ padding: '20px 0 16px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <span style={{ fontSize: T.micro, fontWeight: 800, color: T.muted, textTransform: 'uppercase', letterSpacing: 1.4, whiteSpace: 'nowrap' }}>How to Buy</span>
            <span style={{ height: 1, flex: 1, background: 'rgba(255,255,255,0.08)' }} />
            <Badge><Icon name="zap" size={11} /> 60 sec</Badge>
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 10,
          }}>
            {STEPS.map((s, i) => (
              <div key={i} style={{
                position: 'relative',
                background: T.cardBg, border: `1px solid ${T.cardBorder}`,
                borderRadius: 10, padding: '12px 14px', boxSizing: 'border-box',
              }}>
                <span style={{
                  position: 'absolute', top: 10, right: 12,
                  fontSize: 10, fontWeight: 800, color: T.muted, letterSpacing: 0.5,
                }}>{s.step}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: 24, height: 24, borderRadius: 7, flexShrink: 0,
                    background: T.goldBg, color: T.gold,
                  }}>
                    <Icon name={s.icon} size={13} />
                  </span>
                  <span style={{ fontSize: T.emph, fontWeight: 800, color: T.primary, lineHeight: 1.2 }}>{s.title}</span>
                </div>
                <div style={{ fontSize: T.body, color: T.secondary, fontWeight: 500, lineHeight: 1.45 }}>{s.desc}</div>
              </div>
            ))}
          </div>
        </div>
        {/* ── Tagline + Create offer + Buy Now, spread across full width ── */}
        <div style={{
          padding: '16px 0', borderBottom: '1px solid rgba(255,255,255,0.08)',
          display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16,
        }}>
          <div style={{ minWidth: 220 }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: T.primary, lineHeight: 1.25 }}>
              Keep Trading. <span style={{ color: T.gold }}>Keep Growing.</span>
            </div>
            <div style={{ fontSize: T.body, color: T.muted, fontWeight: 500, marginTop: 3 }}>
              The world's most trusted P2P Bitcoin platform
            </div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
            <button onClick={() => nav('/create-offer')} style={{
              flexShrink: 0, padding: '9px 16px', borderRadius: 9,
              border: `1px solid ${T.goldBorder}`, background: T.goldBg, color: T.gold,
              fontWeight: 800, fontSize: T.body, cursor: 'pointer', whiteSpace: 'nowrap',
            }}>
              + Create Offer
            </button>
            <button onClick={() => nav('/buy-bitcoin')} style={{
              flexShrink: 0, padding: '10px 18px', borderRadius: 9, border: 'none', cursor: 'pointer',
              background: 'linear-gradient(135deg,#2D6A4F,#40916C)', color: '#fff',
              fontWeight: 800, fontSize: T.body, boxShadow: '0 2px 10px rgba(0,0,0,0.2)', whiteSpace: 'nowrap',
              display: 'inline-flex', alignItems: 'center', gap: 7,
            }}>
              <Icon name="bitcoin" size={14} /> Buy Now
            </button>
          </div>
        </div>
        {/* ── Link columns + brand/social block — the main width-filling row ── */}
        <div className="prq-footer-links" style={{
          padding: '20px 0 16px',
          display: 'grid',
          gap: 20,
          borderBottom: '1px solid rgba(255,255,255,0.08)',
        }}>
          {/* Brand / contact / socials */}
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: T.primary, marginBottom: 8, letterSpacing: 0.3 }}>
              PRA<span style={{ color: T.gold }}>Q</span>EN
            </div>
            <div style={{ fontSize: T.body, color: T.secondary, fontWeight: 500, lineHeight: 1.6, marginBottom: 12, maxWidth: 260 }}>
              A secure, escrow-protected peer-to-peer marketplace for buying and selling Bitcoin.
            </div>
            <a href="mailto:hello@praqen.com" style={{ display: 'block', fontSize: T.body, fontWeight: 600, color: T.secondary, textDecoration: 'none', marginBottom: 12 }}>
              hello@praqen.com
            </a>
            <div style={{ display: 'flex', gap: 8 }}>
              {SOCIALS.map(s => (
                <a key={s.label} href={s.href} target="_blank" rel="noopener noreferrer" title={s.label}
                  style={{ width: 30, height: 30, borderRadius: 7, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, backgroundColor: s.bg, textDecoration: 'none', transition: 'opacity 0.2s' }}
                  onMouseEnter={e => e.currentTarget.style.opacity = '0.75'}
                  onMouseLeave={e => e.currentTarget.style.opacity = '1'}>
                  <svg viewBox="0 0 24 24" width="14" height="14" fill={s.color} aria-hidden="true"><path d={s.svg} /></svg>
                </a>
              ))}
            </div>
          </div>
          {/* Link columns */}
          {LINK_COLUMNS.map(col => (
            <div key={col.heading}>
              <div style={{ fontSize: T.micro, fontWeight: 800, color: T.muted, textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 12 }}>
                {col.heading}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                {col.links.map(l => (
                  <a key={l.label} onClick={(e) => { e.preventDefault(); nav(l.to); }} href={l.to}
                    style={{ fontSize: T.body, color: T.secondary, fontWeight: 500, textDecoration: 'none', width: 'fit-content' }}
                    onMouseEnter={e => e.currentTarget.style.color = T.primary}
                    onMouseLeave={e => e.currentTarget.style.color = T.secondary}>
                    {l.label}
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>
        {/* ── Bottom bar: legal + trust badges, spread edge to edge ── */}
        <div style={{
          padding: '14px 0 18px',
          display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10,
        }}>
          <span style={{ fontSize: T.micro, color: T.muted, fontWeight: 500 }}>
            © {new Date().getFullYear()} PRAQEN. All rights reserved.
          </span>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: T.micro, color: T.muted, fontWeight: 500 }}>
              <Icon name="lock" size={11} /> SSL Secured
            </span>
            <span style={{ color: 'rgba(255,255,255,0.15)', fontSize: T.micro }}>·</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: T.micro, color: T.muted, fontWeight: 500 }}>
              <Icon name="shield" size={11} /> Escrow Protected
            </span>
            <span style={{ color: 'rgba(255,255,255,0.15)', fontSize: T.micro }}>·</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: T.micro, color: T.muted, fontWeight: 500 }}>
              24/7 Support
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}