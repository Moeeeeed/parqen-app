import React, { useState, useEffect, lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useParams, useNavigate, useLocation } from 'react-router-dom';
import {
  Bell, ArrowLeftRight, ArrowRight,
  Send, MoveRight, Clock,
} from 'lucide-react';
import { HelmetProvider } from 'react-helmet-async';
import { RatesProvider } from './contexts/RatesContext';
import { useLastVisitedTracker } from './hooks/useLastVisited';
import axios from 'axios';
import {
  identifyUser,
  unidentifyUser,
  initOneSignal,
  getNotificationPermission,
  sendTestNotification
} from './utils/notifications';
import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import CustomToastContainer from './components/CustomToastContainer';
import Navbar from './components/Navbar';
import { clearCachedActiveTrades } from './utils/activeTradesCache';
import BottomNav from './components/BottomNav';
import { NotificationPrompt, AndroidInstallBanner, IOSInstallGuide } from './components/PushSetup';
import ErrorBoundary from './components/ErrorBoundary';
// eslint-disable-next-line import/first
const WelcomeModal = lazyRetry(() => import('./components/WelcomeModal'));
// eslint-disable-next-line import/first
const WelcomeBonusModal = lazyRetry(() => import('./components/WelcomeBonusModal'));
// eslint-disable-next-line import/first
const SuggestionsPanel = lazyRetry(() => import('./components/SuggestionsPanel'));

// Resets the ErrorBoundary on every route change, so a crash on one page
// doesn't leave every subsequent page stuck on the fallback screen.
function RouteErrorBoundary({ children, user }) {
  const currentLoc = useLocation();
  useLastVisitedTracker(user, currentLoc);
  return <ErrorBoundary key={currentLoc.pathname}>{children}</ErrorBoundary>;
}

// ── Monkeypatch react-toastify ──────────────────────────────────────────────
const customToast = (message, options) => {
  window.dispatchEvent(new CustomEvent('custom-toast', { detail: { message, type: 'default', options } }));
  return options?.toastId || Math.random().toString();
};
customToast.success = (message, options) => {
  window.dispatchEvent(new CustomEvent('custom-toast', { detail: { message, type: 'success', options } }));
  return options?.toastId || Math.random().toString();
};
customToast.error = (message, options) => {
  window.dispatchEvent(new CustomEvent('custom-toast', { detail: { message, type: 'error', options } }));
  return options?.toastId || Math.random().toString();
};
customToast.info = (message, options) => {
  window.dispatchEvent(new CustomEvent('custom-toast', { detail: { message, type: 'info', options } }));
  return options?.toastId || Math.random().toString();
};
customToast.warn = (message, options) => {
  window.dispatchEvent(new CustomEvent('custom-toast', { detail: { message, type: 'warning', options } }));
  return options?.toastId || Math.random().toString();
};
customToast.warning = customToast.warn;
customToast.dismiss = (id) => {
  window.dispatchEvent(new CustomEvent('custom-toast-dismiss', { detail: { id } }));
};
customToast.isActive = () => false;
customToast.update = () => { };
customToast.onChange = () => () => { };
Object.assign(toast, customToast);

// ── Silence console in production ────────────────────────────────────────────
if (process.env.NODE_ENV === 'production') {
  const noop = () => { };
  console.log = noop;
  console.info = noop;
  console.debug = noop;
  console.warn = noop;
}

// ── Lazy-loaded pages ────────────────────────────────────────────────────────
// A dynamic import() can fail if the tab has an older build's chunk manifest in
// memory and the dev/build server has since redeployed — the failed fetch throws,
// Suspense propagates it to the nearest ErrorBoundary, and the user sees the
// generic "Something went wrong" card on whatever route they happened to be on,
// with no connection to that page's own code. Retrying once via a full reload
// picks up the current chunk manifest and recovers transparently; a second
// failure (session storage flag already set) is a real error, so it's let through.
function lazyRetry(importer) {
  return lazy(() =>
    importer().catch((err) => {
      const alreadyRetried = sessionStorage.getItem('chunk_reload_done');
      if (alreadyRetried) throw err;
      sessionStorage.setItem('chunk_reload_done', '1');
      window.location.reload();
      return new Promise(() => {});
    })
  );
}

