// services/btcApiGateway.js
// ─────────────────────────────────────────────────────────────────────────────
// PRAQEN — shared Bitcoin explorer (Esplora) API gateway.
//
// WHY THIS EXISTS
// Every Bitcoin REST call in the app (deposit monitor, reconciliation, sweep,
// and customer withdrawals in hdWalletService) hit the free public explorers
// (mempool.space / blockstream.info / mempool.emzy.de) independently — each with
// its own ad-hoc retry loop and no coordination. When several background cycles
// line up, or a single cycle loops over every address back-to-back, the server
// fires 100+ requests at one IP in a few seconds and gets 429-stormed. That is
// what makes withdrawals fail ("Broadcast to Blockchain PENDING — APIs down").
//
// This module funnels ALL of those calls through one process-wide queue:
//   • one request in flight at a time
//   • a global minimum spacing between requests (default 1.2s  ->  ~50/min)
//   • a priority lane so customer withdrawals jump ahead of background monitors
//   • per-endpoint 429/503 cooldown + rotation, in ONE place instead of four
//   • a short shared response cache so overlapping cycles don't re-fetch the
//     same address within the same minute
//
// Drop-in shape for the old hdWalletService.apiGet / apiPost:
//   const btc = require('./btcApiGateway');
//   const utxos = await btc.get(`/address/${addr}/utxo`, { priority: 'high' });
//   const txid  = await btc.post('/tx', rawHex, { priority: 'high' });
//
// Tuning (all optional, read once at startup from .env):
//   BTC_API_PRIMARY                 first endpoint to try   (default mempool.space)
//   BTC_API_FALLBACKS              comma-separated extras   (default blockstream + emzy)
//   BTC_API_MIN_SPACING_MS         gap between requests     (default 1200)
//   BTC_API_CACHE_TTL_MS           GET response cache TTL   (default 45000, 0 = off)
//   BTC_API_ENDPOINT_COOLDOWN_MS   pause an endpoint after 429/503 (default 60000)
//   BTC_API_GET_TIMEOUT_MS         per GET timeout          (default 15000)
//   BTC_API_POST_TIMEOUT_MS        per POST timeout         (default 30000)
//   BTC_API_SAME_ENDPOINT_RETRIES  retries on same endpoint on 429/503 (default 1)
//   BTC_API_DEBUG=true             verbose [btcApiGateway] logging
//   BLOCKCYPHER_TOKEN              BlockCypher API token (free tier available)
// ─────────────────────────────────────────────────────────────────────────────

const axios = require('axios');

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

// parseInt that falls back to `d` for undefined / NaN / negative
const toInt = (v, d) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? n : d;
};

const parseEndpoints = () => {
  const raw = [];
  if (process.env.BTC_API_PRIMARY) raw.push(process.env.BTC_API_PRIMARY);
  if (process.env.BTC_API_FALLBACKS) raw.push(...process.env.BTC_API_FALLBACKS.split(','));

  const cleaned = raw
    .map((s) => (s || '').trim().replace(/\/+$/, '')) // strip trailing slash(es)
    .filter(Boolean);

  const isTestnet = (process.env.HD_NETWORK || '').toLowerCase() === 'testnet';
  const defaultEndpoints = isTestnet
    ? [
        'https://blockstream.info/testnet/api',
        'https://mempool.space/testnet/api',
      ]
    : [
        'https://blockstream.info/api',
        'https://mempool.emzy.de/api',
        'https://mempool.space/api',
      ];

  const list = cleaned.length ? cleaned : defaultEndpoints;

  return [...new Set(list)]; // de-dupe, keep order
};

// ── BlockCypher Adapter ──────────────────────────────────────────────────
// Translates BlockCypher's REST shape into the Esplora shape the rest of the
// app expects. Only used as a last-resort fallback, after every Esplora
// endpoint has failed (see _tryBlockCypher / _execute below).
const NO_BC_HANDLER = Symbol('no-blockcypher-handler');

class BlockCypherAdapter {
  constructor(token) {
    this.token = token || process.env.BLOCKCYPHER_TOKEN || '';
    const isTestnet = (process.env.HD_NETWORK || '').toLowerCase() === 'testnet';
    this.baseUrl = isTestnet
      ? 'https://api.blockcypher.com/v1/btc/test3'
      : 'https://api.blockcypher.com/v1/btc/main';
  }

  _auth(sep) {
    return this.token ? `${sep}token=${this.token}` : '';
  }

