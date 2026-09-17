# Two-Way Email Integration — Setup Notes

Date: 2026-09-11
Feature: support emails ↔ Agent Dashboard tickets (inbound + outbound)
Updated: form-based ticket creation + **email-only follow-up** (no in-app chat)

## Flow overview (current)

1. User opens the Support panel → sees a **form** (issue type + description +
   optional Trade/Reference ID) — not a live chat.
2. On submit → ticket created (`channel='email'`), unique Ticket ID generated,
   user sees an on-screen confirmation.
3. No automatic confirmation email is sent on ticket creation. The user does
   not receive an email until an agent sends the first reply.
4. **All follow-up is email-only**: user replies to the email thread; agent
   replies from the Agent Dashboard go out as real emails. There is no in-app
   chat option for these tickets.

## What was built (code side)

| Part | Where |
|---|---|
| Support form (issue type + description + optional Trade ID, no chat UI) | `frontend/src/components/SuggestionsPanel.js` (rewritten) |
| Form ticket creation (`channel='email'`) + confirmation email + outbound Message-ID threading | `POST /api/support/tickets` in `backend/server.js` |
| Inbound email → ticket/message | `backend/services/inboundEmailService.js` + `POST /webhooks/inbound-email` in `backend/server.js` |
| Agent reply → real email (email-channel tickets only) | `POST /api/agent/tickets/:id/reply` in `backend/server.js` → `sendTicketReplyEmail` in `backend/services/emailService.js` |
| No chat intro messages on email tickets (accept / assign-agent) | `backend/server.js` |
| "via Email" badges + email-sender display in queue/chat | `frontend/src/pages/AgentDashboard.js` |
| DB columns (channel, inbound_email_ref, email_message_id, user_email, department, priority, trade_reference) | `database/2026-09-11_email_channel_support.sql` |

Outbound email **reuses the existing provider stack** — `emailService.sendEmail()`
(Resend API primary → Brevo SMTP fallback, logged to `email_logs` as
`ticket_created` / `ticket_reply`). No new email provider was introduced.

## Team-lead flags (current flow)

1. **No confirmation email on ticket creation** — the form-created ticket is
   silent from the user's perspective. The first email the user receives is the
   first agent reply from the dashboard.
2. **Legacy chat tickets** — tickets created before this change keep
   `channel='chat'` and keep the old in-app chat behavior. Only the new form
   flow is email-only. No chat-based creation path remains in the user UI.

## Required setup steps OUTSIDE the codebase (team action needed)

### 1. Run the SQL migration — ⚠️ P0 BLOCKER (2026-09-11)

**This migration has NOT been applied to the production Supabase project
(`hpkepzxvrumijmdvwaje`). Verified via PostgREST probe: `column
support_tickets.channel does not exist`. Until it runs, the ticket-creation
form fails with `Could not find the 'channel' column of 'support_tickets' in
the schema cache`.**

DDL cannot be applied from the app host (no `execute_sql` RPC, no Supabase
CLI/management token), so someone with Supabase dashboard access must run
`database/2026-09-11_email_channel_support.sql` in the SQL Editor. It is
idempotent and additive-only — safe to run on any environment.

A helper that attempts the same DDL via RPC and verifies the columns
afterwards exists at
`backend/scripts/_ro_apply_email_channel_migration_2026-09-11.js`
(run `node backend/scripts/_ro_apply_email_channel_migration_2026-09-11.js`
from the repo root; it exits with instructions if the RPC is unavailable —
which is the current state).

**Degraded mode until the migration runs:** ticket creation, message inserts,
agent/admin replies and the inbound webhook all detect the PostgREST
missing-column error and retry without the email-channel fields. Tickets are
created successfully and **remain fully functional email-only tickets** via an
in-process registry (`inboundEmailService.isEmailChannelTicket`): tickets
created through the form/webhook while the process is up are remembered as
email-channel, so agent replies go out as real emails, chat intros are skipped
and "via Email" badges render. Caveats of the bridge: it is **per-process**
(restarting the backend loses the tag for tickets created since boot — the
migration removes this caveat entirely) and the confirmation email's stored
thread Message-ID cannot persist (`inbound_email_ref` missing), so user replies
to confirmation emails may not thread until the migration is applied.

