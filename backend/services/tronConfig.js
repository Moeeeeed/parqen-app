// services/tronConfig.js
// PRAQEN Tron & TRC-20 Network Configuration Helper
// Allows seamless switching between Tron Nile Testnet and Tron Mainnet via TRON_NETWORK env var.

require('dotenv').config();

const networkEnv = (process.env.TRON_NETWORK || process.env.HD_NETWORK || 'mainnet').trim().toLowerCase();
const isTestnet = networkEnv === 'testnet' || networkEnv === 'nile' || networkEnv === 'shasta';

// Standard official addresses & endpoints
const MAINNET_TRONGRID  = 'https://api.trongrid.io';
const MAINNET_CONTRACT  = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'; // Official Mainnet USDT TRC-20
const MAINNET_TRONSCAN  = 'https://tronscan.org';

const NILE_TRONGRID     = 'https://nile.trongrid.io';
const NILE_CONTRACT     = 'TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf'; // Official Nile Testnet USDT TRC-20
const NILE_TRONSCAN     = 'https://nile.tronscan.org';

const config = {
  network: isTestnet ? 'nile' : 'mainnet',
  isTestnet,
  trongridUrl: (process.env.TRONGRID_URL || (isTestnet ? NILE_TRONGRID : MAINNET_TRONGRID)).replace(/\/+$/, ''),
  usdtContract: process.env.TRON_USDT_CONTRACT || (isTestnet ? NILE_CONTRACT : MAINNET_CONTRACT),
  tronscanUrl: (process.env.TRONSCAN_URL || (isTestnet ? NILE_TRONSCAN : MAINNET_TRONSCAN)).replace(/\/+$/, ''),
  trongridApiKey: process.env.TRONGRID_API_KEY || '',

  /** Standard headers for TronGrid REST calls */
  getHeaders() {
    const h = { 'Content-Type': 'application/json' };
    if (this.trongridApiKey) h['TRON-PRO-API-KEY'] = this.trongridApiKey;
    return h;
  },

  /** Generate block explorer link for an address */
  getExplorerAddressUrl(address) {
    if (!address) return this.tronscanUrl;
    return `${this.tronscanUrl}/#/address/${address}`;
  },

  /** Generate block explorer link for a transaction hash */
  getExplorerTxUrl(txid) {
    if (!txid) return this.tronscanUrl;
    return `${this.tronscanUrl}/#/transaction/${txid}`;
  },

  /** Summary for logging and status endpoints */
  getSummary() {
    return {
      network: this.network,
      isTestnet: this.isTestnet,
      trongridUrl: this.trongridUrl,
      usdtContract: this.usdtContract,
      tronscanUrl: this.tronscanUrl,
      hasApiKey: Boolean(this.trongridApiKey),
    };
  }
};

module.exports = config;
