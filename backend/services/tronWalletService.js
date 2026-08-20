// services/tronWalletService.js
// PRAQEN Tron / USDT TRC-20 Wallet Service
// Mirrors hdWalletService but for the Tron network.
// Same BIP39 mnemonic → same deterministic derivation → Tron addresses.
// Handles: address generation, USDT balance checks, USDT external sends.

require('dotenv').config();
const bip39  = require('bip39');
const crypto = require('crypto');

const TRON_USDT_CONTRACT = process.env.TRON_USDT_CONTRACT || 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
const TRONGRID_API_KEY   = process.env.TRONGRID_API_KEY   || '';
const TRONGRID_BASE      = 'https://api.trongrid.io';

// Lazy-load TronWeb — avoids startup crash and supports both v4 (default export)
// and v5 (named export { TronWeb }).
let _TronWebClass = null;
function getTronWebClass() {
  if (!_TronWebClass) {
    const mod = require('tronweb');
    _TronWebClass = mod.TronWeb || mod;
  }
  return _TronWebClass;
}

function tronHeaders() {
  const h = { 'Content-Type': 'application/json' };
  if (TRONGRID_API_KEY) h['TRON-PRO-API-KEY'] = TRONGRID_API_KEY;
  return h;
}

// ── Wait for a broadcast tx to actually land on-chain ─────────────────────
// A successful sendRawTransaction/sendTransaction response only means the
// node ACCEPTED the tx for broadcast — not that it was included in a block.
// Underfunded senders, expired transactions, and rejected contract calls all
// return a txid without ever confirming. Callers must not treat a txid alone
// as proof of success.
// Default timeout is 90s, not the ~20s a Tron block time would suggest — observed
// mainnet behavior is that TronGrid's getTransactionInfo often doesn't reflect a
// transaction until well past 30s even though it already succeeded on-chain
// (verifiable via TronScan earlier). A short timeout was causing legitimate,
// successful sweeps to be reported as failed and left the deposit re-queued.
async function waitForConfirmation(txid, { timeoutMs = 90000, intervalMs = 3000 } = {}) {
  const TronWeb = getTronWebClass();
  const tw      = new TronWeb({ fullHost: TRONGRID_BASE, headers: tronHeaders() });
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const info = await tw.trx.getTransactionInfo(txid);
      if (info && info.id) {
        if (info.receipt?.result) {
          const ok = info.receipt.result === 'SUCCESS';
          // reverted=true only when TronGrid actually looked up the tx and reports
          // a non-success on-chain result — a genuine, verified on-chain failure.
          return { confirmed: ok, reverted: !ok, info, reason: `on-chain result: ${info.receipt.result}` };
        }
        // Plain TRX transfer — no contract receipt, but landing in a block is confirmation
        if (info.blockNumber) return { confirmed: true, reverted: false, info };
      }
    } catch (err) {
      // Transient lookup failure — keep polling until deadline
    }
    await new Promise(r => setTimeout(r, intervalMs));
  }
  // Deadline hit without ever finding the tx info — this is NOT proof of failure.
  // TronGrid's public (unauthenticated) API is frequently rate-limited/slow enough
  // that a transfer which already succeeded on-chain isn't visible via
  // getTransactionInfo within this window. reverted=false here on purpose: callers
  // must not treat "we couldn't verify in time" the same as "it failed" — the tx
  // may already be broadcast and irreversible.
  return { confirmed: false, reverted: false, reason: `not confirmed within ${timeoutMs}ms — could not verify (may still have succeeded on-chain)` };
}

class TronWalletService {

  constructor() {
    this.masterPrivateKey = null;
    this.initialized      = false;
  }

  // ── Boot from same mnemonic as hdWalletService ────────────────────────────
  initialize() {
    if (this.initialized) return;

    const mnemonic = process.env.MNEMONIC;
    if (!mnemonic)                          throw new Error('MNEMONIC not found in .env');
    if (!bip39.validateMnemonic(mnemonic))  throw new Error('MNEMONIC is invalid');

    const seed            = bip39.mnemonicToSeedSync(mnemonic);
    this.masterPrivateKey = seed.slice(0, 32);
    this.initialized      = true;
    console.log('✅ Tron Wallet Service initialized — MAINNET');
    console.log(`   USDT contract: ${TRON_USDT_CONTRACT}`);
  }

