import { useState, useEffect, useCallback } from 'react';
import {
  Wifi,
  Mail,
  ArrowRight,
  Copy,
  Check,
  ExternalLink,
  QrCode,
  LogOut,
  AlertCircle,
  Loader2,
  ArrowLeft,
  X,
} from 'lucide-react';
import QRCode from 'qrcode';
import type { Order } from '../types.ts';

interface CustomerDashboardProps {
  onBackToShop: () => void;
  isCaptive: boolean;
}

interface PurchasedItem {
  order: Order;
  voucher_code: string | null;
  router_login_url: string;
}

export function CustomerDashboard({ onBackToShop, isCaptive }: CustomerDashboardProps) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('lavami_customer_token'));
  const [customerEmail, setCustomerEmail] = useState<string | null>(null);
  const [orders, setOrders] = useState<PurchasedItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sign in state
  const [step, setStep] = useState<'email' | 'otp'>('email');
  const [inputEmail, setInputEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [simulatedCode, setSimulatedCode] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Active QR modal
  const [activeQr, setActiveQr] = useState<{ url: string; code: string } | null>(null);

  // Load orders
  const loadOrders = useCallback(async (authToken: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/customer/orders', {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Session expired. Please sign in again.');
      }
      setCustomerEmail(data.email);
      setOrders(data.orders || []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load your orders';
      setError(msg);
      // If unauthorized, clear token
      localStorage.removeItem('lavami_customer_token');
      setToken(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (token) {
      loadOrders(token);
    }
  }, [token, loadOrders]);

  // Request OTP
  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch('/api/auth/otp/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inputEmail.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to send OTP code.');
      }

      setStep('otp');
      if (data.simulated_code) {
        setSimulatedCode(data.simulated_code);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error sending verification code';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  // Verify OTP
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch('/api/auth/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inputEmail.trim(), code: otpCode.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Invalid verification code.');
      }

      localStorage.setItem('lavami_customer_token', data.token);
      setToken(data.token);
      await loadOrders(data.token);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Verification failed';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  // Sign out
  const handleSignOut = () => {
    localStorage.removeItem('lavami_customer_token');
    setToken(null);
    setCustomerEmail(null);
    setOrders([]);
    setStep('email');
  };

  // Copy voucher
  const handleCopy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 2500);
    } catch {
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 2500);
    }
  };

  // Show QR modal
  const handleShowQr = async (code: string, routerLoginUrl: string) => {
    try {
      const connectUrl = `${routerLoginUrl}?code=${encodeURIComponent(code)}`;
      const qrUrl = await QRCode.toDataURL(connectUrl, {
        width: 300,
        margin: 2,
        color: { dark: '#6B2D17', light: '#FFFFFF' },
      });
      setActiveQr({ url: qrUrl, code });
    } catch (err) {
      console.error(err);
    }
  };

  // If not signed in: Render OTP Auth form
  if (!token) {
    return (
      <div className="max-w-md mx-auto py-8 px-4 space-y-6">
        <button
          onClick={onBackToShop}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-[#6B2D17] hover:underline"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Plans</span>
        </button>

        <div className="bg-white rounded-3xl shadow-xl border border-neutral-200 p-6 space-y-6">
          <div className="text-center space-y-1.5">
            <div className="w-12 h-12 rounded-full bg-[#F2A902]/20 text-[#6B2D17] flex items-center justify-center mx-auto mb-2">
              <Mail className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-extrabold text-[#2C1810]">Access Your Vouchers</h2>
            <p className="text-xs text-neutral-500">
              Enter your email to receive a secure one-time passcode. No password needed.
            </p>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {step === 'email' ? (
            <form onSubmit={handleRequestOtp} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-[#6B2D17] uppercase tracking-wider block mb-1.5">
                  Email Address
                </label>
                <input
                  id="customer-otp-email"
                  type="email"
                  value={inputEmail}
                  onChange={(e) => setInputEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full bg-white border border-neutral-300 rounded-xl py-3 px-4 text-sm font-medium text-neutral-900 focus:outline-none focus:border-[#6B2D17] focus:ring-1 focus:ring-[#6B2D17]"
                  required
                />
              </div>

              <button
                id="request-otp-btn"
                type="submit"
                disabled={loading}
                className="w-full py-3.5 px-4 rounded-xl font-bold text-sm bg-[#F2A902] hover:bg-[#F2A902]/90 text-[#2C1810] shadow-sm flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <span>Send Verification Code</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-[#6B2D17] uppercase tracking-wider">
                    Enter 6-Digit Code
                  </label>
                  <button
                    type="button"
                    onClick={() => setStep('email')}
                    className="text-xs text-[#6B2D17] font-semibold hover:underline"
                  >
                    Change email
                  </button>
                </div>
                <input
                  id="customer-otp-code"
                  type="text"
                  maxLength={6}
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value)}
                  placeholder="e.g. 123456"
                  className="w-full bg-white border border-neutral-300 rounded-xl py-3 px-4 text-center font-mono text-xl tracking-widest font-extrabold text-neutral-900 focus:outline-none focus:border-[#6B2D17] focus:ring-1 focus:ring-[#6B2D17]"
                  required
                />
              </div>

              {simulatedCode && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 space-y-1">
                  <div className="font-bold flex items-center justify-between">
                    <span>Sandbox Test Code:</span>
                    <button
                      type="button"
                      onClick={() => setOtpCode(simulatedCode)}
                      className="text-[11px] underline text-[#6B2D17] font-bold"
                    >
                      Fill Code
                    </button>
                  </div>
                  <span className="font-mono text-base font-black text-[#6B2D17] block">
                    {simulatedCode}
                  </span>
                </div>
              )}

              <button
                id="verify-otp-btn"
                type="submit"
                disabled={loading}
                className="w-full py-3.5 px-4 rounded-xl font-bold text-sm bg-[#6B2D17] hover:bg-[#4A1D0D] text-white shadow-sm flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <span>Sign In to Dashboard</span>}
              </button>
            </form>
          )}

          {/* Captive-Browser notice regarding Google Sign-in */}
          {isCaptive ? (
            <div className="p-3 bg-neutral-100 rounded-xl text-[11px] text-neutral-600 leading-snug">
              <strong>Captive Browser:</strong> Google authentication is disabled inside captive portals to protect your account. Use email verification code above or open in Chrome/Safari.
            </div>
          ) : (
            <div className="pt-3 border-t border-neutral-200 text-center">
              <p className="text-[11px] text-neutral-500">
                Secure customer portal • Vouchers stored safely per privacy guidelines
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // If signed in: Render Customer Dashboard
  return (
    <div className="max-w-2xl mx-auto py-6 px-4 space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white p-4 sm:p-5 rounded-2xl shadow-sm border border-neutral-200">
        <div>
          <button
            onClick={onBackToShop}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-[#6B2D17] hover:underline mb-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>WiFi Shop</span>
          </button>
          <h1 className="text-lg font-black text-[#2C1810]">My WiFi Vouchers</h1>
          <p className="text-xs text-neutral-500">Signed in as {customerEmail}</p>
        </div>

        <button
          onClick={handleSignOut}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-neutral-600 hover:text-red-700 bg-neutral-100 hover:bg-neutral-200 px-3 py-1.5 rounded-lg transition-colors"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Sign Out</span>
        </button>
      </div>

      {/* Vouchers List */}
      {loading ? (
        <div className="py-12 text-center">
          <Loader2 className="w-8 h-8 text-[#6B2D17] animate-spin mx-auto" />
          <p className="text-xs text-neutral-500 mt-2">Loading your vouchers...</p>
        </div>
      ) : orders.length === 0 ? (
        <div className="bg-white rounded-3xl p-8 text-center border border-neutral-200 space-y-3">
          <Wifi className="w-10 h-10 text-neutral-400 mx-auto" />
          <h3 className="text-base font-bold text-neutral-800">No WiFi Vouchers Found</h3>
          <p className="text-xs text-neutral-500 max-w-sm mx-auto">
            You haven&apos;t purchased any vouchers with this email yet. Choose a plan from our shop to get connected!
          </p>
          <button
            onClick={onBackToShop}
            className="inline-flex items-center gap-2 bg-[#F2A902] text-[#2C1810] px-5 py-2.5 rounded-xl font-bold text-xs shadow-sm hover:bg-[#F2A902]/90"
          >
            <span>View Available Plans</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map(({ order, voucher_code, router_login_url }) => {
            const isPaid = order.status === 'paid';
            const connectUrl = voucher_code
              ? `${router_login_url}?code=${encodeURIComponent(voucher_code)}`
              : null;

            return (
              <div
                key={order.id}
                className="bg-white rounded-2xl p-5 border border-neutral-200 shadow-sm space-y-3"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-extrabold text-base text-[#2C1810]">
                      {order.plan_name}
                    </h3>
                    <div className="flex items-center gap-2 text-xs text-neutral-500 mt-0.5">
                      <span>GHS {order.amount_pesewas / 100}.00</span>
                      <span>•</span>
                      <span>{new Date(order.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>

                  <span
                    className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${
                      isPaid
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-amber-50 text-amber-800 border-amber-200'
                    }`}
                  >
                    {isPaid ? 'Active' : order.status}
                  </span>
                </div>

                {isPaid && voucher_code ? (
                  <div className="bg-[#FFF8F0] border border-[#F2A902]/50 rounded-xl p-3.5 flex flex-col sm:flex-row items-center justify-between gap-3">
                    <div>
                      <div className="text-[10px] font-bold text-[#6B2D17] uppercase tracking-wider">
                        Voucher Code
                      </div>
                      <div className="font-mono text-xl font-black text-[#6B2D17] tracking-wider select-all">
                        {voucher_code}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 w-full sm:w-auto">
                      <button
                        onClick={() => handleCopy(voucher_code)}
                        className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 bg-[#6B2D17] hover:bg-[#4A1D0D] text-white px-3 py-2 rounded-lg text-xs font-bold transition-colors"
                      >
                        {copiedCode === voucher_code ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-[#F2A902]" />
                            <span>Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>Copy</span>
                          </>
                        )}
                      </button>

                      <button
                        onClick={() => handleShowQr(voucher_code, router_login_url)}
                        className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 bg-white border border-neutral-300 hover:bg-neutral-50 text-neutral-700 px-3 py-2 rounded-lg text-xs font-bold transition-colors"
                      >
                        <QrCode className="w-3.5 h-3.5" />
                        <span>QR</span>
                      </button>

                      {connectUrl && (
                        <a
                          href={connectUrl}
                          className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1 bg-[#F2A902] hover:bg-[#F2A902]/90 text-[#2C1810] px-3.5 py-2 rounded-lg text-xs font-extrabold transition-colors shadow-xs"
                        >
                          <Wifi className="w-3.5 h-3.5" />
                          <span>Connect</span>
                          <ExternalLink className="w-3 h-3 opacity-60" />
                        </a>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-neutral-500">
                    Payment status: {order.status}. No active voucher code assigned.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* QR Modal */}
      {activeQr && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
        >
          <div className="bg-white rounded-3xl p-6 max-w-xs w-full text-center space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <span className="font-mono font-black text-sm text-[#6B2D17]">
                {activeQr.code}
              </span>
              <button
                onClick={() => setActiveQr(null)}
                className="w-7 h-7 rounded-full bg-neutral-100 flex items-center justify-center text-neutral-600 hover:bg-neutral-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <img
              src={activeQr.url}
              alt="QR Code"
              className="w-56 h-56 mx-auto border border-neutral-200 rounded-xl p-2"
            />

            <p className="text-[11px] text-neutral-500">
              Scan with phone camera or barcode scanner to auto-connect to Lavami WiFi.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