  // Node's global fetch() ignores a `timeout` option, so a hung BlockCypher
  // request could previously stall the whole gateway queue. Use AbortController
  // for a real deadline, and keep the HTTP status (esp. 429) + any body text in
  // the thrown error so the caller can tell "rate-limited" from "unreachable".
  async _fetch(url, timeoutMs = 15000) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const response = await fetch(url, { signal: ctrl.signal });
      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`BlockCypher HTTP ${response.status}${body ? ` — ${body.slice(0, 200)}` : ''}`);
      }
      return await response.json();
    } finally {
      clearTimeout(t);
    }
  }

  async _post(url, body, timeoutMs = 30000) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`BlockCypher POST ${response.status}${text ? ` — ${text.slice(0, 300)}` : ''}`);
      }
      return await response.json();
    } finally {
      clearTimeout(t);
    }
  }

  // Esplora /address/:addr — only the fields checkBalance() reads.
  // BlockCypher's `balance` is already confirmed (funded − spent); its
  // `unconfirmed_balance` is a SIGNED delta that can be negative (a pending
  // outgoing spend). Map that delta into mempool_stats only — the previous
  // version added it into the confirmed figure too, which double-counted and
  // could report a wrong/negative total.
  async getAddress(address) {
    const data = await this._fetch(`${this.baseUrl}/addrs/${address}/balance${this._auth('?')}`);
    const confirmed = Number(data.balance || 0);
    const unconf = Number(data.unconfirmed_balance || 0);
    return {
      chain_stats: {
        funded_txo_sum: confirmed,
        spent_txo_sum: 0,
        tx_count: data.n_tx || 0,
      },
      mempool_stats: {
        funded_txo_sum: unconf > 0 ? unconf : 0,
        spent_txo_sum: unconf < 0 ? -unconf : 0,
        tx_count: 0,
      },
    };
  }

  // Esplora /address/:addr/utxo — array of { txid, vout, value, status }.
  async getAddressUtxo(address) {
    // limit=2000 (BlockCypher's max): the default is 50, which silently dropped
    // UTXOs on a hot wallet fed by many small sweeps and read back as
    // HOT_WALLET_INSUFFICIENT. unconfirmed_txrefs is merged in so a hot wallet
    // topped up seconds ago isn't seen as empty — Esplora's /utxo also returns
    // mempool UTXOs, so this matches the behaviour callers already expect.
    const data = await this._fetch(
      `${this.baseUrl}/addrs/${address}?unspentOnly=true&limit=2000${this._auth('&')}`
    );
    const refs = [...(data.txrefs || []), ...(data.unconfirmed_txrefs || [])];
    return refs
      // tx_output_n === -1 marks an INPUT (a spend), never a spendable output.
      .filter(r => typeof r.tx_output_n === 'number' && r.tx_output_n >= 0 && r.spent !== true)
      .map(r => ({
        txid: r.tx_hash,
        vout: r.tx_output_n,
        value: r.value,
        status: { confirmed: (r.confirmations || 0) > 0 },
      }));
  }

  async postTx(txHex) {
    const data = await this._post(`${this.baseUrl}/txs/push${this._auth('?')}`, { tx: txHex });
    const hash = data && data.tx && data.tx.hash;
    if (!hash) throw new Error(`BlockCypher push returned no txid: ${JSON.stringify(data).slice(0, 200)}`);
    return hash;
  }
}

// ── blockchain.info Adapter ──────────────────────────────────────────────
// Final fallback, tried only after every Esplora endpoint AND BlockCypher
// have already failed. blockchain.info sits on a completely separate
// rate-limit pool from blockstream/mempool/BlockCypher — proven reliable
// across the exact 429-storm conditions that motivated this file (see
// scripts/audit-user-deposit-addresses.js, which hit zero failures on this
// provider across 1800+ checks the same day all three of the others were
// simultaneously exhausted). Read-only paths only (balance, UTXO list) —
// deliberately NOT wired up for broadcasting a transaction: getting a
// balance check slightly wrong is a retry, getting a broadcast integration
// subtly wrong on a fallback path nobody has exercised yet is a much worse
// failure mode, so that stays on the existing Esplora/BlockCypher path only.
const NO_BI_HANDLER = Symbol('no-blockchaininfo-handler');

class BlockchainInfoAdapter {
  constructor() {
    this.baseUrl = 'https://blockchain.info';
  }

