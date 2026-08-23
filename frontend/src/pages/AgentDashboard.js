import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import {
  Headphones, Circle, Send, RefreshCw, ChevronLeft, User, Bot,
  CheckCircle, Clock, MessageCircle, Search, Wifi, WifiOff,
  Settings, LogOut, Eye, ArrowRight, Paperclip, FileText,
  AlertTriangle, ChevronDown, ChevronUp, Zap,
} from 'lucide-react';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';
// Dedicated agentToken (own login, below) takes priority — falls back to the main site's
// token only so an admin/moderator already logged into the main app can still open this
// page without a second login, same fallback pattern CeoDashboard uses for ceoToken/token.
const authH = () => {
  const t = localStorage.getItem('agentToken') || localStorage.getItem('token');
  return t ? { Authorization: `Bearer ${t}` } : {};
};

// ── Color palette (matches TeamDashboard) ───────────────────────────────────
const C = {
  forest: '#1B4332',
  forestLight: '#2D6A4F',
  g50:  '#F8FAFC', g100: '#F1F5F9', g200: '#E2E8F0', g300: '#CBD5E1',
  g400: '#94A3B8', g500: '#64748B', g600: '#475569', g700: '#334155', g800: '#1E293B',
};

// ── Markdown-lite renderer ──────────────────────────────────────────────────
function Msg({ text }) {
  return (
    <>
      {(text || '').split('\n').map((line, i, arr) => {
        const parts = line.split(/\*\*(.*?)\*\*/g);
        return (
          <span key={i}>
            {parts.map((p, j) => j % 2 === 1 ? <strong key={j}>{p}</strong> : p)}
            {i < arr.length - 1 && <br />}
          </span>
        );
      })}
    </>
  );
}

