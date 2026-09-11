CREATE TABLE "reminder" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"hello_id" text NOT NULL,
	"channel" text DEFAULT 'telegram' NOT NULL,
	"mode" text DEFAULT 'say' NOT NULL,
	"body" text NOT NULL,
	"repeat" text DEFAULT 'none' NOT NULL,
	"next_run_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"last_run_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reminder" ADD CONSTRAINT "reminder_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder" ADD CONSTRAINT "reminder_hello_id_hello_id_fk" FOREIGN KEY ("hello_id") REFERENCES "public"."hello"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reminder_due_idx" ON "reminder" USING btree ("next_run_at") WHERE "reminder"."status" = 'active';--> statement-breakpoint
CREATE INDEX "reminder_owner_idx" ON "reminder" USING btree ("owner_id");