import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  DEV_CLOCK_ENABLED,
  installDevClock,
  readDevToday,
  writeDevToday,
} from '@/lib/dev-clock';
import {
  addDays,
  appDay,
  appToday,
  isRealDateString,
  toDateString,
} from '@/lib/utils/date-utils';

// Development-only dev clock: read or change the app's fake "today".
// Outside development this route doesn't exist (404).

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

export async function GET() {
  if (!DEV_CLOCK_ENABLED) return new NextResponse(null, { status: 404 });
  installDevClock();
  return NextResponse.json(state());
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
  const next =
    'shiftDays' in body
      ? toDateString(addDays(appToday(), body.shiftDays))
      : body.date;
  // Setting the real day is the same as no fake day.
  writeDevToday(next === state().realToday ? null : next);
  return NextResponse.json(state());
}
