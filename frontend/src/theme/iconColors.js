/**
 * Shared icon color palette — single source of truth for dashboard icon grids
 * (desktop IconGrid, mobile tiles, quick tabs, popups).
 *
 * Every tile gets a distinct brand-family color (not just a "calm 2-accent"
 * palette) — each icon sits in a soft tinted badge (15% opacity of the color
 * below) so the grid reads as colorful and clearly categorized rather than a
 * flat list of gray icons.
 * Keys are matched on the lowercase icon label, so any surface that renders a
 * labeled icon can reuse the same mapping without extra config.
 */

const BRAND_ORANGE = '#F4A422';
const BRAND_GREEN  = '#2D6A4F';
const FOREST       = '#1B4332';
const TEAL         = '#0F766E';
const BLUE         = '#3B82F6';
const PURPLE       = '#8B5CF6';
const AMBER        = '#D97706';
const PINK         = '#DB2777';
const INDIGO       = '#6366F1';
const NEUTRAL      = '#475569';

const ACCENT_BY_LABEL = {
  // Trading actions → orange
  'p2p trading': BRAND_ORANGE,
  'trades': BRAND_ORANGE,
  'trade insights': BRAND_ORANGE,
  'trade': BRAND_ORANGE,
  // Wallet / money movement → green family
  'wallet': BRAND_GREEN,
  'receive': BRAND_GREEN,
  'send': BRAND_GREEN,
  'transfer': BRAND_GREEN,
  'swap': BRAND_GREEN,
  'launch hub': BRAND_GREEN,
  'main': BRAND_GREEN,
  'home': BRAND_GREEN,
  'payment accounts': FOREST,
  // Rewards / growth → gold & amber
  'medals': BRAND_ORANGE,
  'affiliate program': AMBER,
  'partner program': AMBER,
  'invite & earn': AMBER,
  'quick start': AMBER,
  // Gift cards / offers → teal (matches USDT brand color elsewhere in the app)
  'gift card checker': TEAL,
  'my offers': TEAL,
  // Support / feedback → blue (trust)
  'contact support': BLUE,
  'import feedback': BLUE,
  'status': BLUE,
  'support': BLUE,
  // Account & security → indigo/purple
  'account settings': INDIGO,
  'devices': INDIGO,
  'security': PURPLE,
  'discord': PURPLE,
  // Info / fees → neutral-adjacent but still a color, not flat gray
  'fees': PINK,
};

const NEUTRAL_COLOR = NEUTRAL;

export const ICON_COLORS = {
  ORANGE: BRAND_ORANGE,
  GREEN: BRAND_GREEN,
  FOREST,
  TEAL,
  BLUE,
  PURPLE,
  AMBER,
  PINK,
  INDIGO,
  NEUTRAL,
};

/**
 * iconColorFor(label) → hex color for an icon glyph.
 * Case/whitespace-insensitive; unknown labels default to neutral gray.
 */
export function iconColorFor(label) {
  if (!label) return NEUTRAL_COLOR;
  return ACCENT_BY_LABEL[String(label).trim().toLowerCase()] || NEUTRAL_COLOR;
}

export default iconColorFor;
