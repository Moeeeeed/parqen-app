// frontend/src/utils/notifications.js

// ── Internal: wait for OneSignal to finish initialising ──────────────────────
function waitForOS(timeout = 15000) {
  return new Promise((resolve) => {
    if (window.OneSignal && typeof window.OneSignal === 'object' && window.OneSignal.User) {
      return resolve(window.OneSignal);
    }

    let timer;
    const onReady = () => {
      clearTimeout(timer);
      resolve(window.OneSignal || null);
    };

    window.addEventListener('onesignal:ready', onReady, { once: true });

    setTimeout(() => {
      if (window.OneSignal && window.OneSignal.User) {
        window.removeEventListener('onesignal:ready', onReady);
        resolve(window.OneSignal);
      }
    }, 500);

    timer = setTimeout(() => {
      window.removeEventListener('onesignal:ready', onReady);
      console.warn('[Push] OneSignal did not initialise within', timeout, 'ms');
      resolve(window.OneSignal || null);
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

// ── ✅ FIXED: identifyUser using OneSignal.login() ──
export async function identifyUser(userId) {
  if (!userId) {
    console.warn('[Push] identifyUser: No userId provided');
    return;
  }

  try {
    console.log('[Push] identifyUser: Starting for user:', userId);

    const OS = await waitForOS(10000);

    if (!OS) {
      console.warn('[Push] identifyUser: OneSignal not available');
      return;
    }

    console.log('[Push] ✅ OneSignal available');

    // ── Step 1: Use login() method ──
    let linked = false;

    try {
      // ✅ This is the correct method
      await OS.login(String(userId));
      linked = true;
      console.log('[Push] ✅ login() success:', userId);
    } catch (e) {
      console.warn('[Push] login() failed:', e.message);
    }

    if (!linked) {
      console.warn('[Push] Could not link user');
      return;
    }

    // ── Step 2: Wait for player ID ──
    console.log('[Push] ⏳ Waiting for player ID...');
    await new Promise(r => setTimeout(r, 3000));

    // ── Step 3: Get player ID ──
    let onesignalId = null;

    if (OS.User && OS.User.onesignalId) {
      onesignalId = OS.User.onesignalId;
    }

    if (!onesignalId && typeof OS.getUserId === 'function') {
      try {
        onesignalId = await OS.getUserId();
      } catch(e) {}
    }

    console.log('[Push] 📱 Player ID:', onesignalId || 'not found');

    // ── Step 4: Retry if no ID ──
    if (!onesignalId) {
      for (let i = 0; i < 3; i++) {
        console.log(`[Push] Retry ${i+1}/3...`);
        await new Promise(r => setTimeout(r, 2000));
        if (OS.User && OS.User.onesignalId) {
          onesignalId = OS.User.onesignalId;
          break;
        }
      }
      console.log('[Push] 📱 Player ID after retry:', onesignalId || 'not found');
    }

    // ── Step 5: Save to backend ──
    if (onesignalId) {
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
            body: JSON.stringify({ onesignal_id: onesignalId })
          });

          const data = await response.json();

          if (response.ok) {
            console.log('[Push] ✅ OneSignal ID saved:', data);
            console.log('[Push] 🎉 SUCCESS! Player ID:', onesignalId);
            return { success: true, playerId: onesignalId };
          } else {
            console.warn('[Push] ⚠️ Backend save failed:', data);
          }
        } catch (fetchError) {
          console.error('[Push] ❌ Save error:', fetchError);
        }
      } else {
        console.warn('[Push] ⚠️ No token found, skipping backend save');
      }
    } else {
      console.warn('[Push] ⚠️ No player ID available');
      console.log('[Push] 📌 State:', {
        User: OS.User,
        onesignalId: OS.User?.onesignalId
      });
    }

    return { success: false, playerId: null };
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
    return {
      externalId: OS.User?.externalId ?? null,
      playerId: OS.User?.onesignalId ?? null
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
    if (!OS) return;

    if (typeof OS.logout === 'function') {
      await OS.logout();
      console.log('[Push] ✅ logout() done');
      return;
    }

    if (OS.User && typeof OS.User.logout === 'function') {
      await OS.User.logout();
      console.log('[Push] ✅ User.logout() done');
      return;
    }
  } catch (e) {
    console.error('[Push] unidentifyUser failed:', e);
  }
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
let _initialized = false;
let _initPromise = null;

export async function initOneSignal(userId) {
  // If already initialized, return immediately
  if (_initialized) {
    console.log('[Push] ✅ OneSignal already initialized (cached)');
    if (userId) {
      await identifyUser(userId);
    }
    return true;
  }

  // If initialization is already in progress, wait for it
  if (_initPromise) {
    console.log('[Push] ⏳ Waiting for existing initialization...');
    await _initPromise;
    if (userId) {
      await identifyUser(userId);
    }
    return true;
  }

  // Start initialization
  _initPromise = (async () => {
    try {
      if (!window.OneSignal) {
        console.warn('[Push] OneSignal SDK not loaded');
        return false;
      }

      // Check if already initialized via window
      if (window.OneSignal.initialized) {
        console.log('[Push] ✅ OneSignal already initialized (window)');
        _initialized = true;
        if (userId) {
          await identifyUser(userId);
        }
        return true;
      }

      console.log('[Push] ✅ OneSignal SDK loaded, initializing...');

      // Initialize OneSignal
      await window.OneSignal.init({
        appId: '6bfba397-b0b1-4718-abde-6ecb375c4f40',
        allowLocalhostAsSecureOrigin: true,
        serviceWorkerPath: '/OneSignalSDKWorker.js'
      });

      _initialized = true;
      console.log('[Push] ✅ OneSignal initialized successfully');

      if (userId) {
        await new Promise(r => setTimeout(r, 2000));
        await identifyUser(userId);
        console.log('[Push] ✅ User identified after init');
      }

      return true;
    } catch (error) {
      // Ignore "already initialized" error
      if (error?.message?.includes('already initialized')) {
        console.log('[Push] ✅ SDK already initialized (ignoring)');
        _initialized = true;
        if (userId) {
          await identifyUser(userId);
        }
        return true;
      }
      console.error('[Push] initOneSignal error:', error);
      return false;
    } finally {
      _initPromise = null;
    }
  })();

  return _initPromise;
}

// ── Get status ──
export function getOneSignalStatus() {
  const OS = window.OneSignal;
  if (!OS) return { loaded: false };

  return {
    loaded: true,
    initialized: _initialized,
    user: OS.User,
    externalId: OS.User?.externalId,
    playerId: OS.User?.onesignalId,
    notificationPermission: Notification.permission,
  };
}

if (typeof window !== 'undefined') {
  window.__getOneSignalStatus = getOneSignalStatus;
}