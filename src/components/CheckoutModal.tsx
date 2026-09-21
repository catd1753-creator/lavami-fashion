import { useState } from 'react';
import { X, ShieldCheck, CreditCard, Smartphone, Check, AlertCircle, Loader2 } from 'lucide-react';
import type { Plan, PublicSettings, RouterContext } from '../types.ts';

interface CheckoutModalProps {
  plan: Plan;
  onClose: () => void;
  publicSettings: PublicSettings;
  routerContext: RouterContext;
  onOrderCreated: (receiptToken: string, paystackUrl: string, isSimulated?: boolean, ref?: string) => void;
  onSwitchToSignIn: () => void;
}

export function CheckoutModal({
  plan,
  onClose,
  publicSettings,
  routerContext,
  onOrderCreated,
  onSwitchToSignIn,
}: CheckoutModalProps) {
  const [method, setMethod] = useState<'instant' | 'signin'>('instant');
  const [contactType, setContactType] = useState<'phone' | 'email'>('phone');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [paymentChannel, setPaymentChannel] = useState<'momo' | 'card'>('momo');
  const [momoProvider, setMomoProvider] = useState<'mtn' | 'telecel' | 'at'>('mtn');
  const [momoNumber, setMomoNumber] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const contactVal = contactType === 'phone' ? (phone || momoNumber) : email;
    if (!contactVal.trim()) {
      setErrorMessage(
        contactType === 'phone'
          ? 'Please enter your Ghana mobile number.'
          : 'Please enter your email address to receive your voucher.'
      );
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await fetch('/api/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan_slug: plan.slug,
          email: contactType === 'email' ? email.trim() : null,
          phone: contactType === 'phone' ? (phone || momoNumber).trim() : null,
          login_url: routerContext.loginUrl,
          dst: routerContext.destination,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Unable to create order. Please try again.');
      }

      // Order created and voucher reserved atomically!
      onOrderCreated(data.receipt_token, data.authorization_url, data.is_simulated, data.reference);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="checkout-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in"
    >
      <div className="bg-[#FFF8F0] w-full max-w-lg rounded-3xl shadow-2xl border border-[#6B2D17]/20 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="bg-[#6B2D17] text-white p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#F2A902] text-[#2C1810] flex items-center justify-center font-extrabold text-sm shadow-sm">
              GHS
            </div>
            <div>
              <h2 id="checkout-modal-title" className="text-lg font-extrabold text-white leading-tight">
                WiFi Voucher Checkout
              </h2>
              <p className="text-xs text-[#FFF8F0]/80">
                {plan.name} • GHS {plan.price} ({plan.data_allowance})
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-5">
          {/* Method Selection Tabs */}
          <div className="grid grid-cols-2 gap-2 bg-neutral-200/60 p-1 rounded-xl text-xs font-bold">
            <button
              type="button"
              onClick={() => setMethod('instant')}
              className={`py-2 px-3 rounded-lg transition-all ${
                method === 'instant'
                  ? 'bg-white text-[#6B2D17] shadow-xs'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              Pay Instantly (Guest)
            </button>
            <button
              type="button"
              onClick={() => {
                onSwitchToSignIn();
                onClose();
              }}
              className="py-2 px-3 rounded-lg transition-all text-neutral-600 hover:text-neutral-900 flex items-center justify-center gap-1"
            >
              Sign In (Save Codes)
            </button>
          </div>

          {errorMessage && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          <form onSubmit={handleSubmitOrder} className="space-y-4">
            {/* Contact Information */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-[#6B2D17] uppercase tracking-wider">
                  Receive Voucher Via
                </label>
                <div className="flex items-center gap-3 text-xs">
                  <button
                    type="button"
                    onClick={() => setContactType('phone')}
                    className={`font-semibold ${
                      contactType === 'phone' ? 'text-[#6B2D17] underline' : 'text-neutral-500'
                    }`}
                  >
                    Phone / MoMo
                  </button>
                  <span className="text-neutral-300">|</span>
                  <button
                    type="button"
                    onClick={() => setContactType('email')}
                    className={`font-semibold ${
                      contactType === 'email' ? 'text-[#6B2D17] underline' : 'text-neutral-500'
                    }`}
                  >
                    Email
                  </button>
                </div>
              </div>

              {contactType === 'phone' ? (
                <div>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-neutral-500">
                      +233
                    </span>
                    <input
                      id="customer-phone-input"
                      type="tel"
                      value={phone}
                      onChange={(e) => {
                        setPhone(e.target.value);
                        setMomoNumber(e.target.value);
                      }}
                      placeholder="e.g. 059 249 5005"
                      className="w-full bg-white border border-neutral-300 rounded-xl py-3 pl-14 pr-4 text-sm font-medium text-neutral-900 focus:outline-none focus:border-[#6B2D17] focus:ring-1 focus:ring-[#6B2D17]"
                      required
                    />
                  </div>
                  <p className="text-[11px] text-neutral-500 mt-1">
                    Your code will be displayed instantly on the secure receipt screen and sent via SMS.
                  </p>
                </div>
              ) : (
                <div>
                  <input
                    id="customer-email-input"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="your.email@domain.com"
                    className="w-full bg-white border border-neutral-300 rounded-xl py-3 px-4 text-sm font-medium text-neutral-900 focus:outline-none focus:border-[#6B2D17] focus:ring-1 focus:ring-[#6B2D17]"
                    required
                  />
                  <p className="text-[11px] text-neutral-500 mt-1">
                    A copy of your voucher code and receipt link will be sent to this email.
                  </p>
                </div>
              )}
            </div>

            {/* Payment Method Selector */}
            <div className="space-y-2 pt-1">
              <label className="text-xs font-bold text-[#6B2D17] uppercase tracking-wider block">
                Payment Channel
              </label>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPaymentChannel('momo')}
                  className={`flex items-center gap-2.5 p-3 rounded-xl border-2 transition-all text-left ${
                    paymentChannel === 'momo'
                      ? 'border-[#6B2D17] bg-white shadow-xs'
                      : 'border-neutral-200 bg-white/60 hover:border-neutral-300 text-neutral-600'
                  }`}
                >
                  <Smartphone className="w-4 h-4 text-[#F2A902] flex-shrink-0" />
                  <div>
                    <div className="text-xs font-bold text-neutral-900">Mobile Money</div>
                    <div className="text-[10px] text-neutral-500">MTN, Telecel, AT</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentChannel('card')}
                  className={`flex items-center gap-2.5 p-3 rounded-xl border-2 transition-all text-left ${
                    paymentChannel === 'card'
                      ? 'border-[#6B2D17] bg-white shadow-xs'
                      : 'border-neutral-200 bg-white/60 hover:border-neutral-300 text-neutral-600'
                  }`}
                >
                  <CreditCard className="w-4 h-4 text-[#6B2D17] flex-shrink-0" />
                  <div>
                    <div className="text-xs font-bold text-neutral-900">Bank Card</div>
                    <div className="text-[10px] text-neutral-500">Visa, Mastercard</div>
                  </div>
                </button>
              </div>

              {paymentChannel === 'momo' && (
                <div className="p-3 bg-white border border-neutral-200 rounded-xl space-y-2 mt-2">
                  <div className="text-[11px] font-semibold text-neutral-600">Select MoMo Network:</div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setMomoProvider('mtn')}
                      className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold border transition-colors ${
                        momoProvider === 'mtn'
                          ? 'bg-[#FFCC00]/20 border-[#FFCC00] text-neutral-900'
                          : 'border-neutral-200 text-neutral-600 hover:bg-neutral-50'
                      }`}
                    >
                      MTN MoMo
                    </button>
                    <button
                      type="button"
                      onClick={() => setMomoProvider('telecel')}
                      className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold border transition-colors ${
                        momoProvider === 'telecel'
                          ? 'bg-red-100 border-red-400 text-red-900'
                          : 'border-neutral-200 text-neutral-600 hover:bg-neutral-50'
                      }`}
                    >
                      Telecel Cash
                    </button>
                    <button
                      type="button"
                      onClick={() => setMomoProvider('at')}
                      className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold border transition-colors ${
                        momoProvider === 'at'
                          ? 'bg-blue-100 border-blue-400 text-blue-900'
                          : 'border-neutral-200 text-neutral-600 hover:bg-neutral-50'
                      }`}
                    >
                      AT Money
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Instant Delivery Assurance */}
            <div className="bg-white/80 p-3 rounded-xl border border-neutral-200/80 flex items-center justify-between text-xs text-neutral-600">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span>Instant Voucher Code Delivery</span>
              </div>
              <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                Ready
              </span>
            </div>

            {/* Price breakdown & Submit */}
            <div className="pt-2 border-t border-neutral-200 space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-neutral-600">Total Payable:</span>
                <span className="text-xl font-extrabold text-[#6B2D17]">
                  GHS {plan.price}.00
                </span>
              </div>

              <button
                id="submit-order-btn"
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3.5 px-4 rounded-xl font-extrabold text-sm sm:text-base bg-[#F2A902] hover:bg-[#F2A902]/90 text-[#2C1810] shadow-md transition-all active:scale-[0.99] flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Reserving Voucher & Connecting to Paystack...</span>
                  </>
                ) : (
                  <>
                    <span>Pay GHS {plan.price}.00 with Paystack</span>
                  </>
                )}
              </button>

              <div className="flex items-center justify-center gap-2 text-[11px] text-neutral-500">
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                <span>Voucher code is locked exclusively to your order for 15 mins</span>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
