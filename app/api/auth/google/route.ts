import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandling, logError } from '@/lib/api/handler';
import { clientIp, rateLimit } from '@/lib/rate-limit';
import { startSession } from '@/lib/auth/session';
import { GoogleKeysUnavailableError, verifyGoogleIdToken } from '@/lib/auth/google-token';
import { upsertGoogleUser } from '@/lib/auth/google-user';

// The request is a small JSON object holding Google's ID token (about 1-2 KB).
const MAX_BODY_BYTES = 8 * 1024;

const bodySchema = z.object({ credential: z.string().min(1).max(4096) });

/** Reads the body, refusing it as soon as it passes `max` bytes. */
async function readBody(req: NextRequest, max: number): Promise<string | null> {
  const declared = Number(req.headers.get('content-length') ?? '0');
  if (declared > max) return null;
  if (!req.body) return '';
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * "Continue with Google": the browser sends the ID token Google gave it; the
 * server checks it (lib/auth/google-token.ts), finds or creates the account
 * by Google's user id, and starts a session exactly as before (startSession:
 * the same access and refresh cookies). Sign-in and sign-up are the same.
 */
export const POST = withErrorHandling(async (req: NextRequest) => {
  const limited = rateLimit(`google-signin:${clientIp(req)}`, 30, 15 * 60);
  if (limited) return limited;

  const raw = await readBody(req, MAX_BODY_BYTES);
  if (raw === null)
    return NextResponse.json({ error: 'Request too large.' }, { status: 413 });
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'Google sign-in failed. Please try again.' }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success)
    return NextResponse.json({ error: 'Google sign-in failed. Please try again.' }, { status: 400 });

  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    logError('[auth] GOOGLE_CLIENT_ID is not set', new Error('missing GOOGLE_CLIENT_ID'));
    return NextResponse.json({ error: 'Google sign-in is not set up yet.' }, { status: 500 });
  }

  let identity;
  try {
    identity = await verifyGoogleIdToken(parsed.data.credential, clientId);
  } catch (err) {
    if (err instanceof GoogleKeysUnavailableError) {
      logError('[auth] Google keys unavailable', err);
      return NextResponse.json(
        { error: "We couldn't reach Google just now. Please try again in a moment." },
        { status: 503 },
      );
    }
    throw err;
  }
  if (!identity)
    return NextResponse.json({ error: 'Google sign-in failed. Please try again.' }, { status: 401 });

  const user = await upsertGoogleUser(identity);
  const res = NextResponse.json({ user });
  await startSession(res, { id: user.id, isAdmin: user.isAdmin });
  return res;
});