  // ── Deterministic private key — same algorithm as hdWalletService ─────────
  // 'tron_' prefix ensures Tron keys are DIFFERENT from BTC keys for same userId
  getPrivateKeyHex(identifier) {
    this.initialize();
    const hash       = crypto.createHash('sha256').update(`tron_${identifier}`).digest();
    const combined   = Buffer.concat([this.masterPrivateKey, hash]);
    const privateKey = crypto.createHash('sha256').update(combined).digest().slice(0, 32);
    return privateKey.toString('hex');
  }

  // ── Generate Tron (T…) address from any identifier ────────────────────────
  generateAddress(identifier) {
    this.initialize();
    const TronWeb    = getTronWebClass();
    const privKeyHex = this.getPrivateKeyHex(identifier);

    // Use a minimal TronWeb instance just for the address utility
    const tw      = new TronWeb({ fullHost: TRONGRID_BASE });
    const address = tw.address.fromPrivateKey(privKeyHex);

    return {
      address,
      identifier,
      network: 'mainnet',
      format:  'Tron Base58 (T…)',
    };
  }

  generateUserAddress(userId) {
    return this.generateAddress(`user_${userId}`);
  }

  generateEscrowAddress(tradeId) {
    return this.generateAddress(`escrow_${tradeId}`);
  }

  // ── USDT balance at any Tron address ─────────────────────────────────────
  // Reads balanceOf() directly from the USDT contract instead of TronGrid's
  // /v1/accounts summary endpoint. That endpoint returns an empty account for
  // any address that was never TRX-activated — but an address can receive
  // TRC-20 tokens (like USDT) without ever being activated, so the summary
  // endpoint silently under-reports fresh deposit addresses. balanceOf() reads
  // contract storage directly and isn't affected by activation status.
  // Throws on network/API errors so callers can distinguish from genuine zero.
  async getUSDTBalance(address) {
    const TronWeb = getTronWebClass();
    const tw      = new TronWeb({ fullHost: TRONGRID_BASE, headers: tronHeaders() });

    const call = () => tw.transactionBuilder.triggerConstantContract(
      TRON_USDT_CONTRACT,
      'balanceOf(address)',
      {},
      [{ type: 'address', value: address }],
      address
    );

    let resp;
    try {
      resp = await call();
    } catch (err) {
      // A single 429 is often just a transient burst — wait and retry once
      // before giving up, instead of failing the whole check immediately.
      if (err.response?.status === 429 || /429/.test(err.message || '')) {
        await new Promise(r => setTimeout(r, 1200));
        try {
          resp = await call();
        } catch (retryErr) {
          throw new Error(`TronGrid API error for ${address?.slice(0, 12)}…: ${retryErr.message}`);
        }
      } else {
        // Network error or timeout — throw so caller can keep sweep PENDING
        throw new Error(`TronGrid API error for ${address?.slice(0, 12)}…: ${err.message}`);
      }
    }

    const hex = resp?.constant_result?.[0];
    if (!hex || /^0*$/.test(hex)) return 0; // No balance — genuinely zero

    const rawBalance = BigInt('0x' + hex);
    return Number(rawBalance) / 1e6; // USDT TRC-20 has 6 decimals
  }

