import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import SEO from '../components/SEO';
import {
  ArrowRight, Shield, Zap, Globe, Bitcoin, Gift,
  ChevronDown, Lock, TrendingUp, TrendingDown, Users,
  HeadphonesIcon, Check, ChevronRight, Star,
  MessageCircle, Award, Flame, Play, CheckCircle,
  Smartphone, Building2, CreditCard, Mail,
  Copy, UserPlus, Share2, Search, Percent, ArrowLeftRight, Link2,
} from 'lucide-react';
import { copyToClipboard } from '../utils/clipboard';
/* ─── palette ─────────────────────────────────────────────────────────── */
const C = {
  forest: '#1B4332', green: '#2D6A4F', mint: '#40916C', sage: '#52B788',
  gold: '#F4A422', amber: '#F59E0B', mist: '#F0FAF5',
  g50: '#F8FAFC', g100: '#F1F5F9', g200: '#E2E8F0',
  g400: '#94A3B8', g500: '#64748B', g600: '#475569', g700: '#334155', g800: '#1E293B',
  success: '#10B981', danger: '#EF4444', paid: '#3B82F6', online: '#22C55E',
  purple: '#8B5CF6',
};

/* ─── live trades ─────────────────────────────────────────────────────── */
const LIVE = [
  { user: 'Samuel K.', flag: '🇬🇭', method: 'MTN MoMo', amount: '₵12,500', type: 'buy' },
  { user: 'Wei L.', flag: '🇨🇳', method: 'WeChat Pay', amount: '¥8,400', type: 'buy' },
  { user: 'Amina T.', flag: '🇳🇬', method: 'OPay', amount: '₦850,000', type: 'buy' },
  { user: 'Lars B.', flag: '🇩🇪', method: 'SEPA Transfer', amount: '€320', type: 'sell' },
  { user: 'James O.', flag: '🇰🇪', method: 'M-Pesa', amount: 'KSh 8,200', type: 'buy' },
  { user: 'Mei X.', flag: '🇨🇳', method: 'Alipay', amount: '¥15,200', type: 'sell' },
  { user: 'Priya R.', flag: '🇮🇳', method: 'UPI / PhonePe', amount: '₹42,000', type: 'buy' },
  { user: 'Sophie M.', flag: '🇬🇧', method: 'Revolut', amount: '£290', type: 'buy' },
  { user: 'Fatima S.', flag: '🇸🇳', method: 'Wave', amount: 'CFA 45k', type: 'buy' },
  { user: 'Carlos V.', flag: '🇦🇪', method: 'Bank Transfer', amount: 'AED 1,200', type: 'sell' },
  { user: 'Emeka N.', flag: '🇳🇬', method: 'PalmPay', amount: '₦340,000', type: 'buy' },
  { user: 'Yuki T.', flag: '🇯🇵', method: 'Bank Transfer', amount: '¥52,000', type: 'buy' },
];

/* ─── scroll-reveal hook ──────────────────────────────────────────────── */
function useReveal(threshold = 0.12) {
  const ref = useRef(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) setOn(true); },
      { threshold }
    );
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);
  return [ref, on];
}

/* ─── live ticker strip ───────────────────────────────────────────────── */
function Ticker() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI(x => (x + 1) % LIVE.length), 2600);
    return () => clearInterval(t);
  }, []);
  const t = LIVE[i];
  return (
    <div className="flex items-center gap-2 px-3 py-2.5 rounded-2xl text-xs w-full"
      style={{ background: 'rgba(255,255,255,0.09)', border: '1px solid rgba(255,255,255,0.15)' }}>
      <span className="w-2 h-2 rounded-full flex-shrink-0 animate-pulse" style={{ background: C.online }} />
      <span className="font-bold flex-shrink-0" style={{ color: 'rgba(255,255,255,0.45)' }}>Live</span>
      <div className="w-6 h-6 rounded-full flex items-center justify-center font-black text-xs text-white flex-shrink-0"
        style={{ background: C.green }}>{t.user[0]}</div>
      <span className="font-black text-white truncate flex-1 min-w-0">{t.user}</span>
      <span className="hidden sm:inline truncate flex-shrink-0" style={{ color: 'rgba(255,255,255,0.45)' }}>
        {t.flag} {t.type === 'buy' ? 'bought' : 'sold'} via {t.method}
      </span>
      <span className="font-black flex-shrink-0"
        style={{ color: t.type === 'buy' ? C.gold : C.sage }}>{t.amount}</span>
    </div>
  );
}