  async _fetch(url, timeoutMs = 15000) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const response = await fetch(url, { signal: ctrl.signal });
      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`blockchain.info HTTP ${response.status}${body ? ` — ${body.slice(0, 200)}` : ''}`);
      }
      return await response.json();
    } finally {
      clearTimeout(t);
    }
  }

  // Esplora /address/:addr shape. blockchain.info's final_balance is
  // confirmed+unconfirmed combined; treated as confirmed here — the same
  // simplifying assumption this exact provider already uses elsewhere in
  // this codebase (see the audit script referenced above).
  async getAddress(address) {
    const data = await this._fetch(`${this.baseUrl}/rawaddr/${address}?limit=0`);
    return {
      chain_stats: {
        funded_txo_sum: Number(data.final_balance || 0),
        spent_txo_sum: 0,
        tx_count: data.n_tx || 0,
      },
      mempool_stats: { funded_txo_sum: 0, spent_txo_sum: 0, tx_count: 0 },
    };
  }

  // Esplora /address/:addr/utxo shape. blockchain.info returns HTTP 500
  // with {"notice":"No free outputs to spend"} for a genuinely empty
  // address rather than an empty array — that is a real zero, not a
  // failure, so it is handled here rather than left to bubble up as an error.
  async getAddressUtxo(address) {
    let data;
    try {
      data = await this._fetch(`${this.baseUrl}/unspent?active=${address}&limit=1000`);
    } catch (e) {
      if (/No free outputs to spend/i.test(e.message || '')) return [];
      throw e;
    }
    return (data.unspent_outputs || []).map((u) => ({
      txid: u.tx_hash_big_endian,
      vout: u.tx_output_n,
      value: u.value,
      status: { confirmed: (u.confirmations || 0) > 0 },
    }));
  }
}

class BtcApiGateway {
  constructor() {
    this.endpoints = parseEndpoints();

    this.minSpacingMs        = toInt(process.env.BTC_API_MIN_SPACING_MS, 1200);
    this.cacheTtlMs          = toInt(process.env.BTC_API_CACHE_TTL_MS, 45000);
    this.cooldownMs          = toInt(process.env.BTC_API_ENDPOINT_COOLDOWN_MS, 60000);
    this.getTimeoutMs        = toInt(process.env.BTC_API_GET_TIMEOUT_MS, 15000);
    this.postTimeoutMs       = toInt(process.env.BTC_API_POST_TIMEOUT_MS, 30000);
    this.sameEndpointRetries = toInt(process.env.BTC_API_SAME_ENDPOINT_RETRIES, 1);
    this.debug               = process.env.BTC_API_DEBUG === 'true';

    this._highQ       = [];
    this._lowQ        = [];
    this._pumping     = false;
    this._lastStartAt = 0;

    // endpoint base -> epoch ms until which it is "cooling" after a 429/503
    this._cooldownUntil = new Map();

    // request path -> { data, expiresAt }
    this._cache = new Map();

    this._stats = { total: 0, fromCache: 0, http429: 0, failures: 0, retries: 0, blockcypherOk: 0, blockcypherFail: 0 };

    this._log(
      `initialised — endpoints: ${this.endpoints.join(', ')} | ` +
      `spacing ${this.minSpacingMs}ms | cache ${this.cacheTtlMs}ms | cooldown ${this.cooldownMs}ms`
    );
  }

  // ── Try BlockCypher as fallback ──────────────────────────────────────
  // Returns the adapted result on success, the NO_BC_HANDLER sentinel when
  // BlockCypher has no adapter for this path (or no token is configured), and
  // THROWS when it was tried and failed — so _execute can surface the real
  // reason (e.g. "HTTP 429") instead of collapsing every failure into one
  // generic "APIs unreachable".
  async _tryBlockCypher(path, options = {}) {
    const token = process.env.BLOCKCYPHER_TOKEN;
    if (!token) {
      this._log('BlockCypher fallback disabled — no BLOCKCYPHER_TOKEN');
      return NO_BC_HANDLER;
    }

    const adapter = new BlockCypherAdapter(token);

    if (path.startsWith('/address/') && path.endsWith('/utxo')) {
      const addr = path.split('/')[2];
      const result = await adapter.getAddressUtxo(addr);
      this._log(`BlockCypher UTXO ${addr}: ${result.length} output(s)`);
      return result;
    }
    if (path.startsWith('/address/')) {
      const addr = path.split('/')[2];
      const result = await adapter.getAddress(addr);
      this._log(`BlockCypher balance ${addr}: ${result.chain_stats.funded_txo_sum} sat confirmed`);
      return result;
    }
    if (path === '/tx' && options.method === 'POST') {
      const txid = await adapter.postTx(options.data);
      this._log(`BlockCypher broadcast ok: ${txid}`);
      return txid;
    }
    return NO_BC_HANDLER;
  }

