import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  date,
  numeric,
  json,
  index,
  uniqueIndex,
  pgEnum,
  primaryKey,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import type { WeeklyReportSnapshot } from '../reports/types';

// ---------------------------------------------------------------------------
// users (parent accounts)
// ---------------------------------------------------------------------------
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  // Google's stable user id (the ID token's `sub`): the account's identity.
  // Sign-in is Google only; the email is never used to find an account.
  googleId: text('google_id').notNull().unique(),
  name: text('name').notNull(),
  // The Google account's email, for display only (it can change).
  email: text('email').notNull(),
  phone: text('phone'),
  preferredLanguage: text('preferred_language').default('en').notNull(), // 'en' | 'ne'
  // Set on every sign-in from ADMIN_EMAILS (lib/auth/google.ts).
  isAdmin: boolean('is_admin').default(false).notNull(),
  lastLoginAt: timestamp('last_login_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const usersRelations = relations(users, ({ many }) => ({
  students: many(students),
  sessions: many(userSessions),
}));

// ---------------------------------------------------------------------------
// user_sessions (one row per signed-in device: a refresh token "family")
//
// Access tokens name their session row (`sid`) and are honoured only while it
// exists, so logging out or a detected refresh token replay (deleting the
// row) ends the session at once, not when the access token expires. expiresAt follows
// the newest refresh token in the family.
// ---------------------------------------------------------------------------
export const userSessions = pgTable(
  'user_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => ({
    userIdIdx: index('user_sessions_user_id_idx').on(t.userId),
  }),
);

// ---------------------------------------------------------------------------
// refresh_tokens (every refresh token ever issued in a session, as a hash)
//
// Only a SHA-256 of the token is stored, so a database leak gives nothing that
// can be replayed. Each token is used once: refreshing marks it used and
// issues the next one. A used token presented again means it was copied, and
// the whole session is revoked (lib/auth/session.ts).
// ---------------------------------------------------------------------------
export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => userSessions.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at').notNull(),
    usedAt: timestamp('used_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => ({
    sessionIdIdx: index('refresh_tokens_session_id_idx').on(t.sessionId),
  }),
);

