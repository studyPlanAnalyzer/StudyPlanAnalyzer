import type { HTMLAttributes } from 'react';
import clsx from 'clsx';

const TONE = {
  error: 'rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700',
  warning: 'rounded-2xl border border-amber-200 bg-[#fff5dc] px-4 py-3 text-sm text-[#805500]',
  info: 'rounded-2xl bg-[#EEF0FF] px-4 py-3 text-sm text-black',
  neutral: 'rounded-[26px] bg-[#F0EFED] px-5 py-5 sm:px-8 sm:py-6',
  success: 'rounded-2xl bg-[#9DDFC2]/40 px-4 py-3 text-sm text-[#145c3d]',
};

/** Error, warning, info, neutral and success message boxes in the dashboard's style. */
export function Notice({
  tone = 'error',
  className,
  ...rest
}: HTMLAttributes<HTMLDivElement> & { tone?: keyof typeof TONE }) {
  return <div className={clsx(TONE[tone], className)} {...rest} />;
}
