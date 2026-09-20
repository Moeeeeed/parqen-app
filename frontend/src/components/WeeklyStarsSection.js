// components/WeeklyStarsSection.js
// PRAQEN Traders of the Week — public display, reusing the exact same sliding
// "Live Pinned Offer" banner style already used elsewhere (PinnedOfferBanner),
// just fed the 5 admin-selected recognition winners instead of a single
// per-country auto-pick. Shown on BuyBitcoin, SellBitcoin, BuyUSDT, and
// GiftCardMarketplace — same data, same component, no per-page duplication.
import { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { Trophy, Gift, Globe2, MapPin, Rocket } from 'lucide-react';
import PinnedOfferBanner from './PinnedOfferBanner';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const FEATURED = {
  border:      '#F4A422',
  ribbon:      'linear-gradient(90deg,#1B4332 0%,#2D6A4F 18%,#40916C 38%,#F4A422 50%,#40916C 62%,#2D6A4F 82%,#1B4332 100%)',
  labelColor:  '#1B4332',
  btnGradient: 'linear-gradient(135deg,#1B4332 0%,#2D6A4F 55%,#40916C 100%)',
};

const SLOT_META = {
  sell_bitcoin_gh: { icon: Trophy, tag: 'SELL BITCOIN — GHANA' },
  buy_bitcoin_ng:  { icon: Globe2, tag: 'BUY BITCOIN — NIGERIA' },
  gift_card:       { icon: Gift,   tag: 'GIFT CARD TRADER' },
  sell_bitcoin_ke: { icon: MapPin, tag: 'SELL BITCOIN — KENYA' },
  rising_trader:   { icon: Rocket, tag: 'RISING TRADER OF THE WEEK' },
};
const SLOT_ORDER = ['sell_bitcoin_gh', 'buy_bitcoin_ng', 'gift_card', 'sell_bitcoin_ke', 'rising_trader'];

function InitialsAvatar({ username }) {
  const letter = (username || '?').charAt(0).toUpperCase();
  return (
    <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 font-black text-white text-xs"
      style={{ background: FEATURED.btnGradient }}>
      {letter}
    </div>
  );
}

export default function WeeklyStarsSection() {
  const [winners, setWinners] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    axios.get(`${API_URL}/trader-of-week`)
      .then(r => setWinners(r.data?.winners || {}))
      .catch(() => setWinners({}));
  }, []);

  if (!winners) return null;

  const slides = SLOT_ORDER
    .filter(slot => winners[slot] && winners[slot].user_id)
    .map(slot => {
      const w = winners[slot];
      const meta = SLOT_META[slot];
      return {
        id: `weekly_star_${slot}`,
        featured: { ...FEATURED, TagIcon: meta.icon, tag: meta.tag },
        avatar: <InitialsAvatar username={w.username} />,
        badgeChip: null,
        username: w.username,
        verified: false,
        trades: w.total_trades || 0,
        positive: w.total_feedback_count ?? w.positive_feedback ?? 0,
        negative: w.negative_feedback ?? 0,
        rateLabel: `${parseFloat(w.average_rating || 0).toFixed(1)} ★ Rating`,
        volumeLabel: null, // "Volume: ..." doesn't fit a recognition badge — skip it
        actionLabel: 'Trade Now',
        onClick: () => navigate(`/profile/${w.user_id}`),
      };
    });

  if (slides.length === 0) return null; // nothing selected yet this week

  return (
    <div>
      <PinnedOfferBanner slides={slides} dismissKey="praqen_pinned_offers" intervalMs={5 * 60 * 1000} title="🏆 Traders of the Week" />
      <p className="text-center text-[11px] font-semibold -mt-1 pb-1" style={{ color: '#94A3B8' }}>
        Trusted offers selected by the PRAQEN team.
      </p>
    </div>
  );
}
