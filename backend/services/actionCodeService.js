// services/actionCodeService.js
// Short-lived one-time codes for high-risk actions (release BTC, send BTC,
// send USDT, enable 2FA). Shared between server.js and hdWalletRoutes.js.
//
// Backed by the security_action_codes table (see database/security_action_codes.sql),
// not in-memory — an in-memory Map loses every pending code on server
// restart/redeploy, which meant a user could request a code, wait a few
// seconds, and get "No security code found" through no fault of their own.

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

const VALID_ACTIONS = ['release_btc', 'send_btc', 'send_usdt', 'enable_2fa'];
const TTL_MS = 5 * 60 * 1000; // 5 minutes

async function generate(userId, action) {
  if (!VALID_ACTIONS.includes(action)) throw new Error('Invalid action');
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + TTL_MS).toISOString();

  const { error } = await supabase.from('security_action_codes').upsert({
    user_id: userId,
    action,
    code,
    expires_at: expiresAt,
    created_at: new Date().toISOString(),
  }, { onConflict: 'user_id,action' });

  if (error) throw new Error(`actionCodeService.generate: ${error.message}`);
  return code;
}

async function verify(userId, action, inputCode) {
  const { data: record, error } = await supabase
    .from('security_action_codes')
    .select('code, expires_at')
    .eq('user_id', userId)
    .eq('action', action)
    .maybeSingle();

  if (error) {
    return { valid: false, error: 'Could not verify your security code right now. Please try again.' };
  }
  if (!record) {
    return { valid: false, error: 'No security code found. Please tap "Send Code" to request a new one.' };
  }
  if (new Date(record.expires_at).getTime() < Date.now()) {
    await supabase.from('security_action_codes').delete().eq('user_id', userId).eq('action', action);
    return { valid: false, error: 'Security code expired. Please request a new one.' };
  }
  if (record.code !== String(inputCode || '').trim()) {
    return { valid: false, error: 'Incorrect security code. Please check your email and try again.' };
  }

  await supabase.from('security_action_codes').delete().eq('user_id', userId).eq('action', action); // single-use
  return { valid: true };
}

module.exports = { generate, verify, VALID_ACTIONS };
