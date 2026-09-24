import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { QRCodeSVG } from 'qrcode.react';
import PropTypes from 'prop-types';
import SEO from '../components/SEO';
import './partner-program.css';
import { LEVELS, CLAIM_MIN_USD, Badge, pct, usd, monthlyExample, usePartnerStats } from './partnerShared';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const PRODUCTS = [
  { icon: '₿', name: 'P2P Bitcoin Trading', text: 'Buy and sell Bitcoin with local payment methods, protected by escrow.', c: '#F4A422', cs: '#FFF3D6', to: '/buy-bitcoin' },
  { icon: '₮', name: 'USDT Trading', text: 'Trade stable dollar coins quickly with real people.', c: '#2D6A4F', cs: '#DDF0E4', to: '/buy-usdt' },
  { icon: '🎁', name: 'Gift Card Marketplace', text: 'Buy and sell gift cards safely at fair rates.', c: '#1B4332', cs: '#F0FAF5', to: '/gift-cards' },
  { icon: '👛', name: 'PRAQEN Wallet', text: 'Deposit, hold and withdraw your crypto in one secure place.', c: '#1B4332', cs: '#DDF0E4', to: '/wallet' },
  { icon: '🛡️', name: 'Escrow Protection', text: 'Funds are held safely until both sides confirm the trade.', c: '#2D6A4F', cs: '#F0FAF5', to: '/quick-start' },
  { icon: '🤝', name: 'Partner Program', text: 'Earn every time your friends trade.', c: '#F4A422', cs: '#FFF0CF', to: '/partner-program', isNew: true },
];

