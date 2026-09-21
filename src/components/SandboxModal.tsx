import { useState } from 'react';
import { Smartphone, CreditCard, ShieldCheck, Loader2, X, Check } from 'lucide-react';

interface SandboxModalProps {
  reference: string;
  receiptToken: string;
  amountGhs: number;
  onSuccess: () => void;
  onCancel: () => void;
}

export function SandboxModal({
  reference,
  amountGhs,
  onSuccess,
  onCancel,
}: SandboxModalProps) {
  const [loading, setLoading] = useState(false);
  const [channel, setChannel] = useState<'momo' | 'card'>('momo');

  const handleSimulateSuccess = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/test-pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reference }),
      });
      const data = await res.json();
      if (data.success) {
        onSuccess();
      } else {
        alert(data.error || 'Payment test simulation failed');
      }
    } catch {
      alert('Error during test payment');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-fade-in"
    >
      <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl border border-neutral-200 overflow-hidden">
        {/* Header */}
        <div className="bg-[#0BA4DB] text-white p-5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center font-bold text-sm">
              P
            </div>
            <div>
              <div className="font-extrabold text-sm leading-none">paystack</div>
              <div className="text-[10px] text-white/80 font-medium">Sandbox Test Simulator</div>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="w-7 h-7 rounded-full bg-black/10 hover:bg-black/20 flex items-center justify-center text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          <div className="text-center space-y-1">
            <div className="text-xs text-neutral-500 font-semibold uppercase tracking-wider">
              Amount to Pay
            </div>
            <div className="text-3xl font-black text-[#2C1810]">
              GHS {amountGhs}.00
            </div>
            <div className="text-[11px] font-mono text-neutral-400">Ref: {reference}</div>
          </div>

          {/* Channel selector */}
          <div className="grid grid-cols-2 gap-2 bg-neutral-100 p-1 rounded-xl text-xs font-bold">
            <button
              onClick={() => setChannel('momo')}
              className={`py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 transition-colors ${
                channel === 'momo' ? 'bg-white text-neutral-900 shadow-xs' : 'text-neutral-500'
              }`}
            >
              <Smartphone className="w-3.5 h-3.5 text-[#F2A902]" />
              <span>Mobile Money</span>
            </button>
            <button
              onClick={() => setChannel('card')}
              className={`py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 transition-colors ${
                channel === 'card' ? 'bg-white text-neutral-900 shadow-xs' : 'text-neutral-500'
              }`}
            >
              <CreditCard className="w-3.5 h-3.5 text-[#0BA4DB]" />
              <span>Card</span>
            </button>
          </div>

          <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200 text-xs text-neutral-600 space-y-1">
            <div className="font-bold text-neutral-800 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>Paystack Test Environment</span>
            </div>
            <p className="text-[11px] leading-relaxed">
              No real money will be charged. Click below to simulate instant payment confirmation and test atomic voucher release.
            </p>
          </div>

          <div className="space-y-2">
            <button
              id="sandbox-confirm-pay-btn"
              onClick={handleSimulateSuccess}
              disabled={loading}
              className="w-full py-3.5 px-4 rounded-xl font-extrabold text-sm bg-[#0BA4DB] hover:bg-[#0BA4DB]/90 text-white shadow-sm flex items-center justify-center gap-2 transition-transform active:scale-[0.99] disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>Simulate Payment Success</span>
                </>
              )}
            </button>

            <button
              onClick={onCancel}
              className="w-full py-2 text-xs font-bold text-neutral-500 hover:text-neutral-800 transition-colors"
            >
              Cancel Transaction
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
