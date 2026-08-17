// backend/services/emailService.js
// PRAQEN Complete Email Notification Service
// Primary: Brevo SMTP  |  Logged to: email_logs table
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const nodemailer = require('nodemailer');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

// EMAIL_USER is the Gmail credential used by the separate deposit-alert transporter in
// depositMonitor.js (a personal Gmail address, e.g. the dev's own inbox) — it was being used
// here as a fallback "From" address too. Sending "from" a Gmail address through Brevo's relay
// isn't a domain Brevo can authenticate on this account, so Brevo silently rewrote the visible
// sender to <local-part>@<account-id>.brevosend.com to stay DMARC-compliant — which is exactly
// the "kendevdash@11171618.brevosend.com" users were seeing instead of a praqen.com address.
// Never fall back to EMAIL_USER here; only SMTP_FROM (if explicitly set for this purpose) or
// the praqen.com default.
const FROM_ADDRESS = `PRAQEN <${process.env.SMTP_FROM || 'noreply@praqen.com'}>`;

// Pooled, reused connection — nodemailer's defaults (no pooling, connectionTimeout
// 2min, socketTimeout 10min) meant every single email paid a fresh TCP+TLS
// handshake, and a slow/stuck Brevo connection could stall a request for minutes
// before anything failed over to Resend. Short explicit timeouts here mean a bad
// connection fails fast into the fallback instead of hanging the caller.
let _transporter = null;
function getTransporter() {
  if (_transporter) return _transporter;
  _transporter = nodemailer.createTransport({
    host:   process.env.SMTP_HOST || 'smtp-relay.brevo.com',
    port:   parseInt(process.env.SMTP_PORT || '587', 10),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    tls: { rejectUnauthorized: false },
    pool: true,
    maxConnections: 5,
    maxMessages: 200,
    connectionTimeout: 5000,
    greetingTimeout: 5000,
    socketTimeout: 10000,
  });
  return _transporter;
}

// ── Logging ──────────────────────────────────────────────────────────────────
async function logEmail({ userId, email, subject, type, status, messageId, errorMessage, metadata }) {
  try {
    await supabase.from('email_logs').insert({
      user_id:       userId || null,
      email,
      subject,
      type,
      status,
      message_id:    messageId    || null,
      error_message: errorMessage || null,
      metadata:      metadata     || null,
      sent_at:       status === 'sent' ? new Date().toISOString() : null,
    });
  } catch (e) {
    console.error('[EmailLog] DB log failed:', e.message);
  }
}

// ── Core send — tries Brevo SMTP first, falls back to Resend API ──────────────
// The DB log write is intentionally not awaited — it's a fire-and-forget audit
// trail with its own internal try/catch, so it should never add its own
// round-trip to a caller waiting on the actual send result.
async function sendEmail({ userId, to, subject, html, text, type, metadata }) {
  // ── Attempt 1: Brevo SMTP ────────────────────────────────────────────────
  if (process.env.SMTP_USER && process.env.SMTP_PASS) {
    try {
      const transporter = getTransporter();
      // Pooled connections (pool:true, maxConnections:5) can occasionally end up in a
      // half-dead state on a long-running process — the remote end closed it but
      // nodemailer hasn't noticed yet — where nodemailer's own connectionTimeout /
      // socketTimeout don't reliably kick in because a connection was already
      // established. A caller-side timeout guarantees this always falls through to
      // the Resend fallback within a bounded time instead of the promise never
      // settling, which would otherwise strand a fire-and-forget send (e.g.
      // forgot-password) with no visible failure to the user or the logs.
      const info = await Promise.race([
        transporter.sendMail({ from: FROM_ADDRESS, to, subject, html, text: text || '' }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('SMTP send timed out after 15s')), 15000)),
      ]);
      console.log(`[Email] ✅ Brevo SMTP ${type} → ${to} (${info.messageId})`);
      logEmail({ userId, email: to, subject, type, status: 'sent', messageId: info.messageId, metadata });
      return { success: true, messageId: info.messageId };
    } catch (smtpErr) {
      console.error(`[Email] ⚠️ Brevo SMTP failed for ${type} → ${to}: ${smtpErr.message} — trying Resend fallback`);
      // A stuck/broken pooled connection stays stuck for every subsequent send —
      // drop it so the next attempt (this fallback's Resend call doesn't reuse it,
      // but the *next* sendEmail() call otherwise would) opens a fresh one instead
      // of retrying the same bad socket.
      if (_transporter) { try { _transporter.close(); } catch (_) {} _transporter = null; }
    }
  } else {
    console.warn(`[Email] Brevo SMTP not configured — skipping to Resend for ${type} → ${to}`);
  }

  // ── Attempt 2: Resend API fallback ───────────────────────────────────────
  const resendKey  = process.env.RESEND_API_KEY;
  const resendFrom = process.env.RESEND_FROM || 'PRAQEN <onboarding@resend.dev>';
  if (resendKey) {
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method:  'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: resendFrom, to, subject, html }),
        signal:  AbortSignal.timeout(8000),
      });
      const data = await response.json();
      if (data.id) {
        console.log(`[Email] ✅ Resend fallback ${type} → ${to} (${data.id})`);
        logEmail({ userId, email: to, subject, type, status: 'sent', messageId: data.id, metadata });
        return { success: true, messageId: data.id };
      }
      throw new Error(JSON.stringify(data));
    } catch (resendErr) {
      console.error(`[Email] ❌ Resend fallback also failed for ${type} → ${to}: ${resendErr.message}`);
      logEmail({ userId, email: to, subject, type, status: 'failed', errorMessage: `SMTP: failed, Resend: ${resendErr.message}`, metadata });
      return { success: false, error: resendErr.message };
    }
  }

  // ── Both providers unconfigured ──────────────────────────────────────────
  console.error(`[Email] ❌ No email provider configured — cannot send ${type} → ${to}`);
  logEmail({ userId, email: to, subject, type, status: 'failed', errorMessage: 'No provider configured', metadata });
  return { success: false, error: 'No email provider configured' };
}

// ── Base HTML template ────────────────────────────────────────────────────────
function base(title, body) {
  const yr = new Date().getFullYear();
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#F0FAF5;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F0FAF5;padding:32px 0;">
    <tr><td align="center">
      <table width="540" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(16,185,129,0.10);">
        <!-- HEADER -->
        <tr><td style="background:linear-gradient(135deg,#10b981 0%,#059669 100%);padding:32px 40px;text-align:center;">
          <a href="https://praqen.com" style="text-decoration:none;">
            <div style="display:inline-block;width:56px;height:56px;background:#fff;border-radius:14px;line-height:56px;text-align:center;">
              <img src="https://praqen.com/logo512.png" width="40" height="40" alt="PRAQEN" style="vertical-align:middle;border-radius:8px;">
            </div>
            <p style="margin:12px 0 0;color:#fff;font-size:22px;font-weight:900;letter-spacing:3px;">PRAQEN</p>
          </a>
          <p style="margin:4px 0 0;color:rgba(255,255,255,0.75);font-size:12px;letter-spacing:1px;">The World's Most Trusted Bitcoin Marketplace</p>
        </td></tr>
        <!-- BODY -->
        <tr><td style="padding:36px 40px 28px;">${body}</td></tr>
        <!-- FOOTER -->
        <tr><td style="background:#F8FAFC;padding:24px 40px;text-align:center;border-top:1px solid #E2E8F0;">
          <p style="margin:0 0 12px;">
            <a href="https://x.com/praqenapp?s=21" style="color:#64748B;text-decoration:none;font-size:11px;font-weight:700;margin:0 8px;">X / Twitter</a>
            <a href="https://www.instagram.com/praqen?igsh=MTRkZWg2amp5YnJlYQ%3D%3D&amp;utm_source=qr" style="color:#64748B;text-decoration:none;font-size:11px;font-weight:700;margin:0 8px;">Instagram</a>
            <a href="https://www.linkedin.com/in/pra-qen-045373402/" style="color:#64748B;text-decoration:none;font-size:11px;font-weight:700;margin:0 8px;">LinkedIn</a>
          </p>
          <p style="margin:0 0 4px;font-size:12px;color:#94A3B8;">Need help? <a href="mailto:support@praqen.com" style="color:#10b981;font-weight:700;">support@praqen.com</a> · <a href="https://praqen.com" style="color:#10b981;font-weight:700;">praqen.com</a></p>
          <p style="margin:0;font-size:11px;color:#CBD5E1;">© ${yr} PRAQEN · The World's Most Trusted P2P Bitcoin Marketplace</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function infoRow(label, value) {
  return `<tr>
    <td style="padding:7px 0;color:#64748B;font-size:13px;font-weight:600;">${label}</td>
    <td style="padding:7px 0;color:#1B4332;font-size:13px;text-align:right;">${value}</td>
  </tr>`;
}