// ---------------------------------------------------------------------------
// students
// ---------------------------------------------------------------------------
export const students = pgTable(
  'students',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    parentId: uuid('parent_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    grade: text('grade').notNull(),
    schoolName: text('school_name'),
    studyDays: text('study_days')
      .array()
      .notNull()
      .default(sql`ARRAY['Mon','Tue','Wed','Thu','Fri','Sun']::text[]`),
    schoolDayMinutes: integer('school_day_minutes').default(45).notNull(),
    holidayDayMinutes: integer('holiday_day_minutes').default(90).notNull(),
    // Billing: the end of the period this child can be used until. null =
    // never paid (a new child). See lib/billing/state.ts.
    paidUntil: timestamp('paid_until'),
    // none | pending (paid, waiting for an admin to check) | verified |
    // rejected (the last payment couldn't be verified) | school
    paymentStatus: text('payment_status').default('none').notNull(),
    // Set when the child is covered by a school's bulk payment.
    schoolId: uuid('school_id').references(() => schools.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => ({
    parentIdIdx: index('students_parent_id_idx').on(t.parentId),
  }),
);

// ---------------------------------------------------------------------------
// schools (a school that collects the fee from its parents in bulk)
// ---------------------------------------------------------------------------
export const schools = pgTable('schools', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  // The code the school gives its parents. Created by us, random.
  referenceCode: text('reference_code').notNull().unique(),
  // Every child linked to the school can use the app until this date. Set by
  // an admin when the school pays us.
  paidUntil: timestamp('paid_until'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// payments (a parent paying us directly by QR; an admin checks each one)
// ---------------------------------------------------------------------------
export const payments = pgTable(
  'payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // Kept (as null) if the child is deleted, so the record survives.
    studentId: uuid('student_id').references(() => students.id, {
      onDelete: 'set null',
    }),
    plan: text('plan').notNull(), // 'monthly' | 'term'
    months: integer('months').notNull(), // 1 or 3
    amountRs: integer('amount_rs').notNull(),
    // The code the parent puts in the payment remark, so we can find it in
    // our statement. Random, and includes the child's name.
    remarkCode: text('remark_code').notNull().unique(),
    // Filled in when the parent says they have paid.
    transactionId: text('transaction_id').unique(),
    parentName: text('parent_name'),
    childName: text('child_name'),
    schoolName: text('school_name'),
    // awaiting (shown the QR, not submitted) | pending (submitted, to be
    // checked) | verified | rejected | superseded (replaced by a newer one)
    status: text('status').default('awaiting').notNull(),
    // What the child's paidUntil was before the temporary access given on
    // submission, put back if the payment is rejected.
    previousPaidUntil: timestamp('previous_paid_until'),
    adminNote: text('admin_note'),
    reviewedBy: uuid('reviewed_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    submittedAt: timestamp('submitted_at'),
    reviewedAt: timestamp('reviewed_at'),
  },
  (t) => ({
    userIdIdx: index('payments_user_id_idx').on(t.userId),
    studentIdIdx: index('payments_student_id_idx').on(t.studentId),
    statusIdx: index('payments_status_idx').on(t.status),
  }),
);

export const studentsRelations = relations(students, ({ one, many }) => ({
  parent: one(users, { fields: [students.parentId], references: [users.id] }),
  exams: many(exams),
  subjects: many(subjects),
  assessments: many(assessments),
  studyPlans: many(studyPlans),
  todos: many(todos), // ← add this line
}));

// ---------------------------------------------------------------------------
// exams
// ---------------------------------------------------------------------------
export const exams = pgTable(
  'exams',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    examDate: date('exam_date').notNull(),
    isPrimary: boolean('is_primary').default(true).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => ({
    studentIdIdx: index('exams_student_id_idx').on(t.studentId),
  }),
);

export const examsRelations = relations(exams, ({ one, many }) => ({
  student: one(students, {
    fields: [exams.studentId],
    references: [students.id],
  }),
  assessments: many(assessments),
  studyPlans: many(studyPlans),
}));

// ---------------------------------------------------------------------------
// subjects
// ---------------------------------------------------------------------------
export const subjects = pgTable(
  'subjects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    fullMarks: integer('full_marks').default(100).notNull(),
    examWeight: text('exam_weight').default('medium').notNull(), // 'low'|'medium'|'high'
    orderIndex: integer('order_index').default(0).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    isActive: boolean('is_active').default(true).notNull(),
  },
  (t) => ({
    studentIdIdx: index('subjects_student_id_idx').on(t.studentId),
  }),
);

export const subjectsRelations = relations(subjects, ({ one, many }) => ({
  student: one(students, {
    fields: [subjects.studentId],
    references: [students.id],
  }),
  topics: many(topics),
  marks: many(marks),
}));

// ---------------------------------------------------------------------------
// subject_estimated_confidence (a parent's gut-sense confidence for a subject
// with no marks yet). Its own table, not a column on `subjects`: the subjects
// routes return whole rows, so a column would show up on every screen. Written
// only by PUT /api/students/[id]/estimated-confidence.
// ---------------------------------------------------------------------------
export const subjectEstimatedConfidence = pgTable(
  'subject_estimated_confidence',
  {
    subjectId: uuid('subject_id')
      .primaryKey()
      .references(() => subjects.id, { onDelete: 'cascade' }),
    level: text('level').notNull(), // 'low'|'medium'|'high'
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
);

// ---------------------------------------------------------------------------
// assessments (exam instances with marks)
// ---------------------------------------------------------------------------
export const assessments = pgTable(
  'assessments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    examId: uuid('exam_id').references(() => exams.id, {
      onDelete: 'set null',
    }),
    assessmentDate: date('assessment_date').notNull(),
    assessmentName: text('assessment_name').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => ({
    studentIdIdx: index('assessments_student_id_idx').on(t.studentId),
    dateIdx: index('assessments_date_idx').on(t.assessmentDate),
  }),
);

export const assessmentsRelations = relations(assessments, ({ one, many }) => ({
  student: one(students, {
    fields: [assessments.studentId],
    references: [students.id],
  }),
  exam: one(exams, { fields: [assessments.examId], references: [exams.id] }),
  marks: many(marks),
}));

// ---------------------------------------------------------------------------
// marks (subject-level marks per assessment)
// ---------------------------------------------------------------------------
export const marks = pgTable(
  'marks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    assessmentId: uuid('assessment_id')
      .notNull()
      .references(() => assessments.id, { onDelete: 'cascade' }),
    subjectId: uuid('subject_id')
      .notNull()
      .references(() => subjects.id, { onDelete: 'cascade' }),
    obtainedMarks: integer('obtained_marks').notNull(),
    fullMarks: integer('full_marks').notNull(),
    confidenceLevel: text('confidence_level'), // 'low'|'medium'|'high'
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => ({
    assessmentIdIdx: index('marks_assessment_id_idx').on(t.assessmentId),
    subjectIdIdx: index('marks_subject_id_idx').on(t.subjectId),
  }),
);

export const marksRelations = relations(marks, ({ one, many }) => ({
  assessment: one(assessments, {
    fields: [marks.assessmentId],
    references: [assessments.id],
  }),
  subject: one(subjects, {
    fields: [marks.subjectId],
    references: [subjects.id],
  }),
  markTopics: many(markTopics),
}));

// mark_topics: optionally scopes a mark to one or more specific topics
// instead of the whole subject. When present, this mark is excluded from
// the subject's overall trend/priority calculation and instead updates
// only the linked topic(s)' estimatedMastery — so a single-topic class
// test (e.g. an Algebra quiz) can't make the whole Math subject look
// like it's improving when Statistics hasn't been touched at all.
export const markTopics = pgTable(
  'mark_topics',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    markId: uuid('mark_id')
      .notNull()
      .references(() => marks.id, { onDelete: 'cascade' }),
    topicId: uuid('topic_id')
      .notNull()
      .references(() => topics.id, { onDelete: 'cascade' }),
  },
  (t) => ({
    uniqueMarkTopic: uniqueIndex('mark_topics_mark_topic_unique').on(
      t.markId,
      t.topicId,
    ),
    markIdIdx: index('mark_topics_mark_id_idx').on(t.markId),
    topicIdIdx: index('mark_topics_topic_id_idx').on(t.topicId),
  }),
);

export const markTopicsRelations = relations(markTopics, ({ one }) => ({
  mark: one(marks, { fields: [markTopics.markId], references: [marks.id] }),
  topic: one(topics, { fields: [markTopics.topicId], references: [topics.id] }),
}));

// ---------------------------------------------------------------------------
// topic_test_effects: what a topic test did to a topic's SM-2 state (the ease
// change actually applied, and the ladder as it was before a restart), so
// editing or deleting the mark can undo it before the new score is applied.
// ---------------------------------------------------------------------------
export const topicTestEffects = pgTable(
  'topic_test_effects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    markId: uuid('mark_id')
      .notNull()
      .references(() => marks.id, { onDelete: 'cascade' }),
    topicId: uuid('topic_id')
      .notNull()
      .references(() => topics.id, { onDelete: 'cascade' }),
    easeDelta: numeric('ease_delta', { precision: 4, scale: 2 }).notNull(),
    // Set only when the test restarted the ladder: the state before it, and
    // the review date the restart set (to tell whether it is still untouched).
    restart: json('restart').$type<{
      before: {
        repetitionCount: number;
        intervalDays: number;
        status: string;
        nextReviewDate: string | null;
      };
      nextReviewDate: string;
    } | null>(),
  },
  (t) => ({
    uniqueMarkTopic: uniqueIndex('topic_test_effects_mark_topic_unique').on(
      t.markId,
      t.topicId,
    ),
  }),
);

