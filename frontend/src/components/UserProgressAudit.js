// ============================================================================
// UserProgressAudit — one per-user "case file" used on TWO pages:
//   • Admin Panel  <UserProgressAudit mode="admin" ... />  → deep build: live
//     balances, full wallet ledger + balance_audit, mirror drift.
//   • Team Portal  <UserProgressAudit mode="team"  ... />  → lighter build: no
//     Money tab, no balance figures.
//
// Read-only. No ban / freeze / adjust actions here — those stay in the Admin
// user panel. Backend also hard-gates the money endpoint with requireFullAdmin,
// so the Team build physically cannot pull balances.
//
// Props:
//   mode   'admin' | 'team'            — which build to render
//   apiUrl string                      — e.g. `${REACT_APP_API_URL}` ('.../api')
//   authH  () => ({ Authorization })   — auth header factory for the host page
// ============================================================================
import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import {
  Search, X, RefreshCw, ChevronLeft, ChevronRight, Eye, ArrowLeft,
  User, ShieldAlert, Star, Wallet, Activity, History, AlertTriangle,
  CheckCircle, TrendingUp, Filter, ArrowUpRight, ArrowDownLeft,
} from 'lucide-react';

const K = {
  forest: '#1B4332', green: '#2D6A4F', mint: '#40916C', gold: '#F4A422',
  g50: '#F8FAFC', g100: '#F1F5F9', g200: '#E2E8F0', g300: '#CBD5E1',
  g400: '#94A3B8', g500: '#64748B', g600: '#475569', g700: '#334155', g800: '#1E293B',
  success: '#10B981', danger: '#EF4444', paid: '#3B82F6', warn: '#F59E0B',
};

