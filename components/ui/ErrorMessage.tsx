'use client';

import clsx from 'clsx';

import { Button } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Notice';

interface ErrorMessageProps {
  message: string | null;
  /** If provided, a "Try again" button is shown. */
  onRetry?: () => void;
  retrying?: boolean;
  className?: string;
}

export function ErrorMessage({
  message,
  onRetry,
  retrying,
  className = 'mt-5',
}: ErrorMessageProps) {
  if (!message) return null;
  return (
    <Notice
      className={clsx(
        'flex flex-wrap items-center justify-between gap-3',
        className,
      )}
    >
      <span>{message}</span>
      {onRetry && (
        <Button variant="white" onClick={onRetry} isLoading={retrying}>
          Try again
        </Button>
      )}
    </Notice>
  );
}
