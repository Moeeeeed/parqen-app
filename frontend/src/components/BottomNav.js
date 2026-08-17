import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { LayoutDashboard, ArrowLeftRight, Gift, Wallet, User } from 'lucide-react';

const NAV_ITEMS = [
  { label: 'Dashboard',  icon: LayoutDashboard,  to: '/dashboard' },
  { label: 'P2P',        icon: ArrowLeftRight,   to: '/buy-bitcoin' },
  { label: 'Gift Cards', icon: Gift,             to: '/gift-cards' },
  { label: 'Wallet',     icon: Wallet,           to: '/wallet' },
  { label: 'Profile',    icon: User,             to: '/profile' },
];

function NavItem({ label, icon: Icon, to, active }) {
  return (
    <NavLink
      to={to}
      style={{ color: active ? '#F4A422' : '#64748B', textDecoration: 'none', flex: 1 }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', padding: '0 4px' }}>
        <Icon size={21} strokeWidth={active ? 2.2 : 1.8} />
        <span style={{ fontSize: '10px', fontWeight: active ? '700' : '400', lineHeight: 1 }}>
          {label}
        </span>
      </div>
    </NavLink>
  );
}

export default function BottomNav({ user }) {
  const location = useLocation();

  if (!user) return null;
  if (location.pathname.startsWith('/trade/')) return null;

  const isActive = (to) => {
    if (to === '/gift-cards') {
      return location.pathname.startsWith('/gift-cards') || location.pathname.startsWith('/sell-gift-card');
    }
    return location.pathname.startsWith(to);
  };

  return (
    <nav
      className="flex md:hidden"
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        height: 'calc(60px + env(safe-area-inset-bottom, 0px))',
        backgroundColor: '#ffffff',
        borderTop: '1px solid #e2e8f0',
        alignItems: 'flex-start',
        justifyContent: 'space-around',
        zIndex: 1000,
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        paddingTop: '8px',
        boxShadow: '0 -1px 0 rgba(0,0,0,0.06)',
      }}
    >
      {NAV_ITEMS.map((item) => (
        <NavItem
          key={item.to}
          {...item}
          active={isActive(item.to)}
        />
      ))}
    </nav>
  );
}
