CREATE TABLE "connection" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"toolkit" text NOT NULL,
	"connected_account_id" text NOT NULL,
	"label" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "connection" ADD CONSTRAINT "connection_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "connection_owner_account_uidx" ON "connection" USING btree ("owner_id","connected_account_id");--> statement-breakpoint
CREATE INDEX "connection_owner_toolkit_idx" ON "connection" USING btree ("owner_id","toolkit");