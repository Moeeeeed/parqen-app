// OneSignal Web Push service for PRAQEN trade alerts
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');

// ── Supabase Admin Client ──────────────────────────────────────────────────
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

const APP_ID = process.env.ONESIGNAL_APP_ID;
const API_KEY = process.env.ONESIGNAL_REST_API_KEY;

function isConfigured() {
  return APP_ID && API_KEY && API_KEY !== 'your_rest_api_key_from_onesignal';
}

async function send({ userIds, title, message, url }) {
  if (!isConfigured()) {
    console.error('[Push] OneSignal not configured — ONESIGNAL_APP_ID or ONESIGNAL_REST_API_KEY missing');
    return;
  }
  if (!userIds || userIds.length === 0) {
    console.error('[Push] No userIds provided — skipping');
    return;
  }

  // include_external_user_ids targets subscriptions by external_id (set via
  // OneSignal.login(userId) on the frontend). channel_for_external_user_ids
  // restricts delivery to push only (not email/SMS channels).
  const body = {
    app_id: APP_ID,
    headings: { en: title },
    contents: { en: message },
    include_external_user_ids: userIds.map(String),
    channel_for_external_user_ids: 'push',
    url: url || 'https://praqen.com',
  };

  console.log(`[Push] Sending to user(s): ${userIds.join(',')} | title: ${title}`);

  try {
    const response = await axios.post('https://onesignal.com/api/v1/notifications', body, {
      headers: {
        Authorization: `Basic ${API_KEY}`,  // ✅ FIXED: 'Key' → 'Basic'
        'Content-Type': 'application/json',
      },
      timeout: 8000,
    });
    const { id, recipients, errors } = response.data || {};
    if (recipients === 0) {
      console.warn(`[Push] 0 recipients for user(s) ${userIds.join(',')} — their browser may not have called OS.login(userId) yet. Check frontend identifyUser.`);
    } else {
      console.log(`[Push] Delivered — notification id: ${id} | recipients: ${recipients}`);
    }
    if (errors) console.error('[Push] OneSignal errors:', JSON.stringify(errors));
    return response.data;
  } catch (e) {
    const detail = e.response?.data || e.message;
    console.error('[Push] ❌ OneSignal API error:', JSON.stringify(detail));

    // 🔥 ADDED: Try with User Auth Key if REST API Key fails
    if (e.response?.status === 401 || e.response?.status === 403) {
      console.log('[Push] 🔄 Trying with User Auth Key instead...');
      try {
        const userAuthKey = process.env.ONESIGNAL_USER_AUTH_KEY;
        if (userAuthKey && userAuthKey !== 'your-user-auth-key-here') {
          const retryResponse = await axios.post('https://onesignal.com/api/v1/notifications', body, {
            headers: {
              Authorization: `Basic ${userAuthKey}`,
              'Content-Type': 'application/json',
            },
            timeout: 8000,
          });
          const { id, recipients } = retryResponse.data || {};
          console.log(`[Push] ✅ Retry successful — notification id: ${id} | recipients: ${recipients}`);
          return retryResponse.data;
        }
      } catch (retryErr) {
        console.error('[Push] ❌ Retry also failed:', retryErr.response?.data || retryErr.message);
      }
    }
  }
}

// ── Fetch username helper ──────────────────────────────────────────────────
async function getUsername(userId) {
  if (!userId) return null;
  try {
    const { data, error } = await supabaseAdmin
      .from('users')
      .select('username')
      .eq('id', userId)
      .single();
    if (error || !data) return null;
    return data.username;
  } catch (e) {
    return null;
  }
}

// ── Notification titles ──────────────────────────────────────────────────────
function getTitle(type) {
  switch (type) {
    case 'new_trade': return '💰 New Trade Request!';
    case 'payment_sent': return '💵 Payment Sent!';
    case 'btc_released': return '✅ Bitcoin Released!';
    case 'trade_cancelled': return '❌ Trade Cancelled';
    case 'dispute_opened': return '⚠️ Dispute Opened';
    case 'dispute_resolved': return '🏁 Dispute Resolved';
    case 'kyc_approved': return '🪪 KYC Approved!';
    case 'phone_verified': return '📱 Phone Verified!';
    default: return 'PRAQEN Alert';
  }
}

