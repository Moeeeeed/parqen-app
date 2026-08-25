// components/AdminTraderRecognition.js
// PRAQEN Weekly Stars — admin selection panel. The system only RECOMMENDS
// ranked candidates (GET /api/admin/trader-of-week/candidates); the admin
// picks the actual winner (POST /api/admin/trader-of-week/select). Nothing
// here writes automatically — see backend/services/traderOfWeekService.js.
import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { RefreshCw, Award, Clock } from 'lucide-react';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';
const authH = () => {
  const t = localStorage.getItem('token') || localStorage.getItem('adminToken');
  return t ? { Authorization: `Bearer ${t}` } : {};
};

const C = {
  forest: '#1B4332', green: '#2D6A4F', gold: '#F4A422',
  g50: '#F8FAFC', g100: '#F1F5F9', g200: '#E2E8F0', g400: '#94A3B8',
  g500: '#64748B', g700: '#334155', g800: '#1E293B', danger: '#EF4444',
};

const SLOTS = [
  { key: 'sell_bitcoin_gh', icon: '🏆', label: 'Sell Bitcoin — Ghana' },
  { key: 'buy_bitcoin_ng',  icon: '🏆', label: 'Buy Bitcoin — Nigeria' },
  { key: 'gift_card',       icon: '🎁', label: 'Gift Card' },
  { key: 'sell_bitcoin_ke', icon: '🇰🇪', label: 'Sell Bitcoin — Kenya' },
  { key: 'rising_trader',   icon: '🚀', label: 'Rising Trader of the Week' },
];

function StatCell({ label, value }) {
  return (
    <div className="text-center">
      <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: C.g400 }}>{label}</p>
      <p className="text-sm font-black" style={{ color: C.g800 }}>{value}</p>
    </div>
  );
}

function CandidateRow({ c, isCurrent, onSelect, selecting }) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-2xl border"
      style={{ borderColor: isCurrent ? C.gold : C.g200, backgroundColor: isCurrent ? '#FFFBEB' : '#fff' }}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-black text-sm truncate" style={{ color: C.g800 }}>{c.username}</p>
          {c.role && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: C.g100, color: C.g500 }}>{c.role}</span>}
          {isCurrent && <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full text-white" style={{ backgroundColor: C.gold }}>CURRENT</span>}
        </div>
        <p className="text-[11px]" style={{ color: C.g400 }}>{c.country || '—'} · {c.reason}</p>
      </div>
      <div className="grid grid-cols-4 gap-3 flex-shrink-0">
        <StatCell label="Trades" value={c.total_trades} />
        <StatCell label="This Wk" value={c.recent_trades} />
        <StatCell label="Rating" value={parseFloat(c.average_rating || 0).toFixed(1)} />
        <StatCell label="Compl." value={`${c.completion_rate ?? '—'}%`} />
      </div>
      <button disabled={selecting} onClick={() => onSelect(c)}
        className="flex-shrink-0 px-3 py-2 rounded-xl text-white font-black text-xs transition hover:opacity-90 disabled:opacity-50"
        style={{ backgroundColor: C.forest }}>
        {isCurrent ? 'Re-select' : 'Select Winner'}
      </button>
    </div>
  );
}

function SlotPanel({ slot, icon, label, current, onWinnerChanged }) {
  const [candidates, setCandidates] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selecting, setSelecting] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    axios.get(`${API_URL}/admin/trader-of-week/candidates`, { params: { slot }, headers: authH() })
      .then(r => setCandidates(r.data.candidates || []))
      .catch(e => toast.error(e?.response?.data?.error || 'Failed to load candidates'))
      .finally(() => setLoading(false));
  }, [slot]);

  useEffect(() => { load(); }, [load]);

  const select = async (candidate) => {
    setSelecting(true);
    try {
      await axios.post(`${API_URL}/admin/trader-of-week/select`, { slot, userId: candidate.user_id }, { headers: authH() });
      toast.success(`${candidate.username} selected for ${label}`);
      onWinnerChanged();
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Selection failed');
    } finally { setSelecting(false); }
  };

  return (
    <div className="rounded-3xl border p-5 space-y-3" style={{ borderColor: C.g200, backgroundColor: '#fff' }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">{icon}</span>
          <h3 className="font-black text-sm" style={{ color: C.g800 }}>{label}</h3>
        </div>
        <button onClick={load} className="p-1.5 rounded-lg hover:bg-gray-100">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} style={{ color: C.g500 }} />
        </button>
      </div>

      {current?.username && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ backgroundColor: '#FFFBEB', border: '1px solid #FCD34D' }}>
          <Award size={14} style={{ color: C.gold }} />
          <p className="text-xs" style={{ color: C.g700 }}>
            <span className="font-black">{current.username}</span> — selected by {current.pinned_by_username || 'legacy pick'}
            {current.selected_at && ` on ${new Date(current.selected_at).toLocaleDateString()}`}
            {current.pin_expires_at && (
              <> · <Clock size={10} className="inline" /> expires {new Date(current.pin_expires_at).toLocaleDateString()}</>
            )}
          </p>
        </div>
      )}

      {loading ? (
        <p className="text-xs py-4 text-center" style={{ color: C.g400 }}>Loading candidates…</p>
      ) : !candidates || candidates.length === 0 ? (
        <p className="text-xs py-6 text-center font-bold" style={{ color: C.g500 }}>
          No qualified trader this week.
        </p>
      ) : (
        <div className="space-y-2">
          {candidates.map(c => (
            <CandidateRow key={c.user_id} c={c} isCurrent={current?.user_id === c.user_id} onSelect={select} selecting={selecting} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function AdminTraderRecognition() {
  const [winners, setWinners] = useState({});

  const loadWinners = useCallback(() => {
    axios.get(`${API_URL}/trader-of-week`)
      .then(r => setWinners(r.data?.winners || {}))
      .catch(() => setWinners({}));
  }, []);

  useEffect(() => { loadWinners(); }, [loadWinners]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-black" style={{ color: C.g800 }}>🏆 PRAQEN Traders of the Week — Admin Selection</h2>
        <p className="text-xs" style={{ color: C.g500 }}>
          Candidates are ranked recommendations only — nothing is selected automatically. Pick a winner for each slot below.
        </p>
      </div>
      {SLOTS.map(s => (
        <SlotPanel key={s.key} slot={s.key} icon={s.icon} label={s.label} current={winners[s.key]} onWinnerChanged={loadWinners} />
      ))}
    </div>
  );
}
