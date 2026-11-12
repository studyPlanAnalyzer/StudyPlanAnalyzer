ALTER TABLE "topic_spaced_state" ADD COLUMN "easy_streak" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "topic_spaced_state" ADD COLUMN "last_seen_date" date;--> statement-breakpoint
-- Existing topics: their last review is the last time they were seen.
UPDATE "topic_spaced_state" SET "last_seen_date" = "last_review_date" WHERE "last_review_date" IS NOT NULL;
