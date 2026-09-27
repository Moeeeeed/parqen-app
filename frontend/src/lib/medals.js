// lib/medals.js — pure helpers for the Trader Settings → Badges & Medals grid.
// Kept framework-free so they're unit-testable with plain Jest.

// Format an ISO date string/timestamp as "29 July 2025" (day, full month
// name, year) — no time component, resolved in the user's local timezone so
// a UTC midnight date doesn't shift a day for users ahead of UTC.
export function fmtEarnedDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return `${d.getDate()} ${d.toLocaleDateString('en-GB', { month: 'long' })} ${d.getFullYear()}`;
}

// Bottom metadata line under a medal's description, driven by the active tab:
//   Medals tab  → formatted earnedDate ("29 July 2025") once earned; while not
//                 earned, the progress fraction ("25/100") when real partial
//                 progress is tracked and > 0; null otherwise (line hidden —
//                 locked medals already render with a muted grayscale icon).
//   Badges tab  → "current/target" progress when partial progress is tracked
//                 and > 0; null otherwise (no fabricated fractions).
// Returns null when there is nothing to show — callers hide the line.
export function medalMetaText(medal, tab) {
  if (!medal) return null;
  if (tab !== 'badges' && medal.earnedDate) {
    return fmtEarnedDate(medal.earnedDate);
  }
  return progressFraction(medal);
}

// "current/target" only when the backend reports real partial progress > 0.
function progressFraction(medal) {
  const { progressCurrent, progressTarget } = medal;
  if (progressCurrent != null && progressTarget != null && progressCurrent > 0) {
    return `${progressCurrent}/${progressTarget}`;
  }
  return null;
}

// ── Market display ──────────────────────────────────────────────────────
// Names/pictures for the small medals shown next to a trader's name.
// The server sends `user.medals` = medal ids, most prestigious first.
export const MEDAL_INFO = {
  'top-1-club': { name: 'Top 1% Club', icon: '/top-1-club.jpg' },
  'the-og': { name: 'The OG', icon: '/the-og.jpg' },
  'deca-dealer': { name: 'Deca Dealer', icon: '/deca-dealer.jpg' },
  'every-damn-day': { name: 'Every Damn Day', icon: '/every-damn-day.jpg' },
  'momo-master': { name: 'Momo Master', icon: '/momo-master.jpg' },
  'bank-transfer-boss': { name: 'Bank Transfer Boss', icon: '/bank-transfer-boss.jpg' },
  'gift-card-savage': { name: 'Gift Card Savage', icon: '/gift-card-savage.jpg' },
  'clean-sheet': { name: 'Clean Sheet', icon: '/clean-sheet.jpg' },
  'no-slip-zone': { name: 'No Slip Zone', icon: '/no-slip-zone.jpg' },
  'praqen-initiate': { name: 'PraQen Initiate', icon: '/praqen-initiate.jpg' },
};

// Which medals to draw: only known ids, no repeats, at most `max` shown; `more` = how many are hidden.
export function pickMedals(ids, max = 3) {
  const seen = new Set();
  const known = (Array.isArray(ids) ? ids : []).filter((id) => MEDAL_INFO[id] && !seen.has(id) && seen.add(id));
  return { shown: known.slice(0, max), more: Math.max(0, known.length - max), all: known };
}

// ── Affiliate Program level (Explorer / Builder / Titan / Legendary) ────────────────
// A completely different kind of badge from medals above: medals are earned from a
// user's OWN trading; a level is earned from the people THEY brought onto PRAQEN.
// Shown as a small text pill, on purpose visually different from the round medal
// icons, so the two are never mistaken for each other. Same colours as the Referral
// Program page itself (frontend/src/pages/partnerShared.js LEVELS).
export const AFFILIATE_LEVEL_INFO = {
  'affiliate-explorer':   { name: 'Explorer',   color: '#2D6A4F', bg: '#EAF3EE' },
  'affiliate-builder':    { name: 'Builder',    color: '#2D6A4F', bg: '#DDEEE4' },
  'affiliate-titan':      { name: 'Titan',      color: '#8A5A0A', bg: '#FFF1D6' },
  'affiliate-legendary':  { name: 'Legendary',  color: '#FFFFFF', bg: '#1B4332' },
};

// `level` = the {id} shape the server sends as user.affiliateLevel, or null/undefined.
export function pickAffiliateLevel(level) {
  if (!level || !AFFILIATE_LEVEL_INFO[level.id]) return null;
  return { id: level.id, ...AFFILIATE_LEVEL_INFO[level.id] };
}