const FAQ = [
  ['What is the PRAQEN Partner Program?', 'A way to earn from your network. Invite friends with your personal link or scan code, and when they trade Bitcoin or USDT on PRAQEN you earn a share of the fee we collect.'],
  ['How much can I earn as a PRAQEN partner?', 'It depends on how many friends you bring and how much they trade. Use the calculator to try your own numbers.'],
  ['How do I start earning?', 'Log in, copy your link or let a friend scan your code. When your friend signs up and completes a trade, your first reward appears in your dashboard.'],
  ['Can I earn from gift card trades?', 'Not yet. Right now partner rewards come from Bitcoin and USDT trades only.'],
  ['Which cryptocurrencies can generate partner rewards?', 'Bitcoin (BTC) and USDT trades completed on PRAQEN.'],
  ['How much commission can I earn?', 'Between 0.10% and 0.20% of each completed trade, depending on your level: Starter 0.10%, Builder 0.12%, Pro 0.15%, Ambassador 0.20%.'],
  ['How do levels work?', 'You move up when you have enough active friends or enough friend trading volume in the last 30 days. See the "Your status" section for what each level needs.'],
  ['When and how do I get paid?', `Rewards wait 3 days to make sure the trade is safe. Once your balance reaches $${CLAIM_MIN_USD}, tap Claim and it is added to your PRAQEN wallet.`],
  ['How long do I earn from each friend?', 'For 12 months from the day your friend joins. After that, the rate is halved so your older friends still pay you.'],
  ['Is there a limit to how many friends I can invite?', 'No. Invite as many real friends as you like. Fake or self-referral accounts are not allowed and will be removed.'],
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

function PartnerProgram({ user }) {
  const navigate = useNavigate();
  const stats = usePartnerStats(user);
  const [copied, setCopied] = useState(false);
  const [board, setBoard] = useState(null);

  const code = user?.referral_code || user?.username || '';
  const link = code ? `https://praqen.com/signup?ref=${encodeURIComponent(code)}` : '';
  const cur = user && stats ? stats.level : null;

  useEffect(() => {
    let alive = true;
    axios.get(`${API_URL}/referral/leaderboard`)
      .then(({ data }) => { if (alive) setBoard(data.leaderboard || []); })
      .catch(() => { if (alive) setBoard([]); });
    return () => { alive = false; };
  }, []);

  const copy = () => {
    if (!link) return;
    const done = () => { setCopied(true); setTimeout(() => setCopied(false), 1600); };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(link).then(done, done);
    else done();
  };

  const s = stats || { total: 0, active: 0, lifetimeUsd: 0, lifetimeVol: 0, vol30: 0, level: 0 };
  const shown = cur == null ? 0 : cur;

  return (
    <div className="ppx">
      <SEO title="Partner Program | PRAQEN" description="Earn 0.10% to 0.20% on every Bitcoin and USDT trade your friends make on PRAQEN. Share your link and grow from Starter to Ambassador." />

      {/* HERO */}
      <section className="hero"><div className="wrap">
        <div className="coin btc">₿</div><div className="coin usdt">₮</div>
        <div className="hb hb1"><Badge i={1} size={84} /></div>
        <span className="pill o">Built for traders across the globe</span>
        <h1 className="mega">The Partner Program</h1>
        <p className="sub2">Turn your network into lasting income. Join the PRAQEN Partner Program</p>
        <div className="dash"><div className="in worth">
          <div className="wh"><div><h3>What could your network be worth?</h3><span>See how much you could earn from your referral network</span></div><em className="chip">Monthly</em></div>
          <div className="w4">
            {LEVELS.map((l, i) => {
              const m = monthlyExample(l);
              return (
                <div className="wi" key={l.n}><Badge i={i} size={44} /><div><span>{l.n}</span><b>{m < 10 ? m.toFixed(2) : `${Math.round(m)}+`} USD</b></div></div>
              );
            })}
          </div>
          <Link className="btn big" to="/partner-program/calculator">Calculate my earnings</Link>
        </div></div>
        <div className="coin big2">₮</div>
      </div></section>

      {/* LINK + JOURNEY */}
      <section className="wrap memsec" id="my-link">
        <h4 className="lab2">Your referral link &amp; progress</h4>
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
                <div className="st row"><b>Total direct friends:</b><strong>{s.total}</strong></div>
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
              <h3 style={{ fontSize: 22, marginBottom: 8 }}>Get your personal link and scan code</h3>
              <p className="or" style={{ fontWeight: 500, fontSize: 15, marginTop: 0 }}>Log in or create a free account to get your referral link, your scan code and your live earnings dashboard.</p>
              <div className="shr" style={{ marginTop: 14 }}>
                <Link to="/signup"><button type="button" style={{ background: '#F4A422', color: '#10281E' }}>Create free account</button></Link>
                <Link to="/login"><button type="button">Log in</button></Link>
              </div>
            </div>
          </div>
        )}

        <div className="track4wrap">
          <h4 className="lab2" style={{ margin: '0 0 4px' }}>Your journey: grow and earn your badges</h4>
          <p className="note" style={{ margin: '0 0 14px' }}>Invite active friends and watch your badge and rate grow: Starter, Builder, Pro, Ambassador.</p>
          <div className="track4">
            {LEVELS.map((l, i) => {
              const fill = cur == null ? 100 : i <= cur ? 100 : i === cur + 1 ? Math.min(100, Math.round((s.active / l.f) * 100)) : 0;
              return (
                <React.Fragment key={l.n}>
                  {i > 0 && <div className="seg"><i style={{ width: `${fill}%` }} /></div>}
                  <div className={`tb${cur != null && i > cur ? ' off' : ''}${i === cur ? ' now' : ''}`}>
                    <Badge i={i} size={56} />
                    <span>{l.n}</span>
                    <small>{l.f ? `${l.f}+ active friends` : 'Start here'}</small>
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
        <div className="lvl">
          {LEVELS.map((l, i) => {
            const here = i === cur;
            return (
              <details className={`lr${here ? ' cur' : ''}`} key={l.n} open={here || (cur == null && i === 1)}>
                <summary>
                  <span className="ln"><Badge i={i} size={40} /><b>{l.n} · {pct(l.r)}</b>{here && <em className="yah">YOU ARE HERE</em>}</span>
                  <span className="lm">Active friends: {s.active} / {l.f}<br />Friends volume: {usd(s.vol30)} / {l.v.toLocaleString()} USD</span>
                  <span className="pl" />
                </summary>
                {i === 0 ? (
                  <div className="bd2"><p>Everyone starts here. No minimum.</p><ul>{l.get.map((x) => <li key={x}>{x}</li>)}</ul></div>
                ) : (
                  <>
                    <div className="two">
                      <div className="pn"><div className="pt2"><small>Active friends</small></div><strong className={s.active >= l.f ? 'ok' : 'no'}>{s.active}</strong><small>{here ? 'Keep level' : 'Needed'}: {l.f} active friends</small></div>
                      <div className="orr">OR</div>
                      <div className="pn"><div className="pt2"><small>Friends trade volume</small></div><strong className={s.vol30 >= l.v ? 'ok' : 'no'}>{usd(s.vol30)}</strong><small>{here ? 'Keep level' : 'Needed'}: ${l.v.toLocaleString()} / month</small></div>
                    </div>
                    <div className="bd2">
                      <b>What you get</b><ul>{l.get.map((x) => <li key={x}>{x}</li>)}</ul>
                      <b>Extras</b><ul>{l.bonus.map((x) => <li key={x}>{x}</li>)}</ul>
                    </div>
                  </>
                )}
              </details>
            );
          })}
        </div>
        {user && (
          <div className="tot">
            <div className="st row"><b>Total friends</b><strong>{s.total}</strong></div>
            <div className="st row"><b>Active friends</b><strong>{s.active}</strong></div>
          </div>
        )}
      </section>

      {/* LEADERBOARD */}
      <section className="wrap sect">
        <h2 className="h2b" style={{ textAlign: 'left' }}>Leaderboard</h2>
        <div className="lbwrap">
          <div className="tbl">
            <div className="tr th"><span>Program participants</span><span>Ranking</span><span>Total friends</span><span>Trades by friends</span><span>Lifetime earnings (BTC)</span></div>
            {board === null && <p className="note" style={{ padding: 14 }}>Loading…</p>}
            {board && board.length === 0 && <p className="note" style={{ padding: 14 }}>No partners on the board yet. Be the first!</p>}
            {(board || []).map((p) => (
              <div className="tr" key={p.id} style={{ borderBottom: '1px solid var(--line)' }}>
                <span className="pp"><i className="av">{(p.username || '?')[0].toUpperCase()}</i><span><b><u>{p.username}</u></b><small>{p.badge}</small></span></span>
                <span>{p.rank}</span>
                <span>{p.referrals}</span>
                <span>{p.affiliate_trades}</span>
                <span>{Number(p.earned_btc).toFixed(6)}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* HALL OF FAME */}
      <section className="wrap sect ctr">
        <h2 className="h2b">Hall of Fame</h2>
        <p className="l">Real stories from traders who built communities, mentored others, and achieved success on PRAQEN. Get inspired and start your own journey today.</p>
        <div className="hof" style={{ gridTemplateColumns: '1fr', maxWidth: 520, margin: '26px auto 0' }}>
          <div className="hc" style={{ textAlign: 'center', alignItems: 'center' }}>
            <Badge i={3} size={64} />
            <p style={{ fontSize: 18 }}>Our first Hall of Fame stories are coming soon. Yours could be here.</p>
            <Link className="btn p" to="/partner-program/calculator">See what you could earn</Link>
          </div>
        </div>
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
        <p>It takes one minute. Share your link and let your network work for you.</p>
        {user
          ? <a className="btn" href="#my-link">Copy my link</a>
          : <Link className="btn" to="/signup">Become a PRAQEN Partner</Link>}
      </div></div>
      <footer>Estimates are examples only. Actual earnings depend on completed trades. Partner Program terms apply.</footer>
    </div>
  );
}

PartnerProgram.propTypes = { user: PropTypes.object };
PartnerProgram.defaultProps = { user: null };

export default PartnerProgram;
