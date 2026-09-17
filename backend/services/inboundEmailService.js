// backend/services/inboundEmailService.js
// Two-way email integration — INBOUND side.
//
// Converts emails arriving at the support address (e.g. hello@praqen.com) into
// support_tickets + support_messages rows so they appear in the Agent Dashboard
// queue exactly like chat-originated tickets, tagged channel = 'email'.
//
// The webhook route (POST /webhooks/inbound-email in server.js) accepts payloads
// from whichever inbound-email provider the team configures. This service is
// provider-agnostic: normalizeInboundPayload() maps each known provider's JSON
// shape into one canonical form:
//   { from, fromName, to, subject, text, html, messageId, inReplyTo, provider, receivedAt }
//
// Supported payload shapes:
//  - Resend Inbound Parse ("email received" webhook): { from, to, subject, text, html, ... }
//  - SendGrid Inbound Parse: { from/sender, to/recipient, subject, text/body-plain, ... }
//  - Mailgun Routes (store-and-forward, content-type json): { sender, recipient, subject, body-plain, ... }
//  - Postmark Inbound webhook: { From, To, Subject, TextBody, HtmlBody, ... }
//
// Threading: a reply is matched back to an existing ticket when either
//   1. the In-Reply-To header equals the Message-ID we stored on our last
//      outbound email for that ticket (support_tickets.inbound_email_ref), or
//   2. the subject contains the ticket ref we stamp on every outbound email
//      ("[PraQen #XXXXXXXX]", from sendTicketCreatedEmail/sendTicketReplyEmail),
//      or the body mentions a trade ID ("Trade ID: ..."), linking to the ticket
//      whose first message mentions the same trade ID.
// Otherwise a NEW ticket is created (as a general/unlinked ticket when the
// sender has no PraQen account).

const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const crypto = require('crypto');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

// Support addresses this webhook should accept mail for. All configured support
// domains are accepted when the list is unset (so local testing works before the
// team pins the production addresses down).
const SUPPORT_EMAILS = (process.env.SUPPORT_EMAIL || 'support@praqen.com,hello@praqen.com')
  .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

// ── Payload normalization ────────────────────────────────────────────────────
const pick = (obj, ...keys) => { for (const k of keys) if (obj?.[k] != null && obj[k] !== '') return obj[k]; return undefined; };
const asArray = (v) => Array.isArray(v) ? v : (v ? [v] : []);
const asString = (v) => {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'object') return v.email || v.address || v.raw || JSON.stringify(v); // Postmark/Resend sometimes give {Name, Address}
  return String(v);
};

// Extract the bare email address out of "Display Name <local@domain>" forms.
function extractEmail(raw) {
  const s = asString(raw).trim();
  if (!s) return '';
  const angle = s.match(/<([^>]+)>/);
  const candidate = (angle ? angle[1] : s).trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate) ? candidate : '';
}

function extractDisplayName(raw) {
  const s = asString(raw).trim();
  const m = s.match(/^"?([^"<]+?)"?\s*<[^>]+>$/);
  return m ? m[1].trim() : '';
}

function normalizeInboundPayload(body = {}) {
  // Postmark capitalizes keys; SendGrid/Mailgun use hyphenated keys. Cover all.
  const from = pick(body, 'from', 'From', 'sender', 'Sender');
  const to   = pick(body, 'to', 'To', 'recipient', 'Recipient', 'envelope_to');
  const subject = asString(pick(body, 'subject', 'Subject') || '');
  // Postmark exposes headers as a top-level object; some providers nest them.
  const headerMap = (body.Headers && typeof body.Headers === 'object' && !Array.isArray(body.Headers)) ? body.Headers : {};
  return {
    provider:   body.provider || body.Provider || (body.MessageStream !== undefined ? 'postmark' : 'generic'),
    from:       extractEmail(from),
    fromName:   extractDisplayName(from),
    to:         asArray(to).map(extractEmail).filter(Boolean)[0] || extractEmail(to),
    subject,
    text:       asString(pick(body, 'text', 'TextBody', 'body-plain', 'body_plain', 'plain', 'Text-part') || ''),
    html:       asString(pick(body, 'html', 'HtmlBody', 'body-html', 'body_html', 'Html-part') || ''),
    messageId:  asString(pick(body, 'messageId', 'MessageID', 'Message-Id', 'MessageId') || ''),
    inReplyTo:  asString(pick(body, 'inReplyTo', 'InReplyTo', 'In-Reply-To') || pick(headerMap, 'In-Reply-To', 'in-reply-to') || ''),
    receivedAt: pick(body, 'Date', 'date', 'receivedAt', 'Timestamp') || new Date().toISOString(),
  };
}

