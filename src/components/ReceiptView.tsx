import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Wifi,
  Copy,
  Check,
  Download,
  ExternalLink,
  ShieldCheck,
  AlertTriangle,
  Loader2,
  Clock,
  ArrowLeft,
  Share2,
} from 'lucide-react';
import QRCode from 'qrcode';
import { LavamiLogo } from './LavamiLogo.tsx';

interface ReceiptData {
  order: {
    id: string;
    plan_slug: string;
    plan_name: string;
    amount_pesewas: number;
    amount_ghs: number;
    currency: string;
    status: 'pending' | 'paid' | 'paid_no_stock' | 'failed' | 'refunded';
    paystack_ref: string;
    created_at: string;
    paid_at: string | null;
    token_expires_at: string;
  };
  voucher_code: string | null;
  router_login_url: string;
  connect_url: string | null;
  qr_data: string | null;
}

interface ReceiptViewProps {
  receiptToken: string;
  onBackToShop: () => void;
  isSimulated?: boolean;
}

export function ReceiptView({ receiptToken, onBackToShop }: ReceiptViewProps) {
  const [data, setData] = useState<ReceiptData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [isSimulatingPayment, setIsSimulatingPayment] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Fetch receipt details
  const fetchReceipt = useCallback(async () => {
    try {
      const res = await fetch(`/api/receipt/${receiptToken}`, {
        headers: { 'Cache-Control': 'no-cache' },
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Receipt not found');
      }
      setData(json);
      setError(null);
      return json as ReceiptData;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load receipt';
      setError(msg);
      return null;
    } finally {
      setLoading(false);
    }
  }, [receiptToken]);

  // Initial load and polling if status is pending
  useEffect(() => {
    let timer: NodeJS.Timeout;
    let pollInterval = 1500; // start with 1.5s

    const runPoll = async () => {
      const result = await fetchReceipt();
      if (result && result.order.status === 'pending') {
        // Exponential backoff up to 10s
        pollInterval = Math.min(pollInterval * 1.3, 10000);
        timer = setTimeout(runPoll, pollInterval);
      }
    };

    runPoll();

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [fetchReceipt]);

  // Generate QR code when voucher code is ready
  useEffect(() => {
    if (data?.qr_data) {
      QRCode.toDataURL(data.qr_data, {
        width: 256,
        margin: 2,
        color: {
          dark: '#6B2D17',
          light: '#FFFFFF',
        },
      })
        .then((url) => setQrDataUrl(url))
        .catch((err) => console.error('QR generation error:', err));
    }
  }, [data?.qr_data]);

  // Copy voucher code
  const handleCopyCode = async () => {
    if (!data?.voucher_code) return;
    try {
      await navigator.clipboard.writeText(data.voucher_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  // Simulate payment completion in test mode
  const handleSimulatePayment = async () => {
    if (!data?.order?.paystack_ref) return;
    setIsSimulatingPayment(true);
    try {
      const res = await fetch('/api/test-pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reference: data.order.paystack_ref }),
      });
      const result = await res.json();
      if (result.success) {
        await fetchReceipt();
      } else {
        alert(result.error || 'Payment verification failed');
      }
    } catch {
      alert('Error verifying payment simulation');
    } finally {
      setIsSimulatingPayment(false);
    }
  };

  // Download high-resolution voucher image card (client-side canvas)
  const handleDownloadImage = () => {
    if (!data || !data.voucher_code) return;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = 800;
    canvas.height = 1000;

    // Background Cream
    ctx.fillStyle = '#FFF8F0';
    ctx.fillRect(0, 0, 800, 1000);

    // Top Header Banner
    ctx.fillStyle = '#6B2D17';
    ctx.fillRect(0, 0, 800, 200);

    // Decorative Gold Line
    ctx.fillStyle = '#F2A902';
    ctx.fillRect(0, 192, 800, 8);

    // Header Text
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 36px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('LAVAMI FASHION WIFI', 400, 85);

    ctx.font = '22px Arial, sans-serif';
    ctx.fillStyle = '#F2A902';
    ctx.fillText('KUMASI IPT • HIGH-SPEED MIKROTIK WIFI', 400, 135);

    // Plan & Details
    ctx.fillStyle = '#2C1810';
    ctx.font = 'bold 32px Arial, sans-serif';
    ctx.fillText(data.order.plan_name.toUpperCase(), 400, 270);

    ctx.font = '20px Arial, sans-serif';
    ctx.fillStyle = '#666666';
    ctx.fillText(`Amount Paid: GHS ${data.order.amount_ghs}.00`, 400, 310);

    // Voucher Code Box
    ctx.fillStyle = '#F2A902';
    ctx.roundRect(150, 360, 500, 110, 16);
    ctx.fill();

    ctx.fillStyle = '#6B2D17';
    ctx.font = 'bold 54px Courier, monospace';
    ctx.fillText(data.voucher_code, 400, 435);

    // Instructions
    ctx.fillStyle = '#2C1810';
    ctx.font = 'bold 20px Arial, sans-serif';
    ctx.fillText('How to Connect to WiFi:', 400, 525);

    ctx.font = '18px Arial, sans-serif';
    ctx.fillStyle = '#555555';
    ctx.fillText('1. Connect to "Lavami_WiFi" or router hotspot network', 400, 560);
    ctx.fillText('2. In your browser or captive portal, enter the code above', 400, 595);
    ctx.fillText('3. Or scan the QR code below to connect instantly', 400, 630);

    // Draw QR code image onto canvas
    if (qrDataUrl) {
      const qrImg = new Image();
      qrImg.src = qrDataUrl;
      qrImg.onload = () => {
        ctx.drawImage(qrImg, 280, 670, 240, 240);

        // Footer
        ctx.fillStyle = '#888888';
        ctx.font = '16px Arial, sans-serif';
        ctx.fillText('Lavami Fashion • Kumasi IPT • +233 592 495 005', 400, 950);

        // Trigger Download
        const link = document.createElement('a');
        link.download = `Lavami-WiFi-${data.voucher_code}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
      };
    }
  };

  if (loading) {
    return (
      <div className="max-w-md mx-auto py-16 px-4 text-center space-y-4">
        <Loader2 className="w-10 h-10 text-[#6B2D17] animate-spin mx-auto" />
        <h2 className="text-lg font-bold text-[#2C1810]">Retrieving Secure Receipt...</h2>
        <p className="text-xs text-neutral-500">
          Checking voucher assignment with Lavami WiFi server...
        </p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-md mx-auto py-12 px-4 space-y-6">
        <div className="bg-red-50 border border-red-200 rounded-3xl p-6 text-center space-y-3">
          <AlertTriangle className="w-10 h-10 text-red-600 mx-auto" />
          <h2 className="text-lg font-extrabold text-red-900">Receipt Not Available</h2>
          <p className="text-xs text-red-700 leading-relaxed">
            {error || 'This receipt link is invalid, expired, or cannot be recovered.'}
          </p>
          <div className="pt-2">
            <button
              onClick={onBackToShop}
              className="inline-flex items-center gap-2 bg-[#6B2D17] text-white px-5 py-2.5 rounded-xl font-bold text-xs shadow-sm hover:bg-[#4A1D0D]"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Return to WiFi Shop</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  const { order, voucher_code, connect_url } = data;
  const isPaid = order.status === 'paid';
  const isPending = order.status === 'pending';

  return (
    <div className="max-w-md mx-auto py-6 px-4 space-y-6 animate-fade-in">
      {/* Hidden canvas for image export */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Top back button */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBackToShop}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-[#6B2D17] hover:underline"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Plans</span>
        </button>
        <span className="text-[11px] font-mono text-neutral-500">Ref: {order.paystack_ref}</span>
      </div>

      {/* Main Voucher Card */}
      <div className="bg-white rounded-3xl shadow-xl border border-neutral-200/80 overflow-hidden">
        {/* Brand Header */}
        <div className="bg-[#6B2D17] text-white p-5 text-center relative">
          <div className="flex items-center justify-center mb-1">
            <LavamiLogo variant="mark" size="sm" />
          </div>
          <h1 className="text-lg font-extrabold text-white tracking-wider">
            LAVAMI WIFI RECEIPT
          </h1>
          <p className="text-xs text-[#F2A902] font-semibold mt-0.5">
            {order.plan_name} • GHS {order.amount_ghs}.00
          </p>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Status Banner */}
          {isPending ? (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-center space-y-3">
              <div className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-amber-100 text-amber-700 animate-pulse">
                <Clock className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-amber-900">Awaiting Payment Confirmation</h3>
                <p className="text-xs text-amber-700 mt-1">
                  We are verifying your Paystack transaction. Your voucher is securely reserved.
                </p>
              </div>

              <div className="pt-2 flex flex-col gap-2">
                <button
                  id="simulate-pay-btn"
                  onClick={handleSimulatePayment}
                  disabled={isSimulatingPayment}
                  className="w-full py-2.5 px-3 rounded-xl bg-[#F2A902] hover:bg-[#F2A902]/90 text-[#2C1810] font-bold text-xs shadow-xs flex items-center justify-center gap-2"
                >
                  {isSimulatingPayment ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <span>Test Mode: Complete Payment Instantly</span>
                  )}
                </button>
              </div>
            </div>
          ) : isPaid && voucher_code ? (
            <div className="space-y-5">
              {/* Verified badge */}
              <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 py-1.5 px-3 rounded-full border border-emerald-200 w-fit mx-auto">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span>Payment Confirmed • Voucher Active</span>
              </div>

              {/* Huge Voucher Code display */}
              <div className="bg-[#FFF8F0] border-2 border-[#F2A902] rounded-2xl p-4 text-center shadow-inner relative group">
                <span className="text-[11px] font-bold text-[#6B2D17] uppercase tracking-widest block mb-1">
                  Your WiFi Voucher Code
                </span>

                <div className="font-mono text-3xl sm:text-4xl font-black text-[#6B2D17] tracking-widest my-2 select-all">
                  {voucher_code}
                </div>

                <div className="pt-1">
                  <button
                    id="copy-voucher-code-btn"
                    onClick={handleCopyCode}
                    className="inline-flex items-center justify-center gap-1.5 bg-[#6B2D17] hover:bg-[#4A1D0D] text-white px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-sm active:scale-95"
                  >
                    {copied ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-[#F2A902]" />
                        <span>Copied to Clipboard!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Tap to Copy Code</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Primary Connect Button */}
              {connect_url && (
                <a
                  id="connect-now-btn"
                  href={connect_url}
                  className="w-full py-3.5 px-4 rounded-xl font-extrabold text-sm sm:text-base bg-[#F2A902] hover:bg-[#F2A902]/90 text-[#2C1810] shadow-md transition-all flex items-center justify-center gap-2 active:scale-[0.98]"
                >
                  <Wifi className="w-5 h-5" />
                  <span>Connect Now to WiFi</span>
                  <ExternalLink className="w-4 h-4 opacity-70" />
                </a>
              )}

              {/* QR Code Section */}
              {qrDataUrl && (
                <div className="bg-neutral-50 rounded-2xl p-4 text-center border border-neutral-200/80 space-y-2">
                  <span className="text-xs font-semibold text-neutral-700 block">
                    Scan with another phone or camera:
                  </span>
                  <img
                    src={qrDataUrl}
                    alt="WiFi Login QR Code"
                    className="w-44 h-44 mx-auto bg-white p-2 rounded-xl shadow-xs border border-neutral-200"
                  />
                  <p className="text-[11px] text-neutral-500">
                    Direct router login link with voucher auto-fill
                  </p>
                </div>
              )}

              {/* Action Buttons: Save/Download */}
              <div className="grid grid-cols-2 gap-2 pt-2">
                <button
                  id="download-voucher-card-btn"
                  onClick={handleDownloadImage}
                  className="py-2.5 px-3 rounded-xl border border-neutral-300 hover:bg-neutral-50 font-bold text-xs text-neutral-700 flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Download className="w-3.5 h-3.5 text-[#6B2D17]" />
                  <span>Save to Gallery</span>
                </button>

                <button
                  onClick={handleCopyCode}
                  className="py-2.5 px-3 rounded-xl border border-neutral-300 hover:bg-neutral-50 font-bold text-xs text-neutral-700 flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Share2 className="w-3.5 h-3.5 text-[#F2A902]" />
                  <span>Share Code</span>
                </button>
              </div>

              {/* Guest Warning */}
              <div className="p-3.5 bg-amber-50/80 border border-amber-200/80 rounded-2xl text-[11px] text-amber-900 leading-relaxed">
                <strong>Important Notice:</strong> Save this code now. Without your secret link, this page cannot be recovered. Your voucher expires in 30 days.
              </div>
            </div>
          ) : (
            <div className="text-center py-6 space-y-3">
              <AlertTriangle className="w-10 h-10 text-red-500 mx-auto" />
              <h3 className="text-base font-bold text-neutral-800">
                Order Status: {order.status}
              </h3>
              <p className="text-xs text-neutral-600">
                {order.status === 'paid_no_stock'
                  ? 'Your payment was received, but no voucher was available. Please contact Lavami Fashion at Kumasi IPT (+233 592 495 005) immediately.'
                  : 'This order was not completed.'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
