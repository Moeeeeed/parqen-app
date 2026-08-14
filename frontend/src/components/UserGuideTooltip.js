import React from 'react';
import { HelpCircle, X, ChevronLeft, ChevronRight, Info } from 'lucide-react';

/**
 * Modern Responsive Blue User Guide Popup Component
 * Positions cleanly next to or above/below target fields without covering input boxes.
 */
export default function UserGuideTooltip({
  title,
  body,
  example,
  icon: Icon = Info,
  step,
  totalSteps,
  onNext,
  onPrev,
  onDismiss,
  position = 'left', // 'left' | 'right' | 'top' | 'bottom' | 'inline'
  style = {},
}) {
  return (
    <div
      className={`prq-guide-popup prq-guide-${position}`}
      style={{ ...style }}
    >
      {/* Arrow element for desktop popovers */}
      {position !== 'inline' && <div className={`prq-guide-arrow prq-guide-arrow-${position}`} />}

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        {/* Left Icon */}
        <div
          style={{
            width: 26,
            height: 26,
            borderRadius: '50%',
            background: 'rgba(255, 255, 255, 0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            marginTop: 1,
          }}
        >
          <Icon size={15} style={{ color: '#FFFFFF' }} />
        </div>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
            <h4 style={{ margin: 0, fontWeight: 800, fontSize: 13, color: '#FFFFFF', lineHeight: 1.3 }}>
              {title}
            </h4>
            {totalSteps && (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: 'rgba(255, 255, 255, 0.85)',
                  background: 'rgba(255, 255, 255, 0.18)',
                  padding: '2px 6px',
                  borderRadius: 10,
                }}
              >
                {step}/{totalSteps}
              </span>
            )}
          </div>

          <p style={{ margin: '0 0 6px', fontSize: 11.5, color: 'rgba(255, 255, 255, 0.92)', lineHeight: 1.45 }}>
            {body}
          </p>

          {example && (
            <div
              style={{
                fontSize: 10.5,
                color: 'rgba(255, 255, 255, 0.75)',
                fontStyle: 'italic',
                background: 'rgba(255, 255, 255, 0.12)',
                borderRadius: 6,
                padding: '4px 8px',
                display: 'inline-block',
                marginTop: 2,
                wordBreak: 'break-word',
              }}
            >
              💡 {example}
            </div>
          )}

          {/* Stepper controls if onNext/onPrev provided */}
          {(onNext || onPrev) && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, paddingTop: 6, borderTop: '1px solid rgba(255,255,255,0.15)' }}>
              {onPrev ? (
                <button
                  onClick={onPrev}
                  type="button"
                  style={{
                    background: 'rgba(255, 255, 255, 0.15)',
                    border: 'none',
                    borderRadius: 6,
                    padding: '3px 8px',
                    fontSize: 11,
                    fontWeight: 700,
                    color: 'white',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 3,
                  }}
                >
                  <ChevronLeft size={12} /> Back
                </button>
              ) : <div />}

              {onNext && (
                <button
                  onClick={onNext}
                  type="button"
                  style={{
                    background: '#FFFFFF',
                    border: 'none',
                    borderRadius: 6,
                    padding: '3px 10px',
                    fontSize: 11,
                    fontWeight: 800,
                    color: '#1E40AF',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 3,
                  }}
                >
                  Next <ChevronRight size={12} />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Close / Dismiss button */}
        {onDismiss && (
          <button
            onClick={onDismiss}
            type="button"
            style={{
              background: 'rgba(255, 255, 255, 0.2)',
              border: 'none',
              borderRadius: '50%',
              width: 20,
              height: 20,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: 'white',
              flexShrink: 0,
              padding: 0,
              transition: 'background 0.2s',
            }}
            title="Dismiss Guide"
          >
            <X size={12} />
          </button>
        )}
      </div>
    </div>
  );
}
