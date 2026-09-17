import React from 'react';
import { Bell, Clock3, Mail, Sparkles } from 'lucide-react';

function formatRelativeTime(iso) {
  if (!iso) return 'just now';
  try {
    const diffMs = Date.now() - new Date(iso).getTime();
    const diffSec = Math.max(0, Math.floor(diffMs / 1000));

    if (diffSec < 60) return `${diffSec}s ago`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDay = Math.floor(diffHr / 24);
    return `${diffDay}d ago`;
  } catch {
    return 'just now';
  }
}

export default function AgentNotificationsPanel({
  notifications,
  panelOpen,
  onToggle,
  onOpenTicket,
}) {
  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={onToggle}
        aria-label="Open notifications"
        className="relative p-2 rounded-xl border hover:bg-gray-50 transition"
        style={{ borderColor: '#E2E8F0' }}
      >
        <Bell size={15} style={{ color: '#475569' }} />
        {unreadCount > 0 && (
          <span
            className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center text-[9px] font-black text-white"
            style={{ backgroundColor: '#DC2626' }}
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {panelOpen && (
        <div
          className="absolute right-0 top-full mt-2 w-[340px] max-w-[calc(100vw-2rem)] rounded-2xl border bg-white shadow-2xl z-50"
          style={{ borderColor: '#E2E8F0' }}
        >
          <div className="flex items-center justify-between px-3 py-2.5 border-b" style={{ borderColor: '#E2E8F0' }}>
            <div className="flex items-center gap-2">
              <Bell size={14} style={{ color: '#1B4332' }} />
              <p className="text-xs font-black" style={{ color: '#1E293B' }}>Notifications</p>
            </div>
            <button type="button" onClick={onToggle} className="text-[10px] font-bold" style={{ color: '#64748B' }}>
              Close
            </button>
          </div>

          {notifications.length === 0 ? (
            <div className="px-4 py-6 text-center">
              <Sparkles size={24} className="mx-auto mb-2" style={{ color: '#CBD5E1' }} />
              <p className="text-xs font-black" style={{ color: '#334155' }}>No notifications yet</p>
              <p className="text-[10px] mt-1" style={{ color: '#64748B' }}>
                New tickets will appear here as they arrive.
              </p>
            </div>
          ) : (
            <div className="max-h-[360px] overflow-y-auto">
              {notifications.map((notification) => (
                <button
                  key={notification.ticketId}
                  type="button"
                  onClick={() => onOpenTicket(notification)}
                  className="w-full text-left px-3 py-2.5 border-b transition hover:bg-gray-50"
                  style={{ borderColor: '#F1F5F9' }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="text-[11px] font-black truncate" style={{ color: '#0F172A' }}>
                          {notification.subject || 'New ticket'}
                        </p>
                        {!notification.read && (
                          <span className="text-[8px] font-black px-1 py-0.5 rounded-full" style={{ backgroundColor: '#DCFCE7', color: '#166534' }}>
                            new
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        <span
                          className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                          style={{
                            backgroundColor: notification.origin === 'email' ? '#FEF3C7' : '#E0F2FE',
                            color: notification.origin === 'email' ? '#B45309' : '#075985',
                          }}
                        >
                          {notification.origin === 'email' ? <Mail size={9} /> : <Clock3 size={9} />}
                          {notification.origin === 'email' ? 'via Email' : 'via Live Chat'}
                        </span>
                      </div>
                    </div>

                    <span className="text-[9px] font-bold whitespace-nowrap" style={{ color: '#64748B' }}>
                      {formatRelativeTime(notification.timestamp)}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
