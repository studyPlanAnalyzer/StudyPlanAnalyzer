'use client';

import { Button } from '@/components/ui/Button';

interface ErrorMessageProps {
  message: string | null;
  /** If provided, a "Try again" button is shown. */
  onRetry?: () => void;
  retrying?: boolean;
}

export function ErrorMessage({
  message,
  onRetry,
  retrying,
}: ErrorMessageProps) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="mt-4 flex flex-col gap-3 rounded-lg border border-red-200 bg-red-50 p-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="text-sm text-red-700">{message}</p>
      {onRetry && (
        <Button
          size="sm"
          variant="secondary"
          onClick={onRetry}
          isLoading={retrying}
        >
          Try again
        </Button>
      )}
    </div>
  );
}
