ALTER TABLE "study_sessions" ADD COLUMN "position" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- Optional (filler) sessions are no longer made. Planned ones left in older
-- plans are removed; finished ones stay as history.
DELETE FROM "study_sessions" WHERE "is_filler" = true AND "status" = 'planned';
