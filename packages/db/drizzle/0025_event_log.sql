CREATE TABLE "event_log" (
	"seq" bigserial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"level" text DEFAULT 'info' NOT NULL,
	"owner_id" text,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "event_log_created_idx" ON "event_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "event_log_owner_idx" ON "event_log" USING btree ("owner_id");