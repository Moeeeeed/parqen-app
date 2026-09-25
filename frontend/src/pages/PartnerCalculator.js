import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import SEO from '../components/SEO';
import './partner-program.css';
import { LEVELS, pct, money } from './partnerShared';

const GOALS = [10, 50, 100, 500];

const TYPES = [
  { key: 'btc', icon: '₿', bg: '#F4A422', name: 'Bitcoin', tag: 'Most popular', text: 'Users who buy or sell Bitcoin with local payment methods.' },
  { key: 'usdt', icon: '₮', bg: '#2D6A4F', name: 'USDT', tag: 'Stable and steady', text: 'Users who trade dollar-stable coins for savings and payments.' },
];

function clamp(n, min, max) {
  const v = Number(n);
  if (!Number.isFinite(v)) return min;
  return Math.min(Math.max(v, min), max);
}

// A number box + slider pair. The box accepts larger values than the slider.
function Control({ title, hint, value, onChange, min, max, sliderMax, step = 1, prefix, suffix, minLabel, maxLabel }) {
  return (
    <div className="ctl">
      <div className="ch">
        <div><strong>{title}</strong><span>{hint}</span></div>
        <div className="vb">
          {prefix && <span>{prefix}</span>}
          <input type="number" min={min} max={max} value={value} onChange={(e) => onChange(clamp(e.target.value, min, max))} />
          {suffix && <span>{suffix}</span>}
        </div>
      </div>
      <input type="range" min={min} max={sliderMax} step={step} value={Math.min(value, sliderMax)} onChange={(e) => onChange(Number(e.target.value))} />
      <div className="rr"><span>{minLabel}</span><span>{maxLabel}</span></div>
    </div>
  );
}

