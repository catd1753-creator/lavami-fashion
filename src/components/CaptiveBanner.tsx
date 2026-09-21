import { useState, useEffect } from 'react';
import { ExternalLink, Copy, Check, ShieldAlert, Wifi } from 'lucide-react';
import type { RouterContext } from '../types.ts';

interface CaptiveBannerProps {
  routerContext: RouterContext;
}

export function CaptiveBanner({ routerContext }: CaptiveBannerProps) {
  const [isCaptive, setIsCaptive] = useState(false);
  const [copied, setCopied] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Detect captive browser / restricted WebView environment
    const ua = navigator.userAgent || '';
    const isWebView =
      /(iPhone|iPod|iPad).*AppleWebKit(?!.*Safari)/i.test(ua) ||
      /CaptiveNetworkSupport/i.test(ua) ||
      /Android.*Version\/[0-9.]+\s+(?:Mobile\s+)?Safari/i.test(ua) ||
      /\bwv\b/i.test(ua) ||
      /Crosswalk/i.test(ua);

    // If query string has captive parameters or webview UA detected
    const hasCaptiveParams = window.location.search.includes('login=') || window.location.search.includes('dst=');

    if (isWebView || hasCaptiveParams) {
      setIsCaptive(true);
    }
  }, []);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  if (!isCaptive || dismissed) {
    if (!routerContext.isValidHost && routerContext.loginUrl) {
      return (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5 text-xs text-amber-900 flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-amber-600 flex-shrink-0" />
          <span className="flex-1">
            <strong>Security Alert:</strong> Untrusted captive portal link detected. The shop is protected and routing securely through Lavami router.
          </span>
        </div>
      );
    }
    return null;
  }

  return (
    <div className="bg-[#6B2D17] text-[#FFF8F0] px-4 py-3 border-b border-[#F2A902]/30 shadow-sm">
      <div className="max-w-3xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-[#F2A902]/20 flex items-center justify-center flex-shrink-0 text-[#F2A902]">
            <Wifi className="w-4 h-4" />
          </div>
          <div>
            <p className="font-semibold text-white">Captive Portal Browser Detected</p>
            <p className="text-[#FFF8F0]/80 text-[11px] leading-snug">
              For fastest Mobile Money payments & saving your receipt, open this page in Chrome or Safari.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            id="copy-shop-link-btn"
            onClick={handleCopyLink}
            className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 bg-[#FFF8F0]/10 hover:bg-[#FFF8F0]/20 text-white px-3 py-1.5 rounded-lg font-medium border border-white/10 transition-colors"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-[#F2A902]" />
                <span>Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy Link</span>
              </>
            )}
          </button>

          <a
            id="open-external-browser-btn"
            href={window.location.href}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 bg-[#F2A902] hover:bg-[#F2A902]/90 text-[#2C1810] px-3 py-1.5 rounded-lg font-semibold transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>Open in Browser</span>
          </a>

          <button
            onClick={() => setDismissed(true)}
            className="text-[#FFF8F0]/60 hover:text-white px-1.5 py-1 text-sm font-bold"
            aria-label="Dismiss banner"
          >
            ×
          </button>
        </div>
      </div>
    </div>
  );
}
