import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import BonusBanner from '../components/BonusBanner';
import axios from 'axios';
import { useLocalUser } from '../hooks/useLocalUser';
import {
  Wallet, TrendingUp, Clock, CheckCircle, AlertCircle,
  Star, DollarSign, ArrowRight, Shield, Activity, MapPin,
  Calendar, BadgeCheck, Send, Eye, EyeOff, Bitcoin,
  MessageCircle, Gift, Copy, RefreshCw, Users,
  Medal, Crown, Zap, BarChart3, ChevronRight,
  PlusCircle, X, Link, TrendingDown, Award, Flame,
  UserCheck, UserX, Target, Percent, Lock, ThumbsUp, ThumbsDown,
  User, Download, Trophy, Rocket, Lightbulb, Megaphone, Twitter
} from 'lucide-react';
import { toast } from 'react-toastify';
import { BadgeChip, TRUST_MAP, deriveBadge, getNextBadge, renderBadgeIcon, BADGE_COLORS } from '../lib/badge';
import { copyToClipboard } from '../utils/clipboard';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

// ─── Color palette ─────────────────────────────────────────────────────────────
const C = {
  forest:'#1B4332', green:'#2D6A4F', mint:'#40916C', sage:'#52B788',
  gold:'#F4A422', amber:'#F59E0B', mist:'#F0FAF5', white:'#FFFFFF',
  g50:'#F8FAFC', g100:'#F1F5F9', g200:'#E2E8F0', g300:'#CBD5E1',
  g400:'#94A3B8', g500:'#64748B', g600:'#475569', g700:'#334155', g800:'#1E293B',
  success:'#10B981', danger:'#EF4444', warn:'#F59E0B', paid:'#3B82F6',
  online:'#22C55E', purple:'#8B5CF6',
};

// ─── Helpers ───────────────────────────────────────────────────────────────────
const fmt     = (n, d=2) => new Intl.NumberFormat('en-US',{minimumFractionDigits:0,maximumFractionDigits:d}).format(n||0);
const fmtBtc  = (n)     => parseFloat(n||0).toFixed(8);
const fmtPct  = (n)     => `${Math.min(100,Math.max(0,parseFloat(n||0))).toFixed(1)}%`;

const isOnline = (lastSeen) => {
  if (!lastSeen) return false;
  return (Date.now() - new Date(lastSeen)) / 1000 < 300; // < 5 min
};

const getStatusBadge = (status) => {
  const map = {
    COMPLETED:    { text:'Completed',       color:C.success, icon:CheckCircle },
    PAID:         { text:'Awaiting Release',color:C.warn,    icon:Clock },
    FUNDS_LOCKED: { text:'Escrow Active',   color:C.paid,    icon:Shield },
    PAYMENT_SENT: { text:'Payment Sent',    color:C.purple,  icon:Send },
    DISPUTED:     { text:'Disputed',        color:C.danger,  icon:AlertCircle },
    CANCELLED:    { text:'Cancelled',       color:C.g400,    icon:X },
  };
  return map[status] || { text:status||'Active', color:C.g400, icon:Clock };
};

const authH = () => {
  const t = localStorage.getItem('token');
  return t ? { Authorization:`Bearer ${t}` } : {};
};

// ─── Stat Card ─────────────────────────────────────────────────────────────────
function StatCard({ icon:Icon, label, value, sub, color, onClick }) {
  return (
    <div onClick={onClick}
      className={`bg-white rounded-2xl p-4 border shadow-sm ${onClick?'cursor-pointer hover:shadow-md transition-all hover:-translate-y-0.5':''}`}
      style={{borderColor:C.g200}}>
      <div className="flex items-center justify-between mb-2">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{backgroundColor:`${color}15`}}>
          <Icon size={16} style={{color}}/>
        </div>
        {onClick && <ChevronRight size={14} style={{color:C.g400}}/>}
      </div>
      <p className="text-xl font-black" style={{color:C.g800}}>{value}</p>
      <p className="text-xs font-semibold mt-0.5" style={{color:C.g500}}>{label}</p>
      {sub && <p className="text-xs mt-0.5" style={{color:C.g400}}>{sub}</p>}
    </div>
  );
}

// ─── Section Header ────────────────────────────────────────────────────────────
function SectionHeader({ icon:Icon, title, action, onAction }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2">
        <Icon size={16} style={{color:C.green}}/>
        <h2 className="font-black text-sm" style={{color:C.forest}}>{title}</h2>
      </div>
      {action && (
        <button onClick={onAction} className="text-xs font-bold hover:underline flex items-center gap-1" style={{color:C.green}}>
          {action} <ChevronRight size={11}/>
        </button>
      )}
    </div>
  );
}