  // ── Try blockchain.info as the final fallback (GET only) ─────────────
  // Same NO_HANDLER / throws-on-real-failure contract as _tryBlockCypher.
  async _tryBlockchainInfo(path, options = {}) {
    if (options.method === 'POST') return NO_BI_HANDLER; // read-only, see class comment above

    const adapter = new BlockchainInfoAdapter();

    if (path.startsWith('/address/') && path.endsWith('/utxo')) {
      const addr = path.split('/')[2];
      const result = await adapter.getAddressUtxo(addr);
      this._log(`blockchain.info UTXO ${addr}: ${result.length} output(s)`);
      return result;
    }
    if (path.startsWith('/address/')) {
      const addr = path.split('/')[2];
      const result = await adapter.getAddress(addr);
      this._log(`blockchain.info balance ${addr}: ${result.chain_stats.funded_txo_sum} sat`);
      return result;
    }
    return NO_BI_HANDLER;
  }

  // ── Logging ──────────────────────────────────────────────────────────
  _log(msg) {
    if (this.debug) console.log(`[btcApiGateway] ${msg}`);
  }

  // ── Public API ────────────────────────────────────────────────────────
  // opts: { priority: 'high' | 'low' (default 'low'), skipCache: bool, timeout: ms }
  get(path, opts = {}) {
    return this._submit('GET', path, undefined, opts);
  }

  post(path, data, opts = {}) {
    return this._submit('POST', path, data, opts);
  }

  // Point-in-time snapshot for a /health or admin endpoint.
  stats() {
    const now = Date.now();
    return {
      ...this._stats,
      queuedHigh: this._highQ.length,
      queuedLow: this._lowQ.length,
      endpoints: this.endpoints,
      cooling: [...this._cooldownUntil.entries()]
        .filter(([, until]) => until > now)
        .map(([base, until]) => ({ base, msLeft: until - now })),
      cacheEntries: this._cache.size,
    };
  }

  // ── Queue plumbing ────────────────────────────────────────────────────
  _submit(method, path, data, opts) {
    return new Promise((resolve, reject) => {
      const job = { method, path, data, opts: opts || {}, resolve, reject };
      if (job.opts.priority === 'high') this._highQ.push(job);
      else this._lowQ.push(job);
      this._pump();
    });
  }

  async _pump() {
    if (this._pumping) return;
    this._pumping = true;
    try {
      while (this._highQ.length || this._lowQ.length) {
        const job = this._highQ.shift() || this._lowQ.shift();
        if (!job) break;

        // Global spacing: never start two requests closer than minSpacingMs,
        // no matter which service queued them.
        const gap = this.minSpacingMs - (Date.now() - this._lastStartAt);
        if (gap > 0) await sleep(gap);
        this._lastStartAt = Date.now();

        try {
          await this._execute(job); // settles job.resolve / job.reject itself
        } catch (e) {
          // _execute is written never to throw; this is a last-resort guard so
          // one unexpected error can't kill the pump for every other caller.
          try { job.reject(e); } catch (_) { /* already settled */ }
        }
      }
    } finally {
      this._pumping = false;
      // Guard against a job enqueued in the instant between the while-check
      // failing and _pumping being cleared.
      if (this._highQ.length || this._lowQ.length) this._pump();
    }
  }

  // ── Endpoint selection + cooldown ────────────────────────────────────
  // Ready endpoints first (original order); still-cooling ones last, soonest to
  // recover first — so a call never fails just because everything is cooling.
  _orderedEndpoints() {
    const now = Date.now();
    const ready = [];
    const cooling = [];
    for (const base of this.endpoints) {
      const until = this._cooldownUntil.get(base) || 0;
      if (until > now) cooling.push([base, until]);
      else ready.push(base);
    }
    cooling.sort((a, b) => a[1] - b[1]);
    return [...ready, ...cooling.map(([base]) => base)];
  }

  _cool(base) {
    this._cooldownUntil.set(base, Date.now() + this.cooldownMs);
    this._log(`cooling ${base} for ${this.cooldownMs}ms`);
  }

