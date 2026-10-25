CREATE TABLE IF NOT EXISTS "mark_topics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mark_id" uuid NOT NULL,
	"topic_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "study_plans" ADD COLUMN "use_buffer_week" boolean DEFAULT false NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mark_topics" ADD CONSTRAINT "mark_topics_mark_id_marks_id_fk" FOREIGN KEY ("mark_id") REFERENCES "public"."marks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mark_topics" ADD CONSTRAINT "mark_topics_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "mark_topics_mark_topic_unique" ON "mark_topics" USING btree ("mark_id","topic_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mark_topics_mark_id_idx" ON "mark_topics" USING btree ("mark_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mark_topics_topic_id_idx" ON "mark_topics" USING btree ("topic_id");