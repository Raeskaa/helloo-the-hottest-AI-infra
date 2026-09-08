CREATE TABLE "composio_identity" (
	"owner_id" text PRIMARY KEY NOT NULL,
	"composio_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "composio_identity" ADD CONSTRAINT "composio_identity_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;