-- ===========================================================================
-- One-off: delete every user before the Google sign-in migration.
--
-- Run this ONCE, against the database you are about to migrate, BEFORE
-- `npm run db:migrate`. The migration adds users.google_id as NOT NULL, which
-- fails while any user without a Google id exists. The 14 existing users
-- are test data (confirmed), so they are removed rather than converted.
--
-- It refuses to run unless the users table still has the old password
-- column, so it can't wipe real Google users if run again by mistake later.
--
-- Deleting a user cascades (ON DELETE CASCADE) to:
--   user_sessions, and through them refresh_tokens   (all sign-ins)
--   otp_codes                                        (old email codes)
--   payments made by the user                        (payments.user_id)
--   students (the user's children), and through them:
--     exams, and their study_plans and study_sessions
--     subjects, subject_estimated_confidence, topics, topic_spaced_state,
--       topic_reviews, mark_topics, topic_test_effects
--     assessments and their marks
--     quiz_attempts (daily challenge answers), todos
--     weekly_reports and student_milestones (if the tables exist yet)
-- Set to NULL rather than deleted:
--   payments.reviewed_by (an admin who reviewed a payment); payments.student_id
--   (never matters here: every payment belongs to a user, so it is deleted)
-- NOT touched (no link to users):
--   schools, questions, daily_quizzes, daily_quiz_questions, email_sends
--   (email_sends and otp_codes are dropped by the migration anyway)
-- ===========================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'password_hash'
  ) THEN
    RAISE EXCEPTION 'users has no password_hash column: the Google migration has already run. Not deleting anything.';
  END IF;
  DELETE FROM users;
END $$;
