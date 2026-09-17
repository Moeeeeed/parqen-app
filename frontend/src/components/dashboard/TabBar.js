import React from 'react';

const C = {
  forest: '#1B4332', green: '#2D6A4F', g400: '#94A3B8', g500: '#64748B', g700: '#334155',
};

/**
 * TabBar — NoOnes-style inline tab strip (not boxed cards).
 *
 * Each tab = icon + label; the active tab is dark with a 3px underline
 * indicator, inactive tabs are muted gray. Used at the top of the main
 * dashboard card on desktop.
 */
export default function TabBar({ tabs = [], activeRoute, onChange }) {
  return (
    <div
      className="flex items-center gap-7 border-b"
      style={{ borderColor: C.g400 + '40' }}
      role="tablist"
    >
      {tabs.map(({ label, icon: Icon, route }) => {
        const active = route === activeRoute;
        return (
          <button
            key={route || label}
            onClick={() => onChange?.(route)}
            role="tab"
            aria-selected={active}
            className="flex items-center gap-2 pb-3 pt-1 transition"
            style={{
              background: 'none',
              border: 'none',
              borderBottom: `3px solid ${active ? C.forest : 'transparent'}`,
              color: active ? C.forest : C.g500,
              fontWeight: active ? 800 : 600,
              fontSize: 14,
              cursor: 'pointer',
              marginBottom: -1,
            }}
          >
            {Icon && <Icon size={16} />}
            {label}
          </button>
        );
      })}
    </div>
  );
}
