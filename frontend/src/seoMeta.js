// Shared SEO metadata — single source of truth for both the runtime <SEO> component
// (frontend/src/components/SEO.js) and the postbuild static-snapshot generator
// (frontend/scripts/generate-seo-pages.js). Plain CommonJS export so it can be
// required() from Node directly with no transpilation.

const PAGE_META = {
  '/': {
    title: 'PRAQEN | Noones Alternative — Buy & Sell Bitcoin & USDT P2P Worldwide',
    description: "Looking for a Noones alternative? PRAQEN is a trusted P2P Bitcoin, USDT & gift card trading platform — bring your trading reputation with you. Buy or sell Bitcoin and USDT instantly with MTN Mobile Money, Airtel, M-Pesa & bank transfer. Escrow-protected, 0.5% flat fee, 180+ countries.",
    ogTitle: 'PRAQEN — Buy & Sell Bitcoin & USDT P2P Worldwide',
    ogDesc: "A trusted Noones & LocalBitcoins alternative for peer-to-peer Bitcoin & USDT trading. Escrow-protected trades, 0.5% flat fee, pay with Mobile Money, M-Pesa or bank transfer.",
    h1: 'PRAQEN — Buy & Sell Bitcoin & USDT P2P Worldwide',
    intro: "A trusted peer-to-peer Bitcoin, USDT and gift card trading platform — and a straightforward alternative if you're moving on from Noones or LocalBitcoins. Buy or sell Bitcoin instantly with MTN Mobile Money, Airtel Money, M-Pesa, and bank transfer. Deposit, withdraw, send and instantly swap USDT (TRC-20) in your wallet. Escrow-protected. 0.5% flat fee. 180+ countries. No hidden charges.",
  },
  '/buy-bitcoin': {
    title: 'Buy Bitcoin Worldwide with Mobile Money | PRAQEN P2P',
    description: 'Buy Bitcoin instantly in Ghana, Nigeria, Kenya & worldwide. Pay with MTN MoMo, M-Pesa, Airtel Money or bank transfer. Best rates, escrow-protected, 0.5% fee.',
    ogTitle: 'Buy Bitcoin Worldwide — PRAQEN P2P Marketplace',
    ogDesc: 'Buy BTC with MTN Mobile Money, M-Pesa or bank transfer. Escrow-protected, best P2P rates globally.',
    h1: 'Buy Bitcoin Worldwide with Mobile Money',
    intro: 'Browse verified sellers and buy Bitcoin instantly with MTN Mobile Money, M-Pesa, Airtel Money, bank transfer, or USDT. Every trade is escrow-protected — Bitcoin is locked before you pay. Best rates, 0.5% flat fee, 180+ countries.',
  },
  '/sell-bitcoin': {
    title: 'Sell Bitcoin for Mobile Money & Cash Worldwide | PRAQEN',
    description: 'Sell Bitcoin instantly for GHS, NGN, KES & more. Receive payment via MTN Mobile Money, M-Pesa, bank transfer. Fast, secure escrow. Best BTC rates worldwide.',
    ogTitle: 'Sell Bitcoin for Cash Worldwide — PRAQEN P2P',
    ogDesc: 'Sell BTC and get paid via MTN MoMo, M-Pesa or bank transfer. Best rates globally. Escrow-protected.',
    h1: 'Sell Bitcoin for Mobile Money & Cash Worldwide',
    intro: 'Convert your Bitcoin to cash instantly. Get paid directly to MTN Mobile Money, M-Pesa, Airtel Money or your bank account. Your Bitcoin stays locked in escrow until payment is confirmed — zero chargebacks, zero risk.',
  },
  '/gift-cards': {
    title: 'Trade Gift Cards for Bitcoin & Cash Globally | PRAQEN',
    description: 'Exchange Amazon, iTunes, Steam, Google Play & 50+ gift cards for Bitcoin or cash. Instant payment via Mobile Money. Best rates guaranteed.',
    ogTitle: 'Gift Card to Bitcoin Trading Globally — PRAQEN',
    ogDesc: 'Sell your Amazon, iTunes, Google Play & Steam gift cards for Bitcoin or mobile money. Instant, escrow-protected, best rates.',
    h1: 'Trade Gift Cards for Bitcoin & Cash Globally',
    intro: 'Convert Amazon, iTunes, Steam, Google Play and 100+ gift card brands into Bitcoin or mobile money instantly. Verified buyers, escrow-protected trades, best rates.',
  },
  '/sell-gift-card': {
    title: 'Sell Gift Cards Instantly for Cash Worldwide | PRAQEN',
    description: 'Sell unused gift cards instantly worldwide. Get paid in Bitcoin or mobile money. Fast verification, best rates for Amazon, iTunes & more.',
    ogTitle: 'Sell Gift Cards Instantly — PRAQEN',
    ogDesc: 'Turn your gift cards into cash or Bitcoin. Fastest payout worldwide via Mobile Money.',
    h1: 'Sell Gift Cards Instantly for Cash Worldwide',
    intro: 'Turn unused gift cards into cash or Bitcoin in minutes. Fast verification, competitive rates, and secure escrow-protected payouts via Mobile Money or your PRAQEN wallet.',
  },
  '/register': {
    title: 'Create Free Account | PRAQEN Global P2P Bitcoin & USDT Trading',
    description: 'Join PRAQEN and start trading Bitcoin & USDT P2P worldwide. Moving from Noones or another P2P platform? Bring your trade history and feedback with you. Free account, instant verification, escrow-protected trades.',
    ogTitle: 'Sign Up Free — PRAQEN P2P Bitcoin & USDT Trading',
    ogDesc: 'Create your free PRAQEN account and start buying or selling Bitcoin & USDT worldwide today. Migrating from Noones? We carry your reputation over.',
    h1: 'Create Your Free PRAQEN Account',
    intro: 'Join a trusted P2P Bitcoin & USDT marketplace. Moving from Noones or another platform? Submit your trade history and PRAQEN will migrate your feedback so you don\'t start from zero. Free account, instant email or phone verification, no bank account required.',
  },
  '/privacy': {
    title: 'Privacy Policy | PRAQEN',
    description: 'How PRAQEN collects, uses, and protects your personal data — including KYC verification, wallet information, and third-party services we use.',
    ogTitle: 'Privacy Policy — PRAQEN',
    ogDesc: 'How PRAQEN collects, uses, and protects your personal data.',
    h1: 'Privacy Policy',
    intro: "This Privacy Policy explains what information PRAQEN collects when you use our website and services, why we collect it, and how it is protected.",
  },
  '/terms': {
    title: 'Terms of Service | PRAQEN',
    description: 'The terms that govern your use of PRAQEN — trading, escrow, fees, wallet custody, disputes, and account rules.',
    ogTitle: 'Terms of Service — PRAQEN',
    ogDesc: 'The terms that govern your use of PRAQEN.',
    h1: 'Terms of Service',
    intro: 'These Terms of Service govern your access to and use of PRAQEN — trading, escrow, fees, wallet custody, disputes, and account rules.',
  },
  '/login': {
    title: 'Sign In to PRAQEN | Global P2P Bitcoin & USDT Trading',
    description: 'Sign in to your PRAQEN account to buy and sell Bitcoin & USDT, trade gift cards, and manage your P2P trades worldwide.',
    ogTitle: 'Sign In — PRAQEN',
    ogDesc: 'Access your PRAQEN account and continue trading Bitcoin & USDT P2P worldwide.',
    h1: 'Sign In to PRAQEN',
    intro: 'Access your PRAQEN account to continue trading Bitcoin & USDT peer-to-peer, manage your wallet, and track your trades.',
  },
};

const NOINDEX_PAGES = ['/dashboard', '/wallet', '/settings', '/my-trades', '/my-listings', '/admin', '/moderator'];

module.exports = { PAGE_META, NOINDEX_PAGES };
