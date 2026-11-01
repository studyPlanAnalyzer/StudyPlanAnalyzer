import { forwardRef } from 'react';
import type { ReactNode, SelectHTMLAttributes } from 'react';
import clsx from 'clsx';

// Every text field and dropdown is a 44px pill. Text is 16px on phones, so
// iOS doesn't zoom in when a field is focused, and 14px from tablets up.
const PILL =
  'h-11 rounded-full border-[1.5px] bg-white text-base font-semibold text-black outline-none placeholder:font-semibold placeholder:text-[#8f8f8f] disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm';

/**
 * A text field without a width, for a field that fills its column or is
 * given a width by the caller (Input uses this).
 */
export const fieldShapeClass = `${PILL} border-[#dcdad3] px-4 focus:border-black`;

/** A full-width text field on a white surface. */
export const fieldClass = `w-full min-w-0 ${fieldShapeClass}`;

/** A text field sitting on a coloured card, without a width. */
export const fieldOnColourShapeClass = `${PILL} border-black/10 px-4 focus:border-black/40`;

/** A full-width text field sitting on a coloured card. */
export const fieldOnColourClass = `w-full min-w-0 ${fieldOnColourShapeClass}`;

/** A label above a form control, with an optional hint or error below. */
export function Field({
  label,
  hint,
  error,
  className,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={clsx('flex flex-col gap-1.5', className)}>
      <span className="text-sm font-semibold text-black">{label}</span>
      {children}
      {hint && !error && <span className="text-sm text-[#65615D]">{hint}</span>}
      {error && <span className="text-sm text-red-600">{error}</span>}
    </label>
  );
}

/**
 * A pill dropdown with the arrow drawn on top. `className` sizes the outer
 * box (for example w-full sm:w-[190px]); `onColour` matches fieldOnColourClass.
 */
export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement> & { onColour?: boolean }
>(({ className, onColour = false, children, ...rest }, ref) => (
  <span className={clsx('relative inline-flex', className)}>
    <select
      ref={ref}
      className={clsx(
        PILL,
        'w-full min-w-0 appearance-none pl-4 pr-9',
        onColour ? 'border-black/10 focus:border-black/40' : 'border-[#dcdad3] focus:border-black',
      )}
      {...rest}
    >
      {children}
    </select>
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="pointer-events-none absolute right-3.5 top-1/2 h-3 w-3 -translate-y-1/2"
      aria-hidden="true"
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  </span>
));
Select.displayName = 'Select';
