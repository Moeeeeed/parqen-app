import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import PropTypes from 'prop-types';
import CountryFlag from '../components/CountryFlag';
import SEO from '../components/SEO';
import './partner-program.css';
import {
  countryName, LEVELS, CLAIM_MIN_USD, ACTIVE_MIN_USD, Badge, pct, usd, monthlyExample,
  useAffiliateConfig, useAffiliateSummary, useAffiliateLeaderboard,
} from './partnerShared';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const PRODUCTS = [
  { icon: '₿', name: 'P2P Bitcoin Trading', text: 'Buy and sell Bitcoin with local payment methods, protected by escrow.', c: '#F4A422', cs: '#FFF3D6', to: '/buy-bitcoin' },
  { icon: '₮', name: 'USDT Trading', text: 'Trade stable dollar coins quickly with real people.', c: '#2D6A4F', cs: '#DDF0E4', to: '/buy-usdt' },
  { icon: '🎁', name: 'Gift Card Marketplace', text: 'Buy and sell gift cards safely at fair rates.', c: '#1B4332', cs: '#F0FAF5', to: '/gift-cards' },
  { icon: '👛', name: 'PRAQEN Wallet', text: 'Deposit, hold and withdraw your crypto in one secure place.', c: '#1B4332', cs: '#DDF0E4', to: '/wallet' },
  { icon: '🛡️', name: 'Escrow Protection', text: 'Funds are held safely until both sides confirm the trade.', c: '#2D6A4F', cs: '#F0FAF5', to: '/quick-start' },
  { icon: '🤝', name: 'Affiliate Program', text: 'Bring users who trade and grow with them.', c: '#F4A422', cs: '#FFF0CF', to: '/partner-program', isNew: true },
];

// FAQ. While payouts are off, nothing here mentions money amounts, rewards or claiming.
function buildFaq(cash) {
  const list = [
    ['What is the PRAQEN Affiliate Program?', cash
      ? 'A way to earn from the users you bring. Share your personal link or scan code. When the people who sign up with it trade Bitcoin or USDT on PRAQEN, you earn a share of the fee we collect on each of their trades.'
      : 'A way to grow with the users you bring. Share your personal link or scan code. When the people who sign up with it trade Bitcoin or USDT on PRAQEN, they count as your users and you move up the levels.'],
    ['How much can I earn as an affiliate?', cash
      ? 'It depends on how many users you bring and how much they trade. Use the calculator to try your own numbers.'
      : 'Payouts have not started yet. When they do, your share depends on your level, and this page will show it. Until then you can bring users and unlock levels.'],
    ['How do I start?', 'Log in, copy your link or let someone scan your code. When the person signs up and completes a trade, they count as your user and your numbers update here.'],
    ['What is an active user?', `A user you brought who has traded at least $${ACTIVE_MIN_USD} in total. Only active users and their trading volume count towards your level.`],
    ['How do levels work?', 'There are four levels: Explorer, Builder, Titan and Ambassador. To unlock a level you need BOTH the number of active users AND the trade volume shown for that level. To keep a level you must stay above its (lower) keep numbers. Falling short drops you one level.'],
    ['Do gift card trades count?', 'Not yet. Right now only Bitcoin and USDT trades count towards your level.'],
    ['Which trades count?', 'Bitcoin (BTC) and USDT trades that were completed on PRAQEN.'],
    ['What share of each trade will I get?', 'Between 0.10% and 0.20% of each completed trade, depending on your level: Explorer 0.10%, Builder 0.12%, Titan 0.15%, Ambassador 0.20%.'],
  ];
  if (cash) {
    list.push(['When and how do I get paid?', `Rewards wait 3 days to make sure the trade is safe. Once your balance reaches $${CLAIM_MIN_USD}, tap Claim and it is added to your PRAQEN wallet.`]);
    list.push(['How long do I earn from each user?', 'For 12 months from the day the user joins. After that, the rate is halved so your older users still pay you.']);
  } else {
    list.push(['When do payouts start?', 'Payouts have not started yet. We will announce it here and by notification when they do.']);
  }
  list.push(['Is there a limit to how many users I can bring?', 'No. Bring as many real users as you like. Fake accounts and self-referrals are not allowed and will be removed.']);
  return list;
}

