CREATE TABLE "deletion_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"email" text,
	"reason" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"admin_note" text,
	"requested_at" timestamp DEFAULT now() NOT NULL,
	"handled_at" timestamp,
	"handled_by" uuid
);
--> statement-breakpoint
ALTER TABLE "payments" DROP CONSTRAINT "payments_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "payments" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "user_sessions" ADD COLUMN "user_agent" text;--> statement-breakpoint
ALTER TABLE "deletion_requests" ADD CONSTRAINT "deletion_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deletion_requests" ADD CONSTRAINT "deletion_requests_handled_by_users_id_fk" FOREIGN KEY ("handled_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "deletion_requests_one_pending_per_user" ON "deletion_requests" USING btree ("user_id") WHERE status = 'pending';--> statement-breakpoint
CREATE INDEX "deletion_requests_status_idx" ON "deletion_requests" USING btree ("status");--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;