// ── Body cleanup ─────────────────────────────────────────────────────────────
// html2text-ish: strip tags, decode the handful of entities providers emit,
// collapse the block-quote whitespace. Keeps the ticket readable without a
// full DOM parser dependency.
function htmlToText(html) {
  return asString(html)
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim();
}

// Trim quoted reply history so the agent sees the user's new words, not the
// whole thread again (our own outbound template is appended under each reply by
// every mail client). Only cut when a marker actually exists — otherwise keep
// the full body (some clients quote with non-standard markers).
function stripQuotedReplies(text) {
  const lines = asString(text).split(/\r?\n/);
  const markers = [
    /^\s*-{2,5}\s*original message\s*-{2,5}\s*$/i,   // ---- Original Message ----
    /^\s*on .+ (wrote|said):$/i,                      // On 12 Sep 2026, you wrote:
    /^\s*-{2,}\s*forwarded message\s*-{2,}\s*$/i,     // ---- Forwarded message ----
    /^\s*from:\s.*$/i,                                // From: ...  (top-quote style)
    /^\s*_{5,}\s*$/,                                  // _____
  ];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    // Gmail-style "On <date>, <someone> <wrote>:" can span a line; "From:" only
    // counts when followed by a Subject:/To: line within the next 3 lines.
    if (/^\s*from:\s/i.test(trimmed)) {
      const look = lines.slice(i + 1, i + 4).map(l => l.trim().toLowerCase());
      if (!look.some(l => l.startsWith('subject:') || l.startsWith('to:'))) continue;
    }
    if (markers.some(re => re.test(trimmed))) {
      const body = lines.slice(0, i).join('\n').trim();
      if (body.length > 0) return body;
    }
  }
  return text.trim();
}

