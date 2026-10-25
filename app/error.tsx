'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <Card className="max-w-md text-center">
        <h2 className="text-lg font-semibold text-slate-900">
          Something went wrong
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          We hit an unexpected problem loading this page. This can happen on a
          slow or unstable connection. Please try again.
        </p>
        <div className="mt-5 flex justify-center gap-3">
          <Button onClick={reset}>Try again</Button>
          <Button
            variant="secondary"
            onClick={() => (window.location.href = '/')}
          >
            Go home
          </Button>
        </div>
      </Card>
    </div>
  );
}
