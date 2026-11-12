import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  DEV_CLOCK_COOKIE,
  DEV_CLOCK_ENABLED,
  DEV_CLOCK_MODE,
  installDevClock,
  readDevToday,
  withDevToday,
  writeDevToday,
} from '@/lib/dev-clock';
import {
  addDays,
  appDay,
  appToday,
  isRealDateString,
  toDateString,
} from '@/lib/utils/date-utils';

// The dev clock: read or change the app's fake "today". In development it is
// one day for everyone (a file); on a preview deployment it is this browser's
// own (a cookie). In production this route doesn't exist (404).

function state() {
  return {
    today: toDateString(appToday()),
    realToday: toDateString(appDay(new Date())),
    faked: readDevToday() !== null,
  };
}

const bodySchema = z.union([
  z.object({
    date: z
      .string()
      .refine(isRealDateString, 'Use a real YYYY-MM-DD date')
      .nullable(),
  }),
  z.object({ shiftDays: z.number().int().min(-366).max(366) }),
]);

export async function GET(req: NextRequest) {
  if (!DEV_CLOCK_ENABLED) return new NextResponse(null, { status: 404 });
  installDevClock();
  return withDevToday(req, () => NextResponse.json(state()));
}

export async function PUT(req: NextRequest) {
  if (!DEV_CLOCK_ENABLED) return new NextResponse(null, { status: 404 });
  installDevClock();
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Send { date: "YYYY-MM-DD" | null } or { shiftDays: n }' },
      { status: 400 },
    );
  }
  const body = parsed.data;
  // A shift is from the day this browser is on now.
  const next = withDevToday(req, () =>
    'shiftDays' in body
      ? toDateString(addDays(appToday(), body.shiftDays))
      : body.date,
  );
  // Setting the real day is the same as no fake day.
  const day = next === toDateString(appDay(new Date())) ? null : next;
  if (DEV_CLOCK_MODE === 'file') {
    writeDevToday(day);
    return NextResponse.json(state());
  }
  const res = NextResponse.json({
    today: day ?? toDateString(appDay(new Date())),
    realToday: toDateString(appDay(new Date())),
    faked: day !== null,
  });
  if (day === null) res.cookies.delete(DEV_CLOCK_COOKIE);
  else
    res.cookies.set(DEV_CLOCK_COOKIE, day, {
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 90,
    });
  return res;
}
