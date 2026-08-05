import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { 
  Search, Filter, ChevronDown, ChevronUp,
  ArrowRight, Users, Info,
  ThumbsUp, ThumbsDown, Repeat2,
  X, BadgeCheck
} from 'lucide-react';
import { toast } from 'react-toastify';
import CountryFlag from '../components/CountryFlag';
import ActiveTradeCard from '../components/ActiveTradeCard';
import { BadgeChip } from '../lib/badge';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const PRAQEN = {
  primary: '#2D5F4F',
  secondary: '#FFD700',
  darkBg: '#1a3a2a',
  lightBg: '#f0f8f5',
  gray: {
    50: '#f9fafb',
    100: '#f3f4f6',
    200: '#e5e7eb',
    300: '#d1d5db',
    400: '#9ca3af',
    500: '#6b7280',
    600: '#4b5563',
    700: '#374151',
    800: '#1f2937',
    900: '#111827',
  }
};

// Card Types
const CARD_TYPES = [
  { id: 'ecode', name: 'E-Code / Digital', icon: '💻', description: 'Digital code sent via email/SMS', color: '#10b981', bgColor: '#d1fae5' },
  { id: 'physical', name: 'Physical Card', icon: '💳', description: 'Physical gift card will be shipped', color: '#f59e0b', bgColor: '#fed7aa' },
];

