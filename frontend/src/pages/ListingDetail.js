import { useState, useEffect, useCallback } from 'react';
import { useRates } from '../contexts/RatesContext';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { ArrowRight, BadgeCheck, RefreshCw, Lock, ChevronRight, ThumbsUp, ThumbsDown, Repeat2,
  Gift, CircleDollarSign, Smartphone, Landmark, CreditCard, Satellite, Search, Zap, Star,
  Mail, Fingerprint, CheckCircle, Info, Video, Scale, AlertTriangle, MessageSquare, Send, ShieldCheck } from 'lucide-react';
import { BadgeChip, SafetyBadge } from '../lib/badge';
import { toast } from 'react-toastify';
import CountryFlag, { resolveCode } from '../components/CountryFlag';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const C = {
  forest:'#1B4332', green:'#2D6A4F', mint:'#40916C', sage:'#52B788',
  gold:'#F4A422', mist:'#F0FAF5', white:'#FFFFFF',
  g50:'#F8FAFC', g100:'#F1F5F9', g200:'#E2E8F0',
  g300:'#CBD5E1', g400:'#94A3B8', g500:'#64748B',
  g600:'#475569', g700:'#334155', g800:'#1E293B',
  success:'#10B981', danger:'#EF4444', online:'#22C55E',
  warn:'#F59E0B', paid:'#3B82F6', teal:'#0D9488',
};



// USD_RATES is now provided by RatesContext — do NOT define a static object here
const CUR_SYM   = {GHS:'₵',NGN:'₦',KES:'KSh',ZAR:'R',UGX:'USh',TZS:'TSh',USD:'$',GBP:'£',EUR:'€',XAF:'CFA',XOF:'CFA'};
const fmt    = (n,d=0) => new Intl.NumberFormat('en-US',{minimumFractionDigits:0,maximumFractionDigits:d}).format(n||0);
const fmtBtc = n => parseFloat(n||0).toFixed(8);

function fmtAge(d) {
  if (!d) return '—';
  const s = (Date.now() - new Date(d)) / 1000;
  if (s < 300)   return 'Online';
  if (s < 3600)  return `${~~(s/60)}m ago`;
  if (s < 86400) return `${~~(s/3600)}h ago`;
  return `${~~(s/86400)}d ago`;
}

// Bulk marketplace responses cap out oversized avatar_url values (see server.js capAvatar) so
// this page can't just trust it's present — lazy-fetch from GET /api/users/:id/avatar when the
// listing/seller payload omitted it, same pattern as the Avatar component on BuyBitcoin.js and
// GiftCardMarketplace.js.
const _avatarCache = {}; // userId → Promise<url> | url-string | null
function Avatar({ user, size=48 }) {
  const [err, setErr] = useState(false);
  const [lazyUrl, setLazyUrl] = useState(null);
  useEffect(() => {
    const stored = user?.avatar_url;
    const id = user?.id;
    if (stored || !id || err) return;
    const hit = _avatarCache[id];
    if (hit instanceof Promise) { hit.then(v => { if (v) setLazyUrl(v); }); return; }
    if (hit !== undefined) { setLazyUrl(hit); return; }
    const p = axios.get(`${API_URL}/users/${id}/avatar`)
      .then(r => r.data?.avatar_url || null)
      .catch(() => null)
      .then(v => { _avatarCache[id] = v; if (v) setLazyUrl(v); return v; });
    _avatarCache[id] = p;
  }, [user?.id, user?.avatar_url, err]);
  const url = user?.avatar_url || lazyUrl;
  if (url && !err) return (
    <img src={url} alt={user.username||'user'} onError={()=>setErr(true)}
      className="object-cover flex-shrink-0 rounded-2xl" style={{width:size,height:size}}/>
  );
  return (
    <div className="flex-shrink-0 flex items-center justify-center font-black text-white rounded-2xl"
      style={{width:size,height:size,backgroundColor:C.green,fontSize:size*0.38}}>
      {(user?.username||'?').charAt(0).toUpperCase()}
    </div>
  );
}

function getListingConfig(listing) {
  const type  = listing?.listing_type||'';
  const brand = listing?.gift_card_brand||'';
  if (type.includes('GIFT')||brand) return { label:'Gift Card Trade', color:C.teal,  bg:'#CCFBF1', icon:<Gift size={14} className="inline-block" />, action:'Trade Gift Card' };
  if (type==='SELL'||type==='SELL_BITCOIN') return { label:'Buy Bitcoin', color:C.green, bg:C.mist,    icon:'₿',   action:'Buy BTC' };
  return { label:'Sell Bitcoin', color:'#D97706', bg:'#FFFBEB', icon:<CircleDollarSign size={14} className="inline-block" />, action:'Sell BTC' };
}

function pmLabel(raw) {
  const m = String(raw||'').toLowerCase();
  if (m.includes('mtn'))           return { icon:<Smartphone size={14} className="inline-block" />, label:raw||'MTN Mobile Money' };
  if (m.includes('vodafone'))      return { icon:<Smartphone size={14} className="inline-block" />, label:raw||'Vodafone Cash' };
  if (m.includes('mpesa')||m.includes('m-pesa')) return { icon:<Smartphone size={14} className="inline-block" />, label:raw||'M-Pesa' };
  if (m.includes('bank'))          return { icon:<Landmark size={14} className="inline-block" />, label:raw||'Bank Transfer' };
  if (m.includes('paypal'))        return { icon:<CircleDollarSign size={14} className="inline-block" />, label:raw||'PayPal' };
  if (m.includes('opay'))          return { icon:<CreditCard size={14} className="inline-block" />, label:'OPay' };
  if (m.includes('palmpay'))       return { icon:<CreditCard size={14} className="inline-block" />, label:'PalmPay' };
  return { icon:<CreditCard size={14} className="inline-block" />, label:raw||'Mobile Money' };
}

// Seed listing from the marketplace localStorage cache so the page renders
// immediately even when the backend is slow or returning 503.
function _seedFromCache(listingId) {
  try {
    const c = JSON.parse(localStorage.getItem('praqen_market_all') || 'null');
    if (!c?.data) return null;
    return c.data.find(l => l.id === listingId) || null;
  } catch { return null; }
}

