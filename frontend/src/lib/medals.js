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
