import React from 'react';
import {
  Shield, Zap, Briefcase, Target, Medal, Crown, Bird, Diamond, Flame, Rocket,
} from 'lucide-react';

// Single source of truth for all badge definitions across the app.
// Import TRUST_MAP, deriveBadge, BadgeChip, and renderBadgeIcon from here.

export const BADGE_ORDER = [
  'BEGINNER', 'ACTIVE', 'PRO', 'EXPERT', 'AMBASSADOR',
  'LEGEND', 'ELITE', 'DIAMOND', 'TITAN', 'GODMODE',
];

export const BADGE_THRESHOLDS = {
  ACTIVE: 5,
  PRO: 15,
  EXPERT: 35,
  AMBASSADOR: 75,
  LEGEND: 150,
  ELITE: 300,
  DIAMOND: 500,
  TITAN: 750,
  GODMODE: 1000,
};

export const TRUST_MAP = {
  GODMODE:    { label: 'GODMODE',    level: 10, Icon: Rocket,     color: '#FF0080', bg: 'linear-gradient(90deg, #FF0080, #FF8C00, #40E0D0)', textColor: '#FFFFFF', borderColor: '#FF0080', glow: 'rgba(255,0,128,0.5)', animate: true },
  TITAN:      { label: 'TITAN',      level: 9,  Icon: Flame,      color: '#EC4899', bg: 'linear-gradient(135deg,#FCE7F3,#FBCFE8)', textColor: '#9D174D', borderColor: '#EC4899', glow: 'rgba(236,72,153,0.4)' },
  DIAMOND:    { label: 'DIAMOND',    level: 8,  Icon: Diamond,    color: '#06B6D4', bg: 'linear-gradient(135deg,#CFFAFE,#A5F3FC)', textColor: '#155E75', borderColor: '#06B6D4', glow: 'rgba(6,182,212,0.4)' },
  ELITE:      { label: 'ELITE',      level: 7,  Icon: Bird,       color: '#EF4444', bg: 'linear-gradient(135deg,#FEE2E2,#FECACA)', textColor: '#991B1B', borderColor: '#EF4444', glow: 'rgba(239,68,68,0.4)' },
  LEGEND:     { label: 'LEGEND',     level: 6,  Icon: Crown,      color: '#EAB308', bg: 'linear-gradient(135deg,#FEF3C7,#FDE68A)', textColor: '#78350F', borderColor: '#EAB308', glow: 'rgba(234,179,8,0.5)', animate: true },
  AMBASSADOR: { label: 'AMBASSADOR', level: 5,  Icon: Medal,      color: '#14B8A6', bg: 'linear-gradient(135deg,#CCFBF1,#99F6E4)', textColor: '#115E59', borderColor: '#14B8A6', glow: 'rgba(20,184,166,0.4)' },
  EXPERT:     { label: 'EXPERT',     level: 4,  Icon: Target,     color: '#F97316', bg: 'linear-gradient(135deg,#FFEDD5,#FED7AA)', textColor: '#9A3412', borderColor: '#F97316', glow: 'rgba(249,115,22,0.4)' },
  PRO:        { label: 'PRO',        level: 3,  Icon: Briefcase,  color: '#8B5CF6', bg: 'linear-gradient(135deg,#EDE9FE,#DDD6FE)', textColor: '#5B21B6', borderColor: '#8B5CF6', glow: 'rgba(139,92,246,0.4)' },
  ACTIVE:     { label: 'ACTIVE',     level: 2,  Icon: Zap,        color: '#3B82F6', bg: 'linear-gradient(135deg,#DBEAFE,#BFDBFE)', textColor: '#1E40AF', borderColor: '#3B82F6', glow: 'rgba(59,130,246,0.4)' },
  BEGINNER:   { label: 'BEGINNER',   level: 1,  Icon: Shield,     color: '#22C55E', bg: 'linear-gradient(135deg,#DCFCE7,#BBF7D0)', textColor: '#166534', borderColor: '#22C55E', glow: 'rgba(34,197,94,0.4)' },
};

export const BADGE_COLORS = Object.fromEntries(
  Object.entries(TRUST_MAP).map(([key, badge]) => [key, badge.color]),
);

export function renderBadgeIcon(badge, size = 12) {
  if (!badge?.Icon) return null;
  const Icon = badge.Icon;
  return (
    <Icon
      size={size}
      strokeWidth={2.5}
      color={badge.iconColor || badge.color}
      style={{ flexShrink: 0 }}
    />
  );
}

export function deriveBadge(u) {
  if (u?.badge) {
    const b = String(u.badge).toUpperCase();
    if (TRUST_MAP[b]) return TRUST_MAP[b];
  }
  const t = parseInt(u?.total_trades ?? u?.trade_count ?? 0, 10);
  if (t >= 1000) return TRUST_MAP.GODMODE;
  if (t >= 750)  return TRUST_MAP.TITAN;
  if (t >= 500)  return TRUST_MAP.DIAMOND;
  if (t >= 300)  return TRUST_MAP.ELITE;
  if (t >= 150)  return TRUST_MAP.LEGEND;
  if (t >= 75)   return TRUST_MAP.AMBASSADOR;
  if (t >= 35)   return TRUST_MAP.EXPERT;
  if (t >= 15)   return TRUST_MAP.PRO;
  if (t >= 5)    return TRUST_MAP.ACTIVE;
  return TRUST_MAP.BEGINNER;
}

export function getNextBadge(currentKey) {
  const key = String(currentKey || 'BEGINNER').toUpperCase();
  const idx = BADGE_ORDER.indexOf(key);
  if (idx < 0 || idx >= BADGE_ORDER.length - 1) return null;
  const nextKey = BADGE_ORDER[idx + 1];
  return {
    key: nextKey,
    tradesNeeded: BADGE_THRESHOLDS[nextKey],
    ...TRUST_MAP[nextKey],
  };
}

export function BadgeChip({ user, badgeName, className = '', size = 'sm' }) {
  const badge = badgeName
    ? (TRUST_MAP[String(badgeName).toUpperCase()] || TRUST_MAP.BEGINNER)
    : deriveBadge(user);
  const iconSize = size === 'xs' ? 10 : size === 'lg' ? 15 : 12;

  return (
    <span
      className={`inline-flex items-center gap-0.5 font-black flex-shrink-0 ${className}`}
      style={{
        color: badge.color,
        fontSize: size === 'xs' ? '10px' : size === 'lg' ? '13px' : '11px',
        letterSpacing: '0.02em',
      }}
    >
      {renderBadgeIcon(badge, iconSize)}
      <span>{badge.label}</span>
    </span>
  );
}
