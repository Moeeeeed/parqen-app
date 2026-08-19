import React from 'react';
import {
  Shield, Star, TrendingUp, Briefcase, Crown,
} from 'lucide-react';

// Single source of truth for all badge definitions across the app.
// Import TRUST_MAP, deriveBadge, BadgeChip, and renderBadgeIcon from here.
//
// Tiers are keyed off total_feedback_count (reviews received from completed
// trades), not total_trades — a user can trade a lot without ever collecting
// feedback, and feedback count is what actually signals "buyers/sellers trust
// this person," which is the whole point of the badge.

export const BADGE_ORDER = ['BEGINNER', 'STAR', 'TRADER', 'PRO', 'EXPERT'];

export const BADGE_THRESHOLDS = {
  STAR: 1,
  TRADER: 100,
  PRO: 3000,
  EXPERT: 10000,
};

export const TRUST_MAP = {
  EXPERT:   { label: 'EXPERT',   level: 5, Icon: Crown,      color: '#F97316', solidColor: '#F97316', bg: 'linear-gradient(135deg,#FFEDD5,#FED7AA)', textColor: '#9A3412', borderColor: '#F97316', glow: 'rgba(249,115,22,0.4)' },
  PRO:      { label: 'PRO',      level: 4, Icon: Briefcase,  color: '#8B5CF6', solidColor: '#8B5CF6', bg: 'linear-gradient(135deg,#EDE9FE,#DDD6FE)', textColor: '#5B21B6', borderColor: '#8B5CF6', glow: 'rgba(139,92,246,0.4)' },
  TRADER:   { label: 'TRADER',   level: 3, Icon: TrendingUp, color: '#3B82F6', solidColor: '#3B82F6', bg: 'linear-gradient(135deg,#DBEAFE,#BFDBFE)', textColor: '#1E40AF', borderColor: '#3B82F6', glow: 'rgba(59,130,246,0.4)' },
  STAR:     { label: 'STAR',     level: 2, Icon: Star,       color: '#F59E0B', solidColor: '#F59E0B', bg: 'linear-gradient(135deg,#FEF3C7,#FDE68A)', textColor: '#92400E', borderColor: '#F59E0B', glow: 'rgba(245,158,11,0.4)' },
  BEGINNER: { label: 'BEGINNER', level: 1, Icon: Shield,     color: '#22C55E', solidColor: '#22C55E', bg: 'linear-gradient(135deg,#DCFCE7,#BBF7D0)', textColor: '#166534', borderColor: '#22C55E', glow: 'rgba(34,197,94,0.4)' },
};

export const BADGE_COLORS = Object.fromEntries(
  Object.entries(TRUST_MAP).map(([key, badge]) => [key, badge.solidColor || badge.color]),
);

export function renderBadgeIcon(badge, size = 12) {
  if (!badge?.Icon) return null;
  const Icon = badge.Icon;
  return (
    <Icon
      size={size}
      strokeWidth={2.5}
      color={badge.iconColor || badge.solidColor || badge.color}
      style={{ flexShrink: 0 }}
    />
  );
}

export function deriveBadge(u) {
  if (u?.badge) {
    const b = String(u.badge).toUpperCase();
    if (TRUST_MAP[b]) return TRUST_MAP[b];
  }
  const f = parseInt(u?.total_feedback_count ?? 0, 10);
  if (f >= BADGE_THRESHOLDS.EXPERT) return TRUST_MAP.EXPERT;
  if (f >= BADGE_THRESHOLDS.PRO)    return TRUST_MAP.PRO;
  if (f >= BADGE_THRESHOLDS.TRADER) return TRUST_MAP.TRADER;
  if (f >= BADGE_THRESHOLDS.STAR)   return TRUST_MAP.STAR;
  return TRUST_MAP.BEGINNER;
}

export function getNextBadge(currentKey) {
  const key = String(currentKey || 'BEGINNER').toUpperCase();
  const idx = BADGE_ORDER.indexOf(key);
  if (idx < 0 || idx >= BADGE_ORDER.length - 1) return null;
  const nextKey = BADGE_ORDER[idx + 1];
  return {
    key: nextKey,
    countNeeded: BADGE_THRESHOLDS[nextKey],
    ...TRUST_MAP[nextKey],
  };
}

export function BadgeChip({ user, badgeName, className = '', size = 'sm' }) {
  const badge = badgeName
    ? (TRUST_MAP[String(badgeName).toUpperCase()] || TRUST_MAP.BEGINNER)
    : deriveBadge(user);
  const iconSize = size === 'xs' ? 9.5 : size === 'lg' ? 14 : 11;

  return (
    <span
      className={`inline-flex items-center gap-1 font-black max-w-full min-w-0 ${className}`}
      style={{
        color: badge.solidColor || badge.color,
        fontSize: size === 'xs' ? '9.5px' : size === 'lg' ? '12.5px' : '10.5px',
        letterSpacing: '0.01em',
        lineHeight: 1.1,
      }}
      title={badge.label}
    >
      {renderBadgeIcon(badge, iconSize)}
      <span className="truncate min-w-0">{badge.label}</span>
    </span>
  );
}

