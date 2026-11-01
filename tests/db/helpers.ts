import { Client } from 'pg';

// ---------------------------------------------------------------------------
// Shared setup for database tests. They run only when TEST_DATABASE_URL is
// set, against a database whose name contains "test": it is wiped and
// rebuilt from the migrations in drizzle/ each time.
//
//   createdb studyplan_test
//   TEST_DATABASE_URL=postgresql://localhost:5432/studyplan_test npm run test:db
// ---------------------------------------------------------------------------

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
export const SKIP_DB = TEST_DATABASE_URL ? false : 'TEST_DATABASE_URL is not set';

export async function setupTestDb() {
  const url = new URL(TEST_DATABASE_URL!);
  const name = url.pathname.slice(1);
  if (!/test/i.test(name))
    throw new Error(`Refusing to wipe "${name}": a test database's name must contain "test".`);
  const local = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);

  // UTC like Neon, so database-made timestamps line up with the app's.
  const admin = new Client({ connectionString: TEST_DATABASE_URL, ssl: local ? false : undefined });
  await admin.connect();
  await admin.query(`alter database "${name.replace(/"/g, '')}" set timezone to 'UTC'`);
  await admin.query('drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;');
  await admin.end();

  process.env.DATABASE_URL = TEST_DATABASE_URL;
  if (local) process.env.DB_SSL_MODE ??= 'disable';
  process.env.JWT_SECRET ??= 'test-secret-'.padEnd(44, 'x');

  const { db, schema } = await import('@/lib/db');
  const { migrate } = await import('drizzle-orm/node-postgres/migrator');
  await migrate(db, { migrationsFolder: 'drizzle' });
  const { sql } = await import('drizzle-orm');
  const check = await db.execute(sql`
    select to_regclass('public.weekly_report_checks') as checks,
           exists (select 1 from information_schema.columns
                    where table_name = 'users' and column_name = 'google_id') as google`);
  const ok = check.rows[0] as { checks: string | null; google: boolean };
  if (!ok.checks || !ok.google)
    throw new Error('The migrations are behind the schema: run `npm run db:generate` first.');
  return { db, schema, sql };
}

export async function closeTestDb() {
  const { db } = await import('@/lib/db');
  await db.$client.end();
}
