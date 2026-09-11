CREATE TABLE "workflow" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"hello_id" text NOT NULL,
	"name" text NOT NULL,
	"trigger_type" text DEFAULT 'email' NOT NULL,
	"match_from" text,
	"match_subject" text,
	"instruction" text NOT NULL,
	"channel" text DEFAULT 'telegram' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"last_seen_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workflow" ADD CONSTRAINT "workflow_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow" ADD CONSTRAINT "workflow_hello_id_hello_id_fk" FOREIGN KEY ("hello_id") REFERENCES "public"."hello"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workflow_active_idx" ON "workflow" USING btree ("trigger_type") WHERE "workflow"."status" = 'active';--> statement-breakpoint
CREATE INDEX "workflow_owner_idx" ON "workflow" USING btree ("owner_id");