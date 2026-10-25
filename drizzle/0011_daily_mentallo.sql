CREATE TABLE IF NOT EXISTS "topic_test_effects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mark_id" uuid NOT NULL,
	"topic_id" uuid NOT NULL,
	"ease_delta" numeric(4, 2) NOT NULL,
	"restart" json
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "topic_test_effects" ADD CONSTRAINT "topic_test_effects_mark_id_marks_id_fk" FOREIGN KEY ("mark_id") REFERENCES "public"."marks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "topic_test_effects" ADD CONSTRAINT "topic_test_effects_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "topic_test_effects_mark_topic_unique" ON "topic_test_effects" USING btree ("mark_id","topic_id");--> statement-breakpoint
ALTER TABLE "study_sessions" DROP COLUMN IF EXISTS "accuracy";--> statement-breakpoint
ALTER TABLE "topic_reviews" DROP COLUMN IF EXISTS "accuracy";