import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Wallet, Repeat2, Gift, Award, X, ArrowRight, Rocket } from 'lucide-react';

const C = {
  forest: '#1B4332', green: '#2D6A4F', gold: '#F4A422',
  g500: '#64748B', g200: '#E2E8F0',
};

const STEPS = [
  { icon: Wallet,  title: 'Fund your wallet',   desc: 'Load at least $10 in BTC to activate your account.' },
  { icon: Repeat2, title: 'Make your first trade', desc: 'Buy or sell once your wallet is funded.' },
  { icon: Gift,    title: 'Cash out your bonus',   desc: 'Unlock and withdraw your welcome bonus after trading.' },
  { icon: Award,   title: 'Earn your vendor badge', desc: 'Keep trading to level up your badge and trust score.' },
];

// Shown to new / unfunded users on the Buy and Sell Bitcoin pages so the
// activation → trade → bonus → badge path is spelled out instead of implied.
export default function GettingStartedSteps({ userId }) {
  const [dismissed, setDismissed] = useState(false);
  const navigate = useNavigate();
  const dismissKey = `prq_getting_started_dismissed_${userId || 'guest'}`;

  if (dismissed || (typeof window !== 'undefined' && localStorage.getItem(dismissKey))) return null;

  const handleDismiss = () => {
    localStorage.setItem(dismissKey, '1');
    setDismissed(true);
  };

  return (
    <div className="flex-shrink-0 px-3 pt-3">
      <div className="max-w-7xl mx-auto rounded-2xl overflow-hidden shadow-sm border" style={{ borderColor: C.g200 }}>
        <div className="flex items-center justify-between gap-2 px-4 py-2.5"
          style={{ background: `linear-gradient(135deg,${C.forest},${C.green})` }}>
          <span className="text-xs sm:text-sm font-black text-white tracking-wide">
            <Rocket size={14} className="inline-block mr-1" />New here? Here's how to become an active vendor
          </span>
          <button onClick={handleDismiss} className="flex-shrink-0 opacity-70 hover:opacity-100" title="Dismiss">
            <X size={14} color="#fff" />
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-white" style={{ backgroundColor: C.g200 }}>
          {STEPS.map((s, i) => (
            <div key={s.title} className="bg-white p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black text-white flex-shrink-0"
                  style={{ backgroundColor: C.gold, color: C.forest }}>
                  {i + 1}
                </span>
                <s.icon size={13} style={{ color: C.green }} />
              </div>
              <p className="text-xs font-black" style={{ color: '#1E293B' }}>{s.title}</p>
              <p className="text-[11px] mt-0.5 leading-snug" style={{ color: C.g500 }}>{s.desc}</p>
            </div>
          ))}
        </div>

        <div className="px-4 py-3 border-t" style={{ borderColor: C.g200, backgroundColor: '#F8FAFC' }}>
          <p className="text-xs font-black mb-1.5" style={{ color: '#1E293B' }}>Two ways to load your wallet:</p>
          <ul className="space-y-1 mb-2">
            <li className="text-[11px] leading-snug" style={{ color: C.g500 }}>
              <strong style={{ color: '#1E293B' }}>Buy from a vendor</strong> — purchase BTC instantly from any seller on the Buy Bitcoin market.
            </li>
            <li className="text-[11px] leading-snug" style={{ color: C.g500 }}>
              <strong style={{ color: '#1E293B' }}>Send from an external wallet</strong> — copy your PRAQEN wallet address and deposit BTC from any wallet or exchange you already use.
            </li>
          </ul>
          <button
            onClick={() => navigate('/wallet')}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-black text-white"
            style={{ backgroundColor: C.green }}>
            Go to My Wallet <ArrowRight size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}
