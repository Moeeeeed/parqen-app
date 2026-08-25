import { useState, useEffect, useRef } from 'react';
import { X, ChevronLeft, ChevronRight, ArrowRight, ThumbsUp, ThumbsDown, Repeat2, BadgeCheck } from 'lucide-react';

const C = { g500: '#64748B', g200: '#E2E8F0', g400: '#94A3B8' };
const AUTO_ADVANCE_MS = 5000;

// Live-ad-style rotating banner for the weekly pinned/featured offers (Active
// Trader of the Week, High Volume Trader of the Week, etc.) — sits in the exact
// same box slot the "New here?" onboarding banner uses, so the two never stack.
// slides: [{ id, featured (a FEATURED[type] style object — TagIcon/tag/ribbon/
//   border/btnGradient), avatar (node), badgeChip (node), username, verified,
//   countryCode, trades, positive, negative, rateLabel, actionLabel, onClick }]
export default function PinnedOfferBanner({ slides, dismissKey, intervalMs = AUTO_ADVANCE_MS, title = 'Live Pinned Offers' }) {
  const [dismissed, setDismissed] = useState(false);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const timerRef = useRef(null);

  const count = slides?.length || 0;
  // Clamp instead of reset-to-0 — the underlying listing set can shrink between
  // polls (an offer went stale) without yanking focus back to the first slide.
  const safeIndex = count > 0 ? Math.min(index, count - 1) : 0;

  useEffect(() => {
    if (count <= 1 || paused) return;
    // Manual prev/next/dot clicks call setIndex directly (see below), which
    // resets this effect via the `count`/`paused` deps — so the auto-advance
    // interval never blocks or delays a manual navigation.
    timerRef.current = setInterval(() => setIndex(i => (i + 1) % count), intervalMs);
    return () => clearInterval(timerRef.current);
  }, [count, paused, intervalMs]);

  const key = dismissKey ? `prq_pinned_offer_dismissed_${dismissKey}` : null;
  if (dismissed || (key && typeof window !== 'undefined' && localStorage.getItem(key)) || count === 0) return null;

  const handleDismiss = () => {
    if (key) localStorage.setItem(key, '1');
    setDismissed(true);
  };

  const slide = slides[safeIndex];
  const ft = slide.featured;

  return (
    <div className="flex-shrink-0 px-3 pt-3">
      <div
        className="max-w-7xl mx-auto rounded-2xl overflow-hidden shadow-sm border relative"
        style={{ borderColor: ft.border }}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
        {/* Header stripe */}
        <div className="flex items-center justify-between gap-2 px-4 py-2.5" style={{ background: ft.ribbon }}>
          <span className="text-xs sm:text-sm font-black text-white tracking-wide inline-flex items-center gap-1.5">
            <span className="relative flex w-2 h-2 flex-shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-60" />
              <span className="relative inline-flex rounded-full w-2 h-2 bg-white" />
            </span>
            {title}{count > 1 ? ` · ${safeIndex + 1}/${count}` : ''}
          </span>
          <button onClick={handleDismiss} className="flex-shrink-0 opacity-70 hover:opacity-100" title="Dismiss">
            <X size={14} color="#fff" />
          </button>
        </div>

        {/* Sliding track */}
        <div className="overflow-hidden" style={{ backgroundColor: '#fff' }}>
          <div
            className="flex"
            style={{ transform: `translateX(-${safeIndex * 100}%)`, transition: 'transform 0.5s ease' }}
          >
            {slides.map(s => {
              const sft = s.featured;
              return (
              <div key={s.id} className="w-full flex-shrink-0 px-3.5 py-3 sm:px-4 sm:py-3.5 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:gap-3">
                {/* Identity — its own full-width row on phones, left column on sm+ */}
                <div className="flex items-center gap-2.5 min-w-0 sm:flex-1">
                  {s.avatar}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                      <span className="font-black text-sm truncate" style={{ color: '#1E293B', maxWidth: '55vw' }}>{s.username || 'Trader'}</span>
                      {s.verified && <BadgeCheck size={13} style={{ color: '#3B82F6', flexShrink: 0 }} />}
                      <span className="flex-shrink-0">{s.badgeChip}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="inline-flex items-center gap-0.5 font-bold" style={{ color: '#16A34A', fontSize: 11 }}>
                        <ThumbsUp size={10} strokeWidth={2.5} />{s.positive ?? 0}
                      </span>
                      <span className="inline-flex items-center gap-0.5 font-bold" style={{ color: '#EF4444', fontSize: 11 }}>
                        <ThumbsDown size={10} strokeWidth={2.5} />{s.negative ?? 0}
                      </span>
                      <span className="inline-flex items-center gap-1 font-semibold" style={{ color: C.g500, fontSize: 11 }}>
                        <Repeat2 size={10} strokeWidth={2.5} style={{ color: C.g400 }} />{s.trades ?? 0} trades
                      </span>
                    </div>
                    {s.volumeLabel && (
                      <div className="mt-0.5 font-black truncate" style={{ color: sft.labelColor, fontSize: 11 }}>
                        Volume: {s.volumeLabel}
                      </div>
                    )}
                  </div>
                </div>

                {/* Featured tag — own row on phones so it never squeezes the identity block */}
                <span
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black flex-shrink-0 whitespace-nowrap w-fit"
                  style={{ backgroundColor: `${sft.border}14`, color: sft.labelColor, border: `1px solid ${sft.border}40` }}
                >
                  {sft.TagIcon && <sft.TagIcon size={11} strokeWidth={2.5} />}
                  {sft.tag}
                </span>

                {/* Rate + CTA — spread edge-to-edge on phones (full-width tap target), tight on sm+ */}
                <div className="flex items-center justify-between gap-2 sm:justify-end sm:flex-shrink-0">
                  <span className="text-xs font-bold" style={{ color: C.g500 }}>{s.rateLabel}</span>
                  <button
                    onClick={s.onClick}
                    className="inline-flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg text-xs font-black text-white flex-shrink-0"
                    style={{ background: sft.btnGradient }}
                  >
                    {s.actionLabel || 'View Offer'} <ArrowRight size={12} />
                  </button>
                </div>
              </div>
              );
            })}
          </div>
        </div>

        {/* Dots + manual nav — only worth showing when there's more than one slide */}
        {count > 1 && (
          <div className="flex items-center justify-center gap-3 py-2 border-t" style={{ borderColor: C.g200, backgroundColor: '#F8FAFC' }}>
            <button onClick={() => setIndex(i => (i - 1 + count) % count)} className="p-1 rounded-full hover:bg-gray-200 transition">
              <ChevronLeft size={14} style={{ color: C.g500 }} />
            </button>
            <div className="flex items-center gap-1.5">
              {slides.map((s, i) => (
                <button
                  key={s.id}
                  onClick={() => setIndex(i)}
                  className="rounded-full transition-all"
                  style={{
                    width: i === safeIndex ? 16 : 6, height: 6,
                    backgroundColor: i === safeIndex ? ft.border : C.g200,
                  }}
                />
              ))}
            </div>
            <button onClick={() => setIndex(i => (i + 1) % count)} className="p-1 rounded-full hover:bg-gray-200 transition">
              <ChevronRight size={14} style={{ color: C.g500 }} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
