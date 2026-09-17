import React, { useState } from 'react';
import { Info, Copy, Check, Medal } from 'lucide-react';

const C = {
  forest: '#1B4332', green: '#2D6A4F', gold: '#F4A422',
  g100: '#F1F5F9', g200: '#E2E8F0', g300: '#CBD5E1',
  g400: '#94A3B8', g500: '#64748B', g600: '#475569', g800: '#1E293B',
  purple: '#8B5CF6',
};

const flagFromCountryCode = (cc) => {
  const code = (cc || '').toString().toUpperCase().slice(0, 2);
  if (code.length === 2 && /^[A-Z]{2}$/.test(code)) {
    return String.fromCodePoint(0x1F1E6 + code.charCodeAt(0) - 65) +
           String.fromCodePoint(0x1F1E6 + code.charCodeAt(1) - 65);
  }
  return '';
};

function StatValue({ label, children }) {
  return (
    <div className="flex flex-col items-center gap-1.5" style={{ minWidth: 90 }}>
      <span className="text-xs font-semibold flex items-center gap-1" style={{ color: C.g500 }}>
        {label} <Info size={11} style={{ color: C.g400 }} />
      </span>
      {children}
    </div>
  );
}

/**
 * WelcomeCard — top-left-column card (NoOnes style):
 *  - "Dashboard" page title + info icon + green underlined "Take a tour" link above the card
 *  - avatar, "Welcome, {username}" heading
 *  - Joined / Country / Handle label+value pairs on the left
 *  - Current badge / Medals / Limits vertical stat blocks with light dividers on the right
 */
export default function WelcomeCard({ user, onTakeTour }) {
  const [copied, setCopied] = useState(false);

  const copyHandle = () => {
    if (!user?.username) return;
    navigator.clipboard?.writeText('@' + user.username).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const joined = user?.created_at
    ? new Date(user.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : '—';
  const flag = flagFromCountryCode(user?.country_code || user?.country);
  const countryName = (user?.country_name || user?.country || '—').toString().slice(0, 20);

  const medalColors = ['#F4A422', '#94A3B8', '#CD7F32'];

  return (
    <div>
      {/* Page title row (per reference: sits above the card) */}
      <div className="flex items-center gap-2 mb-3">
        <h1 className="text-xl font-extrabold" style={{ color: C.forest }}>Dashboard</h1>
        <Info size={14} style={{ color: C.g400 }} />
        <button
          onClick={onTakeTour}
          className="text-xs font-bold underline underline-offset-2"
          style={{ color: C.green, background: 'none', border: 'none', cursor: 'pointer' }}
        >
          Take a tour
        </button>
      </div>

      {/* Card body */}
      <div
        className="bg-white flex items-center justify-between gap-6"
        style={{
          borderRadius: 12,
          border: `1px solid ${C.g200}`,
          padding: 24,
        }}
      >
        {/* Left: avatar + welcome + joined/country/handle */}
        <div className="flex items-center gap-5 min-w-0">
          <div className="relative flex-shrink-0">
            {user?.avatar_url ? (
              <img
                src={user.avatar_url}
                alt="Profile"
                className="w-16 h-16 rounded-2xl object-cover"
                style={{ border: `1px solid ${C.g200}` }}
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                  if (e.currentTarget.nextElementSibling) e.currentTarget.nextElementSibling.style.display = 'flex';
                }}
              />
            ) : null}
            <div
              className="w-16 h-16 rounded-2xl items-center justify-center flex-shrink-0"
              style={{
                backgroundColor: C.purple, color: 'white', fontSize: 24, fontWeight: 900,
                display: user?.avatar_url ? 'none' : 'flex',
              }}
            >
              {user?.username?.charAt(0)?.toUpperCase() || '?'}
            </div>
          </div>

          <div className="min-w-0">
            <h2 className="text-xl font-extrabold truncate" style={{ color: C.forest }}>
              Welcome, {user?.username || 'User'}
            </h2>
            <div className="flex items-center gap-6 mt-3 flex-wrap">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-semibold" style={{ color: C.g500 }}>Joined</span>
                <span className="text-xs font-bold" style={{ color: C.forest }}>{joined}</span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-semibold" style={{ color: C.g500 }}>Country</span>
                <span className="text-xs font-bold" style={{ color: C.forest }}>
                  {flag ? `${flag} ` : ''}{countryName}
                </span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-semibold" style={{ color: C.g500 }}>Handle</span>
                <span className="text-xs font-bold flex items-center gap-1" style={{ color: C.forest }}>
                  @{user?.username || '—'}
                  <button
                    onClick={copyHandle}
                    className="w-5 h-5 rounded flex items-center justify-center hover:bg-gray-100 transition flex-shrink-0"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.g400 }}
                    aria-label="Copy handle"
                  >
                    {copied ? <Check size={12} style={{ color: C.green }} /> : <Copy size={12} />}
                  </button>
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Right: three stat blocks with light dividers */}
        <div className="flex items-center gap-6 flex-shrink-0">
          <div className="w-px self-stretch" style={{ background: C.g200 }} />
          <StatValue label="Current badge">
            <span className="text-xs font-bold flex items-center gap-1" style={{ color: C.forest }}>
              {user?.badge ? (
                <>
                  <span style={{ color: C.gold }}>★</span> {user.badge}
                </>
              ) : '—'}
            </span>
          </StatValue>
          <div className="w-px self-stretch" style={{ background: C.g200 }} />
          <StatValue label="Medals">
            <span className="flex items-center gap-1">
              {medalColors.map((mc, i) => (
                <Medal key={i} size={14} style={{ color: mc }} />
              ))}
              <span className="text-xs font-bold ml-0.5" style={{ color: C.g500 }}>+0</span>
            </span>
          </StatValue>
          <div className="w-px self-stretch" style={{ background: C.g200 }} />
          <StatValue label="Limits">
            <span className="text-xs font-bold" style={{ color: C.forest }}>Unlimited</span>
          </StatValue>
        </div>
      </div>
    </div>
  );
}