// ---------------------------------------------------------------------------
// topics (sub-topics within subjects)
// ---------------------------------------------------------------------------
export const topics = pgTable(
  'topics',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    subjectId: uuid('subject_id')
      .notNull()
      .references(() => subjects.id, { onDelete: 'cascade' }),
    // null = a top-level topic. Set = a sub-topic of that topic (one level only,
    // enforced in the API). Only "leaf" topics (no sub-topics) are scheduled.
    parentTopicId: uuid('parent_topic_id').references(
      (): AnyPgColumn => topics.id,
      { onDelete: 'cascade' },
    ),
    name: text('name').notNull(),
    difficultyRating: integer('difficulty_rating').default(2).notNull(), // 1-5
    estimatedMastery: integer('estimated_mastery'), // 0-100
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => ({
    subjectIdIdx: index('topics_subject_id_idx').on(t.subjectId),
    parentTopicIdIdx: index('topics_parent_topic_id_idx').on(t.parentTopicId),
  }),
);

export const topicsRelations = relations(topics, ({ one, many }) => ({
  subject: one(subjects, {
    fields: [topics.subjectId],
    references: [subjects.id],
  }),
  spacedState: one(topicSpacedState, {
    fields: [topics.id],
    references: [topicSpacedState.topicId],
  }),
  sessions: many(studySessions),
  reviews: many(topicReviews),
}));

