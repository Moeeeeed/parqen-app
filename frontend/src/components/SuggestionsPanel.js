import React, { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'react-toastify';
import {
  MessageCircle, X, Send, RefreshCw, ChevronLeft,
  Lightbulb, CheckCircle, User, Bot, Mail,
  Ticket, ArrowRight, Shield, Clock,
  Coins, Banknote, ArrowLeftRight, CreditCard, Settings,
  Wallet, BadgeCheck, HelpCircle, Zap, TrendingUp, Bug,
  Hand, Smile, Check,
  Flag, AlertCircle, AlertOctagon, AlertTriangle,
} from 'lucide-react';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';
const authH = () => {
  const t = localStorage.getItem('token');
  return t ? { Authorization: `Bearer ${t}` } : {};
};

// ── Topics ────────────────────────────────────────────────────────────────────
const TOPICS = [
  { id: 'buy',     label: 'Buy Bitcoin',       icon: Coins,          cat: 'general',  color: '#1B4332', bg: '#F0FDF4',
    hint: 'Browse offers, start a trade, payment help' },
  { id: 'sell',    label: 'Sell Bitcoin',       icon: Banknote,       cat: 'general',  color: '#D97706', bg: '#FFFBEB',
    hint: 'Create listings, find buyers, pricing help' },
  { id: 'trade',   label: 'Trade Issue',        icon: ArrowLeftRight, cat: 'trade',    color: '#7C3AED', bg: '#F5F3FF',
    hint: 'Stuck trade, dispute, escrow problem' },
  { id: 'payment', label: 'Payment Problem',    icon: CreditCard,     cat: 'payment',  color: '#0D9488', bg: '#F0FDFA',
    hint: 'MoMo, bank transfer, payment failed' },
  { id: 'account', label: 'My Account',         icon: Settings,       cat: 'account',  color: '#BE185D', bg: '#FDF2F8',
    hint: 'Login, password, profile settings' },
  { id: 'wallet',  label: 'Wallet / Balance',   icon: Wallet,         cat: 'general',  color: '#EA580C', bg: '#FFF7ED',
    hint: 'Deposit, withdraw, balance mismatch' },
  { id: 'kyc',     label: 'Verification / KYC', icon: BadgeCheck,     cat: 'account',  color: '#6D28D9', bg: '#F5F3FF',
    hint: 'ID upload, KYC review, limits' },
  { id: 'other',   label: 'Something else',     icon: HelpCircle,     cat: 'other',    color: '#475569', bg: '#F8FAFC',
    hint: 'Any other question or request' },
];

// ── Suggestion categories ─────────────────────────────────────────────────────
const SUG_CATS = [
  { id: 'feature',     label: 'Feature Request', icon: Lightbulb },
  { id: 'improvement', label: 'Improvement',      icon: Zap },
  { id: 'trading',     label: 'Trading Tip',      icon: TrendingUp },
  { id: 'bug',         label: 'Bug Report',       icon: Bug },
  { id: 'other',       label: 'Other',            icon: HelpCircle },
];

// ── FAQ articles per topic (self-serve deflection) ───────────────────────────
const FAQ_BY_TOPIC = {
  buy: [
    { q: 'How do I find a seller?', a: 'Go to **Buy Bitcoin** and browse offers by country/payment method. Filter using the search bar at the top.' },
    { q: 'How does escrow protect me?', a: 'The seller locks BTC in escrow before you pay. You only release it after confirming payment in **My Trades**.' },
    { q: 'What payment methods are accepted?', a: 'MoMo (MTN, Vodafone, AirtelTigo), bank transfers, and gift cards — varies by seller offer.' },
  ],
  sell: [
    { q: 'How do I create a listing?', a: 'Go to **Sell Bitcoin** and set your price, margin, payment methods, and limits. Your wallet must have at least $10 in BTC.' },
    { q: 'How is pricing calculated?', a: 'Set a **fixed price** or a **margin** above/below the market rate. The price updates automatically with BTC.' },
    { q: 'When do I lock escrow?', a: 'When a buyer opens a trade, you\'ll be prompted to lock the exact BTC amount into escrow before they pay.' },
  ],
  trade: [
    { q: 'How do I raise a dispute?', a: 'Open the trade in **My Trades** and tap **Raise Dispute**. A moderator will review within 24 hours.' },
    { q: 'Why is my trade stuck?', a: 'Check if payment has been sent/received. If the buyer hasn\'t paid yet, you can cancel after the time limit expires.' },
    { q: 'What happens if someone scams me?', a: 'Raise a dispute immediately. Our moderators review all evidence. Never release escrow without confirming payment.' },
  ],
  payment: [
    { q: 'Payment not showing up?', a: 'MoMo payments usually arrive within 5 min. Bank transfers can take up to 2 hours. Keep your receipt as proof.' },
    { q: 'Can I change payment method?', a: 'Only the payment method listed on the offer is valid. Sending via a different method may delay the trade.' },
    { q: 'What if I sent to the wrong number?', a: 'Contact your payment provider immediately. Let the seller know and attach the receipt to your ticket for evidence.' },
  ],
  account: [
    { q: 'Forgot your password?', a: 'Tap **Forgot Password** on the login page. A reset link will be sent to your email within a few minutes.' },
    { q: 'How do I verify my ID?', a: 'Go to **Settings → Verification** and upload your government ID. Verification unlocks higher trade limits.' },
    { q: 'Can I change my email/phone?', a: 'Go to **Settings** to update your profile info. You\'ll need to verify the new contact before it\'s saved.' },
  ],
  wallet: [
    { q: 'How do I deposit BTC?', a: 'Go to **Wallet** and tap **Deposit**. Copy your PRAQEN wallet address and send BTC from any external wallet.' },
    { q: 'How do I withdraw BTC?', a: 'Go to **Wallet** → **Withdraw**, enter an external BTC address and the amount. A small network fee applies.' },
    { q: 'Why is my balance locked?', a: 'Locked balance is BTC held in active trade escrow. It\'s released when the trade completes or is cancelled.' },
  ],
  kyc: [
    { q: 'What documents are accepted?', a: 'Government-issued ID (passport, driver\'s license, national ID). Upload clear photos in **Settings → Verification**.' },
    { q: 'How long does KYC review take?', a: 'Most verifications are reviewed within 24 hours. You\'ll get a notification once approved.' },
    { q: 'Is KYC required to trade?', a: 'Basic trading is available without KYC. Higher limits and certain payment methods require verification.' },
  ],
  other: [
    { q: 'How do I contact support?', a: 'You\'re in the right place! Create a ticket below and our team will get back to you **by email** within 24 hours.' },
    { q: 'Is my data secure?', a: 'Absolutely. All data is encrypted in transit and at rest. We never share your personal information.' },
    { q: 'Can I delete my account?', a: 'Create a ticket below and we\'ll help you close your account and withdraw any remaining balance.' },
  ],
};

// ── Priority options ─────────────────────────────────────────────────────────
const PRIORITIES = [
  { id: 'low',     label: 'Low',        desc: 'General question or minor issue',                     icon: Flag,       color: '#64748B', bg: '#F1F5F9' },
  { id: 'normal',  label: 'Normal',     desc: 'Standard support request',                            icon: AlertCircle, color: '#D97706', bg: '#FFFBEB' },
  { id: 'urgent',  label: 'Urgent',     desc: 'Funds stuck, suspected fraud, or critical issue',     icon: AlertOctagon, color: '#DC2626', bg: '#FEF2F2' },
];

// ── Response time estimates per priority ──────────────────────────────────────
const RESPONSE_TIMES = {
  low:    { eta: '~24–48 hours', color: '#64748B' },
  normal: { eta: '~12–24 hours', color: '#D97706' },
  urgent: { eta: '~2–4 hours',   color: '#DC2626' },
};

// ── FAQ keywords for urgent priority auto-detect ─────────────────────────────
const URGENT_KEYWORDS = ['stuck','scam','fraud','urgent','emergency','lost','stolen','dispute','locked out','hack','unauthor','missing fund','not paid','no show','ghost'];

// ── Support address shown to users for the email-only flow ───────────────────
const SUPPORT_EMAIL_ADDRESS = 'support@praqen.com';

// ── Markdown-lite renderer ────────────────────────────────────────────────────
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

// ── Typing dots (AI assistant) ────────────────────────────────────────────────
function Typing() {
  return (
    <div className="flex justify-start">
      <div className="w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0 mr-2 mt-0.5"
        style={{ background: 'linear-gradient(135deg,#1B4332,#2D6A4F)' }}>
        <Bot size={13} color="white" />
      </div>
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

// ═══════════════════════════════════════════════════════════════════════════════
export default function SuggestionsPanel({ user }) {
  const location = useLocation();
  const isTradeChatPage = location.pathname.startsWith('/trade/') || location.pathname.startsWith('/trade-chat/');
  const isAuthPage = ['/login', '/register', '/signup', '/forgot-password'].includes(location.pathname);
  // mode: 'home' | 'topic-selected' | 'ticket-form' | 'ticket-priority'
  //       | 'ticket-attachments' | 'ticket-review' | 'submitting'
  //       | 'ticket-created' | 'chat' | 'suggest'
  // mode: 'home' | 'ticket-form' | 'submitting' | 'ticket-created' | 'suggest'
  // Email-only ticket flow — there is intentionally NO in-app chat mode: per the
  // form-based spec, tickets are created via this form and ALL follow-up
  // communication happens strictly over email (user replies to the email thread;
  // agents reply from the Agent Dashboard, which sends an actual email).
  const [open, setOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 640);
  // Dashboard "Contact support" links open this panel.
  useEffect(() => {
    const h = () => { setMode('home'); setOpen(true); };
    window.addEventListener('praqen:open-support', h);
    return () => window.removeEventListener('praqen:open-support', h);
  }, []);
  useEffect(() => {
    const h = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);
  const [mode, setMode] = useState('home');
  const [topic, setTopic] = useState(null);

  // ── Ticket form state (single-step, email-only flow) ──────────────────────
  const [subject, setSubject]     = useState('');
  const [msgBody, setMsgBody]     = useState('');
  const [tradeRef, setTradeRef]   = useState('');
  const [ticketUsername, setTicketUsername] = useState('');
  const [ticketEmail, setTicketEmail] = useState('');
  const [priority, setPriority]   = useState('normal');
  const [submitting, setSubmitting] = useState(false);
  const [duplicateWarn, setDuplicateWarn] = useState(null);
  const [showDuplicateConfirm, setShowDuplicateConfirm] = useState(false);

  // ── Created ticket (confirmation screen) ──────────────────────────────────
  const [ticket, setTicket] = useState(null);
  const detailsRef = useRef(null);

  // ── Suggestion form ───────────────────────────────────────────────────────
  const [sugTitle, setSugTitle] = useState('');
  const [sugBody,  setSugBody]  = useState('');
  const [sugCat,   setSugCat]   = useState('feature');
  const [sugPosting, setSugPost]= useState(false);
  const [sugDone,  setSugDone]  = useState(false);

  // ── Department (routes the ticket to the right team — same set as the
  //    Agent Dashboard's department filter) ──────────────────────────────────
  const [selectedDepartment, setSelectedDepartment] = useState('general');
  const DEPARTMENTS = [
    { id: 'tech', label: 'Tech' },
    { id: 'billing', label: 'Billing' },
    { id: 'compliance', label: 'Compliance' },
    { id: 'general', label: 'General' },
  ];
  const isTicketContactValid = ticketUsername.trim().length > 0 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ticketEmail.trim());

  useEffect(() => {
    if (user) {
      setTicketUsername(user.username || '');
      setTicketEmail(user.email || '');
    } else {
      setTicketUsername('');
      setTicketEmail('');
    }
  }, [user]);

  // Lock body scroll on mobile when panel is open
  useEffect(() => {
    if (open && isMobile) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [open, isMobile]);

  // ── Auto-detect priority from message body ────────────────────────────────
  useEffect(() => {
    if (msgBody) {
      const q = msgBody.toLowerCase();
      const isUrgent = URGENT_KEYWORDS.some(kw => q.includes(kw));
      if (isUrgent) setPriority('urgent');
    }
  }, [msgBody]);

  // ── Navigation helpers ────────────────────────────────────────────────────
  const goHome = () => {
    setMode('home');
    setTopic(null);
    setTicket(null);
    setSubject(''); setMsgBody(''); setTradeRef('');
    setTicketUsername(user?.username || '');
    setTicketEmail(user?.email || '');
    setPriority('normal');
    setShowDuplicateConfirm(false);
    setDuplicateWarn(null);
  };

  const openPanel = () => {
    if (!open) setMode('home');
    setOpen(o => !o);
  };

  // Step 1: pick a topic (issue type) — goes straight into the single-step
  // ticket form. There is no live-chat / agent entry point anywhere in this
  // flow: tickets are created here and all follow-up happens over email.
  const pickTopic = (t) => {
    setTopic(t);
    setSubject(`Help with ${t.label}`);
    setMsgBody('');
    setTradeRef('');
    setPriority('normal');
    setShowDuplicateConfirm(false);
    setDuplicateWarn(null);
    setMode('ticket-form');
    setTimeout(() => detailsRef.current?.focus(), 150);
  };

  // ── Check for duplicate tickets ───────────────────────────────────────────
  const checkDuplicateTickets = async () => {
    try {
      const r = await axios.get(`${API_URL}/support/tickets`, {
        headers: authH(),
        timeout: 8000, // 8-second timeout — never hang indefinitely
      });
      const allTickets = r.data.tickets || [];
      const openOnes = allTickets.filter(t => t.status !== 'closed' && t.status !== 'resolved');

      // Check for subject/message keyword overlap
      const bodyWords = new Set(msgBody.toLowerCase().split(/\s+/).filter(w => w.length > 3));
      const similar = openOnes.filter(t => {
        const ticketWords = (t.subject + ' ' + (t.description || '')).toLowerCase();
        let overlap = 0;
        for (const w of bodyWords) { if (ticketWords.includes(w)) overlap++; }
        return overlap >= 2;
      });

      if (similar.length > 0) {
        setDuplicateWarn(similar[0]);
        return true; // has similar open ticket
      }
      return false;
    } catch {
      return false;
    }
  };

  // ── Submit ticket (form-based, email-only flow) ───────────────────────────
  const submitTicket = async () => {
    if (!user) return toast.info('Please log in to create a support ticket');
    if (submitting) return;
    if (!ticketUsername.trim()) {
      return toast.error('Username is required');
    }
    if (!ticketEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ticketEmail.trim())) {
      return toast.error('Please enter a valid email address');
    }
    if (!msgBody.trim() || msgBody.trim().length < 10) {
      return toast.error('Please describe your issue (at least 10 characters)');
    }
    setSubmitting(true);

    // Duplicate check with explicit loading state
    if (!showDuplicateConfirm) {
      const hasDuplicate = await checkDuplicateTickets();
      if (hasDuplicate) {
        setShowDuplicateConfirm(true);
        setSubmitting(false); // ← reset so button stays clickable
        return;
      }
    }

    setMode('submitting');

    try {
      const r = await axios.post(`${API_URL}/support/tickets`, {
        subject: subject.trim() || `Help with ${topic?.label || 'General'}`,
        category: topic?.cat || 'general',
        department: selectedDepartment || 'general',
        message: msgBody.trim(),
        username: ticketUsername.trim(),
        email: ticketEmail.trim(),
        priority,
        trade_reference: tradeRef?.trim() || undefined,
      }, { headers: authH() });

      const newTicket = r.data.ticket;
      setTicket(newTicket);
      setMode('ticket-created');
      setSubmitting(false);
    } catch (e) {
      setSubmitting(false);
      toast.error(e.response?.data?.error || 'Failed to create ticket. Please try again.');
    }
  };

  // ── Submit suggestion ─────────────────────────────────────────────────────
  const submitSuggestion = async () => {
    if (!sugTitle.trim()) return toast.error('Please enter a title');
    if (!user) return toast.info('Please log in to submit a suggestion');
    setSugPost(true);
    try {
      await axios.post(`${API_URL}/suggestions`, {
        title: sugTitle.trim(), body: sugBody.trim(), category: sugCat,
      }, { headers: authH() });
      setSugDone(true);
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to submit. Please try again.');
    } finally { setSugPost(false); }
  };

  // ── AI-assistant escalation → pre-filled EMAIL-ONLY ticket form ───────────
  // The old "Talk to a Human" created a live-chat ticket and dropped the user
  // into in-app chat. Per the email-only spec, it now pre-fills the ticket form
  // with the AI conversation transcript — the agent's response arrives by email.
  const escalateToTicketForm = (prefillSubject, prefillBody) => {
    setSubject(prefillSubject || 'Escalated from AI Chat');
    setMsgBody((prefillBody || '').slice(0, 2000));
    setTradeRef('');
    setPriority('normal');
    setShowDuplicateConfirm(false);
    setDuplicateWarn(null);
    setActiveTab('support');
    setTopic(TOPICS.find(t => t.id === 'other') || TOPICS[0]);
    setMode('ticket-form');
    setTimeout(() => detailsRef.current?.focus(), 150);
  };

  // Get FAQ articles for current topic
  const faqArticles = FAQ_BY_TOPIC[topic?.id] || FAQ_BY_TOPIC.other || [];

  // ── Standalone AI Chat (Tab 2) ────────────────────────────────────────────
  const [standaloneAiMsgs, setStandaloneAiMsgs] = useState([]);
  const [standaloneAiLoading, setStandaloneAiLoading] = useState(false);
  const [standaloneInput, setStandaloneInput] = useState('');
  const standaloneChatRef = useRef(null);
  const standaloneInputRef = useRef(null);
  const [activeTab, setActiveTab] = useState('support');

  // Scroll standalone AI chat to bottom
  useEffect(() => {
    if (standaloneChatRef.current) {
      standaloneChatRef.current.scrollTop = standaloneChatRef.current.scrollHeight;
    }
  }, [standaloneAiMsgs, standaloneAiLoading]);

  const fetchStandaloneAIResponse = async (message, history) => {
    const res = await fetch(`${API_URL}/ai-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authH() },
      body: JSON.stringify({
        message,
        mode: 'general',
        section: null,
        history,
        user: user ? { username: user.username, id: user.id } : null,
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return {
      reply: data.reply?.trim() || '',
      shouldEscalate: !!data.should_escalate,
      suggestedPriority: data.suggested_priority || 'normal',
    };
  };

  // ── Detect explicit human-agent requests ────────────────────────────────
  const HUMAN_AGENT_KEYWORDS = /\b(talk|speak|connect|chat)\s*(to|with|to a|with a)?\s*(human|agent|person|real person|someone|staff|support agent)\b|\bhuman agent\b|\breal person\b|\bcustomer service\b|\blive agent\b|\blive support\b/i;

  const handleStandaloneSend = async (prefilledMessage) => {
    const text = prefilledMessage || standaloneInput.trim();
    if (!text || standaloneAiLoading) return;

    const wantsHuman = HUMAN_AGENT_KEYWORDS.test(text);
    const userSeq = Date.now();
    setStandaloneAiMsgs(prev => [...prev, { role: 'user', text, _seq: userSeq }]);
    setStandaloneInput('');
    setStandaloneAiLoading(true);

    try {
      if (wantsHuman) {
        // Email-only policy: no live chat — steer to the ticket form, and the
        // agent's reply will arrive by email.
        const seq = userSeq + 1;
        setStandaloneAiMsgs(prev => [...prev, {
          role: 'ai', _seq: seq,
          text: "Support here works over **email** — no live chat needed. Our team will review your ticket and reply to your email address (usually within 24 hours). Tap **Create a support ticket** below and I'll pre-fill it with what you've told me so far.",
          isEscalateNotice: true,
        }]);
        setStandaloneAiLoading(false);
        return;
      }

      const history = standaloneAiMsgs.map(m => ({ role: m.role, text: m.text }));
      const { reply, shouldEscalate } = await fetchStandaloneAIResponse(text, history);
      const seq = userSeq + 1;
      setStandaloneAiMsgs(prev => [...prev, {
        role: 'ai', text: reply || 'Sorry, I could not process that. Please try again.', _seq: seq,
        shouldEscalate,
      }]);
    } catch {
      const seq = userSeq + 1;
      setStandaloneAiMsgs(prev => [...prev, {
        role: 'ai', _seq: seq,
        text: "I'm having trouble connecting right now. You can create a support ticket — our team replies by email.",
        isEscalateNotice: true,
      }]);
    } finally {
      setStandaloneAiLoading(false);
      setTimeout(() => standaloneInputRef.current?.focus(), 200);
    }
  };

  // ── Header config per mode ────────────────────────────────────────────────
  const TopicIcon = topic?.icon || MessageCircle;

  const headerCfg = {
    'home':              { title: 'PRAQEN Support',   sub: 'How can we help you today?', icon: <MessageCircle size={18} color="white" /> },
    'ticket-form':       { title: 'Create a Ticket',   sub: 'Our team replies to you by email', icon: <Ticket size={18} color="white" /> },
    'submitting':        { title: 'Submitting Your Ticket…', sub: 'Please wait while we process your request', icon: <RefreshCw size={18} color="white" /> },
    'ticket-created':    { title: 'Ticket Created!',   sub: `Ticket #${ticket?.id?.slice(0,8).toUpperCase() || '…'}`, icon: <CheckCircle size={18} color="white" /> },
    'suggest':           { title: 'Drop a Suggestion', sub: 'We read every single one', icon: <Lightbulb size={18} color="white" /> },
  };
  const hdr = headerCfg[mode] || headerCfg['home'];

  const canGoBack = mode === 'ticket-form' || mode === 'suggest';

  return (
    <>
      {/* ── Floating button — hidden on mobile when panel is open ── */}
      {!(open && isMobile) && !isTradeChatPage && (
        <button onClick={openPanel}
          className={`${isAuthPage ? 'absolute' : 'fixed'} flex items-center justify-center shadow-2xl transition-all hover:scale-110 active:scale-95`}
          style={{
            bottom: isAuthPage
              ? 20
              : isMobile
              ? 'calc(60px + env(safe-area-inset-bottom, 0px) + 14px)'
              : 24,
            right: isMobile ? 16 : 24,
            width: isMobile ? 54 : 58,
            height: isMobile ? 54 : 58,
            borderRadius: '50%',
            zIndex: 1002,
            background: 'linear-gradient(135deg,#1B4332,#2D6A4F)',
            border: '3px solid rgba(255,255,255,0.18)',
            boxShadow: '0 8px 32px rgba(27,67,50,0.45)',
            WebkitTapHighlightColor: 'transparent',
          }}>
          {open
            ? <X size={22} color="white" />
            : <MessageCircle size={24} color="white" fill="rgba(255,255,255,0.15)" />}
          {!open && (
            <span className="absolute w-full h-full rounded-full animate-ping"
              style={{ backgroundColor: 'rgba(45,106,79,0.35)' }} />
          )}
        </button>
      )}

      {/* ── Widget panel ── */}
      {open && (
        <>
          {/* Backdrop — mobile only */}
          {isMobile && (
            <div onClick={() => setOpen(false)}
              style={{
                position: 'fixed', inset: 0,
                zIndex: 1001,
                backgroundColor: 'rgba(0,0,0,0.55)',
              }} />
          )}
        <div className="fixed flex flex-col"
          style={isMobile ? {
            bottom: 0, left: 0, right: 0,
            height: '92dvh', maxHeight: '92dvh',
            borderRadius: '22px 22px 0 0',
            backgroundColor: '#fff',
            boxShadow: '0 -8px 40px rgba(0,0,0,0.22)',
            overflow: 'hidden',
            zIndex: 1002,
          } : {
            bottom: 96, right: 16,
            width: 'min(400px, calc(100vw - 32px))',
            height: 'min(600px, calc(100vh - 120px))',
            borderRadius: 22, backgroundColor: '#fff',
            boxShadow: '0 24px 64px rgba(0,0,0,0.22)',
            border: '1.5px solid #E2E8F0',
            overflow: 'hidden',
            zIndex: 1002,
          }}>

          {/* ── Header ── */}
          <div className="flex-shrink-0"
            style={{ background: 'linear-gradient(135deg,#1B4332,#2D6A4F)' }}>
            {isMobile && (
              <div className="flex justify-center pt-3 pb-1">
                <div style={{ width: 38, height: 4, borderRadius: 99, backgroundColor: 'rgba(255,255,255,0.3)' }} />
              </div>
            )}
            <div className="flex items-center gap-3 px-4 py-3" style={{ minHeight: isMobile ? 60 : 56 }}>
              {canGoBack && (
                <button onClick={goHome}
                  style={{
                    width: isMobile ? 40 : 32, height: isMobile ? 40 : 32,
                    borderRadius: 12, border: 'none', background: 'rgba(255,255,255,0.15)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', flexShrink: 0, color: 'rgba(255,255,255,0.9)',
                    WebkitTapHighlightColor: 'transparent',
                  }}>
                  <ChevronLeft size={isMobile ? 22 : 18} color="white" />
                </button>
              )}

              <div style={{
                width: isMobile ? 40 : 36, height: isMobile ? 40 : 36,
                borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.15)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                {mode === 'submitting'
                  ? <RefreshCw size={isMobile ? 18 : 15} color="white" className="animate-spin" />
                  : hdr.icon}
              </div>

              <div className="flex-1 min-w-0">
                <p style={{ fontWeight: 900, fontSize: isMobile ? 16 : 14, color: '#fff', lineHeight: 1, margin: 0 }}
                  className="truncate">{hdr.title}</p>
                <p className="truncate"
                  style={{ fontSize: isMobile ? 12 : 11, marginTop: 3, color: 'rgba(255,255,255,0.7)', margin: '3px 0 0' }}>
                  {hdr.sub}
                </p>
              </div>

              <button onClick={() => setOpen(false)}
                style={{
                  width: isMobile ? 40 : 32, height: isMobile ? 40 : 32,
                  borderRadius: 12, border: 'none', background: 'rgba(255,255,255,0.15)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', flexShrink: 0,
                  WebkitTapHighlightColor: 'transparent',
                }}>
                <X size={isMobile ? 18 : 15} color="white" />
              </button>
            </div>
          </div>

          {/* ── Tab Switcher (only at top-level home) ── */}
          {mode === 'home' && (
            <div className="flex-shrink-0 px-4 py-2 border-b" style={{ borderColor: '#F1F5F9', backgroundColor: '#FAFAFA' }}>
              <div className="flex rounded-xl overflow-hidden" style={{ backgroundColor: '#E2E8F0', padding: 2 }}>
                <button onClick={() => setActiveTab('support')}
                  className="flex-1 py-1.5 px-3 text-xs font-black rounded-lg transition-all duration-200"
                  style={{
                    backgroundColor: activeTab === 'support' ? '#1B4332' : 'transparent',
                    color: activeTab === 'support' ? '#fff' : '#64748B',
                  }}>
                  <Ticket size={12} className="inline mr-1.5" style={{ verticalAlign: -1 }} />
                  Support Tickets
                </button>
                <button onClick={() => setActiveTab('ai-chat')}
                  className="flex-1 py-1.5 px-3 text-xs font-black rounded-lg transition-all duration-200"
                  style={{
                    backgroundColor: activeTab === 'ai-chat' ? '#1B4332' : 'transparent',
                    color: activeTab === 'ai-chat' ? '#fff' : '#64748B',
                  }}>
                  <Bot size={12} className="inline mr-1.5" style={{ verticalAlign: -1 }} />
                  AI Chat
                </button>
              </div>
            </div>
          )}

          {/* ════════════ HOME (Support Tickets) ════════════ */}
          {mode === 'home' && activeTab !== 'ai-chat' && (
            <div className="flex-1 overflow-y-auto" style={{ backgroundColor: '#F8FAFC' }}>
              {/* Welcome banner */}
              <div className="px-4 pt-4 pb-3">
                <div className="flex items-center gap-3 p-3 rounded-2xl"
                  style={{ background: 'linear-gradient(135deg,#1B4332,#2D6A4F)' }}>
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}>
                    {user?.avatar_url
                      ? <img src={user.avatar_url} alt="" className="w-10 h-10 rounded-xl object-cover" />
                      : <User size={18} color="white" />}
                  </div>
                  <div>
                    <p className="text-sm font-black text-white leading-none flex items-center gap-1.5">
                      Hi{user ? `, ${user.username || user.full_name}` : ' there'}!
                      <Hand size={14} color="white" style={{ opacity: 0.85 }} />
                    </p>
                    <p className="text-[11px] mt-0.5" style={{ color: 'rgba(255,255,255,0.65)' }}>
                      What do you need help with today?
                    </p>
                  </div>
                </div>
              </div>

              {/* Topic grid — this IS the issue-type selector for the form */}
              <div className="px-4 pb-3">
                <p style={{ fontSize: 11, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10, color: '#94A3B8' }}>
                  Choose an issue type
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: isMobile ? 10 : 8 }}>
                  {TOPICS.map(t => (
                    <button key={t.id} onClick={() => pickTopic(t)}
                      style={{
                        display: 'flex', flexDirection: 'column', gap: 6,
                        padding: isMobile ? '14px 12px' : '12px',
                        borderRadius: 16, textAlign: 'left', cursor: 'pointer',
                        backgroundColor: '#fff', border: `1.5px solid ${t.color}25`,
                        WebkitTapHighlightColor: 'transparent', transition: 'box-shadow 0.15s',
                        minHeight: isMobile ? 90 : 80,
                      }}>
                      <div style={{
                        width: isMobile ? 32 : 28, height: isMobile ? 32 : 28,
                        borderRadius: 10, backgroundColor: t.bg,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <t.icon size={isMobile ? 17 : 15} color={t.color} strokeWidth={2.25} />
                      </div>
                      <span style={{ fontSize: isMobile ? 13 : 12, fontWeight: 900, lineHeight: 1.2, color: t.color }}>{t.label}</span>
                      <span style={{ fontSize: isMobile ? 11 : 10, lineHeight: 1.4, color: '#94A3B8' }}>{t.hint}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Divider */}
              <div className="mx-4 border-t mb-3" style={{ borderColor: '#F1F5F9' }} />

              {/* Drop suggestion */}
              <div className="px-4 pb-4">
                <button onClick={() => { setMode('suggest'); setSugTitle(''); setSugBody(''); setSugCat('feature'); setSugDone(false); }}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-left transition hover:shadow-md hover:-translate-y-0.5"
                  style={{ backgroundColor: '#fff', border: '1.5px solid #FDE68A' }}>
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: 'linear-gradient(135deg,#D97706,#F59E0B)' }}>
                    <Lightbulb size={16} color="white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-black" style={{ color: '#92400E' }}>Drop a Suggestion</p>
                    <p className="text-[10px]" style={{ color: '#94A3B8' }}>Share ideas · Our team reads them all</p>
                  </div>
                  <ArrowRight size={14} color="#D97706" />
                </button>
              </div>

              {/* Trust badges */}
              <div className="mx-4 mb-4 flex gap-2">
                {[
                  { icon: <Shield size={11} color="#1B4332" />, text: 'Secure & Private' },
                  { icon: <Clock size={11} color="#1B4332" />, text: 'Fast Response' },
                  { icon: <Mail size={11} color="#1B4332" />, text: 'Replies by Email' },
                ].map(b => (
                  <div key={b.text} className="flex-1 flex flex-col items-center gap-1 py-2 rounded-xl"
                    style={{ backgroundColor: '#F0FDF4' }}>
                    {b.icon}
                    <span className="text-[9px] font-bold text-center leading-tight" style={{ color: '#1B4332' }}>{b.text}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ════════════ AI CHAT (Tab 2) ════════════ */}
          {mode === 'home' && activeTab === 'ai-chat' && (
            <div className="flex-1 flex flex-col overflow-hidden" style={{ backgroundColor: '#F8FAFC' }}>
              {/* Email-only support notice */}
              <div className="flex-shrink-0 px-4 pt-3 pb-1">
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl"
                  style={{ backgroundColor: '#EFF6FF', border: '1.5px solid #BFDBFE' }}>
                  <Mail size={13} color="#2563EB" className="flex-shrink-0" />
                  <p className="text-[10px] font-bold" style={{ color: '#1E40AF' }}>
                    Support is email-only — create a ticket and our team replies to your email.
                  </p>
                </div>
              </div>

              {/* Messages */}
              <div ref={standaloneChatRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
                {standaloneAiMsgs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-4">
                    <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
                      style={{ background: 'linear-gradient(135deg,#1B4332,#2D6A4F)' }}>
                      <Bot size={28} color="white" />
                    </div>
                    <div>
                      <p className="text-sm font-black" style={{ color: '#1E293B' }}>PRAQEN AI Assistant</p>
                      <p className="text-xs mt-1" style={{ color: '#64748B' }}>Ask me anything about buying, selling, your wallet, or using PRAQEN!</p>
                    </div>
                    <div className="flex flex-wrap gap-2 justify-center mt-2">
                      {['How do I buy Bitcoin?', 'How does escrow work?', 'Reset my password', 'KYC verification'].map(s => (
                        <button key={s} onClick={() => !standaloneAiLoading && handleStandaloneSend(s)}
                          className="px-3 py-2 rounded-xl text-xs font-bold transition hover:opacity-80"
                          style={{ backgroundColor: '#fff', border: '1.5px solid #E2E8F0', color: '#334155' }}>
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  standaloneAiMsgs.map((m, i) => (
                    <div key={m._seq || i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      {m.role !== 'user' && (
                        <div className="w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0 mr-2 mt-0.5"
                          style={{ background: 'linear-gradient(135deg,#1B4332,#2D6A4F)' }}>
                          <Bot size={12} color="white" />
                        </div>
                      )}
                      <div className={m.role === 'user' ? '' : 'max-w-[80%]'}>
                        <div className="px-3 py-2.5 text-sm leading-relaxed"
                          style={{
                            backgroundColor: m.role === 'user' ? '#1B4332' : '#fff',
                            color: m.role === 'user' ? 'white' : '#1E293B',
                            borderRadius: m.role === 'user' ? '18px 18px 4px 18px' : '4px 18px 18px 18px',
                            boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
                          }}>
                          <Msg text={m.text} />
                        </div>
                        {/* Email-only escalation CTA — pre-fills the ticket form */}
                        {m.role === 'ai' && m.isEscalateNotice && !standaloneAiLoading && (
                          <div className="mt-1.5 px-1">
                            <button
                              onClick={() => {
                                const transcript = standaloneAiMsgs
                                  .map(am => `${am.role === 'user' ? 'User' : 'AI'}: ${am.text}`)
                                  .join('\n');
                                escalateToTicketForm('Escalated from AI Chat', transcript);
                              }}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold transition hover:opacity-80"
                              style={{ backgroundColor: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626' }}>
                              <Ticket size={11} />
                              Create a support ticket
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
                {standaloneAiLoading && <Typing />}
              </div>

              {/* Input bar */}
              <div className="flex-shrink-0 px-4 py-3 border-t" style={{ borderColor: '#F1F5F9', backgroundColor: '#fff' }}>
                <div className="flex items-center gap-2">
                  <input ref={standaloneInputRef}
                    value={standaloneInput}
                    onChange={e => setStandaloneInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleStandaloneSend(); }}}
                    placeholder="Ask me anything…"
                    className="flex-1 px-4 py-2.5 rounded-xl border-2 outline-none text-sm"
                    style={{ borderColor: standaloneInput ? '#1B4332' : '#E2E8F0', fontFamily: 'inherit' }}
                    disabled={standaloneAiLoading} />
                  <button onClick={handleStandaloneSend} disabled={!standaloneInput.trim() || standaloneAiLoading}
                    className="w-10 h-10 rounded-xl flex items-center justify-center transition flex-shrink-0"
                    style={{
                      background: standaloneInput.trim() && !standaloneAiLoading
                        ? 'linear-gradient(135deg,#1B4332,#2D6A4F)' : '#E2E8F0',
                    }}>
                    {standaloneAiLoading
                      ? <RefreshCw size={16} color="white" className="animate-spin" />
                      : <Send size={16} color={standaloneInput.trim() ? 'white' : '#94A3B8'} />}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ════════════ TICKET FORM (single step, email-only) ════════════ */}
          {mode === 'ticket-form' && (
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4" style={{ backgroundColor: '#F8FAFC' }}>

              {/* Self-serve FAQ (collapsible deflection) */}
              {faqArticles.length > 0 && (
                <details className="rounded-xl overflow-hidden"
                  style={{ backgroundColor: '#fff', border: '1.5px solid #E2E8F0' }}>
                  <summary className="px-4 py-3 text-xs font-bold cursor-pointer"
                    style={{ color: '#334155', listStyle: 'none', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Lightbulb size={13} color="#D97706" />
                    Quick answers for {topic?.label?.toLowerCase()} first
                  </summary>
                  <div className="px-4 pb-3 pt-1 border-t space-y-2" style={{ borderColor: '#F1F5F9' }}>
                    {faqArticles.map((faq, i) => (
                      <details key={i} className="rounded-lg" style={{ backgroundColor: '#F8FAFC' }}>
                        <summary className="px-3 py-2 text-[11px] font-bold cursor-pointer" style={{ color: '#334155', listStyle: 'none' }}>
                          <span style={{ color: topic?.color || '#1B4332', fontSize: 14 }}>?</span> {faq.q}
                        </summary>
                        <p className="px-3 pb-2 text-[11px] leading-relaxed" style={{ color: '#64748B' }}>
                          <Msg text={faq.a} />
                        </p>
                      </details>
                    ))}
                  </div>
                </details>
              )}

              {/* Issue type (topic) badge */}
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl"
                style={{ backgroundColor: topic?.bg || '#F0FDF4', border: `1.5px solid ${topic?.color || '#1B4332'}20` }}>
                <TopicIcon size={15} color={topic?.color} strokeWidth={2.25} />
                <p className="text-xs font-black" style={{ color: topic?.color }}>{topic?.label}</p>
                <button onClick={goHome} className="ml-auto text-[10px] font-bold" style={{ color: '#94A3B8' }}>
                  change
                </button>
              </div>

              {/* Subject */}
              <div>
                <label className="text-[11px] font-black uppercase tracking-wider block mb-1.5" style={{ color: '#64748B' }}>
                  Subject
                </label>
                <input value={subject} onChange={e => setSubject(e.target.value)}
                  placeholder={`Help with ${topic?.label || 'my issue'}…`}
                  className="w-full px-3 py-2.5 rounded-xl border-2 focus:outline-none transition"
                  style={{ borderColor: subject ? '#1B4332' : '#E2E8F0', backgroundColor: '#fff', fontSize: 16, fontFamily: 'inherit' }} />
              </div>

              {/* Username */}
              <div>
                <label className="text-[11px] font-black uppercase tracking-wider block mb-1.5" style={{ color: '#64748B' }}>
                  Username <span style={{ color: '#DC2626' }}>*</span>
                </label>
                <input value={ticketUsername} onChange={e => setTicketUsername(e.target.value)}
                  placeholder="Your username"
                  className="w-full px-3 py-2.5 rounded-xl border-2 focus:outline-none transition"
                  style={{ borderColor: ticketUsername ? '#1B4332' : '#E2E8F0', backgroundColor: '#fff', fontSize: 16, fontFamily: 'inherit' }} />
              </div>

              {/* Email */}
              <div>
                <label className="text-[11px] font-black uppercase tracking-wider block mb-1.5" style={{ color: '#64748B' }}>
                  Email <span style={{ color: '#DC2626' }}>*</span>
                </label>
                <input type="email" value={ticketEmail} onChange={e => setTicketEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="w-full px-3 py-2.5 rounded-xl border-2 focus:outline-none transition"
                  style={{ borderColor: ticketEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ticketEmail) ? '#1B4332' : '#E2E8F0', backgroundColor: '#fff', fontSize: 16, fontFamily: 'inherit' }} />
              </div>

              {/* Description */}
              <div>
                <label className="text-[11px] font-black uppercase tracking-wider block mb-1.5" style={{ color: '#64748B' }}>
                  Describe your issue <span style={{ color: '#DC2626' }}>*</span>
                </label>
                <textarea ref={detailsRef} value={msgBody} onChange={e => setMsgBody(e.target.value)}
                  placeholder={`Tell us exactly what's happening with your ${topic?.label?.toLowerCase() || 'issue'}. Include trade IDs, amounts, or any relevant details…`}
                  rows={isMobile ? 4 : 5}
                  className="w-full px-3 py-2.5 rounded-xl border-2 focus:outline-none resize-none transition"
                  style={{ borderColor: msgBody ? '#1B4332' : '#E2E8F0', backgroundColor: '#fff', fontSize: 16, fontFamily: 'inherit' }} />

                {/* Live character count + minimum length nudge */}
                <div className="flex items-center justify-between mt-1.5">
                  <div className="flex items-center gap-1">
                    {msgBody.trim().length > 0 && msgBody.trim().length < 10 && (
                      <span className="flex items-center gap-1 text-[10px] font-bold" style={{ color: '#F59E0B' }}>
                        <AlertTriangle size={10} /> Add a bit more detail
                      </span>
                    )}
                    {msgBody.trim().length >= 10 && (
                      <span className="flex items-center gap-1 text-[10px] font-bold" style={{ color: '#1B4332' }}>
                        <Check size={10} strokeWidth={3} /> Good detail
                      </span>
                    )}
                  </div>
                  <span className="text-[10px]" style={{ color: msgBody.length > 10 ? '#1B4332' : '#94A3B8' }}>
                    {msgBody.length} char
                  </span>
                </div>
              </div>

              {/* Trade reference — shown for trade/payment topics */}
              {(topic?.cat === 'trade' || topic?.cat === 'payment') && (
                <div>
                  <label className="text-[11px] font-black uppercase tracking-wider block mb-1.5" style={{ color: '#64748B' }}>
                    Trade / Reference ID <span style={{ color: '#94A3B8' }}>(optional)</span>
                  </label>
                  <input value={tradeRef} onChange={e => setTradeRef(e.target.value)}
                    placeholder="e.g. TRADE-ABC123 or your payment reference…"
                    className="w-full px-3 py-2.5 rounded-xl border-2 focus:outline-none transition"
                    style={{ borderColor: tradeRef ? '#1B4332' : '#E2E8F0', backgroundColor: '#fff', fontSize: 16, fontFamily: 'inherit' }} />
                  <p className="text-[10px] mt-1" style={{ color: '#94A3B8' }}>
                    This helps us find your case faster
                  </p>
                </div>
              )}

              {/* Department routing — same categories as the Agent Dashboard filters */}
              <div>
                <label className="text-[11px] font-black uppercase tracking-wider block mb-1.5" style={{ color: '#64748B' }}>
                  Route to team
                </label>
                <div className="flex gap-1.5 flex-wrap">
                  {DEPARTMENTS.map(d => (
                    <button key={d.id} onClick={() => setSelectedDepartment(d.id)}
                      className="px-3 py-1.5 rounded-lg text-[10px] font-bold transition flex-shrink-0"
                      style={{
                        backgroundColor: selectedDepartment === d.id ? '#1B4332' : '#fff',
                        color: selectedDepartment === d.id ? '#fff' : '#64748B',
                        border: `1px solid ${selectedDepartment === d.id ? '#1B4332' : '#E2E8F0'}`,
                      }}>
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Urgent auto-detect notice */}
              {priority === 'urgent' && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl"
                  style={{ backgroundColor: '#FEF2F2', border: '1.5px solid #FECACA' }}>
                  <AlertOctagon size={14} color="#DC2626" />
                  <p className="text-[10px] font-bold" style={{ color: '#DC2626' }}>
                    We detected keywords suggesting this may be urgent — we've pre-selected Urgent for you.
                  </p>
                </div>
              )}

              {/* Priority selector (compact, inline) */}
              <div>
                <label className="text-[11px] font-black uppercase tracking-wider block mb-1.5" style={{ color: '#64748B' }}>
                  How urgent is your issue?
                </label>
                <div className="flex gap-2">
                  {PRIORITIES.map(p => {
                    const PrioIcon = p.icon;
                    const isSelected = priority === p.id;
                    return (
                      <button key={p.id} onClick={() => setPriority(p.id)}
                        className="flex-1 flex flex-col items-center gap-1 py-2.5 rounded-xl transition-all"
                        style={{
                          backgroundColor: isSelected ? p.bg : '#fff',
                          border: `2px solid ${isSelected ? p.color : '#E2E8F0'}`,
                        }}>
                        <PrioIcon size={15} color={isSelected ? p.color : '#94A3B8'} />
                        <span className="text-[10px] font-black" style={{ color: isSelected ? p.color : '#64748B' }}>{p.label}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="flex items-center gap-1.5 mt-1.5 justify-center">
                  <Clock size={11} color={RESPONSE_TIMES[priority]?.color || '#64748B'} />
                  <p className="text-[10px]" style={{ color: '#64748B' }}>
                    Estimated email response:{' '}
                    <span className="font-bold" style={{ color: RESPONSE_TIMES[priority]?.color || '#64748B' }}>
                      {RESPONSE_TIMES[priority]?.eta || '~24 hours'}
                    </span>
                  </p>
                </div>
              </div>

              {/* Duplicate ticket warning */}
              {showDuplicateConfirm && duplicateWarn && (
                <div className="p-3 rounded-xl space-y-2"
                  style={{ backgroundColor: '#FFFBEB', border: '1.5px solid #FDE68A' }}>
                  <div className="flex items-start gap-2">
                    <AlertTriangle size={14} color="#D97706" className="flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-[11px] font-bold" style={{ color: '#92400E' }}>
                        You have an open ticket about a similar issue
                      </p>
                      <p className="text-[10px] mt-0.5" style={{ color: '#A16207' }}>
                        Ticket #{duplicateWarn.id?.slice(0, 8).toUpperCase()}: "{duplicateWarn.subject}"
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button onClick={() => { setShowDuplicateConfirm(false); setDuplicateWarn(null); }}
                      className="flex-1 py-2 rounded-lg text-[10px] font-bold"
                      style={{ backgroundColor: '#fff', border: '1.5px solid #E2E8F0', color: '#64748B' }}>
                      Cancel
                    </button>
                    <button onClick={submitTicket}
                      className="flex-1 py-2 rounded-lg text-[10px] font-bold text-white"
                      style={{ backgroundColor: '#D97706' }}>
                      Submit Anyway
                    </button>
                  </div>
                </div>
              )}

              {/* Submit */}
              <button onClick={submitTicket} disabled={!user || submitting || !isTicketContactValid || !msgBody.trim() || msgBody.trim().length < 10}
                className="w-full py-3.5 rounded-xl font-black text-sm text-white flex items-center justify-center gap-2 transition hover:opacity-90 disabled:opacity-40"
                style={{ background: 'linear-gradient(135deg,#1B4332,#2D6A4F)' }}>
                {submitting
                  ? <><RefreshCw size={16} className="animate-spin" /> Creating Ticket…</>
                  : <><Ticket size={16} /> Create Ticket</>}
              </button>

              {!user && (
                <p className="text-[11px] text-center font-bold" style={{ color: '#DC2626' }}>
                  You need to be logged in to create a support ticket.
                </p>
              )}

              <p className="text-[10px] text-center" style={{ color: '#CBD5E1' }}>
                We'll never share your information
              </p>
            </div>
          )}

          {/* ════════════ SUBMITTING TRANSITION ════════════ */}
          {mode === 'submitting' && (
            <div className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-4"
              style={{ backgroundColor: '#F8FAFC' }}>

              {/* Spinner */}
              <div className="relative">
                <div className="w-20 h-20 rounded-full flex items-center justify-center"
                  style={{ background: 'linear-gradient(135deg,#D1FAE5,#A7F3D0)' }}>
                  <RefreshCw size={36} color="#1B4332" className="animate-spin" />
                </div>
              </div>

              <div>
                <p className="text-base font-black" style={{ color: '#1B4332' }}>
                  Submitting Your Ticket
                </p>
                <p className="text-[11px] mt-1" style={{ color: '#64748B' }}>
                  Securely sending your request to our support team…
                </p>
              </div>

              {/* Progress bar */}
              <div className="w-full max-w-[200px] h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: '#E2E8F0' }}>
                <div className="h-full rounded-full"
                  style={{
                    width: '100%',
                    background: 'linear-gradient(90deg, #1B4332, #2D6A4F, #40916C, #2D6A4F, #1B4332)',
                    backgroundSize: '200% 100%',
                    animation: 'shimmer 1.2s ease infinite',
                  }} />
              </div>

              <style>{`@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>

              <div className="space-y-1.5">
                {[
                  { text: 'Creating ticket and unique ID', done: true },
                  { text: priority === 'urgent' ? 'Flagging as urgent priority' : 'Categorizing your request', done: true },
                  { text: 'Queueing for the support team', done: false },
                ].map((s, i) => (
                  <div key={i} className="flex items-center gap-2 text-left">
                    <div style={{
                      width: 16, height: 16, borderRadius: '50%',
                      backgroundColor: s.done ? '#D1FAE5' : '#F1F5F9',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>
                      {s.done ? <Check size={9} color="#1B4332" strokeWidth={3} /> : <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#CBD5E1' }} />}
                    </div>
                    <p className="text-[10px]" style={{ color: s.done ? '#1B4332' : '#94A3B8' }}>{s.text}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ════════════ TICKET CREATED SUCCESS (email-only) ════════════ */}
          {mode === 'ticket-created' && (
            <div className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-4"
              style={{ backgroundColor: '#F8FAFC' }}>

              {/* Big check */}
              <div className="w-20 h-20 rounded-full flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg,#D1FAE5,#A7F3D0)' }}>
                <CheckCircle size={40} color="#1B4332" />
              </div>

              <div>
                <p className="text-lg font-black flex items-center justify-center gap-1.5" style={{ color: '#1B4332' }}>
                  Ticket Created!
                  <Smile size={18} color="#1B4332" />
                </p>
                <p className="text-[12px] mt-1" style={{ color: '#64748B' }}>
                  Your support request has been submitted
                </p>
              </div>

              {/* Ticket ID badge */}
              <div className="px-6 py-3 rounded-2xl w-full"
                style={{ backgroundColor: '#fff', border: '2px solid #1B4332' }}>
                <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: '#94A3B8' }}>
                  Your Ticket Number
                </p>
                <p className="text-xl font-black tracking-widest" style={{ color: '#1B4332' }}>
                  #{ticket?.id?.slice(0, 8).toUpperCase() || '…'}
                </p>
                <p className="text-[10px] mt-1" style={{ color: '#94A3B8' }}>
                  Save this number to follow up on your request
                </p>
              </div>

              {/* Status info — email-only next steps */}
              <div className="w-full space-y-2">
                {[
                  { icon: CheckCircle, color: '#1B4332', text: 'Ticket submitted to our support team' },
                  { icon: Mail,        color: '#2563EB', text: `Your ticket is now visible in the dashboard and will be reviewed by our team` },
                  { icon: Mail,        color: '#D97706', text: 'The first email you receive will be our agent reply, sent to the email address you entered' },
                ].map(s => (
                  <div key={s.text} className="flex items-center gap-2 px-3 py-2 rounded-xl text-left"
                    style={{ backgroundColor: '#fff', border: '1.5px solid #E2E8F0' }}>
                    <s.icon size={15} color={s.color} className="flex-shrink-0" />
                    <p className="text-[11px]" style={{ color: '#475569' }}>{s.text}</p>
                  </div>
                ))}
              </div>

              {/* Priority badge */}
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold px-3 py-1 rounded-full flex items-center gap-1"
                  style={{
                    backgroundColor: PRIORITIES.find(p => p.id === priority)?.bg || '#F1F5F9',
                    color: PRIORITIES.find(p => p.id === priority)?.color || '#64748B',
                  }}>
                  {(() => {
                    const PrioIcon = PRIORITIES.find(p => p.id === priority)?.icon || Flag;
                    return <PrioIcon size={11} />;
                  })()}
                  {PRIORITIES.find(p => p.id === priority)?.label || 'Normal'} priority
                </span>
              </div>

              <button onClick={goHome} className="text-[11px] font-bold flex items-center gap-1" style={{ color: '#94A3B8' }}>
                <ChevronLeft size={12} /> Back to home
              </button>
            </div>
          )}

          {/* ════════════ SUGGESTION FORM ════════════ */}
          {mode === 'suggest' && (
            <div className="flex-1 overflow-y-auto px-4 py-4" style={{ backgroundColor: '#F8FAFC' }}>
              {sugDone ? (
                <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-2">
                  <div className="w-16 h-16 rounded-full flex items-center justify-center"
                    style={{ background: 'linear-gradient(135deg,#D97706,#F59E0B)' }}>
                    <CheckCircle size={32} color="white" />
                  </div>
                  <div>
                    <p className="font-black text-base flex items-center justify-center gap-1.5" style={{ color: '#92400E' }}>
                      Thank you!
                      <Smile size={16} color="#92400E" />
                    </p>
                    <p className="text-sm mt-1 leading-relaxed" style={{ color: '#64748B' }}>
                      Your suggestion is sent to the PRAQEN team. We read every single one!
                    </p>
                  </div>
                  <button onClick={() => { setSugTitle(''); setSugBody(''); setSugCat('feature'); setSugDone(false); }}
                    className="px-5 py-2.5 rounded-xl font-black text-sm text-white transition hover:opacity-90"
                    style={{ background: 'linear-gradient(135deg,#D97706,#F59E0B)' }}>
                    Send Another
                  </button>
                  <button onClick={goHome} className="text-sm font-bold flex items-center gap-1" style={{ color: '#94A3B8' }}>
                    <ChevronLeft size={13} /> Back
                  </button>
                </div>
              ) : !user ? (
                <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-4">
                  <Lightbulb size={40} style={{ color: '#94A3B8' }} />
                  <p className="font-black text-sm" style={{ color: '#334155' }}>Login required</p>
                  <p className="text-xs" style={{ color: '#64748B' }}>Please log in to submit a suggestion.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex flex-wrap gap-1.5">
                    {SUG_CATS.map(c => (
                      <button key={c.id} onClick={() => setSugCat(c.id)}
                        className="px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5"
                        style={{
                          backgroundColor: sugCat === c.id ? '#D97706' : '#fff',
                          color: sugCat === c.id ? 'white' : '#475569',
                          border: `1.5px solid ${sugCat === c.id ? '#D97706' : '#E2E8F0'}`,
                        }}>
                        <c.icon size={13} strokeWidth={2.25} />
                        {c.label}
                      </button>
                    ))}
                  </div>
                  <div>
                    <label className="text-[11px] font-black uppercase tracking-wider block mb-1.5" style={{ color: '#64748B' }}>
                      Title *
                    </label>
                    <input value={sugTitle} onChange={e => setSugTitle(e.target.value)}
                      placeholder="Give your idea a short title…"
                      className="w-full px-3 py-2.5 rounded-xl text-sm border-2 focus:outline-none transition"
                      style={{ borderColor: sugTitle ? '#D97706' : '#E2E8F0', backgroundColor: '#fff' }} />
                  </div>
                  <div>
                    <label className="text-[11px] font-black uppercase tracking-wider block mb-1.5" style={{ color: '#64748B' }}>
                      Details (optional)
                    </label>
                    <textarea value={sugBody} onChange={e => setSugBody(e.target.value)}
                      placeholder="Describe your idea…" rows={4}
                      className="w-full px-3 py-2.5 rounded-xl text-sm border-2 focus:outline-none resize-none transition"
                      style={{ borderColor: sugBody ? '#D97706' : '#E2E8F0', backgroundColor: '#fff' }} />
                  </div>
                  <button onClick={submitSuggestion} disabled={sugPosting || !sugTitle.trim()}
                    className="w-full py-3 rounded-xl font-black text-sm text-white flex items-center justify-center gap-2 transition hover:opacity-90 disabled:opacity-50"
                    style={{ background: 'linear-gradient(135deg,#D97706,#F59E0B)' }}>
                    {sugPosting ? <><RefreshCw size={14} className="animate-spin" />Sending…</> : <><Send size={14} />Send Suggestion</>}
                  </button>
                </div>
              )}
            </div>
          )}

        </div>
        </>
      )}
    </>
  );
}
