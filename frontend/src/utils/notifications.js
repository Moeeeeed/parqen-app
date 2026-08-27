// frontend/src/utils/notifications.js

// ── Internal: wait for OneSignal to finish initialising ──────────────────────
function waitForOS(timeout = 15000) {
  return new Promise((resolve) => {
    // Already properly initialized? Check for actual SDK readiness,
    // not just existence — after a failed init, window.OneSignal is just
    // the class reference without User/login/PushSubscription.
    if (window.OneSignal?.User && typeof window.OneSignal.login === 'function') {
      return resolve(window.OneSignal);
    }

    let resolved = false;
    const finish = (result) => {
      if (resolved) return;
      resolved = true;
      cleanup();
      resolve(result);
    };

    const cleanup = () => {
      window.removeEventListener('onesignal:ready', onReady);
      window.removeEventListener('onesignal:error', onError);
      clearTimeout(timer);
      clearTimeout(pollTimer);
    };

    // Signal from index.html: init succeeded
    const onReady = () => {
      // Double-check that init actually produced a usable SDK
      if (window.OneSignal?.User && typeof window.OneSignal.login === 'function') {
        finish(window.OneSignal);
      } else {
        // onesignal:ready fired but SDK is not usable — treat as failure
        console.warn('[Push] onesignal:ready fired but SDK not fully initialized');
        finish(null);
      }
    };

    // Signal from index.html: init failed
    const onError = (e) => {
      console.warn('[Push] OneSignal init failed:', e?.detail?.message || 'unknown error');
      finish(null);
    };

    window.addEventListener('onesignal:ready', onReady, { once: true });
    window.addEventListener('onesignal:error', onError, { once: true });

    // Poll briefly in case the event already fired before we attached listeners
    const pollTimer = setTimeout(() => {
      if (window.OneSignal?.User && typeof window.OneSignal.login === 'function') {
        finish(window.OneSignal);
      }
    }, 500);

    const timer = setTimeout(() => {
      cleanup();
      console.warn('[Push] OneSignal did not initialise within', timeout, 'ms');
      // Return null, not the uninitialized class — callers must handle this
      finish(null);
    }, timeout);
  });
}

// ── Public helpers ────────────────────────────────────────────────────────────

export function isPushSupported() {
  return typeof window !== 'undefined'
      && 'Notification' in window
      && 'serviceWorker' in navigator;
}

export async function getNotificationPermission() {
  if (!isPushSupported()) return 'unsupported';

  // Use the browser-native API as the source of truth — it's always reliable.
  // OneSignal's `permission` getter returns a string ('default'/'granted'/'denied')
  // which is always truthy in JS, so we must compare explicitly.
  const nativePerm = window.Notification?.permission;
  if (nativePerm === 'granted') return 'granted';
  if (nativePerm === 'denied') return 'denied';

  // Check OneSignal's state (may track its own subscription state)
  try {
    const OS = await waitForOS(3000);
    if (OS?.Notifications) {
      const osPerm = await OS.Notifications.permission;
      if (osPerm === 'granted') return 'granted';
      if (osPerm === 'denied') return 'denied';
    }
  } catch {
    // ignore — native check above is authoritative
  }

  return 'default';
}

export async function requestNotificationPermission() {
  if (!isPushSupported()) return false;

  // Detect browser-level block early — the native prompt won't show again
  if (window.Notification?.permission === 'denied') {
    console.warn('[Push] Browser notification permission is already denied');
    return false;
  }

  // Safety timeout: if nothing resolves within 15 s, give up and return false
  const TIMEOUT_MS = 15000;
  const withTimeout = (promise) =>
    Promise.race([
      promise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Permission request timed out')), TIMEOUT_MS)
      ),
    ]);

  try {
    const OS = await waitForOS();
    if (!OS) {
      console.warn('[Push] OneSignal not available, trying native API');
      const result = await withTimeout(Notification.requestPermission());
      return result === 'granted';
    }

    if (OS.Notifications) {
      // Use the browser-native permission as source of truth
      if (window.Notification?.permission === 'granted') return true;

      // Request permission with a timeout to prevent permanent hang
      await withTimeout(OS.Notifications.requestPermission());

      // Always verify the actual browser state after the request
      return window.Notification?.permission === 'granted';
    }

    // OneSignal.Notifications not available — fall back to native API
    const result = await withTimeout(Notification.requestPermission());
    return result === 'granted';
  } catch (e) {
    console.error('[Push] requestNotificationPermission failed:', e);
    return false;
  }
}

