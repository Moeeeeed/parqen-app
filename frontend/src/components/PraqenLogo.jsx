import React from 'react';

// Renders the real PRAQEN wordmark (public/praqen-logo.png) — replaces the old
// hand-drawn CSS wordmark. `fontSize` is kept as the prop name (not renamed to
// `height`) so existing callers like AuthLayout.jsx don't need to change.
export default function PraqenLogo({ fontSize = 40 }) {
  return (
    <img
      src="/praqen-logo.png"
      alt="PRAQEN"
      style={{ height: `${fontSize}px`, width: 'auto', display: 'block' }}
    />
  );
}
