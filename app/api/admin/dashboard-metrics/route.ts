import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { and, gte, lte } from "drizzle-orm";
import { getUserFromRequest, unauthorizedResponse, forbiddenResponse } from "@/lib/auth/middleware";
import { addDays, toDateString, todayUTC } from "@/lib/utils/date-utils";
import { withErrorHandling } from "@/lib/api/handler";

export const GET = withErrorHandling(async (req: NextRequest) => {
  const user = await getUserFromRequest(req);
  if (!user) return unauthorizedResponse();
  if (!user.isAdmin) return forbiddenResponse();

  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const allUsers = await db
    .select({ id: schema.users.id, createdAt: schema.users.createdAt, lastLoginAt: schema.users.lastLoginAt })
    .from(schema.users);

  const totalUsers = allUsers.length;
  const newUsersThisWeek = allUsers.filter((u) => u.createdAt >= sevenDaysAgo).length;
  const newUsersThisMonth = allUsers.filter((u) => u.createdAt >= startOfMonth).length;

  // DAU/WAU/MAU are based on lastLoginAt, which is set on every successful
  // login (and at signup). This is a real, if simple, activity signal —
  // note it only reflects login events, not in-app engagement depth.
  const dau = allUsers.filter((u) => u.lastLoginAt && u.lastLoginAt >= startOfDay).length;
  const wau = allUsers.filter((u) => u.lastLoginAt && u.lastLoginAt >= sevenDaysAgo).length;
  const mau = allUsers.filter((u) => u.lastLoginAt && u.lastLoginAt >= thirtyDaysAgo).length;

  const totalStudents = (await db.select({ id: schema.students.id }).from(schema.students)).length;

  // Study plan engagement: sessions actually completed in the last 7 days,
  // vs. how many were scheduled — a decent proxy for whether people are
  // actually using the plans, not just generating them.
  const todayStr = toDateString(todayUTC());
  const weekAgoStr = toDateString(addDays(todayUTC(), -7));
  const recentSessions = await db
    .select({ status: schema.studySessions.status, scheduledDate: schema.studySessions.scheduledDate })
    .from(schema.studySessions)
    .where(and(gte(schema.studySessions.scheduledDate, weekAgoStr), lte(schema.studySessions.scheduledDate, todayStr)));
  const sessionsScheduledLast7Days = recentSessions.length;
  const sessionsCompletedLast7Days = recentSessions.filter(
    (s) => s.status === "completed" || s.status === "partly_completed"
  ).length;

  // Daily Brain Challenge engagement.
  const attemptsToday = await db
    .select({ id: schema.quizAttempts.id })
    .from(schema.quizAttempts)
    .where(gte(schema.quizAttempts.completedAt, startOfDay));
  const attemptsThisWeek = await db
    .select({ id: schema.quizAttempts.id })
    .from(schema.quizAttempts)
    .where(gte(schema.quizAttempts.completedAt, sevenDaysAgo));

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
      attemptsToday: attemptsToday.length,
      attemptsThisWeek: attemptsThisWeek.length,
    },
    billing: {
      tracked: false,
      note:
        "No payment/subscription system is wired up yet. Add a subscriptions table (plan, status, currentPeriodEnd) integrated with a payment gateway (e.g. eSewa/Khalti/Stripe) to populate paid-subscriber counts and revenue due here.",
    },
  });
});
