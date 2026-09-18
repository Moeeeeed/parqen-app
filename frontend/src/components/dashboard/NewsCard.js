import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Megaphone, AlertTriangle, TrendingUp, Zap } from 'lucide-react';

const C = {
  forest: '#1B4332', green: '#2D6A4F',
  g100: '#F1F5F9', g200: '#E2E8F0',
  g400: '#94A3B8', g500: '#64748B',
  warn: '#F59E0B',
};

const pad2 = (n) => String(n).padStart(2, '0');

// Per-item stamp next to the action button, NoOnes format: DD/MM/YYYY HH:mm
const fmtStamp = (iso) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};

// Date label for a news timestamp, matching the reference grouping
// (e.g. "Thursday" for this week, "August 21" for older items).
const dayLabel = (iso) => {
  const d = new Date(iso);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.floor((startOfToday - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000);
  if (diffDays < 7) {
    return d.toLocaleDateString('en-US', { weekday: 'long' });
  }
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
};

const NEWS_ICONS = {
  TrendingUp,
  Zap,
  AlertTriangle,
};

/**
 * NewsCard — right sidebar card (NoOnes style):
 *  - "PraQen news" heading with megaphone icon
 *  - shows only the LATEST 2 items (most recent first), grouped under date labels
 *  - each item: icon + bold title, gray 2-line description, pill button with the
 *    item's real publish timestamp (DD/MM/YYYY HH:mm) right-aligned in the same
 *    row (group label = day heading, per-item stamp = full date+time)
 *  - "View more" opens the notifications panel (bell dropdown) instead of a page
 */
export default function NewsCard({ items = [] }) {
  const navigate = useNavigate();

  const stampOf = (news) => news.publishedAt || news.timestamp;

  // Latest 2 only — assume `items` is most-recent-first; sort defensively by
  // publish date descending so the cap always keeps the newest entries.
  const latestTwo = [...items]
    .sort((a, b) => new Date(stampOf(b)) - new Date(stampOf(a)))
    .slice(0, 2);

  // Group items by their date label, preserving order
  const groups = [];
  latestTwo.forEach((news) => {
    const label = dayLabel(stampOf(news));
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(news);
    else groups.push({ label, items: [news] });
  });

  // "View more" → open the notifications panel via a window event.
  // Notifications.js (navbar bell) listens for 'praqen:open-notifications'.
  const openNotifications = () => {
    window.dispatchEvent(new CustomEvent('praqen:open-notifications'));
  };

  return (
    <div
      className="bg-white"
      style={{ borderRadius: 12, border: `1px solid ${C.g200}`, padding: 20 }}
    >
      <div className="flex items-center gap-2 mb-4">
        <Megaphone size={15} style={{ color: C.warn }} />
        <h3 className="text-sm font-bold" style={{ color: C.forest }}>PraQen news</h3>
      </div>

      {latestTwo.length === 0 ? (
        <p className="text-xs font-semibold" style={{ color: C.g500 }}>No news right now.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map((group) => (
            <div key={group.label}>
              <p className="text-xs font-bold mb-2" style={{ color: C.g400 }}>{group.label}</p>
              <div className="flex flex-col gap-4">
                {group.items.map((news) => {
                  const Icon = NEWS_ICONS[news.iconName] || AlertTriangle;
                  return (
                    <div key={news.id} className="flex gap-3">
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: `${news.color}1F` }}
                      >
                        <Icon size={15} style={{ color: news.color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold leading-snug" style={{ color: C.forest }}>{news.title}</p>
                        <p className="text-xs mt-1 line-clamp-2 leading-relaxed" style={{ color: C.g500 }}>{news.description}</p>
                        <div className="flex items-center justify-between mt-2 gap-2">
                          <button
                            onClick={() => navigate(news.route)}
                            className="text-xs font-bold px-3 py-1.5 rounded-full transition"
                            style={{
                              border: `1px solid ${C.g200}`,
                              color: C.forest,
                              background: C.g100,
                              cursor: 'pointer',
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = C.g200; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = C.g100; }}
                          >
                            {news.actionLabel}
                          </button>
                          {/* Real publish date+time (DD/MM/YYYY HH:mm), right-aligned in the button row */}
                          <span className="text-xs font-semibold flex-shrink-0" style={{ color: C.g400 }}>
                            {fmtStamp(stampOf(news))}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={openNotifications}
        className="mt-4 text-xs font-bold hover:underline"
        style={{ color: C.green, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
      >
        View more
      </button>
    </div>
  );
}
