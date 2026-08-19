# Telegram Notification System — PRAQEN

Complete Telegram bot integration for real-time trade alerts, deposit notifications, and dispute updates.

---

## Overview

Users link their Telegram account to PRAQEN via a 6-digit code. Once linked, they receive real-time Telegram messages for key events (trades, deposits, transfers, disputes) alongside the existing in-app, push, and email notifications.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│  Frontend (Settings → Notifications tab)                         │
│  ┌──────────────────────────────────────┐                        │
│  │ TelegramCard component               │                        │
│  │  • GET  /api/telegram/status         │                        │
│  │  • POST /api/telegram/link           │                        │
│  │  • POST /api/telegram/toggle         │                        │
│  │  • POST /api/telegram/disconnect     │                        │
│  └──────────────────────────────────────┘                        │
│                          │                                       │
│                          ▼                                       │
│  ┌──────────────────────────────────────┐                        │
│  │  server.js (Express routes)          │                        │
│  │  • Webhook: POST /api/telegram/webhook│                       │
│  │  • Uses verifyToken middleware        │                       │
│  └──────────────────────────────────────┘                        │
│                          │                                       │
│                          ▼                                       │
│  ┌──────────────────────────────────────┐                        │
│  │  telegramService.js                  │                        │
│  │  • sendTelegramMessage(chatId, text) │                        │
│  │  • sendTelegramAlert(userId, msg)    │◄── called from all     │
│  │  • handleBotMessage(chatId, text)    │    event triggers      │
│  │  • generateLinkingCode(userId)       │                        │
│  │  • verifyLinkingCode(code, chatId)   │                        │
│  │  • getTelegramStatus(userId)         │                        │
│  │  • toggleTelegramNotifications()     │                        │
│  │  • disconnectTelegram(userId)        │                        │
│  └──────────────────────────────────────┘                        │
│                          │                                       │
│                          ▼                                       │
│  ┌──────────────────────────────────────┐                        │
│  │  Telegram Bot API                    │                        │
│  │  api.telegram.org/bot<TOKEN>/...     │                        │
│  └──────────────────────────────────────┘                        │
└──────────────────────────────────────────────────────────────────┘
```

---

## Files Created

| File | Purpose |
|------|---------|
| `backend/services/telegramService.js` | Core service — all Telegram logic (sending, linking, bot message handling) |
| `backend/migrations/add_telegram_fields.sql` | DB migration — adds 3 columns to `users` table |
| `TELEGRAM_NOTIFICATIONS.md` | This documentation file |

---

## Files Modified

| File | Change |
|------|--------|
| `backend/server.js` | Telegram webhook route, REST API endpoints (`/api/telegram/*`), Telegram alerts on trade creation, mark-paid, disputes, dispute resolution, internal transfer; mounted `notificationRoutes` at `/api/user` |
| `backend/routes/notificationRoutes.js` | Improved error logging with user ID context for Supabase fetch/upsert failures |
| `backend/services/tradeEscrowService.js` | Telegram alerts on escrow lock, payment sent, BTC released, trade cancelled/expired |
| `backend/services/depositMonitor.js` | Telegram alert on BTC deposit confirmed |
| `backend/services/usdtDepositMonitor.js` | Telegram alert on USDT deposit confirmed |
| `backend/services/realtimeDepositService.js` | Telegram alert on pending BTC deposit detected |
| `backend/routes/hdWalletRoutes.js` | Telegram alerts on internal transfer (sender + recipient); added `currency` and `amount_usdt` to wallet transaction select |
| `frontend/src/pages/Settings.js` | `TelegramCard` UI component in Notifications tab |
| `backend/.env.example` | Added `TELEGRAM_BOT_TOKEN` env var |

---

## Database Schema

The migration (`add_telegram_fields.sql`) adds 3 columns to the existing `users` table:

```sql
telegram_chat_id              TEXT          -- Telegram chat ID (string)
telegram_connected_at         TIMESTAMPTZ   -- When user linked their account
telegram_notifications_enabled BOOLEAN      -- User can toggle on/off (default: false)
```

Plus an index for fast chat ID lookups:
```sql
CREATE INDEX IF NOT EXISTS idx_users_telegram_chat_id ON users (telegram_chat_id)
  WHERE telegram_chat_id IS NOT NULL;
```

---

## Environment Variables

```env
TELEGRAM_BOT_TOKEN=your-telegram-bot-token   # From @BotFather
```

The bot must be set up via @BotFather with:
- `/setcommands` — register bot commands
- `/setprivacy` — set to **Disabled** (so the bot can see all messages in groups, needed for linking codes)

---

## Bot Webhook Setup

After deploying with `TELEGRAM_BOT_TOKEN` set, register the webhook with Telegram so it sends updates to your server:

```bash
curl "https://api.telegram.org/bot<YOUR_TOKEN>/setWebhook?url=https://<YOUR_DOMAIN>/api/telegram/webhook"
```

**Verify the webhook is registered:**
```bash
curl "https://api.telegram.org/bot<YOUR_TOKEN>/getWebhookInfo"
```

Expected response shows your webhook URL and `"pending_update_count": 0`.

**Webhook security note:** The `POST /api/telegram/webhook` endpoint has **no authentication middleware** — this is intentional. Telegram bot webhooks do not support custom headers or auth tokens. The endpoint only processes `message` updates and ignores all other update types. For production hardening, you can:
- Validate `req.body` is from Telegram by checking the IP range (`149.154.160.0/20` and `91.108.4.0/22`)
- Use a secret path segment in the webhook URL (e.g., `/api/telegram/webhook/<random>`)

---

## Startup Log Output

When the server starts, the Telegram integration status is logged:

```
🤖 Telegram bot integration: ENABLED (TELEGRAM_BOT_TOKEN found)
```
or
```
🤖 Telegram bot integration: DISABLED (no TELEGRAM_BOT_TOKEN in .env)
```

At the end of the startup banner:
```
🤖 Telegram bot: ✅ ENABLED
```
or
```
🤖 Telegram bot: ⚠️  DISABLED (set TELEGRAM_BOT_TOKEN in .env)
```

---

## How It Works

### 1. Linking Flow

```
User (Settings → Telegram)         Bot (Telegram)
         │                              │
         │  POST /api/telegram/link     │
         │  ─────────────────────►      │
         │  Returns 6-digit code        │
         │                              │
         │  User sends code to bot ────►│
         │                              │  handleBotMessage()
         │                              │  verifyLinkingCode()
         │                              │  Saves telegram_chat_id to DB
         │  ◄── Polls GET /status ──────│
         │  connected: true             │
         │  Shows ✅ confirmation        │
```

1. User clicks **Connect** in Settings → Notifications
2. Frontend calls `POST /api/telegram/link` → generates a 6-digit code (expires in 10 min)
3. User opens Telegram, finds `@PraqenAlertsBot`, sends the code
4. Bot webhook receives the message → `handleBotMessage()` → `verifyLinkingCode()`
5. Code is verified, `telegram_chat_id` is saved to the user's DB record
6. Frontend polls `GET /api/telegram/status` every 3 seconds, detects `connected: true`
7. Polling stops automatically; confirmation message sent directly to the user via `sendTelegramMessage()`

### 2. Alert Flow

When a trade event occurs, the trigger code calls:

```javascript
sendTelegramAlert(userId, "Message text here")
```

Inside `sendTelegramAlert()`:

```
1. Look up user in DB → get telegram_chat_id + telegram_notifications_enabled
2. If not connected or disabled → skip silently
3. Sanitize message (escape Markdown special chars)
4. Call sendTelegramMessage(chatId, sanitizedText)
```

Inside `sendTelegramMessage()`:

```
1. Rate limit: max 1 message per second per chat
2. Timeout: 20 seconds
3. Retry: 1 retry with 2-second delay on network failures (ECONNRESET, timeout)
4. POST to api.telegram.org/bot<TOKEN>/sendMessage
5. Log result (✅ sent or ❌ failed with attempt number)
```

### 3. Bot Commands

| Command | Behavior |
|---------|----------|
| `/start` | Welcome message with instructions |
| `/start <CODE>` | Link account using the 6-digit code |
| Any 6-digit number | Also treated as a linking code |
| `/stop` or `/disable` | Disable Telegram notifications |
| `/enable` | Re-enable Telegram notifications |

---

## TelegramCard UI States

The `TelegramCard` component in `Settings.js` renders one of three states:

### Not Connected (default)
- Teal-themed card with "Telegram Trade Alerts" heading
- Description: "Get instant trade alerts via Telegram — never miss a payment, release or dispute."
- **Connect Telegram** button → triggers linking flow

### Linking Code Shown
- Cyan-themed card with "Link Your Telegram" heading
- Large monospace display of the 6-digit code
- Step-by-step instructions:
  1. Open Telegram and search for **@PraqenAlertsBot**
  2. Send the displayed code
  3. Wait — auto-detection will confirm
- Spinning refresh icon with "Waiting for connection…" text
- **Polls `GET /api/telegram/status` every 3 seconds** — stops automatically when `connected: true`

### Connected
- Green-themed card with "Telegram Connected" heading
- Shows linked date and alert status ("alerts active" or "alerts paused")
- **Alerts Enabled** toggle switch
- **Disconnect Telegram** button (with confirmation dialog)

---

## Event Coverage — Where Telegram Alerts Are Triggered

| Event | Location | Recipient(s) |
|-------|----------|--------------|
| Trade opened | `server.js` trade creation route | Buyer + Seller |
| Trade opened | `tradeEscrowService.js` lockFundsInEscrow | Seller |
| Payment sent | `server.js` mark-paid route | Other party |
| Payment sent | `tradeEscrowService.js` markPaymentSent | Other party |
| BTC released / Trade complete | `tradeEscrowService.js` releaseFromEscrow | Buyer + Seller |
| Trade cancelled / Expired | `tradeEscrowService.js` cancelTrade | Buyer + Seller |
| Dispute opened | `server.js` dispute route | Buyer + Seller |
| Dispute resolved | `server.js` admin resolve route | Buyer + Seller |
| BTC deposit confirmed | `depositMonitor.js` | Depositor |
| USDT deposit confirmed | `usdtDepositMonitor.js` | Depositor |
| BTC incoming (pending) | `realtimeDepositService.js` | Depositor |
| Internal transfer sent | `server.js` internal-transfer route | Sender + Recipient |
| Internal transfer sent | `hdWalletRoutes.js` send route | Sender + Recipient |

All Telegram sends are **fire-and-forget** (`.catch(() => {})`) — a Telegram failure never blocks the trade/deposit action.

---

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/telegram/webhook` | None (Telegram) | Receives bot updates from Telegram |
| GET | `/api/telegram/status` | `verifyToken` | Get current user's connection status |
| POST | `/api/telegram/link` | `verifyToken` | Generate a 6-digit linking code |
| POST | `/api/telegram/toggle` | `verifyToken` | Enable/disable Telegram notifications |
| POST | `/api/telegram/disconnect` | `verifyToken` | Disconnect Telegram from account |

---

## Key Design Decisions

1. **Never throws**: `sendTelegramAlert()` wraps everything in try/catch and never rethrows. Telegram failures are logged but never interrupt the calling trade flow.

2. **Per-chat rate limiting**: 1 message/second per chat ID to respect Telegram API limits.

3. **Network retry**: Single retry (2s delay) on connection-level failures only. HTTP errors from Telegram (4xx/5xx) fail immediately without retry.

4. **Markdown sanitization**: Messages have special characters escaped to prevent Telegram's Markdown parser from breaking on malformed input.

5. **Silent skip for non-connected users**: If `telegram_chat_id` is null or `telegram_notifications_enabled` is false, the function logs a diagnostic line and returns — no error, no throw.

6. **6-second DB lookup timeout**: The user lookup in `sendTelegramAlert()` has a `Promise.race` timeout so a slow Supabase connection can't block the calling code path indefinitely.

7. **In-memory linking codes**: Stored in a `Map` with 10-minute expiry. Cleanup runs every 60 seconds. No DB table needed for temporary codes.

8. **Webhook always returns 200**: The webhook endpoint catches all errors and returns `{ ok: true }` — Telegram retries failed deliveries, so returning errors causes duplicate processing.

---

## Troubleshooting

### "Failed to save preferences" on Notifications tab
The notification routes were not mounted. Fixed by adding `app.use('/api/user', notificationRoutes)` in `server.js` and improving error logging in `notificationRoutes.js` to include the user ID in Supabase error messages.

### Telegram alerts not sent after linking
Two causes found and fixed:
1. **Missing calls**: Internal transfer flow had zero `sendTelegramAlert` calls — added them.
2. **DB lookup hanging**: Supabase connection instability caused the user lookup to hang forever — added a 6-second timeout.

### Intermittent "Connection was reset" from Telegram API
Network-level instability from the hosting machine to `api.telegram.org`. Mitigated by increasing timeout to 20s and adding a single retry with 2s delay.

### Bot not receiving messages from users
Ensure `/setprivacy` is set to **Disabled** via @BotFather. With privacy mode enabled, the bot only sees commands (messages starting with `/`) in groups — it won't receive plain 6-digit linking codes.

### Webhook not receiving updates
1. Verify the webhook is registered: `curl "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"`
2. Check the `last_error_date` and `last_error_message` fields in the response
3. Ensure your server is accessible from the internet (Telegram must reach your URL)
4. For HTTPS, ensure your certificate is valid — Telegram rejects self-signed certs

---

## Server Log Examples

**Successful send:**
```
[Telegram] sendTelegramAlert → looking up user a1b2c3d4...
[Telegram] Sending to chat 123456789 (attempt 1)...
[Telegram] Message sent to chat 123456789 (attempt 1 ✅)
[Telegram] sendTelegramAlert to a1b2c3d4: ✅ sent
```

**Network failure + retry:**
```
[Telegram] sendTelegramAlert → looking up user a1b2c3d4...
[Telegram] Sending to chat 123456789 (attempt 1)...
[Telegram] Failed to send to chat 123456789 (attempt 1): read ECONNRESET
[Telegram] Retrying in 2000ms...
[Telegram] Sending to chat 123456789 (attempt 2 (retry))...
[Telegram] Message sent to chat 123456789 (attempt 2 (retry) ✅)
[Telegram] sendTelegramAlert to a1b2c3d4: ✅ sent
```

**User not connected (skipped silently):**
```
[Telegram] sendTelegramAlert → looking up user a1b2c3d4...
[Telegram] Skipping alert to a1b2c3d4 — chat_id=null, enabled=null
```

**DB lookup timeout:**
```
[Telegram] sendTelegramAlert → looking up user a1b2c3d4...
[Telegram] DB lookup failed for user a1b2c3d4: Telegram DB lookup timed out
```

**Webhook received:**
```
[Telegram webhook] Linking code 123456 verified for user a1b2c3d4
```

**Startup:**
```
🤖 Telegram bot integration: ENABLED (TELEGRAM_BOT_TOKEN found)
...
🤖 Telegram bot: ✅ ENABLED
```
