CREATE TABLE "student_milestones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"key" text NOT NULL,
	"week_start" date NOT NULL,
	"awarded_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "weekly_report_checks" (
	"student_id" uuid NOT NULL,
	"week_start" date NOT NULL,
	"checked_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "weekly_report_checks_student_id_week_start_pk" PRIMARY KEY("student_id","week_start")
);
--> statement-breakpoint
CREATE TABLE "weekly_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"week_start" date NOT NULL,
	"snapshot" json NOT NULL,
	"generated_at" timestamp DEFAULT now() NOT NULL,
	"read_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "email_sends" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "otp_codes" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "email_sends" CASCADE;--> statement-breakpoint
DROP TABLE "otp_codes" CASCADE;--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_email_unique";--> statement-breakpoint
DROP INDEX "users_email_lower_idx";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "google_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "student_milestones" ADD CONSTRAINT "student_milestones_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_report_checks" ADD CONSTRAINT "weekly_report_checks_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_reports" ADD CONSTRAINT "weekly_reports_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "student_milestones_student_key_unique" ON "student_milestones" USING btree ("student_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "weekly_reports_student_week_unique" ON "weekly_reports" USING btree ("student_id","week_start");--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "password_hash";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "email_verified";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "password_changed_at";--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_google_id_unique" UNIQUE("google_id");--> statement-breakpoint
DROP TYPE "public"."otp_purpose";