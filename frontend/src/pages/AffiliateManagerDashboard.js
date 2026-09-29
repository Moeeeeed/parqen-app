// pages/AffiliateManagerDashboard.js
// Standalone Affiliate Program Manager Portal — its own login, its own page,
// completely separate from CeoDashboard.js and AdminDashboard.js. Built for
// a staff member who should see and manage the Affiliate Program and nothing
// else — no user management, no disputes, no wallet/finance data.
//
// Same auth shape as AgentDashboard.js's Support Dashboard: password → email
// OTP → optional 2FA, hitting the same /api/auth/* endpoints as the main
// site, just checking is_affiliate_manager/is_admin/is_ceo instead of a
// support role, and storing the session under its own token key
// (affiliateManagerToken) so it never collides with a CEO/admin/agent
// session open in the same browser.
import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { Users, RefreshCw, UserCheck, LogOut, TrendingUp, Award } from 'lucide-react';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';
const authH = () => {
  const t = localStorage.getItem('affiliateManagerToken');
  return t ? { Authorization: `Bearer ${t}` } : {};
};

const C = {
  forest: '#1B4332', forestLight: '#2D6A4F', gold: '#F4A422',
  g50: '#F8FAFC', g100: '#F1F5F9', g200: '#E2E8F0', g300: '#CBD5E1',
  g400: '#94A3B8', g500: '#64748B', g600: '#475569', g700: '#334155', g800: '#1E293B',
};

function Spin() {
  return <div className="flex items-center justify-center py-16"><div className="w-8 h-8 border-4 rounded-full animate-spin" style={{ borderColor: `${C.forest}20`, borderTopColor: C.forest }} /></div>;
}
function Empty({ icon, text }) {
  return <div className="flex flex-col items-center py-16 gap-2">{icon}<p className="text-sm font-semibold" style={{ color: C.g500 }}>{text}</p></div>;
}
function Pill({ label, color = '#10B981', bg = '#F0FDF4' }) {
  return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-black" style={{ color, backgroundColor: bg }}>{label}</span>;
}

