// services/telegramService.js
// PRAQEN — Telegram Notification Service
// Handles: sending alerts, linking codes, bot message handling
//
// Requires TELEGRAM_BOT_TOKEN in .env
// Bot must be set up via @BotFather with /setcommands and /setprivacy OFF

require('dotenv').config();
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_API = BOT_TOKEN ? `https://api.telegram.org/bot${BOT_TOKEN}` : null;

// ── In-memory linking code store ────────────────────────────────────────────
// Key: 6-digit code, Value: { userId, expires }
const linkingCodes = new Map();
const LINK_CODE_EXPIRY = 10 * 60 * 1000; // 10 minutes

// Periodic cleanup of expired codes
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of linkingCodes) {
    if (v.expires < now) linkingCodes.delete(k);
  }
}, 60_000);

// ── Rate limiting for Telegram API calls ────────────────────────────────────
const lastSendTime = new Map(); // chatId -> timestamp
const MIN_SEND_INTERVAL = 1000; // 1 second between messages to same chat

// ── Helper: send a message via Telegram Bot API ─────────────────────────────
async function sendTelegramMessage(chatId, text, parseMode = 'Markdown') {
  if (!TELEGRAM_API) {
    console.warn('[Telegram] TELEGRAM_BOT_TOKEN not set — skipping send');
    return false;
  }

  // Basic rate limit per chat
  const now = Date.now();
  const last = lastSendTime.get(String(chatId)) || 0;
  if (now - last < MIN_SEND_INTERVAL) {
    await new Promise(r => setTimeout(r, MIN_SEND_INTERVAL - (now - last)));
  }

  const RETRY_DELAY_MS = 2000;
  const TIMEOUT_MS = 20000;

  // Internal helper — single attempt to call Telegram API
  const attemptSend = async (attempt) => {
    const label = attempt === 1 ? 'attempt 1' : 'attempt 2 (retry)';
    console.log(`[Telegram] Sending to chat ${chatId} (${label})...`);
    const resp = await axios.post(`${TELEGRAM_API}/sendMessage`, {
      chat_id: chatId,
      text,
      parse_mode: parseMode,
    }, { timeout: TIMEOUT_MS });
    return resp;
  };

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const resp = await attemptSend(attempt);

      lastSendTime.set(String(chatId), Date.now());

      if (resp.data?.ok) {
        console.log(`[Telegram] Message sent to chat ${chatId} (${attempt === 1 ? 'attempt 1' : 'attempt 2 (retry)'} ✅)`);
        return true;
      }
      console.warn('[Telegram] API returned non-ok:', JSON.stringify(resp.data));
      return false;
    } catch (err) {
      const detail = err.response?.data?.description || err.message;
      const isRetryable = !err.response; // network-level: timeout, ECONNRESET, ECONNABORTED
      console.error(`[Telegram] Failed to send to chat ${chatId} (${attempt === 1 ? 'attempt 1' : 'attempt 2 (retry)'}):`, detail);
      if (attempt === 1 && isRetryable) {
        console.log(`[Telegram] Retrying in ${RETRY_DELAY_MS}ms...`);
        await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
        continue; // retry once
      }
      return false;
    }
  }
}