const shareIcons = {
  X: <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M18.2 2H21l-6.5 7.4L22 22h-6l-4.7-6.1L5.9 22H3l7-8L2.5 2h6.1l4.2 5.6zm-1 18h1.6L7.2 3.9H5.5z" /></svg>,
  Facebook: <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M14 8V6c0-1 .3-1.5 1.6-1.5H17V1h-2.6C11.4 1 10 2.7 10 5.5V8H7.5v3.5H10V23h4V11.5h2.8L17.3 8z" /></svg>,
  Telegram: <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M21.5 3.3L2.7 10.6c-1.3.5-1.3 1.3-.2 1.6l4.8 1.5 1.8 5.6c.2.6.4.8.9.8s.7-.2 1-.5l2.3-2.2 4.8 3.5c.9.5 1.5.2 1.7-.8L22.9 4.9c.3-1.3-.5-1.9-1.4-1.6zM9 13.4l9.1-5.7c.4-.3.8-.1.5.2L11 15l-.3 3.4z" /></svg>,
  WhatsApp: <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.6 15L2 22l5.2-1.4A10 10 0 1 0 12 2zm5.2 14.1c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .2-3.2-.7-2.700-1.100-4.400-3.800-4.500-4-.1-.2-1.100-1.400-1.100-2.700s.7-1.900.9-2.200c.2-.2.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 1.900c.1.2.1.4 0 .5l-.4.6c-.1.2-.3.3-.1.6.6 1 1.400 1.800 2.400 2.300.3.2.5.1.6-.1l.7-.9c.2-.2.4-.2.6-.1l1.800.9c.3.100.5.2.5.3.1.2.1.7-.1 1.200z" /></svg>,
  Email: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></svg>,
};

function shareUrl(kind, link) {
  const text = encodeURIComponent('Trade Bitcoin and USDT safely on PRAQEN. Join with my link:');
  const u = encodeURIComponent(link);
  switch (kind) {
    case 'X': return `https://twitter.com/intent/tweet?text=${text}&url=${u}`;
    case 'Facebook': return `https://www.facebook.com/sharer/sharer.php?u=${u}`;
    case 'Telegram': return `https://t.me/share/url?url=${u}&text=${text}`;
    case 'WhatsApp': return `https://wa.me/?text=${text}%20${u}`;
    default: return `mailto:?subject=${encodeURIComponent('Join me on PRAQEN')}&body=${text}%20${u}`;
  }
}

// The photo comes from the avatar endpoint. If there is none the letter shows instead.
const photoOf = (id) => (id ? `${API_URL}/referral/avatar/${id}` : null);

function Avatar({ url, name, large }) {
  const [bad, setBad] = useState(false);
  const letter = (name || '?')[0].toUpperCase();
  if (url && !bad) {
    return <img className={`av${large ? ' lg' : ''} avimg`} src={url} alt={name || ''} onError={() => setBad(true)} />;
  }
  return <i className={`av${large ? ' lg' : ''}`}>{letter}</i>;
}
Avatar.propTypes = { url: PropTypes.string, name: PropTypes.string, large: PropTypes.bool };

const ZERO = { users_brought: 0, active_users: 0, qualified_volume_usd: 0, lifetime_volume_usd: 0 };

