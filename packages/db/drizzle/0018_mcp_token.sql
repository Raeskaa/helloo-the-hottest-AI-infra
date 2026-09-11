CREATE TABLE "mcp_token" (
	"token" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"label" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "mcp_token" ADD CONSTRAINT "mcp_token_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mcp_token_owner_idx" ON "mcp_token" USING btree ("owner_id");