export default function PartnerCalculator() {
  const [type, setType] = useState('btc');
  const [lv, setLv] = useState(1);
  const [period, setPeriod] = useState('m');
  const [friends, setFriends] = useState(10);
  const [avg, setAvg] = useState(250);
  const [trades, setTrades] = useState(5);

  const l = LEVELS[lv];
  const volume = friends * avg * trades;
  const monthly = (volume * l.r) / 100;
  const yearly = monthly * 12;
  const next = GOALS.find((g) => monthly < g) || GOALS[GOALS.length - 1];
  const nextPct = Math.min((monthly / next) * 100, 100);

  return (
    <div className="ppx cpage">
      <SEO title="Affiliate Earnings Calculator | PRAQEN" description="See how much you could earn when the users you bring trade Bitcoin and USDT on PRAQEN. Try your own numbers in 3 quick steps." />
      <div className="wrap">
        <div className="chead">
          <span className="pill">Affiliate Earnings Calculator</span>
          <h1>See what your users could earn you</h1>
          <p>Answer 3 quick steps and see how much you could earn when the users you bring trade on PRAQEN.</p>
        </div>
        <div className="mob"><small>Projected monthly earnings</small><b>{money(monthly)}</b></div>

        <div className="calc">
          <div>
            <section className="panel">
              <span className="stp">STEP 1</span>
              <h2>What type of traders are you bringing?</h2>
              <p className="d">Choose what your users will mostly trade. Both earn you the same rate.</p>
              <div className="acts">
                {TYPES.map((t) => (
                  <button type="button" key={t.key} className={`act${type === t.key ? ' on' : ''}`} onClick={() => setType(t.key)}>
                    <div className="top"><div className="ic" style={{ background: t.bg }}>{t.icon}</div><span className="rp">${l.r.toFixed(2)} / $100</span></div>
                    <h3>{t.name}</h3><b>{t.tag}</b><p>{t.text}</p>
                  </button>
                ))}
              </div>
              <p className="note">Gift card trades are not part of the Partner Program yet.</p>
            </section>

            <section className="panel">
              <span className="stp">STEP 2</span>
              <h2>Choose your affiliate level</h2>
              <p className="d">Your level goes up as you bring more active users and more trade volume. Pick one to see what it pays.</p>
              <div className="lvs">
                {LEVELS.map((x, i) => (
                  <button type="button" key={x.n} className={`lb${lv === i ? ' on' : ''}`} onClick={() => setLv(i)}>
                    <small>Level {i + 1}</small><b>{x.n}</b><span>{pct(x.r)}</span><em>{x.f} active users<br />${x.v.toLocaleString()} trade volume</em>
                  </button>
                ))}
              </div>
            </section>

            <section className="panel">
              <span className="stp">STEP 3</span>
              <h2>Tell us about the users you bring</h2>
              <p className="d">Move the sliders or type your own numbers.</p>
              <Control title="Active users" hint="Users you brought who trade at least once a month." value={friends} onChange={setFriends} min={1} max={500} sliderMax={200} suffix="users" minLabel="1" maxLabel="200+" />
              <Control title="Average trade size" hint="How much each trade is worth, in USD." value={avg} onChange={setAvg} min={10} max={5000} sliderMax={2000} step={10} prefix="$" minLabel="$10" maxLabel="$2,000+" />
              <Control title="Trades per user each month" hint="How often each user trades." value={trades} onChange={setTrades} min={1} max={100} sliderMax={30} suffix="trades" minLabel="1" maxLabel="30+" />
            </section>
          </div>

          <aside className="side">
            <section className="earn">
              <div className="top">
                <span className="bg">Projected earnings</span>
                <div className="pt">
                  <button type="button" className={period === 'm' ? 'on' : ''} onClick={() => setPeriod('m')}>Monthly</button>
                  <button type="button" className={period === 'y' ? 'on' : ''} onClick={() => setPeriod('y')}>Yearly</button>
                </div>
              </div>
              <div className="lab">If your users trade like this…</div>
              <div className="big">{money(period === 'm' ? monthly : yearly)}</div>
              <div className="sm">Based on your current estimates.</div>
              <div className="em"><div><small>Commission</small><b>{pct(l.r)}</b></div><div><small>Monthly volume</small><b>{money(volume)}</b></div></div>
            </section>

            <section className="snap">
              <h3>Your users at a glance</h3>
              <div className="fi"><span>Active users</span><b>{friends.toLocaleString()}</b></div>
              <div className="fi"><span>Monthly volume</span><b>{money(volume)}</b></div>
              <div className="fi"><span>Commission rate</span><b>{pct(l.r)}</b></div>
              <div className="fi"><span>Monthly earnings</span><b>{money(monthly)}</b></div>
              <div className="fi"><span>Yearly earnings</span><b>{money(yearly)}</b></div>
              <Link className="btn p" to="/partner-program">Become a PRAQEN Affiliate</Link>
              <p className="note">Estimates only. Actual earnings depend on completed trades and program terms.</p>
            </section>

            <section className="ms">
              <h3>Earnings milestones</h3>
              <div className="ng"><small>Next goal</small><strong>${next}/month</strong><p>{Math.round(nextPct)}% complete</p><div className="track"><i style={{ width: `${nextPct}%` }} /></div></div>
              {GOALS.map((g) => {
                const p = Math.min((monthly / g) * 100, 100);
                return (
                  <div className="mi" key={g}><b>${g}/mo</b><div className="track"><i style={{ width: `${p}%` }} /></div><span style={{ color: monthly >= g ? 'var(--green)' : 'var(--muted)' }}>{monthly >= g ? '✓' : '○'}</span></div>
                );
              })}
            </section>

            <section className="mth">
              <h3>How your earnings are worked out</h3>
              <div>
                <b>{friends.toLocaleString()}</b> active users<br />
                × <b>{trades}</b> trades per user each month<br />
                × <b>${avg.toLocaleString()}</b> average trade<br />
                = <b>{money(volume)}</b> monthly volume<br />
                × <b>{pct(l.r)}</b> ({l.n} rate)<br />
                = <b>{money(monthly)}</b> each month
              </div>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}