  // ── Cache (GET only) ─────────────────────────────────────────────────
  _cacheGet(path) {
    const hit = this._cache.get(path);
    if (!hit) return undefined;
    if (hit.expiresAt <= Date.now()) {
      this._cache.delete(path);
      return undefined;
    }
    return hit.data;
  }

  _cacheSet(path, data) {
    if (this.cacheTtlMs <= 0) return;
    this._cache.set(path, { data, expiresAt: Date.now() + this.cacheTtlMs });
    if (this._cache.size > 500) {
      const now = Date.now();
      for (const [k, v] of this._cache) if (v.expiresAt <= now) this._cache.delete(k);
    }
  }

  // ── Execute one job ──────────────────────────────────────────────────
  // ALWAYS settles job.resolve or job.reject exactly once
  async _execute(job) {
    const { method, path, data, opts, resolve, reject } = job;
    this._stats.total++;

    if (method === 'GET' && !opts.skipCache) {
      const cached = this._cacheGet(path);
      if (cached !== undefined) {
        this._stats.fromCache++;
        this._log(`cache hit ${path}`);
        resolve(cached);
        return;
      }
    }

    const timeout = toInt(opts.timeout, method === 'GET' ? this.getTimeoutMs : this.postTimeoutMs);
    const bases = this._orderedEndpoints();
    let lastErr;

    for (const base of bases) {
      for (let attempt = 0; attempt <= this.sameEndpointRetries; attempt++) {
        try {
          const url = `${base}${path}`;
          const res = method === 'GET'
            ? await axios.get(url, { timeout })
            : await axios.post(url, data, { headers: { 'Content-Type': 'text/plain' }, timeout });

          this._cooldownUntil.delete(base); // it answered — clear any cooldown
          if (method === 'GET') this._cacheSet(path, res.data);
          resolve(res.data);
          return;
        } catch (err) {
          lastErr = err;
          const status = err.response ? err.response.status : undefined;
          if (status === 429) this._stats.http429++;

          if (status === 429 || status === 503) {
            this._cool(base);
            if (attempt < this.sameEndpointRetries) {
              this._stats.retries++;
              await sleep(1000 * (2 ** attempt)); // 1s, then 2s, ...
              continue;
            }
          }
          this._log(`${method} ${base}${path} failed: ${err.message}`);
          break; // give up on this endpoint, try the next
        }
      }
    }

    // ── If all Esplora endpoints fail, try BlockCypher ──────────────
    let bcErr;
    try {
      const bcResult = await this._tryBlockCypher(path, { ...opts, method, data });
      if (bcResult !== NO_BC_HANDLER) {
        this._stats.blockcypherOk++;
        this._log(`BlockCypher fallback succeeded for ${path}`);
        resolve(bcResult);
        return;
      }
    } catch (e) {
      bcErr = e;
      this._stats.blockcypherFail++;
      this._log(`BlockCypher fallback failed for ${path}: ${e.message}`);
    }

    // ── If BlockCypher also failed (or had no handler), try blockchain.info ──
    // Last resort: a separate provider on a separate rate-limit pool, so a
    // 429-storm across the three Esplora endpoints AND BlockCypher at once —
    // exactly what has been happening — still has one more real chance to
    // succeed instead of failing outright.
    let biErr;
    try {
      const biResult = await this._tryBlockchainInfo(path, { ...opts, method, data });
      if (biResult !== NO_BI_HANDLER) {
        this._stats.blockchainInfoOk = (this._stats.blockchainInfoOk || 0) + 1;
        this._log(`blockchain.info fallback succeeded for ${path}`);
        resolve(biResult);
        return;
      }
    } catch (e) {
      biErr = e;
      this._stats.blockchainInfoFail = (this._stats.blockchainInfoFail || 0) + 1;
      this._log(`blockchain.info fallback failed for ${path}: ${e.message}`);
    }

    this._stats.failures++;
    const label = method === 'GET'
      ? 'All blockchain APIs unreachable'
      : 'Broadcast failed on all APIs';
    const esploraMsg = lastErr ? lastErr.message : 'no endpoints configured';
    reject(new Error(`${label}: ${esploraMsg}${bcErr ? ` | BlockCypher: ${bcErr.message}` : ''}${biErr ? ` | blockchain.info: ${biErr.message}` : ''}`));
  }
}

// Singleton — one queue and one spacing clock for the whole process.
module.exports = new BtcApiGateway();