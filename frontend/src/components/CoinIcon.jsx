import React from 'react';

// Crisp coin icons for Bitcoin and USDT: a solid brand-colour circle with a WHITE logo, so they stay
// readable at small sizes and on any background. Use `ring` on coloured buttons (Buy / Sell): a white
// ring separates the coin from the button colour.
const COINS = {
  BTC: {
    bg: '#F7931A',
    label: 'Bitcoin',
    path: 'M23.189 14.02c.314-2.096-1.283-3.223-3.465-3.975l.708-2.84-1.728-.43-.69 2.765c-.454-.114-.92-.22-1.385-.326l.695-2.783L15.596 6l-.708 2.839c-.376-.086-.746-.17-1.104-.26l.002-.009-2.384-.595-.46 1.846s1.283.294 1.256.312c.7.175.826.638.805 1.006l-.806 3.235c.048.012.11.03.18.057l-.183-.045-1.13 4.532c-.086.212-.303.531-.793.41.018.025-1.256-.313-1.256-.313l-.858 1.978 2.25.561c.418.105.828.215 1.231.318l-.715 2.872 1.727.43.708-2.84c.472.127.93.245 1.378.357l-.706 2.828 1.728.43.715-2.866c2.948.558 5.164.333 6.097-2.333.752-2.146-.037-3.385-1.588-4.192 1.13-.26 1.98-1.003 2.207-2.538zm-3.95 5.538c-.533 2.147-4.148.986-5.32.695l.95-3.805c1.172.293 4.929.872 4.37 3.11zm.535-5.569c-.487 1.953-3.495.96-4.47.717l.86-3.45c.975.243 4.118.696 3.61 2.733z',
  },
  USDT: {
    bg: '#26A17B',
    label: 'USDT',
    path: 'M17.922 17.383v-.002c-.11.008-.677.042-1.942.042-1.01 0-1.721-.03-1.971-.042v.003c-3.888-.171-6.79-.848-6.79-1.658 0-.809 2.902-1.486 6.79-1.66v2.644c.254.018.982.061 1.988.061 1.207 0 1.812-.05 1.925-.06v-2.643c3.88.173 6.775.85 6.775 1.658 0 .81-2.895 1.485-6.775 1.657m0-3.59v-2.366h5.414V7.819H8.595v3.608h5.414v2.365c-4.4.202-7.709 1.074-7.709 2.118 0 1.044 3.309 1.915 7.709 2.118v7.582h3.913v-7.584c4.393-.202 7.694-1.073 7.694-2.116 0-1.043-3.301-1.914-7.694-2.117',
  },
};

export default function CoinIcon({ coin = 'BTC', size = 18, ring = false, className = '', style }) {
  const c = COINS[String(coin).toUpperCase()] || COINS.BTC;
  return (
    <svg
      role="img"
      aria-label={c.label}
      viewBox="0 0 32 32"
      width={size}
      height={size}
      className={className}
      style={{ flexShrink: 0, display: 'inline-block', borderRadius: '50%', boxShadow: ring ? '0 0 0 2px #fff, 0 2px 6px rgba(0,0,0,.25)' : '0 1px 2px rgba(0,0,0,.18)', ...style }}
    >
      <circle cx="16" cy="16" r="16" fill={c.bg} />
      <path fill="#fff" d={c.path} />
    </svg>
  );
}
