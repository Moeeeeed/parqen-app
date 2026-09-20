import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bitcoin, ArrowLeftRight, HelpCircle, Gift, Wallet, ThumbsUp, Info, Medal,
  Sparkles, Share2, Settings, TrendingUp, CreditCard, ShieldCheck, Bell, Disc,
  Award,
} from 'lucide-react';
import TabBar from '../../components/dashboard/TabBar';
import IconGrid from '../../components/dashboard/IconGrid';
import WelcomeCard from '../../components/dashboard/WelcomeCard';
import WalletBalanceCard from '../../components/dashboard/WalletBalanceCard';
import NewsCard from '../../components/dashboard/NewsCard';

const C = {
  forest: '#1B4332', green: '#2D6A4F',
  g200: '#E2E8F0',
  sectionBg: '#F5F6F7', // light gray band behind each icon-grid section (NoOnes tone)
  gold: '#F4A422', amber: '#F59E0B', blue: '#3B82F6', purple: '#8B5CF6',
  success: '#10B981',
};

// Wrapper for one IconGrid section: full-width light-gray band + subtle divider
function Section({ children, divider = true }) {
  return (
    <div
      style={{
        background: C.sectionBg,
        padding: '24px 24px',
        borderBottom: divider ? `1px solid ${C.g200}` : 'none',
      }}
    >
      {children}
    </div>
  );
}

// ── Product & services items (same routes as the mobile layout) ─────────────
// Icon colors are NOT stored per item — the shared palette in
// src/theme/iconColors.js derives them from the label (neutral by default,
// brand orange/green only for money/trading actions).
const PRODUCTS_AND_SERVICES = [
  { label: 'P2P Trading',       icon: ArrowLeftRight, route: '/buy-bitcoin' },
  { label: 'Contact support',   icon: HelpCircle,     route: '/contact' },
  { label: 'Gift card checker', icon: Gift,           route: '/gift-cards' },
  { label: 'Wallet',            icon: Wallet,         route: '/wallet' },
  { label: 'Import feedback',   icon: ThumbsUp,       route: '/feedback/:tradeId/:userId' },
  { label: 'Fees',              icon: Info,           route: '/fees' },
  { label: 'Medals',            icon: Medal,          route: '/medals' },
  { label: 'Quick start',       icon: Sparkles,       route: '/quick-start' },
  { label: 'Invite & earn',     icon: Share2,         route: '/invite' },
];

// ── Account & settings items ─────────────────────────────────────────────────
const ACCOUNT_AND_SETTINGS = [
  { label: 'My offers',        icon: Gift,          route: '/my-listings' },
  { label: 'Account settings', icon: Settings,      route: '/settings' },
  { label: 'Trade insights',   icon: TrendingUp,    route: '/trade-insights' },
  { label: 'Payment accounts', icon: CreditCard,    route: '/payment-accounts' },
  { label: 'Devices',          icon: ShieldCheck,   route: '/devices' },
  { label: 'Security',         icon: ShieldCheck,   route: '/security' },
  { label: 'Discord',          icon: Disc,          route: '/discord' },
  { label: 'Status',           icon: Bell,          route: '/status' },
];

// ── PraQen news items (same data as the mobile news section) ─────────────────
// `publishedAt` is the real publish date used for both the group day label
// (e.g. "Thursday") and the per-item DD/MM/YYYY HH:mm stamp next to the button.
const PRAQUE_NEWS = [
  {
    id: 1,
    title: 'P2P Trading Volume Hits New High',
    description: 'Our community traded over 500 BTC last week — the highest weekly volume since launch.',
    actionLabel: 'View Report',
    route: '/trade-insights',
    publishedAt: '2026-09-03T08:39:00',
    iconName: 'TrendingUp',
    color: '#F59E0B',
  },
  {
    id: 2,
    title: 'New Feature: Instant Withdrawals',
    description: 'Withdraw your earnings to your external wallet in seconds — no more waiting for manual processing.',
    actionLabel: 'Withdraw Funds Now',
    route: '/wallet',
    publishedAt: '2026-08-31T14:22:00',
    iconName: 'Zap',
    color: '#10B981',
  },
];

