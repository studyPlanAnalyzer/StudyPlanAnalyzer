'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import { cardClass } from '@/components/ui/Card';

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
    <div className="flex min-h-screen items-center justify-center bg-[#FAF9F6] px-5 text-black">
      <div className={`${cardClass} w-full max-w-md p-6 text-center sm:p-8`}>
        <h2 className="text-2xl font-extrabold tracking-tight">
          Something went wrong
        </h2>
        <p className="mt-3 text-sm leading-6 text-[#65615D] sm:text-base">
          We hit an unexpected problem loading this page. This can happen on a
          slow or unstable connection. Please try again.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Button onClick={reset}>Try again</Button>
          <Button
            variant="secondary"
            onClick={() => (window.location.href = '/')}
          >
            Go home
          </Button>
        </div>
      </div>
    </div>
  );
}
