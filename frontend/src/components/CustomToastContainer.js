import React, { useState, useEffect } from 'react';
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react';

const C = {
  success: '#10B981',
  error: '#EF4444',
  info: '#3B82F6',
  warning: '#F59E0B',
  bgSuccess: '#ECFDF5',
  bgError: '#FEF2F2',
  bgInfo: '#EFF6FF',
  bgWarning: '#FFFBEB',
  borderSuccess: 'rgba(16, 185, 129, 0.2)',
  borderError: 'rgba(239, 68, 68, 0.2)',
  borderInfo: 'rgba(59, 130, 246, 0.2)',
  borderWarning: 'rgba(245, 158, 11, 0.2)',
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
    if (content.message && typeof content.message === 'string') return content.message;
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
        @keyframes toast-progress {
          from { width: 100%; }
          to { width: 0%; }
        }
        .toast-item {
          pointer-events: auto;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .toast-item:hover {
          transform: translateY(-2px);
          box-shadow: 0 16px 32px rgba(0,0,0,0.12) !important;
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

        let icon = <Info size={18} style={{ color: C.info }} />;
        let bgColor = C.bgInfo;
        let borderColor = C.borderInfo;
        let progressBg = C.info;

        if (toast.type === 'success') {
          icon = <CheckCircle size={18} style={{ color: C.success }} />;
          bgColor = C.bgSuccess;
          borderColor = C.borderSuccess;
          progressBg = C.success;
        } else if (toast.type === 'error') {
          icon = <AlertCircle size={18} style={{ color: C.error }} />;
          bgColor = C.bgError;
          borderColor = C.borderError;
          progressBg = C.error;
        } else if (toast.type === 'warning') {
          icon = <AlertTriangle size={18} style={{ color: C.warning }} />;
          bgColor = C.bgWarning;
          borderColor = C.borderWarning;
          progressBg = C.warning;
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
              padding: '14px 16px',
              borderRadius: '16px',
              backgroundColor: bgColor,
              border: `1px solid ${borderColor}`,
              boxShadow: '0 10px 25px rgba(0, 0, 0, 0.06), 0 2px 6px rgba(0, 0, 0, 0.04)',
              position: 'relative',
              overflow: 'hidden',
              animation: animationName,
              userSelect: 'none',
            }}
          >
            <div style={{ flexShrink: 0, marginTop: '2px' }}>{icon}</div>
            
            <div style={{ flex: 1, fontSize: '13px', fontWeight: 600, color: '#1E293B', lineHeight: '1.4' }}>
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
                color: '#94A3B8',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '50%',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.05)')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
            >
              <X size={14} />
            </button>

            {/* Progress bar timeline */}
            {toast.autoClose && !toast.isExiting && (
              <div
                style={{
                  position: 'absolute',
                  bottom: 0,
                  left: 0,
                  height: '3px',
                  backgroundColor: progressBg,
                  animation: `toast-progress ${toast.autoClose}ms linear forwards`,
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
