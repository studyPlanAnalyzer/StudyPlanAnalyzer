import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { and, eq } from "drizzle-orm";
import { getUserFromRequest, unauthorizedResponse } from "@/lib/auth/middleware";
import { withErrorHandling } from "@/lib/api/handler";

async function assertOwnsStudent(studentId: string, parentId: string) {
  const [student] = await db
    .select({ id: schema.students.id })
    .from(schema.students)
    .where(and(eq(schema.students.id, studentId), eq(schema.students.parentId, parentId)))
    .limit(1);
  return !!student;
}

const createSubjectSchema = z.object({
  studentId: z.string().uuid(),
  name: z.string().min(1).max(200),
  fullMarks: z.number().int().positive().optional().default(100),
  examWeight: z.enum(["low", "medium", "high"]).optional().default("medium"),
  orderIndex: z.number().int().optional().default(0),
});

export const POST = withErrorHandling(async (req: NextRequest) => {
  const user = await getUserFromRequest(req);
  if (!user) return unauthorizedResponse();

  const body = await req.json();
  const parsed = createSubjectSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }

  const owns = await assertOwnsStudent(parsed.data.studentId, user.id);
  if (!owns) return NextResponse.json({ error: "Student not found" }, { status: 404 });

  const [subject] = await db.insert(schema.subjects).values(parsed.data).returning();
  return NextResponse.json({ subject }, { status: 201 });
});

export const GET = withErrorHandling(async (req: NextRequest) => {
  const user = await getUserFromRequest(req);
  if (!user) return unauthorizedResponse();

  const studentId = req.nextUrl.searchParams.get("studentId");
  if (!studentId) return NextResponse.json({ error: "studentId is required" }, { status: 400 });

  const owns = await assertOwnsStudent(studentId, user.id);
  if (!owns) return NextResponse.json({ error: "Student not found" }, { status: 404 });

  const subjects = await db.select().from(schema.subjects).where(eq(schema.subjects.studentId, studentId));
  return NextResponse.json({ subjects });
});
