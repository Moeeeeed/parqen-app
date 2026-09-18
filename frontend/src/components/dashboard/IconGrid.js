import React from 'react';
import { ChevronRight } from 'lucide-react';
import { iconColorFor, ICON_COLORS } from '../../theme/iconColors';

const C = {
  forest: '#1B4332',
  g100: '#F1F5F9', g500: '#64748B', g800: '#1E293B',
  sectionBg: '#F5F6F7', // light gray band behind the icon cards (NoOnes tone)
  cardShadow: '0 1px 3px rgba(0, 0, 0, 0.08)', // subtle shadow on white icon cards
};

// ── Limited icon palette (NoOnes-style: mostly neutral, few accents) ─────────
// Icon glyph colors come from the shared palette (src/theme/iconColors.js):
// neutral dark gray by default; brand orange/green only for money/trading actions.
// This keeps desktop and mobile on the exact same limited color set.

/**
 * IconGrid — one reusable section for the NoOnes-style dashboard grids:
 * "Last visited", "Product & services", "Account & settings", "Rewards hub".
 *
 * Layout per NoOnes reference:
 *  - centered bold section title
 *  - FIXED 6-column grid on desktop: `repeat(6, minmax(0, 1fr))` — column width
 *    is always 1/6 of the container regardless of item count. If fewer than 6
 *    items exist (e.g. a new user's "Last visited"), the remaining cells stay
 *    empty: items are never stretched, centered as a group, or reflowed.
 *  - each icon sits inside a white rounded-square card (12px radius, subtle
 *    shadow) — the icon itself uses the limited palette: neutral dark gray by
 *    default, brand orange/green only for money/trading actions
 *  - label below: bold, dark gray/black, centered
 *  - subtle hover background only; optional "Show all >" link under the grid
 *
 * NOTE: this component renders only inside the desktop dashboard (≥1280px),
 * so the fixed 6-column rule is intentional and never forced on mobile.
 */
export default function IconGrid({
  title,
  items = [],
  showAllLabel = 'Show all',
  onShowAll,
  onItemClick,
  emptyText,
}) {
  return (
    <div style={{ background: C.sectionBg }}>
      <h3
        className="text-center font-bold mb-6"
        style={{ fontSize: 16, color: C.forest }}
      >
        {title}
      </h3>

      {items.length === 0 ? (
        <p className="text-center text-xs font-semibold pb-1" style={{ color: C.g500 }}>
          {emptyText || 'Nothing here yet'}
        </p>
      ) : (
        <div
          className="grid"
          style={{
            // Fixed 6 equal columns — empty trailing cells are left as-is when
            // items.length < 6 (no auto-fit/auto-fill, no item stretching).
            gridTemplateColumns: 'repeat(6, minmax(0, 1fr))',
            columnGap: 16,
            rowGap: 32,
          }}
        >
          {items.map(({ label, icon: Icon, route }) => {
            if (!Icon) return null;
            return (
              <button
                key={route || label}
                onClick={() => onItemClick?.({ label, icon: Icon, route })}
                aria-label={label}
                className="flex flex-col items-center gap-2.5 rounded-xl py-2 px-1 transition"
                style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = C.g100; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                {/* White rounded-square card holding the icon (full-color accent, no pastel tile) */}
                <div
                  className="flex items-center justify-center flex-shrink-0"
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 12,
                    backgroundColor: '#FFFFFF',
                    boxShadow: C.cardShadow,
                  }}
                >
                  <Icon size={24} style={{ color: iconColorFor(label) }} strokeWidth={2} />
                </div>
                <span
                  className="text-xs text-center leading-tight"
                  style={{ color: C.g800, fontWeight: 700 }}
                >
                  {label}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {onShowAll && (
        <button
          onClick={onShowAll}
          className="mt-4 w-full flex items-center justify-center gap-1 py-2.5 rounded-xl text-xs font-bold transition"
          style={{ color: ICON_COLORS.GREEN, border: 'none', background: 'transparent', cursor: 'pointer' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = C.g100; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
        >
          {showAllLabel} <ChevronRight size={13} />
        </button>
      )}
    </div>
  );
}
