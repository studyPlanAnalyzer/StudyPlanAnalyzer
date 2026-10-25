import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

if (!process.env.DATABASE_URL) {
  throw new Error(
    'DATABASE_URL is not set. Copy .env.example to .env and add your Neon connection string.',
  );
}

// Neon's certificates are signed by a publicly trusted CA, so Node's
// built-in CA store verifies them the same way it verifies any HTTPS
// endpoint — no custom `ca` bundle needs to be sourced or shipped with the
// repo. This is why `rejectUnauthorized` is left at its secure default
// (true) rather than disabled: disabling it would accept ANY certificate,
// self-signed or otherwise, defeating the point of TLS.
//
// DB_SSL_MODE gives local/dev an explicit, deliberate opt-out — e.g. for a
// non-Neon local Postgres instance running without TLS at all — without
// weakening the default for anything talking to Neon. Leave it unset in
// every environment that points at Neon, including local dev against a
// Neon branch, which is the norm for this project per .env.example.
const sslMode = process.env.DB_SSL_MODE ?? 'verify';

const ssl = sslMode === 'disable' ? false : { rejectUnauthorized: true };

// Reuse a single Pool across warm serverless invocations and across Next's
// dev-mode hot reloads. Without this cache, `next dev` would spin up a new
// pool (and new TCP connections) on every file save, and a fresh module
// evaluation per invocation in production would do the same — exactly what
// the Neon *pooled* connection string (PgBouncer, `-pooler` host) exists to
// absorb, but there's no reason to make it absorb more than necessary.
declare global {
  // eslint-disable-next-line no-var
  var __pgPool: Pool | undefined;
}

const pool =
  global.__pgPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl,
    // Keep this modest — Neon's pooled endpoint is already fanning these
    // out over PgBouncer; a large local pool just pushes load downstream
    // without buying you anything.
    max: 10,

    // Fail fast instead of hanging on a slow/unreachable network, so the
    // API layer can return a clear error to the user. 10s leaves room for
    // a Neon cold start (scale-to-zero) while still failing well before the
    // client-side request timeout (20s) fires.
    connectionTimeoutMillis: 10_000,
    // Give up on a single slow query rather than waiting forever.
    query_timeout: 15_000,
    statement_timeout: 15_000,
    // Drop idle connections before Neon/PgBouncer silently kills them.
    idleTimeoutMillis: 30_000,
    keepAlive: true,
  });

// Without a listener, an error on an idle client (network blip) is emitted
// as an uncaught 'error' event and can crash the process.
if (!global.__pgPool) {
  pool.on('error', (err) => {
    console.error('[db] Idle client error:', err.message);
  });
}

if (process.env.NODE_ENV !== 'production') {
  global.__pgPool = pool;
}

export const db = drizzle(pool, { schema });
export * as schema from './schema';
