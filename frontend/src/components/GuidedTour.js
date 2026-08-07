import { useState, useEffect, useRef } from 'react';
import { useTour } from '../contexts/TourContext';
import { ArrowLeft, ArrowRight, X } from 'lucide-react';

export default function GuidedTour() {
  const { isActive, currentStep, currentStepIndex, totalSteps, nextStep, prevStep, stopTour } = useTour();
  const [targetRect, setTargetRect] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ top: 0, left: 0 });
  const tooltipRef = useRef(null);

  // Update target rect and position on step change, scroll, or window resize
  useEffect(() => {
    if (!isActive || !currentStep?.selector) {
      setTargetRect(null);
      return;
    }

    const updatePosition = () => {
      const el = document.querySelector(currentStep.selector);
      if (!el) {
        setTargetRect(null);
        return;
      }

      const rect = el.getBoundingClientRect();
      setTargetRect(rect);

      // Smooth scroll target into view if needed
      if (rect.top < 60 || rect.bottom > window.innerHeight - 60) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }

      // Compute tooltip placement
      const placement = currentStep.placement || 'bottom';
      const tooltipWidth = 300;
      const tooltipHeight = 140;
      const gap = 12;

      let top = 0;
      let left = 0;

      if (placement === 'bottom') {
        top = rect.bottom + gap;
        left = rect.left + rect.width / 2 - tooltipWidth / 2;
      } else if (placement === 'top') {
        top = rect.top - tooltipHeight - gap;
        left = rect.left + rect.width / 2 - tooltipWidth / 2;
      } else if (placement === 'left') {
        top = rect.top + rect.height / 2 - tooltipHeight / 2;
        left = Math.max(10, rect.left - tooltipWidth - gap);
      } else if (placement === 'right') {
        top = rect.top + rect.height / 2 - tooltipHeight / 2;
        left = rect.right + gap;
      }

      // Constrain within viewport bounds
      left = Math.max(12, Math.min(window.innerWidth - tooltipWidth - 12, left));
      top = Math.max(12, Math.min(window.innerHeight - tooltipHeight - 12, top));

      setTooltipPos({ top, left });
    };

    updatePosition();
    const interval = setInterval(updatePosition, 300);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    return () => {
      clearInterval(interval);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isActive, currentStep]);

  if (!isActive || !currentStep || !targetRect) return null;

  return (
    <div className="fixed inset-0 z-[9999] pointer-events-none transition-all duration-300">
      {/* Semi-transparent Backdrop with Cutout Effect */}
      <div
        className="absolute inset-0 pointer-events-auto transition-opacity duration-300"
        style={{
          backgroundColor: 'rgba(15, 23, 42, 0.45)',
          backdropFilter: 'blur(1.5px)',
        }}
        onClick={stopTour}
      />

      {/* Target Focus Ring / Highlight Overlay */}
      <div
        className="absolute transition-all duration-300 ease-out pointer-events-none rounded-xl"
        style={{
          top: targetRect.top - 5,
          left: targetRect.left - 5,
          width: targetRect.width + 10,
          height: targetRect.height + 10,
          boxShadow: '0 0 0 4px #3B82F6, 0 0 20px rgba(59, 130, 246, 0.6), inset 0 0 0 2px rgba(255,255,255,0.8)',
          backgroundColor: 'transparent',
          zIndex: 10000,
        }}
      />

      {/* Blue Tooltip Card matching Demo Video */}
      <div
        ref={tooltipRef}
        className="absolute z-[10001] pointer-events-auto transition-all duration-300 ease-out w-[290px] sm:w-[320px] rounded-2xl shadow-2xl p-4 text-white"
        style={{
          top: tooltipPos.top,
          left: tooltipPos.left,
          background: 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)',
          border: '1.5px solid rgba(255, 255, 255, 0.25)',
          boxShadow: '0 12px 32px rgba(37, 99, 235, 0.45), 0 2px 8px rgba(0,0,0,0.2)',
        }}
      >
        {/* Header / Dismiss */}
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-black uppercase tracking-wider text-blue-200">
            Guide Step {currentStepIndex + 1} of {totalSteps}
          </span>
          <button
            onClick={stopTour}
            className="w-5 h-5 rounded-full flex items-center justify-center text-blue-200 hover:text-white hover:bg-white/20 transition"
          >
            <X size={12} />
          </button>
        </div>

        {/* Tooltip Content */}
        <p className="text-xs sm:text-sm font-semibold leading-relaxed mb-4 text-white">
          {currentStep.content}
        </p>

        {/* Navigation Arrow Controls matching Video */}
        <div className="flex items-center justify-between pt-1">
          <button
            onClick={stopTour}
            className="text-[11px] font-bold text-blue-200 hover:text-white underline underline-offset-2 transition"
          >
            Skip guide
          </button>

          <div className="flex items-center gap-1.5">
            <button
              onClick={prevStep}
              disabled={currentStepIndex === 0}
              className={`w-7 h-7 rounded-lg flex items-center justify-center transition border ${
                currentStepIndex === 0
                  ? 'opacity-40 cursor-not-allowed border-white/10 bg-white/5'
                  : 'bg-white/15 hover:bg-white/30 border-white/20 active:scale-95'
              }`}
              title="Previous Step"
            >
              <ArrowLeft size={13} color="#fff" />
            </button>
            <button
              onClick={nextStep}
              className="w-7 h-7 rounded-lg flex items-center justify-center transition bg-white/20 hover:bg-white/35 border border-white/30 active:scale-95"
              title="Next Step"
            >
              <ArrowRight size={13} color="#fff" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