// ── identifyUser using OneSignal.login() ──
// Returns { success, playerId } so callers know if linking worked.
export async function identifyUser(userId) {
  if (!userId) {
    console.warn('[Push] identifyUser: No userId provided');
    return { success: false, playerId: null };
  }

  try {
    console.log('[Push] identifyUser: Starting for user:', userId);

    const OS = await waitForOS(10000);

    if (!OS) {
      console.warn('[Push] identifyUser: OneSignal not available after wait');
      return { success: false, playerId: null };
    }

    // Verify login() is actually a function (guards against partial SDK load)
    if (typeof OS.login !== 'function') {
      console.warn('[Push] identifyUser: OS.login is not a function — SDK may not be fully loaded. Keys:', Object.keys(OS).join(', '));
      return { success: false, playerId: null };
    }

    // ── Step 1: Set external user ID via login() ──
    let linked = false;
    try {
      await OS.login(String(userId));
      linked = true;
      console.log('[Push] ✅ OS.login() succeeded for user:', userId);
    } catch (e) {
      const errMsg = e.message || String(e);
      console.warn('[Push] ❌ OS.login() failed:', errMsg);

      // Diagnose common failure causes
      if (errMsg.includes('undefined') || errMsg.includes('Qe') || errMsg.includes('null')) {
        console.warn(
          '[Push] 💡 This usually means OneSignal.init() did not complete successfully.',
          'Check the console above for [OneSignal] Init error messages.',
          'The App ID must match the OneSignal dashboard, and the current origin must be in Allowed Origins.'
        );
      }
      if (errMsg.includes('identity') || errMsg.includes('JWT') || errMsg.includes('auth') || errMsg.includes('401') || errMsg.includes('403')) {
        console.warn(
          '[Push] 💡 Identity Verification may be enabled in your OneSignal dashboard.',
          'Go to OneSignal Dashboard → Settings → Users → Identity Verification and either disable it,\n'
          + 'or implement JWT identity hash signing on the backend. See: https://documentation.onesignal.com/docs/identity-verification'
        );
      }
    }

    if (!linked) {
      console.warn('[Push] Could not link user — push delivery will fail');
      return { success: false, playerId: null };
    }

    // ── Step 2: Retrieve subscription/player ID (v16 API) ──
    // In OneSignal SDK v16 the subscription ID lives at
    // OneSignal.User.PushSubscription.id (async getter).
    // Older code checked OS.User.onesignalId which does NOT exist in v16.
    let subscriptionId = null;

    // Try v16 API first: PushSubscription.id is an async getter
    try {
      if (OS.User?.PushSubscription) {
        subscriptionId = await OS.User.PushSubscription.id;
        if (subscriptionId) {
          console.log('[Push] 📱 Subscription ID (v16 PushSubscription.id):', subscriptionId);
        }
      }
    } catch (e) {
      console.warn('[Push] PushSubscription.id read failed:', e.message);
    }

    // Fallback: legacy v15 property
    if (!subscriptionId && OS.User?.onesignalId) {
      subscriptionId = OS.User.onesignalId;
      console.log('[Push] 📱 Subscription ID (legacy onesignalId):', subscriptionId);
    }

    // Fallback: getUserId() if it exists
    if (!subscriptionId && typeof OS.getUserId === 'function') {
      try {
        subscriptionId = await OS.getUserId();
        if (subscriptionId) console.log('[Push] 📱 Subscription ID (getUserId):', subscriptionId);
      } catch(e) {}
    }

    // ── Step 3: Retry once after a short delay (subscription may need time) ──
    if (!subscriptionId) {
      console.log('[Push] ⏳ No subscription ID yet — retrying in 3s...');
      await new Promise(r => setTimeout(r, 3000));
      try {
        if (OS.User?.PushSubscription) {
          subscriptionId = await OS.User.PushSubscription.id;
        }
      } catch(e) {}
      if (!subscriptionId && OS.User?.onesignalId) {
        subscriptionId = OS.User.onesignalId;
      }
      console.log('[Push] 📱 Subscription ID after retry:', subscriptionId || 'not found');
    }

    // ── Step 4: Diagnostic — log subscription state regardless ──
    try {
      const optedIn = await OS.User?.PushSubscription?.optedIn;
      const permission = window.Notification?.permission;
      console.log('[Push] 📊 Subscription state:', {
        optedIn,
        browserPermission: permission,
        hasPushSubscription: !!subscriptionId,
        externalId: OS.User?.externalId,
      });
      if (permission !== 'granted') {
        console.warn('[Push] ⚠️ Browser notification permission is', permission, '— push will not deliver until granted');
      }
    } catch(e) { /* diagnostic only */ }

    // ── Step 5: Save subscription ID to backend ──
    if (subscriptionId) {
      const token = localStorage.getItem('token');
      if (token) {
        try {
          const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';
          const response = await fetch(`${API_URL}/users/onesignal-id`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ onesignal_id: subscriptionId })
          });
          const data = await response.json();
          if (response.ok) {
            console.log('[Push] ✅ Subscription ID saved to backend. Player ID:', subscriptionId);
            return { success: true, playerId: subscriptionId };
          } else {
            console.warn('[Push] ⚠️ Backend save failed:', JSON.stringify(data));
          }
        } catch (fetchError) {
          console.error('[Push] ❌ Backend save fetch error:', fetchError.message);
        }
      } else {
        console.warn('[Push] ⚠️ No auth token — skipping backend save');
      }
    } else {
      console.warn('[Push] ⚠️ Could not retrieve subscription ID — backend save skipped');
    }

    // Even if we couldn't retrieve the subscription ID for backend storage,
    // the login() call above already linked the external ID in OneSignal.
    // Push delivery via include_external_user_ids should still work.
    return { success: !!subscriptionId, playerId: subscriptionId };
  } catch (e) {
    console.error('[Push] identifyUser error:', e);
    return { success: false, error: e?.message };
  }
}