// ── Public: send a Telegram alert to a user ─────────────────────────────────
// This is the main function called from trade event triggers.
// It looks up the user's telegram_chat_id and preferences, then sends.
// NEVER throws — always fails silently with a log.
async function sendTelegramAlert(userId, message) {
  try {
    if (!userId || !message) {
      console.warn('[Telegram] sendTelegramAlert called with missing args:', { userId: !!userId, message: !!message });
      return;
    }

    console.log(`[Telegram] sendTelegramAlert → looking up user ${userId.slice(0,8)}...`);

    // Wrap the DB lookup in a timeout so a slow Supabase connection can't block forever
    const DB_TIMEOUT_MS = 6000;
    const lookupPromise = supabaseAdmin
      .from('users')
      .select('telegram_chat_id, telegram_notifications_enabled')
      .eq('id', userId)
      .maybeSingle();
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Telegram DB lookup timed out')), DB_TIMEOUT_MS)
    );

    const { data: user, error } = await Promise.race([lookupPromise, timeoutPromise]);

    if (error) {
      console.error(`[Telegram] DB lookup failed for user ${userId.slice(0,8)}:`, error.message);
      return;
    }

    if (!user?.telegram_chat_id || !user?.telegram_notifications_enabled) {
      console.log(`[Telegram] Skipping alert to ${userId.slice(0,8)} — chat_id=${user?.telegram_chat_id || 'null'}, enabled=${user?.telegram_notifications_enabled ?? 'null'}`);
      return; // Not connected or disabled — skip silently
    }

    console.log(`[Telegram] Sending to chat ${user.telegram_chat_id} for user ${userId.slice(0,8)}...`);

    // Sanitize message for Markdown — escape special characters that break parse_mode
    const sanitized = message
      .replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&')
      .replace(/\\\\/g, '\\'); // undo double-escaping of backslashes

    const sendResult = await sendTelegramMessage(user.telegram_chat_id, sanitized);
    console.log(`[Telegram] sendTelegramAlert to ${userId.slice(0,8)}: ${sendResult ? '✅ sent' : '❌ failed'}`);
  } catch (err) {
    console.error(`[Telegram] sendTelegramAlert error for user ${userId?.slice(0,8) || 'unknown'}:`, err.message);
    // Never throw — this must never break the calling trade action
  }
}

// ── Public: generate a linking code for a user ──────────────────────────────
// Returns the 6-digit code. Frontend shows this to the user.
async function generateLinkingCode(userId) {
  // Check if already connected
  const { data: existing } = await supabaseAdmin
    .from('users')
    .select('telegram_chat_id')
    .eq('id', userId)
    .maybeSingle();

  if (existing?.telegram_chat_id) {
    return { error: 'Your account is already connected to Telegram. Disconnect first to link a new account.' };
  }

  // Generate a 6-digit code
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const expires = Date.now() + LINK_CODE_EXPIRY;

  // Remove any previous code for this user
  for (const [k, v] of linkingCodes) {
    if (v.userId === userId) linkingCodes.delete(k);
  }

  linkingCodes.set(code, { userId, expires });
  console.log(`[Telegram] Linking code ${code} generated for user ${userId.slice(0, 8)}`);

  return { code, expiresAt: new Date(expires).toISOString() };
}

// ── Public: verify a linking code sent by the Telegram bot ──────────────────
// Called when the bot receives a message with a code.
// Returns { success, userId } or { error }
async function verifyLinkingCode(code, telegramChatId, telegramUsername) {
  const cleaned = String(code).trim();

  const record = linkingCodes.get(cleaned);
  if (!record) {
    return { error: 'Invalid or expired code. Generate a new one from Settings → Notifications.' };
  }

  if (Date.now() > record.expires) {
    linkingCodes.delete(cleaned);
    return { error: 'This code has expired. Generate a new one from Settings → Notifications.' };
  }

  const { userId } = record;
  linkingCodes.delete(cleaned);

  // Save the Telegram chat_id to the user's account
  const { error } = await supabaseAdmin
    .from('users')
    .update({
      telegram_chat_id: String(telegramChatId),
      telegram_connected_at: new Date().toISOString(),
      telegram_notifications_enabled: true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);

  if (error) {
    console.error('[Telegram] Failed to save chat_id:', error.message);
    return { error: 'Failed to link account. Please try again.' };
  }

  console.log(`[Telegram] User ${userId.slice(0, 8)} linked to Telegram chat ${telegramChatId} (@${telegramUsername || 'unknown'})`);
  return { success: true, userId };
}

// ── Public: get user's Telegram connection status ───────────────────────────
async function getTelegramStatus(userId) {
  const { data: user, error } = await supabaseAdmin
    .from('users')
    .select('telegram_chat_id, telegram_connected_at, telegram_notifications_enabled')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    console.error('[Telegram] Status lookup failed:', error.message);
    return { connected: false, enabled: false };
  }

  return {
    connected: !!user?.telegram_chat_id,
    connectedAt: user?.telegram_connected_at || null,
    enabled: !!user?.telegram_notifications_enabled,
  };
}