  // ── Send USDT TRC-20 to an external Tron address ─────────────────────────
  // fromIdentifier: e.g. 'user_abc123' or 'escrow_trade_xyz'
  // toAddress     : any valid Tron base58 address starting with T
  // amountUsdt    : human-readable USDT amount (e.g. 10.5)
  async sendUSDT(fromIdentifier, toAddress, amountUsdt) {
    this.initialize();
    const TronWeb = getTronWebClass();

    if (!toAddress || !toAddress.startsWith('T') || toAddress.length !== 34) {
      throw new Error('Invalid Tron address — must be a 34-character base58 address starting with T');
    }
    if (!amountUsdt || parseFloat(amountUsdt) <= 0) {
      throw new Error('Invalid USDT amount');
    }

    const privateKeyHex = this.getPrivateKeyHex(fromIdentifier);

    // Build a TronWeb instance signed as the sender
    const tw = new TronWeb({
      fullHost:   TRONGRID_BASE,
      headers:    TRONGRID_API_KEY ? { 'TRON-PRO-API-KEY': TRONGRID_API_KEY } : {},
      privateKey: privateKeyHex,
    });

    const fromAddress = tw.address.fromPrivateKey(privateKeyHex);
    const amountSun   = Math.floor(parseFloat(amountUsdt) * 1e6); // 6 decimals

    console.log(`\n💸 [TronWallet] sendUSDT`);
    console.log(`   From : ${fromAddress}`);
    console.log(`   To   : ${toAddress}`);
    console.log(`   Amount: ${amountUsdt} USDT (${amountSun} sun)`);

    // Build the TRC-20 transfer call
    const { transaction, result } = await tw.transactionBuilder.triggerSmartContract(
      TRON_USDT_CONTRACT,
      'transfer(address,uint256)',
      { feeLimit: 40_000_000 }, // 40 TRX max fee — sufficient for any USDT transfer
      [
        { type: 'address', value: toAddress },
        { type: 'uint256', value: amountSun },
      ],
      fromAddress
    );

    if (!result?.result) {
      throw new Error(`triggerSmartContract failed: ${JSON.stringify(result)}`);
    }

    const signedTx = await tw.trx.sign(transaction);
    const receipt  = await tw.trx.sendRawTransaction(signedTx);

    if (!receipt?.result && !receipt?.txid) {
      throw new Error(`USDT broadcast failed: ${JSON.stringify(receipt)}`);
    }

    const txid       = receipt.txid || receipt.transaction?.txID;
    const explorerUrl = `https://tronscan.org/#/transaction/${txid}`;

    // A txid back from sendRawTransaction only means it was accepted for
    // broadcast — confirm it actually landed before reporting success.
    const confirmation = await waitForConfirmation(txid);
    if (!confirmation.confirmed) {
      if (confirmation.reverted) {
        // TronGrid actually looked this tx up and reports it failed on-chain —
        // a verified failure, safe to report as an error.
        throw new Error(`USDT transfer failed on-chain (txid ${txid}): ${confirmation.reason}`);
      }
      // We simply couldn't verify within the timeout (public TronGrid rate limits/
      // lag) — the transfer was already broadcast and may well have succeeded.
      // Do NOT throw here: throwing after a real broadcast previously caused the
      // caller to lose the txid entirely and leave the withdrawal stuck as
      // "pending" while the funds had actually already left the hot wallet —
      // with no safeguard against the CEO retrying and double-sending. Instead,
      // report success (with confirmed:false) so the caller still records the
      // txid and marks the withdrawal handled.
      console.warn(`⚠️  [TronWallet] USDT tx ${txid} broadcast but could not verify confirmation in time — treating as sent. ${confirmation.reason}`);
    }

    console.log(`✅ [TronWallet] USDT sent! txid: ${txid}`);
    console.log(`   Explorer: ${explorerUrl}`);

    return {
      success:      true,
      confirmed:    confirmation.confirmed,
      txid,
      from:         fromAddress,
      to:           toAddress,
      amount_usdt:  parseFloat(amountUsdt),
      explorer_url: explorerUrl,
    };
  }

  // ── Convenience: check if a string is a valid Tron mainnet address ────────
  isValidTronAddress(address) {
    // Strict base58 alphabet: no 0, O, I, l (ambiguous chars excluded from base58check)
    return typeof address === 'string' && /^T[A-HJ-NP-Za-km-z1-9]{33}$/.test(address);
  }

  // ── Wait for any broadcast txid (USDT or plain TRX) to confirm on-chain ───
  async waitForConfirmation(txid, opts) {
    return waitForConfirmation(txid, opts);
  }
}

module.exports = new TronWalletService();
