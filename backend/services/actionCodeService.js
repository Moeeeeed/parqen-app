// services/actionCodeService.js
// Short-lived one-time codes for high-risk actions (release BTC, send BTC).
// Shared between server.js and hdWalletRoutes.js via require().

const store = new Map(); // `${userId}:${action}` → { code, expires }

// Clean up expired codes every minute
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of store) { if (v.expires < now) store.delete(k); }
}, 60000);

const VALID_ACTIONS = ['release_btc', 'send_btc', 'send_usdt', 'enable_2fa'];
const TTL_MS = 5 * 60 * 1000; // 5 minutes

function generate(userId, action) {
  if (!VALID_ACTIONS.includes(action)) throw new Error('Invalid action');
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  store.set(`${userId}:${action}`, { code, expires: Date.now() + TTL_MS });
  return code;
}

function verify(userId, action, inputCode) {
  const key = `${userId}:${action}`;
  const record = store.get(key);
  if (!record) return { valid: false, error: 'No security code found. Please tap "Send Code" to request a new one.' };
  if (Date.now() > record.expires) {
    store.delete(key);
    return { valid: false, error: 'Security code expired. Please request a new one.' };
  }
  if (record.code !== String(inputCode || '').trim()) {
    return { valid: false, error: 'Incorrect security code. Please check your email and try again.' };
  }
  store.delete(key); // single-use
  return { valid: true };
}

module.exports = { generate, verify, VALID_ACTIONS };