// ---------------------------------------------------------------------------
// topic_spaced_state (spaced-repetition state per topic)
// ---------------------------------------------------------------------------
export const topicSpacedState = pgTable('topic_spaced_state', {
  topicId: uuid('topic_id')
    .primaryKey()
    .references(() => topics.id, { onDelete: 'cascade' }),
  intervalDays: integer('interval_days').default(0).notNull(),
  easeFactor: numeric('ease_factor', { precision: 4, scale: 2 })
    .default('2.5')
    .notNull(),
  repetitionCount: integer('repetition_count').default(0).notNull(),
  lastReviewDate: date('last_review_date'),
  nextReviewDate: date('next_review_date'),
  status: text('status').default('new').notNull(), // 'new'|'learning'|'reviewing'|'mastered'
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const topicSpacedStateRelations = relations(
  topicSpacedState,
  ({ one }) => ({
    topic: one(topics, {
      fields: [topicSpacedState.topicId],
      references: [topics.id],
    }),
  }),
);

// ---------------------------------------------------------------------------
// study_plans
// ---------------------------------------------------------------------------
export const studyPlans = pgTable(
  'study_plans',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    examId: uuid('exam_id')
      .notNull()
      .references(() => exams.id, { onDelete: 'cascade' }),
    generatedAt: timestamp('generated_at').defaultNow().notNull(),
    totalDays: integer('total_days').notNull(),
    averageDailyMinutes: integer('average_daily_minutes').notNull(),
    weakFocusPercent: integer('weak_focus_percent').default(60).notNull(),
    mediumFocusPercent: integer('medium_focus_percent').default(25).notNull(),
    strongFocusPercent: integer('strong_focus_percent').default(15).notNull(),
    unscheduledTopicIds: json('unscheduled_topic_ids')
      .$type<string[]>()
      .default([])
      .notNull(),
    /** Whether this plan's schedule stops 7 days before the exam (leaving
     * a self-directed consolidation week) or runs all the way to the exam
     * date. Chosen once, when the plan is first generated; reused on every
     * regenerate rather than re-asked, and recomputed against the CURRENT
     * exam date each time (not frozen), so an exam-date edit in Settings
     * is still respected. */
    useBufferWeek: boolean('use_buffer_week').default(false).notNull(),
    /** Topic ids the generator couldn't place anywhere on the calendar
     * (ran out of room) — captured at generation time so the Plan page can
     * warn about them honestly, without confusing "genuinely couldn't fit"
     * with "not due for review yet," which looks identical from the
     * outside if recomputed later from session rows alone. */
  },
  (t) => ({
    studentIdIdx: index('study_plans_student_id_idx').on(t.studentId),
    // One plan per exam: generating again is a regenerate, never a second plan.
    examIdUnique: uniqueIndex('study_plans_exam_id_unique').on(t.examId),
  }),
);

export const studyPlansRelations = relations(studyPlans, ({ one, many }) => ({
  student: one(students, {
    fields: [studyPlans.studentId],
    references: [students.id],
  }),
  exam: one(exams, { fields: [studyPlans.examId], references: [exams.id] }),
  sessions: many(studySessions),
}));

// ---------------------------------------------------------------------------
// study_sessions
// ---------------------------------------------------------------------------
export const studySessions = pgTable(
  'study_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    planId: uuid('plan_id')
      .notNull()
      .references(() => studyPlans.id, { onDelete: 'cascade' }),
    topicId: uuid('topic_id').references(() => topics.id, {
      onDelete: 'set null',
    }),
    subjectId: uuid('subject_id').references(() => subjects.id, {
      onDelete: 'set null',
    }),
    scheduledDate: date('scheduled_date').notNull(),
    durationMinutes: integer('duration_minutes').notNull(),
    sessionType: text('session_type').notNull(), // 'learn'|'practice'|'review'|'mock'
    isFiller: boolean('is_filler').default(false).notNull(),
    status: text('status').default('planned').notNull(), // 'planned'|'completed'|'partly_completed'|'skipped'
    rating: integer('rating'), // 1-4
    completedAt: timestamp('completed_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => ({
    planIdIdx: index('study_sessions_plan_id_idx').on(t.planId),
    scheduledDateIdx: index('study_sessions_scheduled_date_idx').on(
      t.scheduledDate,
    ),
    topicIdIdx: index('study_sessions_topic_id_idx').on(t.topicId),
  }),
);

