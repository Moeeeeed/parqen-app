import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { QRCodeSVG } from 'qrcode.react';
import PropTypes from 'prop-types';
import CountryFlag from '../components/CountryFlag';
import SEO from '../components/SEO';
import './partner-program.css';
import { countryName, LEVELS, CLAIM_MIN_USD, ACTIVE_MIN_USD, Badge, pct, usd, monthlyExample, usePartnerStats } from './partnerShared';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const PRODUCTS = [
  { icon: '₿', name: 'P2P Bitcoin Trading', text: 'Buy and sell Bitcoin with local payment methods, protected by escrow.', c: '#F4A422', cs: '#FFF3D6', to: '/buy-bitcoin' },
  { icon: '₮', name: 'USDT Trading', text: 'Trade stable dollar coins quickly with real people.', c: '#2D6A4F', cs: '#DDF0E4', to: '/buy-usdt' },
  { icon: '🎁', name: 'Gift Card Marketplace', text: 'Buy and sell gift cards safely at fair rates.', c: '#1B4332', cs: '#F0FAF5', to: '/gift-cards' },
  { icon: '👛', name: 'PRAQEN Wallet', text: 'Deposit, hold and withdraw your crypto in one secure place.', c: '#1B4332', cs: '#DDF0E4', to: '/wallet' },
  { icon: '🛡️', name: 'Escrow Protection', text: 'Funds are held safely until both sides confirm the trade.', c: '#2D6A4F', cs: '#F0FAF5', to: '/quick-start' },
  { icon: '🤝', name: 'Affiliate Program', text: 'Earn every time the users you bring trade.', c: '#F4A422', cs: '#FFF0CF', to: '/partner-program', isNew: true },
];

const FAQ = [
  ['What is the PRAQEN Affiliate Program?', 'A way to earn from the users you bring. Share your personal link or scan code. When the people who sign up with it trade Bitcoin or USDT on PRAQEN, you earn a share of the fee we collect on each of their trades.'],
  ['How much can I earn as an affiliate?', 'It depends on how many users you bring and how much they trade. Use the calculator to try your own numbers.'],
  ['How do I start earning?', 'Log in, copy your link or let someone scan your code. When the person signs up and completes a trade, your first reward appears in your dashboard.'],
  ['What is an active user?', `A user you brought who has traded at least $${ACTIVE_MIN_USD} in total. Only active users and their trading volume count towards your level.`],
  ['How do levels work?', 'There are four levels: Explorer, Builder, Titan and Ambassador. To unlock a level you need BOTH the number of active users AND the trade volume shown for that level. To keep a level you must stay above its (lower) keep numbers. Falling short drops you one level.'],
  ['Can I earn from gift card trades?', 'Not yet. Right now affiliate rewards come from Bitcoin and USDT trades only.'],
  ['Which cryptocurrencies can generate affiliate rewards?', 'Bitcoin (BTC) and USDT trades completed on PRAQEN.'],
  ['How much commission can I earn?', 'Between 0.10% and 0.20% of each completed trade, depending on your level: Explorer 0.10%, Builder 0.12%, Titan 0.15%, Ambassador 0.20%.'],
  ['When and how do I get paid?', `Rewards wait 3 days to make sure the trade is safe. Once your balance reaches $${CLAIM_MIN_USD}, tap Claim and it is added to your PRAQEN wallet.`],
  ['How long do I earn from each user?', 'For 12 months from the day the user joins. After that, the rate is halved so your older users still pay you.'],
  ['Is there a limit to how many users I can bring?', 'No. Bring as many real users as you like. Fake accounts and self-referrals are not allowed and will be removed.'],
];

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

// Leaderboard entries only say whether a photo exists; the image itself comes from the avatar endpoint.
const photoOf = (p) => (p.has_avatar ? `${API_URL}/referral/avatar/${p.id}` : null);

// Profile photo when the partner has one, otherwise their first letter.
function Avatar({ url, name, large }) {
  const [bad, setBad] = useState(false);
  const letter = (name || '?')[0].toUpperCase();
  if (url && !bad) {
    return <img className={`av${large ? ' lg' : ''} avimg`} src={url} alt={name || ''} onError={() => setBad(true)} />;
  }
  return <i className={`av${large ? ' lg' : ''}`}>{letter}</i>;
}
Avatar.propTypes = { url: PropTypes.string, name: PropTypes.string, large: PropTypes.bool };