// ════════════════════════════════════════════════════════════════════════
// LOGIN
// ════════════════════════════════════════════════════════════════════════
function AffiliateManagerLogin({ onAuth }) {
  const [step, setStep]           = useState('password'); // 'password' | 'email-otp' | '2fa'
  const [email, setEmail]         = useState('');
  const [password, setPassword]   = useState('');
  const [emailOtp, setEmailOtp]   = useState('');
  const [twoFACode, setTwoFACode] = useState('');
  const [tempToken, setTempToken] = useState('');
  const [loading, setLoading]     = useState(false);
  const [err, setErr]             = useState('');
  const [notice, setNotice]       = useState('');

  const finish = (u, token) => {
    if (!(u?.is_affiliate_manager || u?.is_admin || u?.is_ceo)) {
      setErr("This account doesn't have Affiliate Program Manager access. Ask an admin to grant it.");
      return;
    }
    localStorage.setItem('affiliateManagerToken', token);
    localStorage.setItem('affiliateManagerUser', JSON.stringify(u));
    onAuth(u);
  };

  const submitPassword = async (e) => {
    e.preventDefault();
    setErr(''); setNotice(''); setLoading(true);
    try {
      const { data } = await axios.post(`${API_URL}/auth/login`, { email, password });
      if (data.requiresOtp) {
        setEmailOtp('');
        setNotice(`A 6-digit code was sent to ${data.email || email}`);
        setStep('email-otp');
      } else if (data.success) {
        finish(data.user, data.token);
      }
    } catch (e) {
      setErr(e.response?.data?.error || 'Login failed. Check your details and try again.');
    } finally { setLoading(false); }
  };

  const submitEmailOtp = async (e) => {
    e.preventDefault();
    if (emailOtp.length !== 6) { setErr('Enter the full 6-digit code'); return; }
    setErr(''); setLoading(true);
    try {
      const { data } = await axios.post(`${API_URL}/auth/verify-login-otp`, { email, code: emailOtp, affiliateManagerPortal: true });
      if (data.requires2FA) {
        setTempToken(data.tempToken);
        setNotice(`Enter the code from your ${data.twoFactorMethod === 'totp' ? 'authenticator app' : data.twoFactorMethod === 'sms' ? 'phone' : 'email'}`);
        setTwoFACode('');
        setStep('2fa');
      } else if (data.success) {
        finish(data.user, data.token);
      }
    } catch (e) {
      const d = e.response?.data;
      if (d?.require2FASetup) {
        setErr(d.error || 'Two-factor authentication is required for this portal. Enable 2FA on your account, then sign in again.');
      } else {
        setErr(d?.error || 'Invalid code. Please try again.');
        setEmailOtp('');
      }
    } finally { setLoading(false); }
  };

  const submit2FA = async (e) => {
    e.preventDefault();
    if (twoFACode.length !== 6) { setErr('Enter the full 6-digit code'); return; }
    setErr(''); setLoading(true);
    try {
      const { data } = await axios.post(`${API_URL}/auth/verify-2fa-login`, { tempToken, code: twoFACode });
      if (data.success) finish(data.user, data.token);
    } catch (e) {
      setErr(e.response?.data?.error || 'Invalid code. Please try again.');
      setTwoFACode('');
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: `linear-gradient(145deg,${C.forest} 0%,#0c2418 50%,${C.forestLight} 100%)` }}>
      <div className="w-full max-w-sm bg-white rounded-3xl p-7 shadow-2xl">
        <div className="flex flex-col items-center mb-6">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-3" style={{ backgroundColor: C.gold }}>
            <Award size={26} color={C.forest} />
          </div>
          <h1 className="font-black text-lg" style={{ color: C.g800 }}>PRAQEN Affiliate Program</h1>
          <p className="text-xs mt-1 text-center" style={{ color: C.g400 }}>Manager Portal — sign in with your account</p>
        </div>

        {step === 'password' && (
          <form onSubmit={submitPassword} className="space-y-3">
            <input type="email" required placeholder="Email" value={email} onChange={e => setEmail(e.target.value)}
              className="w-full border rounded-xl px-4 py-3 text-sm outline-none" style={{ borderColor: C.g200 }} />
            <input type="password" required placeholder="Password" value={password} onChange={e => setPassword(e.target.value)}
              className="w-full border rounded-xl px-4 py-3 text-sm outline-none" style={{ borderColor: C.g200 }} />
            {err && <p className="text-xs font-bold" style={{ color: '#DC2626' }}>{err}</p>}
            <button type="submit" disabled={loading}
              className="w-full py-3 rounded-xl text-sm font-black transition"
              style={{ backgroundColor: loading ? C.g200 : C.forest, color: loading ? C.g400 : '#fff' }}>
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
        )}

        {step === 'email-otp' && (
          <form onSubmit={submitEmailOtp} className="space-y-3">
            {notice && <p className="text-xs font-semibold" style={{ color: C.g600 }}>{notice}</p>}
            <input type="text" inputMode="numeric" maxLength={6} required placeholder="6-digit code"
              value={emailOtp} onChange={e => setEmailOtp(e.target.value.replace(/\D/g, ''))}
              className="w-full border rounded-xl px-4 py-3 text-sm outline-none tracking-widest text-center font-black" style={{ borderColor: C.g200 }} />
            {err && <p className="text-xs font-bold" style={{ color: '#DC2626' }}>{err}</p>}
            <button type="submit" disabled={loading}
              className="w-full py-3 rounded-xl text-sm font-black transition"
              style={{ backgroundColor: loading ? C.g200 : C.forest, color: loading ? C.g400 : '#fff' }}>
              {loading ? 'Verifying…' : 'Verify Code'}
            </button>
            <button type="button" onClick={() => { setStep('password'); setErr(''); setNotice(''); }}
              className="w-full text-xs font-bold py-1" style={{ color: C.g500 }}>
              ← Back
            </button>
          </form>
        )}

        {step === '2fa' && (
          <form onSubmit={submit2FA} className="space-y-3">
            {notice && <p className="text-xs font-semibold" style={{ color: C.g600 }}>{notice}</p>}
            <input type="text" inputMode="numeric" maxLength={6} required placeholder="6-digit 2FA code"
              value={twoFACode} onChange={e => setTwoFACode(e.target.value.replace(/\D/g, ''))}
              className="w-full border rounded-xl px-4 py-3 text-sm outline-none tracking-widest text-center font-black" style={{ borderColor: C.g200 }} />
            {err && <p className="text-xs font-bold" style={{ color: '#DC2626' }}>{err}</p>}
            <button type="submit" disabled={loading}
              className="w-full py-3 rounded-xl text-sm font-black transition"
              style={{ backgroundColor: loading ? C.g200 : C.forest, color: loading ? C.g400 : '#fff' }}>
              {loading ? 'Verifying…' : 'Verify & Sign In'}
            </button>
          </form>
        )}

        <p className="text-[11px] text-center mt-5" style={{ color: C.g400 }}>
          Need access? Ask your PRAQEN admin to grant Affiliate Manager rights on your account.
        </p>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// MAIN PORTAL (single page — overview + Builder applications, stacked)
// ════════════════════════════════════════════════════════════════════════
function AffiliateManagerInner({ user, onLogout }) {
  const [data, setData]         = useState(null);
  const [loading, setLoading]   = useState(true);
  const [q, setQ]               = useState('');
  const [sortKey, setSortKey]   = useState('qualified_volume_usd');
  const [sortDir, setSortDir]   = useState('desc');

  const [apps, setApps]             = useState([]);
  const [appsLoading, setAppsLoading] = useState(true);
  const [appsFilter, setAppsFilter] = useState('pending');
  const [acting, setActing]         = useState(null);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${API_URL}/affiliate-manager/overview`, { headers: authH() });
      setData(r.data);
    } catch { toast.error('Failed to load overview'); }
    finally { setLoading(false); }
  }, []);

  const loadApps = useCallback(async () => {
    setAppsLoading(true);
    try {
      const r = await axios.get(`${API_URL}/affiliate-manager/builder-applications`, { headers: authH(), params: { status: appsFilter } });
      if (r.data.migration_needed) { setApps([]); }
      else { setApps(r.data.applications || []); }
    } catch { toast.error('Failed to load Builder applications'); }
    finally { setAppsLoading(false); }
  }, [appsFilter]);

  useEffect(() => { loadOverview(); }, [loadOverview]);
  useEffect(() => { loadApps(); }, [loadApps]);

  const approve = async (id) => {
    setActing(id);
    try {
      await axios.post(`${API_URL}/affiliate-manager/builder-applications/${id}/approve`, {}, { headers: authH() });
      toast.success('Approved — they\'re now a Builder');
      setApps(prev => prev.filter(a => a.id !== id));
    } catch (e) { toast.error(e.response?.data?.error || 'Approve failed'); }
    finally { setActing(null); }
  };
  const reject = async (id) => {
    const reason = window.prompt('Reason for rejecting this Builder application?');
    if (!reason || !reason.trim()) return;
    setActing(id);
    try {
      await axios.post(`${API_URL}/affiliate-manager/builder-applications/${id}/reject`, { reason: reason.trim() }, { headers: authH() });
      toast.success('Rejected');
      setApps(prev => prev.filter(a => a.id !== id));
    } catch (e) { toast.error(e.response?.data?.error || 'Reject failed'); }
    finally { setActing(null); }
  };

  const sortBy = (key) => {
    if (key === sortKey) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortKey(key); setSortDir('desc'); }
  };
  const COLS = [
    { key: 'username', label: 'Affiliate' }, { key: 'level', label: 'Level' },
    { key: 'users_brought', label: 'Referred' }, { key: 'active_users', label: 'Active' },
    { key: 'qualified_volume_usd', label: 'Trade volume' },
    { key: 'total_commission_usd', label: 'Commission (lifetime)' },
    { key: 'commission_this_month_usd', label: 'Commission (this month)' },
  ];
  const rows = (data?.affiliates || [])
    .filter(a => !q.trim() || a.username.toLowerCase().includes(q.trim().toLowerCase()))
    .slice()
    .sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey];
      const cmp = typeof av === 'string' ? av.localeCompare(bv) : (av || 0) - (bv || 0);
      return sortDir === 'desc' ? -cmp : cmp;
    });

  const kpis = data?.kpis;
  const status = data?.system_status;
  const levelColor = { Explorer: '#B7D9C4', Builder: '#2D6A4F', Titan: '#F4A422', Legendary: '#1B4332' };

  const logout = () => {
    localStorage.removeItem('affiliateManagerToken');
    localStorage.removeItem('affiliateManagerUser');
    onLogout();
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: C.g50 }}>
      {/* Header */}
      <div className="px-5 py-4 flex items-center justify-between" style={{ backgroundColor: C.forest }}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: C.gold }}>
            <Award size={18} color={C.forest} />
          </div>
          <div>
            <p className="text-white font-black text-sm">PRAQEN Affiliate Program</p>
            <p className="text-xs" style={{ color: '#D4E5DC' }}>Manager Portal · {user?.username || user?.email}</p>
          </div>
        </div>
        <button onClick={logout} className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl transition" style={{ color: '#fff', backgroundColor: 'rgba(255,255,255,0.12)' }}>
          <LogOut size={14} /> Sign out
        </button>
      </div>

      <div className="max-w-6xl mx-auto p-5 space-y-6">

        {/* System status strip */}
        {status && (
          <div className="flex gap-2 flex-wrap">
            <Pill label={`Levels: ${status.levels_auto_enabled ? 'LIVE' : 'off'}`} color={status.levels_auto_enabled ? '#166534' : '#991B1B'} bg={status.levels_auto_enabled ? '#F0FDF4' : '#FEF2F2'} />
            <Pill label={`Payouts: ${status.cash_enabled ? 'LIVE' : 'off'}`} color={status.cash_enabled ? '#166534' : '#991B1B'} bg={status.cash_enabled ? '#F0FDF4' : '#FEF2F2'} />
            <Pill label={`Medals: ${status.medals_auto_enabled ? 'LIVE' : 'off'}`} color={status.medals_auto_enabled ? '#166534' : '#991B1B'} bg={status.medals_auto_enabled ? '#F0FDF4' : '#FEF2F2'} />
          </div>
        )}

        {/* ── OVERVIEW ── */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-black flex items-center gap-2" style={{ color: C.g800 }}><TrendingUp size={18} /> Program Overview</h2>
            <button onClick={loadOverview} className="p-2 rounded-xl border hover:bg-gray-50 transition" style={{ borderColor: C.g200 }}><RefreshCw size={14} style={{ color: C.g500 }} /></button>
          </div>

          {loading && !data ? <Spin /> : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
                {[
                  { label: 'Affiliates', value: kpis?.total_affiliates || 0, color: C.forest, bg: '#F0FDF4' },
                  { label: 'Users referred', value: kpis?.total_referred_users || 0, color: '#3B82F6', bg: '#EFF6FF' },
                  { label: 'Active referred users', value: kpis?.total_active_users || 0, color: '#166534', bg: '#F0FDF4' },
                  { label: 'Total trade volume', value: `$${(kpis?.total_qualified_volume_usd || 0).toLocaleString()}`, color: '#92400E', bg: '#FEF3C7' },
                  { label: 'Commission (lifetime)', value: `$${(kpis?.total_commission_usd_lifetime || 0).toLocaleString()}`, color: '#6D28D9', bg: '#F5F3FF' },
                  { label: 'Commission (this month)', value: `$${(kpis?.total_commission_usd_this_month || 0).toLocaleString()}`, color: '#6D28D9', bg: '#F5F3FF' },
                  { label: 'Builder+', value: (kpis?.level_counts?.Builder || 0) + (kpis?.level_counts?.Titan || 0) + (kpis?.level_counts?.Legendary || 0), color: '#2D6A4F', bg: '#F0FDF4' },
                  { label: 'Legendary', value: kpis?.level_counts?.Legendary || 0, color: '#1B4332', bg: '#F0FDF4' },
                ].map(s => (
                  <div key={s.label} className="bg-white rounded-2xl border p-4" style={{ borderColor: C.g200 }}>
                    <p className="text-xl font-black" style={{ color: s.color }}>{s.value}</p>
                    <p className="text-xs font-bold mt-1" style={{ color: C.g600 }}>{s.label}</p>
                  </div>
                ))}
              </div>

              <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search by username…"
                className="bg-white border rounded-xl px-3 py-2 text-sm font-semibold outline-none w-full max-w-xs mb-3"
                style={{ borderColor: C.g200, color: C.g700 }} />

              {rows.length === 0 ? (
                <Empty icon={<Users size={40} strokeWidth={1.5} style={{ color: C.g400 }} />} text="No affiliates with any referral activity yet" />
              ) : (
                <div className="bg-white rounded-2xl border overflow-x-auto" style={{ borderColor: C.g200 }}>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b" style={{ borderColor: C.g200 }}>
                        {COLS.map(c => (
                          <th key={c.key} onClick={() => sortBy(c.key)}
                            className="px-4 py-3 text-left text-xs font-black cursor-pointer select-none whitespace-nowrap"
                            style={{ color: sortKey === c.key ? C.forest : C.g500 }}>
                            {c.label} {sortKey === c.key ? (sortDir === 'desc' ? '↓' : '↑') : ''}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(a => (
                        <tr key={a.id} className="border-b last:border-0" style={{ borderColor: C.g200 }}>
                          <td className="px-4 py-3 font-bold" style={{ color: C.g800 }}>{a.username}</td>
                          <td className="px-4 py-3">{a.level ? <Pill label={a.level} color="#fff" bg={levelColor[a.level] || C.g400} /> : <span className="text-xs" style={{ color: C.g400 }}>—</span>}</td>
                          <td className="px-4 py-3" style={{ color: C.g700 }}>{a.users_brought}</td>
                          <td className="px-4 py-3" style={{ color: C.g700 }}>{a.active_users}</td>
                          <td className="px-4 py-3 font-semibold" style={{ color: C.g800 }}>${a.qualified_volume_usd.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                          <td className="px-4 py-3 font-semibold" style={{ color: '#6D28D9' }}>${a.total_commission_usd.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                          <td className="px-4 py-3" style={{ color: C.g700 }}>${a.commission_this_month_usd.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>

        {/* ── BUILDER APPLICATIONS ── */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-black flex items-center gap-2" style={{ color: C.g800 }}><UserCheck size={18} /> Builder Applications ({apps.length})</h2>
            <button onClick={loadApps} className="p-2 rounded-xl border hover:bg-gray-50 transition" style={{ borderColor: C.g200 }}><RefreshCw size={14} style={{ color: C.g500 }} /></button>
          </div>

          <div className="flex gap-2 flex-wrap mb-4">
            {['pending', 'approved', 'rejected', 'all'].map(s => (
              <button key={s} onClick={() => setAppsFilter(s)}
                className="px-3 py-2 rounded-xl text-sm font-bold capitalize transition"
                style={appsFilter === s ? { background: C.forest, color: '#fff' } : { background: '#fff', color: C.g600, border: `1px solid ${C.g200}` }}>
                {s}
              </button>
            ))}
          </div>

          {appsLoading ? <Spin /> : apps.length === 0 ? (
            <Empty icon={<UserCheck size={40} strokeWidth={1.5} style={{ color: C.g400 }} />} text={`No ${appsFilter === 'all' ? '' : appsFilter} applications`} />
          ) : (
            <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: C.g200 }}>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b" style={{ borderColor: C.g200 }}>
                    <th className="px-4 py-3 text-left text-xs font-black" style={{ color: C.g500 }}>Applicant</th>
                    <th className="px-4 py-3 text-left text-xs font-black" style={{ color: C.g500 }}>Active users</th>
                    <th className="px-4 py-3 text-left text-xs font-black" style={{ color: C.g500 }}>Volume at apply</th>
                    <th className="px-4 py-3 text-left text-xs font-black" style={{ color: C.g500 }}>Status</th>
                    {appsFilter === 'pending' && <th className="px-4 py-3 text-right text-xs font-black" style={{ color: C.g500 }}>Action</th>}
                  </tr>
                </thead>
                <tbody>
                  {apps.map(a => (
                    <tr key={a.id} className="border-b last:border-0" style={{ borderColor: C.g200 }}>
                      <td className="px-4 py-3">
                        <p className="font-bold" style={{ color: C.g800 }}>{a.users?.username || '—'}</p>
                        <p className="text-xs" style={{ color: C.g400 }}>{a.users?.email} {a.users?.country ? `· ${a.users.country}` : ''}</p>
                      </td>
                      <td className="px-4 py-3" style={{ color: C.g700 }}>{a.active_users_at_apply}</td>
                      <td className="px-4 py-3" style={{ color: C.g700 }}>${Number(a.qualified_volume_at_apply || 0).toLocaleString()}</td>
                      <td className="px-4 py-3">
                        <Pill label={a.status} color={a.status === 'approved' ? '#166534' : a.status === 'rejected' ? '#991B1B' : '#92400E'} bg={a.status === 'approved' ? '#F0FDF4' : a.status === 'rejected' ? '#FEF2F2' : '#FEF3C7'} />
                        {a.status === 'rejected' && a.rejection_reason && <p className="text-xs mt-1" style={{ color: C.g400 }}>{a.rejection_reason}</p>}
                      </td>
                      {appsFilter === 'pending' && (
                        <td className="px-4 py-3 text-right">
                          <div className="flex gap-2 justify-end">
                            <button onClick={() => approve(a.id)} disabled={acting === a.id} className="px-3 py-1.5 rounded-lg text-xs font-black text-white transition disabled:opacity-50" style={{ background: C.forest }}>{acting === a.id ? '…' : 'Approve'}</button>
                            <button onClick={() => reject(a.id)} disabled={acting === a.id} className="px-3 py-1.5 rounded-lg text-xs font-black transition disabled:opacity-50" style={{ background: '#FEF2F2', color: '#991B1B' }}>Reject</button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
export default function AffiliateManagerDashboard() {
  const [managerUser, setManagerUser] = useState(null);

  useEffect(() => {
    const stored = localStorage.getItem('affiliateManagerUser');
    const token  = localStorage.getItem('affiliateManagerToken');
    if (stored && token) {
      try {
        const u = JSON.parse(stored);
        if (u?.is_affiliate_manager || u?.is_admin || u?.is_ceo) setManagerUser(u);
      } catch {}
    }
  }, []);

  if (!managerUser) return <AffiliateManagerLogin onAuth={setManagerUser} />;
  return <AffiliateManagerInner user={managerUser} onLogout={() => setManagerUser(null)} />;
}