function infoBox(rows) {
  return `<div style="background:#F0FAF5;border-radius:10px;padding:20px;margin-bottom:20px;">
    <table width="100%" style="border-collapse:collapse;">${rows}</table>
  </div>`;
}

function ctaButton(text, url) {
  return `<div style="text-align:center;margin:24px 0;">
    <a href="${url}" style="display:inline-block;background:linear-gradient(135deg,#10b981,#059669);color:#fff;text-decoration:none;font-size:15px;font-weight:700;padding:14px 36px;border-radius:10px;">${text}</a>
  </div>`;
}

function warningBox(msg) {
  return `<div style="background:#FEF3C7;border:1px solid #FDE68A;border-radius:8px;padding:12px 16px;text-align:center;">
    <p style="margin:0;font-size:12px;font-weight:700;color:#92400E;">${msg}</p>
  </div>`;
}

// ── Email HTML builders ───────────────────────────────────────────────────────

function welcomeHtml(name) {
  return base('Welcome to PRAQEN!', `
    <h2 style="color:#10b981;font-size:22px;margin:0 0 8px;">Welcome, ${name}! 🎉</h2>
    <p style="color:#475569;font-size:14px;line-height:1.7;margin:0 0 20px;">You've joined <strong>the world's most trusted P2P Bitcoin marketplace</strong>. Your account is ready!</p>
    <div style="background:#F0FAF5;border-left:4px solid #10b981;padding:16px 20px;border-radius:8px;margin-bottom:24px;">
      <p style="margin:0 0 8px;font-weight:700;color:#1B4332;">✅ Your next steps:</p>
      <ul style="margin:0;padding-left:20px;color:#475569;font-size:14px;line-height:1.9;">
        <li>Verify your email address</li>
        <li>Verify your phone number</li>
        <li>Complete KYC to unlock full trading</li>
        <li>Load your wallet and start trading!</li>
      </ul>
    </div>
    ${ctaButton('🚀 Start Trading Now', 'https://praqen.com/buy-bitcoin')}
    ${warningBox('⚠️ Always trade within PRAQEN — never share your login credentials')}
  `);
}

function verificationHtml(code) {
  return base('Your PRAQEN Verification Code', `
    <p style="margin:0 0 8px;font-size:16px;font-weight:600;color:#334155;text-align:center;">Your Verification Code</p>
    <p style="margin:0 0 28px;font-size:13px;color:#64748B;line-height:1.6;text-align:center;">Use the code below to verify your account. It expires in <strong>10 minutes</strong>.</p>
    <div style="text-align:center;margin-bottom:28px;">
      <div style="display:inline-block;background:#F0FAF5;border:2px solid #10b981;border-radius:12px;padding:20px 48px;">
        <span style="font-size:42px;font-weight:900;letter-spacing:10px;color:#059669;font-family:'Courier New',monospace;">${code}</span>
      </div>
    </div>
    <p style="margin:0;font-size:12px;color:#94A3B8;text-align:center;">If you didn't request this, you can safely ignore this email. Never share this code with anyone — PRAQEN will never ask for it.</p>
  `);
}

function loginAlertHtml(name, loginTime) {
  return base('New Login to Your PRAQEN Account', `
    <h2 style="color:#10b981;font-size:20px;margin:0 0 8px;">New Login Detected 🔐</h2>
    <p style="color:#475569;font-size:14px;line-height:1.7;margin:0 0 20px;">Hello <strong>${name}</strong>, a login was recorded on your account.</p>
    ${infoBox(
      infoRow('Time', loginTime || new Date().toUTCString()) +
      infoRow('Method', 'Email &amp; Password')
    )}
    <div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;padding:12px 16px;">
      <p style="margin:0;font-size:13px;color:#991b1b;"><strong>⚠️ Not you?</strong> Change your password immediately at <a href="https://praqen.com/settings" style="color:#b45309;font-weight:700;">Settings → Security</a></p>
    </div>
  `);
}

function kycApprovedHtml(name) {
  return base('KYC Approved — Full Access Unlocked!', `
    <div style="text-align:center;margin-bottom:20px;">
      <div style="font-size:48px;">✅</div>
      <h2 style="color:#10b981;font-size:22px;margin:8px 0;">KYC Approved!</h2>
    </div>
    <p style="color:#475569;font-size:14px;line-height:1.7;margin:0 0 20px;">Congratulations <strong>${name}</strong>! Your identity has been verified. You now have full access to all PRAQEN features.</p>
    <div style="background:#F0FAF5;border-left:4px solid #10b981;padding:16px 20px;border-radius:8px;margin-bottom:24px;">
      <p style="margin:0 0 8px;font-weight:700;color:#1B4332;">🔓 Now Unlocked:</p>
      <ul style="margin:0;padding-left:20px;color:#475569;font-size:14px;line-height:1.9;">
        <li>Full market access — buy &amp; sell without limits</li>
        <li>Your verified badge on all offers</li>
        <li>Level 3 trading privileges</li>
        <li>Higher trade volume limits</li>
      </ul>
    </div>
    ${ctaButton('🚀 Start Trading Now', 'https://praqen.com/buy-bitcoin')}
  `);
}

function kycRejectedHtml(name, reason) {
  return base('KYC Verification — Action Required', `
    <div style="text-align:center;margin-bottom:20px;">
      <div style="font-size:48px;">❌</div>
      <h2 style="color:#ef4444;font-size:22px;margin:8px 0;">KYC Not Approved</h2>
    </div>
    <p style="color:#475569;font-size:14px;line-height:1.7;margin:0 0 20px;">Hello <strong>${name}</strong>, unfortunately your KYC submission was not approved.</p>
    <div style="background:#FEF2F2;border-left:4px solid #ef4444;padding:16px 20px;border-radius:8px;margin-bottom:20px;">
      <p style="margin:0 0 4px;font-weight:700;color:#991b1b;">Reason:</p>
      <p style="margin:0;color:#7f1d1d;font-size:14px;">${reason || 'Documents were unclear or could not be verified.'}</p>
    </div>
    <p style="color:#475569;font-size:14px;line-height:1.7;margin:0 0 20px;">Please re-submit with clearer documents. Accepted: National ID, Passport, Driver's License.</p>
    ${ctaButton('Re-submit KYC →', 'https://praqen.com/settings')}
  `);
}

