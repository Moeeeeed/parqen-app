import React, { useState, useEffect } from 'react';
import { X, Check, AlertTriangle, Info } from 'lucide-react';

const C = {
  success: '#0B6638',
  error: '#EF4444',
  info: '#3B82F6',
  warning: '#F59E0B',
};

function formatToastContent(content, toastId, dismissToast) {
  if (content === null || content === undefined) return '';
  if (React.isValidElement(content)) return content;
  if (typeof content === 'function') {
    try {
      const result = content({ closeToast: () => dismissToast(toastId) });
      if (React.isValidElement(result)) return result;
      if (typeof result === 'object' && result !== null) return result.message || JSON.stringify(result);
      return String(result ?? '');
    } catch {
      return '';
    }
  }
  if (typeof content === 'object') {
    if (content instanceof Error) return content.message;
    const text = content.text ?? content.message ?? content.error ?? content.title ?? content.content ?? content.detail ?? content.body;
    if (typeof text === 'string' || typeof text === 'number') return String(text);
    try {
      return JSON.stringify(content);
    } catch {
      return String(content);
    }
  }
  return String(content);
}

export default function CustomToastContainer() {
  const [toasts, setToasts] = useState([]);

  const dismissToast = (id) => {
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, isExiting: true } : t))
    );
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 300);
  };

  useEffect(() => {
    const handleNewToast = (e) => {
      const { message, type, options } = e.detail || {};
      const id = options?.toastId || Math.random().toString(36).substring(2, 9);
      const autoClose = options?.autoClose !== undefined ? options.autoClose : 4000;

      const newToast = {
        id,
        message,
        type,
        autoClose,
        createdAt: Date.now(),
        isExiting: false,
      };

      setToasts((prev) => {
        // Limit to max 4 toasts
        const filtered = prev.filter((t) => t.id !== id);
        return [...filtered, newToast].slice(-4);
      });

      if (autoClose) {
        setTimeout(() => {
          dismissToast(id);
        }, autoClose);
      }
    };

    const handleDismissToast = (e) => {
      if (e.detail?.id) {
        dismissToast(e.detail.id);
      } else {
        // Dismiss all
        setToasts((prev) => prev.map((t) => ({ ...t, isExiting: true })));
        setTimeout(() => setToasts([]), 300);
      }
    };

    window.addEventListener('custom-toast', handleNewToast);
    window.addEventListener('custom-toast-dismiss', handleDismissToast);

    return () => {
      window.removeEventListener('custom-toast', handleNewToast);
      window.removeEventListener('custom-toast-dismiss', handleDismissToast);
    };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 'calc(70px + env(safe-area-inset-top, 0px))',
        right: '16px',
        zIndex: 999999,
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        width: '360px',
        maxWidth: 'calc(100vw - 32px)',
        pointerEvents: 'none',
      }}
    >
      <style>{`
        @keyframes toast-in {
          from { transform: translateX(120%) scale(0.9); opacity: 0; }
          to { transform: translateX(0) scale(1); opacity: 1; }
        }
        @keyframes toast-out {
          from { transform: translateX(0) scale(1); opacity: 1; }
          to { transform: translateX(120%) scale(0.9); opacity: 0; }
        }
        .toast-item {
          pointer-events: auto;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .toast-item:hover {
          transform: translateY(-2px);
          box-shadow: 0 16px 34px rgba(15,23,42,0.14) !important;
        }
        .toast-item:active {
          transform: scale(0.98);
        }
        @media (max-width: 600px) {
          @keyframes toast-in-mobile {
            from { transform: translateY(-30px); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
          }
          @keyframes toast-out-mobile {
            from { transform: translateY(0); opacity: 1; }
            to { transform: translateY(-30px); opacity: 0; }
          }
        }
      `}</style>

      {toasts.map((toast) => {
        const isMobile = window.innerWidth <= 600;
        const animationName = toast.isExiting
          ? isMobile ? 'toast-out-mobile 0.25s forwards ease-in' : 'toast-out 0.25s forwards ease-in'
          : isMobile ? 'toast-in-mobile 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.1) forwards' : 'toast-in 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.1) forwards';

        let icon = <Info size={14} strokeWidth={3} style={{ color: '#fff' }} />;
        let accent = C.info;

        if (toast.type === 'success') {
          icon = <Check size={15} strokeWidth={3.5} style={{ color: '#fff' }} />;
          accent = C.success;
        } else if (toast.type === 'error') {
          icon = <span style={{ color: '#fff', fontSize: 13, fontWeight: 900, lineHeight: 1 }}>!</span>;
          accent = C.error;
        } else if (toast.type === 'warning') {
          icon = <AlertTriangle size={13} strokeWidth={3} style={{ color: '#fff' }} />;
          accent = C.warning;
        }

        return (
          <div
            key={toast.id}
            onClick={() => dismissToast(toast.id)}
            className="toast-item"
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '12px',
              padding: '14px 16px 14px 14px',
              borderRadius: '14px',
              backgroundColor: '#fff',
              boxShadow: '0 12px 28px rgba(15,23,42,0.10), 0 2px 6px rgba(15,23,42,0.04)',
              position: 'relative',
              overflow: 'hidden',
              animation: animationName,
              userSelect: 'none',
            }}
          >
            {/* Colored accent bar — left edge */}
            <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '4px', borderRadius: '14px 0 0 14px', backgroundColor: accent }} />

            {/* Filled icon chip */}
            <div style={{
              flexShrink: 0, width: '30px', height: '30px', borderRadius: '999px',
              backgroundColor: accent, display: 'flex', alignItems: 'center', justifyContent: 'center',
              marginLeft: '6px',
            }}>
              {icon}
            </div>

            <div style={{ flex: 1, fontSize: '13.5px', fontWeight: 600, color: '#1E293B', lineHeight: '1.45', paddingTop: '4px' }}>
              {formatToastContent(toast.message, toast.id, dismissToast)}
            </div>

            <button
              onClick={(e) => {
                e.stopPropagation();
                dismissToast(toast.id);
              }}
              style={{
                background: 'none',
                border: 'none',
                padding: '2px',
                cursor: 'pointer',
                color: '#B0B8C1',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '50%',
                transition: 'all 0.2s',
                marginTop: '4px',
                flexShrink: 0,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.05)')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
