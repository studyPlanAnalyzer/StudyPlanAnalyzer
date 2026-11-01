import type { HTMLAttributes } from 'react';
import clsx from 'clsx';

/**
 * A centred dialog over a dimmed page. The panel never grows taller than the
 * screen; long content scrolls inside it. Set the width with `className`
 * (for example max-w-md). With `onBackdropClick`, a click outside the panel
 * calls it. Other props (role, aria-*) go on the panel.
 */
export function Modal({
  children,
  className,
  onBackdropClick,
  ...panel
}: HTMLAttributes<HTMLDivElement> & {
  onBackdropClick?: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={onBackdropClick}
    >
      <div
        className={clsx(
          'max-h-[calc(100dvh-2rem)] w-full overflow-y-auto rounded-[26px] bg-white p-6 shadow-2xl',
          className,
        )}
        onClick={onBackdropClick ? (e) => e.stopPropagation() : undefined}
        {...panel}
      >
        {children}
      </div>
    </div>
  );
}