// ── Public: toggle notifications on/off ─────────────────────────────────────
async function toggleTelegramNotifications(userId, enabled) {
  const { error } = await supabaseAdmin
    .from('users')
    .update({
      telegram_notifications_enabled: !!enabled,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);

  if (error) {
    console.error('[Telegram] Toggle failed:', error.message);
    return { error: 'Failed to update notification settings.' };
  }

  return { success: true, enabled: !!enabled };
}

// ── Public: disconnect Telegram from a user's account ───────────────────────
async function disconnectTelegram(userId) {
  const { error } = await supabaseAdmin
    .from('users')
    .update({
      telegram_chat_id: null,
      telegram_connected_at: null,
      telegram_notifications_enabled: false,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);

  if (error) {
    console.error('[Telegram] Disconnect failed:', error.message);
    return { error: 'Failed to disconnect Telegram.' };
  }

  console.log(`[Telegram] User ${userId.slice(0, 8)} disconnected from Telegram`);
  return { success: true };
}

// ── Public: handle an incoming Telegram bot message ─────────────────────────
// Called by the bot webhook/polling handler in server.js
async function handleBotMessage(chatId, text, telegramUser) {
  if (!text || !chatId) return null;

  const cleaned = text.trim();

  // Handle /start command — might carry a linking code
  if (cleaned.startsWith('/start')) {
    const parts = cleaned.split(/\s+/);
    if (parts.length >= 2) {
      // /start 123456 — linking code
      const code = parts[1];
      return verifyLinkingCode(code, chatId, telegramUser?.username);
    }
    // Just /start — welcome message
    return {
      reply: '👋 Welcome to PRAQEN Alerts!\n\nTo link your account, generate a code from Settings → Notifications in the PRAQEN app, then send it here.\n\nFormat: just send the 6-digit code, or use /start <code>.',
    };
  }

  // Handle /stop or /disable
  if (/^\/(stop|disable)/.test(cleaned)) {
    const { data: user } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('telegram_chat_id', String(chatId))
      .maybeSingle();

    if (user) {
      await supabaseAdmin
        .from('users')
        .update({ telegram_notifications_enabled: false, updated_at: new Date().toISOString() })
        .eq('id', user.id);
      return { reply: '🔕 Telegram notifications disabled. You can re-enable from Settings → Notifications in the PRAQEN app.' };
    }
    return { reply: 'Your account is not linked. Send a linking code to connect.' };
  }

  // Handle /enable
  if (/^\/enable/.test(cleaned)) {
    const { data: user } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('telegram_chat_id', String(chatId))
      .maybeSingle();

    if (user) {
      await supabaseAdmin
        .from('users')
        .update({ telegram_notifications_enabled: true, updated_at: new Date().toISOString() })
        .eq('id', user.id);
      return { reply: '🔔 Telegram notifications enabled! You\'ll receive trade alerts here.' };
    }
    return { reply: 'Your account is not linked. Send a linking code to connect.' };
  }

  // If it looks like a 6-digit code, try to link
  if (/^\d{6}$/.test(cleaned)) {
    return verifyLinkingCode(cleaned, chatId, telegramUser?.username);
  }

  // Unknown command — help text
  return {
    reply: '🤖 *PRAQEN Alerts*\n\nTo link your account, send a 6-digit code from the app.\n\nCommands:\n/start — Welcome message\n/stop — Disable alerts\n/enable — Enable alerts',
  };
}

module.exports = {
  sendTelegramAlert,
  sendTelegramMessage,
  generateLinkingCode,
  verifyLinkingCode,
  getTelegramStatus,
  toggleTelegramNotifications,
  disconnectTelegram,
  handleBotMessage,
  BOT_TOKEN,
  TELEGRAM_API,
};
