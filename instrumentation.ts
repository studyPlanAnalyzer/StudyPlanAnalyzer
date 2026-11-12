// Runs once when the server starts.
export async function register() {
  // Development only: let appDay() see the dev clock's fake day from the very
  // first request, API calls included (see lib/dev-clock.ts).
  if (
    process.env.NODE_ENV === 'development' &&
    process.env.NEXT_RUNTIME === 'nodejs'
  ) {
    const { installDevClock } = await import('@/lib/dev-clock');
    installDevClock();
  }
}
