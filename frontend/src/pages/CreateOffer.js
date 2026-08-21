import React, { useState, useEffect, useRef } from 'react';
import { useRates } from '../contexts/RatesContext';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { API_URL } from '../App';
import {
  Bitcoin, TrendingUp, Check, Info, AlertTriangle, Clock,
  DollarSign, Shield, ArrowRight, RefreshCw, Plus, Minus,
  Eye, ChevronRight, ChevronLeft, ShoppingCart, Tag,
  BarChart2, Settings2, FileText, ArrowUpRight, ArrowDownRight,
  Gift, Search, ChevronDown, X,
  Smartphone, Banknote, Zap, Star, Wallet, CheckCircle,
  Briefcase, Lightbulb, Megaphone,
  CreditCard, Globe, Gamepad2, Landmark, Heart, Circle,
  Waves, Rocket, Building2, Link, Phone, Monitor,
  Package, Apple, Music, Clapperboard, Home, ShoppingBag,
  Target, Shirt, Diamond, Coffee, Folder, Palette, Ruler,
  Hexagon, Moon, Play, Mountain, Fish, Utensils, Gem,
  Sparkles, Leaf, Box, MessageCircle, Pill, ChefHat, Footprints,
  ArrowLeftRight
} from 'lucide-react';
import { toast } from 'react-toastify';

const C = {
  forest: '#1B4332', green: '#2D6A4F', mint: '#40916C', sage: '#52B788',
  gold: '#F4A422', amber: '#F59E0B', mist: '#F0FAF5', white: '#FFFFFF',
  g50: '#F8FAFC', g100: '#F1F5F9', g200: '#E2E8F0', g300: '#CBD5E1',
  g400: '#94A3B8', g500: '#64748B', g600: '#475569', g700: '#334155', g800: '#1E293B',
  success: '#10B981', danger: '#EF4444', paid: '#3B82F6', purple: '#8B5CF6',
  orange: '#F97316',
};

const fmt = (n, d = 2) =>
  new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: d }).format(n || 0);

const COUNTRIES = [
  { code: 'GH', name: 'Ghana', currency: 'GHS', symbol: '₵', flag: '🇬🇭' },
  { code: 'NG', name: 'Nigeria', currency: 'NGN', symbol: '₦', flag: '🇳🇬' },
  { code: 'KE', name: 'Kenya', currency: 'KES', symbol: 'KSh', flag: '🇰🇪' },
  { code: 'ZA', name: 'South Africa', currency: 'ZAR', symbol: 'R', flag: '🇿🇦' },
  { code: 'UG', name: 'Uganda', currency: 'UGX', symbol: 'USh', flag: '🇺🇬' },
  { code: 'TZ', name: 'Tanzania', currency: 'TZS', symbol: 'TSh', flag: '🇹🇿' },
  { code: 'US', name: 'United States', currency: 'USD', symbol: '$', flag: '🇺🇸' },
  { code: 'GB', name: 'United Kingdom', currency: 'GBP', symbol: '£', flag: '🇬🇧' },
  { code: 'EU', name: 'Europe', currency: 'EUR', symbol: '€', flag: '🇪🇺' },
  { code: 'CM', name: 'Cameroon', currency: 'XAF', symbol: 'CFA', flag: '🇨🇲' },
  { code: 'SN', name: 'Senegal', currency: 'XOF', symbol: 'CFA', flag: '🇸🇳' },
  { code: 'CI', name: "Côte d'Ivoire", currency: 'XOF', symbol: 'CFA', flag: '🇨🇮' },
  { code: 'RW', name: 'Rwanda', currency: 'RWF', symbol: 'RF', flag: '🇷🇼' },
  { code: 'ET', name: 'Ethiopia', currency: 'ETB', symbol: 'Br', flag: '🇪🇹' },
  { code: 'AU', name: 'Australia', currency: 'AUD', symbol: 'A$', flag: '🇦🇺' },
  { code: 'CA', name: 'Canada', currency: 'CAD', symbol: 'C$', flag: '🇨🇦' },
  { code: 'SG', name: 'Singapore', currency: 'SGD', symbol: 'S$', flag: '🇸🇬' },
  { code: 'IN', name: 'India', currency: 'INR', symbol: '₹', flag: '🇮🇳' },
  // Europe
  { code: 'DE', name: 'Germany', currency: 'EUR', symbol: '€', flag: '🇩🇪' },
  { code: 'ES', name: 'Spain', currency: 'EUR', symbol: '€', flag: '🇪🇸' },
  { code: 'RU', name: 'Russia', currency: 'RUB', symbol: '₽', flag: '🇷🇺' },
  // Americas
  { code: 'VE', name: 'Venezuela', currency: 'VES', symbol: 'Bs.', flag: '🇻🇪' },
  // Asia
  { code: 'CN', name: 'China', currency: 'CNY', symbol: '¥', flag: '🇨🇳' },
  { code: 'JP', name: 'Japan', currency: 'JPY', symbol: '¥', flag: '🇯🇵' },
  { code: 'KR', name: 'South Korea', currency: 'KRW', symbol: '₩', flag: '🇰🇷' },
  { code: 'PH', name: 'Philippines', currency: 'PHP', symbol: '₱', flag: '🇵🇭' },
  { code: 'TH', name: 'Thailand', currency: 'THB', symbol: '฿', flag: '🇹🇭' },
  { code: 'MY', name: 'Malaysia', currency: 'MYR', symbol: 'RM', flag: '🇲🇾' },
  { code: 'ID', name: 'Indonesia', currency: 'IDR', symbol: 'Rp', flag: '🇮🇩' },
  { code: 'VN', name: 'Vietnam', currency: 'VND', symbol: '₫', flag: '🇻🇳' },
  { code: 'PK', name: 'Pakistan', currency: 'PKR', symbol: '₨', flag: '🇵🇰' },
  { code: 'BD', name: 'Bangladesh', currency: 'BDT', symbol: '৳', flag: '🇧🇩' },
];

// Deduplicated currency list derived from COUNTRIES
const CURRENCIES_LIST = [...new Map(
  COUNTRIES.map(c => [c.currency, { code: c.currency, symbol: c.symbol }])
).values()];

const FOREIGN_CURRENCY_CODES = [
  'USD', 'GBP', 'CAD', 'EUR', 'AUD', 'SGD', 'CHF', 'SEK', 'NOK', 'DKK',
  'NZD', 'JPY', 'HKD', 'PLN', 'BRL', 'MXN'
];

// USD_RATES is now provided by RatesContext — do NOT define a static object here

// ── Payment methods — comprehensive list with categories ──────────────────────
const PAYMENT_METHODS = [
  // Mobile Money
  { id: 'mtn_momo', name: 'MTN Mobile Money', icon: Smartphone, cat: 'Mobile Money', countries: ['GH', 'NG', 'UG', 'CM', 'RW', 'CI'] },
  { id: 'vodafone', name: 'Vodafone Cash', icon: Smartphone, cat: 'Mobile Money', countries: ['GH'] },
  { id: 'airteltigo', name: 'AirtelTigo Money', icon: Smartphone, cat: 'Mobile Money', countries: ['GH'] },
  { id: 'mpesa', name: 'M-Pesa', icon: Smartphone, cat: 'Mobile Money', countries: ['KE', 'TZ'] },
  { id: 'airtel_money', name: 'Airtel Money', icon: Smartphone, cat: 'Mobile Money', countries: ['UG', 'TZ', 'KE'] },
  { id: 'orange_money', name: 'Orange Money', icon: Smartphone, cat: 'Mobile Money', countries: ['CM', 'SN', 'CI'] },
  { id: 'wave', name: 'Wave', icon: Waves, cat: 'Mobile Money', countries: ['SN', 'CI'] },
  { id: 'chipper', name: 'Chipper Cash', icon: ArrowLeftRight, cat: 'Mobile Money', countries: [] },
  { id: 'ecocash', name: 'EcoCash', icon: Smartphone, cat: 'Mobile Money', countries: ['ZW'] },
  { id: 'tigo_pesa', name: 'Tigo Pesa / Mixx', icon: Smartphone, cat: 'Mobile Money', countries: ['TZ'] },
  { id: 'moov_money', name: 'Moov Money', icon: Smartphone, cat: 'Mobile Money', countries: ['BJ', 'CI', 'TG'] },
  { id: 'africell', name: 'Africell Money', icon: Smartphone, cat: 'Mobile Money', countries: ['SL', 'GM'] },
  { id: 'paga', name: 'Paga', icon: Circle, cat: 'Mobile Money', countries: ['NG'] },
  // Digital Wallets & E-wallets
  { id: 'paypal', name: 'PayPal', icon: DollarSign, cat: 'Digital Wallet', countries: ['US', 'GB', 'EU', 'AU', 'CA'] },
  { id: 'cash_app', name: 'Cash App', icon: Banknote, cat: 'Digital Wallet', countries: ['US', 'GB'] },
  { id: 'apple_pay', name: 'Apple Pay', icon: Apple, cat: 'Digital Wallet', countries: ['US', 'GB', 'EU', 'AU', 'CA'] },
  { id: 'alipay', name: 'Alipay', icon: Globe, cat: 'Digital Wallet', countries: [] },
  { id: 'wechat_pay', name: 'WeChat Pay', icon: MessageCircle, cat: 'Digital Wallet', countries: [] },
  { id: 'venmo', name: 'Venmo', icon: Circle, cat: 'Digital Wallet', countries: ['US'] },
  { id: 'zelle', name: 'Zelle', icon: Heart, cat: 'Digital Wallet', countries: ['US'] },
  { id: 'revolut', name: 'Revolut', icon: Diamond, cat: 'Digital Wallet', countries: ['GB', 'EU'] },
  { id: 'skrill', name: 'Skrill', icon: CreditCard, cat: 'Digital Wallet', countries: [] },
  { id: 'neteller', name: 'Neteller', icon: CreditCard, cat: 'Digital Wallet', countries: [] },
  { id: 'payeer', name: 'Payeer', icon: CreditCard, cat: 'Digital Wallet', countries: [] },
  { id: 'perfect_money', name: 'Perfect Money', icon: CreditCard, cat: 'Digital Wallet', countries: [] },
  // Remittance
  { id: 'wise', name: 'Wise', icon: Globe, cat: 'Remittance', countries: ['US', 'GB', 'EU', 'AU', 'CA'] },
  { id: 'worldremit', name: 'WorldRemit', icon: Globe, cat: 'Remittance', countries: [] },
  { id: 'remitly', name: 'Remitly', icon: Rocket, cat: 'Remittance', countries: [] },
  { id: 'western_union', name: 'Western Union', icon: Building2, cat: 'Remittance', countries: [] },
  { id: 'moneygram', name: 'MoneyGram', icon: Building2, cat: 'Remittance', countries: [] },
  // FinTech / Neobank
  { id: 'opay', name: 'OPay', icon: Circle, cat: 'FinTech', countries: ['NG'] },
  { id: 'palmpay', name: 'PalmPay', icon: Leaf, cat: 'FinTech', countries: ['NG'] },
  { id: 'kuda', name: 'Kuda Bank', icon: Landmark, cat: 'FinTech', countries: ['NG'] },
  { id: 'moniepoint', name: 'Moniepoint', icon: Landmark, cat: 'FinTech', countries: ['NG'] },
  { id: 'gtbank', name: 'GTBank', icon: Landmark, cat: 'FinTech', countries: ['NG'] },
  { id: 'access', name: 'Access Bank', icon: Landmark, cat: 'FinTech', countries: ['NG'] },
  { id: 'paystack', name: 'Paystack', icon: CreditCard, cat: 'FinTech', countries: ['NG', 'GH', 'ZA'] },
  { id: 'flutterwave', name: 'Flutterwave (Barter)', icon: Sparkles, cat: 'FinTech', countries: ['NG', 'GH', 'KE', 'ZA'] },
  // Bank
  { id: 'bank_transfer', name: 'Bank Transfer', icon: Landmark, cat: 'Bank', countries: [] },
  { id: 'wire_transfer', name: 'Wire Transfer', icon: Link, cat: 'Bank', countries: [] },
  { id: 'mobile_banking', name: 'Mobile Banking App', icon: Smartphone, cat: 'Bank', countries: [] },
  { id: 'interbank', name: 'Interbank (GhIPSS/NIBSS/EFT)', icon: Landmark, cat: 'Bank', countries: ['GH', 'NG'] },
  { id: 'ussd', name: 'USSD Bank Transfer', icon: Phone, cat: 'Bank', countries: [] },
  { id: 'instant_eft', name: 'Instant EFT (South Africa)', icon: Landmark, cat: 'Bank', countries: ['ZA'] },
  { id: 'cash_deposit', name: 'Cash Deposit (Bank Counter)', icon: Landmark, cat: 'Bank', countries: [] },
  // Cash
  { id: 'cash_person', name: 'Cash in Person (Face-to-Face)', icon: Banknote, cat: 'Cash', countries: [] },
  { id: 'cash_out', name: 'Cash Out', icon: Banknote, cat: 'Cash', countries: [] },
  // Crypto
  { id: 'usdt', name: 'USDT (Tether – TRC20)', icon: Banknote, cat: 'Crypto', countries: [] },
  { id: 'binance_pay', name: 'Binance Pay', icon: Circle, cat: 'Crypto', countries: [] },
  { id: 'btc_pay', name: 'Bitcoin (BTC)', icon: Bitcoin, cat: 'Crypto', countries: [] },
  { id: 'eth_pay', name: 'Ethereum (ETH)', icon: Hexagon, cat: 'Crypto', countries: [] },
  { id: 'luno', name: 'Luno Wallet', icon: Moon, cat: 'Crypto', countries: [] },
  { id: 'yellow_card', name: 'Yellow Card Wallet', icon: Star, cat: 'Crypto', countries: [] },
  // Note: gift-card-as-payment (MoneyPak, Vanilla, PLS, etc.) is deliberately NOT in this list
  // as individual brands — trading against a gift card goes through the dedicated gc_buy /
  // gc_sell flow (brand catalog, denominations, regions, deposit/balance checks), not a plain
  // payment_method string on a SELL/BUY listing. See the pinned "Gift Card" entry at the top
  // of PayDropdown below, which hands off into that flow.
];

