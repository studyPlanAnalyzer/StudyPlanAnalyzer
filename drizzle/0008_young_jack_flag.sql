CREATE TABLE IF NOT EXISTS "subject_estimated_confidence" (
	"subject_id" uuid PRIMARY KEY NOT NULL,
	"level" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "phone" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "subject_estimated_confidence" ADD CONSTRAINT "subject_estimated_confidence_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