// eslint-disable-next-line import/first
const GiftCardMarketplace = lazyRetry(() => import('./pages/GiftCardMarketplace'));
// eslint-disable-next-line import/first
const Blog = lazyRetry(() => import('./pages/Blog'));
// eslint-disable-next-line import/first
const BlogPost = lazyRetry(() => import('./pages/BlogPost'));
// eslint-disable-next-line import/first
const PrivacyPolicy = lazyRetry(() => import('./pages/PrivacyPolicy'));
// eslint-disable-next-line import/first
const TermsOfService = lazyRetry(() => import('./pages/TermsOfService'));
// eslint-disable-next-line import/first
const LandingPage = lazyRetry(() => import('./pages/LandingPage'));
// eslint-disable-next-line import/first
const Register = lazyRetry(() => import('./pages/Register'));
// eslint-disable-next-line import/first
const Login = lazyRetry(() => import('./pages/Login'));
// eslint-disable-next-line import/first
const CreateListing = lazyRetry(() => import('./pages/CreateListing'));
// eslint-disable-next-line import/first
const CreateOffer = lazyRetry(() => import('./pages/CreateOffer'));
// eslint-disable-next-line import/first
const ListingDetail = lazyRetry(() => import('./pages/ListingDetail'));
// eslint-disable-next-line import/first
const MyTrades = lazyRetry(() => import('./pages/MyTrades'));
// eslint-disable-next-line import/first
const TradeDetail = lazyRetry(() => import('./pages/TradeDetail'));
// eslint-disable-next-line import/first
const Profile = lazyRetry(() => import('./pages/Profile'));
// eslint-disable-next-line import/first
const AdminDashboard = lazyRetry(() => import('./pages/AdminDashboard'));
// eslint-disable-next-line import/first
const ModeratorDashboard = lazyRetry(() => import('./pages/ModeratorDashboard'));
// eslint-disable-next-line import/first
const TeamDashboard = lazyRetry(() => import('./pages/TeamDashboard'));
// eslint-disable-next-line import/first
const CeoDashboard = lazyRetry(() => import('./pages/CeoDashboard'));
// eslint-disable-next-line import/first
const EscrowVerification = lazyRetry(() => import('./pages/EscrowVerification'));
// eslint-disable-next-line import/first
const WalletPage = lazyRetry(() => import('./pages/Wallet'));
// eslint-disable-next-line import/first
const Dashboard = lazyRetry(() => import('./pages/Dashboard'));
// eslint-disable-next-line import/first
const Settings = lazyRetry(() => import('./pages/Settings'));
// eslint-disable-next-line import/first
const MyListings = lazyRetry(() => import('./pages/MyListings'));
// eslint-disable-next-line import/first
const EditListing = lazyRetry(() => import('./pages/EditListing'));
// eslint-disable-next-line import/first
const ForgotPassword = lazyRetry(() => import('./pages/ForgotPassword'));
// eslint-disable-next-line import/first
const Feedback = lazyRetry(() => import('./pages/Feedback'));
// eslint-disable-next-line import/first
const TradeChat = lazyRetry(() => import('./pages/TradeChat'));
// eslint-disable-next-line import/first
const BuyBitcoin = lazyRetry(() => import('./pages/BuyBitcoin'));
// eslint-disable-next-line import/first
const SellBitcoin = lazyRetry(() => import('./pages/SellBitcoin'));
// eslint-disable-next-line import/first
const BuyUSDT = lazyRetry(() => import('./pages/BuyUSDT'));
// eslint-disable-next-line import/first
const SellUSDT = lazyRetry(() => import('./pages/SellUSDT'));
// eslint-disable-next-line import/first
const SellGiftCardMarketplace = lazyRetry(() => import('./pages/SellGiftCardMarketplace'));
// eslint-disable-next-line import/first
const MenuPage = lazyRetry(() => import('./pages/MenuPage'));
// eslint-disable-next-line import/first
const TraderSettings = lazyRetry(() => import('./pages/TraderSettings'));
// eslint-disable-next-line import/first
const AgentDashboard = lazyRetry(() => import('./pages/AgentDashboard'));
// eslint-disable-next-line import/first
const AccountantDashboard = lazyRetry(() => import('./pages/AccountantDashboard'));
// eslint-disable-next-line import/first
const VerifyOTP = lazyRetry(() => import('./pages/VerifyOTP'));
// eslint-disable-next-line import/first
const ResetPassword = lazyRetry(() => import('./pages/ResetPassword'));
// eslint-disable-next-line import/first
const EmailConfirmation = lazyRetry(() => import('./pages/EmailConfirmation'));
// eslint-disable-next-line import/first
const CheckEmail = lazyRetry(() => import('./pages/CheckEmail'));
// eslint-disable-next-line import/first
const PlaceholderPage = lazyRetry(() => import('./pages/PlaceholderPage'));
const ActivityLog = lazyRetry(() => import('./pages/ActivityLog'));
const StatusPage = lazyRetry(() => import('./pages/StatusPage'));
// eslint-disable-next-line import/first
const PartnerProgram = lazyRetry(() => import('./pages/PartnerProgram'));
// eslint-disable-next-line import/first
const PartnerCalculator = lazyRetry(() => import('./pages/PartnerCalculator'));

