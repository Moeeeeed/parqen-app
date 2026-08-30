import React, { useState, useEffect, lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useParams, useNavigate, useLocation } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { RatesProvider } from './contexts/RatesContext';
import axios from 'axios';
import {
  identifyUser,
  unidentifyUser,
  initOneSignal,
  requestNotificationPermission,
  getNotificationPermission,
  sendTestNotification
} from './utils/notifications';
import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import CustomToastContainer from './components/CustomToastContainer';
import Navbar from './components/Navbar';
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
function RouteErrorBoundary({ children }) {
  const location = useLocation();
  return <ErrorBoundary key={location.pathname}>{children}</ErrorBoundary>;
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

// ── Ref Redirect ─────────────────────────────────────────────────────────────
function RefRedirect() {
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
function AppShell({ children }) {
  return (
    <div className="min-h-screen pb-nav-mobile"
      style={{ overflowX: 'hidden', maxWidth: '100vw', paddingTop: 'var(--navbar-h)' }}>
      {children}
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
        <Router>
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
                <AppShell>
                  <Navbar user={user} onLogout={logout} />

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

                  <RouteErrorBoundary>
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
                    <Route path="/admin" element={<AdminDashboard user={user} onLogin={login} />} />
                    <Route path="/escrow/:id" element={user ? <EscrowVerification user={user} /> : <Navigate to="/login" />} />
                    <Route path="/ref/:username" element={<RefRedirect />} />
                    <Route path="*" element={<Navigate to="/" />} />
                  </Routes>
                  </RouteErrorBoundary>

                  <BottomNav user={user} />
                  <SuggestionsPanel user={user} />
                </AppShell>
              } />
            </Routes>
          </Suspense>
        </Router>
      </RatesProvider>
    </HelmetProvider>
  );
}

export default App;
