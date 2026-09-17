import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Eye, EyeOff, Info, MoreHorizontal, ArrowRight, Send, MoveRight, ArrowLeftRight,
} from 'lucide-react';

const C = {
  forest: '#1B4332', green: '#2D6A4F',
  g100: '#F1F5F9', g200: '#E2E8F0',
  g400: '#94A3B8', g500: '#64748B', g600: '#475569', g800: '#1E293B',
};

// ⋯ menu options — routes match the mobile wallet options popup (WALLET_MENU_ITEMS
// in Dashboard.js). /receive, /send, /transfer and /swap currently render
// PlaceholderPage — flag: these need real page implementations.
const MENU_ITEMS = [
  { label: 'Receive',  icon: ArrowRight,      route: '/receive',  color: C.forest },
  { label: 'Send',     icon: Send,            route: '/send',     color: C.forest },
  { label: 'Transfer', icon: MoveRight,       route: '/transfer', color: C.forest },
  { label: 'Swap',     icon: ArrowLeftRight,  route: '/swap',     color: C.forest },
];

/**
 * WalletBalanceCard — right sidebar card (NoOnes style):
 *  - "Wallet balance" heading with eye visibility toggle
 *  - large bold GHS balance with info icon
 *  - three-dot (⋯) menu at top-right opening a dropdown with
 *    Receive / Send / Transfer / Swap (no Visa card)
 */
export default function WalletBalanceCard({ ghsBalance, showBalance, onToggleBalance }) {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  // Close on outside click / Escape
  useEffect(() => {
    if (!menuOpen) return undefined;
    const onDown = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  return (
    <div
      className="bg-white"
      style={{ borderRadius: 12, border: `1px solid ${C.g200}`, padding: 20 }}
    >
      {/* Heading + eye toggle + ⋯ menu */}
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-bold" style={{ color: C.forest }}>Wallet balance</h3>
        <div className="flex items-center gap-1">
          <button
            onClick={onToggleBalance}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center', color: C.g500 }}
            aria-label={showBalance ? 'Hide balance' : 'Show balance'}
          >
            {showBalance ? <Eye size={15} /> : <EyeOff size={15} />}
          </button>
          <div ref={menuRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setMenuOpen((v) => !v)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer', padding: 4,
                display: 'flex', alignItems: 'center', color: C.g500, borderRadius: 8,
              }}
              aria-label="Wallet actions"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              <MoreHorizontal size={16} />
            </button>

            {menuOpen && (
              <div
                role="menu"
                style={{
                  position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 50,
                  background: '#fff', borderRadius: 14, border: `1px solid ${C.g200}`,
                  boxShadow: '0 20px 60px rgba(0,0,0,0.18)', overflow: 'hidden',
                  minWidth: 180, padding: '6px',
                }}
              >
                {MENU_ITEMS.map(({ label, icon: Icon, route, color }) => (
                  <button
                    key={label}
                    role="menuitem"
                    onClick={() => { setMenuOpen(false); navigate(route); }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12, width: '100%',
                      padding: '10px 12px', textAlign: 'left',
                      background: 'transparent', border: 'none', cursor: 'pointer',
                      transition: 'background 0.15s', borderRadius: 10,
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = C.g100; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: `${color}15` }}
                    >
                      <Icon size={15} style={{ color }} />
                    </div>
                    <span className="text-sm font-bold" style={{ color: C.forest }}>{label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Amount + info icon */}
      <div className="flex items-center gap-1.5">
        <p className="text-2xl font-extrabold" style={{ color: C.forest }}>
          {showBalance ? `GHS ₵${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(ghsBalance || 0)}` : 'GHS ******'}
        </p>
        <Info size={13} style={{ color: C.g400 }} />
      </div>
    </div>
  );
}
