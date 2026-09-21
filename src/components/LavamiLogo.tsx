interface LavamiLogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'full' | 'mark' | 'horizontal';
  showSubtitle?: boolean;
}

export function LavamiLogo({
  className = '',
  size = 'md',
  variant = 'full',
  showSubtitle = true,
}: LavamiLogoProps) {
  const heightClasses = {
    sm: 'h-10',
    md: 'h-16',
    lg: 'h-24',
  };

  if (variant === 'horizontal') {
    return (
      <div className={`flex items-center gap-3 ${className}`}>
        <svg
          viewBox="0 0 160 80"
          className="h-10 w-auto flex-shrink-0"
          aria-label="Lavami Fashion Mark"
        >
          <circle cx="36" cy="40" r="28" fill="#F2A902" />
          <circle cx="92" cy="46" r="21" fill="#6B2D17" />
          <circle cx="136" cy="50" r="14" fill="#F2A902" />
        </svg>
        <div className="flex flex-col leading-none">
          <span className="font-extrabold text-[#6B2D17] text-xl tracking-[0.15em]">
            LAVAMI
          </span>
          {showSubtitle && (
            <span className="text-[10px] font-bold text-[#6B2D17]/80 tracking-[0.22em] mt-0.5">
              FASHION • KUMASI IPT
            </span>
          )}
        </div>
      </div>
    );
  }

  if (variant === 'mark') {
    return (
      <svg
        viewBox="0 0 160 80"
        className={`${heightClasses[size]} w-auto ${className}`}
        aria-label="Lavami Fashion Mark"
      >
        <circle cx="36" cy="40" r="28" fill="#F2A902" />
        <circle cx="92" cy="46" r="21" fill="#6B2D17" />
        <circle cx="136" cy="50" r="14" fill="#F2A902" />
      </svg>
    );
  }

  return (
    <div className={`flex flex-col items-center justify-center text-center ${className}`}>
      <svg
        viewBox="0 0 300 170"
        className={`${heightClasses[size]} w-auto`}
        aria-label="Lavami Fashion Logo"
      >
        {/* Three Brand Circles */}
        <circle cx="85" cy="52" r="32" fill="#F2A902" />
        <circle cx="150" cy="58" r="25" fill="#6B2D17" />
        <circle cx="202" cy="63" r="17" fill="#F2A902" />
        {/* Brand Name */}
        <text
          x="150"
          y="124"
          textAnchor="middle"
          fontFamily="Arial, -apple-system, BlinkMacSystemFont, sans-serif"
          fontWeight="900"
          fontSize="38"
          letterSpacing="3"
          fill="#6B2D17"
        >
          LAVAMI
        </text>
        {/* Subtitle */}
        {showSubtitle && (
          <text
            x="150"
            y="152"
            textAnchor="middle"
            fontFamily="Arial, -apple-system, BlinkMacSystemFont, sans-serif"
            fontWeight="700"
            fontSize="12"
            letterSpacing="5"
            fill="#6B2D17"
          >
            FASHION • KUMASI IPT
          </text>
        )}
      </svg>
    </div>
  );
}