const CAT_COLORS = {
  'Mobile Money': C.success,
  'Digital Wallet': '#3B82F6',
  'Remittance': '#0D9488',
  'FinTech': C.amber,
  'Bank': '#7C3AED',
  'Cash': C.gold,
  'Crypto': '#F97316',
};

// ── Gift card brands ──────────────────────────────────────────────────────────
const GC_BRANDS = [
  { name: 'Amazon', icon: Package, color: '#FF9900' },
  { name: 'Apple / iTunes', icon: Apple, color: '#555555' },
  { name: 'iTunes Denmark', icon: Apple, color: '#C5001A' },
  { name: 'Google Play', icon: Play, color: '#34A853' },
  { name: 'Steam', icon: Gamepad2, color: '#1B2838' },
  { name: 'eBay', icon: ShoppingBag, color: '#E53238' },
  { name: 'Walmart', icon: ShoppingCart, color: '#0071CE' },
  { name: 'Target', icon: Target, color: '#CC0000' },
  { name: 'Visa Gift Card', icon: CreditCard, color: '#1A1F71' },
  { name: 'Mastercard GC', icon: CreditCard, color: '#EB001B' },
  { name: 'Amex Gift Card', icon: CreditCard, color: '#007BC1' },
  { name: 'Netflix', icon: Clapperboard, color: '#E50914' },
  { name: 'Spotify', icon: Music, color: '#1DB954' },
  { name: 'Xbox', icon: Gamepad2, color: '#107C10' },
  { name: 'PlayStation', icon: Gamepad2, color: '#003087' },
  { name: 'Nintendo', icon: Gamepad2, color: '#E4000F' },
  { name: 'Razer Gold', icon: Circle, color: '#44D62C' },
  { name: 'Nike Gift Card', icon: ShoppingBag, color: '#111111' },
  { name: 'MoneyPak', icon: Package, color: '#00A651' },
  { name: 'PostePay', icon: Circle, color: '#FFCC00' },
  { name: 'PLS Gift Card', icon: Gift, color: '#FF6B6B' },
  { name: 'Vanilla Card', icon: Gift, color: '#8B4513' },
  { name: 'Roblox', icon: Box, color: '#E62E2E' },
  { name: 'Fortnite V-Bucks', icon: Gamepad2, color: '#1D76DB' },
  { name: 'Marshalls', icon: ShoppingBag, color: '#00263E' },
  { name: 'HomeGoods', icon: Home, color: '#00263E' },
  { name: 'Costco', icon: ShoppingCart, color: '#E31837' },
  { name: "Sam's Club", icon: ShoppingCart, color: '#0067A0' },
  { name: "BJ's Wholesale Club", icon: ShoppingCart, color: '#CC0000' },
  { name: 'REI', icon: Mountain, color: '#004F2D' },
  { name: "Dick's Sporting Goods", icon: Circle, color: '#000000' },
  { name: 'Academy Sports + Outdoors', icon: Circle, color: '#003DA5' },
  { name: 'Bass Pro Shops', icon: Fish, color: '#8B4513' },
  { name: "Cabela's", icon: Fish, color: '#004225' },
  { name: 'Guitar Center', icon: Music, color: '#000000' },
  { name: "Musician's Friend", icon: Music, color: '#000000' },
  { name: 'American Girl', icon: Gift, color: '#E4022D' },
  { name: 'LEGO', icon: Box, color: '#D01012' },
  { name: 'Build-A-Bear Workshop', icon: Heart, color: '#8B4B9C' },
  { name: 'Pottery Barn', icon: Home, color: '#2C2A29' },
  { name: 'West Elm', icon: Home, color: '#000000' },
  { name: 'Crate & Barrel', icon: Utensils, color: '#000000' },
  { name: 'Williams-Sonoma', icon: ChefHat, color: '#000000' },
  { name: 'Sur La Table', icon: ChefHat, color: '#000000' },
  { name: 'Zappos', icon: ShoppingBag, color: '#A0DE07' },
  { name: '6pm', icon: ShoppingBag, color: '#000000' },
  { name: 'Nordstrom', icon: Shirt, color: '#000000' },
  { name: "Bloomingdale's", icon: Shirt, color: '#000000' },
  { name: 'Neiman Marcus', icon: Shirt, color: '#000000' },
  { name: 'Saks Fifth Avenue', icon: Shirt, color: '#000000' },
  { name: 'Barneys New York', icon: Shirt, color: '#000000' },
  { name: 'Tiffany & Co.', icon: Diamond, color: '#0ABAB5' },
  { name: 'Coach', icon: ShoppingBag, color: '#7A1F2B' },
  { name: 'Michael Kors', icon: ShoppingBag, color: '#000000' },
  { name: 'Kate Spade', icon: ShoppingBag, color: '#00A99D' },
  { name: 'Tory Burch', icon: ShoppingBag, color: '#000000' },
  { name: 'Vera Bradley', icon: ShoppingBag, color: '#762A83' },
  { name: 'L.L.Bean', icon: Mountain, color: '#00543D' },
  { name: 'Cuisinart', icon: ChefHat, color: '#C8102E' },
  { name: 'KitchenAid', icon: ChefHat, color: '#000000' },
  { name: 'Le Creuset', icon: ChefHat, color: '#F26B21' },
  { name: 'Anthropologie', icon: Shirt, color: '#000000' },
  { name: 'Free People', icon: Shirt, color: '#000000' },
  { name: 'Urban Outfitters', icon: Shirt, color: '#000000' },
  { name: 'Madewell', icon: Shirt, color: '#002F6C' },
  { name: "J.Crew", icon: Shirt, color: '#002F6C' },
  { name: 'Banana Republic', icon: Shirt, color: '#000000' },
  { name: 'Gap', icon: Shirt, color: '#002868' },
  { name: 'Old Navy', icon: Shirt, color: '#003057' },
  { name: 'Athleta', icon: Footprints, color: '#000000' },
  { name: 'Lululemon', icon: Circle, color: '#000000' },
  { name: 'SoulCycle', icon: Circle, color: '#FFD100' },
  { name: 'Peloton', icon: Circle, color: '#000000' },
  { name: 'Hulu', icon: Clapperboard, color: '#1CE783' },
  { name: 'Amazon Prime Video', icon: Clapperboard, color: '#00A8E1' },
  { name: 'Apple Music', icon: Music, color: '#FA243C' },
  { name: 'Tidal', icon: Music, color: '#000000' },
  { name: 'Dropbox', icon: Package, color: '#0061FF' },
  { name: 'Google Drive', icon: Folder, color: '#4285F4' },
  { name: 'Microsoft Office', icon: Monitor, color: '#D83B01' },
  { name: 'Adobe Creative Cloud', icon: Palette, color: '#FF0000' },
  { name: 'Autodesk', icon: Ruler, color: '#0696D7' },
  { name: 'SketchUp', icon: Ruler, color: '#005F9E' },
  { name: 'Minecraft', icon: Box, color: '#5C8A3A' },
  { name: 'The Sims', icon: Gamepad2, color: '#00A651' },
  { name: 'World of Warcraft', icon: Gamepad2, color: '#000000' },
  { name: 'Final Fantasy XIV', icon: Gamepad2, color: '#1A1A2E' },
  { name: 'Under Armour', icon: Circle, color: '#000000' },
  { name: 'American Eagle', icon: Shirt, color: '#002868' },
  { name: 'Abercrombie & Fitch', icon: Shirt, color: '#000000' },
  { name: 'Hollister', icon: Shirt, color: '#000080' },
  { name: "Victoria's Secret", icon: Heart, color: '#000000' },
  { name: 'Bath & Body Works', icon: Package, color: '#000000' },
  { name: 'Bed Bath & Beyond', icon: Home, color: '#004B87' },
  { name: 'TJ Maxx', icon: ShoppingBag, color: '#E4032E' },
  { name: 'Starbucks', icon: Coffee, color: '#00704A' },
  { name: 'Wayfair', icon: Home, color: '#7B2CBF' },
  { name: 'CVS Pharmacy', icon: Pill, color: '#CC0000' },
  { name: "Dillard's", icon: Shirt, color: '#000000' },
  { name: 'Other', icon: Gift, color: '#94A3B8' },
];

const GC_FACE_VALUES = [10, 20, 25, 50, 100, 200, 500, 1000];
const TIME_LIMITS = [15, 30, 45, 60, 90, 120];

const GC_CURRENCIES = [
  { region: 'iTunes USA', currency: 'USD', symbol: '$', flag: '🇺🇸' },
  { region: 'iTunes UK', currency: 'GBP', symbol: '£', flag: '🇬🇧' },
  { region: 'iTunes Germany', currency: 'EUR', symbol: '€', flag: '🇩🇪' },
  { region: 'iTunes France', currency: 'EUR', symbol: '€', flag: '🇫🇷' },
  { region: 'iTunes Spain', currency: 'EUR', symbol: '€', flag: '🇪🇸' },
  { region: 'iTunes Italy', currency: 'EUR', symbol: '€', flag: '🇮🇹' },
  { region: 'iTunes Netherlands', currency: 'EUR', symbol: '€', flag: '🇳🇱' },
  { region: 'iTunes Canada', currency: 'CAD', symbol: 'C$', flag: '🇨🇦' },
  { region: 'iTunes Australia', currency: 'AUD', symbol: 'A$', flag: '🇦🇺' },
  { region: 'iTunes Japan', currency: 'JPY', symbol: '¥', flag: '🇯🇵' },
  { region: 'iTunes Poland', currency: 'PLN', symbol: 'zł', flag: '🇵🇱' },
  { region: 'iTunes Sweden', currency: 'SEK', symbol: 'kr', flag: '🇸🇪' },
  { region: 'iTunes Norway', currency: 'NOK', symbol: 'kr', flag: '🇳🇴' },
  { region: 'iTunes Denmark', currency: 'DKK', symbol: 'kr', flag: '🇩🇰' },
  { region: 'iTunes Switzerland', currency: 'CHF', symbol: 'Fr', flag: '🇨🇭' },
  { region: 'iTunes Mexico', currency: 'MXN', symbol: '$', flag: '🇲🇽' },
  { region: 'iTunes Brazil', currency: 'BRL', symbol: 'R$', flag: '🇧🇷' },
  { region: 'Amazon USA', currency: 'USD', symbol: '$', flag: '🇺🇸' },
  { region: 'Amazon UK', currency: 'GBP', symbol: '£', flag: '🇬🇧' },
  { region: 'Amazon Germany', currency: 'EUR', symbol: '€', flag: '🇩🇪' },
  { region: 'Amazon Canada', currency: 'CAD', symbol: 'C$', flag: '🇨🇦' },
  { region: 'Amazon Australia', currency: 'AUD', symbol: 'A$', flag: '🇦🇺' },
  { region: 'Amazon India', currency: 'INR', symbol: '₹', flag: '🇮🇳' },
  { region: 'Amazon Japan', currency: 'JPY', symbol: '¥', flag: '🇯🇵' },
  { region: 'Google Play USA', currency: 'USD', symbol: '$', flag: '🇺🇸' },
  { region: 'Google Play UK', currency: 'GBP', symbol: '£', flag: '🇬🇧' },
  { region: 'Google Play Germany', currency: 'EUR', symbol: '€', flag: '🇩🇪' },
  { region: 'Google Play Canada', currency: 'CAD', symbol: 'C$', flag: '🇨🇦' },
  { region: 'Google Play Australia', currency: 'AUD', symbol: 'A$', flag: '🇦🇺' },
  { region: 'Steam USA', currency: 'USD', symbol: '$', flag: '🇺🇸' },
  { region: 'Steam Europe', currency: 'EUR', symbol: '€', flag: '🇪🇺' },
  { region: 'Steam UK', currency: 'GBP', symbol: '£', flag: '🇬🇧' },
  { region: 'Razer Gold Global', currency: 'USD', symbol: '$', flag: <Globe size={14} className="inline-block" /> },
  { region: 'Vanilla Visa USA', currency: 'USD', symbol: '$', flag: '🇺🇸' },
  { region: 'Vanilla Visa Europe', currency: 'EUR', symbol: '€', flag: '🇪🇺' },
];

// ── Step configs ──────────────────────────────────────────────────────────────
const BTC_STEPS = [
  { id: 1, label: 'Type', icon: Tag },
  { id: 2, label: 'Payment', icon: DollarSign },
  { id: 3, label: 'Pricing', icon: BarChart2 },
  { id: 4, label: 'Limits', icon: Settings2 },
  { id: 5, label: 'Review', icon: FileText },
];

// ── Offer type options (Step 1) ───────────────────────────────────────────────
const OFFER_TYPES = [
  { id: 'sell',   title: (a) => `Sell ${a}`,   desc: (a) => `Buyers pay you, you release ${a} from your wallet.`, icon: ArrowUpRight },
  { id: 'buy',    title: (a) => `Buy ${a}`,    desc: (a) => `You pay sellers to receive ${a} into your wallet.`, icon: ArrowDownRight },
  { id: 'gc_buy', title: (a) => `Buy ${a} with Gift Card`, desc: (a) => `Sellers send you a gift card, you send them ${a}.`, icon: Gift },
  { id: 'gc_sell', title: (a) => `Sell Gift Card for ${a}`, desc: (a) => `You send a gift card, buyer sends you ${a}. Requires a $200 security deposit.`, icon: Gift },
];