const num = (n, d = 0) => new Intl.NumberFormat('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }).format(n || 0);
const btc = (n) => parseFloat(n || 0).toFixed(8);
const usd = (n) => `$${num(n, 2)}`;
const fmtDate = (ts) => (ts ? new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—');
const fmtDateTime = (ts) => (ts ? new Date(ts).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
const fmtAge = (ts) => {
  if (!ts) return '—';
  const s = (Date.now() - new Date(ts)) / 1000;
  if (s < 60) return 'Just now';
  if (s < 3600) return `${~~(s / 60)}m ago`;
  if (s < 86400) return `${~~(s / 3600)}h ago`;
  return `${~~(s / 86400)}d ago`;
};

const STATUS_STYLE = {
  active:  { c: '#166534', bg: '#F0FDF4', label: 'active' },
  frozen:  { c: '#92400E', bg: '#FFFBEB', label: 'frozen' },
  banned:  { c: '#991B1B', bg: '#FEF2F2', label: 'banned' },
};
const statusStyle = (s) => STATUS_STYLE[String(s || 'active').toLowerCase()] || STATUS_STYLE.active;

const TRADE_STATUS_STYLE = {
  COMPLETED: { c: '#166534', bg: '#F0FDF4' },
  CANCELLED: { c: '#6B7280', bg: '#F9FAFB' },
  DISPUTED:  { c: '#991B1B', bg: '#FEF2F2' },
  PAYMENT_SENT: { c: '#1D4ED8', bg: '#EFF6FF' },
  FUNDS_LOCKED: { c: '#92400E', bg: '#FFFBEB' },
  CREATED:   { c: '#475569', bg: '#F1F5F9' },
};
const tradeStatusStyle = (s) => TRADE_STATUS_STYLE[s] || { c: '#475569', bg: '#F1F5F9' };

function Spinner() {
  return <div className="flex justify-center py-10"><RefreshCw size={20} className="animate-spin" style={{ color: K.g400 }} /></div>;
}
function EmptyRow({ text }) {
  return <div className="text-center py-10 text-sm" style={{ color: K.g400 }}>{text}</div>;
}
function Pill({ children, c, bg }) {
  return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold" style={{ color: c, backgroundColor: bg }}>{children}</span>;
}
function Stat({ label, value, tone }) {
  return (
    <div className="rounded-xl border px-3 py-2.5" style={{ borderColor: K.g200, backgroundColor: '#fff' }}>
      <p className="text-[10px] font-black uppercase tracking-wide" style={{ color: K.g400 }}>{label}</p>
      <p className="text-sm font-black mt-0.5" style={{ color: tone || K.g800 }}>{value}</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────
export default function UserProgressAudit({ mode = 'team', apiUrl, authH }) {
  const isAdmin = mode === 'admin';
  const [openId, setOpenId] = useState(null);
  const [openUser, setOpenUser] = useState(null);

  // Stable identity so <Directory>'s load() can depend on it without re-fetch loops.
  const openUserFn = useCallback((u) => { setOpenUser(u); setOpenId(u.id); }, []);

  if (openId) {
    return (
      <UserCaseFile
        key={openId}
        userId={openId}
        seed={openUser}
        isAdmin={isAdmin}
        apiUrl={apiUrl}
        authH={authH}
        onBack={() => { setOpenId(null); setOpenUser(null); }}
      />
    );
  }
  return (
    <Directory
      isAdmin={isAdmin}
      apiUrl={apiUrl}
      authH={authH}
      onOpen={openUserFn}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DIRECTORY — every user, search / filter / sort / paginate
// ─────────────────────────────────────────────────────────────────────────────
function Directory({ isAdmin, apiUrl, authH, onOpen }) {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [verified, setVerified] = useState('');
  const [sort, setSort] = useState('created_at');
  const [sortDir, setSortDir] = useState('desc');
  const [hasFlag, setHasFlag] = useState(false);
  const [hasOpenDispute, setHasOpenDispute] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const LIMIT = 25;
  const debRef = useRef(null);
  const [debSearch, setDebSearch] = useState('');

  useEffect(() => {
    if (debRef.current) clearTimeout(debRef.current);
    debRef.current = setTimeout(() => setDebSearch(search.trim()), 350);
    return () => debRef.current && clearTimeout(debRef.current);
  }, [search]);

  useEffect(() => { setPage(1); }, [debSearch, status, verified, sort, sortDir, hasFlag, hasOpenDispute]);

  const autoOpenedFor = useRef('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { search: debSearch, page, limit: LIMIT, sort, sortDir };
      if (status) params.status = status;
      if (verified) params.verified = verified;
      if (hasFlag) params.hasFlag = 'true';
      if (hasOpenDispute) params.hasOpenDispute = 'true';
      const r = await axios.get(`${apiUrl}/admin/users`, { headers: authH(), params });
      const users = r.data.users || [];
      setRows(users);
      setTotal(r.data.total || 0);

      // Type a full username or email → jump straight into that user's case file.
      // Only fires when the query resolves to exactly one user AND matches their
      // username/email exactly (case-insensitive), so a partial search that
      // happens to return one row still just shows the list.
      const q = debSearch.trim().toLowerCase();
      if (q && q.length >= 3 && users.length === 1 && autoOpenedFor.current !== q) {
        const u = users[0];
        if ((u.username || '').toLowerCase() === q || (u.email || '').toLowerCase() === q) {
          autoOpenedFor.current = q;
          onOpen(u);
        }
      }
    } catch {
      toast.error('Failed to load users');
    } finally {
      setLoading(false);
    }
  }, [apiUrl, authH, debSearch, page, status, verified, sort, sortDir, hasFlag, hasOpenDispute, onOpen]);

  useEffect(() => { load(); }, [load]);

  const pages = Math.max(1, Math.ceil(total / LIMIT));

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-black" style={{ color: K.g800 }}>Users Progress Audit</h2>
          <p className="text-xs mt-0.5" style={{ color: K.g400 }}>
            Every user — profile, trade history, activity{isAdmin ? ', balances and full money ledger' : ''}. Read only.
          </p>
        </div>
        <button onClick={load} className="p-2 rounded-xl border hover:bg-gray-50 flex-shrink-0" style={{ borderColor: K.g200 }}>
          <RefreshCw size={14} style={{ color: K.g500 }} />
        </button>
      </div>

      {/* search + filter toggle */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: K.g400 }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search username, email, name or phone…"
            className="w-full pl-9 pr-8 py-2.5 rounded-xl border text-sm focus:outline-none"
            style={{ borderColor: K.g200 }}
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2">
              <X size={13} style={{ color: K.g400 }} />
            </button>
          )}
        </div>
        <button
          onClick={() => setShowFilters((v) => !v)}
          className="px-3 py-2.5 rounded-xl border text-sm font-semibold inline-flex items-center gap-1.5"
          style={{ borderColor: showFilters ? K.forest : K.g200, color: showFilters ? K.forest : K.g600 }}
        >
          <Filter size={13} /> Filters
        </button>
      </div>

      {showFilters && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-3 rounded-xl border" style={{ borderColor: K.g200, backgroundColor: K.g50 }}>
          <Select label="Status" value={status} onChange={setStatus} opts={[['', 'Any'], ['active', 'Active'], ['frozen', 'Frozen'], ['banned', 'Banned'], ['kyc_pending', 'KYC pending']]} />
          <Select label="Verified" value={verified} onChange={setVerified} opts={[['', 'Any'], ['email', 'Email ✓'], ['phone', 'Phone ✓'], ['id', 'ID ✓']]} />
          <Select label="Sort by" value={sort} onChange={setSort} opts={[['created_at', 'Joined'], ['last_seen_at', 'Last seen'], ['last_login', 'Last login'], ['total_trades', 'Trades'], ['average_rating', 'Rating']]} />
          <Select label="Order" value={sortDir} onChange={setSortDir} opts={[['desc', 'Newest / High'], ['asc', 'Oldest / Low']]} />
          <label className="col-span-2 sm:col-span-1 flex items-center gap-2 text-xs font-semibold px-1" style={{ color: K.g600 }}>
            <input type="checkbox" checked={hasFlag} onChange={(e) => setHasFlag(e.target.checked)} /> Has recon flag
          </label>
          <label className="col-span-2 sm:col-span-1 flex items-center gap-2 text-xs font-semibold px-1" style={{ color: K.g600 }}>
            <input type="checkbox" checked={hasOpenDispute} onChange={(e) => setHasOpenDispute(e.target.checked)} /> In open dispute
          </label>
        </div>
      )}

      <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: K.g200 }}>
        {loading ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <EmptyRow text="No users match" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead style={{ backgroundColor: K.g50 }}>
                <tr>
                  {['User', 'Status', 'KYC', 'Badge', 'Trades', 'Rating', 'Joined', 'Last seen', ''].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-[11px] font-black uppercase tracking-wide" style={{ color: K.g500 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((u) => {
                  const st = statusStyle(u.account_status);
                  return (
                    <tr key={u.id} className="border-t hover:bg-gray-50 transition cursor-pointer" style={{ borderColor: K.g100 }} onClick={() => onOpen(u)}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-black text-white flex-shrink-0" style={{ backgroundColor: K.forest }}>
                            {(u.username || u.email || '?')[0].toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="font-bold text-xs truncate" style={{ color: K.g800 }}>{u.username || '—'}</p>
                            <p className="text-xs truncate max-w-[180px]" style={{ color: K.g400 }}>{u.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3"><Pill c={st.c} bg={st.bg}>{st.label}</Pill></td>
                      <td className="px-4 py-3 text-xs" style={{ color: K.g600 }}>
                        {u.is_id_verified || u.kyc_status === 'approved' ? '✓' : (u.kyc_status || '—')}
                      </td>
                      <td className="px-4 py-3 text-xs font-bold" style={{ color: K.g600 }}>{u.badge || 'BEGINNER'}</td>
                      <td className="px-4 py-3 text-xs font-bold" style={{ color: K.g700 }}>{num(u.total_trades)}</td>
                      <td className="px-4 py-3 text-xs" style={{ color: K.g700 }}>
                        <span className="inline-flex items-center gap-1"><Star size={11} style={{ color: K.gold }} />{parseFloat(u.average_rating || 0).toFixed(1)}</span>
                      </td>
                      <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: K.g400 }}>{fmtDate(u.created_at)}</td>
                      <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: K.g400 }}>{fmtAge(u.last_seen_at)}</td>
                      <td className="px-4 py-3"><Eye size={14} style={{ color: K.g400 }} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {total > LIMIT && (
          <div className="flex items-center justify-between px-4 py-3 border-t" style={{ borderColor: K.g100 }}>
            <span className="text-xs" style={{ color: K.g400 }}>
              {(page - 1) * LIMIT + 1}–{Math.min(page * LIMIT, total)} of {num(total)}
            </span>
            <div className="flex items-center gap-2">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="p-1 rounded disabled:opacity-30"><ChevronLeft size={16} /></button>
              <span className="text-xs font-bold" style={{ color: K.g600 }}>{page} / {pages}</span>
              <button onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page >= pages} className="p-1 rounded disabled:opacity-30"><ChevronRight size={16} /></button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Select({ label, value, onChange, opts }) {
  return (
    <label className="block">
      <span className="text-[10px] font-black uppercase tracking-wide" style={{ color: K.g400 }}>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full px-2 py-2 rounded-lg border text-xs font-semibold focus:outline-none bg-white"
        style={{ borderColor: K.g200, color: K.g700 }}
      >
        {opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CASE FILE — one user, tabbed
// ─────────────────────────────────────────────────────────────────────────────
function UserCaseFile({ userId, seed, isAdmin, apiUrl, authH, onBack }) {
  const [tab, setTab] = useState('overview');
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const r = await axios.get(`${apiUrl}/admin/users/${userId}/detail`, { headers: authH() });
        if (alive) setDetail(r.data);
      } catch {
        if (alive) toast.error('Failed to load user detail');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [userId, apiUrl, authH]);

  const u = detail?.user || seed || {};
  const st = statusStyle(u.account_status);

  const TABS = [
    ['overview', 'Overview', User],
    ['trades', 'Trades', TrendingUp],
    ...(isAdmin ? [['money', 'Money', Wallet]] : []),
    ['activity', 'Activity', Activity],
    ['admin', 'Admin Actions', History],
    ['risk', 'Risk', ShieldAlert],
  ];

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="inline-flex items-center gap-1.5 text-xs font-bold hover:opacity-70" style={{ color: K.g500 }}>
        <ArrowLeft size={14} /> Back to all users
      </button>

      {/* identity header */}
      <div className="bg-white rounded-2xl border p-4" style={{ borderColor: K.g200 }}>
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center text-xl font-black text-white flex-shrink-0" style={{ backgroundColor: K.forest }}>
            {(u.username || u.email || '?')[0].toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-black" style={{ color: K.g800 }}>{u.username || '—'}</h2>
              <Pill c={st.c} bg={st.bg}>{st.label}</Pill>
              {u.has_warning && <Pill c="#92400E" bg="#FFFBEB">⚠ warning</Pill>}
            </div>
            <p className="text-xs mt-0.5" style={{ color: K.g400 }}>{u.email}{u.phone ? ` · ${u.phone}` : ''}{u.country ? ` · ${u.country}` : ''}</p>
            <p className="text-[11px] mt-0.5 font-mono" style={{ color: K.g300 }}>{userId}</p>
          </div>
        </div>

        {/* quick stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mt-4">
          <Stat label="Trades" value={loading ? '…' : num(detail?.user?.total_trades ?? seed?.total_trades ?? 0)} />
          <Stat label="Volume" value={loading ? '…' : detail ? `${usd(detail.tradeVolumeUsd)}${detail.tradeVolumeCapped ? '+' : ''}` : '—'} />
          <Stat label="Rating" value={`${parseFloat(u.average_rating || 0).toFixed(1)} ★`} />
          <Stat
            label="Open trade"
            value={loading ? '…' : detail ? (detail.activeTradeCount > 0 ? `${detail.activeTradeCount} live` : 'None') : '—'}
            tone={detail?.activeTradeCount > 0 ? K.warn : K.success}
          />
          <Stat label="KYC" value={(u.is_id_verified || u.kyc_status === 'approved') ? 'Verified' : (u.kyc_status || 'No')} />
          <Stat label="Joined" value={fmtDate(u.created_at)} />
        </div>
      </div>

      {/* tabs */}
      <div className="flex gap-1 overflow-x-auto border-b" style={{ borderColor: K.g200 }}>
        {TABS.map(([id, label, Icon]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold whitespace-nowrap border-b-2 -mb-px transition"
            style={{ color: tab === id ? K.forest : K.g500, borderColor: tab === id ? K.forest : 'transparent' }}
          >
            <Icon size={13} />{label}
          </button>
        ))}
      </div>

      <div>
        {tab === 'overview' && <OverviewTab detail={detail} seed={seed} loading={loading} />}
        {tab === 'trades' && <TradesTab userId={userId} apiUrl={apiUrl} authH={authH} />}
        {tab === 'money' && isAdmin && <MoneyTab userId={userId} apiUrl={apiUrl} authH={authH} />}
        {tab === 'activity' && <ActivityTab userId={userId} apiUrl={apiUrl} authH={authH} />}
        {tab === 'admin' && <AdminActionsTab userId={userId} apiUrl={apiUrl} authH={authH} />}
        {tab === 'risk' && <RiskTab userId={userId} apiUrl={apiUrl} authH={authH} isAdmin={isAdmin} />}
      </div>
    </div>
  );
}

// ---- OVERVIEW -------------------------------------------------------------
function OverviewTab({ detail, seed, loading }) {
  if (loading) return <Spinner />;
  if (!detail) return <EmptyRow text="No detail available" />;
  const u = detail.user || {};
  const rows = [
    ['Full name', u.full_name || '—'],
    ['Email verified', u.is_email_verified ? 'Yes' : 'No'],
    ['Phone verified', u.is_phone_verified ? 'Yes' : 'No'],
    ['ID verified', u.is_id_verified ? 'Yes' : 'No'],
    ['KYC status', u.kyc_status || '—'],
    ['Badge', u.badge || 'BEGINNER'],
    ['Feedback', `+${num(u.positive_feedback)} / -${num(u.negative_feedback)}`],
    ['Lifetime volume', `${usd(detail.tradeVolumeUsd)}${detail.tradeVolumeCapped ? '+' : ''}`],
    ['Referred by', detail.referredBy ? detail.referredBy.username : 'Direct signup'],
    ['Last login', fmtDateTime(u.last_login)],
    ['Last seen', fmtAge(u.last_seen_at)],
    ['Account age', u.created_at ? `${~~((Date.now() - new Date(u.created_at)) / 86400000)} days` : '—'],
  ];
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border p-4 grid sm:grid-cols-2 gap-x-6" style={{ borderColor: K.g200 }}>
        {rows.map(([l, v]) => (
          <div key={l} className="flex justify-between py-1.5 border-b text-xs" style={{ borderColor: K.g100 }}>
            <span style={{ color: K.g400 }}>{l}</span>
            <span className="font-bold text-right" style={{ color: K.g700 }}>{v}</span>
          </div>
        ))}
      </div>

      {detail.activeTrades?.length > 0 && (
        <div className="bg-white rounded-2xl border p-4" style={{ borderColor: K.g200 }}>
          <p className="text-xs font-black mb-2" style={{ color: K.g600 }}>In progress ({detail.activeTradeCount})</p>
          <div className="space-y-1.5">
            {detail.activeTrades.map((t) => (
              <div key={t.id} className="flex items-center justify-between px-2.5 py-2 rounded-lg text-xs" style={{ backgroundColor: '#FFFBEB' }}>
                <span className="font-bold" style={{ color: '#92400E' }}>{t.role === 'buyer' ? 'Buying' : 'Selling'} · {t.status}</span>
                <span className="font-black" style={{ color: K.g700 }}>{usd(t.amount_usd)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {detail.activeListings?.length > 0 && (
        <div className="bg-white rounded-2xl border p-4" style={{ borderColor: K.g200 }}>
          <p className="text-xs font-black mb-2" style={{ color: K.g600 }}>Active offers ({detail.activeListingCount})</p>
          <div className="space-y-1.5">
            {detail.activeListings.map((l) => (
              <div key={l.id} className="flex items-center justify-between px-2.5 py-2 rounded-lg text-xs" style={{ backgroundColor: '#F0FDF4' }}>
                <span className="font-bold" style={{ color: '#166534' }}>
                  {(l.listing_type || '').includes('SELL') ? 'Selling' : 'Buying'} {l.asset || 'BTC'}
                  {l.gift_card_brand ? ` · ${l.gift_card_brand}` : l.payment_method ? ` · ${l.payment_method}` : ''}
                </span>
                <span className="font-black" style={{ color: K.g700 }}>{l.country || '—'}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---- TRADES -------------------------------------------------------------
function TradesTab({ userId, apiUrl, authH }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const LIMIT = 25;

  useEffect(() => { setPage(1); }, [status]);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const params = { page, limit: LIMIT };
        if (status) params.status = status;
        const r = await axios.get(`${apiUrl}/admin/users/${userId}/trades`, { headers: authH(), params });
        if (alive) setData(r.data);
      } catch {
        if (alive) toast.error('Failed to load trades');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [userId, apiUrl, authH, page, status]);

  const s = data?.summary;
  const pages = data ? Math.max(1, Math.ceil((data.total || 0) / LIMIT)) : 1;

  return (
    <div className="space-y-3">
      {s && (
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          <Stat label="Total" value={num(s.total)} />
          <Stat label="Completed" value={num(s.completed)} tone={K.success} />
          <Stat label="Cancelled" value={num(s.cancelled)} />
          <Stat label="Disputed" value={num(s.disputed)} tone={s.disputed ? K.danger : K.g800} />
          <Stat label="Completion" value={`${s.completionRate}%`} />
          <Stat label="Avg time" value={s.avgMinutesToComplete != null ? `${s.avgMinutesToComplete}m` : '—'} />
          <Stat label="Volume" value={`${usd(s.volumeUsd)}${s.capped ? '+' : ''}`} />
          <Stat label="Fees paid (BTC)" value={btc(s.feesBtc)} />
          <Stat label="Fees paid (USDT)" value={usd(s.feesUsdt)} />
        </div>
      )}

      <div className="flex gap-2">
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="px-3 py-2 rounded-xl border text-xs font-semibold focus:outline-none bg-white" style={{ borderColor: K.g200, color: K.g700 }}>
          {[['', 'All statuses'], ['COMPLETED', 'Completed'], ['CANCELLED', 'Cancelled'], ['DISPUTED', 'Disputed'], ['PAYMENT_SENT', 'Payment sent'], ['FUNDS_LOCKED', 'Funds locked'], ['CREATED', 'Created']].map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
      </div>

      <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: K.g200 }}>
        {loading ? (
          <Spinner />
        ) : !data || data.trades.length === 0 ? (
          <EmptyRow text="No trades" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead style={{ backgroundColor: K.g50 }}>
                <tr>
                  {['Ref', 'Date', 'Side', 'Counterparty', 'Asset', 'Amount', 'Fee', 'Status'].map((h) => (
                    <th key={h} className="text-left px-3 py-2.5 text-[11px] font-black uppercase tracking-wide" style={{ color: K.g500 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.trades.map((t) => {
                  const ts = tradeStatusStyle(t.status);
                  const asset = t.listing?.asset || (t.gift_card_brand ? 'Gift card' : 'BTC');
                  const amt = t.amount_usd ? usd(t.amount_usd) : t.amount_btc ? `${btc(t.amount_btc)} BTC` : t.amount_usdt ? `${num(t.amount_usdt, 2)} USDT` : '—';
                  const fee = parseFloat(t.platform_fee_btc || 0) > 0 ? `${btc(t.platform_fee_btc)} BTC`
                    : parseFloat(t.platform_fee_usdt || 0) > 0 ? `${num(t.platform_fee_usdt, 2)} USDT` : '—';
                  return (
                    <tr key={t.id} className="border-t" style={{ borderColor: K.g100 }}>
                      <td className="px-3 py-2.5 text-xs font-mono" style={{ color: K.g600 }}>{t.trade_ref || t.id.slice(0, 8)}</td>
                      <td className="px-3 py-2.5 text-xs whitespace-nowrap" style={{ color: K.g400 }}>{fmtDate(t.created_at)}</td>
                      <td className="px-3 py-2.5 text-xs font-bold" style={{ color: t.role === 'buyer' ? K.paid : K.green }}>{t.role === 'buyer' ? 'Buying' : 'Selling'}</td>
                      <td className="px-3 py-2.5 text-xs" style={{ color: K.g600 }}>{t.counterparty?.username || '—'}</td>
                      <td className="px-3 py-2.5 text-xs" style={{ color: K.g600 }}>{asset}</td>
                      <td className="px-3 py-2.5 text-xs font-bold" style={{ color: K.g700 }}>{amt}</td>
                      <td className="px-3 py-2.5 text-xs" style={{ color: K.g500 }}>{fee}{t.fee_model === 'additive' ? ' +' : ''}</td>
                      <td className="px-3 py-2.5"><Pill c={ts.c} bg={ts.bg}>{t.status}</Pill></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {data && data.total > LIMIT && (
          <div className="flex items-center justify-between px-4 py-3 border-t" style={{ borderColor: K.g100 }}>
            <span className="text-xs" style={{ color: K.g400 }}>{num(data.total)} trades</span>
            <div className="flex items-center gap-2">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="p-1 rounded disabled:opacity-30"><ChevronLeft size={16} /></button>
              <span className="text-xs font-bold" style={{ color: K.g600 }}>{page} / {pages}</span>
              <button onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page >= pages} className="p-1 rounded disabled:opacity-30"><ChevronRight size={16} /></button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---- MONEY (admin only) ------------------------------------------------
function MoneyTab({ userId, apiUrl, authH }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [type, setType] = useState('');
  const LIMIT = 40;

  useEffect(() => { setPage(1); }, [type]);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const params = { page, limit: LIMIT };
        if (type) params.type = type;
        const r = await axios.get(`${apiUrl}/admin/users/${userId}/wallet-transactions`, { headers: authH(), params });
        if (alive) setData(r.data);
      } catch (e) {
        if (alive) toast.error(e.response?.data?.error || 'Failed to load ledger');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [userId, apiUrl, authH, page, type]);

  const w = data?.wallet || {};
  const m = data?.mirrors;
  const pages = data ? Math.max(1, Math.ceil((data.total || 0) / LIMIT)) : 1;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Stat label="BTC available" value={btc(w.balance_btc)} />
        <Stat label="BTC locked" value={btc(w.locked_balance_btc)} tone={parseFloat(w.locked_balance_btc || 0) > 0 ? K.warn : K.g800} />
        <Stat label="USDT available" value={num(w.balance_usdt, 2)} />
        <Stat label="USDT locked" value={num(w.locked_balance_usdt, 2)} tone={parseFloat(w.locked_balance_usdt || 0) > 0 ? K.warn : K.g800} />
      </div>

      {m && m.drift && (
        <div className="flex items-center gap-2 p-3 rounded-xl text-xs font-semibold" style={{ backgroundColor: '#FEF2F2', color: '#991B1B' }}>
          <AlertTriangle size={14} />
          Mirror drift — wallets {btc(m.wallets_btc)} · user_balances {m.user_balances_btc == null ? 'n/a' : btc(m.user_balances_btc)} · user_wallets {m.user_wallets_btc == null ? 'n/a' : btc(m.user_wallets_btc)}
        </div>
      )}

      <div className="flex gap-2">
        <select value={type} onChange={(e) => setType(e.target.value)} className="px-3 py-2 rounded-xl border text-xs font-semibold focus:outline-none bg-white" style={{ borderColor: K.g200, color: K.g700 }}>
          {[['', 'All types'], ['DEPOSIT', 'Deposit'], ['WITHDRAWAL', 'Withdrawal'], ['SWEEP', 'Sweep'], ['ESCROW_LOCK', 'Escrow lock'], ['ESCROW_RELEASE', 'Escrow release'], ['ESCROW_REFUND', 'Escrow refund'], ['TRANSFER_IN', 'Transfer in'], ['TRANSFER_OUT', 'Transfer out'], ['SWAP', 'Swap'], ['ADJUSTMENT', 'Adjustment'], ['FEE', 'Fee']].map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
      </div>

      <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: K.g200 }}>
        {loading ? (
          <Spinner />
        ) : !data || data.transactions.length === 0 ? (
          <EmptyRow text="No wallet transactions" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead style={{ backgroundColor: K.g50 }}>
                <tr>
                  {['Type', 'Amount', 'Fee', 'Status', 'Destination / note', 'When'].map((h) => (
                    <th key={h} className="text-left px-3 py-2.5 text-[11px] font-black uppercase tracking-wide" style={{ color: K.g500 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.transactions.map((tx) => {
                  const isUsdt = tx.currency === 'USDT';
                  const amt = isUsdt ? `${num(tx.amount_usdt, 2)} USDT` : `${btc(tx.amount_btc)} BTC`;
                  const fee = parseFloat(tx.platform_fee_btc || 0) > 0 ? `${btc(tx.platform_fee_btc)} BTC`
                    : parseFloat(tx.platform_fee_usdt || 0) > 0 ? `${num(tx.platform_fee_usdt, 2)} USDT` : '—';
                  const out = ['WITHDRAWAL', 'TRANSFER_OUT', 'SWEEP', 'ESCROW_LOCK', 'FEE'].includes(tx.type);
                  return (
                    <tr key={tx.id} className="border-t" style={{ borderColor: K.g100 }}>
                      <td className="px-3 py-2.5 text-xs font-bold" style={{ color: K.g700 }}>
                        <span className="inline-flex items-center gap-1">
                          {out ? <ArrowUpRight size={12} style={{ color: K.danger }} /> : <ArrowDownLeft size={12} style={{ color: K.success }} />}
                          {tx.type}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-xs font-bold" style={{ color: K.g700 }}>{amt}</td>
                      <td className="px-3 py-2.5 text-xs" style={{ color: K.g500 }}>{fee}</td>
                      <td className="px-3 py-2.5 text-xs" style={{ color: K.g600 }}>{tx.status || '—'}{tx.rejection_reason ? ` · ${tx.rejection_reason}` : ''}</td>
                      <td className="px-3 py-2.5 text-xs max-w-[240px] truncate" style={{ color: K.g500 }}>{tx.destination_address || tx.notes || '—'}</td>
                      <td className="px-3 py-2.5 text-xs whitespace-nowrap" style={{ color: K.g400 }}>{fmtDateTime(tx.created_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {data && data.total > LIMIT && (
          <div className="flex items-center justify-between px-4 py-3 border-t" style={{ borderColor: K.g100 }}>
            <span className="text-xs" style={{ color: K.g400 }}>{num(data.total)} entries</span>
            <div className="flex items-center gap-2">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="p-1 rounded disabled:opacity-30"><ChevronLeft size={16} /></button>
              <span className="text-xs font-bold" style={{ color: K.g600 }}>{page} / {pages}</span>
              <button onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page >= pages} className="p-1 rounded disabled:opacity-30"><ChevronRight size={16} /></button>
            </div>
          </div>
        )}
      </div>

      {data?.balanceAudit?.length > 0 && (
        <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: K.g200 }}>
          <p className="text-xs font-black px-4 pt-3 pb-1" style={{ color: K.g600 }}>Balance audit trail (BTC)</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead style={{ backgroundColor: K.g50 }}>
                <tr>{['Change', 'New balance', 'Reason', 'Trade', 'When'].map((h) => (
                  <th key={h} className="text-left px-3 py-2 text-[11px] font-black uppercase tracking-wide" style={{ color: K.g500 }}>{h}</th>
                ))}</tr>
              </thead>
              <tbody>
                {data.balanceAudit.map((a) => (
                  <tr key={a.id} className="border-t" style={{ borderColor: K.g100 }}>
                    <td className="px-3 py-2 text-xs font-bold" style={{ color: parseFloat(a.change_btc) < 0 ? K.danger : K.success }}>{parseFloat(a.change_btc) > 0 ? '+' : ''}{btc(a.change_btc)}</td>
                    <td className="px-3 py-2 text-xs" style={{ color: K.g600 }}>{btc(a.new_balance)}</td>
                    <td className="px-3 py-2 text-xs max-w-[260px] truncate" style={{ color: K.g500 }}>{a.reason || '—'}</td>
                    <td className="px-3 py-2 text-xs font-mono" style={{ color: K.g400 }}>{a.trade_id ? a.trade_id.slice(0, 8) : '—'}</td>
                    <td className="px-3 py-2 text-xs whitespace-nowrap" style={{ color: K.g400 }}>{fmtDateTime(a.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ---- ACTIVITY --------------------------------------------------------
const EVENT_TONE = {
  SIGNUP: K.forest, LOGIN: K.paid, SEEN: K.g400, KYC_SUBMIT: K.gold,
  LISTING: K.green, REVIEW_OUT: K.mint, REVIEW_IN: K.gold,
};
function ActivityTab({ userId, apiUrl, authH }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const r = await axios.get(`${apiUrl}/admin/users/${userId}/activity`, { headers: authH() });
        if (alive) setData(r.data);
      } catch {
        if (alive) toast.error('Failed to load activity');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [userId, apiUrl, authH]);

  if (loading) return <Spinner />;
  if (!data) return <EmptyRow text="No activity" />;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Last login" value={fmtAge(data.lastLogin)} />
        <Stat label="Last seen" value={fmtAge(data.lastSeen)} />
        <Stat label="Sessions invalidated" value={num(data.sessionInvalidations)} />
      </div>
      <div className="bg-white rounded-2xl border p-4" style={{ borderColor: K.g200 }}>
        {data.events.length === 0 ? (
          <EmptyRow text="No events" />
        ) : (
          <div className="space-y-0">
            {data.events.map((e, i) => (
              <div key={i} className="flex items-start gap-3 py-2 border-b last:border-0" style={{ borderColor: K.g100 }}>
                <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ backgroundColor: EVENT_TONE[e.type] || K.g400 }} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold" style={{ color: K.g700 }}>{e.label}</p>
                  <p className="text-[11px]" style={{ color: K.g400 }}>{e.type}</p>
                </div>
                <span className="text-[11px] whitespace-nowrap" style={{ color: K.g400 }}>{fmtDateTime(e.at)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---- ADMIN ACTIONS -------------------------------------------------
function AdminActionsTab({ userId, apiUrl, authH }) {
  const [entries, setEntries] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const r = await axios.get(`${apiUrl}/admin/audit-log`, { headers: authH(), params: { userId, limit: 200 } });
        if (alive) setEntries(r.data.entries || []);
      } catch {
        if (alive) toast.error('Failed to load admin actions');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [userId, apiUrl, authH]);

  if (loading) return <Spinner />;
  if (!entries || entries.length === 0) return <EmptyRow text="No admin actions recorded for this user" />;

  return (
    <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: K.g200 }}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead style={{ backgroundColor: K.g50 }}>
            <tr>{['Action', 'Performed by', 'Details', 'When'].map((h) => (
              <th key={h} className="text-left px-3 py-2.5 text-[11px] font-black uppercase tracking-wide" style={{ color: K.g500 }}>{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id} className="border-t" style={{ borderColor: K.g100 }}>
                <td className="px-3 py-2.5"><Pill c={K.g700} bg={K.g100}>{e.action}</Pill></td>
                <td className="px-3 py-2.5 text-xs" style={{ color: K.g600 }}>{e.admin?.username || e.admin?.email || 'system'}</td>
                <td className="px-3 py-2.5 text-xs max-w-[320px] truncate" style={{ color: K.g500 }}>
                  {e.details ? (typeof e.details === 'string' ? e.details : JSON.stringify(e.details)) : '—'}
                </td>
                <td className="px-3 py-2.5 text-xs whitespace-nowrap" style={{ color: K.g400 }}>{fmtDateTime(e.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---- RISK --------------------------------------------------------
function RiskTab({ userId, apiUrl, authH, isAdmin }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const r = await axios.get(`${apiUrl}/admin/users/${userId}/risk`, { headers: authH() });
        if (alive) setData(r.data);
      } catch {
        if (alive) toast.error('Failed to load risk view');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [userId, apiUrl, authH]);

  if (loading) return <Spinner />;
  if (!data) return <EmptyRow text="No risk data" />;
  const r = data.restriction || {};
  const c = data.counts || {};

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Stat label="Recon flags" value={num(c.flags)} tone={c.flags ? K.danger : K.g800} />
        <Stat label="Open disputes" value={num(c.openDisputes)} tone={c.openDisputes ? K.danger : K.g800} />
        <Stat label="Holds" value={num(c.holds)} tone={c.holds ? K.warn : K.g800} />
        <Stat label="Uncredited deposits" value={num(c.uncreditedDeposits)} tone={c.uncreditedDeposits ? K.warn : K.g800} />
      </div>

      <div className="rounded-2xl border p-4" style={{ borderColor: r.isRestricted ? '#FCA5A5' : K.g200, backgroundColor: r.isRestricted ? '#FEF2F2' : '#fff' }}>
        <p className="text-xs font-black mb-1" style={{ color: r.isRestricted ? '#991B1B' : K.g600 }}>
          {r.isRestricted ? `Account ${r.status.toUpperCase()}` : 'Account active'}
        </p>
        {r.isRestricted && (
          <p className="text-xs" style={{ color: '#991B1B' }}>
            {r.reason || 'No reason recorded'} · since {fmtDate(r.since)}
          </p>
        )}
        {r.hasWarning && <p className="text-xs mt-1" style={{ color: '#92400E' }}>⚠ Has an active warning flag</p>}
      </div>

      {data.flags?.length > 0 && (
        <RiskTable
          title="Reconciliation flags"
          head={['Currency', 'Source', 'Reason', 'Status', 'Diff', 'When']}
          rows={data.flags.map((f) => [f.currency || '—', f.source_table || '—', f.reason || '—', f.status || '—', f.diff ?? '—', fmtDateTime(f.created_at)])}
        />
      )}
      {data.openDisputes?.length > 0 && (
        <RiskTable
          title="Open disputes"
          head={['Ref', 'Role', 'Amount', 'Opened']}
          rows={data.openDisputes.map((t) => [t.trade_ref || t.id.slice(0, 8), t.role, usd(t.amount_usd), fmtDate(t.created_at)])}
        />
      )}
      {data.holds?.length > 0 && (
        <RiskTable
          title="Admin holds (balance_audit)"
          head={isAdmin ? ['Change', 'New balance', 'Reason', 'When'] : ['Reason', 'When']}
          rows={data.holds.map((h) => isAdmin
            ? [btc(h.change_btc), btc(h.new_balance), h.reason || '—', fmtDateTime(h.created_at)]
            : [h.reason || '—', fmtDateTime(h.created_at)])}
        />
      )}
      {data.uncreditedDeposits?.length > 0 && (
        <RiskTable
          title="Uncredited on-chain deposits"
          head={['Currency', 'Amount', 'Address', 'Detected by', 'When']}
          rows={data.uncreditedDeposits.map((d) => [d.currency || '—', d.amount ?? '—', (d.address || '').slice(0, 16) + '…', d.detected_by || '—', fmtDate(d.created_at)])}
        />
      )}

      {!data.flags?.length && !data.openDisputes?.length && !data.holds?.length && !data.uncreditedDeposits?.length && !r.isRestricted && (
        <div className="flex items-center gap-2 p-3 rounded-xl text-xs font-semibold" style={{ backgroundColor: '#F0FDF4', color: '#166534' }}>
          <CheckCircle size={14} /> Nothing flagged for this user.
        </div>
      )}
    </div>
  );
}

function RiskTable({ title, head, rows }) {
  return (
    <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: K.g200 }}>
      <p className="text-xs font-black px-4 pt-3 pb-1" style={{ color: K.g600 }}>{title}</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead style={{ backgroundColor: K.g50 }}>
            <tr>{head.map((h) => (
              <th key={h} className="text-left px-3 py-2 text-[11px] font-black uppercase tracking-wide" style={{ color: K.g500 }}>{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {rows.map((cells, i) => (
              <tr key={i} className="border-t" style={{ borderColor: K.g100 }}>
                {cells.map((cell, j) => (
                  <td key={j} className="px-3 py-2 text-xs" style={{ color: K.g600 }}>{String(cell)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
