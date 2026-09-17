/**
 * Shared icon color palette — single source of truth for dashboard icon grids
 * (desktop IconGrid, mobile tiles, quick tabs, popups).
 *
 * Rule (NoOnes-style, calm look):
 *  - 2 brand accents max: PraQen orange (trading actions) + PraQen green (money actions)
 *  - everything else defaults to a neutral dark-gray outline
 *  - keys are matched on the lowercase icon label, so any surface that renders a
 *    labeled icon can reuse the same mapping without extra config
 */

const BRAND_ORANGE = '#F4A422';
const BRAND_GREEN = '#2D6A4F';
const NEUTRAL = '#475569';

// Money/trading actions get a brand accent; all other icons stay neutral.
const ACCENT_BY_LABEL = {
  // Trading actions → orange
  'p2p trading': BRAND_ORANGE,
  'trades': BRAND_ORANGE,
  'trade insights': BRAND_ORANGE,
  // Money actions → green
  'wallet': BRAND_GREEN,
  'receive': BRAND_GREEN,
  'send': BRAND_GREEN,
  'transfer': BRAND_GREEN,
  'swap': BRAND_GREEN,
  'launch hub': BRAND_GREEN,
};

// Fallback when a caller doesn't have a label (e.g. resolves by route only)
const NEUTRAL_COLOR = NEUTRAL;

export const ICON_COLORS = {
  ORANGE: BRAND_ORANGE,
  GREEN: BRAND_GREEN,
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
