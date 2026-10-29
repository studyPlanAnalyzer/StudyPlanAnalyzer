import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { desc, sql } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import {
  forbiddenResponse,
  getUserFromRequest,
  unauthorizedResponse,
} from '@/lib/auth/middleware';
import { withErrorHandling } from '@/lib/api/handler';
import { makeSchoolCode } from '@/lib/billing/codes';

export const GET = withErrorHandling(async (req: NextRequest) => {
  const user = await getUserFromRequest(req);
  if (!user) return unauthorizedResponse();
  if (!user.isAdmin) return forbiddenResponse();

  const schools = await db
    .select({
      id: schema.schools.id,
      name: schema.schools.name,
      referenceCode: schema.schools.referenceCode,
      paidUntil: schema.schools.paidUntil,
      createdAt: schema.schools.createdAt,
      childrenCount: sql<number>`(
        select count(*)::int from students
        where students.school_id = ${schema.schools.id}
      )`,
    })
    .from(schema.schools)
    .orderBy(desc(schema.schools.createdAt));
  return NextResponse.json({ schools });
});

const createSchema = z.object({ name: z.string().trim().min(1).max(200) });

/** Adds a school and gives it a random reference code for its parents. */
export const POST = withErrorHandling(async (req: NextRequest) => {
  const user = await getUserFromRequest(req);
  if (!user) return unauthorizedResponse();
  if (!user.isAdmin) return forbiddenResponse();

  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success)
    return NextResponse.json(
      { error: 'Enter the school name.' },
      { status: 400 },
    );

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const [school] = await db
        .insert(schema.schools)
        .values({
          name: parsed.data.name,
          referenceCode: makeSchoolCode(),
        })
        .returning();
      return NextResponse.json({ school }, { status: 201 });
    } catch (err: any) {
      const code = err?.code ?? err?.cause?.code;
      if (code !== '23505' || attempt === 2) throw err;
    }
  }
  throw new Error('unreachable');
});