// ── Typing dots ─────────────────────────────────────────────────────────────
function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="px-4 py-3 rounded-2xl bg-white shadow-sm" style={{ borderRadius: '4px 18px 18px 18px' }}>
        <div className="flex gap-1 items-center h-4">
          {[0, 1, 2].map(i => (
            <span key={i} className="w-1.5 h-1.5 rounded-full animate-bounce"
              style={{ backgroundColor: '#94A3B8', animationDelay: `${i * 0.15}s` }} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Support-only login screen — its own page, not the customer-facing /login. Same
// password → email-OTP → (optional) 2FA flow as CeoDashboard's CeoLogin, hitting the exact
// same /api/auth/* endpoints, just checking is_agent/is_admin/is_moderator instead of
// is_ceo and storing under agentToken/agentUser so a support rep's session here is
// completely separate from any customer session in the same browser.
function AgentLogin({ onAuth }) {
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
    if (!(u?.is_agent || u?.is_admin || u?.is_moderator)) {
      setErr("This account doesn't have Support Dashboard access. Ask an admin to grant it from Admin Panel → Users.");
      return;
    }
    localStorage.setItem('agentToken', token);
    localStorage.setItem('agentUser', JSON.stringify(u));
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
      const { data } = await axios.post(`${API_URL}/auth/verify-login-otp`, { email, code: emailOtp });
      if (data.requires2FA) {
        setTempToken(data.tempToken);
        setNotice(`Enter the code from your ${data.twoFactorMethod === 'totp' ? 'authenticator app' : data.twoFactorMethod === 'sms' ? 'phone' : 'email'}`);
        setTwoFACode('');
        setStep('2fa');
      } else if (data.success) {
        finish(data.user, data.token);
      }
    } catch (e) {
      setErr(e.response?.data?.error || 'Invalid code. Please try again.');
      setEmailOtp('');
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
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-3" style={{ backgroundColor: C.forest }}>
            <Headphones size={26} color="#fff" />
          </div>
          <h1 className="font-black text-lg" style={{ color: C.g800 }}>PRAQEN Support</h1>
          <p className="text-xs mt-1" style={{ color: C.g400 }}>Support Dashboard — sign in with your support account</p>
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
      </div>
    </div>
  );
}

export default function AgentDashboard({ user: appUser }) {
  const [agentUser, setAgentUser] = useState(null);
  useEffect(() => {
    // Prefer a dedicated agent-session login; fall back to the main app's session if that
    // user already carries agent/admin/moderator rights (e.g. an admin opening this page
    // from within the already-logged-in main app, same convenience CeoDashboard offers).
    const stored = localStorage.getItem('agentUser');
    const token  = localStorage.getItem('agentToken');
    if (stored && token) {
      try {
        const u = JSON.parse(stored);
        if (u?.is_agent || u?.is_admin || u?.is_moderator) { setAgentUser(u); return; }
      } catch {}
    }
    if (appUser && (appUser.is_agent || appUser.is_admin || appUser.is_moderator)) setAgentUser(appUser);
  }, [appUser]);

  if (!agentUser) return <AgentLogin onAuth={setAgentUser} />;

  return <AgentDashboardInner user={agentUser} />;
}

function AgentDashboardInner({ user }) {
  const [agentStatus, setAgentStatus] = useState(null);
  const [isOnline, setIsOnline] = useState(false);
  const [displayName, setDisplayName] = useState(user?.full_name || user?.username || '');
  const [statusMsg, setStatusMsg] = useState('Available for live chat');
  const [toggling, setToggling] = useState(false);

  // Ticket queue
  const [tickets, setTickets] = useState([]);
  const [queueLoading, setQueueLoading] = useState(true);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [messages, setMessages] = useState([]);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [searchQ, setSearchQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [deptFilter, setDeptFilter] = useState('all');
  const DEPARTMENTS = [{ id: 'all', label: 'All Depts' }, { id: 'tech', label: 'Tech' }, { id: 'billing', label: 'Billing' }, { id: 'compliance', label: 'Compliance' }, { id: 'general', label: 'General' }];
  const [showSettings, setShowSettings] = useState(false);
  const [userTyping, setUserTyping] = useState(false);
  const [agentTyping, setAgentTyping] = useState(false);
  const [accessDenied, setAccessDenied] = useState(null);
  const chatEndRef = useRef(null);
  const replyRef = useRef(null);
  const pollRef = useRef(null);
  const typingPollRef = useRef(null);

  // ── Load agent status ──────────────────────────────────────────────────
  const loadAgentStatus = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API_URL}/agent/status`, { headers: authH() });
      setAgentStatus(data);
      setIsOnline(!!data.is_online);
      if (data.display_name) setDisplayName(data.display_name);
      if (data.status_message) setStatusMsg(data.status_message);
    } catch {}
  }, []);

  // ── Load ticket queue ──────────────────────────────────────────────────
  const loadQueue = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API_URL}/agent/dashboard`, { headers: authH() });
      setTickets(data.tickets || []);
      setAccessDenied(null);
    } catch (e) {
      if (e.response?.status === 403) {
        const msg = e.response?.data?.error || 'Agent access required';
        setAccessDenied(msg);
      }
    } finally {
      setQueueLoading(false);
    }
  }, []);

  useEffect(() => { loadAgentStatus(); loadQueue(); }, [loadAgentStatus, loadQueue]);

  // ── Auto-refresh queue every 10s ───────────────────────────────────────
  useEffect(() => {
    const interval = setInterval(loadQueue, 10000);
    return () => clearInterval(interval);
  }, [loadQueue]);

  // ── Toggle online/offline ──────────────────────────────────────────────
  const toggleOnline = async () => {
    if (toggling) return;
    setToggling(true);
    try {
      const newStatus = !isOnline;
      await axios.post(`${API_URL}/agent/status`, {
        is_online: newStatus,
        display_name: displayName || undefined,
        status_message: statusMsg || undefined,
      }, { headers: authH() });
      setIsOnline(newStatus);
      toast.success(newStatus ? 'You are now online for live chat' : 'You are now offline');
    } catch (e) {
      const msg = e.response?.data?.error || e.message || 'Failed to update status';
      toast.error(msg);
    } finally {
      setToggling(false);
    }
  };

  // ── Save profile settings ──────────────────────────────────────────────
  const saveProfile = async () => {
    try {
      await axios.post(`${API_URL}/agent/status`, {
        display_name: displayName,
        status_message: statusMsg,
      }, { headers: authH() });
      toast.success('Profile updated');
      setShowSettings(false);
    } catch (e) {
      toast.error('Failed to update profile');
    }
  };

  // ── Open a ticket for live chat ────────────────────────────────────────
  const openTicket = async (ticket) => {
    setSelectedTicket(ticket);
    setReply('');
    setMessages([]);
    setUserTyping(false);

    try {
      // Auto-accept/claim the ticket if unassigned
      if (!ticket.assigned_agent_id) {
        await axios.post(`${API_URL}/agent/tickets/${ticket.id}/accept`, {}, { headers: authH() });
      }

      // Load messages
      const { data } = await axios.get(`${API_URL}/agent/tickets/${ticket.id}/messages`, { headers: authH() });
      setMessages(data.messages || []);
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    } catch (e) {
      toast.error('Failed to load chat');
    }
  };

  // ── Poll for new messages when a ticket is open ────────────────────────
  useEffect(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    if (!selectedTicket) return;

    pollRef.current = setInterval(async () => {
      try {
        const { data } = await axios.get(`${API_URL}/agent/tickets/${selectedTicket.id}/messages`, { headers: authH() });
        const incoming = data.messages || [];
        setMessages(prev => {
          if (incoming.length <= prev.length) return prev;
          return incoming;
        });
      } catch {}
    }, 3000);

    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [selectedTicket]);

  // ── Poll for typing indicators ─────────────────────────────────────────
  useEffect(() => {
    if (typingPollRef.current) { clearInterval(typingPollRef.current); typingPollRef.current = null; }
    if (!selectedTicket) return;

    typingPollRef.current = setInterval(async () => {
      try {
        const { data } = await axios.get(`${API_URL}/support/tickets/${selectedTicket.id}/typing`, { headers: authH() });
        const typingUserIds = data.typing || [];
        // Check if any user (non-agent) is typing
        const isUserTyping = typingUserIds.some(id => id !== user?.id);
        setUserTyping(isUserTyping);
      } catch {}
    }, 2000);

    return () => { if (typingPollRef.current) clearInterval(typingPollRef.current); };
  }, [selectedTicket, user?.id]);

  // ── Scroll to bottom on new messages ───────────────────────────────────
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, userTyping]);

  // ── Send reply ─────────────────────────────────────────────────────────
  const sendReply = async () => {
    if (!reply.trim() || !selectedTicket || sending) return;
    setSending(true);
    const msgText = reply.trim();
    setReply('');

    try {
      const { data } = await axios.post(`${API_URL}/agent/tickets/${selectedTicket.id}/reply`, { message: msgText }, { headers: authH() });
      setMessages(prev => [...prev, data.message]);
      setTickets(prev => prev.map(t => t.id === selectedTicket.id ? { ...t, status: 'active', updated_at: new Date().toISOString() } : t));
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    } catch (e) {
      setReply(msgText);
      toast.error(e.response?.data?.error || 'Failed to send');
    } finally {
      setSending(false);
    }
  };

  // ── Send typing indicator ──────────────────────────────────────────────
  const sendTyping = async () => {
    if (!selectedTicket) return;
    try {
      await axios.post(`${API_URL}/support/tickets/${selectedTicket.id}/typing`, {}, { headers: authH() });
    } catch {}
  };

  // ── Update ticket status ───────────────────────────────────────────────
  const updateStatus = async (id, status) => {
    try {
      await axios.patch(`${API_URL}/agent/tickets/${id}/status`, { status }, { headers: authH() });
      setTickets(prev => prev.map(t => t.id === id ? { ...t, status } : t));
      if (selectedTicket?.id === id) setSelectedTicket(prev => prev ? { ...prev, status } : prev);
      toast.success('Status updated');
    } catch (e) { toast.error(e.response?.data?.error || 'Failed to update status'); }
  };

  // ── Logout ─────────────────────────────────────────────────────────────
  const handleLogout = async () => {
    if (isOnline) {
      await axios.post(`${API_URL}/agent/status`, { is_online: false }, { headers: authH() }).catch(() => {});
    }
    // Only clear the dedicated agent session — never the main site's token/user, in case
    // this was an admin/moderator using their existing main-app login as a fallback (see
    // AgentDashboard's auth-gate above) rather than a real agentToken.
    localStorage.removeItem('agentToken');
    localStorage.removeItem('agentUser');
    window.location.href = '/agent-dashboard';
  };

  // ── Filtered tickets ───────────────────────────────────────────────────
  const filtered = tickets.filter(t => {
    if (statusFilter !== 'all' && t.status !== statusFilter) return false;
    if (deptFilter !== 'all' && (t.department || 'general') !== deptFilter) return false;
    if (searchQ.trim()) {
      const q = searchQ.toLowerCase();
      return (t.username || '').toLowerCase().includes(q)
        || (t.subject || '').toLowerCase().includes(q)
        || (t.full_name || '').toLowerCase().includes(q)
        || (t.department || '').toLowerCase().includes(q);
    }
    return true;
  });

  const counts = {
    all: tickets.length,
    open: tickets.filter(t => t.status === 'open').length,
    active: tickets.filter(t => t.status === 'active').length,
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#F8FAFC' }}>
      {/* ── Top Header Bar ──────────────────────────────────────────────── */}
      <div className="sticky top-0 z-50 border-b" style={{ backgroundColor: '#fff', borderColor: C.g200 }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: `linear-gradient(135deg, ${C.forest}, ${C.forestLight})` }}>
              <Headphones size={18} color="white" />
            </div>
            <div>
              <h1 className="text-sm font-black" style={{ color: C.g800 }}>Agent Dashboard</h1>
              <p className="text-[10px]" style={{ color: C.g400 }}>PRAQEN Live Support</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Online toggle */}
            <button onClick={toggleOnline} disabled={toggling}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all"
              style={{
                backgroundColor: isOnline ? '#D1FAE5' : '#FEE2E2',
                color: isOnline ? '#065F46' : '#991B1B',
                border: `1.5px solid ${isOnline ? '#A7F3D0' : '#FECACA'}`,
                opacity: toggling ? 0.6 : 1,
              }}>
              {isOnline
                ? <><Wifi size={13} /> Online</>
                : <><WifiOff size={13} /> Offline</>
              }
            </button>

            {/* Settings */}
            <button onClick={() => setShowSettings(!showSettings)}
              className="p-2 rounded-xl border hover:bg-gray-50 transition"
              style={{ borderColor: C.g200 }}>
              <Settings size={15} style={{ color: C.g500 }} />
            </button>

            {/* Logout */}
            <button onClick={handleLogout}
              className="p-2 rounded-xl border hover:bg-gray-50 transition"
              style={{ borderColor: C.g200 }}>
              <LogOut size={15} style={{ color: C.g500 }} />
            </button>
          </div>
        </div>
      </div>

      {/* ── Settings Panel (collapsible) ────────────────────────────────── */}
      {showSettings && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
          <div className="bg-white rounded-2xl border p-5 space-y-4" style={{ borderColor: C.g200 }}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black" style={{ color: C.g800 }}>Agent Profile</h3>
              <button onClick={() => setShowSettings(false)} className="text-xs font-bold" style={{ color: C.g400 }}>Close</button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold mb-1" style={{ color: C.g500 }}>Display Name</label>
                <input value={displayName} onChange={e => setDisplayName(e.target.value)}
                  placeholder="Your name shown to users"
                  className="w-full px-3 py-2.5 rounded-xl text-sm border outline-none" style={{ borderColor: C.g200 }} />
              </div>
              <div>
                <label className="block text-[10px] font-bold mb-1" style={{ color: C.g500 }}>Status Message</label>
                <input value={statusMsg} onChange={e => setStatusMsg(e.target.value)}
                  placeholder="e.g. Available for live chat"
                  className="w-full px-3 py-2.5 rounded-xl text-sm border outline-none" style={{ borderColor: C.g200 }} />
              </div>
            </div>
            <button onClick={saveProfile}
              className="px-6 py-2 rounded-xl text-xs font-bold text-white" style={{ backgroundColor: C.forest }}>
              Save Profile
            </button>
          </div>
        </div>
      )}

      {/* ── Main Layout ─────────────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
        <div className="flex flex-col lg:flex-row gap-4" style={{ minHeight: 'calc(100vh - 120px)' }}>

          {/* ── Left Panel: Ticket Queue ─────────────────────────────────── */}
          <div className="w-full lg:w-[340px] flex-shrink-0 flex flex-col">

            {/* Search */}
            <div className="mb-3">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: C.g400 }} />
                <input value={searchQ} onChange={e => setSearchQ(e.target.value)}
                  placeholder="Search chats…"
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl text-sm border outline-none"
                  style={{ borderColor: C.g200 }} />
              </div>
            </div>

            {/* Status filter tabs */}
            <div className="flex gap-1.5 mb-2">
              {[
                { id: 'all', label: `All (${counts.all})` },
                { id: 'open', label: `Open (${counts.open})` },
                { id: 'active', label: `Active (${counts.active})` },
              ].map(f => (
                <button key={f.id} onClick={() => setStatusFilter(f.id)}
                  className="px-3 py-1.5 rounded-xl text-[11px] font-bold transition"
                  style={{
                    backgroundColor: statusFilter === f.id ? C.forest : 'white',
                    color: statusFilter === f.id ? '#fff' : C.g500,
                    border: `1px solid ${statusFilter === f.id ? C.forest : C.g200}`,
                  }}>
                  {f.label}
                </button>
              ))}
            </div>

            {/* Department filter */}
            <div className="flex gap-1.5 mb-3 overflow-x-auto pb-1">
              {DEPARTMENTS.map(d => (
                <button key={d.id} onClick={() => setDeptFilter(d.id)}
                  className="px-2.5 py-1 rounded-lg text-[10px] font-bold transition flex-shrink-0"
                  style={{
                    backgroundColor: deptFilter === d.id ? '#1B433280' : '#fff',
                    color: deptFilter === d.id ? '#fff' : '#64748B',
                    border: `1px solid ${deptFilter === d.id ? '#1B4332' : '#E2E8F0'}`,
                  }}>
                  {d.label}
                </button>
              ))}
            </div>

            {/* Queue list */}
            <div className="flex-1 overflow-y-auto space-y-1.5" style={{ maxHeight: 'calc(100vh - 260px)' }}>
              {queueLoading ? (
                <div className="flex justify-center py-10">
                  <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: C.forest }} />
                </div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-10">
                  <MessageCircle size={32} className="mx-auto mb-2" style={{ color: C.g200 }} />
                  <p className="text-xs font-bold" style={{ color: C.g400 }}>No chats in queue</p>
                  <p className="text-[10px] mt-0.5" style={{ color: C.g300 }}>
                    {isOnline ? 'Waiting for user requests…' : 'Go online to receive chats'}
                  </p>
                </div>
              ) : (
                filtered.map(t => {
                  const isSelected = selectedTicket?.id === t.id;
                  const isAssigned = t.assigned_agent_id === user?.id;
                  return (
                    <button key={t.id} onClick={() => openTicket(t)}
                      className="w-full text-left p-3 rounded-xl transition-all"
                      style={{
                        backgroundColor: isSelected ? '#F0FDF4' : '#fff',
                        border: `1.5px solid ${isSelected ? C.forest : C.g200}`,
                        boxShadow: isSelected ? `0 0 0 1px ${C.forest}20` : 'none',
                      }}>
                      <div className="flex items-start gap-2.5">
                        {/* Avatar */}
                        <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                          style={{ backgroundColor: t.avatar_url ? 'transparent' : C.g100 }}>
                          {t.avatar_url
                            ? <img src={t.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover" />
                            : <span className="text-xs font-black" style={{ color: C.g500 }}>
                                {(t.username || t.full_name || '?')[0].toUpperCase()}
                              </span>
                          }
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs font-black truncate" style={{ color: C.g800 }}>
                              {t.full_name || t.username || 'User'}
                            </p>
                            <span className="flex-shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                              style={{
                                backgroundColor: t.status === 'open' ? '#EFF6FF' : t.status === 'active' ? '#F0FDF4' : '#F9FAFB',
                                color: t.status === 'open' ? '#3B82F6' : t.status === 'active' ? '#166534' : '#6B7280',
                              }}>
                              {t.status}
                            </span>
                          </div>
                          <p className="text-[11px] font-bold truncate mt-0.5" style={{ color: C.g600 }}>
                            {t.subject}
                          </p>
                          <div className="flex items-center gap-1.5 mt-1">
                            {t.department && t.department !== 'general' && (
                              <span className="text-[9px] font-bold px-1.5 py-0 rounded" style={{ backgroundColor: '#EFF6FF', color: '#2563EB' }}>
                                {t.department.charAt(0).toUpperCase() + t.department.slice(1)}
                              </span>
                            )}
                            <Clock size={10} style={{ color: C.g300 }} />
                            <p className="text-[9px]" style={{ color: C.g400 }}>
                              {new Date(t.updated_at || t.created_at).toLocaleString()}
                            </p>
                            {isAssigned && (
                              <span className="text-[9px] font-bold px-1 py-0 rounded" style={{ backgroundColor: '#D1FAE5', color: '#065F46' }}>
                                yours
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* ── Right Panel: Chat View ───────────────────────────────────── */}
          <div className="flex-1 flex flex-col bg-white rounded-2xl border overflow-hidden" style={{ borderColor: C.g200 }}>
            {!selectedTicket ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-6">
                {accessDenied ? (
                  <>
                    <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
                      style={{ backgroundColor: '#FEF2F2' }}>
                      <AlertTriangle size={32} color="#DC2626" />
                    </div>
                    <div>
                      <p className="text-base font-black" style={{ color: '#DC2626' }}>Access Denied</p>
                      <p className="text-xs mt-1 max-w-sm leading-relaxed" style={{ color: C.g500 }}>
                        {accessDenied}
                      </p>
                    </div>
                    <div className="bg-gray-50 rounded-xl p-3 max-w-sm text-left">
                      <p className="text-[10px] font-bold mb-1" style={{ color: C.g600 }}>How to get access:</p>
                      <ol className="text-[10px] space-y-1" style={{ color: C.g500 }}>
                        <li>1. Ask an admin to open the Admin Panel → Users</li>
                        <li>2. Find your account and click "Grant Support Access"</li>
                      </ol>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
                      style={{ backgroundColor: '#F0FDF4' }}>
                      <Headphones size={32} style={{ color: C.forest }} />
                    </div>
                    <div>
                      <p className="text-base font-black" style={{ color: C.g800 }}>Agent Dashboard</p>
                      <p className="text-xs mt-1 max-w-xs" style={{ color: C.g400 }}>
                        {isOnline
                          ? 'Select a chat from the queue to start helping a user.'
                          : 'Go online to start receiving live chat requests.'}
                      </p>
                    </div>
                    {!isOnline && (
                      <button onClick={toggleOnline}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-white"
                        style={{ backgroundColor: C.forest }}>
                        <Wifi size={14} /> Go Online
                      </button>
                    )}
                  </>
                )}
              </div>
            ) : (
              <>
                {/* Chat header */}
                <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: C.g200 }}>
                  <div className="flex items-center gap-3 min-w-0">
                    <button onClick={() => setSelectedTicket(null)}
                      className="lg:hidden p-1.5 rounded-lg hover:bg-gray-100" style={{ color: C.g500 }}>
                      <ChevronLeft size={18} />
                    </button>
                    <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: selectedTicket.avatar_url ? 'transparent' : C.g100 }}>
                      {selectedTicket.avatar_url
                        ? <img src={selectedTicket.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover" />
                        : <span className="text-xs font-black" style={{ color: C.g500 }}>
                            {(selectedTicket.username || '?')[0].toUpperCase()}
                          </span>
                      }
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-black truncate" style={{ color: C.g800 }}>
                        {selectedTicket.full_name || selectedTicket.username}
                      </p>
                      <p className="text-[10px] truncate" style={{ color: C.g400 }}>
                        {selectedTicket.subject} · Ticket #{selectedTicket.id?.slice(0, 8).toUpperCase()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Department badge */}
                    {selectedTicket.department && selectedTicket.department !== 'general' && (
                      <span className="text-[10px] font-bold px-2 py-1 rounded-lg" style={{ backgroundColor: '#EFF6FF', color: '#2563EB' }}>
                        {selectedTicket.department.charAt(0).toUpperCase() + selectedTicket.department.slice(1)}
                      </span>
                    )}
                    {/* Status dropdown */}
                    <select value={selectedTicket.status}
                      onChange={e => updateStatus(selectedTicket.id, e.target.value)}
                      className="text-[10px] font-bold px-2 py-1 rounded-lg border outline-none"
                      style={{ borderColor: C.g200, color: C.g600 }}>
                      <option value="open">Open</option>
                      <option value="active">Active</option>
                      <option value="resolved">Resolved</option>
                      <option value="closed">Closed</option>
                    </select>
                  </div>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3" style={{ backgroundColor: '#F8FAFC' }}>
                  {/* System notice */}
                  <div className="flex justify-center">
                    <span className="text-[10px] font-bold px-3 py-1 rounded-full"
                      style={{ backgroundColor: '#F0FDF4', color: C.forest }}>
                      Ticket #{selectedTicket.id?.slice(0, 8).toUpperCase()} · {selectedTicket.status}
                    </span>
                  </div>

                  {messages.map((m, i) => {
                    const isAgent = m.is_admin === true || m.sender_id === user?.id;
                    return (
                      <div key={m.id || i} className={`flex ${isAgent ? 'justify-end' : 'justify-start'}`}>
                        {!isAgent && (
                          <div className="w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0 mr-2 mt-0.5"
                            style={{ backgroundColor: C.g100 }}>
                            <User size={12} style={{ color: C.g500 }} />
                          </div>
                        )}
                        <div className="max-w-[80%]">
                          <div className="px-3 py-2.5 text-sm leading-relaxed"
                            style={{
                              backgroundColor: isAgent ? C.forest : '#fff',
                              color: isAgent ? 'white' : C.g800,
                              borderRadius: isAgent ? '18px 18px 4px 18px' : '4px 18px 18px 18px',
                              boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
                            }}>
                            <p className="text-[10px] font-bold mb-1" style={{ opacity: 0.6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {isAgent ? (displayName || user?.username || 'Agent') : (selectedTicket.username || 'User')}
                            </p>
                            <Msg text={m.message} />
                          </div>
                          <p className="text-[9px] mt-0.5 px-1" style={{ color: C.g300, textAlign: isAgent ? 'right' : 'left' }}>
                            {new Date(m.created_at).toLocaleTimeString()}
                          </p>
                        </div>
                      </div>
                    );
                  })}

                  {/* User typing indicator */}
                  {userTyping && (
                    <div className="flex justify-start items-center gap-2">
                      <div className="w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: C.g100 }}>
                        <User size={12} style={{ color: C.g500 }} />
                      </div>
                      <div className="px-3 py-2 rounded-2xl bg-white shadow-sm" style={{ borderRadius: '4px 18px 18px 18px' }}>
                        <p className="text-[10px] font-bold" style={{ color: C.g400 }}>
                          {selectedTicket.username || 'User'} is typing…
                        </p>
                      </div>
                    </div>
                  )}

                  <div ref={chatEndRef} />
                </div>

                {/* Reply input */}
                <div className="flex-shrink-0 flex gap-2 items-end px-4 py-3 border-t" style={{ borderColor: C.g200 }}>
                  <textarea ref={replyRef} value={reply}
                    onChange={e => {
                      setReply(e.target.value);
                      sendTyping();
                    }}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendReply(); } }}
                    placeholder="Type your reply…"
                    rows={1}
                    className="flex-1 px-3 py-2.5 rounded-xl text-sm border outline-none resize-none"
                    style={{
                      borderColor: reply ? C.forest : C.g200,
                      maxHeight: 100,
                      fontFamily: 'inherit',
                    }} />
                  <button onClick={sendReply} disabled={!reply.trim() || sending}
                    className="w-10 h-10 rounded-xl flex items-center justify-center transition flex-shrink-0"
                    style={{
                      background: reply.trim() && !sending ? `linear-gradient(135deg, ${C.forest}, ${C.forestLight})` : C.g100,
                      opacity: (!reply.trim() || sending) ? 0.5 : 1,
                    }}>
                    {sending
                      ? <RefreshCw size={16} color="white" className="animate-spin" />
                      : <Send size={16} color={reply.trim() ? 'white' : C.g400} />}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