// ─── Profile Summary ───────────────────────────────────────────────────────────
function ProfileSummary({ user, profile, stats }) {
  const navigate = useNavigate();
  const badgeKey = (profile?.badge || deriveBadge(profile || user).label).toUpperCase();
  const badge    = TRUST_MAP[badgeKey] || TRUST_MAP.BEGINNER;
  const online  = isOnline(profile?.last_seen_at);
  const next    = getNextBadge(badgeKey);
  const badgeProgress = next ? Math.min(1, (stats.totalFeedback || 0) / next.countNeeded) : 1;

  return (
    <div className="bg-white rounded-2xl shadow-sm border overflow-hidden mb-4" style={{borderColor:C.g200}}>
      {/* Banner */}
      <div className="h-24 relative" style={{background:`linear-gradient(135deg,${C.forest},${C.mint})`}}>
        <div className="absolute inset-0 opacity-5"
          style={{backgroundImage:'radial-gradient(circle at 2px 2px,white 1px,transparent 0)',backgroundSize:'20px 20px'}}/>
      </div>

      <div className="px-5 pb-5">
        {/* Avatar row */}
        <div className="flex items-end justify-between -mt-10 mb-3">
          <div className="relative">
            <div className="w-20 h-20 rounded-2xl border-4 border-white shadow-lg overflow-hidden flex items-center justify-center font-black text-2xl"
              style={{backgroundColor:C.gold, color:C.forest}}>
              {profile?.avatar_url
                ? <img src={profile.avatar_url} alt="avatar" className="w-full h-full object-cover"/>
                : (user?.username?.charAt(0)?.toUpperCase()||'?')}
            </div>
            {/* Online dot */}
            <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-2 border-white flex items-center justify-center"
              style={{backgroundColor:online?C.online:C.g400}}>
              <div className={`w-2 h-2 rounded-full ${online?'animate-pulse':''}`}
                style={{backgroundColor:online?'#fff':'#fff'}}/>
            </div>
          </div>

          <div className="flex gap-2">
            <button onClick={()=>navigate('/profile')}
              className="px-3 py-1.5 rounded-xl border text-xs font-bold hover:bg-gray-50 transition"
              style={{borderColor:C.g200, color:C.g600}}>
              Edit Profile
            </button>
            <button onClick={()=>navigate('/create-offer')}
              className="px-3 py-1.5 rounded-xl text-white text-xs font-bold hover:opacity-90 transition"
              style={{backgroundColor:C.green}}>
              + New Offer
            </button>
          </div>
        </div>

        {/* Name + badge */}
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <h2 className="font-black text-lg" style={{color:C.forest}}>{profile?.username || user?.username}</h2>
          <BadgeChip user={profile || user} size="sm" />
          {profile?.kyc_verified && <BadgeCheck size={16} style={{color:C.paid}} title="KYC Verified"/>}
        </div>

        {/* Online status + meta */}
        <div className="flex flex-wrap gap-3 text-xs mb-4" style={{color:C.g500}}>
          <span className="flex items-center gap-1" style={{color:online?C.online:C.g400}}>
            <span className="w-1.5 h-1.5 rounded-full" style={{backgroundColor:online?C.online:C.g400}}/>
            {online ? 'Online now' : 'Offline'}
          </span>
          {user?.created_at && (
            <span className="flex items-center gap-1">
              <Calendar size={11}/>
              Joined {new Date(user.created_at).toLocaleDateString('en-US',{month:'short',year:'numeric'})}
            </span>
          )}
          {profile?.country && (
            <span className="flex items-center gap-1"><MapPin size={11}/>{profile.country}</span>
          )}
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
          {[
            {label:'Trades',   value:fmt(stats.totalTrades||0),                          color:C.green,   icon:null},
            {label:'Rating',   value:<span className="inline-flex items-center justify-center gap-1"><Star size={12} fill={C.amber} color={C.amber}/>{parseFloat(stats.averageRating||0).toFixed(1)}</span>,color:C.amber,   icon:null},
            {label:'Positive', value:fmt(stats.positiveFeedback||0),                     color:C.success, icon:ThumbsUp},
            {label:'Negative', value:fmt(stats.negativeFeedback||0),                     color:C.danger,  icon:ThumbsDown},
          ].map(({label,value,color,icon:Icon})=>(
            <div key={label} className="text-center p-2.5 rounded-xl" style={{backgroundColor:C.g50}}>
              {Icon && (
                <div className="flex justify-center mb-0.5">
                  <Icon size={13} style={{color}}/>
                </div>
              )}
              <p className="font-black text-base" style={{color}}>{value}</p>
              <p className="text-xs font-semibold" style={{color:C.g400}}>{label}</p>
            </div>
          ))}
        </div>

        {/* Next badge progress */}
        {next && (
          <div className="p-3 rounded-xl border" style={{backgroundColor:`${C.gold}08`, borderColor:`${C.gold}30`}}>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-black flex items-center gap-1.5" style={{color:C.g700}}>
                Next:
                <span className="inline-flex items-center gap-1" style={{color:C.amber}}>
                  {renderBadgeIcon(next, 12)}
                  {next.label}
                </span>
              </p>
            </div>
            <div>
              <div className="flex justify-between text-xs mb-0.5" style={{color:C.g500}}>
                <span>Feedback</span>
                <span>{stats.totalFeedback || 0} / {next.countNeeded}</span>
              </div>
              <div className="h-1.5 rounded-full" style={{backgroundColor:C.g200}}>
                <div className="h-1.5 rounded-full transition-all" style={{width:`${badgeProgress * 100}%`, backgroundColor:C.gold}}/>
              </div>
            </div>
          </div>
        )}
        {!next && (
          <div className="flex items-center gap-2 p-3 rounded-xl" style={{backgroundColor:`${C.gold}12`}}>
            {renderBadgeIcon(TRUST_MAP.EXPERT, 16)}
            <p className="text-xs font-black" style={{color:C.amber}}>You&apos;ve reached the highest badge — EXPERT!</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Affiliate Section — Premium Design ───────────────────────────────────────
function AffiliateSection({ user, profile, earnings, referralData, btcPrice, onWithdraw, dbReferralCount, dbTotalEarnings, dbReferralTrades, leaderboard }) {
  const [copied, setCopied] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const referralLink = `https://praqen.com/signup?ref=${user?.referral_code || profile?.referral_code || 'PRAQEN'}`;

  // Use the largest non-zero value across all sources so stale/missing data
  // in one source can never hide real earnings that another source has.
  const totalEarnings = Math.max(
    parseFloat(dbTotalEarnings               || 0),
    parseFloat(referralData?.userReferralEarnings || 0),
    parseFloat(referralData?.totalEarned         || 0),
    earnings.reduce((s,e) => s + parseFloat(e.commission_btc||0), 0),
  );
  const totalUsd       = totalEarnings * (btcPrice || 0);
  const totalReferrals = Math.max(
    dbReferralCount                   || 0,
    referralData?.referralCount       || 0,
    new Set(earnings.map(e=>e.referred_user_id)).size,
  );
  const totalTrades = Math.max(
    dbReferralTrades             || 0,
    referralData?.tradeCount     || 0,
    earnings.length,
  );
  const lastEarning = earnings[0]?.commission_btc||0;

  const copy = () => {
    copyToClipboard(referralLink, 'Referral link copied! Share it to earn BTC')
      .then((ok) => { if (ok) setCopied(true); setTimeout(()=>setCopied(false),2500); });
  };

  const SHARE_LINKS = [
    {
      label:'Twitter/X', icon:Twitter,
      color:'#000', bg:'#F8FAFC',
      url:`https://twitter.com/intent/tweet?text=${encodeURIComponent(`Trading Bitcoin the safe way on @praqenapp. Join me and trade with full escrow protection. Sign up here:`)} ${referralLink}`,
    },
    {
      label:'Telegram', icon:Send,
      color:'#0088CC', bg:'#EFF6FF',
      url:`https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${encodeURIComponent('Join PRAQEN — secure P2P Bitcoin trading worldwide!')}`,
    },
  ];

  // Tier milestones
  const TIERS = [
    {trades:1,   label:'Starter',   reward:'0.1%',  color:'#94A3B8' },
    {trades:10,  label:'Active',    reward:'0.15%', color:'#3B82F6' },
    {trades:25,  label:'Builder',   reward:'0.2%',  color:'#10B981' },
    {trades:50,  label:'Champion',  reward:'0.25%', color:'#8B5CF6' },
    {trades:100, label:'Elite',     reward:'0.3%',  color:'#F4A422' },
  ];
  const currentTier = [...TIERS].reverse().find(t => totalTrades >= t.trades) || null;
  const nextTier    = TIERS.find(t => t.trades > totalTrades);

  return (
    <div className="space-y-4">

      {/* ── HERO BANNER ─────────────────────────────────────────────── */}
      <div className="rounded-2xl overflow-hidden shadow-md relative"
        style={{background:`linear-gradient(135deg,#4C1D95,#6D28D9,#8B5CF6)`}}>
        {/* Background pattern */}
        <div className="absolute inset-0 opacity-10"
          style={{backgroundImage:'radial-gradient(circle at 2px 2px,white 1px,transparent 0)',backgroundSize:'20px 20px'}}/>
        <div className="absolute top-0 right-0 w-64 h-64 rounded-full opacity-10 blur-3xl" style={{backgroundColor:'#A78BFA'}}/>

        <div className="relative p-5 md:p-6">
          <div className="flex items-start justify-between gap-4 mb-5">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-black mb-3"
                style={{backgroundColor:'rgba(255,255,255,0.15)', color:'#fff'}}>
                <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse"/>
                AFFILIATE PROGRAM
              </div>
              <h2 className="text-xl md:text-2xl font-black text-white leading-tight mb-1"
                style={{fontFamily:"'Syne',sans-serif"}}>
                Earn BTC for Every<br/>Referral You Make
              </h2>
              <p className="text-white/65 text-xs leading-relaxed">
                Share your link. Your friends sign up and trade. You earn{' '}
                <strong className="text-yellow-300">0.1–0.3% commission</strong> in Bitcoin — instantly, automatically.
              </p>
            </div>
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0"
              style={{backgroundColor:'rgba(255,255,255,0.15)'}}>
              <Rocket size={28} color="#fff" strokeWidth={2} />
            </div>
          </div>

          {/* 3 stat chips */}
          <div className="grid grid-cols-3 gap-2 mb-5">
            <div className="text-center p-3 rounded-xl" style={{backgroundColor:'rgba(255,255,255,0.1)'}}>
              <Bitcoin size={22} className="mx-auto mb-1" style={{color:'#FDE68A'}}/>
              <p className="font-black text-sm text-white">₿ {fmtBtc(totalEarnings)}</p>
              {btcPrice > 0 && (
                <p className="text-xs" style={{color:'#FDE68A'}}>
                  ≈ {totalUsd >= 0.01 ? `$${totalUsd.toFixed(2)}` : totalUsd > 0 ? `$${totalUsd.toFixed(5)}` : '$0.00'}
                </p>
              )}
              <p className="text-xs" style={{color:'rgba(255,255,255,0.55)'}}>Total Earned</p>
            </div>
            <div className="text-center p-3 rounded-xl" style={{backgroundColor:'rgba(255,255,255,0.1)'}}>
              <Users size={22} className="mx-auto mb-1" style={{color:'#FDE68A'}}/>
              <p className="font-black text-sm text-white">{fmt(totalReferrals)}</p>
              <p className="text-xs" style={{color:'rgba(255,255,255,0.55)'}}>Referrals</p>
            </div>
            <div className="text-center p-3 rounded-xl" style={{backgroundColor:'rgba(255,255,255,0.1)'}}>
              <Zap size={22} className="mx-auto mb-1" style={{color:'#FDE68A'}}/>
              <p className="font-black text-sm text-white">{fmt(totalTrades)}</p>
              <p className="text-xs" style={{color:'rgba(255,255,255,0.55)'}}>Ref. Trades</p>
            </div>
          </div>

          {/* Referral link box */}
          <div>
            <p className="text-xs font-bold text-white/60 mb-1.5 uppercase tracking-wider">Your Referral Link</p>
            <div className="flex gap-2">
              <div className="flex-1 flex items-center gap-2 px-3 py-2.5 rounded-xl"
                style={{backgroundColor:'rgba(255,255,255,0.12)'}}>
                <Link size={14} style={{color:'rgba(255,255,255,0.5)', flexShrink:0}}/>
                <p className="flex-1 text-xs font-mono text-white/80 truncate">{referralLink}</p>
              </div>
              <button onClick={copy}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl font-black text-xs transition flex-shrink-0"
                style={{backgroundColor:copied?'#10B981':C.gold, color:copied?'#fff':C.forest}}>
                {copied ? <><CheckCircle size={12}/>Copied!</> : <><Copy size={12}/>Copy</>}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── SHARE SECTION ───────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border shadow-sm p-4" style={{borderColor:C.g200}}>
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-black flex items-center gap-1.5" style={{color:C.forest}}>
            <Megaphone size={13} style={{color:C.amber, flexShrink:0}}/> Share Your Link
          </p>
          <p className="text-xs" style={{color:C.g400}}>Tap to share on any platform</p>
        </div>
        <div className="grid grid-cols-3 gap-2 mb-3">
          {SHARE_LINKS.map(({label,icon:Icon,color,bg,url})=>(
            <a key={label} href={url} target="_blank" rel="noopener noreferrer"
              className="flex flex-col items-center gap-1.5 p-3 rounded-xl border transition hover:-translate-y-0.5 hover:shadow-sm"
              style={{borderColor:C.g200, backgroundColor:bg}}>
              <Icon size={20} style={{color}}/>
              <span className="text-xs font-bold" style={{color}}>{label}</span>
            </a>
          ))}
        </div>
        <div className="flex items-center gap-2 p-3 rounded-xl border"
          style={{borderColor:`${C.gold}30`, backgroundColor:`${C.gold}08`}}>
          <Zap size={12} style={{color:C.amber, flexShrink:0}}/>
          <p className="text-xs" style={{color:C.g600}}>
            Commission is credited <strong style={{color:C.amber}}>instantly</strong> in BTC when your referral completes a trade.
          </p>
        </div>
      </div>

      {/* ── COMMISSION TIERS ────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border shadow-sm p-4" style={{borderColor:C.g200}}>
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-black flex items-center gap-1.5" style={{color:C.forest}}>
            <Trophy size={13} style={{color:C.amber, flexShrink:0}}/> Commission Tiers
          </p>
          {currentTier ? (
            <span className="text-xs font-black px-2.5 py-1 rounded-full text-white"
              style={{backgroundColor:currentTier.color}}>
              {currentTier.label} — {currentTier.reward}
            </span>
          ) : (
            <span className="text-xs font-bold px-2.5 py-1 rounded-full"
              style={{backgroundColor:C.g100, color:C.g500}}>
              No tier yet
            </span>
          )}
        </div>
        <div className="space-y-1.5">
          {TIERS.map((tier,i)=>{
            const active = currentTier?.trades === tier.trades;
            const done   = totalTrades >= tier.trades;
            return (
              <div key={i} className="flex items-center gap-3 p-2.5 rounded-xl transition"
                style={{
                  backgroundColor:active?`${tier.color}15`:done?`${tier.color}08`:C.g50,
                  border:`1px solid ${active?tier.color:done?`${tier.color}30`:C.g100}`,
                }}>
                <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{backgroundColor:done||active?tier.color:C.g200}}>
                  {done||active
                    ? <CheckCircle size={12} className="text-white"/>
                    : <span className="text-xs font-black" style={{color:C.g500}}>{tier.trades}</span>}
                </div>
                <div className="flex-1">
                  <p className="text-xs font-black" style={{color:active?tier.color:done?C.g700:C.g400}}>
                    {tier.label}
                    {active && <span className="ml-1.5 text-xs px-1.5 py-0.5 rounded-full text-white font-bold"
                      style={{backgroundColor:tier.color}}>YOUR TIER</span>}
                  </p>
                  <p className="text-xs" style={{color:C.g400}}>{tier.trades} referral trades</p>
                </div>
                <span className="font-black text-xs flex-shrink-0" style={{color:active?tier.color:done?tier.color:C.g400}}>
                  {tier.reward}
                </span>
              </div>
            );
          })}
        </div>
        {nextTier && (
          <div className="mt-3 p-2.5 rounded-xl border"
            style={{borderColor:`${nextTier.color}30`, backgroundColor:`${nextTier.color}08`}}>
            <div className="flex justify-between text-xs mb-1">
              <span style={{color:C.g500}}>
                Progress to <strong style={{color:nextTier.color}}>{nextTier.label}</strong>
              </span>
              <span className="font-black" style={{color:nextTier.color}}>
                {totalTrades}/{nextTier.trades} trades
              </span>
            </div>
            <div className="h-2.5 rounded-full overflow-hidden" style={{backgroundColor:C.g200}}>
              <div className="h-2.5 rounded-full transition-all duration-700"
                style={{
                  width: totalTrades > 0
                    ? `${Math.max(5, Math.min(100, (totalTrades / nextTier.trades) * 100))}%`
                    : '0%',
                  backgroundColor: nextTier.color,
                  backgroundImage: totalTrades > 0 && totalTrades < nextTier.trades
                    ? 'linear-gradient(90deg,rgba(255,255,255,0.2) 25%,transparent 25%,transparent 50%,rgba(255,255,255,0.2) 50%,rgba(255,255,255,0.2) 75%,transparent 75%)'
                    : 'none',
                  backgroundSize: '16px 100%',
                  animation: totalTrades > 0 && totalTrades < nextTier.trades
                    ? 'tier-stripe 1.2s linear infinite' : 'none',
                }}/>
            </div>
            <style>{`@keyframes tier-stripe{from{background-position:0 0}to{background-position:16px 0}}`}</style>
            {totalTrades > 0 && (
              <p className="text-xs mt-1.5 font-bold" style={{color:nextTier.color}}>
                {nextTier.trades - totalTrades} more referral trade{nextTier.trades - totalTrades !== 1 ? 's' : ''} to unlock {nextTier.label} ({nextTier.reward})
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── WITHDRAWAL ──────────────────────────────────────────────── */}
      {btcPrice > 0 && (
        <div className="bg-white rounded-2xl border shadow-sm p-4" style={{borderColor:C.g200}}>
          <p className="text-xs font-black mb-3 flex items-center gap-1.5" style={{color:C.forest}}>
            <DollarSign size={13} style={{color:C.success, flexShrink:0}}/> Withdraw Earnings
          </p>
          <div className="flex justify-between text-xs mb-1">
            <span style={{color:C.g500}}>Progress to $10.00 minimum</span>
            <span className="font-bold" style={{color:C.forest}}>
              {totalUsd >= 0.01
                ? `$${totalUsd.toFixed(2)}`
                : totalUsd > 0
                  ? `$${totalUsd.toFixed(6)}`
                  : '$0.00'
              } / $10.00
            </span>
          </div>
          {/* Sub-label: always show BTC amount so user sees their real balance */}
          {totalEarnings > 0 && (
            <p className="text-xs mb-1.5" style={{color:C.g400}}>
              ₿ {fmtBtc(totalEarnings)} earned
            </p>
          )}
          <div className="w-full rounded-full h-2.5 mb-3 overflow-hidden" style={{backgroundColor:C.g200}}>
            <div className="h-2.5 rounded-full transition-all duration-700"
              style={{
                width: totalEarnings > 0
                  ? `${Math.max(3, Math.min(100, (totalUsd / 10) * 100))}%`
                  : '0%',
                backgroundColor: C.success,
                backgroundImage: totalUsd < 10
                  ? 'linear-gradient(90deg,rgba(255,255,255,0.15) 25%,transparent 25%,transparent 50%,rgba(255,255,255,0.15) 50%,rgba(255,255,255,0.15) 75%,transparent 75%)'
                  : 'none',
                backgroundSize: '20px 100%',
                animation: totalEarnings > 0 && totalUsd < 10 ? 'progress-stripe 1s linear infinite' : 'none',
              }}/>
          </div>
          <style>{`@keyframes progress-stripe{from{background-position:0 0}to{background-position:20px 0}}`}</style>
          <button
            onClick={onWithdraw}
            disabled={totalUsd < 10}
            className="w-full py-3 rounded-xl font-bold text-white text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            style={{backgroundColor: totalUsd >= 10 ? C.forest : C.g400}}>
            {totalUsd >= 10 ? (
              <><Send size={14}/> Withdraw ₿ {fmtBtc(totalEarnings)} to Wallet</>
            ) : (
              <><Clock size={14}/> Need ${Math.max(0, 10 - totalUsd).toFixed(2)} more to withdraw</>
            )}
          </button>
        </div>
      )}

      {/* ── PEOPLE YOU REFERRED ─────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border shadow-sm overflow-hidden" style={{borderColor:C.g200}}>
        <div className="px-4 py-3 border-b flex items-center justify-between"
          style={{borderColor:C.g100, backgroundColor:`${C.purple}08`}}>
          <div className="flex items-center gap-2">
            <Users size={14} style={{color:C.purple}}/>
            <p className="text-xs font-black" style={{color:C.forest}}>People You Referred</p>
          </div>
          <span className="text-xs font-black px-2.5 py-1 rounded-full text-white"
            style={{backgroundColor:C.purple}}>
            {totalReferrals} total
          </span>
        </div>
        {referralData?.referredUsers?.length > 0 ? (
          <div className="divide-y max-h-64 overflow-y-auto" style={{borderColor:C.g50}}>
            {referralData.referredUsers.map((ru, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition">
                <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 font-black text-sm text-white"
                  style={{backgroundColor:C.purple}}>
                  {ru.username?.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-black" style={{color:C.forest}}>@{ru.username}</p>
                  <p className="text-xs" style={{color:C.g400}}>
                    {ru.total_trades > 0 ? `${ru.total_trades} trade${ru.total_trades>1?'s':''}` : 'Joined · no trades yet'}
                    {ru.joined_at && ` · ${new Date(ru.joined_at).toLocaleDateString('en-US',{day:'numeric',month:'short',year:'numeric'})}`}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  {ru.total_earned > 0 ? (
                    <>
                      <p className="font-black text-xs" style={{color:C.success}}>+₿ {fmtBtc(ru.total_earned)}</p>
                      {btcPrice > 0 && <p className="text-xs" style={{color:C.g400}}>≈ ${(ru.total_earned * btcPrice).toFixed(2)}</p>}
                    </>
                  ) : (
                    <span className="text-xs px-2 py-0.5 rounded-full font-bold" style={{backgroundColor:`${C.purple}15`,color:C.purple}}>pending</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : totalReferrals > 0 ? (
          <div className="p-5">
            <div className="rounded-xl p-4 text-center" style={{backgroundColor:`${C.purple}08`,border:`1px dashed ${C.purple}40`}}>
              <Users size={30} className="mx-auto mb-2" style={{color:C.purple}}/>
              <p className="text-sm font-black mb-1" style={{color:C.forest}}>{totalReferrals} people signed up with your link!</p>
              <p className="text-xs leading-relaxed" style={{color:C.g400}}>
                Their profiles will appear here once they place their first trade.<br/>
                Keep sharing to grow your affiliate network.
              </p>
            </div>
          </div>
        ) : (
          <div className="p-6 text-center">
            <Users size={30} className="mx-auto mb-2" style={{color:C.purple}}/>
            <p className="text-sm font-black mb-1" style={{color:C.forest}}>No referrals yet</p>
            <p className="text-xs" style={{color:C.g400}}>Share your link below to start earning BTC!</p>
          </div>
        )}
      </div>

      {/* ── HOW IT WORKS ────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border shadow-sm p-4" style={{borderColor:C.g200}}>
        <p className="text-xs font-black mb-3 flex items-center gap-1.5" style={{color:C.forest}}>
          <Lightbulb size={13} style={{color:C.amber, flexShrink:0}}/> How the Affiliate Program Works
        </p>
        <div className="space-y-2.5">
          {[
            { step:'1', title:'Share Your Link', body:'Copy your unique referral link and share it on WhatsApp, Telegram, Twitter or anywhere.', color:'#3B82F6' },
            { step:'2', title:'Friend Signs Up & Trades', body:'When your friend clicks your link, registers, and completes a trade — you earn automatically.', color:C.green },
            { step:'3', title:'Earn BTC Commission', body:'You receive 0.1%–0.3% of every trade value in Bitcoin, directly credited to your account.', color:C.amber },
            { step:'4', title:'No Limits, No Expiry', body:'Earn forever — there\'s no cap on how many people you refer or how much BTC you can earn.', color:C.purple },
          ].map(({step,title,body,color})=>(
            <div key={step} className="flex gap-3">
              <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-black text-white flex-shrink-0 mt-0.5"
                style={{backgroundColor:color}}>{step}</div>
              <div>
                <p className="text-xs font-black" style={{color:C.forest}}>{title}</p>
                <p className="text-xs leading-relaxed mt-0.5" style={{color:C.g500}}>{body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── LEADERBOARD ─────────────────────────────────────────────── */}
      {leaderboard && leaderboard.length > 0 && (
        <div className="bg-white rounded-2xl border shadow-sm overflow-hidden" style={{borderColor:C.g200}}>
          <div className="px-4 py-3 border-b flex items-center justify-between"
            style={{borderColor:C.g100, background:'linear-gradient(135deg,#FEF3C7,#FDE68A20)'}}>
            <div className="flex items-center gap-2">
              <Trophy size={14} style={{color:C.amber}}/>
              <p className="text-xs font-black" style={{color:C.forest}}>Top Earners — Affiliate Leaderboard</p>
            </div>
            <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{backgroundColor:`${C.amber}20`, color:C.amber}}>
              All Time
            </span>
          </div>
          <div className="divide-y" style={{borderColor:C.g50}}>
            {leaderboard.slice(0, 10).map((entry) => (
              <div key={entry.rank} className={`flex items-center gap-3 px-4 py-3 transition ${entry.rank <= 3 ? 'hover:bg-yellow-50' : 'hover:bg-gray-50'}`}>
                {/* Rank */}
                <div className="w-8 flex-shrink-0 text-center">
                  {entry.rank === 1 && <Medal size={20} style={{color:'#F4A422'}} fill="#F4A422"/>}
                  {entry.rank === 2 && <Medal size={20} style={{color:'#CBD5E1'}} fill="#CBD5E1"/>}
                  {entry.rank === 3 && <Medal size={20} style={{color:'#CD7F32'}} fill="#CD7F32"/>}
                  {entry.rank > 3  && <span className="text-sm font-black" style={{color:C.g400}}>#{entry.rank}</span>}
                </div>
                {/* Avatar */}
                <div className="w-9 h-9 rounded-full flex items-center justify-center font-black text-sm text-white flex-shrink-0 shadow-sm"
                  style={{backgroundColor: BADGE_COLORS[entry.badge] || C.green}}>
                  {entry.username?.charAt(0)?.toUpperCase()}
                </div>
                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="text-xs font-black truncate" style={{color:C.forest}}>
                      {entry.username}
                    </p>
                    <span className="text-xs px-1.5 py-0.5 rounded-full font-bold flex-shrink-0">
                      <BadgeChip user={{ badge: entry.badge }} badgeName={entry.badge} size="xs" />
                    </span>
                  </div>
                  <p className="text-xs mt-0.5" style={{color:C.g400}}>
                    {entry.referrals} referral{entry.referrals !== 1 ? 's' : ''} · {entry.affiliate_trades} ref trade{entry.affiliate_trades !== 1 ? 's' : ''}
                  </p>
                </div>
                {/* Earnings */}
                <div className="text-right flex-shrink-0">
                  <p className="text-xs font-black" style={{color:C.success}}>
                    ₿ {parseFloat(entry.earned_btc || 0).toFixed(8)}
                  </p>
                  {btcPrice > 0 && (
                    <p className="text-xs" style={{color:C.g400}}>
                      {(entry.earned_btc * btcPrice) >= 0.01
                        ? `≈ $${(entry.earned_btc * btcPrice).toFixed(2)}`
                        : `≈ $${(entry.earned_btc * btcPrice).toFixed(5)}`}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="px-4 py-2.5 border-t text-center" style={{borderColor:C.g100, backgroundColor:C.g50}}>
            <p className="text-xs flex items-center justify-center gap-1" style={{color:C.g400}}>
              <Trophy size={11} style={{color:C.amber, flexShrink:0}}/> Top {leaderboard.length} affiliate earner{leaderboard.length !== 1 ? 's' : ''} on PRAQEN. Could you be next?
            </p>
          </div>
        </div>
      )}

      {/* ── RECENT EARNINGS ─────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border shadow-sm overflow-hidden" style={{borderColor:C.g200}}>
        <div className="px-4 py-3 border-b flex items-center justify-between"
          style={{borderColor:C.g100, backgroundColor:`${C.success}08`}}>
          <div className="flex items-center gap-2">
            <Bitcoin size={14} style={{color:C.success}}/>
            <p className="text-xs font-black" style={{color:C.forest}}>Recent Earnings</p>
          </div>
          {totalEarnings > 0 && (
            <span className="text-xs font-black px-2.5 py-1 rounded-full text-white"
              style={{backgroundColor:C.success}}>
              ₿ {fmtBtc(totalEarnings)} total
            </span>
          )}
        </div>
        {earnings.length===0 ? (
          <div className="p-6">
            {totalEarnings > 0 ? (
              <div className="rounded-xl p-4 text-center" style={{backgroundColor:`${C.success}08`,border:`1px dashed ${C.success}40`}}>
                <Bitcoin size={28} className="mx-auto mb-2" style={{color:C.success}}/>
                <p className="text-sm font-black mb-1" style={{color:C.forest}}>₿ {fmtBtc(totalEarnings)} earned</p>
                <p className="text-xs leading-relaxed" style={{color:C.g400}}>
                  {btcPrice>0 ? `≈ $${(totalEarnings*btcPrice).toFixed(2)} USD · ` : ''}
                  Detailed per-trade records appear here for new trades.
                </p>
              </div>
            ) : (
              <div className="text-center py-4">
                <DollarSign size={36} className="mx-auto mb-3" style={{color:C.gold}}/>
                <p className="text-sm font-black mb-1" style={{color:C.forest}}>No earnings yet</p>
                <p className="text-xs mb-4" style={{color:C.g400}}>Share your referral link to start earning BTC commissions.</p>
                <button onClick={copy}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-black text-xs text-white"
                  style={{backgroundColor:C.purple}}>
                  <Copy size={12}/>Copy Referral Link
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="divide-y max-h-56 overflow-y-auto" style={{borderColor:C.g50}}>
            {earnings.slice(0,10).map((e,i)=>(
              <div key={i} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{backgroundColor:`${C.success}12`}}>
                  <Bitcoin size={14} style={{color:C.success}}/>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-black" style={{color:C.forest}}>
                    {e.referred_user?.username ? `From @${e.referred_user.username}` : 'Commission Earned'}
                  </p>
                  <p className="text-xs font-mono truncate" style={{color:C.g400}}>
                    Trade #{String(e.trade_id||'').slice(0,8).toUpperCase()}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="font-black text-xs" style={{color:C.success}}>+{fmtBtc(e.commission_btc)} BTC</p>
                  {e.created_at && (
                    <p className="text-xs" style={{color:C.g400}}>
                      {new Date(e.created_at).toLocaleDateString('en-US',{day:'numeric',month:'short'})}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Dashboard ────────────────────────────────────────────────────────────
export default function Dashboard({ user }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const displayUser = useLocalUser(user);

  const [profile, setProfile]       = useState(null);
  const [stats, setStats]           = useState({
    totalTrades:0, completedTrades:0, pendingTrades:0,
    totalVolume:0, activeListings:0, totalReferrals:0,
    totalFeedback:0, positiveFeedback:0, negativeFeedback:0,
  });
  const [recentTrades, setRecentTrades]   = useState([]);
  const [activeTrades, setActiveTrades]   = useState([]);
  const [earnings, setEarnings]           = useState([]);
  const [referralData, setReferralData]   = useState(null);
  const [leaderboard, setLeaderboard]     = useState([]);
  const [btcPrice, setBtcPrice]           = useState(0);
  const [walletBalance, setWalletBalance] = useState(0);
  const [showBalance, setShowBalance]     = useState(true);
  const [loading, setLoading]             = useState(true);
  const [loadError, setLoadError]         = useState(false);
  const VALID_TABS = ['overview','trades','wallet','affiliate','profile'];
  const [activeTab, setActiveTab]         = useState(() => {
    const t = searchParams.get('tab');
    return VALID_TABS.includes(t) ? t : 'overview';
  });
  const [lastRefresh, setLastRefresh]     = useState(null);
  const [isRefreshing, setIsRefreshing]   = useState(false);

  const applyUserData = (userData) => {
    setProfile(userData);
    setStats({
      totalTrades: userData.total_trades || 0,
      totalFeedback: userData.total_feedback_count || 0,
      positiveFeedback: userData.positive_feedback || 0,
      negativeFeedback: userData.negative_feedback || 0,
      averageRating: userData.average_rating || 0,
      totalVolume: (userData.total_trades || 0) * 100,
      completionRate: userData.completion_rate || 100,
      rating: userData.average_rating || 0,
      referralCode: userData.referral_code || '',
      totalReferrals: userData.total_referrals || 0,
      referralEarnings: userData.referral_earnings_btc || 0,
      referralTrades: userData.referral_trade_count || 0,
      badge: userData.badge || 'BEGINNER'
    });
  };

  const loadDashboardData = async (silent = false) => {
    if (!silent) setLoadError(false);
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/users/${user.id}`, {
        headers: { 'Authorization': `Bearer ${token}` },
        timeout: 15000,
      });
      applyUserData(response.data.user);
      setLastRefresh(new Date());
    } catch (error) {
      console.error('Dashboard refresh error:', error);
      if (!silent) setLoadError(true);
    }
  };

  const handleRefresh = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      const token = localStorage.getItem('token');
      if (token) {
        await axios.post(`${API_URL}/users/heartbeat`, {}, {
          headers: { Authorization: `Bearer ${token}` }
        }).catch(() => {});
      }
      await loadDashboardData(true);
      await fetchWalletBalance();
      await fetchReferralData();
      await fetchTrades();
    } finally {
      setIsRefreshing(false);
    }
  };

  const fetchReferralData = async () => {
    const token = localStorage.getItem('token');
    if (!token) return;
    try {
      const res = await axios.get(`${API_URL}/referral/earnings`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.data.success) {
        setReferralData(res.data);
        setEarnings(res.data.earnings || []);
        const freshEarned    = Math.max(
          parseFloat(res.data.userReferralEarnings || 0),
          parseFloat(res.data.totalEarned          || 0),
        );
        const freshReferrals = res.data.referralCount != null ? res.data.referralCount : (res.data.referredUsers?.length || 0);
        const freshTrades    = res.data.tradeCount    != null ? res.data.tradeCount    : (res.data.earnings?.length || 0);
        // Use fresh data directly — no Math.max so counts update in real time
        setStats(prev => ({
          ...prev,
          referralEarnings: freshEarned,
          totalReferrals:   freshReferrals,
          referralTrades:   freshTrades,
        }));
      }
    } catch (e) { /* silent */ }
  };

  const fetchTrades = async () => {
    const token = localStorage.getItem('token');
    if (!token) return;
    try {
      const [activeRes, allRes] = await Promise.all([
        axios.get(`${API_URL}/trades/active`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${API_URL}/my-trades?limit=50`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (activeRes.data.success) setActiveTrades(activeRes.data.trades || []);
      if (allRes.data.trades) setRecentTrades(allRes.data.trades || []);
    } catch (e) { /* silent */ }
  };

  const fetchLeaderboard = async () => {
    try {
      const res = await axios.get(`${API_URL}/referral/leaderboard`);
      if (res.data.success) setLeaderboard(res.data.leaderboard || []);
    } catch (e) { /* silent */ }
  };

  const exportTradesCSV = () => {
    if (recentTrades.length === 0) { toast.info('No trades to export yet.'); return; }
    const headers = ['Trade ID','Type','Status','BTC Amount','Local Amount','Currency','Payment Method','Date','Counterparty'];
    const rows = recentTrades.map(t => {
      const isBuyer = t.buyer_id === user?.id;
      const cp = isBuyer ? (t.seller?.username||'—') : (t.buyer?.username||'—');
      return [
        t.id?.slice(0,8).toUpperCase(),
        isBuyer ? 'BUY' : 'SELL',
        t.status,
        parseFloat(t.amount_btc||0).toFixed(8),
        parseFloat(t.amount_local||t.amount_usd||0).toFixed(2),
        t.local_currency||t.currency||'USD',
        t.payment_method||'—',
        t.created_at ? new Date(t.created_at).toLocaleDateString() : '—',
        cp,
      ];
    });
    const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `praqen-trades-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Trade history exported!');
  };

  const fetchBtcPrice = async () => {
    try {
      const res = await fetch('https://api.coinbase.com/v2/prices/BTC-USD/spot');
      const data = await res.json();
      setBtcPrice(parseFloat(data.data.amount));
    } catch (e) { /* silent */ }
  };

  const fetchWalletBalance = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;
      const res = await axios.get(`${API_URL}/hd-wallet/wallet`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const bal = parseFloat(res.data?.balance_btc || 0);
      setWalletBalance(bal);
      localStorage.setItem('praqen_btc_balance', bal.toString());
    } catch (e) { /* silent */ }
  };

  const handleReferralWithdraw = async () => {
    const token = localStorage.getItem('token');
    try {
      const res = await axios.post(`${API_URL}/referral/withdraw`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success(res.data.message || 'Withdrawal submitted!');
      fetchReferralData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Withdrawal failed');
    }
  };

  // Seed instantly from user prop (already fetched by App.js) — no API call needed
  useEffect(() => {
    if (user) {
      applyUserData(user);
      setLoading(false);
      // Background refresh + heartbeat so user shows as online immediately
      const token = localStorage.getItem('token');
      if (token) {
        axios.post(`${API_URL}/users/heartbeat`, {}, { headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
      }
      loadDashboardData(true);
    }
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchReferralData();
    fetchBtcPrice();
    fetchWalletBalance();
    fetchTrades();
    fetchLeaderboard();
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  // Refresh trades every 15s; referral data every 30s; other data every 60s
  useEffect(() => {
    const tradeIv    = setInterval(fetchTrades, 15000);
    const referralIv = setInterval(() => { fetchReferralData(); fetchLeaderboard(); }, 30000);
    const iv = setInterval(() => {
      const token = localStorage.getItem('token');
      if (token) {
        axios.post(`${API_URL}/users/heartbeat`, {}, { headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
      }
      loadDashboardData(true);
      fetchWalletBalance();
    }, 60000);
    return () => { clearInterval(tradeIv); clearInterval(referralIv); clearInterval(iv); };
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{backgroundColor:C.mist}}>
      <div className="text-center">
        <div className="w-12 h-12 border-4 rounded-full animate-spin mx-auto mb-3"
          style={{borderColor:C.sage, borderTopColor:'transparent'}}/>
        <p className="text-sm font-semibold" style={{color:C.green}}>Loading dashboard…</p>
      </div>
    </div>
  );

  if (loadError && !profile) return (
    <div className="min-h-screen flex items-center justify-center" style={{backgroundColor:C.mist}}>
      <div className="text-center px-6">
        <AlertCircle size={40} className="mx-auto mb-3" style={{color:C.danger}}/>
        <p className="font-black text-sm mb-2" style={{color:C.g800}}>Could not load dashboard</p>
        <p className="text-xs mb-5" style={{color:C.g500}}>Check your connection and make sure the backend is running.</p>
        <button onClick={() => loadDashboardData(false)}
          className="px-6 py-2.5 rounded-xl text-white font-bold text-sm"
          style={{backgroundColor:C.green}}>
          Try Again
        </button>
      </div>
    </div>
  );

  const TABS = [
    {id:'overview',  label:'Overview',  icon:BarChart3},
    {id:'trades',    label:'Trades',    icon:Activity},
    {id:'wallet',    label:'Wallet',    icon:Wallet},
    {id:'affiliate', label:'Affiliate', icon:Users},
  ];

  return (
    <div className="min-h-screen pb-10" style={{backgroundColor:C.mist, fontFamily:"'DM Sans',sans-serif"}}>

      {/* Top bar */}
      <div className="border-b bg-white sticky z-30" style={{top:'var(--navbar-h)',borderColor:C.g200}}>
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="font-black text-base" style={{color:C.forest, fontFamily:"'Syne',sans-serif"}}>
              Dashboard
            </h1>
            {lastRefresh && (
              <p className="text-xs flex items-center gap-1" style={{color:C.online}}>
                <span className="w-1.5 h-1.5 rounded-full inline-block" style={{backgroundColor:C.online}}/>
                Online · Updated {lastRefresh.toLocaleTimeString()}
              </p>
            )}
          </div>
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition disabled:opacity-60"
            style={{
              borderColor: isRefreshing ? C.online : C.g200,
              color: isRefreshing ? C.online : C.g600,
              backgroundColor: isRefreshing ? `${C.online}10` : 'transparent',
            }}>
            <RefreshCw size={12} className={isRefreshing ? 'animate-spin' : ''}/>
            {isRefreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>

        {/* Tab nav */}
        <div className="max-w-6xl mx-auto px-4 flex gap-1 overflow-x-auto pb-0">
          {TABS.map(({id,label,icon:Icon})=>(
            <button key={id} onClick={()=>setActiveTab(id)}
              className="flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold whitespace-nowrap border-b-2 transition"
              style={{
                color:       activeTab===id ? C.green     : C.g500,
                borderColor: activeTab===id ? C.green     : 'transparent',
                backgroundColor: activeTab===id ? `${C.green}06` : 'transparent',
              }}>
              <Icon size={12}/>{label}
              {id==='trades' && stats.pendingTrades > 0 && (
                <span className="w-4 h-4 rounded-full text-white text-xs font-black flex items-center justify-center"
                  style={{backgroundColor:C.danger}}>{stats.pendingTrades}</span>
              )}
              {id==='affiliate' && stats.totalReferrals > 0 && (
                <span className="px-1.5 h-4 rounded-full text-white text-xs font-black flex items-center justify-center"
                  style={{backgroundColor:C.purple, fontSize:10}}>{stats.totalReferrals}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── ONLINE STATUS BANNER ──────────────────────────────────────────────── */}
      <div className="border-b" style={{borderColor:C.g100, backgroundColor: isRefreshing ? `${C.online}08` : lastRefresh ? `${C.online}05` : `${C.warn}05`}}>
        <div className="max-w-6xl mx-auto px-4 py-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {isRefreshing ? (
              <>
                <span className="w-2 h-2 rounded-full animate-pulse" style={{backgroundColor:C.online}}/>
                <span className="text-xs font-bold" style={{color:C.online}}>Syncing data…</span>
              </>
            ) : lastRefresh ? (
              <>
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{backgroundColor:C.online}}/>
                <span className="text-xs font-bold" style={{color:C.online}}>Active &amp; Online</span>
                <span className="text-xs hidden xs:inline" style={{color:C.g400}}>· {lastRefresh.toLocaleTimeString()}</span>
              </>
            ) : (
              <>
                <span className="w-2 h-2 rounded-full" style={{backgroundColor:C.warn}}/>
                <span className="text-xs font-bold" style={{color:C.warn}}>Tap Refresh to go Online</span>
              </>
            )}
          </div>
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-black transition disabled:opacity-50"
            style={{
              backgroundColor: isRefreshing ? `${C.online}20` : `${C.online}15`,
              color: C.online,
            }}>
            <RefreshCw size={11} className={isRefreshing ? 'animate-spin' : ''}/>
            {isRefreshing ? 'Syncing' : 'Refresh Now'}
          </button>
        </div>
      </div>

      {/* ── WELCOME BONUS BANNER ────────────────────────────────────────────────── */}
      <BonusBanner userId={user?.id} />

      <div className="max-w-6xl mx-auto px-4 py-5 space-y-5">

        {/* Profile always visible */}
        <ProfileSummary user={displayUser||user} profile={profile} stats={stats}/>

        {/* ── OVERVIEW TAB ──────────────────────────────────────────────────── */}
        {activeTab==='overview' && (
          <>
            {/* Stat cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <StatCard icon={Activity}   label="Total Trades"    value={fmt(stats.totalTrades)}     color={C.green}   onClick={()=>setActiveTab('trades')}/>
              <StatCard icon={CheckCircle}label="Completed"       value={fmt(stats.completedTrades)} color={C.success} sub={`${stats.totalTrades>0?Math.round(stats.completedTrades/stats.totalTrades*100):0}% completion`}/>
              <StatCard icon={Clock}      label="Pending"         value={fmt(stats.pendingTrades)}   color={C.warn}    onClick={()=>setActiveTab('trades')}/>
              <StatCard icon={DollarSign} label="Volume Traded"   value={`$${fmt(stats.totalVolume,0)}`} color={C.paid}/>
              <StatCard icon={Users}      label="Referrals"       value={fmt(stats.totalReferrals)}  color={C.purple}  onClick={()=>setActiveTab('affiliate')} sub="People you referred"/>
              <StatCard icon={Bitcoin}    label="BTC Earned"      value={`₿ ${parseFloat(stats.referralEarnings||0).toFixed(6)}`} color={C.success} onClick={()=>setActiveTab('affiliate')} sub={btcPrice>0?`≈ $${(parseFloat(stats.referralEarnings||0)*btcPrice).toFixed(2)} USD`:'Affiliate earnings'}/>
            </div>

            {/* Active trades + Quick actions row */}
            <div className="grid md:grid-cols-2 gap-4">

              {/* Active trades / Recent trades */}
              {(() => {
                const hasActive  = activeTrades.length > 0;
                const recent3    = recentTrades.slice(0, 3);
                const hasRecent  = recent3.length > 0;
                const showTrades = hasActive ? activeTrades : recent3;
                return (
                <div className="bg-white rounded-2xl border shadow-sm overflow-hidden" style={{borderColor:C.g200}}>
                  <div className="px-4 py-3 border-b" style={{borderColor:C.g100}}>
                    <SectionHeader
                      icon={Zap}
                      title={hasActive ? 'Active Trades' : 'Recent Trades'}
                      action={(hasActive || hasRecent) ? 'View All' : undefined}
                      onAction={()=>setActiveTab('trades')}/>
                  </div>

                  {(!hasActive && !hasRecent) ? (
                    <div className="p-8 text-center">
                      <Shield size={32} className="mx-auto mb-2 opacity-20" style={{color:C.g400}}/>
                      <p className="text-xs font-semibold mb-1" style={{color:C.g500}}>No trades yet</p>
                      <p className="text-xs mb-3" style={{color:C.g400}}>Start your first trade to see activity here</p>
                      <button onClick={()=>navigate('/buy-bitcoin')}
                        className="mt-1 px-4 py-2 rounded-xl text-white text-xs font-bold"
                        style={{backgroundColor:C.green}}>
                        Browse Offers →
                      </button>
                    </div>
                  ) : showTrades.map(trade=>{
                    const s       = getStatusBadge(trade.status);
                    const SI      = s.icon;
                    const isBuyer = trade.buyer_id === user?.id;
                    const cp      = isBuyer ? trade.seller : trade.buyer;
                    const pos     = parseInt(cp?.positive_feedback || 0);
                    const neg     = parseInt(cp?.negative_feedback || 0);
                    return (
                      <div key={trade.id} onClick={()=>navigate(`/trade/${trade.id}`)}
                        className="flex items-center gap-3 px-4 py-3 border-b hover:bg-gray-50 cursor-pointer transition"
                        style={{borderColor:C.g50}}>
                        <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                          style={{backgroundColor:`${s.color}15`}}>
                          <SI size={14} style={{color:s.color}}/>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="text-xs font-black" style={{color:C.forest}}>#{trade.id?.slice(0,8).toUpperCase()}</p>
                            <span className="text-xs font-bold px-1.5 py-0.5 rounded-full text-white"
                              style={{backgroundColor:s.color, fontSize:'9px'}}>
                              {s.text}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <p className="text-xs truncate" style={{color:C.g500}}>
                              with <span className="font-bold" style={{color:C.g700}}>{cp?.username || '—'}</span>
                            </p>
                            {pos > 0 && (
                              <span className="inline-flex items-center gap-0.5 text-xs font-bold" style={{color:C.success}}>
                                <ThumbsUp size={11}/>{pos}
                              </span>
                            )}
                            {neg > 0 && (
                              <span className="inline-flex items-center gap-0.5 text-xs font-bold" style={{color:C.danger}}>
                                <ThumbsDown size={11}/>{neg}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-xs font-black" style={{color:C.forest}}>{fmtBtc(trade.amount_btc)} BTC</p>
                          <p className="text-xs" style={{color:C.g400}}>
                            {trade.completed_at || trade.created_at
                              ? new Date(trade.completed_at || trade.created_at).toLocaleDateString(undefined,{month:'short',day:'numeric'})
                              : `$${fmt(trade.amount_usd,0)}`}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
                );
              })()}

              {/* Quick actions */}
              <div className="space-y-3">
                <div className="bg-white rounded-2xl border shadow-sm p-4" style={{borderColor:C.g200}}>
                  <SectionHeader icon={Zap} title="Quick Actions"/>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      {label:'Buy BTC',      icon:Bitcoin,    color:C.gold,    route:'/buy-bitcoin'},
                      {label:'Sell BTC',     icon:TrendingUp, color:C.amber,   route:'/sell-bitcoin'},
                      {label:'Create Offer', icon:PlusCircle, color:C.green,   route:'/create-offer'},
                      {label:'My Trades',    icon:Activity,   color:C.paid,    action:()=>setActiveTab('trades')},
                      {label:'My Offers',    icon:Gift,       color:C.purple,  route:'/my-listings'},
                      {label:'Withdraw',     icon:Send,       color:C.danger,  route:'/wallet'},
                    ].map(({label,icon:Icon,color,route,action})=>(
                      <button key={label} onClick={action||(()=>navigate(route))}
                        className="flex items-center gap-2.5 p-3 rounded-xl border hover:shadow-sm transition text-left"
                        style={{borderColor:C.g100}}>
                        <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                          style={{backgroundColor:`${color}15`}}>
                          <Icon size={14} style={{color}}/>
                        </div>
                        <span className="text-xs font-bold" style={{color:C.g700}}>{label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* My offers count */}
                <div className="bg-white rounded-2xl border shadow-sm p-4 flex items-center justify-between"
                  style={{borderColor:C.g200}}>
                  <div className="flex items-center gap-2">
                    <Gift size={14} style={{color:C.purple}}/>
                    <div>
                      <p className="text-xs font-black" style={{color:C.forest}}>Active Listings</p>
                      <p className="text-xs" style={{color:C.g400}}>Live on marketplace</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xl font-black" style={{color:C.purple}}>{stats.activeListings}</span>
                    <button onClick={()=>navigate('/create-offer')}
                      className="px-2.5 py-1.5 rounded-xl text-white text-xs font-bold"
                      style={{backgroundColor:C.purple}}>
                      + New
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* ── AFFILIATE QUICK VIEW ──────────────────────────────────────── */}
            <div className="rounded-2xl overflow-hidden shadow-sm"
              style={{background:'linear-gradient(135deg,#3B1F6B,#5B21B6,#7C3AED)'}}>
              <div className="p-4 md:p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{backgroundColor:'rgba(255,255,255,0.15)'}}>
                      <Rocket size={18} color="#fff" strokeWidth={2} />
                    </div>
                    <div>
                      <p className="text-sm font-black text-white">Your Affiliate Earnings</p>
                      <p className="text-xs" style={{color:'rgba(255,255,255,0.6)'}}>Earn BTC every time a referral trades</p>
                    </div>
                  </div>
                  <button onClick={()=>setActiveTab('affiliate')}
                    className="flex items-center gap-1 text-xs font-black px-3 py-1.5 rounded-xl flex-shrink-0"
                    style={{backgroundColor:'rgba(255,255,255,0.2)', color:'#fff'}}>
                    Details <ChevronRight size={12}/>
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-2 mb-4">
                  <div className="text-center p-3 rounded-xl" style={{backgroundColor:'rgba(255,255,255,0.1)'}}>
                    <p className="text-xl font-black text-white">{fmt(stats.totalReferrals)}</p>
                    <p className="text-xs mt-0.5" style={{color:'rgba(255,255,255,0.6)'}}>Referrals</p>
                  </div>
                  <div className="text-center p-3 rounded-xl" style={{backgroundColor:'rgba(255,255,255,0.1)'}}>
                    <p className="text-sm font-black text-white">₿ {parseFloat(stats.referralEarnings||0).toFixed(6)}</p>
                    <p className="text-xs mt-0.5" style={{color:'rgba(255,255,255,0.6)'}}>BTC Earned</p>
                  </div>
                  <div className="text-center p-3 rounded-xl" style={{backgroundColor:'rgba(255,255,255,0.1)'}}>
                    <p className="text-sm font-black text-white">
                      {btcPrice>0 ? `$${(parseFloat(stats.referralEarnings||0)*btcPrice).toFixed(2)}` : '--'}
                    </p>
                    <p className="text-xs mt-0.5" style={{color:'rgba(255,255,255,0.6)'}}>USD Value</p>
                  </div>
                </div>

                <div className="flex gap-2">
                  <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-xl"
                    style={{backgroundColor:'rgba(255,255,255,0.1)'}}>
                    <Link size={12} style={{color:'rgba(255,255,255,0.5)', flexShrink:0}}/>
                    <p className="flex-1 text-xs font-mono text-white/75 truncate">
                      praqen.com/signup?ref={displayUser?.referral_code||profile?.referral_code||'...'}
                    </p>
                  </div>
                  <button
                    onClick={()=>{
                      const link = `https://praqen.com/signup?ref=${displayUser?.referral_code||profile?.referral_code||''}`;
                      copyToClipboard(link, 'Referral link copied!');
                    }}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl font-black text-xs flex-shrink-0"
                    style={{backgroundColor:'#F4A422', color:'#1B4332'}}>
                    <Copy size={11}/>Copy
                  </button>
                </div>

                {stats.totalReferrals === 0 && (
                  <p className="mt-3 text-xs text-center" style={{color:'rgba(255,255,255,0.55)'}}>
                    Share your link — when friends sign up and trade, you earn <strong style={{color:'#FDE68A'}}>0.1–0.3% BTC</strong> commission automatically.
                  </p>
                )}
              </div>
            </div>

          {/* ── AFFILIATE AWARENESS BANNER — shown prominently until first referral ── */}
          {stats.totalReferrals === 0 && (
            <div className="rounded-2xl overflow-hidden shadow-sm border cursor-pointer"
              style={{borderColor:'#C4B5FD', background:'linear-gradient(135deg,#F5F3FF,#EDE9FE)'}}
              onClick={()=>setActiveTab('affiliate')}>
              <div className="p-4 flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
                  style={{backgroundColor:'#8B5CF620'}}>
                  <Bitcoin size={22} style={{color:'#7C3AED'}}/>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-black" style={{color:'#4C1D95'}}>
                    Did you know? You can earn Bitcoin just by sharing your link!
                  </p>
                  <p className="text-xs mt-0.5 leading-relaxed" style={{color:'#6D28D9'}}>
                    Invite friends to PRAQEN — when they trade, you earn <strong>0.1–0.3% commission</strong> in BTC automatically. No limits.
                  </p>
                </div>
                <div className="flex items-center gap-1 text-xs font-black flex-shrink-0 px-3 py-1.5 rounded-xl"
                  style={{backgroundColor:'#7C3AED', color:'#fff'}}>
                  Start <ChevronRight size={11}/>
                </div>
              </div>
            </div>
          )}
          </>
        )}

        {/* ── LAST VISITED ─────────────────────────────────────────────────────── */}
        {activeTab==='overview' && (
          <div className="bg-white rounded-2xl border shadow-sm overflow-hidden" style={{borderColor:C.g200}}>
            <div className="px-4 py-3 border-b" style={{borderColor:C.g100}}>
              <div className="flex items-center gap-2">
                <Clock size={14} style={{color:C.paid}}/>
                <h2 className="font-black text-sm" style={{color:C.forest}}>Last Visited Pages</h2>
              </div>
            </div>
            <div className="p-3 grid grid-cols-2 md:grid-cols-4 gap-2">
              {[
                {label:'Buy Bitcoin',    icon:Bitcoin,       route:'/buy-bitcoin',  color:C.gold,    sub:'Marketplace'},
                {label:'Sell Bitcoin',   icon:DollarSign,    route:'/sell-bitcoin', color:C.amber,   sub:'Marketplace'},
                {label:'Create Offer',   icon:PlusCircle,    route:'/create-offer', color:C.green,   sub:'5-step wizard'},
                {label:'Trade Chat',     icon:MessageCircle, route:'/my-trades',    color:C.paid,    sub:'Active trades'},
                {label:'Profile',        icon:User,          route:'/profile',      color:C.purple,  sub:'Your settings'},
                {label:'My Listings',    icon:Gift,          route:'/my-listings',  color:C.success, sub:'Your offers'},
                {label:'Affiliate',      icon:Rocket,        tab:'affiliate',       color:'#8B5CF6', sub:'Earn BTC'},
                {label:'Wallet',         icon:Wallet,        tab:'wallet',          color:C.mint,    sub:'BTC balance'},
              ].map(({label,icon:IconOrChar,route,tab,color,sub})=>(
                <button key={label}
                  onClick={()=>{ tab ? setActiveTab(tab) : navigate(route); }}
                  className="flex items-center gap-2.5 p-3 rounded-xl border hover:shadow-sm transition hover:-translate-y-0.5 text-left"
                  style={{borderColor:C.g100}}>
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center text-base flex-shrink-0"
                    style={{backgroundColor:`${color}15`}}>
                    {typeof IconOrChar === 'string'
                      ? IconOrChar
                      : <IconOrChar size={16} style={{ color }} strokeWidth={2} />}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-black truncate" style={{color:C.forest}}>{label}</p>
                    <p className="text-xs" style={{color:C.g400}}>{sub}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── TRADES TAB ────────────────────────────────────────────────────── */}
        {activeTab==='trades' && (
          <div className="bg-white rounded-2xl border shadow-sm overflow-hidden" style={{borderColor:C.g200}}>
            <div className="px-5 py-4 border-b" style={{borderColor:C.g100}}>
              <div className="flex items-center justify-between">
                <SectionHeader icon={Activity} title="All My Trades"/>
                <button onClick={exportTradesCSV}
                  className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl border hover:bg-gray-50 transition"
                  style={{borderColor:C.g200, color:C.g600}}>
                  <Download size={12}/> Export CSV
                </button>
              </div>
              <div className="flex gap-3 text-xs mt-2">
                {[
                  {label:`${recentTrades.filter(t=>t.status==='COMPLETED').length} Completed`, color:C.success},
                  {label:`${activeTrades.length} Active`,  color:C.warn},
                  {label:`${recentTrades.length} Total`,   color:C.paid},
                ].map(({label,color})=>(
                  <span key={label} className="font-bold" style={{color}}>{label}</span>
                ))}
              </div>
            </div>
            {recentTrades.length===0 ? (
              <div className="p-10 text-center">
                <Activity size={36} className="mx-auto mb-3 opacity-20" style={{color:C.g400}}/>
                <p className="text-sm font-semibold" style={{color:C.g500}}>No trades yet</p>
                <button onClick={()=>navigate('/buy-bitcoin')}
                  className="mt-3 px-5 py-2 rounded-xl text-white text-xs font-bold"
                  style={{backgroundColor:C.green}}>
                  Start Your First Trade
                </button>
              </div>
            ) : recentTrades.map(trade=>{
              const s  = getStatusBadge(trade.status);
              const SI = s.icon;
              const isBuyer = trade.buyer_id === user?.id;
              return (
                <div key={trade.id} onClick={()=>navigate(`/trade/${trade.id}`)}
                  className="flex items-center gap-3 px-5 py-3.5 border-b hover:bg-gray-50 cursor-pointer transition"
                  style={{borderColor:C.g50}}>
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{backgroundColor:`${isBuyer?C.green:C.amber}15`}}>
                    <Bitcoin size={15} style={{color:isBuyer?C.green:C.amber}}/>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-black" style={{color:C.forest}}>#{trade.id?.slice(0,8).toUpperCase()}</p>
                      <span className="text-xs font-bold px-1.5 py-0.5 rounded-full text-white" style={{backgroundColor:isBuyer?C.green:C.amber}}>
                        {isBuyer?'BUYING':'SELLING'}
                      </span>
                    </div>
                    <p className="text-xs mt-0.5" style={{color:C.g400}}>
                      {new Date(trade.created_at).toLocaleDateString('en-US',{day:'numeric',month:'short',year:'numeric'})}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs font-black" style={{color:C.forest}}>{fmtBtc(trade.amount_btc)} BTC</p>
                    <span className="text-xs font-bold px-1.5 py-0.5 rounded-full text-white"
                      style={{backgroundColor:s.color}}>
                      <SI size={9} className="inline mr-0.5"/>{s.text}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── WALLET TAB ────────────────────────────────────────────────────── */}
        {activeTab==='wallet' && (
          <div className="space-y-4">
            {/* Balance card */}
            <div className="rounded-2xl text-white p-6 shadow-lg"
              style={{background:`linear-gradient(135deg,${C.forest},${C.mint})`}}>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-white/60 text-xs mb-1">Available Balance</p>
                  <div className="flex items-center gap-2">
                    {showBalance
                      ? <p className="text-3xl font-black">₿ {fmtBtc(walletBalance)}</p>
                      : <p className="text-3xl font-black">•••••••• BTC</p>}
                    <button onClick={()=>setShowBalance(!showBalance)} className="text-white/60 hover:text-white">
                      {showBalance ? <EyeOff size={16}/> : <Eye size={16}/>}
                    </button>
                  </div>
                  {showBalance && btcPrice > 0 && (
                    <p className="text-white/70 text-sm mt-1">
                      ≈ ${fmt(walletBalance * btcPrice, 2)} USD
                    </p>
                  )}
                </div>
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
                  style={{backgroundColor:'rgba(255,255,255,0.15)'}}>
                  <Bitcoin size={28} style={{color:C.gold}}/>
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={()=>navigate('/wallet')}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm hover:opacity-90 transition"
                  style={{backgroundColor:C.gold, color:C.forest}}>
                  <Send size={14}/> Withdraw
                </button>
                <button onClick={()=>navigate('/wallet')}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm border hover:bg-white/10 transition"
                  style={{borderColor:'rgba(255,255,255,0.3)', color:C.white}}>
                  <Wallet size={14}/> Full Wallet
                </button>
              </div>
            </div>

            {/* Wallet stats */}
            <div className="grid grid-cols-2 gap-3">
              <StatCard icon={TrendingUp} label="Total Volume"  value={`$${fmt(stats.totalVolume,0)}`}         color={C.success}/>
              <StatCard icon={CheckCircle}label="Completed"     value={fmt(stats.completedTrades)}              color={C.paid}/>
            </div>

            {/* Info */}
            <div className="bg-white rounded-2xl border p-4 flex items-start gap-3" style={{borderColor:C.g200}}>
              <Lock size={14} style={{color:C.green, flexShrink:0, marginTop:2}}/>
              <div>
                <p className="text-xs font-black mb-0.5" style={{color:C.forest}}>How your wallet works</p>
                <p className="text-xs leading-relaxed" style={{color:C.g500}}>
                  When you sell Bitcoin, funds are held in escrow until the buyer confirms payment.
                  Once confirmed, Bitcoin is released to your wallet. Withdrawals are processed within 30 minutes.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ── AFFILIATE TAB ─────────────────────────────────────────────────── */}
        {activeTab==='affiliate' && (
          <AffiliateSection user={displayUser} profile={profile} earnings={earnings} referralData={referralData} btcPrice={btcPrice} onWithdraw={handleReferralWithdraw} dbReferralCount={stats.totalReferrals} dbTotalEarnings={parseFloat(stats.referralEarnings || 0)} dbReferralTrades={stats.referralTrades || 0} leaderboard={leaderboard}/>
        )}

      </div>

      {/* ── DASHBOARD FOOTER ──────────────────────────────────────────────────── */}
      <footer className="mt-8" style={{backgroundColor:C.forest}}>
        <div className="max-w-6xl mx-auto px-4 pt-10 pb-6">

          {/* Top row */}
          <div className="grid md:grid-cols-3 gap-8 mb-8">
            {/* Brand */}
            <div>
              <div className="flex items-center gap-2.5 mb-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center font-black text-xl"
                  style={{backgroundColor:C.gold, color:C.forest}}>P</div>
                <span className="text-white font-black text-lg" style={{fontFamily:"'Syne',sans-serif"}}>PRAQEN</span>
              </div>
              <p className="text-xs leading-relaxed mb-4" style={{color:'rgba(255,255,255,0.45)'}}>
                The world's most trusted peer-to-peer Bitcoin trading platform. Escrow-protected. Fast. Honest.
              </p>
              {/* Social icons */}
              <div className="flex gap-2 flex-wrap">
                {[
                  {label:'TikTok',    href:'https://www.tiktok.com/@praqen', bg:'rgba(0,0,0,0.55)', color:'#ffffff', d:'M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z'},
                  {label:'Instagram', href:'https://www.instagram.com/praqen?igsh=MTRkZWg2amp5YnJlYQ%3D%3D&utm_source=qr', bg:'rgba(228,64,95,0.3)', color:'#E4405F', d:'M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z'},
                  {label:'X (Twitter)', href:'https://x.com/praqenapp?s=21', bg:'rgba(255,255,255,0.12)', color:'#ffffff', d:'M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z'},
                  {label:'Discord',   href:'https://discord.gg/V6zCZxfdy', bg:'rgba(88,101,242,0.35)', color:'#5865F2', d:'M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z'},
                  {label:'LinkedIn',  href:'https://www.linkedin.com/in/pra-qen-045373402/', bg:'rgba(10,102,194,0.35)', color:'#0A66C2', d:'M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z'},
                ].map(({label,href,bg,color,d})=>(
                  <a key={label} href={href} target="_blank" rel="noopener noreferrer" title={label}
                    className="w-9 h-9 rounded-xl flex items-center justify-center hover:scale-110 transition-transform"
                    style={{backgroundColor:bg}}>
                    <svg viewBox="0 0 24 24" width="17" height="17" fill={color} aria-hidden="true">
                      <path d={d}/>
                    </svg>
                  </a>
                ))}
              </div>
            </div>

            {/* Trade links */}
            <div>
              <p className="text-white font-black text-sm mb-3">Trade</p>
              <div className="space-y-2">
                {[
                  {label:'Buy Bitcoin',   route:'/buy-bitcoin'},
                  {label:'Sell Bitcoin',  route:'/sell-bitcoin'},
                  {label:'Create Offer',  route:'/create-offer'},
                  {label:'My Trades',     tab:'trades'},
                  {label:'My Offers',     route:'/my-listings'},
                  {label:'Blog',          route:'/blog'},
                  {label:'Privacy',       route:'/privacy'},
                  {label:'Terms',         route:'/terms'},
                ].map(({label,route,tab})=>(
                  <button key={label}
                    onClick={()=>{ if(tab){setActiveTab(tab)} else navigate(route); }}
                    className="block text-xs hover:text-white transition text-left"
                    style={{color:'rgba(255,255,255,0.45)'}}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Community + support */}
            <div>
              <p className="text-white font-black text-sm mb-3">Community & Support</p>
              <div className="space-y-2">
                {[
                  {label:'TikTok',             href:'https://www.tiktok.com/@praqen'},
                  {label:'Discord Server',     href:'https://discord.gg/V6zCZxfdy'},
                  {label:'X (Twitter)',        href:'https://x.com/praqenapp?s=21'},
                  {label:'Instagram',          href:'https://www.instagram.com/praqen?igsh=MTRkZWg2amp5YnJlYQ%3D%3D&utm_source=qr'},
                  {label:'LinkedIn',           href:'https://www.linkedin.com/in/pra-qen-045373402/'},
                  {label:'hello@praqen.com', href:'mailto:hello@praqen.com'},
                ].map(({label,href})=>(
                  <a key={label} href={href} target={href.startsWith('mailto')?'_self':'_blank'} rel="noopener noreferrer"
                    className="block text-xs hover:text-white transition"
                    style={{color:'rgba(255,255,255,0.45)'}}>
                    {label}
                  </a>
                ))}
              </div>
            </div>
          </div>

          {/* Bottom bar */}
          <div className="flex flex-col md:flex-row items-center justify-between gap-2 pt-5 border-t"
            style={{borderColor:'rgba(255,255,255,0.08)'}}>
            <p className="text-xs" style={{color:'rgba(255,255,255,0.3)'}}>
              © {new Date().getFullYear()} PRAQEN. All rights reserved. Built with honesty.
            </p>
            <p className="text-xs flex items-center gap-1.5" style={{color:'rgba(255,255,255,0.3)'}}>
              <Shield size={11}/> Escrow Protected · 0.5% fee on completion only
            </p>
          </div>
        </div>
      </footer>

    </div>
  );
}
