import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useRates } from '../contexts/RatesContext';
import { supabase } from '../lib/supabaseClient';
import {
  Copy, Bitcoin, RefreshCw, CheckCircle,
  ArrowDownLeft, ArrowUpRight, Shield, AlertTriangle,
  Clock, Eye, EyeOff, Zap, Download, Send, ArrowLeftRight,
  ChevronRight, ChevronDown, X, Wallet, Users, Search,
  Link2, DollarSign, Ban, Lock, Mail, Check, Gift,
  Flame, Smartphone, Landmark,
} from 'lucide-react';
import { toast } from 'react-toastify';
import { QRCodeSVG } from 'qrcode.react';
import { copyToClipboard } from '../utils/clipboard';
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const C = {
  forest: '#1B4332', green: '#2D6A4F', mint: '#40916C', sage: '#52B788',
  gold: '#F4A422', mist: '#F0FAF5',
  g50: '#F8FAFC', g100: '#F1F5F9', g200: '#E2E8F0',
  g400: '#94A3B8', g500: '#64748B', g600: '#475569', g700: '#334155', g800: '#1E293B',
  success: '#10B981', danger: '#EF4444', warn: '#F59E0B', paid: '#3B82F6',
};

const authH  = () => { const t = localStorage.getItem('token'); return t ? { Authorization: `Bearer ${t}` } : {}; };
const fmt    = (n, d = 8) => parseFloat(n || 0).toFixed(d);
const fmtUsd = n => `$${parseFloat(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtAge = d => {
  if (!d) return '—';
  const s = (Date.now() - new Date(d)) / 1000;
  if (s < 60)    return 'Just now';
  if (s < 3600)  return `${~~(s / 60)}m ago`;
  if (s < 86400) return `${~~(s / 3600)}h ago`;
  return `${~~(s / 86400)}d ago`;
};

const fmtDate = d => {
  if (!d) return '—';
  const dt = new Date(d);
  const date = dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const time = dt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  return { date, time };
};

// ─── Withdraw Modal ────────────────────────────────────────────────────────────
function WithdrawModal({ balance, btcPrice, onClose, onSend, kycStatus, twoFactorEnabled, onSwitchToInternal }) {
  const [address,   setAddress]   = useState('');
  const [amount,    setAmount]    = useState('');
  const [usdAmount, setUsdAmount] = useState('');
  const [inputMode, setInputMode] = useState('btc');
  const [confirm,   setConfirm]   = useState(false);
  const [sending,   setSending]   = useState(false);
  // 2FA step
  const [step,       setStep]       = useState('form'); // 'form' | 'code'
  const [codeInput,  setCodeInput]  = useState('');
  const [sending2FA, setSending2FA] = useState(false);
  const [riskyAttempt, setRiskyAttempt] = useState(false); // true after first risky-wallet warning

  const price  = btcPrice || 88000;

  const btcAmt = inputMode === 'usd'
    ? parseFloat((parseFloat(usdAmount || 0) / price).toFixed(8))
    : parseFloat(amount || 0);

  // Tiered withdrawal fee — mirrors backend calcWithdrawalFee()
  // Use raw USD input when in USD mode to avoid BTC round-trip floating-point boundary errors
  const calcFeeByUsd = (usd) => {
    if (usd <= 0)    return { feeUsd: 0,  feeBtc: 0,            label: '' };
    if (usd < 50)    return { feeUsd: 5,  feeBtc: 5  / price,   label: '$5 flat fee' };
    if (usd < 100)   return { feeUsd: 10, feeBtc: 10 / price,   label: '$10 flat fee' };
    if (usd < 250)   return { feeUsd: 15, feeBtc: 15 / price,   label: '$15 flat fee' };
    if (usd < 500)   return { feeUsd: 25, feeBtc: 25 / price,   label: '$25 flat fee' };
    return { feeUsd: usd * 0.05, feeBtc: (usd * 0.05) / price,  label: '5% fee' };
  };
  const calcFee = (btc) => {
    // Round to nearest cent before tier comparison to avoid floating-point boundary mismatches
    const usd = Math.round(btc * price * 100) / 100;
    return calcFeeByUsd(usd);
  };
  const { feeUsd, feeBtc: fee, label: feeLabel } = inputMode === 'usd'
    ? calcFeeByUsd(parseFloat(usdAmount || 0))
    : calcFee(btcAmt);
  const total     = btcAmt + fee;
  const totalUsd  = total * price;
  const hasEnough = total <= parseFloat(balance || 0);

  const isMainnetAddr = (addr) => {
    if (!addr || addr.length < 26) return false;
    if (/^tb1[a-z0-9]{25,87}$/.test(addr)) return false;
    if (/^[mn][a-zA-Z0-9]{25,34}$/.test(addr)) return false;
    return /^(bc1[a-z0-9]{25,87}|[13][a-zA-HJ-NP-Z1-9]{25,34})$/.test(addr);
  };
  const addrOk = isMainnetAddr(address.trim());
  const valid  = addrOk && btcAmt > 0 && hasEnough;

  const switchMode = (mode) => { setInputMode(mode); setAmount(''); setUsdAmount(''); };

  const requestCode = async () => {
    if (!valid) return;
    setSending2FA(true);
    try {
      const t = localStorage.getItem('token');
      await axios.post(`${API_URL}/auth/send-action-code`, { action: 'send_btc' },
        { headers: t ? { Authorization: `Bearer ${t}` } : {} });
      setCodeInput('');
      setStep('code');
      toast.success('Security code sent! Check your email inbox.', { autoClose: 5000 });
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Could not send security code. Please try again.');
    } finally {
      setSending2FA(false);
    }
  };

  const handleSend = async () => {
    if (!codeInput || codeInput.length !== 6) { toast.error('Please enter the 6-digit code sent to your email.'); return; }
    setSending(true);
    try {
      if (riskyAttempt) {
        toast.info('Since you still want to send, you can proceed. Once sent, PRAQEN is not responsible for any loss.', { autoClose: 7000 });
      }
      await onSend(address.trim(), btcAmt, codeInput, riskyAttempt);
      toast.success('BTC Sent Successfully! Your transaction is on its way.', { autoClose: 6000 });
      onClose();
    } catch (e) {
      const msg = e?.response?.data?.error || '';
      if (msg.toLowerCase().includes('risky') || msg.toLowerCase().includes('blockchain issue')) {
        setRiskyAttempt(true);
        toast.warning(msg, { autoClose: 10000 });
      } else if (msg) {
        toast.error(msg, { autoClose: 8000 });
      } else {
        toast.error('Something went wrong. Your funds are safe — please try again.');
      }
    } finally {
      setSending(false);
    }
  };

  const fmtUsdVal = n => `$${parseFloat(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="fixed inset-0 z-[1100] flex items-end md:items-center justify-center p-0 md:p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(6px)' }}>
      <div className="bg-white w-full md:max-w-md rounded-t-3xl md:rounded-3xl overflow-hidden shadow-2xl"
        style={{ marginBottom: 'calc(60px + env(safe-area-inset-bottom, 0px))' }}>

        {/* ── Header ── */}
        <div style={{ background: 'linear-gradient(135deg, #1B4332 0%, #2D6A4F 100%)', padding: '20px 20px 18px' }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)', boxShadow: '0 4px 14px rgba(239,68,68,0.5)' }}>
                <Send size={18} color="#fff" strokeWidth={2.2} />
              </div>
              <div>
                <h2 className="font-black text-base text-white">Send Bitcoin</h2>
                <p className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>On-chain · ~10 min · blockchain fee applies</p>
              </div>
            </div>
            <button onClick={onClose}
              className="w-8 h-8 rounded-xl flex items-center justify-center transition"
              style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}>
              <X size={15} color="rgba(255,255,255,0.7)" />
            </button>
          </div>
        </div>

        <div className="p-5 overflow-y-auto" style={{ maxHeight: '75vh' }}>

          {/* ── Destination toggle: external wallet (this modal) vs PRAQEN user ── */}
          <div className="flex rounded-2xl overflow-hidden mb-4" style={{ border: `1.5px solid ${C.g200}` }}>
            <div className="flex-1 py-3 text-center font-black text-xs"
              style={{ background: 'linear-gradient(135deg, #1a1a2e, #16213e)', color: '#fff' }}>
              External Wallet
            </div>
            <button onClick={onSwitchToInternal}
              className="flex-1 py-3 text-center font-black text-xs transition hover:bg-gray-50"
              style={{ color: C.g500 }}>
              PRAQEN User
            </button>
          </div>

          {/* ── Temporary notice: external sends delayed while blockchain is under maintenance ── */}
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl mb-4" style={{ backgroundColor: '#FFFBEB', border: '1px solid #FDE68A' }}>
            <AlertTriangle size={13} style={{ color: '#D97706', flexShrink: 0 }} />
            <p className="text-xs font-semibold" style={{ color: '#92400E' }}>
              External wallet sending is temporarily delayed — blockchain is under maintenance. Send to a PRAQEN user instead or trade in our P2P market for now. Sorry for the inconvenience, we're fixing it soon.
            </p>
          </div>

          {/* ── KYC gate ── */}
          {kycStatus && !(kycStatus.email && kycStatus.phone && kycStatus.kyc) ? (
            <div className="space-y-4">
              <div className="flex flex-col items-center text-center py-4">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-3"
                  style={{ background: 'linear-gradient(135deg, #f59e0b22, #f59e0b11)', border: '1px solid #f59e0b30' }}>
                  <Shield size={30} style={{ color: C.warn }} />
                </div>
                <h3 className="font-black text-base mb-1" style={{ color: C.g800 }}>Verification Required</h3>
                <p className="text-sm" style={{ color: C.g500 }}>
                  Complete all 3 steps to send Bitcoin to an external wallet.
                </p>
              </div>
              <div className="space-y-2">
                {[
                  { label: 'Email Verified',    done: kycStatus.email, step: 1 },
                  { label: 'Phone Verified',    done: kycStatus.phone, step: 2 },
                  { label: 'ID / KYC Verified', done: kycStatus.kyc,   step: 3 },
                ].map(({ label, done, step }) => (
                  <div key={step} className="flex items-center gap-3 p-3 rounded-2xl"
                    style={{ backgroundColor: done ? `${C.success}08` : `${C.warn}08`, border: `1px solid ${done ? C.success : C.warn}30` }}>
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: done ? `${C.success}20` : `${C.warn}20` }}>
                      {done
                        ? <CheckCircle size={15} style={{ color: C.success }} />
                        : <span className="text-xs font-black" style={{ color: C.warn }}>{step}</span>}
                    </div>
                    <p className="text-sm font-bold flex-1" style={{ color: done ? C.success : C.g700 }}>{label}</p>
                    {done
                      ? <CheckCircle size={14} style={{ color: C.success }} />
                      : <span className="text-xs font-black px-2 py-0.5 rounded-full"
                          style={{ backgroundColor: `${C.warn}20`, color: C.warn }}>Pending</span>}
                  </div>
                ))}
              </div>
              <a href="/profile" onClick={onClose}
                className="w-full py-3.5 rounded-2xl text-white font-black text-sm flex items-center justify-center gap-2 hover:opacity-90 transition"
                style={{ background: 'linear-gradient(135deg, #10b981, #059669)', boxShadow: '0 4px 14px rgba(16,185,129,0.35)' }}>
                <Shield size={15} /> Complete Verification Now
              </a>
            </div>
          ) : (
          <div className="space-y-4">

            {/* ── Balance pill ── */}
            <div className="flex items-center justify-between px-4 py-3 rounded-2xl"
              style={{ background: 'linear-gradient(135deg, #f0fdf4, #dcfce7)', border: '1px solid #bbf7d0' }}>
              <div>
                <p className="text-xs font-bold mb-0.5" style={{ color: '#166534' }}>Available Balance</p>
                <p className="font-black text-xl" style={{ color: '#15803d' }}>₿ {fmt(balance)}</p>
              </div>
              <div className="text-right">
                <p className="text-xs font-bold" style={{ color: '#166534' }}>≈</p>
                <p className="font-black text-base" style={{ color: '#166534' }}>{fmtUsdVal(parseFloat(balance) * price)}</p>
              </div>
            </div>

            {/* ── Address ── */}
            <div>
              <label className="block text-xs font-black mb-2" style={{ color: C.g700 }}>
                Recipient Bitcoin Address
              </label>
              <div className="relative">
                <input type="text" value={address} onChange={e => setAddress(e.target.value)}
                  placeholder="bc1q… or 1… or 3… (mainnet only)"
                  className="w-full px-4 py-3.5 text-sm rounded-2xl focus:outline-none font-mono transition"
                  style={{
                    border: `2px solid ${!address ? C.g200 : addrOk ? '#10b981' : '#ef4444'}`,
                    backgroundColor: !address ? '#fafafa' : addrOk ? '#f0fdf4' : '#fff5f5',
                    color: C.g800,
                    paddingRight: address ? '40px' : '16px',
                  }} />
                {address && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    {addrOk
                      ? <CheckCircle size={16} style={{ color: '#10b981' }} />
                      : <AlertTriangle size={16} style={{ color: '#ef4444' }} />}
                  </div>
                )}
              </div>
              {address.length > 5 && !addrOk && (
                <p className="text-xs mt-1.5 font-semibold flex items-center gap-1" style={{ color: '#ef4444' }}>
                  <AlertTriangle size={11} /> Mainnet only — bc1…, 1…, or 3… Testnet not accepted.
                </p>
              )}
              {addrOk && (
                <p className="text-xs mt-1.5 font-semibold flex items-center gap-1" style={{ color: '#10b981' }}>
                  <CheckCircle size={11} /> Valid Bitcoin mainnet address
                </p>
              )}
            </div>

            {/* ── Amount ── */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-black" style={{ color: C.g700 }}>Amount</label>
                <div className="flex rounded-xl overflow-hidden" style={{ border: `1.5px solid ${C.g200}` }}>
                  {['btc', 'usd'].map(mode => (
                    <button key={mode} onClick={() => switchMode(mode)}
                      className="px-3 py-1.5 text-xs font-black transition"
                      style={{
                        background: inputMode === mode ? 'linear-gradient(135deg, #1a1a2e, #16213e)' : 'transparent',
                        color: inputMode === mode ? '#fff' : C.g500,
                      }}>
                      {mode === 'btc' ? '₿ BTC' : '$ USD'}
                    </button>
                  ))}
                </div>
              </div>

              {inputMode === 'btc' ? (
                <div>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-base" style={{ color: C.g400 }}>₿</span>
                    <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
                      placeholder="0.00000000" step="0.00000001"
                      className="w-full pl-8 pr-16 py-3.5 text-sm rounded-2xl focus:outline-none font-mono transition"
                      style={{
                        border: `2px solid ${!amount ? C.g200 : hasEnough ? '#10b981' : '#ef4444'}`,
                        backgroundColor: !amount ? '#fafafa' : hasEnough ? '#f0fdf4' : '#fff5f5',
                      }} />
                    <button onClick={() => setAmount((parseFloat(balance || 0) * 0.999).toFixed(8))}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-black px-2.5 py-1 rounded-xl transition"
                      style={{ background: 'linear-gradient(135deg, #10b981, #059669)', color: '#fff', boxShadow: '0 2px 8px rgba(16,185,129,0.3)' }}>
                      MAX
                    </button>
                  </div>
                  {btcAmt > 0 && (
                    <p className="text-xs mt-1.5 font-bold" style={{ color: C.g400 }}>≈ {fmtUsdVal(btcAmt * price)} USD</p>
                  )}
                </div>
              ) : (
                <div>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-base" style={{ color: C.g400 }}>$</span>
                    <input type="number" value={usdAmount} onChange={e => setUsdAmount(e.target.value)}
                      placeholder="0.00" min="0"
                      className="w-full pl-8 pr-4 py-3.5 text-sm rounded-2xl focus:outline-none transition"
                      style={{
                        border: `2px solid ${!usdAmount ? C.g200 : hasEnough ? '#10b981' : '#ef4444'}`,
                        backgroundColor: !usdAmount ? '#fafafa' : hasEnough ? '#f0fdf4' : '#fff5f5',
                      }} />
                  </div>
                  {parseFloat(usdAmount) > 0 && (
                    <p className="text-xs mt-1.5 font-bold" style={{ color: '#10b981' }}>≈ ₿ {btcAmt.toFixed(8)}</p>
                  )}
                </div>
              )}

              {btcAmt > 0 && !hasEnough && (
                <div className="flex items-center gap-1.5 mt-2 px-3 py-2 rounded-xl" style={{ backgroundColor: '#fff5f5', border: '1px solid #fecaca' }}>
                  <AlertTriangle size={12} style={{ color: '#ef4444', flexShrink: 0 }} />
                  <p className="text-xs font-semibold" style={{ color: '#dc2626' }}>
                    Insufficient balance — need ₿ {fmt(total)} ({fmtUsdVal(totalUsd)}) incl. fee
                  </p>
                </div>
              )}
            </div>

            {/* ── Breakdown ── */}
            {btcAmt > 0 && (
              <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid #e2e8f0' }}>
                {[
                  { label: 'You send',                             btc: btcAmt, usd: btcAmt * price, icon: '→' },
                  { label: `Blockchain fee (${feeLabel || '—'})`,  btc: fee,    usd: feeUsd,         icon: <Link2 size={11} /> },
                  { label: 'Total deducted',                       btc: total,  usd: totalUsd,        bold: true },
                ].map(({ label, btc, usd, bold, icon }, i, arr) => (
                  <div key={label}
                    className="flex justify-between items-center px-4 py-2.5"
                    style={{
                      backgroundColor: bold ? '#f8fafc' : '#fff',
                      borderTop: i > 0 ? '1px solid #f1f5f9' : 'none',
                      borderTop: bold ? '2px solid #e2e8f0' : i > 0 ? '1px solid #f1f5f9' : 'none',
                    }}>
                    <span className="text-xs font-semibold flex items-center gap-1.5" style={{ color: bold ? C.g700 : C.g500 }}>
                      {icon && <span>{icon}</span>}{label}
                    </span>
                    <div className="text-right">
                      <span className={`text-xs ${bold ? 'font-black' : 'font-bold'}`}
                        style={{ color: bold ? '#1e293b' : C.g700 }}>₿ {fmt(btc)}</span>
                      <span className="ml-1.5 text-xs font-medium" style={{ color: C.g400 }}>({fmtUsdVal(usd)})</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ── Confirm checkbox ── */}
            <label className="flex items-start gap-3 cursor-pointer p-3 rounded-2xl transition"
              style={{ backgroundColor: confirm ? '#f0fdf4' : '#fafafa', border: `1.5px solid ${confirm ? '#bbf7d0' : C.g200}` }}>
              <div className="mt-0.5 w-4 h-4 rounded-md flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: confirm ? '#10b981' : '#fff', border: `2px solid ${confirm ? '#10b981' : C.g300}` }}>
                {confirm && <CheckCircle size={10} color="#fff" strokeWidth={3} />}
              </div>
              <input type="checkbox" checked={confirm} onChange={e => setConfirm(e.target.checked)} className="sr-only" />
              <p className="text-xs font-semibold leading-relaxed" style={{ color: confirm ? '#166534' : C.g600 }}>
                I confirm this address is correct. Bitcoin transactions are irreversible and cannot be undone.
              </p>
            </label>

            {/* ── Step 1: Send code ── */}
            {step === 'form' && (
              <div className="space-y-3">
                {!twoFactorEnabled ? (
                  <div className="p-4 rounded-2xl text-center" style={{backgroundColor: '#fffbeb', border: '1px solid #fde68a'}}>
                    <AlertTriangle size={24} style={{color: '#d97706', margin: '0 auto 8px', display: 'block'}} />
                    <p className="font-bold text-sm" style={{color: '#92400e'}}>Enable Two-Factor Authentication</p>
                    <p className="text-xs mt-1" style={{color: '#92400e'}}>You must enable 2FA before sending Bitcoin. Go to Settings → Security to enable it.</p>
                    <button onClick={() => window.location.href = '/settings'}
                      className="mt-3 px-5 py-2.5 rounded-xl text-white font-bold text-xs transition hover:opacity-90"
                      style={{backgroundColor: '#2D6A4F'}}>
                      Go to Settings
                    </button>
                  </div>
                ) : (
                  <>
                    <button onClick={requestCode} disabled={!valid || !confirm || sending2FA}
                      className="w-full py-4 rounded-2xl text-white font-black text-sm flex items-center justify-center gap-2 transition active:scale-98 disabled:opacity-40"
                      style={{ background: (!valid || !confirm || sending2FA) ? '#94a3b8' : 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)', boxShadow: (!valid || !confirm) ? 'none' : '0 6px 20px rgba(239,68,68,0.4)' }}>
                      {sending2FA
                        ? <><RefreshCw size={15} className="animate-spin" /> Sending security code…</>
                        : <><Shield size={15} /> Get Security Code &amp; Continue</>}
                    </button>
                    <div className="flex items-center gap-2.5 px-4 py-3 rounded-2xl"
                      style={{ backgroundColor: '#fffbeb', border: '1px solid #fde68a' }}>
                      <AlertTriangle size={13} style={{ color: '#d97706', flexShrink: 0 }} />
                      <p className="text-xs font-semibold" style={{ color: '#92400e' }}>
                        A 6-digit security code will be emailed to you to confirm this withdrawal.
                      </p>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ── Step 2: Enter code ── */}
            {step === 'code' && (
              <div className="space-y-3">
                <div className="flex flex-col items-center text-center px-4 py-4 rounded-2xl"
                  style={{ background: 'linear-gradient(135deg, #f0fdf4, #dcfce7)', border: '1px solid #bbf7d0' }}>
                  <div className="w-10 h-10 rounded-2xl flex items-center justify-center mb-2"
                    style={{ background: 'linear-gradient(135deg, #10b981, #059669)', boxShadow: '0 4px 12px rgba(16,185,129,0.35)' }}>
                    <Shield size={18} color="#fff" />
                  </div>
                  <p className="font-black text-sm" style={{ color: '#166534' }}>Security Code Sent</p>
                  <p className="text-xs mt-0.5" style={{ color: '#15803d' }}>
                    Enter the 6-digit code emailed to you to confirm sending ₿{fmt(btcAmt)}
                  </p>
                </div>

                <input
                  type="text" inputMode="numeric" value={codeInput} autoFocus
                  onChange={e => setCodeInput(e.target.value.replace(/\D/g,'').slice(0,6))}
                  placeholder="0  0  0  0  0  0"
                  className="w-full text-center py-4 rounded-2xl font-mono tracking-[0.5em] focus:outline-none transition"
                  style={{
                    fontSize: 28, fontWeight: 900,
                    border: `2.5px solid ${codeInput.length === 6 ? '#10b981' : C.g200}`,
                    backgroundColor: codeInput.length === 6 ? '#f0fdf4' : '#fafafa',
                    color: C.g800,
                    letterSpacing: '0.5em',
                  }}
                  maxLength={6}
                />

                <p className="text-xs text-center" style={{ color: C.g400 }}>
                  Didn't receive it?{' '}
                  <button onClick={requestCode} disabled={sending2FA}
                    className="font-black underline disabled:opacity-50 transition"
                    style={{ color: '#10b981' }}>
                    {sending2FA ? 'Sending…' : 'Resend code'}
                  </button>
                </p>

                <div className="flex gap-3">
                  <button onClick={() => { setStep('form'); setCodeInput(''); }}
                    className="flex-1 py-3.5 rounded-2xl border font-bold text-sm hover:bg-gray-50 transition"
                    style={{ borderColor: C.g200, color: C.g600 }}>
                    ← Back
                  </button>
                  <button onClick={handleSend} disabled={codeInput.length !== 6 || sending}
                    className="flex-1 py-3.5 rounded-2xl text-white font-black text-sm transition disabled:opacity-40"
                    style={{
                      background: codeInput.length === 6 && !sending ? 'linear-gradient(135deg, #ef4444, #dc2626)' : '#94a3b8',
                      boxShadow: codeInput.length === 6 && !sending ? '0 6px 20px rgba(239,68,68,0.4)' : 'none',
                    }}>
                    {sending
                      ? <span className="flex items-center justify-center gap-2"><RefreshCw size={15} className="animate-spin" /> Sending…</span>
                      : <span className="flex items-center justify-center gap-2"><Send size={15} /> Confirm Send</span>}
                  </button>
                </div>
              </div>
            )}
          </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Receive Modal ─────────────────────────────────────────────────────────────
function ReceiveModal({ address, network, onClose, onGenerate, checking, onCheckDeposits }) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    copyToClipboard(address, 'Address copied!')
      .then((ok) => { if (ok) setCopied(true); setTimeout(() => setCopied(false), 3000); });
  };

  const explorerUrl = `https://mempool.space/address/${address}`;

  return (
    <div className="fixed inset-0 z-[1100] flex items-end md:items-center justify-center p-0 md:p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }}>
      <div className="bg-white w-full md:max-w-sm rounded-t-2xl md:rounded-2xl overflow-hidden shadow-2xl">
        <div className="px-5 py-4 border-b flex items-center justify-between" style={{ borderColor: C.g100 }}>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${C.success}15` }}>
              <ArrowDownLeft size={15} style={{ color: C.success }} />
            </div>
            <h2 className="font-black text-sm" style={{ color: C.g800 }}>Deposit Bitcoin</h2>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-xl flex items-center justify-center hover:bg-gray-100">
            <X size={14} style={{ color: C.g500 }} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {address ? (
            <>
              <p className="text-xs text-gray-500">Send BTC to your unique address. Credited after 1 confirmation (~10 min).</p>

              <div className="flex justify-center p-4 rounded-xl border" style={{ borderColor: C.g200, backgroundColor: '#fff' }}>
                <QRCodeSVG value={address} size={168} level="M" includeMargin={false} />
              </div>

              <div>
                <label className="block text-xs font-bold mb-1.5 text-gray-600">Your Bitcoin Address</label>
                <div className="p-3 rounded-xl border font-mono text-xs break-all"
                  style={{ borderColor: C.g200, backgroundColor: C.g50, color: C.g700 }}>
                  {address}
                </div>
              </div>

              <button onClick={copy}
                className="w-full py-3 rounded-xl text-white font-black text-sm flex items-center justify-center gap-2 hover:opacity-90"
                style={{ backgroundColor: copied ? C.success : C.green }}>
                {copied ? <><CheckCircle size={15} /> Copied!</> : <><Copy size={15} /> Copy Address</>}
              </button>

              <button onClick={onCheckDeposits} disabled={checking}
                className="w-full py-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 hover:bg-gray-50 transition"
                style={{ borderColor: C.g200, color: C.g600 }}>
                {checking
                  ? <><RefreshCw size={12} className="animate-spin" /> Checking mempool…</>
                  : <><Zap size={12} style={{ color: C.gold }} /> Check for New Deposits</>}
              </button>

              <a href={explorerUrl} target="_blank" rel="noopener noreferrer"
                className="w-full py-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 hover:bg-gray-50"
                style={{ borderColor: C.g200, color: C.g600 }}>
                View on Mempool Explorer ↗
              </a>

              <div className="flex items-start gap-2 p-3 rounded-xl" style={{ backgroundColor: '#EFF6FF', border: `1px solid ${C.paid}20` }}>
                <Shield size={12} style={{ color: C.paid, flexShrink: 0, marginTop: 1 }} />
                <p className="text-xs font-semibold text-blue-700">
                  Only send Bitcoin (BTC) to this address. Other coins will be lost permanently.
                </p>
              </div>
            </>
          ) : (
            <div className="text-center py-6">
              <Bitcoin size={36} className="mx-auto mb-3" style={{ color: C.g300 }} />
              <p className="text-sm font-bold text-gray-600 mb-1">No address generated yet</p>
              <p className="text-xs text-gray-400 mb-4">Generate your unique Bitcoin deposit address</p>
              <button onClick={onGenerate}
                className="px-6 py-2.5 rounded-xl text-white font-black text-sm hover:opacity-90"
                style={{ backgroundColor: C.green }}>
                <Bitcoin size={14} className="inline mr-1.5" /> Generate My Address
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const normalizeNotes = (notes) => {
  if (!notes) return notes;
  if (/^Queued withdrawal/i.test(notes)) {
    const feeMatch = notes.match(/₿([\d.]+)\)/);
    const feePart  = feeMatch ? ` Fee (₿${feeMatch[1]}) held.` : '';
    return `User confirmed twice before sending. Warned of risky wallet and proceeded.${feePart} PRAQEN is not responsible for any loss from this transaction.`;
  }
  return notes;
};

// ─── Transaction Receipt Modal ─────────────────────────────────────────────────
function TxReceiptModal({ tx, onClose, onRepeat, btcPrice }) {
  const type       = (tx.type || '').toUpperCase();
  const isSend     = type === 'WITHDRAWAL' || type === 'SEND' || type === 'TRANSFER_OUT';
  const isInternal = type === 'TRANSFER_IN' || type === 'TRANSFER_OUT';
  const isTrade    = type === 'TRADE' || type === 'ESCROW';
  const isOnChain  = type === 'WITHDRAWAL' || type === 'SEND' || type === 'DEPOSIT';
  const isPending  = tx.status === 'PENDING' || tx.status === 'pending';
  const color      = isSend ? C.danger : C.success;

  // Extract counterpart username from notes for internal transfers
  const counterpartMatch = isInternal && tx.notes
    ? (tx.notes.match(/from @(\S+)/i) || tx.notes.match(/→ @(\S+)/i) || tx.notes.match(/to @(\S+)/i))
    : null;
  const counterpart = counterpartMatch ? counterpartMatch[1].replace(/\s*[·\-].*$/, '').trim() : null;

  const label = type === 'TRANSFER_OUT' ? 'PRAQEN Send'
    : type === 'TRANSFER_IN'  ? 'PRAQEN Received'
    : type === 'WITHDRAWAL'   ? 'Bitcoin Sent'
    : type === 'DEPOSIT'      ? 'Bitcoin Received'
    : isTrade                 ? 'Trade'
    : isSend                  ? 'Sent'
    : 'Received';

  const walletType = isInternal ? 'PRAQEN Internal Transfer'
    : isTrade       ? 'PRAQEN Escrow'
    : 'On-chain Bitcoin';

  const txHash = tx.tx_hash || tx.txHash;
  const fullDate = tx.created_at
    ? new Date(tx.created_at).toLocaleString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
    : '—';
  const refId = tx.id ? `#${String(tx.id).slice(0, 16).toUpperCase()}` : '—';

  const amountBtc = Math.abs(tx.amount_btc || 0);
  const price = btcPrice || 88000;
  const amountUsd = (amountBtc * price).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const rows = [
    { label: 'Type',         value: label },
    { label: 'Wallet',       value: walletType },
    { label: 'Amount',       value: `${isSend ? '−' : '+'}₿${fmt(amountBtc)} (≈ ${amountUsd})`, colored: true },
    tx.fee_btc ? { label: 'Fee',         value: `₿${fmt(tx.fee_btc)}` }       : null,
    { label: 'Status',       value: isPending ? 'Pending' : 'Confirmed',        statusBadge: true },
    { label: 'Date & Time',  value: fullDate },
    tx.to_address   ? { label: 'To Address',   value: tx.to_address,   mono: true } : null,
    tx.from_address ? { label: 'From Address', value: tx.from_address, mono: true } : null,
    txHash          ? { label: 'TX Hash',      value: txHash, mono: true,
                        link: isInternal ? null : `https://mempool.space/tx/${txHash}` } : null,
    tx.notes        ? { label: 'Notes',        value: normalizeNotes(tx.notes), isNotes: true } : null,
    { label: 'Reference',    value: refId, mono: true },
  ].filter(Boolean);

  return (
    <div className="fixed inset-0 z-[1100] flex items-end md:items-center justify-center p-0 md:p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(6px)' }}>
      <div className="bg-white w-full md:max-w-sm rounded-t-3xl md:rounded-3xl overflow-hidden shadow-2xl">

        {/* Receipt header — green gradient (screenshot branding) */}
        <div className="relative" style={{ background: `linear-gradient(135deg,${C.forest} 0%,${C.green} 100%)` }}>
          <div className="px-5 pt-5 pb-10 text-center">
            {/* Close button */}
            <button onClick={onClose}
              className="absolute top-4 right-4 w-7 h-7 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}>
              <X size={13} className="text-white" />
            </button>

            <p className="text-white/50 text-xs font-black tracking-widest mb-0.5">PRAQEN</p>
            <p className="text-white font-black text-base">Transaction Receipt</p>

            <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mt-4"
              style={{
                backgroundColor: isPending ? 'rgba(245,158,11,0.25)' : isSend ? 'rgba(239,68,68,0.25)' : 'rgba(16,185,129,0.25)',
                border: `2px solid ${isPending ? C.warn : isSend ? C.danger : C.success}50`,
              }}>
              {isPending
                ? <Clock size={24} style={{ color: C.warn }} />
                : isSend
                  ? <ArrowUpRight size={24} style={{ color: C.danger }} />
                  : <ArrowDownLeft size={24} style={{ color: C.success }} />}
            </div>

            <p className="text-white font-black text-2xl mt-3">
              {isSend ? '−' : '+'}₿{fmt(amountBtc)}
            </p>
            <p className="font-bold text-sm mt-0.5" style={{ color: 'rgba(255,255,255,0.65)' }}>
              ≈ {isSend ? '−' : '+'}{amountUsd}
            </p>
            {counterpart && (
              <p className="text-white font-black text-sm mt-1 tracking-wide">
                {type === 'TRANSFER_IN' ? 'From' : 'To'}{' '}
                <span style={{ color: '#6EE7B7' }}>@{counterpart}</span>
              </p>
            )}
            <span className="text-xs font-black px-3 py-1 rounded-full mt-2 inline-flex items-center gap-1"
              style={{
                backgroundColor: isPending ? 'rgba(245,158,11,0.3)' : 'rgba(16,185,129,0.3)',
                color: isPending ? '#FDE68A' : '#6EE7B7',
              }}>
              {isPending ? <><Clock size={11} /> PENDING</> : <><CheckCircle size={11} /> CONFIRMED</>}
            </span>
          </div>
          {/* Wave cut */}
          <div className="h-5 bg-white" style={{ borderRadius: '50% 50% 0 0 / 100% 100% 0 0', marginTop: -1 }} />
        </div>

        {/* Receipt rows */}
        <div className="px-5 pb-2 overflow-y-auto" style={{ maxHeight: '40vh' }}>
          <div className="border-t-2 border-dashed mb-3" style={{ borderColor: C.g200 }} />
          {rows.map(({ label, value, colored, mono, link, statusBadge, isNotes }) => {
            if (isNotes) {
              const isRisky = /confirmed twice|risky wallet/i.test(value);
              const feeMatch = value.match(/Fee \(₿([\d.]+)\)/);
              const feeAmt = feeMatch ? feeMatch[1] : null;
              return (
                <div key={label} className="py-3 border-b" style={{ borderColor: C.g100 }}>
                  <p className="text-xs font-black mb-2" style={{ color: C.g400 }}>Notes</p>
                  {isRisky ? (
                    <div className="rounded-2xl overflow-hidden border" style={{ borderColor: `${C.warn}40` }}>
                      {/* Header strip */}
                      <div className="px-3 py-2 flex items-center gap-2"
                        style={{ backgroundColor: `${C.warn}18` }}>
                        <AlertTriangle size={13} style={{ color: C.warn, flexShrink: 0 }} />
                        <p className="text-xs font-black" style={{ color: C.warn }}>Risky Wallet Warning</p>
                      </div>
                      {/* Bullet points */}
                      <div className="px-3 py-3 space-y-2.5" style={{ backgroundColor: '#FFFDF5' }}>
                        {[
                          { icon: <CheckCircle size={13} style={{ color: C.success }} />, text: 'User confirmed twice before sending' },
                          { icon: <AlertTriangle size={13} style={{ color: C.warn }} />, text: 'Warned this is a risky wallet and chose to proceed' },
                          feeAmt ? { icon: <DollarSign size={13} style={{ color: C.g500 }} />, text: `Fee of ₿${feeAmt} held by PRAQEN` } : null,
                          { icon: <Ban size={13} style={{ color: '#ef4444' }} />, text: 'PRAQEN is not responsible for any loss from this transaction' },
                        ].filter(Boolean).map(({ icon, text }) => (
                          <div key={text} className="flex items-start gap-2">
                            <span className="flex-shrink-0 mt-0.5">{icon}</span>
                            <p className="text-xs font-semibold leading-relaxed" style={{ color: C.g700 }}>{text}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs font-semibold leading-relaxed" style={{ color: C.g700 }}>{value}</p>
                  )}
                </div>
              );
            }
            return (
            <div key={label} className="flex justify-between items-center py-2 border-b last:border-0"
              style={{ borderColor: C.g100 }}>
              <p className="text-xs font-bold flex-shrink-0 mr-4" style={{ color: C.g400 }}>{label}</p>
              {link ? (
                <a href={link} target="_blank" rel="noopener noreferrer"
                  className="text-xs font-mono hover:underline text-right"
                  style={{ color: C.paid }}>
                  {value.slice(0, 18)}…↗
                </a>
              ) : statusBadge ? (
                <span className="text-xs font-black px-2 py-0.5 rounded-full"
                  style={{
                    backgroundColor: value === 'Pending' ? `${C.warn}20` : `${C.success}15`,
                    color: value === 'Pending' ? C.warn : C.success,
                  }}>
                  {value}
                </span>
              ) : (
                <p className={`text-xs text-right break-all ${mono ? 'font-mono' : 'font-semibold'}`}
                  style={{ color: colored ? color : C.g700, maxWidth: '60%' }}>
                  {mono && value.length > 22 ? `${value.slice(0, 22)}…` : value}
                </p>
              )}
            </div>
            );
          })}
          {isOnChain && (
            <div className="border-t-2 border-dashed mt-3 pt-3 text-center">
              <p className="text-xs font-semibold flex items-center justify-center gap-1.5" style={{ color: C.g400 }}>
                <Link2 size={12} /> Blockchain External Wallet Send-Out
              </p>
              <p className="text-xs mt-1 font-semibold flex items-start justify-center gap-1.5" style={{ color: C.warn }}>
                <AlertTriangle size={12} className="flex-shrink-0 mt-0.5" /> The blockchain network is responsible for this external wallet transaction. PRAQEN is not liable once funds leave to an external address.
              </p>
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="px-5 pt-3 pb-5 space-y-2">
          {txHash && isOnChain && (
            <a href={`https://mempool.space/tx/${txHash}`} target="_blank" rel="noopener noreferrer"
              className="w-full py-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 hover:bg-gray-50"
              style={{ borderColor: C.g200, color: C.g600 }}>
              View on Mempool Explorer ↗
            </a>
          )}
          {isInternal && counterpart && onRepeat && (
            <button onClick={() => onRepeat(counterpart)}
              className="w-full py-3 rounded-xl text-white font-black text-sm flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.98] transition"
              style={{ background: `linear-gradient(135deg,${C.forest} 0%,${C.green} 100%)`, boxShadow: '0 4px 14px rgba(27,67,50,0.35)' }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 014-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 01-4 4H3"/>
              </svg>
              Repeat Transfer to @{counterpart}
            </button>
          )}
          <button onClick={onClose}
            className="w-full py-3 rounded-xl font-black text-sm flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.98] transition border"
            style={{ borderColor: C.g200, color: C.g600, backgroundColor: C.g50 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/>
            </svg>
            Back to Wallet
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Transaction Row ───────────────────────────────────────────────────────────
function TxRow({ tx, onClick }) {
  const type      = (tx.type || '').toUpperCase();
  const isSend    = type === 'WITHDRAWAL' || type === 'SEND' || type === 'TRANSFER_OUT';
  const isInternal = type === 'TRANSFER_IN' || type === 'TRANSFER_OUT';
  const isPending = tx.status === 'PENDING'  || tx.status === 'pending';
  const color     = isSend ? C.danger : C.success;
  const label     = type === 'TRANSFER_OUT' ? 'PRAQEN Send'
    : type === 'TRANSFER_IN'  ? 'PRAQEN Received'
    : isSend                  ? 'Sent'
    : type === 'DEPOSIT'      ? 'Received'
    : 'Trade';
  const txHash    = tx.tx_hash || tx.txHash;
  const explorerBase = 'https://mempool.space/tx';

  return (
    <div
      className="flex items-center gap-3 py-3 border-b last:border-0 cursor-pointer hover:bg-gray-50 rounded-xl px-2 -mx-2 transition"
      style={{ borderColor: C.g100 }}
      onClick={onClick}
    >
      <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: isInternal ? `${C.paid}15` : `${color}10` }}>
        {isInternal
          ? <Users size={15} style={{ color: C.paid }} />
          : isSend
            ? <ArrowUpRight size={16} style={{ color }} />
            : <ArrowDownLeft size={16} style={{ color }} />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-bold" style={{ color: C.g800 }}>{label}</p>
          {isInternal && (
            <span className="text-xs font-black px-1.5 py-0.5 rounded-full"
              style={{ backgroundColor: `${C.paid}15`, color: C.paid }}>FREE</span>
          )}
          {isPending && (
            <span className="text-xs font-black px-1.5 py-0.5 rounded-full"
              style={{ backgroundColor: `${C.warn}20`, color: C.warn }}>PENDING</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <p className="text-xs truncate" style={{ color: C.g400 }}>
            {normalizeNotes(tx.notes) || (txHash ? `${txHash.slice(0, 14)}…` : fmtAge(tx.created_at))}
          </p>
          {txHash && !isInternal && (
            <a href={`${explorerBase}/${txHash}`} target="_blank" rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className="text-xs font-bold flex-shrink-0 hover:underline"
              style={{ color: C.paid }}>↗</a>
          )}
        </div>
      </div>
      <div className="text-right flex-shrink-0 min-w-0">
        <p className="text-sm font-black" style={{ color }}>
          {isSend ? '−' : '+'}₿{fmt(Math.abs(tx.amount_btc || 0))}
        </p>
        {tx.created_at && (() => {
          const { date, time } = fmtDate(tx.created_at);
          return (
            <>
              <p className="text-xs font-semibold" style={{ color: C.g600 }}>{date}</p>
              <p className="text-xs" style={{ color: C.g400 }}>{time} · {fmtAge(tx.created_at)}</p>
            </>
          );
        })()}
      </div>
      <ChevronRight size={13} style={{ color: C.g300, flexShrink: 0 }} />
    </div>
  );
}

const CURRENCY_SYMBOLS = { USD:'$', GBP:'£', EUR:'€', GHS:'₵', NGN:'₦', KES:'KSh ', ZAR:'R ' };

// ─── Internal Transfer Modal ───────────────────────────────────────────────────
function InternalTransferModal({ balance, btcPrice, displayCurrency, fxRate, currentUserId, currentUser, onClose, onDone, initialUsername, onSwitchToExternal }) {
  const [step,        setStep]        = useState('form');
  const [inputMode,   setInputMode]   = useState('username'); // 'username' | 'address'
  const [query,       setQuery]       = useState(initialUsername || '');
  const [recipient,   setRecipient]   = useState(null);
  const [lookupError, setLookupError] = useState('');
  const [looking,     setLooking]     = useState(false);
  const [localAmount, setLocalAmount] = useState('');
  const [sending,     setSending]     = useState(false);

  const sym         = CURRENCY_SYMBOLS[displayCurrency] || `${displayCurrency} `;
  const btcPriceLoc = (btcPrice || 88000) * (fxRate || 1);
  const localNum    = parseFloat(localAmount) || 0;
  const btcAmount   = localNum > 0 ? parseFloat((localNum / btcPriceLoc).toFixed(8)) : 0;
  const hasEnough   = btcAmount > 0 && btcAmount <= parseFloat(balance || 0);

  // Auto-detect if pasted value looks like a BTC address
  const handleQueryChange = (val) => {
    setQuery(val); setRecipient(null); setLookupError('');
    if (/^(bc1|[13])[a-zA-Z0-9]{10,}/.test(val.trim())) setInputMode('address');
    else if (val && !val.startsWith('bc1') && !val.startsWith('1') && !val.startsWith('3')) setInputMode('username');
  };

  const findUser = async () => {
    const q = query.trim().replace(/^@/, '');
    if (!q) return;
    setLooking(true); setLookupError(''); setRecipient(null);
    try {
      if (inputMode === 'username') {
        const r = await axios.get(`${API_URL}/users/${encodeURIComponent(q)}`, { headers: authH() });
        const u = r.data?.user || r.data;
        if (!u?.id) { setLookupError('Username not found on PRAQEN.'); return; }
        if (String(u.id) === String(currentUserId)) { setLookupError('You cannot send to yourself.'); return; }
        setRecipient({ ...u, resolvedVia: 'username' });
      } else {
        // BTC address — backend will tell us if it's a PRAQEN internal address
        setRecipient({ address: q, username: null, resolvedVia: 'address' });
      }
    } catch {
      setLookupError(inputMode === 'username' ? 'Username not found on PRAQEN.' : 'Could not verify address.');
    } finally { setLooking(false); }
  };

  const send = async () => {
    if (!recipient || btcAmount <= 0 || !hasEnough) return;
    setSending(true);
    try {
      const payload = recipient.resolvedVia === 'address'
        ? { toAddress: recipient.address, amountBtc: btcAmount }
        : { toUsername: recipient.username, amountBtc: btcAmount };
      const r = await axios.post(`${API_URL}/wallet/internal-transfer`, payload, { headers: authH() });
      onDone(r.data.new_balance);
      setStep('success');
    } catch (e) {
      const err = e.response?.data?.error || 'Transfer failed. Please try again.';
      toast.error(err, { autoClose: 8000 });
      if (e.response?.data?.isExternal) {
        setLookupError('This is an external address — use the Send (on-chain) button instead.');
        setStep('form');
      }
    } finally { setSending(false); }
  };

  const recipientLabel = recipient?.username ? `@${recipient.username}` : recipient?.address ? `${recipient.address.slice(0,12)}…` : '';

  return (
    <div className="fixed inset-0 z-[1100] flex items-end md:items-center justify-center p-0 md:p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(6px)' }}>
      <div className="bg-white w-full md:max-w-md rounded-t-3xl md:rounded-3xl overflow-hidden shadow-2xl"
        style={{ marginBottom: 'calc(60px + env(safe-area-inset-bottom, 0px))' }}>

        {/* ── Header ── */}
        <div style={{ background: 'linear-gradient(135deg, #1B4332 0%, #2D6A4F 100%)', padding: '20px 20px 18px' }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)', boxShadow: '0 4px 14px rgba(99,102,241,0.5)' }}>
                <ArrowLeftRight size={18} color="#fff" strokeWidth={2.2} />
              </div>
              <div>
                <h2 className="font-black text-base text-white">PRAQEN Transfer</h2>
                <p className="text-xs flex items-center gap-1" style={{ color: 'rgba(255,255,255,0.6)' }}><Zap size={11} /> Instant · FREE · No blockchain fees</p>
              </div>
            </div>
            <button onClick={onClose}
              className="w-8 h-8 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}>
              <X size={15} color="rgba(255,255,255,0.7)" />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto" style={{ maxHeight: '75vh' }}>

          {/* ── SUCCESS ── */}
          {step === 'success' && (
            <div className="p-8 text-center space-y-5">
              <div className="w-20 h-20 rounded-3xl flex items-center justify-center mx-auto"
                style={{ background: 'linear-gradient(135deg, #10b981, #059669)', boxShadow: '0 8px 24px rgba(16,185,129,0.4)' }}>
                <CheckCircle size={38} color="#fff" />
              </div>
              <div>
                <p className="font-black text-2xl" style={{ color: C.forest }}>Sent!</p>
                <p className="text-sm mt-2 font-semibold" style={{ color: C.g500 }}>
                  <span className="font-black" style={{ color: C.forest }}>₿{btcAmount.toFixed(8)}</span> transferred to{' '}
                  <span className="font-black" style={{ color: C.forest }}>{recipientLabel}</span>
                </p>
                <div className="inline-flex items-center gap-1.5 mt-3 px-3 py-1.5 rounded-full"
                  style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                  <Zap size={11} style={{ color: '#10b981' }} />
                  <span className="text-xs font-black" style={{ color: '#166534' }}>Instant · Zero fees</span>
                </div>
              </div>
              <button onClick={onClose}
                className="w-full py-4 rounded-2xl text-white font-black text-sm transition"
                style={{ background: 'linear-gradient(135deg, #1B4332, #2D6A4F)', boxShadow: '0 4px 14px rgba(27,67,50,0.35)' }}>
                Done
              </button>
            </div>
          )}

          {/* ── CONFIRM ── */}
          {step === 'confirm' && (
            <div className="p-5 space-y-4">

              {/* Hero amount display */}
              <div className="rounded-3xl p-5 text-center"
                style={{ background: 'linear-gradient(135deg, #1B4332 0%, #2D6A4F 100%)', boxShadow: '0 8px 28px rgba(27,67,50,0.35)' }}>
                <p className="text-xs font-bold mb-1" style={{ color: 'rgba(255,255,255,0.55)' }}>You are sending</p>
                <p className="font-black text-4xl text-white mb-0.5">
                  {sym}{localNum.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
                <p className="text-sm font-bold" style={{ color: 'rgba(255,255,255,0.6)' }}>₿ {btcAmount.toFixed(8)}</p>
                <div className="inline-flex items-center gap-1.5 mt-3 px-3 py-1.5 rounded-full"
                  style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)' }}>
                  <Zap size={11} color="#4ade80" />
                  <span className="text-xs font-black text-white">Instant · Zero fees</span>
                </div>
              </div>

              {/* FROM → TO */}
              <div className="flex items-center gap-2">
                {/* From: you */}
                <div className="flex-1 flex flex-col items-center gap-2 p-3 rounded-2xl"
                  style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                  {currentUser?.avatar_url
                    ? <img src={currentUser.avatar_url} alt="you"
                        className="w-11 h-11 rounded-2xl object-cover flex-shrink-0" />
                    : <div className="w-11 h-11 rounded-2xl flex items-center justify-center font-black text-white text-base"
                        style={{ background: 'linear-gradient(135deg, #475569, #334155)' }}>
                        {(currentUser?.username || currentUser?.full_name || 'Y')[0].toUpperCase()}
                      </div>}
                  <p className="text-xs font-black text-center truncate w-full" style={{ color: C.g700 }}>
                    {currentUser?.username ? `@${currentUser.username}` : currentUser?.full_name || 'You'}
                  </p>
                  <p className="text-xs font-bold" style={{ color: C.g400 }}>Sender</p>
                </div>

                {/* Arrow */}
                <div className="flex flex-col items-center gap-1 flex-shrink-0">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center"
                    style={{ background: 'linear-gradient(135deg, #6366f1, #4f46e5)', boxShadow: '0 4px 12px rgba(99,102,241,0.4)' }}>
                    <ArrowLeftRight size={14} color="#fff" />
                  </div>
                </div>

                {/* To: recipient */}
                <div className="flex-1 flex flex-col items-center gap-2 p-3 rounded-2xl"
                  style={{ background: '#f0fdf4', border: '1.5px solid #86efac' }}>
                  <div className="w-11 h-11 rounded-2xl flex items-center justify-center font-black text-white text-base"
                    style={{ background: 'linear-gradient(135deg, #1B4332, #2D6A4F)' }}>
                    {recipient?.username ? recipient.username[0].toUpperCase() : '₿'}
                  </div>
                  <p className="text-xs font-black text-center truncate w-full" style={{ color: C.forest }}>
                    {recipient?.username ? `@${recipient.username}` : 'Address'}
                  </p>
                  <p className="text-xs font-bold" style={{ color: '#10b981' }}>Recipient</p>
                </div>
              </div>

              {/* Breakdown */}
              <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid #e2e8f0' }}>
                {[
                  { label: 'Amount',       val: `${sym}${localNum.toLocaleString('en-US', { minimumFractionDigits: 2 })} ${displayCurrency}` },
                  { label: 'In BTC',       val: `₿ ${btcAmount.toFixed(8)}` },
                  { label: 'Network fee',  free: true },
                  { label: 'They receive', val: `₿ ${btcAmount.toFixed(8)}`, bold: true },
                ].map(({ label, val, bold, free }, i) => (
                  <div key={label} className="flex justify-between items-center px-4 py-3"
                    style={{ borderTop: i > 0 ? '1px solid #f1f5f9' : 'none', backgroundColor: bold ? '#f8fafc' : '#fff' }}>
                    <span className="text-xs font-semibold" style={{ color: C.g500 }}>{label}</span>
                    {free
                      ? <span className="text-xs font-black px-2.5 py-1 rounded-full inline-flex items-center gap-1"
                          style={{ background: 'linear-gradient(135deg, #f0fdf4, #dcfce7)', color: '#15803d', border: '1px solid #86efac' }}>
                          <Check size={11} /> FREE
                        </span>
                      : <span className={`text-xs ${bold ? 'font-black' : 'font-bold'}`}
                          style={{ color: bold ? C.forest : C.g700 }}>{val}</span>}
                  </div>
                ))}
              </div>

              {/* Warning */}
              <div className="flex items-center gap-2.5 px-4 py-3 rounded-2xl"
                style={{ backgroundColor: '#fffbeb', border: '1px solid #fde68a' }}>
                <AlertTriangle size={13} style={{ color: '#d97706', flexShrink: 0 }} />
                <p className="text-xs font-semibold" style={{ color: '#92400e' }}>
                  This transfer is instant and irreversible. Double-check the recipient.
                </p>
              </div>

              {/* Buttons */}
              <div className="flex gap-3">
                <button onClick={() => setStep('form')}
                  className="flex-1 py-3.5 rounded-2xl border font-bold text-sm hover:bg-gray-50 transition"
                  style={{ borderColor: C.g200, color: C.g600 }}>
                  ← Back
                </button>
                <button onClick={send} disabled={sending}
                  className="flex-1 py-4 rounded-2xl text-white font-black text-sm transition disabled:opacity-40"
                  style={{
                    background: sending ? '#94a3b8' : 'linear-gradient(135deg, #6366f1, #4f46e5)',
                    boxShadow: sending ? 'none' : '0 6px 20px rgba(99,102,241,0.4)',
                  }}>
                  {sending
                    ? <span className="flex items-center justify-center gap-2"><RefreshCw size={14} className="animate-spin" /> Sending…</span>
                    : <span className="flex items-center justify-center gap-2"><Zap size={15} /> Confirm Transfer</span>}
                </button>
              </div>
            </div>
          )}

          {/* ── FORM ── */}
          {step === 'form' && (
            <div className="p-5 space-y-4">

              {/* ── Destination toggle: PRAQEN user (this modal) vs external wallet ── */}
              <div className="flex rounded-2xl overflow-hidden" style={{ border: `1.5px solid ${C.g200}` }}>
                <button onClick={onSwitchToExternal}
                  className="flex-1 py-3 text-center font-black text-xs transition hover:bg-gray-50"
                  style={{ color: C.g500 }}>
                  External Wallet
                </button>
                <div className="flex-1 py-3 text-center font-black text-xs"
                  style={{ background: 'linear-gradient(135deg, #6366f1, #4f46e5)', color: '#fff' }}>
                  PRAQEN User
                </div>
              </div>

              {/* ── Temporary notice: external sends delayed while blockchain is under maintenance ── */}
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl" style={{ backgroundColor: '#FFFBEB', border: '1px solid #FDE68A' }}>
                <AlertTriangle size={13} style={{ color: '#D97706', flexShrink: 0 }} />
                <p className="text-xs font-semibold" style={{ color: '#92400E' }}>
                  External wallet sending is temporarily delayed — blockchain is under maintenance. Send to a PRAQEN user instead or trade in our P2P market for now. Sorry for the inconvenience, we're fixing it soon.
                </p>
              </div>

              {/* Balance */}
              <div className="flex items-center justify-between px-4 py-3 rounded-2xl"
                style={{ background: 'linear-gradient(135deg, #f0fdf4, #dcfce7)', border: '1px solid #bbf7d0' }}>
                <div>
                  <p className="text-xs font-bold mb-0.5" style={{ color: '#166534' }}>Available Balance</p>
                  <p className="font-black text-xl" style={{ color: '#15803d' }}>₿ {fmt(balance)}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-bold" style={{ color: '#166534' }}>≈</p>
                  <p className="font-black text-base" style={{ color: '#166534' }}>{sym}{(parseFloat(balance) * btcPriceLoc).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                </div>
              </div>

              {/* Input mode toggle */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-black" style={{ color: C.g700 }}>Send To</label>
                  <div className="flex rounded-xl overflow-hidden" style={{ border: `1.5px solid ${C.g200}` }}>
                    {[['username', '@ Username'], ['address', '₿ Address']].map(([mode, label]) => (
                      <button key={mode} onClick={() => { setInputMode(mode); setQuery(''); setRecipient(null); setLookupError(''); }}
                        className="px-3 py-1.5 text-xs font-black transition"
                        style={{ background: inputMode === mode ? 'linear-gradient(135deg, #1B4332, #2D6A4F)' : 'transparent', color: inputMode === mode ? '#fff' : C.g500 }}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex gap-2">
                  <div className="relative flex-1">
                    {inputMode === 'username' && (
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-black text-sm" style={{ color: C.g400 }}>@</span>
                    )}
                    <input
                      type="text"
                      value={query}
                      onChange={e => handleQueryChange(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && findUser()}
                      placeholder={inputMode === 'username' ? 'username' : 'bc1q… or 1… or 3…'}
                      className="w-full py-3.5 text-sm rounded-2xl focus:outline-none transition font-mono"
                      style={{
                        paddingLeft: inputMode === 'username' ? '28px' : '16px',
                        paddingRight: '12px',
                        border: `2px solid ${recipient ? '#10b981' : lookupError ? '#ef4444' : C.g200}`,
                        backgroundColor: recipient ? '#f0fdf4' : lookupError ? '#fff5f5' : '#fafafa',
                      }}
                    />
                  </div>
                  <button onClick={findUser} disabled={!query.trim() || looking}
                    className="px-4 rounded-2xl text-white font-black text-xs flex items-center gap-1.5 transition disabled:opacity-40"
                    style={{ background: 'linear-gradient(135deg, #1B4332, #2D6A4F)', boxShadow: '0 4px 12px rgba(27,67,50,0.3)', minWidth: 64 }}>
                    {looking ? <RefreshCw size={13} className="animate-spin" /> : <><Search size={13} /> Find</>}
                  </button>
                </div>

                {lookupError && (
                  <div className="flex items-center gap-1.5 mt-2 px-3 py-2 rounded-xl" style={{ backgroundColor: '#fff5f5', border: '1px solid #fecaca' }}>
                    <AlertTriangle size={12} style={{ color: '#ef4444' }} />
                    <p className="text-xs font-semibold" style={{ color: '#dc2626' }}>{lookupError}</p>
                  </div>
                )}
              </div>

              {/* Recipient card */}
              {recipient && (
                <div className="flex items-center gap-3 p-3.5 rounded-2xl"
                  style={{ background: 'linear-gradient(135deg, #f0fdf4, #dcfce7)', border: '1.5px solid #86efac' }}>
                  <div className="w-11 h-11 rounded-2xl flex items-center justify-center font-black text-white text-base flex-shrink-0"
                    style={{ background: 'linear-gradient(135deg, #1B4332, #2D6A4F)' }}>
                    {recipient.username ? recipient.username[0].toUpperCase() : '₿'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-black text-sm" style={{ color: C.forest }}>
                      {recipient.username ? `@${recipient.username}` : 'PRAQEN Wallet Address'}
                    </p>
                    <p className="text-xs truncate font-mono" style={{ color: C.g500 }}>
                      {recipient.address
                        ? `${recipient.address.slice(0, 20)}…`
                        : `${recipient.badge ? recipient.badge + ' · ' : ''}${recipient.total_trades || 0} trades${recipient.country ? ' · ' + recipient.country : ''}`}
                    </p>
                  </div>
                  <div className="w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: '#10b981' }}>
                    <CheckCircle size={14} color="#fff" />
                  </div>
                </div>
              )}

              {/* Amount */}
              <div>
                <label className="block text-xs font-black mb-2" style={{ color: C.g700 }}>
                  Amount ({displayCurrency})
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-base" style={{ color: C.g400 }}>{sym}</span>
                  <input
                    type="number" value={localAmount} onChange={e => setLocalAmount(e.target.value)}
                    placeholder="0.00" min="0"
                    className="w-full pl-8 pr-4 py-3.5 text-sm rounded-2xl focus:outline-none transition"
                    style={{
                      border: `2px solid ${!localAmount ? C.g200 : hasEnough ? '#10b981' : '#ef4444'}`,
                      backgroundColor: !localAmount ? '#fafafa' : hasEnough ? '#f0fdf4' : '#fff5f5',
                    }}
                  />
                </div>
                {localNum > 0 && (
                  <p className="text-xs mt-1.5 font-bold" style={{ color: '#10b981' }}>≈ ₿ {btcAmount.toFixed(8)}</p>
                )}
                {localNum > 0 && !hasEnough && (
                  <div className="flex items-center gap-1.5 mt-1.5 px-3 py-2 rounded-xl" style={{ backgroundColor: '#fff5f5', border: '1px solid #fecaca' }}>
                    <AlertTriangle size={12} style={{ color: '#ef4444' }} />
                    <p className="text-xs font-semibold" style={{ color: '#dc2626' }}>
                      Insufficient balance — you have ₿ {fmt(balance)}
                    </p>
                  </div>
                )}
              </div>

              {/* Free badge */}
              <div className="flex items-center gap-2.5 px-4 py-3 rounded-2xl"
                style={{ background: 'linear-gradient(135deg, #f0fdf4, #dcfce7)', border: '1px solid #bbf7d0' }}>
                <Zap size={14} style={{ color: '#10b981' }} />
                <p className="text-xs font-black" style={{ color: '#166534' }}>
                  Instant &amp; FREE — no blockchain fees, no waiting
                </p>
              </div>

              <button
                onClick={() => setStep('confirm')}
                disabled={!recipient || !hasEnough || btcAmount <= 0}
                className="w-full py-4 rounded-2xl text-white font-black text-sm transition disabled:opacity-40"
                style={{
                  background: (!recipient || !hasEnough || btcAmount <= 0) ? '#94a3b8' : 'linear-gradient(135deg, #6366f1, #4f46e5)',
                  boxShadow: (!recipient || !hasEnough || btcAmount <= 0) ? 'none' : '0 6px 20px rgba(99,102,241,0.4)',
                }}>
                <span className="flex items-center justify-center gap-2">
                  <ArrowLeftRight size={15} /> Review Transfer
                </span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── USDT Withdraw Modal ──────────────────────────────────────────────────────
function UsdtWithdrawModal({ balance, onClose, onSend, kycStatus, twoFactorEnabled, onSwitchToInternal }) {
  const [address,       setAddress]       = useState('');
  const [amount,        setAmount]        = useState('');
  const [inputMode,     setInputMode]     = useState('usdt'); // 'usdt' | 'usd'
  const [usdInput,      setUsdInput]      = useState('');
  const [confirm,       setConfirm]       = useState(false);
  const [step,          setStep]          = useState('form');
  const [codeInput,     setCodeInput]     = useState('');
  const [sending2FA,    setSending2FA]    = useState(false);
  const [sending,       setSending]       = useState(false);
  const [sendError,     setSendError]     = useState('');

  // Fee = max($5 flat floor, 5% of amount) — mirrors backend calcFee() in
  // POST /api/wallet/usdt/send. The floor means the fee never drops as the
  // amount goes up: 5% only takes over once it clears $5, at amounts above
  // $100 ($5 / 5%). No boundary where a bigger withdrawal costs less fee.
  const FEE_FLAT    = 5.00;
  const FEE_PERCENT = 0.05;
  const MIN_SEND    = 5.00;
  const FEE_SWITCH  = FEE_FLAT / FEE_PERCENT; // $100 — where percent first exceeds the floor

  const calcFee = (amt) => Math.max(FEE_FLAT, parseFloat((amt * FEE_PERCENT).toFixed(2)));

  const usdtAmt     = parseFloat(amount || 0);
  const fee         = usdtAmt > 0 ? calcFee(usdtAmt) : 0;
  const totalDeduct = usdtAmt > 0 ? parseFloat((usdtAmt + fee).toFixed(2)) : 0;
  const bal         = parseFloat(balance || 0);
  const feeLabel    = usdtAmt > 0
    ? (usdtAmt <= FEE_SWITCH ? `₮${fee.toFixed(2)} flat fee` : `₮${fee.toFixed(2)} (${(FEE_PERCENT * 100).toFixed(0)}%)`)
    : '';

  // Calculate true max sendable so that amount + fee(amount) ≤ balance
  const calcMax = (b) => {
    if (b <= FEE_FLAT + MIN_SEND) return 0;
    const tryFlat = parseFloat((b - FEE_FLAT).toFixed(2));
    if (tryFlat > 0 && tryFlat <= FEE_SWITCH) return tryFlat;
    const tryPct = parseFloat((b / (1 + FEE_PERCENT)).toFixed(2));
    return tryPct >= MIN_SEND ? tryPct : 0;
  };

  const isValidTron = addr => /^T[A-Za-z1-9]{33}$/.test(addr.trim());
  const addrOk      = isValidTron(address);
  const hasEnough   = usdtAmt >= MIN_SEND && totalDeduct <= bal;
  const valid       = addrOk && hasEnough;

  const requestCode = async () => {
    if (!valid) return;
    setSending2FA(true);
    try {
      const t = localStorage.getItem('token');
      await axios.post(`${API_URL}/auth/send-action-code`, { action: 'send_usdt' },
        { headers: t ? { Authorization: `Bearer ${t}` } : {} });
      setCodeInput(''); setStep('code');
      toast.success('Security code sent to your email.', { autoClose: 5000 });
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Could not send security code.');
    } finally { setSending2FA(false); }
  };

  const handleSend = async () => {
    if (!codeInput || codeInput.length !== 6) { toast.error('Enter the 6-digit code from your email.'); return; }
    setSending(true); setSendError('');
    try {
      await onSend(address.trim(), usdtAmt, codeInput);
      toast.success('USDT sent! Transaction broadcast to Tron network.', { autoClose: 6000 });
      onClose();
    } catch (e) {
      const msg = e?.response?.data?.error || 'Send failed. Your funds are safe — please try again.';
      setSendError(msg);
    } finally { setSending(false); }
  };

  return (
    <div className="fixed inset-0 z-[1100] flex items-end md:items-center justify-center p-0 md:p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(6px)' }}>
      <div className="bg-white w-full md:max-w-md rounded-t-3xl md:rounded-3xl overflow-hidden shadow-2xl"
        style={{ marginBottom: 'calc(60px + env(safe-area-inset-bottom, 0px))' }}>
        <div style={{ background: 'linear-gradient(135deg, #1B4332 0%, #2D6A4F 100%)', padding: '20px 20px 18px' }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)', boxShadow: '0 4px 14px rgba(239,68,68,0.5)' }}>
                <Send size={18} color="#fff" strokeWidth={2.2} />
              </div>
              <div>
                <h2 className="font-black text-base text-white">Send USDT</h2>
                <p className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>TRC-20 · Tron network · ~1 min</p>
              </div>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}>
              <X size={15} color="rgba(255,255,255,0.7)" />
            </button>
          </div>
        </div>
        <div className="p-5 overflow-y-auto space-y-4" style={{ maxHeight: '75vh' }}>

          {/* ── Destination toggle: external wallet (this modal) vs PRAQEN user ── */}
          <div className="flex rounded-2xl overflow-hidden" style={{ border: `1.5px solid ${C.g200}` }}>
            <div className="flex-1 py-3 text-center font-black text-xs"
              style={{ background: 'linear-gradient(135deg, #1a1a2e, #16213e)', color: '#fff' }}>
              External Wallet
            </div>
            <button onClick={onSwitchToInternal}
              className="flex-1 py-3 text-center font-black text-xs transition hover:bg-gray-50"
              style={{ color: C.g500 }}>
              PRAQEN User
            </button>
          </div>

          {/* ── KYC gate ── */}
          {kycStatus && !(kycStatus.email && kycStatus.phone && kycStatus.kyc) ? (
            <div className="space-y-4">
              <div className="flex flex-col items-center text-center py-4">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-3"
                  style={{ background: 'linear-gradient(135deg, #f59e0b22, #f59e0b11)', border: '1px solid #f59e0b30' }}>
                  <Shield size={30} style={{ color: '#f59e0b' }} />
                </div>
                <h3 className="font-black text-base mb-1" style={{ color: '#1f2937' }}>Verification Required</h3>
                <p className="text-sm" style={{ color: '#6b7280' }}>
                  Complete all 3 steps to send USDT to an external wallet.
                </p>
              </div>
              <div className="space-y-2">
                {[
                  { label: 'Email Verified',    done: kycStatus.email, step: 1 },
                  { label: 'Phone Verified',    done: kycStatus.phone, step: 2 },
                  { label: 'ID / KYC Verified', done: kycStatus.kyc,   step: 3 },
                ].map(({ label, done, step: s }) => (
                  <div key={s} className="flex items-center gap-3 p-3 rounded-2xl"
                    style={{ backgroundColor: done ? '#10b98108' : '#f59e0b08', border: `1px solid ${done ? '#10b98130' : '#f59e0b30'}` }}>
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: done ? '#10b98120' : '#f59e0b20' }}>
                      {done
                        ? <CheckCircle size={15} style={{ color: '#10b981' }} />
                        : <span className="text-xs font-black" style={{ color: '#f59e0b' }}>{s}</span>}
                    </div>
                    <p className="text-sm font-bold flex-1" style={{ color: done ? '#10b981' : '#374151' }}>{label}</p>
                    {done
                      ? <CheckCircle size={14} style={{ color: '#10b981' }} />
                      : <span className="text-xs font-black px-2 py-0.5 rounded-full"
                          style={{ backgroundColor: '#f59e0b20', color: '#f59e0b' }}>Pending</span>}
                  </div>
                ))}
              </div>
              <a href="/profile" onClick={onClose}
                className="w-full py-3.5 rounded-2xl text-white font-black text-sm flex items-center justify-center gap-2 hover:opacity-90 transition"
                style={{ background: 'linear-gradient(135deg, #10b981, #059669)', boxShadow: '0 4px 14px rgba(16,185,129,0.35)' }}>
                <Shield size={15} /> Complete Verification Now
              </a>
            </div>
          ) : <>

          {/* ── Fee notice ── */}
          <div className="rounded-2xl overflow-hidden" style={{ border: '1.5px solid #fde68a' }}>
            <div className="px-4 py-3 flex items-center gap-2.5" style={{ backgroundColor: '#fffbeb' }}>
              <AlertTriangle size={13} style={{ color: '#d97706', flexShrink: 0 }} />
              <p className="text-xs font-semibold leading-relaxed" style={{ color: '#92400e' }}>
                A send fee applies. You'll see the exact amount before you confirm.
              </p>
            </div>
          </div>

          {/* ── Balance pill ── */}
          <div className="flex items-center justify-between px-4 py-3 rounded-2xl"
            style={{ background: 'linear-gradient(135deg, #eff6ff, #dbeafe)', border: '1px solid #bfdbfe' }}>
            <div>
              <p className="text-xs font-bold mb-0.5" style={{ color: '#1e40af' }}>Available USDT</p>
              <p className="font-black text-xl" style={{ color: '#1d4ed8' }}>₮ {bal.toFixed(2)}</p>
            </div>
            <div className="text-right">
              <p className="text-xs font-bold" style={{ color: '#3b82f6' }}>TRC-20</p>
              {calcMax(bal) > 0 && (
                <p className="text-xs font-semibold mt-0.5" style={{ color: '#60a5fa' }}>
                  Max send: ₮{calcMax(bal).toFixed(2)}
                </p>
              )}
            </div>
          </div>
          <div>
            <label className="block text-xs font-black mb-2" style={{ color: C.g700 }}>Recipient Tron Address</label>
            <div className="relative">
              <input type="text" value={address} onChange={e => setAddress(e.target.value)}
                placeholder="T… (starts with T, 34 characters)"
                className="w-full px-4 py-3.5 text-sm rounded-2xl focus:outline-none font-mono transition"
                style={{
                  border: `2px solid ${!address ? C.g200 : addrOk ? '#10b981' : '#ef4444'}`,
                  backgroundColor: !address ? '#fafafa' : addrOk ? '#f0fdf4' : '#fff5f5',
                  color: C.g800, paddingRight: address ? '40px' : '16px',
                }} />
              {address && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  {addrOk ? <CheckCircle size={16} style={{ color: '#10b981' }} /> : <AlertTriangle size={16} style={{ color: '#ef4444' }} />}
                </div>
              )}
            </div>
            {address.length > 3 && !addrOk && (
              <p className="text-xs mt-1.5 font-semibold flex items-center gap-1" style={{ color: '#ef4444' }}>
                <AlertTriangle size={11} /> Must start with T, 34 characters (Tron mainnet)
              </p>
            )}
            {addrOk && <p className="text-xs mt-1.5 font-semibold flex items-center gap-1" style={{ color: '#10b981' }}><CheckCircle size={11} /> Valid Tron address</p>}
          </div>

          {/* ── Wrong-address responsibility warning ── */}
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl" style={{ backgroundColor: '#FFFBEB', border: '1px solid #FDE68A' }}>
            <AlertTriangle size={13} style={{ color: '#D97706', flexShrink: 0 }} />
            <p className="text-xs font-semibold" style={{ color: '#92400E' }}>
              Double-check this address before sending. If it's wrong, your funds are gone for good — PRAQEN can't recover or refund a send to the wrong wallet.
            </p>
          </div>

          <div>
            {/* ── Input mode toggle ── */}
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-black" style={{ color: C.g700 }}>Amount</label>
              <div className="flex rounded-xl overflow-hidden" style={{ border: '1.5px solid #e2e8f0' }}>
                {[
                  { key: 'usdt', label: '₮ USDT' },
                  { key: 'usd',  label: '$ USD'  },
                ].map(({ key, label }) => (
                  <button key={key}
                    onClick={() => { setInputMode(key); }}
                    className="px-3 py-1.5 text-xs font-black transition"
                    style={{
                      background: inputMode === key ? 'linear-gradient(135deg, #1d4ed8, #2563eb)' : '#fff',
                      color: inputMode === key ? '#fff' : C.g500,
                    }}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* ── USD input ── */}
            {inputMode === 'usd' && (
              <div className="space-y-1.5">
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-base" style={{ color: '#2563eb' }}>$</span>
                  <input type="number" value={usdInput}
                    onChange={e => { setUsdInput(e.target.value); setAmount(e.target.value); }}
                    placeholder="10.00" min="0" step="0.01"
                    className="w-full pl-8 pr-16 py-3.5 text-sm rounded-2xl focus:outline-none transition"
                    style={{
                      border: `2px solid ${!usdInput ? C.g200 : hasEnough ? '#10b981' : '#ef4444'}`,
                      backgroundColor: !usdInput ? '#fafafa' : hasEnough ? '#f0fdf4' : '#fff5f5',
                    }} />
                  <button onClick={() => { const m = calcMax(bal); if (m > 0) { setUsdInput(m.toFixed(2)); setAmount(m.toFixed(2)); } }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-black px-2.5 py-1 rounded-xl"
                    style={{ background: 'linear-gradient(135deg, #10b981, #059669)', color: '#fff' }}>MAX</button>
                </div>
                {parseFloat(usdInput) > 0 && (
                  <p className="text-xs font-semibold px-1" style={{ color: '#2563eb' }}>
                    = ₮{parseFloat(usdInput || 0).toFixed(2)} USDT · Min: $5.00 · Max: ${calcMax(bal).toFixed(2)}
                  </p>
                )}
                {!usdInput && (
                  <p className="text-xs font-semibold px-1" style={{ color: C.g400 }}>
                    Min: $5.00 · Max: ${calcMax(bal).toFixed(2)} · 1 USD = 1 USDT
                  </p>
                )}
              </div>
            )}

            {/* ── USDT input ── */}
            {inputMode === 'usdt' && (
              <div className="space-y-1.5">
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-base" style={{ color: C.g400 }}>₮</span>
                  <input type="number" value={amount}
                    onChange={e => { setAmount(e.target.value); setUsdInput(e.target.value); }}
                    placeholder="0.00" min="0" step="0.01"
                    className="w-full pl-8 pr-16 py-3.5 text-sm rounded-2xl focus:outline-none transition"
                    style={{
                      border: `2px solid ${!amount ? C.g200 : hasEnough ? '#10b981' : '#ef4444'}`,
                      backgroundColor: !amount ? '#fafafa' : hasEnough ? '#f0fdf4' : '#fff5f5',
                    }} />
                  <button onClick={() => { const m = calcMax(bal); if (m > 0) { setAmount(m.toFixed(2)); setUsdInput(m.toFixed(2)); } }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-black px-2.5 py-1 rounded-xl"
                    style={{ background: 'linear-gradient(135deg, #10b981, #059669)', color: '#fff' }}>MAX</button>
                </div>
                {usdtAmt > 0 && (
                  <p className="text-xs font-semibold px-1" style={{ color: '#10b981' }}>
                    = ${usdtAmt.toFixed(2)} USD · Min: ₮{MIN_SEND.toFixed(2)} · Max: ₮{calcMax(bal).toFixed(2)}
                  </p>
                )}
                {!amount && (
                  <p className="text-xs font-semibold px-1" style={{ color: C.g400 }}>
                    Min: ₮{MIN_SEND.toFixed(2)} · Max: ₮{calcMax(bal).toFixed(2)} · 1 USDT = $1.00
                  </p>
                )}
              </div>
            )}

            {usdtAmt > 0 && !hasEnough && (
              <div className="flex items-center gap-1.5 mt-2 px-3 py-2 rounded-xl" style={{ backgroundColor: '#fff5f5', border: '1px solid #fecaca' }}>
                <AlertTriangle size={12} style={{ color: '#ef4444', flexShrink: 0 }} />
                <p className="text-xs font-semibold" style={{ color: '#dc2626' }}>
                  Need ₮{totalDeduct.toFixed(2)} (₮{usdtAmt.toFixed(2)} + {fee.toFixed(2)} fee) — only ₮{bal.toFixed(2)} available
                </p>
              </div>
            )}
          </div>

          {/* ── Live fee breakdown ── */}
          {usdtAmt > 0 && (
            <div className="rounded-2xl overflow-hidden" style={{ border: '1.5px solid #e2e8f0' }}>
              {[
                { label: 'You send',        val: `₮${usdtAmt.toFixed(2)}`,      icon: '→',  bold: false },
                { label: `Platform fee (${usdtAmt <= FEE_SWITCH ? `₮${FEE_FLAT.toFixed(0)} flat` : `${(FEE_PERCENT * 100).toFixed(0)}%`})`, val: `₮${fee.toFixed(2)}`, icon: <DollarSign size={11} />, bold: false, warn: true },
                { label: 'Total deducted',  val: `₮${totalDeduct.toFixed(2)}`,  icon: null, bold: true  },
              ].map(({ label, val, icon, bold, warn }, i) => (
                <div key={label} className="flex justify-between items-center px-4 py-3"
                  style={{
                    backgroundColor: bold ? '#f8fafc' : '#fff',
                    borderTop: bold ? '2px solid #e2e8f0' : i > 0 ? '1px solid #f1f5f9' : 'none',
                  }}>
                  <span className="text-xs font-semibold flex items-center gap-1.5"
                    style={{ color: warn ? '#d97706' : bold ? '#334155' : '#64748b' }}>
                    {icon && <span>{icon}</span>}{label}
                  </span>
                  <span className={`text-xs ${bold ? 'font-black' : 'font-bold'}`}
                    style={{ color: warn ? '#d97706' : bold ? '#1e293b' : '#475569' }}>
                    {val}
                  </span>
                </div>
              ))}
              <div className="px-4 py-2.5 flex items-center gap-2"
                style={{ backgroundColor: '#f0fdf4', borderTop: '1px solid #dcfce7' }}>
                <CheckCircle size={12} style={{ color: '#10b981', flexShrink: 0 }} />
                <p className="text-xs font-semibold" style={{ color: '#166534' }}>
                  Recipient gets exactly <strong>₮{usdtAmt.toFixed(2)}</strong> · fee is separate
                </p>
              </div>
            </div>
          )}
          <label className="flex items-start gap-3 cursor-pointer p-3 rounded-2xl transition"
            style={{ backgroundColor: confirm ? '#f0fdf4' : '#fafafa', border: `1.5px solid ${confirm ? '#bbf7d0' : C.g200}` }}>
            <div className="mt-0.5 w-4 h-4 rounded-md flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: confirm ? '#10b981' : '#fff', border: `2px solid ${confirm ? '#10b981' : C.g300}` }}>
              {confirm && <CheckCircle size={10} color="#fff" strokeWidth={3} />}
            </div>
            <input type="checkbox" checked={confirm} onChange={e => setConfirm(e.target.checked)} className="sr-only" />
            <p className="text-xs font-semibold leading-relaxed" style={{ color: confirm ? '#166534' : C.g600 }}>
              I've double-checked this address is correct. I understand USDT-TRC20 sends are irreversible, and PRAQEN is not responsible if I send to the wrong wallet.
            </p>
          </label>
          {step === 'form' && (
            <div className="space-y-3">
              {!twoFactorEnabled ? (
                <div className="p-4 rounded-2xl text-center" style={{backgroundColor: '#fffbeb', border: '1px solid #fde68a'}}>
                  <AlertTriangle size={24} style={{color: '#d97706', margin: '0 auto 8px', display: 'block'}} />
                  <p className="font-bold text-sm" style={{color: '#92400e'}}>Enable Two-Factor Authentication</p>
                  <p className="text-xs mt-1" style={{color: '#92400e'}}>You must enable 2FA before sending USDT. Go to Settings → Security to enable it.</p>
                  <button onClick={() => window.location.href = '/settings'}
                    className="mt-3 px-5 py-2.5 rounded-xl text-white font-bold text-xs transition hover:opacity-90"
                    style={{backgroundColor: '#2D6A4F'}}>
                    Go to Settings
                  </button>
                </div>
              ) : (
                <>
                  <button onClick={requestCode} disabled={!valid || !confirm || sending2FA}
                    className="w-full py-4 rounded-2xl text-white font-black text-sm flex items-center justify-center gap-2 transition disabled:opacity-40"
                    style={{ background: (!valid || !confirm || sending2FA) ? '#94a3b8' : 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)', boxShadow: (valid && confirm && !sending2FA) ? '0 6px 20px rgba(239,68,68,0.4)' : 'none' }}>
                    {sending2FA ? <><RefreshCw size={15} className="animate-spin" /> Sending code…</> : <><Shield size={15} /> Get Security Code &amp; Continue</>}
                  </button>
                  <div className="flex items-center gap-2.5 px-4 py-3 rounded-2xl" style={{ backgroundColor: '#fffbeb', border: '1px solid #fde68a' }}>
                    <AlertTriangle size={13} style={{ color: '#d97706', flexShrink: 0 }} />
                    <p className="text-xs font-semibold" style={{ color: '#92400e' }}>A 6-digit security code will be emailed to confirm this withdrawal.</p>
                  </div>
                </>
              )}
            </div>
          )}
          {step === 'code' && (
            <div className="space-y-3">
              <div className="flex flex-col items-center text-center px-4 py-4 rounded-2xl"
                style={{ background: 'linear-gradient(135deg, #f0fdf4, #dcfce7)', border: '1px solid #bbf7d0' }}>
                <div className="w-10 h-10 rounded-2xl flex items-center justify-center mb-2"
                  style={{ background: 'linear-gradient(135deg, #10b981, #059669)', boxShadow: '0 4px 12px rgba(16,185,129,0.35)' }}>
                  <Shield size={18} color="#fff" />
                </div>
                <p className="font-black text-sm" style={{ color: '#166534' }}>Security Code Sent</p>
                <p className="text-xs mt-0.5" style={{ color: '#15803d' }}>Enter the 6-digit code to confirm this withdrawal</p>
              </div>
              {/* Mini fee summary on code step */}
              <div className="rounded-2xl overflow-hidden" style={{ border: '1.5px solid #e2e8f0' }}>
                {[
                  { label: 'Recipient gets',  val: `₮${usdtAmt.toFixed(2)}`,     color: '#10b981' },
                  { label: `Fee (${usdtAmt <= FEE_SWITCH ? `₮${FEE_FLAT.toFixed(0)} flat` : `${(FEE_PERCENT * 100).toFixed(0)}%`})`,          val: `₮${fee.toFixed(2)}`,       color: '#d97706' },
                  { label: 'Total deducted',  val: `₮${totalDeduct.toFixed(2)}`,  color: '#1e293b', bold: true },
                ].map(({ label, val, color, bold }, i) => (
                  <div key={label} className="flex justify-between items-center px-4 py-2.5"
                    style={{ backgroundColor: bold ? '#f8fafc' : '#fff', borderTop: i > 0 ? '1px solid #f1f5f9' : 'none' }}>
                    <span className="text-xs font-semibold" style={{ color: '#64748b' }}>{label}</span>
                    <span className={`text-xs ${bold ? 'font-black' : 'font-bold'}`} style={{ color }}>{val}</span>
                  </div>
                ))}
              </div>
              <input type="text" inputMode="numeric" value={codeInput} autoFocus
                onChange={e => setCodeInput(e.target.value.replace(/\D/g,'').slice(0,6))}
                placeholder="0  0  0  0  0  0"
                className="w-full text-center py-4 rounded-2xl font-mono tracking-[0.5em] focus:outline-none transition"
                style={{ fontSize: 28, fontWeight: 900, border: `2.5px solid ${codeInput.length === 6 ? '#10b981' : C.g200}`, backgroundColor: codeInput.length === 6 ? '#f0fdf4' : '#fafafa', color: C.g800 }}
                maxLength={6} />
              <p className="text-xs text-center" style={{ color: C.g400 }}>
                Didn't receive it?{' '}
                <button onClick={requestCode} disabled={sending2FA} className="font-black underline disabled:opacity-50" style={{ color: '#10b981' }}>
                  {sending2FA ? 'Sending…' : 'Resend code'}
                </button>
              </p>
              {sendError && (
                <div className="rounded-2xl p-4 space-y-1" style={{ background: '#fef2f2', border: '1.5px solid #fecaca' }}>
                  <div className="flex items-center gap-2 mb-1">
                    <AlertTriangle size={14} style={{ color: '#dc2626', flexShrink: 0 }} />
                    <p className="text-xs font-black" style={{ color: '#dc2626' }}>Withdrawal Failed</p>
                  </div>
                  <p className="text-xs font-semibold" style={{ color: '#991b1b' }}>{sendError}</p>
                  <p className="text-xs mt-1" style={{ color: '#b91c1c' }}>Your balance has been fully restored — no funds were lost.</p>
                </div>
              )}
              <div className="flex gap-3">
                <button onClick={() => { setStep('form'); setCodeInput(''); }}
                  className="flex-1 py-3.5 rounded-2xl border font-bold text-sm hover:bg-gray-50 transition"
                  style={{ borderColor: C.g200, color: C.g600 }}>← Back</button>
                <button onClick={handleSend} disabled={codeInput.length !== 6 || sending}
                  className="flex-1 py-3.5 rounded-2xl text-white font-black text-sm transition disabled:opacity-40"
                  style={{ background: codeInput.length === 6 && !sending ? 'linear-gradient(135deg, #ef4444, #dc2626)' : '#94a3b8', boxShadow: codeInput.length === 6 && !sending ? '0 6px 20px rgba(239,68,68,0.4)' : 'none' }}>
                  {sending
                    ? <span className="flex items-center justify-center gap-2"><RefreshCw size={15} className="animate-spin" /> Sending…</span>
                    : <span className="flex items-center justify-center gap-2"><Send size={15} /> Confirm Send</span>}
                </button>
              </div>
            </div>
          )}
          </>}
        </div>
      </div>
    </div>
  );
}

// ─── USDT Internal Transfer Modal ─────────────────────────────────────────────
function UsdtInternalTransferModal({ balance, onClose, onTransfer, onSwitchToExternal }) {
  // steps: 'recipient' → 'amount' → 'preview' → 'success'
  const [step,          setStep]          = useState('recipient');
  const [mode,          setMode]          = useState('username');   // always 'username' for internal
  const [recipientInput, setRecipientInput] = useState('');
  const [amount,        setAmount]        = useState('');
  const [searching,     setSearching]     = useState(false);
  const [recipient,     setRecipient]     = useState(null);
  const [sending,       setSending]       = useState(false);
  const [result,        setResult]        = useState(null);
  const [err,           setErr]           = useState('');

  const bal    = parseFloat(balance || 0);
  const amt    = parseFloat(amount  || 0);
  // USDT ≈ $1 USD — show dollar equivalent
  const usdVal = amt > 0 ? amt.toFixed(2) : '0.00';
  const remaining = Math.max(0, bal - amt);

  const isTronAddr = v => /^T[A-Za-z1-9]{33}$/.test(v.trim());

  const handleRecipientContinue = async () => {
    const raw = recipientInput.trim().replace(/^@/, '');
    if (!raw) { setErr('Enter a PRAQEN username'); return; }

    setSearching(true); setErr('');
    try {
      const r = await axios.get(`${API_URL}/users/${encodeURIComponent(raw)}`);
      const u = r.data?.user || r.data;
      if (!u?.username) { setErr('User not found on PRAQEN'); return; }
      setRecipient({ ...u, displayName: `@${u.username}`, isTronAddr: false });
      setStep('amount');
    } catch (e) {
      setErr(e.response?.data?.error || 'User not found on PRAQEN');
    } finally { setSearching(false); }
  };

  const handleAmountContinue = () => {
    if (!amt || amt <= 0) { setErr('Enter a valid USDT amount'); return; }
    if (amt < 0.01)       { setErr('Minimum transfer is ₮0.01 USDT'); return; }
    if (amt > bal)        { setErr(`Insufficient balance. Available: ₮${bal.toFixed(2)}`); return; }
    setErr('');
    setStep('preview');
  };

  const handleSend = async () => {
    setSending(true); setErr('');
    try {
      const payload = recipient.isTronAddr
        ? { toTronAddress: recipient.tronAddress, amountUsdt: amt }
        : { toUsername: recipient.username, amountUsdt: amt };
      const res = await onTransfer(payload);
      setResult(res);
      setStep('success');
    } catch (e) {
      setErr(e.response?.data?.error || e.message || 'Transfer failed');
      setStep('preview');
    } finally { setSending(false); }
  };

  const ErrBox = ({ msg }) => msg ? (
    <div className="flex items-start gap-2.5 px-4 py-3 rounded-2xl" style={{ background: '#fef2f2', border: '1px solid #fecaca' }}>
      <span className="text-red-500 mt-0.5 flex-shrink-0"><X size={13} /></span>
      <p className="text-xs font-bold" style={{ color: '#dc2626' }}>{msg}</p>
    </div>
  ) : null;

  return (
    <div className="fixed inset-0 z-[1100] flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}>
      <div className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-2xl"
        style={{ backgroundColor: '#fff', maxHeight: '96dvh', overflowY: 'auto' }}>

        {/* ── Header ── */}
        <div className="relative px-6 pt-6 pb-5"
          style={{ background: `linear-gradient(145deg, ${C.forest} 0%, ${C.green} 60%, #26A17B 100%)` }}>
          {/* decorative circle */}
          <div className="absolute top-0 right-0 w-40 h-40 rounded-full opacity-10"
            style={{ background: 'radial-gradient(circle, #fff 0%, transparent 70%)', transform: 'translate(30%,-30%)' }} />

          <div className="flex items-center justify-between relative">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl flex items-center justify-center"
                style={{ background: 'rgba(255,255,255,0.16)', border: '1px solid rgba(255,255,255,0.25)' }}>
                {/* Tether logo */}
                <svg width="22" height="22" viewBox="0 0 32 32" fill="none">
                  <circle cx="16" cy="16" r="16" fill="#26A17B"/>
                  <path d="M17.922 17.383v-.002c-.11.008-.677.042-1.942.042-1.01 0-1.721-.03-1.971-.042v.003c-3.888-.171-6.79-.848-6.79-1.658 0-.809 2.902-1.486 6.79-1.66v2.644c.254.018.982.061 1.988.061 1.207 0 1.812-.05 1.925-.06v-2.643c3.88.173 6.775.85 6.775 1.658 0 .81-2.895 1.485-6.775 1.657m0-3.59v-2.366h5.414V7.819H8.595v3.608h5.414v2.365c-4.4.202-7.709 1.073-7.709 2.117 0 1.045 3.309 1.915 7.709 2.118v7.582h3.913v-7.584c4.393-.202 7.694-1.073 7.694-2.116 0-1.043-3.301-1.914-7.694-2.116" fill="#fff"/>
                </svg>
              </div>
              <div>
                <p className="text-white font-black text-base tracking-wide">Transfer USDT</p>
                <p className="text-xs font-semibold" style={{ color: 'rgba(255,255,255,0.55)' }}>
                  {step === 'recipient' ? 'Find recipient' : step === 'amount' ? 'Enter amount' : step === 'preview' ? 'Review transfer' : 'Transfer complete'}
                </p>
              </div>
            </div>
            <button onClick={onClose}
              className="w-9 h-9 rounded-full flex items-center justify-center transition active:scale-90"
              style={{ background: 'rgba(255,255,255,0.16)' }}>
              <X size={16} color="#fff" />
            </button>
          </div>

          {/* Balance + step progress */}
          <div className="flex items-center justify-between mt-4 relative">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl"
              style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.18)' }}>
              <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#26A17B' }}>
                <span className="text-white font-black" style={{ fontSize: 9 }}>₮</span>
              </div>
              <span className="text-white text-xs font-bold">₮{bal.toFixed(2)} available</span>
            </div>
            {/* Step dots */}
            <div className="flex items-center gap-1.5">
              {['recipient','amount','preview'].map((s, i) => (
                <div key={s} className="rounded-full transition-all"
                  style={{
                    width: step === s ? 20 : 6, height: 6,
                    backgroundColor: ['recipient','amount','preview','success'].indexOf(step) >= i ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.3)',
                  }} />
              ))}
            </div>
          </div>
        </div>

        <div className="px-6 py-5 space-y-4">

          {/* ══ STEP 1: Recipient ══════════════════════════════════════════ */}
          {step === 'recipient' && (
            <>
              {/* ── Destination toggle: PRAQEN user (this modal) vs external wallet ── */}
              <div className="flex rounded-2xl overflow-hidden" style={{ border: `1.5px solid ${C.g200}` }}>
                <button onClick={onSwitchToExternal}
                  className="flex-1 py-3 text-center font-black text-xs transition hover:bg-gray-50"
                  style={{ color: C.g500 }}>
                  External Wallet
                </button>
                <div className="flex-1 py-3 text-center font-black text-xs"
                  style={{ background: 'linear-gradient(135deg, #6366f1, #4f46e5)', color: '#fff' }}>
                  PRAQEN User
                </div>
              </div>

              {/* Input */}
              <div>
                <label className="block text-xs font-black mb-2 uppercase tracking-wide" style={{ color: C.g500 }}>
                  PRAQEN Username
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-sm select-none"
                      style={{ color: C.g400 }}>@</span>
                    <input
                      type="text"
                      value={recipientInput}
                      onChange={e => { setRecipientInput(e.target.value); setErr(''); }}
                      onKeyDown={e => e.key === 'Enter' && handleRecipientContinue()}
                      placeholder="username"
                      className="w-full pl-8 pr-4 py-3.5 rounded-2xl text-sm font-semibold focus:outline-none transition"
                      style={{ border: `2px solid ${err ? '#fca5a5' : C.g200}`, backgroundColor: C.g50, color: C.g800 }}
                      autoFocus
                    />
                  </div>
                  <button onClick={handleRecipientContinue}
                    disabled={searching || !recipientInput.trim()}
                    className="px-5 rounded-2xl font-black text-white text-sm transition disabled:opacity-40 flex items-center gap-1.5 flex-shrink-0"
                    style={{ background: `linear-gradient(135deg, ${C.forest}, ${C.green})`, boxShadow: `0 4px 14px ${C.forest}40` }}>
                    {searching ? <RefreshCw size={14} className="animate-spin" /> : 'Next →'}
                  </button>
                </div>
              </div>

              <ErrBox msg={err} />

              {/* Info box */}
              <div className="rounded-2xl p-4 space-y-2.5"
                style={{ background: `linear-gradient(135deg, ${C.mist}, #f0fdf8)`, border: `1px solid ${C.sage}30` }}>
                {[
                  { icon: <Zap size={14} style={{ color: C.green }} />, text: 'Instant settlement — no blockchain delay' },
                  { icon: <Gift size={14} style={{ color: C.green }} />, text: 'Zero fees — completely free between PRAQEN users' },
                  { icon: <Lock size={14} style={{ color: C.green }} />, text: 'Username search only — use Send (on-chain) for external wallets' },
                ].map(({ icon, text }) => (
                  <div key={text} className="flex items-start gap-2.5">
                    <span className="flex-shrink-0 mt-0.5">{icon}</span>
                    <p className="text-xs font-semibold" style={{ color: C.green }}>{text}</p>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* ══ STEP 2: Amount ════════════════════════════════════════════ */}
          {step === 'amount' && recipient && (
            <>
              {/* Recipient preview chip */}
              <div className="flex items-center gap-3 px-4 py-3 rounded-2xl"
                style={{ background: `linear-gradient(135deg, ${C.mist}, #f0fdf8)`, border: `1.5px solid ${C.sage}35` }}>
                <div className="w-10 h-10 rounded-full flex items-center justify-center font-black text-white flex-shrink-0"
                  style={{ background: `linear-gradient(135deg, ${C.forest}, ${C.green})` }}>
                  {recipient.isTronAddr ? '₮' : (recipient.username?.[0]?.toUpperCase() || 'U')}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-black text-sm truncate" style={{ color: C.forest }}>
                    {recipient.displayName}
                  </p>
                  {recipient.full_name && <p className="text-xs truncate" style={{ color: C.green }}>{recipient.full_name}</p>}
                  {recipient.isTronAddr && <p className="text-xs font-semibold" style={{ color: C.sage }}>Tron address · PRAQEN internal</p>}
                </div>
                <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ background: `linear-gradient(135deg, ${C.green}, ${C.mint})` }}>
                  <span className="text-white text-xs font-black"><Check size={12} /></span>
                </div>
              </div>

              {/* Amount input */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-black uppercase tracking-wide" style={{ color: C.g500 }}>Amount</label>
                  <button onClick={() => { setAmount(bal.toFixed(2)); setErr(''); }}
                    className="text-xs font-black px-2.5 py-1 rounded-lg"
                    style={{ background: `${C.sage}25`, color: C.green }}>
                    MAX ₮{bal.toFixed(2)}
                  </button>
                </div>

                {/* USDT input */}
                <div className="rounded-2xl overflow-hidden" style={{ border: `2px solid ${err ? '#fca5a5' : C.g200}`, backgroundColor: C.g50 }}>
                  <div className="flex items-center gap-3 px-4 py-4">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 shadow-md"
                      style={{ backgroundColor: '#26A17B' }}>
                      <span className="text-white font-black text-base">₮</span>
                    </div>
                    <div className="flex-1">
                      <input type="number" value={amount}
                        onChange={e => { setAmount(e.target.value); setErr(''); }}
                        onKeyDown={e => e.key === 'Enter' && handleAmountContinue()}
                        placeholder="0.00" step="0.01" min="0.01"
                        className="w-full text-3xl font-black bg-transparent focus:outline-none leading-none"
                        style={{ color: C.g800 }} autoFocus />
                      <p className="text-xs font-semibold mt-1" style={{ color: C.g400 }}>USDT · Tether</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-xs font-black px-2 py-1 rounded-lg" style={{ background: `${C.gold}15`, color: C.gold }}>
                        ≈ USD
                      </div>
                    </div>
                  </div>

                  {/* USD equivalent row */}
                  <div className="flex items-center justify-between px-4 py-3"
                    style={{ background: `linear-gradient(135deg, ${C.mist}60, #f0fdf8)`, borderTop: `1px solid ${C.g100}` }}>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold px-2 py-0.5 rounded" style={{ background: '#d1fae5', color: '#065f46' }}>USD</span>
                      <span className="text-sm font-black" style={{ color: C.forest }}>
                        $ {usdVal}
                      </span>
                    </div>
                    <p className="text-xs font-semibold" style={{ color: C.g400 }}>1 USDT ≈ $1.00 USD</p>
                  </div>
                </div>

                {/* Remaining balance indicator */}
                {amt > 0 && amt <= bal && (
                  <div className="mt-2 flex items-center justify-between px-3.5 py-2.5 rounded-xl"
                    style={{ background: `${C.forest}08`, border: `1px solid ${C.sage}25` }}>
                    <span className="text-xs font-semibold" style={{ color: C.g500 }}>Balance after transfer</span>
                    <span className="text-xs font-black" style={{ color: remaining < bal * 0.1 ? '#f59e0b' : C.green }}>
                      ₮{remaining.toFixed(2)} USDT · ≈ ${remaining.toFixed(2)}
                    </span>
                  </div>
                )}

                {/* Fee note */}
                <div className="mt-2 flex items-center justify-between px-3.5 py-2"
                  style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 12 }}>
                  <span className="text-xs font-semibold" style={{ color: '#047857' }}>Platform fee</span>
                  <span className="text-xs font-black" style={{ color: '#065f46' }}>₮ 0.00 · FREE</span>
                </div>
              </div>

              <ErrBox msg={err} />

              <div className="flex gap-3 pt-1">
                <button onClick={() => { setStep('recipient'); setErr(''); }}
                  className="py-3.5 px-5 rounded-2xl border font-bold text-sm transition hover:bg-gray-50"
                  style={{ borderColor: C.g200, color: C.g600 }}>← Back</button>
                <button onClick={handleAmountContinue}
                  disabled={!amount || amt <= 0}
                  className="flex-1 py-3.5 rounded-2xl text-white font-black text-sm flex items-center justify-center gap-2 transition disabled:opacity-40"
                  style={{
                    background: !amount || amt <= 0 ? '#94a3b8' : `linear-gradient(135deg, ${C.forest}, ${C.green})`,
                    boxShadow: amount && amt > 0 ? `0 6px 20px ${C.forest}45` : 'none',
                  }}>
                  Preview Transfer →
                </button>
              </div>
            </>
          )}

          {/* ══ STEP 3: Preview ═══════════════════════════════════════════ */}
          {step === 'preview' && recipient && (
            <>
              <div className="text-center pb-1">
                <p className="font-black text-base" style={{ color: C.g800 }}>Review your transfer</p>
                <p className="text-xs font-semibold mt-0.5" style={{ color: C.g400 }}>Double-check the details before sending</p>
              </div>

              {/* Big amount display */}
              <div className="rounded-3xl p-5 text-center relative overflow-hidden"
                style={{ background: `linear-gradient(145deg, ${C.forest} 0%, ${C.green} 100%)` }}>
                <div className="absolute inset-0 opacity-10"
                  style={{ background: 'radial-gradient(circle at 70% 30%, #fff 0%, transparent 60%)' }} />
                <p className="text-xs font-bold text-white/60 uppercase tracking-widest mb-2">You are sending</p>
                <div className="flex items-baseline justify-center gap-2 mb-1">
                  <span className="text-5xl font-black text-white">₮{amt.toFixed(2)}</span>
                  <span className="text-xl font-bold text-white/70">USDT</span>
                </div>
                <p className="text-sm font-bold" style={{ color: 'rgba(255,255,255,0.55)' }}>≈ ${usdVal} USD</p>
                <div className="flex items-center justify-center gap-1.5 mt-3 px-3 py-1.5 rounded-full inline-flex mx-auto"
                  style={{ background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.22)' }}>
                  <span className="text-xs font-black text-white">→</span>
                  <span className="text-xs font-bold text-white/80">{recipient.displayName}</span>
                </div>
              </div>

              {/* Detail rows */}
              <div className="rounded-2xl overflow-hidden" style={{ border: `1.5px solid ${C.g200}` }}>
                {[
                  { label: 'Recipient',       val: recipient.displayName,                          mono: false },
                  { label: 'Network',         val: 'PRAQEN Internal (TRC-20)',                     mono: false },
                  { label: 'Amount (USDT)',   val: `₮ ${amt.toFixed(2)}`,                         mono: false },
                  { label: 'Amount (USD)',    val: `$ ${usdVal}`,                                  mono: false },
                  { label: 'Platform fee',    val: '₮ 0.00  (100% Free)',                         mono: false },
                  { label: 'You will have',   val: `₮ ${remaining.toFixed(2)} USDT  ·  $ ${remaining.toFixed(2)}`, mono: false },
                  { label: 'Settlement',      val: 'Instant',                                       mono: false },
                ].map(({ label, val, mono }, i) => (
                  <div key={label} className="flex items-center justify-between px-4 py-3"
                    style={{
                      borderTop: i > 0 ? `1px solid ${C.g100}` : 'none',
                      backgroundColor: i % 2 === 0 ? C.g50 : '#fff',
                    }}>
                    <span className="text-xs font-semibold" style={{ color: C.g500 }}>{label}</span>
                    <span className="text-xs font-black text-right" style={{ color: C.forest, fontFamily: mono ? 'monospace' : 'inherit' }}>{val}</span>
                  </div>
                ))}
              </div>

              {/* Warning if Tron address */}
              {recipient.isTronAddr && (
                <div className="flex items-start gap-2.5 px-4 py-3 rounded-2xl"
                  style={{ background: '#fffbeb', border: '1.5px solid #fcd34d' }}>
                  <span className="text-yellow-500 flex-shrink-0 mt-0.5"><AlertTriangle size={14} /></span>
                  <p className="text-xs font-semibold" style={{ color: '#92400e' }}>
                    Sending to a Tron address. This is an internal PRAQEN transfer — the recipient must be a PRAQEN user. Transfers cannot be reversed.
                  </p>
                </div>
              )}

              <ErrBox msg={err} />

              <div className="flex gap-3 pt-1">
                <button onClick={() => { setStep('amount'); setErr(''); }}
                  className="py-3.5 px-5 rounded-2xl border font-bold text-sm transition hover:bg-gray-50"
                  style={{ borderColor: C.g200, color: C.g600 }}>← Edit</button>
                <button onClick={handleSend} disabled={sending}
                  className="flex-1 py-4 rounded-2xl text-white font-black text-sm flex items-center justify-center gap-2 transition disabled:opacity-50 active:scale-[0.98]"
                  style={{
                    background: sending ? '#94a3b8' : `linear-gradient(135deg, ${C.forest} 0%, ${C.green} 100%)`,
                    boxShadow: !sending ? `0 8px 24px ${C.forest}50` : 'none',
                  }}>
                  {sending
                    ? <><RefreshCw size={15} className="animate-spin" /> Sending…</>
                    : <><ArrowLeftRight size={15} /> Confirm & Send ₮{amt.toFixed(2)}</>}
                </button>
              </div>
            </>
          )}

          {/* ══ STEP 4: Success ═══════════════════════════════════════════ */}
          {step === 'success' && result && (
            <div className="text-center py-3 space-y-5">
              {/* Animated check */}
              <div className="relative mx-auto w-24 h-24">
                <div className="w-24 h-24 rounded-full flex items-center justify-center"
                  style={{ background: `linear-gradient(135deg, ${C.forest} 0%, ${C.green} 60%, #26A17B 100%)`, boxShadow: `0 16px 48px ${C.forest}55` }}>
                  <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
                    <path d="M8 20l9 9 15-17" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
              </div>

              <div>
                <p className="text-2xl font-black" style={{ color: C.forest }}>Transfer Sent!</p>
                <p className="text-sm font-semibold mt-1" style={{ color: C.g500 }}>
                  Your USDT arrived instantly
                </p>
              </div>

              {/* Receipt card */}
              <div className="rounded-2xl overflow-hidden text-left" style={{ border: `1.5px solid ${C.sage}40` }}>
                <div className="px-4 py-3" style={{ background: `linear-gradient(135deg, ${C.mist}, #f0fdf8)`, borderBottom: `1px solid ${C.sage}25` }}>
                  <p className="text-xs font-black uppercase tracking-widest" style={{ color: C.green }}>Transfer Receipt</p>
                </div>
                {[
                  { label: 'Sent to',       val: `${result.to ? '@' : ''}${result.to || recipient.displayName}` },
                  { label: 'Amount USDT',   val: `₮ ${parseFloat(result.amount_usdt).toFixed(2)}` },
                  { label: 'Amount USD',    val: `$ ${parseFloat(result.amount_usdt).toFixed(2)}` },
                  { label: 'Fee',           val: '₮ 0.00  (Free)' },
                  { label: 'New balance',   val: `₮ ${parseFloat(result.new_balance).toFixed(2)} USDT` },
                  { label: 'Reference',     val: result.txRef },
                ].map(({ label, val }, i) => (
                  <div key={label} className="flex items-center justify-between px-4 py-2.5"
                    style={{ borderTop: i > 0 ? `1px solid ${C.g100}` : 'none', backgroundColor: i % 2 === 0 ? C.g50 : '#fff' }}>
                    <span className="text-xs font-semibold" style={{ color: C.g500 }}>{label}</span>
                    <span className="text-xs font-black" style={{
                      color: C.forest,
                      fontFamily: label === 'Reference' ? 'monospace' : 'inherit',
                      fontSize: label === 'Reference' ? 10 : 'inherit',
                    }}>{val}</span>
                  </div>
                ))}
              </div>

              <button onClick={onClose}
                className="w-full py-4 rounded-2xl text-white font-black text-sm transition active:scale-[0.98]"
                style={{
                  background: `linear-gradient(135deg, ${C.forest} 0%, ${C.green} 100%)`,
                  boxShadow: `0 8px 24px ${C.forest}45`,
                }}>
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Small Tether glyph (reused by switcher / picker) ─────────────────────────
function TetherGlyph({ size = 16, color = '#fff' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <path d="M17.6 15.73v-2.05h4.35V10.5H10.07v3.18H14.4v2.05C10.6 15.9 7.8 16.72 7.8 17.7s2.8 1.8 6.6 1.97v7.03h3.2v-7.03c3.8-.17 6.6-.99 6.6-1.97s-2.8-1.8-6.6-1.97zm0 3.32c-.18.01-.62.04-1.62.04-.86 0-1.46-.02-1.67-.04v.01c-2.89-.13-5.05-.63-5.05-1.25s2.16-1.11 5.05-1.24v1.97c.21.01.82.05 1.68.05.98 0 1.45-.04 1.61-.05v-1.97c2.9.13 5.06.63 5.06 1.24s-2.16 1.12-5.06 1.25v-.01z" fill={color} />
    </svg>
  );
}

// ─── Wallet Switcher — compact dropdown embedded in the wallet card header ────
// Replaces the old 3-wide tab strip so BTC/USDT/Swap live inside one shared card space.
function WalletSwitcher({ activeCoin, onSelect, dark, pulse }) {
  const [open, setOpen] = useState(false);
  const options = [
    { key: 'BTC',  label: 'Bitcoin', sub: 'BTC Network',   bg: 'linear-gradient(135deg,#F7931A,#e8830a)', icon: <span style={{ fontSize: 13, fontWeight: 900, color: '#fff' }}>₿</span> },
    { key: 'USDT', label: 'Tether',  sub: 'TRC-20',        bg: '#26A17B',                                   icon: <TetherGlyph size={14} /> },
    { key: 'SWAP', label: 'Swap',    sub: 'BTC ↔ USDT',    bg: 'linear-gradient(135deg,#6366f1,#4f46e5)',   icon: <ArrowLeftRight size={13} style={{ color: '#fff' }} /> },
  ];

  return (
    <div className="relative">
      <button onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1 px-1.5 py-0.5 rounded-lg transition relative"
        style={{
          backgroundColor: dark ? 'rgba(255,255,255,0.12)' : C.g100,
          boxShadow: pulse && !open ? '0 0 0 3px rgba(38,161,123,0.45)' : 'none',
        }}>
        {pulse && !open && (
          <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full animate-ping"
            style={{ backgroundColor: '#26A17B' }} />
        )}
        {pulse && !open && (
          <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full"
            style={{ backgroundColor: '#26A17B' }} />
        )}
        <div className="flex items-center flex-shrink-0" style={{ marginRight: 2 }}>
          <div className="w-4 h-4 rounded-full flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg,#F7931A,#e8830a)', border: '1.5px solid rgba(255,255,255,0.9)', zIndex: 1 }}>
            <span style={{ fontSize: 8, fontWeight: 900, color: '#fff', lineHeight: 1 }}>₿</span>
          </div>
          <div className="w-4 h-4 rounded-full flex items-center justify-center"
            style={{ background: '#26A17B', border: '1.5px solid rgba(255,255,255,0.9)', marginLeft: -6, zIndex: 2 }}>
            <TetherGlyph size={8} />
          </div>
        </div>
        <span className="text-xs font-black" style={{ color: dark ? '#fff' : C.g700 }}>Select Asset</span>
        <ChevronDown size={12} style={{ color: dark ? 'rgba(255,255,255,0.7)' : C.g500, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-2 w-48 rounded-2xl shadow-xl overflow-hidden z-20"
            style={{ backgroundColor: '#fff', border: `1px solid ${C.g200}` }}>
            {options.map(opt => (
              <button key={opt.key} onClick={() => { onSelect(opt.key); setOpen(false); }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-gray-50 transition"
                style={{ backgroundColor: activeCoin === opt.key ? C.mist : 'transparent' }}>
                <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: opt.bg }}>
                  {opt.icon}
                </div>
                <div className="text-left flex-1 min-w-0">
                  <p className="text-xs font-black" style={{ color: C.g800 }}>{opt.label}</p>
                  <p className="text-xs" style={{ color: C.g400 }}>{opt.sub}</p>
                </div>
                {activeCoin === opt.key && <CheckCircle size={13} style={{ color: C.success, flexShrink: 0 }} />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Asset Picker Sheet — shown when Send / Receive / Transfer is tapped ──────
// Lets the user choose which asset (BTC or USDT) the action applies to before
// the real modal opens, so Send/Receive/Transfer work from either wallet view.
function AssetPickerSheet({ title, subtitle, onPick, onClose }) {
  return (
    <div className="fixed inset-0 z-[1100] flex items-end md:items-center justify-center p-0 md:p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}>
      <div className="bg-white w-full md:max-w-xs rounded-t-3xl md:rounded-3xl overflow-hidden shadow-2xl"
        onClick={e => e.stopPropagation()}>
        <div className="px-5 pt-5 pb-3 flex items-center justify-between">
          <div>
            <p className="font-black text-sm" style={{ color: C.g800 }}>{title}</p>
            {subtitle && <p className="text-xs mt-0.5" style={{ color: C.g400 }}>{subtitle}</p>}
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-xl flex items-center justify-center hover:bg-gray-100">
            <X size={14} style={{ color: C.g500 }} />
          </button>
        </div>
        <div className="px-4 pb-5 space-y-2">
          <button onClick={() => onPick('BTC')}
            className="w-full flex items-center gap-3 p-3.5 rounded-2xl border hover:bg-gray-50 transition active:scale-[0.98]"
            style={{ borderColor: C.g200 }}>
            <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ background: 'linear-gradient(135deg,#F7931A,#e8830a)' }}>
              <span style={{ fontSize: 18, fontWeight: 900, color: '#fff' }}>₿</span>
            </div>
            <div className="text-left flex-1 min-w-0">
              <p className="font-black text-sm" style={{ color: C.g800 }}>Bitcoin</p>
              <p className="text-xs" style={{ color: C.g400 }}>BTC · On-chain</p>
            </div>
            <ChevronRight size={16} style={{ color: C.g300, flexShrink: 0 }} />
          </button>
          <button onClick={() => onPick('USDT')}
            className="w-full flex items-center gap-3 p-3.5 rounded-2xl border hover:bg-gray-50 transition active:scale-[0.98]"
            style={{ borderColor: C.g200 }}>
            <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: '#26A17B' }}>
              <TetherGlyph size={20} />
            </div>
            <div className="text-left flex-1 min-w-0">
              <p className="font-black text-sm" style={{ color: C.g800 }}>Tether</p>
              <p className="text-xs" style={{ color: C.g400 }}>USDT · TRC-20</p>
            </div>
            <ChevronRight size={16} style={{ color: C.g300, flexShrink: 0 }} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Asset Action Sheet — shown when an Assets row (Bitcoin / Tether) is tapped ──
// Coin is already known here, so it skips straight to Send/Receive/Transfer/Swap for it.
function AssetActionSheet({ asset, balanceLabel, usdLabel, onAction, onClose }) {
  const isBtc = asset === 'BTC';
  const actions = [
    { key: 'send',     label: 'Send',     icon: Send },
    { key: 'receive',  label: 'Receive',  icon: Download },
    { key: 'transfer', label: 'Transfer', icon: ArrowUpRight },
    { key: 'swap',     label: 'Swap',     icon: ArrowLeftRight },
  ];
  return (
    <div className="fixed inset-0 z-[1100] flex items-end md:items-center justify-center p-0 md:p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}>
      <div className="bg-white w-full md:max-w-xs rounded-t-3xl md:rounded-3xl overflow-hidden shadow-2xl"
        onClick={e => e.stopPropagation()}>
        <div className="px-5 pt-5 pb-4 flex items-center gap-3 border-b" style={{ borderColor: C.g100 }}>
          <div className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0"
            style={isBtc ? { background: 'linear-gradient(135deg,#F7931A,#e8830a)' } : { background: '#26A17B' }}>
            {isBtc ? <span style={{ fontSize: 19, fontWeight: 900, color: '#fff' }}>₿</span> : <TetherGlyph size={21} />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-black text-sm" style={{ color: C.g800 }}>{isBtc ? 'Bitcoin' : 'Tether USD'}</p>
            <p className="text-xs" style={{ color: C.g400 }}>{balanceLabel}{usdLabel ? ` · ${usdLabel}` : ''}</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-xl flex items-center justify-center hover:bg-gray-100 flex-shrink-0">
            <X size={14} style={{ color: C.g500 }} />
          </button>
        </div>
        <div className="px-3 py-4 grid grid-cols-4 gap-1.5 sm:gap-2">
          {actions.map(({ key, label, icon: Icon }) => (
            <button key={key} onClick={() => onAction(key)}
              className="flex flex-col items-center gap-1.5 sm:gap-2 py-3 px-1 rounded-2xl border hover:bg-gray-50 transition active:scale-[0.98]"
              style={{ borderColor: C.g200 }}>
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: C.mist }}>
                <Icon size={15} style={{ color: C.green }} />
              </div>
              <span className="text-[11px] sm:text-xs font-bold text-center leading-tight whitespace-nowrap" style={{ color: C.g700 }}>{label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── USDT Receive Modal ────────────────────────────────────────────────────────
function UsdtReceiveModal({ address, onClose, checking, scanCooldown, onCheckDeposits }) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    copyToClipboard(address, 'Tron address copied!')
      .then((ok) => { if (ok) setCopied(true); setTimeout(() => setCopied(false), 3000); });
  };

  const explorerUrl = `https://tronscan.org/#/address/${address}`;

  return (
    <div className="fixed inset-0 z-[1100] flex items-end md:items-center justify-center p-0 md:p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }}>
      <div className="bg-white w-full md:max-w-sm rounded-t-2xl md:rounded-2xl overflow-hidden shadow-2xl">
        <div className="px-5 py-4 border-b flex items-center justify-between" style={{ borderColor: C.g100 }}>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#26A17B15' }}>
              <ArrowDownLeft size={15} style={{ color: '#26A17B' }} />
            </div>
            <h2 className="font-black text-sm" style={{ color: C.g800 }}>Deposit USDT</h2>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-xl flex items-center justify-center hover:bg-gray-100">
            <X size={14} style={{ color: C.g500 }} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-xs text-gray-500">Send USDT (TRC-20) to your Tron address. Credited after network confirmation.</p>

          {address ? (
            <div className="flex justify-center p-4 rounded-xl border" style={{ borderColor: C.g200, backgroundColor: '#fff' }}>
              <QRCodeSVG value={address} size={168} level="M" includeMargin={false} />
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-2 p-8 rounded-xl border" style={{ borderColor: C.g200, backgroundColor: C.g50 }}>
              <RefreshCw size={18} className="animate-spin" style={{ color: C.g400 }} />
              <p className="text-xs font-semibold" style={{ color: C.g400 }}>Generating your address…</p>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold mb-1.5 text-gray-600">Your Tron (USDT-TRC20) Address</label>
            <div className="p-3 rounded-xl border font-mono text-xs break-all"
              style={{ borderColor: C.g200, backgroundColor: C.g50, color: C.g700 }}>
              {address || 'Loading…'}
            </div>
          </div>

          <button onClick={copy} disabled={!address}
            className="w-full py-3 rounded-xl text-white font-black text-sm flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-40"
            style={{ backgroundColor: copied ? C.success : '#26A17B' }}>
            {copied ? <><CheckCircle size={15} /> Copied!</> : <><Copy size={15} /> Copy Address</>}
          </button>

          {address && (
            <button onClick={onCheckDeposits} disabled={checking || scanCooldown > 0}
              className="w-full py-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 hover:bg-gray-50 transition disabled:opacity-50"
              style={{ borderColor: C.g200, color: C.g600 }}>
              {checking
                ? <><RefreshCw size={12} className="animate-spin" /> Scanning…</>
                : <><Zap size={12} style={{ color: C.gold }} /> {scanCooldown > 0 ? `Scan available in ${scanCooldown}s` : 'Check for New Deposits'}</>}
            </button>
          )}

          {address && (
            <a href={explorerUrl} target="_blank" rel="noopener noreferrer"
              className="w-full py-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 hover:bg-gray-50"
              style={{ borderColor: C.g200, color: C.g600 }}>
              View on Tronscan Explorer ↗
            </a>
          )}

          <div className="flex items-start gap-2 p-3 rounded-xl" style={{ backgroundColor: '#FFFBEB', border: '1px solid #FDE68A' }}>
            <AlertTriangle size={12} style={{ color: '#d97706', flexShrink: 0, marginTop: 1 }} />
            <p className="text-xs font-semibold" style={{ color: '#92400e' }}>
              Only send <strong>USDT TRC-20</strong> to this address. Other coins or networks will be lost permanently.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── P2P Trade Promo Banner — big, attractive CTA that replaces the old address card ──
function P2PPromoBanner({ navigate }) {
  return (
    <div className="rounded-3xl overflow-hidden shadow-lg relative"
      style={{ background: `linear-gradient(150deg, ${C.forest} 0%, ${C.green} 55%, #0d3d2a 100%)` }}>
      {/* decorative glow circles */}
      <div className="absolute -top-14 -right-10 w-48 h-48 rounded-full pointer-events-none"
        style={{ background: `radial-gradient(circle, ${C.gold}33 0%, transparent 70%)` }} />
      <div className="absolute -bottom-12 -left-10 w-40 h-40 rounded-full pointer-events-none"
        style={{ background: `radial-gradient(circle, ${C.mint}30 0%, transparent 70%)` }} />

      <div className="relative p-4 sm:p-6">
        <span className="inline-flex items-center gap-1.5 text-xs font-black px-2.5 py-1 rounded-full mb-2.5"
          style={{ background: 'rgba(244,164,34,0.22)', color: '#FCD34D', border: '1px solid rgba(252,211,77,0.35)' }}>
          <Flame size={11} /> P2P Marketplace
        </span>

        <p className="text-white font-black leading-snug mb-1.5" style={{ fontSize: 'clamp(1rem, 4.5vw, 1.3rem)' }}>
          Trade Crypto, Get Paid Instantly
        </p>
        <p className="text-white/70 text-xs leading-relaxed mb-3 sm:mb-4 max-w-sm">
          Buy or sell Bitcoin &amp; USDT directly with real people. Cash lands in your MTN MoMo or bank account in minutes — no waiting.
        </p>

        {/* Feature badges */}
        <div className="flex flex-wrap gap-1.5 sm:gap-2 mb-4 sm:mb-5">
          {[
            { icon: <Smartphone size={12} />, label: 'MTN MoMo' },
            { icon: <Landmark size={12} />,   label: 'Bank Transfer' },
            { icon: <Zap size={12} />,        label: 'Instant Payout' },
            { icon: <Shield size={12} />,     label: 'Escrow Protected' },
          ].map(({ icon, label }) => (
            <span key={label} className="flex items-center gap-1.5 text-xs font-bold px-2 py-1 sm:px-2.5 sm:py-1.5 rounded-xl"
              style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', border: '1px solid rgba(255,255,255,0.15)' }}>
              <span>{icon}</span>{label}
            </span>
          ))}
        </div>

        {/* CTAs */}
        <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
          <button onClick={() => navigate('/sell-bitcoin')}
            className="py-3 sm:py-3.5 rounded-2xl font-black text-xs sm:text-sm flex items-center justify-center gap-1.5 active:scale-95 transition"
            style={{ background: '#fff', color: C.forest, boxShadow: '0 6px 18px rgba(0,0,0,0.18)' }}>
            Sell Now <ChevronRight size={14} />
          </button>
          <button onClick={() => navigate('/buy-bitcoin')}
            className="py-3 sm:py-3.5 rounded-2xl text-white font-black text-xs sm:text-sm flex items-center justify-center gap-1.5 active:scale-95 transition"
            style={{ background: 'rgba(255,255,255,0.14)', border: '1.5px solid rgba(255,255,255,0.28)' }}>
            Buy Now <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Wallet Page ──────────────────────────────────────────────────────────
export default function WalletPage({ user }) {
  const navigate = useNavigate();
  const { rates: USD_RATES } = useRates();

  const [walletData,       setWalletData]       = useState(null);
  const [lockedBtc,        setLockedBtc]        = useState(0);
  const [transactions,     setTransactions]     = useState([]);
  const [btcPrice,         setBtcPrice]         = useState(0);
  const [loading,          setLoading]          = useState(true);
  const [refreshing,       setRefreshing]       = useState(false);
  const [checking,         setChecking]         = useState(false);
  const [showBal,          setShowBal]          = useState(true);
  const [showSend,         setShowSend]         = useState(false);
  const [showRecv,         setShowRecv]         = useState(false);
  const [showInternal,     setShowInternal]     = useState(false);
  const [repeatUsername,   setRepeatUsername]   = useState(null);
  const [selectedTx,       setSelectedTx]       = useState(null);
  const [displayCurrency,  setDisplayCurrency]  = useState(localStorage.getItem('praqen_currency') || 'USD');
  const [userVerif,        setUserVerif]        = useState(null);

  // USDT + Swap state — SWAP_FEE_PERCENT mirrors backend swapService.js
  const SWAP_FEE_PERCENT = 0.005; // 0.5%
  const [activeCoin,    setActiveCoin]    = useState('BTC');
  const [usdtData,      setUsdtData]      = useState(null);
  const [swapRate,      setSwapRate]      = useState(null);
  const [swapHistory,   setSwapHistory]   = useState([]);
  const [showUsdtSend,     setShowUsdtSend]     = useState(false);
  const [showUsdtInternal, setShowUsdtInternal] = useState(false);
  const [showUsdtRecv,     setShowUsdtRecv]     = useState(false);
  const [assetPicker,      setAssetPicker]      = useState(null); // { type: 'send' | 'receive' | 'transfer' }
  const [assetActionSheet, setAssetActionSheet] = useState(null); // 'BTC' | 'USDT' — opened from the Assets row tap
  const [showUsdtHint,     setShowUsdtHint]     = useState(() => !localStorage.getItem('praqen_usdt_hint_seen'));
  const dismissUsdtHint = () => { setShowUsdtHint(false); localStorage.setItem('praqen_usdt_hint_seen', '1'); };
  const [swapFrom,      setSwapFrom]      = useState('BTC');
  const [swapAmount,    setSwapAmount]    = useState('');
  const [swapInputMode, setSwapInputMode] = useState('native'); // 'native' | 'usd'
  const [swapUsdAmount, setSwapUsdAmount] = useState('');
  const [swapping,      setSwapping]      = useState(false);
  const [checkingUsdt,  setCheckingUsdt]  = useState(false);
  const [scanCooldown,  setScanCooldown]  = useState(0); // seconds remaining
  const [loadingUsdt,   setLoadingUsdt]   = useState(false);

  // Seller security deposit (only relevant to users who've listed gift cards for sale)
  const [depositStatus,   setDepositStatus]   = useState(null);
  const [depositReqLoading, setDepositReqLoading] = useState(false);

  const loadDepositStatus = async () => {
    try {
      const r = await axios.get(`${API_URL}/seller-deposit/status`, { headers: authH() });
      setDepositStatus(r.data);
    } catch { /* silent — most users have no deposit, this is not an error worth surfacing */ }
  };

  const requestDepositWithdrawal = async () => {
    setDepositReqLoading(true);
    try {
      await axios.post(`${API_URL}/seller-deposit/withdraw-request`, {}, { headers: authH() });
      toast.success('Withdrawal requested — awaiting admin approval.');
      loadDepositStatus();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to request withdrawal.');
    } finally {
      setDepositReqLoading(false);
    }
  };

  useEffect(() => { loadDepositStatus(); }, []);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;
    axios.get(`${API_URL}/users/profile`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => {
        const profile = res.data.user || res.data;
        if (profile.preferred_currency) {
          setDisplayCurrency(profile.preferred_currency);
          localStorage.setItem('praqen_currency', profile.preferred_currency);
        }
        setUserVerif({
          email: !!(profile.is_email_verified || profile.email_verified),
          phone: !!(profile.is_phone_verified  || profile.phone_verified),
          kyc:   !!(profile.is_id_verified     || profile.kyc_verified),
        });
      })
      .catch(() => {
        const saved = localStorage.getItem('praqen_currency');
        if (saved) setDisplayCurrency(saved);
      });
  }, []);

  // ── Load wallet from HD wallet endpoint ────────────────────────────────────
  const loadWallet = async () => {
    try {
      const r = await axios.get(`${API_URL}/hd-wallet/wallet`, { headers: authH() });
      setWalletData({
        address:       r.data.address,
        balance_btc:   r.data.balance_btc,
        locked_btc:    r.data.locked_btc ?? 0,
        // Use ?? not || so available_btc=0 (all funds locked) is preserved, not overwritten with total
        available_btc: r.data.available_btc != null ? r.data.available_btc : r.data.balance_btc,
        balance_usd:   parseFloat(r.data.balance_usd || 0),
        network:       r.data.network,
        has_address:   r.data.has_address,
      });
      setLockedBtc(r.data.locked_btc || 0);
      // Seed BTC price from API response so USD shows immediately (CoinGecko may be slower)
      if (r.data.btc_price && r.data.btc_price > 0) setBtcPrice(p => p > 0 ? p : r.data.btc_price);
      setTransactions(r.data.transactions || []);
    } catch (e) {
      console.error('[Wallet] Load error:', e.message);
      if (!toast.isActive('btc-wallet-load-error')) {
        // Custom close button wired directly to toast.dismiss(id) instead of the built-in
        // closeButton — the default X wasn't reliably dismissing this specific toastId'd
        // toast, so this bypasses whatever internal mechanism was involved entirely.
        toast.error(
          () => (
            <div className="flex items-center justify-between gap-3 w-full">
              <span>Failed to load wallet</span>
              <button
                onClick={(e) => { e.stopPropagation(); toast.dismiss('btc-wallet-load-error'); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, lineHeight: 0, flexShrink: 0 }}>
                <X size={14} />
              </button>
            </div>
          ),
          { toastId: 'btc-wallet-load-error', closeButton: false }
        );
      }
    }
  };

  // ── Fetch live BTC price ───────────────────────────────────────────────────
  const loadBtcPrice = async () => {
    try {
      const r = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd');
      setBtcPrice(r.data.bitcoin.usd);
    } catch {
      try {
        const r2 = await axios.get('https://api.coinbase.com/v2/prices/BTC-USD/spot');
        setBtcPrice(parseFloat(r2.data.data.amount));
      } catch {
        setBtcPrice(88000); // fallback
      }
    }
  };

  const loadUsdtWallet = async () => {
    setLoadingUsdt(true);
    try {
      const r = await axios.get(`${API_URL}/wallet/usdt`, { headers: authH() });
      setUsdtData({
        tron_address:        r.data.tron_address,
        balance_usdt:        parseFloat(r.data.balance_usdt        || 0),
        locked_balance_usdt: parseFloat(r.data.locked_balance_usdt || 0),
      });
    } catch {
      // Explicit isActive guard against re-firing under React 18 StrictMode double-invoke,
      // PLUS a custom close button wired directly to toast.dismiss(id) instead of the
      // built-in closeButton, which wasn't reliably dismissing this specific toast.
      if (!toast.isActive('usdt-wallet-load-error')) {
        toast.error(
          () => (
            <div className="flex items-center justify-between gap-3 w-full">
              <span>Failed to load USDT wallet</span>
              <button
                onClick={(e) => { e.stopPropagation(); toast.dismiss('usdt-wallet-load-error'); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, lineHeight: 0, flexShrink: 0 }}>
                <X size={14} />
              </button>
            </div>
          ),
          { toastId: 'usdt-wallet-load-error', closeButton: false }
        );
      }
    }
    finally { setLoadingUsdt(false); }
  };

  const loadSwapRate = async () => {
    try {
      const r = await axios.get(`${API_URL}/swap/rate`, { headers: authH() });
      setSwapRate(parseFloat(r.data.rate || 0));
    } catch { /* silent */ }
  };

  const loadSwapHistory = async () => {
    try {
      const r = await axios.get(`${API_URL}/swap/history`, { headers: authH() });
      setSwapHistory(r.data.swaps || []);
    } catch { /* silent */ }
  };

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    const init = async () => {
      setLoading(true);
      await Promise.all([loadWallet(), loadBtcPrice(), loadUsdtWallet()]);
      setLoading(false);
    };
    init();
  }, [user]);

  // ── Auto-poll every 15 s while the tab is visible ─────────────────────────
  const prevBalRef = useRef(null);
  useEffect(() => {
    if (!user) return;
    const poll = setInterval(async () => {
      if (document.hidden) return;
      try {
        const r = await axios.get(`${API_URL}/hd-wallet/wallet`, { headers: authH() });
        const incoming = parseFloat(r.data.balance_btc || 0);
        if (prevBalRef.current !== null && incoming > prevBalRef.current) {
          const diff = (incoming - prevBalRef.current).toFixed(8);
          toast.success(`₿ ${diff} BTC received!`, { autoClose: 6000 });
        }
        prevBalRef.current = incoming;
        setWalletData({
          address:       r.data.address,
          balance_btc:   r.data.balance_btc,
          locked_btc:    r.data.locked_btc ?? 0,
          available_btc: r.data.available_btc != null ? r.data.available_btc : r.data.balance_btc,
          balance_usd:   parseFloat(r.data.balance_usd || 0),
          network:       r.data.network,
          has_address:   r.data.has_address,
        });
        setLockedBtc(r.data.locked_btc || 0);
        setTransactions(r.data.transactions || []);
        if (r.data.btc_price && r.data.btc_price > 0) setBtcPrice(p => p > 0 ? p : r.data.btc_price);
      } catch { /* silent — avoid toast spam on network blip */ }
    }, 15000);
    return () => clearInterval(poll);
  }, [user]);

  // ── Supabase Realtime — instant update when a wallet notification arrives ──
  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`wallet_notif_${user.id}`)
      .on('postgres_changes', {
        event:  'INSERT',
        schema: 'public',
        table:  'notifications',
        filter: `user_id=eq.${user.id}`,
      }, async (payload) => {
        const t = payload.new?.type || '';
        const title = payload.new?.title || '';
        // Refresh on any wallet-related or system notification (covers TRANSFER_IN, deposits, etc.)
        if (t === 'wallet' || t === 'system' || /received|sent|transfer|deposit/i.test(title)) {
          await loadWallet();
          toast.success(title || '₿ Wallet updated!', { autoClose: 5000 });
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id]);

  // ── Load USDT / swap data when tab switches ────────────────────────────────
  useEffect(() => {
    if (!user) return;
    if (activeCoin === 'USDT') { loadUsdtWallet(); }
    if (activeCoin === 'SWAP') { loadSwapRate(); loadSwapHistory(); if (!usdtData) loadUsdtWallet(); }
    if (activeCoin !== 'BTC') dismissUsdtHint();
  }, [activeCoin]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Refresh ────────────────────────────────────────────────────────────────
  const refresh = async () => {
    setRefreshing(true);
    await Promise.all([loadWallet(), loadBtcPrice()]);
    setRefreshing(false);
    toast.success('Wallet refreshed');
  };

  // ── Generate address ───────────────────────────────────────────────────────
  const generateAddress = async () => {
    try {
      const r = await axios.post(`${API_URL}/hd-wallet/generate-address`, {}, { headers: authH() });
      toast.success('Bitcoin address generated!');
      setWalletData(prev => ({ ...prev, address: r.data.address, has_address: true }));
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to generate address');
    }
  };

  // ── Check for new deposits ─────────────────────────────────────────────────
  const checkDeposit = async () => {
    setChecking(true);
    try {
      const r = await axios.post(`${API_URL}/hd-wallet/check-deposit`, {}, { headers: authH() });
      toast.info(r.data.message || 'Check complete');
      await loadWallet(); // refresh balance after check
    } catch (e) {
      toast.error('Failed to check deposits');
    } finally { setChecking(false); }
  };

  // ── Send BTC (real on-chain withdrawal) ────────────────────────────────────
  const sendBitcoin = async (toAddress, amountBtc, actionCode, force = false) => {
    try {
      const r = await axios.post(`${API_URL}/hd-wallet/send`,
        { toAddress, amountBtc, actionCode, force },
        { headers: authH() }
      );
      await loadWallet();
      return r;
    } catch (e) {
      throw e;
    }
  };

  // ── Check USDT deposits manually ──────────────────────────────────────────
  const checkUsdtDeposit = async () => {
    if (scanCooldown > 0 || checkingUsdt) return;
    setCheckingUsdt(true);
    try {
      const r = await axios.get(`${API_URL}/wallet/usdt/check`, { headers: authH() });
      toast.success(r.data.message || 'Deposit scan complete — balance updated');
      await loadUsdtWallet();
      // Start 30s cooldown countdown
      let secs = 30;
      setScanCooldown(secs);
      const tick = setInterval(() => {
        secs -= 1;
        setScanCooldown(secs);
        if (secs <= 0) clearInterval(tick);
      }, 1000);
    } catch (err) {
      const msg = err?.response?.data?.error || 'Failed to check USDT deposits';
      toast.error(msg);
    } finally { setCheckingUsdt(false); }
  };

  // ── Send USDT on-chain ─────────────────────────────────────────────────────
  const sendUsdt = async (toAddress, amount, actionCode) => {
    const r = await axios.post(`${API_URL}/wallet/usdt/send`, { toAddress, amount, actionCode }, { headers: authH() });
    await loadUsdtWallet();
    return r;
  };

  const doUsdtInternalTransfer = async ({ toUsername, toTronAddress, amountUsdt }) => {
    const r = await axios.post(`${API_URL}/wallet/usdt/internal-transfer`, { toUsername, toTronAddress, amountUsdt }, { headers: authH() });
    await loadUsdtWallet();
    return r.data;
  };

  // ── Asset picker dispatch — Send/Receive/Transfer buttons resolve to this ──
  const openAssetModal = (type, asset) => {
    setAssetPicker(null);
    if (asset === 'USDT' && !usdtData) loadUsdtWallet();
    if (type === 'send') {
      asset === 'BTC' ? setShowSend(true) : setShowUsdtSend(true);
    } else if (type === 'receive') {
      asset === 'BTC' ? setShowRecv(true) : setShowUsdtRecv(true);
    } else if (type === 'transfer') {
      asset === 'BTC' ? setShowInternal(true) : setShowUsdtInternal(true);
    }
  };

  // ── Asset action sheet dispatch — Send/Receive/Swap resolve for the tapped coin ──
  const handleAssetAction = (action, asset) => {
    setAssetActionSheet(null);
    if (action === 'swap') {
      setSwapFrom(asset);
      setActiveCoin('SWAP');
    } else {
      openAssetModal(action, asset);
    }
  };

  // ── Execute BTC↔USDT swap ─────────────────────────────────────────────────
  const doSwap = async () => {
    // Resolve effective native amount from whichever input mode is active
    const effAmt = swapInputMode === 'usd' && swapRate
      ? (swapFrom === 'BTC'
          ? parseFloat((parseFloat(swapUsdAmount || 0) / swapRate).toFixed(8))
          : parseFloat(parseFloat(swapUsdAmount || 0).toFixed(2)))
      : parseFloat(swapAmount || 0);

    if (!effAmt || effAmt <= 0) { toast.error('Enter a valid amount'); return; }
    setSwapping(true);
    try {
      if (swapFrom === 'BTC') {
        const r = await axios.post(`${API_URL}/swap/btc-to-usdt`, { btcAmount: effAmt }, { headers: authH() });
        toast.success(`Swapped ₿${effAmt} BTC → ₮${r.data.to_amount?.toFixed(2)} USDT`, { autoClose: 6000 });
        setWalletData(prev => prev ? { ...prev, balance_btc: r.data.new_btc_balance, available_btc: r.data.new_btc_balance } : prev);
        setUsdtData(prev => prev ? { ...prev, balance_usdt: r.data.new_usdt_balance } : prev);
      } else {
        const r = await axios.post(`${API_URL}/swap/usdt-to-btc`, { usdtAmount: effAmt }, { headers: authH() });
        toast.success(`Swapped ₮${effAmt} USDT → ₿${r.data.to_amount?.toFixed(8)} BTC`, { autoClose: 6000 });
        setUsdtData(prev => prev ? { ...prev, balance_usdt: r.data.new_usdt_balance } : prev);
        setWalletData(prev => prev ? { ...prev, balance_btc: r.data.new_btc_balance, available_btc: r.data.new_btc_balance } : prev);
      }
      setSwapAmount('');
      setSwapUsdAmount('');
      await loadSwapHistory();
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Swap failed. Please try again.');
    } finally { setSwapping(false); }
  };

  const balance      = parseFloat(walletData?.balance_btc   || 0); // total (available + locked)
  const lockedBal    = parseFloat(lockedBtc                 || 0);
  const availableBal = parseFloat(walletData?.available_btc ?? balance); // already deducted server-side
  const livePrice    = btcPrice || 88000;
  // USD values — always computed from live price, never from stale DB column
  const availableUsd = availableBal * livePrice;  // USD value of spendable BTC
  const totalUsd     = balance * livePrice;        // USD value of total (available + locked)
  const balUsd       = totalUsd; // kept for legacy references elsewhere in this component
  const usdtBal       = parseFloat(usdtData?.balance_usdt        || 0);
  const usdtLocked     = parseFloat(usdtData?.locked_balance_usdt || 0);
  const portfolioUsd  = totalUsd + usdtBal + usdtLocked; // BTC total + USDT total, in USD
  // Real allocation split for the insight widget — derived from actual balances, sums to exactly 100
  const btcAllocPct   = portfolioUsd > 0 ? Math.round((totalUsd / portfolioUsd) * 100) : 50;
  const usdtAllocPct  = 100 - btcAllocPct;
  console.log('[Wallet] balance_btc=', balance, 'locked=', lockedBal, 'available=', availableBal, 'btcPrice=', livePrice, 'availableUsd=', availableUsd, 'totalUsd=', totalUsd);
  const network = walletData?.network || 'mainnet';

  const fxRate   = displayCurrency === 'USD' ? 1 : (USD_RATES?.[displayCurrency] || 1);
  const sym      = CURRENCY_SYMBOLS[displayCurrency] || `${displayCurrency} `;
  const fmtLocal = n => `${sym}${(n * fxRate).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: C.mist }}>
      <div className="text-center space-y-3">
        <div className="w-10 h-10 border-4 rounded-full animate-spin mx-auto"
          style={{ borderColor: C.sage, borderTopColor: 'transparent' }} />
        <p className="text-sm font-semibold" style={{ color: C.green }}>Loading wallet…</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: C.g50, fontFamily: "'DM Sans',sans-serif" }}>

      {/* Display font for hero numerals/headings only — body stays on the existing DM Sans stack. */}
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&display=swap');`}</style>

      <div className="max-w-6xl mx-auto w-full px-3 sm:px-5 lg:px-8 py-4 sm:py-6 space-y-4 sm:space-y-5">

        {/* ══════════════════ PORTFOLIO HOME (BTC + USDT unified) ══════════════════ */}
        {activeCoin !== 'SWAP' && (<>

        {/* ── PAGE HEADER ── */}
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-widest" style={{ color: C.mint }}>Wallet</p>
            <h1 className="font-bold truncate" style={{ fontFamily: "'Syne',sans-serif", color: C.g800, fontSize: 'clamp(1.15rem,4.5vw,1.5rem)' }}>
              {user?.username ? `${user.username}'s Portfolio` : 'Your Portfolio'}
            </h1>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <button onClick={() => setShowBal(!showBal)}
              className="w-9 h-9 rounded-xl flex items-center justify-center border transition hover:shadow-sm"
              style={{ borderColor: C.g200, backgroundColor: '#fff' }}>
              {showBal ? <Eye size={14} style={{ color: C.g600 }} /> : <EyeOff size={14} style={{ color: C.g600 }} />}
            </button>
            <button onClick={refresh} disabled={refreshing}
              className="w-9 h-9 rounded-xl flex items-center justify-center border transition hover:shadow-sm"
              style={{ borderColor: C.g200, backgroundColor: '#fff' }}>
              <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} style={{ color: C.g600 }} />
            </button>
          </div>
        </div>

        {/* ── FUND-WALLET ALERT — always up top, above the fold, for anyone under the $10 threshold ── */}
        {portfolioUsd < 10 && (
          <div className="rounded-2xl overflow-hidden shadow-lg" style={{ border: '2px solid #B91C1C' }}>
            <div className="flex items-center gap-2 px-4 py-2.5" style={{ background: 'linear-gradient(135deg,#991B1B,#DC2626)' }}>
              <AlertTriangle size={15} style={{ color: '#fff' }} />
              <span className="text-xs sm:text-sm font-black text-white tracking-wide uppercase">
                Action Required — Fund Your Wallet
              </span>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-4" style={{ backgroundColor: '#FEF2F2' }}>
              <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#FEE2E2' }}>
                <Wallet size={20} style={{ color: '#B91C1C' }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-base font-black" style={{ color: '#7F1D1D' }}>Keep your wallet funded to stay active</p>
                <p className="text-sm mt-1 leading-relaxed font-semibold" style={{ color: '#B91C1C' }}>
                  Your Bitcoin wallet must have at least <strong>$10 and above</strong> for your buy and sell offers to appear in the marketplace — and to unlock your first bonus on your way to becoming a vendor.
                  Current balance: <strong>{fmtLocal(portfolioUsd)}</strong>.
                  Top up now to activate your offer.
                </p>
              </div>
              <button
                onClick={() => setAssetPicker({ type: 'receive' })}
                className="flex-shrink-0 w-full sm:w-auto px-6 py-3 rounded-xl text-sm font-black text-white shadow-md hover:opacity-90 transition"
                style={{ background: 'linear-gradient(135deg,#B91C1C,#DC2626)' }}>
                Top Up Now →
              </button>
            </div>
          </div>
        )}

        {/* ── SELLER SECURITY DEPOSIT — only shown to users who have (or had) one ── */}
        {depositStatus?.has_deposit && (
          <div className="rounded-2xl bg-white shadow-sm border p-4 sm:p-5" style={{ borderColor: C.g200 }}>
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="flex items-start gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: C.mist }}>
                  <Shield size={18} style={{ color: C.forest }} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-black" style={{ color: C.g800 }}>
                    Gift-Card Seller Security Deposit
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: C.g500 }}>
                    {depositStatus.deposit?.status === 'LOCKED' && (
                      depositStatus.eligible_to_withdraw
                        ? 'Eligible to withdraw — no open trades, 7-day hold passed.'
                        : depositStatus.open_trade_count > 0
                          ? `Locked — ${depositStatus.open_trade_count} open trade(s) must finish first.`
                          : `Locked — eligible in ${depositStatus.days_remaining} day(s).`
                    )}
                    {depositStatus.deposit?.status === 'PENDING_WITHDRAWAL' && 'Withdrawal requested — awaiting admin approval.'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <span className="text-lg font-black" style={{ color: C.g800 }}>
                  ₮{fmtUsd(depositStatus.deposit?.remaining_amount).replace('$', '')}
                </span>
                {depositStatus.deposit?.status === 'LOCKED' && depositStatus.eligible_to_withdraw && (
                  <button onClick={requestDepositWithdrawal} disabled={depositReqLoading}
                    className="px-4 py-2 rounded-xl text-xs font-black text-white"
                    style={{ backgroundColor: depositReqLoading ? C.g400 : C.green }}>
                    {depositReqLoading ? 'Requesting…' : 'Request Withdrawal'}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── HERO: TOTAL PORTFOLIO VALUE ──
             White elevated card instead of a full-bleed green block — the color now accents
             (badge, glow, icon tints) rather than dominating the whole card. */}
        <div className="rounded-3xl bg-white shadow-xl border p-5 sm:p-7 relative overflow-hidden" style={{ borderColor: C.g100 }}>
          <div className="absolute -top-20 -right-20 w-64 h-64 rounded-full pointer-events-none"
            style={{ background: `radial-gradient(circle, ${C.mint} 0%, transparent 70%)`, opacity: 0.08 }} />

          <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-5">
            <div>
            <div className="flex items-center gap-1.5 mb-2">
              <span className="w-1.5 h-1.5 rounded-full inline-block animate-pulse" style={{ backgroundColor: C.success }} />
              <p className="text-xs font-bold uppercase tracking-wide" style={{ color: C.g400 }}>Total Portfolio Value</p>
            </div>

            <p className="font-extrabold tracking-tight" style={{ fontFamily: "'Syne',sans-serif", color: C.g800, fontSize: 'clamp(2rem,9vw,3.25rem)', lineHeight: 1.05 }}>
              {showBal ? fmtLocal(portfolioUsd) : '••••••••'}
            </p>

            {/* Available / Locked as compact inline pills — replaces two duplicated stat cards */}
            <div className="flex flex-wrap gap-2 mt-4">
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full" style={{ backgroundColor: C.mist }}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: C.mint }} />
                <span className="text-xs font-bold" style={{ color: C.g700 }}>
                  Available · {showBal ? fmtLocal(availableUsd + usdtBal) : '••••'}
                </span>
              </div>
              {(lockedBal > 0 || usdtLocked > 0) && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full" style={{ backgroundColor: '#FFF7E8' }}>
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: C.gold }} />
                  <span className="text-xs font-bold" style={{ color: C.g700 }}>
                    In Escrow · {showBal ? fmtLocal((lockedBal * livePrice) + usdtLocked) : '••••'}
                  </span>
                </div>
              )}
            </div>
            </div>

            {/* Right side of the hero, sm+ only — real supplementary data (live spot price,
                 tx count) instead of leaving the wide card empty next to the balance. */}
            <div className="hidden sm:flex items-center gap-6 sm:pl-6 sm:border-l flex-shrink-0" style={{ borderColor: C.g400 }}>
              <div>
                <p className="text-sm font-bold uppercase tracking-wide" style={{ color: C.g400 }}>Live BTC Price</p>
                <p className="font-bold" style={{ fontFamily: "'Syne',sans-serif", color: C.g800, fontSize: '1.35rem' }}>
                  {fmtLocal(livePrice)}
                </p>
              </div>
              <div>
                <p className="text-sm font-bold uppercase tracking-wide" style={{ color: C.g400 }}>Transactions</p>
                <p className="font-bold" style={{ fontFamily: "'Syne',sans-serif", color: C.g800, fontSize: '1.35rem' }}>
                  {transactions.length}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* From here down: a real 2-column layout on desktop instead of one narrow stretched
             column — main actions/assets on the left, secondary insight content on the right. */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-5">
        <div className="lg:col-span-2 space-y-4 sm:space-y-5">

        {/* ── QUICK ACTIONS ──
             Asset-agnostic — each opens the existing AssetPickerSheet, which already resolves
             to the correct BTC/USDT modal. No new logic; just a single unified entry point. */}
        <div className="grid grid-cols-4 gap-2 sm:gap-3">
          {[
            { label: 'Send',     icon: Send,           action: () => setAssetPicker({ type: 'send' }) },
            { label: 'Receive',  icon: Download,       action: () => setAssetPicker({ type: 'receive' }) },
            { label: 'Transfer', icon: ArrowUpRight,   action: () => setAssetPicker({ type: 'transfer' }) },
            { label: 'Swap',     icon: ArrowLeftRight, action: () => setActiveCoin('SWAP') },
          ].map(({ label, icon: Icon, action }) => (
            <button key={label} onClick={action}
              className="bg-white rounded-2xl border shadow-sm p-3 sm:p-4 flex flex-col items-center gap-2 transition hover:shadow-md hover:-translate-y-0.5"
              style={{ borderColor: C.g100 }}>
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: C.mist }}>
                <Icon size={16} style={{ color: C.green }} />
              </div>
              <span className="text-xs font-bold" style={{ color: C.g700 }}>{label}</span>
            </button>
          ))}
        </div>


        {/* ── ASSETS ──
             Both balances side by side instead of two near-identical full-page views —
             this is the real fix for the "giant green container × 2" duplication. */}
        <div className="bg-white rounded-2xl border shadow-sm overflow-hidden" style={{ borderColor: C.g100 }}>
          <div className="px-5 py-4 border-b" style={{ borderColor: C.g100 }}>
            <p className="font-black text-sm" style={{ color: C.g800 }}>Assets</p>
          </div>

          <button onClick={() => setAssetActionSheet('BTC')}
            className="w-full flex items-center gap-3 px-5 py-4 transition hover:bg-slate-50 border-b" style={{ borderColor: C.g100 }}>
            <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#FFF7E8' }}>
              <Bitcoin size={18} style={{ color: C.gold }} />
            </div>
            <div className="flex-1 min-w-0 text-left">
              <p className="font-bold text-sm" style={{ color: C.g800 }}>Bitcoin</p>
              <p className="text-xs" style={{ color: C.g400 }}>{showBal ? `${fmt(balance, 6)} BTC` : '•••• BTC'}</p>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="font-bold text-sm" style={{ color: C.g800 }}>{showBal ? fmtLocal(totalUsd) : '••••'}</p>
              {lockedBal > 0 && <p className="text-xs font-semibold flex items-center justify-end gap-1" style={{ color: C.gold }}><Lock size={10} /> {fmt(lockedBal, 6)} locked</p>}
            </div>
            <ChevronRight size={16} style={{ color: C.g300 }} className="flex-shrink-0" />
          </button>

          <button onClick={() => setAssetActionSheet('USDT')}
            className="w-full flex items-center gap-3 px-5 py-4 transition hover:bg-slate-50">
            <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#E8F7F2' }}>
              <TetherGlyph size={16} color="#26A17B" />
            </div>
            <div className="flex-1 min-w-0 text-left">
              <p className="font-bold text-sm" style={{ color: C.g800 }}>Tether USD</p>
              <p className="text-xs" style={{ color: C.g400 }}>{showBal ? `${usdtBal.toFixed(2)} USDT` : '•••• USDT'}</p>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="font-bold text-sm" style={{ color: C.g800 }}>{showBal ? fmtLocal(usdtBal) : '••••'}</p>
              {usdtLocked > 0 && <p className="text-xs font-semibold flex items-center justify-end gap-1" style={{ color: C.gold }}><Lock size={10} /> {usdtLocked.toFixed(2)} locked</p>}
            </div>
            <ChevronRight size={16} style={{ color: C.g300 }} className="flex-shrink-0" />
          </button>
        </div>

        {/* ── RECENT ACTIVITY (BTC transaction history) ──────────────── */}
        <div className="bg-white rounded-2xl border shadow-sm overflow-hidden" style={{ borderColor: C.g100 }}>
          <div className="px-5 py-4 border-b flex items-center justify-between" style={{ borderColor: C.g100 }}>
            <p className="font-black text-sm" style={{ color: C.g800 }}>Recent Activity</p>
            <span className="text-xs font-black px-2 py-0.5 rounded-full"
              style={{ backgroundColor: C.g100, color: C.g500 }}>
              {transactions.length} records
            </span>
          </div>
          <div className="px-5">
            {transactions.length === 0 ? (
              <div className="text-center py-12">
                <Clock size={36} className="mx-auto mb-3" style={{ color: C.g300 }} />
                <p className="font-bold text-sm" style={{ color: C.g500 }}>No transactions yet</p>
                <p className="text-xs mt-1" style={{ color: C.g400 }}>Deposits and trades appear here</p>
                <button onClick={() => navigate('/buy-bitcoin')}
                  className="mt-4 flex items-center gap-1.5 px-4 py-2 rounded-xl text-white font-black text-xs mx-auto"
                  style={{ backgroundColor: C.green }}>
                  <Bitcoin size={12} /> Start Trading
                </button>
              </div>
            ) : (
              transactions.map((tx, i) => (
                <TxRow key={tx.id || i} tx={tx} onClick={() => setSelectedTx(tx)} />
              ))
            )}
          </div>
        </div>

        </div> {/* END left column */}

        <div className="lg:col-span-1 space-y-4 sm:space-y-5">

        {/* ── ALLOCATION ── real split derived from actual balances, not a fabricated stat */}
        {portfolioUsd > 0 && (
          <div className="bg-white rounded-2xl border shadow-sm p-4" style={{ borderColor: C.g100 }}>
            <p className="font-black text-sm mb-3" style={{ color: C.g800 }}>Allocation</p>
            <div className="h-2.5 rounded-full overflow-hidden flex" style={{ backgroundColor: C.g100 }}>
              <div style={{ width: `${btcAllocPct}%`, backgroundColor: C.gold }} />
              <div style={{ width: `${usdtAllocPct}%`, backgroundColor: '#26A17B' }} />
            </div>
            <div className="flex items-center justify-between mt-3">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: C.gold }} />
                <span className="text-xs font-bold" style={{ color: C.g600 }}>BTC {btcAllocPct}%</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: '#26A17B' }} />
                <span className="text-xs font-bold" style={{ color: C.g600 }}>USDT {usdtAllocPct}%</span>
              </div>
            </div>
          </div>
        )}

        {/* ── USDT DISCOVERY HINT ──────────────────────────────────── */}
        {showUsdtHint && (
          <div className="flex items-start gap-3 p-4 rounded-2xl"
            style={{ background: `linear-gradient(135deg, #26A17B12, #26A17B08)`, border: '1px solid #26A17B35' }}>
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: '#26A17B' }}>
              <TetherGlyph size={18} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-black" style={{ color: C.g800 }}>You have a USDT wallet too!</p>
              <p className="text-xs mt-0.5 leading-relaxed" style={{ color: C.g600 }}>
                Both balances are shown together above. Use Send/Receive/Transfer and pick USDT from the list.
              </p>
            </div>
            <button onClick={dismissUsdtHint}
              className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 hover:bg-black/5 transition">
              <X size={13} style={{ color: C.g400 }} />
            </button>
          </div>
        )}

        {/* ── P2P TRADE PROMO BANNER ── */}
        <P2PPromoBanner navigate={navigate} />

        {/* ── SECURITY INFO ────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border shadow-sm p-4" style={{ borderColor: C.g100 }}>
          <div className="flex items-center gap-2 mb-3">
            <Shield size={14} style={{ color: C.green }} />
            <p className="font-black text-sm" style={{ color: C.g800 }}>Wallet Security</p>
          </div>
          <div className="space-y-2">
            {[
              { icon: <Lock size={15} />, label: 'Self-Custodial HD Wallet',  desc: 'Your keys derived from master seed — PRAQEN controls nothing' },
              { icon: <Shield size={15} />, label: 'Escrow Protected Trades',   desc: 'Trade funds locked until both parties confirm' },
              { icon: <RefreshCw size={15} />, label: 'Auto Deposit Detection',    desc: 'Balance updates automatically when BTC arrives' },
            ].map(({ icon, label, desc }) => (
              <div key={label} className="flex items-center gap-3 p-2.5 rounded-xl" style={{ backgroundColor: C.g50 }}>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#fff', color: C.green }}>
                  {icon}
                </div>
                <div>
                  <p className="text-xs font-bold" style={{ color: C.g700 }}>{label}</p>
                  <p className="text-xs" style={{ color: C.g400 }}>{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        </div> {/* END right column */}
        </div> {/* END grid */}


        </>)} {/* END PORTFOLIO HOME */}


        {/* ══════════════════ SWAP VIEW ══════════════════ */}
        {activeCoin === 'SWAP' && (<>

        {/* ── SWAP WIDGET ── */}
        <div className="rounded-3xl overflow-hidden shadow-lg" style={{ border: `1.5px solid ${C.g200}` }}>
          {/* Header */}
          <div className="p-5 pb-4" style={{ background: `linear-gradient(145deg, ${C.forest} 0%, ${C.green} 100%)` }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl flex items-center justify-center"
                  style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.2)' }}>
                  <ArrowLeftRight size={17} color="#fff" strokeWidth={2.3} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-black text-white text-base tracking-wide">BTC ↔ USDT</p>
                    <WalletSwitcher activeCoin={activeCoin} onSelect={setActiveCoin} dark />
                  </div>
                  <p className="text-xs font-semibold" style={{ color: 'rgba(255,255,255,0.55)' }}>Instant swap · {(SWAP_FEE_PERCENT * 100).toFixed(1)}% fee · No blockchain delay</p>
                </div>
              </div>
              <div className="text-right">
                {swapRate ? (
                  <div className="rounded-xl px-3 py-1.5" style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.18)' }}>
                    <p className="text-xs font-bold text-white/60 mb-0.5">Live Rate</p>
                    <p className="text-sm font-black text-white">${swapRate.toLocaleString('en-US', { maximumFractionDigits: 0 })}</p>
                  </div>
                ) : (
                  <button onClick={loadSwapRate}
                    className="rounded-xl px-3 py-2 text-xs font-bold flex items-center gap-1.5"
                    style={{ background: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.7)' }}>
                    <RefreshCw size={11} /> Fetch Rate
                  </button>
                )}
              </div>
            </div>

            {/* Coin badges */}
            <div className="flex items-center justify-center gap-3 mt-4">
              <div className="flex items-center gap-2 px-3 py-2 rounded-2xl"
                style={{ background: swapFrom === 'BTC' ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.08)', border: `1px solid ${swapFrom === 'BTC' ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.12)'}`, transition: 'all 0.2s' }}>
                <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ backgroundColor: '#F7931A' }}>
                  <span className="text-white font-black text-xs">₿</span>
                </div>
                <div>
                  <p className="text-white font-black text-xs">Bitcoin</p>
                  <p className="text-white/50 text-xs font-semibold">₿{fmt(availableBal, 6)}</p>
                </div>
              </div>
              <button onClick={() => { setSwapFrom(f => f === 'BTC' ? 'USDT' : 'BTC'); setSwapAmount(''); }}
                className="w-9 h-9 rounded-full flex items-center justify-center transition active:scale-90"
                style={{ background: 'rgba(255,255,255,0.18)', border: '1.5px solid rgba(255,255,255,0.3)', boxShadow: '0 3px 10px rgba(0,0,0,0.2)' }}>
                <ArrowLeftRight size={14} color="#fff" strokeWidth={2.5} />
              </button>
              <div className="flex items-center gap-2 px-3 py-2 rounded-2xl"
                style={{ background: swapFrom === 'USDT' ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.08)', border: `1px solid ${swapFrom === 'USDT' ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.12)'}`, transition: 'all 0.2s' }}>
                <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ backgroundColor: '#26A17B' }}>
                  <span className="text-white font-black text-xs">₮</span>
                </div>
                <div>
                  <p className="text-white font-black text-xs">Tether</p>
                  <p className="text-white/50 text-xs font-semibold">₮{(usdtData?.balance_usdt || 0).toFixed(2)}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Swap form body */}
          <div className="bg-white p-5 space-y-4">
            {/* Direction tabs */}
            <div className="flex rounded-2xl overflow-hidden" style={{ border: `1.5px solid ${C.g200}`, backgroundColor: C.g50 }}>
              {[
                { dir: 'BTC',  label: '₿ Bitcoin  →  ₮ USDT' },
                { dir: 'USDT', label: '₮ USDT  →  ₿ Bitcoin' },
              ].map(({ dir, label }) => (
                <button key={dir} onClick={() => { setSwapFrom(dir); setSwapAmount(''); setSwapUsdAmount(''); }}
                  className="flex-1 py-2.5 text-xs font-black transition"
                  style={{
                    background: swapFrom === dir ? `linear-gradient(135deg, ${C.forest}, ${C.green})` : 'transparent',
                    color: swapFrom === dir ? '#fff' : C.g500,
                    borderRight: dir === 'BTC' ? `1.5px solid ${C.g200}` : 'none',
                    borderRadius: dir === 'BTC' ? '14px 0 0 14px' : '0 14px 14px 0',
                  }}>
                  {label}
                </button>
              ))}
            </div>

            {/* You send — with $ USD / native toggle */}
            {(() => {
              // Derive effective native amount for preview regardless of input mode
              const usdVal   = parseFloat(swapUsdAmount || 0);
              const natVal   = parseFloat(swapAmount || 0);
              const effNative = swapInputMode === 'usd' && swapRate
                ? (swapFrom === 'BTC' ? parseFloat((usdVal / swapRate).toFixed(8)) : parseFloat(usdVal.toFixed(2)))
                : natVal;
              const maxNative = swapFrom === 'BTC' ? availableBal : (usdtData?.balance_usdt || 0);
              const maxUsd    = swapFrom === 'BTC' ? availableBal * (swapRate || 0) : (usdtData?.balance_usdt || 0);
              const minUsd    = swapFrom === 'BTC' ? 1 : 1; // $1 minimum
              const hasInput  = swapInputMode === 'usd' ? usdVal > 0 : natVal > 0;
              const insufficient = swapInputMode === 'usd'
                ? (swapFrom === 'BTC' ? effNative > availableBal : usdVal > (usdtData?.balance_usdt || 0))
                : (effNative > maxNative);

              return (
                <>
                <div>
                  {/* Input mode toggle */}
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-black" style={{ color: C.g500 }}>YOU SEND</label>
                    <div className="flex rounded-xl overflow-hidden" style={{ border: `1.5px solid ${C.g200}` }}>
                      {[
                        { mode: 'native', label: swapFrom === 'BTC' ? '₿ BTC' : '₮ USDT' },
                        { mode: 'usd',    label: '$ USD' },
                      ].map(({ mode, label }) => (
                        <button key={mode}
                          onClick={() => { setSwapInputMode(mode); setSwapAmount(''); setSwapUsdAmount(''); }}
                          className="px-3 py-1.5 text-xs font-black transition"
                          style={{
                            background: swapInputMode === mode ? 'linear-gradient(135deg, #1a1a2e, #16213e)' : 'transparent',
                            color: swapInputMode === mode ? '#fff' : C.g500,
                          }}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 p-4 rounded-2xl" style={{ background: C.g50, border: `1.5px solid ${insufficient ? '#ef4444' : C.g200}` }}>
                    <div className="w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center shadow-md"
                      style={{ backgroundColor: swapInputMode === 'usd' ? '#22c55e' : (swapFrom === 'BTC' ? '#F7931A' : '#26A17B') }}>
                      <span className="text-white font-black text-base">{swapInputMode === 'usd' ? '$' : (swapFrom === 'BTC' ? '₿' : '₮')}</span>
                    </div>
                    <div className="flex-1">
                      {swapInputMode === 'usd' ? (
                        <>
                          <input type="number" value={swapUsdAmount} onChange={e => setSwapUsdAmount(e.target.value)}
                            placeholder="10.00" step="0.01" min="0"
                            className="w-full text-xl font-black bg-transparent focus:outline-none"
                            style={{ color: C.g800 }} />
                          <p className="text-xs font-semibold mt-0.5" style={{ color: C.g400 }}>
                            US Dollars
                            {usdVal > 0 && swapRate && (
                              <span style={{ color: C.green }}>
                                {' '}≈ {swapFrom === 'BTC' ? `₿${effNative.toFixed(8)}` : `₮${effNative.toFixed(2)}`}
                              </span>
                            )}
                          </p>
                        </>
                      ) : (
                        <>
                          <input type="number" value={swapAmount} onChange={e => setSwapAmount(e.target.value)}
                            placeholder={swapFrom === 'BTC' ? '0.00000000' : '0.00'}
                            step={swapFrom === 'BTC' ? '0.00000001' : '0.01'} min="0"
                            className="w-full text-xl font-black bg-transparent focus:outline-none"
                            style={{ color: C.g800 }} />
                          <p className="text-xs font-semibold mt-0.5" style={{ color: C.g400 }}>
                            {swapFrom === 'BTC' ? 'Bitcoin' : 'Tether USDT'}
                            {natVal > 0 && swapRate && (
                              <span style={{ color: C.green }}>
                                {' '}≈ ${swapFrom === 'BTC' ? (natVal * swapRate).toFixed(2) : natVal.toFixed(2)}
                              </span>
                            )}
                          </p>
                        </>
                      )}
                    </div>
                    <button onClick={() => {
                      // Truncate down (never round up) when pre-filling MAX — the underlying
                      // USDT balance carries more precision than the 2dp shown on screen, so
                      // rounding .toFixed(2) up could fill in an amount that's actually more
                      // than the real balance, tripping "insufficient" on the very next check.
                      const floorTo2 = (n) => (Math.floor(n * 100) / 100).toFixed(2);
                      if (swapInputMode === 'usd') { setSwapUsdAmount(floorTo2(maxUsd)); }
                      else { setSwapAmount(swapFrom === 'BTC' ? fmt(availableBal, 8) : floorTo2(maxNative)); }
                    }}
                      className="text-xs font-black px-2.5 py-1.5 rounded-xl transition"
                      style={{ background: `linear-gradient(135deg, ${C.forest}, ${C.green})`, color: '#fff', boxShadow: `0 2px 8px ${C.forest}40` }}>
                      MAX
                    </button>
                  </div>

                  {/* Min / Max info row */}
                  <div className="flex items-center justify-between mt-2 px-1">
                    <span className="text-xs font-semibold" style={{ color: C.g400 }}>
                      Min: <span style={{ color: C.g600 }}>${minUsd.toFixed(2)}</span>
                    </span>
                    <span className="text-xs font-semibold" style={{ color: C.g400 }}>
                      Max: <span style={{ color: C.green }}>${maxUsd.toFixed(2)}</span>
                      {' '}
                      <span style={{ color: C.g400 }}>
                        ({swapFrom === 'BTC' ? `₿${fmt(availableBal, 6)}` : `₮${maxNative.toFixed(2)}`})
                      </span>
                    </span>
                  </div>

                  {/* Insufficient balance warning */}
                  {hasInput && insufficient && (
                    <div className="flex items-center gap-1.5 mt-2 px-3 py-2 rounded-xl" style={{ backgroundColor: '#fff5f5', border: '1px solid #fecaca' }}>
                      <AlertTriangle size={12} style={{ color: '#ef4444', flexShrink: 0 }} />
                      <p className="text-xs font-semibold" style={{ color: '#dc2626' }}>
                        Insufficient {swapFrom} balance
                      </p>
                    </div>
                  )}
                </div>

                {/* You receive preview */}
                {hasInput && !insufficient && swapRate && effNative > 0 && (() => {
                  const gross = swapFrom === 'BTC' ? effNative * swapRate : effNative / swapRate;
                  const fee   = gross * SWAP_FEE_PERCENT;
                  const net   = gross - fee;
                  const isB2U = swapFrom === 'BTC';
                  const sendUsd = swapInputMode === 'usd' ? usdVal : (swapFrom === 'BTC' ? effNative * swapRate : effNative);
                  return (
                    <div>
                      <label className="block text-xs font-black mb-2" style={{ color: C.g500 }}>YOU RECEIVE</label>
                      <div className="flex items-center gap-3 p-4 rounded-2xl"
                        style={{ background: `linear-gradient(135deg, ${C.mist}, #f0fdf6)`, border: `1.5px solid ${C.sage}40` }}>
                        <div className="w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center shadow-md"
                          style={{ backgroundColor: isB2U ? '#26A17B' : '#F7931A' }}>
                          <span className="text-white font-black text-base">{isB2U ? '₮' : '₿'}</span>
                        </div>
                        <div className="flex-1">
                          <p className="text-xl font-black" style={{ color: C.forest }}>
                            {isB2U ? net.toFixed(2) : net.toFixed(8)}
                          </p>
                          <p className="text-xs font-semibold mt-0.5" style={{ color: C.green }}>
                            {isB2U ? 'Tether USDT' : 'Bitcoin'} · after {(SWAP_FEE_PERCENT * 100).toFixed(1)}% fee
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-black" style={{ color: C.forest }}>≈ ${isB2U ? net.toFixed(2) : (net * swapRate).toFixed(2)}</p>
                          <p className="text-xs font-semibold" style={{ color: C.g400 }}>USD value</p>
                        </div>
                      </div>

                      {/* Fee breakdown */}
                      <div className="mt-2 rounded-xl overflow-hidden" style={{ border: `1px solid ${C.g200}` }}>
                        {[
                          { label: isB2U ? 'BTC sent'        : 'USDT sent',   val: `${isB2U ? '₿' : '₮'}${isB2U ? fmt(effNative, 8) : effNative.toFixed(2)}` },
                          { label: 'USD equivalent',                            val: `$${sendUsd.toFixed(2)}` },
                          { label: 'Rate',                                      val: `1 BTC = $${swapRate.toLocaleString('en-US', { maximumFractionDigits: 0 })}` },
                          { label: `Platform fee (${(SWAP_FEE_PERCENT * 100).toFixed(1)}%)`,          val: `${isB2U ? '₮' : '₿'}${isB2U ? fee.toFixed(2) : fee.toFixed(8)}  ≈ $${(fee * (isB2U ? 1 : swapRate)).toFixed(2)}` },
                          { label: `${isB2U ? 'USDT' : 'BTC'} received`,       val: `${isB2U ? '₮' : '₿'}${isB2U ? net.toFixed(2) : net.toFixed(8)}`, bold: true },
                        ].map(({ label, val, bold }, i) => (
                          <div key={label} className="flex items-center justify-between px-3.5 py-2"
                            style={{ backgroundColor: bold ? C.g50 : '#fff', borderTop: i > 0 ? `1px solid ${C.g100}` : 'none' }}>
                            <span className={`text-xs ${bold ? 'font-black' : 'font-semibold'}`} style={{ color: bold ? C.g700 : C.g500 }}>{label}</span>
                            <span className={`text-xs ${bold ? 'font-black' : 'font-bold'}`} style={{ color: bold ? C.forest : C.g700 }}>{val}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
                </>
              );
            })()}

            {(() => {
              const swapReady = swapInputMode === 'usd'
                ? parseFloat(swapUsdAmount || 0) > 0
                : parseFloat(swapAmount || 0) > 0;
              return (
            <button onClick={doSwap} disabled={!swapReady || swapping}
              className="w-full py-4 rounded-2xl text-white font-black text-sm flex items-center justify-center gap-2 transition active:scale-[0.98] disabled:opacity-40"
              style={{
                background: swapping || !swapReady ? '#94a3b8' : `linear-gradient(135deg, ${C.forest} 0%, ${C.green} 100%)`,
                boxShadow: (!swapping && swapReady) ? `0 8px 24px ${C.forest}50` : 'none',
              }}>
              {swapping
                ? <><RefreshCw size={15} className="animate-spin" /> Processing Swap…</>
                : <><ArrowLeftRight size={15} /> {swapFrom === 'BTC' ? 'Swap BTC → USDT' : 'Swap USDT → BTC'}</>}
            </button>
              );
            })()}

            <div className="flex items-center justify-center gap-4 pt-1">
              {[
                { icon: <Zap size={12} />, text: 'Instant' },
                { icon: <Lock size={12} />, text: 'Secure' },
                { icon: <Link2 size={12} />, text: 'No blockchain fees' },
              ].map(({ icon, text }) => (
                <div key={text} className="flex items-center gap-1" style={{ color: C.g400 }}>
                  {icon}
                  <span className="text-xs font-semibold" style={{ color: C.g400 }}>{text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── SWAP HISTORY ── */}
        <div className="rounded-2xl overflow-hidden shadow-sm" style={{ border: `1.5px solid ${C.g200}`, backgroundColor: '#fff' }}>
          <div className="px-5 py-3.5 flex items-center justify-between"
            style={{ background: `linear-gradient(135deg, ${C.mist}, #f0fdf8)`, borderBottom: `1px solid ${C.g100}` }}>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-xl flex items-center justify-center"
                style={{ background: `linear-gradient(135deg, ${C.forest}, ${C.green})` }}>
                <ArrowLeftRight size={12} color="#fff" strokeWidth={2.5} />
              </div>
              <p className="font-black text-sm" style={{ color: C.g800 }}>Swap History</p>
            </div>
            <span className="text-xs font-black px-2.5 py-1 rounded-full"
              style={{ background: `${C.sage}20`, color: C.green, border: `1px solid ${C.sage}35` }}>
              {swapHistory.length} swaps
            </span>
          </div>

          {swapHistory.length === 0 ? (
            <div className="p-10 text-center">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-3"
                style={{ background: `linear-gradient(135deg, ${C.mist}, #e8f8f0)`, border: `1.5px solid ${C.sage}25` }}>
                <ArrowLeftRight size={24} style={{ color: C.sage }} />
              </div>
              <p className="font-black text-sm" style={{ color: C.g600 }}>No swaps yet</p>
              <p className="text-xs mt-1" style={{ color: C.g400 }}>Your swap history will appear here</p>
            </div>
          ) : (
            <div>
              {swapHistory.map((sw, i) => {
                const isBtcToUsdt = sw.from_currency === 'BTC';
                return (
                  <div key={sw.id || i} className="px-5 py-3.5 flex items-center gap-3 hover:bg-gray-50 transition"
                    style={{ borderTop: i > 0 ? `1px solid ${C.g100}` : 'none' }}>
                    <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-sm"
                      style={{ background: `linear-gradient(135deg, ${C.forest}15, ${C.green}10)`, border: `1.5px solid ${C.sage}30` }}>
                      <ArrowLeftRight size={14} style={{ color: C.green }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-black" style={{ color: C.g800 }}>
                        {isBtcToUsdt
                          ? <><span style={{ color: '#F7931A' }}>₿{parseFloat(sw.from_amount).toFixed(8)}</span> → <span style={{ color: '#26A17B' }}>₮{parseFloat(sw.to_amount).toFixed(2)}</span></>
                          : <><span style={{ color: '#26A17B' }}>₮{parseFloat(sw.from_amount).toFixed(2)}</span> → <span style={{ color: '#F7931A' }}>₿{parseFloat(sw.to_amount).toFixed(8)}</span></>}
                      </p>
                      <p className="text-xs font-semibold mt-0.5" style={{ color: C.g400 }}>
                        @ ${parseFloat(sw.rate).toLocaleString('en-US', { maximumFractionDigits: 0 })}/BTC · fee {isBtcToUsdt ? `₮${parseFloat(sw.fee_amount).toFixed(2)}` : `₿${parseFloat(sw.fee_amount).toFixed(8)}`}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <span className="text-xs font-black px-2 py-0.5 rounded-full inline-flex items-center gap-1"
                        style={{ background: `${C.success}15`, color: C.success, border: `1px solid ${C.success}25` }}>
                        <Check size={10} /> Done
                      </span>
                      {sw.created_at && <p className="text-xs mt-1 font-semibold" style={{ color: C.g400 }}>{fmtAge(sw.created_at)}</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        </>)} {/* END SWAP view */}

      </div>

      {/* ── FOOTER ─────────────────────────────────────────────────── */}
      <footer style={{ backgroundColor: C.forest }}>
        <div className="max-w-2xl mx-auto px-4 pt-8 pb-5">
          <div className="grid grid-cols-2 gap-8 mb-6">
            <div>
              <span className="text-xl font-black" style={{ fontFamily: "'Syne',sans-serif" }}>
                <span className="text-white">PRA</span><span style={{ color: C.gold }}>QEN</span>
              </span>
              <p className="text-xs leading-relaxed my-3" style={{ color: 'rgba(255,255,255,0.4)' }}>
                The world's most trusted P2P Bitcoin platform.
              </p>
              <div className="flex gap-2 flex-wrap">
                {[
                  {label:'TikTok',    href:'https://www.tiktok.com/@praqen', bg:'rgba(0,0,0,0.55)', color:'#ffffff', d:'M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z'},
                  {label:'Instagram', href:'https://www.instagram.com/praqen?igsh=MTRkZWg2amp5YnJlYQ%3D%3D&utm_source=qr', bg:'rgba(228,64,95,0.3)', color:'#E4405F', d:'M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z'},
                  {label:'X (Twitter)', href:'https://x.com/praqenapp?s=21', bg:'rgba(255,255,255,0.12)', color:'#ffffff', d:'M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z'},
                  {label:'Discord',   href:'https://discord.gg/V6zCZxfdy', bg:'rgba(88,101,242,0.35)', color:'#5865F2', d:'M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z'},
                  {label:'LinkedIn',  href:'https://www.linkedin.com/in/pra-qen-045373402/', bg:'rgba(10,102,194,0.35)', color:'#0A66C2', d:'M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z'},
                ].map(({label,href,bg,color,d})=>(
                  <a key={label} href={href} target="_blank" rel="noopener noreferrer" title={label}
                    className="w-8 h-8 rounded-lg flex items-center justify-center hover:scale-110 transition-transform"
                    style={{backgroundColor:bg}}>
                    <svg viewBox="0 0 24 24" width="15" height="15" fill={color} aria-hidden="true">
                      <path d={d}/>
                    </svg>
                  </a>
                ))}
              </div>
            </div>
            <div>
              <p className="text-white font-black text-sm mb-3">Quick Links</p>
              <div className="space-y-2">
                {[
                  { l: 'Buy Bitcoin',  h: '/buy-bitcoin' },
                  { l: 'Sell Bitcoin', h: '/sell-bitcoin' },
                  { l: 'My Trades',   h: '/my-trades' },
                  { l: 'Settings',    h: '/settings' },
                  { l: 'Blog',        h: '/blog' },
                  { l: 'Privacy',     h: '/privacy' },
                  { l: 'Terms',       h: '/terms' },
                  { l: 'hello@praqen.com', h: 'mailto:hello@praqen.com', icon: <Mail size={11} /> },
                ].map(({ l, h, icon }) => (
                  <a key={l} href={h} className="flex items-center gap-1.5 text-xs hover:text-white transition"
                    style={{ color: 'rgba(255,255,255,0.4)' }}>{icon}{l}</a>
                ))}
              </div>
            </div>
          </div>
          <div className="flex flex-col md:flex-row items-center justify-between gap-2 pt-4 border-t"
            style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
              © {new Date().getFullYear()} PRAQEN. All rights reserved.
            </p>
            <p className="text-xs flex items-center gap-1" style={{ color: 'rgba(255,255,255,0.3)' }}>
              <Shield size={10} /> Self-Custodial HD Wallet · 0.5% fee on trades
            </p>
          </div>
        </div>
      </footer>

      {selectedTx && <TxReceiptModal tx={selectedTx} btcPrice={btcPrice} onClose={() => setSelectedTx(null)}
          onRepeat={(username) => { setSelectedTx(null); setRepeatUsername(username); setShowInternal(true); }} />}
      {showSend && <WithdrawModal balance={availableBal} btcPrice={btcPrice} onClose={() => setShowSend(false)} onSend={sendBitcoin} kycStatus={userVerif} twoFactorEnabled={user?.two_factor_enabled} onSwitchToInternal={() => { setShowSend(false); setShowInternal(true); }} />}
      {showUsdtSend && <UsdtWithdrawModal balance={usdtData?.balance_usdt || 0} onClose={() => setShowUsdtSend(false)} onSend={sendUsdt} kycStatus={userVerif} twoFactorEnabled={user?.two_factor_enabled} onSwitchToInternal={() => { setShowUsdtSend(false); setShowUsdtInternal(true); }} />}
      {showUsdtInternal && <UsdtInternalTransferModal balance={usdtData?.balance_usdt || 0} onClose={() => setShowUsdtInternal(false)} onTransfer={doUsdtInternalTransfer} onSwitchToExternal={() => { setShowUsdtInternal(false); setShowUsdtSend(true); }} />}
      {showRecv && (
        <ReceiveModal
          address={walletData?.address}
          network={network}
          onClose={() => setShowRecv(false)}
          onGenerate={generateAddress}
          checking={checking}
          onCheckDeposits={checkDeposit}
        />
      )}
      {showUsdtRecv && (
        <UsdtReceiveModal
          address={usdtData?.tron_address}
          onClose={() => setShowUsdtRecv(false)}
          checking={checkingUsdt}
          scanCooldown={scanCooldown}
          onCheckDeposits={checkUsdtDeposit}
        />
      )}
      {assetPicker && (
        <AssetPickerSheet
          title={assetPicker.type === 'send' ? 'Send' : assetPicker.type === 'receive' ? 'Deposit' : 'Transfer'}
          subtitle="Choose an asset to continue"
          onPick={(asset) => openAssetModal(assetPicker.type, asset)}
          onClose={() => setAssetPicker(null)}
        />
      )}
      {assetActionSheet && (
        <AssetActionSheet
          asset={assetActionSheet}
          balanceLabel={assetActionSheet === 'BTC'
            ? (showBal ? `${fmt(balance, 6)} BTC` : '•••• BTC')
            : (showBal ? `${usdtBal.toFixed(2)} USDT` : '•••• USDT')}
          usdLabel={assetActionSheet === 'BTC'
            ? (showBal ? fmtLocal(totalUsd) : '••••')
            : (showBal ? fmtLocal(usdtBal) : '••••')}
          onAction={(action) => handleAssetAction(action, assetActionSheet)}
          onClose={() => setAssetActionSheet(null)}
        />
      )}
      {showInternal && (
        <InternalTransferModal
          balance={availableBal}
          btcPrice={btcPrice || 88000}
          displayCurrency={displayCurrency}
          fxRate={fxRate}
          currentUserId={user?.id}
          currentUser={user}
          initialUsername={repeatUsername}
          onClose={() => { setShowInternal(false); setRepeatUsername(null); }}
          onSwitchToExternal={() => { setShowInternal(false); setRepeatUsername(null); setShowSend(true); }}
          onDone={(newBal) => {
            setWalletData(prev => prev ? { ...prev, available_btc: newBal, balance_btc: newBal } : prev);
            setShowInternal(false);
            setRepeatUsername(null);
            setTimeout(() => loadWallet(), 600);
          }}
        />
      )}
    </div>
  );
}