/**
 * DashboardDesktop — NoOnes-style two-column dashboard (desktop ≥1280px only).
 *
 * Left column (~68%): Welcome card → one shared white card containing the
 * tab bar + all grid sections (Last visited / Product & services /
 * Account & settings / Rewards hub) with internal dividers.
 *
 * Right column (~32%): Wallet balance → PraQen news, stacked,
 * sticky under the navbar.
 *
 * Mobile/tablet keeps the existing stacked layout — Dashboard.js only renders
 * this component when the viewport is ≥1280px wide.
 */
export default function DashboardDesktop({
  user,
  walletBalance,
  ghsRate,
  showBalance,
  onToggleBalance,
  lastVisitedItems,
  resolveIcon,
  onTakeTour,
}) {
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState('/dashboard');

  const ghsBalance = walletBalance * ghsRate;
  const go = (route) => { if (route) navigate(route); };

  const TABS = [
    { label: 'Launch hub',       route: '/dashboard', icon: Bitcoin },
    { label: 'Trades',           route: '/my-trades', icon: ArrowLeftRight },
    { label: 'Support tickets',  route: '/contact',   icon: HelpCircle },
  ];

  const lastVisitedGridItems = (lastVisitedItems || [])
    .map(({ label, icon: iconName, route }) => {
      const Icon = resolveIcon(iconName);
      // No per-item color — IconGrid derives it from the shared palette.
      return Icon ? { label, icon: Icon, route } : null;
    })
    .filter(Boolean);

  return (
    <div
      className="mx-auto"
      style={{
        maxWidth: 1280,
        padding: '16px 24px 40px',
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 68fr) minmax(0, 32fr)',
        gap: 24,
        alignItems: 'start',
      }}
    >
      {/* ══ LEFT COLUMN ═══════════════════════════════════════════════════ */}
      <div className="flex flex-col gap-4 min-w-0">
        <WelcomeCard user={user} onTakeTour={onTakeTour} />

        {/* Shared white card: tab bar + gray grid-section bands with dividers.
            No horizontal padding here — each section band spans edge-to-edge,
            clipped by the card's rounded corners. */}
        <div
          className="bg-white"
          style={{ borderRadius: 12, border: `1px solid ${C.g200}`, overflow: 'hidden' }}
        >
          <div style={{ padding: '4px 24px 0' }}>
            <TabBar
              tabs={TABS}
              activeRoute={activeTab}
              onChange={(route) => { setActiveTab(route); go(route); }}
            />
          </div>

          {/* Last visited — hidden entirely until the user has visit history.
              Fixed 6-column grid: fewer than 6 items leaves the trailing cells empty. */}
          {lastVisitedGridItems.length > 0 && (
            <Section>
              <IconGrid
                title="Last visited"
                items={lastVisitedGridItems}
                onItemClick={({ route }) => go(route)}
              />
            </Section>
          )}

          {/* Product & services — desktop shows all items in full (no "Show all") */}
          <Section>
            <IconGrid
              title="Product & services"
              items={PRODUCTS_AND_SERVICES}
              onItemClick={({ route }) => go(route)}
            />
          </Section>

          {/* Account & settings — desktop shows all items in full (no "Show all") */}
          <Section>
            <IconGrid
              title="Account & settings"
              items={ACCOUNT_AND_SETTINGS}
              onItemClick={({ route }) => go(route)}
            />
          </Section>

          <Section divider={false}>
            <IconGrid
              title="Rewards hub"
              items={[{ label: 'Partner program', icon: Award, route: '/partner-program' }]}
              onItemClick={({ route }) => go(route)}
            />
          </Section>
        </div>
      </div>

      {/* ══ RIGHT COLUMN — sticky sidebar ═════════════════════════════════ */}
      <aside
        className="flex flex-col gap-4"
        style={{ position: 'sticky', top: 'calc(var(--navbar-h) + 16px)' }}
      >
        <WalletBalanceCard
          ghsBalance={ghsBalance}
          showBalance={showBalance}
          onToggleBalance={onToggleBalance}
        />
        <NewsCard items={PRAQUE_NEWS} />
      </aside>
    </div>
  );
}