// ── Ref / trade-ID extraction ────────────────────────────────────────────────
// Outbound subject stamps look like "[PraQen #A1B2C3D4]" — 8 hex-ish chars.
function extractTicketRef(subject) {
  const m = asString(subject).match(/\[PraQen\s*#([0-9A-Fa-f]{6,12})\]/);
  return m ? m[1].toUpperCase() : null;
}

// "Trade ID: <uuid>", "Trade #<uuid>", or a bare UUID after a trade mention —
// the same "Trade ID:" line users copy from the trade screen.
function extractTradeId(text) {
  const t = asString(text);
  const m = t.match(/trade\s*(?:id|ref(?:erence)?)?\s*[:#]\s*([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i)
        || t.match(/\b([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/i);
  return m ? m[1].toLowerCase() : null;
}

// ── Ticket resolution ────────────────────────────────────────────────────────
async function resolveTicketId({ inReplyTo, subject, text }) {
  // 1. Exact thread match: our last outbound Message-ID for a ticket.
  if (inReplyTo) {
    const { data } = await supabase.from('support_tickets')
      .select('id').eq('inbound_email_ref', String(inReplyTo).trim().replace(/^<|>$/g, ''))
      .maybeSingle();
    if (data?.id) return { ticketId: data.id, matchedBy: 'in_reply_to' };
  }

  // 2. Subject ref stamp ([PraQen #XXXXXXXX]) — matches the short id the
  //    dashboards display. Same-prefix tickets are unlikely enough at current
  //    volume; newest wins if there are several.
  const ref = extractTicketRef(subject);
  if (ref) {
    const { data } = await supabase.from('support_tickets')
      .select('id, subject, created_at')
      .order('created_at', { ascending: false }).limit(200);
    const hit = (data || []).find(t => String(t.id).replace(/-/g, '').slice(0, 8).toUpperCase() === ref);
    if (hit) return { ticketId: hit.id, matchedBy: 'subject_ref' };
  }

  // 3. Trade-ID mention in the body → newest ticket whose subject/message
  //    carries the same trade id, else the trade's buyer/seller's newest ticket.
  const tradeId = extractTradeId(text);
  if (tradeId) {
    const short = tradeId.replace(/-/g, '').slice(0, 8).toUpperCase();
    const { data: tickets } = await supabase.from('support_tickets')
      .select('id, user_id, created_at, support_messages(message)')
      .order('created_at', { ascending: false }).limit(100);
    const withMsg = (tickets || []).find(t =>
      String(t.subject || '').includes(short) ||
      (t.support_messages || []).some(m => String(m.message || '').includes(short))
    );
    if (withMsg) return { ticketId: withMsg.id, matchedBy: 'trade_id' };

    const { data: trade } = await supabase.from('trades')
      .select('buyer_id, seller_id').eq('id', tradeId).maybeSingle();
    if (trade) {
      const { data: userTicket } = await supabase.from('support_tickets')
        .select('id').in('user_id', [trade.buyer_id, trade.seller_id].filter(Boolean))
        .order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (userTicket?.id) return { ticketId: userTicket.id, matchedBy: 'trade_owner' };
    }
  }

  return { ticketId: null, matchedBy: null };
}

// Insert that tolerates schema drift: if PostgREST reports a missing column
// ("Could not find the 'x' column of '<table>' in the schema cache" — i.e. an
// environment where the email-channel migration hasn't run yet), drop the
// unsupported fields and retry so the email still becomes a ticket. Constraint
// violations and other errors are returned untouched.
async function insertTolerant(table, payload) {
  let p = { ...payload };
  for (;;) {
    const { data, error } = await supabase.from(table).insert(p).select().single();
    if (!error) return { data, error: null };
    const m = /could not find the '([^']+)\' column/i.exec(error.message || '');
    const col = m && m[1];
    if (!col || !(col in p)) return { data: null, error };
    delete p[col];
  }
}

async function findUserByEmail(email) {
  if (!email) return null;
  const { data } = await supabase.from('users').select('id, email, username, full_name').eq('email', email).maybeSingle();
  return data || null;
}

// ── Main entry point ─────────────────────────────────────────────────────────
// Returns { action, ticket, message, matchedBy, deduped } for logging/metrics.
async function processInboundEmail(rawBody = {}) {
  const email = normalizeInboundPayload(rawBody);

  if (!email.from) throw new Error('Inbound email payload missing a parseable sender address');
  if (!email.subject && !email.text && !email.html) throw new Error('Inbound email payload missing subject and body');

  // Guard: only process mail addressed to a configured support address (when
  // SUPPORT_EMAIL is explicitly set). Providers also filter at route level.
  if (email.to && SUPPORT_EMAILS.length > 0 && !SUPPORT_EMAILS.includes(email.to)) {
    const err = new Error(`Recipient ${email.to} is not a support address — ignoring`);
    err.status = 202; // 202 so the provider doesn't retry a mail we intentionally dropped
    throw err;
  }

  // Idempotency: providers retry on non-2xx, and both Resend and SendGrid may
  // deliver twice on network hiccups. A unique ref makes replays no-ops.
  const dedupeKey = email.messageId ? `email:${email.messageId}` : null;
  if (dedupeKey) {
    const { data: existing } = await supabase.from('support_messages')
      .select('id').eq('email_message_id', dedupeKey).maybeSingle();
    if (existing) return { action: 'deduped', message: existing, deduped: true };
  }

  const bodyText = email.text && email.text.trim()
    ? email.text
    : htmlToText(email.html);
  const cleanBody = stripQuotedReplies(bodyText);
  const displayBody = cleanBody || (email.subject ? `(no body) ${email.subject}` : '(empty email)');

  const { ticketId, matchedBy } = await resolveTicketId(email);
  const sender = await findUserByEmail(email.from);

  let ticket;
  let isNew = false;

  if (ticketId) {
    const { data } = await supabase.from('support_tickets').select('*').eq('id', ticketId).single();
    ticket = data;
  }

  if (!ticket) {
    // New ticket. Requires a user row (support_tickets.user_id is NOT NULL) —
    // create a ghost account for unknown senders so the address can be replied
    // to from the dashboard and future emails thread onto the same account.
    let userId = sender?.id;
    if (!userId) {
      // username is UNIQUE in users — suffix it so two different senders with the
      // same local-part (john@a.com and john@b.com) don't collide on insert.
      const base = (email.fromName || email.from.split('@')[0] || 'email-user')
        .toLowerCase().replace(/[^a-z0-9_.-]/g, '').replace(/^[-.]+|[-.]+$/g, '').slice(0, 40) || 'email-user';
      const username = `${base}-${crypto.randomBytes(3).toString('hex')}`;
      const { data: ghost, error: ghostErr } = await supabase.from('users')
        .insert({
          email: email.from,
          username,
          full_name: email.fromName || null,
          password_hash: `email-inbound:${crypto.randomBytes(24).toString('hex')}`, // unloggable
          is_email_verified: false,
        })
        .select('id')
        .single();
      if (ghostErr) throw new Error(`Could not create ghost user for ${email.from}: ${ghostErr.message}`);
      userId = ghost.id;
    }
    const { data: created, error: createErr } = await insertTolerant('support_tickets', {
      user_id: userId,
      subject: email.subject || `(no subject) — email from ${email.from}`,
      category: 'general',
      status: 'open',
      channel: 'email',
    });
    if (createErr) throw new Error(`Ticket creation failed: ${createErr.message}`);
    ticket = created;
    isNew = true;
    // Remember email-channel status in-process (see registry note above) —
    // pre-migration, PostgREST drops the channel column on insert.
    registerEmailChannelTicket(ticket.id);
  }

  // Store the sender email on the message so an agent can always reply even if
  // the user row is a ghost; message row carries the inbound Message-ID.
  const { data: msg, error: msgErr } = await insertTolerant('support_messages', {
    ticket_id: ticket.id,
    sender_id: sender?.id || ticket.user_id,
    is_admin: false,
    message: displayBody,
    channel: 'email',
    user_email: sender?.email || email.from,
    email_message_id: dedupeKey,
  });
  if (msgErr) throw new Error(`Message insert failed: ${msgErr.message}`);

  // Touch the ticket (new activity + thread bookkeeping). Tolerates the
  // channel/inbound_email_ref columns not existing yet (pre-migration):
  // PostgREST rejects the WHOLE update on an unknown column, so on that
  // specific error we retry without the email bookkeeping keys.
  const updatePayload = {
    updated_at: new Date().toISOString(),
    status: ticket.status === 'resolved' || ticket.status === 'closed' ? 'open' : (ticket.status || 'open'),
  };
  if (email.messageId) updatePayload.inbound_email_ref = email.messageId;
  if (!isNew && !ticket.channel) updatePayload.channel = 'email';
  {
    let { error: upErr } = await supabase.from('support_tickets').update(updatePayload).eq('id', ticket.id);
    if (upErr && /could not find the '(channel|inbound_email_ref)' column/i.test(upErr.message || '')) {
      const basePayload = { updated_at: updatePayload.updated_at, status: updatePayload.status };
      ({ error: upErr } = await supabase.from('support_tickets').update(basePayload).eq('id', ticket.id));
    }
  }

  console.log(`[InboundEmail] ${isNew ? 'Created' : 'Appended to'} ticket ${ticket.id} (${matchedBy || 'new'}) from ${email.from} via ${email.provider}`);

  return { action: isNew ? 'created' : 'appended', ticket, message: msg, matchedBy, deduped: false };
}

// ── In-memory email-channel registry (pre-migration bridge) ──────────────────
// The live database does not yet have support_tickets.channel (the migration in
// database/2026-09-11_email_channel_support.sql is pending — no execute_sql RPC
// or CLI available to apply it). Until it runs, PostgREST silently drops the
// channel field, so form-created tickets come back untagged and the reply
// endpoints' channel gate never fires. This registry keeps the email-channel
// flag for tickets created through the email/form flow while process is up.
// Once the migration is applied, DB rows carry channel='email' persistently and
// the registry simply becomes a redundant second source of truth (harmless).
// Same trade-off as the existing in-memory agentStatusStore: single-process.
const emailChannelRegistry = new Set();

function registerEmailChannelTicket(ticketId) {
  if (ticketId) emailChannelRegistry.add(String(ticketId));
}

function unregisterEmailChannelTicket(ticketId) {
  if (ticketId) emailChannelRegistry.delete(String(ticketId));
}

function isEmailChannelTicket(ticket) {
  if (!ticket) return false;
  if (String(ticket.channel || '').toLowerCase() === 'email') return true;
  return emailChannelRegistry.has(String(ticket.id));
}

module.exports = {
  processInboundEmail,
  normalizeInboundPayload,
  extractEmail,
  extractTicketRef,
  extractTradeId,
  stripQuotedReplies,
  isEmailChannelTicket,
  registerEmailChannelTicket,
  unregisterEmailChannelTicket,
  htmlToText,
  SUPPORT_EMAILS,
};
