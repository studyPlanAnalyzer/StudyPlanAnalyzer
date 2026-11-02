import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { paymentRequiredResponse } from '@/lib/billing/guard';
import { dateStringSchema } from '@/lib/validation';

/**
 * The child, for the report APIs: it must be this parent's (404 otherwise,
 * the same as a child that doesn't exist), and its billing must allow reports
 * now. A locked, unpaid or never-paid child gets 402, which the app turns
 * into the payment steps; children in their grace days or waiting for a
 * payment to be checked get their reports.
 */
export async function reportChild(
  studentId: string,
  userId: string,
): Promise<{ id: string; name: string } | NextResponse> {
  const [student] = await db
    .select({
      id: schema.students.id,
      name: schema.students.name,
      paidUntil: schema.students.paidUntil,
      paymentStatus: schema.students.paymentStatus,
    })
    .from(schema.students)
    .where(and(eq(schema.students.id, studentId), eq(schema.students.parentId, userId)))
    .limit(1);
  if (!student)
    return NextResponse.json({ error: 'Student not found' }, { status: 404 });
  const denied = paymentRequiredResponse(student);
  if (denied) return denied;
  return { id: student.id, name: student.name };
}

/** A report's week in a URL: YYYY-MM-DD. */
export const weekStartSchema = dateStringSchema;
