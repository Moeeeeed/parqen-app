import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'react-toastify';
import {
  MessageCircle, X, Send, RefreshCw, ChevronLeft,
  Lightbulb, CheckCircle, User, Bot, Headphones,
  Ticket, ArrowRight, Shield, Clock,
  Coins, Banknote, ArrowLeftRight, CreditCard, Settings,
  Wallet, BadgeCheck, HelpCircle, Zap, TrendingUp, Bug,
  Hand, Smile, Check, Search, Tag,
  Paperclip, FileText, AlertTriangle, Star, Upload, Trash2,
  Flag, AlertCircle, AlertOctagon, Image, Lock,
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
    { q: 'How do I contact support?', a: 'You\'re in the right place! Create a ticket below and our team will get back to you within 24 hours.' },
    { q: 'Is my data secure?', a: 'Absolutely. All data is encrypted in transit and at rest. We never share your personal information.' },
    { q: 'Can I delete my account?', a: 'Contact support and we\'ll help you close your account and withdraw any remaining balance.' },
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

// ── Markdown-lite renderer ────────────────────────────────────────────────────
function Msg({ text }) {
  return (
    <>
      {text.split('\n').map((line, i, arr) => {
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

// ── Typing dots ───────────────────────────────────────────────────────────────
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

// ── Step indicator ────────────────────────────────────────────────────────────
function StepBar({ step, total, labels }) {
  const showLabels = total <= 5;
  return (
    <div className="flex flex-col items-center gap-1.5 py-2 px-4">
      <div className="flex items-center gap-1.5 w-full justify-center">
        {Array.from({ length: total }).map((_, i) => (
          <div key={i} className="flex items-center gap-0" style={{ flex: i === step - 1 && showLabels ? 1 : 0 }}>
            <div
              className="rounded-full transition-all duration-300 flex-shrink-0"
              style={{
                height: 5,
                width: i + 1 === step ? 24 : i + 1 < step ? 10 : 8,
                backgroundColor: i + 1 <= step ? '#1B4332' : '#E2E8F0',
                opacity: i + 1 < step ? 0.5 : 1,
              }} />
            {i < total - 1 && (
              <div style={{
                height: 2, flex: 1, minWidth: 6,
                backgroundColor: i + 1 < step ? '#1B4332' : '#E2E8F0',
                opacity: i + 1 < step ? 0.3 : 1,
                borderRadius: 1,
              }} />
            )}
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between w-full max-w-[300px]">
        <span className="text-[9px] font-bold" style={{ color: '#94A3B8' }}>
          Step {step} of {total}
        </span>
        {labels && labels[step - 1] && (
          <span className="text-[9px] font-bold" style={{ color: '#1B4332' }}>
            {labels[step - 1]}
          </span>
        )}
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
  const [open, setOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 640);
  useEffect(() => {
    const h = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);
  const [mode, setMode] = useState('home');
  const [topic, setTopic] = useState(null);

  // ── Multi-step ticket form state ──────────────────────────────────────────
  const [subject, setSubject]     = useState('');
  const [msgBody, setMsgBody]     = useState('');
  const [tradeRef, setTradeRef]   = useState('');
  const [priority, setPriority]   = useState('normal');
  const [attachments, setAttachments] = useState([]); // { name, size, preview, data }
  const [submitting, setSubmitting] = useState(false);
  const [showFaq, setShowFaq]     = useState(true);
  const [duplicateWarn, setDuplicateWarn] = useState(null);
  const [showDuplicateConfirm, setShowDuplicateConfirm] = useState(false);

  // ── Satisfaction rating ───────────────────────────────────────────────────
  const [satisfactionRating, setSatisfactionRating] = useState(0);
  const [satisfactionSubmitted, setSatisfactionSubmitted] = useState(false);

  // ── Chat ──────────────────────────────────────────────────────────────────
  const [ticket, setTicket]       = useState(null);
  const [chatMsgs, setChatMsgs]   = useState([]);
  const [aiMsgs, setAiMsgs]       = useState([]);
  const [replyText, setReplyText] = useState('');
  const [replying, setReplying]   = useState(false);
  const [aiLoading, setAiLoad]    = useState(false);
  const pollRef  = useRef(null);
  const chatRef  = useRef(null);
  const inputRef = useRef(null);
  const detailsRef = useRef(null);
  const msgSeqRef = useRef(0); // global monotonically increasing sequence for message ordering

  // ── Suggestion form ───────────────────────────────────────────────────────
  const [sugTitle, setSugTitle] = useState('');
  const [sugBody,  setSugBody]  = useState('');
  const [sugCat,   setSugCat]   = useState('feature');
  const [sugPosting, setSugPost]= useState(false);
  const [sugDone,  setSugDone]  = useState(false);

  // ── User's open tickets (for duplicate check) ─────────────────────────────
  const [openTickets, setOpenTickets] = useState([]);

  // Scroll chat to bottom
  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [chatMsgs, aiMsgs, aiLoading]);

  // Lock body scroll on mobile when panel is open
  useEffect(() => {
    if (open && isMobile) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [open, isMobile]);

  // Stop polling when leaving chat
  useEffect(() => {
    if (mode !== 'chat' && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, [mode]);

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
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    setMode('home');
    setTopic(null);
    setTicket(null);
    setSubject(''); setMsgBody(''); setTradeRef('');
    setPriority('normal');
    setAttachments([]);
    setChatMsgs([]); setAiMsgs([]);
    msgSeqRef.current = 0;
    setReplyText('');
    setShowFaq(true);
    setShowDuplicateConfirm(false);
    setDuplicateWarn(null);
    setSatisfactionRating(0);
    setSatisfactionSubmitted(false);
    setTalkToHumanLoading(false);
  };

  const openPanel = () => {
    if (!open) setMode('home');
    setOpen(o => !o);
  };

  // Step 1: pick topic
  const pickTopic = (t) => {
    setTopic(t);
    setSubject(`Help with ${t.label}`);
    setMsgBody('');
    setTradeRef('');
    setPriority('normal');
    setAttachments([]);
    setShowFaq(true);
    setMode('topic-selected');
  };

  // Step 2: go to details form (skip FAQ or after "still need help")
  const goToForm = () => {
    setShowFaq(false);
    setMode('ticket-form');
    setTimeout(() => detailsRef.current?.focus(), 150);
  };

  // Step 3: go to priority selection
  const goToPriority = () => {
    if (!msgBody.trim()) return toast.error('Please describe your issue first');
    if (msgBody.trim().length < 10) return toast.error('Please add a bit more detail (at least 10 characters)');
    setMode('ticket-priority');
  };

  // Step 4: go to attachments
  const goToAttachments = () => {
    setMode('ticket-attachments');
  };

  // Step 5: go to review
  const goToReview = () => {
    setMode('ticket-review');
  };

  // ── Poll for new messages ─────────────────────────────────────────────────
  const startPolling = useCallback((ticketId) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const r = await axios.get(`${API_URL}/support/tickets/${ticketId}/messages`, { headers: authH() });
        const incoming = r.data.messages || [];
        setChatMsgs(prev => {
          if (incoming.length <= prev.length) return prev;
          // Only stamp _seq on NEW messages — preserve existing _seq values
          const newMsgs = incoming.slice(prev.length).map(m => ({
            ...m,
            _seq: msgSeqRef.current++,
          }));
          return [...prev, ...newMsgs];
        });
        // Also refresh ticket to get updated status
        if (incoming.length > 0) {
          const tRes = await axios.get(`${API_URL}/support/tickets`, { headers: authH() });
          const tickets = tRes.data.tickets || [];
          const updated = tickets.find(t => t.id === ticketId);
          if (updated) setTicket(prev => ({ ...prev, ...updated }));
        }
      } catch {}
    }, 5000);
  }, []);

  // ── Build conversation history for the AI ────────────────────────────────
  const buildHistory = (currentAiMsgs, currentChatMsgs) => {
    const history = [];
    const userMsgs = currentChatMsgs.filter(m => m.is_admin !== true && m.sender_id === user?.id);
    const maxPairs = Math.min(userMsgs.length, currentAiMsgs.length);
    for (let i = 0; i < maxPairs; i++) {
      history.push({ role: 'user', text: userMsgs[i].message });
      history.push({ role: 'ai',   text: currentAiMsgs[i].text });
    }
    for (let i = maxPairs; i < userMsgs.length; i++) {
      history.push({ role: 'user', text: userMsgs[i].message });
    }
    return history;
  };

  // ── Support-mode fallback — honest network-failure message only ─────────────
  // Real answers now come from the backend RAG pipeline via /api/ai-chat.
  // This function is ONLY used in catch blocks when the API call fails.
  const supportFallback = (message) => {
    return "I'm having trouble connecting right now. A human agent will be with you shortly. You can also create a support ticket for faster assistance.";
  };

  // ── AI response ───────────────────────────────────────────────────────────
  const fetchAI = async (message, topicObj, currentAiMsgs = [], currentChatMsgs = []) => {
    setAiLoad(true);
    try {
      const history = buildHistory(currentAiMsgs, currentChatMsgs);
      const res = await fetch(`${API_URL}/ai-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authH() },
        body: JSON.stringify({
          message,
          mode: 'support',
          section: topicObj?.id || null,
          history,
          user: user ? { username: user.username, id: user.id } : null,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const replyText = data.reply?.trim() || '';
      const shouldEscalate = !!data.should_escalate;
      const suggestedPriority = data.suggested_priority || 'normal';

      const seq = msgSeqRef.current++;
      setAiMsgs(prev => {
        const isDuplicate = replyText && prev.some(m => m.text.trim() === replyText);
        const finalText = isDuplicate || !replyText
          ? supportFallback(message)
          : replyText;
        return [...prev, {
          role: 'ai', text: finalText, _seq: seq,
          shouldEscalate, suggestedPriority,
        }];
      });
    } catch {
      const seq = msgSeqRef.current++;
      setAiMsgs(prev => [...prev, {
        role: 'ai', text: supportFallback(message), _seq: seq,
        shouldEscalate: true, suggestedPriority: 'normal',
      }]);
    } finally {
      setAiLoad(false);
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  };

  // ── Convert file to base64 ────────────────────────────────────────────────
  const fileToBase64 = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  // ── Check for duplicate tickets ──────────────────────────────────────────
  const checkDuplicateTickets = async () => {
    try {
      const r = await axios.get(`${API_URL}/support/tickets`, {
        headers: authH(),
        timeout: 8000, // 8-second timeout — never hang indefinitely
      });
      const allTickets = r.data.tickets || [];
      const openOnes = allTickets.filter(t => t.status !== 'closed' && t.status !== 'resolved');
      setOpenTickets(openOnes);

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

  // ── Create ticket (fires AFTER review confirmation) ──────────────────────
  const submitTicket = async () => {
    if (!user) return toast.info('Please log in to create a support ticket');
    // Prevent double-submission immediately
    if (submitting) return;
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

    // Simulate processing delay (600-900ms) to feel like real work
    await new Promise(resolve => setTimeout(resolve, 600 + Math.random() * 300));

    // Convert attachments to base64
    const attachmentData = [];
    for (const att of attachments) {
      if (att.file) {
        try {
          const b64 = await fileToBase64(att.file);
          attachmentData.push({ name: att.name, size: att.size, data: b64, type: att.file.type });
        } catch {}
      }
    }

    try {
      const r = await axios.post(`${API_URL}/support/tickets`, {
        subject: subject.trim() || `Help with ${topic?.label || 'General'}`,
        category: topic?.cat || 'general',
        message: msgBody.trim(),
        priority: priority,
        trade_reference: tradeRef?.trim() || undefined,
        attachments: attachmentData.length > 0 ? attachmentData : undefined,
      }, { headers: authH() });

      const newTicket = r.data.ticket;
      setTicket(newTicket);

      const msgsRes = await axios.get(`${API_URL}/support/tickets/${newTicket.id}/messages`, { headers: authH() });
      const initialMsgs = msgsRes.data.messages || [];
      // Stamp each message with a global sequence number for deterministic ordering
      const seqdMsgs = initialMsgs.map((m, i) => ({ ...m, _seq: i }));
      msgSeqRef.current = initialMsgs.length;
      setChatMsgs(seqdMsgs);
      setAiMsgs([]);

      setMode('ticket-created');
      startPolling(newTicket.id);
      fetchAI(msgBody.trim(), topic, [], seqdMsgs);
    } catch (e) {
      setSubmitting(false);
      toast.error(e.response?.data?.error || 'Failed to create ticket. Please try again.');
    }
  };

  // ── Send reply (in chat) ──────────────────────────────────────────────────
  const sendReply = async () => {
    const text = replyText.trim();
    if (!text || replying || aiLoading || !ticket) return;
    setReplying(true);
    setReplyText('');
    try {
      const r = await axios.post(`${API_URL}/support/tickets/${ticket.id}/messages`, { message: text }, { headers: authH() });
      const newMsg = { ...r.data.message, _seq: msgSeqRef.current++ };
      const updatedChatMsgs = [...chatMsgs, newMsg];
      setChatMsgs(updatedChatMsgs);
      fetchAI(text, topic, aiMsgs, updatedChatMsgs);
    } catch (e) {
      setReplyText(text);
      toast.error(e.response?.data?.error || 'Failed to send. Please try again.');
    } finally {
      setReplying(false);
    }
  };

  // ── Submit satisfaction rating ────────────────────────────────────────────
  const submitSatisfaction = async (rating) => {
    setSatisfactionRating(rating);
    setSatisfactionSubmitted(true);
    try {
      await axios.post(`${API_URL}/support/tickets/${ticket?.id}/feedback`, {
        rating,
        ticket_id: ticket?.id,
      }, { headers: authH() });
      toast.success('Thanks for your feedback!');
    } catch {
      // silently fail — rating is optional
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

  // ── Add attachment ────────────────────────────────────────────────────────
  const addAttachment = (file) => {
    const preview = URL.createObjectURL(file);
    setAttachments(prev => [...prev, {
      name: file.name,
      size: file.size,
      preview,
      file,
      type: file.type,
    }]);
  };

  const removeAttachment = (index) => {
    setAttachments(prev => {
      const item = prev[index];
      if (item?.preview) URL.revokeObjectURL(item.preview);
      return prev.filter((_, i) => i !== index);
    });
  };

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  };

  // ── Header config per mode ────────────────────────────────────────────────
  const TopicIcon = topic?.icon || MessageCircle;
  const stepLabels = ['Topic', 'Details', 'Priority', 'Attachments', 'Review'];
  const totalSteps = 5;

  const getHeaderStep = (m) => {
    switch (m) {
      case 'topic-selected':      return [1, totalSteps];
      case 'ticket-form':         return [2, totalSteps];
      case 'ticket-priority':     return [3, totalSteps];
      case 'ticket-attachments':  return [4, totalSteps];
      case 'ticket-review':       return [5, totalSteps];
      default:                    return null;
    }
  };

  const getHeaderSub = (m) => {
    const s = getHeaderStep(m);
    if (!s) return '';
    const label = stepLabels[s[0] - 1] || '';
    return `Step ${s[0]} of ${s[1]} — ${label}`;
  };

  const headerCfg = {
    'home':              { title: 'PRAQEN Support',         sub: 'How can we help you today?',                                        icon: <MessageCircle size={18} color="white" />,  step: null },
    'topic-selected':    { title: topic?.label || 'Support', sub: getHeaderSub('topic-selected'),                                      icon: <TopicIcon size={16} color="white" />,       step: getHeaderStep('topic-selected') },
    'ticket-form':       { title: 'Describe Your Issue',     sub: getHeaderSub('ticket-form'),                                         icon: <FileText size={18} color="white" />,          step: getHeaderStep('ticket-form') },
    'ticket-priority':   { title: 'Set Priority',            sub: getHeaderSub('ticket-priority'),                                     icon: <Flag size={18} color="white" />,              step: getHeaderStep('ticket-priority') },
    'ticket-attachments':{ title: 'Add Evidence (Optional)',  sub: getHeaderSub('ticket-attachments'),                                  icon: <Paperclip size={18} color="white" />,        step: getHeaderStep('ticket-attachments') },
    'ticket-review':     { title: 'Review & Confirm',         sub: getHeaderSub('ticket-review'),                                      icon: <CheckCircle size={18} color="white" />,       step: getHeaderStep('ticket-review') },
    'submitting':        { title: 'Submitting Your Ticket…',  sub: 'Please wait while we process your request',                         icon: <RefreshCw size={18} color="white" />,        step: null },
    'ticket-created':    { title: 'Ticket Created!',         sub: `Ticket #${ticket?.id?.slice(0,8).toUpperCase() || '…'}`,           icon: <CheckCircle size={18} color="white" />,      step: null },
    'chat':              { title: 'Live Support Chat',       sub: ticket ? `Ticket #${ticket.id.slice(0,8).toUpperCase()} · ${getTicketStatusLabel(ticket?.status)}` : '…', icon: <Headphones size={18} color="white" />, step: null },
    'suggest':           { title: 'Drop a Suggestion',       sub: 'We read every single one',                                          icon: <Lightbulb size={18} color="white" />,         step: null },
  };
  const hdr = headerCfg[mode] || headerCfg['home'];

  const canGoBack = mode !== 'home' && mode !== 'chat' && mode !== 'ticket-created' && mode !== 'submitting';

  // ── Ticket status label helper ────────────────────────────────────────────
  function getTicketStatusLabel(status) {
    switch (status) {
      case 'open':      return 'Open';
      case 'active':    return 'In Review';
      case 'pending':   return 'Awaiting You';
      case 'resolved':  return 'Resolved';
      case 'closed':    return 'Closed';
      default:          return status || 'Open';
    }
  }

  function getTicketStatusColor(status) {
    switch (status) {
      case 'open':      return '#4ADE80';
      case 'active':    return '#D97706';
      case 'pending':   return '#F59E0B';
      case 'resolved':  return '#8B5CF6';
      case 'closed':    return '#94A3B8';
      default:          return '#4ADE80';
    }
  }

  // Get FAQ articles for current topic
  const faqArticles = FAQ_BY_TOPIC[topic?.id] || FAQ_BY_TOPIC.other || [];

  // ── Standalone AI Chat (Tab 2) ────────────────────────────────────────────
  const [standaloneAiMsgs, setStandaloneAiMsgs] = useState([]);
  const [standaloneAiLoading, setStandaloneAiLoading] = useState(false);
  const [standaloneInput, setStandaloneInput] = useState('');
  const standaloneChatRef = useRef(null);
  const standaloneInputRef = useRef(null);
  const [activeTab, setActiveTab] = useState('support');

  // ── Talk to a Human state ────────────────────────────────────────────────
  const [talkToHumanLoading, setTalkToHumanLoading] = useState(false);
  const [selectedDepartment, setSelectedDepartment] = useState('tech');
  const DEPARTMENTS = [
    { id: 'tech', label: 'Tech', icon: <Settings size={12} /> },
    { id: 'billing', label: 'Billing', icon: <CreditCard size={12} /> },
    { id: 'compliance', label: 'Compliance', icon: <Shield size={12} /> },
    { id: 'general', label: 'General', icon: <MessageCircle size={12} /> },
  ];

  const MIN_TYPING_MS = 700;

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

    // Detect explicit human-agent request
    const wantsHuman = HUMAN_AGENT_KEYWORDS.test(text);

    setStandaloneInput('');
    setStandaloneAiLoading(true);
    const startedAt = Date.now();
    const seq = msgSeqRef.current++;
    setStandaloneAiMsgs(prev => [...prev, { role: 'user', text, _seq: seq, wantsHuman }]);

    try {
      const history = standaloneAiMsgs
        .filter(m => m.role === 'user' || m.role === 'ai')
        .map(m => ({ role: m.role === 'ai' ? 'ai' : 'user', text: m.text }));
      const result = await fetchStandaloneAIResponse(text, history);

      // Enforce minimum typing duration so the indicator is always visible
      const elapsed = Date.now() - startedAt;
      if (elapsed < MIN_TYPING_MS) {
        await new Promise(resolve => setTimeout(resolve, MIN_TYPING_MS - elapsed));
      }

      const fixedReply = result.reply || "I'm here to help! Could you tell me more?";
      const shouldEscalate = wantsHuman || result.shouldEscalate;
      const seq2 = msgSeqRef.current++;
      setStandaloneAiMsgs(prev => [...prev, {
        role: 'ai', text: fixedReply, _seq: seq2,
        shouldEscalate, suggestedPriority: result.suggestedPriority,
      }]);
    } catch {
      const elapsed = Date.now() - startedAt;
      if (elapsed < MIN_TYPING_MS) {
        await new Promise(resolve => setTimeout(resolve, MIN_TYPING_MS - elapsed));
      }
      const seq2 = msgSeqRef.current++;
      setStandaloneAiMsgs(prev => [...prev, {
        role: 'ai', text: "I'm having trouble connecting right now. Please try again in a moment.",
        _seq: seq2, shouldEscalate: true, suggestedPriority: 'normal',
      }]);
    } finally {
      setStandaloneAiLoading(false);
      setTimeout(() => standaloneInputRef.current?.focus(), 200);
    }
  };

  // ── Talk to a Human handler ──────────────────────────────────────────────
  const handleTalkToHuman = async () => {
    if (!user) return toast.info('Please log in to connect with a human agent');
    if (talkToHumanLoading) return;
    setTalkToHumanLoading(true);

    try {
      // Check agent availability
      const availRes = await fetch(`${API_URL}/support/agents/availability`, {
        headers: authH(),
      });
      const avail = await availRes.json();

      if (!avail.available) {
        // No agent online — show offline message and offer to leave a ticket
        const seq = msgSeqRef.current++;
        setStandaloneAiMsgs(prev => [...prev, {
          role: 'ai',
          text: `No human agents are currently online. Expected response time: ${avail.estimatedResponse || '~8–12 hours'}. Would you like to leave a support ticket? An agent will respond when they're back online.`,
          _seq: seq,
          shouldEscalate: false,
          suggestedPriority: 'normal',
          isOfflineNotice: true,
          estimatedResponse: avail.estimatedResponse,
        }]);
        return;
      }

      // Agent is available — create a live-chat ticket automatically
      const transcript = standaloneAiMsgs
        .map(am => `${am.role === 'user' ? 'User' : 'AI'}: ${am.text}`)
        .join('\n');
      const preamble = 'User requested to speak with a human agent. Conversation transcript:';
      const fullMessage = [preamble, '', transcript].join('\n').slice(0, 2000);

      const ticketRes = await axios.post(`${API_URL}/support/tickets`, {
        subject: 'Live Chat Request from AI Assistant',
        category: 'other',
        department: selectedDepartment || 'tech',
        message: fullMessage,
        priority: 'normal',
      }, { headers: authH() });

      const newTicket = ticketRes.data.ticket;

      // Auto-assign an agent
      const assignRes = await axios.post(`${API_URL}/support/tickets/${newTicket.id}/assign-agent`, {}, { headers: authH() });
      const assignData = assignRes.data;

      // Set up the chat state
      setTicket(newTicket);
      setTopic(TOPICS.find(t => t.id === 'other') || TOPICS[0]);
      setSubject('Live Chat Request from AI Assistant');
      setPriority('normal');
      setReplyText('');

      // Fetch messages (includes the agent intro if assigned)
      const msgsRes = await axios.get(`${API_URL}/support/tickets/${newTicket.id}/messages`, { headers: authH() });
      const initialMsgs = msgsRes.data.messages || [];
      const seqdMsgs = initialMsgs.map((m, i) => ({ ...m, _seq: i }));
      msgSeqRef.current = initialMsgs.length;
      setChatMsgs(seqdMsgs);
      setAiMsgs([]);

      // Switch to live chat mode
      setMode('chat');
      startPolling(newTicket.id);

      if (assignData.agent) {
        toast.success(`Connected with ${assignData.agent.name || 'a support agent'}!`);
      } else if (assignData.available === false) {
        // Agent was available when we checked but became unavailable — ticket still created
        toast.info('Your live chat ticket is open. An agent will pick it up shortly. You can leave a message below.');
      } else {
        toast.success('Live chat ticket created! An agent will join shortly.');
      }
    } catch (e) {
      console.error('Talk to Human error:', e);
      const errMsg = e.response?.data?.error || e.message || 'Unknown error';
      console.error('Talk to Human detailed error:', errMsg);
      toast.error(`Failed to connect: ${errMsg}. Please try creating a support ticket instead.`);
      // Fallback — pre-fill a ticket form
      const transcript = standaloneAiMsgs
        .map(am => `${am.role === 'user' ? 'User' : 'AI'}: ${am.text}`)
        .join('\n');
      setMsgBody(transcript.slice(0, 2000));
      setSubject('Escalated from AI Chat');
      setActiveTab('support');
      setMode('home');
    } finally {
      setTalkToHumanLoading(false);
    }
  };

  // Scroll standalone AI chat to bottom
  useEffect(() => {
    if (standaloneChatRef.current) {
      standaloneChatRef.current.scrollTop = standaloneChatRef.current.scrollHeight;
    }
  }, [standaloneAiMsgs, standaloneAiLoading]);

  // ─────────────────────────────────────────────────────────────────────────────
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
                <button onClick={() => {
                  if (mode === 'ticket-form')         setMode('topic-selected');
                  else if (mode === 'ticket-priority') setMode('ticket-form');
                  else if (mode === 'ticket-attachments') setMode('ticket-priority');
                  else if (mode === 'ticket-review')  setMode('ticket-attachments');
                  else if (mode === 'topic-selected')  goHome();
                  else if (mode === 'suggest')         goHome();
                }}
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
                <p className="truncate flex items-center gap-1"
                  style={{ fontSize: isMobile ? 12 : 11, marginTop: 3, color: 'rgba(255,255,255,0.7)', margin: '3px 0 0' }}>
                  {mode === 'chat' && (
                    <span style={{
                      display: 'inline-block', width: 7, height: 7, borderRadius: '50%',
                      backgroundColor: getTicketStatusColor(ticket?.status), flexShrink: 0
                    }} />
                  )}
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

          {/* ── Step bar ── */}
          {hdr.step && (
            <div className="flex-shrink-0 border-b" style={{ borderColor: '#F1F5F9', backgroundColor: '#FAFAFA' }}>
              <StepBar step={hdr.step[0]} total={hdr.step[1]} labels={stepLabels} />
            </div>
          )}

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

              {/* Topic grid */}
              <div className="px-4 pb-3">
                <p style={{ fontSize: 11, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10, color: '#94A3B8' }}>
                  Choose a topic
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
                  { icon: <Headphones size={11} color="#1B4332" />, text: 'Human + AI Support' },
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
              {/* Talk to a Human button — always visible at top */}
              <div className="flex-shrink-0 px-4 pt-3 pb-1">
                <button
                  onClick={handleTalkToHuman}
                  disabled={talkToHumanLoading}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-black transition-all hover:shadow-md disabled:opacity-50"
                  style={{
                    background: 'linear-gradient(135deg,#FEF2F2,#FEE2E2)',
                    border: '1.5px solid #FECACA',
                    color: '#DC2626',
                  }}>
                  {talkToHumanLoading ? (
                    <><RefreshCw size={14} className="animate-spin" /> Connecting…</>
                  ) : (
                    <><Headphones size={14} /> Talk to a Human Agent</>
                  )}
                </button>

                {/* Department selector */}
                <div className="flex items-center gap-2 mt-2 px-1">
                  <span className="text-[10px] font-bold" style={{ color: '#94A3B8' }}>Department:</span>
                  <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
                    {DEPARTMENTS.map(d => (
                      <button key={d.id} onClick={() => setSelectedDepartment(d.id)}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition flex-shrink-0"
                        style={{
                          backgroundColor: selectedDepartment === d.id ? '#1B4332' : '#fff',
                          color: selectedDepartment === d.id ? '#fff' : '#64748B',
                          border: `1px solid ${selectedDepartment === d.id ? '#1B4332' : '#E2E8F0'}`,
                          boxShadow: selectedDepartment === d.id ? '0 1px 3px rgba(27,67,50,0.15)' : 'none',
                        }}>
                        {d.icon} {d.label}
                      </button>
                    ))}
                  </div>
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
                        {/* Escalation CTA — shown when AI suggests human handoff */}
                        {m.role === 'ai' && m.shouldEscalate && !m.isOfflineNotice && !standaloneAiLoading && (
                          <div className="mt-1.5 px-1">
                            <button
                              onClick={handleTalkToHuman}
                              disabled={talkToHumanLoading}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold transition hover:opacity-80 disabled:opacity-50"
                              style={{ backgroundColor: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626' }}>
                              {talkToHumanLoading ? <RefreshCw size={11} className="animate-spin" /> : <Headphones size={11} />}
                              {talkToHumanLoading ? 'Connecting…' : 'Talk to a human agent'}
                            </button>
                          </div>
                        )}

                        {/* Offline notice — create ticket instead */}
                        {m.role === 'ai' && m.isOfflineNotice && !standaloneAiLoading && (
                          <div className="mt-1.5 px-1 flex gap-1.5">
                            <button
                              onClick={() => {
                                const transcript = standaloneAiMsgs
                                  .map(am => `${am.role === 'user' ? 'User' : 'AI'}: ${am.text}`)
                                  .join('\n');
                                setMsgBody(transcript.slice(0, 2000));
                                setSubject('Offline Support Request');
                                setPriority('normal');
                                setActiveTab('support');
                                setMode('home');
                                toast.info('Ticket pre-filled. Please review and submit — an agent will respond when online.');
                              }}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold transition hover:opacity-80"
                              style={{ backgroundColor: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626' }}>
                              <Ticket size={11} />
                              Leave a ticket
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

          {/* ════════════ STEP 1: TOPIC SELECTED + FAQ ════════════ */}
          {mode === 'topic-selected' && (
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4" style={{ backgroundColor: '#F8FAFC' }}>

              {/* Topic card */}
              <div className="p-4 rounded-2xl"
                style={{ backgroundColor: topic?.bg || '#F0FDF4', border: `2px solid ${topic?.color || '#1B4332'}25` }}>
                <div className="flex items-center gap-3 mb-2">
                  <div style={{
                    width: 44, height: 44, borderRadius: 14, backgroundColor: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
                  }}>
                    <TopicIcon size={22} color={topic?.color} strokeWidth={2.25} />
                  </div>
                  <div>
                    <p className="text-sm font-black" style={{ color: topic?.color }}>{topic?.label}</p>
                    <p className="text-[11px]" style={{ color: '#64748B' }}>{topic?.hint}</p>
                  </div>
                </div>
              </div>

              {/* Self-serve FAQ — before showing the form */}
              {showFaq && faqArticles.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 mb-2">
                    <Lightbulb size={14} color="#D97706" />
                    <p className="text-[11px] font-black" style={{ color: '#1E293B' }}>
                      Quick answers for {topic?.label?.toLowerCase()}
                    </p>
                  </div>
                  {faqArticles.map((faq, i) => (
                    <details key={i} className="rounded-xl overflow-hidden"
                      style={{ backgroundColor: '#fff', border: '1.5px solid #E2E8F0' }}>
                      <summary className="px-4 py-3 text-xs font-bold cursor-pointer"
                        style={{ color: '#334155', listStyle: 'none', display: 'flex', alignItems: 'center', gap: 8 }}
                      >
                        <span style={{ color: topic?.color || '#1B4332', fontSize: 16 }}>?</span>
                        {faq.q}
                      </summary>
                      <div className="px-4 pb-3 pt-1 border-t" style={{ borderColor: '#F1F5F9' }}>
                        <p className="text-[11px] leading-relaxed" style={{ color: '#64748B' }}>
                          <Msg text={faq.a} />
                        </p>
                      </div>
                    </details>
                  ))}

                  {/* "Still need help" CTA */}
                  <div className="pt-2 pb-1 text-center">
                    <p className="text-[10px] mb-2" style={{ color: '#94A3B8' }}>
                      Didn't find what you need?
                    </p>
                    <button onClick={goToForm}
                      className="w-full py-3 rounded-xl font-black text-sm text-white flex items-center justify-center gap-2 transition hover:opacity-90"
                      style={{ background: 'linear-gradient(135deg,#1B4332,#2D6A4F)' }}>
                      <Ticket size={15} />
                      Still Need Help — Create Ticket
                      <ArrowRight size={13} />
                    </button>
                  </div>
                </div>
              )}

              {/* If user clicked past FAQ or no FAQ articles, show the CTA */}
              {(!showFaq || faqArticles.length === 0) && (
                <>
                  {/* What happens next */}
                  <div className="p-4 rounded-2xl space-y-3"
                    style={{ backgroundColor: '#fff', border: '1.5px solid #E2E8F0' }}>
                    <p className="text-xs font-black" style={{ color: '#1E293B' }}>What happens when you create a ticket:</p>
                    {[
                      { n: '1', text: 'You describe your issue in the next step' },
                      { n: '2', text: 'You set the priority so we know how urgent it is' },
                      { n: '3', text: 'You can attach screenshots as evidence (optional)' },
                      { n: '4', text: 'You review everything before submitting' },
                    ].map(s => (
                      <div key={s.n} className="flex items-start gap-3">
                        <span className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-black text-white"
                          style={{ backgroundColor: '#1B4332', marginTop: 1 }}>{s.n}</span>
                        <p className="text-[11px] leading-relaxed" style={{ color: '#64748B' }}>{s.text}</p>
                      </div>
                    ))}
                  </div>

                  {/* Account info */}
                  {user ? (
                    <div className="flex items-center gap-3 p-3 rounded-xl"
                      style={{ backgroundColor: '#fff', border: '1.5px solid #D1FAE5' }}>
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: '#F0FDF4' }}>
                        {user.avatar_url
                          ? <img src={user.avatar_url} alt="" className="w-9 h-9 rounded-xl object-cover" />
                          : <User size={16} color="#1B4332" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-black truncate" style={{ color: '#1E293B' }}>
                          {user.full_name || user.username}
                        </p>
                        <p className="text-[10px] truncate" style={{ color: '#64748B' }}>@{user.username}</p>
                      </div>
                      <span className="text-[10px] font-black px-2 py-0.5 rounded-full flex-shrink-0 flex items-center gap-1"
                        style={{ backgroundColor: '#D1FAE5', color: '#1B4332' }}>
                        <Check size={10} strokeWidth={3} /> Logged in
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 p-3 rounded-xl"
                      style={{ backgroundColor: '#FEF2F2', border: '1.5px solid #FECACA' }}>
                      <User size={16} color="#DC2626" />
                      <p className="text-xs font-semibold" style={{ color: '#DC2626' }}>
                        You need to be logged in to create a support ticket.
                      </p>
                    </div>
                  )}

                  {/* CTA */}
                  <button onClick={goToForm} disabled={!user}
                    className="w-full py-3.5 rounded-xl font-black text-sm text-white flex items-center justify-center gap-2 transition hover:opacity-90 disabled:opacity-40"
                    style={{ background: 'linear-gradient(135deg,#1B4332,#2D6A4F)' }}>
                    <Ticket size={16} />
                    Get Started
                    <ArrowRight size={14} />
                  </button>
                </>
              )}

              <p className="text-[10px] text-center" style={{ color: '#CBD5E1' }}>
                Or go back and choose a different topic
              </p>
            </div>
          )}

          {/* ════════════ STEP 2: DETAILS FORM ════════════ */}
          {mode === 'ticket-form' && (
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4" style={{ backgroundColor: '#F8FAFC' }}>

              {/* Topic badge */}
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl"
                style={{ backgroundColor: topic?.bg || '#F0FDF4', border: `1.5px solid ${topic?.color || '#1B4332'}20` }}>
                <TopicIcon size={15} color={topic?.color} strokeWidth={2.25} />
                <p className="text-xs font-black" style={{ color: topic?.color }}>{topic?.label}</p>
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

              {/* Message */}
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

              {/* Next */}
              <button onClick={goToPriority} disabled={!msgBody.trim() || msgBody.trim().length < 10}
                className="w-full py-3.5 rounded-xl font-black text-sm text-white flex items-center justify-center gap-2 transition hover:opacity-90 disabled:opacity-40"
                style={{ background: 'linear-gradient(135deg,#1B4332,#2D6A4F)' }}>
                Continue — Set Priority
                <ArrowRight size={14} />
              </button>

              <p className="text-[10px] text-center" style={{ color: '#CBD5E1' }}>
                We'll never share your information
              </p>
            </div>
          )}

          {/* ════════════ STEP 3: PRIORITY ════════════ */}
          {mode === 'ticket-priority' && (
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4" style={{ backgroundColor: '#F8FAFC' }}>

              {/* Priority auto-detect notice */}
              {priority === 'urgent' && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl"
                  style={{ backgroundColor: '#FEF2F2', border: '1.5px solid #FECACA' }}>
                  <AlertOctagon size={14} color="#DC2626" />
                  <p className="text-[10px] font-bold" style={{ color: '#DC2626' }}>
                    We detected keywords suggesting this may be urgent — we've pre-selected Urgent for you.
                  </p>
                </div>
              )}

              <div>
                <p className="text-[11px] font-black uppercase tracking-wider mb-3" style={{ color: '#64748B' }}>
                  How urgent is your issue?
                </p>
                <div className="space-y-2.5">
                  {PRIORITIES.map(p => {
                    const PrioIcon = p.icon;
                    const isSelected = priority === p.id;
                    return (
                      <button key={p.id} onClick={() => setPriority(p.id)}
                        className="w-full text-left flex items-center gap-3 p-3.5 rounded-xl transition-all"
                        style={{
                          backgroundColor: isSelected ? p.bg : '#fff',
                          border: `2px solid ${isSelected ? p.color : '#E2E8F0'}`,
                          boxShadow: isSelected ? `0 0 0 1px ${p.color}20` : 'none',
                        }}>
                        <div style={{
                          width: 40, height: 40, borderRadius: 12,
                          backgroundColor: isSelected ? p.color : '#F1F5F9',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                          transition: 'all 0.2s',
                        }}>
                          <PrioIcon size={18} color={isSelected ? 'white' : p.color} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-black" style={{ color: isSelected ? p.color : '#1E293B' }}>
                            {p.label}
                          </p>
                          <p className="text-[10px] mt-0.5" style={{ color: '#64748B' }}>{p.desc}</p>
                        </div>
                        <div style={{
                          width: 22, height: 22, borderRadius: '50%',
                          border: `2px solid ${isSelected ? p.color : '#CBD5E1'}`,
                          backgroundColor: isSelected ? p.color : 'transparent',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          flexShrink: 0,
                        }}>
                          {isSelected && <Check size={12} color="white" strokeWidth={3} />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* ETA info */}
              <div className="p-3 rounded-xl" style={{ backgroundColor: '#fff', border: '1.5px solid #E2E8F0' }}>
                <div className="flex items-center gap-2">
                  <Clock size={13} color="#64748B" />
                  <p className="text-[10px]" style={{ color: '#64748B' }}>
                    Estimated response time:{' '}
                    <span className="font-bold" style={{ color: RESPONSE_TIMES[priority]?.color || '#64748B' }}>
                      {RESPONSE_TIMES[priority]?.eta || '~24 hours'}
                    </span>
                  </p>
                </div>
              </div>

              {/* Navigation */}
              <div className="flex gap-2">
                <button onClick={() => setMode('ticket-form')}
                  className="px-4 py-3 rounded-xl font-bold text-sm transition flex items-center gap-1.5"
                  style={{ backgroundColor: '#fff', border: '1.5px solid #E2E8F0', color: '#64748B' }}>
                  <ChevronLeft size={14} /> Back
                </button>
                <button onClick={goToAttachments}
                  className="flex-1 py-3 rounded-xl font-black text-sm text-white flex items-center justify-center gap-2 transition hover:opacity-90"
                  style={{ background: 'linear-gradient(135deg,#1B4332,#2D6A4F)' }}>
                  Continue — Add Evidence
                  <ArrowRight size={14} />
                </button>
              </div>
            </div>
          )}

          {/* ════════════ STEP 4: ATTACHMENTS ════════════ */}
          {mode === 'ticket-attachments' && (
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4" style={{ backgroundColor: '#F8FAFC' }}>

              <div>
                <p className="text-[11px] font-black uppercase tracking-wider mb-1" style={{ color: '#64748B' }}>
                  Add Supporting Evidence <span style={{ color: '#94A3B8' }}>(optional)</span>
                </p>
                <p className="text-[10px] mb-3" style={{ color: '#94A3B8' }}>
                  Screenshots of error messages, payment receipts, or trade screens help us resolve your issue faster.
                </p>

                {/* Upload area */}
                <label className="flex flex-col items-center gap-2 p-6 rounded-xl cursor-pointer transition hover:bg-gray-50"
                  style={{ backgroundColor: '#fff', border: '2px dashed #CBD5E1' }}>
                  <Upload size={24} color="#94A3B8" />
                  <div className="text-center">
                    <p className="text-xs font-bold" style={{ color: '#475569' }}>
                      Tap to upload screenshots
                    </p>
                    <p className="text-[10px] mt-0.5" style={{ color: '#94A3B8' }}>
                      PNG, JPG up to 5 MB each
                    </p>
                  </div>
                  <input type="file" accept="image/png,image/jpeg,image/jpg" multiple
                    className="hidden"
                    onChange={(e) => {
                      const files = Array.from(e.target.files || []);
                      files.forEach(f => {
                        if (f.size <= 5 * 1024 * 1024) addAttachment(f);
                        else toast.error(`${f.name} is too large (max 5 MB)`);
                      });
                      e.target.value = '';
                    }} />
                </label>

                {/* Attachments list */}
                {attachments.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {attachments.map((att, i) => (
                      <div key={i} className="flex items-center gap-3 p-2.5 rounded-xl"
                        style={{ backgroundColor: '#fff', border: '1.5px solid #E2E8F0' }}>
                        {att.type?.startsWith('image/') ? (
                          <div style={{
                            width: 44, height: 44, borderRadius: 10, overflow: 'hidden', flexShrink: 0,
                            backgroundColor: '#F1F5F9',
                          }}>
                            <img src={att.preview} alt={att.name}
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          </div>
                        ) : (
                          <div style={{
                            width: 44, height: 44, borderRadius: 10, flexShrink: 0,
                            backgroundColor: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            <FileText size={18} color="#64748B" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold truncate" style={{ color: '#1E293B' }}>{att.name}</p>
                          <p className="text-[10px]" style={{ color: '#94A3B8' }}>{formatFileSize(att.size)}</p>
                        </div>
                        <button onClick={() => removeAttachment(i)}
                          style={{
                            width: 32, height: 32, borderRadius: 8,
                            border: 'none', cursor: 'pointer', flexShrink: 0,
                            backgroundColor: '#FEF2F2', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                          <Trash2 size={14} color="#DC2626" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Upload more button */}
                {attachments.length > 0 && attachments.length < 5 && (
                  <label className="mt-2 flex items-center justify-center gap-2 w-full py-2.5 rounded-xl cursor-pointer font-bold text-xs transition"
                    style={{ backgroundColor: '#fff', border: '1.5px solid #E2E8F0', color: '#64748B' }}>
                    <Paperclip size={13} /> Add more files
                    <input type="file" accept="image/png,image/jpeg,image/jpg" multiple
                      className="hidden"
                      onChange={(e) => {
                        const files = Array.from(e.target.files || []);
                        files.forEach(f => {
                          if (attachments.length + files.length <= 5) {
                            if (f.size <= 5 * 1024 * 1024) addAttachment(f);
                            else toast.error(`${f.name} is too large (max 5 MB)`);
                          } else toast.error('Maximum 5 attachments');
                        });
                        e.target.value = '';
                      }} />
                  </label>
                )}
              </div>

              {/* Navigation */}
              <div className="flex gap-2">
                <button onClick={() => setMode('ticket-priority')}
                  className="px-4 py-3 rounded-xl font-bold text-sm transition flex items-center gap-1.5"
                  style={{ backgroundColor: '#fff', border: '1.5px solid #E2E8F0', color: '#64748B' }}>
                  <ChevronLeft size={14} /> Back
                </button>
                <button onClick={goToReview}
                  className="flex-1 py-3 rounded-xl font-black text-sm text-white flex items-center justify-center gap-2 transition hover:opacity-90"
                  style={{ background: 'linear-gradient(135deg,#1B4332,#2D6A4F)' }}>
                  {attachments.length > 0 ? `Review (${attachments.length} file${attachments.length > 1 ? 's' : ''})` : 'Skip — Review Ticket'}
                  <ArrowRight size={14} />
                </button>
              </div>
            </div>
          )}

          {/* ════════════ STEP 5: REVIEW & CONFIRM ════════════ */}
          {mode === 'ticket-review' && (
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4" style={{ backgroundColor: '#F8FAFC' }}>

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

              {/* Summary card */}
              <div className="p-4 rounded-2xl space-y-3"
                style={{ backgroundColor: '#fff', border: '2px solid #1B4332', boxShadow: '0 4px 16px rgba(27,67,50,0.08)' }}>

                <p className="text-[11px] font-black uppercase tracking-wider text-center" style={{ color: '#1B4332' }}>
                  Ticket Summary
                </p>

                {/* Topic */}
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl"
                  style={{ backgroundColor: topic?.bg || '#F0FDF4' }}>
                  <TopicIcon size={14} color={topic?.color} strokeWidth={2.25} />
                  <span className="text-xs font-bold" style={{ color: topic?.color }}>{topic?.label}</span>
                </div>

                {/* Subject */}
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-wider" style={{ color: '#94A3B8' }}>Subject</p>
                  <p className="text-xs font-bold mt-0.5" style={{ color: '#1E293B' }}>{subject}</p>
                </div>

                {/* Message */}
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-wider" style={{ color: '#94A3B8' }}>Description</p>
                  <p className="text-[11px] mt-0.5 leading-relaxed" style={{ color: '#475569' }}>{msgBody}</p>
                </div>

                {/* Trade ref */}
                {tradeRef && (
                  <div>
                    <p className="text-[9px] font-bold uppercase tracking-wider" style={{ color: '#94A3B8' }}>Reference ID</p>
                    <p className="text-xs font-bold mt-0.5" style={{ color: '#1E293B' }}>{tradeRef}</p>
                  </div>
                )}

                {/* Priority */}
                <div className="flex items-center gap-2">
                  <p className="text-[9px] font-bold uppercase tracking-wider" style={{ color: '#94A3B8' }}>Priority</p>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                    style={{
                      backgroundColor: PRIORITIES.find(p => p.id === priority)?.bg || '#F1F5F9',
                      color: PRIORITIES.find(p => p.id === priority)?.color || '#64748B',
                    }}>
                    {PRIORITIES.find(p => p.id === priority)?.label || 'Normal'}
                  </span>
                </div>

                {/* Attachments */}
                {attachments.length > 0 && (
                  <div>
                    <p className="text-[9px] font-bold uppercase tracking-wider mb-1" style={{ color: '#94A3B8' }}>
                      Attachments ({attachments.length})
                    </p>
                    <div className="flex gap-1.5 flex-wrap">
                      {attachments.map((att, i) => (
                        <div key={i} style={{
                          width: 44, height: 44, borderRadius: 10, overflow: 'hidden',
                          border: '1.5px solid #E2E8F0',
                        }}>
                          {att.type?.startsWith('image/')
                            ? <img src={att.preview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F1F5F9' }}>
                                <FileText size={16} color="#64748B" />
                              </div>
                          }
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Account */}
                {user && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl"
                    style={{ backgroundColor: '#F0FDF4' }}>
                    <User size={13} color="#1B4332" />
                    <p className="text-[10px] font-bold" style={{ color: '#1B4332' }}>
                      {user.full_name || user.username} · @{user.username}
                    </p>
                  </div>
                )}

                {/* Estimated response time */}
                <div className="flex items-center justify-center gap-1.5 pt-1">
                  <Clock size={11} color={RESPONSE_TIMES[priority]?.color || '#64748B'} />
                  <p className="text-[10px]" style={{ color: '#64748B' }}>
                    Estimated response:{' '}
                    <span className="font-bold" style={{ color: RESPONSE_TIMES[priority]?.color || '#64748B' }}>
                      {RESPONSE_TIMES[priority]?.eta || '~24 hours'}
                    </span>
                  </p>
                </div>
              </div>

              {/* Submit */}
              <button onClick={submitTicket} disabled={!user || submitting}
                className="w-full py-3.5 rounded-xl font-black text-sm text-white flex items-center justify-center gap-2 transition hover:opacity-90 disabled:opacity-40"
                style={{ background: 'linear-gradient(135deg,#1B4332,#2D6A4F)' }}>
                <CheckCircle size={16} />
                Confirm & Submit Ticket
                <ArrowRight size={14} />
              </button>

              {/* Back */}
              <div className="flex justify-center">
                <button onClick={() => setMode('ticket-attachments')}
                  className="text-[11px] font-bold flex items-center gap-1" style={{ color: '#94A3B8' }}>
                  <ChevronLeft size={12} /> Edit details
                </button>
              </div>
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
                <div className="absolute -top-1 -right-1">
                  <div className="w-5 h-5 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: '#1B4332' }}>
                    <Lock size={12} color="white" />
                  </div>
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
                  { text: `Routing to ${priority === 'urgent' ? 'priority queue' : 'support team'}`, done: false },
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

          {/* ════════════ TICKET CREATED SUCCESS ════════════ */}
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

              {/* Status info */}
              <div className="w-full space-y-2">
                {[
                  { icon: CheckCircle, color: '#1B4332', text: 'Ticket submitted to our support team' },
                  { icon: Bot,         color: '#D97706', text: 'PRAQEN AI is typing a quick response…' },
                  { icon: Headphones,  color: '#D97706', text: `Human agent ${RESPONSE_TIMES[priority]?.eta || 'within 24 hours'}` },
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

              {/* Open chat button */}
              <button onClick={() => setMode('chat')}
                className="w-full py-3.5 rounded-xl font-black text-sm text-white flex items-center justify-center gap-2 transition hover:opacity-90"
                style={{ background: 'linear-gradient(135deg,#1B4332,#2D6A4F)' }}>
                <Headphones size={16} />
                Open Live Chat
                <ArrowRight size={14} />
              </button>

              <button onClick={goHome} className="text-[11px] font-bold flex items-center gap-1" style={{ color: '#94A3B8' }}>
                <ChevronLeft size={12} /> Back to home
              </button>
            </div>
          )}

          {/* ════════════ CHAT ════════════ */}
          {mode === 'chat' && (
            <>
              {/* Ticket info bar */}
              <div className="flex-shrink-0 flex items-center justify-between px-4 py-2 border-b"
                style={{ borderColor: '#E2E8F0', backgroundColor: '#F0FDF4' }}>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-black truncate" style={{ color: '#1B4332' }}>
                    {ticket?.subject}
                  </p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: getTicketStatusColor(ticket?.status) }} />
                    <TopicIcon size={11} color="#1B4332" className="flex-shrink-0" />
                    <p className="text-[10px] truncate" style={{ color: '#64748B' }}>
                      {topic?.label} · {getTicketStatusLabel(ticket?.status)} · Ticket #{ticket?.id?.slice(0, 8).toUpperCase()}
                    </p>
                  </div>
                  {/* Status progression */}
                  {ticket?.status && !['resolved', 'closed'].includes(ticket.status) && (
                    <div className="flex items-center gap-1 mt-1">
                      {['open', 'active', 'pending'].map((s, i) => {
                        const statuses = ['open', 'active', 'pending'];
                        const currentIdx = statuses.indexOf(ticket.status);
                        const isActive = i <= currentIdx;
                        return (
                          <React.Fragment key={s}>
                            <div style={{
                              width: 14, height: 14, borderRadius: '50%',
                              backgroundColor: isActive ? getTicketStatusColor(s) : '#E2E8F0',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                              {isActive && <Check size={8} color="white" strokeWidth={3} />}
                            </div>
                            {i < 2 && (
                              <div style={{
                                height: 2, flex: 1,
                                backgroundColor: i < currentIdx ? getTicketStatusColor(statuses[i + 1]) : '#E2E8F0',
                                borderRadius: 1,
                              }} />
                            )}
                          </React.Fragment>
                        );
                      })}
                    </div>
                  )}
                </div>
                <button onClick={goHome}
                  className="text-[11px] font-bold flex-shrink-0 ml-2 px-2 py-1 rounded-lg transition hover:bg-white"
                  style={{ color: '#94A3B8' }}>
                  New
                </button>
              </div>

              {/* Messages */}
              <div ref={chatRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3"
                style={{ backgroundColor: '#F8FAFC' }}>

                {/* Ticket confirmed notice */}
                <div className="flex flex-col items-center gap-1 py-2 text-center">
                  <span className="text-[10px] font-bold px-3 py-1 rounded-full flex items-center gap-1"
                    style={{ backgroundColor: getTicketStatusColor(ticket?.status) + '20', color: getTicketStatusColor(ticket?.status) }}>
                    <Check size={10} strokeWidth={3} /> Ticket #{ticket?.id?.slice(0, 8).toUpperCase()} · {getTicketStatusLabel(ticket?.status)}
                  </span>
                  <p className="text-[10px]" style={{ color: '#94A3B8' }}>Chat below — we'll reply here</p>
                </div>

                {/* Chat messages (ticket + AI interleaved — sorted by _seq) */}
                {(() => {
                  // Build one flat list: all messages sorted by global seq number
                  const chatItems = chatMsgs.map((m, i) => ({
                    type: 'chat',
                    seq: m._seq !== undefined ? m._seq : i,
                    data: m,
                  }));

                  const aiItems = aiMsgs.map((m, i) => ({
                    type: 'ai',
                    seq: m._seq !== undefined ? m._seq : chatMsgs.length + i,
                    data: m,
                  }));

                  // Merge & sort by seq — this is purely deterministic
                  const allEntries = [...chatItems, ...aiItems]
                    .sort((a, b) => a.seq - b.seq);

                  const timeline = allEntries.map(entry => {
                    if (entry.type === 'chat') {
                      const m = entry.data;
                      const isUser = m.is_admin !== true && m.sender_id === user?.id;
                      return (
                        <div key={`t-${entry.seq}`} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                          {!isUser && (
                            <div className="w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0 mr-2 mt-0.5"
                              style={{ background: 'linear-gradient(135deg,#D97706,#F59E0B)' }}>
                              <Headphones size={12} color="white" />
                            </div>
                          )}
                          <div className="px-3 py-2.5 text-sm leading-relaxed"
                            style={{
                              maxWidth: '80%',
                              backgroundColor: isUser ? '#1B4332' : '#fff',
                              color: isUser ? 'white' : '#1E293B',
                              borderRadius: isUser ? '18px 18px 4px 18px' : '4px 18px 18px 18px',
                              boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
                            }}>
                            <p className="text-[10px] font-bold mb-1 opacity-60" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {isUser ? (user?.username || 'You') : (m.sender_name || 'Support Agent')}
                            </p>
                            <p>{m.message}</p>
                          </div>
                        </div>
                      );
                    } else {
                      const m = entry.data;
                      return (
                        <div key={`ai-${entry.seq}`} className="flex justify-start">
                          <div className="w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0 mr-2 mt-0.5"
                            style={{ background: 'linear-gradient(135deg,#1B4332,#2D6A4F)' }}>
                            <Bot size={12} color="white" />
                          </div>
                          <div>
                            <div className="px-3 py-2.5 text-sm leading-relaxed"
                              style={{
                                maxWidth: '80%', backgroundColor: '#fff', color: '#1E293B',
                                borderRadius: '4px 18px 18px 18px',
                                boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
                              }}>
                              <p className="text-[10px] font-bold mb-1 opacity-60">PRAQEN AI</p>
                              <Msg text={m.text} />
                            </div>
                            {/* Escalation CTA in ticket chat */}
                            {m.shouldEscalate && !aiLoading && (
                              <div className="mt-1.5 px-1">
                                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold"
                                  style={{ backgroundColor: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626' }}>
                                  <Headphones size={11} />
                                  A human agent will assist you shortly
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    }
                  });

                  // Typing indicator — always as last item in timeline
                  if (aiLoading) {
                    timeline.push(<Typing key="typing-indicator" />);
                  }

                  return timeline;
                })()}

                {/* Satisfaction rating — shown when ticket is resolved */}
                {ticket?.status === 'resolved' && !satisfactionSubmitted && (
                  <div className="flex flex-col items-center gap-2 py-3 px-4 rounded-2xl"
                    style={{ backgroundColor: '#fff', border: '1.5px solid #E2E8F0' }}>
                    <p className="text-[10px] font-bold" style={{ color: '#475569' }}>
                      How was your support experience?
                    </p>
                    <div className="flex gap-1.5">
                      {[1, 2, 3, 4, 5].map(r => (
                        <button key={r} onClick={() => submitSatisfaction(r)}
                          style={{
                            width: 36, height: 36, borderRadius: 10,
                            border: 'none', cursor: 'pointer', flexShrink: 0,
                            backgroundColor: r <= satisfactionRating ? '#F59E0B' : '#F1F5F9',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            transition: 'all 0.15s',
                          }}>
                          <Star size={r <= satisfactionRating ? 18 : 16}
                            color={r <= satisfactionRating ? 'white' : '#94A3B8'}
                            fill={r <= satisfactionRating ? 'white' : 'none'} />
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {satisfactionSubmitted && (
                  <div className="flex items-center justify-center gap-2 py-2">
                    <Smile size={14} color="#1B4332" />
                    <p className="text-[10px] font-bold" style={{ color: '#1B4332' }}>
                      Thanks for your feedback!
                    </p>
                  </div>
                )}

                <div style={{ float: 'left', clear: 'both' }} />
              </div>

              {/* Reply input */}
              <div className="flex-shrink-0 flex gap-2 items-end"
                style={{
                  padding: isMobile ? '10px 14px' : '10px 12px',
                  paddingBottom: isMobile ? 'max(12px, env(safe-area-inset-bottom))' : 10,
                  borderTop: '1.5px solid #E2E8F0', backgroundColor: '#fff',
                }}>
                <textarea ref={inputRef} value={replyText} onChange={e => setReplyText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendReply(); } }}
                  placeholder={isMobile ? 'Type a message…' : 'Type your message… (Enter to send)'}
                  rows={1}
                  style={{
                    flex: 1, padding: isMobile ? '12px 14px' : '10px 12px',
                    borderRadius: 14, fontSize: 16,
                    resize: 'none', outline: 'none', lineHeight: 1.4,
                    border: `2px solid ${replyText ? '#1B4332' : '#E2E8F0'}`,
                    maxHeight: isMobile ? 120 : 90,
                    WebkitTapHighlightColor: 'transparent',
                    fontFamily: 'inherit',
                  }} />
                <button onClick={sendReply} disabled={!replyText.trim() || replying || aiLoading}
                  style={{
                    width: isMobile ? 48 : 40, height: isMobile ? 48 : 40,
                    borderRadius: 14, border: 'none', cursor: 'pointer', flexShrink: 0,
                    background: 'linear-gradient(135deg,#1B4332,#2D6A4F)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    opacity: (!replyText.trim() || replying || aiLoading) ? 0.4 : 1,
                    WebkitTapHighlightColor: 'transparent',
                  }}>
                  {replying
                    ? <RefreshCw size={isMobile ? 18 : 15} color="white" className="animate-spin" />
                    : <Send size={isMobile ? 18 : 15} color="white" />}
                </button>
              </div>
            </>
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