/* ─── section label ───────────────────────────────────────────────────── */
function Label({ children }) {
  return (
    <p className="text-xs font-black uppercase tracking-widest mb-2"
      style={{ color: C.mint }}>{children}</p>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   MAIN EXPORT
════════════════════════════════════════════════════════════════════════ */
export default function LandingPage({ user }) {
  const navigate = useNavigate();
  const [faq, setFaq] = useState(null);
  const [btc, setBtc] = useState(808425);
  const [up, setUp] = useState(true);
  const [copied, setCopied] = useState(false);

  /* simulated live price */
  useEffect(() => {
    const iv = setInterval(() => {
      setBtc(p => { const d = (Math.random() - .47) * 900; setUp(d >= 0); return Math.round(p + d); });
    }, 3000);
    return () => clearInterval(iv);
  }, []);

  /* section refs */
  const [heroRef, heroOn] = useReveal(0.05);
  const [statsRef, statsOn] = useReveal(0.1);
  const [productsRef, productsOn] = useReveal(0.1);
  const [howRef, howOn] = useReveal(0.1);
  const [featRef, featOn] = useReveal(0.1);
  const [escrowRef, escrowOn] = useReveal(0.1);
  const [paymentsRef, paymentsOn] = useReveal(0.1);
  const [testimonialsRef, testimonialsOn] = useReveal(0.1);
  const [countriesRef, countriesOn] = useReveal(0.1);

  const goTo = path => navigate(path);

  return (
    <div style={{ fontFamily: "'DM Sans',sans-serif", background: '#fff', maxWidth: '100vw', width: '100%' }}>
      <SEO />
      <style>{`
        *, *::before, *::after { box-sizing: border-box; }
        html, body { overscroll-behavior-y: none; }
        @keyframes slideUp{from{opacity:0;transform:translateY(26px)}to{opacity:1;transform:translateY(0)}}
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
        @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}
        @keyframes pulse2{0%,100%{opacity:1}50%{opacity:.6}}
        .anim-up{animation:slideUp .6s ease both}
        .anim-fade{animation:fadeIn .7s ease both}
        .float{animation:float 5s ease-in-out infinite}
        .float2{animation:float 7s ease-in-out infinite;animation-delay:1.5s}
        .card-up{transition:transform .22s,box-shadow .22s;-webkit-tap-highlight-color:transparent}
        @media(hover:hover){.card-up:hover{transform:translateY(-5px);box-shadow:0 18px 45px rgba(0,0,0,.11)}}
        .card-up:active{transform:scale(.97)}
        .grad-text{background:linear-gradient(90deg,${C.gold},${C.amber});-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
        .green-text{background:linear-gradient(90deg,${C.sage},${C.mint});-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
        .step-line{position:absolute;top:32px;left:calc(50% + 38px);width:calc(100% - 76px);height:2px;background:linear-gradient(90deg,${C.gold}60,transparent);z-index:0}
      `}</style>

      {/* ══════════════════════════════════════════════════
          1. HERO
      ══════════════════════════════════════════════════ */}
      <section ref={heroRef} className="relative overflow-hidden"
        style={{ background: `linear-gradient(145deg,${C.forest} 0%,#0c2418 50%,${C.green} 100%)`, minHeight: '100dvh', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>

        {/* grid bg */}
        <div className="absolute inset-0 pointer-events-none"
          style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.028) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.028) 1px,transparent 1px)', backgroundSize: '52px 52px' }} />
        {/* glow orbs — capped so they don't exceed viewport width */}
        <div className="absolute top-0 right-0 rounded-full blur-3xl pointer-events-none"
          style={{ width: 'min(480px,60vw)', height: 'min(480px,60vw)', background: C.gold, opacity: .07 }} />
        <div className="absolute bottom-0 left-0 rounded-full blur-3xl pointer-events-none"
          style={{ width: 'min(340px,50vw)', height: 'min(340px,50vw)', background: C.mint, opacity: .09 }} />

        <div className="relative max-w-7xl mx-auto px-4 pt-6 pb-10 md:py-24 w-full">
          <div className="grid md:grid-cols-2 gap-8 lg:gap-20 items-center">

            {/* left */}
            <div>
              {/* badge */}
              <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold mb-6 ${heroOn ? 'anim-up' : ''}`}
                style={{ opacity: heroOn ? 1 : 0, background: 'rgba(244,164,34,.15)', border: '1px solid rgba(244,164,34,.35)', color: C.gold }}>
                <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: C.online }} />
                Trusted by 2.4M+ traders across 180+ countries
              </div>

              {/* headline */}
              <h1 className={`text-[1.6rem] sm:text-5xl lg:text-6xl font-black leading-[1.1] mb-4 text-white ${heroOn ? 'anim-up' : ''}`}
                style={{ opacity: heroOn ? 1 : 0, fontFamily: "'Syne',sans-serif", animationDelay: '.1s' }}>
                Buy Bitcoin in Ghana <br />
                <span className="grad-text">Instantly with Mobile Money</span><br />
              </h1>

              {/* sub */}
              <p className={`text-sm md:text-base mb-7 leading-relaxed max-w-lg ${heroOn ? 'anim-up' : ''}`}
                style={{ opacity: heroOn ? 1 : 0, color: 'rgba(255,255,255,.62)', animationDelay: '.18s' }}>
                Trade Bitcoin &amp; USDT directly with verified peers using WeChat Pay, M-Pesa, SEPA, UPI, Bank Transfer
                and 100+ local payment methods across 180+ countries. Every trade is escrow-protected.
              </p>

              {/* CTAs */}
              <div className={`flex flex-col sm:flex-row gap-3 mb-7 ${heroOn ? 'anim-up' : ''}`}
                style={{ opacity: heroOn ? 1 : 0, animationDelay: '.26s' }}>
                {user ? (
                  <>
                    <button onClick={() => goTo('/buy-bitcoin')}
                      className="w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-4 rounded-2xl font-black text-base hover:opacity-90 active:scale-95 transition"
                      style={{ background: C.gold, color: C.forest, boxShadow: `0 4px 22px ${C.gold}50` }}>
                      <Bitcoin size={18} /> Buy Bitcoin <ArrowRight size={16} />
                    </button>
                    <button onClick={() => goTo('/sell-bitcoin')}
                      className="w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-4 rounded-2xl font-black text-base hover:bg-white/20 active:scale-95 transition"
                      style={{ background: 'rgba(255,255,255,.12)', color: '#fff', border: '2px solid rgba(255,255,255,.3)' }}>
                      <TrendingDown size={18} /> Sell Bitcoin
                    </button>
                  </>
                ) : (
                  <>
                    <button onClick={() => goTo('/register')}
                      className="w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-4 rounded-2xl font-black text-base hover:opacity-90 active:scale-95 transition"
                      style={{ background: C.gold, color: C.forest, boxShadow: `0 4px 22px ${C.gold}50` }}>
                      Get Started Free <ArrowRight size={18} />
                    </button>
                    <button onClick={() => goTo('/buy-bitcoin')}
                      className="w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-4 rounded-2xl font-black text-base hover:bg-white/20 active:scale-95 transition"
                      style={{ background: 'rgba(255,255,255,.12)', color: '#fff', border: '2px solid rgba(255,255,255,.3)' }}>
                      <Bitcoin size={16} /> Browse Marketplace
                    </button>
                  </>
                )}
              </div>

              {/* trust row */}
              <div className={`flex flex-wrap gap-2 mb-5 ${heroOn ? 'anim-up' : ''}`}
                style={{ opacity: heroOn ? 1 : 0, animationDelay: '.34s' }}>
                {[
                  { Icon: Lock, t: 'Escrow' },
                  { Icon: Zap, t: '15 min' },
                  { Icon: Percent, t: '0.5%' },
                  { Icon: Globe, t: '180+ countries' },
                ].map(({ Icon, t }) => (
                  <span key={t} className="text-xs px-2.5 py-1 rounded-full flex-shrink-0 flex items-center gap-1" style={{ color: 'rgba(255,255,255,.75)', background: 'rgba(255,255,255,.1)' }}>
                    <Icon size={11} /> {t}
                  </span>
                ))}
                <span className="text-xs px-2.5 py-1 rounded-full flex-shrink-0 flex items-center gap-1" style={{ color: '#F6821F', background: 'rgba(246,130,31,0.15)', border: '1px solid rgba(246,130,31,0.3)' }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z" /></svg>
                  Cloudflare Protected
                </span>
              </div>

              {/* ticker */}
              <div className={heroOn ? 'anim-fade' : ''} style={{ opacity: heroOn ? 1 : 0, animationDelay: '.42s' }}>
                <Ticker />
              </div>
            </div>

            {/* right — BTC card */}
            <div className={`hidden md:flex items-center justify-center ${heroOn ? 'anim-fade' : ''}`}
              style={{ opacity: heroOn ? 1 : 0, animationDelay: '.3s' }}>
              <div className="relative">

                {/* main card */}
                <div className="float bg-white rounded-3xl shadow-2xl overflow-hidden"
                  style={{ width: 310, border: `1px solid ${C.g200}` }}>
                  {/* price header */}
                  <div className="p-5 border-b" style={{ borderColor: C.g100 }}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                          style={{ background: `${C.gold}20` }}>
                          <Bitcoin size={18} style={{ color: C.gold }} />
                        </div>
                        <div>
                          <p className="text-xs font-black" style={{ color: C.g500 }}>BTC / GHS</p>
                          <p className="text-xs" style={{ color: C.g400 }}>Live Market Rate</p>
                        </div>
                      </div>
                      <span className="text-xs font-black px-2.5 py-1 rounded-full"
                        style={{ background: up ? `${C.success}15` : `${C.danger}15`, color: up ? C.success : C.danger }}>
                        {up ? '▲' : '▼'} 2.4%
                      </span>
                    </div>
                    <p className="text-3xl font-black" style={{ color: C.forest }}>
                      ₵{btc.toLocaleString()}
                    </p>
                  </div>

                  {/* sellers */}
                  <div className="p-4 space-y-2">
                    <p className="text-xs font-black mb-2 flex items-center gap-1" style={{ color: C.g400 }}><Flame size={11} /> Top Active Sellers</p>
                    {[
                      { n: 'Samuel K.', MIcon: Smartphone, m: 'MTN MoMo', r: '₵810k', badge: 'Legend', bc: '#7C3AED', t: '1.2k' },
                      { n: 'Amina T.', MIcon: Building2, m: 'Bank Transfer', r: '₵808k', badge: 'Expert', bc: '#0EA5E9', t: '348' },
                      { n: 'Kofi B.', MIcon: Smartphone, m: 'Vodafone', r: '₵805k', badge: 'Pro', bc: C.success, t: '87' },
                    ].map(({ n, MIcon, m, r, badge, bc, t }) => (
                      <div key={n} className="flex items-center justify-between p-2.5 rounded-xl hover:bg-gray-50 transition cursor-pointer"
                        style={{ background: C.g50 }}>
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-black text-white flex-shrink-0"
                            style={{ background: C.green }}>{n[0]}</div>
                          <div>
                            <div className="flex items-center gap-1">
                              <span className="text-xs font-black" style={{ color: C.forest }}>{n}</span>
                              <span className="font-black text-white rounded-full px-1"
                                style={{ background: bc, fontSize: 9 }}>{badge}</span>
                            </div>
                            <p className="text-xs" style={{ color: C.g400 }}>{m}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-black" style={{ color: C.green }}>{r}</p>
                          <p className="text-xs" style={{ color: C.g400 }}>{t} trades</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="px-4 pb-4">
                    <button onClick={() => goTo(user ? '/buy-bitcoin' : '/register')}
                      className="w-full py-3 rounded-xl text-white font-black text-sm hover:opacity-90 transition"
                      style={{ background: `linear-gradient(135deg,${C.green},${C.mint})` }}>
                      {user ? 'Buy Bitcoin Now →' : 'Get Started Free →'}
                    </button>
                  </div>
                </div>

                {/* floating badges */}
                <div className="absolute -top-5 -right-10 bg-white rounded-2xl px-3 py-2 shadow-xl flex items-center gap-1.5 text-xs font-bold float2"
                  style={{ color: C.success, border: `1px solid ${C.success}25` }}>
                  <Shield size={12} /> Escrow Safe
                </div>
                <div className="absolute -bottom-5 -left-10 bg-white rounded-2xl px-3 py-2 shadow-xl flex items-center gap-1.5 text-xs font-bold float2"
                  style={{ color: C.paid, border: `1px solid ${C.paid}25`, animationDelay: '2s' }}>
                  <Zap size={12} /> Instant Release
                </div>
                <div className="absolute top-1/3 -left-14 bg-white rounded-2xl px-3 py-2 shadow-xl flex items-center gap-1.5 text-xs font-bold float"
                  style={{ color: C.gold, border: `1px solid ${C.gold}25`, animationDelay: '1s' }}>
                  <Award size={12} /> Verified Traders
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* stats strip */}
        <div className="relative border-t" style={{ borderColor: 'rgba(255,255,255,.1)' }}>
          <div className="max-w-5xl mx-auto px-4 py-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { v: '2.4M+', l: 'Active Traders' },
              { v: '$1.2B+', l: 'Volume Traded' },
              { v: '180+', l: 'Countries' },
              { v: '0.5%', l: 'Flat Fee Only' },
            ].map(({ v, l }) => (
              <div key={l} className="text-center">
                <p className="text-xl md:text-3xl font-black grad-text mb-0.5">{v}</p>
                <p className="text-xs" style={{ color: 'rgba(255,255,255,.45)' }}>{l}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ MOBILE BUY / SELL STRIP (hidden on desktop) ═══ */}
      <div className="md:hidden px-4 py-6" style={{ background: C.forest }}>
        <p className="text-center text-xs font-black uppercase tracking-widest mb-4"
          style={{ color: 'rgba(255,255,255,.45)' }}>Start Trading Now</p>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <button onClick={() => goTo('/buy-bitcoin')}
            className="flex flex-col items-center justify-center gap-1.5 py-5 rounded-2xl active:scale-95 transition"
            style={{ background: C.gold, color: C.forest }}>
            <Bitcoin size={24} />
            <span className="text-sm font-black">Buy Bitcoin</span>
            <span className="text-xs font-medium" style={{ opacity: .7 }}>Best rates</span>
          </button>
          <button onClick={() => goTo('/sell-bitcoin')}
            className="flex flex-col items-center justify-center gap-1.5 py-5 rounded-2xl active:scale-95 transition"
            style={{ background: 'rgba(255,255,255,.1)', color: '#fff', border: '2px solid rgba(255,255,255,.2)' }}>
            <TrendingDown size={24} />
            <span className="text-sm font-black">Sell Bitcoin</span>
            <span className="text-xs font-medium" style={{ opacity: .6 }}>Get paid fast</span>
          </button>
        </div>
        <Link to="/gift-cards"
          className="flex items-center justify-center gap-2 py-3.5 rounded-2xl font-bold text-sm w-full"
          style={{ background: 'rgba(139,92,246,.2)', color: '#C4B5FD', border: '1px solid rgba(139,92,246,.35)' }}>
          <Gift size={16} /> Trade Gift Cards — 100+ brands
        </Link>
      </div>

      {/* ══════════════════════════════════════════════════
          2. OUR PRODUCTS
      ══════════════════════════════════════════════════ */}
      <section ref={productsRef} className="py-10 md:py-20 px-4" style={{ background: C.mist }}>
        <div className="max-w-6xl mx-auto">
          <div className={`text-center mb-8 md:mb-12 ${productsOn ? 'anim-up' : ''}`} style={{ opacity: productsOn ? 1 : 0 }}>
            <Label>Our Products</Label>
            <h2 className="text-2xl md:text-4xl font-black mb-3"
              style={{ fontFamily: "'Syne',sans-serif", color: C.forest }}>
              Three Powerful Ways to Trade
            </h2>
            <p className="text-base max-w-xl mx-auto" style={{ color: C.g500 }}>
              One platform. Everything you need to buy, sell and convert crypto — fast, safe and on your terms.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-4 md:gap-6">
            {[
              {
                icon: Bitcoin, title: 'Buy Bitcoin', color: C.gold,
                desc: 'Access thousands of verified P2P offers. Choose your payment method, rate and trade in minutes.',
                link: '/buy-bitcoin', label: 'Browse Sellers',
                highlights: ['Live escrow protection', 'Best market rates', '50+ payment methods', 'Verified sellers only'],
              },
              {
                icon: TrendingUp, title: 'Sell Bitcoin', color: C.green, featured: true,
                desc: 'Convert your Bitcoin to cash instantly. Get paid directly to your mobile wallet or bank account.',
                link: '/sell-bitcoin', label: 'Start Selling',
                highlights: ['Instant payment release', 'No withdrawal limits', 'Set your own rate', 'Zero chargebacks'],
              },
              {
                icon: Gift, title: 'Gift Card Trading', color: C.purple,
                desc: 'Convert Amazon, iTunes, Steam, Google Play and 100+ gift card brands to Bitcoin in minutes.',
                link: '/gift-cards', label: 'Trade Gift Cards',
                highlights: ['100+ brands accepted', 'Instant conversion', 'Best market rates', 'Secure trading'],
              },
            ].map(({ icon: Icon, title, color, desc, link, label, highlights, featured }, i) => (
              <Link key={title} to={link}
                className={`card-up bg-white rounded-3xl p-5 md:p-7 border block group relative overflow-hidden ${productsOn ? 'anim-up' : ''}`}
                style={{ opacity: productsOn ? 1 : 0, borderColor: featured ? color : C.g200, borderWidth: featured ? 2 : 1, animationDelay: `${i * .1}s` }}>
                {featured && (
                  <div className="absolute top-5 right-5 px-2.5 py-1 rounded-full text-xs font-black"
                    style={{ background: `${color}15`, color }}>Most Popular</div>
                )}
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-5"
                  style={{ background: `${color}15` }}>
                  <Icon size={26} style={{ color }} />
                </div>
                <h3 className="font-black text-xl mb-2" style={{ color: C.forest }}>{title}</h3>
                <p className="text-sm leading-relaxed mb-5" style={{ color: C.g500 }}>{desc}</p>
                <div className="space-y-2 mb-5">
                  {highlights.map(h => (
                    <div key={h} className="flex items-center gap-2 text-xs" style={{ color: C.g600 }}>
                      <Check size={13} style={{ color, flexShrink: 0 }} />{h}
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-1 font-black text-sm pt-3 border-t"
                  style={{ borderColor: C.g100, color }}>
                  {label}
                  <ChevronRight size={14} className="group-hover:translate-x-1 transition-transform" />
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════
          3. HOW IT WORKS
      ══════════════════════════════════════════════════ */}
      <section ref={howRef} className="py-10 md:py-20 px-4" style={{ background: '#fff' }}>
        <div className="max-w-5xl mx-auto">
          <div className={`text-center mb-8 md:mb-14 ${howOn ? 'anim-up' : ''}`} style={{ opacity: howOn ? 1 : 0 }}>
            <Label>Simple Process</Label>
            <h2 className="text-2xl md:text-4xl font-black"
              style={{ fontFamily: "'Syne',sans-serif", color: C.forest }}>
              Trade Bitcoin in 4 Easy Steps
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 relative">
            {[
              { n: '01', icon: UserPlus, title: 'Create Account', desc: 'Sign up free in 30 seconds. Email verified. No bank account needed to get started.' },
              { n: '02', icon: Search, title: 'Browse Offers', desc: 'Filter by payment method, country, currency and rate. Thousands of verified sellers live.' },
              { n: '03', icon: Lock, title: 'Escrow Locks BTC', desc: "The seller's Bitcoin is automatically secured in escrow before you make any payment." },
              { n: '04', icon: CheckCircle, title: 'Pay & Receive', desc: 'Send your payment and confirm — Bitcoin lands in your wallet instantly. Trade complete!' },
            ].map(({ n, icon, title, desc }, i) => (
              <div key={n} className={`relative text-center ${howOn ? 'anim-up' : ''}`}
                style={{ opacity: howOn ? 1 : 0, animationDelay: `${i * .1}s` }}>
                {i < 3 && <div className="hidden lg:block step-line" />}
                <div className="relative z-10 w-16 h-16 rounded-2xl flex items-center justify-center text-2xl mx-auto mb-4 shadow-md"
                  style={{ background: `linear-gradient(135deg,#fff,${C.g50})`, border: `2px solid ${C.gold}35` }}>
{React.createElement(icon, {size:28, style:{color:C.gold}})}                </div>
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-black mx-auto mb-3"
                  style={{ background: C.gold, color: C.forest }}>{n}</div>
                <h3 className="font-black text-sm mb-2" style={{ color: C.forest }}>{title}</h3>
                <p className="text-xs leading-relaxed" style={{ color: C.g500 }}>{desc}</p>
              </div>
            ))}
          </div>
          <div className="text-center mt-12">
            <button onClick={() => goTo(user ? '/buy-bitcoin' : '/register')}
              className="inline-flex items-center gap-2 px-8 py-4 rounded-2xl font-black text-sm hover:opacity-90 active:scale-95 transition"
              style={{ background: C.green, color: '#fff', boxShadow: `0 4px 20px ${C.green}45` }}>
              {user ? 'Start Trading Now' : 'Get Started Free'} <ArrowRight size={16} />
            </button>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════
          4. WHY PRAQEN — 6 FEATURES
      ══════════════════════════════════════════════════ */}
      <section ref={featRef} className="py-10 md:py-20 px-4" style={{ background: C.g50 }}>
        <div className="max-w-6xl mx-auto">
          <div className={`text-center mb-8 md:mb-12 ${featOn ? 'anim-up' : ''}`} style={{ opacity: featOn ? 1 : 0 }}>
            <Label>Why PRAQEN?</Label>
            <h2 className="text-2xl md:text-4xl font-black mb-3"
              style={{ fontFamily: "'Syne',sans-serif", color: C.forest }}>
              Built for Trust. Designed for Speed.<br />
              <span className="green-text">Made for Global Traders.</span>
            </h2>
            <p className="text-base max-w-xl mx-auto" style={{ color: C.g500 }}>
              Everything you need to trade safely, quickly and confidently — no compromises.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
            {[
              { icon: Shield, title: 'Smart Escrow Protection', desc: 'Bitcoin locks automatically the moment a trade starts. Released only when both parties confirm. Zero fraud possible.', color: C.green },
              { icon: Globe, title: '100+ Payment Methods', desc: 'WeChat Pay, Alipay, M-Pesa, MTN MoMo, SEPA, UPI, PayPal, Revolut, Bank Transfer and more — local and global, all in one place.', color: C.paid },
              { icon: Zap, title: 'Trades Under 15 Minutes', desc: 'No intermediaries. No complicated requirements. Match with a trader and complete your transaction in minutes.', color: C.gold },
              { icon: MessageCircle, title: 'Fast Dispute Resolution', desc: 'Our neutral team reviews both sides and resolves every dispute within 24 hours. Your funds stay safe throughout.', color: C.success },
              { icon: HeadphonesIcon, title: '24/7 Human Support', desc: 'Real people. Real solutions. Our global team is always online via in-app chat, WhatsApp and Discord — any time.', color: C.purple },
              { icon: Lock, title: 'Zero Hidden Fees', desc: 'Flat 0.5% fee on completed trades only. No listing fees, no withdrawal fees, no monthly plans. Pay only when you win.', color: C.danger },
            ].map(({ icon: Icon, title, desc, color }, i) => (
              <div key={title}
                className={`card-up bg-white rounded-2xl p-6 border ${featOn ? 'anim-up' : ''}`}
                style={{ opacity: featOn ? 1 : 0, borderColor: C.g100, animationDelay: `${i * .07}s` }}>
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4"
                  style={{ background: `${color}15` }}>
                  <Icon size={22} style={{ color }} />
                </div>
                <h3 className="font-black text-sm mb-2" style={{ color: C.forest }}>{title}</h3>
                <p className="text-xs leading-relaxed" style={{ color: C.g500 }}>{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════
          5. ESCROW TRUST SECTION
      ══════════════════════════════════════════════════ */}
      <section ref={escrowRef} className="py-10 md:py-20 px-4" style={{ background: '#fff' }}>
        <div className="max-w-5xl mx-auto">
          <div className="grid md:grid-cols-2 gap-12 items-center">

            {/* left */}
            <div className={escrowOn ? 'anim-up' : ''} style={{ opacity: escrowOn ? 1 : 0 }}>
              <Label>Zero-Risk Trading</Label>
              <h2 className="text-2xl md:text-3xl font-black mb-4"
                style={{ fontFamily: "'Syne',sans-serif", color: C.forest }}>
                How Our Escrow Keeps<br />Your Money Safe
              </h2>
              <p className="text-sm leading-relaxed mb-6" style={{ color: C.g500 }}>
                Every PRAQEN trade is protected by our escrow system. Bitcoin is locked the moment a trade starts.
                No seller can run away with your money. No buyer can claim they paid without proof.
                You're always 100% protected.
              </p>
              <div className="space-y-4">
                {[
                  { icon: Lock, title: 'BTC Locks Automatically', desc: "Seller's BTC is locked in escrow the instant a trade opens. Zero manual steps needed.", color: C.green },
                  { icon: Shield, title: 'Both Parties Protected', desc: 'Buyer pays, seller confirms receipt. Neither side can cheat — every step is verified.', color: C.paid },
                  { icon: CheckCircle, title: 'Instant & Guaranteed', desc: 'Once confirmed by both sides, BTC is released instantly to the buyer. Safe every time.', color: C.success },
                ].map(({ icon: Icon, title, desc, color }) => (
                  <div key={title} className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ background: `${color}15` }}>
                      <Icon size={18} style={{ color }} />
                    </div>
                    <div>
                      <p className="font-black text-sm mb-0.5" style={{ color: C.forest }}>{title}</p>
                      <p className="text-xs leading-relaxed" style={{ color: C.g500 }}>{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* right — flow diagram */}
            <div className={`${escrowOn ? 'anim-up' : ''} float`}
              style={{ opacity: escrowOn ? 1 : 0, animationDelay: '.2s' }}>
              <div className="rounded-3xl p-6 border" style={{ background: C.g50, borderColor: C.g200 }}>
                <p className="text-xs font-black uppercase tracking-widest mb-5 text-center" style={{ color: C.mint }}>
                  Escrow Flow — Every Trade
                </p>
                <div className="space-y-3">
                  {[
                    {from:'Buyer',  action:'Opens trade &amp; locks funds in view', to:'Escrow', icon:CreditCard,   color:C.paid   },
{from:'Seller', action:'BTC locked automatically',              to:'Escrow', icon:Lock,         color:C.forest },
{from:'Buyer',  action:'Sends local payment',                  to:'Seller', icon:Smartphone,   color:C.gold   },
{from:'Seller', action:'Confirms payment received',             to:'Escrow', icon:CheckCircle,  color:C.success},
{from:'Escrow', action:'Releases BTC to buyer instantly',       to:'Buyer',  icon:Zap,          color:C.green  },
                  ].map(({ from, action, to, icon, color }, i) => (
                    <div key={i} className="flex items-center gap-3 p-3 rounded-2xl bg-white border"
                      style={{ borderColor: C.g200 }}>
                      <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 text-sm"
style={{background:`${color}12`}}>{React.createElement(icon, {size:15, style:{color}})}</div>                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 text-xs">
                          <span className="font-black" style={{ color }}>{from}</span>
                          <span style={{ color: C.g400 }}>→</span>
                          <span className="font-bold" style={{ color: C.g600 }}>{to}</span>
                        </div>
                        <p className="text-xs" style={{ color: C.g400 }}
                          dangerouslySetInnerHTML={{ __html: action }} />
                      </div>
                      <div className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-black flex-shrink-0"
                        style={{ background: `${color}20`, color }}>{i + 1}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 p-3 rounded-2xl text-xs font-bold text-center"
                  style={{ background: `${C.success}10`, color: C.success, border: `1px solid ${C.success}20` }}>
<Shield size={13} style={{display:'inline',marginRight:4,verticalAlign:'-2px'}}/> Your funds are always protected — 100% guaranteed                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════
          6. PAYMENT METHODS
      ══════════════════════════════════════════════════ */}
      <section ref={paymentsRef} className="py-10 md:py-16 px-4" style={{ background: C.g50, borderTop: `1px solid ${C.g200}`, borderBottom: `1px solid ${C.g200}` }}>
        <div className="max-w-5xl mx-auto">
          <div className={`text-center mb-7 md:mb-10 ${paymentsOn ? 'anim-up' : ''}`} style={{ opacity: paymentsOn ? 1 : 0 }}>
            <Label>Payment Methods</Label>
            <h2 className="text-xl md:text-3xl font-black mb-2"
              style={{ fontFamily: "'Syne',sans-serif", color: C.forest }}>
              Trade With Your Local Currency &amp; Method
            </h2>
            <p className="text-sm" style={{ color: C.g500 }}>
              Over 100 payment methods across Africa, Asia, Europe and the Americas.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5">
            {[
              { cat:'Mobile Money',  CatIcon:Smartphone, color:C.green, items: ['MTN MoMo', 'Vodafone Cash', 'M-Pesa', 'Wave', 'Orange Money', 'Airtel Money', 'Tigo Cash'] },
              { cat:'Bank Transfer', CatIcon:Building2, color: C.paid, items: ['Bank Transfer', 'SEPA', 'SWIFT', 'ACH', 'CHAPS', 'Faster Payments', 'Wire Transfer'] },
              { cat: 'E-Wallets', CatIcon:CreditCard, color: C.purple, items: ['WeChat Pay', 'Alipay', 'PayPal', 'Wise', 'Revolut', 'Zelle', 'OPay', 'PalmPay', 'Cash App', 'Venmo'] },
              { cat: 'Gift Cards', CatIcon:Gift, color: C.gold, items: ['Amazon', 'iTunes / App Store', 'Google Play', 'Steam', 'eBay', 'Visa Gift Card', 'PlayStation', 'Xbox'] },
            ].map(({ cat, CatIcon, color, items }, gi) => (
              <div key={cat}
                className={`bg-white rounded-2xl p-5 border ${paymentsOn ? 'anim-up' : ''}`}
                style={{ opacity: paymentsOn ? 1 : 0, borderColor: C.g200, animationDelay: `${gi * .1}s` }}>
                <CatIcon size={20} style={{ color }} />
                <p className="font-black text-sm mb-3" style={{ color }}>{cat}</p>
                <div className="flex flex-wrap gap-2">
                  {items.map(p => (
                    <span key={p} className="px-2.5 py-1.5 text-xs font-bold rounded-xl"
                      style={{ background: `${color}10`, color, border: `1px solid ${color}30` }}>{p}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════
          7. GLOBAL REACH
      ══════════════════════════════════════════════════ */}
      <section ref={countriesRef} className="py-10 md:py-20 px-4" style={{ background: '#fff' }}>
        <div className="max-w-5xl mx-auto">
          <div className={`text-center mb-7 md:mb-10 ${countriesOn ? 'anim-up' : ''}`} style={{ opacity: countriesOn ? 1 : 0 }}>
            <Label>Global Reach</Label>
            <h2 className="text-2xl md:text-3xl font-black mb-3"
              style={{ fontFamily: "'Syne',sans-serif", color: C.forest }}>
              Available Worldwide
            </h2>
            <p className="text-sm max-w-lg mx-auto" style={{ color: C.g500 }}>
              180+ countries supported. Trade in your local currency with local payment methods — wherever you are.
            </p>
          </div>

          <div className={`grid grid-cols-3 sm:grid-cols-6 gap-2 sm:gap-4 mb-8 md:mb-10 ${countriesOn ? 'anim-up' : ''}`}
            style={{ opacity: countriesOn ? 1 : 0, animationDelay: '.1s' }}>
            {[
              { flag: '🇨🇳', name: 'China' }, { flag: '🇩🇪', name: 'Germany' },
              { flag: '🇬🇧', name: 'UK' }, { flag: '🇺🇸', name: 'USA' },
              { flag: '🇯🇵', name: 'Japan' }, { flag: '🇮🇳', name: 'India' },
              { flag: '🇦🇪', name: 'UAE' }, { flag: '🇳🇬', name: 'Nigeria' },
              { flag: '🇬🇭', name: 'Ghana' }, { flag: '🇰🇪', name: 'Kenya' },
              { flag: '🇿🇦', name: 'S. Africa' }, { flag: '🇸🇳', name: 'Senegal' },
            ].map(({ flag, name }) => (
              <div key={name} className="card-up bg-white rounded-2xl p-3 border text-center"
                style={{ borderColor: C.g200 }}>
                <div className="text-2xl mb-1">{flag}</div>
                <p className="text-xs font-bold" style={{ color: C.forest }}>{name}</p>
              </div>
            ))}
          </div>

          {/* platform stats row */}
          <div className={`grid grid-cols-2 md:grid-cols-4 gap-5 ${countriesOn ? 'anim-up' : ''}`}
            style={{ opacity: countriesOn ? 1 : 0, animationDelay: '.2s' }}>
            {[
              {icon:Globe,        v:'180+',  l:'Countries'},
{icon:ArrowLeftRight,v:'$1.2B+',l:'Volume Traded'},
{icon:Shield,        v:'99.8%', l:'Dispute Resolution'},
{icon:Zap,           v:'8 min', l:'Average Trade Time'},
            ].map(({ icon: Icon, v, l }) => (
              <div key={l} className="rounded-2xl p-5 text-center border"
                style={{ background: C.mist, borderColor: `${C.mint}30` }}>
                <div className="flex justify-center mb-2"><Icon size={24} style={{ color: C.gold }} /></div>
                <p className="text-2xl font-black mb-0.5" style={{ color: C.forest }}>{v}</p>
                <p className="text-xs" style={{ color: C.g500 }}>{l}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════
          8. TESTIMONIALS
      ══════════════════════════════════════════════════ */}
      <section ref={testimonialsRef} className="py-10 md:py-20 px-4" style={{ background: C.g50 }}>
        <div className="max-w-5xl mx-auto">
          <div className={`text-center mb-8 md:mb-12 ${testimonialsOn ? 'anim-up' : ''}`} style={{ opacity: testimonialsOn ? 1 : 0 }}>
            <Label>Real Traders</Label>
            <h2 className="text-2xl md:text-4xl font-black mb-2"
              style={{ fontFamily: "'Syne',sans-serif", color: C.forest }}>
              Loved Around the World
            </h2>
            <p className="text-sm" style={{ color: C.g500 }}>
              Join millions of traders who trust PRAQEN every day.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-4 md:gap-5">
            {[
              {
                name: 'Wei L.', loc: 'Shanghai, China', flag: '🇨🇳', color: C.paid, av: 'W', badge: 'Power Trader', trades: '78 trades',
                text: '"通过PRAQEN交易比特币非常安全方便！微信支付和支付宝都支持，整个流程透明清晰。托管系统让我完全放心，强烈推荐给每一位交易者！" (Excellent — WePay & Alipay work perfectly!)'
              },
              {
                name: 'Lars B.', loc: 'Berlin, Germany', flag: '🇩🇪', color: C.green, av: 'L', badge: 'Verified', trades: '41 trades',
                text: '"PRAQEN ist die beste P2P-Plattform, die ich je genutzt habe. SEPA-Überweisungen funktionieren reibungslos, der Escrow-Schutz gibt mir totale Sicherheit. Perfekt für europäische Händler!"'
              },
              {
                name: 'James M.', loc: 'Nairobi, Kenya', flag: '🇰🇪', color: C.purple, av: 'J', badge: 'Top Seller', trades: '94 trades',
                text: '"Best Bitcoin rates around. M-Pesa integration is flawless — I receive payment within 5 minutes every time. The escrow never fails. Already referred 20+ people to PRAQEN!"'
              },
            ].map(({ name, loc, flag, color, av, badge, trades, text }, i) => (
              <div key={name}
                className={`card-up bg-white rounded-2xl p-6 border ${testimonialsOn ? 'anim-up' : ''}`}
                style={{ opacity: testimonialsOn ? 1 : 0, borderColor: C.g200, animationDelay: `${i * .1}s` }}>
                <div className="flex gap-0.5 mb-4">
                  {[0, 1, 2, 3, 4].map(s => (
                    <svg key={s} width="14" height="14" viewBox="0 0 24 24" fill={C.gold}>
                      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                    </svg>
                  ))}
                </div>
                <p className="text-sm leading-relaxed mb-5" style={{ color: C.g700 }}>{text}</p>
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center font-black text-white flex-shrink-0 text-base"
                    style={{ background: color }}>{av}</div>
                  <div className="flex-1 min-w-0">
                    <p className="font-black text-sm" style={{ color: C.forest }}>{name} {flag}</p>
                    <p className="text-xs" style={{ color: C.g400 }}>{loc} · {trades}</p>
                  </div>
                  <span className="text-xs font-black px-2 py-0.5 rounded-full flex-shrink-0"
                    style={{ background: `${color}15`, color }}>{badge}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════
          8.5 BONUS + AFFILIATE INVITE BANNER
      ══════════════════════════════════════════════════ */}
      <section className="py-10 md:py-16 px-4" style={{ background: '#fff' }}>
        <div className="max-w-5xl mx-auto">

          {user ? (
            /* ── LOGGED-IN: invite friends + referral link ── */
            <div className="rounded-3xl overflow-hidden shadow-lg"
              style={{ background: `linear-gradient(135deg,${C.forest} 0%,#0c2418 55%,${C.green} 100%)`, border: `2px solid ${C.gold}30` }}>
              {/* dot grid */}
              <div className="absolute pointer-events-none inset-0 rounded-3xl"
                style={{ backgroundImage: 'radial-gradient(circle at 2px 2px,rgba(255,255,255,.04) 1px,transparent 0)', backgroundSize: '22px 22px' }} />
              <div className="relative p-6 md:p-10">
                <div className="flex flex-col md:flex-row items-start md:items-center gap-8">

                  {/* left — text */}
                  <div className="flex-1 min-w-0">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold mb-4"
                      style={{ background: `${C.gold}20`, border: `1px solid ${C.gold}35`, color: C.gold }}>
                      <UserPlus size={12} /> Affiliate Programme
                    </div>
                    <h2 className="text-xl md:text-3xl font-black text-white mb-2"
                      style={{ fontFamily: "'Syne',sans-serif" }}>
                      Invite Friends.<br className="hidden md:block" />
                      <span className="grad-text">Earn Bitcoin Together.</span>
                    </h2>
                    <p className="text-sm mb-5" style={{ color: 'rgba(255,255,255,.65)' }}>
                      Share your link — earn <strong style={{ color: '#FDE68A' }}>0.1–0.3% BTC commission</strong> on
                      every trade your referrals complete. No cap, no expiry.
                    </p>

                    {/* referral link box */}
                    <div className="flex gap-2 mb-4">
                      <div className="flex-1 flex items-center gap-2 px-3 py-2.5 rounded-xl"
                        style={{ background: 'rgba(255,255,255,.09)', border: '1px solid rgba(255,255,255,.15)' }}>
<Link2 size={13} style={{color:'rgba(255,255,255,.35)'}}/>
                        <p className="flex-1 text-xs font-mono truncate" style={{ color: 'rgba(255,255,255,.75)' }}>
                          praqen.com/signup?ref={user.referral_code || '...'}
                        </p>
                      </div>
                      <button
                        onClick={() => {
                          const link = `https://praqen.com/signup?ref=${user.referral_code || ''}`;
                          copyToClipboard(link, 'Referral link copied!')
                            .then((ok) => { if (ok) { setCopied(true); setTimeout(() => setCopied(false), 2200); } });
                        }}
                        className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl font-black text-xs flex-shrink-0 transition"
                        style={{ background: copied ? C.mint : C.gold, color: copied ? '#fff' : C.forest }}>
                        {copied ? <><CheckCircle size={12} /> Copied!</> : <><Copy size={12} /> Copy</>}
                      </button>
                    </div>

                    {/* share buttons */}
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => {
                          const link = `https://praqen.com/signup?ref=${user.referral_code || ''}`;
                          const text = `Join me on PRAQEN — earn $2 free BTC when you sign up!`;
                          window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(link)}`, '_blank');
                        }}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl font-bold text-xs transition hover:opacity-90"
                        style={{ background: '#000', color: '#fff' }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.748l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
                        X / Twitter
                      </button>
                      <button
                        onClick={() => {
                          if (navigator.share) {
                            navigator.share({
                              title: 'Earn $2 Bitcoin free on PRAQEN',
                              text: `Join me on PRAQEN — the safest P2P Bitcoin platform worldwide. Get $2 free BTC!`,
                              url: `https://praqen.com/signup?ref=${user.referral_code || ''}`,
                            }).catch(() => { });
                          }
                        }}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl font-bold text-xs transition hover:opacity-90"
                        style={{ background: 'rgba(255,255,255,.1)', color: 'rgba(255,255,255,.75)', border: '1px solid rgba(255,255,255,.15)' }}>
                        <Share2 size={12} /> More…
                      </button>
                    </div>
                  </div>

                  {/* right — earn stats */}
                  <div className="flex-shrink-0 w-full md:w-56">
                    <div className="rounded-2xl p-5 text-center"
                      style={{ background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.12)' }}>
                      <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-3"
                        style={{ background: `${C.gold}25`, border: `1px solid ${C.gold}40` }}>
                        <Gift size={26} color={C.gold} />
                      </div>
                      <p className="font-black text-white text-base mb-1">$2 BTC Bonus</p>
                      <p className="text-xs mb-3" style={{ color: 'rgba(255,255,255,.5)' }}>
                        Your friends earn $2 in free Bitcoin when they join via your link.
                      </p>
                      <div className="space-y-1.5">
                        {[
                          { dot: C.gold, text: 'They register → $1 BTC locked' },
                          { dot: C.mint, text: 'They verify  → $1 stays locked' },
                          { dot: C.online, text: 'First trade   → $2 unlocked!' },
                        ].map(({ dot, text }) => (
                          <div key={text} className="flex items-center gap-2 text-left">
                            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: dot }} />
                            <span className="text-xs" style={{ color: 'rgba(255,255,255,.6)' }}>{text}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                </div>
              </div>
            </div>

          ) : (

            /* ── VISITOR: show the $2 BTC bonus offer ── */
            <div className="rounded-3xl overflow-hidden shadow-xl"
              style={{ background: `linear-gradient(135deg,${C.forest} 0%,#0c2418 55%,${C.green} 100%)`, border: `2px solid ${C.gold}35` }}>
              <div className="p-6 md:p-10">
                <div className="flex flex-col md:flex-row items-center gap-8 md:gap-12">

                  {/* left — headline */}
                  <div className="flex-1 text-center md:text-left">
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold mb-5"
                      style={{ background: `${C.gold}20`, border: `1px solid ${C.gold}40`, color: C.gold }}>
                      <Gift size={12} /> Welcome Bonus · Limited Offer
                    </div>
                    <h2 className="text-2xl md:text-4xl font-black text-white mb-3"
                      style={{ fontFamily: "'Syne',sans-serif", lineHeight: 1.1 }}>
                      Earn <span className="grad-text">$2 in Bitcoin</span><br />
                      Just for Joining PRAQEN
                    </h2>
                    <p className="text-sm mb-6 max-w-md mx-auto md:mx-0" style={{ color: 'rgba(255,255,255,.65)' }}>
                      New accounts get $1 BTC locked on sign-up. Verify your account, complete your first trade — and the full $2 unlocks instantly to your wallet.
                    </p>
                    <button onClick={() => goTo('/register')}
                      className="inline-flex items-center gap-2 px-8 py-4 rounded-2xl font-black text-base hover:opacity-90 active:scale-95 transition"
                      style={{ background: C.gold, color: C.forest, boxShadow: `0 4px 22px ${C.gold}50` }}>
                      <Gift size={18} /> Claim My $2 Bonus <ArrowRight size={16} />
                    </button>
                    <p className="mt-3 text-xs" style={{ color: 'rgba(255,255,255,.35)' }}>
                      Free · No credit card · Offer valid 30 days after sign-up
                    </p>
                  </div>

                  {/* right — 3 steps */}
                  <div className="flex-shrink-0 w-full md:w-64 space-y-3">
                    {[
                      { num: 1, icon: <CheckCircle size={18} />, color: C.gold, title: 'Create Account', desc: '$1 BTC locked instantly' },
                      { num: 2, icon: <Zap size={18} />, color: C.mint, title: 'Verify Account', desc: 'Your $1 stays safe & locked' },
                      { num: 3, icon: <Bitcoin size={18} />, color: C.online, title: 'Complete 1 Trade', desc: '$2 BTC unlocks to your wallet' },
                    ].map(({ num, icon, color, title, desc }) => (
                      <div key={num} className="flex items-center gap-3 rounded-xl p-3"
                        style={{ background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.1)' }}>
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                          style={{ background: `${color}25`, color, border: `1px solid ${color}40` }}>
                          {icon}
                        </div>
                        <div>
                          <p className="font-black text-white text-sm">{title}</p>
                          <p className="text-xs" style={{ color: 'rgba(255,255,255,.55)' }}>{desc}</p>
                        </div>
                        <span className="ml-auto text-xs font-black px-2 py-0.5 rounded-full flex-shrink-0"
                          style={{ background: `${color}20`, color }}>{num}</span>
                      </div>
                    ))}
                  </div>

                </div>
              </div>
            </div>

          )}
        </div>
      </section>

      {/* ══════════════════════════════════════════════════
          9. TRADING HUB CTA BANNER
      ══════════════════════════════════════════════════ */}
      <section className="py-12 md:py-20 px-4 relative overflow-hidden"
        style={{ background: `linear-gradient(140deg,${C.forest},#0c2418,${C.green})` }}>
        <div className="absolute inset-0 pointer-events-none"
          style={{ backgroundImage: 'radial-gradient(circle at 2px 2px,rgba(255,255,255,.05) 1px,transparent 0)', backgroundSize: '26px 26px' }} />
        <div className="absolute right-0 top-0 rounded-full blur-3xl pointer-events-none"
          style={{ width: 'min(400px,60vw)', height: 'min(400px,60vw)', background: C.gold, opacity: .07 }} />
        <div className="relative max-w-3xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold mb-6"
            style={{ background: `${C.gold}20`, color: C.gold, border: `1px solid ${C.gold}30` }}>
            <Flame size={12} /> PRAQEN TRADING HUB
          </div>
          <h2 className="text-2xl md:text-4xl font-black text-white mb-4"
            style={{ fontFamily: "'Syne',sans-serif" }}>
            {user ? 'Keep Trading. Keep Growing.' : 'Join 2.4M+ Traders Today.'}<br />
            <span className="grad-text">Start in 30 Seconds.</span>
          </h2>
          <p className="text-white/60 mb-7 max-w-md mx-auto text-sm md:text-base">
            {user
              ? 'Explore new offers, create listings and grow your trade volume on the world\'s most trusted P2P platform.'
              : 'No bank account needed. Create your free account, choose a seller and make your first trade today.'}
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center mb-8">
            {user ? (
              <>
                <button onClick={() => goTo('/buy-bitcoin')}
                  className="w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-4 rounded-2xl font-black text-base hover:opacity-90 active:scale-95 transition"
                  style={{ background: C.gold, color: C.forest, boxShadow: `0 4px 22px ${C.gold}45` }}>
                  <Bitcoin size={18} /> Buy Bitcoin Now <ArrowRight size={16} />
                </button>
                <button onClick={() => goTo('/create-offer')}
                  className="w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-4 rounded-2xl font-black text-base hover:bg-white/20 active:scale-95 transition"
                  style={{ background: 'rgba(255,255,255,.1)', color: '#fff', border: '2px solid rgba(255,255,255,.25)' }}>
                  Create an Offer
                </button>
              </>
            ) : (
              <>
                <button onClick={() => goTo('/register')}
                  className="w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-4 rounded-2xl font-black text-base hover:opacity-90 active:scale-95 transition"
                  style={{ background: C.gold, color: C.forest, boxShadow: `0 4px 22px ${C.gold}45` }}>
                  Create Free Account <ArrowRight size={16} />
                </button>
                <button onClick={() => goTo('/buy-bitcoin')}
                  className="w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-4 rounded-2xl font-black text-base hover:bg-white/20 active:scale-95 transition"
                  style={{ background: 'rgba(255,255,255,.1)', color: '#fff', border: '2px solid rgba(255,255,255,.25)' }}>
                  Browse Marketplace
                </button>
              </>
            )}
          </div>
          <div className="flex flex-wrap justify-center gap-6 pt-6 border-t" style={{ borderColor: 'rgba(255,255,255,.1)' }}>
            {[
              { icon: Users, label: '2.4M+ Active Traders' },
              { icon: Globe, label: '180+ Countries' },
              { icon: HeadphonesIcon, label: '24/7 Live Support' },
              { icon: Lock, label: 'SSL Encrypted' },
            ].map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center gap-1.5 text-xs"
                style={{ color: 'rgba(255,255,255,.5)' }}>
                <Icon size={13} /> {label}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════
          10. FAQ
      ══════════════════════════════════════════════════ */}
      <section className="py-10 md:py-20 px-4" style={{ background: C.g50 }}>
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-7 md:mb-10">
            <Label>Help Center</Label>
            <h2 className="text-2xl md:text-3xl font-black"
              style={{ fontFamily: "'Syne',sans-serif", color: C.forest }}>
              Common Questions
            </h2>
          </div>
          <div className="space-y-3">
            {[
              { q: 'Is PRAQEN safe to use?', a: 'Absolutely. Every trade uses our escrow system — Bitcoin is locked before any money changes hands. Our dispute team resolves any issue within 24 hours. Your funds are always 100% protected.' },
              { q: 'How does escrow work?', a: "When a trade starts, the seller's Bitcoin is automatically locked in our escrow. You send your payment. Once the seller confirms receipt, BTC is instantly released to your wallet. Neither party can touch the funds during the trade." },
              { q: 'What are the fees?', a: 'We charge a flat 0.5% fee on completed trades only. No listing fees, no withdrawal fees, no monthly subscriptions. You pay absolutely nothing until a trade succeeds.' },
              { q: 'How long does a trade take?', a: 'Mobile money trades (MTN, M-Pesa, OPay) typically complete in 5–15 minutes. Bank transfers take 15–30 minutes. We average under 8 minutes across all payment methods.' },
              { q: 'What happens if there is a dispute?', a: 'Open a dispute inside the trade chat with evidence. Our neutral support team reviews both sides and resolves it quickly — your Bitcoin stays locked safe in escrow throughout the entire process.' },
              { q: 'Which countries are supported?', a: '180+ countries worldwide. We have deep local payment support in Africa (Ghana, Nigeria, Kenya, South Africa), Asia (China, India, Japan, UAE), Europe (Germany, UK, France) and the Americas (USA, Canada, Brazil) — with more regions added regularly.' },
              { q: 'Can I create my own trading offers?', a: 'Yes! As a verified trader you can post your own offers with your preferred rate, payment method, trade limits and terms. Your offer, your rules. Thousands of traders will see it instantly.' },
            ].map(({ q, a }, i) => (
              <div key={i} className="bg-white rounded-2xl border overflow-hidden transition-colors"
                style={{ borderColor: faq === i ? C.mint : C.g200 }}>
                <button onClick={() => setFaq(faq === i ? null : i)}
                  className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-50 transition">
                  <span className="font-bold text-sm pr-4" style={{ color: C.forest }}>{q}</span>
                  <ChevronDown size={16} style={{
                    color: faq === i ? C.mint : C.g400,
                    transform: faq === i ? 'rotate(180deg)' : 'none',
                    transition: 'transform .25s, color .2s',
                    flexShrink: 0,
                  }} />
                </button>
                {faq === i && (
                  <div className="px-5 pb-5 text-sm leading-relaxed border-t"
                    style={{ borderColor: C.g100, color: C.g600 }}>
                    <p className="pt-4">{a}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="text-center mt-8">
            <p className="text-sm mb-3" style={{ color: C.g500 }}>Still have questions?</p>
            <a href="mailto:hello@praqen.com"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm border hover:bg-gray-50 transition"
              style={{ borderColor: C.g200, color: C.forest }}>
              <Mail size={14} /> hello@praqen.com
            </a>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════
          11. FOOTER
      ══════════════════════════════════════════════════ */}
      <footer style={{ background: C.forest }}>
        <div className="max-w-3xl mx-auto px-4 py-10 text-center">

          {/* brand */}
          <div className="flex items-center justify-center gap-2 mb-2">
            <span className="text-2xl font-black" style={{ fontFamily: "'Syne',sans-serif" }}>
              <span className="text-white">PRA</span><span style={{ color: C.gold }}>QEN</span>
            </span>
            <span className="text-xs font-black px-1.5 py-0.5 rounded-full"
              style={{ background: '#EF4444', color: '#fff' }}>BETA</span>
          </div>
          <p className="text-xs mb-5" style={{ color: 'rgba(255,255,255,.45)' }}>
            The world's most trusted P2P Bitcoin &amp; USDT platform · Escrow-protected · 0.5% flat fee
          </p>

          {/* key links */}
          <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 mb-6">
            {[
              { l: 'Buy Bitcoin', t: '/buy-bitcoin' },
              { l: 'Sell Bitcoin', t: '/sell-bitcoin' },
              { l: 'Gift Cards', t: '/gift-cards' },
              { l: 'Blog', t: '/blog' },
              { l: 'Privacy', t: '/privacy' },
              { l: 'Terms', t: '/terms' },
              { l: 'My Wallet', t: '/wallet' },
              { l: 'Dashboard', t: '/dashboard' },
              { l: 'Register', t: '/register' },
            ].map(({ l, t }) => (
              <Link key={l} to={t}
                className="text-xs font-bold hover:text-white transition"
                style={{ color: 'rgba(255,255,255,.5)' }}>{l}</Link>
            ))}
          </div>

          {/* social icons */}
          <div className="flex justify-center gap-2.5 mb-6 flex-wrap">
            {[
              { label: 'TikTok', href: 'https://www.tiktok.com/@praqen', bg: 'rgba(0,0,0,0.55)', color: '#ffffff', d: 'M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z' },
              { label: 'Instagram', href: 'https://www.instagram.com/praqen?igsh=MTRkZWg2amp5YnJlYQ%3D%3D&utm_source=qr', bg: 'rgba(228,64,95,.3)', color: '#E4405F', d: 'M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z' },
              { label: 'X (Twitter)', href: 'https://x.com/praqenapp?s=21', bg: 'rgba(255,255,255,.12)', color: '#ffffff', d: 'M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z' },
              { label: 'Discord', href: 'https://discord.gg/V6zCZxfdy', bg: 'rgba(88,101,242,.35)', color: '#5865F2', d: 'M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z' },
              { label: 'LinkedIn', href: 'https://www.linkedin.com/in/pra-qen-045373402/', bg: 'rgba(10,102,194,.35)', color: '#0A66C2', d: 'M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z' },
            ].map(({ label, href, bg, color, d }) => (
              <a key={label} href={href} target="_blank" rel="noopener noreferrer" title={label}
                className="w-9 h-9 rounded-xl flex items-center justify-center hover:scale-110 transition-transform"
                style={{ background: bg }}>
                <svg viewBox="0 0 24 24" width="17" height="17" fill={color} aria-hidden="true">
                  <path d={d} />
                </svg>
              </a>
            ))}
          </div>

          {/* support + copyright */}
          <div className="border-t pt-5" style={{ borderColor: 'rgba(255,255,255,.08)' }}>
            <a href="mailto:hello@praqen.com"
              className="inline-flex items-center gap-1.5 text-xs font-bold hover:text-white transition mb-3"
              style={{ color: C.gold }}>
              <Mail size={12} /> hello@praqen.com · 24/7 support
            </a>
            <p className="text-xs" style={{ color: 'rgba(255,255,255,.25)' }}>
              © {new Date().getFullYear()} PRAQEN · All rights reserved · Not financial advice
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