// ── Reusable premium searchable select ────────────────────────────────────
const SearchableSelect = ({
  items,
  value,
  onChange,
  searchValue,
  onSearchChange,
  placeholder = 'Select…',
  searchPlaceholder = 'Search…',
  getKey = (item) => item.name || item.id,
  getLabel = (item) => item.name,
  renderSelected = null,
  renderItem = null,
  className = '',
  disabled = false,
  error = false,
}) => {
  const [open, setOpen] = useState(false);
  const [focusedIdx, setFocusedIdx] = useState(0);
  const ref = useRef(null);

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const selected = items.find(i => getKey(i) === value);
  const filtered = searchValue
    ? items.filter(i => getLabel(i).toLowerCase().includes(searchValue.toLowerCase()))
    : items;


  useEffect(() => { setFocusedIdx(0); }, [searchValue]);

  const handleKeyDown = (e) => {
    if (!open) { if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(true); } return; }
    if (e.key === 'Escape') { e.preventDefault(); setOpen(false); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setFocusedIdx(i => Math.min(i + 1, filtered.length - 1)); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); setFocusedIdx(i => Math.max(i - 1, 0)); return; }
    if (e.key === 'Enter' && filtered[focusedIdx]) { e.preventDefault(); onChange(getKey(filtered[focusedIdx])); setOpen(false); return; }
  };

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => { if (!disabled) setOpen(!open); }}
        disabled={disabled}
        className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border-2 text-left transition-all duration-200 ${open ? 'ring-2 ring-offset-0' : ''
          } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:border-opacity-70'}`}
        style={{
          borderColor: error ? C.danger : open ? C.green : C.g200,
          backgroundColor: selected ? `${C.green}04` : C.white,
          borderRadius: '12px',
          minHeight: 56,
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        onKeyDown={handleKeyDown}
      >
        {renderSelected && selected ? (
          renderSelected(selected)
        ) : selected ? (
          <span className="text-sm font-semibold flex-1" style={{ color: C.g800 }}>
            {getLabel(selected)}
          </span>
        ) : (
          <span className="text-sm flex-1" style={{ color: C.g400 }}>{placeholder}</span>
        )}
        <ChevronDown
          size={18}
          className="flex-shrink-0 transition-transform duration-200"
          style={{ color: C.g400, transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
        />
      </button>

      {open && (
        <div
          className="absolute left-0 right-0 z-40 mt-1.5 bg-white rounded-2xl shadow-xl border flex flex-col overflow-hidden"
          style={{
            borderColor: C.g200,
            boxShadow: '0 12px 40px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)',
            maxHeight: 320,
            animation: 'fadeDrop 0.18s ease both',
          }}
          role="listbox"
        >
          <div className="p-2 border-b" style={{ borderColor: C.g100 }}>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: C.g400 }} />
              <input
                type="text"
                value={searchValue}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full pl-9 pr-3 py-2.5 rounded-xl border text-sm focus:outline-none bg-transparent"
                style={{ borderColor: C.g200, color: C.g800 }}
                autoFocus
                role="searchbox"
                aria-label="Search"
                onKeyDown={(e) => { e.stopPropagation(); }}
              />
            </div>
          </div>
          <div className="overflow-y-auto flex-1 min-h-0 thin-scroll">
            {filtered.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-xs" style={{ color: C.g400 }}>No results found</p>
              </div>
            ) : (
              filtered.map((item, index) => {
                const key = getKey(item);
                const active = value === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => { onChange(key); setOpen(false); }}
                    className="w-full flex items-center gap-3 px-3 py-3 text-left transition-colors duration-100"
                    style={{
                      backgroundColor: active ? `${C.green}08` : focusedIdx === index ? `${C.green}04` : 'transparent',
                    }}
                    role="option"
                    aria-selected={active}
                  >
                    {renderItem ? renderItem(item, active) : (
                      <>
                        <span className="text-sm font-semibold flex-1" style={{ color: active ? C.green : C.g800 }}>
                          {getLabel(item)}
                        </span>
                        {active && (
                          <Check size={14} style={{ color: C.green, flexShrink: 0 }} />
                        )}
                      </>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};


const GC_STEPS = [
  { id: 1, label: 'Type', icon: Tag },
  { id: 2, label: 'Card', icon: Gift },
  { id: 3, label: 'Payment', icon: DollarSign },
  { id: 4, label: 'Rate', icon: BarChart2 },
  { id: 5, label: 'Review', icon: FileText },
];

// ── Seller security deposit modal (gated before creating SELL_GIFT_CARD offers) ──
const DEPOSIT_AMOUNT = 200;
function DepositSecurityModal({ walletUsdt, onClose, onLock, loading, error, pending }) {
  const shortfall = Math.max(0, DEPOSIT_AMOUNT - walletUsdt);
  const canAfford = walletUsdt >= DEPOSIT_AMOUNT;

  if (pending) {
    return (
      <div className="fixed inset-0 z-[1100] flex items-end md:items-center justify-center p-0 md:p-4"
        style={{ backgroundColor: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(6px)' }}>
        <div className="bg-white w-full md:max-w-md rounded-t-3xl md:rounded-3xl overflow-hidden shadow-2xl">
          <div style={{ background: `linear-gradient(135deg, ${C.forest} 0%, ${C.green} 100%)`, padding: '20px 20px 18px' }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl flex items-center justify-center"
                  style={{ background: `linear-gradient(135deg, ${C.gold} 0%, ${C.amber} 100%)`, boxShadow: `0 4px 14px ${C.gold}66` }}>
                  <Shield size={18} color="#fff" strokeWidth={2.2} />
                </div>
                <div>
                  <h2 className="font-black text-base text-white">Deposit Under Review</h2>
                  <p className="text-xs" style={{ color: 'rgba(255,255,255,0.6)' }}>Awaiting admin approval</p>
                </div>
              </div>
              <button onClick={onClose} className="w-8 h-8 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}>
                <X size={16} color="#fff" />
              </button>
            </div>
          </div>
          <div className="p-5" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <p className="text-sm leading-relaxed" style={{ color: C.g700 }}>
              Your <b>${DEPOSIT_AMOUNT} USDT</b> security deposit is locked and waiting on our team to review it. This is usually quick — we'll notify you the moment you're cleared to sell gift cards.
            </p>
            <div className="rounded-2xl p-3.5" style={{ backgroundColor: C.mist, border: `1px solid ${C.sage}40` }}>
              <p className="text-xs leading-relaxed" style={{ color: C.g700 }}>
                No action needed on your end right now — you can check the status anytime from your <b>Wallet</b>.
              </p>
            </div>
            <button onClick={() => { window.location.href = '/wallet'; }}
              style={{ width: '100%', padding: '13px', borderRadius: 14, border: 'none', backgroundColor: C.green, color: '#fff', fontWeight: 800, fontSize: 14, cursor: 'pointer' }}>
              View in Wallet
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[1100] flex items-end md:items-center justify-center p-0 md:p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(6px)' }}>
      <div className="bg-white w-full md:max-w-md rounded-t-3xl md:rounded-3xl overflow-hidden shadow-2xl">
        <div style={{ background: `linear-gradient(135deg, ${C.forest} 0%, ${C.green} 100%)`, padding: '20px 20px 18px' }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl flex items-center justify-center"
                style={{ background: `linear-gradient(135deg, ${C.gold} 0%, ${C.amber} 100%)`, boxShadow: `0 4px 14px ${C.gold}66` }}>
                <Shield size={18} color="#fff" strokeWidth={2.2} />
              </div>
              <div>
                <h2 className="font-black text-base text-white">Security Deposit Required</h2>
                <p className="text-xs" style={{ color: 'rgba(255,255,255,0.6)' }}>Builds buyer trust in your listings</p>
              </div>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}>
              <X size={16} color="#fff" />
            </button>
          </div>
        </div>

        <div className="p-5" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p className="text-sm leading-relaxed" style={{ color: C.g700 }}>
            Lock a one-time <b>${DEPOSIT_AMOUNT} USDT</b> deposit from your PRAQEN wallet before you start selling gift cards. It's how buyers know you're a trustworthy seller.
          </p>

          <div className="rounded-2xl p-3.5" style={{ backgroundColor: C.mist, border: `1px solid ${C.sage}40` }}>
            <ul className="text-xs leading-relaxed" style={{ color: C.g700, paddingLeft: 16, margin: 0, listStyle: 'disc' }}>
              <li>One deposit covers <b>unlimited</b> gift-card listings and trades — no extra fees.</li>
              <li>Get it back to your wallet after <b>7 days</b>, once you have no open trades (admin-reviewed).</li>
              <li>If a dispute proves you scammed a buyer, we may use part or all of it to refund them.</li>
              <li>Withdrawn or used for a refund? Just relock $200 anytime to keep selling.</li>
            </ul>
          </div>

          <div className="flex items-center justify-between rounded-2xl px-4 py-3" style={{ backgroundColor: C.g50, border: `1px solid ${C.g200}` }}>
            <span className="text-xs font-bold" style={{ color: C.g600 }}>Your USDT balance</span>
            <span className="text-sm font-black" style={{ color: canAfford ? C.success : C.danger }}>
              ₮{fmt(walletUsdt)}
            </span>
          </div>

          {!canAfford && (
            <div className="p-3.5 rounded-2xl flex items-start gap-2.5" style={{ backgroundColor: `${C.danger}12`, border: `1px solid ${C.danger}30` }}>
              <AlertTriangle size={14} style={{ color: C.danger, flexShrink: 0, marginTop: 1 }} />
              <p className="text-xs leading-relaxed" style={{ color: C.g700 }}>
                You're <b>₮{fmt(shortfall)}</b> short. Top up your wallet to lock the deposit.
              </p>
            </div>
          )}

          {error && (
            <div className="p-3 rounded-xl" style={{ backgroundColor: `${C.danger}12`, border: `1px solid ${C.danger}30` }}>
              <p className="text-xs" style={{ color: C.danger }}>{error}</p>
            </div>
          )}

          <button
            onClick={canAfford ? onLock : () => { window.location.href = '/wallet'; }}
            disabled={loading}
            style={{
              width: '100%', padding: '13px', borderRadius: 14, border: 'none',
              backgroundColor: loading ? C.g300 : (canAfford ? C.green : C.gold),
              color: '#fff', fontWeight: 800, fontSize: 14, cursor: loading ? 'default' : 'pointer',
            }}>
            {loading ? 'Locking Deposit…' : canAfford ? `Lock $${DEPOSIT_AMOUNT} Security Deposit` : 'Top Up Wallet'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CreateOffer({ user }) {
  const navigate = useNavigate();
  const { rates: USD_RATES, btcUsd: contextBtcUsd } = useRates();
  const payRef = useRef(null);

  // Banned accounts can't trade — bounce them out immediately with a clear
  // system message instead of letting them fill out the whole form first.
  // Mirrors the send/swap guard in Wallet.js; server-side enforcement is
  // requireNotBanned on POST /api/offers.
  useEffect(() => {
    if (user?.account_status === 'banned') {
      toast.error('Your account is banned — you cannot create trade offers. Contact support@praqen.com.');
      navigate('/dashboard');
    }
  }, [user, navigate]);

  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [dupOfferWarning, setDupOfferWarning] = useState(null); // { status, id }
  const [asset, setAsset] = useState('BTC');   // 'BTC' | 'USDT'
  const [btcPrice, setBtcPrice] = useState(68000);
  const [usdtPrice, setUsdtPrice] = useState(1);
  const [loadingPrice, setLoadingPrice] = useState(true);
  const [walletBal, setWalletBal] = useState({ btc: 0, usdt: 0, usd: 0 });

  // Step 1 — preselect from ?type= when deep-linked (e.g. the gift card marketplace's
  // "Create" button, which links here with the type matching the tab the user was on).
  const [offerType, setOfferType] = useState(() => {
    const t = new URLSearchParams(window.location.search).get('type');
    return ['sell', 'buy', 'gc_buy', 'gc_sell'].includes(t) ? t : 'sell';
  }); // sell | buy | gc_buy | gc_sell

  // Seller security deposit (gc_sell only)
  const [depositStatus, setDepositStatus] = useState(null);
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [depositLoading, setDepositLoading] = useState(false);
  const [depositError, setDepositError] = useState('');

  // Step 2 – GC
  const [gcBrand, setGcBrand] = useState('Amazon');
  const [gcCardType, setGcCardType] = useState('both');   // 'physical' | 'ecode' | 'both'
  const [gcCardValues, setGcCardValues] = useState([50]);     // array of selected denominations
  const [gcMinRange, setGcMinRange] = useState('10');
  const [gcMaxRange, setGcMaxRange] = useState('500');
  const [gcSearch, setGcSearch] = useState('');
  const [gcCurrencies, setGcCurrencies] = useState([]);       // selected currency regions (max 10)
  const [gcCurrSearch, setGcCurrSearch] = useState('');

  // Step 2/3 – Country + Payment
  const [country, setCountry] = useState('GH');
  const [countrySearch, setCountrySearch] = useState('');
  const [currencyCode, setCurrencyCode] = useState('GHS');
  const [currencySymbol, setCurrencySymbol] = useState('₵');
  const [currencySearch, setCurrencySearch] = useState('');
  const [payMethod, setPayMethod] = useState('');
  const [paySearch, setPaySearch] = useState('');
  const [showPayMenu, setShowPayMenu] = useState(false);

  // Step 3/4 – Pricing
  const [pricingType, setPricingType] = useState('market');
  const [margin, setMargin] = useState(5);
  const [fixedPrice, setFixedPrice] = useState('');

  // Step 4 – Limits
  const [minLimit, setMinLimit] = useState('');
  const [maxLimit, setMaxLimit] = useState('');
  const [timeLimit, setTimeLimit] = useState(30);

  // Step 5 – Text
  const [instructions, setInstructions] = useState('');
  const [terms, setTerms] = useState('');

  const isGC = offerType === 'gc_buy' || offerType === 'gc_sell';
  const steps = isGC ? GC_STEPS : BTC_STEPS;

  // Restrict currency to foreign currencies when offerType is gift card
  useEffect(() => {
    if (isGC && !FOREIGN_CURRENCY_CODES.includes(currencyCode)) {
      setCurrencyCode('USD');
      setCurrencySymbol('$');
    }
  }, [offerType, isGC, currencyCode]);

  // Fetch seller deposit status once the user picks "Sell Gift Card"
  useEffect(() => {
    if (offerType !== 'gc_sell' || depositStatus !== null) return;
    const token = localStorage.getItem('token');
    if (!token) return;
    axios.get(`${API_URL}/seller-deposit/status`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => setDepositStatus(res.data))
      .catch(() => setDepositStatus({ has_deposit: false, can_create_sell_listing: false }));
  }, [offerType, depositStatus]);

  const canCreateSellListing = depositStatus?.can_create_sell_listing === true;

  const lockDeposit = async () => {
    setDepositLoading(true);
    setDepositError('');
    try {
      const token = localStorage.getItem('token');
      await axios.post(`${API_URL}/seller-deposit/lock`, {}, { headers: { Authorization: `Bearer ${token}` } });
      const res = await axios.get(`${API_URL}/seller-deposit/status`, { headers: { Authorization: `Bearer ${token}` } });
      setDepositStatus(res.data);
      // Locking now lands PENDING_APPROVAL, not LOCKED — stay on the modal (it switches
      // to the "under review" view) instead of advancing, since the user still can't
      // create the offer until an admin approves it.
    } catch (err) {
      setDepositError(err.response?.data?.error || 'Failed to lock security deposit. Please try again.');
    } finally {
      setDepositLoading(false);
    }
  };

  // Sync live BTC/USD price from the shared RatesContext
  useEffect(() => {
    if (contextBtcUsd) {
      setBtcPrice(contextBtcUsd);
      setLoadingPrice(false);
    }
  }, [contextBtcUsd]);

  // USDT price is always ~$1 — no waiting needed
  useEffect(() => {
    if (asset === 'USDT') setLoadingPrice(false);
  }, [asset]);

  // Fetch real wallet balances on mount
  useEffect(() => {
    const fetchWalletBalance = async () => {
      try {
        const token = localStorage.getItem('token');
        if (!token) return;
        const btcRes = await axios.get(`${API_URL}/hd-wallet/wallet`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        let usdtBal = 0;
        try {
          const usdtRes = await axios.get(`${API_URL}/wallet/usdt`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          usdtBal = parseFloat(usdtRes.data?.balance_usdt || 0);
        } catch { /* USDT wallet fetch is best-effort — user may not have a TRON address yet */ }
        setWalletBal({
          btc:  parseFloat(btcRes.data?.balance_btc || 0),
          usdt: usdtBal,
          usd:  parseFloat(btcRes.data?.balance_usd || 0),
        });
      } catch (err) {
        console.error('Failed to fetch wallet balance:', err);
        // Keep default zero state on failure — do not crash the form
      }
    };
    fetchWalletBalance();
  }, []);

  // Asset helpers
  const assetLabel = asset;
  const assetSymbol = asset === 'BTC' ? '₿' : '₮';
  const assetDecimals = asset === 'BTC' ? 6 : 2;
  const assetPriceUsd = asset === 'BTC' ? btcPrice : (usdtPrice || 1);

  // Derived values
  const curr = COUNTRIES.find(c => c.code === country);
  const localRate = USD_RATES[currencyCode] || 1;
  const assetLocal = assetPriceUsd * localRate;
  const effectiveRate = pricingType === 'fixed' && fixedPrice
    ? parseFloat(fixedPrice)
    : assetLocal * (1 + margin / 100);
  const sym = currencySymbol || '$';
  const cur = currencyCode || 'USD';

  const isSellSide = offerType === 'sell';
  const walletKey = asset.toLowerCase();
  const walletCapacityLocal = (walletBal[walletKey] || 0) * assetLocal;
  // Backend rejects SELL offers under $10 wallet balance (server.js calcFee gate) —
  // mirrored here so the form blocks early instead of failing at final submit.
  const walletUsdValue = (walletBal[walletKey] || 0) * assetPriceUsd;
  const sellWalletTooLow = isSellSide && walletUsdValue < 10;
  const maxExceedsWallet = isSellSide && !!maxLimit && walletCapacityLocal > 0 && parseFloat(maxLimit) > walletCapacityLocal;
  const minUSDVal = minLimit ? parseFloat(minLimit) / localRate : 0;
  const activeGcCurrency = gcCurrencies.length > 0 ? gcCurrencies[0] : null;
  const gcCurrencySymbol = activeGcCurrency?.symbol || '';
  const gcCurrencyCode = activeGcCurrency?.currency || '';
  const parsedMinRange = parseFloat(gcMinRange) || 0;
  const parsedMaxRange = parseFloat(gcMaxRange) || 0;
  const gcMinVal = parsedMinRange;
  // gc_buy offers pay gift-card sellers straight out of this wallet, same as a
  // regular SELL offer — the backend requires >= $10 AND enough to cover the
  // offer's own minimum card value, or it gets auto-paused a few minutes later
  // by the balance sync sweep. Mirror both checks here so the form blocks early.
  const isGcBuySide = offerType === 'gc_buy';
  const gcWalletTooLow = isGcBuySide && walletUsdValue < 10;
  const gcMinExceedsWallet = isGcBuySide && parsedMinRange > 0 && gcMinVal > walletUsdValue;

  // Grouped payment methods for dropdown
  const matchesPay = (m) => {
    if (!paySearch) return true;
    return m.name.toLowerCase().includes(paySearch.toLowerCase()) ||
      m.cat.toLowerCase().includes(paySearch.toLowerCase());
  };
  const localMethods = PAYMENT_METHODS.filter(m =>
    (m.countries.length === 0 || m.countries.includes(country)) && matchesPay(m)
  );
  const otherMethods = paySearch
    ? PAYMENT_METHODS.filter(m => m.countries.length > 0 && !m.countries.includes(country) && matchesPay(m))
    : [];
  const selectedPay = PAYMENT_METHODS.find(m => m.id === payMethod);

  // ── Step validation ──────────────────────────────────────────────────────
 const canNext = () => {
    if (step === 1) return !!offerType;
    if (isGC) {
      if (step === 2) return parsedMinRange > 0 && parsedMaxRange >= parsedMinRange && !!gcBrand && (isGcBuySide || (!gcWalletTooLow && !gcMinExceedsWallet));
      if (step === 3) return !!country && !!currencyCode && FOREIGN_CURRENCY_CODES.includes(currencyCode);
      if (step === 4) return pricingType === 'fixed' ? !!fixedPrice : true;
      if (step === 5) return true;
    } else {
      if (step === 2) return !!country && !!currencyCode && !!payMethod;
      if (step === 3) return pricingType === 'fixed' ? !!fixedPrice : true;
      if (step === 4) {
        if (sellWalletTooLow) return false;
        if (!minLimit || !maxLimit) return false;
        if (parseFloat(maxLimit) < parseFloat(minLimit)) return false;
        if (minUSDVal < 10) return false;
        return true;
      }
      if (step === 5) return true;
    }
    return true;
};

  const back = () => setStep(s => Math.max(1, s - 1));
  const next = () => {
    if (!canNext()) return;
    if (step === 1 && offerType === 'gc_sell') {
      if (depositStatus === null) return; // still checking deposit status
      if (!canCreateSellListing) { setShowDepositModal(true); return; }
    }
    setStep(s => Math.min(steps.length, s + 1));
  };

  const handleSubmit = async () => {
    if (user?.account_status === 'banned') {
      toast.error('Your account is banned — you cannot create trade offers. Contact support@praqen.com.');
      return;
    }
    if (!canNext() || submitting) return;
    // canNext() only gates step 2 while stepping through — re-check here since Submit
    // is reachable from the final review step, which doesn't re-run that guard.
    if (isGcBuySide && (gcWalletTooLow || gcMinExceedsWallet)) {
      toast.error(gcWalletTooLow
        ? `You need at least $10 worth of ${assetLabel} in your wallet to create this offer.`
        : `Your wallet balance can't cover this offer's $${gcMinVal} minimum card value.`);
      return;
    }
    setSubmitting(true);
    setDupOfferWarning(null);
    try {
      const gcValuesPayload = [{ min: parsedMinRange, max: parsedMaxRange, isRange: true }];
      const payload = {
        type:                offerType,
        country,
        currency:            isGC ? gcCurrencyCode : currencyCode,
        currency_symbol:     isGC ? gcCurrencySymbol : currencySymbol,
        payment_method:      isGC ? 'Gift Card' : payMethod,
        gift_card_brand:     isGC ? gcBrand : null,
        card_type:           isGC ? gcCardType : null,
        card_values:         isGC ? gcValuesPayload : null,
        gift_card_currencies: isGC ? gcCurrencies : null,
        pricing_type:        pricingType,
        asset,
        margin:              pricingType === 'market' ? margin : null,
        bitcoin_price:       pricingType === 'fixed' && fixedPrice ? parseFloat(fixedPrice) : assetLocal,
        min_limit_local:     !isGC && minLimit ? parseFloat(minLimit) : (isGC ? parsedMinRange : null),
        max_limit_local:     !isGC && maxLimit ? parseFloat(maxLimit) : (isGC ? parsedMaxRange : null),
        min_limit_usd:       !isGC && minLimit ? minUSDVal : (isGC ? parsedMinRange : null),
        max_limit_usd:       !isGC && maxLimit ? parseFloat(maxLimit) / localRate : (isGC ? parsedMaxRange : null),
        time_limit:          timeLimit,
        trade_instructions:  instructions,
        listing_terms:       terms,
      };

      await axios.post(`${API_URL}/offers`, payload, { withCredentials: true });

      // Tell the user exactly where their offer will be visible
      const directionLabel = isGC
        ? (offerType === 'gc_sell' ? 'Sell Gift Card' : 'Buy with Gift Card')
        : `${offerType === 'sell' ? 'Sell' : 'Buy'} ${asset}`;
      const pageLabel = isGC
        ? 'Gift Card Marketplace'
        : asset === 'USDT'
          ? (offerType === 'sell' ? 'Buy USDT' : 'Sell USDT')
          : (offerType === 'sell' ? 'Buy Bitcoin' : 'Sell Bitcoin');
      toast.success(`✅ "${directionLabel}" offer published! Redirecting to the ${pageLabel} page where it will appear…`, { autoClose: 3000 });
      // Drop the shared market cache so the destination page fetches fresh data —
      // otherwise it can serve a stale (<5min) snapshot that predates this offer,
      // making the offer the user just created invisible for up to a minute.
      try { localStorage.removeItem('praqen_market_all'); } catch {}
      // A "sell" offer (I have the asset) is found by buyers on the Buy page, and
      // vice versa — route to wherever this offer will actually show up.
      const destination = isGC
        ? '/gift-cards'
        : asset === 'USDT'
          ? (offerType === 'sell' ? '/buy-usdt' : '/sell-usdt')
          : (offerType === 'sell' ? '/buy-bitcoin' : '/sell-bitcoin');
      navigate(destination);
    } catch (err) {
      const status = err?.response?.status;
      const data = err?.response?.data;
      if (status === 409 && data?.id) {
        setDupOfferWarning({ status: data.status || 'ACTIVE', id: data.id });
      } else if (status === 402 && data?.code === 'SECURITY_DEPOSIT_REQUIRED') {
        setDepositStatus({ has_deposit: false, can_create_sell_listing: false });
        setShowDepositModal(true);
      } else {
        toast.error(data?.error || data?.message || 'Failed to publish offer. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  // ── Payment method dropdown (BTC offers) ────────────────────────────────
  const PayDropdown = () => (
    <div
      className="absolute left-0 right-0 z-40 mt-1.5 bg-white rounded-2xl shadow-xl border flex flex-col overflow-hidden"
      style={{
        borderColor: C.g200,
        boxShadow: '0 12px 40px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)',
        maxHeight: 360,
      }}
    >
      <div className="p-2 border-b" style={{ borderColor: C.g100 }}>
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: C.g400 }} />
          <input
            type="text"
            value={paySearch}
            onChange={(e) => setPaySearch(e.target.value)}
            placeholder="Search payment methods…"
            className="w-full pl-9 pr-3 py-2.5 rounded-xl border text-sm focus:outline-none bg-transparent"
            style={{ borderColor: C.g200, color: C.g800 }}
            autoFocus
          />
        </div>
      </div>
      <div className="overflow-y-auto flex-1 thin-scroll">
        {localMethods.length === 0 && otherMethods.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-xs" style={{ color: C.g400 }}>No results found</p>
          </div>
        ) : (
          <>
            {localMethods.map(m => (
              <button
                key={m.id}
                type="button"
                onClick={() => { setPayMethod(m.id); setShowPayMenu(false); setPaySearch(''); }}
                className="w-full flex items-center gap-3 px-3 py-3 text-left hover:bg-gray-50"
              >
                <span className="flex-shrink-0 w-7 flex items-center justify-center"><m.icon size={20} /></span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: C.g800 }}>{m.name}</p>
                  <p className="text-xs" style={{ color: CAT_COLORS[m.cat] || C.g400 }}>{m.cat}</p>
                </div>
                {payMethod === m.id && <Check size={14} style={{ color: C.green, flexShrink: 0 }} />}
              </button>
            ))}
            {otherMethods.length > 0 && (
              <>
                <div className="px-3 py-1.5 text-xs font-bold uppercase tracking-wide" style={{ color: C.g400 }}>
                  Other regions
                </div>
                {otherMethods.map(m => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => { setPayMethod(m.id); setShowPayMenu(false); setPaySearch(''); }}
                    className="w-full flex items-center gap-3 px-3 py-3 text-left hover:bg-gray-50"
                  >
                    <span className="flex-shrink-0 w-7 flex items-center justify-center"><m.icon size={20} /></span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate" style={{ color: C.g800 }}>{m.name}</p>
                      <p className="text-xs" style={{ color: CAT_COLORS[m.cat] || C.g400 }}>{m.cat}</p>
                    </div>
                  </button>
                ))}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );

  // ── Market card preview (Step 5) ─────────────────────────────────────────
  const MarketCardPreview = () => (
    <div className="p-4 rounded-2xl border-2" style={{ borderColor: C.g200, backgroundColor: C.white }}>
      <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
        <span className="text-xs font-bold px-2 py-1 rounded-full"
          style={{ backgroundColor: `${C.green}15`, color: C.green }}>
          {OFFER_TYPES.find(o => o.id === offerType)?.title(assetLabel)}
        </span>
        <span className="text-xs" style={{ color: C.g400 }}>{curr ? `${curr.flag} ${curr.name}` : '—'}</span>
      </div>
      <p className="text-lg font-black" style={{ color: C.forest, wordBreak: 'break-all' }}>
        {sym}{fmt(effectiveRate, 0)} {cur}/{assetLabel}
      </p>
      <p className="text-xs mt-1" style={{ color: C.g500 }}>
        {isGC
          ? `${gcBrand} · ${gcCardType === 'physical' ? 'Physical' : gcCardType === 'ecode' ? 'E-Code' : 'Physical & E-Code'}`
          : (selectedPay?.name || 'No payment method selected')}
      </p>
    </div>
  );

  return (
    <div className="min-h-screen" style={{ backgroundColor: C.g50 }}>
      <div className="max-w-lg mx-auto px-4 pt-6" style={{ width: '100%', boxSizing: 'border-box' }}>

        {/* Header */}
        <div className="mb-5">
          <h1 className="text-2xl font-black" style={{ color: C.forest }}>Create Offer</h1>
          <p className="text-xs mt-1" style={{ color: C.g500 }}>
            Step {step} of {steps.length} — {steps.find(s => s.id === step)?.label}
          </p>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-1.5 mb-6">
          {steps.map((s, i) => (
            <React.Fragment key={s.id}>
              <div className="flex flex-col items-center gap-1" style={{ flex: '0 0 auto' }}>
                <div className="w-8 h-8 rounded-full flex items-center justify-center"
                  style={{
                    backgroundColor: step >= s.id ? C.green : C.g200,
                    color: step >= s.id ? C.white : C.g500,
                  }}>
                  <s.icon size={14} />
                </div>
                <span className="text-xs font-semibold" style={{ color: step >= s.id ? C.green : C.g400 }}>
                  {s.label}
                </span>
              </div>
              {i < steps.length - 1 && (
                <div className="flex-1 h-0.5" style={{ backgroundColor: step > s.id ? C.green : C.g200 }} />
              )}
            </React.Fragment>
          ))}
        </div>

        <div>
          {/* ━━ STEP 1: Offer Type ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
          {step === 1 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-xl font-bold mb-0.5" style={{ color: C.forest }}>What do you want to do?</h2>
                <p className="text-xs" style={{ color: C.g500 }}>Choose the type of offer you're creating.</p>
              </div>
              {/* ── Asset selector ── */}
              <div>
                <label className="block text-sm font-bold mb-2" style={{ color: C.g700 }}>
                  Coin <span style={{ color: C.danger }}>*</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { val: 'BTC', label: 'Bitcoin (BTC)', icon: Bitcoin },
                    { val: 'USDT', label: 'Tether (USDT)', icon: Banknote },
                  ].map(({ val, label, icon: CoinIcon }) => (
                    <button key={val} onClick={() => setAsset(val)}
                      disabled={step > 1}
                      className={`w-full p-3.5 rounded-2xl border-2 transition-all flex items-center gap-3 ${step > 1 ? 'opacity-60 cursor-not-allowed' : ''}`}
                      style={{
                        borderColor: asset === val ? C.green : C.g200,
                        backgroundColor: asset === val ? `${C.green}08` : C.white,
                        width: '100%', boxSizing: 'border-box',
                      }}>
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: asset === val ? C.green : C.g100 }}>
                        {val === 'BTC' ? (
                          <CoinIcon size={18} style={{ color: asset === val ? C.white : C.g500 }} />
                        ) : (
                          <span className="text-sm font-black" style={{ color: asset === val ? C.white : C.g500 }}>₮</span>
                        )}
                      </div>
                      <p className="font-bold text-sm flex-1" style={{ color: C.forest }}>{label}</p>
                      {asset === val && <Check size={16} style={{ color: C.green, flexShrink: 0 }} />}
                    </button>
                  ))}
                </div>
              </div>

              {/* ── Category selector (P2P Marketplace vs Gift Cards) ── */}
              <div>
                <label className="block text-sm font-bold mb-2" style={{ color: C.g700 }}>
                  Marketplace Category <span style={{ color: C.danger }}>*</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (isGC) setOfferType('sell');
                    }}
                    className="w-full p-3.5 rounded-2xl border-2 transition-all flex items-center gap-2.5 text-left"
                    style={{
                      borderColor: !isGC ? C.green : C.g200,
                      backgroundColor: !isGC ? `${C.green}08` : C.white,
                      boxSizing: 'border-box',
                    }}
                  >
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: !isGC ? C.green : C.g100 }}>
                      <Globe size={18} style={{ color: !isGC ? C.white : C.g500 }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-xs" style={{ color: C.forest }}>P2P Marketplace</p>
                      <p className="text-[10px]" style={{ color: C.g500 }}>Bank, MoMo, Fiat</p>
                    </div>
                    {!isGC && <Check size={16} style={{ color: C.green, flexShrink: 0 }} />}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (!isGC) setOfferType('gc_sell');
                    }}
                    className="w-full p-3.5 rounded-2xl border-2 transition-all flex items-center gap-2.5 text-left"
                    style={{
                      borderColor: isGC ? C.purple : C.g200,
                      backgroundColor: isGC ? `${C.purple}08` : C.white,
                      boxSizing: 'border-box',
                    }}
                  >
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: isGC ? C.purple : C.g100 }}>
                      <Gift size={18} style={{ color: isGC ? C.white : C.g500 }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-xs" style={{ color: C.purple }}>Gift Cards</p>
                      <p className="text-[10px]" style={{ color: C.g500 }}>Amazon, iTunes, etc.</p>
                    </div>
                    {isGC && <Check size={16} style={{ color: C.purple, flexShrink: 0 }} />}
                  </button>
                </div>
              </div>

              {/* ── Direction / Action options ── */}
              <div>
                <label className="block text-sm font-bold mb-2" style={{ color: C.g700 }}>
                  Offer Direction <span style={{ color: C.danger }}>*</span>
                </label>
                <div className="space-y-2">
                  {(isGC ? [
                    { id: 'gc_sell', title: (a) => `Sell Gift Card for ${a}`, desc: (a) => `You send a gift card, buyer sends you ${a}. Requires a $200 security deposit.`, icon: Gift },
                    { id: 'gc_buy', title: (a) => `Buy ${a} with Gift Card`, desc: (a) => `Sellers send you a gift card, you send them ${a}.`, icon: Gift },
                  ] : [
                    { id: 'sell', title: (a) => `Sell ${a}`, desc: (a) => `Buyers pay you, you release ${a} from your wallet.`, icon: ArrowUpRight },
                    { id: 'buy', title: (a) => `Buy ${a}`, desc: (a) => `You pay sellers to receive ${a} into your wallet.`, icon: ArrowDownRight },
                  ]).map(({ id, title, desc, icon: Icon }) => (
                    <button
                      key={id}
                      onClick={() => setOfferType(id)}
                      className="w-full p-4 rounded-2xl text-left border-2 transition-all flex items-center gap-3"
                      style={{
                        borderColor: offerType === id ? (isGC ? C.purple : C.green) : C.g200,
                        backgroundColor: offerType === id ? (isGC ? `${C.purple}08` : `${C.green}08`) : C.white,
                        width: '100%', boxSizing: 'border-box',
                      }}
                    >
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: offerType === id ? (isGC ? C.purple : C.green) : C.g100 }}>
                        <Icon size={18} style={{ color: offerType === id ? C.white : C.g500 }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm" style={{ color: C.forest }}>{title(assetLabel)}</p>
                        <p className="text-xs" style={{ color: C.g500 }}>{desc(assetLabel)}</p>
                      </div>
                      {offerType === id && <Check size={16} style={{ color: isGC ? C.purple : C.green, flexShrink: 0 }} />}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ━━ STEP 2 (GC only): Gift Card details ━━━━━━━━━━━━━━━━━━━━━━━━ */}
          {step === 2 && isGC && (
            <div className="space-y-5">
              <div>
                <h2 className="text-xl font-bold mb-0.5" style={{ color: C.forest }}>Gift Card Details</h2>
                <p className="text-xs" style={{ color: C.g500 }}>
                  Choose the gift card brand, type, and denominations you'll accept.
                </p>
              </div>

              <div>
                <label className="block text-sm font-bold mb-1.5" style={{ color: C.g700 }}>
                  Gift Card Brand <span style={{ color: C.danger }}>*</span>
                </label>
                <SearchableSelect
                  items={GC_BRANDS}
                  value={gcBrand}
                  onChange={(val) => {
                    setGcBrand(val);
                    if (val === 'iTunes Denmark') {
                      setGcCurrencies([{ region: 'iTunes Denmark', currency: 'DKK', symbol: 'kr', flag: '🇩🇰' }]);
                    }
                  }}
                  searchValue={gcSearch}
                  onSearchChange={setGcSearch}
                  placeholder="Search & select a gift card brand…"
                  searchPlaceholder="Search brands…"
                  getKey={(item) => item.name}
                  getLabel={(item) => item.name}
                  renderSelected={(item) => (
                    <>
                      <span className="flex-shrink-0 w-7 flex items-center justify-center"><item.icon size={20} /></span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate" style={{ color: C.g800 }}>{item.name}</p>
                      </div>
                    </>
                  )}
                  renderItem={(item, active) => (
                    <>
                      <span className="flex-shrink-0 w-8 flex items-center justify-center"><item.icon size={18} /></span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate" style={{ color: active ? C.green : C.g800 }}>
                          {item.name}
                        </p>
                      </div>
                      {active && <Check size={14} style={{ color: C.green, flexShrink: 0 }} />}
                    </>
                  )}
                />
              </div>

              {/* Card Type */}
              <div>
                <label className="block text-sm font-bold mb-1.5" style={{ color: C.g700 }}>
                  Card Type <span style={{ color: C.danger }}>*</span>
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { val: 'physical', label: 'Physical' },
                    { val: 'ecode', label: 'E-Code' },
                    { val: 'both', label: 'Both' },
                  ].map(({ val, label }) => (
                    <button key={val} onClick={() => setGcCardType(val)}
                      className="py-2.5 rounded-xl font-bold text-xs transition-all border-2 active:scale-[0.97]"
                      style={{
                        borderColor: gcCardType === val ? C.purple : C.g200,
                        backgroundColor: gcCardType === val ? C.purple : C.white,
                        color: gcCardType === val ? C.white : C.g700,
                        width: '100%', boxSizing: 'border-box',
                      }}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* ── Card Currency Region (single select) */}
              <div>
                <label className="block text-sm font-semibold mb-1" style={{ color: C.g700 }}>
                  Card Currency Region
                </label>
                <p className="text-sm mb-3" style={{ color: C.g500 }}>
                  Select the region / currency your gift card supports.
                </p>
                {(() => {
                  const filteredCurrencies = GC_CURRENCIES.filter(c => {
                    if (!gcBrand) return true;
                    const brandBase = gcBrand.toLowerCase().replace(/card|\/.*$/g, '').trim();
                    const regionLower = c.region.toLowerCase();
                    return regionLower.includes(brandBase) || brandBase.includes(regionLower.split(' ')[0]);
                  });
                  const listToUse = filteredCurrencies.length ? filteredCurrencies : GC_CURRENCIES;

                  return (
                    <SearchableSelect
                      items={listToUse}
                      value={gcCurrencies[0]?.region || ''}
                      onChange={(region) => {
                        const c = listToUse.find(x => x.region === region) || GC_CURRENCIES.find(x => x.region === region);
                        if (!c) return;
                        setGcCurrencies([{ ...c }]);
                      }}
                      searchValue={gcCurrSearch}
                      onSearchChange={setGcCurrSearch}
                      placeholder="Select region / currency (USD, GBP, EUR…)"
                      searchPlaceholder="Search region or currency…"
                      getKey={(item) => item.region}
                      getLabel={(item) => `${item.region} (${item.currency})`}
                      renderSelected={(item) => (
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <span className="text-base flex-shrink-0">{item.flag}</span>
                          <span className="text-sm font-black truncate" style={{ color: C.g800 }}>
                            {item.region}
                          </span>
                          <span className="px-2 py-0.5 rounded-md text-xs font-bold flex-shrink-0" style={{ backgroundColor: C.g100, color: C.forest }}>
                            {item.currency} ({item.symbol})
                          </span>
                        </div>
                      )}
                      renderItem={(item, active) => {
                        const sel = gcCurrencies.some(x => x.region === item.region);
                        return (
                          <>
                            <span className="text-base w-7 text-center flex-shrink-0">{item.flag}</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold truncate" style={{ color: C.g800 }}>{item.region}</p>
                              <p className="text-xs font-bold" style={{ color: C.g500 }}>{item.symbol} {item.currency}</p>
                            </div>
                            {sel && <Check size={14} style={{ color: C.mint, flexShrink: 0 }} />}
                          </>
                        );
                      }}
                    />
                  );
                })()}
              </div>

              {/* Card Range (Min - Max inputs) */}
              <div>
                <label className="block text-sm font-bold mb-1.5" style={{ color: C.g700 }}>
                  Card Range <span style={{ color: C.danger }}>*</span>
                </label>
                <p className="text-xs mb-2.5" style={{ color: C.g500 }}>
                  Enter the minimum and maximum card value you accept.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold mb-1" style={{ color: C.g600 }}>
                      Minimum
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        min="1"
                        placeholder="e.g. 10"
                        value={gcMinRange}
                        onChange={(e) => setGcMinRange(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl border-2 font-bold text-sm focus:outline-none transition-all"
                        style={{ borderColor: C.g200, color: C.g800 }}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold mb-1" style={{ color: C.g600 }}>
                      Maximum
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        min="1"
                        placeholder="e.g. 500"
                        value={gcMaxRange}
                        onChange={(e) => setGcMaxRange(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl border-2 font-bold text-sm focus:outline-none transition-all"
                        style={{ borderColor: C.g200, color: C.g800 }}
                      />
                    </div>
                  </div>
                </div>

                {parsedMinRange > 0 && parsedMaxRange >= parsedMinRange && (
                  <div className="mt-3 p-3 rounded-xl flex items-center justify-between"
                    style={{ backgroundColor: `${C.purple}08`, border: `1px solid ${C.purple}20` }}>
                    <div>
                      <p className="text-xs font-bold" style={{ color: C.g500 }}>Selected Card Range</p>
                      <p className="text-sm font-black" style={{ color: C.purple }}>
                        {gcCurrencySymbol}{fmt(parsedMinRange)} – {gcCurrencySymbol}{fmt(parsedMaxRange)} {gcCurrencyCode}
                        {!activeGcCurrency && (
                          <span className="block text-[11px] font-semibold text-amber-600 mt-0.5">
                            (Select region above for currency)
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-xs" style={{ color: C.g400 }}>{assetLabel} equiv.</p>
                      <p className="text-xs font-bold" style={{ color: C.forest }}>
                        {assetSymbol}{(parsedMinRange / assetPriceUsd).toFixed(assetDecimals)}
                      </p>
                      <p className="text-xs" style={{ color: C.g400 }}>at min {gcCurrencySymbol}{fmt(parsedMinRange)}</p>
                    </div>
                  </div>
                )}

                {isGcBuySide && parsedMinRange > 0 && (gcWalletTooLow || gcMinExceedsWallet) && (
                  <div className="mt-3 p-3 rounded-xl flex items-start gap-2"
                    style={{ backgroundColor: '#FFFBEB', border: '1px solid #FDE68A' }}>
                    <AlertTriangle size={14} style={{ color: '#B45309', flexShrink: 0, marginTop: 1 }} />
                    <p className="text-xs font-semibold" style={{ color: '#92400E' }}>
                      {gcWalletTooLow
                        ? `Your ${assetLabel} wallet balance is too low to back this offer — top up at least $10 worth of ${assetLabel} first.`
                        : `Your wallet only covers ~$${fmt(walletUsdValue, 0)} — below your ${gcCurrencySymbol}${parsedMinRange} minimum card value. Lower the minimum or top up your wallet, or this offer will show as unavailable to buyers.`}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ━━ STEP 2 (BTC) / STEP 3 (GC): Country + Payment ━━━━━━━━━━━━━━ */}
          {((step === 2 && !isGC) || (step === 3 && isGC)) && (
            <div className="space-y-5">
              <div>
                <h2 className="text-xl font-bold mb-0.5" style={{ color: C.forest }}>
                  {isGC ? 'Location & Gift Card' : 'Location & Payment'}
                </h2>
                <p className="text-xs" style={{ color: C.g500 }}>
                  {offerType === 'sell' ? 'Where should buyers pay you?' :
                    offerType === 'buy' ? 'Where will you pay sellers?' :
                      isGC ? 'Where are you located? Gift card details from previous step.' :
                        'Where are you located?'}
                </p>
              </div>

              {/* Premium Country Select */}
              <div>
                <label className="block text-sm font-semibold mb-2" style={{ color: C.g700 }}>
                  Your Country <span style={{ color: C.danger }}>*</span>
                </label>
                <SearchableSelect
                  items={COUNTRIES}
                  value={country}
                  onChange={(val) => {
                    setCountry(val);
                    setCountrySearch('');
                    const c = COUNTRIES.find(x => x.code === val);
                    if (c) {
                      if (!isGC) {
                        setCurrencyCode(c.currency);
                        setCurrencySymbol(c.symbol);
                      } else if (FOREIGN_CURRENCY_CODES.includes(c.currency)) {
                        setCurrencyCode(c.currency);
                        setCurrencySymbol(c.symbol);
                      }
                    }
                  }}
                  searchValue={countrySearch}
                  onSearchChange={setCountrySearch}
                  placeholder="Search & select your country…"
                  searchPlaceholder="Search countries…"
                  getKey={(item) => item.code}
                  getLabel={(item) => item.name}
                  renderSelected={(item) => (
                    <>
                      <span className="text-lg flex-shrink-0">{item.flag}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate" style={{ color: C.g800 }}>{item.name}</p>
                        <p className="text-xs" style={{ color: C.g500 }}>{item.symbol} {item.currency}</p>
                      </div>
                    </>
                  )}
                  renderItem={(item, active) => (
                    <>
                      <span className="text-lg w-8 text-center flex-shrink-0">{item.flag}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate" style={{ color: active ? C.green : C.g800 }}>
                          {item.name}
                        </p>
                        <p className="text-xs" style={{ color: C.g500 }}>{item.symbol} {item.currency}</p>
                      </div>
                      {active && <Check size={14} style={{ color: C.green, flexShrink: 0 }} />}
                    </>
                  )}
                />
              </div>

              {/* Premium Currency Select */}
              <div>
                <label className="block text-sm font-semibold mb-1" style={{ color: C.g700 }}>
                  Currency
                </label>
                <p className="text-sm mb-2" style={{ color: C.g500 }}>
                  {isGC
                    ? 'Restricted to foreign currencies for gift card trades.'
                    : 'Auto-set from country — change independently if needed.'}
                </p>
                <SearchableSelect
                  items={isGC ? CURRENCIES_LIST.filter(c => FOREIGN_CURRENCY_CODES.includes(c.code)) : CURRENCIES_LIST}
                  value={currencyCode}
                  onChange={(val) => {
                    const c = CURRENCIES_LIST.find(x => x.code === val);
                    if (c) { setCurrencyCode(c.code); setCurrencySymbol(c.symbol); setCurrencySearch(''); }
                  }}
                  searchValue={currencySearch}
                  onSearchChange={setCurrencySearch}
                  placeholder="Select currency…"
                  searchPlaceholder="Search currencies…"
                  getKey={(item) => item.code}
                  getLabel={(item) => item.code}
                  renderSelected={(item) => (
                    <>
                      <span className="text-sm font-bold w-8 flex-shrink-0 text-center" style={{ color: C.forest }}>{item.symbol}</span>
                      <span className="text-sm font-semibold flex-1" style={{ color: C.g800 }}>{item.code}</span>
                    </>
                  )}
                  renderItem={(item, active) => (
                    <>
                      <span className="text-sm font-bold w-8 text-center flex-shrink-0" style={{ color: active ? C.green : C.g500 }}>
                        {item.symbol}
                      </span>
                      <span className="text-sm font-semibold flex-1" style={{ color: active ? C.green : C.g800 }}>
                        {item.code}
                      </span>
                      {active && <Check size={14} style={{ color: C.green, flexShrink: 0 }} />}
                    </>
                  )}
                />
              </div>

              {/* Payment section — GC shows brand card, BTC shows payment dropdown */}
              {curr && (
                isGC ? (
                  <div>
                    <label className="block text-sm font-bold mb-1.5" style={{ color: C.g700 }}>
                      Gift Card as Payment
                    </label>
                    <p className="text-xs mb-3" style={{ color: C.g500 }}>
                      Sellers will bring you this gift card in exchange for your Bitcoin.
                    </p>
                    <div className="p-4 rounded-2xl border-2 flex items-center gap-4"
                      style={{ borderColor: C.purple, backgroundColor: `${C.purple}06` }}>
                      <span className="text-4xl flex-shrink-0">
                        {(() => { const b = GC_BRANDS.find(x => x.name === gcBrand); const Icon = b?.icon || Gift; return <Icon size={36} />; })()}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-base" style={{ color: C.forest }}>{gcBrand}</p>
                        <p className="text-xs mt-0.5" style={{ color: C.g500 }}>
                          {gcCardType === 'physical' ? 'Physical Card' : gcCardType === 'ecode' ? 'E-Code' : 'Physical Card & E-Code'}
                        </p>
                        {gcCardValues.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {gcCardValues.map(v => (
                              <span key={v} className="text-xs font-bold px-2 py-0.5 rounded-full text-white"
                                style={{ backgroundColor: C.purple }}>${v}</span>
                            ))}
                          </div>
                        )}
                      </div>
                      <span className="text-xs font-bold px-2.5 py-1 rounded-full flex-shrink-0"
                        style={{ backgroundColor: `${C.purple}15`, color: C.purple }}>
                        Payment
                      </span>
                    </div>
                    <p className="text-xs mt-2" style={{ color: C.g400 }}>
                      To change brand or denominations, go back to the previous step.
                    </p>
                  </div>
                ) : (
                  <div ref={payRef} className="relative">
                    <label className="block text-sm font-bold mb-1.5" style={{ color: C.g700 }}>
                      Payment Method <span style={{ color: C.danger }}>*</span>
                    </label>
                    <p className="text-xs mb-2" style={{ color: C.g500 }}>
                      How {offerType === 'sell' ? 'buyers pay you' : 'you pay sellers'}
                    </p>

                    <button onClick={() => setShowPayMenu(!showPayMenu)}
                      className="w-full flex items-center gap-3 px-4 py-4 rounded-xl border-2 text-left transition"
                      style={{
                        borderColor: payMethod ? C.green : C.g200,
                        backgroundColor: payMethod ? `${C.green}05` : C.white,
                        minHeight: 60,
                      }}>
                      {selectedPay ? (
                        <>
                          <span className="text-2xl flex-shrink-0 flex items-center justify-center w-8 h-8">
                            <selectedPay.icon size={22} style={{ color: C.forest }} />
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-base font-bold" style={{ color: C.g800 }}>{selectedPay.name}</p>

                            <p className="text-xs mt-0.5" style={{ color: CAT_COLORS[selectedPay.cat] || C.g400 }}>
                              {selectedPay.cat}
                            </p>
                          </div>
                          <button onClick={e => { e.stopPropagation(); setPayMethod(''); }}
                            className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
                            style={{ backgroundColor: C.g100 }}>
                            <X size={13} style={{ color: C.g400 }} />
                          </button>
                        </>
                      ) : (
                        <>
                          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                            style={{ backgroundColor: C.g100 }}>
                            <DollarSign size={18} style={{ color: C.g400 }} />
                          </div>
                          <span className="flex-1 text-sm font-semibold" style={{ color: C.g400 }}>Tap to select payment method…</span>
                          <ChevronDown size={18} style={{ color: C.g400 }} />
                        </>
                      )}
                    </button>
                    {showPayMenu && <PayDropdown />}

                    {/* Category legend */}
                    <div className="flex flex-wrap gap-1.5 mt-2" style={{ rowGap: 6 }}>
                      {Object.entries(CAT_COLORS).map(([cat, color]) => (
                        <span key={cat} className="font-bold px-2 py-1 rounded-full"
                          style={{ backgroundColor: `${color}15`, color, fontSize: '10px' }}>
                          {cat}
                        </span>
                      ))}
                    </div>
                  </div>
                )
              )}
            </div>
          )}

          {/* ━━ STEP 3 (BTC) / STEP 4 (GC): Pricing / Rate ━━━━━━━━━━━━━━━━━ */}
          {((step === 3 && !isGC) || (step === 4 && isGC)) && (
            <div className="space-y-5">
              <div>
                <h2 className="text-xl font-bold mb-0.5" style={{ color: C.forest }}>
                  {isGC ? `Set ${assetLabel} Rate` : `Set Your ${assetLabel} Rate`}
                </h2>
                <p className="text-xs" style={{ color: C.g500 }}>
                  Control your price. Higher margin = more profit per trade.
                </p>
              </div>

              {/* Live price banner */}
              <div className="p-4 rounded-2xl text-white"
                style={{ background: `linear-gradient(135deg,${C.forest},${C.green})`, width: '100%', boxSizing: 'border-box' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <p className="text-xs text-white/60 mb-0.5">Live Market Price</p>
                    <p className="text-xl font-bold" style={{ wordBreak: 'break-all' }}>
                      {loadingPrice ? '…' : `${sym}${fmt(assetLocal, 0)}`}
                    </p>
                    <p className="text-xs text-white/50 mt-0.5">{cur}/{assetLabel} · auto-refresh</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs text-white/60 mb-0.5">USD</p>
                    <p className="text-base font-bold">{asset === 'BTC' ? `$${fmt(btcPrice, 0)}` : '$1.00'}</p>
                    <button onClick={() => setLoadingPrice(true)}
                      className="mt-1 text-xs text-white/40 flex items-center gap-1 ml-auto hover:text-white/70">
                      <RefreshCw size={9} /> Refresh
                    </button>
                  </div>
                </div>
              </div>

              {/* Rate type */}
              <div>
                <label className="block text-sm font-bold mb-2" style={{ color: C.g700 }}>Rate Type</label>
                <div className="grid grid-cols-1 gap-2">
                  {[
                    { val: 'market', icon: TrendingUp, title: 'Market Rate', desc: 'Auto-adjusts with market price. Always competitive.' },
                    { val: 'fixed', icon: Tag, title: 'Fixed Rate', desc: 'You lock a price. Stays constant even if the market moves.' },
                  ].map(({ val, icon: Icon, title, desc }) => (
                    <button key={val} onClick={() => setPricingType(val)}
                      className="p-3 rounded-xl text-left border-2 transition-all"
                      style={{
                        borderColor: pricingType === val ? C.green : C.g200,
                        backgroundColor: pricingType === val ? `${C.green}08` : C.white,
                        width: '100%', boxSizing: 'border-box',
                      }}>
                      <div className="flex items-center gap-2 mb-1">
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                          style={{ backgroundColor: pricingType === val ? C.green : C.g100 }}>
                          <Icon size={13} style={{ color: pricingType === val ? C.white : C.g400 }} />
                        </div>
                        <p className="font-bold text-sm" style={{ color: C.forest }}>{title}</p>
                        {pricingType === val && <Check size={12} style={{ color: C.green, marginLeft: 'auto', flexShrink: 0 }} />}
                      </div>
                      <p className="text-xs leading-relaxed" style={{ color: C.g500 }}>{desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Market margin — -10 to 100% */}
              {pricingType === 'market' && (
                <div>
                  <div className="mb-2">
                    <label className="text-sm font-bold block mb-1.5" style={{ color: C.g700 }}>Your Margin</label>
                    <div className="flex flex-wrap items-center gap-1">
                      <span className="text-xs flex-shrink-0" style={{ color: C.g500 }}>Quick:</span>
                      {[-5, -1, 0, 1, 3, 5, 10, 20].map(v => (
                        <button key={v} onClick={() => setMargin(v)}
                          className="px-1.5 py-0.5 rounded-full text-xs font-bold transition"
                          style={{
                            backgroundColor: margin === v ? (v < 0 ? C.danger : v === 0 ? C.g500 : C.green) : C.g100,
                            color: margin === v ? C.white : C.g600,
                          }}>{v > 0 ? '+' : ''}{v}%</button>
                      ))}
                    </div>
                  </div>

                  <div className="p-4 rounded-2xl border-2" style={{ borderColor: C.g200 }}>
                    {/* Big margin display + stepper */}
                    <div className="flex items-center gap-3 mb-4">
                      <button onClick={() => setMargin(m => Math.max(-10, parseFloat((m - 0.5).toFixed(1))))}
                        className="w-11 h-11 rounded-xl flex items-center justify-center active:scale-95 flex-shrink-0 transition-colors"
                        style={{ border: 'none', backgroundColor: 'transparent' }}
                        onMouseEnter={e => e.currentTarget.style.backgroundColor = `${C.danger}10`}
                        onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                        <Minus size={18} style={{ color: C.danger }} />
                      </button>
                      <div className="flex-1 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <span className="text-4xl font-black"
                            style={{ color: margin < 0 ? C.danger : margin === 0 ? C.g500 : C.success }}>
                            {margin > 0 ? '+' : ''}{margin}%
                          </span>
                          {margin < 0
                            ? <ArrowDownRight size={22} style={{ color: C.danger }} />
                            : <ArrowUpRight size={22} style={{ color: margin === 0 ? C.g500 : C.success }} />}
                        </div>
                        <p className="text-xs mt-0.5" style={{ color: C.g400 }}>
                          {margin < 0 ? 'Discount below market — buyers get more BTC' : margin === 0 ? 'Exactly at market rate' : 'Your markup rate above market'}
                        </p>
                      </div>
                      <button onClick={() => setMargin(m => Math.min(100, parseFloat((m + 0.5).toFixed(1))))}
                        className="w-11 h-11 rounded-xl flex items-center justify-center active:scale-95 flex-shrink-0 transition-colors"
                        style={{ border: 'none', backgroundColor: 'transparent' }}
                        onMouseEnter={e => e.currentTarget.style.backgroundColor = `${C.success}10`}
                        onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                        <Plus size={18} style={{ color: C.success }} />
                      </button>
                    </div>


                    <input type="range" min="-10" max="100" step="0.5"
                      value={margin} onChange={e => setMargin(parseFloat(e.target.value))}
                      className="w-full custom-slider"
                      style={{
                        color: margin < 0 ? C.danger : C.success,
                        background: `linear-gradient(to right, ${margin < 0 ? C.danger : C.success} 0%, ${margin < 0 ? C.danger : C.success} ${((margin + 10) / 110) * 100}%, #E2E8F0 ${((margin + 10) / 110) * 100}%, #E2E8F0 100%)`
                      }} />
                    <div className="flex justify-between text-xs mt-0.5" style={{ color: C.g400 }}>
                      <span>-10%</span>
                      <span>0% (market)</span>
                      <span>+100%</span>
                    </div>

                    {/* Type exact margin */}
                    <div className="mt-3 flex items-center gap-2">
                      <label className="text-xs font-bold flex-shrink-0" style={{ color: C.g500 }}>Custom:</label>
                      <div className="relative flex-1">
                        <input type="number" min="-10" max="100" step="0.5"
                          value={margin} onChange={e => setMargin(Math.min(100, Math.max(-10, parseFloat(e.target.value) || 0)))}
                          className="w-full pl-3 pr-7 py-2 text-xs border-2 rounded-xl focus:outline-none font-bold"
                          style={{ borderColor: C.g200, color: C.forest }} />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold" style={{ color: C.g400 }}>%</span>
                      </div>
                    </div>

                    {/* ── Trade Breakdown — crystal clear profit explanation ── */}
                    {curr && (() => {
                      const exampleCash = 100;
                      const buyerGetsUSD = (exampleCash / (1 + margin / 100)) * 0.995;
                      const yourProfitUSD = exampleCash - buyerGetsUSD;
                      const yourProfitPct = (yourProfitUSD / exampleCash) * 100;
                      return (
                        <div
                          className="mt-3 rounded-2xl overflow-hidden border-2"
                          style={{ borderColor: C.g200, backgroundColor: C.white, width: '100%', boxSizing: 'border-box' }}
                        >
                          {/* Header */}
                          <div
                            className="px-4 py-3 flex items-center justify-between flex-wrap gap-1"
                            style={{ backgroundColor: C.mist, borderBottom: `1px solid ${C.g100}` }}
                          >
                            <p className="text-xs font-bold flex items-center gap-1.5" style={{ color: C.forest }}>
                              <BarChart2 size={13} style={{ color: C.forest }} /> Per $100 trade
                            </p>
                            <span
                              className="text-xs font-bold px-2.5 py-1 rounded-full"
                              style={{ backgroundColor: C.forest, color: C.white }}
                            >
                              {margin > 0 ? '+' : ''}{margin}% margin
                            </span>
                          </div>

                          {/* Rows — single white background, no color shift */}
                          <div className="px-4 py-3 space-y-2.5">
                            {[
                              { n: '1', label: offerType === 'sell' ? 'Buyer pays you' : 'You pay seller', val: `$${fmt(exampleCash, 0)}`, color: C.g800 },
                              { n: '2', label: offerType === 'sell' ? `Buyer gets ${assetLabel} worth` : `You get ${assetLabel} worth`, val: `$${fmt(buyerGetsUSD, 2)}`, color: C.mint },
                            ].map(({ n, label, val, color }) => (
                              <div key={n} className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span
                                    className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                                    style={{ backgroundColor: C.g100, color: C.forest }}
                                  >{n}</span>
                                  <span className="text-xs" style={{ color: C.g600 }}>{label}</span>
                                </div>
                                <span className="text-xs font-bold flex-shrink-0" style={{ color }}>{val}</span>
                              </div>
                            ))}

                            <div
                              className="flex items-start justify-between gap-2 pt-2.5 border-t"
                              style={{ borderColor: C.g100 }}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <span
                                  className="w-5 h-5 rounded-full flex items-center justify-center text-xs flex-shrink-0"
                                  style={{ backgroundColor: yourProfitUSD < 0 ? C.danger : C.success, color: C.white }}
                                >
                                  {yourProfitUSD < 0 ? '↓' : '✓'}
                                </span>
                                <span className="text-xs font-bold" style={{ color: C.g700 }}>
                                  {yourProfitUSD < 0 ? 'Your loss' : 'Your profit'}
                                </span>
                              </div>
                              <div className="text-right flex-shrink-0">
                                <span
                                  className="text-sm font-bold"
                                  style={{ color: yourProfitUSD < 0 ? C.danger : C.success }}
                                >
                                  {yourProfitUSD < 0 ? '-' : '+'}${fmt(Math.abs(yourProfitUSD), 2)}
                                </span>
                                <p className="text-xs" style={{ color: C.g400 }}>
                                  {fmt(Math.abs(yourProfitPct), 1)}%
                                </p>
                              </div>
                            </div>
                          </div>

                          {/* Rate row — same mist tint as header, bookends the card */}
                          <div
                            className="px-4 py-3 flex items-center justify-between gap-2 border-t"
                            style={{ borderColor: C.g100, backgroundColor: C.mist }}
                          >
                            <div className="min-w-0">
                              <p className="text-xs" style={{ color: C.g500 }}>Your rate</p>
                              <p className="text-xs font-bold truncate" style={{ color: C.forest }}>
                                {sym}{fmt(effectiveRate, 0)} {cur}
                              </p>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <p className="text-xs" style={{ color: C.g400 }}>Market</p>
                              <p className="text-xs font-semibold" style={{ color: C.g500 }}>
                                {sym}{fmt(assetLocal, 0)} {cur}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              )}

              {/* Fixed price */}
              {pricingType === 'fixed' && (
                <div>
                  <label className="block text-sm font-bold mb-1.5" style={{ color: C.g700 }}>
                    Fixed Price ({cur} per {assetLabel})
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-sm" style={{ color: C.g500 }}>{sym}</span>
                    <input type="number" value={fixedPrice} onChange={e => setFixedPrice(e.target.value)}
                      placeholder={fmt(assetLocal, 0)}
                      className="w-full pl-10 pr-24 py-3.5 border-2 rounded-xl text-sm font-bold focus:outline-none"
                      style={{ borderColor: fixedPrice ? C.green : C.g200, color: C.forest }} />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold" style={{ color: C.g400 }}>
                      {cur}/{assetLabel}
                    </span>
                  </div>
                  {fixedPrice && assetLocal > 0 && (
                    <p className="text-xs mt-1.5 font-semibold flex items-center gap-1.5"
                      style={{ color: parseFloat(fixedPrice) >= assetLocal ? C.success : C.danger }}>
                      {parseFloat(fixedPrice) >= assetLocal
                        ? <><CheckCircle size={13} /> +{((parseFloat(fixedPrice) / assetLocal - 1) * 100).toFixed(1)}% above market</>
                        : <><AlertTriangle size={13} /> −{((1 - parseFloat(fixedPrice) / assetLocal) * 100).toFixed(1)}% below market</>}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ━━ STEP 4 (BTC): Limits + Time ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
          {step === 4 && !isGC && (
            <div className="space-y-5">
              <div>
                <h2 className="text-xl font-bold mb-0.5" style={{ color: C.forest }}>Trade Limits & Timer</h2>
                <p className="text-xs" style={{ color: C.g500 }}>
                  Set min/max trade sizes in {cur} ({curr?.flag} {curr?.name}) and the payment window.
                </p>
              </div>

              {/* Wallet balance banner */}
              {isSellSide ? (
                <div className="rounded-xl border overflow-hidden"
                  style={{
                    backgroundColor: !sellWalletTooLow ? '#F0FDF4' : '#FFFBEB',
                    borderColor: !sellWalletTooLow ? '#A7F3D0' : '#FDE68A'
                  }}>
                  <div className="p-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm flex items-center"><Briefcase size={16} /></span>
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wide"
                          style={{ color: !sellWalletTooLow ? C.forest : '#92400E' }}>
                          {assetLabel} Wallet
                        </p>
                        <p className="text-xs font-bold"
                          style={{ color: !sellWalletTooLow ? C.forest : '#B45309' }}>
                          {assetSymbol}{(walletBal[walletKey] || 0).toFixed(assetDecimals)} ≈ ${fmt(walletUsdValue, 0)} USD
                        </p>
                        {cur !== 'USD' && walletCapacityLocal > 0 && (
                          <p className="text-xs font-semibold" style={{ color: C.g500 }}>
                            Max offer: {sym}{fmt(walletCapacityLocal, 0)} {cur}
                          </p>
                        )}
                      </div>
                    </div>
                    <p className="text-xs font-bold text-right flex-shrink-0 ml-2" style={{ color: C.g500 }}>
                      Max you<br />can offer
                    </p>
                  </div>
                  {sellWalletTooLow && (
                    <div className="px-3 pb-3 flex items-start gap-1.5">
                      <Info size={13} style={{ color: '#92400E', flexShrink: 0, marginTop: 1 }} />
                      <div>
                        <p className="text-xs font-semibold" style={{ color: '#92400E' }}>
                          You need at least $10 in your {assetLabel} wallet to publish a sell offer — fund it first, then come back to finish this offer.
                        </p>
                        <button type="button" onClick={() => navigate('/wallet')}
                          className="mt-2 text-xs font-bold underline"
                          style={{ color: '#92400E' }}>
                          Fund my wallet
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-xl border p-3 flex items-start gap-2.5"
                  style={{ backgroundColor: '#F0FDF4', borderColor: '#A7F3D0' }}>
                  <span className="text-sm flex-shrink-0 flex items-center"><Lightbulb size={16} /></span>
                  <p className="text-xs font-semibold" style={{ color: C.forest }}>
                    No wallet balance needed. You're setting how much {assetLabel} you want to buy — sellers will fill your order. Set any limits you like.
                  </p>
                </div>
              )}

              {/* Min / Max in local currency */}
              <div className="p-3 rounded-2xl border-2 space-y-3" style={{ borderColor: C.g200, width: '100%', boxSizing: 'border-box' }}>
                <h3 className="font-bold text-sm flex items-center gap-2" style={{ color: C.forest }}>
                  <BarChart2 size={14} style={{ color: C.green }} /> Limits in {sym} {cur}
                </h3>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { key: 'min', label: 'Minimum', val: minLimit, set: setMinLimit, ph: `Min ${sym}${Math.ceil(10 * localRate)}` },
                    { key: 'max', label: 'Maximum', val: maxLimit, set: setMaxLimit, ph: `Max ${sym}${isSellSide && walletCapacityLocal > 0 ? fmt(Math.floor(walletCapacityLocal), 0) : '5000'}` },
                  ].map(({ key, label, val, set, ph }) => {
                    const isMin = key === 'min';
                    const isMax = key === 'max';
                    const belowMin = isMin && val && parseFloat(val) / localRate < 10;
                    const aboveCap = isMax && isSellSide && walletCapacityLocal > 0 && parseFloat(val) > walletCapacityLocal;
                    const hasError = belowMin || aboveCap;
                    return (
                      <div key={key}>
                        <label className="block text-xs font-bold mb-1.5" style={{ color: C.g600 }}>
                          {label} per Trade <span style={{ color: C.danger }}>*</span>
                          {isMax && isSellSide && walletCapacityLocal > 0 && (
                            <span className="ml-1 font-semibold" style={{ color: C.g400 }}>
                              (cap: {sym}{fmt(Math.floor(walletCapacityLocal), 0)})
                            </span>
                          )}
                        </label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold"
                            style={{ color: C.g500 }}>{sym}</span>
                          <input type="number" value={val}
                            onChange={e => set(e.target.value)}
                            onBlur={() => {
                              if (isMax && isSellSide && walletCapacityLocal > 0 && parseFloat(val) > walletCapacityLocal) {
                                set(String(Math.floor(walletCapacityLocal)));
                              }
                              if (isMin && parseFloat(val) < Math.ceil(10 * localRate)) {
                                set(String(Math.ceil(10 * localRate)));
                              }
                            }}
                            placeholder={ph}
                            min={isMin ? Math.ceil(10 * localRate) : 1}
                            max={isMax && isSellSide && walletCapacityLocal > 0 ? Math.floor(walletCapacityLocal) : undefined}
                            className="w-full pl-8 pr-3 py-3 border-2 rounded-xl text-sm font-bold focus:outline-none"
                            style={{ borderColor: hasError ? C.danger : val ? C.green : C.g200, color: C.forest }} />
                        </div>
                        {val && effectiveRate > 0 && (
                          <p className="text-xs mt-0.5 font-semibold" style={{ color: hasError ? C.danger : C.g400 }}>
                            ≈ {assetSymbol}{(parseFloat(val) / effectiveRate).toFixed(assetDecimals)}
                            <span className="ml-1">(${fmt(parseFloat(val) / localRate, 0)} USD)</span>
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>

                {minLimit && minUSDVal < 10 && (
                  <div className="flex items-center gap-2 p-2.5 rounded-xl" style={{ backgroundColor: `${C.danger}10` }}>
                    <AlertTriangle size={13} style={{ color: C.danger }} />
                    <p className="text-xs font-semibold" style={{ color: C.danger }}>
                      Minimum must be at least $10 USD — that's {sym}{fmt(10 * localRate, 0)} {cur} in your currency.
                    </p>
                  </div>
                )}
                {offerType === 'sell' && maxLimit && walletCapacityLocal > 0 && parseFloat(maxLimit) > walletCapacityLocal && (
                  <div className="flex items-center gap-2 p-2.5 rounded-xl" style={{ backgroundColor: `${C.danger}10` }}>
                    <AlertTriangle size={13} style={{ color: C.danger }} />
                    <p className="text-xs font-semibold" style={{ color: C.danger }}>
                      Maximum ({sym}{fmt(parseFloat(maxLimit), 0)}) exceeds your wallet balance of {sym}{fmt(walletCapacityLocal, 0)} {cur}.
                      Your maximum has been auto-corrected on blur.
                    </p>
                  </div>
                )}
                {minLimit && maxLimit && parseFloat(maxLimit) < parseFloat(minLimit) && (
                  <div className="flex items-center gap-2 p-2.5 rounded-xl" style={{ backgroundColor: `${C.danger}10` }}>
                    <AlertTriangle size={13} style={{ color: C.danger }} />
                    <p className="text-xs font-semibold" style={{ color: C.danger }}>Maximum must be higher than minimum</p>
                  </div>
                )}
                {maxExceedsWallet && (
                  <div className="flex items-start gap-2 p-2.5 rounded-xl" style={{ backgroundColor: '#FFFBEB', border: '1px solid #FDE68A' }}>
                    <span className="flex items-center" style={{ flexShrink: 0, marginTop: 1 }}><Lightbulb size={16} style={{ color: '#F59E0B' }} /></span>
                    <p className="text-xs font-semibold" style={{ color: '#92400E' }}>
                      Your limit exceeds your current wallet balance — that's OK! You can create the offer now and your BTC will be locked only when a buyer opens a trade.
                    </p>
                  </div>
                )}

                {minLimit && maxLimit && curr && parseFloat(maxLimit) >= parseFloat(minLimit) && (
                  <div className="p-3 rounded-xl space-y-1.5" style={{ backgroundColor: C.mist, width: '100%', boxSizing: 'border-box' }}>
                    <p className="text-xs font-bold mb-1 flex items-center gap-1.5" style={{ color: C.forest }}>
                      <Megaphone size={13} /> Offer card preview:
                    </p>
                    {[
                      { label: 'Range', val: `${sym}${fmt(parseFloat(minLimit))} – ${sym}${fmt(parseFloat(maxLimit))} ${cur}` },
                      { label: 'USD', val: `$${fmt(parseFloat(minLimit) / localRate, 0)} – $${fmt(parseFloat(maxLimit) / localRate, 0)}` },
                      { label: 'Rate', val: `${sym}${fmt(effectiveRate, 0)} ${cur}/${assetLabel}` },
                    ].map(({ label, val }) => (
                      <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <span className="text-xs" style={{ color: C.g500, flexShrink: 0 }}>{label}</span>
                        <span className="text-xs font-bold" style={{ color: C.g800, textAlign: 'right', wordBreak: 'break-all' }}>{val}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Time limit */}
              <div className="p-3 rounded-2xl border-2 space-y-3" style={{ borderColor: C.g200, width: '100%', boxSizing: 'border-box' }}>
                <h3 className="font-bold text-sm flex items-center gap-2" style={{ color: C.forest }}>
                  <Clock size={14} style={{ color: C.green }} /> Payment Window
                </h3>
                <p className="text-xs" style={{ color: C.g500 }}>
                  How long your trade partner has to send payment before the trade auto-cancels.
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {TIME_LIMITS.map(t => (
                    <button key={t} onClick={() => setTimeLimit(t)}
                      className="py-2.5 rounded-xl font-bold text-sm transition border-2"
                      style={{
                        borderColor: timeLimit === t ? C.green : C.g200,
                        backgroundColor: timeLimit === t ? C.green : C.white,
                        color: timeLimit === t ? C.white : C.g600,
                      }}>
                      {t}<span className="text-xs font-bold ml-0.5">m</span>
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2 p-3 rounded-xl" style={{ backgroundColor: `${C.success}10` }}>
                  <Clock size={13} style={{ color: C.success }} />
                  <p className="text-xs" style={{ color: C.g700 }}>
                    Trade partner has <strong>{timeLimit} minutes</strong> to pay after opening the trade.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ━━ STEP 5: Instructions + Review ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
          {step === 5 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-xl font-bold mb-0.5" style={{ color: C.forest }}>Instructions & Review</h2>
                <p className="text-xs" style={{ color: C.g500 }}>Add trade instructions then publish your offer.</p>
              </div>

              <div>
                <label className="block text-sm font-bold mb-0.5" style={{ color: C.g700 }}>
                  Trade Instructions <span className="text-xs font-normal" style={{ color: C.g400 }}>(recommended)</span>
                </label>
                <p className="text-xs mb-2" style={{ color: C.g500 }}>
                  {offerType === 'sell' ? 'Tell buyers exactly how to pay you — MoMo number, bank details, etc.' :
                    offerType === 'buy' ? 'Tell sellers how you will send payment and what info you need.' :
                      offerType === 'gc_buy' ? 'Tell gift card sellers how to send you the code and redemption steps.' :
                        'Tell buyers how you will deliver the gift card code once payment is confirmed.'}
                </p>
                <textarea value={instructions} onChange={e => setInstructions(e.target.value)} rows={3}
                  placeholder={
                    offerType === 'sell'
                      ? 'e.g. Send MTN MoMo to: 024-XXX-XXXX (Your Name). Include your username as reference. Send screenshot.'
                      : offerType === 'buy'
                        ? 'e.g. I will pay via MTN MoMo within 10 minutes. Share your number when trade starts.'
                        : offerType === 'gc_sell'
                          ? 'e.g. I will send the code and PIN photo once payment is confirmed. Code will be unused and unredeemed.'
                          : 'e.g. Send gift card code and PIN photo. Code must be unused and unredeemed.'
                  }
                  className="w-full px-4 py-3 border-2 rounded-xl text-sm focus:outline-none resize-none"
                  style={{ borderColor: instructions ? C.green : C.g200 }} />
              </div>

              <div>
                <label className="block text-sm font-bold mb-0.5" style={{ color: C.g700 }}>
                  Offer Terms <span className="text-xs font-normal" style={{ color: C.g400 }}>(optional)</span>
                </label>
                <textarea value={terms} onChange={e => setTerms(e.target.value)} rows={2}
                  placeholder="e.g. Verified traders only. No partial payments. Must confirm trade details before starting."
                  className="w-full px-4 py-3 border-2 rounded-xl text-sm focus:outline-none resize-none"
                  style={{ borderColor: terms ? C.green : C.g200 }} />
              </div>

              {/* Full review + market card preview */}
              <div className="rounded-2xl overflow-hidden border" style={{ borderColor: C.g200, width: '100%', boxSizing: 'border-box' }}>
                <div className="px-4 py-3 flex items-center gap-2"
                  style={{ background: `linear-gradient(135deg,${C.forest},${C.mint})` }}>
                  <Eye size={14} className="text-white" />
                  <p className="text-sm font-bold text-white">Offer Preview</p>
                </div>

                <div className="p-3 bg-white space-y-4">
                  {/* Details list */}
                  <div className="space-y-1">
                    {[
                      { label: 'Type', val: OFFER_TYPES.find(o => o.id === offerType)?.title },
                      ...(isGC ? [
                        { label: 'Brand', val: gcBrand },
                        { label: 'Card Type', val: gcCardType === 'physical' ? 'Physical' : gcCardType === 'ecode' ? 'E-Code' : 'Physical & E-Code' },
                        { label: 'Range', val: gcCardValues.length ? gcCardValues.map(v => `$${v}`).join(', ') : '—' },
                      ] : []),
                      { label: 'Country', val: curr ? `${curr.flag} ${curr.name}` : '—' },
                      { label: 'Currency', val: curr ? `${curr.symbol} ${curr.currency}` : '—' },
                      { label: 'Payment', val: selectedPay?.name || '—' },
                      { label: 'Rate', val: curr ? `${sym}${fmt(effectiveRate, 0)} ${cur}/${assetLabel}` : '—' },
                      { label: 'Margin', val: pricingType === 'market' ? `${margin > 0 ? '+' : ''}${margin}%` : 'Fixed' },
                      ...(!isGC ? [
                        {
                          label: 'Limits', val: minLimit && maxLimit && curr
                            ? `${sym}${fmt(parseFloat(minLimit))} – ${sym}${fmt(parseFloat(maxLimit))} ${cur}`
                            : '—'
                        },
                      ] : []),
                      { label: 'Window', val: `${timeLimit} min` },
                    ].map(({ label, val }) => (
                      <div key={label} style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                        paddingTop: 4, paddingBottom: 4, borderBottom: `1px solid ${C.g100}`
                      }}>
                        <span className="text-xs flex-shrink-0" style={{ color: C.g500 }}>{label}</span>
                        <span className="text-xs font-bold" style={{ color: C.g800, textAlign: 'right', wordBreak: 'break-all' }}>{val}</span>
                      </div>
                    ))}
                  </div>

                  {/* Market card preview — full width on mobile */}
                  <div>
                    <p className="text-xs font-bold uppercase mb-2" style={{ color: C.g400 }}>Market Card Preview</p>
                    <div style={{ maxWidth: '100%', overflowX: 'hidden' }}>
                      <MarketCardPreview />
                    </div>
                  </div>
                </div>
              </div>

              {/* Publish warning */}
              <div className="p-3.5 rounded-2xl flex items-start gap-2.5"
                style={{ backgroundColor: `${C.gold}12`, border: `1px solid ${C.gold}30` }}>
                <Info size={13} style={{ color: C.amber, flexShrink: 0, marginTop: 1 }} />
                <p className="text-xs leading-relaxed" style={{ color: C.g700 }}>
                  Your offer goes live immediately after publishing. You can edit or pause it anytime from your dashboard.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* ── Navigation ──────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 10, width: '100%', boxSizing: 'border-box', marginTop: 24 }}>
          {dupOfferWarning && (
            <div style={{
              width: '100%', marginBottom: 10, padding: '12px 14px',
              borderRadius: 12, backgroundColor: '#FFF7ED',
              border: '1.5px solid #FDE68A', display: 'flex', flexDirection: 'column', gap: 8,
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <AlertTriangle size={15} style={{ color: '#D97706', flexShrink: 0, marginTop: 1 }} />
                <div>
                  <p style={{ fontWeight: 800, fontSize: 13, color: '#92400E', margin: 0 }}>
                    {dupOfferWarning.status === 'PAUSED' ? 'You have a paused offer for this payment method' : 'You already have an active offer for this payment method'}
                  </p>
                  <p style={{ fontSize: 12, color: '#B45309', margin: '4px 0 0' }}>
                    {dupOfferWarning.status === 'PAUSED'
                      ? 'Go to your Dashboard and activate your existing offer instead of creating a duplicate. One payment method per market is the rule.'
                      : 'Go to your Dashboard and edit your existing offer instead of creating a duplicate. One payment method per market is the rule.'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => navigate('/dashboard')}
                style={{
                  alignSelf: 'flex-start', padding: '7px 14px', borderRadius: 8,
                  backgroundColor: '#D97706', color: '#fff', fontWeight: 800,
                  fontSize: 12, border: 'none', cursor: 'pointer',
                }}>
                Go to Dashboard →
              </button>
            </div>
          )}
          {step > 1 && (
            <button onClick={back}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '14px 18px',
                borderRadius: 14, fontWeight: 700, fontSize: 14, border: `2px solid ${C.g200}`,
                color: C.g600, background: C.white, cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap',
              }}>
              <ChevronLeft size={16} />Back
            </button>
          )}
          <button
            onClick={step < 5 ? next : handleSubmit}
            disabled={!canNext() || submitting}
            style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              padding: '14px 12px', borderRadius: 14, fontWeight: 900, fontSize: 14,
              backgroundColor: canNext() ? C.green : C.g300, color: C.white,
              border: 'none', cursor: canNext() ? 'pointer' : 'not-allowed', opacity: submitting ? 0.7 : 1,
              transition: 'opacity 0.15s',
            }}>
            {submitting
              ? <><RefreshCw size={16} className="animate-spin" />Publishing…</>
              : step < 5
                ? <>Continue <ChevronRight size={16} /></>
                : <><Rocket size={16} />Publish Offer</>}
          </button>
        </div>

        {/* Security note */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 12, paddingBottom: 24 }}>
          <Shield size={12} style={{ color: C.g400, flexShrink: 0 }} />
          <p style={{ fontSize: 11, color: C.g400, textAlign: 'center', margin: 0 }}>
            All trades escrow-protected · 0.5% fee on completed trades only
          </p>
        </div>
      </div>

      {showDepositModal && (
        <DepositSecurityModal
          walletUsdt={walletBal.usdt}
          onClose={() => setShowDepositModal(false)}
          onLock={lockDeposit}
          loading={depositLoading}
          error={depositError}
          pending={depositStatus?.pending_admin_approval === true}
        />
      )}
    </div>
  );
}