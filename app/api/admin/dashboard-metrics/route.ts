import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { and, eq, gte, lte, sql, type AnyColumn } from "drizzle-orm";
import { getUserFromRequest, unauthorizedResponse, forbiddenResponse } from "@/lib/auth/middleware";
import { addDays, appDayStart, appToday, toDateString } from "@/lib/utils/date-utils";
import { withErrorHandling } from "@/lib/api/handler";
import { PENDING_OVERDUE_HOURS } from "@/lib/billing/config";
import { DELETION_DEADLINE_HOURS } from "@/lib/account-deletion-config";

export const GET = withErrorHandling(async (req: NextRequest) => {
  const user = await getUserFromRequest(req);
  if (!user) return unauthorizedResponse();
  if (!user.isAdmin) return forbiddenResponse();

  // Day boundaries are midnights in Nepal, like the rest of the app. Every
  // number is counted in the database, not by loading the rows.
  const now = new Date();
  const overdueBefore = new Date(now.getTime() - PENDING_OVERDUE_HOURS * 3_600_000);
  const deletionOverdueBefore = new Date(now.getTime() - DELETION_DEADLINE_HOURS * 3_600_000);
  const today = appToday();
  const startOfDay = appDayStart(today);
  const sevenDaysAgo = appDayStart(addDays(today, -7));
  const thirtyDaysAgo = appDayStart(addDays(today, -30));
  const startOfMonth = appDayStart(
    new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)),
  );
  const since = (col: AnyColumn, from: Date) =>
    sql<number>`count(*) filter (where ${col} >= ${from.toISOString()})::int`;

  // DAU/WAU/MAU are based on lastLoginAt, which is set on every successful
  // login (and at signup). This is a real, if simple, activity signal —
  // note it only reflects login events, not in-app engagement depth.
  const [[users], [students], [sessions], [attempts], [payments], [access], [deletions]] = await Promise.all([
    db
      .select({
        total: sql<number>`count(*)::int`,
        newThisWeek: since(schema.users.createdAt, sevenDaysAgo),
        newThisMonth: since(schema.users.createdAt, startOfMonth),
        dau: since(schema.users.lastLoginAt, startOfDay),
        wau: since(schema.users.lastLoginAt, sevenDaysAgo),
        mau: since(schema.users.lastLoginAt, thirtyDaysAgo),
      })
      .from(schema.users),
    db.select({ total: sql<number>`count(*)::int` }).from(schema.students),
    // Study plan engagement: sessions actually completed in the last 7 days,
    // vs. how many were scheduled — a decent proxy for whether people are
    // actually using the plans, not just generating them.
    db
      .select({
        scheduled: sql<number>`count(*)::int`,
        completed: sql<number>`count(*) filter (where ${schema.studySessions.status} in ('completed', 'partly_completed'))::int`,
      })
      .from(schema.studySessions)
      .where(
        and(
          gte(schema.studySessions.scheduledDate, toDateString(addDays(today, -7))),
          lte(schema.studySessions.scheduledDate, toDateString(today)),
        ),
      ),
    // Daily Brain Challenge engagement.
    db
      .select({
        today: since(schema.quizAttempts.completedAt, startOfDay),
        thisWeek: sql<number>`count(*)::int`,
      })
      .from(schema.quizAttempts)
      .where(gte(schema.quizAttempts.completedAt, sevenDaysAgo)),
    // Payments (QR, checked by an admin): waiting now, and verified this month
    // (by the day it was verified, in Nepal).
    db
      .select({
        pending: sql<number>`count(*) filter (where ${schema.payments.status} = 'pending')::int`,
        overdue: sql<number>`count(*) filter (where ${schema.payments.status} = 'pending' and ${schema.payments.submittedAt} < ${overdueBefore.toISOString()})::int`,
        verifiedThisMonth: sql<number>`count(*) filter (where ${schema.payments.status} = 'verified' and ${schema.payments.reviewedAt} >= ${startOfMonth.toISOString()})::int`,
        revenueThisMonthRs: sql<number>`coalesce(sum(${schema.payments.amountRs}) filter (where ${schema.payments.status} = 'verified' and ${schema.payments.reviewedAt} >= ${startOfMonth.toISOString()}), 0)::int`,
      })
      .from(schema.payments),
    // Children whose paid period (QR or school code) hasn't ended, or whose
    // payment is being checked (usable until it is). Grace days aren't counted.
    db
      .select({
        paid: sql<number>`count(*) filter (where ${schema.students.paidUntil} > ${now.toISOString()} or ${schema.students.paymentStatus} = 'pending')::int`,
      })
      .from(schema.students),
    // Account deletion requests waiting, and those past the 24-hour promise.
    db
      .select({
        waiting: sql<number>`count(*)::int`,
        overdue: sql<number>`count(*) filter (where ${schema.deletionRequests.requestedAt} < ${deletionOverdueBefore.toISOString()})::int`,
      })
      .from(schema.deletionRequests)
      .where(eq(schema.deletionRequests.status, 'pending')),
  ]);
  const totalUsers = users.total;
  const newUsersThisWeek = users.newThisWeek;
  const newUsersThisMonth = users.newThisMonth;
  const { dau, wau, mau } = users;
  const totalStudents = students.total;
  const sessionsScheduledLast7Days = sessions.scheduled;
  const sessionsCompletedLast7Days = sessions.completed;

  return NextResponse.json({
    signups: {
      total: totalUsers,
      newThisWeek: newUsersThisWeek,
      newThisMonth: newUsersThisMonth,
    },
    students: {
      total: totalStudents,
    },
    activity: {
      dau,
      wau,
      mau,
    },
    studyPlanEngagement: {
      sessionsScheduledLast7Days,
      sessionsCompletedLast7Days,
      completionRate:
        sessionsScheduledLast7Days > 0
          ? Math.round((sessionsCompletedLast7Days / sessionsScheduledLast7Days) * 100)
          : 0,
    },
    dailyBrainChallenge: {
      attemptsToday: attempts.today,
      attemptsThisWeek: attempts.thisWeek,
    },
    billing: {
      paymentsWaiting: payments.pending,
      paymentsOverdue: payments.overdue,
      verifiedThisMonth: payments.verifiedThisMonth,
      revenueThisMonthRs: payments.revenueThisMonthRs,
      paidChildren: access.paid,
    },
    deletionRequests: {
      waiting: deletions.waiting,
      overdue: deletions.overdue,
    },
  });
});