export const studySessionsRelations = relations(studySessions, ({ one }) => ({
  plan: one(studyPlans, {
    fields: [studySessions.planId],
    references: [studyPlans.id],
  }),
  topic: one(topics, {
    fields: [studySessions.topicId],
    references: [topics.id],
  }),
  subject: one(subjects, {
    fields: [studySessions.subjectId],
    references: [subjects.id],
  }),
}));

// ---------------------------------------------------------------------------
// topic_reviews (detailed review history)
// ---------------------------------------------------------------------------
export const topicReviews = pgTable(
  'topic_reviews',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    topicId: uuid('topic_id')
      .notNull()
      .references(() => topics.id, { onDelete: 'cascade' }),
    scheduledDate: date('scheduled_date').notNull(),
    completedDate: date('completed_date'),
    rating: integer('rating').notNull(), // 1-4
    durationMinutes: integer('duration_minutes'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => ({
    topicIdIdx: index('topic_reviews_topic_id_idx').on(t.topicId),
  }),
);

export const topicReviewsRelations = relations(topicReviews, ({ one }) => ({
  topic: one(topics, {
    fields: [topicReviews.topicId],
    references: [topics.id],
  }),
}));

// ---------------------------------------------------------------------------
// Daily Brain Challenge feature
// ---------------------------------------------------------------------------

export const questionStatusEnum = pgEnum('question_status', [
  'PENDING',
  'APPROVED',
  'REJECTED',
  'ARCHIVED',
]);
export const gradeGroupEnum = pgEnum('grade_group', [
  'GROUP_4_7',
  'GROUP_8_10',
]);
export const questionCategoryEnum = pgEnum('question_category', [
  'IQ_LOGIC',
  'SCIENCE',
  'GENERAL_KNOWLEDGE',
  'TECH_AI',
  'MATHEMATICS',
]);

// questions (the reviewable question bank)
export const questions = pgTable(
  'questions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    source: text('source').default('ai').notNull(), // 'ai' | 'manual'
    externalId: text('external_id'),
    category: questionCategoryEnum('category').notNull(),
    gradeGroup: gradeGroupEnum('grade_group').notNull(),
    difficulty: text('difficulty').default('medium').notNull(), // 'easy' | 'medium' | 'hard'
    questionText: text('question_text').notNull(),
    options: json('options').$type<string[]>().notNull(), // exactly 4 option strings
    correctAnswer: text('correct_answer').notNull(), // must match one of `options` verbatim
    explanation: text('explanation'),
    status: questionStatusEnum('status').default('PENDING').notNull(),
    timesUsed: integer('times_used').default(0).notNull(),
    lastUsedAt: date('last_used_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => ({
    statusIdx: index('questions_status_idx').on(t.status),
    eligibilityIdx: index('questions_eligibility_idx').on(
      t.gradeGroup,
      t.category,
      t.status,
    ),
  }),
);

export const questionsRelations = relations(questions, ({ many }) => ({
  dailyQuizQuestions: many(dailyQuizQuestions),
}));

// daily_quizzes (one row per date + grade group)
export const dailyQuizzes = pgTable(
  'daily_quizzes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    date: date('date').notNull(), // YYYY-MM-DD, the day this quiz is FOR
    gradeGroup: gradeGroupEnum('grade_group').notNull(),
    isPublished: boolean('is_published').default(false).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => ({
    uniqueDateGrade: uniqueIndex('daily_quizzes_date_grade_unique').on(
      t.date,
      t.gradeGroup,
    ),
  }),
);

export const dailyQuizzesRelations = relations(dailyQuizzes, ({ many }) => ({
  dailyQuizQuestions: many(dailyQuizQuestions),
  quizAttempts: many(quizAttempts),
}));

// daily_quiz_questions (which 3 questions make up a given daily quiz, in order)
export const dailyQuizQuestions = pgTable(
  'daily_quiz_questions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    dailyQuizId: uuid('daily_quiz_id')
      .notNull()
      .references(() => dailyQuizzes.id, { onDelete: 'cascade' }),
    questionId: uuid('question_id')
      .notNull()
      .references(() => questions.id, { onDelete: 'restrict' }),
    order: integer('order').notNull(), // 0 = IQ & Logic, 1 = Science, 2 = General Knowledge
  },
  (t) => ({
    dailyQuizIdIdx: index('daily_quiz_questions_daily_quiz_id_idx').on(
      t.dailyQuizId,
    ),
    uniqueQuizOrder: uniqueIndex('daily_quiz_questions_quiz_order_unique').on(
      t.dailyQuizId,
      t.order,
    ),
  }),
);

