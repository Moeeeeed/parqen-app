// PRAQEN Backend Server - COMPLETE FIXED VERSION
const path = require('path');
const dotenv = require('dotenv');

// ── 1. Load .env FIRST — before anything else ──────────────────────────────
const envResult = dotenv.config();
if (envResult.error) {
  console.warn('⚠️  No .env in backend folder, trying parent...');
  dotenv.config({ path: path.resolve(__dirname, '..', '.env') });
}

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const axios = require('axios');
const nodemailer = require('nodemailer');
const { Resend } = require('resend');
const resendClient = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
// Twilio is lazy-loaded to avoid ~150MB startup RAM cost on the free Render tier.
// The SDK is only required the first time an SMS/call is actually sent.
const TWILIO_ENABLED = !!(process.env.TWILIO_SID && process.env.TWILIO_TOKEN);
let _twilioClient = null;
function getTwilioClient() {
  if (!_twilioClient && TWILIO_ENABLED) {
    _twilioClient = require('twilio')(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);
  }
  return _twilioClient;
}
const twilioVerifySid = process.env.TWILIO_VERIFY_SID || 'VAddba23c45841679ed249d49be8a90bbe';
const TWILIO_PHONE = (process.env.TWILIO_PHONE || '').split(',')[0].trim();
const TWILIO_WA_FROM = process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886';

// ── OneSignal Push Notifications ────────────────────────────────────────────
const { sendTradeAlert, sendSystemAlert, sendBroadcastPush } = require('./services/pushNotificationService');

// ── Africa's Talking (primary SMS for African numbers) ───────────────────────
let atSms = null;
try {
  if (process.env.AFRICASTALKING_API_KEY) {
    const AfricasTalking = require('africastalking');
    const atClient = AfricasTalking({
      apiKey: process.env.AFRICASTALKING_API_KEY,
      username: process.env.AFRICASTALKING_USERNAME || 'sandbox',
    });
    atSms = atClient.SMS;
    const atMode = (process.env.AFRICASTALKING_USERNAME || 'sandbox') === 'sandbox' ? '🟡 SANDBOX' : '🟢 LIVE';
    console.log(`[AT] Africa's Talking SMS initialized ${atMode}`);
  } else {
    console.warn('[AT] No AFRICASTALKING_API_KEY — AT SMS disabled');
  }
} catch (atInitErr) {
  console.error('[AT] Init error:', atInitErr.message);
}
// CoinbaseWalletService REMOVED — Coinbase held custody of private keys.
// All wallet operations now use hdWalletService (self-custody, keys in .env MNEMONIC).
const quoteService = require('./services/quoteService');
const { E, S } = require('./utils/apiErrors');
const emailService = require('./services/emailService');
const speakeasy = require('speakeasy');

// ── 2FA login-store: maps tempTokenHash -> { code, expires, userId, method } ─
const pending2FALogin = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of pending2FALogin) { if (v.expires < now) pending2FALogin.delete(k); }
}, 60000);

// In-memory typing state: 'tradeId:userId' -> expiresAt timestamp
const typingState = {};
setInterval(() => {
  const now = Date.now();
  for (const key of Object.keys(typingState)) { if (typingState[key] < now) delete typingState[key]; }
}, 10000);

// Twilio Verify pending — tracks which phone numbers are awaiting a Twilio Verify OTP
// Key: e164 phone, Value: { expires: timestamp }
const twilioVerifyPending = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of twilioVerifyPending) { if (v.expires < now) twilioVerifyPending.delete(k); }
}, 60000);

// Email login OTP store — Key: email (lowercase), Value: { code, expires, userId }
const emailLoginOtpStore = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of emailLoginOtpStore) { if (v.expires < now) emailLoginOtpStore.delete(k); }
}, 60000);

// Password-reset tokens issued right after an OTP (phone or email) is verified
// for purpose='forgot-password'. Lets /api/auth/reset-password accept a
// one-time token from either the emailed link flow OR this OTP flow, so
// phone-only accounts (no email) can still reset their password.
// Key: resetToken, Value: { contact, method: 'phone'|'email', expires }
const passwordResetOtpTokens = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of passwordResetOtpTokens) { if (v.expires < now) passwordResetOtpTokens.delete(k); }
}, 60000);

// In-memory market cache — serves offers/listings without hitting DB on every page load
const _marketCache = new Map(); // key -> { data, ts }
const MARKET_CACHE_TTL = 300000; // 5 minutes
// Pagination metadata for /api/listings, keyed the same as _marketCache. Kept separate from
// _marketCache itself (rather than changing what getCached()/setCached() store) because
// hasMore/nextCursor must reflect the RAW query page (before balance-based filtering removes
// some rows from the cached `listings` array) — using the filtered array's last row as the
// cursor could skip rows that got filtered out of THIS page but still need to be fetched.
const _listingsPageMeta = new Map(); // key -> { hasMore, nextCursor }
function getCached(key) {
  const c = _marketCache.get(key);
  return c && Date.now() - c.ts < MARKET_CACHE_TTL ? c.data : null;
}
// Returns cached data even if stale — used as a fallback when the DB is slow.
function getCachedStale(key) {
  const c = _marketCache.get(key);
  return c ? c.data : null;
}
function setCached(key, data) { _marketCache.set(key, { data, ts: Date.now() }); }

// When something changes (trade started, listing updated), clear the cache but immediately
// kick off a background refresh so the NEXT user request hits a warm cache.
let _cacheRefreshTimer = null;
function bustCache() {
  _marketCache.clear();
  // Debounce: wait 1s then warm up the default listings key in the background
  clearTimeout(_cacheRefreshTimer);
  _cacheRefreshTimer = setTimeout(_warmListingsCache, 1000);
}

async function _warmListingsCache() {
  try {
    const { data: rawListings } = await Promise.race([
      supabaseAdmin.from('listings').select(
        'id, seller_id, listing_type, gift_card_brand, status, bitcoin_price, margin, pricing_type, currency, currency_symbol, country, country_name, payment_method, payment_methods, amount_usd, min_limit_usd, max_limit_usd, min_limit_local, max_limit_local, time_limit, trade_instructions, listing_terms, description, created_at, card_values, card_type, face_value'
      ).eq('status', 'ACTIVE').order('created_at', { ascending: false }).limit(200),
      new Promise(resolve => setTimeout(() => resolve({ data: [] }), 6000)),
    ]);
    if (!rawListings || rawListings.length === 0) return;

    const sellerIdSet = [...new Set(rawListings.map(l => l.seller_id).filter(Boolean))];
    if (sellerIdSet.length === 0) return;

    const { data: usersData } = await Promise.race([
      supabaseAdmin.from('users').select(
        'id, username, full_name, average_rating, total_trades, completion_rate, is_id_verified, is_email_verified, last_login, last_seen_at, total_feedback_count, positive_feedback, negative_feedback, country, bio, badge, avatar_url'
      ).in('id', sellerIdSet),
      new Promise(resolve => setTimeout(() => resolve({ data: [] }), 5000)),
    ]);

    // Safety: if users query failed or returned nothing, do NOT cache — better to let the
    // main /api/listings route handle it with a fresh full query.
    if (!usersData || usersData.length === 0) return;

    const userMap = {};
    usersData.forEach(u => { userMap[u.id] = u; });

    // Only include listings whose seller data was successfully fetched
    const listings = rawListings
      .filter(l => userMap[l.seller_id]) // skip any listing with no user dataxa
      .map(l => {
        const u = userMap[l.seller_id];
        return { ...l, users: { ...u, avatar_url: capAvatar(u.avatar_url), display_name: computeDisplayName(u), country: u.country || null } };
      });

    if (listings.length === 0) return; // nothing valid to cache
    setCached('listings|||', listings);
  } catch (e) {
    console.error('[_warmListingsCache] error:', e.message);
  }
}

// ── 2. Read & validate env vars immediately after loading ──────────────────
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('🔑 ENV check:');
console.log('   SUPABASE_URL:              ', SUPABASE_URL ? '✅ FOUND' : '❌ MISSING');
console.log('   SUPABASE_ANON_KEY:         ', SUPABASE_ANON_KEY ? '✅ FOUND' : '❌ MISSING');
console.log('   SUPABASE_SERVICE_ROLE_KEY: ', SUPABASE_SERVICE_ROLE_KEY ? '✅ FOUND' : '⚠️  MISSING (using anon key)');

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('❌ FATAL: Missing SUPABASE_URL or SUPABASE_ANON_KEY in .env');
  process.exit(1);
}

// ── 3. Initialize Supabase BEFORE any route files ──────────────────────────
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const supabaseAdmin = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY
);

// ── 4. Other services ──────────────────────────────────────────────────────

// Show the user's username (handle) in market cards.
function computeDisplayName(user) {
  if (!user) return '';
  return user.username || '';
}

// avatar_url is sometimes a raw base64 data: URI (legacy uploads, before the frontend
// compressed images before sending) — some are multi-MB. Embedding that inline in every
// listing a seller has made bulk marketplace responses balloon to tens of MB, which is
// the dominant cause of slow load times on the Buy/Sell/Gift Card pages. Cap it here so
// bulk/list responses never inline an oversized avatar; the frontend's <Avatar> component
// already lazy-fetches the real image per-card from GET /api/users/:id/avatar when the
// bulk response omits it, so this doesn't lose the photo — it just stops shipping it 50x
// over on every marketplace load.
const MAX_INLINE_AVATAR_CHARS = 20000; // ~15KB decoded — generous for a compressed thumbnail
function capAvatar(url) {
  return (typeof url === 'string' && url.length > MAX_INLINE_AVATAR_CHARS) ? null : (url || null);
}

// ── 5. Express ─────────────────────────────────────────────────────────────
const app = express();

// Render sits in front of this app as a reverse proxy — without this, Express treats
// every request as if it came directly from Render's proxy IP, which breaks
// express-rate-limit's per-client IP keying (and its X-Forwarded-For trust warning) below.
app.set('trust proxy', 1);

// Security headers — applied before everything else
app.use(helmet({
  contentSecurityPolicy: false, // pure API server, no HTML pages served
  crossOriginEmbedderPolicy: false, // allow API calls from the frontend
  crossOriginResourcePolicy: false, // allow cross-origin fetch from browser
  crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' }, // allow Google Sign-In popup postMessage
}));

// CORS — only allow requests from our own frontend domain
const _allowedOrigins = (process.env.FRONTEND_URL || 'https://praqen.com')
  .split(',').map(o => o.trim());

app.use(cors({
  origin: (origin, callback) => {
    // No origin = mobile app or server-to-server call — always allow
    if (!origin) return callback(null, true);
    // Allow listed production origins
    if (_allowedOrigins.some(a => origin === a)) return callback(null, true);
    // Allow localhost in development only
    if (process.env.NODE_ENV !== 'production' && origin.startsWith('http://localhost')) {
      return callback(null, true);
    }
    callback(new Error('CORS: origin not allowed — ' + origin));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  maxAge: 86400, // browser caches preflight for 24 hours
}));

// Webhook signature verification needs the exact raw bytes Coinbase signed — must be
// captured BEFORE the global JSON parser below consumes the request stream. body-parser
// sets req._body once it runs, so express.json() will see that and skip re-parsing,
// leaving req.body as this Buffer for that one path only.
app.use('/api/wallet/webhook', express.raw({ type: '*/*' }));

app.use(express.json({ limit: '6mb' })); // raised from 2mb — KYC route needs headroom for 2 compressed base64 images (~1.1–1.9mb each after canvas compression)

// ── Lightweight perf timing for a curated set of endpoints ─────────────────
// Only method, path, duration, and status — never bodies, headers, tokens,
// wallet addresses, or KYC data. Purely observational (res.on('finish')),
// doesn't touch anything inside the routes it watches.
const PERF_WATCH_PATHS = ['/api/listings', '/api/hd-wallet/wallet', '/api/users/profile'];
app.use((req, res, next) => {
  if (!PERF_WATCH_PATHS.some(p => req.path === p)) return next();
  const start = Date.now();
  res.on('finish', () => {
    console.log(`[PERF] ${req.method} ${req.path} ${Date.now() - start}ms ${res.statusCode}`);
  });
  next();
});

// ── Rate Limiters ──────────────────────────────────────────────────────────
const rateLimit = require('express-rate-limit');

// Auth endpoints: 10 attempts per 15 minutes per IP (brute-force protection)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many attempts. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
});

// OTP/verification: 5 requests per 10 minutes per IP (code-flooding protection)
const otpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  message: { error: 'Too many verification requests. Please wait 10 minutes before trying again.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Trade actions: 30 per minute per IP (spam protection)
const tradeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: 'Too many trade requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ── 6. HD Wallet + Deposit Monitor ────────────────────────────────────────
const hdWalletService = require('./services/hdWalletService');
const depositMonitor = require('./services/depositMonitor');
const realtimeDepositService = require('./services/realtimeDepositService');
const sweepService = require('./services/sweepService');
const hdWalletRoutes = require('./routes/hdWalletRoutes');
const tradeEscrowService = require('./services/tradeEscrowService');
const actionCodeService = require('./services/actionCodeService');
const balanceIntegrity = require('./services/balanceIntegrityService');
const { checkAndAwardBadges } = require('./services/badgeService');
const { syncAllOfferStatuses, deactivateStaleOffers, setCacheBuster, setBtcPriceGetter } = require('./services/offerStatusService');
setCacheBuster(bustCache);
// Was never wired up — offerStatusService's pause sweep was silently running on the
// $88k hardcoded fallback instead of the live price used everywhere else (GET /api/listings,
// offer creation), so its pause/reactivate decisions could disagree with what buyers saw.
setBtcPriceGetter(() => _btcCache || 88000);
app.use('/api/hd-wallet', hdWalletRoutes);

// NOTE: walletRoutes removed — wallet routes are defined inline below
// to avoid Supabase-not-initialized errors in external route files.

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is not set. Refusing to start with an insecure default secret.');
}
const JWT_SECRET = process.env.JWT_SECRET;
const otpStore = new Map();
const verificationCodes = new Map();

// Phone dial code → ISO country code map (sorted longest-first for prefix matching)
const PHONE_DIAL_TO_CC = {
  '+1': '+1',   // resolved below with special case
  '+7': 'RU', '+20': 'EG', '+27': 'ZA', '+30': 'GR', '+31': 'NL', '+32': 'BE', '+33': 'FR',
  '+34': 'ES', '+36': 'HU', '+39': 'IT', '+40': 'RO', '+41': 'CH', '+43': 'AT', '+44': 'GB',
  '+45': 'DK', '+46': 'SE', '+47': 'NO', '+48': 'PL', '+49': 'DE', '+51': 'PE', '+52': 'MX',
  '+53': 'CU', '+54': 'AR', '+55': 'BR', '+56': 'CL', '+57': 'CO', '+58': 'VE', '+60': 'MY',
  '+61': 'AU', '+62': 'ID', '+63': 'PH', '+64': 'NZ', '+65': 'SG', '+66': 'TH', '+81': 'JP',
  '+82': 'KR', '+84': 'VN', '+86': 'CN', '+90': 'TR', '+91': 'IN', '+92': 'PK', '+93': 'AF',
  '+94': 'LK', '+95': 'MM', '+98': 'IR',
  '+212': 'MA', '+213': 'DZ', '+216': 'TN', '+218': 'LY', '+220': 'GM', '+221': 'SN',
  '+222': 'MR', '+223': 'ML', '+224': 'GN', '+225': 'CI', '+226': 'BF', '+227': 'NE',
  '+228': 'TG', '+229': 'BJ', '+230': 'MU', '+231': 'LR', '+232': 'SL', '+233': 'GH',
  '+234': 'NG', '+235': 'TD', '+236': 'CF', '+237': 'CM', '+238': 'CV', '+239': 'ST',
  '+240': 'GQ', '+241': 'GA', '+242': 'CG', '+243': 'CD', '+244': 'AO', '+245': 'GW',
  '+248': 'SC', '+249': 'SD', '+250': 'RW', '+251': 'ET', '+252': 'SO', '+253': 'DJ',
  '+254': 'KE', '+255': 'TZ', '+256': 'UG', '+257': 'BI', '+258': 'MZ', '+260': 'ZM',
  '+261': 'MG', '+263': 'ZW', '+264': 'NA', '+265': 'MW', '+266': 'LS', '+267': 'BW',
  '+268': 'SZ', '+269': 'KM', '+291': 'ER', '+297': 'AW', '+350': 'GI', '+351': 'PT',
  '+352': 'LU', '+353': 'IE', '+354': 'IS', '+355': 'AL', '+356': 'MT', '+357': 'CY',
  '+358': 'FI', '+359': 'BG', '+370': 'LT', '+371': 'LV', '+372': 'EE', '+373': 'MD',
  '+374': 'AM', '+375': 'BY', '+376': 'AD', '+377': 'MC', '+380': 'UA', '+381': 'RS',
  '+385': 'HR', '+386': 'SI', '+387': 'BA', '+389': 'MK', '+420': 'CZ', '+421': 'SK',
  '+501': 'BZ', '+502': 'GT', '+503': 'SV', '+504': 'HN', '+505': 'NI', '+506': 'CR',
  '+507': 'PA', '+509': 'HT', '+591': 'BO', '+592': 'GY', '+593': 'EC', '+595': 'PY',
  '+597': 'SR', '+598': 'UY', '+670': 'TL', '+673': 'BN', '+675': 'PG', '+676': 'TO',
  '+677': 'SB', '+678': 'VU', '+679': 'FJ', '+686': 'KI', '+688': 'TV', '+691': 'FM',
  '+850': 'KP', '+852': 'HK', '+853': 'MO', '+855': 'KH', '+856': 'LA', '+880': 'BD',
  '+886': 'TW', '+960': 'MV', '+961': 'LB', '+962': 'JO', '+963': 'SY', '+964': 'IQ',
  '+965': 'KW', '+966': 'SA', '+967': 'YE', '+968': 'OM', '+971': 'AE', '+972': 'IL',
  '+973': 'BH', '+974': 'QA', '+975': 'BT', '+976': 'MN', '+977': 'NP', '+992': 'TJ',
  '+993': 'TM', '+994': 'AZ', '+995': 'GE', '+996': 'KG', '+998': 'UZ',
};

function phoneToCountryCode(phone) {
  if (!phone) return null;
  const normalized = String(phone).trim();
  const withPlus = normalized.startsWith('+') ? normalized : `+${normalized}`;
  // Try longest prefix first so +233 matches before +2
  const prefixes = Object.keys(PHONE_DIAL_TO_CC).sort((a, b) => b.length - a.length);
  for (const prefix of prefixes) {
    if (withPlus.startsWith(prefix)) {
      const cc = PHONE_DIAL_TO_CC[prefix];
      if (cc === '+1') return 'US'; // simplification — +1 covers US/CA
      return cc;
    }
  }
  return null;
}

const disposableDomains = require('disposable-email-domains');

async function validateEmailForRegistration(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return { valid: false, error: 'Enter a valid email address.' };
  }

  const domain = email.split('@')[1].toLowerCase();
  if (disposableDomains.includes(domain)) {
    return { valid: false, error: 'Disposable or temporary email addresses are not allowed. Please use a permanent email.' };
  }

  try {
    const dns = require('dns').promises;
    // Bounded timeout — an unbounded DNS lookup could otherwise hang the whole
    // registration request indefinitely on a slow/unresponsive resolver.
    const mxRecords = await Promise.race([
      dns.resolveMx(domain),
      new Promise((_, reject) => setTimeout(() => reject(new Error('MX lookup timed out')), 4000)),
    ]);
    if (!mxRecords || mxRecords.length === 0) {
      return { valid: false, error: 'This email domain does not appear to accept mail. Please check your email address.' };
    }
  } catch (e) {
    // A DNS error/timeout here means we couldn't verify the domain — it does NOT mean
    // the domain is invalid. Blocking registration on a transient resolver hiccup would
    // reject real users with valid emails; the disposable-domain check above plus the
    // email verification-code step later in the flow already guard against fake/dead
    // addresses, so fail open here instead of fail closed.
    console.warn(`[validateEmailForRegistration] MX lookup failed for ${domain}: ${e.message} — allowing registration to proceed`);
  }

  return { valid: true };
}

// Resolve client IP + phone → ISO country code (fire-and-forget, never blocks login)
// Priority: KYC country > phone number > IP geolocation — NEVER default to any country
async function detectAndSaveCountry(userId, req, phoneNumber) {
  try {
    if (!userId) return;

    // Fetch current stored values
    const { data: existing } = await supabaseAdmin
      .from('users').select('country, phone').eq('id', userId).single();

    // ── Priority 1: Phone country code ────────────────────────────────────
    const phone = phoneNumber || existing?.phone;
    const phoneCC = phoneToCountryCode(phone);
    if (phoneCC && !existing?.country) {
      await supabaseAdmin.from('users')
        .update({ country: phoneCC })
        .eq('id', userId)
        .or('country.is.null,country.eq.');
      console.log(`[GeoIP] user ${String(userId).slice(0, 8)} → ${phoneCC} (phone)`);
    }

    // ── Priority 3: IP geolocation ────────────────────────────────────────
    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
      || req.headers['x-real-ip']
      || req.socket?.remoteAddress
      || '';
    // TEMP DEBUG - print detected IP + whether it would be skipped as private.
    const _skipPrivate = !ip || ip === '::1' || ip.startsWith('127.') || ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('::ffff:');
    console.log(`[GeoIP DEBUG] ip="${ip || '(none)'}" skippedAsPrivate=${_skipPrivate}`);
    // Skip loopback / private / empty (avoids looking up server's own IP)
    if (_skipPrivate) return;

    const geoRes = await fetch(`https://ipapi.co/${ip}/json/`, { signal: AbortSignal.timeout(4000) });
    const geo = await geoRes.json();
    // TEMP DEBUG - print raw API response + HTTP status so we can see why the lookup fails
    console.log(`[GeoIP DEBUG] ipapi.co status=${geoRes.status} raw=${JSON.stringify(geo)}`);
    if (geo?.country_code && geo.country_code.length === 2 && !geo.error) {
      const cc = geo.country_code.toUpperCase();
      const city = geo.city || null;
      const countryName = geo.country_name || cc;
      const loc = city ? `${countryName} (${city})` : countryName;

      // Always refresh city/name/location (UI always benefits from fresh geo data)
      await supabaseAdmin.from('users')
        .update({ city, country_name: countryName, last_seen_location: loc })
        .eq('id', userId);

      // Set country code only if not already set by phone
      await supabaseAdmin.from('users')
        .update({ country: cc })
        .eq('id', userId)
        .or('country.is.null,country.eq.');

      console.log(`[GeoIP] user ${String(userId).slice(0, 8)} → ${cc}${city ? ` / ${city}` : ''} (IP: ${ip})`);
    }
  } catch (err) { /* geo lookup failure never breaks login */
    // TEMP DEBUG — print any error so we can see what's failing
    console.error('[GeoIP DEBUG] detectAndSaveCountry error:', err?.message || err);
  }
}

// ── Phone rate limiting (anti-abuse for OTP / phone verification) ────────────
const phoneRateLimits = new Map();

function getPhoneLimitRecord(phone) {
  const today = new Date().toDateString();
  let rec = phoneRateLimits.get(phone) || { requestsToday: 0, failedAttempts: 0, lastRequest: 0, lockedUntil: 0, requestsDate: today };
  if (rec.requestsDate !== today) {
    rec = { ...rec, requestsToday: 0, requestsDate: today };
    phoneRateLimits.set(phone, rec);
  }
  return rec;
}

function checkPhoneRateLimit(phone, isVerification = false) {
  const now = Date.now();
  const rec = getPhoneLimitRecord(phone);
  if (rec.lockedUntil > now) {
    const mins = Math.ceil((rec.lockedUntil - now) / 60000);
    return { blocked: true, error: `Too many attempts. Phone locked — try again in ${mins} minute(s).` };
  }
  if (!isVerification) {
    if (rec.requestsToday >= 3) {
      rec.lockedUntil = now + 24 * 60 * 60 * 1000;
      phoneRateLimits.set(phone, rec);
      return { blocked: true, error: 'Maximum OTP requests reached. Try again in 24 hours.' };
    }
    if (rec.lastRequest > 0 && now - rec.lastRequest < 60 * 1000) {
      const secs = Math.ceil((60 * 1000 - (now - rec.lastRequest)) / 1000);
      return { blocked: true, error: `Please wait ${secs} second(s) before requesting another code.` };
    }
  }
  return { blocked: false };
}

function recordPhoneRequest(phone) {
  const rec = getPhoneLimitRecord(phone);
  rec.requestsToday += 1;
  rec.lastRequest = Date.now();
  phoneRateLimits.set(phone, rec);
}

function recordPhoneFailure(phone) {
  const rec = getPhoneLimitRecord(phone);
  rec.failedAttempts = (rec.failedAttempts || 0) + 1;
  if (rec.failedAttempts >= 3) {
    rec.lockedUntil = Date.now() + 24 * 60 * 60 * 1000;
  }
  phoneRateLimits.set(phone, rec);
}

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  tls: { rejectUnauthorized: false },
});

// ── Trade Notification Helpers ───────────────────────────────────────────────

function tradeEmailTemplate(subject, title, message, tradeRef, amount, actionUrl) {
  const year = new Date().getFullYear();
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background-color:#F0F4F1;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#F0F4F1;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="520" cellpadding="0" cellspacing="0" style="background:#FFFFFF;border-radius:20px;overflow:hidden;box-shadow:0 8px 32px rgba(27,67,50,0.10);">

          <!-- HEADER -->
          <tr>
            <td style="background:linear-gradient(135deg,#1B4332 0%,#2D6A4F 60%,#40916C 100%);padding:36px 32px 28px;text-align:center;">
              <a href="https://praqen.com" style="text-decoration:none;">
                <div style="display:inline-block;background:#fff;border-radius:18px;width:60px;height:60px;line-height:60px;text-align:center;margin-bottom:14px;">
                  <img src="https://praqen.com/logo512.png" width="44" height="44" alt="PRAQEN" style="vertical-align:middle;border-radius:10px;">
                </div>
                <h1 style="color:#FFFFFF;font-size:26px;font-weight:900;margin:0 0 4px 0;letter-spacing:-0.5px;">PRAQEN</h1>
              </a>
              <p style="color:#95C4AE;font-size:12px;margin:0;letter-spacing:1px;text-transform:uppercase;">The Global P2P Bitcoin Platform</p>
            </td>
          </tr>

          <!-- BODY -->
          <tr>
            <td style="padding:36px 32px 28px;">
              <h2 style="color:#1B4332;font-size:20px;font-weight:800;margin:0 0 10px 0;">${title}</h2>
              <p style="color:#475569;font-size:14px;line-height:1.7;margin:0 0 24px 0;">${message}</p>

              ${(tradeRef || amount) ? `
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#F0F4F1;border-radius:14px;margin-bottom:24px;overflow:hidden;">
                <tr>
                  <td style="padding:20px 24px;">
                    ${tradeRef ? `
                    <table width="100%" style="margin-bottom:10px;">
                      <tr>
                        <td style="color:#64748B;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Trade Reference</td>
                        <td style="text-align:right;">
                          <span style="background:#1B4332;color:#FFFFFF;font-size:11px;font-weight:700;padding:4px 10px;border-radius:6px;letter-spacing:0.5px;">#${tradeRef}</span>
                        </td>
                      </tr>
                    </table>` : ''}
                    ${amount ? `
                    <table width="100%">
                      <tr>
                        <td style="color:#64748B;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Amount</td>
                        <td style="text-align:right;color:#1B4332;font-size:18px;font-weight:900;">₿ ${amount}</td>
                      </tr>
                    </table>` : ''}
                  </td>
                </tr>
              </table>` : ''}

              ${actionUrl ? `
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
                <tr>
                  <td align="center">
                    <a href="${actionUrl}" style="display:inline-block;background:linear-gradient(135deg,#1B4332,#2D6A4F);color:#FFFFFF;text-align:center;padding:15px 40px;border-radius:12px;text-decoration:none;font-weight:700;font-size:15px;letter-spacing:0.2px;">View on PRAQEN →</a>
                  </td>
                </tr>
              </table>` : ''}

              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="border-top:1px solid #E8F0EB;padding-top:20px;">
                    <p style="color:#94A3B8;font-size:11px;margin:0;line-height:1.6;">
                      🔒 This is an automated message from PRAQEN. Your funds are always protected by our escrow system. Never share your login credentials with anyone.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td style="background:#F0F4F1;padding:20px 32px;text-align:center;">
              <p style="margin:0 0 10px;">
                <a href="https://x.com/praqenapp?s=21" style="color:#64748B;text-decoration:none;font-size:11px;font-weight:700;margin:0 8px;">X / Twitter</a>
                <a href="https://www.instagram.com/praqen?igsh=MTRkZWg2amp5YnJlYQ%3D%3D&amp;utm_source=qr" style="color:#64748B;text-decoration:none;font-size:11px;font-weight:700;margin:0 8px;">Instagram</a>
                <a href="https://www.linkedin.com/in/pra-qen-045373402/" style="color:#64748B;text-decoration:none;font-size:11px;font-weight:700;margin:0 8px;">LinkedIn</a>
              </p>
              <p style="color:#64748B;font-size:11px;font-weight:700;margin:0 0 4px 0;letter-spacing:0.5px;">PRAQEN — SECURE P2P BITCOIN TRADING</p>
              <p style="color:#94A3B8;font-size:10px;margin:0;">Escrow Protected · 0.5% Fee · Trusted by traders worldwide</p>
              <p style="color:#CBD5E1;font-size:10px;margin:8px 0 0 0;">© ${year} PRAQEN. All rights reserved. Do not reply to this email.</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

async function notifyUserEmail(userId, subject, htmlContent) {
  try {
    const { data: user, error: dbErr } = await supabaseAdmin.from('users').select('email').eq('id', userId).single();
    if (dbErr) { console.error(`[Email] DB lookup failed for ${userId}:`, dbErr.message); return; }
    if (!user?.email) { console.warn(`[Email] No email on file for user ${userId} — skipping`); return; }
    await emailService.sendEmail({ userId, to: user.email, subject, html: htmlContent, type: 'trade_notification' });
  } catch (err) {
    console.error(`[Email] notifyUserEmail error for ${userId}:`, err.message);
  }
}

async function notifyTradeParties(trade, subject, _smsMessage, htmlContent) {
  const ids = [trade.buyer_id, trade.seller_id].filter(Boolean);
  await Promise.allSettled(ids.map(id => notifyUserEmail(id, subject, htmlContent)));
}

// ────────────────────────────────────────────────────────────────────────────

// ── Branded email HTML builders ──────────────────────────────────────────────
function buildVerificationEmailHtml(code) {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PRAQEN Verification Code</title></head>
<body style="margin:0;padding:0;background:#F0FAF5;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F0FAF5;padding:32px 0;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(27,67,50,0.10);">
        <!-- Header -->
        <tr><td style="background:linear-gradient(135deg,#1B4332 0%,#2D6A4F 100%);padding:32px 40px;text-align:center;">
          <a href="https://praqen.com" style="text-decoration:none;">
            <div style="display:inline-block;width:56px;height:56px;background:#fff;border-radius:14px;line-height:56px;text-align:center;">
              <img src="https://praqen.com/logo512.png" width="40" height="40" alt="PRAQEN" style="vertical-align:middle;border-radius:8px;">
            </div>
            <p style="margin:12px 0 0;color:#ffffff;font-size:20px;font-weight:800;letter-spacing:3px;">PRAQEN</p>
          </a>
          <p style="margin:4px 0 0;color:rgba(255,255,255,0.65);font-size:12px;letter-spacing:1px;">The World's Most Trusted Bitcoin Marketplace</p>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:40px 40px 32px;text-align:center;">
          <p style="margin:0 0 8px;font-size:16px;font-weight:600;color:#334155;">Your Verification Code</p>
          <p style="margin:0 0 28px;font-size:13px;color:#64748B;line-height:1.6;">Use the code below to verify your account. It expires in <strong>10 minutes</strong>.</p>
          <!-- Code box -->
          <div style="display:inline-block;background:#F0FAF5;border:2px solid #2D6A4F;border-radius:12px;padding:20px 48px;margin-bottom:28px;">
            <span style="font-size:42px;font-weight:900;letter-spacing:10px;color:#1B4332;font-family:'Courier New',monospace;">${code}</span>
          </div>
          <p style="margin:0 0 8px;font-size:12px;color:#94A3B8;">If you didn't request this, you can safely ignore this email.</p>
          <p style="margin:0;font-size:12px;color:#94A3B8;">Never share this code with anyone — PRAQEN will never ask for it.</p>
        </td></tr>
        <!-- Warning -->
        <tr><td style="padding:0 40px 24px;">
          <div style="background:#FEF3C7;border:1px solid #FDE68A;border-radius:10px;padding:14px 18px;text-align:center;">
            <p style="margin:0;font-size:12px;font-weight:700;color:#92400E;">⚠️ Always trade within PRAQEN — never outside our platform</p>
          </div>
        </td></tr>
        <!-- Footer -->
        <tr><td style="background:#F8FAFC;padding:24px 40px;text-align:center;border-top:1px solid #E2E8F0;">
          <p style="margin:0 0 12px;">
            <a href="https://x.com/praqenapp?s=21" style="color:#64748B;text-decoration:none;font-size:11px;font-weight:700;margin:0 8px;">X / Twitter</a>
            <a href="https://www.instagram.com/praqen?igsh=MTRkZWg2amp5YnJlYQ%3D%3D&amp;utm_source=qr" style="color:#64748B;text-decoration:none;font-size:11px;font-weight:700;margin:0 8px;">Instagram</a>
            <a href="https://www.linkedin.com/in/pra-qen-045373402/" style="color:#64748B;text-decoration:none;font-size:11px;font-weight:700;margin:0 8px;">LinkedIn</a>
          </p>
          <p style="margin:0 0 4px;font-size:12px;color:#94A3B8;">Need help? Contact us at <a href="mailto:support@praqen.com" style="color:#2D6A4F;font-weight:700;">support@praqen.com</a> · <a href="https://praqen.com" style="color:#2D6A4F;font-weight:700;">praqen.com</a></p>
          <p style="margin:0;font-size:11px;color:#CBD5E1;">© ${new Date().getFullYear()} PRAQEN · The World's Most Trusted P2P Bitcoin Marketplace</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function buildWelcomeEmailHtml(username) {
  const name = username || 'Trader';
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Welcome to PRAQEN!</title></head>
<body style="margin:0;padding:0;background:#F0FAF5;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F0FAF5;padding:32px 0;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(27,67,50,0.10);">
        <!-- Header -->
        <tr><td style="background:linear-gradient(135deg,#1B4332 0%,#2D6A4F 100%);padding:40px 40px 32px;text-align:center;">
          <a href="https://praqen.com" style="text-decoration:none;">
            <div style="display:inline-block;width:64px;height:64px;background:#fff;border-radius:16px;line-height:64px;text-align:center;">
              <img src="https://praqen.com/logo512.png" width="46" height="46" alt="PRAQEN" style="vertical-align:middle;border-radius:10px;">
            </div>
            <p style="margin:14px 0 4px;color:#ffffff;font-size:22px;font-weight:900;letter-spacing:3px;">PRAQEN</p>
          </a>
          <p style="margin:0;color:rgba(255,255,255,0.70);font-size:13px;letter-spacing:1px;">The World's Most Trusted Bitcoin Marketplace</p>
        </td></tr>
        <!-- Welcome headline -->
        <tr><td style="padding:36px 40px 8px;text-align:center;">
          <p style="margin:0 0 6px;font-size:22px;font-weight:800;color:#1B4332;">Welcome aboard, ${name}! 🎉</p>
          <p style="margin:0;font-size:14px;color:#64748B;line-height:1.7;">You've just joined <strong>the world's most trusted peer-to-peer Bitcoin marketplace</strong>. We're so glad you're here — think of PRAQEN as your secure home to buy, sell and trade Bitcoin freely and confidently.</p>
        </td></tr>
        <!-- Steps -->
        <tr><td style="padding:28px 40px;">
          <!-- Step 1 -->
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
            <tr>
              <td width="48" valign="top"><div style="width:40px;height:40px;background:#EFF6FF;border-radius:10px;text-align:center;line-height:40px;font-size:20px;">🔐</div></td>
              <td style="padding-left:14px;">
                <p style="margin:0 0 2px;font-size:14px;font-weight:700;color:#1B4332;">Verify Your Details</p>
                <p style="margin:0;font-size:13px;color:#64748B;line-height:1.6;">Go to <strong>Settings → Verification</strong> to verify your email, phone and ID. This keeps you protected and unlocks higher trade limits.</p>
              </td>
            </tr>
          </table>
          <!-- Step 2 -->
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
            <tr>
              <td width="48" valign="top"><div style="width:40px;height:40px;background:#FEF3C7;border-radius:10px;text-align:center;line-height:40px;font-size:20px;">₿</div></td>
              <td style="padding-left:14px;">
                <p style="margin:0 0 2px;font-size:14px;font-weight:700;color:#1B4332;">Buy Bitcoin Easily</p>
                <p style="margin:0;font-size:13px;color:#64748B;line-height:1.6;">Visit the <strong>Buy Bitcoin</strong> page, pick a trusted vendor, choose your payment method (Mobile Money, bank transfer & more) and open a trade. Your Bitcoin is held in escrow until payment is confirmed.</p>
              </td>
            </tr>
          </table>
          <!-- Step 3 -->
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
            <tr>
              <td width="48" valign="top"><div style="width:40px;height:40px;background:#F3E8FF;border-radius:10px;text-align:center;line-height:40px;font-size:20px;">🎁</div></td>
              <td style="padding-left:14px;">
                <p style="margin:0 0 2px;font-size:14px;font-weight:700;color:#1B4332;">Cash In Gift Cards</p>
                <p style="margin:0;font-size:13px;color:#64748B;line-height:1.6;">Turn unused gift cards into Bitcoin in minutes on the <strong>Gift Card Marketplace</strong>. Amazon, iTunes, Steam and many more accepted!</p>
              </td>
            </tr>
          </table>
          <!-- Step 4 -->
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td width="48" valign="top"><div style="width:40px;height:40px;background:#F0FAF5;border-radius:10px;text-align:center;line-height:40px;font-size:20px;">💸</div></td>
              <td style="padding-left:14px;">
                <p style="margin:0 0 2px;font-size:14px;font-weight:700;color:#1B4332;">Sell Bitcoin & Create Offers</p>
                <p style="margin:0;font-size:13px;color:#64748B;line-height:1.6;">Load your wallet and create your own buy/sell offers at your own rates. Build your reputation and earn more profit every trade!</p>
              </td>
            </tr>
          </table>
        </td></tr>
        <!-- CTA -->
        <tr><td style="padding:8px 40px 32px;text-align:center;">
          <a href="https://praqen.com/buy-bitcoin" style="display:inline-block;background:linear-gradient(135deg,#1B4332,#2D6A4F);color:#ffffff;text-decoration:none;font-size:15px;font-weight:800;padding:14px 36px;border-radius:10px;letter-spacing:0.5px;">🚀 Start Trading Now</a>
        </td></tr>
        <!-- Warning -->
        <tr><td style="padding:0 40px 24px;">
          <div style="background:#FEF3C7;border:1px solid #FDE68A;border-radius:10px;padding:14px 18px;text-align:center;">
            <p style="margin:0;font-size:12px;font-weight:700;color:#92400E;">⚠️ Always trade within PRAQEN — never share your OTP or trade outside the platform</p>
          </div>
        </td></tr>
        <!-- Footer -->
        <tr><td style="background:#F8FAFC;padding:24px 40px;text-align:center;border-top:1px solid #E2E8F0;">
          <p style="margin:0 0 12px;">
            <a href="https://x.com/praqenapp?s=21" style="color:#64748B;text-decoration:none;font-size:11px;font-weight:700;margin:0 8px;">X / Twitter</a>
            <a href="https://www.instagram.com/praqen?igsh=MTRkZWg2amp5YnJlYQ%3D%3D&amp;utm_source=qr" style="color:#64748B;text-decoration:none;font-size:11px;font-weight:700;margin:0 8px;">Instagram</a>
            <a href="https://www.linkedin.com/in/pra-qen-045373402/" style="color:#64748B;text-decoration:none;font-size:11px;font-weight:700;margin:0 8px;">LinkedIn</a>
          </p>
          <p style="margin:0 0 4px;font-size:12px;color:#94A3B8;">Questions? Reach us at <a href="mailto:support@praqen.com" style="color:#2D6A4F;font-weight:700;">support@praqen.com</a> · <a href="https://praqen.com" style="color:#2D6A4F;font-weight:700;">praqen.com</a></p>
          <p style="margin:0;font-size:11px;color:#CBD5E1;">© ${new Date().getFullYear()} PRAQEN · The World's Most Trusted P2P Bitcoin Marketplace</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// NOTE: For Resend to deliver to real inboxes, verify praqen.com in your Resend dashboard
// then set RESEND_FROM=hello@praqen.com in .env
const RESEND_FROM_ADDR = process.env.RESEND_FROM || 'PRAQEN <hello@praqen.com>';

async function sendVerificationEmail(email, code, subject = 'Your PRAQEN Verification Code') {
  console.log(`📧 Sending verification to ${email}`);
  const html = buildVerificationEmailHtml(code);

  // ── Use emailService.sendEmail (Brevo SMTP + Resend fallback, same working path) ──
  const result = await emailService.sendEmail({
    to: email,
    subject,
    html,
    type: 'verification',
    metadata: { code_hint: String(code).slice(0, 2) + '****' },
  });

  if (result.success) {
    console.log(`✅ Verification email sent via emailService to ${email} (${result.messageId})`);
    return true;
  }

  throw new Error(`All email providers failed for ${email}: ${result.error}`);
}

async function sendWelcomeEmail(email, username) {
  const html = buildWelcomeEmailHtml(username);
  const subject = `Welcome to PRAQEN, ${username || 'Trader'}! 🎉`;

  // Try Resend first
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: RESEND_FROM_ADDR, to: email, subject, html }),
    });
    const data = await response.json();
    if (data.id) { console.log(`✅ Welcome email sent via Resend to ${email}`); return; }
    throw new Error(JSON.stringify(data));
  } catch (e) {
    console.warn(`[Welcome email] Resend failed for ${email}:`, e.message);
  }

  // Fallback: Gmail SMTP
  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
    });
    await transporter.sendMail({
      from: `"PRAQEN" <${process.env.EMAIL_USER}>`,
      to: email, subject, html,
    });
    console.log(`✅ Welcome email sent via Gmail to ${email}`);
  } catch (e) {
    console.warn(`[Welcome email] Gmail also failed for ${email}:`, e.message);
  }
}

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

function generateMockWallet() {
  // ── DEPRECATED: returns placeholder — real address generated by HD wallet below
  return '';
}

// ── Is this a MAINNET-only Bitcoin address? ───────────────────────────────
// SECURITY: tb1/mn/2 are TESTNET prefixes — NEVER allow on mainnet.
// Sending mainnet BTC to a testnet address = permanent irreversible loss.
function isRealBtcAddress(addr) {
  if (!addr || typeof addr !== 'string') return false;
  // bc1q / bc1p = native SegWit mainnet ONLY
  // 1... = legacy P2PKH mainnet ONLY
  // 3... = P2SH mainnet ONLY
  // tb1, m, n, 2 are TESTNET — explicitly BLOCKED
  return /^(bc1[a-z0-9]{25,87}|[13][a-zA-HJ-NP-Z1-9]{25,34})$/.test(addr);
}

// ── Upgrade a user's fake mock address to a real HD wallet address ────────
async function upgradeToHDAddress(userId, username) {
  try {
    const real = hdWalletService.generateUserAddress(userId);
    await supabaseAdmin.from('users').update({
      bitcoin_wallet_address: real.address,
      updated_at: new Date().toISOString(),
    }).eq('id', userId);
    console.log(`✅ [upgrade] ${username} → ${real.address}`);
    return real.address;
  } catch (e) {
    console.error(`[upgrade] Failed for ${username}:`, e.message);
    return null;
  }
}

async function generateUniqueReferralCode(username) {
  const cleanedName = (username || 'user').replace(/\W/g, '').toLowerCase().slice(0, 8) || 'user';
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  for (let attempt = 0; attempt < 10; attempt++) {
    const suffix = Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
    const code = `${cleanedName}_${suffix}`;
    const { data, error } = await supabaseAdmin.from('users').select('id').eq('referral_code', code).maybeSingle();
    if (error) throw error;
    if (!data) return code;
  }
  throw new Error('Could not generate a unique referral code. Please try again.');
}

function encryptCode(code, key = 'mock-encryption-key') {
  const cipher = crypto.createCipher('aes-256-cbc', key);
  return cipher.update(code, 'utf8', 'hex') + cipher.final('hex');
}

function calculateFee(btcAmount) {
  return (parseFloat(btcAmount) * 0.01).toFixed(8);
}

// allowCached=true (default): reuse _btcCache for up to BTC_CACHE_TTL — for display-only
// call sites (rates, balance display, listings). allowCached=false: always hit the live
// sources — used ONLY by the trade-settlement call site, which must never price a trade off
// a stale cached value. The cache itself is only ever written on a validated live price
// (price > 1000, same check as before) — a failed/invalid fetch never gets cached.
const BTC_CACHE_TTL = 45000; // 45s
let _btcCacheAt = 0;
async function getCurrentBTCPrice({ allowCached = true } = {}) {
  if (allowCached && _btcCache > 0 && (Date.now() - _btcCacheAt) < BTC_CACHE_TTL) {
    return _btcCache;
  }
  // Try Binance first (most reliable, real-time), then Coinbase, then CoinGecko
  const sources = [
    () => fetch('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT', { signal: AbortSignal.timeout(5000) })
      .then(r => r.json()).then(d => parseFloat(d.price)),
    () => fetch('https://api.coinbase.com/v2/prices/BTC-USD/spot', { signal: AbortSignal.timeout(5000) })
      .then(r => r.json()).then(d => parseFloat(d.data.amount)),
    () => fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd', { signal: AbortSignal.timeout(5000) })
      .then(r => r.json()).then(d => parseFloat(d.bitcoin.usd)),
  ];
  for (const src of sources) {
    try {
      const price = await src();
      if (price > 1000) {
        _btcCache = price;
        _btcCacheAt = Date.now();
        console.log(`[BTC] live price: $${Math.round(price).toLocaleString()}`);
        return price;
      }
    } catch { }
  }
  return _btcCache || 88000;
}
let _btcCache = 0;

// Live FX rates cache — refreshed every 5 minutes
const _fxCache = { rates: null, fetchedAt: 0 };
const FX_FALLBACK = {
  GHS: 16.0, NGN: 1650, KES: 129, ZAR: 18.4, UGX: 3730,
  TZS: 2690, USD: 1, GBP: 0.79, EUR: 0.92, XAF: 614,
  XOF: 614, RWF: 1325, ETB: 58, AUD: 1.55, CAD: 1.37,
  SGD: 1.35, INR: 83.5, MAD: 10.1, ZMW: 26.5,
};

async function getLiveFXRates() {
  const now = Date.now();
  if (_fxCache.rates && (now - _fxCache.fetchedAt) < 5 * 60 * 1000) {
    return _fxCache.rates;
  }
  try {
    // open.er-api.com supports GHS, NGN and all African currencies natively
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const fxRes = await fetch('https://open.er-api.com/v6/latest/USD', { signal: ctrl.signal });
    clearTimeout(timer);

    if (fxRes.ok) {
      const fxData = await fxRes.json();
      if (fxData.result === 'success' && fxData.rates) {
        _fxCache.rates = { ...FX_FALLBACK, ...fxData.rates };
        _fxCache.fetchedAt = now;
        console.log(`[FX] rates refreshed — GHS:${_fxCache.rates.GHS?.toFixed(4)} NGN:${_fxCache.rates.NGN?.toFixed(2)}`);
        return _fxCache.rates;
      }
    }
  } catch (e) {
    console.warn('[FX] open.er-api failed, trying exchangerate.host:', e.message);
  }

  // Secondary fallback: exchangerate.host
  try {
    const r = await fetch('https://api.exchangerate.host/latest?base=USD', { signal: AbortSignal.timeout(6000) });
    if (r.ok) {
      const d = await r.json();
      if (d.rates) {
        _fxCache.rates = { ...FX_FALLBACK, ...d.rates };
        _fxCache.fetchedAt = now;
        console.log(`[FX] rates from exchangerate.host — GHS:${_fxCache.rates.GHS?.toFixed(4)}`);
        return _fxCache.rates;
      }
    }
  } catch (e) {
    console.warn('[FX] all FX sources failed:', e.message);
  }

  return _fxCache.rates || FX_FALLBACK;
}

// ── AI Chat endpoint ─────────────────────────────────────────────────────────
const PRAQEN_CONTEXT = `You are PRAQEN AI, a helpful support assistant for PRAQEN — a peer-to-peer (P2P) Bitcoin trading platform where users buy and sell Bitcoin using local currencies (GHS, NGN, KES, ZAR, etc.) via mobile money, bank transfer, and gift cards. All trades are escrow-protected.

=== COMPLETE PLATFORM KNOWLEDGE BASE ===
Use these facts to answer user questions directly and accurately. Never default to "team will review" for questions that are answered here.

## ACCOUNT & AUTH
- **Registration**: Users sign up with email + password, or Google Sign-In. Email verification is required before trading.
- **Login**: Email + password, or Google OAuth. Password resets are done via **Forgot Password** on the login page — a reset link is sent to the user's email.
- **Profile**: Users can set username, full name, avatar, bio, country, and phone number in **Settings**.
- **Email verification**: A 6-digit code is sent to the user's email. The code expires in 10 minutes.
- **Phone verification**: Users can verify their phone number. Served via Africa's Talking (for African numbers) or Twilio Verify.
- **KYC/ID verification**: Upload a government-issued ID (passport, driver's license, national ID) in **Settings → Verification**. Usually reviewed within 24 hours. KYC unlocks higher trade limits.
- **Delete account**: Users can contact support to close their account and withdraw remaining funds.

## BUYING BITCOIN
- Users browse seller offers on **Buy Bitcoin** page, filtered by country/payment method.
- Each offer shows price (fixed or market margin), limits, payment methods, and the seller's reputation.
- Clicking **BUY BTC** opens a trade. The seller locks the exact BTC amount into escrow.
- Once escrow is locked, the buyer sends payment via the agreed method (MoMo, bank transfer, etc.).
- After the buyer confirms payment, the seller releases BTC from escrow to the buyer's wallet.
- **Time limit**: Each offer has a time limit for payment. If the buyer doesn't pay in time, the trade can be cancelled.

## SELLING BITCOIN
- Users create sell offers on **Sell Bitcoin** with: price (fixed or market margin), payment methods accepted, min/max limits, country, and terms.
- Wallet must have at least $10 worth of BTC for the listing to appear.
- When a buyer opens a trade, the seller must lock the exact BTC amount into escrow.
- After the buyer sends payment and confirms, the seller releases BTC from escrow.
- Sellers can cancel trades if the buyer doesn't pay within the time limit.

## WALLET
- Located in the **Wallet** section. Shows BTC balance, locked balance (in escrow), and USD equivalent.
- **Deposit**: Shows the user's PRAQEN BTC wallet address and a QR code. BTC sent to this address is credited after network confirmations.
- **Withdraw**: Users can send BTC to any external Bitcoin address. A network fee (miner fee) applies. Withdrawals are processed through the HD wallet system.
- **Locked balance**: BTC held in active trade escrow. Released when the trade completes or is cancelled.
- Address format: bc1q... (SegWit mainnet), or tb1... (testnet). The system uses self-custody HD wallet (mnemonic in .env).

## TRADING PROCESS
- **Opening a trade**: Buyer clicks BUY on an offer. The seller locks BTC in escrow.
- **Payment**: Buyer sends payment via the offer's listed payment method. Payments happen directly between users (P2P), not through PRAQEN.
- **Releasing escrow**: After confirming payment, the seller releases BTC. This is irreversible — only release when payment is confirmed.
- **Cancellation**: If the buyer doesn't pay within the time limit, the seller can cancel. Escrow is returned to the seller.
- **Disputes**: If there's a problem (non-payment, wrong amount, suspected fraud), either party can **Raise Dispute** on the trade page. A moderator reviews within 24 hours.
- **Trade reference**: Each trade has a unique ID shown in **My Trades**.

## GIFT CARDS
- PRAQEN has a **Gift Card Marketplace** where users can buy and sell gift cards for Bitcoin.
- Supported brands include Amazon, iTunes, Steam, Google Play, and many others.
- Gift card sellers list their cards at a price in BTC. Buyers purchase them directly.
- The platform supports multiple currencies for gift cards.

## FEES
- **Trading fee**: 0.5% on completed trades, deducted from the Bitcoin amount.
- **No fees** for listing offers, depositing BTC, or browsing.
- **Withdrawal fee**: Network/miner fee varies based on Bitcoin network congestion.

## REPUTATION & TRUST
- Users have a **rating** (1-5), **total trades count**, and **completion rate**.
- **Feedback**: After each trade, users leave positive/negative feedback.
- **Badges**: Users earn badges for verification status, trade volume, and other achievements.
- **Trust score**: Based on completed trades, positive feedback, account age, and KYC status.
- Users with higher trust are shown more prominently in listings.

## REFERRAL PROGRAM
- Each user has a unique **referral code** (e.g., "username_abc123") on their profile.
- Sharing the referral link rewards the referrer when the invited user completes trades.
- Commission details are shown in the user's profile.

## NOTIFICATIONS
- Users receive notifications for: new trades, trade status changes, messages, KYC updates, and system announcements.
- Notifications appear in-app and can be sent via push (OneSignal) or email.

## SUPPORT
- Users can create a support ticket by picking a topic and describing their issue.
- Tickets get a unique ID. AI responds immediately, followed by a human agent.
- Response times: Urgent ~2-4 hours, Normal ~12-24 hours, Low ~24-48 hours.
- Users can attach screenshots to their tickets for faster resolution.

=== RESPONSE RULES ===
Keep responses concise (2-4 sentences), friendly, and practical. When a user asks a question covered by the knowledge base above, ANSWER IT DIRECTLY with the facts — do NOT default to "I'll escalate this" or "the team is looking into it." If you genuinely don't know something, say so and offer to connect them with a human agent. Never make up account-specific details.`;

const PRAQEN_SUPPORT_AGENT_CONTEXT = `You are Alex, a knowledgeable and friendly human support agent at PRAQEN — a peer-to-peer (P2P) Bitcoin trading platform. You are chatting with a user who has an open support ticket.

Your personality and rules:
- You are human. Never say "As an AI" or reveal you are a bot. Speak naturally.
- Be warm, empathetic, and reassuring. The user may be stressed about their issue.
- NEVER repeat a response you or the user already said in this conversation. Read the full history before replying.
- Acknowledge what the user said specifically before giving advice.
- Keep replies short — 2 to 3 sentences max. Do not write long paragraphs.
- IMPORTANT: When the user asks about HOW something works (password reset, KYC, buying, selling, fees, wallet, etc.), ANSWER THEM DIRECTLY using the platform knowledge below. Do NOT default to "I've noted this on your ticket" or "the team is reviewing" — give them the answer right away.
- Reserve "I've noted this on your ticket" / "I've flagged this" / "the team is reviewing" ONLY for when the user describes a genuine problem or bug that needs manual investigation.
- After giving a direct answer, ask one follow-up question to check if they need anything else.
- Use variety: rotate between phrases like "Got it", "Thanks for that update", "I hear you", "Noted", "On it" — never use the same opener twice in a row.
- If you already gave advice on a topic earlier in the conversation, do NOT repeat it. Instead acknowledge and ask if it helped.
- If the user says something is resolved, congratulate them warmly and close out positively.

=== COMPLETE PLATFORM KNOWLEDGE ===
Answer factual questions from this knowledge base. Do NOT escalate questions that are answered here.

## ACCOUNT & AUTH
- **Password reset**: Users tap **Forgot Password** on the login page. A reset link is sent to their email.
- **KYC/Verification**: Upload ID in **Settings → Verification**. Reviewed within 24 hours. Unlocks higher limits.
- **Profile settings**: Users can update username, avatar, bio, phone, country in **Settings**.
- **Google Sign-In**: Users can log in with their Google account. Works alongside email/password.

## BUYING BITCOIN
- Browse offers on **Buy Bitcoin**, filtered by country/payment method. Seller locks BTC in escrow before buyer pays. Buyer sends payment via MoMo/bank transfer. Seller releases BTC after payment confirmed.

## SELLING BITCOIN
- Create listings on **Sell Bitcoin** with price/margin, limits, payment methods. Wallet needs $10+ BTC for listing to appear. When trade opens, seller locks exact BTC in escrow.

## WALLET
- **Deposit**: Copy your PRAQEN BTC address from **Wallet** page. QR code available.
- **Withdraw**: Enter external BTC address and amount in **Wallet → Withdraw**. Network fee applies.
- **Locked balance**: BTC held in active trade escrow — released when trade completes or cancels.

## DISPUTES
- Go to **My Trades**, open the trade, tap **Raise Dispute**. Moderator reviews within 24 hours.
- Never release escrow without confirming payment received.

## FEES
- 0.5% on completed trades only. No listing or deposit fees. Withdrawal network fee varies.

## GIFT CARDS
- **Gift Card Marketplace** for buying/selling cards (Amazon, iTunes, Steam, etc.) in exchange for BTC.

## REFERRALS
- Share your unique referral code from your profile. You earn commission when invited users complete trades.

## SUPPORT
- Response times: Urgent ~2-4h, Normal ~12-24h, Low ~24-48h. You can attach screenshots to your ticket.
`;

app.post('/api/ai-chat', async (req, res) => {
  try {
    const { message, section, history = [], user: chatUser, mode } = req.body;
    if (!message?.trim()) return res.status(400).json({ error: 'Message required' });

    const apiKey = process.env.ANTHROPIC_API_KEY;
    const isSupportChat = mode === 'support';
    const systemPrompt = isSupportChat
      ? PRAQEN_SUPPORT_AGENT_CONTEXT + (chatUser ? `\n\nYou are speaking with: ${chatUser.username}` : '')
      : PRAQEN_CONTEXT + (section ? `\n\nThe user selected topic: "${section}". Focus your answer on this area.` : '') +
      (chatUser ? `\n\nUser: ${chatUser.username}` : '');

    if (apiKey) {
      const messages = [
        ...history.slice(-10).map(m => ({
          role: m.role === 'user' ? 'user' : 'assistant',
          content: m.text,
        })),
        { role: 'user', content: message },
      ];

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 250,
          system: systemPrompt,
          messages,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        return res.json({ reply: data.content?.[0]?.text || 'Got it — I\'m looking into that for you right now.' });
      }
    }

    // ── Support-mode fallback (no API key / API down) ──────────────────────
    // This fallback uses a comprehensive FAQ knowledge base so the user gets
    // factual answers even when the AI API is unavailable. Generic escalation
    // replies are used ONLY for true problems/bugs, not for informational questions.
    if (isSupportChat) {
      const turn = history.length;
      const q = message.toLowerCase().trim();
      const name = chatUser?.username ? `, ${chatUser.username}` : '';
      let reply = '';

      // ── Greeting detection ──
      if (/^(hey|hi|hello|good\s*(morning|afternoon|evening)|howdy|yo|hiya|sup)\b/.test(q)) {
        const greetings = [
          `Hi${name}! 👋 I'm Alex from PRAQEN support. I have your ticket open right now — how can I help you?`,
          `Hey${name}! I'm looking at your ticket. What's going on — can I help with something?`,
          `Hello${name}! Your ticket is open and the team is on it. What would you like to chat about?`,
        ];
        reply = greetings[turn % 3];

        // ── Acknowledgment / closure ──
      } else if (/thank|thanks|okay|ok\b|great|perfect|got it|cool|nice/.test(q)) {
        const pool = [
          'Happy to help! Let me know if anything else comes up.',
          'Great! I\'ve noted that on your ticket. Anything else?',
          'Awesome — the team will follow up too. Is there anything else you need?',
        ];
        reply = pool[turn % 3];

        // ── Wait time / status check ──
      } else if (/how long|wait|still|not yet|any news|update/.test(q)) {
        const pool = [
          'I understand — the team is actively on your case. We aim to resolve tickets within 24 hours. Any updates from your side?',
          'Still on it! I\'ve flagged your ticket for priority review. Anything new to report?',
          'We haven\'t forgotten about you. Can you share any new details that might help us move faster?',
        ];
        reply = pool[turn % 3];

        // ── Factual Q&A: knowledge base answers ──
        // These answer the user directly instead of defaulting to escalation.
        // IMPORTANT: This block MUST come before the payment-reporting branch
        // so informational "how do I..." questions get factual answers first.

      } else if (/forgot password|reset password|change password|forgot my password/.test(q)) {
        reply = `No worries! To reset your password, go to the login page and tap **Forgot Password**. A reset link will be sent to your email within a few minutes. If you don't see it, check your spam folder.`;
      } else if (/how.*(buy|purchase)|how.*start.*trade|find.*seller/.test(q)) {
        reply = 'To **buy Bitcoin**, go to the **Buy BTC** page and browse seller offers. Filter by your country and payment method, then click **BUY BTC** on any offer to start a trade. The seller will lock Bitcoin in escrow before you send payment.';
      } else if (/how.*(sell|create.*listing|make.*offer)/.test(q)) {
        reply = 'To **sell Bitcoin**, go to **Sell BTC** and browse buy offers from buyers, or create your own sell listing. Make sure your wallet has enough BTC — your offer only appears when your balance is above $10.';
      } else if (/how.*(wallet|deposit|withdraw|fund|address)/.test(q)) {
        reply = 'Your BTC wallet is in the **Wallet** section. To deposit, copy your PRAQEN BTC address (QR code available) and send from any external wallet. To withdraw, go to **Withdraw**, enter an external BTC address and amount. A network fee applies.';
      } else if (/how.*(pay|payment|send.*money|make.*payment)/.test(q)) {
        reply = 'Payments are made directly between you and the other trader using the method shown in the offer (MoMo, bank transfer, etc.). Always confirm you\'ve received payment in your account before releasing escrow. Keep your receipt as proof.';
      } else if (/kyc|verif|verify.*id|identity|upload.*id|document/.test(q)) {
        reply = 'To verify your identity, go to **Settings → Verification** and upload a clear photo of your government-issued ID (passport, driver\'s license, or national ID). Most verifications are reviewed within 24 hours. KYC unlocks higher trade limits.';
      } else if (/gift card|marketplace|amazon.*card|itunes.*card|steam.*card/.test(q)) {
        reply = 'PRAQEN has a **Gift Card Marketplace** where you can buy and sell gift cards (Amazon, iTunes, Steam, Google Play, and more) for Bitcoin. Just list your card or browse available ones in the marketplace section.';
      } else if (/fee|cost|charge|commission|price.*fee/.test(q)) {
        reply = 'PRAQEN charges **0.5%** on completed trades only. There are no fees for listing offers or depositing BTC. Withdrawal fees depend on the current Bitcoin network congestion.';
      } else if (/referral|invite|earn.*friend|share.*link|commission.*invite/.test(q)) {
        reply = 'You can find your unique referral code in your profile page. Share your referral link with friends — when they sign up and complete trades, you earn a commission. The more you refer, the more you earn!';
      } else if (/lock.*balance|balance.*lock|escrow.*balance|why.*(lock|hold)/.test(q)) {
        reply = 'Locked balance is Bitcoin that\'s currently held in escrow for an active trade. It will be released automatically back to your wallet when the trade completes or is cancelled. You can see your active trades in **My Trades**.';
      } else if (/cancel.*trade|time.*limit|expire/.test(q)) {
        reply = 'Each trade has a time limit set by the seller. If the buyer doesn\'t complete payment within that time, the seller can cancel the trade and the escrow is returned. Buyers can also request cancellation from the seller.';

        // ── Payment-related update (user telling us they paid, not asking how) ──
      } else if (/^(i )?(just )?(paid|sent|transferred|made.*payment)\b|payment.*(sent|made|done|confirmed)/.test(q)) {
        const pool = [
          'Thanks for the update — I\'ve noted the payment on your ticket. Has the other party confirmed receipt?',
          'Got it, payment noted. Keep your receipt handy. Has anything changed since you sent it?',
          'Noted on the payment. Can you share the exact amount and method so I can add it to the case?',
        ];
        reply = pool[turn % 3];

      } else if (/dispute|scam|fraud|problem|stuck|error|wrong|fail/.test(q)) {
        const pool = [
          'If you\'re having a problem with a trade, go to **My Trades**, open the trade, and tap **Raise Dispute**. A moderator will review and help resolve it within 24 hours. Never release escrow without confirming payment.',
          'I\'ve flagged this for the team. In the meantime, go to **My Trades → Raise Dispute** to protect the escrow. Can you share a trade ID or any screenshots so we can move faster?',
          'On it — I\'ve escalated this. Please raise a dispute on the trade page if you haven\'t already. Any additional info you can share will help us resolve it quickly.',
        ];
        reply = pool[turn % 3];

        // ── Genuine problem / not answered by knowledge base → escalate ──
      } else if (turn === 0) {
        reply = `Thanks for reaching out${name}! I\'ve received your ticket. Can you tell me a bit more about what you need help with today?`;
      } else if (turn <= 2) {
        reply = 'Noted — I\'ve updated your ticket with that. The team is on it. Anything else to add?';
      } else {
        const generic = [
          'Got that — I\'ve passed it to the team. Anything urgent right now?',
          'I hear you. I\'ve noted this on your ticket. Do you have any new updates?',
          'Thanks for the info. Our team is working on a resolution. Is there anything else I can help with?',
        ];
        reply = generic[turn % 3];
      }
      return res.json({ reply });
    }

    // General info fallback (non-support mode)
    const q = message.toLowerCase();
    let reply = '';
    if (section === 'buy' || q.includes('buy') || q.includes('purchase')) {
      reply = 'To **buy Bitcoin**, go to the **Buy BTC** page and browse seller offers. Filter by your country and payment method, then click **BUY BTC** on any offer to start a trade. The seller will lock Bitcoin in escrow before you send payment.';
    } else if (section === 'sell' || q.includes('sell') || q.includes('listing')) {
      reply = 'To **sell Bitcoin**, go to **Sell BTC** and browse buy offers from buyers, or create your own sell listing. Make sure your wallet has enough BTC — your offer only appears when your balance is above $10.';
    } else if (section === 'trade' || q.includes('trade') || q.includes('escrow') || q.includes('dispute')) {
      reply = 'For trade issues, open the trade from **My Trades** and use the **Raise Dispute** button if there\'s a problem. Our moderators review disputes within 24 hours. Never release escrow until you\'ve confirmed you received payment.';
    } else if (section === 'payment' || q.includes('payment') || q.includes('momo') || q.includes('bank')) {
      reply = 'Payments are made directly between you and the other trader. Always send payment via the method shown in the trade. Keep your payment receipt as proof. If the seller doesn\'t release BTC after you pay, raise a dispute.';
    } else if (section === 'account' || q.includes('account') || q.includes('login') || q.includes('password')) {
      reply = 'For account issues, go to **Settings** to update your profile, change your password, or verify your email. If you\'re locked out, use **Forgot Password** on the login page to reset via your email.';
    } else if (section === 'wallet' || q.includes('wallet') || q.includes('balance') || q.includes('withdraw')) {
      reply = 'Your Bitcoin wallet is in the **Wallet** section. You can deposit BTC to your PRAQEN wallet address. Withdrawals send BTC to any external Bitcoin address. Locked balance is BTC held in active trade escrow.';
    } else if (section === 'kyc' || q.includes('kyc') || q.includes('verif') || q.includes('id')) {
      reply = 'To verify your identity, go to your **Profile → Verification** tab and upload a government-issued ID. KYC unlocks higher trade limits and builds trust with other traders. Verification is usually reviewed within 24 hours.';
    } else if (q.includes('fee') || q.includes('cost') || q.includes('charge')) {
      reply = 'PRAQEN charges a small **0.5% fee** on completed trades, deducted from the Bitcoin amount. There are no listing fees or deposit fees. Withdrawal fees depend on current Bitcoin network fees.';
    } else if (q.includes('referral') || q.includes('invite') || q.includes('earn')) {
      reply = 'Share your **referral link** from your profile to earn a commission when people you invite complete trades. You can find your referral code and earnings in your profile page.';
    } else {
      reply = 'I\'m here to help with anything on PRAQEN! You can ask me about buying or selling Bitcoin, trade issues, payments, your account, KYC verification, or your wallet. What would you like to know?';
    }

    res.json({ reply });
  } catch (err) {
    console.error('[ai-chat]', err.message);
    res.status(500).json({ reply: 'I\'m looking into that for you — please give me a moment.' });
  }
});

// GET /api/rates — serves live BTC price + FX rates to the frontend (avoids browser CORS issues)
app.get('/api/rates', async (req, res) => {
  try {
    const [fxRates, btcPrice] = await Promise.all([
      getLiveFXRates(),
      getCurrentBTCPrice(),
    ]);
    res.json({ btcUsd: btcPrice, rates: fxRates, updatedAt: new Date().toISOString() });
  } catch (err) {
    console.error('[GET /api/rates]', err.message);
    res.json({ btcUsd: 0, rates: FX_FALLBACK, updatedAt: new Date().toISOString() });
  }
});

async function getModeratorUserIds() {
  const { data, error } = await supabaseAdmin.from('users').select('id').or('is_moderator.eq.true,is_admin.eq.true');
  if (error) { console.error('Error fetching moderators:', error); return []; }
  return data.map(u => u.id);
}

// Full moderator/admin identities (for vote-seat rendering and name/email attribution).
async function getModeratorsFull() {
  const { data, error } = await supabaseAdmin.from('users')
    .select('id, username, full_name, email, is_admin, is_moderator')
    .or('is_moderator.eq.true,is_admin.eq.true');
  if (error) { console.error('Error fetching moderators:', error); return []; }
  return data || [];
}

async function notifyModerators(tradeId, trade, reason) {
  const ids = await getModeratorUserIds();
  for (const id of ids) {
    await createNotification(id, 'dispute', '🚨 New Dispute Opened',
      `Dispute opened for trade #${tradeId.slice(0, 8)}. Reason: ${reason.substring(0, 100)}`,
      `/admin/disputes/${tradeId}`);
  }
  console.log(`✅ Notified ${ids.length} moderators about dispute on trade ${tradeId}`);
}

async function createNotification(userId, type, title, message, action, extra = {}) {
  try {
    const hasExtra = extra && (extra.actor_id || extra.direction || extra.trade_id);
    const payload = { user_id: userId, type, title, message, action, created_at: new Date(), is_read: false };
    if (hasExtra) payload.data = extra;
    const { data, error } = await supabaseAdmin.from('notifications').insert(payload).select();
    if (error) {
      console.error('[createNotification] Supabase error:', error.message, '| code:', error.code, '| details:', error.details);
      // If the error is about the 'data' column not existing, retry without it so the notification still lands.
      // This handles databases that haven't run the fix_notifications_data_column.sql migration yet.
      if (hasExtra && (error.message?.includes('"data"') || error.code === '42703')) {
        console.warn('[createNotification] Retrying without data field (column may not exist yet)');
        const base = { user_id: userId, type, title, message, action, created_at: new Date(), is_read: false };
        const { data: d2, error: e2 } = await supabaseAdmin.from('notifications').insert(base).select();
        if (e2) console.error('[createNotification] retry error:', e2.message);
        return d2?.[0] || null;
      }
    }
    return data?.[0] || null;
  } catch (error) {
    console.error('[createNotification] thrown error:', error);
    return null;
  }
}

async function updateUserTradeStats(userId) {
  try {
    // Atomic +1 — never recounts from trades table so historical totals are preserved.
    // If the RPC isn't deployed yet, fall back to a safe read-then-increment (not a table recount).
    const { error: rpcErr } = await supabaseAdmin.rpc('praqen_increment_trades', { p_user_id: userId });
    if (rpcErr) {
      const { data: cur } = await supabaseAdmin.from('users').select('total_trades').eq('id', userId).single();
      const safePrev = parseInt(cur?.total_trades || 0);
      await supabaseAdmin.from('users').update({ total_trades: safePrev + 1 }).eq('id', userId);
    }

    // Completion rate uses actual trade rows but does NOT touch total_trades.
    const { data: all } = await supabaseAdmin.from('trades').select('status').or(`seller_id.eq.${userId},buyer_id.eq.${userId}`);
    if (all && all.length > 0) {
      const completed = all.filter(t => t.status === 'COMPLETED').length;
      const rate = Math.round((completed / all.length) * 100);
      await supabaseAdmin.from('users').update({ completion_rate: rate }).eq('id', userId);
    }

    checkAndAwardBadges(userId).catch(() => { });
  } catch (error) {
    console.error('Error updating user stats:', error);
  }
}

async function createAffiliateEarning(tradeId, buyerId, tradeAmountBtc, tradeAmountUsd) {
  try {
    const { data: buyer, error: buyerError } = await supabaseAdmin.from('users').select('referred_by').eq('id', buyerId).single();
    if (buyerError || !buyer?.referred_by) return;
    const { data: referrer } = await supabaseAdmin.from('users').select('total_referrals').eq('id', buyer.referred_by).single();
    let commissionRate = 0.2;
    const referralCount = referrer?.total_referrals || 0;
    if (referralCount >= 100) commissionRate = 0.5;
    else if (referralCount >= 50) commissionRate = 0.4;
    else if (referralCount >= 25) commissionRate = 0.35;
    else if (referralCount >= 10) commissionRate = 0.25;
    const commissionBtc = parseFloat(tradeAmountBtc || 0) * (commissionRate / 100);
    const { data: buyerInfo } = await supabaseAdmin.from('users').select('username').eq('id', buyerId).maybeSingle();
    const { error } = await supabaseAdmin.from('affiliate_earnings').insert({
      referrer_id: buyer.referred_by, referred_user_id: buyerId, trade_id: tradeId,
      commission_btc: commissionBtc, trade_amount_btc: tradeAmountBtc, trade_amount_usd: tradeAmountUsd,
      commission_rate: commissionRate, status: 'COMPLETED', created_at: new Date()
    });
    if (error) throw error;
    // Update referral_earnings_btc directly — sum all earnings for this referrer
    const { data: allE } = await supabaseAdmin.from('affiliate_earnings').select('commission_btc').eq('referrer_id', buyer.referred_by);
    const newTotal = (allE || []).reduce((s, e) => s + parseFloat(e.commission_btc || 0), 0);
    await supabaseAdmin.from('users').update({ referral_earnings_btc: parseFloat(newTotal.toFixed(8)) }).eq('id', buyer.referred_by);
    console.log(`✅ Affiliate commission: ${commissionBtc} BTC for referrer ${buyer.referred_by}`);
    // Notify referrer of the commission earned
    const btcDisplay = commissionBtc < 0.0001 ? commissionBtc.toFixed(8) : commissionBtc.toFixed(6);
    const referralUsername = buyerInfo?.username || 'Your referral';
    await createNotification(
      buyer.referred_by,
      'referral',
      '💰 Commission Earned!',
      `${referralUsername} completed a trade — you earned ₿${btcDisplay} (${commissionRate}% commission). Total: ₿${newTotal.toFixed(6)}`,
      '/dashboard?tab=affiliate'
    ).catch(() => { });
  } catch (error) {
    console.error('Create affiliate earning error:', error);
  }
}

// Pays 0.01% referral commission to whoever referred the buyer and/or seller.
// If both share the same referrer, only one payout is made (no double-dipping).
// The DB trigger on affiliate_earnings auto-increments referral_earnings_btc.
async function payReferralCommissions(tradeId, buyerId, sellerId, amountBtc, amountUsd) {
  try {
    const RATE = 0.0001; // 0.01%
    const commissionBtc = parseFloat(amountBtc || 0) * RATE;
    const commissionUsd = parseFloat(amountUsd || 0) * RATE;

    if (commissionBtc <= 0) return;

    const { data: traders } = await supabaseAdmin
      .from('users')
      .select('id, referred_by')
      .in('id', [buyerId, sellerId]);

    if (!traders || traders.length === 0) return;

    const buyerRow = traders.find(u => String(u.id) === String(buyerId));
    const sellerRow = traders.find(u => String(u.id) === String(sellerId));

    // Build unique referrer → referred_user_id map (first seen wins for dedup)
    const payouts = new Map();
    if (buyerRow?.referred_by) payouts.set(buyerRow.referred_by, buyerId);
    if (sellerRow?.referred_by && !payouts.has(sellerRow.referred_by)) {
      payouts.set(sellerRow.referred_by, sellerId);
    }

    if (payouts.size === 0) return;

    const rows = [];
    for (const [referrerId, referredUserId] of payouts) {
      rows.push({
        referrer_id: referrerId,
        referred_user_id: referredUserId,
        trade_id: tradeId,
        commission_btc: commissionBtc,
        commission_usd: commissionUsd,
        status: 'CREDITED',
        created_at: new Date().toISOString(),
      });
    }

    const { error } = await supabaseAdmin.from('affiliate_earnings').insert(rows);
    if (error) {
      console.error('[referral] Commission insert failed:', error.message);
      return;
    }

    // Update referral_earnings_btc for each referrer directly
    for (const [referrerId] of payouts) {
      const { data: allE } = await supabaseAdmin.from('affiliate_earnings').select('commission_btc').eq('referrer_id', referrerId);
      const newTotal = (allE || []).reduce((s, e) => s + parseFloat(e.commission_btc || 0), 0);
      await supabaseAdmin.from('users').update({ referral_earnings_btc: parseFloat(newTotal.toFixed(8)) }).eq('id', referrerId);
    }

    console.log(`✅ [referral] Trade ${tradeId.slice(0, 8)}: paid ₿${commissionBtc.toFixed(8)} to ${rows.length} referrer(s)`);
  } catch (e) {
    console.error('[referral] payReferralCommissions error:', e.message);
  }
}

async function ensureWallet(userId, username) {
  const { data: user, error } = await supabaseAdmin.from('users')
    .select('bitcoin_wallet_address, username').eq('id', userId).single();
  if (error) throw new Error('User not found');

  // Always use HD wallet — derive address from master seed + userId
  const hdWallet = require('./services/hdWalletService');
  const addrData = hdWallet.generateUserAddress(userId);
  const address = addrData.address;

  // If the stored address already matches the HD wallet address, nothing to do
  if (user.bitcoin_wallet_address === address) {
    return { address, isNew: false };
  }

  // Save HD wallet address to both tables
  await Promise.all([
    supabaseAdmin.from('users').update({
      bitcoin_wallet_address: address,
      updated_at: new Date().toISOString(),
    }).eq('id', userId),
    supabaseAdmin.from('user_wallets').upsert({
      user_id: userId,
      btc_address: address,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' }),
  ]);

  return { address, isNew: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// LEGACY lockFundsInEscrow() and releaseFundsToBuyer() REMOVED.
// All escrow operations must go through tradeEscrowService (imported at line 107).
// Using these old functions caused double-balance-credits and missing wallet syncs.
// ─────────────────────────────────────────────────────────────────────────────

// ============================================================
// AUTH MIDDLEWARE
// ============================================================

function verifyToken(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: E.NO_TOKEN });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch {
    res.status(401).json({ error: E.INVALID_TOKEN });
  }
}

// Optional auth — attaches userId if token present, but never blocks the request
function optionalAuth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.userId = decoded.userId;
    } catch { }
  }
  next();
}

async function requireEmailVerified(req, res, next) {
  try {
    const { data: user } = await supabaseAdmin
      .from('users')
      .select('is_email_verified, email_verified')
      .eq('id', req.userId)
      .single();
    const verified = !!(user?.is_email_verified || user?.email_verified);
    if (!verified) {
      return res.status(403).json({
        error: 'Please verify your email address before trading.',
        requireVerification: 'email',
      });
    }
    next();
  } catch (e) {
    return res.status(500).json({ error: 'Could not verify account status. Please try again.' });
  }
}

// ============================================================
// HEALTH CHECK
// ============================================================

app.get('/api/health', (req, res) => res.json({ status: 'OK', time: new Date() }));

app.post('/api/test-notify', async (req, res) => {
  const { userId, phone } = req.body;
  const results = {};

  // 1. Check Twilio config
  results.twilio_sid = process.env.TWILIO_SID ? '✅ set' : '❌ missing';
  results.twilio_token = process.env.TWILIO_TOKEN ? '✅ set' : '❌ missing';
  results.twilio_phone = process.env.TWILIO_PHONE || '❌ missing';
  results.twilio_client = TWILIO_ENABLED ? '✅ configured' : '❌ null';

  // 2. Check user phone in DB
  if (userId) {
    const { data: user, error } = await supabaseAdmin.from('users').select('phone, email').eq('id', userId).single();
    results.db_phone = user?.phone || '❌ null — user has no phone saved';
    results.db_email = user?.email || '❌ null';
    results.db_error = error?.message || null;
  }

  // 3. Try sending a real test SMS
  const testTo = phone || (userId && (await supabaseAdmin.from('users').select('phone').eq('id', userId).single()).data?.phone);
  if (testTo) {
    try {
      const to = testTo.startsWith('+') ? testTo : `+${testTo}`;
      await getTwilioClient().messages.create({
        body: '[PRAQEN] Test notification — SMS is working!',
        from: process.env.TWILIO_PHONE,
        to
      });
      results.sms_test = `✅ SMS sent to ${to}`;
    } catch (err) {
      results.sms_test = `❌ ${err.message} (code: ${err.code})`;
    }
  } else {
    results.sms_test = '⚠️ No phone provided — pass userId or phone in body';
  }

  res.json(results);
});

// ============================================================
// AUTH ROUTES
// ============================================================

// Public endpoint — returns referrer info from a referral code (used to show banner on signup page)
app.get('/api/auth/referrer', async (req, res) => {
  try {
    const code = (req.query.code || '').toLowerCase().trim();
    if (!code) return res.json({ success: false });
    const { data } = await supabaseAdmin
      .from('users')
      .select('username, full_name, avatar_url, total_trades, badge, total_referrals')
      .eq('referral_code', code)
      .maybeSingle();
    if (!data) return res.json({ success: false });
    res.json({
      success: true,
      referrer: {
        username: data.username,
        full_name: data.full_name,
        avatar_url: data.avatar_url || null,
        total_trades: data.total_trades || 0,
        badge: data.badge || 'BEGINNER',
        total_referrals: data.total_referrals || 0,
      },
    });
  } catch (e) {
    res.json({ success: false });
  }
});

app.post('/api/auth/google', authLimiter, async (req, res) => {
  try {
    const { credential, referralCode } = req.body;
    if (!credential) {
      return res.status(400).json({ error: 'Google credential is required' });
    }

    // 1. Verify Google ID token via Google Tokeninfo API
    let payload;
    try {
      const response = await axios.get(`https://oauth2.googleapis.com/tokeninfo?id_token=${credential}`);
      payload = response.data;
    } catch (err) {
      console.error('[Google Auth] Token verification failed:', err.message);
      return res.status(401).json({ error: 'Invalid Google credential token' });
    }

    const { email, name, picture, aud } = payload;

    // Verify audience if client ID is configured
    const clientID = process.env.GOOGLE_CLIENT_ID;
    if (clientID && aud !== clientID) {
      console.error('[Google Auth] Client ID mismatch:', aud, 'vs', clientID);
      return res.status(401).json({ error: 'Token audience mismatch' });
    }

    if (!email) {
      return res.status(400).json({ error: 'Google token did not provide an email address' });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // 2. Lookup existing user
    let { data: existingUser, error: findError } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('email', normalizedEmail)
      .maybeSingle();

    if (findError) {
      console.error('[Google Auth] DB lookup error:', findError);
      return res.status(500).json({ error: 'Database error' });
    }

    let userToAuth;

    if (existingUser) {
      userToAuth = existingUser;

      // Update email verification status if not verified
      if (!existingUser.is_email_verified || !existingUser.email_verified) {
        const { data: updatedUser } = await supabaseAdmin
          .from('users')
          .update({ is_email_verified: true, email_verified: true })
          .eq('id', existingUser.id)
          .select()
          .single();
        if (updatedUser) {
          userToAuth = updatedUser;
        }
      }
    } else {
      // 3. New user registration
      let baseUsername = email.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '');
      if (baseUsername.length < 3) baseUsername = 'user';
      let username = baseUsername;

      const { data: uCheck } = await supabaseAdmin
        .from('users')
        .select('id')
        .eq('username', username)
        .maybeSingle();

      if (uCheck) {
        username = `${baseUsername}_${Math.floor(1000 + Math.random() * 9000)}`;
      }

      const passwordHash = await bcrypt.hash(crypto.randomUUID(), 10);
      const referralCodeValue = await generateUniqueReferralCode(username);

      // Referral lookup
      let referrerId = null;
      if (referralCode) {
        const normalizedRef = referralCode.toLowerCase().trim();
        const { data: referrer } = await supabaseAdmin
          .from('users')
          .select('id')
          .eq('referral_code', normalizedRef)
          .maybeSingle();
        if (referrer) {
          referrerId = referrer.id;
        }
      }

      const { data: insertData, error: insertError } = await supabaseAdmin
        .from('users')
        .insert([{
          email: normalizedEmail,
          phone: null,
          password_hash: passwordHash,
          username: username,
          full_name: name || username,
          bitcoin_wallet_address: null,
          is_email_verified: true,
          email_verified: true,
          average_rating: 0,
          total_trades: 0,
          completion_rate: 100,
          account_status: 'ACTIVE',
          created_at: new Date(),
          avatar_url: picture || null,
          is_admin: false,
          is_moderator: false,
          referred_by: referrerId,
          referral_code: referralCodeValue,
          badge: 'BEGINNER',
        }])
        .select();

      if (insertError) {
        console.error('[Google Auth] User insertion failed:', insertError);
        return res.status(500).json({ error: 'Failed to create user account' });
      }

      const newUser = insertData[0];
      userToAuth = newUser;

      // Seed balance rows
      await Promise.all([
        supabaseAdmin.from('user_balances').insert([{ user_id: newUser.id, balance_btc: 0, balance_usd: 0 }]).then(null, () => { }),
        supabaseAdmin.from('wallets').insert({ user_id: newUser.id, balance_btc: 0, locked_balance_btc: 0, updated_at: new Date().toISOString() }).then(null, () => { }),
      ]);

      // Background tasks
      const bonusExpires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      supabaseAdmin.from('users').update({ bonus_step: 1, bonus_expires_at: bonusExpires })
        .eq('id', newUser.id).then(null, () => { });

      detectAndSaveCountry(newUser.id, req).catch(() => { });

      emailService.sendWelcomeEmail({ id: newUser.id, email: normalizedEmail, username })
        .catch(e => console.error('[Google Auth] Welcome email failed:', e.message));

      // Provision a real HD wallet address, mirrored to every table the deposit
      // monitors read from (see hdWalletService.ensureWalletExists).
      Promise.resolve().then(async () => {
        try {
          const { address } = await hdWalletService.ensureWalletExists(newUser.id);
          console.log(`[Google Auth] Wallet ensured for ${newUser.username}: ${address}`);
          realtimeDepositService.subscribeAddress(newUser.id, address);
        } catch (e) {
          console.error('[Google Auth] Wallet provisioning failed:', e.message);
        }
      });

      // Increment referrer referral count
      if (referrerId) {
        (async () => {
          try {
            const { data: ref } = await supabaseAdmin.from('users').select('total_referrals').eq('id', referrerId).single();
            const newCount = (ref?.total_referrals || 0) + 1;
            await supabaseAdmin.from('users').update({ total_referrals: newCount }).eq('id', referrerId);
            notifyUserReferral(referrerId, newUser.username).catch(() => { });
          } catch (refErr) {
            console.error('[Google Auth] Referrer update failed:', refErr.message);
          }
        })();
      }
    }

    // 2FA login gate removed — Settings > Security "Enable 2FA" toggle still
    // exists and is stored, it just no longer blocks login with a second code.

    // 5. Sign JWT
    const token = jwt.sign(
      { userId: userToAuth.id, email: userToAuth.email },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      token,
      user: {
        id: userToAuth.id,
        email: userToAuth.email,
        username: userToAuth.username,
        full_name: userToAuth.full_name,
        average_rating: userToAuth.average_rating || 0,
        total_trades: userToAuth.total_trades || 0,
        avatar_url: userToAuth.avatar_url || null,
        is_admin: userToAuth.is_admin || false,
        is_moderator: userToAuth.is_moderator || false,
        referral_code: userToAuth.referral_code,
        bitcoin_wallet_address: userToAuth.bitcoin_wallet_address || null,
      },
      message: 'Logged in successfully with Google'
    });

  } catch (err) {
    console.error('Google login route error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/register', authLimiter, async (req, res) => {
  try {
    const { email, phone, password, username, fullName, referralCode } = req.body;

    // ── Validate inputs ────────────────────────────────────────────────────
    if ((!email && !phone) || !password || !username) {
      return res.status(400).json({ error: E.MISSING_FIELDS });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: E.PASSWORD_TOO_SHORT });
    }

    // ── Email format + disposable domain + MX validation ───────────────────
    if (email) {
      const emailCheck = await validateEmailForRegistration(email.toLowerCase().trim());
      if (!emailCheck.valid) {
        return res.status(400).json({ error: emailCheck.error });
      }
    }

    // ── Check uniqueness (fast DB lookups) ─────────────────────────────────
    if (email) {
      const { data: existingUser } = await supabaseAdmin
        .from('users').select('email').eq('email', email.toLowerCase().trim()).single();
      if (existingUser) return res.status(400).json({ error: E.EMAIL_TAKEN });
    }

    if (phone) {
      const { data: existingPhone } = await supabaseAdmin
        .from('users').select('id').eq('phone', phone.trim()).single();
      if (existingPhone) return res.status(400).json({ error: 'An account with this phone number already exists. Try logging in or use a different number.' });
    }

    const { data: existingUsername } = await supabaseAdmin
      .from('users').select('id').eq('username', username.trim()).single();
    if (existingUsername) return res.status(400).json({ error: E.USERNAME_TAKEN });

    // ── Referral lookup ────────────────────────────────────────────────────
    let referrerId = null;
    if (referralCode) {
      const normalized = referralCode.toLowerCase().trim();
      const { data: referrer } = await supabaseAdmin
        .from('users').select('id').eq('referral_code', normalized).maybeSingle();
      if (referrer) {
        referrerId = referrer.id;
        console.log(`[Register] Referral matched: code=${normalized} → referrer=${referrerId}`);
      } else {
        console.log(`[Register] Referral code not found: ${normalized}`);
      }
    }

    // ── Create user ────────────────────────────────────────────────────────
    const passwordHash = await bcrypt.hash(password, 10);
    const referralCodeValue = await generateUniqueReferralCode(username);

    const { data, error } = await supabaseAdmin.from('users').insert([{
      email: email ? email.toLowerCase().trim() : null,
      phone: phone ? phone.trim() : null,
      password_hash: passwordHash,
      username: username.trim(),
      full_name: fullName || username.trim(),
      bitcoin_wallet_address: null,       // HD address generated async below
      is_email_verified: false,
      average_rating: 0,
      total_trades: 0,
      completion_rate: 100,
      account_status: 'ACTIVE',
      created_at: new Date(),
      avatar_url: null,
      is_admin: false,
      is_moderator: false,
      referred_by: referrerId,
      referral_code: referralCodeValue,
      badge: 'BEGINNER',
    }]).select();

    if (error) {
      console.error('[Register] DB insert error:', error);
      const isDuplicate = error.message?.includes('duplicate') || error.code === '23505';
      return res.status(400).json({ error: isDuplicate ? 'An account with this email or username already exists.' : 'Registration failed. Please try again.' });
    }
    if (!data || data.length === 0) return res.status(400).json({ error: E.REGISTER_FAILED });

    const newUser = data[0];

    // ── Seed balance rows — both tables must exist before any trade ───────
    await Promise.all([
      supabaseAdmin.from('user_balances').insert([{ user_id: newUser.id, balance_btc: 0, balance_usd: 0 }])
        .then(null, () => { }),
      supabaseAdmin.from('wallets').insert({
        user_id: newUser.id, balance_btc: 0, locked_balance_btc: 0, updated_at: new Date().toISOString(),
      }).then(null, () => { }), // ignore duplicate if row already exists
    ]);

    // ── Generate 6-digit verification code & save to DB (email users only) ──
    let emailVerifyCode = null;
    if (email) {
      emailVerifyCode = Math.floor(100000 + Math.random() * 900000).toString();
      verificationCodes.set(email, { code: emailVerifyCode, expiresAt: Date.now() + 10 * 60 * 1000, userId: newUser.id });
      await supabaseAdmin.from('users').update({
        verification_code: emailVerifyCode,
        verification_code_expires: new Date(Date.now() + 10 * 60 * 1000),
      }).eq('id', newUser.id);
    }

    let phoneOtpCode = null;
    let phoneE164 = null;
    if (phone) {
      phoneE164 = phone.trim().startsWith('+') ? phone.trim() : `+${phone.trim().replace(/^0+/, '')}`;
      phoneOtpCode = Math.floor(100000 + Math.random() * 900000).toString();
      // Same in-memory store used by /api/auth/verify-otp and
      // /api/users/verify-phone-otp, so verification works via either endpoint.
      otpStore.set(phoneE164, { otp: phoneOtpCode, expires: Date.now() + 10 * 60 * 1000 });
    }

    // ── Sign JWT ───────────────────────────────────────────────────────────
    const token = jwt.sign({ userId: newUser.id, email: email || null }, JWT_SECRET, { expiresIn: '7d' });

    // ── RESPOND IMMEDIATELY — never block on email or external APIs ────────
    res.json({
      success: true,
      token,
      user: {
        id: newUser.id,
        email: newUser.email,
        username: newUser.username,
        full_name: newUser.full_name,
        average_rating: 0,
        total_trades: 0,
        avatar_url: null,
        is_admin: false,
        is_moderator: false,
        referral_code: referralCodeValue,
        bitcoin_wallet_address: null,
      },
      message: 'Account created! Check your email for the verification code.',
    });

    // ── BACKGROUND WORK (runs after response is sent) ──────────────────────
    // 1. Welcome bonus — step 1 (registered, awaiting verification), 30-day window
    const bonusExpires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    supabaseAdmin.from('users').update({ bonus_step: 1, bonus_expires_at: bonusExpires })
      .eq('id', newUser.id).then(null, () => { });

    // 2. Detect and save country from IP (fire and forget)
    detectAndSaveCountry(newUser.id, req).catch(() => { });

    // 2. If this email already has an approved P2P migration request (Noones /
    // Binance P2P / other — submitted before they finished signing up), stamp
    // their verified reputation onto the new profile right away. Covers the
    // case where admin approval happened before registration; the reverse
    // order is handled in /api/admin/p2p-migration/:id/approve.
    if (email) {
      supabaseAdmin.from('p2p_migration_requests')
        .select('platform, admin_username_seen, admin_feedback_count')
        .eq('email', email.toLowerCase().trim()).eq('status', 'approved')
        .maybeSingle()
        .then(({ data: migration }) => {
          if (!migration) return;
          supabaseAdmin.from('users').update({
            p2p_migrated_platform: migration.platform,
            p2p_migrated_username: migration.admin_username_seen,
            p2p_migrated_feedback: migration.admin_feedback_count,
            p2p_migration_approved_at: new Date().toISOString(),
          }).eq('id', newUser.id).then(null, () => { });
        })
        .catch(() => { });
    }

    // 2. Send verification + welcome email (email users only)
    if (email && emailVerifyCode) {
      emailService.sendVerificationEmail(email, emailVerifyCode, newUser.id)
        .catch(e => console.error('[Register] Verification email failed:', e.message));
      emailService.sendWelcomeEmail({ id: newUser.id, email, username })
        .catch(e => console.error('[Register] Welcome email failed:', e.message));
    }

    if (phone && phoneOtpCode && phoneE164) {
      sendSmsOtp(phoneE164, `${phoneOtpCode} is your PRAQEN verification code. Valid for 10 minutes. Don't share this with anyone.`)
        .then(() => console.log(`[Register] SMS OTP sent to ${phoneE164}`))
        .catch(e => console.error('[Register] SMS OTP send failed:', e.message));
      storeOtp(phoneE164, phoneOtpCode)
        .catch(e => console.warn('[Register] SMS OTP DB backup failed:', e.message));
    }

    // 2. Generate a real HD wallet address for this user and mirror it to every
    //    table the deposit monitors read from. ensureWalletExists() uses
    //    select-then-insert (not upsert) so it can't silently no-op the way the
    //    old duplicated blocks here did.
    Promise.resolve().then(async () => {
      try {
        const { address } = await hdWalletService.ensureWalletExists(newUser.id);
        console.log(`[Register] Wallet ensured for ${newUser.username}: ${address}`);
        // Subscribe to real-time WebSocket monitoring immediately
        realtimeDepositService.subscribeAddress(newUser.id, address);
      } catch (e) {
        console.error('[Register] Wallet provisioning failed:', e.message);
      }
    });

    // 3. Increment referrer's total_referrals count + fire instant notification
    if (referrerId) {
      (async () => {
        try {
          const { data: ref } = await supabaseAdmin.from('users').select('total_referrals').eq('id', referrerId).single();
          const newCount = (ref?.total_referrals || 0) + 1;
          await supabaseAdmin.from('users').update({ total_referrals: newCount }).eq('id', referrerId);
          console.log(`[Register] Referral count updated for ${referrerId}: ${newCount}`);
          await createNotification(
            referrerId,
            'referral',
            '🎉 New Referral!',
            `${username} just joined PRAQEN via your referral link — you now have ${newCount} referral${newCount !== 1 ? 's' : ''}!`,
            '/dashboard?tab=affiliate'
          );
        } catch (e) {
          console.error('[Register] Referral count update failed:', e.message);
        }
      })();
    }

  } catch (error) {
    console.error('[Register] Unexpected error:', error);
    if (!res.headersSent) res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
});

app.post('/api/auth/register-with-referral', authLimiter, async (req, res) => {
  // same as /register — just alias it
  req.url = '/api/auth/register';
  app._router.handle(req, res);
});

app.post('/api/auth/login', authLimiter, async (req, res) => {
  try {
    const { email, password, phone, method } = req.body;

    // ── Phone login (OTP already verified before this call) ──────────────────
    if (method === 'phone' || (phone && !email)) {
      if (!phone) return res.status(400).json({ error: 'Phone number is required' });

      // Try every common storage format so we find the user regardless of how
      // they registered (with +, without +, with leading 0, etc.)
      const stripped = String(phone).replace(/^\+/, '');           // '233595367270'
      const withPlus = `+${stripped}`;                             // '+233595367270'
      const localZero = stripped.replace(/^233/, '0');              // '0595367270' (Ghana eg)
      const candidates = [...new Set([phone, withPlus, stripped, localZero])];

      console.log(`[phone login] trying formats:`, candidates);

      let data = null;
      for (const candidate of candidates) {
        const { data: row } = await supabaseAdmin.from('users').select('*').eq('phone', candidate).single();
        if (row) { data = row; break; }
      }
      if (!data) return res.status(404).json({ error: 'No account found for this phone number. Please register first.' });

      // 2FA login gate removed — Settings > Security "Enable 2FA" toggle still
      // exists and is stored, it just no longer blocks login with a second code.
      const token = jwt.sign({ userId: data.id, email: data.email }, JWT_SECRET, { expiresIn: '7d' });
      const nowPhone = new Date().toISOString();
      await supabaseAdmin.from('users').update({ last_login: nowPhone, last_seen_at: nowPhone }).eq('id', data.id);
      detectAndSaveCountry(data.id, req, phone).catch(() => { });
      let btcAddress = data.bitcoin_wallet_address;
      if (!isRealBtcAddress(btcAddress)) {
        btcAddress = await upgradeToHDAddress(data.id, data.username) || btcAddress;
      }
      return res.json({
        success: true,
        user: {
          id: data.id, email: data.email, username: data.username, full_name: data.full_name,
          average_rating: data.average_rating || 0, total_trades: data.total_trades || 0,
          avatar_url: data.avatar_url || null, is_admin: data.is_admin || false,
          is_moderator: data.is_moderator || false, referral_code: data.referral_code || null,
          bitcoin_wallet_address: btcAddress,
          total_referrals: data.total_referrals || 0,
          referral_earnings_btc: data.referral_earnings_btc || 0
        },
        token,
      });
    }

    // ── Email + password login ────────────────────────────────────────────────
    if (!email || !password) return res.status(400).json({ error: 'Missing email or password' });
    const normalizedLoginEmail = email.toLowerCase().trim();
    const { data, error } = await supabaseAdmin.from('users').select('*').eq('email', normalizedLoginEmail).single();
    if (error || !data) return res.status(401).json({ error: 'Invalid credentials' });
    const validPassword = await bcrypt.compare(password, data.password_hash);
    if (!validPassword) return res.status(401).json({ error: 'Invalid credentials' });

    // Generate 6-digit OTP and store it for 10 minutes
    const loginOtp = String(Math.floor(100000 + Math.random() * 900000));
    emailLoginOtpStore.set(normalizedLoginEmail, {
      code: loginOtp,
      expires: Date.now() + 10 * 60 * 1000,
      userId: data.id,
    });

    // Send OTP email — this comment used to claim "we await to catch send failures" while the
    // code right below it did the opposite (fire-and-forget, catch() with no await). That meant
    // the response always claimed success even when delivery failed outright, leaving the user
    // stuck waiting for a code that was never coming with zero indication why. Actually await it.
    try {
      await emailService.sendLoginOtpEmail(
        { id: data.id, email: data.email, username: data.username },
        loginOtp
      );
    } catch (sendErr) {
      console.error('[login-otp] email send failed:', sendErr.message);
      emailLoginOtpStore.delete(normalizedLoginEmail);
      return res.status(500).json({ error: 'Could not send your login code right now. Please try again in a moment.' });
    }

    return res.json({ success: true, requiresOtp: true, email: data.email });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

// ── Email login OTP verification (+ 2FA check) ────────────────────────────────
app.post('/api/auth/verify-login-otp', authLimiter, async (req, res) => {
  try {
    const { email, code } = req.body;
    if (!email || !code) return res.status(400).json({ error: 'Email and code are required' });

    const key = email.toLowerCase();
    const record = emailLoginOtpStore.get(key);
    if (!record) return res.status(400).json({ error: 'No pending verification for this email. Please log in again.' });
    if (Date.now() > record.expires) {
      emailLoginOtpStore.delete(key);
      return res.status(400).json({ error: 'Code has expired. Please log in again.' });
    }
    if (record.code !== String(code).trim()) {
      return res.status(400).json({ error: 'Incorrect code. Please try again.' });
    }

    // OTP valid — delete it
    emailLoginOtpStore.delete(key);

    const { data } = await supabaseAdmin.from('users').select('*').eq('id', record.userId).single();
    if (!data) return res.status(404).json({ error: 'User not found' });

    // 2FA login gate removed — Settings > Security "Enable 2FA" toggle still
    // exists and is stored, it just no longer blocks login with a second code.

    // ── Issue real JWT ──────────────────────────────────────────────────────
    const token = jwt.sign({ userId: data.id, email: data.email }, JWT_SECRET, { expiresIn: '7d' });
    const now = new Date().toISOString();
    await supabaseAdmin.from('users').update({ last_login: now, last_seen_at: now }).eq('id', data.id);
    detectAndSaveCountry(data.id, req).catch(() => { });

    let btcAddress = data.bitcoin_wallet_address;
    if (!isRealBtcAddress(btcAddress)) {
      btcAddress = await upgradeToHDAddress(data.id, data.username) || btcAddress;
    }

    res.json({
      success: true,
      user: {
        id: data.id, email: data.email, username: data.username, full_name: data.full_name,
        average_rating: data.average_rating || 0, total_trades: data.total_trades || 0,
        avatar_url: data.avatar_url || null, is_admin: data.is_admin || false,
        is_moderator: data.is_moderator || false,
        referral_code: data.referral_code || null,
        bitcoin_wallet_address: btcAddress,
        total_referrals: data.total_referrals || 0,
        referral_earnings_btc: data.referral_earnings_btc || 0,
        two_factor_enabled: data.two_factor_enabled || false,
        two_factor_method: data.two_factor_method || null
      },
      token,
    });

    emailService.sendLoginAlertEmail({ id: data.id, email: data.email, username: data.username })
      .catch(() => { });
  } catch (err) {
    console.error('[verify-login-otp] error:', err);
    res.status(500).json({ error: 'Verification failed. Please try again.' });
  }
});

// ── 2FA login verification ────────────────────────────────────────────────────
app.post('/api/auth/verify-2fa-login', authLimiter, async (req, res) => {
  try {
    const { tempToken, code } = req.body;
    if (!tempToken || !code) return res.status(400).json({ error: 'Temporary token and code are required' });

    // Verify temp token
    let decoded;
    try {
      decoded = jwt.verify(tempToken, JWT_SECRET);
    } catch {
      return res.status(401).json({ error: 'Session expired. Please log in again.' });
    }
    if (!decoded.pending2FA) return res.status(401).json({ error: 'Invalid session. Please log in again.' });

    // Determine verification method from pending record or user's TOTP secret
    const pending = pending2FALogin.get(tempToken);
    let isVerified = false;
    let userDataFor2FA = null;

    if (pending) {
      // For TOTP, the pending entry has no valid code — skip comparison and use TOTP secret
      if (pending.method === 'totp') {
        const { data: userForTOTP } = await supabaseAdmin.from('users').select('totp_secret').eq('id', decoded.userId).single();
        if (!userForTOTP || !userForTOTP.totp_secret) {
          pending2FALogin.delete(tempToken);
          return res.status(400).json({ error: 'TOTP not configured. Please log in again.' });
        }
        isVerified = speakeasy.totp.verify({
          secret: userForTOTP.totp_secret,
          encoding: 'base32',
          token: String(code).trim(),
          window: 1,
        });
        if (!isVerified) {
          return res.status(400).json({ error: 'Incorrect authenticator code. Please try again.' });
        }
        pending2FALogin.delete(tempToken);
      } else {
        // Method is email, sms, or whatsapp — check against stored code
        if (Date.now() > pending.expires) {
          pending2FALogin.delete(tempToken);
          return res.status(400).json({ error: 'Code has expired. Please log in again.' });
        }
        if (pending.code !== String(code).trim()) {
          return res.status(400).json({ error: 'Incorrect code. Please try again.' });
        }
        isVerified = true;
        pending2FALogin.delete(tempToken);
      }
    } else {
      // No pending entry — could be TOTP. Fetch user and verify against TOTP secret
      const { data: userForTOTP } = await supabaseAdmin.from('users').select('totp_secret, two_factor_method').eq('id', decoded.userId).single();
      if (!userForTOTP) return res.status(404).json({ error: 'User not found' });
      userDataFor2FA = userForTOTP;

      if (userForTOTP.two_factor_method === 'totp' && userForTOTP.totp_secret) {
        isVerified = speakeasy.totp.verify({
          secret: userForTOTP.totp_secret,
          encoding: 'base32',
          token: String(code).trim(),
          window: 1,
        });
        if (!isVerified) {
          return res.status(400).json({ error: 'Incorrect authenticator code. Please try again.' });
        }
      } else {
        return res.status(400).json({ error: 'No pending 2FA verification. Please log in again.' });
      }
    }

    if (!isVerified) {
      return res.status(400).json({ error: '2FA verification failed. Please try again.' });
    }

    // Issue real JWT
    const { data } = await supabaseAdmin.from('users').select('*').eq('id', decoded.userId).single();
    if (!data) return res.status(404).json({ error: 'User not found' });

    const token = jwt.sign({ userId: data.id, email: data.email }, JWT_SECRET, { expiresIn: '7d' });
    const now = new Date().toISOString();
    await supabaseAdmin.from('users').update({ last_login: now, last_seen_at: now }).eq('id', data.id);
    detectAndSaveCountry(data.id, req).catch(() => { });

    let btcAddress = data.bitcoin_wallet_address;
    if (!isRealBtcAddress(btcAddress)) {
      btcAddress = await upgradeToHDAddress(data.id, data.username) || btcAddress;
    }

    res.json({
      success: true,
      token,
      user: {
        id: data.id, email: data.email, username: data.username, full_name: data.full_name,
        average_rating: data.average_rating || 0, total_trades: data.total_trades || 0,
        avatar_url: data.avatar_url || null, is_admin: data.is_admin || false,
        is_moderator: data.is_moderator || false,
        referral_code: data.referral_code || null,
        bitcoin_wallet_address: btcAddress,
        total_referrals: data.total_referrals || 0,
        referral_earnings_btc: data.referral_earnings_btc || 0,
        two_factor_enabled: data.two_factor_enabled || false,
        two_factor_method: data.two_factor_method || null,
      },
    });

    emailService.sendLoginAlertEmail({ id: data.id, email: data.email, username: data.username })
      .catch(() => { });
  } catch (error) {
    console.error('[verify-2fa-login] error:', error.message);
    res.status(500).json({ error: '2FA verification failed. Please try again.' });
  }
});


// ── Password Reset Email Template ────────────────────────────────────────────
function buildPasswordResetEmailHtml(resetUrl) {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PRAQEN Password Reset</title></head>
<body style="margin:0;padding:0;background:#F0FAF5;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F0FAF5;padding:32px 0;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(27,67,50,0.10);">
        <tr><td style="background:linear-gradient(135deg,#1B4332 0%,#2D6A4F 100%);padding:32px 40px;text-align:center;">
          <div style="display:inline-block;width:56px;height:56px;background:#F4A422;border-radius:14px;line-height:56px;font-size:28px;font-weight:900;color:#1B4332;font-family:Georgia,serif;text-align:center;">P</div>
          <p style="margin:12px 0 0;color:#ffffff;font-size:20px;font-weight:800;letter-spacing:3px;font-family:Georgia,serif;">PRAQEN</p>
          <p style="margin:4px 0 0;color:rgba(255,255,255,0.65);font-size:12px;letter-spacing:1px;">Password Reset Request</p>
        </td></tr>
        <tr><td style="padding:40px 40px 32px;text-align:center;">
          <p style="margin:0 0 8px;font-size:16px;font-weight:600;color:#334155;">Reset Your Password</p>
          <p style="margin:0 0 24px;font-size:13px;color:#64748B;line-height:1.6;">We received a request to reset the password for your PRAQEN account. Click the button below to set a new password. This link expires in <strong>1 hour</strong>.</p>
          <a href="${resetUrl}" style="display:inline-block;background:linear-gradient(135deg,#1B4332,#2D6A4F);color:#ffffff;text-decoration:none;font-size:15px;font-weight:800;padding:14px 36px;border-radius:10px;letter-spacing:0.5px;">Reset Password →</a>
          <p style="margin:24px 0 8px;font-size:12px;color:#94A3B8;">If you didn't request this, you can safely ignore this email.</p>
          <p style="margin:0;font-size:12px;color:#94A3B8;">Never share this link with anyone — PRAQEN will never ask for it.</p>
        </td></tr>
        <tr><td style="padding:0 40px 24px;">
          <div style="background:#FEF3C7;border:1px solid #FDE68A;border-radius:10px;padding:14px 18px;text-align:center;">
            <p style="margin:0;font-size:12px;font-weight:700;color:#92400E;">⚠️ Always trade within PRAQEN — never outside our platform</p>
          </div>
        </td></tr>
        <tr><td style="background:#F8FAFC;padding:20px 40px;text-align:center;border-top:1px solid #E2E8F0;">
          <p style="margin:0 0 4px;font-size:12px;color:#94A3B8;">Need help? Contact us at <a href="mailto:support@praqen.com" style="color:#2D6A4F;font-weight:700;">support@praqen.com</a></p>
          <p style="margin:0;font-size:11px;color:#CBD5E1;">© 2025 PRAQEN · The World's Most Trusted P2P Bitcoin Marketplace</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ── Send password reset email (reuses same working emailService pipeline as welcome/verification emails) ──
async function sendPasswordResetEmail(email, resetUrl) {
  const html = buildPasswordResetEmailHtml(resetUrl);
  const subject = 'PRAQEN - Password Reset Request';
  console.log(`📧 Sending password reset to ${email}`);

  // Use emailService.sendEmail() — Brevo SMTP (primary) → Resend (fallback),
  // same pipeline that successfully sends welcome/verification emails.
  // emailService.js logs the actual error from each provider attempt.
  const result = await emailService.sendEmail({
    to: email,
    subject,
    html,
    type: 'password_reset',
    metadata: { reset_requested_at: new Date().toISOString() },
  });

  if (result.success) {
    console.log(`✅ Password reset email sent via emailService to ${email} (${result.messageId})`);
    return true;
  }

  // result.error contains the actual error from Brevo SMTP or Resend fallback
  console.error('[sendPasswordResetEmail] emailService returned failure:', {
    error: result.error,
    providerChain: 'Brevo SMTP → Resend fallback',
  });
  throw new Error(`Email delivery failed: ${result.error || 'Unknown error'}`);
}

// ── Forgot Password: generate reset token & email link ────────────────────────
app.post('/api/auth/forgot-password', authLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const normalizedEmail = email.toLowerCase().trim();

    const { data: user } = await supabaseAdmin
      .from('users')
      .select('id, email')
      .eq('email', normalizedEmail)
      .maybeSingle();

    if (!user) {
      console.log(`[forgot-password] No account for ${normalizedEmail}`);
      return res.json({ success: true, message: 'If an account exists with that email, a reset link has been sent.' });
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const tokenExpires = new Date(Date.now() + 60 * 60 * 1000);

    const { error: updateError } = await supabaseAdmin
      .from('users')
      .update({
        reset_password_token: resetToken,
        reset_password_expires: tokenExpires.toISOString(),
      })
      .eq('id', user.id);

    if (updateError) {
      console.error('[forgot-password] DB update error:', updateError.message);
      return res.status(500).json({ error: 'Failed to process request. Please try again.' });
    }

    const frontendUrl = (process.env.FRONTEND_URL || 'https://praqen.com').split(',')[0].trim();
    const resetUrl = `${frontendUrl}/reset-password?token=${resetToken}&email=${encodeURIComponent(normalizedEmail)}`;

    sendPasswordResetEmail(normalizedEmail, resetUrl)
      .then(() => console.log(`[forgot-password] Reset email sent to ${normalizedEmail}`))
      .catch(e => console.error('[forgot-password] Email send failed:', e.message));

    return res.json({ success: true, message: 'If an account exists with that email, a reset link has been sent.' });

  } catch (err) {
    console.error('[forgot-password] error:', err.message);
    res.status(500).json({ error: 'Failed to process request. Please try again.' });
  }
});

// ── Reset Password: validate token & update password ──────────────────────────
app.post('/api/auth/reset-password', authLimiter, async (req, res) => {
  try {
    const { email, newPassword, token } = req.body;

    if (!newPassword || !token) {
      return res.status(400).json({ error: 'New password and reset token are required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // ── OTP-issued reset token (phone or email, from the in-app "Forgot
    // password?" OTP flow) — checked first since it doesn't require `email`. ──
    const otpReset = passwordResetOtpTokens.get(token);
    if (otpReset) {
      if (Date.now() > otpReset.expires) {
        passwordResetOtpTokens.delete(token);
        return res.status(400).json({ error: 'Reset code has expired. Please request a new one.' });
      }
      passwordResetOtpTokens.delete(token); // one-time use

      const lookupField = otpReset.method === 'phone' ? 'phone' : 'email';
      const { data: otpUser, error: otpFetchError } = await supabaseAdmin
        .from('users').select('id').eq(lookupField, otpReset.contact).maybeSingle();

      if (otpFetchError || !otpUser) {
        return res.status(400).json({ error: 'Account not found.' });
      }

      const otpPasswordHash = await bcrypt.hash(newPassword, 10);
      const { error: otpUpdateError } = await supabaseAdmin
        .from('users')
        .update({ password_hash: otpPasswordHash, updated_at: new Date().toISOString() })
        .eq('id', otpUser.id);

      if (otpUpdateError) {
        console.error('[reset-password] OTP-flow DB update error:', otpUpdateError.message);
        return res.status(500).json({ error: 'Failed to reset password. Please try again.' });
      }

      console.log(`✅ Password reset successful via OTP for ${otpReset.contact}`);
      return res.json({ success: true, message: 'Password has been reset successfully. You can now log in with your new password.' });
    }

    // ── Emailed-link reset token (existing flow) — requires `email` ────────
    if (!email) {
      return res.status(400).json({ error: 'Invalid or expired reset link' });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const { data: user, error: fetchError } = await supabaseAdmin
      .from('users')
      .select('id, email, reset_password_token, reset_password_expires, password_hash')
      .eq('email', normalizedEmail)
      .maybeSingle();

    if (fetchError || !user) {
      console.error('[reset-password] DB fetch error:', fetchError?.message);
      return res.status(400).json({ error: 'Invalid or expired reset link' });
    }

    if (!user.reset_password_token) {
      return res.status(400).json({ error: 'No password reset has been requested for this account' });
    }

    if (user.reset_password_token !== token) {
      return res.status(400).json({ error: 'Invalid or expired reset link' });
    }

    const expiresAt = new Date(user.reset_password_expires).getTime();
    if (Date.now() > expiresAt) {
      return res.status(400).json({ error: 'Reset link has expired. Please request a new one.' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);

    const { error: updateError } = await supabaseAdmin
      .from('users')
      .update({
        password_hash: passwordHash,
        reset_password_token: null,
        reset_password_expires: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id);

    if (updateError) {
      console.error('[reset-password] DB update error:', updateError.message);
      return res.status(500).json({ error: 'Failed to reset password. Please try again.' });
    }

    console.log(`✅ Password reset successful for ${normalizedEmail}`);
    return res.json({ success: true, message: 'Password has been reset successfully. You can now log in with your new password.' });

  } catch (err) {
    console.error('[reset-password] error:', err.message);
    res.status(500).json({ error: 'Failed to reset password. Please try again.' });
  }
});

// ── Team portal: explicit email allowlist ────────────────────────────────────
// Deliberately a hand-maintained list of exact addresses, not a domain check.
const MODERATOR_EMAIL_ALLOWLIST = ['zeinudeen.team@praqen.com'];

// ── Team portal: direct login — password THEN a mandatory email OTP ──────────
// No path through this route ever issues a token on password alone. Reuses the
// same emailLoginOtpStore + /api/auth/verify-login-otp flow as regular user
// login, so team accounts get at least the same protection as everyone else.
app.post('/api/team/login', authLimiter, async (req, res) => {
  try {
    const { email: rawEmail, password } = req.body;
    const email = (rawEmail || '').toLowerCase().trim();
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

    if (!MODERATOR_EMAIL_ALLOWLIST.includes(email)) return res.status(403).json({ error: 'Not authorised for the Team Portal' });

    const { data, error } = await supabaseAdmin.from('users').select('*').eq('email', email).maybeSingle();
    if (error) {
      console.error('team/login db error:', error);
      return res.status(500).json({ error: 'Database error: ' + error.message });
    }
    if (!data) return res.status(401).json({ error: 'No account found for this email. Please create your account first.' });
    if (!data.password_hash) return res.status(401).json({ error: 'Account has no password set. Please create your account again.' });

    const valid = await bcrypt.compare(password, data.password_hash);
    if (!valid) return res.status(401).json({ error: 'Incorrect password. Please try again.' });

    if (!data.is_moderator && !data.is_admin) return res.status(403).json({ error: 'Access denied. This account does not have team privileges.' });

    // Password confirmed — now require the email code before issuing any token.
    const loginOtp = String(Math.floor(100000 + Math.random() * 900000));
    emailLoginOtpStore.set(email, {
      code: loginOtp,
      expires: Date.now() + 10 * 60 * 1000,
      userId: data.id,
    });
    try {
      await emailService.sendLoginOtpEmail(
        { id: data.id, email: data.email, username: data.username },
        loginOtp
      );
    } catch (sendErr) {
      console.error('[team-login-otp] email send failed:', sendErr.message);
      emailLoginOtpStore.delete(email);
      return res.status(500).json({ error: 'Could not send your login code right now. Please try again in a moment.' });
    }

    return res.json({ success: true, requiresOtp: true, email: data.email });
  } catch (err) {
    console.error('team/login error:', err);
    res.status(500).json({ error: err.message || 'Login failed. Please try again.' });
  }
});

// ── Team portal: check email status ─────────────────────────────────────────
// Returns: has_account | needs_setup | not_allowed
app.post('/api/team/check-email', authLimiter, async (req, res) => {
  try {
    const email = (req.body.email || '').toLowerCase().trim();
    if (!email) return res.status(400).json({ error: 'Email required' });
    const { data: user } = await supabaseAdmin.from('users').select('id,is_moderator,is_admin').eq('email', email).single();
    if (user) {
      if (user.is_moderator || user.is_admin) return res.json({ status: 'has_account' });
      return res.json({ status: 'not_allowed', error: 'This account does not have team access. Ask an admin to grant you access.' });
    }
    // No account yet — allow self-setup only if this exact email is on the allowlist
    if (MODERATOR_EMAIL_ALLOWLIST.includes(email)) return res.json({ status: 'needs_setup' });
    return res.json({ status: 'not_allowed', error: 'This email is not authorised for the Team Portal.' });
  } catch (err) {
    console.error('team/check-email error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Team portal: first-time account setup ────────────────────────────────────
app.post('/api/team/setup-account', authLimiter, async (req, res) => {
  try {
    const { email: rawEmail, full_name, password } = req.body;
    const email = (rawEmail || '').toLowerCase().trim();
    if (!email || !full_name || !password) return res.status(400).json({ error: 'Email, full name and password are all required' });
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
    if (full_name.trim().length > 200) return res.status(400).json({ error: 'Full name is too long (max 200 characters)' });
    if (!MODERATOR_EMAIL_ALLOWLIST.includes(email)) return res.status(403).json({ error: 'Not authorised' });
    // Must not already exist
    const { data: existing } = await supabaseAdmin.from('users').select('id').eq('email', email).single();
    if (existing) return res.status(400).json({ error: 'An account with this email already exists. Please log in.' });
    const hash = await bcrypt.hash(password, 12);
    const baseUsername = email.split('@')[0].replace(/[^a-z0-9_]/gi, '_').toLowerCase();
    const referralCode = await generateUniqueReferralCode(baseUsername);
    // Ensure username is unique by appending suffix if needed
    let username = baseUsername;
    const { data: taken } = await supabaseAdmin.from('users').select('id').eq('username', username).single();
    if (taken) username = `${baseUsername}_${Math.floor(1000 + Math.random() * 9000)}`;

    const { data: inserted, error } = await supabaseAdmin.from('users').insert([{
      email, username, full_name: full_name.trim(), password_hash: hash,
      is_moderator: true, is_admin: false, is_email_verified: true,
      account_status: 'ACTIVE', badge: 'BEGINNER',
      average_rating: 0, total_trades: 0, completion_rate: 100,
      referral_code: referralCode,
      avatar_url: null, bitcoin_wallet_address: null,
      created_at: new Date().toISOString(),
    }]).select();

    if (error || !inserted || inserted.length === 0) {
      console.error('team/setup-account insert error:', JSON.stringify(error));
      if (error?.code === '23505' || error?.message?.includes('duplicate') || error?.message?.includes('unique')) {
        return res.status(400).json({ error: 'Username or email already taken. Try a different email.' });
      }
      const msg = error?.message || '';
      if (msg.includes('character varying') || msg.includes('too long') || msg.includes('value too long')) {
        return res.status(400).json({ error: 'One of the fields is too long. Please shorten your name or use a shorter email address.' });
      }
      return res.status(500).json({ error: `Failed to create account: ${msg || error?.code || 'unknown DB error'}` });
    }
    const newUser = inserted[0];

    await supabaseAdmin.from('user_balances').insert([{ user_id: newUser.id, balance_btc: 0, balance_usd: 0 }]).then(null, () => { });

    const token = jwt.sign({ userId: newUser.id, email }, JWT_SECRET, { expiresIn: '7d' });
    res.json({
      success: true, token,
      user: {
        id: newUser.id, email, username: newUser.username, full_name: newUser.full_name,
        is_moderator: true, is_admin: false, avatar_url: null,
        average_rating: 0, total_trades: 0, referral_code: referralCode, total_referrals: 0, referral_earnings_btc: 0
      },
    });

    // Provision a real HD wallet address, mirrored to every table the deposit
    // monitors read from (see hdWalletService.ensureWalletExists).
    Promise.resolve().then(async () => {
      try {
        const { address } = await hdWalletService.ensureWalletExists(newUser.id);
        console.log(`[Team Setup] Wallet ensured for ${newUser.username}: ${address}`);
        realtimeDepositService.subscribeAddress(newUser.id, address);
      } catch (e) {
        console.error('[Team Setup] Wallet provisioning failed:', e.message);
      }
    });
    return;
  } catch (err) {
    console.error('team/setup-account error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/team/escrow-fees — escrow fee breakdown for team finance page (moderators + admins)
app.get('/api/team/escrow-fees', verifyToken, async (req, res) => {
  try {
    const { data: u } = await supabaseAdmin.from('users').select('is_admin, is_moderator, email').eq('id', req.userId).single();
    const ok = u?.is_admin || u?.is_moderator;
    if (!ok) return res.status(403).json({ error: 'Team access required' });

    const COMPANY_WALLET_ID = '14762cd0-d3b2-474f-acab-fe0071961e9a';

    // Real fee transactions from wallet_transactions (type=FEE for the company account)
    // Also pull DEPOSIT rows whose notes start with "Platform fee" (legacy records)
    const { data: feeTxs } = await supabaseAdmin
      .from('wallet_transactions')
      .select('id, amount_btc, notes, created_at, status, tx_hash')
      .eq('user_id', COMPANY_WALLET_ID)
      .or('type.eq.FEE,and(type.eq.DEPOSIT,notes.ilike.Platform fee%)')
      .order('created_at', { ascending: false })
      .limit(500);

    // Company wallet balance lives in the `wallets` table (updated by tradeEscrowService)
    const { data: walletBal } = await supabaseAdmin
      .from('wallets')
      .select('balance_btc, locked_balance_btc')
      .eq('user_id', COMPANY_WALLET_ID)
      .maybeSingle();

    const txs = feeTxs || [];

    // Parse notes: "Platform fee from trade ABCD1234 — 0.5% of ₿0.00123456"
    // or with pipe separator "Platform fee from trade ABCD1234 | 0.5% of ₿0.00123456"
    const records = txs.map(tx => {
      const notes = tx.notes || '';
      const tradeIdMatch = notes.match(/trade ([A-F0-9]{8})/i);
      const rateMatch = notes.match(/([\d.]+)%/);
      const tradeAmtMatch = notes.match(/₿([\d.]+)/);
      const rate = parseFloat(rateMatch?.[1] || '0.5');
      const isGiftCard = rate >= 2;
      return {
        id: tx.id,
        trade_ref: tradeIdMatch?.[1]?.toUpperCase() || '—',
        amount_btc: tx.amount_btc,
        rate,
        is_gift_card: isGiftCard,
        trade_btc: tradeAmtMatch ? parseFloat(tradeAmtMatch[1]) : 0,
        notes: notes,
        collected_at: tx.created_at,
        status: tx.status || 'CONFIRMED',
        tx_hash: tx.tx_hash || null,
      };
    });

    const tradeFees = records.filter(r => !r.is_gift_card);
    const gcFees = records.filter(r => r.is_gift_card);
    const sum = (arr) => arr.reduce((s, r) => s + parseFloat(r.amount_btc || 0), 0);

    // wallets table: balance_btc = total, locked_balance_btc = locked
    const walletTotal = parseFloat(walletBal?.balance_btc || 0);
    const walletLocked = parseFloat(walletBal?.locked_balance_btc || 0);
    const walletAvail = Math.max(0, walletTotal - walletLocked);
    const feesTotal = sum(records);

    res.json({
      records,
      availableBtc: walletAvail.toFixed(8),
      lockedBtc: walletLocked.toFixed(8),
      totalBtc: walletTotal.toFixed(8),
      totalFeeBtc: feesTotal.toFixed(8),
      totalTradeBtc: sum(tradeFees).toFixed(8),
      totalGcBtc: sum(gcFees).toFixed(8),
      tradeCount: tradeFees.length,
      gcCount: gcFees.length,
    });
  } catch (e) {
    console.error('[team/escrow-fees]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ================================================================
// COMPANY BOOKS — Loans/Debt + Expenses  (team + admin only)
// Tables needed (run once in Supabase SQL editor):
//   CREATE TABLE company_loans (
//     id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
//     title TEXT NOT NULL, lender TEXT NOT NULL,
//     amount_usd DECIMAL(12,2) NOT NULL DEFAULT 0,
//     amount_paid_usd DECIMAL(12,2) NOT NULL DEFAULT 0,
//     due_date DATE, status TEXT DEFAULT 'active',
//     notes TEXT, created_by TEXT,
//     created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
//   );
//   CREATE TABLE company_expenses (
//     id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
//     category TEXT NOT NULL DEFAULT 'other',
//     title TEXT NOT NULL, amount_usd DECIMAL(12,2) NOT NULL DEFAULT 0,
//     expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
//     paid_by TEXT, notes TEXT, created_by TEXT,
//     created_at TIMESTAMPTZ DEFAULT NOW()
//   );
// ================================================================

async function requireTeam(req, res) {
  const { data: u } = await supabaseAdmin.from('users').select('is_admin, is_moderator').eq('id', req.userId).single();
  if (!u?.is_admin && !u?.is_moderator) { res.status(403).json({ error: 'Team access required' }); return null; }
  return u;
}

// ── LOANS ──────────────────────────────────────────────────────────────────────
app.get('/api/team/loans', verifyToken, async (req, res) => {
  try {
    const t = await requireTeam(req, res); if (!t) return;
    const { data, error } = await supabaseAdmin.from('company_loans').select('*').order('created_at', { ascending: false });
    if (error) {
      console.error('[GET /api/team/loans] DB error:', error.message, '| code:', error.code);
      return res.json({ loans: [], totalOwed: '0.00', error: error.message });
    };
    const totalOwed = (data || []).filter(l => l.status !== 'paid').reduce((s, l) => s + parseFloat(l.amount_usd || 0) - parseFloat(l.amount_paid_usd || 0), 0);
    res.json({ loans: data || [], totalOwed: totalOwed.toFixed(2) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/team/loans', verifyToken, async (req, res) => {
  try {
    const t = await requireTeam(req, res); if (!t) return;
    const { title, lender, amount_usd, due_date, notes, currency, original_amount, fx_rate } = req.body;
    if (!title || !lender || !amount_usd) return res.status(400).json({ error: 'title, lender and amount_usd required' });
    const { data: u } = await supabaseAdmin.from('users').select('username').eq('id', req.userId).single();
    const { data, error } = await supabaseAdmin.from('company_loans').insert({
      title, lender, amount_usd: parseFloat(amount_usd), amount_paid_usd: 0,
      currency: currency || 'USD',
      original_amount: original_amount != null ? parseFloat(original_amount) : parseFloat(amount_usd),
      fx_rate: fx_rate != null ? parseFloat(fx_rate) : 1,
      due_date: due_date || null, status: 'active', notes: notes || null,
      created_by: u?.username || req.userId, created_at: new Date(), updated_at: new Date(),
    }).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json({ loan: data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/team/loans/:id', verifyToken, async (req, res) => {
  try {
    const t = await requireTeam(req, res); if (!t) return;
    const { amount_paid_usd, status, notes, due_date, title, lender, amount_usd } = req.body;
    const updates = { updated_at: new Date() };
    if (title !== undefined) updates.title = title;
    if (lender !== undefined) updates.lender = lender;
    if (amount_usd !== undefined) updates.amount_usd = parseFloat(amount_usd);
    if (amount_paid_usd !== undefined) updates.amount_paid_usd = parseFloat(amount_paid_usd);
    if (status !== undefined) updates.status = status;
    if (notes !== undefined) updates.notes = notes;
    if (due_date !== undefined) updates.due_date = due_date;
    const { data, error } = await supabaseAdmin.from('company_loans').update(updates).eq('id', req.params.id).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json({ loan: data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/team/loans/:id', verifyToken, async (req, res) => {
  try {
    const t = await requireTeam(req, res); if (!t) return;
    const { error } = await supabaseAdmin.from('company_loans').delete().eq('id', req.params.id);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── EXPENSES ───────────────────────────────────────────────────────────────────
app.get('/api/team/expenses', verifyToken, async (req, res) => {
  try {
    const t = await requireTeam(req, res); if (!t) return;
    const { data, error } = await supabaseAdmin.from('company_expenses').select('*').order('expense_date', { ascending: false }).limit(300);
    if (error) return res.status(400).json({ error: error.message });
    const expenses = data || [];
    const totalSpent = expenses.reduce((s, e) => s + parseFloat(e.amount_usd || 0), 0);
    const byCategory = expenses.reduce((m, e) => {
      const cat = e.category || 'other';
      m[cat] = (m[cat] || 0) + parseFloat(e.amount_usd || 0);
      return m;
    }, {});
    res.json({ expenses, totalSpent: totalSpent.toFixed(2), byCategory });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/team/expenses', verifyToken, async (req, res) => {
  try {
    const t = await requireTeam(req, res); if (!t) return;
    const { category, title, amount_usd, expense_date, paid_by, notes } = req.body;
    if (!title || !amount_usd) return res.status(400).json({ error: 'title and amount_usd required' });
    const { data: u } = await supabaseAdmin.from('users').select('username').eq('id', req.userId).single();
    const { data, error } = await supabaseAdmin.from('company_expenses').insert({
      category: category || 'other', title, amount_usd: parseFloat(amount_usd),
      expense_date: expense_date || new Date().toISOString().slice(0, 10),
      paid_by: paid_by || null, notes: notes || null,
      created_by: u?.username || req.userId, created_at: new Date(),
    }).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json({ expense: data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/team/expenses/:id', verifyToken, async (req, res) => {
  try {
    const t = await requireTeam(req, res); if (!t) return;
    const { error } = await supabaseAdmin.from('company_expenses').delete().eq('id', req.params.id);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ================================================================
// STAFF DIRECTORY  (team + admin only)
// Table: company_staff  — see company_staff_table.sql
// ================================================================
app.get('/api/team/staff', verifyToken, async (req, res) => {
  try {
    const t = await requireTeam(req, res); if (!t) return;
    const { data, error } = await supabaseAdmin
      .from('company_staff').select('*').order('start_date', { ascending: false });
    if (error) return res.status(400).json({ error: error.message });
    res.json({ staff: data || [] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/team/staff', verifyToken, async (req, res) => {
  try {
    const t = await requireTeam(req, res); if (!t) return;
    const {
      full_name, role, department, official_email, personal_email, phone,
      salary_usd, salary_period, contract_type, contract_months,
      start_date, status, bio, address,
      emergency_contact, emergency_phone, notes, avatar_base64,
    } = req.body;
    if (!full_name || !role) return res.status(400).json({ error: 'full_name and role are required' });
    const { data: me } = await supabaseAdmin.from('users').select('username').eq('id', req.userId).single();

    let avatar_url = null;
    if (avatar_base64) {
      const base64Data = avatar_base64.replace(/^data:image\/\w+;base64,/, '');
      const ext = avatar_base64.match(/^data:image\/(\w+);/)?.[1] || 'jpg';
      const buf = Buffer.from(base64Data, 'base64');
      const filename = `staff/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      await supabaseAdmin.storage.createBucket('staff-avatars', { public: true }).catch(() => { });
      const { error: upErr } = await supabaseAdmin.storage.from('staff-avatars').upload(filename, buf, { contentType: `image/${ext}`, upsert: true });
      if (!upErr) {
        const { data: { publicUrl } } = supabaseAdmin.storage.from('staff-avatars').getPublicUrl(filename);
        avatar_url = publicUrl;
      }
    }

    const { data, error } = await supabaseAdmin.from('company_staff').insert({
      full_name, role,
      department: department || 'General',
      official_email: official_email || null,
      personal_email: personal_email || null,
      phone: phone || null,
      salary_usd: parseFloat(salary_usd || 0),
      salary_period: salary_period || 'monthly',
      contract_type: contract_type || 'full-time',
      contract_months: contract_months ? parseInt(contract_months) : null,
      start_date: start_date || new Date().toISOString().slice(0, 10),
      status: status || 'active',
      bio: bio || null,
      address: address || null,
      emergency_contact: emergency_contact || null,
      emergency_phone: emergency_phone || null,
      notes: notes || null,
      avatar_url,
      added_by: me?.username || req.userId,
      created_at: new Date(), updated_at: new Date(),
    }).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json({ member: data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/team/staff/:id', verifyToken, async (req, res) => {
  try {
    const t = await requireTeam(req, res); if (!t) return;
    const {
      full_name, role, department, official_email, personal_email, phone,
      salary_usd, salary_period, contract_type, contract_months,
      start_date, status, bio, address,
      emergency_contact, emergency_phone, notes, avatar_base64,
    } = req.body;

    const updates = { updated_at: new Date() };
    if (full_name !== undefined) updates.full_name = full_name;
    if (role !== undefined) updates.role = role;
    if (department !== undefined) updates.department = department;
    if (official_email !== undefined) updates.official_email = official_email;
    if (personal_email !== undefined) updates.personal_email = personal_email;
    if (phone !== undefined) updates.phone = phone;
    if (salary_usd !== undefined) updates.salary_usd = parseFloat(salary_usd || 0);
    if (salary_period !== undefined) updates.salary_period = salary_period;
    if (contract_type !== undefined) updates.contract_type = contract_type;
    if (contract_months !== undefined) updates.contract_months = contract_months ? parseInt(contract_months) : null;
    if (start_date !== undefined) updates.start_date = start_date;
    if (status !== undefined) updates.status = status;
    if (bio !== undefined) updates.bio = bio;
    if (address !== undefined) updates.address = address;
    if (emergency_contact !== undefined) updates.emergency_contact = emergency_contact;
    if (emergency_phone !== undefined) updates.emergency_phone = emergency_phone;
    if (notes !== undefined) updates.notes = notes;

    if (avatar_base64) {
      const base64Data = avatar_base64.replace(/^data:image\/\w+;base64,/, '');
      const ext = avatar_base64.match(/^data:image\/(\w+);/)?.[1] || 'jpg';
      const buf = Buffer.from(base64Data, 'base64');
      const filename = `staff/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      await supabaseAdmin.storage.createBucket('staff-avatars', { public: true }).catch(() => { });
      const { error: upErr } = await supabaseAdmin.storage.from('staff-avatars').upload(filename, buf, { contentType: `image/${ext}`, upsert: true });
      if (!upErr) {
        const { data: { publicUrl } } = supabaseAdmin.storage.from('staff-avatars').getPublicUrl(filename);
        updates.avatar_url = publicUrl;
      }
    }

    const { data, error } = await supabaseAdmin.from('company_staff').update(updates).eq('id', req.params.id).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json({ member: data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/team/staff/:id', verifyToken, async (req, res) => {
  try {
    const t = await requireTeam(req, res); if (!t) return;
    const { error } = await supabaseAdmin.from('company_staff').delete().eq('id', req.params.id);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ================================================================
// ANNOUNCEMENTS
// ================================================================
app.get('/api/team/announcements', verifyToken, async (req, res) => {
  try {
    const t = await requireTeam(req, res); if (!t) return;
    const { data, error } = await supabaseAdmin.from('team_announcements').select('*').order('pinned', { ascending: false }).order('created_at', { ascending: false });
    if (error) return res.status(400).json({ error: error.message });
    res.json({ announcements: data || [] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/team/announcements', verifyToken, async (req, res) => {
  try {
    const t = await requireTeam(req, res); if (!t) return;
    const { title, body, priority } = req.body;
    if (!title || !body) return res.status(400).json({ error: 'title and body required' });
    const { data: me } = await supabaseAdmin.from('users').select('username').eq('id', req.userId).single();
    const { data, error } = await supabaseAdmin.from('team_announcements').insert({ title, body, priority: priority || 'normal', pinned: false, created_by: me?.username || req.userId, created_at: new Date(), updated_at: new Date() }).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json({ announcement: data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.patch('/api/team/announcements/:id', verifyToken, async (req, res) => {
  try {
    const t = await requireTeam(req, res); if (!t) return;
    const { title, body, priority, pinned } = req.body;
    const updates = { updated_at: new Date() };
    if (title !== undefined) updates.title = title;
    if (body !== undefined) updates.body = body;
    if (priority !== undefined) updates.priority = priority;
    if (pinned !== undefined) updates.pinned = pinned;
    const { data, error } = await supabaseAdmin.from('team_announcements').update(updates).eq('id', req.params.id).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json({ announcement: data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete('/api/team/announcements/:id', verifyToken, async (req, res) => {
  try {
    const t = await requireTeam(req, res); if (!t) return;
    const { error } = await supabaseAdmin.from('team_announcements').delete().eq('id', req.params.id);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ================================================================
// TASK MANAGER
// ================================================================
app.get('/api/team/tasks', verifyToken, async (req, res) => {
  try {
    const t = await requireTeam(req, res); if (!t) return;
    const { data, error } = await supabaseAdmin.from('team_tasks').select('*').order('created_at', { ascending: false });
    if (error) return res.status(400).json({ error: error.message });
    res.json({ tasks: data || [] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/team/tasks', verifyToken, async (req, res) => {
  try {
    const t = await requireTeam(req, res); if (!t) return;
    const { title, description, assigned_to, priority, due_date } = req.body;
    if (!title) return res.status(400).json({ error: 'title required' });
    const { data: me } = await supabaseAdmin.from('users').select('username').eq('id', req.userId).single();
    const { data, error } = await supabaseAdmin.from('team_tasks').insert({ title, description: description || null, assigned_to: assigned_to || null, priority: priority || 'medium', status: 'todo', due_date: due_date || null, created_by: me?.username || req.userId, created_at: new Date(), updated_at: new Date() }).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json({ task: data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.patch('/api/team/tasks/:id', verifyToken, async (req, res) => {
  try {
    const t = await requireTeam(req, res); if (!t) return;
    const { title, description, assigned_to, priority, status, due_date } = req.body;
    const updates = { updated_at: new Date() };
    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (assigned_to !== undefined) updates.assigned_to = assigned_to;
    if (priority !== undefined) updates.priority = priority;
    if (status !== undefined) updates.status = status;
    if (due_date !== undefined) updates.due_date = due_date;
    const { data, error } = await supabaseAdmin.from('team_tasks').update(updates).eq('id', req.params.id).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json({ task: data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete('/api/team/tasks/:id', verifyToken, async (req, res) => {
  try {
    const t = await requireTeam(req, res); if (!t) return;
    const { error } = await supabaseAdmin.from('team_tasks').delete().eq('id', req.params.id);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ================================================================
// ACTIVITY LOG
// ================================================================
app.get('/api/team/activity-log', verifyToken, async (req, res) => {
  try {
    const t = await requireTeam(req, res); if (!t) return;
    const { data, error } = await supabaseAdmin.from('team_activity_log').select('*').order('created_at', { ascending: false }).limit(200);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ logs: data || [] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/team/activity-log', verifyToken, async (req, res) => {
  try {
    const t = await requireTeam(req, res); if (!t) return;
    const { action, details, category } = req.body;
    if (!action) return res.status(400).json({ error: 'action required' });
    const { data: me } = await supabaseAdmin.from('users').select('username').eq('id', req.userId).single();
    const { data, error } = await supabaseAdmin.from('team_activity_log').insert({ actor: me?.username || 'Team', action, details: details || null, category: category || 'general', created_at: new Date() }).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json({ log: data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ================================================================
// PLATFORM STATS
// ================================================================
app.get('/api/team/platform-stats', verifyToken, async (req, res) => {
  try {
    const t = await requireTeam(req, res); if (!t) return;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const todayISO = today.toISOString();
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();

    const [
      { count: totalUsers },
      { count: newToday },
      { count: newThisWeek },
      { data: trades },
      { count: disputed },
      { count: kycPending },
      { count: bannedUsers },
    ] = await Promise.all([
      supabaseAdmin.from('users').select('*', { count: 'exact', head: true }).eq('is_admin', false).eq('is_moderator', false),
      supabaseAdmin.from('users').select('*', { count: 'exact', head: true }).gte('created_at', todayISO).eq('is_admin', false).eq('is_moderator', false),
      supabaseAdmin.from('users').select('*', { count: 'exact', head: true }).gte('created_at', weekAgo).eq('is_admin', false).eq('is_moderator', false),
      supabaseAdmin.from('trades').select('status, btc_amount, created_at').order('created_at', { ascending: false }).limit(1000),
      supabaseAdmin.from('trades').select('*', { count: 'exact', head: true }).eq('status', 'DISPUTED'),
      supabaseAdmin.from('users').select('*', { count: 'exact', head: true }).eq('kyc_status', 'pending'),
      supabaseAdmin.from('users').select('*', { count: 'exact', head: true }).eq('account_status', 'banned'),
    ]);

    const allTrades = trades || [];
    const activeTrades = allTrades.filter(t => !['COMPLETED', 'CANCELLED'].includes(t.status));
    const completedToday = allTrades.filter(t => t.status === 'COMPLETED' && t.created_at >= todayISO);
    const completedAll = allTrades.filter(t => t.status === 'COMPLETED');
    const totalVolumeBtc = completedAll.reduce((s, t) => s + parseFloat(t.btc_amount || 0), 0);
    const volumeTodayBtc = completedToday.reduce((s, t) => s + parseFloat(t.btc_amount || 0), 0);

    res.json({
      totalUsers: totalUsers || 0,
      newToday: newToday || 0,
      newThisWeek: newThisWeek || 0,
      activeTrades: activeTrades.length,
      completedToday: completedToday.length,
      totalTrades: allTrades.length,
      disputed: disputed || 0,
      kycPending: kycPending || 0,
      bannedUsers: bannedUsers || 0,
      totalVolumeBtc: totalVolumeBtc.toFixed(8),
      volumeTodayBtc: volumeTodayBtc.toFixed(8),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ================================================================
// RISK MONITOR
// ================================================================
app.get('/api/team/risk-monitor', verifyToken, async (req, res) => {
  try {
    const t = await requireTeam(req, res); if (!t) return;
    const [
      { data: banned },
      { data: kycFail },
      { data: disputed },
    ] = await Promise.all([
      supabaseAdmin.from('users').select('id, username, email, full_name, account_status, created_at, total_trades, country').eq('account_status', 'banned').order('created_at', { ascending: false }).limit(50),
      supabaseAdmin.from('users').select('id, username, email, full_name, kyc_status, created_at, country').eq('kyc_status', 'rejected').order('created_at', { ascending: false }).limit(50),
      supabaseAdmin.from('trades').select('id, buyer_id, seller_id, btc_amount, status, created_at').eq('status', 'DISPUTED').order('created_at', { ascending: false }).limit(50),
    ]);
    res.json({
      banned: banned || [],
      kycFail: kycFail || [],
      disputed: disputed || [],
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/team/risk-monitor/unban/:id', verifyToken, async (req, res) => {
  try {
    const t = await requireTeam(req, res); if (!t) return;
    const { error } = await supabaseAdmin.from('users').update({ account_status: 'active', updated_at: new Date() }).eq('id', req.params.id);
    if (error) return res.status(400).json({ error: error.message });
    const { data: me } = await supabaseAdmin.from('users').select('username').eq('id', req.userId).single();
    await supabaseAdmin.from('team_activity_log').insert({ actor: me?.username || 'Team', action: 'Unbanned user', details: `User ID: ${req.params.id}`, category: 'user', created_at: new Date() });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ================================================================
// TEAM SHIFTS
// ================================================================
app.get('/api/team/shifts', verifyToken, async (req, res) => {
  try {
    const t = await requireTeam(req, res); if (!t) return;
    const { data, error } = await supabaseAdmin.from('team_shifts').select('*').order('created_at', { ascending: true });
    if (error) return res.status(400).json({ error: error.message });
    res.json({ shifts: data || [] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/team/shifts', verifyToken, async (req, res) => {
  try {
    const t = await requireTeam(req, res); if (!t) return;
    const { member_name, day_of_week, start_time, end_time, timezone, notes } = req.body;
    if (!member_name || !day_of_week || !start_time || !end_time) return res.status(400).json({ error: 'member_name, day_of_week, start_time and end_time required' });
    const { data: me } = await supabaseAdmin.from('users').select('username').eq('id', req.userId).single();
    const { data, error } = await supabaseAdmin.from('team_shifts').insert({ member_name, day_of_week, start_time, end_time, timezone: timezone || 'WAT', notes: notes || null, created_by: me?.username || req.userId, created_at: new Date() }).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json({ shift: data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete('/api/team/shifts/:id', verifyToken, async (req, res) => {
  try {
    const t = await requireTeam(req, res); if (!t) return;
    const { error } = await supabaseAdmin.from('team_shifts').delete().eq('id', req.params.id);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ================================================================
// KNOWLEDGE BASE
// ================================================================
app.get('/api/team/knowledge-base', verifyToken, async (req, res) => {
  try {
    const t = await requireTeam(req, res); if (!t) return;
    const { data, error } = await supabaseAdmin.from('team_knowledge_base').select('*').order('created_at', { ascending: false });
    if (error) return res.status(400).json({ error: error.message });
    res.json({ articles: data || [] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/team/knowledge-base', verifyToken, async (req, res) => {
  try {
    const t = await requireTeam(req, res); if (!t) return;
    const { title, category, content, tags } = req.body;
    if (!title || !content) return res.status(400).json({ error: 'title and content required' });
    const { data: me } = await supabaseAdmin.from('users').select('username').eq('id', req.userId).single();
    const { data, error } = await supabaseAdmin.from('team_knowledge_base').insert({ title, category: category || 'General', content, tags: tags || null, created_by: me?.username || req.userId, created_at: new Date(), updated_at: new Date() }).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json({ article: data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.patch('/api/team/knowledge-base/:id', verifyToken, async (req, res) => {
  try {
    const t = await requireTeam(req, res); if (!t) return;
    const { title, category, content, tags } = req.body;
    const updates = { updated_at: new Date() };
    if (title !== undefined) updates.title = title;
    if (category !== undefined) updates.category = category;
    if (content !== undefined) updates.content = content;
    if (tags !== undefined) updates.tags = tags;
    const { data, error } = await supabaseAdmin.from('team_knowledge_base').update(updates).eq('id', req.params.id).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json({ article: data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete('/api/team/knowledge-base/:id', verifyToken, async (req, res) => {
  try {
    const t = await requireTeam(req, res); if (!t) return;
    const { error } = await supabaseAdmin.from('team_knowledge_base').delete().eq('id', req.params.id);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ================================================================
// REPORTS & EXPORTS (CSV)
// ================================================================
const toCSV = (rows, cols) => {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return [cols.join(','), ...rows.map(r => cols.map(c => esc(r[c])).join(','))].join('\n');
};
app.get('/api/team/reports/trades', verifyToken, async (req, res) => {
  try {
    const t = await requireTeam(req, res); if (!t) return;
    const { from, to } = req.query;
    let q = supabaseAdmin.from('trades').select('id, status, btc_amount, fiat_amount, currency, created_at, updated_at').order('created_at', { ascending: false }).limit(5000);
    if (from) q = q.gte('created_at', from);
    if (to) q = q.lte('created_at', to);
    const { data, error } = await q;
    if (error) return res.status(400).json({ error: error.message });
    const csv = toCSV(data || [], ['id', 'status', 'btc_amount', 'fiat_amount', 'currency', 'created_at', 'updated_at']);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="trades-report.csv"');
    res.send(csv);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/team/reports/fees', verifyToken, async (req, res) => {
  try {
    const t = await requireTeam(req, res); if (!t) return;
    const COMPANY_WALLET_ID = '14762cd0-d3b2-474f-acab-fe0071961e9a';
    const { from, to } = req.query;
    let q = supabaseAdmin.from('wallet_transactions').select('id, amount_btc, notes, status, created_at').eq('user_id', COMPANY_WALLET_ID).or('type.eq.FEE,and(type.eq.DEPOSIT,notes.ilike.Platform fee%)').order('created_at', { ascending: false }).limit(5000);
    if (from) q = q.gte('created_at', from);
    if (to) q = q.lte('created_at', to);
    const { data, error } = await q;
    if (error) return res.status(400).json({ error: error.message });
    const csv = toCSV(data || [], ['id', 'amount_btc', 'notes', 'status', 'created_at']);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="fees-report.csv"');
    res.send(csv);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/team/reports/users', verifyToken, async (req, res) => {
  try {
    const t = await requireTeam(req, res); if (!t) return;
    const { from, to } = req.query;
    let q = supabaseAdmin.from('users').select('id, username, email, full_name, country, kyc_status, account_status, total_trades, created_at').eq('is_admin', false).eq('is_moderator', false).order('created_at', { ascending: false }).limit(5000);
    if (from) q = q.gte('created_at', from);
    if (to) q = q.lte('created_at', to);
    const { data, error } = await q;
    if (error) return res.status(400).json({ error: error.message });
    const csv = toCSV(data || [], ['id', 'username', 'email', 'full_name', 'country', 'kyc_status', 'account_status', 'total_trades', 'created_at']);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="users-report.csv"');
    res.send(csv);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ================================================================
// ACTIVE OFFERS  (team + admin)
// ================================================================
app.get('/api/team/active-offers', verifyToken, async (req, res) => {
  try {
    const t = await requireTeam(req, res); if (!t) return;

    const { data: listings, error } = await supabaseAdmin
      .from('listings')
      .select('id, seller_id, listing_type, gift_card_brand, card_type, bitcoin_price, margin, pricing_type, currency, currency_symbol, country_name, payment_method, payment_methods, min_limit_usd, max_limit_usd, min_limit_local, max_limit_local, time_limit, created_at, view_count')
      .eq('status', 'ACTIVE')
      .order('created_at', { ascending: false })
      .limit(500);

    if (error) return res.status(400).json({ error: error.message });

    const sellerIds = [...new Set((listings || []).map(l => l.seller_id).filter(Boolean))];
    let usersMap = {};
    if (sellerIds.length > 0) {
      const { data: sellers } = await supabaseAdmin
        .from('users')
        .select('id, username, full_name, avatar_url, average_rating, total_trades, completion_rate, badge, country, last_seen_at, account_status')
        .in('id', sellerIds);
      (sellers || []).forEach(u => { usersMap[u.id] = u; });
    }

    const offers = (listings || []).map(l => ({
      ...l,
      seller: usersMap[l.seller_id] || null,
    }));

    // Group stats per seller
    const byUser = sellerIds.map(id => ({
      user: usersMap[id] || { id, username: 'Unknown' },
      offers: offers.filter(o => o.seller_id === id),
    })).sort((a, b) => b.offers.length - a.offers.length);

    res.json({
      offers,
      byUser,
      total: offers.length,
      totalSellers: sellerIds.length,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/auth/change-password', verifyToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Current and new password required' });
    if (newPassword.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
    if (!/[A-Z]/.test(newPassword)) return res.status(400).json({ error: 'Password must include at least one uppercase letter' });
    if (!/\d/.test(newPassword)) return res.status(400).json({ error: 'Password must include at least one number' });
    if (!/[^a-zA-Z0-9]/.test(newPassword)) return res.status(400).json({ error: 'Password must include at least one special character' });
    if (currentPassword === newPassword) return res.status(400).json({ error: 'New password must be different from current password' });
    const { data: user, error } = await supabaseAdmin.from('users').select('password_hash').eq('id', req.userId).single();
    if (error || !user) return res.status(404).json({ error: 'User not found' });
    const valid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!valid) return res.status(400).json({ error: 'Current password is incorrect' });
    const newHash = await bcrypt.hash(newPassword, 10);
    await supabaseAdmin.from('users').update({ password_hash: newHash, updated_at: new Date() }).eq('id', req.userId);
    res.json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    console.error('[change-password]', error.message);
    res.status(500).json({ error: 'Password change failed. Please try again.' });
  }
});

// ── OTP (Twilio Verify) ───────────────────────────────────────────────────────

const { parsePhoneNumberWithError } = require('libphonenumber-js');

function validatePhone(phoneInput, defaultCountry = 'GH') {
  if (!phoneInput || typeof phoneInput !== 'string' || !phoneInput.trim()) {
    return { valid: false, error: 'Phone number is required.' };
  }
  const cleaned = phoneInput.trim().replace(/[\s\-()]/g, '');
  try {
    const phoneNumber = parsePhoneNumberWithError(cleaned, defaultCountry || 'GH');
    if (!phoneNumber || !phoneNumber.isValid()) {
      const countryLabel = phoneNumber?.country || defaultCountry || 'selected country';
      return {
        valid: false,
        error: `Invalid phone number format or length for ${countryLabel}. Please check your phone number.`
      };
    }
    return {
      valid: true,
      e164: phoneNumber.number,
      country: phoneNumber.country,
      countryCallingCode: `+${phoneNumber.countryCallingCode}`
    };
  } catch (err) {
    return {
      valid: false,
      error: `Invalid phone number format, length, or country code. Please enter a valid number.`
    };
  }
}

const toE164 = (raw, defaultCountry = 'GH') => {
  const result = validatePhone(raw, defaultCountry);
  return result.valid ? result.e164 : null;
};

// Diagnostic endpoint — protected so only logged-in users can access
app.get('/api/auth/twilio-check', verifyToken, async (req, res) => {
  try {
    const sid = process.env.TWILIO_SID;
    const token = process.env.TWILIO_TOKEN;
    res.json({
      twilio_sid_set: !!sid,
      twilio_token_set: !!token,
    });
  } catch (e) {
    console.error('[GET /api/auth/twilio-check] error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── OTP helpers ──────────────────────────────────────────────────────────────
// Uses local generation + Supabase otp_codes table + plain Twilio SMS.
// Run this SQL in Supabase once if the table doesn't exist:
//   create table if not exists otp_codes (
//     id         uuid primary key default gen_random_uuid(),
//     phone      text not null,
//     code       text not null,
//     expires_at timestamptz not null,
//     used       boolean not null default false,
//     created_at timestamptz not null default now()
//   );

async function storeOtp(contact, otp) {
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const { error } = await supabaseAdmin
    .from('otp_codes')
    .insert({ phone: contact, code: otp, expires_at: expiresAt, used: false });
  if (error) throw new Error(`OTP store failed: ${error.message}`);
}

// Countries where Africa's Talking silently fails to deliver despite "success" response.
// These MUST bypass AT and go straight to Twilio.
const FORCE_TWILIO_PREFIXES = ['+92']; // Pakistan — add others here if the same issue is found

// ── Multi-channel OTP delivery: AT → Twilio SMS → Twilio WhatsApp ────────────
async function sendSmsOtp(phone, message) {
  const errs = [];

  // Check if this phone number should bypass AT and use only Twilio
  const forceTwilio = FORCE_TWILIO_PREFIXES.some(prefix => phone.startsWith(prefix));

  // ── Channel 1: Africa's Talking (best delivery for GH/NG/KE/UG/TZ) ─────────
  // Skipped for countries where AT silently swallows messages despite "success"
  if (atSms && !forceTwilio) {
    // AFRICASTALKING_SENDER_ID ("PRAQEN") is pending carrier approval — until it's
    // approved, sending with it gets silently dropped by the carrier even though AT's
    // API reports success. Default shortcode needs no approval and delivers immediately.
    // Re-add `{ from: process.env.AFRICASTALKING_SENDER_ID }` as the first attempt once approved.
    const atAttempts = [{}];
    let atDelivered = false;
    for (const extra of atAttempts) {
      try {
        const result = await atSms.send({ to: [phone], message, ...extra });
        const recip = result?.SMSMessageData?.Recipients?.[0];
        console.log(`[SMS] AT attempt (sender=${extra.from || 'default'}):`, JSON.stringify(recip));
        if (recip?.statusCode === 101 || (recip?.status || '').toLowerCase() === 'success') {
          console.log(`[SMS] ✅ Africa's Talking → ${phone} via ${extra.from || 'default shortcode'}`);
          atDelivered = true;
          break;
        }
        const atErr = recip?.status || JSON.stringify(result?.SMSMessageData);
        console.warn(`[SMS] AT non-success (sender=${extra.from || 'default'}): ${atErr}`);
        errs.push(`AT(${extra.from || 'default'}): ${atErr}`);
      } catch (atErr) {
        console.warn(`[SMS] AT error (sender=${extra.from || 'default'}): ${atErr.message}`);
        errs.push(`AT: ${atErr.message}`);
      }
    }
    if (atDelivered) return;
  } else {
    errs.push(forceTwilio ? 'AT: skipped (forced Twilio route)' : 'AT: not configured');
  }

  // ── Channel 2: Twilio SMS ────────────────────────────────────────────────────
  if (TWILIO_ENABLED && TWILIO_PHONE) {
    try {
      await getTwilioClient().messages.create({ body: message, from: TWILIO_PHONE, to: phone });
      const routeLabel = forceTwilio ? ' (forced route: PK)' : '';
      console.log(`[SMS] ✅ Twilio SMS → ${phone}${routeLabel}`);
      return;
    } catch (twilioErr) {
      console.warn(`[SMS] Twilio SMS failed (${twilioErr.code}): ${twilioErr.message}`);
      errs.push(`Twilio: ${twilioErr.message}`);
    }
  } else {
    errs.push('Twilio: not configured');
  }

  // ── Channel 3: Twilio WhatsApp (last resort — works if user has WhatsApp) ───
  if (TWILIO_ENABLED) {
    try {
      await getTwilioClient().messages.create({
        body: `*PRAQEN Verification* ⚡\n${message}`,
        from: TWILIO_WA_FROM,
        to: `whatsapp:${phone}`,
      });
      console.log(`[SMS] ✅ Twilio WhatsApp → ${phone}`);
      return;
    } catch (waErr) {
      console.warn(`[SMS] Twilio WhatsApp failed: ${waErr.message}`);
      errs.push(`WhatsApp: ${waErr.message}`);
    }
  }

  throw new Error(`All SMS channels failed — ${errs.join(' | ')}`);
}

async function checkOtp(contact, token) {
  // Check if any OTP was ever generated for this phone number
  const { data: anyOtp } = await supabaseAdmin
    .from('otp_codes')
    .select('id')
    .eq('phone', contact)
    .limit(1)
    .maybeSingle();

  if (!anyOtp) {
    return { valid: false, reason: 'no_otp_requested' };
  }

  const { data: latestActive } = await supabaseAdmin
    .from('otp_codes')
    .select('*')
    .eq('phone', contact)
    .eq('used', false)
    .gte('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!latestActive) {
    return { valid: false, reason: 'expired' };
  }

  if (latestActive.code !== token) {
    return { valid: false, reason: 'invalid_code' };
  }

  // mark used immediately so replay attacks fail
  await supabaseAdmin.from('otp_codes').update({ used: true }).eq('id', latestActive.id);
  return { valid: true, record: latestActive };
}

app.post('/api/auth/send-otp', otpLimiter, async (req, res) => {
  try {
    const { phone, country = 'GH', channel } = req.body;
    const ch = channel || 'sms';

    // Only phone (SMS/WhatsApp) is supported for phone verification
    if (ch === 'email') {
      return res.status(400).json({ error: 'Email verification is not supported for phone verification. Please use your phone number.' });
    }

    const valResult = validatePhone(phone, country);
    if (!valResult.valid) {
      return res.status(400).json({ error: valResult.error });
    }
    const contact = valResult.e164;

    const limit = checkPhoneRateLimit(contact);
    if (limit.blocked) return res.status(429).json({ error: limit.error });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const isDev = process.env.NODE_ENV !== 'production';

    storeOtp(contact, otp).catch(e => console.warn('[send-otp phone] DB store warn:', e.message));

    let smsSent = false;
    let smsError = null;
    try {
      await sendSmsOtp(contact, `${otp} is your PRAQEN verification code. Valid for 10 minutes. Don't share this with anyone.`);
      smsSent = true;
    } catch (smsErr) {
      smsError = smsErr.message;
      console.error('[send-otp sms] all channels failed:', smsErr.message);
    }

    recordPhoneRequest(contact);
    console.log(`[OTP send] sms to=${contact} sent=${smsSent} code=${otp}`);

    if (!smsSent) {
      return res.status(502).json({
        error: `SMS delivery failed for this number. ${isDev ? `(${smsError})` : 'Please contact support.'}`,
        devCode: isDev ? otp : undefined,
      });
    }

    return res.json({
      success: true,
      message: 'Code sent to your phone via SMS.',
      devCode: isDev ? otp : undefined,
    });
  } catch (error) {
    console.error('[OTP send error]', error);
    res.status(500).json({ error: 'Failed to send code. Please try again.' });
  }
});

app.post('/api/auth/send-phone-otp', otpLimiter, async (req, res) => {
  try {
    const { phone, country = 'GH', method } = req.body; // method: 'sms' | 'whatsapp'
    const deliveryMethod = (method === 'whatsapp') ? 'whatsapp' : 'sms';

    const valResult = validatePhone(phone, country);
    if (!valResult.valid) {
      return res.status(400).json({ error: valResult.error });
    }
    const contact = valResult.e164;

    const limit = checkPhoneRateLimit(contact);
    if (limit.blocked) return res.status(429).json({ error: limit.error });

    // Block only if this phone is already verified by an account — not if it's merely saved/unverified
    const { data: existing } = await supabaseAdmin
      .from('users').select('id')
      .eq('phone', contact)
      .eq('is_phone_verified', true)
      .maybeSingle();
    if (existing) return res.status(400).json({ error: 'This phone number is already verified by another account.' });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    storeOtp(contact, otp).catch(e => console.warn('[send-phone-otp] DB store warn:', e.message));

    const msgText = `${otp} is your PRAQEN verification code. Valid for 10 minutes. Don't share this with anyone.`;

    try {
      if (deliveryMethod === 'whatsapp') {
        // WhatsApp only — no SMS fallback
        if (!TWILIO_ENABLED) throw new Error('WhatsApp not configured');
        await getTwilioClient().messages.create({
          body: `*PRAQEN Verification* ⚡\n${msgText}`,
          from: TWILIO_WA_FROM,
          to: `whatsapp:${contact}`,
        });
        console.log(`[OTP send-phone] WhatsApp → ${contact}`);
      } else {
        // SMS only — no WhatsApp fallback
        const forceTwilio = FORCE_TWILIO_PREFIXES.some(p => contact.startsWith(p));
        let smsSent = false;

        if (atSms && !forceTwilio) {
          // Custom sender ID "PRAQEN" is pending carrier approval — see the matching
          // comment in sendSmsOtp() above. Default shortcode only until it's approved.
          const atAttempts = [{}];
          for (const extra of atAttempts) {
            try {
              const result = await atSms.send({ to: [contact], message: msgText, ...extra });
              const recip = result?.SMSMessageData?.Recipients?.[0];
              if (recip?.statusCode === 101 || (recip?.status || '').toLowerCase() === 'success') {
                console.log(`[OTP send-phone] SMS (AT) → ${contact}`);
                smsSent = true;
                break;
              }
            } catch (_) { }
          }
        }

        if (!smsSent && TWILIO_ENABLED && TWILIO_PHONE) {
          await getTwilioClient().messages.create({ body: msgText, from: TWILIO_PHONE, to: contact });
          console.log(`[OTP send-phone] SMS (Twilio) → ${contact}`);
          smsSent = true;
        }

        if (!smsSent) throw new Error('All SMS gateways failed');
      }
    } catch (deliveryErr) {
      console.error(`[OTP send-phone ${deliveryMethod} error]`, deliveryErr.message);
      recordPhoneRequest(contact);
      const altMethod = deliveryMethod === 'sms' ? 'WhatsApp' : 'SMS';
      return res.status(502).json({
        error: `${deliveryMethod === 'sms' ? 'SMS' : 'WhatsApp'} delivery failed. Please try ${altMethod} instead.`,
        suggestAlt: deliveryMethod === 'sms' ? 'whatsapp' : 'sms',
      });
    }

    recordPhoneRequest(contact);
    console.log(`[OTP send-phone] to=${contact} via=${deliveryMethod}`);
    res.json({ success: true, message: `Code sent via ${deliveryMethod === 'sms' ? 'SMS' : 'WhatsApp'}!` });
  } catch (error) {
    console.error('[OTP send-phone outer error]', error.message);
    res.status(500).json({ error: 'Failed to send code. Please try again.' });
  }
});


app.post('/api/auth/verify-otp', otpLimiter, async (req, res) => {
  try {
    const { phone, code, channel, contact, otp, country = 'GH', purpose } = req.body;
    const ch = channel || 'sms';

    // Only phone (SMS/WhatsApp) is supported
    if (ch === 'email') {
      return res.status(400).json({ error: 'Email verification is not supported. Please use your phone number.' });
    }

    const rawContact = phone || contact;
    const valResult = validatePhone(rawContact, country);
    if (!valResult.valid) {
      return res.status(400).json({ error: valResult.error });
    }
    const normalizedContact = valResult.e164;
    const token = (code || otp || '').trim();

    if (!normalizedContact || !token) {
      return res.status(400).json({ error: 'Phone number and code are required.' });
    }
    if (!/^\d{6}$/.test(token)) {
      return res.status(400).json({ error: 'OTP must be a 6-digit number.' });
    }

    console.log(`[OTP verify] channel=${ch} contact=${normalizedContact} token=${token}`);

    const limit = checkPhoneRateLimit(normalizedContact, true);
    if (limit.blocked) return res.status(429).json({ error: limit.error });

    const result = await checkOtp(normalizedContact, token);
    if (!result.valid) {
      recordPhoneFailure(normalizedContact);
      const errMsg = result.reason === 'invalid_code'
        ? 'Incorrect OTP. Please check the 6-digit code sent to your phone and try again.'
        : result.reason === 'no_otp_requested'
          ? 'No OTP requested for this phone number. Make sure your phone number matches the one used to request the code.'
          : 'Code expired, already used, or phone number mismatch. Tap "Resend code" to get a new code for this number.';
      return res.status(400).json({ error: errMsg });
    }

    // Update phone_verified flag
    try {
      await supabaseAdmin.from('users')
        .update({ phone_verified: true, phone: normalizedContact })
        .eq('phone', normalizedContact);
    } catch (_) { }

    // Advance welcome bonus: step 1 (registered) → step 2 (verified, $1 locked)
    setImmediate(async () => {
      try {
        const { data: bonusUser } = await supabaseAdmin
          .from('users')
          .select('id, bonus_step, bonus_expires_at')
          .eq('phone', normalizedContact)
          .single();
        if (bonusUser?.id && bonusUser.bonus_step === 1 &&
          bonusUser.bonus_expires_at && new Date(bonusUser.bonus_expires_at) > new Date()) {
          supabaseAdmin.from('users').update({ bonus_step: 2 }).eq('id', bonusUser.id).then(null, () => { });
        }
      } catch (_) { }
    });

    console.log(`[OTP verify] success for ${normalizedContact}`);

    // For a forgot-password OTP check, issue a one-time reset token so the
    // client can set a new password without re-proving phone ownership —
    // the OTP itself was already consumed by checkOtp() above.
    if (purpose === 'forgot-password') {
      const resetToken = crypto.randomBytes(24).toString('hex');
      passwordResetOtpTokens.set(resetToken, {
        contact: normalizedContact, method: 'phone', expires: Date.now() + 10 * 60 * 1000,
      });
      return res.json({ success: true, message: 'Phone number verified successfully!', resetToken });
    }

    return res.json({ success: true, message: 'Phone number verified successfully!' });
  } catch (error) {
    console.error('[OTP verify unexpected error]', error.message);
    res.status(500).json({ error: `Verification failed: ${error.message}` });
  }
});

// ── Action 2FA — high-risk operations (release BTC, send BTC) ────────────────
// Step 1: request a one-time code   → POST /api/auth/send-action-code
// Step 2: include the code in the protected request body (actionCode field)

app.post('/api/auth/send-action-code', otpLimiter, verifyToken, async (req, res) => {
  try {
    const { action } = req.body;
    if (!actionCodeService.VALID_ACTIONS.includes(action)) {
      return res.status(400).json({ error: 'Invalid action type.' });
    }

    const { data: user } = await supabaseAdmin
      .from('users').select('email, username, phone, is_phone_verified').eq('id', req.userId).single();
    if (!user?.email) {
      return res.status(400).json({ error: 'No email address on your account. Please add one in Settings.' });
    }

    const code = await actionCodeService.generate(req.userId, action);

    const actionLabels = { release_btc: 'Release Bitcoin', send_btc: 'Send Bitcoin', send_usdt: 'Send USDT', enable_2fa: 'Enable Two-Factor Authentication' };
    const label = actionLabels[action] || action;

    // Send over email AND SMS (when the user has a verified phone) in parallel — genuine
    // channel redundancy, not just a second email provider sharing the same failure modes
    // (spam filtering, a slow/misbehaving mail relay). SMS uses completely separate
    // infrastructure (Africa's Talking / Twilio) and typically lands in seconds, so for a
    // time-sensitive security code it's the faster path as often as it's the backup path.
    // Success only requires ONE channel to get through — waiting on both would make delivery
    // less reliable, not more.
    const hasPhone = !!(user.phone && user.is_phone_verified);
    const [emailResult, smsResult] = await Promise.allSettled([
      sendVerificationEmail(user.email, code, `PRAQEN Security Code — ${label}`),
      hasPhone
        ? sendSmsOtp(user.phone, `${code} is your PRAQEN security code for ${label}. Valid for 5 minutes. Don't share this with anyone.`)
        : Promise.reject(new Error('no verified phone on file')),
    ]);

    const emailOk = emailResult.status === 'fulfilled';
    const smsOk = smsResult.status === 'fulfilled';
    if (!emailOk) console.warn(`[2FA] Email delivery failed for ${user.email}:`, emailResult.reason?.message);
    if (hasPhone && !smsOk) console.warn(`[2FA] SMS delivery failed for ${user.phone}:`, smsResult.reason?.message);

    if (!emailOk && !smsOk) {
      throw new Error(emailResult.reason?.message || 'All delivery channels failed');
    }

    const via = emailOk && smsOk ? `${user.email} and your phone` : emailOk ? user.email : 'your phone via SMS';
    console.log(`[2FA] Action code sent (email:${emailOk} sms:${smsOk}) for action=${action} user=${req.userId.slice(0, 8)}`);
    res.json({ success: true, message: `Security code sent to ${via}` });
  } catch (err) {
    console.error('[2FA send-action-code]', err.message);
    res.status(500).json({ error: 'Failed to send security code. Please try again.' });
  }
});

// ── Email Verification ────────────────────────────────────────────────────────

app.post('/api/auth/send-verification', otpLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !email.includes('@')) return res.status(400).json({ error: 'Valid email is required' });
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 10 * 60 * 1000;

    // Store in memory AND database so server restarts don't lose the code
    verificationCodes.set(email, { code, expiresAt });
    await supabaseAdmin.from('users').update({
      verification_code: code,
      verification_code_expires: new Date(expiresAt).toISOString(),
    }).eq('email', email).throwOnError().then(null, () => { }); // non-fatal if user not created yet

    let emailSent = false;
    let emailError = null;
    try {
      await sendVerificationEmail(email, code);
      emailSent = true;
    } catch (emailErr) {
      emailError = emailErr.message;
      console.error('❌ Send verification error:', emailErr.message);
    }

    const isDev = process.env.NODE_ENV !== 'production';
    if (emailSent) {
      return res.json({ success: true, message: 'Verification code sent! Check your inbox (and spam/junk folder).', devCode: isDev ? code : undefined });
    }
    // Email failed but code is stored — return it in dev, show helpful message in prod
    return res.status(emailSent ? 200 : 500).json({
      success: false,
      error: 'We could not send the email right now. Please check your spam folder or try again in a moment.',
      devCode: isDev ? code : undefined, // dev only — never expose in production
    });
  } catch (error) {
    console.error('❌ Send verification error:', error);
    res.status(500).json({ error: 'Failed to send verification email. Please try again.' });
  }
});

app.post('/api/auth/verify-code', async (req, res) => {
  try {
    const { email, code, purpose } = req.body;
    if (!email || !code) return res.status(400).json({ error: 'Email and code are required' });
    const codeStr = String(code).trim();
    if (codeStr.length !== 6) return res.status(400).json({ error: 'Enter the full 6-digit code' });

    let verified = false;

    // ── Tier 1: in-memory map ─────────────────────────────────────────────
    const mem = verificationCodes.get(email);
    if (mem) {
      if (Date.now() > mem.expiresAt) {
        verificationCodes.delete(email);
      } else if (mem.code === codeStr) {
        verificationCodes.delete(email);
        verified = true;
      } else {
        return res.status(400).json({ error: 'Invalid verification code.' });
      }
    }

    // ── Tier 2: users table (verification_code column) ────────────────────
    if (!verified) {
      const { data: dbUser } = await supabaseAdmin
        .from('users')
        .select('verification_code, verification_code_expires, is_email_verified')
        .eq('email', email).single();

      if (!dbUser) return res.status(400).json({ error: 'Account not found.' });
      if (dbUser.is_email_verified) return res.json({ success: true, message: 'Already verified. Please login.' });

      if (dbUser.verification_code && String(dbUser.verification_code) === codeStr) {
        if (new Date() <= new Date(dbUser.verification_code_expires)) {
          verified = true;
        } else {
          return res.status(400).json({ error: 'Verification code expired. Request a new one.' });
        }
      }
    }

    // ── Tier 3: otp_codes table (used by send-otp endpoint) ───────────────
    if (!verified) {
      const dbOtp = await checkOtp(email, codeStr);
      if (dbOtp) {
        verified = true;
      }
    }

    if (!verified) {
      return res.status(400).json({ error: 'Invalid or expired code. Request a new one.' });
    }

    // Mark user verified and clear the stored code
    await supabaseAdmin
      .from('users')
      .update({ is_email_verified: true, verification_code: null, verification_code_expires: null })
      .eq('email', email);

    const { data: user } = await supabaseAdmin.from('users').select('*').eq('email', email).single();

    // For a forgot-password code check, issue a one-time reset token instead
    // of a login session — the client still needs to submit a new password.
    if (purpose === 'forgot-password') {
      if (!user) return res.status(400).json({ error: 'Account not found.' });
      const resetToken = crypto.randomBytes(24).toString('hex');
      passwordResetOtpTokens.set(resetToken, {
        contact: email, method: 'email', expires: Date.now() + 10 * 60 * 1000,
      });
      return res.json({ success: true, message: 'Code verified!', resetToken });
    }

    const token = user ? jwt.sign({ userId: user.id, email }, JWT_SECRET, { expiresIn: '7d' }) : null;

    res.json({
      success: true,
      message: 'Email verified successfully!',
      token,
      user: user ? {
        id: user.id, email: user.email, username: user.username, full_name: user.full_name,
        average_rating: user.average_rating || 0, total_trades: user.total_trades || 0,
        avatar_url: user.avatar_url || null, is_admin: user.is_admin || false,
        is_moderator: user.is_moderator || false, referral_code: user.referral_code || null,
      } : null,
    });
  } catch (error) {
    console.error('Verify-code error:', error);
    res.status(500).json({ error: 'Verification failed' });
  }
});

// Aliases so both naming conventions work
app.post('/api/auth/send-verification-email', (req, res, next) => {
  req.url = '/api/auth/send-verification';
  app._router.handle(req, res, next);
});
app.post('/api/auth/verify-email', (req, res, next) => {
  req.url = '/api/auth/verify-code';
  app._router.handle(req, res, next);
});

// ============================================================
// AUTHENTICATED VERIFICATION ENDPOINTS
// Called from Profile page after user is logged in
// ============================================================

// POST /api/users/resend-verification — send email verification code to logged-in user
// ── Lightweight 2FA toggle endpoint — uses existing OTP send/verify flow ──────

// PATCH /api/users/toggle-2fa — set two_factor_enabled (requires verfied OTP beforehand)
app.patch('/api/users/toggle-2fa', verifyToken, async (req, res) => {
  try {
    const { two_factor_enabled, password } = req.body;

    if (two_factor_enabled === true) {
      const method = req.body.two_factor_method || 'email';
      if (!['email', 'sms', 'whatsapp', 'totp'].includes(method)) {
        return res.status(400).json({ error: 'Invalid 2FA method. Choose email, sms, whatsapp, or totp.' });
      }

      // For email/sms/whatsapp: verify the user has the required contact info
      if (method === 'email') {
        const { data: user } = await supabaseAdmin
          .from('users').select('is_email_verified, email_verified').eq('id', req.userId).single();
        if (!user) return res.status(404).json({ error: 'User not found' });
        const emailOk = !!(user.is_email_verified || user.email_verified);
        if (!emailOk) return res.status(400).json({ error: 'Verify your email address first in Settings → Verification' });
      }

      if (method === 'sms' || method === 'whatsapp') {
        const { data: user } = await supabaseAdmin
          .from('users').select('phone, is_phone_verified, phone_verified').eq('id', req.userId).single();
        if (!user) return res.status(404).json({ error: 'User not found' });
        const phoneOk = !!(user.phone && (user.is_phone_verified || user.phone_verified));
        if (!phoneOk) return res.status(400).json({ error: 'Verify your phone number first in Settings → Verification' });
      }

      // For email/sms/whatsapp: require the one-time code sent via /api/auth/send-action-code
      // (action=enable_2fa) so activation actually proves the user controls that inbox/phone.
      if (method === 'email' || method === 'sms' || method === 'whatsapp') {
        const { actionCode } = req.body;
        if (!actionCode) return res.status(400).json({ error: 'Enter the security code sent to you to activate 2FA.' });
        const check = await actionCodeService.verify(req.userId, 'enable_2fa', actionCode);
        if (!check.valid) return res.status(400).json({ error: check.error });
      }

      // For TOTP: must have a confirmed secret (check via /totp/confirm which sets two_factor_method)
      // The TOTP flow sets both two_factor_enabled and two_factor_method via /totp/confirm, so this
      // toggle for TOTP should only reset the method if already enabled

      const { error: enableError } = await supabaseAdmin.from('users')
        .update({ two_factor_enabled: true, two_factor_method: method, updated_at: new Date() })
        .eq('id', req.userId);
      console.log(`[2FA] Enabled via ${method} for user ${req.userId.slice(0, 8)}`);
      if (enableError) {
        console.error('[2FA-toggle] DB update failed:', enableError.message);
        return res.status(500).json({ error: 'Failed to enable 2FA. Database error: ' + enableError.message });
      }
      console.log(`[2FA] Enabled via ${method} for user ${req.userId.slice(0, 8)}`);
      return res.json({ success: true, message: `2FA enabled via ${method}!` });

    } else if (two_factor_enabled === false) {
      // Disabling: require current password
      if (!password) return res.status(400).json({ error: 'Current password is required to disable 2FA' });
      const { data: user } = await supabaseAdmin
        .from('users').select('password_hash').eq('id', req.userId).single();
      if (!user) return res.status(404).json({ error: 'User not found' });
      const valid = await bcrypt.compare(password, user.password_hash);
      if (!valid) return res.status(400).json({ error: 'Current password is incorrect' });

      const { error: disableError } = await supabaseAdmin.from('users')
        .update({ two_factor_enabled: false, two_factor_method: null, updated_at: new Date() })
        .eq('id', req.userId);
      console.log(`[2FA] Disabled for user ${req.userId.slice(0, 8)}`);
      if (disableError) {
        console.error('[2FA-toggle] DB update failed:', disableError.message);
        return res.status(500).json({ error: 'Failed to disable 2FA. Database error: ' + disableError.message });
      }
      console.log(`[2FA] Disabled for user ${req.userId.slice(0, 8)}`);
      return res.json({ success: true, message: '2FA disabled successfully!' });

    } else {
      return res.status(400).json({ error: 'two_factor_enabled must be true or false' });
    }
  } catch (error) {
    console.error('[2FA-toggle]', error.message);
    res.status(500).json({ error: 'Failed to update 2FA setting. Please try again.' });
  }
});

// ── TOTP Authenticator App setup ──────────────────────────────────────────────
// POST /api/users/2fa/totp/setup — generate secret + QR code URL (does NOT enable 2FA yet)
app.post('/api/users/2fa/totp/setup', verifyToken, async (req, res) => {
  try {
    // Check current 2FA state
    const { data: user, error: dbErr } = await supabaseAdmin
      .from('users').select('two_factor_enabled, totp_secret, email').eq('id', req.userId).single();

    // Handle missing database columns gracefully
    if (dbErr && dbErr.message && dbErr.message.includes('does not exist')) {
      console.error('[TOTP-setup] DB column missing — run migrations:', dbErr.message);
      return res.status(500).json({ error: 'TOTP database setup incomplete. Please run the database migration (add_2fa_columns.sql + add_totp_secret_column.sql) in Supabase SQL Editor.' });
    }
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.two_factor_enabled) {
      return res.status(400).json({ error: '2FA is already enabled. Disable it first to reconfigure.' });
    }

    // Include user email in the label so authenticator apps show a distinguishable entry
    const label = user.email ? `PRAQEN (${user.email})` : 'PRAQEN';
    const secret = speakeasy.generateSecret({ name: label, issuer: 'PRAQEN' });

    // Store secret temporarily (not yet confirmed, but we overwrite any old one)
    await supabaseAdmin.from('users')
      .update({ totp_secret: secret.base32, updated_at: new Date() })
      .eq('id', req.userId);

    console.log(`[TOTP] Setup initiated for user ${req.userId.slice(0, 8)}`);
    res.json({
      success: true,
      secret: secret.base32,
      otpauth_url: secret.otpauth_url,
    });
  } catch (error) {
    console.error('[TOTP-setup]', error.message);
    // Check for column-not-found error specifically
    if (error.message && error.message.includes('column') && error.message.includes('does not exist')) {
      return res.status(500).json({ error: 'TOTP database setup incomplete. Run the database migration in Supabase SQL Editor.' });
    }
    res.status(500).json({ error: 'Failed to generate TOTP secret. Please try again.' });
  }
});

// POST /api/users/2fa/totp/confirm — verify the code from authenticator app and enable 2FA
app.post('/api/users/2fa/totp/confirm', verifyToken, async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: 'Verification code is required' });

    const { data: user, error: dbErr } = await supabaseAdmin
      .from('users').select('totp_secret').eq('id', req.userId).single();

    // Handle missing database columns gracefully
    if (dbErr && dbErr.message && dbErr.message.includes('does not exist')) {
      console.error('[TOTP-confirm] DB column missing:', dbErr.message);
      return res.status(500).json({ error: 'TOTP database setup incomplete. Please run the database migration in Supabase SQL Editor.' });
    }
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!user.totp_secret) {
      return res.status(400).json({ error: 'No TOTP secret found. Call /setup first.' });
    }

    const verified = speakeasy.totp.verify({
      secret: user.totp_secret,
      encoding: 'base32',
      token: String(code).trim(),
      window: 1, // ±1 step (30s) tolerance = 90s window
    });

    if (!verified) {
      return res.status(400).json({ error: 'Invalid code. Make sure your authenticator app shows the correct code.' });
    }

    await supabaseAdmin.from('users')
      .update({ two_factor_enabled: true, two_factor_method: 'totp', updated_at: new Date() })
      .eq('id', req.userId);

    console.log(`[TOTP] Confirmed and enabled for user ${req.userId.slice(0, 8)}`);
    res.json({ success: true, message: 'Authenticator app 2FA enabled successfully!' });
  } catch (error) {
    console.error('[TOTP-confirm]', error.message);
    res.status(500).json({ error: 'Failed to verify TOTP code. Please try again.' });
  }
});

app.post('/api/users/resend-verification', verifyToken, async (req, res) => {
  try {
    const { data: user } = await supabaseAdmin
      .from('users').select('email, is_email_verified').eq('id', req.userId).single();
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.is_email_verified) return res.json({ success: true, message: 'Email already verified' });
    if (!user.email) return res.status(400).json({ error: 'No email address on your account.' });

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 10 * 60 * 1000;

    // Store in memory and DB before sending
    verificationCodes.set(user.email, { code, expiresAt, userId: req.userId });
    await supabaseAdmin.from('users').update({
      verification_code: code,
      verification_code_expires: new Date(expiresAt).toISOString(),
    }).eq('id', req.userId);

    let emailSent = false;
    try {
      await sendVerificationEmail(user.email, code);
      emailSent = true;
    } catch (emailErr) {
      console.error('[resend-verification] email failed:', emailErr.message);
    }

    const isDev = process.env.NODE_ENV !== 'production';
    console.log(`[resend-verification] Code for ${user.email}: ${code} | sent=${emailSent}`);

    if (emailSent) {
      return res.json({ success: true, message: 'Code sent! Check your inbox and spam/junk folder.', devCode: isDev ? code : undefined });
    }
    // Code stored in DB — user can still verify, and we show code in dev
    return res.json({
      success: true,
      message: 'Email delivery had an issue. If you don\'t see an email within 2 minutes, check your spam folder and try again.',
      devCode: isDev ? code : undefined,
      _hint: isDev ? 'Dev mode: use devCode above to bypass email' : undefined,
    });
  } catch (err) {
    console.error('[resend-verification]', err.message);
    res.status(500).json({ error: 'Could not send verification email. Please try again.' });
  }
});

// POST /api/users/verify-email-code — verify code entered from profile
app.post('/api/users/verify-email-code', verifyToken, otpLimiter, async (req, res) => {
  try {
    const { code } = req.body;
    if (!code || String(code).length !== 6) return res.status(400).json({ error: 'Enter the full 6-digit code' });

    const { data: user } = await supabaseAdmin
      .from('users')
      .select('email, verification_code, verification_code_expires, is_email_verified')
      .eq('id', req.userId).single();

    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.is_email_verified) return res.json({ success: true, message: 'Already verified' });

    // In-memory check first (fast path)
    const mem = verificationCodes.get(user.email);
    if (mem) {
      if (Date.now() > mem.expiresAt) {
        verificationCodes.delete(user.email);
        return res.status(400).json({ error: 'Code expired. Request a new one.' });
      }
      if (mem.code !== String(code)) return res.status(400).json({ error: 'Invalid code. Check and try again.' });
      verificationCodes.delete(user.email);
    } else {
      // DB fallback (handles server restarts)
      if (!user.verification_code) return res.status(400).json({ error: 'No code found. Request a new one.' });
      if (new Date() > new Date(user.verification_code_expires)) return res.status(400).json({ error: 'Code expired. Request a new one.' });
      if (String(user.verification_code) !== String(code)) return res.status(400).json({ error: 'Invalid code. Check and try again.' });
    }

    await supabaseAdmin.from('users').update({
      is_email_verified: true,
      email_verified: true,
      verification_code: null,
      verification_code_expires: null,
    }).eq('id', req.userId);

    res.json({ success: true, message: 'Email verified successfully!' });
  } catch (err) {
    console.error('[verify-email-code]', err.message);
    res.status(500).json({ error: 'Verification failed. Try again.' });
  }
});

// POST /api/users/send-phone-otp
// method: 'email'     -> 6-digit code sent to the user's registered email
// method: 'whatsapp'  -> 6-digit code sent via Twilio WhatsApp
// Phone is NOT saved here — it is saved only when the user successfully verifies (verify-phone-otp).
app.post('/api/users/send-phone-otp', otpLimiter, verifyToken, async (req, res) => {
  try {
    const { phone, country = 'GH', method = 'sms' } = req.body;
    if (!phone) return res.status(400).json({ error: 'Phone number required' });
    if (!['email', 'sms', 'whatsapp'].includes(method)) {
      return res.status(400).json({ error: 'Delivery method must be "email", "sms", or "whatsapp"' });
    }

    const valResult = validatePhone(phone, country);
    if (!valResult.valid) {
      return res.status(400).json({ error: valResult.error });
    }
    const e164 = valResult.e164;

    const limit = checkPhoneRateLimit(e164);
    if (limit.blocked) return res.status(429).json({ error: limit.error });

    // Block only if THIS number is VERIFIED on another account (unverified is OK)
    const { data: claimedByOther } = await supabaseAdmin.from('users')
      .select('id').eq('phone', e164).eq('is_phone_verified', true).neq('id', req.userId).maybeSingle();
    if (claimedByOther) {
      return res.status(400).json({ error: 'This phone number is already verified on another account.' });
    }

    // Generate OTP and store in memory (primary) — DB store is best-effort
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresMs = Date.now() + 10 * 60 * 1000;
    otpStore.set(e164, { otp, expires: expiresMs });

    // Best-effort DB backup so OTP survives a server restart
    supabaseAdmin.from('otp_codes').insert({
      phone: e164, code: otp, expires_at: new Date(expiresMs).toISOString(), used: false,
    }).then(() => { }).catch(dbErr => console.warn('[send-phone-otp] DB backup warn:', dbErr.message));

    recordPhoneRequest(e164);
    const isDev = process.env.NODE_ENV !== 'production';
    console.log(`[send-phone-otp] method=${method} e164=${e164}`);

    // ── Email ──────────────────────────────────────────────────────────────────
    if (method === 'email') {
      const { data: userRow, error: userErr } = await supabaseAdmin
        .from('users').select('email').eq('id', req.userId).single();
      if (userErr) {
        console.error('[send-phone-otp] DB lookup failed:', userErr.message);
        return res.status(500).json({ error: 'Could not look up your account. Please try again.' });
      }
      if (!userRow?.email) {
        return res.status(400).json({ error: 'No email address found on your account.' });
      }
      try {
        await sendVerificationEmail(userRow.email, otp);
        console.log(`[send-phone-otp] Email OTP → ${userRow.email}`);
        return res.json({
          success: true,
          message: `Verification code sent to ${userRow.email}`,
          devCode: isDev ? otp : undefined,
        });
      } catch (emailErr) {
        console.error('[send-phone-otp] Email send error:', emailErr.message);
        return res.status(500).json({
          error: 'Email delivery failed. Check your spam folder or try the WhatsApp option.',
          devCode: isDev ? otp : undefined,
        });
      }
    }

    // ── SMS ────────────────────────────────────────────────────────────────────
    if (method === 'sms') {
      // ── Primary: Twilio Verify (best international OTP delivery) ────────────
      if (TWILIO_ENABLED && twilioVerifySid) {
        try {
          await getTwilioClient().verify.v2.services(twilioVerifySid).verifications.create({ to: e164, channel: 'sms' });
          // Twilio manages the OTP code — mark this number as pending Twilio Verify
          twilioVerifyPending.set(e164, { expires: Date.now() + 10 * 60 * 1000 });
          console.log(`[send-phone-otp] ✅ Twilio Verify SMS → ${e164}`);
          return res.json({ success: true, message: `Verification code sent via SMS to ${e164}` });
        } catch (verifyErr) {
          console.warn(`[send-phone-otp] Twilio Verify failed (${verifyErr.code}): ${verifyErr.message} — falling back`);
        }
      }
      // ── Fallback: Africa's Talking / Twilio direct ────────────────────────
      try {
        await sendSmsOtp(e164, `${otp} is your PRAQEN verification code. Valid for 10 minutes. Don't share this with anyone.`);
        console.log(`[send-phone-otp] SMS OTP (fallback) → ${e164}`);
        return res.json({
          success: true,
          message: `Code sent via SMS to ${e164}`,
          devCode: isDev ? otp : undefined,
        });
      } catch (smsErr) {
        console.error('[send-phone-otp] SMS error:', smsErr.message);
        return res.status(502).json({
          error: 'SMS delivery failed. Please try the WhatsApp option instead.',
          suggestAlt: 'whatsapp',
          devCode: isDev ? otp : undefined,
        });
      }
    }

    // ── WhatsApp ───────────────────────────────────────────────────────────────
    if (method === 'whatsapp') {
      if (!TWILIO_ENABLED) {
        return res.status(502).json({
          error: 'WhatsApp is not configured on this server. Please try the SMS option.',
          suggestAlt: 'sms',
          devCode: isDev ? otp : undefined,
        });
      }
      // ── Primary: Twilio Verify WhatsApp (more reliable than sandbox) ────────
      if (twilioVerifySid) {
        try {
          await getTwilioClient().verify.v2.services(twilioVerifySid).verifications.create({ to: e164, channel: 'whatsapp' });
          twilioVerifyPending.set(e164, { expires: Date.now() + 10 * 60 * 1000 });
          console.log(`[send-phone-otp] ✅ Twilio Verify WhatsApp → ${e164}`);
          return res.json({ success: true, message: 'Verification code sent via WhatsApp' });
        } catch (verifyWaErr) {
          console.warn(`[send-phone-otp] Twilio Verify WhatsApp failed (${verifyWaErr.code}): ${verifyWaErr.message} — falling back to sandbox`);
        }
      }
      // ── Fallback: Twilio WhatsApp sandbox ─────────────────────────────────
      try {
        await getTwilioClient().messages.create({
          body: `*PRAQEN Phone Verification*\n\nYour code: *${otp}*\n\nValid 10 minutes. Never share this code.`,
          from: TWILIO_WA_FROM,
          to: `whatsapp:${e164}`,
        });
        console.log(`[send-phone-otp] WhatsApp OTP (sandbox) → ${e164}`);
        return res.json({
          success: true,
          message: 'Code sent via WhatsApp',
          devCode: isDev ? otp : undefined,
        });
      } catch (waErr) {
        console.error('[send-phone-otp] WhatsApp error:', waErr.message);
        return res.status(502).json({
          error: 'WhatsApp delivery failed. Please try the SMS option instead.',
          suggestAlt: 'sms',
          devCode: isDev ? otp : undefined,
        });
      }
    }

  } catch (err) {
    console.error('[send-phone-otp] OUTER ERROR:', err.message, err.stack);
    const methodUsed = req.body?.method || 'sms';
    const alt = methodUsed === 'sms' ? 'whatsapp' : 'sms';
    res.status(500).json({ error: `OTP send failed: ${err.message}`, suggestAlt: alt });
  }
});

// POST /api/users/submit-phone — save phone for manual admin review (no OTP)
// User submits their number → saved to users.phone + phone_verification_requests → admin approves → user notified.
app.post('/api/users/submit-phone', verifyToken, async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: 'Phone number required' });

    // Clean the number — strip spaces, dashes, parentheses
    let e164 = phone.trim().replace(/[\s\-()]/g, '');
    if (!e164.startsWith('+')) {
      return res.status(400).json({ error: 'Please include your country code. Use international format, e.g. +233XXXXXXXXX for Ghana, +92XXXXXXXXXX for Pakistan, or +234XXXXXXXXXX for Nigeria.' });
    }

    // Check if THIS user already has a phone saved — once submitted, it cannot be changed
    const { data: currentUser, error: fetchErr } = await supabaseAdmin
      .from('users').select('id, phone, is_phone_verified').eq('id', req.userId).maybeSingle();
    if (fetchErr) {
      console.error('[submit-phone] fetch user failed:', fetchErr.message);
      return res.status(500).json({ error: 'Could not verify account. Please try again.' });
    }
    if (currentUser?.phone) {
      if (currentUser.phone === e164) {
        // Idempotent: same number already saved — ensure request row exists and return success
        await supabaseAdmin.from('phone_verification_requests').upsert(
          { user_id: req.userId, phone: e164, status: currentUser.is_phone_verified ? 'approved' : 'pending' },
          { onConflict: 'user_id', ignoreDuplicates: true }
        ).then(null, () => { });
        return res.json({ success: true });
      }
      return res.status(400).json({ error: 'A phone number has already been submitted for your account. It cannot be changed while under review.' });
    }

    // One phone = one account — block if number belongs to someone else
    const { data: existing } = await supabaseAdmin
      .from('users').select('id').eq('phone', e164).neq('id', req.userId).maybeSingle();
    if (existing) return res.status(400).json({ error: 'This number is already registered to another account.' });

    // ── Step 1: Save phone to users table ───────────────────────────────────
    const { data: savedUser, error: updateErr } = await supabaseAdmin
      .from('users')
      .update({ phone: e164, updated_at: new Date().toISOString() })
      .eq('id', req.userId)
      .select('id, phone')
      .single();

    if (updateErr) {
      console.error('[submit-phone] users.update failed:', updateErr.message, '| code:', updateErr.code);
      return res.status(400).json({ error: 'Could not save phone number: ' + updateErr.message });
    }
    if (!savedUser?.phone) {
      console.error('[submit-phone] update returned no row — user may not exist:', req.userId);
      return res.status(400).json({ error: 'Could not save phone number. Please try again.' });
    }

    // ── Step 2: Track in phone_verification_requests ──────────────────────
    const { error: reqErr } = await supabaseAdmin
      .from('phone_verification_requests')
      .upsert(
        { user_id: req.userId, phone: e164, status: 'pending', submitted_at: new Date().toISOString() },
        { onConflict: 'user_id', ignoreDuplicates: false }
      );
    if (reqErr) {
      // Table may not exist yet — log but don't fail the request
      console.warn('[submit-phone] phone_verification_requests upsert failed (table may not exist yet):', reqErr.message);
    }

    // ── Step 3: In-app notification ───────────────────────────────────────
    try {
      await createNotification(
        req.userId, 'kyc',
        '📱 Phone Number Received',
        `We've received your number (${e164}) and it's now under review. You'll be notified once it's approved — usually within 24 hours.`,
        '/settings?tab=verification'
      );
    } catch (_) { }

    console.log(`[submit-phone] ✅ ${req.userId.slice(0, 8)} submitted ${e164} — saved to users.phone and phone_verification_requests`);
    res.json({ success: true, phone: savedUser.phone });
  } catch (err) {
    console.error('[submit-phone] unexpected error:', err.message);
    res.status(500).json({ error: 'Could not save phone number. Please try again.' });
  }
});

// POST /api/users/verify-phone-otp — verify phone OTP and mark phone verified
app.post('/api/users/verify-phone-otp', verifyToken, async (req, res) => {
  try {
    const { phone, otp, country = 'GH' } = req.body;
    if (!phone || !otp) return res.status(400).json({ error: 'Phone and OTP required' });

    const valResult = validatePhone(phone, country);
    if (!valResult.valid) {
      return res.status(400).json({ error: valResult.error });
    }
    const e164 = valResult.e164;
    const code = String(otp).trim();

    if (code.length !== 6) return res.status(400).json({ error: 'Enter the full 6-digit code' });

    // Only block if the account is locked due to too many failed attempts.
    // Do NOT apply the send-cooldown here — the user just received an OTP and
    // needs to verify it immediately, often within the same 60-second window.
    const limRec = phoneRateLimits.get(e164);
    if (limRec?.lockedUntil && Date.now() < limRec.lockedUntil) {
      const mins = Math.ceil((limRec.lockedUntil - Date.now()) / 60000);
      return res.status(429).json({ error: `Too many failed attempts. Try again in ${mins} minute(s).` });
    }

    let verified = false;

    // ── Path 1: Twilio Verify (used when SMS/WhatsApp sent via Twilio Verify) ─
    const tvPending = twilioVerifyPending.get(e164);
    if (tvPending && TWILIO_ENABLED && twilioVerifySid) {
      try {
        const check = await getTwilioClient().verify.v2.services(twilioVerifySid)
          .verificationChecks.create({ to: e164, code });
        if (check.status === 'approved') {
          twilioVerifyPending.delete(e164);
          verified = true;
          console.log(`[verify-phone-otp] ✅ Twilio Verify approved for ${e164}`);
        } else {
          console.warn(`[verify-phone-otp] Twilio Verify status: ${check.status} for ${e164}`);
        }
      } catch (tvErr) {
        console.warn(`[verify-phone-otp] Twilio Verify check error: ${tvErr.message} — falling back to stored OTP`);
      }
    }

    // ── Path 2: In-memory OTP (fast path, used when sent via AT/direct SMS) ───
    if (!verified) {
      const stored = otpStore.get(e164);
      if (stored && String(stored.otp) === code && Date.now() <= stored.expires) {
        otpStore.delete(e164);
        verified = true;
      }
    }

    // ── Path 3: DB fallback (handles server restarts) ─────────────────────────
    if (!verified) {
      const dbRecord = await checkOtp(e164, code);
      if (dbRecord) verified = true;
    }

    if (!verified) {
      recordPhoneFailure(e164);
      return res.status(400).json({ error: 'Invalid or expired code. Tap "Resend" to get a new one.' });
    }

    await supabaseAdmin.from('users').update({
      phone: e164,
      is_phone_verified: true,
      phone_verified: true,
      updated_at: new Date().toISOString(),
    }).eq('id', req.userId);

    res.json({ success: true, message: 'Phone number verified!' });
  } catch (err) {
    console.error('[verify-phone-otp]', err.message);
    res.status(500).json({ error: 'Verification failed. Try again.' });
  }
});

// Interim timeout guard shared by the KYC and p2p-migration Storage uploads below. The
// installed @supabase/storage-js's upload() (uploadOrUpdate() in StorageFileApi.ts) only
// accepts FileOptions, which has no `signal` field — AbortSignal is a different interface
// used only by download()/list(). Verified by reading the installed package source. That
// means the outbound request to Supabase Storage CANNOT actually be cancelled by this SDK
// version. This only races the upload against a timer so the request responds to the client
// with a clean error instead of hanging until Render's own proxy kills the connection and
// returns a raw 544 — it does NOT cancel or free the underlying upload attempt itself.
const withUploadTimeout = (p, ms, label) => Promise.race([
  p,
  new Promise(resolve => setTimeout(() => resolve({ data: null, error: { message: `${label} upload timed out after ${ms}ms` } }), ms)),
]);

// POST /api/kyc/upload — receive base64 ID front + back, store in Supabase Storage, set status pending
app.post('/api/kyc/upload', express.json({ limit: '25mb' }), verifyToken, async (req, res) => {
  try {
    const { idImage, idImageBack, idType = 'national_id' } = req.body;
    if (!idImage) return res.status(400).json({ error: 'Front of ID card is required' });
    if (!idImageBack) return res.status(400).json({ error: 'Back of ID card is required — please upload both front and back' });

    const userId = req.userId;
    const timestamp = Date.now();

    // Strip base64 prefix and convert to buffer
    const toBuffer = (b64) => Buffer.from(b64.replace(/^data:image\/\w+;base64,/, ''), 'base64');

    let idUrl = null;
    let idBackUrl = null;

    // Try Supabase Storage upload (bucket: kyc-documents) — see withUploadTimeout() above
    // for why this can only fail-fast on the response, not actually cancel the upload.
    try {
      const { error: idErr } = await withUploadTimeout(
        supabaseAdmin.storage
          .from('kyc-documents')
          .upload(`${userId}/id_front_${timestamp}.jpg`, toBuffer(idImage), { contentType: 'image/jpeg', upsert: true }),
        25000, 'ID front'
      );

      const { error: idBackErr } = await withUploadTimeout(
        supabaseAdmin.storage
          .from('kyc-documents')
          .upload(`${userId}/id_back_${timestamp}.jpg`, toBuffer(idImageBack), { contentType: 'image/jpeg', upsert: true }),
        25000, 'ID back'
      );

      if (!idErr) {
        const { data: { publicUrl } } = supabaseAdmin.storage.from('kyc-documents').getPublicUrl(`${userId}/id_front_${timestamp}.jpg`);
        idUrl = publicUrl;
      }
      if (!idBackErr) {
        const { data: { publicUrl } } = supabaseAdmin.storage.from('kyc-documents').getPublicUrl(`${userId}/id_back_${timestamp}.jpg`);
        idBackUrl = publicUrl;
      }
    } catch (storageErr) {
      console.warn('[kyc/upload] Storage upload failed (bucket may not exist):', storageErr.message);
    }

    // Always mark user as pending regardless of storage success
    // DB columns: id_front_url, id_back_url, id_type, selfie_url
    const { error: dbErr } = await supabaseAdmin.from('users').update({
      kyc_status: 'pending',
      id_type: idType,
      kyc_submitted_at: new Date().toISOString(),
      id_front_url: idUrl,
      id_back_url: idBackUrl,
      selfie_url: null,
      updated_at: new Date().toISOString(),
    }).eq('id', userId);
    if (dbErr) {
      console.error('[kyc/upload] DB update failed:', dbErr.message);
      const { error: minErr } = await supabaseAdmin.from('users').update({
        kyc_status: 'pending',
        updated_at: new Date().toISOString(),
      }).eq('id', userId);
      if (minErr) {
        console.error('[kyc/upload] Minimal DB update also failed:', minErr.message);
        return res.status(500).json({ error: 'Database not ready. Please contact support.' });
      }
    }

    // In-app notification — must NOT block the success response if it fails
    try {
      await supabaseAdmin.from('notifications').insert({
        user_id: userId,
        type: 'kyc',
        title: '📋 KYC Submitted — Under Review',
        message: 'Your identity documents have been submitted. We will review within 24 hours and update your profile.',
        action: '/profile',
        is_read: false,
        created_at: new Date().toISOString(),
      });
    } catch (notifErr) {
      console.warn('[kyc/upload] Notification insert failed (non-fatal):', notifErr.message);
    }

    console.log(`[kyc/upload] KYC submitted by user ${userId}`);
    res.json({ success: true, message: 'Documents submitted! We will review within 24 hours.' });
  } catch (err) {
    console.error('[kyc/upload]', err.message);
    res.status(500).json({ error: 'Upload failed. Please try again.' });
  }
});

// GET /api/kyc/status — returns current KYC status for the logged-in user
app.get('/api/kyc/status', verifyToken, async (req, res) => {
  try {
    let { data, error } = await supabaseAdmin.from('users')
      .select('kyc_status, id_type, kyc_submitted_at, id_front_url, id_back_url, kyc_rejection_reason, is_id_verified')
      .eq('id', req.userId).single();
    if (error) {
      const fallback = await supabaseAdmin.from('users')
        .select('is_id_verified, kyc_status')
        .eq('id', req.userId).single();
      if (fallback.error) return res.status(500).json({ error: fallback.error.message });
      data = fallback.data;
    }
    res.json({
      kyc_status: data?.kyc_status || null,
      kyc_id_type: data?.id_type || null,
      kyc_submitted_at: data?.kyc_submitted_at || null,
      kyc_id_url: data?.id_front_url || null,
      kyc_id_back_url: data?.id_back_url || null,
      kyc_rejection_reason: data?.kyc_rejection_reason || null,
      is_id_verified: data?.is_id_verified || false,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── P2P Migration (Noones / Binance P2P / other) — pre-registration lead capture ──
const MIGRATION_PLATFORM_LABELS = { noones: 'Noones', binance: 'Binance P2P', other: 'P2P' };
// Shown as a welcome step on /register before a user creates an account. No auth
// required (they don't have an account yet). Admin reviews the screenshot by hand
// and approves/rejects manually — see /api/admin/p2p-migration/* below.
app.post('/api/p2p-migration/submit', authLimiter, async (req, res) => {
  try {
    const { email, platform, screenshot } = req.body;
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'A valid email address is required' });
    }
    if (!screenshot) {
      return res.status(400).json({ error: 'Please upload a screenshot of your P2P profile' });
    }
    const normalizedPlatform = ['noones', 'binance'].includes(platform) ? platform : 'other';
    const normalizedEmail = email.toLowerCase().trim();

    let screenshotUrl = null;
    try {
      const buffer = Buffer.from(screenshot.replace(/^data:image\/\w+;base64,/, ''), 'base64');
      const path = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`;
      const { error: uploadErr } = await withUploadTimeout(
        supabaseAdmin.storage
          .from('p2p-migration')
          .upload(path, buffer, { contentType: 'image/jpeg', upsert: true }),
        25000, 'Screenshot'
      );
      if (!uploadErr) {
        const { data: { publicUrl } } = supabaseAdmin.storage.from('p2p-migration').getPublicUrl(path);
        screenshotUrl = publicUrl;
      } else {
        console.warn('[p2p-migration/submit] Storage upload failed (bucket may not exist):', uploadErr.message);
      }
    } catch (storageErr) {
      console.warn('[p2p-migration/submit] Screenshot processing failed:', storageErr.message);
    }

    const { error: insertErr } = await supabaseAdmin.from('p2p_migration_requests').insert({
      email: normalizedEmail,
      platform: normalizedPlatform,
      screenshot_url: screenshotUrl,
      status: 'pending',
    });
    if (insertErr) {
      console.error('[p2p-migration/submit] DB insert error:', insertErr.message);
      return res.status(500).json({ error: 'Could not submit right now. Please try again shortly.' });
    }

    console.log(`[p2p-migration/submit] New request from ${normalizedEmail} (${normalizedPlatform})`);
    res.json({ success: true, message: "Thanks! We've got it — our team will review and reach out soon." });
  } catch (err) {
    console.error('[p2p-migration/submit] error:', err.message);
    res.status(500).json({ error: 'Submission failed. Please try again.' });
  }
});

// Resend verification code
app.post('/api/auth/resend-code', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const { data: user } = await supabaseAdmin.from('users').select('id, is_email_verified').eq('email', email).single();
    if (!user) return res.status(404).json({ error: 'Account not found' });
    if (user.is_email_verified) return res.status(400).json({ error: 'Email is already verified' });

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 10 * 60 * 1000;

    verificationCodes.set(email, { code, expiresAt, userId: user.id });
    await supabaseAdmin.from('users').update({
      verification_code: code,
      verification_code_expires: new Date(expiresAt).toISOString(),
    }).eq('email', email).then(null, () => { });

    let emailSent = false;
    try {
      await sendVerificationEmail(email, code);
      emailSent = true;
    } catch (emailErr) {
      console.error('[resend-code email] failed:', emailErr.message);
    }

    const isDev = process.env.NODE_ENV !== 'production';
    console.log(`[resend-code] email=${email} sent=${emailSent} code=${code}`);
    res.json({
      success: true,
      message: emailSent ? 'New verification code sent — check your inbox' : 'Email delivery issue — use devCode if in dev mode',
      devCode: isDev ? code : undefined,
    });
  } catch (error) {
    console.error('Resend-code error:', error);
    res.status(500).json({ error: 'Failed to resend code' });
  }
});

// ============================================================
// USER ROUTES
// ============================================================

// Trigger badge check + return current badge status for logged-in user
app.post('/api/users/check-badges', verifyToken, async (req, res) => {
  try {
    await checkAndAwardBadges(req.userId);
    const { data } = await supabaseAdmin
      .from('user_badges')
      .select('badge_name, is_unlocked, unlocked_at')
      .eq('user_id', req.userId);
    res.json({ success: true, badges: data || [] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/users/heartbeat', verifyToken, async (req, res) => {
  try {
    await supabaseAdmin.from('users')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('id', req.userId);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Lightweight batch endpoint — returns fresh last_seen_at for a list of user IDs.
// Used by marketplace pages to show real-time online status without re-fetching full listings.
app.get('/api/users/online-status', async (req, res) => {
  try {
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const ids = (req.query.ids || '').split(',').map(s => s.trim()).filter(id => UUID_RE.test(id)).slice(0, 100);
    if (ids.length === 0) return res.json({ status: {} });
    const { data } = await supabaseAdmin.from('users').select('id, last_seen_at, last_login').in('id', ids);
    const status = {};
    (data || []).forEach(u => { status[u.id] = u.last_seen_at || u.last_login || null; });
    res.json({ status });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/me/security — returns caller's real IP + geo for the Settings page
app.get('/api/me/security', verifyToken, async (req, res) => {
  try {
    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
      || req.headers['x-real-ip']
      || req.socket?.remoteAddress
      || '';

    // Strip IPv6 loopback wrapper
    const cleanIp = ip.replace(/^::ffff:/, '');

    const isPrivate = !cleanIp || cleanIp === '::1'
      || cleanIp.startsWith('127.')
      || cleanIp.startsWith('192.168.')
      || cleanIp.startsWith('10.')
      || cleanIp.startsWith('172.');

    if (isPrivate) {
      // Running locally — return stored user data instead
      const { data: u } = await supabaseAdmin
        .from('users')
        .select('country, country_name, city, last_seen_location')
        .eq('id', req.userId).single();
      return res.json({
        ip: cleanIp || '127.0.0.1 (local)',
        country_code: u?.country || null,
        country: u?.country_name || null,
        city: u?.city || null,
        location: u?.last_seen_location || null,
        source: 'stored',
      });
    }

    // Fetch live geo from ipapi.co (same service used during login)
    const geoRes = await fetch(`https://ipapi.co/${cleanIp}/json/`, { signal: AbortSignal.timeout(5000) });
    const geo = await geoRes.json();

    if (geo?.country_code && !geo.error) {
      const cc = geo.country_code.toUpperCase();
      const city = geo.city || null;
      const name = geo.country_name || null;
      const loc = city ? `${name} (${city})` : name;

      // Save fresh geo to user profile in background
      supabaseAdmin.from('users')
        .update({ city, country_name: name, last_seen_location: loc, country: cc })
        .eq('id', req.userId)
        .or('country.is.null,country.eq.')
        .then(() => { }).catch(() => { });

      return res.json({ ip: cleanIp, country_code: cc, country: name, city, location: loc, source: 'live' });
    }

    // ipapi.co gave no result — return stored data
    const { data: u } = await supabaseAdmin
      .from('users')
      .select('country, country_name, city, last_seen_location')
      .eq('id', req.userId).single();
    res.json({
      ip: cleanIp,
      country_code: u?.country || null,
      country: u?.country_name || null,
      city: u?.city || null,
      location: u?.last_seen_location || null,
      source: 'stored',
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Welcome bonus status ────────────────────────────────────────────────────────
app.get('/api/bonus/status', verifyToken, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin.from('users')
      .select('bonus_step, bonus_expires_at, bonus_unlocked_at')
      .eq('id', req.userId).single();
    if (error && error.code === 'PGRST116') {
      // User not in bonus programme — return default bonus state
      return res.json({ step: 0, bonus_expires_at: null, bonus_unlocked_at: null, expired: true, ms_remaining: 0, btc_price: 88000, locked_btc: 0, unlocked_btc: 0 });
    }
    if (error) {
      console.error('[GET /api/bonus/status] DB error:', error.message, '| code:', error.code);
      return res.json({ step: 0, bonus_expires_at: null, bonus_unlocked_at: null, expired: true, ms_remaining: 0, btc_price: 88000, locked_btc: 0, unlocked_btc: 0 });
    }

    const now = new Date();
    const expires = data.bonus_expires_at ? new Date(data.bonus_expires_at) : null;
    const expired = expires ? now > expires : false;
    const msLeft = expires ? Math.max(0, expires - now) : 0;

    // Fetch BTC price for USD→BTC conversion
    let btcPrice = 88000;
    try {
      const pr = await fetch('https://api.coinbase.com/v2/prices/BTC-USD/spot');
      const pd = await pr.json();
      btcPrice = parseFloat(pd.data.amount) || 88000;
    } catch (_) { }

    const step = expired && data.bonus_step < 3 ? 0 : (data.bonus_step || 0);
    const bonusBtcLocked = parseFloat((1 / btcPrice).toFixed(8));
    const bonusBtcTotal = parseFloat((2 / btcPrice).toFixed(8));

    res.json({
      step,
      bonus_expires_at: data.bonus_expires_at,
      bonus_unlocked_at: data.bonus_unlocked_at,
      expired,
      ms_remaining: msLeft,
      btc_price: btcPrice,
      locked_btc: step === 2 ? bonusBtcLocked : 0,
      unlocked_btc: step === 3 ? bonusBtcTotal : 0,
    });
  } catch (e) {
    console.error('[GET /api/bonus/status] error:', e.message);
    res.json({ step: 0, bonus_expires_at: null, bonus_unlocked_at: null, expired: true, ms_remaining: 0, btc_price: 88000, locked_btc: 0, unlocked_btc: 0 });
  }
});

app.get('/api/users/profile', verifyToken, async (req, res) => {
  try {
    // Core columns — confirmed to exist in every PRAQEN DB schema
    const coreCols = 'id, email, username, full_name, bio, location, website, phone, avatar_url, average_rating, total_trades, completion_rate, created_at, is_admin, is_moderator, is_id_verified, is_email_verified, is_phone_verified, total_feedback_count, positive_feedback, negative_feedback, last_login, last_seen_at, badge, country, two_factor_enabled, two_factor_method';
    const essentialCols = 'id, email, username, full_name, avatar_url, average_rating, total_trades, completion_rate, created_at, is_admin, is_moderator, is_id_verified, is_email_verified, total_feedback_count, positive_feedback, negative_feedback, last_login, two_factor_enabled, two_factor_method';

    // The core profile fetch (with its column-missing fallback), the optional
    // extra fields, and the wallet balance don't depend on each other — run all
    // three round-trips at once instead of one-after-another.
    const [{ data, error }, extraFields, balance] = await Promise.all([
      (async () => {
        let { data, error } = await supabaseAdmin.from('users').select(coreCols).eq('id', req.userId).single();
        // Fallback if a column doesn't exist in the DB (e.g. is_phone_verified, badge, country)
        if (error && (error.code === '42703' || (error.message && error.message.includes('does not exist')))) {
          console.warn('[GET /api/users/profile] Column missing — falling back to essentials:', error.message);
          const fallback = await supabaseAdmin.from('users').select(essentialCols).eq('id', req.userId).single();
          if (fallback.error) { error = fallback.error; data = null; }
          else { data = fallback.data; error = null; Object.assign(data, { is_phone_verified: false, bio: null, location: null, website: null, phone: null, last_seen_at: null, badge: null, country: null }); }
        }
        return { data, error };
      })(),
      (async () => {
        // Optional columns — isolated so a missing column never breaks the response
        try {
          const { data: extra } = await supabaseAdmin.from('users')
            .select('email_verified, is_phone_verified, phone_verified, kyc_verified, kyc_status, id_type, kyc_submitted_at, id_front_url, id_back_url, selfie_url, kyc_rejection_reason, username_changed, preferred_currency, preferred_language, timezone, hide_full_name, name_display, city, country_name, last_seen_location, referral_code, total_referrals, referral_earnings_btc, p2p_migrated_platform, p2p_migrated_username, p2p_migrated_feedback, p2p_migration_approved_at')
            .eq('id', req.userId).single();
          return extra || {};
        } catch { return {}; }
      })(),
      (async () => {
        // Balance — non-critical, silently ignored on error
        try {
          const { data: bal } = await supabaseAdmin.from('user_balances').select('balance_btc, balance_usd').eq('user_id', req.userId).single();
          return bal || { balance_btc: 0, balance_usd: 0 };
        } catch { return { balance_btc: 0, balance_usd: 0 }; }
      })(),
    ]);

    if (error) {
      console.error('[GET /api/users/profile] DB error:', error.message, '| code:', error.code || 'N/A');
      return res.status(500).json({ error: 'Could not load your profile. Please try again.' });
    }
    if (!data) return res.status(404).json({ error: 'Profile not found.' });

    res.json({
      user: {
        ...data,
        ...extraFields,
        is_admin: data.is_admin || false,
        is_moderator: data.is_moderator || false,
      },
      balance,
    });
  } catch (error) {
    console.error('[GET /api/users/profile] Unexpected error:', error.message);
    res.status(500).json({ error: 'Could not load your profile. Please try again.' });
  }
});

app.get('/api/users/:userId', async (req, res) => {
  try {
    const param = req.params.userId?.trim();
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(param);
    // Use select('*') so adding/missing migration columns never breaks this query
    const SENSITIVE = new Set(['password_hash', 'email', 'phone_number', 'bitcoin_wallet_address']);
    const stripSensitive = row => {
      if (!row) return null;
      return Object.fromEntries(Object.entries(row).filter(([k]) => !SENSITIVE.has(k)));
    };

    let data = null;

    // Try UUID lookup first
    if (isUUID) {
      const { data: byId } = await supabaseAdmin.from('users').select('*').eq('id', param).single();
      data = stripSensitive(byId);
    }

    // Fall back to username lookup (handles /profile/username URLs)
    if (!data) {
      const { data: byUsername } = await supabaseAdmin.from('users').select('*').eq('username', param).single();
      data = stripSensitive(byUsername);
    }

    if (!data) return res.status(404).json({ error: 'User not found. They may have changed their username or the profile may no longer exist.' });

    // Optional extra fields — silently ignored if columns don't exist
    const extraFields = {}; // select('*') already covers all columns

    // Affiliate trade count — how many commission-generating trades their referrals made
    let referral_trade_count = 0;
    try {
      const { count } = await supabaseAdmin
        .from('affiliate_earnings')
        .select('*', { count: 'exact', head: true })
        .eq('referrer_id', data.id);
      if (count != null) referral_trade_count = count;
    } catch { }

    // Real trade count from trades table (buyer or seller, completed)
    let real_total_trades = data.total_trades || 0;
    try {
      const [buyerRes, sellerRes] = await Promise.all([
        supabaseAdmin.from('trades').select('*', { count: 'exact', head: true }).eq('buyer_id', data.id).eq('status', 'COMPLETED'),
        supabaseAdmin.from('trades').select('*', { count: 'exact', head: true }).eq('seller_id', data.id).eq('status', 'COMPLETED'),
      ]);
      const realCount = (buyerRes.count || 0) + (sellerRes.count || 0);
      if (realCount > real_total_trades) {
        real_total_trades = realCount;
        supabaseAdmin.from('users').update({ total_trades: realCount }).eq('id', data.id).then(null, () => { });
      }
    } catch { }

    // Real review counts from reviews table
    let real_positive = data.positive_feedback || 0;
    let real_negative = data.negative_feedback || 0;
    let real_rating = data.average_rating || 0;
    let reviews = [];
    try {
      // No .limit() — fetch all reviews so counts are never cut short
      const { data: rv } = await supabaseAdmin.from('reviews')
        .select('*, reviewer:reviewer_id(id, username)').eq('reviewee_id', data.id)
        .order('created_at', { ascending: false });
      reviews = rv || [];
      if (reviews.length > 0) {
        const computedPos = reviews.filter(r => r.rating >= 4 || r.is_positive === true).length;
        const computedNeg = reviews.filter(r => r.rating <= 2 || r.is_positive === false).length;
        // Always take the higher of computed vs stored — never silently drop feedback
        real_positive = Math.max(computedPos, data.positive_feedback || 0);
        real_negative = Math.max(computedNeg, data.negative_feedback || 0);
        const rated = reviews.filter(r => r.rating != null);
        if (rated.length > 0) {
          real_rating = rated.reduce((sum, r) => sum + parseFloat(r.rating || 0), 0) / rated.length;
        }
        // Sync denormalized counters quietly
        supabaseAdmin.from('users').update({
          positive_feedback: real_positive,
          negative_feedback: real_negative,
          total_feedback_count: reviews.length,
          average_rating: parseFloat(real_rating.toFixed(2)),
        }).eq('id', data.id).then(() => { }).catch(() => { });
      }
    } catch { }

    res.json({
      user: {
        ...data, ...extraFields, referral_trade_count,
        total_trades: real_total_trades,
        positive_feedback: real_positive,
        negative_feedback: real_negative,
        total_feedback_count: real_positive + real_negative,
        average_rating: parseFloat(real_rating.toFixed(2)),
      },
      reviews: reviews.slice(0, 20), // cap list sent to frontend to avoid large payloads
    });
  } catch (error) {
    console.error('[GET /api/users/:userId]', error.message);
    res.status(500).json({ error: 'We couldn\'t load this profile right now. Please try again.' });
  }
});

app.put('/api/users/profile', verifyToken, async (req, res) => {
  try {
    const { username, full_name, fullName, bio, location, website, phone, hide_full_name, name_display } = req.body;

    // Fetch current user to enforce rules
    const { data: current } = await supabaseAdmin.from('users').select('username, full_name, username_changed_at, is_id_verified, full_name_changed_at').eq('id', req.userId).single();

    const updateData = {};

    // Username: allowed only if never changed before
    if (username !== undefined && username.trim() !== current?.username) {
      if (current?.username_changed_at) {
        return res.status(403).json({ error: 'Username can only be changed once.' });
      }
      updateData.username = username.trim();
      updateData.username_changed_at = new Date().toISOString();
    }

    // Full name: locked after first change OR after ID verification
    if (full_name !== undefined || fullName !== undefined) {
      const newName = full_name ?? fullName;
      if (current?.is_id_verified) {
        return res.status(403).json({ error: 'Full name cannot be changed after ID verification.' });
      }
      if (current?.full_name_changed_at && newName !== current?.full_name) {
        return res.status(403).json({ error: 'Full name can only be changed once.' });
      }
      if (newName !== current?.full_name) {
        updateData.full_name_changed_at = new Date().toISOString();
      }
      updateData.full_name = newName;
    }

    if (bio !== undefined) updateData.bio = bio;
    if (location !== undefined) {
      if (current?.is_id_verified) {
        return res.status(403).json({ error: 'Location cannot be changed after ID verification.' });
      }
      updateData.location = location;
    }
    if (website !== undefined) updateData.website = website;
    if (phone !== undefined) updateData.phone = phone;
    if (hide_full_name !== undefined) updateData.hide_full_name = hide_full_name;
    if (name_display !== undefined) updateData.name_display = name_display;
    updateData.updated_at = new Date().toISOString();

    let { data, error } = await supabaseAdmin.from('users').update(updateData).eq('id', req.userId).select().single();
    // Retry up to 3 times, stripping any column the DB says doesn't exist
    for (let i = 0; i < 3 && error; i++) {
      const missing = error.message?.match(/['"]?([\w_]+)['"]?\s+column[^']*(?:schema cache|not found|does not exist)/i) ||
        error.message?.match(/find the ['"]?([\w_]+)['"]?\s+column/i);
      if (!missing) break;
      const col = missing[1];
      if (!updateData[col]) break;
      console.warn(`[profile PUT] Column '${col}' not in schema — retrying without it`);
      delete updateData[col];
      ({ data, error } = await supabaseAdmin.from('users').update(updateData).eq('id', req.userId).select().single());
    }
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true, user: data });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ── Trust / Relationship endpoints ───────────────────────────────────────────

// Toggle trust: POST /api/users/:userId/trust
app.post('/api/users/:userId/trust', verifyToken, async (req, res) => {
  try {
    const targetId = req.params.userId;
    if (targetId === req.userId) return res.status(400).json({ error: 'You cannot trust yourself.' });

    const { data: existing } = await supabaseAdmin
      .from('user_trust').select('id').eq('user_id', req.userId).eq('target_id', targetId).eq('type', 'trust').maybeSingle();

    if (existing) {
      // Untrust — remove record then recount
      await supabaseAdmin.from('user_trust').delete().eq('id', existing.id);
    } else {
      // Trust — insert record
      await supabaseAdmin.from('user_trust').insert({ user_id: req.userId, target_id: targetId, type: 'trust' });
    }

    // Recount trusted_by for target user (always accurate)
    const { count } = await supabaseAdmin.from('user_trust').select('id', { count: 'exact', head: true }).eq('target_id', targetId).eq('type', 'trust');
    await supabaseAdmin.from('users').update({ trusted_by_count: count || 0 }).eq('id', targetId);

    res.json({ trusted: !existing, trusted_by_count: count || 0 });
  } catch (err) {
    console.error('[trust] error:', err.message);
    res.status(500).json({ error: 'Failed to update trust.' });
  }
});

// Get relationship status: GET /api/users/:userId/relationship
app.get('/api/users/:userId/relationship', verifyToken, async (req, res) => {
  try {
    const { data } = await supabaseAdmin
      .from('user_trust').select('type').eq('user_id', req.userId).eq('target_id', req.params.userId);
    res.json({
      is_trusted: data?.some(r => r.type === 'trust') || false,
      is_blocked: data?.some(r => r.type === 'block') || false,
    });
  } catch (err) {
    res.json({ is_trusted: false, is_blocked: false });
  }
});

app.put('/api/users/payment-methods', verifyToken, async (req, res) => {
  try {
    const { bankName, accountNumber, mobileProvider, mobileNumber, bankAccount, mobileMoney, mobileMoneyNumber } = req.body;
    const updateData = {
      bank_name: bankName || bankAccount || null,
      account_number: accountNumber || null,
      mobile_provider: mobileProvider || mobileMoney || null,
      mobile_number: mobileNumber || mobileMoneyNumber || null,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabaseAdmin.from('users').update(updateData).eq('id', req.userId).select().single();
    if (error) { console.warn('[payment-methods] Column may not exist yet:', error.message); return res.json({ success: true }); }
    res.json({ success: true, user: data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/users/upload-avatar', verifyToken, async (req, res) => {
  try {
    const { image } = req.body;
    if (!image) return res.status(400).json({ error: 'No image provided' });
    if (!image.startsWith('data:image/')) return res.status(400).json({ error: 'Invalid image format' });
    // The frontend now resizes to a small thumbnail before upload — this cap is a backstop
    // against any client that skips that step (old cached bundle, future upload path, etc.),
    // since an uncompressed avatar embedded in every one of a seller's listings is what made
    // marketplace loads balloon to tens of MB.
    if (image.length > 400000) {
      return res.status(400).json({ error: 'Image is too large. Please use a smaller photo.' });
    }
    const { data, error } = await supabaseAdmin.from('users')
      .update({ avatar_url: image, updated_at: new Date().toISOString() })
      .eq('id', req.userId).select('id, username, avatar_url').single();
    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: 'User not found' });
    // Bust the per-user avatar cache so the new photo shows immediately
    delete _avatarCache[req.userId];
    res.json({ success: true, avatar_url: data.avatar_url, message: 'Profile picture updated successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// In-memory per-user avatar cache (1-hour TTL) — prevents re-fetching large base64 blobs
const _avatarCache = {};
app.get('/api/users/:userId/avatar', async (req, res) => {
  try {
    const { userId } = req.params;
    const cached = _avatarCache[userId];
    if (cached && Date.now() - cached.ts < 3600000) {
      return res.json({ avatar_url: cached.url });
    }
    const { data } = await supabaseAdmin.from('users').select('avatar_url').eq('id', userId).maybeSingle();
    const url = data?.avatar_url || null;
    _avatarCache[userId] = { url, ts: Date.now() };
    res.json({ avatar_url: url });
  } catch { res.json({ avatar_url: null }); }
});

app.get('/api/users/:userId/reviews', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin.from('reviews')
      .select('*, reviewer:reviewer_id(username)').eq('reviewee_id', req.params.userId)
      .order('created_at', { ascending: false });
    if (error) return res.json({ reviews: [] });
    res.json({ reviews: data || [] });  // ← FIXED: was `reviews` (undefined), now `data`
  } catch { res.json({ reviews: [] }); }
});

// GET /api/users/:userId/listings — public: a user's ACTIVE marketplace offers, for their profile page
app.get('/api/users/:userId/listings', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin.from('listings').select(
      'id, seller_id, listing_type, gift_card_brand, status, bitcoin_price, margin, pricing_type, currency, currency_symbol, country, country_name, payment_method, payment_methods, amount_usd, min_limit_usd, max_limit_usd, min_limit_local, max_limit_local, time_limit, card_type, face_value, created_at'
    ).eq('seller_id', req.params.userId).eq('status', 'ACTIVE').order('created_at', { ascending: false });
    if (error) return res.json({ listings: [] });
    res.json({ listings: data || [] });
  } catch { res.json({ listings: [] }); }
});

// POST /api/users/:userId/view-profile — record a profile view + notify the owner
app.post('/api/users/:userId/view-profile', async (req, res) => {
  try {
    const profileOwnerId = req.params.userId;
    // viewer may or may not be logged in — read from token if present
    let viewerId = null;
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      try {
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(authHeader.slice(7), process.env.JWT_SECRET);
        viewerId = decoded.userId || decoded.id || null;
      } catch { }
    }
    // Don't count self-views
    if (viewerId && viewerId === profileOwnerId) return res.json({ ok: true });

    // Increment profile_views counter (safe even if column doesn't exist yet — will just error silently)
    const { data: cur } = await supabaseAdmin
      .from('users').select('profile_views').eq('id', profileOwnerId).maybeSingle();
    const next = (parseInt(cur?.profile_views) || 0) + 1;
    await supabaseAdmin.from('users').update({ profile_views: next }).eq('id', profileOwnerId);

    // Send notification — throttle to max 1 per viewer per 24h to avoid spam
    const alreadyNotified = viewerId
      ? (await supabaseAdmin.from('notifications')
        .select('id').eq('user_id', profileOwnerId).eq('type', 'profile_view')
        .eq('action', `/profile/${viewerId}`)
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .maybeSingle()).data
      : null;

    if (!alreadyNotified) {
      // Resolve viewer's display name and ID if logged in
      let viewerLabel = 'Someone';
      let viewerProfilePath = null;
      if (viewerId) {
        const { data: vUser } = await supabaseAdmin
          .from('users').select('username').eq('id', viewerId).maybeSingle();
        if (vUser?.username) {
          viewerLabel = vUser.username;
          viewerProfilePath = `/profile/${viewerId}`;
        }
      }
      await createNotification(
        profileOwnerId,
        'profile_view',
        '👀 Profile View',
        `${viewerLabel} just viewed your profile`,
        viewerProfilePath || '/notifications'
      );
    }

    res.json({ ok: true, views: next });
  } catch (err) {
    console.error('[view-profile]', err.message);
    res.json({ ok: true }); // never block navigation
  }
});

// ============================================================
// BALANCE ROUTES
// ============================================================

app.get('/api/user/balance', verifyToken, async (req, res) => {
  try {
    const [btcPrice, { data, error }] = await Promise.all([
      getCurrentBTCPrice().catch(() => 88000),
      supabaseAdmin.from('wallets').select('balance_btc').eq('user_id', req.userId).maybeSingle(),
    ]);
    if (error) {
      console.error('[GET /api/user/balance] DB error:', error.message, '| code:', error.code);
      return res.json({ balance_btc: 0, balance_usd: 0, btc_price: btcPrice || 88000 });
    }
    const balBtc = parseFloat(data?.balance_btc || 0);
    const balUsd = parseFloat((balBtc * btcPrice).toFixed(2));
    console.log(`[/api/user/balance] user=${req.userId.slice(0, 8)} btc=${balBtc} price=${btcPrice} usd=${balUsd}`);
    res.json({ balance_btc: balBtc, balance_usd: balUsd, btc_price: btcPrice });
  } catch (error) {
    console.error('[GET /api/user/balance] error:', error.message);
    res.json({ balance_btc: 0, balance_usd: 0, btc_price: 88000 });
  }
});
// DEV ENDPOINT DISABLED — manual balance injection is not allowed in production.
// All BTC balances must come from real on-chain deposits monitored by depositMonitor.js.
app.post('/api/user/add-balance', verifyToken, (req, res) => {
  res.status(403).json({ error: 'This endpoint is disabled. Deposit real Bitcoin to your wallet address.' });
});

// ============================================================
// LISTINGS ROUTES
// ============================================================

app.post('/api/listings', verifyToken, async (req, res) => {
  try {
    const b = req.body;
    const listingType = b.listing_type || 'SELL';
    const brand = b.giftCardBrand || b.gift_card_brand || (listingType === 'SELL' ? 'Sell Bitcoin' : 'Buy Bitcoin');
    const btcPriceUSD = parseFloat(b.bitcoinPrice || b.bitcoin_price) || 0;
    const marginPct = parseFloat(b.margin) || 0;
    const payMethod = b.paymentMethod || b.payment_method || '';
    const timeLimit = parseInt(b.time_limit || b.processingTime || 30);
    const minUSD = parseFloat(b.min_limit_usd || b.minAmount) || 0;
    const maxUSD = parseFloat(b.max_limit_usd || b.maxAmount || b.amountUsd) || 0;
    const minLocal = parseFloat(b.min_limit_local) || 0;
    const maxLocal = parseFloat(b.max_limit_local) || 0;

    // ── Verification level checks ──────────────────────────────────────────────
    // Use only columns confirmed to exist in the DB schema
    const { data: listingUser, error: listingUserErr } = await supabaseAdmin
      .from('users').select('is_email_verified, is_phone_verified, is_id_verified, phone')
      .eq('id', req.userId).single();

    let hasEmail = false, hasPhone = false, hasKyc = false;
    if (listingUserErr) {
      // Fallback: column mismatch — try bare minimum safe columns
      const { data: safeUser } = await supabaseAdmin
        .from('users').select('is_email_verified, is_id_verified, phone')
        .eq('id', req.userId).single();
      hasEmail = !!(safeUser?.is_email_verified);
      hasKyc = !!(safeUser?.is_id_verified);
      hasPhone = !!(safeUser?.phone);
    } else {
      hasEmail = !!(listingUser?.is_email_verified);
      hasPhone = !!(listingUser?.is_phone_verified || listingUser?.phone);
      hasKyc = !!(listingUser?.is_id_verified);
    }
    // Email verification is the only requirement to create offers.
    // Phone is optional (unlocks higher trade limits when added).
    if (!hasEmail) {
      return res.status(403).json({
        error: 'Please verify your email address to create offers.',
        requireVerification: 'email',
      });
    }

    const isGiftCard = listingType === 'BUY_GIFT_CARD' || listingType === 'SELL_GIFT_CARD' || listingType === 'GIFT_CARD';
    const verifCount = [hasEmail, hasPhone, hasKyc].filter(Boolean).length;

    const FOREIGN_CURRENCIES_LIST = ['USD', 'GBP', 'CAD', 'EUR', 'AUD', 'SGD', 'CHF', 'SEK', 'NOK', 'DKK', 'NZD', 'JPY', 'HKD', 'PLN', 'BRL', 'MXN'];
    if (isGiftCard && !FOREIGN_CURRENCIES_LIST.includes((b.currency || '').toUpperCase())) {
      b.currency = 'USD';
      b.currency_symbol = '$';
    }

    // Very large offers ($10k+) still require KYC (identity) verification
    if (maxUSD >= 10000 && !hasKyc) {
      return res.status(403).json({
        error: 'Offers over $10,000 require identity (KYC) verification.',
        requireVerification: 'kyc',
      });
    }

    // Enforce $10 USD minimum trade amount for non-gift-card offers
    if (!isGiftCard && minUSD < 10) {
      return res.status(400).json({ error: 'Minimum trade amount must be at least $10 USD.' });
    }

    // BUY_GIFT_CARD offers lock BTC in escrow — creator must have >= $10 BTC
    if (listingType === 'BUY_GIFT_CARD') {
      const { data: creatorWallet } = await supabaseAdmin
        .from('wallets').select('balance_btc').eq('user_id', req.userId).maybeSingle();
      const creatorBalUsd = parseFloat(creatorWallet?.balance_btc || 0) * 88000;
      if (creatorBalUsd < 10) {
        return res.status(400).json({
          error: 'You need at least $10 worth of Bitcoin in your PRAQEN wallet to create a gift card buying offer. Please top up your wallet first.',
        });
      }
    }

    // Block duplicate offers: same payment method + same currency + same type (skip gift cards)
    if (!isGiftCard) {
      const { data: dupCheck } = await supabaseAdmin
        .from('listings')
        .select('id, status')
        .eq('seller_id', req.userId)
        .eq('payment_method', payMethod)
        .eq('listing_type', listingType)
        .eq('currency', b.currency || 'USD')
        .in('status', ['ACTIVE', 'PAUSED'])
        .limit(1);
      if (dupCheck && dupCheck.length > 0) {
        const existing = dupCheck[0];
        const isPaused = existing.status === 'PAUSED';
        return res.status(400).json({
          error: isPaused
            ? `You already have a paused ${payMethod} (${b.currency || 'USD'}) offer. Activate it from your Dashboard instead.`
            : `You already have an active ${payMethod} (${b.currency || 'USD'}) offer. Edit it from your Dashboard instead.`,
          existingOfferId: existing.id,
          existingOfferStatus: existing.status,
        });
      }
    }

    // Offers are preferences only — no per-offer balance locking.
    // Sellers can create multiple offers for the same BTC; escrow locks at trade time.
    const cur = b.currency || 'USD';
    const curSym = b.currency_symbol || (cur === 'GHS' ? '₵' : cur === 'NGN' ? '₦' : cur === 'EUR' ? '€' : cur === 'GBP' ? '£' : '$');
    const amtUsd = parseFloat(b.amountUsd || b.amount_usd || minUSD) || 0;
    const { data, error } = await supabaseAdmin.from('listings').insert([{
      seller_id: req.userId, listing_type: listingType, gift_card_brand: brand, status: 'ACTIVE',
      bitcoin_price: btcPriceUSD, margin: marginPct, pricing_type: b.pricing_type || b.pricingType || 'market',
      currency: cur, currency_symbol: curSym, country: b.country || '', country_name: b.country_name || '',
      payment_method: payMethod, payment_methods: b.paymentMethods || [payMethod],
      amount_usd: amtUsd, min_limit_usd: minUSD, max_limit_usd: maxUSD, min_limit_local: minLocal, max_limit_local: maxLocal,
      time_limit: timeLimit, processing_time_minutes: timeLimit,
      trade_instructions: b.trade_instructions || '', listing_terms: b.listing_terms || '',
      description: b.description || `${brand} via ${payMethod}`,
      card_values: Array.isArray(b.card_values) && b.card_values.length > 0
        ? b.card_values.map(v => String(parseFloat(v))).filter(v => !isNaN(parseFloat(v)) && parseFloat(v) > 0)
        : null,
      card_type: b.card_type || 'both',
      face_value: b.face_value || (Array.isArray(b.card_values) && b.card_values[0] ? parseFloat(b.card_values[0]) : null) || null,
    }]).select();
    if (error) { console.error('[POST /listings]', error.message); return res.status(400).json({ error: error.message }); }
    bustCache();
    res.json({ success: true, listing: data[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── Featured Offers of the Week ──────────────────────────────────────────────
app.get('/api/featured-offers', async (req, res) => {
  try {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // Try last 7 days first, fall back to last 30 days so MVP always has data
    let { data: trades } = await supabaseAdmin
      .from('trades')
      .select('seller_id, amount_usd, created_at')
      .eq('status', 'COMPLETED')
      .gte('created_at', weekAgo);

    if (!trades || !trades.length) {
      const { data: older } = await supabaseAdmin
        .from('trades')
        .select('seller_id, amount_usd, created_at')
        .eq('status', 'COMPLETED')
        .gte('created_at', monthAgo);
      trades = older || [];
    }

    // Build per-seller stats (empty object is fine — we fall back to profile metrics)
    const stats = {};
    for (const t of trades || []) {
      const id = t.seller_id;
      if (!id) continue;
      if (!stats[id]) stats[id] = { trades: 0, volume: 0 };
      stats[id].trades++;
      stats[id].volume += parseFloat(t.amount_usd || 0);
    }

    // Fetch ALL active listings (BTC + gift cards)
    const { data: listings } = await supabaseAdmin
      .from('listings')
      .select('*')
      .eq('status', 'ACTIVE')
      .limit(300);

    if (!listings || !listings.length) return res.json({ featured: [] });

    const allSellerIds = [...new Set(listings.map(l => l.seller_id).filter(Boolean))];

    // Fetch seller profiles — same fields as /api/listings so the query is known-good
    let userMap = {};
    if (allSellerIds.length > 0) {
      const [profilesResult, avatarResult] = await Promise.all([
        supabaseAdmin.from('users').select(
          'id, username, full_name, average_rating, total_trades, completion_rate, is_id_verified, is_email_verified, last_login, last_seen_at, total_feedback_count, positive_feedback, negative_feedback, country, bio, badge'
        ).in('id', allSellerIds),
        supabaseAdmin.from('users').select('id, avatar_url').in('id', allSellerIds),
      ]);
      console.log('[featured] sellerIds:', allSellerIds.length, '| profilesResult count:', (profilesResult.data || []).length, '| err:', profilesResult.error?.message);
      (profilesResult.data || []).forEach(u => { userMap[u.id] = u; });
      (avatarResult.data || []).forEach(u => { if (userMap[u.id]) userMap[u.id].avatar_url = capAvatar(u.avatar_url); });
    }

    const enriched = listings.map(l => ({ ...l, users: userMap[l.seller_id] || {} }));

    // Pick the best listing for a seller, preferring certain types first
    const bestListing = (sellerId, preferTypes) => {
      const sl = enriched.filter(l => l.seller_id === sellerId);
      const preferred = preferTypes ? sl.filter(l => preferTypes.includes(l.listing_type)) : [];
      const pool = preferred.length ? preferred : sl;
      return pool.sort((a, b) => parseFloat(a.margin || 0) - parseFloat(b.margin || 0))[0];
    };

    // Rank sellers: trade stats first, fall back to profile total_trades
    const rank = (ids, key) => [...ids].sort((a, b) => {
      const sa = stats[a]?.[key] ?? (key === 'trades' ? (userMap[a]?.total_trades || 0) : 0);
      const sb = stats[b]?.[key] ?? (key === 'trades' ? (userMap[b]?.total_trades || 0) : 0);
      return sb - sa;
    });

    // Winner 1: most trades — BTC seller
    const btcSellerIds = [...new Set(enriched.filter(l => l.listing_type === 'SELL' || l.listing_type === 'SELL_BITCOIN').map(l => l.seller_id))];
    const [activeSellerId] = rank(btcSellerIds.length ? btcSellerIds : allSellerIds, 'trades');

    // Winner 2: fastest responder — gift card seller, rank by avg_response_time then positive_feedback
    const gcSellerIds = [...new Set(enriched.filter(l => l.listing_type === 'SELL_GIFT_CARD' || l.listing_type === 'BUY_GIFT_CARD').map(l => l.seller_id))];
    const gcPool = (gcSellerIds.length ? gcSellerIds : allSellerIds).filter(id => id !== activeSellerId);
    // fast_responder: gift card seller with most positive feedback (best trust score)
    const [fastSellerId] = gcPool.sort((a, b) =>
      (userMap[b]?.positive_feedback || 0) - (userMap[a]?.positive_feedback || 0)
    );

    // Winner 3: highest volume
    const [hotSellerId] = rank(
      allSellerIds.filter(id => id !== activeSellerId && id !== fastSellerId),
      'volume'
    );

    const featured = [];
    const push = (sellerId, type, preferTypes) => {
      if (!sellerId) return;
      const listing = bestListing(sellerId, preferTypes);
      if (!listing) return;
      featured.push({
        ...listing,
        users: userMap[sellerId] || {},
        featured_type: type,
        week_trades: stats[sellerId]?.trades || 0,
        week_volume: Math.round(stats[sellerId]?.volume || 0),
      });
    };

    push(activeSellerId, 'active_trader', ['SELL', 'SELL_BITCOIN']);
    push(fastSellerId, 'fast_responder', ['SELL_GIFT_CARD', 'BUY_GIFT_CARD']);
    push(hotSellerId, 'hot_offer', ['SELL', 'SELL_BITCOIN', 'SELL_GIFT_CARD']);

    res.json({ featured });
  } catch (e) {
    console.error('[featured-offers]', e.message);
    res.json({ featured: [] });
  }
});

// Cursor is "<created_at>|<id>" — a compound tie-breaker, not created_at alone. Multiple
// listings can share an identical created_at (bulk inserts, same-second creates), so a
// plain created_at cursor can silently skip or repeat rows across pages. Both parts are
// validated before use since they're echoed back to us from the client on the next page
// request and get interpolated into a PostgREST .or() filter string below.
function parseListingsCursor(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const sep = raw.lastIndexOf('|');
  if (sep === -1) return null;
  const ts = raw.slice(0, sep);
  const id = raw.slice(sep + 1);
  if (isNaN(Date.parse(ts))) return null;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null;
  return { ts, id };
}

app.get('/api/listings', async (req, res) => {
  try {
    const { brand, minPrice, maxPrice, type } = req.query;
    // Backward compatibility: with none of type/limit/cursor set, this key is byte-identical
    // to the pre-pagination key ('listings|||' when brand/minPrice/maxPrice are also unset) —
    // _warmListingsCache() below still warms exactly that key, and the 6 other pages that
    // call /api/listings with no extra params keep hitting the same cache entries as before.
    let cacheKey = `listings|${brand || ''}|${minPrice || ''}|${maxPrice || ''}`;
    if (type) cacheKey += `|t:${type}`;

    const requestedLimit = parseInt(req.query.limit, 10);
    const effectiveLimit = (Number.isFinite(requestedLimit) && requestedLimit > 0) ? Math.min(requestedLimit, 50) : 200;
    if (req.query.limit) cacheKey += `|l:${effectiveLimit}`;

    const cursor = parseListingsCursor(req.query.cursor);
    if (cursor) cacheKey += `|c:${req.query.cursor}`;

    const hit = getCached(cacheKey);
    if (hit) {
      const meta = _listingsPageMeta.get(cacheKey) || { hasMore: false, nextCursor: null };
      return res.json({ listings: hit, hasMore: meta.hasMore, nextCursor: meta.nextCursor });
    }

    // Step 1: fetch listings only (no join) — fast
    let listingsQ = supabaseAdmin.from('listings').select(
      'id, seller_id, listing_type, asset, gift_card_brand, status, bitcoin_price, margin, pricing_type, currency, currency_symbol, country, country_name, payment_method, payment_methods, amount_usd, min_limit_usd, max_limit_usd, min_limit_local, max_limit_local, time_limit, trade_instructions, listing_terms, description, created_at, card_values, card_type, face_value'
    ).eq('status', 'ACTIVE').order('created_at', { ascending: false }).order('id', { ascending: false }).limit(effectiveLimit);
    if (brand) listingsQ = listingsQ.ilike('gift_card_brand', `%${brand}%`);
    if (minPrice) listingsQ = listingsQ.gte('bitcoin_price', parseFloat(minPrice));
    if (maxPrice) listingsQ = listingsQ.lte('bitcoin_price', parseFloat(maxPrice));
    if (type) listingsQ = listingsQ.eq('listing_type', type);
    if (cursor) listingsQ = listingsQ.or(`created_at.lt.${cursor.ts},and(created_at.eq.${cursor.ts},id.lt.${cursor.id})`);

    // Use a real AbortSignal instead of Promise.race: race() only abandons the promise
    // on the Node side — the underlying PostgREST request (and the Postgres connection
    // it holds open) keeps running to completion regardless. Under load that let
    // timed-out requests pile up and hold connections while the client retried,
    // starving the pool and making every subsequent request slower — a likely
    // contributor to the "always going off" slowness. abortSignal() actually cancels
    // the in-flight request so its connection is freed the moment we give up on it.
    const _listingsAbort = new AbortController();
    const _listingsTimer = setTimeout(() => _listingsAbort.abort(), 8000);
    const { data: rawListings, error: listErr } = await listingsQ.abortSignal(_listingsAbort.signal);
    clearTimeout(_listingsTimer);
    const _listingsTimedOut = !!listErr && (listErr.code === '' || /abort/i.test(listErr.message || ''));
    if (listErr && !_listingsTimedOut) {
      console.error('[/api/listings] Listing query error:', listErr.message, '| code:', listErr.code);
      // Return empty array so the marketplace doesn't crash — client will retry
      return res.json({ listings: [], stale: false, error: listErr.message });
    }
    if (_listingsTimedOut || rawListings === null) {
      const stale = getCachedStale(cacheKey);
      if (stale) {
        console.warn('[/api/listings] DB timed out — serving stale cache');
        return res.json({ listings: stale, stale: true });
      }
      console.warn('[/api/listings] DB query timed out — returning 503 so client retries');
      return res.status(503).json({ error: 'Marketplace is temporarily unavailable. Please try again in a moment.' });
    }

    // Pagination metadata derived from the RAW page (before balance-filtering below can
    // remove rows) — the cursor must track how far the underlying query got, not how many
    // rows ended up visible after filtering, or the next page would skip rows.
    const _rawCount = (rawListings || []).length;
    const hasMoreListings = _rawCount === effectiveLimit;
    const lastRaw = _rawCount ? rawListings[_rawCount - 1] : null;
    const nextCursorVal = lastRaw ? `${lastRaw.created_at}|${lastRaw.id}` : null;

    // Step 2+3: fetch user profiles AND wallet balances in parallel (not sequential)
    const sellerIdSet = [...new Set((rawListings || []).map(l => l.seller_id).filter(Boolean))];
    const btcRequiredTypes = ['SELL', 'SELL_BITCOIN', 'BUY_GIFT_CARD'];
    const btcSellerIds = [...new Set((rawListings || []).filter(l => btcRequiredTypes.includes(l.listing_type)).map(l => l.seller_id).filter(Boolean))];
    const sellGcSellerIds = [...new Set((rawListings || []).filter(l => l.listing_type === 'SELL_GIFT_CARD').map(l => l.seller_id).filter(Boolean))];

    let userMap = {};
    let walletRows = [];
    let depositedSellerIds = new Set();

    if (sellerIdSet.length > 0) {
      const [usersResult, walletsResult, depositsResult] = await Promise.all([
        Promise.race([
          supabaseAdmin.from('users').select(
            'id, username, full_name, average_rating, total_trades, completion_rate, is_id_verified, is_email_verified, last_login, last_seen_at, total_feedback_count, positive_feedback, negative_feedback, country, bio, badge, avatar_url'
          ).in('id', sellerIdSet),
          new Promise(resolve => setTimeout(() => resolve({ data: [] }), 10000)),
        ]),
        btcSellerIds.length > 0
          ? Promise.race([
            supabaseAdmin.from('wallets').select('user_id, balance_btc, balance_usdt').in('user_id', btcSellerIds),
            new Promise(resolve => setTimeout(() => resolve({ data: [] }), 4000)),
          ])
          : Promise.resolve({ data: [] }),
        sellGcSellerIds.length > 0
          ? Promise.race([
            supabaseAdmin.from('seller_deposits').select('user_id, remaining_amount, amount_usdt').eq('status', 'LOCKED').in('user_id', sellGcSellerIds),
            new Promise(resolve => setTimeout(() => resolve({ data: [] }), 4000)),
          ])
          : Promise.resolve({ data: [] }),
      ]);
      if (usersResult.error || !usersResult.data || usersResult.data.length === 0) {
        const stale = getCachedStale(cacheKey);
        if (stale) {
          if (usersResult.error) console.error('[/api/listings] Users query FAILED:', usersResult.error.message, '— serving stale cache');
          else console.warn('[/api/listings] Users query returned 0 rows — serving stale cache');
          return res.json({ listings: stale, stale: true });
        }
        if (usersResult.error) console.error('[/api/listings] Users query FAILED:', usersResult.error.message, '| code:', usersResult.error.code);
        else console.warn('[/api/listings] Users query returned 0 rows for', sellerIdSet.length, 'seller IDs. Timed out or RLS blocking. Returning 503.');
        return res.status(503).json({ error: 'Could not load seller profiles. Please retry in a moment.' });
      }
      (usersResult.data || []).forEach(u => { userMap[u.id] = { ...u, avatar_url: capAvatar(u.avatar_url) }; });
      walletRows = walletsResult.data || [];
      // Only a never-seized (amount_usdt === remaining_amount) LOCKED deposit counts as "secured"
      depositedSellerIds = new Set(
        (depositsResult.data || [])
          .filter(d => parseFloat(d.remaining_amount) === parseFloat(d.amount_usdt))
          .map(d => d.user_id)
      );
    }

    let listings = (rawListings || []).map(l => ({
      ...l,
      users: userMap[l.seller_id] || null,
      seller_has_deposit: l.listing_type === 'SELL_GIFT_CARD' ? depositedSellerIds.has(l.seller_id) : undefined,
    }));

    const balanceCheckedListings = listings.filter(l => btcRequiredTypes.includes(l.listing_type));

    if (balanceCheckedListings.length > 0) {
      const balMap = {};
      const usdtBalMap = {};
      (walletRows || []).forEach(w => {
        balMap[w.user_id] = parseFloat(w.balance_btc || 0);
        usdtBalMap[w.user_id] = parseFloat(w.balance_usdt || 0);
      });
      // 1 USDT ≈ $1 — no external price lookup needed.
      // Uses the LIVE market price, not the listing's own bitcoin_price field — that field
      // can be stale or bogus (e.g. a leftover value on a 'market' pricing_type listing that
      // isn't used for rate display at all), which previously let near-empty wallets pass
      // the $10 minimum check because the inflated price overstated their USD balance.
      const livePriceUsd = _btcCache || 88000;
      const balanceUsdFor = (l) => (l.asset === 'USDT')
        ? (usdtBalMap[l.seller_id] || 0)
        : (balMap[l.seller_id] || 0) * livePriceUsd;
      // For SELL offers: cap displayed limits to seller's actual balance
      listings = listings.map(l => {
        if (l.listing_type !== 'SELL' && l.listing_type !== 'SELL_BITCOIN') return l;
        const sellerBtc = balMap[l.seller_id] || 0;
        const balanceUsd = balanceUsdFor(l);
        const origMaxUsd = parseFloat(l.max_limit_usd || 0);
        const origMaxLocal = parseFloat(l.max_limit_local || 0);

        // Cap displayed max to what the seller actually holds
        const cappedMaxUsd = origMaxUsd > 0 && balanceUsd > 0 ? Math.min(origMaxUsd, balanceUsd) : balanceUsd;
        // Scale local max proportionally using the listing's implicit rate
        const localRate = origMaxUsd > 0 && origMaxLocal > 0 ? origMaxLocal / origMaxUsd : 1;
        const cappedMaxLocal = parseFloat((cappedMaxUsd * localRate).toFixed(2));

        return {
          ...l,
          seller_balance_btc: sellerBtc,
          seller_balance_usdt: usdtBalMap[l.seller_id] || 0,
          effective_max_usd: cappedMaxUsd,
          max_limit_usd: cappedMaxUsd,
          max_limit_local: cappedMaxLocal,
        };
      });

      // Hide BTC/USDT-required offers where seller has < $10 OR can't fulfil the minimum trade amount
      const toPauseIds = [];
      listings = listings.filter(l => {
        if (!btcRequiredTypes.includes(l.listing_type)) return true;
        const balanceUsd = balanceUsdFor(l);
        const minUsd = parseFloat(l.min_limit_usd || 0);

        const tooLow = balanceUsd < 10;
        const cantDoMin = minUsd > 0 && balanceUsd < minUsd;

        if (tooLow || cantDoMin) { toPauseIds.push(l.id); return false; }
        return true;
      });

      // NOTE: We intentionally do NOT auto-pause to DB here — that would permanently
      // hide the offer even after the seller tops up. Low-balance offers are just
      // excluded from this API response; the seller's listing stays ACTIVE in the DB
      // so it reappears automatically once their balance is sufficient again.
    }

    // Attach display_name and resolve best country for each listing's embedded user
    listings = listings.map(l => {
      if (!l.users) return l;
      const u = Array.isArray(l.users) ? l.users[0] : l.users;
      const resolvedCountry = u.country || null;
      return { ...l, users: { ...u, display_name: computeDisplayName(u), country: resolvedCountry } };
    });

    // Only cache when we actually got real data — never cache an empty result
    // (empty could mean DB timeout/failure, not a genuinely empty marketplace)
    if (listings.length > 0) {
      setCached(cacheKey, listings);
      _listingsPageMeta.set(cacheKey, { hasMore: hasMoreListings, nextCursor: nextCursorVal });
    }
    res.json({ listings, hasMore: hasMoreListings, nextCursor: nextCursorVal });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/listings/:id', async (req, res) => {
  const timeout = ms => new Promise(resolve => setTimeout(() => resolve(null), ms));
  try {
    // Step 1: fetch the listing itself — hard 5s cap
    const listingResult = await Promise.race([
      supabaseAdmin.from('listings').select('*').eq('id', req.params.id).single(),
      timeout(5000).then(() => ({ data: null, error: { message: 'timeout' } })),
    ]);
    const { data: listing, error: listingError } = listingResult;

    if (listingError?.message === 'timeout' || !listing) {
      // If we got a timeout (not a 404), return 503 so the frontend retries
      if (!listingError || listingError.message === 'timeout') {
        return res.status(503).json({ error: 'Server is temporarily busy. Please try again.' });
      }
      return res.status(404).json({ error: 'Listing not found' });
    }

    // Step 2: seller + wallet — 4s cap; these are enrichment so we continue on failure
    let seller = null;
    let sellerBalanceBtc = 0;
    let sellerBalanceUsdt = 0;
    try {
      const [sellerResult, walletResult] = await Promise.all([
        Promise.race([
          supabaseAdmin.from('users').select('*').eq('id', listing.seller_id).single(),
          timeout(4000).then(() => ({ data: null })),
        ]),
        Promise.race([
          supabaseAdmin.from('wallets').select('balance_btc, balance_usdt').eq('user_id', listing.seller_id).maybeSingle(),
          timeout(4000).then(() => ({ data: null })),
        ]),
      ]);
      if (sellerResult?.data?.id) {
        const { password_hash: _ph, email: _em, phone_number: _pn, bitcoin_wallet_address: _bwa, ...sellerSafe } = sellerResult.data;
        seller = { ...sellerSafe, avatar_url: capAvatar(sellerSafe.avatar_url) };
      }
      sellerBalanceBtc = parseFloat(walletResult?.data?.balance_btc || 0);
      sellerBalanceUsdt = parseFloat(walletResult?.data?.balance_usdt || 0);
    } catch (e) {
      console.warn('[listings/:id] seller/wallet fetch failed:', e.message);
    }

    // Step 3: trade stats + reviews — 4s cap; skip entirely on timeout
    let enrichedSeller = seller || {};
    if (seller?.id) {
      try {
        const statsResult = await Promise.race([
          Promise.all([
            supabaseAdmin.from('trades').select('*', { count: 'exact', head: true }).eq('buyer_id', seller.id).eq('status', 'COMPLETED'),
            supabaseAdmin.from('trades').select('*', { count: 'exact', head: true }).eq('seller_id', seller.id).eq('status', 'COMPLETED'),
            supabaseAdmin.from('reviews').select('rating').eq('reviewee_id', seller.id),
          ]),
          timeout(4000).then(() => null),
        ]);
        if (statsResult) {
          const [buyRes, sellRes, reviewRes] = statsResult;
          const realTrades = (buyRes.count || 0) + (sellRes.count || 0);
          const reviews = reviewRes.data || [];
          const posCount = reviews.filter(r => r.rating >= 4).length;
          const negCount = reviews.filter(r => r.rating <= 2).length;
          const avgRating = reviews.length > 0
            ? reviews.reduce((s, r) => s + parseFloat(r.rating || 0), 0) / reviews.length : 0;
          enrichedSeller = {
            ...seller,
            total_trades: realTrades > seller.total_trades ? realTrades : seller.total_trades,
            positive_feedback: posCount > seller.positive_feedback ? posCount : seller.positive_feedback,
            negative_feedback: negCount > seller.negative_feedback ? negCount : seller.negative_feedback,
            total_feedback_count: reviews.length > seller.total_feedback_count ? reviews.length : seller.total_feedback_count,
            average_rating: avgRating > 0 ? parseFloat(avgRating.toFixed(2)) : seller.average_rating,
          };
        }
      } catch { }
    }

    // Use the LIVE market price, not the listing's own bitcoin_price field, for balance-
    // sufficiency math — that field is a snapshot taken at creation time (or unused entirely
    // on 'market' pricing_type listings) and drifts from reality, which was making this
    // endpoint disagree with GET /api/listings (which already uses the live price) about
    // whether a seller could still fulfil their own offer.
    const btcPriceVal = _btcCache || parseFloat(listing.bitcoin_price) || 88000;
    // Only listing types where the seller pays out BTC/USDT need their live balance to cap
    // the max — matches btcRequiredTypes used by the /api/listings list endpoint.
    const btcRequiredTypes = ['SELL', 'SELL_BITCOIN', 'BUY_GIFT_CARD'];
    const capsByBalance = btcRequiredTypes.includes(listing.listing_type);
    const minLimitUsd = parseFloat(listing.min_limit_usd || 0);
    const listingMaxUsd = parseFloat(listing.max_limit_usd || 0);
    // This previously always priced the seller's BTC wallet regardless of the listing's own
    // asset — a USDT-asset offer (1 USDT ≈ $1) was being checked against an unrelated BTC
    // balance, so a seller sitting on plenty of USDT could still get flagged as unable to
    // cover their own offer's minimum. Branch on listing.asset like the list endpoint does.
    const isUsdtAsset = listing.asset === 'USDT';
    const sellerBalanceForAsset = isUsdtAsset ? sellerBalanceUsdt : sellerBalanceBtc;
    const balanceUsd = isUsdtAsset ? sellerBalanceUsdt : sellerBalanceBtc * btcPriceVal;

    const effectiveMaxUsd = capsByBalance && sellerBalanceForAsset > 0
      ? Math.min(balanceUsd, listingMaxUsd || balanceUsd)
      : listingMaxUsd;

    // If the seller's live balance can't even cover the listing's own minimum, the range
    // (min > effective max) is impossible to trade — flag it instead of showing a broken range.
    const sellerCanFulfillMin = !capsByBalance || !minLimitUsd || balanceUsd >= minLimitUsd;

    res.json({ listing: { ...listing, users: enrichedSeller.id ? [enrichedSeller] : [], seller_balance_btc: sellerBalanceBtc, seller_balance_usdt: sellerBalanceUsdt, effective_max_usd: effectiveMaxUsd, seller_can_fulfill_min: sellerCanFulfillMin } });
  } catch (error) {
    console.error('[listings/:id] error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/my-listings', verifyToken, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin.from('listings').select('*').eq('seller_id', req.userId).order('created_at', { ascending: false });
    if (error) return res.status(400).json({ error: error.message });
    res.json({ listings: data || [] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/listings/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { margin, min_limit_usd, max_limit_usd, min_limit_local, max_limit_local,
      payment_method, trade_instructions, listing_terms, time_limit, status } = req.body;
    const { data: listing, error: findError } = await supabaseAdmin.from('listings').select('seller_id, listing_type, asset').eq('id', id).single();
    if (findError || !listing) return res.status(404).json({ error: 'Listing not found' });
    if (listing.seller_id !== req.userId) return res.status(403).json({ error: 'You can only edit your own listings' });
    if (min_limit_usd !== undefined && parseFloat(min_limit_usd) < 10) {
      return res.status(400).json({ error: 'Minimum trade amount must be at least $10 USD.' });
    }
    // For SELL offers: cap max_limit_usd at seller's actual wallet balance
    if (max_limit_usd !== undefined) {
      const isSellListing = ['SELL', 'SELL_BITCOIN'].includes((listing.listing_type || '').toUpperCase());
      if (isSellListing) {
        const { data: sellerWallet } = await supabaseAdmin
          .from('wallets').select('balance_btc, balance_usdt').eq('user_id', req.userId).maybeSingle();
        const sellerBalUsd = parseFloat(sellerWallet?.balance_btc || 0) * 88000;
        if (parseFloat(max_limit_usd) > sellerBalUsd && sellerBalUsd > 0) {
          return res.status(400).json({
            error: `Maximum trade limit ($${parseFloat(max_limit_usd).toFixed(0)}) exceeds your wallet balance ($${sellerBalUsd.toFixed(0)}). Please top up or lower the maximum.`,
          });
        }
      }
    }
    const updateData = { updated_at: new Date().toISOString() };
    if (margin !== undefined) updateData.margin = margin;
    if (min_limit_usd !== undefined) updateData.min_limit_usd = min_limit_usd;
    if (max_limit_usd !== undefined) updateData.max_limit_usd = max_limit_usd;
    if (min_limit_local !== undefined) updateData.min_limit_local = min_limit_local;
    if (max_limit_local !== undefined) updateData.max_limit_local = max_limit_local;
    if (payment_method !== undefined) updateData.payment_method = payment_method;
    if (trade_instructions !== undefined) updateData.trade_instructions = trade_instructions;
    if (listing_terms !== undefined) updateData.listing_terms = listing_terms;
    if (time_limit !== undefined) updateData.time_limit = time_limit;
    if (status !== undefined) updateData.status = status;
    const { data, error } = await supabaseAdmin.from('listings').update(updateData).eq('id', id).select().single();
    if (error) return res.status(400).json({ error: error.message });
    bustCache();
    res.json({ success: true, listing: data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/listings/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { data: listing, error: findError } = await supabaseAdmin.from('listings').select('seller_id').eq('id', id).single();
    if (findError || !listing) return res.status(404).json({ error: 'Listing not found' });
    if (listing.seller_id !== req.userId) return res.status(403).json({ error: 'You can only delete your own listings' });
    const { error } = await supabaseAdmin.from('listings').update({ status: 'DELETED', updated_at: new Date().toISOString() }).eq('id', id);
    if (error) return res.status(400).json({ error: error.message });
    bustCache();
    res.json({ success: true, message: 'Listing deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Increment view count — fires whenever a listing detail page loads
app.post('/api/listings/:id/view', optionalAuth, async (req, res) => {
  try {
    const listingId = req.params.id;
    const viewerId = req.userId || null;

    const { data: row } = await supabaseAdmin
      .from('listings').select('view_count, seller_id').eq('id', listingId).maybeSingle();

    const next = (parseInt(row?.view_count) || 0) + 1;
    await supabaseAdmin.from('listings').update({ view_count: next }).eq('id', listingId);

    const sellerId = row?.seller_id;

    // Notify seller — skip self-views, throttle to max 1 notification per viewer per listing per 1 hour
    if (sellerId && String(viewerId) !== String(sellerId)) {
      const actionPath = viewerId ? `/profile/${viewerId}` : `/listing/${listingId}`;
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { data: alreadyNotified } = await supabaseAdmin
        .from('notifications')
        .select('id')
        .eq('user_id', sellerId)
        .eq('type', 'offer_view')
        .eq('action', actionPath)
        .gte('created_at', oneHourAgo)
        .maybeSingle();

      if (!alreadyNotified) {
        let viewerLabel = 'Someone';
        let viewerProfilePath = null;
        if (viewerId) {
          const { data: vUser } = await supabaseAdmin
            .from('users').select('username').eq('id', viewerId).maybeSingle();
          if (vUser?.username) {
            viewerLabel = vUser.username;
            viewerProfilePath = `/profile/${viewerId}`;
          }
        }
        await createNotification(
          sellerId, 'offer_view',
          '👀 Someone Viewed Your Offer',
          `${viewerLabel} just viewed your offer`,
          viewerProfilePath || `/listing/${listingId}`
        );
      }
    }

    res.json({ success: true, views: next });
  } catch (e) {
    console.error('[listings/view] error:', e.message);
    res.json({ success: false, error: e.message });
  }
});

app.patch('/api/listings/:id/status', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    if (!status) return res.status(400).json({ error: 'Status is required' });
    const validStatuses = ['ACTIVE', 'PAUSED', 'CLOSED', 'DELETED'];
    if (!validStatuses.includes(status)) return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });

    const { data: listing, error: findError } = await supabaseAdmin
      .from('listings')
      .select('seller_id, listing_type, asset, min_limit_usd, bitcoin_price')
      .eq('id', id).single();

    if (findError || !listing) return res.status(404).json({ error: 'Listing not found' });
    if (listing.seller_id !== req.userId) return res.status(403).json({ error: 'Unauthorized' });


    // Reactivating a SELL / SELL_BITCOIN / BUY_GIFT_CARD offer still requires >= $10 of the
    // offer's asset — otherwise a user could bypass the wallet-balance requirement just by
    // clicking "Activate" on a listing the balance sweep had already paused.
    const btcRequiredTypes = ['SELL', 'SELL_BITCOIN', 'BUY_GIFT_CARD'];
    if (status === 'ACTIVE' && btcRequiredTypes.includes(listing.listing_type)) {
      const { data: wallet } = await supabaseAdmin
        .from('wallets').select('balance_btc, balance_usdt').eq('user_id', req.userId).maybeSingle();
      const balUsd = listing.asset === 'USDT'
        ? parseFloat(wallet?.balance_usdt || 0)
        : parseFloat(wallet?.balance_btc || 0) * 88000;
      if (balUsd < 10) {
        return res.status(400).json({
          error: `You need at least $10 worth of ${listing.asset || 'BTC'} in your PRAQEN wallet to activate this offer. Please load your wallet first.`,
        });
      }
    }

    const { data, error } = await supabaseAdmin
      .from('listings').update({ status, updated_at: new Date().toISOString() }).eq('id', id).select().single();
    if (error) return res.status(400).json({ error: error.message });
    bustCache();
    res.json({ success: true, listing: data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET all active offers for the market — reads from listings (canonical table)
app.get('/api/offers', async (req, res) => {
  try {
    const { type, country, asset, limit = 100 } = req.query;
    const cacheKey = `offers|${type || 'all'}|${country || 'all'}|${asset || 'all'}|${limit}`;
    const hit = getCached(cacheKey);
    if (hit) return res.json({ success: true, offers: hit });

    const typeMap = { sell: 'SELL', sell_bitcoin: 'SELL_BITCOIN', buy: 'BUY', buy_bitcoin: 'BUY_BITCOIN', gc_buy: 'BUY_GIFT_CARD', gc_sell: 'SELL_GIFT_CARD' };
    const listingTypeFilter = type ? (typeMap[type.toLowerCase()] || type.toUpperCase()) : null;
    const assetFilter = asset ? asset.toUpperCase() : null;

    let query = supabaseAdmin
      .from('listings')
      .select('*')
      .eq('status', 'ACTIVE');

    if (listingTypeFilter) query = query.eq('listing_type', listingTypeFilter);
    if (country) query = query.eq('country', country);
    if (assetFilter) query = query.eq('asset', assetFilter);

    const { data: listings, error } = await query
      .order('created_at', { ascending: false })
      .limit(parseInt(limit));

    if (error) throw error;

    const userIds = [...new Set((listings || []).map(l => l.seller_id).filter(Boolean))];

    if (userIds.length === 0) { setCached(cacheKey, []); return res.json({ success: true, offers: [] }); }

    let { data: users, error: userError } = await supabaseAdmin
      .from('users')
      .select('id, username, full_name, name_display, hide_full_name, badge, country, country_name, city, total_trades, positive_feedback, negative_feedback, average_rating, avatar_url, last_seen_at, last_login, completion_rate')
      .in('id', userIds);

    if (userError) {
      // Retry without unmigrated columns
      console.warn('[offers] Retrying users select without optional columns:', userError.message);
      ({ data: users, error: userError } = await supabaseAdmin
        .from('users')
        .select('id, username, full_name, badge, country, total_trades, positive_feedback, negative_feedback, average_rating, avatar_url, last_seen_at, last_login, completion_rate')
        .in('id', userIds));
      if (userError) throw userError;
    }

    const userMap = Object.fromEntries((users || []).map(u => [u.id, {
      ...u,
      display_name: computeDisplayName(u),
      country: u.country || null,
    }]));

    // Fetch balances for SELL offer owners so we can hide low-balance offers
    const sellSellerIds = [...new Set(
      (listings || [])
        .filter(l => l.listing_type === 'SELL' || l.listing_type === 'SELL_BITCOIN')
        .map(l => l.seller_id)
    )];
    let balMap = {};
    let usdtBalMap = {};
    if (sellSellerIds.length > 0) {
      const { data: walBals } = await supabaseAdmin
        .from('wallets').select('user_id, balance_btc, balance_usdt').in('user_id', sellSellerIds);
      (walBals || []).forEach(b => {
        balMap[b.user_id] = parseFloat(b.balance_btc || 0);
        usdtBalMap[b.user_id] = parseFloat(b.balance_usdt || 0);
      });
    }

    const offers = (listings || [])
      .filter(l => {
        // Hide SELL offers where seller has < $10 worth of the offer's asset — offer stays
        // ACTIVE in DB and reappears automatically once they top up their wallet.
        if (l.listing_type !== 'SELL' && l.listing_type !== 'SELL_BITCOIN') return true;
        if ((l.asset || 'BTC') === 'USDT') {
          return (usdtBalMap[l.seller_id] || 0) >= 10; // 1 USDT ≈ $1
        }
        const sellerBtc = balMap[l.seller_id] || 0;
        const btcPriceVal = parseFloat(l.bitcoin_price) || 88000;
        return sellerBtc * btcPriceVal >= 10;
      })
      .map(l => ({
        ...l,
        type: (l.listing_type || '').toLowerCase(),
        user_id: l.seller_id,
        seller_balance_btc: balMap[l.seller_id] || undefined,
        seller_balance_usdt: usdtBalMap[l.seller_id] || undefined,
        users: userMap[l.seller_id] || null,
      }));

    setCached(cacheKey, offers);
    res.json({ success: true, offers });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single offer by ID — reads from listings (canonical table)
app.get('/api/offers/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { data: offer, error: offerError } = await supabaseAdmin
      .from('listings')
      .select('*')
      .eq('id', id)
      .single();

    if (offerError || !offer) {
      return res.status(404).json({ error: 'Offer not found' });
    }

    const { data: seller } = await supabaseAdmin
      .from('users')
      .select('id, username, badge, country, average_rating, total_trades, completion_rate, avatar_url, created_at, total_feedback_count, positive_feedback, negative_feedback, last_login, last_seen_at, is_id_verified, is_email_verified, is_phone_verified, bio')
      .eq('id', offer.seller_id)
      .single();

    res.json({ offer: { ...offer, type: (offer.listing_type || '').toLowerCase(), user_id: offer.seller_id, seller } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Track offer views — fires when ProfileModal opens in BuyBitcoin/SellBitcoin
app.post('/api/offers/:id/view', optionalAuth, async (req, res) => {
  try {
    const listingId = req.params.id;
    const viewerId = req.userId || null;

    const { data: row } = await supabaseAdmin
      .from('listings').select('view_count, seller_id').eq('id', listingId).maybeSingle();

    const next = (parseInt(row?.view_count) || 0) + 1;
    await supabaseAdmin.from('listings').update({ view_count: next }).eq('id', listingId);

    const sellerId = row?.seller_id;

    // Notify seller — skip self-views, throttle to max 1 notification per viewer per listing per 1 hour
    if (sellerId && String(viewerId) !== String(sellerId)) {
      const actionPath = viewerId ? `/profile/${viewerId}` : `/listing/${listingId}`;
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { data: alreadyNotified } = await supabaseAdmin
        .from('notifications')
        .select('id')
        .eq('user_id', sellerId)
        .eq('type', 'offer_view')
        .eq('action', actionPath)
        .gte('created_at', oneHourAgo)
        .maybeSingle();

      if (!alreadyNotified) {
        let viewerLabel = 'Someone';
        let viewerProfilePath = null;
        if (viewerId) {
          const { data: vUser } = await supabaseAdmin
            .from('users').select('username').eq('id', viewerId).maybeSingle();
          if (vUser?.username) {
            viewerLabel = vUser.username;
            viewerProfilePath = `/profile/${viewerId}`;
          }
        }
        await createNotification(
          sellerId, 'offer_view',
          '👀 Someone Viewed Your Offer',
          `${viewerLabel} just viewed your offer`,
          viewerProfilePath || `/listing/${listingId}`
        );
      }
    }

    res.json({ success: true, views: next });
  } catch (e) {
    console.error('[offers/view] error:', e.message);
    res.json({ success: false });
  }
});

// POST create new offer
app.post('/api/offers', verifyToken, async (req, res) => {
  try {
    const {
      type,
      amount_usd,
      bitcoin_price,
      payment_method,
      country,
      min_amount,
      max_amount,
      margin,
      listing_type,
      gift_card_brand,
      currency,
      currency_symbol,
      min_limit_usd,
      max_limit_usd,
      min_limit_local,
      max_limit_local,
      pricing_type,
      time_limit,
      trade_instructions,
      listing_terms,
      description,
      card_values,
      card_type,
      gift_card_currencies,
      asset
    } = req.body;

    const userId = req.userId;
    const offerAsset = asset === 'USDT' ? 'USDT' : 'BTC';

    // Validation: check required fields
    if (!type && !listing_type) {
      return res.status(400).json({ error: 'Missing offer type (type or listing_type)' });
    }

    // Determine listing type early — gift card offers don't have a
    // traditional payment_method (the "payment" is the gift card code
    // itself), so the check below must not apply to them.
    const offerTypeMap = { 'sell': 'SELL', 'buy': 'BUY', 'gc_buy': 'BUY_GIFT_CARD', 'gc_sell': 'SELL_GIFT_CARD' };
    const mappedType = offerTypeMap[type] || listing_type || 'SELL';
    const isGiftCard = mappedType === 'BUY_GIFT_CARD' || mappedType === 'SELL_GIFT_CARD';

    if (!isGiftCard && !payment_method) {
      return res.status(400).json({ error: 'Missing payment_method' });
    }

    // Security deposit requirement temporarily disabled to grow the pool of
    // gift-card sellers. Was: sellers needed an active, never-seized $200 USDT
    // deposit before listing a gift card for sale. Re-enable by restoring the
    // check below (see git history for the original block).
    // if (mappedType === 'SELL_GIFT_CARD') { ... }

    // Verify user has at least 1 verification
    const { data: listingUser, error: listingUserErr } = await supabaseAdmin
      .from('users').select('is_email_verified, is_phone_verified, is_id_verified, phone')
      .eq('id', userId).single();

    let hasEmail = false, hasPhone = false, hasKyc = false;
    if (listingUserErr) {
      const { data: safeUser } = await supabaseAdmin
        .from('users').select('is_email_verified, is_id_verified, phone')
        .eq('id', userId).single();
      hasEmail = !!(safeUser?.is_email_verified);
      hasKyc = !!(safeUser?.is_id_verified);
      hasPhone = !!(safeUser?.phone);
    } else {
      hasEmail = !!(listingUser?.is_email_verified);
      hasPhone = !!(listingUser?.is_phone_verified || listingUser?.phone);
      hasKyc = !!(listingUser?.is_id_verified);
    }
    // Email verification is the only requirement to create offers.
    // Phone is optional (unlocks higher trade limits when added).
    if (!hasEmail) {
      return res.status(403).json({
        error: 'Please verify your email address to create offers.',
        requireVerification: 'email',
      });
    }

    const verifCount = [hasEmail, hasPhone, hasKyc].filter(Boolean).length;

    // Enforce $10 USD minimum trade limit for non-gift-card offers
    if (!isGiftCard && parseFloat(min_limit_usd || 0) < 10) {
      return res.status(400).json({ error: 'Minimum trade amount must be at least $10 USD.' });
    }

    // Default gift_card_brand for non-GC offers (column is NOT NULL in schema)
    const brandDefault = mappedType === 'SELL' ? 'Sell Bitcoin' : mappedType === 'BUY' ? 'Buy Bitcoin' : '';
    const cur = currency || 'USD';
    const curSym = currency_symbol || (cur === 'GHS' ? '₵' : cur === 'NGN' ? '₦' : cur === 'EUR' ? '€' : cur === 'GBP' ? '£' : '$');

    // SELL / SELL_BITCOIN / BUY_GIFT_CARD offers all require the seller to already hold
    // >= $10 of the offer's asset — SELL offers deliver BTC straight from this balance,
    // and BUY_GIFT_CARD offers lock BTC in escrow to pay the gift-card seller.
    if (mappedType === 'SELL' || mappedType === 'SELL_BITCOIN' || mappedType === 'BUY_GIFT_CARD') {
      const { data: sellerWallet } = await supabaseAdmin
        .from('wallets').select('balance_btc, balance_usdt').eq('user_id', userId).maybeSingle();
      const sellerBalUsd = offerAsset === 'USDT'
        ? parseFloat(sellerWallet?.balance_usdt || 0) // 1 USDT ≈ $1
        : parseFloat(sellerWallet?.balance_btc || 0) * (_btcCache || 88000); // live price — must match offerStatusService's sweep or a newly-created offer can fail its own check minutes later

      if (sellerBalUsd < 10) {
        return res.status(400).json({
          error: `You need at least $10 worth of ${offerAsset} in your PRAQEN wallet to create this offer. Please top up your wallet first.`,
        });
      }
      if (parseFloat(max_limit_usd) > sellerBalUsd && sellerBalUsd > 0) {
        return res.status(400).json({
          error: `Maximum trade limit ($${parseFloat(max_limit_usd).toFixed(0)}) exceeds your wallet balance ($${sellerBalUsd.toFixed(0)}). Please top up or lower the maximum.`,
        });
      }
      // The balance sync sweep (offerStatusService.syncAllOfferStatuses) pauses any ACTIVE
      // offer whose min_limit_usd exceeds the seller's balance — this was previously only
      // checked against max_limit_usd here, so an offer could pass creation with a minimum
      // above the seller's balance and then get auto-paused minutes later with no warning.
      if (parseFloat(min_limit_usd) > sellerBalUsd) {
        return res.status(400).json({
          error: `Minimum trade amount ($${parseFloat(min_limit_usd).toFixed(0)}) exceeds your wallet balance ($${sellerBalUsd.toFixed(0)}). Please top up or lower the minimum.`,
        });
      }
    }

    // Block duplicate active offers: same payment method + same currency + same asset + same type (skip gift cards)
    if (mappedType !== 'BUY_GIFT_CARD' && mappedType !== 'SELL_GIFT_CARD') {
      const { data: dupCheck2 } = await supabaseAdmin
        .from('listings')
        .select('id')
        .eq('seller_id', userId)
        .eq('payment_method', payment_method)
        .eq('listing_type', mappedType)
        .eq('currency', currency || 'USD')
        .eq('asset', offerAsset)
        .eq('status', 'ACTIVE')
        .limit(1);
      if (dupCheck2 && dupCheck2.length > 0) {
        return res.status(400).json({
          error: `You already have an active ${offerAsset} ${mappedType} offer for ${payment_method} in ${currency || 'USD'}. Edit it from your Dashboard instead.`,
        });
      }
    }

    // Create offer in listings table (single source of truth for all marketplace pages)
    const { data, error } = await supabaseAdmin
      .from('listings')
      .insert({
        seller_id: userId,
        listing_type: mappedType,
        asset: offerAsset,
        gift_card_brand: gift_card_brand || brandDefault,
        status: 'ACTIVE',
        bitcoin_price: bitcoin_price || 88000,
        margin: margin || 0,
        pricing_type: pricing_type || 'market',
        currency: cur,
        currency_symbol: curSym,
        country: country || 'GH',
        payment_method: payment_method,
        amount_usd: amount_usd || min_limit_usd || 100,
        min_limit_usd: min_limit_usd || amount_usd || 10,
        max_limit_usd: max_limit_usd || amount_usd || 100000,
        min_limit_local: min_limit_local || 10,
        max_limit_local: max_limit_local || 100000,
        time_limit: time_limit || 30,
        trade_instructions: trade_instructions || description || '',
        listing_terms: listing_terms || '',
        card_values: Array.isArray(card_values) && card_values.length > 0 ? card_values.map(Number) : null,
        card_type: card_type || 'both',
        face_value: Array.isArray(card_values) && card_values[0] ? parseFloat(card_values[0]) : null,
        gift_card_currencies: Array.isArray(gift_card_currencies) && gift_card_currencies.length > 0 ? gift_card_currencies : null,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error('Offer creation error:', error);
      return res.status(500).json({ error: error.message });
    }

    bustCache();
    res.json({ success: true, offer: data, listing: data });
  } catch (err) {
    console.error('Offer creation exception:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// SELLER SECURITY DEPOSIT ROUTES
// One-time $200 USDT deposit required before a user can list gift
// cards for sale. Covers unlimited SELL_GIFT_CARD listings/trades
// while LOCKED. Withdrawal requires 7 days elapsed + no open
// gift-card trades + admin approval. Admins may seize (partially or
// fully) a LOCKED deposit to make a scammed buyer whole.
// ============================================================

const SELLER_DEPOSIT_AMOUNT = 200;
const SELLER_DEPOSIT_HOLD_DAYS = 7;
const OPEN_TRADE_STATUSES = ['CREATED', 'FUNDS_LOCKED', 'PAYMENT_SENT', 'DISPUTED'];

// Count this seller's open/disputed trades tied to SELL_GIFT_CARD listings.
async function countOpenGiftCardSales(userId) {
  const { data: trades } = await supabaseAdmin
    .from('trades')
    .select('id, status, listing:listing_id(listing_type)')
    .eq('seller_id', userId)
    .in('status', OPEN_TRADE_STATUSES);
  return (trades || []).filter(t => t.listing?.listing_type === 'SELL_GIFT_CARD').length;
}

// Pause a seller's live SELL_GIFT_CARD listings — called whenever their
// deposit stops being LOCKED-and-clean, so buyers can't trade against an
// offer that's no longer backed by a security deposit.
async function pauseGiftCardListings(userId) {
  try {
    await supabaseAdmin.from('listings')
      .update({ status: 'PAUSED', updated_at: new Date().toISOString() })
      .eq('seller_id', userId)
      .eq('listing_type', 'SELL_GIFT_CARD')
      .eq('status', 'ACTIVE');
    bustCache();
  } catch (e) {
    console.error('[seller-deposit] failed to pause listings for', userId, e.message);
  }
}

// POST /api/seller-deposit/lock — lock $200 USDT from the user's own wallet balance
app.post('/api/seller-deposit/lock', verifyToken, async (req, res) => {
  try {
    const userId = req.userId;

    const { data: existing } = await supabaseAdmin
      .from('seller_deposits').select('id')
      .eq('user_id', userId).in('status', ['PENDING_APPROVAL', 'LOCKED', 'PENDING_WITHDRAWAL']).maybeSingle();
    if (existing) {
      return res.status(400).json({ error: 'You already have an active or pending security deposit.' });
    }

    const { data: wallet } = await supabaseAdmin
      .from('wallets').select('balance_usdt, locked_balance_usdt').eq('user_id', userId).maybeSingle();
    const available = parseFloat(wallet?.balance_usdt || 0);
    const lockedAvailable = parseFloat(wallet?.locked_balance_usdt || 0);

    if (available < SELLER_DEPOSIT_AMOUNT) {
      return res.status(400).json({
        error: `You need $${SELLER_DEPOSIT_AMOUNT} USDT in your wallet to lock a seller security deposit.`,
        code: 'INSUFFICIENT_BALANCE',
        available,
        shortfall: parseFloat((SELLER_DEPOSIT_AMOUNT - available).toFixed(6)),
      });
    }

    // Insert the deposit row first — the partial unique index polices concurrent
    // lock attempts cheaply, before any money moves.
    const nowIso = new Date().toISOString();
    const eligibleAt = new Date(Date.now() + SELLER_DEPOSIT_HOLD_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const { data: depositRow, error: insertErr } = await supabaseAdmin
      .from('seller_deposits')
      .insert({
        user_id: userId,
        amount_usdt: SELLER_DEPOSIT_AMOUNT,
        remaining_amount: SELLER_DEPOSIT_AMOUNT,
        status: 'PENDING_APPROVAL',
        locked_at: nowIso,
        eligible_at: eligibleAt,
      })
      .select().single();

    if (insertErr) {
      // Unique-index violation = a concurrent request already locked/pending a deposit for this user
      return res.status(409).json({ error: 'You already have an active or pending security deposit.' });
    }

    const { data: deductRows, error: deductErr } = await supabaseAdmin.from('wallets')
      .update({
        balance_usdt: parseFloat((available - SELLER_DEPOSIT_AMOUNT).toFixed(6)),
        locked_balance_usdt: parseFloat((lockedAvailable + SELLER_DEPOSIT_AMOUNT).toFixed(6)),
        updated_at: nowIso,
      })
      .eq('user_id', userId)
      .eq('balance_usdt', available)
      .eq('locked_balance_usdt', lockedAvailable)
      .select('balance_usdt, locked_balance_usdt');

    if (deductErr || !deductRows || deductRows.length === 0) {
      // Wallet changed under us — roll back the deposit row we just inserted
      await supabaseAdmin.from('seller_deposits').delete().eq('id', depositRow.id);
      return res.status(409).json({ error: 'Balance changed — please retry.' });
    }

    await supabaseAdmin.from('wallet_transactions').insert({
      user_id: userId,
      type: 'SECURITY_DEPOSIT_LOCK',
      currency: 'USDT',
      amount_usdt: SELLER_DEPOSIT_AMOUNT,
      status: 'CONFIRMED',
      notes: 'Gift-card seller security deposit locked — pending admin review',
      created_at: nowIso,
    }).then(null, e => console.error('[seller-deposit/lock] ledger insert failed (non-fatal):', e.message));

    supabaseAdmin.from('notifications').insert({
      user_id: userId,
      type: 'wallet',
      title: '⏳ Security Deposit Pending Review',
      message: `Your $${SELLER_DEPOSIT_AMOUNT} USDT security deposit has been locked and is awaiting admin approval. We'll notify you once you're cleared to sell gift cards.`,
      action: '/wallet',
      is_read: false,
      created_at: nowIso,
    }).then(null, () => {});

    res.json({ success: true, deposit: depositRow, wallet: deductRows[0] });
  } catch (err) {
    console.error('[seller-deposit/lock] error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/seller-deposit/status — single source of truth for deposit/eligibility state
app.get('/api/seller-deposit/status', verifyToken, async (req, res) => {
  try {
    const userId = req.userId;
    const { data: deposit } = await supabaseAdmin
      .from('seller_deposits').select('*')
      .eq('user_id', userId).in('status', ['PENDING_APPROVAL', 'LOCKED', 'PENDING_WITHDRAWAL'])
      .order('created_at', { ascending: false }).limit(1).maybeSingle();

    // Deposit requirement temporarily disabled (see /api/listings POST handler) —
    // can_create_sell_listing is always true so sellers aren't blocked from listing.
    if (!deposit) {
      return res.json({ has_deposit: false, can_create_sell_listing: true, pending_admin_approval: false });
    }

    const isClean = parseFloat(deposit.remaining_amount) === parseFloat(deposit.amount_usdt);
    const timeEligible = new Date(deposit.eligible_at).getTime() <= Date.now();
    const openTradeCount = await countOpenGiftCardSales(userId);
    const eligibleToWithdraw = deposit.status === 'LOCKED' && timeEligible && openTradeCount === 0;
    const daysRemaining = Math.max(0, Math.ceil((new Date(deposit.eligible_at).getTime() - Date.now()) / 86400000));

    res.json({
      has_deposit: true,
      can_create_sell_listing: true,
      pending_admin_approval: deposit.status === 'PENDING_APPROVAL',
      deposit,
      eligible_to_withdraw: eligibleToWithdraw,
      days_remaining: daysRemaining,
      open_trade_count: openTradeCount,
    });
  } catch (err) {
    console.error('[seller-deposit/status] error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/seller-deposit/withdraw-request — request release; does not move funds.
// Eligibility (7 days + no open trades) is auto-checked; actual release requires
// admin approval via /api/admin/seller-deposits/:userId/approve-withdrawal.
app.post('/api/seller-deposit/withdraw-request', verifyToken, async (req, res) => {
  try {
    const userId = req.userId;
    const { data: deposit } = await supabaseAdmin
      .from('seller_deposits').select('*').eq('user_id', userId).eq('status', 'LOCKED').maybeSingle();

    if (!deposit) {
      return res.status(400).json({ error: 'No active deposit to withdraw.' });
    }
    if (new Date(deposit.eligible_at).getTime() > Date.now()) {
      return res.status(403).json({
        error: 'Your deposit unlocks 7 days after it was locked.',
        code: 'DEPOSIT_TIME_LOCK',
        eligible_at: deposit.eligible_at,
      });
    }
    const openTradeCount = await countOpenGiftCardSales(userId);
    if (openTradeCount > 0) {
      return res.status(403).json({
        error: 'You have open gift-card trades — withdraw once they finish.',
        code: 'DEPOSIT_TRADES_OPEN',
        open_trade_count: openTradeCount,
      });
    }

    const { data: rows, error } = await supabaseAdmin.from('seller_deposits')
      .update({ status: 'PENDING_WITHDRAWAL', withdrawal_requested_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', deposit.id).eq('status', 'LOCKED')
      .select().single();

    if (error || !rows) {
      return res.status(409).json({ error: 'Deposit state changed — please retry.' });
    }

    res.json({ success: true, deposit: rows, message: 'Withdrawal requested — awaiting admin approval.' });
  } catch (err) {
    console.error('[seller-deposit/withdraw-request] error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/seller-deposits — list all deposits + running total locked
app.get('/api/admin/seller-deposits', verifyToken, async (req, res) => {
  try {
    const admin = await requireFullAdmin(req, res); if (!admin) return;

    const statusFilter = req.query.status;
    let query = supabaseAdmin.from('seller_deposits')
      .select('*, user:user_id(id, username, email, badge)')
      .order('created_at', { ascending: false });
    if (statusFilter) query = query.eq('status', statusFilter);

    const { data: deposits, error } = await query;
    if (error) return res.status(500).json({ error: error.message });

    const totalLocked = (deposits || [])
      .filter(d => d.status === 'LOCKED' || d.status === 'PENDING_WITHDRAWAL')
      .reduce((sum, d) => sum + parseFloat(d.remaining_amount || 0), 0);

    res.json({ success: true, deposits: deposits || [], total_locked_usdt: totalLocked });
  } catch (err) {
    console.error('[admin/seller-deposits] error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/team/seller-deposits/pending — new vendor deposits awaiting admin review.
// Open to the whole team (moderators included) so it's visible on the Team Dashboard;
// only full admins can actually approve/reject (see below).
app.get('/api/team/seller-deposits/pending', verifyToken, async (req, res) => {
  try {
    const t = await requireTeam(req, res); if (!t) return;

    const { data: deposits, error } = await supabaseAdmin
      .from('seller_deposits')
      .select('*, user:user_id(id, username, email, badge, country, avatar_url)')
      .eq('status', 'PENDING_APPROVAL')
      .order('locked_at', { ascending: true });
    if (error) return res.status(500).json({ error: error.message });

    res.json({ success: true, deposits: deposits || [] });
  } catch (err) {
    console.error('[team/seller-deposits/pending] error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/seller-deposits/:userId/approve-deposit — clears a newly-locked
// deposit for selling. Funds already left the wallet at lock time; this just flips
// PENDING_APPROVAL -> LOCKED so can_create_sell_listing turns true.
app.post('/api/admin/seller-deposits/:userId/approve-deposit', verifyToken, async (req, res) => {
  try {
    const admin = await requireFullAdmin(req, res); if (!admin) return;
    const targetUserId = req.params.userId;
    const nowIso = new Date().toISOString();

    const { data: rows, error } = await supabaseAdmin.from('seller_deposits')
      .update({ status: 'LOCKED', approved_at: nowIso, updated_at: nowIso })
      .eq('user_id', targetUserId).eq('status', 'PENDING_APPROVAL')
      .select().single();

    if (error || !rows) {
      return res.status(400).json({ error: 'No pending deposit approval for this user.' });
    }

    await logAdminAction(req, 'SELLER_DEPOSIT_APPROVED', targetUserId, { amount: rows.amount_usdt });

    supabaseAdmin.from('notifications').insert({
      user_id: targetUserId,
      type: 'wallet',
      title: '✅ Security Deposit Approved',
      message: `Your $${rows.amount_usdt} USDT security deposit has been approved. You can now create gift card offers.`,
      action: '/create-offer?type=gc_sell',
      is_read: false,
      created_at: nowIso,
    }).then(null, () => {});

    res.json({ success: true, deposit: rows });
  } catch (err) {
    console.error('[approve-deposit] error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/seller-deposits/:userId/reject-deposit — refunds the $200 back to
// the user's wallet (they never got to sell anything against it) and marks the row
// REJECTED so they can retry the lock later if they choose to.
app.post('/api/admin/seller-deposits/:userId/reject-deposit', verifyToken, async (req, res) => {
  try {
    const admin = await requireFullAdmin(req, res); if (!admin) return;
    const targetUserId = req.params.userId;
    const { reason } = req.body;

    const { data: deposit } = await supabaseAdmin
      .from('seller_deposits').select('*').eq('user_id', targetUserId).eq('status', 'PENDING_APPROVAL').maybeSingle();
    if (!deposit) {
      return res.status(400).json({ error: 'No pending deposit approval for this user.' });
    }

    const { data: wallet } = await supabaseAdmin
      .from('wallets').select('balance_usdt, locked_balance_usdt').eq('user_id', targetUserId).maybeSingle();
    const available = parseFloat(wallet?.balance_usdt || 0);
    const lockedAvailable = parseFloat(wallet?.locked_balance_usdt || 0);
    const refundAmount = parseFloat(deposit.remaining_amount);
    const nowIso = new Date().toISOString();

    const { data: updRows, error: updErr } = await supabaseAdmin.from('wallets')
      .update({
        balance_usdt: parseFloat((available + refundAmount).toFixed(6)),
        locked_balance_usdt: Math.max(0, parseFloat((lockedAvailable - refundAmount).toFixed(6))),
        updated_at: nowIso,
      })
      .eq('user_id', targetUserId)
      .eq('balance_usdt', available)
      .eq('locked_balance_usdt', lockedAvailable)
      .select('balance_usdt, locked_balance_usdt');

    if (updErr || !updRows || updRows.length === 0) {
      return res.status(409).json({ error: 'Wallet balance changed — please retry.' });
    }

    await supabaseAdmin.from('seller_deposits')
      .update({ status: 'REJECTED', rejected_at: nowIso, admin_notes: reason || null, updated_at: nowIso })
      .eq('id', deposit.id);

    await supabaseAdmin.from('wallet_transactions').insert({
      user_id: targetUserId,
      type: 'SECURITY_DEPOSIT_REJECTED',
      currency: 'USDT',
      amount_usdt: refundAmount,
      status: 'CONFIRMED',
      notes: reason ? `Seller security deposit rejected: ${reason}` : 'Seller security deposit rejected — refunded',
      created_at: nowIso,
    }).then(null, e => console.error('[reject-deposit] ledger insert failed (non-fatal):', e.message));

    await logAdminAction(req, 'SELLER_DEPOSIT_REJECTED', targetUserId, { amount: refundAmount, reason });

    supabaseAdmin.from('notifications').insert({
      user_id: targetUserId,
      type: 'wallet',
      title: '❌ Security Deposit Rejected',
      message: reason
        ? `Your $${refundAmount} USDT security deposit was rejected and refunded to your wallet. Reason: ${reason}`
        : `Your $${refundAmount} USDT security deposit was rejected and refunded to your wallet.`,
      action: '/wallet',
      is_read: false,
      created_at: nowIso,
    }).then(null, () => {});

    res.json({ success: true, amount_refunded: refundAmount, wallet: updRows[0] });
  } catch (err) {
    console.error('[reject-deposit] error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/seller-deposits/:userId/approve-withdrawal
app.post('/api/admin/seller-deposits/:userId/approve-withdrawal', verifyToken, async (req, res) => {
  try {
    const admin = await requireFullAdmin(req, res); if (!admin) return;
    const targetUserId = req.params.userId;

    const { data: deposit } = await supabaseAdmin
      .from('seller_deposits').select('*').eq('user_id', targetUserId).eq('status', 'PENDING_WITHDRAWAL').maybeSingle();
    if (!deposit) {
      return res.status(400).json({ error: 'No pending withdrawal request for this user.' });
    }

    const { data: wallet } = await supabaseAdmin
      .from('wallets').select('balance_usdt, locked_balance_usdt').eq('user_id', targetUserId).maybeSingle();
    const available = parseFloat(wallet?.balance_usdt || 0);
    const lockedAvailable = parseFloat(wallet?.locked_balance_usdt || 0);
    const releaseAmount = parseFloat(deposit.remaining_amount);
    const nowIso = new Date().toISOString();

    const { data: updRows, error: updErr } = await supabaseAdmin.from('wallets')
      .update({
        balance_usdt: parseFloat((available + releaseAmount).toFixed(6)),
        locked_balance_usdt: Math.max(0, parseFloat((lockedAvailable - releaseAmount).toFixed(6))),
        updated_at: nowIso,
      })
      .eq('user_id', targetUserId)
      .eq('balance_usdt', available)
      .eq('locked_balance_usdt', lockedAvailable)
      .select('balance_usdt, locked_balance_usdt');

    if (updErr || !updRows || updRows.length === 0) {
      return res.status(409).json({ error: 'Wallet balance changed — please retry.' });
    }

    await supabaseAdmin.from('seller_deposits')
      .update({ status: 'WITHDRAWN', withdrawn_at: nowIso, updated_at: nowIso })
      .eq('id', deposit.id);

    await supabaseAdmin.from('wallet_transactions').insert({
      user_id: targetUserId,
      type: 'SECURITY_DEPOSIT_RELEASE',
      currency: 'USDT',
      amount_usdt: releaseAmount,
      status: 'CONFIRMED',
      notes: `Seller security deposit released (approved by admin ${admin.email || req.userId})`,
      created_at: nowIso,
    }).then(null, e => console.error('[approve-withdrawal] ledger insert failed (non-fatal):', e.message));

    await logAdminAction(req, 'SELLER_DEPOSIT_WITHDRAWAL_APPROVED', targetUserId, { amount: releaseAmount });
    await pauseGiftCardListings(targetUserId);

    supabaseAdmin.from('notifications').insert({
      user_id: targetUserId,
      type: 'wallet',
      title: '✅ Security Deposit Released',
      message: `Your $${releaseAmount.toFixed(2)} USDT seller security deposit has been released to your wallet.`,
      action: '/wallet',
      is_read: false,
      created_at: nowIso,
    }).then(null, () => {});

    res.json({ success: true, amount_withdrawn: releaseAmount, wallet: updRows[0] });
  } catch (err) {
    console.error('[approve-withdrawal] error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/seller-deposits/:userId/reject-withdrawal — reverts to LOCKED, no funds move
app.post('/api/admin/seller-deposits/:userId/reject-withdrawal', verifyToken, async (req, res) => {
  try {
    const admin = await requireFullAdmin(req, res); if (!admin) return;
    const targetUserId = req.params.userId;
    const { reason } = req.body;

    const { data: rows, error } = await supabaseAdmin.from('seller_deposits')
      .update({ status: 'LOCKED', admin_notes: reason || null, updated_at: new Date().toISOString() })
      .eq('user_id', targetUserId).eq('status', 'PENDING_WITHDRAWAL')
      .select().single();

    if (error || !rows) {
      return res.status(400).json({ error: 'No pending withdrawal request for this user.' });
    }

    await logAdminAction(req, 'SELLER_DEPOSIT_WITHDRAWAL_REJECTED', targetUserId, { reason });
    res.json({ success: true, deposit: rows });
  } catch (err) {
    console.error('[reject-withdrawal] error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/seller-deposits/:userId/seize — move some/all of a LOCKED deposit
// to a wronged buyer, following a dispute resolved against this seller.
app.post('/api/admin/seller-deposits/:userId/seize', verifyToken, async (req, res) => {
  try {
    const admin = await requireFullAdmin(req, res); if (!admin) return;
    const targetUserId = req.params.userId;
    const { amount, trade_id, buyer_id, reason } = req.body;

    const seizeAmount = parseFloat(amount);
    if (!seizeAmount || seizeAmount <= 0) {
      return res.status(400).json({ error: 'Invalid seize amount.' });
    }
    if (!buyer_id) {
      return res.status(400).json({ error: 'buyer_id is required.' });
    }

    const { data: deposit } = await supabaseAdmin
      .from('seller_deposits').select('*').eq('user_id', targetUserId).eq('status', 'LOCKED').maybeSingle();
    if (!deposit) {
      return res.status(404).json({ error: 'No active deposit for this user.' });
    }
    if (seizeAmount > parseFloat(deposit.remaining_amount)) {
      return res.status(400).json({ error: `Cannot seize more than the remaining deposit ($${deposit.remaining_amount}).` });
    }

    const nowIso = new Date().toISOString();
    const newRemaining = parseFloat((parseFloat(deposit.remaining_amount) - seizeAmount).toFixed(6));
    const newStatus = newRemaining <= 0 ? 'SEIZED' : 'LOCKED';

    // Step 1: reduce the deposit row (optimistic lock on remaining_amount)
    const { data: depRows, error: depErr } = await supabaseAdmin.from('seller_deposits')
      .update({
        remaining_amount: newRemaining,
        seized_amount: parseFloat((parseFloat(deposit.seized_amount) + seizeAmount).toFixed(6)),
        seized_at: nowIso,
        status: newStatus,
        updated_at: nowIso,
      })
      .eq('id', deposit.id).eq('remaining_amount', deposit.remaining_amount)
      .select().single();
    if (depErr || !depRows) {
      return res.status(409).json({ error: 'Deposit changed — please retry.' });
    }

    // Step 2: debit seller's locked_balance_usdt
    const { data: sellerWallet } = await supabaseAdmin
      .from('wallets').select('locked_balance_usdt').eq('user_id', targetUserId).maybeSingle();
    const sellerLocked = parseFloat(sellerWallet?.locked_balance_usdt || 0);
    const { data: sellerRows, error: sellerErr } = await supabaseAdmin.from('wallets')
      .update({ locked_balance_usdt: Math.max(0, parseFloat((sellerLocked - seizeAmount).toFixed(6))), updated_at: nowIso })
      .eq('user_id', targetUserId).eq('locked_balance_usdt', sellerLocked)
      .select('locked_balance_usdt');

    if (sellerErr || !sellerRows || sellerRows.length === 0) {
      // Roll back step 1
      await supabaseAdmin.from('seller_deposits')
        .update({ remaining_amount: deposit.remaining_amount, seized_amount: deposit.seized_amount, status: deposit.status, updated_at: nowIso })
        .eq('id', deposit.id);
      return res.status(409).json({ error: 'Seller wallet changed — please retry.' });
    }

    // Step 3: credit buyer's balance_usdt — retry a couple times since this is a
    // low-traffic admin path; if it still fails, roll back steps 1 and 2, since
    // leaving the seller's money seized with no buyer credit is worse than not
    // seizing at all.
    let buyerCredited = false;
    let lastBuyerErr = null;
    for (let attempt = 0; attempt < 3 && !buyerCredited; attempt++) {
      const { data: buyerWallet } = await supabaseAdmin
        .from('wallets').select('balance_usdt').eq('user_id', buyer_id).maybeSingle();
      const buyerAvailable = parseFloat(buyerWallet?.balance_usdt || 0);
      const { data: buyerRows, error: buyerErr } = await supabaseAdmin.from('wallets')
        .update({ balance_usdt: parseFloat((buyerAvailable + seizeAmount).toFixed(6)), updated_at: nowIso })
        .eq('user_id', buyer_id).eq('balance_usdt', buyerAvailable)
        .select('balance_usdt');
      if (!buyerErr && buyerRows && buyerRows.length > 0) { buyerCredited = true; break; }
      lastBuyerErr = buyerErr;
    }

    if (!buyerCredited) {
      console.error('[seize] CRITICAL: buyer credit failed after retries, rolling back seller-side mutations:', lastBuyerErr?.message);
      await supabaseAdmin.from('wallets')
        .update({ locked_balance_usdt: sellerLocked, updated_at: nowIso }).eq('user_id', targetUserId);
      await supabaseAdmin.from('seller_deposits')
        .update({ remaining_amount: deposit.remaining_amount, seized_amount: deposit.seized_amount, status: deposit.status, updated_at: nowIso })
        .eq('id', deposit.id);
      return res.status(500).json({ error: 'Failed to credit buyer — seizure rolled back, please retry.' });
    }

    await Promise.all([
      supabaseAdmin.from('wallet_transactions').insert({
        user_id: targetUserId, trade_id: trade_id || null,
        type: 'SECURITY_DEPOSIT_SEIZED', currency: 'USDT', amount_usdt: seizeAmount,
        status: 'CONFIRMED', notes: reason || 'Security deposit seized following lost dispute', created_at: nowIso,
      }),
      supabaseAdmin.from('wallet_transactions').insert({
        user_id: buyer_id, trade_id: trade_id || null,
        type: 'SECURITY_DEPOSIT_CREDIT', currency: 'USDT', amount_usdt: seizeAmount,
        status: 'CONFIRMED', notes: reason || 'Credited from scammer seller security deposit', created_at: nowIso,
      }),
    ]).catch(e => console.error('[seize] ledger insert failed (non-fatal):', e.message));

    await logAdminAction(req, 'SELLER_DEPOSIT_SEIZE', targetUserId, { amount: seizeAmount, trade_id, buyer_id, reason });

    if (newStatus === 'SEIZED') {
      await pauseGiftCardListings(targetUserId);
    }

    Promise.all([
      supabaseAdmin.from('notifications').insert({
        user_id: targetUserId, type: 'wallet', title: '⚠️ Security Deposit Seized',
        message: `$${seizeAmount.toFixed(2)} USDT was seized from your security deposit following a resolved dispute.${newStatus === 'SEIZED' ? ' Your gift-card listings are paused until you relock a fresh $200 deposit.' : ''}`,
        action: '/wallet', is_read: false, created_at: nowIso,
      }),
      supabaseAdmin.from('notifications').insert({
        user_id: buyer_id, type: 'wallet', title: '✅ Dispute Refund Credited',
        message: `$${seizeAmount.toFixed(2)} USDT was credited to your wallet from the seller's security deposit.`,
        action: '/wallet', is_read: false, created_at: nowIso,
      }),
    ]).catch(() => {});

    res.json({ success: true, seized_amount: seizeAmount, remaining_deposit: newRemaining, deposit_status: newStatus });
  } catch (err) {
    console.error('[seize] error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Debug endpoints
app.get('/api/debug/listings', async (req, res) => {
  try {
    const { data } = await supabaseAdmin.from('listings')
      .select('id,listing_type,gift_card_brand,margin,currency,currency_symbol,payment_method,min_limit_local,max_limit_local,min_limit_usd,max_limit_usd,time_limit,bitcoin_price,status,created_at')
      .order('created_at', { ascending: false }).limit(10);
    res.json({ count: data?.length, listings: data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/debug/update-feedback/:username', async (req, res) => {
  try {
    const { positive_feedback, negative_feedback } = req.body;
    const { data, error } = await supabaseAdmin.from('users').update({
      positive_feedback: positive_feedback || 0, negative_feedback: negative_feedback || 0,
      total_feedback_count: (positive_feedback || 0) + (negative_feedback || 0)
    }).eq('username', req.params.username).select('id, username, positive_feedback, negative_feedback, total_feedback_count').single();
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true, user: data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// TRADES ROUTES
// ============================================================

app.get('/api/my-trades', verifyToken, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 30);
    const offset = (page - 1) * limit;

    const { data, error, count } = await supabaseAdmin.from('trades')
      .select(
        `id, status, trade_type, trade_ref, amount_btc, amount_usd, amount_local,
         local_currency, currency_symbol, payment_method, gift_card_brand,
         buyer_id, seller_id, created_at, expires_at, completed_at, cancelled_at,
         buyer_confirmed, cancel_reason,
         listing:listing_id(id, listing_type, gift_card_brand, payment_method, time_limit, currency, currency_symbol),
         buyer:buyer_id(id, username, avatar_url, badge, total_trades, completion_rate, positive_feedback, negative_feedback, last_login, last_seen_at, country),
         seller:seller_id(id, username, avatar_url, badge, total_trades, completion_rate, positive_feedback, negative_feedback, last_login, last_seen_at, country)`,
        { count: 'exact' }
      )
      .or(`buyer_id.eq.${req.userId},seller_id.eq.${req.userId}`)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) return res.status(400).json({ error: error.message });
    res.json({ trades: data || [], total: count || 0, page, limit });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/trades/active', verifyToken, async (req, res) => {
  try {
    const { data: trades, error } = await supabaseAdmin
      .from('trades')
      .select(`*, listing:listing_id(id, time_limit, payment_method, listing_type, gift_card_brand), buyer:buyer_id(id, username, badge, completion_rate, positive_feedback, negative_feedback, country, avatar_url, total_trades, average_rating), seller:seller_id(id, username, badge, completion_rate, positive_feedback, negative_feedback, country, avatar_url, total_trades, average_rating)`)
      .or(`buyer_id.eq.${req.userId},seller_id.eq.${req.userId}`)
      .in('status', ['CREATED', 'FUNDS_LOCKED', 'PAYMENT_SENT', 'DISPUTED'])
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) return res.status(400).json({ error: error.message });

    const ACTIVE_STATUSES = ['CREATED', 'FUNDS_LOCKED', 'PAYMENT_SENT', 'DISPUTED'];
    const activeTrades = (trades || []).filter(t => ACTIVE_STATUSES.includes(t.status));

    res.json({ success: true, trades: activeTrades, total: activeTrades.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const DB_TIMEOUT = (ms) => new Promise((_, reject) => setTimeout(() => reject(new Error('DB_TIMEOUT')), ms));

app.get('/api/trades/:id', verifyToken, async (req, res) => {
  try {
    // Step 1: fetch the trade row with a hard 8-second timeout
    let tradeResult;
    try {
      tradeResult = await Promise.race([
        supabaseAdmin.from('trades').select('*').eq('id', req.params.id).single(),
        DB_TIMEOUT(8000),
      ]);
    } catch (e) {
      if (e.message === 'DB_TIMEOUT') {
        console.warn('[GET /trades/:id] Supabase trade fetch timed out for id:', req.params.id);
        return res.status(503).json({ error: 'Database is slow — please retry in a moment' });
      }
      throw e;
    }

    const { data, error } = tradeResult;
    if (error || !data) {
      console.error('[GET /trades/:id] trade fetch error:', error?.message, 'id:', req.params.id);
      return res.status(404).json({ error: 'Trade not found' });
    }

    if (String(data.buyer_id) !== String(req.userId) && String(data.seller_id) !== String(req.userId)) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    // Step 2: fetch listing + buyer + seller in parallel — each capped at 5s, failures tolerated
    const USER_COLS = 'id, username, avatar_url, average_rating, total_trades, completion_rate, last_login, last_seen_at, badge, positive_feedback, negative_feedback, country';
    const timeout5s = () => new Promise(resolve => setTimeout(() => resolve({ data: null }), 5000));
    const [listingRes, buyerRes, sellerRes, reviewRes] = await Promise.allSettled([
      data.listing_id
        ? Promise.race([supabaseAdmin.from('listings').select('*').eq('id', data.listing_id).single(), timeout5s()])
        : Promise.resolve({ data: null }),
      Promise.race([supabaseAdmin.from('users').select(USER_COLS).eq('id', data.buyer_id).single(), timeout5s()]),
      Promise.race([supabaseAdmin.from('users').select(USER_COLS).eq('id', data.seller_id).single(), timeout5s()]),
      Promise.race([supabaseAdmin.from('reviews').select('id').eq('trade_id', req.params.id).eq('reviewer_id', req.userId).maybeSingle(), timeout5s()]),
    ]);

    data.listing = listingRes.status === 'fulfilled' ? (listingRes.value?.data || null) : null;
    data.buyer = buyerRes.status === 'fulfilled' ? (buyerRes.value?.data || null) : null;
    data.seller = sellerRes.status === 'fulfilled' ? (sellerRes.value?.data || null) : null;
    if (reviewRes.status === 'fulfilled' && reviewRes.value?.data) data.user_gave_feedback = true;

    res.json({ trade: data });
  } catch (error) {
    console.error('[GET /trades/:id] unexpected error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Freeze the exchange rate for 30 seconds so listing preview == escrow amount
app.post('/api/quotes', async (req, res) => {
  try {
    const { listingId } = req.body;
    if (!listingId) return res.status(400).json({ error: 'Missing listingId' });
    const { data: listing } = await supabaseAdmin.from('listings').select('*').eq('id', listingId).single();
    if (!listing) return res.status(404).json({ error: 'Listing not found' });
    const quote = await quoteService.createQuote(listing);
    res.json(quote);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/trades', verifyToken, requireEmailVerified, async (req, res) => {
  try {
    const { offerId: rawOfferId, listingId: rawListingId, amountBtc, amount, paymentMethod, trade_type, amountLocal, currency, currencySymbol, quoteId } = req.body;
    const listingId = rawOfferId || rawListingId;
    if (!listingId) return res.status(400).json({ error: 'Missing listing id' });
    const parsedAmountBtc = parseFloat(amountBtc || (amount ? String(amount).replace(/[^\d.]/g, '') : 0));
    if (isNaN(parsedAmountBtc) || parsedAmountBtc <= 0) return res.status(400).json({ error: 'Invalid BTC amount' });
    const { data: listing } = await supabaseAdmin.from('listings').select('*').eq('id', listingId).single();
    if (!listing) return res.status(404).json({ error: 'Listing not found' });
    if (listing.seller_id === req.userId) return res.status(400).json({ error: 'Cannot trade with yourself' });
    const fee = calculateFee(parsedAmountBtc);

    // GOLDEN RULE: The offer CREATOR always has the Bitcoin.
    // The trade OPENER always brings what the creator wants (cash, MTN, or a gift card).
    // Backend infers roles from listing_type — never trusts frontend trade_type.
    const listingTypeUpper = (listing.listing_type || '').toUpperCase();

    let buyerId, sellerId, btcProviderId, resolvedType;

    if (listingTypeUpper === 'SELL' || listingTypeUpper === 'SELL_BITCOIN') {
      // ── BUY BITCOIN PAGE ────────────────────────────────────────────────────
      // Offer creator (vendor) posted "I have Bitcoin, I want cash/MTN."
      // Trade opener comes to buy Bitcoin — they bring cash/MTN.
      //
      // listing.seller_id = offer creator = vendor = has BTC → BTC LOCKS
      // req.userId        = trade opener  = cash/MTN holder  → receives BTC
      sellerId = listing.seller_id;  // vendor — has BTC, BTC locks in escrow
      buyerId = req.userId;          // trade opener — brings cash/MTN
      btcProviderId = sellerId;            // offer creator's BTC ALWAYS locks on BUY page
      resolvedType = 'BUY';

    } else if (listingTypeUpper === 'BUY_GIFT_CARD') {
      // ── GIFT CARD MARKET: offer creator wants a card, has BTC ───────────────
      // Offer creator (e.g. Kenneth) posted "I have Bitcoin, I want a gift card."
      // Trade opener (e.g. Alice) sees the offer and brings the gift card.
      //
      // listing.seller_id = Kenneth = offer creator = has BTC → BTC LOCKS
      // req.userId        = Alice   = trade opener  = has gift card → receives BTC
      buyerId = listing.seller_id;  // offer creator — has BTC, BTC locks in escrow
      sellerId = req.userId;          // trade opener  — brings gift card
      btcProviderId = buyerId;             // offer creator's BTC ALWAYS locks
      resolvedType = 'SELL';

    } else if (listingTypeUpper === 'SELL_GIFT_CARD') {
      // ── GIFT CARD MARKET: offer creator has a card, wants BTC ───────────────
      // Offer creator (e.g. Kenneth) posted "I have a gift card, I want Bitcoin."
      // Trade opener (e.g. Alice) has Bitcoin and wants the gift card.
      //
      // req.userId        = Alice   = trade opener  = has BTC → BTC LOCKS
      // listing.seller_id = Kenneth = offer creator = has gift card → receives BTC
      buyerId = req.userId;          // trade opener  — has BTC, BTC locks in escrow
      sellerId = listing.seller_id;  // offer creator — has gift card
      btcProviderId = buyerId;             // trade opener's BTC locks
      resolvedType = 'BUY';

    } else {
      // ── FALLBACK: BUY / BUY_BITCOIN or unknown ──────────────────────────────
      // Offer creator wants to buy BTC with cash. Trade opener has BTC.
      buyerId = listing.seller_id;  // offer creator — wants BTC (cash holder)
      sellerId = req.userId;          // trade opener  — has BTC, BTC locks
      btcProviderId = sellerId;
      resolvedType = 'SELL';
    }

    console.log(`[Trade] type:${listingTypeUpper} → buyer:${buyerId.slice(0, 8)} seller:${sellerId.slice(0, 8)} btcProvider:${btcProviderId.slice(0, 8)}`);

    // All registered users can open trades — no verification gate for buyers.
    // Gift card trades and large trades ($10k+) retain their checks below.

    // Resolve trade currency + local amount
    const tradeLocalAmt = parseFloat(amountLocal) || 0;
    const frontendRateLocal = parseFloat(req.body.sellerRateLocal) || 0; // rate buyer saw on listing page
    const frontendRateUsd = parseFloat(req.body.sellerRateUsd) || 0;
    const tradeCur = (currency && currency !== 'USD') ? currency
      : (listing.currency && listing.currency !== 'USD') ? listing.currency
        : currency || listing.currency || null;
    const tradeSym = currencySymbol || listing.currency_symbol || (tradeCur ? null : null);

    let tradeAmountUsd, verifiedAmountBtc;

    if (quoteId && tradeLocalAmt > 0 && !listingTypeUpper.includes('GIFT_CARD')) {
      // ── QUOTE PATH: rate was frozen at listing-preview time ────────────────
      const quote = quoteService.consumeQuote(quoteId); // throws if expired/used
      if (String(quote.listingId) !== String(listingId)) {
        return res.status(400).json({ error: 'Rate quote does not match this listing' });
      }
      verifiedAmountBtc = parseFloat((tradeLocalAmt / quote.executableRate).toFixed(8));
      tradeAmountUsd = parseFloat((verifiedAmountBtc * quote.components.btcUsd).toFixed(2));
      console.log(`[Quote] id=${quoteId.slice(0, 8)} rate=${quote.executableRate.toFixed(2)} btc=${verifiedAmountBtc}`);
    } else {
      // ── FALLBACK PATH: live rate re-fetch (no quoteId or gift-card trade) ─
      // Reuse the already-hardened multi-source helpers (each source individually
      // try/caught, with cached + static fallbacks) instead of raw fetch() calls
      // that crash this entire request if a single external host is unreachable.
      const fxRates = await getLiveFXRates();
      // Trade settlement — must never price a trade off a stale cached value.
      const marketRateUSD = await getCurrentBTCPrice({ allowCached: false });
      const tradeCurRate = (tradeCur && fxRates[tradeCur]) ? fxRates[tradeCur] : 1;

      tradeAmountUsd = tradeLocalAmt > 0
        ? parseFloat((tradeLocalAmt / (frontendRateUsd > 0 ? (frontendRateLocal / frontendRateUsd) : tradeCurRate)).toFixed(2))
        : parseFloat(listing.amount_usd || 0);

      verifiedAmountBtc = parsedAmountBtc;
      if (tradeLocalAmt > 0 && !listingTypeUpper.includes('GIFT_CARD')) {
        const listingMargin = parseFloat(listing.margin || 0);
        const backendSellerRateUSD = (listing.pricing_type === 'fixed' && parseFloat(listing.bitcoin_price || 0) > 100)
          ? parseFloat(listing.bitcoin_price)
          : marketRateUSD * (1 + listingMargin / 100);
        const backendSellerRateLocal = backendSellerRateUSD * tradeCurRate;

        let finalSellerRateLocal = backendSellerRateLocal;
        if (frontendRateLocal > 0 && backendSellerRateLocal > 0) {
          const drift = Math.abs(frontendRateLocal - backendSellerRateLocal) / backendSellerRateLocal;
          if (drift <= 0.03) {
            finalSellerRateLocal = frontendRateLocal;
            console.log(`[Rate] Using frontend rate ${tradeCur}${frontendRateLocal.toFixed(0)} (drift ${(drift * 100).toFixed(2)}% — within tolerance)`);
          } else {
            console.warn(`[Rate] Frontend rate drifted ${(drift * 100).toFixed(2)}% — using backend rate ${tradeCur}${backendSellerRateLocal.toFixed(0)}`);
          }
        }
        verifiedAmountBtc = parseFloat((tradeLocalAmt / finalSellerRateLocal).toFixed(8));
        console.log(`[Rate] market:$${marketRateUSD} btc:${verifiedAmountBtc}`);
      }
    }

    const verifiedFee = parseFloat(calculateFee(verifiedAmountBtc));
    const tradeRef = 'PRAQ-' + require('crypto').randomBytes(4).toString('hex').toUpperCase();

    // Pre-check: ensure the provider has enough balance in the LISTING'S ASSET
    // before creating the trade. wallets is the single source of truth — read
    // only from there. Gift-card / BTC listings lock BTC; USDT-asset listings
    // lock USDT — checking the wrong field here let $0-BTC USDT sellers pass
    // as "insufficient" or, worse, let BTC-poor USDT holders slip through.
    const tradeCurrency = listing.asset === 'USDT' ? 'USDT' : 'BTC';
    const isUsdtTrade = tradeCurrency === 'USDT';
    const { data: providerWallet } = await supabaseAdmin
      .from('wallets').select('balance_btc, balance_usdt').eq('user_id', btcProviderId).maybeSingle();
    const availableBtc = isUsdtTrade
      ? parseFloat(providerWallet?.balance_usdt || 0)
      : parseFloat(providerWallet?.balance_btc || 0);
    if (availableBtc < verifiedAmountBtc) {
      const isOwnBalance = btcProviderId === req.userId;
      // Auto-pause the offer if the balance problem is on the offer creator's side
      if (!isOwnBalance) {
        supabaseAdmin.from('listings')
          .update({ status: 'PAUSED', updated_at: new Date().toISOString() })
          .eq('id', listingId)
          .then(() => { }).catch(() => { });
      }
      const assetLabel = isUsdtTrade ? 'USDT' : 'Bitcoin';
      const neededStr = isUsdtTrade ? `${verifiedAmountBtc.toFixed(2)} USDT` : `${verifiedAmountBtc.toFixed(6)} BTC`;
      const msg = isOwnBalance
        ? `You don't have enough ${assetLabel} in your PRAQEN wallet to open this trade. You need ${neededStr}. Please top up your wallet first.`
        : `This seller doesn't have enough ${assetLabel} to complete this trade right now. Their offer has been paused automatically. Please choose a different offer.`;
      return res.status(400).json({ error: msg });
    }

    // Large trades ($10k+) require KYC to protect the platform
    if (tradeAmountUsd >= 10000) {
      const { data: bigTrader } = await supabaseAdmin
        .from('users').select('is_id_verified').eq('id', req.userId).single();
      if (!bigTrader?.is_id_verified) {
        return res.status(403).json({
          error: 'Trades of $10,000 or more require ID verification. Please complete KYC in your profile.',
          requireVerification: 'kyc',
        });
      }
    }

    const { data: trade, error } = await supabaseAdmin.from('trades').insert([{
      listing_id: listingId, buyer_id: buyerId, seller_id: sellerId, trade_type: resolvedType,
      amount_btc: verifiedAmountBtc, status: 'CREATED',
      amount_usd: tradeAmountUsd,
      amount_local: tradeLocalAmt > 0 ? tradeLocalAmt : null,
      local_currency: tradeCur || null,
      currency_symbol: tradeSym || null,
      currency: tradeCurrency,
      amount_usdt: isUsdtTrade ? verifiedAmountBtc : null,
      platform_fee_btc: verifiedFee,
      platform_fee_usdt: isUsdtTrade ? verifiedFee : null,
      platform_fee_usd: (tradeAmountUsd * 0.01).toFixed(2), fee_status: 'PENDING',
      payment_method: paymentMethod || listing.payment_method,
      gift_card_brand: listingTypeUpper.includes('GIFT_CARD') ? (listing.gift_card_brand || null) : null,
      trade_ref: tradeRef,
      expires_at: new Date(Date.now() + Math.max(parseInt(listing.time_limit) || 30, 15) * 60 * 1000),
    }]).select();
    if (error) return res.status(400).json({ error: error.message });

    // ── Notify BOTH users immediately after trade is saved (before escrow) ──
    try {
      const [buyerRes, sellerRes] = await Promise.all([
        supabaseAdmin.from('users').select('username').eq('id', buyerId).single(),
        supabaseAdmin.from('users').select('username').eq('id', sellerId).single(),
      ]);
      const buyerName = buyerRes.data?.username || 'Buyer';
      const sellerName = sellerRes.data?.username || 'Seller';
      const fmtN = n => new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n || 0);
      const localDisp = tradeLocalAmt > 0 && tradeCur
        ? `${tradeSym || ''}${fmtN(tradeLocalAmt)} ${tradeCur}`
        : `$${fmtN(tradeAmountUsd)} USD`;
      const isGiftCardListing = (listing.listing_type || '').toUpperCase().includes('GIFT_CARD');
      const gcBrandField = isGiftCardListing ? (listing.gift_card_brand || null) : null;
      const pmDisp = gcBrandField || paymentMethod || listing.payment_method || 'Mobile Money';
      const assetLabel = gcBrandField ? `${gcBrandField} Gift Card` : 'Bitcoin';
      const btcDisp = `₿${parseFloat(trade[0].amount_btc || 0).toFixed(8)}`;

      const tradeUUID = trade[0].id;
      await Promise.allSettled([
        createNotification(sellerId, 'trade', '💰 New Trade Request',
          `${buyerName} wants to buy ${assetLabel} · ${btcDisp} · ${localDisp} via ${pmDisp}`,
          `/trade/${tradeUUID}`,
          { actor_id: buyerId, direction: 'sell', trade_id: tradeUUID, payment_method: pmDisp, gift_card_brand: gcBrandField }),
        createNotification(buyerId, 'trade', '🔒 Trade Started',
          `Your trade with ${sellerName} is now open · ${btcDisp} · ${localDisp} via ${pmDisp}`,
          `/trade/${tradeUUID}`,
          { actor_id: sellerId, direction: 'buy', trade_id: tradeUUID, payment_method: pmDisp, gift_card_brand: gcBrandField }),
        sendTradeAlert(sellerId, trade[0], 'new_trade').catch(() => { }),
        sendTradeAlert(buyerId, trade[0], 'new_trade').catch(() => { }),
      ]);
    } catch (notifyErr) {
      console.error('[Trade Open] Pre-escrow notification failed:', notifyErr.message);
    }
    // ─────────────────────────────────────────────────────────────────────────

    console.log(`[Escrow Lock] btcProvider:${btcProviderId.slice(0, 8)} locking ${verifiedAmountBtc} ${tradeCurrency}`);



    let escrowResult;
    try {
      escrowResult = await tradeEscrowService.lockFundsInEscrow(trade[0].id, btcProviderId, verifiedAmountBtc, listing.time_limit || 30, tradeCurrency);
    } catch (lockError) {
      console.error('❌ lockFundsInEscrow failed:', lockError.message);
      await supabaseAdmin.from('trades').update({
        status: 'CANCELLED',
        cancel_reason: `Escrow lock failed: ${lockError.message}`,
        cancelled_at: new Date().toISOString(),
      }).eq('id', trade[0].id);
      return res.status(400).json({
        error: `Could not lock ${tradeCurrency} in escrow. The seller may have insufficient funds. Please try a different offer.`
      });
    }
    // Invalidate marketplace cache so seller's reduced BTC balance shows immediately
    bustCache();
    // Respond immediately — escrow is locked, trade is live. Do NOT block on emails.
    res.json({ success: true, trade: trade[0], escrowAddress: escrowResult.escrowAddress, fee });

    // Send emails in the background — never block the response
    setImmediate(async () => {
      try {
        const [buyerEmailRes, sellerEmailRes] = await Promise.allSettled([
          supabaseAdmin.from('users').select('id, email, username').eq('id', buyerId).single(),
          supabaseAdmin.from('users').select('id, email, username').eq('id', sellerId).single(),
        ]);
        const buyerEmailUser = buyerEmailRes.value?.data;
        const sellerEmailUser = sellerEmailRes.value?.data;
        if (buyerEmailUser?.email)
          emailService.sendTradeOpenedEmail(buyerEmailUser, trade[0], 'buyer').catch(e => console.error('[TradeOpen] buyer email:', e.message));
        if (sellerEmailUser?.email)
          emailService.sendTradeOpenedEmail(sellerEmailUser, trade[0], 'seller').catch(e => console.error('[TradeOpen] seller email:', e.message));
      } catch (emailErr) {
        console.error('[Trade Open] Email failed:', emailErr.message);
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/trades/:id/mark-paid', tradeLimiter, verifyToken, async (req, res) => {
  try {
    const { data: trade, error: fetchError } = await supabaseAdmin
      .from('trades').select('*').eq('id', req.params.id).single();
    if (fetchError || !trade) return res.status(404).json({ error: 'Trade not found' });

    // Detect gift card trade from listing_type (authoritative — never use gift_card_brand alone)
    let listingType = '';
    let listingCreatorId = '';
    if (trade.listing_id) {
      const { data: listing } = await supabaseAdmin
        .from('listings').select('listing_type, seller_id').eq('id', trade.listing_id).single();
      listingType = listing?.listing_type || '';
      listingCreatorId = listing?.seller_id || '';
    }
    const isGiftCardTrade = listingType.toUpperCase().includes('GIFT_CARD');

    const isParticipant = String(trade.buyer_id) === String(req.userId) ||
      String(trade.seller_id) === String(req.userId);
    const isListingCreator = listingCreatorId && String(listingCreatorId) === String(req.userId);

    console.log(`[mark-paid] trade=${req.params.id.slice(0, 8)} isGiftCard=${isGiftCardTrade} buyer=${String(trade.buyer_id).slice(0, 8)} seller=${String(trade.seller_id).slice(0, 8)} reqUser=${String(req.userId).slice(0, 8)}`);

    if (isGiftCardTrade) {
      // Gift card trade: the card SELLER marks "I sent the code"
      if (String(trade.seller_id) !== String(req.userId)) {
        return res.status(403).json({ error: 'Only the card seller can mark as sent' });
      }
    } else {
      // Bitcoin trade (BUY page or SELL page):
      // buyer_id is always the cash payer — the one who marks "I have paid".
      // On BUY page: buyer_id = trade opener (brings cash).
      // On SELL page: buyer_id = listing creator (has cash, wants BTC).
      if (String(trade.buyer_id) !== String(req.userId)) {
        return res.status(403).json({ error: 'Only the buyer can mark as paid' });
      }
    }

    // Cash/BTC trades: the buyer's word alone is not enough — require a screenshot
    // or receipt attached before payment can be marked as sent. This is what the
    // seller (and any moderator, later, on a dispute) sees before BTC is released.
    const { proofImage } = req.body;
    if (!isGiftCardTrade && (!proofImage || typeof proofImage !== 'string' || !proofImage.startsWith('data:image/'))) {
      return res.status(400).json({ error: 'Please attach a screenshot or receipt of your payment before confirming.' });
    }

    const allowedStatuses = ['CREATED', 'FUNDS_LOCKED', 'ESCROW', 'ACTIVE', 'OPEN'];
    if (!allowedStatuses.includes(trade.status)) return res.status(400).json({ error: `Cannot mark as paid — trade status is ${trade.status}` });

    // Atomic update — only flips to PAYMENT_SENT if status is still in allowedStatuses.
    // Prevents a race where auto-cancel fires between our status check above and this write.
    // expires_at is cleared so no cron job or timer can ever expire a paid trade.
    const updatePayload = { status: 'PAYMENT_SENT', buyer_confirmed: true, buyer_confirmed_at: new Date(), expires_at: null };
    if (!isGiftCardTrade) {
      updatePayload.payment_proof_url = proofImage;
      updatePayload.payment_proof_at = new Date();
    }
    const { data, error } = await supabaseAdmin.from('trades')
      .update(updatePayload)
      .eq('id', req.params.id)
      .in('status', allowedStatuses)
      .select().single();
    if (!data) return res.status(409).json({ error: 'Trade status changed before payment could be confirmed. Please refresh and try again.' });
    if (error) return res.status(400).json({ error: error.message });

    // Notify whoever needs to act next
    // Gift card: notify Alice (buyer) to verify the code and release BTC
    // BTC trade: notify seller to verify fiat and release BTC
    const notifyId = isGiftCardTrade ? trade.buyer_id : trade.seller_id;
    const { data: actorUser } = await supabaseAdmin.from('users').select('username').eq('id', req.userId).single();
    const actorName = actorUser?.username || 'Buyer';
    const fmtN = n => new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n || 0);
    const paidLocal = trade.amount_local || 0;
    const paidCur = trade.local_currency || 'USD';
    const paidPM = trade.payment_method || 'Mobile Money';
    const paidDisp = paidLocal > 0 ? `${fmtN(paidLocal)} ${paidCur}` : `$${fmtN(trade.amount_usd)} USD`;
    res.json({ success: true, trade: data });

    setImmediate(async () => {
      // Keep the proof visible in the trade's evidence trail (moderator dispute
      // view already renders every trade_images row), not just on the trade record.
      if (!isGiftCardTrade && proofImage) {
        try {
          await supabaseAdmin.from('trade_images').insert({
            trade_id: req.params.id, user_id: req.userId,
            image_url: proofImage, image_type: 'payment_proof', created_at: new Date(),
          });
        } catch (e) { console.warn('[mark-paid] proof image insert failed:', e.message); }
      }
      try {
        const notifyMsg = isGiftCardTrade
          ? `${actorName} sent the gift card code · Verify and release Bitcoin`
          : `${actorName} sent ${paidDisp} via ${paidPM} · Verify and release Bitcoin`;
        await createNotification(notifyId, 'payment', '💳 Payment Sent', notifyMsg, `/trade/${req.params.id}`);
        sendTradeAlert(notifyId, trade, 'payment_sent').catch(() => { });
        // Email only the party who needs to act next (seller for BTC trade, buyer for gift card)
        const { data: notifyEmailUser } = await supabaseAdmin
          .from('users').select('id, email, username').eq('id', notifyId).single();
        if (notifyEmailUser?.email)
          emailService.sendPaymentSentEmail(notifyEmailUser, trade)
            .catch(e => console.error('[mark-paid] notify email:', e.message));
      } catch (e) { console.error('[mark-paid] Background notify failed:', e.message); }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/trades/:id/release', tradeLimiter, verifyToken, async (req, res) => {
  try {
    // ── 2FA: enforce that user has 2FA enabled before releasing BTC ─────────
    const { data: releaseUser2FA } = await supabaseAdmin
      .from('users')
      .select('two_factor_enabled')
      .eq('id', req.userId)
      .single();
    if (!releaseUser2FA?.two_factor_enabled) {
      return res.status(403).json({
        error: 'You must enable 2FA (email or authenticator) before releasing funds. Go to Settings → Security to enable 2FA.',
        require2FA: true,
      });
    }

    // ── 2FA: require email action code before releasing BTC ─────────────────
    const { actionCode } = req.body;
    if (!actionCode) {
      return res.status(403).json({
        error: 'Security verification required.',
        requireActionCode: true,
        action: 'release_btc',
      });
    }
    const codeCheck = await actionCodeService.verify(req.userId, 'release_btc', actionCode);
    if (!codeCheck.valid) return res.status(403).json({ error: codeCheck.error });

    const { data: releasedTrade } = await supabaseAdmin.from('trades').select('*').eq('id', req.params.id).single();
    const result = await tradeEscrowService.releaseBitcoinToBuyer(req.params.id, req.userId);
    res.json(result);

    if (releasedTrade) {
      setImmediate(async () => {
        try {
          updateUserTradeStats(releasedTrade.seller_id).catch(() => { });
          updateUserTradeStats(releasedTrade.buyer_id).catch(() => { });
          // Welcome bonus: buyer at step 2 → step 3, credit $2 in BTC
          try {
            const { data: bonusBuyer } = await supabaseAdmin.from('users')
              .select('id, bonus_step, bonus_expires_at')
              .eq('id', releasedTrade.buyer_id).single();
            if (bonusBuyer?.bonus_step === 2 && bonusBuyer?.bonus_expires_at &&
              new Date(bonusBuyer.bonus_expires_at) > new Date()) {
              // Credits real BTC to a wallet balance — keep it on the same always-live
              // pricing this had before caching was introduced, not the display cache.
              const btcPx = await getCurrentBTCPrice({ allowCached: false });
              const bonusBtc = parseFloat((2 / btcPx).toFixed(8));
              const { data: wal } = await supabaseAdmin.from('wallets')
                .select('balance_btc').eq('user_id', releasedTrade.buyer_id).maybeSingle();
              const newBal = parseFloat((parseFloat(wal?.balance_btc || 0) + bonusBtc).toFixed(8));
              await supabaseAdmin.from('wallets').update({ balance_btc: newBal, updated_at: new Date().toISOString() })
                .eq('user_id', releasedTrade.buyer_id);
              await supabaseAdmin.from('users').update({
                bonus_step: 3, bonus_unlocked_at: new Date().toISOString(),
              }).eq('id', releasedTrade.buyer_id);
              console.log(`[bonus] Credited ${bonusBtc} BTC ($2) to buyer ${releasedTrade.buyer_id}`);
            }
          } catch (e) { console.error('[bonus] Credit failed:', e.message); }
          payReferralCommissions(
            releasedTrade.id,
            releasedTrade.buyer_id,
            releasedTrade.seller_id,
            releasedTrade.amount_btc,
            releasedTrade.amount_usd
          ).catch(() => { });
          sendTradeAlert(releasedTrade.buyer_id, releasedTrade, 'btc_released').catch(() => { });
          // Fetch buyer and seller with emails, then send role-specific completion emails in parallel
          const [buyerRel, sellerRel] = await Promise.allSettled([
            supabaseAdmin.from('users').select('id, email, username').eq('id', releasedTrade.buyer_id).single(),
            supabaseAdmin.from('users').select('id, email, username').eq('id', releasedTrade.seller_id).single(),
          ]);
          const buyerRelUser = buyerRel.value?.data;
          const sellerRelUser = sellerRel.value?.data;
          if (buyerRelUser?.email)
            emailService.sendTradeConfirmationEmail(buyerRelUser, releasedTrade, 'buyer')
              .catch(e => console.error('[release] buyer email:', e.message));
          if (sellerRelUser?.email)
            emailService.sendTradeConfirmationEmail(sellerRelUser, releasedTrade, 'seller')
              .catch(e => console.error('[release] seller email:', e.message));
        } catch (e) { console.error('[release] Background notify failed:', e.message); }
      });
    }
  } catch (error) {
    console.error('❌ /api/trades/:id/release error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/trades/:id/cancel', tradeLimiter, verifyToken, async (req, res) => {
  try {
    const { reason } = req.body;
    const { data: trade, error: fetchError } = await supabaseAdmin.from('trades').select('*').eq('id', req.params.id).single();
    if (fetchError || !trade) return res.status(404).json({ error: 'Trade not found' });

    const isBuyer = trade.buyer_id === req.userId;
    const isSeller = trade.seller_id === req.userId;
    if (!isBuyer && !isSeller) {
      return res.status(403).json({ error: 'Not authorized to cancel this trade' });
    }

    if (trade.status === 'DISPUTED') {
      // Only the person who OPENED the dispute can withdraw/self-cancel it — the
      // other party can't cancel their way out of a dispute filed against them.
      // They must wait for the moderator panel/admin override instead.
      if (trade.disputed_by && trade.disputed_by !== req.userId) {
        return res.status(403).json({ error: 'Only the person who opened this dispute can cancel it. The moderator team will review and resolve it.' });
      }
      if (!trade.disputed_by) {
        // Legacy dispute opened before we tracked who filed it — nobody can
        // self-cancel; safest fallback is to require moderator resolution.
        return res.status(403).json({ error: 'This dispute cannot be self-cancelled — a moderator will resolve it.' });
      }
    } else {
      // Not yet disputed: only the BUYER can unilaterally cancel. Sellers hold
      // the escrowed BTC — letting a seller cancel on demand (even before payment)
      // gives them an easy way to pocket a payment the buyer sends moments later
      // and still reclaim the BTC, or simply back a buyer into a corner. A seller
      // who wants out of a trade must open a dispute instead, so a moderator can
      // review it rather than the seller unilaterally deciding.
      if (!isBuyer) {
        return res.status(403).json({ error: 'Only the buyer can cancel this trade — open a dispute instead' });
      }
    }

    // DISPUTED is included so the disputer can back out of their own dispute —
    // tradeEscrowService.cancelTrade already treats DISPUTED as a safe, refundable
    // state (it's the same code path a moderator's CANCEL uses).
    const cancellableStatuses = ['CREATED', 'FUNDS_LOCKED', 'ESCROW', 'ACTIVE', 'OPEN', 'PAYMENT_SENT', 'PAID', 'DISPUTED'];
    if (!cancellableStatuses.includes(trade.status)) return res.status(400).json({ error: `Trade cannot be cancelled — status is ${trade.status}` });

    // Delegate ALL escrow release + balance refund + trade status update to the
    // escrow service. It uses an atomic DB claim (WHERE status='LOCKED') so even
    // if the auto-cancel cron fires at the same instant, only one refund happens.
    // cancelTrade() also sends the in-app notification to both parties — don't
    // duplicate that here (this route used to send its own second copy).
    const result = await tradeEscrowService.cancelTrade(req.params.id, reason || 'Trade opener cancelled', req.userId);
    if (!result.success) return res.status(409).json({ error: result.message });

    // Fetch the updated trade for the response
    const { data: updatedTrade } = await supabaseAdmin.from('trades').select('*').eq('id', req.params.id).single();
    res.json({ success: true, trade: updatedTrade || trade });

    setImmediate(async () => {
      try {
        sendTradeAlert([trade.buyer_id, trade.seller_id].filter(Boolean), trade, 'trade_cancelled').catch(() => { });
        // Email both parties about the cancellation
        const [buyerCancel, sellerCancel] = await Promise.allSettled([
          supabaseAdmin.from('users').select('id, email, username').eq('id', trade.buyer_id).single(),
          supabaseAdmin.from('users').select('id, email, username').eq('id', trade.seller_id).single(),
        ]);
        const buyerCancelUser = buyerCancel.value?.data;
        const sellerCancelUser = sellerCancel.value?.data;
        if (buyerCancelUser?.email)
          emailService.sendTradeCancelledEmail(buyerCancelUser, trade, reason)
            .catch(e => console.error('[cancel] buyer email:', e.message));
        if (sellerCancelUser?.email)
          emailService.sendTradeCancelledEmail(sellerCancelUser, trade, reason)
            .catch(e => console.error('[cancel] seller email:', e.message));
      } catch (e) { console.error('[cancel] Background notify failed:', e.message); }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/trades/:id/auto-cancel', async (req, res) => {
  try {
    const tradeId = req.params.id;
    const { reason } = req.body;

    // Quick status check — guard before delegating to the escrow service
    const { data: trade } = await supabaseAdmin.from('trades').select('id, status').eq('id', tradeId).single();
    if (!trade) return res.status(404).json({ error: 'Trade not found' });

    if (trade.status === 'DISPUTED') {
      return res.status(403).json({ error: 'Cannot cancel a disputed trade. A moderator must give the final verdict.' });
    }
    if (['PAYMENT_SENT', 'PAID'].includes(trade.status)) {
      console.error(`[Auto-cancel] Blocked — trade ${tradeId.slice(0, 8)} is ${trade.status}. Cannot auto-cancel after payment marked.`);
      return res.status(403).json({ error: 'Cannot auto-cancel after buyer has marked payment. Seller must release Bitcoin or open a dispute.' });
    }
    if (['CANCELLED', 'COMPLETED'].includes(trade.status)) {
      return res.json({ success: true, message: `Trade already ${trade.status.toLowerCase()}.` });
    }

    // Delegate to the centralized escrow service — handles atomic escrow claim,
    // upsert on user_balances, user_wallets sync, audit log, and notifications.
    const result = await tradeEscrowService.cancelTrade(tradeId, reason || '30-minute payment window expired');
    res.json(result);

  } catch (error) {
    console.error('Auto-cancel error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// MESSAGES ROUTES
// ============================================================

app.post('/api/messages', verifyToken, async (req, res) => {
  try {
    const { tradeId, message, isSystem } = req.body;
    if (!tradeId || !message) return res.status(400).json({ error: 'Missing required fields' });
    const { data: trade, error: tradeError } = await supabaseAdmin.from('trades').select('buyer_id, seller_id, status').eq('id', tradeId).single();
    if (tradeError || !trade) return res.status(404).json({ error: 'Trade not found' });
    const isParticipant = trade.buyer_id === req.userId || trade.seller_id === req.userId;
    const recipientId = trade.buyer_id === req.userId ? trade.seller_id : trade.buyer_id;
    const { data: userData } = await supabaseAdmin.from('users').select('is_moderator, is_admin, username').eq('id', req.userId).single();
    const senderRole = (userData?.is_moderator || userData?.is_admin) ? 'moderator' : 'user';
    // isSystem: only trusted if the sender is a participant in this trade
    const useSystem = isSystem && isParticipant;
    const { data, error } = await supabaseAdmin.from('messages').insert([{
      trade_id: tradeId,
      sender_id: useSystem ? null : req.userId,
      recipient_id: useSystem ? null : recipientId,
      message_text: message,
      message_type: useSystem ? 'SYSTEM' : 'CHAT',
      sender_role: useSystem ? 'system' : senderRole,
      created_at: new Date(),
    }]).select();
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true, message: data[0] });

    // Notify recipient — throttled to 1 per 5 min per trade to avoid spam
    if (!useSystem && isParticipant && recipientId) {
      setImmediate(async () => {
        try {
          const senderName = userData?.username || 'Trader';
          const tradeRef = tradeId.slice(0, 8).toUpperCase();
          const preview = message.length > 60 ? message.slice(0, 60) + '…' : message;
          const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
          const { data: recent } = await supabaseAdmin
            .from('notifications')
            .select('id')
            .eq('user_id', recipientId)
            .eq('type', 'message')
            .eq('action', `/trade/${tradeId}`)
            .gte('created_at', fiveMinAgo)
            .maybeSingle();
          if (!recent) {
            await createNotification(
              recipientId,
              'message',
              `💬 New Message in Trade #${tradeRef}`,
              `${senderName}: ${preview}`,
              `/trade/${tradeId}`
            );
          }
        } catch (e) {
          console.error('[Message notification] Failed:', e.message);
        }
      });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/messages/:tradeId', verifyToken, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin.from('messages').select('*').eq('trade_id', req.params.tradeId).order('created_at', { ascending: true });
    if (error) return res.json({ messages: [] });
    res.json({ messages: data || [] });
  } catch { res.json({ messages: [] }); }
});

// ============================================================
// IMAGE UPLOAD
// ============================================================

app.post('/api/trades/:id/upload-image', verifyToken, async (req, res) => {
  try {
    const { image, type } = req.body;
    if (!image) return res.status(400).json({ error: 'No image provided' });
    const { data, error } = await supabaseAdmin.from('trade_images')
      .insert({ trade_id: req.params.id, user_id: req.userId, image_url: image, image_type: type || 'proof', created_at: new Date() }).select();
    if (error) return res.json({ success: true });
    res.json({ success: true, image: data[0] });
  } catch { res.json({ success: true }); }
});

app.get('/api/trades/:id/images', verifyToken, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin.from('trade_images').select('*').eq('trade_id', req.params.id).order('created_at', { ascending: false });
    if (error) return res.json({ images: [] });
    res.json({ images: data || [] });
  } catch { res.json({ images: [] }); }
});

// ============================================================
// TYPING INDICATORS
// ============================================================

app.post('/api/trades/:id/typing', verifyToken, async (req, res) => {
  typingState[`${req.params.id}:${req.userId}`] = Date.now() + 4000;
  res.json({ success: true });
});

app.get('/api/trades/:id/typing', verifyToken, async (req, res) => {
  const now = Date.now();
  const isTyping = Object.entries(typingState).some(
    ([k, v]) => k.startsWith(req.params.id + ':') && !k.endsWith(':' + req.userId) && v > now
  );
  res.json({ isTyping });
});

// ============================================================
// DISPUTES
// ============================================================

app.post('/api/trades/:id/dispute', tradeLimiter, verifyToken, async (req, res) => {
  try {
    const { reason } = req.body;
    const { data: trade } = await supabaseAdmin.from('trades').select('*').eq('id', req.params.id).single();
    if (!trade) return res.status(404).json({ error: 'Trade not found' });
    if (String(trade.buyer_id) !== String(req.userId) && String(trade.seller_id) !== String(req.userId)) {
      return res.status(403).json({ error: 'Not a participant in this trade' });
    }
    // Clear expires_at so no expiry logic (frontend timer or backend) can ever
    // auto-cancel this trade. Only a moderator can give the final verdict.
    // `disputed_by` records exactly who opened it — only they can self-cancel
    // it later (POST /api/trades/:id/cancel); the other side can't unilaterally
    // cancel their way out of a dispute filed against them.
    const disputePayload = {
      status: 'DISPUTED',
      disputed_at: new Date(),
      disputed_by: req.userId,
      dispute_reason: reason || 'User opened a dispute',
      expires_at: null,
    };
    let { data, error } = await supabaseAdmin.from('trades')
      .update(disputePayload)
      .eq('id', req.params.id).select().single();
    // `disputed_by` only exists once dispute_voting_tables.sql has been run —
    // if it hasn't, don't block the user from opening a dispute over it.
    if (error && (error.code === '42703' || (error.message && error.message.includes('does not exist')))) {
      console.warn('[dispute] disputed_by column missing — retrying without it:', error.message);
      delete disputePayload.disputed_by;
      const retry = await supabaseAdmin.from('trades')
        .update(disputePayload)
        .eq('id', req.params.id).select().single();
      data = retry.data; error = retry.error;
    }
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true, trade: data });

    setImmediate(async () => {
      // In-app notifications and system message
      await createNotification(trade.seller_id, 'support', '⚠️ Dispute Opened', `Dispute opened for trade #${req.params.id.slice(0, 8)}. Moderator will review.`, `/trade/${req.params.id}`);
      await createNotification(trade.buyer_id, 'support', '⚠️ Dispute Opened', `Dispute opened for trade #${req.params.id.slice(0, 8)}. Please provide evidence.`, `/trade/${req.params.id}`);
      notifyModerators(req.params.id, trade, reason || 'User opened a dispute').catch(e => console.error('[dispute] notifyModerators failed:', e.message));
      supabaseAdmin.from('messages').insert([{ trade_id: req.params.id, sender_id: null, recipient_id: null, message_text: `🚨 DISPUTE OPENED — Reason: ${reason || 'User opened a dispute'}. Moderators notified.`, message_type: 'SYSTEM', sender_role: 'system', created_at: new Date() }]).then(null, () => { });

      // Email both parties — fetch their user records in parallel
      const [buyerRes, sellerRes] = await Promise.allSettled([
        supabaseAdmin.from('users').select('id, email, username').eq('id', trade.buyer_id).single(),
        supabaseAdmin.from('users').select('id, email, username').eq('id', trade.seller_id).single(),
      ]);
      const buyerUser = buyerRes.value?.data;
      const sellerUser = sellerRes.value?.data;
      if (buyerUser?.email)
        emailService.sendDisputeOpenedEmail(buyerUser, trade, reason).catch(e => console.error('[dispute] buyer email failed:', e.message));
      if (sellerUser?.email)
        emailService.sendDisputeOpenedEmail(sellerUser, trade, reason).catch(e => console.error('[dispute] seller email failed:', e.message));
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/trades/:id/moderator-join', verifyToken, async (req, res) => {
  try {
    const { data: userData } = await supabaseAdmin.from('users').select('is_moderator, is_admin, username').eq('id', req.userId).single();
    if (!userData?.is_moderator && !userData?.is_admin) return res.status(403).json({ error: 'Moderators only' });
    const { data: trade } = await supabaseAdmin.from('trades').select('status, id, buyer_id, seller_id').eq('id', req.params.id).single();
    if (!trade) return res.status(404).json({ error: 'Trade not found' });
    await supabaseAdmin.from('messages').insert([{ trade_id: req.params.id, sender_id: req.userId, recipient_id: null, message_text: `👨‍⚖️ Moderator has joined and is reviewing this dispute.`, message_type: 'SYSTEM', sender_role: 'moderator', created_at: new Date() }]);
    res.json({ success: true, moderator: userData.username });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const ADMIN_EMAIL = 'support@praqen.com';
const DISPUTE_QUORUM = 3;          // matching votes needed to auto-execute a verdict
const CURRENT_OATH_VERSION = 1;    // bump to force every moderator to re-sign
const DISPUTE_SLA_HOURS = 48;      // hours of inactivity before admin override unlocks

async function hasSignedOath(userId) {
  const { data } = await supabaseAdmin.from('moderator_oaths')
    .select('id').eq('user_id', userId).eq('oath_version', CURRENT_OATH_VERSION).maybeSingle();
  return !!data;
}

// ── Oath of Trust ────────────────────────────────────────────────────────────
app.get('/api/team/oath-status', verifyToken, async (req, res) => {
  try {
    const signed = await hasSignedOath(req.userId);
    res.json({ signed, version: CURRENT_OATH_VERSION });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/team/oath/sign', verifyToken, async (req, res) => {
  try {
    const { data: userData } = await supabaseAdmin.from('users').select('is_admin, is_moderator').eq('id', req.userId).single();
    if (!userData?.is_admin && !userData?.is_moderator) return res.status(403).json({ error: 'Moderators only' });

    const full_name = (req.body.full_name || '').trim();
    const email = (req.body.email || '').trim().toLowerCase();
    if (!full_name) return res.status(400).json({ error: 'Enter your full name.' });
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email.' });

    // Let a moderator correct their own name/email at signing time — this is what
    // shows up on every vote and comment they make, so it must be accurate.
    const { data: clash } = await supabaseAdmin.from('users').select('id').eq('email', email).neq('id', req.userId).maybeSingle();
    if (clash) return res.status(400).json({ error: 'That email is already used by another account.' });

    const { error: updateErr } = await supabaseAdmin.from('users').update({ full_name, email }).eq('id', req.userId);
    if (updateErr) return res.status(400).json({ error: updateErr.message });

    const { error } = await supabaseAdmin.from('moderator_oaths')
      .upsert({ user_id: req.userId, oath_version: CURRENT_OATH_VERSION, signed_at: new Date() },
        { onConflict: 'user_id,oath_version', ignoreDuplicates: true });
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true, signed: true, version: CURRENT_OATH_VERSION, full_name, email });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.get('/api/team/moderators', verifyToken, async (req, res) => {
  try {
    const { data: userData } = await supabaseAdmin.from('users').select('is_admin, is_moderator').eq('id', req.userId).single();
    if (!userData?.is_admin && !userData?.is_moderator) return res.status(403).json({ error: 'Team access required' });
    const mods = await getModeratorsFull();
    res.json({ moderators: mods.map(m => ({ id: m.id, username: m.username, full_name: m.full_name, email: m.email, is_admin: m.is_admin })) });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// Admin-only — who's on the team, and when they last logged into /moderator (or /team).
app.get('/api/admin/team-activity', verifyToken, async (req, res) => {
  try {
    const { data: userData } = await supabaseAdmin.from('users').select('is_admin, email').eq('id', req.userId).single();
    const isFullAdmin = !!(userData?.is_admin || userData?.email === ADMIN_EMAIL);
    if (!isFullAdmin) return res.status(403).json({ error: 'Admins only' });

    const { data: mods, error } = await supabaseAdmin.from('users')
      .select('id, username, full_name, email, is_admin, is_moderator, last_login, last_seen_at, created_at')
      .or('is_moderator.eq.true,is_admin.eq.true')
      .order('last_seen_at', { ascending: false, nullsFirst: false });
    if (error) return res.status(400).json({ error: error.message });

    const ids = (mods || []).map(m => m.id);
    const { data: oaths } = ids.length
      ? await supabaseAdmin.from('moderator_oaths').select('user_id, signed_at').in('user_id', ids).eq('oath_version', CURRENT_OATH_VERSION)
      : { data: [] };
    const oathByUser = {};
    for (const o of oaths || []) oathByUser[o.user_id] = o;

    // Votes cast + overrides made — a quick activity signal alongside login times.
    const { data: votes } = ids.length
      ? await supabaseAdmin.from('dispute_votes').select('moderator_id').in('moderator_id', ids)
      : { data: [] };
    const voteCounts = {};
    for (const v of votes || []) voteCounts[v.moderator_id] = (voteCounts[v.moderator_id] || 0) + 1;

    const team = (mods || []).map(m => ({
      id: m.id, username: m.username, full_name: m.full_name, email: m.email,
      is_admin: m.is_admin, is_moderator: m.is_moderator,
      last_login: m.last_login, last_seen_at: m.last_seen_at, joined: m.created_at,
      oath_signed: !!oathByUser[m.id], oath_signed_at: oathByUser[m.id]?.signed_at || null,
      votes_cast: voteCounts[m.id] || 0,
    }));

    res.json({ team });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// Moderator-only — a trader's past dispute track record (wins/losses/cancels).
// Deliberately NOT exposed on the public /api/users/:userId profile endpoint —
// this is reputation-sensitive info that should only inform the review panel.
app.get('/api/admin/users/:userId/dispute-history', verifyToken, async (req, res) => {
  try {
    const { data: userData } = await supabaseAdmin.from('users').select('is_admin, is_moderator, email').eq('id', req.userId).single();
    const isAdmin = userData?.is_admin || userData?.is_moderator || userData?.email === ADMIN_EMAIL;
    if (!isAdmin) return res.status(403).json({ error: 'Access denied' });

    const targetId = req.params.userId;
    const { data: trades, error } = await supabaseAdmin.from('trades')
      .select('id, buyer_id, seller_id, dispute_resolution, dispute_reason, disputed_at, resolved_at, resolved_via')
      .or(`buyer_id.eq.${targetId},seller_id.eq.${targetId}`)
      .not('dispute_resolution', 'is', null)
      .order('resolved_at', { ascending: false });
    if (error) return res.status(400).json({ error: error.message });

    let wins = 0, losses = 0, neutral = 0;
    const history = (trades || []).map(t => {
      const wasBuyer = t.buyer_id === targetId;
      let outcome;
      if (t.dispute_resolution === 'CANCEL') { outcome = 'neutral'; neutral++; }
      else if ((wasBuyer && t.dispute_resolution === 'BUYER_WINS') || (!wasBuyer && t.dispute_resolution === 'SELLER_WINS')) { outcome = 'won'; wins++; }
      else { outcome = 'lost'; losses++; }
      return {
        trade_id: t.id, role: wasBuyer ? 'buyer' : 'seller', resolution: t.dispute_resolution,
        outcome, reason: t.dispute_reason, resolved_at: t.resolved_at, resolved_via: t.resolved_via,
      };
    });

    res.json({ total: history.length, wins, losses, neutral, history: history.slice(0, 10) });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// Attach vote state to a dispute row — enforces blind voting server-side: a
// moderator only sees another moderator's chosen verdict once they've cast
// their own vote on that same trade (or if they're a full admin).
async function attachVoteState(trade, requesterId, isFullAdmin) {
  const { data: votes } = await supabaseAdmin.from('dispute_votes')
    .select('id, moderator_id, vote, reasoning, created_at, moderator:moderator_id(username, full_name, email)')
    .eq('trade_id', trade.id);
  const { count: commentCount } = await supabaseAdmin.from('dispute_comments')
    .select('id', { count: 'exact', head: true }).eq('trade_id', trade.id);

  const iVoted = (votes || []).some(v => v.moderator_id === requesterId);
  const myVote = (votes || []).find(v => v.moderator_id === requesterId)?.vote || null;

  const visibleVotes = (votes || []).map(v => {
    const base = { moderator_id: v.moderator_id, full_name: v.moderator?.full_name, username: v.moderator?.username, email: v.moderator?.email, created_at: v.created_at };
    if (isFullAdmin || iVoted) return { ...base, vote: v.vote, reasoning: v.reasoning };
    return { ...base, vote: null, reasoning: null };
  });

  const tally = {};
  for (const v of votes || []) tally[v.vote] = (tally[v.vote] || 0) + 1;
  const hoursSinceDisputed = trade.disputed_at ? (Date.now() - new Date(trade.disputed_at).getTime()) / 36e5 : 0;

  return { votes: visibleVotes, my_vote: myVote, comment_count: commentCount || 0, quorum: DISPUTE_QUORUM, tally, hours_since_disputed: hoursSinceDisputed };
}

app.get('/api/admin/disputes', verifyToken, async (req, res) => {
  try {
    const { data: userData } = await supabaseAdmin.from('users').select('is_moderator, is_admin, email').eq('id', req.userId).single();
    const isAdmin = userData?.is_admin || userData?.is_moderator || userData?.email === ADMIN_EMAIL;
    if (!isAdmin) return res.status(403).json({ error: 'Access denied' });
    const isFullAdmin = !!(userData?.is_admin || userData?.email === ADMIN_EMAIL);

    const [openRes, resolvedRes, mods] = await Promise.all([
      supabaseAdmin.from('trades').select('*, buyer:buyer_id(id, username), seller:seller_id(id, username)').eq('status', 'DISPUTED').order('created_at', { ascending: false }),
      // NOTE: no embedded `resolved_by` join here — PostgREST doesn't have that FK
      // registered in its schema cache on this DB, so it 400s. Resolver identity is
      // looked up manually below instead.
      supabaseAdmin.from('trades').select('*, buyer:buyer_id(id, username), seller:seller_id(id, username)').not('dispute_resolution', 'is', null).order('resolved_at', { ascending: false }),
      getModeratorsFull(),
    ]);
    if (openRes.error) return res.status(400).json({ error: openRes.error.message });
    if (resolvedRes.error) return res.status(400).json({ error: resolvedRes.error.message });

    const openTrades = openRes.data || [];
    const voteStates = await Promise.all(openTrades.map(t => attachVoteState(t, req.userId, isFullAdmin)));
    const disputes = openTrades.map((t, i) => {
      const vs = voteStates[i];
      const everyoneVoted = mods.length > 0 && vs.votes.length >= mods.length;
      const noQuorumYet = Object.values(vs.tally).every(c => c < DISPUTE_QUORUM);
      const isSplit = everyoneVoted && noQuorumYet;
      const canOverride = isSplit || vs.hours_since_disputed >= DISPUTE_SLA_HOURS;
      return {
        id: t.id, trade_id: t.id, status: 'OPEN', reason: t.dispute_reason || 'User opened a dispute',
        initiated_by: t.buyer_id, created_at: t.disputed_at || t.updated_at, trade_details: t, buyer: t.buyer, seller: t.seller,
        ...vs, is_split: isSplit, can_override: canOverride, eligible_moderators: mods.length,
      };
    });

    const resolvedTrades = resolvedRes.data || [];
    const resolvedIds = resolvedTrades.map(t => t.id);
    const [{ data: resolvedVotes }, { data: resolvers }] = await Promise.all([
      resolvedIds.length
        ? supabaseAdmin.from('dispute_votes').select('trade_id, vote, moderator:moderator_id(full_name, email)').in('trade_id', resolvedIds)
        : Promise.resolve({ data: [] }),
      resolvedIds.length
        ? supabaseAdmin.from('users').select('id, full_name, email').in('id', [...new Set(resolvedTrades.map(t => t.resolved_by).filter(Boolean))])
        : Promise.resolve({ data: [] }),
    ]);
    const votesByTrade = {};
    for (const v of resolvedVotes || []) (votesByTrade[v.trade_id] ||= []).push(v);
    const resolverById = {};
    for (const u of resolvers || []) resolverById[u.id] = u;

    const resolved = resolvedTrades.map(t => {
      const contributing = (votesByTrade[t.id] || []).filter(v => v.vote === t.dispute_resolution).map(v => ({ full_name: v.moderator?.full_name, email: v.moderator?.email }));
      const fallbackResolver = resolverById[t.resolved_by];
      const resolvedByList = contributing.length ? contributing : [{ full_name: fallbackResolver?.full_name, email: fallbackResolver?.email }];
      return {
        id: t.id, trade_id: t.id, status: t.status, reason: t.dispute_reason || 'Dispute resolved',
        trade_details: t, buyer: t.buyer, seller: t.seller,
        resolution: t.dispute_resolution, dispute_resolution: t.dispute_resolution, dispute_notes: t.dispute_notes,
        resolved_at: t.resolved_at, resolved_via: t.resolved_via, override_reason: t.override_reason,
        resolved_by_list: resolvedByList,
        resolved_by_name: resolvedByList.map(v => v.full_name).filter(Boolean).join(', ') || 'PRAQEN Moderator',
      };
    });

    res.json({ disputes: [...disputes, ...resolved] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/admin/disputes/:id', verifyToken, async (req, res) => {
  try {
    const { data: userData } = await supabaseAdmin.from('users').select('is_moderator, is_admin, email').eq('id', req.userId).single();
    const isAdmin = userData?.is_admin || userData?.is_moderator || userData?.email === ADMIN_EMAIL;
    if (!isAdmin) return res.status(403).json({ error: 'Access denied' });
    const isFullAdmin = !!(userData?.is_admin || userData?.email === ADMIN_EMAIL);

    const { data: trade } = await supabaseAdmin.from('trades').select('*, buyer:buyer_id(id, username), seller:seller_id(id, username)').eq('id', req.params.id).single();
    if (!trade) return res.status(404).json({ error: 'Trade not found' });

    const vs = await attachVoteState(trade, req.userId, isFullAdmin);
    const mods = await getModeratorsFull();
    const everyoneVoted = mods.length > 0 && vs.votes.length >= mods.length;
    const noQuorumYet = Object.values(vs.tally).every(c => c < DISPUTE_QUORUM);
    const isSplit = everyoneVoted && noQuorumYet;
    const canOverride = isSplit || vs.hours_since_disputed >= DISPUTE_SLA_HOURS;

    res.json({
      id: trade.id, trade_id: trade.id, reason: trade.dispute_reason, created_at: trade.disputed_at || trade.updated_at,
      trade_details: trade, buyer: trade.buyer, seller: trade.seller,
      ...vs, is_split: isSplit, can_override: canOverride, eligible_moderators: mods.length,
    });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// Cast (or change) your vote on a dispute. Executes automatically the instant
// DISPUTE_QUORUM votes agree — no separate "confirm and release" step exists.
app.post('/api/admin/disputes/:id/resolve', verifyToken, async (req, res) => {
  try {
    const { resolution, notes } = req.body;
    if (!['BUYER_WINS', 'SELLER_WINS', 'CANCEL'].includes(resolution)) return res.status(400).json({ error: 'Invalid resolution' });
    const { data: userData } = await supabaseAdmin.from('users').select('is_admin, is_moderator, username, email').eq('id', req.userId).single();
    const isAdmin = userData?.is_admin || userData?.is_moderator || userData?.email === ADMIN_EMAIL;
    if (!isAdmin) return res.status(403).json({ error: 'Access denied' });
    if (!(await hasSignedOath(req.userId))) return res.status(403).json({ error: 'Sign the Moderator Oath of Trust before you can vote — visit /moderator.' });

    const { data: trade } = await supabaseAdmin.from('trades').select('*').eq('id', req.params.id).single();
    if (!trade) return res.status(404).json({ error: 'Trade not found' });
    if (trade.dispute_resolution) return res.status(400).json({ error: 'This dispute has already been resolved.' });

    const { error: voteErr } = await supabaseAdmin.from('dispute_votes')
      .upsert({ trade_id: trade.id, moderator_id: req.userId, vote: resolution, reasoning: notes || null, created_at: new Date() }, { onConflict: 'trade_id,moderator_id' });
    if (voteErr) return res.status(400).json({ error: voteErr.message });

    const { data: allVotes } = await supabaseAdmin.from('dispute_votes').select('moderator_id, vote').eq('trade_id', trade.id);
    const tally = {};
    for (const v of allVotes || []) tally[v.vote] = (tally[v.vote] || 0) + 1;
    const winner = Object.entries(tally).find(([, c]) => c >= DISPUTE_QUORUM)?.[0];

    if (!winner) {
      const mods = await getModeratorsFull();
      const everyoneVoted = mods.length > 0 && (allVotes || []).length >= mods.length;
      if (everyoneVoted) {
        return res.json({ success: true, status: 'SPLIT', tally, message: 'All moderators have voted with no majority — this case is escalated for an admin decision.' });
      }
      return res.json({ success: true, status: 'PENDING', tally, quorum: DISPUTE_QUORUM, message: 'Vote recorded — visible to your team, no further action required from you unless you change your mind.' });
    }

    // Quorum reached — re-check freshness right before executing to close the race window.
    const { data: freshTrade } = await supabaseAdmin.from('trades').select('*').eq('id', trade.id).single();
    if (freshTrade.dispute_resolution) {
      return res.json({ success: true, status: 'RESOLVED', resolution: freshTrade.dispute_resolution, message: 'Dispute already resolved by the panel.' });
    }

    // Delegate ALL balance moves to tradeEscrowService.resolveDispute().
    // This is the ONLY safe path — it uses atomic escrow claims, syncs both
    // user_balances and user_wallets, logs to wallet_transactions and balance_audit.
    await tradeEscrowService.resolveDispute(trade.id, winner, req.userId, notes);
    await supabaseAdmin.from('trades').update({ resolved_via: 'QUORUM' }).eq('id', trade.id);

    const msgMap = {
      BUYER_WINS: '✅ Resolved: BUYER WINS — Bitcoin released to buyer.',
      SELLER_WINS: '✅ Resolved: SELLER WINS — Bitcoin returned to seller.',
      CANCEL: '❌ Resolved: Trade cancelled — Bitcoin returned to seller.',
    };
    const msg = msgMap[winner] || `Resolved: ${winner}`;

    await supabaseAdmin.from('messages').insert([{
      trade_id: req.params.id,
      sender_id: req.userId,
      message_text: `👨‍⚖️ Dispute resolved by 3-moderator panel vote.\nDecision: ${winner}\n${msg}`,
      message_type: 'SYSTEM',
      sender_role: 'moderator',
      created_at: new Date(),
    }]);
    for (const uid of [trade.buyer_id, trade.seller_id]) {
      await createNotification(uid, 'support', '⚖️ Dispute Resolved', `Trade #${trade.id.slice(0, 8)} dispute resolved: ${winner}`, `/trade/${trade.id}`);
    }
    res.json({ success: true, status: 'RESOLVED', resolution: winner, tally });

    // Email both parties about the resolution
    setImmediate(async () => {
      const [buyerRes, sellerRes] = await Promise.allSettled([
        supabaseAdmin.from('users').select('id, email, username').eq('id', trade.buyer_id).single(),
        supabaseAdmin.from('users').select('id, email, username').eq('id', trade.seller_id).single(),
      ]);
      const buyerUser = buyerRes.value?.data;
      const sellerUser = sellerRes.value?.data;
      if (buyerUser?.email)
        emailService.sendDisputeResolvedEmail(buyerUser, trade, winner, notes).catch(e => console.error('[resolve] buyer email failed:', e.message));
      if (sellerUser?.email)
        emailService.sendDisputeResolvedEmail(sellerUser, trade, winner, notes).catch(e => console.error('[resolve] seller email failed:', e.message));
      sendTradeAlert([trade.buyer_id, trade.seller_id].filter(Boolean), trade, 'dispute_resolved').catch(() => { });
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin-only — full power to resolve any open dispute directly, at any time.
// Regular moderators still vote toward the 3-vote quorum as normal; this is a
// parallel fast path reserved for admins only (never regular moderators).
app.post('/api/admin/disputes/:id/override', verifyToken, async (req, res) => {
  try {
    const { resolution, reason } = req.body;
    if (!['BUYER_WINS', 'SELLER_WINS', 'CANCEL'].includes(resolution)) return res.status(400).json({ error: 'Invalid resolution' });
    if (!reason || !reason.trim()) return res.status(400).json({ error: 'A written reason is required to override.' });

    const { data: userData } = await supabaseAdmin.from('users').select('is_admin, email, full_name, username').eq('id', req.userId).single();
    const isFullAdmin = !!(userData?.is_admin || userData?.email === ADMIN_EMAIL);
    if (!isFullAdmin) return res.status(403).json({ error: 'Only an admin can override a dispute.' });

    const { data: trade } = await supabaseAdmin.from('trades').select('*').eq('id', req.params.id).single();
    if (!trade) return res.status(404).json({ error: 'Trade not found' });
    if (trade.dispute_resolution) return res.status(400).json({ error: 'This dispute has already been resolved.' });

    await tradeEscrowService.resolveDispute(trade.id, resolution, req.userId, reason);
    await supabaseAdmin.from('trades').update({ resolved_via: 'ADMIN_OVERRIDE', override_reason: reason }).eq('id', trade.id);
    await supabaseAdmin.from('dispute_comments').insert({
      trade_id: trade.id, author_id: req.userId, message: `Admin override — ${resolution.replace(/_/g, ' ')}: ${reason}`, is_admin_override: true,
    });

    const msgMap = {
      BUYER_WINS: '✅ Resolved: BUYER WINS — Bitcoin released to buyer.',
      SELLER_WINS: '✅ Resolved: SELLER WINS — Bitcoin returned to seller.',
      CANCEL: '❌ Resolved: Trade cancelled — Bitcoin returned to seller.',
    };
    await supabaseAdmin.from('messages').insert([{
      trade_id: req.params.id,
      sender_id: req.userId,
      message_text: `👨‍⚖️ Dispute resolved by ADMIN OVERRIDE (team unresponsive or split).\nDecision: ${resolution}\nReason: ${reason}\n${msgMap[resolution] || ''}`,
      message_type: 'SYSTEM',
      sender_role: 'moderator',
      created_at: new Date(),
    }]);
    for (const uid of [trade.buyer_id, trade.seller_id]) {
      await createNotification(uid, 'support', '⚖️ Dispute Resolved', `Trade #${trade.id.slice(0, 8)} dispute resolved: ${resolution}`, `/trade/${trade.id}`);
    }
    res.json({ success: true, status: 'RESOLVED', resolution, resolved_via: 'ADMIN_OVERRIDE' });

    setImmediate(async () => {
      const [buyerRes, sellerRes] = await Promise.allSettled([
        supabaseAdmin.from('users').select('id, email, username').eq('id', trade.buyer_id).single(),
        supabaseAdmin.from('users').select('id, email, username').eq('id', trade.seller_id).single(),
      ]);
      const buyerUser = buyerRes.value?.data;
      const sellerUser = sellerRes.value?.data;
      if (buyerUser?.email) emailService.sendDisputeResolvedEmail(buyerUser, trade, resolution, reason).catch(() => { });
      if (sellerUser?.email) emailService.sendDisputeResolvedEmail(sellerUser, trade, resolution, reason).catch(() => { });
      sendTradeAlert([trade.buyer_id, trade.seller_id].filter(Boolean), trade, 'dispute_resolved').catch(() => { });
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── Internal team discussion on a dispute (separate from the buyer/seller trade chat) ──
app.get('/api/admin/disputes/:id/comments', verifyToken, async (req, res) => {
  try {
    const { data: userData } = await supabaseAdmin.from('users').select('is_moderator, is_admin, email').eq('id', req.userId).single();
    const isAdmin = userData?.is_admin || userData?.is_moderator || userData?.email === ADMIN_EMAIL;
    if (!isAdmin) return res.status(403).json({ error: 'Access denied' });
    const { data, error } = await supabaseAdmin.from('dispute_comments')
      .select('id, trade_id, parent_id, message, is_admin_override, created_at, author:author_id(username, full_name, email)')
      .eq('trade_id', req.params.id).order('created_at', { ascending: true });
    if (error) return res.status(400).json({ error: error.message });
    res.json({ comments: data || [] });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/admin/disputes/:id/comments', verifyToken, async (req, res) => {
  try {
    const { message, parent_id } = req.body;
    if (!message || !message.trim()) return res.status(400).json({ error: 'Comment cannot be empty' });
    const { data: userData } = await supabaseAdmin.from('users').select('is_moderator, is_admin, email, full_name, username').eq('id', req.userId).single();
    const isAdmin = userData?.is_admin || userData?.is_moderator || userData?.email === ADMIN_EMAIL;
    if (!isAdmin) return res.status(403).json({ error: 'Access denied' });
    if (!(await hasSignedOath(req.userId))) return res.status(403).json({ error: 'Sign the Moderator Oath of Trust first — visit /moderator.' });

    const { data, error } = await supabaseAdmin.from('dispute_comments')
      .insert({ trade_id: req.params.id, author_id: req.userId, parent_id: parent_id || null, message: message.trim() })
      .select('id, trade_id, parent_id, message, is_admin_override, created_at, author:author_id(username, full_name, email)').single();
    if (error) return res.status(400).json({ error: error.message });

    const ids = (await getModeratorUserIds()).filter(id => id !== req.userId);
    for (const uid of ids) {
      await createNotification(uid, 'dispute', '💬 New dispute comment', `${userData?.full_name || userData?.username || 'A moderator'} commented on trade #${req.params.id.slice(0, 8)}`, '/moderator');
    }
    res.json({ comment: data });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/admin/moderator-login', verifyToken, async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: 'Access code required' });
    const { data: user } = await supabaseAdmin.from('users').select('id, username, is_moderator, is_admin, email').eq('id', req.userId).single();
    if (user?.is_moderator || user?.is_admin || user?.email === ADMIN_EMAIL) {
      return res.json({ success: true, moderator: { username: user?.email === ADMIN_EMAIL ? 'PRAQEN Admin' : user.username, role: user?.email === ADMIN_EMAIL ? 'admin' : 'moderator' } });
    }
    const envCode = process.env.MODERATOR_ACCESS_CODE;
    if (!envCode) return res.status(403).json({ error: 'Moderator access code is not configured.' });
    if (code !== envCode) return res.status(403).json({ error: 'Invalid moderator code' });
    res.json({ success: true, token: `mod_${req.userId}`, moderator: { username: user?.username || 'Moderator', role: 'moderator' } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// FEEDBACK / REVIEWS
// ============================================================

app.post('/api/trades/:id/feedback', verifyToken, async (req, res) => {
  try {
    const { rating, comment, toUserId } = req.body;
    if (!rating || !toUserId) return res.status(400).json({ error: 'Missing required fields' });
    if (rating < 1 || rating > 5) return res.status(400).json({ error: 'Rating must be 1–5' });
    const { data: trade } = await supabaseAdmin.from('trades').select('*').eq('id', req.params.id).single();
    if (!trade) return res.status(404).json({ error: 'Trade not found' });
    if (trade.status !== 'COMPLETED') return res.status(400).json({ error: 'Feedback can only be submitted after a trade is completed' });
    if (req.userId !== trade.buyer_id && req.userId !== trade.seller_id) return res.status(403).json({ error: 'Not a participant in this trade' });
    const { data: existing } = await supabaseAdmin.from('reviews').select('id').eq('trade_id', req.params.id).eq('reviewer_id', req.userId).single();
    if (existing) return res.status(400).json({ error: 'Feedback already submitted for this trade' });
    const { data: review, error } = await supabaseAdmin.from('reviews').insert([{ trade_id: req.params.id, reviewer_id: req.userId, reviewee_id: toUserId, rating: parseInt(rating), comment: comment || '', created_at: new Date() }]).select();
    if (error) return res.status(400).json({ error: error.message });

    // ── Atomic feedback increment via DB function ─────────────────────────────
    // Uses a single SQL UPDATE so no trigger or race condition can intercept
    // the read-modify-write cycle. DB-level guard (protect_user_stats trigger)
    // also blocks any attempt to lower the counts.
    const ratingVal = parseInt(rating);
    const { error: rpcErr } = await supabaseAdmin.rpc('praqen_add_feedback', {
      p_user_id: toUserId,
      p_rating: ratingVal,
    });
    if (rpcErr) {
      // RPC not yet deployed — fall back to safe increment
      console.warn('[feedback] praqen_add_feedback RPC not found, using fallback:', rpcErr.message);
      const { data: recipientUser } = await supabaseAdmin
        .from('users')
        .select('positive_feedback, negative_feedback, total_feedback_count, average_rating')
        .eq('id', toUserId).single();
      const prevPos = parseInt(recipientUser?.positive_feedback || 0);
      const prevNeg = parseInt(recipientUser?.negative_feedback || 0);
      const prevCount = parseInt(recipientUser?.total_feedback_count || 0);
      const prevAvg = parseFloat(recipientUser?.average_rating || 0);
      const newCount = prevCount + 1;
      await supabaseAdmin.from('users').update({
        positive_feedback: prevPos + (ratingVal >= 4 ? 1 : 0),
        negative_feedback: prevNeg + (ratingVal <= 2 ? 1 : 0),
        total_feedback_count: newCount,
        average_rating: parseFloat(((prevAvg * prevCount + ratingVal) / newCount).toFixed(2)),
      }).eq('id', toUserId);
    }

    res.json({ success: true, review: review[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// AFFILIATE
// ============================================================

app.get('/api/affiliate/stats', verifyToken, async (req, res) => {
  try {
    const userId = req.userId;
    const [earningsResult, userResult] = await Promise.all([
      supabaseAdmin.from('affiliate_earnings').select('*').eq('referrer_id', userId).order('created_at', { ascending: false }),
      supabaseAdmin.from('users').select('referral_code, total_referrals, referral_earnings_btc, badge').eq('id', userId).single(),
    ]);
    if (earningsResult.error) throw earningsResult.error;
    const earnings = earningsResult.data || [];
    const userData = userResult.data || {};
    // Use referral_earnings_btc from users table as authoritative total (updated on each trade)
    const totalEarnings = parseFloat(userData.referral_earnings_btc || 0) ||
      earnings.reduce((sum, e) => sum + parseFloat(e.commission_btc || 0), 0);
    res.json({
      success: true,
      stats: {
        totalEarningsBtc: totalEarnings,
        totalReferrals: userData.total_referrals || 0,
        totalReferralTrades: earnings.length,
        currentBadge: userData.badge || 'BEGINNER',
        referralCode: userData.referral_code || '',
      },
      earnings,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/affiliate/earnings', verifyToken, async (req, res) => {
  try {
    const { data: earnings, error } = await supabaseAdmin.from('affiliate_earnings')
      .select(`id, commission_btc, trade_amount_btc, trade_amount_usd, commission_rate, status, created_at, trade_id, referred_user_id, referrer:referrer_id(id, username), referred:referred_user_id(id, username)`)
      .eq('referrer_id', req.userId).order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ success: true, earnings: earnings || [] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/referral/earnings', verifyToken, async (req, res) => {
  try {
    const userId = req.userId;

    // Step 1 — fetch raw earnings WITHOUT a FK join so missing auth.users rows
    // can never silently drop earning rows from the result set.
    // Also fetch a plain COUNT separately — this is the authoritative Ref. Trades number.
    const [earningsResult, userResult, signupsResult, countResult] = await Promise.allSettled([
      supabaseAdmin
        .from('affiliate_earnings')
        .select('id, commission_btc, trade_amount_btc, trade_amount_usd, commission_rate, status, created_at, trade_id, referred_user_id')
        .eq('referrer_id', userId)
        .order('created_at', { ascending: false }),

      supabaseAdmin
        .from('users')
        .select('total_referrals, referral_earnings_btc')
        .eq('id', userId)
        .single(),

      supabaseAdmin
        .from('users')
        .select('id, username, avatar_url, created_at, total_trades, badge')
        .eq('referred_by', userId)
        .order('created_at', { ascending: false }),

      supabaseAdmin
        .from('affiliate_earnings')
        .select('*', { count: 'exact', head: true })
        .eq('referrer_id', userId),
    ]);

    const rawEarnings = (earningsResult.status === 'fulfilled' ? earningsResult.value.data : null) || [];
    const userData = (userResult.status === 'fulfilled' ? userResult.value.data : null) || {};
    const signups = (signupsResult.status === 'fulfilled' ? signupsResult.value.data : null) || [];
    const tradeCount = (countResult.status === 'fulfilled' ? countResult.value.count : null) ?? rawEarnings.length;

    // Step 2 — look up referred users from the public users table separately
    // (bypasses any FK to auth.users that would hide rows for deleted accounts)
    const uniqueRefIds = [...new Set(rawEarnings.map(e => e.referred_user_id).filter(Boolean))];
    let referredUserMap = {};
    if (uniqueRefIds.length > 0) {
      const { data: refUsers } = await supabaseAdmin
        .from('users')
        .select('id, username, avatar_url, created_at, total_trades, badge')
        .in('id', uniqueRefIds);
      (refUsers || []).forEach(u => { referredUserMap[u.id] = u; });
    }

    // Attach resolved user to each earning row
    const earnings = rawEarnings.map(e => ({
      ...e,
      referred_user: referredUserMap[e.referred_user_id] || null,
    }));

    const totalEarned = earnings.reduce((sum, e) => sum + parseFloat(e.commission_btc || 0), 0);

    // Map total earnings per username for the referredUsers summary card
    const earningsPerUser = {};
    earnings.forEach(e => {
      const username = e.referred_user?.username || e.referred_user_id;
      if (username) {
        earningsPerUser[username] = (earningsPerUser[username] || 0) + parseFloat(e.commission_btc || 0);
      }
    });

    // Build referredUsers list — start with proper signups (referred_by set)
    const seenIds = new Set();
    const referredUsers = signups.map(u => {
      seenIds.add(u.id);
      return { username: u.username, avatar_url: u.avatar_url || null, total_trades: u.total_trades || 0, badge: u.badge || 'BEGINNER', joined_at: u.created_at, total_earned: earningsPerUser[u.username] || 0 };
    });

    // Also include users found only in affiliate_earnings (legacy / missing referred_by)
    earnings.forEach(e => {
      const ru = e.referred_user;
      const refId = e.referred_user_id;
      if (refId && !seenIds.has(refId)) {
        seenIds.add(refId);
        referredUsers.push({
          username: ru?.username || `user_${String(refId).slice(0, 8)}`,
          avatar_url: ru?.avatar_url || null,
          total_trades: ru?.total_trades || 0,
          badge: ru?.badge || 'BEGINNER',
          joined_at: ru?.created_at || null,
          total_earned: earningsPerUser[ru?.username || refId] || 0,
        });
      }
    });

    // Use the users table referral_earnings_btc as the authoritative lifetime total.
    // The sum from affiliate_earnings rows may differ if a withdrawal was processed.
    const userReferralEarnings = parseFloat(userData.referral_earnings_btc || 0);
    const authorativeTotalEarned = userReferralEarnings > totalEarned ? userReferralEarnings : totalEarned;

    res.json({
      success: true,
      totalEarned: authorativeTotalEarned,
      userReferralEarnings,
      referralCount: userData.total_referrals != null ? userData.total_referrals : referredUsers.length,
      tradeCount,          // authoritative count of commission-generating trades
      referredUsers,
      earnings,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Public leaderboard — top 10 referrers using the most accurate data source for each metric
app.get('/api/referral/leaderboard', async (req, res) => {
  try {
    // Step 1: earnings from affiliate_earnings (authoritative for BTC earned)
    const { data: earningsRows } = await supabaseAdmin
      .from('affiliate_earnings')
      .select('referrer_id, commission_btc');

    const earningsMap = {};
    const allReferrerIds = new Set();
    (earningsRows || []).forEach(e => {
      const rid = e.referrer_id;
      earningsMap[rid] = (earningsMap[rid] || 0) + parseFloat(e.commission_btc || 0);
      allReferrerIds.add(rid);
    });

    // Step 2: fetch ALL referred users with their referrer + trade count
    // This lets us count BOTH signups AND actual trades in one pass
    const { data: signupRows } = await supabaseAdmin
      .from('users')
      .select('id, referred_by, total_trades')
      .not('referred_by', 'is', null);

    const signupCountMap = {}; // referrerId -> signup count (from referred_by)
    const tradeCountMap = {}; // referrerId -> sum of all trades by their referrals
    const referredIdSet = new Set();

    (signupRows || []).forEach(u => {
      if (!u.referred_by) return;
      signupCountMap[u.referred_by] = (signupCountMap[u.referred_by] || 0) + 1;
      tradeCountMap[u.referred_by] = (tradeCountMap[u.referred_by] || 0) + (u.total_trades || 0);
      allReferrerIds.add(u.referred_by);
      referredIdSet.add(u.id);
    });

    if (allReferrerIds.size === 0) return res.json({ success: true, leaderboard: [] });

    // Step 3: fetch referrer profiles + their cached total_referrals counter
    const { data: referrerUsers } = await supabaseAdmin
      .from('users')
      .select('id, username, badge, total_referrals')
      .in('id', [...allReferrerIds]);

    const userMap = {};
    (referrerUsers || []).forEach(u => { userMap[u.id] = u; });

    // Step 4: build leaderboard — use MAX of DB count vs cached counter for referrals
    // so old signups that missed the referred_by field still count
    const leaderboard = [...allReferrerIds]
      .filter(rid => (signupCountMap[rid] || 0) > 0 || (earningsMap[rid] || 0) > 0)
      .map(rid => {
        const cachedRefs = userMap[rid]?.total_referrals || 0;
        const actualRefs = signupCountMap[rid] || 0;
        return {
          id: rid,
          username: userMap[rid]?.username || 'Trader',
          badge: userMap[rid]?.badge || 'BEGINNER',
          earned_btc: parseFloat((earningsMap[rid] || 0).toFixed(8)),
          // Take the larger value — cached counter may include old signups
          // that predate the referred_by field being saved reliably
          referrals: Math.max(actualRefs, cachedRefs),
          // Sum of total_trades across all referred users = real activity count
          affiliate_trades: tradeCountMap[rid] || 0,
        };
      })
      .sort((a, b) => b.earned_btc - a.earned_btc || b.referrals - a.referrals)
      .slice(0, 10)
      .map((u, i) => ({ ...u, rank: i + 1 }));

    res.json({ success: true, leaderboard });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/referral/withdraw', verifyToken, authLimiter, async (req, res) => {
  try {
    const { data: earnings, error } = await supabaseAdmin
      .from('affiliate_earnings')
      .select('id, commission_btc')
      .eq('referrer_id', req.userId)
      .neq('status', 'WITHDRAWN');
    if (error) throw error;

    const totalEarnings = (earnings || []).reduce((sum, e) => sum + parseFloat(e.commission_btc || 0), 0);

    if (totalEarnings <= 0) {
      return res.status(400).json({ error: 'No earnings to withdraw' });
    }

    const btcRes = await fetch('https://api.coinbase.com/v2/prices/BTC-USD/spot');
    const btcData = await btcRes.json();
    const btcPrice = parseFloat(btcData.data.amount);

    if (totalEarnings * btcPrice < 10) {
      return res.status(400).json({ error: `Minimum $10 USD required. Current: $${(totalEarnings * btcPrice).toFixed(2)}` });
    }

    // Credit the wallets table — this is the SINGLE SOURCE OF TRUTH for balances.
    // The old code wrote to user_balances which is NOT read by the wallet page,
    // causing referral withdrawals to silently disappear from the user's view.
    const { data: walletRow, error: walletReadErr } = await supabaseAdmin
      .from('wallets')
      .select('balance_btc, locked_balance_btc')
      .eq('user_id', req.userId)
      .maybeSingle();

    if (walletReadErr) throw walletReadErr;

    const newBalance = parseFloat((parseFloat(walletRow?.balance_btc || 0) + totalEarnings).toFixed(8));

    const { error: balErr } = await supabaseAdmin
      .from('wallets')
      .update({
        balance_btc: newBalance,
        locked_balance_btc: parseFloat(walletRow?.locked_balance_btc || 0),
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', req.userId);
    if (balErr) throw balErr;

    // Mark all pending earnings as withdrawn
    const ids = earnings.map(e => e.id);
    const { error: updErr } = await supabaseAdmin
      .from('affiliate_earnings')
      .update({ status: 'WITHDRAWN' })
      .in('id', ids);
    if (updErr) throw updErr;

    // Audit trail
    await supabaseAdmin.from('wallet_transactions').insert({
      user_id: req.userId,
      type: 'REFERRAL_WITHDRAWAL',
      amount_btc: totalEarnings,
      status: 'CONFIRMED',
      notes: `Referral earnings withdrawal — ₿${totalEarnings.toFixed(8)} from ${ids.length} commission(s)`,
      created_at: new Date().toISOString(),
    }).then(null, () => { });

    res.json({ success: true, amountBtc: totalEarnings, message: `₿ ${totalEarnings.toFixed(8)} added to your wallet!` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// NOTIFICATIONS
// ============================================================

app.get('/api/notifications', verifyToken, async (req, res) => {
  try {
    const { data: notifs, error } = await supabaseAdmin
      .from('notifications').select('*')
      .eq('user_id', req.userId)
      .order('created_at', { ascending: false }).limit(50);
    if (error) return res.json({ notifications: [] });

    // Extract trade lookup keys from every notification:
    // 1. UUID from action URL  2. data.trade_id  3. any path segment after /trade/
    const tradeSelect = `id, status, trade_type, amount_btc, amount_usd, amount_local,
                 local_currency, currency_symbol, currency, amount_usdt, payment_method, gift_card_brand, trade_ref,
                 buyer_id, seller_id, created_at, completed_at, cancelled_at, cancel_reason,
                 listing:listing_id(id, listing_type, gift_card_brand, payment_method),
                 buyer:buyer_id(id, username, avatar_url, country),
                 seller:seller_id(id, username, avatar_url, country)`;

    const uuidRe = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
    const pathRe = /\/trade\/([^/?#\s]+)/i;

    // Separate UUIDs (lookup by id) from refs/slugs (lookup by trade_ref)
    const tradeUUIDs = [], tradeRefs = [];
    (notifs || []).forEach(n => {
      const fromData = n.data?.trade_id;
      const pathMatch = n.action?.match(pathRe)?.[1];
      const candidate = fromData || pathMatch;
      if (!candidate) return;
      if (uuidRe.test(candidate)) tradeUUIDs.push(candidate);
      else tradeRefs.push(candidate);
    });
    const uniqUUIDs = [...new Set(tradeUUIDs)];
    const uniqRefs = [...new Set(tradeRefs)];

    let tradeMap = {};
    if (uniqUUIDs.length > 0) {
      const { data: trades, error: tradeErr } = await supabaseAdmin
        .from('trades').select(tradeSelect).in('id', uniqUUIDs);
      if (tradeErr) console.error('[Notifications] trade UUID fetch error:', tradeErr.message);
      (trades || []).forEach(t => { tradeMap[t.id] = t; });
    }
    if (uniqRefs.length > 0) {
      const { data: trades2 } = await supabaseAdmin
        .from('trades').select(tradeSelect).in('trade_ref', uniqRefs);
      (trades2 || []).forEach(t => { tradeMap[t.id] = t; if (t.trade_ref) tradeMap[t.trade_ref] = t; });
    }

    // Extract unique actor IDs — from /profile/<uuid> URLs AND data.actor_id field
    const actorIds = [...new Set(
      (notifs || [])
        .map(n => n.action?.match(/\/profile\/([0-9a-f-]{8,})/i)?.[1] || n.data?.actor_id)
        .filter(Boolean)
    )];

    let actorMap = {};
    if (actorIds.length > 0) {
      const { data: actors } = await supabaseAdmin
        .from('users')
        .select('id, username, full_name, avatar_url, country')
        .in('id', actorIds);
      (actors || []).forEach(u => { actorMap[u.id] = u; });
    }

    const enhanced = (notifs || []).map(n => {
      const pathSeg = n.action?.match(pathRe)?.[1];
      const tradeKey = n.data?.trade_id || pathSeg;
      const trade = tradeKey ? (tradeMap[tradeKey] || null) : null;
      const actorId = n.action?.match(/\/profile\/([0-9a-f-]{8,})/i)?.[1] || n.data?.actor_id;
      let result = n;
      if (trade) result = { ...result, trade };
      if (actorId && actorMap[actorId]) result = { ...result, actor: actorMap[actorId] };
      if (n.data?.direction) result = { ...result, direction: n.data.direction };
      // Payment method: prefer live trade data, then stored in data, then parse from message
      const pm = trade?.payment_method || n.data?.payment_method
        || n.message?.match(/\bvia\s+([^·\n]+?)(?:\s*·|\s*$)/i)?.[1]?.trim();
      if (pm) result = { ...result, payment_method: pm };
      return result;
    });

    res.json({ notifications: enhanced });
  } catch { res.json({ notifications: [] }); }
});

app.put('/api/notifications/:id/read', verifyToken, async (req, res) => {
  try {
    await supabaseAdmin.from('notifications').update({ is_read: true, read_at: new Date() }).eq('id', req.params.id).eq('user_id', req.userId);
    res.json({ success: true });
  } catch { res.json({ success: true }); }
});

app.put('/api/notifications/read-all', verifyToken, async (req, res) => {
  try {
    await supabaseAdmin.from('notifications').update({ is_read: true, read_at: new Date() }).eq('user_id', req.userId).eq('is_read', false);
    res.json({ success: true });
  } catch { res.json({ success: true }); }
});

// ============================================================
// REFERRAL CHAT
// ============================================================

// GET /api/my-referrals — list of users who registered with this user's referral link
app.get('/api/my-referrals', verifyToken, async (req, res) => {
  try {
    const userId = req.userId;

    // Primary: users where referred_by = my user ID (UUID stored directly)
    const { data: signups } = await supabaseAdmin
      .from('users')
      .select('id, username, avatar_url, country, created_at, total_trades')
      .eq('referred_by', userId)
      .order('created_at', { ascending: false });

    // Legacy: also pull from affiliate_earnings in case referred_by wasn't set
    const { data: earnings } = await supabaseAdmin
      .from('affiliate_earnings')
      .select('referred_user_id')
      .eq('referrer_id', userId);

    const seenIds = new Set((signups || []).map(u => u.id));
    const extraIds = [...new Set(
      (earnings || []).map(e => e.referred_user_id).filter(id => id && !seenIds.has(id))
    )];

    let extraUsers = [];
    if (extraIds.length > 0) {
      const { data: eu } = await supabaseAdmin
        .from('users')
        .select('id, username, avatar_url, country, created_at, total_trades')
        .in('id', extraIds);
      extraUsers = eu || [];
    }

    const referrals = [...(signups || []), ...extraUsers].map(u => ({
      ...u,
      trade_count: u.total_trades || 0,
    }));

    // Also return who referred the current user so they can chat back
    const { data: myInfo } = await supabaseAdmin
      .from('users')
      .select('referred_by')
      .eq('id', userId)
      .single();

    let myReferrer = null;
    if (myInfo?.referred_by) {
      const { data: referrerData } = await supabaseAdmin
        .from('users')
        .select('id, username, avatar_url, country, created_at, total_trades')
        .eq('id', myInfo.referred_by)
        .single();
      if (referrerData) myReferrer = { ...referrerData, trade_count: referrerData.total_trades || 0 };
    }

    res.json({ referrals, myReferrer });
  } catch (e) {
    console.error('[my-referrals]', e.message);
    res.json({ referrals: [] });
  }
});

// GET /api/referral-messages/:userId — chat history between current user and a referral
app.get('/api/referral-messages/:userId', verifyToken, async (req, res) => {
  try {
    const myId = req.userId;
    const otherId = req.params.userId;

    const { data: msgs } = await supabaseAdmin
      .from('referral_messages')
      .select('*')
      .or(`and(sender_id.eq.${myId},recipient_id.eq.${otherId}),and(sender_id.eq.${otherId},recipient_id.eq.${myId})`)
      .order('created_at', { ascending: true });

    // Mark incoming messages as read
    await supabaseAdmin
      .from('referral_messages')
      .update({ is_read: true })
      .eq('sender_id', otherId)
      .eq('recipient_id', myId)
      .eq('is_read', false);

    res.json({ messages: msgs || [] });
  } catch (e) {
    console.error('[referral-messages GET]', e.message);
    res.json({ messages: [] });
  }
});

// POST /api/referral-messages/:userId — send a message to a referral (or referral replies to referrer)
app.post('/api/referral-messages/:userId', verifyToken, async (req, res) => {
  try {
    const senderId = req.userId;
    const recipientId = req.params.userId;
    const { message } = req.body;

    if (!message?.trim()) return res.status(400).json({ error: 'Message required' });

    const { data: msg, error } = await supabaseAdmin
      .from('referral_messages')
      .insert({ sender_id: senderId, recipient_id: recipientId, message: message.trim() })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });

    // Notify recipient
    await supabaseAdmin.from('notifications').insert({
      user_id: recipientId,
      type: 'referral_message',
      title: 'New message',
      message: message.trim().slice(0, 100),
      is_read: false,
      created_at: new Date(),
    }).then(null, () => { });

    res.json({ message: msg });
  } catch (e) {
    console.error('[referral-messages POST]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ============================================================
// ADMIN PROFITS
// ============================================================

app.get('/api/admin/profits', verifyToken, async (req, res) => {
  try {
    const { data: userData } = await supabaseAdmin.from('users').select('is_admin').eq('id', req.userId).single();
    if (!userData?.is_admin) return res.status(403).json({ error: 'Admin access required' });
    const { data: profits, error } = await supabaseAdmin.from('company_profits').select('*').order('collected_at', { ascending: false });
    if (error) return res.status(400).json({ error: error.message });
    const totalBtc = (profits || []).reduce((s, p) => s + parseFloat(p.profit_btc), 0);
    const totalUsd = (profits || []).reduce((s, p) => s + parseFloat(p.profit_usd), 0);
    res.json({ profits: profits || [], totalBtc: totalBtc.toFixed(8), totalUsd: totalUsd.toFixed(2), tradeCount: profits?.length || 0 });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// ADMIN — SEND WELCOME EMAILS
// ============================================================

app.post('/api/admin/send-welcome-emails', verifyToken, async (req, res) => {
  try {
    const { data: admin } = await supabaseAdmin
      .from('users').select('is_admin').eq('id', req.userId).single();
    if (!admin?.is_admin) return res.status(403).json({ error: 'Admin access required' });

    const { data: users } = await supabaseAdmin
      .from('users')
      .select('id, email, username, referral_code')
      .is('welcome_email_sent', false)
      .limit(100);

    if (!users || users.length === 0)
      return res.json({ success: true, message: 'No users to send to', sent: 0 });

    let sent = 0;
    let failed = 0;

    for (const user of users) {
      const referralCode = user.referral_code || user.username.toLowerCase();
      const affiliateLink = `https://praqen.com/signup?ref=${referralCode}`;
      const year = new Date().getFullYear();

      const html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#F0F4F1;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F0F4F1;padding:40px 16px;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#FFFFFF;border-radius:20px;overflow:hidden;box-shadow:0 8px 32px rgba(27,67,50,0.10);">

        <tr>
          <td style="background:linear-gradient(135deg,#1B4332 0%,#2D6A4F 60%,#40916C 100%);padding:36px 32px 28px;text-align:center;">
            <div style="display:inline-block;background:#F4A422;border-radius:18px;width:60px;height:60px;line-height:60px;text-align:center;margin-bottom:14px;">
              <span style="font-size:32px;font-weight:900;color:#1B4332;font-family:Georgia,serif;">P</span>
            </div>
            <h1 style="color:#FFFFFF;font-size:26px;font-weight:900;margin:0 0 4px 0;">PRAQEN</h1>
            <p style="color:#95C4AE;font-size:12px;margin:0;letter-spacing:1px;text-transform:uppercase;">The Global P2P Bitcoin Platform</p>
          </td>
        </tr>

        <tr>
          <td style="padding:36px 32px 28px;">
            <h2 style="color:#1B4332;font-size:20px;font-weight:800;margin:0 0 10px 0;">Welcome to PRAQEN, ${user.username}! 🎉</h2>
            <p style="color:#475569;font-size:14px;line-height:1.7;margin:0 0 20px 0;">
              Thank you for joining the world's fastest-growing P2P Bitcoin trading platform. Your account is ready — and so is your personal referral link.
            </p>

            <table width="100%" cellpadding="0" cellspacing="0" style="background:#F0F4F1;border-radius:14px;margin-bottom:24px;">
              <tr><td style="padding:20px 24px;">
                <p style="color:#1B4332;font-size:13px;font-weight:700;margin:0 0 8px 0;text-transform:uppercase;letter-spacing:0.5px;">💰 Your Referral Link</p>
                <p style="color:#475569;font-size:13px;margin:0 0 10px 0;">Share this link — earn commission every time a referral trades.</p>
                <div style="background:#FFFFFF;border:1px solid #D1E8DA;border-radius:8px;padding:10px 14px;word-break:break-all;">
                  <a href="${affiliateLink}" style="color:#2D6A4F;font-size:13px;font-weight:600;text-decoration:none;">${affiliateLink}</a>
                </div>
              </td></tr>
            </table>

            <table width="100%" cellpadding="0" cellspacing="0" style="background:#F0F4F1;border-radius:14px;margin-bottom:24px;">
              <tr><td style="padding:20px 24px;">
                <p style="color:#1B4332;font-size:13px;font-weight:700;margin:0 0 12px 0;text-transform:uppercase;letter-spacing:0.5px;">🏆 Commission Tiers</p>
                <table width="100%" style="border-collapse:collapse;">
                  ${[
          ['1–9 trades', '0.10%'],
          ['10–24 trades', '0.15%'],
          ['25–49 trades', '0.20%'],
          ['50–99 trades', '0.25%'],
          ['100+ trades', '0.30%'],
        ].map(([tier, rate], i) => `
                  <tr style="background:${i % 2 === 0 ? '#FFFFFF' : 'transparent'};">
                    <td style="padding:6px 10px;font-size:13px;color:#475569;">${tier}</td>
                    <td style="padding:6px 10px;font-size:13px;font-weight:700;color:#1B4332;text-align:right;">${rate}</td>
                  </tr>`).join('')}
                </table>
              </td></tr>
            </table>

            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
              <tr><td style="padding:20px 24px;background:#F0F4F1;border-radius:14px;">
                <p style="color:#1B4332;font-size:13px;font-weight:700;margin:0 0 10px 0;text-transform:uppercase;letter-spacing:0.5px;">🚀 Quick Start</p>
                <ol style="color:#475569;font-size:13px;line-height:1.9;margin:0;padding-left:20px;">
                  <li>Verify your email and phone</li>
                  <li>Deposit Bitcoin to your wallet</li>
                  <li>Create a sell offer or browse buy listings</li>
                </ol>
              </td></tr>
            </table>

            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
              <tr><td align="center">
                <a href="https://praqen.com" style="display:inline-block;background:linear-gradient(135deg,#1B4332,#2D6A4F);color:#FFFFFF;padding:15px 40px;border-radius:12px;text-decoration:none;font-weight:700;font-size:15px;">Start Trading →</a>
              </td></tr>
            </table>

            <p style="color:#94A3B8;font-size:11px;margin:0;text-align:center;">
              Questions? Email <a href="mailto:support@praqen.com" style="color:#2D6A4F;">support@praqen.com</a>
            </p>
          </td>
        </tr>

        <tr>
          <td style="background:#F0F4F1;padding:18px 32px;text-align:center;">
            <p style="color:#64748B;font-size:11px;font-weight:700;margin:0 0 4px 0;">PRAQEN — SECURE P2P BITCOIN TRADING</p>
            <p style="color:#CBD5E1;font-size:10px;margin:0;">© ${year} PRAQEN. All rights reserved. 🔒 Escrow protected.</p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

      const subject = `Welcome to PRAQEN, ${user.username}! 🎉 Start Trading Bitcoin`;
      const mailOpts = {
        from: `"PRAQEN" <${process.env.EMAIL_USER || 'support@praqen.com'}>`,
        to: user.email, subject, html,
      };

      let delivered = false;

      // Try SMTP 587
      try {
        await transporter.sendMail(mailOpts);
        delivered = true;
      } catch (e1) {
        console.warn(`[Welcome] SMTP 587 failed for ${user.email}:`, e1.message);
      }

      // Try SMTP 465
      if (!delivered) {
        try {
          const sslT = require('nodemailer').createTransport({
            host: 'smtp.gmail.com', port: 465, secure: true,
            auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
          });
          await sslT.sendMail(mailOpts);
          delivered = true;
        } catch (e2) {
          console.warn(`[Welcome] SMTP 465 failed for ${user.email}:`, e2.message);
        }
      }

      // Try Resend
      if (!delivered && resendClient) {
        try {
          const { error: resendErr } = await resendClient.emails.send({
            from: RESEND_FROM_ADDR,
            to: user.email, subject, html,
          });
          if (!resendErr) delivered = true;
          else console.warn(`[Welcome] Resend failed for ${user.email}:`, resendErr.message);
        } catch (e3) {
          console.warn(`[Welcome] Resend error for ${user.email}:`, e3.message);
        }
      }

      if (delivered) {
        await supabaseAdmin.from('users').update({ welcome_email_sent: true }).eq('id', user.id);
        sent++;
        console.log(`✅ Welcome email sent to ${user.email}`);
      } else {
        failed++;
        console.error(`❌ All delivery methods failed for ${user.email}`);
      }

      // Small delay to avoid rate limits
      await new Promise(r => setTimeout(r, 300));
    }

    res.json({ success: true, sent, failed, total: users.length });
  } catch (err) {
    console.error('[send-welcome-emails] error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// ADMIN — COMPREHENSIVE MANAGEMENT ROUTES
// ============================================================

// Helper: verify admin OR moderator access — for the small set of read-only /
// team-support endpoints the Team Portal (TeamDashboard.js) actually calls
// (stats, trades/all, users search, reviews, top-traders, support tickets).
async function requireAdmin(req, res) {
  const { data: u } = await supabaseAdmin.from('users').select('is_admin, is_moderator, email').eq('id', req.userId).single();
  const ok = u?.is_admin || u?.is_moderator || u?.email === ADMIN_EMAIL;
  if (!ok) { res.status(403).json({ error: 'Admin access required' }); return null; }
  return u;
}

// Helper: verify TRUE admin access only — moderators/team members never pass this.
// Reserved for endpoints that can move funds, ban/delete accounts, grant admin,
// or broadcast to the whole user base — none of which the Team Portal exposes.
async function requireFullAdmin(req, res) {
  const { data: u } = await supabaseAdmin.from('users').select('is_admin, email').eq('id', req.userId).single();
  const ok = !!(u?.is_admin || u?.email === ADMIN_EMAIL);
  if (!ok) { res.status(403).json({ error: 'Admin access required' }); return null; }
  return u;
}

// Helper: record a privilege/verification change in admin_audit_log.
// Never let a logging failure break the underlying admin action.
async function logAdminAction(req, action, targetId, details) {
  try {
    await supabaseAdmin.from('admin_audit_log').insert({
      admin_id: req.userId,
      target_id: targetId,
      action,
      details: details || null,
      ip_address: req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || null,
    });
  } catch (e) {
    console.error('[admin_audit_log] failed to record action:', action, e.message);
  }
}

// GET /api/admin/stats — full platform overview
app.get('/api/admin/stats', verifyToken, async (req, res) => {
  try {
    const admin = await requireAdmin(req, res); if (!admin) return;
    const [usersR, tradesR, listingsR, profitsR, disputesR, kycR] = await Promise.allSettled([
      supabaseAdmin.from('users').select('id, created_at, account_status, is_email_verified, is_id_verified, badge, country', { count: 'exact' }),
      supabaseAdmin.from('trades').select('id, status, amount_usd, amount_btc, created_at', { count: 'exact' }),
      supabaseAdmin.from('listings').select('id, status', { count: 'exact' }),
      supabaseAdmin.from('company_profits').select('profit_btc, profit_usd'),
      supabaseAdmin.from('trades').select('id', { count: 'exact' }).eq('status', 'DISPUTED'),
      supabaseAdmin.from('users').select('id', { count: 'exact' }).eq('kyc_status', 'pending'),
    ]);
    const uD = usersR.status === 'fulfilled' ? usersR.value : { data: [], count: 0 };
    const tD = tradesR.status === 'fulfilled' ? tradesR.value : { data: [], count: 0 };
    const lD = listingsR.status === 'fulfilled' ? listingsR.value : { data: [], count: 0 };
    const pD = profitsR.status === 'fulfilled' ? profitsR.value : { data: [] };
    const dD = disputesR.status === 'fulfilled' ? disputesR.value : { count: 0 };
    const kD = kycR.status === 'fulfilled' ? kycR.value : { count: 0 };
    const users = uD.data || [];
    const trades = tD.data || [];
    const profits = pD.data || [];
    const now = Date.now();
    const day = 86400000;
    const newUsersToday = users.filter(u => now - new Date(u.created_at) < day).length;
    const newUsersWeek = users.filter(u => now - new Date(u.created_at) < 7 * day).length;
    const usersWithLocation = users.filter(u => u.country).length;
    const activeTrades = trades.filter(t => ['CREATED', 'FUNDS_LOCKED', 'ESCROW', 'ACTIVE', 'OPEN', 'PAYMENT_SENT', 'PAID'].includes(t.status)).length;
    const completedTrades = trades.filter(t => t.status === 'COMPLETED').length;
    const cancelledTrades = trades.filter(t => t.status === 'CANCELLED').length;
    const totalVolumeUsd = trades.filter(t => t.status === 'COMPLETED').reduce((s, t) => s + parseFloat(t.amount_usd || 0), 0);
    const totalVolumeBtc = trades.filter(t => t.status === 'COMPLETED').reduce((s, t) => s + parseFloat(t.amount_btc || 0), 0);
    const totalRevBtc = profits.reduce((s, p) => s + parseFloat(p.profit_btc || 0), 0);
    const totalRevUsd = profits.reduce((s, p) => s + parseFloat(p.profit_usd || 0), 0);
    // Trades per day last 7 days
    const tradeDays = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() - (6 - i));
      const label = d.toLocaleDateString('en-US', { weekday: 'short' });
      const count = trades.filter(t => {
        const td = new Date(t.created_at);
        return td.toDateString() === d.toDateString();
      }).length;
      return { label, count };
    });
    res.json({
      totalUsers: uD.count || users.length,
      newUsersToday, newUsersWeek,
      verifiedUsers: users.filter(u => u.is_email_verified).length,
      kycVerified: users.filter(u => u.is_id_verified).length,
      pendingKyc: kD.count || 0,
      totalTrades: tD.count || trades.length,
      activeTrades, completedTrades, cancelledTrades,
      openDisputes: dD.count || 0,
      activeListings: (lD.data || []).filter(l => l.status === 'ACTIVE').length,
      pausedListings: (lD.data || []).filter(l => l.status === 'PAUSED').length,
      closedListings: (lD.data || []).filter(l => l.status === 'CLOSED').length,
      totalListings: lD.count || 0,
      usersWithLocation,
      usersWithoutLocation: (uD.count || users.length) - usersWithLocation,
      locationCoveragePct: (uD.count || users.length) > 0 ? Math.round((usersWithLocation / (uD.count || users.length)) * 100) : 0,
      totalVolumeUsd: totalVolumeUsd.toFixed(2),
      totalVolumeBtc: totalVolumeBtc.toFixed(8),
      totalRevBtc: totalRevBtc.toFixed(8),
      totalRevUsd: totalRevUsd.toFixed(2),
      tradeDays,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/admin/users — all users with search/filter/pagination
app.get('/api/admin/users', verifyToken, async (req, res) => {
  try {
    const admin = await requireAdmin(req, res); if (!admin) return;
    const { search = '', status = '', country = '', page = 1, limit = 50 } = req.query;
    let query = supabaseAdmin.from('users')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1);
    if (search) query = query.or(`username.ilike.%${search}%,email.ilike.%${search}%,full_name.ilike.%${search}%,phone.ilike.%${search}%`);
    if (status === 'phone_pending') query = query.not('phone', 'is', null).eq('is_phone_verified', false);
    else if (status === 'kyc_pending') query = query.eq('kyc_status', 'pending');
    else if (status) query = query.eq('account_status', status);
    if (country) query = query.eq('country', country.toUpperCase());
    const { data, error, count } = await query;
    if (error) return res.status(400).json({ error: error.message });
    // Surface a phone-derived country as a fallback signal — the country
    // column can be null/stale (VPN, blocked geo lookup, etc.) but a phone
    // number's dial code is a reliable secondary source for the admin UI.
    const users = (data || []).map(u => ({ ...u, phone_country: phoneToCountryCode(u.phone) }));
    res.json({ users, total: count || 0, page: parseInt(page), limit: parseInt(limit) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/admin/users/:id — update user (ban, make admin, verify, etc.)
app.put('/api/admin/users/:id', verifyToken, async (req, res) => {
  try {
    const admin = await requireFullAdmin(req, res); if (!admin) return;
    const allowed = ['account_status', 'is_admin', 'is_moderator', 'is_id_verified', 'is_email_verified', 'badge', 'kyc_status'];
    const updates = {};
    for (const k of allowed) { if (req.body[k] !== undefined) updates[k] = req.body[k]; }
    if (!Object.keys(updates).length) return res.status(400).json({ error: 'No valid fields' });
    // Only a FULL admin (not a moderator) may grant/revoke admin or moderator role —
    // requireAdmin() treats is_moderator as sufficient for admin-panel access in general,
    // but role changes themselves must not be self-serviceable by moderators.
    if ('is_admin' in updates || 'is_moderator' in updates) {
      const isFullAdmin = admin.is_admin || admin.email === ADMIN_EMAIL;
      if (!isFullAdmin) return res.status(403).json({ error: 'Only a full admin can change admin/moderator role.' });
    }
    updates.updated_at = new Date();
    const { data, error } = await supabaseAdmin.from('users').update(updates).eq('id', req.params.id).select().single();
    if (error) return res.status(400).json({ error: error.message });
    logAdminAction(req, 'USER_UPDATE', req.params.id, updates).catch(() => { });
    res.json({ success: true, user: data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/admin/users/:id — delete user account
app.delete('/api/admin/users/:id', verifyToken, async (req, res) => {
  try {
    const admin = await requireFullAdmin(req, res); if (!admin) return;
    if (req.params.id === req.userId) return res.status(400).json({ error: 'Cannot delete your own account' });
    const { error } = await supabaseAdmin.from('users').delete().eq('id', req.params.id);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/admin/trades/all — all trades with filter/pagination
app.get('/api/admin/trades/all', verifyToken, async (req, res) => {
  try {
    const admin = await requireAdmin(req, res); if (!admin) return;
    const { status = '', page = 1, limit = 50, search = '' } = req.query;
    let query = supabaseAdmin.from('trades')
      .select('*, buyer:buyer_id(id, username, email), seller:seller_id(id, username, email)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1);
    if (status) query = query.eq('status', status);
    if (search) query = query.or(`id.ilike.%${search}%,trade_ref.ilike.%${search}%`);
    const { data, error, count } = await query;
    if (error) return res.status(400).json({ error: error.message });
    res.json({ trades: data || [], total: count || 0 });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/admin/trades/:id — force update trade status
app.put('/api/admin/trades/:id', verifyToken, async (req, res) => {
  try {
    const admin = await requireFullAdmin(req, res); if (!admin) return;
    const { status, notes } = req.body;
    if (!status) return res.status(400).json({ error: 'status required' });
    const updates = { status, admin_notes: notes, updated_at: new Date() };
    if (status === 'COMPLETED') updates.completed_at = new Date();
    if (status === 'CANCELLED') updates.cancelled_at = new Date();
    const { data, error } = await supabaseAdmin.from('trades').update(updates).eq('id', req.params.id).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true, trade: data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/admin/kyc — pending KYC submissions (resilient to missing columns)
app.get('/api/admin/kyc', verifyToken, async (req, res) => {
  try {
    const admin = await requireFullAdmin(req, res); if (!admin) return;
    const { status = 'pending' } = req.query;

    let query = supabaseAdmin.from('users')
      .select('*')
      .order('kyc_submitted_at', { ascending: true, nullsFirst: false });

    if (status === 'all') {
      query = query.or('id_front_url.not.is.null,kyc_status.not.is.null');
    } else if (status === 'pending') {
      query = query.or('kyc_status.eq.pending,and(kyc_status.is.null,id_front_url.not.is.null)');
    } else {
      query = query.eq('kyc_status', status);
    }

    const { data, error } = await query;

    if (error) {
      // KYC columns likely haven't been migrated yet — fall back to basic query
      console.warn('[admin/kyc] Column error (run admin_columns.sql):', error.message);
      const { data: fallback } = await supabaseAdmin.from('users')
        .select('id, email, username, created_at, country, is_id_verified')
        .eq('is_id_verified', false)
        .order('created_at', { ascending: false })
        .limit(50);
      return res.json({
        submissions: (fallback || []).map(u => ({ ...u, kyc_status: null, _migration_needed: true })),
        migration_needed: true,
        migration_hint: 'Run admin_columns.sql in Supabase SQL Editor to enable full KYC management.',
      });
    }

    res.json({ submissions: data || [] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/admin/backfill-kyc — set kyc_status='pending' for legacy users who uploaded docs
app.post('/api/admin/backfill-kyc', verifyToken, async (req, res) => {
  try {
    const admin = await requireFullAdmin(req, res); if (!admin) return;
    const { data, error } = await supabaseAdmin.from('users')
      .update({ kyc_status: 'pending', updated_at: new Date() })
      .not('id_front_url', 'is', null)
      .is('kyc_status', null)
      .select('id, username');
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true, updated: (data || []).length, users: data || [] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/admin/kyc/:userId/approve
app.put('/api/admin/kyc/:userId/approve', verifyToken, async (req, res) => {
  try {
    const admin = await requireFullAdmin(req, res); if (!admin) return;
    const { data: updated, error } = await supabaseAdmin.from('users')
      .update({ kyc_status: 'approved', is_id_verified: true, kyc_approved_at: new Date(), updated_at: new Date() })
      .eq('id', req.params.userId)
      .select('id, username, kyc_status, is_id_verified')
      .single();
    if (error) return res.status(400).json({ error: error.message });
    if (!updated) return res.status(404).json({ error: 'User not found' });
    logAdminAction(req, 'KYC_APPROVE', req.params.userId, null).catch(() => { });
    try {
      await createNotification(req.params.userId, 'kyc', '✅ KYC Approved', 'Your identity has been verified. You now have full access to all PRAQEN features.', '/settings');
      sendSystemAlert(req.params.userId, '🪪 KYC Approved!', 'Your identity has been verified. Full access to all PRAQEN features is now unlocked!', 'https://praqen.com/settings').catch(() => { });
    } catch (_) { }
    res.json({ success: true, user: updated });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/admin/kyc/:userId/reject
app.put('/api/admin/kyc/:userId/reject', verifyToken, async (req, res) => {
  try {
    const admin = await requireFullAdmin(req, res); if (!admin) return;
    const { reason = 'Documents unclear or invalid' } = req.body;
    const { data: updated, error } = await supabaseAdmin.from('users')
      .update({ kyc_status: 'rejected', is_id_verified: false, kyc_rejection_reason: reason, updated_at: new Date() })
      .eq('id', req.params.userId)
      .select('id, username, kyc_status, is_id_verified')
      .single();
    if (error) return res.status(400).json({ error: error.message });
    if (!updated) return res.status(404).json({ error: 'User not found' });
    try {
      await createNotification(req.params.userId, 'kyc', '❌ KYC Rejected', `Your KYC was not approved: ${reason}. Please re-submit with clearer documents.`, '/settings');
    } catch (_) { }
    res.json({ success: true, user: updated });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/admin/kyc/:userId/image?type=front|back
app.get('/api/admin/kyc/:userId/image', verifyToken, async (req, res) => {
  try {
    const admin = await requireFullAdmin(req, res); if (!admin) return;
    const { userId } = req.params;
    const { type = 'front' } = req.query;

    const { data: user, error: userErr } = await supabaseAdmin
      .from('users')
      .select('id_front_url, id_back_url')
      .eq('id', userId)
      .single();

    if (userErr || !user) return res.status(404).json({ error: 'User not found' });

    const storedUrl = type === 'back' ? user.id_back_url : user.id_front_url;
    if (!storedUrl) return res.status(404).json({ error: 'No image on file for this user' });

    // Detect content type from file extension
    const ext = (storedUrl.split('?')[0].split('.').pop() || 'jpg').toLowerCase();
    const mimeMap = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', heic: 'image/heic' };
    const contentType = mimeMap[ext] || 'image/jpeg';

    // Extract storage path from URL — handles /public/, /sign/, /authenticated/ formats
    const match = storedUrl.match(/\/object\/(?:public|sign|authenticated)\/kyc-documents\/(.+?)(?:\?|$)/);

    if (match) {
      const storagePath = decodeURIComponent(match[1]);

      // Try: download directly via service role (bypasses bucket RLS)
      const { data: fileData, error: dlErr } = await supabaseAdmin.storage
        .from('kyc-documents')
        .download(storagePath);

      if (!dlErr && fileData) {
        const buffer = Buffer.from(await fileData.arrayBuffer());
        res.set('Content-Type', contentType);
        res.set('Cache-Control', 'private, max-age=300');
        return res.send(buffer);
      }

      // Try: signed URL (works for private buckets)
      const { data: signedData } = await supabaseAdmin.storage
        .from('kyc-documents')
        .createSignedUrl(storagePath, 300);

      if (signedData?.signedUrl) {
        // Fetch the signed URL server-side and stream to admin
        const imgRes = await axios.get(signedData.signedUrl, { responseType: 'arraybuffer', timeout: 10000 });
        res.set('Content-Type', imgRes.headers['content-type'] || contentType);
        res.set('Cache-Control', 'private, max-age=300');
        return res.send(Buffer.from(imgRes.data));
      }
    }

    // Last resort: fetch the stored URL directly (works if bucket is public)
    try {
      const imgRes = await axios.get(storedUrl, { responseType: 'arraybuffer', timeout: 10000 });
      res.set('Content-Type', imgRes.headers['content-type'] || contentType);
      res.set('Cache-Control', 'private, max-age=300');
      return res.send(Buffer.from(imgRes.data));
    } catch (_) { }

    res.status(404).json({ error: 'Image could not be loaded from storage' });
  } catch (e) {
    console.error('[admin/kyc/image]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── P2P Migration admin review (Noones / Binance P2P / other leads) ──────────
// GET /api/admin/p2p-migration?status=pending|approved|rejected|all
app.get('/api/admin/p2p-migration', verifyToken, async (req, res) => {
  try {
    const admin = await requireFullAdmin(req, res); if (!admin) return;
    const { status = 'pending' } = req.query;

    let query = supabaseAdmin.from('p2p_migration_requests')
      .select('*')
      .order('created_at', { ascending: false });
    if (status !== 'all') query = query.eq('status', status);

    const { data, error } = await query;
    if (error) {
      console.warn('[admin/p2p-migration] Query error (run database/p2p_migration_requests.sql):', error.message);
      return res.json({ submissions: [], migration_needed: true, migration_hint: 'Run database/p2p_migration_requests.sql in Supabase SQL Editor.' });
    }
    res.json({ submissions: data || [] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/admin/p2p-migration/:id/approve
app.put('/api/admin/p2p-migration/:id/approve', verifyToken, async (req, res) => {
  try {
    const admin = await requireFullAdmin(req, res); if (!admin) return;
    const { usernameSeen = null, feedbackCount = null, notes = null } = req.body;
    const { data: updated, error } = await supabaseAdmin.from('p2p_migration_requests')
      .update({
        status: 'approved',
        admin_username_seen: usernameSeen,
        admin_feedback_count: feedbackCount,
        admin_notes: notes,
        reviewed_by: req.userId,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', req.params.id)
      .select().single();
    if (error) return res.status(400).json({ error: error.message });
    if (!updated) return res.status(404).json({ error: 'Submission not found' });
    logAdminAction(req, 'P2P_MIGRATION_APPROVE', req.params.id, { email: updated.email }).catch(() => { });

    // If this person has already registered (by email match), stamp their
    // verified reputation onto their PRAQEN profile right away. If they
    // haven't registered yet, /api/auth/register does this same match on
    // signup, so it works regardless of which happens first.
    let linkedUser = false;
    try {
      const { data: matchedUser } = await supabaseAdmin.from('users')
        .select('id').eq('email', updated.email).maybeSingle();
      if (matchedUser) {
        await supabaseAdmin.from('users').update({
          p2p_migrated_platform: updated.platform,
          p2p_migrated_username: usernameSeen,
          p2p_migrated_feedback: feedbackCount,
          p2p_migration_approved_at: new Date().toISOString(),
        }).eq('id', matchedUser.id);
        linkedUser = true;
        createNotification(
          matchedUser.id, 'kyc', '✅ P2P Reputation Verified',
          `Your ${MIGRATION_PLATFORM_LABELS[updated.platform] || 'P2P'} trading history has been verified and now shows on your profile.`,
          '/profile'
        ).catch(() => { });
      }
    } catch (linkErr) {
      console.warn('[admin/p2p-migration/approve] Could not link to a user account:', linkErr.message);
    }

    res.json({ success: true, submission: updated, linkedUser });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/admin/p2p-migration/:id/reject
app.put('/api/admin/p2p-migration/:id/reject', verifyToken, async (req, res) => {
  try {
    const admin = await requireFullAdmin(req, res); if (!admin) return;
    const { notes = null } = req.body;
    const { data: updated, error } = await supabaseAdmin.from('p2p_migration_requests')
      .update({
        status: 'rejected',
        admin_notes: notes,
        reviewed_by: req.userId,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', req.params.id)
      .select().single();
    if (error) return res.status(400).json({ error: error.message });
    if (!updated) return res.status(404).json({ error: 'Submission not found' });
    logAdminAction(req, 'P2P_MIGRATION_REJECT', req.params.id, { email: updated.email }).catch(() => { });
    res.json({ success: true, submission: updated });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/admin/listings/all — all listings
app.get('/api/admin/listings/all', verifyToken, async (req, res) => {
  try {
    const admin = await requireFullAdmin(req, res); if (!admin) return;
    const { status = '', page = 1, limit = 50 } = req.query;
    let query = supabaseAdmin.from('listings')
      .select('*, seller:seller_id(id, username, email)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1);
    if (status) query = query.eq('status', status);
    const { data, error, count } = await query;
    if (error) return res.status(400).json({ error: error.message });

    // ACTIVE SELL / SELL_BITCOIN / BUY_GIFT_CARD listings can be marked ACTIVE in the DB
    // yet still be silently excluded from the public GET /api/listings response when the
    // seller's live balance can't cover $10 or the listing's own minimum — that endpoint
    // deliberately leaves the DB row ACTIVE so it reappears once the seller tops up, instead
    // of writing PAUSED. Without this flag the admin table can't tell "actually live" apart
    // from "shows ACTIVE here but buyers never see it", which is confusing to audit.
    const btcRequiredTypes = ['SELL', 'SELL_BITCOIN', 'BUY_GIFT_CARD'];
    const balanceCheckedSellerIds = [...new Set(
      (data || []).filter(l => l.status === 'ACTIVE' && btcRequiredTypes.includes(l.listing_type)).map(l => l.seller_id)
    )];
    let balMap = {}, usdtBalMap = {};
    if (balanceCheckedSellerIds.length > 0) {
      const { data: wallets } = await supabaseAdmin
        .from('wallets').select('user_id, balance_btc, balance_usdt').in('user_id', balanceCheckedSellerIds);
      (wallets || []).forEach(w => {
        balMap[w.user_id] = parseFloat(w.balance_btc || 0);
        usdtBalMap[w.user_id] = parseFloat(w.balance_usdt || 0);
      });
    }
    const livePriceUsd = _btcCache || 88000;
    const enriched = (data || []).map(l => {
      if (l.status !== 'ACTIVE' || !btcRequiredTypes.includes(l.listing_type)) {
        return { ...l, effectively_visible: l.status === 'ACTIVE' };
      }
      const balanceUsd = l.asset === 'USDT' ? (usdtBalMap[l.seller_id] || 0) : (balMap[l.seller_id] || 0) * livePriceUsd;
      const minUsd = parseFloat(l.min_limit_usd || 0);
      const hiddenForBalance = balanceUsd < 10 || (minUsd > 0 && balanceUsd < minUsd);
      return { ...l, effectively_visible: !hiddenForBalance, seller_balance_usd: balanceUsd };
    });

    res.json({ listings: enriched, total: count || 0 });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/admin/listings/:id — update listing (pause/activate)
app.put('/api/admin/listings/:id', verifyToken, async (req, res) => {
  try {
    const admin = await requireFullAdmin(req, res); if (!admin) return;
    const { status } = req.body;
    const { data, error } = await supabaseAdmin.from('listings').update({ status, updated_at: new Date() }).eq('id', req.params.id).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true, listing: data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/admin/listings/:id — delete listing
app.delete('/api/admin/listings/:id', verifyToken, async (req, res) => {
  try {
    const admin = await requireFullAdmin(req, res); if (!admin) return;
    const { error } = await supabaseAdmin.from('listings').delete().eq('id', req.params.id);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/admin/broadcast — send in-app + push notification to all users
app.post('/api/admin/broadcast', verifyToken, async (req, res) => {
  try {
    const admin = await requireFullAdmin(req, res); if (!admin) return;
    const { title, message, type = 'system', url } = req.body;
    if (!title || !message) return res.status(400).json({ error: 'title and message required' });

    const { data: users } = await supabaseAdmin.from('users').select('id').eq('account_status', 'active');
    if (!users?.length) return res.json({ success: true, sent: 0 });

    // ── In-app notifications (batched DB inserts) ─────────────────────────
    const notifications = users.map(u => ({ user_id: u.id, type, title, message, is_read: false, created_at: new Date() }));
    for (let i = 0; i < notifications.length; i += 100) {
      await supabaseAdmin.from('notifications').insert(notifications.slice(i, i + 100));
    }

    // ── Push notification to ALL subscribed devices (one OneSignal call) ──
    sendBroadcastPush(title, message, url || 'https://praqen.com').catch(e =>
      console.error('[broadcast] push failed:', e.message)
    );

    res.json({ success: true, sent: users.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/admin/broadcast-email — send email broadcast to all users
app.post('/api/admin/broadcast-email', verifyToken, async (req, res) => {
  try {
    const admin = await requireFullAdmin(req, res); if (!admin) return;
    const { subject, htmlBody, broadcastType = 'broadcast' } = req.body;
    if (!subject || !htmlBody) return res.status(400).json({ error: 'subject and htmlBody required' });

    // Run in background — can take minutes for large user lists
    res.json({ success: true, message: 'Email broadcast started in background. Check server logs for progress.' });

    setImmediate(async () => {
      try {
        const result = await emailService.sendBroadcastToAllUsers(subject, htmlBody, broadcastType);
        console.log(`[broadcast-email] ✅ Done — sent:${result.sent} failed:${result.failed} total:${result.total}`);
      } catch (e) {
        console.error('[broadcast-email] ❌ Failed:', e.message);
      }
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/admin/broadcast/eid-bonus — send personalised Eid Mubarak + $2 bonus email to all users
app.post('/api/admin/broadcast/eid-bonus', verifyToken, async (req, res) => {
  try {
    const admin = await requireFullAdmin(req, res); if (!admin) return;

    // Count eligible users first so we can respond immediately
    const { count, error: countErr } = await supabaseAdmin
      .from('users')
      .select('id', { count: 'exact', head: true })
      .not('email', 'is', null);

    if (countErr) return res.status(500).json({ error: 'Failed to count users: ' + countErr.message });

    res.json({
      success: true,
      message: `Eid broadcast started in background for ~${count} users. Check server logs for progress.`,
      total: count,
    });

    // Run the bulk send after response is flushed — keeps HTTP fast
    setImmediate(async () => {
      console.log(`\n🌙 [eid-bonus] Starting Eid broadcast to ~${count} users...`);
      let sent = 0, failed = 0, page = 0;
      const PAGE = 100;

      try {
        while (true) {
          const { data: users, error: fetchErr } = await supabaseAdmin
            .from('users')
            .select('id, email, username, referral_code')
            .not('email', 'is', null)
            .not('email', 'eq', '')
            .range(page * PAGE, page * PAGE + PAGE - 1);

          if (fetchErr) { console.error('[eid-bonus] Fetch error:', fetchErr.message); break; }
          if (!users || users.length === 0) break;

          // Send in mini-batches of 5 to respect SMTP rate limits
          for (let i = 0; i < users.length; i += 5) {
            const batch = users.slice(i, i + 5);
            await Promise.allSettled(batch.map(async (u) => {
              try {
                const result = await emailService.sendEidBonusEmail({
                  userId: u.id,
                  to: u.email,
                  username: u.username || 'Trader',
                  referralCode: u.referral_code || '',
                });
                if (result.success) sent++; else { failed++; console.warn(`[eid-bonus] Failed for ${u.email}: ${result.error}`); }
              } catch (e) {
                failed++;
                console.warn(`[eid-bonus] Exception for ${u.email}:`, e.message);
              }
            }));
            // 1.5s between mini-batches
            if (i + 5 < users.length) await new Promise(r => setTimeout(r, 1500));
          }

          console.log(`[eid-bonus] Page ${page + 1}: sent=${sent} failed=${failed}`);
          if (users.length < PAGE) break;
          page++;
          // 3s pause between pages to give SMTP room to breathe
          await new Promise(r => setTimeout(r, 3000));
        }

        console.log(`✅ [eid-bonus] Broadcast complete — sent:${sent} failed:${failed} total:${sent + failed}`);
      } catch (e) {
        console.error('[eid-bonus] ❌ Fatal broadcast error:', e.message);
      }
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/admin/broadcast/usdt-announcement — send personalised "USDT Wallet is Live" + $2 bonus email to all users
app.post('/api/admin/broadcast/usdt-announcement', verifyToken, async (req, res) => {
  try {
    const admin = await requireFullAdmin(req, res); if (!admin) return;

    const { count, error: countErr } = await supabaseAdmin
      .from('users')
      .select('id', { count: 'exact', head: true })
      .not('email', 'is', null);

    if (countErr) return res.status(500).json({ error: 'Failed to count users: ' + countErr.message });

    res.json({
      success: true,
      message: `USDT announcement broadcast started in background for ~${count} users. Check server logs for progress.`,
      total: count,
    });

    setImmediate(async () => {
      console.log(`\n💵 [usdt-announcement] Starting broadcast to ~${count} users...`);
      let sent = 0, failed = 0, page = 0;
      const PAGE = 100;

      try {
        while (true) {
          const { data: users, error: fetchErr } = await supabaseAdmin
            .from('users')
            .select('id, email, username, referral_code')
            .not('email', 'is', null)
            .not('email', 'eq', '')
            .range(page * PAGE, page * PAGE + PAGE - 1);

          if (fetchErr) { console.error('[usdt-announcement] Fetch error:', fetchErr.message); break; }
          if (!users || users.length === 0) break;

          for (let i = 0; i < users.length; i += 5) {
            const batch = users.slice(i, i + 5);
            await Promise.allSettled(batch.map(async (u) => {
              try {
                const result = await emailService.sendUsdtAnnouncementEmail({
                  userId: u.id,
                  to: u.email,
                  username: u.username || 'Trader',
                  referralCode: u.referral_code || '',
                });
                if (result.success) sent++; else { failed++; console.warn(`[usdt-announcement] Failed for ${u.email}: ${result.error}`); }
              } catch (e) {
                failed++;
                console.warn(`[usdt-announcement] Exception for ${u.email}:`, e.message);
              }
            }));
            if (i + 5 < users.length) await new Promise(r => setTimeout(r, 1500));
          }

          console.log(`[usdt-announcement] Page ${page + 1}: sent=${sent} failed=${failed}`);
          if (users.length < PAGE) break;
          page++;
          await new Promise(r => setTimeout(r, 3000));
        }

        console.log(`✅ [usdt-announcement] Broadcast complete — sent:${sent} failed:${failed} total:${sent + failed}`);
      } catch (e) {
        console.error('[usdt-announcement] ❌ Fatal broadcast error:', e.message);
      }
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/admin/revenue — revenue over time
app.get('/api/admin/revenue', verifyToken, async (req, res) => {
  try {
    const admin = await requireFullAdmin(req, res); if (!admin) return;
    const { data: profits } = await supabaseAdmin.from('company_profits').select('*').order('collected_at', { ascending: false }).limit(200);
    const { data: affiliates } = await supabaseAdmin.from('affiliate_earnings').select('commission_btc, commission_usd, status, created_at').order('created_at', { ascending: false }).limit(100);
    const totalRevBtc = (profits || []).reduce((s, p) => s + parseFloat(p.profit_btc || 0), 0);
    const totalRevUsd = (profits || []).reduce((s, p) => s + parseFloat(p.profit_usd || 0), 0);
    const totalAffBtc = (affiliates || []).filter(a => a.status === 'COMPLETED').reduce((s, a) => s + parseFloat(a.commission_btc || 0), 0);
    res.json({ profits: profits || [], affiliates: affiliates || [], totalRevBtc: totalRevBtc.toFixed(8), totalRevUsd: totalRevUsd.toFixed(2), totalAffBtc: totalAffBtc.toFixed(8) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/admin/transfers — internal + external transfer activity + escrow wallet balance
app.get('/api/admin/transfers', verifyToken, async (req, res) => {
  try {
    const admin = await requireFullAdmin(req, res); if (!admin) return;
    const COMPANY_WALLET_ID = '14762cd0-d3b2-474f-acab-fe0071961e9a';

    const [
      { data: internalRaw },
      { data: withdrawals },
      { data: escrowBal },
    ] = await Promise.all([
      supabaseAdmin.from('wallet_transactions')
        .select('id, user_id, amount_btc, notes, created_at, tx_hash')
        .eq('type', 'TRANSFER_OUT')
        .order('created_at', { ascending: false })
        .limit(200),
      supabaseAdmin.from('wallet_transactions')
        .select('id, user_id, amount_btc, status, notes, created_at')
        .eq('type', 'WITHDRAWAL')
        .order('created_at', { ascending: false })
        .limit(200),
      supabaseAdmin.from('user_balances')
        .select('balance_btc, available_btc')
        .eq('user_id', COMPANY_WALLET_ID)
        .single(),
    ]);

    // Pull sender usernames for internal transfers
    const senderIds = [...new Set((internalRaw || []).map(t => t.user_id))];
    const withdrawalUserIds = [...new Set((withdrawals || []).map(t => t.user_id))];
    const allUserIds = [...new Set([...senderIds, ...withdrawalUserIds])];
    const { data: usersRaw } = await supabaseAdmin.from('users')
      .select('id, username, full_name').in('id', allUserIds);
    const userMap = Object.fromEntries((usersRaw || []).map(u => [u.id, u.username || u.full_name || u.id.slice(0, 8)]));

    // Parse recipient from notes: "Internal transfer → @alice · No fee"
    const internal = (internalRaw || []).map(t => {
      const m = t.notes?.match(/→ @(\S+)/);
      return {
        ...t,
        sender: userMap[t.user_id] || t.user_id.slice(0, 8),
        recipient: m ? m[1].replace(/·.*$/, '').trim() : '—',
      };
    });

    const externalWithNames = (withdrawals || []).map(t => ({
      ...t,
      username: userMap[t.user_id] || t.user_id.slice(0, 8),
    }));

    const totalInternalBtc = internal.reduce((s, t) => s + parseFloat(t.amount_btc || 0), 0);
    const totalExternalBtc = (withdrawals || []).reduce((s, t) => s + parseFloat(t.amount_btc || 0), 0);

    res.json({
      internal,
      withdrawals: externalWithNames,
      escrowBalanceBtc: escrowBal?.balance_btc ?? null,
      escrowAvailableBtc: escrowBal?.available_btc ?? null,
      totalInternalBtc: totalInternalBtc.toFixed(8),
      totalExternalBtc: totalExternalBtc.toFixed(8),
      internalCount: internal.length,
      withdrawalCount: (withdrawals || []).length,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/admin/users/:id/verify-email — manually verify email
app.put('/api/admin/users/:id/verify-email', verifyToken, async (req, res) => {
  try {
    const admin = await requireFullAdmin(req, res); if (!admin) return;
    const { data, error } = await supabaseAdmin.from('users').update({ is_email_verified: true, updated_at: new Date() }).eq('id', req.params.id).select().single();
    if (error) return res.status(400).json({ error: error.message });
    logAdminAction(req, 'VERIFY_EMAIL', req.params.id, null).catch(() => { });
    await createNotification(req.params.id, 'system', '📧 Email Verified', 'Your email address has been manually verified by an admin.', '/settings');
    res.json({ success: true, user: data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/admin/users/:id/verify-phone — manually verify phone (legacy button in Users panel)
app.put('/api/admin/users/:id/verify-phone', verifyToken, async (req, res) => {
  try {
    const admin = await requireFullAdmin(req, res); if (!admin) return;
    const { data, error } = await supabaseAdmin.from('users').update({ is_phone_verified: true, phone_verified: true, updated_at: new Date() }).eq('id', req.params.id).select().single();
    if (error) return res.status(400).json({ error: error.message });
    logAdminAction(req, 'VERIFY_PHONE', req.params.id, null).catch(() => { });
    // Update request row if it exists
    await supabaseAdmin.from('phone_verification_requests')
      .update({ status: 'approved', reviewed_at: new Date().toISOString(), reviewed_by: req.userId })
      .eq('user_id', req.params.id).then(null, () => { });
    await createNotification(req.params.id, 'system', '📱 Phone Number Verified!', 'Great news! Your phone number has been verified by our team. Your trade limit has been upgraded. You can now continue trading.', '/settings?tab=verification');
    sendSystemAlert(req.params.id, '📱 Phone Verified!', 'Your phone number has been verified. Trade limits upgraded!', 'https://praqen.com/settings?tab=verification').catch(() => { });
    res.json({ success: true, user: data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Phone verification request endpoints ──────────────────────────────────────

// GET /api/admin/phone-verifications/pending — list all requests with user info
app.get('/api/admin/phone-verifications/pending', verifyToken, async (req, res) => {
  try {
    const admin = await requireFullAdmin(req, res); if (!admin) return;
    const { status = 'pending', page = 1, limit = 50 } = req.query;
    const from = (parseInt(page) - 1) * parseInt(limit);
    const to = from + parseInt(limit) - 1;

    let query = supabaseAdmin
      .from('phone_verification_requests')
      .select('id, user_id, phone, status, submitted_at, reviewed_at, rejection_reason', { count: 'exact' })
      .order('submitted_at', { ascending: false })
      .range(from, to);

    if (status && status !== 'all') query = query.eq('status', status);

    const { data: requests, count, error } = await query;
    if (error) return res.status(400).json({ error: error.message });

    // Attach user info for each request
    const userIds = [...new Set((requests || []).map(r => r.user_id))];
    let usersMap = {};
    if (userIds.length > 0) {
      const { data: users } = await supabaseAdmin
        .from('users')
        .select('id, username, email, full_name, avatar_url, is_phone_verified, created_at')
        .in('id', userIds);
      (users || []).forEach(u => { usersMap[u.id] = u; });
    }

    const enriched = (requests || []).map(r => ({ ...r, user: usersMap[r.user_id] || null }));
    res.json({ requests: enriched, total: count || 0 });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/admin/phone-verifications/:id/approve — approve a phone request
app.put('/api/admin/phone-verifications/:id/approve', verifyToken, async (req, res) => {
  try {
    const admin = await requireFullAdmin(req, res); if (!admin) return;

    const { data: request, error: fetchErr } = await supabaseAdmin
      .from('phone_verification_requests')
      .select('*').eq('id', req.params.id).single();
    if (fetchErr || !request) return res.status(404).json({ error: 'Verification request not found' });

    // Mark request as approved
    const { error: reqErr } = await supabaseAdmin
      .from('phone_verification_requests')
      .update({ status: 'approved', reviewed_at: new Date().toISOString(), reviewed_by: req.userId })
      .eq('id', req.params.id);
    if (reqErr) return res.status(400).json({ error: reqErr.message });

    // Mark user as phone-verified
    const { error: userErr } = await supabaseAdmin
      .from('users')
      .update({ is_phone_verified: true, phone_verified: true, phone: request.phone, updated_at: new Date().toISOString() })
      .eq('id', request.user_id);
    if (userErr) return res.status(400).json({ error: userErr.message });

    // Notify the user
    await createNotification(request.user_id, 'system', '📱 Phone Number Verified!',
      `Your number ${request.phone} has been verified. Your trade limits have been upgraded!`,
      '/settings?tab=verification').catch(() => { });
    sendSystemAlert(request.user_id, '📱 Phone Verified!',
      'Your phone number has been verified. Trade limits upgraded!',
      'https://praqen.com/settings?tab=verification').catch(() => { });

    console.log(`[phone-verif] ✅ Admin ${req.userId.slice(0, 8)} approved ${request.phone} for user ${request.user_id.slice(0, 8)}`);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/admin/phone-verifications/:id/reject — reject a phone request
app.put('/api/admin/phone-verifications/:id/reject', verifyToken, async (req, res) => {
  try {
    const admin = await requireFullAdmin(req, res); if (!admin) return;
    const { reason = 'Phone number could not be verified' } = req.body;

    const { data: request, error: fetchErr } = await supabaseAdmin
      .from('phone_verification_requests')
      .select('*').eq('id', req.params.id).single();
    if (fetchErr || !request) return res.status(404).json({ error: 'Verification request not found' });

    // Mark request as rejected
    const { error: reqErr } = await supabaseAdmin
      .from('phone_verification_requests')
      .update({ status: 'rejected', reviewed_at: new Date().toISOString(), reviewed_by: req.userId, rejection_reason: reason })
      .eq('id', req.params.id);
    if (reqErr) return res.status(400).json({ error: reqErr.message });

    // Clear the phone from users table so they can re-submit
    await supabaseAdmin
      .from('users')
      .update({ phone: null, updated_at: new Date().toISOString() })
      .eq('id', request.user_id).then(null, () => { });

    // Notify the user
    await createNotification(request.user_id, 'system', '📱 Phone Verification Failed',
      `We could not verify ${request.phone}. Reason: ${reason}. Please submit a valid number.`,
      '/settings?tab=verification').catch(() => { });

    console.log(`[phone-verif] ❌ Admin ${req.userId.slice(0, 8)} rejected ${request.phone} for user ${request.user_id.slice(0, 8)}`);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Direct user-table phone endpoints (reliable regardless of phone_verification_requests table) ──

// GET /api/admin/phone/pending — users who have a phone but are not yet verified
app.get('/api/admin/phone/pending', verifyToken, async (req, res) => {
  try {
    const admin = await requireFullAdmin(req, res); if (!admin) return;

    // Fetch pending users and their submission timestamps in parallel
    const [usersRes, reqsRes] = await Promise.all([
      supabaseAdmin
        .from('users')
        .select('id, username, full_name, email, phone, is_phone_verified, created_at, last_login, country, avatar_url')
        .not('phone', 'is', null)
        .neq('phone', '')
        .eq('is_phone_verified', false)
        .order('created_at', { ascending: false })
        .limit(200),
      supabaseAdmin
        .from('phone_verification_requests')
        .select('user_id, submitted_at, status')
        .eq('status', 'pending'),
    ]);

    if (usersRes.error) return res.status(400).json({ error: usersRes.error.message });

    // Map submission timestamps by user_id
    const submittedAt = new Map(
      (reqsRes.data || []).map(r => [r.user_id, r.submitted_at])
    );

    const enriched = (usersRes.data || []).map(u => ({
      ...u,
      submitted_at: submittedAt.get(u.id) || null,
      phone_country: phoneToCountryCode(u.phone),
    }));

    // Sort by earliest submission first so oldest waiting users appear at top
    enriched.sort((a, b) => {
      const da = new Date(a.submitted_at || a.created_at);
      const db = new Date(b.submitted_at || b.created_at);
      return da - db;
    });

    res.json({ users: enriched, total: enriched.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/admin/phone/approve — approve a user's phone number by userId
app.post('/api/admin/phone/approve', verifyToken, async (req, res) => {
  try {
    const admin = await requireFullAdmin(req, res); if (!admin) return;
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId required' });

    // If users.phone is null (submission bug), recover it from phone_verification_requests
    const { data: existingUser } = await supabaseAdmin
      .from('users').select('phone').eq('id', userId).single();
    if (!existingUser?.phone) {
      const { data: pvr } = await supabaseAdmin
        .from('phone_verification_requests').select('phone').eq('user_id', userId).single();
      if (pvr?.phone) {
        await supabaseAdmin.from('users')
          .update({ phone: pvr.phone }).eq('id', userId).then(null, () => { });
        console.log(`[phone/approve] recovered missing phone ${pvr.phone} for user ${userId.slice(0, 8)}`);
      }
    }

    const { data: user, error } = await supabaseAdmin
      .from('users')
      .update({ is_phone_verified: true, phone_verified: true, updated_at: new Date().toISOString() })
      .eq('id', userId)
      .select('id, username, phone')
      .single();
    if (error) return res.status(400).json({ error: error.message });
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Also mark any pending request row as approved
    await supabaseAdmin.from('phone_verification_requests')
      .update({ status: 'approved', reviewed_at: new Date().toISOString(), reviewed_by: req.userId })
      .eq('user_id', userId).then(null, () => { });

    await createNotification(userId, 'system', '📱 Phone Number Verified!',
      'Your phone number has been verified by our team. Your trade limits have been upgraded!',
      '/settings?tab=verification').catch(() => { });
    sendSystemAlert(userId, '📱 Phone Verified!',
      'Your phone number has been verified. Trade limits upgraded!',
      'https://praqen.com/settings?tab=verification').catch(() => { });

    console.log(`[phone/approve] ✅ Admin ${req.userId.slice(0, 8)} approved ${user.phone} for user ${userId.slice(0, 8)}`);
    res.json({ success: true, user });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/admin/phone/reject — reject a user's phone (clears it so they can re-submit)
app.post('/api/admin/phone/reject', verifyToken, async (req, res) => {
  try {
    const admin = await requireFullAdmin(req, res); if (!admin) return;
    const { userId, reason = 'Phone number could not be verified' } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId required' });

    // Get the phone number before clearing it
    const { data: existing } = await supabaseAdmin
      .from('users').select('phone').eq('id', userId).single();
    const phone = existing?.phone || 'unknown';

    const { error } = await supabaseAdmin
      .from('users')
      .update({ phone: null, is_phone_verified: false, phone_verified: false, updated_at: new Date().toISOString() })
      .eq('id', userId);
    if (error) return res.status(400).json({ error: error.message });

    await supabaseAdmin.from('phone_verification_requests')
      .update({ status: 'rejected', reviewed_at: new Date().toISOString(), reviewed_by: req.userId, rejection_reason: reason })
      .eq('user_id', userId).then(null, () => { });

    await createNotification(userId, 'system', '📱 Phone Verification Failed',
      `Your phone number (${phone}) could not be verified. Reason: ${reason}. Please submit a valid number.`,
      '/settings?tab=verification').catch(() => { });

    console.log(`[phone/reject] ❌ Admin ${req.userId.slice(0, 8)} rejected ${phone} for user ${userId.slice(0, 8)}`);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/admin/users/:id/ban — ban a user
app.put('/api/admin/users/:id/ban', verifyToken, async (req, res) => {
  try {
    const admin = await requireFullAdmin(req, res); if (!admin) return;
    const { reason = '' } = req.body;
    if (req.params.id === req.userId) return res.status(400).json({ error: 'Cannot ban your own account' });
    const { data, error } = await supabaseAdmin.from('users').update({ account_status: 'banned', updated_at: new Date() }).eq('id', req.params.id).select().single();
    if (error) return res.status(400).json({ error: error.message });
    logAdminAction(req, 'BAN', req.params.id, { reason }).catch(() => { });
    if (reason) await createNotification(req.params.id, 'security', '🚫 Account Banned', `Your account has been banned. Reason: ${reason}`, '/');
    res.json({ success: true, user: data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/admin/users/:id/unban — reinstate a banned user
app.put('/api/admin/users/:id/unban', verifyToken, async (req, res) => {
  try {
    const admin = await requireFullAdmin(req, res); if (!admin) return;
    const { data, error } = await supabaseAdmin.from('users').update({ account_status: 'active', updated_at: new Date() }).eq('id', req.params.id).select().single();
    if (error) return res.status(400).json({ error: error.message });
    logAdminAction(req, 'UNBAN', req.params.id, null).catch(() => { });
    await createNotification(req.params.id, 'system', '✅ Account Reinstated', 'Your account ban has been lifted. Welcome back to PRAQEN!', '/dashboard');
    res.json({ success: true, user: data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/admin/users/:id/make-admin — toggle admin role
app.put('/api/admin/users/:id/make-admin', verifyToken, async (req, res) => {
  try {
    const admin = await requireFullAdmin(req, res); if (!admin) return;
    const isFullAdmin = admin.is_admin || admin.email === ADMIN_EMAIL;
    if (!isFullAdmin) return res.status(403).json({ error: 'Only a full admin can change admin role.' });
    const { data: cur } = await supabaseAdmin.from('users').select('is_admin').eq('id', req.params.id).single();
    const newVal = !cur?.is_admin;
    const { data, error } = await supabaseAdmin.from('users').update({ is_admin: newVal, updated_at: new Date() }).eq('id', req.params.id).select().single();
    if (error) return res.status(400).json({ error: error.message });
    logAdminAction(req, 'MAKE_ADMIN', req.params.id, { is_admin: newVal }).catch(() => { });
    res.json({ success: true, user: data, is_admin: newVal });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/admin/users/new — users who joined in the last 7 days
app.get('/api/admin/users/new', verifyToken, async (req, res) => {
  try {
    const admin = await requireFullAdmin(req, res); if (!admin) return;
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data, error, count } = await supabaseAdmin.from('users')
      .select('id, email, username, full_name, avatar_url, account_status, is_email_verified, is_phone_verified, is_id_verified, total_trades, country, country_name, city, phone, created_at, last_login', { count: 'exact' })
      .gte('created_at', since)
      .order('created_at', { ascending: false });
    if (error) return res.status(400).json({ error: error.message });
    const users = (data || []).map(u => ({ ...u, phone_country: phoneToCountryCode(u.phone) }));
    res.json({ users, total: count || 0 });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/admin/reports — feedback and dispute reports
app.get('/api/admin/reports', verifyToken, async (req, res) => {
  try {
    const admin = await requireFullAdmin(req, res); if (!admin) return;
    const [feedbackR, disputesR] = await Promise.all([
      supabaseAdmin.from('trade_feedback')
        .select('id, rating, comment, created_at, reviewer:reviewer_id(username, email), reviewed:reviewed_id(username, email), trade:trade_id(id, trade_ref, status, amount_usd)')
        .order('created_at', { ascending: false })
        .limit(100),
      supabaseAdmin.from('trades')
        .select('id, trade_ref, status, amount_usd, amount_btc, dispute_reason, disputed_at, created_at, buyer:buyer_id(username, email), seller:seller_id(username, email)')
        .eq('status', 'DISPUTED')
        .order('disputed_at', { ascending: false })
        .limit(50),
    ]);
    res.json({ feedback: feedbackR.data || [], disputes: disputesR.data || [] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/admin/reviews — all platform reviews/feedback
app.get('/api/admin/reviews', verifyToken, async (req, res) => {
  try {
    const admin = await requireAdmin(req, res); if (!admin) return;
    const { page = 1, limit = 30, rating = '' } = req.query;
    let query = supabaseAdmin.from('reviews')
      .select('*, reviewer:reviewer_id(id, username, average_rating), reviewee:reviewee_id(id, username, total_trades)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1);
    if (rating) query = query.eq('rating', parseInt(rating));
    const { data, error, count } = await query;
    if (error) return res.status(400).json({ error: error.message });
    res.json({ reviews: data || [], total: count || 0 });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/admin/top-traders — users sorted by volume/trades
app.get('/api/admin/top-traders', verifyToken, async (req, res) => {
  try {
    const admin = await requireAdmin(req, res); if (!admin) return;
    const { sort = 'trades', limit = 30 } = req.query;

    // Fetch users sorted by trade count first
    const { data: users, error } = await supabaseAdmin.from('users')
      .select('id, username, email, full_name, total_trades, completion_rate, average_rating, total_feedback_count, positive_feedback, negative_feedback, badge, country, created_at, account_status, last_seen_at, avatar_url')
      .gt('total_trades', 0)
      .order('total_trades', { ascending: false, nullsFirst: false })
      .limit(100);
    if (error) return res.status(400).json({ error: error.message });

    let traders = users || [];

    if (sort === 'volume') {
      // Compute real BTC volume from completed trades for each user
      const ids = traders.map(u => u.id);
      if (ids.length > 0) {
        const { data: tradeSums } = await supabaseAdmin
          .from('trades')
          .select('buyer_id, seller_id, btc_amount')
          .eq('status', 'COMPLETED')
          .or(ids.map(id => `buyer_id.eq.${id},seller_id.eq.${id}`).join(','));
        const volMap = {};
        (tradeSums || []).forEach(t => {
          const amt = parseFloat(t.btc_amount || 0);
          volMap[t.buyer_id] = (volMap[t.buyer_id] || 0) + amt;
          volMap[t.seller_id] = (volMap[t.seller_id] || 0) + amt;
        });
        traders = traders.map(u => ({ ...u, volume_btc: volMap[u.id] || 0 }))
          .sort((a, b) => b.volume_btc - a.volume_btc);
      }
    } else {
      traders = traders.map(u => ({ ...u, volume_btc: 0 }));
    }

    res.json({ traders: traders.slice(0, parseInt(limit)) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/admin/activity — recent user activity logs
app.get('/api/admin/activity', verifyToken, async (req, res) => {
  try {
    const admin = await requireFullAdmin(req, res); if (!admin) return;
    const { data, error } = await supabaseAdmin.from('users')
      .select('id, username, email, last_login, last_seen_at, created_at, total_trades, account_status, country, city, phone, is_email_verified, is_phone_verified, is_id_verified')
      .not('last_seen_at', 'is', null)
      .order('last_seen_at', { ascending: false })
      .limit(100);
    if (error) return res.status(400).json({ error: error.message });
    const activity = (data || []).map(u => ({ ...u, phone_country: phoneToCountryCode(u.phone) }));
    res.json({ activity });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================================
// COMMUNITY SUGGESTIONS BOARD
// ============================================================

// Helper: flatten joined user onto suggestion row
function flattenSuggestion(s) {
  const username = s.users?.username || s.username || 'Anonymous';
  const { users: _u, ...rest } = s;
  return { ...rest, username };
}

// GET /api/suggestions — public list (optional auth for user_voted flag)
app.get('/api/suggestions', optionalAuth, async (req, res) => {
  try {
    const { sort = 'votes', category = '', status = '', page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    let query = supabaseAdmin.from('suggestions')
      .select('*, users!suggestions_user_id_fkey(id, username)', { count: 'exact' })
      .order('is_pinned', { ascending: false })
      .order(sort === 'votes' ? 'upvotes' : 'created_at', { ascending: false })
      .range(offset, offset + parseInt(limit) - 1);

    if (category) query = query.eq('category', category);
    if (status) query = query.eq('status', status);

    const { data, error, count } = await query;
    if (error) return res.status(400).json({ error: error.message });

    // Attach user_voted flag for logged-in users
    let votedSet = new Set();
    if (req.userId && data?.length) {
      const ids = data.map(s => s.id);
      const { data: votes } = await supabaseAdmin.from('suggestion_votes')
        .select('suggestion_id')
        .eq('user_id', req.userId)
        .in('suggestion_id', ids);
      votedSet = new Set((votes || []).map(v => v.suggestion_id));
    }

    res.json({
      suggestions: (data || []).map(s => ({ ...flattenSuggestion(s), user_voted: votedSet.has(s.id) })),
      total: count || 0,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/suggestions — submit a new suggestion (requires auth)
app.post('/api/suggestions', verifyToken, async (req, res) => {
  try {
    const { title, body, category = 'feature' } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: 'Title is required' });
    if (title.length > 200) return res.status(400).json({ error: 'Title too long (max 200 chars)' });

    const VALID_CATS = ['feature', 'trading', 'bug', 'improvement', 'other'];
    const safeCategory = VALID_CATS.includes(category) ? category : 'other';

    const { data: user } = await supabaseAdmin.from('users')
      .select('username, account_status').eq('id', req.userId).single();
    if (user?.account_status === 'banned') return res.status(403).json({ error: 'Account suspended' });

    // Insert without username — we join users table on read
    const { data, error } = await supabaseAdmin.from('suggestions').insert({
      user_id: req.userId,
      title: title.trim(),
      body: body?.trim()?.slice(0, 1000) || null,
      category: safeCategory,
      upvotes: 0,
      status: 'open',
      created_at: new Date(),
      updated_at: new Date(),
    }).select('*, users!suggestions_user_id_fkey(id, username)').single();

    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true, suggestion: { ...flattenSuggestion(data), user_voted: false } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/suggestions/:id/vote — toggle upvote
app.post('/api/suggestions/:id/vote', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    const { data: existing } = await supabaseAdmin.from('suggestion_votes')
      .select('id').eq('suggestion_id', id).eq('user_id', req.userId).maybeSingle();

    const { data: current } = await supabaseAdmin.from('suggestions')
      .select('upvotes').eq('id', id).single();

    let voted;
    if (existing) {
      await supabaseAdmin.from('suggestion_votes')
        .delete().eq('suggestion_id', id).eq('user_id', req.userId);
      await supabaseAdmin.from('suggestions')
        .update({ upvotes: Math.max(0, (current?.upvotes || 1) - 1), updated_at: new Date() }).eq('id', id);
      voted = false;
    } else {
      await supabaseAdmin.from('suggestion_votes')
        .insert({ suggestion_id: id, user_id: req.userId, created_at: new Date() });
      await supabaseAdmin.from('suggestions')
        .update({ upvotes: (current?.upvotes || 0) + 1, updated_at: new Date() }).eq('id', id);
      voted = true;
    }

    const { data: updated } = await supabaseAdmin.from('suggestions')
      .select('upvotes').eq('id', id).single();

    res.json({ success: true, voted, upvotes: updated?.upvotes || 0 });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/admin/suggestions — admin: all suggestions with filters
app.get('/api/admin/suggestions', verifyToken, async (req, res) => {
  try {
    const admin = await requireFullAdmin(req, res); if (!admin) return;
    const { sort = 'votes', category = '', status = '', page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;

    let query = supabaseAdmin.from('suggestions')
      .select('*, users!suggestions_user_id_fkey(id, username)', { count: 'exact' })
      .order('is_pinned', { ascending: false })
      .order(sort === 'votes' ? 'upvotes' : 'created_at', { ascending: false })
      .range(offset, offset + parseInt(limit) - 1);

    if (category) query = query.eq('category', category);
    if (status) query = query.eq('status', status);

    const { data, error, count } = await query;
    if (error) return res.status(400).json({ error: error.message });
    res.json({ suggestions: (data || []).map(flattenSuggestion), total: count || 0 });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/admin/suggestions/:id — update status / reply / pin
app.put('/api/admin/suggestions/:id', verifyToken, async (req, res) => {
  try {
    const admin = await requireFullAdmin(req, res); if (!admin) return;
    const { status, admin_reply, is_pinned } = req.body;
    const updates = { updated_at: new Date() };
    if (status !== undefined) updates.status = status;
    if (is_pinned !== undefined) updates.is_pinned = is_pinned;
    if (admin_reply !== undefined) {
      updates.admin_reply = admin_reply;
      updates.admin_replied_at = new Date();
    }

    const { data, error } = await supabaseAdmin.from('suggestions')
      .update(updates).eq('id', req.params.id)
      .select('*, users!suggestions_user_id_fkey(id, username)').single();
    if (error) return res.status(400).json({ error: error.message });

    // Notify user when admin replies
    if (admin_reply !== undefined && data?.user_id && admin_reply.trim()) {
      await createNotification(
        data.user_id, 'system',
        '💬 PRAQEN Team replied to your idea',
        `Your suggestion "${(data.title || '').slice(0, 60)}" got a response from the team. Check it out!`,
        '/'
      );
    }

    res.json({ success: true, suggestion: flattenSuggestion(data) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/admin/suggestions/:id
app.delete('/api/admin/suggestions/:id', verifyToken, async (req, res) => {
  try {
    const admin = await requireFullAdmin(req, res); if (!admin) return;
    const { error } = await supabaseAdmin.from('suggestions').delete().eq('id', req.params.id);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================================
// SUPPORT TICKETS
// ============================================================

// POST /api/support/tickets — create ticket + first message
app.post('/api/support/tickets', verifyToken, async (req, res) => {
  try {
    const { subject, category, message } = req.body;
    if (!subject?.trim()) return res.status(400).json({ error: 'Subject is required' });
    if (!message?.trim()) return res.status(400).json({ error: 'Message is required' });

    const { data: ticket, error: tErr } = await supabaseAdmin
      .from('support_tickets')
      .insert({ user_id: req.userId, subject: subject.trim(), category: category || 'general', status: 'open' })
      .select().single();
    if (tErr) return res.status(400).json({ error: tErr.message });

    const { error: mErr } = await supabaseAdmin
      .from('support_messages')
      .insert({ ticket_id: ticket.id, sender_id: req.userId, is_admin: false, message: message.trim() });
    if (mErr) return res.status(400).json({ error: mErr.message });

    res.json({ success: true, ticket });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/support/tickets — user's own tickets
app.get('/api/support/tickets', verifyToken, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('support_tickets')
      .select('*')
      .eq('user_id', req.userId)
      .order('updated_at', { ascending: false });
    if (error) return res.status(400).json({ error: error.message });
    res.json({ tickets: data || [] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/support/tickets/:id/messages — chat thread
app.get('/api/support/tickets/:id/messages', verifyToken, async (req, res) => {
  try {
    const { data: ticket } = await supabaseAdmin.from('support_tickets').select('*').eq('id', req.params.id).single();
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    const { data: u } = await supabaseAdmin.from('users').select('is_admin,is_moderator').eq('id', req.userId).single();
    if (ticket.user_id !== req.userId && !u?.is_admin && !u?.is_moderator) return res.status(403).json({ error: 'Not authorized' });
    const { data: messages, error } = await supabaseAdmin.from('support_messages').select('*').eq('ticket_id', req.params.id).order('created_at', { ascending: true });
    if (error) return res.status(400).json({ error: error.message });
    res.json({ ticket, messages: messages || [] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/support/tickets/:id/messages — user sends message
app.post('/api/support/tickets/:id/messages', verifyToken, async (req, res) => {
  try {
    const { message } = req.body;
    if (!message?.trim()) return res.status(400).json({ error: 'Message is required' });
    const { data: ticket } = await supabaseAdmin.from('support_tickets').select('user_id, status').eq('id', req.params.id).single();
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    if (ticket.user_id !== req.userId) return res.status(403).json({ error: 'Not authorized' });
    if (ticket.status === 'closed') return res.status(400).json({ error: 'Ticket is closed' });
    const { data: msg, error } = await supabaseAdmin.from('support_messages')
      .insert({ ticket_id: req.params.id, sender_id: req.userId, is_admin: false, message: message.trim() })
      .select().single();
    if (error) return res.status(400).json({ error: error.message });
    await supabaseAdmin.from('support_tickets').update({ updated_at: new Date() }).eq('id', req.params.id);
    res.json({ success: true, message: msg });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/admin/support/tickets — admin lists all tickets
app.get('/api/admin/support/tickets', verifyToken, async (req, res) => {
  try {
    const admin = await requireAdmin(req, res); if (!admin) return;
    const { status = '', page = 1, limit = 100 } = req.query;
    const offset = (page - 1) * limit;
    let query = supabaseAdmin.from('support_tickets')
      .select('*, users!support_tickets_user_id_fkey(id, username, full_name, email, avatar_url, phone_number, country, created_at)', { count: 'exact' })
      .order('updated_at', { ascending: false })
      .range(offset, offset + parseInt(limit) - 1);
    if (status) query = query.eq('status', status);
    const { data, error, count } = await query;
    if (error) return res.status(400).json({ error: error.message });
    res.json({
      tickets: (data || []).map(t => ({
        ...t,
        username: t.users?.username,
        full_name: t.users?.full_name,
        user_email: t.users?.email,
        avatar_url: t.users?.avatar_url,
        user_phone: t.users?.phone_number,
        user_country: t.users?.country,
        user_joined: t.users?.created_at,
      })),
      total: count || 0,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/admin/support/tickets/:id/messages — admin reads thread
app.get('/api/admin/support/tickets/:id/messages', verifyToken, async (req, res) => {
  try {
    const admin = await requireAdmin(req, res); if (!admin) return;
    const { data: ticket } = await supabaseAdmin.from('support_tickets')
      .select('*, users!support_tickets_user_id_fkey(id, username, full_name, email, avatar_url, phone_number, country, created_at)')
      .eq('id', req.params.id).single();
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    const { data: messages } = await supabaseAdmin.from('support_messages').select('*').eq('ticket_id', req.params.id).order('created_at', { ascending: true });
    res.json({
      ticket: {
        ...ticket,
        username: ticket.users?.username,
        full_name: ticket.users?.full_name,
        user_email: ticket.users?.email,
        avatar_url: ticket.users?.avatar_url,
        user_phone: ticket.users?.phone_number,
        user_country: ticket.users?.country,
        user_joined: ticket.users?.created_at,
      },
      messages: messages || [],
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/admin/support/tickets/:id/reply — admin sends reply
app.post('/api/admin/support/tickets/:id/reply', verifyToken, async (req, res) => {
  try {
    const admin = await requireAdmin(req, res); if (!admin) return;
    const { message } = req.body;
    if (!message?.trim()) return res.status(400).json({ error: 'Reply is required' });
    const { data: ticket } = await supabaseAdmin.from('support_tickets').select('user_id, subject').eq('id', req.params.id).single();
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    const { data: msg, error } = await supabaseAdmin.from('support_messages')
      .insert({ ticket_id: req.params.id, sender_id: req.userId, is_admin: true, message: message.trim() })
      .select().single();
    if (error) return res.status(400).json({ error: error.message });
    await supabaseAdmin.from('support_tickets').update({ updated_at: new Date(), status: 'active' }).eq('id', req.params.id);
    await createNotification(
      ticket.user_id, 'system',
      '💬 Support team replied to your ticket',
      `Your ticket "${(ticket.subject || '').slice(0, 60)}" has a new reply. Open Community Board → Support to read it.`,
      '/'
    );
    res.json({ success: true, message: msg });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PATCH /api/admin/support/tickets/:id/status — admin updates status
app.patch('/api/admin/support/tickets/:id/status', verifyToken, async (req, res) => {
  try {
    const admin = await requireAdmin(req, res); if (!admin) return;
    const { status } = req.body;
    if (!['open', 'active', 'resolved', 'closed'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
    const { error } = await supabaseAdmin.from('support_tickets').update({ status, updated_at: new Date() }).eq('id', req.params.id);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================================
// GIFT CARD CODE
// ============================================================

app.post('/api/trades/:id/send-code', verifyToken, async (req, res) => {
  try {
    const { giftCardCode } = req.body;
    if (!giftCardCode) return res.status(400).json({ error: 'Code is required' });
    const { data, error } = await supabaseAdmin.from('trades')
      .update({ gift_card_code_encrypted: encryptCode(giftCardCode), code_sent_at: new Date() })
      .eq('id', req.params.id).eq('seller_id', req.userId).select();
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// WALLET ROUTES (inline — no external walletRoutes file needed)
// ============================================================

app.get('/api/wallet', verifyToken, async (req, res) => {
  try {
    const { data: user, error: userError } = await supabaseAdmin.from('users')
      .select('id, username, coinbase_wallet_id, bitcoin_wallet_address, coinbase_wallet_address, wallet_created_at').eq('id', req.userId).single();
    if (userError && userError.code === 'PGRST116') {
      // User not found in DB — genuine 404
      return res.status(404).json({ error: 'User not found' });
    }
    if (userError) {
      // Transient DB error — log and return safe default wallet state
      console.error('[GET /api/wallet] DB error:', userError.message, '| code:', userError.code);
      return res.json({ success: true, wallet: { address: null, walletId: null, created_at: null, balance_btc: 0, locked_balance_btc: 0, balance_usd: 0, has_address: false }, transactions: [] });
    }
    const [{ data: balance }, { data: balanceUsd }] = await Promise.all([
      supabaseAdmin.from('wallets').select('balance_btc, locked_balance_btc').eq('user_id', req.userId).maybeSingle(),
      supabaseAdmin.from('user_balances').select('balance_usd').eq('user_id', req.userId).maybeSingle(),
    ]);
    let address = user.bitcoin_wallet_address || user.coinbase_wallet_address;
    let walletId = user.coinbase_wallet_id;
    if (!address) {
      try {
        const wallet = await ensureWallet(req.userId, user.username);
        address = wallet.address;
        walletId = wallet.walletId;
      } catch (walletErr) {
        console.error('[GET /api/wallet] Auto-create failed:', walletErr.message);
      }
    }
    const { data: recentTrades } = await supabaseAdmin.from('trades')
      .select('id, amount_btc, amount_usd, status, created_at, completed_at')
      .or(`buyer_id.eq.${req.userId},seller_id.eq.${req.userId}`).eq('status', 'COMPLETED')
      .order('completed_at', { ascending: false }).limit(10);
    res.json({
      success: true,
      wallet: { address, walletId, created_at: user.wallet_created_at, balance_btc: parseFloat(balance?.balance_btc || 0), locked_balance_btc: parseFloat(balance?.locked_balance_btc || 0), balance_usd: parseFloat(balanceUsd?.balance_usd || 0), has_address: !!address },
      transactions: (recentTrades || []).map(t => ({ id: t.id, amount_btc: parseFloat(t.amount_btc || 0), amount_usd: parseFloat(t.amount_usd || 0), type: 'trade_completion', status: t.status, date: t.completed_at || t.created_at })),
    });
  } catch (error) {
    console.error('[GET /api/wallet] Catch error:', error.message);
    res.json({ success: true, wallet: { address: null, walletId: null, created_at: null, balance_btc: 0, locked_balance_btc: 0, balance_usd: 0, has_address: false }, transactions: [] });
  }
});

app.post('/api/wallet/create-address', verifyToken, async (req, res) => {
  try {
    const hdWallet = require('./services/hdWalletService');
    const addrData = hdWallet.generateUserAddress(req.userId);
    await Promise.all([
      supabaseAdmin.from('users').update({
        bitcoin_wallet_address: addrData.address,
        wallet_created_at: new Date().toISOString(),
      }).eq('id', req.userId),
      supabaseAdmin.from('user_wallets').upsert({
        user_id: req.userId,
        btc_address: addrData.address,
        last_onchain_btc: 0,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' }),
    ]);
    res.json({ success: true, address: addrData.address, message: 'New Bitcoin address generated successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/wallet/check-payment', verifyToken, async (req, res) => {
  try {
    // Replaced Coinbase CDP payment check with HD wallet deposit monitor
    const depositMonitor = require('./services/depositMonitor');
    const result = await depositMonitor.checkAddressNow(req.userId);
    res.json({
      success: true,
      confirmed: result.balance_btc > 0,
      balance_btc: result.balance_btc,
      address: result.address,
      message: result.balance_btc > 0
        ? `Balance: ${result.balance_btc.toFixed(8)} BTC`
        : 'No confirmed deposits yet. Bitcoin confirmations take 10–60 minutes.',
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/wallet/withdraw', verifyToken, authLimiter, requireEmailVerified, async (req, res) => {
  try {
    const { address, amountBtc } = req.body;
    if (!address || !amountBtc || amountBtc <= 0) return res.status(400).json({ error: 'Invalid withdrawal request' });

    // Level 2: Email + phone required to withdraw
    const { data: withdrawUser } = await supabaseAdmin
      .from('users').select('is_email_verified, is_phone_verified')
      .eq('id', req.userId).single();
    if (!withdrawUser?.is_email_verified || !withdrawUser?.is_phone_verified) {
      return res.status(403).json({
        error: 'Please verify your email and phone to withdraw Bitcoin.',
        requireVerification: 'both'
      });
    }
    // wallets = source of truth (matches escrow/trading/display everywhere else)
    const { data: bal } = await supabaseAdmin.from('wallets').select('balance_btc').eq('user_id', req.userId).single();
    const current = parseFloat(bal?.balance_btc || 0);
    const amount = parseFloat(amountBtc);
    if (current < amount) return res.status(400).json({ error: `Insufficient balance. You have ${current.toFixed(8)} BTC` });
    const newBal = parseFloat((current - amount).toFixed(8));
    // wallets first (source of truth), then keep secondary tables in sync
    await supabaseAdmin.from('wallets').update({ balance_btc: newBal, updated_at: new Date().toISOString() }).eq('user_id', req.userId);
    await supabaseAdmin.from('user_balances').update({ balance_btc: newBal, updated_at: new Date().toISOString() }).eq('user_id', req.userId);
    await supabaseAdmin.from('user_wallets').update({ balance_btc: newBal, updated_at: new Date().toISOString() }).eq('user_id', req.userId);
    await supabaseAdmin.from('wallet_transactions').insert({ user_id: req.userId, type: 'WITHDRAWAL', amount_btc: amount, status: 'PENDING', destination_address: address, created_at: new Date() }).maybeSingle();
    res.json({ success: true, message: `Withdrawal of ${amount} BTC to ${address} is pending processing.`, new_balance: newBal, note: 'Withdrawals are processed manually within 24 hours. Contact hello@praqen.com for urgent requests.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/wallet/internal-transfer
// FREE instant balance-to-balance transfer between two PRAQEN users.
// No on-chain broadcast, no PRAQEN platform fee, no network miner fee.
// Only trades (Buy/Sell) carry the 1% fee; Gift Card trades carry 2%.
// ─────────────────────────────────────────────────────────────────────────────
app.post('/api/wallet/internal-transfer', verifyToken, async (req, res) => {
  try {
    const { toUsername, toAddress, amountBtc } = req.body;
    const amount = parseFloat(amountBtc);

    if ((!toUsername && !toAddress) || !amountBtc || isNaN(amount) || amount <= 0) {
      return res.status(400).json({ error: 'Recipient (username or address) and a positive amount are required' });
    }

    // ── Find the recipient PRAQEN user ─────────────────────────────────────
    let recipientId, recipientUsername, recipientEmail;

    if (toUsername) {
      const { data: recipient } = await supabaseAdmin
        .from('users').select('id, username, email').eq('username', toUsername.trim()).single();
      if (!recipient) return res.status(404).json({ error: `@${toUsername} not found on PRAQEN` });
      recipientId = recipient.id;
      recipientUsername = recipient.username;
      recipientEmail = recipient.email;

    } else {
      // Look up BTC address in user_wallets — if found it is an internal PRAQEN address
      const { data: wallet } = await supabaseAdmin
        .from('user_wallets').select('user_id').eq('btc_address', toAddress.trim()).single();
      if (!wallet) {
        return res.status(404).json({
          error: 'Address not registered on PRAQEN. Use on-chain send for external addresses.',
          isExternal: true,
        });
      }
      recipientId = wallet.user_id;
      const { data: ru } = await supabaseAdmin.from('users').select('username, email').eq('id', recipientId).single();
      recipientUsername = ru?.username || 'PRAQEN User';
      recipientEmail = ru?.email;
    }

    if (String(recipientId) === String(req.userId)) {
      return res.status(400).json({ error: 'Cannot transfer to yourself' });
    }

    // ── Check sender balance (wallets = source of truth) ──────────────────
    const { data: senderWallet } = await supabaseAdmin
      .from('wallets').select('balance_btc').eq('user_id', req.userId).maybeSingle();

    const available = parseFloat(senderWallet?.balance_btc || 0);
    if (available < amount) {
      return res.status(400).json({
        error: `Insufficient balance. Available: ${available.toFixed(8)} BTC, Requested: ${amount.toFixed(8)} BTC`,
      });
    }

    // ── Deduct from sender ─────────────────────────────────────────────────
    const newSenderBalance = parseFloat((available - amount).toFixed(8));
    // wallets first (source of truth), then keep secondary tables in sync
    await supabaseAdmin.from('wallets')
      .update({ balance_btc: newSenderBalance, updated_at: new Date().toISOString() })
      .eq('user_id', req.userId);
    await supabaseAdmin.from('user_balances')
      .update({ balance_btc: newSenderBalance, updated_at: new Date().toISOString() })
      .eq('user_id', req.userId);
    await supabaseAdmin.from('user_wallets')
      .update({ balance_btc: newSenderBalance, updated_at: new Date().toISOString() })
      .eq('user_id', req.userId);

    // ── Credit recipient ───────────────────────────────────────────────────
    const { data: recipWallet } = await supabaseAdmin
      .from('wallets').select('balance_btc').eq('user_id', recipientId).maybeSingle();
    const newRecipientBalance = parseFloat((parseFloat(recipWallet?.balance_btc || 0) + amount).toFixed(8));
    // wallets first (source of truth)
    await supabaseAdmin.from('wallets')
      .update({ balance_btc: newRecipientBalance, updated_at: new Date().toISOString() })
      .eq('user_id', recipientId);
    // keep secondary tables in sync
    await supabaseAdmin.from('user_balances')
      .upsert({ user_id: recipientId, balance_btc: newRecipientBalance, updated_at: new Date().toISOString() });
    await supabaseAdmin.from('user_wallets')
      .update({ balance_btc: newRecipientBalance, updated_at: new Date().toISOString() })
      .eq('user_id', recipientId);

    // ── Generate transfer reference ────────────────────────────────────────
    const crypto = require('crypto');
    const txRef = 'INT_' + crypto
      .createHash('sha256')
      .update(`${req.userId}:${recipientId}:${amount}:${Date.now()}`)
      .digest('hex').slice(0, 20).toUpperCase();

    // ── Fetch sender info before logging ──────────────────────────────────
    const { data: senderUser } = await supabaseAdmin.from('users').select('username, email').eq('id', req.userId).single();
    const senderName = senderUser?.username || 'a PRAQEN user';
    const txTs = new Date().toISOString();

    // ── Log for sender (TRANSFER_OUT) ──────────────────────────────────────
    // Each leg gets its own unique hash so the UNIQUE constraint on tx_hash is never violated
    const { error: txOutErr } = await supabaseAdmin.from('wallet_transactions').insert({
      user_id: req.userId,
      type: 'TRANSFER_OUT',
      amount_btc: amount,
      status: 'CONFIRMED',
      tx_hash: `${txRef}_OUT`,
      notes: `Internal transfer → @${recipientUsername} · No fee`,
      created_at: txTs,
    });
    if (txOutErr) console.error('[InternalTransfer] CRITICAL: TRANSFER_OUT insert failed', txOutErr);

    // ── Log for recipient (TRANSFER_IN) ───────────────────────────────────
    const { error: txInErr } = await supabaseAdmin.from('wallet_transactions').insert({
      user_id: recipientId,
      type: 'TRANSFER_IN',
      amount_btc: amount,
      status: 'CONFIRMED',
      tx_hash: `${txRef}_IN`,
      notes: `Internal transfer received from @${senderName} · No fee`,
      created_at: txTs,
    });
    if (txInErr) console.error('[InternalTransfer] CRITICAL: TRANSFER_IN insert failed', txInErr);

    // ── Notify recipient (in-app) ──────────────────────────────────────────
    await createNotification(
      recipientId,
      'system',
      '₿ Bitcoin Received!',
      `@${senderName} sent you ₿${amount.toFixed(8)} — arrived instantly, zero fees.`,
      '/wallet'
    ).catch(() => { });

    // ── Notify sender (in-app receipt) ────────────────────────────────────
    await createNotification(
      req.userId,
      'system',
      '✅ Transfer Sent',
      `₿${amount.toFixed(8)} sent to @${recipientUsername} — instant & free. Ref: ${txRef.slice(0, 16)}`,
      '/wallet'
    ).catch(() => { });

    // ── Email notifications (fire-and-forget) ──────────────────────────────
    const txDate = new Date().toUTCString();

    const recipientHtml = `
<div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:520px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #E2E8F0">
  <div style="background:linear-gradient(135deg,#1B4332,#2D6A4F);padding:28px 32px;text-align:center">
    <h1 style="color:#F4A422;font-size:28px;margin:0;font-weight:900">₿ Bitcoin Received!</h1>
    <p style="color:rgba(255,255,255,0.7);margin:8px 0 0;font-size:14px">Instant PRAQEN internal transfer</p>
  </div>
  <div style="padding:28px 32px">
    <div style="background:#F0FAF5;border-radius:12px;padding:20px;margin-bottom:20px;text-align:center">
      <p style="color:#64748B;font-size:12px;margin:0 0 6px">You received</p>
      <p style="color:#1B4332;font-size:32px;font-weight:900;margin:0">₿ ${amount.toFixed(8)}</p>
      <p style="color:#10B981;font-size:12px;font-weight:700;margin:6px 0 0">⚡ Instant &amp; FREE — no fees</p>
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <tr><td style="color:#64748B;padding:6px 0">From</td><td style="color:#1B4332;font-weight:700;text-align:right">@${senderName}</td></tr>
      <tr><td style="color:#64748B;padding:6px 0">Network Fee</td><td style="color:#10B981;font-weight:700;text-align:right">₿ 0.00000000 (Free)</td></tr>
      <tr><td style="color:#64748B;padding:6px 0">Reference</td><td style="color:#1B4332;font-weight:700;text-align:right;font-family:monospace;font-size:11px">${txRef}</td></tr>
      <tr><td style="color:#64748B;padding:6px 0">Date</td><td style="color:#475569;text-align:right">${txDate}</td></tr>
    </table>
    <div style="text-align:center;margin-top:24px">
      <a href="https://praqen.com/wallet" style="display:inline-block;background:#2D6A4F;color:#fff;font-weight:900;padding:14px 32px;border-radius:12px;text-decoration:none;font-size:14px">View Wallet</a>
    </div>
  </div>
  <div style="background:#F8FAFC;padding:16px 32px;text-align:center">
    <p style="color:#94A3B8;font-size:11px;margin:0">PRAQEN · The world's most trusted P2P Bitcoin platform · Escrow-protected · 0.5% fee on trades</p>
  </div>
</div>`;

    const senderHtml = `
<div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:520px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #E2E8F0">
  <div style="background:linear-gradient(135deg,#1B4332,#2D6A4F);padding:28px 32px;text-align:center">
    <h1 style="color:#fff;font-size:24px;margin:0;font-weight:900">Transfer Sent ✅</h1>
    <p style="color:rgba(255,255,255,0.7);margin:8px 0 0;font-size:14px">Your PRAQEN internal transfer was delivered</p>
  </div>
  <div style="padding:28px 32px">
    <div style="background:#F8FAFC;border-radius:12px;padding:20px;margin-bottom:20px;text-align:center">
      <p style="color:#64748B;font-size:12px;margin:0 0 6px">You sent</p>
      <p style="color:#EF4444;font-size:32px;font-weight:900;margin:0">−₿ ${amount.toFixed(8)}</p>
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <tr><td style="color:#64748B;padding:6px 0">To</td><td style="color:#1B4332;font-weight:700;text-align:right">@${recipientUsername}</td></tr>
      <tr><td style="color:#64748B;padding:6px 0">Fee</td><td style="color:#10B981;font-weight:700;text-align:right">₿ 0.00000000 (Free)</td></tr>
      <tr><td style="color:#64748B;padding:6px 0">New Balance</td><td style="color:#1B4332;font-weight:700;text-align:right">₿ ${newSenderBalance.toFixed(8)}</td></tr>
      <tr><td style="color:#64748B;padding:6px 0">Reference</td><td style="color:#1B4332;font-weight:700;text-align:right;font-family:monospace;font-size:11px">${txRef}</td></tr>
      <tr><td style="color:#64748B;padding:6px 0">Date</td><td style="color:#475569;text-align:right">${txDate}</td></tr>
    </table>
    <div style="text-align:center;margin-top:24px">
      <a href="https://praqen.com/wallet" style="display:inline-block;background:#2D6A4F;color:#fff;font-weight:900;padding:14px 32px;border-radius:12px;text-decoration:none;font-size:14px">View Wallet</a>
    </div>
  </div>
  <div style="background:#F8FAFC;padding:16px 32px;text-align:center">
    <p style="color:#94A3B8;font-size:11px;margin:0">PRAQEN · The world's most trusted P2P Bitcoin platform · Escrow-protected · 0.5% fee on trades</p>
  </div>
</div>`;

    const emailFrom = `"PRAQEN" <${process.env.EMAIL_USER || 'support@praqen.com'}>`;
    Promise.all([
      recipientEmail && transporter.sendMail({ from: emailFrom, to: recipientEmail, subject: `₿ You received ${amount.toFixed(8)} BTC from @${senderName} on PRAQEN`, html: recipientHtml }),
      senderUser?.email && transporter.sendMail({ from: emailFrom, to: senderUser.email, subject: `✅ Transfer sent: ₿${amount.toFixed(8)} → @${recipientUsername}`, html: senderHtml }),
    ]).catch(err => console.warn('[InternalTransfer] Email send error (non-fatal):', err.message));

    console.log(`[InternalTransfer] @${senderUser?.username} → @${recipientUsername} | ₿${amount} | FREE | ref:${txRef}`);

    res.json({
      success: true,
      txRef,
      amount_btc: amount,
      fee: 0,
      fee_label: 'Free — internal PRAQEN transfer',
      to: recipientUsername,
      new_balance: newSenderBalance,
      message: `₿${amount.toFixed(8)} sent to @${recipientUsername} — instantly & free!`,
    });

  } catch (error) {
    console.error('[POST /api/wallet/internal-transfer]', error.message);
    res.status(500).json({ error: error.message });
  }
});

// DISABLED: this legacy route broadcast real BTC with only email verification —
// no 2FA action-code, no phone/ID (KYC) checks — unlike the current live withdrawal
// route (/api/hd-wallet/send in routes/hdWalletRoutes.js) which requires both.
// It is not called by the frontend (confirmed via grep). Left in place, disabled,
// rather than deleted, so any stale client hitting it gets a clear error instead of
// a 404 that looks like a routing bug.
app.post('/api/wallet/send', verifyToken, requireEmailVerified, async (req, res) => {
  res.status(410).json({ error: 'This endpoint has been retired. Use /api/hd-wallet/send.' });
});

// SECURITY: this endpoint credits real BTC to a user_id taken from the request body.
// It MUST verify the caller is actually Coinbase Commerce before trusting anything in
// it — otherwise anyone can POST a forged "charge:confirmed" event and mint free BTC
// for any account. Fails closed: if the webhook secret isn't configured, or the
// signature doesn't match, the event is rejected and nothing is credited.
app.post('/api/wallet/webhook', async (req, res) => {
  try {
    const secret = process.env.COINBASE_COMMERCE_WEBHOOK_SECRET;
    if (!secret) {
      console.error('[Webhook] COINBASE_COMMERCE_WEBHOOK_SECRET not configured — rejecting all events');
      return res.status(503).json({ error: 'Webhook not configured' });
    }

    const signature = req.headers['x-cc-webhook-signature'];
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body));
    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

    if (!signature || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
      console.warn('[Webhook] Invalid or missing signature — rejected');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const event = JSON.parse(rawBody.toString('utf8'));
    console.log(`[Webhook] Verified event: ${event.event?.type}`);
    if (event.event?.type === 'charge:confirmed') {
      const charge = event.event.data;
      const userId = charge.metadata?.user_id;
      const btcAmt = parseFloat(charge.payments?.[0]?.value?.crypto?.amount || 0);
      if (userId && btcAmt > 0) {
        // wallets = source of truth (matches escrow/trading/display everywhere else)
        const { data: walletRow } = await supabaseAdmin.from('wallets').select('balance_btc').eq('user_id', userId).maybeSingle();
        const newBal = parseFloat((parseFloat(walletRow?.balance_btc || 0) + btcAmt).toFixed(8));
        if (walletRow) {
          await supabaseAdmin.from('wallets').update({ balance_btc: newBal, updated_at: new Date().toISOString() }).eq('user_id', userId);
        } else {
          await supabaseAdmin.from('wallets').insert({ user_id: userId, balance_btc: newBal, locked_balance_btc: 0, updated_at: new Date().toISOString() });
        }
        // keep secondary tables in sync
        await supabaseAdmin.from('user_balances').upsert({ user_id: userId, balance_btc: newBal, updated_at: new Date().toISOString() });
        await supabaseAdmin.from('user_wallets').update({ balance_btc: newBal, updated_at: new Date().toISOString() }).eq('user_id', userId);
        await createNotification(userId, 'wallet', '💰 Bitcoin Received', `${btcAmt} BTC has been credited to your PRAQEN wallet.`, '/wallet');
      }
    }
    res.json({ received: true });
  } catch (error) {
    console.error('[Webhook] error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ── ADMIN: upgrade ALL fake addresses to real HD addresses ───────────────
// Call once: POST /api/admin/upgrade-wallets
app.post('/api/admin/upgrade-wallets', verifyToken, async (req, res) => {
  try {
    const { data: me } = await supabaseAdmin.from('users').select('is_admin').eq('id', req.userId).single();
    if (!me?.is_admin) return res.status(403).json({ error: 'Admin only' });

    const { data: users } = await supabaseAdmin
      .from('users').select('id, username, bitcoin_wallet_address');

    let upgraded = 0;
    let skipped = 0;
    for (const u of (users || [])) {
      if (!isRealBtcAddress(u.bitcoin_wallet_address)) {
        await upgradeToHDAddress(u.id, u.username);
        upgraded++;
      } else {
        skipped++;
      }
    }
    res.json({ success: true, upgraded, skipped, total: users?.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// USER PREFERENCES (currency, language, timezone)
// ============================================================
app.put('/api/users/preferences', verifyToken, async (req, res) => {
  try {
    const { currency, language, timezone } = req.body;
    const updateData = { updated_at: new Date().toISOString() };
    if (currency) updateData.preferred_currency = currency;
    if (language) updateData.preferred_language = language;
    if (timezone) updateData.timezone = timezone;
    const { data, error } = await supabaseAdmin.from('users').update(updateData).eq('id', req.userId).select().single();
    if (error) { console.warn('[preferences] Column may not exist:', error.message); return res.json({ success: true }); }
    res.json({ success: true, user: data });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============================================================
// PHONE VERIFICATION — verify OTP and mark phone verified
// ============================================================
app.post('/api/auth/verify-phone', verifyToken, async (req, res) => {
  try {
    const { phone, otp } = req.body;
    if (!phone || !otp) return res.status(400).json({ error: 'Phone and OTP required' });
    const stored = otpStore.get(phone);
    if (!stored || stored.otp !== otp || Date.now() > stored.expires)
      return res.status(400).json({ error: 'Invalid or expired OTP. Request a new one.' });
    otpStore.delete(phone);
    const { error } = await supabaseAdmin.from('users').update({
      phone, phone_verified: true, updated_at: new Date().toISOString()
    }).eq('id', req.userId);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true, message: 'Phone number verified!' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============================================================
// KYC SUBMIT — mark kyc as pending review
// ============================================================
app.post('/api/kyc/submit', verifyToken, async (req, res) => {
  try {
    const { idDocName, selfieDocName } = req.body;
    if (!idDocName || !selfieDocName) return res.status(400).json({ error: 'Both documents are required' });
    const { error } = await supabaseAdmin.from('users').update({
      kyc_status: 'pending', kyc_submitted_at: new Date().toISOString(), updated_at: new Date().toISOString()
    }).eq('id', req.userId);
    if (error) { console.warn('[kyc] Column may not exist:', error.message); }
    res.json({ success: true, message: 'KYC documents submitted for review. We will respond within 24 hours.' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============================================================
// SUPPORT — lookup trade by reference number
// ============================================================
app.get('/api/support/trade/:ref', verifyToken, async (req, res) => {
  try {
    const ref = (req.params.ref || '').toUpperCase();
    const { data: trade, error } = await supabaseAdmin
      .from('trades')
      .select(`
        id, trade_ref, status, amount_btc, amount_usd, amount_local,
        local_currency, currency_symbol, payment_method, created_at,
        completed_at, cancelled_at,
        buyer:buyer_id(id, username),
        seller:seller_id(id, username)
      `)
      .eq('trade_ref', ref)
      .single();
    if (error || !trade) return res.status(404).json({ success: false, error: 'Trade not found' });
    res.json({ success: true, trade });
  } catch (err) {
    console.error('Support trade lookup error:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// ============================================================
// REFERRAL LINK RESOLUTION  GET /api/ref/:username
// ============================================================

app.get('/api/ref/:username', async (req, res) => {
  try {
    const { username } = req.params;
    if (!username) return res.json({ success: false, referral_code: null });

    const { data: user } = await supabaseAdmin
      .from('users')
      .select('referral_code, username')
      .ilike('username', username)
      .single();

    if (user?.referral_code) {
      return res.json({ success: true, referral_code: user.referral_code });
    }
    res.json({ success: false, referral_code: null });
  } catch (err) {
    res.json({ success: false, referral_code: null });
  }
});

// ============================================================
// ── One-time startup backfill: set country from phone prefix for users missing it
async function backfillCountriesFromPhone() {
  try {
    // Fetch ALL users with no country set (in batches of 500)
    let from = 0;
    const batchSize = 500;
    let fixed = 0;

    while (true) {
      const { data: users, error } = await supabaseAdmin
        .from('users')
        .select('id, phone')
        .or('country.is.null,country.eq.')
        .range(from, from + batchSize - 1);

      if (error) { console.error('[Backfill] select error:', error.message); break; }
      if (!users?.length) break;

      for (const u of users) {
        const cc = phoneToCountryCode(u.phone);
        if (!cc) continue;
        const { error: upErr } = await supabaseAdmin
          .from('users')
          .update({ country: cc })
          .eq('id', u.id)
          .or('country.is.null,country.eq.'); // never overwrite if already set
        if (!upErr) fixed++;
      }

      if (users.length < batchSize) break;
      from += batchSize;
    }

    if (fixed > 0) console.log(`[Backfill] Populated country for ${fixed} user(s) from phone prefix`);
    else console.log('[Backfill] No users needed country backfill from phone');
  } catch (err) {
    console.error('[Backfill] backfillCountriesFromPhone error:', err.message);
  }
}

// ============================================================
// USDT TRC-20 WALLET ENDPOINTS
// ============================================================

const tronWalletService = require('./services/tronWalletService');
const tronHotWallet = require('./services/tronHotWallet');
const usdtDepositMonitor = require('./services/usdtDepositMonitor');
const swapService = require('./services/swapService');
const COMPANY_WALLET_ID = '14762cd0-d3b2-474f-acab-fe0071961e9a';

// GET /api/wallet/usdt — return USDT balance + Tron deposit address
app.get('/api/wallet/usdt', verifyToken, async (req, res) => {
  try {
    // Generate (or re-derive) this user's Tron deposit address
    const { address: tronAddress } = tronWalletService.generateUserAddress(req.userId);

    // user_wallets.btc_address is NOT NULL — ensureWalletExists() guarantees a row
    // with a real btc_address exists first, so the update below can never hit that
    // constraint (this was previously a plain upsert that silently failed whenever
    // a user hit this USDT route before ever loading their BTC wallet, which meant
    // their tron_address never got saved and usdtDepositMonitor never watched it).
    await hdWalletService.ensureWalletExists(req.userId);
    const { error: upsertErr } = await supabaseAdmin.from('user_wallets')
      .update({ tron_address: tronAddress, updated_at: new Date().toISOString() })
      .eq('user_id', req.userId);
    if (upsertErr) console.warn('[GET /wallet/usdt] user_wallets update failed:', upsertErr.message);

    // Read USDT balance from wallets table (single source of truth)
    const { data: walRow } = await supabaseAdmin
      .from('wallets').select('balance_usdt, locked_balance_usdt').eq('user_id', req.userId).maybeSingle();

    res.json({
      success: true,
      tron_address: tronAddress,
      network: 'Tron (TRC-20)',
      contract: process.env.TRON_USDT_CONTRACT || 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
      balance_usdt: parseFloat(walRow?.balance_usdt || 0),
      locked_balance_usdt: parseFloat(walRow?.locked_balance_usdt || 0),
    });
  } catch (error) {
    console.error('[GET /wallet/usdt] error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/wallet/usdt/send — withdraw USDT to external Tron address (2FA required)
// Sends from PRAQEN hot wallet. Tiered fee credited to company wallet.
// Fee = max($5 flat floor, 5% of amount) — floor keeps small withdrawals from
// costing less than the flat minimum; once 5% clears the floor (amount > $100)
// the percentage takes over. No boundary where a bigger withdrawal ever costs
// less fee than a smaller one — that gap let users dodge the flat fee by
// nudging just above the old $50 cutoff.
app.post('/api/wallet/usdt/send', verifyToken, async (req, res) => {
  // Emergency kill-switch — SENDS_DISABLED=true in .env blocks external
  // withdrawals platform-wide without touching trading/internal transfers.
  // Checked in-process (not DB-backed) so it works even if Supabase is down.
  if (process.env.SENDS_DISABLED === 'true') {
    return res.status(503).json({
      error: 'Withdrawals are temporarily disabled for maintenance. Trading and internal transfers are unaffected — please try again later.',
    });
  }
  const FEE_FLAT = parseFloat(process.env.USDT_WITHDRAWAL_FEE_FLAT || '5.0');  // flat floor
  const FEE_PERCENT = parseFloat(process.env.USDT_WITHDRAWAL_FEE_PERCENT || '0.05'); // 5% once it exceeds the floor
  const MIN_SEND = parseFloat(process.env.USDT_MIN_SEND || '5.0');  // minimum $5

  // ── Fee calculator: flat floor, percentage above it — no cliff ────────────
  const calcFee = (amt) => Math.max(FEE_FLAT, parseFloat((amt * FEE_PERCENT).toFixed(6)));

  try {
    const { toAddress, amount, actionCode } = req.body;

    // ── 2FA: enforce that user has 2FA enabled before sending USDT ────────
    const { data: usdtSendUser2FA } = await supabaseAdmin
      .from('users')
      .select('two_factor_enabled')
      .eq('id', req.userId)
      .single();
    if (!usdtSendUser2FA?.two_factor_enabled) {
      return res.status(403).json({
        error: 'You must enable 2FA (email or authenticator) before sending funds. Go to Settings → Security to enable 2FA.',
        require2FA: true,
      });
    }

    // ── 2FA gate ──────────────────────────────────────────────────────────
    if (!actionCode) {
      return res.status(403).json({
        error: 'Security verification required.',
        requireActionCode: true,
        action: 'send_usdt',
      });
    }
    const codeCheck = await actionCodeService.verify(req.userId, 'send_usdt', actionCode);
    if (!codeCheck.valid) return res.status(403).json({ error: codeCheck.error });

    // ── KYC gate: all 3 steps required ───────────────────────────────────
    const { data: kycUser } = await supabaseAdmin
      .from('users')
      .select('is_email_verified, email_verified, is_phone_verified, phone_verified, is_id_verified, kyc_verified')
      .eq('id', req.userId).single();

    const kycEmail = !!(kycUser?.is_email_verified || kycUser?.email_verified);
    const kycPhone = !!(kycUser?.is_phone_verified || kycUser?.phone_verified);
    const kycId = !!(kycUser?.is_id_verified || kycUser?.kyc_verified);

    if (!kycEmail || !kycPhone || !kycId) {
      return res.status(403).json({
        error: 'KYC required: You must complete all 3 verification steps — Email, Phone, and ID verification — before sending USDT to an external wallet. Go to Profile → Verification to complete your KYC.',
        requireVerification: 'kyc',
        verified: { email: kycEmail, phone: kycPhone, id: kycId },
      });
    }

    // ── Validate destination ──────────────────────────────────────────────
    if (!toAddress || !tronWalletService.isValidTronAddress(toAddress)) {
      return res.status(400).json({ error: 'Invalid Tron address — must be 34 characters starting with T' });
    }

    // Prevent sending to hot wallet (would double-count)
    if (toAddress === tronHotWallet.getHotWalletAddress()) {
      return res.status(400).json({ error: 'Cannot withdraw to the PRAQEN system address. Use internal transfer instead.' });
    }

    // ── Validate amount ───────────────────────────────────────────────────
    const sendAmount = parseFloat(amount); // net amount user receives on-chain
    if (!sendAmount || sendAmount <= 0) return res.status(400).json({ error: 'Invalid USDT amount' });
    if (sendAmount < MIN_SEND) {
      return res.status(400).json({
        error: `Minimum withdrawal is ₮${MIN_SEND.toFixed(2)} USDT`,
      });
    }

    // ── Calculate fee: flat floor vs percentage, whichever is higher ──────
    const withdrawalFee = calcFee(sendAmount);
    const totalDeduct = parseFloat((sendAmount + withdrawalFee).toFixed(6));
    const percentWouldBe = parseFloat((sendAmount * FEE_PERCENT).toFixed(6));
    const feeLabel = percentWouldBe <= FEE_FLAT
      ? `₮${withdrawalFee.toFixed(2)} flat`
      : `${(FEE_PERCENT * 100).toFixed(0)}% (₮${withdrawalFee.toFixed(2)})`;

    // ── Check user balance (must cover amount + fee) ──────────────────────
    const { data: walRow } = await supabaseAdmin
      .from('wallets').select('balance_usdt').eq('user_id', req.userId).maybeSingle();
    const available = parseFloat(walRow?.balance_usdt || 0);

    if (available < totalDeduct) {
      return res.status(400).json({
        error: `Insufficient balance. Need ₮${totalDeduct.toFixed(2)} (₮${sendAmount.toFixed(2)} + ${feeLabel} fee). Available: ₮${available.toFixed(2)}`,
      });
    }

    // ── Step 1: Deduct (amount + fee) from user DB balance FIRST ─────────
    // Optimistic lock: eq('balance_usdt', available) ensures a concurrent request
    // that already modified the balance will return 0 rows and be rejected.
    const newBalance = parseFloat((available - totalDeduct).toFixed(6));
    const { data: deductRows, error: deductErr } = await supabaseAdmin.from('wallets')
      .update({ balance_usdt: newBalance, updated_at: new Date().toISOString() })
      .eq('user_id', req.userId)
      .eq('balance_usdt', available)   // optimistic lock
      .select('balance_usdt');
    if (deductErr) {
      return res.status(500).json({ error: 'Failed to reserve USDT — please try again' });
    }
    if (!deductRows || deductRows.length === 0) {
      return res.status(409).json({ error: 'Balance changed — please retry the withdrawal' });
    }

    // ── Step 2: Credit fee to company wallet (internal ledger) ───────────
    // Must succeed before any on-chain funds move: if the fee can't be reliably
    // recorded, we'd otherwise still broadcast the real send and the fee
    // portion the user was charged would vanish from every revenue ledger with
    // no trace. Abort and fully restore the user's balance instead — same as
    // a broadcast failure below.
    try {
      await tronHotWallet.creditFeeToCompany(
        withdrawalFee,
        `withdrawal fee (${feeLabel}) from ${req.userId.slice(0, 8)}`
      );
    } catch (feeErr) {
      console.error('[USDT Send] Fee credit failed — aborting before broadcast, restoring balance:', feeErr.message);
      const { error: restoreErr } = await supabaseAdmin.from('wallets')
        .update({ balance_usdt: available, updated_at: new Date().toISOString() })
        .eq('user_id', req.userId);
      if (restoreErr) {
        console.error('[USDT Send] CRITICAL: user balance restore failed!', restoreErr.message, 'user:', req.userId, 'amount:', totalDeduct);
      }
      return res.status(500).json({
        error: 'Sorry, we are experiencing a blockchain issue. Please try again later or contact support. This issue is from the blockchain.',
      });
    }

    // ── Step 3: Send net amount from hot wallet on-chain ──────────────────
    let txResult;
    try {
      txResult = await tronHotWallet.sendUsdtToExternal(toAddress, sendAmount);
    } catch (broadcastErr) {
      // On-chain send failed — fully restore user balance AND reverse fee credit
      console.error('[USDT Send] Hot wallet broadcast failed — rolling back:', broadcastErr.message);

      const { error: restoreErr } = await supabaseAdmin.from('wallets')
        .update({ balance_usdt: available, updated_at: new Date().toISOString() })
        .eq('user_id', req.userId);
      if (restoreErr) {
        console.error('[USDT Send] CRITICAL: user balance restore failed!', restoreErr.message, 'user:', req.userId, 'amount:', totalDeduct);
      }

      const { data: cw, error: cwErr } = await supabaseAdmin
        .from('wallets').select('balance_usdt').eq('user_id', COMPANY_WALLET_ID).maybeSingle();
      if (!cwErr) {
        const { error: feeRestoreErr } = await supabaseAdmin.from('wallets')
          .update({ balance_usdt: Math.max(0, parseFloat(cw?.balance_usdt || 0) - withdrawalFee), updated_at: new Date().toISOString() })
          .eq('user_id', COMPANY_WALLET_ID);
        if (feeRestoreErr) {
          console.error('[USDT Send] CRITICAL: company fee reverse failed!', feeRestoreErr.message);
        }
      }

      // HOT_WALLET_*_INSUFFICIENT carries internal treasury numbers (exact USDT/TRX
      // balances) for admin logs — never show that to the end user, who should
      // just see that withdrawals are temporarily down, not why.
      const isTreasuryError = /^HOT_WALLET_(USDT|TRX)_INSUFFICIENT/.test(broadcastErr.message || '');
      const userMessage = isTreasuryError
        ? 'Sorry, we are experiencing a blockchain issue. Please try again later or contact support. This issue is from the blockchain.'
        : broadcastErr.message;

      return res.status(500).json({ error: userMessage });
    }

    // ── Step 4: Record withdrawal transaction (user) + fee credit (company) ──
    // Each leg needs its own unique tx_hash (wallet_transactions has a UNIQUE constraint
    // on tx_hash) — these two rows previously both used the bare on-chain txid, so whichever
    // insert lost the race silently vanished (Supabase resolves with {error} rather than
    // rejecting, so the .catch() below never caught it). In practice this meant the user's
    // own WITHDRAWAL record was missing from their transaction history nearly every time,
    // even though the send succeeded — same _OUT/_IN suffixing already used for internal
    // transfers elsewhere in this file.
    const txNow = new Date().toISOString();
    const [withdrawalLog, feeLog] = await Promise.all([
      supabaseAdmin.from('wallet_transactions').insert({
        user_id: req.userId,
        type: 'WITHDRAWAL',
        currency: 'USDT',
        amount_usdt: sendAmount,
        status: 'CONFIRMED',
        tx_hash: `${txResult.txid}_OUT`,
        notes: `USDT withdrawal to ${toAddress.slice(0, 16)}…${toAddress.slice(-4)} | fee: ${feeLabel}`,
        created_at: txNow,
      }),
      supabaseAdmin.from('wallet_transactions').insert({
        user_id: COMPANY_WALLET_ID,
        type: 'FEE',
        currency: 'USDT',
        amount_usdt: withdrawalFee,
        status: 'CONFIRMED',
        tx_hash: `${txResult.txid}_FEE`,
        notes: `USDT withdrawal fee (${feeLabel}) from user ${req.userId.slice(0, 8)} — sent ₮${sendAmount.toFixed(2)} to ${toAddress.slice(0, 10)}…`,
        created_at: txNow,
      }),
    ]);
    if (withdrawalLog.error) console.error('[USDT Send] WITHDRAWAL log error:', withdrawalLog.error.message);
    if (feeLog.error) console.error('[USDT Send] FEE log error:', feeLog.error.message);

    // ── Step 5: Notify user ───────────────────────────────────────────────
    await supabaseAdmin.from('notifications').insert({
      user_id: req.userId,
      type: 'wallet',
      title: '💸 USDT Sent!',
      message: `₮${sendAmount.toFixed(2)} USDT sent to ${toAddress.slice(0, 8)}…${toAddress.slice(-4)} | fee: ${feeLabel}`,
      action: '/wallet',
      is_read: false,
      created_at: new Date().toISOString(),
    }).then(null, () => { });

    console.log(`[USDT Send] ₮${sendAmount} → ${toAddress} | fee ${feeLabel} | user: ${req.userId.slice(0, 8)} | txid: ${txResult.txid}`);

    res.json({
      success: true,
      txid: txResult.txid,
      amount_sent: sendAmount,
      fee: withdrawalFee,
      fee_label: feeLabel,
      total_deducted: totalDeduct,
      to: toAddress,
      new_balance: newBalance,
      explorer: txResult.explorer_url,
    });

  } catch (error) {
    console.error('[POST /wallet/usdt/send] error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// SWAP ENDPOINTS — BTC ↔ USDT
// ============================================================

// GET /api/swap/rate — live BTC/USDT rate
app.get('/api/swap/rate', verifyToken, async (req, res) => {
  try {
    const rate = await swapService.getBtcUsdtRate();
    res.json({
      success: true,
      rate,
      pair: 'BTC/USDT',
      fee_pct: '1%',
      source: 'binance',
    });
  } catch (error) {
    res.status(503).json({ error: error.message });
  }
});

// POST /api/swap/btc-to-usdt — swap BTC → USDT (internal ledger)
app.post('/api/swap/btc-to-usdt', verifyToken, async (req, res) => {
  try {
    const { btcAmount } = req.body;
    if (!btcAmount || parseFloat(btcAmount) <= 0) {
      return res.status(400).json({ error: 'Missing or invalid btcAmount' });
    }
    const result = await swapService.swapBtcToUsdt(req.userId, btcAmount);
    res.json(result);
  } catch (error) {
    console.error('[POST /swap/btc-to-usdt] error:', error.message);
    res.status(error.message.includes('Insufficient') ? 400 : 500).json({ error: error.message });
  }
});

// POST /api/swap/usdt-to-btc — swap USDT → BTC (internal ledger)
app.post('/api/swap/usdt-to-btc', verifyToken, async (req, res) => {
  try {
    const { usdtAmount } = req.body;
    if (!usdtAmount || parseFloat(usdtAmount) <= 0) {
      return res.status(400).json({ error: 'Missing or invalid usdtAmount' });
    }
    const result = await swapService.swapUsdtToBtc(req.userId, usdtAmount);
    res.json(result);
  } catch (error) {
    console.error('[POST /swap/usdt-to-btc] error:', error.message);
    res.status(error.message.includes('Insufficient') ? 400 : 500).json({ error: error.message });
  }
});

// GET /api/swap/history — user's swap history
app.get('/api/swap/history', verifyToken, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('swap_transactions')
      .select('*')
      .eq('user_id', req.userId)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw error;
    res.json({ success: true, swaps: data || [] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Per-user rate limit for manual deposit check (1 call per 30s per user)
const _usdtCheckLastCall = new Map(); // userId → timestamp (ms)
const USDT_CHECK_COOLDOWN_MS = 30_000;

// GET /api/wallet/usdt/check — manually trigger a USDT deposit scan for this user
app.get('/api/wallet/usdt/check', verifyToken, async (req, res) => {
  const now = Date.now();
  const last = _usdtCheckLastCall.get(req.userId) || 0;
  const elapsed = now - last;
  if (elapsed < USDT_CHECK_COOLDOWN_MS) {
    const waitSec = Math.ceil((USDT_CHECK_COOLDOWN_MS - elapsed) / 1000);
    return res.status(429).json({ error: `Please wait ${waitSec}s before checking again` });
  }
  _usdtCheckLastCall.set(req.userId, now);

  try {
    // Derive the user's Tron address deterministically (same result every time)
    const { address: derivedAddress } = tronWalletService.generateUserAddress(req.userId);

    // user_wallets.btc_address is NOT NULL — ensure the row exists (with a real
    // btc_address) before updating tron_address, same reasoning as GET /wallet/usdt.
    await hdWalletService.ensureWalletExists(req.userId);
    const { error: upsertErr } = await supabaseAdmin.from('user_wallets')
      .update({ tron_address: derivedAddress, updated_at: new Date().toISOString() })
      .eq('user_id', req.userId);
    if (upsertErr) console.warn('[/wallet/usdt/check] update error (non-fatal):', upsertErr.message);

    // Read last_onchain_usdt if available (for idempotent deposit detection)
    let lastOnchainUsdt = 0;
    const { data: walletRow, error: fetchErr } = await supabaseAdmin
      .from('user_wallets').select('last_onchain_usdt').eq('user_id', req.userId).maybeSingle();
    if (!fetchErr && walletRow?.last_onchain_usdt != null) {
      lastOnchainUsdt = parseFloat(walletRow.last_onchain_usdt);
    }

    await usdtDepositMonitor.checkUserDeposit({
      userId: req.userId,
      address: derivedAddress,
      username: null,
      lastOnchainUsdt,
    });

    const { data: wal } = await supabaseAdmin
      .from('wallets').select('balance_usdt').eq('user_id', req.userId).maybeSingle();

    res.json({
      success: true,
      balance_usdt: parseFloat(wal?.balance_usdt || 0),
      tron_address: walletRow.tron_address,
      checked_at: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/wallet/usdt/internal-transfer — FREE instant USDT transfer between PRAQEN users
// Internal ledger only — no Tron broadcast, no gas fee, instant settlement.
// ─────────────────────────────────────────────────────────────────────────────
app.post('/api/wallet/usdt/internal-transfer', verifyToken, async (req, res) => {
  try {
    const { toUsername, toTronAddress, amountUsdt } = req.body;
    const amount = parseFloat(amountUsdt);

    if ((!toUsername && !toTronAddress) || !amountUsdt || isNaN(amount) || amount <= 0) {
      return res.status(400).json({ error: 'Recipient (username or Tron address) and a positive USDT amount are required' });
    }
    if (amount < 0.01) {
      return res.status(400).json({ error: 'Minimum transfer amount is ₮0.01 USDT' });
    }

    // ── Find recipient ────────────────────────────────────────────────────
    let recipient;

    if (toUsername) {
      const { data: u } = await supabaseAdmin
        .from('users').select('id, username, email').eq('username', toUsername.trim().replace(/^@/, '')).single();
      if (!u) return res.status(404).json({ error: `@${toUsername} not found on PRAQEN. Check the username and try again.` });
      recipient = u;

    } else {
      // Tron address lookup — must belong to a PRAQEN user
      const addr = toTronAddress.trim();
      if (!/^T[A-Za-z1-9]{33}$/.test(addr)) {
        return res.status(400).json({ error: 'Invalid Tron address format. Tron addresses start with T and are 34 characters.' });
      }
      const { data: walletRow } = await supabaseAdmin
        .from('user_wallets').select('user_id').eq('tron_address', addr).maybeSingle();
      if (!walletRow) {
        return res.status(404).json({
          error: 'This Tron address is not registered on PRAQEN. For external sends use the Send (on-chain) button.',
          isExternal: true,
        });
      }
      const { data: u } = await supabaseAdmin
        .from('users').select('id, username, email').eq('id', walletRow.user_id).single();
      if (!u) return res.status(404).json({ error: 'Recipient account not found.' });
      recipient = u;
    }

    if (String(recipient.id) === String(req.userId)) {
      return res.status(400).json({ error: 'You cannot transfer USDT to yourself' });
    }

    // ── Ensure recipient has a wallets row ────────────────────────────────
    const { data: recipWallet } = await supabaseAdmin
      .from('wallets').select('balance_usdt').eq('user_id', recipient.id).maybeSingle();
    if (!recipWallet) {
      return res.status(400).json({ error: 'Recipient wallet not initialised. Ask them to open the PRAQEN wallet page first.' });
    }

    // ── Check sender USDT balance ─────────────────────────────────────────
    const { data: senderWallet } = await supabaseAdmin
      .from('wallets').select('balance_usdt').eq('user_id', req.userId).maybeSingle();
    const available = parseFloat(senderWallet?.balance_usdt || 0);
    if (available < amount) {
      return res.status(400).json({
        error: `Insufficient USDT. Available: ₮${available.toFixed(2)}, Required: ₮${amount.toFixed(2)}`,
      });
    }

    // ── Deduct from sender (optimistic lock: reject if balance changed since read) ──
    const newSenderBal = parseFloat((available - amount).toFixed(6));
    const { data: deductRows, error: deductErr } = await supabaseAdmin
      .from('wallets')
      .update({ balance_usdt: newSenderBal, updated_at: new Date().toISOString() })
      .eq('user_id', req.userId)
      .eq('balance_usdt', available)   // optimistic lock — fails if concurrent tx modified it
      .select('balance_usdt');
    if (deductErr) {
      return res.status(500).json({ error: 'Transfer failed — please try again' });
    }
    if (!deductRows || deductRows.length === 0) {
      return res.status(409).json({ error: 'Balance changed — please retry the transfer' });
    }

    // ── Credit recipient (rollback sender on failure) ─────────────────────
    const newRecipBal = parseFloat((parseFloat(recipWallet.balance_usdt || 0) + amount).toFixed(6));
    const { error: creditErr } = await supabaseAdmin
      .from('wallets')
      .update({ balance_usdt: newRecipBal, updated_at: new Date().toISOString() })
      .eq('user_id', recipient.id);
    if (creditErr) {
      // Rollback sender deduction so no funds are lost
      await supabaseAdmin.from('wallets')
        .update({ balance_usdt: available, updated_at: new Date().toISOString() })
        .eq('user_id', req.userId);
      return res.status(500).json({ error: 'Transfer failed — your balance has been restored' });
    }

    // ── Generate transfer reference ────────────────────────────────────────
    const txRef = 'UINT_' + require('crypto')
      .createHash('sha256')
      .update(`${req.userId}:${recipient.id}:${amount}:${Date.now()}`)
      .digest('hex').slice(0, 16).toUpperCase();

    const { data: senderUser } = await supabaseAdmin.from('users').select('username, email').eq('id', req.userId).single();
    const senderName = senderUser?.username || 'a PRAQEN user';
    const txTs = new Date().toISOString();

    // ── Log TRANSFER_OUT for sender ───────────────────────────────────────
    {
      const { error: outErr } = await supabaseAdmin.from('wallet_transactions').insert({
        user_id: req.userId,
        type: 'TRANSFER_OUT',
        currency: 'USDT',
        amount_usdt: amount,
        amount_btc: 0,
        status: 'CONFIRMED',
        tx_hash: `${txRef}_OUT`,
        notes: `USDT transfer → @${recipient.username} · No fee`,
        created_at: txTs,
      });
      if (outErr) console.error('[UsdtTransfer] OUT log err:', outErr.message);
    }

    // ── Log TRANSFER_IN for recipient ─────────────────────────────────────
    {
      const { error: inErr } = await supabaseAdmin.from('wallet_transactions').insert({
        user_id: recipient.id,
        type: 'TRANSFER_IN',
        currency: 'USDT',
        amount_usdt: amount,
        amount_btc: 0,
        status: 'CONFIRMED',
        tx_hash: `${txRef}_IN`,
        notes: `USDT received from @${senderName} · No fee`,
        created_at: txTs,
      });
      if (inErr) console.error('[UsdtTransfer] IN log err:', inErr.message);
    }

    // ── In-app notifications ──────────────────────────────────────────────
    await createNotification(
      recipient.id, 'system', '₮ USDT Received!',
      `@${senderName} sent you ₮${amount.toFixed(2)} USDT — instant & free.`, '/wallet'
    ).catch(() => { });
    await createNotification(
      req.userId, 'system', '✅ USDT Transfer Sent',
      `₮${amount.toFixed(2)} USDT sent to @${recipient.username} instantly. Ref: ${txRef}`, '/wallet'
    ).catch(() => { });

    // ── Email notifications (fire-and-forget) ──────────────────────────────
    const txDate = new Date().toUTCString();
    const emailFrom = `"PRAQEN" <${process.env.EMAIL_USER || 'support@praqen.com'}>`;

    const recipHtml = `<div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:520px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #E2E8F0">
  <div style="background:linear-gradient(135deg,#1B4332,#26A17B);padding:28px 32px;text-align:center">
    <h1 style="color:#F4A422;font-size:26px;margin:0;font-weight:900">₮ USDT Received!</h1>
    <p style="color:rgba(255,255,255,0.7);margin:8px 0 0;font-size:14px">Instant PRAQEN internal transfer</p>
  </div>
  <div style="padding:28px 32px">
    <div style="background:#F0FAF5;border-radius:12px;padding:20px;text-align:center;margin-bottom:20px">
      <p style="color:#64748B;font-size:12px;margin:0 0 6px">You received</p>
      <p style="color:#1B4332;font-size:32px;font-weight:900;margin:0">₮ ${amount.toFixed(2)} USDT</p>
      <p style="color:#10B981;font-size:12px;font-weight:700;margin:6px 0 0">⚡ Instant &amp; FREE</p>
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <tr><td style="color:#64748B;padding:6px 0">From</td><td style="color:#1B4332;font-weight:700;text-align:right">@${senderName}</td></tr>
      <tr><td style="color:#64748B;padding:6px 0">Fee</td><td style="color:#10B981;font-weight:700;text-align:right">₮ 0.00 (Free)</td></tr>
      <tr><td style="color:#64748B;padding:6px 0">Reference</td><td style="color:#1B4332;font-weight:700;text-align:right;font-family:monospace;font-size:11px">${txRef}</td></tr>
      <tr><td style="color:#64748B;padding:6px 0">Date</td><td style="color:#475569;text-align:right">${txDate}</td></tr>
    </table>
    <div style="text-align:center;margin-top:24px"><a href="https://praqen.com/wallet" style="display:inline-block;background:#1B4332;color:#fff;font-weight:900;padding:14px 32px;border-radius:12px;text-decoration:none;font-size:14px">View Wallet</a></div>
  </div>
</div>`;

    const senderHtml = `<div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:520px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #E2E8F0">
  <div style="background:linear-gradient(135deg,#1B4332,#26A17B);padding:28px 32px;text-align:center">
    <h1 style="color:#fff;font-size:22px;margin:0;font-weight:900">USDT Transfer Sent ✅</h1>
  </div>
  <div style="padding:28px 32px">
    <div style="background:#F8FAFC;border-radius:12px;padding:20px;text-align:center;margin-bottom:20px">
      <p style="color:#64748B;font-size:12px;margin:0 0 6px">You sent</p>
      <p style="color:#EF4444;font-size:32px;font-weight:900;margin:0">−₮ ${amount.toFixed(2)} USDT</p>
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <tr><td style="color:#64748B;padding:6px 0">To</td><td style="color:#1B4332;font-weight:700;text-align:right">@${recipient.username}</td></tr>
      <tr><td style="color:#64748B;padding:6px 0">Fee</td><td style="color:#10B981;font-weight:700;text-align:right">₮ 0.00 (Free)</td></tr>
      <tr><td style="color:#64748B;padding:6px 0">New USDT Balance</td><td style="color:#1B4332;font-weight:700;text-align:right">₮ ${newSenderBal.toFixed(2)}</td></tr>
      <tr><td style="color:#64748B;padding:6px 0">Reference</td><td style="color:#1B4332;font-weight:700;text-align:right;font-family:monospace;font-size:11px">${txRef}</td></tr>
    </table>
    <div style="text-align:center;margin-top:24px"><a href="https://praqen.com/wallet" style="display:inline-block;background:#1B4332;color:#fff;font-weight:900;padding:14px 32px;border-radius:12px;text-decoration:none;font-size:14px">View Wallet</a></div>
  </div>
</div>`;

    Promise.all([
      recipient.email && transporter.sendMail({ from: emailFrom, to: recipient.email, subject: `₮ You received ₮${amount.toFixed(2)} USDT from @${senderName} on PRAQEN`, html: recipHtml }),
      senderUser?.email && transporter.sendMail({ from: emailFrom, to: senderUser.email, subject: `✅ USDT sent: ₮${amount.toFixed(2)} → @${recipient.username}`, html: senderHtml }),
    ]).catch(err => console.warn('[UsdtTransfer] Email error (non-fatal):', err.message));

    console.log(`[UsdtInternalTransfer] @${senderName} → @${recipient.username} | ₮${amount} | FREE | ref:${txRef}`);

    res.json({
      success: true,
      txRef,
      amount_usdt: amount,
      fee: 0,
      to: recipient.username,
      new_balance: newSenderBal,
      message: `₮${amount.toFixed(2)} USDT sent to @${recipient.username} — instantly & free!`,
    });

  } catch (error) {
    console.error('[POST /api/wallet/usdt/internal-transfer]', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// ADMIN — HOT WALLET MANAGEMENT
// ============================================================

// GET /api/admin/hot-wallet/status
// Returns hot wallet balances, TRX level, pending sweeps, company USDT earned
app.get('/api/admin/hot-wallet/status', verifyToken, async (req, res) => {
  try {
    const { data: me } = await supabaseAdmin.from('users').select('is_admin').eq('id', req.userId).single();
    if (!me?.is_admin) return res.status(403).json({ error: 'Admin only' });

    const status = await tronHotWallet.getStatus();
    res.json({ success: true, ...status });
  } catch (e) {
    console.error('[GET /admin/hot-wallet/status]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/admin/hot-wallet/process-sweeps
// Manually trigger pending sweep processing
app.post('/api/admin/hot-wallet/process-sweeps', verifyToken, async (req, res) => {
  try {
    const { data: me } = await supabaseAdmin.from('users').select('is_admin').eq('id', req.userId).single();
    if (!me?.is_admin) return res.status(403).json({ error: 'Admin only' });

    await tronHotWallet.processPendingSweeps();
    res.json({ success: true, message: 'Pending sweeps processed' });
  } catch (e) {
    console.error('[POST /admin/hot-wallet/process-sweeps]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/admin/hot-wallet/collect-fees
// Cash out accumulated company USDT fees from hot wallet to a cold wallet address
app.post('/api/admin/hot-wallet/collect-fees', verifyToken, async (req, res) => {
  try {
    const { data: me } = await supabaseAdmin.from('users').select('is_admin').eq('id', req.userId).single();
    if (!me?.is_admin) return res.status(403).json({ error: 'Admin only' });

    const { toAddress, amountUsdt } = req.body;
    const amount = parseFloat(amountUsdt);

    if (!toAddress || !tronWalletService.isValidTronAddress(toAddress)) {
      return res.status(400).json({ error: 'Valid Tron cold wallet address required' });
    }
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Positive USDT amount required' });
    }

    const result = await tronHotWallet.collectFeesToColdWallet(amount, toAddress);

    // Log the collection
    await supabaseAdmin.from('wallet_transactions').insert({
      user_id: COMPANY_WALLET_ID,
      type: 'WITHDRAWAL',
      currency: 'USDT',
      amount_usdt: amount,
      status: 'CONFIRMED',
      tx_hash: result.txid,
      notes: `Admin fee collection → ${toAddress.slice(0, 16)}… by ${req.userId.slice(0, 8)}`,
      created_at: new Date().toISOString(),
    }).then(null, () => { });

    res.json({ success: true, ...result });
  } catch (e) {
    console.error('[POST /admin/hot-wallet/collect-fees]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/admin/usdt-wallet — USDT hot wallet balance + all activity (deposits,
// sweeps, external withdrawals, internal P2P transfers). Mirrors the BTC
// PlatformWalletsCard + Transfer Activity view in the admin Finance tab.
app.get('/api/admin/usdt-wallet', verifyToken, async (req, res) => {
  try {
    const admin = await requireFullAdmin(req, res); if (!admin) return;

    const [
      status,
      { data: depositsRaw },
      { data: sweepsRaw },
      { data: withdrawalsRaw },
      { data: internalRaw },
    ] = await Promise.all([
      tronHotWallet.getStatus(),
      supabaseAdmin.from('wallet_transactions')
        .select('id, user_id, amount_usdt, notes, created_at, tx_hash')
        .eq('type', 'DEPOSIT').eq('currency', 'USDT')
        .order('created_at', { ascending: false }).limit(200),
      supabaseAdmin.from('hot_wallet_sweeps')
        .select('id, user_id, from_address, amount_usdt, status, txid, error, created_at, updated_at')
        .order('created_at', { ascending: false }).limit(200),
      supabaseAdmin.from('wallet_transactions')
        .select('id, user_id, amount_usdt, notes, status, created_at, tx_hash')
        .eq('type', 'WITHDRAWAL').eq('currency', 'USDT')
        .order('created_at', { ascending: false }).limit(200),
      supabaseAdmin.from('wallet_transactions')
        .select('id, user_id, amount_usdt, notes, created_at, tx_hash')
        .eq('type', 'TRANSFER_OUT').eq('currency', 'USDT')
        .order('created_at', { ascending: false }).limit(200),
    ]);

    // Batch-fetch usernames for every user referenced across all four lists
    const allUserIds = [...new Set([
      ...(depositsRaw || []).map(t => t.user_id),
      ...(sweepsRaw || []).map(t => t.user_id),
      ...(withdrawalsRaw || []).map(t => t.user_id),
      ...(internalRaw || []).map(t => t.user_id),
    ])];
    const { data: usersRaw } = await supabaseAdmin.from('users')
      .select('id, username, full_name').in('id', allUserIds);
    const userMap = Object.fromEntries((usersRaw || []).map(u => [u.id, u.username || u.full_name || u.id.slice(0, 8)]));
    const nameFor = (userId) => userId === COMPANY_WALLET_ID ? 'PRAQEN Company Wallet' : (userMap[userId] || userId?.slice(0, 8) || '—');

    const deposits    = (depositsRaw    || []).map(t => ({ ...t, username: nameFor(t.user_id) }));
    const sweeps       = (sweepsRaw      || []).map(t => ({ ...t, username: nameFor(t.user_id) }));
    const withdrawals = (withdrawalsRaw || []).map(t => ({ ...t, username: nameFor(t.user_id) }));
    const internal     = (internalRaw    || []).map(t => {
      const m = t.notes?.match(/→ @(\S+)/);
      return { ...t, sender: nameFor(t.user_id), recipient: m ? m[1].replace(/·.*$/, '').trim() : '—' };
    });

    const totalDepositsUsdt   = deposits.reduce((s, t) => s + parseFloat(t.amount_usdt || 0), 0);
    const totalSweptUsdt      = sweeps.filter(s => s.status === 'COMPLETED').reduce((s, t) => s + parseFloat(t.amount_usdt || 0), 0);
    const totalWithdrawnUsdt = withdrawals.reduce((s, t) => s + parseFloat(t.amount_usdt || 0), 0);
    const totalInternalUsdt   = internal.reduce((s, t) => s + parseFloat(t.amount_usdt || 0), 0);
    const pendingSweepsCount  = sweeps.filter(s => s.status === 'PENDING').length;

    res.json({
      status,
      deposits, sweeps, withdrawals, internal,
      totals: {
        depositsUsdt:   totalDepositsUsdt.toFixed(6),
        sweptUsdt:       totalSweptUsdt.toFixed(6),
        withdrawnUsdt:  totalWithdrawnUsdt.toFixed(6),
        internalUsdt:    totalInternalUsdt.toFixed(6),
        depositCount:    deposits.length,
        sweepCount:      sweeps.length,
        pendingSweepCount: pendingSweepsCount,
        withdrawalCount: withdrawals.length,
        internalCount:   internal.length,
      },
    });
  } catch (e) {
    console.error('[GET /admin/usdt-wallet]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/admin/hot-wallet/send-usdt — admin manually sends USDT straight
// from the hot wallet to any external Tron address. Unlike collect-fees, this
// does not touch the company internal ledger — it is a raw treasury move of
// whatever USDT is actually sitting in the hot wallet (e.g. rebalancing to
// cold storage). Real on-chain funds move immediately; there is no undo.
app.post('/api/admin/hot-wallet/send-usdt', verifyToken, async (req, res) => {
  try {
    const admin = await requireFullAdmin(req, res); if (!admin) return;

    const { toAddress, amountUsdt, note } = req.body;
    const amount = parseFloat(amountUsdt);

    if (!toAddress || !tronWalletService.isValidTronAddress(toAddress)) {
      return res.status(400).json({ error: 'Valid Tron destination address required' });
    }
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Positive USDT amount required' });
    }

    const result = await tronHotWallet.sendUsdtToExternal(toAddress, amount);

    await supabaseAdmin.from('wallet_transactions').insert({
      user_id: COMPANY_WALLET_ID,
      type: 'WITHDRAWAL',
      currency: 'USDT',
      amount_usdt: amount,
      status: 'CONFIRMED',
      tx_hash: result.txid,
      notes: `Admin manual send → ${toAddress.slice(0, 16)}…${toAddress.slice(-4)} by ${req.userId.slice(0, 8)}${note ? ` — ${note}` : ''}`,
      created_at: new Date().toISOString(),
    }).then(null, () => {});

    logAdminAction(req, 'HOT_WALLET_SEND_USDT', null, `${amount} USDT → ${toAddress}`).catch(() => {});

    res.json({ success: true, ...result });
  } catch (e) {
    console.error('[POST /admin/hot-wallet/send-usdt]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ✅ FIX: ONESIGNAL ID ROUTE - OneSignal ID Store Karne Ke Liye
// ─────────────────────────────────────────────────────────────────────────────
app.post('/api/users/onesignal-id', verifyToken, async (req, res) => {
  try {
    const { onesignal_id } = req.body;

    if (!onesignal_id) {
      return res.status(400).json({ error: 'OneSignal ID is required' });
    }

    console.log(`[OneSignal] Saving ID for user ${req.userId.slice(0, 8)}: ${onesignal_id.slice(0, 15)}...`);

    const { data, error } = await supabaseAdmin
      .from('users')
      .update({
        onesignal_id: onesignal_id,
        updated_at: new Date().toISOString()
      })
      .eq('id', req.userId)
      .select('id, onesignal_id');

    if (error) {
      console.error('[OneSignal] DB error:', error.message);
      return res.status(500).json({ error: 'Failed to save OneSignal ID: ' + error.message });
    }

    console.log(`✅ OneSignal ID saved for user ${req.userId.slice(0, 8)}`);
    res.json({
      success: true,
      message: 'OneSignal ID saved successfully',
      user: data?.[0]
    });
  } catch (error) {
    console.error('[OneSignal] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ✅ FIX: TEST PUSH NOTIFICATION ENDPOINT
// ─────────────────────────────────────────────────────────────────────────────
app.post('/api/test-push', verifyToken, async (req, res) => {
  try {
    const { userId, type = 'new_trade' } = req.body;
    const targetUserId = userId || req.userId;

    // Check if user has OneSignal ID
    const { data: user } = await supabaseAdmin
      .from('users')
      .select('id, username, onesignal_id')
      .eq('id', targetUserId)
      .single();

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (!user.onesignal_id) {
      return res.status(400).json({
        error: 'User has no OneSignal ID. Please login again to register for push notifications.',
        user: { id: user.id, username: user.username }
      });
    }

    // Create a test trade object
    const testTrade = {
      id: 'test-' + Date.now(),
      trade_ref: 'TEST' + Date.now().toString().slice(-6),
      amount_btc: 0.00123456,
      amount_usd: 100,
      payment_method: 'Mobile Money'
    };

    // Send test notification
    await sendTradeAlert(targetUserId, testTrade, type);

    res.json({
      success: true,
      message: `Test push notification sent to ${user.username}`,
      onesignal_id: user.onesignal_id.slice(0, 15) + '...',
      type: type
    });
  } catch (error) {
    console.error('[Test Push] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// START SERVER
// ============================================================

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`✅ PRAQEN Backend running on http://localhost:${PORT}`);
  console.log('📋 Routes: /api/auth, /api/users, /api/listings, /api/trades, /api/my-trades, /api/wallet, /api/hd-wallet, /api/notifications');
  console.log('📱 OneSignal: ✅ Configured');
  console.log('🔔 Push notifications: ✅ Ready');

  // Log hot wallet address so admin knows where to fund TRX + USDT
  tronHotWallet.logStartup();

  // Pre-warm the listings cache immediately so the very first request hits a warm cache
  _warmListingsCache();
  // Keep re-warming every 4 min so cache never expires between user visits
  setInterval(() => _warmListingsCache(), 4 * 60 * 1000);

  // Pause/reactivate offers based on live wallet balance — runs at startup then every 10 min
  syncAllOfferStatuses().catch(err => console.error('[startup] syncAllOfferStatuses:', err.message));
  setInterval(() => syncAllOfferStatuses().catch(err => console.error('[interval] syncAllOfferStatuses:', err.message)), 10 * 60 * 1000);

  // Deactivate offers from sellers inactive for 10+ days — runs at startup then every 6 hours
  deactivateStaleOffers().catch(err => console.error('[startup] deactivateStaleOffers:', err.message));
  setInterval(() => deactivateStaleOffers().catch(err => console.error('[interval] deactivateStaleOffers:', err.message)), 6 * 60 * 60 * 1000);
  console.log('🔕 Stale offer cron: pauses offers from sellers inactive 10+ days — checks every 6 hours');

  // Backfill missing country codes for existing users using phone/KYC data
  backfillCountriesFromPhone().catch(err => console.error('[startup] backfillCountries:', err.message));

  // ── Live mainnet services — only run against production ─────────────────
  // Guards deposit monitor, sweep service, and balance checks from firing
  // against the real Supabase DB / hot wallet during local development.
  if (process.env.NODE_ENV === 'production' || process.env.START_SERVICES === 'true') {
    // Real-time deposit detection via mempool.space WebSocket
    // Detects deposits within 1-3 seconds of entering mempool, credits on confirmation
    realtimeDepositService.start().catch(err =>
      console.error('[RealtimeDeposit] Startup error:', err.message)
    );

    // 5-minute scanner kept as safety net (catches anything WebSocket misses on reconnect)
    depositMonitor.start();
    console.log('🔍 Deposit monitor: MAINNET — polls every 5 min | SMS + Email alerts enabled');

    // USDT TRC-20 deposit monitor — scans all Tron addresses every 15 min
    usdtDepositMonitor.start();
    console.log('🔍 USDT Deposit monitor: MAINNET (Tron) — polls every 15 min | Email + Push alerts enabled');

    // ── Deposit sweeper — moves confirmed deposits to hot wallet ───────────
    // Runs 2 min after startup then every 30 min. Silent — never affects user balances.
    sweepService.start();
    console.log(`🧹 Sweep service: MAINNET — hot wallet ${hdWalletService.getHotWalletAddress()}`);

    // ── Daily balance integrity check ───────────────────────────────────────
    balanceIntegrity.start();
  } else {
    console.log('⏸  Live mainnet services (deposit monitor, sweep, balance integrity) skipped — NODE_ENV is not "production"');
  }

  // ── Auto-cancel expired trades every 60 seconds ───────────────────────────
  const _runExpiredTrades = async () => {
    try {
      const count = await tradeEscrowService.processExpiredTrades();
      if (count > 0) console.log(`[ExpiredTrades] Auto-cancelled ${count} expired trade(s)`);
    } catch (err) {
      console.error('[ExpiredTrades] Cron error:', err.message);
    }
  };
  // Run once immediately to catch trades that expired while server was offline
  _runExpiredTrades();
  setInterval(_runExpiredTrades, 60 * 1000);
  console.log('⏱  Expired trade cron: checks every 60 seconds — BTC auto-refunded to seller on expiry');
});

module.exports = app;