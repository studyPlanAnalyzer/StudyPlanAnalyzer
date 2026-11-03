import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { and, asc, eq, isNull, or, lt, sql } from "drizzle-orm";
import { getUserFromRequest, unauthorizedResponse, forbiddenResponse } from "@/lib/auth/middleware";
import { REUSE_COOLDOWN_DAYS } from "@/lib/types/daily-challenge";
import { addDays, toDateString, appToday } from "@/lib/utils/date-utils";
import { withErrorHandling } from "@/lib/api/handler";

const SHORTLIST_SIZE = 5;

const querySchema = z.object({
  gradeGroup: z.enum(schema.gradeGroupEnum.enumValues),
  category: z.enum(schema.questionCategoryEnum.enumValues),
});

export const GET = withErrorHandling(async (req: NextRequest) => {
  const user = await getUserFromRequest(req);
  if (!user) return unauthorizedResponse();
  if (!user.isAdmin) return forbiddenResponse();

  const parsed = querySchema.safeParse({
    gradeGroup: req.nextUrl.searchParams.get("gradeGroup"),
    category: req.nextUrl.searchParams.get("category"),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Choose a valid gradeGroup and category" }, { status: 400 });
  }
  const { gradeGroup, category } = parsed.data;

  const cooldownCutoff = toDateString(addDays(appToday(), -REUSE_COOLDOWN_DAYS));

  const eligible = await db
    .select()
    .from(schema.questions)
    .where(
      and(
        eq(schema.questions.gradeGroup, gradeGroup),
        eq(schema.questions.category, category),
        eq(schema.questions.status, "APPROVED"),
        or(isNull(schema.questions.lastUsedAt), lt(schema.questions.lastUsedAt, cooldownCutoff))
      )
    )
    // Least-recently-used first, so the rotation naturally spreads across
    // the whole approved bank rather than favoring newly-approved questions.
    // Postgres defaults to NULLS LAST for ASC, but a null lastUsedAt means
    // "never used" — the most eligible case — so it must sort first here.
    .orderBy(sql`${schema.questions.lastUsedAt} ASC NULLS FIRST`, asc(schema.questions.createdAt))
    .limit(SHORTLIST_SIZE);

  return NextResponse.json({ questions: eligible });
});