export default function ListingDetail({ user }) {
  const { id }     = useParams();
  const navigate   = useNavigate();
  const { rates: USD_RATES, btcUsd: contextBtcUsd } = useRates();
  const _cached    = _seedFromCache(id);
  const [listing,    setListing]    = useState(_cached || null);
  const [seller,     setSeller]     = useState(_cached?.users || null);
  const [btcPrice,   setBtcPrice]   = useState(68000);
  const [loading,    setLoading]    = useState(!_cached);
  const [loadError,  setLoadError]  = useState(false);
  const [payAmt,          setPayAmt]          = useState('');
  const [submitting,      setSubmitting]      = useState(false);
  const [tradeError,      setTradeError]      = useState('');
  const [selectedGcRegion, setSelectedGcRegion] = useState(null);
  const [quote,             setQuote]             = useState(null);
  const [quoteFetching,     setQuoteFetching]     = useState(false);
  const [showSellerProfile, setShowSellerProfile] = useState(false);
  const [popupOpen,         setPopupOpen]         = useState(!!_cached);

  // Must be declared before the useEffect that depends on it
const loadAll = useCallback(async (isBackground = false) => {
  // When we already have a cached listing, fetch silently in the background
  // so the user always sees something immediately.
  const hasCached = !!listing;
  if (!hasCached) { setLoading(true); setLoadError(false); }
  try {
    const r = await axios.get(`${API_URL}/listings/${id}`, { timeout: 12000 });
    const offer = r.data.listing;
    setListing(offer);
    setLoadError(false);
    const sellerData = Array.isArray(offer?.users) ? offer.users[0] : (offer?.users || offer?.seller || null);
    if (sellerData) setSeller(sellerData);
    if (offer?.seller_id) {
      try {
        const sr = await axios.get(`${API_URL}/users/${offer.seller_id}`, { timeout: 8000 });
        const full = sr.data.user;
        if (full?.id) setSeller(full);
      } catch {}
    }
    const viewToken = localStorage.getItem('token');
    axios.post(`${API_URL}/listings/${id}/view`, {}, viewToken ? { headers: { Authorization: `Bearer ${viewToken}` } } : {}).catch(() => {});
  } catch (err) {
    const status = err?.response?.status;
    if (status === 404) {
      // Listing truly doesn't exist
      setListing(null);
      setLoadError(false);
    } else if (!hasCached) {
      // Only show the error screen if we have nothing to display
      setLoadError(true);
      const msg = !err.response
        ? (err.code === 'ECONNABORTED' || err.code === 'ERR_CANCELED')
          ? 'Server is busy. Please try again in a moment.'
          : 'No internet connection. Please check your network and try again.'
        : (status === 503)
          ? 'Server is temporarily busy. Please try again in a moment.'
          : `Could not load offer (${status || 'error'}). Please try again.`;
      toast.error(msg);
    }
    // If hasCached and error: silently keep showing the cached listing
  }
  finally { if (!hasCached) setLoading(false); }
}, [id, listing]); // eslint-disable-line react-hooks/exhaustive-deps

  // Slide up after listing loads
  useEffect(() => {
    if (!loading && listing) {
      const t = setTimeout(() => setPopupOpen(true), 80);
      return () => clearTimeout(t);
    }
  }, [loading, listing]);

  // Lock body scroll only while the bottom sheet is actually open
  useEffect(() => {
    document.body.style.overflow = popupOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [popupOpen]);

  const isOwner = user && listing && user.id === listing.seller_id;

  useEffect(() => { if (contextBtcUsd > 0) setBtcPrice(contextBtcUsd); }, [contextBtcUsd]);
  useEffect(() => { loadAll(); }, [loadAll]);
  useEffect(() => { setSelectedGcRegion(null); }, [id]);

  // Debounce quote fetch whenever the user changes the amount
  useEffect(() => {
    const num = parseFloat(payAmt) || 0;
    if (!listing || num <= 0) { setQuote(null); return; }
    const t = setTimeout(async () => {
      setQuoteFetching(true);
      try {
        const r = await axios.post(`${API_URL}/quotes`, { listingId: listing.id || id });
        setQuote({ quoteId: r.data.quoteId, executableRate: r.data.executableRate, expiresAt: Date.now() + r.data.expiresIn * 1000 });
      } catch { setQuote(null); }
      finally { setQuoteFetching(false); }
    }, 500);
    return () => clearTimeout(t);
  }, [payAmt, listing?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{backgroundColor:C.mist}}>
      <div className="text-center">
        <div className="w-12 h-12 border-4 rounded-full animate-spin mx-auto mb-4" style={{borderColor:C.sage,borderTopColor:'transparent'}}/>
        <p className="text-sm font-bold" style={{color:C.g500}}>Loading offer…</p>
      </div>
    </div>
  );
  if (loadError) return (
    <div className="min-h-screen flex items-center justify-center" style={{backgroundColor:C.mist}}>
      <div className="text-center px-6">
        <Satellite size={48} className="mx-auto mb-3" style={{ color: C.g400 }} />
        <p className="font-black text-sm mb-2" style={{color:C.g800}}>Could not load offer</p>
        <p className="text-xs mb-4" style={{color:C.g500}}>Server may be busy. Please tap Try Again.</p>
        <button onClick={loadAll} className="px-6 py-2.5 rounded-xl text-white font-bold text-sm mr-2" style={{backgroundColor:C.green}}>Try Again</button>
        <button onClick={()=>navigate(-1)} className="px-5 py-2.5 rounded-xl font-bold text-sm border-2" style={{color:C.g600,borderColor:C.g200}}>Go Back</button>
      </div>
    </div>
  );
  if (!listing) return (
    <div className="min-h-screen flex items-center justify-center" style={{backgroundColor:C.mist}}>
      <div className="text-center">
        <Search size={48} className="mx-auto mb-3" style={{ color: C.g400 }} />
        <p className="font-black text-sm mb-3" style={{color:C.g800}}>Listing not found</p>
        <button onClick={()=>navigate('/buy-bitcoin')} className="px-5 py-2 rounded-xl text-white font-bold text-sm" style={{backgroundColor:C.green}}>Browse Offers</button>
      </div>
    </div>
  );

  // ── Derived values ──────────────────────────────────────────────────────────
  const isGiftCard = listing.listing_type?.toUpperCase().includes('GIFT');
  // BUY listing = visitor is selling their BTC → they RECEIVE fiat, PAY BTC
  // SELL listing = visitor is buying BTC → they PAY fiat, RECEIVE BTC
  const isVisitorSelling = !isGiftCard && (listing.listing_type === 'BUY' || listing.listing_type === 'BUY_BITCOIN');

  // Theme colours — amber for sell flow, forest-green for buy flow
  const T = isVisitorSelling ? {
    primary:  '#D97706',
    dark:     '#B45309',
    grad:     'linear-gradient(135deg, #D97706, #F59E0B)',
    mist:     '#FFFBEB',
    border:   '#FDE68A60',
    shadow:   'rgba(180,83,9,0.30)',
    shadowLg: 'rgba(180,83,9,0.40)',
  } : {
    primary:  C.forest,
    dark:     C.green,
    grad:     `linear-gradient(135deg, ${C.forest}, ${C.green})`,
    mist:     C.mist,
    border:   `${C.sage}60`,
    shadow:   'rgba(27,67,50,0.25)',
    shadowLg: 'rgba(27,67,50,0.40)',
  };

  const gcCurrencies = Array.isArray(listing.gift_card_currencies) ? listing.gift_card_currencies : [];
  const cur      = selectedGcRegion ? selectedGcRegion.currency : (listing.currency || 'USD');
  const sym      = selectedGcRegion ? (selectedGcRegion.symbol || CUR_SYM[cur] || '$') : (listing.currency_symbol || CUR_SYM[listing.currency || 'USD'] || '$');
  const usdRate  = USD_RATES[cur] || 1;
  const margin   = parseFloat(listing.margin || 0);

  // Logic Sync: Calculate base price exactly as backend quotes endpoint should.
  // If fixed, use the fixed price. If market, use live btcPrice — but only for BTC-asset
  // listings. A USDT-asset listing's "price" is ~$1 (the peg), not the BTC/USD rate; using
  // btcPrice unconditionally here made every USDT trade's amount come out ~88,000x too small
  // (e.g. a real $50 trade computing as 0.0006 USDT instead of $50 USDT), and the `> 100`
  // fixed-price sanity check — a valid heuristic for BTC, always tens of thousands — silently
  // rejected any legitimate USDT fixed price (which is necessarily close to 1).
  const isUsdtAsset      = listing.asset === 'USDT';
  const basePriceUSD    = isUsdtAsset
    ? ((listing.pricing_type === 'fixed' && parseFloat(listing.bitcoin_price || 0) > 0)
        ? parseFloat(listing.bitcoin_price)
        : 1)
    : ((listing.pricing_type === 'fixed' && parseFloat(listing.bitcoin_price||0) > 100)
        ? parseFloat(listing.bitcoin_price)
        : btcPrice);
  
  const sellerRateUSD   = basePriceUSD * (1 + margin / 100);
  const sellerRateLocal = sellerRateUSD * usdRate;

  const minLocal = listing.min_limit_local || (listing.min_limit_usd ? listing.min_limit_usd * usdRate : 10 * usdRate);
  const rawMaxLocal = listing.max_limit_local
    || (listing.max_limit_usd ? listing.max_limit_usd * usdRate : 1000 * usdRate);
  // effective_max_usd reflects the seller's live wallet capacity for balance-capped listing
  // types (SELL / SELL_BITCOIN / BUY_GIFT_CARD). It must actually cap maxLocal here — previously
  // `listing.max_limit_local || (...)` short-circuited past this whenever max_limit_local was
  // set (i.e. always), so the amount input silently allowed more than the seller could deliver
  // and the trade only failed after submit.
  const maxLocal = listing.effective_max_usd
    ? Math.min(rawMaxLocal, listing.effective_max_usd * usdRate)
    : rawMaxLocal;
  // Compare against the seller's balance in whatever asset this listing is actually
  // denominated in — a USDT offer's seller can hold $0 BTC and still easily cover it.
  const sellerHasLowBalance = listing.asset === 'USDT'
    ? listing.seller_balance_usdt !== undefined && listing.seller_balance_usdt < (listing.min_limit_usd || 10)
    : listing.seller_balance_btc !== undefined && listing.seller_balance_btc < (listing.min_limit_usd || 10) / (listing.bitcoin_price || 88000);
  // Backend flags this when the seller's live balance can't cover the listing's own minimum —
  // in that case maxLocal can end up below minLocal (e.g. MIN $50 / MAX $10), which is untradeable.
  const sellerCantFulfillMin = listing.seller_can_fulfill_min === false || maxLocal < minLocal;

  const payAmtNum = parseFloat(payAmt) || 0;

  // Use the frozen quote rate when available; fall back to live rate for preview if no quote yet
  const activeRate   = quote ? quote.executableRate : sellerRateLocal;

  const btcGross    = payAmtNum > 0 && activeRate > 0 ? payAmtNum / activeRate : 0;
  // Preview only — matches the real fee tradeEscrowService applies at release
  // (1% on Buy/Sell, 2% on gift cards). This used to be a flat 0.995 regardless
  // of trade type, which under-stated the fee shown to buyers.
  const previewFeeRate = isGiftCard ? 0.02 : 0.01;
  const btcAfterFee = btcGross * (1 - previewFeeRate);

  // CORRECT fiat equivalent calculation: localAmount / (1 + margin/100)
  const fiatEquivalent = payAmtNum > 0 ? payAmtNum / (1 + margin / 100) : 0;

  const pm       = pmLabel(listing.payment_method || (Array.isArray(listing.payment_methods) ? listing.payment_methods[0] : ''));
  const pmRaw    = listing.payment_method || (Array.isArray(listing.payment_methods) ? listing.payment_methods[0] : '') || '';

  const trades         = parseInt(seller?.total_trades || 0);
  const lastSeen       = fmtAge(seller?.last_seen_at || seller?.last_login || seller?.updated_at);
  const isOnline       = seller?.last_seen_at && (Date.now() - new Date(seller.last_seen_at)) / 1000 < 300;
  const posFeedback    = parseInt(seller?.positive_feedback || 0);
  const negFeedback    = parseInt(seller?.negative_feedback || 0);
  const totalFeedback  = parseInt(seller?.total_feedback_count || posFeedback + negFeedback || 0);
  const rating         = parseFloat(seller?.average_rating || 0);
  const responseTime   = seller?.avg_response_time || '<1m';
  const hasPhone       = !!(seller?.is_phone_verified);
  const hasEmail       = !!(seller?.is_email_verified);
  const hasKyc         = !!(seller?.is_id_verified || seller?.kyc_verified);
  const accountAge     = seller?.created_at ? Math.floor((Date.now() - new Date(seller.created_at)) / 86400000) : 0;
  const blocksRcvd     = parseInt(seller?.blocked_by_count || 0);
  const dbTrustScore   = parseInt(seller?.trust_score || 0);
  const trustScore     = dbTrustScore > 0 ? dbTrustScore
    : Math.min(100, (hasEmail?25:0) + (hasPhone?25:0) + (hasKyc?25:0) + Math.min(25, Math.floor(trades/20)*5));
  const sellerCountryCode = resolveCode(seller?.country_code || seller?.country || seller?.location);


  const handleStartTrade = async () => {
    setTradeError('');
    if (!user)                           { toast.info('Please login to start trading'); navigate('/login'); return; }
    if (isOwner)                         { toast.info('This is your listing'); return; }
    if (isGiftCard && gcCurrencies.length > 0 && !selectedGcRegion) { setTradeError('Please select your card region to continue.'); return; }
    if (!payAmt || payAmtNum <= 0)       { setTradeError('Please enter an amount to trade.'); return; }
    if (payAmtNum < minLocal)            { setTradeError(`Minimum is ${sym}${fmt(minLocal)}.`); return; }
    if (payAmtNum > maxLocal)            { setTradeError(`Maximum is ${sym}${fmt(maxLocal)}.`); return; }
    if (btcGross <= 0 || !isFinite(btcGross)) { setTradeError('Invalid amount — please try again.'); return; }

    setSubmitting(true);
    try {
      const token = localStorage.getItem('token');
      if (!token) { navigate('/login?message=Please log in to trade'); return; }

      let activeQuote = (quote && Date.now() < quote.expiresAt) ? quote : null;
      if (!activeQuote) {
        try {
          const qr = await axios.post(`${API_URL}/quotes`, { listingId: listing.id || id }, { timeout: 10000 });
          activeQuote = { quoteId: qr.data.quoteId, executableRate: qr.data.executableRate, expiresAt: Date.now() + qr.data.expiresIn * 1000 };
          setQuote(activeQuote);
        } catch(qe) {
          if (!qe.response) {
            // True network error — can't reach server at all
            setTradeError('No internet connection. Please check your network and try again.');
            return;
          }
          // Server-side quote failure — backend has a fallback rate path, proceed without a locked quote
          console.warn('[Trade] Quote fetch failed, proceeding with live rate fallback:', qe.response?.data?.error);
          activeQuote = null;
        }
      }

      // Submit the GROSS BTC amount — no fee pre-deduction here. The platform
      // fee (1% Buy/Sell, 2% gift cards) is applied exactly once, at release,
      // by tradeEscrowService.js. Regular Buy/Sell trades get this value
      // re-verified server-side anyway, but gift card trades use it as-is, so
      // deducting a fee here as well used to double-charge gift card trades.
      const lockedBtcGross = activeQuote ? payAmtNum / activeQuote.executableRate : btcGross;

      const r = await axios.post(`${API_URL}/trades`, {
        listingId:        listing.id || id,
        quoteId:          activeQuote?.quoteId || null,
        amountBtc:        parseFloat(lockedBtcGross.toFixed(8)),
        amountLocal:      payAmtNum,
        currency:         cur,
        currencySymbol:   sym,
        paymentMethod:    pmRaw,
        trade_type:       (listing.listing_type === 'SELL' || listing.listing_type === 'SELL_GIFT_CARD') ? 'BUY' : 'SELL',
        sellerRateLocal:  parseFloat((activeQuote?.executableRate || sellerRateLocal).toFixed(2)),
        sellerRateUsd:    parseFloat(sellerRateUSD.toFixed(2)),
        gc_region:        selectedGcRegion ? selectedGcRegion.region : null,
      }, { headers: { Authorization: `Bearer ${token}` }, timeout: 60000 });

      const tradeData = r.data.trade || r.data;
      const tradeId   = tradeData?.id || tradeData?.trade?.id;
      if (tradeId) {
        toast.success('Trade opened! BTC locked in escrow.');
        navigate(`/trade/${tradeId}`);
      } else {
        setTradeError('Trade was created but we could not navigate to it. Check My Trades.');
      }
    } catch(e) {
      const msg = e.response?.data?.error || e.message || 'Failed to create trade — please try again.';
      setTradeError(msg);
      toast.error(msg);
    } finally { setSubmitting(false); }
  };

  return (
    <div style={{ fontFamily: "'DM Sans',sans-serif", minHeight: '100vh', background: `linear-gradient(160deg, #061208 0%, #0f2318 50%, #1B4332 100%)` }}>
      {/* Styles */}
      <style>{`
        * { box-sizing: border-box; }

        .prq-backdrop {
          position: fixed;
          top: 0; left: 0;
          width: 100%; height: 100%;
          z-index: 100;
          background: rgba(5, 18, 10, 0.45);
          backdrop-filter: blur(3px);
          -webkit-backdrop-filter: blur(3px);
          transition: opacity 0.3s ease;
        }

        /* ── MOBILE first — full-width bottom sheet ── */
        .prq-sheet {
          position: fixed;
          bottom: 0;
          left: 0;
          width: 100%;
          z-index: 101;
          height: 88vh;
          display: flex;
          flex-direction: column;
          border-radius: 20px 20px 0 0;
          background: #f1f5f2;
          box-shadow: 0 -8px 40px rgba(0,0,0,0.3);
          transition: transform 0.4s cubic-bezier(0.32,0.72,0,1);
          overflow: hidden;
        }
        .prq-sheet.open   { transform: translateY(0); }
        .prq-sheet.closed { transform: translateY(100%); }

        .prq-sheet-scroll {
          flex: 1;
          overflow-y: auto;
          -webkit-overflow-scrolling: touch;
          overscroll-behavior: contain;
          padding: 6px 16px 32px;
        }
        .prq-sheet-scroll::-webkit-scrollbar { display: none; }
        .prq-sheet-scroll { -ms-overflow-style: none; scrollbar-width: none; }

        /* ── TABLET & DESKTOP ── */
        @media (min-width: 640px) {
          .prq-sheet {
            top: 50%;
            left: 50%;
            bottom: auto;
            width: 92%;
            max-width: 500px;
            height: auto;
            max-height: 88vh;
            border-radius: 24px;
            box-shadow: 0 24px 80px rgba(0,0,0,0.45);
            transition: transform 0.35s cubic-bezier(0.32,0.72,0,1), opacity 0.3s ease;
          }
          .prq-sheet.open   { transform: translate(-50%, -50%) scale(1);    opacity: 1; }
          .prq-sheet.closed { transform: translate(-50%, -46%) scale(0.95); opacity: 0; }
          .prq-sheet-scroll { padding: 6px 20px 32px; }
        }
      `}</style>

      {/* Backdrop — semi-transparent so marketplace shows through */}
      <div
        className="prq-backdrop"
        style={{ opacity: popupOpen ? 1 : 0, pointerEvents: popupOpen ? 'auto' : 'none' }}
        onClick={() => navigate(-1)}
      />

      {/* Sheet */}
      <div className={`prq-sheet ${popupOpen ? 'open' : 'closed'}`}>

        {/* Drag handle — fixed, never scrolls */}
        <div style={{ padding: '10px 0 4px', display: 'flex', justifyContent: 'center', flexShrink: 0, background: '#f1f5f2' }}>
          <div style={{ width: 34, height: 4, borderRadius: 4, background: '#c4d0ca' }} />
        </div>

        {/* Scrollable content */}
        <div className="prq-sheet-scroll">

        {/* ── Back button ── */}
        <button onClick={() => navigate(-1)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: C.g500, fontSize: 13, fontWeight: 700, marginBottom: 20, padding: 0 }}>
          <ChevronRight size={14} style={{ transform: 'rotate(180deg)' }} /> Back
        </button>

        {/* ── Seller card ── */}
        <div style={{ background: '#fff', borderRadius: 18, marginBottom: 14, border: `1px solid ${C.g200}`, overflow: 'hidden', boxShadow: '0 2px 12px rgba(27,67,50,0.06)' }}>

          {/* Header bar */}
          <div style={{ background: T.grad, padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: 'rgba(255,255,255,0.7)', letterSpacing: 1 }}>{isVisitorSelling ? 'BUYER' : 'SELLER'}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 800, color: isOnline ? '#6EE7B7' : 'rgba(255,255,255,0.5)' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: isOnline ? '#6EE7B7' : 'rgba(255,255,255,0.3)', display: 'inline-block' }} />
              {isOnline ? 'Online Now' : `Seen ${lastSeen}`}
            </span>
          </div>

          {/* Avatar + name */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px 12px' }}>
            <button onClick={() => setShowSellerProfile(true)}
              style={{ position: 'relative', flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
              <Avatar user={seller} size={50} />
              <div style={{ position: 'absolute', bottom: 0, right: 0, width: 13, height: 13, borderRadius: '50%', border: '2px solid #fff', backgroundColor: isOnline ? C.online : C.g300 }} />
            </button>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
                <button onClick={() => setShowSellerProfile(true)}
                  style={{ fontSize: 15, fontWeight: 900, color: C.forest, background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1 }}>
                  {seller?.username || 'Seller'}
                </button>
                {seller?.kyc_verified && <BadgeCheck size={13} color={C.paid} />}
                <BadgeChip user={seller} />
                <SafetyBadge user={seller} size="xs" />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: C.g400, fontWeight: 600 }}>
                <CountryFlag countryCode={sellerCountryCode} className="w-4 h-3" />
                <span>{seller?.country || ''}</span>
              </div>
              {listing?.listing_type === 'SELL_GIFT_CARD' && listing?.seller_has_deposit && (
                <span title="Seller has locked a $200 security deposit — PRAQEN-approved"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 5, padding: '3px 8px', borderRadius: 6, fontSize: 10, fontWeight: 800, backgroundColor: '#DCFCE7', color: '#166534', border: '1px solid rgba(22,101,52,0.2)' }}>
                  <ShieldCheck size={11} /> S. Deposit
                </span>
              )}
            </div>

            {/* Tap to view profile */}
            <button onClick={() => setShowSellerProfile(true)}
              style={{ flexShrink: 0, fontSize: 10, fontWeight: 800, color: C.green, background: C.mist, border: `1px solid ${C.green}30`, borderRadius: 20, padding: '5px 10px', cursor: 'pointer' }}>
              View Profile
            </button>
          </div>

          {/* Stats strip */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', borderTop: `1px solid ${C.g100}` }}>
            <div style={{ padding: '10px 8px', textAlign: 'center', borderRight: `1px solid ${C.g100}`, background: '#fff' }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:4, fontSize:13, fontWeight:900, color:C.forest, marginBottom:2 }}>
                <Repeat2 size={12} strokeWidth={2.5}/>{fmt(trades)}
              </div>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.g400, textTransform: 'uppercase', letterSpacing: 0.5 }}>Trades</div>
            </div>
            <div style={{ padding: '10px 8px', textAlign: 'center', borderRight: `1px solid ${C.g100}`, background: C.g50 }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:4, fontSize:12, fontWeight:900, marginBottom:2 }}>
                <span style={{ display:'inline-flex', alignItems:'center', gap:2, color:'#16A34A' }}><ThumbsUp size={10} strokeWidth={2.5}/>{posFeedback}</span>
                <span style={{ color:C.g300 }}>·</span>
                <span style={{ display:'inline-flex', alignItems:'center', gap:2, color:'#DC2626' }}><ThumbsDown size={10} strokeWidth={2.5}/>{negFeedback}</span>
              </div>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.g400, textTransform: 'uppercase', letterSpacing: 0.5 }}>Feedback</div>
            </div>
            <div style={{ padding: '10px 8px', textAlign: 'center', background: '#fff' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, fontSize: 13, fontWeight: 900, color: C.forest, marginBottom: 2 }}><Zap size={13} style={{ color: C.gold }} />{responseTime}</div>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.g400, textTransform: 'uppercase', letterSpacing: 0.5 }}>Response</div>
            </div>
          </div>
        </div>

        {/* ── Seller profile popup ── */}
        {showSellerProfile && (
          <div onClick={() => setShowSellerProfile(false)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 999, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', backdropFilter:'blur(3px)' }}>
            <div onClick={e => e.stopPropagation()}
              style={{ background: '#fff', borderRadius: '22px 22px 0 0', width: '100%', maxWidth: 480, boxShadow: '0 -8px 50px rgba(0,0,0,0.22)', overflow: 'hidden', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>

              {/* Drag handle */}
              <div style={{ padding: '10px 0 4px', display:'flex', justifyContent:'center', flexShrink:0 }}>
                <div style={{ width:34, height:4, borderRadius:4, background:C.g200 }}/>
              </div>

              {/* Scrollable body */}
              <div style={{ overflowY:'auto', flex:1, WebkitOverflowScrolling:'touch' }}>

              {/* Header — green gradient */}
              <div style={{ background: `linear-gradient(135deg, ${C.forest}, ${C.mint})`, padding: '16px 16px 20px', position: 'relative' }}>
                {/* Avatar + online dot */}
                <div style={{ display:'flex', alignItems:'flex-start', gap:14 }}>
                  <div style={{ position:'relative', flexShrink:0 }}>
                    <Avatar user={seller} size={60} />
                    <div style={{ position:'absolute', bottom:1, right:1, width:14, height:14, borderRadius:'50%', border:'2.5px solid #fff', backgroundColor: isOnline ? C.online : C.g400 }}/>
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    {/* Name + KYC */}
                    <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap', marginBottom:5 }}>
                      <span style={{ fontSize:17, fontWeight:900, color:'#fff', lineHeight:1 }}>{seller?.username || 'Seller'}</span>
                      {hasKyc && <BadgeCheck size={15} color="#6EE7B7"/>}
                    </div>
                    {/* Badge + country flag */}
                    <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap', marginBottom:5 }}>
                      <BadgeChip user={seller}/>
                      <SafetyBadge user={seller} size="xs" />
                      {seller?.country && (
                        <div style={{ display:'flex', alignItems:'center', gap:3 }}>
                          <CountryFlag countryCode={sellerCountryCode} className="w-4 h-3"/>
                          <span style={{ fontSize:11, fontWeight:700, color:'rgba(255,255,255,0.75)' }}>{seller.country}</span>
                        </div>
                      )}
                    </div>
                    {/* Last seen + account age */}
                    <div style={{ fontSize:11, color: isOnline ? '#6EE7B7':'rgba(255,255,255,0.55)', fontWeight:700 }}>
                      {isOnline ? '● Online Now' : `Seen ${lastSeen}`}
                      {accountAge > 0 && <span style={{ marginLeft:8, color:'rgba(255,255,255,0.4)' }}>· Member {accountAge}d</span>}
                    </div>
                  </div>
                </div>

                {/* Rating bar */}
                {rating > 0 && (
                  <div style={{ marginTop:12, background:'rgba(255,255,255,0.12)', borderRadius:10, padding:'8px 12px', display:'flex', alignItems:'center', gap:8 }}>
                    <Star size={18} fill="currentColor" style={{ color: C.gold }} />
                    <div>
                      <span style={{ fontSize:18, fontWeight:900, color:'#fff', lineHeight:1 }}>{rating.toFixed(1)}</span>
                      <span style={{ fontSize:11, color:'rgba(255,255,255,0.6)', marginLeft:4, fontWeight:600 }}>/ 5.0 · {totalFeedback} reviews</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Stats strip — Trades / Feedback / Rating */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', borderBottom:`1px solid ${C.g100}` }}>
                <div style={{ padding:'12px 8px', textAlign:'center', borderRight:`1px solid ${C.g100}` }}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:4, fontSize:16, fontWeight:900, color:C.forest, marginBottom:2 }}>
                    <Repeat2 size={13} strokeWidth={2.5}/>{fmt(trades)}
                  </div>
                  <div style={{ fontSize:10, fontWeight:700, color:C.g400, textTransform:'uppercase', letterSpacing:0.5 }}>Trades</div>
                </div>
                <div style={{ padding:'12px 8px', textAlign:'center', borderRight:`1px solid ${C.g100}`, background:C.g50 }}>
                  <div style={{ fontSize:16, fontWeight:900, color:C.g800, marginBottom:3, lineHeight:1 }}>{totalFeedback}</div>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:5, marginBottom:3 }}>
                    <span style={{ display:'inline-flex', alignItems:'center', gap:2, fontSize:11, fontWeight:800, color:'#16A34A' }}>
                      <ThumbsUp size={9} strokeWidth={2.5}/>{posFeedback}
                    </span>
                    <span style={{ fontSize:10, color:C.g300 }}>·</span>
                    <span style={{ display:'inline-flex', alignItems:'center', gap:2, fontSize:11, fontWeight:800, color:'#DC2626' }}>
                      <ThumbsDown size={9} strokeWidth={2.5}/>{negFeedback}
                    </span>
                  </div>
                  <div style={{ fontSize:10, fontWeight:700, color:C.g400, textTransform:'uppercase', letterSpacing:0.5 }}>Feedback</div>
                </div>
                <div style={{ padding:'12px 8px', textAlign:'center' }}>
                  <div style={{ fontSize:16, fontWeight:900, color:C.forest, marginBottom:2, lineHeight:1 }}>
                    {rating > 0 ? rating.toFixed(1) : '—'}
                  </div>
                  <div style={{ fontSize:11, marginBottom:2, display:'flex', alignItems:'center', justifyContent:'center', gap:2 }}>
                    {Array.from({ length: Math.round(rating) }).map((_, i) => (
                      <Star key={i} size={11} fill="currentColor" style={{ color: C.gold }} />
                    ))}
                  </div>
                  <div style={{ fontSize:10, fontWeight:700, color:C.g400, textTransform:'uppercase', letterSpacing:0.5 }}>Rating</div>
                </div>
              </div>

              {/* Verification list */}
              <div style={{ padding:'14px 16px', borderBottom:`1px solid ${C.g100}` }}>
                <p style={{ fontSize:10, fontWeight:800, color:C.g500, textTransform:'uppercase', letterSpacing:0.8, marginBottom:10, margin:'0 0 10px' }}>Verification</p>
                <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                  {[
                    { label:'Phone',  ok:hasPhone,  icon:<Smartphone size={16} />,  yes:'Verified',    no:'Not verified' },
                    { label:'Email',  ok:hasEmail,  icon:<Mail size={16} />,      yes:'Verified',    no:'Not verified' },
                    { label:'KYC ID', ok:hasKyc,    icon:<Fingerprint size={16} />,    yes:'100% Verified', no:'Not verified' },
                  ].map(v => (
                    <div key={v.label} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 12px', borderRadius:10, background: v.ok ? '#F0FDF4' : C.g50, border:`1px solid ${v.ok ? '#BBF7D0' : C.g200}` }}>
                      <span style={{ fontSize:16, flexShrink:0 }}>{v.icon}</span>
                      <span style={{ flex:1, fontSize:13, fontWeight:800, color:C.g700 }}>{v.label}</span>
                      {v.ok
                        ? <span style={{ display:'flex', alignItems:'center', gap:4, fontSize:12, fontWeight:800, color:'#16A34A' }}>
                            <BadgeCheck size={13} color="#16A34A"/> {v.yes}
                          </span>
                        : <span style={{ fontSize:12, fontWeight:700, color:C.g400 }}>{v.no}</span>
                      }
                    </div>
                  ))}
                </div>
              </div>

              {/* Trust Score + Blocks */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, padding:'14px 16px', borderBottom:`1px solid ${C.g100}` }}>
                <div style={{ background: trustScore >= 70 ? '#F0FDF4' : trustScore >= 40 ? '#FFFBEB' : '#FEF2F2', borderRadius:12, padding:'12px', border:`1px solid ${trustScore >= 70 ? '#BBF7D0' : trustScore >= 40 ? '#FDE68A' : '#FECACA'}` }}>
                  <div style={{ fontSize:11, fontWeight:800, color:C.g500, textTransform:'uppercase', letterSpacing:0.5, marginBottom:6 }}>Trust Score</div>
                  <div style={{ fontSize:24, fontWeight:900, color: trustScore >= 70 ? '#16A34A' : trustScore >= 40 ? '#D97706' : '#DC2626', lineHeight:1, marginBottom:6 }}>{trustScore}</div>
                  <div style={{ height:5, borderRadius:10, background:C.g200, overflow:'hidden' }}>
                    <div style={{ height:'100%', width:`${trustScore}%`, borderRadius:10, background: trustScore >= 70 ? '#16A34A' : trustScore >= 40 ? '#D97706' : '#DC2626', transition:'width 0.4s' }}/>
                  </div>
                  <div style={{ fontSize:10, color:C.g400, marginTop:4, fontWeight:600 }}>/ 100</div>
                </div>
                <div style={{ background: blocksRcvd === 0 ? '#F0FDF4' : '#FEF2F2', borderRadius:12, padding:'12px', border:`1px solid ${blocksRcvd === 0 ? '#BBF7D0' : '#FECACA'}` }}>
                  <div style={{ fontSize:11, fontWeight:800, color:C.g500, textTransform:'uppercase', letterSpacing:0.5, marginBottom:6 }}>Blocks</div>
                  <div style={{ fontSize:24, fontWeight:900, color: blocksRcvd === 0 ? '#16A34A' : '#DC2626', lineHeight:1, marginBottom:4 }}>{blocksRcvd}</div>
                  <div style={{ fontSize:10, color: blocksRcvd === 0 ? '#16A34A' : '#DC2626', fontWeight:700 }}>
                    {blocksRcvd === 0 ? 'No blocks received' : blocksRcvd === 1 ? '1 user blocked them' : `${blocksRcvd} users blocked them`}
                  </div>
                </div>
              </div>

              {/* Bio if available */}
              {seller?.bio && (
                <div style={{ padding:'12px 16px', borderBottom:`1px solid ${C.g100}` }}>
                  <p style={{ fontSize:10, fontWeight:800, color:C.g500, textTransform:'uppercase', letterSpacing:0.8, marginBottom:6 }}>About</p>
                  <p style={{ fontSize:13, color:C.g600, lineHeight:1.6, margin:0 }}>{seller.bio}</p>
                </div>
              )}

              {/* Close button */}
              <div style={{ padding:'14px 16px 32px', flexShrink:0 }}>
                <button onClick={() => setShowSellerProfile(false)}
                  style={{ width:'100%', padding:'13px', borderRadius:13, background:C.forest, color:'#fff', border:'none', fontWeight:900, fontSize:14, cursor:'pointer', letterSpacing:0.3 }}>
                  Close Profile
                </button>
              </div>

              </div>{/* end scroll */}
            </div>
          </div>
        )}

        {isOwner ? (
          /* ── Owner view ── */
          <div style={{ background: '#fff', borderRadius: 20, border: `1px solid ${C.g200}`, overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: `1px solid ${C.g100}`, background: C.mist }}>
              <p style={{ fontWeight: 900, fontSize: 15, color: C.forest, margin: 0 }}>Your Listing</p>
              <p style={{ fontSize: 12, color: C.g400, margin: '2px 0 0' }}>This offer is live and visible to buyers</p>
            </div>
            <div style={{ padding: 20 }}>
              <div style={{ background: `${C.success}10`, border: `1px solid ${C.success}25`, borderRadius: 10, padding: '10px 14px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: C.success }} />
                <span style={{ fontSize: 12, fontWeight: 800, color: C.success }}>Active — visible to buyers</span>
              </div>
              {[
                ['Rate',       `${sym}${fmt(sellerRateLocal, 0)} per BTC`],
                ['Range',      `${sym}${fmt(minLocal, 0)} – ${sym}${fmt(maxLocal, 0)}`],
                ['Payment',    pmRaw || '—'],
                ['Margin',     margin === 0 ? 'Market rate' : margin > 0 ? `+${margin}%` : `${margin}%`],
                ['Time limit', `${listing.time_limit || 30} min`],
              ].map(([l, v]) => (
                <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: `1px solid ${C.g100}`, fontSize: 13 }}>
                  <span style={{ color: C.g500 }}>{l}</span>
                  <span style={{ fontWeight: 800, color: C.g800 }}>{v}</span>
                </div>
              ))}
              <button onClick={() => navigate('/my-listings')}
                style={{ width: '100%', marginTop: 16, padding: '14px', borderRadius: 12, background: C.green, color: '#fff', fontWeight: 900, fontSize: 14, border: 'none', cursor: 'pointer' }}>
                Manage My Listings →
              </button>
            </div>
          </div>
        ) : (
          /* ── Trade box ── */
          <div style={{ background: '#fff', borderRadius: 20, border: `1px solid ${C.g200}`, overflow: 'hidden' }}>

            {/* Payment method + range */}
            <div style={{ padding: '14px 20px', borderBottom: `1px solid ${C.g100}`, background: C.g50, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 11, color: C.g400, fontWeight: 700, marginBottom: 2 }}>PAY WITH</div>
                <div style={{ fontSize: 13, fontWeight: 800, color: C.g800 }}>{pm.icon} {pm.label}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 11, color: C.g400, fontWeight: 700, marginBottom: 2 }}>LIMIT</div>
                <div style={{ fontSize: 13, fontWeight: 800, color: T.primary }}>{sym}{fmt(minLocal, 0)} – {sym}{fmt(maxLocal, 0)}</div>
              </div>
            </div>

            <div style={{ padding: 20 }}>

              {/* ── Gift card region picker (only when listing has currency regions) ── */}
              {isGiftCard && gcCurrencies.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <p style={{ fontSize: 11, fontWeight: 800, color: C.g600, marginBottom: 8 }}>
                    SELECT YOUR CARD REGION <span style={{ color: C.danger }}>*</span>
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {gcCurrencies.map(rc => {
                      const active = selectedGcRegion?.region === rc.region;
                      return (
                        <button
                          key={rc.region}
                          onClick={() => { setSelectedGcRegion(rc); setPayAmt(''); setTradeError(''); }}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            padding: '7px 12px', borderRadius: 10, cursor: 'pointer',
                            border: `2px solid ${active ? C.mint : C.g200}`,
                            background: active ? `${C.mint}12` : '#fff',
                            fontWeight: 700, fontSize: 12, color: active ? C.forest : C.g600,
                            transition: 'all 0.15s',
                          }}>
                          <span style={{ fontSize: 16 }}>{rc.flag}</span>
                          <span>{rc.region}</span>
                          <span style={{ fontWeight: 900, fontSize: 11, color: active ? C.mint : C.g400 }}>{rc.symbol} {rc.currency}</span>
                        </button>
                      );
                    })}
                  </div>
                  {!selectedGcRegion && (
                    <p style={{ fontSize: 11, color: C.warn, fontWeight: 700, marginTop: 6 }}>
                      Please select the region of your gift card to continue.
                    </p>
                  )}
                </div>
              )}

              {/* Amount input */}
              <div style={{ marginBottom: 16 }}>
                {/* Label row with MIN / MAX quick-fill chips */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <label style={{ fontSize: 12, fontWeight: 800, color: C.g600 }}>
                    {isVisitorSelling ? `YOU RECEIVE (${cur})` : `YOU PAY (${cur})`}
                  </label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      type="button"
                      onClick={() => { setPayAmt(String(Math.ceil(minLocal))); setTradeError(''); }}
                      style={{
                        fontSize: 11, fontWeight: 800, cursor: 'pointer',
                        color: T.primary, background: T.mist,
                        border: `1.5px solid ${T.border}`,
                        borderRadius: 7, padding: '4px 10px', lineHeight: 1,
                        transition: 'all 0.15s',
                      }}>
                      MIN {sym}{fmt(minLocal, 0)}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setPayAmt(String(Math.floor(maxLocal))); setTradeError(''); }}
                      style={{
                        fontSize: 11, fontWeight: 900, cursor: 'pointer',
                        color: '#fff', background: T.grad,
                        border: 'none',
                        borderRadius: 7, padding: '4px 10px', lineHeight: 1,
                        boxShadow: `0 2px 8px ${T.shadow}`,
                        transition: 'all 0.15s',
                      }}>
                      MAX {sym}{fmt(maxLocal, 0)}
                    </button>
                  </div>
                </div>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 16, fontWeight: 900, color: C.g400 }}>{sym}</span>
                  <input
                    type="number"
                    value={payAmt}
                    onChange={e => { setPayAmt(e.target.value); setTradeError(''); }}
                    placeholder="0.00"
                    style={{
                      width: '100%', boxSizing: 'border-box',
                      paddingLeft: 36, paddingRight: 56, paddingTop: 16, paddingBottom: 16,
                      fontSize: 22, fontWeight: 900,
                      border: `2px solid ${payAmtNum > 0 && (payAmtNum < minLocal || payAmtNum > maxLocal) ? C.danger : payAmtNum > 0 ? T.primary : C.g200}`,
                      borderRadius: 14, outline: 'none', color: C.g800,
                    }}
                  />
                  <span style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 11, fontWeight: 800, color: C.g500, background: C.g100, padding: '3px 7px', borderRadius: 6 }}>{cur}</span>
                </div>
                {payAmtNum > 0 && payAmtNum < minLocal && <p style={{ fontSize: 11, color: C.danger, marginTop: 6, fontWeight: 700 }}>Minimum is {sym}{fmt(minLocal, 0)}</p>}
                {payAmtNum > maxLocal && <p style={{ fontSize: 11, color: C.danger, marginTop: 6, fontWeight: 700 }}>Maximum is {sym}{fmt(maxLocal, 0)}</p>}
              </div>

              {/* You receive */}
              <div style={{ background: T.mist, borderRadius: 14, padding: '14px 16px', marginBottom: 16, border: `1px solid ${T.primary}20` }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: C.g500 }}>{isVisitorSelling ? 'YOU PAY' : 'YOU RECEIVE'}</span>
                  <span style={{ fontSize: 11, fontWeight: 800, color: '#fff', background: margin > 0 ? C.danger : margin < 0 ? C.success : C.g400, borderRadius: 20, padding: '2px 8px' }}>
                    {margin === 0 ? 'Market' : margin > 0 ? `+${margin}%` : `${margin}%`}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: isUsdtAsset ? '#26A17B' : C.gold, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span style={{ color: '#fff', fontWeight: 900, fontSize: 13 }}>{isUsdtAsset ? '₮' : '₿'}</span>
                  </div>
                  <div>
                    <div style={{ fontSize: 22, fontWeight: 900, color: T.primary, lineHeight: 1 }}>
                      {fiatEquivalent > 0 ? `${sym}${fmt(fiatEquivalent, 2)} ${cur}` : <span style={{ color: C.g300 }}>0.00 {cur}</span>}
                    </div>
                    <div style={{ fontSize: 11, color: C.g400, fontWeight: 600, marginTop: 2 }}>
                      {isUsdtAsset
                        ? `₮ ${btcAfterFee > 0 ? btcAfterFee.toFixed(2) : '0.00'} USDT`
                        : `₿ ${btcAfterFee > 0 ? fmtBtc(btcAfterFee) : '0.00000000'}`}
                    </div>
                  </div>
                  {quoteFetching && <RefreshCw size={13} color={C.g300} style={{ marginLeft: 'auto' }} className="animate-spin" />}
                </div>
              </div>

              {/* Trade terms (if any) */}
              {(listing.trade_instructions || listing.description) && (
                <div style={{ background: C.g50, borderRadius: 10, padding: '10px 14px', marginBottom: 16, border: `1px solid ${C.g200}`, fontSize: 12, color: C.g600, lineHeight: 1.6 }}>
                  <span style={{ fontWeight: 800, color: C.g700, display: 'block', marginBottom: 4 }}>Seller's instructions</span>
                  {listing.trade_instructions || listing.description}
                </div>
              )}

              {/* Low-balance advisory (soft warning, not a block) */}
              {sellerHasLowBalance && !tradeError && (
                <div style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 10, background: '#FFFBEB', border: '1px solid #FDE68A', fontSize: 12, fontWeight: 700, color: '#92400E', display: 'flex', alignItems: 'flex-start', gap: 7 }}>
                  <Zap size={14} style={{ flexShrink: 0, color: '#B45309' }} />
                  <span>Seller's available balance may be low — try a smaller amount if the trade fails to open.</span>
                </div>
              )}

              {/* Inline trade error */}
              {tradeError && (
                <div style={{ marginBottom:14, padding:'10px 14px', borderRadius:10, background:'#FEF2F2', border:'1.5px solid #FECACA', fontSize:13, fontWeight:700, color:'#B91C1C', display:'flex', alignItems:'flex-start', gap:8 }}>
                  <span style={{ flexShrink:0 }}><AlertTriangle size={16} style={{ color:'#B91C1C' }} /></span>
                  <span>{tradeError}</span>
                </div>
              )}

              {/* CTA */}
              {listing.status === 'PAUSED' ? (
                <div style={{ padding:'14px', borderRadius:14, background:'#FFFBEB', border:'2px solid #F59E0B', textAlign:'center' }}>
                  <p style={{ fontSize:14, fontWeight:900, color:'#92400E', margin:'0 0 4px' }}>⏸ Offer Paused</p>
                  <p style={{ fontSize:12, color:'#B45309', margin:0 }}>The seller has temporarily paused this offer. Try another offer.</p>
                </div>
              ) : sellerCantFulfillMin ? (
                <div style={{ padding:'14px', borderRadius:14, background:'#FEF2F2', border:'2px solid #FCA5A5', textAlign:'center' }}>
                  <p style={{ fontSize:14, fontWeight:900, color:'#B91C1C', margin:'0 0 4px' }}><AlertTriangle size={14} className="inline-block align-text-bottom" /> Offer unavailable</p>
                  <p style={{ fontSize:12, color:'#B91C1C', margin:0 }}>The seller's available balance can't currently cover this offer's minimum amount. Try another offer.</p>
                </div>
              ) : (
              <button
                onClick={handleStartTrade}
                disabled={submitting || !payAmt || payAmtNum <= 0 || payAmtNum < minLocal || payAmtNum > maxLocal || (isGiftCard && gcCurrencies.length > 0 && !selectedGcRegion)}
                style={{
                  width: '100%', padding: '16px', borderRadius: 14, border: 'none', cursor: 'pointer',
                  background: submitting || !payAmt || payAmtNum <= 0 || payAmtNum < minLocal || payAmtNum > maxLocal || (isGiftCard && gcCurrencies.length > 0 && !selectedGcRegion)
                    ? C.g200 : T.grad,
                  color: submitting || !payAmt || payAmtNum <= 0 || payAmtNum < minLocal || payAmtNum > maxLocal || (isGiftCard && gcCurrencies.length > 0 && !selectedGcRegion)
                    ? C.g400 : '#fff',
                  boxShadow: (!submitting && payAmt && payAmtNum >= minLocal && payAmtNum <= maxLocal && !(isGiftCard && gcCurrencies.length > 0 && !selectedGcRegion))
                    ? `0 6px 24px ${T.shadowLg}` : 'none',
                  fontWeight: 900, fontSize: 15,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  transition: 'all 0.2s',
                }}>
                {submitting
                  ? <><RefreshCw size={15} className="animate-spin" /> Opening trade…</>
                  : <><Lock size={14} /> {isVisitorSelling ? 'SELL BITCOIN' : 'Proceed to Payment'} <ArrowRight size={14} /></>}
              </button>
              )}

              {/* Simple steps */}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16, paddingTop: 14, borderTop: `1px solid ${C.g100}` }}>
                {[[<Lock size={18} />, 'Escrow locks'], [<MessageSquare size={18} />, 'Chat opens'], [<Send size={18} />, 'Send payment'], [<CheckCircle size={18} />, 'BTC released']].map(([e,t])=>(
                  <div key={t} style={{ textAlign:'center', flex:1 }}>
                    <div style={{ fontSize:18, marginBottom:3 }}>{e}</div>
                    <div style={{ fontSize:10, fontWeight:700, color:C.g400, lineHeight:1.3 }}>{t}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Multi-offer info banner ── */}
        {!isOwner && !isGiftCard && (
          <div style={{ marginTop: 14, borderRadius: 12, padding: '10px 14px', display: 'flex', alignItems: 'flex-start', gap: 9, background: '#EFF6FF', border: '1px solid #BFDBFE' }}>
            <Info size={15} style={{ flexShrink: 0, marginTop: 1, color: '#1E40AF' }} />
            <p style={{ margin: 0, fontSize: 11.5, fontWeight: 700, color: '#1E40AF', lineHeight: 1.6 }}>
              This seller may have <strong>other active offers</strong> on the marketplace — they will remain available to other buyers even after your trade starts. Bitcoin is only locked at the moment your trade is opened.
            </p>
          </div>
        )}

        {/* ── Gift Card Warning (only for gift card listings) ── */}
        {isGiftCard && (
          <div style={{ marginTop:16, borderRadius:16, overflow:'hidden', border:'1.5px solid #F59E0B', boxShadow:'0 4px 24px rgba(245,158,11,0.13)' }}>
            {/* Warning header */}
            <div style={{ background:'linear-gradient(135deg,#F59E0B,#D97706)', padding:'10px 14px', display:'flex', alignItems:'center', gap:8 }}>
              <AlertTriangle size={18} style={{ color:'#fff' }} />
              <span style={{ fontWeight:900, fontSize:13, color:'#fff', letterSpacing:0.3 }}>Gift Card Warning!</span>
            </div>
            {/* Warning body */}
            <div style={{ background:'#FFFBEB', padding:'12px 14px' }}>
              <p style={{ margin:'0 0 10px', fontSize:12, fontWeight:700, color:'#92400E', lineHeight:1.6 }}>
                Trading gift cards is very risky. Please follow these rules to stay safe:
              </p>
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {[
                  { icon:<Video size={14} />, text:'Do a video recording of your card when you start this trade.' },
                  { icon:<CheckCircle size={14} />, text:'Make sure your card is correct and valid before sending.' },
                  { icon:<Video size={14} />, text:'Stay on the video recording till the end of this trade — it may be needed for moderator review.' },
                  { icon:<Scale size={14} />, text:'Praqen is NOT responsible for any loss if you do not follow these simple rules.' },
                ].map((item, i) => (
                  <div key={i} style={{ display:'flex', alignItems:'flex-start', gap:8, padding:'8px 10px', borderRadius:10, background: i === 3 ? '#FEE2E2' : '#FEF3C7', border: i === 3 ? '1px solid #FCA5A5' : '1px solid #FDE68A' }}>
                    <span style={{ fontSize:14, flexShrink:0, marginTop:1 }}>{item.icon}</span>
                    <p style={{ margin:0, fontSize:11.5, fontWeight: i === 3 ? 900 : 700, color: i === 3 ? '#B91C1C' : '#78350F', lineHeight:1.55 }}>{item.text}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Safety notice ── */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:6, marginTop:16, padding:'10px 14px', borderRadius:12, background:`${C.green}10`, border:`1px solid ${C.green}20` }}>
          <Lock size={11} color={C.green} style={{ flexShrink:0 }}/>
          <p style={{ margin:0, fontSize:11, fontWeight:700, color:C.green, textAlign:'center', lineHeight:1.5 }}>
            Your funds are protected by escrow — trade safely on <strong>PRAQEN.com</strong>
          </p>
        </div>

        </div>{/* end prq-sheet-scroll */}
      </div>{/* end prq-sheet */}
    </div>
  );
}
