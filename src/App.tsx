import { useState, useEffect, useCallback } from 'react';
import { Wifi, PhoneCall, ShieldCheck, User, Lock, Loader2, ArrowRight } from 'lucide-react';
import { LavamiLogo } from './components/LavamiLogo.tsx';
import { CaptiveBanner } from './components/CaptiveBanner.tsx';
import { TailoringAd } from './components/TailoringAd.tsx';
import { PlanCard } from './components/PlanCard.tsx';
import { CheckoutModal } from './components/CheckoutModal.tsx';
import { ReceiptView } from './components/ReceiptView.tsx';
import { CustomerDashboard } from './components/CustomerDashboard.tsx';
import { AdminLogin } from './components/AdminLogin.tsx';
import { AdminDashboard } from './components/AdminDashboard.tsx';
import { SandboxModal } from './components/SandboxModal.tsx';
import type { Plan, PublicSettings, RouterContext } from './types.ts';

type AppView = 'shop' | 'receipt' | 'dashboard' | 'admin_login' | 'admin_dashboard';

export default function App() {
  const [view, setView] = useState<AppView>('shop');
  const [plans, setPlans] = useState<Plan[]>([]);
  const [publicSettings, setPublicSettings] = useState<PublicSettings | null>(null);
  const [isCaptive, setIsCaptive] = useState(false);
  const [routerContext, setRouterContext] = useState<RouterContext>({
    loginUrl: null,
    destination: null,
    isValidHost: true,
    mac: null,
    ip: null,
  });

  // Active checkout & receipt states
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [activeReceiptToken, setActiveReceiptToken] = useState<string | null>(null);

  // Sandbox modal state
  const [sandboxOrder, setSandboxOrder] = useState<{
    reference: string;
    receiptToken: string;
    amountGhs: number;
  } | null>(null);

  // Admin authentication state
  const [adminToken, setAdminToken] = useState<string | null>(() =>
    localStorage.getItem('lavami_admin_token')
  );

  // 1. Detect captive portal user-agents per Section 4
  useEffect(() => {
    const ua = navigator.userAgent || '';
    const isCaptiveUA =
      /CaptiveNetworkSupport/i.test(ua) ||
      /MicroMessenger/i.test(ua) ||
      /FB_IAB/i.test(ua) ||
      /Instagram/i.test(ua) ||
      /CNA/i.test(ua) ||
      (ua.includes('AppleWebKit') &&
        !ua.includes('Safari') &&
        (ua.includes('iPhone') || ua.includes('iPad')));
    setIsCaptive(isCaptiveUA);

    // 2. Parse router query params: ?login= or ?link-login-only=, ?dst=
    const params = new URLSearchParams(window.location.search);
    const loginParam = params.get('login') || params.get('link-login-only');
    const dstParam = params.get('dst');
    const macParam = params.get('mac');
    const ipParam = params.get('ip');

    let isValidHost = true;
    if (loginParam) {
      try {
        const parsed = new URL(loginParam);
        // Valid if matches router or localhost
        isValidHost = parsed.hostname.includes('192.168.') || parsed.hostname.includes('10.') || parsed.hostname.includes('localhost');
      } catch {
        isValidHost = false;
      }
    }

    setRouterContext({
      loginUrl: loginParam,
      destination: dstParam,
      isValidHost,
      mac: macParam,
      ip: ipParam,
    });

    // Check path for deep linking
    const path = window.location.pathname;
    if (path.startsWith('/receipt/')) {
      const token = path.replace('/receipt/', '').trim();
      if (token) {
        setActiveReceiptToken(token);
        setView('receipt');
      }
    } else if (path === '/admin') {
      if (localStorage.getItem('lavami_admin_token')) {
        setView('admin_dashboard');
      } else {
        setView('admin_login');
      }
    } else if (path === '/dashboard') {
      setView('dashboard');
    }

    // Secret shortcut for administrator: Ctrl+Shift+A or Cmd+Shift+A
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'A' || e.key === 'a')) {
        e.preventDefault();
        const hasToken = localStorage.getItem('lavami_admin_token');
        setView(hasToken ? 'admin_dashboard' : 'admin_login');
        window.history.pushState({}, '', '/admin');
      }
    };

    // Listen to browser URL changes (e.g. typing /admin)
    const handlePopState = () => {
      const currentPath = window.location.pathname;
      if (currentPath === '/admin') {
        const hasToken = localStorage.getItem('lavami_admin_token');
        setView(hasToken ? 'admin_dashboard' : 'admin_login');
      } else if (currentPath === '/dashboard') {
        setView('dashboard');
      } else if (currentPath.startsWith('/receipt/')) {
        const token = currentPath.replace('/receipt/', '').trim();
        setActiveReceiptToken(token);
        setView('receipt');
      } else {
        setView('shop');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  // Fetch Public Plans & Settings
  const fetchData = useCallback(async () => {
    try {
      const [plansRes, settingsRes] = await Promise.all([
        fetch('/api/plans'),
        fetch('/api/settings/public'),
      ]);
      const plansData = await plansRes.json();
      const settingsData = await settingsRes.json();

      if (plansData.success && plansData.plans) {
        setPlans(plansData.plans);
      }
      if (settingsData.success && settingsData.settings) {
        setPublicSettings(settingsData.settings);
      }
    } catch (err) {
      console.error('Error fetching plans & settings:', err);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Handle Order Created
  const handleOrderCreated = (
    receiptToken: string,
    authorizationUrl: string,
    isSimulated = true,
    reference?: string
  ) => {
    setSelectedPlan(null);

    // If sandbox / test mode is active
    if (isSimulated && reference) {
      const planPrice = selectedPlan ? selectedPlan.price : 8;
      setSandboxOrder({
        reference,
        receiptToken,
        amountGhs: planPrice,
      });
      return;
    }

    // In live mode, redirect to Paystack authorization URL
    if (authorizationUrl && authorizationUrl.startsWith('http')) {
      window.location.href = authorizationUrl;
    } else {
      // Fallback directly to receipt
      setActiveReceiptToken(receiptToken);
      setView('receipt');
      window.history.pushState({}, '', `/receipt/${receiptToken}`);
    }
  };

  // Switch to Receipt
  const openReceipt = (token: string) => {
    setActiveReceiptToken(token);
    setView('receipt');
    window.history.pushState({}, '', `/receipt/${token}`);
  };

  // Navigation handlers
  const navigateTo = (newView: AppView) => {
    setView(newView);
    if (newView === 'shop') window.history.pushState({}, '', '/');
    if (newView === 'dashboard') window.history.pushState({}, '', '/dashboard');
    if (newView === 'admin_login') window.history.pushState({}, '', '/admin');
    if (newView === 'admin_dashboard') window.history.pushState({}, '', '/admin');
  };

  return (
    <div className="min-h-screen bg-[#FFF8F0] text-[#2C1810] flex flex-col selection:bg-[#F2A902]/30">
      {/* Captive Browser Banner (Visible only in captive windows) */}
      <CaptiveBanner routerContext={routerContext} />

      {/* Main Public Application Header */}
      {view !== 'admin_dashboard' && (
        <header className="bg-white border-b border-[#6B2D17]/10 sticky top-0 z-30 shadow-xs">
          <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
            <div
              onClick={() => navigateTo('shop')}
              className="cursor-pointer transition-transform active:scale-[0.99]"
            >
              <LavamiLogo variant="full" size="md" />
            </div>

            {/* Top Navigation Links */}
            <div className="flex items-center gap-2 sm:gap-3">
              <a
                href={`tel:${publicSettings?.shop_phone || '+233592495005'}`}
                className="hidden md:flex items-center gap-1.5 text-xs font-bold text-neutral-600 hover:text-[#6B2D17] px-3 py-1.5 rounded-lg border border-neutral-200 transition-colors"
              >
                <PhoneCall className="w-3.5 h-3.5 text-[#6B2D17]" />
                <span>{publicSettings?.shop_phone || '+233 592 495 005'}</span>
              </a>

              <button
                id="header-my-vouchers-btn"
                onClick={() => navigateTo('dashboard')}
                className={`inline-flex items-center gap-1.5 text-xs font-bold px-3.5 py-2 rounded-xl transition-all ${
                  view === 'dashboard'
                    ? 'bg-[#6B2D17] text-white shadow-xs'
                    : 'bg-neutral-100 hover:bg-neutral-200 text-neutral-800'
                }`}
              >
                <User className="w-3.5 h-3.5" />
                <span>My Vouchers</span>
              </button>
            </div>
          </div>
        </header>
      )}

      {/* Main Body Switcher */}
      <div className="flex-1">
        {/* VIEW 1: Public WiFi Shop */}
        {view === 'shop' && (
          <main className="max-w-6xl mx-auto px-4 py-6 sm:py-10 space-y-10">
            {/* Hero / Value Proposition */}
            <div className="text-center max-w-2xl mx-auto space-y-3">
              <div className="inline-flex items-center gap-2 bg-[#F2A902]/20 border border-[#F2A902]/50 text-[#6B2D17] px-3.5 py-1 rounded-full text-xs font-extrabold tracking-wide">
                <Wifi className="w-3.5 h-3.5 text-[#6B2D17]" />
                <span>High-Speed MikroTik Hotspot • Instant Connection</span>
              </div>

              <h1 className="text-2xl sm:text-4xl font-black text-[#2C1810] tracking-tight">
                Connect to Lavami Fashion WiFi in Seconds
              </h1>

              <p className="text-xs sm:text-sm text-neutral-600 leading-relaxed">
                Choose a flexible pass below. Pay seamlessly with Mobile Money (MTN, Telecel, AT) or Bank Card and get your voucher code instantly on your screen.
              </p>
            </div>

            {/* WiFi Plan Cards Grid (Daily GHS 8, Weekly GHS 50, Monthly GHS 150) */}
            <section aria-label="WiFi Plans" className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base sm:text-lg font-black text-[#2C1810]">
                  Available Internet Passes
                </h2>
                <span className="text-xs text-neutral-500 font-medium">
                  Authoritative MikroTik router inventory
                </span>
              </div>

              {plans.length === 0 ? (
                <div className="py-16 text-center">
                  <Loader2 className="w-8 h-8 text-[#6B2D17] animate-spin mx-auto" />
                  <p className="text-xs text-neutral-500 mt-2">Loading available WiFi plans...</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {plans.map((plan) => (
                    <PlanCard
                      key={plan.id}
                      plan={plan}
                      isSelected={selectedPlan?.id === plan.id}
                      onSelect={(p) => setSelectedPlan(p)}
                      shopPhone={publicSettings?.shop_phone}
                    />
                  ))}
                </div>
              )}
            </section>

            {/* How It Works Guide */}
            <section className="bg-white rounded-3xl p-6 sm:p-8 border border-neutral-200/80 shadow-xs space-y-6">
              <div className="text-center max-w-md mx-auto space-y-1">
                <h3 className="text-base font-extrabold text-[#2C1810]">
                  How to Get Connected
                </h3>
                <p className="text-xs text-neutral-500">
                  Quick 3-step checkout designed for mobile devices.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="flex items-start gap-3.5 p-3">
                  <div className="w-8 h-8 rounded-full bg-[#F2A902] text-[#2C1810] flex items-center justify-center font-black text-sm flex-shrink-0">
                    1
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-[#2C1810]">Select Your Pass</h4>
                    <p className="text-xs text-neutral-500 mt-1">
                      Choose Daily (GHS 8), Weekly (GHS 50), or Monthly (GHS 150) based on your stay.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3.5 p-3">
                  <div className="w-8 h-8 rounded-full bg-[#6B2D17] text-white flex items-center justify-center font-black text-sm flex-shrink-0">
                    2
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-[#2C1810]">Pay via Mobile Money</h4>
                    <p className="text-xs text-neutral-500 mt-1">
                      Enter your phone number. Your code is held securely for 15 minutes while paying.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3.5 p-3">
                  <div className="w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center font-black text-sm flex-shrink-0">
                    3
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-[#2C1810]">Connect Instantly</h4>
                    <p className="text-xs text-neutral-500 mt-1">
                      Tap &quot;Connect Now&quot; to log into the router, scan the QR code, or save to your photo gallery.
                    </p>
                  </div>
                </div>
              </div>
            </section>

            {/* Lavami Fashion Cross-Promotion Banner */}
            <TailoringAd
              advertisementText={publicSettings?.tailoring_advertisement}
              phone={publicSettings?.shop_phone}
            />
          </main>
        )}

        {/* VIEW 2: Secure Voucher Receipt */}
        {view === 'receipt' && activeReceiptToken && (
          <ReceiptView
            receiptToken={activeReceiptToken}
            onBackToShop={() => navigateTo('shop')}
          />
        )}

        {/* VIEW 3: Customer Dashboard */}
        {view === 'dashboard' && (
          <CustomerDashboard
            onBackToShop={() => navigateTo('shop')}
            isCaptive={isCaptive}
          />
        )}

        {/* VIEW 4: Admin Login */}
        {view === 'admin_login' && (
          <AdminLogin
            onSuccess={(token) => {
              setAdminToken(token);
              setView('admin_dashboard');
            }}
            onBackToShop={() => navigateTo('shop')}
          />
        )}

        {/* VIEW 5: Admin Dashboard */}
        {view === 'admin_dashboard' && adminToken && (
          <AdminDashboard
            token={adminToken}
            onLogout={() => {
              localStorage.removeItem('lavami_admin_token');
              setAdminToken(null);
              setView('admin_login');
            }}
            onBackToShop={() => navigateTo('shop')}
          />
        )}
      </div>

      {/* Checkout Modal */}
      {selectedPlan && publicSettings && (
        <CheckoutModal
          plan={selectedPlan}
          publicSettings={publicSettings}
          routerContext={routerContext}
          onClose={() => setSelectedPlan(null)}
          onOrderCreated={handleOrderCreated}
          onSwitchToSignIn={() => navigateTo('dashboard')}
        />
      )}

      {/* Paystack Test / Sandbox Modal */}
      {sandboxOrder && (
        <SandboxModal
          reference={sandboxOrder.reference}
          receiptToken={sandboxOrder.receiptToken}
          amountGhs={sandboxOrder.amountGhs}
          onSuccess={() => {
            const token = sandboxOrder.receiptToken;
            setSandboxOrder(null);
            openReceipt(token);
          }}
          onCancel={() => setSandboxOrder(null)}
        />
      )}

      {/* Public Footer */}
      {view !== 'admin_dashboard' && (
        <footer className="bg-[#2C1810] text-[#FFF8F0] py-10 px-4 mt-12 border-t border-[#F2A902]/20">
          <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6">
            <div className="text-center sm:text-left space-y-1">
              <div className="flex items-center justify-center sm:justify-start gap-2">
                <div className="w-6 h-6 rounded-full bg-[#F2A902] text-[#2C1810] flex items-center justify-center font-extrabold text-xs">
                  L
                </div>
                <span className="font-extrabold tracking-wider text-sm">
                  LAVAMI FASHION WIFI
                </span>
              </div>
              <p className="text-xs text-[#FFF8F0]/70">
                A digital connectivity service by Lavami Fashion • Kumasi IPT, Ghana
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-[#FFF8F0]/70">
              <button onClick={() => navigateTo('shop')} className="hover:text-white">
                WiFi Passes
              </button>
              <span>•</span>
              <button onClick={() => navigateTo('dashboard')} className="hover:text-white">
                My Vouchers
              </button>
              <span>•</span>
              <a
                href={`tel:${publicSettings?.shop_phone || '+233592495005'}`}
                className="hover:text-white"
              >
                Hotline: {publicSettings?.shop_phone || '+233 592 495 005'}
              </a>
            </div>
          </div>
        </footer>
      )}
    </div>
  );
}