function tradeConfirmationHtml(name, trade, role) {
  const isBuyer = role === 'buyer';
  const headline = isBuyer ? '💰 Trade Complete — BTC Received!' : '✅ Trade Complete — Payment Confirmed!';
  const detail = isBuyer
    ? `<strong>${parseFloat(trade.amount_btc || 0).toFixed(8)} BTC</strong> has been released to your PRAQEN wallet.`
    : `Payment has been confirmed. Your trade is now complete.`;

  const amountUsd = trade.amount_usd ? `<tr><td style="padding:7px 0;color:#64748B;font-size:13px;font-weight:600;">Value (USD)</td><td style="padding:7px 0;color:#1B4332;font-size:13px;text-align:right;">$${parseFloat(trade.amount_usd || 0).toFixed(2)}</td></tr>` : '';

  return base(headline, `
    <h2 style="color:#10b981;font-size:20px;margin:0 0 8px;">${headline}</h2>
    <p style="color:#475569;font-size:14px;line-height:1.7;margin:0 0 20px;">Hello <strong>${name}</strong>! ${detail}</p>
    ${infoBox(`
      <tr><td style="padding:7px 0;color:#64748B;font-size:13px;font-weight:600;">Trade Ref</td><td style="padding:7px 0;text-align:right;"><span style="background:#10b981;color:#fff;font-size:11px;font-weight:700;padding:3px 10px;border-radius:6px;">#${(trade.trade_ref || trade.id || '').toString().slice(0, 8).toUpperCase()}</span></td></tr>
      <tr><td style="padding:7px 0;color:#64748B;font-size:13px;font-weight:600;">Amount (BTC)</td><td style="padding:7px 0;color:#059669;font-size:18px;font-weight:900;text-align:right;">₿ ${parseFloat(trade.amount_btc || 0).toFixed(8)}</td></tr>
      ${amountUsd}
      <tr><td style="padding:7px 0;color:#64748B;font-size:13px;font-weight:600;">Your Role</td><td style="padding:7px 0;color:#1B4332;font-size:13px;text-align:right;text-transform:capitalize;">${role}</td></tr>
    `)}
    ${ctaButton('View Trade Details', `https://praqen.com/trade/${trade.id}`)}
    ${warningBox('🔒 PRAQEN escrow protected every step of this trade')}
  `);
}

function depositAlertHtml(name, amountBtc, txHash) {
  const txRow = txHash ? infoRow('Transaction ID', `<span style="font-size:10px;color:#94A3B8;word-break:break-all;">${txHash}</span>`) : '';
  return base('Bitcoin Deposit Confirmed! 🎉', `
    <div style="text-align:center;margin-bottom:20px;">
      <div style="font-size:48px;">₿</div>
      <h2 style="color:#10b981;font-size:22px;margin:8px 0;">Deposit Confirmed!</h2>
    </div>
    <p style="color:#475569;font-size:14px;line-height:1.7;margin:0 0 20px;">Hello <strong>${name}</strong>! Your Bitcoin deposit has been confirmed and credited to your PRAQEN wallet.</p>
    ${infoBox(`
      <tr><td style="padding:8px 0;color:#64748B;font-size:13px;font-weight:600;">Amount Received</td><td style="padding:8px 0;color:#059669;font-size:20px;font-weight:900;text-align:right;">₿ ${parseFloat(amountBtc || 0).toFixed(8)}</td></tr>
      ${txRow}
    `)}
    ${ctaButton('View Wallet', 'https://praqen.com/wallet')}
  `);
}

function tradeOpenedHtml(name, trade, role) {
  const isBuyer  = role === 'buyer';
  const headline = isBuyer ? '⚡ Trade Opened — Send Your Payment' : '⚡ New Trade Request Received';
  const detail   = isBuyer
    ? `You have opened a trade and <strong>${parseFloat(trade.amount_btc || 0).toFixed(8)} BTC</strong> is locked safely in escrow. Send your payment now to complete the trade.`
    : `A buyer wants to trade with you. <strong>${parseFloat(trade.amount_btc || 0).toFixed(8)} BTC</strong> is locked in escrow — you'll be notified once payment is sent.`;
  const payDisp = (() => {
    const fmt = n => new Intl.NumberFormat('en-US', {maximumFractionDigits:0}).format(n||0);
    if (trade.amount_local > 0 && trade.local_currency)
      return `${trade.currency_symbol || ''}${fmt(trade.amount_local)} ${trade.local_currency}`;
    if (trade.amount_usd > 0) return `$${parseFloat(trade.amount_usd).toFixed(2)} USD`;
    return '—';
  })();
  return base(headline, `
    <h2 style="color:#10b981;font-size:20px;margin:0 0 8px;">${headline}</h2>
    <p style="color:#475569;font-size:14px;line-height:1.7;margin:0 0 20px;">Hello <strong>${name}</strong>! ${detail}</p>
    ${infoBox(`
      <tr><td style="padding:7px 0;color:#64748B;font-size:13px;font-weight:600;">Trade Ref</td>
          <td style="padding:7px 0;text-align:right;"><span style="background:#10b981;color:#fff;font-size:11px;font-weight:700;padding:3px 10px;border-radius:6px;">#${(trade.trade_ref||trade.id||'').toString().slice(0,8).toUpperCase()}</span></td></tr>
      <tr><td style="padding:7px 0;color:#64748B;font-size:13px;font-weight:600;">Amount (BTC)</td>
          <td style="padding:7px 0;color:#059669;font-size:18px;font-weight:900;text-align:right;">₿ ${parseFloat(trade.amount_btc||0).toFixed(8)}</td></tr>
      <tr><td style="padding:7px 0;color:#64748B;font-size:13px;font-weight:600;">Amount (Fiat)</td>
          <td style="padding:7px 0;color:#1B4332;font-size:13px;font-weight:700;text-align:right;">${payDisp}</td></tr>
      <tr><td style="padding:7px 0;color:#64748B;font-size:13px;font-weight:600;">Payment Method</td>
          <td style="padding:7px 0;color:#1B4332;font-size:13px;text-align:right;">${trade.payment_method || 'Mobile Money'}</td></tr>
      <tr><td style="padding:7px 0;color:#64748B;font-size:13px;font-weight:600;">Your Role</td>
          <td style="padding:7px 0;color:#1B4332;font-size:13px;text-align:right;text-transform:capitalize;">${role}</td></tr>
    `)}
    ${ctaButton('View Trade →', `https://praqen.com/trade/${trade.id}`)}
    ${warningBox('🔒 Bitcoin is secured in PRAQEN escrow until you confirm payment')}
  `);
}

function paymentSentHtml(name, trade) {
  const fmt = n => new Intl.NumberFormat('en-US', {maximumFractionDigits:0}).format(n||0);
  const payDisp = trade.amount_local > 0 && trade.local_currency
    ? `${trade.currency_symbol || ''}${fmt(trade.amount_local)} ${trade.local_currency}`
    : `$${parseFloat(trade.amount_usd || 0).toFixed(2)} USD`;
  return base('💰 Payment Sent — Release BTC Now', `
    <h2 style="color:#D97706;font-size:20px;margin:0 0 8px;">💰 Buyer Has Sent Payment!</h2>
    <p style="color:#475569;font-size:14px;line-height:1.7;margin:0 0 20px;">Hello <strong>${name}</strong>! The buyer has confirmed payment for your trade. Verify the payment in your account, then release the Bitcoin.</p>
    ${infoBox(`
      <tr><td style="padding:7px 0;color:#64748B;font-size:13px;font-weight:600;">Trade Ref</td>
          <td style="padding:7px 0;text-align:right;"><span style="background:#D97706;color:#fff;font-size:11px;font-weight:700;padding:3px 10px;border-radius:6px;">#${(trade.trade_ref||trade.id||'').toString().slice(0,8).toUpperCase()}</span></td></tr>
      <tr><td style="padding:7px 0;color:#64748B;font-size:13px;font-weight:600;">BTC in Escrow</td>
          <td style="padding:7px 0;color:#059669;font-size:18px;font-weight:900;text-align:right;">₿ ${parseFloat(trade.amount_btc||0).toFixed(8)}</td></tr>
      <tr><td style="padding:7px 0;color:#64748B;font-size:13px;font-weight:600;">Payment Claimed</td>
          <td style="padding:7px 0;color:#D97706;font-size:14px;font-weight:700;text-align:right;">${payDisp}</td></tr>
      <tr><td style="padding:7px 0;color:#64748B;font-size:13px;font-weight:600;">Via</td>
          <td style="padding:7px 0;color:#1B4332;font-size:13px;text-align:right;">${trade.payment_method || 'Mobile Money'}</td></tr>
    `)}
    <div style="background:#FEF3C7;border:1px solid #FDE68A;border-radius:8px;padding:14px 16px;margin-bottom:20px;">
      <p style="margin:0;font-size:13px;font-weight:700;color:#92400E;">⚠️ Only release Bitcoin AFTER you confirm the money arrived in your account. Once released it cannot be reversed.</p>
    </div>
    ${ctaButton('✅ Verify & Release BTC', `https://praqen.com/trade/${trade.id}`)}
  `);
}

function tradeCancelledHtml(name, trade, reason) {
  return base('❌ Trade Cancelled', `
    <div style="text-align:center;margin-bottom:20px;">
      <div style="font-size:48px;">❌</div>
      <h2 style="color:#ef4444;font-size:22px;margin:8px 0;">Trade Cancelled</h2>
    </div>
    <p style="color:#475569;font-size:14px;line-height:1.7;margin:0 0 20px;">Hello <strong>${name}</strong>! The trade below has been cancelled${reason ? ` — <em>${reason}</em>` : ''}. Any BTC locked in escrow has been returned to the seller's wallet.</p>
    ${infoBox(`
      <tr><td style="padding:7px 0;color:#64748B;font-size:13px;font-weight:600;">Trade Ref</td>
          <td style="padding:7px 0;text-align:right;"><span style="background:#ef4444;color:#fff;font-size:11px;font-weight:700;padding:3px 10px;border-radius:6px;">#${(trade.trade_ref||trade.id||'').toString().slice(0,8).toUpperCase()}</span></td></tr>
      <tr><td style="padding:7px 0;color:#64748B;font-size:13px;font-weight:600;">Amount (BTC)</td>
          <td style="padding:7px 0;color:#1B4332;font-size:13px;text-align:right;">₿ ${parseFloat(trade.amount_btc||0).toFixed(8)}</td></tr>
      <tr><td style="padding:7px 0;color:#64748B;font-size:13px;font-weight:600;">Status</td>
          <td style="padding:7px 0;text-align:right;"><span style="background:#ef4444;color:#fff;font-size:11px;font-weight:700;padding:3px 8px;border-radius:6px;">CANCELLED</span></td></tr>
    `)}
    <p style="color:#64748B;font-size:13px;line-height:1.6;margin:0 0 20px;">If you believe this was an error or have concerns, please contact our support team immediately.</p>
    ${ctaButton('Browse New Offers', 'https://praqen.com/buy-bitcoin')}
  `);
}

function withdrawalAlertHtml(name, amountBtc, toAddress) {
  return base('Withdrawal Initiated 🔄', `
    <div style="text-align:center;margin-bottom:20px;">
      <div style="font-size:48px;">🔄</div>
      <h2 style="color:#10b981;font-size:22px;margin:8px 0;">Withdrawal Initiated</h2>
    </div>
    <p style="color:#475569;font-size:14px;line-height:1.7;margin:0 0 20px;">Hello <strong>${name}</strong>! Your withdrawal request has been submitted.</p>
    ${infoBox(`
      <tr><td style="padding:8px 0;color:#64748B;font-size:13px;font-weight:600;">Amount</td><td style="padding:8px 0;color:#059669;font-size:20px;font-weight:900;text-align:right;">₿ ${parseFloat(amountBtc || 0).toFixed(8)}</td></tr>
      <tr><td style="padding:7px 0;color:#64748B;font-size:12px;font-weight:600;">Destination</td><td style="padding:7px 0;color:#94A3B8;font-size:11px;text-align:right;word-break:break-all;">${toAddress}</td></tr>
      <tr><td style="padding:7px 0;color:#64748B;font-size:13px;font-weight:600;">Status</td><td style="padding:7px 0;text-align:right;"><span style="background:#F59E0B;color:#fff;font-size:11px;font-weight:700;padding:3px 10px;border-radius:6px;">PENDING</span></td></tr>
    `)}
    <p style="color:#64748B;font-size:13px;margin:0 0 16px;">Withdrawals are processed within 24 hours. You'll receive another email once complete.</p>
    <div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;padding:12px 16px;">
      <p style="margin:0;font-size:13px;color:#991b1b;"><strong>⚠️ Didn't request this?</strong> Contact us immediately at <a href="mailto:support@praqen.com" style="color:#b45309;font-weight:700;">support@praqen.com</a></p>
    </div>
  `);
}

function txReceiptHtml(name, tx) {
  const isSend     = tx.type === 'WITHDRAWAL' || tx.type === 'SEND' || tx.type === 'TRANSFER_OUT';
  const isInternal = tx.type === 'TRANSFER_IN' || tx.type === 'TRANSFER_OUT';
  const isPending  = tx.status === 'PENDING';
  const amountSign  = isSend ? '−' : '+';
  const amountLabel = `${amountSign}₿${parseFloat(tx.amount_btc || 0).toFixed(8)}`;
  const amountColor = isSend ? '#EF4444' : '#10B981';
  const statusColor = isPending ? '#F59E0B' : '#10B981';
  const statusBg    = isPending ? '#FEF3C7' : '#D1FAE5';
  const statusText  = isPending ? '#92400E' : '#065F46';
  const statusLabel = isPending ? '⏳ PENDING' : '✅ CONFIRMED';

  const dateStr = tx.created_at
    ? new Date(tx.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  const refId = tx.id ? `#${String(tx.id).slice(0, 16).toUpperCase()}` : `#${Date.now().toString(36).toUpperCase()}`;
  const isRisky = tx.notes && /confirmed twice|risky wallet/i.test(tx.notes);
  const feeMatch = tx.notes && tx.notes.match(/₿([\d.]+)\)/);
  const feeAmt  = feeMatch ? feeMatch[1] : (tx.fee_btc ? parseFloat(tx.fee_btc).toFixed(8) : null);

  // Helper: one receipt row (label left, value right, divider)
  const row = (label, valueHtml) => `
    <tr>
      <td colspan="2" style="padding:0;"><div style="height:1px;background:#F1F5F9;"></div></td>
    </tr>
    <tr>
      <td style="padding:10px 0 10px 0;font-size:12px;font-weight:700;color:#94A3B8;vertical-align:top;width:38%;">${label}</td>
      <td style="padding:10px 0 10px 0;font-size:13px;font-weight:600;color:#1E293B;text-align:right;word-break:break-all;">${valueHtml}</td>
    </tr>`;

  const addrRow  = tx.destination_address
    ? row('To Address', `<span style="font-size:11px;font-family:monospace;color:#64748B;">${tx.destination_address.slice(0,20)}…</span>`)
    : '';
  const txHashRow = tx.tx_hash
    ? row('TX Hash', `<a href="https://mempool.space/tx/${tx.tx_hash}" style="font-size:11px;font-family:monospace;color:#3B82F6;text-decoration:none;">${tx.tx_hash.slice(0,20)}…↗</a>`)
    : '';

  // Notes section — risky wallet card or plain text
  const notesSection = isRisky ? `
    <tr>
      <td colspan="2" style="padding:0;"><div style="height:1px;background:#F1F5F9;"></div></td>
    </tr>
    <tr>
      <td style="padding:10px 0 6px;font-size:12px;font-weight:700;color:#94A3B8;vertical-align:top;width:38%;">Notes</td>
      <td style="padding:10px 0 6px;text-align:right;"></td>
    </tr>
    <tr>
      <td colspan="2" style="padding:0 0 10px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="border-radius:10px;overflow:hidden;border:1px solid #FDE68A;">
          <tr>
            <td style="background:#FEF3C7;padding:9px 14px;">
              <span style="font-size:13px;font-weight:800;color:#92400E;">⚠️&nbsp; Risky Wallet Warning</span>
            </td>
          </tr>
          <tr>
            <td style="background:#FFFDF5;padding:12px 14px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td width="24" style="vertical-align:top;padding:4px 0;font-size:15px;">✅</td>
                  <td style="padding:4px 0;font-size:12px;color:#475569;line-height:1.55;">User confirmed twice before sending</td>
                </tr>
                <tr>
                  <td width="24" style="vertical-align:top;padding:4px 0;font-size:15px;">⚠️</td>
                  <td style="padding:4px 0;font-size:12px;color:#475569;line-height:1.55;">Warned this is a risky wallet and chose to proceed</td>
                </tr>
                ${feeAmt ? `<tr>
                  <td width="24" style="vertical-align:top;padding:4px 0;font-size:15px;">💰</td>
                  <td style="padding:4px 0;font-size:12px;color:#475569;line-height:1.55;">Fee of ₿${feeAmt} held by PRAQEN</td>
                </tr>` : ''}
                <tr>
                  <td width="24" style="vertical-align:top;padding:4px 0;font-size:15px;">🚫</td>
                  <td style="padding:4px 0;font-size:12px;color:#475569;line-height:1.55;">PRAQEN is not responsible for any loss from this transaction</td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>` : (tx.notes ? row('Notes', `<span style="font-size:12px;color:#475569;">${tx.notes}</span>`) : '');

  const blockchainNote = isSend ? `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;border-radius:10px;overflow:hidden;background:#EFF6FF;border:1px solid #BFDBFE;">
      <tr><td style="padding:12px 16px;">
        <p style="margin:0 0 4px;font-size:13px;font-weight:800;color:#1D4ED8;">🔗 Blockchain External Wallet Send-Out</p>
        <p style="margin:0;font-size:12px;color:#3B82F6;line-height:1.55;">⚠️ The blockchain network is responsible for this external wallet transaction. PRAQEN is not liable once funds leave to an external address.</p>
      </td></tr>
    </table>` : '';

  const yr = new Date().getFullYear();

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>Transaction Receipt</title>
</head>
<body style="margin:0;padding:0;background:#F0FAF5;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F0FAF5;padding:32px 0;">
<tr><td align="center">
<table width="480" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(16,185,129,0.10);max-width:480px;width:100%;">

  <!-- ═══ GREEN HEADER ═══ -->
  <tr><td style="background:linear-gradient(135deg,#1B4332 0%,#2D6A4F 60%,#40916C 100%);padding:32px 32px 40px;text-align:center;">
    <a href="https://praqen.com" style="text-decoration:none;">
      <img src="https://praqen.com/logo512.png" width="32" height="32" alt="PRAQEN" style="border-radius:8px;vertical-align:middle;margin-right:8px;">
      <span style="font-size:10px;font-weight:800;color:rgba(255,255,255,0.6);letter-spacing:3px;text-transform:uppercase;vertical-align:middle;">PRAQEN</span>
    </a>
    <p style="margin:12px 0 20px;font-size:16px;font-weight:900;color:#ffffff;">Transaction Receipt</p>
    <!-- Amount circle -->
    <div style="display:inline-block;width:72px;height:72px;border-radius:50%;background:${isPending ? 'rgba(245,158,11,0.25)' : isSend ? 'rgba(239,68,68,0.25)' : 'rgba(16,185,129,0.25)'};border:2px solid ${isPending ? 'rgba(245,158,11,0.5)' : isSend ? 'rgba(239,68,68,0.5)' : 'rgba(16,185,129,0.5)'};line-height:72px;text-align:center;font-size:28px;">
      ${isPending ? '⏳' : isSend ? '↑' : '↓'}
    </div>
    <p style="margin:12px 0 4px;font-size:26px;font-weight:900;color:#ffffff;letter-spacing:-0.5px;">${amountLabel}</p>
    <span style="display:inline-block;background:${statusBg};color:${statusText};font-size:11px;font-weight:800;padding:4px 16px;border-radius:20px;">${statusLabel}</span>
  </td></tr>

  <!-- ═══ RECEIPT BODY ═══ -->
  <tr><td style="padding:24px 28px 8px;">
    <p style="margin:0 0 20px;font-size:13px;color:#64748B;line-height:1.6;">Hello <strong style="color:#1E293B;">${name}</strong>, here is your transaction receipt.</p>

    <!-- Dashed top rule -->
    <div style="border-top:2px dashed #E2E8F0;margin-bottom:4px;"></div>

    <table width="100%" cellpadding="0" cellspacing="0">
      ${row('Type',         isSend ? 'Bitcoin Sent' : 'Bitcoin Received')}
      ${row('Wallet',       'On-chain Bitcoin')}
      ${row('Amount',       `<strong style="color:${amountColor};font-size:15px;">${amountLabel}</strong>`)}
      ${row('Status',       `<span style="background:${statusBg};color:${statusText};font-size:11px;font-weight:800;padding:3px 10px;border-radius:6px;">${isPending ? 'Pending' : 'Confirmed'}</span>`)}
      ${row('Date &amp; Time', dateStr)}
      ${addrRow}
      ${txHashRow}
      ${notesSection}
      ${row('Reference',    `<span style="font-family:monospace;font-size:12px;color:#64748B;">${refId}</span>`)}
    </table>

    <!-- Dashed bottom rule -->
    <div style="border-top:2px dashed #E2E8F0;margin-top:4px;margin-bottom:20px;"></div>

    ${blockchainNote}
  </td></tr>

  <!-- ═══ CTA ═══ -->
  <tr><td style="padding:16px 28px 28px;text-align:center;">
    <a href="https://praqen.com/wallet" style="display:inline-block;background:linear-gradient(135deg,#1B4332,#2D6A4F);color:#fff;text-decoration:none;font-size:14px;font-weight:800;padding:13px 36px;border-radius:12px;">View Wallet →</a>
  </td></tr>

  <!-- ═══ FOOTER ═══ -->
  <tr><td style="background:#F8FAFC;padding:22px 28px;text-align:center;border-top:1px solid #E2E8F0;">
    <p style="margin:0 0 10px;">
      <a href="https://x.com/praqenapp?s=21" style="color:#64748B;text-decoration:none;font-size:11px;font-weight:700;margin:0 8px;">X / Twitter</a>
      <a href="https://www.instagram.com/praqen?igsh=MTRkZWg2amp5YnJlYQ%3D%3D&amp;utm_source=qr" style="color:#64748B;text-decoration:none;font-size:11px;font-weight:700;margin:0 8px;">Instagram</a>
      <a href="https://www.linkedin.com/in/pra-qen-045373402/" style="color:#64748B;text-decoration:none;font-size:11px;font-weight:700;margin:0 8px;">LinkedIn</a>
    </p>
    <p style="margin:0 0 3px;font-size:12px;color:#94A3B8;">Need help? <a href="mailto:support@praqen.com" style="color:#10b981;font-weight:700;">support@praqen.com</a> · <a href="https://praqen.com" style="color:#10b981;font-weight:700;">praqen.com</a></p>
    <p style="margin:0;font-size:11px;color:#CBD5E1;">© ${yr} PRAQEN · The World's Most Trusted P2P Bitcoin Marketplace</p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

async function sendTxReceiptEmail(user, tx) {
  const name = user.username || user.email || 'Trader';
  const isSend    = tx.type === 'WITHDRAWAL' || tx.type === 'SEND';
  const isPending = tx.status === 'PENDING';
  const amountStr = `₿${parseFloat(tx.amount_btc || 0).toFixed(8)}`;
  const subject = isPending
    ? `⏳ Withdrawal Queued — ${amountStr} Pending`
    : isSend
      ? `✅ Transaction Receipt — ${amountStr} Sent`
      : `✅ Transaction Receipt — ${amountStr} Received`;
  return sendEmail({
    userId:   user.id,
    to:       user.email,
    subject,
    html:     txReceiptHtml(name, tx),
    type:     'tx_receipt',
    metadata: { amount_btc: tx.amount_btc, status: tx.status, type: tx.type },
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

async function sendWelcomeEmail(user) {
  return sendEmail({
    userId:  user.id,
    to:      user.email,
    subject: `Welcome to PRAQEN, ${user.username || 'Trader'}! 🎉`,
    html:    welcomeHtml(user.username || 'Trader'),
    type:    'welcome',
  });
}

async function sendVerificationEmail(email, code, userId) {
  return sendEmail({
    userId,
    to:       email,
    subject:  'Your PRAQEN Verification Code',
    html:     verificationHtml(code),
    type:     'verification',
    metadata: { code_hint: String(code).slice(0, 2) + '****' },
  });
}

async function sendLoginAlertEmail(user) {
  return sendEmail({
    userId:  user.id,
    to:      user.email,
    subject: '🔐 New Login to Your PRAQEN Account',
    html:    loginAlertHtml(user.username || user.email, new Date().toUTCString()),
    type:    'login_alert',
  });
}

async function sendLoginOtpEmail(user, code) {
  const html = base('Your Login Code', `
    <h2 style="margin:0 0 8px;font-size:22px;color:#1B4332;font-weight:800;">Your Login Code</h2>
    <p style="margin:0 0 24px;color:#64748B;font-size:15px;">Hi <strong>${user.username || 'there'}</strong>, use the code below to complete your sign-in. It expires in <strong>10 minutes</strong>.</p>
    <div style="text-align:center;margin:28px 0;">
      <div style="display:inline-block;background:linear-gradient(135deg,#1B4332,#2D6A4F);border-radius:16px;padding:20px 40px;">
        <span style="font-size:38px;font-weight:900;letter-spacing:10px;color:#ffffff;font-family:monospace;">${code}</span>
      </div>
    </div>
    <p style="margin:0 0 8px;color:#94A3B8;font-size:13px;text-align:center;">If you did not request this, please ignore this email or contact support immediately.</p>
    <p style="margin:0;color:#94A3B8;font-size:12px;text-align:center;">Do not share this code with anyone.</p>
  `);
  return sendEmail({
    userId:  user.id,
    to:      user.email,
    subject: `${code} is your PRAQEN login code`,
    html,
    type:    'login_otp',
  });
}

async function sendKycApprovedEmail(user) {
  return sendEmail({
    userId:  user.id,
    to:      user.email,
    subject: '✅ KYC Approved — Full Access Unlocked!',
    html:    kycApprovedHtml(user.username || 'Trader'),
    type:    'kyc_approved',
  });
}

async function sendKycRejectedEmail(user, reason) {
  return sendEmail({
    userId:   user.id,
    to:       user.email,
    subject:  '❌ KYC Not Approved — Action Required',
    html:     kycRejectedHtml(user.username || 'Trader', reason),
    type:     'kyc_rejected',
    metadata: { reason },
  });
}

async function sendTradeConfirmationEmail(user, trade, role) {
  const subjectBuyer  = `✅ Trade Complete — ₿${parseFloat(trade.amount_btc || 0).toFixed(8)} Received`;
  const subjectSeller = `✅ Trade Complete — Payment Confirmed`;
  return sendEmail({
    userId:   user.id,
    to:       user.email,
    subject:  role === 'buyer' ? subjectBuyer : subjectSeller,
    html:     tradeConfirmationHtml(user.username || 'Trader', trade, role),
    type:     'trade_confirmation',
    metadata: { trade_id: trade.id, trade_ref: trade.trade_ref, role },
  });
}

async function sendDepositAlertEmail(user, amountBtc, txHash) {
  return sendEmail({
    userId:   user.id,
    to:       user.email,
    subject:  `🎉 Deposit Confirmed: ₿${parseFloat(amountBtc || 0).toFixed(8)}`,
    html:     depositAlertHtml(user.username || 'Trader', amountBtc, txHash),
    type:     'deposit_alert',
    metadata: { amount_btc: amountBtc, tx_hash: txHash },
  });
}

async function sendWithdrawalAlertEmail(user, amountBtc, toAddress) {
  return sendEmail({
    userId:   user.id,
    to:       user.email,
    subject:  `🔄 Withdrawal Initiated: ₿${parseFloat(amountBtc || 0).toFixed(8)}`,
    html:     withdrawalAlertHtml(user.username || 'Trader', amountBtc, toAddress),
    type:     'withdrawal_alert',
    metadata: { amount_btc: amountBtc, destination: toAddress },
  });
}

async function sendTradeOpenedEmail(user, trade, role) {
  const subjectBuyer  = `⚡ Trade Opened — Send Payment to Get ₿${parseFloat(trade.amount_btc||0).toFixed(8)}`;
  const subjectSeller = `⚡ New Trade — ₿${parseFloat(trade.amount_btc||0).toFixed(8)} Locked in Escrow`;
  return sendEmail({
    userId:   user.id,
    to:       user.email,
    subject:  role === 'buyer' ? subjectBuyer : subjectSeller,
    html:     tradeOpenedHtml(user.username || 'Trader', trade, role),
    type:     'trade_opened',
    metadata: { trade_id: trade.id, trade_ref: trade.trade_ref, role },
  });
}

async function sendPaymentSentEmail(sellerUser, trade) {
  return sendEmail({
    userId:   sellerUser.id,
    to:       sellerUser.email,
    subject:  `💰 Payment Sent — Release BTC for Trade #${(trade.trade_ref||trade.id||'').toString().slice(0,8).toUpperCase()}`,
    html:     paymentSentHtml(sellerUser.username || 'Trader', trade),
    type:     'payment_sent',
    metadata: { trade_id: trade.id, trade_ref: trade.trade_ref },
  });
}

async function sendTradeCancelledEmail(user, trade, reason) {
  return sendEmail({
    userId:   user.id,
    to:       user.email,
    subject:  `❌ Trade Cancelled — #${(trade.trade_ref||trade.id||'').toString().slice(0,8).toUpperCase()}`,
    html:     tradeCancelledHtml(user.username || 'Trader', trade, reason),
    type:     'trade_cancelled',
    metadata: { trade_id: trade.id, trade_ref: trade.trade_ref, reason },
  });
}

function disputeOpenedHtml(name, trade, reason) {
  const ref = (trade.trade_ref || trade.id || '').toString().slice(0, 8).toUpperCase();
  return base('🚨 Dispute Opened — Moderator Notified', `
    <div style="text-align:center;margin-bottom:20px;">
      <div style="font-size:48px;">🚨</div>
      <h2 style="color:#7C3AED;font-size:22px;margin:8px 0;">Dispute Filed on Your Trade</h2>
    </div>
    <p style="color:#475569;font-size:14px;line-height:1.7;margin:0 0 20px;">Hello <strong>${name}</strong>! A dispute has been opened on trade <strong>#${ref}</strong>. A PRAQEN moderator has been notified and will review all evidence.</p>
    ${infoBox(`
      <tr><td style="padding:7px 0;color:#64748B;font-size:13px;font-weight:600;">Trade Ref</td>
          <td style="padding:7px 0;text-align:right;"><span style="background:#7C3AED;color:#fff;font-size:11px;font-weight:700;padding:3px 10px;border-radius:6px;">#${ref}</span></td></tr>
      <tr><td style="padding:7px 0;color:#64748B;font-size:13px;font-weight:600;">BTC in Escrow</td>
          <td style="padding:7px 0;color:#059669;font-size:16px;font-weight:900;text-align:right;">₿ ${parseFloat(trade.amount_btc || 0).toFixed(8)}</td></tr>
      ${reason ? `<tr><td style="padding:7px 0;color:#64748B;font-size:13px;font-weight:600;">Reason</td><td style="padding:7px 0;color:#7C3AED;font-size:13px;text-align:right;">${reason}</td></tr>` : ''}
    `)}
    <div style="background:#F5F3FF;border:1px solid #DDD6FE;border-radius:8px;padding:14px 16px;margin-bottom:20px;">
      <p style="margin:0;font-size:13px;font-weight:700;color:#5B21B6;">⚠️ Do NOT release or transfer any funds until the dispute is fully resolved by a moderator.</p>
    </div>
    ${ctaButton('📋 View Trade & Evidence', `https://praqen.com/trade/${trade.id}`)}
  `);
}

function disputeResolvedHtml(name, trade, resolution, notes) {
  const ref = (trade.trade_ref || trade.id || '').toString().slice(0, 8).toUpperCase();
  const isCompleted = (resolution || '').toUpperCase().includes('BUYER') || (resolution || '').toUpperCase() === 'COMPLETED';
  const color = isCompleted ? '#10b981' : '#ef4444';
  const icon  = isCompleted ? '✅' : '❌';
  const label = isCompleted ? 'Resolved — Trade Completed' : 'Resolved — Trade Cancelled';
  return base(`${icon} Dispute Resolved`, `
    <div style="text-align:center;margin-bottom:20px;">
      <div style="font-size:48px;">${icon}</div>
      <h2 style="color:${color};font-size:22px;margin:8px 0;">${label}</h2>
    </div>
    <p style="color:#475569;font-size:14px;line-height:1.7;margin:0 0 20px;">Hello <strong>${name}</strong>! The dispute on trade <strong>#${ref}</strong> has been reviewed and resolved by a PRAQEN moderator.</p>
    ${infoBox(`
      <tr><td style="padding:7px 0;color:#64748B;font-size:13px;font-weight:600;">Trade Ref</td>
          <td style="padding:7px 0;text-align:right;"><span style="background:${color};color:#fff;font-size:11px;font-weight:700;padding:3px 10px;border-radius:6px;">#${ref}</span></td></tr>
      <tr><td style="padding:7px 0;color:#64748B;font-size:13px;font-weight:600;">Decision</td>
          <td style="padding:7px 0;color:${color};font-size:13px;font-weight:700;text-align:right;">${resolution || 'Resolved'}</td></tr>
      ${notes ? `<tr><td style="padding:7px 0;color:#64748B;font-size:13px;font-weight:600;">Moderator Notes</td><td style="padding:7px 0;color:#334155;font-size:13px;text-align:right;">${notes}</td></tr>` : ''}
    `)}
    ${ctaButton('View Trade Details', `https://praqen.com/trade/${trade.id}`)}
  `);
}

async function sendDisputeOpenedEmail(user, trade, reason) {
  const ref = (trade.trade_ref || trade.id || '').toString().slice(0, 8).toUpperCase();
  return sendEmail({
    userId:   user.id,
    to:       user.email,
    subject:  `🚨 Dispute Opened — Trade #${ref}`,
    html:     disputeOpenedHtml(user.username || 'Trader', trade, reason),
    type:     'dispute_opened',
    metadata: { trade_id: trade.id, trade_ref: trade.trade_ref, reason },
  });
}

async function sendDisputeResolvedEmail(user, trade, resolution, notes) {
  const ref = (trade.trade_ref || trade.id || '').toString().slice(0, 8).toUpperCase();
  return sendEmail({
    userId:   user.id,
    to:       user.email,
    subject:  `⚖️ Dispute Resolved — Trade #${ref}`,
    html:     disputeResolvedHtml(user.username || 'Trader', trade, resolution, notes),
    type:     'dispute_resolved',
    metadata: { trade_id: trade.id, trade_ref: trade.trade_ref, resolution },
  });
}

// ── Eid Mubarak + Bonus announcement email (full personalization) ─────────────
function buildEidBonusHtml(username, referralCode) {
  const link = `https://praqen.com/signup?ref=${referralCode || ''}`;
  const yr   = new Date().getFullYear();
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>Eid Mubarak + $2 Free Bitcoin!</title>
</head>
<body style="margin:0;padding:0;background:#0c1a10;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0c1a10;padding:32px 16px;">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:20px;overflow:hidden;max-width:560px;width:100%;">

  <!-- ═══ EID HEADER ═══ -->
  <tr>
    <td style="background:linear-gradient(160deg,#0c1a10 0%,#1B4332 40%,#2D6A4F 100%);padding:40px 32px 32px;text-align:center;position:relative;">
      <!-- Stars decorative row -->
      <p style="margin:0 0 10px;font-size:22px;letter-spacing:8px;">✦ ✦ ✦ ✦ ✦</p>
      <!-- Crescent + logo -->
      <div style="display:inline-block;background:#F4A422;border-radius:50%;width:72px;height:72px;line-height:72px;text-align:center;margin-bottom:16px;box-shadow:0 0 32px rgba(244,164,34,0.55);">
        <span style="font-size:36px;font-weight:900;color:#1B4332;font-family:Georgia,serif;line-height:72px;">🌙</span>
      </div>
      <h1 style="color:#F4A422;font-size:30px;font-weight:900;margin:0 0 4px;font-family:Georgia,serif;letter-spacing:1px;">Eid Mubarak!</h1>
      <p style="color:#ffffff;font-size:13px;margin:0 0 6px;opacity:0.7;letter-spacing:3px;text-transform:uppercase;">عيد مبارك</p>
      <p style="color:rgba(255,255,255,0.6);font-size:13px;margin:0;">From the entire PRAQEN team to you and your family 🤲</p>
    </td>
  </tr>

  <!-- ═══ GREETING ═══ -->
  <tr>
    <td style="padding:32px 36px 24px;background:#ffffff;">
      <p style="color:#1B4332;font-size:17px;font-weight:800;margin:0 0 10px;">Salaam ${username || 'Trader'},</p>
      <p style="color:#475569;font-size:14px;line-height:1.75;margin:0 0 18px;">
        On this blessed occasion of Eid ul-Adha, we pray that joy, peace, and prosperity find you and everyone you love.
        May this Eid be filled with moments of gratitude, togetherness, and new beginnings. 🌟
      </p>
      <p style="color:#475569;font-size:14px;line-height:1.75;margin:0;">
        To celebrate with you, we have something special — a <strong style="color:#1B4332;">$2 FREE Bitcoin gift</strong> for every PRAQEN trader!
      </p>
    </td>
  </tr>

  <!-- ═══ $2 BONUS HERO ═══ -->
  <tr>
    <td style="padding:0 36px 24px;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,#1B4332 0%,#2D6A4F 60%,#40916C 100%);border-radius:16px;overflow:hidden;">
        <tr>
          <td style="padding:28px 28px 20px;text-align:center;">
            <p style="margin:0 0 6px;font-size:11px;font-weight:800;color:#F4A422;letter-spacing:2px;text-transform:uppercase;">🎁 Welcome Bonus</p>
            <p style="margin:0 0 4px;font-size:34px;font-weight:900;color:#ffffff;font-family:Georgia,serif;">$2 Free Bitcoin</p>
            <p style="margin:0 0 20px;font-size:13px;color:rgba(255,255,255,0.65);">That's $2 Free Bitcoin — Yours to Keep!</p>
            <!-- 3-step table -->
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td width="33%" style="text-align:center;padding:0 4px;">
                  <div style="background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);border-radius:10px;padding:12px 8px;">
                    <p style="margin:0;font-size:20px;">✅</p>
                    <p style="margin:4px 0 2px;font-size:11px;font-weight:800;color:#ffffff;">Register</p>
                    <p style="margin:0;font-size:9px;color:rgba(255,255,255,0.5);">$1 BTC locked</p>
                  </div>
                </td>
                <td width="4%" style="text-align:center;color:rgba(255,255,255,0.3);font-size:16px;">›</td>
                <td width="33%" style="text-align:center;padding:0 4px;">
                  <div style="background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);border-radius:10px;padding:12px 8px;">
                    <p style="margin:0;font-size:20px;">⚡</p>
                    <p style="margin:4px 0 2px;font-size:11px;font-weight:800;color:#ffffff;">Verify</p>
                    <p style="margin:0;font-size:9px;color:rgba(255,255,255,0.5);">stays locked safe</p>
                  </div>
                </td>
                <td width="4%" style="text-align:center;color:rgba(255,255,255,0.3);font-size:16px;">›</td>
                <td width="33%" style="text-align:center;padding:0 4px;">
                  <div style="background:rgba(244,164,34,0.2);border:1px solid rgba(244,164,34,0.4);border-radius:10px;padding:12px 8px;">
                    <p style="margin:0;font-size:20px;">₿</p>
                    <p style="margin:4px 0 2px;font-size:11px;font-weight:800;color:#F4A422;">1st Trade</p>
                    <p style="margin:0;font-size:9px;color:rgba(255,255,255,0.5);">$2 unlocks! 🔓</p>
                  </div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- ═══ REFERRAL SECTION ═══ -->
  <tr>
    <td style="padding:0 36px 24px;">
      <p style="color:#1B4332;font-size:16px;font-weight:900;margin:0 0 6px;">Already Trading? Share &amp; Earn Even More! 💰</p>
      <p style="color:#475569;font-size:13px;line-height:1.7;margin:0 0 16px;">
        Invite friends to PRAQEN and earn up to <strong style="color:#1B4332;">0.5% commission</strong> on every trade they make — forever.
        The more friends you bring in, the more you earn. No cap. No expiry.
      </p>
      <!-- Referral link box -->
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#F0FAF5;border:2px dashed #40916C;border-radius:12px;margin-bottom:16px;">
        <tr>
          <td style="padding:14px 18px;">
            <p style="margin:0 0 4px;font-size:10px;font-weight:700;color:#40916C;text-transform:uppercase;letter-spacing:1px;">🔗 Your Personal Referral Link</p>
            <p style="margin:0;font-size:12px;font-family:monospace;color:#1B4332;word-break:break-all;">${link}</p>
          </td>
        </tr>
      </table>
      <!-- Commission tiers -->
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:6px;">
        <tr>
          ${[
            {refs:'0–9',    rate:'0.20%', bg:'#D1FAE5', c:'#065F46'},
            {refs:'10–24',  rate:'0.25%', bg:'#CCFBF1', c:'#0D9488'},
            {refs:'25–49',  rate:'0.35%', bg:'#FEF3C7', c:'#92400E'},
            {refs:'50–99',  rate:'0.40%', bg:'#FFEDD5', c:'#C2410C'},
            {refs:'100+',   rate:'0.50%', bg:'#EDE9FE', c:'#6D28D9'},
          ].map(t => `
          <td width="20%" style="text-align:center;padding:0 3px;">
            <div style="background:${t.bg};border-radius:8px;padding:7px 4px;">
              <p style="margin:0;font-size:12px;font-weight:900;color:${t.c};">${t.rate}</p>
              <p style="margin:2px 0 0;font-size:9px;color:#64748B;">${t.refs} refs</p>
            </div>
          </td>`).join('')}
        </tr>
      </table>
      <p style="margin:6px 0 0;font-size:10px;color:#94A3B8;text-align:center;">Commission increases as your referral count grows</p>
    </td>
  </tr>

  <!-- ═══ CTA BUTTONS ═══ -->
  <tr>
    <td style="padding:0 36px 32px;text-align:center;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td width="48%" style="padding-right:6px;">
            <a href="https://praqen.com/buy-bitcoin" style="display:block;background:linear-gradient(135deg,#1B4332,#2D6A4F);color:#ffffff;text-decoration:none;padding:13px 10px;border-radius:12px;font-size:13px;font-weight:800;text-align:center;">
              ₿ Start Trading Now
            </a>
          </td>
          <td width="4%"></td>
          <td width="48%" style="padding-left:6px;">
            <a href="${link}" style="display:block;background:#F4A422;color:#1B4332;text-decoration:none;padding:13px 10px;border-radius:12px;font-size:13px;font-weight:800;text-align:center;">
              🎁 Share &amp; Earn
            </a>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- ═══ EID CLOSING ═══ -->
  <tr>
    <td style="background:#F8FAFC;padding:22px 36px;text-align:center;border-top:1px solid #E2E8F0;">
      <p style="margin:0 0 6px;font-size:20px;">🌙 ✦ 🤲 ✦ 🌙</p>
      <p style="margin:0 0 4px;color:#1B4332;font-size:14px;font-weight:800;">Eid Mubarak — تقبل الله منا ومنكم</p>
      <p style="margin:0;color:#64748B;font-size:12px;">May Allah accept our good deeds. Wishing you a blessed Eid.</p>
    </td>
  </tr>

  <!-- ═══ FOOTER ═══ -->
  <tr>
    <td style="background:#1B4332;padding:22px 36px;text-align:center;">
      <p style="margin:0 0 6px;font-size:20px;font-weight:900;color:#F4A422;font-family:Georgia,serif;">PRAQEN</p>
      <p style="margin:0 0 10px;font-size:10px;color:rgba(255,255,255,0.45);letter-spacing:2px;text-transform:uppercase;">The Global P2P Bitcoin Platform</p>
      <p style="margin:0 0 10px;">
        <a href="https://praqen.com/buy-bitcoin" style="color:rgba(255,255,255,0.5);text-decoration:none;font-size:11px;margin:0 8px;">Buy Bitcoin</a>
        <a href="https://praqen.com/sell-bitcoin" style="color:rgba(255,255,255,0.5);text-decoration:none;font-size:11px;margin:0 8px;">Sell Bitcoin</a>
        <a href="${link}" style="color:rgba(255,255,255,0.5);text-decoration:none;font-size:11px;margin:0 8px;">Refer Friends</a>
      </p>
      <p style="margin:0;font-size:10px;color:rgba(255,255,255,0.3);">
        © ${yr} PRAQEN · You're receiving this because you have an account with us.<br>
        <a href="https://praqen.com" style="color:rgba(255,255,255,0.3);text-decoration:underline;">praqen.com</a>
      </p>
    </td>
  </tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

async function sendEidBonusEmail({ userId, to, username, referralCode }) {
  return sendEmail({
    userId,
    to,
    subject: '🌙 Eid Mubarak + $2 FREE Bitcoin — Just for You!',
    html:    buildEidBonusHtml(username, referralCode),
    type:    'eid_bonus_broadcast',
    metadata: { referral_code: referralCode, campaign: 'eid_2025' },
  });
}

// ── Happy New Month + USDT Wallet Live announcement (full personalization) ────
function buildUsdtAnnouncementHtml(username, referralCode) {
  const link  = `https://praqen.com/signup?ref=${referralCode || ''}`;
  const yr    = new Date().getFullYear();
  const month = new Date().toLocaleString('en-US', { month: 'long' });
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>Happy New Month! USDT Wallet is Live on PRAQEN</title>
</head>
<body style="margin:0;padding:0;background:#F0FAF5;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F0FAF5;padding:32px 16px;">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:20px;overflow:hidden;max-width:560px;width:100%;">

  <!-- ═══ HEADER ═══ -->
  <tr>
    <td style="background:linear-gradient(135deg,#1B4332 0%,#2D6A4F 60%,#40916C 100%);padding:40px 32px 32px;text-align:center;">
      <p style="margin:0 0 10px;font-size:22px;letter-spacing:8px;">✦ ✦ ✦ ✦ ✦</p>
      <div style="display:inline-block;background:#F4A422;border-radius:50%;width:72px;height:72px;line-height:72px;text-align:center;margin-bottom:16px;box-shadow:0 0 32px rgba(244,164,34,0.55);">
        <span style="font-size:34px;line-height:72px;">🎉</span>
      </div>
      <h1 style="color:#F4A422;font-size:28px;font-weight:900;margin:0 0 4px;font-family:Georgia,serif;letter-spacing:1px;">Happy New Month!</h1>
      <p style="color:rgba(255,255,255,0.65);font-size:13px;margin:0;">From the entire PRAQEN team — welcome to ${month}! 🎊</p>
    </td>
  </tr>

  <!-- ═══ GREETING ═══ -->
  <tr>
    <td style="padding:32px 36px 20px;background:#ffffff;">
      <p style="color:#1B4332;font-size:17px;font-weight:800;margin:0 0 10px;">Hi ${username || 'Trader'},</p>
      <p style="color:#475569;font-size:14px;line-height:1.75;margin:0;">
        We've got big news to kick off the month — <strong style="color:#1B4332;">USDT wallets are now live on PRAQEN!</strong>
        You can deposit, hold, and trade USDT directly from your wallet, no BTC conversion needed.
      </p>
    </td>
  </tr>

  <!-- ═══ USDT LIVE CARD ═══ -->
  <tr>
    <td style="padding:0 36px 16px;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,#0d3b2e,#1a5c41);border-radius:16px;overflow:hidden;">
        <tr>
          <td style="padding:24px 26px;text-align:center;">
            <div style="display:inline-block;background:rgba(255,255,255,0.12);border-radius:50%;width:52px;height:52px;line-height:52px;margin-bottom:10px;">
              <span style="font-size:24px;line-height:52px;">₮</span>
            </div>
            <p style="margin:0 0 6px;font-size:18px;font-weight:900;color:#ffffff;">USDT Wallet is Here 💵</p>
            <p style="margin:0 0 18px;font-size:13px;color:rgba(255,255,255,0.65);line-height:1.7;">
              Go to your Wallet → select USDT → Deposit, and start trading freely. Fast, stable, and always 1:1 with the dollar.
            </p>
            <a href="https://praqen.com/wallet" style="display:inline-block;background:#F4A422;color:#1B4332;text-decoration:none;padding:13px 32px;border-radius:12px;font-size:14px;font-weight:800;">
              💰 Go to My Wallet
            </a>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- ═══ CREATE OFFER CARD ═══ -->
  <tr>
    <td style="padding:0 36px 24px;">
      <div style="background:linear-gradient(135deg,#F0FDF4,#DCFCE7);border-radius:14px;padding:22px 24px;border:2px solid #86EFAC;">
        <p style="margin:0 0 8px;font-size:16px;font-weight:900;color:#166534;">📢 Create Your Offer Now</p>
        <p style="margin:0 0 16px;font-size:13px;color:#15803D;line-height:1.7;">
          The marketplace is active 24/7 — post a buy or sell offer for BTC or USDT and reach thousands of traders today.
        </p>
        <a href="https://praqen.com/create-offer" style="display:inline-block;background:#166534;color:#ffffff;text-decoration:none;padding:11px 24px;border-radius:10px;font-size:13px;font-weight:800;">
          ➕ Create an Offer
        </a>
      </div>
    </td>
  </tr>

  <!-- ═══ REFERRAL SECTION ═══ -->
  <tr>
    <td style="padding:0 36px 24px;">
      <p style="color:#1B4332;font-size:16px;font-weight:900;margin:0 0 6px;">Share Your Link — Friends Get $2 Free! 🎁</p>
      <p style="color:#475569;font-size:13px;line-height:1.7;margin:0 0 16px;">
        Share your referral link below. Anyone who signs up, verifies, and completes their first trade unlocks an
        <strong style="color:#1B4332;">instant $2 Bitcoin bonus</strong> — and you keep earning ongoing commission every time they trade.
      </p>
      <!-- Referral link box -->
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#F0FAF5;border:2px dashed #40916C;border-radius:12px;">
        <tr>
          <td style="padding:14px 18px;">
            <p style="margin:0 0 4px;font-size:10px;font-weight:700;color:#40916C;text-transform:uppercase;letter-spacing:1px;">🔗 Your Personal Referral Link</p>
            <p style="margin:0;font-size:12px;font-family:monospace;color:#1B4332;word-break:break-all;">${link}</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- ═══ CTA BUTTONS ═══ -->
  <tr>
    <td style="padding:0 36px 32px;text-align:center;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td width="48%" style="padding-right:6px;">
            <a href="https://praqen.com/wallet" style="display:block;background:linear-gradient(135deg,#1B4332,#2D6A4F);color:#ffffff;text-decoration:none;padding:13px 10px;border-radius:12px;font-size:13px;font-weight:800;text-align:center;">
              ₮ Deposit & Trade USDT
            </a>
          </td>
          <td width="4%"></td>
          <td width="48%" style="padding-left:6px;">
            <a href="${link}" style="display:block;background:#F4A422;color:#1B4332;text-decoration:none;padding:13px 10px;border-radius:12px;font-size:13px;font-weight:800;text-align:center;">
              🎁 Share & Earn
            </a>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- ═══ FOOTER ═══ -->
  <tr>
    <td style="background:#1B4332;padding:22px 36px;text-align:center;">
      <p style="margin:0 0 6px;font-size:20px;font-weight:900;color:#F4A422;font-family:Georgia,serif;">PRAQEN</p>
      <p style="margin:0 0 10px;font-size:10px;color:rgba(255,255,255,0.45);letter-spacing:2px;text-transform:uppercase;">The Global P2P Bitcoin Platform</p>
      <p style="margin:0 0 10px;">
        <a href="https://praqen.com/buy-bitcoin" style="color:rgba(255,255,255,0.5);text-decoration:none;font-size:11px;margin:0 8px;">Buy Bitcoin</a>
        <a href="https://praqen.com/sell-bitcoin" style="color:rgba(255,255,255,0.5);text-decoration:none;font-size:11px;margin:0 8px;">Sell Bitcoin</a>
        <a href="${link}" style="color:rgba(255,255,255,0.5);text-decoration:none;font-size:11px;margin:0 8px;">Refer Friends</a>
      </p>
      <p style="margin:0;font-size:10px;color:rgba(255,255,255,0.3);">
        © ${yr} PRAQEN · You're receiving this because you have an account with us.<br>
        <a href="https://praqen.com" style="color:rgba(255,255,255,0.3);text-decoration:underline;">praqen.com</a>
      </p>
    </td>
  </tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

async function sendUsdtAnnouncementEmail({ userId, to, username, referralCode }) {
  return sendEmail({
    userId,
    to,
    subject: '🎉 Happy New Month! USDT Wallet is Live — Deposit, Trade & Earn $2 Per Referral',
    html:    buildUsdtAnnouncementHtml(username, referralCode),
    type:    'usdt_announcement_broadcast',
    metadata: { referral_code: referralCode, campaign: 'usdt_wallet_launch' },
  });
}

async function sendBroadcastToAllUsers(subject, htmlBody, broadcastType = 'broadcast') {
  const { data: users, error } = await supabase
    .from('users')
    .select('id, email, username')
    .not('email', 'is', null);

  if (error) throw new Error('Failed to fetch users: ' + error.message);

  const targets = (users || []).filter(u => u.email && u.email.trim());
  console.log(`[Broadcast] Sending "${subject}" to ${targets.length} users`);

  let sent = 0, failed = 0;
  for (const user of targets) {
    // Personalise {username} placeholder for each recipient
    const personalised = htmlBody
      .replace(/\{username\}/gi, user.username || 'Trader');

    const result = await sendEmail({
      userId: user.id,
      to:     user.email,
      subject,
      html:   base(subject, personalised),
      type:   broadcastType,
    });
    if (result.success) sent++; else failed++;
    await new Promise(r => setTimeout(r, 500));
  }
  return { sent, failed, total: targets.length };
}

module.exports = {
  sendEmail,
  sendWelcomeEmail,
  sendVerificationEmail,
  sendLoginAlertEmail,
  sendLoginOtpEmail,
  sendKycApprovedEmail,
  sendKycRejectedEmail,
  sendDisputeOpenedEmail,
  sendDisputeResolvedEmail,
  sendTradeOpenedEmail,
  sendPaymentSentEmail,
  sendTradeConfirmationEmail,
  sendTradeCancelledEmail,
  sendDepositAlertEmail,
  sendWithdrawalAlertEmail,
  sendTxReceiptEmail,
  sendBroadcastToAllUsers,
  sendEidBonusEmail,
  sendUsdtAnnouncementEmail,
};