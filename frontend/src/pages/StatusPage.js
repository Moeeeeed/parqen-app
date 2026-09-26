import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { ArrowLeft, CheckCircle, AlertTriangle, XCircle, Wrench, RefreshCw, Activity } from 'lucide-react';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';
const C = { forest: '#1B4332', green: '#2D6A4F', gold: '#F4A422', mist: '#F0FAF5', g200: '#E2E8F0', g400: '#94A3B8', g500: '#64748B', g600: '#475569', g800: '#1E293B' };

const LOOK = {
  operational: { label: 'Operational', color: '#16A34A', bg: '#DCFCE7', icon: CheckCircle },
  degraded:    { label: 'Slow', color: '#B45309', bg: '#FEF3C7', icon: AlertTriangle },
  maintenance: { label: 'Under maintenance', color: '#B45309', bg: '#FEF3C7', icon: Wrench },
  down:        { label: 'Down', color: '#DC2626', bg: '#FEE2E2', icon: XCircle },
};
const HEADLINE = {
  operational: 'All systems operational',
  degraded: 'Some services are running slowly',
  maintenance: 'Some services are under maintenance',
  down: 'Some services are having problems',
};

export default function StatusPage() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${API_URL}/status`, { timeout: 15000 });
      setData(r.data); setFailed(false);
    } catch (e) {
      // If the server does not answer at all, that is itself the status.
      setData(null); setFailed(true);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); const iv = setInterval(load, 60000); return () => clearInterval(iv); }, [load]);

  const overall = failed ? 'down' : (data?.overall || null);
  const head = overall ? LOOK[overall] : null;
  const HeadIcon = head?.icon;
  // The website itself is up if you can read this page.
  const rows = failed ? [
    { key: 'site', name: 'Website', status: 'operational' },
    { key: 'api', name: 'PRAQEN API', status: 'down' },
  ] : [{ key: 'site', name: 'Website', status: 'operational' }, ...(data?.components || [])];

  return (
    <div className="min-h-screen pb-12" style={{ backgroundColor: C.mist, fontFamily: "'DM Sans',sans-serif" }}>
      <div className="max-w-2xl mx-auto px-4 pt-6">
        <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-sm font-bold mb-4" style={{ color: C.green, background: 'none', border: 0, cursor: 'pointer' }}>
          <ArrowLeft size={16} /> Back
        </button>
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl flex items-center justify-center" style={{ background: '#3B82F615' }}><Activity size={22} color="#3B82F6" /></div>
            <div>
              <h1 className="font-black text-xl" style={{ color: C.forest, fontFamily: "'Syne',sans-serif" }}>Status</h1>
              <p className="text-xs" style={{ color: C.g500 }}>Live status of PRAQEN services</p>
            </div>
          </div>
          <button onClick={load} aria-label="Refresh" className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: '#fff', border: `1px solid ${C.g200}`, cursor: 'pointer' }}>
            <RefreshCw size={15} color={C.g600} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        {head ? (
          <div className="rounded-2xl p-5 mb-4 flex items-center gap-3" style={{ background: head.bg, border: `1px solid ${head.color}30` }}>
            <HeadIcon size={26} color={head.color} />
            <div>
              <p className="font-black text-base" style={{ color: head.color }}>{failed ? 'We could not reach the PRAQEN servers' : HEADLINE[overall]}</p>
              <p className="text-xs" style={{ color: C.g600 }}>
                {failed ? 'Try again in a minute. If it keeps happening, contact support.' : `Checked ${new Date(data.checked_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} · updates every minute`}
              </p>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl p-5 mb-4 text-sm text-center" style={{ background: '#fff', border: `1px solid ${C.g200}`, color: C.g500 }}>Checking services…</div>
        )}

        <div className="rounded-2xl overflow-hidden" style={{ background: '#fff', border: `1px solid ${C.g200}` }}>
          {rows.map((c, i) => {
            const l = LOOK[c.status] || LOOK.operational;
            const Icon = l.icon;
            return (
              <div key={c.key} className="flex items-center justify-between gap-3 px-4 py-3.5" style={{ borderTop: i ? `1px solid ${C.g200}` : 'none' }}>
                <p className="text-sm font-bold" style={{ color: C.g800 }}>{c.name}</p>
                <span className="flex items-center gap-1.5 text-xs font-black px-2.5 py-1 rounded-full" style={{ background: l.bg, color: l.color }}>
                  <Icon size={13} /> {l.label}
                </span>
              </div>
            );
          })}
        </div>
        <p className="text-[11px] text-center mt-4" style={{ color: C.g400 }}>
          These checks run against the live system each time you open this page. Maintenance notices for withdrawals appear here first.
        </p>
      </div>
    </div>
  );
}