// Buyer Offer Card Component
function BuyerOfferCard({ offer, onSelect, user }) {
  const navigate = useNavigate();
  const buyer = offer.users || {};
  const margin = parseFloat(offer.margin || 0);
  const minAmount = offer.min_amount || offer.minAmount || 10;
  const maxAmount = offer.max_amount || offer.maxAmount || 500;
  const paymentMethods = offer.payment_methods || ['bank_transfer'];
  const pmLabel = Array.isArray(paymentMethods) ? paymentMethods.join(', ') : (paymentMethods || 'Payment');

  const pos = parseInt(buyer.positive_feedback || 0);
  const neg = parseInt(buyer.negative_feedback || 0);
  const trades = parseInt(buyer.total_trades || buyer.trade_count || 0);
  const isOnline = buyer.last_login ? ((new Date() - new Date(buyer.last_login)) / 1000 < 120) : false;

  return (
    <div className="rounded-2xl overflow-hidden transition-all w-full h-full flex flex-col justify-between hover:-translate-y-0.5 bg-white border border-gray-200 shadow-[0_1px_2px_rgba(27,67,50,0.04),0_10px_28px_-14px_rgba(27,67,50,0.18)] hover:shadow-[0_2px_4px_rgba(27,67,50,0.06),0_20px_44px_-16px_rgba(27,67,50,0.28)]">
      <div className="px-3.5 pt-3 pb-2">
        <div className="flex items-start justify-between gap-2">
          {/* Left section: Avatar + Username & Like/Dislike/Trades */}
          <div className="flex items-start gap-2.5 min-w-0 flex-1">
            <div className="relative flex-shrink-0">
              <button onClick={() => navigate(`/profile/${buyer.id}`)}>
                <div className="w-10 h-10 rounded-xl bg-[#1B4332] text-white flex items-center justify-center font-black text-sm">
                  {buyer.username?.charAt(0).toUpperCase() || 'B'}
                </div>
              </button>
              {isOnline && (
                <span className="absolute -bottom-0.5 -right-0.5">
                  <span className="absolute inline-flex w-3 h-3 rounded-full animate-ping bg-[#22C55E] opacity-60"/>
                  <span className="relative inline-flex rounded-full w-3 h-3 border-2 border-white bg-[#22C55E]"/>
                </span>
              )}
            </div>

            <div className="flex flex-col gap-0.5 items-start min-w-0 flex-1">
              {/* Row 1: CountryFlag + Name + Verified Badge */}
              <div className="flex items-center gap-1.5 min-w-0">
                <CountryFlag
                  countryCode={buyer?.country_code || buyer?.country || buyer?.location || null}
                  className="w-4 h-3 rounded-sm flex-shrink-0"/>
                <button onClick={() => navigate(`/profile/${buyer.id}`)}
                  className="font-black text-sm text-[#1E293B] hover:underline leading-tight truncate">
                  {buyer.username || 'Buyer'}
                </button>
                {buyer.is_verified && <BadgeCheck size={14} style={{color:'#3B82F6', flexShrink:0}}/>}
              </div>

              {/* Row 2: Like / Dislike buttons & trades count */}
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <span className="inline-flex items-center gap-0.5 font-bold text-[#16A34A] text-[11px]">
                  <ThumbsUp size={10} strokeWidth={2.5}/>{pos}
                </span>
                <span className="inline-flex items-center gap-0.5 font-bold text-[#EF4444] text-[11px]">
                  <ThumbsDown size={10} strokeWidth={2.5}/>{neg}
                </span>
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#64748B]">
                  <Repeat2 size={10} strokeWidth={2.5} className="text-[#94A3B8]"/>
                  {trades} trades
                </span>
              </div>
            </div>
          </div>

          {/* Right section: Stacked BEGINNER badge & Active status pill */}
          <div className="flex flex-col gap-1 items-end flex-shrink-0 pt-0.5">
            <div>
              <BadgeChip user={buyer} size="xs" />
            </div>
            <div>
              {isOnline ? (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold flex-shrink-0 bg-[#F0FDF4] text-[#22C55E]">
                  <span className="relative flex w-1.5 h-1.5 flex-shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 bg-[#22C55E]"/>
                    <span className="relative inline-flex rounded-full w-1.5 h-1.5 bg-[#22C55E]"/>
                  </span>
                  Active
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium flex-shrink-0 bg-[#F1F5F9] text-[#94A3B8]">
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-[#CBD5E1]"/>
                  Offline
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div style={{height:1, backgroundColor:'#F1F5F9'}}/>

      <div className="px-3.5 py-2.5 grid grid-cols-2 gap-2.5">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide mb-0.5 text-[#64748B]">Range / Limits</p>
          <p className="text-base font-bold leading-tight text-[#1E293B] truncate">
            ${minAmount} – ${maxAmount}
          </p>
        </div>
        <div className="border-l pl-3 border-[#F1F5F9]">
          <p className="text-[11px] font-bold uppercase tracking-wide mb-0.5 text-[#64748B]">Payment Method</p>
          <p className="text-base font-bold leading-tight text-[#16A34A] capitalize truncate">
            {pmLabel}
          </p>
        </div>
      </div>

      <div className="px-3.5 pb-2.5 border-t border-[#F1F5F9]">
        {/* Grey info board */}
        <div className="group relative mt-1">
          <div className="rounded-xl px-2.5 py-2 flex items-center justify-between transition-colors bg-[#F1F5F9] border border-[#E2E8F0]">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-[#475569]">
                Rate:&nbsp;<span className="text-[#1E293B] font-bold">1 BTC ≈ ${minAmount}–${maxAmount}</span>
              </p>
              <p className="text-xs font-semibold mt-1 text-[#475569]">
                Limits:&nbsp;<span className="text-[#334155] font-bold">${minAmount} – ${maxAmount}</span>
              </p>
            </div>
            <div className="flex items-center flex-shrink-0 ml-4 mr-2">
              <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-black ${
                margin < 0 ? 'bg-[rgba(16,185,129,0.14)] text-[#16A34A] border border-[rgba(16,185,129,0.25)]' :
                margin > 0 ? 'bg-[rgba(239,68,68,0.12)] text-[#EF4444] border border-[rgba(239,68,68,0.25)]' :
                'bg-[#E2E8F0] text-[#64748B] border border-[#CBD5E1]'
              }`}>
                {margin === 0 ? 'Market' : `${margin > 0 ? '+' : ''}${margin}%`}
              </span>
            </div>
          </div>

          {/* Tooltip */}
          <div className="absolute bottom-full left-0 right-0 mb-3 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity z-20">
            <div className="rounded-xl shadow-2xl border p-3 text-xs bg-[#1E293B] border-[#334155] text-[#E2E8F0] relative">
              <p className="font-black text-[10px] uppercase tracking-wider mb-2 text-[#64748B]">Buyer Details</p>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[#94A3B8]">Limits</span>
                <span className="font-bold text-[#F0FAF5]">${minAmount} – ${maxAmount}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#94A3B8]">Margin</span>
                <span className={`font-bold ${margin < 0 ? 'text-[#4ADE80]' : margin > 0 ? 'text-[#F87171]' : 'text-[#94A3B8]'}`}>
                  {margin === 0 ? 'Market rate' : `${margin > 0 ? '+' : ''}${margin}%`}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="px-3.5 pb-3 flex items-center gap-2">
        <button onClick={() => navigate(`/profile/${buyer.id}`)}
          className="w-9 h-9 rounded-xl border border-[#E2E8F0] flex items-center justify-center flex-shrink-0 transition hover:bg-gray-50">
          <Info size={14} className="text-[#94A3B8]"/>
        </button>
        <button onClick={() => onSelect(offer)}
          className="flex-1 h-9 rounded-xl text-white font-black text-sm flex items-center justify-center gap-1.5 bg-[#1B4332] hover:opacity-90 active:scale-[0.98] transition">
          Sell to {buyer.username || 'Buyer'} <ArrowRight size={14}/>
        </button>
      </div>
    </div>
  );
}

export default function SellGiftCardMarketplace({ user }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const cardTypeParam = searchParams.get('type') || 'ecode';
  
  const [selectedCardType, setSelectedCardType] = useState(
    CARD_TYPES.find(t => t.id === cardTypeParam) || CARD_TYPES[0]
  );
  const [buyOffers, setBuyOffers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('best_price');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedOffer, setSelectedOffer] = useState(null);
  const [showTradeModal, setShowTradeModal] = useState(false);
  const [tradeAmount, setTradeAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [filters, setFilters] = useState({
    minAmount: '',
    maxAmount: '',
    minRating: '',
  });
  const [activeTrades, setActiveTrades] = useState([]);
  const [showAllTrades, setShowAllTrades] = useState(false);

  useEffect(() => { loadBuyOffers(); }, []);
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;
    const toUTC = s => new Date(/[Z+]/.test(s) ? s : s + 'Z');
    const fetchTrades = async () => {
      try {
        const res = await axios.get(`${API_URL}/trades/active`, { headers: { Authorization: `Bearer ${token}` } });
        if (res.data.success) {
          const now = Date.now();
          setActiveTrades((res.data.trades || []).filter(t =>
            ['PAYMENT_SENT','DISPUTED'].includes(t.status) ||
            !t.expires_at || toUTC(t.expires_at).getTime() > now
          ));
        }
      } catch {}
    };
    fetchTrades();
    const interval = setInterval(fetchTrades, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleTradeExpire = (tradeId) => {
    setActiveTrades(prev => prev.filter(t => String(t.id) !== String(tradeId)));
  };

  const loadBuyOffers = async () => {
    try {
      const response = await axios.get(`${API_URL}/listings`);
      // Show BUY_GIFT_CARD offers (people with BTC wanting to buy gift cards)
      const buyListings = (response.data.listings || []).filter(
        l => l.listing_type === 'BUY_GIFT_CARD'
      );
      setBuyOffers(buyListings);
    } catch (error) {
      console.error('Failed to load offers:', error);
      toast.error('Failed to load marketplace');
    } finally {
      setLoading(false);
    }
  };

  const getFilteredOffers = () => {
    let filtered = [...buyOffers];
    
    if (searchTerm) {
      filtered = filtered.filter(l => 
        (l.gift_card_brand?.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (l.users?.username?.toLowerCase().includes(searchTerm.toLowerCase()))
      );
    }
    
    if (filters.minAmount) {
      filtered = filtered.filter(l => (l.min_amount || l.minAmount || 0) >= parseFloat(filters.minAmount));
    }
    if (filters.maxAmount) {
      filtered = filtered.filter(l => (l.max_amount || l.maxAmount || 9999) <= parseFloat(filters.maxAmount));
    }
    if (filters.minRating) {
      filtered = filtered.filter(l => (l.users?.average_rating || 0) >= parseFloat(filters.minRating));
    }
    
    switch (sortBy) {
      case 'best_price':
        filtered.sort((a, b) => (a.bitcoin_price || 0) - (b.bitcoin_price || 0));
        break;
      case 'rating':
        filtered.sort((a, b) => (b.users?.average_rating || 0) - (a.users?.average_rating || 0));
        break;
      case 'trades':
        filtered.sort((a, b) => (b.users?.total_trades || 0) - (a.users?.total_trades || 0));
        break;
      default:
        filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }
    
    return filtered;
  };

  const handleCardTypeSelect = (type) => {
    setSelectedCardType(type);
    navigate(`/sell-gift-card?type=${type.id}`);
  };

  const handleSelectOffer = (offer) => {
    if (!user) {
      toast.info('Please login to start trading');
      navigate('/login');
      return;
    }
    setSelectedOffer(offer);
    setTradeAmount(offer.min_amount || offer.minAmount || 10);
    setShowTradeModal(true);
  };

  const handleStartTrade = async () => {
    if (!tradeAmount || parseFloat(tradeAmount) <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }

    setSubmitting(true);
    try {
      const token = localStorage.getItem('token') || localStorage.getItem('authToken') || sessionStorage.getItem('token');
      const response = await axios.post(`${API_URL}/trades`, {
        listingId:  selectedOffer.id,
        amountBtc:  (parseFloat(tradeAmount) / 45000).toFixed(8),
        trade_type: 'SELL',
      }, { headers: { Authorization: `Bearer ${token}` } });

      if (response.data.success) {
        toast.success('Trade initiated! Redirecting to chat...');
        navigate(`/trade/${response.data.trade.id}`);
      }
    } catch (error) {
      console.error('Error creating trade:', error);
      toast.error(error.response?.data?.error || 'Failed to create trade');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredOffers = getFilteredOffers();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: PRAQEN.lightBg }}>
        <div className="text-center">
          <div className="w-10 h-10 border-4 rounded-full animate-spin mx-auto mb-3" style={{ borderColor: PRAQEN.primary, borderTopColor: PRAQEN.secondary }}></div>
          <p className="text-sm" style={{ color: PRAQEN.primary }}>Loading buyers...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: PRAQEN.lightBg }}>
      <div className="max-w-7xl mx-auto px-3 py-4 md:px-4 md:py-6">
        
        {/* Hero Section */}
        <div className="rounded-xl overflow-hidden mb-6 shadow-md" style={{ background: `linear-gradient(135deg, ${PRAQEN.primary}, ${PRAQEN.darkBg})` }}>
          <div className="p-5">
            <h1 className="text-2xl md:text-3xl font-black text-white mb-2">Sell Gift Card</h1>
            <p className="text-white/70 text-sm">Choose a buyer, agree on terms, and get paid in Bitcoin</p>
          </div>
        </div>

        {/* Card Type Selector */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          {CARD_TYPES.map((type) => (
            <button
              key={type.id}
              onClick={() => handleCardTypeSelect(type)}
              className={`p-4 rounded-xl border-2 transition-all text-left ${selectedCardType.id === type.id ? 'border-2 shadow-md' : 'border-gray-200'}`}
              style={{ 
                borderColor: selectedCardType.id === type.id ? type.color : PRAQEN.gray[200],
                backgroundColor: selectedCardType.id === type.id ? type.bgColor : 'white'
              }}
            >
              <div className="flex items-center gap-3">
                <span className="text-3xl">{type.icon}</span>
                <div>
                  <p className="font-bold" style={{ color: type.color }}>{type.name}</p>
                  <p className="text-xs text-gray-500">{type.description}</p>
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* Search & Filter Bar */}
        <div className="bg-white rounded-lg shadow-sm p-3 mb-4">
          <div className="flex flex-col md:flex-row gap-2">
            <div className="flex-1 relative">
              <Search size={14} className="absolute left-2.5 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search buyers by name or gift card type..."
                className="w-full pl-8 pr-3 py-2 text-sm border rounded-lg focus:outline-none"
                style={{ borderColor: PRAQEN.gray[300] }}
              />
            </div>
            
            <div className="flex gap-2">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="px-3 py-2 text-xs border rounded-lg focus:outline-none"
                style={{ borderColor: PRAQEN.gray[300] }}
              >
                <option value="best_price">Best Rate</option>
                <option value="rating">Highest Rated</option>
                <option value="trades">Most Trades</option>
                <option value="newest">Newest First</option>
              </select>
              
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="px-3 py-2 text-xs border rounded-lg flex items-center gap-1 hover:bg-gray-50"
                style={{ borderColor: PRAQEN.gray[300] }}
              >
                <Filter size={12} />
                Filter
                {showFilters ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
              </button>
            </div>
          </div>
          
          {showFilters && (
            <div className="mt-3 pt-2 border-t border-gray-200 grid grid-cols-1 sm:grid-cols-3 gap-2">
              <input
                type="number"
                value={filters.minAmount}
                onChange={(e) => setFilters({ ...filters, minAmount: e.target.value })}
                placeholder="Min $"
                className="w-full px-3 py-2.5 text-sm border rounded-lg"
                style={{ borderColor: PRAQEN.gray[300] }}
              />
              <input
                type="number"
                value={filters.maxAmount}
                onChange={(e) => setFilters({ ...filters, maxAmount: e.target.value })}
                placeholder="Max $"
                className="w-full px-3 py-2.5 text-sm border rounded-lg"
                style={{ borderColor: PRAQEN.gray[300] }}
              />
              <select
                value={filters.minRating}
                onChange={(e) => setFilters({ ...filters, minRating: e.target.value })}
                className="w-full px-3 py-2.5 text-sm border rounded-lg"
                style={{ borderColor: PRAQEN.gray[300] }}
              >
                <option value="">Rating</option>
                <option value="4.5">4.5+ ★</option>
                <option value="4.0">4.0+ ★</option>
              </select>
            </div>
          )}
        </div>

        {/* ── Inline active trade cards ── */}
        {activeTrades.length > 0 && (
          <div className="mb-3">
            {activeTrades.slice(0, showAllTrades ? activeTrades.length : 3).map(trade => (
              <ActiveTradeCard key={trade.id} trade={trade} pageColor="#0D9488" onExpire={handleTradeExpire} />
            ))}
            {activeTrades.length > 3 && (
              <button onClick={() => setShowAllTrades(p => !p)}
                className="w-full text-xs font-semibold py-1.5 rounded-xl border mb-1"
                style={{color:'#92400E', borderColor:'#F59E0B', backgroundColor:'#FFFBEB'}}>
                {showAllTrades ? 'Show less ▲' : `Show all (${activeTrades.length}) ▼`}
              </button>
            )}
          </div>
        )}

        {/* Results Count */}
        <div className="flex justify-between items-center mb-4">
          <p className="text-sm text-gray-500">
            <span className="font-bold" style={{ color: PRAQEN.primary }}>{filteredOffers.length}</span> buyers looking for {selectedCardType.name}
          </p>
        </div>

        {/* Buyer Offers List */}
        {filteredOffers.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <Users size={48} className="mx-auto mb-3 opacity-30" style={{ color: PRAQEN.primary }} />
            <h3 className="text-lg font-bold mb-1" style={{ color: PRAQEN.primary }}>No buyers found</h3>
            <p className="text-sm text-gray-500 mb-4">No one is currently looking to buy {selectedCardType.name}</p>
            <button
              onClick={() => navigate('/create-offer')}
              className="px-5 py-2 rounded-lg text-white font-semibold"
              style={{ backgroundColor: PRAQEN.primary }}
            >
              Create a Sell Offer
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredOffers.map((offer) => (
              <BuyerOfferCard 
                key={offer.id} 
                offer={offer} 
                onSelect={handleSelectOffer}
                user={user}
              />
            ))}
          </div>
        )}

        {/* How It Works Section */}
        <div className="mt-8 bg-white rounded-lg shadow p-5">
          <h3 className="font-bold text-lg mb-4" style={{ color: PRAQEN.primary }}>How to Sell Your Gift Card</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-center">
              <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold mx-auto mb-2" style={{ backgroundColor: PRAQEN.primary }}>
                1
              </div>
              <p className="font-semibold">Choose a Buyer</p>
              <p className="text-xs text-gray-500">Browse offers from verified buyers</p>
            </div>
            <div className="text-center">
              <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold mx-auto mb-2" style={{ backgroundColor: PRAQEN.primary }}>
                2
              </div>
              <p className="font-semibold">Agree on Terms</p>
              <p className="text-xs text-gray-500">Chat and confirm the trade details</p>
            </div>
            <div className="text-center">
              <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold mx-auto mb-2" style={{ backgroundColor: PRAQEN.primary }}>
                3
              </div>
              <p className="font-semibold">Get Paid</p>
              <p className="text-xs text-gray-500">Receive Bitcoin in escrow, then release code</p>
            </div>
          </div>
        </div>
      </div>

      {/* Trade Modal */}
      {showTradeModal && selectedOffer && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-black" style={{ color: PRAQEN.primary }}>Sell to {selectedOffer.users?.username}</h2>
              <button onClick={() => setShowTradeModal(false)} className="text-gray-500 hover:text-gray-700">
                <X size={24} />
              </button>
            </div>
            
            <div className="space-y-4">
              <div className="p-3 rounded-lg" style={{ backgroundColor: PRAQEN.lightBg }}>
                <div className="flex justify-between mb-2">
                  <span className="text-sm text-gray-600">Buyer's Rate:</span>
                  <span className="font-semibold">1 BTC ≈ ${(selectedOffer.bitcoin_price * 45000).toFixed(2)} USD</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Buyer since:</span>
                  <span className="font-semibold">{selectedOffer.users?.created_at ? new Date(selectedOffer.users.created_at).toLocaleDateString() : 'Recently'}</span>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-semibold mb-2">Amount (USD)</label>
                <input
                  type="number"
                  value={tradeAmount}
                  onChange={(e) => setTradeAmount(e.target.value)}
                  className="w-full px-4 py-2 border-2 rounded-lg focus:outline-none"
                  style={{ borderColor: PRAQEN.gray[300] }}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Min: ${selectedOffer.min_amount || selectedOffer.minAmount || 10} - 
                  Max: ${selectedOffer.max_amount || selectedOffer.maxAmount || 5000}
                </p>
              </div>
              
              <div className="p-3 rounded-lg" style={{ backgroundColor: PRAQEN.lightBg }}>
                <p className="text-sm font-semibold mb-2">You Will Receive:</p>
                <p className="text-2xl font-bold text-orange-600">
                  {(parseFloat(tradeAmount) / 45000).toFixed(8)} BTC
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  ≈ ${tradeAmount} USD value
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Platform fee: 0.5% ({(parseFloat(tradeAmount) / 45000 * 0.005).toFixed(8)} BTC)
                </p>
              </div>
              
              <div className="bg-yellow-50 p-3 rounded-lg">
                <p className="text-xs text-yellow-800">
                  ⚠️ Bitcoin will be held in escrow until you provide the gift card code and buyer confirms.
                </p>
              </div>
              
              <button
                onClick={handleStartTrade}
                disabled={submitting}
                className="w-full py-3 rounded-lg text-white font-bold transition hover:opacity-80"
                style={{ backgroundColor: PRAQEN.primary }}
              >
                {submitting ? 'Processing...' : 'Start Trade'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}