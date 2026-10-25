import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { inArray } from "drizzle-orm";
import { getUserFromRequest, unauthorizedResponse, forbiddenResponse } from "@/lib/auth/middleware";
import { withErrorHandling } from "@/lib/api/handler";

const bulkUpdateSchema = z.object({
  ids: z.array(z.string().uuid()).min(1),
  status: z.enum(["PENDING", "APPROVED", "REJECTED", "ARCHIVED"]),
});

export const POST = withErrorHandling(async (req: NextRequest) => {
  const user = await getUserFromRequest(req);
  if (!user) return unauthorizedResponse();
  if (!user.isAdmin) return forbiddenResponse();

  const body = await req.json();
  const parsed = bulkUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }

  const updated = await db
    .update(schema.questions)
    .set({ status: parsed.data.status, updatedAt: new Date() })
    .where(inArray(schema.questions.id, parsed.data.ids))
    .returning({ id: schema.questions.id });

  return NextResponse.json({ updatedCount: updated.length });
});
