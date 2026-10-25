import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

const NETWORK_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EPIPE',
  'ETIMEDOUT',
  'CONNECTION_ERROR',
]);

// Postgres: 08xxx = connection exceptions, 57P01/57P02/57P03 = server shutting down,
// 53300 = too many connections.
function isPgConnectionCode(code?: string) {
  return (
    !!code &&
    (code.startsWith('08') ||
      ['57P01', '57P02', '57P03', '53300'].includes(code))
  );
}

/** Drizzle wraps driver errors in `.cause`, so inspect the whole chain. */
function errorChain(err: unknown): any[] {
  const out: any[] = [];
  let cur: any = err;
  for (let i = 0; cur && i < 5; i++) {
    out.push(cur);
    cur = cur.cause;
  }
  return out;
}

function isDbUnreachable(chain: any[]) {
  return chain.some((e) => {
    const msg = String(e?.message ?? '').toLowerCase();
    return (
      NETWORK_CODES.has(e?.code) ||
      isPgConnectionCode(e?.code) ||
      msg.includes('timeout exceeded when trying to connect') ||
      msg.includes('connection terminated') ||
      msg.includes('connection timeout') ||
      msg.includes('the database system is starting up') ||
      msg.includes('client has encountered a connection error')
    );
  });
}

function isDbQueryTimeout(chain: any[]) {
  return chain.some((e) => {
    const msg = String(e?.message ?? '').toLowerCase();
    return (
      e?.code === '57014' ||
      msg.includes('query read timeout') ||
      msg.includes('statement timeout')
    );
  });
}

export function errorResponse(err: unknown) {
  const chain = errorChain(err);

  if (err instanceof ZodError) {
    return NextResponse.json(
      {
        error: 'Some of the information entered is invalid.',
        code: 'VALIDATION',
        details: err.flatten(),
      },
      { status: 400 },
    );
  }

  if (err instanceof SyntaxError) {
    return NextResponse.json(
      {
        error: "We couldn't read that request. Please refresh and try again.",
        code: 'BAD_JSON',
      },
      { status: 400 },
    );
  }

  if (chain.some((e) => e?.code === '23505')) {
    return NextResponse.json(
      { error: 'That already exists.', code: 'DUPLICATE' },
      { status: 409 },
    );
  }

  if (isDbQueryTimeout(chain)) {
    console.error('[api] DB query timeout:', err);
    return NextResponse.json(
      {
        error: 'The server took too long to respond. Please try again.',
        code: 'DB_TIMEOUT',
      },
      { status: 504 },
    );
  }

  if (isDbUnreachable(chain)) {
    console.error('[api] DB unreachable:', err);
    return NextResponse.json(
      {
        error:
          "We're having trouble reaching our servers. Please check your connection and try again in a moment.",
        code: 'DB_UNAVAILABLE',
      },
      { status: 503 },
    );
  }

  console.error('[api] Unhandled error:', err);
  return NextResponse.json(
    {
      error: 'Something went wrong on our side. Please try again.',
      code: 'INTERNAL',
    },
    { status: 500 },
  );
}

/**
 * Wrap a route handler so any thrown error becomes a consistent JSON response:
 *   { error: string (safe for users), code: string, details?: unknown }
 *
 * Works with or without the second (params) argument.
 */
export function withErrorHandling<Args extends unknown[]>(
  handler: (...args: Args) => Promise<Response>,
) {
  return async (...args: Args): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (err) {
      return errorResponse(err);
    }
  };
}
