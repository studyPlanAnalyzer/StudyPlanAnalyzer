import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, ComponentProps } from 'react';
import Link from 'next/link';

type Variant =
  | 'primary'
  | 'secondary'
  | 'ghost'
  | 'danger'
  | 'yellow'
  | 'white'
  | 'outline'
  | 'whiteDanger';
type Size = 'sm' | 'md' | 'lg';

const VARIANT: Record<Variant, string> = {
  // Black pill, like the dashboard's empty-state button
  primary: 'bg-black text-white hover:bg-black/80',
  // Soft gray pill, like the Log out / Back buttons
  secondary: 'bg-[#F0EFED] text-black hover:bg-[#E7E5E2]',
  ghost: 'bg-transparent text-black hover:bg-black/5',
  danger: 'bg-red-600 text-white hover:bg-red-700',
  // The dashboard's main call to action ("Add new child")
  yellow:
    'bg-[#F7CC46] text-black shadow-[0_5px_12px_rgba(0,0,0,0.07)] hover:-translate-y-0.5 hover:bg-[#F0C33A] hover:shadow-[0_7px_16px_rgba(0,0,0,0.10)] disabled:hover:translate-y-0',
  // White pill, for buttons on grey, coloured or red surfaces
  white: 'bg-white text-black hover:bg-white/80',
  outline: 'border-[1.5px] border-[#dcdad3] bg-white text-black hover:bg-[#f4f3ee]',
  // Remove / delete on a card
  whiteDanger: 'border-[1.5px] border-red-200 bg-white text-red-600 hover:bg-red-50',
};

const SIZE: Record<Size, string> = {
  sm: 'h-[38px] px-4 text-sm',
  md: 'h-11 px-6 text-sm sm:px-7 sm:text-base',
  lg: 'px-6 py-3.5 text-sm sm:px-7 sm:py-4 sm:text-base',
};

// With `wrap`, a fixed height becomes a minimum so a long label can wrap.
const SIZE_WRAP: Record<Size, string> = {
  sm: 'min-h-[38px] px-4 py-2 text-sm',
  md: 'min-h-11 px-6 py-2.5 text-sm sm:px-7 sm:text-base',
  lg: SIZE.lg,
};

const BASE =
  'inline-flex shrink-0 items-center justify-center gap-2 rounded-full font-semibold transition-all duration-200 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60';

/**
 * Button classes, for links and other elements that look like a button.
 * `wrap` lets a long label wrap onto more lines on narrow screens.
 */
export function buttonClass(
  variant: Variant = 'primary',
  size: Size = 'md',
  className = '',
  wrap = false,
) {
  return `${BASE} ${wrap ? 'text-center' : 'whitespace-nowrap'} ${VARIANT[variant]} ${(wrap ? SIZE_WRAP : SIZE)[size]} ${className}`;
}

/** A Next.js link that looks like a Button. */
export function ButtonLink({
  variant,
  size,
  wrap,
  className,
  ...rest
}: ComponentProps<typeof Link> & { variant?: Variant; size?: Size; wrap?: boolean }) {
  return <Link className={buttonClass(variant, size, className, wrap)} {...rest} />;
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  isLoading?: boolean;
  /** Let a long label wrap onto more lines on narrow screens. */
  wrap?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      isLoading = false,
      wrap = false,
      className = '',
      disabled,
      children,
      type = 'button',
      ...rest
    },
    ref,
  ) => (
    <button
      ref={ref}
      type={type}
      disabled={disabled || isLoading}
      className={buttonClass(variant, size, className, wrap)}
      {...rest}
    >
      {isLoading && (
        <svg
          className="h-4 w-4 animate-spin"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <circle
            cx="12"
            cy="12"
            r="9"
            stroke="currentColor"
            strokeOpacity="0.3"
            strokeWidth="3"
          />
          <path
            d="M21 12a9 9 0 0 0-9-9"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </svg>
      )}
      {children}
    </button>
  ),
);
Button.displayName = 'Button';
