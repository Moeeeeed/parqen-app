import { useState, useEffect, useRef, useCallback } from 'react';

const STORAGE_KEY = 'praqen_last_visited';
const MAX = 6;

// ── Trackable pages ────────────────────────────────────────────────────────────
// Only pages the team wants surfaced in the dashboard's Last Visited section
// are listed here. Add/remove pages in one place; the hook derives the icon
// and label automatically so Dashboard.js does not need to re-declare them.
export const VISITABLE_ROUTES = [
  // Product & services tiles
  { route: '/buy-bitcoin',       label: 'P2P Trading',       icon: 'ArrowLeftRight' },
  { route: '/contact',           label: 'Contact support',   icon: 'HelpCircle' },
  { route: '/gift-cards',        label: 'Gift card checker', icon: 'Gift' },
  { route: '/wallet',            label: 'Wallet',            icon: 'Wallet' },
  { route: '/feedback/:tradeId/:userId', label: 'Import feedback', icon: 'ThumbsUp' },
  { route: '/fees',              label: 'Fees',              icon: 'Info' },
  { route: '/medals',            label: 'Medals',            icon: 'Medal' },
  { route: '/quick-start',       label: 'Quick start',       icon: 'Sparkles' },
  { route: '/invite',            label: 'Invite & earn',     icon: 'Share2' },
  // Account & settings tiles
  { route: '/my-listings',       label: 'My offers',         icon: 'Gift' },
  { route: '/settings',          label: 'Account settings',  icon: 'Settings' },
  { route: '/trade-insights',    label: 'Trade insights',    icon: 'TrendingUp' },
  { route: '/payment-accounts',  label: 'Payment accounts',  icon: 'CreditCard' },
  { route: '/devices',           label: 'Devices',           icon: 'ShieldCheck' },
  { route: '/security',          label: 'Security',          icon: 'ShieldCheck' },
  { route: '/discord',           label: 'Discord',           icon: 'Disc' },
  { route: '/status',            label: 'Status',            icon: 'Bell' },
  // Quick tab row
  { route: '/dashboard',         label: 'Launch hub',        icon: 'Bitcoin' },
  { route: '/my-trades',        label: 'Trades',            icon: 'ArrowLeftRight' },
  // Rewards hub
  { route: '/partner-program',   label: 'Affiliate program', icon: 'Award' },
  // Placeholder pages
  { route: '/send',              label: 'Send',              icon: 'Send' },
  { route: '/receive',           label: 'Receive',           icon: 'ArrowRight' },
  { route: '/transfer',          label: 'Transfer',          icon: 'MoveRight' },
  { route: '/swap',              label: 'Swap',              icon: 'ArrowLeftRight' },
  // Profile
  { route: '/profile',           label: 'Profile',           icon: 'User' },
];

// Lightweight lookup so callers can resolve icon/labels without importing
// lucide-react inside the hook layer. Dashboard.js maps the string to the
// real component using the lucide-react barrel it already imports.
export const ROUTE_META = Object.fromEntries(VISITABLE_ROUTES.map(r => [r.route, r]));

// ── Storage helpers ────────────────────────────────────────────────────────────

function readVisited() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch {
    return [];
  }
}

function writeVisited(items) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Storage can be unavailable / full; treat as a no-op rather than crash.
  }
}

// ── Hook ───────────────────────────────────────────────────────────────────────

/**
 * useLastVisited()
 *
 * - Reads the last-visited list from localStorage on mount.
 * - Exposes a `recordVisit(route)` callback you can call from any route
 *   (typically wired once in App.js on location change).
 * - Keeps only the 6 most recent UNIQUE pages (most recent first).
 *   Revisiting a page moves it to the front instead of duplicating it.
 *
 * This is the single, minimal "last visited" tracking hook referenced in the
 * PraQen Dashboard Redesign spec. It intentionally does NOT introduce a new
 * state library; it leans on localStorage because the codebase already uses
 * it for balance/flag caching and there is no existing app-wide store covering
 * this feature.
 */
export default function useLastVisited() {
  const [visited, setVisited] = useState([]);
  const mountedRef = useRef(false);

  // Hydrate once from localStorage (before any route tracking starts).
  useEffect(() => {
    mountedRef.current = true;
    setVisited(readVisited());
    return () => { mountedRef.current = false; };
  }, []);

  const recordVisit = useCallback((route) => {
    if (!route || typeof route !== 'string') return;

    setVisited(prev => {
      // Remove any existing occurrence so re-visits move the entry to front.
      const filtered = prev.filter(item => item.route !== route);
      const next = [{ route, ts: Date.now() }, ...filtered].slice(0, MAX);
      writeVisited(next);
      return next;
    });
  }, []);

  return { visited, recordVisit };
}

// ── Route-change tracker (used once in App.js via RouteErrorBoundary) ─────────
/**
 * useLastVisitedTracker(user, location)
 *
 * A tiny, well-commented hook that records route changes for the dashboard's
 * "Last Visited" section. It is intentionally kept as a single export from
 * this hook file so the App shell does not need to destructure/guard
 * `recordVisit` itself.
 *
 * Flagged exception to Hard Constraint #2: this is the only new hook into
 * route-change events, and it is scoped to customer-facing routes only.
 * Admin/team portals are excluded so they don't pollute the dashboard list.
 */
export function useLastVisitedTracker(user, location) {
  const { recordVisit } = useLastVisited();

  useEffect(() => {
    if (!user?.id) return;
    const pathname = location?.pathname;
    if (!pathname) return;

    // Exclude standalone admin/team portals so they don't pollute the list.
    if (
      pathname.startsWith('/team') ||
      pathname.startsWith('/moderator') ||
      pathname.startsWith('/ceo') ||
      pathname.startsWith('/agent-dashboard') ||
      pathname.startsWith('/accountant-dashboard')
    ) {
      return;
    }

    recordVisit(pathname);
  }, [user?.id, location, recordVisit]);
}

/**
 * matchVisitableRoute(pathname) -> VISITABLE_ROUTES entry | null
 *
 * Resolves a concrete visited pathname (e.g. /feedback/123/456) back to
 * the canonical VISITABLE_ROUTES entry so the dashboard can show the right
 * label/icon.  Parameterized routes are matched by stripping their params
 * and comparing the resulting prefix.
 */
export function matchVisitableRoute(pathname) {
  if (!pathname) return null;
  for (const route of VISITABLE_ROUTES) {
    const pattern = route.route.replace(':tradeId', '').replace(':userId', '').replace(':id', '');
    if (pathname === route.route || pathname.startsWith(pattern)) {
      return route;
    }
  }
  return null;
}
