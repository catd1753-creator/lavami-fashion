import { Wifi, Clock, Database, AlertCircle, ArrowRight, Check } from 'lucide-react';
import type { Plan } from '../types.ts';

interface PlanCardProps {
  plan: Plan;
  isSelected: boolean;
  onSelect: (plan: Plan) => void;
  shopPhone?: string;
}

export function PlanCard({ plan, isSelected, onSelect, shopPhone = '+233 592 495 005' }: PlanCardProps) {
  const isSoldOut = plan.stock_status === 'sold_out' || plan.available_count <= 0;
  const isLowStock = plan.stock_status === 'low_stock' || (plan.available_count > 0 && plan.available_count <= 10);
  const isPopular = plan.slug === 'weekly';

  return (
    <div
      id={`plan-card-${plan.slug}`}
      className={`relative rounded-2xl transition-all duration-200 flex flex-col justify-between border-2 ${
        isSelected
          ? 'border-[#6B2D17] bg-white shadow-lg ring-2 ring-[#F2A902]/50'
          : isSoldOut
          ? 'border-neutral-200 bg-neutral-50/70 opacity-80'
          : 'border-neutral-200/80 bg-white hover:border-[#F2A902] shadow-sm'
      } p-5 md:p-6`}
    >
      {/* Popular badge */}
      {isPopular && !isSoldOut && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#6B2D17] text-[#F2A902] text-[11px] font-extrabold uppercase px-3 py-0.5 rounded-full border border-[#F2A902]/40 tracking-wider shadow-sm">
          Most Popular
        </div>
      )}

      <div>
        {/* Top bar: Plan name and stock badge */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div>
            <h3 className="text-xl font-black text-[#2C1810] tracking-tight">{plan.name}</h3>
            <span className="text-xs text-neutral-500 font-medium">Router Profile: {plan.slug}</span>
          </div>

          <div>
            {isSoldOut ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-red-100 text-red-700 border border-red-200">
                <AlertCircle className="w-3 h-3" />
                Sold Out
              </span>
            ) : isLowStock ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">
                <AlertCircle className="w-3 h-3" />
                {plan.available_count} left
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <Check className="w-3 h-3" />
                In Stock
              </span>
            )}
          </div>
        </div>

        {/* Price display */}
        <div className="my-4 pb-4 border-b border-neutral-100">
          <div className="flex items-baseline gap-1">
            <span className="text-xs font-bold text-[#6B2D17]">GHS</span>
            <span className="text-4xl font-black text-[#2C1810] tracking-tight">
              {plan.price}
            </span>
            <span className="text-xs text-neutral-500 font-medium ml-1">/ {plan.validity}</span>
          </div>
        </div>

        {/* Plan features */}
        <ul className="space-y-2.5 mb-6 text-sm text-[#2C1810]/80">
          <li className="flex items-center gap-2.5">
            <Database className="w-4 h-4 text-[#F2A902] flex-shrink-0" />
            <span className="font-semibold text-neutral-800">{plan.data_allowance} High-Speed Data</span>
          </li>
          <li className="flex items-center gap-2.5">
            <Clock className="w-4 h-4 text-[#6B2D17] flex-shrink-0" />
            <span>Valid for {plan.validity} from first login</span>
          </li>
          <li className="flex items-center gap-2.5">
            <Wifi className="w-4 h-4 text-[#6B2D17] flex-shrink-0" />
            <span>Works on phones, laptops & tablets</span>
          </li>
        </ul>
      </div>

      {/* Action Button */}
      {isSoldOut ? (
        <a
          href={`tel:${shopPhone.replace(/[^0-9+]/g, '')}`}
          className="w-full py-3 px-4 rounded-xl font-bold text-xs sm:text-sm text-center bg-neutral-200 hover:bg-neutral-300 text-neutral-700 transition-colors flex items-center justify-center gap-1.5"
        >
          <span>Sold out, please call us</span>
        </a>
      ) : (
        <button
          id={`select-plan-${plan.slug}`}
          onClick={() => onSelect(plan)}
          className={`w-full py-3 px-4 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 active:scale-[0.98] ${
            isSelected
              ? 'bg-[#6B2D17] text-white shadow-md'
              : 'bg-[#F2A902] hover:bg-[#F2A902]/90 text-[#2C1810] shadow-sm'
          }`}
        >
          <span>{isSelected ? 'Selected' : 'Get WiFi Code'}</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
