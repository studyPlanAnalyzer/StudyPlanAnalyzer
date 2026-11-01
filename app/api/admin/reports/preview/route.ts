import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { forbiddenResponse, getUserFromRequest, unauthorizedResponse } from '@/lib/auth/middleware';
import { withErrorHandling } from '@/lib/api/handler';
import { parseWeek, previewForChild } from '@/lib/reports/admin';

/** A child's report for a week (stored, and as it would be built now) and
 * the parent's email. Builds in memory only: nothing is stored or sent. */
export const GET = withErrorHandling(async (req: NextRequest) => {
  const user = await getUserFromRequest(req);
  if (!user) return unauthorizedResponse();
  if (!user.isAdmin) return forbiddenResponse();

  const now = new Date();
  const studentId = z.string().uuid().safeParse(req.nextUrl.searchParams.get('studentId'));
  const week = parseWeek(req.nextUrl.searchParams.get('week'), now);
  if (!studentId.success || !week)
    return NextResponse.json({ error: 'Choose a child and a week.' }, { status: 400 });

  const preview = await previewForChild({ studentId: studentId.data, week, now });
  if (!preview) return NextResponse.json({ error: 'Student not found' }, { status: 404 });
  return NextResponse.json(preview);
});
