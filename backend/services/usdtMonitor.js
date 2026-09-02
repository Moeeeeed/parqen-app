// ============================================
// USDT MONITOR SERVICE
// TronGrid USDT Deposit Monitoring
// ============================================

const axios = require('axios');

// Configuration - REDUCED FREQUENCY
const MONITOR_INTERVAL = 600000; // 10 minutes (was 5 min)
const BATCH_SIZE = 10;
const BATCH_DELAY = 2000; // 2 seconds between batches
const MAX_RETRIES = 3;
const RETRY_DELAY = 5000; // 5 seconds

// Provider with API key support
const TRONGRID_API_KEY = process.env.TRONGRID_API_KEY || '';
const TRONGRID_URL = 'https://api.trongrid.io';

// USDT Contract (TRC20)
const USDT_CONTRACT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';

// In-memory cache to reduce API calls
const balanceCache = new Map();
const CACHE_TTL = 300000; // 5 minutes

// Health tracking
let lastSuccessfulCycle = null;
let consecutiveFailures = 0;
const MAX_FAILURES_BEFORE_ALERT = 5;

// ============================================
// CACHE FUNCTIONS
// ============================================

function getCachedBalance(address) {
    const cached = balanceCache.get(address);
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
        return cached.balance;
    }
    return null;
}

function setCachedBalance(address, balance) {
    balanceCache.set(address, {
        balance: balance,
        timestamp: Date.now()
    });
}

// ============================================
// FETCH USDT BALANCE
// ============================================

async function fetchUSDTBalance(address) {
    // Check cache first
    const cached = getCachedBalance(address);
    if (cached !== null) {
        console.log(`📦 Cache hit for ${address}: ${cached} USDT`);
        return cached;
    }

    try {
        const headers = {};
        if (TRONGRID_API_KEY) {
            headers['TRON-PRO-API-KEY'] = TRONGRID_API_KEY;
        }

        const url = `${TRONGRID_URL}/v1/accounts/${address}/trc20?contract_address=${USDT_CONTRACT}`;
        
        const response = await axios.get(url, {
            headers: headers,
            timeout: 10000
        });

        if (response.status === 429) {
            console.log(`⚠️ Rate limited for ${address}, waiting...`);
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
            return fetchUSDTBalance(address); // Retry
        }

        if (response.data && response.data.data && response.data.data.length > 0) {
            const balance = response.data.data[0].balance / 1000000; // Convert from USDT units (6 decimals)
            setCachedBalance(address, balance);
            return balance;
        }

        return 0;
    } catch (error) {
        console.error(`❌ Error fetching USDT balance for ${address}:`, error.message);
        throw error;
    }
}

// ============================================
// SCAN ADDRESSES IN BATCHES
// ============================================

async function scanAddresses(addresses) {
    console.log(`🔍 Scanning ${addresses.length} Tron address(es)...`);
    
    let totalUSDT = 0;
    let processed = 0;
    let errors = 0;

    for (let i = 0; i < addresses.length; i += BATCH_SIZE) {
        const batch = addresses.slice(i, i + BATCH_SIZE);
        
        try {
            const results = await Promise.allSettled(
                batch.map(async (address) => {
                    try {
                        const balance = await fetchUSDTBalance(address);
                        totalUSDT += balance;
                        processed++;
                        return { address, balance, success: true };
                    } catch (error) {
                        errors++;
                        console.log(`❌ Failed for ${address}: ${error.message}`);
                        return { address, success: false, error: error.message };
                    }
                })
            );
            
            console.log(`✅ Batch ${Math.floor(i/BATCH_SIZE) + 1}/${Math.ceil(addresses.length/BATCH_SIZE)} processed`);
            
        } catch (error) {
            console.error(`❌ Batch error:`, error.message);
        }

        // Delay between batches to avoid rate limiting
        if (i + BATCH_SIZE < addresses.length) {
            await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
        }
    }

    console.log(`✅ Scan complete: ${processed} processed, ${errors} errors, Total USDT: ${totalUSDT}`);
    return { totalUSDT, processed, errors };
}

// ============================================
// MAIN MONITOR LOOP
// ============================================

async function monitorUSDTDeposits() {
    try {
        console.log(`[USDTMonitor] ⏱ Cycle start ${new Date().toISOString()}`);
        
        // Get active wallet addresses (filter to active ones to reduce calls)
        const addresses = await getActiveTronAddresses();
        
        if (addresses.length === 0) {
            console.log('ℹ️ No active addresses to scan');
            return;
        }

        // Only scan addresses that might have deposits (recent activity or open trades)
        const activeAddresses = addresses.filter(addr => {
            return addr.hasRecentActivity || addr.hasOpenDeposit;
        });

        console.log(`📊 Scanning ${activeAddresses.length}/${addresses.length} active addresses`);

        const result = await scanAddresses(activeAddresses);
        
        lastSuccessfulCycle = new Date();
        consecutiveFailures = 0;
        
        console.log(`[USDTMonitor] Cycle complete — ${result.processed} checked, ${result.errors} errors`);

    } catch (error) {
        consecutiveFailures++;
        console.error(`[USDTMonitor] Cycle failed (${consecutiveFailures}/${MAX_FAILURES_BEFORE_ALERT}):`, error.message);
        
        if (consecutiveFailures >= MAX_FAILURES_BEFORE_ALERT) {
            console.error('🚨 ALERT: USDT Monitor has failed ${consecutiveFailures} times in a row!');
            // Send alert (email/telegram)
        }
    }
}

// ============================================
// GET ACTIVE TRON ADDRESSES
// ============================================

async function getActiveTronAddresses() {
    // This should be replaced with your actual database query
    // Return addresses with recent activity or open deposits
    try {
        // Example: query database for active addresses
        // const result = await pool.query('SELECT tron_address FROM user_wallets WHERE is_deposit_address = true');
        // return result.rows.map(row => row.tron_address);
        
        // Placeholder - return empty array
        return [];
    } catch (error) {
        console.error('Error getting active addresses:', error.message);
        return [];
    }
}

// ============================================
// START MONITOR
// ============================================

function startUSDTMonitor() {
    console.log(`🔍 USDT Deposit Monitor started — MAINNET (Tron)`);
    console.log(`   Polling every ${MONITOR_INTERVAL/60000} minutes`);
    console.log(`   Batch size: ${BATCH_SIZE}, Delay: ${BATCH_DELAY}ms`);
    
    // Run immediately
    monitorUSDTDeposits();
    
    // Then run on interval
    setInterval(monitorUSDTDeposits, MONITOR_INTERVAL);
}

// ============================================
// EXPORTS
// ============================================

module.exports = {
    startUSDTMonitor,
    monitorUSDTDeposits,
    fetchUSDTBalance,
    getCachedBalance,
    setCachedBalance,
    balanceCache
};

console.log('✅ USDT Monitor loaded with REDUCED frequency (5 min)');