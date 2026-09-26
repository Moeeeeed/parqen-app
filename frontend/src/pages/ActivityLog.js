import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { ArrowLeft, Clock, UserPlus, LogIn, ArrowLeftRight, Tag, Star, ShieldAlert, RefreshCw } from 'lucide-react';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';
const C = { forest: '#1B4332', green: '#2D6A4F', gold: '#F4A422', mist: '#F0FAF5', g100: '#F1F5F9', g200: '#E2E8F0', g400: '#94A3B8', g500: '#64748B', g600: '#475569', g800: '#1E293B' };

const KIND = {
  account:  { icon: UserPlus, color: '#2D6A4F', name: 'Account' },
  login:    { icon: LogIn, color: '#3B82F6', name: 'Sign-in' },
  trade:    { icon: ArrowLeftRight, color: '#F4A422', name: 'Trade' },
  offer:    { icon: Tag, color: '#8B5CF6', name: 'Offer' },
  review:   { icon: Star, color: '#F59E0B', name: 'Review' },
  security: { icon: ShieldAlert, color: '#DC2626', name: 'Security' },
};
const FILTERS = [['all', 'All'], ['trade', 'Trades'], ['offer', 'Offers'], ['security', 'Security'], ['review', 'Reviews'], ['login', 'Sign-ins'], ['account', 'Account']];

const fmtWhen = (iso) => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return `${d.getDate()} ${d.toLocaleDateString('en-GB', { month: 'short' })} ${d.getFullYear()}, ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
};
const dayKey = (iso) => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 'Earlier';
  const today = new Date(); const y = new Date(); y.setDate(today.getDate() - 1);
  const same = (a, b) => a.toDateString() === b.toDateString();
  if (same(d, today)) return 'Today';
  if (same(d, y)) return 'Yesterday';
  return `${d.getDate()} ${d.toLocaleDateString('en-GB', { month: 'long' })} ${d.getFullYear()}`;
};

export default function ActivityLog() {
  const navigate = useNavigate();
  const [events, setEvents] = useState(null); // null = loading
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all');

  const load = useCallback(async () => {
    setError(null);
    try {
      const token = localStorage.getItem('token');
      const r = await axios.get(`${API_URL}/users/me/activity`, { headers: token ? { Authorization: `Bearer ${token}` } : {}, timeout: 20000 });
      setEvents(r.data.events || []);
    } catch (e) {
      setError(e.response?.data?.error || 'Could not load your activity. Please try again.');
      setEvents([]);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const shown = (events || []).filter((e) => filter === 'all' || e.type === filter);
  const groups = [];
  shown.forEach((e) => {
    const k = dayKey(e.at);
    const last = groups[groups.length - 1];
    if (last && last.k === k) last.items.push(e); else groups.push({ k, items: [e] });
  });

  return (
    <div className="min-h-screen pb-12" style={{ backgroundColor: C.mist, fontFamily: "'DM Sans',sans-serif" }}>
      <div className="max-w-3xl mx-auto px-4 pt-6">
        <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-sm font-bold mb-4" style={{ color: C.green, background: 'none', border: 0, cursor: 'pointer' }}>
          <ArrowLeft size={16} /> Back
        </button>
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl flex items-center justify-center" style={{ background: '#3B82F615' }}><Clock size={22} color="#3B82F6" /></div>
            <div>
              <h1 className="font-black text-xl" style={{ color: C.forest, fontFamily: "'Syne',sans-serif" }}>Activity log</h1>
              <p className="text-xs" style={{ color: C.g500 }}>What has happened on your account</p>
            </div>
          </div>
          <button onClick={() => { setEvents(null); load(); }} aria-label="Refresh" className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: '#fff', border: `1px solid ${C.g200}`, cursor: 'pointer' }}>
            <RefreshCw size={15} color={C.g600} />
          </button>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-2 mb-3" style={{ scrollbarWidth: 'none' }}>
          {FILTERS.map(([k, label]) => (
            <button key={k} onClick={() => setFilter(k)}
              className="px-3 py-1.5 rounded-full text-xs font-bold flex-shrink-0"
              style={{ background: filter === k ? C.forest : '#fff', color: filter === k ? C.gold : C.g600, border: `1px solid ${filter === k ? C.forest : C.g200}`, cursor: 'pointer' }}>
              {label}
            </button>
          ))}
        </div>

        {events === null && <p className="text-sm text-center py-16" style={{ color: C.g500 }}>Loading your activity…</p>}
        {error && (
          <div className="rounded-2xl p-4 text-sm mb-4" style={{ background: '#FEF2F2', color: '#B91C1C', border: '1px solid #FECACA' }}>{error}</div>
        )}
        {events !== null && !error && shown.length === 0 && (
          <div className="rounded-2xl p-8 text-center" style={{ background: '#fff', border: `1px solid ${C.g200}` }}>
            <p className="font-bold text-sm" style={{ color: C.g800 }}>Nothing here yet</p>
            <p className="text-xs mt-1" style={{ color: C.g500 }}>{filter === 'all' ? 'Your trades, offers and security events will show up here.' : 'No events of this kind yet.'}</p>
          </div>
        )}

        {groups.map((g) => (
          <div key={g.k} className="mb-4">
            <p className="text-[11px] font-black uppercase tracking-wider mb-2 px-1" style={{ color: C.g500 }}>{g.k}</p>
            <div className="rounded-2xl overflow-hidden" style={{ background: '#fff', border: `1px solid ${C.g200}` }}>
              {g.items.map((e, i) => {
                const k = KIND[e.type] || KIND.account;
                const Icon = k.icon;
                const clickable = e.type === 'trade' && e.ref;
                return (
                  <div key={`${e.type}-${e.ref || ''}-${e.at}-${i}`}
                    onClick={clickable ? () => navigate(`/trade/${e.ref}`) : undefined}
                    className="flex items-center gap-3 px-4 py-3"
                    style={{ borderTop: i ? `1px solid ${C.g100}` : 'none', cursor: clickable ? 'pointer' : 'default' }}>
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${k.color}15` }}><Icon size={17} color={k.color} /></div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold" style={{ color: C.g800 }}>{e.label}</p>
                      <p className="text-[11px]" style={{ color: C.g400 }}>{k.name}{e.noTime ? '' : ` · ${fmtWhen(e.at)}`}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {events !== null && !error && (
          <p className="text-[11px] text-center mt-4" style={{ color: C.g400 }}>
            We keep your most recent sign-in only. Showing your latest {events.length} events. For anything you don't recognise, change your password and contact support.
          </p>
        )}
      </div>
    </div>
  );
}