// ── Check external ID ──
export async function checkExternalId() {
  try {
    const OS = await waitForOS(3000);
    if (!OS) return null;
    let subscriptionId = OS.User?.onesignalId ?? null;
    if (!subscriptionId && OS.User?.PushSubscription) {
      try { subscriptionId = await OS.User.PushSubscription.id; } catch(e) {}
    }
    return {
      externalId: OS.User?.externalId ?? null,
      subscriptionId,
    };
  } catch (e) {
    console.error('[Push] checkExternalId failed:', e);
    return null;
  }
}

// ── Initialize notification system ───────────────────────────────────────────
export function initNotifications() {
  console.log('[Push] Initializing notification system...');

  if (Notification.permission === 'granted') {
    console.log('[Push] ✅ Permission already granted');
    return true;
  }

  Notification.requestPermission().then(result => {
    if (result === 'granted') {
      console.log('[Push] ✅ Permission granted');
    } else {
      console.warn('[Push] ⚠️ Permission denied');
    }
  });

  return false;
}

// ── Expose helpers on window for debugging ──────────────────────────────────
if (typeof window !== 'undefined') {
window.__checkPushId = checkExternalId;
window.__identifyUser = identifyUser;
window.__sendTestNotification = sendTestNotification;
window.__unidentifyUser = unidentifyUser;
window.__initNotifications = initNotifications;

console.log('[Push] ✅ Debug helpers available:');
console.log('  window.__identifyUser(userId) - Link user');
console.log('  window.__sendTestNotification() - Send test notification');
console.log('  window.__unidentifyUser() - Unlink user');
}

// ── Unidentify user ──
export async function unidentifyUser() {
  try {
    const OS = await waitForOS(3000);
    if (!OS) {
      _identified = false;
      return;
    }

    if (typeof OS.logout === 'function') {
      await OS.logout();
      console.log('[Push] ✅ OS.logout() done');
    } else if (OS.User && typeof OS.User.logout === 'function') {
      await OS.User.logout();
      console.log('[Push] ✅ User.logout() done');
    }
  } catch (e) {
    console.error('[Push] unidentifyUser failed:', e);
  }
  // Always reset so next login triggers a fresh identification
  _identified = false;
}

// ── Send test notification ──
export async function sendTestNotification(userId, type = 'new_trade') {
  try {
    const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';
    const token = localStorage.getItem('token');

    if (!token) {
      console.warn('[Push] No token found');
      return false;
    }

    const response = await fetch(`${API_URL}/test-push`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ userId, type })
    });

    const data = await response.json();
    console.log('[Push] Test notification:', data);
    return response.ok ? data : false;
  } catch (error) {
    console.error('[Push] Test error:', error);
    return false;
  }
}

// ── ✅ FIXED: Initialize OneSignal (only once) ──
let _identified = false;

export async function initOneSignal(userId) {
  // OneSignal is already initialized by index.html with the correct App ID
  // (environment-detecting: local vs production). Do NOT call OneSignal.init()
  // again — double-init causes subscription failures. We only need to wait for
  // the SDK to be ready and then link the user via identifyUser().

  if (_identified && !userId) return true;

  try {
    const OS = await waitForOS(10000);
    if (!OS) {
      console.warn('[Push] OneSignal SDK not available after wait — check init errors above');
      return false;
    }

    console.log('[Push] ✅ OneSignal SDK ready');

    if (userId) {
      const result = await identifyUser(userId);
      if (result?.success) {
        _identified = true;
        console.log('[Push] ✅ User identified after init');
      } else {
        console.warn('[Push] ⚠️ identifyUser did not succeed — will retry on next call');
      }
    }

    return true;
  } catch (error) {
    console.error('[Push] initOneSignal error:', error);
    return false;
  }
}

// ── Get status ──
export async function getOneSignalStatus() {
  const OS = window.OneSignal;
  if (!OS) return { loaded: false };

  let subscriptionId = OS.User?.onesignalId ?? null;
  if (!subscriptionId && OS.User?.PushSubscription) {
    try { subscriptionId = await OS.User.PushSubscription.id; } catch(e) {}
  }

  let optedIn = null;
  if (OS.User?.PushSubscription) {
    try { optedIn = await OS.User.PushSubscription.optedIn; } catch(e) {}
  }

  return {
    loaded: true,
    identified: _identified,
    externalId: OS.User?.externalId ?? null,
    subscriptionId,
    optedIn,
    browserPermission: typeof Notification !== 'undefined' ? Notification.permission : 'unknown',
  };
}

if (typeof window !== 'undefined') {
  window.__getOneSignalStatus = getOneSignalStatus;
}