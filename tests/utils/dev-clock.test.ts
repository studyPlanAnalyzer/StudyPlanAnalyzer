import { before, describe, test } from 'node:test';
import assert from 'node:assert/strict';

// The dev clock on a preview deployment: each browser's fake day comes from
// its cookie, and every API request runs in its own (lib/dev-clock.ts).
// Each test file runs in its own process, so these settings stay here.
Object.assign(process.env, { NODE_ENV: 'test', VERCEL_ENV: 'preview' });

describe('Dev clock on a preview deployment', () => {
  let route: (req: Request) => Promise<Response>;
  let todayKey: () => string;
  let real: string;

  before(async () => {
    const { withErrorHandling } = await import('@/lib/api/handler');
    ({ todayKey } = await import('@/lib/utils/date-utils'));
    real = todayKey();
    route = withErrorHandling(async (_req: Request) => {
      await new Promise((r) => setTimeout(r, 5)); // across an await, too
      return Response.json({ today: todayKey() });
    });
  });

  const dayFor = async (cookie?: string) => {
    const res = await route(new Request('https://preview.test/api/x', { headers: cookie ? { cookie } : {} }));
    return ((await res.json()) as { today: string }).today;
  };

  test("a request runs in its browser's day", async () => {
    assert.equal(await dayFor('theme=dark; dev-today=2027-01-05'), '2027-01-05');
  });

  test('no cookie, or a date that does not exist: the real day', async () => {
    assert.equal(await dayFor(), real);
    assert.equal(await dayFor('dev-today=2027-02-30'), real);
  });

  test("two browsers at once each keep their own day, and it doesn't leak out", async () => {
    const [a, b] = await Promise.all([dayFor('dev-today=2027-01-05'), dayFor('dev-today=2027-03-01')]);
    assert.deepEqual([a, b], ['2027-01-05', '2027-03-01']);
    assert.equal(todayKey(), real);
  });
});