function PartnerProgram({ user }) {
  const navigate = useNavigate();
  const cfg = useAffiliateConfig();
  const summary = useAffiliateSummary(user);
  const board = useAffiliateLeaderboard();
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState('board');
  const [q, setQ] = useState('');

  const cash = cfg.cashEnabled === true;
  const levels = cfg.levels || LEVELS;
  const sum = summary.data;
  const totals = (sum && sum.totals) || ZERO;

  const code = user?.referral_code || user?.username || '';
  const link = code ? `https://praqen.com/signup?ref=${encodeURIComponent(code)}` : '';

  // Everything below comes straight from the server's answer.
  // cur: null = not logged in / not loaded, -1 = no level yet, 0..3 = current level.
  const cur = user && sum ? (sum.level ? sum.level.index : -1) : null;
  const rateNow = sum ? sum.rate_now : levels[0].r;
  const next = sum ? sum.next : null;

  const copy = () => {
    if (!link) return;
    const done = () => { setCopied(true); setTimeout(() => setCopied(false), 1600); };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(link).then(done, done);
    else done();
  };

  const matches = (r) => !q.trim() || String(r.username || '').toLowerCase().includes(q.trim().toLowerCase());
  const leaders = (board || []).slice(0, 3);
  const faq = buildFaq(cash);

  return (
    <div className="ppx">
      <SEO title="Affiliate Program | PRAQEN" description="Bring users who trade Bitcoin and USDT on PRAQEN and grow from Explorer to Ambassador. Share your link or scan code." />

      {/* HERO */}
      <section className="hero"><div className="wrap">
        <div className="coin btc">₿</div><div className="coin usdt">₮</div>
        <div className="hb hb1"><Badge i={1} size={84} /></div>
        <span className="pill o">Built for traders across the globe</span>
        <h1 className="mega">The Affiliate Program</h1>
        <p className="sub2">Bring users who trade and grow with them. Join the PRAQEN Affiliate Program</p>
        <div className="dash"><div className="in worth">
          <div className="wh"><div><h3>What could your network be worth?</h3><span>{cash ? 'See how much you could earn from the users you bring' : 'Try the calculator to see an estimate. What each level needs is shown below.'}</span></div>{cash && <em className="chip">Monthly</em>}</div>
          <div className="w4">
            {levels.map((l, i) => {
              const m = monthlyExample(l);
              return (
                <div className={`wi${i === cur ? ' mine' : ''}`} key={l.n}>
                  <Badge i={i} size={34} />
                  <div className="wtxt">
                    <span>{l.n}{i === cur && <i className="youtag">YOU</i>}</span>
                    <b>{cash ? `${m < 10 ? m.toFixed(2) : `${Math.round(m)}+`} USD` : `${pct(l.r)} share`}</b>
                    <small>{l.f} active users · ${l.v.toLocaleString()} volume</small>
                  </div>
                </div>
              );
            })}
          </div>
          <Link className="btn big" to="/partner-program/calculator">Calculate my earnings</Link>
          {!cash && <p style={{ textAlign: 'center', margin: '10px 0 0', fontSize: 13 }}><a href="#levels" style={{ color: 'inherit', textDecoration: 'underline' }}>See how to level up</a></p>}
        </div></div>
        <div className="coin big2">₮</div>
      </div></section>

      {/* LINK + JOURNEY */}
      <section className="wrap memsec" id="my-link">
        <h4 className="lab2">Your affiliate link &amp; progress</h4>
        {user ? (
          <>
            <div className="mecard">
              <div className="linkrow">
                <div className="lnk">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" /><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" /></svg>
                  <b>{link.replace('https://', '')}</b>
                  <button type="button" className={`cp${copied ? ' done' : ''}`} onClick={copy}>{copied ? 'Copied!' : 'Copy'}</button>
                </div>
                <div className="or">Or share via</div>
                <div className="shr">
                  {Object.keys(shareIcons).map((k) => (
                    <a key={k} href={shareUrl(k, link)} target="_blank" rel="noopener noreferrer"><button type="button">{shareIcons[k]}{k === 'X' ? '' : ` ${k}`}</button></a>
                  ))}
                </div>
              </div>
              <div className="qrbox big">
                <QRCodeSVG value={link} size={128} level="M" fgColor="#1B4332" bgColor="#FFFFFF" style={{ width: '100%', height: 'auto' }} />
                <small>Scan to join</small>
              </div>
            </div>
            <div className="mecard2">
              {summary.loading && <p className="note" style={{ margin: 0 }}>Loading your numbers…</p>}
              {summary.error && <p className="note" style={{ margin: 0 }}>We could not load your numbers right now. Please try again in a moment.</p>}
              {sum && (
                <div className="g2">
                  <div className="st row"><b>Your share:</b><strong>{pct(rateNow)} <i>({cur >= 0 ? levels[cur].n : 'getting started'})</i></strong></div>
                  <div className="st row"><b>Users you brought:</b><strong>{totals.users_brought}</strong></div>
                  <div className="st row"><b>Active users:</b><strong>{totals.active_users}</strong></div>
                  <div className="st"><small>Trade volume of your active users</small><strong>{totals.qualified_volume_usd.toLocaleString(undefined, { maximumFractionDigits: 2 })} USD</strong></div>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="mecard" style={{ gridTemplateColumns: '1fr' }}>
            <div>
              <h3 style={{ fontSize: 22, marginBottom: 8 }}>Get your personal affiliate link and scan code</h3>
              <p className="or" style={{ fontWeight: 500, fontSize: 15, marginTop: 0 }}>Log in or create a free account to get your affiliate link, your scan code and your live progress dashboard.</p>
              <div className="shr" style={{ marginTop: 14 }}>
                <Link to="/signup"><button type="button" style={{ background: '#F4A422', color: '#10281E' }}>Create free account</button></Link>
                <Link to="/login"><button type="button">Log in</button></Link>
              </div>
            </div>
          </div>
        )}

        <div className="jr">
          <div className="jr-head">
            <div>
              <h4>Your journey: bring users, grow and earn your badges</h4>
              <p>To unlock a level you need <b>both</b> enough active users <b>and</b> enough trade volume from them. Your level sets your share of every trade.</p>
            </div>
            <div className="jr-now">
              <small>Your level</small>
              <b>{cur == null ? (user ? '…' : 'Log in to start') : cur < 0 ? 'Getting started' : levels[cur].n}</b>
              <span>{pct(rateNow)} of each trade</span>
            </div>
          </div>
          <ol className="jr-steps">
            {levels.map((l, i) => {
              const state = cur == null ? 'goal' : i <= cur ? 'done' : i === cur + 1 ? 'next' : 'locked';
              return (
                <li className={`jr-step ${state}`} key={l.n}>
                  <div className="jr-badge">
                    <Badge i={i} size={64} />
                    {state === 'done' && <i className="jr-check">✓</i>}
                  </div>
                  <b className="jr-name">{l.n}</b>
                  <span className="jr-rate">{pct(l.r)} share</span>
                  <div className="jr-req">
                    <span><b>{l.f}</b> active users</span>
                    <span><b>${l.v.toLocaleString()}</b> trade volume</span>
                  </div>
                  {state === 'next' && next && (
                    <div className="jr-prog">
                      <div className="jr-bar"><i style={{ width: `${Math.round(next.users_progress * 100)}%` }} /></div><small>{totals.active_users}/{l.f} users</small>
                      <div className="jr-bar"><i style={{ width: `${Math.round(next.volume_progress * 100)}%` }} /></div><small>{usd(totals.qualified_volume_usd)} of {l.v.toLocaleString()}</small>
                    </div>
                  )}
                  <em className="jr-tag">{state === 'done' ? (i === cur ? 'YOU ARE HERE' : 'UNLOCKED') : state === 'next' ? 'NEXT GOAL' : state === 'goal' ? 'UNLOCK WITH' : 'LOCKED'}</em>
                </li>
              );
            })}
          </ol>
        </div>
      </section>

      {/* STATUS */}
      <section className="wrap sect" id="levels">
        <h4 className="lab2">Your status</h4>
        <div className="explain">
          <b>How the Affiliate Program works</b>
          <ol>
            <li><b>Share</b> your personal link or scan code.</li>
            <li>People who sign up with it are <b>your users</b>.</li>
            <li>A user becomes <b>active</b> after trading at least ${ACTIVE_MIN_USD} in total.</li>
            <li>To unlock a higher level you need <b>both</b>: enough <b>active users</b> and enough <b>trade volume</b> from them.</li>
            <li>Every trade they make gives you a share of PRAQEN's fee. The higher your level, the bigger your share.</li>
          </ol>
        </div>

        <div className="glance">
          <table>
            <thead><tr><th>Level</th><th>Active users needed</th><th>Trade volume needed</th><th>Your share</th></tr></thead>
            <tbody>
              {levels.map((l, i) => (
                <tr key={l.n} className={i === cur ? 'me' : ''}>
                  <td><span className="gl"><Badge i={i} size={26} /> {l.n}</span></td>
                  <td>{l.f}</td>
                  <td>${l.v.toLocaleString()}</td>
                  <td>{pct(l.r)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="note">Numbers are lifetime totals from your active users. You need both the active users and the volume to unlock a level.</p>
        </div>

        {user && sum && (
          <div className="nextcard">
            {next ? (
              <>
                <div className="nh"><Badge i={next.index} size={36} /><div><small>Your next level</small><b>{next.name} · {pct(next.rate)}</b></div></div>
                <div className="bars">
                  <div className="bar2"><div className="bl"><span>Active users</span><b>{totals.active_users} / {next.need_users}</b></div><div className="track"><i style={{ width: `${Math.round(next.users_progress * 100)}%` }} /></div></div>
                  <div className="bar2"><div className="bl"><span>Trade volume</span><b>{usd(totals.qualified_volume_usd)} / {next.need_volume.toLocaleString()} USD</b></div><div className="track"><i style={{ width: `${Math.round(next.volume_progress * 100)}%` }} /></div></div>
                </div>
                <p className="need">
                  {next.users_missing > 0 || next.volume_missing > 0
                    ? <>To unlock <b>{next.name}</b> you still need {next.users_missing > 0 && <b>{next.users_missing} more active user{next.users_missing === 1 ? '' : 's'}</b>}{next.users_missing > 0 && next.volume_missing > 0 && ' and '}{next.volume_missing > 0 && <b>{usd(next.volume_missing)} more volume</b>}.</>
                    : <>You have both numbers for <b>{next.name}</b>. It unlocks automatically.</>}
                </p>
              </>
            ) : (
              <div className="nh"><Badge i={3} size={36} /><div><small>Top level</small><b>You are an Ambassador. Keep your numbers up to stay here.</b></div></div>
            )}
          </div>
        )}

        <div className="lvl">
          {levels.map((l, i) => {
            const here = i === cur;
            const unlocked = cur != null && i <= cur;
            return (
              <details className={`lr${here ? ' cur' : ''}`} key={l.n} open={here || (cur != null && i === cur + 1) || (cur == null && i === 0)}>
                <summary>
                  <span className="ln"><Badge i={i} size={40} /><b>{l.n} · {pct(l.r)}</b>{here && <em className="yah">YOU ARE HERE</em>}{unlocked && !here && <em className="yah ok">UNLOCKED</em>}</span>
                  <span className="lm">Unlock — active users: {totals.active_users} / {l.f}<br />Unlock — trade volume: {usd(totals.qualified_volume_usd).replace(' USD', '')} / {l.v.toLocaleString()} USD</span>
                  <span className="pl" />
                </summary>
                <div className="bd3">
                  <div className="box">
                    <h5>TO UNLOCK</h5>
                    <div className="mrow"><span>Active users</span><b className={totals.active_users >= l.f ? 'ok' : ''}>{totals.active_users} / {l.f}</b></div>
                    <div className="mrow"><span>Trade volume (lifetime)</span><b className={totals.qualified_volume_usd >= l.v ? 'ok' : ''}>{usd(totals.qualified_volume_usd)} / {l.v.toLocaleString()} USD</b></div>
                    <p className="small">Active user = someone you brought who has traded at least {ACTIVE_MIN_USD} USD in total. Trade volume is what your active users have traded. You need both numbers to unlock.</p>
                  </div>
                  <div className="box">
                    <h5>TO KEEP</h5>
                    <div className="mrow"><span>Active users</span><b>{l.kf}</b></div>
                    <div className="mrow"><span>Trade volume (lifetime)</span><b>{l.kv.toLocaleString()} USD</b></div>
                    <p className="small">After you unlock, stay at or above these numbers to keep the level. Falling short drops you one level. Keep numbers are lower than unlock numbers.</p>
                  </div>
                  <div className="box">
                    <h5>{cash ? 'PAYOUT' : 'YOUR SHARE'}</h5>
                    <div className="mrow"><span>Share of each trade your users make</span><b>{pct(l.r)}</b></div>
                    {cash && <p className="small">Example: one of your users trades $100, PRAQEN's fee is about $1.00, and you get ${(l.r).toFixed(2)}. PRAQEN keeps ${(1 - l.r).toFixed(2)}.</p>}
                  </div>
                  <div className="box">
                    <h5>WHAT YOU GET</h5>
                    <ul>{l.get.concat(l.bonus).map((x) => <li key={x}>{x}</li>)}</ul>
                  </div>
                </div>
              </details>
            );
          })}
        </div>
        {user && sum && (
          <div className="tot">
            <div className="st row"><b>Users you brought</b><strong>{totals.users_brought}</strong></div>
            <div className="st row"><b>Active users</b><strong>{totals.active_users}</strong></div>
          </div>
        )}
      </section>

      {/* LEADERBOARD + MY USERS */}
      <section className="wrap sect" id="board">
        <h2 className="h2b" style={{ textAlign: 'left' }}>Leaderboard</h2>
        <div className="lbwrap">
          <div className="lbtop">
            <div className="tabs">
              <button type="button" className={tab === 'board' ? 'on' : ''} onClick={() => setTab('board')}>Leaderboard</button>
              {user && <button type="button" className={tab === 'users' ? 'on' : ''} onClick={() => setTab('users')}>My users{sum && sum.users.length ? ` (${sum.users.length})` : ''}</button>}
            </div>
            <input className="srch" type="search" placeholder="Search affiliates" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search affiliates" />
          </div>

          {user && sum && sum.invited_by && (
            <div className="invby">
              <span>You were invited by</span>
              <Link to={`/profile/${encodeURIComponent(sum.invited_by.username)}`} className="plink"><Avatar url={photoOf(sum.invited_by.id)} name={sum.invited_by.username} />@{sum.invited_by.username}</Link>
              {sum.invited_by.country && <span className="ctry"><CountryFlag countryCode={sum.invited_by.country} style={{ width: 18, height: 13 }} /> {countryName(sum.invited_by.country)}</span>}
            </div>
          )}

          {tab === 'board' && (
            <div className="tbl">
              <div className="tr th"><span>Affiliates</span><span>Ranking</span><span>Users brought</span><span>Active users</span><span>Trade volume (USD)</span></div>
              {board === null && <p className="note" style={{ padding: 14 }}>Loading…</p>}
              {board && board.length === 0 && <p className="note" style={{ padding: 14 }}>No affiliates on the board yet. Be the first to bring an active user!</p>}
              {(board || []).filter(matches).map((b) => (
                <div className="tr" key={b.id}>
                  <span className="pp">
                    <Avatar url={photoOf(b.id)} name={b.username} />
                    <span>
                      <Link className="plink" to={`/profile/${encodeURIComponent(b.username)}`}>{b.username}</Link>
                      <small>{b.country && <><CountryFlag countryCode={b.country} style={{ width: 16, height: 12 }} /> {countryName(b.country)}</>}{b.country && b.level ? ' · ' : ''}{b.level || ''}</small>
                    </span>
                  </span>
                  <span data-l="Ranking">{b.rank}</span>
                  <span data-l="Users brought">{b.users_brought}</span>
                  <span data-l="Active users">{b.active_users}</span>
                  <span data-l="Trade volume">{Math.round(b.qualified_volume_usd).toLocaleString()} USD</span>
                </div>
              ))}
            </div>
          )}

          {tab === 'users' && user && (
            <div className="tbl">
              <div className="tr th f6"><span>My users</span><span>Trades</span><span>Trade volume (USD)</span><span>Joined</span><span>Status</span><span>Invited by</span></div>
              {summary.loading && <p className="note" style={{ padding: 14 }}>Loading…</p>}
              {sum && sum.users.length === 0 && (
                <p className="note" style={{ padding: 14 }}>You have not brought any users yet. Share your link or scan code above and they will show here.</p>
              )}
              {sum && sum.users.filter(matches).map((f) => (
                <div className="tr f6" key={f.id}>
                  <span className="pp">
                    <Avatar url={photoOf(f.id)} name={f.username} />
                    <span>
                      <Link className="plink" to={`/profile/${encodeURIComponent(f.username)}`}>{f.username}</Link>
                      <small>{f.country ? <><CountryFlag countryCode={f.country} style={{ width: 16, height: 12 }} /> {countryName(f.country)}</> : 'Country not set'}</small>
                    </span>
                  </span>
                  <span data-l="Trades">{f.trades}</span>
                  <span data-l="Trade volume">{f.volume_usd.toLocaleString(undefined, { maximumFractionDigits: 2 })} USD</span>
                  <span data-l="Joined">{f.joined ? new Date(f.joined).toLocaleDateString() : '-'}</span>
                  <span data-l="Status">{f.active ? 'Active' : `Not active yet (needs ${ACTIVE_MIN_USD} USD traded)`}</span>
                  <span data-l="Invited by">You</span>
                </div>
              ))}
            </div>
          )}
          <p className="note" style={{ padding: '0 6px' }}>Tap a name to see their profile. The board is ranked by active users, then by their trade volume.</p>
        </div>
      </section>

      {/* HALL OF FAME */}
      <section className="wrap sect ctr">
        <h2 className="h2b">Hall of Fame</h2>
        <p className="l">Our top affiliates: traders who brought active users to PRAQEN and grew with them. Get inspired and start your own journey today.</p>
        {leaders.length > 0 ? (
          <div className="hof">
            {leaders.map((h, i) => {
              const lvl = h.level ? Math.max(0, levels.findIndex((l) => l.n === h.level)) : 0;
              return (
                <div className="hc" key={h.id}>
                  <div className="rankchip">#{i + 1}</div>
                  <div className="hh">
                    <Avatar url={photoOf(h.id)} name={h.username} large />
                    <div>
                      <b>@{h.username}</b>
                      <small>{h.country ? <><CountryFlag countryCode={h.country} style={{ width: 16, height: 12 }} /> {countryName(h.country)}</> : 'PRAQEN affiliate'}</small>
                    </div>
                    <Link className="pf" to={`/profile/${encodeURIComponent(h.username)}`}>Profile</Link>
                  </div>
                  <p>Brought {h.users_brought} user{h.users_brought === 1 ? '' : 's'}, {h.active_users} of them active traders.</p>
                  {h.level && <div className="lvtag"><Badge i={lvl} size={22} /> {h.level} level</div>}
                  <div className="st row"><small>Active users</small><strong>{h.active_users}</strong></div>
                  <div className="st row"><small>Users brought</small><strong>{h.users_brought}</strong></div>
                  <div className="st row"><small>Trade volume</small><strong>{Math.round(h.qualified_volume_usd).toLocaleString()} USD</strong></div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="hof" style={{ gridTemplateColumns: '1fr', maxWidth: 520, margin: '26px auto 0' }}>
            <div className="hc" style={{ textAlign: 'center', alignItems: 'center' }}>
              <Badge i={3} size={64} />
              <p style={{ fontSize: 18 }}>Our top affiliates will appear here. Yours could be the first name.</p>
              <a className="btn p" href="#levels">See how to level up</a>
            </div>
          </div>
        )}
      </section>

      {/* FAQ */}
      <section className="wrap sect ctr">
        <h2 className="h2b big">Frequently asked questions</h2>
        <div className="faq">
          {faq.map(([qq, a]) => (<details key={qq}><summary>{qq}</summary><p>{a}</p></details>))}
        </div>
      </section>

      {/* PRODUCTS */}
      <section className="wrap sect ctr prodsec">
        <h2 className="h2b">Explore PRAQEN products</h2>
        <p className="l">Discover the tools and services on PRAQEN that make your trading and payments easier</p>
        <div className="prods">
          {PRODUCTS.map((p) => (
            <div className="pd" key={p.name} style={{ '--c': p.c, '--cs': p.cs }} role="link" tabIndex={0} onClick={() => navigate(p.to)} onKeyDown={(e) => { if (e.key === 'Enter') navigate(p.to); }}>
              <i>{p.icon}</i><b>{p.name}</b><small>{p.text}{p.isNew && <em className="nw">New</em>}</small>
            </div>
          ))}
        </div>
      </section>

      <div className="wrap"><div className="cta">
        <h2>Ready to start?</h2>
        <p>It takes one minute. Share your link and bring users who trade.</p>
        {user
          ? <a className="btn" href="#my-link">Copy my link</a>
          : <Link className="btn" to="/signup">Become a PRAQEN Affiliate</Link>}
      </div></div>
      <footer>{cash ? 'Estimates are examples only. Actual earnings depend on completed trades. ' : ''}Affiliate Program terms apply.</footer>
    </div>
  );
}

PartnerProgram.propTypes = { user: PropTypes.object };
PartnerProgram.defaultProps = { user: null };

export default PartnerProgram;