function PartnerProgram({ user }) {
  const navigate = useNavigate();
  const stats = usePartnerStats(user);
  const [copied, setCopied] = useState(false);
  const [board, setBoard] = useState(null);
  const [btcUsd, setBtcUsd] = useState(0);
  const [tab, setTab] = useState('board');
  const [q, setQ] = useState('');

  const code = user?.referral_code || user?.username || '';
  const link = code ? `https://praqen.com/signup?ref=${encodeURIComponent(code)}` : '';
  const cur = user && stats ? stats.level : null;

  useEffect(() => {
    let alive = true;
    axios.get(`${API_URL}/referral/leaderboard`)
      .then(({ data }) => { if (alive) setBoard(data.leaderboard || []); })
      .catch(() => { if (alive) setBoard([]); });
    axios.get(`${API_URL}/rates`)
      .then(({ data }) => { if (alive && data.btcUsd) setBtcUsd(Number(data.btcUsd)); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const copy = () => {
    if (!link) return;
    const done = () => { setCopied(true); setTimeout(() => setCopied(false), 1600); };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(link).then(done, done);
    else done();
  };

  const leaders = (board || []).filter((x) => x.earned_btc > 0 || x.referrals > 0).slice(0, 3);
  const matches = (r) => !q.trim() || String(r.username || '').toLowerCase().includes(q.trim().toLowerCase());
  const s = stats || { friends: [], history: [], invitedBy: null, total: 0, active: 0, lifetimeUsd: 0, lifetimeVol: 0, qvol: 0, level: -1 };
  const shown = cur == null ? 0 : Math.max(0, cur);
  const nextIdx = cur == null ? null : cur + 1;
  const nextLv = nextIdx != null && nextIdx < LEVELS.length ? LEVELS[nextIdx] : null;
  const moreFriends = nextLv ? Math.max(0, nextLv.f - s.active) : 0;
  const moreVolume = nextLv ? Math.max(0, nextLv.v - s.qvol) : 0;

  return (
    <div className="ppx">
      <SEO title="Affiliate Program | PRAQEN" description="Earn 0.10% to 0.20% on every Bitcoin and USDT trade the users you bring make on PRAQEN. Share your link and grow from Explorer to Ambassador." />

      {/* HERO */}
      <section className="hero"><div className="wrap">
        <div className="coin btc">₿</div><div className="coin usdt">₮</div>
        <div className="hb hb1"><Badge i={1} size={84} /></div>
        <span className="pill o">Built for traders across the globe</span>
        <h1 className="mega">The Affiliate Program</h1>
        <p className="sub2">Bring users who trade and earn from every trade they make. Join the PRAQEN Affiliate Program</p>
        <div className="dash"><div className="in worth">
          <div className="wh"><div><h3>What could your network be worth?</h3><span>See how much you could earn from the users you bring</span></div><em className="chip">Monthly</em></div>
          <div className="w4">
            {LEVELS.map((l, i) => {
              const m = monthlyExample(l);
              return (
                <div className={`wi${i === cur ? ' mine' : ''}`} key={l.n}>
                  <Badge i={i} size={34} />
                  <div className="wtxt">
                    <span>{l.n}{i === cur && <i className="youtag">YOU</i>}</span>
                    <b>{m < 10 ? m.toFixed(2) : `${Math.round(m)}+`} USD</b>
                    <small>{l.f} active users · ${l.v.toLocaleString()} volume</small>
                  </div>
                </div>
              );
            })}
          </div>
          <Link className="btn big" to="/partner-program/calculator">Calculate my earnings</Link>
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
              <div className="g2">
                <div className="st row"><b>Your rate:</b><strong>{pct(LEVELS[shown].r)} <i>({LEVELS[shown].n})</i></strong></div>
                <div className="st row"><b>Total users you brought:</b><strong>{s.total}</strong></div>
                <div className="st"><small>Lifetime earnings</small><strong>{s.lifetimeUsd.toFixed(2)} USD</strong></div>
                <div className="st"><small>Lifetime volume</small><strong>{s.lifetimeVol.toLocaleString(undefined, { maximumFractionDigits: 2 })} USD</strong></div>
              </div>
              <div className="claim">
                <div><h4>Your rewards</h4><small>You can claim rewards once your balance reaches {CLAIM_MIN_USD}.00 USD</small></div>
                <Link className="btn p" style={{ flex: 'none', minWidth: 140 }} to="/dashboard?tab=affiliate">Open rewards</Link>
              </div>
            </div>
          </>
        ) : (
          <div className="mecard" style={{ gridTemplateColumns: '1fr' }}>
            <div>
              <h3 style={{ fontSize: 22, marginBottom: 8 }}>Get your personal affiliate link and scan code</h3>
              <p className="or" style={{ fontWeight: 500, fontSize: 15, marginTop: 0 }}>Log in or create a free account to get your affiliate link, your scan code and your live earnings dashboard.</p>
              <div className="shr" style={{ marginTop: 14 }}>
                <Link to="/signup"><button type="button" style={{ background: '#F4A422', color: '#10281E' }}>Create free account</button></Link>
                <Link to="/login"><button type="button">Log in</button></Link>
              </div>
            </div>
          </div>
        )}

        <div className="track4wrap">
          <h4 className="lab2" style={{ margin: '0 0 4px' }}>Your journey: bring users, grow and earn your badges</h4>
          <p className="note" style={{ margin: '0 0 14px' }}>To unlock each level you need enough active users AND enough trade volume from them. Both numbers are shown under each badge: Explorer, Builder, Titan, Ambassador.</p>
          <div className="track4">
            {LEVELS.map((l, i) => {
              const fill = cur == null ? 100 : i <= cur ? 100 : i === cur + 1 ? Math.min(100, Math.round(Math.min(s.active / l.f, s.qvol / l.v) * 100)) : 0;
              return (
                <React.Fragment key={l.n}>
                  {i > 0 && <div className="seg"><i style={{ width: `${fill}%` }} /></div>}
                  <div className={`tb${cur != null && i > cur ? ' off' : ''}${i === cur ? ' now' : ''}`}>
                    <Badge i={i} size={56} />
                    <span>{l.n}</span>
                    <small>{l.f} active users<br />${l.v.toLocaleString()} volume</small>
                    <em className="rt2" style={{ fontStyle: 'normal' }}>{pct(l.r)}</em>
                    {i === cur && <em className="here" style={{ fontStyle: 'normal' }}>YOU ARE HERE</em>}
                  </div>
                </React.Fragment>
              );
            })}
          </div>
        </div>
      </section>

      {/* STATUS */}
      <section className="wrap sect">
        <h4 className="lab2">Your status</h4>
        <div className="explain">
          <b>How the Affiliate Program works</b>
          <ol>
            <li><b>Share</b> your personal link or scan code.</li>
            <li>People who sign up with it are <b>your users</b>.</li>
            <li>A user becomes <b>active</b> after trading at least ${ACTIVE_MIN_USD} in total.</li>
            <li>To unlock a higher level you need <b>both</b>: enough <b>active users</b> and enough <b>trade volume</b> from them.</li>
            <li>Every trade they make pays you a share of PRAQEN's fee. The higher your level, the bigger your share.</li>
          </ol>
        </div>

        <div className="glance">
          <table>
            <thead><tr><th>Level</th><th>Active users needed</th><th>Trade volume needed</th><th>Your share</th></tr></thead>
            <tbody>
              {LEVELS.map((l, i) => (
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

        {user && (
          <div className="nextcard">
            {nextLv ? (
              <>
                <div className="nh"><Badge i={nextIdx} size={36} /><div><small>Your next level</small><b>{nextLv.n} · {pct(nextLv.r)}</b></div></div>
                <div className="bars">
                  <div className="bar2"><div className="bl"><span>Active users</span><b>{s.active} / {nextLv.f}</b></div><div className="track"><i style={{ width: `${Math.min(100, (s.active / nextLv.f) * 100)}%` }} /></div></div>
                  <div className="bar2"><div className="bl"><span>Trade volume</span><b>{usd(s.qvol)} / {nextLv.v.toLocaleString()} USD</b></div><div className="track"><i style={{ width: `${Math.min(100, (s.qvol / nextLv.v) * 100)}%` }} /></div></div>
                </div>
                <p className="need">
                  {moreFriends > 0 || moreVolume > 0
                    ? <>To unlock <b>{nextLv.n}</b> you still need {moreFriends > 0 && <b>{moreFriends} more active user{moreFriends === 1 ? '' : 's'}</b>}{moreFriends > 0 && moreVolume > 0 && ' and '}{moreVolume > 0 && <b>{usd(moreVolume)} more volume</b>}.</>
                    : <>You have both numbers for <b>{nextLv.n}</b>. It unlocks automatically.</>}
                </p>
              </>
            ) : (
              <div className="nh"><Badge i={3} size={36} /><div><small>Top level</small><b>You are an Ambassador. Keep your numbers up to stay here.</b></div></div>
            )}
          </div>
        )}

        <div className="lvl">
          {LEVELS.map((l, i) => {
            const here = i === cur;
            const unlocked = cur != null && i <= cur;
            return (
              <details className={`lr${here ? ' cur' : ''}`} key={l.n} open={here || (cur != null && i === cur + 1) || (cur == null && i === 0)}>
                <summary>
                  <span className="ln"><Badge i={i} size={40} /><b>{l.n} · {pct(l.r)}</b>{here && <em className="yah">YOU ARE HERE</em>}{unlocked && !here && <em className="yah ok">UNLOCKED</em>}</span>
                  <span className="lm">Unlock — active users: {s.active} / {l.f}<br />Unlock — trade volume: {usd(s.qvol).replace(' USD', '')} / {l.v.toLocaleString()} USD</span>
                  <span className="pl" />
                </summary>
                <div className="bd3">
                  <div className="box">
                    <h5>TO UNLOCK</h5>
                    <div className="mrow"><span>Active users</span><b className={s.active >= l.f ? 'ok' : ''}>{s.active} / {l.f}</b></div>
                    <div className="mrow"><span>Trade volume (lifetime)</span><b className={s.qvol >= l.v ? 'ok' : ''}>{usd(s.qvol)} / {l.v.toLocaleString()} USD</b></div>
                    <p className="small">Active user = someone you brought who has traded at least {ACTIVE_MIN_USD} USD in total. Trade volume is what your active users have traded. You need both numbers to unlock.</p>
                  </div>
                  <div className="box">
                    <h5>TO KEEP</h5>
                    <div className="mrow"><span>Active users</span><b>{l.kf}</b></div>
                    <div className="mrow"><span>Trade volume (lifetime)</span><b>{l.kv.toLocaleString()} USD</b></div>
                    <p className="small">After you unlock, stay at or above these numbers to keep the level. Falling short drops you one level. Keep numbers are lower than unlock numbers.</p>
                  </div>
                  <div className="box">
                    <h5>PAYOUT</h5>
                    <div className="mrow"><span>Your share of each trade your users make</span><b>{pct(l.r)}</b></div>
                    <p className="small">Example: one of your users trades $100, PRAQEN's fee is about $1.00, and you get ${(l.r).toFixed(2)}. PRAQEN keeps ${(1 - l.r).toFixed(2)}.</p>
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
        {user && (
          <div className="tot">
            <div className="st row"><b>Total users you brought</b><strong>{s.total}</strong></div>
            <div className="st row"><b>Active users</b><strong>{s.active}</strong></div>
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
              {user && <button type="button" className={tab === 'earn' ? 'on' : ''} onClick={() => setTab('earn')}>My earnings</button>}
              {user && <button type="button" className={tab === 'friends' ? 'on' : ''} onClick={() => setTab('friends')}>My users{s.friends && s.friends.length ? ` (${s.friends.length})` : ''}</button>}
            </div>
            <input className="srch" type="search" placeholder="Search affiliates" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search affiliates" />
          </div>

          {user && s.invitedBy && (
            <div className="invby">
              <span>You were invited by</span>
              <Link to={`/profile/${encodeURIComponent(s.invitedBy.username)}`} className="plink"><Avatar url={s.invitedBy.avatar_url} name={s.invitedBy.username} />@{s.invitedBy.username}</Link>
              {s.invitedBy.country && <span className="ctry"><CountryFlag countryCode={s.invitedBy.country} style={{ width: 18, height: 13 }} /> {countryName(s.invitedBy.country)}</span>}
            </div>
          )}

          {tab === 'board' && (
            <div className="tbl">
              <div className="tr th"><span>Affiliates</span><span>Ranking</span><span>Users brought</span><span>Lifetime earnings (USD)</span><span>Trades by their users</span></div>
              {board === null && <p className="note" style={{ padding: 14 }}>Loading…</p>}
              {board && board.length === 0 && <p className="note" style={{ padding: 14 }}>No partners on the board yet. Be the first!</p>}
              {(board || []).filter(matches).map((b) => (
                <div className="tr" key={b.id}>
                  <span className="pp">
                    <Avatar url={photoOf(b)} name={b.username} />
                    <span>
                      <Link className="plink" to={`/profile/${encodeURIComponent(b.username)}`}>{b.username}</Link>
                      <small>{b.country && <><CountryFlag countryCode={b.country} style={{ width: 16, height: 12 }} /> {countryName(b.country)} · </>}{b.badge}</small>
                    </span>
                  </span>
                  <span data-l="Ranking">{b.rank}</span>
                  <span data-l="Users brought">{b.referrals}</span>
                  <span data-l="Lifetime earnings">{btcUsd ? `${(Number(b.earned_btc) * btcUsd).toFixed(2)} USD` : `${Number(b.earned_btc).toFixed(6)} BTC`}</span>
                  <span data-l="Trades by their users">{b.affiliate_trades}</span>
                </div>
              ))}
            </div>
          )}

          {tab === 'friends' && user && (
            <div className="tbl">
              <div className="tr th f6"><span>My users</span><span>Trades</span><span>Joined</span><span>Current month earnings (USD)</span><span>Lifetime earnings (USD)</span><span>Invited by</span></div>
              {stats === null && <p className="note" style={{ padding: 14 }}>Loading…</p>}
              {stats && stats.friends.length === 0 && (
                <p className="note" style={{ padding: 14 }}>You have not brought any users yet. Share your link or scan code above and they will show here.</p>
              )}
              {stats && stats.friends.filter(matches).map((f) => (
                <div className="tr f6" key={f.id || f.username}>
                  <span className="pp">
                    <Avatar url={f.avatar_url} name={f.username} />
                    <span>
                      <Link className="plink" to={`/profile/${encodeURIComponent(f.username)}`}>{f.username}</Link>
                      <small>{f.country ? <><CountryFlag countryCode={f.country} style={{ width: 16, height: 12 }} /> {countryName(f.country)}</> : 'Country not set'}</small>
                    </span>
                  </span>
                  <span data-l="Trades">{f.trades}</span>
                  <span data-l="Joined">{f.joined ? new Date(f.joined).toLocaleDateString() : '-'}</span>
                  <span data-l="This month">{f.monthUsd.toFixed(2)} USD</span>
                  <span data-l="Lifetime">{f.lifetimeUsd.toFixed(2)} USD</span>
                  <span data-l="Invited by">You</span>
                </div>
              ))}
            </div>
          )}
          {tab === 'earn' && user && (
            <>
              <div className="earnbar">
                <div><small>Active users</small><b>{s.active}</b></div>
                <div><small>Total earned</small><b>{s.lifetimeUsd.toFixed(2)} USD</b></div>
                <div><small>Earnings this month</small><b>{(s.history || []).filter((h) => new Date(h.date) >= new Date(new Date().getFullYear(), new Date().getMonth(), 1)).reduce((a, h) => a + h.usd, 0).toFixed(2)} USD</b></div>
              </div>
              <div className="tbl">
                <div className="tr th e4"><span>Partner</span><span>Type</span><span>Amount</span><span>Date</span></div>
                {stats === null && <p className="note" style={{ padding: 14 }}>Loading…</p>}
                {stats && s.history.length === 0 && (
                  <p className="note" style={{ padding: 14 }}>No earnings yet. You earn every time a user you brought completes a trade.</p>
                )}
                {stats && s.history.filter(matches).map((h) => (
                  <div className="tr e4" key={h.id || h.date + h.username}>
                    <span className="pp">
                      <Avatar url={h.avatar_url} name={h.username} />
                      <span>
                        <Link className="plink" to={`/profile/${encodeURIComponent(h.username)}`}>{h.username}</Link>
                        <small>{h.country ? <><CountryFlag countryCode={h.country} style={{ width: 16, height: 12 }} /> {countryName(h.country)}</> : 'User'}</small>
                      </span>
                    </span>
                    <span data-l="Type">Revenue Share</span>
                    <span data-l="Amount">{h.btc.toFixed(7)} BTC <em className="usdnote">({h.usd.toFixed(2)} USD)</em></span>
                    <span data-l="Date">{h.date ? new Date(h.date).toLocaleString() : '-'}</span>
                  </div>
                ))}
              </div>
            </>
          )}
          <p className="note" style={{ padding: '0 6px' }}>Tap a name to see their profile. Earnings are shown in USD at the price of each trade.</p>
        </div>
      </section>

      {/* HALL OF FAME */}
      <section className="wrap sect ctr">
        <h2 className="h2b">Hall of Fame</h2>
        <p className="l">Our top affiliates: traders who brought active users to PRAQEN and grew with them. Get inspired and start your own journey today.</p>
        {leaders.length > 0 ? (
          <div className="hof">
            {leaders.map((h, i) => {
              const lvl = Math.max(0, LEVELS.reduce((a, l, k) => (h.referrals >= l.f ? k : a), 0));
              const usdOf = (btc) => (btcUsd ? `${(Number(btc || 0) * btcUsd).toFixed(2)} USD` : `${Number(btc || 0).toFixed(6)} BTC`);
              return (
                <div className="hc" key={h.id}>
                  <div className="rankchip">#{i + 1}</div>
                  <div className="hh">
                    <Avatar url={photoOf(h)} name={h.username} large />
                    <div>
                      <b>@{h.username}</b>
                      <small>{h.country ? <><CountryFlag countryCode={h.country} style={{ width: 16, height: 12 }} /> {countryName(h.country)}</> : 'PRAQEN affiliate'}</small>
                    </div>
                    <Link className="pf" to={`/profile/${encodeURIComponent(h.username)}`}>Profile</Link>
                  </div>
                  <p>Brought {h.referrals} user{h.referrals === 1 ? '' : 's'} who completed {h.affiliate_trades} trade{h.affiliate_trades === 1 ? '' : 's'} on PRAQEN.</p>
                  <div className="lvtag"><Badge i={lvl} size={22} /> {LEVELS[lvl].n} level</div>
                  <div className="st row"><small>Lifetime earnings</small><strong>{usdOf(h.earned_btc)}</strong></div>
                  <div className="st row"><small>Earnings this month</small><strong>{usdOf(h.month_btc)}</strong></div>
                  <div className="st row"><small>Network growth</small><strong>{h.referrals} users</strong></div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="hof" style={{ gridTemplateColumns: '1fr', maxWidth: 520, margin: '26px auto 0' }}>
            <div className="hc" style={{ textAlign: 'center', alignItems: 'center' }}>
              <Badge i={3} size={64} />
              <p style={{ fontSize: 18 }}>Our top affiliates will appear here. Yours could be the first name.</p>
              <Link className="btn p" to="/partner-program/calculator">See what you could earn</Link>
            </div>
          </div>
        )}
      </section>

      {/* FAQ */}
      <section className="wrap sect ctr">
        <h2 className="h2b big">Frequently asked questions</h2>
        <div className="faq">
          {FAQ.map(([q, a]) => (<details key={q}><summary>{q}</summary><p>{a}</p></details>))}
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
        <h2>Ready to start earning?</h2>
        <p>It takes one minute. Share your link, bring users who trade, and earn from every trade they make.</p>
        {user
          ? <a className="btn" href="#my-link">Copy my link</a>
          : <Link className="btn" to="/signup">Become a PRAQEN Affiliate</Link>}
      </div></div>
      <footer>Estimates are examples only. Actual earnings depend on completed trades. Affiliate Program terms apply.</footer>
    </div>
  );
}

PartnerProgram.propTypes = { user: PropTypes.object };
PartnerProgram.defaultProps = { user: null };

export default PartnerProgram;
