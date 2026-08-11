import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  Search, Filter, Star, Clock, Bitcoin, DollarSign,
  TrendingUp, Shield, User, ChevronDown, ChevronUp,
  ArrowRight, Wallet, Gift, Smartphone, Building2,
  Tag, Percent, Zap, Award, Users, Eye,
  CreditCard, CircleDollarSign, ShoppingBag, Plus,
} from 'lucide-react';
import { toast } from 'react-toastify';

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

// Payment method icons
const getPaymentIcon = (method) => {
  const icons = {
    'mtn': <Smartphone size={14} className="inline-block" />,
    'vodafone': <Smartphone size={14} className="inline-block" />,
    'airteltigo': <Smartphone size={14} className="inline-block" />,
    'kuda': <Building2 size={14} className="inline-block" />,
    'gcb': <Building2 size={14} className="inline-block" />,
    'paypal': <CircleDollarSign size={14} className="inline-block" />,
    'opay': <DollarSign size={14} className="inline-block" />,
    'amazon': <Gift size={14} className="inline-block" />,
    'steam': <Gift size={14} className="inline-block" />,
    'google': <Gift size={14} className="inline-block" />,
  };
  return icons[method.toLowerCase()] || <CreditCard size={14} className="inline-block" />;
};

export default function Marketplace({ user }) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('buy'); // 'buy' or 'sell'
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('newest');
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({
    minPrice: '',
    maxPrice: '',
    paymentMethod: '',
  });

  useEffect(() => {
    loadListings();
  }, []);

  const loadListings = async () => {
    try {
      const response = await axios.get(`${API_URL}/listings`);
      setListings(response.data.listings || []);
    } catch (error) {
      console.error('Failed to load listings:', error);
      toast.error('Failed to load marketplace');
    } finally {
      setLoading(false);
    }
  };

  // Filter listings based on tab
  const getFilteredListings = () => {
    let filtered = [...listings];
    
    // For BUY tab: show SELL_GIFT_CARD listings (people selling gift cards)
    // For SELL tab: show BUY_BITCOIN listings (people wanting to buy)
    if (activeTab === 'buy') {
      filtered = filtered.filter(l => l.listing_type === 'SELL_GIFT_CARD' || !l.listing_type);
    } else {
      filtered = filtered.filter(l => l.listing_type === 'BUY_BITCOIN');
    }
    
    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(l => 
        l.gift_card_brand?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        l.users?.username?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    
    // Price filters
    if (filters.minPrice) {
      filtered = filtered.filter(l => l.amount_usd >= parseFloat(filters.minPrice));
    }
    if (filters.maxPrice) {
      filtered = filtered.filter(l => l.amount_usd <= parseFloat(filters.maxPrice));
    }
    
    // Sort
    switch (sortBy) {
      case 'price_low':
        filtered.sort((a, b) => a.amount_usd - b.amount_usd);
        break;
      case 'price_high':
        filtered.sort((a, b) => b.amount_usd - a.amount_usd);
        break;
      case 'rating':
        filtered.sort((a, b) => (b.users?.average_rating || 0) - (a.users?.average_rating || 0));
        break;
      default:
        filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }
    
    return filtered;
  };

  const filteredListings = getFilteredListings();

  const handleStartTrade = (listingId) => {
    if (!user) {
      toast.info('Please login to start trading');
      navigate('/login');
      return;
    }
    navigate(`/listing/${listingId}`);
  };

  const formatBtc = (btc) => {
    return parseFloat(btc || 0).toFixed(8);
  };

  const ListingCard = ({ listing }) => {
    const seller = listing.users || {};
    const rating = seller.average_rating || 0;
    const totalTrades = seller.total_trades || 0;
    const paymentMethods = listing.payment_methods || ['bank'];
    
    return (
      <div className="bg-white rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 overflow-hidden border border-gray-100">
        <div className="p-5">
          {/* Seller Info */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold" style={{ backgroundColor: PRAQEN.primary }}>
                {seller.username?.charAt(0).toUpperCase() || 'U'}
              </div>
              <div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <p className="font-bold text-gray-900">{seller.display_name || seller.username || 'Anonymous'}</p>
                  {(seller.country_name || seller.country) && (
                    <span className="text-xs text-gray-500 font-semibold">
                      {(() => {
                        const cc = (seller.country_code || seller.country || '').toUpperCase();
                        const flag = cc.length === 2
                          ? cc.replace(/./g, c => String.fromCodePoint(0x1F1E0 + c.charCodeAt(0) - 65))
                          : '';
                        return `${seller.country_name || seller.country} ${flag}`;
                      })()}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <div className="flex items-center gap-1">
                    <Star size={14} className="fill-yellow-400 text-yellow-400" />
                    <span className="font-semibold">{rating.toFixed(1)}</span>
                  </div>
                  <span className="text-gray-400">•</span>
                  <span className="font-bold text-gray-900">{totalTrades} trades</span>
                </div>
              </div>
            </div>
            {totalTrades > 100 && (
              <div className="flex items-center gap-1 text-xs px-2 py-1 rounded-full" style={{ backgroundColor: PRAQEN.lightBg, color: PRAQEN.primary }}>
                <Award size={12} />
                Top Trader
              </div>
            )}
          </div>
          
          {/* Gift Card Info */}
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-2">
              <Gift size={18} style={{ color: PRAQEN.primary }} />
              <span className="font-semibold text-gray-900">{listing.gift_card_brand || 'Gift Card'}</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-gray-900">${listing.amount_usd?.toFixed(2)}</span>
              <span className="text-gray-500">USD</span>
            </div>
            <div className="flex items-center gap-1 mt-1">
              <Bitcoin size={14} className="text-orange-500" />
              <span className="text-sm text-gray-600">{formatBtc(listing.bitcoin_price)} BTC</span>
            </div>
          </div>
          
          {/* Payment Methods */}
          <div className="flex flex-wrap gap-1 mb-4">
            {paymentMethods.slice(0, 3).map((method, idx) => (
              <span key={idx} className="text-xs px-2 py-1 rounded-full" style={{ backgroundColor: PRAQEN.lightBg, color: PRAQEN.primary }}>
                {getPaymentIcon(method)} {method}
              </span>
            ))}
            {paymentMethods.length > 3 && (
              <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-500">
                +{paymentMethods.length - 3}
              </span>
            )}
          </div>
          
          {/* Delivery Time & Action */}
          <div className="flex items-center justify-between pt-3 border-t border-gray-100">
            <div className="flex items-center gap-1 text-sm text-gray-500">
              <Clock size={14} />
              <span>{listing.processing_time_minutes || 15} min delivery</span>
            </div>
            <button
              onClick={() => handleStartTrade(listing.id)}
              className="px-5 py-2 rounded-lg text-white font-semibold transition hover:opacity-80 flex items-center gap-2"
              style={{ backgroundColor: PRAQEN.primary }}
            >
              {activeTab === 'buy' ? 'Buy Now' : 'Sell to Them'}
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: PRAQEN.lightBg }}>
        <div className="text-center">
          <div className="w-12 h-12 border-4 rounded-full animate-spin mx-auto mb-4" style={{ borderColor: PRAQEN.primary, borderTopColor: PRAQEN.secondary }}></div>
          <p style={{ color: PRAQEN.primary }}>Loading marketplace...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-8 px-4" style={{ backgroundColor: PRAQEN.lightBg }}>
      <div className="max-w-7xl mx-auto">
        
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-black" style={{ color: PRAQEN.primary }}>P2P Marketplace</h1>
          <p style={{ color: PRAQEN.primary }} className="opacity-70 mt-1">
            Buy and sell gift cards with Bitcoin securely
          </p>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-2 mb-6 bg-white rounded-xl p-1 shadow-sm max-w-md mx-auto">
          <button
            onClick={() => setActiveTab('buy')}
            className={`flex-1 py-3 rounded-lg font-bold transition-all ${activeTab === 'buy' ? 'text-white shadow-md' : 'text-gray-600 hover:bg-gray-50'}`}
            style={{ backgroundColor: activeTab === 'buy' ? PRAQEN.primary : 'transparent' }}
          >
            <div className="flex items-center justify-center gap-2">
              <ShoppingBag size={18} />
              Buy Gift Cards
            </div>
            <p className="text-xs mt-1 opacity-75">From trusted sellers</p>
          </button>
          <button
            onClick={() => setActiveTab('sell')}
            className={`flex-1 py-3 rounded-lg font-bold transition-all ${activeTab === 'sell' ? 'text-white shadow-md' : 'text-gray-600 hover:bg-gray-50'}`}
            style={{ backgroundColor: activeTab === 'sell' ? PRAQEN.primary : 'transparent' }}
          >
            <div className="flex items-center justify-center gap-2">
              <TrendingUp size={18} />
              Sell Gift Cards
            </div>
            <p className="text-xs mt-1 opacity-75">To buyers worldwide</p>
          </button>
        </div>

        {/* Search & Filters Bar */}
        <div className="bg-white rounded-xl shadow-sm p-4 mb-6">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="flex-1 relative">
              <Search size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={activeTab === 'buy' ? "Search gift cards or sellers..." : "Search buyers..."}
                className="w-full pl-10 pr-4 py-2 border-2 rounded-lg focus:outline-none"
                style={{ borderColor: PRAQEN.gray[300] }}
              />
            </div>
            
            <div className="flex gap-2">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="px-4 py-2 border-2 rounded-lg focus:outline-none"
                style={{ borderColor: PRAQEN.gray[300] }}
              >
                <option value="newest">Newest First</option>
                <option value="price_low">Price: Low to High</option>
                <option value="price_high">Price: High to Low</option>
                <option value="rating">Highest Rated</option>
              </select>
              
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="px-4 py-2 border-2 rounded-lg flex items-center gap-2 hover:bg-gray-50"
                style={{ borderColor: PRAQEN.gray[300] }}
              >
                <Filter size={18} />
                Filters
                {showFilters ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
            </div>
          </div>
          
          {/* Expandable Filters */}
          {showFilters && (
            <div className="mt-4 pt-4 border-t border-gray-200 grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-semibold mb-2">Min Price (USD)</label>
                <input
                  type="number"
                  value={filters.minPrice}
                  onChange={(e) => setFilters({ ...filters, minPrice: e.target.value })}
                  placeholder="Min"
                  className="w-full px-3 py-2 border rounded-lg"
                  style={{ borderColor: PRAQEN.gray[300] }}
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">Max Price (USD)</label>
                <input
                  type="number"
                  value={filters.maxPrice}
                  onChange={(e) => setFilters({ ...filters, maxPrice: e.target.value })}
                  placeholder="Max"
                  className="w-full px-3 py-2 border rounded-lg"
                  style={{ borderColor: PRAQEN.gray[300] }}
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">Payment Method</label>
                <select
                  value={filters.paymentMethod}
                  onChange={(e) => setFilters({ ...filters, paymentMethod: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                  style={{ borderColor: PRAQEN.gray[300] }}
                >
                  <option value="">All Methods</option>
                  <option value="mtn">MTN Mobile Money</option>
                  <option value="vodafone">Vodafone Cash</option>
                  <option value="bank">Bank Transfer</option>
                  <option value="paypal">PayPal</option>
                </select>
              </div>
            </div>
          )}
        </div>

        {/* Results Count */}
        <div className="flex justify-between items-center mb-4">
          <p className="text-sm text-gray-500">
            Found <span className="font-bold" style={{ color: PRAQEN.primary }}>{filteredListings.length}</span> {activeTab === 'buy' ? 'sellers' : 'buyers'}
          </p>
          {user && activeTab === 'sell' && (
            <button
              onClick={() => navigate('/create-offer')}
              className="px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2"
              style={{ backgroundColor: PRAQEN.secondary, color: PRAQEN.darkBg }}
            >
              <Plus size={16} />
              Create Sell Offer
            </button>
          )}
        </div>

        {/* Listings Grid */}
        {filteredListings.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-lg p-12 text-center">
            <div className="mb-4"><Search size={56} className="inline-block" style={{ color: PRAQEN.gray[300] }} /></div>
            <h3 className="text-xl font-bold mb-2" style={{ color: PRAQEN.primary }}>No offers found</h3>
            <p className="text-gray-500 mb-4">
              {activeTab === 'buy' 
                ? "No sellers are currently offering gift cards" 
                : "No buyers are currently looking for gift cards"}
            </p>
            {activeTab === 'sell' && (
              <button
                onClick={() => navigate('/create-offer')}
                className="px-6 py-2 rounded-lg text-white font-semibold"
                style={{ backgroundColor: PRAQEN.primary }}
              >
                Create an Offer
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredListings.map((listing) => (
              <ListingCard key={listing.id} listing={listing} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