// Note: ArrowLeftRight, Send, MoveRight, Award, CircleHelp, Sparkles,
// Disc, Bell, CreditCard, ShieldCheck, TrendingUp, Info, Medal, Share2
// are imported via lazy-loaded pages; only the ones needed at App level
// are imported here directly.

// ── Page Loader ──────────────────────────────────────────────────────────────
function PageLoader() {
  return (
    <div style={{
      position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(145deg,#1B4332 0%,#0c2418 50%,#2D6A4F 100%)',
      zIndex: 9998,
    }}>
      <div style={{
        width: 56, height: 56, background: '#F4A422', borderRadius: 18,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 28, fontWeight: 900, color: '#1B4332',
        fontFamily: 'Georgia,serif', marginBottom: 14,
        animation: 'prq-pulse 1.6s ease-in-out infinite',
        boxShadow: '0 0 30px rgba(244,164,34,0.4)',
      }}>P</div>
      <p style={{ color: '#fff', fontSize: 15, fontWeight: 800, letterSpacing: 3, fontFamily: 'Georgia,serif', margin: 0 }}>
        PRAQEN
      </p>
      <style>{`@keyframes prq-pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.07)}}`}</style>
    </div>
  );
}

// ── API Base URL ─────────────────────────────────────────────────────────────
export const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

// ── Dashboard link helpers ───────────────────────────────────────────────────
// Leaves the app for an outside page (Discord).
function ExternalRedirect({ to }) {
  useEffect(() => { window.location.replace(to); }, [to]);
  return null;
}
// "Contact support": go back to the dashboard and open the support panel.
function OpenSupport() {
  const navigate = useNavigate();
  useEffect(() => {
    navigate('/dashboard', { replace: true });
    const t = setTimeout(() => window.dispatchEvent(new Event('praqen:open-support')), 250);
    return () => clearTimeout(t);
  }, [navigate]);
  return null;
}

// ── Ref Redirect ─────────────────────────────────────────────────────────────
function RefRedirect() {
  const currentLoc = useLocation();

  const { username } = useParams();
  const navigate = useNavigate();

  useEffect(() => {
    axios.get(`${API_URL}/ref/${encodeURIComponent(username)}`)
      .then(({ data }) => {
        const code = data.referral_code || username;
        navigate(`/signup?ref=${encodeURIComponent(code)}`, { replace: true });
      })
      .catch(() => {
        navigate(`/signup?ref=${encodeURIComponent(username)}`, { replace: true });
      });
  }, [username, navigate]);

  return <PageLoader />;
}

// ── App Shell ─────────────────────────────────────────────────────────────────
const AUTH_ROUTES = ['/login', '/register', '/signup', '/forgot-password'];

// No overflowX here on purpose: <html>/<body> already clip horizontal overflow (index.css), so
// this wrapper doesn't need its own — and per the CSS overflow interop rule, setting overflow-x
// here (with overflow-y left at its default 'visible') forces overflow-y to become 'auto' too.
// That silently turns this wrapper into its OWN (empty) scroll container, and on a real touch
// device the browser can latch a swipe onto that dead container instead of the real page —
// scrolling then just stops responding. (overflowY: 'visible' can't be declared to opt back out:
// per spec it gets flipped to 'auto' again as long as overflowX isn't also 'visible'. The only
// fix is to not set overflowX here at all.) Same fix on #root in index.css.

function AppShell({ children }) {
  return (
    <div className="min-h-screen pb-nav-mobile"
      style={{ maxWidth: '100vw', paddingTop: 'var(--navbar-h)' }}>
      {children}
    </div>
  );
}

function AuthAwareShell({ children, user, onLogout, showBonusModal, setShowBonusModal, showWelcome, setShowWelcome }) {
  const location = useLocation();
  const isAuthPage = AUTH_ROUTES.includes(location.pathname);
  return (
    <div className={isAuthPage ? 'auth-shell' : 'min-h-screen pb-nav-mobile'}
      style={{ maxWidth: '100vw', paddingTop: isAuthPage ? 0 : 'var(--navbar-h)', position: 'relative' }}>
      {!isAuthPage && <Navbar user={user} onLogout={onLogout} />}

      {showBonusModal && user && (
        <WelcomeBonusModal user={user} onClose={() => {
          localStorage.setItem(`prq_bonus_shown_${user.id}`, '1');
          setShowBonusModal(false);
          if (!localStorage.getItem(`prq_welcomed_${user.id}`)) {
            setShowWelcome(true);
          }
        }} />
      )}

      {showWelcome && user && !showBonusModal && (
        <WelcomeModal user={user} onClose={() => setShowWelcome(false)} />
      )}

      {user && <NotificationPrompt userId={user.id} />}
      <AndroidInstallBanner />
      <IOSInstallGuide />

      {children}

      <BottomNav user={user} />
      <SuggestionsPanel user={user} />
    </div>
  );
}

// ── Main App ─────────────────────────────────────────────────────────────────
function App() {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);
  const [showWelcome, setShowWelcome] = useState(false);
  const [showBonusModal, setShowBonusModal] = useState(false);
  // ── ✅ OneSignal Init on Mount ────────────────────────────────────────────
  useEffect(() => {
    if (token && user?.id) {
      initOneSignal(user.id);
    }
  }, [token, user?.id]);

  // A successful mount means the current chunk manifest loaded fine — clear the
  // lazyRetry flag so a *future* chunk failure (after the next deploy) gets its
  // own single retry instead of being treated as "already retried, give up."
  useEffect(() => {
    sessionStorage.removeItem('chunk_reload_done');
  }, []);

  // ── Setup axios interceptor ──────────────────────────────────────────────
  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    if (storedToken) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${storedToken}`;
    } else {
      delete axios.defaults.headers.common['Authorization'];
    }
  }, [token]);

  // ── Force-logout on a mid-session account restriction ────────────────────
  // The backend now rejects an authenticated request from a banned/frozen
  // account (403 ACCOUNT_BANNED / ACCOUNT_FROZEN with `self: true`) or a session
  // whose token was invalidated (401 SESSION_EXPIRED). Clear the local session
  // and bounce the user to /login with the server's own explanation, once.
  //
  // The `self` check matters: the same 403 code is also raised ABOUT A THIRD
  // PARTY (e.g. trying to trade against a banned seller, or a CEO approving a
  // banned user's withdrawal) — those carry no `self` flag and must NOT log the
  // caller out.
  useEffect(() => {
    let handled = false;
    const id = axios.interceptors.response.use(
      (r) => r,
      (error) => {
        const status = error?.response?.status;
        const data = error?.response?.data || {};
        const code = data.error;
        const isRestricted =
          (status === 403 && data.self === true && (code === 'ACCOUNT_BANNED' || code === 'ACCOUNT_FROZEN')) ||
          (status === 401 && code === 'SESSION_EXPIRED');
        if (isRestricted && !handled && localStorage.getItem('token')) {
          handled = true;
          const msg = error?.response?.data?.message ||
            (code === 'ACCOUNT_FROZEN'
              ? 'Your account is temporarily frozen and under review.'
              : code === 'ACCOUNT_BANNED'
                ? 'Your account has been suspended.'
                : 'Your session has ended. Please sign in again.');
          try {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            delete axios.defaults.headers.common['Authorization'];
          } catch { }
          try { toast.error(msg); } catch { }
          window.dispatchEvent(new Event('userUpdated'));
          setTimeout(() => { window.location.assign('/login'); }, 800);
        }
        return Promise.reject(error);
      }
    );
    return () => axios.interceptors.response.eject(id);
  }, []);

  // ── Cleanup market cache ──────────────────────────────────────────────────
  useEffect(() => {
    try {
      const c = JSON.parse(localStorage.getItem('praqen_market_all') || 'null');
      if (c) {
        const empty = !Array.isArray(c.data) || c.data.length === 0;
        const noUsers = !empty && !c.data.some(l => l.users && (l.users.id || l.users.username));
        if (empty || noUsers) localStorage.removeItem('praqen_market_all');
      }
    } catch { }
  }, []);

  // ── Pre-fetch marketplace ──────────────────────────────────────────────────
  useEffect(() => {
    const prefetch = async () => {
      try {
        const c = JSON.parse(localStorage.getItem('praqen_market_all') || 'null');
        if (c && Date.now() - c.ts < 60000) return;
        const r = await axios.get(`${API_URL}/listings`, { timeout: 20000 });
        const all = (r.data.listings || []).map(l => ({
          ...l, users: Array.isArray(l.users) ? l.users[0] : l.users,
        }));
        if (all.length > 0) {
          localStorage.setItem('praqen_market_all', JSON.stringify({ data: all, ts: Date.now() }));
        }
      } catch { }
    };
    const t = setTimeout(prefetch, 800);
    return () => clearTimeout(t);
  }, []);

  // ── ✅ FIXED: Initialize OneSignal on app load (ONLY ONCE) ──────────────
  useEffect(() => {
    let isMounted = true;

    const initPush = async () => {
      try {
        // Check if OneSignal SDK is loaded
        if (!window.OneSignal) {
          console.warn('[Push] OneSignal SDK not loaded, waiting...');
          let attempts = 0;
          while (!window.OneSignal && attempts < 10) {
            await new Promise(r => setTimeout(r, 500));
            attempts++;
          }
          if (!window.OneSignal) {
            console.warn('[Push] OneSignal SDK still not loaded after 5s');
            return;
          }
        }

        // ✅ FIX: Check if already initialized
        if (window.OneSignal.initialized) {
          console.log('[Push] ✅ OneSignal already initialized, skipping...');
          if (user?.id && isMounted) {
            await identifyUser(user.id);
          }
          return;
        }

        // Initialize OneSignal (only once)
        const inited = await initOneSignal(user?.id);
        if (inited && isMounted) {
          console.log('[Push] ✅ OneSignal initialized successfully');

          // Check notification permission
          const permission = await getNotificationPermission();
          console.log('[Push] Notification permission:', permission);

          if (user?.id) {
            console.log('[Push] User identified:', user.id);
          }
        }
      } catch (error) {
        console.error('[Push] Init error:', error);
      }
    };

    // Delay initialization to ensure SDK is loaded
    const timer = setTimeout(initPush, 1500);
    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [user?.id]);

  // ── Load user profile on mount ─────────────────────────────────────────────
  useEffect(() => {
    if (token) {
      loadProfile();
    } else {
      setLoading(false);
    }

    const handleUserUpdated = () => {
      const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
      if (storedUser && storedUser.id) {
        setUser(storedUser);
        // Re-identify with OneSignal if user changed
        if (storedUser.id) {
          identifyUser(storedUser.id).catch(() => { });
          initOneSignal(storedUser.id);
        }
      }
    };

    window.addEventListener('userUpdated', handleUserUpdated);
    return () => window.removeEventListener('userUpdated', handleUserUpdated);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // ── Show welcome bonus modal ──────────────────────────────────────────────
  useEffect(() => {
    if (!user?.id) return;
    const bonusKey = `prq_bonus_shown_${user.id}`;
    const tourKey = `prq_welcomed_${user.id}`;
    if (!localStorage.getItem(bonusKey)) {
      setShowBonusModal(true);
    } else if (!localStorage.getItem(tourKey)) {
      setShowWelcome(true);
    }
  }, [user?.id]);

  const loadProfile = async () => {
    try {
      const response = await axios.get(`${API_URL}/users/profile`, { timeout: 10000 });
      const userData = response.data.user;
      setUser(userData);
      localStorage.setItem('user', JSON.stringify(userData));
      window.dispatchEvent(new Event('userUpdated'));
      // FIX: Link push subscription on every session restore
      if (userData?.id) {
        initOneSignal(userData.id);

        // Wait a bit for OneSignal to be ready
        setTimeout(() => {
          identifyUser(userData.id).catch(err =>
            console.error('[Push] identifyUser on load failed:', err)
          );
        }, 2000);
      }
    } catch (error) {
      if (error.response?.status === 401) {
        logout();
      } else {
        const cached = JSON.parse(localStorage.getItem('user') || 'null');
        if (cached) setUser(cached);
      }
    } finally {
      setLoading(false);
    }
  };

  // ── Online heartbeat ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!token) return;

    const ping = () => {
      axios.post(`${API_URL}/users/heartbeat`).catch(() => { });
    };

    ping();
    const interval = setInterval(ping, 60000);

    const onVisible = () => { if (document.visibilityState === 'visible') ping(); };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [token]);

  // ── ✅ FIX: Login function with OneSignal identification ──────────────────
  const login = async (userData, token) => {
    setToken(token);
    setUser(userData);
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(userData));
    window.dispatchEvent(new Event('userUpdated'));
    axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;

    toast.success('Logged in successfully!');

    // FIX: Identify user with OneSignal after login
    if (userData?.id) {
      try {
        // Initialize OneSignal first
        initOneSignal(userData.id);

        // Wait a bit for OneSignal to initialize
        await new Promise(r => setTimeout(r, 1000));

        await identifyUser(userData.id);
        console.log('[Push] OneSignal identified after login:', userData.id);

        // Request notification permission if not already granted
        const permission = await getNotificationPermission();
        if (permission !== 'granted') {
          // User can enable later via the NotificationPrompt component
          console.log('[Push] Notification permission not granted yet');
        }
      } catch (error) {
        console.error('[Push] identifyUser after login error:', error);
      }
    }
  };

  // ── ✅ FIX: Logout function with OneSignal unidentification ──────────────
  const logout = () => {
    clearCachedActiveTrades(); // never leave this user's trades behind for the next login
    setUser(null);
    setToken(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    delete axios.defaults.headers.common['Authorization'];
    toast.info('Logged out');
    window.dispatchEvent(new Event('userUpdated'));

    // ── ✅ FIX: Unlink push subscription from this account on logout ────────
    unidentifyUser().catch((err) => {
      console.error('[Push] unidentifyUser error:', err);
    });
  };

  // ── ✅ FIX: Test push notification function (for debugging) ──────────────
  const testPushNotification = async () => {
    if (!user?.id) {
      toast.error('Please login first');
      return;
    }

    try {
      const result = await sendTestNotification(user.id, 'new_trade');
      if (result) {
        toast.success('Test notification sent! Check your device.');
      } else {
        toast.error('Failed to send test notification. Check console for details.');
      }
    } catch (error) {
      toast.error('Error sending test notification');
      console.error('[Push] Test error:', error);
    }
  };

  // Expose test function to window for debugging
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.__testPush = testPushNotification;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  if (loading) return <PageLoader />;

  return (
    <HelmetProvider>
      <RatesProvider>
        <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <CustomToastContainer />
          <Suspense fallback={<PageLoader />}>
            <Routes>
              {/* ── TEAM PORTAL — completely standalone, no main chrome ── */}
              <Route path="/team" element={<TeamDashboard user={user} />} />
              <Route path="/moderator" element={<ModeratorDashboard user={user} />} />
              <Route path="/ceo" element={<CeoDashboard user={user} />} />
              {/* No route-level guard — same as /team, /ceo, /admin, /moderator above.
                  AgentDashboard.js now owns its own login (AgentLogin), completely separate
                  from the customer-facing /login page, so a support rep who isn't logged
                  into the main app at all can still sign in here directly. */}
              <Route path="/agent-dashboard" element={<AgentDashboard user={user} />} />
              {/* Same standalone pattern as above — AccountantDashboard.js owns its own
                  login, completely separate session, read-only by design (its backend
                  routes have no write/RPC path at all, not just a hidden button). */}
              <Route path="/accountant-dashboard" element={<AccountantDashboard user={user} />} />

              {/* ── ALL OTHER ROUTES — wrapped in main app chrome ── */}
              <Route path="*" element={
                <AuthAwareShell user={user} onLogout={logout}
                  showBonusModal={showBonusModal} setShowBonusModal={setShowBonusModal}
                  showWelcome={showWelcome} setShowWelcome={setShowWelcome}>

                  <RouteErrorBoundary user={user}>
                  <Routes>
                    <Route path="/" element={<LandingPage user={user} />} />
                    <Route path="/listing/:id" element={<ListingDetail user={user} />} />
                    <Route path="/gift-cards" element={<GiftCardMarketplace user={user} />} />
                    <Route path="/blog" element={<Blog />} />
                    <Route path="/blog/:slug" element={<BlogPost />} />
                    <Route path="/privacy" element={<PrivacyPolicy />} />
                    <Route path="/terms" element={<TermsOfService />} />
                    <Route path="/marketplace" element={<Navigate to="/gift-cards" />} />
                    <Route path="/register" element={!user ? <Register onLogin={login} /> : <Navigate to="/" />} />
                    <Route path="/signup" element={!user ? <Register onLogin={login} /> : <Navigate to="/" />} />
                    <Route path="/login" element={!user ? <Login onLogin={login} /> : <Navigate to="/" />} />
                    <Route path="/forgot-password" element={<ForgotPassword />} />
                    <Route path="/verify-otp" element={<VerifyOTP onLogin={login} />} />
                    <Route path="/reset-password" element={<ResetPassword />} />
                    <Route path="/auth/confirm" element={<EmailConfirmation />} />
                    <Route path="/verify-email" element={<CheckEmail onLogin={login} />} />
                    <Route path="/sell-gift-card" element={<SellGiftCardMarketplace user={user} />} />
                    <Route path="/buy-bitcoin" element={<BuyBitcoin user={user} />} />
                    <Route path="/sell-bitcoin" element={<SellBitcoin user={user} />} />
                    <Route path="/buy-usdt" element={<BuyUSDT user={user} />} />
                    <Route path="/sell-usdt" element={<SellUSDT user={user} />} />
                    <Route path="/dashboard" element={user ? <Dashboard user={user} /> : <Navigate to="/login" />} />
                    <Route path="/wallet" element={user ? <WalletPage user={user} /> : <Navigate to="/login" />} />
                    <Route path="/settings" element={user ? <Settings user={user} setUser={setUser} /> : <Navigate to="/login" />} />
                    <Route path="/menu" element={user ? <MenuPage user={user} /> : <Navigate to="/login" />} />
                    <Route path="/trader-settings" element={user ? <TraderSettings user={user} /> : <Navigate to="/login" />} />
                    <Route path="/profile/:id" element={<Profile />} />
                    <Route path="/profile" element={user ? <Profile userId={user.id} /> : <Navigate to="/login" />} />
                    <Route path="/create-listing" element={user ? <CreateListing user={user} /> : <Navigate to="/login" />} />
                    <Route path="/create-offer" element={user ? <CreateOffer user={user} /> : <Navigate to="/login" />} />
                    <Route path="/edit-listing/:id" element={user ? <EditListing user={user} /> : <Navigate to="/login" />} />
                    <Route path="/my-listings" element={user ? <MyListings user={user} /> : <Navigate to="/login" />} />
                    <Route path="/my-trades" element={user ? <MyTrades user={user} /> : <Navigate to="/login" />} />
                    <Route path="/trade/:id" element={user ? <TradeDetail user={user} /> : <Navigate to="/login" />} />
                    <Route path="/trade-chat/:id" element={user ? <TradeChat user={user} /> : <Navigate to="/login" />} />
                    <Route path="/feedback/:tradeId/:userId" element={user ? <Feedback user={user} /> : <Navigate to="/login" />} />
                    <Route path="/feedback" element={<Navigate to="/my-trades" replace />} />
                    <Route path="/admin" element={<AdminDashboard user={user} onLogin={login} />} />
                    <Route path="/escrow/:id" element={user ? <EscrowVerification user={user} /> : <Navigate to="/login" />} />
                    <Route path="/ref/:username" element={<RefRedirect />} />
                    {/* ── Placeholder pages for dashboard tiles (Part C) ── */}
                    <Route path="/contact" element={user ? <OpenSupport /> : <Navigate to="/login" />} />
                    <Route path="/fees" element={user ? <Navigate to="/terms" replace /> : <Navigate to="/login" />} />
                    <Route path="/medals" element={user ? <Navigate to="/trader-settings?section=badges" replace /> : <Navigate to="/login" />} />
                    <Route path="/quick-start" element={user ? <Navigate to="/blog" replace /> : <Navigate to="/login" />} />
                    <Route path="/trade-insights" element={user ? <Navigate to="/trader-settings?section=trade-insights" replace /> : <Navigate to="/login" />} />
                    <Route path="/payment-accounts" element={user ? <Navigate to="/settings?tab=payment" replace /> : <Navigate to="/login" />} />
                    <Route path="/devices" element={user ? <Navigate to="/settings?tab=security" replace /> : <Navigate to="/login" />} />
                    <Route path="/activity-log" element={user ? <ActivityLog /> : <Navigate to="/login" />} />
                    <Route path="/security" element={user ? <Navigate to="/settings?tab=security" replace /> : <Navigate to="/login" />} />
                    <Route path="/discord" element={user ? <ExternalRedirect to="https://discord.com/invite/V6zCZxfdy" /> : <Navigate to="/login" />} />
                    <Route path="/status" element={<StatusPage />} />
                    <Route path="/invite" element={user ? <Navigate to="/partner-program" replace /> : <Navigate to="/login" />} />
                    <Route path="/swap" element={user ? <PlaceholderPage title="Swap" description="Swap between cryptocurrencies instantly at competitive rates. Coming soon." icon={ArrowLeftRight} overrideColor="#1B4332" /> : <Navigate to="/login" />} />
                    <Route path="/receive" element={user ? <PlaceholderPage title="Receive" description="Generate a deposit address to receive Bitcoin in your PRAQEN wallet." icon={ArrowRight} overrideColor="#1B4332" /> : <Navigate to="/login" />} />
                    <Route path="/send" element={user ? <PlaceholderPage title="Send" description="Send Bitcoin to any address or trade directly with other users." icon={Send} overrideColor="#1B4332" /> : <Navigate to="/login" />} />
                    <Route path="/transfer" element={user ? <PlaceholderPage title="Transfer" description="Transfer funds between your PRAQEN wallet and external wallets." icon={MoveRight} overrideColor="#1B4332" /> : <Navigate to="/login" />} />
                    <Route path="/partner-program" element={<PartnerProgram user={user} />} />
                    <Route path="/partner-program/calculator" element={<PartnerCalculator />} />
                    <Route path="*" element={<Navigate to="/" />} />
                  </Routes>
                  </RouteErrorBoundary>
                </AuthAwareShell>
              } />
            </Routes>
          </Suspense>
        </Router>
      </RatesProvider>
    </HelmetProvider>
  );
}

export default App;
