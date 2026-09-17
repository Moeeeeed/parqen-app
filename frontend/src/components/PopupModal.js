import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

const C = {
  forest:'#1B4332', green:'#2D6A4F', mint:'#40916C',
  g100:'#F1F5F9', g200:'#E2E8F0', g300:'#CBD5E1',
  g400:'#94A3B8', g600:'#475569', g800:'#1E293B',
  white:'#FFFFFF', mist:'#F0FAF5',
};

/**
 * PopupModal — bottom sheet
 *
 * Single reusable bottom sheet for the dashboard redesign:
 *  - wallet three-dot menu (Receive / Send / Transfer / Swap)
 *  - Products & Services "Show all"
 *  - Account & Settings "Show all"
 *
 * Slides up from the bottom edge with rounded top corners only.
 * Backdrop tap and X button both close it (with slide-down animation).
 * Escape key also closes it.
 */
export default function PopupModal({ open, onClose, title, children }) {
  const dialogRef = useRef(null);
  const [shouldRender, setShouldRender] = useState(false);
  const [translateY, setTranslateY] = useState(100);
  const [isLocked, setIsLocked] = useState(false);

  // Open / close transition
  useEffect(() => {
    if (open) {
      setIsLocked(false);
      setShouldRender(true);
      setTranslateY(100);
      // Defer to next frame so the browser registers the start position
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setTranslateY(0));
      });
    } else {
      setTranslateY(100);
      setIsLocked(true);
      const timer = setTimeout(() => {
        setShouldRender(false);
        setIsLocked(false);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [open]);

  // Keyboard + body scroll lock
  useEffect(() => {
    if (!shouldRender) return;
    const handleKey = (e) => {
      if (e.key === 'Escape' && !isLocked) onClose();
    };
    document.addEventListener('keydown', handleKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = '';
    };
  }, [shouldRender, isLocked, onClose]);

  if (!shouldRender) return null;

  const handleBackdrop = (e) => {
    if (e.target === e.currentTarget && !isLocked) onClose();
  };

  const handleCloseButton = () => {
    if (!isLocked) onClose();
  };

  return createPortal(
    <div
      onClick={handleBackdrop}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(15,23,42,0.45)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        zIndex: 9999,
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title || 'Menu'}
        style={{
          width: 'min(100%, 420px)',
          maxHeight: 'calc(100vh - 24px - env(safe-area-inset-bottom, 0px))',
          background: C.white,
          borderRadius: '24px 24px 0 0',
          boxShadow: '-8px -8px 30px rgba(15,23,42,0.18)',
          transform: `translateY(${translateY}%)`,
          transition: 'transform 0.3s ease-in-out',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '16px 18px 12px',
            borderBottom: `1px solid ${C.g200}`,
            background: C.mist,
          }}
        >
          {title && (
            <p style={{ margin: 0, fontSize: 15, fontWeight: 800, color: C.forest }}>
              {title}
            </p>
          )}
          <button
            onClick={handleCloseButton}
            aria-label="Close menu"
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              padding: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: C.g600, borderRadius: 8,
            }}
          >
            <X size={18} strokeWidth={2} />
          </button>
        </div>

        {/* Body — scrolls independently when content overflows */}
        <div
          style={{
            flex: 1, overflowY: 'auto',
            padding: '8px 0 16px',
          }}
        >
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}
