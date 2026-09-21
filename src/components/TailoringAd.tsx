import { PhoneCall, Sparkles } from 'lucide-react';

interface TailoringAdProps {
  phone?: string;
  advertisementText?: string;
}

export function TailoringAd({
  phone = '+233 592 495 005',
  advertisementText = 'Quality fashion, sharp fits, and on-time delivery. Visit us at Kumasi IPT.',
}: TailoringAdProps) {
  const cleanPhone = phone.replace(/[^0-9+]/g, '');

  return (
    <aside
      aria-label="Lavami Fashion Advertisement"
      className="bg-gradient-to-r from-[#6B2D17] to-[#4A1D0D] text-[#FFF8F0] rounded-2xl p-5 md:p-6 shadow-md border border-[#F2A902]/30 relative overflow-hidden"
    >
      {/* Subtle decorative circles */}
      <div className="absolute -right-8 -bottom-8 w-32 h-32 rounded-full bg-[#F2A902]/10 pointer-events-none" />
      <div className="absolute right-16 -top-12 w-24 h-24 rounded-full bg-[#F2A902]/5 pointer-events-none" />

      <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="space-y-1.5 max-w-xl">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#F2A902]/20 border border-[#F2A902]/40 text-[#F2A902] text-xs font-bold uppercase tracking-wider">
            <Sparkles className="w-3 h-3" />
            <span>Lavami Fashion</span>
          </div>

          <p className="text-base sm:text-lg font-medium text-white leading-snug">
            “{advertisementText}”
          </p>

          <p className="text-xs text-[#FFF8F0]/80">
            Location: Kumasi IPT
          </p>
        </div>

        <a
          id="tailoring-call-btn"
          href={`tel:${cleanPhone}`}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 bg-[#F2A902] hover:bg-[#F2A902]/90 text-[#2C1810] px-5 py-3 rounded-xl font-bold text-sm shadow-sm transition-transform active:scale-[0.98]"
        >
          <PhoneCall className="w-4 h-4" />
          <span>Call Lavami Fashion ({phone})</span>
        </a>
      </div>
    </aside>
  );
}