The webhook additionally requires `channel` on `support_tickets` and `channel`,
`user_email`, `email_message_id` on `support_messages` to write correctly.

### 2. Inbound receiving — provider configuration (INFRA STEP, needs team)

The backend endpoint is provider-agnostic. Recommended: **Resend Inbound Parse**
(same provider already sending production email; no new account).

- In the Resend dashboard → the verified `praqen.com` domain → add an
  **Inbound Parse** address (e.g. `hello@praqen.com` / `support@praqen.com`).
- Resend will display **MX records that must be added to the praqen.com DNS**:
  typically `mx.send.email.foo.resend.dev` style host at priority 10 for the
  subdomain/host receiving mail. **Do not guess the exact values here — copy
  them from the Resend dashboard at setup time.**
  ⚠️ If praqen.com already runs mail on the apex domain (e.g. Google Workspace),
  put inbound-parse MX records on a subdomain or a specific hostname only —
  do not break existing mail delivery.
- Point the webhook at: `https://<backend-host>/webhooks/inbound-email`
  with secret header `Authorization: Bearer <INBOUND_EMAIL_WEBHOOK_SECRET>`.

Alternatives the endpoint also accepts (if the team prefers): Postmark
Inbound webhook (JSON) works as-is; SendGrid Inbound Parse and Mailgun Routes
post **multipart/form-data** by default — either configure their JSON
options (SendGrid: check the JSON option on the webhook; Mailgun: set the
route forward's content-type to JSON) or add a multipart parser (e.g.
`multer`) to the route. All JSON payload shapes are normalized in
`normalizeInboundPayload()`.

### 3. Environment variables (backend `.env`)

```bash
# Inbound webhook shared secret (sent as Authorization: Bearer <secret>)
INBOUND_EMAIL_WEBHOOK_SECRET=<generate e.g. openssl rand -hex 32>

# Addresses the webhook accepts mail for (comma-separated)
SUPPORT_EMAIL=hello@praqen.com,support@praqen.com
```

Outbound already works with existing `RESEND_API_KEY` + `RESEND_FROM`
(falls back to `SMTP_*` Brevo). Confirm `RESEND_FROM` is an address on the
verified domain — replies-users-send must land at the support inbox.

### 4. From-address / reply-to plumbing

- Outbound ticket emails are sent from the configured support address so the
  user's mail-client "Reply" targets the support inbox (threading back through
  the webhook). Verify `RESEND_FROM`/`SMTP_FROM` show as
  `support@praqen.com` (or `hello@praqen.com`), **not** `noreply@`.
- The subject line stamped on every outbound ticket email
  (`[PraQen #XXXXXXXX] ...`) is the primary thread key when users reply —
  the webhook matches on In-Reply-To first, then this ref, then "Trade ID:"
  mentions in the body.

## How threading/dedup works (for future maintainers)

1. Outbound confirmation/reply email → subject contains `[PraQen #XXXXXXXX]`;
   the provider Message-ID is stored on the ticket as `inbound_email_ref`.
2. User replies → provider POSTs to `/webhooks/inbound-email` →
   `processInboundEmail()` matches ticket by In-Reply-To → subject ref →
   "Trade ID:" mention → else creates a new ticket (ghost user for unknown
   senders; `users.password_hash` is set to an unloggable `email-inbound:*`
   value).
3. Every inbound message stores `email_message_id` (unique) — provider retries
   are no-ops.
4. Agents see these tickets with a "via Email" badge; replying triggers an
   actual email to the user. Chat tickets behave exactly as before.

## Testing checklist (dev)

- [ ] Local: POST a Postmark/Resend-shaped JSON to
      `http://localhost:5000/webhooks/inbound-email` with a test secret →
      ticket appears in Agent Dashboard with "via Email" badge.
- [ ] Re-POST the same payload → `deduped: true`, no duplicate message.
- [ ] Reply to a real outbound confirmation email from a mail client →
      message appends to the same ticket.
- [ ] Create an in-app ticket → confirmation email arrives at user's inbox.
- [ ] Agent replies to the email ticket → real email lands in user's inbox.
