// Runs once when the server starts.
export async function register() {
  // Development and preview deployments only: let appDay() see the dev
  // clock's fake day from the very first request, API calls included (see
  // lib/dev-clock.ts).
  if (
    (process.env.NODE_ENV === 'development' || process.env.VERCEL_ENV === 'preview') &&
    process.env.NEXT_RUNTIME === 'nodejs'
  ) {
    const { installDevClock } = await import('@/lib/dev-clock');
    installDevClock();
  }
}
