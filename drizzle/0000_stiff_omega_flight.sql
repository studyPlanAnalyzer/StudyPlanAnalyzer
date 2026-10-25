DO $$ BEGIN
 CREATE TYPE "public"."grade_group" AS ENUM('GROUP_4_7', 'GROUP_8_10');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."question_category" AS ENUM('IQ_LOGIC', 'SCIENCE', 'GENERAL_KNOWLEDGE');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."question_status" AS ENUM('PENDING', 'APPROVED', 'REJECTED', 'ARCHIVED');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"exam_id" uuid,
	"assessment_date" date NOT NULL,
	"assessment_name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "daily_quiz_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"daily_quiz_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"order" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "daily_quizzes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" date NOT NULL,
	"grade_group" "grade_group" NOT NULL,
	"is_published" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "exams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"name" text NOT NULL,
	"exam_date" date NOT NULL,
	"is_primary" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "marks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assessment_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"obtained_marks" integer NOT NULL,
	"full_marks" integer NOT NULL,
	"confidence_level" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text DEFAULT 'ai' NOT NULL,
	"external_id" text,
	"category" "question_category" NOT NULL,
	"grade_group" "grade_group" NOT NULL,
	"difficulty" text DEFAULT 'medium' NOT NULL,
	"question_text" text NOT NULL,
	"options" json NOT NULL,
	"correct_answer" text NOT NULL,
	"explanation" text,
	"status" "question_status" DEFAULT 'PENDING' NOT NULL,
	"times_used" integer DEFAULT 0 NOT NULL,
	"last_used_at" date,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "quiz_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"daily_quiz_id" uuid NOT NULL,
	"score" integer NOT NULL,
	"total_questions" integer DEFAULT 3 NOT NULL,
	"answers" json NOT NULL,
	"completed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "students" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"parent_id" uuid NOT NULL,
	"name" text NOT NULL,
	"grade" text NOT NULL,
	"school_name" text,
	"curriculum" text,
	"study_days" text[] DEFAULT ARRAY['Mon','Tue','Wed','Thu','Fri','Sun']::text[] NOT NULL,
	"school_day_minutes" integer DEFAULT 45 NOT NULL,
	"holiday_day_minutes" integer DEFAULT 90 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "study_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"exam_id" uuid NOT NULL,
	"generated_at" timestamp DEFAULT now() NOT NULL,
	"total_days" integer NOT NULL,
	"average_daily_minutes" integer NOT NULL,
	"weak_focus_percent" integer DEFAULT 60 NOT NULL,
	"medium_focus_percent" integer DEFAULT 25 NOT NULL,
	"strong_focus_percent" integer DEFAULT 15 NOT NULL,
	"unscheduled_topic_ids" json DEFAULT '[]'::json NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "study_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"topic_id" uuid,
	"subject_id" uuid,
	"scheduled_date" date NOT NULL,
	"duration_minutes" integer NOT NULL,
	"session_type" text NOT NULL,
	"status" text DEFAULT 'planned' NOT NULL,
	"rating" integer,
	"accuracy" integer,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "subjects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"name" text NOT NULL,
	"full_marks" integer DEFAULT 100 NOT NULL,
	"exam_weight" text DEFAULT 'medium' NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "topic_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"topic_id" uuid NOT NULL,
	"scheduled_date" date NOT NULL,
	"completed_date" date,
	"rating" integer NOT NULL,
	"accuracy" integer,
	"duration_minutes" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "topic_spaced_state" (
	"topic_id" uuid PRIMARY KEY NOT NULL,
	"interval_days" integer DEFAULT 0 NOT NULL,
	"ease_factor" numeric(4, 2) DEFAULT '2.5' NOT NULL,
	"repetition_count" integer DEFAULT 0 NOT NULL,
	"last_review_date" date,
	"next_review_date" date,
	"status" text DEFAULT 'new' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "topics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_id" uuid NOT NULL,
	"name" text NOT NULL,
	"difficulty_rating" integer DEFAULT 2 NOT NULL,
	"estimated_mastery" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"phone" text,
	"preferred_language" text DEFAULT 'en' NOT NULL,
	"is_admin" boolean DEFAULT false NOT NULL,
	"last_login_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "assessments" ADD CONSTRAINT "assessments_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "assessments" ADD CONSTRAINT "assessments_exam_id_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "daily_quiz_questions" ADD CONSTRAINT "daily_quiz_questions_daily_quiz_id_daily_quizzes_id_fk" FOREIGN KEY ("daily_quiz_id") REFERENCES "public"."daily_quizzes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "daily_quiz_questions" ADD CONSTRAINT "daily_quiz_questions_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "exams" ADD CONSTRAINT "exams_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "marks" ADD CONSTRAINT "marks_assessment_id_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessments"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "marks" ADD CONSTRAINT "marks_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_daily_quiz_id_daily_quizzes_id_fk" FOREIGN KEY ("daily_quiz_id") REFERENCES "public"."daily_quizzes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "students" ADD CONSTRAINT "students_parent_id_users_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "study_plans" ADD CONSTRAINT "study_plans_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "study_plans" ADD CONSTRAINT "study_plans_exam_id_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "study_sessions" ADD CONSTRAINT "study_sessions_plan_id_study_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."study_plans"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "study_sessions" ADD CONSTRAINT "study_sessions_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "study_sessions" ADD CONSTRAINT "study_sessions_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "subjects" ADD CONSTRAINT "subjects_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "topic_reviews" ADD CONSTRAINT "topic_reviews_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "topic_spaced_state" ADD CONSTRAINT "topic_spaced_state_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "topics" ADD CONSTRAINT "topics_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assessments_student_id_idx" ON "assessments" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assessments_date_idx" ON "assessments" USING btree ("assessment_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "daily_quiz_questions_daily_quiz_id_idx" ON "daily_quiz_questions" USING btree ("daily_quiz_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "daily_quiz_questions_quiz_order_unique" ON "daily_quiz_questions" USING btree ("daily_quiz_id","order");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "daily_quizzes_date_grade_unique" ON "daily_quizzes" USING btree ("date","grade_group");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "exams_student_id_idx" ON "exams" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "marks_assessment_id_idx" ON "marks" USING btree ("assessment_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "marks_subject_id_idx" ON "marks" USING btree ("subject_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "questions_status_idx" ON "questions" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "questions_eligibility_idx" ON "questions" USING btree ("grade_group","category","status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "quiz_attempts_student_quiz_unique" ON "quiz_attempts" USING btree ("student_id","daily_quiz_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "quiz_attempts_daily_quiz_id_idx" ON "quiz_attempts" USING btree ("daily_quiz_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "quiz_attempts_student_id_idx" ON "quiz_attempts" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "students_parent_id_idx" ON "students" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "study_plans_student_id_idx" ON "study_plans" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "study_sessions_plan_id_idx" ON "study_sessions" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "study_sessions_scheduled_date_idx" ON "study_sessions" USING btree ("scheduled_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "study_sessions_topic_id_idx" ON "study_sessions" USING btree ("topic_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subjects_student_id_idx" ON "subjects" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "topic_reviews_topic_id_idx" ON "topic_reviews" USING btree ("topic_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "topics_subject_id_idx" ON "topics" USING btree ("subject_id");