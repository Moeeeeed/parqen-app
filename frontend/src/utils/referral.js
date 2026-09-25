// Remembers which affiliate link / scan code brought a visitor, until they sign up.
// The code is kept for 30 days in localStorage. Storage can be blocked (private
// windows, strict browsers), so every read and write is wrapped and the signup
// still works without it.

const KEY = 'praqen_ref';
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

// Codes look like "name_ab12cd" (older accounts may use their username). Keep it
// short and plain: letters, digits, underscore, dot, dash, space.
export function cleanReferralCode(raw) {
  if (raw == null) return '';
  const v = String(raw).trim();
  if (!v || v.length > 64) return '';
  if (!/^[A-Za-z0-9_.\- ]+$/.test(v)) return '';
  return v;
}

// Call with window.location.search. A newer link replaces an older one.
export function captureReferralFromUrl(search) {
  try {
    const code = cleanReferralCode(new URLSearchParams(search || '').get('ref'));
    if (!code) return null;
    localStorage.setItem(KEY, JSON.stringify({ code, ts: Date.now() }));
    return code;
  } catch (e) {
    return null;
  }
}

export function getStoredReferral() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const { code, ts } = JSON.parse(raw);
    const clean = cleanReferralCode(code);
    if (!clean || !ts || Date.now() - ts > MAX_AGE_MS) {
      localStorage.removeItem(KEY);
      return null;
    }
    return clean;
  } catch (e) {
    return null;
  }
}

export function clearStoredReferral() {
  try {
    localStorage.removeItem(KEY);
  } catch (e) { /* ignore */ }
}