// ── Notification messages ──────────────────────────────────────────────────
function getMessage(trade, type, actorName) {
  const ref = trade?.trade_ref ? `#${trade.trade_ref.slice(0, 8).toUpperCase()}` : '';
  const btc = trade?.amount_btc ? `${parseFloat(trade.amount_btc).toFixed(6)} BTC` : 'BTC';
  const name = actorName || 'Someone';

  switch (type) {
    case 'new_trade':
      return `@${name} wants to trade ${btc} with you. Tap to respond.`;
    case 'payment_sent':
      return `@${name} sent payment for trade ${ref}. Please verify and release Bitcoin.`;
    case 'btc_released':
      return `@${name} released ${btc} for trade ${ref}. Check your wallet!`;
    case 'trade_cancelled':
      return `@${name} cancelled trade ${ref}. Any locked BTC has been returned.`;
    case 'dispute_opened':
      return `@${name} opened a dispute for trade ${ref}. A moderator will review it.`;
    case 'dispute_resolved':
      return `Trade ${ref} dispute has been resolved.`;
    case 'kyc_approved':
      return 'Your identity has been verified! Your trade limits have been upgraded.';
    case 'phone_verified':
      return 'Your phone number has been verified! You can now trade with higher limits.';
    default:
      return `Update on your PRAQEN trade ${ref}`;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Send a push notification to one or more users.
 * @param {string|string[]} userIds   - One or multiple user IDs
 * @param {object}          trade     - Trade object (can be null for system alerts)
 * @param {string}          type      - Notification type key
 * @param {string}          actorName - Username of the person who initiated the action (optional)
 * @param {string}          customMessage - Custom message override (optional)
 */
async function sendTradeAlert(userIds, trade, type, actorName, customMessage) {
  const ids = Array.isArray(userIds) ? userIds : [userIds];
  const tradeId = trade?.id || '';

  // If actorName not provided, fetch it
  let name = actorName;
  if (!name && ids.length === 1) {
    // For single user, try to fetch their username
    name = await getUsername(ids[0]);
  }
  if (!name) name = 'Someone';

  let message = customMessage;
  if (!message) {
    message = getMessage(trade, type, name);
  }

  await send({
    userIds: ids.filter(Boolean),
    title: getTitle(type),
    message: message,
    url: tradeId ? `https://praqen.com/trade/${tradeId}` : 'https://praqen.com',
  });
}

async function sendSystemAlert(userId, title, message, url) {
  await send({
    userIds: [userId].filter(Boolean),
    title,
    message,
    url: url || 'https://praqen.com',
  });
}

/**
 * Send a push notification to ALL subscribed users at once.
 * Uses OneSignal's "All" segment — one API call, no user-ID list needed.
 * @param {string} title
 * @param {string} message
 * @param {string} [url]
 */
async function sendBroadcastPush(title, message, url) {
  if (!isConfigured()) {
    console.error('[Push] OneSignal not configured — skipping broadcast');
    return;
  }

  const body = {
    app_id: APP_ID,
    headings: { en: title },
    contents: { en: message },
    included_segments: ['All'],
    url: url || 'https://praqen.com',
  };

  console.log(`[Push] Broadcast to ALL — title: ${title}`);

  try {
    const response = await axios.post('https://onesignal.com/api/v1/notifications', body, {
      headers: {
        Authorization: `Basic ${API_KEY}`,  // ✅ FIXED: 'Key' → 'Basic'
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    });
    const { id, recipients, errors } = response.data || {};
    console.log(`[Push] ✅ Broadcast delivered – id: ${id} | recipients: ${recipients}`);
    if (errors) console.error('[Push] OneSignal broadcast errors:', JSON.stringify(errors));
    return response.data;
  } catch (e) {
    const detail = e.response?.data || e.message;
    console.error('[Push] ❌ OneSignal broadcast error:', JSON.stringify(detail));
  }
}

module.exports = { sendTradeAlert, sendSystemAlert, sendBroadcastPush };