import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { and, asc, eq, isNull, or, lt, sql } from "drizzle-orm";
import { getUserFromRequest, unauthorizedResponse, forbiddenResponse } from "@/lib/auth/middleware";
import { REUSE_COOLDOWN_DAYS } from "@/lib/types/daily-challenge";
import { addDays, toDateString, todayUTC } from "@/lib/utils/date-utils";
import { withErrorHandling } from "@/lib/api/handler";

const SHORTLIST_SIZE = 5;

export const GET = withErrorHandling(async (req: NextRequest) => {
  const user = await getUserFromRequest(req);
  if (!user) return unauthorizedResponse();
  if (!user.isAdmin) return forbiddenResponse();

  const gradeGroup = req.nextUrl.searchParams.get("gradeGroup");
  const category = req.nextUrl.searchParams.get("category");
  if (!gradeGroup || !category) {
    return NextResponse.json({ error: "gradeGroup and category are required" }, { status: 400 });
  }

  const cooldownCutoff = toDateString(addDays(todayUTC(), -REUSE_COOLDOWN_DAYS));

  const eligible = await db
    .select()
    .from(schema.questions)
    .where(
      and(
        eq(schema.questions.gradeGroup, gradeGroup as "GROUP_4_7" | "GROUP_8_10"),
        eq(schema.questions.category, category as "IQ_LOGIC" | "SCIENCE" | "GENERAL_KNOWLEDGE"),
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
