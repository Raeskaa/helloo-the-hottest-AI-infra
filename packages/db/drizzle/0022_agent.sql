CREATE TABLE "agent" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"hello_id" text NOT NULL,
	"name" text NOT NULL,
	"norm" text NOT NULL,
	"description" text,
	"persona" text NOT NULL,
	"toolkits" jsonb,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent" ADD CONSTRAINT "agent_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent" ADD CONSTRAINT "agent_hello_id_hello_id_fk" FOREIGN KEY ("hello_id") REFERENCES "public"."hello"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_owner_norm_uidx" ON "agent" USING btree ("owner_id","norm");--> statement-breakpoint
CREATE INDEX "agent_owner_idx" ON "agent" USING btree ("owner_id") WHERE "agent"."status" = 'active';