export const dailyQuizQuestionsRelations = relations(
  dailyQuizQuestions,
  ({ one }) => ({
    dailyQuiz: one(dailyQuizzes, {
      fields: [dailyQuizQuestions.dailyQuizId],
      references: [dailyQuizzes.id],
    }),
    question: one(questions, {
      fields: [dailyQuizQuestions.questionId],
      references: [questions.id],
    }),
  }),
);

// quiz_attempts (one row per student per daily quiz)
export const quizAttempts = pgTable(
  'quiz_attempts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    dailyQuizId: uuid('daily_quiz_id')
      .notNull()
      .references(() => dailyQuizzes.id, { onDelete: 'cascade' }),
    score: integer('score').notNull(), // 0 to totalQuestions
    totalQuestions: integer('total_questions').default(3).notNull(),
    answers: json('answers')
      .$type<
        { questionId: string; selectedAnswer: string; correct: boolean }[]
      >()
      .notNull(),
    completedAt: timestamp('completed_at').defaultNow().notNull(),
  },
  (t) => ({
    uniqueStudentQuiz: uniqueIndex('quiz_attempts_student_quiz_unique').on(
      t.studentId,
      t.dailyQuizId,
    ),
    dailyQuizIdIdx: index('quiz_attempts_daily_quiz_id_idx').on(t.dailyQuizId),
    studentIdIdx: index('quiz_attempts_student_id_idx').on(t.studentId),
  }),
);

export const quizAttemptsRelations = relations(quizAttempts, ({ one }) => ({
  student: one(students, {
    fields: [quizAttempts.studentId],
    references: [students.id],
  }),
  dailyQuiz: one(dailyQuizzes, {
    fields: [quizAttempts.dailyQuizId],
    references: [dailyQuizzes.id],
  }),
}));

// ---------------------------------------------------------------------------
// todos (daily to-do list per student, used for streak/discipline tracking)
// ---------------------------------------------------------------------------
export const todos = pgTable(
  'todos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    content: text('content').notNull(),
    isCompleted: boolean('is_completed').default(false).notNull(),
    todoDate: date('todo_date').notNull(), // YYYY-MM-DD, the day this task is for
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => ({
    studentDateIdx: index('todos_student_date_idx').on(t.studentId, t.todoDate),
  }),
);

export const todosRelations = relations(todos, ({ one }) => ({
  student: one(students, {
    fields: [todos.studentId],
    references: [students.id],
  }),
}));

// ---------------------------------------------------------------------------
// weekly_reports (one stored report per child per week; see lib/reports)
//
// The snapshot is the whole computed report as data. The in-app pages render
// it as it is, so an old report never changes when the report logic changes
// later. Reports are made on demand, when a parent opens the app after a
// week has ended (lib/reports/generate.ts); readAt clears the "New weekly
// report" notice.
// ---------------------------------------------------------------------------
export const weeklyReports = pgTable(
  'weekly_reports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    // First day of the report week (lib/reports/week.ts).
    weekStart: date('week_start').notNull(),
    snapshot: json('snapshot').$type<WeeklyReportSnapshot>().notNull(),
    generatedAt: timestamp('generated_at').defaultNow().notNull(),
    readAt: timestamp('read_at'),
  },
  (t) => ({
    studentWeekUnique: uniqueIndex('weekly_reports_student_week_unique').on(
      t.studentId,
      t.weekStart,
    ),
  }),
);

// ---------------------------------------------------------------------------
// student_milestones (badges, each awarded to a child once)
// ---------------------------------------------------------------------------
export const studentMilestones = pgTable(
  'student_milestones',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    // A MilestoneKey (lib/reports/types.ts).
    key: text('key').notNull(),
    // The report week it was earned in.
    weekStart: date('week_start').notNull(),
    awardedAt: timestamp('awarded_at').defaultNow().notNull(),
  },
  (t) => ({
    studentKeyUnique: uniqueIndex('student_milestones_student_key_unique').on(
      t.studentId,
      t.key,
    ),
  }),
);

// ---------------------------------------------------------------------------
// weekly_report_checks (each child-week already decided)
//
// A row means "this child's week has been looked at": it either got a report
// or had no activity and gets none. So the on-demand check is one cheap
// query, and a quiet week is never looked at again.
// ---------------------------------------------------------------------------
export const weeklyReportChecks = pgTable(
  'weekly_report_checks',
  {
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    weekStart: date('week_start').notNull(),
    checkedAt: timestamp('checked_at').defaultNow().notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.studentId, t.weekStart] }),
  }),
);
