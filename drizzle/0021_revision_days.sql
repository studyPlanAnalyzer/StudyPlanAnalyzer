CREATE TABLE "topic_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"topic_id" uuid NOT NULL,
	"exam_id" uuid NOT NULL,
	"rating" integer NOT NULL,
	"revised_on" date NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "sunday_revision" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "topics" ADD COLUMN "exam_id" uuid;--> statement-breakpoint
ALTER TABLE "topics" ADD COLUMN "exam_name" text;--> statement-breakpoint
ALTER TABLE "topics" ADD COLUMN "learn_from" date;--> statement-breakpoint
ALTER TABLE "topics" ADD COLUMN "self_rating" text;--> statement-breakpoint
ALTER TABLE "topic_revisions" ADD CONSTRAINT "topic_revisions_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_revisions" ADD CONSTRAINT "topic_revisions_exam_id_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "topic_revisions_topic_id_idx" ON "topic_revisions" USING btree ("topic_id");--> statement-breakpoint
CREATE INDEX "topic_revisions_exam_id_idx" ON "topic_revisions" USING btree ("exam_id");--> statement-breakpoint
ALTER TABLE "topics" ADD CONSTRAINT "topics_exam_id_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "topics_exam_id_idx" ON "topics" USING btree ("exam_id");--> statement-breakpoint
-- Existing topics belong to the exam their child is preparing for now: the
-- primary exam, or else the latest one. They follow SM-2 as before.
UPDATE "topics" AS t SET "exam_id" = e.id, "exam_name" = e.name
FROM "subjects" s
CROSS JOIN LATERAL (
  SELECT x.id, x.name FROM "exams" x
  WHERE x.student_id = s.student_id
  ORDER BY x.is_primary DESC, x.exam_date DESC
  LIMIT 1
) e
WHERE s.id = t.subject_id;
